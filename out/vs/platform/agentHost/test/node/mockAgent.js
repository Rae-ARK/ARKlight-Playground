import { timeout } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentSession } from "../../common/agentService.js";
import { buildSubagentTurnsFromHistory, buildTurnsFromHistory } from "./historyRecordFixtures.js";
import { ToolCallContributorKind } from "../../common/state/protocol/state.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, CustomizationLoadStatus, buildDefaultChatUri, isAhpChatChannel, parseChatUri, parseSubagentSessionUri } from "../../common/state/sessionState.js";
import { hasKey } from "../../../../base/common/types.js";
const MOCK_AUTO_TITLE = "Automatically generated title";
function uriKey(session) {
  return `${session.scheme}://${session.authority}${session.path}${session.query ? "?" + session.query : ""}${session.fragment ? "#" + session.fragment : ""}`;
}
function mockProject(provider) {
  return { uri: URI.from({ scheme: "mock-project", path: `/${provider}` }), displayName: `Agent ${provider}` };
}
class MockAgent {
  constructor(id = "mock") {
    this.id = id;
    this._onDidSessionProgress = new Emitter();
    this.onDidSessionProgress = this._onDidSessionProgress.event;
    this._onDidSendMessage = new Emitter();
    this.onDidSendMessage = this._onDidSendMessage.event;
    this._models = observableValue(this, []);
    this.models = this._models;
    this._sessions = /* @__PURE__ */ new Map();
    this._nextId = 1;
    /** Active turn IDs per session, captured from sendMessage(). */
    this._activeTurnIds = /* @__PURE__ */ new Map();
    this.sendMessageCalls = [];
    this.setPendingMessagesCalls = [];
    this.disposeSessionCalls = [];
    this.releaseSessionCalls = [];
    this.abortSessionCalls = [];
    this.respondToPermissionCalls = [];
    this.changeModelCalls = [];
    this.changeAgentCalls = [];
    this.authenticateCalls = [];
    this.setClientCustomizationsCalls = [];
    this.setClientToolsCalls = [];
    this.removeActiveClientCalls = [];
    this.clientToolCallCompleteCalls = [];
    this.truncateSessionCalls = [];
    /** Configurable return value for getCustomizations. */
    this.customizations = [];
    this._onDidCustomizationsChange = new Emitter();
    this.onDidCustomizationsChange = this._onDidCustomizationsChange.event;
    /**
     * Configurable session history. Tests construct {@link IHistoryRecord}
     * entries (the agent-internal intermediate shape) and the mock converts
     * them to {@link Turn}s on demand. Subagent URIs are routed to filtered
     * subagent turns via {@link buildSubagentTurnsFromHistory}.
     */
    this.sessionMessages = [];
    /** Usage stamped onto every reconstructed turn (e.g. an Auto-model stub). */
    this.turnUsageOverride = void 0;
    /** Optional overrides applied to session metadata from listSessions. */
    this.sessionMetadataOverrides = {};
    this.onSessionConfigChangedCalls = [];
    this.chats = {
      createChat: (chatUri, options) => {
        const { session, chat } = this._resolveChatTarget(chatUri);
        return this.createChat(session, chat, options);
      },
      fork: (chatUri, source, options) => {
        const { session, chat } = this._resolveChatTarget(chatUri);
        return this.createChat(session, chat, { ...options, fork: source });
      },
      disposeChat: (chatUri) => {
        const { session, chat } = this._resolveChatTarget(chatUri);
        return this.disposeChat(session, chat);
      },
      sendMessage: (chatUri, prompt, _workingDirectories, attachments, turnId, senderClientId, clientType) => {
        const { session, chat } = this._resolveChatTarget(chatUri);
        return this.sendMessage(session, chat, prompt, attachments, turnId, senderClientId, clientType);
      },
      abort: (chat) => {
        const { session } = this._resolveChatTarget(chat);
        return this.abortSession(session);
      },
      changeModel: (chatUri, model) => {
        const { session, chat } = this._resolveChatTarget(chatUri);
        return this.changeModel(session, model, chat);
      },
      changeAgent: (chatUri, agent) => {
        const { session, chat } = this._resolveChatTarget(chatUri);
        return this.changeAgent(session, agent, chat);
      },
      getMessages: (chat) => {
        return this.getSessionMessages(chat);
      }
    };
  }
  getDescriptor() {
    return { provider: this.id, displayName: `Agent ${this.id}`, description: `Test ${this.id} agent` };
  }
  getProtectedResources() {
    if (this.id === "copilot") {
      return [{ resource: "https://api.github.com", authorization_servers: ["https://github.com/login/oauth"], required: true }];
    }
    return [];
  }
  setModels(models) {
    this._models.set(models, void 0);
  }
  async listSessions() {
    return [...this._sessions.values()].map((s) => ({ session: s, startTime: Date.now(), modifiedTime: Date.now(), project: mockProject(this.id), ...this.sessionMetadataOverrides }));
  }
  async getSessionMetadata(session) {
    if (!this._sessions.has(AgentSession.id(session))) {
      return void 0;
    }
    return { session, startTime: Date.now(), modifiedTime: Date.now(), project: mockProject(this.id), ...this.sessionMetadataOverrides };
  }
  async createSession(config) {
    const session = config?.session ?? AgentSession.uri(this.id, `${this.id}-session-${this._nextId++}`);
    const rawId = AgentSession.id(session);
    this._sessions.set(rawId, session);
    return { session, project: mockProject(this.id), resolvedWorkingDirectory: this.resolvedWorkingDirectory };
  }
  async resolveSessionConfig(params) {
    return { schema: { type: "object", properties: {} }, values: params.config ?? {} };
  }
  async sessionConfigCompletions(_params) {
    return { items: [] };
  }
  async sendMessage(session, chat, prompt, attachments, turnId, senderClientId, clientType = AgentHostClientType.Unknown) {
    const call = {
      session,
      prompt,
      attachments,
      chat,
      ...senderClientId ? { senderClientId } : {},
      ...clientType !== AgentHostClientType.Unknown ? { clientType } : {}
    };
    this.sendMessageCalls.push(call);
    this._onDidSendMessage.fire(call);
    if (turnId) {
      this._activeTurnIds.set(uriKey(session), turnId);
    }
    if (this.sendMessageError) {
      throw this.sendMessageError;
    }
  }
  setPendingMessages(chat, steeringMessage, queuedMessages) {
    this.setPendingMessagesCalls.push({ chat, steeringMessage, queuedMessages });
  }
  onSessionConfigChanged(session, values) {
    this.onSessionConfigChangedCalls.push({ session, values });
  }
  async getSessionMessages(session) {
    const subagentInfo = parseSubagentSessionUri(session);
    if (subagentInfo) {
      return buildSubagentTurnsFromHistory(this.sessionMessages, subagentInfo.toolCallId, session.toString());
    }
    const turns = buildTurnsFromHistory(this.sessionMessages);
    if (this.turnUsageOverride) {
      return turns.map((turn) => ({ ...turn, usage: this.turnUsageOverride }));
    }
    return turns;
  }
  async disposeSession(session) {
    this.disposeSessionCalls.push(session);
    this._sessions.delete(AgentSession.id(session));
  }
  async releaseSession(session) {
    this.releaseSessionCalls.push(session);
  }
  async abortSession(session) {
    this.abortSessionCalls.push(session);
  }
  async truncateSession(session, turnId, chat) {
    this.truncateSessionCalls.push({ session, turnId, chat });
  }
  respondToPermissionRequest(requestId, approved) {
    this.respondToPermissionCalls.push({ requestId, approved });
  }
  respondToUserInputRequest() {
  }
  async changeModel(session, model, chat) {
    this.changeModelCalls.push({ session, model, chat });
  }
  async changeAgent(session, agent, chat) {
    this.changeAgentCalls.push({ session, agent, chat });
  }
  /**
   * Create an additional (peer) chat. The base mock is single-chat and
   * rejects; multi-chat test subclasses override this.
   */
  async createChat(_session, _chat, _options) {
    throw new Error(`Agent ${this.id} does not support multiple chats`);
  }
  /** Dispose an additional (peer) chat. Overridden by multi-chat subclasses. */
  async disposeChat(_session, _chat) {
  }
  /**
   * Map an already-resolved chat URI to the `(session, chat)` pair the
   * mock records calls against (mirroring the real agents).
   */
  _resolveChatTarget(chat) {
    const parsed = parseChatUri(chat);
    if (!parsed) {
      throw new Error(`Mock agent chat operation requires an AHP chat URI: ${chat.toString()}`);
    }
    return { session: URI.parse(parsed.session), chat: URI.parse(chat.toString()) };
  }
  async authenticate(resource, token) {
    this.authenticateCalls.push({ resource, token });
    return true;
  }
  getCustomizations() {
    return this.customizations;
  }
  syncClientCustomizations(session, clientId, customizations) {
    this.setClientCustomizationsCalls.push({ clientId, customizations });
    const results = customizations.map((c) => ({
      customization: {
        ...c,
        load: { kind: CustomizationLoadStatus.Loaded }
      }
    }));
    this._onDidSessionProgress.fire({
      kind: "action",
      resource: session,
      action: {
        type: ActionType.SessionCustomizationsChanged,
        customizations: results.map((result) => result.customization)
      }
    });
    return results;
  }
  getOrCreateActiveClient(session, client) {
    const self = this;
    let tools = [];
    let customizations = [];
    return {
      clientId: client.clientId,
      displayName: client.displayName,
      get tools() {
        return tools;
      },
      set tools(value) {
        tools = value;
        self.setClientToolsCalls.push({ clientId: client.clientId, tools: value });
      },
      get customizations() {
        return customizations;
      },
      set customizations(value) {
        customizations = value;
        self.syncClientCustomizations(session, client.clientId, [...value]);
      }
    };
  }
  removeActiveClient(_session, clientId) {
    this.removeActiveClientCalls.push({ clientId });
  }
  onClientToolCallComplete(session, chat, toolCallId, result) {
    this.clientToolCallCompleteCalls.push({ session, chat, toolCallId, result });
  }
  async shutdown() {
  }
  /**
   * Fires an {@link AgentSignal} on this agent.
   */
  fireProgress(signal) {
    this._onDidSessionProgress.fire(signal);
  }
  /**
   * Looks up the active turn id captured from the most recent
   * {@link sendMessage} call for a given session. Returns `undefined` if
   * the session has no active turn yet (e.g. tests that fire progress
   * without first calling sendMessage).
   */
  getActiveTurnId(session) {
    return this._activeTurnIds.get(uriKey(session));
  }
  fireCustomizationsChange() {
    this._onDidCustomizationsChange.fire();
  }
  dispose() {
    this._onDidSessionProgress.dispose();
    this._onDidSendMessage.dispose();
    this._onDidCustomizationsChange.dispose();
  }
}
const PRE_EXISTING_SESSION_URI = AgentSession.uri("mock", "pre-existing-session");
class ScriptedMockAgent {
  constructor() {
    this.id = "mock";
    this._onDidSessionProgress = new Emitter();
    this.onDidSessionProgress = this._onDidSessionProgress.event;
    this._models = observableValue(this, [{ provider: "mock", id: "mock-model", name: "Mock Model", maxContextWindow: 128e3, supportsVision: false }]);
    this.models = this._models;
    this._sessions = /* @__PURE__ */ new Map();
    this._nextId = 1;
    /**
     * Message history for the pre-existing session: a single user→assistant
     * turn with a tool call.
     */
    this._preExistingMessages = [
      { type: "message", role: "user", session: PRE_EXISTING_SESSION_URI, messageId: "h-msg-1", content: "What files are here?" },
      { type: "tool_start", session: PRE_EXISTING_SESSION_URI, toolCallId: "h-tc-1", toolName: "list_files", displayName: "List Files", invocationMessage: "Listing files..." },
      { type: "tool_complete", session: PRE_EXISTING_SESSION_URI, toolCallId: "h-tc-1", result: { pastTenseMessage: "Listed files", content: [{ type: ToolResultContentType.Text, text: "file1.ts\nfile2.ts" }], success: true } },
      { type: "message", role: "assistant", session: PRE_EXISTING_SESSION_URI, messageId: "h-msg-2", content: "Here are the files: file1.ts and file2.ts" }
    ];
    // Track pending permission requests
    this._pendingPermissions = /* @__PURE__ */ new Map();
    // Track the active turn ID per session, captured from sendMessage().
    this._activeTurnIds = /* @__PURE__ */ new Map();
    // Track pending abort callbacks for slow responses
    this._pendingAborts = /* @__PURE__ */ new Map();
    this.didCompleteToolCalls = /* @__PURE__ */ new Set();
    this.chats = {
      createChat: (_chat, _options) => {
        throw new Error("Scripted mock agent does not support multiple chats");
      },
      fork: (_chat, _source, _options) => {
        throw new Error("Scripted mock agent does not support chat forking");
      },
      disposeChat: (_chat) => {
        return Promise.resolve();
      },
      sendMessage: (chatUri, prompt, _workingDirectories, attachments, turnId, _senderClientId) => {
        const { session, chat } = this._resolveChatTarget(chatUri);
        return this.sendMessage(session, chat, prompt, attachments, turnId);
      },
      abort: (chat) => {
        const { session } = this._resolveChatTarget(chat);
        return this.abortSession(session);
      },
      changeModel: (chat, model) => {
        const { session } = this._resolveChatTarget(chat);
        return this.changeModel(session, model);
      },
      changeAgent: (_chat, _agent) => {
        return Promise.resolve();
      },
      getMessages: (chat) => {
        return this.getSessionMessages(chat);
      }
    };
    this._sessions.set(AgentSession.id(PRE_EXISTING_SESSION_URI), PRE_EXISTING_SESSION_URI);
    const seeded = process.env["VSCODE_AGENT_HOST_MOCK_SEED_SESSIONS"];
    if (seeded) {
      for (const raw of seeded.split(",")) {
        const trimmed = raw.trim();
        if (!trimmed) {
          continue;
        }
        const uri = URI.parse(trimmed);
        this._sessions.set(AgentSession.id(uri), uri);
      }
    }
  }
  getDescriptor() {
    return { provider: "mock", displayName: "Mock Agent", description: "Scripted test agent" };
  }
  getProtectedResources() {
    return [];
  }
  async listSessions() {
    return [...this._sessions.values()].map((s) => ({
      session: s,
      startTime: Date.now(),
      modifiedTime: Date.now(),
      project: mockProject(this.id),
      summary: s.toString() === PRE_EXISTING_SESSION_URI.toString() ? "Pre-existing session" : void 0
    }));
  }
  async getSessionMetadata(session) {
    if (!this._sessions.has(AgentSession.id(session))) {
      return void 0;
    }
    return {
      session,
      startTime: Date.now(),
      modifiedTime: Date.now(),
      project: mockProject(this.id),
      summary: session.toString() === PRE_EXISTING_SESSION_URI.toString() ? "Pre-existing session" : void 0
    };
  }
  async createSession(config) {
    const session = config?.session ?? AgentSession.uri("mock", `mock-session-${this._nextId++}`);
    const rawId = AgentSession.id(session);
    this._sessions.set(rawId, session);
    return { session, project: mockProject(this.id) };
  }
  async resolveSessionConfig(params) {
    const isolation = params.config?.isolation === "folder" || params.config?.isolation === "worktree" ? params.config.isolation : "worktree";
    const branch = isolation === "worktree" && typeof params.config?.branch === "string" ? params.config.branch : "main";
    return {
      schema: {
        type: "object",
        properties: {
          isolation: {
            type: "string",
            title: "Isolation",
            description: "Where the mock agent should make changes",
            enum: ["folder", "worktree"],
            enumLabels: ["Folder", "Worktree"],
            default: "worktree"
          },
          branch: {
            type: "string",
            title: "Branch",
            description: "Base branch to work from",
            enum: ["main"],
            enumLabels: ["main"],
            default: "main",
            enumDynamic: isolation === "worktree",
            readOnly: isolation === "folder"
          }
        }
      },
      values: { isolation, branch }
    };
  }
  async sessionConfigCompletions(params) {
    if (params.property !== "branch") {
      return { items: [] };
    }
    const query = params.query?.toLowerCase() ?? "";
    const branches = ["main", "feature/config", "release"].filter((branch) => branch.toLowerCase().includes(query));
    return { items: branches.map((branch) => ({ value: branch, label: branch })) };
  }
  async sendMessage(session, chat, prompt, _attachments, turnId) {
    if (turnId) {
      this._activeTurnIds.set(uriKey(session), turnId);
      this._activeTurnIds.set(uriKey(chat), turnId);
    }
    const { sessionStr, turnId: tid } = this._ctx(chat);
    switch (prompt) {
      case "hello":
        this._fireSequence([
          _markdown(chat, sessionStr, tid, "Hello, world!"),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      case "use-tool":
        this._fireSequence([
          ..._toolStart(chat, sessionStr, tid, "tc-1", "echo_tool", "Echo Tool", "Running echo tool..."),
          _toolComplete(chat, sessionStr, tid, "tc-1", { pastTenseMessage: "Ran echo tool", content: [{ type: ToolResultContentType.Text, text: "echoed" }], success: true }),
          _markdown(chat, sessionStr, tid, "Tool done."),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      case "error":
        this._fireSequence([
          _error(chat, sessionStr, tid, "test_error", "Something went wrong")
        ]);
        break;
      case "permission": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-perm-1", "shell", "Shell", "Run a test command")) {
            this._onDidSessionProgress.fire(s);
          }
          await timeout(5);
          this._onDidSessionProgress.fire(_pendingConfirmation(chat, "tc-perm-1", "Run a test command", { toolInput: "echo test", confirmationTitle: "Run a test command" }));
        })();
        this._pendingPermissions.set("tc-perm-1", (approved) => {
          if (approved) {
            this._fireSequence([
              _markdown(chat, sessionStr, tid, "Allowed."),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "write-file": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-write-1", "create", "Create File", "Create file")) {
            this._onDidSessionProgress.fire(s);
          }
          await timeout(5);
          this._onDidSessionProgress.fire(_pendingConfirmation(chat, "tc-write-1", "Write src/app.ts", { permissionKind: "write", permissionPath: "/workspace/src/app.ts" }));
          await timeout(10);
          this._fireSequence([
            _toolComplete(chat, sessionStr, tid, "tc-write-1", { pastTenseMessage: "Wrote file", content: [{ type: ToolResultContentType.Text, text: "ok" }], success: true }),
            _idle(chat, sessionStr, tid)
          ]);
        })();
        break;
      }
      case "write-env": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-write-env-1", "create", "Create File", "Create file")) {
            this._onDidSessionProgress.fire(s);
          }
          await timeout(5);
          this._onDidSessionProgress.fire(_pendingConfirmation(chat, "tc-write-env-1", "Write .env", { permissionKind: "write", permissionPath: "/workspace/.env", confirmationTitle: "Write .env" }));
        })();
        this._pendingPermissions.set("tc-write-env-1", (approved) => {
          if (approved) {
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-write-env-1", { pastTenseMessage: "Wrote .env", content: [{ type: ToolResultContentType.Text, text: "ok" }], success: true }),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "run-safe-command": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-shell-1", "bash", "Run Command", "Run command")) {
            this._onDidSessionProgress.fire(s);
          }
          await timeout(5);
          this._onDidSessionProgress.fire(_pendingConfirmation(chat, "tc-shell-1", "ls -la", { permissionKind: "shell", toolInput: "ls -la" }));
          await timeout(10);
          this._fireSequence([
            _toolComplete(chat, sessionStr, tid, "tc-shell-1", { pastTenseMessage: "Ran command", content: [{ type: ToolResultContentType.Text, text: "file1.ts\nfile2.ts" }], success: true }),
            _idle(chat, sessionStr, tid)
          ]);
        })();
        break;
      }
      case "run-dangerous-command": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-shell-deny-1", "bash", "Run Command", "Run command")) {
            this._onDidSessionProgress.fire(s);
          }
          await timeout(5);
          this._onDidSessionProgress.fire(_pendingConfirmation(chat, "tc-shell-deny-1", "rm -rf /", { permissionKind: "shell", toolInput: "rm -rf /", confirmationTitle: "Run in terminal" }));
        })();
        this._pendingPermissions.set("tc-shell-deny-1", (approved) => {
          if (approved) {
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-shell-deny-1", { pastTenseMessage: "Ran command", content: [{ type: ToolResultContentType.Text, text: "" }], success: true }),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "orphan-confirmation": {
        (async () => {
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, tid, "tc-orphan-initial", "bash", "Run Command", "Run command")) {
            this._onDidSessionProgress.fire(s);
          }
          await timeout(5);
          this._onDidSessionProgress.fire(_toolComplete(chat, sessionStr, tid, "tc-orphan-initial", { pastTenseMessage: "Ran command", content: [{ type: ToolResultContentType.Text, text: "ok" }], success: true }));
          await timeout(5);
          this._onDidSessionProgress.fire(_idle(chat, sessionStr, tid));
          await timeout(10);
          for (const s of _toolStart(chat, sessionStr, "", "tc-orphan", "view", "Read", "Read file")) {
            this._onDidSessionProgress.fire(s);
          }
          await timeout(5);
          this._onDidSessionProgress.fire(_pendingConfirmation(chat, "tc-orphan", "Read file", { permissionKind: "read", permissionPath: "/workspace/file.ts" }));
        })();
        this._pendingPermissions.set("tc-orphan", (approved) => {
          if (approved) {
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-orphan", { pastTenseMessage: "Read file", content: [{ type: ToolResultContentType.Text, text: "contents" }], success: true }),
              _markdown(chat, sessionStr, tid, "continued-after-hook"),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "with-usage":
        this._fireSequence([
          _markdown(chat, sessionStr, tid, "Usage response."),
          _usage(chat, sessionStr, tid, { inputTokens: 100, outputTokens: 50, model: "mock-model", _meta: { cost: 0.5 } }),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      case "with-reasoning": {
        const initialReasoning = _reasoning(chat, sessionStr, tid, "Let me think");
        const partId = initialReasoning.action.type === ActionType.ChatResponsePart && hasKey(initialReasoning.action.part, { id: true }) ? initialReasoning.action.part.id : "";
        this._fireSequence([
          initialReasoning,
          _action(chat, {
            type: ActionType.ChatReasoning,
            turnId: tid,
            partId,
            content: " about this..."
          }),
          _markdown(chat, sessionStr, tid, "Reasoned response."),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      }
      case "with-title":
        this._fireSequence([
          _markdown(chat, sessionStr, tid, "Title response."),
          _titleChanged(session, sessionStr, MOCK_AUTO_TITLE),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      case "slow": {
        const timer = setTimeout(() => {
          const ctx = this._ctx(chat);
          this._fireSequence([
            _markdown(chat, ctx.sessionStr, ctx.turnId, "Slow response."),
            _idle(chat, ctx.sessionStr, ctx.turnId)
          ]);
        }, 5e3);
        this._pendingAborts.set(session.toString(), () => clearTimeout(timer));
        break;
      }
      case "client-tool": {
        (async () => {
          await timeout(10);
          this._onDidSessionProgress.fire(_action(chat, {
            type: ActionType.ChatToolCallStart,
            turnId: tid,
            toolCallId: "tc-client-1",
            toolName: "runTests",
            displayName: "Run Tests",
            contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client-tool" }
          }));
          await timeout(5);
          this._onDidSessionProgress.fire(_pendingConfirmation(chat, "tc-client-1", "Running tests...", { toolInput: "{}" }));
        })();
        this._pendingPermissions.set("tc-client-1", () => {
          this._fireSequence([
            _markdown(chat, sessionStr, tid, "Client tool done."),
            _idle(chat, sessionStr, tid)
          ]);
        });
        break;
      }
      case "client-tool-with-permission": {
        (async () => {
          await timeout(10);
          this._onDidSessionProgress.fire(_action(chat, {
            type: ActionType.ChatToolCallStart,
            turnId: tid,
            toolCallId: "tc-client-perm-1",
            toolName: "runTests",
            displayName: "Run Tests",
            contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client-tool" }
          }));
          await timeout(5);
          this._onDidSessionProgress.fire(_pendingConfirmation(chat, "tc-client-perm-1", "Run tests on project", { confirmationTitle: "Allow Run Tests?" }));
        })();
        this._pendingPermissions.set("tc-client-perm-1", (approved) => {
          if (approved) {
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-client-perm-1", { pastTenseMessage: "Ran tests", content: [{ type: ToolResultContentType.Text, text: "all passed" }], success: true }),
              _markdown(chat, sessionStr, tid, "Permission granted, tool done."),
              _idle(chat, sessionStr, tid)
            ]);
          }
        });
        break;
      }
      case "subagent": {
        this._fireSequence([
          ..._toolStart(chat, sessionStr, tid, "tc-task-1", "task", "Task", "Spawning subagent", { toolKind: "subagent", subagentAgentName: "explore", subagentDescription: "Explore" }),
          { kind: "subagent_started", chat, toolCallId: "tc-task-1", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Exploration helper" },
          ..._toolStart(chat, sessionStr, tid, "tc-inner-1", "echo_tool", "Echo Tool", "Inner tool running...", { parentToolCallId: "tc-task-1" }),
          _toolComplete(chat, sessionStr, tid, "tc-inner-1", { pastTenseMessage: "Ran inner tool", content: [{ type: ToolResultContentType.Text, text: "inner-ok" }], success: true }, "tc-task-1"),
          { kind: "subagent_completed", chat, toolCallId: "tc-task-1" },
          _toolComplete(chat, sessionStr, tid, "tc-task-1", { pastTenseMessage: "Subagent done", content: [{ type: ToolResultContentType.Text, text: "task-ok" }], success: true }),
          _markdown(chat, sessionStr, tid, "Subagent finished."),
          _idle(chat, sessionStr, tid)
        ]);
        break;
      }
      default:
        if (prompt.startsWith("terminal-edit:")) {
          const filePath = prompt.slice("terminal-edit:".length);
          void (async () => {
            for (const s of _toolStart(chat, sessionStr, tid, "tc-term-edit-1", "bash", "Run Command", "Edit file via shell")) {
              this._onDidSessionProgress.fire(s);
            }
            const fs = await import("fs/promises");
            await fs.writeFile(filePath, "edited-from-terminal\n");
            this._fireSequence([
              _toolComplete(chat, sessionStr, tid, "tc-term-edit-1", { pastTenseMessage: "Edited file", content: [{ type: ToolResultContentType.Text, text: "ok" }], success: true }),
              _idle(chat, sessionStr, tid)
            ]);
          })().catch((err) => {
            this._fireSequence([
              _markdown(chat, sessionStr, tid, "terminal-edit failed: " + (err instanceof Error ? err.message : String(err))),
              _idle(chat, sessionStr, tid)
            ]);
          });
          break;
        }
        this._fireSequence([
          _markdown(chat, sessionStr, tid, "Unknown prompt: " + prompt),
          _idle(chat, sessionStr, tid)
        ]);
        break;
    }
  }
  setPendingMessages(chat, steeringMessage, _queuedMessages) {
    if (steeringMessage) {
      timeout(20).then(() => {
        this._onDidSessionProgress.fire({ kind: "steering_consumed", chat: isAhpChatChannel(chat.toString()) ? chat : URI.parse(buildDefaultChatUri(chat)), id: steeringMessage.id });
      });
    }
  }
  getOrCreateActiveClient(_session, client) {
    let tools = [];
    let customizations = [];
    return {
      clientId: client.clientId,
      displayName: client.displayName,
      get tools() {
        return tools;
      },
      set tools(value) {
        tools = value;
      },
      get customizations() {
        return customizations;
      },
      set customizations(value) {
        customizations = value;
      }
    };
  }
  removeActiveClient() {
  }
  onClientToolCallComplete(session, chat, toolCallId, result) {
    const key = `${chat.toString()}:${toolCallId}`;
    if (this.didCompleteToolCalls.has(key)) {
      return;
    }
    this.didCompleteToolCalls.add(key);
    const { sessionStr, turnId } = this._ctx(chat);
    this._onDidSessionProgress.fire(_toolComplete(chat, sessionStr, turnId, toolCallId, result));
    const callback = this._pendingPermissions.get(toolCallId);
    if (callback) {
      this._pendingPermissions.delete(toolCallId);
      callback(true);
    }
  }
  async getSessionMessages(session) {
    const subagentInfo = parseSubagentSessionUri(session);
    if (subagentInfo) {
      return buildSubagentTurnsFromHistory(this._preExistingMessages, subagentInfo.toolCallId, session.toString());
    }
    const parsed = parseChatUri(session);
    const normalized = parsed && buildDefaultChatUri(parsed.session) === session.toString() ? URI.parse(parsed.session) : session;
    if (normalized.toString() === PRE_EXISTING_SESSION_URI.toString()) {
      return buildTurnsFromHistory(this._preExistingMessages);
    }
    return [];
  }
  async disposeSession(session) {
    this._sessions.delete(AgentSession.id(session));
  }
  async abortSession(session) {
    const callback = this._pendingAborts.get(session.toString());
    if (callback) {
      this._pendingAborts.delete(session.toString());
      callback();
    }
  }
  async changeModel(_session, _model) {
  }
  /**
   * Map an already-resolved chat URI to the `(session, chat)` pair the
   * scripted mock's per-chat context is keyed by.
   */
  _resolveChatTarget(chat) {
    const parsed = parseChatUri(chat);
    if (!parsed) {
      throw new Error(`Scripted mock chat operation requires an AHP chat URI: ${chat.toString()}`);
    }
    return { session: URI.parse(parsed.session), chat: URI.parse(chat.toString()) };
  }
  async truncateSession(_session, _turnId) {
  }
  respondToPermissionRequest(toolCallId, approved) {
    const callback = this._pendingPermissions.get(toolCallId);
    if (callback) {
      this._pendingPermissions.delete(toolCallId);
      callback(approved);
    }
  }
  respondToUserInputRequest() {
  }
  async authenticate(_resource, _token) {
    return true;
  }
  async shutdown() {
  }
  dispose() {
    this._onDidSessionProgress.dispose();
  }
  /**
   * Fires a sequence of {@link AgentSignal}s with staggered 10 ms delays
   * so the state manager processes them in order.
   */
  _fireSequence(signals) {
    let delay = 0;
    for (const signal of signals) {
      delay += 10;
      setTimeout(() => this._onDidSessionProgress.fire(signal), delay);
    }
  }
  /** Builds the session-string + turnId context for signal construction. */
  _ctx(session) {
    return {
      sessionStr: session.toString(),
      turnId: this._activeTurnIds.get(uriKey(session)) ?? "mock-turn"
    };
  }
}
let _mockPartIdCounter = 0;
function _action(session, action, parentToolCallId) {
  return { kind: "action", resource: session, action, parentToolCallId };
}
function _markdown(session, sessionStr, turnId, content, parentToolCallId) {
  return _action(session, {
    type: ActionType.ChatResponsePart,
    turnId,
    part: { kind: ResponsePartKind.Markdown, id: `mock-md-${++_mockPartIdCounter}`, content }
  }, parentToolCallId);
}
function _reasoning(session, sessionStr, turnId, content) {
  return _action(session, {
    type: ActionType.ChatResponsePart,
    turnId,
    part: { kind: ResponsePartKind.Reasoning, id: `mock-rs-${++_mockPartIdCounter}`, content }
  });
}
function _idle(session, sessionStr, turnId) {
  return _action(session, { type: ActionType.ChatTurnComplete, turnId, duration: 1 });
}
function _error(session, sessionStr, turnId, errorType, message, stack) {
  return _action(session, { type: ActionType.ChatError, turnId, duration: 1, error: { errorType, message, stack } });
}
function _titleChanged(session, sessionStr, title) {
  return _action(session, { type: ActionType.SessionTitleChanged, title });
}
function _usage(session, sessionStr, turnId, usage) {
  return _action(session, { type: ActionType.ChatUsage, turnId, usage });
}
function _toolStart(session, sessionStr, turnId, toolCallId, toolName, displayName, invocationMessage, opts) {
  const meta = {};
  if (opts?.toolKind) {
    meta.toolKind = opts.toolKind;
  }
  if (opts?.subagentAgentName) {
    meta.subagentAgentName = opts.subagentAgentName;
  }
  if (opts?.subagentDescription) {
    meta.subagentDescription = opts.subagentDescription;
  }
  const signals = [_action(session, {
    type: ActionType.ChatToolCallStart,
    turnId,
    toolCallId,
    toolName,
    displayName,
    contributor: opts?.toolClientId ? { kind: ToolCallContributorKind.Client, clientId: opts.toolClientId } : void 0,
    _meta: Object.keys(meta).length ? meta : void 0
  }, opts?.parentToolCallId)];
  if (!opts?.toolClientId) {
    signals.push(_action(session, {
      type: ActionType.ChatToolCallReady,
      turnId,
      toolCallId,
      invocationMessage,
      toolInput: opts?.toolInput,
      confirmed: ToolCallConfirmationReason.NotNeeded
    }, opts?.parentToolCallId));
  }
  return signals;
}
function _toolComplete(session, sessionStr, turnId, toolCallId, result, parentToolCallId) {
  return _action(session, { type: ActionType.ChatToolCallComplete, turnId, toolCallId, result }, parentToolCallId);
}
function _pendingConfirmation(session, toolCallId, invocationMessage, opts) {
  return {
    kind: "pending_confirmation",
    chat: session,
    state: {
      status: ToolCallStatus.PendingConfirmation,
      toolCallId,
      toolName: "",
      displayName: "",
      invocationMessage,
      toolInput: opts?.toolInput,
      confirmationTitle: opts?.confirmationTitle
    },
    permissionKind: opts?.permissionKind,
    permissionPath: opts?.permissionPath
  };
}
export {
  MOCK_AUTO_TITLE,
  MockAgent,
  PRE_EXISTING_SESSION_URI,
  ScriptedMockAgent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvbW9ja0FnZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB0eXBlIHsgSUF1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHR5cGUgSVN5bmNlZEN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIHR5cGUgQWdlbnRQcm92aWRlciwgdHlwZSBBZ2VudFNpZ25hbCwgdHlwZSBJQWN0aXZlQ2xpZW50LCB0eXBlIElBZ2VudCwgdHlwZSBJQWdlbnRBY3Rpb25TaWduYWwsIHR5cGUgSUFnZW50Q2hhdHMsIHR5cGUgSUFnZW50Q3JlYXRlQ2hhdEZvcmtTb3VyY2UsIHR5cGUgSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMsIHR5cGUgSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCwgdHlwZSBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnLCB0eXBlIElBZ2VudENyZWF0ZVNlc3Npb25SZXN1bHQsIHR5cGUgSUFnZW50RGVzY3JpcHRvciwgdHlwZSBJQWdlbnRNb2RlbEluZm8sIHR5cGUgSUFnZW50UmVzb2x2ZVNlc3Npb25Db25maWdQYXJhbXMsIHR5cGUgSUFnZW50U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUGFyYW1zLCB0eXBlIElBZ2VudFNlc3Npb25NZXRhZGF0YSwgdHlwZSBJQWdlbnRUb29sUGVuZGluZ0NvbmZpcm1hdGlvblNpZ25hbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRTdWJhZ2VudFR1cm5zRnJvbUhpc3RvcnksIGJ1aWxkVHVybnNGcm9tSGlzdG9yeSwgdHlwZSBJSGlzdG9yeVJlY29yZCB9IGZyb20gJy4vaGlzdG9yeVJlY29yZEZpeHR1cmVzLmpzJztcbmltcG9ydCB7IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEsIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCB0eXBlIEFnZW50U2VsZWN0aW9uLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50LCB0eXBlIE1vZGVsU2VsZWN0aW9uLCB0eXBlIFRvb2xEZWZpbml0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQsIFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgYnVpbGREZWZhdWx0Q2hhdFVyaSwgaXNBaHBDaGF0Q2hhbm5lbCwgcGFyc2VDaGF0VXJpLCBwYXJzZVN1YmFnZW50U2Vzc2lvblVyaSwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgUGVuZGluZ01lc3NhZ2UsIHR5cGUgU3RyaW5nT3JNYXJrZG93biwgdHlwZSBUb29sQ2FsbFJlc3VsdCwgdHlwZSBUdXJuLCB0eXBlIFVzYWdlSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG4vKiogV2VsbC1rbm93biBhdXRvLWdlbmVyYXRlZCB0aXRsZSB1c2VkIGJ5IHRoZSAnd2l0aC10aXRsZScgcHJvbXB0LiAqL1xuZXhwb3J0IGNvbnN0IE1PQ0tfQVVUT19USVRMRSA9ICdBdXRvbWF0aWNhbGx5IGdlbmVyYXRlZCB0aXRsZSc7XG5cbmZ1bmN0aW9uIHVyaUtleShzZXNzaW9uOiBVUkkpOiBzdHJpbmcge1xuXHQvLyBCdWlsZCBhIHN0YWJsZSBrZXkgZnJvbSByYXcgVVJJIGZpZWxkcyB3aXRob3V0IGludm9raW5nIGB0b1N0cmluZygpYCxcblx0Ly8gd2hpY2ggd291bGQgbXV0YXRlIHRoZSBVUkkncyBgX2Zvcm1hdHRlZGAgY2FjaGUgYW5kIGJyZWFrXG5cdC8vIGBhc3NlcnQuZGVlcFN0cmljdEVxdWFsYCBjb21wYXJpc29ucyBpbiB0ZXN0cyB0aGF0IGNhcHR1cmUgdGhlIFVSSVxuXHQvLyBiZWZvcmUgaXQgaXMgb2JzZXJ2ZWQgZWxzZXdoZXJlLlxuXHRyZXR1cm4gYCR7c2Vzc2lvbi5zY2hlbWV9Oi8vJHtzZXNzaW9uLmF1dGhvcml0eX0ke3Nlc3Npb24ucGF0aH0ke3Nlc3Npb24ucXVlcnkgPyAnPycgKyBzZXNzaW9uLnF1ZXJ5IDogJyd9JHtzZXNzaW9uLmZyYWdtZW50ID8gJyMnICsgc2Vzc2lvbi5mcmFnbWVudCA6ICcnfWA7XG59XG5cbmZ1bmN0aW9uIG1vY2tQcm9qZWN0KHByb3ZpZGVyOiBBZ2VudFByb3ZpZGVyKSB7XG5cdHJldHVybiB7IHVyaTogVVJJLmZyb20oeyBzY2hlbWU6ICdtb2NrLXByb2plY3QnLCBwYXRoOiBgLyR7cHJvdmlkZXJ9YCB9KSwgZGlzcGxheU5hbWU6IGBBZ2VudCAke3Byb3ZpZGVyfWAgfTtcbn1cblxuaW50ZXJmYWNlIElNb2NrU2VuZE1lc3NhZ2VDYWxsIHtcblx0cmVhZG9ubHkgc2Vzc2lvbjogVVJJO1xuXHRyZWFkb25seSBwcm9tcHQ6IHN0cmluZztcblx0cmVhZG9ubHkgYXR0YWNobWVudHM/OiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdO1xuXHRyZWFkb25seSBjaGF0PzogVVJJO1xuXHRyZWFkb25seSBzZW5kZXJDbGllbnRJZD86IHN0cmluZztcblx0cmVhZG9ubHkgY2xpZW50VHlwZT86IEFnZW50SG9zdENsaWVudFR5cGU7XG59XG5cbi8qKlxuICogR2VuZXJhbC1wdXJwb3NlIG1vY2sgYWdlbnQgZm9yIHVuaXQgdGVzdHMuIFRyYWNrcyBhbGwgbWV0aG9kIGNhbGxzXG4gKiBmb3IgYXNzZXJ0aW9uIGFuZCBleHBvc2VzIHtAbGluayBmaXJlUHJvZ3Jlc3N9IHRvIGluamVjdCBwcm9ncmVzcyBldmVudHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBNb2NrQWdlbnQgaW1wbGVtZW50cyBJQWdlbnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlc3Npb25Qcm9ncmVzcyA9IG5ldyBFbWl0dGVyPEFnZW50U2lnbmFsPigpO1xuXHRyZWFkb25seSBvbkRpZFNlc3Npb25Qcm9ncmVzcyA9IHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbmRNZXNzYWdlID0gbmV3IEVtaXR0ZXI8SU1vY2tTZW5kTWVzc2FnZUNhbGw+KCk7XG5cdHJlYWRvbmx5IG9uRGlkU2VuZE1lc3NhZ2UgPSB0aGlzLl9vbkRpZFNlbmRNZXNzYWdlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10+KHRoaXMsIFtdKTtcblx0cmVhZG9ubHkgbW9kZWxzID0gdGhpcy5fbW9kZWxzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0cHJpdmF0ZSBfbmV4dElkID0gMTtcblx0LyoqIEFjdGl2ZSB0dXJuIElEcyBwZXIgc2Vzc2lvbiwgY2FwdHVyZWQgZnJvbSBzZW5kTWVzc2FnZSgpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVUdXJuSWRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXG5cdHJlYWRvbmx5IHNlbmRNZXNzYWdlQ2FsbHM6IElNb2NrU2VuZE1lc3NhZ2VDYWxsW10gPSBbXTtcblx0cmVhZG9ubHkgc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHM6IHsgY2hhdDogVVJJOyBzdGVlcmluZ01lc3NhZ2U6IFBlbmRpbmdNZXNzYWdlIHwgdW5kZWZpbmVkOyBxdWV1ZWRNZXNzYWdlczogcmVhZG9ubHkgUGVuZGluZ01lc3NhZ2VbXSB9W10gPSBbXTtcblx0cmVhZG9ubHkgZGlzcG9zZVNlc3Npb25DYWxsczogVVJJW10gPSBbXTtcblx0cmVhZG9ubHkgcmVsZWFzZVNlc3Npb25DYWxsczogVVJJW10gPSBbXTtcblx0cmVhZG9ubHkgYWJvcnRTZXNzaW9uQ2FsbHM6IFVSSVtdID0gW107XG5cdHJlYWRvbmx5IHJlc3BvbmRUb1Blcm1pc3Npb25DYWxsczogeyByZXF1ZXN0SWQ6IHN0cmluZzsgYXBwcm92ZWQ6IGJvb2xlYW4gfVtdID0gW107XG5cdHJlYWRvbmx5IGNoYW5nZU1vZGVsQ2FsbHM6IHsgc2Vzc2lvbjogVVJJOyBtb2RlbDogTW9kZWxTZWxlY3Rpb247IGNoYXQ/OiBVUkkgfVtdID0gW107XG5cdHJlYWRvbmx5IGNoYW5nZUFnZW50Q2FsbHM6IHsgc2Vzc2lvbjogVVJJOyBhZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQ7IGNoYXQ/OiBVUkkgfVtdID0gW107XG5cdHJlYWRvbmx5IGF1dGhlbnRpY2F0ZUNhbGxzOiB7IHJlc291cmNlOiBzdHJpbmc7IHRva2VuOiBzdHJpbmcgfVtdID0gW107XG5cdHJlYWRvbmx5IHNldENsaWVudEN1c3RvbWl6YXRpb25zQ2FsbHM6IHsgY2xpZW50SWQ6IHN0cmluZzsgY3VzdG9taXphdGlvbnM6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSB9W10gPSBbXTtcblx0cmVhZG9ubHkgc2V0Q2xpZW50VG9vbHNDYWxsczogeyBjbGllbnRJZDogc3RyaW5nOyB0b29sczogcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSB9W10gPSBbXTtcblx0cmVhZG9ubHkgcmVtb3ZlQWN0aXZlQ2xpZW50Q2FsbHM6IHsgY2xpZW50SWQ6IHN0cmluZyB9W10gPSBbXTtcblx0cmVhZG9ubHkgY2xpZW50VG9vbENhbGxDb21wbGV0ZUNhbGxzOiB7IHNlc3Npb246IFVSSTsgY2hhdDogVVJJOyB0b29sQ2FsbElkOiBzdHJpbmc7IHJlc3VsdDogVG9vbENhbGxSZXN1bHQgfVtdID0gW107XG5cdHJlYWRvbmx5IHRydW5jYXRlU2Vzc2lvbkNhbGxzOiB7IHNlc3Npb246IFVSSTsgdHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGNoYXQ6IFVSSSB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0LyoqIENvbmZpZ3VyYWJsZSByZXR1cm4gdmFsdWUgZm9yIGdldEN1c3RvbWl6YXRpb25zLiAqL1xuXHRjdXN0b21pemF0aW9uczogQ3VzdG9taXphdGlvbltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlID0gdGhpcy5fb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZS5ldmVudDtcblx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zPzogKHNlc3Npb246IFVSSSkgPT4gUHJvbWlzZTxyZWFkb25seSBDdXN0b21pemF0aW9uW10+O1xuXG5cdC8qKlxuXHQgKiBDb25maWd1cmFibGUgc2Vzc2lvbiBoaXN0b3J5LiBUZXN0cyBjb25zdHJ1Y3Qge0BsaW5rIElIaXN0b3J5UmVjb3JkfVxuXHQgKiBlbnRyaWVzICh0aGUgYWdlbnQtaW50ZXJuYWwgaW50ZXJtZWRpYXRlIHNoYXBlKSBhbmQgdGhlIG1vY2sgY29udmVydHNcblx0ICogdGhlbSB0byB7QGxpbmsgVHVybn1zIG9uIGRlbWFuZC4gU3ViYWdlbnQgVVJJcyBhcmUgcm91dGVkIHRvIGZpbHRlcmVkXG5cdCAqIHN1YmFnZW50IHR1cm5zIHZpYSB7QGxpbmsgYnVpbGRTdWJhZ2VudFR1cm5zRnJvbUhpc3Rvcnl9LlxuXHQgKi9cblx0c2Vzc2lvbk1lc3NhZ2VzOiBJSGlzdG9yeVJlY29yZFtdID0gW107XG5cdC8qKiBVc2FnZSBzdGFtcGVkIG9udG8gZXZlcnkgcmVjb25zdHJ1Y3RlZCB0dXJuIChlLmcuIGFuIEF1dG8tbW9kZWwgc3R1YikuICovXG5cdHR1cm5Vc2FnZU92ZXJyaWRlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0LyoqIE9wdGlvbmFsIG92ZXJyaWRlcyBhcHBsaWVkIHRvIHNlc3Npb24gbWV0YWRhdGEgZnJvbSBsaXN0U2Vzc2lvbnMuICovXG5cdHNlc3Npb25NZXRhZGF0YU92ZXJyaWRlczogUGFydGlhbDxPbWl0PElBZ2VudFNlc3Npb25NZXRhZGF0YSwgJ3Nlc3Npb24nPj4gPSB7fTtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBpZDogQWdlbnRQcm92aWRlciA9ICdtb2NrJykgeyB9XG5cblx0Z2V0RGVzY3JpcHRvcigpOiBJQWdlbnREZXNjcmlwdG9yIHtcblx0XHRyZXR1cm4geyBwcm92aWRlcjogdGhpcy5pZCwgZGlzcGxheU5hbWU6IGBBZ2VudCAke3RoaXMuaWR9YCwgZGVzY3JpcHRpb246IGBUZXN0ICR7dGhpcy5pZH0gYWdlbnRgIH07XG5cdH1cblxuXHRnZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YVtdIHtcblx0XHRpZiAodGhpcy5pZCA9PT0gJ2NvcGlsb3QnKSB7XG5cdFx0XHRyZXR1cm4gW3sgcmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWIuY29tJywgYXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbi9vYXV0aCddLCByZXF1aXJlZDogdHJ1ZSB9XTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0c2V0TW9kZWxzKG1vZGVsczogcmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbHMuc2V0KG1vZGVscywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGFzeW5jIGxpc3RTZXNzaW9ucygpOiBQcm9taXNlPElBZ2VudFNlc3Npb25NZXRhZGF0YVtdPiB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZXNzaW9ucy52YWx1ZXMoKV0ubWFwKHMgPT4gKHsgc2Vzc2lvbjogcywgc3RhcnRUaW1lOiBEYXRlLm5vdygpLCBtb2RpZmllZFRpbWU6IERhdGUubm93KCksIHByb2plY3Q6IG1vY2tQcm9qZWN0KHRoaXMuaWQpLCAuLi50aGlzLnNlc3Npb25NZXRhZGF0YU92ZXJyaWRlcyB9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25zLmhhcyhBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyBzZXNzaW9uLCBzdGFydFRpbWU6IERhdGUubm93KCksIG1vZGlmaWVkVGltZTogRGF0ZS5ub3coKSwgcHJvamVjdDogbW9ja1Byb2plY3QodGhpcy5pZCksIC4uLnRoaXMuc2Vzc2lvbk1ldGFkYXRhT3ZlcnJpZGVzIH07XG5cdH1cblxuXHQvKiogT3B0aW9uYWwgb3ZlcnJpZGUgZm9yIHRoZSB3b3JraW5nIGRpcmVjdG9yeSByZXR1cm5lZCBieSBjcmVhdGVTZXNzaW9uLiAqL1xuXHRyZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogV2hlbiBzZXQsIHtAbGluayBzZW5kTWVzc2FnZX0gcmVqZWN0cyB3aXRoIHRoaXMgZXJyb3IgYWZ0ZXIgcmVjb3JkaW5nIHRoZVxuXHQgKiBjYWxsIFx1MjAxNCB1c2VkIHRvIHNpbXVsYXRlIGEgZmFpbGVkIGZpcnN0LXR1cm4gbWF0ZXJpYWxpemF0aW9uIChlLmcuIHdvcmt0cmVlXG5cdCAqIG9yIGJyYW5jaCBzZXR1cCB0aHJvd2luZykuXG5cdCAqL1xuXHRzZW5kTWVzc2FnZUVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0YXN5bmMgY3JlYXRlU2Vzc2lvbihjb25maWc/OiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVTZXNzaW9uUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNvbmZpZz8uc2Vzc2lvbiA/PyBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIGAke3RoaXMuaWR9LXNlc3Npb24tJHt0aGlzLl9uZXh0SWQrK31gKTtcblx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQocmF3SWQsIHNlc3Npb24pO1xuXHRcdHJldHVybiB7IHNlc3Npb24sIHByb2plY3Q6IG1vY2tQcm9qZWN0KHRoaXMuaWQpLCByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IHRoaXMucmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5IH07XG5cdH1cblxuXHRhc3luYyByZXNvbHZlU2Vzc2lvbkNvbmZpZyhwYXJhbXM6IElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zKTogUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4ge1xuXHRcdHJldHVybiB7IHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSwgdmFsdWVzOiBwYXJhbXMuY29uZmlnID8/IHt9IH07XG5cdH1cblxuXHRhc3luYyBzZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMoX3BhcmFtczogSUFnZW50U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQ+IHtcblx0XHRyZXR1cm4geyBpdGVtczogW10gfTtcblx0fVxuXG5cdGFzeW5jIHNlbmRNZXNzYWdlKHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCBwcm9tcHQ6IHN0cmluZywgYXR0YWNobWVudHM/OiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdLCB0dXJuSWQ/OiBzdHJpbmcsIHNlbmRlckNsaWVudElkPzogc3RyaW5nLCBjbGllbnRUeXBlID0gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2FsbCA9IHtcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRwcm9tcHQsXG5cdFx0XHRhdHRhY2htZW50cyxcblx0XHRcdGNoYXQsXG5cdFx0XHQuLi4oc2VuZGVyQ2xpZW50SWQgPyB7IHNlbmRlckNsaWVudElkIH0gOiB7fSksXG5cdFx0XHQuLi4oY2xpZW50VHlwZSAhPT0gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duID8geyBjbGllbnRUeXBlIH0gOiB7fSksXG5cdFx0fTtcblx0XHR0aGlzLnNlbmRNZXNzYWdlQ2FsbHMucHVzaChjYWxsKTtcblx0XHR0aGlzLl9vbkRpZFNlbmRNZXNzYWdlLmZpcmUoY2FsbCk7XG5cdFx0aWYgKHR1cm5JZCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlVHVybklkcy5zZXQodXJpS2V5KHNlc3Npb24pLCB0dXJuSWQpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zZW5kTWVzc2FnZUVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnNlbmRNZXNzYWdlRXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0c2V0UGVuZGluZ01lc3NhZ2VzKGNoYXQ6IFVSSSwgc3RlZXJpbmdNZXNzYWdlOiBQZW5kaW5nTWVzc2FnZSB8IHVuZGVmaW5lZCwgcXVldWVkTWVzc2FnZXM6IHJlYWRvbmx5IFBlbmRpbmdNZXNzYWdlW10pOiB2b2lkIHtcblx0XHR0aGlzLnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzLnB1c2goeyBjaGF0LCBzdGVlcmluZ01lc3NhZ2UsIHF1ZXVlZE1lc3NhZ2VzIH0pO1xuXHR9XG5cblx0cmVhZG9ubHkgb25TZXNzaW9uQ29uZmlnQ2hhbmdlZENhbGxzOiB7IHNlc3Npb246IFVSSTsgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9W10gPSBbXTtcblx0b25TZXNzaW9uQ29uZmlnQ2hhbmdlZChzZXNzaW9uOiBVUkksIHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHR0aGlzLm9uU2Vzc2lvbkNvbmZpZ0NoYW5nZWRDYWxscy5wdXNoKHsgc2Vzc2lvbiwgdmFsdWVzIH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Y29uc3Qgc3ViYWdlbnRJbmZvID0gcGFyc2VTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvbik7XG5cdFx0aWYgKHN1YmFnZW50SW5mbykge1xuXHRcdFx0cmV0dXJuIGJ1aWxkU3ViYWdlbnRUdXJuc0Zyb21IaXN0b3J5KHRoaXMuc2Vzc2lvbk1lc3NhZ2VzLCBzdWJhZ2VudEluZm8udG9vbENhbGxJZCwgc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0Y29uc3QgdHVybnMgPSBidWlsZFR1cm5zRnJvbUhpc3RvcnkodGhpcy5zZXNzaW9uTWVzc2FnZXMpO1xuXHRcdGlmICh0aGlzLnR1cm5Vc2FnZU92ZXJyaWRlKSB7XG5cdFx0XHRyZXR1cm4gdHVybnMubWFwKHR1cm4gPT4gKHsgLi4udHVybiwgdXNhZ2U6IHRoaXMudHVyblVzYWdlT3ZlcnJpZGUgfSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHVybnM7XG5cdH1cblxuXHRhc3luYyBkaXNwb3NlU2Vzc2lvbihzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRpc3Bvc2VTZXNzaW9uQ2FsbHMucHVzaChzZXNzaW9uKTtcblx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKTtcblx0fVxuXG5cdGFzeW5jIHJlbGVhc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE5vbi1kZXN0cnVjdGl2ZTogcmVjb3JkIHRoZSBjYWxsIGJ1dCBrZWVwIHRoZSBzZXNzaW9uIGluIHRoZSBjYXRhbG9nXG5cdFx0Ly8gc28gYSBsYXRlciByZXN0b3JlL3Jlc3VtZSBzdGlsbCBmaW5kcyBpdHMgZHVyYWJsZSBkYXRhLlxuXHRcdHRoaXMucmVsZWFzZVNlc3Npb25DYWxscy5wdXNoKHNlc3Npb24pO1xuXHR9XG5cblx0YXN5bmMgYWJvcnRTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuYWJvcnRTZXNzaW9uQ2FsbHMucHVzaChzZXNzaW9uKTtcblx0fVxuXG5cdGFzeW5jIHRydW5jYXRlU2Vzc2lvbihzZXNzaW9uOiBVUkksIHR1cm5JZD86IHN0cmluZywgY2hhdD86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJ1bmNhdGVTZXNzaW9uQ2FsbHMucHVzaCh7IHNlc3Npb24sIHR1cm5JZCwgY2hhdCB9KTtcblx0fVxuXG5cdHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KHJlcXVlc3RJZDogc3RyaW5nLCBhcHByb3ZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLnB1c2goeyByZXF1ZXN0SWQsIGFwcHJvdmVkIH0pO1xuXHR9XG5cblx0cmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdCgpOiB2b2lkIHtcblx0XHQvLyBuby1vcCBmb3IgdGVzdHNcblx0fVxuXG5cdGFzeW5jIGNoYW5nZU1vZGVsKHNlc3Npb246IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uLCBjaGF0PzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jaGFuZ2VNb2RlbENhbGxzLnB1c2goeyBzZXNzaW9uLCBtb2RlbCwgY2hhdCB9KTtcblx0fVxuXG5cdGFzeW5jIGNoYW5nZUFnZW50KHNlc3Npb246IFVSSSwgYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBjaGF0PzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jaGFuZ2VBZ2VudENhbGxzLnB1c2goeyBzZXNzaW9uLCBhZ2VudCwgY2hhdCB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYW4gYWRkaXRpb25hbCAocGVlcikgY2hhdC4gVGhlIGJhc2UgbW9jayBpcyBzaW5nbGUtY2hhdCBhbmRcblx0ICogcmVqZWN0czsgbXVsdGktY2hhdCB0ZXN0IHN1YmNsYXNzZXMgb3ZlcnJpZGUgdGhpcy5cblx0ICovXG5cdGFzeW5jIGNyZWF0ZUNoYXQoX3Nlc3Npb246IFVSSSwgX2NoYXQ6IFVSSSwgX29wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEFnZW50ICR7dGhpcy5pZH0gZG9lcyBub3Qgc3VwcG9ydCBtdWx0aXBsZSBjaGF0c2ApO1xuXHR9XG5cblx0LyoqIERpc3Bvc2UgYW4gYWRkaXRpb25hbCAocGVlcikgY2hhdC4gT3ZlcnJpZGRlbiBieSBtdWx0aS1jaGF0IHN1YmNsYXNzZXMuICovXG5cdGFzeW5jIGRpc3Bvc2VDaGF0KF9zZXNzaW9uOiBVUkksIF9jaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdC8qKlxuXHQgKiBNYXAgYW4gYWxyZWFkeS1yZXNvbHZlZCBjaGF0IFVSSSB0byB0aGUgYChzZXNzaW9uLCBjaGF0KWAgcGFpciB0aGVcblx0ICogbW9jayByZWNvcmRzIGNhbGxzIGFnYWluc3QgKG1pcnJvcmluZyB0aGUgcmVhbCBhZ2VudHMpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdDogVVJJKTogeyBzZXNzaW9uOiBVUkk7IGNoYXQ6IFVSSSB9IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTW9jayBhZ2VudCBjaGF0IG9wZXJhdGlvbiByZXF1aXJlcyBhbiBBSFAgY2hhdCBVUkk6ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4geyBzZXNzaW9uOiBVUkkucGFyc2UocGFyc2VkLnNlc3Npb24pLCBjaGF0OiBVUkkucGFyc2UoY2hhdC50b1N0cmluZygpKSB9O1xuXHR9XG5cblx0cmVhZG9ubHkgY2hhdHM6IElBZ2VudENoYXRzID0ge1xuXHRcdGNyZWF0ZUNoYXQ6IChjaGF0VXJpOiBVUkksIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHZvaWQ+ID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdCB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdFVyaSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVDaGF0KHNlc3Npb24sIGNoYXQsIG9wdGlvbnMpO1xuXHRcdH0sXG5cdFx0Zm9yazogKGNoYXRVcmk6IFVSSSwgc291cmNlOiBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSwgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4gPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uLCBjaGF0IH0gPSB0aGlzLl9yZXNvbHZlQ2hhdFRhcmdldChjaGF0VXJpKTtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgY2hhdCwgeyAuLi5vcHRpb25zLCBmb3JrOiBzb3VyY2UgfSk7XG5cdFx0fSxcblx0XHRkaXNwb3NlQ2hhdDogKGNoYXRVcmk6IFVSSSk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uLCBjaGF0IH0gPSB0aGlzLl9yZXNvbHZlQ2hhdFRhcmdldChjaGF0VXJpKTtcblx0XHRcdHJldHVybiB0aGlzLmRpc3Bvc2VDaGF0KHNlc3Npb24sIGNoYXQpO1xuXHRcdH0sXG5cdFx0c2VuZE1lc3NhZ2U6IChjaGF0VXJpOiBVUkksIHByb21wdDogc3RyaW5nLCBfd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCwgYXR0YWNobWVudHM/OiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdLCB0dXJuSWQ/OiBzdHJpbmcsIHNlbmRlckNsaWVudElkPzogc3RyaW5nLCBjbGllbnRUeXBlPzogQWdlbnRIb3N0Q2xpZW50VHlwZSk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uLCBjaGF0IH0gPSB0aGlzLl9yZXNvbHZlQ2hhdFRhcmdldChjaGF0VXJpKTtcblx0XHRcdHJldHVybiB0aGlzLnNlbmRNZXNzYWdlKHNlc3Npb24sIGNoYXQsIHByb21wdCwgYXR0YWNobWVudHMsIHR1cm5JZCwgc2VuZGVyQ2xpZW50SWQsIGNsaWVudFR5cGUpO1xuXHRcdH0sXG5cdFx0YWJvcnQ6IChjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gdGhpcy5fcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5hYm9ydFNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fSxcblx0XHRjaGFuZ2VNb2RlbDogKGNoYXRVcmk6IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRjb25zdCB7IHNlc3Npb24sIGNoYXQgfSA9IHRoaXMuX3Jlc29sdmVDaGF0VGFyZ2V0KGNoYXRVcmkpO1xuXHRcdFx0cmV0dXJuIHRoaXMuY2hhbmdlTW9kZWwoc2Vzc2lvbiwgbW9kZWwsIGNoYXQpO1xuXHRcdH0sXG5cdFx0Y2hhbmdlQWdlbnQ6IChjaGF0VXJpOiBVUkksIGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uLCBjaGF0IH0gPSB0aGlzLl9yZXNvbHZlQ2hhdFRhcmdldChjaGF0VXJpKTtcblx0XHRcdHJldHVybiB0aGlzLmNoYW5nZUFnZW50KHNlc3Npb24sIGFnZW50LCBjaGF0KTtcblx0XHR9LFxuXHRcdGdldE1lc3NhZ2VzOiAoY2hhdDogVVJJKTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10+ID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmdldFNlc3Npb25NZXNzYWdlcyhjaGF0KTtcblx0XHR9LFxuXHR9O1xuXG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShyZXNvdXJjZTogc3RyaW5nLCB0b2tlbjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5hdXRoZW50aWNhdGVDYWxscy5wdXNoKHsgcmVzb3VyY2UsIHRva2VuIH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0Q3VzdG9taXphdGlvbnMoKTogQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5jdXN0b21pemF0aW9ucztcblx0fVxuXG5cdHN5bmNDbGllbnRDdXN0b21pemF0aW9ucyhzZXNzaW9uOiBVUkksIGNsaWVudElkOiBzdHJpbmcsIGN1c3RvbWl6YXRpb25zOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pOiBJU3luY2VkQ3VzdG9taXphdGlvbltdIHtcblx0XHR0aGlzLnNldENsaWVudEN1c3RvbWl6YXRpb25zQ2FsbHMucHVzaCh7IGNsaWVudElkLCBjdXN0b21pemF0aW9ucyB9KTtcblx0XHRjb25zdCByZXN1bHRzOiBJU3luY2VkQ3VzdG9taXphdGlvbltdID0gY3VzdG9taXphdGlvbnMubWFwKGMgPT4gKHtcblx0XHRcdGN1c3RvbWl6YXRpb246IHtcblx0XHRcdFx0Li4uYyxcblx0XHRcdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmN1c3RvbWl6YXRpb24pLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fVxuXG5cdGdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHNlc3Npb246IFVSSSwgY2xpZW50OiB7IHJlYWRvbmx5IGNsaWVudElkOiBzdHJpbmc7IHJlYWRvbmx5IGRpc3BsYXlOYW1lPzogc3RyaW5nIH0pOiBJQWN0aXZlQ2xpZW50IHtcblx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRsZXQgdG9vbHM6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10gPSBbXTtcblx0XHRsZXQgY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjbGllbnRJZDogY2xpZW50LmNsaWVudElkLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGNsaWVudC5kaXNwbGF5TmFtZSxcblx0XHRcdGdldCB0b29scygpIHsgcmV0dXJuIHRvb2xzOyB9LFxuXHRcdFx0c2V0IHRvb2xzKHZhbHVlOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdKSB7XG5cdFx0XHRcdHRvb2xzID0gdmFsdWU7XG5cdFx0XHRcdHNlbGYuc2V0Q2xpZW50VG9vbHNDYWxscy5wdXNoKHsgY2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCwgdG9vbHM6IHZhbHVlIH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldCBjdXN0b21pemF0aW9ucygpIHsgcmV0dXJuIGN1c3RvbWl6YXRpb25zOyB9LFxuXHRcdFx0c2V0IGN1c3RvbWl6YXRpb25zKHZhbHVlOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pIHtcblx0XHRcdFx0Y3VzdG9taXphdGlvbnMgPSB2YWx1ZTtcblx0XHRcdFx0c2VsZi5zeW5jQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvbiwgY2xpZW50LmNsaWVudElkLCBbLi4udmFsdWVdKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHJlbW92ZUFjdGl2ZUNsaWVudChfc2Vzc2lvbjogVVJJLCBjbGllbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5yZW1vdmVBY3RpdmVDbGllbnRDYWxscy5wdXNoKHsgY2xpZW50SWQgfSk7XG5cdH1cblxuXHRvbkNsaWVudFRvb2xDYWxsQ29tcGxldGUoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkksIHRvb2xDYWxsSWQ6IHN0cmluZywgcmVzdWx0OiBUb29sQ2FsbFJlc3VsdCk6IHZvaWQge1xuXHRcdHRoaXMuY2xpZW50VG9vbENhbGxDb21wbGV0ZUNhbGxzLnB1c2goeyBzZXNzaW9uLCBjaGF0LCB0b29sQ2FsbElkLCByZXN1bHQgfSk7XG5cdH1cblxuXHRhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdC8qKlxuXHQgKiBGaXJlcyBhbiB7QGxpbmsgQWdlbnRTaWduYWx9IG9uIHRoaXMgYWdlbnQuXG5cdCAqL1xuXHRmaXJlUHJvZ3Jlc3Moc2lnbmFsOiBBZ2VudFNpZ25hbCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoc2lnbmFsKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMb29rcyB1cCB0aGUgYWN0aXZlIHR1cm4gaWQgY2FwdHVyZWQgZnJvbSB0aGUgbW9zdCByZWNlbnRcblx0ICoge0BsaW5rIHNlbmRNZXNzYWdlfSBjYWxsIGZvciBhIGdpdmVuIHNlc3Npb24uIFJldHVybnMgYHVuZGVmaW5lZGAgaWZcblx0ICogdGhlIHNlc3Npb24gaGFzIG5vIGFjdGl2ZSB0dXJuIHlldCAoZS5nLiB0ZXN0cyB0aGF0IGZpcmUgcHJvZ3Jlc3Ncblx0ICogd2l0aG91dCBmaXJzdCBjYWxsaW5nIHNlbmRNZXNzYWdlKS5cblx0ICovXG5cdGdldEFjdGl2ZVR1cm5JZChzZXNzaW9uOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVUdXJuSWRzLmdldCh1cmlLZXkoc2Vzc2lvbikpO1xuXHR9XG5cblx0ZmlyZUN1c3RvbWl6YXRpb25zQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRTZW5kTWVzc2FnZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBXZWxsLWtub3duIFVSSSBvZiBhIHByZS1leGlzdGluZyBzZXNzaW9uIHNlZWRlZCBpbiB7QGxpbmsgU2NyaXB0ZWRNb2NrQWdlbnR9LlxuICogVGhpcyBzZXNzaW9uIGFwcGVhcnMgaW4gYGxpc3RTZXNzaW9ucygpYCBhbmQgaGFzIG1lc3NhZ2UgaGlzdG9yeSB2aWFcbiAqIGBnZXRTZXNzaW9uTWVzc2FnZXMoKWAsIGJ1dCB3YXMgbmV2ZXIgY3JlYXRlZCB0aHJvdWdoIHRoZSBzZXJ2ZXInc1xuICogYGhhbmRsZUNyZWF0ZVNlc3Npb25gLiBJdCBzaW11bGF0ZXMgYSBzZXNzaW9uIGZyb20gYSBwcmV2aW91cyBzZXJ2ZXJcbiAqIGxpZmV0aW1lIGZvciB0ZXN0aW5nIHRoZSByZXN0b3JlLW9uLXN1YnNjcmliZSBwYXRoLlxuICovXG5leHBvcnQgY29uc3QgUFJFX0VYSVNUSU5HX1NFU1NJT05fVVJJID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdwcmUtZXhpc3Rpbmctc2Vzc2lvbicpO1xuXG5leHBvcnQgY2xhc3MgU2NyaXB0ZWRNb2NrQWdlbnQgaW1wbGVtZW50cyBJQWdlbnQge1xuXHRyZWFkb25seSBpZDogQWdlbnRQcm92aWRlciA9ICdtb2NrJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlc3Npb25Qcm9ncmVzcyA9IG5ldyBFbWl0dGVyPEFnZW50U2lnbmFsPigpO1xuXHRyZWFkb25seSBvbkRpZFNlc3Npb25Qcm9ncmVzcyA9IHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10+KHRoaXMsIFt7IHByb3ZpZGVyOiAnbW9jaycsIGlkOiAnbW9jay1tb2RlbCcsIG5hbWU6ICdNb2NrIE1vZGVsJywgbWF4Q29udGV4dFdpbmRvdzogMTI4MDAwLCBzdXBwb3J0c1Zpc2lvbjogZmFsc2UgfV0pO1xuXHRyZWFkb25seSBtb2RlbHMgPSB0aGlzLl9tb2RlbHM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRwcml2YXRlIF9uZXh0SWQgPSAxO1xuXG5cdC8qKlxuXHQgKiBNZXNzYWdlIGhpc3RvcnkgZm9yIHRoZSBwcmUtZXhpc3Rpbmcgc2Vzc2lvbjogYSBzaW5nbGUgdXNlclx1MjE5MmFzc2lzdGFudFxuXHQgKiB0dXJuIHdpdGggYSB0b29sIGNhbGwuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmVFeGlzdGluZ01lc3NhZ2VzOiBJSGlzdG9yeVJlY29yZFtdID0gW1xuXHRcdHsgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIHNlc3Npb246IFBSRV9FWElTVElOR19TRVNTSU9OX1VSSSwgbWVzc2FnZUlkOiAnaC1tc2ctMScsIGNvbnRlbnQ6ICdXaGF0IGZpbGVzIGFyZSBoZXJlPycgfSxcblx0XHR7IHR5cGU6ICd0b29sX3N0YXJ0Jywgc2Vzc2lvbjogUFJFX0VYSVNUSU5HX1NFU1NJT05fVVJJLCB0b29sQ2FsbElkOiAnaC10Yy0xJywgdG9vbE5hbWU6ICdsaXN0X2ZpbGVzJywgZGlzcGxheU5hbWU6ICdMaXN0IEZpbGVzJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdMaXN0aW5nIGZpbGVzLi4uJyB9LFxuXHRcdHsgdHlwZTogJ3Rvb2xfY29tcGxldGUnLCBzZXNzaW9uOiBQUkVfRVhJU1RJTkdfU0VTU0lPTl9VUkksIHRvb2xDYWxsSWQ6ICdoLXRjLTEnLCByZXN1bHQ6IHsgcGFzdFRlbnNlTWVzc2FnZTogJ0xpc3RlZCBmaWxlcycsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnZmlsZTEudHNcXG5maWxlMi50cycgfV0sIHN1Y2Nlc3M6IHRydWUgfSBzYXRpc2ZpZXMgVG9vbENhbGxSZXN1bHQgfSxcblx0XHR7IHR5cGU6ICdtZXNzYWdlJywgcm9sZTogJ2Fzc2lzdGFudCcsIHNlc3Npb246IFBSRV9FWElTVElOR19TRVNTSU9OX1VSSSwgbWVzc2FnZUlkOiAnaC1tc2ctMicsIGNvbnRlbnQ6ICdIZXJlIGFyZSB0aGUgZmlsZXM6IGZpbGUxLnRzIGFuZCBmaWxlMi50cycgfSxcblx0XTtcblxuXHQvLyBUcmFjayBwZW5kaW5nIHBlcm1pc3Npb24gcmVxdWVzdHNcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Blcm1pc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIChhcHByb3ZlZDogYm9vbGVhbikgPT4gdm9pZD4oKTtcblx0Ly8gVHJhY2sgdGhlIGFjdGl2ZSB0dXJuIElEIHBlciBzZXNzaW9uLCBjYXB0dXJlZCBmcm9tIHNlbmRNZXNzYWdlKCkuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVR1cm5JZHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHQvLyBUcmFjayBwZW5kaW5nIGFib3J0IGNhbGxiYWNrcyBmb3Igc2xvdyByZXNwb25zZXNcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0Fib3J0cyA9IG5ldyBNYXA8c3RyaW5nLCAoKSA9PiB2b2lkPigpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdC8vIFNlZWQgdGhlIHByZS1leGlzdGluZyBzZXNzaW9uIHNvIGl0IGFwcGVhcnMgaW4gbGlzdFNlc3Npb25zKClcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoQWdlbnRTZXNzaW9uLmlkKFBSRV9FWElTVElOR19TRVNTSU9OX1VSSSksIFBSRV9FWElTVElOR19TRVNTSU9OX1VSSSk7XG5cblx0XHQvLyBBbGxvdyBpbnRlZ3JhdGlvbiB0ZXN0cyB0byBzZWVkIGFkZGl0aW9uYWwgcHJlLWV4aXN0aW5nIHNlc3Npb25zIGFjcm9zc1xuXHRcdC8vIHNlcnZlciByZXN0YXJ0cyB2aWEgZW52IHZhci4gVGhlIHZhbHVlIGlzIGEgY29tbWEtc2VwYXJhdGVkIGxpc3Qgb2Zcblx0XHQvLyBzZXNzaW9uIFVSSXMgKGUuZy4gYG1vY2s6Ly9wcmUtMSxtb2NrOi8vcHJlLTJgKS5cblx0XHRjb25zdCBzZWVkZWQgPSBwcm9jZXNzLmVudlsnVlNDT0RFX0FHRU5UX0hPU1RfTU9DS19TRUVEX1NFU1NJT05TJ107XG5cdFx0aWYgKHNlZWRlZCkge1xuXHRcdFx0Zm9yIChjb25zdCByYXcgb2Ygc2VlZGVkLnNwbGl0KCcsJykpIHtcblx0XHRcdFx0Y29uc3QgdHJpbW1lZCA9IHJhdy50cmltKCk7XG5cdFx0XHRcdGlmICghdHJpbW1lZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh0cmltbWVkKTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KEFnZW50U2Vzc2lvbi5pZCh1cmkpLCB1cmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldERlc2NyaXB0b3IoKTogSUFnZW50RGVzY3JpcHRvciB7XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXI6ICdtb2NrJywgZGlzcGxheU5hbWU6ICdNb2NrIEFnZW50JywgZGVzY3JpcHRpb246ICdTY3JpcHRlZCB0ZXN0IGFnZW50JyB9O1xuXHR9XG5cblx0Z2V0UHJvdGVjdGVkUmVzb3VyY2VzKCk6IElBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YVtdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhc3luYyBsaXN0U2Vzc2lvbnMoKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXT4ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fc2Vzc2lvbnMudmFsdWVzKCldLm1hcChzID0+ICh7XG5cdFx0XHRzZXNzaW9uOiBzLFxuXHRcdFx0c3RhcnRUaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0bW9kaWZpZWRUaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0cHJvamVjdDogbW9ja1Byb2plY3QodGhpcy5pZCksXG5cdFx0XHRzdW1tYXJ5OiBzLnRvU3RyaW5nKCkgPT09IFBSRV9FWElTVElOR19TRVNTSU9OX1VSSS50b1N0cmluZygpID8gJ1ByZS1leGlzdGluZyBzZXNzaW9uJyA6IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25zLmhhcyhBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHN0YXJ0VGltZTogRGF0ZS5ub3coKSxcblx0XHRcdG1vZGlmaWVkVGltZTogRGF0ZS5ub3coKSxcblx0XHRcdHByb2plY3Q6IG1vY2tQcm9qZWN0KHRoaXMuaWQpLFxuXHRcdFx0c3VtbWFyeTogc2Vzc2lvbi50b1N0cmluZygpID09PSBQUkVfRVhJU1RJTkdfU0VTU0lPTl9VUkkudG9TdHJpbmcoKSA/ICdQcmUtZXhpc3Rpbmcgc2Vzc2lvbicgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oY29uZmlnPzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyk6IFByb21pc2U8SUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjb25maWc/LnNlc3Npb24gPz8gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsIGBtb2NrLXNlc3Npb24tJHt0aGlzLl9uZXh0SWQrK31gKTtcblx0XHRjb25zdCByYXdJZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQocmF3SWQsIHNlc3Npb24pO1xuXHRcdHJldHVybiB7IHNlc3Npb24sIHByb2plY3Q6IG1vY2tQcm9qZWN0KHRoaXMuaWQpIH07XG5cdH1cblxuXHRhc3luYyByZXNvbHZlU2Vzc2lvbkNvbmZpZyhwYXJhbXM6IElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zKTogUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IHBhcmFtcy5jb25maWc/Lmlzb2xhdGlvbiA9PT0gJ2ZvbGRlcicgfHwgcGFyYW1zLmNvbmZpZz8uaXNvbGF0aW9uID09PSAnd29ya3RyZWUnID8gcGFyYW1zLmNvbmZpZy5pc29sYXRpb24gOiAnd29ya3RyZWUnO1xuXHRcdGNvbnN0IGJyYW5jaCA9IGlzb2xhdGlvbiA9PT0gJ3dvcmt0cmVlJyAmJiB0eXBlb2YgcGFyYW1zLmNvbmZpZz8uYnJhbmNoID09PSAnc3RyaW5nJyA/IHBhcmFtcy5jb25maWcuYnJhbmNoIDogJ21haW4nO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRpc29sYXRpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdJc29sYXRpb24nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdXaGVyZSB0aGUgbW9jayBhZ2VudCBzaG91bGQgbWFrZSBjaGFuZ2VzJyxcblx0XHRcdFx0XHRcdGVudW06IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10sXG5cdFx0XHRcdFx0XHRlbnVtTGFiZWxzOiBbJ0ZvbGRlcicsICdXb3JrdHJlZSddLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJ3dvcmt0cmVlJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJyYW5jaDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ0JyYW5jaCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Jhc2UgYnJhbmNoIHRvIHdvcmsgZnJvbScsXG5cdFx0XHRcdFx0XHRlbnVtOiBbJ21haW4nXSxcblx0XHRcdFx0XHRcdGVudW1MYWJlbHM6IFsnbWFpbiddLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJ21haW4nLFxuXHRcdFx0XHRcdFx0ZW51bUR5bmFtaWM6IGlzb2xhdGlvbiA9PT0gJ3dvcmt0cmVlJyxcblx0XHRcdFx0XHRcdHJlYWRPbmx5OiBpc29sYXRpb24gPT09ICdmb2xkZXInLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0dmFsdWVzOiB7IGlzb2xhdGlvbiwgYnJhbmNoIH0sXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHNlc3Npb25Db25maWdDb21wbGV0aW9ucyhwYXJhbXM6IElBZ2VudFNlc3Npb25Db25maWdDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0PiB7XG5cdFx0aWYgKHBhcmFtcy5wcm9wZXJ0eSAhPT0gJ2JyYW5jaCcpIHtcblx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSB9O1xuXHRcdH1cblx0XHRjb25zdCBxdWVyeSA9IHBhcmFtcy5xdWVyeT8udG9Mb3dlckNhc2UoKSA/PyAnJztcblx0XHRjb25zdCBicmFuY2hlcyA9IFsnbWFpbicsICdmZWF0dXJlL2NvbmZpZycsICdyZWxlYXNlJ10uZmlsdGVyKGJyYW5jaCA9PiBicmFuY2gudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSkpO1xuXHRcdHJldHVybiB7IGl0ZW1zOiBicmFuY2hlcy5tYXAoYnJhbmNoID0+ICh7IHZhbHVlOiBicmFuY2gsIGxhYmVsOiBicmFuY2ggfSkpIH07XG5cdH1cblxuXHRhc3luYyBzZW5kTWVzc2FnZShzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgcHJvbXB0OiBzdHJpbmcsIF9hdHRhY2htZW50cz86IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10sIHR1cm5JZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0dXJuSWQpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVR1cm5JZHMuc2V0KHVyaUtleShzZXNzaW9uKSwgdHVybklkKTtcblx0XHRcdHRoaXMuX2FjdGl2ZVR1cm5JZHMuc2V0KHVyaUtleShjaGF0KSwgdHVybklkKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBzZXNzaW9uU3RyLCB0dXJuSWQ6IHRpZCB9ID0gdGhpcy5fY3R4KGNoYXQpO1xuXHRcdHN3aXRjaCAocHJvbXB0KSB7XG5cdFx0XHRjYXNlICdoZWxsbyc6XG5cdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ0hlbGxvLCB3b3JsZCEnKSxcblx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ3VzZS10b29sJzpcblx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHQuLi5fdG9vbFN0YXJ0KGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLTEnLCAnZWNob190b29sJywgJ0VjaG8gVG9vbCcsICdSdW5uaW5nIGVjaG8gdG9vbC4uLicpLFxuXHRcdFx0XHRcdF90b29sQ29tcGxldGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtMScsIHsgcGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBlY2hvIHRvb2wnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2VjaG9lZCcgfV0sIHN1Y2Nlc3M6IHRydWUgfSksXG5cdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ1Rvb2wgZG9uZS4nKSxcblx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ2Vycm9yJzpcblx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRfZXJyb3IoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGVzdF9lcnJvcicsICdTb21ldGhpbmcgd2VudCB3cm9uZycpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ3Blcm1pc3Npb24nOiB7XG5cdFx0XHRcdC8vIEZpcmUgdG9vbF9zdGFydCB0byBjcmVhdGUgdGhlIHRvb2wsIHRoZW4gcGVuZGluZ19jb25maXJtYXRpb24gdG8gcmVxdWVzdCBjb25maXJtYXRpb25cblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgX3Rvb2xTdGFydChjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy1wZXJtLTEnLCAnc2hlbGwnLCAnU2hlbGwnLCAnUnVuIGEgdGVzdCBjb21tYW5kJykpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUocyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZShfcGVuZGluZ0NvbmZpcm1hdGlvbihjaGF0LCAndGMtcGVybS0xJywgJ1J1biBhIHRlc3QgY29tbWFuZCcsIHsgdG9vbElucHV0OiAnZWNobyB0ZXN0JywgY29uZmlybWF0aW9uVGl0bGU6ICdSdW4gYSB0ZXN0IGNvbW1hbmQnIH0pKTtcblx0XHRcdFx0fSkoKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnNldCgndGMtcGVybS0xJywgKGFwcHJvdmVkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGFwcHJvdmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0XHRfbWFya2Rvd24oY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAnQWxsb3dlZC4nKSxcblx0XHRcdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlICd3cml0ZS1maWxlJzoge1xuXHRcdFx0XHQvLyBGaXJlIHRvb2xfc3RhcnQgKyBwZW5kaW5nX2NvbmZpcm1hdGlvbiB3aXRoIHdyaXRlIHBlcm1pc3Npb24gZm9yIGEgcmVndWxhciBmaWxlIChzaG91bGQgYmUgYXV0by1hcHByb3ZlZClcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgX3Rvb2xTdGFydChjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy13cml0ZS0xJywgJ2NyZWF0ZScsICdDcmVhdGUgRmlsZScsICdDcmVhdGUgZmlsZScpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoX3BlbmRpbmdDb25maXJtYXRpb24oY2hhdCwgJ3RjLXdyaXRlLTEnLCAnV3JpdGUgc3JjL2FwcC50cycsIHsgcGVybWlzc2lvbktpbmQ6ICd3cml0ZScsIHBlcm1pc3Npb25QYXRoOiAnL3dvcmtzcGFjZS9zcmMvYXBwLnRzJyB9KSk7XG5cdFx0XHRcdFx0Ly8gQXV0by1hcHByb3ZlZCB3cml0ZXMgcmVzb2x2ZSBpbW1lZGlhdGVseSBcdTIwMTQgY29tcGxldGUgdGhlIHRvb2wgYW5kIHR1cm5cblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0X3Rvb2xDb21wbGV0ZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy13cml0ZS0xJywgeyBwYXN0VGVuc2VNZXNzYWdlOiAnV3JvdGUgZmlsZScsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnb2snIH1dLCBzdWNjZXNzOiB0cnVlIH0pLFxuXHRcdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0fSkoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgJ3dyaXRlLWVudic6IHtcblx0XHRcdFx0Ly8gRmlyZSB0b29sX3N0YXJ0ICsgcGVuZGluZ19jb25maXJtYXRpb24gd2l0aCB3cml0ZSBwZXJtaXNzaW9uIGZvciAuZW52IChzaG91bGQgYmUgYmxvY2tlZClcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgX3Rvb2xTdGFydChjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy13cml0ZS1lbnYtMScsICdjcmVhdGUnLCAnQ3JlYXRlIEZpbGUnLCAnQ3JlYXRlIGZpbGUnKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZShzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCg1KTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKF9wZW5kaW5nQ29uZmlybWF0aW9uKGNoYXQsICd0Yy13cml0ZS1lbnYtMScsICdXcml0ZSAuZW52JywgeyBwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlLy5lbnYnLCBjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIC5lbnYnIH0pKTtcblx0XHRcdFx0fSkoKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnNldCgndGMtd3JpdGUtZW52LTEnLCAoYXBwcm92ZWQpID0+IHtcblx0XHRcdFx0XHRpZiAoYXBwcm92ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0XHRcdF90b29sQ29tcGxldGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtd3JpdGUtZW52LTEnLCB7IHBhc3RUZW5zZU1lc3NhZ2U6ICdXcm90ZSAuZW52JywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdvaycgfV0sIHN1Y2Nlc3M6IHRydWUgfSksXG5cdFx0XHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAncnVuLXNhZmUtY29tbWFuZCc6IHtcblx0XHRcdFx0Ly8gRmlyZSB0b29sX3N0YXJ0ICsgcGVuZGluZ19jb25maXJtYXRpb24gd2l0aCBzaGVsbCBwZXJtaXNzaW9uIGZvciBhbiBhbGxvd2VkIGNvbW1hbmQgKHNob3VsZCBiZSBhdXRvLWFwcHJvdmVkKVxuXHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcyBvZiBfdG9vbFN0YXJ0KGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLXNoZWxsLTEnLCAnYmFzaCcsICdSdW4gQ29tbWFuZCcsICdSdW4gY29tbWFuZCcpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoX3BlbmRpbmdDb25maXJtYXRpb24oY2hhdCwgJ3RjLXNoZWxsLTEnLCAnbHMgLWxhJywgeyBwZXJtaXNzaW9uS2luZDogJ3NoZWxsJywgdG9vbElucHV0OiAnbHMgLWxhJyB9KSk7XG5cdFx0XHRcdFx0Ly8gQXV0by1hcHByb3ZlZCBzaGVsbCBjb21tYW5kcyByZXNvbHZlIGltbWVkaWF0ZWx5XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRcdF90b29sQ29tcGxldGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtc2hlbGwtMScsIHsgcGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBjb21tYW5kJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmaWxlMS50c1xcbmZpbGUyLnRzJyB9XSwgc3VjY2VzczogdHJ1ZSB9KSxcblx0XHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlICdydW4tZGFuZ2Vyb3VzLWNvbW1hbmQnOiB7XG5cdFx0XHRcdC8vIEZpcmUgdG9vbF9zdGFydCArIHBlbmRpbmdfY29uZmlybWF0aW9uIHdpdGggc2hlbGwgcGVybWlzc2lvbiBmb3IgYSBkZW5pZWQgY29tbWFuZCAoc2hvdWxkIHJlcXVpcmUgY29uZmlybWF0aW9uKVxuXHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcyBvZiBfdG9vbFN0YXJ0KGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLXNoZWxsLWRlbnktMScsICdiYXNoJywgJ1J1biBDb21tYW5kJywgJ1J1biBjb21tYW5kJykpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUocyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZShfcGVuZGluZ0NvbmZpcm1hdGlvbihjaGF0LCAndGMtc2hlbGwtZGVueS0xJywgJ3JtIC1yZiAvJywgeyBwZXJtaXNzaW9uS2luZDogJ3NoZWxsJywgdG9vbElucHV0OiAncm0gLXJmIC8nLCBjb25maXJtYXRpb25UaXRsZTogJ1J1biBpbiB0ZXJtaW5hbCcgfSkpO1xuXHRcdFx0XHR9KSgpO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuc2V0KCd0Yy1zaGVsbC1kZW55LTEnLCAoYXBwcm92ZWQpID0+IHtcblx0XHRcdFx0XHRpZiAoYXBwcm92ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0XHRcdF90b29sQ29tcGxldGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtc2hlbGwtZGVueS0xJywgeyBwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGNvbW1hbmQnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJycgfV0sIHN1Y2Nlc3M6IHRydWUgfSksXG5cdFx0XHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnb3JwaGFuLWNvbmZpcm1hdGlvbic6IHtcblx0XHRcdFx0Ly8gUmVncmVzc2lvbiBzY2VuYXJpbyBmb3IgYSBgcGVuZGluZ19jb25maXJtYXRpb25gIHRoYXRcblx0XHRcdFx0Ly8gYXJyaXZlcyB3aXRob3V0IGFuIGFjdGl2ZSBwcm90b2NvbCB0dXJuICh0aGUgc2Vzc2lvbiB3b3VsZFxuXHRcdFx0XHQvLyBvdGhlcndpc2UgaGFuZyBmb3JldmVyKS4gUmVwcm9kdWNlcyBhIGhvb2stdHJpZ2dlcmVkXG5cdFx0XHRcdC8vIGNvbnRpbnVhdGlvbiB0aGF0IHJ1bnMgKmFmdGVyKiB0aGUgcHJvdG9jb2wgdHVybiBoYXNcblx0XHRcdFx0Ly8gYWxyZWFkeSBjb21wbGV0ZWQ6XG5cdFx0XHRcdC8vICAgMS4gQSB0b29sIHJ1bnMgYW5kIHRoZSB0dXJuIGNvbXBsZXRlcyBcdTIwMTQgdGhlIHN0YXRlIG1hbmFnZXJcblx0XHRcdFx0Ly8gICAgICBubyBsb25nZXIgaGFzIGFuIGFjdGl2ZSB0dXJuLlxuXHRcdFx0XHQvLyAgIDIuIFRoZSBjb250aW51YXRpb24gZGlzcGF0Y2hlcyBhIG5ldyB0b29sIHdpdGggYW4gZW1wdHlcblx0XHRcdFx0Ly8gICAgICB0dXJuSWQgYW5kIGVtaXRzIGBwZW5kaW5nX2NvbmZpcm1hdGlvbmAgd2hpbGUgdGhlcmUgaXNcblx0XHRcdFx0Ly8gICAgICBubyBhY3RpdmUgdHVybi5cblx0XHRcdFx0Ly8gVGhlIHJlYWQgdGFyZ2V0cyBhIHBhdGggaW5zaWRlIHRoZSB3b3JraW5nIGRpcmVjdG9yeSwgc28gdGhlXG5cdFx0XHRcdC8vIGhvc3QgYXV0by1hcHByb3ZlcyBpdCBhbmQgY2FsbHMgYHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0YCxcblx0XHRcdFx0Ly8gd2hpY2ggcmVzb2x2ZXMgdGhlIGNhbGxiYWNrIGJlbG93IGFuZCBsZXRzIHRoZSBzZXNzaW9uXG5cdFx0XHRcdC8vIGNvbnRpbnVlLiBXaXRob3V0IHRoZSBmaXggdGhlIHNpZ25hbCBpcyBkcm9wcGVkLCB0aGUgY2FsbGJhY2tcblx0XHRcdFx0Ly8gbmV2ZXIgZmlyZXMsIGFuZCB0aGUgc2Vzc2lvbiBoYW5ncy5cblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgX3Rvb2xTdGFydChjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy1vcnBoYW4taW5pdGlhbCcsICdiYXNoJywgJ1J1biBDb21tYW5kJywgJ1J1biBjb21tYW5kJykpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUocyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZShfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLW9ycGhhbi1pbml0aWFsJywgeyBwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGNvbW1hbmQnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ29rJyB9XSwgc3VjY2VzczogdHJ1ZSB9KSk7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCg1KTtcblx0XHRcdFx0XHQvLyBDb21wbGV0ZSB0aGUgdHVybiBcdTIwMTQgdGhlIHN0YXRlIG1hbmFnZXIgY2xlYXJzIHRoZSBhY3RpdmUgdHVybi5cblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCkpO1xuXG5cdFx0XHRcdFx0Ly8gSG9vay10cmlnZ2VyZWQgY29udGludWF0aW9uOiBhIG5ldyB0b29sIHN0YXJ0cyB3aXRoIGFuXG5cdFx0XHRcdFx0Ly8gZW1wdHkgdHVybklkIGFuZCBgcGVuZGluZ19jb25maXJtYXRpb25gIGFycml2ZXMgd2hpbGVcblx0XHRcdFx0XHQvLyB0aGVyZSBpcyBubyBhY3RpdmUgdHVybi5cblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHMgb2YgX3Rvb2xTdGFydChjaGF0LCBzZXNzaW9uU3RyLCAnJywgJ3RjLW9ycGhhbicsICd2aWV3JywgJ1JlYWQnLCAnUmVhZCBmaWxlJykpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUocyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZShfcGVuZGluZ0NvbmZpcm1hdGlvbihjaGF0LCAndGMtb3JwaGFuJywgJ1JlYWQgZmlsZScsIHsgcGVybWlzc2lvbktpbmQ6ICdyZWFkJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlL2ZpbGUudHMnIH0pKTtcblx0XHRcdFx0fSkoKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnNldCgndGMtb3JwaGFuJywgKGFwcHJvdmVkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGFwcHJvdmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0XHRfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLW9ycGhhbicsIHsgcGFzdFRlbnNlTWVzc2FnZTogJ1JlYWQgZmlsZScsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnY29udGVudHMnIH1dLCBzdWNjZXNzOiB0cnVlIH0pLFxuXHRcdFx0XHRcdFx0XHRfbWFya2Rvd24oY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAnY29udGludWVkLWFmdGVyLWhvb2snKSxcblx0XHRcdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlICd3aXRoLXVzYWdlJzpcblx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRfbWFya2Rvd24oY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAnVXNhZ2UgcmVzcG9uc2UuJyksXG5cdFx0XHRcdFx0X3VzYWdlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgeyBpbnB1dFRva2VuczogMTAwLCBvdXRwdXRUb2tlbnM6IDUwLCBtb2RlbDogJ21vY2stbW9kZWwnLCBfbWV0YTogeyBjb3N0OiAwLjUgfSB9KSxcblx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ3dpdGgtcmVhc29uaW5nJzoge1xuXHRcdFx0XHRjb25zdCBpbml0aWFsUmVhc29uaW5nID0gX3JlYXNvbmluZyhjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICdMZXQgbWUgdGhpbmsnKTtcblx0XHRcdFx0Y29uc3QgcGFydElkID0gaW5pdGlhbFJlYXNvbmluZy5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0XG5cdFx0XHRcdFx0JiYgaGFzS2V5KGluaXRpYWxSZWFzb25pbmcuYWN0aW9uLnBhcnQsIHsgaWQ6IHRydWUgfSlcblx0XHRcdFx0XHQ/IGluaXRpYWxSZWFzb25pbmcuYWN0aW9uLnBhcnQuaWRcblx0XHRcdFx0XHQ6ICcnO1xuXHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdGluaXRpYWxSZWFzb25pbmcsXG5cdFx0XHRcdFx0X2FjdGlvbihjaGF0LCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmcsXG5cdFx0XHRcdFx0XHR0dXJuSWQ6IHRpZCxcblx0XHRcdFx0XHRcdHBhcnRJZCxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICcgYWJvdXQgdGhpcy4uLicsXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ1JlYXNvbmVkIHJlc3BvbnNlLicpLFxuXHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnd2l0aC10aXRsZSc6XG5cdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ1RpdGxlIHJlc3BvbnNlLicpLFxuXHRcdFx0XHRcdF90aXRsZUNoYW5nZWQoc2Vzc2lvbiwgc2Vzc2lvblN0ciwgTU9DS19BVVRPX1RJVExFKSxcblx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgJ3Nsb3cnOiB7XG5cdFx0XHRcdC8vIFNsb3cgcmVzcG9uc2UgZm9yIGNhbmNlbCB0ZXN0aW5nIFx1MjAxNCBmaXJlcyBkZWx0YSBhZnRlciBhIGxvbmcgZGVsYXlcblx0XHRcdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjdHggPSB0aGlzLl9jdHgoY2hhdCk7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRcdF9tYXJrZG93bihjaGF0LCBjdHguc2Vzc2lvblN0ciwgY3R4LnR1cm5JZCwgJ1Nsb3cgcmVzcG9uc2UuJyksXG5cdFx0XHRcdFx0XHRfaWRsZShjaGF0LCBjdHguc2Vzc2lvblN0ciwgY3R4LnR1cm5JZCksXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH0sIDUwMDApO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQWJvcnRzLnNldChzZXNzaW9uLnRvU3RyaW5nKCksICgpID0+IGNsZWFyVGltZW91dCh0aW1lcikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnY2xpZW50LXRvb2wnOiB7XG5cdFx0XHRcdC8vIEZpcmVzIHRvb2xfc3RhcnQgd2l0aCB0b29sQ2xpZW50SWQgZm9sbG93ZWQgYnkgcGVuZGluZ19jb25maXJtYXRpb25cblx0XHRcdFx0Ly8gKHdpdGhvdXQgY29uZmlybWF0aW9uVGl0bGUpIHRvIHNpbXVsYXRlIGEgY2xpZW50LXByb3ZpZGVkIHRvb2xcblx0XHRcdFx0Ly8gdGhhdCBpcyByZWFkeSBmb3IgZXhlY3V0aW9uLiBUaGUgcmVhbCBTREsgaGFuZGxlciBmaXJlc1xuXHRcdFx0XHQvLyB0b29sX3JlYWR5IG9uY2UgaXRzIGRlZmVycmVkIGlzIGluIHBsYWNlLlxuXHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHRcdC8vIENsaWVudCB0b29scyBkb24ndCBnZXQgYXV0by1yZWFkeSBcdTIwMTQgdG9vbFN0YXJ0IHdpdGggdG9vbENsaWVudElkIG9ubHkgZW1pdHMgdG9vbF9zdGFydFxuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoX2FjdGlvbihjaGF0LCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHRcdFx0dHVybklkOiB0aWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY2xpZW50LTEnLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICdydW5UZXN0cycsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUZXN0cycsXG5cdFx0XHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQtdG9vbCcgfSxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCg1KTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKF9wZW5kaW5nQ29uZmlybWF0aW9uKGNoYXQsICd0Yy1jbGllbnQtMScsICdSdW5uaW5nIHRlc3RzLi4uJywgeyB0b29sSW5wdXQ6ICd7fScgfSkpO1xuXHRcdFx0XHR9KSgpO1xuXHRcdFx0XHQvLyBUaGUgdG9vbCBzdGF5cyBwZW5kaW5nIFx1MjAxNCB0aGUgY2xpZW50IGlzIHJlc3BvbnNpYmxlIGZvciBkaXNwYXRjaGluZyB0b29sQ2FsbENvbXBsZXRlLlxuXHRcdFx0XHQvLyBPbmNlIGNvbXBsZXRlLCBmaXJlIGEgcmVzcG9uc2UgZGVsdGEgYW5kIGlkbGUuXG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5zZXQoJ3RjLWNsaWVudC0xJywgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0XHRfbWFya2Rvd24oY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAnQ2xpZW50IHRvb2wgZG9uZS4nKSxcblx0XHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnY2xpZW50LXRvb2wtd2l0aC1wZXJtaXNzaW9uJzoge1xuXHRcdFx0XHQvLyBGaXJlcyB0b29sX3N0YXJ0IHdpdGggdG9vbENsaWVudElkIGZvbGxvd2VkIGJ5IGEgcGVybWlzc2lvbiByZXF1ZXN0LlxuXHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoX2FjdGlvbihjaGF0LCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHRcdFx0dHVybklkOiB0aWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY2xpZW50LXBlcm0tMScsXG5cdFx0XHRcdFx0XHR0b29sTmFtZTogJ3J1blRlc3RzJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRlc3RzJyxcblx0XHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudC10b29sJyB9LFxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoX3BlbmRpbmdDb25maXJtYXRpb24oY2hhdCwgJ3RjLWNsaWVudC1wZXJtLTEnLCAnUnVuIHRlc3RzIG9uIHByb2plY3QnLCB7IGNvbmZpcm1hdGlvblRpdGxlOiAnQWxsb3cgUnVuIFRlc3RzPycgfSkpO1xuXHRcdFx0XHR9KSgpO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuc2V0KCd0Yy1jbGllbnQtcGVybS0xJywgKGFwcHJvdmVkKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGFwcHJvdmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdFx0XHRfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLWNsaWVudC1wZXJtLTEnLCB7IHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gdGVzdHMnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2FsbCBwYXNzZWQnIH1dLCBzdWNjZXNzOiB0cnVlIH0pLFxuXHRcdFx0XHRcdFx0XHRfbWFya2Rvd24oY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAnUGVybWlzc2lvbiBncmFudGVkLCB0b29sIGRvbmUuJyksXG5cdFx0XHRcdFx0XHRcdF9pZGxlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCksXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnc3ViYWdlbnQnOiB7XG5cdFx0XHRcdC8vIFNwYXducyBhIHN1YmFnZW50OiBwYXJlbnQgYHRhc2tgIHRvb2wgc3RhcnRzIChlbWl0cyBzdGFydCArXG5cdFx0XHRcdC8vIGF1dG8tcmVhZHkgYXMgYSBwYWlyKSwgdGhlbiBgc3ViYWdlbnRfc3RhcnRlZGAgY3JlYXRlcyB0aGVcblx0XHRcdFx0Ly8gY2hpbGQgc2Vzc2lvbiwgdGhlbiBhbiBpbm5lciB0b29sIHJ1bnMgaW4gdGhlIGNoaWxkIHNlc3Npb25cblx0XHRcdFx0Ly8gKHJvdXRlZCB2aWEgYHBhcmVudFRvb2xDYWxsSWRgKS5cblx0XHRcdFx0dGhpcy5fZmlyZVNlcXVlbmNlKFtcblx0XHRcdFx0XHQuLi5fdG9vbFN0YXJ0KGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLXRhc2stMScsICd0YXNrJywgJ1Rhc2snLCAnU3Bhd25pbmcgc3ViYWdlbnQnLCB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudEFnZW50TmFtZTogJ2V4cGxvcmUnLCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZScgfSksXG5cdFx0XHRcdFx0eyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQsIHRvb2xDYWxsSWQ6ICd0Yy10YXNrLTEnLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yYXRpb24gaGVscGVyJyB9LFxuXHRcdFx0XHRcdC4uLl90b29sU3RhcnQoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtaW5uZXItMScsICdlY2hvX3Rvb2wnLCAnRWNobyBUb29sJywgJ0lubmVyIHRvb2wgcnVubmluZy4uLicsIHsgcGFyZW50VG9vbENhbGxJZDogJ3RjLXRhc2stMScgfSksXG5cdFx0XHRcdFx0X3Rvb2xDb21wbGV0ZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0Yy1pbm5lci0xJywgeyBwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGlubmVyIHRvb2wnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2lubmVyLW9rJyB9XSwgc3VjY2VzczogdHJ1ZSB9LCAndGMtdGFzay0xJyksXG5cdFx0XHRcdFx0eyBraW5kOiAnc3ViYWdlbnRfY29tcGxldGVkJywgY2hhdCwgdG9vbENhbGxJZDogJ3RjLXRhc2stMScgfSxcblx0XHRcdFx0XHRfdG9vbENvbXBsZXRlKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ3RjLXRhc2stMScsIHsgcGFzdFRlbnNlTWVzc2FnZTogJ1N1YmFnZW50IGRvbmUnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ3Rhc2stb2snIH1dLCBzdWNjZXNzOiB0cnVlIH0pLFxuXHRcdFx0XHRcdF9tYXJrZG93bihjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICdTdWJhZ2VudCBmaW5pc2hlZC4nKSxcblx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGlmIChwcm9tcHQuc3RhcnRzV2l0aCgndGVybWluYWwtZWRpdDonKSkge1xuXHRcdFx0XHRcdC8vIFRlc3QgcHJvbXB0OiBzaW11bGF0ZSBhIHRlcm1pbmFsIGNvbW1hbmQgdGhhdCBlZGl0cyBhIGZpbGUgb24gZGlza1xuXHRcdFx0XHRcdC8vIHdpdGhvdXQgZW1pdHRpbmcgYW55IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQuIFRoZSB0ZXN0IHJlbGllcyBvbiB0aGVcblx0XHRcdFx0XHQvLyBnaXQtZHJpdmVuIGRpZmYgcGF0aCB0byBwaWNrIHRoaXMgdXAuIEZvcm1hdDogYHRlcm1pbmFsLWVkaXQ6PGFic1BhdGg+YC5cblx0XHRcdFx0XHRjb25zdCBmaWxlUGF0aCA9IHByb21wdC5zbGljZSgndGVybWluYWwtZWRpdDonLmxlbmd0aCk7XG5cdFx0XHRcdFx0dm9pZCAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIF90b29sU3RhcnQoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtdGVybS1lZGl0LTEnLCAnYmFzaCcsICdSdW4gQ29tbWFuZCcsICdFZGl0IGZpbGUgdmlhIHNoZWxsJykpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZShzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdFx0XHRcdFx0YXdhaXQgZnMud3JpdGVGaWxlKGZpbGVQYXRoLCAnZWRpdGVkLWZyb20tdGVybWluYWxcXG4nKTtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0XHRcdF90b29sQ29tcGxldGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkLCAndGMtdGVybS1lZGl0LTEnLCB7IHBhc3RUZW5zZU1lc3NhZ2U6ICdFZGl0ZWQgZmlsZScsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnb2snIH1dLCBzdWNjZXNzOiB0cnVlIH0pLFxuXHRcdFx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0fSkoKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gU3VyZmFjZSBmYWlsdXJlcyBkZXRlcm1pbmlzdGljYWxseSBcdTIwMTQgYW4gdW5oYW5kbGVkIHJlamVjdGlvblxuXHRcdFx0XHRcdFx0Ly8gd291bGQgbWFrZSB0aGUgdGVzdCBzdWl0ZSBmbGFreS5cblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0XHRcdF9tYXJrZG93bihjaGF0LCBzZXNzaW9uU3RyLCB0aWQsICd0ZXJtaW5hbC1lZGl0IGZhaWxlZDogJyArIChlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikpKSxcblx0XHRcdFx0XHRcdFx0X2lkbGUoY2hhdCwgc2Vzc2lvblN0ciwgdGlkKSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2ZpcmVTZXF1ZW5jZShbXG5cdFx0XHRcdFx0X21hcmtkb3duKGNoYXQsIHNlc3Npb25TdHIsIHRpZCwgJ1Vua25vd24gcHJvbXB0OiAnICsgcHJvbXB0KSxcblx0XHRcdFx0XHRfaWRsZShjaGF0LCBzZXNzaW9uU3RyLCB0aWQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0c2V0UGVuZGluZ01lc3NhZ2VzKGNoYXQ6IFVSSSwgc3RlZXJpbmdNZXNzYWdlOiBQZW5kaW5nTWVzc2FnZSB8IHVuZGVmaW5lZCwgX3F1ZXVlZE1lc3NhZ2VzOiByZWFkb25seSBQZW5kaW5nTWVzc2FnZVtdKTogdm9pZCB7XG5cdFx0Ly8gV2hlbiBzdGVlcmluZyBpcyBzZXQsIGNvbnN1bWUgaXQgb24gdGhlIG5leHQgdGlja1xuXHRcdGlmIChzdGVlcmluZ01lc3NhZ2UpIHtcblx0XHRcdHRpbWVvdXQoMjApLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHsga2luZDogJ3N0ZWVyaW5nX2NvbnN1bWVkJywgY2hhdDogaXNBaHBDaGF0Q2hhbm5lbChjaGF0LnRvU3RyaW5nKCkpID8gY2hhdCA6IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGNoYXQpKSwgaWQ6IHN0ZWVyaW5nTWVzc2FnZS5pZCB9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KF9zZXNzaW9uOiBVUkksIGNsaWVudDogeyByZWFkb25seSBjbGllbnRJZDogc3RyaW5nOyByZWFkb25seSBkaXNwbGF5TmFtZT86IHN0cmluZyB9KTogSUFjdGl2ZUNsaWVudCB7XG5cdFx0bGV0IHRvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdID0gW107XG5cdFx0bGV0IGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCxcblx0XHRcdGRpc3BsYXlOYW1lOiBjbGllbnQuZGlzcGxheU5hbWUsXG5cdFx0XHRnZXQgdG9vbHMoKSB7IHJldHVybiB0b29sczsgfSxcblx0XHRcdHNldCB0b29scyh2YWx1ZTogcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSkgeyB0b29scyA9IHZhbHVlOyB9LFxuXHRcdFx0Z2V0IGN1c3RvbWl6YXRpb25zKCkgeyByZXR1cm4gY3VzdG9taXphdGlvbnM7IH0sXG5cdFx0XHRzZXQgY3VzdG9taXphdGlvbnModmFsdWU6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSkgeyBjdXN0b21pemF0aW9ucyA9IHZhbHVlOyB9LFxuXHRcdH07XG5cdH1cblxuXHRyZW1vdmVBY3RpdmVDbGllbnQoKTogdm9pZCB7IH1cblxuXHRwcml2YXRlIGRpZENvbXBsZXRlVG9vbENhbGxzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0b25DbGllbnRUb29sQ2FsbENvbXBsZXRlKHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcsIHJlc3VsdDogVG9vbENhbGxSZXN1bHQpOiB2b2lkIHtcblx0XHQvLyBUaGUgbW9jaydzIGV2ZW50IG1vZGVsIGlzIGNoYXQtY2hhbm5lbCBvcmllbnRlZCAoc2VuZE1lc3NhZ2UgZmlyZXNcblx0XHQvLyBldmVyeSB0dXJuIHNpZ25hbCBvbiB0aGUgY2hhdCBVUkkpLiBFbWl0IHRoZSBjb21wbGV0aW9uIG9uIHRoZSBjaGF0XG5cdFx0Ly8gY2hhbm5lbCB0aGUgdG9vbCB3YXMgc3RhcnRlZCBvbiBzbyB0aGUgcGFya2VkIHR1cm4gY2FsbGJhY2sgXHUyMDE0IHdoaWNoXG5cdFx0Ly8gY2FwdHVyZWQgdGhhdCBzYW1lIGNoYXQgVVJJIFx1MjAxNCByZXNvbHZlcyBvbiB0aGUgcmlnaHQgY2hhbm5lbC5cblx0XHRjb25zdCBrZXkgPSBgJHtjaGF0LnRvU3RyaW5nKCl9OiR7dG9vbENhbGxJZH1gO1xuXHRcdGlmICh0aGlzLmRpZENvbXBsZXRlVG9vbENhbGxzLmhhcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZGlkQ29tcGxldGVUb29sQ2FsbHMuYWRkKGtleSk7XG5cdFx0Ly8gRmlyZSB0b29sX2NvbXBsZXRlIGFjdGlvbiBzaWduYWwgYW5kIHJlc29sdmUgYW55IHBlbmRpbmcgY2FsbGJhY2suXG5cdFx0Y29uc3QgeyBzZXNzaW9uU3RyLCB0dXJuSWQgfSA9IHRoaXMuX2N0eChjaGF0KTtcblx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKF90b29sQ29tcGxldGUoY2hhdCwgc2Vzc2lvblN0ciwgdHVybklkLCB0b29sQ2FsbElkLCByZXN1bHQpKTtcblx0XHRjb25zdCBjYWxsYmFjayA9IHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5nZXQodG9vbENhbGxJZCk7XG5cdFx0aWYgKGNhbGxiYWNrKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdFx0Y2FsbGJhY2sodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNlc3Npb246IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Y29uc3Qgc3ViYWdlbnRJbmZvID0gcGFyc2VTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvbik7XG5cdFx0aWYgKHN1YmFnZW50SW5mbykge1xuXHRcdFx0cmV0dXJuIGJ1aWxkU3ViYWdlbnRUdXJuc0Zyb21IaXN0b3J5KHRoaXMuX3ByZUV4aXN0aW5nTWVzc2FnZXMsIHN1YmFnZW50SW5mby50b29sQ2FsbElkLCBzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHQvLyBSZXN0b3JlIGFkZHJlc3NlcyB0aGUgZGVmYXVsdCBjaGF0IGJ5IGl0cyBjaGFubmVsIFVSSTsgbm9ybWFsaXplIGl0XG5cdFx0Ly8gYmFjayB0byB0aGUgc2Vzc2lvbiBVUkkgKG1pcnJvcmluZyB0aGUgcmVhbCBhZ2VudHMnIGdldFNlc3Npb25NZXNzYWdlcykuXG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGF0VXJpKHNlc3Npb24pO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBwYXJzZWQgJiYgYnVpbGREZWZhdWx0Q2hhdFVyaShwYXJzZWQuc2Vzc2lvbikgPT09IHNlc3Npb24udG9TdHJpbmcoKSA/IFVSSS5wYXJzZShwYXJzZWQuc2Vzc2lvbikgOiBzZXNzaW9uO1xuXHRcdGlmIChub3JtYWxpemVkLnRvU3RyaW5nKCkgPT09IFBSRV9FWElTVElOR19TRVNTSU9OX1VSSS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gYnVpbGRUdXJuc0Zyb21IaXN0b3J5KHRoaXMuX3ByZUV4aXN0aW5nTWVzc2FnZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRhc3luYyBkaXNwb3NlU2Vzc2lvbihzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKTtcblx0fVxuXG5cdGFzeW5jIGFib3J0U2Vzc2lvbihzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjYWxsYmFjayA9IHRoaXMuX3BlbmRpbmdBYm9ydHMuZ2V0KHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0aWYgKGNhbGxiYWNrKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQWJvcnRzLmRlbGV0ZShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y2FsbGJhY2soKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjaGFuZ2VNb2RlbChfc2Vzc2lvbjogVVJJLCBfbW9kZWw6IE1vZGVsU2VsZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTW9jayBhZ2VudCBkb2Vzbid0IHRyYWNrIG1vZGVsIHN0YXRlXG5cdH1cblxuXHQvKipcblx0ICogTWFwIGFuIGFscmVhZHktcmVzb2x2ZWQgY2hhdCBVUkkgdG8gdGhlIGAoc2Vzc2lvbiwgY2hhdClgIHBhaXIgdGhlXG5cdCAqIHNjcmlwdGVkIG1vY2sncyBwZXItY2hhdCBjb250ZXh0IGlzIGtleWVkIGJ5LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUNoYXRUYXJnZXQoY2hhdDogVVJJKTogeyBzZXNzaW9uOiBVUkk7IGNoYXQ6IFVSSSB9IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYXRVcmkoY2hhdCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2NyaXB0ZWQgbW9jayBjaGF0IG9wZXJhdGlvbiByZXF1aXJlcyBhbiBBSFAgY2hhdCBVUkk6ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4geyBzZXNzaW9uOiBVUkkucGFyc2UocGFyc2VkLnNlc3Npb24pLCBjaGF0OiBVUkkucGFyc2UoY2hhdC50b1N0cmluZygpKSB9O1xuXHR9XG5cblx0cmVhZG9ubHkgY2hhdHM6IElBZ2VudENoYXRzID0ge1xuXHRcdGNyZWF0ZUNoYXQ6IChfY2hhdDogVVJJLCBfb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4gPT4ge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTY3JpcHRlZCBtb2NrIGFnZW50IGRvZXMgbm90IHN1cHBvcnQgbXVsdGlwbGUgY2hhdHMnKTtcblx0XHR9LFxuXHRcdGZvcms6IChfY2hhdDogVVJJLCBfc291cmNlOiBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSwgX29wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHZvaWQ+ID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU2NyaXB0ZWQgbW9jayBhZ2VudCBkb2VzIG5vdCBzdXBwb3J0IGNoYXQgZm9ya2luZycpO1xuXHRcdH0sXG5cdFx0ZGlzcG9zZUNoYXQ6IChfY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fSxcblx0XHRzZW5kTWVzc2FnZTogKGNoYXRVcmk6IFVSSSwgcHJvbXB0OiBzdHJpbmcsIF93b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkLCBhdHRhY2htZW50cz86IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10sIHR1cm5JZD86IHN0cmluZywgX3NlbmRlckNsaWVudElkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRjb25zdCB7IHNlc3Npb24sIGNoYXQgfSA9IHRoaXMuX3Jlc29sdmVDaGF0VGFyZ2V0KGNoYXRVcmkpO1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZE1lc3NhZ2Uoc2Vzc2lvbiwgY2hhdCwgcHJvbXB0LCBhdHRhY2htZW50cywgdHVybklkKTtcblx0XHR9LFxuXHRcdGFib3J0OiAoY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IHRoaXMuX3Jlc29sdmVDaGF0VGFyZ2V0KGNoYXQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuYWJvcnRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH0sXG5cdFx0Y2hhbmdlTW9kZWw6IChjaGF0OiBVUkksIG1vZGVsOiBNb2RlbFNlbGVjdGlvbik6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSB0aGlzLl9yZXNvbHZlQ2hhdFRhcmdldChjaGF0KTtcblx0XHRcdHJldHVybiB0aGlzLmNoYW5nZU1vZGVsKHNlc3Npb24sIG1vZGVsKTtcblx0XHR9LFxuXHRcdGNoYW5nZUFnZW50OiAoX2NoYXQ6IFVSSSwgX2FnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Ly8gU2NyaXB0ZWQgbW9jayBkb2VzIG5vdCB0cmFjayBhZ2VudCBzZWxlY3Rpb24uXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fSxcblx0XHRnZXRNZXNzYWdlczogKGNoYXQ6IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRTZXNzaW9uTWVzc2FnZXMoY2hhdCk7XG5cdFx0fSxcblx0fTtcblxuXHRhc3luYyB0cnVuY2F0ZVNlc3Npb24oX3Nlc3Npb246IFVSSSwgX3R1cm5JZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE1vY2sgYWdlbnQgYWNjZXB0cyB0cnVuY2F0aW9uIHdpdGhvdXQgc2lkZSBlZmZlY3RzXG5cdH1cblxuXHRyZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdCh0b29sQ2FsbElkOiBzdHJpbmcsIGFwcHJvdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FsbGJhY2sgPSB0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGlmIChjYWxsYmFjaykge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdGNhbGxiYWNrKGFwcHJvdmVkKTtcblx0XHR9XG5cdH1cblxuXHRyZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0KCk6IHZvaWQge1xuXHRcdC8vIG5vLW9wIGZvciB0ZXN0c1xuXHR9XG5cblx0YXN5bmMgYXV0aGVudGljYXRlKF9yZXNvdXJjZTogc3RyaW5nLCBfdG9rZW46IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlcyBhIHNlcXVlbmNlIG9mIHtAbGluayBBZ2VudFNpZ25hbH1zIHdpdGggc3RhZ2dlcmVkIDEwIG1zIGRlbGF5c1xuXHQgKiBzbyB0aGUgc3RhdGUgbWFuYWdlciBwcm9jZXNzZXMgdGhlbSBpbiBvcmRlci5cblx0ICovXG5cdHByaXZhdGUgX2ZpcmVTZXF1ZW5jZShzaWduYWxzOiBBZ2VudFNpZ25hbFtdKTogdm9pZCB7XG5cdFx0bGV0IGRlbGF5ID0gMDtcblx0XHRmb3IgKGNvbnN0IHNpZ25hbCBvZiBzaWduYWxzKSB7XG5cdFx0XHRkZWxheSArPSAxMDtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZShzaWduYWwpLCBkZWxheSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIEJ1aWxkcyB0aGUgc2Vzc2lvbi1zdHJpbmcgKyB0dXJuSWQgY29udGV4dCBmb3Igc2lnbmFsIGNvbnN0cnVjdGlvbi4gKi9cblx0cHJpdmF0ZSBfY3R4KHNlc3Npb246IFVSSSk6IHsgc2Vzc2lvblN0cjogc3RyaW5nOyB0dXJuSWQ6IHN0cmluZyB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvblN0cjogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0dHVybklkOiB0aGlzLl9hY3RpdmVUdXJuSWRzLmdldCh1cmlLZXkoc2Vzc2lvbikpID8/ICdtb2NrLXR1cm4nLFxuXHRcdH07XG5cdH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFRlc3QtZXZlbnQgaGVscGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNpZ25hbCBmYWN0b3J5IGhlbHBlcnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmxldCBfbW9ja1BhcnRJZENvdW50ZXIgPSAwO1xuXG4vKiogV3JhcHMgYSBzZXNzaW9uIGFjdGlvbiBpbnRvIGFuIHtAbGluayBJQWdlbnRBY3Rpb25TaWduYWx9LiAqL1xuZnVuY3Rpb24gX2FjdGlvbihzZXNzaW9uOiBVUkksIGFjdGlvbjogaW1wb3J0KCcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnKS5TZXNzaW9uQWN0aW9uIHwgaW1wb3J0KCcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnKS5DaGF0QWN0aW9uLCBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nKTogSUFnZW50QWN0aW9uU2lnbmFsIHtcblx0cmV0dXJuIHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBzZXNzaW9uLCBhY3Rpb24sIHBhcmVudFRvb2xDYWxsSWQgfTtcbn1cblxuLyoqIENyZWF0ZXMgYSBtYXJrZG93biB7QGxpbmsgUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bn0gcmVzcG9uc2UgcGFydCBzaWduYWwuICovXG5mdW5jdGlvbiBfbWFya2Rvd24oc2Vzc2lvbjogVVJJLCBzZXNzaW9uU3RyOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcsIHBhcmVudFRvb2xDYWxsSWQ/OiBzdHJpbmcpOiBJQWdlbnRBY3Rpb25TaWduYWwge1xuXHRyZXR1cm4gX2FjdGlvbihzZXNzaW9uLCB7XG5cdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdHR1cm5JZCxcblx0XHRwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiBgbW9jay1tZC0keysrX21vY2tQYXJ0SWRDb3VudGVyfWAsIGNvbnRlbnQgfSxcblx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG59XG5cbi8qKiBDcmVhdGVzIGEgcmVhc29uaW5nIHtAbGluayBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZ30gcmVzcG9uc2UgcGFydCBzaWduYWwuICovXG5mdW5jdGlvbiBfcmVhc29uaW5nKHNlc3Npb246IFVSSSwgc2Vzc2lvblN0cjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgY29udGVudDogc3RyaW5nKTogSUFnZW50QWN0aW9uU2lnbmFsIHtcblx0cmV0dXJuIF9hY3Rpb24oc2Vzc2lvbiwge1xuXHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHR0dXJuSWQsXG5cdFx0cGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZywgaWQ6IGBtb2NrLXJzLSR7KytfbW9ja1BhcnRJZENvdW50ZXJ9YCwgY29udGVudCB9LFxuXHR9KTtcbn1cblxuLyoqIENyZWF0ZXMgYSB7QGxpbmsgQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlfSBzaWduYWwuICovXG5mdW5jdGlvbiBfaWRsZShzZXNzaW9uOiBVUkksIHNlc3Npb25TdHI6IHN0cmluZywgdHVybklkOiBzdHJpbmcpOiBJQWdlbnRBY3Rpb25TaWduYWwge1xuXHRyZXR1cm4gX2FjdGlvbihzZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkLCBkdXJhdGlvbjogMSB9KTtcbn1cblxuLyoqIENyZWF0ZXMgYSB7QGxpbmsgQWN0aW9uVHlwZS5DaGF0RXJyb3J9IHNpZ25hbC4gKi9cbmZ1bmN0aW9uIF9lcnJvcihzZXNzaW9uOiBVUkksIHNlc3Npb25TdHI6IHN0cmluZywgdHVybklkOiBzdHJpbmcsIGVycm9yVHlwZTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcsIHN0YWNrPzogc3RyaW5nKTogSUFnZW50QWN0aW9uU2lnbmFsIHtcblx0cmV0dXJuIF9hY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvciwgdHVybklkLCBkdXJhdGlvbjogMSwgZXJyb3I6IHsgZXJyb3JUeXBlLCBtZXNzYWdlLCBzdGFjayB9IH0pO1xufVxuXG4vKiogQ3JlYXRlcyBhIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWR9IHNpZ25hbC4gKi9cbmZ1bmN0aW9uIF90aXRsZUNoYW5nZWQoc2Vzc2lvbjogVVJJLCBzZXNzaW9uU3RyOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBJQWdlbnRBY3Rpb25TaWduYWwge1xuXHRyZXR1cm4gX2FjdGlvbihzZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGUgfSk7XG59XG5cbi8qKiBDcmVhdGVzIGEge0BsaW5rIEFjdGlvblR5cGUuQ2hhdFVzYWdlfSBzaWduYWwuICovXG5mdW5jdGlvbiBfdXNhZ2Uoc2Vzc2lvbjogVVJJLCBzZXNzaW9uU3RyOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCB1c2FnZTogVXNhZ2VJbmZvKTogSUFnZW50QWN0aW9uU2lnbmFsIHtcblx0cmV0dXJuIF9hY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSwgdHVybklkLCB1c2FnZSB9KTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIHRvb2wtc3RhcnQgc2lnbmFsczogYSB7QGxpbmsgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydH0gYW5kLFxuICogZm9yIG5vbi1jbGllbnQgdG9vbHMsIGFuIGF1dG8tcmVhZHkge0BsaW5rIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHl9LlxuICovXG5mdW5jdGlvbiBfdG9vbFN0YXJ0KHNlc3Npb246IFVSSSwgc2Vzc2lvblN0cjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nLCBpbnZvY2F0aW9uTWVzc2FnZTogU3RyaW5nT3JNYXJrZG93biwgb3B0cz86IHtcblx0dG9vbElucHV0Pzogc3RyaW5nO1xuXHR0b29sS2luZD86IHN0cmluZztcblx0dG9vbENsaWVudElkPzogc3RyaW5nO1xuXHRzdWJhZ2VudEFnZW50TmFtZT86IHN0cmluZztcblx0c3ViYWdlbnREZXNjcmlwdGlvbj86IHN0cmluZztcblx0cGFyZW50VG9vbENhbGxJZD86IHN0cmluZztcbn0pOiBJQWdlbnRBY3Rpb25TaWduYWxbXSB7XG5cdGNvbnN0IG1ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdGlmIChvcHRzPy50b29sS2luZCkge1xuXHRcdG1ldGEudG9vbEtpbmQgPSBvcHRzLnRvb2xLaW5kO1xuXHR9XG5cdGlmIChvcHRzPy5zdWJhZ2VudEFnZW50TmFtZSkge1xuXHRcdG1ldGEuc3ViYWdlbnRBZ2VudE5hbWUgPSBvcHRzLnN1YmFnZW50QWdlbnROYW1lO1xuXHR9XG5cdGlmIChvcHRzPy5zdWJhZ2VudERlc2NyaXB0aW9uKSB7XG5cdFx0bWV0YS5zdWJhZ2VudERlc2NyaXB0aW9uID0gb3B0cy5zdWJhZ2VudERlc2NyaXB0aW9uO1xuXHR9XG5cdGNvbnN0IHNpZ25hbHM6IElBZ2VudEFjdGlvblNpZ25hbFtdID0gW19hY3Rpb24oc2Vzc2lvbiwge1xuXHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0dHVybklkLFxuXHRcdHRvb2xDYWxsSWQsXG5cdFx0dG9vbE5hbWUsXG5cdFx0ZGlzcGxheU5hbWUsXG5cdFx0Y29udHJpYnV0b3I6IG9wdHM/LnRvb2xDbGllbnRJZCA/IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogb3B0cy50b29sQ2xpZW50SWQgfSA6IHVuZGVmaW5lZCxcblx0XHRfbWV0YTogT2JqZWN0LmtleXMobWV0YSkubGVuZ3RoID8gbWV0YSA6IHVuZGVmaW5lZCxcblx0fSwgb3B0cz8ucGFyZW50VG9vbENhbGxJZCldO1xuXHRpZiAoIW9wdHM/LnRvb2xDbGllbnRJZCkge1xuXHRcdHNpZ25hbHMucHVzaChfYWN0aW9uKHNlc3Npb24sIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHR0b29sSW5wdXQ6IG9wdHM/LnRvb2xJbnB1dCxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0sIG9wdHM/LnBhcmVudFRvb2xDYWxsSWQpKTtcblx0fVxuXHRyZXR1cm4gc2lnbmFscztcbn1cblxuLyoqIENyZWF0ZXMgYSB7QGxpbmsgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZX0gc2lnbmFsLiAqL1xuZnVuY3Rpb24gX3Rvb2xDb21wbGV0ZShzZXNzaW9uOiBVUkksIHNlc3Npb25TdHI6IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgcmVzdWx0OiBUb29sQ2FsbFJlc3VsdCwgcGFyZW50VG9vbENhbGxJZD86IHN0cmluZyk6IElBZ2VudEFjdGlvblNpZ25hbCB7XG5cdHJldHVybiBfYWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkLCB0b29sQ2FsbElkLCByZXN1bHQgfSwgcGFyZW50VG9vbENhbGxJZCk7XG59XG5cbi8qKiBDcmVhdGVzIGEge0BsaW5rIElBZ2VudFRvb2xQZW5kaW5nQ29uZmlybWF0aW9uU2lnbmFsfS4gKi9cbmZ1bmN0aW9uIF9wZW5kaW5nQ29uZmlybWF0aW9uKHNlc3Npb246IFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCBpbnZvY2F0aW9uTWVzc2FnZTogU3RyaW5nT3JNYXJrZG93biwgb3B0cz86IHtcblx0dG9vbElucHV0Pzogc3RyaW5nO1xuXHRjb25maXJtYXRpb25UaXRsZT86IFN0cmluZ09yTWFya2Rvd247XG5cdHBlcm1pc3Npb25LaW5kPzogSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWxbJ3Blcm1pc3Npb25LaW5kJ107XG5cdHBlcm1pc3Npb25QYXRoPzogSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWxbJ3Blcm1pc3Npb25QYXRoJ107XG59KTogSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWwge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsXG5cdFx0Y2hhdDogc2Vzc2lvbixcblx0XHRzdGF0ZToge1xuXHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHRvb2xOYW1lOiAnJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0dG9vbElucHV0OiBvcHRzPy50b29sSW5wdXQsXG5cdFx0XHRjb25maXJtYXRpb25UaXRsZTogb3B0cz8uY29uZmlybWF0aW9uVGl0bGUsXG5cdFx0fSxcblx0XHRwZXJtaXNzaW9uS2luZDogb3B0cz8ucGVybWlzc2lvbktpbmQsXG5cdFx0cGVybWlzc2lvblBhdGg6IG9wdHM/LnBlcm1pc3Npb25QYXRoLFxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLFdBQVc7QUFFcEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBdWU7QUFDaGYsU0FBUywrQkFBK0IsNkJBQWtEO0FBQzFGLFNBQW9DLCtCQUFzSDtBQUUxSixTQUFTLGtCQUFr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
