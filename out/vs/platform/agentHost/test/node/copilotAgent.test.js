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
import assert from "assert";
import * as fs from "fs/promises";
import * as os from "os";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { CancellationError, isCancellationError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Schemas } from "../../../../base/common/network.js";
import { waitForState } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, LogLevel, NullLogService } from "../../../log/common/log.js";
import { IAgentHostProxyResolver } from "../../node/agentHostProxyResolver.js";
import { ITelemetryService } from "../../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
import { AgentHostTelemetryService } from "../../node/agentHostTelemetryService.js";
import { CopilotCliConfigKey } from "../../common/copilotCliConfig.js";
import { AgentHostCopilotMultiRootEnabledConfigKey, AgentHostPreferLongContextEnabledConfigKey, AgentHostSystemProxyEnabledConfigKey } from "../../common/agentHostSchema.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE } from "../../common/agentService.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { buildDefaultChatUri, buildChatUri, buildSubagentChatUri, parseRequiredSessionUriFromChatUri, CustomizationLoadStatus, MessageKind, ResponsePartKind, ROOT_STATE_URI, ToolResultContentType, TurnState, customizationId } from "../../common/state/sessionState.js";
import { CustomizationType, SessionStatus, ToolCallContributorKind } from "../../common/state/protocol/state.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostStateManager, IAgentHostStateManager } from "../../node/agentHostStateManager.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { IAgentHostTerminalManager } from "../../node/agentHostTerminalManager.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
import { AgentHostCompletions, IAgentHostCompletions } from "../../node/agentHostCompletions.js";
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE, CopilotAgent, CopilotSessionEntry, rebaseUnder, REFRESH_DEBOUNCE_MS } from "../../node/copilot/copilotAgent.js";
import { COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS } from "../../node/copilot/prompts/systemMessage.js";
import { NULL_CHECKPOINT_SERVICE } from "../../common/agentHostCheckpointService.js";
import { IAgentHostReviewService, NULL_REVIEW_SERVICE } from "../../common/agentHostReviewService.js";
import { IAgentHostGitHubEndpointService } from "../../node/agentHostGitHubEndpointService.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
import { AgentBranchNameGenerator, getAgentBranchNameHintFromMessage, normalizeAgentBranchName } from "../../node/shared/agentBranchNameGenerator.js";
import { ShellManager } from "../../node/copilot/copilotShellTools.js";
import { registerPendingEditContentProvider } from "../../node/copilot/pendingEditContentStore.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { createNullSessionDataService } from "../common/sessionTestHelpers.js";
import { ActiveClientToolSet } from "../../node/activeClientState.js";
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from "../../node/byokLmBridgeRegistry.js";
import { ICopilotApiService } from "../../node/shared/copilotApiService.js";
import { injectSideChatContext } from "../../node/agentPeerChats.js";
function sessionsMap(agent) {
  return agent._sessions;
}
function defaultChatUri(session) {
  return URI.parse(buildDefaultChatUri(session));
}
function setDefaultSessionStub(agent, sessionId, stub) {
  const sessions = sessionsMap(agent);
  const defaultChatKey = buildDefaultChatUri(AgentSession.uri("copilotcli", sessionId).toString());
  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = new CopilotSessionEntry();
    sessions.set(sessionId, entry);
  }
  entry.setDefaultChat(defaultChatKey, new CopilotSessionEntry(stub));
}
function setPeerChatStub(agent, chatUri, stub) {
  const sessionId = AgentSession.id(URI.parse(parseRequiredSessionUriFromChatUri(chatUri)));
  const sessions = sessionsMap(agent);
  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = new CopilotSessionEntry();
    sessions.set(sessionId, entry);
  }
  entry.registerPeerChat(chatUri.toString(), new CopilotSessionEntry(stub));
}
function getPeerChatStub(agent, chatUri) {
  const sessionId = AgentSession.id(URI.parse(parseRequiredSessionUriFromChatUri(chatUri)));
  return sessionsMap(agent).get(sessionId)?.getPeerChat(chatUri.toString());
}
function hasPeerChatStub(agent, chatUri) {
  const sessionId = AgentSession.id(URI.parse(parseRequiredSessionUriFromChatUri(chatUri)));
  return sessionsMap(agent).get(sessionId)?.hasPeerChat(chatUri.toString()) ?? false;
}
function peerChatCount(agent) {
  let count = 0;
  for (const entry of sessionsMap(agent).values()) {
    count += entry.peerChatKeys().length;
  }
  return count;
}
class TestAgentPluginManager {
  constructor() {
    this.basePath = URI.from({ scheme: "inmemory", path: "/agentPlugins" });
  }
  async syncCustomizations(_clientId, _customizations, _progress) {
    return [];
  }
}
class TestAgentHostGitService {
  constructor() {
    this.repositoryRoot = void 0;
    this.headCommit = "0".repeat(40);
    this.addedWorktrees = [];
    this.addedExistingWorktrees = [];
    this.removedWorktrees = [];
    this.existingBranches = /* @__PURE__ */ new Set();
    this.dirtyWorkingDirectories = /* @__PURE__ */ new Set();
  }
  async getCurrentBranch() {
    return void 0;
  }
  async getDefaultBranch() {
    return void 0;
  }
  async getBranch() {
    return void 0;
  }
  async getRefs() {
    return [];
  }
  async getBranches() {
    return [];
  }
  async getRepositoryRoot() {
    return this.repositoryRoot;
  }
  async getWorktreeRoots() {
    return [];
  }
  async addWorktree(repositoryRoot, worktree, branchName, startPoint) {
    this.addedWorktrees.push({ repositoryRoot, worktree, branchName, startPoint });
    this.existingBranches.add(branchName);
  }
  async copyWorktreeIncludeFiles() {
  }
  async addExistingWorktree(repositoryRoot, worktree, branchName) {
    this.addedExistingWorktrees.push({ repositoryRoot, worktree, branchName });
  }
  async removeWorktree(repositoryRoot, worktree) {
    this.removedWorktrees.push({ repositoryRoot, worktree });
  }
  async branchExists(_repositoryRoot, branchName) {
    return this.existingBranches.has(branchName);
  }
  async hasUncommittedChanges(workingDirectory) {
    return this.dirtyWorkingDirectories.has(workingDirectory.fsPath);
  }
  async commitAll() {
  }
  async restore() {
  }
  async hasUpstream() {
    return false;
  }
  async pull() {
  }
  async push() {
  }
  async getSessionGitState() {
    return void 0;
  }
  async computeSessionFileDiffs() {
    return void 0;
  }
  async showBlob() {
    return void 0;
  }
  async captureWorkingTreeAsTree() {
    return void 0;
  }
  async commitTree() {
    return void 0;
  }
  async updateRef() {
  }
  async deleteRefs() {
  }
  async revParse(_repositoryRoot, expression) {
    return expression === "HEAD" ? this.headCommit : void 0;
  }
  async resolveBranchBaselineCommit() {
    return void 0;
  }
  async overlayPathIntoTree() {
    return void 0;
  }
  async diffTreePaths() {
    return void 0;
  }
  async computeFileDiffsBetweenRefs() {
    return void 0;
  }
  async getFetchRemoteUrls() {
    return void 0;
  }
  async getUntrackedPaths() {
    return [];
  }
  async getBranchDiffSafetyInfo() {
    return void 0;
  }
  async getDiffPatchBetweenRefs() {
    return void 0;
  }
}
class TestAgentHostTerminalManager {
  async createTerminal() {
  }
  writeInput() {
  }
  async sendText() {
  }
  onData() {
    return Disposable.None;
  }
  onExit() {
    return Disposable.None;
  }
  onClaimChanged() {
    return Disposable.None;
  }
  onCommandFinished() {
    return Disposable.None;
  }
  createAltBufferPromise(_uri, _store) {
    return new Promise(() => {
    });
  }
  getContent() {
    return void 0;
  }
  getClaim() {
    return void 0;
  }
  hasTerminal() {
    return false;
  }
  getExitCode() {
    return void 0;
  }
  supportsCommandDetection() {
    return false;
  }
  disposeTerminal() {
  }
  getTerminalInfos() {
    return [];
  }
  getTerminalState() {
    return void 0;
  }
  async getDefaultShell() {
    return "/bin/bash";
  }
  createOutputTerminal() {
  }
  appendOutputTerminalData() {
  }
  resetOutputTerminal() {
  }
  finalizeOutputTerminal() {
  }
}
class TestCopilotApiService {
  constructor() {
    this.utilityCalls = [];
    this.response = "generated-branch-name";
    this.restrictedTelemetryContexts = /* @__PURE__ */ new Map();
    this.restrictedTelemetryContextCalls = [];
  }
  messages() {
    throw new Error("not used");
  }
  async countTokens() {
    throw new Error("not used");
  }
  async models() {
    return [];
  }
  async responses() {
    throw new Error("not used");
  }
  async resolveRestrictedTelemetryContext(githubToken) {
    this.restrictedTelemetryContextCalls.push(githubToken);
    return this.restrictedTelemetryContexts.get(githubToken) ?? {
      restrictedTelemetryEnabled: false,
      trackingId: void 0,
      telemetryEndpoint: void 0,
      isInternal: false,
      userName: void 0,
      isVscodeTeamMember: false
    };
  }
  async resolveApiEndpoint() {
    return this.apiEndpoint;
  }
  async resolveUserLogin() {
    return this.userLogin;
  }
  async utilityChatCompletion(githubToken, request, options) {
    this.utilityCalls.push({ token: githubToken, request, options });
    if (this.error) {
      throw this.error;
    }
    return this.response;
  }
}
class TestSessionDataService extends Disposable {
  constructor() {
    super(...arguments);
    this._databases = /* @__PURE__ */ new Map();
    this.openedSessions = [];
    this.onWillDeleteSessionData = Event.None;
  }
  getSessionDataDir(session) {
    return URI.from({ scheme: "test", path: `/session-data/${AgentSession.id(session)}` });
  }
  getSessionDataDirById(sessionId) {
    return URI.from({ scheme: "test", path: `/session-data/${sessionId}` });
  }
  openDatabase(session) {
    const sessionId = AgentSession.id(session);
    this.openedSessions.push(sessionId);
    let db = this._databases.get(sessionId);
    if (!db) {
      db = this._register(new SessionDatabase(":memory:"));
      this._databases.set(sessionId, db);
    }
    return { object: db, dispose: () => {
    } };
  }
  async tryOpenDatabase(session) {
    const db = this._databases.get(AgentSession.id(session));
    return db ? { object: db, dispose: () => {
    } } : void 0;
  }
  deleteSessionData() {
    return Promise.resolve();
  }
  cleanupOrphanedData() {
    return Promise.resolve();
  }
  whenIdle() {
    return Promise.resolve();
  }
}
function toSdkModelInfo(model) {
  return {
    id: model.id,
    name: model.name,
    capabilities: {
      supports: {
        vision: model.capabilities?.supports?.vision ?? false,
        reasoningEffort: !!model.supportedReasoningEfforts?.length
      },
      limits: {
        max_context_window_tokens: model.capabilities?.limits?.max_context_window_tokens ?? 0,
        max_output_tokens: model.capabilities?.limits?.max_output_tokens,
        max_prompt_tokens: model.capabilities?.limits?.max_prompt_tokens
      }
    },
    ...model.policy ? { policy: { state: model.policy.state ?? "enabled", terms: "" } } : {},
    ...model.billing ? { billing: model.billing } : {},
    ...model.modelPickerCategory ? { modelPickerCategory: model.modelPickerCategory } : {},
    ...model.modelPickerPriceCategory ? { modelPickerPriceCategory: model.modelPickerPriceCategory } : {},
    ...model.supportedReasoningEfforts ? { supportedReasoningEfforts: model.supportedReasoningEfforts } : {},
    ...model.defaultReasoningEffort ? { defaultReasoningEffort: model.defaultReasoningEffort } : {}
  };
}
class TestCopilotClient {
  constructor(_sessions, _models = []) {
    this._sessions = _sessions;
    this._models = _models;
    this.rpc = {
      sessions: { fork: async () => ({ sessionId: "forked-session" }) },
      models: {
        list: async (params) => {
          this.modelListRequests.push(params);
          const gate = this.modelListGates.shift() ?? this.modelListGate;
          const models = this.modelListResponses.shift() ?? this._models;
          const error = this.modelListErrors.shift();
          await gate;
          if (error) {
            throw error;
          }
          return { models: models.map(toSdkModelInfo) };
        }
      }
    };
    this.startCallCount = 0;
    this.stopCallCount = 0;
    this.listSessionCallCount = 0;
    this.modelListRequests = [];
    this.modelListErrors = [];
    /** Per-request gates and results, captured when each request starts. */
    this.modelListGates = [];
    this.modelListResponses = [];
    this.getSessionMetadataCalls = [];
    this.deletedSessionIds = [];
    this.createSession = async () => {
      throw new Error("not implemented");
    };
    this.resumeSession = async () => {
      throw new Error("not implemented");
    };
  }
  async start() {
    this.startCallCount++;
    await this.startGate;
  }
  async stop() {
    this.stopCallCount++;
    return [];
  }
  async listSessions() {
    this.listSessionCallCount++;
    return this._sessions;
  }
  async getSessionMetadata(sessionId) {
    this.getSessionMetadataCalls.push(sessionId);
    return this._sessions.find((s) => s.sessionId === sessionId);
  }
  async deleteSession(sessionId) {
    this.deletedSessionIds.push(sessionId);
  }
}
class MockCopilotSession {
  constructor() {
    this.sessionId = "test-session-1";
    this.rpc = {
      options: {
        update: async () => ({ success: true })
      },
      permissions: {
        setAllowAll: async ({ mode }) => ({ success: true, mode })
      }
    };
    this._handlers = /* @__PURE__ */ new Set();
    this._typedHandlers = /* @__PURE__ */ new Map();
  }
  on(eventTypeOrHandler, handler) {
    if (typeof eventTypeOrHandler === "function") {
      this._handlers.add(eventTypeOrHandler);
      return () => this._handlers.delete(eventTypeOrHandler);
    }
    if (!handler) {
      throw new Error(`Missing handler for ${eventTypeOrHandler}`);
    }
    let handlers = this._typedHandlers.get(eventTypeOrHandler);
    if (!handlers) {
      handlers = /* @__PURE__ */ new Set();
      this._typedHandlers.set(eventTypeOrHandler, handlers);
    }
    const typedHandler = handler;
    handlers.add(typedHandler);
    return () => handlers.delete(typedHandler);
  }
  emit(event) {
    const sessionEvent = event;
    for (const handler of this._handlers) {
      handler(sessionEvent);
    }
    const typedEvent = event;
    for (const handler of this._typedHandlers.get(event.type) ?? []) {
      handler(typedEvent);
    }
  }
  async send() {
    return "";
  }
  async abort() {
  }
  async setModel() {
  }
  async getEvents() {
    return [];
  }
  async disconnect() {
  }
}
class TestSdkError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
class MockAgentHostOTelService {
  async getSdkTelemetryConfig() {
    return void 0;
  }
  getSpansDbPath() {
    return void 0;
  }
  emitSessionTitleChanged() {
  }
  async flush() {
  }
}
class TestProxyResolver {
  constructor() {
    this.resolveProxyCalls = 0;
    this.fetch = (input, init) => globalThis.fetch(input, init);
  }
  register(_clientId, _connection) {
    return Disposable.None;
  }
  async resolveProxy(_url) {
    this.resolveProxyCalls++;
    return this.resolvedProxy;
  }
}
let ResumePathCopilotAgent = class extends CopilotAgent {
  constructor(_copilotClient, logService, instantiationService, sessionDataService, gitService, configurationService, stateManager, completions, environmentService, byokBridgeRegistry, telemetryService, proxyResolver, copilotApiService) {
    super(logService, instantiationService, sessionDataService, gitService, configurationService, stateManager, createTestGitHubEndpointService(), new MockAgentHostOTelService(), completions, NULL_CHECKPOINT_SERVICE, NULL_REVIEW_SERVICE, environmentService, byokBridgeRegistry, telemetryService, copilotApiService, proxyResolver);
    this._copilotClient = _copilotClient;
    this._enablePlanModeOnClient(this._copilotClient);
  }
  _createCopilotClient() {
    return this._copilotClient;
  }
};
ResumePathCopilotAgent = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ISessionDataService),
  __decorateParam(4, IAgentHostGitService),
  __decorateParam(5, IAgentConfigurationService),
  __decorateParam(6, IAgentHostStateManager),
  __decorateParam(7, IAgentHostCompletions),
  __decorateParam(8, INativeEnvironmentService),
  __decorateParam(9, IByokLmBridgeRegistry),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IAgentHostProxyResolver),
  __decorateParam(12, ICopilotApiService)
], ResumePathCopilotAgent);
let TestableCopilotAgent = class extends CopilotAgent {
  constructor(_copilotClient, logService, instantiationService, sessionDataService, gitService, configurationService, stateManager, completions, environmentService, byokBridgeRegistry, telemetryService, proxyResolver, copilotApiService) {
    super(logService, instantiationService, sessionDataService, gitService, configurationService, stateManager, createTestGitHubEndpointService(), new MockAgentHostOTelService(), completions, NULL_CHECKPOINT_SERVICE, NULL_REVIEW_SERVICE, environmentService, byokBridgeRegistry, telemetryService, copilotApiService, proxyResolver);
    this._copilotClient = _copilotClient;
    this._fakeSessions = /* @__PURE__ */ new Map();
    this.resumeCalls = [];
    this.createdClientOptions = [];
    // Keep model-refresh retries effectively instant in tests.
    this._modelRefreshBaseDelayMs = 1;
    this._modelRefreshMaxDelayMs = 2;
    this._enablePlanModeOnClient(this._copilotClient);
  }
  _createCopilotClient(options) {
    this.createdClientOptions.push(options);
    return this._copilotClient;
  }
  registerFakeSession(sessionId, fake) {
    this._fakeSessions.set(sessionId, fake);
  }
  async _resumeSession(sessionId) {
    this.resumeCalls.push(sessionId);
    const fake = this._fakeSessions.get(sessionId);
    if (!fake) {
      throw new Error(`No fake session registered for '${sessionId}'`);
    }
    const sessionUri = AgentSession.uri("copilotcli", sessionId);
    const emitter = this._onDidSessionProgress;
    let turnId = "";
    const stub = {
      send: fake.send,
      getMessages: fake.getMessages,
      appliedSnapshot: void 0,
      dispose: fake.dispose,
      resetTurnState: (newTurnId) => {
        turnId = newTurnId;
      },
      emitInitialMarkdown: (content) => {
        emitter.fire({
          kind: "action",
          resource: sessionUri,
          action: {
            type: ActionType.ChatResponsePart,
            turnId,
            part: { kind: ResponsePartKind.Markdown, id: `synth-${Date.now()}`, content }
          }
        });
      }
    };
    return stub;
  }
};
TestableCopilotAgent = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ISessionDataService),
  __decorateParam(4, IAgentHostGitService),
  __decorateParam(5, IAgentConfigurationService),
  __decorateParam(6, IAgentHostStateManager),
  __decorateParam(7, IAgentHostCompletions),
  __decorateParam(8, INativeEnvironmentService),
  __decorateParam(9, IByokLmBridgeRegistry),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IAgentHostProxyResolver),
  __decorateParam(12, ICopilotApiService)
], TestableCopilotAgent);
function getCreatedClientOptions(agent) {
  assert.ok(agent instanceof TestableCopilotAgent);
  return agent.createdClientOptions;
}
function createTestAgentContext(disposables, options) {
  const services = new ServiceCollection();
  const logService = options?.logService ?? new NullLogService();
  const fileService = options?.fileService ?? disposables.add(new FileService(logService));
  const stateManager = disposables.add(new AgentHostStateManager(logService));
  const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
  services.set(ILogService, logService);
  services.set(IFileService, fileService);
  services.set(IAgentConfigurationService, configService);
  services.set(IAgentHostStateManager, stateManager);
  services.set(IAgentHostGitHubEndpointService, options?.gitHubEndpointService ?? createTestGitHubEndpointService());
  services.set(ISessionDataService, options?.sessionDataService ?? createNullSessionDataService());
  services.set(IAgentPluginManager, options?.pluginManager ?? new TestAgentPluginManager());
  services.set(IAgentHostGitService, options?.gitService ?? new TestAgentHostGitService());
  services.set(IAgentHostReviewService, NULL_REVIEW_SERVICE);
  services.set(IAgentHostTerminalManager, new TestAgentHostTerminalManager());
  services.set(IAgentHostOTelService, {
    _serviceBrand: void 0,
    getSdkTelemetryConfig: async () => void 0,
    getSpansDbPath: () => void 0,
    emitSessionTitleChanged: () => {
    },
    flush: async () => void 0
  });
  services.set(IAgentHostCompletions, disposables.add(new AgentHostCompletions(logService)));
  services.set(IAgentHostProxyResolver, options?.proxyResolver ?? new TestProxyResolver());
  services.set(IByokLmBridgeRegistry, options?.byokBridgeRegistry ?? new ByokLmBridgeRegistry());
  const copilotApiService = options?.copilotApiService ?? new TestCopilotApiService();
  services.set(ICopilotApiService, copilotApiService);
  services.set(ITelemetryService, options?.telemetryService ?? NullTelemetryService);
  if (options?.environmentServiceRegistration !== "none") {
    const environmentService = {
      _serviceBrand: void 0,
      userHome: options?.userHome ?? URI.from({ scheme: Schemas.inMemory, path: "/mock-home" }),
      tmpDir: URI.from({ scheme: Schemas.inMemory, path: "/mock-tmp" })
    };
    services.set(INativeEnvironmentService, environmentService);
  }
  const instantiationService = disposables.add(new InstantiationService(services));
  services.set(IInstantiationService, instantiationService);
  const agent = options?.copilotClient ? instantiationService.createInstance(options.useRealResumePath ? ResumePathCopilotAgent : TestableCopilotAgent, options.copilotClient) : instantiationService.createInstance(CopilotAgent);
  return { agent, instantiationService, configurationService: configService, fileService, stateManager };
}
function createTestAgent(disposables, options) {
  return createTestAgentContext(disposables, options).agent;
}
function createAgentSessionThroughAgent(agent, instantiationService, options) {
  const sessionUri = AgentSession.uri("copilotcli", "test-session-1");
  const shellManager = instantiationService.createInstance(ShellManager, sessionUri, void 0);
  let createOptions;
  const mockSession = options?.mockSession ?? new MockCopilotSession();
  const launchPlan = {
    kind: "create",
    client: {
      createSession: async (options2) => {
        createOptions = options2;
        return mockSession;
      },
      resumeSession: async () => mockSession
    },
    activeClientToolSet: options?.activeClientToolSet ?? new ActiveClientToolSet(),
    sessionId: "test-session-1",
    workingDirectory: void 0,
    resolvedAgentName: void 0,
    snapshot: options?.snapshot ?? { tools: [], plugins: [], mcpServers: {} },
    shellManager,
    githubToken: "token",
    model: void 0
  };
  const agentInternals = agent;
  const activeClient = agentInternals._getOrCreateActiveClient(sessionUri, void 0);
  return { session: agentInternals._createAgentSession(launchPlan, void 0, activeClient), createOptions: () => createOptions };
}
function withoutUndefinedProperties(metadata) {
  const result = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== void 0) {
      result[key] = value;
    }
  }
  return result;
}
function sdkSession(sessionId, cwd) {
  return {
    sessionId,
    startTime: /* @__PURE__ */ new Date(1e3),
    modifiedTime: /* @__PURE__ */ new Date(2e3),
    summary: `SDK ${sessionId}`,
    isRemote: false,
    ...cwd ? { context: { workingDirectory: cwd } } : {}
  };
}
async function disposeAgent(agent) {
  await agent.shutdown();
  agent.dispose();
  await Promise.resolve();
}
suite("CopilotAgent", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("installs the GitHub telemetry callback in CopilotClientOptions", async () => {
    const client = new TestCopilotClient([]);
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      await agent.listSessions();
      assert.strictEqual(typeof getCreatedClientOptions(agent).at(-1)?.onGitHubTelemetry, "function");
    } finally {
      await disposeAgent(agent);
    }
  });
  test("routes exact legacy targets exclusively and falls back to generic forwarding", async () => {
    const client = new TestCopilotClient([]);
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.restrictedTelemetryContexts.set("restricted-token", {
      restrictedTelemetryEnabled: true,
      trackingId: "restricted-tid",
      telemetryEndpoint: "https://telemetry.example",
      isInternal: true,
      userName: "octocat",
      isVscodeTeamMember: true
    });
    const telemetryService = disposables.add(new class extends AgentHostTelemetryService {
      constructor() {
        super(...arguments);
        this.genericEvents = [];
        this.enhancedEvents = [];
        this.internalEvents = [];
        this.restrictedEnabled = false;
      }
      publicLog(eventName) {
        this.genericEvents.push(eventName);
      }
      sendEnhancedGHTelemetryEvent(eventName) {
        this.enhancedEvents.push(eventName);
      }
      sendEnhancedGHTelemetryEventForContext(_context, eventName) {
        this.enhancedEvents.push(eventName);
      }
      sendInternalMSFTTelemetryEvent(eventName) {
        this.internalEvents.push(eventName);
      }
      sendInternalMSFTTelemetryEventForContext(_context, eventName) {
        this.internalEvents.push(eventName);
      }
      setRestrictedTelemetryEnabled(enabled) {
        this.restrictedEnabled = enabled;
        super.setRestrictedTelemetryEnabled(enabled);
      }
    }(NullTelemetryService));
    const agent = createTestAgent(disposables, { copilotClient: client, copilotApiService, telemetryService });
    try {
      await agent.authenticate("https://api.github.com", "restricted-token");
      for (let i = 0; i < 100 && !telemetryService.restrictedEnabled; i++) {
        await Promise.resolve();
      }
      await agent.listSessions();
      const forward = getCreatedClientOptions(agent).at(-1)?.onGitHubTelemetry;
      assert.ok(forward);
      const notification = (kind, restricted) => ({
        sessionId: "session-1",
        restricted,
        event: { kind, properties: {}, metrics: {} }
      });
      await forward(notification("engine.messages.length", true));
      await forward(notification("engine.messages", false));
      await forward(notification("unknown_restricted", true));
      await forward(notification("tool_call_executed", false));
      assert.deepStrictEqual({
        generic: telemetryService.genericEvents,
        enhanced: telemetryService.enhancedEvents,
        internal: telemetryService.internalEvents
      }, {
        generic: ["copilotCli/unknown_restricted", "copilotCli/tool_call_executed"],
        enhanced: ["engine.messages.length"],
        internal: ["engine.messages.length"]
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("routes exact targets using the current auth token and reflects token changes", async () => {
    const client = new TestCopilotClient([]);
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.restrictedTelemetryContexts.set("token-a", {
      restrictedTelemetryEnabled: true,
      trackingId: "token-a-tid",
      telemetryEndpoint: "https://token-a.telemetry.example/",
      isInternal: true,
      userName: "token-a-user",
      isVscodeTeamMember: true
    });
    copilotApiService.restrictedTelemetryContexts.set("token-b", {
      restrictedTelemetryEnabled: false,
      trackingId: "token-b-tid",
      telemetryEndpoint: void 0,
      isInternal: false,
      userName: "token-b-user",
      isVscodeTeamMember: false
    });
    const telemetryService = disposables.add(new class extends AgentHostTelemetryService {
      constructor() {
        super(...arguments);
        this.enhancedContexts = [];
        this.internalContexts = [];
      }
      sendEnhancedGHTelemetryEventForContext(context) {
        this.enhancedContexts.push(context);
      }
      sendInternalMSFTTelemetryEventForContext(context) {
        this.internalContexts.push(context);
      }
    }(NullTelemetryService));
    const agent = createTestAgent(disposables, { copilotClient: client, copilotApiService, telemetryService });
    try {
      await agent.authenticate("https://api.github.com", "token-a");
      await agent.listSessions();
      const forward = getCreatedClientOptions(agent).at(-1)?.onGitHubTelemetry;
      assert.ok(forward);
      const notification = {
        sessionId: "session-a",
        restricted: true,
        event: { kind: "engine.messages.length", properties: {}, metrics: {} }
      };
      await forward(notification);
      await agent.authenticate("https://api.github.com", "token-b");
      await forward(notification);
      assert.deepStrictEqual({
        enhancedContexts: telemetryService.enhancedContexts,
        internalContexts: telemetryService.internalContexts.map((context) => ({
          isInternal: context.isInternal,
          trackingId: context.trackingId,
          userName: context.userName,
          isVscodeTeamMember: context.isVscodeTeamMember
        }))
      }, {
        enhancedContexts: [{
          restrictedTelemetryEnabled: true,
          trackingId: "token-a-tid",
          telemetryEndpoint: "https://token-a.telemetry.example/telemetry",
          isInternal: true,
          userName: "token-a-user",
          isVscodeTeamMember: true
        }],
        internalContexts: [{
          isInternal: true,
          trackingId: "token-a-tid",
          userName: "token-a-user",
          isVscodeTeamMember: true
        }]
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("advertises Copilot as its display name", async () => {
    const agent = createTestAgent(disposables);
    try {
      assert.deepStrictEqual(agent.getDescriptor(), {
        provider: "copilotcli",
        displayName: "Copilot",
        description: "Copilot SDK agent running in the local agent host process",
        capabilities: { multipleChats: { fork: true, sideChat: true } }
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("advertises multipleWorkingDirectories only when the hidden setting is enabled", async () => {
    const { agent, stateManager } = createTestAgentContext(disposables);
    try {
      const setMultiRoot = (enabled) => stateManager.dispatchServerAction(ROOT_STATE_URI, {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostCopilotMultiRootEnabledConfigKey]: enabled }
      });
      const disabledByDefault = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
      setMultiRoot(true);
      const whenEnabled = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
      setMultiRoot(false);
      const afterDisabling = agent.getDescriptor().capabilities?.multipleWorkingDirectories;
      assert.deepStrictEqual({ disabledByDefault, whenEnabled, afterDisabling }, {
        disabledByDefault: void 0,
        whenEnabled: { immutablePrimary: true },
        afterDisabling: void 0
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  suite("spawned chat channel", () => {
    function fireSignal(agent, signal) {
      agent._onDidSessionProgress.fire(signal);
    }
    test("mirrors subagent_started onto onDidSpawnChat; subagent_completed leaves the chat live", async () => {
      const agent = createTestAgent(disposables);
      const spawned = [];
      disposables.add(agent.onDidSpawnChat((e) => spawned.push(e)));
      try {
        const sessionUri = AgentSession.uri("copilotcli", "spawn-session");
        const parentChat = buildDefaultChatUri(sessionUri.toString());
        const toolCallId = "tool-42";
        const expectedChat = buildSubagentChatUri(parseRequiredSessionUriFromChatUri(parentChat), toolCallId);
        fireSignal(agent, {
          kind: "subagent_started",
          chat: URI.parse(parentChat),
          toolCallId,
          agentName: "researcher",
          agentDisplayName: "Researcher",
          agentDescription: "Looks things up"
        });
        fireSignal(agent, { kind: "action", resource: sessionUri, action: { type: ActionType.SessionTitleChanged, title: "x" } });
        fireSignal(agent, { kind: "subagent_completed", chat: URI.parse(parentChat), toolCallId });
        assert.deepStrictEqual({
          spawned: spawned.map((e) => ({
            session: e.session.toString(),
            chat: e.chat.toString(),
            parent: e.parent ? { chat: e.parent.chat.toString(), toolCallId: e.parent.toolCallId } : void 0,
            title: e.title
          }))
        }, {
          spawned: [{
            session: sessionUri.toString(),
            chat: expectedChat,
            parent: { chat: parentChat, toolCallId },
            title: "Researcher"
          }]
        });
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  test("uses generated Agents-window Copilot CLI branch names", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "add-agent-host-config";
    const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());
    assert.deepStrictEqual({
      generated: await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config", githubToken: "token" }),
      fallback: await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config" }),
      token: copilotApiService.utilityCalls[0]?.token,
      promptIncludesUserText: copilotApiService.utilityCalls[0]?.request.messages.some((message) => message.content.includes("Add agent host config"))
    }, {
      generated: "agents/add-agent-host-config",
      fallback: "agents/add-agent-host-config",
      token: "token",
      promptIncludesUserText: true
    });
  });
  test("finds an available branch name when candidates collide", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "add-agent-host-config";
    const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());
    const collisions = /* @__PURE__ */ new Set([
      "agents/add-agent-host-config",
      "agents/add-agent-host-config-12345678",
      "agents/12345678-aaaa-bbbb-cccc-123456789abc"
    ]);
    const exhaustedCandidates = [];
    let exhaustionError;
    try {
      await generator.generateBranchName({
        sessionId: "12345678-aaaa-bbbb-cccc-123456789abc",
        branchNameCollides: async (name) => {
          exhaustedCandidates.push(name);
          return true;
        }
      });
    } catch (error) {
      exhaustionError = error instanceof Error ? error.message : String(error);
    }
    assert.deepStrictEqual({
      unique: await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config", githubToken: "token", branchNameCollides: async () => false }),
      collision: await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config", githubToken: "token", branchNameCollides: async (name) => name === "agents/add-agent-host-config" }),
      repeatedCollision: await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config", githubToken: "token", branchNameCollides: async (name) => collisions.has(name) }),
      fallbackCollision: await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", branchNameCollides: async (name) => collisions.has(name) }),
      exhaustion: {
        error: exhaustionError,
        candidateCount: exhaustedCandidates.length,
        firstCandidate: exhaustedCandidates[0],
        lastCandidate: exhaustedCandidates.at(-1)
      }
    }, {
      unique: "agents/add-agent-host-config",
      collision: "agents/add-agent-host-config-12345678",
      repeatedCollision: "agents/add-agent-host-config-12345678-2",
      fallbackCollision: "agents/12345678-aaaa-bbbb-cccc-123456789abc-2",
      exhaustion: {
        error: "Unable to find an available branch name after checking 100 candidates",
        candidateCount: 100,
        firstCandidate: "agents/12345678-aaaa-bbbb-cccc-123456789abc",
        lastCandidate: "agents/12345678-aaaa-bbbb-cccc-123456789abc-100"
      }
    });
  });
  test("prepends the branch prefix ahead of the built-in agents/ prefix", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "add-agent-host-config";
    const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());
    assert.deepStrictEqual({
      withPrefix: await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config", githubToken: "token", branchPrefix: "users/alice/" }),
      emptyPrefix: await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config", githubToken: "token", branchPrefix: "" }),
      fallbackWithPrefix: await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", branchPrefix: "users/alice/" })
    }, {
      withPrefix: "users/alice/agents/add-agent-host-config",
      emptyPrefix: "agents/add-agent-host-config",
      fallbackWithPrefix: "users/alice/agents/12345678-aaaa-bbbb-cccc-123456789abc"
    });
  });
  test("keeps generated branch names short", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "a".repeat(100);
    const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());
    assert.strictEqual(
      (await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config", githubToken: "token" })).length,
      "agents/".length + 48
    );
  });
  test("normalizes generated branch names", () => {
    assert.deepStrictEqual({
      simple: normalizeAgentBranchName("feature-branch"),
      uppercase: normalizeAgentBranchName("Feature-Branch"),
      special: normalizeAgentBranchName("Fix: Add new feature! (#42)"),
      unicode: normalizeAgentBranchName("caf\xE9-feature"),
      empty: normalizeAgentBranchName("\u{1F680}\u{1F389}")
    }, {
      simple: "feature-branch",
      uppercase: "feature-branch",
      special: "fixaddnewfeature42",
      unicode: "caf-feature",
      empty: ""
    });
  });
  test("derives slug branch hint from first message for fallback", () => {
    assert.deepStrictEqual({
      simple: getAgentBranchNameHintFromMessage("Add agent host config"),
      punctuation: getAgentBranchNameHintFromMessage("  Fix: the bug!! "),
      unicode: getAgentBranchNameHintFromMessage("Refactor caf\xE9 \u2615 rendering"),
      words: getAgentBranchNameHintFromMessage("one two three four five six seven eight nine ten"),
      long: getAgentBranchNameHintFromMessage("a".repeat(100))?.length,
      empty: getAgentBranchNameHintFromMessage("!!! ??? ...")
    }, {
      simple: "add-agent-host-config",
      punctuation: "fix-the-bug",
      unicode: "refactor-cafe-rendering",
      words: "one-two-three-four-five-six-seven-eight",
      long: 48,
      empty: void 0
    });
  });
  test("falls back to first-message slug when generated branch name cannot be used", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "!!! ??? ...";
    const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());
    assert.strictEqual(
      await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config", githubToken: "token" }),
      "agents/add-agent-host-config"
    );
  });
  test("falls back to first-message slug when branch name generation fails", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.error = new Error("failed");
    const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());
    assert.strictEqual(
      await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "Add agent host config", githubToken: "token" }),
      "agents/add-agent-host-config"
    );
  });
  test("falls back to session id when no branch name can be derived", async () => {
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.response = "!!! ??? ...";
    const generator = new AgentBranchNameGenerator(copilotApiService, new NullLogService());
    assert.strictEqual(
      await generator.generateBranchName({ sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", message: "!!! ??? ...", githubToken: "token" }),
      "agents/12345678-aaaa-bbbb-cccc-123456789abc"
    );
  });
  test("contributes GHE-aware GitHub and discovered CAPI diagnostics endpoints", async () => {
    const endpointService = createTestGitHubEndpointService("https://github.example.com");
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.apiEndpoint = "https://copilot.example.com";
    copilotApiService.userLogin = "octocat";
    const agent = createTestAgent(disposables, { copilotApiService, gitHubEndpointService: endpointService });
    try {
      await agent.authenticate(endpointService.getCopilotResource().resource, "token");
      assert.deepStrictEqual({
        endpoints: await agent.getNetworkDiagnosticsEndpoints(),
        account: await agent.getNetworkDiagnosticsAccount()
      }, {
        endpoints: [
          { name: "GitHub API", url: endpointService.getApiBaseUri() },
          { name: "Copilot API (CAPI)", url: "https://copilot.example.com/_ping" }
        ],
        account: "octocat"
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("returns empty models and lists sessions before authentication", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const ownedSession = AgentSession.uri("copilotcli", "owned-before-auth");
    const ownedDb = sessionDataService.openDatabase(ownedSession);
    ownedDb.dispose();
    const client = new TestCopilotClient([sdkSession("owned-before-auth")]);
    const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
    try {
      const sessions = await agent.listSessions();
      assert.deepStrictEqual({
        models: agent.models.get(),
        sessions: sessions.map((session) => AgentSession.id(session.session)),
        starts: client.startCallCount,
        listCalls: client.listSessionCallCount
      }, {
        models: [],
        sessions: ["owned-before-auth"],
        starts: 1,
        listCalls: 1
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("starts the client and creates a provisional session before authentication", async () => {
    const client = new TestCopilotClient([]);
    const agent = createTestAgent(disposables, { copilotClient: client });
    const session = AgentSession.uri("copilotcli", "unauth-create");
    const workingDirectory = URI.file("/workspace");
    try {
      const result = await agent.createSession({ session, workingDirectories: workingDirectory ? [workingDirectory] : void 0 });
      assert.ok(result.resolvedWorkingDirectory);
      assert.deepStrictEqual({
        session: result.session.toString(),
        workingDirectory: result.resolvedWorkingDirectory.toString(),
        provisional: result.provisional,
        starts: client.startCallCount,
        stops: client.stopCallCount
      }, {
        session: session.toString(),
        workingDirectory: workingDirectory.toString(),
        provisional: true,
        starts: 1,
        stops: 0
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("passes the GitHub token when refreshing models", async () => {
    const client = new TestCopilotClient([], [{
      id: "gpt-4o",
      name: "GPT-4o"
    }]);
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      await agent.authenticate("https://api.github.com", "model-token");
      await waitForState(agent.models, (models) => models.length > 0);
      assert.deepStrictEqual(client.modelListRequests, [{ gitHubToken: "model-token" }]);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("does not stop the client when the auth token changes", async () => {
    const client = new TestCopilotClient([], [{
      id: "gpt-4o",
      name: "GPT-4o"
    }]);
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      await agent.listSessions();
      await agent.authenticate("https://api.github.com", "model-token-a");
      for (let i = 0; i < 200 && client.modelListRequests.length < 1; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await agent.authenticate("https://api.github.com", "model-token-b");
      for (let i = 0; i < 200 && client.modelListRequests.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      assert.deepStrictEqual({
        starts: client.startCallCount,
        stops: client.stopCallCount,
        requests: client.modelListRequests
      }, {
        starts: 1,
        stops: 0,
        requests: [{ gitHubToken: "model-token-a" }, { gitHubToken: "model-token-b" }]
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("retries refreshing models after a transient failure", async () => {
    const client = new TestCopilotClient([], [{
      id: "gpt-4o",
      name: "GPT-4o"
    }]);
    client.modelListErrors.push(new Error('429 "too many requests"'));
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      await agent.authenticate("https://api.github.com", "token");
      const models = await waitForState(agent.models, (m) => m.length > 0);
      assert.deepStrictEqual({
        modelNames: models.map((m) => m.name),
        requestCount: client.modelListRequests.length
      }, {
        modelNames: ["GPT-4o"],
        requestCount: 2
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("stops refreshing models after the maximum number of attempts", async () => {
    const client = new TestCopilotClient([], [{
      id: "gpt-4o",
      name: "GPT-4o"
    }]);
    for (let i = 0; i < 10; i++) {
      client.modelListErrors.push(new Error('429 "too many requests"'));
    }
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      await agent.authenticate("https://api.github.com", "token");
      for (let i = 0; i < 500 && client.modelListRequests.length < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepStrictEqual({
        requestCount: client.modelListRequests.length,
        models: agent.models.get()
      }, {
        requestCount: 5,
        models: []
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("keeps the previously loaded models when a later refresh fails", async () => {
    const client = new TestCopilotClient([], [{
      id: "gpt-4o",
      name: "GPT-4o"
    }]);
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      await agent.authenticate("https://api.github.com", "token-a");
      await waitForState(agent.models, (m) => m.length > 0);
      for (let i = 0; i < 10; i++) {
        client.modelListErrors.push(new Error('429 "too many requests"'));
      }
      const requestsBefore = client.modelListRequests.length;
      await agent.authenticate("https://api.github.com", "token-b");
      for (let i = 0; i < 500 && client.modelListRequests.length < requestsBefore + 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepStrictEqual({
        modelNames: agent.models.get().map((m) => m.name),
        retriedRequests: client.modelListRequests.length - requestsBefore
      }, {
        modelNames: ["GPT-4o"],
        retriedRequests: 5
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("coalesces concurrent refreshModels calls onto one models.list request", async () => {
    const client = new TestCopilotClient([], [{
      id: "gpt-4o",
      name: "GPT-4o"
    }]);
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      const gate = new DeferredPromise();
      client.modelListGate = gate.p;
      await agent.authenticate("https://api.github.com", "token");
      const first = agent.refreshModels();
      const second = agent.refreshModels();
      gate.complete();
      await Promise.all([first, second]);
      assert.deepStrictEqual({
        requests: client.modelListRequests,
        modelNames: agent.models.get().map((m) => m.name)
      }, {
        requests: [{ gitHubToken: "token" }],
        modelNames: ["GPT-4o"]
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("does not refresh models or restart the client after shutdown", async () => {
    const client = new TestCopilotClient([], [{
      id: "gpt-4o",
      name: "GPT-4o"
    }]);
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      await agent.authenticate("https://api.github.com", "token");
      await waitForState(agent.models, (m) => m.length > 0);
      await agent.shutdown();
      const startsAfterShutdown = client.startCallCount;
      const requestsAfterShutdown = client.modelListRequests.length;
      await agent._refreshModels(1);
      assert.deepStrictEqual({
        starts: client.startCallCount,
        requests: client.modelListRequests.length
      }, {
        starts: startsAfterShutdown,
        requests: requestsAfterShutdown
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("does not publish an in-flight model refresh after shutdown", async () => {
    const client = new TestCopilotClient([], [{
      id: "initial",
      name: "Initial"
    }]);
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      await agent.authenticate("https://api.github.com", "token");
      await waitForState(agent.models, (models) => models.some((model) => model.id === "initial"));
      await Promise.resolve();
      const gate = new DeferredPromise();
      client.modelListGates.push(gate.p);
      client.modelListResponses.push([{ id: "late", name: "Late" }]);
      const requestsBefore = client.modelListRequests.length;
      const refresh = agent.refreshModels();
      for (let i = 0; i < 500 && client.modelListRequests.length <= requestsBefore; i++) {
        await timeout(1);
      }
      assert.strictEqual(client.modelListRequests.length, requestsBefore + 1, "expected the gated model request to start");
      await agent.shutdown();
      gate.complete();
      await refresh;
      assert.deepStrictEqual(agent.models.get().map((model) => model.id), ["initial"]);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("stops a client that finishes starting after shutdown begins", async () => {
    const client = new TestCopilotClient([]);
    const startGate = new DeferredPromise();
    client.startGate = startGate.p;
    const agent = createTestAgent(disposables, { copilotClient: client });
    try {
      const listPromise = agent.listSessions();
      await Promise.resolve();
      const shutdownPromise = agent.shutdown();
      startGate.complete();
      await assert.rejects(listPromise, CancellationError);
      await shutdownPromise;
      assert.deepStrictEqual({
        starts: client.startCallCount,
        stops: client.stopCallCount
      }, {
        starts: 1,
        stops: 1
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("createSession infers workspace-less from an omitted workingDirectory and uses a stable scratch dir", async () => {
    const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/qc-home-`));
    const agent = createTestAgent(disposables, { userHome });
    try {
      await agent.authenticate("https://api.github.com", "token");
      const result = await agent.createSession({
        session: AgentSession.uri("copilotcli", "temp-fallback")
      });
      assert.strictEqual(result.provisional, true);
      const resultWorkingDirectory = result.resolvedWorkingDirectory;
      assert.ok(resultWorkingDirectory);
      const expected = URI.joinPath(userHome, ".copilot", "chats", "temp-fallback");
      assert.strictEqual(resultWorkingDirectory.scheme, Schemas.file);
      assert.strictEqual(resultWorkingDirectory.fsPath, expected.fsPath);
      assert.deepStrictEqual(await fs.readdir(resultWorkingDirectory.fsPath), []);
      const provisional = agent._provisionalSessions.get("temp-fallback");
      assert.strictEqual(provisional?.workspaceless, true);
    } finally {
      await fs.rm(userHome.fsPath, { recursive: true, force: true });
      await disposeAgent(agent);
    }
  }).timeout(3e4);
  suite("quick chat scratch directory", () => {
    test("resume recreates a reaped quick chat scratch dir (ensure-exists on restore)", async () => {
      const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/qc-home-`));
      const sessionId = "qc-resume";
      const session = AgentSession.uri("copilotcli", sessionId);
      const scratchDir = URI.joinPath(userHome, ".copilot", "chats", sessionId);
      const sessionDataService = disposables.add(new TestSessionDataService());
      const db = sessionDataService.openDatabase(session);
      await db.object.setMetadata("copilot.workingDirectory", scratchDir.toString());
      await db.object.setMetadata("agentHost.workspaceless", "true");
      db.dispose();
      const client = new TestCopilotClient([sdkSession(sessionId, scratchDir.fsPath)]);
      const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService, userHome });
      const internals = agent;
      try {
        await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "token");
        await assert.rejects(() => fs.access(scratchDir.fsPath));
        await internals._resumeSession(sessionId).catch(() => void 0);
        await fs.access(scratchDir.fsPath);
      } finally {
        await fs.rm(userHome.fsPath, { recursive: true, force: true });
        await disposeAgent(agent);
      }
    }).timeout(3e4);
    test("disposeSession cleans up the quick chat scratch dir", async () => {
      const userHome = URI.file(await fs.mkdtemp(`${os.tmpdir()}/qc-home-`));
      const agent = createTestAgent(disposables, { userHome });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "qc-dispose");
        const result = await agent.createSession({ session });
        const scratchDir = URI.joinPath(userHome, ".copilot", "chats", "qc-dispose");
        await fs.access(scratchDir.fsPath);
        await agent.disposeSession(result.session);
        await assert.rejects(() => fs.access(scratchDir.fsPath));
      } finally {
        await fs.rm(userHome.fsPath, { recursive: true, force: true });
        await disposeAgent(agent);
      }
    }).timeout(3e4);
  });
  suite("working-directory persistence", () => {
    const repoA = URI.file("/repoA");
    const repoB = URI.file("/repoB");
    const repoC = URI.file("/repoC");
    async function restore(seed, cwd) {
      const sessionId = "wd-persist";
      const session = AgentSession.uri("copilotcli", sessionId);
      const sessionDataService = disposables.add(new TestSessionDataService());
      const db = sessionDataService.openDatabase(session);
      await db.object.setMetadata("copilot.project.resolved", "true");
      await seed(db);
      db.dispose();
      const client = new TestCopilotClient([sdkSession(sessionId, cwd)]);
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "token");
        const listed = (await agent.listSessions()).find((s) => AgentSession.id(s.session) === sessionId);
        const meta = await agent.getSessionMetadata(session);
        return {
          list: listed?.workingDirectories?.map((d) => d.toString()),
          meta: meta?.workingDirectories?.map((d) => d.toString())
        };
      } finally {
        await disposeAgent(agent);
      }
    }
    test("restores the persisted ordered set from copilot.workingDirectories", async () => {
      const result = await restore(async (db) => {
        await db.object.setMetadata("copilot.workingDirectories", JSON.stringify([repoA, repoB, repoC].map((d) => d.toString())));
        await db.object.setMetadata("copilot.workingDirectory", repoA.toString());
      });
      assert.deepStrictEqual(result, {
        list: [repoA.toString(), repoB.toString(), repoC.toString()],
        meta: [repoA.toString(), repoB.toString(), repoC.toString()]
      });
    });
    test("falls back to the legacy single working directory when the set is absent", async () => {
      const result = await restore(async (db) => {
        await db.object.setMetadata("copilot.workingDirectory", repoA.toString());
      });
      assert.deepStrictEqual(result, {
        list: [repoA.toString()],
        meta: [repoA.toString()]
      });
    });
    test("falls back to the legacy single working directory when the set is malformed", async () => {
      const result = await restore(async (db) => {
        await db.object.setMetadata("copilot.workingDirectories", "not-json");
        await db.object.setMetadata("copilot.workingDirectory", repoA.toString());
      });
      assert.deepStrictEqual(result, {
        list: [repoA.toString()],
        meta: [repoA.toString()]
      });
    });
  });
  suite("restart on startup config change", () => {
    class StopCountingClient extends TestCopilotClient {
      constructor() {
        super(...arguments);
        this.stopCount = 0;
      }
      async stop() {
        this.stopCount++;
        await this.stopGate;
        if (this.stopError) {
          throw this.stopError;
        }
        return super.stop();
      }
    }
    class MutableLogService extends NullLogService {
      constructor() {
        super(...arguments);
        this._level = LogLevel.Info;
      }
      setLevel(level) {
        this._level = level;
      }
      getLevel() {
        return this._level;
      }
    }
    test("resolves the system proxy by default and bypasses it when disabled", async () => {
      const proxyResolver = new TestProxyResolver();
      proxyResolver.resolvedProxy = "http://system-proxy.example:8080";
      const { agent, configurationService } = createTestAgentContext(disposables, { proxyResolver });
      const resolveProxyForSdk = (env) => agent._resolveProxyForSdk(env);
      try {
        assert.strictEqual(await resolveProxyForSdk({}), proxyResolver.resolvedProxy);
        configurationService.updateRootConfig({ [AgentHostSystemProxyEnabledConfigKey]: false });
        assert.deepStrictEqual({
          proxy: await resolveProxyForSdk({}),
          resolveProxyCalls: proxyResolver.resolveProxyCalls
        }, {
          proxy: void 0,
          resolveProxyCalls: 1
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("passes the configured log level to the Copilot SDK client", async () => {
      const client = new TestCopilotClient([]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        configurationService.updateRootConfig({ [CopilotCliConfigKey.CopilotSdkLogLevel]: "trace" });
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        assert.deepStrictEqual(getCreatedClientOptions(agent).map((options) => options.logLevel), ["all"]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("uses info when neither the setting nor agent host enables trace", async () => {
      const client = new TestCopilotClient([]);
      const { agent } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        assert.deepStrictEqual(getCreatedClientOptions(agent).map((options) => options.logLevel), ["info"]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("uses trace when the agent host log level is trace", async () => {
      const client = new TestCopilotClient([]);
      const logService = new MutableLogService();
      logService.setLevel(LogLevel.Trace);
      const { agent } = createTestAgentContext(disposables, { copilotClient: client, logService });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        assert.deepStrictEqual(getCreatedClientOptions(agent).map((options) => options.logLevel), ["all"]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("restarts the client when the Copilot SDK log level changes", async () => {
      const client = new StopCountingClient([]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        configurationService.updateRootConfig({ [CopilotCliConfigKey.CopilotSdkLogLevel]: "trace" });
        await Promise.resolve();
        await agent.listSessions();
        assert.deepStrictEqual({
          stopCount: client.stopCount,
          logLevel: getCreatedClientOptions(agent).at(-1)?.logLevel
        }, {
          stopCount: 1,
          logLevel: "all"
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("re-enumerates models after a startup-config restart", async () => {
      const client = new StopCountingClient([], [{ id: "gpt-4o", name: "GPT-4o" }]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        await waitForState(agent.models, (m) => m.length > 0);
        const requestsBefore = client.modelListRequests.length;
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        for (let i = 0; i < 500 && client.modelListRequests.length <= requestsBefore; i++) {
          await timeout(1);
        }
        assert.deepStrictEqual({
          stopCount: client.stopCount,
          refreshesAfterRestart: client.modelListRequests.length - requestsBefore
        }, {
          stopCount: 1,
          refreshesAfterRestart: 1
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("coalesces concurrent token and startup-config refresh triggers", async () => {
      const client = new StopCountingClient([], [{ id: "gpt-4o", name: "GPT-4o" }]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      const stopGate = new DeferredPromise();
      try {
        await agent.authenticate("https://api.github.com", "token-a");
        await agent.listSessions();
        await waitForState(agent.models, (models) => models.length > 0);
        await Promise.resolve();
        const requestsBefore = client.modelListRequests.length;
        client.stopGate = stopGate.p;
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        await agent.authenticate("https://api.github.com", "token-b");
        await timeout(10);
        assert.strictEqual(client.modelListRequests.length, requestsBefore, "model refresh must wait for the old client to stop");
        stopGate.complete();
        for (let i = 0; i < 500 && client.modelListRequests.length <= requestsBefore; i++) {
          await timeout(1);
        }
        await Promise.resolve();
        assert.deepStrictEqual({
          stopCount: client.stopCount,
          refreshes: client.modelListRequests.length - requestsBefore,
          lastToken: client.modelListRequests.at(-1)?.gitHubToken
        }, {
          stopCount: 1,
          refreshes: 1,
          lastToken: "token-b"
        });
      } finally {
        stopGate.complete();
        await disposeAgent(agent);
      }
    });
    test("does not start a replacement client while the previous client is stopping", async () => {
      const client = new StopCountingClient([]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      const stopGate = new DeferredPromise();
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        client.stopGate = stopGate.p;
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        const listPromise = agent.listSessions();
        await timeout(10);
        assert.strictEqual(client.startCallCount, 1, "replacement client must wait for the old client to stop");
        stopGate.complete();
        await listPromise;
        assert.deepStrictEqual({
          starts: client.startCallCount,
          stops: client.stopCount
        }, {
          starts: 2,
          stops: 1
        });
      } finally {
        stopGate.complete();
        await disposeAgent(agent);
      }
    });
    test("a failed client stop does not poison later model refreshes", async () => {
      const client = new StopCountingClient([], [{ id: "gpt-4o", name: "GPT-4o" }]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await waitForState(agent.models, (models) => models.length > 0);
        await agent.listSessions();
        const requestsBefore = client.modelListRequests.length;
        client.stopError = new Error("stop failed");
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        await timeout(10);
        client.stopError = void 0;
        await agent.refreshModels();
        assert.strictEqual(client.modelListRequests.length, requestsBefore + 1);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("drops an in-flight catalog from the previous client generation", async () => {
      const client = new StopCountingClient([], [{ id: "initial", name: "Initial" }]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await waitForState(agent.models, (models) => models.some((model) => model.id === "initial"));
        await Promise.resolve();
        const staleGate = new DeferredPromise();
        const replacementGate = new DeferredPromise();
        client.modelListGates.push(staleGate.p, replacementGate.p);
        client.modelListResponses.push(
          [{ id: "stale", name: "Stale" }],
          [{ id: "replacement", name: "Replacement" }]
        );
        const requestsBefore = client.modelListRequests.length;
        const staleRefresh = agent.refreshModels();
        for (let i = 0; i < 500 && client.modelListRequests.length < requestsBefore + 1; i++) {
          await timeout(1);
        }
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        for (let i = 0; i < 500 && client.modelListRequests.length < requestsBefore + 2; i++) {
          await timeout(1);
        }
        assert.deepStrictEqual(agent.models.get(), []);
        replacementGate.complete();
        await waitForState(agent.models, (models) => models.some((model) => model.id === "replacement"));
        staleGate.complete();
        await staleRefresh;
        assert.deepStrictEqual(agent.models.get().map((model) => model.id), ["replacement"]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("restarts the idle client when the rubber duck config changes", async () => {
      const client = new StopCountingClient([]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        await Promise.resolve();
        assert.strictEqual(client.stopCount, 1);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("restarts and disposes active sessions when the config changes", async () => {
      const client = new StopCountingClient([]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        let disposed = false;
        setDefaultSessionStub(agent, "active", { dispose() {
          disposed = true;
        } });
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        await Promise.resolve();
        assert.deepStrictEqual({
          stopCount: client.stopCount,
          disposed
        }, {
          stopCount: 1,
          disposed: true
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("does not restart when an unrelated config key changes", async () => {
      const client = new StopCountingClient([]);
      const logService = new MutableLogService();
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client, logService });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        logService.setLevel(LogLevel.Trace);
        configurationService.updateRootConfig({ [CopilotCliConfigKey.EnableCustomTerminalTool]: true });
        await Promise.resolve();
        assert.strictEqual(client.stopCount, 0);
      } finally {
        await disposeAgent(agent);
      }
    });
    function reportChatTurnEnded(agent) {
      agent._onChatTurnEnded();
    }
    function busyChatStub() {
      return {
        hasActiveTurn: true,
        disposed: false,
        dispose() {
          this.disposed = true;
        },
        destroySession: async () => {
        }
      };
    }
    test("defers the restart until an in-flight turn ends", async () => {
      const client = new StopCountingClient([]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        const chat = busyChatStub();
        setDefaultSessionStub(agent, "busy", chat);
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        await timeout(0);
        const duringTurn = { stopCount: client.stopCount, disposed: chat.disposed };
        chat.hasActiveTurn = false;
        reportChatTurnEnded(agent);
        await timeout(0);
        assert.deepStrictEqual({
          duringTurn,
          afterTurn: { stopCount: client.stopCount, disposed: chat.disposed }
        }, {
          duringTurn: { stopCount: 0, disposed: false },
          afterTurn: { stopCount: 1, disposed: true }
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("keeps deferring while another chat is still running its turn", async () => {
      const client = new StopCountingClient([]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        const first = busyChatStub();
        const second = busyChatStub();
        setDefaultSessionStub(agent, "busy-1", first);
        setDefaultSessionStub(agent, "busy-2", second);
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        await timeout(0);
        first.hasActiveTurn = false;
        reportChatTurnEnded(agent);
        await timeout(0);
        const afterFirst = client.stopCount;
        second.hasActiveTurn = false;
        reportChatTurnEnded(agent);
        await timeout(0);
        assert.deepStrictEqual({ afterFirst, afterSecond: client.stopCount }, { afterFirst: 0, afterSecond: 1 });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("applies a deferred restart when the busy session is disposed instead", async () => {
      const client = new StopCountingClient([]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        setDefaultSessionStub(agent, "busy", busyChatStub());
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        await timeout(0);
        const duringTurn = client.stopCount;
        await agent.disposeSession(AgentSession.uri("copilotcli", "busy"));
        assert.deepStrictEqual({ duringTurn, afterDispose: client.stopCount }, { duringTurn: 0, afterDispose: 1 });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("does not restart a client that was already stopped", async () => {
      const client = new StopCountingClient([]);
      const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        await agent.listSessions();
        const chat = busyChatStub();
        setDefaultSessionStub(agent, "busy", chat);
        configurationService.updateRootConfig({ [CopilotCliConfigKey.RubberDuck]: true });
        configurationService.updateRootConfig({ [CopilotCliConfigKey.CopilotSdkLogLevel]: "trace" });
        await timeout(0);
        chat.hasActiveTurn = false;
        reportChatTurnEnded(agent);
        reportChatTurnEnded(agent);
        await timeout(0);
        assert.strictEqual(client.stopCount, 1);
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  test("models include billing multiplier metadata when SDK provides it", async () => {
    const agent = createTestAgent(disposables, {
      copilotClient: new TestCopilotClient([], [{
        id: "gpt-4o",
        name: "GPT-4o",
        billing: { multiplier: 1.5 },
        capabilities: { limits: { max_context_window_tokens: 128e3, max_output_tokens: 16e3, max_prompt_tokens: 112e3 }, supports: { vision: true } }
      }])
    });
    try {
      await agent.authenticate("https://api.github.com", "token");
      const models = await waitForState(agent.models, (models2) => models2.length > 0);
      assert.deepStrictEqual(models, [{
        provider: "copilotcli",
        id: "gpt-4o",
        name: "GPT-4o",
        maxContextWindow: 128e3,
        maxOutputTokens: 16e3,
        maxPromptTokens: 112e3,
        supportsVision: true,
        configSchema: void 0,
        policyState: void 0,
        _meta: { multiplierNumeric: 1.5 }
      }]);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("models include picker and promo metadata when the SDK provides it", async () => {
    const agent = createTestAgent(disposables, {
      copilotClient: new TestCopilotClient([], [{
        id: "claude-sonnet",
        name: "Claude Sonnet",
        capabilities: { limits: { max_context_window_tokens: 2e5 } },
        billing: {
          multiplier: 1,
          promo: {
            id: "summer-sale",
            discountPercent: 25,
            endsAt: "2026-08-01T00:00:00Z",
            message: "Save on Claude Sonnet"
          },
          tokenPrices: {
            batchSize: 1e5,
            maxPromptTokens: 2e5,
            inputPrice: 0.3,
            cacheReadPrice: 0.1,
            outputPrice: 1.5,
            longContext: { maxPromptTokens: 1e6, inputPrice: 0.6, cacheReadPrice: 0.1, outputPrice: 2.25 }
          }
        },
        modelPickerCategory: "powerful",
        modelPickerPriceCategory: "medium"
      }])
    });
    try {
      await agent.authenticate("https://api.github.com", "token");
      const models = await waitForState(agent.models, (models2) => models2.length > 0);
      assert.deepStrictEqual(models[0]._meta, {
        multiplierNumeric: 1,
        inputCost: 3,
        cacheCost: 1,
        outputCost: 15,
        longContextInputCost: 6,
        longContextCacheCost: 1,
        longContextOutputCost: 22.5,
        priceCategory: "medium",
        category: "powerful",
        promo: {
          id: "summer-sale",
          discountPercent: 25,
          endsAt: "2026-08-01T00:00:00Z",
          message: "Save on Claude Sonnet"
        }
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("configSchema emits a thinkingLevel property when the model advertises reasoning efforts", async () => {
    const agent = createTestAgent(disposables, {
      copilotClient: new TestCopilotClient([], [{
        id: "o3",
        name: "o3",
        capabilities: { limits: { max_context_window_tokens: 128e3 } },
        supportedReasoningEfforts: ["low", "medium", "high"],
        defaultReasoningEffort: "medium"
      }])
    });
    try {
      await agent.authenticate("https://api.github.com", "token");
      const models = await waitForState(agent.models, (models2) => models2.length > 0);
      const schema = models[0].configSchema;
      assert.deepStrictEqual(schema?.properties.thinkingLevel?.enum, ["low", "medium", "high"]);
      assert.strictEqual(schema?.properties.thinkingLevel?.default, "medium");
      assert.strictEqual(schema?.properties.contextSize, void 0);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("BYOK model configSchema exposes only Copilot-supported reasoning efforts", async () => {
    const byokBridgeRegistry = new ByokLmBridgeRegistry();
    const agent = createTestAgent(disposables, { byokBridgeRegistry });
    const modelSnapshots = disposables.add(new Emitter());
    const connection = {
      chat: async () => ({ output: [] }),
      onDidChangeModels: modelSnapshots.event
    };
    disposables.add(byokBridgeRegistry.register("renderer", connection));
    try {
      modelSnapshots.fire([
        {
          vendor: "acme",
          id: "fallback-default",
          name: "Fallback Default",
          supportedReasoningEfforts: ["minimal", "low", "high"],
          defaultReasoningEffort: "minimal"
        },
        {
          vendor: "acme",
          id: "valid-default",
          name: "Valid Default",
          supportedReasoningEfforts: ["low", "medium", "high"],
          defaultReasoningEffort: "medium"
        },
        {
          vendor: "acme",
          id: "unsupported-only",
          name: "Unsupported Only",
          supportedReasoningEfforts: ["minimal"],
          defaultReasoningEffort: "minimal"
        }
      ]);
      const models = await waitForState(agent.models, (models2) => models2.length === 3);
      assert.deepStrictEqual(models.map((model) => ({
        id: model.id,
        thinkingLevel: model.configSchema?.properties.thinkingLevel && {
          enum: model.configSchema.properties.thinkingLevel.enum,
          default: model.configSchema.properties.thinkingLevel.default
        }
      })), [
        { id: "acme/fallback-default", thinkingLevel: { enum: ["low", "high"], default: "low" } },
        { id: "acme/valid-default", thinkingLevel: { enum: ["low", "medium", "high"], default: "medium" } },
        { id: "acme/unsupported-only", thinkingLevel: void 0 }
      ]);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("configSchema emits a numeric contextSize property when long_context tier exceeds default", async () => {
    const agent = createTestAgent(disposables, {
      copilotClient: new TestCopilotClient([], [{
        id: "claude-sonnet",
        name: "Claude Sonnet",
        capabilities: { limits: { max_context_window_tokens: 2e5 } },
        billing: {
          multiplier: 1,
          tokenPrices: {
            maxPromptTokens: 2e5,
            longContext: { maxPromptTokens: 1e6, inputPrice: 2 }
          }
        }
      }])
    });
    try {
      await agent.authenticate("https://api.github.com", "token");
      const models = await waitForState(agent.models, (models2) => models2.length > 0);
      const contextSize = models[0].configSchema?.properties.contextSize;
      assert.strictEqual(contextSize?.type, "number");
      assert.deepStrictEqual(contextSize?.enum, [2e5, 1e6]);
      assert.strictEqual(contextSize?.default, 2e5);
      assert.deepStrictEqual(contextSize?.enumLabels, ["200K", "1M"]);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("configSchema omits contextSize when long_context tier is missing or not larger", async () => {
    const agent = createTestAgent(disposables, {
      copilotClient: new TestCopilotClient([], [
        {
          id: "no-long-context",
          name: "No Long Context",
          billing: { multiplier: 1, tokenPrices: { contextMax: 2e5 } }
        },
        {
          id: "equal-long-context",
          name: "Equal Long Context",
          billing: {
            multiplier: 1,
            tokenPrices: { contextMax: 2e5, longContext: { contextMax: 2e5 } }
          }
        }
      ])
    });
    try {
      await agent.authenticate("https://api.github.com", "token");
      const models = await waitForState(agent.models, (models2) => models2.length > 0);
      assert.strictEqual(models[0].configSchema, void 0);
      assert.strictEqual(models[1].configSchema, void 0);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("configSchema shows both context options by default when long_context tier has no surcharge", async () => {
    const agent = createTestAgent(disposables, {
      copilotClient: new TestCopilotClient([], [{
        id: "free-long-context",
        name: "Free Long Context",
        capabilities: { limits: { max_context_window_tokens: 2e5 } },
        billing: {
          multiplier: 1,
          tokenPrices: {
            contextMax: 2e5,
            longContext: { contextMax: 1e6 }
          }
        }
      }])
    });
    try {
      await agent.authenticate("https://api.github.com", "token");
      const models = await waitForState(agent.models, (models2) => models2.length > 0);
      const contextSize = models[0].configSchema?.properties?.contextSize;
      assert.strictEqual(contextSize?.type, "number");
      assert.deepStrictEqual(contextSize?.enum, [2e5, 1e6]);
      assert.strictEqual(contextSize?.default, 2e5);
      assert.deepStrictEqual(contextSize?.enumLabels, ["200K", "1M"]);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("configSchema shows only long context option when long_context tier has no surcharge and preferLongContext is enabled", async () => {
    const { agent, configurationService } = createTestAgentContext(disposables, {
      copilotClient: new TestCopilotClient([], [{
        id: "free-long-context",
        name: "Free Long Context",
        capabilities: { limits: { max_context_window_tokens: 2e5 } },
        billing: {
          multiplier: 1,
          tokenPrices: {
            contextMax: 2e5,
            longContext: { contextMax: 1e6 }
          }
        }
      }])
    });
    try {
      configurationService.updateRootConfig({ [AgentHostPreferLongContextEnabledConfigKey]: true });
      await agent.authenticate("https://api.github.com", "token");
      const models = await waitForState(agent.models, (models2) => models2.length > 0);
      const contextSize = models[0].configSchema?.properties?.contextSize;
      assert.strictEqual(contextSize?.type, "number");
      assert.deepStrictEqual(contextSize?.enum, [1e6]);
      assert.strictEqual(contextSize?.default, 1e6);
      assert.deepStrictEqual(contextSize?.enumLabels, ["1M"]);
    } finally {
      await disposeAgent(agent);
    }
  });
  suite("contextSize to contextTier mapping", () => {
    const longContextModel = {
      id: "claude-sonnet",
      name: "Claude Sonnet",
      capabilities: { limits: { max_context_window_tokens: 2e5 } },
      billing: {
        multiplier: 1,
        tokenPrices: {
          contextMax: 2e5,
          longContext: { contextMax: 1e6, inputPrice: 2 }
        }
      }
    };
    async function captureSessionConfig(model, models, preferLongContext) {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([], models);
      let capturedConfig;
      client.createSession = async (config) => {
        capturedConfig = config;
        return new MockCopilotSession();
      };
      const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
      try {
        if (preferLongContext) {
          configurationService.updateRootConfig({ [AgentHostPreferLongContextEnabledConfigKey]: true });
        }
        await agent.authenticate("https://api.github.com", "token");
        await waitForState(agent.models, (m) => m.length > 0);
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "ctx-session"),
          workingDirectories: [URI.file("/workspace")],
          ...model ? { model } : {}
        });
        await agent.chats.sendMessage(defaultChatUri(result.session), "hello", void 0);
        return capturedConfig;
      } finally {
        await disposeAgent(agent);
      }
    }
    test("maps the largest numeric context size to long_context", async () => {
      const config = await captureSessionConfig({ id: "claude-sonnet", config: { contextSize: "1000000" } }, [longContextModel]);
      assert.ok(config, "SDK createSession should be called during materialization");
      assert.strictEqual(config.contextTier, "long_context");
    });
    test("maps the default numeric context size to default", async () => {
      const config = await captureSessionConfig({ id: "claude-sonnet", config: { contextSize: "200000" } }, [longContextModel]);
      assert.ok(config);
      assert.strictEqual(config.contextTier, "default");
    });
    test("drops a numeric context size the model does not offer", async () => {
      const config = await captureSessionConfig(
        { id: "no-context-picker", config: { contextSize: "1000000" } },
        [{ id: "no-context-picker", name: "No Picker" }]
      );
      assert.ok(config);
      assert.strictEqual(config.contextTier, void 0);
    });
    test("passes through a legacy resolved tier string under the deprecated contextTier key", async () => {
      const config = await captureSessionConfig({ id: "claude-sonnet", config: { contextTier: "long_context" } }, [longContextModel]);
      assert.ok(config);
      assert.strictEqual(config.contextTier, "long_context");
    });
    test("leaves the SDK on its default tier when model has no surcharge and no explicit selection", async () => {
      const freeLongContextModel = {
        id: "free-long-ctx",
        name: "Free Long Ctx",
        capabilities: { limits: { max_context_window_tokens: 2e5 } },
        billing: {
          multiplier: 1,
          tokenPrices: {
            contextMax: 2e5,
            longContext: { contextMax: 1e6 }
          }
        }
      };
      const config = await captureSessionConfig({ id: "free-long-ctx" }, [freeLongContextModel]);
      assert.ok(config);
      assert.strictEqual(config.contextTier, void 0);
    });
    test("uses long_context when model has no surcharge, no explicit selection and preferLongContext is enabled", async () => {
      const freeLongContextModel = {
        id: "free-long-ctx",
        name: "Free Long Ctx",
        capabilities: { limits: { max_context_window_tokens: 2e5 } },
        billing: {
          multiplier: 1,
          tokenPrices: {
            contextMax: 2e5,
            longContext: { contextMax: 1e6 }
          }
        }
      };
      const config = await captureSessionConfig({ id: "free-long-ctx" }, [freeLongContextModel], true);
      assert.ok(config);
      assert.strictEqual(config.contextTier, "long_context");
    });
  });
  test("agent-created sessions can resolve session-state paths via INativeEnvironmentService", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const { agent, instantiationService } = createTestAgentContext(disposables, {
      environmentServiceRegistration: "native",
      sessionDataService
    });
    const previousCopilotHome = process.env["COPILOT_HOME"];
    delete process.env["COPILOT_HOME"];
    try {
      const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
      const agentSession = disposables.add(createdSession.session);
      await agentSession.initializeSession();
      const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
      assert.ok(onPermissionRequest);
      const result = await onPermissionRequest({
        kind: "read",
        intention: "read plan",
        path: URI.file("/mock-home/.copilot/session-state/test-session-1/plan.md").fsPath,
        toolCallId: "tc-read-plan-agent-composition"
      }, { sessionId: "test-session-1" });
      assert.strictEqual(result.kind, "approve-once");
    } finally {
      if (previousCopilotHome === void 0) {
        delete process.env["COPILOT_HOME"];
      } else {
        process.env["COPILOT_HOME"] = previousCopilotHome;
      }
      await disposeAgent(agent);
    }
  });
  test("client tool call contributor prefers the message sender when it provides the tool", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const { agent, instantiationService } = createTestAgentContext(disposables, { environmentServiceRegistration: "native", sessionDataService });
    const actions = [];
    disposables.add(agent.onDidSessionProgress((signal) => {
      if (signal.kind === "action") {
        actions.push(signal.action);
      }
    }));
    const activeClientToolSet = new ActiveClientToolSet();
    const sharedTool = { name: "shared", description: "Shared tool", inputSchema: { type: "object", properties: {} } };
    activeClientToolSet.set("client-A", [sharedTool]);
    activeClientToolSet.set("client-B", [sharedTool]);
    const mockSession = new MockCopilotSession();
    const createdSession = createAgentSessionThroughAgent(agent, instantiationService, {
      mockSession,
      activeClientToolSet,
      snapshot: { tools: activeClientToolSet.merged(), plugins: [], mcpServers: {} }
    });
    const agentSession = disposables.add(createdSession.session);
    try {
      await agentSession.initializeSession();
      agentSession.resetTurnState("turn-1", "client-B");
      mockSession.emit({
        type: "tool.execution_start",
        data: { toolCallId: "tool-1", toolName: "shared", arguments: {} }
      });
      const toolStart = actions.find((action) => action.type === ActionType.ChatToolCallStart);
      assert.deepStrictEqual(toolStart?.type === ActionType.ChatToolCallStart ? toolStart.contributor : void 0, {
        kind: ToolCallContributorKind.Client,
        clientId: "client-B"
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("client tool completion unblocks a pending permission request", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const { agent, instantiationService, fileService } = createTestAgentContext(disposables, { environmentServiceRegistration: "native", sessionDataService });
    disposables.add(registerPendingEditContentProvider(fileService));
    const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
    const agentSession = disposables.add(createdSession.session);
    const pendingEditContentUri = new DeferredPromise();
    disposables.add(agent.onDidSessionProgress((signal) => {
      if (signal.kind === "pending_confirmation") {
        const uri = signal.state.edits?.items[0]?.after?.content.uri;
        if (uri) {
          pendingEditContentUri.complete(URI.parse(uri));
        }
      }
    }));
    try {
      await agentSession.initializeSession();
      const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
      assert.ok(onPermissionRequest);
      const permissionRequestResult = onPermissionRequest({
        kind: "write",
        toolCallId: "tool-1",
        canOfferSessionApproval: false,
        diff: "--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1 @@\n+after",
        fileName: URI.file("/workspace/file.txt").fsPath,
        intention: "write file",
        newFileContents: "after"
      }, { sessionId: "test-session-1" });
      const editContentUri = await pendingEditContentUri.p;
      agentSession.handleClientToolCallComplete("tool-1", {
        success: false,
        pastTenseMessage: "Client tool failed",
        content: [{ type: ToolResultContentType.Text, text: "failed before approval" }],
        error: { message: "failed before approval" }
      });
      await timeout(0);
      assert.deepStrictEqual({
        permissionResult: await permissionRequestResult,
        pendingEditContentExists: await fileService.exists(editContentUri)
      }, {
        permissionResult: { kind: "approve-once" },
        pendingEditContentExists: false
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("auto-approves one duplicate write permission request after approval", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const { agent, instantiationService, fileService } = createTestAgentContext(disposables, { environmentServiceRegistration: "native", sessionDataService });
    disposables.add(registerPendingEditContentProvider(fileService));
    const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
    const agentSession = disposables.add(createdSession.session);
    let nextPendingPermission = new DeferredPromise();
    let pendingPermissionCount = 0;
    disposables.add(agent.onDidSessionProgress((signal) => {
      if (signal.kind === "pending_confirmation") {
        pendingPermissionCount++;
        nextPendingPermission.complete();
      }
    }));
    try {
      await agentSession.initializeSession();
      const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
      assert.ok(onPermissionRequest);
      const request = {
        kind: "write",
        toolCallId: "tool-1",
        canOfferSessionApproval: true,
        diff: "--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1 @@\n+after",
        fileName: URI.file("/outside/file.txt").fsPath,
        intention: "write file",
        newFileContents: "after"
      };
      const firstResultPromise = onPermissionRequest(request, { sessionId: "test-session-1" });
      await nextPendingPermission.p;
      agentSession.respondToPermissionRequest("tool-1", true);
      const firstResult = await firstResultPromise;
      const duplicateResult = await onPermissionRequest({ ...request }, { sessionId: "test-session-1" });
      nextPendingPermission = new DeferredPromise();
      const thirdResultPromise = onPermissionRequest({ ...request }, { sessionId: "test-session-1" });
      await nextPendingPermission.p;
      agentSession.respondToPermissionRequest("tool-1", false);
      const thirdResult = await thirdResultPromise;
      assert.deepStrictEqual({
        results: [firstResult, duplicateResult, thirdResult],
        pendingPermissionCount
      }, {
        results: [{ kind: "approve-once" }, { kind: "approve-once" }, { kind: "denied-interactively-by-user" }],
        pendingPermissionCount: 2
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("requires confirmation when a second write permission request differs", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const { agent, instantiationService, fileService } = createTestAgentContext(disposables, { environmentServiceRegistration: "native", sessionDataService });
    disposables.add(registerPendingEditContentProvider(fileService));
    const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
    const agentSession = disposables.add(createdSession.session);
    let nextPendingPermission = new DeferredPromise();
    let pendingPermissionCount = 0;
    disposables.add(agent.onDidSessionProgress((signal) => {
      if (signal.kind === "pending_confirmation") {
        pendingPermissionCount++;
        nextPendingPermission.complete();
      }
    }));
    try {
      await agentSession.initializeSession();
      const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
      assert.ok(onPermissionRequest);
      const request = {
        kind: "write",
        toolCallId: "tool-1",
        canOfferSessionApproval: true,
        diff: "--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1 @@\n+first",
        fileName: URI.file("/outside/file.txt").fsPath,
        intention: "write file",
        newFileContents: "first"
      };
      const firstResultPromise = onPermissionRequest(request, { sessionId: "test-session-1" });
      await nextPendingPermission.p;
      agentSession.respondToPermissionRequest("tool-1", true);
      const firstResult = await firstResultPromise;
      nextPendingPermission = new DeferredPromise();
      const changedResultPromise = onPermissionRequest({
        ...request,
        diff: "--- a/other.txt\n+++ b/other.txt\n@@ -0,0 +1 @@\n+second",
        fileName: URI.file("/outside/other.txt").fsPath,
        newFileContents: "second"
      }, { sessionId: "test-session-1" });
      await nextPendingPermission.p;
      agentSession.respondToPermissionRequest("tool-1", false);
      const changedResult = await changedResultPromise;
      assert.deepStrictEqual({
        results: [firstResult, changedResult],
        pendingPermissionCount
      }, {
        results: [{ kind: "approve-once" }, { kind: "denied-interactively-by-user" }],
        pendingPermissionCount: 2
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("auto-approves one duplicate read permission request after approval", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const { agent, instantiationService, fileService } = createTestAgentContext(disposables, { environmentServiceRegistration: "native", sessionDataService });
    disposables.add(registerPendingEditContentProvider(fileService));
    const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
    const agentSession = disposables.add(createdSession.session);
    let nextPendingPermission = new DeferredPromise();
    let pendingPermissionCount = 0;
    disposables.add(agent.onDidSessionProgress((signal) => {
      if (signal.kind === "pending_confirmation") {
        pendingPermissionCount++;
        nextPendingPermission.complete();
      }
    }));
    try {
      await agentSession.initializeSession();
      const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
      assert.ok(onPermissionRequest);
      const request = {
        kind: "read",
        toolCallId: "tool-1",
        intention: "read file",
        path: URI.file("/outside/file.txt").fsPath
      };
      const firstResultPromise = onPermissionRequest(request, { sessionId: "test-session-1" });
      await nextPendingPermission.p;
      agentSession.respondToPermissionRequest("tool-1", true);
      const firstResult = await firstResultPromise;
      const duplicateResult = await onPermissionRequest({ ...request }, { sessionId: "test-session-1" });
      nextPendingPermission = new DeferredPromise();
      const thirdResultPromise = onPermissionRequest({ ...request }, { sessionId: "test-session-1" });
      await nextPendingPermission.p;
      agentSession.respondToPermissionRequest("tool-1", false);
      const thirdResult = await thirdResultPromise;
      assert.deepStrictEqual({
        results: [firstResult, duplicateResult, thirdResult],
        pendingPermissionCount
      }, {
        results: [{ kind: "approve-once" }, { kind: "approve-once" }, { kind: "denied-interactively-by-user" }],
        pendingPermissionCount: 2
      });
    } finally {
      await disposeAgent(agent);
    }
  });
  test("listSessions only returns sessions with a database", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const ownedSession = AgentSession.uri("copilotcli", "owned");
    const ownedDb = sessionDataService.openDatabase(ownedSession);
    ownedDb.dispose();
    const client = new TestCopilotClient([sdkSession("owned"), sdkSession("external")]);
    const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
    try {
      await agent.authenticate("https://api.github.com", "token");
      assert.deepStrictEqual((await agent.listSessions()).map((s) => AgentSession.id(s.session)), ["owned"]);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("listSessions reads stored metadata from sessions with a database", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const legacySession = AgentSession.uri("copilotcli", "legacy");
    const legacyDb = sessionDataService.openDatabase(legacySession);
    await legacyDb.object.setMetadata("copilot.workingDirectory", URI.file("/workspace").toString());
    legacyDb.dispose();
    const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([sdkSession("legacy")]) });
    try {
      await agent.authenticate("https://api.github.com", "token");
      assert.deepStrictEqual((await agent.listSessions()).map(withoutUndefinedProperties), [{
        session: legacySession,
        startTime: 1e3,
        modifiedTime: 2e3,
        summary: "SDK legacy",
        workingDirectories: [URI.file("/workspace")]
      }]);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("listSessions does not itself re-emit the workspaceless tag (AgentService overlays it centrally)", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const session = AgentSession.uri("copilotcli", "quick");
    const db = sessionDataService.openDatabase(session);
    await db.object.setMetadata("copilot.workingDirectory", URI.file("/scratch/quick").toString());
    await db.object.setMetadata("agentHost.workspaceless", "true");
    db.dispose();
    const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([sdkSession("quick")]) });
    try {
      await agent.authenticate("https://api.github.com", "token");
      assert.deepStrictEqual((await agent.listSessions()).map(withoutUndefinedProperties), [{
        session,
        startTime: 1e3,
        modifiedTime: 2e3,
        summary: "SDK quick",
        workingDirectories: [URI.file("/scratch/quick")]
      }]);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("getSessionMetadata reads one SDK session and stored metadata without listing sessions", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const session = AgentSession.uri("copilotcli", "target");
    const db = sessionDataService.openDatabase(session);
    await db.object.setMetadata("copilot.workingDirectory", URI.file("/workspace").toString());
    db.dispose();
    const client = new TestCopilotClient([sdkSession("target")]);
    const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
    try {
      await agent.authenticate("https://api.github.com", "token");
      const metadata = await agent.getSessionMetadata(session);
      assert.ok(metadata);
      assert.deepStrictEqual(withoutUndefinedProperties(metadata), {
        session,
        startTime: 1e3,
        modifiedTime: 2e3,
        summary: "SDK target",
        workingDirectories: [URI.file("/workspace")]
      });
      assert.deepStrictEqual(client.getSessionMetadataCalls, ["target"]);
      assert.strictEqual(client.listSessionCallCount, 0);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("getSessionMetadata only returns sessions with a database", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const session = AgentSession.uri("copilotcli", "external");
    const client = new TestCopilotClient([sdkSession("external", "/workspace")]);
    const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
    try {
      await agent.authenticate("https://api.github.com", "token");
      assert.strictEqual(await agent.getSessionMetadata(session), void 0);
      assert.deepStrictEqual(client.getSessionMetadataCalls, []);
      assert.strictEqual(client.listSessionCallCount, 0);
      assert.deepStrictEqual(sessionDataService.openedSessions, []);
    } finally {
      await disposeAgent(agent);
    }
  });
  test("listSessions does not create databases for unowned SDK sessions", async () => {
    const sessionDataService = disposables.add(new TestSessionDataService());
    const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([sdkSession("external", "/workspace")]) });
    try {
      await agent.authenticate("https://api.github.com", "token");
      assert.deepStrictEqual(await agent.listSessions(), []);
      assert.deepStrictEqual(sessionDataService.openedSessions, []);
    } finally {
      await disposeAgent(agent);
    }
  });
  suite("createSession activeClient eager-claim", () => {
    class SpyingPluginManager extends TestAgentPluginManager {
      constructor() {
        super(...arguments);
        this.calls = [];
      }
      async syncCustomizations(clientId, customizations, _progress) {
        this.calls.push({ clientId, customizations: [...customizations] });
        return [];
      }
    }
    test("createSession seeds activeClient tools and syncs customizations", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const pluginManager = new SpyingPluginManager();
      client.createSession = async () => {
        throw new Error("SDK should not be touched on provisional create");
      };
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const customizations = [{ type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", enabled: true }];
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "test-session"),
          workingDirectories: [URI.file("/workspace")],
          activeClient: {
            clientId: "client-1",
            tools: [{ name: "t1", description: "d", inputSchema: { type: "object" } }],
            customizations
          }
        });
        assert.strictEqual(result.provisional, true);
        assert.deepStrictEqual(pluginManager.calls, [{ clientId: "client-1", customizations }]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("createSession without activeClient does not sync customizations", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const pluginManager = new SpyingPluginManager();
      client.createSession = async () => {
        throw new Error("SDK should not be touched on provisional create");
      };
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "test-session-2"),
          workingDirectories: [URI.file("/workspace")]
        });
        assert.strictEqual(result.provisional, true);
        assert.deepStrictEqual(pluginManager.calls, []);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("provisional session anchors customization discovery to the additional roots (gated)", async () => {
      const { agent, stateManager } = createTestAgentContext(disposables);
      try {
        await agent.authenticate("https://api.github.com", "token");
        const repoA = URI.file("/repo-a");
        const repoB = URI.file("/repo-b");
        const additionalDirsAfterCreate = async (enabled, workingDirectories) => {
          stateManager.dispatchServerAction(ROOT_STATE_URI, {
            type: ActionType.RootConfigChanged,
            config: { [AgentHostCopilotMultiRootEnabledConfigKey]: enabled }
          });
          const uri = AgentSession.uri("copilotcli", `mrp-${enabled}-${workingDirectories.length}`);
          await agent.createSession({
            session: uri,
            workingDirectories,
            activeClient: { clientId: "client-1", tools: [], customizations: [] }
          });
          const activeClients = agent._activeClients;
          return (activeClients.get(uri)?.pluginController.additionalDirectories ?? []).map((d) => d.toString());
        };
        const multiRootOn = await additionalDirsAfterCreate(true, [repoA, repoB]);
        const multiRootOff = await additionalDirsAfterCreate(false, [repoA, repoB]);
        const singleRootOn = await additionalDirsAfterCreate(true, [repoA]);
        assert.deepStrictEqual({ multiRootOn, multiRootOff, singleRootOn }, {
          multiRootOn: [repoB.toString()],
          multiRootOff: [],
          singleRootOn: []
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("session plugin enablement is projected from reducer state per session", async () => {
      class PassthroughPluginManager extends TestAgentPluginManager {
        async syncCustomizations(_clientId, customizations) {
          return customizations.map((customization) => ({ customization }));
        }
      }
      const { agent, stateManager } = createTestAgentContext(disposables, { pluginManager: new PassthroughPluginManager() });
      try {
        const firstSession = AgentSession.uri("copilotcli", "first-enable-state");
        const secondSession = AgentSession.uri("copilotcli", "second-enable-state");
        const now = (/* @__PURE__ */ new Date()).toISOString();
        for (const session of [firstSession, secondSession]) {
          stateManager.createSession({
            resource: session.toString(),
            provider: "copilotcli",
            title: "Test",
            status: SessionStatus.Idle,
            createdAt: now,
            modifiedAt: now
          });
        }
        const plugin = {
          type: CustomizationType.Plugin,
          id: "file:///plugin-a",
          uri: "file:///plugin-a",
          name: "Plugin A",
          enabled: true
        };
        agent.getOrCreateActiveClient(firstSession, { clientId: "client-1" }).customizations = [plugin];
        agent.getOrCreateActiveClient(secondSession, { clientId: "client-2" }).customizations = [plugin];
        const [firstInitial, secondInitial] = await Promise.all([
          agent.getSessionCustomizations(firstSession),
          agent.getSessionCustomizations(secondSession)
        ]);
        stateManager.dispatchServerAction(firstSession.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [...firstInitial] });
        stateManager.dispatchServerAction(secondSession.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [...secondInitial] });
        stateManager.dispatchServerAction(firstSession.toString(), { type: ActionType.SessionCustomizationToggled, id: plugin.id, enabled: false });
        const [first, second] = await Promise.all([
          agent.getSessionCustomizations(firstSession),
          agent.getSessionCustomizations(secondSession)
        ]);
        assert.deepStrictEqual({
          first: first.find((customization) => customization.id === plugin.id)?.enabled,
          second: second.find((customization) => customization.id === plugin.id)?.enabled
        }, {
          first: false,
          second: true
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("setClientCustomizations publishes parsed agents in SessionCustomizationUpdated", async () => {
      const fileService = disposables.add(new FileService(new NullLogService()));
      disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
      const pluginDir = URI.from({ scheme: Schemas.inMemory, path: "/plugin-a" });
      await fileService.createFolder(URI.joinPath(pluginDir, "agents"));
      await fileService.writeFile(
        URI.joinPath(pluginDir, "agents", "helper.md"),
        VSBuffer.fromString("---\nname: helper-agent\ndescription: helps out\n---\nbody")
      );
      class PluginDirSpyManager extends TestAgentPluginManager {
        async syncCustomizations(_clientId, customizations) {
          return customizations.map((c) => ({
            customization: { ...c, load: { kind: CustomizationLoadStatus.Loaded } },
            pluginDir
          }));
        }
      }
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const pluginManager = new PluginDirSpyManager();
      const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, pluginManager, fileService });
      const actions = [];
      disposables.add(agent.onDidSessionProgress((s) => {
        if (s.kind === "action") {
          actions.push(s.action);
        }
      }));
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "sync-customizations-test");
        agent.getOrCreateActiveClient(session, { clientId: "client-1" }).customizations = [{ type: CustomizationType.Plugin, id: customizationId(pluginDir.toString()), uri: pluginDir.toString(), name: "Plugin A", enabled: true }];
        await new Promise((r) => setTimeout(r, 50));
        const updatesWithChildren = actions.filter((a) => a.type === ActionType.SessionCustomizationUpdated).filter((a) => true).filter((a) => a.customization.children !== void 0);
        assert.strictEqual(updatesWithChildren.length > 0, true, "expected SessionCustomizationUpdated to carry parsed children");
        const agentChildren = updatesWithChildren.at(-1).customization.children.filter((c) => c.type === CustomizationType.Agent);
        assert.deepStrictEqual(agentChildren, [{
          type: CustomizationType.Agent,
          id: customizationId(URI.joinPath(pluginDir, "agents", "helper.md").toString()),
          uri: URI.joinPath(pluginDir, "agents", "helper.md").toString(),
          name: "helper-agent",
          description: "helps out"
        }]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("getSessionCustomizations publishes discovered files as Directory customizations", async () => {
      const fileService = disposables.add(new FileService(new NullLogService()));
      disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
      const agentContent = [
        "---",
        "name: helper",
        "description: helps out",
        "---",
        "agent body"
      ];
      const instructionContent = [
        "---",
        "name: nested",
        "description: nested instructions",
        "applyTo: *.ts, *.js",
        "---",
        "instruction body"
      ];
      const workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
      await fileService.createFolder(URI.joinPath(workspace, ".github", "agents"));
      await fileService.createFolder(URI.joinPath(workspace, ".github", "instructions", "team"));
      const agentFile = URI.joinPath(workspace, ".github", "agents", "helper.agent.md");
      const instructionFile = URI.joinPath(workspace, ".github", "instructions", "team", "nested.instructions.md");
      await fileService.writeFile(agentFile, VSBuffer.fromString(agentContent.join("\n")));
      await fileService.writeFile(instructionFile, VSBuffer.fromString(instructionContent.join("\n")));
      const agentsMdFile = URI.joinPath(workspace, "AGENTS.md");
      await fileService.writeFile(agentsMdFile, VSBuffer.fromString("agents md body"));
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "session-discovery-directories");
        await agent.createSession({
          session,
          workingDirectories: [workspace]
        });
        const customizations = await agent.getSessionCustomizations(session);
        const discoveredDirectories = customizations.filter((customization) => customization.type === CustomizationType.Directory);
        assert.strictEqual(discoveredDirectories.length, 13);
        const expectedUris = [
          // workspace roots
          workspace.toString(),
          URI.joinPath(workspace, ".github", "agents").toString(),
          URI.joinPath(workspace, ".claude", "agents").toString(),
          URI.joinPath(workspace, ".github", "skills").toString(),
          URI.joinPath(workspace, ".agents", "skills").toString(),
          URI.joinPath(workspace, ".claude", "skills").toString(),
          URI.joinPath(workspace, ".github", "instructions").toString(),
          URI.joinPath(workspace, ".github", "hooks").toString(),
          // user home roots
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.copilot/agents" }).toString(),
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.agents/skills" }).toString(),
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.copilot/skills" }).toString(),
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.copilot/instructions" }).toString(),
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.copilot/hooks" }).toString()
        ];
        assert.deepStrictEqual(discoveredDirectories.map((customization) => customization.uri).sort(), expectedUris.sort());
        const agentDirectory = discoveredDirectories.find((customization) => customization.uri === URI.joinPath(workspace, ".github", "agents").toString());
        assert.ok(agentDirectory);
        assert.strictEqual(agentDirectory.contents, CustomizationType.Agent);
        assert.deepStrictEqual(agentDirectory.children, [{
          type: CustomizationType.Agent,
          id: customizationId(agentFile.toString()),
          uri: agentFile.toString(),
          name: "helper",
          description: "helps out"
        }]);
        const instructionDirectory = discoveredDirectories.find((customization) => customization.uri === URI.joinPath(workspace, ".github", "instructions").toString());
        assert.ok(instructionDirectory);
        assert.strictEqual(instructionDirectory.contents, CustomizationType.Rule);
        assert.deepStrictEqual(instructionDirectory.children, [{
          type: CustomizationType.Rule,
          id: customizationId(instructionFile.toString()),
          uri: instructionFile.toString(),
          name: "nested",
          description: "nested instructions",
          globs: ["*.ts", "*.js"],
          alwaysApply: void 0
        }]);
        const agentInstructionsDirectory = discoveredDirectories.find((customization) => customization.uri === workspace.toString());
        assert.ok(agentInstructionsDirectory);
        assert.strictEqual(agentInstructionsDirectory.contents, CustomizationType.Rule);
        assert.deepStrictEqual(agentInstructionsDirectory.children, [{
          type: CustomizationType.Rule,
          id: customizationId(agentsMdFile.toString()),
          uri: agentsMdFile.toString(),
          name: "AGENTS.md",
          alwaysApply: true
        }]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("getSessionCustomizations starts initial discovery without debounce", async () => {
      class StatTrackingFileSystemProvider extends InMemoryFileSystemProvider {
        constructor() {
          super(...arguments);
          this.trackStats = false;
          this.statCalls = 0;
        }
        async stat(resource) {
          if (this.trackStats) {
            this.statCalls++;
          }
          return super.stat(resource);
        }
      }
      const fileService = disposables.add(new FileService(new NullLogService()));
      const provider = disposables.add(new StatTrackingFileSystemProvider());
      disposables.add(fileService.registerProvider(Schemas.inMemory, provider));
      const workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
      await fileService.createFolder(workspace);
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "session-discovery-immediate");
        await agent.createSession({ session, workingDirectories: [workspace] });
        provider.trackStats = true;
        const customizations = agent.getSessionCustomizations(session);
        await timeout(REFRESH_DEBOUNCE_MS + 200);
        assert.notEqual(provider.statCalls, 0, "expected discovery to start before the debounce interval");
        const resolved = await customizations;
        assert.ok(resolved.length > 0, "expected discovery to resolve with some customizations");
      } finally {
        await disposeAgent(agent);
      }
    });
    test("getSessionCustomizations clears discovered files when the root disappears", async () => {
      const fileService = disposables.add(new FileService(new NullLogService()));
      disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
      const workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
      const agentsRoot = URI.joinPath(workspace, ".github", "agents");
      await fileService.createFolder(agentsRoot);
      await fileService.writeFile(URI.joinPath(agentsRoot, "helper.agent.md"), VSBuffer.fromString("agent body"));
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "session-discovery-cleared");
        await agent.createSession({
          session,
          workingDirectories: [workspace]
        });
        const before = await agent.getSessionCustomizations(session);
        const beforeDirs = before.filter((customization) => customization.type === CustomizationType.Directory);
        const agentsDirBefore = beforeDirs.find((d) => d.uri === agentsRoot.toString());
        assert.ok(agentsDirBefore);
        assert.strictEqual(agentsDirBefore.children.length, 1);
        await fileService.del(agentsRoot, { recursive: true });
        let after = await agent.getSessionCustomizations(session);
        let afterDirs = after.filter((customization) => customization.type === CustomizationType.Directory);
        for (let i = 0; i < 20 && afterDirs.some((d) => d.uri === agentsRoot.toString() && (d.children?.length ?? 0) > 0); i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          after = await agent.getSessionCustomizations(session);
          afterDirs = after.filter((customization) => customization.type === CustomizationType.Directory);
        }
        const agentsDirAfter = afterDirs.find((d) => d.uri === agentsRoot.toString());
        assert.ok(agentsDirAfter);
        assert.strictEqual(agentsDirAfter.children?.length ?? 0, 0);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("getSessionCustomizations does not republish discovered directories when watcher changes are discovery-neutral", async () => {
      const fileService = disposables.add(new FileService(new NullLogService()));
      disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
      const workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
      const agentsRoot = URI.joinPath(workspace, ".github", "agents");
      await fileService.createFolder(agentsRoot);
      await fileService.writeFile(URI.joinPath(agentsRoot, "helper.agent.md"), VSBuffer.fromString("agent body"));
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });
      const actions = [];
      disposables.add(agent.onDidSessionProgress((progress) => {
        if (progress.kind === "action") {
          actions.push(progress.action);
        }
      }));
      const countDirectoryPublishesForAgentsRoot = () => actions.filter((action) => {
        if (action.type === ActionType.SessionCustomizationUpdated) {
          const customization = action.customization;
          return customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString();
        }
        if (action.type === ActionType.SessionCustomizationsChanged) {
          const customizations = action.customizations;
          return customizations.some((customization) => customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString());
        }
        return false;
      }).length;
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "session-discovery-neutral-watcher-change");
        await agent.createSession({
          session,
          workingDirectories: [workspace]
        });
        await agent.getSessionCustomizations(session);
        await new Promise((resolve) => setTimeout(resolve, 50));
        const publishCountBefore = countDirectoryPublishesForAgentsRoot();
        await fileService.writeFile(URI.joinPath(agentsRoot, "README.md"), VSBuffer.fromString("ignored"));
        for (let i = 0; i < 20; i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          assert.strictEqual(countDirectoryPublishesForAgentsRoot(), publishCountBefore, "expected no republish when discovery output is unchanged");
        }
        const after = await agent.getSessionCustomizations(session);
        const afterDirs = after.filter((customization) => customization.type === CustomizationType.Directory);
        const expectedUris = [
          URI.joinPath(workspace, ".github", "agents").toString(),
          URI.joinPath(workspace, ".claude", "agents").toString(),
          URI.joinPath(workspace, ".github", "skills").toString(),
          URI.joinPath(workspace, ".agents", "skills").toString(),
          URI.joinPath(workspace, ".claude", "skills").toString(),
          URI.joinPath(workspace, ".github", "instructions").toString(),
          URI.joinPath(workspace, ".github", "hooks").toString(),
          // user home roots
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.copilot/agents" }).toString(),
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.agents/skills" }).toString(),
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.copilot/skills" }).toString(),
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.copilot/instructions" }).toString(),
          URI.from({ scheme: Schemas.inMemory, path: "/mock-home/.copilot/hooks" }).toString()
        ];
        assert.deepStrictEqual(afterDirs.map((customization) => customization.uri).sort(), expectedUris.sort());
      } finally {
        await disposeAgent(agent);
      }
    });
    test("getSessionCustomizations coalesces burst watcher changes into one discovered refresh publish", async () => {
      const fileService = disposables.add(new FileService(new NullLogService()));
      disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
      const workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
      const agentsRoot = URI.joinPath(workspace, ".github", "agents");
      const instructionsRoot = URI.joinPath(workspace, ".github", "instructions");
      await fileService.createFolder(agentsRoot);
      await fileService.createFolder(instructionsRoot);
      await fileService.writeFile(URI.joinPath(agentsRoot, "helper-0.agent.md"), VSBuffer.fromString("agent 0"));
      await fileService.writeFile(URI.joinPath(instructionsRoot, "base.instructions.md"), VSBuffer.fromString("---\napplyTo:\n  - src/**\n---\nbase instruction"));
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });
      const actions = [];
      disposables.add(agent.onDidSessionProgress((progress) => {
        if (progress.kind === "action") {
          actions.push(progress.action);
        }
      }));
      const countDiscoveredRefreshPublishes = () => actions.filter((action) => {
        if (action.type !== ActionType.SessionCustomizationsChanged) {
          return false;
        }
        const customizations = action.customizations;
        return customizations.some((customization) => customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString()) && customizations.some((customization) => customization.type === CustomizationType.Directory && customization.uri === instructionsRoot.toString());
      }).length;
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "session-discovery-burst-watcher-change");
        await agent.createSession({
          session,
          workingDirectories: [workspace]
        });
        await agent.getSessionCustomizations(session);
        await new Promise((resolve) => setTimeout(resolve, 50));
        const publishCountBeforeBurst = countDiscoveredRefreshPublishes();
        await Promise.all([
          fileService.writeFile(URI.joinPath(agentsRoot, "helper-1.agent.md"), VSBuffer.fromString("agent 1")),
          fileService.writeFile(URI.joinPath(agentsRoot, "helper-2.agent.md"), VSBuffer.fromString("agent 2")),
          fileService.writeFile(URI.joinPath(instructionsRoot, "extra.instructions.md"), VSBuffer.fromString("---\napplyTo:\n  - test/**\n---\nextra instruction"))
        ]);
        let discoveredAgentCount = 0;
        let discoveredInstructionCount = 0;
        for (let i = 0; i < 20 && (discoveredAgentCount < 3 || discoveredInstructionCount < 2); i++) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          const customizations = await agent.getSessionCustomizations(session);
          const discoveredAgentDirectory = customizations.find((customization) => customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString());
          const discoveredInstructionDirectory = customizations.find((customization) => customization.type === CustomizationType.Directory && customization.uri === instructionsRoot.toString());
          discoveredAgentCount = discoveredAgentDirectory?.children.filter((child) => child.type === CustomizationType.Agent).length ?? 0;
          discoveredInstructionCount = discoveredInstructionDirectory?.children.filter((child) => child.type === CustomizationType.Rule).length ?? 0;
        }
        assert.strictEqual(discoveredAgentCount, 3, "expected agent burst changes to be discovered");
        assert.strictEqual(discoveredInstructionCount, 2, "expected instruction burst changes to be discovered");
        assert.strictEqual(
          countDiscoveredRefreshPublishes(),
          publishCountBeforeBurst + 1,
          "expected burst watcher changes across folders to result in exactly one discovered refresh publish (_onDidRefresh)"
        );
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  suite("provisional sessions", () => {
    test("createSession does not call client.createSession or create worktrees", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const gitService = new TestAgentHostGitService();
      let clientCreateCalls = 0;
      let worktreeCalls = 0;
      client.createSession = async () => {
        clientCreateCalls++;
        throw new Error("SDK not expected");
      };
      const origAddWorktree = gitService.addWorktree.bind(gitService);
      gitService.addWorktree = async (...args) => {
        worktreeCalls++;
        return origAddWorktree(...args);
      };
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, gitService });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "prov-1"),
          workingDirectories: [URI.file("/workspace")],
          config: { isolation: "worktree", branch: "main" }
        });
        assert.strictEqual(result.provisional, true);
        assert.strictEqual(clientCreateCalls, 0, "client.createSession should not be called for provisional sessions");
        assert.strictEqual(worktreeCalls, 0, "no worktree should be created for provisional sessions");
      } finally {
        await disposeAgent(agent);
      }
    });
    test("sendMessage on the default chat materializes the parent provisional session", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      let capturedConfig;
      client.createSession = async (config) => {
        capturedConfig = config;
        return new MockCopilotSession();
      };
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "prov-default-chat"),
          workingDirectories: [URI.file("/workspace")]
        });
        await agent.chats.sendMessage(defaultChatUri(result.session), "hello", void 0);
        assert.strictEqual(capturedConfig?.sessionId, "prov-default-chat");
      } finally {
        await disposeAgent(agent);
      }
    });
    test("disposeSession on provisional session does not touch SDK or worktree", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const gitService = new TestAgentHostGitService();
      let removeWorktreeCalls = 0;
      const origRemoveWorktree = gitService.removeWorktree.bind(gitService);
      gitService.removeWorktree = async (...args) => {
        removeWorktreeCalls++;
        return origRemoveWorktree(...args);
      };
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, gitService });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "prov-2"),
          workingDirectories: [URI.file("/workspace")]
        });
        await agent.disposeSession(result.session);
        assert.strictEqual(removeWorktreeCalls, 0, "no worktree to remove for provisional");
        assert.strictEqual(agent.hasSession(result.session), false);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("disposeSession removes the session from the SDK on-disk store", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "persisted-session-1");
        await agent.disposeSession(session);
        assert.deepStrictEqual(client.deletedSessionIds, ["persisted-session-1"]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("disposeSession on provisional session does not call client.deleteSession", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "prov-3"),
          workingDirectories: [URI.file("/workspace")]
        });
        await agent.disposeSession(result.session);
        assert.deepStrictEqual(client.deletedSessionIds, []);
        assert.strictEqual(agent.hasSession(result.session), false);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("disposeSession propagates SDK delete errors and preserves in-memory state", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      client.deleteSession = async () => {
        throw new Error("boom");
      };
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "persisted-session-2");
        await assert.rejects(() => agent.disposeSession(session), /boom/);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("materialization passes VS Code-specific system message to the SDK", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      let capturedConfig;
      client.createSession = async (config) => {
        capturedConfig = config;
        return new MockCopilotSession();
      };
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "system-message-session"),
          workingDirectories: [URI.file("/workspace")]
        });
        assert.strictEqual(result.provisional, true);
        await agent.chats.sendMessage(defaultChatUri(result.session), "hello", void 0);
        assert.ok(capturedConfig, "SDK createSession should be called during provisional materialization");
        const systemMessage = capturedConfig.systemMessage;
        assert.deepStrictEqual(systemMessage, {
          ...COPILOT_AGENT_HOST_SYSTEM_MESSAGE,
          content: COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS
        });
        if (!systemMessage || systemMessage.mode !== "customize") {
          assert.fail("Expected customize-mode system message");
        }
        assert.strictEqual(systemMessage.sections?.identity?.action, "replace");
        assert.strictEqual(
          systemMessage.sections?.identity?.content,
          "You are an AI assistant using Copilot CLI runtime in VS Code. You help users with software engineering tasks. When asked about your identity, you must state that you are an AI assistant using Copilot CLI runtime in VS Code."
        );
      } finally {
        await disposeAgent(agent);
      }
    });
    test("materialization forwards the GitHub token to the SDK at the session level (#318693)", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      let capturedConfig;
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      client.createSession = async (config) => {
        capturedConfig = config;
        return new MockCopilotSession();
      };
      try {
        await agent.authenticate("https://api.github.com", "gh-token-abc");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "session-level-token"),
          workingDirectories: [URI.file("/workspace")]
        });
        assert.strictEqual(result.provisional, true);
        await agent.chats.sendMessage(defaultChatUri(result.session), "hello", void 0);
        assert.deepStrictEqual({
          configToken: capturedConfig?.gitHubToken
        }, {
          configToken: "gh-token-abc"
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("failed materialization surfaces the create error", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      client.createSession = async () => {
        throw new Error("create failed");
      };
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "gh-token-abc");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "failed-session-token"),
          workingDirectories: [URI.file("/workspace")]
        });
        await assert.rejects(agent.chats.sendMessage(defaultChatUri(result.session), "hello", void 0), /create failed/);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("materialization skips managed shell tools when root config disables the custom terminal tool", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      let capturedConfig;
      client.createSession = async (config) => {
        capturedConfig = config;
        return new MockCopilotSession();
      };
      const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        configurationService.updateRootConfig({ [CopilotCliConfigKey.EnableCustomTerminalTool]: false });
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "sdk-terminal-defaults"),
          workingDirectories: [URI.file("/workspace")]
        });
        assert.strictEqual(result.provisional, true);
        await agent.chats.sendMessage(defaultChatUri(result.session), "hello", void 0);
        assert.deepStrictEqual(capturedConfig?.tools?.map((tool) => tool.name), []);
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  suite("onClientToolCallComplete", () => {
    function installStubSession(agent, sessionId) {
      const calls = [];
      const stub = {
        handleClientToolCallComplete(toolCallId, result) {
          calls.push({ toolCallId, result });
        },
        dispose() {
        }
      };
      setDefaultSessionStub(agent, sessionId, stub);
      return { calls };
    }
    test("routes a top-level session URI to its session entry", async () => {
      const agent = createTestAgent(disposables);
      try {
        const sessionUri = AgentSession.uri("copilotcli", "session-top");
        const defaultChat = URI.parse(buildDefaultChatUri(sessionUri));
        const { calls } = installStubSession(agent, AgentSession.id(sessionUri));
        const result = { success: true, pastTenseMessage: "did it" };
        agent.onClientToolCallComplete(sessionUri, defaultChat, "tc-top", result);
        assert.deepStrictEqual(calls, [{ toolCallId: "tc-top", result }]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("is a no-op when no session entry exists for the resolved id", async () => {
      const agent = createTestAgent(disposables);
      try {
        const sessionUri = AgentSession.uri("copilotcli", "session-missing");
        const defaultChat = URI.parse(buildDefaultChatUri(sessionUri));
        agent.onClientToolCallComplete(sessionUri, defaultChat, "tc-x", { success: true, pastTenseMessage: "noop" });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("routes a peer chat URI to its chat-session entry", async () => {
      const agent = createTestAgent(disposables);
      try {
        const sessionUri = AgentSession.uri("copilotcli", "session-with-peer");
        const chatUri = URI.parse(buildChatUri(sessionUri, "peer-1"));
        const calls = [];
        const stub = {
          handleClientToolCallComplete(toolCallId, result2) {
            calls.push({ toolCallId, result: result2 });
          },
          dispose() {
          }
        };
        setPeerChatStub(agent, chatUri, stub);
        const result = { success: true, pastTenseMessage: "peer done" };
        agent.onClientToolCallComplete(sessionUri, chatUri, "tc-peer", result);
        assert.deepStrictEqual(calls, [{ toolCallId: "tc-peer", result }]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("routes the default chat URI to the session entry, not a chat-session", async () => {
      const agent = createTestAgent(disposables);
      try {
        const sessionUri = AgentSession.uri("copilotcli", "session-default");
        const defaultChatUri2 = URI.parse(buildDefaultChatUri(sessionUri));
        const { calls } = installStubSession(agent, AgentSession.id(sessionUri));
        const result = { success: true, pastTenseMessage: "default done" };
        agent.onClientToolCallComplete(sessionUri, defaultChatUri2, "tc-default", result);
        assert.deepStrictEqual(calls, [{ toolCallId: "tc-default", result }]);
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  suite("peer chat routing and lifecycle", () => {
    function installStubChat(agent, chatUri, options) {
      const events = [];
      let disposed = false;
      const stub = {
        respondToPermissionRequest(requestId, approved) {
          if (options?.permissionOwner === requestId) {
            events.push(`perm:${requestId}:${approved}`);
            return true;
          }
          return false;
        },
        respondToUserInputRequest(requestId, response) {
          if (options?.inputOwner === requestId) {
            events.push(`input:${requestId}`);
            return true;
          }
          return false;
        },
        handleClientToolCallComplete() {
        },
        dispose() {
          disposed = true;
        }
      };
      setPeerChatStub(agent, chatUri, stub);
      return { events, isDisposed: () => disposed };
    }
    test("respondToPermissionRequest routes to a peer chat session", async () => {
      const agent = createTestAgent(disposables);
      try {
        const sessionUri = AgentSession.uri("copilotcli", "session-perm");
        const chatUri = URI.parse(buildChatUri(sessionUri, "peer-perm"));
        const chat = installStubChat(agent, chatUri, { permissionOwner: "req-1" });
        agent.respondToPermissionRequest("req-1", true);
        assert.deepStrictEqual(chat.events, ["perm:req-1:true"]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("respondToUserInputRequest routes to a peer chat session", async () => {
      const agent = createTestAgent(disposables);
      try {
        const sessionUri = AgentSession.uri("copilotcli", "session-input");
        const chatUri = URI.parse(buildChatUri(sessionUri, "peer-input"));
        const chat = installStubChat(agent, chatUri, { inputOwner: "req-2" });
        agent.respondToUserInputRequest("req-2", "submit");
        assert.deepStrictEqual(chat.events, ["input:req-2"]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("setPendingMessages steers the addressed chat, not the session's default chat", async () => {
      const agent = createTestAgent(disposables);
      try {
        const sessionUri = AgentSession.uri("copilotcli", "session-steer");
        const chatUri = URI.parse(buildChatUri(sessionUri, "peer-steer"));
        const steered = [];
        setDefaultSessionStub(agent, AgentSession.id(sessionUri), {
          sendSteering: async (msg) => {
            steered.push(`default:${msg.id}`);
          },
          dispose() {
          }
        });
        setPeerChatStub(agent, chatUri, {
          sendSteering: async (msg) => {
            steered.push(`peer:${msg.id}`);
          },
          dispose() {
          }
        });
        agent.setPendingMessages(chatUri, { id: "steer-peer", message: { text: "stop", origin: { kind: MessageKind.User } } }, []);
        agent.setPendingMessages(URI.parse(buildDefaultChatUri(sessionUri)), { id: "steer-default", message: { text: "stop", origin: { kind: MessageKind.User } } }, []);
        assert.deepStrictEqual(steered, ["peer:steer-peer", "default:steer-default"]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("disposeSession disposes the session's peer chats", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "parent-with-peers"),
          workingDirectories: [URI.file("/workspace")]
        });
        const chatUri = URI.parse(buildChatUri(result.session, "peer-x"));
        const chat = installStubChat(agent, chatUri);
        await agent.disposeSession(result.session);
        assert.strictEqual(chat.isDisposed(), true, "peer chat should be disposed with its parent session");
        assert.strictEqual(hasPeerChatStub(agent, chatUri), false, "peer chat entry should be removed");
      } finally {
        await disposeAgent(agent);
      }
    });
    test("disposeChat deletes the SDK chat (via legacy fallback) and drops the live backing without rewriting copilot.chats", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "session-dispose-chat");
        const db = sessionDataService.openDatabase(session);
        await db.object.setMetadata("copilot.chats", JSON.stringify({
          "peer-a": { sdkSessionId: "sdk-a" }
        }));
        const chatUri = URI.parse(buildChatUri(session, "peer-a"));
        const internals = agent;
        await agent.materializeChat(chatUri, JSON.stringify({ sdkSessionId: "sdk-a" }));
        await agent.chats.disposeChat(chatUri);
        const remaining = await db.object.getMetadata("copilot.chats");
        assert.deepStrictEqual({
          backingCleared: internals._chatBackings.has(chatUri.toString()),
          deleted: client.deletedSessionIds,
          // The agent no longer owns the durable catalog, so it leaves
          // the legacy blob untouched (orchestrator drops the entry).
          legacyUntouched: remaining ? JSON.parse(remaining) : {}
        }, {
          backingCleared: false,
          deleted: ["sdk-a"],
          legacyUntouched: { "peer-a": { sdkSessionId: "sdk-a" } }
        });
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  suite("peer chat create / fork / model+agent / restore round-trip", () => {
    function makeFakeChatSession(sessionUri, sdkSessionId, getMessages, owned) {
      const rec = {
        initialized: false,
        disposed: false,
        remapCalls: [],
        sends: [],
        resets: [],
        modelCalls: [],
        agentCalls: []
      };
      const fake = {
        sessionUri,
        sessionId: sdkSessionId,
        appliedSnapshot: { tools: [], plugins: [], mcpServers: {} },
        async initializeSession() {
          rec.initialized = true;
        },
        async remapTurnIds(mapping) {
          rec.remapCalls.push(mapping);
        },
        async send(prompt, _attachments, turnId, mode, senderClientId) {
          rec.sends.push({ prompt, turnId, mode, senderClientId });
        },
        resetTurnState(turnId, senderClientId) {
          rec.resets.push({ turnId, senderClientId });
        },
        async setModel(id) {
          rec.modelCalls.push({ id });
        },
        async setAgent(name) {
          rec.agentCalls.push(name);
        },
        handleClientToolCallComplete() {
        },
        async getNextTurnEventId() {
          return void 0;
        },
        getMessages: getMessages ?? (async () => []),
        dispose() {
          rec.disposed = true;
          owned?.dispose();
        }
      };
      return { rec, fake };
    }
    test("createChat materializes a peer chat, records its backing, and returns providerData (no copilot.chats write)", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "create-peer");
        await agent.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        const chatUri = URI.parse(buildChatUri(session, "peer-a"));
        const internals = agent;
        let captured;
        let capturedChannel;
        let capturedSession;
        let rec;
        internals._createAgentSession = (launchPlan, _dir, _ac, identity) => {
          captured = launchPlan;
          capturedChannel = identity?.chatChannelUri;
          capturedSession = identity?.sessionUri;
          const built = makeFakeChatSession(session, launchPlan.sessionId, void 0, launchPlan.shellManager);
          rec = built.rec;
          return built.fake;
        };
        const model = { id: "gpt-x" };
        const result = await agent.chats.createChat(chatUri, { model });
        const db = sessionDataService.openDatabase(session);
        const raw = await db.object.getMetadata("copilot.chats");
        assert.deepStrictEqual({
          tracked: hasPeerChatStub(agent, chatUri),
          initialized: rec?.initialized,
          session: capturedSession?.toString(),
          channel: capturedChannel?.toString(),
          kind: captured?.kind,
          backing: internals._chatBackings.get(chatUri.toString()),
          providerData: result ? JSON.parse(result.providerData) : void 0,
          // The orchestrator now owns the durable catalog; the agent no
          // longer writes its private `copilot.chats` metadata.
          legacyCatalogWritten: raw !== void 0
        }, {
          tracked: true,
          initialized: true,
          session: session.toString(),
          channel: chatUri.toString(),
          kind: "create",
          backing: { sdkSessionId: captured.sessionId, model: { id: "gpt-x" } },
          providerData: { sdkSessionId: captured.sessionId, model: { id: "gpt-x" } },
          legacyCatalogWritten: false
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("createChat is a no-op for the default chat URI", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "create-default");
        const internals = agent;
        internals._createAgentSession = () => {
          throw new Error("_createAgentSession must not be called for the default chat");
        };
        await agent.chats.createChat(URI.parse(buildDefaultChatUri(session)), {});
        assert.deepStrictEqual({
          tracked: peerChatCount(agent)
        }, {
          tracked: 0
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("createChat forks the source chat into a new peer chat and returns the forked chat providerData", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "fork-peer");
        await agent.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        const internals = agent;
        const source = makeFakeChatSession(session, "source-sdk");
        setDefaultSessionStub(agent, AgentSession.id(session), source.fake);
        let forkArgs;
        internals._forkSdkChat = async (_client, sourceEntry, turnId) => {
          forkArgs = { sourceEntry, turnId };
          return { sessionId: "forked-sdk-id", inheritedTurnCount: 0 };
        };
        let captured;
        internals._createAgentSession = (launchPlan) => {
          captured = launchPlan;
          return makeFakeChatSession(session, launchPlan.sessionId, void 0, launchPlan.shellManager).fake;
        };
        const chatUri = URI.parse(buildChatUri(session, "peer-fork"));
        const result = await agent.chats.fork(chatUri, { source: URI.parse(buildDefaultChatUri(session)), turnId: "t1" });
        const db = sessionDataService.openDatabase(session);
        const raw = await db.object.getMetadata("copilot.chats");
        assert.deepStrictEqual({
          sourceIsDefaultSession: forkArgs?.sourceEntry === source.fake,
          forkedTurnId: forkArgs?.turnId,
          launchKind: captured?.kind,
          launchSessionId: captured?.sessionId,
          tracked: hasPeerChatStub(agent, chatUri),
          backing: internals._chatBackings.get(chatUri.toString()),
          providerData: result ? JSON.parse(result.providerData) : void 0,
          legacyCatalogWritten: raw !== void 0
        }, {
          sourceIsDefaultSession: true,
          forkedTurnId: "t1",
          launchKind: "resume",
          launchSessionId: "forked-sdk-id",
          tracked: true,
          backing: { sdkSessionId: "forked-sdk-id" },
          providerData: { sdkSessionId: "forked-sdk-id" },
          legacyCatalogWritten: false
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("createChat side chat forks hidden context and filters inherited turns", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "side-peer");
        await agent.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        const sourceTurn = {
          id: "t1",
          state: TurnState.Complete,
          message: { text: "source", origin: { kind: MessageKind.User } },
          responseParts: [],
          usage: void 0
        };
        const partialResponse = "partial source answer";
        const sourceContext = "User request:\nsource\n\nAgent response:\nsource answer\n\n---\n\nUser request:\nactive source";
        const injectedPrompt = injectSideChatContext("side", partialResponse, sourceContext);
        const sideTurn = {
          id: "t2",
          state: TurnState.Complete,
          message: { text: injectedPrompt, origin: { kind: MessageKind.User } },
          responseParts: [],
          usage: void 0
        };
        const source = makeFakeChatSession(session, "source-sdk", async () => [sourceTurn]);
        setDefaultSessionStub(agent, AgentSession.id(session), source.fake);
        const internals = agent;
        internals._forkSdkChat = async () => ({ sessionId: "side-sdk-id", inheritedTurnCount: 1 });
        let messageReadCount = 0;
        let sideRecorder;
        internals._createAgentSession = (launchPlan) => {
          const side = makeFakeChatSession(session, launchPlan.sessionId, async () => {
            messageReadCount++;
            return messageReadCount <= 2 ? [sourceTurn] : [sourceTurn, sideTurn];
          }, launchPlan.shellManager);
          sideRecorder = side.rec;
          return side.fake;
        };
        const chatUri = URI.parse(buildChatUri(session, "peer-side"));
        const sourceLockEntered = new DeferredPromise();
        const releaseSourceLock = new DeferredPromise();
        const sourceLock = internals._sessionSequencer.queue(AgentSession.id(session), async () => {
          sourceLockEntered.complete();
          await releaseSourceLock.p;
        });
        await sourceLockEntered.p;
        let result;
        const createTimeout = timeout(5e3);
        try {
          result = await Promise.race([
            agent.chats.createChat(chatUri, { sideChat: { source: URI.parse(buildDefaultChatUri(session)), turnId: "active-turn", sourceContext, partialResponse } }),
            createTimeout.then(() => {
              throw new Error("Side chat creation waited for the source turn lock");
            })
          ]);
        } finally {
          createTimeout.cancel();
          releaseSourceLock.complete();
          await sourceLock;
        }
        await agent.chats.sendMessage(chatUri, "side", void 0, void 0, "t2");
        await agent.chats.sendMessage(chatUri, "follow-up", void 0, void 0, "t3");
        await agent.chats.changeModel(chatUri, { id: "gpt-y" });
        const turns = await agent.chats.getMessages(chatUri);
        assert.deepStrictEqual({
          hasExplanationGuidance: sideRecorder?.sends[0]?.prompt.includes("Prefer explanation over action"),
          sentPrompts: sideRecorder?.sends.map((send) => send.prompt),
          turns: turns.map((turn) => turn.id),
          visiblePrompt: turns[0]?.message.text,
          sideChat: result ? JSON.parse(result.providerData).sideChat : void 0
        }, {
          hasExplanationGuidance: true,
          sentPrompts: [injectedPrompt, "follow-up"],
          turns: ["t2"],
          visiblePrompt: "side",
          sideChat: { source: buildDefaultChatUri(session), turnId: "active-turn", inheritedTurnCount: 1, context: sourceContext, partialResponse }
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("createChat side chat preserves a local source turn id while forking from the concrete provider anchor", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "side-local-peer");
        await agent.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        const sourceTurn = {
          id: "t1",
          state: TurnState.Complete,
          message: { text: "source", origin: { kind: MessageKind.User } },
          responseParts: [],
          usage: void 0
        };
        const sourceContext = "User request:\nsource\n\nAgent response:\nsource answer\n\n---\n\nUser request:\n!command";
        const injectedPrompt = injectSideChatContext("side", void 0, sourceContext);
        const sideTurn = {
          id: "t2",
          state: TurnState.Complete,
          message: { text: injectedPrompt, origin: { kind: MessageKind.User } },
          responseParts: [],
          usage: void 0
        };
        const source = makeFakeChatSession(session, "source-sdk", async () => [sourceTurn]);
        setDefaultSessionStub(agent, AgentSession.id(session), source.fake);
        const internals = agent;
        let forkTurnId;
        internals._forkSdkChat = async (_client, _sourceEntry, turnId) => {
          forkTurnId = turnId;
          return { sessionId: "side-sdk-id", inheritedTurnCount: 1 };
        };
        let messageReadCount = 0;
        let sideRecorder;
        internals._createAgentSession = (launchPlan) => {
          const side = makeFakeChatSession(session, launchPlan.sessionId, async () => {
            messageReadCount++;
            return messageReadCount <= 2 ? [sourceTurn] : [sourceTurn, sideTurn];
          }, launchPlan.shellManager);
          sideRecorder = side.rec;
          return side.fake;
        };
        const chatUri = URI.parse(buildChatUri(session, "peer-side-local"));
        const result = await agent.chats.createChat(chatUri, {
          sideChat: {
            source: URI.parse(buildDefaultChatUri(session)),
            turnId: "local-1",
            providerAnchorTurnId: "t1",
            sourceContext
          }
        });
        await agent.chats.sendMessage(chatUri, "side", void 0, void 0, "t2");
        await agent.chats.sendMessage(chatUri, "follow-up", void 0, void 0, "t3");
        const turns = await agent.chats.getMessages(chatUri);
        assert.deepStrictEqual({
          forkTurnId,
          sentPrompts: sideRecorder?.sends.map((send) => send.prompt),
          turns: turns.map((turn) => turn.id),
          visiblePrompt: turns[0]?.message.text,
          sideChat: result ? JSON.parse(result.providerData).sideChat : void 0
        }, {
          forkTurnId: "t1",
          sentPrompts: [injectedPrompt, "follow-up"],
          turns: ["t2"],
          visiblePrompt: "side",
          sideChat: {
            source: buildDefaultChatUri(session),
            turnId: "local-1",
            providerAnchorTurnId: "t1",
            inheritedTurnCount: 1,
            context: sourceContext
          }
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("sendMessage routes a turn to the targeted peer chat only", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "route-msg");
        const chatA = URI.parse(buildChatUri(session, "peer-a"));
        const chatB = URI.parse(buildChatUri(session, "peer-b"));
        const a = makeFakeChatSession(session, "sdk-a");
        const b = makeFakeChatSession(session, "sdk-b");
        setPeerChatStub(agent, chatA, a.fake);
        setPeerChatStub(agent, chatB, b.fake);
        await agent.chats.sendMessage(chatA, "hello-a", void 0, void 0, "turn-a", "client-1");
        assert.deepStrictEqual({
          aSends: a.rec.sends.map((s) => ({ prompt: s.prompt, turnId: s.turnId, senderClientId: s.senderClientId })),
          aResets: a.rec.resets,
          bSends: b.rec.sends,
          bResets: b.rec.resets
        }, {
          aSends: [{ prompt: "hello-a", turnId: "turn-a", senderClientId: "client-1" }],
          aResets: [{ turnId: "turn-a", senderClientId: "client-1" }],
          bSends: [],
          bResets: []
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("sendMessage throws for a peer chat with no backing chat", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "route-ghost");
        const chatUri = URI.parse(buildChatUri(session, "ghost"));
        await assert.rejects(
          () => agent.chats.sendMessage(chatUri, "hi", void 0),
          /unknown chat/
        );
      } finally {
        await disposeAgent(agent);
      }
    });
    test("changeModel applies to the targeted peer chat only", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "model-route");
        const chatA = URI.parse(buildChatUri(session, "peer-a"));
        const chatB = URI.parse(buildChatUri(session, "peer-b"));
        const a = makeFakeChatSession(session, "sdk-a");
        const b = makeFakeChatSession(session, "sdk-b");
        setPeerChatStub(agent, chatA, a.fake);
        setPeerChatStub(agent, chatB, b.fake);
        await agent.chats.changeModel(chatA, { id: "model-x" });
        assert.deepStrictEqual({
          aModels: a.rec.modelCalls.map((m) => m.id),
          bModels: b.rec.modelCalls.map((m) => m.id)
        }, {
          aModels: ["model-x"],
          bModels: []
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("changeAgent resolves and applies the agent to the targeted peer chat, and clears it with undefined", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "agent-route");
        const chatA = URI.parse(buildChatUri(session, "peer-a"));
        const a = makeFakeChatSession(session, "sdk-a");
        const internals = agent;
        setPeerChatStub(agent, chatA, a.fake);
        internals._resolveAgentName = (_snapshot, selection) => selection.uri === "agent://x" ? "Resolved Agent" : void 0;
        await agent.chats.changeAgent(chatA, { uri: "agent://x" });
        await agent.chats.changeAgent(chatA, void 0);
        assert.deepStrictEqual(a.rec.agentCalls, ["Resolved Agent", void 0]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("round-trips peer chats through providerData + materializeChat and resumes per-chat history after a restart", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const session = AgentSession.uri("copilotcli", "restore-rt");
      const created = {};
      const providerData = {};
      const agent1 = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent1.authenticate("https://api.github.com", "token");
        await agent1.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        const internals1 = agent1;
        internals1._createAgentSession = (launchPlan, _dir, _ac, identity) => {
          if (identity) {
            created[identity.chatChannelUri.authority] = launchPlan.sessionId;
          }
          return makeFakeChatSession(session, launchPlan.sessionId, void 0, launchPlan.shellManager).fake;
        };
        const peerAUri = URI.parse(buildChatUri(session, "peer-a"));
        const peerBUri = URI.parse(buildChatUri(session, "peer-b"));
        const resA = await agent1.chats.createChat(peerAUri, {});
        const resB = await agent1.chats.createChat(peerBUri, {});
        providerData["peer-a"] = resA.providerData;
        providerData["peer-b"] = resB.providerData;
      } finally {
        await disposeAgent(agent1);
      }
      const agent2 = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent2.authenticate("https://api.github.com", "token");
        await agent2.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        const internals2 = agent2;
        const peerA = URI.parse(buildChatUri(session, "peer-a"));
        const peerB = URI.parse(buildChatUri(session, "peer-b"));
        await agent2.materializeChat(peerA, providerData["peer-a"]);
        await agent2.materializeChat(peerB, providerData["peer-b"]);
        const peerAHistory = [{ id: "turn-1" }];
        let resumed;
        internals2._createAgentSession = (launchPlan) => {
          resumed = launchPlan;
          return makeFakeChatSession(session, launchPlan.sessionId, async () => peerAHistory, launchPlan.shellManager).fake;
        };
        await agent2.chats.sendMessage(peerA, "after restart", void 0);
        const history = await getPeerChatStub(agent2, peerA).getMessages();
        assert.deepStrictEqual({
          materializedBackings: [internals2._chatBackings.get(peerA.toString()), internals2._chatBackings.get(peerB.toString())],
          resumeKind: resumed?.kind,
          resumeSessionId: resumed?.sessionId,
          expectedSessionId: created["peer-a"],
          historyLen: history.length,
          tracked: hasPeerChatStub(agent2, peerA)
        }, {
          materializedBackings: [{ sdkSessionId: created["peer-a"] }, { sdkSessionId: created["peer-b"] }],
          resumeKind: "resume",
          resumeSessionId: created["peer-a"],
          expectedSessionId: created["peer-a"],
          historyLen: 1,
          tracked: true
        });
      } finally {
        await disposeAgent(agent2);
      }
    });
    test("materializeChat falls back to the legacy copilot.chats catalog when providerData is undefined", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "legacy-materialize");
        const db = sessionDataService.openDatabase(session);
        await db.object.setMetadata("copilot.chats", JSON.stringify({
          "peer-a": { sdkSessionId: "legacy-sdk", model: { id: "gpt-legacy" } }
        }));
        const chatUri = URI.parse(buildChatUri(session, "peer-a"));
        const internals = agent;
        await agent.materializeChat(chatUri, void 0);
        const corruptUri = URI.parse(buildChatUri(session, "peer-corrupt"));
        await agent.materializeChat(corruptUri, "not json");
        assert.deepStrictEqual({
          legacy: internals._chatBackings.get(chatUri.toString()),
          corrupt: internals._chatBackings.has(corruptUri.toString())
        }, {
          legacy: { sdkSessionId: "legacy-sdk", model: { id: "gpt-legacy" } },
          corrupt: false
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("changeModel on a peer chat refreshes its backing and fires onDidChangeChatData", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "model-blob");
        const chatUri = URI.parse(buildChatUri(session, "peer-a"));
        const internals = agent;
        setPeerChatStub(agent, chatUri, makeFakeChatSession(session, "sdk-a").fake);
        internals._chatBackings.set(chatUri.toString(), { sdkSessionId: "sdk-a" });
        const events = [];
        disposables.add(agent.onDidChangeChatData((e) => events.push({ chat: e.chat.toString(), providerData: JSON.parse(e.providerData) })));
        await agent.chats.changeModel(chatUri, { id: "model-x" });
        assert.deepStrictEqual({
          backing: internals._chatBackings.get(chatUri.toString()),
          events
        }, {
          backing: { sdkSessionId: "sdk-a", model: { id: "model-x" } },
          events: [{ chat: chatUri.toString(), providerData: { sdkSessionId: "sdk-a", model: { id: "model-x" } } }]
        });
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  suite("chat surface (IAgentChats)", () => {
    function installFake(agent, key, target, sessionUri) {
      const rec = { sends: [], resets: [], modelCalls: [], agentCalls: [], aborted: 0, disposed: false };
      const fake = {
        sessionUri,
        sessionId: `sdk-${key}`,
        appliedSnapshot: { tools: [], plugins: [], mcpServers: {} },
        async send(prompt, _attachments, turnId, _mode, senderClientId) {
          rec.sends.push({ prompt, turnId, senderClientId });
        },
        resetTurnState(turnId, senderClientId) {
          rec.resets.push({ turnId, senderClientId });
        },
        async setModel(id) {
          rec.modelCalls.push(id);
        },
        async setAgent(name) {
          rec.agentCalls.push(name);
        },
        async abort() {
          rec.aborted++;
        },
        async getMessages() {
          return [{ id: `turn-${key}` }];
        },
        handleClientToolCallComplete() {
        },
        dispose() {
          rec.disposed = true;
        }
      };
      if (target === "chat") {
        setPeerChatStub(agent, URI.parse(key), fake);
      } else {
        setDefaultSessionStub(agent, key, fake);
      }
      return rec;
    }
    function stubBackingSession(agent) {
      agent._createAgentSession = (launchPlan, _dir, _ac, identity) => {
        return {
          sessionUri: identity?.sessionUri ?? AgentSession.uri("copilotcli", launchPlan.sessionId),
          sessionId: launchPlan.sessionId,
          appliedSnapshot: { tools: [], plugins: [], mcpServers: {} },
          async initializeSession() {
          },
          async remapTurnIds() {
          },
          async getMessages() {
            return [];
          },
          handleClientToolCallComplete() {
          },
          dispose() {
            launchPlan.shellManager?.dispose();
          }
        };
      };
    }
    test("createSession mints a provisional session", async () => {
      const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
      try {
        const session = AgentSession.uri("copilotcli", "scope-create");
        const result = await agent.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        const internals = agent;
        assert.deepStrictEqual({
          session: result.session.toString(),
          provisional: internals._provisionalSessions.has(AgentSession.id(session))
        }, {
          session: session.toString(),
          provisional: true
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("disposeSession tears down a provisional session", async () => {
      const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
      try {
        const session = AgentSession.uri("copilotcli", "scope-dispose");
        await agent.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        const internals = agent;
        assert.strictEqual(internals._provisionalSessions.has(AgentSession.id(session)), true);
        await agent.disposeSession(session);
        assert.strictEqual(internals._provisionalSessions.has(AgentSession.id(session)), false);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("createChat creates a peer chat and returns its providerData", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "conv-create");
        await agent.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        const chatUri = URI.parse(buildChatUri(session, "peer-a"));
        stubBackingSession(agent);
        const result = await agent.chats.createChat(chatUri, { model: { id: "gpt-x" } });
        assert.deepStrictEqual({
          tracked: hasPeerChatStub(agent, chatUri),
          hasProviderData: !!(result && result.providerData),
          model: result ? JSON.parse(result.providerData).model : void 0
        }, {
          tracked: true,
          hasProviderData: true,
          model: { id: "gpt-x" }
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("fork delegates to createChat with the fork source", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([]) });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "conv-fork");
        await agent.createSession({ session, workingDirectories: [URI.file("/workspace")] });
        installFake(agent, AgentSession.id(session), "session", session);
        const forkArgs = [];
        agent._forkSdkChat = async (_c, _s, turnId) => {
          forkArgs.push({ turnId });
          return { sessionId: "forked-sdk-id", inheritedTurnCount: 0 };
        };
        stubBackingSession(agent);
        const chatUri = URI.parse(buildChatUri(session, "peer-fork"));
        const source = { source: URI.parse(buildDefaultChatUri(session)), turnId: "t1" };
        const result = await agent.chats.fork(chatUri, source);
        assert.deepStrictEqual({
          forkArgs,
          tracked: hasPeerChatStub(agent, chatUri),
          providerData: result ? JSON.parse(result.providerData) : void 0
        }, {
          forkArgs: [{ turnId: "t1" }],
          tracked: true,
          providerData: { sdkSessionId: "forked-sdk-id" }
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("sendMessage routes a peer chat URI to the peer chat", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "conv-send-peer");
        const chatUri = URI.parse(buildChatUri(session, "peer-a"));
        const rec = installFake(agent, chatUri.toString(), "chat", session);
        await agent.chats.sendMessage(chatUri, "hello-peer", void 0, void 0, "turn-1", "client-1");
        assert.deepStrictEqual({
          sends: rec.sends,
          resets: rec.resets
        }, {
          sends: [{ prompt: "hello-peer", turnId: "turn-1", senderClientId: "client-1" }],
          resets: [{ turnId: "turn-1", senderClientId: "client-1" }]
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("sendMessage routes a scope (session) URI to the default chat", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "conv-send-default");
        const rec = installFake(agent, AgentSession.id(session), "session", session);
        await agent.chats.sendMessage(defaultChatUri(session), "hello-default", void 0, void 0, "turn-d", "client-d");
        assert.deepStrictEqual(rec.sends, [{ prompt: "hello-default", turnId: "turn-d", senderClientId: "client-d" }]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("abort, changeModel, and changeAgent route a peer URI to the peer chat", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "conv-ops");
        const chatUri = URI.parse(buildChatUri(session, "peer-a"));
        const rec = installFake(agent, chatUri.toString(), "chat", session);
        agent._resolveAgentName = (_snap, sel) => sel.uri === "agent://x" ? "Resolved Agent" : void 0;
        await agent.chats.abort(chatUri);
        await agent.chats.changeModel(chatUri, { id: "model-x" });
        await agent.chats.changeAgent(chatUri, { uri: "agent://x" });
        await agent.chats.changeAgent(chatUri, void 0);
        assert.deepStrictEqual({
          aborted: rec.aborted,
          modelCalls: rec.modelCalls,
          agentCalls: rec.agentCalls
        }, {
          aborted: 1,
          modelCalls: ["model-x"],
          agentCalls: ["Resolved Agent", void 0]
        });
      } finally {
        await disposeAgent(agent);
      }
    });
    test("getMessages returns the peer chat history", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "conv-history");
        const chatUri = URI.parse(buildChatUri(session, "peer-a"));
        installFake(agent, chatUri.toString(), "chat", session);
        const turns = await agent.chats.getMessages(chatUri);
        assert.deepStrictEqual(turns.map((t) => t.id), [`turn-${chatUri.toString()}`]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("disposeChat disposes the peer chat", async () => {
      const sessionDataService = disposables.add(new TestSessionDataService());
      const client = new TestCopilotClient([]);
      const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const session = AgentSession.uri("copilotcli", "conv-dispose");
        const chatUri = URI.parse(buildChatUri(session, "peer-a"));
        const rec = installFake(agent, chatUri.toString(), "chat", session);
        await agent.chats.disposeChat(chatUri);
        assert.deepStrictEqual({
          disposed: rec.disposed,
          tracked: hasPeerChatStub(agent, chatUri),
          deleted: client.deletedSessionIds
        }, {
          disposed: true,
          tracked: false,
          deleted: ["sdk-" + chatUri.toString()]
        });
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  suite("client tool refresh on reload (#319516)", () => {
    function getActiveClient(agent, session) {
      const activeClients = agent._activeClients;
      const activeClient = activeClients.get(session);
      assert.ok(activeClient, "expected an ActiveClient to exist after registering client tools");
      return activeClient;
    }
    const tools = [{ name: "my_tool", description: "A test tool", inputSchema: { type: "object", properties: {} } }];
    test("clientId-only change (reload) does NOT require a restart and updates the live owner", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "reload-session");
        agent.getOrCreateActiveClient(session, { clientId: "client-A" }).tools = tools;
        const activeClient = getActiveClient(agent, session);
        const appliedSnapshot = await activeClient.snapshot();
        assert.strictEqual(activeClient.toolSet.ownerOf("my_tool"), "client-A");
        agent.removeActiveClient(session, "client-A");
        agent.getOrCreateActiveClient(session, { clientId: "client-B" }).tools = [...tools];
        assert.strictEqual(await activeClient.requiresRestart(appliedSnapshot), false);
        assert.strictEqual(activeClient.toolSet.ownerOf("my_tool"), "client-B");
      } finally {
        await disposeAgent(agent);
      }
    });
    test("a structural tool change still requires a restart", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "tools-change-session");
        agent.getOrCreateActiveClient(session, { clientId: "client-A" }).tools = tools;
        const activeClient = getActiveClient(agent, session);
        const appliedSnapshot = await activeClient.snapshot();
        agent.getOrCreateActiveClient(session, { clientId: "client-A" }).tools = [...tools, { name: "second_tool", description: "another", inputSchema: { type: "object", properties: {} } }];
        assert.strictEqual(await activeClient.requiresRestart(appliedSnapshot), true);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("multiple active clients merge their tools and removal isolates per client", async () => {
      const agent = createTestAgent(disposables);
      try {
        const session = AgentSession.uri("copilotcli", "multi-client-session");
        agent.getOrCreateActiveClient(session, { clientId: "client-A" }).tools = [
          { name: "shared", description: "from A", inputSchema: { type: "object", properties: {} } },
          { name: "a_tool", description: "A only", inputSchema: { type: "object", properties: {} } }
        ];
        agent.getOrCreateActiveClient(session, { clientId: "client-B" }).tools = [
          { name: "shared", description: "from B", inputSchema: { type: "object", properties: {} } },
          { name: "b_tool", description: "B only", inputSchema: { type: "object", properties: {} } }
        ];
        const activeClient = getActiveClient(agent, session);
        const merged = await activeClient.snapshot();
        assert.deepStrictEqual(merged.tools.map((t) => t.name), ["shared", "a_tool", "b_tool"]);
        assert.strictEqual(activeClient.toolSet.ownerOf("shared"), "client-A");
        assert.strictEqual(activeClient.toolSet.ownerOf("a_tool"), "client-A");
        assert.strictEqual(activeClient.toolSet.ownerOf("b_tool"), "client-B");
        agent.removeActiveClient(session, "client-A");
        const afterRemoval = await activeClient.snapshot();
        assert.deepStrictEqual(afterRemoval.tools.map((t) => t.name), ["shared", "b_tool"]);
        assert.strictEqual(activeClient.toolSet.ownerOf("shared"), "client-B");
        assert.strictEqual(activeClient.toolSet.ownerOf("a_tool"), void 0);
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  suite("config-driven session refresh", () => {
    test("waits for the previous SDK session to disconnect before resuming", async () => {
      const client = new TestCopilotClient([]);
      const agent = createTestAgent(disposables, { copilotClient: client });
      const sessionId = "config-refresh-session";
      const session = AgentSession.uri("copilotcli", sessionId);
      const disconnectStarted = new DeferredPromise();
      const allowDisconnect = new DeferredPromise();
      const order = [];
      const previousSession = {
        appliedSnapshot: { tools: [], plugins: [], mcpServers: {} },
        destroySession: async () => {
          order.push("disconnect-started");
          disconnectStarted.complete();
          await allowDisconnect.p;
          order.push("disconnect-finished");
        },
        dispose: () => order.push("previous-disposed")
      };
      const resumedSession = {
        send: async () => {
          order.push("send");
        },
        dispose: () => {
        }
      };
      const internals = agent;
      setDefaultSessionStub(agent, sessionId, previousSession);
      agent.getOrCreateActiveClient(session, { clientId: "client" }).tools = [
        { name: "new_tool", description: "A newly registered tool", inputSchema: { type: "object", properties: {} } }
      ];
      internals._resumeSession = async (id) => {
        assert.strictEqual(id, sessionId);
        order.push("resume");
        setDefaultSessionStub(agent, sessionId, resumedSession);
        return resumedSession;
      };
      try {
        const send = agent.chats.sendMessage(defaultChatUri(session), "hello", void 0);
        await disconnectStarted.p;
        assert.deepStrictEqual(order, ["disconnect-started"]);
        allowDisconnect.complete();
        await send;
        assert.deepStrictEqual(order, [
          "disconnect-started",
          "disconnect-finished",
          "previous-disposed",
          "resume",
          "send"
        ]);
      } finally {
        allowDisconnect.complete();
        await disposeAgent(agent);
      }
    });
  });
  suite("_resumeSession dedup", () => {
    const makeFakeSession = () => ({ dispose: () => {
    } });
    test("dedupes concurrent calls for the same sessionId", async () => {
      const agent = createTestAgent(disposables);
      const internals = agent;
      const deferred = new DeferredPromise();
      let doResumeCalls = 0;
      internals._doResumeSession = () => {
        doResumeCalls++;
        return deferred.p;
      };
      try {
        const p1 = internals._resumeSession("s1");
        const p2 = internals._resumeSession("s1");
        assert.strictEqual(p1, p2);
        assert.strictEqual(doResumeCalls, 1);
        const session = makeFakeSession();
        deferred.complete(session);
        assert.strictEqual(await p1, session);
        assert.strictEqual(await p2, session);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("clears inflight entry after resolution so the next call re-invokes _doResumeSession", async () => {
      const agent = createTestAgent(disposables);
      const internals = agent;
      let doResumeCalls = 0;
      internals._doResumeSession = async () => {
        doResumeCalls++;
        return makeFakeSession();
      };
      try {
        await internals._resumeSession("s1");
        await internals._resumeSession("s1");
        assert.strictEqual(doResumeCalls, 2);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("clears inflight entry on rejection so the next call retries", async () => {
      const agent = createTestAgent(disposables);
      const internals = agent;
      let attempt = 0;
      internals._doResumeSession = async () => {
        attempt++;
        if (attempt === 1) {
          throw new Error("first failed");
        }
        return makeFakeSession();
      };
      try {
        await assert.rejects(() => internals._resumeSession("s1"), /first failed/);
        await internals._resumeSession("s1");
        assert.strictEqual(attempt, 2);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("does not dedupe across different sessionIds", async () => {
      const agent = createTestAgent(disposables);
      const internals = agent;
      const ids = [];
      internals._doResumeSession = async (id) => {
        ids.push(id);
        return makeFakeSession();
      };
      try {
        await Promise.all([
          internals._resumeSession("s1"),
          internals._resumeSession("s2")
        ]);
        assert.deepStrictEqual([...ids].sort(), ["s1", "s2"]);
      } finally {
        await disposeAgent(agent);
      }
    });
    test("post-init shutdown race: disposes the session and throws CancellationError instead of registering on a disposed _sessions map", async () => {
      const agent = createTestAgent(disposables);
      const internals = agent;
      let disposed = 0;
      const fakeSession = { dispose: () => {
        disposed++;
      } };
      internals._shutdownPromise = Promise.resolve();
      try {
        assert.throws(
          () => internals._registerInitializedSession("s1", fakeSession),
          (err) => isCancellationError(err)
        );
        assert.strictEqual(disposed, 1, "session should be disposed by the guard");
      } finally {
        internals._shutdownPromise = void 0;
        await disposeAgent(agent);
      }
    });
    test("shutdown during resume cancels the in-flight resume", async () => {
      const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/resume-telemetry-shutdown-`);
      const client = new TestCopilotClient([sdkSession("s1", workingDirectory)]);
      const deferredSession = new DeferredPromise();
      let resumeCalled = false;
      client.resumeSession = () => {
        resumeCalled = true;
        return deferredSession.p;
      };
      const agent = createTestAgent(disposables, {
        copilotClient: client,
        useRealResumePath: true,
        sessionDataService: disposables.add(new TestSessionDataService())
      });
      const internals = agent;
      try {
        await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "token");
        const resumePromise = internals._resumeSession("s1");
        for (let i = 0; i < 200 && !resumeCalled; i++) {
          await timeout(0);
        }
        assert.strictEqual(resumeCalled, true);
        await agent.shutdown();
        deferredSession.complete(new MockCopilotSession());
        await assert.rejects(resumePromise, (error) => isCancellationError(error));
      } finally {
        await fs.rm(workingDirectory, { recursive: true, force: true });
        await disposeAgent(agent);
      }
    });
  });
  suite("_resumeSession fallback", () => {
    test("does not restore a persisted custom agent that is absent from the current plugin snapshot", async () => {
      const workingDirectory = await fs.mkdtemp(`${os.tmpdir()}/resume-agent-`);
      const sessionDataService = disposables.add(new TestSessionDataService());
      const session = AgentSession.uri("copilotcli", "s1");
      const dbRef = sessionDataService.openDatabase(session);
      try {
        await dbRef.object.setMetadata("copilot.workingDirectory", URI.file(workingDirectory).toString());
        await dbRef.object.setMetadata("copilot.agent", JSON.stringify({ uri: "file:///old-client/data.md" }));
      } finally {
        dbRef.dispose();
      }
      const client = new TestCopilotClient([sdkSession("s1", workingDirectory)]);
      const resumeAgents = [];
      client.resumeSession = async (_sessionId, options) => {
        resumeAgents.push(options?.agent);
        return new MockCopilotSession();
      };
      const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService });
      const internals = agent;
      try {
        await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "token");
        await internals._resumeSession("s1");
        assert.deepStrictEqual(resumeAgents, [void 0]);
      } finally {
        await fs.rm(workingDirectory, { recursive: true, force: true });
        await disposeAgent(agent);
      }
    });
    test("retries resume without a custom agent when the SDK reports the stored agent is missing", async () => {
      const fileService = disposables.add(new FileService(new NullLogService()));
      disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
      const repo = URI.from({ scheme: Schemas.inMemory, path: "/repo" });
      const dataAgent = URI.joinPath(repo, ".github", "agents", "data.md");
      await fileService.writeFile(dataAgent, VSBuffer.fromString("---\nname: Data\ndescription: data queries\n---\nbody"));
      const sessionDataService = disposables.add(new TestSessionDataService());
      const session = AgentSession.uri("copilotcli", "s1");
      const dbRef = sessionDataService.openDatabase(session);
      try {
        await dbRef.object.setMetadata("copilot.workingDirectory", repo.toString());
        await dbRef.object.setMetadata("copilot.agent", JSON.stringify({ uri: dataAgent.toString() }));
      } finally {
        dbRef.dispose();
      }
      const client = new TestCopilotClient([sdkSession("s1")]);
      const resumeAgents = [];
      client.resumeSession = async (_sessionId, options) => {
        resumeAgents.push(options?.agent);
        if (resumeAgents.length === 1) {
          throw new TestSdkError(`Request session.resume failed with message: Custom agent 'Data' not found`, -32603);
        }
        return new MockCopilotSession();
      };
      client.createSession = async () => {
        throw new Error("createSession should not be called");
      };
      const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService, fileService });
      const internals = agent;
      try {
        await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, "token");
        await internals._resumeSession("s1");
        assert.deepStrictEqual(resumeAgents, ["Data", void 0]);
      } finally {
        await disposeAgent(agent);
      }
    });
  });
  suite("customization anchoring", () => {
    test("rebaseUnder rebases paths under the source dir and leaves others untouched", () => {
      const original = URI.file("/Users/me/src/vscode");
      const worktree = URI.file("/Users/me/src/vscode.worktrees/agents-x");
      assert.strictEqual(
        rebaseUnder(URI.file("/Users/me/src/vscode/.github/skills/sessions"), original, worktree)?.toString(),
        URI.file("/Users/me/src/vscode.worktrees/agents-x/.github/skills/sessions").toString(),
        "a path under the source dir is rebased onto the target dir"
      );
      assert.strictEqual(
        rebaseUnder(original, original, worktree)?.toString(),
        worktree.toString(),
        "the source dir itself maps to the target dir"
      );
      assert.strictEqual(
        rebaseUnder(URI.file("/Users/me/.copilot/skills/foo"), original, worktree),
        void 0,
        "a path outside the source dir (e.g. user home) is not rebased"
      );
    });
    let tmpDir;
    setup(async () => {
      tmpDir = await fs.mkdtemp(`${os.tmpdir()}/copilot-agent-anchor-test-`);
    });
    teardown(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
    async function materializeAndCaptureAnchor(resolvedWorkingDirectory) {
      const originalFolder = URI.joinPath(URI.file(tmpDir), "repo");
      await fs.mkdir(originalFolder.fsPath, { recursive: true });
      const client = new TestCopilotClient([]);
      let sdkWorkingDirectory;
      client.createSession = async (config) => {
        sdkWorkingDirectory = config.workingDirectory;
        return new MockCopilotSession();
      };
      const agent = createTestAgent(disposables, {
        sessionDataService: disposables.add(new TestSessionDataService()),
        copilotClient: client
      });
      let anchor;
      const agentInternals = agent;
      const originalCreateAgentSession = agentInternals._createAgentSession;
      agentInternals._createAgentSession = (launchPlan, customizationDirectory, activeClient, identity) => {
        anchor = customizationDirectory;
        return originalCreateAgentSession.call(agent, launchPlan, customizationDirectory, activeClient, identity);
      };
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({ session: AgentSession.uri("copilotcli", "anchor-session"), workingDirectories: [originalFolder] });
        assert.strictEqual(result.provisional, true);
        await agent.chats.sendMessage(defaultChatUri(result.session), "hello", resolvedWorkingDirectory ? [resolvedWorkingDirectory] : void 0, void 0, void 0, void 0);
      } finally {
        await disposeAgent(agent);
      }
      return { anchor, sdkWorkingDirectory, originalFolder };
    }
    test("materialization re-anchors customization discovery to the resolved worktree", async () => {
      const worktree = URI.joinPath(URI.file(tmpDir), "repo.worktrees", "agents-x");
      const { anchor, sdkWorkingDirectory, originalFolder } = await materializeAndCaptureAnchor(worktree);
      assert.strictEqual(anchor?.toString(), worktree.toString(), "customization discovery must be anchored to the worktree, not the original folder");
      assert.notStrictEqual(anchor?.toString(), originalFolder.toString(), "the anchor must move off the original folder");
      assert.strictEqual(sdkWorkingDirectory, worktree.fsPath, "the SDK working directory must be the worktree");
    });
    test("materialization without a worktree keeps the anchor on the original folder", async () => {
      const originalFolder = URI.joinPath(URI.file(tmpDir), "repo");
      const { anchor } = await materializeAndCaptureAnchor(void 0);
      assert.strictEqual(anchor?.toString(), originalFolder.toString(), "the anchor stays on the original folder when no worktree is created");
    });
    test("worktree skill/instruction directories sent to the SDK resolve inside the worktree", async () => {
      const fileService = disposables.add(new FileService(new NullLogService()));
      disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
      const originalFolder = URI.from({ scheme: Schemas.inMemory, path: "/orig" });
      const worktree = URI.from({ scheme: Schemas.inMemory, path: "/wt" });
      await fileService.writeFile(URI.joinPath(originalFolder, ".github", "skills", "orig-skill", "SKILL.md"), VSBuffer.fromString("---\nname: orig-skill\ndescription: from the original repo\n---\nbody"));
      await fileService.writeFile(URI.joinPath(worktree, ".github", "skills", "wt-skill", "SKILL.md"), VSBuffer.fromString("---\nname: wt-skill\ndescription: from the worktree\n---\nbody"));
      await fileService.writeFile(URI.joinPath(worktree, ".github", "instructions", "wt.instructions.md"), VSBuffer.fromString('---\napplyTo: "**/*.ts"\ndescription: worktree instruction\n---\nbody'));
      const client = new TestCopilotClient([]);
      let capturedConfig;
      client.createSession = async (config) => {
        capturedConfig = config;
        return new MockCopilotSession();
      };
      const { agent } = createTestAgentContext(disposables, {
        sessionDataService: disposables.add(new TestSessionDataService()),
        copilotClient: client,
        fileService
      });
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "wt-dirs-session"),
          workingDirectories: [originalFolder],
          activeClient: { clientId: "c1", tools: [] }
        });
        assert.strictEqual(result.provisional, true);
        await agent.chats.sendMessage(defaultChatUri(result.session), "hello", [worktree], void 0, void 0, void 0);
      } finally {
        await disposeAgent(agent);
      }
      assert.ok(capturedConfig, "the SDK createSession must run during materialization");
      assert.deepStrictEqual(
        {
          workingDirectory: capturedConfig.workingDirectory,
          skillDirectories: capturedConfig.skillDirectories,
          instructionDirectories: capturedConfig.instructionDirectories
        },
        {
          workingDirectory: worktree.fsPath,
          skillDirectories: [URI.joinPath(worktree, ".github", "skills", "wt-skill").fsPath],
          instructionDirectories: [URI.joinPath(worktree, ".github", "instructions").fsPath]
        },
        "skill/instruction directories sent to the SDK must resolve inside the worktree, never the original folder"
      );
    });
  });
  suite("custom agent worktree translation", () => {
    const repo = URI.file("/repo");
    const worktree = URI.joinPath(URI.file("/repo.worktrees"), "agents-x");
    const repoAgentUri = URI.joinPath(repo, ".github", "agents", "agent.md").toString();
    const worktreeAgentUri = URI.joinPath(worktree, ".github", "agents", "agent.md").toString();
    const emptySnapshot = { tools: [], plugins: [], mcpServers: {} };
    function provisional(workingDirectory, agent) {
      const sessionUri = AgentSession.uri("copilotcli", "prov-agent");
      return { sessionId: AgentSession.id(sessionUri), sessionUri, workingDirectory, model: void 0, agent, project: void 0 };
    }
    test("_getAlternativeAgentForWorktree rewrites a repo agent path onto the worktree", async () => {
      const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
      try {
        const internals = agent;
        assert.deepStrictEqual(
          internals._getAlternativeAgentForWorktree(provisional(repo, { uri: repoAgentUri }), worktree),
          { uri: worktreeAgentUri }
        );
      } finally {
        await disposeAgent(agent);
      }
    });
    test("_getAlternativeAgentForWorktree returns undefined when there is nothing to translate", async () => {
      const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
      try {
        const internals = agent;
        const outsideRepoAgent = { uri: URI.file("/home/me/.copilot/agents/agent.md").toString() };
        assert.deepStrictEqual(
          {
            noAgent: internals._getAlternativeAgentForWorktree(provisional(repo, void 0), worktree),
            folderIsolation: internals._getAlternativeAgentForWorktree(provisional(repo, { uri: repoAgentUri }), void 0),
            sameWorkingDirectory: internals._getAlternativeAgentForWorktree(provisional(repo, { uri: repoAgentUri }), repo),
            agentOutsideRepo: internals._getAlternativeAgentForWorktree(provisional(repo, outsideRepoAgent), worktree)
          },
          {
            noAgent: void 0,
            folderIsolation: void 0,
            sameWorkingDirectory: void 0,
            agentOutsideRepo: void 0
          }
        );
      } finally {
        await disposeAgent(agent);
      }
    });
    test("_resolveAgentWhenMaterializing keeps the original agent for folder isolation (no worktree)", async () => {
      const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
      try {
        const internals = agent;
        internals._resolveAgentName = (_snapshot, selection) => selection.uri === repoAgentUri ? "Repo Agent" : void 0;
        assert.deepStrictEqual(
          await internals._resolveAgentWhenMaterializing(provisional(repo, { uri: repoAgentUri }), emptySnapshot, repo),
          { agent: { uri: repoAgentUri }, name: "Repo Agent" }
        );
      } finally {
        await disposeAgent(agent);
      }
    });
    test("_resolveAgentWhenMaterializing returns undefined when no agent is selected or neither resolves", async () => {
      const agent = createTestAgent(disposables, { copilotClient: new TestCopilotClient([]) });
      try {
        const internals = agent;
        internals._resolveAgentName = () => void 0;
        assert.deepStrictEqual(
          {
            noAgent: await internals._resolveAgentWhenMaterializing(provisional(repo, void 0), emptySnapshot, worktree),
            neitherResolves: await internals._resolveAgentWhenMaterializing(provisional(repo, { uri: repoAgentUri }), emptySnapshot, worktree)
          },
          { noAgent: void 0, neitherResolves: void 0 }
        );
      } finally {
        await disposeAgent(agent);
      }
    });
    test("materialization rewrites a repo agent to its worktree copy and persists it (no resolution stubbing)", async () => {
      const fileService = disposables.add(new FileService(new NullLogService()));
      disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
      const repoFolder = URI.from({ scheme: Schemas.inMemory, path: "/repo" });
      const worktreeFolder = URI.from({ scheme: Schemas.inMemory, path: "/repo.worktrees/agents-x" });
      const repoAgentFile = URI.joinPath(repoFolder, ".github", "agents", "agent.md");
      const worktreeAgentFile = URI.joinPath(worktreeFolder, ".github", "agents", "agent.md");
      const agentContents = VSBuffer.fromString("---\nname: My Agent\ndescription: a custom agent\n---\nbody");
      await fileService.writeFile(repoAgentFile, agentContents);
      await fileService.writeFile(worktreeAgentFile, agentContents);
      const client = new TestCopilotClient([]);
      client.createSession = async () => new MockCopilotSession();
      const sessionDataService = disposables.add(new TestSessionDataService());
      const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });
      let launchAgentName;
      const internals = agent;
      const originalCreateAgentSession = internals._createAgentSession;
      internals._createAgentSession = (launchPlan, customizationDirectory, activeClient, identity) => {
        launchAgentName = launchPlan.resolvedAgentName;
        return originalCreateAgentSession.call(agent, launchPlan, customizationDirectory, activeClient, identity);
      };
      try {
        await agent.authenticate("https://api.github.com", "token");
        const result = await agent.createSession({
          session: AgentSession.uri("copilotcli", "agent-translate"),
          workingDirectories: [repoFolder],
          agent: { uri: repoAgentFile.toString() }
        });
        assert.strictEqual(result.provisional, true);
        await agent.chats.sendMessage(defaultChatUri(result.session), "hello", [worktreeFolder], void 0, void 0, void 0);
        const stored = await internals._readSessionMetadata(result.session);
        assert.deepStrictEqual(
          { storedAgent: stored.agent, launchAgentName },
          { storedAgent: { uri: worktreeAgentFile.toString() }, launchAgentName: "My Agent" },
          "the repo agent must be rewritten to its worktree copy, both for the SDK launch and the persisted metadata the restore path reads"
        );
      } finally {
        await disposeAgent(agent);
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdEFnZW50LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IENvcGlsb3RDbGllbnQsIENvcGlsb3RDbGllbnRPcHRpb25zLCBDb3BpbG90U2Vzc2lvbiwgR2l0SHViVGVsZW1ldHJ5Tm90aWZpY2F0aW9uLCBQZXJtaXNzaW9uQWxsb3dBbGxNb2RlLCBQZXJtaXNzaW9uUmVxdWVzdCwgU2Vzc2lvbkV2ZW50LCBTZXNzaW9uRXZlbnRIYW5kbGVyLCBTZXNzaW9uRXZlbnRQYXlsb2FkLCBTZXNzaW9uRXZlbnRUeXBlLCBUeXBlZFNlc3Npb25FdmVudEhhbmRsZXIgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCB0eXBlIEFudGhyb3BpYyBmcm9tICdAYW50aHJvcGljLWFpL3Nkayc7XG5pbXBvcnQgdHlwZSB7IENDQU1vZGVsIH0gZnJvbSAnQHZzY29kZS9jb3BpbG90LWFwaSc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0eXBlIERpc3Bvc2FibGVTdG9yZSwgdHlwZSBJRGlzcG9zYWJsZSwgdHlwZSBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgd2FpdEZvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgdHlwZSBJU3RhdCB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFByb3h5UmVzb2x2ZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFByb3h5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0Q2xpZW50UHJveHlDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENsaWVudFByb3h5Q2hhbm5lbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElCeW9rTG1CcmlkZ2VDb25uZWN0aW9uLCBJQnlva0xtTW9kZWxJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEJ5b2tMbS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvcGlsb3RDbGlDb25maWdLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vY29waWxvdENsaUNvbmZpZy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0UHJlZmVyTG9uZ0NvbnRleHRFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RTeXN0ZW1Qcm94eUVuYWJsZWRDb25maWdLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpbk1hbmFnZXIsIElTeW5jZWRDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50UGx1Z2luTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRSwgdHlwZSBBZ2VudFNpZ25hbCwgdHlwZSBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSwgdHlwZSBJQWdlbnRTZXNzaW9uTWV0YWRhdGEsIHR5cGUgSUFnZW50U3Bhd25DaGF0RXZlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIGJ1aWxkQ2hhdFVyaSwgYnVpbGRTdWJhZ2VudENoYXRVcmksIHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmksIEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgUk9PVF9TVEFURV9VUkksIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgVHVyblN0YXRlLCBjdXN0b21pemF0aW9uSWQsIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIFRvb2xDYWxsUmVzdWx0LCB0eXBlIFR1cm4sIFJ1bGVDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgU2Vzc2lvblN0YXR1cywgVG9vbENhbGxDb250cmlidXRvcktpbmQsIHR5cGUgQWdlbnRTZWxlY3Rpb24sIHR5cGUgTW9kZWxTZWxlY3Rpb24sIHR5cGUgVG9vbERlZmluaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBDaGF0QWN0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuXG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSwgdHlwZSBJQnJhbmNoLCB0eXBlIElEZWZhdWx0QnJhbmNoIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbXBsZXRpb25zLCBJQWdlbnRIb3N0Q29tcGxldGlvbnMgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdENvbXBsZXRpb25zLmpzJztcbmltcG9ydCB7IENPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRSwgQ29waWxvdEFnZW50LCBDb3BpbG90U2Vzc2lvbkVudHJ5LCByZWJhc2VVbmRlciwgUkVGUkVTSF9ERUJPVU5DRV9NUyB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90QWdlbnQuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9BR0VOVF9IT1NUX0ZJTEVfTElOS19JTlNUUlVDVElPTlMgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvcHJvbXB0cy9zeXN0ZW1NZXNzYWdlLmpzJztcbmltcG9ydCB7IE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RSZXZpZXdTZXJ2aWNlLCBOVUxMX1JFVklFV19TRVJWSUNFIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuL3Rlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29waWxvdEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90QWdlbnRTZXNzaW9uLmpzJztcbmltcG9ydCB7IEFnZW50QnJhbmNoTmFtZUdlbmVyYXRvciwgZ2V0QWdlbnRCcmFuY2hOYW1lSGludEZyb21NZXNzYWdlLCBub3JtYWxpemVBZ2VudEJyYW5jaE5hbWUgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9hZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IuanMnO1xuaW1wb3J0IHR5cGUgeyBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4sIElBY3RpdmVDbGllbnRTbmFwc2hvdCB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90U2Vzc2lvbkxhdW5jaGVyLmpzJztcbmltcG9ydCB7IFNoZWxsTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90U2hlbGxUb29scy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclBlbmRpbmdFZGl0Q29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L3BlbmRpbmdFZGl0Q29udGVudFN0b3JlLmpzJztcbmltcG9ydCB7IFNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uLy4uL25vZGUvc2Vzc2lvbkRhdGFiYXNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQgfSBmcm9tICcuLi8uLi9ub2RlL2FjdGl2ZUNsaWVudFN0YXRlLmpzJztcbmltcG9ydCB7IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5LCBJQnlva0xtQnJpZGdlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9ub2RlL2J5b2tMbUJyaWRnZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb3BpbG90QXBpU2VydmljZSwgdHlwZSBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucywgdHlwZSBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3QsIHR5cGUgSVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0IH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0SW50ZXJuYWxUZWxlbWV0cnlDb250ZXh0LCBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgaW5qZWN0U2lkZUNoYXRDb250ZXh0IH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudFBlZXJDaGF0cy5qcyc7XG5cbi8qKlxuICogVGVzdCBoZWxwZXJzIGZvciB0aGUgc2luZ2xlIGBfc2Vzc2lvbnNgIGNvbnRhaW5lci4gQWxsIGNoYXRzIChkZWZhdWx0ICsgcGVlcnMpXG4gKiBsaXZlIGluc2lkZSB0aGUgb3duaW5nIHNlc3Npb24ncyB7QGxpbmsgQ29waWxvdFNlc3Npb25FbnRyeX0sIGtleWVkIGJ5IGNoYXQgVVJJXG4gKiBzdHJpbmc7IHRoZSBkZWZhdWx0IGNoYXQgaXMgdGhlIGVudHJ5J3MgYGRlZmF1bHRDaGF0YC4gVGhlc2Ugd3JhcCB0aGF0XG4gKiBzdHJ1Y3R1cmUgc28gdGVzdHMgY2FuIGluamVjdC9vYnNlcnZlIGZha2VzIHdpdGhvdXQgcmVhY2hpbmcgaW50byBwcml2YXRlXG4gKiBjb250YWluZXIgaW50ZXJuYWxzLlxuICovXG5mdW5jdGlvbiBzZXNzaW9uc01hcChhZ2VudDogQ29waWxvdEFnZW50KTogTWFwPHN0cmluZywgQ29waWxvdFNlc3Npb25FbnRyeT4ge1xuXHRyZXR1cm4gKGFnZW50IGFzIHVua25vd24gYXMgeyBfc2Vzc2lvbnM6IE1hcDxzdHJpbmcsIENvcGlsb3RTZXNzaW9uRW50cnk+IH0pLl9zZXNzaW9ucztcbn1cblxuZnVuY3Rpb24gZGVmYXVsdENoYXRVcmkoc2Vzc2lvbjogVVJJKTogVVJJIHtcblx0cmV0dXJuIFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcbn1cblxuLyoqIEluamVjdCAob3IgcmVwbGFjZSkgYSBzZXNzaW9uJ3MgZGVmYXVsdC1jaGF0IHN0dWIuICovXG5mdW5jdGlvbiBzZXREZWZhdWx0U2Vzc2lvblN0dWIoYWdlbnQ6IENvcGlsb3RBZ2VudCwgc2Vzc2lvbklkOiBzdHJpbmcsIHN0dWI6IHVua25vd24pOiB2b2lkIHtcblx0Y29uc3Qgc2Vzc2lvbnMgPSBzZXNzaW9uc01hcChhZ2VudCk7XG5cdGNvbnN0IGRlZmF1bHRDaGF0S2V5ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgc2Vzc2lvbklkKS50b1N0cmluZygpKTtcblx0bGV0IGVudHJ5ID0gc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdGlmICghZW50cnkpIHtcblx0XHRlbnRyeSA9IG5ldyBDb3BpbG90U2Vzc2lvbkVudHJ5KCk7XG5cdFx0c2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgZW50cnkpO1xuXHR9XG5cdGVudHJ5LnNldERlZmF1bHRDaGF0KGRlZmF1bHRDaGF0S2V5LCBuZXcgQ29waWxvdFNlc3Npb25FbnRyeShzdHViIGFzIENvcGlsb3RBZ2VudFNlc3Npb24pKTtcbn1cblxuLyoqIEluamVjdCBhIHBlZXItY2hhdCBzdHViIGludG8gaXRzIG93bmluZyBzZXNzaW9uJ3MgZW50cnkgKGNyZWF0aW5nIHRoZSBlbnRyeSBpZiBuZWVkZWQpLiAqL1xuZnVuY3Rpb24gc2V0UGVlckNoYXRTdHViKGFnZW50OiBDb3BpbG90QWdlbnQsIGNoYXRVcmk6IFVSSSwgc3R1YjogdW5rbm93bik6IHZvaWQge1xuXHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoVVJJLnBhcnNlKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdFVyaSkpKTtcblx0Y29uc3Qgc2Vzc2lvbnMgPSBzZXNzaW9uc01hcChhZ2VudCk7XG5cdGxldCBlbnRyeSA9IHNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRpZiAoIWVudHJ5KSB7XG5cdFx0ZW50cnkgPSBuZXcgQ29waWxvdFNlc3Npb25FbnRyeSgpO1xuXHRcdHNlc3Npb25zLnNldChzZXNzaW9uSWQsIGVudHJ5KTtcblx0fVxuXHRlbnRyeS5yZWdpc3RlclBlZXJDaGF0KGNoYXRVcmkudG9TdHJpbmcoKSwgbmV3IENvcGlsb3RTZXNzaW9uRW50cnkoc3R1YiBhcyBDb3BpbG90QWdlbnRTZXNzaW9uKSk7XG59XG5cbi8qKiBSZXNvbHZlIGEgcGVlci1jaGF0IHN0dWIgZnJvbSBpdHMgb3duaW5nIHNlc3Npb24ncyBlbnRyeS4gKi9cbmZ1bmN0aW9uIGdldFBlZXJDaGF0U3R1YihhZ2VudDogQ29waWxvdEFnZW50LCBjaGF0VXJpOiBVUkkpOiBDb3BpbG90QWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKFVSSS5wYXJzZShwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXRVcmkpKSk7XG5cdHJldHVybiBzZXNzaW9uc01hcChhZ2VudCkuZ2V0KHNlc3Npb25JZCk/LmdldFBlZXJDaGF0KGNoYXRVcmkudG9TdHJpbmcoKSk7XG59XG5cbi8qKiBUcnVlIHdoZW4gYSBwZWVyIGNoYXQgaXMgdHJhY2tlZCBpbiBpdHMgb3duaW5nIHNlc3Npb24ncyBlbnRyeS4gKi9cbmZ1bmN0aW9uIGhhc1BlZXJDaGF0U3R1YihhZ2VudDogQ29waWxvdEFnZW50LCBjaGF0VXJpOiBVUkkpOiBib29sZWFuIHtcblx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKFVSSS5wYXJzZShwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXRVcmkpKSk7XG5cdHJldHVybiBzZXNzaW9uc01hcChhZ2VudCkuZ2V0KHNlc3Npb25JZCk/Lmhhc1BlZXJDaGF0KGNoYXRVcmkudG9TdHJpbmcoKSkgPz8gZmFsc2U7XG59XG5cbi8qKiBUb3RhbCBudW1iZXIgb2YgcGVlciBjaGF0cyB0cmFja2VkIGFjcm9zcyBhbGwgc2Vzc2lvbnMuICovXG5mdW5jdGlvbiBwZWVyQ2hhdENvdW50KGFnZW50OiBDb3BpbG90QWdlbnQpOiBudW1iZXIge1xuXHRsZXQgY291bnQgPSAwO1xuXHRmb3IgKGNvbnN0IGVudHJ5IG9mIHNlc3Npb25zTWFwKGFnZW50KS52YWx1ZXMoKSkge1xuXHRcdGNvdW50ICs9IGVudHJ5LnBlZXJDaGF0S2V5cygpLmxlbmd0aDtcblx0fVxuXHRyZXR1cm4gY291bnQ7XG59XG5cbmNsYXNzIFRlc3RBZ2VudFBsdWdpbk1hbmFnZXIgaW1wbGVtZW50cyBJQWdlbnRQbHVnaW5NYW5hZ2VyIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgYmFzZVBhdGggPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2lubWVtb3J5JywgcGF0aDogJy9hZ2VudFBsdWdpbnMnIH0pO1xuXG5cdGFzeW5jIHN5bmNDdXN0b21pemF0aW9ucyhfY2xpZW50SWQ6IHN0cmluZywgX2N1c3RvbWl6YXRpb25zOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10sIF9wcm9ncmVzcz86IChzdGF0dXM6IFBsdWdpbkN1c3RvbWl6YXRpb24pID0+IHZvaWQpOiBQcm9taXNlPElTeW5jZWRDdXN0b21pemF0aW9uW10+IHtcblx0XHRyZXR1cm4gW107XG5cdH1cbn1cblxuY2xhc3MgVGVzdEFnZW50SG9zdEdpdFNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRIb3N0R2l0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlcG9zaXRvcnlSb290OiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGhlYWRDb21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9ICcwJy5yZXBlYXQoNDApO1xuXHRhZGRlZFdvcmt0cmVlczogeyByZXBvc2l0b3J5Um9vdDogVVJJOyB3b3JrdHJlZTogVVJJOyBicmFuY2hOYW1lOiBzdHJpbmc7IHN0YXJ0UG9pbnQ6IHN0cmluZyB9W10gPSBbXTtcblx0YWRkZWRFeGlzdGluZ1dvcmt0cmVlczogeyByZXBvc2l0b3J5Um9vdDogVVJJOyB3b3JrdHJlZTogVVJJOyBicmFuY2hOYW1lOiBzdHJpbmcgfVtdID0gW107XG5cdHJlbW92ZWRXb3JrdHJlZXM6IHsgcmVwb3NpdG9yeVJvb3Q6IFVSSTsgd29ya3RyZWU6IFVSSSB9W10gPSBbXTtcblx0ZXhpc3RpbmdCcmFuY2hlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRkaXJ0eVdvcmtpbmdEaXJlY3RvcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGFzeW5jIGdldEN1cnJlbnRCcmFuY2goKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXREZWZhdWx0QnJhbmNoKCk6IFByb21pc2U8SURlZmF1bHRCcmFuY2ggfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXRCcmFuY2goKTogUHJvbWlzZTxJQnJhbmNoIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0UmVmcygpOiBQcm9taXNlPElCcmFuY2hbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgZ2V0QnJhbmNoZXMoKTogUHJvbWlzZTxJQnJhbmNoW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGdldFJlcG9zaXRvcnlSb290KCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLnJlcG9zaXRvcnlSb290OyB9XG5cdGFzeW5jIGdldFdvcmt0cmVlUm9vdHMoKTogUHJvbWlzZTxVUklbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgYWRkV29ya3RyZWUocmVwb3NpdG9yeVJvb3Q6IFVSSSwgd29ya3RyZWU6IFVSSSwgYnJhbmNoTmFtZTogc3RyaW5nLCBzdGFydFBvaW50OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFkZGVkV29ya3RyZWVzLnB1c2goeyByZXBvc2l0b3J5Um9vdCwgd29ya3RyZWUsIGJyYW5jaE5hbWUsIHN0YXJ0UG9pbnQgfSk7XG5cdFx0dGhpcy5leGlzdGluZ0JyYW5jaGVzLmFkZChicmFuY2hOYW1lKTtcblx0fVxuXHRhc3luYyBjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgYWRkRXhpc3RpbmdXb3JrdHJlZShyZXBvc2l0b3J5Um9vdDogVVJJLCB3b3JrdHJlZTogVVJJLCBicmFuY2hOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFkZGVkRXhpc3RpbmdXb3JrdHJlZXMucHVzaCh7IHJlcG9zaXRvcnlSb290LCB3b3JrdHJlZSwgYnJhbmNoTmFtZSB9KTtcblx0fVxuXHRhc3luYyByZW1vdmVXb3JrdHJlZShyZXBvc2l0b3J5Um9vdDogVVJJLCB3b3JrdHJlZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5yZW1vdmVkV29ya3RyZWVzLnB1c2goeyByZXBvc2l0b3J5Um9vdCwgd29ya3RyZWUgfSk7XG5cdH1cblx0YXN5bmMgYnJhbmNoRXhpc3RzKF9yZXBvc2l0b3J5Um9vdDogVVJJLCBicmFuY2hOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5leGlzdGluZ0JyYW5jaGVzLmhhcyhicmFuY2hOYW1lKTtcblx0fVxuXHRhc3luYyBoYXNVbmNvbW1pdHRlZENoYW5nZXMod29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuZGlydHlXb3JraW5nRGlyZWN0b3JpZXMuaGFzKHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoKTtcblx0fVxuXHRhc3luYyBjb21taXRBbGwoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmVzdG9yZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBoYXNVcHN0cmVhbSgpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIHB1bGwoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcHVzaCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXRTZXNzaW9uR2l0U3RhdGUoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBjb21wdXRlU2Vzc2lvbkZpbGVEaWZmcygpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIHNob3dCbG9iKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgY29tbWl0VHJlZSgpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIHVwZGF0ZVJlZigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBkZWxldGVSZWZzKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHJldlBhcnNlKF9yZXBvc2l0b3J5Um9vdDogVVJJLCBleHByZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBleHByZXNzaW9uID09PSAnSEVBRCcgPyB0aGlzLmhlYWRDb21taXQgOiB1bmRlZmluZWQ7XG5cdH1cblx0YXN5bmMgcmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0KCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgb3ZlcmxheVBhdGhJbnRvVHJlZSgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGRpZmZUcmVlUGF0aHMoKTogUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcygpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldEZldGNoUmVtb3RlVXJscygpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldFVudHJhY2tlZFBhdGhzKCk6IFByb21pc2U8W10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGdldEJyYW5jaERpZmZTYWZldHlJbmZvKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0RGlmZlBhdGNoQmV0d2VlblJlZnMoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG5jbGFzcyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIGltcGxlbWVudHMgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGFzeW5jIGNyZWF0ZVRlcm1pbmFsKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdHdyaXRlSW5wdXQoKTogdm9pZCB7IH1cblx0YXN5bmMgc2VuZFRleHQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0b25EYXRhKCk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXHRvbkV4aXQoKTogSURpc3Bvc2FibGUgeyByZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyB9XG5cdG9uQ2xhaW1DaGFuZ2VkKCk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIERpc3Bvc2FibGUuTm9uZTsgfVxuXHRvbkNvbW1hbmRGaW5pc2hlZCgpOiBJRGlzcG9zYWJsZSB7IHJldHVybiBEaXNwb3NhYmxlLk5vbmU7IH1cblx0Y3JlYXRlQWx0QnVmZmVyUHJvbWlzZShfdXJpOiBzdHJpbmcsIF9zdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7IH0pOyB9XG5cdGdldENvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRnZXRDbGFpbSgpOiB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGhhc1Rlcm1pbmFsKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Z2V0RXhpdENvZGUoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRzdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24oKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRkaXNwb3NlVGVybWluYWwoKTogdm9pZCB7IH1cblx0Z2V0VGVybWluYWxJbmZvcygpOiBbXSB7IHJldHVybiBbXTsgfVxuXHRnZXRUZXJtaW5hbFN0YXRlKCk6IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0RGVmYXVsdFNoZWxsKCk6IFByb21pc2U8c3RyaW5nPiB7IHJldHVybiAnL2Jpbi9iYXNoJzsgfVxuXHRjcmVhdGVPdXRwdXRUZXJtaW5hbCgpOiB2b2lkIHsgfVxuXHRhcHBlbmRPdXRwdXRUZXJtaW5hbERhdGEoKTogdm9pZCB7IH1cblx0cmVzZXRPdXRwdXRUZXJtaW5hbCgpOiB2b2lkIHsgfVxuXHRmaW5hbGl6ZU91dHB1dFRlcm1pbmFsKCk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIFRlc3RDb3BpbG90QXBpU2VydmljZSBpbXBsZW1lbnRzIElDb3BpbG90QXBpU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHV0aWxpdHlDYWxsczogeyB0b2tlbjogc3RyaW5nOyByZXF1ZXN0OiBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3Q7IG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyB9W10gPSBbXTtcblx0cmVzcG9uc2UgPSAnZ2VuZXJhdGVkLWJyYW5jaC1uYW1lJztcblx0ZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRhcGlFbmRwb2ludDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR1c2VyTG9naW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHRzID0gbmV3IE1hcDxzdHJpbmcsIElSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dD4oKTtcblx0cmVhZG9ubHkgcmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHRDYWxsczogc3RyaW5nW10gPSBbXTtcblxuXHRtZXNzYWdlcyhfZ2l0aHViVG9rZW46IHN0cmluZywgX3JlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLCBfb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cdG1lc3NhZ2VzKF9naXRodWJUb2tlbjogc3RyaW5nLCBfcmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsIF9vcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblx0bWVzc2FnZXMoKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4gfCBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cdGFzeW5jIGNvdW50VG9rZW5zKCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2VUb2tlbnNDb3VudD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7IH1cblx0YXN5bmMgbW9kZWxzKCk6IFByb21pc2U8Q0NBTW9kZWxbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgcmVzcG9uc2VzKCk6IFByb21pc2U8UmVzcG9uc2U+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpOyB9XG5cdGFzeW5jIHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dChnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxJUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQ+IHtcblx0XHR0aGlzLnJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0Q2FsbHMucHVzaChnaXRodWJUb2tlbik7XG5cdFx0cmV0dXJuIHRoaXMucmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHRzLmdldChnaXRodWJUb2tlbikgPz8ge1xuXHRcdFx0cmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0dHJhY2tpbmdJZDogdW5kZWZpbmVkLFxuXHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGlzSW50ZXJuYWw6IGZhbHNlLFxuXHRcdFx0dXNlck5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdGlzVnNjb2RlVGVhbU1lbWJlcjogZmFsc2UsXG5cdFx0fTtcblx0fVxuXHRhc3luYyByZXNvbHZlQXBpRW5kcG9pbnQoKSB7IHJldHVybiB0aGlzLmFwaUVuZHBvaW50OyB9XG5cdGFzeW5jIHJlc29sdmVVc2VyTG9naW4oKSB7IHJldHVybiB0aGlzLnVzZXJMb2dpbjsgfVxuXHRhc3luYyB1dGlsaXR5Q2hhdENvbXBsZXRpb24oZ2l0aHViVG9rZW46IHN0cmluZywgcmVxdWVzdDogSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0LCBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHRoaXMudXRpbGl0eUNhbGxzLnB1c2goeyB0b2tlbjogZ2l0aHViVG9rZW4sIHJlcXVlc3QsIG9wdGlvbnMgfSk7XG5cdFx0aWYgKHRoaXMuZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMuZXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlc3BvbnNlO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNlc3Npb25EYXRhU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGFiYXNlcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXNzaW9uRGF0YWJhc2U+KCk7XG5cdHJlYWRvbmx5IG9wZW5lZFNlc3Npb25zOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGdldFNlc3Npb25EYXRhRGlyKHNlc3Npb246IFVSSSk6IFVSSSB7IHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiBgL3Nlc3Npb24tZGF0YS8ke0FnZW50U2Vzc2lvbi5pZChzZXNzaW9uKX1gIH0pOyB9XG5cdGdldFNlc3Npb25EYXRhRGlyQnlJZChzZXNzaW9uSWQ6IHN0cmluZyk6IFVSSSB7IHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiBgL3Nlc3Npb24tZGF0YS8ke3Nlc3Npb25JZH1gIH0pOyB9XG5cblx0b3BlbkRhdGFiYXNlKHNlc3Npb246IFVSSSk6IElSZWZlcmVuY2U8U2Vzc2lvbkRhdGFiYXNlPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdHRoaXMub3BlbmVkU2Vzc2lvbnMucHVzaChzZXNzaW9uSWQpO1xuXHRcdGxldCBkYiA9IHRoaXMuX2RhdGFiYXNlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIWRiKSB7XG5cdFx0XHRkYiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6JykpO1xuXHRcdFx0dGhpcy5fZGF0YWJhc2VzLnNldChzZXNzaW9uSWQsIGRiKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgb2JqZWN0OiBkYiwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdH1cblxuXHRhc3luYyB0cnlPcGVuRGF0YWJhc2Uoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxJUmVmZXJlbmNlPFNlc3Npb25EYXRhYmFzZT4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkYiA9IHRoaXMuX2RhdGFiYXNlcy5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKTtcblx0XHRyZXR1cm4gZGIgPyB7IG9iamVjdDogZGIsIGRpc3Bvc2U6ICgpID0+IHsgfSB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0ZGVsZXRlU2Vzc2lvbkRhdGEoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuXHRyZWFkb25seSBvbldpbGxEZWxldGVTZXNzaW9uRGF0YSA9IEV2ZW50Lk5vbmU7XG5cdGNsZWFudXBPcnBoYW5lZERhdGEoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuXHR3aGVuSWRsZSgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG59XG50eXBlIENvcGlsb3RNb2RlbHNMaXN0ID0gQ29waWxvdENsaWVudFsncnBjJ11bJ21vZGVscyddWydsaXN0J107XG50eXBlIENvcGlsb3RNb2RlbEluZm8gPSBBd2FpdGVkPFJldHVyblR5cGU8Q29waWxvdE1vZGVsc0xpc3Q+PlsnbW9kZWxzJ11bbnVtYmVyXTtcblxuaW50ZXJmYWNlIElUZXN0Q29waWxvdE1vZGVsSW5mbyB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzPzoge1xuXHRcdHJlYWRvbmx5IHN1cHBvcnRzPzogeyByZWFkb25seSB2aXNpb24/OiBib29sZWFuIH07XG5cdFx0cmVhZG9ubHkgbGltaXRzPzogeyByZWFkb25seSBtYXhfY29udGV4dF93aW5kb3dfdG9rZW5zPzogbnVtYmVyOyByZWFkb25seSBtYXhfb3V0cHV0X3Rva2Vucz86IG51bWJlcjsgcmVhZG9ubHkgbWF4X3Byb21wdF90b2tlbnM/OiBudW1iZXIgfTtcblx0fTtcblx0cmVhZG9ubHkgcG9saWN5PzogeyByZWFkb25seSBzdGF0ZT86IE5vbk51bGxhYmxlPENvcGlsb3RNb2RlbEluZm9bJ3BvbGljeSddPlsnc3RhdGUnXSB9O1xuXHRyZWFkb25seSBiaWxsaW5nPzogQ29waWxvdE1vZGVsSW5mb1snYmlsbGluZyddO1xuXHRyZWFkb25seSBtb2RlbFBpY2tlckNhdGVnb3J5PzogQ29waWxvdE1vZGVsSW5mb1snbW9kZWxQaWNrZXJDYXRlZ29yeSddO1xuXHRyZWFkb25seSBtb2RlbFBpY2tlclByaWNlQ2F0ZWdvcnk/OiBDb3BpbG90TW9kZWxJbmZvWydtb2RlbFBpY2tlclByaWNlQ2F0ZWdvcnknXTtcblx0cmVhZG9ubHkgc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cz86IENvcGlsb3RNb2RlbEluZm9bJ3N1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHMnXTtcblx0cmVhZG9ubHkgZGVmYXVsdFJlYXNvbmluZ0VmZm9ydD86IENvcGlsb3RNb2RlbEluZm9bJ2RlZmF1bHRSZWFzb25pbmdFZmZvcnQnXTtcbn1cblxuaW50ZXJmYWNlIElUZXN0Q29waWxvdENsaWVudCBleHRlbmRzIFBpY2s8Q29waWxvdENsaWVudCwgJ3N0YXJ0JyB8ICdzdG9wJyB8ICdsaXN0U2Vzc2lvbnMnIHwgJ2NyZWF0ZVNlc3Npb24nIHwgJ3Jlc3VtZVNlc3Npb24nIHwgJ2dldFNlc3Npb25NZXRhZGF0YScgfCAnZGVsZXRlU2Vzc2lvbic+IHtcblx0cmVhZG9ubHkgcnBjOiB7XG5cdFx0cmVhZG9ubHkgc2Vzc2lvbnM6IHsgcmVhZG9ubHkgZm9yazogQ29waWxvdENsaWVudFsncnBjJ11bJ3Nlc3Npb25zJ11bJ2ZvcmsnXSB9O1xuXHRcdHJlYWRvbmx5IG1vZGVsczogeyByZWFkb25seSBsaXN0OiBDb3BpbG90TW9kZWxzTGlzdCB9O1xuXHR9O1xufVxuXG5mdW5jdGlvbiB0b1Nka01vZGVsSW5mbyhtb2RlbDogSVRlc3RDb3BpbG90TW9kZWxJbmZvKTogQ29waWxvdE1vZGVsSW5mbyB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IG1vZGVsLmlkLFxuXHRcdG5hbWU6IG1vZGVsLm5hbWUsXG5cdFx0Y2FwYWJpbGl0aWVzOiB7XG5cdFx0XHRzdXBwb3J0czoge1xuXHRcdFx0XHR2aXNpb246IG1vZGVsLmNhcGFiaWxpdGllcz8uc3VwcG9ydHM/LnZpc2lvbiA/PyBmYWxzZSxcblx0XHRcdFx0cmVhc29uaW5nRWZmb3J0OiAhIW1vZGVsLnN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM/Lmxlbmd0aCxcblx0XHRcdH0sXG5cdFx0XHRsaW1pdHM6IHtcblx0XHRcdFx0bWF4X2NvbnRleHRfd2luZG93X3Rva2VuczogbW9kZWwuY2FwYWJpbGl0aWVzPy5saW1pdHM/Lm1heF9jb250ZXh0X3dpbmRvd190b2tlbnMgPz8gMCxcblx0XHRcdFx0bWF4X291dHB1dF90b2tlbnM6IG1vZGVsLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfb3V0cHV0X3Rva2Vucyxcblx0XHRcdFx0bWF4X3Byb21wdF90b2tlbnM6IG1vZGVsLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfcHJvbXB0X3Rva2Vucyxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHQuLi4obW9kZWwucG9saWN5ID8geyBwb2xpY3k6IHsgc3RhdGU6IG1vZGVsLnBvbGljeS5zdGF0ZSA/PyAnZW5hYmxlZCcsIHRlcm1zOiAnJyB9IH0gOiB7fSksXG5cdFx0Li4uKG1vZGVsLmJpbGxpbmcgPyB7IGJpbGxpbmc6IG1vZGVsLmJpbGxpbmcgfSA6IHt9KSxcblx0XHQuLi4obW9kZWwubW9kZWxQaWNrZXJDYXRlZ29yeSA/IHsgbW9kZWxQaWNrZXJDYXRlZ29yeTogbW9kZWwubW9kZWxQaWNrZXJDYXRlZ29yeSB9IDoge30pLFxuXHRcdC4uLihtb2RlbC5tb2RlbFBpY2tlclByaWNlQ2F0ZWdvcnkgPyB7IG1vZGVsUGlja2VyUHJpY2VDYXRlZ29yeTogbW9kZWwubW9kZWxQaWNrZXJQcmljZUNhdGVnb3J5IH0gOiB7fSksXG5cdFx0Li4uKG1vZGVsLnN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHMgPyB7IHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM6IG1vZGVsLnN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHMgfSA6IHt9KSxcblx0XHQuLi4obW9kZWwuZGVmYXVsdFJlYXNvbmluZ0VmZm9ydCA/IHsgZGVmYXVsdFJlYXNvbmluZ0VmZm9ydDogbW9kZWwuZGVmYXVsdFJlYXNvbmluZ0VmZm9ydCB9IDoge30pLFxuXHR9O1xufVxuXG5jbGFzcyBUZXN0Q29waWxvdENsaWVudCBpbXBsZW1lbnRzIElUZXN0Q29waWxvdENsaWVudCB7XG5cdHJlYWRvbmx5IHJwYzogSVRlc3RDb3BpbG90Q2xpZW50WydycGMnXSA9IHtcblx0XHRzZXNzaW9uczogeyBmb3JrOiBhc3luYyAoKSA9PiAoeyBzZXNzaW9uSWQ6ICdmb3JrZWQtc2Vzc2lvbicgfSkgfSxcblx0XHRtb2RlbHM6IHtcblx0XHRcdGxpc3Q6IGFzeW5jIHBhcmFtcyA9PiB7XG5cdFx0XHRcdHRoaXMubW9kZWxMaXN0UmVxdWVzdHMucHVzaChwYXJhbXMpO1xuXHRcdFx0XHRjb25zdCBnYXRlID0gdGhpcy5tb2RlbExpc3RHYXRlcy5zaGlmdCgpID8/IHRoaXMubW9kZWxMaXN0R2F0ZTtcblx0XHRcdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5tb2RlbExpc3RSZXNwb25zZXMuc2hpZnQoKSA/PyB0aGlzLl9tb2RlbHM7XG5cdFx0XHRcdGNvbnN0IGVycm9yID0gdGhpcy5tb2RlbExpc3RFcnJvcnMuc2hpZnQoKTtcblx0XHRcdFx0YXdhaXQgZ2F0ZTtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgbW9kZWxzOiBtb2RlbHMubWFwKHRvU2RrTW9kZWxJbmZvKSB9O1xuXHRcdFx0fVxuXHRcdH0sXG5cdH07XG5cdHN0YXJ0Q2FsbENvdW50ID0gMDtcblx0c3RvcENhbGxDb3VudCA9IDA7XG5cdHN0YXJ0R2F0ZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0bGlzdFNlc3Npb25DYWxsQ291bnQgPSAwO1xuXHRyZWFkb25seSBtb2RlbExpc3RSZXF1ZXN0czogUGFyYW1ldGVyczxDb3BpbG90TW9kZWxzTGlzdD5bMF1bXSA9IFtdO1xuXHRyZWFkb25seSBtb2RlbExpc3RFcnJvcnM6IEVycm9yW10gPSBbXTtcblx0LyoqIFdoZW4gc2V0LCBgbW9kZWxzLmxpc3RgIHJlY29yZHMgaXRzIHJlcXVlc3QgdGhlbiBibG9ja3Mgb24gdGhpcyB1bnRpbCByZXNvbHZlZC4gKi9cblx0bW9kZWxMaXN0R2F0ZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0LyoqIFBlci1yZXF1ZXN0IGdhdGVzIGFuZCByZXN1bHRzLCBjYXB0dXJlZCB3aGVuIGVhY2ggcmVxdWVzdCBzdGFydHMuICovXG5cdHJlYWRvbmx5IG1vZGVsTGlzdEdhdGVzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0cmVhZG9ubHkgbW9kZWxMaXN0UmVzcG9uc2VzOiBJVGVzdENvcGlsb3RNb2RlbEluZm9bXVtdID0gW107XG5cdHJlYWRvbmx5IGdldFNlc3Npb25NZXRhZGF0YUNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSBkZWxldGVkU2Vzc2lvbklkczogc3RyaW5nW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uczogQXdhaXRlZDxSZXR1cm5UeXBlPElUZXN0Q29waWxvdENsaWVudFsnbGlzdFNlc3Npb25zJ10+Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHM6IHJlYWRvbmx5IElUZXN0Q29waWxvdE1vZGVsSW5mb1tdID0gW10sXG5cdCkgeyB9XG5cblx0YXN5bmMgc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zdGFydENhbGxDb3VudCsrO1xuXHRcdGF3YWl0IHRoaXMuc3RhcnRHYXRlO1xuXHR9XG5cdGFzeW5jIHN0b3AoKTogUmV0dXJuVHlwZTxJVGVzdENvcGlsb3RDbGllbnRbJ3N0b3AnXT4ge1xuXHRcdHRoaXMuc3RvcENhbGxDb3VudCsrO1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRhc3luYyBsaXN0U2Vzc2lvbnMoKTogUmV0dXJuVHlwZTxJVGVzdENvcGlsb3RDbGllbnRbJ2xpc3RTZXNzaW9ucyddPiB7XG5cdFx0dGhpcy5saXN0U2Vzc2lvbkNhbGxDb3VudCsrO1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9ucztcblx0fVxuXHRhc3luYyBnZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbklkOiBzdHJpbmcpOiBSZXR1cm5UeXBlPElUZXN0Q29waWxvdENsaWVudFsnZ2V0U2Vzc2lvbk1ldGFkYXRhJ10+IHtcblx0XHR0aGlzLmdldFNlc3Npb25NZXRhZGF0YUNhbGxzLnB1c2goc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnMuZmluZChzID0+IHMuc2Vzc2lvbklkID09PSBzZXNzaW9uSWQpO1xuXHR9XG5cdGFzeW5jIGRlbGV0ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRlbGV0ZWRTZXNzaW9uSWRzLnB1c2goc2Vzc2lvbklkKTtcblx0fVxuXHRjcmVhdGVTZXNzaW9uOiBJVGVzdENvcGlsb3RDbGllbnRbJ2NyZWF0ZVNlc3Npb24nXSA9IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfTtcblx0cmVzdW1lU2Vzc2lvbjogSVRlc3RDb3BpbG90Q2xpZW50WydyZXN1bWVTZXNzaW9uJ10gPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH07XG59XG5cbmludGVyZmFjZSBJRmFrZUFnZW50U2Vzc2lvbiB7XG5cdHNlbmQ6IChwcm9tcHQ6IHN0cmluZywgYXR0YWNobWVudHM/OiB1bmtub3duLCB0dXJuSWQ/OiBzdHJpbmcsIGFubm91bmNlbWVudD86IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPjtcblx0Z2V0TWVzc2FnZXM6ICgpID0+IFByb21pc2U8cmVhZG9ubHkgVHVybltdPjtcblx0ZGlzcG9zZTogKCkgPT4gdm9pZDtcbn1cblxuY2xhc3MgTW9ja0NvcGlsb3RTZXNzaW9uIHtcblx0cmVhZG9ubHkgc2Vzc2lvbklkID0gJ3Rlc3Qtc2Vzc2lvbi0xJztcblx0cmVhZG9ubHkgcnBjID0ge1xuXHRcdG9wdGlvbnM6IHtcblx0XHRcdHVwZGF0ZTogYXN5bmMgKCkgPT4gKHsgc3VjY2VzczogdHJ1ZSB9KSxcblx0XHR9LFxuXHRcdHBlcm1pc3Npb25zOiB7XG5cdFx0XHRzZXRBbGxvd0FsbDogYXN5bmMgKHsgbW9kZSB9OiB7IG1vZGU6IFBlcm1pc3Npb25BbGxvd0FsbE1vZGUgfSkgPT4gKHsgc3VjY2VzczogdHJ1ZSwgbW9kZSB9KSxcblx0XHR9LFxuXHR9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGVycyA9IG5ldyBTZXQ8U2Vzc2lvbkV2ZW50SGFuZGxlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdHlwZWRIYW5kbGVycyA9IG5ldyBNYXA8U2Vzc2lvbkV2ZW50VHlwZSwgU2V0PChldmVudDogU2Vzc2lvbkV2ZW50UGF5bG9hZDxTZXNzaW9uRXZlbnRUeXBlPikgPT4gdm9pZD4+KCk7XG5cblx0b24oX2hhbmRsZXI6IFNlc3Npb25FdmVudEhhbmRsZXIpOiAoKSA9PiB2b2lkO1xuXHRvbjxLIGV4dGVuZHMgU2Vzc2lvbkV2ZW50VHlwZT4oX2V2ZW50VHlwZTogSywgX2hhbmRsZXI6IFR5cGVkU2Vzc2lvbkV2ZW50SGFuZGxlcjxLPik6ICgpID0+IHZvaWQ7XG5cdG9uPEsgZXh0ZW5kcyBTZXNzaW9uRXZlbnRUeXBlPihldmVudFR5cGVPckhhbmRsZXI6IEsgfCBTZXNzaW9uRXZlbnRIYW5kbGVyLCBoYW5kbGVyPzogVHlwZWRTZXNzaW9uRXZlbnRIYW5kbGVyPEs+KTogKCkgPT4gdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBldmVudFR5cGVPckhhbmRsZXIgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRoaXMuX2hhbmRsZXJzLmFkZChldmVudFR5cGVPckhhbmRsZXIpO1xuXHRcdFx0cmV0dXJuICgpID0+IHRoaXMuX2hhbmRsZXJzLmRlbGV0ZShldmVudFR5cGVPckhhbmRsZXIpO1xuXHRcdH1cblx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBoYW5kbGVyIGZvciAke2V2ZW50VHlwZU9ySGFuZGxlcn1gKTtcblx0XHR9XG5cdFx0bGV0IGhhbmRsZXJzID0gdGhpcy5fdHlwZWRIYW5kbGVycy5nZXQoZXZlbnRUeXBlT3JIYW5kbGVyKTtcblx0XHRpZiAoIWhhbmRsZXJzKSB7XG5cdFx0XHRoYW5kbGVycyA9IG5ldyBTZXQoKTtcblx0XHRcdHRoaXMuX3R5cGVkSGFuZGxlcnMuc2V0KGV2ZW50VHlwZU9ySGFuZGxlciwgaGFuZGxlcnMpO1xuXHRcdH1cblx0XHRjb25zdCB0eXBlZEhhbmRsZXIgPSBoYW5kbGVyIGFzIChldmVudDogU2Vzc2lvbkV2ZW50UGF5bG9hZDxTZXNzaW9uRXZlbnRUeXBlPikgPT4gdm9pZDtcblx0XHRoYW5kbGVycy5hZGQodHlwZWRIYW5kbGVyKTtcblx0XHRyZXR1cm4gKCkgPT4gaGFuZGxlcnMuZGVsZXRlKHR5cGVkSGFuZGxlcik7XG5cdH1cblxuXHRlbWl0PEsgZXh0ZW5kcyBTZXNzaW9uRXZlbnRUeXBlPihldmVudDogU2Vzc2lvbkV2ZW50UGF5bG9hZDxLPik6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25FdmVudCA9IGV2ZW50IGFzIFNlc3Npb25FdmVudDtcblx0XHRmb3IgKGNvbnN0IGhhbmRsZXIgb2YgdGhpcy5faGFuZGxlcnMpIHtcblx0XHRcdGhhbmRsZXIoc2Vzc2lvbkV2ZW50KTtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZWRFdmVudCA9IGV2ZW50IGFzIFNlc3Npb25FdmVudFBheWxvYWQ8U2Vzc2lvbkV2ZW50VHlwZT47XG5cdFx0Zm9yIChjb25zdCBoYW5kbGVyIG9mIHRoaXMuX3R5cGVkSGFuZGxlcnMuZ2V0KGV2ZW50LnR5cGUpID8/IFtdKSB7XG5cdFx0XHRoYW5kbGVyKHR5cGVkRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNlbmQoKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuICcnOyB9XG5cdGFzeW5jIGFib3J0KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNldE1vZGVsKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdldEV2ZW50cygpOiBQcm9taXNlPFNlc3Npb25FdmVudFBheWxvYWQ8U2Vzc2lvbkV2ZW50VHlwZT5bXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgZGlzY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxufVxuXG5jbGFzcyBUZXN0U2RrRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZywgcmVhZG9ubHkgY29kZTogbnVtYmVyKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdH1cbn1cblxuY2xhc3MgTW9ja0FnZW50SG9zdE9UZWxTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50SG9zdE9UZWxTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGFzeW5jIGdldFNka1RlbGVtZXRyeUNvbmZpZygpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGdldFNwYW5zRGJQYXRoKCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0ZW1pdFNlc3Npb25UaXRsZUNoYW5nZWQoKSB7IH1cblx0YXN5bmMgZmx1c2goKSB7XG5cdFx0Ly9cblx0fVxufVxuXG5jbGFzcyBUZXN0UHJveHlSZXNvbHZlciBpbXBsZW1lbnRzIElBZ2VudEhvc3RQcm94eVJlc29sdmVyIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlc29sdmVQcm94eUNhbGxzID0gMDtcblx0cmVzb2x2ZWRQcm94eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHJlZ2lzdGVyKF9jbGllbnRJZDogc3RyaW5nLCBfY29ubmVjdGlvbjogSUFnZW50SG9zdENsaWVudFByb3h5Q29ubmVjdGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVByb3h5KF91cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5yZXNvbHZlUHJveHlDYWxscysrO1xuXHRcdHJldHVybiB0aGlzLnJlc29sdmVkUHJveHk7XG5cdH1cblxuXHRyZWFkb25seSBmZXRjaDogdHlwZW9mIGdsb2JhbFRoaXMuZmV0Y2ggPSAoaW5wdXQsIGluaXQpID0+IGdsb2JhbFRoaXMuZmV0Y2goaW5wdXQsIGluaXQpO1xufVxuXG5jbGFzcyBSZXN1bWVQYXRoQ29waWxvdEFnZW50IGV4dGVuZHMgQ29waWxvdEFnZW50IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29waWxvdENsaWVudDogSVRlc3RDb3BpbG90Q2xpZW50LFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uRGF0YVNlcnZpY2Ugc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0R2l0U2VydmljZSBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdEBJQWdlbnRIb3N0Q29tcGxldGlvbnMgY29tcGxldGlvbnM6IElBZ2VudEhvc3RDb21wbGV0aW9ucyxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElCeW9rTG1CcmlkZ2VSZWdpc3RyeSBieW9rQnJpZGdlUmVnaXN0cnk6IElCeW9rTG1CcmlkZ2VSZWdpc3RyeSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RQcm94eVJlc29sdmVyIHByb3h5UmVzb2x2ZXI6IElBZ2VudEhvc3RQcm94eVJlc29sdmVyLFxuXHRcdEBJQ29waWxvdEFwaVNlcnZpY2UgY29waWxvdEFwaVNlcnZpY2U6IElDb3BpbG90QXBpU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobG9nU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgZ2l0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHN0YXRlTWFuYWdlciwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpLCBuZXcgTW9ja0FnZW50SG9zdE9UZWxTZXJ2aWNlKCksIGNvbXBsZXRpb25zLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgTlVMTF9SRVZJRVdfU0VSVklDRSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBieW9rQnJpZGdlUmVnaXN0cnksIHRlbGVtZXRyeVNlcnZpY2UsIGNvcGlsb3RBcGlTZXJ2aWNlLCBwcm94eVJlc29sdmVyKTtcblx0XHR0aGlzLl9lbmFibGVQbGFuTW9kZU9uQ2xpZW50KHRoaXMuX2NvcGlsb3RDbGllbnQgYXMgQ29waWxvdENsaWVudCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2NyZWF0ZUNvcGlsb3RDbGllbnQoKTogQ29waWxvdENsaWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvcGlsb3RDbGllbnQgYXMgQ29waWxvdENsaWVudDtcblx0fVxufVxuXG5jbGFzcyBUZXN0YWJsZUNvcGlsb3RBZ2VudCBleHRlbmRzIENvcGlsb3RBZ2VudCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Zha2VTZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJRmFrZUFnZW50U2Vzc2lvbj4oKTtcblx0cmVhZG9ubHkgcmVzdW1lQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IGNyZWF0ZWRDbGllbnRPcHRpb25zOiBDb3BpbG90Q2xpZW50T3B0aW9uc1tdID0gW107XG5cblx0Ly8gS2VlcCBtb2RlbC1yZWZyZXNoIHJldHJpZXMgZWZmZWN0aXZlbHkgaW5zdGFudCBpbiB0ZXN0cy5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IF9tb2RlbFJlZnJlc2hCYXNlRGVsYXlNcyA9IDE7XG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBfbW9kZWxSZWZyZXNoTWF4RGVsYXlNcyA9IDI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29waWxvdENsaWVudDogSVRlc3RDb3BpbG90Q2xpZW50LFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uRGF0YVNlcnZpY2Ugc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0R2l0U2VydmljZSBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdEBJQWdlbnRIb3N0Q29tcGxldGlvbnMgY29tcGxldGlvbnM6IElBZ2VudEhvc3RDb21wbGV0aW9ucyxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElCeW9rTG1CcmlkZ2VSZWdpc3RyeSBieW9rQnJpZGdlUmVnaXN0cnk6IElCeW9rTG1CcmlkZ2VSZWdpc3RyeSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RQcm94eVJlc29sdmVyIHByb3h5UmVzb2x2ZXI6IElBZ2VudEhvc3RQcm94eVJlc29sdmVyLFxuXHRcdEBJQ29waWxvdEFwaVNlcnZpY2UgY29waWxvdEFwaVNlcnZpY2U6IElDb3BpbG90QXBpU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobG9nU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgZ2l0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHN0YXRlTWFuYWdlciwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpLCBuZXcgTW9ja0FnZW50SG9zdE9UZWxTZXJ2aWNlKCksIGNvbXBsZXRpb25zLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgTlVMTF9SRVZJRVdfU0VSVklDRSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBieW9rQnJpZGdlUmVnaXN0cnksIHRlbGVtZXRyeVNlcnZpY2UsIGNvcGlsb3RBcGlTZXJ2aWNlLCBwcm94eVJlc29sdmVyKTtcblx0XHR0aGlzLl9lbmFibGVQbGFuTW9kZU9uQ2xpZW50KHRoaXMuX2NvcGlsb3RDbGllbnQgYXMgQ29waWxvdENsaWVudCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2NyZWF0ZUNvcGlsb3RDbGllbnQob3B0aW9uczogQ29waWxvdENsaWVudE9wdGlvbnMpOiBDb3BpbG90Q2xpZW50IHtcblx0XHR0aGlzLmNyZWF0ZWRDbGllbnRPcHRpb25zLnB1c2gob3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvcGlsb3RDbGllbnQgYXMgQ29waWxvdENsaWVudDtcblx0fVxuXG5cdHJlZ2lzdGVyRmFrZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIGZha2U6IElGYWtlQWdlbnRTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fZmFrZVNlc3Npb25zLnNldChzZXNzaW9uSWQsIGZha2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9yZXN1bWVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxDb3BpbG90QWdlbnRTZXNzaW9uPiB7XG5cdFx0dGhpcy5yZXN1bWVDYWxscy5wdXNoKHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgZmFrZSA9IHRoaXMuX2Zha2VTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIWZha2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gZmFrZSBzZXNzaW9uIHJlZ2lzdGVyZWQgZm9yICcke3Nlc3Npb25JZH0nYCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgc2Vzc2lvbklkKTtcblx0XHRjb25zdCBlbWl0dGVyID0gKHRoaXMgYXMgdW5rbm93biBhcyB7IF9vbkRpZFNlc3Npb25Qcm9ncmVzczogeyBmaXJlKHM6IEFnZW50U2lnbmFsKTogdm9pZCB9IH0pLl9vbkRpZFNlc3Npb25Qcm9ncmVzcztcblx0XHRsZXQgdHVybklkID0gJyc7XG5cdFx0Ly8gYF9zZXNzaW9uc2AgaXMgYSBEaXNwb3NhYmxlTWFwLCBzbyBpdCB3aWxsIGRpc3Bvc2UoKSB0aGUgZW50cnkgb25cblx0XHQvLyB0ZWFyZG93bi4gVGhlIGZpZWxkcyBiZWxvdyBhcmUgdGhlIG9ubHkgb25lcyB0b3VjaGVkIGJ5IHNlbmRNZXNzYWdlXG5cdFx0Ly8gYW5kIGdldFNlc3Npb25NZXNzYWdlcyBpbiB0aGUgY29kZSB1bmRlciB0ZXN0LlxuXHRcdGNvbnN0IHN0dWIgPSB7XG5cdFx0XHRzZW5kOiBmYWtlLnNlbmQsXG5cdFx0XHRnZXRNZXNzYWdlczogZmFrZS5nZXRNZXNzYWdlcyxcblx0XHRcdGFwcGxpZWRTbmFwc2hvdDogdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcG9zZTogZmFrZS5kaXNwb3NlLFxuXHRcdFx0cmVzZXRUdXJuU3RhdGU6IChuZXdUdXJuSWQ6IHN0cmluZykgPT4geyB0dXJuSWQgPSBuZXdUdXJuSWQ7IH0sXG5cdFx0XHRlbWl0SW5pdGlhbE1hcmtkb3duOiAoY29udGVudDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmksXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsXG5cdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHRwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiBgc3ludGgtJHtEYXRlLm5vdygpfWAsIGNvbnRlbnQgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RBZ2VudFNlc3Npb247XG5cdFx0cmV0dXJuIHN0dWI7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0Q3JlYXRlZENsaWVudE9wdGlvbnMoYWdlbnQ6IENvcGlsb3RBZ2VudCk6IHJlYWRvbmx5IENvcGlsb3RDbGllbnRPcHRpb25zW10ge1xuXHRhc3NlcnQub2soYWdlbnQgaW5zdGFuY2VvZiBUZXN0YWJsZUNvcGlsb3RBZ2VudCk7XG5cdHJldHVybiBhZ2VudC5jcmVhdGVkQ2xpZW50T3B0aW9ucztcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgb3B0aW9ucz86IHsgc2Vzc2lvbkRhdGFTZXJ2aWNlPzogSVNlc3Npb25EYXRhU2VydmljZTsgY29waWxvdENsaWVudD86IElUZXN0Q29waWxvdENsaWVudDsgdXNlUmVhbFJlc3VtZVBhdGg/OiBib29sZWFuOyBnaXRTZXJ2aWNlPzogVGVzdEFnZW50SG9zdEdpdFNlcnZpY2U7IGVudmlyb25tZW50U2VydmljZVJlZ2lzdHJhdGlvbj86ICduYXRpdmUnIHwgJ25vbmUnOyBwbHVnaW5NYW5hZ2VyPzogSUFnZW50UGx1Z2luTWFuYWdlcjsgZmlsZVNlcnZpY2U/OiBGaWxlU2VydmljZTsgY29waWxvdEFwaVNlcnZpY2U/OiBJQ29waWxvdEFwaVNlcnZpY2U7IGdpdEh1YkVuZHBvaW50U2VydmljZT86IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2U7IHRlbGVtZXRyeVNlcnZpY2U/OiBJVGVsZW1ldHJ5U2VydmljZTsgdXNlckhvbWU/OiBVUkk7IGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZTsgcHJveHlSZXNvbHZlcj86IElBZ2VudEhvc3RQcm94eVJlc29sdmVyOyBieW9rQnJpZGdlUmVnaXN0cnk/OiBJQnlva0xtQnJpZGdlUmVnaXN0cnkgfSk6IHsgYWdlbnQ6IENvcGlsb3RBZ2VudDsgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTsgY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlOyBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7IHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0ge1xuXHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gb3B0aW9ucz8ubG9nU2VydmljZSA/PyBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBvcHRpb25zPy5maWxlU2VydmljZSA/PyBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRzZXJ2aWNlcy5zZXQoSUxvZ1NlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRzZXJ2aWNlcy5zZXQoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdHNlcnZpY2VzLnNldChJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnU2VydmljZSk7XG5cdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBzdGF0ZU1hbmFnZXIpO1xuXHRzZXJ2aWNlcy5zZXQoSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSwgb3B0aW9ucz8uZ2l0SHViRW5kcG9pbnRTZXJ2aWNlID8/IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKSk7XG5cdHNlcnZpY2VzLnNldChJU2Vzc2lvbkRhdGFTZXJ2aWNlLCBvcHRpb25zPy5zZXNzaW9uRGF0YVNlcnZpY2UgPz8gY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0c2VydmljZXMuc2V0KElBZ2VudFBsdWdpbk1hbmFnZXIsIG9wdGlvbnM/LnBsdWdpbk1hbmFnZXIgPz8gbmV3IFRlc3RBZ2VudFBsdWdpbk1hbmFnZXIoKSk7XG5cdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0R2l0U2VydmljZSwgb3B0aW9ucz8uZ2l0U2VydmljZSA/PyBuZXcgVGVzdEFnZW50SG9zdEdpdFNlcnZpY2UoKSk7XG5cdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0UmV2aWV3U2VydmljZSwgTlVMTF9SRVZJRVdfU0VSVklDRSk7XG5cdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLCBuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKTtcblx0c2VydmljZXMuc2V0KElBZ2VudEhvc3RPVGVsU2VydmljZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRnZXRTZGtUZWxlbWV0cnlDb25maWc6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRnZXRTcGFuc0RiUGF0aDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGVtaXRTZXNzaW9uVGl0bGVDaGFuZ2VkOiAoKSA9PiB7IH0sXG5cdFx0Zmx1c2g6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0fSk7XG5cdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q29tcGxldGlvbnMsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q29tcGxldGlvbnMobG9nU2VydmljZSkpKTtcblx0c2VydmljZXMuc2V0KElBZ2VudEhvc3RQcm94eVJlc29sdmVyLCBvcHRpb25zPy5wcm94eVJlc29sdmVyID8/IG5ldyBUZXN0UHJveHlSZXNvbHZlcigpKTtcblx0c2VydmljZXMuc2V0KElCeW9rTG1CcmlkZ2VSZWdpc3RyeSwgb3B0aW9ucz8uYnlva0JyaWRnZVJlZ2lzdHJ5ID8/IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpKTtcblx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBvcHRpb25zPy5jb3BpbG90QXBpU2VydmljZSA/PyBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdHNlcnZpY2VzLnNldChJQ29waWxvdEFwaVNlcnZpY2UsIGNvcGlsb3RBcGlTZXJ2aWNlKTtcblx0c2VydmljZXMuc2V0KElUZWxlbWV0cnlTZXJ2aWNlLCBvcHRpb25zPy50ZWxlbWV0cnlTZXJ2aWNlID8/IE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0aWYgKG9wdGlvbnM/LmVudmlyb25tZW50U2VydmljZVJlZ2lzdHJhdGlvbiAhPT0gJ25vbmUnKSB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0dXNlckhvbWU6IG9wdGlvbnM/LnVzZXJIb21lID8/IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL21vY2staG9tZScgfSksXG5cdFx0XHR0bXBEaXI6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL21vY2stdG1wJyB9KSxcblx0XHR9IGFzIElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2U7XG5cdFx0c2VydmljZXMuc2V0KElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSk7XG5cdH1cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0c2VydmljZXMuc2V0KElJbnN0YW50aWF0aW9uU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBhZ2VudCA9IG9wdGlvbnM/LmNvcGlsb3RDbGllbnRcblx0XHQ/IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKG9wdGlvbnMudXNlUmVhbFJlc3VtZVBhdGggPyBSZXN1bWVQYXRoQ29waWxvdEFnZW50IDogVGVzdGFibGVDb3BpbG90QWdlbnQsIG9wdGlvbnMuY29waWxvdENsaWVudClcblx0XHQ6IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvcGlsb3RBZ2VudCk7XG5cdHJldHVybiB7IGFnZW50LCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZ1NlcnZpY2UsIGZpbGVTZXJ2aWNlLCBzdGF0ZU1hbmFnZXIgfTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBvcHRpb25zPzogeyBzZXNzaW9uRGF0YVNlcnZpY2U/OiBJU2Vzc2lvbkRhdGFTZXJ2aWNlOyBjb3BpbG90Q2xpZW50PzogSVRlc3RDb3BpbG90Q2xpZW50OyB1c2VSZWFsUmVzdW1lUGF0aD86IGJvb2xlYW47IGdpdFNlcnZpY2U/OiBUZXN0QWdlbnRIb3N0R2l0U2VydmljZTsgZW52aXJvbm1lbnRTZXJ2aWNlUmVnaXN0cmF0aW9uPzogJ25hdGl2ZScgfCAnbm9uZSc7IHBsdWdpbk1hbmFnZXI/OiBJQWdlbnRQbHVnaW5NYW5hZ2VyOyBmaWxlU2VydmljZT86IEZpbGVTZXJ2aWNlOyBjb3BpbG90QXBpU2VydmljZT86IElDb3BpbG90QXBpU2VydmljZTsgZ2l0SHViRW5kcG9pbnRTZXJ2aWNlPzogSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZTsgdGVsZW1ldHJ5U2VydmljZT86IElUZWxlbWV0cnlTZXJ2aWNlOyB1c2VySG9tZT86IFVSSTsgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlOyBieW9rQnJpZGdlUmVnaXN0cnk/OiBJQnlva0xtQnJpZGdlUmVnaXN0cnkgfSk6IENvcGlsb3RBZ2VudCB7XG5cdHJldHVybiBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCBvcHRpb25zKS5hZ2VudDtcbn1cblxudHlwZSBDb3BpbG90Q3JlYXRlU2Vzc2lvbk9wdGlvbnMgPSBQYXJhbWV0ZXJzPENvcGlsb3RDbGllbnRbJ2NyZWF0ZVNlc3Npb24nXT5bMF07XG5cbmZ1bmN0aW9uIGNyZWF0ZUFnZW50U2Vzc2lvblRocm91Z2hBZ2VudChhZ2VudDogQ29waWxvdEFnZW50LCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcHRpb25zPzogeyByZWFkb25seSBtb2NrU2Vzc2lvbj86IE1vY2tDb3BpbG90U2Vzc2lvbjsgcmVhZG9ubHkgYWN0aXZlQ2xpZW50VG9vbFNldD86IEFjdGl2ZUNsaWVudFRvb2xTZXQ7IHJlYWRvbmx5IHNuYXBzaG90PzogSUFjdGl2ZUNsaWVudFNuYXBzaG90IH0pOiB7IHJlYWRvbmx5IHNlc3Npb246IENvcGlsb3RBZ2VudFNlc3Npb247IHJlYWRvbmx5IGNyZWF0ZU9wdGlvbnM6ICgpID0+IENvcGlsb3RDcmVhdGVTZXNzaW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB9IHtcblx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAndGVzdC1zZXNzaW9uLTEnKTtcblx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBzZXNzaW9uVXJpLCB1bmRlZmluZWQpO1xuXHRsZXQgY3JlYXRlT3B0aW9uczogQ29waWxvdENyZWF0ZVNlc3Npb25PcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBtb2NrU2Vzc2lvbiA9IG9wdGlvbnM/Lm1vY2tTZXNzaW9uID8/IG5ldyBNb2NrQ29waWxvdFNlc3Npb24oKTtcblx0Y29uc3QgbGF1bmNoUGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuID0ge1xuXHRcdGtpbmQ6ICdjcmVhdGUnLFxuXHRcdGNsaWVudDoge1xuXHRcdFx0Y3JlYXRlU2Vzc2lvbjogYXN5bmMgb3B0aW9ucyA9PiB7XG5cdFx0XHRcdGNyZWF0ZU9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdFx0XHRyZXR1cm4gbW9ja1Nlc3Npb24gYXMgdW5rbm93biBhcyBDb3BpbG90U2Vzc2lvbjtcblx0XHRcdH0sXG5cdFx0XHRyZXN1bWVTZXNzaW9uOiBhc3luYyAoKSA9PiBtb2NrU2Vzc2lvbiBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uLFxuXHRcdH0sXG5cdFx0YWN0aXZlQ2xpZW50VG9vbFNldDogb3B0aW9ucz8uYWN0aXZlQ2xpZW50VG9vbFNldCA/PyBuZXcgQWN0aXZlQ2xpZW50VG9vbFNldCgpLFxuXHRcdHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbi0xJyxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiB1bmRlZmluZWQsXG5cdFx0cmVzb2x2ZWRBZ2VudE5hbWU6IHVuZGVmaW5lZCxcblx0XHRzbmFwc2hvdDogb3B0aW9ucz8uc25hcHNob3QgPz8geyB0b29sczogW10sIHBsdWdpbnM6IFtdLCBtY3BTZXJ2ZXJzOiB7fSB9LFxuXHRcdHNoZWxsTWFuYWdlcixcblx0XHRnaXRodWJUb2tlbjogJ3Rva2VuJyxcblx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHR9O1xuXHRjb25zdCBhZ2VudEludGVybmFscyA9IChhZ2VudCBhcyB1bmtub3duIGFzIHtcblx0XHRfZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQ6IChzZXNzaW9uOiBVUkksIGRpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKSA9PiB1bmtub3duO1xuXHRcdF9jcmVhdGVBZ2VudFNlc3Npb246IChsYXVuY2hQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4sIGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCwgYWN0aXZlQ2xpZW50OiB1bmtub3duKSA9PiBDb3BpbG90QWdlbnRTZXNzaW9uO1xuXHR9KTtcblx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gYWdlbnRJbnRlcm5hbHMuX2dldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHNlc3Npb25VcmksIHVuZGVmaW5lZCk7XG5cdHJldHVybiB7IHNlc3Npb246IGFnZW50SW50ZXJuYWxzLl9jcmVhdGVBZ2VudFNlc3Npb24obGF1bmNoUGxhbiwgdW5kZWZpbmVkLCBhY3RpdmVDbGllbnQpLCBjcmVhdGVPcHRpb25zOiAoKSA9PiBjcmVhdGVPcHRpb25zIH07XG59XG5cbmZ1bmN0aW9uIHdpdGhvdXRVbmRlZmluZWRQcm9wZXJ0aWVzKG1ldGFkYXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMobWV0YWRhdGEpKSB7XG5cdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdFtrZXldID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHNka1Nlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIGN3ZD86IHN0cmluZyk6IEF3YWl0ZWQ8UmV0dXJuVHlwZTxJVGVzdENvcGlsb3RDbGllbnRbJ2xpc3RTZXNzaW9ucyddPj5bbnVtYmVyXSB7XG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbklkLFxuXHRcdHN0YXJ0VGltZTogbmV3IERhdGUoMTAwMCksXG5cdFx0bW9kaWZpZWRUaW1lOiBuZXcgRGF0ZSgyMDAwKSxcblx0XHRzdW1tYXJ5OiBgU0RLICR7c2Vzc2lvbklkfWAsXG5cdFx0aXNSZW1vdGU6IGZhbHNlLFxuXHRcdC4uLihjd2QgPyB7IGNvbnRleHQ6IHsgd29ya2luZ0RpcmVjdG9yeTogY3dkIH0gfSA6IHt9KSxcblx0fTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZGlzcG9zZUFnZW50KGFnZW50OiBDb3BpbG90QWdlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgYWdlbnQuc2h1dGRvd24oKTtcblx0YWdlbnQuZGlzcG9zZSgpO1xuXHQvLyBDb3BpbG90QWdlbnQuZGlzcG9zZSBjYWxscyBzdXBlci5kaXNwb3NlKCkgZnJvbSBhIHByb21pc2UgY29udGludWF0aW9uIHNvXG5cdC8vIGFzeW5jIHNodXRkb3duIGNhbiBzdG9wIFNESyBzZXNzaW9ucyBiZWZvcmUgY2hpbGQgZGlzcG9zYWJsZXMgYXJlIHJlbGVhc2VkLlxuXHQvLyBMZXQgdGhhdCBjb250aW51YXRpb24gcnVuIGJlZm9yZSB0aGUgZGlzcG9zYWJsZSBsZWFrIHRyYWNrZXIgY2hlY2tzLlxuXHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcbn1cblxuc3VpdGUoJ0NvcGlsb3RBZ2VudCcsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpbnN0YWxscyB0aGUgR2l0SHViIHRlbGVtZXRyeSBjYWxsYmFjayBpbiBDb3BpbG90Q2xpZW50T3B0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10pO1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KSBhcyBUZXN0YWJsZUNvcGlsb3RBZ2VudDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGdldENyZWF0ZWRDbGllbnRPcHRpb25zKGFnZW50KS5hdCgtMSk/Lm9uR2l0SHViVGVsZW1ldHJ5LCAnZnVuY3Rpb24nKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdXRlcyBleGFjdCBsZWdhY3kgdGFyZ2V0cyBleGNsdXNpdmVseSBhbmQgZmFsbHMgYmFjayB0byBnZW5lcmljIGZvcndhcmRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb3BpbG90QXBpU2VydmljZS5yZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dHMuc2V0KCdyZXN0cmljdGVkLXRva2VuJywge1xuXHRcdFx0cmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IHRydWUsXG5cdFx0XHR0cmFja2luZ0lkOiAncmVzdHJpY3RlZC10aWQnLFxuXHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQ6ICdodHRwczovL3RlbGVtZXRyeS5leGFtcGxlJyxcblx0XHRcdGlzSW50ZXJuYWw6IHRydWUsXG5cdFx0XHR1c2VyTmFtZTogJ29jdG9jYXQnLFxuXHRcdFx0aXNWc2NvZGVUZWFtTWVtYmVyOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IGNsYXNzIGV4dGVuZHMgQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSB7XG5cdFx0XHRyZWFkb25seSBnZW5lcmljRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0cmVhZG9ubHkgZW5oYW5jZWRFdmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRyZWFkb25seSBpbnRlcm5hbEV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRcdHJlc3RyaWN0ZWRFbmFibGVkID0gZmFsc2U7XG5cblx0XHRcdG92ZXJyaWRlIHB1YmxpY0xvZyhldmVudE5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHR0aGlzLmdlbmVyaWNFdmVudHMucHVzaChldmVudE5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgc2VuZEVuaGFuY2VkR0hUZWxlbWV0cnlFdmVudChldmVudE5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHR0aGlzLmVuaGFuY2VkRXZlbnRzLnB1c2goZXZlbnROYW1lKTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIHNlbmRFbmhhbmNlZEdIVGVsZW1ldHJ5RXZlbnRGb3JDb250ZXh0KF9jb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQsIGV2ZW50TmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuZW5oYW5jZWRFdmVudHMucHVzaChldmVudE5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgc2VuZEludGVybmFsTVNGVFRlbGVtZXRyeUV2ZW50KGV2ZW50TmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuaW50ZXJuYWxFdmVudHMucHVzaChldmVudE5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgc2VuZEludGVybmFsTVNGVFRlbGVtZXRyeUV2ZW50Rm9yQ29udGV4dChfY29udGV4dDogSUFnZW50SG9zdEludGVybmFsVGVsZW1ldHJ5Q29udGV4dCwgZXZlbnROYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5pbnRlcm5hbEV2ZW50cy5wdXNoKGV2ZW50TmFtZSk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBzZXRSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMucmVzdHJpY3RlZEVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0XHRzdXBlci5zZXRSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZChlbmFibGVkKTtcblx0XHRcdH1cblx0XHR9KE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50LCBjb3BpbG90QXBpU2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSB9KSBhcyBUZXN0YWJsZUNvcGlsb3RBZ2VudDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Jlc3RyaWN0ZWQtdG9rZW4nKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwICYmICF0ZWxlbWV0cnlTZXJ2aWNlLnJlc3RyaWN0ZWRFbmFibGVkOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBhZ2VudC5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGNvbnN0IGZvcndhcmQgPSBnZXRDcmVhdGVkQ2xpZW50T3B0aW9ucyhhZ2VudCkuYXQoLTEpPy5vbkdpdEh1YlRlbGVtZXRyeTtcblx0XHRcdGFzc2VydC5vayhmb3J3YXJkKTtcblxuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gKGtpbmQ6IHN0cmluZywgcmVzdHJpY3RlZDogYm9vbGVhbik6IEdpdEh1YlRlbGVtZXRyeU5vdGlmaWNhdGlvbiA9PiAoe1xuXHRcdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0XHRyZXN0cmljdGVkLFxuXHRcdFx0XHRldmVudDogeyBraW5kLCBwcm9wZXJ0aWVzOiB7fSwgbWV0cmljczoge30gfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZm9yd2FyZChub3RpZmljYXRpb24oJ2VuZ2luZS5tZXNzYWdlcy5sZW5ndGgnLCB0cnVlKSk7XG5cdFx0XHRhd2FpdCBmb3J3YXJkKG5vdGlmaWNhdGlvbignZW5naW5lLm1lc3NhZ2VzJywgZmFsc2UpKTtcblx0XHRcdGF3YWl0IGZvcndhcmQobm90aWZpY2F0aW9uKCd1bmtub3duX3Jlc3RyaWN0ZWQnLCB0cnVlKSk7XG5cdFx0XHRhd2FpdCBmb3J3YXJkKG5vdGlmaWNhdGlvbigndG9vbF9jYWxsX2V4ZWN1dGVkJywgZmFsc2UpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGdlbmVyaWM6IHRlbGVtZXRyeVNlcnZpY2UuZ2VuZXJpY0V2ZW50cyxcblx0XHRcdFx0ZW5oYW5jZWQ6IHRlbGVtZXRyeVNlcnZpY2UuZW5oYW5jZWRFdmVudHMsXG5cdFx0XHRcdGludGVybmFsOiB0ZWxlbWV0cnlTZXJ2aWNlLmludGVybmFsRXZlbnRzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRnZW5lcmljOiBbJ2NvcGlsb3RDbGkvdW5rbm93bl9yZXN0cmljdGVkJywgJ2NvcGlsb3RDbGkvdG9vbF9jYWxsX2V4ZWN1dGVkJ10sXG5cdFx0XHRcdGVuaGFuY2VkOiBbJ2VuZ2luZS5tZXNzYWdlcy5sZW5ndGgnXSxcblx0XHRcdFx0aW50ZXJuYWw6IFsnZW5naW5lLm1lc3NhZ2VzLmxlbmd0aCddLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyb3V0ZXMgZXhhY3QgdGFyZ2V0cyB1c2luZyB0aGUgY3VycmVudCBhdXRoIHRva2VuIGFuZCByZWZsZWN0cyB0b2tlbiBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHRzLnNldCgndG9rZW4tYScsIHtcblx0XHRcdHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkOiB0cnVlLFxuXHRcdFx0dHJhY2tpbmdJZDogJ3Rva2VuLWEtdGlkJyxcblx0XHRcdHRlbGVtZXRyeUVuZHBvaW50OiAnaHR0cHM6Ly90b2tlbi1hLnRlbGVtZXRyeS5leGFtcGxlLycsXG5cdFx0XHRpc0ludGVybmFsOiB0cnVlLFxuXHRcdFx0dXNlck5hbWU6ICd0b2tlbi1hLXVzZXInLFxuXHRcdFx0aXNWc2NvZGVUZWFtTWVtYmVyOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0cy5zZXQoJ3Rva2VuLWInLCB7XG5cdFx0XHRyZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZDogZmFsc2UsXG5cdFx0XHR0cmFja2luZ0lkOiAndG9rZW4tYi10aWQnLFxuXHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGlzSW50ZXJuYWw6IGZhbHNlLFxuXHRcdFx0dXNlck5hbWU6ICd0b2tlbi1iLXVzZXInLFxuXHRcdFx0aXNWc2NvZGVUZWFtTWVtYmVyOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBjbGFzcyBleHRlbmRzIEFnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2Uge1xuXHRcdFx0cmVhZG9ubHkgZW5oYW5jZWRDb250ZXh0czogSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0W10gPSBbXTtcblx0XHRcdHJlYWRvbmx5IGludGVybmFsQ29udGV4dHM6IElBZ2VudEhvc3RJbnRlcm5hbFRlbGVtZXRyeUNvbnRleHRbXSA9IFtdO1xuXHRcdFx0b3ZlcnJpZGUgc2VuZEVuaGFuY2VkR0hUZWxlbWV0cnlFdmVudEZvckNvbnRleHQoY29udGV4dDogSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0KTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuZW5oYW5jZWRDb250ZXh0cy5wdXNoKGNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgc2VuZEludGVybmFsTVNGVFRlbGVtZXRyeUV2ZW50Rm9yQ29udGV4dChjb250ZXh0OiBJQWdlbnRIb3N0SW50ZXJuYWxUZWxlbWV0cnlDb250ZXh0KTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuaW50ZXJuYWxDb250ZXh0cy5wdXNoKGNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH0oTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQsIGNvcGlsb3RBcGlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlIH0pIGFzIFRlc3RhYmxlQ29waWxvdEFnZW50O1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4tYScpO1xuXHRcdFx0YXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBmb3J3YXJkID0gZ2V0Q3JlYXRlZENsaWVudE9wdGlvbnMoYWdlbnQpLmF0KC0xKT8ub25HaXRIdWJUZWxlbWV0cnk7XG5cdFx0XHRhc3NlcnQub2soZm9yd2FyZCk7XG5cblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbjogR2l0SHViVGVsZW1ldHJ5Tm90aWZpY2F0aW9uID0ge1xuXHRcdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLWEnLFxuXHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0XHRldmVudDogeyBraW5kOiAnZW5naW5lLm1lc3NhZ2VzLmxlbmd0aCcsIHByb3BlcnRpZXM6IHt9LCBtZXRyaWNzOiB7fSB9LFxuXHRcdFx0fTtcblx0XHRcdGF3YWl0IGZvcndhcmQobm90aWZpY2F0aW9uKTtcblxuXHRcdFx0Ly8gU3dhcHBpbmcgdGhlIGN1cnJlbnQgYXV0aCB0b2tlbiB0byBvcHRlZC1vdXQgdG9rZW4tYjogbGF0ZXIgZXZlbnRzIHJlc29sdmUgY29udGV4dCBmcm9tIGl0IGFuZCBlbWl0IG5vdGhpbmcuXG5cdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4tYicpO1xuXHRcdFx0YXdhaXQgZm9yd2FyZChub3RpZmljYXRpb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZW5oYW5jZWRDb250ZXh0czogdGVsZW1ldHJ5U2VydmljZS5lbmhhbmNlZENvbnRleHRzLFxuXHRcdFx0XHRpbnRlcm5hbENvbnRleHRzOiB0ZWxlbWV0cnlTZXJ2aWNlLmludGVybmFsQ29udGV4dHMubWFwKGNvbnRleHQgPT4gKHtcblx0XHRcdFx0XHRpc0ludGVybmFsOiBjb250ZXh0LmlzSW50ZXJuYWwsXG5cdFx0XHRcdFx0dHJhY2tpbmdJZDogY29udGV4dC50cmFja2luZ0lkLFxuXHRcdFx0XHRcdHVzZXJOYW1lOiBjb250ZXh0LnVzZXJOYW1lLFxuXHRcdFx0XHRcdGlzVnNjb2RlVGVhbU1lbWJlcjogY29udGV4dC5pc1ZzY29kZVRlYW1NZW1iZXIsXG5cdFx0XHRcdH0pKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZW5oYW5jZWRDb250ZXh0czogW3tcblx0XHRcdFx0XHRyZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHR0cmFja2luZ0lkOiAndG9rZW4tYS10aWQnLFxuXHRcdFx0XHRcdHRlbGVtZXRyeUVuZHBvaW50OiAnaHR0cHM6Ly90b2tlbi1hLnRlbGVtZXRyeS5leGFtcGxlL3RlbGVtZXRyeScsXG5cdFx0XHRcdFx0aXNJbnRlcm5hbDogdHJ1ZSxcblx0XHRcdFx0XHR1c2VyTmFtZTogJ3Rva2VuLWEtdXNlcicsXG5cdFx0XHRcdFx0aXNWc2NvZGVUZWFtTWVtYmVyOiB0cnVlLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0aW50ZXJuYWxDb250ZXh0czogW3tcblx0XHRcdFx0XHRpc0ludGVybmFsOiB0cnVlLFxuXHRcdFx0XHRcdHRyYWNraW5nSWQ6ICd0b2tlbi1hLXRpZCcsXG5cdFx0XHRcdFx0dXNlck5hbWU6ICd0b2tlbi1hLXVzZXInLFxuXHRcdFx0XHRcdGlzVnNjb2RlVGVhbU1lbWJlcjogdHJ1ZSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2FkdmVydGlzZXMgQ29waWxvdCBhcyBpdHMgZGlzcGxheSBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5nZXREZXNjcmlwdG9yKCksIHtcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdDb3BpbG90Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdDb3BpbG90IFNESyBhZ2VudCBydW5uaW5nIGluIHRoZSBsb2NhbCBhZ2VudCBob3N0IHByb2Nlc3MnLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgbXVsdGlwbGVDaGF0czogeyBmb3JrOiB0cnVlLCBzaWRlQ2hhdDogdHJ1ZSB9IH0sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2FkdmVydGlzZXMgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXMgb25seSB3aGVuIHRoZSBoaWRkZW4gc2V0dGluZyBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYWdlbnQsIHN0YXRlTWFuYWdlciB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcyk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNldE11bHRpUm9vdCA9IChlbmFibGVkOiBib29sZWFuKSA9PiBzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IGVuYWJsZWQgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZGlzYWJsZWRCeURlZmF1bHQgPSBhZ2VudC5nZXREZXNjcmlwdG9yKCkuY2FwYWJpbGl0aWVzPy5tdWx0aXBsZVdvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRcdHNldE11bHRpUm9vdCh0cnVlKTtcblx0XHRcdGNvbnN0IHdoZW5FbmFibGVkID0gYWdlbnQuZ2V0RGVzY3JpcHRvcigpLmNhcGFiaWxpdGllcz8ubXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0XHRzZXRNdWx0aVJvb3QoZmFsc2UpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJEaXNhYmxpbmcgPSBhZ2VudC5nZXREZXNjcmlwdG9yKCkuY2FwYWJpbGl0aWVzPy5tdWx0aXBsZVdvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBkaXNhYmxlZEJ5RGVmYXVsdCwgd2hlbkVuYWJsZWQsIGFmdGVyRGlzYWJsaW5nIH0sIHtcblx0XHRcdFx0ZGlzYWJsZWRCeURlZmF1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0d2hlbkVuYWJsZWQ6IHsgaW1tdXRhYmxlUHJpbWFyeTogdHJ1ZSB9LFxuXHRcdFx0XHRhZnRlckRpc2FibGluZzogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHRzdWl0ZSgnc3Bhd25lZCBjaGF0IGNoYW5uZWwnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gZmlyZVNpZ25hbChhZ2VudDogQ29waWxvdEFnZW50LCBzaWduYWw6IEFnZW50U2lnbmFsKTogdm9pZCB7XG5cdFx0XHQoYWdlbnQgYXMgdW5rbm93biBhcyB7IF9vbkRpZFNlc3Npb25Qcm9ncmVzczogeyBmaXJlKHM6IEFnZW50U2lnbmFsKTogdm9pZCB9IH0pLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHNpZ25hbCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnbWlycm9ycyBzdWJhZ2VudF9zdGFydGVkIG9udG8gb25EaWRTcGF3bkNoYXQ7IHN1YmFnZW50X2NvbXBsZXRlZCBsZWF2ZXMgdGhlIGNoYXQgbGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRcdGNvbnN0IHNwYXduZWQ6IElBZ2VudFNwYXduQ2hhdEV2ZW50W10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZFNwYXduQ2hhdChlID0+IHNwYXduZWQucHVzaChlKSkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnc3Bhd24tc2Vzc2lvbicpO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCB0b29sQ2FsbElkID0gJ3Rvb2wtNDInO1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZENoYXQgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKHBhcmVudENoYXQpLCB0b29sQ2FsbElkKTtcblxuXHRcdFx0XHRmaXJlU2lnbmFsKGFnZW50LCB7XG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLFxuXHRcdFx0XHRcdGNoYXQ6IFVSSS5wYXJzZShwYXJlbnRDaGF0KSxcblx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ3Jlc2VhcmNoZXInLFxuXHRcdFx0XHRcdGFnZW50RGlzcGxheU5hbWU6ICdSZXNlYXJjaGVyJyxcblx0XHRcdFx0XHRhZ2VudERlc2NyaXB0aW9uOiAnTG9va3MgdGhpbmdzIHVwJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdC8vIFVucmVsYXRlZCBzaWduYWxzIG11c3Qgbm90IHByb2R1Y2Ugc3Bhd24gZXZlbnRzLlxuXHRcdFx0XHRmaXJlU2lnbmFsKGFnZW50LCB7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogc2Vzc2lvblVyaSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICd4JyB9IH0pO1xuXHRcdFx0XHQvLyBBIGNvbXBsZXRlZCBzdWJhZ2VudCBjaGF0IHN0YXlzIGxpdmUgKHJlbW92ZWQgb25seSBvbiBzZXNzaW9uIHRlYXJkb3duKS5cblx0XHRcdFx0ZmlyZVNpZ25hbChhZ2VudCwgeyBraW5kOiAnc3ViYWdlbnRfY29tcGxldGVkJywgY2hhdDogVVJJLnBhcnNlKHBhcmVudENoYXQpLCB0b29sQ2FsbElkIH0pO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdHNwYXduZWQ6IHNwYXduZWQubWFwKGUgPT4gKHtcblx0XHRcdFx0XHRcdHNlc3Npb246IGUuc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0Y2hhdDogZS5jaGF0LnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRwYXJlbnQ6IGUucGFyZW50ID8geyBjaGF0OiBlLnBhcmVudC5jaGF0LnRvU3RyaW5nKCksIHRvb2xDYWxsSWQ6IGUucGFyZW50LnRvb2xDYWxsSWQgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHRpdGxlOiBlLnRpdGxlLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHNwYXduZWQ6IFt7XG5cdFx0XHRcdFx0XHRzZXNzaW9uOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRjaGF0OiBleHBlY3RlZENoYXQsXG5cdFx0XHRcdFx0XHRwYXJlbnQ6IHsgY2hhdDogcGFyZW50Q2hhdCwgdG9vbENhbGxJZCB9LFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdSZXNlYXJjaGVyJyxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGdlbmVyYXRlZCBBZ2VudHMtd2luZG93IENvcGlsb3QgQ0xJIGJyYW5jaCBuYW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZSA9ICdhZGQtYWdlbnQtaG9zdC1jb25maWcnO1xuXHRcdGNvbnN0IGdlbmVyYXRvciA9IG5ldyBBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IoY29waWxvdEFwaVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2VuZXJhdGVkOiBhd2FpdCBnZW5lcmF0b3IuZ2VuZXJhdGVCcmFuY2hOYW1lKHsgc2Vzc2lvbklkOiAnMTIzNDU2NzgtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjJywgbWVzc2FnZTogJ0FkZCBhZ2VudCBob3N0IGNvbmZpZycsIGdpdGh1YlRva2VuOiAndG9rZW4nIH0pLFxuXHRcdFx0ZmFsbGJhY2s6IGF3YWl0IGdlbmVyYXRvci5nZW5lcmF0ZUJyYW5jaE5hbWUoeyBzZXNzaW9uSWQ6ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnLCBtZXNzYWdlOiAnQWRkIGFnZW50IGhvc3QgY29uZmlnJyB9KSxcblx0XHRcdHRva2VuOiBjb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2FsbHNbMF0/LnRva2VuLFxuXHRcdFx0cHJvbXB0SW5jbHVkZXNVc2VyVGV4dDogY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNhbGxzWzBdPy5yZXF1ZXN0Lm1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmNvbnRlbnQuaW5jbHVkZXMoJ0FkZCBhZ2VudCBob3N0IGNvbmZpZycpKSxcblx0XHR9LCB7XG5cdFx0XHRnZW5lcmF0ZWQ6ICdhZ2VudHMvYWRkLWFnZW50LWhvc3QtY29uZmlnJyxcblx0XHRcdGZhbGxiYWNrOiAnYWdlbnRzL2FkZC1hZ2VudC1ob3N0LWNvbmZpZycsXG5cdFx0XHR0b2tlbjogJ3Rva2VuJyxcblx0XHRcdHByb21wdEluY2x1ZGVzVXNlclRleHQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRzIGFuIGF2YWlsYWJsZSBicmFuY2ggbmFtZSB3aGVuIGNhbmRpZGF0ZXMgY29sbGlkZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb3BpbG90QXBpU2VydmljZS5yZXNwb25zZSA9ICdhZGQtYWdlbnQtaG9zdC1jb25maWcnO1xuXHRcdGNvbnN0IGdlbmVyYXRvciA9IG5ldyBBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IoY29waWxvdEFwaVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBjb2xsaXNpb25zID0gbmV3IFNldChbXG5cdFx0XHQnYWdlbnRzL2FkZC1hZ2VudC1ob3N0LWNvbmZpZycsXG5cdFx0XHQnYWdlbnRzL2FkZC1hZ2VudC1ob3N0LWNvbmZpZy0xMjM0NTY3OCcsXG5cdFx0XHQnYWdlbnRzLzEyMzQ1Njc4LWFhYWEtYmJiYi1jY2NjLTEyMzQ1Njc4OWFiYycsXG5cdFx0XSk7XG5cdFx0Y29uc3QgZXhoYXVzdGVkQ2FuZGlkYXRlczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgZXhoYXVzdGlvbkVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGdlbmVyYXRvci5nZW5lcmF0ZUJyYW5jaE5hbWUoe1xuXHRcdFx0XHRzZXNzaW9uSWQ6ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnLFxuXHRcdFx0XHRicmFuY2hOYW1lQ29sbGlkZXM6IGFzeW5jIG5hbWUgPT4ge1xuXHRcdFx0XHRcdGV4aGF1c3RlZENhbmRpZGF0ZXMucHVzaChuYW1lKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRleGhhdXN0aW9uRXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1bmlxdWU6IGF3YWl0IGdlbmVyYXRvci5nZW5lcmF0ZUJyYW5jaE5hbWUoeyBzZXNzaW9uSWQ6ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnLCBtZXNzYWdlOiAnQWRkIGFnZW50IGhvc3QgY29uZmlnJywgZ2l0aHViVG9rZW46ICd0b2tlbicsIGJyYW5jaE5hbWVDb2xsaWRlczogYXN5bmMgKCkgPT4gZmFsc2UgfSksXG5cdFx0XHRjb2xsaXNpb246IGF3YWl0IGdlbmVyYXRvci5nZW5lcmF0ZUJyYW5jaE5hbWUoeyBzZXNzaW9uSWQ6ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnLCBtZXNzYWdlOiAnQWRkIGFnZW50IGhvc3QgY29uZmlnJywgZ2l0aHViVG9rZW46ICd0b2tlbicsIGJyYW5jaE5hbWVDb2xsaWRlczogYXN5bmMgbmFtZSA9PiBuYW1lID09PSAnYWdlbnRzL2FkZC1hZ2VudC1ob3N0LWNvbmZpZycgfSksXG5cdFx0XHRyZXBlYXRlZENvbGxpc2lvbjogYXdhaXQgZ2VuZXJhdG9yLmdlbmVyYXRlQnJhbmNoTmFtZSh7IHNlc3Npb25JZDogJzEyMzQ1Njc4LWFhYWEtYmJiYi1jY2NjLTEyMzQ1Njc4OWFiYycsIG1lc3NhZ2U6ICdBZGQgYWdlbnQgaG9zdCBjb25maWcnLCBnaXRodWJUb2tlbjogJ3Rva2VuJywgYnJhbmNoTmFtZUNvbGxpZGVzOiBhc3luYyBuYW1lID0+IGNvbGxpc2lvbnMuaGFzKG5hbWUpIH0pLFxuXHRcdFx0ZmFsbGJhY2tDb2xsaXNpb246IGF3YWl0IGdlbmVyYXRvci5nZW5lcmF0ZUJyYW5jaE5hbWUoeyBzZXNzaW9uSWQ6ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnLCBicmFuY2hOYW1lQ29sbGlkZXM6IGFzeW5jIG5hbWUgPT4gY29sbGlzaW9ucy5oYXMobmFtZSkgfSksXG5cdFx0XHRleGhhdXN0aW9uOiB7XG5cdFx0XHRcdGVycm9yOiBleGhhdXN0aW9uRXJyb3IsXG5cdFx0XHRcdGNhbmRpZGF0ZUNvdW50OiBleGhhdXN0ZWRDYW5kaWRhdGVzLmxlbmd0aCxcblx0XHRcdFx0Zmlyc3RDYW5kaWRhdGU6IGV4aGF1c3RlZENhbmRpZGF0ZXNbMF0sXG5cdFx0XHRcdGxhc3RDYW5kaWRhdGU6IGV4aGF1c3RlZENhbmRpZGF0ZXMuYXQoLTEpLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHR1bmlxdWU6ICdhZ2VudHMvYWRkLWFnZW50LWhvc3QtY29uZmlnJyxcblx0XHRcdGNvbGxpc2lvbjogJ2FnZW50cy9hZGQtYWdlbnQtaG9zdC1jb25maWctMTIzNDU2NzgnLFxuXHRcdFx0cmVwZWF0ZWRDb2xsaXNpb246ICdhZ2VudHMvYWRkLWFnZW50LWhvc3QtY29uZmlnLTEyMzQ1Njc4LTInLFxuXHRcdFx0ZmFsbGJhY2tDb2xsaXNpb246ICdhZ2VudHMvMTIzNDU2NzgtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjLTInLFxuXHRcdFx0ZXhoYXVzdGlvbjoge1xuXHRcdFx0XHRlcnJvcjogJ1VuYWJsZSB0byBmaW5kIGFuIGF2YWlsYWJsZSBicmFuY2ggbmFtZSBhZnRlciBjaGVja2luZyAxMDAgY2FuZGlkYXRlcycsXG5cdFx0XHRcdGNhbmRpZGF0ZUNvdW50OiAxMDAsXG5cdFx0XHRcdGZpcnN0Q2FuZGlkYXRlOiAnYWdlbnRzLzEyMzQ1Njc4LWFhYWEtYmJiYi1jY2NjLTEyMzQ1Njc4OWFiYycsXG5cdFx0XHRcdGxhc3RDYW5kaWRhdGU6ICdhZ2VudHMvMTIzNDU2NzgtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjLTEwMCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwZW5kcyB0aGUgYnJhbmNoIHByZWZpeCBhaGVhZCBvZiB0aGUgYnVpbHQtaW4gYWdlbnRzLyBwcmVmaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2UgPSAnYWRkLWFnZW50LWhvc3QtY29uZmlnJztcblx0XHRjb25zdCBnZW5lcmF0b3IgPSBuZXcgQWdlbnRCcmFuY2hOYW1lR2VuZXJhdG9yKGNvcGlsb3RBcGlTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdpdGhQcmVmaXg6IGF3YWl0IGdlbmVyYXRvci5nZW5lcmF0ZUJyYW5jaE5hbWUoeyBzZXNzaW9uSWQ6ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnLCBtZXNzYWdlOiAnQWRkIGFnZW50IGhvc3QgY29uZmlnJywgZ2l0aHViVG9rZW46ICd0b2tlbicsIGJyYW5jaFByZWZpeDogJ3VzZXJzL2FsaWNlLycgfSksXG5cdFx0XHRlbXB0eVByZWZpeDogYXdhaXQgZ2VuZXJhdG9yLmdlbmVyYXRlQnJhbmNoTmFtZSh7IHNlc3Npb25JZDogJzEyMzQ1Njc4LWFhYWEtYmJiYi1jY2NjLTEyMzQ1Njc4OWFiYycsIG1lc3NhZ2U6ICdBZGQgYWdlbnQgaG9zdCBjb25maWcnLCBnaXRodWJUb2tlbjogJ3Rva2VuJywgYnJhbmNoUHJlZml4OiAnJyB9KSxcblx0XHRcdGZhbGxiYWNrV2l0aFByZWZpeDogYXdhaXQgZ2VuZXJhdG9yLmdlbmVyYXRlQnJhbmNoTmFtZSh7IHNlc3Npb25JZDogJzEyMzQ1Njc4LWFhYWEtYmJiYi1jY2NjLTEyMzQ1Njc4OWFiYycsIGJyYW5jaFByZWZpeDogJ3VzZXJzL2FsaWNlLycgfSksXG5cdFx0fSwge1xuXHRcdFx0d2l0aFByZWZpeDogJ3VzZXJzL2FsaWNlL2FnZW50cy9hZGQtYWdlbnQtaG9zdC1jb25maWcnLFxuXHRcdFx0ZW1wdHlQcmVmaXg6ICdhZ2VudHMvYWRkLWFnZW50LWhvc3QtY29uZmlnJyxcblx0XHRcdGZhbGxiYWNrV2l0aFByZWZpeDogJ3VzZXJzL2FsaWNlL2FnZW50cy8xMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBnZW5lcmF0ZWQgYnJhbmNoIG5hbWVzIHNob3J0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJ2EnLnJlcGVhdCgxMDApO1xuXHRcdGNvbnN0IGdlbmVyYXRvciA9IG5ldyBBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IoY29waWxvdEFwaVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdChhd2FpdCBnZW5lcmF0b3IuZ2VuZXJhdGVCcmFuY2hOYW1lKHsgc2Vzc2lvbklkOiAnMTIzNDU2NzgtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjJywgbWVzc2FnZTogJ0FkZCBhZ2VudCBob3N0IGNvbmZpZycsIGdpdGh1YlRva2VuOiAndG9rZW4nIH0pKS5sZW5ndGgsXG5cdFx0XHQnYWdlbnRzLycubGVuZ3RoICsgNDgsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplcyBnZW5lcmF0ZWQgYnJhbmNoIG5hbWVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2ltcGxlOiBub3JtYWxpemVBZ2VudEJyYW5jaE5hbWUoJ2ZlYXR1cmUtYnJhbmNoJyksXG5cdFx0XHR1cHBlcmNhc2U6IG5vcm1hbGl6ZUFnZW50QnJhbmNoTmFtZSgnRmVhdHVyZS1CcmFuY2gnKSxcblx0XHRcdHNwZWNpYWw6IG5vcm1hbGl6ZUFnZW50QnJhbmNoTmFtZSgnRml4OiBBZGQgbmV3IGZlYXR1cmUhICgjNDIpJyksXG5cdFx0XHR1bmljb2RlOiBub3JtYWxpemVBZ2VudEJyYW5jaE5hbWUoJ2NhZlx1MDBFOS1mZWF0dXJlJyksXG5cdFx0XHRlbXB0eTogbm9ybWFsaXplQWdlbnRCcmFuY2hOYW1lKCdcdUQ4M0RcdURFODBcdUQ4M0NcdURGODknKSxcblx0XHR9LCB7XG5cdFx0XHRzaW1wbGU6ICdmZWF0dXJlLWJyYW5jaCcsXG5cdFx0XHR1cHBlcmNhc2U6ICdmZWF0dXJlLWJyYW5jaCcsXG5cdFx0XHRzcGVjaWFsOiAnZml4YWRkbmV3ZmVhdHVyZTQyJyxcblx0XHRcdHVuaWNvZGU6ICdjYWYtZmVhdHVyZScsXG5cdFx0XHRlbXB0eTogJycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlcml2ZXMgc2x1ZyBicmFuY2ggaGludCBmcm9tIGZpcnN0IG1lc3NhZ2UgZm9yIGZhbGxiYWNrJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2ltcGxlOiBnZXRBZ2VudEJyYW5jaE5hbWVIaW50RnJvbU1lc3NhZ2UoJ0FkZCBhZ2VudCBob3N0IGNvbmZpZycpLFxuXHRcdFx0cHVuY3R1YXRpb246IGdldEFnZW50QnJhbmNoTmFtZUhpbnRGcm9tTWVzc2FnZSgnICBGaXg6IHRoZSBidWchISAnKSxcblx0XHRcdHVuaWNvZGU6IGdldEFnZW50QnJhbmNoTmFtZUhpbnRGcm9tTWVzc2FnZSgnUmVmYWN0b3IgY2FmXHUwMEU5IFx1MjYxNSByZW5kZXJpbmcnKSxcblx0XHRcdHdvcmRzOiBnZXRBZ2VudEJyYW5jaE5hbWVIaW50RnJvbU1lc3NhZ2UoJ29uZSB0d28gdGhyZWUgZm91ciBmaXZlIHNpeCBzZXZlbiBlaWdodCBuaW5lIHRlbicpLFxuXHRcdFx0bG9uZzogZ2V0QWdlbnRCcmFuY2hOYW1lSGludEZyb21NZXNzYWdlKCdhJy5yZXBlYXQoMTAwKSk/Lmxlbmd0aCxcblx0XHRcdGVtcHR5OiBnZXRBZ2VudEJyYW5jaE5hbWVIaW50RnJvbU1lc3NhZ2UoJyEhISA/Pz8gLi4uJyksXG5cdFx0fSwge1xuXHRcdFx0c2ltcGxlOiAnYWRkLWFnZW50LWhvc3QtY29uZmlnJyxcblx0XHRcdHB1bmN0dWF0aW9uOiAnZml4LXRoZS1idWcnLFxuXHRcdFx0dW5pY29kZTogJ3JlZmFjdG9yLWNhZmUtcmVuZGVyaW5nJyxcblx0XHRcdHdvcmRzOiAnb25lLXR3by10aHJlZS1mb3VyLWZpdmUtc2l4LXNldmVuLWVpZ2h0Jyxcblx0XHRcdGxvbmc6IDQ4LFxuXHRcdFx0ZW1wdHk6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBmaXJzdC1tZXNzYWdlIHNsdWcgd2hlbiBnZW5lcmF0ZWQgYnJhbmNoIG5hbWUgY2Fubm90IGJlIHVzZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2UgPSAnISEhID8/PyAuLi4nO1xuXHRcdGNvbnN0IGdlbmVyYXRvciA9IG5ldyBBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IoY29waWxvdEFwaVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGF3YWl0IGdlbmVyYXRvci5nZW5lcmF0ZUJyYW5jaE5hbWUoeyBzZXNzaW9uSWQ6ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnLCBtZXNzYWdlOiAnQWRkIGFnZW50IGhvc3QgY29uZmlnJywgZ2l0aHViVG9rZW46ICd0b2tlbicgfSksXG5cdFx0XHQnYWdlbnRzL2FkZC1hZ2VudC1ob3N0LWNvbmZpZycsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBmaXJzdC1tZXNzYWdlIHNsdWcgd2hlbiBicmFuY2ggbmFtZSBnZW5lcmF0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLmVycm9yID0gbmV3IEVycm9yKCdmYWlsZWQnKTtcblx0XHRjb25zdCBnZW5lcmF0b3IgPSBuZXcgQWdlbnRCcmFuY2hOYW1lR2VuZXJhdG9yKGNvcGlsb3RBcGlTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCBnZW5lcmF0b3IuZ2VuZXJhdGVCcmFuY2hOYW1lKHsgc2Vzc2lvbklkOiAnMTIzNDU2NzgtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjJywgbWVzc2FnZTogJ0FkZCBhZ2VudCBob3N0IGNvbmZpZycsIGdpdGh1YlRva2VuOiAndG9rZW4nIH0pLFxuXHRcdFx0J2FnZW50cy9hZGQtYWdlbnQtaG9zdC1jb25maWcnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gc2Vzc2lvbiBpZCB3aGVuIG5vIGJyYW5jaCBuYW1lIGNhbiBiZSBkZXJpdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlID0gJyEhISA/Pz8gLi4uJztcblx0XHRjb25zdCBnZW5lcmF0b3IgPSBuZXcgQWdlbnRCcmFuY2hOYW1lR2VuZXJhdG9yKGNvcGlsb3RBcGlTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCBnZW5lcmF0b3IuZ2VuZXJhdGVCcmFuY2hOYW1lKHsgc2Vzc2lvbklkOiAnMTIzNDU2NzgtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjJywgbWVzc2FnZTogJyEhISA/Pz8gLi4uJywgZ2l0aHViVG9rZW46ICd0b2tlbicgfSksXG5cdFx0XHQnYWdlbnRzLzEyMzQ1Njc4LWFhYWEtYmJiYi1jY2NjLTEyMzQ1Njc4OWFiYycsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29udHJpYnV0ZXMgR0hFLWF3YXJlIEdpdEh1YiBhbmQgZGlzY292ZXJlZCBDQVBJIGRpYWdub3N0aWNzIGVuZHBvaW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBlbmRwb2ludFNlcnZpY2UgPSBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCdodHRwczovL2dpdGh1Yi5leGFtcGxlLmNvbScpO1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLmFwaUVuZHBvaW50ID0gJ2h0dHBzOi8vY29waWxvdC5leGFtcGxlLmNvbSc7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UudXNlckxvZ2luID0gJ29jdG9jYXQnO1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RBcGlTZXJ2aWNlLCBnaXRIdWJFbmRwb2ludFNlcnZpY2U6IGVuZHBvaW50U2VydmljZSB9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKGVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKS5yZXNvdXJjZSwgJ3Rva2VuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRlbmRwb2ludHM6IGF3YWl0IGFnZW50LmdldE5ldHdvcmtEaWFnbm9zdGljc0VuZHBvaW50cygpLFxuXHRcdFx0XHRhY2NvdW50OiBhd2FpdCBhZ2VudC5nZXROZXR3b3JrRGlhZ25vc3RpY3NBY2NvdW50KCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGVuZHBvaW50czogW1xuXHRcdFx0XHRcdHsgbmFtZTogJ0dpdEh1YiBBUEknLCB1cmw6IGVuZHBvaW50U2VydmljZS5nZXRBcGlCYXNlVXJpKCkgfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdDb3BpbG90IEFQSSAoQ0FQSSknLCB1cmw6ICdodHRwczovL2NvcGlsb3QuZXhhbXBsZS5jb20vX3BpbmcnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGFjY291bnQ6ICdvY3RvY2F0Jyxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSBtb2RlbHMgYW5kIGxpc3RzIHNlc3Npb25zIGJlZm9yZSBhdXRoZW50aWNhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgb3duZWRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdvd25lZC1iZWZvcmUtYXV0aCcpO1xuXHRcdGNvbnN0IG93bmVkRGIgPSBzZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKG93bmVkU2Vzc2lvbik7XG5cdFx0b3duZWREYi5kaXNwb3NlKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtzZGtTZXNzaW9uKCdvd25lZC1iZWZvcmUtYXV0aCcpXSk7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bW9kZWxzOiBhZ2VudC5tb2RlbHMuZ2V0KCksXG5cdFx0XHRcdHNlc3Npb25zOiBzZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbi5zZXNzaW9uKSksXG5cdFx0XHRcdHN0YXJ0czogY2xpZW50LnN0YXJ0Q2FsbENvdW50LFxuXHRcdFx0XHRsaXN0Q2FsbHM6IGNsaWVudC5saXN0U2Vzc2lvbkNhbGxDb3VudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0bW9kZWxzOiBbXSxcblx0XHRcdFx0c2Vzc2lvbnM6IFsnb3duZWQtYmVmb3JlLWF1dGgnXSxcblx0XHRcdFx0c3RhcnRzOiAxLFxuXHRcdFx0XHRsaXN0Q2FsbHM6IDEsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0cyB0aGUgY2xpZW50IGFuZCBjcmVhdGVzIGEgcHJvdmlzaW9uYWwgc2Vzc2lvbiBiZWZvcmUgYXV0aGVudGljYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAndW5hdXRoLWNyZWF0ZScpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHsgc2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNlc3Npb246IHJlc3VsdC5zZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHJlc3VsdC5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlzaW9uYWw6IHJlc3VsdC5wcm92aXNpb25hbCxcblx0XHRcdFx0c3RhcnRzOiBjbGllbnQuc3RhcnRDYWxsQ291bnQsXG5cdFx0XHRcdHN0b3BzOiBjbGllbnQuc3RvcENhbGxDb3VudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2Vzc2lvbjogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCksXG5cdFx0XHRcdHByb3Zpc2lvbmFsOiB0cnVlLFxuXHRcdFx0XHRzdGFydHM6IDEsXG5cdFx0XHRcdHN0b3BzOiAwLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwYXNzZXMgdGhlIEdpdEh1YiB0b2tlbiB3aGVuIHJlZnJlc2hpbmcgbW9kZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSwgW3tcblx0XHRcdGlkOiAnZ3B0LTRvJyxcblx0XHRcdG5hbWU6ICdHUFQtNG8nLFxuXHRcdH1dKTtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICdtb2RlbC10b2tlbicpO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKGFnZW50Lm1vZGVscywgbW9kZWxzID0+IG1vZGVscy5sZW5ndGggPiAwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMsIFt7IGdpdEh1YlRva2VuOiAnbW9kZWwtdG9rZW4nIH1dKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHN0b3AgdGhlIGNsaWVudCB3aGVuIHRoZSBhdXRoIHRva2VuIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdLCBbe1xuXHRcdFx0aWQ6ICdncHQtNG8nLFxuXHRcdFx0bmFtZTogJ0dQVC00bycsXG5cdFx0fV0pO1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAnbW9kZWwtdG9rZW4tYScpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyMDAgJiYgY2xpZW50Lm1vZGVsTGlzdFJlcXVlc3RzLmxlbmd0aCA8IDE7IGkrKykge1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ21vZGVsLXRva2VuLWInKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjAwICYmIGNsaWVudC5tb2RlbExpc3RSZXF1ZXN0cy5sZW5ndGggPCAyOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXJ0czogY2xpZW50LnN0YXJ0Q2FsbENvdW50LFxuXHRcdFx0XHRzdG9wczogY2xpZW50LnN0b3BDYWxsQ291bnQsXG5cdFx0XHRcdHJlcXVlc3RzOiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXJ0czogMSxcblx0XHRcdFx0c3RvcHM6IDAsXG5cdFx0XHRcdHJlcXVlc3RzOiBbeyBnaXRIdWJUb2tlbjogJ21vZGVsLXRva2VuLWEnIH0sIHsgZ2l0SHViVG9rZW46ICdtb2RlbC10b2tlbi1iJyB9XSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmV0cmllcyByZWZyZXNoaW5nIG1vZGVscyBhZnRlciBhIHRyYW5zaWVudCBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSwgW3tcblx0XHRcdGlkOiAnZ3B0LTRvJyxcblx0XHRcdG5hbWU6ICdHUFQtNG8nLFxuXHRcdH1dKTtcblx0XHRjbGllbnQubW9kZWxMaXN0RXJyb3JzLnB1c2gobmV3IEVycm9yKCc0MjkgXCJ0b28gbWFueSByZXF1ZXN0c1wiJykpO1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoYWdlbnQubW9kZWxzLCBtID0+IG0ubGVuZ3RoID4gMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRtb2RlbE5hbWVzOiBtb2RlbHMubWFwKG0gPT4gbS5uYW1lKSxcblx0XHRcdFx0cmVxdWVzdENvdW50OiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtb2RlbE5hbWVzOiBbJ0dQVC00byddLFxuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IDIsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3BzIHJlZnJlc2hpbmcgbW9kZWxzIGFmdGVyIHRoZSBtYXhpbXVtIG51bWJlciBvZiBhdHRlbXB0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10sIFt7XG5cdFx0XHRpZDogJ2dwdC00bycsXG5cdFx0XHRuYW1lOiAnR1BULTRvJyxcblx0XHR9XSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG5cdFx0XHRjbGllbnQubW9kZWxMaXN0RXJyb3JzLnB1c2gobmV3IEVycm9yKCc0MjkgXCJ0b28gbWFueSByZXF1ZXN0c1wiJykpO1xuXHRcdH1cblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDAgJiYgY2xpZW50Lm1vZGVsTGlzdFJlcXVlc3RzLmxlbmd0aCA8IDU7IGkrKykge1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMSkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gR2l2ZSBhbnkgZXJyb25lb3VzIGV4dHJhIHJldHJ5IGEgY2hhbmNlIHRvIGZpcmUgYmVmb3JlIGFzc2VydGluZy5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVxdWVzdENvdW50OiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0XHRtb2RlbHM6IGFnZW50Lm1vZGVscy5nZXQoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVxdWVzdENvdW50OiA1LFxuXHRcdFx0XHRtb2RlbHM6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgcHJldmlvdXNseSBsb2FkZWQgbW9kZWxzIHdoZW4gYSBsYXRlciByZWZyZXNoIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSwgW3tcblx0XHRcdGlkOiAnZ3B0LTRvJyxcblx0XHRcdG5hbWU6ICdHUFQtNG8nLFxuXHRcdH1dKTtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbi1hJyk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoYWdlbnQubW9kZWxzLCBtID0+IG0ubGVuZ3RoID4gMCk7XG5cblx0XHRcdC8vIEEgcmVmcmVzaCB0cmlnZ2VyZWQgYnkgdGhlIG5leHQgdG9rZW4gY2hhbmdlIGZhaWxzIG9uIGV2ZXJ5IGF0dGVtcHQuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdFx0Y2xpZW50Lm1vZGVsTGlzdEVycm9ycy5wdXNoKG5ldyBFcnJvcignNDI5IFwidG9vIG1hbnkgcmVxdWVzdHNcIicpKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcXVlc3RzQmVmb3JlID0gY2xpZW50Lm1vZGVsTGlzdFJlcXVlc3RzLmxlbmd0aDtcblx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbi1iJyk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwMCAmJiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoIDwgcmVxdWVzdHNCZWZvcmUgKyA1OyBpKyspIHtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bW9kZWxOYW1lczogYWdlbnQubW9kZWxzLmdldCgpLm1hcChtID0+IG0ubmFtZSksXG5cdFx0XHRcdHJldHJpZWRSZXF1ZXN0czogY2xpZW50Lm1vZGVsTGlzdFJlcXVlc3RzLmxlbmd0aCAtIHJlcXVlc3RzQmVmb3JlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtb2RlbE5hbWVzOiBbJ0dQVC00byddLFxuXHRcdFx0XHRyZXRyaWVkUmVxdWVzdHM6IDUsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvYWxlc2NlcyBjb25jdXJyZW50IHJlZnJlc2hNb2RlbHMgY2FsbHMgb250byBvbmUgbW9kZWxzLmxpc3QgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10sIFt7XG5cdFx0XHRpZDogJ2dwdC00bycsXG5cdFx0XHRuYW1lOiAnR1BULTRvJyxcblx0XHR9XSk7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBCbG9jayB0aGUgZmlyc3QgcmVxdWVzdCBpbiBmbGlnaHQgc28gdGhlIHNlY29uZCBjYWxsZXIgaGFzXG5cdFx0XHQvLyBzb21ldGhpbmcgdG8gY29hbGVzY2Ugb250bzogYW4gYXV0aC10cmlnZ2VyZWQgcmVmcmVzaCBsYW5kaW5nIG9uXG5cdFx0XHQvLyB0b3Agb2YgYSBwZXJpb2RpYyBzY2hlZHVsZXIgdGljayBtdXN0IG5vdCBkb3VibGUtaGl0IHRoZSBzZXJ2aWNlLlxuXHRcdFx0Y29uc3QgZ2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNsaWVudC5tb2RlbExpc3RHYXRlID0gZ2F0ZS5wO1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cblx0XHRcdGNvbnN0IGZpcnN0ID0gYWdlbnQucmVmcmVzaE1vZGVscygpO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYWdlbnQucmVmcmVzaE1vZGVscygpO1xuXHRcdFx0Z2F0ZS5jb21wbGV0ZSgpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0LCBzZWNvbmRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlcXVlc3RzOiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMsXG5cdFx0XHRcdG1vZGVsTmFtZXM6IGFnZW50Lm1vZGVscy5nZXQoKS5tYXAobSA9PiBtLm5hbWUpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXF1ZXN0czogW3sgZ2l0SHViVG9rZW46ICd0b2tlbicgfV0sXG5cdFx0XHRcdG1vZGVsTmFtZXM6IFsnR1BULTRvJ10sXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlZnJlc2ggbW9kZWxzIG9yIHJlc3RhcnQgdGhlIGNsaWVudCBhZnRlciBzaHV0ZG93bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10sIFt7XG5cdFx0XHRpZDogJ2dwdC00bycsXG5cdFx0XHRuYW1lOiAnR1BULTRvJyxcblx0XHR9XSk7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShhZ2VudC5tb2RlbHMsIG0gPT4gbS5sZW5ndGggPiAwKTtcblx0XHRcdGF3YWl0IGFnZW50LnNodXRkb3duKCk7XG5cblx0XHRcdGNvbnN0IHN0YXJ0c0FmdGVyU2h1dGRvd24gPSBjbGllbnQuc3RhcnRDYWxsQ291bnQ7XG5cdFx0XHRjb25zdCByZXF1ZXN0c0FmdGVyU2h1dGRvd24gPSBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBhIHF1ZXVlZCBtb2RlbC1yZWZyZXNoIHJldHJ5IHRpbWVyIGZpcmluZyBhZnRlciBzaHV0ZG93bi5cblx0XHRcdC8vIEl0IG11c3QgYmFpbCBvdXQgcmF0aGVyIHRoYW4gY2FsbCBgX2Vuc3VyZUNsaWVudCgpYCBhbmQgc3Bhd24gYVxuXHRcdFx0Ly8gZnJlc2ggU0RLIGNsaWVudCBmb3IgYW4gYWdlbnQgdGhhdCBpcyBhbHJlYWR5IHRvcm4gZG93bi5cblx0XHRcdGF3YWl0IChhZ2VudCBhcyB1bmtub3duIGFzIHsgX3JlZnJlc2hNb2RlbHMoYXR0ZW1wdD86IG51bWJlcik6IFByb21pc2U8dm9pZD4gfSkuX3JlZnJlc2hNb2RlbHMoMSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGFydHM6IGNsaWVudC5zdGFydENhbGxDb3VudCxcblx0XHRcdFx0cmVxdWVzdHM6IGNsaWVudC5tb2RlbExpc3RSZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXJ0czogc3RhcnRzQWZ0ZXJTaHV0ZG93bixcblx0XHRcdFx0cmVxdWVzdHM6IHJlcXVlc3RzQWZ0ZXJTaHV0ZG93bixcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcHVibGlzaCBhbiBpbi1mbGlnaHQgbW9kZWwgcmVmcmVzaCBhZnRlciBzaHV0ZG93bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10sIFt7XG5cdFx0XHRpZDogJ2luaXRpYWwnLFxuXHRcdFx0bmFtZTogJ0luaXRpYWwnLFxuXHRcdH1dKTtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKGFnZW50Lm1vZGVscywgbW9kZWxzID0+IG1vZGVscy5zb21lKG1vZGVsID0+IG1vZGVsLmlkID09PSAnaW5pdGlhbCcpKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRjb25zdCBnYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y2xpZW50Lm1vZGVsTGlzdEdhdGVzLnB1c2goZ2F0ZS5wKTtcblx0XHRcdGNsaWVudC5tb2RlbExpc3RSZXNwb25zZXMucHVzaChbeyBpZDogJ2xhdGUnLCBuYW1lOiAnTGF0ZScgfV0pO1xuXHRcdFx0Y29uc3QgcmVxdWVzdHNCZWZvcmUgPSBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoO1xuXHRcdFx0Y29uc3QgcmVmcmVzaCA9IGFnZW50LnJlZnJlc2hNb2RlbHMoKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTAwICYmIGNsaWVudC5tb2RlbExpc3RSZXF1ZXN0cy5sZW5ndGggPD0gcmVxdWVzdHNCZWZvcmU7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5tb2RlbExpc3RSZXF1ZXN0cy5sZW5ndGgsIHJlcXVlc3RzQmVmb3JlICsgMSwgJ2V4cGVjdGVkIHRoZSBnYXRlZCBtb2RlbCByZXF1ZXN0IHRvIHN0YXJ0Jyk7XG5cblx0XHRcdGF3YWl0IGFnZW50LnNodXRkb3duKCk7XG5cdFx0XHRnYXRlLmNvbXBsZXRlKCk7XG5cdFx0XHRhd2FpdCByZWZyZXNoO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50Lm1vZGVscy5nZXQoKS5tYXAobW9kZWwgPT4gbW9kZWwuaWQpLCBbJ2luaXRpYWwnXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzdG9wcyBhIGNsaWVudCB0aGF0IGZpbmlzaGVzIHN0YXJ0aW5nIGFmdGVyIHNodXRkb3duIGJlZ2lucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10pO1xuXHRcdGNvbnN0IHN0YXJ0R2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjbGllbnQuc3RhcnRHYXRlID0gc3RhcnRHYXRlLnA7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsaXN0UHJvbWlzZSA9IGFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRjb25zdCBzaHV0ZG93blByb21pc2UgPSBhZ2VudC5zaHV0ZG93bigpO1xuXHRcdFx0c3RhcnRHYXRlLmNvbXBsZXRlKCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGxpc3RQcm9taXNlLCBDYW5jZWxsYXRpb25FcnJvcik7XG5cdFx0XHRhd2FpdCBzaHV0ZG93blByb21pc2U7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGFydHM6IGNsaWVudC5zdGFydENhbGxDb3VudCxcblx0XHRcdFx0c3RvcHM6IGNsaWVudC5zdG9wQ2FsbENvdW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGFydHM6IDEsXG5cdFx0XHRcdHN0b3BzOiAxLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVTZXNzaW9uIGluZmVycyB3b3Jrc3BhY2UtbGVzcyBmcm9tIGFuIG9taXR0ZWQgd29ya2luZ0RpcmVjdG9yeSBhbmQgdXNlcyBhIHN0YWJsZSBzY3JhdGNoIGRpcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1c2VySG9tZSA9IFVSSS5maWxlKGF3YWl0IGZzLm1rZHRlbXAoYCR7b3MudG1wZGlyKCl9L3FjLWhvbWUtYCkpO1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHVzZXJIb21lIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAndGVtcC1mYWxsYmFjaycpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJvdmlzaW9uYWwsIHRydWUpO1xuXHRcdFx0Y29uc3QgcmVzdWx0V29ya2luZ0RpcmVjdG9yeSA9IHJlc3VsdC5yZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0V29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFVSSS5qb2luUGF0aCh1c2VySG9tZSwgJy5jb3BpbG90JywgJ2NoYXRzJywgJ3RlbXAtZmFsbGJhY2snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRXb3JraW5nRGlyZWN0b3J5LnNjaGVtZSwgU2NoZW1hcy5maWxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRXb3JraW5nRGlyZWN0b3J5LmZzUGF0aCwgZXhwZWN0ZWQuZnNQYXRoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZnMucmVhZGRpcihyZXN1bHRXb3JraW5nRGlyZWN0b3J5LmZzUGF0aCksIFtdKTtcblx0XHRcdC8vIFRhZ2dlZCB3b3Jrc3BhY2UtbGVzcyBwdXJlbHkgZnJvbSBpbmZlcmVuY2UgKG5vIGlucHV0IGZsYWcpLlxuXHRcdFx0Y29uc3QgcHJvdmlzaW9uYWwgPSAoYWdlbnQgYXMgdW5rbm93biBhcyB7IF9wcm92aXNpb25hbFNlc3Npb25zOiBNYXA8c3RyaW5nLCB7IHdvcmtzcGFjZWxlc3M/OiBib29sZWFuIH0+IH0pLl9wcm92aXNpb25hbFNlc3Npb25zLmdldCgndGVtcC1mYWxsYmFjaycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3Zpc2lvbmFsPy53b3Jrc3BhY2VsZXNzLCB0cnVlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZnMucm0odXNlckhvbWUuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSkudGltZW91dCgzMF8wMDApO1xuXG5cdHN1aXRlKCdxdWljayBjaGF0IHNjcmF0Y2ggZGlyZWN0b3J5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Jlc3VtZSByZWNyZWF0ZXMgYSByZWFwZWQgcXVpY2sgY2hhdCBzY3JhdGNoIGRpciAoZW5zdXJlLWV4aXN0cyBvbiByZXN0b3JlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVzZXJIb21lID0gVVJJLmZpbGUoYXdhaXQgZnMubWtkdGVtcChgJHtvcy50bXBkaXIoKX0vcWMtaG9tZS1gKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAncWMtcmVzdW1lJztcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IHNjcmF0Y2hEaXIgPSBVUkkuam9pblBhdGgodXNlckhvbWUsICcuY29waWxvdCcsICdjaGF0cycsIHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBkYiA9IHNlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0XHRhd2FpdCBkYi5vYmplY3Quc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya2luZ0RpcmVjdG9yeScsIHNjcmF0Y2hEaXIudG9TdHJpbmcoKSk7XG5cdFx0XHRhd2FpdCBkYi5vYmplY3Quc2V0TWV0YWRhdGEoJ2FnZW50SG9zdC53b3Jrc3BhY2VsZXNzJywgJ3RydWUnKTtcblx0XHRcdGRiLmRpc3Bvc2UoKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbc2RrU2Vzc2lvbihzZXNzaW9uSWQsIHNjcmF0Y2hEaXIuZnNQYXRoKV0pO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50LCB1c2VSZWFsUmVzdW1lUGF0aDogdHJ1ZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB1c2VySG9tZSB9KTtcblx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgeyBfcmVzdW1lU2Vzc2lvbjogKGlkOiBzdHJpbmcpID0+IFByb21pc2U8dW5rbm93bj4gfTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZShHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UucmVzb3VyY2UsICd0b2tlbicpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBmcy5hY2Nlc3Moc2NyYXRjaERpci5mc1BhdGgpKTtcblx0XHRcdFx0Ly8gVGhlIHN0dWJiZWQgU0RLIGNhbid0IGZpbmlzaCBpbml0aWFsaXppbmcgdGhlIHJlc3VtZWQgc2Vzc2lvbiwgYnV0XG5cdFx0XHRcdC8vIHRoZSBzY3JhdGNoIGRpciBpcyBlbnN1cmVkIGJlZm9yZSB0aGF0IHBvaW50LlxuXHRcdFx0XHRhd2FpdCBpbnRlcm5hbHMuX3Jlc3VtZVNlc3Npb24oc2Vzc2lvbklkKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0XHRhd2FpdCBmcy5hY2Nlc3Moc2NyYXRjaERpci5mc1BhdGgpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZnMucm0odXNlckhvbWUuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSkudGltZW91dCgzMF8wMDApO1xuXG5cdFx0dGVzdCgnZGlzcG9zZVNlc3Npb24gY2xlYW5zIHVwIHRoZSBxdWljayBjaGF0IHNjcmF0Y2ggZGlyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXNlckhvbWUgPSBVUkkuZmlsZShhd2FpdCBmcy5ta2R0ZW1wKGAke29zLnRtcGRpcigpfS9xYy1ob21lLWApKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHVzZXJIb21lIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3FjLWRpc3Bvc2UnKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb24gfSk7XG5cdFx0XHRcdGNvbnN0IHNjcmF0Y2hEaXIgPSBVUkkuam9pblBhdGgodXNlckhvbWUsICcuY29waWxvdCcsICdjaGF0cycsICdxYy1kaXNwb3NlJyk7XG5cdFx0XHRcdGF3YWl0IGZzLmFjY2VzcyhzY3JhdGNoRGlyLmZzUGF0aCk7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmRpc3Bvc2VTZXNzaW9uKHJlc3VsdC5zZXNzaW9uKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gZnMuYWNjZXNzKHNjcmF0Y2hEaXIuZnNQYXRoKSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBmcy5ybSh1c2VySG9tZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KS50aW1lb3V0KDMwXzAwMCk7XG5cdH0pO1xuXG5cdHN1aXRlKCd3b3JraW5nLWRpcmVjdG9yeSBwZXJzaXN0ZW5jZScsICgpID0+IHtcblx0XHRjb25zdCByZXBvQSA9IFVSSS5maWxlKCcvcmVwb0EnKTtcblx0XHRjb25zdCByZXBvQiA9IFVSSS5maWxlKCcvcmVwb0InKTtcblx0XHRjb25zdCByZXBvQyA9IFVSSS5maWxlKCcvcmVwb0MnKTtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHJlc3RvcmUoc2VlZDogKGRiOiBSZXR1cm5UeXBlPFRlc3RTZXNzaW9uRGF0YVNlcnZpY2VbJ29wZW5EYXRhYmFzZSddPikgPT4gUHJvbWlzZTx2b2lkPiwgY3dkPzogc3RyaW5nKTogUHJvbWlzZTx7IGxpc3Q6IHN0cmluZ1tdIHwgdW5kZWZpbmVkOyBtZXRhOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSAnd2QtcGVyc2lzdCc7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsIHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBkYiA9IHNlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0XHQvLyBNYXJrIHRoZSBwcm9qZWN0IHJlc29sdmVkIHNvIHRoZSByZXN0b3JlIHBhdGggZG9lcyBub3QgcHJvYmUgZ2l0LlxuXHRcdFx0YXdhaXQgZGIub2JqZWN0LnNldE1ldGFkYXRhKCdjb3BpbG90LnByb2plY3QucmVzb2x2ZWQnLCAndHJ1ZScpO1xuXHRcdFx0YXdhaXQgc2VlZChkYik7XG5cdFx0XHRkYi5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW3Nka1Nlc3Npb24oc2Vzc2lvbklkLCBjd2QpXSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZShHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UucmVzb3VyY2UsICd0b2tlbicpO1xuXHRcdFx0XHRjb25zdCBsaXN0ZWQgPSAoYXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCkpLmZpbmQocyA9PiBBZ2VudFNlc3Npb24uaWQocy5zZXNzaW9uKSA9PT0gc2Vzc2lvbklkKTtcblx0XHRcdFx0Y29uc3QgbWV0YSA9IGF3YWl0IGFnZW50LmdldFNlc3Npb25NZXRhZGF0YShzZXNzaW9uKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsaXN0OiBsaXN0ZWQ/LndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gZC50b1N0cmluZygpKSxcblx0XHRcdFx0XHRtZXRhOiBtZXRhPy53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkID0+IGQudG9TdHJpbmcoKSksXG5cdFx0XHRcdH07XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3QoJ3Jlc3RvcmVzIHRoZSBwZXJzaXN0ZWQgb3JkZXJlZCBzZXQgZnJvbSBjb3BpbG90LndvcmtpbmdEaXJlY3RvcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3RvcmUoYXN5bmMgZGIgPT4ge1xuXHRcdFx0XHRhd2FpdCBkYi5vYmplY3Quc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya2luZ0RpcmVjdG9yaWVzJywgSlNPTi5zdHJpbmdpZnkoW3JlcG9BLCByZXBvQiwgcmVwb0NdLm1hcChkID0+IGQudG9TdHJpbmcoKSkpKTtcblx0XHRcdFx0YXdhaXQgZGIub2JqZWN0LnNldE1ldGFkYXRhKCdjb3BpbG90LndvcmtpbmdEaXJlY3RvcnknLCByZXBvQS50b1N0cmluZygpKTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0bGlzdDogW3JlcG9BLnRvU3RyaW5nKCksIHJlcG9CLnRvU3RyaW5nKCksIHJlcG9DLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRtZXRhOiBbcmVwb0EudG9TdHJpbmcoKSwgcmVwb0IudG9TdHJpbmcoKSwgcmVwb0MudG9TdHJpbmcoKV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIGxlZ2FjeSBzaW5nbGUgd29ya2luZyBkaXJlY3Rvcnkgd2hlbiB0aGUgc2V0IGlzIGFic2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3RvcmUoYXN5bmMgZGIgPT4ge1xuXHRcdFx0XHRhd2FpdCBkYi5vYmplY3Quc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya2luZ0RpcmVjdG9yeScsIHJlcG9BLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRsaXN0OiBbcmVwb0EudG9TdHJpbmcoKV0sXG5cdFx0XHRcdG1ldGE6IFtyZXBvQS50b1N0cmluZygpXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgbGVnYWN5IHNpbmdsZSB3b3JraW5nIGRpcmVjdG9yeSB3aGVuIHRoZSBzZXQgaXMgbWFsZm9ybWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdG9yZShhc3luYyBkYiA9PiB7XG5cdFx0XHRcdGF3YWl0IGRiLm9iamVjdC5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JraW5nRGlyZWN0b3JpZXMnLCAnbm90LWpzb24nKTtcblx0XHRcdFx0YXdhaXQgZGIub2JqZWN0LnNldE1ldGFkYXRhKCdjb3BpbG90LndvcmtpbmdEaXJlY3RvcnknLCByZXBvQS50b1N0cmluZygpKTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0bGlzdDogW3JlcG9BLnRvU3RyaW5nKCldLFxuXHRcdFx0XHRtZXRhOiBbcmVwb0EudG9TdHJpbmcoKV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc3RhcnQgb24gc3RhcnR1cCBjb25maWcgY2hhbmdlJywgKCkgPT4ge1xuXG5cdFx0Y2xhc3MgU3RvcENvdW50aW5nQ2xpZW50IGV4dGVuZHMgVGVzdENvcGlsb3RDbGllbnQge1xuXHRcdFx0c3RvcENvdW50ID0gMDtcblx0XHRcdHN0b3BHYXRlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRcdFx0c3RvcEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHN0b3AoKTogUmV0dXJuVHlwZTxJVGVzdENvcGlsb3RDbGllbnRbJ3N0b3AnXT4ge1xuXHRcdFx0XHR0aGlzLnN0b3BDb3VudCsrO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnN0b3BHYXRlO1xuXHRcdFx0XHRpZiAodGhpcy5zdG9wRXJyb3IpIHtcblx0XHRcdFx0XHR0aHJvdyB0aGlzLnN0b3BFcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3VwZXIuc3RvcCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNsYXNzIE11dGFibGVMb2dTZXJ2aWNlIGV4dGVuZHMgTnVsbExvZ1NlcnZpY2Uge1xuXHRcdFx0cHJpdmF0ZSBfbGV2ZWwgPSBMb2dMZXZlbC5JbmZvO1xuXG5cdFx0XHRvdmVycmlkZSBzZXRMZXZlbChsZXZlbDogTG9nTGV2ZWwpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5fbGV2ZWwgPSBsZXZlbDtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgZ2V0TGV2ZWwoKTogTG9nTGV2ZWwge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fbGV2ZWw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdCgncmVzb2x2ZXMgdGhlIHN5c3RlbSBwcm94eSBieSBkZWZhdWx0IGFuZCBieXBhc3NlcyBpdCB3aGVuIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJveHlSZXNvbHZlciA9IG5ldyBUZXN0UHJveHlSZXNvbHZlcigpO1xuXHRcdFx0cHJveHlSZXNvbHZlci5yZXNvbHZlZFByb3h5ID0gJ2h0dHA6Ly9zeXN0ZW0tcHJveHkuZXhhbXBsZTo4MDgwJztcblx0XHRcdGNvbnN0IHsgYWdlbnQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IHByb3h5UmVzb2x2ZXIgfSk7XG5cdFx0XHRjb25zdCByZXNvbHZlUHJveHlGb3JTZGsgPSAoZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KSA9PiAoYWdlbnQgYXMgdW5rbm93biBhcyB7XG5cdFx0XHRcdF9yZXNvbHZlUHJveHlGb3JTZGsoZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRcdFx0fSkuX3Jlc29sdmVQcm94eUZvclNkayhlbnYpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVQcm94eUZvclNkayh7fSksIHByb3h5UmVzb2x2ZXIucmVzb2x2ZWRQcm94eSk7XG5cblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtBZ2VudEhvc3RTeXN0ZW1Qcm94eUVuYWJsZWRDb25maWdLZXldOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0cHJveHk6IGF3YWl0IHJlc29sdmVQcm94eUZvclNkayh7fSksXG5cdFx0XHRcdFx0cmVzb2x2ZVByb3h5Q2FsbHM6IHByb3h5UmVzb2x2ZXIucmVzb2x2ZVByb3h5Q2FsbHMsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRwcm94eTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJlc29sdmVQcm94eUNhbGxzOiAxLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXNzZXMgdGhlIGNvbmZpZ3VyZWQgbG9nIGxldmVsIHRvIHRoZSBDb3BpbG90IFNESyBjbGllbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10pO1xuXHRcdFx0Y29uc3QgeyBhZ2VudCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LkNvcGlsb3RTZGtMb2dMZXZlbF06ICd0cmFjZScgfSk7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5saXN0U2Vzc2lvbnMoKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldENyZWF0ZWRDbGllbnRPcHRpb25zKGFnZW50KS5tYXAob3B0aW9ucyA9PiBvcHRpb25zLmxvZ0xldmVsKSwgWydhbGwnXSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBpbmZvIHdoZW4gbmVpdGhlciB0aGUgc2V0dGluZyBub3IgYWdlbnQgaG9zdCBlbmFibGVzIHRyYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IHsgYWdlbnQgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q3JlYXRlZENsaWVudE9wdGlvbnMoYWdlbnQpLm1hcChvcHRpb25zID0+IG9wdGlvbnMubG9nTGV2ZWwpLCBbJ2luZm8nXSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyB0cmFjZSB3aGVuIHRoZSBhZ2VudCBob3N0IGxvZyBsZXZlbCBpcyB0cmFjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE11dGFibGVMb2dTZXJ2aWNlKCk7XG5cdFx0XHRsb2dTZXJ2aWNlLnNldExldmVsKExvZ0xldmVsLlRyYWNlKTtcblx0XHRcdGNvbnN0IHsgYWdlbnQgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50LCBsb2dTZXJ2aWNlIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q3JlYXRlZENsaWVudE9wdGlvbnMoYWdlbnQpLm1hcChvcHRpb25zID0+IG9wdGlvbnMubG9nTGV2ZWwpLCBbJ2FsbCddKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0YXJ0cyB0aGUgY2xpZW50IHdoZW4gdGhlIENvcGlsb3QgU0RLIGxvZyBsZXZlbCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFN0b3BDb3VudGluZ0NsaWVudChbXSk7XG5cdFx0XHRjb25zdCB7IGFnZW50LCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LkNvcGlsb3RTZGtMb2dMZXZlbF06ICd0cmFjZScgfSk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5saXN0U2Vzc2lvbnMoKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRzdG9wQ291bnQ6IGNsaWVudC5zdG9wQ291bnQsXG5cdFx0XHRcdFx0bG9nTGV2ZWw6IGdldENyZWF0ZWRDbGllbnRPcHRpb25zKGFnZW50KS5hdCgtMSk/LmxvZ0xldmVsLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0c3RvcENvdW50OiAxLFxuXHRcdFx0XHRcdGxvZ0xldmVsOiAnYWxsJyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtZW51bWVyYXRlcyBtb2RlbHMgYWZ0ZXIgYSBzdGFydHVwLWNvbmZpZyByZXN0YXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFN0b3BDb3VudGluZ0NsaWVudChbXSwgW3sgaWQ6ICdncHQtNG8nLCBuYW1lOiAnR1BULTRvJyB9XSk7XG5cdFx0XHRjb25zdCB7IGFnZW50LCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShhZ2VudC5tb2RlbHMsIG0gPT4gbS5sZW5ndGggPiAwKTtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdHNCZWZvcmUgPSBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoO1xuXG5cdFx0XHRcdC8vIFRoZSBjYXRhbG9nIGJlbG9uZ2VkIHRvIHRoZSBzdWJwcm9jZXNzIGJlaW5nIHRvcm4gZG93biwgYW5kIHRoZVxuXHRcdFx0XHQvLyByZXBsYWNlbWVudCBtYXkgcG9pbnQgYXQgYSBkaWZmZXJlbnQgQ0FQSSBlbmRwb2ludCBlbnRpcmVseS5cblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LlJ1YmJlckR1Y2tdOiB0cnVlIH0pO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwMCAmJiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoIDw9IHJlcXVlc3RzQmVmb3JlOyBpKyspIHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0c3RvcENvdW50OiBjbGllbnQuc3RvcENvdW50LFxuXHRcdFx0XHRcdHJlZnJlc2hlc0FmdGVyUmVzdGFydDogY2xpZW50Lm1vZGVsTGlzdFJlcXVlc3RzLmxlbmd0aCAtIHJlcXVlc3RzQmVmb3JlLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0c3RvcENvdW50OiAxLFxuXHRcdFx0XHRcdHJlZnJlc2hlc0FmdGVyUmVzdGFydDogMSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29hbGVzY2VzIGNvbmN1cnJlbnQgdG9rZW4gYW5kIHN0YXJ0dXAtY29uZmlnIHJlZnJlc2ggdHJpZ2dlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgU3RvcENvdW50aW5nQ2xpZW50KFtdLCBbeyBpZDogJ2dwdC00bycsIG5hbWU6ICdHUFQtNG8nIH1dKTtcblx0XHRcdGNvbnN0IHsgYWdlbnQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHRcdGNvbnN0IHN0b3BHYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuLWEnKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShhZ2VudC5tb2RlbHMsIG1vZGVscyA9PiBtb2RlbHMubGVuZ3RoID4gMCk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0c0JlZm9yZSA9IGNsaWVudC5tb2RlbExpc3RSZXF1ZXN0cy5sZW5ndGg7XG5cdFx0XHRcdGNsaWVudC5zdG9wR2F0ZSA9IHN0b3BHYXRlLnA7XG5cblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LlJ1YmJlckR1Y2tdOiB0cnVlIH0pO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4tYicpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5tb2RlbExpc3RSZXF1ZXN0cy5sZW5ndGgsIHJlcXVlc3RzQmVmb3JlLCAnbW9kZWwgcmVmcmVzaCBtdXN0IHdhaXQgZm9yIHRoZSBvbGQgY2xpZW50IHRvIHN0b3AnKTtcblx0XHRcdFx0c3RvcEdhdGUuY29tcGxldGUoKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDAgJiYgY2xpZW50Lm1vZGVsTGlzdFJlcXVlc3RzLmxlbmd0aCA8PSByZXF1ZXN0c0JlZm9yZTsgaSsrKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRzdG9wQ291bnQ6IGNsaWVudC5zdG9wQ291bnQsXG5cdFx0XHRcdFx0cmVmcmVzaGVzOiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoIC0gcmVxdWVzdHNCZWZvcmUsXG5cdFx0XHRcdFx0bGFzdFRva2VuOiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMuYXQoLTEpPy5naXRIdWJUb2tlbixcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHN0b3BDb3VudDogMSxcblx0XHRcdFx0XHRyZWZyZXNoZXM6IDEsXG5cdFx0XHRcdFx0bGFzdFRva2VuOiAndG9rZW4tYicsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3RvcEdhdGUuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHN0YXJ0IGEgcmVwbGFjZW1lbnQgY2xpZW50IHdoaWxlIHRoZSBwcmV2aW91cyBjbGllbnQgaXMgc3RvcHBpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgU3RvcENvdW50aW5nQ2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IHsgYWdlbnQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHRcdGNvbnN0IHN0b3BHYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0XHRjbGllbnQuc3RvcEdhdGUgPSBzdG9wR2F0ZS5wO1xuXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyBbQ29waWxvdENsaUNvbmZpZ0tleS5SdWJiZXJEdWNrXTogdHJ1ZSB9KTtcblx0XHRcdFx0Y29uc3QgbGlzdFByb21pc2UgPSBhZ2VudC5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQuc3RhcnRDYWxsQ291bnQsIDEsICdyZXBsYWNlbWVudCBjbGllbnQgbXVzdCB3YWl0IGZvciB0aGUgb2xkIGNsaWVudCB0byBzdG9wJyk7XG5cblx0XHRcdFx0c3RvcEdhdGUuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgbGlzdFByb21pc2U7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdHN0YXJ0czogY2xpZW50LnN0YXJ0Q2FsbENvdW50LFxuXHRcdFx0XHRcdHN0b3BzOiBjbGllbnQuc3RvcENvdW50LFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0c3RhcnRzOiAyLFxuXHRcdFx0XHRcdHN0b3BzOiAxLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHN0b3BHYXRlLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIGZhaWxlZCBjbGllbnQgc3RvcCBkb2VzIG5vdCBwb2lzb24gbGF0ZXIgbW9kZWwgcmVmcmVzaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFN0b3BDb3VudGluZ0NsaWVudChbXSwgW3sgaWQ6ICdncHQtNG8nLCBuYW1lOiAnR1BULTRvJyB9XSk7XG5cdFx0XHRjb25zdCB7IGFnZW50LCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKGFnZW50Lm1vZGVscywgbW9kZWxzID0+IG1vZGVscy5sZW5ndGggPiAwKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RzQmVmb3JlID0gY2xpZW50Lm1vZGVsTGlzdFJlcXVlc3RzLmxlbmd0aDtcblx0XHRcdFx0Y2xpZW50LnN0b3BFcnJvciA9IG5ldyBFcnJvcignc3RvcCBmYWlsZWQnKTtcblxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgW0NvcGlsb3RDbGlDb25maWdLZXkuUnViYmVyRHVja106IHRydWUgfSk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHRjbGllbnQuc3RvcEVycm9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5yZWZyZXNoTW9kZWxzKCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5tb2RlbExpc3RSZXF1ZXN0cy5sZW5ndGgsIHJlcXVlc3RzQmVmb3JlICsgMSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcHMgYW4gaW4tZmxpZ2h0IGNhdGFsb2cgZnJvbSB0aGUgcHJldmlvdXMgY2xpZW50IGdlbmVyYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgU3RvcENvdW50aW5nQ2xpZW50KFtdLCBbeyBpZDogJ2luaXRpYWwnLCBuYW1lOiAnSW5pdGlhbCcgfV0pO1xuXHRcdFx0Y29uc3QgeyBhZ2VudCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShhZ2VudC5tb2RlbHMsIG1vZGVscyA9PiBtb2RlbHMuc29tZShtb2RlbCA9PiBtb2RlbC5pZCA9PT0gJ2luaXRpYWwnKSk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRcdGNvbnN0IHN0YWxlR2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdFx0Y29uc3QgcmVwbGFjZW1lbnRHYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0XHRjbGllbnQubW9kZWxMaXN0R2F0ZXMucHVzaChzdGFsZUdhdGUucCwgcmVwbGFjZW1lbnRHYXRlLnApO1xuXHRcdFx0XHRjbGllbnQubW9kZWxMaXN0UmVzcG9uc2VzLnB1c2goXG5cdFx0XHRcdFx0W3sgaWQ6ICdzdGFsZScsIG5hbWU6ICdTdGFsZScgfV0sXG5cdFx0XHRcdFx0W3sgaWQ6ICdyZXBsYWNlbWVudCcsIG5hbWU6ICdSZXBsYWNlbWVudCcgfV0sXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RzQmVmb3JlID0gY2xpZW50Lm1vZGVsTGlzdFJlcXVlc3RzLmxlbmd0aDtcblx0XHRcdFx0Y29uc3Qgc3RhbGVSZWZyZXNoID0gYWdlbnQucmVmcmVzaE1vZGVscygpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwMCAmJiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoIDwgcmVxdWVzdHNCZWZvcmUgKyAxOyBpKyspIHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LlJ1YmJlckR1Y2tdOiB0cnVlIH0pO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwMCAmJiBjbGllbnQubW9kZWxMaXN0UmVxdWVzdHMubGVuZ3RoIDwgcmVxdWVzdHNCZWZvcmUgKyAyOyBpKyspIHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQubW9kZWxzLmdldCgpLCBbXSk7XG5cblx0XHRcdFx0cmVwbGFjZW1lbnRHYXRlLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShhZ2VudC5tb2RlbHMsIG1vZGVscyA9PiBtb2RlbHMuc29tZShtb2RlbCA9PiBtb2RlbC5pZCA9PT0gJ3JlcGxhY2VtZW50JykpO1xuXHRcdFx0XHRzdGFsZUdhdGUuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgc3RhbGVSZWZyZXNoO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQubW9kZWxzLmdldCgpLm1hcChtb2RlbCA9PiBtb2RlbC5pZCksIFsncmVwbGFjZW1lbnQnXSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdGFydHMgdGhlIGlkbGUgY2xpZW50IHdoZW4gdGhlIHJ1YmJlciBkdWNrIGNvbmZpZyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFN0b3BDb3VudGluZ0NsaWVudChbXSk7XG5cdFx0XHRjb25zdCB7IGFnZW50LCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0Ly8gRm9yY2UgdGhlIGNsaWVudCB0byBzdGFydCBzbyBhIHN1YnNlcXVlbnQgY29uZmlnIGNoYW5nZSBoYXMgc29tZXRoaW5nIHRvIHJlc3RhcnQuXG5cdFx0XHRcdGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyBbQ29waWxvdENsaUNvbmZpZ0tleS5SdWJiZXJEdWNrXTogdHJ1ZSB9KTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5zdG9wQ291bnQsIDEpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3RhcnRzIGFuZCBkaXNwb3NlcyBhY3RpdmUgc2Vzc2lvbnMgd2hlbiB0aGUgY29uZmlnIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgU3RvcENvdW50aW5nQ2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IHsgYWdlbnQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5saXN0U2Vzc2lvbnMoKTtcblxuXHRcdFx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdFx0c2V0RGVmYXVsdFNlc3Npb25TdHViKGFnZW50LCAnYWN0aXZlJywgeyBkaXNwb3NlKCkgeyBkaXNwb3NlZCA9IHRydWU7IH0gfSk7XG5cblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LlJ1YmJlckR1Y2tdOiB0cnVlIH0pO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRzdG9wQ291bnQ6IGNsaWVudC5zdG9wQ291bnQsXG5cdFx0XHRcdFx0ZGlzcG9zZWQsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRzdG9wQ291bnQ6IDEsXG5cdFx0XHRcdFx0ZGlzcG9zZWQ6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHJlc3RhcnQgd2hlbiBhbiB1bnJlbGF0ZWQgY29uZmlnIGtleSBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFN0b3BDb3VudGluZ0NsaWVudChbXSk7XG5cdFx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE11dGFibGVMb2dTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB7IGFnZW50LCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQsIGxvZ1NlcnZpY2UgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cblx0XHRcdFx0bG9nU2VydmljZS5zZXRMZXZlbChMb2dMZXZlbC5UcmFjZSk7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyBbQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2xdOiB0cnVlIH0pO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpZW50LnN0b3BDb3VudCwgMCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0LyoqXG5cdFx0ICogU2lnbmFscyB0aGUgdHVybi1lbmRlZCBob29rIHRoZSBhZ2VudCB3aXJlcyBpbnRvIGV2ZXJ5IGNoYXQgaXQgY3JlYXRlc1xuXHRcdCAqIChgb25UdXJuRW5kZWRgKSwgd2hpY2ggc3R1Yi1pbmplY3RlZCBjaGF0cyBieXBhc3MuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gcmVwb3J0Q2hhdFR1cm5FbmRlZChhZ2VudDogQ29waWxvdEFnZW50KTogdm9pZCB7XG5cdFx0XHQoYWdlbnQgYXMgdW5rbm93biBhcyB7IF9vbkNoYXRUdXJuRW5kZWQoKTogdm9pZCB9KS5fb25DaGF0VHVybkVuZGVkKCk7XG5cdFx0fVxuXG5cdFx0LyoqIEEgc3R1YiBjaGF0IHdob3NlIGluLWZsaWdodCB0dXJuIGNhbiBiZSBlbmRlZCBieSB0aGUgdGVzdC4gKi9cblx0XHRmdW5jdGlvbiBidXN5Q2hhdFN0dWIoKTogeyBoYXNBY3RpdmVUdXJuOiBib29sZWFuOyBkaXNwb3NlZDogYm9vbGVhbjsgZGlzcG9zZSgpOiB2b2lkOyBkZXN0cm95U2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IH0ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aGFzQWN0aXZlVHVybjogdHJ1ZSxcblx0XHRcdFx0ZGlzcG9zZWQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwb3NlKCkgeyB0aGlzLmRpc3Bvc2VkID0gdHJ1ZTsgfSxcblx0XHRcdFx0ZGVzdHJveVNlc3Npb246IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnZGVmZXJzIHRoZSByZXN0YXJ0IHVudGlsIGFuIGluLWZsaWdodCB0dXJuIGVuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgU3RvcENvdW50aW5nQ2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IHsgYWdlbnQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5saXN0U2Vzc2lvbnMoKTtcblxuXHRcdFx0XHRjb25zdCBjaGF0ID0gYnVzeUNoYXRTdHViKCk7XG5cdFx0XHRcdHNldERlZmF1bHRTZXNzaW9uU3R1YihhZ2VudCwgJ2J1c3knLCBjaGF0KTtcblxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgW0NvcGlsb3RDbGlDb25maWdLZXkuUnViYmVyRHVja106IHRydWUgfSk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRcdGNvbnN0IGR1cmluZ1R1cm4gPSB7IHN0b3BDb3VudDogY2xpZW50LnN0b3BDb3VudCwgZGlzcG9zZWQ6IGNoYXQuZGlzcG9zZWQgfTtcblxuXHRcdFx0XHRjaGF0Lmhhc0FjdGl2ZVR1cm4gPSBmYWxzZTtcblx0XHRcdFx0cmVwb3J0Q2hhdFR1cm5FbmRlZChhZ2VudCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0ZHVyaW5nVHVybixcblx0XHRcdFx0XHRhZnRlclR1cm46IHsgc3RvcENvdW50OiBjbGllbnQuc3RvcENvdW50LCBkaXNwb3NlZDogY2hhdC5kaXNwb3NlZCB9LFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0ZHVyaW5nVHVybjogeyBzdG9wQ291bnQ6IDAsIGRpc3Bvc2VkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdGFmdGVyVHVybjogeyBzdG9wQ291bnQ6IDEsIGRpc3Bvc2VkOiB0cnVlIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIGRlZmVycmluZyB3aGlsZSBhbm90aGVyIGNoYXQgaXMgc3RpbGwgcnVubmluZyBpdHMgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBTdG9wQ291bnRpbmdDbGllbnQoW10pO1xuXHRcdFx0Y29uc3QgeyBhZ2VudCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXG5cdFx0XHRcdGNvbnN0IGZpcnN0ID0gYnVzeUNoYXRTdHViKCk7XG5cdFx0XHRcdGNvbnN0IHNlY29uZCA9IGJ1c3lDaGF0U3R1YigpO1xuXHRcdFx0XHRzZXREZWZhdWx0U2Vzc2lvblN0dWIoYWdlbnQsICdidXN5LTEnLCBmaXJzdCk7XG5cdFx0XHRcdHNldERlZmF1bHRTZXNzaW9uU3R1YihhZ2VudCwgJ2J1c3ktMicsIHNlY29uZCk7XG5cblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LlJ1YmJlckR1Y2tdOiB0cnVlIH0pO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRcdGZpcnN0Lmhhc0FjdGl2ZVR1cm4gPSBmYWxzZTtcblx0XHRcdFx0cmVwb3J0Q2hhdFR1cm5FbmRlZChhZ2VudCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRcdGNvbnN0IGFmdGVyRmlyc3QgPSBjbGllbnQuc3RvcENvdW50O1xuXG5cdFx0XHRcdHNlY29uZC5oYXNBY3RpdmVUdXJuID0gZmFsc2U7XG5cdFx0XHRcdHJlcG9ydENoYXRUdXJuRW5kZWQoYWdlbnQpO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhZnRlckZpcnN0LCBhZnRlclNlY29uZDogY2xpZW50LnN0b3BDb3VudCB9LCB7IGFmdGVyRmlyc3Q6IDAsIGFmdGVyU2Vjb25kOiAxIH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgYSBkZWZlcnJlZCByZXN0YXJ0IHdoZW4gdGhlIGJ1c3kgc2Vzc2lvbiBpcyBkaXNwb3NlZCBpbnN0ZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFN0b3BDb3VudGluZ0NsaWVudChbXSk7XG5cdFx0XHRjb25zdCB7IGFnZW50LCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQubGlzdFNlc3Npb25zKCk7XG5cblx0XHRcdFx0c2V0RGVmYXVsdFNlc3Npb25TdHViKGFnZW50LCAnYnVzeScsIGJ1c3lDaGF0U3R1YigpKTtcblxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgW0NvcGlsb3RDbGlDb25maWdLZXkuUnViYmVyRHVja106IHRydWUgfSk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRcdGNvbnN0IGR1cmluZ1R1cm4gPSBjbGllbnQuc3RvcENvdW50O1xuXG5cdFx0XHRcdC8vIEEgZGlzcG9zZWQgc2Vzc2lvbiBuZXZlciByZXBvcnRzIGl0cyB0dXJuIGVuZGluZywgc28gZGlzcG9zYWxcblx0XHRcdFx0Ly8gbXVzdCBkcmFpbiB0aGUgcGFya2VkIHJlc3RhcnQgaXRzZWxmLlxuXHRcdFx0XHRhd2FpdCBhZ2VudC5kaXNwb3NlU2Vzc2lvbihBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2J1c3knKSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGR1cmluZ1R1cm4sIGFmdGVyRGlzcG9zZTogY2xpZW50LnN0b3BDb3VudCB9LCB7IGR1cmluZ1R1cm46IDAsIGFmdGVyRGlzcG9zZTogMSB9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZXN0YXJ0IGEgY2xpZW50IHRoYXQgd2FzIGFscmVhZHkgc3RvcHBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBTdG9wQ291bnRpbmdDbGllbnQoW10pO1xuXHRcdFx0Y29uc3QgeyBhZ2VudCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXG5cdFx0XHRcdGNvbnN0IGNoYXQgPSBidXN5Q2hhdFN0dWIoKTtcblx0XHRcdFx0c2V0RGVmYXVsdFNlc3Npb25TdHViKGFnZW50LCAnYnVzeScsIGNoYXQpO1xuXG5cdFx0XHRcdC8vIFR3byBzdGFydHVwIHZhbHVlcyBjaGFuZ2Ugd2hpbGUgdGhlIHR1cm4gcnVuczsgdGhlIGZpcnN0XG5cdFx0XHRcdC8vIHJlc3RhcnQgdG8gYWN0dWFsbHkgcnVuIHNhdGlzZmllcyBib3RoLlxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgW0NvcGlsb3RDbGlDb25maWdLZXkuUnViYmVyRHVja106IHRydWUgfSk7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyBbQ29waWxvdENsaUNvbmZpZ0tleS5Db3BpbG90U2RrTG9nTGV2ZWxdOiAndHJhY2UnIH0pO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRcdGNoYXQuaGFzQWN0aXZlVHVybiA9IGZhbHNlO1xuXHRcdFx0XHRyZXBvcnRDaGF0VHVybkVuZGVkKGFnZW50KTtcblx0XHRcdFx0cmVwb3J0Q2hhdFR1cm5FbmRlZChhZ2VudCk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5zdG9wQ291bnQsIDEpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWxzIGluY2x1ZGUgYmlsbGluZyBtdWx0aXBsaWVyIG1ldGFkYXRhIHdoZW4gU0RLIHByb3ZpZGVzIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRjb3BpbG90Q2xpZW50OiBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10sIFt7XG5cdFx0XHRcdGlkOiAnZ3B0LTRvJyxcblx0XHRcdFx0bmFtZTogJ0dQVC00bycsXG5cdFx0XHRcdGJpbGxpbmc6IHsgbXVsdGlwbGllcjogMS41IH0sXG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyBsaW1pdHM6IHsgbWF4X2NvbnRleHRfd2luZG93X3Rva2VuczogMTI4MDAwLCBtYXhfb3V0cHV0X3Rva2VuczogMTYwMDAsIG1heF9wcm9tcHRfdG9rZW5zOiAxMTIwMDAgfSwgc3VwcG9ydHM6IHsgdmlzaW9uOiB0cnVlIH0gfSxcblx0XHRcdH1dKSxcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoYWdlbnQubW9kZWxzLCBtb2RlbHMgPT4gbW9kZWxzLmxlbmd0aCA+IDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVscywgW3tcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0aWQ6ICdncHQtNG8nLFxuXHRcdFx0XHRuYW1lOiAnR1BULTRvJyxcblx0XHRcdFx0bWF4Q29udGV4dFdpbmRvdzogMTI4MDAwLFxuXHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDE2MDAwLFxuXHRcdFx0XHRtYXhQcm9tcHRUb2tlbnM6IDExMjAwMCxcblx0XHRcdFx0c3VwcG9ydHNWaXNpb246IHRydWUsXG5cdFx0XHRcdGNvbmZpZ1NjaGVtYTogdW5kZWZpbmVkLFxuXHRcdFx0XHRwb2xpY3lTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRfbWV0YTogeyBtdWx0aXBsaWVyTnVtZXJpYzogMS41IH0sXG5cdFx0XHR9XSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbHMgaW5jbHVkZSBwaWNrZXIgYW5kIHByb21vIG1ldGFkYXRhIHdoZW4gdGhlIFNESyBwcm92aWRlcyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywge1xuXHRcdFx0Y29waWxvdENsaWVudDogbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdLCBbe1xuXHRcdFx0XHRpZDogJ2NsYXVkZS1zb25uZXQnLFxuXHRcdFx0XHRuYW1lOiAnQ2xhdWRlIFNvbm5ldCcsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyBsaW1pdHM6IHsgbWF4X2NvbnRleHRfd2luZG93X3Rva2VuczogMjAwXzAwMCB9IH0sXG5cdFx0XHRcdGJpbGxpbmc6IHtcblx0XHRcdFx0XHRtdWx0aXBsaWVyOiAxLFxuXHRcdFx0XHRcdHByb21vOiB7XG5cdFx0XHRcdFx0XHRpZDogJ3N1bW1lci1zYWxlJyxcblx0XHRcdFx0XHRcdGRpc2NvdW50UGVyY2VudDogMjUsXG5cdFx0XHRcdFx0XHRlbmRzQXQ6ICcyMDI2LTA4LTAxVDAwOjAwOjAwWicsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnU2F2ZSBvbiBDbGF1ZGUgU29ubmV0Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRva2VuUHJpY2VzOiB7XG5cdFx0XHRcdFx0XHRiYXRjaFNpemU6IDEwMF8wMDAsXG5cdFx0XHRcdFx0XHRtYXhQcm9tcHRUb2tlbnM6IDIwMF8wMDAsXG5cdFx0XHRcdFx0XHRpbnB1dFByaWNlOiAwLjMsXG5cdFx0XHRcdFx0XHRjYWNoZVJlYWRQcmljZTogMC4xLFxuXHRcdFx0XHRcdFx0b3V0cHV0UHJpY2U6IDEuNSxcblx0XHRcdFx0XHRcdGxvbmdDb250ZXh0OiB7IG1heFByb21wdFRva2VuczogMV8wMDBfMDAwLCBpbnB1dFByaWNlOiAwLjYsIGNhY2hlUmVhZFByaWNlOiAwLjEsIG91dHB1dFByaWNlOiAyLjI1IH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bW9kZWxQaWNrZXJDYXRlZ29yeTogJ3Bvd2VyZnVsJyxcblx0XHRcdFx0bW9kZWxQaWNrZXJQcmljZUNhdGVnb3J5OiAnbWVkaXVtJyxcblx0XHRcdH1dKSxcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoYWdlbnQubW9kZWxzLCBtb2RlbHMgPT4gbW9kZWxzLmxlbmd0aCA+IDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsc1swXS5fbWV0YSwge1xuXHRcdFx0XHRtdWx0aXBsaWVyTnVtZXJpYzogMSxcblx0XHRcdFx0aW5wdXRDb3N0OiAzLFxuXHRcdFx0XHRjYWNoZUNvc3Q6IDEsXG5cdFx0XHRcdG91dHB1dENvc3Q6IDE1LFxuXHRcdFx0XHRsb25nQ29udGV4dElucHV0Q29zdDogNixcblx0XHRcdFx0bG9uZ0NvbnRleHRDYWNoZUNvc3Q6IDEsXG5cdFx0XHRcdGxvbmdDb250ZXh0T3V0cHV0Q29zdDogMjIuNSxcblx0XHRcdFx0cHJpY2VDYXRlZ29yeTogJ21lZGl1bScsXG5cdFx0XHRcdGNhdGVnb3J5OiAncG93ZXJmdWwnLFxuXHRcdFx0XHRwcm9tbzoge1xuXHRcdFx0XHRcdGlkOiAnc3VtbWVyLXNhbGUnLFxuXHRcdFx0XHRcdGRpc2NvdW50UGVyY2VudDogMjUsXG5cdFx0XHRcdFx0ZW5kc0F0OiAnMjAyNi0wOC0wMVQwMDowMDowMFonLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdTYXZlIG9uIENsYXVkZSBTb25uZXQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjb25maWdTY2hlbWEgZW1pdHMgYSB0aGlua2luZ0xldmVsIHByb3BlcnR5IHdoZW4gdGhlIG1vZGVsIGFkdmVydGlzZXMgcmVhc29uaW5nIGVmZm9ydHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSwgW3tcblx0XHRcdFx0aWQ6ICdvMycsXG5cdFx0XHRcdG5hbWU6ICdvMycsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyBsaW1pdHM6IHsgbWF4X2NvbnRleHRfd2luZG93X3Rva2VuczogMTI4MDAwIH0gfSxcblx0XHRcdFx0c3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0czogWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnXSxcblx0XHRcdFx0ZGVmYXVsdFJlYXNvbmluZ0VmZm9ydDogJ21lZGl1bScsXG5cdFx0XHR9XSksXG5cdFx0fSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgd2FpdEZvclN0YXRlKGFnZW50Lm1vZGVscywgbW9kZWxzID0+IG1vZGVscy5sZW5ndGggPiAwKTtcblxuXHRcdFx0Y29uc3Qgc2NoZW1hID0gbW9kZWxzWzBdLmNvbmZpZ1NjaGVtYTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2NoZW1hPy5wcm9wZXJ0aWVzLnRoaW5raW5nTGV2ZWw/LmVudW0sIFsnbG93JywgJ21lZGl1bScsICdoaWdoJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjaGVtYT8ucHJvcGVydGllcy50aGlua2luZ0xldmVsPy5kZWZhdWx0LCAnbWVkaXVtJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hPy5wcm9wZXJ0aWVzLmNvbnRleHRTaXplLCB1bmRlZmluZWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnQllPSyBtb2RlbCBjb25maWdTY2hlbWEgZXhwb3NlcyBvbmx5IENvcGlsb3Qtc3VwcG9ydGVkIHJlYXNvbmluZyBlZmZvcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJ5b2tCcmlkZ2VSZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGJ5b2tCcmlkZ2VSZWdpc3RyeSB9KTtcblx0XHRjb25zdCBtb2RlbFNuYXBzaG90cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJQnlva0xtTW9kZWxJbmZvW10+KCkpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb246IElCeW9rTG1CcmlkZ2VDb25uZWN0aW9uID0ge1xuXHRcdFx0Y2hhdDogYXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbXSB9KSxcblx0XHRcdG9uRGlkQ2hhbmdlTW9kZWxzOiBtb2RlbFNuYXBzaG90cy5ldmVudCxcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChieW9rQnJpZGdlUmVnaXN0cnkucmVnaXN0ZXIoJ3JlbmRlcmVyJywgY29ubmVjdGlvbikpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdG1vZGVsU25hcHNob3RzLmZpcmUoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRcdFx0aWQ6ICdmYWxsYmFjay1kZWZhdWx0Jyxcblx0XHRcdFx0XHRuYW1lOiAnRmFsbGJhY2sgRGVmYXVsdCcsXG5cdFx0XHRcdFx0c3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0czogWydtaW5pbWFsJywgJ2xvdycsICdoaWdoJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdFJlYXNvbmluZ0VmZm9ydDogJ21pbmltYWwnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRcdFx0aWQ6ICd2YWxpZC1kZWZhdWx0Jyxcblx0XHRcdFx0XHRuYW1lOiAnVmFsaWQgRGVmYXVsdCcsXG5cdFx0XHRcdFx0c3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0czogWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnXSxcblx0XHRcdFx0XHRkZWZhdWx0UmVhc29uaW5nRWZmb3J0OiAnbWVkaXVtJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHZlbmRvcjogJ2FjbWUnLFxuXHRcdFx0XHRcdGlkOiAndW5zdXBwb3J0ZWQtb25seScsXG5cdFx0XHRcdFx0bmFtZTogJ1Vuc3VwcG9ydGVkIE9ubHknLFxuXHRcdFx0XHRcdHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM6IFsnbWluaW1hbCddLFxuXHRcdFx0XHRcdGRlZmF1bHRSZWFzb25pbmdFZmZvcnQ6ICdtaW5pbWFsJyxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgd2FpdEZvclN0YXRlKGFnZW50Lm1vZGVscywgbW9kZWxzID0+IG1vZGVscy5sZW5ndGggPT09IDMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVscy5tYXAobW9kZWwgPT4gKHtcblx0XHRcdFx0aWQ6IG1vZGVsLmlkLFxuXHRcdFx0XHR0aGlua2luZ0xldmVsOiBtb2RlbC5jb25maWdTY2hlbWE/LnByb3BlcnRpZXMudGhpbmtpbmdMZXZlbCAmJiB7XG5cdFx0XHRcdFx0ZW51bTogbW9kZWwuY29uZmlnU2NoZW1hLnByb3BlcnRpZXMudGhpbmtpbmdMZXZlbC5lbnVtLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IG1vZGVsLmNvbmZpZ1NjaGVtYS5wcm9wZXJ0aWVzLnRoaW5raW5nTGV2ZWwuZGVmYXVsdCxcblx0XHRcdFx0fSxcblx0XHRcdH0pKSwgW1xuXHRcdFx0XHR7IGlkOiAnYWNtZS9mYWxsYmFjay1kZWZhdWx0JywgdGhpbmtpbmdMZXZlbDogeyBlbnVtOiBbJ2xvdycsICdoaWdoJ10sIGRlZmF1bHQ6ICdsb3cnIH0gfSxcblx0XHRcdFx0eyBpZDogJ2FjbWUvdmFsaWQtZGVmYXVsdCcsIHRoaW5raW5nTGV2ZWw6IHsgZW51bTogWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnXSwgZGVmYXVsdDogJ21lZGl1bScgfSB9LFxuXHRcdFx0XHR7IGlkOiAnYWNtZS91bnN1cHBvcnRlZC1vbmx5JywgdGhpbmtpbmdMZXZlbDogdW5kZWZpbmVkIH0sXG5cdFx0XHRdKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ1NjaGVtYSBlbWl0cyBhIG51bWVyaWMgY29udGV4dFNpemUgcHJvcGVydHkgd2hlbiBsb25nX2NvbnRleHQgdGllciBleGNlZWRzIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSwgW3tcblx0XHRcdFx0aWQ6ICdjbGF1ZGUtc29ubmV0Jyxcblx0XHRcdFx0bmFtZTogJ0NsYXVkZSBTb25uZXQnLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgbGltaXRzOiB7IG1heF9jb250ZXh0X3dpbmRvd190b2tlbnM6IDIwMF8wMDAgfSB9LFxuXHRcdFx0XHRiaWxsaW5nOiB7XG5cdFx0XHRcdFx0bXVsdGlwbGllcjogMSxcblx0XHRcdFx0XHR0b2tlblByaWNlczoge1xuXHRcdFx0XHRcdFx0bWF4UHJvbXB0VG9rZW5zOiAyMDBfMDAwLFxuXHRcdFx0XHRcdFx0bG9uZ0NvbnRleHQ6IHsgbWF4UHJvbXB0VG9rZW5zOiAxXzAwMF8wMDAsIGlucHV0UHJpY2U6IDIgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pLFxuXHRcdH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHdhaXRGb3JTdGF0ZShhZ2VudC5tb2RlbHMsIG1vZGVscyA9PiBtb2RlbHMubGVuZ3RoID4gMCk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHRTaXplID0gbW9kZWxzWzBdLmNvbmZpZ1NjaGVtYT8ucHJvcGVydGllcy5jb250ZXh0U2l6ZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0U2l6ZT8udHlwZSwgJ251bWJlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0U2l6ZT8uZW51bSwgWzIwMF8wMDAsIDFfMDAwXzAwMF0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHRTaXplPy5kZWZhdWx0LCAyMDBfMDAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGV4dFNpemU/LmVudW1MYWJlbHMsIFsnMjAwSycsICcxTSddKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ1NjaGVtYSBvbWl0cyBjb250ZXh0U2l6ZSB3aGVuIGxvbmdfY29udGV4dCB0aWVyIGlzIG1pc3Npbmcgb3Igbm90IGxhcmdlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywge1xuXHRcdFx0Y29waWxvdENsaWVudDogbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ25vLWxvbmctY29udGV4dCcsXG5cdFx0XHRcdFx0bmFtZTogJ05vIExvbmcgQ29udGV4dCcsXG5cdFx0XHRcdFx0YmlsbGluZzogeyBtdWx0aXBsaWVyOiAxLCB0b2tlblByaWNlczogeyBjb250ZXh0TWF4OiAyMDBfMDAwIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZXF1YWwtbG9uZy1jb250ZXh0Jyxcblx0XHRcdFx0XHRuYW1lOiAnRXF1YWwgTG9uZyBDb250ZXh0Jyxcblx0XHRcdFx0XHRiaWxsaW5nOiB7XG5cdFx0XHRcdFx0XHRtdWx0aXBsaWVyOiAxLFxuXHRcdFx0XHRcdFx0dG9rZW5QcmljZXM6IHsgY29udGV4dE1heDogMjAwXzAwMCwgbG9uZ0NvbnRleHQ6IHsgY29udGV4dE1heDogMjAwXzAwMCB9IH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdF0pLFxuXHRcdH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHdhaXRGb3JTdGF0ZShhZ2VudC5tb2RlbHMsIG1vZGVscyA9PiBtb2RlbHMubGVuZ3RoID4gMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbHNbMF0uY29uZmlnU2NoZW1hLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsc1sxXS5jb25maWdTY2hlbWEsIHVuZGVmaW5lZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjb25maWdTY2hlbWEgc2hvd3MgYm90aCBjb250ZXh0IG9wdGlvbnMgYnkgZGVmYXVsdCB3aGVuIGxvbmdfY29udGV4dCB0aWVyIGhhcyBubyBzdXJjaGFyZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSwgW3tcblx0XHRcdFx0aWQ6ICdmcmVlLWxvbmctY29udGV4dCcsXG5cdFx0XHRcdG5hbWU6ICdGcmVlIExvbmcgQ29udGV4dCcsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyBsaW1pdHM6IHsgbWF4X2NvbnRleHRfd2luZG93X3Rva2VuczogMjAwXzAwMCB9IH0sXG5cdFx0XHRcdGJpbGxpbmc6IHtcblx0XHRcdFx0XHRtdWx0aXBsaWVyOiAxLFxuXHRcdFx0XHRcdHRva2VuUHJpY2VzOiB7XG5cdFx0XHRcdFx0XHRjb250ZXh0TWF4OiAyMDBfMDAwLFxuXHRcdFx0XHRcdFx0bG9uZ0NvbnRleHQ6IHsgY29udGV4dE1heDogMV8wMDBfMDAwIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH1dKSxcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoYWdlbnQubW9kZWxzLCBtb2RlbHMgPT4gbW9kZWxzLmxlbmd0aCA+IDApO1xuXG5cdFx0XHRjb25zdCBjb250ZXh0U2l6ZSA9IG1vZGVsc1swXS5jb25maWdTY2hlbWE/LnByb3BlcnRpZXM/LmNvbnRleHRTaXplO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHRTaXplPy50eXBlLCAnbnVtYmVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHRTaXplPy5lbnVtLCBbMjAwXzAwMCwgMV8wMDBfMDAwXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dFNpemU/LmRlZmF1bHQsIDIwMF8wMDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZXh0U2l6ZT8uZW51bUxhYmVscywgWycyMDBLJywgJzFNJ10pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY29uZmlnU2NoZW1hIHNob3dzIG9ubHkgbG9uZyBjb250ZXh0IG9wdGlvbiB3aGVuIGxvbmdfY29udGV4dCB0aWVyIGhhcyBubyBzdXJjaGFyZ2UgYW5kIHByZWZlckxvbmdDb250ZXh0IGlzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhZ2VudCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSwgW3tcblx0XHRcdFx0aWQ6ICdmcmVlLWxvbmctY29udGV4dCcsXG5cdFx0XHRcdG5hbWU6ICdGcmVlIExvbmcgQ29udGV4dCcsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyBsaW1pdHM6IHsgbWF4X2NvbnRleHRfd2luZG93X3Rva2VuczogMjAwXzAwMCB9IH0sXG5cdFx0XHRcdGJpbGxpbmc6IHtcblx0XHRcdFx0XHRtdWx0aXBsaWVyOiAxLFxuXHRcdFx0XHRcdHRva2VuUHJpY2VzOiB7XG5cdFx0XHRcdFx0XHRjb250ZXh0TWF4OiAyMDBfMDAwLFxuXHRcdFx0XHRcdFx0bG9uZ0NvbnRleHQ6IHsgY29udGV4dE1heDogMV8wMDBfMDAwIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH1dKSxcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtBZ2VudEhvc3RQcmVmZXJMb25nQ29udGV4dEVuYWJsZWRDb25maWdLZXldOiB0cnVlIH0pO1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoYWdlbnQubW9kZWxzLCBtb2RlbHMgPT4gbW9kZWxzLmxlbmd0aCA+IDApO1xuXG5cdFx0XHRjb25zdCBjb250ZXh0U2l6ZSA9IG1vZGVsc1swXS5jb25maWdTY2hlbWE/LnByb3BlcnRpZXM/LmNvbnRleHRTaXplO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHRTaXplPy50eXBlLCAnbnVtYmVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHRTaXplPy5lbnVtLCBbMV8wMDBfMDAwXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dFNpemU/LmRlZmF1bHQsIDFfMDAwXzAwMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRleHRTaXplPy5lbnVtTGFiZWxzLCBbJzFNJ10pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0c3VpdGUoJ2NvbnRleHRTaXplIHRvIGNvbnRleHRUaWVyIG1hcHBpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9uZ0NvbnRleHRNb2RlbDogSVRlc3RDb3BpbG90TW9kZWxJbmZvID0ge1xuXHRcdFx0aWQ6ICdjbGF1ZGUtc29ubmV0Jyxcblx0XHRcdG5hbWU6ICdDbGF1ZGUgU29ubmV0Jyxcblx0XHRcdGNhcGFiaWxpdGllczogeyBsaW1pdHM6IHsgbWF4X2NvbnRleHRfd2luZG93X3Rva2VuczogMjAwXzAwMCB9IH0sXG5cdFx0XHRiaWxsaW5nOiB7XG5cdFx0XHRcdG11bHRpcGxpZXI6IDEsXG5cdFx0XHRcdHRva2VuUHJpY2VzOiB7XG5cdFx0XHRcdFx0Y29udGV4dE1heDogMjAwXzAwMCxcblx0XHRcdFx0XHRsb25nQ29udGV4dDogeyBjb250ZXh0TWF4OiAxXzAwMF8wMDAsIGlucHV0UHJpY2U6IDIgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGNhcHR1cmVTZXNzaW9uQ29uZmlnKG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCwgbW9kZWxzOiByZWFkb25seSBJVGVzdENvcGlsb3RNb2RlbEluZm9bXSwgcHJlZmVyTG9uZ0NvbnRleHQ/OiBib29sZWFuKTogUHJvbWlzZTxDb3BpbG90Q3JlYXRlU2Vzc2lvbk9wdGlvbnMgfCB1bmRlZmluZWQ+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSwgbW9kZWxzKTtcblx0XHRcdGxldCBjYXB0dXJlZENvbmZpZzogQ29waWxvdENyZWF0ZVNlc3Npb25PcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y2xpZW50LmNyZWF0ZVNlc3Npb24gPSBhc3luYyBjb25maWcgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZENvbmZpZyA9IGNvbmZpZztcblx0XHRcdFx0cmV0dXJuIG5ldyBNb2NrQ29waWxvdFNlc3Npb24oKSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHsgYWdlbnQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHByZWZlckxvbmdDb250ZXh0KSB7XG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtBZ2VudEhvc3RQcmVmZXJMb25nQ29udGV4dEVuYWJsZWRDb25maWdLZXldOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoYWdlbnQubW9kZWxzLCBtID0+IG0ubGVuZ3RoID4gMCk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRcdHNlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnY3R4LXNlc3Npb24nKSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSxcblx0XHRcdFx0XHQuLi4obW9kZWwgPyB7IG1vZGVsIH0gOiB7fSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShkZWZhdWx0Q2hhdFVyaShyZXN1bHQuc2Vzc2lvbiksICdoZWxsbycsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiBjYXB0dXJlZENvbmZpZztcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGVzdCgnbWFwcyB0aGUgbGFyZ2VzdCBudW1lcmljIGNvbnRleHQgc2l6ZSB0byBsb25nX2NvbnRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBjYXB0dXJlU2Vzc2lvbkNvbmZpZyh7IGlkOiAnY2xhdWRlLXNvbm5ldCcsIGNvbmZpZzogeyBjb250ZXh0U2l6ZTogJzEwMDAwMDAnIH0gfSwgW2xvbmdDb250ZXh0TW9kZWxdKTtcblx0XHRcdGFzc2VydC5vayhjb25maWcsICdTREsgY3JlYXRlU2Vzc2lvbiBzaG91bGQgYmUgY2FsbGVkIGR1cmluZyBtYXRlcmlhbGl6YXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuY29udGV4dFRpZXIsICdsb25nX2NvbnRleHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcHMgdGhlIGRlZmF1bHQgbnVtZXJpYyBjb250ZXh0IHNpemUgdG8gZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IGNhcHR1cmVTZXNzaW9uQ29uZmlnKHsgaWQ6ICdjbGF1ZGUtc29ubmV0JywgY29uZmlnOiB7IGNvbnRleHRTaXplOiAnMjAwMDAwJyB9IH0sIFtsb25nQ29udGV4dE1vZGVsXSk7XG5cdFx0XHRhc3NlcnQub2soY29uZmlnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuY29udGV4dFRpZXIsICdkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkcm9wcyBhIG51bWVyaWMgY29udGV4dCBzaXplIHRoZSBtb2RlbCBkb2VzIG5vdCBvZmZlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IGNhcHR1cmVTZXNzaW9uQ29uZmlnKFxuXHRcdFx0XHR7IGlkOiAnbm8tY29udGV4dC1waWNrZXInLCBjb25maWc6IHsgY29udGV4dFNpemU6ICcxMDAwMDAwJyB9IH0sXG5cdFx0XHRcdFt7IGlkOiAnbm8tY29udGV4dC1waWNrZXInLCBuYW1lOiAnTm8gUGlja2VyJyB9XSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soY29uZmlnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuY29udGV4dFRpZXIsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXNzZXMgdGhyb3VnaCBhIGxlZ2FjeSByZXNvbHZlZCB0aWVyIHN0cmluZyB1bmRlciB0aGUgZGVwcmVjYXRlZCBjb250ZXh0VGllciBrZXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBjYXB0dXJlU2Vzc2lvbkNvbmZpZyh7IGlkOiAnY2xhdWRlLXNvbm5ldCcsIGNvbmZpZzogeyBjb250ZXh0VGllcjogJ2xvbmdfY29udGV4dCcgfSB9LCBbbG9uZ0NvbnRleHRNb2RlbF0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbmZpZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmNvbnRleHRUaWVyLCAnbG9uZ19jb250ZXh0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWF2ZXMgdGhlIFNESyBvbiBpdHMgZGVmYXVsdCB0aWVyIHdoZW4gbW9kZWwgaGFzIG5vIHN1cmNoYXJnZSBhbmQgbm8gZXhwbGljaXQgc2VsZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZnJlZUxvbmdDb250ZXh0TW9kZWw6IElUZXN0Q29waWxvdE1vZGVsSW5mbyA9IHtcblx0XHRcdFx0aWQ6ICdmcmVlLWxvbmctY3R4Jyxcblx0XHRcdFx0bmFtZTogJ0ZyZWUgTG9uZyBDdHgnLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgbGltaXRzOiB7IG1heF9jb250ZXh0X3dpbmRvd190b2tlbnM6IDIwMF8wMDAgfSB9LFxuXHRcdFx0XHRiaWxsaW5nOiB7XG5cdFx0XHRcdFx0bXVsdGlwbGllcjogMSxcblx0XHRcdFx0XHR0b2tlblByaWNlczoge1xuXHRcdFx0XHRcdFx0Y29udGV4dE1heDogMjAwXzAwMCxcblx0XHRcdFx0XHRcdGxvbmdDb250ZXh0OiB7IGNvbnRleHRNYXg6IDFfMDAwXzAwMCB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgY2FwdHVyZVNlc3Npb25Db25maWcoeyBpZDogJ2ZyZWUtbG9uZy1jdHgnIH0sIFtmcmVlTG9uZ0NvbnRleHRNb2RlbF0pO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbmZpZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmNvbnRleHRUaWVyLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBsb25nX2NvbnRleHQgd2hlbiBtb2RlbCBoYXMgbm8gc3VyY2hhcmdlLCBubyBleHBsaWNpdCBzZWxlY3Rpb24gYW5kIHByZWZlckxvbmdDb250ZXh0IGlzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmcmVlTG9uZ0NvbnRleHRNb2RlbDogSVRlc3RDb3BpbG90TW9kZWxJbmZvID0ge1xuXHRcdFx0XHRpZDogJ2ZyZWUtbG9uZy1jdHgnLFxuXHRcdFx0XHRuYW1lOiAnRnJlZSBMb25nIEN0eCcsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyBsaW1pdHM6IHsgbWF4X2NvbnRleHRfd2luZG93X3Rva2VuczogMjAwXzAwMCB9IH0sXG5cdFx0XHRcdGJpbGxpbmc6IHtcblx0XHRcdFx0XHRtdWx0aXBsaWVyOiAxLFxuXHRcdFx0XHRcdHRva2VuUHJpY2VzOiB7XG5cdFx0XHRcdFx0XHRjb250ZXh0TWF4OiAyMDBfMDAwLFxuXHRcdFx0XHRcdFx0bG9uZ0NvbnRleHQ6IHsgY29udGV4dE1heDogMV8wMDBfMDAwIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBjYXB0dXJlU2Vzc2lvbkNvbmZpZyh7IGlkOiAnZnJlZS1sb25nLWN0eCcgfSwgW2ZyZWVMb25nQ29udGV4dE1vZGVsXSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQub2soY29uZmlnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuY29udGV4dFRpZXIsICdsb25nX2NvbnRleHQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQtY3JlYXRlZCBzZXNzaW9ucyBjYW4gcmVzb2x2ZSBzZXNzaW9uLXN0YXRlIHBhdGhzIHZpYSBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRjb25zdCB7IGFnZW50LCBpbnN0YW50aWF0aW9uU2VydmljZSB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywge1xuXHRcdFx0ZW52aXJvbm1lbnRTZXJ2aWNlUmVnaXN0cmF0aW9uOiAnbmF0aXZlJyxcblx0XHRcdHNlc3Npb25EYXRhU2VydmljZSxcblx0XHR9KTtcblx0XHRjb25zdCBwcmV2aW91c0NvcGlsb3RIb21lID0gcHJvY2Vzcy5lbnZbJ0NPUElMT1RfSE9NRSddO1xuXHRcdGRlbGV0ZSBwcm9jZXNzLmVudlsnQ09QSUxPVF9IT01FJ107XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNyZWF0ZWRTZXNzaW9uID0gY3JlYXRlQWdlbnRTZXNzaW9uVGhyb3VnaEFnZW50KGFnZW50LCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlZFNlc3Npb24uc2Vzc2lvbik7XG5cdFx0XHRhd2FpdCBhZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IG9uUGVybWlzc2lvblJlcXVlc3QgPSBjcmVhdGVkU2Vzc2lvbi5jcmVhdGVPcHRpb25zKCk/Lm9uUGVybWlzc2lvblJlcXVlc3Q7XG5cdFx0XHRhc3NlcnQub2sob25QZXJtaXNzaW9uUmVxdWVzdCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9uUGVybWlzc2lvblJlcXVlc3Qoe1xuXHRcdFx0XHRraW5kOiAncmVhZCcsXG5cdFx0XHRcdGludGVudGlvbjogJ3JlYWQgcGxhbicsXG5cdFx0XHRcdHBhdGg6IFVSSS5maWxlKCcvbW9jay1ob21lLy5jb3BpbG90L3Nlc3Npb24tc3RhdGUvdGVzdC1zZXNzaW9uLTEvcGxhbi5tZCcpLmZzUGF0aCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlYWQtcGxhbi1hZ2VudC1jb21wb3NpdGlvbicsXG5cdFx0XHR9LCB7IHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbi0xJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5raW5kLCAnYXBwcm92ZS1vbmNlJyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChwcmV2aW91c0NvcGlsb3RIb21lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZGVsZXRlIHByb2Nlc3MuZW52WydDT1BJTE9UX0hPTUUnXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb2Nlc3MuZW52WydDT1BJTE9UX0hPTUUnXSA9IHByZXZpb3VzQ29waWxvdEhvbWU7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IHRvb2wgY2FsbCBjb250cmlidXRvciBwcmVmZXJzIHRoZSBtZXNzYWdlIHNlbmRlciB3aGVuIGl0IHByb3ZpZGVzIHRoZSB0b29sJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRjb25zdCB7IGFnZW50LCBpbnN0YW50aWF0aW9uU2VydmljZSB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBlbnZpcm9ubWVudFNlcnZpY2VSZWdpc3RyYXRpb246ICduYXRpdmUnLCBzZXNzaW9uRGF0YVNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgYWN0aW9uczogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFnZW50Lm9uRGlkU2Vzc2lvblByb2dyZXNzKHNpZ25hbCA9PiB7XG5cdFx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaChzaWduYWwuYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50VG9vbFNldCA9IG5ldyBBY3RpdmVDbGllbnRUb29sU2V0KCk7XG5cdFx0Y29uc3Qgc2hhcmVkVG9vbDogVG9vbERlZmluaXRpb24gPSB7IG5hbWU6ICdzaGFyZWQnLCBkZXNjcmlwdGlvbjogJ1NoYXJlZCB0b29sJywgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0gfTtcblx0XHRhY3RpdmVDbGllbnRUb29sU2V0LnNldCgnY2xpZW50LUEnLCBbc2hhcmVkVG9vbF0pO1xuXHRcdGFjdGl2ZUNsaWVudFRvb2xTZXQuc2V0KCdjbGllbnQtQicsIFtzaGFyZWRUb29sXSk7XG5cdFx0Y29uc3QgbW9ja1Nlc3Npb24gPSBuZXcgTW9ja0NvcGlsb3RTZXNzaW9uKCk7XG5cdFx0Y29uc3QgY3JlYXRlZFNlc3Npb24gPSBjcmVhdGVBZ2VudFNlc3Npb25UaHJvdWdoQWdlbnQoYWdlbnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRtb2NrU2Vzc2lvbixcblx0XHRcdGFjdGl2ZUNsaWVudFRvb2xTZXQsXG5cdFx0XHRzbmFwc2hvdDogeyB0b29sczogYWN0aXZlQ2xpZW50VG9vbFNldC5tZXJnZWQoKSwgcGx1Z2luczogW10sIG1jcFNlcnZlcnM6IHt9IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZWRTZXNzaW9uLnNlc3Npb24pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb24oKTtcblx0XHRcdGFnZW50U2Vzc2lvbi5yZXNldFR1cm5TdGF0ZSgndHVybi0xJywgJ2NsaWVudC1CJyk7XG5cblx0XHRcdG1vY2tTZXNzaW9uLmVtaXQoe1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLFxuXHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0b29sLTEnLCB0b29sTmFtZTogJ3NoYXJlZCcsIGFyZ3VtZW50czoge30gfSxcblx0XHRcdH0gYXMgU2Vzc2lvbkV2ZW50UGF5bG9hZDwndG9vbC5leGVjdXRpb25fc3RhcnQnPik7XG5cblx0XHRcdGNvbnN0IHRvb2xTdGFydCA9IGFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29sU3RhcnQ/LnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQgPyB0b29sU3RhcnQuY29udHJpYnV0b3IgOiB1bmRlZmluZWQsIHtcblx0XHRcdFx0a2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LFxuXHRcdFx0XHRjbGllbnRJZDogJ2NsaWVudC1CJyxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IHRvb2wgY29tcGxldGlvbiB1bmJsb2NrcyBhIHBlbmRpbmcgcGVybWlzc2lvbiByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRjb25zdCB7IGFnZW50LCBpbnN0YW50aWF0aW9uU2VydmljZSwgZmlsZVNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgZW52aXJvbm1lbnRTZXJ2aWNlUmVnaXN0cmF0aW9uOiAnbmF0aXZlJywgc2Vzc2lvbkRhdGFTZXJ2aWNlIH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclBlbmRpbmdFZGl0Q29udGVudFByb3ZpZGVyKGZpbGVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY3JlYXRlZFNlc3Npb24gPSBjcmVhdGVBZ2VudFNlc3Npb25UaHJvdWdoQWdlbnQoYWdlbnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlZFNlc3Npb24uc2Vzc2lvbik7XG5cdFx0Y29uc3QgcGVuZGluZ0VkaXRDb250ZW50VXJpID0gbmV3IERlZmVycmVkUHJvbWlzZTxVUkk+KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFnZW50Lm9uRGlkU2Vzc2lvblByb2dyZXNzKHNpZ25hbCA9PiB7XG5cdFx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gc2lnbmFsLnN0YXRlLmVkaXRzPy5pdGVtc1swXT8uYWZ0ZXI/LmNvbnRlbnQudXJpO1xuXHRcdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdFx0cGVuZGluZ0VkaXRDb250ZW50VXJpLmNvbXBsZXRlKFVSSS5wYXJzZSh1cmkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnRTZXNzaW9uLmluaXRpYWxpemVTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBvblBlcm1pc3Npb25SZXF1ZXN0ID0gY3JlYXRlZFNlc3Npb24uY3JlYXRlT3B0aW9ucygpPy5vblBlcm1pc3Npb25SZXF1ZXN0O1xuXHRcdFx0YXNzZXJ0Lm9rKG9uUGVybWlzc2lvblJlcXVlc3QpO1xuXG5cdFx0XHRjb25zdCBwZXJtaXNzaW9uUmVxdWVzdFJlc3VsdCA9IG9uUGVybWlzc2lvblJlcXVlc3Qoe1xuXHRcdFx0XHRraW5kOiAnd3JpdGUnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0Y2FuT2ZmZXJTZXNzaW9uQXBwcm92YWw6IGZhbHNlLFxuXHRcdFx0XHRkaWZmOiAnLS0tIGEvZmlsZS50eHRcXG4rKysgYi9maWxlLnR4dFxcbkBAIC0wLDAgKzEgQEBcXG4rYWZ0ZXInLFxuXHRcdFx0XHRmaWxlTmFtZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50eHQnKS5mc1BhdGgsXG5cdFx0XHRcdGludGVudGlvbjogJ3dyaXRlIGZpbGUnLFxuXHRcdFx0XHRuZXdGaWxlQ29udGVudHM6ICdhZnRlcicsXG5cdFx0XHR9LCB7IHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbi0xJyB9KTtcblx0XHRcdGNvbnN0IGVkaXRDb250ZW50VXJpID0gYXdhaXQgcGVuZGluZ0VkaXRDb250ZW50VXJpLnA7XG5cblx0XHRcdGFnZW50U2Vzc2lvbi5oYW5kbGVDbGllbnRUb29sQ2FsbENvbXBsZXRlKCd0b29sLTEnLCB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnQ2xpZW50IHRvb2wgZmFpbGVkJyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmYWlsZWQgYmVmb3JlIGFwcHJvdmFsJyB9XSxcblx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ2ZhaWxlZCBiZWZvcmUgYXBwcm92YWwnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwZXJtaXNzaW9uUmVzdWx0OiBhd2FpdCBwZXJtaXNzaW9uUmVxdWVzdFJlc3VsdCxcblx0XHRcdFx0cGVuZGluZ0VkaXRDb250ZW50RXhpc3RzOiBhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoZWRpdENvbnRlbnRVcmkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwZXJtaXNzaW9uUmVzdWx0OiB7IGtpbmQ6ICdhcHByb3ZlLW9uY2UnIH0sXG5cdFx0XHRcdHBlbmRpbmdFZGl0Q29udGVudEV4aXN0czogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG8tYXBwcm92ZXMgb25lIGR1cGxpY2F0ZSB3cml0ZSBwZXJtaXNzaW9uIHJlcXVlc3QgYWZ0ZXIgYXBwcm92YWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHsgYWdlbnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBmaWxlU2VydmljZSB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBlbnZpcm9ubWVudFNlcnZpY2VSZWdpc3RyYXRpb246ICduYXRpdmUnLCBzZXNzaW9uRGF0YVNlcnZpY2UgfSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyUGVuZGluZ0VkaXRDb250ZW50UHJvdmlkZXIoZmlsZVNlcnZpY2UpKTtcblx0XHRjb25zdCBjcmVhdGVkU2Vzc2lvbiA9IGNyZWF0ZUFnZW50U2Vzc2lvblRocm91Z2hBZ2VudChhZ2VudCwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVkU2Vzc2lvbi5zZXNzaW9uKTtcblx0XHRsZXQgbmV4dFBlbmRpbmdQZXJtaXNzaW9uID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGxldCBwZW5kaW5nUGVybWlzc2lvbkNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWdlbnQub25EaWRTZXNzaW9uUHJvZ3Jlc3Moc2lnbmFsID0+IHtcblx0XHRcdGlmIChzaWduYWwua2luZCA9PT0gJ3BlbmRpbmdfY29uZmlybWF0aW9uJykge1xuXHRcdFx0XHRwZW5kaW5nUGVybWlzc2lvbkNvdW50Kys7XG5cdFx0XHRcdG5leHRQZW5kaW5nUGVybWlzc2lvbi5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnRTZXNzaW9uLmluaXRpYWxpemVTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBvblBlcm1pc3Npb25SZXF1ZXN0ID0gY3JlYXRlZFNlc3Npb24uY3JlYXRlT3B0aW9ucygpPy5vblBlcm1pc3Npb25SZXF1ZXN0O1xuXHRcdFx0YXNzZXJ0Lm9rKG9uUGVybWlzc2lvblJlcXVlc3QpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdDogUGVybWlzc2lvblJlcXVlc3QgPSB7XG5cdFx0XHRcdGtpbmQ6ICd3cml0ZScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0XHRjYW5PZmZlclNlc3Npb25BcHByb3ZhbDogdHJ1ZSxcblx0XHRcdFx0ZGlmZjogJy0tLSBhL2ZpbGUudHh0XFxuKysrIGIvZmlsZS50eHRcXG5AQCAtMCwwICsxIEBAXFxuK2FmdGVyJyxcblx0XHRcdFx0ZmlsZU5hbWU6IFVSSS5maWxlKCcvb3V0c2lkZS9maWxlLnR4dCcpLmZzUGF0aCxcblx0XHRcdFx0aW50ZW50aW9uOiAnd3JpdGUgZmlsZScsXG5cdFx0XHRcdG5ld0ZpbGVDb250ZW50czogJ2FmdGVyJyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGZpcnN0UmVzdWx0UHJvbWlzZSA9IG9uUGVybWlzc2lvblJlcXVlc3QocmVxdWVzdCwgeyBzZXNzaW9uSWQ6ICd0ZXN0LXNlc3Npb24tMScgfSk7XG5cdFx0XHRhd2FpdCBuZXh0UGVuZGluZ1Blcm1pc3Npb24ucDtcblx0XHRcdGFnZW50U2Vzc2lvbi5yZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdCgndG9vbC0xJywgdHJ1ZSk7XG5cdFx0XHRjb25zdCBmaXJzdFJlc3VsdCA9IGF3YWl0IGZpcnN0UmVzdWx0UHJvbWlzZTtcblx0XHRcdGNvbnN0IGR1cGxpY2F0ZVJlc3VsdCA9IGF3YWl0IG9uUGVybWlzc2lvblJlcXVlc3QoeyAuLi5yZXF1ZXN0IH0sIHsgc2Vzc2lvbklkOiAndGVzdC1zZXNzaW9uLTEnIH0pO1xuXG5cdFx0XHRuZXh0UGVuZGluZ1Blcm1pc3Npb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCB0aGlyZFJlc3VsdFByb21pc2UgPSBvblBlcm1pc3Npb25SZXF1ZXN0KHsgLi4ucmVxdWVzdCB9LCB7IHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbi0xJyB9KTtcblx0XHRcdGF3YWl0IG5leHRQZW5kaW5nUGVybWlzc2lvbi5wO1xuXHRcdFx0YWdlbnRTZXNzaW9uLnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KCd0b29sLTEnLCBmYWxzZSk7XG5cdFx0XHRjb25zdCB0aGlyZFJlc3VsdCA9IGF3YWl0IHRoaXJkUmVzdWx0UHJvbWlzZTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc3VsdHM6IFtmaXJzdFJlc3VsdCwgZHVwbGljYXRlUmVzdWx0LCB0aGlyZFJlc3VsdF0sXG5cdFx0XHRcdHBlbmRpbmdQZXJtaXNzaW9uQ291bnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdHM6IFt7IGtpbmQ6ICdhcHByb3ZlLW9uY2UnIH0sIHsga2luZDogJ2FwcHJvdmUtb25jZScgfSwgeyBraW5kOiAnZGVuaWVkLWludGVyYWN0aXZlbHktYnktdXNlcicgfV0sXG5cdFx0XHRcdHBlbmRpbmdQZXJtaXNzaW9uQ291bnQ6IDIsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIGNvbmZpcm1hdGlvbiB3aGVuIGEgc2Vjb25kIHdyaXRlIHBlcm1pc3Npb24gcmVxdWVzdCBkaWZmZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRjb25zdCB7IGFnZW50LCBpbnN0YW50aWF0aW9uU2VydmljZSwgZmlsZVNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgZW52aXJvbm1lbnRTZXJ2aWNlUmVnaXN0cmF0aW9uOiAnbmF0aXZlJywgc2Vzc2lvbkRhdGFTZXJ2aWNlIH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclBlbmRpbmdFZGl0Q29udGVudFByb3ZpZGVyKGZpbGVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY3JlYXRlZFNlc3Npb24gPSBjcmVhdGVBZ2VudFNlc3Npb25UaHJvdWdoQWdlbnQoYWdlbnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlZFNlc3Npb24uc2Vzc2lvbik7XG5cdFx0bGV0IG5leHRQZW5kaW5nUGVybWlzc2lvbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRsZXQgcGVuZGluZ1Blcm1pc3Npb25Db3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFnZW50Lm9uRGlkU2Vzc2lvblByb2dyZXNzKHNpZ25hbCA9PiB7XG5cdFx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0cGVuZGluZ1Blcm1pc3Npb25Db3VudCsrO1xuXHRcdFx0XHRuZXh0UGVuZGluZ1Blcm1pc3Npb24uY29tcGxldGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFnZW50U2Vzc2lvbi5pbml0aWFsaXplU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgb25QZXJtaXNzaW9uUmVxdWVzdCA9IGNyZWF0ZWRTZXNzaW9uLmNyZWF0ZU9wdGlvbnMoKT8ub25QZXJtaXNzaW9uUmVxdWVzdDtcblx0XHRcdGFzc2VydC5vayhvblBlcm1pc3Npb25SZXF1ZXN0KTtcblx0XHRcdGNvbnN0IHJlcXVlc3Q6IFBlcm1pc3Npb25SZXF1ZXN0ID0ge1xuXHRcdFx0XHRraW5kOiAnd3JpdGUnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0Y2FuT2ZmZXJTZXNzaW9uQXBwcm92YWw6IHRydWUsXG5cdFx0XHRcdGRpZmY6ICctLS0gYS9maWxlLnR4dFxcbisrKyBiL2ZpbGUudHh0XFxuQEAgLTAsMCArMSBAQFxcbitmaXJzdCcsXG5cdFx0XHRcdGZpbGVOYW1lOiBVUkkuZmlsZSgnL291dHNpZGUvZmlsZS50eHQnKS5mc1BhdGgsXG5cdFx0XHRcdGludGVudGlvbjogJ3dyaXRlIGZpbGUnLFxuXHRcdFx0XHRuZXdGaWxlQ29udGVudHM6ICdmaXJzdCcsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBmaXJzdFJlc3VsdFByb21pc2UgPSBvblBlcm1pc3Npb25SZXF1ZXN0KHJlcXVlc3QsIHsgc2Vzc2lvbklkOiAndGVzdC1zZXNzaW9uLTEnIH0pO1xuXHRcdFx0YXdhaXQgbmV4dFBlbmRpbmdQZXJtaXNzaW9uLnA7XG5cdFx0XHRhZ2VudFNlc3Npb24ucmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QoJ3Rvb2wtMScsIHRydWUpO1xuXHRcdFx0Y29uc3QgZmlyc3RSZXN1bHQgPSBhd2FpdCBmaXJzdFJlc3VsdFByb21pc2U7XG5cblx0XHRcdG5leHRQZW5kaW5nUGVybWlzc2lvbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IGNoYW5nZWRSZXN1bHRQcm9taXNlID0gb25QZXJtaXNzaW9uUmVxdWVzdCh7XG5cdFx0XHRcdC4uLnJlcXVlc3QsXG5cdFx0XHRcdGRpZmY6ICctLS0gYS9vdGhlci50eHRcXG4rKysgYi9vdGhlci50eHRcXG5AQCAtMCwwICsxIEBAXFxuK3NlY29uZCcsXG5cdFx0XHRcdGZpbGVOYW1lOiBVUkkuZmlsZSgnL291dHNpZGUvb3RoZXIudHh0JykuZnNQYXRoLFxuXHRcdFx0XHRuZXdGaWxlQ29udGVudHM6ICdzZWNvbmQnLFxuXHRcdFx0fSwgeyBzZXNzaW9uSWQ6ICd0ZXN0LXNlc3Npb24tMScgfSk7XG5cdFx0XHRhd2FpdCBuZXh0UGVuZGluZ1Blcm1pc3Npb24ucDtcblx0XHRcdGFnZW50U2Vzc2lvbi5yZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdCgndG9vbC0xJywgZmFsc2UpO1xuXHRcdFx0Y29uc3QgY2hhbmdlZFJlc3VsdCA9IGF3YWl0IGNoYW5nZWRSZXN1bHRQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0czogW2ZpcnN0UmVzdWx0LCBjaGFuZ2VkUmVzdWx0XSxcblx0XHRcdFx0cGVuZGluZ1Blcm1pc3Npb25Db3VudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0czogW3sga2luZDogJ2FwcHJvdmUtb25jZScgfSwgeyBraW5kOiAnZGVuaWVkLWludGVyYWN0aXZlbHktYnktdXNlcicgfV0sXG5cdFx0XHRcdHBlbmRpbmdQZXJtaXNzaW9uQ291bnQ6IDIsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG8tYXBwcm92ZXMgb25lIGR1cGxpY2F0ZSByZWFkIHBlcm1pc3Npb24gcmVxdWVzdCBhZnRlciBhcHByb3ZhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgeyBhZ2VudCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGZpbGVTZXJ2aWNlIH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IGVudmlyb25tZW50U2VydmljZVJlZ2lzdHJhdGlvbjogJ25hdGl2ZScsIHNlc3Npb25EYXRhU2VydmljZSB9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJQZW5kaW5nRWRpdENvbnRlbnRQcm92aWRlcihmaWxlU2VydmljZSkpO1xuXHRcdGNvbnN0IGNyZWF0ZWRTZXNzaW9uID0gY3JlYXRlQWdlbnRTZXNzaW9uVGhyb3VnaEFnZW50KGFnZW50LCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZWRTZXNzaW9uLnNlc3Npb24pO1xuXHRcdGxldCBuZXh0UGVuZGluZ1Blcm1pc3Npb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IHBlbmRpbmdQZXJtaXNzaW9uQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZFNlc3Npb25Qcm9ncmVzcyhzaWduYWwgPT4ge1xuXHRcdFx0aWYgKHNpZ25hbC5raW5kID09PSAncGVuZGluZ19jb25maXJtYXRpb24nKSB7XG5cdFx0XHRcdHBlbmRpbmdQZXJtaXNzaW9uQ291bnQrKztcblx0XHRcdFx0bmV4dFBlbmRpbmdQZXJtaXNzaW9uLmNvbXBsZXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IG9uUGVybWlzc2lvblJlcXVlc3QgPSBjcmVhdGVkU2Vzc2lvbi5jcmVhdGVPcHRpb25zKCk/Lm9uUGVybWlzc2lvblJlcXVlc3Q7XG5cdFx0XHRhc3NlcnQub2sob25QZXJtaXNzaW9uUmVxdWVzdCk7XG5cdFx0XHRjb25zdCByZXF1ZXN0OiBQZXJtaXNzaW9uUmVxdWVzdCA9IHtcblx0XHRcdFx0a2luZDogJ3JlYWQnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdFx0aW50ZW50aW9uOiAncmVhZCBmaWxlJyxcblx0XHRcdFx0cGF0aDogVVJJLmZpbGUoJy9vdXRzaWRlL2ZpbGUudHh0JykuZnNQYXRoLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZmlyc3RSZXN1bHRQcm9taXNlID0gb25QZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0LCB7IHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbi0xJyB9KTtcblx0XHRcdGF3YWl0IG5leHRQZW5kaW5nUGVybWlzc2lvbi5wO1xuXHRcdFx0YWdlbnRTZXNzaW9uLnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KCd0b29sLTEnLCB0cnVlKTtcblx0XHRcdGNvbnN0IGZpcnN0UmVzdWx0ID0gYXdhaXQgZmlyc3RSZXN1bHRQcm9taXNlO1xuXHRcdFx0Y29uc3QgZHVwbGljYXRlUmVzdWx0ID0gYXdhaXQgb25QZXJtaXNzaW9uUmVxdWVzdCh7IC4uLnJlcXVlc3QgfSwgeyBzZXNzaW9uSWQ6ICd0ZXN0LXNlc3Npb24tMScgfSk7XG5cblx0XHRcdG5leHRQZW5kaW5nUGVybWlzc2lvbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IHRoaXJkUmVzdWx0UHJvbWlzZSA9IG9uUGVybWlzc2lvblJlcXVlc3QoeyAuLi5yZXF1ZXN0IH0sIHsgc2Vzc2lvbklkOiAndGVzdC1zZXNzaW9uLTEnIH0pO1xuXHRcdFx0YXdhaXQgbmV4dFBlbmRpbmdQZXJtaXNzaW9uLnA7XG5cdFx0XHRhZ2VudFNlc3Npb24ucmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QoJ3Rvb2wtMScsIGZhbHNlKTtcblx0XHRcdGNvbnN0IHRoaXJkUmVzdWx0ID0gYXdhaXQgdGhpcmRSZXN1bHRQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0czogW2ZpcnN0UmVzdWx0LCBkdXBsaWNhdGVSZXN1bHQsIHRoaXJkUmVzdWx0XSxcblx0XHRcdFx0cGVuZGluZ1Blcm1pc3Npb25Db3VudCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0czogW3sga2luZDogJ2FwcHJvdmUtb25jZScgfSwgeyBraW5kOiAnYXBwcm92ZS1vbmNlJyB9LCB7IGtpbmQ6ICdkZW5pZWQtaW50ZXJhY3RpdmVseS1ieS11c2VyJyB9XSxcblx0XHRcdFx0cGVuZGluZ1Blcm1pc3Npb25Db3VudDogMixcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbGlzdFNlc3Npb25zIG9ubHkgcmV0dXJucyBzZXNzaW9ucyB3aXRoIGEgZGF0YWJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IG93bmVkU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnb3duZWQnKTtcblx0XHRjb25zdCBvd25lZERiID0gc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShvd25lZFNlc3Npb24pO1xuXHRcdG93bmVkRGIuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtzZGtTZXNzaW9uKCdvd25lZCcpLCBzZGtTZXNzaW9uKCdleHRlcm5hbCcpXSk7XG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBhZ2VudC5saXN0U2Vzc2lvbnMoKSkubWFwKHMgPT4gQWdlbnRTZXNzaW9uLmlkKHMuc2Vzc2lvbikpLCBbJ293bmVkJ10pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbGlzdFNlc3Npb25zIHJlYWRzIHN0b3JlZCBtZXRhZGF0YSBmcm9tIHNlc3Npb25zIHdpdGggYSBkYXRhYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGVnYWN5U2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbGVnYWN5Jyk7XG5cdFx0Y29uc3QgbGVnYWN5RGIgPSBzZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKGxlZ2FjeVNlc3Npb24pO1xuXHRcdGF3YWl0IGxlZ2FjeURiLm9iamVjdC5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JraW5nRGlyZWN0b3J5JywgVVJJLmZpbGUoJy93b3Jrc3BhY2UnKS50b1N0cmluZygpKTtcblx0XHRsZWdhY3lEYi5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbc2RrU2Vzc2lvbignbGVnYWN5JyldKSB9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpKS5tYXAod2l0aG91dFVuZGVmaW5lZFByb3BlcnRpZXMpLCBbe1xuXHRcdFx0XHRzZXNzaW9uOiBsZWdhY3lTZXNzaW9uLFxuXHRcdFx0XHRzdGFydFRpbWU6IDEwMDAsXG5cdFx0XHRcdG1vZGlmaWVkVGltZTogMjAwMCxcblx0XHRcdFx0c3VtbWFyeTogJ1NESyBsZWdhY3knLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSxcblx0XHRcdH1dKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RTZXNzaW9ucyBkb2VzIG5vdCBpdHNlbGYgcmUtZW1pdCB0aGUgd29ya3NwYWNlbGVzcyB0YWcgKEFnZW50U2VydmljZSBvdmVybGF5cyBpdCBjZW50cmFsbHkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdxdWljaycpO1xuXHRcdGNvbnN0IGRiID0gc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShzZXNzaW9uKTtcblx0XHQvLyBBIGNvbW1pdHRlZCBxdWljayBjaGF0IHBlcnNpc3RzIGEgc2NyYXRjaCBjd2QgQU5EIHRoZSBBSC1vd25lZFxuXHRcdC8vIHdvcmtzcGFjZS1sZXNzIG1hcmtlci4gVGhlIG1hcmtlciBpcyBzdXJmYWNlZCBvbnRvIGBfbWV0YWAgYnlcblx0XHQvLyBgQWdlbnRTZXJ2aWNlLmxpc3RTZXNzaW9uc2AgKHNlZSBhZ2VudFNlcnZpY2UudGVzdC50cyksIG5vdCBieSB0aGUgYWdlbnRcblx0XHQvLyBpdHNlbGYgXHUyMDE0IHRoZSBhZ2VudCBvbmx5IHJlYWRzIGl0IGZvciB0aGUgcmVzdW1lIHN5c3RlbSBwcm9tcHQgLyBjbGVhbnVwLlxuXHRcdGF3YWl0IGRiLm9iamVjdC5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JraW5nRGlyZWN0b3J5JywgVVJJLmZpbGUoJy9zY3JhdGNoL3F1aWNrJykudG9TdHJpbmcoKSk7XG5cdFx0YXdhaXQgZGIub2JqZWN0LnNldE1ldGFkYXRhKCdhZ2VudEhvc3Qud29ya3NwYWNlbGVzcycsICd0cnVlJyk7XG5cdFx0ZGIuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBuZXcgVGVzdENvcGlsb3RDbGllbnQoW3Nka1Nlc3Npb24oJ3F1aWNrJyldKSB9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpKS5tYXAod2l0aG91dFVuZGVmaW5lZFByb3BlcnRpZXMpLCBbe1xuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHRzdGFydFRpbWU6IDEwMDAsXG5cdFx0XHRcdG1vZGlmaWVkVGltZTogMjAwMCxcblx0XHRcdFx0c3VtbWFyeTogJ1NESyBxdWljaycsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvc2NyYXRjaC9xdWljaycpXSxcblx0XHRcdH1dKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25NZXRhZGF0YSByZWFkcyBvbmUgU0RLIHNlc3Npb24gYW5kIHN0b3JlZCBtZXRhZGF0YSB3aXRob3V0IGxpc3Rpbmcgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3RhcmdldCcpO1xuXHRcdGNvbnN0IGRiID0gc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShzZXNzaW9uKTtcblx0XHRhd2FpdCBkYi5vYmplY3Quc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya2luZ0RpcmVjdG9yeScsIFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0ZGIuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtzZGtTZXNzaW9uKCd0YXJnZXQnKV0pO1xuXHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblxuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCBhZ2VudC5nZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbik7XG5cdFx0XHRhc3NlcnQub2sobWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3aXRob3V0VW5kZWZpbmVkUHJvcGVydGllcyhtZXRhZGF0YSksIHtcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0c3RhcnRUaW1lOiAxMDAwLFxuXHRcdFx0XHRtb2RpZmllZFRpbWU6IDIwMDAsXG5cdFx0XHRcdHN1bW1hcnk6ICdTREsgdGFyZ2V0Jyxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKV0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2xpZW50LmdldFNlc3Npb25NZXRhZGF0YUNhbGxzLCBbJ3RhcmdldCddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnQubGlzdFNlc3Npb25DYWxsQ291bnQsIDApO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZ2V0U2Vzc2lvbk1ldGFkYXRhIG9ubHkgcmV0dXJucyBzZXNzaW9ucyB3aXRoIGEgZGF0YWJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2V4dGVybmFsJyk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtzZGtTZXNzaW9uKCdleHRlcm5hbCcsICcvd29ya3NwYWNlJyldKTtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBhZ2VudC5nZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbiksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsaWVudC5nZXRTZXNzaW9uTWV0YWRhdGFDYWxscywgW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaWVudC5saXN0U2Vzc2lvbkNhbGxDb3VudCwgMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25EYXRhU2VydmljZS5vcGVuZWRTZXNzaW9ucywgW10pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbGlzdFNlc3Npb25zIGRvZXMgbm90IGNyZWF0ZSBkYXRhYmFzZXMgZm9yIHVub3duZWQgU0RLIHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbc2RrU2Vzc2lvbignZXh0ZXJuYWwnLCAnL3dvcmtzcGFjZScpXSkgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGFnZW50Lmxpc3RTZXNzaW9ucygpLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25EYXRhU2VydmljZS5vcGVuZWRTZXNzaW9ucywgW10pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdH1cblx0fSk7XG5cblx0c3VpdGUoJ2NyZWF0ZVNlc3Npb24gYWN0aXZlQ2xpZW50IGVhZ2VyLWNsYWltJywgKCkgPT4ge1xuXG5cdFx0Y2xhc3MgU3B5aW5nUGx1Z2luTWFuYWdlciBleHRlbmRzIFRlc3RBZ2VudFBsdWdpbk1hbmFnZXIge1xuXHRcdFx0cHVibGljIHJlYWRvbmx5IGNhbGxzOiB7IGNsaWVudElkOiBzdHJpbmc7IGN1c3RvbWl6YXRpb25zOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10gfVtdID0gW107XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHN5bmNDdXN0b21pemF0aW9ucyhjbGllbnRJZDogc3RyaW5nLCBjdXN0b21pemF0aW9uczogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdLCBfcHJvZ3Jlc3M/OiAoc3RhdHVzOiBQbHVnaW5DdXN0b21pemF0aW9uKSA9PiB2b2lkKTogUHJvbWlzZTxJU3luY2VkQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0XHRcdHRoaXMuY2FsbHMucHVzaCh7IGNsaWVudElkLCBjdXN0b21pemF0aW9uczogWy4uLmN1c3RvbWl6YXRpb25zXSB9KTtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3QoJ2NyZWF0ZVNlc3Npb24gc2VlZHMgYWN0aXZlQ2xpZW50IHRvb2xzIGFuZCBzeW5jcyBjdXN0b21pemF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRjb25zdCBwbHVnaW5NYW5hZ2VyID0gbmV3IFNweWluZ1BsdWdpbk1hbmFnZXIoKTtcblx0XHRcdC8vIGBjcmVhdGVTZXNzaW9uYCBub3cgY3JlYXRlcyBhIHByb3Zpc2lvbmFsIHJlY29yZCB3aXRob3V0XG5cdFx0XHQvLyB0b3VjaGluZyB0aGUgU0RLOyBhY3RpdmVDbGllbnQgc2VlZGluZyBhbmQgcGx1Z2luIHN5bmMgaGFwcGVuXG5cdFx0XHQvLyBpbmxpbmUgYmVmb3JlIHRoZSBwcm92aXNpb25hbCByZWNvcmQgaXMgc3RvcmVkLlxuXHRcdFx0Y2xpZW50LmNyZWF0ZVNlc3Npb24gPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignU0RLIHNob3VsZCBub3QgYmUgdG91Y2hlZCBvbiBwcm92aXNpb25hbCBjcmVhdGUnKTsgfTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQsIHBsdWdpbk1hbmFnZXIgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblxuXHRcdFx0XHRjb25zdCBjdXN0b21pemF0aW9uczogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdID0gW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BsdWdpbi1hJyksIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWEnLCBuYW1lOiAnUGx1Z2luIEEnLCBlbmFibGVkOiB0cnVlIH1dO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3Rlc3Qtc2Vzc2lvbicpLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldLFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdFx0Y2xpZW50SWQ6ICdjbGllbnQtMScsXG5cdFx0XHRcdFx0XHR0b29sczogW3sgbmFtZTogJ3QxJywgZGVzY3JpcHRpb246ICdkJywgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcgfSB9XSxcblx0XHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJvdmlzaW9uYWwsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBsdWdpbk1hbmFnZXIuY2FsbHMsIFt7IGNsaWVudElkOiAnY2xpZW50LTEnLCBjdXN0b21pemF0aW9ucyB9XSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2Vzc2lvbiB3aXRob3V0IGFjdGl2ZUNsaWVudCBkb2VzIG5vdCBzeW5jIGN1c3RvbWl6YXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IHBsdWdpbk1hbmFnZXIgPSBuZXcgU3B5aW5nUGx1Z2luTWFuYWdlcigpO1xuXHRcdFx0Y2xpZW50LmNyZWF0ZVNlc3Npb24gPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignU0RLIHNob3VsZCBub3QgYmUgdG91Y2hlZCBvbiBwcm92aXNpb25hbCBjcmVhdGUnKTsgfTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQsIHBsdWdpbk1hbmFnZXIgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3Rlc3Qtc2Vzc2lvbi0yJyksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKV0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJvdmlzaW9uYWwsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBsdWdpbk1hbmFnZXIuY2FsbHMsIFtdKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm92aXNpb25hbCBzZXNzaW9uIGFuY2hvcnMgY3VzdG9taXphdGlvbiBkaXNjb3ZlcnkgdG8gdGhlIGFkZGl0aW9uYWwgcm9vdHMgKGdhdGVkKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgYWdlbnQsIHN0YXRlTWFuYWdlciB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0Y29uc3QgcmVwb0EgPSBVUkkuZmlsZSgnL3JlcG8tYScpO1xuXHRcdFx0XHRjb25zdCByZXBvQiA9IFVSSS5maWxlKCcvcmVwby1iJyk7XG5cblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbERpcnNBZnRlckNyZWF0ZSA9IGFzeW5jIChlbmFibGVkOiBib29sZWFuLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdKTogUHJvbWlzZTxzdHJpbmdbXT4gPT4ge1xuXHRcdFx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0Q29waWxvdE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXldOiBlbmFibGVkIH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y29uc3QgdXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsIGBtcnAtJHtlbmFibGVkfS0ke3dvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGh9YCk7XG5cdFx0XHRcdFx0YXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0XHRzZXNzaW9uOiB1cmksXG5cdFx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHRcdFx0XHRhY3RpdmVDbGllbnQ6IHsgY2xpZW50SWQ6ICdjbGllbnQtMScsIHRvb2xzOiBbXSwgY3VzdG9taXphdGlvbnM6IFtdIH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50cyA9IChhZ2VudCBhcyB1bmtub3duIGFzIHsgX2FjdGl2ZUNsaWVudHM6IHsgZ2V0KHU6IFVSSSk6IHsgcGx1Z2luQ29udHJvbGxlcjogeyBhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIH0gfSB8IHVuZGVmaW5lZCB9IH0pLl9hY3RpdmVDbGllbnRzO1xuXHRcdFx0XHRcdHJldHVybiAoYWN0aXZlQ2xpZW50cy5nZXQodXJpKT8ucGx1Z2luQ29udHJvbGxlci5hZGRpdGlvbmFsRGlyZWN0b3JpZXMgPz8gW10pLm1hcChkID0+IGQudG9TdHJpbmcoKSk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Ly8gQSBicmFuZC1uZXcgKHByZS1zZW5kKSBwcm92aXNpb25hbCBjaGF0IG11c3QgYW5jaG9yIGRpc2NvdmVyeSB0byBldmVyeVxuXHRcdFx0XHQvLyByb290IHdoZW4gbXVsdGktcm9vdCBpcyBvbiwgc28gaXRzIGN1c3RvbS1hZ2VudCBwaWNrZXIgc2hvd3MgdGhlIHVuaW9uLlxuXHRcdFx0XHRjb25zdCBtdWx0aVJvb3RPbiA9IGF3YWl0IGFkZGl0aW9uYWxEaXJzQWZ0ZXJDcmVhdGUodHJ1ZSwgW3JlcG9BLCByZXBvQl0pO1xuXHRcdFx0XHRjb25zdCBtdWx0aVJvb3RPZmYgPSBhd2FpdCBhZGRpdGlvbmFsRGlyc0FmdGVyQ3JlYXRlKGZhbHNlLCBbcmVwb0EsIHJlcG9CXSk7XG5cdFx0XHRcdGNvbnN0IHNpbmdsZVJvb3RPbiA9IGF3YWl0IGFkZGl0aW9uYWxEaXJzQWZ0ZXJDcmVhdGUodHJ1ZSwgW3JlcG9BXSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG11bHRpUm9vdE9uLCBtdWx0aVJvb3RPZmYsIHNpbmdsZVJvb3RPbiB9LCB7XG5cdFx0XHRcdFx0bXVsdGlSb290T246IFtyZXBvQi50b1N0cmluZygpXSxcblx0XHRcdFx0XHRtdWx0aVJvb3RPZmY6IFtdLFxuXHRcdFx0XHRcdHNpbmdsZVJvb3RPbjogW10sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nlc3Npb24gcGx1Z2luIGVuYWJsZW1lbnQgaXMgcHJvamVjdGVkIGZyb20gcmVkdWNlciBzdGF0ZSBwZXIgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNsYXNzIFBhc3N0aHJvdWdoUGx1Z2luTWFuYWdlciBleHRlbmRzIFRlc3RBZ2VudFBsdWdpbk1hbmFnZXIge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBzeW5jQ3VzdG9taXphdGlvbnMoX2NsaWVudElkOiBzdHJpbmcsIGN1c3RvbWl6YXRpb25zOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pOiBQcm9taXNlPElTeW5jZWRDdXN0b21pemF0aW9uW10+IHtcblx0XHRcdFx0XHRyZXR1cm4gY3VzdG9taXphdGlvbnMubWFwKGN1c3RvbWl6YXRpb24gPT4gKHsgY3VzdG9taXphdGlvbiB9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyBhZ2VudCwgc3RhdGVNYW5hZ2VyIH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IHBsdWdpbk1hbmFnZXI6IG5ldyBQYXNzdGhyb3VnaFBsdWdpbk1hbmFnZXIoKSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnZmlyc3QtZW5hYmxlLXN0YXRlJyk7XG5cdFx0XHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3NlY29uZC1lbmFibGUtc3RhdGUnKTtcblx0XHRcdFx0Y29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgW2ZpcnN0U2Vzc2lvbiwgc2Vjb25kU2Vzc2lvbl0pIHtcblx0XHRcdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0XHRcdGNyZWF0ZWRBdDogbm93LFxuXHRcdFx0XHRcdFx0bW9kaWZpZWRBdDogbm93LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcGx1Z2luOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uID0ge1xuXHRcdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0XHRpZDogJ2ZpbGU6Ly8vcGx1Z2luLWEnLFxuXHRcdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWEnLFxuXHRcdFx0XHRcdG5hbWU6ICdQbHVnaW4gQScsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fTtcblx0XHRcdFx0YWdlbnQuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoZmlyc3RTZXNzaW9uLCB7IGNsaWVudElkOiAnY2xpZW50LTEnIH0pLmN1c3RvbWl6YXRpb25zID0gW3BsdWdpbl07XG5cdFx0XHRcdGFnZW50LmdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHNlY29uZFNlc3Npb24sIHsgY2xpZW50SWQ6ICdjbGllbnQtMicgfSkuY3VzdG9taXphdGlvbnMgPSBbcGx1Z2luXTtcblxuXHRcdFx0XHRjb25zdCBbZmlyc3RJbml0aWFsLCBzZWNvbmRJbml0aWFsXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoZmlyc3RTZXNzaW9uKSxcblx0XHRcdFx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vjb25kU2Vzc2lvbiksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZmlyc3RTZXNzaW9uLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLCBjdXN0b21pemF0aW9uczogWy4uLmZpcnN0SW5pdGlhbF0gfSk7XG5cdFx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZWNvbmRTZXNzaW9uLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLCBjdXN0b21pemF0aW9uczogWy4uLnNlY29uZEluaXRpYWxdIH0pO1xuXHRcdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZmlyc3RTZXNzaW9uLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblRvZ2dsZWQsIGlkOiBwbHVnaW4uaWQsIGVuYWJsZWQ6IGZhbHNlIH0pO1xuXG5cdFx0XHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoZmlyc3RTZXNzaW9uKSxcblx0XHRcdFx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vjb25kU2Vzc2lvbiksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRmaXJzdDogZmlyc3QuZmluZChjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24uaWQgPT09IHBsdWdpbi5pZCk/LmVuYWJsZWQsXG5cdFx0XHRcdFx0c2Vjb25kOiBzZWNvbmQuZmluZChjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24uaWQgPT09IHBsdWdpbi5pZCk/LmVuYWJsZWQsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRmaXJzdDogZmFsc2UsXG5cdFx0XHRcdFx0c2Vjb25kOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRDbGllbnRDdXN0b21pemF0aW9ucyBwdWJsaXNoZXMgcGFyc2VkIGFnZW50cyBpbiBTZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblxuXHRcdFx0Y29uc3QgcGx1Z2luRGlyID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvcGx1Z2luLWEnIH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5qb2luUGF0aChwbHVnaW5EaXIsICdhZ2VudHMnKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoXG5cdFx0XHRcdFVSSS5qb2luUGF0aChwbHVnaW5EaXIsICdhZ2VudHMnLCAnaGVscGVyLm1kJyksXG5cdFx0XHRcdFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbm5hbWU6IGhlbHBlci1hZ2VudFxcbmRlc2NyaXB0aW9uOiBoZWxwcyBvdXRcXG4tLS1cXG5ib2R5JyksXG5cdFx0XHQpO1xuXG5cdFx0XHRjbGFzcyBQbHVnaW5EaXJTcHlNYW5hZ2VyIGV4dGVuZHMgVGVzdEFnZW50UGx1Z2luTWFuYWdlciB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHN5bmNDdXN0b21pemF0aW9ucyhfY2xpZW50SWQ6IHN0cmluZywgY3VzdG9taXphdGlvbnM6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSk6IFByb21pc2U8SVN5bmNlZEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdFx0XHRcdHJldHVybiBjdXN0b21pemF0aW9ucy5tYXAoYyA9PiAoe1xuXHRcdFx0XHRcdFx0Y3VzdG9taXphdGlvbjogeyAuLi5jLCBsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9IH0sXG5cdFx0XHRcdFx0XHRwbHVnaW5EaXIsXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRjb25zdCBwbHVnaW5NYW5hZ2VyID0gbmV3IFBsdWdpbkRpclNweU1hbmFnZXIoKTtcblx0XHRcdGNvbnN0IHsgYWdlbnQgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQsIHBsdWdpbk1hbmFnZXIsIGZpbGVTZXJ2aWNlIH0pO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZFNlc3Npb25Qcm9ncmVzcyhzID0+IHtcblx0XHRcdFx0aWYgKHMua2luZCA9PT0gJ2FjdGlvbicpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2gocy5hY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3N5bmMtY3VzdG9taXphdGlvbnMtdGVzdCcpO1xuXHRcdFx0XHRhZ2VudC5nZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChzZXNzaW9uLCB7IGNsaWVudElkOiAnY2xpZW50LTEnIH0pLmN1c3RvbWl6YXRpb25zID0gW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKHBsdWdpbkRpci50b1N0cmluZygpKSwgdXJpOiBwbHVnaW5EaXIudG9TdHJpbmcoKSwgbmFtZTogJ1BsdWdpbiBBJywgZW5hYmxlZDogdHJ1ZSB9XTtcblxuXHRcdFx0XHQvLyBXYWl0IGZvciB0aGUgZGVmZXJyZWQgcmVzb2x1dGlvbiBjaGFpbiBpbiBQbHVnaW5Db250cm9sbGVyLnN5bmMuXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA1MCkpO1xuXG5cdFx0XHRcdGNvbnN0IHVwZGF0ZXNXaXRoQ2hpbGRyZW4gPSBhY3Rpb25zXG5cdFx0XHRcdFx0LmZpbHRlcihhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQpXG5cdFx0XHRcdFx0LmZpbHRlcigoYSk6IGEgaXMgRXh0cmFjdDxTZXNzaW9uQWN0aW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkIH0+ID0+IHRydWUpXG5cdFx0XHRcdFx0LmZpbHRlcihhID0+IChhLmN1c3RvbWl6YXRpb24gYXMgUGx1Z2luQ3VzdG9taXphdGlvbikuY2hpbGRyZW4gIT09IHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwZGF0ZXNXaXRoQ2hpbGRyZW4ubGVuZ3RoID4gMCwgdHJ1ZSwgJ2V4cGVjdGVkIFNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCB0byBjYXJyeSBwYXJzZWQgY2hpbGRyZW4nKTtcblx0XHRcdFx0Y29uc3QgYWdlbnRDaGlsZHJlbiA9ICh1cGRhdGVzV2l0aENoaWxkcmVuLmF0KC0xKSEuY3VzdG9taXphdGlvbiBhcyBQbHVnaW5DdXN0b21pemF0aW9uKS5jaGlsZHJlbiEuZmlsdGVyKGMgPT4gYy50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRDaGlsZHJlbiwgW3tcblx0XHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCxcblx0XHRcdFx0XHRpZDogY3VzdG9taXphdGlvbklkKFVSSS5qb2luUGF0aChwbHVnaW5EaXIsICdhZ2VudHMnLCAnaGVscGVyLm1kJykudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocGx1Z2luRGlyLCAnYWdlbnRzJywgJ2hlbHBlci5tZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ2hlbHBlci1hZ2VudCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdoZWxwcyBvdXQnLFxuXHRcdFx0XHR9XSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zIHB1Ymxpc2hlcyBkaXNjb3ZlcmVkIGZpbGVzIGFzIERpcmVjdG9yeSBjdXN0b21pemF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0XHRjb25zdCBhZ2VudENvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogaGVscGVyJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBoZWxwcyBvdXQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2FnZW50IGJvZHknLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGluc3RydWN0aW9uQ29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBuZXN0ZWQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IG5lc3RlZCBpbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHQnYXBwbHlUbzogKi50cywgKi5qcycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnaW5zdHJ1Y3Rpb24gYm9keScsXG5cdFx0XHRdO1xuXG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZScgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnYWdlbnRzJykpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2luc3RydWN0aW9ucycsICd0ZWFtJykpO1xuXHRcdFx0Y29uc3QgYWdlbnRGaWxlID0gVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnYWdlbnRzJywgJ2hlbHBlci5hZ2VudC5tZCcpO1xuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25GaWxlID0gVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnaW5zdHJ1Y3Rpb25zJywgJ3RlYW0nLCAnbmVzdGVkLmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGFnZW50RmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhhZ2VudENvbnRlbnQuam9pbignXFxuJykpKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShpbnN0cnVjdGlvbkZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoaW5zdHJ1Y3Rpb25Db250ZW50LmpvaW4oJ1xcbicpKSk7XG5cdFx0XHRjb25zdCBhZ2VudHNNZEZpbGUgPSBVUkkuam9pblBhdGgod29ya3NwYWNlLCAnQUdFTlRTLm1kJyk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRzTWRGaWxlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhZ2VudHMgbWQgYm9keScpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IHsgYWdlbnQgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQsIGZpbGVTZXJ2aWNlIH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZXNzaW9uLWRpc2NvdmVyeS1kaXJlY3RvcmllcycpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3dvcmtzcGFjZV0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYXdhaXQgYWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb24pO1xuXHRcdFx0XHRjb25zdCBkaXNjb3ZlcmVkRGlyZWN0b3JpZXMgPSBjdXN0b21pemF0aW9ucy5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSk7XG5cblx0XHRcdFx0Ly8gQWxsIGRpc2NvdmVyeSByb290cyBhcmUgcmV0dXJuZWQsIGV2ZW4gaWYgZW1wdHkgb3Igbm9uLWV4aXN0aW5nXG5cdFx0XHRcdC8vIFdvcmtzcGFjZSByb290IGlzIGluY2x1ZGVkIGJlY2F1c2UgQUdFTlRTLm1kIHdhcyBjcmVhdGVkXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjb3ZlcmVkRGlyZWN0b3JpZXMubGVuZ3RoLCAxMyk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkVXJpcyA9IFtcblx0XHRcdFx0XHQvLyB3b3Jrc3BhY2Ugcm9vdHNcblx0XHRcdFx0XHR3b3Jrc3BhY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdhZ2VudHMnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuY2xhdWRlJywgJ2FnZW50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnc2tpbGxzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmFnZW50cycsICdza2lsbHMnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuY2xhdWRlJywgJ3NraWxscycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnaW5zdHJ1Y3Rpb25zJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdob29rcycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Ly8gdXNlciBob21lIHJvb3RzXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvbW9jay1ob21lLy5jb3BpbG90L2FnZW50cycgfSkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9tb2NrLWhvbWUvLmFnZW50cy9za2lsbHMnIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvbW9jay1ob21lLy5jb3BpbG90L3NraWxscycgfSkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9tb2NrLWhvbWUvLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zJyB9KS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL21vY2staG9tZS8uY29waWxvdC9ob29rcycgfSkudG9TdHJpbmcoKSxcblx0XHRcdFx0XTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXNjb3ZlcmVkRGlyZWN0b3JpZXMubWFwKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi51cmkpLnNvcnQoKSwgZXhwZWN0ZWRVcmlzLnNvcnQoKSk7XG5cblx0XHRcdFx0Y29uc3QgYWdlbnREaXJlY3RvcnkgPSBkaXNjb3ZlcmVkRGlyZWN0b3JpZXMuZmluZChjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24udXJpID09PSBVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdhZ2VudHMnKS50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFnZW50RGlyZWN0b3J5KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50RGlyZWN0b3J5LmNvbnRlbnRzLCBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnREaXJlY3RvcnkuY2hpbGRyZW4sIFt7XG5cdFx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsXG5cdFx0XHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZChhZ2VudEZpbGUudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0dXJpOiBhZ2VudEZpbGUudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnaGVscGVyJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2hlbHBzIG91dCcsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRjb25zdCBpbnN0cnVjdGlvbkRpcmVjdG9yeSA9IGRpc2NvdmVyZWREaXJlY3Rvcmllcy5maW5kKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi51cmkgPT09IFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2luc3RydWN0aW9ucycpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQub2soaW5zdHJ1Y3Rpb25EaXJlY3RvcnkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdHJ1Y3Rpb25EaXJlY3RvcnkuY29udGVudHMsIEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGluc3RydWN0aW9uRGlyZWN0b3J5LmNoaWxkcmVuLCBbe1xuXHRcdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUsXG5cdFx0XHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZChpbnN0cnVjdGlvbkZpbGUudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0dXJpOiBpbnN0cnVjdGlvbkZpbGUudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiAnbmVzdGVkJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ25lc3RlZCBpbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHRcdGdsb2JzOiBbJyoudHMnLCAnKi5qcyddLFxuXHRcdFx0XHRcdGFsd2F5c0FwcGx5OiB1bmRlZmluZWQsXG5cdFx0XHRcdH1dKTtcblxuXHRcdFx0XHRjb25zdCBhZ2VudEluc3RydWN0aW9uc0RpcmVjdG9yeSA9IGRpc2NvdmVyZWREaXJlY3Rvcmllcy5maW5kKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi51cmkgPT09IHdvcmtzcGFjZS50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFnZW50SW5zdHJ1Y3Rpb25zRGlyZWN0b3J5KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SW5zdHJ1Y3Rpb25zRGlyZWN0b3J5LmNvbnRlbnRzLCBDdXN0b21pemF0aW9uVHlwZS5SdWxlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEluc3RydWN0aW9uc0RpcmVjdG9yeS5jaGlsZHJlbiwgW3tcblx0XHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5SdWxlLFxuXHRcdFx0XHRcdGlkOiBjdXN0b21pemF0aW9uSWQoYWdlbnRzTWRGaWxlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdHVyaTogYWdlbnRzTWRGaWxlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ0FHRU5UUy5tZCcsXG5cdFx0XHRcdFx0YWx3YXlzQXBwbHk6IHRydWUsXG5cdFx0XHRcdH0gc2F0aXNmaWVzIFJ1bGVDdXN0b21pemF0aW9uXSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zIHN0YXJ0cyBpbml0aWFsIGRpc2NvdmVyeSB3aXRob3V0IGRlYm91bmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2xhc3MgU3RhdFRyYWNraW5nRmlsZVN5c3RlbVByb3ZpZGVyIGV4dGVuZHMgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRcdFx0XHR0cmFja1N0YXRzID0gZmFsc2U7XG5cdFx0XHRcdHN0YXRDYWxscyA9IDA7XG5cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJU3RhdD4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLnRyYWNrU3RhdHMpIHtcblx0XHRcdFx0XHRcdHRoaXMuc3RhdENhbGxzKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBzdXBlci5zdGF0KHJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdGF0VHJhY2tpbmdGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBwcm92aWRlcikpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlJyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcih3b3Jrc3BhY2UpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10pO1xuXHRcdFx0Y29uc3QgeyBhZ2VudCB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IGNsaWVudCwgZmlsZVNlcnZpY2UgfSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZXNzaW9uLWRpc2NvdmVyeS1pbW1lZGlhdGUnKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcmllczogW3dvcmtzcGFjZV0gfSk7XG5cblx0XHRcdFx0cHJvdmlkZXIudHJhY2tTdGF0cyA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb24pO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KFJFRlJFU0hfREVCT1VOQ0VfTVMgKyAyMDApO1xuXG5cdFx0XHRcdGFzc2VydC5ub3RFcXVhbChwcm92aWRlci5zdGF0Q2FsbHMsIDAsICdleHBlY3RlZCBkaXNjb3ZlcnkgdG8gc3RhcnQgYmVmb3JlIHRoZSBkZWJvdW5jZSBpbnRlcnZhbCcpO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGN1c3RvbWl6YXRpb25zO1xuXHRcdFx0XHRhc3NlcnQub2socmVzb2x2ZWQubGVuZ3RoID4gMCwgJ2V4cGVjdGVkIGRpc2NvdmVyeSB0byByZXNvbHZlIHdpdGggc29tZSBjdXN0b21pemF0aW9ucycpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFNlc3Npb25DdXN0b21pemF0aW9ucyBjbGVhcnMgZGlzY292ZXJlZCBmaWxlcyB3aGVuIHRoZSByb290IGRpc2FwcGVhcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlJyB9KTtcblx0XHRcdGNvbnN0IGFnZW50c1Jvb3QgPSBVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdhZ2VudHMnKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihhZ2VudHNSb290KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoYWdlbnRzUm9vdCwgJ2hlbHBlci5hZ2VudC5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhZ2VudCBib2R5JykpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10pO1xuXHRcdFx0Y29uc3QgeyBhZ2VudCB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IGNsaWVudCwgZmlsZVNlcnZpY2UgfSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3Nlc3Npb24tZGlzY292ZXJ5LWNsZWFyZWQnKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFt3b3Jrc3BhY2VdLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvbik7XG5cdFx0XHRcdGNvbnN0IGJlZm9yZURpcnMgPSBiZWZvcmUuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3RvcnkpO1xuXHRcdFx0XHRjb25zdCBhZ2VudHNEaXJCZWZvcmUgPSBiZWZvcmVEaXJzLmZpbmQoZCA9PiBkLnVyaSA9PT0gYWdlbnRzUm9vdC50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFnZW50c0RpckJlZm9yZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudHNEaXJCZWZvcmUhLmNoaWxkcmVuIS5sZW5ndGgsIDEpOyAvLyBoYXMgdGhlIGhlbHBlciBhZ2VudCBmaWxlXG5cblx0XHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuZGVsKGFnZW50c1Jvb3QsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG5cdFx0XHRcdGxldCBhZnRlciA9IGF3YWl0IGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uKTtcblx0XHRcdFx0bGV0IGFmdGVyRGlycyA9IGFmdGVyLmZpbHRlcihjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuRGlyZWN0b3J5KTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyMCAmJiBhZnRlckRpcnMuc29tZShkID0+IGQudXJpID09PSBhZ2VudHNSb290LnRvU3RyaW5nKCkgJiYgKGQuY2hpbGRyZW4/Lmxlbmd0aCA/PyAwKSA+IDApOyBpKyspIHtcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNTApKTtcblx0XHRcdFx0XHRhZnRlciA9IGF3YWl0IGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uKTtcblx0XHRcdFx0XHRhZnRlckRpcnMgPSBhZnRlci5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gYWdlbnRzUm9vdCBzdGlsbCBhcHBlYXJzIGluIGRpc2NvdmVyeSAoYXMgYW4gZW1wdHkgZGlyZWN0b3J5KSBzaW5jZSBpdCdzIGEgZGlzY292ZXJ5IHJvb3Rcblx0XHRcdFx0Y29uc3QgYWdlbnRzRGlyQWZ0ZXIgPSBhZnRlckRpcnMuZmluZChkID0+IGQudXJpID09PSBhZ2VudHNSb290LnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQub2soYWdlbnRzRGlyQWZ0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRzRGlyQWZ0ZXIuY2hpbGRyZW4/Lmxlbmd0aCA/PyAwLCAwKTsgLy8gZmlsZXMgYXJlIGNsZWFyZWRcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgZG9lcyBub3QgcmVwdWJsaXNoIGRpc2NvdmVyZWQgZGlyZWN0b3JpZXMgd2hlbiB3YXRjaGVyIGNoYW5nZXMgYXJlIGRpc2NvdmVyeS1uZXV0cmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZScgfSk7XG5cdFx0XHRjb25zdCBhZ2VudHNSb290ID0gVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnYWdlbnRzJyk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoYWdlbnRzUm9vdCk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKGFnZW50c1Jvb3QsICdoZWxwZXIuYWdlbnQubWQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWdlbnQgYm9keScpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IHsgYWdlbnQgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQsIGZpbGVTZXJ2aWNlIH0pO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZFNlc3Npb25Qcm9ncmVzcyhwcm9ncmVzcyA9PiB7XG5cdFx0XHRcdGlmIChwcm9ncmVzcy5raW5kID09PSAnYWN0aW9uJykge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaChwcm9ncmVzcy5hY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGNvdW50RGlyZWN0b3J5UHVibGlzaGVzRm9yQWdlbnRzUm9vdCA9ICgpOiBudW1iZXIgPT4gYWN0aW9ucy5maWx0ZXIoYWN0aW9uID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCkge1xuXHRcdFx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb24gPSAoYWN0aW9uIGFzIEV4dHJhY3Q8U2Vzc2lvbkFjdGlvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCB9PikuY3VzdG9taXphdGlvbjtcblx0XHRcdFx0XHRyZXR1cm4gY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3RvcnkgJiYgY3VzdG9taXphdGlvbi51cmkgPT09IGFnZW50c1Jvb3QudG9TdHJpbmcoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCkge1xuXHRcdFx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gKGFjdGlvbiBhcyBFeHRyYWN0PFNlc3Npb25BY3Rpb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkIH0+KS5jdXN0b21pemF0aW9ucztcblx0XHRcdFx0XHRyZXR1cm4gY3VzdG9taXphdGlvbnMuc29tZShjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuRGlyZWN0b3J5ICYmIGN1c3RvbWl6YXRpb24udXJpID09PSBhZ2VudHNSb290LnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0pLmxlbmd0aDtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnc2Vzc2lvbi1kaXNjb3ZlcnktbmV1dHJhbC13YXRjaGVyLWNoYW5nZScpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3dvcmtzcGFjZV0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uKTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwKSk7XG5cdFx0XHRcdGNvbnN0IHB1Ymxpc2hDb3VudEJlZm9yZSA9IGNvdW50RGlyZWN0b3J5UHVibGlzaGVzRm9yQWdlbnRzUm9vdCgpO1xuXG5cdFx0XHRcdC8vIFJFQURNRS5tZCBpcyBpbnRlbnRpb25hbGx5IGV4Y2x1ZGVkIGZyb20gZGlzY292ZXJlZCBhZ2VudHMuXG5cdFx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoYWdlbnRzUm9vdCwgJ1JFQURNRS5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdpZ25vcmVkJykpO1xuXG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjA7IGkrKykge1xuXHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCkpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudERpcmVjdG9yeVB1Ymxpc2hlc0ZvckFnZW50c1Jvb3QoKSwgcHVibGlzaENvdW50QmVmb3JlLCAnZXhwZWN0ZWQgbm8gcmVwdWJsaXNoIHdoZW4gZGlzY292ZXJ5IG91dHB1dCBpcyB1bmNoYW5nZWQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFmdGVyID0gYXdhaXQgYWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb24pO1xuXHRcdFx0XHRjb25zdCBhZnRlckRpcnMgPSBhZnRlci5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSk7XG5cdFx0XHRcdC8vIEFsbCBkaXNjb3Zlcnkgcm9vdHMgYXJlIGRpc2NvdmVyZWQgKHdvcmtzcGFjZSByb290IG9ubHkgaWYgaXQgaGFzIEFHRU5UUy5tZClcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRVcmlzID0gW1xuXHRcdFx0XHRcdFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2FnZW50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5jbGF1ZGUnLCAnYWdlbnRzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdza2lsbHMnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuYWdlbnRzJywgJ3NraWxscycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5jbGF1ZGUnLCAnc2tpbGxzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdpbnN0cnVjdGlvbnMnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2hvb2tzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHQvLyB1c2VyIGhvbWUgcm9vdHNcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9tb2NrLWhvbWUvLmNvcGlsb3QvYWdlbnRzJyB9KS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL21vY2staG9tZS8uYWdlbnRzL3NraWxscycgfSkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9tb2NrLWhvbWUvLmNvcGlsb3Qvc2tpbGxzJyB9KS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL21vY2staG9tZS8uY29waWxvdC9pbnN0cnVjdGlvbnMnIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvbW9jay1ob21lLy5jb3BpbG90L2hvb2tzJyB9KS50b1N0cmluZygpLFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFmdGVyRGlycy5tYXAoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnVyaSkuc29ydCgpLCBleHBlY3RlZFVyaXMuc29ydCgpKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgY29hbGVzY2VzIGJ1cnN0IHdhdGNoZXIgY2hhbmdlcyBpbnRvIG9uZSBkaXNjb3ZlcmVkIHJlZnJlc2ggcHVibGlzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UnIH0pO1xuXHRcdFx0Y29uc3QgYWdlbnRzUm9vdCA9IFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2FnZW50cycpO1xuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zUm9vdCA9IFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2luc3RydWN0aW9ucycpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGFnZW50c1Jvb3QpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKGluc3RydWN0aW9uc1Jvb3QpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5qb2luUGF0aChhZ2VudHNSb290LCAnaGVscGVyLTAuYWdlbnQubWQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWdlbnQgMCcpKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoaW5zdHJ1Y3Rpb25zUm9vdCwgJ2Jhc2UuaW5zdHJ1Y3Rpb25zLm1kJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbmFwcGx5VG86XFxuICAtIHNyYy8qKlxcbi0tLVxcbmJhc2UgaW5zdHJ1Y3Rpb24nKSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRjb25zdCB7IGFnZW50IH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogY2xpZW50LCBmaWxlU2VydmljZSB9KTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uczogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWdlbnQub25EaWRTZXNzaW9uUHJvZ3Jlc3MocHJvZ3Jlc3MgPT4ge1xuXHRcdFx0XHRpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ2FjdGlvbicpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2gocHJvZ3Jlc3MuYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0eXBlIERpc2NvdmVyZWREaXJlY3RvcnlDdXN0b21pemF0aW9uID0gUGx1Z2luQ3VzdG9taXphdGlvbiAmIHsgY2hpbGRyZW46IE5vbk51bGxhYmxlPFBsdWdpbkN1c3RvbWl6YXRpb25bJ2NoaWxkcmVuJ10+IH07XG5cblx0XHRcdGNvbnN0IGNvdW50RGlzY292ZXJlZFJlZnJlc2hQdWJsaXNoZXMgPSAoKTogbnVtYmVyID0+IGFjdGlvbnMuZmlsdGVyKGFjdGlvbiA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gKGFjdGlvbiBhcyBFeHRyYWN0PFNlc3Npb25BY3Rpb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkIH0+KS5jdXN0b21pemF0aW9ucztcblx0XHRcdFx0cmV0dXJuIGN1c3RvbWl6YXRpb25zLnNvbWUoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSAmJiBjdXN0b21pemF0aW9uLnVyaSA9PT0gYWdlbnRzUm9vdC50b1N0cmluZygpKVxuXHRcdFx0XHRcdCYmIGN1c3RvbWl6YXRpb25zLnNvbWUoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSAmJiBjdXN0b21pemF0aW9uLnVyaSA9PT0gaW5zdHJ1Y3Rpb25zUm9vdC50b1N0cmluZygpKTtcblx0XHRcdH0pLmxlbmd0aDtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnc2Vzc2lvbi1kaXNjb3ZlcnktYnVyc3Qtd2F0Y2hlci1jaGFuZ2UnKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFt3b3Jrc3BhY2VdLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhd2FpdCBhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoc2Vzc2lvbik7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCkpO1xuXHRcdFx0XHRjb25zdCBwdWJsaXNoQ291bnRCZWZvcmVCdXJzdCA9IGNvdW50RGlzY292ZXJlZFJlZnJlc2hQdWJsaXNoZXMoKTtcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5qb2luUGF0aChhZ2VudHNSb290LCAnaGVscGVyLTEuYWdlbnQubWQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWdlbnQgMScpKSxcblx0XHRcdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKGFnZW50c1Jvb3QsICdoZWxwZXItMi5hZ2VudC5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhZ2VudCAyJykpLFxuXHRcdFx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgoaW5zdHJ1Y3Rpb25zUm9vdCwgJ2V4dHJhLmluc3RydWN0aW9ucy5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCctLS1cXG5hcHBseVRvOlxcbiAgLSB0ZXN0LyoqXFxuLS0tXFxuZXh0cmEgaW5zdHJ1Y3Rpb24nKSksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGxldCBkaXNjb3ZlcmVkQWdlbnRDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBkaXNjb3ZlcmVkSW5zdHJ1Y3Rpb25Db3VudCA9IDA7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjAgJiYgKGRpc2NvdmVyZWRBZ2VudENvdW50IDwgMyB8fCBkaXNjb3ZlcmVkSW5zdHJ1Y3Rpb25Db3VudCA8IDIpOyBpKyspIHtcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNTApKTtcblx0XHRcdFx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uKTtcblx0XHRcdFx0XHRjb25zdCBkaXNjb3ZlcmVkQWdlbnREaXJlY3RvcnkgPSBjdXN0b21pemF0aW9ucy5maW5kKChjdXN0b21pemF0aW9uKTogY3VzdG9taXphdGlvbiBpcyBEaXNjb3ZlcmVkRGlyZWN0b3J5Q3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSAmJiBjdXN0b21pemF0aW9uLnVyaSA9PT0gYWdlbnRzUm9vdC50b1N0cmluZygpKTtcblx0XHRcdFx0XHRjb25zdCBkaXNjb3ZlcmVkSW5zdHJ1Y3Rpb25EaXJlY3RvcnkgPSBjdXN0b21pemF0aW9ucy5maW5kKChjdXN0b21pemF0aW9uKTogY3VzdG9taXphdGlvbiBpcyBEaXNjb3ZlcmVkRGlyZWN0b3J5Q3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSAmJiBjdXN0b21pemF0aW9uLnVyaSA9PT0gaW5zdHJ1Y3Rpb25zUm9vdC50b1N0cmluZygpKTtcblx0XHRcdFx0XHRkaXNjb3ZlcmVkQWdlbnRDb3VudCA9IGRpc2NvdmVyZWRBZ2VudERpcmVjdG9yeT8uY2hpbGRyZW4uZmlsdGVyKGNoaWxkID0+IGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50KS5sZW5ndGggPz8gMDtcblx0XHRcdFx0XHRkaXNjb3ZlcmVkSW5zdHJ1Y3Rpb25Db3VudCA9IGRpc2NvdmVyZWRJbnN0cnVjdGlvbkRpcmVjdG9yeT8uY2hpbGRyZW4uZmlsdGVyKGNoaWxkID0+IGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUpLmxlbmd0aCA/PyAwO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2NvdmVyZWRBZ2VudENvdW50LCAzLCAnZXhwZWN0ZWQgYWdlbnQgYnVyc3QgY2hhbmdlcyB0byBiZSBkaXNjb3ZlcmVkJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjb3ZlcmVkSW5zdHJ1Y3Rpb25Db3VudCwgMiwgJ2V4cGVjdGVkIGluc3RydWN0aW9uIGJ1cnN0IGNoYW5nZXMgdG8gYmUgZGlzY292ZXJlZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Y291bnREaXNjb3ZlcmVkUmVmcmVzaFB1Ymxpc2hlcygpLFxuXHRcdFx0XHRcdHB1Ymxpc2hDb3VudEJlZm9yZUJ1cnN0ICsgMSxcblx0XHRcdFx0XHQnZXhwZWN0ZWQgYnVyc3Qgd2F0Y2hlciBjaGFuZ2VzIGFjcm9zcyBmb2xkZXJzIHRvIHJlc3VsdCBpbiBleGFjdGx5IG9uZSBkaXNjb3ZlcmVkIHJlZnJlc2ggcHVibGlzaCAoX29uRGlkUmVmcmVzaCknXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJvdmlzaW9uYWwgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjcmVhdGVTZXNzaW9uIGRvZXMgbm90IGNhbGwgY2xpZW50LmNyZWF0ZVNlc3Npb24gb3IgY3JlYXRlIHdvcmt0cmVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RBZ2VudEhvc3RHaXRTZXJ2aWNlKCk7XG5cdFx0XHRsZXQgY2xpZW50Q3JlYXRlQ2FsbHMgPSAwO1xuXHRcdFx0bGV0IHdvcmt0cmVlQ2FsbHMgPSAwO1xuXHRcdFx0Y2xpZW50LmNyZWF0ZVNlc3Npb24gPSBhc3luYyAoKSA9PiB7IGNsaWVudENyZWF0ZUNhbGxzKys7IHRocm93IG5ldyBFcnJvcignU0RLIG5vdCBleHBlY3RlZCcpOyB9O1xuXHRcdFx0Y29uc3Qgb3JpZ0FkZFdvcmt0cmVlID0gZ2l0U2VydmljZS5hZGRXb3JrdHJlZS5iaW5kKGdpdFNlcnZpY2UpO1xuXHRcdFx0Z2l0U2VydmljZS5hZGRXb3JrdHJlZSA9IGFzeW5jICguLi5hcmdzKSA9PiB7IHdvcmt0cmVlQ2FsbHMrKzsgcmV0dXJuIG9yaWdBZGRXb3JrdHJlZSguLi5hcmdzKTsgfTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQsIGdpdFNlcnZpY2UgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3Byb3YtMScpLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldLFxuXHRcdFx0XHRcdGNvbmZpZzogeyBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJvdmlzaW9uYWwsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpZW50Q3JlYXRlQ2FsbHMsIDAsICdjbGllbnQuY3JlYXRlU2Vzc2lvbiBzaG91bGQgbm90IGJlIGNhbGxlZCBmb3IgcHJvdmlzaW9uYWwgc2Vzc2lvbnMnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmt0cmVlQ2FsbHMsIDAsICdubyB3b3JrdHJlZSBzaG91bGQgYmUgY3JlYXRlZCBmb3IgcHJvdmlzaW9uYWwgc2Vzc2lvbnMnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZW5kTWVzc2FnZSBvbiB0aGUgZGVmYXVsdCBjaGF0IG1hdGVyaWFsaXplcyB0aGUgcGFyZW50IHByb3Zpc2lvbmFsIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10pO1xuXHRcdFx0bGV0IGNhcHR1cmVkQ29uZmlnOiBDb3BpbG90Q3JlYXRlU2Vzc2lvbk9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0XHRjbGllbnQuY3JlYXRlU2Vzc2lvbiA9IGFzeW5jIGNvbmZpZyA9PiB7XG5cdFx0XHRcdGNhcHR1cmVkQ29uZmlnID0gY29uZmlnO1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1vY2tDb3BpbG90U2Vzc2lvbigpIGFzIHVua25vd24gYXMgQ29waWxvdFNlc3Npb247XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0c2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdwcm92LWRlZmF1bHQtY2hhdCcpLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShkZWZhdWx0Q2hhdFVyaShyZXN1bHQuc2Vzc2lvbiksICdoZWxsbycsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkQ29uZmlnPy5zZXNzaW9uSWQsICdwcm92LWRlZmF1bHQtY2hhdCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2VTZXNzaW9uIG9uIHByb3Zpc2lvbmFsIHNlc3Npb24gZG9lcyBub3QgdG91Y2ggU0RLIG9yIHdvcmt0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEFnZW50SG9zdEdpdFNlcnZpY2UoKTtcblx0XHRcdGxldCByZW1vdmVXb3JrdHJlZUNhbGxzID0gMDtcblx0XHRcdGNvbnN0IG9yaWdSZW1vdmVXb3JrdHJlZSA9IGdpdFNlcnZpY2UucmVtb3ZlV29ya3RyZWUuYmluZChnaXRTZXJ2aWNlKTtcblx0XHRcdGdpdFNlcnZpY2UucmVtb3ZlV29ya3RyZWUgPSBhc3luYyAoLi4uYXJncykgPT4geyByZW1vdmVXb3JrdHJlZUNhbGxzKys7IHJldHVybiBvcmlnUmVtb3ZlV29ya3RyZWUoLi4uYXJncyk7IH07XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogY2xpZW50LCBnaXRTZXJ2aWNlIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0c2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdwcm92LTInKSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXdhaXQgYWdlbnQuZGlzcG9zZVNlc3Npb24ocmVzdWx0LnNlc3Npb24pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmVXb3JrdHJlZUNhbGxzLCAwLCAnbm8gd29ya3RyZWUgdG8gcmVtb3ZlIGZvciBwcm92aXNpb25hbCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuaGFzU2Vzc2lvbihyZXN1bHQuc2Vzc2lvbiksIGZhbHNlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlU2Vzc2lvbiByZW1vdmVzIHRoZSBzZXNzaW9uIGZyb20gdGhlIFNESyBvbi1kaXNrIHN0b3JlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncGVyc2lzdGVkLXNlc3Npb24tMScpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5kaXNwb3NlU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsaWVudC5kZWxldGVkU2Vzc2lvbklkcywgWydwZXJzaXN0ZWQtc2Vzc2lvbi0xJ10pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2VTZXNzaW9uIG9uIHByb3Zpc2lvbmFsIHNlc3Npb24gZG9lcyBub3QgY2FsbCBjbGllbnQuZGVsZXRlU2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRcdHNlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncHJvdi0zJyksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKV0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LmRpc3Bvc2VTZXNzaW9uKHJlc3VsdC5zZXNzaW9uKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsaWVudC5kZWxldGVkU2Vzc2lvbklkcywgW10pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuaGFzU2Vzc2lvbihyZXN1bHQuc2Vzc2lvbiksIGZhbHNlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlU2Vzc2lvbiBwcm9wYWdhdGVzIFNESyBkZWxldGUgZXJyb3JzIGFuZCBwcmVzZXJ2ZXMgaW4tbWVtb3J5IHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNsaWVudC5kZWxldGVTZXNzaW9uID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTsgfTtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncGVyc2lzdGVkLXNlc3Npb24tMicpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBhZ2VudC5kaXNwb3NlU2Vzc2lvbihzZXNzaW9uKSwgL2Jvb20vKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBGb3JraW5nIGEgcHJvdmlzaW9uYWwgc2Vzc2lvbiBpcyBubyBsb25nZXIgYSBzcGVjaWFsIGNhc2U6IHRoZSBhZ2VudFxuXHRcdC8vIHNlcnZpY2UgZHJvcHMgYGNvbmZpZy5mb3JrYCBmb3Igc291cmNlcyB3aXRoIG5vIHR1cm5zLCBzbyB0aGUgY2FsbFxuXHRcdC8vIHJlZHVjZXMgdG8gYSBwbGFpbiBuZXctc2Vzc2lvbiBjcmVhdGUuXG5cblx0XHR0ZXN0KCdtYXRlcmlhbGl6YXRpb24gcGFzc2VzIFZTIENvZGUtc3BlY2lmaWMgc3lzdGVtIG1lc3NhZ2UgdG8gdGhlIFNESycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRsZXQgY2FwdHVyZWRDb25maWc6IFBhcmFtZXRlcnM8SVRlc3RDb3BpbG90Q2xpZW50WydjcmVhdGVTZXNzaW9uJ10+WzBdIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y2xpZW50LmNyZWF0ZVNlc3Npb24gPSBhc3luYyBjb25maWcgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZENvbmZpZyA9IGNvbmZpZztcblx0XHRcdFx0cmV0dXJuIG5ldyBNb2NrQ29waWxvdFNlc3Npb24oKSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3N5c3RlbS1tZXNzYWdlLXNlc3Npb24nKSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJvdmlzaW9uYWwsIHRydWUpO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGRlZmF1bHRDaGF0VXJpKHJlc3VsdC5zZXNzaW9uKSwgJ2hlbGxvJywgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHRhc3NlcnQub2soY2FwdHVyZWRDb25maWcsICdTREsgY3JlYXRlU2Vzc2lvbiBzaG91bGQgYmUgY2FsbGVkIGR1cmluZyBwcm92aXNpb25hbCBtYXRlcmlhbGl6YXRpb24nKTtcblx0XHRcdFx0Y29uc3Qgc3lzdGVtTWVzc2FnZSA9IGNhcHR1cmVkQ29uZmlnLnN5c3RlbU1lc3NhZ2U7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3lzdGVtTWVzc2FnZSwge1xuXHRcdFx0XHRcdC4uLkNPUElMT1RfQUdFTlRfSE9TVF9TWVNURU1fTUVTU0FHRSxcblx0XHRcdFx0XHRjb250ZW50OiBDT1BJTE9UX0FHRU5UX0hPU1RfRklMRV9MSU5LX0lOU1RSVUNUSU9OUyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghc3lzdGVtTWVzc2FnZSB8fCBzeXN0ZW1NZXNzYWdlLm1vZGUgIT09ICdjdXN0b21pemUnKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LmZhaWwoJ0V4cGVjdGVkIGN1c3RvbWl6ZS1tb2RlIHN5c3RlbSBtZXNzYWdlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN5c3RlbU1lc3NhZ2Uuc2VjdGlvbnM/LmlkZW50aXR5Py5hY3Rpb24sICdyZXBsYWNlJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRzeXN0ZW1NZXNzYWdlLnNlY3Rpb25zPy5pZGVudGl0eT8uY29udGVudCxcblx0XHRcdFx0XHQnWW91IGFyZSBhbiBBSSBhc3Npc3RhbnQgdXNpbmcgQ29waWxvdCBDTEkgcnVudGltZSBpbiBWUyBDb2RlLiBZb3UgaGVscCB1c2VycyB3aXRoIHNvZnR3YXJlIGVuZ2luZWVyaW5nIHRhc2tzLiBXaGVuIGFza2VkIGFib3V0IHlvdXIgaWRlbnRpdHksIHlvdSBtdXN0IHN0YXRlIHRoYXQgeW91IGFyZSBhbiBBSSBhc3Npc3RhbnQgdXNpbmcgQ29waWxvdCBDTEkgcnVudGltZSBpbiBWUyBDb2RlLidcblx0XHRcdFx0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRlcmlhbGl6YXRpb24gZm9yd2FyZHMgdGhlIEdpdEh1YiB0b2tlbiB0byB0aGUgU0RLIGF0IHRoZSBzZXNzaW9uIGxldmVsICgjMzE4NjkzKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRsZXQgY2FwdHVyZWRDb25maWc6IFBhcmFtZXRlcnM8SVRlc3RDb3BpbG90Q2xpZW50WydjcmVhdGVTZXNzaW9uJ10+WzBdIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0XHRjbGllbnQuY3JlYXRlU2Vzc2lvbiA9IGFzeW5jIGNvbmZpZyA9PiB7XG5cdFx0XHRcdGNhcHR1cmVkQ29uZmlnID0gY29uZmlnO1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1vY2tDb3BpbG90U2Vzc2lvbigpIGFzIHVua25vd24gYXMgQ29waWxvdFNlc3Npb247XG5cdFx0XHR9O1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAnZ2gtdG9rZW4tYWJjJyk7XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0c2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZXNzaW9uLWxldmVsLXRva2VuJyksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByb3Zpc2lvbmFsLCB0cnVlKTtcblxuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShkZWZhdWx0Q2hhdFVyaShyZXN1bHQuc2Vzc2lvbiksICdoZWxsbycsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0Y29uZmlnVG9rZW46IGNhcHR1cmVkQ29uZmlnPy5naXRIdWJUb2tlbixcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGNvbmZpZ1Rva2VuOiAnZ2gtdG9rZW4tYWJjJyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFpbGVkIG1hdGVyaWFsaXphdGlvbiBzdXJmYWNlcyB0aGUgY3JlYXRlIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNsaWVudC5jcmVhdGVTZXNzaW9uID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2NyZWF0ZSBmYWlsZWQnKTsgfTtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ2doLXRva2VuLWFiYycpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2ZhaWxlZC1zZXNzaW9uLXRva2VuJyksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKV0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGRlZmF1bHRDaGF0VXJpKHJlc3VsdC5zZXNzaW9uKSwgJ2hlbGxvJywgdW5kZWZpbmVkKSwgL2NyZWF0ZSBmYWlsZWQvKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRlcmlhbGl6YXRpb24gc2tpcHMgbWFuYWdlZCBzaGVsbCB0b29scyB3aGVuIHJvb3QgY29uZmlnIGRpc2FibGVzIHRoZSBjdXN0b20gdGVybWluYWwgdG9vbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRsZXQgY2FwdHVyZWRDb25maWc6IFBhcmFtZXRlcnM8SVRlc3RDb3BpbG90Q2xpZW50WydjcmVhdGVTZXNzaW9uJ10+WzBdIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y2xpZW50LmNyZWF0ZVNlc3Npb24gPSBhc3luYyBjb25maWcgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZENvbmZpZyA9IGNvbmZpZztcblx0XHRcdFx0cmV0dXJuIG5ldyBNb2NrQ29waWxvdFNlc3Npb24oKSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyBhZ2VudCwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZVRlc3RBZ2VudENvbnRleHQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBjbGllbnQgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDb3BpbG90Q2xpQ29uZmlnS2V5LkVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbF06IGZhbHNlIH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRcdHNlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnc2RrLXRlcm1pbmFsLWRlZmF1bHRzJyksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByb3Zpc2lvbmFsLCB0cnVlKTtcblxuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShkZWZhdWx0Q2hhdFVyaShyZXN1bHQuc2Vzc2lvbiksICdoZWxsbycsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYXB0dXJlZENvbmZpZz8udG9vbHM/Lm1hcCh0b29sID0+IHRvb2wubmFtZSksIFtdKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdvbkNsaWVudFRvb2xDYWxsQ29tcGxldGUnLCAoKSA9PiB7XG5cblx0XHQvKipcblx0XHQgKiBJbmplY3RzIGEgc3R1YiBzZXNzaW9uIGludG8gdGhlIGFnZW50J3MgYF9zZXNzaW9uc2AgbWFwIHNvIHdlIGNhblxuXHRcdCAqIG9ic2VydmUgaG93IGBvbkNsaWVudFRvb2xDYWxsQ29tcGxldGVgIHJlc29sdmVzIFVSSXMgdG8gc2Vzc2lvblxuXHRcdCAqIGVudHJpZXMgd2l0aG91dCBzdGFuZGluZyB1cCBhIGZ1bGwgQ29waWxvdCBTREsgc2Vzc2lvbi5cblx0XHQgKi9cblx0XHRmdW5jdGlvbiBpbnN0YWxsU3R1YlNlc3Npb24oYWdlbnQ6IENvcGlsb3RBZ2VudCwgc2Vzc2lvbklkOiBzdHJpbmcpOiB7IGNhbGxzOiB7IHRvb2xDYWxsSWQ6IHN0cmluZzsgcmVzdWx0OiBUb29sQ2FsbFJlc3VsdCB9W10gfSB7XG5cdFx0XHRjb25zdCBjYWxsczogeyB0b29sQ2FsbElkOiBzdHJpbmc7IHJlc3VsdDogVG9vbENhbGxSZXN1bHQgfVtdID0gW107XG5cdFx0XHRjb25zdCBzdHViID0ge1xuXHRcdFx0XHRoYW5kbGVDbGllbnRUb29sQ2FsbENvbXBsZXRlKHRvb2xDYWxsSWQ6IHN0cmluZywgcmVzdWx0OiBUb29sQ2FsbFJlc3VsdCkge1xuXHRcdFx0XHRcdGNhbGxzLnB1c2goeyB0b29sQ2FsbElkLCByZXN1bHQgfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHR9O1xuXHRcdFx0c2V0RGVmYXVsdFNlc3Npb25TdHViKGFnZW50LCBzZXNzaW9uSWQsIHN0dWIpO1xuXHRcdFx0cmV0dXJuIHsgY2FsbHMgfTtcblx0XHR9XG5cblx0XHR0ZXN0KCdyb3V0ZXMgYSB0b3AtbGV2ZWwgc2Vzc2lvbiBVUkkgdG8gaXRzIHNlc3Npb24gZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZXNzaW9uLXRvcCcpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRcdFx0Y29uc3QgeyBjYWxscyB9ID0gaW5zdGFsbFN0dWJTZXNzaW9uKGFnZW50LCBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSkpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogVG9vbENhbGxSZXN1bHQgPSB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdkaWQgaXQnIH07XG5cdFx0XHRcdGFnZW50Lm9uQ2xpZW50VG9vbENhbGxDb21wbGV0ZShzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdCwgJ3RjLXRvcCcsIHJlc3VsdCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgdG9vbENhbGxJZDogJ3RjLXRvcCcsIHJlc3VsdCB9XSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXMgYSBuby1vcCB3aGVuIG5vIHNlc3Npb24gZW50cnkgZXhpc3RzIGZvciB0aGUgcmVzb2x2ZWQgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZXNzaW9uLW1pc3NpbmcnKTtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0XHRcdC8vIE5vIHN0dWIgaW5zdGFsbGVkIFx1MjAxNCB0aGUgY2FsbCBzaG91bGQgYmUgc2lsZW50bHkgaWdub3JlZC5cblx0XHRcdFx0YWdlbnQub25DbGllbnRUb29sQ2FsbENvbXBsZXRlKHNlc3Npb25VcmksIGRlZmF1bHRDaGF0LCAndGMteCcsIHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ25vb3AnIH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JvdXRlcyBhIHBlZXIgY2hhdCBVUkkgdG8gaXRzIGNoYXQtc2Vzc2lvbiBlbnRyeScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIENsaWVudC10b29sIGNvbXBsZXRpb25zIGZvciB0b29scyBydW5uaW5nIGluc2lkZSBhbiBhZGRpdGlvbmFsXG5cdFx0XHQvLyAobm9uLWRlZmF1bHQpIGNoYXQgY2FycnkgYm90aCB0aGUgb3duaW5nIHNlc3Npb24gVVJJIGFuZCB0aGVcblx0XHRcdC8vIGNoYXQgY2hhbm5lbCBVUkkuIFRoZSBhZ2VudCBtdXN0IHJvdXRlIGJ5IHRoZSBjaGF0IFVSSSB0byB0aGUgcGVlclxuXHRcdFx0Ly8gY2hhdCBob3N0ZWQgb24gdGhlIG93bmluZyBzZXNzaW9uJ3MgZW50cnkuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZXNzaW9uLXdpdGgtcGVlcicpO1xuXHRcdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJykpO1xuXHRcdFx0XHRjb25zdCBjYWxsczogeyB0b29sQ2FsbElkOiBzdHJpbmc7IHJlc3VsdDogVG9vbENhbGxSZXN1bHQgfVtdID0gW107XG5cdFx0XHRcdGNvbnN0IHN0dWIgPSB7XG5cdFx0XHRcdFx0aGFuZGxlQ2xpZW50VG9vbENhbGxDb21wbGV0ZSh0b29sQ2FsbElkOiBzdHJpbmcsIHJlc3VsdDogVG9vbENhbGxSZXN1bHQpIHsgY2FsbHMucHVzaCh7IHRvb2xDYWxsSWQsIHJlc3VsdCB9KTsgfSxcblx0XHRcdFx0XHRkaXNwb3NlKCkgeyB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzZXRQZWVyQ2hhdFN0dWIoYWdlbnQsIGNoYXRVcmksIHN0dWIpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogVG9vbENhbGxSZXN1bHQgPSB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdwZWVyIGRvbmUnIH07XG5cdFx0XHRcdGFnZW50Lm9uQ2xpZW50VG9vbENhbGxDb21wbGV0ZShzZXNzaW9uVXJpLCBjaGF0VXJpLCAndGMtcGVlcicsIHJlc3VsdCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW3sgdG9vbENhbGxJZDogJ3RjLXBlZXInLCByZXN1bHQgfV0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0ZXN0KCdyb3V0ZXMgdGhlIGRlZmF1bHQgY2hhdCBVUkkgdG8gdGhlIHNlc3Npb24gZW50cnksIG5vdCBhIGNoYXQtc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSBkZWZhdWx0IGNoYXQgaXMgbm90IGEgcGVlciBjaGF0OyBwYXNzaW5nIGl0cyBjaGF0IFVSSSBtdXN0XG5cdFx0XHQvLyBzdGlsbCByZXNvbHZlIHZpYSBgX3Nlc3Npb25zYCBieSB0aGUgb3duaW5nIHNlc3Npb24gaWQuIFRoaXMgaXNcblx0XHRcdC8vIHRoZSByZWdyZXNzaW9uIHRoYXQgcHJldmlvdXNseSBodW5nIHRoZSBhZ2VudC5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3Nlc3Npb24tZGVmYXVsdCcpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKTtcblx0XHRcdFx0Y29uc3QgeyBjYWxscyB9ID0gaW5zdGFsbFN0dWJTZXNzaW9uKGFnZW50LCBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSkpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogVG9vbENhbGxSZXN1bHQgPSB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdkZWZhdWx0IGRvbmUnIH07XG5cdFx0XHRcdGFnZW50Lm9uQ2xpZW50VG9vbENhbGxDb21wbGV0ZShzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaSwgJ3RjLWRlZmF1bHQnLCByZXN1bHQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFt7IHRvb2xDYWxsSWQ6ICd0Yy1kZWZhdWx0JywgcmVzdWx0IH1dKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwZWVyIGNoYXQgcm91dGluZyBhbmQgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXG5cdFx0LyoqIEluc3RhbGxzIGEgc3R1YiBwZWVyIGNoYXQgaW50byB0aGUgb3duaW5nIHNlc3Npb24ncyBlbnRyeSwga2V5ZWQgYnkgdGhlIGNoYXQgVVJJLiAqL1xuXHRcdGZ1bmN0aW9uIGluc3RhbGxTdHViQ2hhdChhZ2VudDogQ29waWxvdEFnZW50LCBjaGF0VXJpOiBVUkksIG9wdGlvbnM/OiB7IHBlcm1pc3Npb25Pd25lcj86IHN0cmluZzsgaW5wdXRPd25lcj86IHN0cmluZyB9KSB7XG5cdFx0XHRjb25zdCBldmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHN0dWIgPSB7XG5cdFx0XHRcdHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KHJlcXVlc3RJZDogc3RyaW5nLCBhcHByb3ZlZDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdGlmIChvcHRpb25zPy5wZXJtaXNzaW9uT3duZXIgPT09IHJlcXVlc3RJZCkge1xuXHRcdFx0XHRcdFx0ZXZlbnRzLnB1c2goYHBlcm06JHtyZXF1ZXN0SWR9OiR7YXBwcm92ZWR9YCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0KHJlcXVlc3RJZDogc3RyaW5nLCByZXNwb25zZTogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdGlmIChvcHRpb25zPy5pbnB1dE93bmVyID09PSByZXF1ZXN0SWQpIHtcblx0XHRcdFx0XHRcdGV2ZW50cy5wdXNoKGBpbnB1dDoke3JlcXVlc3RJZH1gKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhhbmRsZUNsaWVudFRvb2xDYWxsQ29tcGxldGUoKSB7IH0sXG5cdFx0XHRcdGRpc3Bvc2UoKSB7IGRpc3Bvc2VkID0gdHJ1ZTsgfSxcblx0XHRcdH07XG5cdFx0XHRzZXRQZWVyQ2hhdFN0dWIoYWdlbnQsIGNoYXRVcmksIHN0dWIpO1xuXHRcdFx0cmV0dXJuIHsgZXZlbnRzLCBpc0Rpc3Bvc2VkOiAoKSA9PiBkaXNwb3NlZCB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Jlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0IHJvdXRlcyB0byBhIHBlZXIgY2hhdCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnc2Vzc2lvbi1wZXJtJyk7XG5cdFx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLXBlcm0nKSk7XG5cdFx0XHRcdGNvbnN0IGNoYXQgPSBpbnN0YWxsU3R1YkNoYXQoYWdlbnQsIGNoYXRVcmksIHsgcGVybWlzc2lvbk93bmVyOiAncmVxLTEnIH0pO1xuXG5cdFx0XHRcdGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KCdyZXEtMScsIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhdC5ldmVudHMsIFsncGVybTpyZXEtMTp0cnVlJ10pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3BvbmRUb1VzZXJJbnB1dFJlcXVlc3Qgcm91dGVzIHRvIGEgcGVlciBjaGF0IHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZXNzaW9uLWlucHV0Jyk7XG5cdFx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLWlucHV0JykpO1xuXHRcdFx0XHRjb25zdCBjaGF0ID0gaW5zdGFsbFN0dWJDaGF0KGFnZW50LCBjaGF0VXJpLCB7IGlucHV0T3duZXI6ICdyZXEtMicgfSk7XG5cblx0XHRcdFx0YWdlbnQucmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdCgncmVxLTInLCAnc3VibWl0JyBhcyBuZXZlcik7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGF0LmV2ZW50cywgWydpbnB1dDpyZXEtMiddKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRQZW5kaW5nTWVzc2FnZXMgc3RlZXJzIHRoZSBhZGRyZXNzZWQgY2hhdCwgbm90IHRoZSBzZXNzaW9uXFwncyBkZWZhdWx0IGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uIGZvciAjMzI2MjQ0OiBhIHN0ZWVyaW5nIG1lc3NhZ2Ugc3VibWl0dGVkIGluIGEgZm9ya2VkXG5cdFx0XHQvLyAocGVlcikgY2hhdCBtdXN0IG9ubHkgcmVhY2ggdGhhdCBjaGF0J3MgU0RLIHNlc3Npb24uXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZXNzaW9uLXN0ZWVyJyk7XG5cdFx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLXN0ZWVyJykpO1xuXHRcdFx0XHRjb25zdCBzdGVlcmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRzZXREZWZhdWx0U2Vzc2lvblN0dWIoYWdlbnQsIEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSwge1xuXHRcdFx0XHRcdHNlbmRTdGVlcmluZzogYXN5bmMgKG1zZzogeyBpZDogc3RyaW5nIH0pID0+IHsgc3RlZXJlZC5wdXNoKGBkZWZhdWx0OiR7bXNnLmlkfWApOyB9LFxuXHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRQZWVyQ2hhdFN0dWIoYWdlbnQsIGNoYXRVcmksIHtcblx0XHRcdFx0XHRzZW5kU3RlZXJpbmc6IGFzeW5jIChtc2c6IHsgaWQ6IHN0cmluZyB9KSA9PiB7IHN0ZWVyZWQucHVzaChgcGVlcjoke21zZy5pZH1gKTsgfSxcblx0XHRcdFx0XHRkaXNwb3NlKCkgeyB9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXMoY2hhdFVyaSwgeyBpZDogJ3N0ZWVyLXBlZXInLCBtZXNzYWdlOiB7IHRleHQ6ICdzdG9wJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH0sIFtdKTtcblx0XHRcdFx0YWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzKFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpKSwgeyBpZDogJ3N0ZWVyLWRlZmF1bHQnLCBtZXNzYWdlOiB7IHRleHQ6ICdzdG9wJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH0sIFtdKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0ZWVyZWQsIFsncGVlcjpzdGVlci1wZWVyJywgJ2RlZmF1bHQ6c3RlZXItZGVmYXVsdCddKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlU2Vzc2lvbiBkaXNwb3NlcyB0aGUgc2Vzc2lvblxcJ3MgcGVlciBjaGF0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRcdHNlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncGFyZW50LXdpdGgtcGVlcnMnKSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHJlc3VsdC5zZXNzaW9uLCAncGVlci14JykpO1xuXHRcdFx0XHRjb25zdCBjaGF0ID0gaW5zdGFsbFN0dWJDaGF0KGFnZW50LCBjaGF0VXJpKTtcblxuXHRcdFx0XHRhd2FpdCBhZ2VudC5kaXNwb3NlU2Vzc2lvbihyZXN1bHQuc2Vzc2lvbik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXQuaXNEaXNwb3NlZCgpLCB0cnVlLCAncGVlciBjaGF0IHNob3VsZCBiZSBkaXNwb3NlZCB3aXRoIGl0cyBwYXJlbnQgc2Vzc2lvbicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzUGVlckNoYXRTdHViKGFnZW50LCBjaGF0VXJpKSwgZmFsc2UsICdwZWVyIGNoYXQgZW50cnkgc2hvdWxkIGJlIHJlbW92ZWQnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlQ2hhdCBkZWxldGVzIHRoZSBTREsgY2hhdCAodmlhIGxlZ2FjeSBmYWxsYmFjaykgYW5kIGRyb3BzIHRoZSBsaXZlIGJhY2tpbmcgd2l0aG91dCByZXdyaXRpbmcgY29waWxvdC5jaGF0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzZXNzaW9uLWRpc3Bvc2UtY2hhdCcpO1xuXHRcdFx0XHRjb25zdCBkYiA9IHNlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0XHRcdC8vIEEgbGVnYWN5IHNlc3Npb24gd2hvc2UgYmFja2luZyBzdGlsbCBsaXZlcyBpbiBjb3BpbG90LmNoYXRzLlxuXHRcdFx0XHRhd2FpdCBkYi5vYmplY3Quc2V0TWV0YWRhdGEoJ2NvcGlsb3QuY2hhdHMnLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0J3BlZXItYSc6IHsgc2RrU2Vzc2lvbklkOiAnc2RrLWEnIH0sXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItYScpKTtcblx0XHRcdFx0Y29uc3QgaW50ZXJuYWxzID0gYWdlbnQgYXMgdW5rbm93biBhcyB7IF9jaGF0QmFja2luZ3M6IE1hcDxzdHJpbmcsIHVua25vd24+IH07XG5cdFx0XHRcdC8vIE1hdGVyaWFsaXplIHRoZSBiYWNraW5nIGZpcnN0LCBtaXJyb3JpbmcgdGhlIG9yY2hlc3RyYXRvcidzXG5cdFx0XHRcdC8vIHJlc3RvcmUgaGFuZGluZyBiYWNrIHRoZSBwZXJzaXN0ZWQgcHJvdmlkZXJEYXRhLlxuXHRcdFx0XHRhd2FpdCBhZ2VudC5tYXRlcmlhbGl6ZUNoYXQoY2hhdFVyaSwgSlNPTi5zdHJpbmdpZnkoeyBzZGtTZXNzaW9uSWQ6ICdzZGstYScgfSkpO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLmRpc3Bvc2VDaGF0KGNoYXRVcmkpO1xuXG5cdFx0XHRcdGNvbnN0IHJlbWFpbmluZyA9IGF3YWl0IGRiLm9iamVjdC5nZXRNZXRhZGF0YSgnY29waWxvdC5jaGF0cycpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRiYWNraW5nQ2xlYXJlZDogaW50ZXJuYWxzLl9jaGF0QmFja2luZ3MuaGFzKGNoYXRVcmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0ZGVsZXRlZDogY2xpZW50LmRlbGV0ZWRTZXNzaW9uSWRzLFxuXHRcdFx0XHRcdC8vIFRoZSBhZ2VudCBubyBsb25nZXIgb3ducyB0aGUgZHVyYWJsZSBjYXRhbG9nLCBzbyBpdCBsZWF2ZXNcblx0XHRcdFx0XHQvLyB0aGUgbGVnYWN5IGJsb2IgdW50b3VjaGVkIChvcmNoZXN0cmF0b3IgZHJvcHMgdGhlIGVudHJ5KS5cblx0XHRcdFx0XHRsZWdhY3lVbnRvdWNoZWQ6IHJlbWFpbmluZyA/IEpTT04ucGFyc2UocmVtYWluaW5nKSA6IHt9LFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0YmFja2luZ0NsZWFyZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGRlbGV0ZWQ6IFsnc2RrLWEnXSxcblx0XHRcdFx0XHRsZWdhY3lVbnRvdWNoZWQ6IHsgJ3BlZXItYSc6IHsgc2RrU2Vzc2lvbklkOiAnc2RrLWEnIH0gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGVlciBjaGF0IGNyZWF0ZSAvIGZvcmsgLyBtb2RlbCthZ2VudCAvIHJlc3RvcmUgcm91bmQtdHJpcCcsICgpID0+IHtcblxuXHRcdC8qKiBJbnRlcm5hbCBzdXJmYWNlIHRoZSBtdWx0aS1jaGF0IHRlc3RzIHJlYWNoIGludG8gdG8gc3R1YiB0aGUgU0RLL2FnZW50LXNlc3Npb24gc2VhbS4gKi9cblx0XHR0eXBlIENoYXRJbnRlcm5hbHMgPSB7XG5cdFx0XHRfY2hhdEJhY2tpbmdzOiBNYXA8c3RyaW5nLCB7IHNka1Nlc3Npb25JZDogc3RyaW5nOyBtb2RlbD86IE1vZGVsU2VsZWN0aW9uIH0+O1xuXHRcdFx0X3Nlc3Npb25zOiBNYXA8c3RyaW5nLCBDb3BpbG90U2Vzc2lvbkVudHJ5Pjtcblx0XHRcdF9jcmVhdGVBZ2VudFNlc3Npb246IChsYXVuY2hQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4sIGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCwgYWN0aXZlQ2xpZW50OiB1bmtub3duLCBpZGVudGl0eT86IHsgc2Vzc2lvblVyaTogVVJJOyBjaGF0Q2hhbm5lbFVyaTogVVJJIH0pID0+IENvcGlsb3RBZ2VudFNlc3Npb247XG5cdFx0XHRfc2Vzc2lvblNlcXVlbmNlcjogeyBxdWV1ZTxUPihrZXk6IHN0cmluZywgdGFzazogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4gfTtcblx0XHRcdF9mb3JrU2RrQ2hhdDogKGNsaWVudDogdW5rbm93biwgc291cmNlRW50cnk6IHVua25vd24sIHR1cm5JZDogc3RyaW5nLCB0YXJnZXREYkRpcjogVVJJKSA9PiBQcm9taXNlPHsgc2Vzc2lvbklkOiBzdHJpbmc7IGluaGVyaXRlZFR1cm5Db3VudDogbnVtYmVyIH0+O1xuXHRcdFx0X3Jlc29sdmVBZ2VudE5hbWU6IChzbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90LCBhZ2VudDogQWdlbnRTZWxlY3Rpb24pID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0aW50ZXJmYWNlIElGYWtlQ2hhdFJlY29yZGVyIHtcblx0XHRcdGluaXRpYWxpemVkOiBib29sZWFuO1xuXHRcdFx0ZGlzcG9zZWQ6IGJvb2xlYW47XG5cdFx0XHRyZWFkb25seSByZW1hcENhbGxzOiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz5bXTtcblx0XHRcdHJlYWRvbmx5IHNlbmRzOiB7IHByb21wdDogc3RyaW5nOyB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgbW9kZTogdW5rbm93bjsgc2VuZGVyQ2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9W107XG5cdFx0XHRyZWFkb25seSByZXNldHM6IHsgdHVybklkOiBzdHJpbmc7IHNlbmRlckNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdO1xuXHRcdFx0cmVhZG9ubHkgbW9kZWxDYWxsczogeyBpZDogc3RyaW5nIH1bXTtcblx0XHRcdHJlYWRvbmx5IGFnZW50Q2FsbHM6IChzdHJpbmcgfCB1bmRlZmluZWQpW107XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogQnVpbGRzIGEgZmFrZSB7QGxpbmsgQ29waWxvdEFnZW50U2Vzc2lvbn0gdGhhdCByZWNvcmRzIHRoZSBjYWxsc1xuXHRcdCAqIGBjcmVhdGVDaGF0YC9gc2VuZE1lc3NhZ2VgL2BjaGFuZ2VNb2RlbGAvYGNoYW5nZUFnZW50YCByb3V0ZSB0byBhIHBlZXJcblx0XHQgKiBjaGF0LCBzbyB0ZXN0cyBjYW4gZHJpdmUgdGhlIHJlYWwgYWdlbnQgbWV0aG9kcyB3aGlsZSBzdHViYmluZyBvbmx5IHRoZVxuXHRcdCAqIFNESy1iYWNrZWQgY2hhdC4gVGhlIGBfY3JlYXRlQWdlbnRTZXNzaW9uYCBzZWFtIHJldHVybnMgdGhpcy5cblx0XHQgKi9cblx0XHRmdW5jdGlvbiBtYWtlRmFrZUNoYXRTZXNzaW9uKHNlc3Npb25Vcmk6IFVSSSwgc2RrU2Vzc2lvbklkOiBzdHJpbmcsIGdldE1lc3NhZ2VzPzogKCkgPT4gUHJvbWlzZTxyZWFkb25seSBUdXJuW10+LCBvd25lZD86IElEaXNwb3NhYmxlKTogeyByZWM6IElGYWtlQ2hhdFJlY29yZGVyOyBmYWtlOiBDb3BpbG90QWdlbnRTZXNzaW9uIH0ge1xuXHRcdFx0Y29uc3QgcmVjOiBJRmFrZUNoYXRSZWNvcmRlciA9IHtcblx0XHRcdFx0aW5pdGlhbGl6ZWQ6IGZhbHNlLFxuXHRcdFx0XHRkaXNwb3NlZDogZmFsc2UsXG5cdFx0XHRcdHJlbWFwQ2FsbHM6IFtdLFxuXHRcdFx0XHRzZW5kczogW10sXG5cdFx0XHRcdHJlc2V0czogW10sXG5cdFx0XHRcdG1vZGVsQ2FsbHM6IFtdLFxuXHRcdFx0XHRhZ2VudENhbGxzOiBbXSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBmYWtlID0ge1xuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHRzZXNzaW9uSWQ6IHNka1Nlc3Npb25JZCxcblx0XHRcdFx0YXBwbGllZFNuYXBzaG90OiB7IHRvb2xzOiBbXSwgcGx1Z2luczogW10sIG1jcFNlcnZlcnM6IHt9IH0gc2F0aXNmaWVzIElBY3RpdmVDbGllbnRTbmFwc2hvdCxcblx0XHRcdFx0YXN5bmMgaW5pdGlhbGl6ZVNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7IHJlYy5pbml0aWFsaXplZCA9IHRydWU7IH0sXG5cdFx0XHRcdGFzeW5jIHJlbWFwVHVybklkcyhtYXBwaW5nOiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHsgcmVjLnJlbWFwQ2FsbHMucHVzaChtYXBwaW5nKTsgfSxcblx0XHRcdFx0YXN5bmMgc2VuZChwcm9tcHQ6IHN0cmluZywgX2F0dGFjaG1lbnRzOiB1bmtub3duLCB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbW9kZTogdW5rbm93biwgc2VuZGVyQ2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdHJlYy5zZW5kcy5wdXNoKHsgcHJvbXB0LCB0dXJuSWQsIG1vZGUsIHNlbmRlckNsaWVudElkIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXNldFR1cm5TdGF0ZSh0dXJuSWQ6IHN0cmluZywgc2VuZGVyQ2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQgeyByZWMucmVzZXRzLnB1c2goeyB0dXJuSWQsIHNlbmRlckNsaWVudElkIH0pOyB9LFxuXHRcdFx0XHRhc3luYyBzZXRNb2RlbChpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IHJlYy5tb2RlbENhbGxzLnB1c2goeyBpZCB9KTsgfSxcblx0XHRcdFx0YXN5bmMgc2V0QWdlbnQobmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7IHJlYy5hZ2VudENhbGxzLnB1c2gobmFtZSk7IH0sXG5cdFx0XHRcdGhhbmRsZUNsaWVudFRvb2xDYWxsQ29tcGxldGUoKTogdm9pZCB7IH0sXG5cdFx0XHRcdGFzeW5jIGdldE5leHRUdXJuRXZlbnRJZCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9LFxuXHRcdFx0XHRnZXRNZXNzYWdlczogZ2V0TWVzc2FnZXMgPz8gKGFzeW5jICgpID0+IFtdKSxcblx0XHRcdFx0ZGlzcG9zZSgpOiB2b2lkIHsgcmVjLmRpc3Bvc2VkID0gdHJ1ZTsgb3duZWQ/LmRpc3Bvc2UoKTsgfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90QWdlbnRTZXNzaW9uO1xuXHRcdFx0cmV0dXJuIHsgcmVjLCBmYWtlIH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnY3JlYXRlQ2hhdCBtYXRlcmlhbGl6ZXMgYSBwZWVyIGNoYXQsIHJlY29yZHMgaXRzIGJhY2tpbmcsIGFuZCByZXR1cm5zIHByb3ZpZGVyRGF0YSAobm8gY29waWxvdC5jaGF0cyB3cml0ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSkgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnY3JlYXRlLXBlZXInKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldIH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLWEnKSk7XG5cdFx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgQ2hhdEludGVybmFscztcblx0XHRcdFx0bGV0IGNhcHR1cmVkOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBjYXB0dXJlZENoYW5uZWw6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IGNhcHR1cmVkU2Vzc2lvbjogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgcmVjOiBJRmFrZUNoYXRSZWNvcmRlciB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aW50ZXJuYWxzLl9jcmVhdGVBZ2VudFNlc3Npb24gPSAobGF1bmNoUGxhbiwgX2RpciwgX2FjLCBpZGVudGl0eSkgPT4ge1xuXHRcdFx0XHRcdGNhcHR1cmVkID0gbGF1bmNoUGxhbjtcblx0XHRcdFx0XHRjYXB0dXJlZENoYW5uZWwgPSBpZGVudGl0eT8uY2hhdENoYW5uZWxVcmk7XG5cdFx0XHRcdFx0Y2FwdHVyZWRTZXNzaW9uID0gaWRlbnRpdHk/LnNlc3Npb25Vcmk7XG5cdFx0XHRcdFx0Y29uc3QgYnVpbHQgPSBtYWtlRmFrZUNoYXRTZXNzaW9uKHNlc3Npb24sIGxhdW5jaFBsYW4uc2Vzc2lvbklkLCB1bmRlZmluZWQsIGxhdW5jaFBsYW4uc2hlbGxNYW5hZ2VyKTtcblx0XHRcdFx0XHRyZWMgPSBidWlsdC5yZWM7XG5cdFx0XHRcdFx0cmV0dXJuIGJ1aWx0LmZha2U7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgbW9kZWw6IE1vZGVsU2VsZWN0aW9uID0geyBpZDogJ2dwdC14JyB9O1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jaGF0cy5jcmVhdGVDaGF0KGNoYXRVcmksIHsgbW9kZWwgfSk7XG5cblx0XHRcdFx0Y29uc3QgZGIgPSBzZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdFx0XHRjb25zdCByYXcgPSBhd2FpdCBkYi5vYmplY3QuZ2V0TWV0YWRhdGEoJ2NvcGlsb3QuY2hhdHMnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0dHJhY2tlZDogaGFzUGVlckNoYXRTdHViKGFnZW50LCBjaGF0VXJpKSxcblx0XHRcdFx0XHRpbml0aWFsaXplZDogcmVjPy5pbml0aWFsaXplZCxcblx0XHRcdFx0XHRzZXNzaW9uOiBjYXB0dXJlZFNlc3Npb24/LnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y2hhbm5lbDogY2FwdHVyZWRDaGFubmVsPy50b1N0cmluZygpLFxuXHRcdFx0XHRcdGtpbmQ6IGNhcHR1cmVkPy5raW5kLFxuXHRcdFx0XHRcdGJhY2tpbmc6IGludGVybmFscy5fY2hhdEJhY2tpbmdzLmdldChjaGF0VXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdHByb3ZpZGVyRGF0YTogcmVzdWx0ID8gSlNPTi5wYXJzZShyZXN1bHQucHJvdmlkZXJEYXRhISkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Ly8gVGhlIG9yY2hlc3RyYXRvciBub3cgb3ducyB0aGUgZHVyYWJsZSBjYXRhbG9nOyB0aGUgYWdlbnQgbm9cblx0XHRcdFx0XHQvLyBsb25nZXIgd3JpdGVzIGl0cyBwcml2YXRlIGBjb3BpbG90LmNoYXRzYCBtZXRhZGF0YS5cblx0XHRcdFx0XHRsZWdhY3lDYXRhbG9nV3JpdHRlbjogcmF3ICE9PSB1bmRlZmluZWQsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHR0cmFja2VkOiB0cnVlLFxuXHRcdFx0XHRcdGluaXRpYWxpemVkOiB0cnVlLFxuXHRcdFx0XHRcdHNlc3Npb246IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdFx0XHRjaGFubmVsOiBjaGF0VXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0a2luZDogJ2NyZWF0ZScsXG5cdFx0XHRcdFx0YmFja2luZzogeyBzZGtTZXNzaW9uSWQ6IGNhcHR1cmVkIS5zZXNzaW9uSWQsIG1vZGVsOiB7IGlkOiAnZ3B0LXgnIH0gfSxcblx0XHRcdFx0XHRwcm92aWRlckRhdGE6IHsgc2RrU2Vzc2lvbklkOiBjYXB0dXJlZCEuc2Vzc2lvbklkLCBtb2RlbDogeyBpZDogJ2dwdC14JyB9IH0sXG5cdFx0XHRcdFx0bGVnYWN5Q2F0YWxvZ1dyaXR0ZW46IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVDaGF0IGlzIGEgbm8tb3AgZm9yIHRoZSBkZWZhdWx0IGNoYXQgVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10pIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2NyZWF0ZS1kZWZhdWx0Jyk7XG5cdFx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgQ2hhdEludGVybmFscztcblx0XHRcdFx0aW50ZXJuYWxzLl9jcmVhdGVBZ2VudFNlc3Npb24gPSAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignX2NyZWF0ZUFnZW50U2Vzc2lvbiBtdXN0IG5vdCBiZSBjYWxsZWQgZm9yIHRoZSBkZWZhdWx0IGNoYXQnKTsgfTtcblxuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5jcmVhdGVDaGF0KFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKSwge30pO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdHRyYWNrZWQ6IHBlZXJDaGF0Q291bnQoYWdlbnQpLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0dHJhY2tlZDogMCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlQ2hhdCBmb3JrcyB0aGUgc291cmNlIGNoYXQgaW50byBhIG5ldyBwZWVyIGNoYXQgYW5kIHJldHVybnMgdGhlIGZvcmtlZCBjaGF0IHByb3ZpZGVyRGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdmb3JrLXBlZXInKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldIH0pO1xuXG5cdFx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgQ2hhdEludGVybmFscztcblx0XHRcdFx0Ly8gSW5zdGFsbCB0aGUgZGVmYXVsdCBjaGF0IGFzIHRoZSBmb3JrIHNvdXJjZSBzbyByZXNvbHV0aW9uIHN0YXlzXG5cdFx0XHRcdC8vIGluLW1lbW9yeSAobm8gU0RLIHJlc3VtZSkuXG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IG1ha2VGYWtlQ2hhdFNlc3Npb24oc2Vzc2lvbiwgJ3NvdXJjZS1zZGsnKTtcblx0XHRcdFx0c2V0RGVmYXVsdFNlc3Npb25TdHViKGFnZW50LCBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksIHNvdXJjZS5mYWtlKTtcblxuXHRcdFx0XHQvLyBTdHViIHRoZSBTREsvZnMgZm9yayBzZWFtOiBhc3NlcnQgdGhlIGlucHV0cyBhbmQgaGFuZCBiYWNrIGFcblx0XHRcdFx0Ly8gZGV0ZXJtaW5pc3RpYyBmb3JrZWQgY2hhdCBpZC5cblx0XHRcdFx0bGV0IGZvcmtBcmdzOiB7IHNvdXJjZUVudHJ5OiB1bmtub3duOyB0dXJuSWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpbnRlcm5hbHMuX2ZvcmtTZGtDaGF0ID0gYXN5bmMgKF9jbGllbnQsIHNvdXJjZUVudHJ5LCB0dXJuSWQpID0+IHtcblx0XHRcdFx0XHRmb3JrQXJncyA9IHsgc291cmNlRW50cnksIHR1cm5JZCB9O1xuXHRcdFx0XHRcdHJldHVybiB7IHNlc3Npb25JZDogJ2ZvcmtlZC1zZGstaWQnLCBpbmhlcml0ZWRUdXJuQ291bnQ6IDAgfTtcblx0XHRcdFx0fTtcblx0XHRcdFx0bGV0IGNhcHR1cmVkOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGludGVybmFscy5fY3JlYXRlQWdlbnRTZXNzaW9uID0gKGxhdW5jaFBsYW4pID0+IHtcblx0XHRcdFx0XHRjYXB0dXJlZCA9IGxhdW5jaFBsYW47XG5cdFx0XHRcdFx0cmV0dXJuIG1ha2VGYWtlQ2hhdFNlc3Npb24oc2Vzc2lvbiwgbGF1bmNoUGxhbi5zZXNzaW9uSWQsIHVuZGVmaW5lZCwgbGF1bmNoUGxhbi5zaGVsbE1hbmFnZXIpLmZha2U7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItZm9yaycpKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY2hhdHMuZm9yayhjaGF0VXJpLCB7IHNvdXJjZTogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpLCB0dXJuSWQ6ICd0MScgfSk7XG5cblx0XHRcdFx0Y29uc3QgZGIgPSBzZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdFx0XHRjb25zdCByYXcgPSBhd2FpdCBkYi5vYmplY3QuZ2V0TWV0YWRhdGEoJ2NvcGlsb3QuY2hhdHMnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0c291cmNlSXNEZWZhdWx0U2Vzc2lvbjogZm9ya0FyZ3M/LnNvdXJjZUVudHJ5ID09PSBzb3VyY2UuZmFrZSxcblx0XHRcdFx0XHRmb3JrZWRUdXJuSWQ6IGZvcmtBcmdzPy50dXJuSWQsXG5cdFx0XHRcdFx0bGF1bmNoS2luZDogY2FwdHVyZWQ/LmtpbmQsXG5cdFx0XHRcdFx0bGF1bmNoU2Vzc2lvbklkOiBjYXB0dXJlZD8uc2Vzc2lvbklkLFxuXHRcdFx0XHRcdHRyYWNrZWQ6IGhhc1BlZXJDaGF0U3R1YihhZ2VudCwgY2hhdFVyaSksXG5cdFx0XHRcdFx0YmFja2luZzogaW50ZXJuYWxzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXRVcmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0cHJvdmlkZXJEYXRhOiByZXN1bHQgPyBKU09OLnBhcnNlKHJlc3VsdC5wcm92aWRlckRhdGEhKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsZWdhY3lDYXRhbG9nV3JpdHRlbjogcmF3ICE9PSB1bmRlZmluZWQsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRzb3VyY2VJc0RlZmF1bHRTZXNzaW9uOiB0cnVlLFxuXHRcdFx0XHRcdGZvcmtlZFR1cm5JZDogJ3QxJyxcblx0XHRcdFx0XHRsYXVuY2hLaW5kOiAncmVzdW1lJyxcblx0XHRcdFx0XHRsYXVuY2hTZXNzaW9uSWQ6ICdmb3JrZWQtc2RrLWlkJyxcblx0XHRcdFx0XHR0cmFja2VkOiB0cnVlLFxuXHRcdFx0XHRcdGJhY2tpbmc6IHsgc2RrU2Vzc2lvbklkOiAnZm9ya2VkLXNkay1pZCcgfSxcblx0XHRcdFx0XHRwcm92aWRlckRhdGE6IHsgc2RrU2Vzc2lvbklkOiAnZm9ya2VkLXNkay1pZCcgfSxcblx0XHRcdFx0XHRsZWdhY3lDYXRhbG9nV3JpdHRlbjogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZUNoYXQgc2lkZSBjaGF0IGZvcmtzIGhpZGRlbiBjb250ZXh0IGFuZCBmaWx0ZXJzIGluaGVyaXRlZCB0dXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzaWRlLXBlZXInKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldIH0pO1xuXHRcdFx0XHRjb25zdCBzb3VyY2VUdXJuOiBUdXJuID0ge1xuXHRcdFx0XHRcdGlkOiAndDEnLFxuXHRcdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnc291cmNlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHBhcnRpYWxSZXNwb25zZSA9ICdwYXJ0aWFsIHNvdXJjZSBhbnN3ZXInO1xuXHRcdFx0XHRjb25zdCBzb3VyY2VDb250ZXh0ID0gJ1VzZXIgcmVxdWVzdDpcXG5zb3VyY2VcXG5cXG5BZ2VudCByZXNwb25zZTpcXG5zb3VyY2UgYW5zd2VyXFxuXFxuLS0tXFxuXFxuVXNlciByZXF1ZXN0OlxcbmFjdGl2ZSBzb3VyY2UnO1xuXHRcdFx0XHRjb25zdCBpbmplY3RlZFByb21wdCA9IGluamVjdFNpZGVDaGF0Q29udGV4dCgnc2lkZScsIHBhcnRpYWxSZXNwb25zZSwgc291cmNlQ29udGV4dCk7XG5cdFx0XHRcdGNvbnN0IHNpZGVUdXJuOiBUdXJuID0ge1xuXHRcdFx0XHRcdGlkOiAndDInLFxuXHRcdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiBpbmplY3RlZFByb21wdCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IG1ha2VGYWtlQ2hhdFNlc3Npb24oc2Vzc2lvbiwgJ3NvdXJjZS1zZGsnLCBhc3luYyAoKSA9PiBbc291cmNlVHVybl0pO1xuXHRcdFx0XHRzZXREZWZhdWx0U2Vzc2lvblN0dWIoYWdlbnQsIEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSwgc291cmNlLmZha2UpO1xuXHRcdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIENoYXRJbnRlcm5hbHM7XG5cdFx0XHRcdGludGVybmFscy5fZm9ya1Nka0NoYXQgPSBhc3luYyAoKSA9PiAoeyBzZXNzaW9uSWQ6ICdzaWRlLXNkay1pZCcsIGluaGVyaXRlZFR1cm5Db3VudDogMSB9KTtcblx0XHRcdFx0bGV0IG1lc3NhZ2VSZWFkQ291bnQgPSAwO1xuXHRcdFx0XHRsZXQgc2lkZVJlY29yZGVyOiBJRmFrZUNoYXRSZWNvcmRlciB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aW50ZXJuYWxzLl9jcmVhdGVBZ2VudFNlc3Npb24gPSBsYXVuY2hQbGFuID0+IHtcblx0XHRcdFx0XHRjb25zdCBzaWRlID0gbWFrZUZha2VDaGF0U2Vzc2lvbihzZXNzaW9uLCBsYXVuY2hQbGFuLnNlc3Npb25JZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0bWVzc2FnZVJlYWRDb3VudCsrO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1lc3NhZ2VSZWFkQ291bnQgPD0gMiA/IFtzb3VyY2VUdXJuXSA6IFtzb3VyY2VUdXJuLCBzaWRlVHVybl07XG5cdFx0XHRcdFx0fSwgbGF1bmNoUGxhbi5zaGVsbE1hbmFnZXIpO1xuXHRcdFx0XHRcdHNpZGVSZWNvcmRlciA9IHNpZGUucmVjO1xuXHRcdFx0XHRcdHJldHVybiBzaWRlLmZha2U7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItc2lkZScpKTtcblx0XHRcdFx0Y29uc3Qgc291cmNlTG9ja0VudGVyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdGNvbnN0IHJlbGVhc2VTb3VyY2VMb2NrID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0XHRjb25zdCBzb3VyY2VMb2NrID0gaW50ZXJuYWxzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHNvdXJjZUxvY2tFbnRlcmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0YXdhaXQgcmVsZWFzZVNvdXJjZUxvY2sucDtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IHNvdXJjZUxvY2tFbnRlcmVkLnA7XG5cdFx0XHRcdGxldCByZXN1bHQ7XG5cdFx0XHRcdGNvbnN0IGNyZWF0ZVRpbWVvdXQgPSB0aW1lb3V0KDVfMDAwKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRcdFx0YWdlbnQuY2hhdHMuY3JlYXRlQ2hhdChjaGF0VXJpLCB7IHNpZGVDaGF0OiB7IHNvdXJjZTogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpLCB0dXJuSWQ6ICdhY3RpdmUtdHVybicsIHNvdXJjZUNvbnRleHQsIHBhcnRpYWxSZXNwb25zZSB9IH0pLFxuXHRcdFx0XHRcdFx0Y3JlYXRlVGltZW91dC50aGVuKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdTaWRlIGNoYXQgY3JlYXRpb24gd2FpdGVkIGZvciB0aGUgc291cmNlIHR1cm4gbG9jaycpOyB9KSxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRjcmVhdGVUaW1lb3V0LmNhbmNlbCgpO1xuXHRcdFx0XHRcdHJlbGVhc2VTb3VyY2VMb2NrLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0YXdhaXQgc291cmNlTG9jaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShjaGF0VXJpLCAnc2lkZScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAndDInKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdFVyaSwgJ2ZvbGxvdy11cCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAndDMnKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY2hhdHMuY2hhbmdlTW9kZWwoY2hhdFVyaSwgeyBpZDogJ2dwdC15JyB9KTtcblx0XHRcdFx0Y29uc3QgdHVybnMgPSBhd2FpdCBhZ2VudC5jaGF0cy5nZXRNZXNzYWdlcyhjaGF0VXJpKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRoYXNFeHBsYW5hdGlvbkd1aWRhbmNlOiBzaWRlUmVjb3JkZXI/LnNlbmRzWzBdPy5wcm9tcHQuaW5jbHVkZXMoJ1ByZWZlciBleHBsYW5hdGlvbiBvdmVyIGFjdGlvbicpLFxuXHRcdFx0XHRcdHNlbnRQcm9tcHRzOiBzaWRlUmVjb3JkZXI/LnNlbmRzLm1hcChzZW5kID0+IHNlbmQucHJvbXB0KSxcblx0XHRcdFx0XHR0dXJuczogdHVybnMubWFwKHR1cm4gPT4gdHVybi5pZCksXG5cdFx0XHRcdFx0dmlzaWJsZVByb21wdDogdHVybnNbMF0/Lm1lc3NhZ2UudGV4dCxcblx0XHRcdFx0XHRzaWRlQ2hhdDogcmVzdWx0ID8gSlNPTi5wYXJzZShyZXN1bHQucHJvdmlkZXJEYXRhISkuc2lkZUNoYXQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRoYXNFeHBsYW5hdGlvbkd1aWRhbmNlOiB0cnVlLFxuXHRcdFx0XHRcdHNlbnRQcm9tcHRzOiBbaW5qZWN0ZWRQcm9tcHQsICdmb2xsb3ctdXAnXSxcblx0XHRcdFx0XHR0dXJuczogWyd0MiddLFxuXHRcdFx0XHRcdHZpc2libGVQcm9tcHQ6ICdzaWRlJyxcblx0XHRcdFx0XHRzaWRlQ2hhdDogeyBzb3VyY2U6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbiksIHR1cm5JZDogJ2FjdGl2ZS10dXJuJywgaW5oZXJpdGVkVHVybkNvdW50OiAxLCBjb250ZXh0OiBzb3VyY2VDb250ZXh0LCBwYXJ0aWFsUmVzcG9uc2UgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlQ2hhdCBzaWRlIGNoYXQgcHJlc2VydmVzIGEgbG9jYWwgc291cmNlIHR1cm4gaWQgd2hpbGUgZm9ya2luZyBmcm9tIHRoZSBjb25jcmV0ZSBwcm92aWRlciBhbmNob3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSkgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnc2lkZS1sb2NhbC1wZWVyJyk7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oeyBzZXNzaW9uLCB3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSB9KTtcblx0XHRcdFx0Y29uc3Qgc291cmNlVHVybjogVHVybiA9IHtcblx0XHRcdFx0XHRpZDogJ3QxJyxcblx0XHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3NvdXJjZScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBzb3VyY2VDb250ZXh0ID0gJ1VzZXIgcmVxdWVzdDpcXG5zb3VyY2VcXG5cXG5BZ2VudCByZXNwb25zZTpcXG5zb3VyY2UgYW5zd2VyXFxuXFxuLS0tXFxuXFxuVXNlciByZXF1ZXN0OlxcbiFjb21tYW5kJztcblx0XHRcdFx0Y29uc3QgaW5qZWN0ZWRQcm9tcHQgPSBpbmplY3RTaWRlQ2hhdENvbnRleHQoJ3NpZGUnLCB1bmRlZmluZWQsIHNvdXJjZUNvbnRleHQpO1xuXHRcdFx0XHRjb25zdCBzaWRlVHVybjogVHVybiA9IHtcblx0XHRcdFx0XHRpZDogJ3QyJyxcblx0XHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogaW5qZWN0ZWRQcm9tcHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSBtYWtlRmFrZUNoYXRTZXNzaW9uKHNlc3Npb24sICdzb3VyY2Utc2RrJywgYXN5bmMgKCkgPT4gW3NvdXJjZVR1cm5dKTtcblx0XHRcdFx0c2V0RGVmYXVsdFNlc3Npb25TdHViKGFnZW50LCBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksIHNvdXJjZS5mYWtlKTtcblx0XHRcdFx0Y29uc3QgaW50ZXJuYWxzID0gYWdlbnQgYXMgdW5rbm93biBhcyBDaGF0SW50ZXJuYWxzO1xuXHRcdFx0XHRsZXQgZm9ya1R1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpbnRlcm5hbHMuX2ZvcmtTZGtDaGF0ID0gYXN5bmMgKF9jbGllbnQsIF9zb3VyY2VFbnRyeSwgdHVybklkKSA9PiB7XG5cdFx0XHRcdFx0Zm9ya1R1cm5JZCA9IHR1cm5JZDtcblx0XHRcdFx0XHRyZXR1cm4geyBzZXNzaW9uSWQ6ICdzaWRlLXNkay1pZCcsIGluaGVyaXRlZFR1cm5Db3VudDogMSB9O1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRsZXQgbWVzc2FnZVJlYWRDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBzaWRlUmVjb3JkZXI6IElGYWtlQ2hhdFJlY29yZGVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpbnRlcm5hbHMuX2NyZWF0ZUFnZW50U2Vzc2lvbiA9IGxhdW5jaFBsYW4gPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNpZGUgPSBtYWtlRmFrZUNoYXRTZXNzaW9uKHNlc3Npb24sIGxhdW5jaFBsYW4uc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlUmVhZENvdW50Kys7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbWVzc2FnZVJlYWRDb3VudCA8PSAyID8gW3NvdXJjZVR1cm5dIDogW3NvdXJjZVR1cm4sIHNpZGVUdXJuXTtcblx0XHRcdFx0XHR9LCBsYXVuY2hQbGFuLnNoZWxsTWFuYWdlcik7XG5cdFx0XHRcdFx0c2lkZVJlY29yZGVyID0gc2lkZS5yZWM7XG5cdFx0XHRcdFx0cmV0dXJuIHNpZGUuZmFrZTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci1zaWRlLWxvY2FsJykpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jaGF0cy5jcmVhdGVDaGF0KGNoYXRVcmksIHtcblx0XHRcdFx0XHRzaWRlQ2hhdDoge1xuXHRcdFx0XHRcdFx0c291cmNlOiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSksXG5cdFx0XHRcdFx0XHR0dXJuSWQ6ICdsb2NhbC0xJyxcblx0XHRcdFx0XHRcdHByb3ZpZGVyQW5jaG9yVHVybklkOiAndDEnLFxuXHRcdFx0XHRcdFx0c291cmNlQ29udGV4dCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdFVyaSwgJ3NpZGUnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3QyJyk7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGNoYXRVcmksICdmb2xsb3ctdXAnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ3QzJyk7XG5cdFx0XHRcdGNvbnN0IHR1cm5zID0gYXdhaXQgYWdlbnQuY2hhdHMuZ2V0TWVzc2FnZXMoY2hhdFVyaSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0Zm9ya1R1cm5JZCxcblx0XHRcdFx0XHRzZW50UHJvbXB0czogc2lkZVJlY29yZGVyPy5zZW5kcy5tYXAoc2VuZCA9PiBzZW5kLnByb21wdCksXG5cdFx0XHRcdFx0dHVybnM6IHR1cm5zLm1hcCh0dXJuID0+IHR1cm4uaWQpLFxuXHRcdFx0XHRcdHZpc2libGVQcm9tcHQ6IHR1cm5zWzBdPy5tZXNzYWdlLnRleHQsXG5cdFx0XHRcdFx0c2lkZUNoYXQ6IHJlc3VsdCA/IEpTT04ucGFyc2UocmVzdWx0LnByb3ZpZGVyRGF0YSEpLnNpZGVDaGF0IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0Zm9ya1R1cm5JZDogJ3QxJyxcblx0XHRcdFx0XHRzZW50UHJvbXB0czogW2luamVjdGVkUHJvbXB0LCAnZm9sbG93LXVwJ10sXG5cdFx0XHRcdFx0dHVybnM6IFsndDInXSxcblx0XHRcdFx0XHR2aXNpYmxlUHJvbXB0OiAnc2lkZScsXG5cdFx0XHRcdFx0c2lkZUNoYXQ6IHtcblx0XHRcdFx0XHRcdHNvdXJjZTogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSxcblx0XHRcdFx0XHRcdHR1cm5JZDogJ2xvY2FsLTEnLFxuXHRcdFx0XHRcdFx0cHJvdmlkZXJBbmNob3JUdXJuSWQ6ICd0MScsXG5cdFx0XHRcdFx0XHRpbmhlcml0ZWRUdXJuQ291bnQ6IDEsXG5cdFx0XHRcdFx0XHRjb250ZXh0OiBzb3VyY2VDb250ZXh0LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlbmRNZXNzYWdlIHJvdXRlcyBhIHR1cm4gdG8gdGhlIHRhcmdldGVkIHBlZXIgY2hhdCBvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncm91dGUtbXNnJyk7XG5cdFx0XHRcdGNvbnN0IGNoYXRBID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci1hJykpO1xuXHRcdFx0XHRjb25zdCBjaGF0QiA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItYicpKTtcblx0XHRcdFx0Y29uc3QgYSA9IG1ha2VGYWtlQ2hhdFNlc3Npb24oc2Vzc2lvbiwgJ3Nkay1hJyk7XG5cdFx0XHRcdGNvbnN0IGIgPSBtYWtlRmFrZUNoYXRTZXNzaW9uKHNlc3Npb24sICdzZGstYicpO1xuXHRcdFx0XHRzZXRQZWVyQ2hhdFN0dWIoYWdlbnQsIGNoYXRBLCBhLmZha2UpO1xuXHRcdFx0XHRzZXRQZWVyQ2hhdFN0dWIoYWdlbnQsIGNoYXRCLCBiLmZha2UpO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGNoYXRBLCAnaGVsbG8tYScsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAndHVybi1hJywgJ2NsaWVudC0xJyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0YVNlbmRzOiBhLnJlYy5zZW5kcy5tYXAocyA9PiAoeyBwcm9tcHQ6IHMucHJvbXB0LCB0dXJuSWQ6IHMudHVybklkLCBzZW5kZXJDbGllbnRJZDogcy5zZW5kZXJDbGllbnRJZCB9KSksXG5cdFx0XHRcdFx0YVJlc2V0czogYS5yZWMucmVzZXRzLFxuXHRcdFx0XHRcdGJTZW5kczogYi5yZWMuc2VuZHMsXG5cdFx0XHRcdFx0YlJlc2V0czogYi5yZWMucmVzZXRzLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0YVNlbmRzOiBbeyBwcm9tcHQ6ICdoZWxsby1hJywgdHVybklkOiAndHVybi1hJywgc2VuZGVyQ2xpZW50SWQ6ICdjbGllbnQtMScgfV0sXG5cdFx0XHRcdFx0YVJlc2V0czogW3sgdHVybklkOiAndHVybi1hJywgc2VuZGVyQ2xpZW50SWQ6ICdjbGllbnQtMScgfV0sXG5cdFx0XHRcdFx0YlNlbmRzOiBbXSxcblx0XHRcdFx0XHRiUmVzZXRzOiBbXSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VuZE1lc3NhZ2UgdGhyb3dzIGZvciBhIHBlZXIgY2hhdCB3aXRoIG5vIGJhY2tpbmcgY2hhdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3JvdXRlLWdob3N0Jyk7XG5cdFx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdnaG9zdCcpKTtcblx0XHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdFx0KCkgPT4gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdFVyaSwgJ2hpJywgdW5kZWZpbmVkKSxcblx0XHRcdFx0XHQvdW5rbm93biBjaGF0Lyxcblx0XHRcdFx0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjaGFuZ2VNb2RlbCBhcHBsaWVzIHRvIHRoZSB0YXJnZXRlZCBwZWVyIGNoYXQgb25seScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ21vZGVsLXJvdXRlJyk7XG5cdFx0XHRcdGNvbnN0IGNoYXRBID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci1hJykpO1xuXHRcdFx0XHRjb25zdCBjaGF0QiA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItYicpKTtcblx0XHRcdFx0Y29uc3QgYSA9IG1ha2VGYWtlQ2hhdFNlc3Npb24oc2Vzc2lvbiwgJ3Nkay1hJyk7XG5cdFx0XHRcdGNvbnN0IGIgPSBtYWtlRmFrZUNoYXRTZXNzaW9uKHNlc3Npb24sICdzZGstYicpO1xuXHRcdFx0XHRzZXRQZWVyQ2hhdFN0dWIoYWdlbnQsIGNoYXRBLCBhLmZha2UpO1xuXHRcdFx0XHRzZXRQZWVyQ2hhdFN0dWIoYWdlbnQsIGNoYXRCLCBiLmZha2UpO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLmNoYW5nZU1vZGVsKGNoYXRBLCB7IGlkOiAnbW9kZWwteCcgfSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0YU1vZGVsczogYS5yZWMubW9kZWxDYWxscy5tYXAobSA9PiBtLmlkKSxcblx0XHRcdFx0XHRiTW9kZWxzOiBiLnJlYy5tb2RlbENhbGxzLm1hcChtID0+IG0uaWQpLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0YU1vZGVsczogWydtb2RlbC14J10sXG5cdFx0XHRcdFx0Yk1vZGVsczogW10sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NoYW5nZUFnZW50IHJlc29sdmVzIGFuZCBhcHBsaWVzIHRoZSBhZ2VudCB0byB0aGUgdGFyZ2V0ZWQgcGVlciBjaGF0LCBhbmQgY2xlYXJzIGl0IHdpdGggdW5kZWZpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnYWdlbnQtcm91dGUnKTtcblx0XHRcdFx0Y29uc3QgY2hhdEEgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLWEnKSk7XG5cdFx0XHRcdGNvbnN0IGEgPSBtYWtlRmFrZUNoYXRTZXNzaW9uKHNlc3Npb24sICdzZGstYScpO1xuXHRcdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIENoYXRJbnRlcm5hbHM7XG5cdFx0XHRcdHNldFBlZXJDaGF0U3R1YihhZ2VudCwgY2hhdEEsIGEuZmFrZSk7XG5cdFx0XHRcdGludGVybmFscy5fcmVzb2x2ZUFnZW50TmFtZSA9IChfc25hcHNob3QsIHNlbGVjdGlvbikgPT4gc2VsZWN0aW9uLnVyaSA9PT0gJ2FnZW50Oi8veCcgPyAnUmVzb2x2ZWQgQWdlbnQnIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLmNoYW5nZUFnZW50KGNoYXRBLCB7IHVyaTogJ2FnZW50Oi8veCcgfSk7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLmNoYW5nZUFnZW50KGNoYXRBLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYS5yZWMuYWdlbnRDYWxscywgWydSZXNvbHZlZCBBZ2VudCcsIHVuZGVmaW5lZF0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JvdW5kLXRyaXBzIHBlZXIgY2hhdHMgdGhyb3VnaCBwcm92aWRlckRhdGEgKyBtYXRlcmlhbGl6ZUNoYXQgYW5kIHJlc3VtZXMgcGVyLWNoYXQgaGlzdG9yeSBhZnRlciBhIHJlc3RhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBBIHNpbmdsZSBzZXNzaW9uIGRhdGEgc2VydmljZSBpcyBzaGFyZWQgYWNyb3NzIHRoZSB0d28gYWdlbnRcblx0XHRcdC8vIGluc3RhbmNlcyB0byBtb2RlbCB0aGUgb24tZGlzayBzdG9yZSBzdXJ2aXZpbmcgYSBwcm9jZXNzIHJlc3RhcnQuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdyZXN0b3JlLXJ0Jyk7XG5cdFx0XHRjb25zdCBjcmVhdGVkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdFx0XHRjb25zdCBwcm92aWRlckRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblxuXHRcdFx0Ly8gLS0tLSBwcm9jZXNzICMxOiBjcmVhdGUgdHdvIHBlZXIgY2hhdHMsIGNhcHR1cmluZyB0aGUgb3BhcXVlXG5cdFx0XHQvLyBwcm92aWRlckRhdGEgYmxvYiB0aGUgb3JjaGVzdHJhdG9yIHdvdWxkIHBlcnNpc3QgZm9yIGVhY2ggLS0tLVxuXHRcdFx0Y29uc3QgYWdlbnQxID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50MS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQxLmNyZWF0ZVNlc3Npb24oeyBzZXNzaW9uLCB3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSB9KTtcblx0XHRcdFx0Y29uc3QgaW50ZXJuYWxzMSA9IGFnZW50MSBhcyB1bmtub3duIGFzIENoYXRJbnRlcm5hbHM7XG5cdFx0XHRcdGludGVybmFsczEuX2NyZWF0ZUFnZW50U2Vzc2lvbiA9IChsYXVuY2hQbGFuLCBfZGlyLCBfYWMsIGlkZW50aXR5KSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlkZW50aXR5KSB7XG5cdFx0XHRcdFx0XHRjcmVhdGVkW2lkZW50aXR5LmNoYXRDaGFubmVsVXJpLmF1dGhvcml0eV0gPSBsYXVuY2hQbGFuLnNlc3Npb25JZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG1ha2VGYWtlQ2hhdFNlc3Npb24oc2Vzc2lvbiwgbGF1bmNoUGxhbi5zZXNzaW9uSWQsIHVuZGVmaW5lZCwgbGF1bmNoUGxhbi5zaGVsbE1hbmFnZXIpLmZha2U7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHBlZXJBVXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci1hJykpO1xuXHRcdFx0XHRjb25zdCBwZWVyQlVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItYicpKTtcblx0XHRcdFx0Y29uc3QgcmVzQSA9IGF3YWl0IGFnZW50MS5jaGF0cy5jcmVhdGVDaGF0KHBlZXJBVXJpLCB7fSk7XG5cdFx0XHRcdGNvbnN0IHJlc0IgPSBhd2FpdCBhZ2VudDEuY2hhdHMuY3JlYXRlQ2hhdChwZWVyQlVyaSwge30pO1xuXHRcdFx0XHRwcm92aWRlckRhdGFbJ3BlZXItYSddID0gcmVzQSEucHJvdmlkZXJEYXRhITtcblx0XHRcdFx0cHJvdmlkZXJEYXRhWydwZWVyLWInXSA9IHJlc0IhLnByb3ZpZGVyRGF0YSE7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQxKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gLS0tLSBwcm9jZXNzICMyOiBmcmVzaCBhZ2VudCwgZW1wdHkgaW4tbWVtb3J5IHN0YXRlIC0tLS1cblx0XHRcdGNvbnN0IGFnZW50MiA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSkgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudDIuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdC8vIFRoZSBvcmNoZXN0cmF0b3IgcmUtY3JlYXRlcyB0aGUgKHByb3Zpc2lvbmFsKSBwYXJlbnQgc2Vzc2lvbiBvblxuXHRcdFx0XHQvLyByZXN0b3JlOyB0aGlzIHNlZWRzIHRoZSB3b3JraW5nIGRpcmVjdG9yeSB0aGUgcGVlci1jaGF0IHJlc3VtZVxuXHRcdFx0XHQvLyBwYXRoIG5lZWRzLlxuXHRcdFx0XHRhd2FpdCBhZ2VudDIuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldIH0pO1xuXG5cdFx0XHRcdGNvbnN0IGludGVybmFsczIgPSBhZ2VudDIgYXMgdW5rbm93biBhcyBDaGF0SW50ZXJuYWxzO1xuXHRcdFx0XHRjb25zdCBwZWVyQSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItYScpKTtcblx0XHRcdFx0Y29uc3QgcGVlckIgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLWInKSk7XG5cdFx0XHRcdC8vIFRoZSBvcmNoZXN0cmF0b3IgaGFuZHMgZWFjaCBwZXJzaXN0ZWQgYmxvYiBiYWNrIHRvIHRoZSBhZ2VudC5cblx0XHRcdFx0YXdhaXQgYWdlbnQyLm1hdGVyaWFsaXplQ2hhdChwZWVyQSwgcHJvdmlkZXJEYXRhWydwZWVyLWEnXSk7XG5cdFx0XHRcdGF3YWl0IGFnZW50Mi5tYXRlcmlhbGl6ZUNoYXQocGVlckIsIHByb3ZpZGVyRGF0YVsncGVlci1iJ10pO1xuXG5cdFx0XHRcdGNvbnN0IHBlZXJBSGlzdG9yeTogcmVhZG9ubHkgVHVybltdID0gW3sgaWQ6ICd0dXJuLTEnIH0gYXMgdW5rbm93biBhcyBUdXJuXTtcblx0XHRcdFx0bGV0IHJlc3VtZWQ6IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aW50ZXJuYWxzMi5fY3JlYXRlQWdlbnRTZXNzaW9uID0gKGxhdW5jaFBsYW4pID0+IHtcblx0XHRcdFx0XHRyZXN1bWVkID0gbGF1bmNoUGxhbjtcblx0XHRcdFx0XHRyZXR1cm4gbWFrZUZha2VDaGF0U2Vzc2lvbihzZXNzaW9uLCBsYXVuY2hQbGFuLnNlc3Npb25JZCwgYXN5bmMgKCkgPT4gcGVlckFIaXN0b3J5LCBsYXVuY2hQbGFuLnNoZWxsTWFuYWdlcikuZmFrZTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRhd2FpdCBhZ2VudDIuY2hhdHMuc2VuZE1lc3NhZ2UocGVlckEsICdhZnRlciByZXN0YXJ0JywgdW5kZWZpbmVkKTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeSA9IGF3YWl0IGdldFBlZXJDaGF0U3R1YihhZ2VudDIsIHBlZXJBKSEuZ2V0TWVzc2FnZXMoKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRtYXRlcmlhbGl6ZWRCYWNraW5nczogW2ludGVybmFsczIuX2NoYXRCYWNraW5ncy5nZXQocGVlckEudG9TdHJpbmcoKSksIGludGVybmFsczIuX2NoYXRCYWNraW5ncy5nZXQocGVlckIudG9TdHJpbmcoKSldLFxuXHRcdFx0XHRcdHJlc3VtZUtpbmQ6IHJlc3VtZWQ/LmtpbmQsXG5cdFx0XHRcdFx0cmVzdW1lU2Vzc2lvbklkOiByZXN1bWVkPy5zZXNzaW9uSWQsXG5cdFx0XHRcdFx0ZXhwZWN0ZWRTZXNzaW9uSWQ6IGNyZWF0ZWRbJ3BlZXItYSddLFxuXHRcdFx0XHRcdGhpc3RvcnlMZW46IGhpc3RvcnkubGVuZ3RoLFxuXHRcdFx0XHRcdHRyYWNrZWQ6IGhhc1BlZXJDaGF0U3R1YihhZ2VudDIsIHBlZXJBKSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdG1hdGVyaWFsaXplZEJhY2tpbmdzOiBbeyBzZGtTZXNzaW9uSWQ6IGNyZWF0ZWRbJ3BlZXItYSddIH0sIHsgc2RrU2Vzc2lvbklkOiBjcmVhdGVkWydwZWVyLWInXSB9XSxcblx0XHRcdFx0XHRyZXN1bWVLaW5kOiAncmVzdW1lJyxcblx0XHRcdFx0XHRyZXN1bWVTZXNzaW9uSWQ6IGNyZWF0ZWRbJ3BlZXItYSddLFxuXHRcdFx0XHRcdGV4cGVjdGVkU2Vzc2lvbklkOiBjcmVhdGVkWydwZWVyLWEnXSxcblx0XHRcdFx0XHRoaXN0b3J5TGVuOiAxLFxuXHRcdFx0XHRcdHRyYWNrZWQ6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50Mik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRlcmlhbGl6ZUNoYXQgZmFsbHMgYmFjayB0byB0aGUgbGVnYWN5IGNvcGlsb3QuY2hhdHMgY2F0YWxvZyB3aGVuIHByb3ZpZGVyRGF0YSBpcyB1bmRlZmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBzZXNzaW9uRGF0YVNlcnZpY2UsIGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSkgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbGVnYWN5LW1hdGVyaWFsaXplJyk7XG5cdFx0XHRcdGNvbnN0IGRiID0gc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShzZXNzaW9uKTtcblx0XHRcdFx0YXdhaXQgZGIub2JqZWN0LnNldE1ldGFkYXRhKCdjb3BpbG90LmNoYXRzJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdCdwZWVyLWEnOiB7IHNka1Nlc3Npb25JZDogJ2xlZ2FjeS1zZGsnLCBtb2RlbDogeyBpZDogJ2dwdC1sZWdhY3knIH0gfSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci1hJykpO1xuXHRcdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIENoYXRJbnRlcm5hbHM7XG5cblx0XHRcdFx0Ly8gdW5kZWZpbmVkIGJsb2IgLT4gYWdlbnQgcmVjb3ZlcnMgdGhlIGJhY2tpbmcgZnJvbSBpdHMgb3duIGNhdGFsb2cuXG5cdFx0XHRcdGF3YWl0IGFnZW50Lm1hdGVyaWFsaXplQ2hhdChjaGF0VXJpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHQvLyBBIGNvcnJ1cHQgYmxvYiBpcyBkcm9wcGVkIChubyBiYWNraW5nIHJlY29yZGVkKS5cblx0XHRcdFx0Y29uc3QgY29ycnVwdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItY29ycnVwdCcpKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQubWF0ZXJpYWxpemVDaGF0KGNvcnJ1cHRVcmksICdub3QganNvbicpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGxlZ2FjeTogaW50ZXJuYWxzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXRVcmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0Y29ycnVwdDogaW50ZXJuYWxzLl9jaGF0QmFja2luZ3MuaGFzKGNvcnJ1cHRVcmkudG9TdHJpbmcoKSksXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRsZWdhY3k6IHsgc2RrU2Vzc2lvbklkOiAnbGVnYWN5LXNkaycsIG1vZGVsOiB7IGlkOiAnZ3B0LWxlZ2FjeScgfSB9LFxuXHRcdFx0XHRcdGNvcnJ1cHQ6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjaGFuZ2VNb2RlbCBvbiBhIHBlZXIgY2hhdCByZWZyZXNoZXMgaXRzIGJhY2tpbmcgYW5kIGZpcmVzIG9uRGlkQ2hhbmdlQ2hhdERhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtb2RlbC1ibG9iJyk7XG5cdFx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLWEnKSk7XG5cdFx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgQ2hhdEludGVybmFscztcblx0XHRcdFx0c2V0UGVlckNoYXRTdHViKGFnZW50LCBjaGF0VXJpLCBtYWtlRmFrZUNoYXRTZXNzaW9uKHNlc3Npb24sICdzZGstYScpLmZha2UpO1xuXHRcdFx0XHRpbnRlcm5hbHMuX2NoYXRCYWNraW5ncy5zZXQoY2hhdFVyaS50b1N0cmluZygpLCB7IHNka1Nlc3Npb25JZDogJ3Nkay1hJyB9KTtcblxuXHRcdFx0XHRjb25zdCBldmVudHM6IHsgY2hhdDogc3RyaW5nOyBwcm92aWRlckRhdGE6IHVua25vd24gfVtdID0gW107XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZENoYW5nZUNoYXREYXRhKGUgPT4gZXZlbnRzLnB1c2goeyBjaGF0OiBlLmNoYXQudG9TdHJpbmcoKSwgcHJvdmlkZXJEYXRhOiBKU09OLnBhcnNlKGUucHJvdmlkZXJEYXRhKSB9KSkpO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLmNoYW5nZU1vZGVsKGNoYXRVcmksIHsgaWQ6ICdtb2RlbC14JyB9KTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRiYWNraW5nOiBpbnRlcm5hbHMuX2NoYXRCYWNraW5ncy5nZXQoY2hhdFVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0XHRldmVudHMsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRiYWNraW5nOiB7IHNka1Nlc3Npb25JZDogJ3Nkay1hJywgbW9kZWw6IHsgaWQ6ICdtb2RlbC14JyB9IH0sXG5cdFx0XHRcdFx0ZXZlbnRzOiBbeyBjaGF0OiBjaGF0VXJpLnRvU3RyaW5nKCksIHByb3ZpZGVyRGF0YTogeyBzZGtTZXNzaW9uSWQ6ICdzZGstYScsIG1vZGVsOiB7IGlkOiAnbW9kZWwteCcgfSB9IH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFRoZSBjaGF0LWFkZHJlc3NlZCBzdXJmYWNlICh7QGxpbmsgSUFnZW50LmNoYXRzfSkgaXMgYSB0aGluIGFkYXB0ZXIgb3ZlclxuXHQvLyB0aGUgbGVnYWN5IGAoc2Vzc2lvbiwgY2hhdD8pYCBtZXRob2RzLiBUaGVzZSB0ZXN0cyB2ZXJpZnkgaXQgcmVzb2x2ZXMgYVxuXHQvLyBzaW5nbGUgY2hhdCBVUkkgYmFjayB0byB0aGUgcmlnaHQgYChzZXNzaW9uLCBjaGF0KWAgdGFyZ2V0IFx1MjAxNCBhIHBlZXJcblx0Ly8gYGFocC1jaGF0YCBVUkkga2VlcHMgaXRzIG93biBpZGVudGl0eSwgYSBzZXNzaW9uIFVSSSBtYXBzIHRvIHRoZVxuXHQvLyBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0IFx1MjAxNCBhbmQgdGhlbiBkZWxlZ2F0ZXMgdG8gdGhlIGxlZ2FjeSBpbXBsZW1lbnRhdGlvbi5cblx0c3VpdGUoJ2NoYXQgc3VyZmFjZSAoSUFnZW50Q2hhdHMpJywgKCkgPT4ge1xuXG5cdFx0dHlwZSBDb252SW50ZXJuYWxzID0ge1xuXHRcdFx0X3Nlc3Npb25zOiBNYXA8c3RyaW5nLCBDb3BpbG90U2Vzc2lvbkVudHJ5Pjtcblx0XHRcdF9wcm92aXNpb25hbFNlc3Npb25zOiBNYXA8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdF9jcmVhdGVBZ2VudFNlc3Npb246IChsYXVuY2hQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4sIGRpcjogVVJJIHwgdW5kZWZpbmVkLCBhY3RpdmVDbGllbnQ6IHVua25vd24sIGlkZW50aXR5PzogeyBzZXNzaW9uVXJpOiBVUkk7IGNoYXRDaGFubmVsVXJpOiBVUkkgfSkgPT4gQ29waWxvdEFnZW50U2Vzc2lvbjtcblx0XHR9O1xuXG5cdFx0aW50ZXJmYWNlIElGYWtlQ29udlJlY29yZGVyIHtcblx0XHRcdHJlYWRvbmx5IHNlbmRzOiB7IHByb21wdDogc3RyaW5nOyB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgc2VuZGVyQ2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9W107XG5cdFx0XHRyZWFkb25seSByZXNldHM6IHsgdHVybklkOiBzdHJpbmc7IHNlbmRlckNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdO1xuXHRcdFx0cmVhZG9ubHkgbW9kZWxDYWxsczogc3RyaW5nW107XG5cdFx0XHRyZWFkb25seSBhZ2VudENhbGxzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdO1xuXHRcdFx0YWJvcnRlZDogbnVtYmVyO1xuXHRcdFx0ZGlzcG9zZWQ6IGJvb2xlYW47XG5cdFx0fVxuXG5cdFx0LyoqXG5cdFx0ICogSW5zdGFsbHMgYSByZWNvcmRpbmcgZmFrZSB7QGxpbmsgQ29waWxvdEFnZW50U2Vzc2lvbn0gYXMgYSBwZWVyIGNoYXRcblx0XHQgKiAoaG9zdGVkIG9uIHRoZSBvd25pbmcgc2Vzc2lvbidzIGVudHJ5KSBvciBhcyBhIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQsXG5cdFx0ICoga2V5ZWQgYXMgdGhlIHJlYWwgYWdlbnQgd291bGQsIHNvIHRoZSBjaGF0IGFkYXB0ZXIgY2FuIGRyaXZlXG5cdFx0ICogdGhlIHJlYWwgbGVnYWN5IG1ldGhvZHMuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gaW5zdGFsbEZha2UoYWdlbnQ6IENvcGlsb3RBZ2VudCwga2V5OiBzdHJpbmcsIHRhcmdldDogJ2NoYXQnIHwgJ3Nlc3Npb24nLCBzZXNzaW9uVXJpOiBVUkkpOiBJRmFrZUNvbnZSZWNvcmRlciB7XG5cdFx0XHRjb25zdCByZWM6IElGYWtlQ29udlJlY29yZGVyID0geyBzZW5kczogW10sIHJlc2V0czogW10sIG1vZGVsQ2FsbHM6IFtdLCBhZ2VudENhbGxzOiBbXSwgYWJvcnRlZDogMCwgZGlzcG9zZWQ6IGZhbHNlIH07XG5cdFx0XHRjb25zdCBmYWtlID0ge1xuXHRcdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0XHRzZXNzaW9uSWQ6IGBzZGstJHtrZXl9YCxcblx0XHRcdFx0YXBwbGllZFNuYXBzaG90OiB7IHRvb2xzOiBbXSwgcGx1Z2luczogW10sIG1jcFNlcnZlcnM6IHt9IH0gc2F0aXNmaWVzIElBY3RpdmVDbGllbnRTbmFwc2hvdCxcblx0XHRcdFx0YXN5bmMgc2VuZChwcm9tcHQ6IHN0cmluZywgX2F0dGFjaG1lbnRzOiB1bmtub3duLCB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgX21vZGU6IHVua25vd24sIHNlbmRlckNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRyZWMuc2VuZHMucHVzaCh7IHByb21wdCwgdHVybklkLCBzZW5kZXJDbGllbnRJZCB9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVzZXRUdXJuU3RhdGUodHVybklkOiBzdHJpbmcsIHNlbmRlckNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHsgcmVjLnJlc2V0cy5wdXNoKHsgdHVybklkLCBzZW5kZXJDbGllbnRJZCB9KTsgfSxcblx0XHRcdFx0YXN5bmMgc2V0TW9kZWwoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyByZWMubW9kZWxDYWxscy5wdXNoKGlkKTsgfSxcblx0XHRcdFx0YXN5bmMgc2V0QWdlbnQobmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7IHJlYy5hZ2VudENhbGxzLnB1c2gobmFtZSk7IH0sXG5cdFx0XHRcdGFzeW5jIGFib3J0KCk6IFByb21pc2U8dm9pZD4geyByZWMuYWJvcnRlZCsrOyB9LFxuXHRcdFx0XHRhc3luYyBnZXRNZXNzYWdlcygpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4geyByZXR1cm4gW3sgaWQ6IGB0dXJuLSR7a2V5fWAgfSBhcyB1bmtub3duIGFzIFR1cm5dOyB9LFxuXHRcdFx0XHRoYW5kbGVDbGllbnRUb29sQ2FsbENvbXBsZXRlKCk6IHZvaWQgeyB9LFxuXHRcdFx0XHRkaXNwb3NlKCk6IHZvaWQgeyByZWMuZGlzcG9zZWQgPSB0cnVlOyB9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RBZ2VudFNlc3Npb247XG5cdFx0XHRpZiAodGFyZ2V0ID09PSAnY2hhdCcpIHtcblx0XHRcdFx0c2V0UGVlckNoYXRTdHViKGFnZW50LCBVUkkucGFyc2Uoa2V5KSwgZmFrZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZXREZWZhdWx0U2Vzc2lvblN0dWIoYWdlbnQsIGtleSwgZmFrZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVjO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIFN0dWJzIGBfY3JlYXRlQWdlbnRTZXNzaW9uYCAodGhlIFNESy1iYWNrZWQgbGF1bmNoIHNlYW0pIHNvIHBlZXItY2hhdFxuXHRcdCAqIGNyZWF0aW9uL2Zvcmsgc3RheXMgaW4tbWVtb3J5OiBpdCByZXR1cm5zIGEgbWluaW1hbCBmYWtlIHdob3NlXG5cdFx0ICogYHNlc3Npb25JZGAgZWNob2VzIHRoZSBsYXVuY2ggcGxhbiwgd2hpY2ggaXMgd2hhdCBgY3JlYXRlQ2hhdGAgcmVjb3Jkc1xuXHRcdCAqIGFzIHRoZSBjaGF0J3MgYmFja2luZy5cblx0XHQgKi9cblx0XHRmdW5jdGlvbiBzdHViQmFja2luZ1Nlc3Npb24oYWdlbnQ6IENvcGlsb3RBZ2VudCk6IHZvaWQge1xuXHRcdFx0KGFnZW50IGFzIHVua25vd24gYXMgQ29udkludGVybmFscykuX2NyZWF0ZUFnZW50U2Vzc2lvbiA9IChsYXVuY2hQbGFuLCBfZGlyLCBfYWMsIGlkZW50aXR5KSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c2Vzc2lvblVyaTogaWRlbnRpdHk/LnNlc3Npb25VcmkgPz8gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsIGxhdW5jaFBsYW4uc2Vzc2lvbklkKSxcblx0XHRcdFx0XHRzZXNzaW9uSWQ6IGxhdW5jaFBsYW4uc2Vzc2lvbklkLFxuXHRcdFx0XHRcdGFwcGxpZWRTbmFwc2hvdDogeyB0b29sczogW10sIHBsdWdpbnM6IFtdLCBtY3BTZXJ2ZXJzOiB7fSB9IHNhdGlzZmllcyBJQWN0aXZlQ2xpZW50U25hcHNob3QsXG5cdFx0XHRcdFx0YXN5bmMgaW5pdGlhbGl6ZVNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7IH0sXG5cdFx0XHRcdFx0YXN5bmMgcmVtYXBUdXJuSWRzKCk6IFByb21pc2U8dm9pZD4geyB9LFxuXHRcdFx0XHRcdGFzeW5jIGdldE1lc3NhZ2VzKCk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7IHJldHVybiBbXTsgfSxcblx0XHRcdFx0XHRoYW5kbGVDbGllbnRUb29sQ2FsbENvbXBsZXRlKCk6IHZvaWQgeyB9LFxuXHRcdFx0XHRcdGRpc3Bvc2UoKTogdm9pZCB7IGxhdW5jaFBsYW4uc2hlbGxNYW5hZ2VyPy5kaXNwb3NlKCk7IH0sXG5cdFx0XHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90QWdlbnRTZXNzaW9uO1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdjcmVhdGVTZXNzaW9uIG1pbnRzIGEgcHJvdmlzaW9uYWwgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSkgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzY29wZS1jcmVhdGUnKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldIH0pO1xuXHRcdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIENvbnZJbnRlcm5hbHM7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdHNlc3Npb246IHJlc3VsdC5zZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0cHJvdmlzaW9uYWw6IGludGVybmFscy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5oYXMoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHNlc3Npb246IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdFx0XHRwcm92aXNpb25hbDogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZVNlc3Npb24gdGVhcnMgZG93biBhIHByb3Zpc2lvbmFsIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10pIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnc2NvcGUtZGlzcG9zZScpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHsgc2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yaWVzOiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKV0gfSk7XG5cdFx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgQ29udkludGVybmFscztcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludGVybmFscy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5oYXMoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSwgdHJ1ZSk7XG5cblx0XHRcdFx0YXdhaXQgYWdlbnQuZGlzcG9zZVNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludGVybmFscy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5oYXMoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSwgZmFsc2UpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZUNoYXQgY3JlYXRlcyBhIHBlZXIgY2hhdCBhbmQgcmV0dXJucyBpdHMgcHJvdmlkZXJEYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBjb3BpbG90Q2xpZW50OiBuZXcgVGVzdENvcGlsb3RDbGllbnQoW10pIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2NvbnYtY3JlYXRlJyk7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oeyBzZXNzaW9uLCB3b3JraW5nRGlyZWN0b3JpZXM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSB9KTtcblx0XHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItYScpKTtcblxuXHRcdFx0XHRzdHViQmFja2luZ1Nlc3Npb24oYWdlbnQpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jaGF0cy5jcmVhdGVDaGF0KGNoYXRVcmksIHsgbW9kZWw6IHsgaWQ6ICdncHQteCcgfSB9KTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHR0cmFja2VkOiBoYXNQZWVyQ2hhdFN0dWIoYWdlbnQsIGNoYXRVcmkpLFxuXHRcdFx0XHRcdGhhc1Byb3ZpZGVyRGF0YTogISEocmVzdWx0ICYmIHJlc3VsdC5wcm92aWRlckRhdGEpLFxuXHRcdFx0XHRcdG1vZGVsOiByZXN1bHQgPyAoSlNPTi5wYXJzZShyZXN1bHQucHJvdmlkZXJEYXRhISkgYXMgeyBtb2RlbD86IE1vZGVsU2VsZWN0aW9uIH0pLm1vZGVsIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0dHJhY2tlZDogdHJ1ZSxcblx0XHRcdFx0XHRoYXNQcm92aWRlckRhdGE6IHRydWUsXG5cdFx0XHRcdFx0bW9kZWw6IHsgaWQ6ICdncHQteCcgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yayBkZWxlZ2F0ZXMgdG8gY3JlYXRlQ2hhdCB3aXRoIHRoZSBmb3JrIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdjb252LWZvcmsnKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7IHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvd29ya3NwYWNlJyldIH0pO1xuXHRcdFx0XHRpbnN0YWxsRmFrZShhZ2VudCwgQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLCAnc2Vzc2lvbicsIHNlc3Npb24pO1xuXG5cdFx0XHRcdGNvbnN0IGZvcmtBcmdzOiB7IHR1cm5JZDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdFx0XHQoYWdlbnQgYXMgdW5rbm93biBhcyB7IF9mb3JrU2RrQ2hhdDogKGNsaWVudDogdW5rbm93biwgc291cmNlRW50cnk6IHVua25vd24sIHR1cm5JZDogc3RyaW5nKSA9PiBQcm9taXNlPHsgc2Vzc2lvbklkOiBzdHJpbmc7IGluaGVyaXRlZFR1cm5Db3VudDogbnVtYmVyIH0+IH0pLl9mb3JrU2RrQ2hhdCA9IGFzeW5jIChfYywgX3MsIHR1cm5JZCkgPT4ge1xuXHRcdFx0XHRcdGZvcmtBcmdzLnB1c2goeyB0dXJuSWQgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc2Vzc2lvbklkOiAnZm9ya2VkLXNkay1pZCcsIGluaGVyaXRlZFR1cm5Db3VudDogMCB9O1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRzdHViQmFja2luZ1Nlc3Npb24oYWdlbnQpO1xuXG5cdFx0XHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLWZvcmsnKSk7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZTogSUFnZW50Q3JlYXRlQ2hhdEZvcmtTb3VyY2UgPSB7IHNvdXJjZTogVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpLCB0dXJuSWQ6ICd0MScgfTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY2hhdHMuZm9yayhjaGF0VXJpLCBzb3VyY2UpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGZvcmtBcmdzLFxuXHRcdFx0XHRcdHRyYWNrZWQ6IGhhc1BlZXJDaGF0U3R1YihhZ2VudCwgY2hhdFVyaSksXG5cdFx0XHRcdFx0cHJvdmlkZXJEYXRhOiByZXN1bHQgPyBKU09OLnBhcnNlKHJlc3VsdC5wcm92aWRlckRhdGEhKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGZvcmtBcmdzOiBbeyB0dXJuSWQ6ICd0MScgfV0sXG5cdFx0XHRcdFx0dHJhY2tlZDogdHJ1ZSxcblx0XHRcdFx0XHRwcm92aWRlckRhdGE6IHsgc2RrU2Vzc2lvbklkOiAnZm9ya2VkLXNkay1pZCcgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VuZE1lc3NhZ2Ugcm91dGVzIGEgcGVlciBjaGF0IFVSSSB0byB0aGUgcGVlciBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnY29udi1zZW5kLXBlZXInKTtcblx0XHRcdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItYScpKTtcblx0XHRcdFx0Y29uc3QgcmVjID0gaW5zdGFsbEZha2UoYWdlbnQsIGNoYXRVcmkudG9TdHJpbmcoKSwgJ2NoYXQnLCBzZXNzaW9uKTtcblxuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShjaGF0VXJpLCAnaGVsbG8tcGVlcicsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAndHVybi0xJywgJ2NsaWVudC0xJyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0c2VuZHM6IHJlYy5zZW5kcyxcblx0XHRcdFx0XHRyZXNldHM6IHJlYy5yZXNldHMsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRzZW5kczogW3sgcHJvbXB0OiAnaGVsbG8tcGVlcicsIHR1cm5JZDogJ3R1cm4tMScsIHNlbmRlckNsaWVudElkOiAnY2xpZW50LTEnIH1dLFxuXHRcdFx0XHRcdHJlc2V0czogW3sgdHVybklkOiAndHVybi0xJywgc2VuZGVyQ2xpZW50SWQ6ICdjbGllbnQtMScgfV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlbmRNZXNzYWdlIHJvdXRlcyBhIHNjb3BlIChzZXNzaW9uKSBVUkkgdG8gdGhlIGRlZmF1bHQgY2hhdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2NvbnYtc2VuZC1kZWZhdWx0Jyk7XG5cdFx0XHRcdGNvbnN0IHJlYyA9IGluc3RhbGxGYWtlKGFnZW50LCBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksICdzZXNzaW9uJywgc2Vzc2lvbik7XG5cblx0XHRcdFx0YXdhaXQgYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoZGVmYXVsdENoYXRVcmkoc2Vzc2lvbiksICdoZWxsby1kZWZhdWx0JywgdW5kZWZpbmVkLCB1bmRlZmluZWQsICd0dXJuLWQnLCAnY2xpZW50LWQnKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYy5zZW5kcywgW3sgcHJvbXB0OiAnaGVsbG8tZGVmYXVsdCcsIHR1cm5JZDogJ3R1cm4tZCcsIHNlbmRlckNsaWVudElkOiAnY2xpZW50LWQnIH1dKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhYm9ydCwgY2hhbmdlTW9kZWwsIGFuZCBjaGFuZ2VBZ2VudCByb3V0ZSBhIHBlZXIgVVJJIHRvIHRoZSBwZWVyIGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdjb252LW9wcycpO1xuXHRcdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci1hJykpO1xuXHRcdFx0XHRjb25zdCByZWMgPSBpbnN0YWxsRmFrZShhZ2VudCwgY2hhdFVyaS50b1N0cmluZygpLCAnY2hhdCcsIHNlc3Npb24pO1xuXHRcdFx0XHQoYWdlbnQgYXMgdW5rbm93biBhcyB7IF9yZXNvbHZlQWdlbnROYW1lOiAoc25hcDogSUFjdGl2ZUNsaWVudFNuYXBzaG90LCBhOiBBZ2VudFNlbGVjdGlvbikgPT4gc3RyaW5nIHwgdW5kZWZpbmVkIH0pLl9yZXNvbHZlQWdlbnROYW1lID0gKF9zbmFwLCBzZWwpID0+IHNlbC51cmkgPT09ICdhZ2VudDovL3gnID8gJ1Jlc29sdmVkIEFnZW50JyA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5hYm9ydChjaGF0VXJpKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY2hhdHMuY2hhbmdlTW9kZWwoY2hhdFVyaSwgeyBpZDogJ21vZGVsLXgnIH0pO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5jaGFuZ2VBZ2VudChjaGF0VXJpLCB7IHVyaTogJ2FnZW50Oi8veCcgfSk7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLmNoYW5nZUFnZW50KGNoYXRVcmksIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0YWJvcnRlZDogcmVjLmFib3J0ZWQsXG5cdFx0XHRcdFx0bW9kZWxDYWxsczogcmVjLm1vZGVsQ2FsbHMsXG5cdFx0XHRcdFx0YWdlbnRDYWxsczogcmVjLmFnZW50Q2FsbHMsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRhYm9ydGVkOiAxLFxuXHRcdFx0XHRcdG1vZGVsQ2FsbHM6IFsnbW9kZWwteCddLFxuXHRcdFx0XHRcdGFnZW50Q2FsbHM6IFsnUmVzb2x2ZWQgQWdlbnQnLCB1bmRlZmluZWRdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRNZXNzYWdlcyByZXR1cm5zIHRoZSBwZWVyIGNoYXQgaGlzdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2NvbnYtaGlzdG9yeScpO1xuXHRcdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci1hJykpO1xuXHRcdFx0XHRpbnN0YWxsRmFrZShhZ2VudCwgY2hhdFVyaS50b1N0cmluZygpLCAnY2hhdCcsIHNlc3Npb24pO1xuXG5cdFx0XHRcdGNvbnN0IHR1cm5zID0gYXdhaXQgYWdlbnQuY2hhdHMuZ2V0TWVzc2FnZXMoY2hhdFVyaSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodCA9PiB0LmlkKSwgW2B0dXJuLSR7Y2hhdFVyaS50b1N0cmluZygpfWBdKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlQ2hhdCBkaXNwb3NlcyB0aGUgcGVlciBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogY2xpZW50IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2NvbnYtZGlzcG9zZScpO1xuXHRcdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uLCAncGVlci1hJykpO1xuXHRcdFx0XHRjb25zdCByZWMgPSBpbnN0YWxsRmFrZShhZ2VudCwgY2hhdFVyaS50b1N0cmluZygpLCAnY2hhdCcsIHNlc3Npb24pO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLmRpc3Bvc2VDaGF0KGNoYXRVcmkpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGRpc3Bvc2VkOiByZWMuZGlzcG9zZWQsXG5cdFx0XHRcdFx0dHJhY2tlZDogaGFzUGVlckNoYXRTdHViKGFnZW50LCBjaGF0VXJpKSxcblx0XHRcdFx0XHRkZWxldGVkOiBjbGllbnQuZGVsZXRlZFNlc3Npb25JZHMsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRkaXNwb3NlZDogdHJ1ZSxcblx0XHRcdFx0XHR0cmFja2VkOiBmYWxzZSxcblx0XHRcdFx0XHRkZWxldGVkOiBbJ3Nkay0nICsgY2hhdFVyaS50b1N0cmluZygpXSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBSZWdyZXNzaW9uIGZvciB0aGUgIzMxOTUxNiBpbmNpZGVudDogYSB3aW5kb3cgcmVsb2FkIHJlY29ubmVjdHMgd2l0aCBhXG5cdC8vIE5FVyBjbGllbnRJZCBidXQgYW4gaWRlbnRpY2FsIHRvb2wgbGlzdC4gVGhlIGNhY2hlZCBTREsgc2Vzc2lvbidzXG5cdC8vIHN0YWxlbmVzcyBjaGVjayAoYEFjdGl2ZUNsaWVudC5yZXF1aXJlc1Jlc3RhcnRgKSBtdXN0IE5PVCB0cmVhdCBhXG5cdC8vIGNsaWVudElkLW9ubHkgY2hhbmdlIGFzIGEgY29uZmlnIGNoYW5nZSBcdTIwMTQgb3RoZXJ3aXNlIGVpdGhlciB0aGUgc2Vzc2lvblxuXHQvLyBpcyBuZWVkbGVzc2x5IHJlc3RhcnRlZCwgb3IgKHRoZSBhY3R1YWwgYnVnKSB0aGUgY2FjaGVkIHNlc3Npb24gaXNcblx0Ly8gcmV1c2VkIHdoaWxlIHRoZSBsaXZlIGNsaWVudElkIGlzIG5ldmVyIHVwZGF0ZWQsIHNvIHN1YnNlcXVlbnQgY2xpZW50XG5cdC8vIHRvb2wgY2FsbHMgYXJlIHN0YW1wZWQgd2l0aCB0aGUgZGVhZCB3aW5kb3cncyBpZCBhbmQgaGFuZyBmb3JldmVyLlxuXHRzdWl0ZSgnY2xpZW50IHRvb2wgcmVmcmVzaCBvbiByZWxvYWQgKCMzMTk1MTYpJywgKCkgPT4ge1xuXHRcdC8qKiBNaW5pbWFsIHN0cnVjdHVyYWwgdmlldyBvZiB0aGUgYWdlbnQncyBwcml2YXRlIHBlci1zZXNzaW9uIEFjdGl2ZUNsaWVudC4gKi9cblx0XHR0eXBlIFRlc3RBY3RpdmVDbGllbnQgPSB7XG5cdFx0XHRyZWFkb25seSB0b29sU2V0OiB7IG93bmVyT2YodG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0c25hcHNob3QoKTogUHJvbWlzZTxJQWN0aXZlQ2xpZW50U25hcHNob3Q+O1xuXHRcdFx0cmVxdWlyZXNSZXN0YXJ0KHNuYXA6IElBY3RpdmVDbGllbnRTbmFwc2hvdCk6IFByb21pc2U8Ym9vbGVhbj47XG5cdFx0fTtcblxuXHRcdGZ1bmN0aW9uIGdldEFjdGl2ZUNsaWVudChhZ2VudDogQ29waWxvdEFnZW50LCBzZXNzaW9uOiBVUkkpOiBUZXN0QWN0aXZlQ2xpZW50IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUNsaWVudHMgPSAoYWdlbnQgYXMgdW5rbm93biBhcyB7IF9hY3RpdmVDbGllbnRzOiB7IGdldChzOiBVUkkpOiBUZXN0QWN0aXZlQ2xpZW50IHwgdW5kZWZpbmVkIH0gfSkuX2FjdGl2ZUNsaWVudHM7XG5cdFx0XHRjb25zdCBhY3RpdmVDbGllbnQgPSBhY3RpdmVDbGllbnRzLmdldChzZXNzaW9uKTtcblx0XHRcdGFzc2VydC5vayhhY3RpdmVDbGllbnQsICdleHBlY3RlZCBhbiBBY3RpdmVDbGllbnQgdG8gZXhpc3QgYWZ0ZXIgcmVnaXN0ZXJpbmcgY2xpZW50IHRvb2xzJyk7XG5cdFx0XHRyZXR1cm4gYWN0aXZlQ2xpZW50O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvb2xzOiBUb29sRGVmaW5pdGlvbltdID0gW3sgbmFtZTogJ215X3Rvb2wnLCBkZXNjcmlwdGlvbjogJ0EgdGVzdCB0b29sJywgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0gfV07XG5cblx0XHR0ZXN0KCdjbGllbnRJZC1vbmx5IGNoYW5nZSAocmVsb2FkKSBkb2VzIE5PVCByZXF1aXJlIGEgcmVzdGFydCBhbmQgdXBkYXRlcyB0aGUgbGl2ZSBvd25lcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3JlbG9hZC1zZXNzaW9uJyk7XG5cblx0XHRcdFx0Ly8gV2luZG93IEEgcmVnaXN0ZXJzIGl0cyB0b29sczsgdGhpcyBpcyB0aGUgc25hcHNob3QgdGhlIFNES1xuXHRcdFx0XHQvLyBzZXNzaW9uIHdvdWxkIGJlIGNyZWF0ZWQgd2l0aC5cblx0XHRcdFx0YWdlbnQuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgeyBjbGllbnRJZDogJ2NsaWVudC1BJyB9KS50b29scyA9IHRvb2xzO1xuXHRcdFx0XHRjb25zdCBhY3RpdmVDbGllbnQgPSBnZXRBY3RpdmVDbGllbnQoYWdlbnQsIHNlc3Npb24pO1xuXHRcdFx0XHRjb25zdCBhcHBsaWVkU25hcHNob3QgPSBhd2FpdCBhY3RpdmVDbGllbnQuc25hcHNob3QoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUNsaWVudC50b29sU2V0Lm93bmVyT2YoJ215X3Rvb2wnKSwgJ2NsaWVudC1BJyk7XG5cblx0XHRcdFx0Ly8gV2luZG93IEEgcmVsb2Fkczogd2luZG93IEIgcmVjb25uZWN0cyB3aXRoIGEgbmV3IGNsaWVudElkIGJ1dFxuXHRcdFx0XHQvLyB0aGUgaWRlbnRpY2FsIHRvb2wgbGlzdC4gVGhlIHJlbG9hZCByZW1vdmVzIEEgdGhlbiBhZGRzIEIuXG5cdFx0XHRcdGFnZW50LnJlbW92ZUFjdGl2ZUNsaWVudChzZXNzaW9uLCAnY2xpZW50LUEnKTtcblx0XHRcdFx0YWdlbnQuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgeyBjbGllbnRJZDogJ2NsaWVudC1CJyB9KS50b29scyA9IFsuLi50b29sc107XG5cblx0XHRcdFx0Ly8gUm9vdC1jYXVzZSBhc3NlcnRpb25zOiB0aGUgY2FjaGVkIFNESyBzZXNzaW9uIG11c3QgYmUgcmV1c2VkXG5cdFx0XHRcdC8vIChubyByZXN0YXJ0KSBBTkQgdGhlIGxpdmUgb3duZXIgbXVzdCBub3cgYmUgd2luZG93IEIncywgc29cblx0XHRcdFx0Ly8gdGhlIG5leHQgY2xpZW50IHRvb2wgY2FsbCBpcyBzdGFtcGVkIHdpdGggYSBsaXZlIG93bmVyLlxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgYWN0aXZlQ2xpZW50LnJlcXVpcmVzUmVzdGFydChhcHBsaWVkU25hcHNob3QpLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVDbGllbnQudG9vbFNldC5vd25lck9mKCdteV90b29sJyksICdjbGllbnQtQicpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Egc3RydWN0dXJhbCB0b29sIGNoYW5nZSBzdGlsbCByZXF1aXJlcyBhIHJlc3RhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICd0b29scy1jaGFuZ2Utc2Vzc2lvbicpO1xuXG5cdFx0XHRcdGFnZW50LmdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHNlc3Npb24sIHsgY2xpZW50SWQ6ICdjbGllbnQtQScgfSkudG9vbHMgPSB0b29scztcblx0XHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gZ2V0QWN0aXZlQ2xpZW50KGFnZW50LCBzZXNzaW9uKTtcblx0XHRcdFx0Y29uc3QgYXBwbGllZFNuYXBzaG90ID0gYXdhaXQgYWN0aXZlQ2xpZW50LnNuYXBzaG90KCk7XG5cblx0XHRcdFx0Ly8gQSBnZW51aW5lbHkgZGlmZmVyZW50IHRvb2wgc2V0IChhZGRlZCB0b29sKSBtdXN0IHJlc3RhcnQgc28gdGhlXG5cdFx0XHRcdC8vIFNESyBzZXNzaW9uIGlzIHJlYnVpbHQgd2l0aCB0aGUgbmV3IHRvb2xzLlxuXHRcdFx0XHRhZ2VudC5nZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChzZXNzaW9uLCB7IGNsaWVudElkOiAnY2xpZW50LUEnIH0pLnRvb2xzID0gWy4uLnRvb2xzLCB7IG5hbWU6ICdzZWNvbmRfdG9vbCcsIGRlc2NyaXB0aW9uOiAnYW5vdGhlcicsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9IH1dO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBhY3RpdmVDbGllbnQucmVxdWlyZXNSZXN0YXJ0KGFwcGxpZWRTbmFwc2hvdCksIHRydWUpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIGFjdGl2ZSBjbGllbnRzIG1lcmdlIHRoZWlyIHRvb2xzIGFuZCByZW1vdmFsIGlzb2xhdGVzIHBlciBjbGllbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1jbGllbnQtc2Vzc2lvbicpO1xuXG5cdFx0XHRcdC8vIFR3byBjbGllbnRzIGVhY2ggY29udHJpYnV0ZSB0aGVpciBvd24gdG9vbCBwbHVzIGEgc2hhcmVkIG9uZS5cblx0XHRcdFx0YWdlbnQuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgeyBjbGllbnRJZDogJ2NsaWVudC1BJyB9KS50b29scyA9IFtcblx0XHRcdFx0XHR7IG5hbWU6ICdzaGFyZWQnLCBkZXNjcmlwdGlvbjogJ2Zyb20gQScsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9IH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnYV90b29sJywgZGVzY3JpcHRpb246ICdBIG9ubHknLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSB9LFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRhZ2VudC5nZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChzZXNzaW9uLCB7IGNsaWVudElkOiAnY2xpZW50LUInIH0pLnRvb2xzID0gW1xuXHRcdFx0XHRcdHsgbmFtZTogJ3NoYXJlZCcsIGRlc2NyaXB0aW9uOiAnZnJvbSBCJywgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0gfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdiX3Rvb2wnLCBkZXNjcmlwdGlvbjogJ0Igb25seScsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9IH0sXG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IGdldEFjdGl2ZUNsaWVudChhZ2VudCwgc2Vzc2lvbik7XG5cblx0XHRcdFx0Ly8gVGhlIFNESyBzbmFwc2hvdCBtZXJnZXMgYm90aCBjbGllbnRzLCBkZWR1cGluZyB0aGUgc2hhcmVkIG5hbWVcblx0XHRcdFx0Ly8gaW4gZmF2b3Igb2YgdGhlIGZpcnN0LWluc2VydGVkIGNsaWVudCAoQSksIGFuZCBvd25lcnNoaXAgbWFwc1xuXHRcdFx0XHQvLyBlYWNoIHRvb2wgdG8gaXRzIGNvbnRyaWJ1dGluZyBjbGllbnQuXG5cdFx0XHRcdGNvbnN0IG1lcmdlZCA9IGF3YWl0IGFjdGl2ZUNsaWVudC5zbmFwc2hvdCgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lcmdlZC50b29scy5tYXAodCA9PiB0Lm5hbWUpLCBbJ3NoYXJlZCcsICdhX3Rvb2wnLCAnYl90b29sJ10pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlQ2xpZW50LnRvb2xTZXQub3duZXJPZignc2hhcmVkJyksICdjbGllbnQtQScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlQ2xpZW50LnRvb2xTZXQub3duZXJPZignYV90b29sJyksICdjbGllbnQtQScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlQ2xpZW50LnRvb2xTZXQub3duZXJPZignYl90b29sJyksICdjbGllbnQtQicpO1xuXG5cdFx0XHRcdC8vIFJlbW92aW5nIGNsaWVudCBBIGtlZXBzIEIncyBjb250cmlidXRpb24gYW5kIGhhbmRzIHRoZSBzaGFyZWRcblx0XHRcdFx0Ly8gdG9vbCB0byBCIChub3cgdGhlIHNvbGUgcHJvdmlkZXIpLlxuXHRcdFx0XHRhZ2VudC5yZW1vdmVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgJ2NsaWVudC1BJyk7XG5cdFx0XHRcdGNvbnN0IGFmdGVyUmVtb3ZhbCA9IGF3YWl0IGFjdGl2ZUNsaWVudC5zbmFwc2hvdCgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFmdGVyUmVtb3ZhbC50b29scy5tYXAodCA9PiB0Lm5hbWUpLCBbJ3NoYXJlZCcsICdiX3Rvb2wnXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVDbGllbnQudG9vbFNldC5vd25lck9mKCdzaGFyZWQnKSwgJ2NsaWVudC1CJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3RpdmVDbGllbnQudG9vbFNldC5vd25lck9mKCdhX3Rvb2wnKSwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb25maWctZHJpdmVuIHNlc3Npb24gcmVmcmVzaCcsICgpID0+IHtcblx0XHR0ZXN0KCd3YWl0cyBmb3IgdGhlIHByZXZpb3VzIFNESyBzZXNzaW9uIHRvIGRpc2Nvbm5lY3QgYmVmb3JlIHJlc3VtaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKTtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IGNsaWVudCB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25JZCA9ICdjb25maWctcmVmcmVzaC1zZXNzaW9uJztcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IGRpc2Nvbm5lY3RTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgYWxsb3dEaXNjb25uZWN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3Qgb3JkZXI6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBwcmV2aW91c1Nlc3Npb24gPSB7XG5cdFx0XHRcdGFwcGxpZWRTbmFwc2hvdDogeyB0b29sczogW10sIHBsdWdpbnM6IFtdLCBtY3BTZXJ2ZXJzOiB7fSB9LFxuXHRcdFx0XHRkZXN0cm95U2Vzc2lvbjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdG9yZGVyLnB1c2goJ2Rpc2Nvbm5lY3Qtc3RhcnRlZCcpO1xuXHRcdFx0XHRcdGRpc2Nvbm5lY3RTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0YXdhaXQgYWxsb3dEaXNjb25uZWN0LnA7XG5cdFx0XHRcdFx0b3JkZXIucHVzaCgnZGlzY29ubmVjdC1maW5pc2hlZCcpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBvcmRlci5wdXNoKCdwcmV2aW91cy1kaXNwb3NlZCcpLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RBZ2VudFNlc3Npb247XG5cdFx0XHRjb25zdCByZXN1bWVkU2Vzc2lvbiA9IHtcblx0XHRcdFx0c2VuZDogYXN5bmMgKCkgPT4geyBvcmRlci5wdXNoKCdzZW5kJyk7IH0sXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90QWdlbnRTZXNzaW9uO1xuXHRcdFx0Y29uc3QgaW50ZXJuYWxzID0gYWdlbnQgYXMgdW5rbm93biBhcyB7XG5cdFx0XHRcdF9yZXN1bWVTZXNzaW9uOiAoaWQ6IHN0cmluZykgPT4gUHJvbWlzZTxDb3BpbG90QWdlbnRTZXNzaW9uPjtcblx0XHRcdH07XG5cblx0XHRcdHNldERlZmF1bHRTZXNzaW9uU3R1YihhZ2VudCwgc2Vzc2lvbklkLCBwcmV2aW91c1Nlc3Npb24pO1xuXHRcdFx0YWdlbnQuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgeyBjbGllbnRJZDogJ2NsaWVudCcgfSkudG9vbHMgPSBbXG5cdFx0XHRcdHsgbmFtZTogJ25ld190b29sJywgZGVzY3JpcHRpb246ICdBIG5ld2x5IHJlZ2lzdGVyZWQgdG9vbCcsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9IH0sXG5cdFx0XHRdO1xuXHRcdFx0aW50ZXJuYWxzLl9yZXN1bWVTZXNzaW9uID0gYXN5bmMgaWQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWQsIHNlc3Npb25JZCk7XG5cdFx0XHRcdG9yZGVyLnB1c2goJ3Jlc3VtZScpO1xuXHRcdFx0XHRzZXREZWZhdWx0U2Vzc2lvblN0dWIoYWdlbnQsIHNlc3Npb25JZCwgcmVzdW1lZFNlc3Npb24pO1xuXHRcdFx0XHRyZXR1cm4gcmVzdW1lZFNlc3Npb247XG5cdFx0XHR9O1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZW5kID0gYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoZGVmYXVsdENoYXRVcmkoc2Vzc2lvbiksICdoZWxsbycsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGF3YWl0IGRpc2Nvbm5lY3RTdGFydGVkLnA7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3JkZXIsIFsnZGlzY29ubmVjdC1zdGFydGVkJ10pO1xuXG5cdFx0XHRcdGFsbG93RGlzY29ubmVjdC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCBzZW5kO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9yZGVyLCBbXG5cdFx0XHRcdFx0J2Rpc2Nvbm5lY3Qtc3RhcnRlZCcsXG5cdFx0XHRcdFx0J2Rpc2Nvbm5lY3QtZmluaXNoZWQnLFxuXHRcdFx0XHRcdCdwcmV2aW91cy1kaXNwb3NlZCcsXG5cdFx0XHRcdFx0J3Jlc3VtZScsXG5cdFx0XHRcdFx0J3NlbmQnLFxuXHRcdFx0XHRdKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGFsbG93RGlzY29ubmVjdC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnX3Jlc3VtZVNlc3Npb24gZGVkdXAnLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogdHdvIGNvbmN1cnJlbnQgcGF0aHMgKGUuZy4gYW4gb3V0ZGF0ZWQtY29uZmlnIHJlZnJlc2ggaW5cblx0XHQvLyBgc2VuZE1lc3NhZ2VgIGFuZCBhIGBnZXRTZXNzaW9uTWVzc2FnZXNgIHN1YnNjcmliZSkgZWFjaCBjYWxsaW5nXG5cdFx0Ly8gYF9yZXN1bWVTZXNzaW9uKGlkKWAgdXNlZCB0byBjb25zdHJ1Y3QgdHdvIGBDb3BpbG90QWdlbnRTZXNzaW9uYFxuXHRcdC8vIGVudHJpZXMgZm9yIHRoZSBzYW1lIGlkOyB0aGUgc2Vjb25kIGBfc2Vzc2lvbnMuc2V0KGlkLCBcdTIwMjYpYCBvbiB0aGVcblx0XHQvLyB1bmRlcmx5aW5nIGBEaXNwb3NhYmxlTWFwYCBkaXNwb3NlZCB0aGUgZmlyc3Qgb25lIG1pZFxuXHRcdC8vIGBpbml0aWFsaXplU2Vzc2lvbigpYCwgcHJvZHVjaW5nICdUcnlpbmcgdG8gYWRkIGEgZGlzcG9zYWJsZSB0byBhXG5cdFx0Ly8gRGlzcG9zYWJsZVN0b3JlIHRoYXQgaGFzIGFscmVhZHkgYmVlbiBkaXNwb3NlZCcgd2FybmluZ3MgYW5kIGFcblx0XHQvLyBoYWxmLWluaXRpYWxpc2VkIHNlc3Npb24gd2l0aCBubyBldmVudCBzdWJzY3JpcHRpb25zLlxuXG5cdFx0dHlwZSBBZ2VudEludGVybmFscyA9IHtcblx0XHRcdF9yZXN1bWVTZXNzaW9uOiAoaWQ6IHN0cmluZykgPT4gUHJvbWlzZTxDb3BpbG90QWdlbnRTZXNzaW9uPjtcblx0XHRcdF9kb1Jlc3VtZVNlc3Npb246IChpZDogc3RyaW5nKSA9PiBQcm9taXNlPENvcGlsb3RBZ2VudFNlc3Npb24+O1xuXHRcdH07XG5cdFx0Y29uc3QgbWFrZUZha2VTZXNzaW9uID0gKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0gYXMgdW5rbm93biBhcyBDb3BpbG90QWdlbnRTZXNzaW9uKTtcblxuXHRcdHRlc3QoJ2RlZHVwZXMgY29uY3VycmVudCBjYWxscyBmb3IgdGhlIHNhbWUgc2Vzc2lvbklkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdFx0Y29uc3QgaW50ZXJuYWxzID0gYWdlbnQgYXMgdW5rbm93biBhcyBBZ2VudEludGVybmFscztcblx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxDb3BpbG90QWdlbnRTZXNzaW9uPigpO1xuXHRcdFx0bGV0IGRvUmVzdW1lQ2FsbHMgPSAwO1xuXHRcdFx0aW50ZXJuYWxzLl9kb1Jlc3VtZVNlc3Npb24gPSAoKSA9PiB7XG5cdFx0XHRcdGRvUmVzdW1lQ2FsbHMrKztcblx0XHRcdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdFx0XHR9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcDEgPSBpbnRlcm5hbHMuX3Jlc3VtZVNlc3Npb24oJ3MxJyk7XG5cdFx0XHRcdGNvbnN0IHAyID0gaW50ZXJuYWxzLl9yZXN1bWVTZXNzaW9uKCdzMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocDEsIHAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvUmVzdW1lQ2FsbHMsIDEpO1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlRmFrZVNlc3Npb24oKTtcblx0XHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoc2Vzc2lvbik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBwMSwgc2Vzc2lvbik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBwMiwgc2Vzc2lvbik7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xlYXJzIGluZmxpZ2h0IGVudHJ5IGFmdGVyIHJlc29sdXRpb24gc28gdGhlIG5leHQgY2FsbCByZS1pbnZva2VzIF9kb1Jlc3VtZVNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIEFnZW50SW50ZXJuYWxzO1xuXHRcdFx0bGV0IGRvUmVzdW1lQ2FsbHMgPSAwO1xuXHRcdFx0aW50ZXJuYWxzLl9kb1Jlc3VtZVNlc3Npb24gPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGRvUmVzdW1lQ2FsbHMrKztcblx0XHRcdFx0cmV0dXJuIG1ha2VGYWtlU2Vzc2lvbigpO1xuXHRcdFx0fTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGludGVybmFscy5fcmVzdW1lU2Vzc2lvbignczEnKTtcblx0XHRcdFx0YXdhaXQgaW50ZXJuYWxzLl9yZXN1bWVTZXNzaW9uKCdzMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG9SZXN1bWVDYWxscywgMik7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xlYXJzIGluZmxpZ2h0IGVudHJ5IG9uIHJlamVjdGlvbiBzbyB0aGUgbmV4dCBjYWxsIHJldHJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcyk7XG5cdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIEFnZW50SW50ZXJuYWxzO1xuXHRcdFx0bGV0IGF0dGVtcHQgPSAwO1xuXHRcdFx0aW50ZXJuYWxzLl9kb1Jlc3VtZVNlc3Npb24gPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF0dGVtcHQrKztcblx0XHRcdFx0aWYgKGF0dGVtcHQgPT09IDEpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ZpcnN0IGZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtYWtlRmFrZVNlc3Npb24oKTtcblx0XHRcdH07XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBpbnRlcm5hbHMuX3Jlc3VtZVNlc3Npb24oJ3MxJyksIC9maXJzdCBmYWlsZWQvKTtcblx0XHRcdFx0YXdhaXQgaW50ZXJuYWxzLl9yZXN1bWVTZXNzaW9uKCdzMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0ZW1wdCwgMik7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZGVkdXBlIGFjcm9zcyBkaWZmZXJlbnQgc2Vzc2lvbklkcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzKTtcblx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgQWdlbnRJbnRlcm5hbHM7XG5cdFx0XHRjb25zdCBpZHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpbnRlcm5hbHMuX2RvUmVzdW1lU2Vzc2lvbiA9IGFzeW5jIChpZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlkcy5wdXNoKGlkKTtcblx0XHRcdFx0cmV0dXJuIG1ha2VGYWtlU2Vzc2lvbigpO1xuXHRcdFx0fTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRpbnRlcm5hbHMuX3Jlc3VtZVNlc3Npb24oJ3MxJyksXG5cdFx0XHRcdFx0aW50ZXJuYWxzLl9yZXN1bWVTZXNzaW9uKCdzMicpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uaWRzXS5zb3J0KCksIFsnczEnLCAnczInXSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncG9zdC1pbml0IHNodXRkb3duIHJhY2U6IGRpc3Bvc2VzIHRoZSBzZXNzaW9uIGFuZCB0aHJvd3MgQ2FuY2VsbGF0aW9uRXJyb3IgaW5zdGVhZCBvZiByZWdpc3RlcmluZyBvbiBhIGRpc3Bvc2VkIF9zZXNzaW9ucyBtYXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBXaXRob3V0IHRoaXMgZ3VhcmQgYW4gaW4tZmxpZ2h0IGBfcmVzdW1lU2Vzc2lvbmAgL1xuXHRcdFx0Ly8gYF9tYXRlcmlhbGl6ZVByb3Zpc2lvbmFsYCB3aG9zZSBgaW5pdGlhbGl6ZVNlc3Npb24oKWBcblx0XHRcdC8vIHJlc29sdmVzIEFGVEVSIGBkaXNwb3NlKClgIC0+IGBzaHV0ZG93bigpYCAtPiBgc3VwZXIuZGlzcG9zZSgpYFxuXHRcdFx0Ly8gaGFzIHJ1biB3b3VsZCBjYWxsIGBfc2Vzc2lvbnMuc2V0KC4uLilgIG9uIGEgZGlzcG9zZWRcblx0XHRcdC8vIERpc3Bvc2FibGVNYXAsIGxlYWtpbmcgdGhlIHNlc3Npb24gYW5kIHJlcHJvZHVjaW5nIHRoZVxuXHRcdFx0Ly8gJ1RyeWluZyB0byBhZGQgYSBkaXNwb3NhYmxlIHRvIGEgRGlzcG9zYWJsZVN0b3JlIHRoYXQgaGFzXG5cdFx0XHQvLyBhbHJlYWR5IGJlZW4gZGlzcG9zZWQnIHdhcm5pbmcgdGhpcyBQUiBleGlzdHMgdG8gZWxpbWluYXRlLlxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMpO1xuXHRcdFx0Y29uc3QgaW50ZXJuYWxzID0gYWdlbnQgYXMgdW5rbm93biBhcyB7XG5cdFx0XHRcdF9yZWdpc3RlckluaXRpYWxpemVkU2Vzc2lvbjogKGlkOiBzdHJpbmcsIHM6IENvcGlsb3RBZ2VudFNlc3Npb24pID0+IHZvaWQ7XG5cdFx0XHRcdF9zaHV0ZG93blByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdFx0XHR9O1xuXHRcdFx0bGV0IGRpc3Bvc2VkID0gMDtcblx0XHRcdGNvbnN0IGZha2VTZXNzaW9uID0geyBkaXNwb3NlOiAoKSA9PiB7IGRpc3Bvc2VkKys7IH0gfSBhcyB1bmtub3duIGFzIENvcGlsb3RBZ2VudFNlc3Npb247XG5cdFx0XHRpbnRlcm5hbHMuX3NodXRkb3duUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LnRocm93cyhcblx0XHRcdFx0XHQoKSA9PiBpbnRlcm5hbHMuX3JlZ2lzdGVySW5pdGlhbGl6ZWRTZXNzaW9uKCdzMScsIGZha2VTZXNzaW9uKSxcblx0XHRcdFx0XHQoZXJyOiB1bmtub3duKSA9PiBpc0NhbmNlbGxhdGlvbkVycm9yKGVyciksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZCwgMSwgJ3Nlc3Npb24gc2hvdWxkIGJlIGRpc3Bvc2VkIGJ5IHRoZSBndWFyZCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0Ly8gQ2xlYXIgdGhlIGZha2Ugc2h1dGRvd24gcHJvbWlzZSBzbyBkaXNwb3NlQWdlbnQgZG9lc24ndFxuXHRcdFx0XHQvLyBzaG9ydC1jaXJjdWl0IGFuZCBsZWF2ZSByZWFsIHN0YXRlIGJlaGluZC5cblx0XHRcdFx0aW50ZXJuYWxzLl9zaHV0ZG93blByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaHV0ZG93biBkdXJpbmcgcmVzdW1lIGNhbmNlbHMgdGhlIGluLWZsaWdodCByZXN1bWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgZnMubWtkdGVtcChgJHtvcy50bXBkaXIoKX0vcmVzdW1lLXRlbGVtZXRyeS1zaHV0ZG93bi1gKTtcblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbc2RrU2Vzc2lvbignczEnLCB3b3JraW5nRGlyZWN0b3J5KV0pO1xuXHRcdFx0Y29uc3QgZGVmZXJyZWRTZXNzaW9uID0gbmV3IERlZmVycmVkUHJvbWlzZTxDb3BpbG90U2Vzc2lvbj4oKTtcblx0XHRcdGxldCByZXN1bWVDYWxsZWQgPSBmYWxzZTtcblx0XHRcdGNsaWVudC5yZXN1bWVTZXNzaW9uID0gKCkgPT4ge1xuXHRcdFx0XHRyZXN1bWVDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gZGVmZXJyZWRTZXNzaW9uLnA7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdFx0Y29waWxvdENsaWVudDogY2xpZW50LFxuXHRcdFx0XHR1c2VSZWFsUmVzdW1lUGF0aDogdHJ1ZSxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgeyBfcmVzdW1lU2Vzc2lvbjogKGlkOiBzdHJpbmcpID0+IFByb21pc2U8Q29waWxvdEFnZW50U2Vzc2lvbj4gfTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZShHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UucmVzb3VyY2UsICd0b2tlbicpO1xuXHRcdFx0XHRjb25zdCByZXN1bWVQcm9taXNlID0gaW50ZXJuYWxzLl9yZXN1bWVTZXNzaW9uKCdzMScpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwMCAmJiAhcmVzdW1lQ2FsbGVkOyBpKyspIHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bWVDYWxsZWQsIHRydWUpO1xuXG5cdFx0XHRcdGF3YWl0IGFnZW50LnNodXRkb3duKCk7XG5cdFx0XHRcdGRlZmVycmVkU2Vzc2lvbi5jb21wbGV0ZShuZXcgTW9ja0NvcGlsb3RTZXNzaW9uKCkgYXMgdW5rbm93biBhcyBDb3BpbG90U2Vzc2lvbik7XG5cblx0XHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVzdW1lUHJvbWlzZSwgKGVycm9yOiB1bmtub3duKSA9PiBpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBmcy5ybSh3b3JraW5nRGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VBZ2VudChhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdfcmVzdW1lU2Vzc2lvbiBmYWxsYmFjaycsICgpID0+IHtcblx0XHR0eXBlIEFnZW50SW50ZXJuYWxzID0ge1xuXHRcdFx0X3Jlc3VtZVNlc3Npb246IChpZDogc3RyaW5nKSA9PiBQcm9taXNlPENvcGlsb3RBZ2VudFNlc3Npb24+O1xuXHRcdH07XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZXN0b3JlIGEgcGVyc2lzdGVkIGN1c3RvbSBhZ2VudCB0aGF0IGlzIGFic2VudCBmcm9tIHRoZSBjdXJyZW50IHBsdWdpbiBzbmFwc2hvdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBhd2FpdCBmcy5ta2R0ZW1wKGAke29zLnRtcGRpcigpfS9yZXN1bWUtYWdlbnQtYCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzMScpO1xuXHRcdFx0Y29uc3QgZGJSZWYgPSBzZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZGJSZWYub2JqZWN0LnNldE1ldGFkYXRhKCdjb3BpbG90LndvcmtpbmdEaXJlY3RvcnknLCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KS50b1N0cmluZygpKTtcblx0XHRcdFx0YXdhaXQgZGJSZWYub2JqZWN0LnNldE1ldGFkYXRhKCdjb3BpbG90LmFnZW50JywgSlNPTi5zdHJpbmdpZnkoeyB1cmk6ICdmaWxlOi8vL29sZC1jbGllbnQvZGF0YS5tZCcgfSkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0ZGJSZWYuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW3Nka1Nlc3Npb24oJ3MxJywgd29ya2luZ0RpcmVjdG9yeSldKTtcblx0XHRcdGNvbnN0IHJlc3VtZUFnZW50czogKHN0cmluZyB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdFx0Y2xpZW50LnJlc3VtZVNlc3Npb24gPSBhc3luYyAoX3Nlc3Npb25JZCwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRyZXN1bWVBZ2VudHMucHVzaChvcHRpb25zPy5hZ2VudCk7XG5cdFx0XHRcdHJldHVybiBuZXcgTW9ja0NvcGlsb3RTZXNzaW9uKCkgYXMgdW5rbm93biBhcyBDb3BpbG90U2Vzc2lvbjtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZVRlc3RBZ2VudChkaXNwb3NhYmxlcywgeyBjb3BpbG90Q2xpZW50OiBjbGllbnQsIHVzZVJlYWxSZXN1bWVQYXRoOiB0cnVlLCBzZXNzaW9uRGF0YVNlcnZpY2UgfSk7XG5cdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIEFnZW50SW50ZXJuYWxzO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSwgJ3Rva2VuJyk7XG5cdFx0XHRcdGF3YWl0IGludGVybmFscy5fcmVzdW1lU2Vzc2lvbignczEnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bWVBZ2VudHMsIFt1bmRlZmluZWRdKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGZzLnJtKHdvcmtpbmdEaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHJpZXMgcmVzdW1lIHdpdGhvdXQgYSBjdXN0b20gYWdlbnQgd2hlbiB0aGUgU0RLIHJlcG9ydHMgdGhlIHN0b3JlZCBhZ2VudCBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cblx0XHRcdGNvbnN0IHJlcG8gPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9yZXBvJyB9KTtcblx0XHRcdGNvbnN0IGRhdGFBZ2VudCA9IFVSSS5qb2luUGF0aChyZXBvLCAnLmdpdGh1YicsICdhZ2VudHMnLCAnZGF0YS5tZCcpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGRhdGFBZ2VudCwgVlNCdWZmZXIuZnJvbVN0cmluZygnLS0tXFxubmFtZTogRGF0YVxcbmRlc2NyaXB0aW9uOiBkYXRhIHF1ZXJpZXNcXG4tLS1cXG5ib2R5JykpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzMScpO1xuXHRcdFx0Y29uc3QgZGJSZWYgPSBzZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZGJSZWYub2JqZWN0LnNldE1ldGFkYXRhKCdjb3BpbG90LndvcmtpbmdEaXJlY3RvcnknLCByZXBvLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhd2FpdCBkYlJlZi5vYmplY3Quc2V0TWV0YWRhdGEoJ2NvcGlsb3QuYWdlbnQnLCBKU09OLnN0cmluZ2lmeSh7IHVyaTogZGF0YUFnZW50LnRvU3RyaW5nKCkgfSkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0ZGJSZWYuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbGllbnQgPSBuZXcgVGVzdENvcGlsb3RDbGllbnQoW3Nka1Nlc3Npb24oJ3MxJyldKTtcblx0XHRcdGNvbnN0IHJlc3VtZUFnZW50czogKHN0cmluZyB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdFx0Y2xpZW50LnJlc3VtZVNlc3Npb24gPSBhc3luYyAoX3Nlc3Npb25JZCwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRyZXN1bWVBZ2VudHMucHVzaChvcHRpb25zPy5hZ2VudCk7XG5cdFx0XHRcdGlmIChyZXN1bWVBZ2VudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFRlc3RTZGtFcnJvcihgUmVxdWVzdCBzZXNzaW9uLnJlc3VtZSBmYWlsZWQgd2l0aCBtZXNzYWdlOiBDdXN0b20gYWdlbnQgJ0RhdGEnIG5vdCBmb3VuZGAsIC0zMjYwMyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBNb2NrQ29waWxvdFNlc3Npb24oKSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXHRcdFx0fTtcblx0XHRcdGNsaWVudC5jcmVhdGVTZXNzaW9uID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NyZWF0ZVNlc3Npb24gc2hvdWxkIG5vdCBiZSBjYWxsZWQnKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IGNsaWVudCwgdXNlUmVhbFJlc3VtZVBhdGg6IHRydWUsIHNlc3Npb25EYXRhU2VydmljZSwgZmlsZVNlcnZpY2UgfSk7XG5cdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIEFnZW50SW50ZXJuYWxzO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSwgJ3Rva2VuJyk7XG5cdFx0XHRcdGF3YWl0IGludGVybmFscy5fcmVzdW1lU2Vzc2lvbignczEnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bWVBZ2VudHMsIFsnRGF0YScsIHVuZGVmaW5lZF0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2N1c3RvbWl6YXRpb24gYW5jaG9yaW5nJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmViYXNlVW5kZXIgcmViYXNlcyBwYXRocyB1bmRlciB0aGUgc291cmNlIGRpciBhbmQgbGVhdmVzIG90aGVycyB1bnRvdWNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IFVSSS5maWxlKCcvVXNlcnMvbWUvc3JjL3ZzY29kZScpO1xuXHRcdFx0Y29uc3Qgd29ya3RyZWUgPSBVUkkuZmlsZSgnL1VzZXJzL21lL3NyYy92c2NvZGUud29ya3RyZWVzL2FnZW50cy14Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlYmFzZVVuZGVyKFVSSS5maWxlKCcvVXNlcnMvbWUvc3JjL3ZzY29kZS8uZ2l0aHViL3NraWxscy9zZXNzaW9ucycpLCBvcmlnaW5hbCwgd29ya3RyZWUpPy50b1N0cmluZygpLFxuXHRcdFx0XHRVUkkuZmlsZSgnL1VzZXJzL21lL3NyYy92c2NvZGUud29ya3RyZWVzL2FnZW50cy14Ly5naXRodWIvc2tpbGxzL3Nlc3Npb25zJykudG9TdHJpbmcoKSxcblx0XHRcdFx0J2EgcGF0aCB1bmRlciB0aGUgc291cmNlIGRpciBpcyByZWJhc2VkIG9udG8gdGhlIHRhcmdldCBkaXInLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmViYXNlVW5kZXIob3JpZ2luYWwsIG9yaWdpbmFsLCB3b3JrdHJlZSk/LnRvU3RyaW5nKCksXG5cdFx0XHRcdHdvcmt0cmVlLnRvU3RyaW5nKCksXG5cdFx0XHRcdCd0aGUgc291cmNlIGRpciBpdHNlbGYgbWFwcyB0byB0aGUgdGFyZ2V0IGRpcicsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWJhc2VVbmRlcihVUkkuZmlsZSgnL1VzZXJzL21lLy5jb3BpbG90L3NraWxscy9mb28nKSwgb3JpZ2luYWwsIHdvcmt0cmVlKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQnYSBwYXRoIG91dHNpZGUgdGhlIHNvdXJjZSBkaXIgKGUuZy4gdXNlciBob21lKSBpcyBub3QgcmViYXNlZCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IHRtcERpcjogc3RyaW5nO1xuXG5cdFx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dG1wRGlyID0gYXdhaXQgZnMubWtkdGVtcChgJHtvcy50bXBkaXIoKX0vY29waWxvdC1hZ2VudC1hbmNob3ItdGVzdC1gKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGZzLnJtKHRtcERpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdH0pO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gbWF0ZXJpYWxpemVBbmRDYXB0dXJlQW5jaG9yKHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx7IGFuY2hvcjogVVJJIHwgdW5kZWZpbmVkOyBzZGtXb3JraW5nRGlyZWN0b3J5OiBzdHJpbmcgfCB1bmRlZmluZWQ7IG9yaWdpbmFsRm9sZGVyOiBVUkkgfT4ge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxGb2xkZXIgPSBVUkkuam9pblBhdGgoVVJJLmZpbGUodG1wRGlyKSwgJ3JlcG8nKTtcblx0XHRcdGF3YWl0IGZzLm1rZGlyKG9yaWdpbmFsRm9sZGVyLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRsZXQgc2RrV29ya2luZ0RpcmVjdG9yeTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y2xpZW50LmNyZWF0ZVNlc3Npb24gPSBhc3luYyBjb25maWcgPT4ge1xuXHRcdFx0XHRzZGtXb3JraW5nRGlyZWN0b3J5ID0gY29uZmlnLndvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0XHRcdHJldHVybiBuZXcgTW9ja0NvcGlsb3RTZXNzaW9uKCkgYXMgdW5rbm93biBhcyBDb3BpbG90U2Vzc2lvbjtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U2Vzc2lvbkRhdGFTZXJ2aWNlKCkpLFxuXHRcdFx0XHRjb3BpbG90Q2xpZW50OiBjbGllbnQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQ2FwdHVyZSB0aGUgY3VzdG9taXphdGlvbiBhbmNob3IgaGFuZGVkIHRvIGBfY3JlYXRlQWdlbnRTZXNzaW9uYC4gVGhlXG5cdFx0XHQvLyBob3N0IHB1c2hlcyB0aGUgcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcnkgKHRoZSB3b3JrdHJlZSkgaW50byB0aGUgZmlyc3Rcblx0XHRcdC8vIGBzZW5kTWVzc2FnZWAsIG1pcnJvcmluZyBBZ2VudFNpZGVFZmZlY3RzLlxuXHRcdFx0bGV0IGFuY2hvcjogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgYWdlbnRJbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIHtcblx0XHRcdFx0X2NyZWF0ZUFnZW50U2Vzc2lvbjogKGxhdW5jaFBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiwgY3VzdG9taXphdGlvbkRpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBhY3RpdmVDbGllbnQ6IHVua25vd24sIGlkZW50aXR5PzogeyBzZXNzaW9uVXJpOiBVUkk7IGNoYXRDaGFubmVsVXJpOiBVUkkgfSkgPT4gQ29waWxvdEFnZW50U2Vzc2lvbjtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBvcmlnaW5hbENyZWF0ZUFnZW50U2Vzc2lvbiA9IGFnZW50SW50ZXJuYWxzLl9jcmVhdGVBZ2VudFNlc3Npb247XG5cdFx0XHRhZ2VudEludGVybmFscy5fY3JlYXRlQWdlbnRTZXNzaW9uID0gKGxhdW5jaFBsYW4sIGN1c3RvbWl6YXRpb25EaXJlY3RvcnksIGFjdGl2ZUNsaWVudCwgaWRlbnRpdHkpID0+IHtcblx0XHRcdFx0YW5jaG9yID0gY3VzdG9taXphdGlvbkRpcmVjdG9yeTtcblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsQ3JlYXRlQWdlbnRTZXNzaW9uLmNhbGwoYWdlbnQsIGxhdW5jaFBsYW4sIGN1c3RvbWl6YXRpb25EaXJlY3RvcnksIGFjdGl2ZUNsaWVudCwgaWRlbnRpdHkpO1xuXHRcdFx0fTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWdlbnQuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5naXRodWIuY29tJywgJ3Rva2VuJyk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFnZW50LmNyZWF0ZVNlc3Npb24oeyBzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2FuY2hvci1zZXNzaW9uJyksIHdvcmtpbmdEaXJlY3RvcmllczogW29yaWdpbmFsRm9sZGVyXSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wcm92aXNpb25hbCwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmNoYXRzLnNlbmRNZXNzYWdlKGRlZmF1bHRDaGF0VXJpKHJlc3VsdC5zZXNzaW9uKSwgJ2hlbGxvJywgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5ID8gW3Jlc29sdmVkV29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGFuY2hvciwgc2RrV29ya2luZ0RpcmVjdG9yeSwgb3JpZ2luYWxGb2xkZXIgfTtcblx0XHR9XG5cblx0XHR0ZXN0KCdtYXRlcmlhbGl6YXRpb24gcmUtYW5jaG9ycyBjdXN0b21pemF0aW9uIGRpc2NvdmVyeSB0byB0aGUgcmVzb2x2ZWQgd29ya3RyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3b3JrdHJlZSA9IFVSSS5qb2luUGF0aChVUkkuZmlsZSh0bXBEaXIpLCAncmVwby53b3JrdHJlZXMnLCAnYWdlbnRzLXgnKTtcblx0XHRcdGNvbnN0IHsgYW5jaG9yLCBzZGtXb3JraW5nRGlyZWN0b3J5LCBvcmlnaW5hbEZvbGRlciB9ID0gYXdhaXQgbWF0ZXJpYWxpemVBbmRDYXB0dXJlQW5jaG9yKHdvcmt0cmVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbmNob3I/LnRvU3RyaW5nKCksIHdvcmt0cmVlLnRvU3RyaW5nKCksICdjdXN0b21pemF0aW9uIGRpc2NvdmVyeSBtdXN0IGJlIGFuY2hvcmVkIHRvIHRoZSB3b3JrdHJlZSwgbm90IHRoZSBvcmlnaW5hbCBmb2xkZXInKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhbmNob3I/LnRvU3RyaW5nKCksIG9yaWdpbmFsRm9sZGVyLnRvU3RyaW5nKCksICd0aGUgYW5jaG9yIG11c3QgbW92ZSBvZmYgdGhlIG9yaWdpbmFsIGZvbGRlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNka1dvcmtpbmdEaXJlY3RvcnksIHdvcmt0cmVlLmZzUGF0aCwgJ3RoZSBTREsgd29ya2luZyBkaXJlY3RvcnkgbXVzdCBiZSB0aGUgd29ya3RyZWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGVyaWFsaXphdGlvbiB3aXRob3V0IGEgd29ya3RyZWUga2VlcHMgdGhlIGFuY2hvciBvbiB0aGUgb3JpZ2luYWwgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxGb2xkZXIgPSBVUkkuam9pblBhdGgoVVJJLmZpbGUodG1wRGlyKSwgJ3JlcG8nKTtcblx0XHRcdGNvbnN0IHsgYW5jaG9yIH0gPSBhd2FpdCBtYXRlcmlhbGl6ZUFuZENhcHR1cmVBbmNob3IodW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbmNob3I/LnRvU3RyaW5nKCksIG9yaWdpbmFsRm9sZGVyLnRvU3RyaW5nKCksICd0aGUgYW5jaG9yIHN0YXlzIG9uIHRoZSBvcmlnaW5hbCBmb2xkZXIgd2hlbiBubyB3b3JrdHJlZSBpcyBjcmVhdGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3b3JrdHJlZSBza2lsbC9pbnN0cnVjdGlvbiBkaXJlY3RvcmllcyBzZW50IHRvIHRoZSBTREsgcmVzb2x2ZSBpbnNpZGUgdGhlIHdvcmt0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsRm9sZGVyID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvb3JpZycgfSk7XG5cdFx0XHRjb25zdCB3b3JrdHJlZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3d0JyB9KTtcblxuXHRcdFx0Ly8gQSBza2lsbCBwcmVzZW50IG9ubHkgaW4gdGhlIE9SSUdJTkFMIGZvbGRlciBtdXN0IE5PVCByZWFjaCB0aGUgU0RLO1xuXHRcdFx0Ly8gdGhlIHdvcmt0cmVlJ3Mgb3duIHNraWxsICsgaW5zdHJ1Y3Rpb24gbXVzdC5cblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuam9pblBhdGgob3JpZ2luYWxGb2xkZXIsICcuZ2l0aHViJywgJ3NraWxscycsICdvcmlnLXNraWxsJywgJ1NLSUxMLm1kJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbm5hbWU6IG9yaWctc2tpbGxcXG5kZXNjcmlwdGlvbjogZnJvbSB0aGUgb3JpZ2luYWwgcmVwb1xcbi0tLVxcbmJvZHknKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKHdvcmt0cmVlLCAnLmdpdGh1YicsICdza2lsbHMnLCAnd3Qtc2tpbGwnLCAnU0tJTEwubWQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnLS0tXFxubmFtZTogd3Qtc2tpbGxcXG5kZXNjcmlwdGlvbjogZnJvbSB0aGUgd29ya3RyZWVcXG4tLS1cXG5ib2R5JykpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5qb2luUGF0aCh3b3JrdHJlZSwgJy5naXRodWInLCAnaW5zdHJ1Y3Rpb25zJywgJ3d0Lmluc3RydWN0aW9ucy5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCctLS1cXG5hcHBseVRvOiBcIioqLyoudHNcIlxcbmRlc2NyaXB0aW9uOiB3b3JrdHJlZSBpbnN0cnVjdGlvblxcbi0tLVxcbmJvZHknKSk7XG5cblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRsZXQgY2FwdHVyZWRDb25maWc6IFBhcmFtZXRlcnM8SVRlc3RDb3BpbG90Q2xpZW50WydjcmVhdGVTZXNzaW9uJ10+WzBdIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y2xpZW50LmNyZWF0ZVNlc3Npb24gPSBhc3luYyBjb25maWcgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZENvbmZpZyA9IGNvbmZpZztcblx0XHRcdFx0cmV0dXJuIG5ldyBNb2NrQ29waWxvdFNlc3Npb24oKSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyBhZ2VudCB9ID0gY3JlYXRlVGVzdEFnZW50Q29udGV4dChkaXNwb3NhYmxlcywge1xuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFNlc3Npb25EYXRhU2VydmljZSgpKSxcblx0XHRcdFx0Y29waWxvdENsaWVudDogY2xpZW50LFxuXHRcdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGUgYWN0aXZlLWNsaWVudCBjbGFpbSBhbmNob3JzIHRoZSBwcm92aXNpb25hbCBwbHVnaW4gY29udHJvbGxlciB0b1xuXHRcdFx0Ly8gdGhlIE9SSUdJTkFMIGZvbGRlciBmaXJzdDsgdGhlIGhvc3QgcHVzaGVzIHRoZSB3b3JrdHJlZSBpbnRvIHRoZSBmaXJzdFxuXHRcdFx0Ly8gc2VuZCwgc28gdGhpcyBleGVyY2lzZXMgdGhlIHJlLWFuY2hvciBhdCBtYXRlcmlhbGl6YXRpb24uXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCAndG9rZW4nKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWdlbnQuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0c2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICd3dC1kaXJzLXNlc3Npb24nKSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFtvcmlnaW5hbEZvbGRlcl0sXG5cdFx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7IGNsaWVudElkOiAnYzEnLCB0b29sczogW10gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJvdmlzaW9uYWwsIHRydWUpO1xuXHRcdFx0XHRhd2FpdCBhZ2VudC5jaGF0cy5zZW5kTWVzc2FnZShkZWZhdWx0Q2hhdFVyaShyZXN1bHQuc2Vzc2lvbiksICdoZWxsbycsIFt3b3JrdHJlZV0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0Lm9rKGNhcHR1cmVkQ29uZmlnLCAndGhlIFNESyBjcmVhdGVTZXNzaW9uIG11c3QgcnVuIGR1cmluZyBtYXRlcmlhbGl6YXRpb24nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBjYXB0dXJlZENvbmZpZy53b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRcdHNraWxsRGlyZWN0b3JpZXM6IGNhcHR1cmVkQ29uZmlnLnNraWxsRGlyZWN0b3JpZXMsXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25EaXJlY3RvcmllczogY2FwdHVyZWRDb25maWcuaW5zdHJ1Y3Rpb25EaXJlY3Rvcmllcyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmt0cmVlLmZzUGF0aCxcblx0XHRcdFx0XHRza2lsbERpcmVjdG9yaWVzOiBbVVJJLmpvaW5QYXRoKHdvcmt0cmVlLCAnLmdpdGh1YicsICdza2lsbHMnLCAnd3Qtc2tpbGwnKS5mc1BhdGhdLFxuXHRcdFx0XHRcdGluc3RydWN0aW9uRGlyZWN0b3JpZXM6IFtVUkkuam9pblBhdGgod29ya3RyZWUsICcuZ2l0aHViJywgJ2luc3RydWN0aW9ucycpLmZzUGF0aF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdza2lsbC9pbnN0cnVjdGlvbiBkaXJlY3RvcmllcyBzZW50IHRvIHRoZSBTREsgbXVzdCByZXNvbHZlIGluc2lkZSB0aGUgd29ya3RyZWUsIG5ldmVyIHRoZSBvcmlnaW5hbCBmb2xkZXInLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHRzdWl0ZSgnY3VzdG9tIGFnZW50IHdvcmt0cmVlIHRyYW5zbGF0aW9uJywgKCkgPT4ge1xuXG5cdFx0Ly8gVGhlIG5ldyBtZXRob2RzIHVuZGVyIHRlc3QgYXJlIHByaXZhdGU7IHJlYWNoIGluIHRoZSBzYW1lIHdheSB0aGVcblx0XHQvLyBzdXJyb3VuZGluZyBzdWl0ZXMgZG8gKGUuZy4gYGN1c3RvbWl6YXRpb24gYW5jaG9yaW5nYCkuXG5cdFx0dHlwZSBBZ2VudEludGVybmFscyA9IHtcblx0XHRcdF9nZXRBbHRlcm5hdGl2ZUFnZW50Rm9yV29ya3RyZWUocHJvdmlzaW9uYWw6IHVua25vd24sIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0X3Jlc29sdmVBZ2VudFdoZW5NYXRlcmlhbGl6aW5nKHByb3Zpc2lvbmFsOiB1bmtub3duLCBzbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90LCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHsgYWdlbnQ6IEFnZW50U2VsZWN0aW9uOyBuYW1lOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD47XG5cdFx0XHRfcmVzb2x2ZUFnZW50TmFtZShzbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90LCBhZ2VudDogQWdlbnRTZWxlY3Rpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRfY3JlYXRlQWdlbnRTZXNzaW9uKGxhdW5jaFBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiwgY3VzdG9taXphdGlvbkRpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBhY3RpdmVDbGllbnQ6IHVua25vd24sIGlkZW50aXR5PzogeyBzZXNzaW9uVXJpOiBVUkk7IGNoYXRDaGFubmVsVXJpOiBVUkkgfSk6IENvcGlsb3RBZ2VudFNlc3Npb247XG5cdFx0XHRfcmVhZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHsgYWdlbnQ/OiBBZ2VudFNlbGVjdGlvbiB9Pjtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVwbyA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IHdvcmt0cmVlID0gVVJJLmpvaW5QYXRoKFVSSS5maWxlKCcvcmVwby53b3JrdHJlZXMnKSwgJ2FnZW50cy14Jyk7XG5cdFx0Y29uc3QgcmVwb0FnZW50VXJpID0gVVJJLmpvaW5QYXRoKHJlcG8sICcuZ2l0aHViJywgJ2FnZW50cycsICdhZ2VudC5tZCcpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgd29ya3RyZWVBZ2VudFVyaSA9IFVSSS5qb2luUGF0aCh3b3JrdHJlZSwgJy5naXRodWInLCAnYWdlbnRzJywgJ2FnZW50Lm1kJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBlbXB0eVNuYXBzaG90OiBJQWN0aXZlQ2xpZW50U25hcHNob3QgPSB7IHRvb2xzOiBbXSwgcGx1Z2luczogW10sIG1jcFNlcnZlcnM6IHt9IH07XG5cblx0XHRmdW5jdGlvbiBwcm92aXNpb25hbCh3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCk6IHVua25vd24ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncHJvdi1hZ2VudCcpO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSksIHNlc3Npb25VcmksIHdvcmtpbmdEaXJlY3RvcnksIG1vZGVsOiB1bmRlZmluZWQsIGFnZW50LCBwcm9qZWN0OiB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHR0ZXN0KCdfZ2V0QWx0ZXJuYXRpdmVBZ2VudEZvcldvcmt0cmVlIHJld3JpdGVzIGEgcmVwbyBhZ2VudCBwYXRoIG9udG8gdGhlIHdvcmt0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgQWdlbnRJbnRlcm5hbHM7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0aW50ZXJuYWxzLl9nZXRBbHRlcm5hdGl2ZUFnZW50Rm9yV29ya3RyZWUocHJvdmlzaW9uYWwocmVwbywgeyB1cmk6IHJlcG9BZ2VudFVyaSB9KSwgd29ya3RyZWUpLFxuXHRcdFx0XHRcdHsgdXJpOiB3b3JrdHJlZUFnZW50VXJpIH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnX2dldEFsdGVybmF0aXZlQWdlbnRGb3JXb3JrdHJlZSByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRoZXJlIGlzIG5vdGhpbmcgdG8gdHJhbnNsYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVUZXN0QWdlbnQoZGlzcG9zYWJsZXMsIHsgY29waWxvdENsaWVudDogbmV3IFRlc3RDb3BpbG90Q2xpZW50KFtdKSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGludGVybmFscyA9IGFnZW50IGFzIHVua25vd24gYXMgQWdlbnRJbnRlcm5hbHM7XG5cdFx0XHRcdGNvbnN0IG91dHNpZGVSZXBvQWdlbnQ6IEFnZW50U2VsZWN0aW9uID0geyB1cmk6IFVSSS5maWxlKCcvaG9tZS9tZS8uY29waWxvdC9hZ2VudHMvYWdlbnQubWQnKS50b1N0cmluZygpIH07XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bm9BZ2VudDogaW50ZXJuYWxzLl9nZXRBbHRlcm5hdGl2ZUFnZW50Rm9yV29ya3RyZWUocHJvdmlzaW9uYWwocmVwbywgdW5kZWZpbmVkKSwgd29ya3RyZWUpLFxuXHRcdFx0XHRcdFx0Zm9sZGVySXNvbGF0aW9uOiBpbnRlcm5hbHMuX2dldEFsdGVybmF0aXZlQWdlbnRGb3JXb3JrdHJlZShwcm92aXNpb25hbChyZXBvLCB7IHVyaTogcmVwb0FnZW50VXJpIH0pLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRcdFx0c2FtZVdvcmtpbmdEaXJlY3Rvcnk6IGludGVybmFscy5fZ2V0QWx0ZXJuYXRpdmVBZ2VudEZvcldvcmt0cmVlKHByb3Zpc2lvbmFsKHJlcG8sIHsgdXJpOiByZXBvQWdlbnRVcmkgfSksIHJlcG8pLFxuXHRcdFx0XHRcdFx0YWdlbnRPdXRzaWRlUmVwbzogaW50ZXJuYWxzLl9nZXRBbHRlcm5hdGl2ZUFnZW50Rm9yV29ya3RyZWUocHJvdmlzaW9uYWwocmVwbywgb3V0c2lkZVJlcG9BZ2VudCksIHdvcmt0cmVlKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5vQWdlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGZvbGRlcklzb2xhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c2FtZVdvcmtpbmdEaXJlY3Rvcnk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGFnZW50T3V0c2lkZVJlcG86IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgZGlzcG9zZUFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ19yZXNvbHZlQWdlbnRXaGVuTWF0ZXJpYWxpemluZyBrZWVwcyB0aGUgb3JpZ2luYWwgYWdlbnQgZm9yIGZvbGRlciBpc29sYXRpb24gKG5vIHdvcmt0cmVlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSkgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIEFnZW50SW50ZXJuYWxzO1xuXHRcdFx0XHRpbnRlcm5hbHMuX3Jlc29sdmVBZ2VudE5hbWUgPSAoX3NuYXBzaG90LCBzZWxlY3Rpb24pID0+IHNlbGVjdGlvbi51cmkgPT09IHJlcG9BZ2VudFVyaSA/ICdSZXBvIEFnZW50JyA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Ly8gRm9sZGVyIGlzb2xhdGlvbjogdGhlIHJlc29sdmVkIHdvcmtpbmcgZGlyZWN0b3J5IGVxdWFscyB0aGVcblx0XHRcdFx0Ly8gdXNlci1waWNrZWQgZm9sZGVyLCBzbyB0aGVyZSBpcyBubyB3b3JrdHJlZSBjb3B5IHRvIHRyYW5zbGF0ZSB0b1xuXHRcdFx0XHQvLyBhbmQgdGhlIG9yaWdpbmFsbHkgc2VsZWN0ZWQgYWdlbnQgaXMga2VwdCBhcy1pcy5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRhd2FpdCBpbnRlcm5hbHMuX3Jlc29sdmVBZ2VudFdoZW5NYXRlcmlhbGl6aW5nKHByb3Zpc2lvbmFsKHJlcG8sIHsgdXJpOiByZXBvQWdlbnRVcmkgfSksIGVtcHR5U25hcHNob3QsIHJlcG8pLFxuXHRcdFx0XHRcdHsgYWdlbnQ6IHsgdXJpOiByZXBvQWdlbnRVcmkgfSwgbmFtZTogJ1JlcG8gQWdlbnQnIH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnX3Jlc29sdmVBZ2VudFdoZW5NYXRlcmlhbGl6aW5nIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gYWdlbnQgaXMgc2VsZWN0ZWQgb3IgbmVpdGhlciByZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlVGVzdEFnZW50KGRpc3Bvc2FibGVzLCB7IGNvcGlsb3RDbGllbnQ6IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSkgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpbnRlcm5hbHMgPSBhZ2VudCBhcyB1bmtub3duIGFzIEFnZW50SW50ZXJuYWxzO1xuXHRcdFx0XHRpbnRlcm5hbHMuX3Jlc29sdmVBZ2VudE5hbWUgPSAoKSA9PiB1bmRlZmluZWQ7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bm9BZ2VudDogYXdhaXQgaW50ZXJuYWxzLl9yZXNvbHZlQWdlbnRXaGVuTWF0ZXJpYWxpemluZyhwcm92aXNpb25hbChyZXBvLCB1bmRlZmluZWQpLCBlbXB0eVNuYXBzaG90LCB3b3JrdHJlZSksXG5cdFx0XHRcdFx0XHRuZWl0aGVyUmVzb2x2ZXM6IGF3YWl0IGludGVybmFscy5fcmVzb2x2ZUFnZW50V2hlbk1hdGVyaWFsaXppbmcocHJvdmlzaW9uYWwocmVwbywgeyB1cmk6IHJlcG9BZ2VudFVyaSB9KSwgZW1wdHlTbmFwc2hvdCwgd29ya3RyZWUpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0eyBub0FnZW50OiB1bmRlZmluZWQsIG5laXRoZXJSZXNvbHZlczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0ZXJpYWxpemF0aW9uIHJld3JpdGVzIGEgcmVwbyBhZ2VudCB0byBpdHMgd29ya3RyZWUgY29weSBhbmQgcGVyc2lzdHMgaXQgKG5vIHJlc29sdXRpb24gc3R1YmJpbmcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gRW5kLXRvLWVuZCB0aHJvdWdoIHJlYWwgY3VzdG9taXphdGlvbiBkaXNjb3Zlcnk6IHRoZSBzYW1lIGN1c3RvbVxuXHRcdFx0Ly8gYWdlbnQgZmlsZSBleGlzdHMgaW4gYm90aCB0aGUgb3JpZ2luYWwgcmVwbyBhbmQgdGhlIHdvcmt0cmVlLiBUaGVcblx0XHRcdC8vIHVzZXIgc2VsZWN0cyB0aGUgcmVwbyBjb3B5LCBidXQgb25jZSB0aGUgd29ya3RyZWUgaXMgbWF0ZXJpYWxpemVkXG5cdFx0XHQvLyBkaXNjb3ZlcnkgcmUtYW5jaG9ycyB0aGVyZSwgc28gdGhlIHBlcnNpc3RlZC9sYXVuY2hlZCBhZ2VudCBtdXN0IGJlXG5cdFx0XHQvLyB0aGUgd29ya3RyZWUgY29weSBcdTIwMTQgcHJvdmluZyB0aGUgdHJhbnNsYXRpb24gYWdhaW5zdCByZWFsIHJlc29sdXRpb25cblx0XHRcdC8vIHJhdGhlciB0aGFuIGEgc3R1YmJlZCBgX3Jlc29sdmVBZ2VudE5hbWVgLlxuXHRcdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cblx0XHRcdGNvbnN0IHJlcG9Gb2xkZXIgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9yZXBvJyB9KTtcblx0XHRcdGNvbnN0IHdvcmt0cmVlRm9sZGVyID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvcmVwby53b3JrdHJlZXMvYWdlbnRzLXgnIH0pO1xuXHRcdFx0Y29uc3QgcmVwb0FnZW50RmlsZSA9IFVSSS5qb2luUGF0aChyZXBvRm9sZGVyLCAnLmdpdGh1YicsICdhZ2VudHMnLCAnYWdlbnQubWQnKTtcblx0XHRcdGNvbnN0IHdvcmt0cmVlQWdlbnRGaWxlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlRm9sZGVyLCAnLmdpdGh1YicsICdhZ2VudHMnLCAnYWdlbnQubWQnKTtcblx0XHRcdGNvbnN0IGFnZW50Q29udGVudHMgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCctLS1cXG5uYW1lOiBNeSBBZ2VudFxcbmRlc2NyaXB0aW9uOiBhIGN1c3RvbSBhZ2VudFxcbi0tLVxcbmJvZHknKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXBvQWdlbnRGaWxlLCBhZ2VudENvbnRlbnRzKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZSh3b3JrdHJlZUFnZW50RmlsZSwgYWdlbnRDb250ZW50cyk7XG5cblx0XHRcdGNvbnN0IGNsaWVudCA9IG5ldyBUZXN0Q29waWxvdENsaWVudChbXSk7XG5cdFx0XHRjbGllbnQuY3JlYXRlU2Vzc2lvbiA9IGFzeW5jICgpID0+IG5ldyBNb2NrQ29waWxvdFNlc3Npb24oKSBhcyB1bmtub3duIGFzIENvcGlsb3RTZXNzaW9uO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTZXNzaW9uRGF0YVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCB7IGFnZW50IH0gPSBjcmVhdGVUZXN0QWdlbnRDb250ZXh0KGRpc3Bvc2FibGVzLCB7IHNlc3Npb25EYXRhU2VydmljZSwgY29waWxvdENsaWVudDogY2xpZW50LCBmaWxlU2VydmljZSB9KTtcblxuXHRcdFx0bGV0IGxhdW5jaEFnZW50TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaW50ZXJuYWxzID0gYWdlbnQgYXMgdW5rbm93biBhcyBBZ2VudEludGVybmFscztcblx0XHRcdGNvbnN0IG9yaWdpbmFsQ3JlYXRlQWdlbnRTZXNzaW9uID0gaW50ZXJuYWxzLl9jcmVhdGVBZ2VudFNlc3Npb247XG5cdFx0XHRpbnRlcm5hbHMuX2NyZWF0ZUFnZW50U2Vzc2lvbiA9IChsYXVuY2hQbGFuLCBjdXN0b21pemF0aW9uRGlyZWN0b3J5LCBhY3RpdmVDbGllbnQsIGlkZW50aXR5KSA9PiB7XG5cdFx0XHRcdGxhdW5jaEFnZW50TmFtZSA9IGxhdW5jaFBsYW4ucmVzb2x2ZWRBZ2VudE5hbWU7XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbENyZWF0ZUFnZW50U2Vzc2lvbi5jYWxsKGFnZW50LCBsYXVuY2hQbGFuLCBjdXN0b21pemF0aW9uRGlyZWN0b3J5LCBhY3RpdmVDbGllbnQsIGlkZW50aXR5KTtcblx0XHRcdH07XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFnZW50LmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsICd0b2tlbicpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0XHRzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2FnZW50LXRyYW5zbGF0ZScpLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3JlcG9Gb2xkZXJdLFxuXHRcdFx0XHRcdGFnZW50OiB7IHVyaTogcmVwb0FnZW50RmlsZS50b1N0cmluZygpIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByb3Zpc2lvbmFsLCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoZGVmYXVsdENoYXRVcmkocmVzdWx0LnNlc3Npb24pLCAnaGVsbG8nLCBbd29ya3RyZWVGb2xkZXJdLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHQvLyBgX3JlYWRTZXNzaW9uTWV0YWRhdGFgIHJlYWRzIGJhY2sgdGhlIGV4YWN0IGFnZW50IGZpZWxkIHRoZVxuXHRcdFx0XHQvLyByZXN1bWUgcGF0aCBjb25zdW1lcywgc28gYXNzZXJ0aW5nIGl0IHN0YW5kcyBpbiBmb3IgcmVzdG9yZS5cblx0XHRcdFx0Y29uc3Qgc3RvcmVkID0gYXdhaXQgaW50ZXJuYWxzLl9yZWFkU2Vzc2lvbk1ldGFkYXRhKHJlc3VsdC5zZXNzaW9uKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7IHN0b3JlZEFnZW50OiBzdG9yZWQuYWdlbnQsIGxhdW5jaEFnZW50TmFtZSB9LFxuXHRcdFx0XHRcdHsgc3RvcmVkQWdlbnQ6IHsgdXJpOiB3b3JrdHJlZUFnZW50RmlsZS50b1N0cmluZygpIH0sIGxhdW5jaEFnZW50TmFtZTogJ015IEFnZW50JyB9LFxuXHRcdFx0XHRcdCd0aGUgcmVwbyBhZ2VudCBtdXN0IGJlIHJld3JpdHRlbiB0byBpdHMgd29ya3RyZWUgY29weSwgYm90aCBmb3IgdGhlIFNESyBsYXVuY2ggYW5kIHRoZSBwZXJzaXN0ZWQgbWV0YWRhdGEgdGhlIHJlc3RvcmUgcGF0aCByZWFkcycsXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhd2FpdCBkaXNwb3NlQWdlbnQoYWdlbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVFBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxtQkFBbUIsMkJBQTJCO0FBQ3ZELFNBQVMsa0JBQTJFO0FBQ3BGLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBZ0M7QUFDekMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhLFVBQVUsc0JBQXNCO0FBQ3RELFNBQVMsK0JBQStCO0FBR3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkNBQTJDLDRDQUE0Qyw0Q0FBNEM7QUFDNUksU0FBUywyQkFBaUQ7QUFDMUQsU0FBUyxjQUFjLHlDQUFtSjtBQUMxSyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQixjQUFjLHNCQUFzQixvQ0FBb0MseUJBQXlCLGFBQWEsa0JBQWtCLGdCQUFnQix1QkFBdUIsV0FBVyx1QkFBb0k7QUFDcFYsU0FBUyxtQkFBbUIsZUFBZSwrQkFBOEY7QUFDekksU0FBUyxrQkFBdUQ7QUFFaEUsU0FBUywyQkFBMkIsa0NBQWtDO0FBQ3RFLFNBQVMsdUJBQXVCLDhCQUE4QjtBQUM5RCxTQUFTLDRCQUErRDtBQUN4RSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQiw2QkFBNkI7QUFDNUQsU0FBUyxtQ0FBbUMsY0FBYyxxQkFBcUIsYUFBYSwyQkFBMkI7QUFDdkgsU0FBUyxpREFBaUQ7QUFDMUQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx5QkFBeUIsMkJBQTJCO0FBQzdELFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsdUNBQXVDO0FBRWhELFNBQVMsMEJBQTBCLG1DQUFtQyxnQ0FBZ0M7QUFFdEcsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0IsNkJBQTZCO0FBQzVELFNBQVMsMEJBQThJO0FBRXZKLFNBQVMsNkJBQTZCO0FBU3RDLFNBQVMsWUFBWSxPQUF1RDtBQUMzRSxTQUFRLE1BQXFFO0FBQzlFO0FBRUEsU0FBUyxlQUFlLFNBQW1CO0FBQzFDLFNBQU8sSUFBSSxNQUFNLG9CQUFvQixPQUFPLENBQUM7QUFDOUM7QUFHQSxTQUFTLHNCQUFzQixPQUFxQixXQUFtQixNQUFxQjtBQUMzRixRQUFNLFdBQVcsWUFBWSxLQUFLO0FBQ2xDLFFBQU0saUJBQWlCLG9CQUFvQixhQUFhLElBQUksY0FBYyxTQUFTLEVBQUUsU0FBUyxDQUFDO0FBQy9GLE1BQUksUUFBUSxTQUFTLElBQUksU0FBUztBQUNsQyxNQUFJLENBQUMsT0FBTztBQUNYLFlBQVEsSUFBSSxvQkFBb0I7QUFDaEMsYUFBUyxJQUFJLFdBQVcsS0FBSztBQUFBLEVBQzlCO0FBQ0EsUUFBTSxlQUFlLGdCQUFnQixJQUFJLG9CQUFvQixJQUEyQixDQUFDO0FBQzFGO0FBR0EsU0FBUyxnQkFBZ0IsT0FBcUIsU0FBYyxNQUFxQjtBQUNoRixRQUFNLFlBQVksYUFBYSxHQUFHLElBQUksTUFBTSxtQ0FBbUMsT0FBTyxDQUFDLENBQUM7QUFDeEYsUUFBTSxXQUFXLFlBQVksS0FBSztBQUNsQyxNQUFJLFFBQVEsU0FBUyxJQUFJLFNBQVM7QUFDbEMsTUFBSSxDQUFDLE9BQU87QUFDWCxZQUFRLElBQUksb0JBQW9CO0FBQ2hDLGFBQVMsSUFBSSxXQUFXLEtBQUs7QUFBQSxFQUM5QjtBQUNBLFFBQU0saUJBQWlCLFFBQVEsU0FBUyxHQUFHLElBQUksb0JBQW9CLElBQTJCLENBQUM7QUFDaEc7QUFHQSxTQUFTLGdCQUFnQixPQUFxQixTQUErQztBQUM1RixRQUFNLFlBQVksYUFBYSxHQUFHLElBQUksTUFBTSxtQ0FBbUMsT0FBTyxDQUFDLENBQUM7QUFDeEYsU0FBTyxZQUFZLEtBQUssRUFBRSxJQUFJLFNBQVMsR0FBRyxZQUFZLFFBQVEsU0FBUyxDQUFDO0FBQ3pFO0FBR0EsU0FBUyxnQkFBZ0IsT0FBcUIsU0FBdUI7QUFDcEUsUUFBTSxZQUFZLGFBQWEsR0FBRyxJQUFJLE1BQU0sbUNBQW1DLE9BQU8sQ0FBQyxDQUFDO0FBQ3hGLFNBQU8sWUFBWSxLQUFLLEVBQUUsSUFBSSxTQUFTLEdBQUcsWUFBWSxRQUFRLFNBQVMsQ0FBQyxLQUFLO0FBQzlFO0FBR0EsU0FBUyxjQUFjLE9BQTZCO0FBQ25ELE1BQUksUUFBUTtBQUNaLGFBQVcsU0FBUyxZQUFZLEtBQUssRUFBRSxPQUFPLEdBQUc7QUFDaEQsYUFBUyxNQUFNLGFBQWEsRUFBRTtBQUFBLEVBQy9CO0FBQ0EsU0FBTztBQUNSO0FBRUEsTUFBTSx1QkFBc0Q7QUFBQSxFQUE1RDtBQUdDLFNBQVMsV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLFlBQVksTUFBTSxnQkFBZ0IsQ0FBQztBQUFBO0FBQUEsRUFFMUUsTUFBTSxtQkFBbUIsV0FBbUIsaUJBQThDLFdBQW9GO0FBQzdLLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFDRDtBQUVBLE1BQU0sd0JBQXdEO0FBQUEsRUFBOUQ7QUFHQywwQkFBa0M7QUFDbEMsc0JBQWlDLElBQUksT0FBTyxFQUFFO0FBQzlDLDBCQUFtRyxDQUFDO0FBQ3BHLGtDQUF1RixDQUFDO0FBQ3hGLDRCQUE2RCxDQUFDO0FBQzlELDRCQUFtQixvQkFBSSxJQUFZO0FBQ25DLG1DQUEwQixvQkFBSSxJQUFZO0FBQUE7QUFBQSxFQUUxQyxNQUFNLG1CQUFnRDtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDMUUsTUFBTSxtQkFBd0Q7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQ2xGLE1BQU0sWUFBMEM7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQ3BFLE1BQU0sVUFBOEI7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFDakQsTUFBTSxjQUFrQztBQUFFLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUNyRCxNQUFNLG9CQUE4QztBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWdCO0FBQUEsRUFDbEYsTUFBTSxtQkFBbUM7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFDdEQsTUFBTSxZQUFZLGdCQUFxQixVQUFlLFlBQW9CLFlBQW1DO0FBQzVHLFNBQUssZUFBZSxLQUFLLEVBQUUsZ0JBQWdCLFVBQVUsWUFBWSxXQUFXLENBQUM7QUFDN0UsU0FBSyxpQkFBaUIsSUFBSSxVQUFVO0FBQUEsRUFDckM7QUFBQSxFQUNBLE1BQU0sMkJBQTBDO0FBQUEsRUFBRTtBQUFBLEVBQ2xELE1BQU0sb0JBQW9CLGdCQUFxQixVQUFlLFlBQW1DO0FBQ2hHLFNBQUssdUJBQXVCLEtBQUssRUFBRSxnQkFBZ0IsVUFBVSxXQUFXLENBQUM7QUFBQSxFQUMxRTtBQUFBLEVBQ0EsTUFBTSxlQUFlLGdCQUFxQixVQUE4QjtBQUN2RSxTQUFLLGlCQUFpQixLQUFLLEVBQUUsZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLEVBQ3hEO0FBQUEsRUFDQSxNQUFNLGFBQWEsaUJBQXNCLFlBQXNDO0FBQzlFLFdBQU8sS0FBSyxpQkFBaUIsSUFBSSxVQUFVO0FBQUEsRUFDNUM7QUFBQSxFQUNBLE1BQU0sc0JBQXNCLGtCQUF5QztBQUNwRSxXQUFPLEtBQUssd0JBQXdCLElBQUksaUJBQWlCLE1BQU07QUFBQSxFQUNoRTtBQUFBLEVBQ0EsTUFBTSxZQUEyQjtBQUFBLEVBQUU7QUFBQSxFQUNuQyxNQUFNLFVBQXlCO0FBQUEsRUFBRTtBQUFBLEVBQ2pDLE1BQU0sY0FBZ0M7QUFBRSxXQUFPO0FBQUEsRUFBTztBQUFBLEVBQ3RELE1BQU0sT0FBc0I7QUFBQSxFQUFFO0FBQUEsRUFDOUIsTUFBTSxPQUFzQjtBQUFBLEVBQUU7QUFBQSxFQUM5QixNQUFNLHFCQUF5QztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDbkUsTUFBTSwwQkFBOEM7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQ3hFLE1BQU0sV0FBK0I7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQ3pELE1BQU0sMkJBQStDO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUN6RSxNQUFNLGFBQWlDO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUMzRCxNQUFNLFlBQTJCO0FBQUEsRUFBRTtBQUFBLEVBQ25DLE1BQU0sYUFBNEI7QUFBQSxFQUFFO0FBQUEsRUFDcEMsTUFBTSxTQUFTLGlCQUFzQixZQUFpRDtBQUNyRixXQUFPLGVBQWUsU0FBUyxLQUFLLGFBQWE7QUFBQSxFQUNsRDtBQUFBLEVBQ0EsTUFBTSw4QkFBMkQ7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQ3JGLE1BQU0sc0JBQW1EO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUM3RSxNQUFNLGdCQUErQztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDekUsTUFBTSw4QkFBa0Q7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQzVFLE1BQU0scUJBQXlDO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUNuRSxNQUFNLG9CQUFpQztBQUFFLFdBQU8sQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUNwRCxNQUFNLDBCQUE4QztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDeEUsTUFBTSwwQkFBOEM7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUN6RTtBQUVBLE1BQU0sNkJBQWtFO0FBQUEsRUFHdkUsTUFBTSxpQkFBZ0M7QUFBQSxFQUFFO0FBQUEsRUFDeEMsYUFBbUI7QUFBQSxFQUFFO0FBQUEsRUFDckIsTUFBTSxXQUEwQjtBQUFBLEVBQUU7QUFBQSxFQUNsQyxTQUFzQjtBQUFFLFdBQU8sV0FBVztBQUFBLEVBQU07QUFBQSxFQUNoRCxTQUFzQjtBQUFFLFdBQU8sV0FBVztBQUFBLEVBQU07QUFBQSxFQUNoRCxpQkFBOEI7QUFBRSxXQUFPLFdBQVc7QUFBQSxFQUFNO0FBQUEsRUFDeEQsb0JBQWlDO0FBQUUsV0FBTyxXQUFXO0FBQUEsRUFBTTtBQUFBLEVBQzNELHVCQUF1QixNQUFjLFFBQXdDO0FBQUUsV0FBTyxJQUFJLFFBQVEsTUFBTTtBQUFBLElBQUUsQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUM5RyxhQUFpQztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDckQsV0FBc0I7QUFBRSxXQUFPO0FBQUEsRUFBVztBQUFBLEVBQzFDLGNBQXVCO0FBQUUsV0FBTztBQUFBLEVBQU87QUFBQSxFQUN2QyxjQUFrQztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDdEQsMkJBQW9DO0FBQUUsV0FBTztBQUFBLEVBQU87QUFBQSxFQUNwRCxrQkFBd0I7QUFBQSxFQUFFO0FBQUEsRUFDMUIsbUJBQXVCO0FBQUUsV0FBTyxDQUFDO0FBQUEsRUFBRztBQUFBLEVBQ3BDLG1CQUE4QjtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDbEQsTUFBTSxrQkFBbUM7QUFBRSxXQUFPO0FBQUEsRUFBYTtBQUFBLEVBQy9ELHVCQUE2QjtBQUFBLEVBQUU7QUFBQSxFQUMvQiwyQkFBaUM7QUFBQSxFQUFFO0FBQUEsRUFDbkMsc0JBQTRCO0FBQUEsRUFBRTtBQUFBLEVBQzlCLHlCQUErQjtBQUFBLEVBQUU7QUFDbEM7QUFFQSxNQUFNLHNCQUFvRDtBQUFBLEVBQTFEO0FBR0MsU0FBUyxlQUErSCxDQUFDO0FBQ3pJLG9CQUFXO0FBSVgsU0FBUyw4QkFBOEIsb0JBQUksSUFBeUM7QUFDcEYsU0FBUyxrQ0FBNEMsQ0FBQztBQUFBO0FBQUEsRUFJdEQsV0FBc0Y7QUFDckYsVUFBTSxJQUFJLE1BQU0sVUFBVTtBQUFBLEVBQzNCO0FBQUEsRUFDQSxNQUFNLGNBQXFEO0FBQUUsVUFBTSxJQUFJLE1BQU0sVUFBVTtBQUFBLEVBQUc7QUFBQSxFQUMxRixNQUFNLFNBQThCO0FBQUUsV0FBTyxDQUFDO0FBQUEsRUFBRztBQUFBLEVBQ2pELE1BQU0sWUFBK0I7QUFBRSxVQUFNLElBQUksTUFBTSxVQUFVO0FBQUEsRUFBRztBQUFBLEVBQ3BFLE1BQU0sa0NBQWtDLGFBQTJEO0FBQ2xHLFNBQUssZ0NBQWdDLEtBQUssV0FBVztBQUNyRCxXQUFPLEtBQUssNEJBQTRCLElBQUksV0FBVyxLQUFLO0FBQUEsTUFDM0QsNEJBQTRCO0FBQUEsTUFDNUIsWUFBWTtBQUFBLE1BQ1osbUJBQW1CO0FBQUEsTUFDbkIsWUFBWTtBQUFBLE1BQ1osVUFBVTtBQUFBLE1BQ1Ysb0JBQW9CO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBQUEsRUFDQSxNQUFNLHFCQUFxQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWE7QUFBQSxFQUN0RCxNQUFNLG1CQUFtQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVc7QUFBQSxFQUNsRCxNQUFNLHNCQUFzQixhQUFxQixTQUErQyxTQUE2RDtBQUM1SixTQUFLLGFBQWEsS0FBSyxFQUFFLE9BQU8sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUMvRCxRQUFJLEtBQUssT0FBTztBQUNmLFlBQU0sS0FBSztBQUFBLElBQ1o7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFFQSxNQUFNLCtCQUErQixXQUEwQztBQUFBLEVBQS9FO0FBQUE7QUFHQyxTQUFpQixhQUFhLG9CQUFJLElBQTZCO0FBQy9ELFNBQVMsaUJBQTJCLENBQUM7QUFzQnJDLFNBQVMsMEJBQTBCLE1BQU07QUFBQTtBQUFBLEVBcEJ6QyxrQkFBa0IsU0FBbUI7QUFBRSxXQUFPLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxNQUFNLGlCQUFpQixhQUFhLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUMvSCxzQkFBc0IsV0FBd0I7QUFBRSxXQUFPLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxNQUFNLGlCQUFpQixTQUFTLEdBQUcsQ0FBQztBQUFBLEVBQUc7QUFBQSxFQUV6SCxhQUFhLFNBQTJDO0FBQ3ZELFVBQU0sWUFBWSxhQUFhLEdBQUcsT0FBTztBQUN6QyxTQUFLLGVBQWUsS0FBSyxTQUFTO0FBQ2xDLFFBQUksS0FBSyxLQUFLLFdBQVcsSUFBSSxTQUFTO0FBQ3RDLFFBQUksQ0FBQyxJQUFJO0FBQ1IsV0FBSyxLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsVUFBVSxDQUFDO0FBQ25ELFdBQUssV0FBVyxJQUFJLFdBQVcsRUFBRTtBQUFBLElBQ2xDO0FBQ0EsV0FBTyxFQUFFLFFBQVEsSUFBSSxTQUFTLE1BQU07QUFBQSxJQUFFLEVBQUU7QUFBQSxFQUN6QztBQUFBLEVBRUEsTUFBTSxnQkFBZ0IsU0FBZ0U7QUFDckYsVUFBTSxLQUFLLEtBQUssV0FBVyxJQUFJLGFBQWEsR0FBRyxPQUFPLENBQUM7QUFDdkQsV0FBTyxLQUFLLEVBQUUsUUFBUSxJQUFJLFNBQVMsTUFBTTtBQUFBLElBQUUsRUFBRSxJQUFJO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLG9CQUFtQztBQUFFLFdBQU8sUUFBUSxRQUFRO0FBQUEsRUFBRztBQUFBLEVBRS9ELHNCQUFxQztBQUFFLFdBQU8sUUFBUSxRQUFRO0FBQUEsRUFBRztBQUFBLEVBQ2pFLFdBQTBCO0FBQUUsV0FBTyxRQUFRLFFBQVE7QUFBQSxFQUFHO0FBQ3ZEO0FBMEJBLFNBQVMsZUFBZSxPQUFnRDtBQUN2RSxTQUFPO0FBQUEsSUFDTixJQUFJLE1BQU07QUFBQSxJQUNWLE1BQU0sTUFBTTtBQUFBLElBQ1osY0FBYztBQUFBLE1BQ2IsVUFBVTtBQUFBLFFBQ1QsUUFBUSxNQUFNLGNBQWMsVUFBVSxVQUFVO0FBQUEsUUFDaEQsaUJBQWlCLENBQUMsQ0FBQyxNQUFNLDJCQUEyQjtBQUFBLE1BQ3JEO0FBQUEsTUFDQSxRQUFRO0FBQUEsUUFDUCwyQkFBMkIsTUFBTSxjQUFjLFFBQVEsNkJBQTZCO0FBQUEsUUFDcEYsbUJBQW1CLE1BQU0sY0FBYyxRQUFRO0FBQUEsUUFDL0MsbUJBQW1CLE1BQU0sY0FBYyxRQUFRO0FBQUEsTUFDaEQ7QUFBQSxJQUNEO0FBQUEsSUFDQSxHQUFJLE1BQU0sU0FBUyxFQUFFLFFBQVEsRUFBRSxPQUFPLE1BQU0sT0FBTyxTQUFTLFdBQVcsT0FBTyxHQUFHLEVBQUUsSUFBSSxDQUFDO0FBQUEsSUFDeEYsR0FBSSxNQUFNLFVBQVUsRUFBRSxTQUFTLE1BQU0sUUFBUSxJQUFJLENBQUM7QUFBQSxJQUNsRCxHQUFJLE1BQU0sc0JBQXNCLEVBQUUscUJBQXFCLE1BQU0sb0JBQW9CLElBQUksQ0FBQztBQUFBLElBQ3RGLEdBQUksTUFBTSwyQkFBMkIsRUFBRSwwQkFBMEIsTUFBTSx5QkFBeUIsSUFBSSxDQUFDO0FBQUEsSUFDckcsR0FBSSxNQUFNLDRCQUE0QixFQUFFLDJCQUEyQixNQUFNLDBCQUEwQixJQUFJLENBQUM7QUFBQSxJQUN4RyxHQUFJLE1BQU0seUJBQXlCLEVBQUUsd0JBQXdCLE1BQU0sdUJBQXVCLElBQUksQ0FBQztBQUFBLEVBQ2hHO0FBQ0Q7QUFFQSxNQUFNLGtCQUFnRDtBQUFBLEVBK0JyRCxZQUNrQixXQUNBLFVBQTRDLENBQUMsR0FDN0Q7QUFGZ0I7QUFDQTtBQWhDbEIsU0FBUyxNQUFpQztBQUFBLE1BQ3pDLFVBQVUsRUFBRSxNQUFNLGFBQWEsRUFBRSxXQUFXLGlCQUFpQixHQUFHO0FBQUEsTUFDaEUsUUFBUTtBQUFBLFFBQ1AsTUFBTSxPQUFNLFdBQVU7QUFDckIsZUFBSyxrQkFBa0IsS0FBSyxNQUFNO0FBQ2xDLGdCQUFNLE9BQU8sS0FBSyxlQUFlLE1BQU0sS0FBSyxLQUFLO0FBQ2pELGdCQUFNLFNBQVMsS0FBSyxtQkFBbUIsTUFBTSxLQUFLLEtBQUs7QUFDdkQsZ0JBQU0sUUFBUSxLQUFLLGdCQUFnQixNQUFNO0FBQ3pDLGdCQUFNO0FBQ04sY0FBSSxPQUFPO0FBQ1Ysa0JBQU07QUFBQSxVQUNQO0FBQ0EsaUJBQU8sRUFBRSxRQUFRLE9BQU8sSUFBSSxjQUFjLEVBQUU7QUFBQSxRQUM3QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsMEJBQWlCO0FBQ2pCLHlCQUFnQjtBQUVoQixnQ0FBdUI7QUFDdkIsU0FBUyxvQkFBd0QsQ0FBQztBQUNsRSxTQUFTLGtCQUEyQixDQUFDO0FBSXJDO0FBQUEsU0FBUyxpQkFBa0MsQ0FBQztBQUM1QyxTQUFTLHFCQUFnRCxDQUFDO0FBQzFELFNBQVMsMEJBQW9DLENBQUM7QUFDOUMsU0FBUyxvQkFBOEIsQ0FBQztBQTBCeEMseUJBQXFELFlBQVk7QUFBRSxZQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxJQUFHO0FBQ3ZHLHlCQUFxRCxZQUFZO0FBQUUsWUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsSUFBRztBQUFBLEVBdEJuRztBQUFBLEVBRUosTUFBTSxRQUF1QjtBQUM1QixTQUFLO0FBQ0wsVUFBTSxLQUFLO0FBQUEsRUFDWjtBQUFBLEVBQ0EsTUFBTSxPQUErQztBQUNwRCxTQUFLO0FBQ0wsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBQ0EsTUFBTSxlQUErRDtBQUNwRSxTQUFLO0FBQ0wsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBQ0EsTUFBTSxtQkFBbUIsV0FBeUU7QUFDakcsU0FBSyx3QkFBd0IsS0FBSyxTQUFTO0FBQzNDLFdBQU8sS0FBSyxVQUFVLEtBQUssT0FBSyxFQUFFLGNBQWMsU0FBUztBQUFBLEVBQzFEO0FBQUEsRUFDQSxNQUFNLGNBQWMsV0FBa0M7QUFDckQsU0FBSyxrQkFBa0IsS0FBSyxTQUFTO0FBQUEsRUFDdEM7QUFHRDtBQVFBLE1BQU0sbUJBQW1CO0FBQUEsRUFBekI7QUFDQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxNQUFNO0FBQUEsTUFDZCxTQUFTO0FBQUEsUUFDUixRQUFRLGFBQWEsRUFBRSxTQUFTLEtBQUs7QUFBQSxNQUN0QztBQUFBLE1BQ0EsYUFBYTtBQUFBLFFBQ1osYUFBYSxPQUFPLEVBQUUsS0FBSyxPQUF5QyxFQUFFLFNBQVMsTUFBTSxLQUFLO0FBQUEsTUFDM0Y7QUFBQSxJQUNEO0FBQ0EsU0FBaUIsWUFBWSxvQkFBSSxJQUF5QjtBQUMxRCxTQUFpQixpQkFBaUIsb0JBQUksSUFBbUY7QUFBQTtBQUFBLEVBSXpILEdBQStCLG9CQUE2QyxTQUFtRDtBQUM5SCxRQUFJLE9BQU8sdUJBQXVCLFlBQVk7QUFDN0MsV0FBSyxVQUFVLElBQUksa0JBQWtCO0FBQ3JDLGFBQU8sTUFBTSxLQUFLLFVBQVUsT0FBTyxrQkFBa0I7QUFBQSxJQUN0RDtBQUNBLFFBQUksQ0FBQyxTQUFTO0FBQ2IsWUFBTSxJQUFJLE1BQU0sdUJBQXVCLGtCQUFrQixFQUFFO0FBQUEsSUFDNUQ7QUFDQSxRQUFJLFdBQVcsS0FBSyxlQUFlLElBQUksa0JBQWtCO0FBQ3pELFFBQUksQ0FBQyxVQUFVO0FBQ2QsaUJBQVcsb0JBQUksSUFBSTtBQUNuQixXQUFLLGVBQWUsSUFBSSxvQkFBb0IsUUFBUTtBQUFBLElBQ3JEO0FBQ0EsVUFBTSxlQUFlO0FBQ3JCLGFBQVMsSUFBSSxZQUFZO0FBQ3pCLFdBQU8sTUFBTSxTQUFTLE9BQU8sWUFBWTtBQUFBLEVBQzFDO0FBQUEsRUFFQSxLQUFpQyxPQUFxQztBQUNyRSxVQUFNLGVBQWU7QUFDckIsZUFBVyxXQUFXLEtBQUssV0FBVztBQUNyQyxjQUFRLFlBQVk7QUFBQSxJQUNyQjtBQUNBLFVBQU0sYUFBYTtBQUNuQixlQUFXLFdBQVcsS0FBSyxlQUFlLElBQUksTUFBTSxJQUFJLEtBQUssQ0FBQyxHQUFHO0FBQ2hFLGNBQVEsVUFBVTtBQUFBLElBQ25CO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxPQUF3QjtBQUFFLFdBQU87QUFBQSxFQUFJO0FBQUEsRUFDM0MsTUFBTSxRQUF1QjtBQUFBLEVBQUU7QUFBQSxFQUMvQixNQUFNLFdBQTBCO0FBQUEsRUFBRTtBQUFBLEVBQ2xDLE1BQU0sWUFBOEQ7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFDakYsTUFBTSxhQUE0QjtBQUFBLEVBQUU7QUFDckM7QUFFQSxNQUFNLHFCQUFxQixNQUFNO0FBQUEsRUFDaEMsWUFBWSxTQUEwQixNQUFjO0FBQ25ELFVBQU0sT0FBTztBQUR3QjtBQUFBLEVBRXRDO0FBQ0Q7QUFFQSxNQUFNLHlCQUEwRDtBQUFBLEVBRy9ELE1BQU0sd0JBQXdCO0FBQzdCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFDQSxpQkFBaUI7QUFDaEIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLDBCQUEwQjtBQUFBLEVBQUU7QUFBQSxFQUM1QixNQUFNLFFBQVE7QUFBQSxFQUVkO0FBQ0Q7QUFFQSxNQUFNLGtCQUFxRDtBQUFBLEVBQTNEO0FBRUMsNkJBQW9CO0FBWXBCLFNBQVMsUUFBaUMsQ0FBQyxPQUFPLFNBQVMsV0FBVyxNQUFNLE9BQU8sSUFBSTtBQUFBO0FBQUEsRUFUdkYsU0FBUyxXQUFtQixhQUEyRDtBQUN0RixXQUFPLFdBQVc7QUFBQSxFQUNuQjtBQUFBLEVBRUEsTUFBTSxhQUFhLE1BQTJDO0FBQzdELFNBQUs7QUFDTCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBR0Q7QUFFQSxJQUFNLHlCQUFOLGNBQXFDLGFBQWE7QUFBQSxFQUNqRCxZQUNrQixnQkFDSixZQUNVLHNCQUNGLG9CQUNDLFlBQ00sc0JBQ0osY0FDRCxhQUNJLG9CQUNKLG9CQUNKLGtCQUNNLGVBQ0wsbUJBQ25CO0FBQ0QsVUFBTSxZQUFZLHNCQUFzQixvQkFBb0IsWUFBWSxzQkFBc0IsY0FBYyxnQ0FBZ0MsR0FBRyxJQUFJLHlCQUF5QixHQUFHLGFBQWEseUJBQXlCLHFCQUFxQixvQkFBb0Isb0JBQW9CLGtCQUFrQixtQkFBbUIsYUFBYTtBQWRuVDtBQWVqQixTQUFLLHdCQUF3QixLQUFLLGNBQStCO0FBQUEsRUFDbEU7QUFBQSxFQUVtQix1QkFBc0M7QUFDeEQsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBdkJNLHlCQUFOO0FBQUEsRUFHRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FkRztBQXlCTixJQUFNLHVCQUFOLGNBQW1DLGFBQWE7QUFBQSxFQVMvQyxZQUNrQixnQkFDSixZQUNVLHNCQUNGLG9CQUNDLFlBQ00sc0JBQ0osY0FDRCxhQUNJLG9CQUNKLG9CQUNKLGtCQUNNLGVBQ0wsbUJBQ25CO0FBQ0QsVUFBTSxZQUFZLHNCQUFzQixvQkFBb0IsWUFBWSxzQkFBc0IsY0FBYyxnQ0FBZ0MsR0FBRyxJQUFJLHlCQUF5QixHQUFHLGFBQWEseUJBQXlCLHFCQUFxQixvQkFBb0Isb0JBQW9CLGtCQUFrQixtQkFBbUIsYUFBYTtBQWRuVDtBQVRsQixTQUFpQixnQkFBZ0Isb0JBQUksSUFBK0I7QUFDcEUsU0FBUyxjQUF3QixDQUFDO0FBQ2xDLFNBQVMsdUJBQStDLENBQUM7QUFHekQ7QUFBQSxTQUE0QiwyQkFBMkI7QUFDdkQsU0FBNEIsMEJBQTBCO0FBa0JyRCxTQUFLLHdCQUF3QixLQUFLLGNBQStCO0FBQUEsRUFDbEU7QUFBQSxFQUVtQixxQkFBcUIsU0FBOEM7QUFDckYsU0FBSyxxQkFBcUIsS0FBSyxPQUFPO0FBQ3RDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLG9CQUFvQixXQUFtQixNQUErQjtBQUNyRSxTQUFLLGNBQWMsSUFBSSxXQUFXLElBQUk7QUFBQSxFQUN2QztBQUFBLEVBRUEsTUFBeUIsZUFBZSxXQUFpRDtBQUN4RixTQUFLLFlBQVksS0FBSyxTQUFTO0FBQy9CLFVBQU0sT0FBTyxLQUFLLGNBQWMsSUFBSSxTQUFTO0FBQzdDLFFBQUksQ0FBQyxNQUFNO0FBQ1YsWUFBTSxJQUFJLE1BQU0sbUNBQW1DLFNBQVMsR0FBRztBQUFBLElBQ2hFO0FBQ0EsVUFBTSxhQUFhLGFBQWEsSUFBSSxjQUFjLFNBQVM7QUFDM0QsVUFBTSxVQUFXLEtBQThFO0FBQy9GLFFBQUksU0FBUztBQUliLFVBQU0sT0FBTztBQUFBLE1BQ1osTUFBTSxLQUFLO0FBQUEsTUFDWCxhQUFhLEtBQUs7QUFBQSxNQUNsQixpQkFBaUI7QUFBQSxNQUNqQixTQUFTLEtBQUs7QUFBQSxNQUNkLGdCQUFnQixDQUFDLGNBQXNCO0FBQUUsaUJBQVM7QUFBQSxNQUFXO0FBQUEsTUFDN0QscUJBQXFCLENBQUMsWUFBb0I7QUFDekMsZ0JBQVEsS0FBSztBQUFBLFVBQ1osTUFBTTtBQUFBLFVBQ04sVUFBVTtBQUFBLFVBQ1YsUUFBUTtBQUFBLFlBQ1AsTUFBTSxXQUFXO0FBQUEsWUFDakI7QUFBQSxZQUNBLE1BQU0sRUFBRSxNQUFNLGlCQUFpQixVQUFVLElBQUksU0FBUyxLQUFLLElBQUksQ0FBQyxJQUFJLFFBQVE7QUFBQSxVQUM3RTtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXJFTSx1QkFBTjtBQUFBLEVBV0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdEJHO0FBdUVOLFNBQVMsd0JBQXdCLE9BQXNEO0FBQ3RGLFNBQU8sR0FBRyxpQkFBaUIsb0JBQW9CO0FBQy9DLFNBQU8sTUFBTTtBQUNkO0FBRUEsU0FBUyx1QkFBdUIsYUFBMkMsU0FBZ3RCO0FBQzF4QixRQUFNLFdBQVcsSUFBSSxrQkFBa0I7QUFDdkMsUUFBTSxhQUFhLFNBQVMsY0FBYyxJQUFJLGVBQWU7QUFDN0QsUUFBTSxjQUFjLFNBQVMsZUFBZSxZQUFZLElBQUksSUFBSSxZQUFZLFVBQVUsQ0FBQztBQUN2RixRQUFNLGVBQWUsWUFBWSxJQUFJLElBQUksc0JBQXNCLFVBQVUsQ0FBQztBQUMxRSxRQUFNLGdCQUFnQixZQUFZLElBQUksSUFBSSwwQkFBMEIsY0FBYyxVQUFVLENBQUM7QUFDN0YsV0FBUyxJQUFJLGFBQWEsVUFBVTtBQUNwQyxXQUFTLElBQUksY0FBYyxXQUFXO0FBQ3RDLFdBQVMsSUFBSSw0QkFBNEIsYUFBYTtBQUN0RCxXQUFTLElBQUksd0JBQXdCLFlBQVk7QUFDakQsV0FBUyxJQUFJLGlDQUFpQyxTQUFTLHlCQUF5QixnQ0FBZ0MsQ0FBQztBQUNqSCxXQUFTLElBQUkscUJBQXFCLFNBQVMsc0JBQXNCLDZCQUE2QixDQUFDO0FBQy9GLFdBQVMsSUFBSSxxQkFBcUIsU0FBUyxpQkFBaUIsSUFBSSx1QkFBdUIsQ0FBQztBQUN4RixXQUFTLElBQUksc0JBQXNCLFNBQVMsY0FBYyxJQUFJLHdCQUF3QixDQUFDO0FBQ3ZGLFdBQVMsSUFBSSx5QkFBeUIsbUJBQW1CO0FBQ3pELFdBQVMsSUFBSSwyQkFBMkIsSUFBSSw2QkFBNkIsQ0FBQztBQUMxRSxXQUFTLElBQUksdUJBQXVCO0FBQUEsSUFDbkMsZUFBZTtBQUFBLElBQ2YsdUJBQXVCLFlBQVk7QUFBQSxJQUNuQyxnQkFBZ0IsTUFBTTtBQUFBLElBQ3RCLHlCQUF5QixNQUFNO0FBQUEsSUFBRTtBQUFBLElBQ2pDLE9BQU8sWUFBWTtBQUFBLEVBQ3BCLENBQUM7QUFDRCxXQUFTLElBQUksdUJBQXVCLFlBQVksSUFBSSxJQUFJLHFCQUFxQixVQUFVLENBQUMsQ0FBQztBQUN6RixXQUFTLElBQUkseUJBQXlCLFNBQVMsaUJBQWlCLElBQUksa0JBQWtCLENBQUM7QUFDdkYsV0FBUyxJQUFJLHVCQUF1QixTQUFTLHNCQUFzQixJQUFJLHFCQUFxQixDQUFDO0FBQzdGLFFBQU0sb0JBQW9CLFNBQVMscUJBQXFCLElBQUksc0JBQXNCO0FBQ2xGLFdBQVMsSUFBSSxvQkFBb0IsaUJBQWlCO0FBQ2xELFdBQVMsSUFBSSxtQkFBbUIsU0FBUyxvQkFBb0Isb0JBQW9CO0FBQ2pGLE1BQUksU0FBUyxtQ0FBbUMsUUFBUTtBQUN2RCxVQUFNLHFCQUFxQjtBQUFBLE1BQzFCLGVBQWU7QUFBQSxNQUNmLFVBQVUsU0FBUyxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sYUFBYSxDQUFDO0FBQUEsTUFDeEYsUUFBUSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLFlBQVksQ0FBQztBQUFBLElBQ2pFO0FBQ0EsYUFBUyxJQUFJLDJCQUEyQixrQkFBa0I7QUFBQSxFQUMzRDtBQUNBLFFBQU0sdUJBQThDLFlBQVksSUFBSSxJQUFJLHFCQUFxQixRQUFRLENBQUM7QUFDdEcsV0FBUyxJQUFJLHVCQUF1QixvQkFBb0I7QUFDeEQsUUFBTSxRQUFRLFNBQVMsZ0JBQ3BCLHFCQUFxQixlQUFlLFFBQVEsb0JBQW9CLHlCQUF5QixzQkFBc0IsUUFBUSxhQUFhLElBQ3BJLHFCQUFxQixlQUFlLFlBQVk7QUFDbkQsU0FBTyxFQUFFLE9BQU8sc0JBQXNCLHNCQUFzQixlQUFlLGFBQWEsYUFBYTtBQUN0RztBQUVBLFNBQVMsZ0JBQWdCLGFBQTJDLFNBQThmO0FBQ2prQixTQUFPLHVCQUF1QixhQUFhLE9BQU8sRUFBRTtBQUNyRDtBQUlBLFNBQVMsK0JBQStCLE9BQXFCLHNCQUE2QyxTQUEwUTtBQUNuWCxRQUFNLGFBQWEsYUFBYSxJQUFJLGNBQWMsZ0JBQWdCO0FBQ2xFLFFBQU0sZUFBZSxxQkFBcUIsZUFBZSxjQUFjLFlBQVksTUFBUztBQUM1RixNQUFJO0FBQ0osUUFBTSxjQUFjLFNBQVMsZUFBZSxJQUFJLG1CQUFtQjtBQUNuRSxRQUFNLGFBQXVDO0FBQUEsSUFDNUMsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLE1BQ1AsZUFBZSxPQUFNQSxhQUFXO0FBQy9CLHdCQUFnQkE7QUFDaEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLGVBQWUsWUFBWTtBQUFBLElBQzVCO0FBQUEsSUFDQSxxQkFBcUIsU0FBUyx1QkFBdUIsSUFBSSxvQkFBb0I7QUFBQSxJQUM3RSxXQUFXO0FBQUEsSUFDWCxrQkFBa0I7QUFBQSxJQUNsQixtQkFBbUI7QUFBQSxJQUNuQixVQUFVLFNBQVMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxHQUFHLFNBQVMsQ0FBQyxHQUFHLFlBQVksQ0FBQyxFQUFFO0FBQUEsSUFDeEU7QUFBQSxJQUNBLGFBQWE7QUFBQSxJQUNiLE9BQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxpQkFBa0I7QUFJeEIsUUFBTSxlQUFlLGVBQWUseUJBQXlCLFlBQVksTUFBUztBQUNsRixTQUFPLEVBQUUsU0FBUyxlQUFlLG9CQUFvQixZQUFZLFFBQVcsWUFBWSxHQUFHLGVBQWUsTUFBTSxjQUFjO0FBQy9IO0FBRUEsU0FBUywyQkFBMkIsVUFBMEQ7QUFDN0YsUUFBTSxTQUFrQyxDQUFDO0FBQ3pDLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsUUFBUSxHQUFHO0FBQ3BELFFBQUksVUFBVSxRQUFXO0FBQ3hCLGFBQU8sR0FBRyxJQUFJO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLFdBQVcsV0FBbUIsS0FBK0U7QUFDckgsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLFdBQVcsb0JBQUksS0FBSyxHQUFJO0FBQUEsSUFDeEIsY0FBYyxvQkFBSSxLQUFLLEdBQUk7QUFBQSxJQUMzQixTQUFTLE9BQU8sU0FBUztBQUFBLElBQ3pCLFVBQVU7QUFBQSxJQUNWLEdBQUksTUFBTSxFQUFFLFNBQVMsRUFBRSxrQkFBa0IsSUFBSSxFQUFFLElBQUksQ0FBQztBQUFBLEVBQ3JEO0FBQ0Q7QUFFQSxlQUFlLGFBQWEsT0FBb0M7QUFDL0QsUUFBTSxNQUFNLFNBQVM7QUFDckIsUUFBTSxRQUFRO0FBSWQsUUFBTSxRQUFRLFFBQVE7QUFDdkI7QUFFQSxNQUFNLGdCQUFnQixNQUFNO0FBQzNCLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSyxrRUFBa0UsWUFBWTtBQUNsRixVQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3ZDLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsT0FBTyxDQUFDO0FBQ3BFLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYTtBQUN6QixhQUFPLFlBQVksT0FBTyx3QkFBd0IsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLG1CQUFtQixVQUFVO0FBQUEsSUFDL0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGdGQUFnRixZQUFZO0FBQ2hHLFVBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0I7QUFDcEQsc0JBQWtCLDRCQUE0QixJQUFJLG9CQUFvQjtBQUFBLE1BQ3JFLDRCQUE0QjtBQUFBLE1BQzVCLFlBQVk7QUFBQSxNQUNaLG1CQUFtQjtBQUFBLE1BQ25CLFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxNQUNWLG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFDRCxVQUFNLG1CQUFtQixZQUFZLElBQUksSUFBSSxjQUFjLDBCQUEwQjtBQUFBLE1BQXhDO0FBQUE7QUFDNUMsYUFBUyxnQkFBMEIsQ0FBQztBQUNwQyxhQUFTLGlCQUEyQixDQUFDO0FBQ3JDLGFBQVMsaUJBQTJCLENBQUM7QUFDckMsaUNBQW9CO0FBQUE7QUFBQSxNQUVYLFVBQVUsV0FBeUI7QUFDM0MsYUFBSyxjQUFjLEtBQUssU0FBUztBQUFBLE1BQ2xDO0FBQUEsTUFDUyw2QkFBNkIsV0FBeUI7QUFDOUQsYUFBSyxlQUFlLEtBQUssU0FBUztBQUFBLE1BQ25DO0FBQUEsTUFDUyx1Q0FBdUMsVUFBZ0QsV0FBeUI7QUFDeEgsYUFBSyxlQUFlLEtBQUssU0FBUztBQUFBLE1BQ25DO0FBQUEsTUFDUywrQkFBK0IsV0FBeUI7QUFDaEUsYUFBSyxlQUFlLEtBQUssU0FBUztBQUFBLE1BQ25DO0FBQUEsTUFDUyx5Q0FBeUMsVUFBOEMsV0FBeUI7QUFDeEgsYUFBSyxlQUFlLEtBQUssU0FBUztBQUFBLE1BQ25DO0FBQUEsTUFDUyw4QkFBOEIsU0FBd0I7QUFDOUQsYUFBSyxvQkFBb0I7QUFDekIsY0FBTSw4QkFBOEIsT0FBTztBQUFBLE1BQzVDO0FBQUEsSUFDRCxFQUFFLG9CQUFvQixDQUFDO0FBQ3ZCLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsUUFBUSxtQkFBbUIsaUJBQWlCLENBQUM7QUFDekcsUUFBSTtBQUNILFlBQU0sTUFBTSxhQUFhLDBCQUEwQixrQkFBa0I7QUFDckUsZUFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLENBQUMsaUJBQWlCLG1CQUFtQixLQUFLO0FBQ3BFLGNBQU0sUUFBUSxRQUFRO0FBQUEsTUFDdkI7QUFDQSxZQUFNLE1BQU0sYUFBYTtBQUN6QixZQUFNLFVBQVUsd0JBQXdCLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRztBQUN2RCxhQUFPLEdBQUcsT0FBTztBQUVqQixZQUFNLGVBQWUsQ0FBQyxNQUFjLGdCQUFzRDtBQUFBLFFBQ3pGLFdBQVc7QUFBQSxRQUNYO0FBQUEsUUFDQSxPQUFPLEVBQUUsTUFBTSxZQUFZLENBQUMsR0FBRyxTQUFTLENBQUMsRUFBRTtBQUFBLE1BQzVDO0FBQ0EsWUFBTSxRQUFRLGFBQWEsMEJBQTBCLElBQUksQ0FBQztBQUMxRCxZQUFNLFFBQVEsYUFBYSxtQkFBbUIsS0FBSyxDQUFDO0FBQ3BELFlBQU0sUUFBUSxhQUFhLHNCQUFzQixJQUFJLENBQUM7QUFDdEQsWUFBTSxRQUFRLGFBQWEsc0JBQXNCLEtBQUssQ0FBQztBQUV2RCxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFNBQVMsaUJBQWlCO0FBQUEsUUFDMUIsVUFBVSxpQkFBaUI7QUFBQSxRQUMzQixVQUFVLGlCQUFpQjtBQUFBLE1BQzVCLEdBQUc7QUFBQSxRQUNGLFNBQVMsQ0FBQyxpQ0FBaUMsK0JBQStCO0FBQUEsUUFDMUUsVUFBVSxDQUFDLHdCQUF3QjtBQUFBLFFBQ25DLFVBQVUsQ0FBQyx3QkFBd0I7QUFBQSxNQUNwQyxDQUFDO0FBQUEsSUFDRixVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssZ0ZBQWdGLFlBQVk7QUFDaEcsVUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxzQkFBa0IsNEJBQTRCLElBQUksV0FBVztBQUFBLE1BQzVELDRCQUE0QjtBQUFBLE1BQzVCLFlBQVk7QUFBQSxNQUNaLG1CQUFtQjtBQUFBLE1BQ25CLFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxNQUNWLG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFDRCxzQkFBa0IsNEJBQTRCLElBQUksV0FBVztBQUFBLE1BQzVELDRCQUE0QjtBQUFBLE1BQzVCLFlBQVk7QUFBQSxNQUNaLG1CQUFtQjtBQUFBLE1BQ25CLFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxNQUNWLG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFDRCxVQUFNLG1CQUFtQixZQUFZLElBQUksSUFBSSxjQUFjLDBCQUEwQjtBQUFBLE1BQXhDO0FBQUE7QUFDNUMsYUFBUyxtQkFBMkQsQ0FBQztBQUNyRSxhQUFTLG1CQUF5RCxDQUFDO0FBQUE7QUFBQSxNQUMxRCx1Q0FBdUMsU0FBcUQ7QUFDcEcsYUFBSyxpQkFBaUIsS0FBSyxPQUFPO0FBQUEsTUFDbkM7QUFBQSxNQUNTLHlDQUF5QyxTQUFtRDtBQUNwRyxhQUFLLGlCQUFpQixLQUFLLE9BQU87QUFBQSxNQUNuQztBQUFBLElBQ0QsRUFBRSxvQkFBb0IsQ0FBQztBQUN2QixVQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxlQUFlLFFBQVEsbUJBQW1CLGlCQUFpQixDQUFDO0FBQ3pHLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsU0FBUztBQUM1RCxZQUFNLE1BQU0sYUFBYTtBQUN6QixZQUFNLFVBQVUsd0JBQXdCLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRztBQUN2RCxhQUFPLEdBQUcsT0FBTztBQUVqQixZQUFNLGVBQTRDO0FBQUEsUUFDakQsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLFFBQ1osT0FBTyxFQUFFLE1BQU0sMEJBQTBCLFlBQVksQ0FBQyxHQUFHLFNBQVMsQ0FBQyxFQUFFO0FBQUEsTUFDdEU7QUFDQSxZQUFNLFFBQVEsWUFBWTtBQUcxQixZQUFNLE1BQU0sYUFBYSwwQkFBMEIsU0FBUztBQUM1RCxZQUFNLFFBQVEsWUFBWTtBQUUxQixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLGtCQUFrQixpQkFBaUI7QUFBQSxRQUNuQyxrQkFBa0IsaUJBQWlCLGlCQUFpQixJQUFJLGNBQVk7QUFBQSxVQUNuRSxZQUFZLFFBQVE7QUFBQSxVQUNwQixZQUFZLFFBQVE7QUFBQSxVQUNwQixVQUFVLFFBQVE7QUFBQSxVQUNsQixvQkFBb0IsUUFBUTtBQUFBLFFBQzdCLEVBQUU7QUFBQSxNQUNILEdBQUc7QUFBQSxRQUNGLGtCQUFrQixDQUFDO0FBQUEsVUFDbEIsNEJBQTRCO0FBQUEsVUFDNUIsWUFBWTtBQUFBLFVBQ1osbUJBQW1CO0FBQUEsVUFDbkIsWUFBWTtBQUFBLFVBQ1osVUFBVTtBQUFBLFVBQ1Ysb0JBQW9CO0FBQUEsUUFDckIsQ0FBQztBQUFBLFFBQ0Qsa0JBQWtCLENBQUM7QUFBQSxVQUNsQixZQUFZO0FBQUEsVUFDWixZQUFZO0FBQUEsVUFDWixVQUFVO0FBQUEsVUFDVixvQkFBb0I7QUFBQSxRQUNyQixDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRixVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMENBQTBDLFlBQVk7QUFDMUQsVUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFFBQUk7QUFDSCxhQUFPLGdCQUFnQixNQUFNLGNBQWMsR0FBRztBQUFBLFFBQzdDLFVBQVU7QUFBQSxRQUNWLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLGNBQWMsRUFBRSxlQUFlLEVBQUUsTUFBTSxNQUFNLFVBQVUsS0FBSyxFQUFFO0FBQUEsTUFDL0QsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGlGQUFpRixZQUFZO0FBQ2pHLFVBQU0sRUFBRSxPQUFPLGFBQWEsSUFBSSx1QkFBdUIsV0FBVztBQUNsRSxRQUFJO0FBQ0gsWUFBTSxlQUFlLENBQUMsWUFBcUIsYUFBYSxxQkFBcUIsZ0JBQWdCO0FBQUEsUUFDNUYsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUSxFQUFFLENBQUMseUNBQXlDLEdBQUcsUUFBUTtBQUFBLE1BQ2hFLENBQUM7QUFDRCxZQUFNLG9CQUFvQixNQUFNLGNBQWMsRUFBRSxjQUFjO0FBQzlELG1CQUFhLElBQUk7QUFDakIsWUFBTSxjQUFjLE1BQU0sY0FBYyxFQUFFLGNBQWM7QUFDeEQsbUJBQWEsS0FBSztBQUNsQixZQUFNLGlCQUFpQixNQUFNLGNBQWMsRUFBRSxjQUFjO0FBQzNELGFBQU8sZ0JBQWdCLEVBQUUsbUJBQW1CLGFBQWEsZUFBZSxHQUFHO0FBQUEsUUFDMUUsbUJBQW1CO0FBQUEsUUFDbkIsYUFBYSxFQUFFLGtCQUFrQixLQUFLO0FBQUEsUUFDdEMsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxRQUFNLHdCQUF3QixNQUFNO0FBQ25DLGFBQVMsV0FBVyxPQUFxQixRQUEyQjtBQUNuRSxNQUFDLE1BQStFLHNCQUFzQixLQUFLLE1BQU07QUFBQSxJQUNsSDtBQUVBLFNBQUsseUZBQXlGLFlBQVk7QUFDekcsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFlBQU0sVUFBa0MsQ0FBQztBQUN6QyxrQkFBWSxJQUFJLE1BQU0sZUFBZSxPQUFLLFFBQVEsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUMxRCxVQUFJO0FBQ0gsY0FBTSxhQUFhLGFBQWEsSUFBSSxjQUFjLGVBQWU7QUFDakUsY0FBTSxhQUFhLG9CQUFvQixXQUFXLFNBQVMsQ0FBQztBQUM1RCxjQUFNLGFBQWE7QUFDbkIsY0FBTSxlQUFlLHFCQUFxQixtQ0FBbUMsVUFBVSxHQUFHLFVBQVU7QUFFcEcsbUJBQVcsT0FBTztBQUFBLFVBQ2pCLE1BQU07QUFBQSxVQUNOLE1BQU0sSUFBSSxNQUFNLFVBQVU7QUFBQSxVQUMxQjtBQUFBLFVBQ0EsV0FBVztBQUFBLFVBQ1gsa0JBQWtCO0FBQUEsVUFDbEIsa0JBQWtCO0FBQUEsUUFDbkIsQ0FBQztBQUVELG1CQUFXLE9BQU8sRUFBRSxNQUFNLFVBQVUsVUFBVSxZQUFZLFFBQVEsRUFBRSxNQUFNLFdBQVcscUJBQXFCLE9BQU8sSUFBSSxFQUFFLENBQUM7QUFFeEgsbUJBQVcsT0FBTyxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sSUFBSSxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUM7QUFFekYsZUFBTyxnQkFBZ0I7QUFBQSxVQUN0QixTQUFTLFFBQVEsSUFBSSxRQUFNO0FBQUEsWUFDMUIsU0FBUyxFQUFFLFFBQVEsU0FBUztBQUFBLFlBQzVCLE1BQU0sRUFBRSxLQUFLLFNBQVM7QUFBQSxZQUN0QixRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxPQUFPLEtBQUssU0FBUyxHQUFHLFlBQVksRUFBRSxPQUFPLFdBQVcsSUFBSTtBQUFBLFlBQ3pGLE9BQU8sRUFBRTtBQUFBLFVBQ1YsRUFBRTtBQUFBLFFBQ0gsR0FBRztBQUFBLFVBQ0YsU0FBUyxDQUFDO0FBQUEsWUFDVCxTQUFTLFdBQVcsU0FBUztBQUFBLFlBQzdCLE1BQU07QUFBQSxZQUNOLFFBQVEsRUFBRSxNQUFNLFlBQVksV0FBVztBQUFBLFlBQ3ZDLE9BQU87QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5REFBeUQsWUFBWTtBQUN6RSxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxzQkFBa0IsV0FBVztBQUM3QixVQUFNLFlBQVksSUFBSSx5QkFBeUIsbUJBQW1CLElBQUksZUFBZSxDQUFDO0FBRXRGLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsV0FBVyxNQUFNLFVBQVUsbUJBQW1CLEVBQUUsV0FBVyx3Q0FBd0MsU0FBUyx5QkFBeUIsYUFBYSxRQUFRLENBQUM7QUFBQSxNQUMzSixVQUFVLE1BQU0sVUFBVSxtQkFBbUIsRUFBRSxXQUFXLHdDQUF3QyxTQUFTLHdCQUF3QixDQUFDO0FBQUEsTUFDcEksT0FBTyxrQkFBa0IsYUFBYSxDQUFDLEdBQUc7QUFBQSxNQUMxQyx3QkFBd0Isa0JBQWtCLGFBQWEsQ0FBQyxHQUFHLFFBQVEsU0FBUyxLQUFLLGFBQVcsUUFBUSxRQUFRLFNBQVMsdUJBQXVCLENBQUM7QUFBQSxJQUM5SSxHQUFHO0FBQUEsTUFDRixXQUFXO0FBQUEsTUFDWCxVQUFVO0FBQUEsTUFDVixPQUFPO0FBQUEsTUFDUCx3QkFBd0I7QUFBQSxJQUN6QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwREFBMEQsWUFBWTtBQUMxRSxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxzQkFBa0IsV0FBVztBQUM3QixVQUFNLFlBQVksSUFBSSx5QkFBeUIsbUJBQW1CLElBQUksZUFBZSxDQUFDO0FBQ3RGLFVBQU0sYUFBYSxvQkFBSSxJQUFJO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sc0JBQWdDLENBQUM7QUFDdkMsUUFBSTtBQUNKLFFBQUk7QUFDSCxZQUFNLFVBQVUsbUJBQW1CO0FBQUEsUUFDbEMsV0FBVztBQUFBLFFBQ1gsb0JBQW9CLE9BQU0sU0FBUTtBQUNqQyw4QkFBb0IsS0FBSyxJQUFJO0FBQzdCLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsU0FBUyxPQUFPO0FBQ2Ysd0JBQWtCLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUs7QUFBQSxJQUN4RTtBQUVBLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxNQUFNLFVBQVUsbUJBQW1CLEVBQUUsV0FBVyx3Q0FBd0MsU0FBUyx5QkFBeUIsYUFBYSxTQUFTLG9CQUFvQixZQUFZLE1BQU0sQ0FBQztBQUFBLE1BQy9MLFdBQVcsTUFBTSxVQUFVLG1CQUFtQixFQUFFLFdBQVcsd0NBQXdDLFNBQVMseUJBQXlCLGFBQWEsU0FBUyxvQkFBb0IsT0FBTSxTQUFRLFNBQVMsK0JBQStCLENBQUM7QUFBQSxNQUN0TyxtQkFBbUIsTUFBTSxVQUFVLG1CQUFtQixFQUFFLFdBQVcsd0NBQXdDLFNBQVMseUJBQXlCLGFBQWEsU0FBUyxvQkFBb0IsT0FBTSxTQUFRLFdBQVcsSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUFBLE1BQzNOLG1CQUFtQixNQUFNLFVBQVUsbUJBQW1CLEVBQUUsV0FBVyx3Q0FBd0Msb0JBQW9CLE9BQU0sU0FBUSxXQUFXLElBQUksSUFBSSxFQUFFLENBQUM7QUFBQSxNQUNuSyxZQUFZO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxnQkFBZ0Isb0JBQW9CO0FBQUEsUUFDcEMsZ0JBQWdCLG9CQUFvQixDQUFDO0FBQUEsUUFDckMsZUFBZSxvQkFBb0IsR0FBRyxFQUFFO0FBQUEsTUFDekM7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxNQUNSLFdBQVc7QUFBQSxNQUNYLG1CQUFtQjtBQUFBLE1BQ25CLG1CQUFtQjtBQUFBLE1BQ25CLFlBQVk7QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLGdCQUFnQjtBQUFBLFFBQ2hCLGdCQUFnQjtBQUFBLFFBQ2hCLGVBQWU7QUFBQSxNQUNoQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbUVBQW1FLFlBQVk7QUFDbkYsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0I7QUFDcEQsc0JBQWtCLFdBQVc7QUFDN0IsVUFBTSxZQUFZLElBQUkseUJBQXlCLG1CQUFtQixJQUFJLGVBQWUsQ0FBQztBQUV0RixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFlBQVksTUFBTSxVQUFVLG1CQUFtQixFQUFFLFdBQVcsd0NBQXdDLFNBQVMseUJBQXlCLGFBQWEsU0FBUyxjQUFjLGVBQWUsQ0FBQztBQUFBLE1BQzFMLGFBQWEsTUFBTSxVQUFVLG1CQUFtQixFQUFFLFdBQVcsd0NBQXdDLFNBQVMseUJBQXlCLGFBQWEsU0FBUyxjQUFjLEdBQUcsQ0FBQztBQUFBLE1BQy9LLG9CQUFvQixNQUFNLFVBQVUsbUJBQW1CLEVBQUUsV0FBVyx3Q0FBd0MsY0FBYyxlQUFlLENBQUM7QUFBQSxJQUMzSSxHQUFHO0FBQUEsTUFDRixZQUFZO0FBQUEsTUFDWixhQUFhO0FBQUEsTUFDYixvQkFBb0I7QUFBQSxJQUNyQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsWUFBWTtBQUN0RCxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxzQkFBa0IsV0FBVyxJQUFJLE9BQU8sR0FBRztBQUMzQyxVQUFNLFlBQVksSUFBSSx5QkFBeUIsbUJBQW1CLElBQUksZUFBZSxDQUFDO0FBRXRGLFdBQU87QUFBQSxPQUNMLE1BQU0sVUFBVSxtQkFBbUIsRUFBRSxXQUFXLHdDQUF3QyxTQUFTLHlCQUF5QixhQUFhLFFBQVEsQ0FBQyxHQUFHO0FBQUEsTUFDcEosVUFBVSxTQUFTO0FBQUEsSUFDcEI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHFDQUFxQyxNQUFNO0FBQy9DLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSx5QkFBeUIsZ0JBQWdCO0FBQUEsTUFDakQsV0FBVyx5QkFBeUIsZ0JBQWdCO0FBQUEsTUFDcEQsU0FBUyx5QkFBeUIsNkJBQTZCO0FBQUEsTUFDL0QsU0FBUyx5QkFBeUIsaUJBQWM7QUFBQSxNQUNoRCxPQUFPLHlCQUF5QixvQkFBTTtBQUFBLElBQ3ZDLEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxNQUNSLFdBQVc7QUFBQSxNQUNYLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULE9BQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxrQ0FBa0MsdUJBQXVCO0FBQUEsTUFDakUsYUFBYSxrQ0FBa0MsbUJBQW1CO0FBQUEsTUFDbEUsU0FBUyxrQ0FBa0MsbUNBQTJCO0FBQUEsTUFDdEUsT0FBTyxrQ0FBa0Msa0RBQWtEO0FBQUEsTUFDM0YsTUFBTSxrQ0FBa0MsSUFBSSxPQUFPLEdBQUcsQ0FBQyxHQUFHO0FBQUEsTUFDMUQsT0FBTyxrQ0FBa0MsYUFBYTtBQUFBLElBQ3ZELEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxNQUNSLGFBQWE7QUFBQSxNQUNiLFNBQVM7QUFBQSxNQUNULE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhFQUE4RSxZQUFZO0FBQzlGLFVBQU0sb0JBQW9CLElBQUksc0JBQXNCO0FBQ3BELHNCQUFrQixXQUFXO0FBQzdCLFVBQU0sWUFBWSxJQUFJLHlCQUF5QixtQkFBbUIsSUFBSSxlQUFlLENBQUM7QUFFdEYsV0FBTztBQUFBLE1BQ04sTUFBTSxVQUFVLG1CQUFtQixFQUFFLFdBQVcsd0NBQXdDLFNBQVMseUJBQXlCLGFBQWEsUUFBUSxDQUFDO0FBQUEsTUFDaEo7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxzQkFBa0IsUUFBUSxJQUFJLE1BQU0sUUFBUTtBQUM1QyxVQUFNLFlBQVksSUFBSSx5QkFBeUIsbUJBQW1CLElBQUksZUFBZSxDQUFDO0FBRXRGLFdBQU87QUFBQSxNQUNOLE1BQU0sVUFBVSxtQkFBbUIsRUFBRSxXQUFXLHdDQUF3QyxTQUFTLHlCQUF5QixhQUFhLFFBQVEsQ0FBQztBQUFBLE1BQ2hKO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssK0RBQStELFlBQVk7QUFDL0UsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0I7QUFDcEQsc0JBQWtCLFdBQVc7QUFDN0IsVUFBTSxZQUFZLElBQUkseUJBQXlCLG1CQUFtQixJQUFJLGVBQWUsQ0FBQztBQUV0RixXQUFPO0FBQUEsTUFDTixNQUFNLFVBQVUsbUJBQW1CLEVBQUUsV0FBVyx3Q0FBd0MsU0FBUyxlQUFlLGFBQWEsUUFBUSxDQUFDO0FBQUEsTUFDdEk7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywwRUFBMEUsWUFBWTtBQUMxRixVQUFNLGtCQUFrQixnQ0FBZ0MsNEJBQTRCO0FBQ3BGLFVBQU0sb0JBQW9CLElBQUksc0JBQXNCO0FBQ3BELHNCQUFrQixjQUFjO0FBQ2hDLHNCQUFrQixZQUFZO0FBQzlCLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG1CQUFtQix1QkFBdUIsZ0JBQWdCLENBQUM7QUFDeEcsUUFBSTtBQUNILFlBQU0sTUFBTSxhQUFhLGdCQUFnQixtQkFBbUIsRUFBRSxVQUFVLE9BQU87QUFFL0UsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixXQUFXLE1BQU0sTUFBTSwrQkFBK0I7QUFBQSxRQUN0RCxTQUFTLE1BQU0sTUFBTSw2QkFBNkI7QUFBQSxNQUNuRCxHQUFHO0FBQUEsUUFDRixXQUFXO0FBQUEsVUFDVixFQUFFLE1BQU0sY0FBYyxLQUFLLGdCQUFnQixjQUFjLEVBQUU7QUFBQSxVQUMzRCxFQUFFLE1BQU0sc0JBQXNCLEtBQUssb0NBQW9DO0FBQUEsUUFDeEU7QUFBQSxRQUNBLFNBQVM7QUFBQSxNQUNWLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpRUFBaUUsWUFBWTtBQUNqRixVQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxVQUFNLGVBQWUsYUFBYSxJQUFJLGNBQWMsbUJBQW1CO0FBQ3ZFLFVBQU0sVUFBVSxtQkFBbUIsYUFBYSxZQUFZO0FBQzVELFlBQVEsUUFBUTtBQUNoQixVQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxXQUFXLG1CQUFtQixDQUFDLENBQUM7QUFDdEUsVUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsT0FBTyxDQUFDO0FBQ3hGLFFBQUk7QUFDSCxZQUFNLFdBQVcsTUFBTSxNQUFNLGFBQWE7QUFDMUMsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixRQUFRLE1BQU0sT0FBTyxJQUFJO0FBQUEsUUFDekIsVUFBVSxTQUFTLElBQUksYUFBVyxhQUFhLEdBQUcsUUFBUSxPQUFPLENBQUM7QUFBQSxRQUNsRSxRQUFRLE9BQU87QUFBQSxRQUNmLFdBQVcsT0FBTztBQUFBLE1BQ25CLEdBQUc7QUFBQSxRQUNGLFFBQVEsQ0FBQztBQUFBLFFBQ1QsVUFBVSxDQUFDLG1CQUFtQjtBQUFBLFFBQzlCLFFBQVE7QUFBQSxRQUNSLFdBQVc7QUFBQSxNQUNaLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw2RUFBNkUsWUFBWTtBQUM3RixVQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3ZDLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsT0FBTyxDQUFDO0FBQ3BFLFVBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxlQUFlO0FBQzlELFVBQU0sbUJBQW1CLElBQUksS0FBSyxZQUFZO0FBQzlDLFFBQUk7QUFDSCxZQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWMsRUFBRSxTQUFTLG9CQUFvQixtQkFBbUIsQ0FBQyxnQkFBZ0IsSUFBSSxPQUFVLENBQUM7QUFDM0gsYUFBTyxHQUFHLE9BQU8sd0JBQXdCO0FBQ3pDLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsU0FBUyxPQUFPLFFBQVEsU0FBUztBQUFBLFFBQ2pDLGtCQUFrQixPQUFPLHlCQUF5QixTQUFTO0FBQUEsUUFDM0QsYUFBYSxPQUFPO0FBQUEsUUFDcEIsUUFBUSxPQUFPO0FBQUEsUUFDZixPQUFPLE9BQU87QUFBQSxNQUNmLEdBQUc7QUFBQSxRQUNGLFNBQVMsUUFBUSxTQUFTO0FBQUEsUUFDMUIsa0JBQWtCLGlCQUFpQixTQUFTO0FBQUEsUUFDNUMsYUFBYTtBQUFBLFFBQ2IsUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtEQUFrRCxZQUFZO0FBQ2xFLFVBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLEdBQUcsQ0FBQztBQUFBLE1BQ3pDLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxJQUNQLENBQUMsQ0FBQztBQUNGLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsT0FBTyxDQUFDO0FBQ3BFLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsYUFBYTtBQUNoRSxZQUFNLGFBQWEsTUFBTSxRQUFRLFlBQVUsT0FBTyxTQUFTLENBQUM7QUFFNUQsYUFBTyxnQkFBZ0IsT0FBTyxtQkFBbUIsQ0FBQyxFQUFFLGFBQWEsY0FBYyxDQUFDLENBQUM7QUFBQSxJQUNsRixVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssd0RBQXdELFlBQVk7QUFDeEUsVUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsR0FBRyxDQUFDO0FBQUEsTUFDekMsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLElBQ1AsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsZUFBZSxPQUFPLENBQUM7QUFDcEUsUUFBSTtBQUNILFlBQU0sTUFBTSxhQUFhO0FBQ3pCLFlBQU0sTUFBTSxhQUFhLDBCQUEwQixlQUFlO0FBQ2xFLGVBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxPQUFPLGtCQUFrQixTQUFTLEdBQUcsS0FBSztBQUNwRSxjQUFNLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxDQUFDLENBQUM7QUFBQSxNQUNwRDtBQUNBLFlBQU0sTUFBTSxhQUFhLDBCQUEwQixlQUFlO0FBQ2xFLGVBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxPQUFPLGtCQUFrQixTQUFTLEdBQUcsS0FBSztBQUNwRSxjQUFNLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxDQUFDLENBQUM7QUFBQSxNQUNwRDtBQUVBLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsUUFBUSxPQUFPO0FBQUEsUUFDZixPQUFPLE9BQU87QUFBQSxRQUNkLFVBQVUsT0FBTztBQUFBLE1BQ2xCLEdBQUc7QUFBQSxRQUNGLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLFVBQVUsQ0FBQyxFQUFFLGFBQWEsZ0JBQWdCLEdBQUcsRUFBRSxhQUFhLGdCQUFnQixDQUFDO0FBQUEsTUFDOUUsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLFVBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLEdBQUcsQ0FBQztBQUFBLE1BQ3pDLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxJQUNQLENBQUMsQ0FBQztBQUNGLFdBQU8sZ0JBQWdCLEtBQUssSUFBSSxNQUFNLHlCQUF5QixDQUFDO0FBQ2hFLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsT0FBTyxDQUFDO0FBQ3BFLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxZQUFNLFNBQVMsTUFBTSxhQUFhLE1BQU0sUUFBUSxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBRWpFLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsWUFBWSxPQUFPLElBQUksT0FBSyxFQUFFLElBQUk7QUFBQSxRQUNsQyxjQUFjLE9BQU8sa0JBQWtCO0FBQUEsTUFDeEMsR0FBRztBQUFBLFFBQ0YsWUFBWSxDQUFDLFFBQVE7QUFBQSxRQUNyQixjQUFjO0FBQUEsTUFDZixDQUFDO0FBQUEsSUFDRixVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssZ0VBQWdFLFlBQVk7QUFDaEYsVUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsR0FBRyxDQUFDO0FBQUEsTUFDekMsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLElBQ1AsQ0FBQyxDQUFDO0FBQ0YsYUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUs7QUFDNUIsYUFBTyxnQkFBZ0IsS0FBSyxJQUFJLE1BQU0seUJBQXlCLENBQUM7QUFBQSxJQUNqRTtBQUNBLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsT0FBTyxDQUFDO0FBQ3BFLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxlQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sT0FBTyxrQkFBa0IsU0FBUyxHQUFHLEtBQUs7QUFDcEUsY0FBTSxJQUFJLFFBQVEsYUFBVyxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQUEsTUFDcEQ7QUFFQSxZQUFNLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxFQUFFLENBQUM7QUFFcEQsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixjQUFjLE9BQU8sa0JBQWtCO0FBQUEsUUFDdkMsUUFBUSxNQUFNLE9BQU8sSUFBSTtBQUFBLE1BQzFCLEdBQUc7QUFBQSxRQUNGLGNBQWM7QUFBQSxRQUNkLFFBQVEsQ0FBQztBQUFBLE1BQ1YsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGlFQUFpRSxZQUFZO0FBQ2pGLFVBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLEdBQUcsQ0FBQztBQUFBLE1BQ3pDLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxJQUNQLENBQUMsQ0FBQztBQUNGLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsT0FBTyxDQUFDO0FBQ3BFLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsU0FBUztBQUM1RCxZQUFNLGFBQWEsTUFBTSxRQUFRLE9BQUssRUFBRSxTQUFTLENBQUM7QUFHbEQsZUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUs7QUFDNUIsZUFBTyxnQkFBZ0IsS0FBSyxJQUFJLE1BQU0seUJBQXlCLENBQUM7QUFBQSxNQUNqRTtBQUNBLFlBQU0saUJBQWlCLE9BQU8sa0JBQWtCO0FBQ2hELFlBQU0sTUFBTSxhQUFhLDBCQUEwQixTQUFTO0FBQzVELGVBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxPQUFPLGtCQUFrQixTQUFTLGlCQUFpQixHQUFHLEtBQUs7QUFDckYsY0FBTSxJQUFJLFFBQVEsYUFBVyxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQUEsTUFDcEQ7QUFDQSxZQUFNLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxFQUFFLENBQUM7QUFFcEQsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixZQUFZLE1BQU0sT0FBTyxJQUFJLEVBQUUsSUFBSSxPQUFLLEVBQUUsSUFBSTtBQUFBLFFBQzlDLGlCQUFpQixPQUFPLGtCQUFrQixTQUFTO0FBQUEsTUFDcEQsR0FBRztBQUFBLFFBQ0YsWUFBWSxDQUFDLFFBQVE7QUFBQSxRQUNyQixpQkFBaUI7QUFBQSxNQUNsQixDQUFDO0FBQUEsSUFDRixVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseUVBQXlFLFlBQVk7QUFDekYsVUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsR0FBRyxDQUFDO0FBQUEsTUFDekMsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLElBQ1AsQ0FBQyxDQUFDO0FBQ0YsVUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsZUFBZSxPQUFPLENBQUM7QUFDcEUsUUFBSTtBQUlILFlBQU0sT0FBTyxJQUFJLGdCQUFzQjtBQUN2QyxhQUFPLGdCQUFnQixLQUFLO0FBQzVCLFlBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELFlBQU0sUUFBUSxNQUFNLGNBQWM7QUFDbEMsWUFBTSxTQUFTLE1BQU0sY0FBYztBQUNuQyxXQUFLLFNBQVM7QUFDZCxZQUFNLFFBQVEsSUFBSSxDQUFDLE9BQU8sTUFBTSxDQUFDO0FBRWpDLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsVUFBVSxPQUFPO0FBQUEsUUFDakIsWUFBWSxNQUFNLE9BQU8sSUFBSSxFQUFFLElBQUksT0FBSyxFQUFFLElBQUk7QUFBQSxNQUMvQyxHQUFHO0FBQUEsUUFDRixVQUFVLENBQUMsRUFBRSxhQUFhLFFBQVEsQ0FBQztBQUFBLFFBQ25DLFlBQVksQ0FBQyxRQUFRO0FBQUEsTUFDdEIsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGdFQUFnRSxZQUFZO0FBQ2hGLFVBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLEdBQUcsQ0FBQztBQUFBLE1BQ3pDLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxJQUNQLENBQUMsQ0FBQztBQUNGLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsT0FBTyxDQUFDO0FBQ3BFLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxZQUFNLGFBQWEsTUFBTSxRQUFRLE9BQUssRUFBRSxTQUFTLENBQUM7QUFDbEQsWUFBTSxNQUFNLFNBQVM7QUFFckIsWUFBTSxzQkFBc0IsT0FBTztBQUNuQyxZQUFNLHdCQUF3QixPQUFPLGtCQUFrQjtBQUt2RCxZQUFPLE1BQXlFLGVBQWUsQ0FBQztBQUVoRyxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFFBQVEsT0FBTztBQUFBLFFBQ2YsVUFBVSxPQUFPLGtCQUFrQjtBQUFBLE1BQ3BDLEdBQUc7QUFBQSxRQUNGLFFBQVE7QUFBQSxRQUNSLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw4REFBOEQsWUFBWTtBQUM5RSxVQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxHQUFHLENBQUM7QUFBQSxNQUN6QyxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsSUFDUCxDQUFDLENBQUM7QUFDRixVQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxlQUFlLE9BQU8sQ0FBQztBQUNwRSxRQUFJO0FBQ0gsWUFBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsWUFBTSxhQUFhLE1BQU0sUUFBUSxZQUFVLE9BQU8sS0FBSyxXQUFTLE1BQU0sT0FBTyxTQUFTLENBQUM7QUFDdkYsWUFBTSxRQUFRLFFBQVE7QUFFdEIsWUFBTSxPQUFPLElBQUksZ0JBQXNCO0FBQ3ZDLGFBQU8sZUFBZSxLQUFLLEtBQUssQ0FBQztBQUNqQyxhQUFPLG1CQUFtQixLQUFLLENBQUMsRUFBRSxJQUFJLFFBQVEsTUFBTSxPQUFPLENBQUMsQ0FBQztBQUM3RCxZQUFNLGlCQUFpQixPQUFPLGtCQUFrQjtBQUNoRCxZQUFNLFVBQVUsTUFBTSxjQUFjO0FBQ3BDLGVBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxPQUFPLGtCQUFrQixVQUFVLGdCQUFnQixLQUFLO0FBQ2xGLGNBQU0sUUFBUSxDQUFDO0FBQUEsTUFDaEI7QUFDQSxhQUFPLFlBQVksT0FBTyxrQkFBa0IsUUFBUSxpQkFBaUIsR0FBRywyQ0FBMkM7QUFFbkgsWUFBTSxNQUFNLFNBQVM7QUFDckIsV0FBSyxTQUFTO0FBQ2QsWUFBTTtBQUVOLGFBQU8sZ0JBQWdCLE1BQU0sT0FBTyxJQUFJLEVBQUUsSUFBSSxXQUFTLE1BQU0sRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDO0FBQUEsSUFDOUUsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLCtEQUErRCxZQUFZO0FBQy9FLFVBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsVUFBTSxZQUFZLElBQUksZ0JBQXNCO0FBQzVDLFdBQU8sWUFBWSxVQUFVO0FBQzdCLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsT0FBTyxDQUFDO0FBQ3BFLFFBQUk7QUFDSCxZQUFNLGNBQWMsTUFBTSxhQUFhO0FBQ3ZDLFlBQU0sUUFBUSxRQUFRO0FBQ3RCLFlBQU0sa0JBQWtCLE1BQU0sU0FBUztBQUN2QyxnQkFBVSxTQUFTO0FBRW5CLFlBQU0sT0FBTyxRQUFRLGFBQWEsaUJBQWlCO0FBQ25ELFlBQU07QUFFTixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFFBQVEsT0FBTztBQUFBLFFBQ2YsT0FBTyxPQUFPO0FBQUEsTUFDZixHQUFHO0FBQUEsUUFDRixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRixVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0dBQXNHLFlBQVk7QUFDdEgsVUFBTSxXQUFXLElBQUksS0FBSyxNQUFNLEdBQUcsUUFBUSxHQUFHLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQztBQUNyRSxVQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxTQUFTLENBQUM7QUFDdkQsUUFBSTtBQUNILFlBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELFlBQU0sU0FBUyxNQUFNLE1BQU0sY0FBYztBQUFBLFFBQ3hDLFNBQVMsYUFBYSxJQUFJLGNBQWMsZUFBZTtBQUFBLE1BQ3hELENBQUM7QUFFRCxhQUFPLFlBQVksT0FBTyxhQUFhLElBQUk7QUFDM0MsWUFBTSx5QkFBeUIsT0FBTztBQUN0QyxhQUFPLEdBQUcsc0JBQXNCO0FBQ2hDLFlBQU0sV0FBVyxJQUFJLFNBQVMsVUFBVSxZQUFZLFNBQVMsZUFBZTtBQUM1RSxhQUFPLFlBQVksdUJBQXVCLFFBQVEsUUFBUSxJQUFJO0FBQzlELGFBQU8sWUFBWSx1QkFBdUIsUUFBUSxTQUFTLE1BQU07QUFDakUsYUFBTyxnQkFBZ0IsTUFBTSxHQUFHLFFBQVEsdUJBQXVCLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFFMUUsWUFBTSxjQUFlLE1BQXdGLHFCQUFxQixJQUFJLGVBQWU7QUFDckosYUFBTyxZQUFZLGFBQWEsZUFBZSxJQUFJO0FBQUEsSUFDcEQsVUFBRTtBQUNELFlBQU0sR0FBRyxHQUFHLFNBQVMsUUFBUSxFQUFFLFdBQVcsTUFBTSxPQUFPLEtBQUssQ0FBQztBQUM3RCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDLEVBQUUsUUFBUSxHQUFNO0FBRWpCLFFBQU0sZ0NBQWdDLE1BQU07QUFDM0MsU0FBSywrRUFBK0UsWUFBWTtBQUMvRixZQUFNLFdBQVcsSUFBSSxLQUFLLE1BQU0sR0FBRyxRQUFRLEdBQUcsR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDO0FBQ3JFLFlBQU0sWUFBWTtBQUNsQixZQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsU0FBUztBQUN4RCxZQUFNLGFBQWEsSUFBSSxTQUFTLFVBQVUsWUFBWSxTQUFTLFNBQVM7QUFDeEUsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxLQUFLLG1CQUFtQixhQUFhLE9BQU87QUFDbEQsWUFBTSxHQUFHLE9BQU8sWUFBWSw0QkFBNEIsV0FBVyxTQUFTLENBQUM7QUFDN0UsWUFBTSxHQUFHLE9BQU8sWUFBWSwyQkFBMkIsTUFBTTtBQUM3RCxTQUFHLFFBQVE7QUFDWCxZQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxXQUFXLFdBQVcsV0FBVyxNQUFNLENBQUMsQ0FBQztBQUMvRSxZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxlQUFlLFFBQVEsbUJBQW1CLE1BQU0sb0JBQW9CLFNBQVMsQ0FBQztBQUMzSCxZQUFNLFlBQVk7QUFDbEIsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLGtDQUFrQyxVQUFVLE9BQU87QUFDNUUsY0FBTSxPQUFPLFFBQVEsTUFBTSxHQUFHLE9BQU8sV0FBVyxNQUFNLENBQUM7QUFHdkQsY0FBTSxVQUFVLGVBQWUsU0FBUyxFQUFFLE1BQU0sTUFBTSxNQUFTO0FBQy9ELGNBQU0sR0FBRyxPQUFPLFdBQVcsTUFBTTtBQUFBLE1BQ2xDLFVBQUU7QUFDRCxjQUFNLEdBQUcsR0FBRyxTQUFTLFFBQVEsRUFBRSxXQUFXLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFDN0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQyxFQUFFLFFBQVEsR0FBTTtBQUVqQixTQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLFlBQU0sV0FBVyxJQUFJLEtBQUssTUFBTSxHQUFHLFFBQVEsR0FBRyxHQUFHLE9BQU8sQ0FBQyxXQUFXLENBQUM7QUFDckUsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsU0FBUyxDQUFDO0FBQ3ZELFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsWUFBWTtBQUMzRCxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWMsRUFBRSxRQUFRLENBQUM7QUFDcEQsY0FBTSxhQUFhLElBQUksU0FBUyxVQUFVLFlBQVksU0FBUyxZQUFZO0FBQzNFLGNBQU0sR0FBRyxPQUFPLFdBQVcsTUFBTTtBQUNqQyxjQUFNLE1BQU0sZUFBZSxPQUFPLE9BQU87QUFDekMsY0FBTSxPQUFPLFFBQVEsTUFBTSxHQUFHLE9BQU8sV0FBVyxNQUFNLENBQUM7QUFBQSxNQUN4RCxVQUFFO0FBQ0QsY0FBTSxHQUFHLEdBQUcsU0FBUyxRQUFRLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQzdELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUMsRUFBRSxRQUFRLEdBQU07QUFBQSxFQUNsQixDQUFDO0FBRUQsUUFBTSxpQ0FBaUMsTUFBTTtBQUM1QyxVQUFNLFFBQVEsSUFBSSxLQUFLLFFBQVE7QUFDL0IsVUFBTSxRQUFRLElBQUksS0FBSyxRQUFRO0FBQy9CLFVBQU0sUUFBUSxJQUFJLEtBQUssUUFBUTtBQUUvQixtQkFBZSxRQUFRLE1BQWlGLEtBQW1GO0FBQzFMLFlBQU0sWUFBWTtBQUNsQixZQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsU0FBUztBQUN4RCxZQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxZQUFNLEtBQUssbUJBQW1CLGFBQWEsT0FBTztBQUVsRCxZQUFNLEdBQUcsT0FBTyxZQUFZLDRCQUE0QixNQUFNO0FBQzlELFlBQU0sS0FBSyxFQUFFO0FBQ2IsU0FBRyxRQUFRO0FBQ1gsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsV0FBVyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBQ2pFLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLE9BQU8sQ0FBQztBQUN4RixVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsa0NBQWtDLFVBQVUsT0FBTztBQUM1RSxjQUFNLFVBQVUsTUFBTSxNQUFNLGFBQWEsR0FBRyxLQUFLLE9BQUssYUFBYSxHQUFHLEVBQUUsT0FBTyxNQUFNLFNBQVM7QUFDOUYsY0FBTSxPQUFPLE1BQU0sTUFBTSxtQkFBbUIsT0FBTztBQUNuRCxlQUFPO0FBQUEsVUFDTixNQUFNLFFBQVEsb0JBQW9CLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQztBQUFBLFVBQ3ZELE1BQU0sTUFBTSxvQkFBb0IsSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBQUEsUUFDdEQ7QUFBQSxNQUNELFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUVBLFNBQUssc0VBQXNFLFlBQVk7QUFDdEYsWUFBTSxTQUFTLE1BQU0sUUFBUSxPQUFNLE9BQU07QUFDeEMsY0FBTSxHQUFHLE9BQU8sWUFBWSw4QkFBOEIsS0FBSyxVQUFVLENBQUMsT0FBTyxPQUFPLEtBQUssRUFBRSxJQUFJLE9BQUssRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ3RILGNBQU0sR0FBRyxPQUFPLFlBQVksNEJBQTRCLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDekUsQ0FBQztBQUNELGFBQU8sZ0JBQWdCLFFBQVE7QUFBQSxRQUM5QixNQUFNLENBQUMsTUFBTSxTQUFTLEdBQUcsTUFBTSxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFBQSxRQUMzRCxNQUFNLENBQUMsTUFBTSxTQUFTLEdBQUcsTUFBTSxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFBQSxNQUM1RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyw0RUFBNEUsWUFBWTtBQUM1RixZQUFNLFNBQVMsTUFBTSxRQUFRLE9BQU0sT0FBTTtBQUN4QyxjQUFNLEdBQUcsT0FBTyxZQUFZLDRCQUE0QixNQUFNLFNBQVMsQ0FBQztBQUFBLE1BQ3pFLENBQUM7QUFDRCxhQUFPLGdCQUFnQixRQUFRO0FBQUEsUUFDOUIsTUFBTSxDQUFDLE1BQU0sU0FBUyxDQUFDO0FBQUEsUUFDdkIsTUFBTSxDQUFDLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDeEIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssK0VBQStFLFlBQVk7QUFDL0YsWUFBTSxTQUFTLE1BQU0sUUFBUSxPQUFNLE9BQU07QUFDeEMsY0FBTSxHQUFHLE9BQU8sWUFBWSw4QkFBOEIsVUFBVTtBQUNwRSxjQUFNLEdBQUcsT0FBTyxZQUFZLDRCQUE0QixNQUFNLFNBQVMsQ0FBQztBQUFBLE1BQ3pFLENBQUM7QUFDRCxhQUFPLGdCQUFnQixRQUFRO0FBQUEsUUFDOUIsTUFBTSxDQUFDLE1BQU0sU0FBUyxDQUFDO0FBQUEsUUFDdkIsTUFBTSxDQUFDLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDeEIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sb0NBQW9DLE1BQU07QUFBQSxJQUUvQyxNQUFNLDJCQUEyQixrQkFBa0I7QUFBQSxNQUFuRDtBQUFBO0FBQ0MseUJBQVk7QUFBQTtBQUFBLE1BR1osTUFBZSxPQUErQztBQUM3RCxhQUFLO0FBQ0wsY0FBTSxLQUFLO0FBQ1gsWUFBSSxLQUFLLFdBQVc7QUFDbkIsZ0JBQU0sS0FBSztBQUFBLFFBQ1o7QUFDQSxlQUFPLE1BQU0sS0FBSztBQUFBLE1BQ25CO0FBQUEsSUFDRDtBQUFBLElBRUEsTUFBTSwwQkFBMEIsZUFBZTtBQUFBLE1BQS9DO0FBQUE7QUFDQyxhQUFRLFNBQVMsU0FBUztBQUFBO0FBQUEsTUFFakIsU0FBUyxPQUF1QjtBQUN4QyxhQUFLLFNBQVM7QUFBQSxNQUNmO0FBQUEsTUFFUyxXQUFxQjtBQUM3QixlQUFPLEtBQUs7QUFBQSxNQUNiO0FBQUEsSUFDRDtBQUVBLFNBQUssc0VBQXNFLFlBQVk7QUFDdEYsWUFBTSxnQkFBZ0IsSUFBSSxrQkFBa0I7QUFDNUMsb0JBQWMsZ0JBQWdCO0FBQzlCLFlBQU0sRUFBRSxPQUFPLHFCQUFxQixJQUFJLHVCQUF1QixhQUFhLEVBQUUsY0FBYyxDQUFDO0FBQzdGLFlBQU0scUJBQXFCLENBQUMsUUFBNkMsTUFFdEUsb0JBQW9CLEdBQUc7QUFDMUIsVUFBSTtBQUNILGVBQU8sWUFBWSxNQUFNLG1CQUFtQixDQUFDLENBQUMsR0FBRyxjQUFjLGFBQWE7QUFFNUUsNkJBQXFCLGlCQUFpQixFQUFFLENBQUMsb0NBQW9DLEdBQUcsTUFBTSxDQUFDO0FBQ3ZGLGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEIsT0FBTyxNQUFNLG1CQUFtQixDQUFDLENBQUM7QUFBQSxVQUNsQyxtQkFBbUIsY0FBYztBQUFBLFFBQ2xDLEdBQUc7QUFBQSxVQUNGLE9BQU87QUFBQSxVQUNQLG1CQUFtQjtBQUFBLFFBQ3BCLENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw2REFBNkQsWUFBWTtBQUM3RSxZQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3ZDLFlBQU0sRUFBRSxPQUFPLHFCQUFxQixJQUFJLHVCQUF1QixhQUFhLEVBQUUsZUFBZSxPQUFPLENBQUM7QUFDckcsVUFBSTtBQUNILDZCQUFxQixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQixrQkFBa0IsR0FBRyxRQUFRLENBQUM7QUFDM0YsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxNQUFNLGFBQWE7QUFFekIsZUFBTyxnQkFBZ0Isd0JBQXdCLEtBQUssRUFBRSxJQUFJLGFBQVcsUUFBUSxRQUFRLEdBQUcsQ0FBQyxLQUFLLENBQUM7QUFBQSxNQUNoRyxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssbUVBQW1FLFlBQVk7QUFDbkYsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxZQUFNLEVBQUUsTUFBTSxJQUFJLHVCQUF1QixhQUFhLEVBQUUsZUFBZSxPQUFPLENBQUM7QUFDL0UsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELGNBQU0sTUFBTSxhQUFhO0FBRXpCLGVBQU8sZ0JBQWdCLHdCQUF3QixLQUFLLEVBQUUsSUFBSSxhQUFXLFFBQVEsUUFBUSxHQUFHLENBQUMsTUFBTSxDQUFDO0FBQUEsTUFDakcsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHFEQUFxRCxZQUFZO0FBQ3JFLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsWUFBTSxhQUFhLElBQUksa0JBQWtCO0FBQ3pDLGlCQUFXLFNBQVMsU0FBUyxLQUFLO0FBQ2xDLFlBQU0sRUFBRSxNQUFNLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLFFBQVEsV0FBVyxDQUFDO0FBQzNGLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLE1BQU0sYUFBYTtBQUV6QixlQUFPLGdCQUFnQix3QkFBd0IsS0FBSyxFQUFFLElBQUksYUFBVyxRQUFRLFFBQVEsR0FBRyxDQUFDLEtBQUssQ0FBQztBQUFBLE1BQ2hHLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw4REFBOEQsWUFBWTtBQUM5RSxZQUFNLFNBQVMsSUFBSSxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3hDLFlBQU0sRUFBRSxPQUFPLHFCQUFxQixJQUFJLHVCQUF1QixhQUFhLEVBQUUsZUFBZSxPQUFPLENBQUM7QUFDckcsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELGNBQU0sTUFBTSxhQUFhO0FBRXpCLDZCQUFxQixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQixrQkFBa0IsR0FBRyxRQUFRLENBQUM7QUFDM0YsY0FBTSxRQUFRLFFBQVE7QUFDdEIsY0FBTSxNQUFNLGFBQWE7QUFFekIsZUFBTyxnQkFBZ0I7QUFBQSxVQUN0QixXQUFXLE9BQU87QUFBQSxVQUNsQixVQUFVLHdCQUF3QixLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUc7QUFBQSxRQUNsRCxHQUFHO0FBQUEsVUFDRixXQUFXO0FBQUEsVUFDWCxVQUFVO0FBQUEsUUFDWCxDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssdURBQXVELFlBQVk7QUFDdkUsWUFBTSxTQUFTLElBQUksbUJBQW1CLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxVQUFVLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDNUUsWUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLE9BQU8sQ0FBQztBQUNyRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxNQUFNLGFBQWE7QUFDekIsY0FBTSxhQUFhLE1BQU0sUUFBUSxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBQ2xELGNBQU0saUJBQWlCLE9BQU8sa0JBQWtCO0FBSWhELDZCQUFxQixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQixVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ2hGLGlCQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sT0FBTyxrQkFBa0IsVUFBVSxnQkFBZ0IsS0FBSztBQUNsRixnQkFBTSxRQUFRLENBQUM7QUFBQSxRQUNoQjtBQUVBLGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEIsV0FBVyxPQUFPO0FBQUEsVUFDbEIsdUJBQXVCLE9BQU8sa0JBQWtCLFNBQVM7QUFBQSxRQUMxRCxHQUFHO0FBQUEsVUFDRixXQUFXO0FBQUEsVUFDWCx1QkFBdUI7QUFBQSxRQUN4QixDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsWUFBTSxTQUFTLElBQUksbUJBQW1CLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxVQUFVLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDNUUsWUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLE9BQU8sQ0FBQztBQUNyRyxZQUFNLFdBQVcsSUFBSSxnQkFBc0I7QUFDM0MsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixTQUFTO0FBQzVELGNBQU0sTUFBTSxhQUFhO0FBQ3pCLGNBQU0sYUFBYSxNQUFNLFFBQVEsWUFBVSxPQUFPLFNBQVMsQ0FBQztBQUM1RCxjQUFNLFFBQVEsUUFBUTtBQUN0QixjQUFNLGlCQUFpQixPQUFPLGtCQUFrQjtBQUNoRCxlQUFPLFdBQVcsU0FBUztBQUUzQiw2QkFBcUIsaUJBQWlCLEVBQUUsQ0FBQyxvQkFBb0IsVUFBVSxHQUFHLEtBQUssQ0FBQztBQUNoRixjQUFNLE1BQU0sYUFBYSwwQkFBMEIsU0FBUztBQUM1RCxjQUFNLFFBQVEsRUFBRTtBQUNoQixlQUFPLFlBQVksT0FBTyxrQkFBa0IsUUFBUSxnQkFBZ0Isb0RBQW9EO0FBQ3hILGlCQUFTLFNBQVM7QUFDbEIsaUJBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxPQUFPLGtCQUFrQixVQUFVLGdCQUFnQixLQUFLO0FBQ2xGLGdCQUFNLFFBQVEsQ0FBQztBQUFBLFFBQ2hCO0FBQ0EsY0FBTSxRQUFRLFFBQVE7QUFFdEIsZUFBTyxnQkFBZ0I7QUFBQSxVQUN0QixXQUFXLE9BQU87QUFBQSxVQUNsQixXQUFXLE9BQU8sa0JBQWtCLFNBQVM7QUFBQSxVQUM3QyxXQUFXLE9BQU8sa0JBQWtCLEdBQUcsRUFBRSxHQUFHO0FBQUEsUUFDN0MsR0FBRztBQUFBLFVBQ0YsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFFBQ1osQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELGlCQUFTLFNBQVM7QUFDbEIsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssNkVBQTZFLFlBQVk7QUFDN0YsWUFBTSxTQUFTLElBQUksbUJBQW1CLENBQUMsQ0FBQztBQUN4QyxZQUFNLEVBQUUsT0FBTyxxQkFBcUIsSUFBSSx1QkFBdUIsYUFBYSxFQUFFLGVBQWUsT0FBTyxDQUFDO0FBQ3JHLFlBQU0sV0FBVyxJQUFJLGdCQUFzQjtBQUMzQyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxNQUFNLGFBQWE7QUFDekIsZUFBTyxXQUFXLFNBQVM7QUFFM0IsNkJBQXFCLGlCQUFpQixFQUFFLENBQUMsb0JBQW9CLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFDaEYsY0FBTSxjQUFjLE1BQU0sYUFBYTtBQUN2QyxjQUFNLFFBQVEsRUFBRTtBQUNoQixlQUFPLFlBQVksT0FBTyxnQkFBZ0IsR0FBRyx5REFBeUQ7QUFFdEcsaUJBQVMsU0FBUztBQUNsQixjQUFNO0FBQ04sZUFBTyxnQkFBZ0I7QUFBQSxVQUN0QixRQUFRLE9BQU87QUFBQSxVQUNmLE9BQU8sT0FBTztBQUFBLFFBQ2YsR0FBRztBQUFBLFVBQ0YsUUFBUTtBQUFBLFVBQ1IsT0FBTztBQUFBLFFBQ1IsQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELGlCQUFTLFNBQVM7QUFDbEIsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssOERBQThELFlBQVk7QUFDOUUsWUFBTSxTQUFTLElBQUksbUJBQW1CLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxVQUFVLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDNUUsWUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLE9BQU8sQ0FBQztBQUNyRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxhQUFhLE1BQU0sUUFBUSxZQUFVLE9BQU8sU0FBUyxDQUFDO0FBQzVELGNBQU0sTUFBTSxhQUFhO0FBQ3pCLGNBQU0saUJBQWlCLE9BQU8sa0JBQWtCO0FBQ2hELGVBQU8sWUFBWSxJQUFJLE1BQU0sYUFBYTtBQUUxQyw2QkFBcUIsaUJBQWlCLEVBQUUsQ0FBQyxvQkFBb0IsVUFBVSxHQUFHLEtBQUssQ0FBQztBQUNoRixjQUFNLFFBQVEsRUFBRTtBQUNoQixlQUFPLFlBQVk7QUFDbkIsY0FBTSxNQUFNLGNBQWM7QUFFMUIsZUFBTyxZQUFZLE9BQU8sa0JBQWtCLFFBQVEsaUJBQWlCLENBQUM7QUFBQSxNQUN2RSxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsWUFBTSxTQUFTLElBQUksbUJBQW1CLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxXQUFXLE1BQU0sVUFBVSxDQUFDLENBQUM7QUFDOUUsWUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLE9BQU8sQ0FBQztBQUNyRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxhQUFhLE1BQU0sUUFBUSxZQUFVLE9BQU8sS0FBSyxXQUFTLE1BQU0sT0FBTyxTQUFTLENBQUM7QUFDdkYsY0FBTSxRQUFRLFFBQVE7QUFFdEIsY0FBTSxZQUFZLElBQUksZ0JBQXNCO0FBQzVDLGNBQU0sa0JBQWtCLElBQUksZ0JBQXNCO0FBQ2xELGVBQU8sZUFBZSxLQUFLLFVBQVUsR0FBRyxnQkFBZ0IsQ0FBQztBQUN6RCxlQUFPLG1CQUFtQjtBQUFBLFVBQ3pCLENBQUMsRUFBRSxJQUFJLFNBQVMsTUFBTSxRQUFRLENBQUM7QUFBQSxVQUMvQixDQUFDLEVBQUUsSUFBSSxlQUFlLE1BQU0sY0FBYyxDQUFDO0FBQUEsUUFDNUM7QUFDQSxjQUFNLGlCQUFpQixPQUFPLGtCQUFrQjtBQUNoRCxjQUFNLGVBQWUsTUFBTSxjQUFjO0FBQ3pDLGlCQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sT0FBTyxrQkFBa0IsU0FBUyxpQkFBaUIsR0FBRyxLQUFLO0FBQ3JGLGdCQUFNLFFBQVEsQ0FBQztBQUFBLFFBQ2hCO0FBRUEsNkJBQXFCLGlCQUFpQixFQUFFLENBQUMsb0JBQW9CLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFDaEYsaUJBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxPQUFPLGtCQUFrQixTQUFTLGlCQUFpQixHQUFHLEtBQUs7QUFDckYsZ0JBQU0sUUFBUSxDQUFDO0FBQUEsUUFDaEI7QUFDQSxlQUFPLGdCQUFnQixNQUFNLE9BQU8sSUFBSSxHQUFHLENBQUMsQ0FBQztBQUU3Qyx3QkFBZ0IsU0FBUztBQUN6QixjQUFNLGFBQWEsTUFBTSxRQUFRLFlBQVUsT0FBTyxLQUFLLFdBQVMsTUFBTSxPQUFPLGFBQWEsQ0FBQztBQUMzRixrQkFBVSxTQUFTO0FBQ25CLGNBQU07QUFFTixlQUFPLGdCQUFnQixNQUFNLE9BQU8sSUFBSSxFQUFFLElBQUksV0FBUyxNQUFNLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQztBQUFBLE1BQ2xGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxnRUFBZ0UsWUFBWTtBQUNoRixZQUFNLFNBQVMsSUFBSSxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3hDLFlBQU0sRUFBRSxPQUFPLHFCQUFxQixJQUFJLHVCQUF1QixhQUFhLEVBQUUsZUFBZSxPQUFPLENBQUM7QUFDckcsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0sTUFBTSxhQUFhO0FBRXpCLDZCQUFxQixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQixVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ2hGLGNBQU0sUUFBUSxRQUFRO0FBRXRCLGVBQU8sWUFBWSxPQUFPLFdBQVcsQ0FBQztBQUFBLE1BQ3ZDLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxpRUFBaUUsWUFBWTtBQUNqRixZQUFNLFNBQVMsSUFBSSxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3hDLFlBQU0sRUFBRSxPQUFPLHFCQUFxQixJQUFJLHVCQUF1QixhQUFhLEVBQUUsZUFBZSxPQUFPLENBQUM7QUFDckcsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELGNBQU0sTUFBTSxhQUFhO0FBRXpCLFlBQUksV0FBVztBQUNmLDhCQUFzQixPQUFPLFVBQVUsRUFBRSxVQUFVO0FBQUUscUJBQVc7QUFBQSxRQUFNLEVBQUUsQ0FBQztBQUV6RSw2QkFBcUIsaUJBQWlCLEVBQUUsQ0FBQyxvQkFBb0IsVUFBVSxHQUFHLEtBQUssQ0FBQztBQUNoRixjQUFNLFFBQVEsUUFBUTtBQUV0QixlQUFPLGdCQUFnQjtBQUFBLFVBQ3RCLFdBQVcsT0FBTztBQUFBLFVBQ2xCO0FBQUEsUUFDRCxHQUFHO0FBQUEsVUFDRixXQUFXO0FBQUEsVUFDWCxVQUFVO0FBQUEsUUFDWCxDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUsseURBQXlELFlBQVk7QUFDekUsWUFBTSxTQUFTLElBQUksbUJBQW1CLENBQUMsQ0FBQztBQUN4QyxZQUFNLGFBQWEsSUFBSSxrQkFBa0I7QUFDekMsWUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLFFBQVEsV0FBVyxDQUFDO0FBQ2pILFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLE1BQU0sYUFBYTtBQUV6QixtQkFBVyxTQUFTLFNBQVMsS0FBSztBQUNsQyw2QkFBcUIsaUJBQWlCLEVBQUUsQ0FBQyxvQkFBb0Isd0JBQXdCLEdBQUcsS0FBSyxDQUFDO0FBQzlGLGNBQU0sUUFBUSxRQUFRO0FBRXRCLGVBQU8sWUFBWSxPQUFPLFdBQVcsQ0FBQztBQUFBLE1BQ3ZDLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBTUQsYUFBUyxvQkFBb0IsT0FBMkI7QUFDdkQsTUFBQyxNQUFrRCxpQkFBaUI7QUFBQSxJQUNyRTtBQUdBLGFBQVMsZUFBZ0g7QUFDeEgsYUFBTztBQUFBLFFBQ04sZUFBZTtBQUFBLFFBQ2YsVUFBVTtBQUFBLFFBQ1YsVUFBVTtBQUFFLGVBQUssV0FBVztBQUFBLFFBQU07QUFBQSxRQUNsQyxnQkFBZ0IsWUFBWTtBQUFBLFFBQUU7QUFBQSxNQUMvQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLG1EQUFtRCxZQUFZO0FBQ25FLFlBQU0sU0FBUyxJQUFJLG1CQUFtQixDQUFDLENBQUM7QUFDeEMsWUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLE9BQU8sQ0FBQztBQUNyRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxNQUFNLGFBQWE7QUFFekIsY0FBTSxPQUFPLGFBQWE7QUFDMUIsOEJBQXNCLE9BQU8sUUFBUSxJQUFJO0FBRXpDLDZCQUFxQixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQixVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ2hGLGNBQU0sUUFBUSxDQUFDO0FBQ2YsY0FBTSxhQUFhLEVBQUUsV0FBVyxPQUFPLFdBQVcsVUFBVSxLQUFLLFNBQVM7QUFFMUUsYUFBSyxnQkFBZ0I7QUFDckIsNEJBQW9CLEtBQUs7QUFDekIsY0FBTSxRQUFRLENBQUM7QUFFZixlQUFPLGdCQUFnQjtBQUFBLFVBQ3RCO0FBQUEsVUFDQSxXQUFXLEVBQUUsV0FBVyxPQUFPLFdBQVcsVUFBVSxLQUFLLFNBQVM7QUFBQSxRQUNuRSxHQUFHO0FBQUEsVUFDRixZQUFZLEVBQUUsV0FBVyxHQUFHLFVBQVUsTUFBTTtBQUFBLFVBQzVDLFdBQVcsRUFBRSxXQUFXLEdBQUcsVUFBVSxLQUFLO0FBQUEsUUFDM0MsQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGdFQUFnRSxZQUFZO0FBQ2hGLFlBQU0sU0FBUyxJQUFJLG1CQUFtQixDQUFDLENBQUM7QUFDeEMsWUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLE9BQU8sQ0FBQztBQUNyRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxNQUFNLGFBQWE7QUFFekIsY0FBTSxRQUFRLGFBQWE7QUFDM0IsY0FBTSxTQUFTLGFBQWE7QUFDNUIsOEJBQXNCLE9BQU8sVUFBVSxLQUFLO0FBQzVDLDhCQUFzQixPQUFPLFVBQVUsTUFBTTtBQUU3Qyw2QkFBcUIsaUJBQWlCLEVBQUUsQ0FBQyxvQkFBb0IsVUFBVSxHQUFHLEtBQUssQ0FBQztBQUNoRixjQUFNLFFBQVEsQ0FBQztBQUVmLGNBQU0sZ0JBQWdCO0FBQ3RCLDRCQUFvQixLQUFLO0FBQ3pCLGNBQU0sUUFBUSxDQUFDO0FBQ2YsY0FBTSxhQUFhLE9BQU87QUFFMUIsZUFBTyxnQkFBZ0I7QUFDdkIsNEJBQW9CLEtBQUs7QUFDekIsY0FBTSxRQUFRLENBQUM7QUFFZixlQUFPLGdCQUFnQixFQUFFLFlBQVksYUFBYSxPQUFPLFVBQVUsR0FBRyxFQUFFLFlBQVksR0FBRyxhQUFhLEVBQUUsQ0FBQztBQUFBLE1BQ3hHLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx3RUFBd0UsWUFBWTtBQUN4RixZQUFNLFNBQVMsSUFBSSxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3hDLFlBQU0sRUFBRSxPQUFPLHFCQUFxQixJQUFJLHVCQUF1QixhQUFhLEVBQUUsZUFBZSxPQUFPLENBQUM7QUFDckcsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELGNBQU0sTUFBTSxhQUFhO0FBRXpCLDhCQUFzQixPQUFPLFFBQVEsYUFBYSxDQUFDO0FBRW5ELDZCQUFxQixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQixVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ2hGLGNBQU0sUUFBUSxDQUFDO0FBQ2YsY0FBTSxhQUFhLE9BQU87QUFJMUIsY0FBTSxNQUFNLGVBQWUsYUFBYSxJQUFJLGNBQWMsTUFBTSxDQUFDO0FBRWpFLGVBQU8sZ0JBQWdCLEVBQUUsWUFBWSxjQUFjLE9BQU8sVUFBVSxHQUFHLEVBQUUsWUFBWSxHQUFHLGNBQWMsRUFBRSxDQUFDO0FBQUEsTUFDMUcsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHNEQUFzRCxZQUFZO0FBQ3RFLFlBQU0sU0FBUyxJQUFJLG1CQUFtQixDQUFDLENBQUM7QUFDeEMsWUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLE9BQU8sQ0FBQztBQUNyRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxNQUFNLGFBQWE7QUFFekIsY0FBTSxPQUFPLGFBQWE7QUFDMUIsOEJBQXNCLE9BQU8sUUFBUSxJQUFJO0FBSXpDLDZCQUFxQixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQixVQUFVLEdBQUcsS0FBSyxDQUFDO0FBQ2hGLDZCQUFxQixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQixrQkFBa0IsR0FBRyxRQUFRLENBQUM7QUFDM0YsY0FBTSxRQUFRLENBQUM7QUFFZixhQUFLLGdCQUFnQjtBQUNyQiw0QkFBb0IsS0FBSztBQUN6Qiw0QkFBb0IsS0FBSztBQUN6QixjQUFNLFFBQVEsQ0FBQztBQUVmLGVBQU8sWUFBWSxPQUFPLFdBQVcsQ0FBQztBQUFBLE1BQ3ZDLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtRUFBbUUsWUFBWTtBQUNuRixVQUFNLFFBQVEsZ0JBQWdCLGFBQWE7QUFBQSxNQUMxQyxlQUFlLElBQUksa0JBQWtCLENBQUMsR0FBRyxDQUFDO0FBQUEsUUFDekMsSUFBSTtBQUFBLFFBQ0osTUFBTTtBQUFBLFFBQ04sU0FBUyxFQUFFLFlBQVksSUFBSTtBQUFBLFFBQzNCLGNBQWMsRUFBRSxRQUFRLEVBQUUsMkJBQTJCLE9BQVEsbUJBQW1CLE1BQU8sbUJBQW1CLE1BQU8sR0FBRyxVQUFVLEVBQUUsUUFBUSxLQUFLLEVBQUU7QUFBQSxNQUNoSixDQUFDLENBQUM7QUFBQSxJQUNILENBQUM7QUFDRCxRQUFJO0FBQ0gsWUFBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsWUFBTSxTQUFTLE1BQU0sYUFBYSxNQUFNLFFBQVEsQ0FBQUMsWUFBVUEsUUFBTyxTQUFTLENBQUM7QUFFM0UsYUFBTyxnQkFBZ0IsUUFBUSxDQUFDO0FBQUEsUUFDL0IsVUFBVTtBQUFBLFFBQ1YsSUFBSTtBQUFBLFFBQ0osTUFBTTtBQUFBLFFBQ04sa0JBQWtCO0FBQUEsUUFDbEIsaUJBQWlCO0FBQUEsUUFDakIsaUJBQWlCO0FBQUEsUUFDakIsZ0JBQWdCO0FBQUEsUUFDaEIsY0FBYztBQUFBLFFBQ2QsYUFBYTtBQUFBLFFBQ2IsT0FBTyxFQUFFLG1CQUFtQixJQUFJO0FBQUEsTUFDakMsQ0FBQyxDQUFDO0FBQUEsSUFDSCxVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscUVBQXFFLFlBQVk7QUFDckYsVUFBTSxRQUFRLGdCQUFnQixhQUFhO0FBQUEsTUFDMUMsZUFBZSxJQUFJLGtCQUFrQixDQUFDLEdBQUcsQ0FBQztBQUFBLFFBQ3pDLElBQUk7QUFBQSxRQUNKLE1BQU07QUFBQSxRQUNOLGNBQWMsRUFBRSxRQUFRLEVBQUUsMkJBQTJCLElBQVEsRUFBRTtBQUFBLFFBQy9ELFNBQVM7QUFBQSxVQUNSLFlBQVk7QUFBQSxVQUNaLE9BQU87QUFBQSxZQUNOLElBQUk7QUFBQSxZQUNKLGlCQUFpQjtBQUFBLFlBQ2pCLFFBQVE7QUFBQSxZQUNSLFNBQVM7QUFBQSxVQUNWO0FBQUEsVUFDQSxhQUFhO0FBQUEsWUFDWixXQUFXO0FBQUEsWUFDWCxpQkFBaUI7QUFBQSxZQUNqQixZQUFZO0FBQUEsWUFDWixnQkFBZ0I7QUFBQSxZQUNoQixhQUFhO0FBQUEsWUFDYixhQUFhLEVBQUUsaUJBQWlCLEtBQVcsWUFBWSxLQUFLLGdCQUFnQixLQUFLLGFBQWEsS0FBSztBQUFBLFVBQ3BHO0FBQUEsUUFDRDtBQUFBLFFBQ0EscUJBQXFCO0FBQUEsUUFDckIsMEJBQTBCO0FBQUEsTUFDM0IsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBQ0QsUUFBSTtBQUNILFlBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELFlBQU0sU0FBUyxNQUFNLGFBQWEsTUFBTSxRQUFRLENBQUFBLFlBQVVBLFFBQU8sU0FBUyxDQUFDO0FBRTNFLGFBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxFQUFFLE9BQU87QUFBQSxRQUN2QyxtQkFBbUI7QUFBQSxRQUNuQixXQUFXO0FBQUEsUUFDWCxXQUFXO0FBQUEsUUFDWCxZQUFZO0FBQUEsUUFDWixzQkFBc0I7QUFBQSxRQUN0QixzQkFBc0I7QUFBQSxRQUN0Qix1QkFBdUI7QUFBQSxRQUN2QixlQUFlO0FBQUEsUUFDZixVQUFVO0FBQUEsUUFDVixPQUFPO0FBQUEsVUFDTixJQUFJO0FBQUEsVUFDSixpQkFBaUI7QUFBQSxVQUNqQixRQUFRO0FBQUEsVUFDUixTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDJGQUEyRixZQUFZO0FBQzNHLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYTtBQUFBLE1BQzFDLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxHQUFHLENBQUM7QUFBQSxRQUN6QyxJQUFJO0FBQUEsUUFDSixNQUFNO0FBQUEsUUFDTixjQUFjLEVBQUUsUUFBUSxFQUFFLDJCQUEyQixNQUFPLEVBQUU7QUFBQSxRQUM5RCwyQkFBMkIsQ0FBQyxPQUFPLFVBQVUsTUFBTTtBQUFBLFFBQ25ELHdCQUF3QjtBQUFBLE1BQ3pCLENBQUMsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUNELFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxZQUFNLFNBQVMsTUFBTSxhQUFhLE1BQU0sUUFBUSxDQUFBQSxZQUFVQSxRQUFPLFNBQVMsQ0FBQztBQUUzRSxZQUFNLFNBQVMsT0FBTyxDQUFDLEVBQUU7QUFDekIsYUFBTyxnQkFBZ0IsUUFBUSxXQUFXLGVBQWUsTUFBTSxDQUFDLE9BQU8sVUFBVSxNQUFNLENBQUM7QUFDeEYsYUFBTyxZQUFZLFFBQVEsV0FBVyxlQUFlLFNBQVMsUUFBUTtBQUN0RSxhQUFPLFlBQVksUUFBUSxXQUFXLGFBQWEsTUFBUztBQUFBLElBQzdELFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw0RUFBNEUsWUFBWTtBQUM1RixVQUFNLHFCQUFxQixJQUFJLHFCQUFxQjtBQUNwRCxVQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxtQkFBbUIsQ0FBQztBQUNqRSxVQUFNLGlCQUFpQixZQUFZLElBQUksSUFBSSxRQUE0QixDQUFDO0FBQ3hFLFVBQU0sYUFBc0M7QUFBQSxNQUMzQyxNQUFNLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRTtBQUFBLE1BQ2hDLG1CQUFtQixlQUFlO0FBQUEsSUFDbkM7QUFDQSxnQkFBWSxJQUFJLG1CQUFtQixTQUFTLFlBQVksVUFBVSxDQUFDO0FBRW5FLFFBQUk7QUFDSCxxQkFBZSxLQUFLO0FBQUEsUUFDbkI7QUFBQSxVQUNDLFFBQVE7QUFBQSxVQUNSLElBQUk7QUFBQSxVQUNKLE1BQU07QUFBQSxVQUNOLDJCQUEyQixDQUFDLFdBQVcsT0FBTyxNQUFNO0FBQUEsVUFDcEQsd0JBQXdCO0FBQUEsUUFDekI7QUFBQSxRQUNBO0FBQUEsVUFDQyxRQUFRO0FBQUEsVUFDUixJQUFJO0FBQUEsVUFDSixNQUFNO0FBQUEsVUFDTiwyQkFBMkIsQ0FBQyxPQUFPLFVBQVUsTUFBTTtBQUFBLFVBQ25ELHdCQUF3QjtBQUFBLFFBQ3pCO0FBQUEsUUFDQTtBQUFBLFVBQ0MsUUFBUTtBQUFBLFVBQ1IsSUFBSTtBQUFBLFVBQ0osTUFBTTtBQUFBLFVBQ04sMkJBQTJCLENBQUMsU0FBUztBQUFBLFVBQ3JDLHdCQUF3QjtBQUFBLFFBQ3pCO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxTQUFTLE1BQU0sYUFBYSxNQUFNLFFBQVEsQ0FBQUEsWUFBVUEsUUFBTyxXQUFXLENBQUM7QUFFN0UsYUFBTyxnQkFBZ0IsT0FBTyxJQUFJLFlBQVU7QUFBQSxRQUMzQyxJQUFJLE1BQU07QUFBQSxRQUNWLGVBQWUsTUFBTSxjQUFjLFdBQVcsaUJBQWlCO0FBQUEsVUFDOUQsTUFBTSxNQUFNLGFBQWEsV0FBVyxjQUFjO0FBQUEsVUFDbEQsU0FBUyxNQUFNLGFBQWEsV0FBVyxjQUFjO0FBQUEsUUFDdEQ7QUFBQSxNQUNELEVBQUUsR0FBRztBQUFBLFFBQ0osRUFBRSxJQUFJLHlCQUF5QixlQUFlLEVBQUUsTUFBTSxDQUFDLE9BQU8sTUFBTSxHQUFHLFNBQVMsTUFBTSxFQUFFO0FBQUEsUUFDeEYsRUFBRSxJQUFJLHNCQUFzQixlQUFlLEVBQUUsTUFBTSxDQUFDLE9BQU8sVUFBVSxNQUFNLEdBQUcsU0FBUyxTQUFTLEVBQUU7QUFBQSxRQUNsRyxFQUFFLElBQUkseUJBQXlCLGVBQWUsT0FBVTtBQUFBLE1BQ3pELENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw0RkFBNEYsWUFBWTtBQUM1RyxVQUFNLFFBQVEsZ0JBQWdCLGFBQWE7QUFBQSxNQUMxQyxlQUFlLElBQUksa0JBQWtCLENBQUMsR0FBRyxDQUFDO0FBQUEsUUFDekMsSUFBSTtBQUFBLFFBQ0osTUFBTTtBQUFBLFFBQ04sY0FBYyxFQUFFLFFBQVEsRUFBRSwyQkFBMkIsSUFBUSxFQUFFO0FBQUEsUUFDL0QsU0FBUztBQUFBLFVBQ1IsWUFBWTtBQUFBLFVBQ1osYUFBYTtBQUFBLFlBQ1osaUJBQWlCO0FBQUEsWUFDakIsYUFBYSxFQUFFLGlCQUFpQixLQUFXLFlBQVksRUFBRTtBQUFBLFVBQzFEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBQ0QsUUFBSTtBQUNILFlBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELFlBQU0sU0FBUyxNQUFNLGFBQWEsTUFBTSxRQUFRLENBQUFBLFlBQVVBLFFBQU8sU0FBUyxDQUFDO0FBRTNFLFlBQU0sY0FBYyxPQUFPLENBQUMsRUFBRSxjQUFjLFdBQVc7QUFDdkQsYUFBTyxZQUFZLGFBQWEsTUFBTSxRQUFRO0FBQzlDLGFBQU8sZ0JBQWdCLGFBQWEsTUFBTSxDQUFDLEtBQVMsR0FBUyxDQUFDO0FBQzlELGFBQU8sWUFBWSxhQUFhLFNBQVMsR0FBTztBQUNoRCxhQUFPLGdCQUFnQixhQUFhLFlBQVksQ0FBQyxRQUFRLElBQUksQ0FBQztBQUFBLElBQy9ELFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxrRkFBa0YsWUFBWTtBQUNsRyxVQUFNLFFBQVEsZ0JBQWdCLGFBQWE7QUFBQSxNQUMxQyxlQUFlLElBQUksa0JBQWtCLENBQUMsR0FBRztBQUFBLFFBQ3hDO0FBQUEsVUFDQyxJQUFJO0FBQUEsVUFDSixNQUFNO0FBQUEsVUFDTixTQUFTLEVBQUUsWUFBWSxHQUFHLGFBQWEsRUFBRSxZQUFZLElBQVEsRUFBRTtBQUFBLFFBQ2hFO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSTtBQUFBLFVBQ0osTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFlBQ1IsWUFBWTtBQUFBLFlBQ1osYUFBYSxFQUFFLFlBQVksS0FBUyxhQUFhLEVBQUUsWUFBWSxJQUFRLEVBQUU7QUFBQSxVQUMxRTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCxRQUFJO0FBQ0gsWUFBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsWUFBTSxTQUFTLE1BQU0sYUFBYSxNQUFNLFFBQVEsQ0FBQUEsWUFBVUEsUUFBTyxTQUFTLENBQUM7QUFFM0UsYUFBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLGNBQWMsTUFBUztBQUNwRCxhQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsY0FBYyxNQUFTO0FBQUEsSUFDckQsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDhGQUE4RixZQUFZO0FBQzlHLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYTtBQUFBLE1BQzFDLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxHQUFHLENBQUM7QUFBQSxRQUN6QyxJQUFJO0FBQUEsUUFDSixNQUFNO0FBQUEsUUFDTixjQUFjLEVBQUUsUUFBUSxFQUFFLDJCQUEyQixJQUFRLEVBQUU7QUFBQSxRQUMvRCxTQUFTO0FBQUEsVUFDUixZQUFZO0FBQUEsVUFDWixhQUFhO0FBQUEsWUFDWixZQUFZO0FBQUEsWUFDWixhQUFhLEVBQUUsWUFBWSxJQUFVO0FBQUEsVUFDdEM7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNILENBQUM7QUFDRCxRQUFJO0FBQ0gsWUFBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsWUFBTSxTQUFTLE1BQU0sYUFBYSxNQUFNLFFBQVEsQ0FBQUEsWUFBVUEsUUFBTyxTQUFTLENBQUM7QUFFM0UsWUFBTSxjQUFjLE9BQU8sQ0FBQyxFQUFFLGNBQWMsWUFBWTtBQUN4RCxhQUFPLFlBQVksYUFBYSxNQUFNLFFBQVE7QUFDOUMsYUFBTyxnQkFBZ0IsYUFBYSxNQUFNLENBQUMsS0FBUyxHQUFTLENBQUM7QUFDOUQsYUFBTyxZQUFZLGFBQWEsU0FBUyxHQUFPO0FBQ2hELGFBQU8sZ0JBQWdCLGFBQWEsWUFBWSxDQUFDLFFBQVEsSUFBSSxDQUFDO0FBQUEsSUFDL0QsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHdIQUF3SCxZQUFZO0FBQ3hJLFVBQU0sRUFBRSxPQUFPLHFCQUFxQixJQUFJLHVCQUF1QixhQUFhO0FBQUEsTUFDM0UsZUFBZSxJQUFJLGtCQUFrQixDQUFDLEdBQUcsQ0FBQztBQUFBLFFBQ3pDLElBQUk7QUFBQSxRQUNKLE1BQU07QUFBQSxRQUNOLGNBQWMsRUFBRSxRQUFRLEVBQUUsMkJBQTJCLElBQVEsRUFBRTtBQUFBLFFBQy9ELFNBQVM7QUFBQSxVQUNSLFlBQVk7QUFBQSxVQUNaLGFBQWE7QUFBQSxZQUNaLFlBQVk7QUFBQSxZQUNaLGFBQWEsRUFBRSxZQUFZLElBQVU7QUFBQSxVQUN0QztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUNELFFBQUk7QUFDSCwyQkFBcUIsaUJBQWlCLEVBQUUsQ0FBQywwQ0FBMEMsR0FBRyxLQUFLLENBQUM7QUFDNUYsWUFBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsWUFBTSxTQUFTLE1BQU0sYUFBYSxNQUFNLFFBQVEsQ0FBQUEsWUFBVUEsUUFBTyxTQUFTLENBQUM7QUFFM0UsWUFBTSxjQUFjLE9BQU8sQ0FBQyxFQUFFLGNBQWMsWUFBWTtBQUN4RCxhQUFPLFlBQVksYUFBYSxNQUFNLFFBQVE7QUFDOUMsYUFBTyxnQkFBZ0IsYUFBYSxNQUFNLENBQUMsR0FBUyxDQUFDO0FBQ3JELGFBQU8sWUFBWSxhQUFhLFNBQVMsR0FBUztBQUNsRCxhQUFPLGdCQUFnQixhQUFhLFlBQVksQ0FBQyxJQUFJLENBQUM7QUFBQSxJQUN2RCxVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELFFBQU0sc0NBQXNDLE1BQU07QUFDakQsVUFBTSxtQkFBMEM7QUFBQSxNQUMvQyxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixjQUFjLEVBQUUsUUFBUSxFQUFFLDJCQUEyQixJQUFRLEVBQUU7QUFBQSxNQUMvRCxTQUFTO0FBQUEsUUFDUixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsVUFDWixZQUFZO0FBQUEsVUFDWixhQUFhLEVBQUUsWUFBWSxLQUFXLFlBQVksRUFBRTtBQUFBLFFBQ3JEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxtQkFBZSxxQkFBcUIsT0FBbUMsUUFBMEMsbUJBQStFO0FBQy9MLFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLEdBQUcsTUFBTTtBQUMvQyxVQUFJO0FBQ0osYUFBTyxnQkFBZ0IsT0FBTSxXQUFVO0FBQ3RDLHlCQUFpQjtBQUNqQixlQUFPLElBQUksbUJBQW1CO0FBQUEsTUFDL0I7QUFDQSxZQUFNLEVBQUUsT0FBTyxxQkFBcUIsSUFBSSx1QkFBdUIsYUFBYSxFQUFFLG9CQUFvQixlQUFlLE9BQU8sQ0FBQztBQUN6SCxVQUFJO0FBQ0gsWUFBSSxtQkFBbUI7QUFDdEIsK0JBQXFCLGlCQUFpQixFQUFFLENBQUMsMENBQTBDLEdBQUcsS0FBSyxDQUFDO0FBQUEsUUFDN0Y7QUFDQSxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLGFBQWEsTUFBTSxRQUFRLE9BQUssRUFBRSxTQUFTLENBQUM7QUFDbEQsY0FBTSxTQUFTLE1BQU0sTUFBTSxjQUFjO0FBQUEsVUFDeEMsU0FBUyxhQUFhLElBQUksY0FBYyxhQUFhO0FBQUEsVUFDckQsb0JBQW9CLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQztBQUFBLFVBQzNDLEdBQUksUUFBUSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsUUFDMUIsQ0FBQztBQUNELGNBQU0sTUFBTSxNQUFNLFlBQVksZUFBZSxPQUFPLE9BQU8sR0FBRyxTQUFTLE1BQVM7QUFDaEYsZUFBTztBQUFBLE1BQ1IsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNEO0FBRUEsU0FBSyx5REFBeUQsWUFBWTtBQUN6RSxZQUFNLFNBQVMsTUFBTSxxQkFBcUIsRUFBRSxJQUFJLGlCQUFpQixRQUFRLEVBQUUsYUFBYSxVQUFVLEVBQUUsR0FBRyxDQUFDLGdCQUFnQixDQUFDO0FBQ3pILGFBQU8sR0FBRyxRQUFRLDJEQUEyRDtBQUM3RSxhQUFPLFlBQVksT0FBTyxhQUFhLGNBQWM7QUFBQSxJQUN0RCxDQUFDO0FBRUQsU0FBSyxvREFBb0QsWUFBWTtBQUNwRSxZQUFNLFNBQVMsTUFBTSxxQkFBcUIsRUFBRSxJQUFJLGlCQUFpQixRQUFRLEVBQUUsYUFBYSxTQUFTLEVBQUUsR0FBRyxDQUFDLGdCQUFnQixDQUFDO0FBQ3hILGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLGFBQWEsU0FBUztBQUFBLElBQ2pELENBQUM7QUFFRCxTQUFLLHlEQUF5RCxZQUFZO0FBQ3pFLFlBQU0sU0FBUyxNQUFNO0FBQUEsUUFDcEIsRUFBRSxJQUFJLHFCQUFxQixRQUFRLEVBQUUsYUFBYSxVQUFVLEVBQUU7QUFBQSxRQUM5RCxDQUFDLEVBQUUsSUFBSSxxQkFBcUIsTUFBTSxZQUFZLENBQUM7QUFBQSxNQUNoRDtBQUNBLGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGFBQU8sWUFBWSxPQUFPLGFBQWEsTUFBUztBQUFBLElBQ2pELENBQUM7QUFFRCxTQUFLLHFGQUFxRixZQUFZO0FBQ3JHLFlBQU0sU0FBUyxNQUFNLHFCQUFxQixFQUFFLElBQUksaUJBQWlCLFFBQVEsRUFBRSxhQUFhLGVBQWUsRUFBRSxHQUFHLENBQUMsZ0JBQWdCLENBQUM7QUFDOUgsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxZQUFZLE9BQU8sYUFBYSxjQUFjO0FBQUEsSUFDdEQsQ0FBQztBQUVELFNBQUssNEZBQTRGLFlBQVk7QUFDNUcsWUFBTSx1QkFBOEM7QUFBQSxRQUNuRCxJQUFJO0FBQUEsUUFDSixNQUFNO0FBQUEsUUFDTixjQUFjLEVBQUUsUUFBUSxFQUFFLDJCQUEyQixJQUFRLEVBQUU7QUFBQSxRQUMvRCxTQUFTO0FBQUEsVUFDUixZQUFZO0FBQUEsVUFDWixhQUFhO0FBQUEsWUFDWixZQUFZO0FBQUEsWUFDWixhQUFhLEVBQUUsWUFBWSxJQUFVO0FBQUEsVUFDdEM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxNQUFNLHFCQUFxQixFQUFFLElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQztBQUN6RixhQUFPLEdBQUcsTUFBTTtBQUNoQixhQUFPLFlBQVksT0FBTyxhQUFhLE1BQVM7QUFBQSxJQUNqRCxDQUFDO0FBRUQsU0FBSyx5R0FBeUcsWUFBWTtBQUN6SCxZQUFNLHVCQUE4QztBQUFBLFFBQ25ELElBQUk7QUFBQSxRQUNKLE1BQU07QUFBQSxRQUNOLGNBQWMsRUFBRSxRQUFRLEVBQUUsMkJBQTJCLElBQVEsRUFBRTtBQUFBLFFBQy9ELFNBQVM7QUFBQSxVQUNSLFlBQVk7QUFBQSxVQUNaLGFBQWE7QUFBQSxZQUNaLFlBQVk7QUFBQSxZQUNaLGFBQWEsRUFBRSxZQUFZLElBQVU7QUFBQSxVQUN0QztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsWUFBTSxTQUFTLE1BQU0scUJBQXFCLEVBQUUsSUFBSSxnQkFBZ0IsR0FBRyxDQUFDLG9CQUFvQixHQUFHLElBQUk7QUFDL0YsYUFBTyxHQUFHLE1BQU07QUFDaEIsYUFBTyxZQUFZLE9BQU8sYUFBYSxjQUFjO0FBQUEsSUFDdEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0ZBQXdGLFlBQVk7QUFDeEcsVUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsVUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWE7QUFBQSxNQUMzRSxnQ0FBZ0M7QUFBQSxNQUNoQztBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sc0JBQXNCLFFBQVEsSUFBSSxjQUFjO0FBQ3RELFdBQU8sUUFBUSxJQUFJLGNBQWM7QUFDakMsUUFBSTtBQUNILFlBQU0saUJBQWlCLCtCQUErQixPQUFPLG9CQUFvQjtBQUNqRixZQUFNLGVBQWUsWUFBWSxJQUFJLGVBQWUsT0FBTztBQUMzRCxZQUFNLGFBQWEsa0JBQWtCO0FBQ3JDLFlBQU0sc0JBQXNCLGVBQWUsY0FBYyxHQUFHO0FBQzVELGFBQU8sR0FBRyxtQkFBbUI7QUFFN0IsWUFBTSxTQUFTLE1BQU0sb0JBQW9CO0FBQUEsUUFDeEMsTUFBTTtBQUFBLFFBQ04sV0FBVztBQUFBLFFBQ1gsTUFBTSxJQUFJLEtBQUssMERBQTBELEVBQUU7QUFBQSxRQUMzRSxZQUFZO0FBQUEsTUFDYixHQUFHLEVBQUUsV0FBVyxpQkFBaUIsQ0FBQztBQUVsQyxhQUFPLFlBQVksT0FBTyxNQUFNLGNBQWM7QUFBQSxJQUMvQyxVQUFFO0FBQ0QsVUFBSSx3QkFBd0IsUUFBVztBQUN0QyxlQUFPLFFBQVEsSUFBSSxjQUFjO0FBQUEsTUFDbEMsT0FBTztBQUNOLGdCQUFRLElBQUksY0FBYyxJQUFJO0FBQUEsTUFDL0I7QUFDQSxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxxRkFBcUYsWUFBWTtBQUNyRyxVQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxVQUFNLEVBQUUsT0FBTyxxQkFBcUIsSUFBSSx1QkFBdUIsYUFBYSxFQUFFLGdDQUFnQyxVQUFVLG1CQUFtQixDQUFDO0FBQzVJLFVBQU0sVUFBMEMsQ0FBQztBQUNqRCxnQkFBWSxJQUFJLE1BQU0scUJBQXFCLFlBQVU7QUFDcEQsVUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixnQkFBUSxLQUFLLE9BQU8sTUFBTTtBQUFBLE1BQzNCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixVQUFNLHNCQUFzQixJQUFJLG9CQUFvQjtBQUNwRCxVQUFNLGFBQTZCLEVBQUUsTUFBTSxVQUFVLGFBQWEsZUFBZSxhQUFhLEVBQUUsTUFBTSxVQUFVLFlBQVksQ0FBQyxFQUFFLEVBQUU7QUFDakksd0JBQW9CLElBQUksWUFBWSxDQUFDLFVBQVUsQ0FBQztBQUNoRCx3QkFBb0IsSUFBSSxZQUFZLENBQUMsVUFBVSxDQUFDO0FBQ2hELFVBQU0sY0FBYyxJQUFJLG1CQUFtQjtBQUMzQyxVQUFNLGlCQUFpQiwrQkFBK0IsT0FBTyxzQkFBc0I7QUFBQSxNQUNsRjtBQUFBLE1BQ0E7QUFBQSxNQUNBLFVBQVUsRUFBRSxPQUFPLG9CQUFvQixPQUFPLEdBQUcsU0FBUyxDQUFDLEdBQUcsWUFBWSxDQUFDLEVBQUU7QUFBQSxJQUM5RSxDQUFDO0FBQ0QsVUFBTSxlQUFlLFlBQVksSUFBSSxlQUFlLE9BQU87QUFDM0QsUUFBSTtBQUNILFlBQU0sYUFBYSxrQkFBa0I7QUFDckMsbUJBQWEsZUFBZSxVQUFVLFVBQVU7QUFFaEQsa0JBQVksS0FBSztBQUFBLFFBQ2hCLE1BQU07QUFBQSxRQUNOLE1BQU0sRUFBRSxZQUFZLFVBQVUsVUFBVSxVQUFVLFdBQVcsQ0FBQyxFQUFFO0FBQUEsTUFDakUsQ0FBZ0Q7QUFFaEQsWUFBTSxZQUFZLFFBQVEsS0FBSyxZQUFVLE9BQU8sU0FBUyxXQUFXLGlCQUFpQjtBQUNyRixhQUFPLGdCQUFnQixXQUFXLFNBQVMsV0FBVyxvQkFBb0IsVUFBVSxjQUFjLFFBQVc7QUFBQSxRQUM1RyxNQUFNLHdCQUF3QjtBQUFBLFFBQzlCLFVBQVU7QUFBQSxNQUNYLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsWUFBWTtBQUNoRixVQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxVQUFNLEVBQUUsT0FBTyxzQkFBc0IsWUFBWSxJQUFJLHVCQUF1QixhQUFhLEVBQUUsZ0NBQWdDLFVBQVUsbUJBQW1CLENBQUM7QUFDekosZ0JBQVksSUFBSSxtQ0FBbUMsV0FBVyxDQUFDO0FBQy9ELFVBQU0saUJBQWlCLCtCQUErQixPQUFPLG9CQUFvQjtBQUNqRixVQUFNLGVBQWUsWUFBWSxJQUFJLGVBQWUsT0FBTztBQUMzRCxVQUFNLHdCQUF3QixJQUFJLGdCQUFxQjtBQUN2RCxnQkFBWSxJQUFJLE1BQU0scUJBQXFCLFlBQVU7QUFDcEQsVUFBSSxPQUFPLFNBQVMsd0JBQXdCO0FBQzNDLGNBQU0sTUFBTSxPQUFPLE1BQU0sT0FBTyxNQUFNLENBQUMsR0FBRyxPQUFPLFFBQVE7QUFDekQsWUFBSSxLQUFLO0FBQ1IsZ0NBQXNCLFNBQVMsSUFBSSxNQUFNLEdBQUcsQ0FBQztBQUFBLFFBQzlDO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsUUFBSTtBQUNILFlBQU0sYUFBYSxrQkFBa0I7QUFDckMsWUFBTSxzQkFBc0IsZUFBZSxjQUFjLEdBQUc7QUFDNUQsYUFBTyxHQUFHLG1CQUFtQjtBQUU3QixZQUFNLDBCQUEwQixvQkFBb0I7QUFBQSxRQUNuRCxNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWix5QkFBeUI7QUFBQSxRQUN6QixNQUFNO0FBQUEsUUFDTixVQUFVLElBQUksS0FBSyxxQkFBcUIsRUFBRTtBQUFBLFFBQzFDLFdBQVc7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLE1BQ2xCLEdBQUcsRUFBRSxXQUFXLGlCQUFpQixDQUFDO0FBQ2xDLFlBQU0saUJBQWlCLE1BQU0sc0JBQXNCO0FBRW5ELG1CQUFhLDZCQUE2QixVQUFVO0FBQUEsUUFDbkQsU0FBUztBQUFBLFFBQ1Qsa0JBQWtCO0FBQUEsUUFDbEIsU0FBUyxDQUFDLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLHlCQUF5QixDQUFDO0FBQUEsUUFDOUUsT0FBTyxFQUFFLFNBQVMseUJBQXlCO0FBQUEsTUFDNUMsQ0FBQztBQUNELFlBQU0sUUFBUSxDQUFDO0FBRWYsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixrQkFBa0IsTUFBTTtBQUFBLFFBQ3hCLDBCQUEwQixNQUFNLFlBQVksT0FBTyxjQUFjO0FBQUEsTUFDbEUsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCLEVBQUUsTUFBTSxlQUFlO0FBQUEsUUFDekMsMEJBQTBCO0FBQUEsTUFDM0IsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHVFQUF1RSxZQUFZO0FBQ3ZGLFVBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFVBQU0sRUFBRSxPQUFPLHNCQUFzQixZQUFZLElBQUksdUJBQXVCLGFBQWEsRUFBRSxnQ0FBZ0MsVUFBVSxtQkFBbUIsQ0FBQztBQUN6SixnQkFBWSxJQUFJLG1DQUFtQyxXQUFXLENBQUM7QUFDL0QsVUFBTSxpQkFBaUIsK0JBQStCLE9BQU8sb0JBQW9CO0FBQ2pGLFVBQU0sZUFBZSxZQUFZLElBQUksZUFBZSxPQUFPO0FBQzNELFFBQUksd0JBQXdCLElBQUksZ0JBQXNCO0FBQ3RELFFBQUkseUJBQXlCO0FBQzdCLGdCQUFZLElBQUksTUFBTSxxQkFBcUIsWUFBVTtBQUNwRCxVQUFJLE9BQU8sU0FBUyx3QkFBd0I7QUFDM0M7QUFDQSw4QkFBc0IsU0FBUztBQUFBLE1BQ2hDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixRQUFJO0FBQ0gsWUFBTSxhQUFhLGtCQUFrQjtBQUNyQyxZQUFNLHNCQUFzQixlQUFlLGNBQWMsR0FBRztBQUM1RCxhQUFPLEdBQUcsbUJBQW1CO0FBQzdCLFlBQU0sVUFBNkI7QUFBQSxRQUNsQyxNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWix5QkFBeUI7QUFBQSxRQUN6QixNQUFNO0FBQUEsUUFDTixVQUFVLElBQUksS0FBSyxtQkFBbUIsRUFBRTtBQUFBLFFBQ3hDLFdBQVc7QUFBQSxRQUNYLGlCQUFpQjtBQUFBLE1BQ2xCO0FBRUEsWUFBTSxxQkFBcUIsb0JBQW9CLFNBQVMsRUFBRSxXQUFXLGlCQUFpQixDQUFDO0FBQ3ZGLFlBQU0sc0JBQXNCO0FBQzVCLG1CQUFhLDJCQUEyQixVQUFVLElBQUk7QUFDdEQsWUFBTSxjQUFjLE1BQU07QUFDMUIsWUFBTSxrQkFBa0IsTUFBTSxvQkFBb0IsRUFBRSxHQUFHLFFBQVEsR0FBRyxFQUFFLFdBQVcsaUJBQWlCLENBQUM7QUFFakcsOEJBQXdCLElBQUksZ0JBQXNCO0FBQ2xELFlBQU0scUJBQXFCLG9CQUFvQixFQUFFLEdBQUcsUUFBUSxHQUFHLEVBQUUsV0FBVyxpQkFBaUIsQ0FBQztBQUM5RixZQUFNLHNCQUFzQjtBQUM1QixtQkFBYSwyQkFBMkIsVUFBVSxLQUFLO0FBQ3ZELFlBQU0sY0FBYyxNQUFNO0FBRTFCLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsU0FBUyxDQUFDLGFBQWEsaUJBQWlCLFdBQVc7QUFBQSxRQUNuRDtBQUFBLE1BQ0QsR0FBRztBQUFBLFFBQ0YsU0FBUyxDQUFDLEVBQUUsTUFBTSxlQUFlLEdBQUcsRUFBRSxNQUFNLGVBQWUsR0FBRyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFBQSxRQUN0Ryx3QkFBd0I7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRixVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssd0VBQXdFLFlBQVk7QUFDeEYsVUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsVUFBTSxFQUFFLE9BQU8sc0JBQXNCLFlBQVksSUFBSSx1QkFBdUIsYUFBYSxFQUFFLGdDQUFnQyxVQUFVLG1CQUFtQixDQUFDO0FBQ3pKLGdCQUFZLElBQUksbUNBQW1DLFdBQVcsQ0FBQztBQUMvRCxVQUFNLGlCQUFpQiwrQkFBK0IsT0FBTyxvQkFBb0I7QUFDakYsVUFBTSxlQUFlLFlBQVksSUFBSSxlQUFlLE9BQU87QUFDM0QsUUFBSSx3QkFBd0IsSUFBSSxnQkFBc0I7QUFDdEQsUUFBSSx5QkFBeUI7QUFDN0IsZ0JBQVksSUFBSSxNQUFNLHFCQUFxQixZQUFVO0FBQ3BELFVBQUksT0FBTyxTQUFTLHdCQUF3QjtBQUMzQztBQUNBLDhCQUFzQixTQUFTO0FBQUEsTUFDaEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFFBQUk7QUFDSCxZQUFNLGFBQWEsa0JBQWtCO0FBQ3JDLFlBQU0sc0JBQXNCLGVBQWUsY0FBYyxHQUFHO0FBQzVELGFBQU8sR0FBRyxtQkFBbUI7QUFDN0IsWUFBTSxVQUE2QjtBQUFBLFFBQ2xDLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLHlCQUF5QjtBQUFBLFFBQ3pCLE1BQU07QUFBQSxRQUNOLFVBQVUsSUFBSSxLQUFLLG1CQUFtQixFQUFFO0FBQUEsUUFDeEMsV0FBVztBQUFBLFFBQ1gsaUJBQWlCO0FBQUEsTUFDbEI7QUFFQSxZQUFNLHFCQUFxQixvQkFBb0IsU0FBUyxFQUFFLFdBQVcsaUJBQWlCLENBQUM7QUFDdkYsWUFBTSxzQkFBc0I7QUFDNUIsbUJBQWEsMkJBQTJCLFVBQVUsSUFBSTtBQUN0RCxZQUFNLGNBQWMsTUFBTTtBQUUxQiw4QkFBd0IsSUFBSSxnQkFBc0I7QUFDbEQsWUFBTSx1QkFBdUIsb0JBQW9CO0FBQUEsUUFDaEQsR0FBRztBQUFBLFFBQ0gsTUFBTTtBQUFBLFFBQ04sVUFBVSxJQUFJLEtBQUssb0JBQW9CLEVBQUU7QUFBQSxRQUN6QyxpQkFBaUI7QUFBQSxNQUNsQixHQUFHLEVBQUUsV0FBVyxpQkFBaUIsQ0FBQztBQUNsQyxZQUFNLHNCQUFzQjtBQUM1QixtQkFBYSwyQkFBMkIsVUFBVSxLQUFLO0FBQ3ZELFlBQU0sZ0JBQWdCLE1BQU07QUFFNUIsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixTQUFTLENBQUMsYUFBYSxhQUFhO0FBQUEsUUFDcEM7QUFBQSxNQUNELEdBQUc7QUFBQSxRQUNGLFNBQVMsQ0FBQyxFQUFFLE1BQU0sZUFBZSxHQUFHLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUFBLFFBQzVFLHdCQUF3QjtBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGLFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxVQUFNLEVBQUUsT0FBTyxzQkFBc0IsWUFBWSxJQUFJLHVCQUF1QixhQUFhLEVBQUUsZ0NBQWdDLFVBQVUsbUJBQW1CLENBQUM7QUFDekosZ0JBQVksSUFBSSxtQ0FBbUMsV0FBVyxDQUFDO0FBQy9ELFVBQU0saUJBQWlCLCtCQUErQixPQUFPLG9CQUFvQjtBQUNqRixVQUFNLGVBQWUsWUFBWSxJQUFJLGVBQWUsT0FBTztBQUMzRCxRQUFJLHdCQUF3QixJQUFJLGdCQUFzQjtBQUN0RCxRQUFJLHlCQUF5QjtBQUM3QixnQkFBWSxJQUFJLE1BQU0scUJBQXFCLFlBQVU7QUFDcEQsVUFBSSxPQUFPLFNBQVMsd0JBQXdCO0FBQzNDO0FBQ0EsOEJBQXNCLFNBQVM7QUFBQSxNQUNoQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsUUFBSTtBQUNILFlBQU0sYUFBYSxrQkFBa0I7QUFDckMsWUFBTSxzQkFBc0IsZUFBZSxjQUFjLEdBQUc7QUFDNUQsYUFBTyxHQUFHLG1CQUFtQjtBQUM3QixZQUFNLFVBQTZCO0FBQUEsUUFDbEMsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osV0FBVztBQUFBLFFBQ1gsTUFBTSxJQUFJLEtBQUssbUJBQW1CLEVBQUU7QUFBQSxNQUNyQztBQUVBLFlBQU0scUJBQXFCLG9CQUFvQixTQUFTLEVBQUUsV0FBVyxpQkFBaUIsQ0FBQztBQUN2RixZQUFNLHNCQUFzQjtBQUM1QixtQkFBYSwyQkFBMkIsVUFBVSxJQUFJO0FBQ3RELFlBQU0sY0FBYyxNQUFNO0FBQzFCLFlBQU0sa0JBQWtCLE1BQU0sb0JBQW9CLEVBQUUsR0FBRyxRQUFRLEdBQUcsRUFBRSxXQUFXLGlCQUFpQixDQUFDO0FBRWpHLDhCQUF3QixJQUFJLGdCQUFzQjtBQUNsRCxZQUFNLHFCQUFxQixvQkFBb0IsRUFBRSxHQUFHLFFBQVEsR0FBRyxFQUFFLFdBQVcsaUJBQWlCLENBQUM7QUFDOUYsWUFBTSxzQkFBc0I7QUFDNUIsbUJBQWEsMkJBQTJCLFVBQVUsS0FBSztBQUN2RCxZQUFNLGNBQWMsTUFBTTtBQUUxQixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFNBQVMsQ0FBQyxhQUFhLGlCQUFpQixXQUFXO0FBQUEsUUFDbkQ7QUFBQSxNQUNELEdBQUc7QUFBQSxRQUNGLFNBQVMsQ0FBQyxFQUFFLE1BQU0sZUFBZSxHQUFHLEVBQUUsTUFBTSxlQUFlLEdBQUcsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQUEsUUFDdEcsd0JBQXdCO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHNEQUFzRCxZQUFZO0FBQ3RFLFVBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFVBQU0sZUFBZSxhQUFhLElBQUksY0FBYyxPQUFPO0FBQzNELFVBQU0sVUFBVSxtQkFBbUIsYUFBYSxZQUFZO0FBQzVELFlBQVEsUUFBUTtBQUVoQixVQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxXQUFXLE9BQU8sR0FBRyxXQUFXLFVBQVUsQ0FBQyxDQUFDO0FBQ2xGLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLE9BQU8sQ0FBQztBQUN4RixRQUFJO0FBQ0gsWUFBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFFMUQsYUFBTyxpQkFBaUIsTUFBTSxNQUFNLGFBQWEsR0FBRyxJQUFJLE9BQUssYUFBYSxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUM7QUFBQSxJQUNwRyxVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0VBQW9FLFlBQVk7QUFDcEYsVUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsVUFBTSxnQkFBZ0IsYUFBYSxJQUFJLGNBQWMsUUFBUTtBQUM3RCxVQUFNLFdBQVcsbUJBQW1CLGFBQWEsYUFBYTtBQUM5RCxVQUFNLFNBQVMsT0FBTyxZQUFZLDRCQUE0QixJQUFJLEtBQUssWUFBWSxFQUFFLFNBQVMsQ0FBQztBQUMvRixhQUFTLFFBQVE7QUFFakIsVUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxXQUFXLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUMvSCxRQUFJO0FBQ0gsWUFBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFFMUQsYUFBTyxpQkFBaUIsTUFBTSxNQUFNLGFBQWEsR0FBRyxJQUFJLDBCQUEwQixHQUFHLENBQUM7QUFBQSxRQUNyRixTQUFTO0FBQUEsUUFDVCxXQUFXO0FBQUEsUUFDWCxjQUFjO0FBQUEsUUFDZCxTQUFTO0FBQUEsUUFDVCxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDO0FBQUEsTUFDNUMsQ0FBQyxDQUFDO0FBQUEsSUFDSCxVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssbUdBQW1HLFlBQVk7QUFDbkgsVUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsVUFBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLE9BQU87QUFDdEQsVUFBTSxLQUFLLG1CQUFtQixhQUFhLE9BQU87QUFLbEQsVUFBTSxHQUFHLE9BQU8sWUFBWSw0QkFBNEIsSUFBSSxLQUFLLGdCQUFnQixFQUFFLFNBQVMsQ0FBQztBQUM3RixVQUFNLEdBQUcsT0FBTyxZQUFZLDJCQUEyQixNQUFNO0FBQzdELE9BQUcsUUFBUTtBQUVYLFVBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLElBQUksa0JBQWtCLENBQUMsV0FBVyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDOUgsUUFBSTtBQUNILFlBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGFBQU8saUJBQWlCLE1BQU0sTUFBTSxhQUFhLEdBQUcsSUFBSSwwQkFBMEIsR0FBRyxDQUFDO0FBQUEsUUFDckY7QUFBQSxRQUNBLFdBQVc7QUFBQSxRQUNYLGNBQWM7QUFBQSxRQUNkLFNBQVM7QUFBQSxRQUNULG9CQUFvQixDQUFDLElBQUksS0FBSyxnQkFBZ0IsQ0FBQztBQUFBLE1BQ2hELENBQUMsQ0FBQztBQUFBLElBQ0gsVUFBRTtBQUNELFlBQU0sYUFBYSxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlGQUF5RixZQUFZO0FBQ3pHLFVBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFVBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxRQUFRO0FBQ3ZELFVBQU0sS0FBSyxtQkFBbUIsYUFBYSxPQUFPO0FBQ2xELFVBQU0sR0FBRyxPQUFPLFlBQVksNEJBQTRCLElBQUksS0FBSyxZQUFZLEVBQUUsU0FBUyxDQUFDO0FBQ3pGLE9BQUcsUUFBUTtBQUVYLFVBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLFdBQVcsUUFBUSxDQUFDLENBQUM7QUFDM0QsVUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsT0FBTyxDQUFDO0FBQ3hGLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUUxRCxZQUFNLFdBQVcsTUFBTSxNQUFNLG1CQUFtQixPQUFPO0FBQ3ZELGFBQU8sR0FBRyxRQUFRO0FBQ2xCLGFBQU8sZ0JBQWdCLDJCQUEyQixRQUFRLEdBQUc7QUFBQSxRQUM1RDtBQUFBLFFBQ0EsV0FBVztBQUFBLFFBQ1gsY0FBYztBQUFBLFFBQ2QsU0FBUztBQUFBLFFBQ1Qsb0JBQW9CLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQztBQUFBLE1BQzVDLENBQUM7QUFDRCxhQUFPLGdCQUFnQixPQUFPLHlCQUF5QixDQUFDLFFBQVEsQ0FBQztBQUNqRSxhQUFPLFlBQVksT0FBTyxzQkFBc0IsQ0FBQztBQUFBLElBQ2xELFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw0REFBNEQsWUFBWTtBQUM1RSxVQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxVQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsVUFBVTtBQUN6RCxVQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxXQUFXLFlBQVksWUFBWSxDQUFDLENBQUM7QUFDM0UsVUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsT0FBTyxDQUFDO0FBQ3hGLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUUxRCxhQUFPLFlBQVksTUFBTSxNQUFNLG1CQUFtQixPQUFPLEdBQUcsTUFBUztBQUNyRSxhQUFPLGdCQUFnQixPQUFPLHlCQUF5QixDQUFDLENBQUM7QUFDekQsYUFBTyxZQUFZLE9BQU8sc0JBQXNCLENBQUM7QUFDakQsYUFBTyxnQkFBZ0IsbUJBQW1CLGdCQUFnQixDQUFDLENBQUM7QUFBQSxJQUM3RCxVQUFFO0FBQ0QsWUFBTSxhQUFhLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssbUVBQW1FLFlBQVk7QUFDbkYsVUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsVUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxXQUFXLFlBQVksWUFBWSxDQUFDLENBQUMsRUFBRSxDQUFDO0FBQy9JLFFBQUk7QUFDSCxZQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUUxRCxhQUFPLGdCQUFnQixNQUFNLE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBQztBQUNyRCxhQUFPLGdCQUFnQixtQkFBbUIsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLElBQzdELFVBQUU7QUFDRCxZQUFNLGFBQWEsS0FBSztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsUUFBTSwwQ0FBMEMsTUFBTTtBQUFBLElBRXJELE1BQU0sNEJBQTRCLHVCQUF1QjtBQUFBLE1BQXpEO0FBQUE7QUFDQyxhQUFnQixRQUE2RSxDQUFDO0FBQUE7QUFBQSxNQUU5RixNQUFlLG1CQUFtQixVQUFrQixnQkFBNkMsV0FBb0Y7QUFDcEwsYUFBSyxNQUFNLEtBQUssRUFBRSxVQUFVLGdCQUFnQixDQUFDLEdBQUcsY0FBYyxFQUFFLENBQUM7QUFDakUsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFFQSxTQUFLLG1FQUFtRSxZQUFZO0FBQ25GLFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsWUFBTSxnQkFBZ0IsSUFBSSxvQkFBb0I7QUFJOUMsYUFBTyxnQkFBZ0IsWUFBWTtBQUFFLGNBQU0sSUFBSSxNQUFNLGlEQUFpRDtBQUFBLE1BQUc7QUFFekcsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsUUFBUSxjQUFjLENBQUM7QUFDdkcsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0saUJBQThDLENBQUMsRUFBRSxNQUFNLGtCQUFrQixRQUFRLElBQUksZ0JBQWdCLGtCQUFrQixHQUFHLEtBQUssb0JBQW9CLE1BQU0sWUFBWSxTQUFTLEtBQUssQ0FBQztBQUMxTCxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWM7QUFBQSxVQUN4QyxTQUFTLGFBQWEsSUFBSSxjQUFjLGNBQWM7QUFBQSxVQUN0RCxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDO0FBQUEsVUFDM0MsY0FBYztBQUFBLFlBQ2IsVUFBVTtBQUFBLFlBQ1YsT0FBTyxDQUFDLEVBQUUsTUFBTSxNQUFNLGFBQWEsS0FBSyxhQUFhLEVBQUUsTUFBTSxTQUFTLEVBQUUsQ0FBQztBQUFBLFlBQ3pFO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUVELGVBQU8sWUFBWSxPQUFPLGFBQWEsSUFBSTtBQUMzQyxlQUFPLGdCQUFnQixjQUFjLE9BQU8sQ0FBQyxFQUFFLFVBQVUsWUFBWSxlQUFlLENBQUMsQ0FBQztBQUFBLE1BQ3ZGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxtRUFBbUUsWUFBWTtBQUNuRixZQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxZQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3ZDLFlBQU0sZ0JBQWdCLElBQUksb0JBQW9CO0FBQzlDLGFBQU8sZ0JBQWdCLFlBQVk7QUFBRSxjQUFNLElBQUksTUFBTSxpREFBaUQ7QUFBQSxNQUFHO0FBRXpHLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLFFBQVEsY0FBYyxDQUFDO0FBQ3ZHLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUUxRCxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWM7QUFBQSxVQUN4QyxTQUFTLGFBQWEsSUFBSSxjQUFjLGdCQUFnQjtBQUFBLFVBQ3hELG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUM7QUFBQSxRQUM1QyxDQUFDO0FBRUQsZUFBTyxZQUFZLE9BQU8sYUFBYSxJQUFJO0FBQzNDLGVBQU8sZ0JBQWdCLGNBQWMsT0FBTyxDQUFDLENBQUM7QUFBQSxNQUMvQyxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssdUZBQXVGLFlBQVk7QUFDdkcsWUFBTSxFQUFFLE9BQU8sYUFBYSxJQUFJLHVCQUF1QixXQUFXO0FBQ2xFLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLFFBQVEsSUFBSSxLQUFLLFNBQVM7QUFDaEMsY0FBTSxRQUFRLElBQUksS0FBSyxTQUFTO0FBRWhDLGNBQU0sNEJBQTRCLE9BQU8sU0FBa0IsdUJBQTBEO0FBQ3BILHVCQUFhLHFCQUFxQixnQkFBZ0I7QUFBQSxZQUNqRCxNQUFNLFdBQVc7QUFBQSxZQUNqQixRQUFRLEVBQUUsQ0FBQyx5Q0FBeUMsR0FBRyxRQUFRO0FBQUEsVUFDaEUsQ0FBQztBQUNELGdCQUFNLE1BQU0sYUFBYSxJQUFJLGNBQWMsT0FBTyxPQUFPLElBQUksbUJBQW1CLE1BQU0sRUFBRTtBQUN4RixnQkFBTSxNQUFNLGNBQWM7QUFBQSxZQUN6QixTQUFTO0FBQUEsWUFDVDtBQUFBLFlBQ0EsY0FBYyxFQUFFLFVBQVUsWUFBWSxPQUFPLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxFQUFFO0FBQUEsVUFDckUsQ0FBQztBQUNELGdCQUFNLGdCQUFpQixNQUFzSTtBQUM3SixrQkFBUSxjQUFjLElBQUksR0FBRyxHQUFHLGlCQUFpQix5QkFBeUIsQ0FBQyxHQUFHLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQztBQUFBLFFBQ3BHO0FBSUEsY0FBTSxjQUFjLE1BQU0sMEJBQTBCLE1BQU0sQ0FBQyxPQUFPLEtBQUssQ0FBQztBQUN4RSxjQUFNLGVBQWUsTUFBTSwwQkFBMEIsT0FBTyxDQUFDLE9BQU8sS0FBSyxDQUFDO0FBQzFFLGNBQU0sZUFBZSxNQUFNLDBCQUEwQixNQUFNLENBQUMsS0FBSyxDQUFDO0FBRWxFLGVBQU8sZ0JBQWdCLEVBQUUsYUFBYSxjQUFjLGFBQWEsR0FBRztBQUFBLFVBQ25FLGFBQWEsQ0FBQyxNQUFNLFNBQVMsQ0FBQztBQUFBLFVBQzlCLGNBQWMsQ0FBQztBQUFBLFVBQ2YsY0FBYyxDQUFDO0FBQUEsUUFDaEIsQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHlFQUF5RSxZQUFZO0FBQUEsTUFDekYsTUFBTSxpQ0FBaUMsdUJBQXVCO0FBQUEsUUFDN0QsTUFBZSxtQkFBbUIsV0FBbUIsZ0JBQThFO0FBQ2xJLGlCQUFPLGVBQWUsSUFBSSxvQkFBa0IsRUFBRSxjQUFjLEVBQUU7QUFBQSxRQUMvRDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLEVBQUUsT0FBTyxhQUFhLElBQUksdUJBQXVCLGFBQWEsRUFBRSxlQUFlLElBQUkseUJBQXlCLEVBQUUsQ0FBQztBQUNySCxVQUFJO0FBQ0gsY0FBTSxlQUFlLGFBQWEsSUFBSSxjQUFjLG9CQUFvQjtBQUN4RSxjQUFNLGdCQUFnQixhQUFhLElBQUksY0FBYyxxQkFBcUI7QUFDMUUsY0FBTSxPQUFNLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQ25DLG1CQUFXLFdBQVcsQ0FBQyxjQUFjLGFBQWEsR0FBRztBQUNwRCx1QkFBYSxjQUFjO0FBQUEsWUFDMUIsVUFBVSxRQUFRLFNBQVM7QUFBQSxZQUMzQixVQUFVO0FBQUEsWUFDVixPQUFPO0FBQUEsWUFDUCxRQUFRLGNBQWM7QUFBQSxZQUN0QixXQUFXO0FBQUEsWUFDWCxZQUFZO0FBQUEsVUFDYixDQUFDO0FBQUEsUUFDRjtBQUVBLGNBQU0sU0FBb0M7QUFBQSxVQUN6QyxNQUFNLGtCQUFrQjtBQUFBLFVBQ3hCLElBQUk7QUFBQSxVQUNKLEtBQUs7QUFBQSxVQUNMLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxRQUNWO0FBQ0EsY0FBTSx3QkFBd0IsY0FBYyxFQUFFLFVBQVUsV0FBVyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsTUFBTTtBQUM5RixjQUFNLHdCQUF3QixlQUFlLEVBQUUsVUFBVSxXQUFXLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxNQUFNO0FBRS9GLGNBQU0sQ0FBQyxjQUFjLGFBQWEsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFVBQ3ZELE1BQU0seUJBQXlCLFlBQVk7QUFBQSxVQUMzQyxNQUFNLHlCQUF5QixhQUFhO0FBQUEsUUFDN0MsQ0FBQztBQUNELHFCQUFhLHFCQUFxQixhQUFhLFNBQVMsR0FBRyxFQUFFLE1BQU0sV0FBVyw4QkFBOEIsZ0JBQWdCLENBQUMsR0FBRyxZQUFZLEVBQUUsQ0FBQztBQUMvSSxxQkFBYSxxQkFBcUIsY0FBYyxTQUFTLEdBQUcsRUFBRSxNQUFNLFdBQVcsOEJBQThCLGdCQUFnQixDQUFDLEdBQUcsYUFBYSxFQUFFLENBQUM7QUFDakoscUJBQWEscUJBQXFCLGFBQWEsU0FBUyxHQUFHLEVBQUUsTUFBTSxXQUFXLDZCQUE2QixJQUFJLE9BQU8sSUFBSSxTQUFTLE1BQU0sQ0FBQztBQUUxSSxjQUFNLENBQUMsT0FBTyxNQUFNLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxVQUN6QyxNQUFNLHlCQUF5QixZQUFZO0FBQUEsVUFDM0MsTUFBTSx5QkFBeUIsYUFBYTtBQUFBLFFBQzdDLENBQUM7QUFDRCxlQUFPLGdCQUFnQjtBQUFBLFVBQ3RCLE9BQU8sTUFBTSxLQUFLLG1CQUFpQixjQUFjLE9BQU8sT0FBTyxFQUFFLEdBQUc7QUFBQSxVQUNwRSxRQUFRLE9BQU8sS0FBSyxtQkFBaUIsY0FBYyxPQUFPLE9BQU8sRUFBRSxHQUFHO0FBQUEsUUFDdkUsR0FBRztBQUFBLFVBQ0YsT0FBTztBQUFBLFVBQ1AsUUFBUTtBQUFBLFFBQ1QsQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGtGQUFrRixZQUFZO0FBQ2xHLFlBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDekUsa0JBQVksSUFBSSxZQUFZLGlCQUFpQixRQUFRLFVBQVUsWUFBWSxJQUFJLElBQUksMkJBQTJCLENBQUMsQ0FBQyxDQUFDO0FBRWpILFlBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLFlBQVksQ0FBQztBQUMxRSxZQUFNLFlBQVksYUFBYSxJQUFJLFNBQVMsV0FBVyxRQUFRLENBQUM7QUFDaEUsWUFBTSxZQUFZO0FBQUEsUUFDakIsSUFBSSxTQUFTLFdBQVcsVUFBVSxXQUFXO0FBQUEsUUFDN0MsU0FBUyxXQUFXLDREQUE0RDtBQUFBLE1BQ2pGO0FBQUEsTUFFQSxNQUFNLDRCQUE0Qix1QkFBdUI7QUFBQSxRQUN4RCxNQUFlLG1CQUFtQixXQUFtQixnQkFBOEU7QUFDbEksaUJBQU8sZUFBZSxJQUFJLFFBQU07QUFBQSxZQUMvQixlQUFlLEVBQUUsR0FBRyxHQUFHLE1BQU0sRUFBRSxNQUFNLHdCQUF3QixPQUFPLEVBQUU7QUFBQSxZQUN0RTtBQUFBLFVBQ0QsRUFBRTtBQUFBLFFBQ0g7QUFBQSxNQUNEO0FBRUEsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxZQUFNLGdCQUFnQixJQUFJLG9CQUFvQjtBQUM5QyxZQUFNLEVBQUUsTUFBTSxJQUFJLHVCQUF1QixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsUUFBUSxlQUFlLFlBQVksQ0FBQztBQUUvSCxZQUFNLFVBQTBDLENBQUM7QUFDakQsa0JBQVksSUFBSSxNQUFNLHFCQUFxQixPQUFLO0FBQy9DLFlBQUksRUFBRSxTQUFTLFVBQVU7QUFDeEIsa0JBQVEsS0FBSyxFQUFFLE1BQU07QUFBQSxRQUN0QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYywwQkFBMEI7QUFDekUsY0FBTSx3QkFBd0IsU0FBUyxFQUFFLFVBQVUsV0FBVyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsRUFBRSxNQUFNLGtCQUFrQixRQUFRLElBQUksZ0JBQWdCLFVBQVUsU0FBUyxDQUFDLEdBQUcsS0FBSyxVQUFVLFNBQVMsR0FBRyxNQUFNLFlBQVksU0FBUyxLQUFLLENBQUM7QUFHNU4sY0FBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBRXhDLGNBQU0sc0JBQXNCLFFBQzFCLE9BQU8sT0FBSyxFQUFFLFNBQVMsV0FBVywyQkFBMkIsRUFDN0QsT0FBTyxDQUFDLE1BQXFGLElBQUksRUFDakcsT0FBTyxPQUFNLEVBQUUsY0FBc0MsYUFBYSxNQUFTO0FBRTdFLGVBQU8sWUFBWSxvQkFBb0IsU0FBUyxHQUFHLE1BQU0sK0RBQStEO0FBQ3hILGNBQU0sZ0JBQWlCLG9CQUFvQixHQUFHLEVBQUUsRUFBRyxjQUFzQyxTQUFVLE9BQU8sT0FBSyxFQUFFLFNBQVMsa0JBQWtCLEtBQUs7QUFDakosZUFBTyxnQkFBZ0IsZUFBZSxDQUFDO0FBQUEsVUFDdEMsTUFBTSxrQkFBa0I7QUFBQSxVQUN4QixJQUFJLGdCQUFnQixJQUFJLFNBQVMsV0FBVyxVQUFVLFdBQVcsRUFBRSxTQUFTLENBQUM7QUFBQSxVQUM3RSxLQUFLLElBQUksU0FBUyxXQUFXLFVBQVUsV0FBVyxFQUFFLFNBQVM7QUFBQSxVQUM3RCxNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsUUFDZCxDQUFDLENBQUM7QUFBQSxNQUNILFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxtRkFBbUYsWUFBWTtBQUNuRyxZQUFNLGNBQWMsWUFBWSxJQUFJLElBQUksWUFBWSxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQ3pFLGtCQUFZLElBQUksWUFBWSxpQkFBaUIsUUFBUSxVQUFVLFlBQVksSUFBSSxJQUFJLDJCQUEyQixDQUFDLENBQUMsQ0FBQztBQUVqSCxZQUFNLGVBQWU7QUFBQSxRQUNwQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQ0EsWUFBTSxxQkFBcUI7QUFBQSxRQUMxQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUdBLFlBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLGFBQWEsQ0FBQztBQUMzRSxZQUFNLFlBQVksYUFBYSxJQUFJLFNBQVMsV0FBVyxXQUFXLFFBQVEsQ0FBQztBQUMzRSxZQUFNLFlBQVksYUFBYSxJQUFJLFNBQVMsV0FBVyxXQUFXLGdCQUFnQixNQUFNLENBQUM7QUFDekYsWUFBTSxZQUFZLElBQUksU0FBUyxXQUFXLFdBQVcsVUFBVSxpQkFBaUI7QUFDaEYsWUFBTSxrQkFBa0IsSUFBSSxTQUFTLFdBQVcsV0FBVyxnQkFBZ0IsUUFBUSx3QkFBd0I7QUFDM0csWUFBTSxZQUFZLFVBQVUsV0FBVyxTQUFTLFdBQVcsYUFBYSxLQUFLLElBQUksQ0FBQyxDQUFDO0FBQ25GLFlBQU0sWUFBWSxVQUFVLGlCQUFpQixTQUFTLFdBQVcsbUJBQW1CLEtBQUssSUFBSSxDQUFDLENBQUM7QUFDL0YsWUFBTSxlQUFlLElBQUksU0FBUyxXQUFXLFdBQVc7QUFDeEQsWUFBTSxZQUFZLFVBQVUsY0FBYyxTQUFTLFdBQVcsZ0JBQWdCLENBQUM7QUFFL0UsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxZQUFNLEVBQUUsTUFBTSxJQUFJLHVCQUF1QixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsUUFBUSxZQUFZLENBQUM7QUFFaEgsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYywrQkFBK0I7QUFDOUUsY0FBTSxNQUFNLGNBQWM7QUFBQSxVQUN6QjtBQUFBLFVBQ0Esb0JBQW9CLENBQUMsU0FBUztBQUFBLFFBQy9CLENBQUM7QUFFRCxjQUFNLGlCQUFpQixNQUFNLE1BQU0seUJBQXlCLE9BQU87QUFDbkUsY0FBTSx3QkFBd0IsZUFBZSxPQUFPLG1CQUFpQixjQUFjLFNBQVMsa0JBQWtCLFNBQVM7QUFJdkgsZUFBTyxZQUFZLHNCQUFzQixRQUFRLEVBQUU7QUFDbkQsY0FBTSxlQUFlO0FBQUE7QUFBQSxVQUVwQixVQUFVLFNBQVM7QUFBQSxVQUNuQixJQUFJLFNBQVMsV0FBVyxXQUFXLFFBQVEsRUFBRSxTQUFTO0FBQUEsVUFDdEQsSUFBSSxTQUFTLFdBQVcsV0FBVyxRQUFRLEVBQUUsU0FBUztBQUFBLFVBQ3RELElBQUksU0FBUyxXQUFXLFdBQVcsUUFBUSxFQUFFLFNBQVM7QUFBQSxVQUN0RCxJQUFJLFNBQVMsV0FBVyxXQUFXLFFBQVEsRUFBRSxTQUFTO0FBQUEsVUFDdEQsSUFBSSxTQUFTLFdBQVcsV0FBVyxRQUFRLEVBQUUsU0FBUztBQUFBLFVBQ3RELElBQUksU0FBUyxXQUFXLFdBQVcsY0FBYyxFQUFFLFNBQVM7QUFBQSxVQUM1RCxJQUFJLFNBQVMsV0FBVyxXQUFXLE9BQU8sRUFBRSxTQUFTO0FBQUE7QUFBQSxVQUVyRCxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLDZCQUE2QixDQUFDLEVBQUUsU0FBUztBQUFBLFVBQ3BGLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sNEJBQTRCLENBQUMsRUFBRSxTQUFTO0FBQUEsVUFDbkYsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSw2QkFBNkIsQ0FBQyxFQUFFLFNBQVM7QUFBQSxVQUNwRixJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLG1DQUFtQyxDQUFDLEVBQUUsU0FBUztBQUFBLFVBQzFGLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sNEJBQTRCLENBQUMsRUFBRSxTQUFTO0FBQUEsUUFDcEY7QUFDQSxlQUFPLGdCQUFnQixzQkFBc0IsSUFBSSxtQkFBaUIsY0FBYyxHQUFHLEVBQUUsS0FBSyxHQUFHLGFBQWEsS0FBSyxDQUFDO0FBRWhILGNBQU0saUJBQWlCLHNCQUFzQixLQUFLLG1CQUFpQixjQUFjLFFBQVEsSUFBSSxTQUFTLFdBQVcsV0FBVyxRQUFRLEVBQUUsU0FBUyxDQUFDO0FBQ2hKLGVBQU8sR0FBRyxjQUFjO0FBQ3hCLGVBQU8sWUFBWSxlQUFlLFVBQVUsa0JBQWtCLEtBQUs7QUFDbkUsZUFBTyxnQkFBZ0IsZUFBZSxVQUFVLENBQUM7QUFBQSxVQUNoRCxNQUFNLGtCQUFrQjtBQUFBLFVBQ3hCLElBQUksZ0JBQWdCLFVBQVUsU0FBUyxDQUFDO0FBQUEsVUFDeEMsS0FBSyxVQUFVLFNBQVM7QUFBQSxVQUN4QixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsUUFDZCxDQUFDLENBQUM7QUFFRixjQUFNLHVCQUF1QixzQkFBc0IsS0FBSyxtQkFBaUIsY0FBYyxRQUFRLElBQUksU0FBUyxXQUFXLFdBQVcsY0FBYyxFQUFFLFNBQVMsQ0FBQztBQUM1SixlQUFPLEdBQUcsb0JBQW9CO0FBQzlCLGVBQU8sWUFBWSxxQkFBcUIsVUFBVSxrQkFBa0IsSUFBSTtBQUN4RSxlQUFPLGdCQUFnQixxQkFBcUIsVUFBVSxDQUFDO0FBQUEsVUFDdEQsTUFBTSxrQkFBa0I7QUFBQSxVQUN4QixJQUFJLGdCQUFnQixnQkFBZ0IsU0FBUyxDQUFDO0FBQUEsVUFDOUMsS0FBSyxnQkFBZ0IsU0FBUztBQUFBLFVBQzlCLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLE9BQU8sQ0FBQyxRQUFRLE1BQU07QUFBQSxVQUN0QixhQUFhO0FBQUEsUUFDZCxDQUFDLENBQUM7QUFFRixjQUFNLDZCQUE2QixzQkFBc0IsS0FBSyxtQkFBaUIsY0FBYyxRQUFRLFVBQVUsU0FBUyxDQUFDO0FBQ3pILGVBQU8sR0FBRywwQkFBMEI7QUFDcEMsZUFBTyxZQUFZLDJCQUEyQixVQUFVLGtCQUFrQixJQUFJO0FBQzlFLGVBQU8sZ0JBQWdCLDJCQUEyQixVQUFVLENBQUM7QUFBQSxVQUM1RCxNQUFNLGtCQUFrQjtBQUFBLFVBQ3hCLElBQUksZ0JBQWdCLGFBQWEsU0FBUyxDQUFDO0FBQUEsVUFDM0MsS0FBSyxhQUFhLFNBQVM7QUFBQSxVQUMzQixNQUFNO0FBQUEsVUFDTixhQUFhO0FBQUEsUUFDZCxDQUE2QixDQUFDO0FBQUEsTUFDL0IsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHNFQUFzRSxZQUFZO0FBQUEsTUFDdEYsTUFBTSx1Q0FBdUMsMkJBQTJCO0FBQUEsUUFBeEU7QUFBQTtBQUNDLDRCQUFhO0FBQ2IsMkJBQVk7QUFBQTtBQUFBLFFBRVosTUFBZSxLQUFLLFVBQStCO0FBQ2xELGNBQUksS0FBSyxZQUFZO0FBQ3BCLGlCQUFLO0FBQUEsVUFDTjtBQUNBLGlCQUFPLE1BQU0sS0FBSyxRQUFRO0FBQUEsUUFDM0I7QUFBQSxNQUNEO0FBRUEsWUFBTSxjQUFjLFlBQVksSUFBSSxJQUFJLFlBQVksSUFBSSxlQUFlLENBQUMsQ0FBQztBQUN6RSxZQUFNLFdBQVcsWUFBWSxJQUFJLElBQUksK0JBQStCLENBQUM7QUFDckUsa0JBQVksSUFBSSxZQUFZLGlCQUFpQixRQUFRLFVBQVUsUUFBUSxDQUFDO0FBQ3hFLFlBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLGFBQWEsQ0FBQztBQUMzRSxZQUFNLFlBQVksYUFBYSxTQUFTO0FBRXhDLFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsWUFBTSxFQUFFLE1BQU0sSUFBSSx1QkFBdUIsYUFBYSxFQUFFLG9CQUFvQixlQUFlLFFBQVEsWUFBWSxDQUFDO0FBRWhILFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsNkJBQTZCO0FBQzVFLGNBQU0sTUFBTSxjQUFjLEVBQUUsU0FBUyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQztBQUV0RSxpQkFBUyxhQUFhO0FBQ3RCLGNBQU0saUJBQWlCLE1BQU0seUJBQXlCLE9BQU87QUFDN0QsY0FBTSxRQUFRLHNCQUFzQixHQUFHO0FBRXZDLGVBQU8sU0FBUyxTQUFTLFdBQVcsR0FBRywwREFBMEQ7QUFDakcsY0FBTSxXQUFXLE1BQU07QUFDdkIsZUFBTyxHQUFHLFNBQVMsU0FBUyxHQUFHLHdEQUF3RDtBQUFBLE1BQ3hGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw2RUFBNkUsWUFBWTtBQUM3RixZQUFNLGNBQWMsWUFBWSxJQUFJLElBQUksWUFBWSxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQ3pFLGtCQUFZLElBQUksWUFBWSxpQkFBaUIsUUFBUSxVQUFVLFlBQVksSUFBSSxJQUFJLDJCQUEyQixDQUFDLENBQUMsQ0FBQztBQUVqSCxZQUFNLFlBQVksSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSxhQUFhLENBQUM7QUFDM0UsWUFBTSxhQUFhLElBQUksU0FBUyxXQUFXLFdBQVcsUUFBUTtBQUM5RCxZQUFNLFlBQVksYUFBYSxVQUFVO0FBQ3pDLFlBQU0sWUFBWSxVQUFVLElBQUksU0FBUyxZQUFZLGlCQUFpQixHQUFHLFNBQVMsV0FBVyxZQUFZLENBQUM7QUFFMUcsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxZQUFNLEVBQUUsTUFBTSxJQUFJLHVCQUF1QixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsUUFBUSxZQUFZLENBQUM7QUFFaEgsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYywyQkFBMkI7QUFDMUUsY0FBTSxNQUFNLGNBQWM7QUFBQSxVQUN6QjtBQUFBLFVBQ0Esb0JBQW9CLENBQUMsU0FBUztBQUFBLFFBQy9CLENBQUM7QUFFRCxjQUFNLFNBQVMsTUFBTSxNQUFNLHlCQUF5QixPQUFPO0FBQzNELGNBQU0sYUFBYSxPQUFPLE9BQU8sbUJBQWlCLGNBQWMsU0FBUyxrQkFBa0IsU0FBUztBQUNwRyxjQUFNLGtCQUFrQixXQUFXLEtBQUssT0FBSyxFQUFFLFFBQVEsV0FBVyxTQUFTLENBQUM7QUFDNUUsZUFBTyxHQUFHLGVBQWU7QUFDekIsZUFBTyxZQUFZLGdCQUFpQixTQUFVLFFBQVEsQ0FBQztBQUV2RCxjQUFNLFlBQVksSUFBSSxZQUFZLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFFckQsWUFBSSxRQUFRLE1BQU0sTUFBTSx5QkFBeUIsT0FBTztBQUN4RCxZQUFJLFlBQVksTUFBTSxPQUFPLG1CQUFpQixjQUFjLFNBQVMsa0JBQWtCLFNBQVM7QUFDaEcsaUJBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxVQUFVLEtBQUssT0FBSyxFQUFFLFFBQVEsV0FBVyxTQUFTLE1BQU0sRUFBRSxVQUFVLFVBQVUsS0FBSyxDQUFDLEdBQUcsS0FBSztBQUNySCxnQkFBTSxJQUFJLFFBQVEsYUFBVyxXQUFXLFNBQVMsRUFBRSxDQUFDO0FBQ3BELGtCQUFRLE1BQU0sTUFBTSx5QkFBeUIsT0FBTztBQUNwRCxzQkFBWSxNQUFNLE9BQU8sbUJBQWlCLGNBQWMsU0FBUyxrQkFBa0IsU0FBUztBQUFBLFFBQzdGO0FBRUEsY0FBTSxpQkFBaUIsVUFBVSxLQUFLLE9BQUssRUFBRSxRQUFRLFdBQVcsU0FBUyxDQUFDO0FBQzFFLGVBQU8sR0FBRyxjQUFjO0FBQ3hCLGVBQU8sWUFBWSxlQUFlLFVBQVUsVUFBVSxHQUFHLENBQUM7QUFBQSxNQUMzRCxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssaUhBQWlILFlBQVk7QUFDakksWUFBTSxjQUFjLFlBQVksSUFBSSxJQUFJLFlBQVksSUFBSSxlQUFlLENBQUMsQ0FBQztBQUN6RSxrQkFBWSxJQUFJLFlBQVksaUJBQWlCLFFBQVEsVUFBVSxZQUFZLElBQUksSUFBSSwyQkFBMkIsQ0FBQyxDQUFDLENBQUM7QUFFakgsWUFBTSxZQUFZLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sYUFBYSxDQUFDO0FBQzNFLFlBQU0sYUFBYSxJQUFJLFNBQVMsV0FBVyxXQUFXLFFBQVE7QUFDOUQsWUFBTSxZQUFZLGFBQWEsVUFBVTtBQUN6QyxZQUFNLFlBQVksVUFBVSxJQUFJLFNBQVMsWUFBWSxpQkFBaUIsR0FBRyxTQUFTLFdBQVcsWUFBWSxDQUFDO0FBRTFHLFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsWUFBTSxFQUFFLE1BQU0sSUFBSSx1QkFBdUIsYUFBYSxFQUFFLG9CQUFvQixlQUFlLFFBQVEsWUFBWSxDQUFDO0FBRWhILFlBQU0sVUFBMEMsQ0FBQztBQUNqRCxrQkFBWSxJQUFJLE1BQU0scUJBQXFCLGNBQVk7QUFDdEQsWUFBSSxTQUFTLFNBQVMsVUFBVTtBQUMvQixrQkFBUSxLQUFLLFNBQVMsTUFBTTtBQUFBLFFBQzdCO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixZQUFNLHVDQUF1QyxNQUFjLFFBQVEsT0FBTyxZQUFVO0FBQ25GLFlBQUksT0FBTyxTQUFTLFdBQVcsNkJBQTZCO0FBQzNELGdCQUFNLGdCQUFpQixPQUFvRjtBQUMzRyxpQkFBTyxjQUFjLFNBQVMsa0JBQWtCLGFBQWEsY0FBYyxRQUFRLFdBQVcsU0FBUztBQUFBLFFBQ3hHO0FBQ0EsWUFBSSxPQUFPLFNBQVMsV0FBVyw4QkFBOEI7QUFDNUQsZ0JBQU0saUJBQWtCLE9BQXFGO0FBQzdHLGlCQUFPLGVBQWUsS0FBSyxtQkFBaUIsY0FBYyxTQUFTLGtCQUFrQixhQUFhLGNBQWMsUUFBUSxXQUFXLFNBQVMsQ0FBQztBQUFBLFFBQzlJO0FBQ0EsZUFBTztBQUFBLE1BQ1IsQ0FBQyxFQUFFO0FBRUgsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYywwQ0FBMEM7QUFDekYsY0FBTSxNQUFNLGNBQWM7QUFBQSxVQUN6QjtBQUFBLFVBQ0Esb0JBQW9CLENBQUMsU0FBUztBQUFBLFFBQy9CLENBQUM7QUFFRCxjQUFNLE1BQU0seUJBQXlCLE9BQU87QUFDNUMsY0FBTSxJQUFJLFFBQVEsYUFBVyxXQUFXLFNBQVMsRUFBRSxDQUFDO0FBQ3BELGNBQU0scUJBQXFCLHFDQUFxQztBQUdoRSxjQUFNLFlBQVksVUFBVSxJQUFJLFNBQVMsWUFBWSxXQUFXLEdBQUcsU0FBUyxXQUFXLFNBQVMsQ0FBQztBQUVqRyxpQkFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUs7QUFDNUIsZ0JBQU0sSUFBSSxRQUFRLGFBQVcsV0FBVyxTQUFTLEVBQUUsQ0FBQztBQUNwRCxpQkFBTyxZQUFZLHFDQUFxQyxHQUFHLG9CQUFvQiwwREFBMEQ7QUFBQSxRQUMxSTtBQUVBLGNBQU0sUUFBUSxNQUFNLE1BQU0seUJBQXlCLE9BQU87QUFDMUQsY0FBTSxZQUFZLE1BQU0sT0FBTyxtQkFBaUIsY0FBYyxTQUFTLGtCQUFrQixTQUFTO0FBRWxHLGNBQU0sZUFBZTtBQUFBLFVBQ3BCLElBQUksU0FBUyxXQUFXLFdBQVcsUUFBUSxFQUFFLFNBQVM7QUFBQSxVQUN0RCxJQUFJLFNBQVMsV0FBVyxXQUFXLFFBQVEsRUFBRSxTQUFTO0FBQUEsVUFDdEQsSUFBSSxTQUFTLFdBQVcsV0FBVyxRQUFRLEVBQUUsU0FBUztBQUFBLFVBQ3RELElBQUksU0FBUyxXQUFXLFdBQVcsUUFBUSxFQUFFLFNBQVM7QUFBQSxVQUN0RCxJQUFJLFNBQVMsV0FBVyxXQUFXLFFBQVEsRUFBRSxTQUFTO0FBQUEsVUFDdEQsSUFBSSxTQUFTLFdBQVcsV0FBVyxjQUFjLEVBQUUsU0FBUztBQUFBLFVBQzVELElBQUksU0FBUyxXQUFXLFdBQVcsT0FBTyxFQUFFLFNBQVM7QUFBQTtBQUFBLFVBRXJELElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sNkJBQTZCLENBQUMsRUFBRSxTQUFTO0FBQUEsVUFDcEYsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFNBQVM7QUFBQSxVQUNuRixJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLDZCQUE2QixDQUFDLEVBQUUsU0FBUztBQUFBLFVBQ3BGLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sbUNBQW1DLENBQUMsRUFBRSxTQUFTO0FBQUEsVUFDMUYsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSw0QkFBNEIsQ0FBQyxFQUFFLFNBQVM7QUFBQSxRQUNwRjtBQUNBLGVBQU8sZ0JBQWdCLFVBQVUsSUFBSSxtQkFBaUIsY0FBYyxHQUFHLEVBQUUsS0FBSyxHQUFHLGFBQWEsS0FBSyxDQUFDO0FBQUEsTUFDckcsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGdHQUFnRyxZQUFZO0FBQ2hILFlBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDekUsa0JBQVksSUFBSSxZQUFZLGlCQUFpQixRQUFRLFVBQVUsWUFBWSxJQUFJLElBQUksMkJBQTJCLENBQUMsQ0FBQyxDQUFDO0FBRWpILFlBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLGFBQWEsQ0FBQztBQUMzRSxZQUFNLGFBQWEsSUFBSSxTQUFTLFdBQVcsV0FBVyxRQUFRO0FBQzlELFlBQU0sbUJBQW1CLElBQUksU0FBUyxXQUFXLFdBQVcsY0FBYztBQUMxRSxZQUFNLFlBQVksYUFBYSxVQUFVO0FBQ3pDLFlBQU0sWUFBWSxhQUFhLGdCQUFnQjtBQUMvQyxZQUFNLFlBQVksVUFBVSxJQUFJLFNBQVMsWUFBWSxtQkFBbUIsR0FBRyxTQUFTLFdBQVcsU0FBUyxDQUFDO0FBQ3pHLFlBQU0sWUFBWSxVQUFVLElBQUksU0FBUyxrQkFBa0Isc0JBQXNCLEdBQUcsU0FBUyxXQUFXLGtEQUFrRCxDQUFDO0FBRTNKLFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsWUFBTSxFQUFFLE1BQU0sSUFBSSx1QkFBdUIsYUFBYSxFQUFFLG9CQUFvQixlQUFlLFFBQVEsWUFBWSxDQUFDO0FBRWhILFlBQU0sVUFBMEMsQ0FBQztBQUNqRCxrQkFBWSxJQUFJLE1BQU0scUJBQXFCLGNBQVk7QUFDdEQsWUFBSSxTQUFTLFNBQVMsVUFBVTtBQUMvQixrQkFBUSxLQUFLLFNBQVMsTUFBTTtBQUFBLFFBQzdCO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFJRixZQUFNLGtDQUFrQyxNQUFjLFFBQVEsT0FBTyxZQUFVO0FBQzlFLFlBQUksT0FBTyxTQUFTLFdBQVcsOEJBQThCO0FBQzVELGlCQUFPO0FBQUEsUUFDUjtBQUNBLGNBQU0saUJBQWtCLE9BQXFGO0FBQzdHLGVBQU8sZUFBZSxLQUFLLG1CQUFpQixjQUFjLFNBQVMsa0JBQWtCLGFBQWEsY0FBYyxRQUFRLFdBQVcsU0FBUyxDQUFDLEtBQ3pJLGVBQWUsS0FBSyxtQkFBaUIsY0FBYyxTQUFTLGtCQUFrQixhQUFhLGNBQWMsUUFBUSxpQkFBaUIsU0FBUyxDQUFDO0FBQUEsTUFDakosQ0FBQyxFQUFFO0FBRUgsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYyx3Q0FBd0M7QUFDdkYsY0FBTSxNQUFNLGNBQWM7QUFBQSxVQUN6QjtBQUFBLFVBQ0Esb0JBQW9CLENBQUMsU0FBUztBQUFBLFFBQy9CLENBQUM7QUFFRCxjQUFNLE1BQU0seUJBQXlCLE9BQU87QUFDNUMsY0FBTSxJQUFJLFFBQVEsYUFBVyxXQUFXLFNBQVMsRUFBRSxDQUFDO0FBQ3BELGNBQU0sMEJBQTBCLGdDQUFnQztBQUVoRSxjQUFNLFFBQVEsSUFBSTtBQUFBLFVBQ2pCLFlBQVksVUFBVSxJQUFJLFNBQVMsWUFBWSxtQkFBbUIsR0FBRyxTQUFTLFdBQVcsU0FBUyxDQUFDO0FBQUEsVUFDbkcsWUFBWSxVQUFVLElBQUksU0FBUyxZQUFZLG1CQUFtQixHQUFHLFNBQVMsV0FBVyxTQUFTLENBQUM7QUFBQSxVQUNuRyxZQUFZLFVBQVUsSUFBSSxTQUFTLGtCQUFrQix1QkFBdUIsR0FBRyxTQUFTLFdBQVcsb0RBQW9ELENBQUM7QUFBQSxRQUN6SixDQUFDO0FBRUQsWUFBSSx1QkFBdUI7QUFDM0IsWUFBSSw2QkFBNkI7QUFDakMsaUJBQVMsSUFBSSxHQUFHLElBQUksT0FBTyx1QkFBdUIsS0FBSyw2QkFBNkIsSUFBSSxLQUFLO0FBQzVGLGdCQUFNLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxFQUFFLENBQUM7QUFDcEQsZ0JBQU0saUJBQWlCLE1BQU0sTUFBTSx5QkFBeUIsT0FBTztBQUNuRSxnQkFBTSwyQkFBMkIsZUFBZSxLQUFLLENBQUMsa0JBQXFFLGNBQWMsU0FBUyxrQkFBa0IsYUFBYSxjQUFjLFFBQVEsV0FBVyxTQUFTLENBQUM7QUFDNU4sZ0JBQU0saUNBQWlDLGVBQWUsS0FBSyxDQUFDLGtCQUFxRSxjQUFjLFNBQVMsa0JBQWtCLGFBQWEsY0FBYyxRQUFRLGlCQUFpQixTQUFTLENBQUM7QUFDeE8saUNBQXVCLDBCQUEwQixTQUFTLE9BQU8sV0FBUyxNQUFNLFNBQVMsa0JBQWtCLEtBQUssRUFBRSxVQUFVO0FBQzVILHVDQUE2QixnQ0FBZ0MsU0FBUyxPQUFPLFdBQVMsTUFBTSxTQUFTLGtCQUFrQixJQUFJLEVBQUUsVUFBVTtBQUFBLFFBQ3hJO0FBRUEsZUFBTyxZQUFZLHNCQUFzQixHQUFHLCtDQUErQztBQUMzRixlQUFPLFlBQVksNEJBQTRCLEdBQUcscURBQXFEO0FBQ3ZHLGVBQU87QUFBQSxVQUNOLGdDQUFnQztBQUFBLFVBQ2hDLDBCQUEwQjtBQUFBLFVBQzFCO0FBQUEsUUFDRDtBQUFBLE1BQ0QsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLHdCQUF3QixNQUFNO0FBRW5DLFNBQUssd0VBQXdFLFlBQVk7QUFDeEYsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxZQUFNLGFBQWEsSUFBSSx3QkFBd0I7QUFDL0MsVUFBSSxvQkFBb0I7QUFDeEIsVUFBSSxnQkFBZ0I7QUFDcEIsYUFBTyxnQkFBZ0IsWUFBWTtBQUFFO0FBQXFCLGNBQU0sSUFBSSxNQUFNLGtCQUFrQjtBQUFBLE1BQUc7QUFDL0YsWUFBTSxrQkFBa0IsV0FBVyxZQUFZLEtBQUssVUFBVTtBQUM5RCxpQkFBVyxjQUFjLFVBQVUsU0FBUztBQUFFO0FBQWlCLGVBQU8sZ0JBQWdCLEdBQUcsSUFBSTtBQUFBLE1BQUc7QUFFaEcsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsUUFBUSxXQUFXLENBQUM7QUFDcEcsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0sU0FBUyxNQUFNLE1BQU0sY0FBYztBQUFBLFVBQ3hDLFNBQVMsYUFBYSxJQUFJLGNBQWMsUUFBUTtBQUFBLFVBQ2hELG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUM7QUFBQSxVQUMzQyxRQUFRLEVBQUUsV0FBVyxZQUFZLFFBQVEsT0FBTztBQUFBLFFBQ2pELENBQUM7QUFFRCxlQUFPLFlBQVksT0FBTyxhQUFhLElBQUk7QUFDM0MsZUFBTyxZQUFZLG1CQUFtQixHQUFHLG9FQUFvRTtBQUM3RyxlQUFPLFlBQVksZUFBZSxHQUFHLHdEQUF3RDtBQUFBLE1BQzlGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywrRUFBK0UsWUFBWTtBQUMvRixZQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxZQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3ZDLFVBQUk7QUFDSixhQUFPLGdCQUFnQixPQUFNLFdBQVU7QUFDdEMseUJBQWlCO0FBQ2pCLGVBQU8sSUFBSSxtQkFBbUI7QUFBQSxNQUMvQjtBQUNBLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLE9BQU8sQ0FBQztBQUN4RixVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxTQUFTLE1BQU0sTUFBTSxjQUFjO0FBQUEsVUFDeEMsU0FBUyxhQUFhLElBQUksY0FBYyxtQkFBbUI7QUFBQSxVQUMzRCxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDO0FBQUEsUUFDNUMsQ0FBQztBQUVELGNBQU0sTUFBTSxNQUFNLFlBQVksZUFBZSxPQUFPLE9BQU8sR0FBRyxTQUFTLE1BQVM7QUFFaEYsZUFBTyxZQUFZLGdCQUFnQixXQUFXLG1CQUFtQjtBQUFBLE1BQ2xFLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx3RUFBd0UsWUFBWTtBQUN4RixZQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxZQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3ZDLFlBQU0sYUFBYSxJQUFJLHdCQUF3QjtBQUMvQyxVQUFJLHNCQUFzQjtBQUMxQixZQUFNLHFCQUFxQixXQUFXLGVBQWUsS0FBSyxVQUFVO0FBQ3BFLGlCQUFXLGlCQUFpQixVQUFVLFNBQVM7QUFBRTtBQUF1QixlQUFPLG1CQUFtQixHQUFHLElBQUk7QUFBQSxNQUFHO0FBRTVHLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLFFBQVEsV0FBVyxDQUFDO0FBQ3BHLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUUxRCxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWM7QUFBQSxVQUN4QyxTQUFTLGFBQWEsSUFBSSxjQUFjLFFBQVE7QUFBQSxVQUNoRCxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDO0FBQUEsUUFDNUMsQ0FBQztBQUVELGNBQU0sTUFBTSxlQUFlLE9BQU8sT0FBTztBQUV6QyxlQUFPLFlBQVkscUJBQXFCLEdBQUcsdUNBQXVDO0FBQ2xGLGVBQU8sWUFBWSxNQUFNLFdBQVcsT0FBTyxPQUFPLEdBQUcsS0FBSztBQUFBLE1BQzNELFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxpRUFBaUUsWUFBWTtBQUNqRixZQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxZQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3ZDLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLE9BQU8sQ0FBQztBQUN4RixVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFFMUQsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLHFCQUFxQjtBQUNwRSxjQUFNLE1BQU0sZUFBZSxPQUFPO0FBRWxDLGVBQU8sZ0JBQWdCLE9BQU8sbUJBQW1CLENBQUMscUJBQXFCLENBQUM7QUFBQSxNQUN6RSxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssNEVBQTRFLFlBQVk7QUFDNUYsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxvQkFBb0IsZUFBZSxPQUFPLENBQUM7QUFDeEYsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0sU0FBUyxNQUFNLE1BQU0sY0FBYztBQUFBLFVBQ3hDLFNBQVMsYUFBYSxJQUFJLGNBQWMsUUFBUTtBQUFBLFVBQ2hELG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUM7QUFBQSxRQUM1QyxDQUFDO0FBRUQsY0FBTSxNQUFNLGVBQWUsT0FBTyxPQUFPO0FBRXpDLGVBQU8sZ0JBQWdCLE9BQU8sbUJBQW1CLENBQUMsQ0FBQztBQUNuRCxlQUFPLFlBQVksTUFBTSxXQUFXLE9BQU8sT0FBTyxHQUFHLEtBQUs7QUFBQSxNQUMzRCxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssNkVBQTZFLFlBQVk7QUFDN0YsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxhQUFPLGdCQUFnQixZQUFZO0FBQUUsY0FBTSxJQUFJLE1BQU0sTUFBTTtBQUFBLE1BQUc7QUFDOUQsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsT0FBTyxDQUFDO0FBQ3hGLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUUxRCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMscUJBQXFCO0FBQ3BFLGNBQU0sT0FBTyxRQUFRLE1BQU0sTUFBTSxlQUFlLE9BQU8sR0FBRyxNQUFNO0FBQUEsTUFDakUsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFNRCxTQUFLLHFFQUFxRSxZQUFZO0FBQ3JGLFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsVUFBSTtBQUNKLGFBQU8sZ0JBQWdCLE9BQU0sV0FBVTtBQUN0Qyx5QkFBaUI7QUFDakIsZUFBTyxJQUFJLG1CQUFtQjtBQUFBLE1BQy9CO0FBRUEsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsT0FBTyxDQUFDO0FBQ3hGLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUUxRCxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWM7QUFBQSxVQUN4QyxTQUFTLGFBQWEsSUFBSSxjQUFjLHdCQUF3QjtBQUFBLFVBQ2hFLG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUM7QUFBQSxRQUM1QyxDQUFDO0FBQ0QsZUFBTyxZQUFZLE9BQU8sYUFBYSxJQUFJO0FBRTNDLGNBQU0sTUFBTSxNQUFNLFlBQVksZUFBZSxPQUFPLE9BQU8sR0FBRyxTQUFTLE1BQVM7QUFFaEYsZUFBTyxHQUFHLGdCQUFnQix1RUFBdUU7QUFDakcsY0FBTSxnQkFBZ0IsZUFBZTtBQUNyQyxlQUFPLGdCQUFnQixlQUFlO0FBQUEsVUFDckMsR0FBRztBQUFBLFVBQ0gsU0FBUztBQUFBLFFBQ1YsQ0FBQztBQUNELFlBQUksQ0FBQyxpQkFBaUIsY0FBYyxTQUFTLGFBQWE7QUFDekQsaUJBQU8sS0FBSyx3Q0FBd0M7QUFBQSxRQUNyRDtBQUNBLGVBQU8sWUFBWSxjQUFjLFVBQVUsVUFBVSxRQUFRLFNBQVM7QUFDdEUsZUFBTztBQUFBLFVBQ04sY0FBYyxVQUFVLFVBQVU7QUFBQSxVQUNsQztBQUFBLFFBQ0Q7QUFBQSxNQUNELFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx1RkFBdUYsWUFBWTtBQUN2RyxZQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxZQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3ZDLFVBQUk7QUFDSixZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxvQkFBb0IsZUFBZSxPQUFPLENBQUM7QUFDeEYsYUFBTyxnQkFBZ0IsT0FBTSxXQUFVO0FBQ3RDLHlCQUFpQjtBQUNqQixlQUFPLElBQUksbUJBQW1CO0FBQUEsTUFDL0I7QUFFQSxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLGNBQWM7QUFFakUsY0FBTSxTQUFTLE1BQU0sTUFBTSxjQUFjO0FBQUEsVUFDeEMsU0FBUyxhQUFhLElBQUksY0FBYyxxQkFBcUI7QUFBQSxVQUM3RCxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDO0FBQUEsUUFDNUMsQ0FBQztBQUNELGVBQU8sWUFBWSxPQUFPLGFBQWEsSUFBSTtBQUUzQyxjQUFNLE1BQU0sTUFBTSxZQUFZLGVBQWUsT0FBTyxPQUFPLEdBQUcsU0FBUyxNQUFTO0FBRWhGLGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEIsYUFBYSxnQkFBZ0I7QUFBQSxRQUM5QixHQUFHO0FBQUEsVUFDRixhQUFhO0FBQUEsUUFDZCxDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssb0RBQW9ELFlBQVk7QUFDcEUsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxhQUFPLGdCQUFnQixZQUFZO0FBQUUsY0FBTSxJQUFJLE1BQU0sZUFBZTtBQUFBLE1BQUc7QUFDdkUsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsT0FBTyxDQUFDO0FBQ3hGLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsY0FBYztBQUNqRSxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWM7QUFBQSxVQUN4QyxTQUFTLGFBQWEsSUFBSSxjQUFjLHNCQUFzQjtBQUFBLFVBQzlELG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUM7QUFBQSxRQUM1QyxDQUFDO0FBRUQsY0FBTSxPQUFPLFFBQVEsTUFBTSxNQUFNLFlBQVksZUFBZSxPQUFPLE9BQU8sR0FBRyxTQUFTLE1BQVMsR0FBRyxlQUFlO0FBQUEsTUFDbEgsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGdHQUFnRyxZQUFZO0FBQ2hILFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsVUFBSTtBQUNKLGFBQU8sZ0JBQWdCLE9BQU0sV0FBVTtBQUN0Qyx5QkFBaUI7QUFDakIsZUFBTyxJQUFJLG1CQUFtQjtBQUFBLE1BQy9CO0FBRUEsWUFBTSxFQUFFLE9BQU8scUJBQXFCLElBQUksdUJBQXVCLGFBQWEsRUFBRSxvQkFBb0IsZUFBZSxPQUFPLENBQUM7QUFDekgsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELDZCQUFxQixpQkFBaUIsRUFBRSxDQUFDLG9CQUFvQix3QkFBd0IsR0FBRyxNQUFNLENBQUM7QUFFL0YsY0FBTSxTQUFTLE1BQU0sTUFBTSxjQUFjO0FBQUEsVUFDeEMsU0FBUyxhQUFhLElBQUksY0FBYyx1QkFBdUI7QUFBQSxVQUMvRCxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDO0FBQUEsUUFDNUMsQ0FBQztBQUNELGVBQU8sWUFBWSxPQUFPLGFBQWEsSUFBSTtBQUUzQyxjQUFNLE1BQU0sTUFBTSxZQUFZLGVBQWUsT0FBTyxPQUFPLEdBQUcsU0FBUyxNQUFTO0FBRWhGLGVBQU8sZ0JBQWdCLGdCQUFnQixPQUFPLElBQUksVUFBUSxLQUFLLElBQUksR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN6RSxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sNEJBQTRCLE1BQU07QUFPdkMsYUFBUyxtQkFBbUIsT0FBcUIsV0FBZ0Y7QUFDaEksWUFBTSxRQUEwRCxDQUFDO0FBQ2pFLFlBQU0sT0FBTztBQUFBLFFBQ1osNkJBQTZCLFlBQW9CLFFBQXdCO0FBQ3hFLGdCQUFNLEtBQUssRUFBRSxZQUFZLE9BQU8sQ0FBQztBQUFBLFFBQ2xDO0FBQUEsUUFDQSxVQUFVO0FBQUEsUUFBRTtBQUFBLE1BQ2I7QUFDQSw0QkFBc0IsT0FBTyxXQUFXLElBQUk7QUFDNUMsYUFBTyxFQUFFLE1BQU07QUFBQSxJQUNoQjtBQUVBLFNBQUssdURBQXVELFlBQVk7QUFDdkUsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLGFBQWEsYUFBYSxJQUFJLGNBQWMsYUFBYTtBQUMvRCxjQUFNLGNBQWMsSUFBSSxNQUFNLG9CQUFvQixVQUFVLENBQUM7QUFDN0QsY0FBTSxFQUFFLE1BQU0sSUFBSSxtQkFBbUIsT0FBTyxhQUFhLEdBQUcsVUFBVSxDQUFDO0FBRXZFLGNBQU0sU0FBeUIsRUFBRSxTQUFTLE1BQU0sa0JBQWtCLFNBQVM7QUFDM0UsY0FBTSx5QkFBeUIsWUFBWSxhQUFhLFVBQVUsTUFBTTtBQUV4RSxlQUFPLGdCQUFnQixPQUFPLENBQUMsRUFBRSxZQUFZLFVBQVUsT0FBTyxDQUFDLENBQUM7QUFBQSxNQUNqRSxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssK0RBQStELFlBQVk7QUFDL0UsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLGFBQWEsYUFBYSxJQUFJLGNBQWMsaUJBQWlCO0FBQ25FLGNBQU0sY0FBYyxJQUFJLE1BQU0sb0JBQW9CLFVBQVUsQ0FBQztBQUU3RCxjQUFNLHlCQUF5QixZQUFZLGFBQWEsUUFBUSxFQUFFLFNBQVMsTUFBTSxrQkFBa0IsT0FBTyxDQUFDO0FBQUEsTUFDNUcsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLG9EQUFvRCxZQUFZO0FBS3BFLFlBQU0sUUFBUSxnQkFBZ0IsV0FBVztBQUN6QyxVQUFJO0FBQ0gsY0FBTSxhQUFhLGFBQWEsSUFBSSxjQUFjLG1CQUFtQjtBQUNyRSxjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsWUFBWSxRQUFRLENBQUM7QUFDNUQsY0FBTSxRQUEwRCxDQUFDO0FBQ2pFLGNBQU0sT0FBTztBQUFBLFVBQ1osNkJBQTZCLFlBQW9CQyxTQUF3QjtBQUFFLGtCQUFNLEtBQUssRUFBRSxZQUFZLFFBQUFBLFFBQU8sQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUMvRyxVQUFVO0FBQUEsVUFBRTtBQUFBLFFBQ2I7QUFDQSx3QkFBZ0IsT0FBTyxTQUFTLElBQUk7QUFFcEMsY0FBTSxTQUF5QixFQUFFLFNBQVMsTUFBTSxrQkFBa0IsWUFBWTtBQUM5RSxjQUFNLHlCQUF5QixZQUFZLFNBQVMsV0FBVyxNQUFNO0FBRXJFLGVBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxFQUFFLFlBQVksV0FBVyxPQUFPLENBQUMsQ0FBQztBQUFBLE1BQ2xFLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyx3RUFBd0UsWUFBWTtBQUl4RixZQUFNLFFBQVEsZ0JBQWdCLFdBQVc7QUFDekMsVUFBSTtBQUNILGNBQU0sYUFBYSxhQUFhLElBQUksY0FBYyxpQkFBaUI7QUFDbkUsY0FBTUMsa0JBQWlCLElBQUksTUFBTSxvQkFBb0IsVUFBVSxDQUFDO0FBQ2hFLGNBQU0sRUFBRSxNQUFNLElBQUksbUJBQW1CLE9BQU8sYUFBYSxHQUFHLFVBQVUsQ0FBQztBQUV2RSxjQUFNLFNBQXlCLEVBQUUsU0FBUyxNQUFNLGtCQUFrQixlQUFlO0FBQ2pGLGNBQU0seUJBQXlCLFlBQVlBLGlCQUFnQixjQUFjLE1BQU07QUFFL0UsZUFBTyxnQkFBZ0IsT0FBTyxDQUFDLEVBQUUsWUFBWSxjQUFjLE9BQU8sQ0FBQyxDQUFDO0FBQUEsTUFDckUsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLG1DQUFtQyxNQUFNO0FBRzlDLGFBQVMsZ0JBQWdCLE9BQXFCLFNBQWMsU0FBNkQ7QUFDeEgsWUFBTSxTQUFtQixDQUFDO0FBQzFCLFVBQUksV0FBVztBQUNmLFlBQU0sT0FBTztBQUFBLFFBQ1osMkJBQTJCLFdBQW1CLFVBQTRCO0FBQ3pFLGNBQUksU0FBUyxvQkFBb0IsV0FBVztBQUMzQyxtQkFBTyxLQUFLLFFBQVEsU0FBUyxJQUFJLFFBQVEsRUFBRTtBQUMzQyxtQkFBTztBQUFBLFVBQ1I7QUFDQSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxRQUNBLDBCQUEwQixXQUFtQixVQUE0QjtBQUN4RSxjQUFJLFNBQVMsZUFBZSxXQUFXO0FBQ3RDLG1CQUFPLEtBQUssU0FBUyxTQUFTLEVBQUU7QUFDaEMsbUJBQU87QUFBQSxVQUNSO0FBQ0EsaUJBQU87QUFBQSxRQUNSO0FBQUEsUUFDQSwrQkFBK0I7QUFBQSxRQUFFO0FBQUEsUUFDakMsVUFBVTtBQUFFLHFCQUFXO0FBQUEsUUFBTTtBQUFBLE1BQzlCO0FBQ0Esc0JBQWdCLE9BQU8sU0FBUyxJQUFJO0FBQ3BDLGFBQU8sRUFBRSxRQUFRLFlBQVksTUFBTSxTQUFTO0FBQUEsSUFDN0M7QUFFQSxTQUFLLDREQUE0RCxZQUFZO0FBQzVFLFlBQU0sUUFBUSxnQkFBZ0IsV0FBVztBQUN6QyxVQUFJO0FBQ0gsY0FBTSxhQUFhLGFBQWEsSUFBSSxjQUFjLGNBQWM7QUFDaEUsY0FBTSxVQUFVLElBQUksTUFBTSxhQUFhLFlBQVksV0FBVyxDQUFDO0FBQy9ELGNBQU0sT0FBTyxnQkFBZ0IsT0FBTyxTQUFTLEVBQUUsaUJBQWlCLFFBQVEsQ0FBQztBQUV6RSxjQUFNLDJCQUEyQixTQUFTLElBQUk7QUFFOUMsZUFBTyxnQkFBZ0IsS0FBSyxRQUFRLENBQUMsaUJBQWlCLENBQUM7QUFBQSxNQUN4RCxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssMkRBQTJELFlBQVk7QUFDM0UsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLGFBQWEsYUFBYSxJQUFJLGNBQWMsZUFBZTtBQUNqRSxjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsWUFBWSxZQUFZLENBQUM7QUFDaEUsY0FBTSxPQUFPLGdCQUFnQixPQUFPLFNBQVMsRUFBRSxZQUFZLFFBQVEsQ0FBQztBQUVwRSxjQUFNLDBCQUEwQixTQUFTLFFBQWlCO0FBRTFELGVBQU8sZ0JBQWdCLEtBQUssUUFBUSxDQUFDLGFBQWEsQ0FBQztBQUFBLE1BQ3BELFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxnRkFBaUYsWUFBWTtBQUdqRyxZQUFNLFFBQVEsZ0JBQWdCLFdBQVc7QUFDekMsVUFBSTtBQUNILGNBQU0sYUFBYSxhQUFhLElBQUksY0FBYyxlQUFlO0FBQ2pFLGNBQU0sVUFBVSxJQUFJLE1BQU0sYUFBYSxZQUFZLFlBQVksQ0FBQztBQUNoRSxjQUFNLFVBQW9CLENBQUM7QUFDM0IsOEJBQXNCLE9BQU8sYUFBYSxHQUFHLFVBQVUsR0FBRztBQUFBLFVBQ3pELGNBQWMsT0FBTyxRQUF3QjtBQUFFLG9CQUFRLEtBQUssV0FBVyxJQUFJLEVBQUUsRUFBRTtBQUFBLFVBQUc7QUFBQSxVQUNsRixVQUFVO0FBQUEsVUFBRTtBQUFBLFFBQ2IsQ0FBQztBQUNELHdCQUFnQixPQUFPLFNBQVM7QUFBQSxVQUMvQixjQUFjLE9BQU8sUUFBd0I7QUFBRSxvQkFBUSxLQUFLLFFBQVEsSUFBSSxFQUFFLEVBQUU7QUFBQSxVQUFHO0FBQUEsVUFDL0UsVUFBVTtBQUFBLFVBQUU7QUFBQSxRQUNiLENBQUM7QUFFRCxjQUFNLG1CQUFtQixTQUFTLEVBQUUsSUFBSSxjQUFjLFNBQVMsRUFBRSxNQUFNLFFBQVEsUUFBUSxFQUFFLE1BQU0sWUFBWSxLQUFLLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUN6SCxjQUFNLG1CQUFtQixJQUFJLE1BQU0sb0JBQW9CLFVBQVUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxpQkFBaUIsU0FBUyxFQUFFLE1BQU0sUUFBUSxRQUFRLEVBQUUsTUFBTSxZQUFZLEtBQUssRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBRS9KLGVBQU8sZ0JBQWdCLFNBQVMsQ0FBQyxtQkFBbUIsdUJBQXVCLENBQUM7QUFBQSxNQUM3RSxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssb0RBQXFELFlBQVk7QUFDckUsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxvQkFBb0IsZUFBZSxPQUFPLENBQUM7QUFDeEYsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBRTFELGNBQU0sU0FBUyxNQUFNLE1BQU0sY0FBYztBQUFBLFVBQ3hDLFNBQVMsYUFBYSxJQUFJLGNBQWMsbUJBQW1CO0FBQUEsVUFDM0Qsb0JBQW9CLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQztBQUFBLFFBQzVDLENBQUM7QUFDRCxjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsT0FBTyxTQUFTLFFBQVEsQ0FBQztBQUNoRSxjQUFNLE9BQU8sZ0JBQWdCLE9BQU8sT0FBTztBQUUzQyxjQUFNLE1BQU0sZUFBZSxPQUFPLE9BQU87QUFFekMsZUFBTyxZQUFZLEtBQUssV0FBVyxHQUFHLE1BQU0sc0RBQXNEO0FBQ2xHLGVBQU8sWUFBWSxnQkFBZ0IsT0FBTyxPQUFPLEdBQUcsT0FBTyxtQ0FBbUM7QUFBQSxNQUMvRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUsscUhBQXFILFlBQVk7QUFDckksWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxvQkFBb0IsZUFBZSxPQUFPLENBQUM7QUFDeEYsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxzQkFBc0I7QUFDckUsY0FBTSxLQUFLLG1CQUFtQixhQUFhLE9BQU87QUFFbEQsY0FBTSxHQUFHLE9BQU8sWUFBWSxpQkFBaUIsS0FBSyxVQUFVO0FBQUEsVUFDM0QsVUFBVSxFQUFFLGNBQWMsUUFBUTtBQUFBLFFBQ25DLENBQUMsQ0FBQztBQUNGLGNBQU0sVUFBVSxJQUFJLE1BQU0sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUN6RCxjQUFNLFlBQVk7QUFHbEIsY0FBTSxNQUFNLGdCQUFnQixTQUFTLEtBQUssVUFBVSxFQUFFLGNBQWMsUUFBUSxDQUFDLENBQUM7QUFFOUUsY0FBTSxNQUFNLE1BQU0sWUFBWSxPQUFPO0FBRXJDLGNBQU0sWUFBWSxNQUFNLEdBQUcsT0FBTyxZQUFZLGVBQWU7QUFDN0QsZUFBTyxnQkFBZ0I7QUFBQSxVQUN0QixnQkFBZ0IsVUFBVSxjQUFjLElBQUksUUFBUSxTQUFTLENBQUM7QUFBQSxVQUM5RCxTQUFTLE9BQU87QUFBQTtBQUFBO0FBQUEsVUFHaEIsaUJBQWlCLFlBQVksS0FBSyxNQUFNLFNBQVMsSUFBSSxDQUFDO0FBQUEsUUFDdkQsR0FBRztBQUFBLFVBQ0YsZ0JBQWdCO0FBQUEsVUFDaEIsU0FBUyxDQUFDLE9BQU87QUFBQSxVQUNqQixpQkFBaUIsRUFBRSxVQUFVLEVBQUUsY0FBYyxRQUFRLEVBQUU7QUFBQSxRQUN4RCxDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sOERBQThELE1BQU07QUE0QnpFLGFBQVMsb0JBQW9CLFlBQWlCLGNBQXNCLGFBQThDLE9BQTRFO0FBQzdMLFlBQU0sTUFBeUI7QUFBQSxRQUM5QixhQUFhO0FBQUEsUUFDYixVQUFVO0FBQUEsUUFDVixZQUFZLENBQUM7QUFBQSxRQUNiLE9BQU8sQ0FBQztBQUFBLFFBQ1IsUUFBUSxDQUFDO0FBQUEsUUFDVCxZQUFZLENBQUM7QUFBQSxRQUNiLFlBQVksQ0FBQztBQUFBLE1BQ2Q7QUFDQSxZQUFNLE9BQU87QUFBQSxRQUNaO0FBQUEsUUFDQSxXQUFXO0FBQUEsUUFDWCxpQkFBaUIsRUFBRSxPQUFPLENBQUMsR0FBRyxTQUFTLENBQUMsR0FBRyxZQUFZLENBQUMsRUFBRTtBQUFBLFFBQzFELE1BQU0sb0JBQW1DO0FBQUUsY0FBSSxjQUFjO0FBQUEsUUFBTTtBQUFBLFFBQ25FLE1BQU0sYUFBYSxTQUFxRDtBQUFFLGNBQUksV0FBVyxLQUFLLE9BQU87QUFBQSxRQUFHO0FBQUEsUUFDeEcsTUFBTSxLQUFLLFFBQWdCLGNBQXVCLFFBQTRCLE1BQWUsZ0JBQW1EO0FBQy9JLGNBQUksTUFBTSxLQUFLLEVBQUUsUUFBUSxRQUFRLE1BQU0sZUFBZSxDQUFDO0FBQUEsUUFDeEQ7QUFBQSxRQUNBLGVBQWUsUUFBZ0IsZ0JBQTBDO0FBQUUsY0FBSSxPQUFPLEtBQUssRUFBRSxRQUFRLGVBQWUsQ0FBQztBQUFBLFFBQUc7QUFBQSxRQUN4SCxNQUFNLFNBQVMsSUFBMkI7QUFBRSxjQUFJLFdBQVcsS0FBSyxFQUFFLEdBQUcsQ0FBQztBQUFBLFFBQUc7QUFBQSxRQUN6RSxNQUFNLFNBQVMsTUFBeUM7QUFBRSxjQUFJLFdBQVcsS0FBSyxJQUFJO0FBQUEsUUFBRztBQUFBLFFBQ3JGLCtCQUFxQztBQUFBLFFBQUU7QUFBQSxRQUN2QyxNQUFNLHFCQUFrRDtBQUFFLGlCQUFPO0FBQUEsUUFBVztBQUFBLFFBQzVFLGFBQWEsZ0JBQWdCLFlBQVksQ0FBQztBQUFBLFFBQzFDLFVBQWdCO0FBQUUsY0FBSSxXQUFXO0FBQU0saUJBQU8sUUFBUTtBQUFBLFFBQUc7QUFBQSxNQUMxRDtBQUNBLGFBQU8sRUFBRSxLQUFLLEtBQUs7QUFBQSxJQUNwQjtBQUVBLFNBQUssK0dBQStHLFlBQVk7QUFDL0gsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUMzRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLGFBQWE7QUFDNUQsY0FBTSxNQUFNLGNBQWMsRUFBRSxTQUFTLG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsRUFBRSxDQUFDO0FBRW5GLGNBQU0sVUFBVSxJQUFJLE1BQU0sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUN6RCxjQUFNLFlBQVk7QUFDbEIsWUFBSTtBQUNKLFlBQUk7QUFDSixZQUFJO0FBQ0osWUFBSTtBQUNKLGtCQUFVLHNCQUFzQixDQUFDLFlBQVksTUFBTSxLQUFLLGFBQWE7QUFDcEUscUJBQVc7QUFDWCw0QkFBa0IsVUFBVTtBQUM1Qiw0QkFBa0IsVUFBVTtBQUM1QixnQkFBTSxRQUFRLG9CQUFvQixTQUFTLFdBQVcsV0FBVyxRQUFXLFdBQVcsWUFBWTtBQUNuRyxnQkFBTSxNQUFNO0FBQ1osaUJBQU8sTUFBTTtBQUFBLFFBQ2Q7QUFFQSxjQUFNLFFBQXdCLEVBQUUsSUFBSSxRQUFRO0FBQzVDLGNBQU0sU0FBUyxNQUFNLE1BQU0sTUFBTSxXQUFXLFNBQVMsRUFBRSxNQUFNLENBQUM7QUFFOUQsY0FBTSxLQUFLLG1CQUFtQixhQUFhLE9BQU87QUFDbEQsY0FBTSxNQUFNLE1BQU0sR0FBRyxPQUFPLFlBQVksZUFBZTtBQUN2RCxlQUFPLGdCQUFnQjtBQUFBLFVBQ3RCLFNBQVMsZ0JBQWdCLE9BQU8sT0FBTztBQUFBLFVBQ3ZDLGFBQWEsS0FBSztBQUFBLFVBQ2xCLFNBQVMsaUJBQWlCLFNBQVM7QUFBQSxVQUNuQyxTQUFTLGlCQUFpQixTQUFTO0FBQUEsVUFDbkMsTUFBTSxVQUFVO0FBQUEsVUFDaEIsU0FBUyxVQUFVLGNBQWMsSUFBSSxRQUFRLFNBQVMsQ0FBQztBQUFBLFVBQ3ZELGNBQWMsU0FBUyxLQUFLLE1BQU0sT0FBTyxZQUFhLElBQUk7QUFBQTtBQUFBO0FBQUEsVUFHMUQsc0JBQXNCLFFBQVE7QUFBQSxRQUMvQixHQUFHO0FBQUEsVUFDRixTQUFTO0FBQUEsVUFDVCxhQUFhO0FBQUEsVUFDYixTQUFTLFFBQVEsU0FBUztBQUFBLFVBQzFCLFNBQVMsUUFBUSxTQUFTO0FBQUEsVUFDMUIsTUFBTTtBQUFBLFVBQ04sU0FBUyxFQUFFLGNBQWMsU0FBVSxXQUFXLE9BQU8sRUFBRSxJQUFJLFFBQVEsRUFBRTtBQUFBLFVBQ3JFLGNBQWMsRUFBRSxjQUFjLFNBQVUsV0FBVyxPQUFPLEVBQUUsSUFBSSxRQUFRLEVBQUU7QUFBQSxVQUMxRSxzQkFBc0I7QUFBQSxRQUN2QixDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssa0RBQWtELFlBQVk7QUFDbEUsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUMzRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLGdCQUFnQjtBQUMvRCxjQUFNLFlBQVk7QUFDbEIsa0JBQVUsc0JBQXNCLE1BQU07QUFBRSxnQkFBTSxJQUFJLE1BQU0sNkRBQTZEO0FBQUEsUUFBRztBQUV4SCxjQUFNLE1BQU0sTUFBTSxXQUFXLElBQUksTUFBTSxvQkFBb0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBRXhFLGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEIsU0FBUyxjQUFjLEtBQUs7QUFBQSxRQUM3QixHQUFHO0FBQUEsVUFDRixTQUFTO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssa0dBQWtHLFlBQVk7QUFDbEgsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUMzRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLFdBQVc7QUFDMUQsY0FBTSxNQUFNLGNBQWMsRUFBRSxTQUFTLG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsRUFBRSxDQUFDO0FBRW5GLGNBQU0sWUFBWTtBQUdsQixjQUFNLFNBQVMsb0JBQW9CLFNBQVMsWUFBWTtBQUN4RCw4QkFBc0IsT0FBTyxhQUFhLEdBQUcsT0FBTyxHQUFHLE9BQU8sSUFBSTtBQUlsRSxZQUFJO0FBQ0osa0JBQVUsZUFBZSxPQUFPLFNBQVMsYUFBYSxXQUFXO0FBQ2hFLHFCQUFXLEVBQUUsYUFBYSxPQUFPO0FBQ2pDLGlCQUFPLEVBQUUsV0FBVyxpQkFBaUIsb0JBQW9CLEVBQUU7QUFBQSxRQUM1RDtBQUNBLFlBQUk7QUFDSixrQkFBVSxzQkFBc0IsQ0FBQyxlQUFlO0FBQy9DLHFCQUFXO0FBQ1gsaUJBQU8sb0JBQW9CLFNBQVMsV0FBVyxXQUFXLFFBQVcsV0FBVyxZQUFZLEVBQUU7QUFBQSxRQUMvRjtBQUVBLGNBQU0sVUFBVSxJQUFJLE1BQU0sYUFBYSxTQUFTLFdBQVcsQ0FBQztBQUM1RCxjQUFNLFNBQVMsTUFBTSxNQUFNLE1BQU0sS0FBSyxTQUFTLEVBQUUsUUFBUSxJQUFJLE1BQU0sb0JBQW9CLE9BQU8sQ0FBQyxHQUFHLFFBQVEsS0FBSyxDQUFDO0FBRWhILGNBQU0sS0FBSyxtQkFBbUIsYUFBYSxPQUFPO0FBQ2xELGNBQU0sTUFBTSxNQUFNLEdBQUcsT0FBTyxZQUFZLGVBQWU7QUFDdkQsZUFBTyxnQkFBZ0I7QUFBQSxVQUN0Qix3QkFBd0IsVUFBVSxnQkFBZ0IsT0FBTztBQUFBLFVBQ3pELGNBQWMsVUFBVTtBQUFBLFVBQ3hCLFlBQVksVUFBVTtBQUFBLFVBQ3RCLGlCQUFpQixVQUFVO0FBQUEsVUFDM0IsU0FBUyxnQkFBZ0IsT0FBTyxPQUFPO0FBQUEsVUFDdkMsU0FBUyxVQUFVLGNBQWMsSUFBSSxRQUFRLFNBQVMsQ0FBQztBQUFBLFVBQ3ZELGNBQWMsU0FBUyxLQUFLLE1BQU0sT0FBTyxZQUFhLElBQUk7QUFBQSxVQUMxRCxzQkFBc0IsUUFBUTtBQUFBLFFBQy9CLEdBQUc7QUFBQSxVQUNGLHdCQUF3QjtBQUFBLFVBQ3hCLGNBQWM7QUFBQSxVQUNkLFlBQVk7QUFBQSxVQUNaLGlCQUFpQjtBQUFBLFVBQ2pCLFNBQVM7QUFBQSxVQUNULFNBQVMsRUFBRSxjQUFjLGdCQUFnQjtBQUFBLFVBQ3pDLGNBQWMsRUFBRSxjQUFjLGdCQUFnQjtBQUFBLFVBQzlDLHNCQUFzQjtBQUFBLFFBQ3ZCLENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx5RUFBeUUsWUFBWTtBQUN6RixZQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxvQkFBb0IsZUFBZSxJQUFJLGtCQUFrQixDQUFDLENBQUMsRUFBRSxDQUFDO0FBQzNHLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsV0FBVztBQUMxRCxjQUFNLE1BQU0sY0FBYyxFQUFFLFNBQVMsb0JBQW9CLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQyxFQUFFLENBQUM7QUFDbkYsY0FBTSxhQUFtQjtBQUFBLFVBQ3hCLElBQUk7QUFBQSxVQUNKLE9BQU8sVUFBVTtBQUFBLFVBQ2pCLFNBQVMsRUFBRSxNQUFNLFVBQVUsUUFBUSxFQUFFLE1BQU0sWUFBWSxLQUFLLEVBQUU7QUFBQSxVQUM5RCxlQUFlLENBQUM7QUFBQSxVQUNoQixPQUFPO0FBQUEsUUFDUjtBQUNBLGNBQU0sa0JBQWtCO0FBQ3hCLGNBQU0sZ0JBQWdCO0FBQ3RCLGNBQU0saUJBQWlCLHNCQUFzQixRQUFRLGlCQUFpQixhQUFhO0FBQ25GLGNBQU0sV0FBaUI7QUFBQSxVQUN0QixJQUFJO0FBQUEsVUFDSixPQUFPLFVBQVU7QUFBQSxVQUNqQixTQUFTLEVBQUUsTUFBTSxnQkFBZ0IsUUFBUSxFQUFFLE1BQU0sWUFBWSxLQUFLLEVBQUU7QUFBQSxVQUNwRSxlQUFlLENBQUM7QUFBQSxVQUNoQixPQUFPO0FBQUEsUUFDUjtBQUNBLGNBQU0sU0FBUyxvQkFBb0IsU0FBUyxjQUFjLFlBQVksQ0FBQyxVQUFVLENBQUM7QUFDbEYsOEJBQXNCLE9BQU8sYUFBYSxHQUFHLE9BQU8sR0FBRyxPQUFPLElBQUk7QUFDbEUsY0FBTSxZQUFZO0FBQ2xCLGtCQUFVLGVBQWUsYUFBYSxFQUFFLFdBQVcsZUFBZSxvQkFBb0IsRUFBRTtBQUN4RixZQUFJLG1CQUFtQjtBQUN2QixZQUFJO0FBQ0osa0JBQVUsc0JBQXNCLGdCQUFjO0FBQzdDLGdCQUFNLE9BQU8sb0JBQW9CLFNBQVMsV0FBVyxXQUFXLFlBQVk7QUFDM0U7QUFDQSxtQkFBTyxvQkFBb0IsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLFlBQVksUUFBUTtBQUFBLFVBQ3BFLEdBQUcsV0FBVyxZQUFZO0FBQzFCLHlCQUFlLEtBQUs7QUFDcEIsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFFQSxjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsU0FBUyxXQUFXLENBQUM7QUFDNUQsY0FBTSxvQkFBb0IsSUFBSSxnQkFBc0I7QUFDcEQsY0FBTSxvQkFBb0IsSUFBSSxnQkFBc0I7QUFDcEQsY0FBTSxhQUFhLFVBQVUsa0JBQWtCLE1BQU0sYUFBYSxHQUFHLE9BQU8sR0FBRyxZQUFZO0FBQzFGLDRCQUFrQixTQUFTO0FBQzNCLGdCQUFNLGtCQUFrQjtBQUFBLFFBQ3pCLENBQUM7QUFDRCxjQUFNLGtCQUFrQjtBQUN4QixZQUFJO0FBQ0osY0FBTSxnQkFBZ0IsUUFBUSxHQUFLO0FBQ25DLFlBQUk7QUFDSCxtQkFBUyxNQUFNLFFBQVEsS0FBSztBQUFBLFlBQzNCLE1BQU0sTUFBTSxXQUFXLFNBQVMsRUFBRSxVQUFVLEVBQUUsUUFBUSxJQUFJLE1BQU0sb0JBQW9CLE9BQU8sQ0FBQyxHQUFHLFFBQVEsZUFBZSxlQUFlLGdCQUFnQixFQUFFLENBQUM7QUFBQSxZQUN4SixjQUFjLEtBQUssTUFBTTtBQUFFLG9CQUFNLElBQUksTUFBTSxvREFBb0Q7QUFBQSxZQUFHLENBQUM7QUFBQSxVQUNwRyxDQUFDO0FBQUEsUUFDRixVQUFFO0FBQ0Qsd0JBQWMsT0FBTztBQUNyQiw0QkFBa0IsU0FBUztBQUMzQixnQkFBTTtBQUFBLFFBQ1A7QUFDQSxjQUFNLE1BQU0sTUFBTSxZQUFZLFNBQVMsUUFBUSxRQUFXLFFBQVcsSUFBSTtBQUN6RSxjQUFNLE1BQU0sTUFBTSxZQUFZLFNBQVMsYUFBYSxRQUFXLFFBQVcsSUFBSTtBQUM5RSxjQUFNLE1BQU0sTUFBTSxZQUFZLFNBQVMsRUFBRSxJQUFJLFFBQVEsQ0FBQztBQUN0RCxjQUFNLFFBQVEsTUFBTSxNQUFNLE1BQU0sWUFBWSxPQUFPO0FBRW5ELGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEIsd0JBQXdCLGNBQWMsTUFBTSxDQUFDLEdBQUcsT0FBTyxTQUFTLGdDQUFnQztBQUFBLFVBQ2hHLGFBQWEsY0FBYyxNQUFNLElBQUksVUFBUSxLQUFLLE1BQU07QUFBQSxVQUN4RCxPQUFPLE1BQU0sSUFBSSxVQUFRLEtBQUssRUFBRTtBQUFBLFVBQ2hDLGVBQWUsTUFBTSxDQUFDLEdBQUcsUUFBUTtBQUFBLFVBQ2pDLFVBQVUsU0FBUyxLQUFLLE1BQU0sT0FBTyxZQUFhLEVBQUUsV0FBVztBQUFBLFFBQ2hFLEdBQUc7QUFBQSxVQUNGLHdCQUF3QjtBQUFBLFVBQ3hCLGFBQWEsQ0FBQyxnQkFBZ0IsV0FBVztBQUFBLFVBQ3pDLE9BQU8sQ0FBQyxJQUFJO0FBQUEsVUFDWixlQUFlO0FBQUEsVUFDZixVQUFVLEVBQUUsUUFBUSxvQkFBb0IsT0FBTyxHQUFHLFFBQVEsZUFBZSxvQkFBb0IsR0FBRyxTQUFTLGVBQWUsZ0JBQWdCO0FBQUEsUUFDekksQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHlHQUF5RyxZQUFZO0FBQ3pILFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLElBQUksa0JBQWtCLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDM0csVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxpQkFBaUI7QUFDaEUsY0FBTSxNQUFNLGNBQWMsRUFBRSxTQUFTLG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsRUFBRSxDQUFDO0FBQ25GLGNBQU0sYUFBbUI7QUFBQSxVQUN4QixJQUFJO0FBQUEsVUFDSixPQUFPLFVBQVU7QUFBQSxVQUNqQixTQUFTLEVBQUUsTUFBTSxVQUFVLFFBQVEsRUFBRSxNQUFNLFlBQVksS0FBSyxFQUFFO0FBQUEsVUFDOUQsZUFBZSxDQUFDO0FBQUEsVUFDaEIsT0FBTztBQUFBLFFBQ1I7QUFDQSxjQUFNLGdCQUFnQjtBQUN0QixjQUFNLGlCQUFpQixzQkFBc0IsUUFBUSxRQUFXLGFBQWE7QUFDN0UsY0FBTSxXQUFpQjtBQUFBLFVBQ3RCLElBQUk7QUFBQSxVQUNKLE9BQU8sVUFBVTtBQUFBLFVBQ2pCLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixRQUFRLEVBQUUsTUFBTSxZQUFZLEtBQUssRUFBRTtBQUFBLFVBQ3BFLGVBQWUsQ0FBQztBQUFBLFVBQ2hCLE9BQU87QUFBQSxRQUNSO0FBQ0EsY0FBTSxTQUFTLG9CQUFvQixTQUFTLGNBQWMsWUFBWSxDQUFDLFVBQVUsQ0FBQztBQUNsRiw4QkFBc0IsT0FBTyxhQUFhLEdBQUcsT0FBTyxHQUFHLE9BQU8sSUFBSTtBQUNsRSxjQUFNLFlBQVk7QUFDbEIsWUFBSTtBQUNKLGtCQUFVLGVBQWUsT0FBTyxTQUFTLGNBQWMsV0FBVztBQUNqRSx1QkFBYTtBQUNiLGlCQUFPLEVBQUUsV0FBVyxlQUFlLG9CQUFvQixFQUFFO0FBQUEsUUFDMUQ7QUFDQSxZQUFJLG1CQUFtQjtBQUN2QixZQUFJO0FBQ0osa0JBQVUsc0JBQXNCLGdCQUFjO0FBQzdDLGdCQUFNLE9BQU8sb0JBQW9CLFNBQVMsV0FBVyxXQUFXLFlBQVk7QUFDM0U7QUFDQSxtQkFBTyxvQkFBb0IsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLFlBQVksUUFBUTtBQUFBLFVBQ3BFLEdBQUcsV0FBVyxZQUFZO0FBQzFCLHlCQUFlLEtBQUs7QUFDcEIsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFFQSxjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsU0FBUyxpQkFBaUIsQ0FBQztBQUNsRSxjQUFNLFNBQVMsTUFBTSxNQUFNLE1BQU0sV0FBVyxTQUFTO0FBQUEsVUFDcEQsVUFBVTtBQUFBLFlBQ1QsUUFBUSxJQUFJLE1BQU0sb0JBQW9CLE9BQU8sQ0FBQztBQUFBLFlBQzlDLFFBQVE7QUFBQSxZQUNSLHNCQUFzQjtBQUFBLFlBQ3RCO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUNELGNBQU0sTUFBTSxNQUFNLFlBQVksU0FBUyxRQUFRLFFBQVcsUUFBVyxJQUFJO0FBQ3pFLGNBQU0sTUFBTSxNQUFNLFlBQVksU0FBUyxhQUFhLFFBQVcsUUFBVyxJQUFJO0FBQzlFLGNBQU0sUUFBUSxNQUFNLE1BQU0sTUFBTSxZQUFZLE9BQU87QUFFbkQsZUFBTyxnQkFBZ0I7QUFBQSxVQUN0QjtBQUFBLFVBQ0EsYUFBYSxjQUFjLE1BQU0sSUFBSSxVQUFRLEtBQUssTUFBTTtBQUFBLFVBQ3hELE9BQU8sTUFBTSxJQUFJLFVBQVEsS0FBSyxFQUFFO0FBQUEsVUFDaEMsZUFBZSxNQUFNLENBQUMsR0FBRyxRQUFRO0FBQUEsVUFDakMsVUFBVSxTQUFTLEtBQUssTUFBTSxPQUFPLFlBQWEsRUFBRSxXQUFXO0FBQUEsUUFDaEUsR0FBRztBQUFBLFVBQ0YsWUFBWTtBQUFBLFVBQ1osYUFBYSxDQUFDLGdCQUFnQixXQUFXO0FBQUEsVUFDekMsT0FBTyxDQUFDLElBQUk7QUFBQSxVQUNaLGVBQWU7QUFBQSxVQUNmLFVBQVU7QUFBQSxZQUNULFFBQVEsb0JBQW9CLE9BQU87QUFBQSxZQUNuQyxRQUFRO0FBQUEsWUFDUixzQkFBc0I7QUFBQSxZQUN0QixvQkFBb0I7QUFBQSxZQUNwQixTQUFTO0FBQUEsVUFDVjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLDREQUE0RCxZQUFZO0FBQzVFLFlBQU0sUUFBUSxnQkFBZ0IsV0FBVztBQUN6QyxVQUFJO0FBQ0gsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLFdBQVc7QUFDMUQsY0FBTSxRQUFRLElBQUksTUFBTSxhQUFhLFNBQVMsUUFBUSxDQUFDO0FBQ3ZELGNBQU0sUUFBUSxJQUFJLE1BQU0sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUN2RCxjQUFNLElBQUksb0JBQW9CLFNBQVMsT0FBTztBQUM5QyxjQUFNLElBQUksb0JBQW9CLFNBQVMsT0FBTztBQUM5Qyx3QkFBZ0IsT0FBTyxPQUFPLEVBQUUsSUFBSTtBQUNwQyx3QkFBZ0IsT0FBTyxPQUFPLEVBQUUsSUFBSTtBQUVwQyxjQUFNLE1BQU0sTUFBTSxZQUFZLE9BQU8sV0FBVyxRQUFXLFFBQVcsVUFBVSxVQUFVO0FBRTFGLGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEIsUUFBUSxFQUFFLElBQUksTUFBTSxJQUFJLFFBQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxRQUFRLEVBQUUsUUFBUSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUU7QUFBQSxVQUN2RyxTQUFTLEVBQUUsSUFBSTtBQUFBLFVBQ2YsUUFBUSxFQUFFLElBQUk7QUFBQSxVQUNkLFNBQVMsRUFBRSxJQUFJO0FBQUEsUUFDaEIsR0FBRztBQUFBLFVBQ0YsUUFBUSxDQUFDLEVBQUUsUUFBUSxXQUFXLFFBQVEsVUFBVSxnQkFBZ0IsV0FBVyxDQUFDO0FBQUEsVUFDNUUsU0FBUyxDQUFDLEVBQUUsUUFBUSxVQUFVLGdCQUFnQixXQUFXLENBQUM7QUFBQSxVQUMxRCxRQUFRLENBQUM7QUFBQSxVQUNULFNBQVMsQ0FBQztBQUFBLFFBQ1gsQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLDJEQUEyRCxZQUFZO0FBQzNFLFlBQU0sUUFBUSxnQkFBZ0IsV0FBVztBQUN6QyxVQUFJO0FBQ0gsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLGFBQWE7QUFDNUQsY0FBTSxVQUFVLElBQUksTUFBTSxhQUFhLFNBQVMsT0FBTyxDQUFDO0FBQ3hELGNBQU0sT0FBTztBQUFBLFVBQ1osTUFBTSxNQUFNLE1BQU0sWUFBWSxTQUFTLE1BQU0sTUFBUztBQUFBLFVBQ3REO0FBQUEsUUFDRDtBQUFBLE1BQ0QsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHNEQUFzRCxZQUFZO0FBQ3RFLFlBQU0sUUFBUSxnQkFBZ0IsV0FBVztBQUN6QyxVQUFJO0FBQ0gsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLGFBQWE7QUFDNUQsY0FBTSxRQUFRLElBQUksTUFBTSxhQUFhLFNBQVMsUUFBUSxDQUFDO0FBQ3ZELGNBQU0sUUFBUSxJQUFJLE1BQU0sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUN2RCxjQUFNLElBQUksb0JBQW9CLFNBQVMsT0FBTztBQUM5QyxjQUFNLElBQUksb0JBQW9CLFNBQVMsT0FBTztBQUM5Qyx3QkFBZ0IsT0FBTyxPQUFPLEVBQUUsSUFBSTtBQUNwQyx3QkFBZ0IsT0FBTyxPQUFPLEVBQUUsSUFBSTtBQUVwQyxjQUFNLE1BQU0sTUFBTSxZQUFZLE9BQU8sRUFBRSxJQUFJLFVBQVUsQ0FBQztBQUV0RCxlQUFPLGdCQUFnQjtBQUFBLFVBQ3RCLFNBQVMsRUFBRSxJQUFJLFdBQVcsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUFBLFVBQ3ZDLFNBQVMsRUFBRSxJQUFJLFdBQVcsSUFBSSxPQUFLLEVBQUUsRUFBRTtBQUFBLFFBQ3hDLEdBQUc7QUFBQSxVQUNGLFNBQVMsQ0FBQyxTQUFTO0FBQUEsVUFDbkIsU0FBUyxDQUFDO0FBQUEsUUFDWCxDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssc0dBQXNHLFlBQVk7QUFDdEgsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsYUFBYTtBQUM1RCxjQUFNLFFBQVEsSUFBSSxNQUFNLGFBQWEsU0FBUyxRQUFRLENBQUM7QUFDdkQsY0FBTSxJQUFJLG9CQUFvQixTQUFTLE9BQU87QUFDOUMsY0FBTSxZQUFZO0FBQ2xCLHdCQUFnQixPQUFPLE9BQU8sRUFBRSxJQUFJO0FBQ3BDLGtCQUFVLG9CQUFvQixDQUFDLFdBQVcsY0FBYyxVQUFVLFFBQVEsY0FBYyxtQkFBbUI7QUFFM0csY0FBTSxNQUFNLE1BQU0sWUFBWSxPQUFPLEVBQUUsS0FBSyxZQUFZLENBQUM7QUFDekQsY0FBTSxNQUFNLE1BQU0sWUFBWSxPQUFPLE1BQVM7QUFFOUMsZUFBTyxnQkFBZ0IsRUFBRSxJQUFJLFlBQVksQ0FBQyxrQkFBa0IsTUFBUyxDQUFDO0FBQUEsTUFDdkUsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLDhHQUE4RyxZQUFZO0FBRzlILFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxZQUFZO0FBQzNELFlBQU0sVUFBa0MsQ0FBQztBQUN6QyxZQUFNLGVBQXVDLENBQUM7QUFJOUMsWUFBTSxTQUFTLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUM1RyxVQUFJO0FBQ0gsY0FBTSxPQUFPLGFBQWEsMEJBQTBCLE9BQU87QUFDM0QsY0FBTSxPQUFPLGNBQWMsRUFBRSxTQUFTLG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsRUFBRSxDQUFDO0FBQ3BGLGNBQU0sYUFBYTtBQUNuQixtQkFBVyxzQkFBc0IsQ0FBQyxZQUFZLE1BQU0sS0FBSyxhQUFhO0FBQ3JFLGNBQUksVUFBVTtBQUNiLG9CQUFRLFNBQVMsZUFBZSxTQUFTLElBQUksV0FBVztBQUFBLFVBQ3pEO0FBQ0EsaUJBQU8sb0JBQW9CLFNBQVMsV0FBVyxXQUFXLFFBQVcsV0FBVyxZQUFZLEVBQUU7QUFBQSxRQUMvRjtBQUNBLGNBQU0sV0FBVyxJQUFJLE1BQU0sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUMxRCxjQUFNLFdBQVcsSUFBSSxNQUFNLGFBQWEsU0FBUyxRQUFRLENBQUM7QUFDMUQsY0FBTSxPQUFPLE1BQU0sT0FBTyxNQUFNLFdBQVcsVUFBVSxDQUFDLENBQUM7QUFDdkQsY0FBTSxPQUFPLE1BQU0sT0FBTyxNQUFNLFdBQVcsVUFBVSxDQUFDLENBQUM7QUFDdkQscUJBQWEsUUFBUSxJQUFJLEtBQU07QUFDL0IscUJBQWEsUUFBUSxJQUFJLEtBQU07QUFBQSxNQUNoQyxVQUFFO0FBQ0QsY0FBTSxhQUFhLE1BQU07QUFBQSxNQUMxQjtBQUdBLFlBQU0sU0FBUyxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLElBQUksa0JBQWtCLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDNUcsVUFBSTtBQUNILGNBQU0sT0FBTyxhQUFhLDBCQUEwQixPQUFPO0FBSTNELGNBQU0sT0FBTyxjQUFjLEVBQUUsU0FBUyxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDLEVBQUUsQ0FBQztBQUVwRixjQUFNLGFBQWE7QUFDbkIsY0FBTSxRQUFRLElBQUksTUFBTSxhQUFhLFNBQVMsUUFBUSxDQUFDO0FBQ3ZELGNBQU0sUUFBUSxJQUFJLE1BQU0sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUV2RCxjQUFNLE9BQU8sZ0JBQWdCLE9BQU8sYUFBYSxRQUFRLENBQUM7QUFDMUQsY0FBTSxPQUFPLGdCQUFnQixPQUFPLGFBQWEsUUFBUSxDQUFDO0FBRTFELGNBQU0sZUFBZ0MsQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFvQjtBQUMxRSxZQUFJO0FBQ0osbUJBQVcsc0JBQXNCLENBQUMsZUFBZTtBQUNoRCxvQkFBVTtBQUNWLGlCQUFPLG9CQUFvQixTQUFTLFdBQVcsV0FBVyxZQUFZLGNBQWMsV0FBVyxZQUFZLEVBQUU7QUFBQSxRQUM5RztBQUVBLGNBQU0sT0FBTyxNQUFNLFlBQVksT0FBTyxpQkFBaUIsTUFBUztBQUNoRSxjQUFNLFVBQVUsTUFBTSxnQkFBZ0IsUUFBUSxLQUFLLEVBQUcsWUFBWTtBQUVsRSxlQUFPLGdCQUFnQjtBQUFBLFVBQ3RCLHNCQUFzQixDQUFDLFdBQVcsY0FBYyxJQUFJLE1BQU0sU0FBUyxDQUFDLEdBQUcsV0FBVyxjQUFjLElBQUksTUFBTSxTQUFTLENBQUMsQ0FBQztBQUFBLFVBQ3JILFlBQVksU0FBUztBQUFBLFVBQ3JCLGlCQUFpQixTQUFTO0FBQUEsVUFDMUIsbUJBQW1CLFFBQVEsUUFBUTtBQUFBLFVBQ25DLFlBQVksUUFBUTtBQUFBLFVBQ3BCLFNBQVMsZ0JBQWdCLFFBQVEsS0FBSztBQUFBLFFBQ3ZDLEdBQUc7QUFBQSxVQUNGLHNCQUFzQixDQUFDLEVBQUUsY0FBYyxRQUFRLFFBQVEsRUFBRSxHQUFHLEVBQUUsY0FBYyxRQUFRLFFBQVEsRUFBRSxDQUFDO0FBQUEsVUFDL0YsWUFBWTtBQUFBLFVBQ1osaUJBQWlCLFFBQVEsUUFBUTtBQUFBLFVBQ2pDLG1CQUFtQixRQUFRLFFBQVE7QUFBQSxVQUNuQyxZQUFZO0FBQUEsVUFDWixTQUFTO0FBQUEsUUFDVixDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLE1BQU07QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssaUdBQWlHLFlBQVk7QUFDakgsWUFBTSxxQkFBcUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdkUsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUMzRyxVQUFJO0FBQ0gsY0FBTSxNQUFNLGFBQWEsMEJBQTBCLE9BQU87QUFDMUQsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLG9CQUFvQjtBQUNuRSxjQUFNLEtBQUssbUJBQW1CLGFBQWEsT0FBTztBQUNsRCxjQUFNLEdBQUcsT0FBTyxZQUFZLGlCQUFpQixLQUFLLFVBQVU7QUFBQSxVQUMzRCxVQUFVLEVBQUUsY0FBYyxjQUFjLE9BQU8sRUFBRSxJQUFJLGFBQWEsRUFBRTtBQUFBLFFBQ3JFLENBQUMsQ0FBQztBQUNGLGNBQU0sVUFBVSxJQUFJLE1BQU0sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUN6RCxjQUFNLFlBQVk7QUFHbEIsY0FBTSxNQUFNLGdCQUFnQixTQUFTLE1BQVM7QUFFOUMsY0FBTSxhQUFhLElBQUksTUFBTSxhQUFhLFNBQVMsY0FBYyxDQUFDO0FBQ2xFLGNBQU0sTUFBTSxnQkFBZ0IsWUFBWSxVQUFVO0FBRWxELGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEIsUUFBUSxVQUFVLGNBQWMsSUFBSSxRQUFRLFNBQVMsQ0FBQztBQUFBLFVBQ3RELFNBQVMsVUFBVSxjQUFjLElBQUksV0FBVyxTQUFTLENBQUM7QUFBQSxRQUMzRCxHQUFHO0FBQUEsVUFDRixRQUFRLEVBQUUsY0FBYyxjQUFjLE9BQU8sRUFBRSxJQUFJLGFBQWEsRUFBRTtBQUFBLFVBQ2xFLFNBQVM7QUFBQSxRQUNWLENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxrRkFBa0YsWUFBWTtBQUNsRyxZQUFNLFFBQVEsZ0JBQWdCLFdBQVc7QUFDekMsVUFBSTtBQUNILGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxZQUFZO0FBQzNELGNBQU0sVUFBVSxJQUFJLE1BQU0sYUFBYSxTQUFTLFFBQVEsQ0FBQztBQUN6RCxjQUFNLFlBQVk7QUFDbEIsd0JBQWdCLE9BQU8sU0FBUyxvQkFBb0IsU0FBUyxPQUFPLEVBQUUsSUFBSTtBQUMxRSxrQkFBVSxjQUFjLElBQUksUUFBUSxTQUFTLEdBQUcsRUFBRSxjQUFjLFFBQVEsQ0FBQztBQUV6RSxjQUFNLFNBQW9ELENBQUM7QUFDM0Qsb0JBQVksSUFBSSxNQUFNLG9CQUFvQixPQUFLLE9BQU8sS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLFNBQVMsR0FBRyxjQUFjLEtBQUssTUFBTSxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQztBQUVsSSxjQUFNLE1BQU0sTUFBTSxZQUFZLFNBQVMsRUFBRSxJQUFJLFVBQVUsQ0FBQztBQUV4RCxlQUFPLGdCQUFnQjtBQUFBLFVBQ3RCLFNBQVMsVUFBVSxjQUFjLElBQUksUUFBUSxTQUFTLENBQUM7QUFBQSxVQUN2RDtBQUFBLFFBQ0QsR0FBRztBQUFBLFVBQ0YsU0FBUyxFQUFFLGNBQWMsU0FBUyxPQUFPLEVBQUUsSUFBSSxVQUFVLEVBQUU7QUFBQSxVQUMzRCxRQUFRLENBQUMsRUFBRSxNQUFNLFFBQVEsU0FBUyxHQUFHLGNBQWMsRUFBRSxjQUFjLFNBQVMsT0FBTyxFQUFFLElBQUksVUFBVSxFQUFFLEVBQUUsQ0FBQztBQUFBLFFBQ3pHLENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBT0QsUUFBTSw4QkFBOEIsTUFBTTtBQXVCekMsYUFBUyxZQUFZLE9BQXFCLEtBQWEsUUFBNEIsWUFBb0M7QUFDdEgsWUFBTSxNQUF5QixFQUFFLE9BQU8sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLFlBQVksQ0FBQyxHQUFHLFlBQVksQ0FBQyxHQUFHLFNBQVMsR0FBRyxVQUFVLE1BQU07QUFDcEgsWUFBTSxPQUFPO0FBQUEsUUFDWjtBQUFBLFFBQ0EsV0FBVyxPQUFPLEdBQUc7QUFBQSxRQUNyQixpQkFBaUIsRUFBRSxPQUFPLENBQUMsR0FBRyxTQUFTLENBQUMsR0FBRyxZQUFZLENBQUMsRUFBRTtBQUFBLFFBQzFELE1BQU0sS0FBSyxRQUFnQixjQUF1QixRQUE0QixPQUFnQixnQkFBbUQ7QUFDaEosY0FBSSxNQUFNLEtBQUssRUFBRSxRQUFRLFFBQVEsZUFBZSxDQUFDO0FBQUEsUUFDbEQ7QUFBQSxRQUNBLGVBQWUsUUFBZ0IsZ0JBQTBDO0FBQUUsY0FBSSxPQUFPLEtBQUssRUFBRSxRQUFRLGVBQWUsQ0FBQztBQUFBLFFBQUc7QUFBQSxRQUN4SCxNQUFNLFNBQVMsSUFBMkI7QUFBRSxjQUFJLFdBQVcsS0FBSyxFQUFFO0FBQUEsUUFBRztBQUFBLFFBQ3JFLE1BQU0sU0FBUyxNQUF5QztBQUFFLGNBQUksV0FBVyxLQUFLLElBQUk7QUFBQSxRQUFHO0FBQUEsUUFDckYsTUFBTSxRQUF1QjtBQUFFLGNBQUk7QUFBQSxRQUFXO0FBQUEsUUFDOUMsTUFBTSxjQUF3QztBQUFFLGlCQUFPLENBQUMsRUFBRSxJQUFJLFFBQVEsR0FBRyxHQUFHLENBQW9CO0FBQUEsUUFBRztBQUFBLFFBQ25HLCtCQUFxQztBQUFBLFFBQUU7QUFBQSxRQUN2QyxVQUFnQjtBQUFFLGNBQUksV0FBVztBQUFBLFFBQU07QUFBQSxNQUN4QztBQUNBLFVBQUksV0FBVyxRQUFRO0FBQ3RCLHdCQUFnQixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsSUFBSTtBQUFBLE1BQzVDLE9BQU87QUFDTiw4QkFBc0IsT0FBTyxLQUFLLElBQUk7QUFBQSxNQUN2QztBQUNBLGFBQU87QUFBQSxJQUNSO0FBUUEsYUFBUyxtQkFBbUIsT0FBMkI7QUFDdEQsTUFBQyxNQUFtQyxzQkFBc0IsQ0FBQyxZQUFZLE1BQU0sS0FBSyxhQUFhO0FBQzlGLGVBQU87QUFBQSxVQUNOLFlBQVksVUFBVSxjQUFjLGFBQWEsSUFBSSxjQUFjLFdBQVcsU0FBUztBQUFBLFVBQ3ZGLFdBQVcsV0FBVztBQUFBLFVBQ3RCLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxHQUFHLFNBQVMsQ0FBQyxHQUFHLFlBQVksQ0FBQyxFQUFFO0FBQUEsVUFDMUQsTUFBTSxvQkFBbUM7QUFBQSxVQUFFO0FBQUEsVUFDM0MsTUFBTSxlQUE4QjtBQUFBLFVBQUU7QUFBQSxVQUN0QyxNQUFNLGNBQXdDO0FBQUUsbUJBQU8sQ0FBQztBQUFBLFVBQUc7QUFBQSxVQUMzRCwrQkFBcUM7QUFBQSxVQUFFO0FBQUEsVUFDdkMsVUFBZ0I7QUFBRSx1QkFBVyxjQUFjLFFBQVE7QUFBQSxVQUFHO0FBQUEsUUFDdkQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssNkNBQTZDLFlBQVk7QUFDN0QsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsZUFBZSxJQUFJLGtCQUFrQixDQUFDLENBQUMsRUFBRSxDQUFDO0FBQ3ZGLFVBQUk7QUFDSCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsY0FBYztBQUM3RCxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWMsRUFBRSxTQUFTLG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsRUFBRSxDQUFDO0FBQ2xHLGNBQU0sWUFBWTtBQUNsQixlQUFPLGdCQUFnQjtBQUFBLFVBQ3RCLFNBQVMsT0FBTyxRQUFRLFNBQVM7QUFBQSxVQUNqQyxhQUFhLFVBQVUscUJBQXFCLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQztBQUFBLFFBQ3pFLEdBQUc7QUFBQSxVQUNGLFNBQVMsUUFBUSxTQUFTO0FBQUEsVUFDMUIsYUFBYTtBQUFBLFFBQ2QsQ0FBQztBQUFBLE1BQ0YsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLG1EQUFtRCxZQUFZO0FBQ25FLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUN2RixVQUFJO0FBQ0gsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLGVBQWU7QUFDOUQsY0FBTSxNQUFNLGNBQWMsRUFBRSxTQUFTLG9CQUFvQixDQUFDLElBQUksS0FBSyxZQUFZLENBQUMsRUFBRSxDQUFDO0FBQ25GLGNBQU0sWUFBWTtBQUNsQixlQUFPLFlBQVksVUFBVSxxQkFBcUIsSUFBSSxhQUFhLEdBQUcsT0FBTyxDQUFDLEdBQUcsSUFBSTtBQUVyRixjQUFNLE1BQU0sZUFBZSxPQUFPO0FBRWxDLGVBQU8sWUFBWSxVQUFVLHFCQUFxQixJQUFJLGFBQWEsR0FBRyxPQUFPLENBQUMsR0FBRyxLQUFLO0FBQUEsTUFDdkYsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLCtEQUErRCxZQUFZO0FBQy9FLFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLG9CQUFvQixlQUFlLElBQUksa0JBQWtCLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDM0csVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLDBCQUEwQixPQUFPO0FBQzFELGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxhQUFhO0FBQzVELGNBQU0sTUFBTSxjQUFjLEVBQUUsU0FBUyxvQkFBb0IsQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDLEVBQUUsQ0FBQztBQUNuRixjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsU0FBUyxRQUFRLENBQUM7QUFFekQsMkJBQW1CLEtBQUs7QUFDeEIsY0FBTSxTQUFTLE1BQU0sTUFBTSxNQUFNLFdBQVcsU0FBUyxFQUFFLE9BQU8sRUFBRSxJQUFJLFFBQVEsRUFBRSxDQUFDO0FBRS9FLGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEIsU0FBUyxnQkFBZ0IsT0FBTyxPQUFPO0FBQUEsVUFDdkMsaUJBQWlCLENBQUMsRUFBRSxVQUFVLE9BQU87QUFBQSxVQUNyQyxPQUFPLFNBQVUsS0FBSyxNQUFNLE9BQU8sWUFBYSxFQUFpQyxRQUFRO0FBQUEsUUFDMUYsR0FBRztBQUFBLFVBQ0YsU0FBUztBQUFBLFVBQ1QsaUJBQWlCO0FBQUEsVUFDakIsT0FBTyxFQUFFLElBQUksUUFBUTtBQUFBLFFBQ3RCLENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxxREFBcUQsWUFBWTtBQUNyRSxZQUFNLHFCQUFxQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN2RSxZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxvQkFBb0IsZUFBZSxJQUFJLGtCQUFrQixDQUFDLENBQUMsRUFBRSxDQUFDO0FBQzNHLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsV0FBVztBQUMxRCxjQUFNLE1BQU0sY0FBYyxFQUFFLFNBQVMsb0JBQW9CLENBQUMsSUFBSSxLQUFLLFlBQVksQ0FBQyxFQUFFLENBQUM7QUFDbkYsb0JBQVksT0FBTyxhQUFhLEdBQUcsT0FBTyxHQUFHLFdBQVcsT0FBTztBQUUvRCxjQUFNLFdBQWlDLENBQUM7QUFDeEMsUUFBQyxNQUE2SixlQUFlLE9BQU8sSUFBSSxJQUFJLFdBQVc7QUFDdE0sbUJBQVMsS0FBSyxFQUFFLE9BQU8sQ0FBQztBQUN4QixpQkFBTyxFQUFFLFdBQVcsaUJBQWlCLG9CQUFvQixFQUFFO0FBQUEsUUFDNUQ7QUFDQSwyQkFBbUIsS0FBSztBQUV4QixjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsU0FBUyxXQUFXLENBQUM7QUFDNUQsY0FBTSxTQUFxQyxFQUFFLFFBQVEsSUFBSSxNQUFNLG9CQUFvQixPQUFPLENBQUMsR0FBRyxRQUFRLEtBQUs7QUFDM0csY0FBTSxTQUFTLE1BQU0sTUFBTSxNQUFNLEtBQUssU0FBUyxNQUFNO0FBRXJELGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEI7QUFBQSxVQUNBLFNBQVMsZ0JBQWdCLE9BQU8sT0FBTztBQUFBLFVBQ3ZDLGNBQWMsU0FBUyxLQUFLLE1BQU0sT0FBTyxZQUFhLElBQUk7QUFBQSxRQUMzRCxHQUFHO0FBQUEsVUFDRixVQUFVLENBQUMsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLFVBQzNCLFNBQVM7QUFBQSxVQUNULGNBQWMsRUFBRSxjQUFjLGdCQUFnQjtBQUFBLFFBQy9DLENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx1REFBdUQsWUFBWTtBQUN2RSxZQUFNLFFBQVEsZ0JBQWdCLFdBQVc7QUFDekMsVUFBSTtBQUNILGNBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxnQkFBZ0I7QUFDL0QsY0FBTSxVQUFVLElBQUksTUFBTSxhQUFhLFNBQVMsUUFBUSxDQUFDO0FBQ3pELGNBQU0sTUFBTSxZQUFZLE9BQU8sUUFBUSxTQUFTLEdBQUcsUUFBUSxPQUFPO0FBRWxFLGNBQU0sTUFBTSxNQUFNLFlBQVksU0FBUyxjQUFjLFFBQVcsUUFBVyxVQUFVLFVBQVU7QUFFL0YsZUFBTyxnQkFBZ0I7QUFBQSxVQUN0QixPQUFPLElBQUk7QUFBQSxVQUNYLFFBQVEsSUFBSTtBQUFBLFFBQ2IsR0FBRztBQUFBLFVBQ0YsT0FBTyxDQUFDLEVBQUUsUUFBUSxjQUFjLFFBQVEsVUFBVSxnQkFBZ0IsV0FBVyxDQUFDO0FBQUEsVUFDOUUsUUFBUSxDQUFDLEVBQUUsUUFBUSxVQUFVLGdCQUFnQixXQUFXLENBQUM7QUFBQSxRQUMxRCxDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssZ0VBQWdFLFlBQVk7QUFDaEYsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsbUJBQW1CO0FBQ2xFLGNBQU0sTUFBTSxZQUFZLE9BQU8sYUFBYSxHQUFHLE9BQU8sR0FBRyxXQUFXLE9BQU87QUFFM0UsY0FBTSxNQUFNLE1BQU0sWUFBWSxlQUFlLE9BQU8sR0FBRyxpQkFBaUIsUUFBVyxRQUFXLFVBQVUsVUFBVTtBQUVsSCxlQUFPLGdCQUFnQixJQUFJLE9BQU8sQ0FBQyxFQUFFLFFBQVEsaUJBQWlCLFFBQVEsVUFBVSxnQkFBZ0IsV0FBVyxDQUFDLENBQUM7QUFBQSxNQUM5RyxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUsseUVBQXlFLFlBQVk7QUFDekYsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsVUFBVTtBQUN6RCxjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsU0FBUyxRQUFRLENBQUM7QUFDekQsY0FBTSxNQUFNLFlBQVksT0FBTyxRQUFRLFNBQVMsR0FBRyxRQUFRLE9BQU87QUFDbEUsUUFBQyxNQUFtSCxvQkFBb0IsQ0FBQyxPQUFPLFFBQVEsSUFBSSxRQUFRLGNBQWMsbUJBQW1CO0FBRXJNLGNBQU0sTUFBTSxNQUFNLE1BQU0sT0FBTztBQUMvQixjQUFNLE1BQU0sTUFBTSxZQUFZLFNBQVMsRUFBRSxJQUFJLFVBQVUsQ0FBQztBQUN4RCxjQUFNLE1BQU0sTUFBTSxZQUFZLFNBQVMsRUFBRSxLQUFLLFlBQVksQ0FBQztBQUMzRCxjQUFNLE1BQU0sTUFBTSxZQUFZLFNBQVMsTUFBUztBQUVoRCxlQUFPLGdCQUFnQjtBQUFBLFVBQ3RCLFNBQVMsSUFBSTtBQUFBLFVBQ2IsWUFBWSxJQUFJO0FBQUEsVUFDaEIsWUFBWSxJQUFJO0FBQUEsUUFDakIsR0FBRztBQUFBLFVBQ0YsU0FBUztBQUFBLFVBQ1QsWUFBWSxDQUFDLFNBQVM7QUFBQSxVQUN0QixZQUFZLENBQUMsa0JBQWtCLE1BQVM7QUFBQSxRQUN6QyxDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssNkNBQTZDLFlBQVk7QUFDN0QsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsY0FBYztBQUM3RCxjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsU0FBUyxRQUFRLENBQUM7QUFDekQsb0JBQVksT0FBTyxRQUFRLFNBQVMsR0FBRyxRQUFRLE9BQU87QUFFdEQsY0FBTSxRQUFRLE1BQU0sTUFBTSxNQUFNLFlBQVksT0FBTztBQUVuRCxlQUFPLGdCQUFnQixNQUFNLElBQUksT0FBSyxFQUFFLEVBQUUsR0FBRyxDQUFDLFFBQVEsUUFBUSxTQUFTLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDNUUsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHNDQUFzQyxZQUFZO0FBQ3RELFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsb0JBQW9CLGVBQWUsT0FBTyxDQUFDO0FBQ3hGLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsY0FBYztBQUM3RCxjQUFNLFVBQVUsSUFBSSxNQUFNLGFBQWEsU0FBUyxRQUFRLENBQUM7QUFDekQsY0FBTSxNQUFNLFlBQVksT0FBTyxRQUFRLFNBQVMsR0FBRyxRQUFRLE9BQU87QUFFbEUsY0FBTSxNQUFNLE1BQU0sWUFBWSxPQUFPO0FBRXJDLGVBQU8sZ0JBQWdCO0FBQUEsVUFDdEIsVUFBVSxJQUFJO0FBQUEsVUFDZCxTQUFTLGdCQUFnQixPQUFPLE9BQU87QUFBQSxVQUN2QyxTQUFTLE9BQU87QUFBQSxRQUNqQixHQUFHO0FBQUEsVUFDRixVQUFVO0FBQUEsVUFDVixTQUFTO0FBQUEsVUFDVCxTQUFTLENBQUMsU0FBUyxRQUFRLFNBQVMsQ0FBQztBQUFBLFFBQ3RDLENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBU0QsUUFBTSwyQ0FBMkMsTUFBTTtBQVF0RCxhQUFTLGdCQUFnQixPQUFxQixTQUFnQztBQUM3RSxZQUFNLGdCQUFpQixNQUF1RjtBQUM5RyxZQUFNLGVBQWUsY0FBYyxJQUFJLE9BQU87QUFDOUMsYUFBTyxHQUFHLGNBQWMsa0VBQWtFO0FBQzFGLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxRQUEwQixDQUFDLEVBQUUsTUFBTSxXQUFXLGFBQWEsZUFBZSxhQUFhLEVBQUUsTUFBTSxVQUFVLFlBQVksQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUVqSSxTQUFLLHVGQUF1RixZQUFZO0FBQ3ZHLFlBQU0sUUFBUSxnQkFBZ0IsV0FBVztBQUN6QyxVQUFJO0FBQ0gsY0FBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLGdCQUFnQjtBQUkvRCxjQUFNLHdCQUF3QixTQUFTLEVBQUUsVUFBVSxXQUFXLENBQUMsRUFBRSxRQUFRO0FBQ3pFLGNBQU0sZUFBZSxnQkFBZ0IsT0FBTyxPQUFPO0FBQ25ELGNBQU0sa0JBQWtCLE1BQU0sYUFBYSxTQUFTO0FBQ3BELGVBQU8sWUFBWSxhQUFhLFFBQVEsUUFBUSxTQUFTLEdBQUcsVUFBVTtBQUl0RSxjQUFNLG1CQUFtQixTQUFTLFVBQVU7QUFDNUMsY0FBTSx3QkFBd0IsU0FBUyxFQUFFLFVBQVUsV0FBVyxDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsS0FBSztBQUtsRixlQUFPLFlBQVksTUFBTSxhQUFhLGdCQUFnQixlQUFlLEdBQUcsS0FBSztBQUM3RSxlQUFPLFlBQVksYUFBYSxRQUFRLFFBQVEsU0FBUyxHQUFHLFVBQVU7QUFBQSxNQUN2RSxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUsscURBQXFELFlBQVk7QUFDckUsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsc0JBQXNCO0FBRXJFLGNBQU0sd0JBQXdCLFNBQVMsRUFBRSxVQUFVLFdBQVcsQ0FBQyxFQUFFLFFBQVE7QUFDekUsY0FBTSxlQUFlLGdCQUFnQixPQUFPLE9BQU87QUFDbkQsY0FBTSxrQkFBa0IsTUFBTSxhQUFhLFNBQVM7QUFJcEQsY0FBTSx3QkFBd0IsU0FBUyxFQUFFLFVBQVUsV0FBVyxDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsT0FBTyxFQUFFLE1BQU0sZUFBZSxhQUFhLFdBQVcsYUFBYSxFQUFFLE1BQU0sVUFBVSxZQUFZLENBQUMsRUFBRSxFQUFFLENBQUM7QUFFcEwsZUFBTyxZQUFZLE1BQU0sYUFBYSxnQkFBZ0IsZUFBZSxHQUFHLElBQUk7QUFBQSxNQUM3RSxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssNkVBQTZFLFlBQVk7QUFDN0YsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLFVBQVUsYUFBYSxJQUFJLGNBQWMsc0JBQXNCO0FBR3JFLGNBQU0sd0JBQXdCLFNBQVMsRUFBRSxVQUFVLFdBQVcsQ0FBQyxFQUFFLFFBQVE7QUFBQSxVQUN4RSxFQUFFLE1BQU0sVUFBVSxhQUFhLFVBQVUsYUFBYSxFQUFFLE1BQU0sVUFBVSxZQUFZLENBQUMsRUFBRSxFQUFFO0FBQUEsVUFDekYsRUFBRSxNQUFNLFVBQVUsYUFBYSxVQUFVLGFBQWEsRUFBRSxNQUFNLFVBQVUsWUFBWSxDQUFDLEVBQUUsRUFBRTtBQUFBLFFBQzFGO0FBQ0EsY0FBTSx3QkFBd0IsU0FBUyxFQUFFLFVBQVUsV0FBVyxDQUFDLEVBQUUsUUFBUTtBQUFBLFVBQ3hFLEVBQUUsTUFBTSxVQUFVLGFBQWEsVUFBVSxhQUFhLEVBQUUsTUFBTSxVQUFVLFlBQVksQ0FBQyxFQUFFLEVBQUU7QUFBQSxVQUN6RixFQUFFLE1BQU0sVUFBVSxhQUFhLFVBQVUsYUFBYSxFQUFFLE1BQU0sVUFBVSxZQUFZLENBQUMsRUFBRSxFQUFFO0FBQUEsUUFDMUY7QUFDQSxjQUFNLGVBQWUsZ0JBQWdCLE9BQU8sT0FBTztBQUtuRCxjQUFNLFNBQVMsTUFBTSxhQUFhLFNBQVM7QUFDM0MsZUFBTyxnQkFBZ0IsT0FBTyxNQUFNLElBQUksT0FBSyxFQUFFLElBQUksR0FBRyxDQUFDLFVBQVUsVUFBVSxRQUFRLENBQUM7QUFDcEYsZUFBTyxZQUFZLGFBQWEsUUFBUSxRQUFRLFFBQVEsR0FBRyxVQUFVO0FBQ3JFLGVBQU8sWUFBWSxhQUFhLFFBQVEsUUFBUSxRQUFRLEdBQUcsVUFBVTtBQUNyRSxlQUFPLFlBQVksYUFBYSxRQUFRLFFBQVEsUUFBUSxHQUFHLFVBQVU7QUFJckUsY0FBTSxtQkFBbUIsU0FBUyxVQUFVO0FBQzVDLGNBQU0sZUFBZSxNQUFNLGFBQWEsU0FBUztBQUNqRCxlQUFPLGdCQUFnQixhQUFhLE1BQU0sSUFBSSxPQUFLLEVBQUUsSUFBSSxHQUFHLENBQUMsVUFBVSxRQUFRLENBQUM7QUFDaEYsZUFBTyxZQUFZLGFBQWEsUUFBUSxRQUFRLFFBQVEsR0FBRyxVQUFVO0FBQ3JFLGVBQU8sWUFBWSxhQUFhLFFBQVEsUUFBUSxRQUFRLEdBQUcsTUFBUztBQUFBLE1BQ3JFLFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxpQ0FBaUMsTUFBTTtBQUM1QyxTQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsWUFBTSxRQUFRLGdCQUFnQixhQUFhLEVBQUUsZUFBZSxPQUFPLENBQUM7QUFDcEUsWUFBTSxZQUFZO0FBQ2xCLFlBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxTQUFTO0FBQ3hELFlBQU0sb0JBQW9CLElBQUksZ0JBQXNCO0FBQ3BELFlBQU0sa0JBQWtCLElBQUksZ0JBQXNCO0FBQ2xELFlBQU0sUUFBa0IsQ0FBQztBQUN6QixZQUFNLGtCQUFrQjtBQUFBLFFBQ3ZCLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxHQUFHLFNBQVMsQ0FBQyxHQUFHLFlBQVksQ0FBQyxFQUFFO0FBQUEsUUFDMUQsZ0JBQWdCLFlBQVk7QUFDM0IsZ0JBQU0sS0FBSyxvQkFBb0I7QUFDL0IsNEJBQWtCLFNBQVM7QUFDM0IsZ0JBQU0sZ0JBQWdCO0FBQ3RCLGdCQUFNLEtBQUsscUJBQXFCO0FBQUEsUUFDakM7QUFBQSxRQUNBLFNBQVMsTUFBTSxNQUFNLEtBQUssbUJBQW1CO0FBQUEsTUFDOUM7QUFDQSxZQUFNLGlCQUFpQjtBQUFBLFFBQ3RCLE1BQU0sWUFBWTtBQUFFLGdCQUFNLEtBQUssTUFBTTtBQUFBLFFBQUc7QUFBQSxRQUN4QyxTQUFTLE1BQU07QUFBQSxRQUFFO0FBQUEsTUFDbEI7QUFDQSxZQUFNLFlBQVk7QUFJbEIsNEJBQXNCLE9BQU8sV0FBVyxlQUFlO0FBQ3ZELFlBQU0sd0JBQXdCLFNBQVMsRUFBRSxVQUFVLFNBQVMsQ0FBQyxFQUFFLFFBQVE7QUFBQSxRQUN0RSxFQUFFLE1BQU0sWUFBWSxhQUFhLDJCQUEyQixhQUFhLEVBQUUsTUFBTSxVQUFVLFlBQVksQ0FBQyxFQUFFLEVBQUU7QUFBQSxNQUM3RztBQUNBLGdCQUFVLGlCQUFpQixPQUFNLE9BQU07QUFDdEMsZUFBTyxZQUFZLElBQUksU0FBUztBQUNoQyxjQUFNLEtBQUssUUFBUTtBQUNuQiw4QkFBc0IsT0FBTyxXQUFXLGNBQWM7QUFDdEQsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJO0FBQ0gsY0FBTSxPQUFPLE1BQU0sTUFBTSxZQUFZLGVBQWUsT0FBTyxHQUFHLFNBQVMsTUFBUztBQUNoRixjQUFNLGtCQUFrQjtBQUN4QixlQUFPLGdCQUFnQixPQUFPLENBQUMsb0JBQW9CLENBQUM7QUFFcEQsd0JBQWdCLFNBQVM7QUFDekIsY0FBTTtBQUNOLGVBQU8sZ0JBQWdCLE9BQU87QUFBQSxVQUM3QjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLFVBQUU7QUFDRCx3QkFBZ0IsU0FBUztBQUN6QixjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSx3QkFBd0IsTUFBTTtBQWNuQyxVQUFNLGtCQUFrQixPQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsSUFBRSxFQUFFO0FBRXBELFNBQUssbURBQW1ELFlBQVk7QUFDbkUsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFlBQU0sWUFBWTtBQUNsQixZQUFNLFdBQVcsSUFBSSxnQkFBcUM7QUFDMUQsVUFBSSxnQkFBZ0I7QUFDcEIsZ0JBQVUsbUJBQW1CLE1BQU07QUFDbEM7QUFDQSxlQUFPLFNBQVM7QUFBQSxNQUNqQjtBQUNBLFVBQUk7QUFDSCxjQUFNLEtBQUssVUFBVSxlQUFlLElBQUk7QUFDeEMsY0FBTSxLQUFLLFVBQVUsZUFBZSxJQUFJO0FBQ3hDLGVBQU8sWUFBWSxJQUFJLEVBQUU7QUFDekIsZUFBTyxZQUFZLGVBQWUsQ0FBQztBQUVuQyxjQUFNLFVBQVUsZ0JBQWdCO0FBQ2hDLGlCQUFTLFNBQVMsT0FBTztBQUN6QixlQUFPLFlBQVksTUFBTSxJQUFJLE9BQU87QUFDcEMsZUFBTyxZQUFZLE1BQU0sSUFBSSxPQUFPO0FBQUEsTUFDckMsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHVGQUF1RixZQUFZO0FBQ3ZHLFlBQU0sUUFBUSxnQkFBZ0IsV0FBVztBQUN6QyxZQUFNLFlBQVk7QUFDbEIsVUFBSSxnQkFBZ0I7QUFDcEIsZ0JBQVUsbUJBQW1CLFlBQVk7QUFDeEM7QUFDQSxlQUFPLGdCQUFnQjtBQUFBLE1BQ3hCO0FBQ0EsVUFBSTtBQUNILGNBQU0sVUFBVSxlQUFlLElBQUk7QUFDbkMsY0FBTSxVQUFVLGVBQWUsSUFBSTtBQUNuQyxlQUFPLFlBQVksZUFBZSxDQUFDO0FBQUEsTUFDcEMsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLCtEQUErRCxZQUFZO0FBQy9FLFlBQU0sUUFBUSxnQkFBZ0IsV0FBVztBQUN6QyxZQUFNLFlBQVk7QUFDbEIsVUFBSSxVQUFVO0FBQ2QsZ0JBQVUsbUJBQW1CLFlBQVk7QUFDeEM7QUFDQSxZQUFJLFlBQVksR0FBRztBQUNsQixnQkFBTSxJQUFJLE1BQU0sY0FBYztBQUFBLFFBQy9CO0FBQ0EsZUFBTyxnQkFBZ0I7QUFBQSxNQUN4QjtBQUNBLFVBQUk7QUFDSCxjQUFNLE9BQU8sUUFBUSxNQUFNLFVBQVUsZUFBZSxJQUFJLEdBQUcsY0FBYztBQUN6RSxjQUFNLFVBQVUsZUFBZSxJQUFJO0FBQ25DLGVBQU8sWUFBWSxTQUFTLENBQUM7QUFBQSxNQUM5QixVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssK0NBQStDLFlBQVk7QUFDL0QsWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFlBQU0sWUFBWTtBQUNsQixZQUFNLE1BQWdCLENBQUM7QUFDdkIsZ0JBQVUsbUJBQW1CLE9BQU8sT0FBZTtBQUNsRCxZQUFJLEtBQUssRUFBRTtBQUNYLGVBQU8sZ0JBQWdCO0FBQUEsTUFDeEI7QUFDQSxVQUFJO0FBQ0gsY0FBTSxRQUFRLElBQUk7QUFBQSxVQUNqQixVQUFVLGVBQWUsSUFBSTtBQUFBLFVBQzdCLFVBQVUsZUFBZSxJQUFJO0FBQUEsUUFDOUIsQ0FBQztBQUNELGVBQU8sZ0JBQWdCLENBQUMsR0FBRyxHQUFHLEVBQUUsS0FBSyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUNyRCxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssaUlBQWlJLFlBQVk7QUFRakosWUFBTSxRQUFRLGdCQUFnQixXQUFXO0FBQ3pDLFlBQU0sWUFBWTtBQUlsQixVQUFJLFdBQVc7QUFDZixZQUFNLGNBQWMsRUFBRSxTQUFTLE1BQU07QUFBRTtBQUFBLE1BQVksRUFBRTtBQUNyRCxnQkFBVSxtQkFBbUIsUUFBUSxRQUFRO0FBQzdDLFVBQUk7QUFDSCxlQUFPO0FBQUEsVUFDTixNQUFNLFVBQVUsNEJBQTRCLE1BQU0sV0FBVztBQUFBLFVBQzdELENBQUMsUUFBaUIsb0JBQW9CLEdBQUc7QUFBQSxRQUMxQztBQUNBLGVBQU8sWUFBWSxVQUFVLEdBQUcseUNBQXlDO0FBQUEsTUFDMUUsVUFBRTtBQUdELGtCQUFVLG1CQUFtQjtBQUM3QixjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx1REFBdUQsWUFBWTtBQUN2RSxZQUFNLG1CQUFtQixNQUFNLEdBQUcsUUFBUSxHQUFHLEdBQUcsT0FBTyxDQUFDLDZCQUE2QjtBQUNyRixZQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxXQUFXLE1BQU0sZ0JBQWdCLENBQUMsQ0FBQztBQUN6RSxZQUFNLGtCQUFrQixJQUFJLGdCQUFnQztBQUM1RCxVQUFJLGVBQWU7QUFDbkIsYUFBTyxnQkFBZ0IsTUFBTTtBQUM1Qix1QkFBZTtBQUNmLGVBQU8sZ0JBQWdCO0FBQUEsTUFDeEI7QUFDQSxZQUFNLFFBQVEsZ0JBQWdCLGFBQWE7QUFBQSxRQUMxQyxlQUFlO0FBQUEsUUFDZixtQkFBbUI7QUFBQSxRQUNuQixvQkFBb0IsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFBQSxNQUNqRSxDQUFDO0FBQ0QsWUFBTSxZQUFZO0FBQ2xCLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSxrQ0FBa0MsVUFBVSxPQUFPO0FBQzVFLGNBQU0sZ0JBQWdCLFVBQVUsZUFBZSxJQUFJO0FBQ25ELGlCQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxjQUFjLEtBQUs7QUFDOUMsZ0JBQU0sUUFBUSxDQUFDO0FBQUEsUUFDaEI7QUFDQSxlQUFPLFlBQVksY0FBYyxJQUFJO0FBRXJDLGNBQU0sTUFBTSxTQUFTO0FBQ3JCLHdCQUFnQixTQUFTLElBQUksbUJBQW1CLENBQThCO0FBRTlFLGNBQU0sT0FBTyxRQUFRLGVBQWUsQ0FBQyxVQUFtQixvQkFBb0IsS0FBSyxDQUFDO0FBQUEsTUFDbkYsVUFBRTtBQUNELGNBQU0sR0FBRyxHQUFHLGtCQUFrQixFQUFFLFdBQVcsTUFBTSxPQUFPLEtBQUssQ0FBQztBQUM5RCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSwyQkFBMkIsTUFBTTtBQUt0QyxTQUFLLDZGQUE2RixZQUFZO0FBQzdHLFlBQU0sbUJBQW1CLE1BQU0sR0FBRyxRQUFRLEdBQUcsR0FBRyxPQUFPLENBQUMsZ0JBQWdCO0FBQ3hFLFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxJQUFJO0FBQ25ELFlBQU0sUUFBUSxtQkFBbUIsYUFBYSxPQUFPO0FBQ3JELFVBQUk7QUFDSCxjQUFNLE1BQU0sT0FBTyxZQUFZLDRCQUE0QixJQUFJLEtBQUssZ0JBQWdCLEVBQUUsU0FBUyxDQUFDO0FBQ2hHLGNBQU0sTUFBTSxPQUFPLFlBQVksaUJBQWlCLEtBQUssVUFBVSxFQUFFLEtBQUssNkJBQTZCLENBQUMsQ0FBQztBQUFBLE1BQ3RHLFVBQUU7QUFDRCxjQUFNLFFBQVE7QUFBQSxNQUNmO0FBRUEsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsV0FBVyxNQUFNLGdCQUFnQixDQUFDLENBQUM7QUFDekUsWUFBTSxlQUF1QyxDQUFDO0FBQzlDLGFBQU8sZ0JBQWdCLE9BQU8sWUFBWSxZQUFZO0FBQ3JELHFCQUFhLEtBQUssU0FBUyxLQUFLO0FBQ2hDLGVBQU8sSUFBSSxtQkFBbUI7QUFBQSxNQUMvQjtBQUNBLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsUUFBUSxtQkFBbUIsTUFBTSxtQkFBbUIsQ0FBQztBQUNqSCxZQUFNLFlBQVk7QUFDbEIsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLGtDQUFrQyxVQUFVLE9BQU87QUFDNUUsY0FBTSxVQUFVLGVBQWUsSUFBSTtBQUNuQyxlQUFPLGdCQUFnQixjQUFjLENBQUMsTUFBUyxDQUFDO0FBQUEsTUFDakQsVUFBRTtBQUNELGNBQU0sR0FBRyxHQUFHLGtCQUFrQixFQUFFLFdBQVcsTUFBTSxPQUFPLEtBQUssQ0FBQztBQUM5RCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywwRkFBMEYsWUFBWTtBQUMxRyxZQUFNLGNBQWMsWUFBWSxJQUFJLElBQUksWUFBWSxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQ3pFLGtCQUFZLElBQUksWUFBWSxpQkFBaUIsUUFBUSxVQUFVLFlBQVksSUFBSSxJQUFJLDJCQUEyQixDQUFDLENBQUMsQ0FBQztBQUVqSCxZQUFNLE9BQU8sSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSxRQUFRLENBQUM7QUFDakUsWUFBTSxZQUFZLElBQUksU0FBUyxNQUFNLFdBQVcsVUFBVSxTQUFTO0FBQ25FLFlBQU0sWUFBWSxVQUFVLFdBQVcsU0FBUyxXQUFXLHVEQUF1RCxDQUFDO0FBRW5ILFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxJQUFJO0FBQ25ELFlBQU0sUUFBUSxtQkFBbUIsYUFBYSxPQUFPO0FBQ3JELFVBQUk7QUFDSCxjQUFNLE1BQU0sT0FBTyxZQUFZLDRCQUE0QixLQUFLLFNBQVMsQ0FBQztBQUMxRSxjQUFNLE1BQU0sT0FBTyxZQUFZLGlCQUFpQixLQUFLLFVBQVUsRUFBRSxLQUFLLFVBQVUsU0FBUyxFQUFFLENBQUMsQ0FBQztBQUFBLE1BQzlGLFVBQUU7QUFDRCxjQUFNLFFBQVE7QUFBQSxNQUNmO0FBRUEsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsV0FBVyxJQUFJLENBQUMsQ0FBQztBQUN2RCxZQUFNLGVBQXVDLENBQUM7QUFDOUMsYUFBTyxnQkFBZ0IsT0FBTyxZQUFZLFlBQVk7QUFDckQscUJBQWEsS0FBSyxTQUFTLEtBQUs7QUFDaEMsWUFBSSxhQUFhLFdBQVcsR0FBRztBQUM5QixnQkFBTSxJQUFJLGFBQWEsNkVBQTZFLE1BQU07QUFBQSxRQUMzRztBQUNBLGVBQU8sSUFBSSxtQkFBbUI7QUFBQSxNQUMvQjtBQUNBLGFBQU8sZ0JBQWdCLFlBQVk7QUFDbEMsY0FBTSxJQUFJLE1BQU0sb0NBQW9DO0FBQUEsTUFDckQ7QUFFQSxZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxlQUFlLFFBQVEsbUJBQW1CLE1BQU0sb0JBQW9CLFlBQVksQ0FBQztBQUM5SCxZQUFNLFlBQVk7QUFDbEIsVUFBSTtBQUNILGNBQU0sTUFBTSxhQUFhLGtDQUFrQyxVQUFVLE9BQU87QUFDNUUsY0FBTSxVQUFVLGVBQWUsSUFBSTtBQUNuQyxlQUFPLGdCQUFnQixjQUFjLENBQUMsUUFBUSxNQUFTLENBQUM7QUFBQSxNQUN6RCxVQUFFO0FBQ0QsY0FBTSxhQUFhLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sMkJBQTJCLE1BQU07QUFFdEMsU0FBSyw4RUFBOEUsTUFBTTtBQUN4RixZQUFNLFdBQVcsSUFBSSxLQUFLLHNCQUFzQjtBQUNoRCxZQUFNLFdBQVcsSUFBSSxLQUFLLHlDQUF5QztBQUNuRSxhQUFPO0FBQUEsUUFDTixZQUFZLElBQUksS0FBSyw4Q0FBOEMsR0FBRyxVQUFVLFFBQVEsR0FBRyxTQUFTO0FBQUEsUUFDcEcsSUFBSSxLQUFLLGlFQUFpRSxFQUFFLFNBQVM7QUFBQSxRQUNyRjtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsUUFDTixZQUFZLFVBQVUsVUFBVSxRQUFRLEdBQUcsU0FBUztBQUFBLFFBQ3BELFNBQVMsU0FBUztBQUFBLFFBQ2xCO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxRQUNOLFlBQVksSUFBSSxLQUFLLCtCQUErQixHQUFHLFVBQVUsUUFBUTtBQUFBLFFBQ3pFO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJO0FBRUosVUFBTSxZQUFZO0FBQ2pCLGVBQVMsTUFBTSxHQUFHLFFBQVEsR0FBRyxHQUFHLE9BQU8sQ0FBQyw2QkFBNkI7QUFBQSxJQUN0RSxDQUFDO0FBRUQsYUFBUyxZQUFZO0FBQ3BCLFlBQU0sR0FBRyxHQUFHLFFBQVEsRUFBRSxXQUFXLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFBQSxJQUNyRCxDQUFDO0FBRUQsbUJBQWUsNEJBQTRCLDBCQUErSTtBQUN6TCxZQUFNLGlCQUFpQixJQUFJLFNBQVMsSUFBSSxLQUFLLE1BQU0sR0FBRyxNQUFNO0FBQzVELFlBQU0sR0FBRyxNQUFNLGVBQWUsUUFBUSxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBRXpELFlBQU0sU0FBUyxJQUFJLGtCQUFrQixDQUFDLENBQUM7QUFDdkMsVUFBSTtBQUNKLGFBQU8sZ0JBQWdCLE9BQU0sV0FBVTtBQUN0Qyw4QkFBc0IsT0FBTztBQUM3QixlQUFPLElBQUksbUJBQW1CO0FBQUEsTUFDL0I7QUFFQSxZQUFNLFFBQVEsZ0JBQWdCLGFBQWE7QUFBQSxRQUMxQyxvQkFBb0IsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFBQSxRQUNoRSxlQUFlO0FBQUEsTUFDaEIsQ0FBQztBQUtELFVBQUk7QUFDSixZQUFNLGlCQUFpQjtBQUd2QixZQUFNLDZCQUE2QixlQUFlO0FBQ2xELHFCQUFlLHNCQUFzQixDQUFDLFlBQVksd0JBQXdCLGNBQWMsYUFBYTtBQUNwRyxpQkFBUztBQUNULGVBQU8sMkJBQTJCLEtBQUssT0FBTyxZQUFZLHdCQUF3QixjQUFjLFFBQVE7QUFBQSxNQUN6RztBQUVBLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWMsRUFBRSxTQUFTLGFBQWEsSUFBSSxjQUFjLGdCQUFnQixHQUFHLG9CQUFvQixDQUFDLGNBQWMsRUFBRSxDQUFDO0FBQzVJLGVBQU8sWUFBWSxPQUFPLGFBQWEsSUFBSTtBQUMzQyxjQUFNLE1BQU0sTUFBTSxZQUFZLGVBQWUsT0FBTyxPQUFPLEdBQUcsU0FBUywyQkFBMkIsQ0FBQyx3QkFBd0IsSUFBSSxRQUFXLFFBQVcsUUFBVyxNQUFTO0FBQUEsTUFDMUssVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFDQSxhQUFPLEVBQUUsUUFBUSxxQkFBcUIsZUFBZTtBQUFBLElBQ3REO0FBRUEsU0FBSywrRUFBK0UsWUFBWTtBQUMvRixZQUFNLFdBQVcsSUFBSSxTQUFTLElBQUksS0FBSyxNQUFNLEdBQUcsa0JBQWtCLFVBQVU7QUFDNUUsWUFBTSxFQUFFLFFBQVEscUJBQXFCLGVBQWUsSUFBSSxNQUFNLDRCQUE0QixRQUFRO0FBQ2xHLGFBQU8sWUFBWSxRQUFRLFNBQVMsR0FBRyxTQUFTLFNBQVMsR0FBRyxtRkFBbUY7QUFDL0ksYUFBTyxlQUFlLFFBQVEsU0FBUyxHQUFHLGVBQWUsU0FBUyxHQUFHLDhDQUE4QztBQUNuSCxhQUFPLFlBQVkscUJBQXFCLFNBQVMsUUFBUSxnREFBZ0Q7QUFBQSxJQUMxRyxDQUFDO0FBRUQsU0FBSyw4RUFBOEUsWUFBWTtBQUM5RixZQUFNLGlCQUFpQixJQUFJLFNBQVMsSUFBSSxLQUFLLE1BQU0sR0FBRyxNQUFNO0FBQzVELFlBQU0sRUFBRSxPQUFPLElBQUksTUFBTSw0QkFBNEIsTUFBUztBQUM5RCxhQUFPLFlBQVksUUFBUSxTQUFTLEdBQUcsZUFBZSxTQUFTLEdBQUcscUVBQXFFO0FBQUEsSUFDeEksQ0FBQztBQUVELFNBQUssc0ZBQXNGLFlBQVk7QUFDdEcsWUFBTSxjQUFjLFlBQVksSUFBSSxJQUFJLFlBQVksSUFBSSxlQUFlLENBQUMsQ0FBQztBQUN6RSxrQkFBWSxJQUFJLFlBQVksaUJBQWlCLFFBQVEsVUFBVSxZQUFZLElBQUksSUFBSSwyQkFBMkIsQ0FBQyxDQUFDLENBQUM7QUFFakgsWUFBTSxpQkFBaUIsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSxRQUFRLENBQUM7QUFDM0UsWUFBTSxXQUFXLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sTUFBTSxDQUFDO0FBSW5FLFlBQU0sWUFBWSxVQUFVLElBQUksU0FBUyxnQkFBZ0IsV0FBVyxVQUFVLGNBQWMsVUFBVSxHQUFHLFNBQVMsV0FBVyx1RUFBdUUsQ0FBQztBQUNyTSxZQUFNLFlBQVksVUFBVSxJQUFJLFNBQVMsVUFBVSxXQUFXLFVBQVUsWUFBWSxVQUFVLEdBQUcsU0FBUyxXQUFXLGdFQUFnRSxDQUFDO0FBQ3RMLFlBQU0sWUFBWSxVQUFVLElBQUksU0FBUyxVQUFVLFdBQVcsZ0JBQWdCLG9CQUFvQixHQUFHLFNBQVMsV0FBVyx1RUFBdUUsQ0FBQztBQUVqTSxZQUFNLFNBQVMsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ3ZDLFVBQUk7QUFDSixhQUFPLGdCQUFnQixPQUFNLFdBQVU7QUFDdEMseUJBQWlCO0FBQ2pCLGVBQU8sSUFBSSxtQkFBbUI7QUFBQSxNQUMvQjtBQUVBLFlBQU0sRUFBRSxNQUFNLElBQUksdUJBQXVCLGFBQWE7QUFBQSxRQUNyRCxvQkFBb0IsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFBQSxRQUNoRSxlQUFlO0FBQUEsUUFDZjtBQUFBLE1BQ0QsQ0FBQztBQUtELFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWM7QUFBQSxVQUN4QyxTQUFTLGFBQWEsSUFBSSxjQUFjLGlCQUFpQjtBQUFBLFVBQ3pELG9CQUFvQixDQUFDLGNBQWM7QUFBQSxVQUNuQyxjQUFjLEVBQUUsVUFBVSxNQUFNLE9BQU8sQ0FBQyxFQUFFO0FBQUEsUUFDM0MsQ0FBQztBQUNELGVBQU8sWUFBWSxPQUFPLGFBQWEsSUFBSTtBQUMzQyxjQUFNLE1BQU0sTUFBTSxZQUFZLGVBQWUsT0FBTyxPQUFPLEdBQUcsU0FBUyxDQUFDLFFBQVEsR0FBRyxRQUFXLFFBQVcsTUFBUztBQUFBLE1BQ25ILFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBRUEsYUFBTyxHQUFHLGdCQUFnQix1REFBdUQ7QUFDakYsYUFBTztBQUFBLFFBQ047QUFBQSxVQUNDLGtCQUFrQixlQUFlO0FBQUEsVUFDakMsa0JBQWtCLGVBQWU7QUFBQSxVQUNqQyx3QkFBd0IsZUFBZTtBQUFBLFFBQ3hDO0FBQUEsUUFDQTtBQUFBLFVBQ0Msa0JBQWtCLFNBQVM7QUFBQSxVQUMzQixrQkFBa0IsQ0FBQyxJQUFJLFNBQVMsVUFBVSxXQUFXLFVBQVUsVUFBVSxFQUFFLE1BQU07QUFBQSxVQUNqRix3QkFBd0IsQ0FBQyxJQUFJLFNBQVMsVUFBVSxXQUFXLGNBQWMsRUFBRSxNQUFNO0FBQUEsUUFDbEY7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBRUYsQ0FBQztBQUVELFFBQU0scUNBQXFDLE1BQU07QUFZaEQsVUFBTSxPQUFPLElBQUksS0FBSyxPQUFPO0FBQzdCLFVBQU0sV0FBVyxJQUFJLFNBQVMsSUFBSSxLQUFLLGlCQUFpQixHQUFHLFVBQVU7QUFDckUsVUFBTSxlQUFlLElBQUksU0FBUyxNQUFNLFdBQVcsVUFBVSxVQUFVLEVBQUUsU0FBUztBQUNsRixVQUFNLG1CQUFtQixJQUFJLFNBQVMsVUFBVSxXQUFXLFVBQVUsVUFBVSxFQUFFLFNBQVM7QUFDMUYsVUFBTSxnQkFBdUMsRUFBRSxPQUFPLENBQUMsR0FBRyxTQUFTLENBQUMsR0FBRyxZQUFZLENBQUMsRUFBRTtBQUV0RixhQUFTLFlBQVksa0JBQW1DLE9BQTRDO0FBQ25HLFlBQU0sYUFBYSxhQUFhLElBQUksY0FBYyxZQUFZO0FBQzlELGFBQU8sRUFBRSxXQUFXLGFBQWEsR0FBRyxVQUFVLEdBQUcsWUFBWSxrQkFBa0IsT0FBTyxRQUFXLE9BQU8sU0FBUyxPQUFVO0FBQUEsSUFDNUg7QUFFQSxTQUFLLGdGQUFnRixZQUFZO0FBQ2hHLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUN2RixVQUFJO0FBQ0gsY0FBTSxZQUFZO0FBQ2xCLGVBQU87QUFBQSxVQUNOLFVBQVUsZ0NBQWdDLFlBQVksTUFBTSxFQUFFLEtBQUssYUFBYSxDQUFDLEdBQUcsUUFBUTtBQUFBLFVBQzVGLEVBQUUsS0FBSyxpQkFBaUI7QUFBQSxRQUN6QjtBQUFBLE1BQ0QsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHdGQUF3RixZQUFZO0FBQ3hHLFlBQU0sUUFBUSxnQkFBZ0IsYUFBYSxFQUFFLGVBQWUsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUN2RixVQUFJO0FBQ0gsY0FBTSxZQUFZO0FBQ2xCLGNBQU0sbUJBQW1DLEVBQUUsS0FBSyxJQUFJLEtBQUssbUNBQW1DLEVBQUUsU0FBUyxFQUFFO0FBQ3pHLGVBQU87QUFBQSxVQUNOO0FBQUEsWUFDQyxTQUFTLFVBQVUsZ0NBQWdDLFlBQVksTUFBTSxNQUFTLEdBQUcsUUFBUTtBQUFBLFlBQ3pGLGlCQUFpQixVQUFVLGdDQUFnQyxZQUFZLE1BQU0sRUFBRSxLQUFLLGFBQWEsQ0FBQyxHQUFHLE1BQVM7QUFBQSxZQUM5RyxzQkFBc0IsVUFBVSxnQ0FBZ0MsWUFBWSxNQUFNLEVBQUUsS0FBSyxhQUFhLENBQUMsR0FBRyxJQUFJO0FBQUEsWUFDOUcsa0JBQWtCLFVBQVUsZ0NBQWdDLFlBQVksTUFBTSxnQkFBZ0IsR0FBRyxRQUFRO0FBQUEsVUFDMUc7QUFBQSxVQUNBO0FBQUEsWUFDQyxTQUFTO0FBQUEsWUFDVCxpQkFBaUI7QUFBQSxZQUNqQixzQkFBc0I7QUFBQSxZQUN0QixrQkFBa0I7QUFBQSxVQUNuQjtBQUFBLFFBQ0Q7QUFBQSxNQUNELFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw4RkFBOEYsWUFBWTtBQUM5RyxZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxlQUFlLElBQUksa0JBQWtCLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDdkYsVUFBSTtBQUNILGNBQU0sWUFBWTtBQUNsQixrQkFBVSxvQkFBb0IsQ0FBQyxXQUFXLGNBQWMsVUFBVSxRQUFRLGVBQWUsZUFBZTtBQUl4RyxlQUFPO0FBQUEsVUFDTixNQUFNLFVBQVUsK0JBQStCLFlBQVksTUFBTSxFQUFFLEtBQUssYUFBYSxDQUFDLEdBQUcsZUFBZSxJQUFJO0FBQUEsVUFDNUcsRUFBRSxPQUFPLEVBQUUsS0FBSyxhQUFhLEdBQUcsTUFBTSxhQUFhO0FBQUEsUUFDcEQ7QUFBQSxNQUNELFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxrR0FBa0csWUFBWTtBQUNsSCxZQUFNLFFBQVEsZ0JBQWdCLGFBQWEsRUFBRSxlQUFlLElBQUksa0JBQWtCLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFDdkYsVUFBSTtBQUNILGNBQU0sWUFBWTtBQUNsQixrQkFBVSxvQkFBb0IsTUFBTTtBQUNwQyxlQUFPO0FBQUEsVUFDTjtBQUFBLFlBQ0MsU0FBUyxNQUFNLFVBQVUsK0JBQStCLFlBQVksTUFBTSxNQUFTLEdBQUcsZUFBZSxRQUFRO0FBQUEsWUFDN0csaUJBQWlCLE1BQU0sVUFBVSwrQkFBK0IsWUFBWSxNQUFNLEVBQUUsS0FBSyxhQUFhLENBQUMsR0FBRyxlQUFlLFFBQVE7QUFBQSxVQUNsSTtBQUFBLFVBQ0EsRUFBRSxTQUFTLFFBQVcsaUJBQWlCLE9BQVU7QUFBQSxRQUNsRDtBQUFBLE1BQ0QsVUFBRTtBQUNELGNBQU0sYUFBYSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHVHQUF1RyxZQUFZO0FBT3ZILFlBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDekUsa0JBQVksSUFBSSxZQUFZLGlCQUFpQixRQUFRLFVBQVUsWUFBWSxJQUFJLElBQUksMkJBQTJCLENBQUMsQ0FBQyxDQUFDO0FBRWpILFlBQU0sYUFBYSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLFFBQVEsQ0FBQztBQUN2RSxZQUFNLGlCQUFpQixJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLDJCQUEyQixDQUFDO0FBQzlGLFlBQU0sZ0JBQWdCLElBQUksU0FBUyxZQUFZLFdBQVcsVUFBVSxVQUFVO0FBQzlFLFlBQU0sb0JBQW9CLElBQUksU0FBUyxnQkFBZ0IsV0FBVyxVQUFVLFVBQVU7QUFDdEYsWUFBTSxnQkFBZ0IsU0FBUyxXQUFXLDZEQUE2RDtBQUN2RyxZQUFNLFlBQVksVUFBVSxlQUFlLGFBQWE7QUFDeEQsWUFBTSxZQUFZLFVBQVUsbUJBQW1CLGFBQWE7QUFFNUQsWUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsQ0FBQztBQUN2QyxhQUFPLGdCQUFnQixZQUFZLElBQUksbUJBQW1CO0FBRTFELFlBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3ZFLFlBQU0sRUFBRSxNQUFNLElBQUksdUJBQXVCLGFBQWEsRUFBRSxvQkFBb0IsZUFBZSxRQUFRLFlBQVksQ0FBQztBQUVoSCxVQUFJO0FBQ0osWUFBTSxZQUFZO0FBQ2xCLFlBQU0sNkJBQTZCLFVBQVU7QUFDN0MsZ0JBQVUsc0JBQXNCLENBQUMsWUFBWSx3QkFBd0IsY0FBYyxhQUFhO0FBQy9GLDBCQUFrQixXQUFXO0FBQzdCLGVBQU8sMkJBQTJCLEtBQUssT0FBTyxZQUFZLHdCQUF3QixjQUFjLFFBQVE7QUFBQSxNQUN6RztBQUVBLFVBQUk7QUFDSCxjQUFNLE1BQU0sYUFBYSwwQkFBMEIsT0FBTztBQUMxRCxjQUFNLFNBQVMsTUFBTSxNQUFNLGNBQWM7QUFBQSxVQUN4QyxTQUFTLGFBQWEsSUFBSSxjQUFjLGlCQUFpQjtBQUFBLFVBQ3pELG9CQUFvQixDQUFDLFVBQVU7QUFBQSxVQUMvQixPQUFPLEVBQUUsS0FBSyxjQUFjLFNBQVMsRUFBRTtBQUFBLFFBQ3hDLENBQUM7QUFDRCxlQUFPLFlBQVksT0FBTyxhQUFhLElBQUk7QUFDM0MsY0FBTSxNQUFNLE1BQU0sWUFBWSxlQUFlLE9BQU8sT0FBTyxHQUFHLFNBQVMsQ0FBQyxjQUFjLEdBQUcsUUFBVyxRQUFXLE1BQVM7QUFJeEgsY0FBTSxTQUFTLE1BQU0sVUFBVSxxQkFBcUIsT0FBTyxPQUFPO0FBQ2xFLGVBQU87QUFBQSxVQUNOLEVBQUUsYUFBYSxPQUFPLE9BQU8sZ0JBQWdCO0FBQUEsVUFDN0MsRUFBRSxhQUFhLEVBQUUsS0FBSyxrQkFBa0IsU0FBUyxFQUFFLEdBQUcsaUJBQWlCLFdBQVc7QUFBQSxVQUNsRjtBQUFBLFFBQ0Q7QUFBQSxNQUNELFVBQUU7QUFDRCxjQUFNLGFBQWEsS0FBSztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFFRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsib3B0aW9ucyIsICJtb2RlbHMiLCAicmVzdWx0IiwgImRlZmF1bHRDaGF0VXJpIl0KfQo=
