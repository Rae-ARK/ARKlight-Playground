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
import { disposableTimeout } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { isJsonRpcResponse } from "../../../base/common/jsonRpcProtocol.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../base/common/lifecycle.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import { getAgentHostClientType } from "../common/agentHostClientInfo.js";
import { AgentSession } from "../common/agentService.js";
import { isActionEnvelopeRelevantToSubscriptionUris } from "../common/state/agentSubscription.js";
import { ChatSourceKind } from "../common/state/protocol/channels-chat/commands.js";
import { ActionType, isAnnotationsAction, isChangesetAction, isChatAction, isSessionAction, isTerminalAction } from "../common/state/sessionActions.js";
import { PROTOCOL_VERSION } from "../common/state/protocol/version/registry.js";
import { negotiateProtocolVersion } from "../common/state/protocol/version/negotiation.js";
import { VSCODE_UPGRADE_METHOD } from "../common/state/protocolUpgrade.js";
import { getAgentHostManagementSocketPath, requestAgentHostUpgrade } from "./agentHostUpgradeChannel.js";
import {
  AHP_AUTH_REQUIRED,
  AhpErrorCodes,
  AHP_PROVIDER_NOT_FOUND,
  AHP_SESSION_NOT_FOUND,
  AHP_UNSUPPORTED_PROTOCOL_VERSION,
  isJsonRpcNotification,
  isJsonRpcRequest,
  JSON_RPC_INTERNAL_ERROR,
  JsonRpcErrorCodes,
  ProtocolError
} from "../common/state/sessionProtocol.js";
import { isAhpResourceWatchChannel, isAhpRootChannel, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, buildDefaultChatUri, isAhpChatChannel, parseChatUri, parseRequiredSessionUriFromChatUri } from "../common/state/sessionState.js";
import {
  buildOtlpLogsChannelUri,
  extractLevelFromOtlpLogsUri,
  levelToSeverityNumber,
  OTLP_CHANNEL_SCHEME,
  OTLP_LOGS_CHANNEL_TEMPLATE,
  toResourceLogsPayload
} from "../common/otlp/otlpLogEmitter.js";
import { isFileResourceRead } from "../common/resourceReadLogging.js";
const REPLAY_BUFFER_CAPACITY = 1e3;
const CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT = 3e4;
const UNSUPPORTED_CLIENT_ACTION_TYPES = /* @__PURE__ */ new Set([
  ActionType.SessionWorkingDirectorySet,
  ActionType.SessionWorkingDirectoryRemoved,
  ActionType.ChatWorkingDirectorySet,
  ActionType.ChatWorkingDirectoryRemoved
]);
function isPendingToolCallStatus(status) {
  return status === ToolCallStatus.Streaming || status === ToolCallStatus.Running || status === ToolCallStatus.PendingConfirmation;
}
function jsonRpcSuccess(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function jsonRpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, ...data !== void 0 ? { data } : {} } };
}
function jsonRpcErrorFrom(id, err) {
  if (err instanceof ProtocolError) {
    return jsonRpcError(id, err.code, err.message, err.data);
  }
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, message);
}
function shouldLogFailedRequest(method, params, err) {
  if (!(err instanceof ProtocolError) || err.code !== AhpErrorCodes.NotFound || !isFileResourceRead(method, params)) {
    return true;
  }
  return false;
}
function isParamsObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readMcpChannel(params) {
  if (!isParamsObject(params)) {
    return void 0;
  }
  const channel = params["channel"];
  if (typeof channel !== "string" || !channel.startsWith("mcp://")) {
    return void 0;
  }
  return channel;
}
var ChannelKind = /* @__PURE__ */ ((ChannelKind2) => {
  ChannelKind2["State"] = "state";
  ChannelKind2["ResourceWatch"] = "resource-watch";
  ChannelKind2["OtlpLogs"] = "otlp-logs";
  return ChannelKind2;
})(ChannelKind || {});
function classifyChannel(channel) {
  if (channel.toLowerCase().startsWith(`${OTLP_CHANNEL_SCHEME}:`)) {
    const level = extractLevelFromOtlpLogsUri(channel);
    if (!level) {
      return void 0;
    }
    return { kind: "otlp-logs" /* OtlpLogs */, uri: buildOtlpLogsChannelUri(level), level };
  }
  if (isAhpResourceWatchChannel(channel)) {
    return { kind: "resource-watch" /* ResourceWatch */, uri: channel };
  }
  return { kind: "state" /* State */, uri: channel };
}
let ProtocolServerHandler = class extends Disposable {
  constructor(_agentService, _stateManager, _server, _config, _clientFileSystemProvider, _logService) {
    super();
    this._agentService = _agentService;
    this._stateManager = _stateManager;
    this._server = _server;
    this._config = _config;
    this._clientFileSystemProvider = _clientFileSystemProvider;
    this._logService = _logService;
    /**
     * Per-client records keyed by clientId. Holds both connected clients
     * (`connections` non-empty) and recently-disconnected ones retained for the
     * tool-call disconnect-grace window (`connections.length === 0`). See
     * {@link IClientRecord}.
     */
    this._clients = /* @__PURE__ */ new Map();
    this._replayBuffer = [];
    this._onDidChangeConnectionCount = this._register(new Emitter());
    /** Fires with the current client count whenever a client connects or disconnects. */
    this.onDidChangeConnectionCount = this._onDidChangeConnectionCount.event;
    // ---- Requests (expect a response) ---------------------------------------
    /**
     * Methods handled by the request dispatcher (excludes initialize/reconnect
     * which are handled during the handshake phase).
     */
    this._requestHandlers = {
      subscribe: async (client, params) => {
        const classified = classifyChannel(params.channel);
        if (!classified) {
          return {};
        }
        if (classified.kind === "otlp-logs" /* OtlpLogs */) {
          if (!this._config.otlpLogEmitter) {
            this._logService.warn(`[ProtocolServer] Ignoring OTLP subscribe for ${params.channel}: no OTLP emitter configured.`);
            return {};
          }
          client.subscriptions.set(classified.uri, classified);
          return {};
        }
        if (classified.kind === "resource-watch" /* ResourceWatch */) {
          const descriptor = this._agentService.onResourceWatchSubscribed(classified.uri);
          if (!descriptor) {
            throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource watch not found: ${params.channel}`);
          }
          client.subscriptions.set(classified.uri, classified);
          return {
            snapshot: {
              resource: classified.uri,
              state: descriptor,
              fromSeq: this._stateManager.serverSeq
            }
          };
        }
        try {
          const snapshot = await this._agentService.subscribe(URI.parse(params.channel), client.clientId);
          client.subscriptions.set(classified.uri, classified);
          this._clearClientToolCallDisconnectTimeout(client.clientId, classified.uri);
          return { snapshot };
        } catch (err) {
          if (err instanceof ProtocolError) {
            throw err;
          }
          throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Resource not found: ${params.channel}`);
        }
      },
      createSession: async (_client, params) => {
        let createdSession;
        let fork;
        if (params.fork) {
          const sourceState = this._stateManager.getSessionState(params.fork.session);
          if (!sourceState) {
            throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Fork source session not found: ${params.fork.session}`);
          }
          const turnIndex = sourceState.turns.findIndex((t) => t.id === params.fork.turnId);
          if (turnIndex < 0) {
            throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Fork turn ID ${params.fork.turnId} not found in session ${params.fork.session}`);
          }
          fork = { session: URI.parse(params.fork.session), turnIndex, turnId: params.fork.turnId };
        }
        if (params.activeClient && params.activeClient.clientId !== _client.clientId) {
          throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `createSession.activeClient.clientId must match the connection's clientId`);
        }
        try {
          createdSession = await this._agentService.createSession({
            provider: params.provider,
            workingDirectories: params.workingDirectories?.map((d) => URI.parse(d)),
            session: URI.parse(params.channel),
            fork,
            config: params.config,
            activeClient: params.activeClient,
            progressToken: params.progressToken
          });
        } catch (err) {
          if (err instanceof ProtocolError) {
            throw err;
          }
          throw new ProtocolError(AHP_PROVIDER_NOT_FOUND, err instanceof Error ? err.message : String(err));
        }
        if (createdSession.toString() !== URI.parse(params.channel).toString()) {
          this._logService.warn(`[ProtocolServer] createSession: provider returned URI ${createdSession.toString()} but client requested ${params.channel}`);
        }
        return null;
      },
      disposeSession: async (_client, params) => {
        await this._agentService.disposeSession(URI.parse(params.channel));
        return null;
      },
      createChat: async (_client, params) => {
        const state = this._stateManager.getSessionState(params.channel);
        if (!state) {
          throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${params.channel}`);
        }
        const defaultChat = state.defaultChat ?? buildDefaultChatUri(params.channel);
        if (URI.parse(params.chat).toString() === URI.parse(defaultChat).toString()) {
          return null;
        }
        const source = params.source;
        let options;
        if (source) {
          switch (source.kind) {
            case ChatSourceKind.Fork:
              options = { fork: { source: URI.parse(source.chat), turnId: source.turnId } };
              break;
            case ChatSourceKind.SideChat:
              options = {
                sideChat: {
                  source: URI.parse(source.chat),
                  turnId: source.turnId,
                  ...source.selection ? { selection: source.selection } : {}
                }
              };
              break;
            default:
              throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unsupported createChat source kind: ${String(source.kind)}`);
          }
        }
        await this._agentService.createChat(
          URI.parse(params.channel),
          URI.parse(params.chat),
          options
        );
        return null;
      },
      disposeChat: async (_client, params) => {
        const chat = URI.parse(params.channel);
        const parsed = parseChatUri(chat);
        if (!parsed) {
          return null;
        }
        await this._agentService.disposeChat(URI.parse(parsed.session), chat);
        return null;
      },
      resourceWrite: async (_client, params) => {
        return this._agentService.resourceWrite(params);
      },
      listSessions: async () => {
        const sessions = await this._agentService.listSessions();
        const items = sessions.map((s) => {
          const provider = AgentSession.provider(s.session);
          if (!provider) {
            throw new Error(`Agent session URI has no provider scheme: ${s.session.toString()}`);
          }
          return {
            resource: s.session.toString(),
            provider,
            title: s.summary ?? "Session",
            status: s.status ?? SessionStatus.Idle,
            activity: s.activity,
            createdAt: new Date(s.startTime).toISOString(),
            modifiedAt: new Date(s.modifiedTime).toISOString(),
            ...s.project ? { project: { uri: s.project.uri.toString(), displayName: s.project.displayName } } : {},
            workingDirectories: s.workingDirectories?.map((d) => d.toString()),
            changes: s.changes,
            // `_meta` carries the workspace-less marker, which seeds or
            // promotes the client's session kind and cannot be
            // re-derived from the (scratch) working directory.
            ...s._meta !== void 0 ? { _meta: s._meta } : {}
          };
        });
        return { items };
      },
      resolveSessionConfig: async (_client, params) => {
        return this._agentService.resolveSessionConfig({
          provider: params.provider,
          workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : void 0,
          config: params.config
        });
      },
      sessionConfigCompletions: async (_client, params) => {
        return this._agentService.sessionConfigCompletions({
          provider: params.provider,
          workingDirectory: params.workingDirectory ? URI.parse(params.workingDirectory) : void 0,
          config: params.config,
          property: params.property,
          query: params.query
        });
      },
      completions: async (_client, params) => {
        return this._agentService.completions(params);
      },
      fetchTurns: async (_client, params) => {
        const state = this._stateManager.getChatState(params.channel);
        if (!state) {
          throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${params.channel}`);
        }
        if (params.cursor && params.cursor !== state.turnsNextCursor) {
          throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unrecognized fetchTurns cursor`);
        }
        this._stateManager.dispatchServerAction(params.channel, {
          type: ActionType.ChatTurnsLoaded,
          turns: []
        });
        return {};
      },
      resourceList: async (_client, params) => {
        return this._agentService.resourceList(URI.parse(params.uri));
      },
      resourceRead: async (_client, params) => {
        return this._agentService.resourceRead(URI.parse(params.uri));
      },
      resourceCopy: async (_client, params) => {
        return this._agentService.resourceCopy(params);
      },
      resourceDelete: async (_client, params) => {
        return this._agentService.resourceDelete(params);
      },
      resourceMove: async (_client, params) => {
        return this._agentService.resourceMove(params);
      },
      resourceResolve: async (_client, params) => {
        return this._agentService.resourceResolve(params);
      },
      resourceMkdir: async (_client, params) => {
        return this._agentService.resourceMkdir(params);
      },
      createResourceWatch: async (_client, params) => {
        return this._agentService.createResourceWatch(params);
      },
      resourceRequest: async (_client, _params) => {
        return {};
      },
      authenticate: async (_client, params) => {
        const result = await this._agentService.authenticate(params);
        if (!result.authenticated) {
          throw new ProtocolError(AHP_AUTH_REQUIRED, `Authentication failed for resource: ${params.resource}`);
        }
        return {};
      },
      createTerminal: async (_client, params) => {
        await this._agentService.createTerminal(params);
        return null;
      },
      disposeTerminal: async (_client, params) => {
        await this._agentService.disposeTerminal(URI.parse(params.channel));
        return null;
      },
      invokeChangesetOperation: async (_client, params) => {
        return this._agentService.invokeChangesetOperation(params);
      }
    };
    // ---- Reverse RPC (server → client requests) ----------------------------
    this._reverseRequestId = 0;
    this._pendingReverseRequests = /* @__PURE__ */ new Map();
    this._register(this._server.onConnection((transport) => {
      this._handleNewConnection(transport);
    }));
    this._register(this._stateManager.onDidEmitEnvelope((envelope) => {
      this._replayBuffer.push(envelope);
      if (this._replayBuffer.length > REPLAY_BUFFER_CAPACITY) {
        this._replayBuffer.shift();
      }
      this._broadcastAction(envelope);
      if (envelope.action.type === ActionType.ChatToolCallStart || envelope.action.type === ActionType.ChatToolCallReady) {
        if (!isAhpChatChannel(envelope.channel)) {
          throw new Error(`[ProtocolServer] Chat tool-call action emitted on non-chat channel: ${envelope.channel}`);
        }
        this._checkOrphanedClientToolCalls(parseRequiredSessionUriFromChatUri(envelope.channel), envelope.channel);
      }
    }));
    this._register(this._stateManager.onDidEmitNotification((notification) => {
      this._broadcastNotification(notification);
    }));
    this._register(this._agentService.onMcpNotification((notification) => {
      this._broadcastMcpNotification(notification);
    }));
    if (this._config.otlpLogEmitter) {
      this._register(this._config.otlpLogEmitter.onDidLog((record) => this._broadcastOtlpLog(record)));
    }
  }
  // ---- Connection handling -------------------------------------------------
  _handleNewConnection(transport) {
    const disposables = new DisposableStore();
    let client;
    disposables.add(transport.onMessage((msg) => {
      if (isJsonRpcRequest(msg)) {
        this._logService.trace(`[ProtocolServer] request: method=${msg.method} id=${msg.id}`);
        if (msg.method === "ping") {
          transport.send(jsonRpcSuccess(msg.id, null));
          return;
        }
        if (!client && msg.method === "initialize") {
          try {
            const result = this._handleInitialize(msg.params, transport, disposables);
            client = result.client;
            transport.send(jsonRpcSuccess(msg.id, result.response));
          } catch (err) {
            transport.send(jsonRpcErrorFrom(msg.id, err));
          }
          return;
        }
        if (!client && msg.method === "reconnect") {
          let responsePromise;
          try {
            const result = this._handleReconnect(msg.params, transport, disposables);
            client = result.client;
            responsePromise = result.responsePromise;
          } catch (err) {
            transport.send(jsonRpcErrorFrom(msg.id, err));
            return;
          }
          responsePromise.then(
            (response) => transport.send(jsonRpcSuccess(msg.id, response)),
            (err) => transport.send(jsonRpcErrorFrom(msg.id, err))
          );
          return;
        }
        if (msg.method === VSCODE_UPGRADE_METHOD) {
          this._handleVscodeUpgrade(msg.id, transport);
          return;
        }
        if (!client) {
          transport.send(jsonRpcError(msg.id, JsonRpcErrorCodes.MethodNotFound, `Method not found: ${msg.method}`));
          return;
        }
        this._handleRequest(client, msg.method, msg.params, msg.id);
      } else if (isJsonRpcNotification(msg)) {
        this._logService.trace(`[ProtocolServer] notification: method=${msg.method}`);
        switch (msg.method) {
          case "unsubscribe":
            if (client) {
              this._removeSubscription(client, msg.params.channel);
            }
            break;
          case "dispatchAction":
            if (client) {
              this._logService.trace(`[ProtocolServer] dispatchAction: ${JSON.stringify(msg.params.action.type)}`);
              const action = msg.params.action;
              const channel = msg.params.channel;
              if (UNSUPPORTED_CLIENT_ACTION_TYPES.has(action.type)) {
                this._logService.warn(`[ProtocolServer] rejecting unsupported client action: ${action.type}`);
                this._stateManager.rejectClientAction(
                  channel,
                  action,
                  { clientId: client.clientId, clientSeq: msg.params.clientSeq },
                  `Unsupported action: ${action.type}`
                );
              } else if (isSessionAction(action) || isChatAction(action) || isTerminalAction(action) || isChangesetAction(action) || isAnnotationsAction(action) || action.type === ActionType.RootConfigChanged) {
                this._agentService.dispatchAction(channel, action, client.clientId, msg.params.clientSeq, getAgentHostClientType(client.clientInfo));
              }
            }
            break;
        }
      } else if (isJsonRpcResponse(msg)) {
        const pending = this._pendingReverseRequests.get(msg.id);
        if (pending && pending.client === client) {
          this._pendingReverseRequests.delete(msg.id);
          if (hasKey(msg, { error: true })) {
            pending.reject(new ProtocolError(
              msg.error?.code ?? -32e3,
              msg.error?.message ?? "Reverse RPC error",
              msg.error?.data
            ));
          } else {
            pending.resolve(msg.result);
          }
        }
      }
    }));
    disposables.add(transport.onClose(() => {
      const record = client ? this._clients.get(client.clientId) : void 0;
      if (client && record?.state === "active") {
        const connectionIndex = record.connections.indexOf(client);
        if (connectionIndex !== -1) {
          const subscriptionCount = client.subscriptions.size;
          record.connections.splice(connectionIndex, 1);
          this._releaseClientSubscriptions(client, record);
          this._rejectPendingReverseRequestsForConnection(client);
          if (record.connections.length === 0) {
            this._logService.info(`[ProtocolServer] Client disconnected: ${client.clientId}, subscriptions=${subscriptionCount}`);
            this._clients.set(client.clientId, { state: "grace", clientInfo: record.clientInfo, lastSeenAt: Date.now(), disconnectTimeouts: new DisposableMap() });
            this._handleClientDisconnected(client.clientId);
            this._onDidChangeConnectionCount.fire(this._connectedClientCount);
          }
        }
      }
      disposables.dispose();
    }));
    disposables.add(transport);
  }
  // ---- Handshake handlers ----------------------------------------------------
  _handleInitialize(params, transport, disposables) {
    const offered = Array.isArray(params.protocolVersions) ? params.protocolVersions : [];
    this._logService.info(`[ProtocolServer] Initialize: clientId=${params.clientId}, protocolVersions=[${offered.join(", ")}]`);
    const negotiated = negotiateProtocolVersion(offered, PROTOCOL_VERSION);
    if (!negotiated) {
      const data = {
        supportedVersions: [`^${PROTOCOL_VERSION}`],
        // Only advertise the in-band upgrade method when the agent
        // host was spawned by a VS Code CLI that is listening for
        // management requests (presence of the env var). Otherwise
        // there is no supervisor to actually act on it, so don't
        // lie to the client.
        _meta: getAgentHostManagementSocketPath() ? { vscodeUpgradeMethod: VSCODE_UPGRADE_METHOD } : void 0
      };
      throw new ProtocolError(
        AHP_UNSUPPORTED_PROTOCOL_VERSION,
        `Client offered protocol versions [${offered.join(", ")}], none of which are compatible with this server's version ${PROTOCOL_VERSION} (server accepts ^${PROTOCOL_VERSION}).`,
        data
      );
    }
    const client = {
      clientId: params.clientId,
      clientInfo: params.clientInfo,
      protocolVersion: negotiated,
      transport,
      subscriptions: /* @__PURE__ */ new Map(),
      disposables
    };
    this._attachConnection(params.clientId, client);
    this._registerClientFileSystemAuthority(params.clientId, disposables);
    const snapshots = [];
    if (params.initialSubscriptions) {
      for (const uri of params.initialSubscriptions) {
        const snapshot = this._addInitialSubscription(client, uri.toString());
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }
    }
    return {
      client,
      response: {
        protocolVersion: negotiated,
        serverSeq: this._stateManager.serverSeq,
        snapshots,
        defaultDirectory: this._config.defaultDirectory,
        completionTriggerCharacters: this._config.completionTriggerCharacters,
        terminalCommandPrefix: this._config.terminalCommandPrefix,
        telemetry: this._config.otlpLogEmitter ? { logs: OTLP_LOGS_CHANNEL_TEMPLATE } : void 0
      }
    };
  }
  /**
   * Helper for `initialize` and `reconnect` initial-subscription
   * processing: classify `channel`, install the matching subscription
   * on the client, and return the snapshot to include in the handshake
   * response (or `undefined` for stateless channels and missing state).
   *
   * Side effects:
   * - State channels: register with the agent service and clear any
   *   pending tool-call disconnect timeout.
   * - OTLP channels: install the canonical entry on the client's
   *   {@link IConnectedClient.subscriptions} map.
   *
   * Channels with unsupported shapes (e.g. `ahp-otlp://logs/verbose`
   * with no recognised level, or a state channel the state manager
   * does not know about) are silently dropped.
   */
  _addInitialSubscription(client, channel) {
    const sub = classifyChannel(channel);
    if (!sub) {
      return void 0;
    }
    if (sub.kind === "otlp-logs" /* OtlpLogs */) {
      if (!this._config.otlpLogEmitter) {
        this._logService.warn(`[ProtocolServer] Ignoring OTLP initialSubscription ${channel}: no OTLP emitter configured.`);
        return void 0;
      }
      client.subscriptions.set(sub.uri, sub);
      return void 0;
    }
    const snapshot = this._stateManager.getSnapshot(channel);
    if (!snapshot) {
      return void 0;
    }
    client.subscriptions.set(sub.uri, sub);
    this._agentService.addSubscriber(URI.parse(sub.uri), client.clientId);
    this._clearClientToolCallDisconnectTimeout(client.clientId, sub.uri);
    return snapshot;
  }
  /**
   * Forwards a client's upgrade request to the hosting VS Code CLI's
   * HTTP management API (advertised via the {@link VSCODE_AGENT_HOST_MANAGEMENT_SOCKET_ENV}).
   * Returns the CLI's parsed response verbatim so the client can render
   * a meaningful status (already up-to-date, restart scheduled, etc.).
   *
   * When the server was not spawned by a managing CLI, responds with
   * `MethodNotFound` — the upgrade method is only meaningfully callable
   * on CLI-hosted servers.
   */
  _handleVscodeUpgrade(id, transport) {
    const socketPath = getAgentHostManagementSocketPath();
    if (!socketPath) {
      transport.send(jsonRpcError(
        id,
        JsonRpcErrorCodes.MethodNotFound,
        `No upgrade supervisor is available for this agent host.`
      ));
      return;
    }
    requestAgentHostUpgrade(socketPath).then(
      (result) => transport.send(jsonRpcSuccess(id, result)),
      (err) => {
        this._logService.warn(`[ProtocolServer] vscodeUpgrade signal failed: ${err instanceof Error ? err.message : String(err)}`);
        transport.send(jsonRpcErrorFrom(id, err));
      }
    );
  }
  _handleReconnect(params, transport, disposables) {
    this._logService.info(`[ProtocolServer] Reconnect: clientId=${params.clientId}, lastSeenSeq=${params.lastSeenServerSeq}`);
    const existingRecord = this._clients.get(params.clientId);
    if (!existingRecord) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `Reconnect client not found: ${params.clientId}`);
    }
    const client = {
      clientId: params.clientId,
      clientInfo: existingRecord.clientInfo,
      protocolVersion: PROTOCOL_VERSION,
      transport,
      subscriptions: /* @__PURE__ */ new Map(),
      disposables
    };
    this._attachConnection(params.clientId, client);
    this._registerClientFileSystemAuthority(params.clientId, disposables);
    const oldestBuffered = this._replayBuffer.length > 0 ? this._replayBuffer[0].serverSeq : this._stateManager.serverSeq;
    const canReplay = params.lastSeenServerSeq >= oldestBuffered;
    const responsePromise = this._restoreReconnectSubscriptions(client, params, canReplay);
    return { client, responsePromise };
  }
  /**
   * Wires the reverse-RPC filesystem callbacks for `clientId` and binds
   * the unregister to `disposables` (the transport's per-connection
   * store). The callbacks dispatch through {@link _sendReverseRequest},
   * which looks up the *current* connected client by id — so re-binding
   * after a reconnect picks up the new transport without rebuilding the
   * closures.
   */
  _registerClientFileSystemAuthority(clientId, disposables) {
    disposables.add(this._clientFileSystemProvider.registerAuthority(clientId, {
      resourceList: (uri) => this._sendReverseRequest(clientId, "resourceList", { uri: uri.toString() }),
      resourceRead: (uri) => this._sendReverseRequest(clientId, "resourceRead", { uri: uri.toString() }),
      resourceWrite: (params_) => this._sendReverseRequest(clientId, "resourceWrite", params_),
      resourceCopy: (params_) => this._sendReverseRequest(clientId, "resourceCopy", params_),
      resourceDelete: (params_) => this._sendReverseRequest(clientId, "resourceDelete", params_),
      resourceMove: (params_) => this._sendReverseRequest(clientId, "resourceMove", params_),
      resourceRequest: (params_) => this._sendReverseRequest(clientId, "resourceRequest", params_),
      resourceResolve: (params_) => this._sendReverseRequest(clientId, "resourceResolve", params_),
      resourceMkdir: (params_) => this._sendReverseRequest(clientId, "resourceMkdir", params_)
    }));
  }
  /**
   * Re-establish each of the client's prior subscriptions on the server side.
   * Uses {@link IAgentService.subscribe} (rather than a bare `addSubscriber`
   * + `getSnapshot`) so any session state that was evicted while the client
   * was disconnected is restored. Returns the appropriate reconnect response
   * payload — `replay` actions when the client's last-seen seq is still in
   * the buffer, otherwise fresh `snapshot`s.
   */
  async _restoreReconnectSubscriptions(client, params, canReplay) {
    const missing = [];
    const snapshots = await Promise.all(params.subscriptions.map(async (sub) => {
      const key = sub.toString();
      const classified = classifyChannel(key);
      if (!classified) {
        return void 0;
      }
      if (classified.kind === "otlp-logs" /* OtlpLogs */) {
        if (!this._config.otlpLogEmitter) {
          this._logService.warn(`[ProtocolServer] Reconnect: dropping OTLP subscription ${key}: no OTLP emitter configured.`);
          return void 0;
        }
        client.subscriptions.set(classified.uri, classified);
        return void 0;
      }
      if (classified.kind === "resource-watch" /* ResourceWatch */) {
        const descriptor = this._agentService.onResourceWatchSubscribed(classified.uri);
        if (!descriptor) {
          this._logService.info(`[ProtocolServer] Reconnect: resource watch ${key} no longer parses`);
          missing.push(sub);
          return void 0;
        }
        client.subscriptions.set(classified.uri, classified);
        return {
          resource: classified.uri,
          state: descriptor,
          fromSeq: this._stateManager.serverSeq
        };
      }
      try {
        const snapshot = await this._agentService.subscribe(URI.parse(key), client.clientId);
        client.subscriptions.set(classified.uri, classified);
        this._clearClientToolCallDisconnectTimeout(client.clientId, classified.uri);
        return snapshot;
      } catch (err) {
        this._logService.info(`[ProtocolServer] Reconnect: failed to restore subscription ${key}: ${err instanceof Error ? err.message : String(err)}`);
        missing.push(sub);
        return void 0;
      }
    }));
    this._reconcileActiveClientsAfterReconnect(client);
    if (canReplay) {
      const actions = [];
      for (const envelope of this._replayBuffer) {
        if (envelope.serverSeq > params.lastSeenServerSeq) {
          if (this._isRelevantToClient(client, envelope)) {
            actions.push(envelope);
          }
        }
      }
      return { type: "replay", actions, missing };
    }
    return { type: "snapshot", snapshots: snapshots.filter((s) => s !== void 0) };
  }
  /**
   * Release a client from every session where it is still an active client
   * but did not resubscribe during a reconnect. The set of resubscribed
   * sessions is gathered from every live connection the client currently
   * holds (not just the reconnecting one) so an overlapping connection that
   * still subscribes to a session keeps the client active there.
   */
  _reconcileActiveClientsAfterReconnect(client) {
    const record = this._clients.get(client.clientId);
    const resubscribed = /* @__PURE__ */ new Set();
    for (const connection of record?.state === "active" ? record.connections : [client]) {
      for (const sub of connection.subscriptions.values()) {
        if (sub.kind === "state" /* State */) {
          resubscribed.add(sub.uri);
        }
      }
    }
    for (const session of this._stateManager.getSessionUris()) {
      const state = this._stateManager.getSessionState(session);
      if (state && this._isActiveClient(state, client.clientId)) {
        for (const chat of state.chats) {
          if (!resubscribed.has(session) && !resubscribed.has(chat.resource)) {
            this._releaseActiveClientForSession(session, client.clientId, chat.resource);
          }
        }
      }
    }
  }
  _handleClientDisconnected(clientId) {
    for (const session of this._stateManager.getSessionUris()) {
      const state = this._stateManager.getSessionState(session);
      const isActive = state ? this._isActiveClient(state, clientId) : false;
      const ownsPendingToolCall = state ? this._hasPendingClientToolCall(state, clientId) : false;
      if (isActive || ownsPendingToolCall) {
        for (const chat of state?.chats ?? []) {
          this._startClientToolCallDisconnectTimeout(clientId, session, chat.resource);
        }
      }
    }
  }
  /** Whether `clientId` is one of the session's active clients. */
  _isActiveClient(state, clientId) {
    return state.activeClients.some((c) => c.clientId === clientId);
  }
  /**
   * Remove `clientId` from a session's active clients, if present. Dispatched
   * as a server action so the removal is reflected in state and broadcast to
   * the remaining subscribers.
   */
  _removeActiveClient(session, clientId) {
    const state = this._stateManager.getSessionState(session);
    if (state && this._isActiveClient(state, clientId)) {
      this._stateManager.dispatchServerAction(session, {
        type: ActionType.SessionActiveClientRemoved,
        clientId
      });
    }
  }
  /**
   * Release a client from a session: clear its pending disconnect timeout,
   * fail any client tool calls it still owns, and remove it from the active
   * clients. Used by the explicit-unsubscribe and reconnect-reconciliation
   * paths to drop a client that has left a session.
   */
  _releaseActiveClientForSession(session, clientId, chatChannel) {
    this._clearClientToolCallDisconnectTimeout(clientId, chatChannel);
    this._completeDisconnectedClientToolCalls(clientId, session, chatChannel);
    this._removeActiveClient(session, clientId);
  }
  /**
   * Yields every still-pending client-contributed tool call in `state`'s
   * active turn, paired with its owning `clientId`. Single source of truth
   * for the disconnect-grace machinery: detect ownership
   * ({@link _hasPendingClientToolCall}), arm timeouts
   * ({@link _checkOrphanedClientToolCalls}), and fail orphaned calls
   * ({@link _completeDisconnectedClientToolCalls}).
   */
  *_pendingClientToolCalls(state) {
    const activeTurn = state?.activeTurn;
    if (!activeTurn) {
      return;
    }
    for (const part of activeTurn.responseParts) {
      if (part.kind !== ResponsePartKind.ToolCall) {
        continue;
      }
      const toolCall = part.toolCall;
      const contributor = toolCall.contributor;
      if (contributor?.kind === ToolCallContributorKind.Client && isPendingToolCallStatus(toolCall.status)) {
        yield { toolCall, clientId: contributor.clientId };
      }
    }
  }
  _hasPendingClientToolCall(state, clientId) {
    for (const pending of this._pendingClientToolCalls(state)) {
      if (pending.clientId === clientId) {
        return true;
      }
    }
    return false;
  }
  _hasReplacementActiveClientTool(state, clientId, toolName) {
    return state.activeClients.some((client) => client.clientId !== clientId && client.tools.some((tool) => tool.name === toolName));
  }
  /**
   * Arm (or re-arm) the per-(clientId, session) timeout that fails pending
   * client tool calls owned by `clientId` if it does not reconnect before the
   * grace window elapses. Only meaningful for a client with no live transport:
   * a connected client is handled by {@link _attachConnection}, which disposes
   * any armed timers, so this is a no-op when the client is active. The delay
   * is the remaining grace measured from when the client disconnected — so a
   * client that disconnected a while before the call was issued gets the
   * residual window rather than a fresh one, and a stamp from a long-disconnected
   * client fails promptly. Re-arms triggered by later orphaned tool calls in the
   * same session shrink the remaining window instead of resetting it.
   */
  _startClientToolCallDisconnectTimeout(clientId, session, chatChannel) {
    const record = this._ensureGraceRecord(clientId);
    if (!record) {
      return;
    }
    record.disconnectTimeouts.deleteAndDispose(chatChannel);
    const elapsed = Date.now() - record.lastSeenAt;
    const delay = Math.max(0, CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT - elapsed);
    record.disconnectTimeouts.set(chatChannel, disposableTimeout(() => {
      this._releaseActiveClientForSession(session, clientId, chatChannel);
    }, delay));
  }
  /**
   * Scan a chat for pending client tool calls owned by a disconnected client
   * of this protocol server, and arm the disconnect timeout for each owner.
   * Called when a `ChatToolCallStart` / `ChatToolCallReady` envelope is
   * observed — covering calls issued for an already-gone client, which the
   * live disconnect path never sees. Ownerless client tool calls (no client
   * connected at stamp time) are failed immediately by the provider, so they
   * never reach a pending state here. Unknown client ids are ignored because
   * they may belong to another transport such as local IPC.
   */
  _checkOrphanedClientToolCalls(session, chatChannel) {
    const state = this._stateManager.getSessionState(chatChannel);
    const orphanOwners = /* @__PURE__ */ new Set();
    for (const { clientId } of this._pendingClientToolCalls(state)) {
      const ownerRecord = this._clients.get(clientId);
      if (ownerRecord?.state === "grace") {
        orphanOwners.add(clientId);
      }
    }
    for (const ownerId of orphanOwners) {
      this._startClientToolCallDisconnectTimeout(ownerId, session, chatChannel);
    }
  }
  /**
   * Register a freshly connected (or reconnected) transport for `clientId`,
   * promoting the record to {@link IActiveClientRecord}. Promoting a grace
   * record back to active disposes its pending disconnect timers: the
   * disconnect-grace window only applies while the client has no live
   * transport. This is the single place that maintains the "active records
   * hold no grace timers" invariant.
   */
  _attachConnection(clientId, client) {
    const existing = this._clients.get(clientId);
    if (existing?.state === "active") {
      existing.connections.push(client);
      existing.clientInfo = client.clientInfo ?? existing.clientInfo;
    } else {
      existing?.disconnectTimeouts.dispose();
      this._clients.set(clientId, { state: "active", clientInfo: client.clientInfo ?? existing?.clientInfo, connections: [client] });
    }
    this._pruneClientRecords();
    this._onDidChangeConnectionCount.fire(this._connectedClientCount);
  }
  /**
   * Return the existing grace record for `clientId`, creating one for a
   * never-connected client (an orphan tool-call stamp). Returns `undefined`
   * when the client is currently active — the grace machinery does not apply
   * to a connected client. A newly created record pins its grace clock to now.
   */
  _ensureGraceRecord(clientId) {
    const record = this._clients.get(clientId);
    if (record?.state === "active") {
      return void 0;
    }
    if (record) {
      return record;
    }
    const created = { state: "grace", clientInfo: void 0, lastSeenAt: Date.now(), disconnectTimeouts: new DisposableMap() };
    this._clients.set(clientId, created);
    return created;
  }
  _getActiveClient(clientId) {
    return this._getActiveClientFromRecord(this._clients.get(clientId));
  }
  _getActiveClientFromRecord(record) {
    if (record?.state !== "active") {
      return void 0;
    }
    return record.connections[record.connections.length - 1];
  }
  _releaseClientSubscriptions(client, record) {
    for (const sub of client.subscriptions.values()) {
      if (sub.kind === "state" /* State */) {
        if (this._hasSubscriptionInOtherConnection(record, client, sub.uri)) {
          continue;
        }
        this._agentService.unsubscribe(URI.parse(sub.uri), client.clientId);
      } else if (sub.kind === "resource-watch" /* ResourceWatch */) {
        this._agentService.onResourceWatchUnsubscribed(sub.uri);
      }
    }
    client.subscriptions.clear();
  }
  _hasSubscriptionInOtherConnection(record, client, uri) {
    if (record.state !== "active") {
      return false;
    }
    for (const other of record.connections) {
      if (other !== client && other.subscriptions.has(uri)) {
        return true;
      }
    }
    return false;
  }
  /** Number of clients that currently have a live connection. */
  get _connectedClientCount() {
    let count = 0;
    for (const record of this._clients.values()) {
      if (record.state === "active") {
        count++;
      }
    }
    return count;
  }
  /**
   * Drop grace records whose timers have all fired and whose last-seen time is
   * stale beyond the retention window (10× the disconnect timeout). This
   * covers both genuinely-disconnected clients and never-connected orphan
   * stamps. Bounds {@link _clients} without tracking liveness precisely — a
   * pruned-then-resurfacing stamp simply falls back to the full grace window.
   * Active records are never pruned; they persist until their last transport
   * closes.
   */
  _pruneClientRecords() {
    const cutoff = Date.now() - CLIENT_TOOL_CALL_DISCONNECT_TIMEOUT * 10;
    for (const [clientId, record] of this._clients) {
      if (record.state === "grace" && record.disconnectTimeouts.size === 0 && record.lastSeenAt < cutoff) {
        this._clients.delete(clientId);
      }
    }
  }
  _clearClientToolCallDisconnectTimeout(clientId, channel) {
    const record = this._clients.get(clientId);
    if (record?.state === "grace") {
      record.disconnectTimeouts.deleteAndDispose(channel);
    }
  }
  _completeDisconnectedClientToolCalls(clientId, session, chatChannel) {
    const state = this._stateManager.getSessionState(chatChannel);
    const activeTurn = state?.activeTurn;
    if (!state || !activeTurn) {
      return;
    }
    for (const { toolCall, clientId: ownerId } of this._pendingClientToolCalls(state)) {
      if (ownerId !== clientId) {
        continue;
      }
      const mayRetryWithReplacementClient = this._hasReplacementActiveClientTool(state, clientId, toolCall.toolName);
      if (toolCall.status === ToolCallStatus.Streaming) {
        this._stateManager.dispatchServerAction(chatChannel, {
          type: ActionType.ChatToolCallReady,
          turnId: activeTurn.id,
          toolCallId: toolCall.toolCallId,
          invocationMessage: toolCall.invocationMessage ?? toolCall.displayName,
          confirmed: ToolCallConfirmationReason.NotNeeded
        });
      }
      this._stateManager.dispatchServerAction(chatChannel, {
        type: ActionType.ChatToolCallComplete,
        turnId: activeTurn.id,
        toolCallId: toolCall.toolCallId,
        result: {
          success: false,
          pastTenseMessage: `${toolCall.displayName} failed`,
          ...mayRetryWithReplacementClient ? { content: [{ type: ToolResultContentType.Text, text: `The client that was running ${toolCall.displayName} disconnected, but another active client now provides ${toolCall.displayName}. You may try calling the tool again.` }] } : {},
          error: { message: `Client ${clientId} disconnected before completing ${toolCall.displayName}` }
        }
      });
    }
  }
  /**
   * Sends a JSON-RPC request to a connected client and waits for the response.
   * Used for reverse-RPC operations like reading client-side files.
   * Rejects if the client disconnects or the server is disposed.
   */
  _sendReverseRequest(clientId, method, params) {
    const client = this._getActiveClient(clientId);
    if (!client) {
      return Promise.reject(new Error(`Client ${clientId} is not connected`));
    }
    const id = ++this._reverseRequestId;
    return new Promise((resolve, reject) => {
      this._pendingReverseRequests.set(id, { client, resolve, reject });
      const request = { jsonrpc: "2.0", id, method, params };
      client.transport.send(request);
    });
  }
  /**
   * Rejects and clears all pending reverse-RPC requests sent over a given
   * connection.
   */
  _rejectPendingReverseRequestsForConnection(client) {
    for (const [id, pending] of this._pendingReverseRequests) {
      if (pending.client === client) {
        this._pendingReverseRequests.delete(id);
        pending.reject(new Error(`Client ${client.clientId} disconnected`));
      }
    }
  }
  _handleRequest(client, method, params, id) {
    const handler = this._requestHandlers.hasOwnProperty(method) ? this._requestHandlers[method] : void 0;
    if (handler) {
      handler(client, params).then((result) => {
        this._logService.trace(`[ProtocolServer] Request '${method}' id=${id} succeeded`);
        client.transport.send(jsonRpcSuccess(id, result ?? null));
      }).catch((err) => {
        if (shouldLogFailedRequest(method, params, err)) {
          this._logService.error(`[ProtocolServer] Request '${method}' failed`, err);
        }
        client.transport.send(jsonRpcErrorFrom(id, err));
      });
      return;
    }
    const extensionResult = this._handleExtensionRequest(method, params);
    if (extensionResult) {
      extensionResult.then((result) => {
        client.transport.send(jsonRpcSuccess(id, result ?? null));
      }).catch((err) => {
        this._logService.error(`[ProtocolServer] Extension request '${method}' failed`, err);
        client.transport.send(jsonRpcErrorFrom(id, err));
      });
      return;
    }
    const mcpChannel = readMcpChannel(params);
    if (mcpChannel !== void 0) {
      const paramsObj = isParamsObject(params) ? params : void 0;
      this._agentService.handleMcpRequest(mcpChannel, method, paramsObj).then((result) => {
        client.transport.send(jsonRpcSuccess(id, result ?? null));
      }).catch((err) => {
        if (err instanceof Error && err.message.startsWith("Method not found")) {
          client.transport.send(jsonRpcError(id, JsonRpcErrorCodes.MethodNotFound, err.message));
          return;
        }
        this._logService.error(`[ProtocolServer] mcp:// request '${method}' on ${mcpChannel} failed`, err);
        client.transport.send(jsonRpcErrorFrom(id, err));
      });
      return;
    }
    client.transport.send(jsonRpcError(id, JsonRpcErrorCodes.MethodNotFound, `Method not found: ${method}`));
  }
  /**
   * Handle VS Code extension methods that are not yet part of the typed
   * protocol. Returns a Promise if the method was recognized, undefined
   * otherwise.
   */
  _handleExtensionRequest(method, params) {
    if (this._config.allowExtensionMethods === false) {
      return void 0;
    }
    switch (method) {
      case "shutdown":
        return this._agentService.shutdown();
      case "getNetworkDiagnosticsInfo":
        return this._agentService.getNetworkDiagnosticsInfo();
      case "getManagedSettingsDiagnostics":
        return this._agentService.getManagedSettingsDiagnostics();
      case "diagnosticsFetch":
        return this._agentService.diagnosticsFetch(params.url);
      default:
        return void 0;
    }
  }
  // ---- Broadcasting -------------------------------------------------------
  _broadcastAction(envelope) {
    this._logService.trace(`[ProtocolServer] Broadcasting action: ${envelope.action.type}`);
    const msg = { jsonrpc: "2.0", method: "action", params: envelope };
    for (const record of this._clients.values()) {
      const client = this._getActiveClientFromRecord(record);
      if (client && this._isRelevantToClient(client, envelope)) {
        client.transport.send(msg);
      }
    }
  }
  _broadcastNotification(notification) {
    const { type, ...params } = notification;
    const msg = { jsonrpc: "2.0", method: type, params };
    for (const record of this._clients.values()) {
      this._getActiveClientFromRecord(record)?.transport.send(msg);
    }
  }
  /**
   * Forward an MCP server-originated notification (e.g.
   * `notifications/tools/list_changed`) over the AHP transport. The
   * `channel` field on `params` is the AHP routing envelope; the
   * receiving client demultiplexes by it. Notifications are broadcast
   * to every connected client — per-channel subscription filtering is
   * left to the client, since MCP notifications are cheap and the
   * client already knows which channels it cares about.
   */
  _broadcastMcpNotification(notification) {
    const params = { ...notification.params ?? {}, channel: notification.channel };
    const msg = { jsonrpc: "2.0", method: notification.method, params };
    for (const record of this._clients.values()) {
      this._getActiveClientFromRecord(record)?.transport.send(msg);
    }
  }
  /**
   * Drop a subscription identified by `channel` from `client`. Handles
   * canonicalisation for OTLP URIs (so an `unsubscribe` with a URI
   * variant collapses to the same entry as the original `subscribe`)
   * and tears down the agent-service refcount for state channels.
   */
  _removeSubscription(client, channel) {
    const classified = classifyChannel(channel);
    if (!classified) {
      return;
    }
    const sub = client.subscriptions.get(classified.uri);
    if (!sub) {
      return;
    }
    client.subscriptions.delete(classified.uri);
    if (sub.kind === "state" /* State */) {
      const record = this._clients.get(client.clientId);
      if (record && this._hasSubscriptionInOtherConnection(record, client, sub.uri)) {
        return;
      }
      this._agentService.unsubscribe(URI.parse(sub.uri), client.clientId);
      if (isAhpChatChannel(sub.uri)) {
        this._releaseActiveClientForSession(parseRequiredSessionUriFromChatUri(sub.uri), client.clientId, sub.uri);
      } else {
        const state = this._stateManager.getSessionState(sub.uri);
        for (const chat of state?.chats ?? []) {
          this._releaseActiveClientForSession(sub.uri, client.clientId, chat.resource);
        }
      }
    } else if (sub.kind === "resource-watch" /* ResourceWatch */) {
      this._agentService.onResourceWatchUnsubscribed(sub.uri);
    }
  }
  /**
   * Fan out an OTLP log record to every connected client that has
   * subscribed to a logs channel whose `{level}` band includes the
   * record's `severityNumber`. The notification's `channel` field is
   * the canonical URI the client subscribed against — clients can
   * route by URI without re-deriving the level.
   */
  _broadcastOtlpLog(record) {
    const payload = toResourceLogsPayload(record);
    for (const clientRecord of this._clients.values()) {
      const client = this._getActiveClientFromRecord(clientRecord);
      if (!client) {
        continue;
      }
      for (const sub of client.subscriptions.values()) {
        if (sub.kind !== "otlp-logs" /* OtlpLogs */) {
          continue;
        }
        if (record.severityNumber < levelToSeverityNumber(sub.level)) {
          continue;
        }
        const msg = {
          jsonrpc: "2.0",
          method: "otlp/exportLogs",
          params: { channel: sub.uri, payload }
        };
        client.transport.send(msg);
      }
    }
  }
  _isRelevantToClient(client, envelope) {
    const sub = client.subscriptions.get(envelope.channel);
    if (sub?.kind === "state" /* State */ || sub?.kind === "resource-watch" /* ResourceWatch */) {
      return true;
    }
    if (!isAhpRootChannel(envelope.channel)) {
      return false;
    }
    return isActionEnvelopeRelevantToSubscriptionUris(envelope, this._stateAndResourceWatchUris(client));
  }
  *_stateAndResourceWatchUris(client) {
    for (const sub of client.subscriptions.values()) {
      if (sub.kind === "state" /* State */ || sub.kind === "resource-watch" /* ResourceWatch */) {
        yield sub.uri;
      }
    }
  }
  dispose() {
    for (const record of this._clients.values()) {
      if (record.state === "active") {
        for (const connection of [...record.connections]) {
          connection.disposables.dispose();
        }
      } else {
        record.disconnectTimeouts.dispose();
      }
    }
    this._clients.clear();
    for (const [, pending] of this._pendingReverseRequests) {
      pending.reject(new Error("ProtocolServerHandler disposed"));
    }
    this._pendingReverseRequests.clear();
    this._replayBuffer.length = 0;
    super.dispose();
  }
};
ProtocolServerHandler = __decorateClass([
  __decorateParam(5, ILogService)
], ProtocolServerHandler);
export {
  ProtocolServerHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3Byb3RvY29sU2VydmVySGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzSnNvblJwY1Jlc3BvbnNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblJwY1Byb3RvY29sLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBSFBGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IGdldEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIHR5cGUgSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMsIHR5cGUgSUFnZW50U2VydmljZSwgdHlwZSBJTWNwTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0FjdGlvbkVudmVsb3BlUmVsZXZhbnRUb1N1YnNjcmlwdGlvblVyaXMgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFNvdXJjZUtpbmQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtY2hhdC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbW1hbmRNYXAgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvbWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uRW52ZWxvcGUsIEFjdGlvblR5cGUsIElOb3RpZmljYXRpb24sIGlzQW5ub3RhdGlvbnNBY3Rpb24sIGlzQ2hhbmdlc2V0QWN0aW9uLCBpc0NoYXRBY3Rpb24sIGlzU2Vzc2lvbkFjdGlvbiwgaXNUZXJtaW5hbEFjdGlvbiwgdHlwZSBDaGF0QWN0aW9uLCB0eXBlIENsaWVudEFubm90YXRpb25zQWN0aW9uLCB0eXBlIENsaWVudENoYW5nZXNldEFjdGlvbiwgdHlwZSBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIHR5cGUgU2Vzc2lvbkFjdGlvbiwgdHlwZSBUZXJtaW5hbEFjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQUk9UT0NPTF9WRVJTSU9OIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgbmVnb3RpYXRlUHJvdG9jb2xWZXJzaW9uIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vbmVnb3RpYXRpb24uanMnO1xuaW1wb3J0IHsgVlNDT0RFX1VQR1JBREVfTUVUSE9ELCB0eXBlIFVuc3VwcG9ydGVkUHJvdG9jb2xWZXJzaW9uRXJyb3JEYXRhRXggfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2xVcGdyYWRlLmpzJztcbmltcG9ydCB7IGdldEFnZW50SG9zdE1hbmFnZW1lbnRTb2NrZXRQYXRoLCByZXF1ZXN0QWdlbnRIb3N0VXBncmFkZSB9IGZyb20gJy4vYWdlbnRIb3N0VXBncmFkZUNoYW5uZWwuanMnO1xuaW1wb3J0IHtcblx0QUhQX0FVVEhfUkVRVUlSRUQsXG5cdEFocEVycm9yQ29kZXMsXG5cdEFIUF9QUk9WSURFUl9OT1RfRk9VTkQsXG5cdEFIUF9TRVNTSU9OX05PVF9GT1VORCxcblx0QUhQX1VOU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT04sXG5cdEpzb25ScGNSZXF1ZXN0LFxuXHRpc0pzb25ScGNOb3RpZmljYXRpb24sXG5cdGlzSnNvblJwY1JlcXVlc3QsXG5cdEpTT05fUlBDX0lOVEVSTkFMX0VSUk9SLFxuXHRKc29uUnBjRXJyb3JDb2Rlcyxcblx0UHJvdG9jb2xFcnJvcixcblx0dHlwZSBBaHBTZXJ2ZXJOb3RpZmljYXRpb24sXG5cdHR5cGUgSW5pdGlhbGl6ZVBhcmFtcyxcblx0dHlwZSBKc29uUnBjUmVzcG9uc2UsXG5cdHR5cGUgUmVjb25uZWN0UGFyYW1zLFxuXHR0eXBlIElTdGF0ZVNuYXBzaG90LFxuXHR0eXBlIFN1YnNjcmliZVJlc3VsdCxcblx0dHlwZSBMaXN0U2Vzc2lvbnNSZXN1bHQsXG59IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgaXNBaHBSZXNvdXJjZVdhdGNoQ2hhbm5lbCwgaXNBaHBSb290Q2hhbm5lbCwgUmVzcG9uc2VQYXJ0S2luZCwgU2Vzc2lvblN0YXR1cywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBidWlsZERlZmF1bHRDaGF0VXJpLCBpc0FocENoYXRDaGFubmVsLCBwYXJzZUNoYXRVcmksIHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmksIHR5cGUgSVNlc3Npb25XaXRoRGVmYXVsdENoYXQsIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElQcm90b2NvbFNlcnZlciwgSVByb3RvY29sVHJhbnNwb3J0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25UcmFuc3BvcnQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHtcblx0YnVpbGRPdGxwTG9nc0NoYW5uZWxVcmksXG5cdGV4dHJhY3RMZXZlbEZyb21PdGxwTG9nc1VyaSxcblx0bGV2ZWxUb1NldmVyaXR5TnVtYmVyLFxuXHRPVExQX0NIQU5ORUxfU0NIRU1FLFxuXHRPVExQX0xPR1NfQ0hBTk5FTF9URU1QTEFURSxcblx0T3RscExvZ0VtaXR0ZXIsXG5cdHRvUmVzb3VyY2VMb2dzUGF5bG9hZCxcblx0dHlwZSBJT3RscExvZ1JlY29yZCxcblx0dHlwZSBPdGxwTG9nTGV2ZWxOYW1lLFxufSBmcm9tICcuLi9jb21tb24vb3RscC9vdGxwTG9nRW1pdHRlci5qcyc7XG5pbXBvcnQgeyBpc0ZpbGVSZXNvdXJjZVJlYWQgfSBmcm9tICcuLi9jb21tb24vcmVzb3VyY2VSZWFkTG9nZ2luZy5qcyc7XG5pbXBvcnQgdHlwZSB7IEltcGxlbWVudGF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5cbi8qKiBEZWZhdWx0IGNhcGFjaXR5IG9mIHRoZSBzZXJ2ZXItc2lkZSBhY3Rpb24gcmVwbGF5IGJ1ZmZlci4gKi9cbmNvbnN0IFJFUExBWV9CVUZGRVJfQ0FQQUNJVFkgPSAxMDAwO1xuXG5jb25zdCBDTElFTlRfVE9PTF9DQUxMX0RJU0NPTk5FQ1RfVElNRU9VVCA9IDMwXzAwMDtcblxuLyoqXG4gKiBDbGllbnQtZGlzcGF0Y2hhYmxlIGFjdGlvbnMgdGhhdCBhcmUgZGVjbGFyZWQgaW4gdGhlIHByb3RvY29sIGJ1dCBub3QgeWV0XG4gKiBvcGVyYXRpb25hbCBpbiB0aGlzIGJ1aWxkLiBUaGUgbXVsdGlyb290IHdvcmtpbmctZGlyZWN0b3J5IG11dGF0aW9uc1xuICogKGBzZXNzaW9ufGNoYXQvd29ya2luZ0RpcmVjdG9yeVNldHxSZW1vdmVkYCkgd291bGQgbXV0YXRlIHRoZSBzeW5jaHJvbml6ZWRcbiAqIHdvcmtpbmctZGlyZWN0b3J5IHNldCB3aXRob3V0IHJlY29uZmlndXJpbmcgdGhlIGFnZW50J3MgYWN0dWFsIGRpcmVjdG9yeVxuICogYWNjZXNzLCBzbyB0aGV5IGFyZSByZWplY3RlZCBpbiB0aGUgZGlzcGF0Y2ggcGF0aCB1bnRpbCBjYXBhYmlsaXR5LWJhY2tlZFxuICogbXVsdGlyb290IHN1cHBvcnQgbGFuZHMuXG4gKi9cbmNvbnN0IFVOU1VQUE9SVEVEX0NMSUVOVF9BQ1RJT05fVFlQRVM6IFJlYWRvbmx5U2V0PEFjdGlvblR5cGU+ID0gbmV3IFNldChbXG5cdEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsXG5cdEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLFxuXHRBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5U2V0LFxuXHRBY3Rpb25UeXBlLkNoYXRXb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCxcbl0pO1xuXG4vKiogQSBjbGllbnQgdG9vbCBjYWxsIGluIGFueSBvZiB0aGVzZSBzdGF0dXNlcyBpcyBzdGlsbCBhd2FpdGluZyBpdHMgcmVzdWx0LiAqL1xuZnVuY3Rpb24gaXNQZW5kaW5nVG9vbENhbGxTdGF0dXMoc3RhdHVzOiBUb29sQ2FsbFN0YXR1cyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmdcblx0XHR8fCBzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmdcblx0XHR8fCBzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb247XG59XG5cbi8qKiBCdWlsZCBhIEpTT04tUlBDIHN1Y2Nlc3MgcmVzcG9uc2Ugc3VpdGFibGUgZm9yIHRyYW5zcG9ydC5zZW5kKCkuICovXG5mdW5jdGlvbiBqc29uUnBjU3VjY2VzcyhpZDogbnVtYmVyLCByZXN1bHQ6IHVua25vd24pOiBKc29uUnBjUmVzcG9uc2Uge1xuXHRyZXR1cm4geyBqc29ucnBjOiAnMi4wJywgaWQsIHJlc3VsdCB9O1xufVxuXG4vKiogQnVpbGQgYSBKU09OLVJQQyBlcnJvciByZXNwb25zZSBzdWl0YWJsZSBmb3IgdHJhbnNwb3J0LnNlbmQoKS4gKi9cbmZ1bmN0aW9uIGpzb25ScGNFcnJvcihpZDogbnVtYmVyLCBjb2RlOiBudW1iZXIsIG1lc3NhZ2U6IHN0cmluZywgZGF0YT86IHVua25vd24pOiBKc29uUnBjUmVzcG9uc2Uge1xuXHRyZXR1cm4geyBqc29ucnBjOiAnMi4wJywgaWQsIGVycm9yOiB7IGNvZGUsIG1lc3NhZ2UsIC4uLihkYXRhICE9PSB1bmRlZmluZWQgPyB7IGRhdGEgfSA6IHt9KSB9IH07XG59XG5cbi8qKiBCdWlsZCBhIEpTT04tUlBDIGVycm9yIHJlc3BvbnNlIGZyb20gYW4gdW5rbm93biB0aHJvd24gdmFsdWUsIHByZXNlcnZpbmcge0BsaW5rIFByb3RvY29sRXJyb3J9IGZpZWxkcy4gKi9cbmZ1bmN0aW9uIGpzb25ScGNFcnJvckZyb20oaWQ6IG51bWJlciwgZXJyOiB1bmtub3duKTogSnNvblJwY1Jlc3BvbnNlIHtcblx0aWYgKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpIHtcblx0XHRyZXR1cm4ganNvblJwY0Vycm9yKGlkLCBlcnIuY29kZSwgZXJyLm1lc3NhZ2UsIGVyci5kYXRhKTtcblx0fVxuXHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyAoZXJyLnN0YWNrID8/IGVyci5tZXNzYWdlKSA6IFN0cmluZyhlcnIpO1xuXHRyZXR1cm4ganNvblJwY0Vycm9yKGlkLCBKU09OX1JQQ19JTlRFUk5BTF9FUlJPUiwgbWVzc2FnZSk7XG59XG5cbmZ1bmN0aW9uIHNob3VsZExvZ0ZhaWxlZFJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogdW5rbm93biwgZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdGlmICghKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpIHx8IGVyci5jb2RlICE9PSBBaHBFcnJvckNvZGVzLk5vdEZvdW5kIHx8ICFpc0ZpbGVSZXNvdXJjZVJlYWQobWV0aG9kLCBwYXJhbXMpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vKiogVHJ1ZSB3aGVuIGB2YWx1ZWAgaXMgYSBub24tbnVsbCBwYXJhbXMgb2JqZWN0IChhcyBvcHBvc2VkIHRvIGFuIGFycmF5IG9yIHByaW1pdGl2ZSkuICovXG5mdW5jdGlvbiBpc1BhcmFtc09iamVjdCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGBjaGFubmVsYCBVUkkgY2FycmllZCBvbiBhIHJlcXVlc3QncyBwYXJhbXMgd2hlbiBpdCBpcyBhblxuICogYG1jcDovL2AgY2hhbm5lbCBcdTIwMTQgdGhlIEFIUCByb3V0aW5nIGVudmVsb3BlIGZvciByYXcgTUNQIHJlcXVlc3RzXG4gKiB0dW5uZWxsZWQgb3ZlciB0aGUgSlNPTi1SUEMgY29ubmVjdGlvbi4gUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgYW55XG4gKiBvdGhlciBwYXJhbXMgc2hhcGUuXG4gKi9cbmZ1bmN0aW9uIHJlYWRNY3BDaGFubmVsKHBhcmFtczogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghaXNQYXJhbXNPYmplY3QocGFyYW1zKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY2hhbm5lbCA9IHBhcmFtc1snY2hhbm5lbCddO1xuXHRpZiAodHlwZW9mIGNoYW5uZWwgIT09ICdzdHJpbmcnIHx8ICFjaGFubmVsLnN0YXJ0c1dpdGgoJ21jcDovLycpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gY2hhbm5lbDtcbn1cblxuLyoqXG4gKiBNZXRob2RzIGhhbmRsZWQgYnkgdGhlIHJlcXVlc3QgZGlzcGF0Y2hlci4gRXhjbHVkZXMgYGluaXRpYWxpemVgLFxuICogYHJlY29ubmVjdGAsIGFuZCBgcGluZ2AsIHdoaWNoIGFyZSBoYW5kbGVkIGRpcmVjdGx5IGR1cmluZyBtZXNzYWdlXG4gKiBkaXNwYXRjaCB3aXRob3V0IHJlcXVpcmluZyBhbiBlc3RhYmxpc2hlZCBjbGllbnQgY29udGV4dC5cbiAqL1xudHlwZSBSZXF1ZXN0TWV0aG9kID0gRXhjbHVkZTxrZXlvZiBDb21tYW5kTWFwLCAnaW5pdGlhbGl6ZScgfCAncmVjb25uZWN0JyB8ICdwaW5nJz47XG5cbi8qKlxuICogVHlwZWQgaGFuZGxlciBtYXA6IGVhY2gga2V5IGlzIGEgcmVxdWVzdCBtZXRob2QsIGVhY2ggdmFsdWUgaXMgYSBoYW5kbGVyXG4gKiB0aGF0IHJlY2VpdmVzIHRoZSBjb3JyZWN0bHktdHlwZWQgcGFyYW1zIGFuZCBtdXN0IHJldHVybiB0aGUgY29ycmVjdGx5LXR5cGVkXG4gKiByZXN1bHQuIFRoZSBjb21waWxlciB3aWxsIGVycm9yIGlmIGEgaGFuZGxlciByZXR1cm5zIHRoZSB3cm9uZyBzaGFwZS5cbiAqL1xudHlwZSBSZXF1ZXN0SGFuZGxlck1hcCA9IHtcblx0W00gaW4gUmVxdWVzdE1ldGhvZF06IChjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQsIHBhcmFtczogQ29tbWFuZE1hcFtNXVsncGFyYW1zJ10pID0+IFByb21pc2U8Q29tbWFuZE1hcFtNXVsncmVzdWx0J10+O1xufTtcblxuLyoqXG4gKiBEaXNjcmltaW5hbnQgZm9yIHtAbGluayBDaGFubmVsU3Vic2NyaXB0aW9ufS4gRGlzdGluZ3Vpc2hlcyBhIHJlZ3VsYXJcbiAqIHN0YXRlLWJlYXJpbmcgY2hhbm5lbCAocm9vdCwgc2Vzc2lvbiwgdGVybWluYWwsIGNoYW5nZXNldCkgZnJvbSB0aGVcbiAqIHN0YXRlbGVzcyBPVExQIHNpZ25hbCBjaGFubmVscyBzbyBlYWNoIHN1YnNjcmliZS91bnN1YnNjcmliZSBwYXRoIGNhblxuICogZGlzcGF0Y2ggdGhyb3VnaCBhIHNpbmdsZSB0eXBlZCBsb29rdXAuXG4gKi9cbmNvbnN0IGVudW0gQ2hhbm5lbEtpbmQge1xuXHQvKipcblx0ICogU3Vic2NyaWJlZCB2aWEge0BsaW5rIElBZ2VudFNlcnZpY2Uuc3Vic2NyaWJlfSBhbmQgdHJhY2tlZCBieSB0aGVcblx0ICogc2VydmVyLXNpZGUgcmVmY291bnQuIENhcnJpZXMgcmVwbGF5YWJsZSBzdGF0ZSwgcGFydGljaXBhdGVzIGluXG5cdCAqIGFjdGlvbiBicm9hZGNhc3RzICh7QGxpbmsgX2Jyb2FkY2FzdEFjdGlvbn0pIGFuZCByZWNvbm5lY3Rcblx0ICogc25hcHNob3QvcmVwbGF5LlxuXHQgKi9cblx0U3RhdGUgPSAnc3RhdGUnLFxuXHQvKipcblx0ICogUmVzb3VyY2Utd2F0Y2ggY2hhbm5lbHMgKGBhaHAtcmVzb3VyY2Utd2F0Y2g6LzxpZD5gKS4gVHJhY2tlZFxuXHQgKiBzZXBhcmF0ZWx5IHNvIHN1YnNjcmliZS91bnN1YnNjcmliZSByb3V0ZXMgdGhyb3VnaCB0aGUgYWdlbnRcblx0ICogc2VydmljZSdzIHBlci13YXRjaCByZWZjb3VudCArIGdyYWNlIHRpbWVyIHJhdGhlciB0aGFuIHRoZVxuXHQgKiBzZXNzaW9uLXNoYXBlZCB7QGxpbmsgSUFnZW50U2VydmljZS5zdWJzY3JpYmV9IHBhdGguXG5cdCAqL1xuXHRSZXNvdXJjZVdhdGNoID0gJ3Jlc291cmNlLXdhdGNoJyxcblx0LyoqXG5cdCAqIFN1YnNjcmliZWQgYWdhaW5zdCB0aGUgT1RMUCBsb2dzIGNoYW5uZWwgdGVtcGxhdGUgYWR2ZXJ0aXNlZCBpblxuXHQgKiB7QGxpbmsgSW5pdGlhbGl6ZVJlc3VsdC50ZWxlbWV0cnl9LiBTdGF0ZWxlc3MgXHUyMDE0IG5vIHNuYXBzaG90LCBub1xuXHQgKiBhZ2VudC1zZXJ2aWNlIHJlZmNvdW50LiBUaGUgYGxldmVsYCBmaWVsZCByZWNvcmRzIHRoZSBtaW5pbXVtXG5cdCAqIHNldmVyaXR5IHRoZSBjbGllbnQgYXNrZWQgdG8gcmVjZWl2ZS5cblx0ICovXG5cdE90bHBMb2dzID0gJ290bHAtbG9ncycsXG59XG5cbi8qKlxuICogUGVyLWNoYW5uZWwgc2VydmVyLXNpZGUgc3Vic2NyaXB0aW9uIHJlY29yZC4gU3RvcmVkIG9uIGV2ZXJ5XG4gKiB7QGxpbmsgSUNvbm5lY3RlZENsaWVudH0gc28gZWFjaCBzdWJzY3JpYmVkIGNoYW5uZWwgY2FuIGJlIHJvdXRlZCBieVxuICogaXRzIGBraW5kYCB3aXRob3V0IHJlLWRlcml2aW5nIGl0IGZyb20gdGhlIFVSSSBvbiBldmVyeSBkaXNwYXRjaC5cbiAqXG4gKiBgdXJpYCBpcyB0aGUgY2Fub25pY2FsIGNoYW5uZWwgVVJJIHN0cmluZyB1c2VkIGV2ZXJ5d2hlcmUgYSBzdWJzY3JpcHRpb25cbiAqIGlzIHJlZmVyZW5jZWQgXHUyMDE0IHRoZSBzYW1lIHN0cmluZyBpcyBicm9hZGNhc3Qgb24gb3V0Ym91bmQgbm90aWZpY2F0aW9uc1xuICogYW5kIHBlcnNpc3RzIGFjcm9zcyByZWNvbm5lY3RzLlxuICovXG50eXBlIENoYW5uZWxTdWJzY3JpcHRpb24gPVxuXHR8IHsgcmVhZG9ubHkga2luZDogQ2hhbm5lbEtpbmQuU3RhdGU7IHJlYWRvbmx5IHVyaTogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IENoYW5uZWxLaW5kLlJlc291cmNlV2F0Y2g7IHJlYWRvbmx5IHVyaTogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IENoYW5uZWxLaW5kLk90bHBMb2dzOyByZWFkb25seSB1cmk6IHN0cmluZzsgcmVhZG9ubHkgbGV2ZWw6IE90bHBMb2dMZXZlbE5hbWUgfTtcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgY29ubmVjdGVkIHByb3RvY29sIGNsaWVudCB3aXRoIGl0cyBzdWJzY3JpcHRpb24gc3RhdGUuXG4gKi9cbmludGVyZmFjZSBJQ29ubmVjdGVkQ2xpZW50IHtcblx0cmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgY2xpZW50SW5mbzogSW1wbGVtZW50YXRpb24gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHByb3RvY29sVmVyc2lvbjogc3RyaW5nO1xuXHRyZWFkb25seSB0cmFuc3BvcnQ6IElQcm90b2NvbFRyYW5zcG9ydDtcblx0LyoqXG5cdCAqIEV2ZXJ5IGNoYW5uZWwgdGhlIGNsaWVudCBpcyBjdXJyZW50bHkgc3Vic2NyaWJlZCB0bywga2V5ZWQgYnkgdGhlXG5cdCAqIGNhbm9uaWNhbCBjaGFubmVsIFVSSS4gT1RMUCBjaGFubmVsIFVSSXMgYXJlIGNhbm9uaWNhbGlzZWQgdG9cblx0ICogYGJ1aWxkT3RscExvZ3NDaGFubmVsVXJpKGxldmVsKWAgc28gVVJJIHZhcmlhbnRzIHRoYXQgcmVzb2x2ZSB0b1xuXHQgKiB0aGUgc2FtZSBsb2dpY2FsIGNoYW5uZWwgY29sbGFwc2UgdG8gb25lIGVudHJ5LlxuXHQgKi9cblx0cmVhZG9ubHkgc3Vic2NyaXB0aW9uczogTWFwPHN0cmluZywgQ2hhbm5lbFN1YnNjcmlwdGlvbj47XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbi8qKlxuICogUGVyLWNsaWVudCBzZXJ2ZXItc2lkZSByZWNvcmQsIGtleWVkIGJ5IGNsaWVudElkIGluXG4gKiB7QGxpbmsgUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyLl9jbGllbnRzfS4gVW5saWtlIHtAbGluayBJQ29ubmVjdGVkQ2xpZW50fSxcbiAqIHRoZSByZWNvcmQgT1VUTElWRVMgaW5kaXZpZHVhbCB0cmFuc3BvcnRzOiBtdWx0aXBsZSBvdmVybGFwcGluZyB0cmFuc3BvcnRzXG4gKiBmb3IgdGhlIHNhbWUgbG9naWNhbCBjbGllbnQgYXJlIGhlbGQgb2xkZXN0LWZpcnN0LCB3aXRoIHRoZSBhY3RpdmUgdHJhbnNwb3J0XG4gKiBhdCB0aGUgZW5kLiBXaGVuIHRoZSBsYXN0IHRyYW5zcG9ydCBkaXNjb25uZWN0cywgdGhlIHJlY29yZCBpcyByZXRhaW5lZFxuICogKHVudGlsIHBydW5lZCkgc28gdGhlIHRvb2wtY2FsbCBkaXNjb25uZWN0LWdyYWNlIG1hY2hpbmVyeSBjYW4gY29tcHV0ZSB0aGVcbiAqIHJlbWFpbmluZyB3aW5kb3cgYW5kIGhvbGQgYW55IGFybWVkIHRpbWVvdXRzLlxuICpcbiAqIEEgY2xpZW50IGlzIGluIGV4YWN0bHkgb25lIG9mIHR3byBzdGF0ZXMsIHdoaWNoIG1ha2VzIHRoZSBjb3JlIGludmFyaWFudFxuICogdW5yZXByZXNlbnRhYmxlIGluIHRoZSB3cm9uZyBzaGFwZTogYSBjbGllbnQgZWl0aGVyIGhhcyBvbmUgb3IgbW9yZSBsaXZlXG4gKiB0cmFuc3BvcnRzICh7QGxpbmsgSUFjdGl2ZUNsaWVudFJlY29yZH0sIG5ldmVyIGFueSBkaXNjb25uZWN0LWdyYWNlIHRpbWVycylcbiAqIG9yIGhhcyBubyB0cmFuc3BvcnQgYW5kIGlzIHdpdGhpbiBpdHMgZGlzY29ubmVjdC1ncmFjZSB3aW5kb3dcbiAqICh7QGxpbmsgSUdyYWNlQ2xpZW50UmVjb3JkfSwgbmV2ZXIgYW55IGNvbm5lY3Rpb25zKS4gVHJhbnNpdGlvbnMgaGFwcGVuIG9ubHlcbiAqIGluIHtAbGluayBQcm90b2NvbFNlcnZlckhhbmRsZXIuX2F0dGFjaENvbm5lY3Rpb259IChcdTIxOTIgYWN0aXZlLCB3aGljaCBkaXNwb3Nlc1xuICogYW55IGdyYWNlIHRpbWVycykgYW5kIHRoZSB0cmFuc3BvcnQgYG9uQ2xvc2VgIGhhbmRsZXIgKFx1MjE5MiBncmFjZSwgb25jZSB0aGUgbGFzdFxuICogdHJhbnNwb3J0IGlzIGdvbmUpLlxuICovXG50eXBlIElDbGllbnRSZWNvcmQgPSBJQWN0aXZlQ2xpZW50UmVjb3JkIHwgSUdyYWNlQ2xpZW50UmVjb3JkO1xuXG5pbnRlcmZhY2UgSUFjdGl2ZUNsaWVudFJlY29yZCB7XG5cdHJlYWRvbmx5IHN0YXRlOiAnYWN0aXZlJztcblx0Y2xpZW50SW5mbzogSW1wbGVtZW50YXRpb24gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBMaXZlIHRyYW5zcG9ydHMgZm9yIHRoaXMgY2xpZW50LCBvbGRlc3QgZmlyc3QuIFRoZSBhY3RpdmUgY29ubmVjdGlvbiBpc1xuXHQgKiB0aGUgbGFzdCBlbnRyeSAobW9zdCByZWNlbnQgd2lucykuIE9sZGVyIGVudHJpZXMgYXJlIGtlcHQgc28gdGhhdCBpZiBhXG5cdCAqIHJlY29ubmVjdGluZyBjbGllbnQgcmVnaXN0ZXJzIGBBYCwgdGhlbiBgQmAsIHRoZW4gYEJgIGNsb3NlcyBmaXJzdCwgd2UgY2FuXG5cdCAqIGZhbGwgYmFjayB0byBgQWAgaW5zdGVhZCBvZiB0cmVhdGluZyB0aGUgY2xpZW50IGFzIGRpc2Nvbm5lY3RlZC4gTmV2ZXJcblx0ICogZW1wdHk6IHJlbW92aW5nIHRoZSBsYXN0IHRyYW5zcG9ydCBwcm9tb3RlcyB0aGUgcmVjb3JkIHRvIGEgZ3JhY2UgcmVjb3JkLlxuXHQgKi9cblx0cmVhZG9ubHkgY29ubmVjdGlvbnM6IElDb25uZWN0ZWRDbGllbnRbXTtcbn1cblxuaW50ZXJmYWNlIElHcmFjZUNsaWVudFJlY29yZCB7XG5cdHJlYWRvbmx5IHN0YXRlOiAnZ3JhY2UnO1xuXHRyZWFkb25seSBjbGllbnRJbmZvOiBJbXBsZW1lbnRhdGlvbiB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIEVwb2NoIG1zIHdoZW4gdGhlIGNsaWVudCBsYXN0IGhhZCBhIGxpdmUgdHJhbnNwb3J0LCBvciB3aGVuIHRoaXMgcmVjb3JkXG5cdCAqIHdhcyBjcmVhdGVkIGZvciBhIG5ldmVyLWNvbm5lY3RlZCBvcnBoYW4gdG9vbC1jYWxsIHN0YW1wLiBQaW5zIHRoZSBncmFjZVxuXHQgKiBjbG9jayBzbyByZS1hcm1zIHRyaWdnZXJlZCBieSBsYXRlciBvcnBoYW5lZCB0b29sIGNhbGxzIHNocmluayB0aGVcblx0ICogcmVtYWluaW5nIHdpbmRvdyBpbnN0ZWFkIG9mIHJlc2V0dGluZyBpdC4gRHJpdmVzIHRoZSBkaXNjb25uZWN0LXRpbWVvdXRcblx0ICogZGVsYXkgKHJlc2lkdWFsIHdpbmRvdyBmcm9tIHRoaXMgaW5zdGFudCkuXG5cdCAqL1xuXHRsYXN0U2VlbkF0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBQZW5kaW5nIHRvb2wtY2FsbCBkaXNjb25uZWN0IHRpbWVvdXRzIG93bmVkIGJ5IHRoaXMgY2xpZW50LCBrZXllZCBieVxuXHQgKiBzZXNzaW9uIFVSSS4gQXJtZWQgd2hlbiB0aGUgY2xpZW50IG93bnMgYSBwZW5kaW5nIGNsaWVudCB0b29sIGNhbGwgYnV0IGlzXG5cdCAqIG5vdCBjb25uZWN0ZWQ7IGZpcmVzIGEgZmFpbGluZyBjb21wbGV0aW9uIGlmIGl0IGRvZXMgbm90IChyZSljb25uZWN0XG5cdCAqIHdpdGhpbiB0aGUgZ3JhY2Ugd2luZG93LiBSZWNvbm5lY3RpbmcgcHJvbW90ZXMgdGhlIHJlY29yZCB0byBhY3RpdmUgYW5kXG5cdCAqIGRpc3Bvc2VzIHRoZXNlIHRpbWVycyAodGhlIGdyYWNlIHdpbmRvdyBubyBsb25nZXIgYXBwbGllcyBvbmNlIGEgdHJhbnNwb3J0XG5cdCAqIGlzIGxpdmUpLiBEaXNwb3NpbmcgYW4gZW50cnkgKG9yIHRoZSB3aG9sZSBtYXApIGNsZWFycyB0aGUgdGltZXIuXG5cdCAqL1xuXHRyZWFkb25seSBkaXNjb25uZWN0VGltZW91dHM6IERpc3Bvc2FibGVNYXA8c3RyaW5nPjtcbn1cblxuLyoqXG4gKiBDbGFzc2lmaWVzIGEgcmF3IGNoYW5uZWwgVVJJIHN0cmluZyBpbnRvIGl0cyB7QGxpbmsgQ2hhbm5lbEtpbmR9IGFuZFxuICogcmV0dXJucyB0aGUgY2Fub25pY2FsIFVSSSB0byBrZXkgc3Vic2NyaXB0aW9ucyBieS4gUmV0dXJucyBgdW5kZWZpbmVkYFxuICogd2hlbiB0aGUgY2hhbm5lbCBpcyBPVExQLWZsYXZvdXJlZCBidXQgdGhlIFVSSSBkb2VzIG5vdCBwYXJzZSBpbnRvIGFcbiAqIHN1cHBvcnRlZCBzaGFwZSAodW5rbm93biBsZXZlbCwgbWlzc2luZyBwYXRoKSBzbyB0aGUgY2FsbGVyIGNhblxuICogc2lsZW50bHkgZHJvcCB0aGUgc3Vic2NyaWJlIHJhdGhlciB0aGFuIGluc3RhbGxpbmcgYSBicm9rZW4gZW50cnkuXG4gKlxuICogRm9yIHN0YXRlIGNoYW5uZWxzIHRoZSBjYW5vbmljYWwgVVJJIGlzIGp1c3QgdGhlIGlucHV0IHZlcmJhdGltIFx1MjAxNCB0aGVcbiAqIGFnZW50IHNlcnZpY2UgaXMgdGhlIGF1dGhvcml0YXRpdmUgZGVkdXBsaWNhdGlvbiBwb2ludCBhbmQgdG9sZXJhdGVzXG4gKiB3aGF0ZXZlciBVUkkgZm9ybSB0aGUgY2xpZW50IHNlbnQuXG4gKi9cbmZ1bmN0aW9uIGNsYXNzaWZ5Q2hhbm5lbChjaGFubmVsOiBzdHJpbmcpOiBDaGFubmVsU3Vic2NyaXB0aW9uIHwgdW5kZWZpbmVkIHtcblx0aWYgKGNoYW5uZWwudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKGAke09UTFBfQ0hBTk5FTF9TQ0hFTUV9OmApKSB7XG5cdFx0Y29uc3QgbGV2ZWwgPSBleHRyYWN0TGV2ZWxGcm9tT3RscExvZ3NVcmkoY2hhbm5lbCk7XG5cdFx0aWYgKCFsZXZlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2luZDogQ2hhbm5lbEtpbmQuT3RscExvZ3MsIHVyaTogYnVpbGRPdGxwTG9nc0NoYW5uZWxVcmkobGV2ZWwpLCBsZXZlbCB9O1xuXHR9XG5cdGlmIChpc0FocFJlc291cmNlV2F0Y2hDaGFubmVsKGNoYW5uZWwpKSB7XG5cdFx0cmV0dXJuIHsga2luZDogQ2hhbm5lbEtpbmQuUmVzb3VyY2VXYXRjaCwgdXJpOiBjaGFubmVsIH07XG5cdH1cblx0cmV0dXJuIHsga2luZDogQ2hhbm5lbEtpbmQuU3RhdGUsIHVyaTogY2hhbm5lbCB9O1xufVxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gZm9yIHByb3RvY29sLWxldmVsIGNvbmNlcm5zIG91dHNpZGUgb2YgSUFnZW50U2VydmljZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUHJvdG9jb2xTZXJ2ZXJDb25maWcge1xuXHQvKiogRGVmYXVsdCBkaXJlY3RvcnkgcmV0dXJuZWQgdG8gY2xpZW50cyBkdXJpbmcgdGhlIGluaXRpYWxpemUgaGFuZHNoYWtlLiAqL1xuXHRyZWFkb25seSBkZWZhdWx0RGlyZWN0b3J5Pzogc3RyaW5nO1xuXHQvKipcblx0ICogV2hldGhlciB0byBleHBvc2UgVlMgQ29kZSBleHRlbnNpb24gbWV0aG9kcyBvdXRzaWRlIHRoZSBBZ2VudCBIb3N0IFByb3RvY29sLlxuXHQgKiBEZWZhdWx0cyB0byBgdHJ1ZWAgZm9yIGV4aXN0aW5nIHJlbW90ZSBsaXN0ZW5lcnMuXG5cdCAqL1xuXHRyZWFkb25seSBhbGxvd0V4dGVuc2lvbk1ldGhvZHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ2hhcmFjdGVycyB0aGF0LCB3aGVuIHR5cGVkIGluIGEge0BsaW5rIFVzZXJNZXNzYWdlfSBpbnB1dCwgU0hPVUxEXG5cdCAqIGNhdXNlIHRoZSBjbGllbnQgdG8gaXNzdWUgYSBgY29tcGxldGlvbnNgIHJlcXVlc3QuIEFubm91bmNlZCB0b1xuXHQgKiBjbGllbnRzIGluIHRoZSBgaW5pdGlhbGl6ZWAgcmVzcG9uc2UuXG5cdCAqL1xuXHRyZWFkb25seSBjb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqXG5cdCAqIFByZWZpeCB0aGF0IG1hcmtzIGEgdXNlciBtZXNzYWdlIGFzIGEgaG9zdCB0ZXJtaW5hbCBjb21tYW5kLlxuXHQgKi9cblx0cmVhZG9ubHkgdGVybWluYWxDb21tYW5kUHJlZml4Pzogc3RyaW5nO1xuXHQvKipcblx0ICogT3B0aW9uYWwgZW1pdHRlciB0byB1c2UgYXMgdGhlIHNvdXJjZSBmb3IgdGhlIE9UTFAgbG9ncyBjaGFubmVsXG5cdCAqIGFkdmVydGlzZWQgdmlhIGBJbml0aWFsaXplUmVzdWx0LnRlbGVtZXRyeS5sb2dzYC4gV2hlbiBwcmVzZW50LCB0aGlzXG5cdCAqIGhhbmRsZXIgd2lsbCByb3V0ZSBgc3Vic2NyaWJlYC9gdW5zdWJzY3JpYmVgIHJlcXVlc3RzIG9uXG5cdCAqIGBhaHAtb3RscDpgIGNoYW5uZWxzIHRvIGl0cyBpbnRlcm5hbCBPVExQIHN1YnNjcmlwdGlvbiByZWdpc3RyeSBhbmRcblx0ICogYnJvYWRjYXN0IGV2ZXJ5IHJlY29yZCBmZWQgaW50byB0aGUgZW1pdHRlciBhcyBhblxuXHQgKiBgb3RscC9leHBvcnRMb2dzYCBub3RpZmljYXRpb24uIFdoZW4gYWJzZW50LCB0aGUgT1RMUCBjaGFubmVsIGlzXG5cdCAqIG5vdCBhZHZlcnRpc2VkIGFuZCBhbnkgaW5ib3VuZCBgYWhwLW90bHA6YCBzdWJzY3JpYmUgcmVxdWVzdCBpc1xuXHQgKiByZWplY3RlZC5cblx0ICovXG5cdHJlYWRvbmx5IG90bHBMb2dFbWl0dGVyPzogT3RscExvZ0VtaXR0ZXI7XG59XG5cbi8qKlxuICogU2VydmVyLXNpZGUgaGFuZGxlciB0aGF0IG1hbmFnZXMgcHJvdG9jb2wgY29ubmVjdGlvbnMsIHJvdXRlcyBKU09OLVJQQ1xuICogbWVzc2FnZXMgdG8gdGhlIGFnZW50IHNlcnZpY2UsIGFuZCBicm9hZGNhc3RzIGFjdGlvbnMvbm90aWZpY2F0aW9uc1xuICogdG8gc3Vic2NyaWJlZCBjbGllbnRzLlxuICovXG5leHBvcnQgY2xhc3MgUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIFBlci1jbGllbnQgcmVjb3JkcyBrZXllZCBieSBjbGllbnRJZC4gSG9sZHMgYm90aCBjb25uZWN0ZWQgY2xpZW50c1xuXHQgKiAoYGNvbm5lY3Rpb25zYCBub24tZW1wdHkpIGFuZCByZWNlbnRseS1kaXNjb25uZWN0ZWQgb25lcyByZXRhaW5lZCBmb3IgdGhlXG5cdCAqIHRvb2wtY2FsbCBkaXNjb25uZWN0LWdyYWNlIHdpbmRvdyAoYGNvbm5lY3Rpb25zLmxlbmd0aCA9PT0gMGApLiBTZWVcblx0ICoge0BsaW5rIElDbGllbnRSZWNvcmR9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2xpZW50UmVjb3JkPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXBsYXlCdWZmZXI6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbm5lY3Rpb25Db3VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cblx0LyoqIEZpcmVzIHdpdGggdGhlIGN1cnJlbnQgY2xpZW50IGNvdW50IHdoZW5ldmVyIGEgY2xpZW50IGNvbm5lY3RzIG9yIGRpc2Nvbm5lY3RzLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25Db3VudCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50U2VydmljZTogSUFnZW50U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXI6IElQcm90b2NvbFNlcnZlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWc6IElQcm90b2NvbFNlcnZlckNvbmZpZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jbGllbnRGaWxlU3lzdGVtUHJvdmlkZXI6IEFIUEZpbGVTeXN0ZW1Qcm92aWRlcixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXJ2ZXIub25Db25uZWN0aW9uKHRyYW5zcG9ydCA9PiB7XG5cdFx0XHR0aGlzLl9oYW5kbGVOZXdDb25uZWN0aW9uKHRyYW5zcG9ydCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IHtcblx0XHRcdHRoaXMuX3JlcGxheUJ1ZmZlci5wdXNoKGVudmVsb3BlKTtcblx0XHRcdGlmICh0aGlzLl9yZXBsYXlCdWZmZXIubGVuZ3RoID4gUkVQTEFZX0JVRkZFUl9DQVBBQ0lUWSkge1xuXHRcdFx0XHR0aGlzLl9yZXBsYXlCdWZmZXIuc2hpZnQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2Jyb2FkY2FzdEFjdGlvbihlbnZlbG9wZSk7XG5cdFx0XHQvLyBBIGNsaWVudCB0b29sIGNhbGwgbWF5IGJlIGlzc3VlZCBmb3IgYSBjbGllbnQgdGhhdCBpcyBubyBsb25nZXJcblx0XHRcdC8vIGNvbm5lY3RlZCBcdTIwMTQgZS5nLiBhIHN0YWxlIHN0YW1wIGZyb20gYSB3aW5kb3cgdGhhdCByZWxvYWRlZC4gVGhlXG5cdFx0XHQvLyBsaXZlLWRpc2Nvbm5lY3QgcGF0aCAoYF9oYW5kbGVDbGllbnREaXNjb25uZWN0ZWRgKSBkb2VzIG5vdCBjb3ZlclxuXHRcdFx0Ly8gdGhlc2UgYmVjYXVzZSBubyBkaXNjb25uZWN0IGV2ZW50IGZpcmVzIGZvciBhbiBhbHJlYWR5LWdvbmVcblx0XHRcdC8vIGNsaWVudC4gRGV0ZWN0IHRoZSBvcnBoYW4gYXQgaXNzdWFuY2UgdGltZSBhbmQgYXJtIHRoZSBzYW1lXG5cdFx0XHQvLyBncmFjZS1wZXJpb2QgdGltZW91dCBzbyB0aGUgY2FsbCBjYW5ub3QgaGFuZyBmb3JldmVyLiBDYWxsc1xuXHRcdFx0Ly8gc3RhbXBlZCB3aGlsZSBubyBjbGllbnQgaXMgY29ubmVjdGVkIGFyZSBmYWlsZWQgaW1tZWRpYXRlbHkgYnlcblx0XHRcdC8vIHRoZSBwcm92aWRlciwgc28gdGhleSBuZXZlciByZWFjaCB0aGlzIHBhdGguXG5cdFx0XHRpZiAoZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQgfHwgZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkpIHtcblx0XHRcdFx0aWYgKCFpc0FocENoYXRDaGFubmVsKGVudmVsb3BlLmNoYW5uZWwpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbUHJvdG9jb2xTZXJ2ZXJdIENoYXQgdG9vbC1jYWxsIGFjdGlvbiBlbWl0dGVkIG9uIG5vbi1jaGF0IGNoYW5uZWw6ICR7ZW52ZWxvcGUuY2hhbm5lbH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jaGVja09ycGhhbmVkQ2xpZW50VG9vbENhbGxzKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoZW52ZWxvcGUuY2hhbm5lbCksIGVudmVsb3BlLmNoYW5uZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlTWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obm90aWZpY2F0aW9uID0+IHtcblx0XHRcdHRoaXMuX2Jyb2FkY2FzdE5vdGlmaWNhdGlvbihub3RpZmljYXRpb24pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FnZW50U2VydmljZS5vbk1jcE5vdGlmaWNhdGlvbihub3RpZmljYXRpb24gPT4ge1xuXHRcdFx0dGhpcy5fYnJvYWRjYXN0TWNwTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbik7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuX2NvbmZpZy5vdGxwTG9nRW1pdHRlcikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlnLm90bHBMb2dFbWl0dGVyLm9uRGlkTG9nKHJlY29yZCA9PiB0aGlzLl9icm9hZGNhc3RPdGxwTG9nKHJlY29yZCkpKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIENvbm5lY3Rpb24gaGFuZGxpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX2hhbmRsZU5ld0Nvbm5lY3Rpb24odHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRyYW5zcG9ydC5vbk1lc3NhZ2UobXNnID0+IHtcblx0XHRcdGlmIChpc0pzb25ScGNSZXF1ZXN0KG1zZykpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1Byb3RvY29sU2VydmVyXSByZXF1ZXN0OiBtZXRob2Q9JHttc2cubWV0aG9kfSBpZD0ke21zZy5pZH1gKTtcblxuXHRcdFx0XHQvLyBQaW5nIGlzIHN0YXRlbGVzcyBhbmQgTVVTVCBiZSBhbnN3ZXJhYmxlIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlclxuXHRcdFx0XHQvLyB0aGUgY29ubmVjdGlvbiBoYXMgYmVlbiBpbml0aWFsaXplZC4gQ2FycmllcyBubyBwYXlsb2FkIFx1MjAxNCB0aGVcblx0XHRcdFx0Ly8gcm91bmQtdHJpcCBpdHNlbGYgaXMgdGhlIGxpdmVuZXNzIHNpZ25hbC5cblx0XHRcdFx0aWYgKG1zZy5tZXRob2QgPT09ICdwaW5nJykge1xuXHRcdFx0XHRcdHRyYW5zcG9ydC5zZW5kKGpzb25ScGNTdWNjZXNzKG1zZy5pZCwgbnVsbCkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEhhbmRsZSBpbml0aWFsaXplL3JlY29ubmVjdCBhcyByZXF1ZXN0cyB0aGF0IHNldCB1cCB0aGUgY2xpZW50XG5cdFx0XHRcdGlmICghY2xpZW50ICYmIG1zZy5tZXRob2QgPT09ICdpbml0aWFsaXplJykge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9oYW5kbGVJbml0aWFsaXplKG1zZy5wYXJhbXMsIHRyYW5zcG9ydCwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdFx0Y2xpZW50ID0gcmVzdWx0LmNsaWVudDtcblx0XHRcdFx0XHRcdHRyYW5zcG9ydC5zZW5kKGpzb25ScGNTdWNjZXNzKG1zZy5pZCwgcmVzdWx0LnJlc3BvbnNlKSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0cmFuc3BvcnQuc2VuZChqc29uUnBjRXJyb3JGcm9tKG1zZy5pZCwgZXJyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWNsaWVudCAmJiBtc2cubWV0aG9kID09PSAncmVjb25uZWN0Jykge1xuXHRcdFx0XHRcdGxldCByZXNwb25zZVByb21pc2U6IFByb21pc2U8dW5rbm93bj47XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2hhbmRsZVJlY29ubmVjdChtc2cucGFyYW1zLCB0cmFuc3BvcnQsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRcdGNsaWVudCA9IHJlc3VsdC5jbGllbnQ7XG5cdFx0XHRcdFx0XHRyZXNwb25zZVByb21pc2UgPSByZXN1bHQucmVzcG9uc2VQcm9taXNlO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0dHJhbnNwb3J0LnNlbmQoanNvblJwY0Vycm9yRnJvbShtc2cuaWQsIGVycikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXNwb25zZVByb21pc2UudGhlbihcblx0XHRcdFx0XHRcdHJlc3BvbnNlID0+IHRyYW5zcG9ydC5zZW5kKGpzb25ScGNTdWNjZXNzKG1zZy5pZCwgcmVzcG9uc2UpKSxcblx0XHRcdFx0XHRcdGVyciA9PiB0cmFuc3BvcnQuc2VuZChqc29uUnBjRXJyb3JGcm9tKG1zZy5pZCwgZXJyKSksXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUaGUgVlMgQ29kZSB1cGdyYWRlIHJlcXVlc3QgcmlkZXMgb24gdGhlIHNhbWUgdHJhbnNwb3J0IGJ1dFxuXHRcdFx0XHQvLyBpcyBjYWxsYWJsZSBwcmUtYGluaXRpYWxpemVgOiBieSBkZWZpbml0aW9uIHdlIGdldCBoZXJlIHdoZW5cblx0XHRcdFx0Ly8gdGhlIGNsaWVudCdzIHByb3RvY29sIHZlcnNpb24gd2FzIHJlamVjdGVkLCBzbyB0aGUgY2xpZW50XG5cdFx0XHRcdC8vIG5ldmVyIG1hbmFnZWQgdG8gY29tcGxldGUgdGhlIGhhbmRzaGFrZS5cblx0XHRcdFx0aWYgKChtc2cubWV0aG9kIGFzIHN0cmluZykgPT09IFZTQ09ERV9VUEdSQURFX01FVEhPRCkge1xuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZVZzY29kZVVwZ3JhZGUobXNnLmlkLCB0cmFuc3BvcnQpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghY2xpZW50KSB7XG5cdFx0XHRcdFx0dHJhbnNwb3J0LnNlbmQoanNvblJwY0Vycm9yKG1zZy5pZCwgSnNvblJwY0Vycm9yQ29kZXMuTWV0aG9kTm90Rm91bmQsIGBNZXRob2Qgbm90IGZvdW5kOiAke21zZy5tZXRob2R9YCkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9oYW5kbGVSZXF1ZXN0KGNsaWVudCwgbXNnLm1ldGhvZCwgbXNnLnBhcmFtcywgbXNnLmlkKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNKc29uUnBjTm90aWZpY2F0aW9uKG1zZykpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1Byb3RvY29sU2VydmVyXSBub3RpZmljYXRpb246IG1ldGhvZD0ke21zZy5tZXRob2R9YCk7XG5cdFx0XHRcdC8vIE5vdGlmaWNhdGlvbiBcdTIwMTQgZmlyZS1hbmQtZm9yZ2V0XG5cdFx0XHRcdHN3aXRjaCAobXNnLm1ldGhvZCkge1xuXHRcdFx0XHRcdGNhc2UgJ3Vuc3Vic2NyaWJlJzpcblx0XHRcdFx0XHRcdGlmIChjbGllbnQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcmVtb3ZlU3Vic2NyaXB0aW9uKGNsaWVudCwgbXNnLnBhcmFtcy5jaGFubmVsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2Rpc3BhdGNoQWN0aW9uJzpcblx0XHRcdFx0XHRcdGlmIChjbGllbnQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1Byb3RvY29sU2VydmVyXSBkaXNwYXRjaEFjdGlvbjogJHtKU09OLnN0cmluZ2lmeShtc2cucGFyYW1zLmFjdGlvbi50eXBlKX1gKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gbXNnLnBhcmFtcy5hY3Rpb24gYXMgU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudENoYW5nZXNldEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjaGFubmVsID0gbXNnLnBhcmFtcy5jaGFubmVsO1xuXHRcdFx0XHRcdFx0XHQvLyBNdWx0aXJvb3Qgd29ya2luZy1kaXJlY3RvcnkgbXV0YXRpb25zIGFyZSBkZWNsYXJlZCBpbiB0aGVcblx0XHRcdFx0XHRcdFx0Ly8gcHJvdG9jb2wgYnV0IG5vdCB5ZXQgc3VwcG9ydGVkOiB0aGV5IHdvdWxkIG11dGF0ZSB0aGVcblx0XHRcdFx0XHRcdFx0Ly8gc3luY2hyb25pemVkIGFjY2VzcyBzZXQgd2l0aG91dCByZWNvbmZpZ3VyaW5nIHRoZSBhZ2VudCdzXG5cdFx0XHRcdFx0XHRcdC8vIGFjdHVhbCBkaXJlY3RvcnkgYWNjZXNzLiBSZWplY3QgdGhlbSB0aHJvdWdoIHRoZSBub3JtYWxcblx0XHRcdFx0XHRcdFx0Ly8gcmVjb25jaWxpYXRpb24gcGF0aCAocHJlc2VydmluZyB0aGUgY2xpZW50J3Mgb3JpZ2luKSBzbyB0aGVcblx0XHRcdFx0XHRcdFx0Ly8gY2xpZW50IHJvbGxzIGJhY2sgaXRzIG9wdGltaXN0aWMgYWN0aW9uIGluc3RlYWQgb2YgbGVhdmluZ1xuXHRcdFx0XHRcdFx0XHQvLyBpdCBwZW5kaW5nLCB1bnRpbCBjYXBhYmlsaXR5LWJhY2tlZCBtdWx0aXJvb3Qgc3VwcG9ydCBsYW5kcy5cblx0XHRcdFx0XHRcdFx0aWYgKFVOU1VQUE9SVEVEX0NMSUVOVF9BQ1RJT05fVFlQRVMuaGFzKGFjdGlvbi50eXBlKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Byb3RvY29sU2VydmVyXSByZWplY3RpbmcgdW5zdXBwb3J0ZWQgY2xpZW50IGFjdGlvbjogJHthY3Rpb24udHlwZX1gKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVqZWN0Q2xpZW50QWN0aW9uKFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2hhbm5lbCxcblx0XHRcdFx0XHRcdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0XHRcdFx0XHRcdHsgY2xpZW50SWQ6IGNsaWVudC5jbGllbnRJZCwgY2xpZW50U2VxOiBtc2cucGFyYW1zLmNsaWVudFNlcSB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0YFVuc3VwcG9ydGVkIGFjdGlvbjogJHthY3Rpb24udHlwZX1gLFxuXHRcdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNTZXNzaW9uQWN0aW9uKGFjdGlvbikgfHwgaXNDaGF0QWN0aW9uKGFjdGlvbikgfHwgaXNUZXJtaW5hbEFjdGlvbihhY3Rpb24pIHx8IGlzQ2hhbmdlc2V0QWN0aW9uKGFjdGlvbikgfHwgaXNBbm5vdGF0aW9uc0FjdGlvbihhY3Rpb24pIHx8IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fYWdlbnRTZXJ2aWNlLmRpc3BhdGNoQWN0aW9uKGNoYW5uZWwsIGFjdGlvbiwgY2xpZW50LmNsaWVudElkLCBtc2cucGFyYW1zLmNsaWVudFNlcSwgZ2V0QWdlbnRIb3N0Q2xpZW50VHlwZShjbGllbnQuY2xpZW50SW5mbykpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc0pzb25ScGNSZXNwb25zZShtc2cpKSB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nUmV2ZXJzZVJlcXVlc3RzLmdldChtc2cuaWQpO1xuXHRcdFx0XHRpZiAocGVuZGluZyAmJiBwZW5kaW5nLmNsaWVudCA9PT0gY2xpZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1JldmVyc2VSZXF1ZXN0cy5kZWxldGUobXNnLmlkKTtcblx0XHRcdFx0XHRpZiAoaGFzS2V5KG1zZywgeyBlcnJvcjogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdFx0cGVuZGluZy5yZWplY3QobmV3IFByb3RvY29sRXJyb3IoXG5cdFx0XHRcdFx0XHRcdG1zZy5lcnJvcj8uY29kZSA/PyAtMzIwMDAsXG5cdFx0XHRcdFx0XHRcdG1zZy5lcnJvcj8ubWVzc2FnZSA/PyAnUmV2ZXJzZSBSUEMgZXJyb3InLFxuXHRcdFx0XHRcdFx0XHRtc2cuZXJyb3I/LmRhdGEsXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cGVuZGluZy5yZXNvbHZlKG1zZy5yZXN1bHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmFuc3BvcnQub25DbG9zZSgoKSA9PiB7XG5cdFx0XHRjb25zdCByZWNvcmQgPSBjbGllbnQgPyB0aGlzLl9jbGllbnRzLmdldChjbGllbnQuY2xpZW50SWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNsaWVudCAmJiByZWNvcmQ/LnN0YXRlID09PSAnYWN0aXZlJykge1xuXHRcdFx0XHRjb25zdCBjb25uZWN0aW9uSW5kZXggPSByZWNvcmQuY29ubmVjdGlvbnMuaW5kZXhPZihjbGllbnQpO1xuXHRcdFx0XHRpZiAoY29ubmVjdGlvbkluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbkNvdW50ID0gY2xpZW50LnN1YnNjcmlwdGlvbnMuc2l6ZTtcblx0XHRcdFx0XHRyZWNvcmQuY29ubmVjdGlvbnMuc3BsaWNlKGNvbm5lY3Rpb25JbmRleCwgMSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVsZWFzZUNsaWVudFN1YnNjcmlwdGlvbnMoY2xpZW50LCByZWNvcmQpO1xuXHRcdFx0XHRcdHRoaXMuX3JlamVjdFBlbmRpbmdSZXZlcnNlUmVxdWVzdHNGb3JDb25uZWN0aW9uKGNsaWVudCk7XG5cdFx0XHRcdFx0aWYgKHJlY29yZC5jb25uZWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1Byb3RvY29sU2VydmVyXSBDbGllbnQgZGlzY29ubmVjdGVkOiAke2NsaWVudC5jbGllbnRJZH0sIHN1YnNjcmlwdGlvbnM9JHtzdWJzY3JpcHRpb25Db3VudH1gKTtcblx0XHRcdFx0XHRcdHRoaXMuX2NsaWVudHMuc2V0KGNsaWVudC5jbGllbnRJZCwgeyBzdGF0ZTogJ2dyYWNlJywgY2xpZW50SW5mbzogcmVjb3JkLmNsaWVudEluZm8sIGxhc3RTZWVuQXQ6IERhdGUubm93KCksIGRpc2Nvbm5lY3RUaW1lb3V0czogbmV3IERpc3Bvc2FibGVNYXAoKSB9KTtcblx0XHRcdFx0XHRcdHRoaXMuX2hhbmRsZUNsaWVudERpc2Nvbm5lY3RlZChjbGllbnQuY2xpZW50SWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQuZmlyZSh0aGlzLl9jb25uZWN0ZWRDbGllbnRDb3VudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRyYW5zcG9ydCk7XG5cdH1cblxuXHQvLyAtLS0tIEhhbmRzaGFrZSBoYW5kbGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfaGFuZGxlSW5pdGlhbGl6ZShcblx0XHRwYXJhbXM6IEluaXRpYWxpemVQYXJhbXMsXG5cdFx0dHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQsXG5cdFx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0KTogeyBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQ7IHJlc3BvbnNlOiB1bmtub3duIH0ge1xuXHRcdGNvbnN0IG9mZmVyZWQgPSBBcnJheS5pc0FycmF5KHBhcmFtcy5wcm90b2NvbFZlcnNpb25zKSA/IHBhcmFtcy5wcm90b2NvbFZlcnNpb25zIDogW107XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUHJvdG9jb2xTZXJ2ZXJdIEluaXRpYWxpemU6IGNsaWVudElkPSR7cGFyYW1zLmNsaWVudElkfSwgcHJvdG9jb2xWZXJzaW9ucz1bJHtvZmZlcmVkLmpvaW4oJywgJyl9XWApO1xuXG5cdFx0Y29uc3QgbmVnb3RpYXRlZCA9IG5lZ290aWF0ZVByb3RvY29sVmVyc2lvbihvZmZlcmVkLCBQUk9UT0NPTF9WRVJTSU9OKTtcblx0XHRpZiAoIW5lZ290aWF0ZWQpIHtcblx0XHRcdGNvbnN0IGRhdGE6IFVuc3VwcG9ydGVkUHJvdG9jb2xWZXJzaW9uRXJyb3JEYXRhRXggPSB7XG5cdFx0XHRcdHN1cHBvcnRlZFZlcnNpb25zOiBbYF4ke1BST1RPQ09MX1ZFUlNJT059YF0sXG5cdFx0XHRcdC8vIE9ubHkgYWR2ZXJ0aXNlIHRoZSBpbi1iYW5kIHVwZ3JhZGUgbWV0aG9kIHdoZW4gdGhlIGFnZW50XG5cdFx0XHRcdC8vIGhvc3Qgd2FzIHNwYXduZWQgYnkgYSBWUyBDb2RlIENMSSB0aGF0IGlzIGxpc3RlbmluZyBmb3Jcblx0XHRcdFx0Ly8gbWFuYWdlbWVudCByZXF1ZXN0cyAocHJlc2VuY2Ugb2YgdGhlIGVudiB2YXIpLiBPdGhlcndpc2Vcblx0XHRcdFx0Ly8gdGhlcmUgaXMgbm8gc3VwZXJ2aXNvciB0byBhY3R1YWxseSBhY3Qgb24gaXQsIHNvIGRvbid0XG5cdFx0XHRcdC8vIGxpZSB0byB0aGUgY2xpZW50LlxuXHRcdFx0XHRfbWV0YTogZ2V0QWdlbnRIb3N0TWFuYWdlbWVudFNvY2tldFBhdGgoKVxuXHRcdFx0XHRcdD8geyB2c2NvZGVVcGdyYWRlTWV0aG9kOiBWU0NPREVfVVBHUkFERV9NRVRIT0QgfVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKFxuXHRcdFx0XHRBSFBfVU5TVVBQT1JURURfUFJPVE9DT0xfVkVSU0lPTixcblx0XHRcdFx0YENsaWVudCBvZmZlcmVkIHByb3RvY29sIHZlcnNpb25zIFske29mZmVyZWQuam9pbignLCAnKX1dLCBub25lIG9mIHdoaWNoIGFyZSBjb21wYXRpYmxlIHdpdGggdGhpcyBzZXJ2ZXIncyB2ZXJzaW9uICR7UFJPVE9DT0xfVkVSU0lPTn0gKHNlcnZlciBhY2NlcHRzIF4ke1BST1RPQ09MX1ZFUlNJT059KS5gLFxuXHRcdFx0XHRkYXRhLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQgPSB7XG5cdFx0XHRjbGllbnRJZDogcGFyYW1zLmNsaWVudElkLFxuXHRcdFx0Y2xpZW50SW5mbzogcGFyYW1zLmNsaWVudEluZm8sXG5cdFx0XHRwcm90b2NvbFZlcnNpb246IG5lZ290aWF0ZWQsXG5cdFx0XHR0cmFuc3BvcnQsXG5cdFx0XHRzdWJzY3JpcHRpb25zOiBuZXcgTWFwKCksXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHR9O1xuXHRcdHRoaXMuX2F0dGFjaENvbm5lY3Rpb24ocGFyYW1zLmNsaWVudElkLCBjbGllbnQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJDbGllbnRGaWxlU3lzdGVtQXV0aG9yaXR5KHBhcmFtcy5jbGllbnRJZCwgZGlzcG9zYWJsZXMpO1xuXG5cblx0XHRjb25zdCBzbmFwc2hvdHM6IElTdGF0ZVNuYXBzaG90W10gPSBbXTtcblx0XHRpZiAocGFyYW1zLmluaXRpYWxTdWJzY3JpcHRpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiBwYXJhbXMuaW5pdGlhbFN1YnNjcmlwdGlvbnMpIHtcblx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSB0aGlzLl9hZGRJbml0aWFsU3Vic2NyaXB0aW9uKGNsaWVudCwgdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRpZiAoc25hcHNob3QpIHtcblx0XHRcdFx0XHRzbmFwc2hvdHMucHVzaChzbmFwc2hvdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2xpZW50LFxuXHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uOiBuZWdvdGlhdGVkLFxuXHRcdFx0XHRzZXJ2ZXJTZXE6IHRoaXMuX3N0YXRlTWFuYWdlci5zZXJ2ZXJTZXEsXG5cdFx0XHRcdHNuYXBzaG90cyxcblx0XHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogdGhpcy5fY29uZmlnLmRlZmF1bHREaXJlY3RvcnksXG5cdFx0XHRcdGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyczogdGhpcy5fY29uZmlnLmNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycyxcblx0XHRcdFx0dGVybWluYWxDb21tYW5kUHJlZml4OiB0aGlzLl9jb25maWcudGVybWluYWxDb21tYW5kUHJlZml4LFxuXHRcdFx0XHR0ZWxlbWV0cnk6IHRoaXMuX2NvbmZpZy5vdGxwTG9nRW1pdHRlciA/IHsgbG9nczogT1RMUF9MT0dTX0NIQU5ORUxfVEVNUExBVEUgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIZWxwZXIgZm9yIGBpbml0aWFsaXplYCBhbmQgYHJlY29ubmVjdGAgaW5pdGlhbC1zdWJzY3JpcHRpb25cblx0ICogcHJvY2Vzc2luZzogY2xhc3NpZnkgYGNoYW5uZWxgLCBpbnN0YWxsIHRoZSBtYXRjaGluZyBzdWJzY3JpcHRpb25cblx0ICogb24gdGhlIGNsaWVudCwgYW5kIHJldHVybiB0aGUgc25hcHNob3QgdG8gaW5jbHVkZSBpbiB0aGUgaGFuZHNoYWtlXG5cdCAqIHJlc3BvbnNlIChvciBgdW5kZWZpbmVkYCBmb3Igc3RhdGVsZXNzIGNoYW5uZWxzIGFuZCBtaXNzaW5nIHN0YXRlKS5cblx0ICpcblx0ICogU2lkZSBlZmZlY3RzOlxuXHQgKiAtIFN0YXRlIGNoYW5uZWxzOiByZWdpc3RlciB3aXRoIHRoZSBhZ2VudCBzZXJ2aWNlIGFuZCBjbGVhciBhbnlcblx0ICogICBwZW5kaW5nIHRvb2wtY2FsbCBkaXNjb25uZWN0IHRpbWVvdXQuXG5cdCAqIC0gT1RMUCBjaGFubmVsczogaW5zdGFsbCB0aGUgY2Fub25pY2FsIGVudHJ5IG9uIHRoZSBjbGllbnQnc1xuXHQgKiAgIHtAbGluayBJQ29ubmVjdGVkQ2xpZW50LnN1YnNjcmlwdGlvbnN9IG1hcC5cblx0ICpcblx0ICogQ2hhbm5lbHMgd2l0aCB1bnN1cHBvcnRlZCBzaGFwZXMgKGUuZy4gYGFocC1vdGxwOi8vbG9ncy92ZXJib3NlYFxuXHQgKiB3aXRoIG5vIHJlY29nbmlzZWQgbGV2ZWwsIG9yIGEgc3RhdGUgY2hhbm5lbCB0aGUgc3RhdGUgbWFuYWdlclxuXHQgKiBkb2VzIG5vdCBrbm93IGFib3V0KSBhcmUgc2lsZW50bHkgZHJvcHBlZC5cblx0ICovXG5cdHByaXZhdGUgX2FkZEluaXRpYWxTdWJzY3JpcHRpb24oY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50LCBjaGFubmVsOiBzdHJpbmcpOiBJU3RhdGVTbmFwc2hvdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3ViID0gY2xhc3NpZnlDaGFubmVsKGNoYW5uZWwpO1xuXHRcdGlmICghc3ViKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoc3ViLmtpbmQgPT09IENoYW5uZWxLaW5kLk90bHBMb2dzKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2NvbmZpZy5vdGxwTG9nRW1pdHRlcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtQcm90b2NvbFNlcnZlcl0gSWdub3JpbmcgT1RMUCBpbml0aWFsU3Vic2NyaXB0aW9uICR7Y2hhbm5lbH06IG5vIE9UTFAgZW1pdHRlciBjb25maWd1cmVkLmApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y2xpZW50LnN1YnNjcmlwdGlvbnMuc2V0KHN1Yi51cmksIHN1Yik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzbmFwc2hvdCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChjaGFubmVsKTtcblx0XHRpZiAoIXNuYXBzaG90KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjbGllbnQuc3Vic2NyaXB0aW9ucy5zZXQoc3ViLnVyaSwgc3ViKTtcblx0XHR0aGlzLl9hZ2VudFNlcnZpY2UuYWRkU3Vic2NyaWJlcihVUkkucGFyc2Uoc3ViLnVyaSksIGNsaWVudC5jbGllbnRJZCk7XG5cdFx0dGhpcy5fY2xlYXJDbGllbnRUb29sQ2FsbERpc2Nvbm5lY3RUaW1lb3V0KGNsaWVudC5jbGllbnRJZCwgc3ViLnVyaSk7XG5cdFx0cmV0dXJuIHNuYXBzaG90O1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcndhcmRzIGEgY2xpZW50J3MgdXBncmFkZSByZXF1ZXN0IHRvIHRoZSBob3N0aW5nIFZTIENvZGUgQ0xJJ3Ncblx0ICogSFRUUCBtYW5hZ2VtZW50IEFQSSAoYWR2ZXJ0aXNlZCB2aWEgdGhlIHtAbGluayBWU0NPREVfQUdFTlRfSE9TVF9NQU5BR0VNRU5UX1NPQ0tFVF9FTlZ9KS5cblx0ICogUmV0dXJucyB0aGUgQ0xJJ3MgcGFyc2VkIHJlc3BvbnNlIHZlcmJhdGltIHNvIHRoZSBjbGllbnQgY2FuIHJlbmRlclxuXHQgKiBhIG1lYW5pbmdmdWwgc3RhdHVzIChhbHJlYWR5IHVwLXRvLWRhdGUsIHJlc3RhcnQgc2NoZWR1bGVkLCBldGMuKS5cblx0ICpcblx0ICogV2hlbiB0aGUgc2VydmVyIHdhcyBub3Qgc3Bhd25lZCBieSBhIG1hbmFnaW5nIENMSSwgcmVzcG9uZHMgd2l0aFxuXHQgKiBgTWV0aG9kTm90Rm91bmRgIFx1MjAxNCB0aGUgdXBncmFkZSBtZXRob2QgaXMgb25seSBtZWFuaW5nZnVsbHkgY2FsbGFibGVcblx0ICogb24gQ0xJLWhvc3RlZCBzZXJ2ZXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlVnNjb2RlVXBncmFkZShpZDogbnVtYmVyLCB0cmFuc3BvcnQ6IElQcm90b2NvbFRyYW5zcG9ydCk6IHZvaWQge1xuXHRcdGNvbnN0IHNvY2tldFBhdGggPSBnZXRBZ2VudEhvc3RNYW5hZ2VtZW50U29ja2V0UGF0aCgpO1xuXHRcdGlmICghc29ja2V0UGF0aCkge1xuXHRcdFx0dHJhbnNwb3J0LnNlbmQoanNvblJwY0Vycm9yKFxuXHRcdFx0XHRpZCxcblx0XHRcdFx0SnNvblJwY0Vycm9yQ29kZXMuTWV0aG9kTm90Rm91bmQsXG5cdFx0XHRcdGBObyB1cGdyYWRlIHN1cGVydmlzb3IgaXMgYXZhaWxhYmxlIGZvciB0aGlzIGFnZW50IGhvc3QuYCxcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXF1ZXN0QWdlbnRIb3N0VXBncmFkZShzb2NrZXRQYXRoKS50aGVuKFxuXHRcdFx0KHJlc3VsdCkgPT4gdHJhbnNwb3J0LnNlbmQoanNvblJwY1N1Y2Nlc3MoaWQsIHJlc3VsdCkpLFxuXHRcdFx0KGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtQcm90b2NvbFNlcnZlcl0gdnNjb2RlVXBncmFkZSBzaWduYWwgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdFx0dHJhbnNwb3J0LnNlbmQoanNvblJwY0Vycm9yRnJvbShpZCwgZXJyKSk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSZWNvbm5lY3QoXG5cdFx0cGFyYW1zOiBSZWNvbm5lY3RQYXJhbXMsXG5cdFx0dHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQsXG5cdFx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0KTogeyBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQ7IHJlc3BvbnNlUHJvbWlzZTogUHJvbWlzZTx1bmtub3duPiB9IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtQcm90b2NvbFNlcnZlcl0gUmVjb25uZWN0OiBjbGllbnRJZD0ke3BhcmFtcy5jbGllbnRJZH0sIGxhc3RTZWVuU2VxPSR7cGFyYW1zLmxhc3RTZWVuU2VydmVyU2VxfWApO1xuXHRcdGNvbnN0IGV4aXN0aW5nUmVjb3JkID0gdGhpcy5fY2xpZW50cy5nZXQocGFyYW1zLmNsaWVudElkKTtcblx0XHRpZiAoIWV4aXN0aW5nUmVjb3JkKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgUmVjb25uZWN0IGNsaWVudCBub3QgZm91bmQ6ICR7cGFyYW1zLmNsaWVudElkfWApO1xuXHRcdH1cblxuXHRcdC8vIFN5bmNocm9ub3VzbHkgaW5zdGFsbCB0aGUgY2xpZW50IHNvIG1lc3NhZ2VzIGFycml2aW5nIG9uIHRoaXMgdHJhbnNwb3J0XG5cdFx0Ly8gd2hpbGUgd2UgcmVzdG9yZSBzdWJzY3JpcHRpb25zIGNhbiBmaW5kIGEgdmFsaWQgY2xpZW50IG9iamVjdC4gVGhlXG5cdFx0Ly8gcmVjb25uZWN0IHJlc3BvbnNlIGlzIG9ubHkgc2VudCBvbmNlIGByZXNwb25zZVByb21pc2VgIHJlc29sdmVzIGJlbG93LlxuXHRcdGNvbnN0IGNsaWVudDogSUNvbm5lY3RlZENsaWVudCA9IHtcblx0XHRcdGNsaWVudElkOiBwYXJhbXMuY2xpZW50SWQsXG5cdFx0XHRjbGllbnRJbmZvOiBleGlzdGluZ1JlY29yZC5jbGllbnRJbmZvLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uOiBQUk9UT0NPTF9WRVJTSU9OLFxuXHRcdFx0dHJhbnNwb3J0LFxuXHRcdFx0c3Vic2NyaXB0aW9uczogbmV3IE1hcCgpLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0fTtcblx0XHR0aGlzLl9hdHRhY2hDb25uZWN0aW9uKHBhcmFtcy5jbGllbnRJZCwgY2xpZW50KTtcblxuXHRcdC8vIFJlLWVzdGFibGlzaCB0aGUgcmV2ZXJzZS1SUEMgZmlsZXN5c3RlbSBhdXRob3JpdHkgZm9yIHRoaXMgY2xpZW50LlxuXHRcdC8vIFRoZSBwcmlvciB0cmFuc3BvcnQncyBgb25DbG9zZWAgZGlzcG9zZWQgdGhlIHByZXZpb3VzIHJlZ2lzdHJhdGlvbixcblx0XHQvLyBzbyB3aXRob3V0IHRoaXMgc3RlcCBhbnkgc3Vic2VxdWVudCBgcmVzb3VyY2VSZWFkYCAvIGByZXNvdXJjZVdyaXRlYFxuXHRcdC8vIC8gZXRjLiBmcm9tIHRoZSBhZ2VudCBob3N0IHdvdWxkIGZhaWwgd2l0aCBcIm5vIGNvbm5lY3Rpb24gcmVnaXN0ZXJlZFxuXHRcdC8vIGZvciBhdXRob3JpdHlcIiB1bnRpbCB0aGUgY2xpZW50IGRpc2Nvbm5lY3RlZCBhbmQgcmUtaW5pdGlhbGl6ZWQuXG5cdFx0dGhpcy5fcmVnaXN0ZXJDbGllbnRGaWxlU3lzdGVtQXV0aG9yaXR5KHBhcmFtcy5jbGllbnRJZCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3Qgb2xkZXN0QnVmZmVyZWQgPSB0aGlzLl9yZXBsYXlCdWZmZXIubGVuZ3RoID4gMCA/IHRoaXMuX3JlcGxheUJ1ZmZlclswXS5zZXJ2ZXJTZXEgOiB0aGlzLl9zdGF0ZU1hbmFnZXIuc2VydmVyU2VxO1xuXHRcdGNvbnN0IGNhblJlcGxheSA9IHBhcmFtcy5sYXN0U2VlblNlcnZlclNlcSA+PSBvbGRlc3RCdWZmZXJlZDtcblxuXHRcdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IHRoaXMuX3Jlc3RvcmVSZWNvbm5lY3RTdWJzY3JpcHRpb25zKGNsaWVudCwgcGFyYW1zLCBjYW5SZXBsYXkpO1xuXHRcdHJldHVybiB7IGNsaWVudCwgcmVzcG9uc2VQcm9taXNlIH07XG5cdH1cblxuXHQvKipcblx0ICogV2lyZXMgdGhlIHJldmVyc2UtUlBDIGZpbGVzeXN0ZW0gY2FsbGJhY2tzIGZvciBgY2xpZW50SWRgIGFuZCBiaW5kc1xuXHQgKiB0aGUgdW5yZWdpc3RlciB0byBgZGlzcG9zYWJsZXNgICh0aGUgdHJhbnNwb3J0J3MgcGVyLWNvbm5lY3Rpb25cblx0ICogc3RvcmUpLiBUaGUgY2FsbGJhY2tzIGRpc3BhdGNoIHRocm91Z2gge0BsaW5rIF9zZW5kUmV2ZXJzZVJlcXVlc3R9LFxuXHQgKiB3aGljaCBsb29rcyB1cCB0aGUgKmN1cnJlbnQqIGNvbm5lY3RlZCBjbGllbnQgYnkgaWQgXHUyMDE0IHNvIHJlLWJpbmRpbmdcblx0ICogYWZ0ZXIgYSByZWNvbm5lY3QgcGlja3MgdXAgdGhlIG5ldyB0cmFuc3BvcnQgd2l0aG91dCByZWJ1aWxkaW5nIHRoZVxuXHQgKiBjbG9zdXJlcy5cblx0ICovXG5cdHByaXZhdGUgX3JlZ2lzdGVyQ2xpZW50RmlsZVN5c3RlbUF1dGhvcml0eShjbGllbnRJZDogc3RyaW5nLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NsaWVudEZpbGVTeXN0ZW1Qcm92aWRlci5yZWdpc3RlckF1dGhvcml0eShjbGllbnRJZCwge1xuXHRcdFx0cmVzb3VyY2VMaXN0OiAodXJpKSA9PiB0aGlzLl9zZW5kUmV2ZXJzZVJlcXVlc3QoY2xpZW50SWQsICdyZXNvdXJjZUxpc3QnLCB7IHVyaTogdXJpLnRvU3RyaW5nKCkgfSksXG5cdFx0XHRyZXNvdXJjZVJlYWQ6ICh1cmkpID0+IHRoaXMuX3NlbmRSZXZlcnNlUmVxdWVzdChjbGllbnRJZCwgJ3Jlc291cmNlUmVhZCcsIHsgdXJpOiB1cmkudG9TdHJpbmcoKSB9KSxcblx0XHRcdHJlc291cmNlV3JpdGU6IChwYXJhbXNfKSA9PiB0aGlzLl9zZW5kUmV2ZXJzZVJlcXVlc3QoY2xpZW50SWQsICdyZXNvdXJjZVdyaXRlJywgcGFyYW1zXyksXG5cdFx0XHRyZXNvdXJjZUNvcHk6IChwYXJhbXNfKSA9PiB0aGlzLl9zZW5kUmV2ZXJzZVJlcXVlc3QoY2xpZW50SWQsICdyZXNvdXJjZUNvcHknLCBwYXJhbXNfKSxcblx0XHRcdHJlc291cmNlRGVsZXRlOiAocGFyYW1zXykgPT4gdGhpcy5fc2VuZFJldmVyc2VSZXF1ZXN0KGNsaWVudElkLCAncmVzb3VyY2VEZWxldGUnLCBwYXJhbXNfKSxcblx0XHRcdHJlc291cmNlTW92ZTogKHBhcmFtc18pID0+IHRoaXMuX3NlbmRSZXZlcnNlUmVxdWVzdChjbGllbnRJZCwgJ3Jlc291cmNlTW92ZScsIHBhcmFtc18pLFxuXHRcdFx0cmVzb3VyY2VSZXF1ZXN0OiAocGFyYW1zXykgPT4gdGhpcy5fc2VuZFJldmVyc2VSZXF1ZXN0KGNsaWVudElkLCAncmVzb3VyY2VSZXF1ZXN0JywgcGFyYW1zXyksXG5cdFx0XHRyZXNvdXJjZVJlc29sdmU6IChwYXJhbXNfKSA9PiB0aGlzLl9zZW5kUmV2ZXJzZVJlcXVlc3QoY2xpZW50SWQsICdyZXNvdXJjZVJlc29sdmUnLCBwYXJhbXNfKSxcblx0XHRcdHJlc291cmNlTWtkaXI6IChwYXJhbXNfKSA9PiB0aGlzLl9zZW5kUmV2ZXJzZVJlcXVlc3QoY2xpZW50SWQsICdyZXNvdXJjZU1rZGlyJywgcGFyYW1zXyksXG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWVzdGFibGlzaCBlYWNoIG9mIHRoZSBjbGllbnQncyBwcmlvciBzdWJzY3JpcHRpb25zIG9uIHRoZSBzZXJ2ZXIgc2lkZS5cblx0ICogVXNlcyB7QGxpbmsgSUFnZW50U2VydmljZS5zdWJzY3JpYmV9IChyYXRoZXIgdGhhbiBhIGJhcmUgYGFkZFN1YnNjcmliZXJgXG5cdCAqICsgYGdldFNuYXBzaG90YCkgc28gYW55IHNlc3Npb24gc3RhdGUgdGhhdCB3YXMgZXZpY3RlZCB3aGlsZSB0aGUgY2xpZW50XG5cdCAqIHdhcyBkaXNjb25uZWN0ZWQgaXMgcmVzdG9yZWQuIFJldHVybnMgdGhlIGFwcHJvcHJpYXRlIHJlY29ubmVjdCByZXNwb25zZVxuXHQgKiBwYXlsb2FkIFx1MjAxNCBgcmVwbGF5YCBhY3Rpb25zIHdoZW4gdGhlIGNsaWVudCdzIGxhc3Qtc2VlbiBzZXEgaXMgc3RpbGwgaW5cblx0ICogdGhlIGJ1ZmZlciwgb3RoZXJ3aXNlIGZyZXNoIGBzbmFwc2hvdGBzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzdG9yZVJlY29ubmVjdFN1YnNjcmlwdGlvbnMoXG5cdFx0Y2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50LFxuXHRcdHBhcmFtczogUmVjb25uZWN0UGFyYW1zLFxuXHRcdGNhblJlcGxheTogYm9vbGVhbixcblx0KTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3QgbWlzc2luZzogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzbmFwc2hvdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwYXJhbXMuc3Vic2NyaXB0aW9ucy5tYXAoYXN5bmMgc3ViID0+IHtcblx0XHRcdGNvbnN0IGtleSA9IHN1Yi50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgY2xhc3NpZmllZCA9IGNsYXNzaWZ5Q2hhbm5lbChrZXkpO1xuXHRcdFx0aWYgKCFjbGFzc2lmaWVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2xhc3NpZmllZC5raW5kID09PSBDaGFubmVsS2luZC5PdGxwTG9ncykge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2NvbmZpZy5vdGxwTG9nRW1pdHRlcikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Byb3RvY29sU2VydmVyXSBSZWNvbm5lY3Q6IGRyb3BwaW5nIE9UTFAgc3Vic2NyaXB0aW9uICR7a2V5fTogbm8gT1RMUCBlbWl0dGVyIGNvbmZpZ3VyZWQuYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBTdGF0ZWxlc3M6IHJlLWluc3RhbGwgd2l0aG91dCBnb2luZyB0aHJvdWdoIHRoZSBhZ2VudCBzZXJ2aWNlLlxuXHRcdFx0XHRjbGllbnQuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NpZmllZC51cmksIGNsYXNzaWZpZWQpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNsYXNzaWZpZWQua2luZCA9PT0gQ2hhbm5lbEtpbmQuUmVzb3VyY2VXYXRjaCkge1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdG9yID0gdGhpcy5fYWdlbnRTZXJ2aWNlLm9uUmVzb3VyY2VXYXRjaFN1YnNjcmliZWQoY2xhc3NpZmllZC51cmkpO1xuXHRcdFx0XHRpZiAoIWRlc2NyaXB0b3IpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtQcm90b2NvbFNlcnZlcl0gUmVjb25uZWN0OiByZXNvdXJjZSB3YXRjaCAke2tleX0gbm8gbG9uZ2VyIHBhcnNlc2ApO1xuXHRcdFx0XHRcdG1pc3NpbmcucHVzaChzdWIpO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2xpZW50LnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzaWZpZWQudXJpLCBjbGFzc2lmaWVkKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyZXNvdXJjZTogY2xhc3NpZmllZC51cmksXG5cdFx0XHRcdFx0c3RhdGU6IGRlc2NyaXB0b3IsXG5cdFx0XHRcdFx0ZnJvbVNlcTogdGhpcy5fc3RhdGVNYW5hZ2VyLnNlcnZlclNlcSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fYWdlbnRTZXJ2aWNlLnN1YnNjcmliZShVUkkucGFyc2Uoa2V5KSwgY2xpZW50LmNsaWVudElkKTtcblx0XHRcdFx0Y2xpZW50LnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzaWZpZWQudXJpLCBjbGFzc2lmaWVkKTtcblx0XHRcdFx0dGhpcy5fY2xlYXJDbGllbnRUb29sQ2FsbERpc2Nvbm5lY3RUaW1lb3V0KGNsaWVudC5jbGllbnRJZCwgY2xhc3NpZmllZC51cmkpO1xuXHRcdFx0XHRyZXR1cm4gc25hcHNob3Q7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUHJvdG9jb2xTZXJ2ZXJdIFJlY29ubmVjdDogZmFpbGVkIHRvIHJlc3RvcmUgc3Vic2NyaXB0aW9uICR7a2V5fTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRcdG1pc3NpbmcucHVzaChzdWIpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlY29uY2lsZUFjdGl2ZUNsaWVudHNBZnRlclJlY29ubmVjdChjbGllbnQpO1xuXG5cdFx0aWYgKGNhblJlcGxheSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBlbnZlbG9wZSBvZiB0aGlzLl9yZXBsYXlCdWZmZXIpIHtcblx0XHRcdFx0aWYgKGVudmVsb3BlLnNlcnZlclNlcSA+IHBhcmFtcy5sYXN0U2VlblNlcnZlclNlcSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9pc1JlbGV2YW50VG9DbGllbnQoY2xpZW50LCBlbnZlbG9wZSkpIHtcblx0XHRcdFx0XHRcdGFjdGlvbnMucHVzaChlbnZlbG9wZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB0eXBlOiAncmVwbGF5JywgYWN0aW9ucywgbWlzc2luZyB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyB0eXBlOiAnc25hcHNob3QnLCBzbmFwc2hvdHM6IHNuYXBzaG90cy5maWx0ZXIoKHMpOiBzIGlzIElTdGF0ZVNuYXBzaG90ID0+IHMgIT09IHVuZGVmaW5lZCkgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWxlYXNlIGEgY2xpZW50IGZyb20gZXZlcnkgc2Vzc2lvbiB3aGVyZSBpdCBpcyBzdGlsbCBhbiBhY3RpdmUgY2xpZW50XG5cdCAqIGJ1dCBkaWQgbm90IHJlc3Vic2NyaWJlIGR1cmluZyBhIHJlY29ubmVjdC4gVGhlIHNldCBvZiByZXN1YnNjcmliZWRcblx0ICogc2Vzc2lvbnMgaXMgZ2F0aGVyZWQgZnJvbSBldmVyeSBsaXZlIGNvbm5lY3Rpb24gdGhlIGNsaWVudCBjdXJyZW50bHlcblx0ICogaG9sZHMgKG5vdCBqdXN0IHRoZSByZWNvbm5lY3Rpbmcgb25lKSBzbyBhbiBvdmVybGFwcGluZyBjb25uZWN0aW9uIHRoYXRcblx0ICogc3RpbGwgc3Vic2NyaWJlcyB0byBhIHNlc3Npb24ga2VlcHMgdGhlIGNsaWVudCBhY3RpdmUgdGhlcmUuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWNvbmNpbGVBY3RpdmVDbGllbnRzQWZ0ZXJSZWNvbm5lY3QoY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVjb3JkID0gdGhpcy5fY2xpZW50cy5nZXQoY2xpZW50LmNsaWVudElkKTtcblx0XHRjb25zdCByZXN1YnNjcmliZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgcmVjb3JkPy5zdGF0ZSA9PT0gJ2FjdGl2ZScgPyByZWNvcmQuY29ubmVjdGlvbnMgOiBbY2xpZW50XSkge1xuXHRcdFx0Zm9yIChjb25zdCBzdWIgb2YgY29ubmVjdGlvbi5zdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmIChzdWIua2luZCA9PT0gQ2hhbm5lbEtpbmQuU3RhdGUpIHtcblx0XHRcdFx0XHRyZXN1YnNjcmliZWQuYWRkKHN1Yi51cmkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblVyaXMoKSkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pO1xuXHRcdFx0aWYgKHN0YXRlICYmIHRoaXMuX2lzQWN0aXZlQ2xpZW50KHN0YXRlLCBjbGllbnQuY2xpZW50SWQpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhdCBvZiBzdGF0ZS5jaGF0cykge1xuXHRcdFx0XHRcdGlmICghcmVzdWJzY3JpYmVkLmhhcyhzZXNzaW9uKSAmJiAhcmVzdWJzY3JpYmVkLmhhcyhjaGF0LnJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVsZWFzZUFjdGl2ZUNsaWVudEZvclNlc3Npb24oc2Vzc2lvbiwgY2xpZW50LmNsaWVudElkLCBjaGF0LnJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVDbGllbnREaXNjb25uZWN0ZWQoY2xpZW50SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblVyaXMoKSkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pO1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBzdGF0ZSA/IHRoaXMuX2lzQWN0aXZlQ2xpZW50KHN0YXRlLCBjbGllbnRJZCkgOiBmYWxzZTtcblx0XHRcdGNvbnN0IG93bnNQZW5kaW5nVG9vbENhbGwgPSBzdGF0ZSA/IHRoaXMuX2hhc1BlbmRpbmdDbGllbnRUb29sQ2FsbChzdGF0ZSwgY2xpZW50SWQpIDogZmFsc2U7XG5cdFx0XHQvLyBLZWVwIHRoZSBjbGllbnQgbWFya2VkIGFjdGl2ZSBkdXJpbmcgdGhlIGdyYWNlIHdpbmRvdyBzbyBhIHF1aWNrXG5cdFx0XHQvLyByZWNvbm5lY3QgdGhhdCByZXN1YnNjcmliZXMgY2FuIHJldGFpbiBpdHMgc2xvdC4gVGhlIGRpc2Nvbm5lY3Rcblx0XHRcdC8vIHRpbWVvdXQgcmVtb3ZlcyB0aGUgYWN0aXZlIGNsaWVudCAoYW5kIGZhaWxzIGl0cyBwZW5kaW5nIHRvb2xcblx0XHRcdC8vIGNhbGxzKSBpZiBpdCBuZXZlciByZXR1cm5zOyBhbiBleHBsaWNpdCB1bnN1YnNjcmliZSBvciBhXG5cdFx0XHQvLyByZWNvbm5lY3Qgd2l0aG91dCByZXN1YnNjcmlwdGlvbiByZW1vdmVzIGl0IHNvb25lci5cblx0XHRcdGlmIChpc0FjdGl2ZSB8fCBvd25zUGVuZGluZ1Rvb2xDYWxsKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hhdCBvZiBzdGF0ZT8uY2hhdHMgPz8gW10pIHtcblx0XHRcdFx0XHR0aGlzLl9zdGFydENsaWVudFRvb2xDYWxsRGlzY29ubmVjdFRpbWVvdXQoY2xpZW50SWQsIHNlc3Npb24sIGNoYXQucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIFdoZXRoZXIgYGNsaWVudElkYCBpcyBvbmUgb2YgdGhlIHNlc3Npb24ncyBhY3RpdmUgY2xpZW50cy4gKi9cblx0cHJpdmF0ZSBfaXNBY3RpdmVDbGllbnQoc3RhdGU6IFNlc3Npb25TdGF0ZSwgY2xpZW50SWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzdGF0ZS5hY3RpdmVDbGllbnRzLnNvbWUoYyA9PiBjLmNsaWVudElkID09PSBjbGllbnRJZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIGBjbGllbnRJZGAgZnJvbSBhIHNlc3Npb24ncyBhY3RpdmUgY2xpZW50cywgaWYgcHJlc2VudC4gRGlzcGF0Y2hlZFxuXHQgKiBhcyBhIHNlcnZlciBhY3Rpb24gc28gdGhlIHJlbW92YWwgaXMgcmVmbGVjdGVkIGluIHN0YXRlIGFuZCBicm9hZGNhc3QgdG9cblx0ICogdGhlIHJlbWFpbmluZyBzdWJzY3JpYmVycy5cblx0ICovXG5cdHByaXZhdGUgX3JlbW92ZUFjdGl2ZUNsaWVudChzZXNzaW9uOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik7XG5cdFx0aWYgKHN0YXRlICYmIHRoaXMuX2lzQWN0aXZlQ2xpZW50KHN0YXRlLCBjbGllbnRJZCkpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFJlbW92ZWQsXG5cdFx0XHRcdGNsaWVudElkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbGVhc2UgYSBjbGllbnQgZnJvbSBhIHNlc3Npb246IGNsZWFyIGl0cyBwZW5kaW5nIGRpc2Nvbm5lY3QgdGltZW91dCxcblx0ICogZmFpbCBhbnkgY2xpZW50IHRvb2wgY2FsbHMgaXQgc3RpbGwgb3ducywgYW5kIHJlbW92ZSBpdCBmcm9tIHRoZSBhY3RpdmVcblx0ICogY2xpZW50cy4gVXNlZCBieSB0aGUgZXhwbGljaXQtdW5zdWJzY3JpYmUgYW5kIHJlY29ubmVjdC1yZWNvbmNpbGlhdGlvblxuXHQgKiBwYXRocyB0byBkcm9wIGEgY2xpZW50IHRoYXQgaGFzIGxlZnQgYSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVsZWFzZUFjdGl2ZUNsaWVudEZvclNlc3Npb24oc2Vzc2lvbjogc3RyaW5nLCBjbGllbnRJZDogc3RyaW5nLCBjaGF0Q2hhbm5lbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXJDbGllbnRUb29sQ2FsbERpc2Nvbm5lY3RUaW1lb3V0KGNsaWVudElkLCBjaGF0Q2hhbm5lbCk7XG5cdFx0dGhpcy5fY29tcGxldGVEaXNjb25uZWN0ZWRDbGllbnRUb29sQ2FsbHMoY2xpZW50SWQsIHNlc3Npb24sIGNoYXRDaGFubmVsKTtcblx0XHR0aGlzLl9yZW1vdmVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgY2xpZW50SWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFlpZWxkcyBldmVyeSBzdGlsbC1wZW5kaW5nIGNsaWVudC1jb250cmlidXRlZCB0b29sIGNhbGwgaW4gYHN0YXRlYCdzXG5cdCAqIGFjdGl2ZSB0dXJuLCBwYWlyZWQgd2l0aCBpdHMgb3duaW5nIGBjbGllbnRJZGAuIFNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGhcblx0ICogZm9yIHRoZSBkaXNjb25uZWN0LWdyYWNlIG1hY2hpbmVyeTogZGV0ZWN0IG93bmVyc2hpcFxuXHQgKiAoe0BsaW5rIF9oYXNQZW5kaW5nQ2xpZW50VG9vbENhbGx9KSwgYXJtIHRpbWVvdXRzXG5cdCAqICh7QGxpbmsgX2NoZWNrT3JwaGFuZWRDbGllbnRUb29sQ2FsbHN9KSwgYW5kIGZhaWwgb3JwaGFuZWQgY2FsbHNcblx0ICogKHtAbGluayBfY29tcGxldGVEaXNjb25uZWN0ZWRDbGllbnRUb29sQ2FsbHN9KS5cblx0ICovXG5cdHByaXZhdGUgKl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzKHN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGFjdGl2ZVR1cm4gPSBzdGF0ZT8uYWN0aXZlVHVybjtcblx0XHRpZiAoIWFjdGl2ZVR1cm4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGFjdGl2ZVR1cm4ucmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0aWYgKHBhcnQua2luZCAhPT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRvb2xDYWxsID0gcGFydC50b29sQ2FsbDtcblx0XHRcdGNvbnN0IGNvbnRyaWJ1dG9yID0gdG9vbENhbGwuY29udHJpYnV0b3I7XG5cdFx0XHRpZiAoY29udHJpYnV0b3I/LmtpbmQgPT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCAmJiBpc1BlbmRpbmdUb29sQ2FsbFN0YXR1cyh0b29sQ2FsbC5zdGF0dXMpKSB7XG5cdFx0XHRcdHlpZWxkIHsgdG9vbENhbGwsIGNsaWVudElkOiBjb250cmlidXRvci5jbGllbnRJZCB9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhc1BlbmRpbmdDbGllbnRUb29sQ2FsbChzdGF0ZTogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQgfCB1bmRlZmluZWQsIGNsaWVudElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2YgdGhpcy5fcGVuZGluZ0NsaWVudFRvb2xDYWxscyhzdGF0ZSkpIHtcblx0XHRcdGlmIChwZW5kaW5nLmNsaWVudElkID09PSBjbGllbnRJZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzUmVwbGFjZW1lbnRBY3RpdmVDbGllbnRUb29sKHN0YXRlOiBTZXNzaW9uU3RhdGUsIGNsaWVudElkOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc3RhdGUuYWN0aXZlQ2xpZW50cy5zb21lKGNsaWVudCA9PlxuXHRcdFx0Y2xpZW50LmNsaWVudElkICE9PSBjbGllbnRJZFxuXHRcdFx0JiYgY2xpZW50LnRvb2xzLnNvbWUodG9vbCA9PiB0b29sLm5hbWUgPT09IHRvb2xOYW1lKSk7XG5cdH1cblxuXHQvKipcblx0ICogQXJtIChvciByZS1hcm0pIHRoZSBwZXItKGNsaWVudElkLCBzZXNzaW9uKSB0aW1lb3V0IHRoYXQgZmFpbHMgcGVuZGluZ1xuXHQgKiBjbGllbnQgdG9vbCBjYWxscyBvd25lZCBieSBgY2xpZW50SWRgIGlmIGl0IGRvZXMgbm90IHJlY29ubmVjdCBiZWZvcmUgdGhlXG5cdCAqIGdyYWNlIHdpbmRvdyBlbGFwc2VzLiBPbmx5IG1lYW5pbmdmdWwgZm9yIGEgY2xpZW50IHdpdGggbm8gbGl2ZSB0cmFuc3BvcnQ6XG5cdCAqIGEgY29ubmVjdGVkIGNsaWVudCBpcyBoYW5kbGVkIGJ5IHtAbGluayBfYXR0YWNoQ29ubmVjdGlvbn0sIHdoaWNoIGRpc3Bvc2VzXG5cdCAqIGFueSBhcm1lZCB0aW1lcnMsIHNvIHRoaXMgaXMgYSBuby1vcCB3aGVuIHRoZSBjbGllbnQgaXMgYWN0aXZlLiBUaGUgZGVsYXlcblx0ICogaXMgdGhlIHJlbWFpbmluZyBncmFjZSBtZWFzdXJlZCBmcm9tIHdoZW4gdGhlIGNsaWVudCBkaXNjb25uZWN0ZWQgXHUyMDE0IHNvIGFcblx0ICogY2xpZW50IHRoYXQgZGlzY29ubmVjdGVkIGEgd2hpbGUgYmVmb3JlIHRoZSBjYWxsIHdhcyBpc3N1ZWQgZ2V0cyB0aGVcblx0ICogcmVzaWR1YWwgd2luZG93IHJhdGhlciB0aGFuIGEgZnJlc2ggb25lLCBhbmQgYSBzdGFtcCBmcm9tIGEgbG9uZy1kaXNjb25uZWN0ZWRcblx0ICogY2xpZW50IGZhaWxzIHByb21wdGx5LiBSZS1hcm1zIHRyaWdnZXJlZCBieSBsYXRlciBvcnBoYW5lZCB0b29sIGNhbGxzIGluIHRoZVxuXHQgKiBzYW1lIHNlc3Npb24gc2hyaW5rIHRoZSByZW1haW5pbmcgd2luZG93IGluc3RlYWQgb2YgcmVzZXR0aW5nIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRDbGllbnRUb29sQ2FsbERpc2Nvbm5lY3RUaW1lb3V0KGNsaWVudElkOiBzdHJpbmcsIHNlc3Npb246IHN0cmluZywgY2hhdENoYW5uZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJlY29yZCA9IHRoaXMuX2Vuc3VyZUdyYWNlUmVjb3JkKGNsaWVudElkKTtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0Ly8gQ2xpZW50IGlzIGNvbm5lY3RlZDsgdGhlIGdyYWNlIG1hY2hpbmVyeSBkb2VzIG5vdCBhcHBseS5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmVjb3JkLmRpc2Nvbm5lY3RUaW1lb3V0cy5kZWxldGVBbmREaXNwb3NlKGNoYXRDaGFubmVsKTtcblx0XHRjb25zdCBlbGFwc2VkID0gRGF0ZS5ub3coKSAtIHJlY29yZC5sYXN0U2VlbkF0O1xuXHRcdGNvbnN0IGRlbGF5ID0gTWF0aC5tYXgoMCwgQ0xJRU5UX1RPT0xfQ0FMTF9ESVNDT05ORUNUX1RJTUVPVVQgLSBlbGFwc2VkKTtcblx0XHRyZWNvcmQuZGlzY29ubmVjdFRpbWVvdXRzLnNldChjaGF0Q2hhbm5lbCwgZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVsZWFzZUFjdGl2ZUNsaWVudEZvclNlc3Npb24oc2Vzc2lvbiwgY2xpZW50SWQsIGNoYXRDaGFubmVsKTtcblx0XHR9LCBkZWxheSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNjYW4gYSBjaGF0IGZvciBwZW5kaW5nIGNsaWVudCB0b29sIGNhbGxzIG93bmVkIGJ5IGEgZGlzY29ubmVjdGVkIGNsaWVudFxuXHQgKiBvZiB0aGlzIHByb3RvY29sIHNlcnZlciwgYW5kIGFybSB0aGUgZGlzY29ubmVjdCB0aW1lb3V0IGZvciBlYWNoIG93bmVyLlxuXHQgKiBDYWxsZWQgd2hlbiBhIGBDaGF0VG9vbENhbGxTdGFydGAgLyBgQ2hhdFRvb2xDYWxsUmVhZHlgIGVudmVsb3BlIGlzXG5cdCAqIG9ic2VydmVkIFx1MjAxNCBjb3ZlcmluZyBjYWxscyBpc3N1ZWQgZm9yIGFuIGFscmVhZHktZ29uZSBjbGllbnQsIHdoaWNoIHRoZVxuXHQgKiBsaXZlIGRpc2Nvbm5lY3QgcGF0aCBuZXZlciBzZWVzLiBPd25lcmxlc3MgY2xpZW50IHRvb2wgY2FsbHMgKG5vIGNsaWVudFxuXHQgKiBjb25uZWN0ZWQgYXQgc3RhbXAgdGltZSkgYXJlIGZhaWxlZCBpbW1lZGlhdGVseSBieSB0aGUgcHJvdmlkZXIsIHNvIHRoZXlcblx0ICogbmV2ZXIgcmVhY2ggYSBwZW5kaW5nIHN0YXRlIGhlcmUuIFVua25vd24gY2xpZW50IGlkcyBhcmUgaWdub3JlZCBiZWNhdXNlXG5cdCAqIHRoZXkgbWF5IGJlbG9uZyB0byBhbm90aGVyIHRyYW5zcG9ydCBzdWNoIGFzIGxvY2FsIElQQy5cblx0ICovXG5cdHByaXZhdGUgX2NoZWNrT3JwaGFuZWRDbGllbnRUb29sQ2FsbHMoc2Vzc2lvbjogc3RyaW5nLCBjaGF0Q2hhbm5lbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoYXRDaGFubmVsKTtcblx0XHRjb25zdCBvcnBoYW5Pd25lcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHsgY2xpZW50SWQgfSBvZiB0aGlzLl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzKHN0YXRlKSkge1xuXHRcdFx0Y29uc3Qgb3duZXJSZWNvcmQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnRJZCk7XG5cdFx0XHRpZiAob3duZXJSZWNvcmQ/LnN0YXRlID09PSAnZ3JhY2UnKSB7XG5cdFx0XHRcdG9ycGhhbk93bmVycy5hZGQoY2xpZW50SWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IG93bmVySWQgb2Ygb3JwaGFuT3duZXJzKSB7XG5cdFx0XHR0aGlzLl9zdGFydENsaWVudFRvb2xDYWxsRGlzY29ubmVjdFRpbWVvdXQob3duZXJJZCwgc2Vzc2lvbiwgY2hhdENoYW5uZWwpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBhIGZyZXNobHkgY29ubmVjdGVkIChvciByZWNvbm5lY3RlZCkgdHJhbnNwb3J0IGZvciBgY2xpZW50SWRgLFxuXHQgKiBwcm9tb3RpbmcgdGhlIHJlY29yZCB0byB7QGxpbmsgSUFjdGl2ZUNsaWVudFJlY29yZH0uIFByb21vdGluZyBhIGdyYWNlXG5cdCAqIHJlY29yZCBiYWNrIHRvIGFjdGl2ZSBkaXNwb3NlcyBpdHMgcGVuZGluZyBkaXNjb25uZWN0IHRpbWVyczogdGhlXG5cdCAqIGRpc2Nvbm5lY3QtZ3JhY2Ugd2luZG93IG9ubHkgYXBwbGllcyB3aGlsZSB0aGUgY2xpZW50IGhhcyBubyBsaXZlXG5cdCAqIHRyYW5zcG9ydC4gVGhpcyBpcyB0aGUgc2luZ2xlIHBsYWNlIHRoYXQgbWFpbnRhaW5zIHRoZSBcImFjdGl2ZSByZWNvcmRzXG5cdCAqIGhvbGQgbm8gZ3JhY2UgdGltZXJzXCIgaW52YXJpYW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfYXR0YWNoQ29ubmVjdGlvbihjbGllbnRJZDogc3RyaW5nLCBjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQpOiB2b2lkIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NsaWVudHMuZ2V0KGNsaWVudElkKTtcblx0XHRpZiAoZXhpc3Rpbmc/LnN0YXRlID09PSAnYWN0aXZlJykge1xuXHRcdFx0ZXhpc3RpbmcuY29ubmVjdGlvbnMucHVzaChjbGllbnQpO1xuXHRcdFx0ZXhpc3RpbmcuY2xpZW50SW5mbyA9IGNsaWVudC5jbGllbnRJbmZvID8/IGV4aXN0aW5nLmNsaWVudEluZm87XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4aXN0aW5nPy5kaXNjb25uZWN0VGltZW91dHMuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fY2xpZW50cy5zZXQoY2xpZW50SWQsIHsgc3RhdGU6ICdhY3RpdmUnLCBjbGllbnRJbmZvOiBjbGllbnQuY2xpZW50SW5mbyA/PyBleGlzdGluZz8uY2xpZW50SW5mbywgY29ubmVjdGlvbnM6IFtjbGllbnRdIH0pO1xuXHRcdH1cblx0XHR0aGlzLl9wcnVuZUNsaWVudFJlY29yZHMoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25Db3VudC5maXJlKHRoaXMuX2Nvbm5lY3RlZENsaWVudENvdW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdGhlIGV4aXN0aW5nIGdyYWNlIHJlY29yZCBmb3IgYGNsaWVudElkYCwgY3JlYXRpbmcgb25lIGZvciBhXG5cdCAqIG5ldmVyLWNvbm5lY3RlZCBjbGllbnQgKGFuIG9ycGhhbiB0b29sLWNhbGwgc3RhbXApLiBSZXR1cm5zIGB1bmRlZmluZWRgXG5cdCAqIHdoZW4gdGhlIGNsaWVudCBpcyBjdXJyZW50bHkgYWN0aXZlIFx1MjAxNCB0aGUgZ3JhY2UgbWFjaGluZXJ5IGRvZXMgbm90IGFwcGx5XG5cdCAqIHRvIGEgY29ubmVjdGVkIGNsaWVudC4gQSBuZXdseSBjcmVhdGVkIHJlY29yZCBwaW5zIGl0cyBncmFjZSBjbG9jayB0byBub3cuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVHcmFjZVJlY29yZChjbGllbnRJZDogc3RyaW5nKTogSUdyYWNlQ2xpZW50UmVjb3JkIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWNvcmQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnRJZCk7XG5cdFx0aWYgKHJlY29yZD8uc3RhdGUgPT09ICdhY3RpdmUnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAocmVjb3JkKSB7XG5cdFx0XHRyZXR1cm4gcmVjb3JkO1xuXHRcdH1cblx0XHRjb25zdCBjcmVhdGVkOiBJR3JhY2VDbGllbnRSZWNvcmQgPSB7IHN0YXRlOiAnZ3JhY2UnLCBjbGllbnRJbmZvOiB1bmRlZmluZWQsIGxhc3RTZWVuQXQ6IERhdGUubm93KCksIGRpc2Nvbm5lY3RUaW1lb3V0czogbmV3IERpc3Bvc2FibGVNYXAoKSB9O1xuXHRcdHRoaXMuX2NsaWVudHMuc2V0KGNsaWVudElkLCBjcmVhdGVkKTtcblx0XHRyZXR1cm4gY3JlYXRlZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFjdGl2ZUNsaWVudChjbGllbnRJZDogc3RyaW5nKTogSUNvbm5lY3RlZENsaWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEFjdGl2ZUNsaWVudEZyb21SZWNvcmQodGhpcy5fY2xpZW50cy5nZXQoY2xpZW50SWQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFjdGl2ZUNsaWVudEZyb21SZWNvcmQocmVjb3JkOiBJQ2xpZW50UmVjb3JkIHwgdW5kZWZpbmVkKTogSUNvbm5lY3RlZENsaWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHJlY29yZD8uc3RhdGUgIT09ICdhY3RpdmUnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVjb3JkLmNvbm5lY3Rpb25zW3JlY29yZC5jb25uZWN0aW9ucy5sZW5ndGggLSAxXTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbGVhc2VDbGllbnRTdWJzY3JpcHRpb25zKGNsaWVudDogSUNvbm5lY3RlZENsaWVudCwgcmVjb3JkOiBJQWN0aXZlQ2xpZW50UmVjb3JkKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzdWIgb2YgY2xpZW50LnN1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChzdWIua2luZCA9PT0gQ2hhbm5lbEtpbmQuU3RhdGUpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2hhc1N1YnNjcmlwdGlvbkluT3RoZXJDb25uZWN0aW9uKHJlY29yZCwgY2xpZW50LCBzdWIudXJpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FnZW50U2VydmljZS51bnN1YnNjcmliZShVUkkucGFyc2Uoc3ViLnVyaSksIGNsaWVudC5jbGllbnRJZCk7XG5cdFx0XHR9IGVsc2UgaWYgKHN1Yi5raW5kID09PSBDaGFubmVsS2luZC5SZXNvdXJjZVdhdGNoKSB7XG5cdFx0XHRcdHRoaXMuX2FnZW50U2VydmljZS5vblJlc291cmNlV2F0Y2hVbnN1YnNjcmliZWQoc3ViLnVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNsaWVudC5zdWJzY3JpcHRpb25zLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNTdWJzY3JpcHRpb25Jbk90aGVyQ29ubmVjdGlvbihyZWNvcmQ6IElDbGllbnRSZWNvcmQsIGNsaWVudDogSUNvbm5lY3RlZENsaWVudCwgdXJpOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAocmVjb3JkLnN0YXRlICE9PSAnYWN0aXZlJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IG90aGVyIG9mIHJlY29yZC5jb25uZWN0aW9ucykge1xuXHRcdFx0aWYgKG90aGVyICE9PSBjbGllbnQgJiYgb3RoZXIuc3Vic2NyaXB0aW9ucy5oYXModXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqIE51bWJlciBvZiBjbGllbnRzIHRoYXQgY3VycmVudGx5IGhhdmUgYSBsaXZlIGNvbm5lY3Rpb24uICovXG5cdHByaXZhdGUgZ2V0IF9jb25uZWN0ZWRDbGllbnRDb3VudCgpOiBudW1iZXIge1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCByZWNvcmQgb2YgdGhpcy5fY2xpZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHJlY29yZC5zdGF0ZSA9PT0gJ2FjdGl2ZScpIHtcblx0XHRcdFx0Y291bnQrKztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvdW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIERyb3AgZ3JhY2UgcmVjb3JkcyB3aG9zZSB0aW1lcnMgaGF2ZSBhbGwgZmlyZWQgYW5kIHdob3NlIGxhc3Qtc2VlbiB0aW1lIGlzXG5cdCAqIHN0YWxlIGJleW9uZCB0aGUgcmV0ZW50aW9uIHdpbmRvdyAoMTBcdTAwRDcgdGhlIGRpc2Nvbm5lY3QgdGltZW91dCkuIFRoaXNcblx0ICogY292ZXJzIGJvdGggZ2VudWluZWx5LWRpc2Nvbm5lY3RlZCBjbGllbnRzIGFuZCBuZXZlci1jb25uZWN0ZWQgb3JwaGFuXG5cdCAqIHN0YW1wcy4gQm91bmRzIHtAbGluayBfY2xpZW50c30gd2l0aG91dCB0cmFja2luZyBsaXZlbmVzcyBwcmVjaXNlbHkgXHUyMDE0IGFcblx0ICogcHJ1bmVkLXRoZW4tcmVzdXJmYWNpbmcgc3RhbXAgc2ltcGx5IGZhbGxzIGJhY2sgdG8gdGhlIGZ1bGwgZ3JhY2Ugd2luZG93LlxuXHQgKiBBY3RpdmUgcmVjb3JkcyBhcmUgbmV2ZXIgcHJ1bmVkOyB0aGV5IHBlcnNpc3QgdW50aWwgdGhlaXIgbGFzdCB0cmFuc3BvcnRcblx0ICogY2xvc2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcHJ1bmVDbGllbnRSZWNvcmRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGN1dG9mZiA9IERhdGUubm93KCkgLSBDTElFTlRfVE9PTF9DQUxMX0RJU0NPTk5FQ1RfVElNRU9VVCAqIDEwO1xuXHRcdGZvciAoY29uc3QgW2NsaWVudElkLCByZWNvcmRdIG9mIHRoaXMuX2NsaWVudHMpIHtcblx0XHRcdGlmIChyZWNvcmQuc3RhdGUgPT09ICdncmFjZSdcblx0XHRcdFx0JiYgcmVjb3JkLmRpc2Nvbm5lY3RUaW1lb3V0cy5zaXplID09PSAwXG5cdFx0XHRcdCYmIHJlY29yZC5sYXN0U2VlbkF0IDwgY3V0b2ZmKSB7XG5cdFx0XHRcdHRoaXMuX2NsaWVudHMuZGVsZXRlKGNsaWVudElkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckNsaWVudFRvb2xDYWxsRGlzY29ubmVjdFRpbWVvdXQoY2xpZW50SWQ6IHN0cmluZywgY2hhbm5lbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVjb3JkID0gdGhpcy5fY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuXHRcdGlmIChyZWNvcmQ/LnN0YXRlID09PSAnZ3JhY2UnKSB7XG5cdFx0XHRyZWNvcmQuZGlzY29ubmVjdFRpbWVvdXRzLmRlbGV0ZUFuZERpc3Bvc2UoY2hhbm5lbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29tcGxldGVEaXNjb25uZWN0ZWRDbGllbnRUb29sQ2FsbHMoY2xpZW50SWQ6IHN0cmluZywgc2Vzc2lvbjogc3RyaW5nLCBjaGF0Q2hhbm5lbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoYXRDaGFubmVsKTtcblx0XHRjb25zdCBhY3RpdmVUdXJuID0gc3RhdGU/LmFjdGl2ZVR1cm47XG5cdFx0aWYgKCFzdGF0ZSB8fCAhYWN0aXZlVHVybikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHsgdG9vbENhbGwsIGNsaWVudElkOiBvd25lcklkIH0gb2YgdGhpcy5fcGVuZGluZ0NsaWVudFRvb2xDYWxscyhzdGF0ZSkpIHtcblx0XHRcdGlmIChvd25lcklkICE9PSBjbGllbnRJZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1heVJldHJ5V2l0aFJlcGxhY2VtZW50Q2xpZW50ID0gdGhpcy5faGFzUmVwbGFjZW1lbnRBY3RpdmVDbGllbnRUb29sKHN0YXRlLCBjbGllbnRJZCwgdG9vbENhbGwudG9vbE5hbWUpO1xuXHRcdFx0aWYgKHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGF0Q2hhbm5lbCwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdFx0dHVybklkOiBhY3RpdmVUdXJuLmlkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHRvb2xDYWxsLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHRvb2xDYWxsLmludm9jYXRpb25NZXNzYWdlID8/IHRvb2xDYWxsLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGF0Q2hhbm5lbCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6IGFjdGl2ZVR1cm4uaWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHRvb2xDYWxsLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGAke3Rvb2xDYWxsLmRpc3BsYXlOYW1lfSBmYWlsZWRgLFxuXHRcdFx0XHRcdC4uLihtYXlSZXRyeVdpdGhSZXBsYWNlbWVudENsaWVudCA/IHsgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGBUaGUgY2xpZW50IHRoYXQgd2FzIHJ1bm5pbmcgJHt0b29sQ2FsbC5kaXNwbGF5TmFtZX0gZGlzY29ubmVjdGVkLCBidXQgYW5vdGhlciBhY3RpdmUgY2xpZW50IG5vdyBwcm92aWRlcyAke3Rvb2xDYWxsLmRpc3BsYXlOYW1lfS4gWW91IG1heSB0cnkgY2FsbGluZyB0aGUgdG9vbCBhZ2Fpbi5gIH1dIH0gOiB7fSksXG5cdFx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogYENsaWVudCAke2NsaWVudElkfSBkaXNjb25uZWN0ZWQgYmVmb3JlIGNvbXBsZXRpbmcgJHt0b29sQ2FsbC5kaXNwbGF5TmFtZX1gIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIFJlcXVlc3RzIChleHBlY3QgYSByZXNwb25zZSkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIE1ldGhvZHMgaGFuZGxlZCBieSB0aGUgcmVxdWVzdCBkaXNwYXRjaGVyIChleGNsdWRlcyBpbml0aWFsaXplL3JlY29ubmVjdFxuXHQgKiB3aGljaCBhcmUgaGFuZGxlZCBkdXJpbmcgdGhlIGhhbmRzaGFrZSBwaGFzZSkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0SGFuZGxlcnM6IFJlcXVlc3RIYW5kbGVyTWFwID0ge1xuXHRcdHN1YnNjcmliZTogYXN5bmMgKGNsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRjb25zdCBjbGFzc2lmaWVkID0gY2xhc3NpZnlDaGFubmVsKHBhcmFtcy5jaGFubmVsKTtcblx0XHRcdGlmICghY2xhc3NpZmllZCkge1xuXHRcdFx0XHQvLyBPVExQLWZsYXZvdXJlZCBVUkkgd2UgZG9uJ3QgdW5kZXJzdGFuZCAoZS5nLiB1bmtub3duXG5cdFx0XHRcdC8vIGxldmVsKS4gQWNrbm93bGVkZ2UgYXMgc3RhdGVsZXNzIHNvIHRoZSBjbGllbnQgZG9lc24ndFxuXHRcdFx0XHQvLyBoYW5nLCBidXQgaW5zdGFsbCBub3RoaW5nLlxuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2xhc3NpZmllZC5raW5kID09PSBDaGFubmVsS2luZC5PdGxwTG9ncykge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2NvbmZpZy5vdGxwTG9nRW1pdHRlcikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Byb3RvY29sU2VydmVyXSBJZ25vcmluZyBPVExQIHN1YnNjcmliZSBmb3IgJHtwYXJhbXMuY2hhbm5lbH06IG5vIE9UTFAgZW1pdHRlciBjb25maWd1cmVkLmApO1xuXHRcdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjbGllbnQuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NpZmllZC51cmksIGNsYXNzaWZpZWQpO1xuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2xhc3NpZmllZC5raW5kID09PSBDaGFubmVsS2luZC5SZXNvdXJjZVdhdGNoKSB7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0b3IgPSB0aGlzLl9hZ2VudFNlcnZpY2Uub25SZXNvdXJjZVdhdGNoU3Vic2NyaWJlZChjbGFzc2lmaWVkLnVyaSk7XG5cdFx0XHRcdGlmICghZGVzY3JpcHRvcikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYFJlc291cmNlIHdhdGNoIG5vdCBmb3VuZDogJHtwYXJhbXMuY2hhbm5lbH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjbGllbnQuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NpZmllZC51cmksIGNsYXNzaWZpZWQpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHNuYXBzaG90OiB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogY2xhc3NpZmllZC51cmksXG5cdFx0XHRcdFx0XHRzdGF0ZTogZGVzY3JpcHRvcixcblx0XHRcdFx0XHRcdGZyb21TZXE6IHRoaXMuX3N0YXRlTWFuYWdlci5zZXJ2ZXJTZXEsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fYWdlbnRTZXJ2aWNlLnN1YnNjcmliZShVUkkucGFyc2UocGFyYW1zLmNoYW5uZWwpLCBjbGllbnQuY2xpZW50SWQpO1xuXHRcdFx0XHRjbGllbnQuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NpZmllZC51cmksIGNsYXNzaWZpZWQpO1xuXHRcdFx0XHR0aGlzLl9jbGVhckNsaWVudFRvb2xDYWxsRGlzY29ubmVjdFRpbWVvdXQoY2xpZW50LmNsaWVudElkLCBjbGFzc2lmaWVkLnVyaSk7XG5cdFx0XHRcdC8vIGBJU3RhdGVTbmFwc2hvdGAgaXMgd2lkZW5lZCB3aXRoIGBDaGF0U3RhdGVgIChzZWUgc2Vzc2lvblByb3RvY29sLnRzKTtcblx0XHRcdFx0Ly8gdGhlIGdlbmVyYXRlZCB3aXJlIGBTbmFwc2hvdGAgdW5pb24gZG9lcyBub3QgbGlzdCBpdCB5ZXQuIFRoZSB2YWx1ZVxuXHRcdFx0XHQvLyBpcyBKU09OIG92ZXIgdGhlIHdpcmUsIHNvIG5hcnJvd2luZyBhdCB0aGlzIGJvdW5kYXJ5IGlzIHNhZmUuXG5cdFx0XHRcdHJldHVybiB7IHNuYXBzaG90OiBzbmFwc2hvdCBhcyBTdWJzY3JpYmVSZXN1bHRbJ3NuYXBzaG90J10gfTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikge1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIGBSZXNvdXJjZSBub3QgZm91bmQ6ICR7cGFyYW1zLmNoYW5uZWx9YCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRjcmVhdGVTZXNzaW9uOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRsZXQgY3JlYXRlZFNlc3Npb246IFVSSTtcblx0XHRcdC8vIFJlc29sdmUgZm9yayB0dXJuSWQgdG8gYSAwLWJhc2VkIGluZGV4IHVzaW5nIHRoZSBzb3VyY2Ugc2Vzc2lvbidzXG5cdFx0XHQvLyB0dXJuIGxpc3QgaW4gdGhlIHN0YXRlIG1hbmFnZXIuXG5cdFx0XHRsZXQgZm9yazogeyBzZXNzaW9uOiBVUkk7IHR1cm5JbmRleDogbnVtYmVyOyB0dXJuSWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHBhcmFtcy5mb3JrKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZVN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShwYXJhbXMuZm9yay5zZXNzaW9uKTtcblx0XHRcdFx0aWYgKCFzb3VyY2VTdGF0ZSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYEZvcmsgc291cmNlIHNlc3Npb24gbm90IGZvdW5kOiAke3BhcmFtcy5mb3JrLnNlc3Npb259YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdHVybkluZGV4ID0gc291cmNlU3RhdGUudHVybnMuZmluZEluZGV4KHQgPT4gdC5pZCA9PT0gcGFyYW1zLmZvcmshLnR1cm5JZCk7XG5cdFx0XHRcdGlmICh0dXJuSW5kZXggPCAwKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQUhQX1NFU1NJT05fTk9UX0ZPVU5ELCBgRm9yayB0dXJuIElEICR7cGFyYW1zLmZvcmsudHVybklkfSBub3QgZm91bmQgaW4gc2Vzc2lvbiAke3BhcmFtcy5mb3JrLnNlc3Npb259YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yayA9IHsgc2Vzc2lvbjogVVJJLnBhcnNlKHBhcmFtcy5mb3JrLnNlc3Npb24pLCB0dXJuSW5kZXgsIHR1cm5JZDogcGFyYW1zLmZvcmsudHVybklkIH07XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiB0aGUgY2xpZW50IGVhZ2VybHkgY2xhaW1lZCB0aGUgYWN0aXZlIGNsaWVudCByb2xlLCB2YWxpZGF0ZVxuXHRcdFx0Ly8gdGhlIGNsaWVudElkIG1hdGNoZXMgdGhlIGNvbm5lY3Rpb24gYmVmb3JlIGZvcndhcmRpbmcuXG5cdFx0XHRpZiAocGFyYW1zLmFjdGl2ZUNsaWVudCAmJiBwYXJhbXMuYWN0aXZlQ2xpZW50LmNsaWVudElkICE9PSBfY2xpZW50LmNsaWVudElkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsIGBjcmVhdGVTZXNzaW9uLmFjdGl2ZUNsaWVudC5jbGllbnRJZCBtdXN0IG1hdGNoIHRoZSBjb25uZWN0aW9uJ3MgY2xpZW50SWRgKTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNyZWF0ZWRTZXNzaW9uID0gYXdhaXQgdGhpcy5fYWdlbnRTZXJ2aWNlLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRcdHByb3ZpZGVyOiBwYXJhbXMucHJvdmlkZXIsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBwYXJhbXMud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZCA9PiBVUkkucGFyc2UoZCkpLFxuXHRcdFx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShwYXJhbXMuY2hhbm5lbCksXG5cdFx0XHRcdFx0Zm9yayxcblx0XHRcdFx0XHRjb25maWc6IHBhcmFtcy5jb25maWcsXG5cdFx0XHRcdFx0YWN0aXZlQ2xpZW50OiBwYXJhbXMuYWN0aXZlQ2xpZW50LFxuXHRcdFx0XHRcdHByb2dyZXNzVG9rZW46IHBhcmFtcy5wcm9ncmVzc1Rva2VuLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikge1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBSFBfUFJPVklERVJfTk9UX0ZPVU5ELCBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBwcm92aWRlciBob25vcmVkIHRoZSBjbGllbnQtY2hvc2VuIHNlc3Npb24gVVJJIHBlciB0aGUgcHJvdG9jb2wgY29udHJhY3Rcblx0XHRcdGlmIChjcmVhdGVkU2Vzc2lvbi50b1N0cmluZygpICE9PSBVUkkucGFyc2UocGFyYW1zLmNoYW5uZWwpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUHJvdG9jb2xTZXJ2ZXJdIGNyZWF0ZVNlc3Npb246IHByb3ZpZGVyIHJldHVybmVkIFVSSSAke2NyZWF0ZWRTZXNzaW9uLnRvU3RyaW5nKCl9IGJ1dCBjbGllbnQgcmVxdWVzdGVkICR7cGFyYW1zLmNoYW5uZWx9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9LFxuXHRcdGRpc3Bvc2VTZXNzaW9uOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hZ2VudFNlcnZpY2UuZGlzcG9zZVNlc3Npb24oVVJJLnBhcnNlKHBhcmFtcy5jaGFubmVsKSk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9LFxuXHRcdGNyZWF0ZUNoYXQ6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShwYXJhbXMuY2hhbm5lbCk7XG5cdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYFNlc3Npb24gbm90IGZvdW5kOiAke3BhcmFtcy5jaGFubmVsfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBzdGF0ZS5kZWZhdWx0Q2hhdCA/PyBidWlsZERlZmF1bHRDaGF0VXJpKHBhcmFtcy5jaGFubmVsKTtcblx0XHRcdC8vIFRoZSBkZWZhdWx0IGNoYXQgaXMgY3JlYXRlZCBhbG9uZ3NpZGUgaXRzIHNlc3Npb247IGNyZWF0aW5nIGl0XG5cdFx0XHQvLyBhZ2FpbiBpcyBhIG5vLW9wLiBBbnkgb3RoZXIgY2hhdCBVUkkgc3BpbnMgdXAgYW4gYWRkaXRpb25hbCBjaGF0LlxuXHRcdFx0aWYgKFVSSS5wYXJzZShwYXJhbXMuY2hhdCkudG9TdHJpbmcoKSA9PT0gVVJJLnBhcnNlKGRlZmF1bHRDaGF0KS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc291cmNlID0gcGFyYW1zLnNvdXJjZTtcblx0XHRcdGxldCBvcHRpb25zOiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0c3dpdGNoIChzb3VyY2Uua2luZCkge1xuXHRcdFx0XHRcdGNhc2UgQ2hhdFNvdXJjZUtpbmQuRm9yazpcblx0XHRcdFx0XHRcdG9wdGlvbnMgPSB7IGZvcms6IHsgc291cmNlOiBVUkkucGFyc2Uoc291cmNlLmNoYXQpLCB0dXJuSWQ6IHNvdXJjZS50dXJuSWQgfSB9O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBDaGF0U291cmNlS2luZC5TaWRlQ2hhdDpcblx0XHRcdFx0XHRcdG9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHRcdHNpZGVDaGF0OiB7XG5cdFx0XHRcdFx0XHRcdFx0c291cmNlOiBVUkkucGFyc2Uoc291cmNlLmNoYXQpLFxuXHRcdFx0XHRcdFx0XHRcdHR1cm5JZDogc291cmNlLnR1cm5JZCxcblx0XHRcdFx0XHRcdFx0XHQuLi4oc291cmNlLnNlbGVjdGlvbiA/IHsgc2VsZWN0aW9uOiBzb3VyY2Uuc2VsZWN0aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsIGBVbnN1cHBvcnRlZCBjcmVhdGVDaGF0IHNvdXJjZSBraW5kOiAke1N0cmluZygoc291cmNlIGFzIHsga2luZD86IHVua25vd24gfSkua2luZCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2FnZW50U2VydmljZS5jcmVhdGVDaGF0KFxuXHRcdFx0XHRVUkkucGFyc2UocGFyYW1zLmNoYW5uZWwpLFxuXHRcdFx0XHRVUkkucGFyc2UocGFyYW1zLmNoYXQpLFxuXHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0sXG5cdFx0ZGlzcG9zZUNoYXQ6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UocGFyYW1zLmNoYW5uZWwpO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGF0VXJpKGNoYXQpO1xuXHRcdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9hZ2VudFNlcnZpY2UuZGlzcG9zZUNoYXQoVVJJLnBhcnNlKHBhcnNlZC5zZXNzaW9uKSwgY2hhdCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9LFxuXHRcdHJlc291cmNlV3JpdGU6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UucmVzb3VyY2VXcml0ZShwYXJhbXMpO1xuXHRcdH0sXG5cdFx0bGlzdFNlc3Npb25zOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2FnZW50U2VydmljZS5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gc2Vzc2lvbnMubWFwKHMgPT4ge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlciA9IEFnZW50U2Vzc2lvbi5wcm92aWRlcihzLnNlc3Npb24pO1xuXHRcdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBZ2VudCBzZXNzaW9uIFVSSSBoYXMgbm8gcHJvdmlkZXIgc2NoZW1lOiAke3Muc2Vzc2lvbi50b1N0cmluZygpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHMuc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRcdHRpdGxlOiBzLnN1bW1hcnkgPz8gJ1Nlc3Npb24nLFxuXHRcdFx0XHRcdHN0YXR1czogcy5zdGF0dXMgPz8gU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRcdGFjdGl2aXR5OiBzLmFjdGl2aXR5LFxuXHRcdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUocy5zdGFydFRpbWUpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUocy5tb2RpZmllZFRpbWUpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0Li4uKHMucHJvamVjdCA/IHsgcHJvamVjdDogeyB1cmk6IHMucHJvamVjdC51cmkudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IHMucHJvamVjdC5kaXNwbGF5TmFtZSB9IH0gOiB7fSksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzLndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gZC50b1N0cmluZygpKSxcblx0XHRcdFx0XHRjaGFuZ2VzOiBzLmNoYW5nZXMsXG5cdFx0XHRcdFx0Ly8gYF9tZXRhYCBjYXJyaWVzIHRoZSB3b3Jrc3BhY2UtbGVzcyBtYXJrZXIsIHdoaWNoIHNlZWRzIG9yXG5cdFx0XHRcdFx0Ly8gcHJvbW90ZXMgdGhlIGNsaWVudCdzIHNlc3Npb24ga2luZCBhbmQgY2Fubm90IGJlXG5cdFx0XHRcdFx0Ly8gcmUtZGVyaXZlZCBmcm9tIHRoZSAoc2NyYXRjaCkgd29ya2luZyBkaXJlY3RvcnkuXG5cdFx0XHRcdFx0Li4uKHMuX21ldGEgIT09IHVuZGVmaW5lZCA/IHsgX21ldGE6IHMuX21ldGEgfSA6IHt9KSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgTGlzdFNlc3Npb25zUmVzdWx0WydpdGVtcyddW251bWJlcl07XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IGl0ZW1zIH07XG5cdFx0fSxcblx0XHRyZXNvbHZlU2Vzc2lvbkNvbmZpZzogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5yZXNvbHZlU2Vzc2lvbkNvbmZpZyh7XG5cdFx0XHRcdHByb3ZpZGVyOiBwYXJhbXMucHJvdmlkZXIsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHBhcmFtcy53b3JraW5nRGlyZWN0b3J5ID8gVVJJLnBhcnNlKHBhcmFtcy53b3JraW5nRGlyZWN0b3J5KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29uZmlnOiBwYXJhbXMuY29uZmlnLFxuXHRcdFx0fSk7XG5cdFx0fSxcblx0XHRzZXNzaW9uQ29uZmlnQ29tcGxldGlvbnM6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2Uuc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHtcblx0XHRcdFx0cHJvdmlkZXI6IHBhcmFtcy5wcm92aWRlcixcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcGFyYW1zLndvcmtpbmdEaXJlY3RvcnkgPyBVUkkucGFyc2UocGFyYW1zLndvcmtpbmdEaXJlY3RvcnkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maWc6IHBhcmFtcy5jb25maWcsXG5cdFx0XHRcdHByb3BlcnR5OiBwYXJhbXMucHJvcGVydHksXG5cdFx0XHRcdHF1ZXJ5OiBwYXJhbXMucXVlcnksXG5cdFx0XHR9KTtcblx0XHR9LFxuXHRcdGNvbXBsZXRpb25zOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLmNvbXBsZXRpb25zKHBhcmFtcyk7XG5cdFx0fSxcblx0XHRmZXRjaFR1cm5zOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUocGFyYW1zLmNoYW5uZWwpO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIGBTZXNzaW9uIG5vdCBmb3VuZDogJHtwYXJhbXMuY2hhbm5lbH1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXJhbXMuY3Vyc29yICYmIHBhcmFtcy5jdXJzb3IgIT09IHN0YXRlLnR1cm5zTmV4dEN1cnNvcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zLCBgVW5yZWNvZ25pemVkIGZldGNoVHVybnMgY3Vyc29yYCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGFyYW1zLmNoYW5uZWwsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybnNMb2FkZWQsXG5cdFx0XHRcdHR1cm5zOiBbXSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH0sXG5cdFx0cmVzb3VyY2VMaXN0OiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLnJlc291cmNlTGlzdChVUkkucGFyc2UocGFyYW1zLnVyaSkpO1xuXHRcdH0sXG5cdFx0cmVzb3VyY2VSZWFkOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLnJlc291cmNlUmVhZChVUkkucGFyc2UocGFyYW1zLnVyaSkpO1xuXHRcdH0sXG5cdFx0cmVzb3VyY2VDb3B5OiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLnJlc291cmNlQ29weShwYXJhbXMpO1xuXHRcdH0sXG5cdFx0cmVzb3VyY2VEZWxldGU6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UucmVzb3VyY2VEZWxldGUocGFyYW1zKTtcblx0XHR9LFxuXHRcdHJlc291cmNlTW92ZTogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5yZXNvdXJjZU1vdmUocGFyYW1zKTtcblx0XHR9LFxuXHRcdHJlc291cmNlUmVzb2x2ZTogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5yZXNvdXJjZVJlc29sdmUocGFyYW1zKTtcblx0XHR9LFxuXHRcdHJlc291cmNlTWtkaXI6IGFzeW5jIChfY2xpZW50LCBwYXJhbXMpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UucmVzb3VyY2VNa2RpcihwYXJhbXMpO1xuXHRcdH0sXG5cdFx0Y3JlYXRlUmVzb3VyY2VXYXRjaDogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5jcmVhdGVSZXNvdXJjZVdhdGNoKHBhcmFtcyk7XG5cdFx0fSxcblx0XHRyZXNvdXJjZVJlcXVlc3Q6IGFzeW5jIChfY2xpZW50LCBfcGFyYW1zKSA9PiB7XG5cdFx0XHQvLyBUaGUgbG9jYWwgYWdlbnQgaG9zdCBkb2VzIG5vdCB5ZXQgZW5mb3JjZSBwZXItcmVzb3VyY2UgZ3JhbnRzXG5cdFx0XHQvLyBmb3IgY2xpZW50IFx1MjE5MiBzZXJ2ZXIgYWNjZXNzLiBBbHdheXMgZ3JhbnQ7IHJlY2VpdmVycyBNQVkgcmVzY2luZFxuXHRcdFx0Ly8gYWNjZXNzIGJ5IHJldHVybmluZyBgUGVybWlzc2lvbkRlbmllZGAgb24gc3Vic2VxdWVudCBvcGVyYXRpb25zLlxuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH0sXG5cdFx0YXV0aGVudGljYXRlOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9hZ2VudFNlcnZpY2UuYXV0aGVudGljYXRlKHBhcmFtcyk7XG5cdFx0XHRpZiAoIXJlc3VsdC5hdXRoZW50aWNhdGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9BVVRIX1JFUVVJUkVELCBgQXV0aGVudGljYXRpb24gZmFpbGVkIGZvciByZXNvdXJjZTogJHtwYXJhbXMucmVzb3VyY2V9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fSxcblx0XHRjcmVhdGVUZXJtaW5hbDogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5fYWdlbnRTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHBhcmFtcyk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9LFxuXHRcdGRpc3Bvc2VUZXJtaW5hbDogYXN5bmMgKF9jbGllbnQsIHBhcmFtcykgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5fYWdlbnRTZXJ2aWNlLmRpc3Bvc2VUZXJtaW5hbChVUkkucGFyc2UocGFyYW1zLmNoYW5uZWwpKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0sXG5cdFx0aW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uOiBhc3luYyAoX2NsaWVudCwgcGFyYW1zKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLmludm9rZUNoYW5nZXNldE9wZXJhdGlvbihwYXJhbXMpO1xuXHRcdH0sXG5cdH07XG5cblxuXHQvLyAtLS0tIFJldmVyc2UgUlBDIChzZXJ2ZXIgXHUyMTkyIGNsaWVudCByZXF1ZXN0cykgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3JldmVyc2VSZXF1ZXN0SWQgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUmV2ZXJzZVJlcXVlc3RzID0gbmV3IE1hcDxudW1iZXIsIHsgY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50OyByZXNvbHZlOiAodmFsdWU6IHVua25vd24pID0+IHZvaWQ7IHJlamVjdDogKHJlYXNvbjogdW5rbm93bikgPT4gdm9pZCB9PigpO1xuXG5cdC8qKlxuXHQgKiBTZW5kcyBhIEpTT04tUlBDIHJlcXVlc3QgdG8gYSBjb25uZWN0ZWQgY2xpZW50IGFuZCB3YWl0cyBmb3IgdGhlIHJlc3BvbnNlLlxuXHQgKiBVc2VkIGZvciByZXZlcnNlLVJQQyBvcGVyYXRpb25zIGxpa2UgcmVhZGluZyBjbGllbnQtc2lkZSBmaWxlcy5cblx0ICogUmVqZWN0cyBpZiB0aGUgY2xpZW50IGRpc2Nvbm5lY3RzIG9yIHRoZSBzZXJ2ZXIgaXMgZGlzcG9zZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9zZW5kUmV2ZXJzZVJlcXVlc3Q8VD4oY2xpZW50SWQ6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIHBhcmFtczogdW5rbm93bik6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IHRoaXMuX2dldEFjdGl2ZUNsaWVudChjbGllbnRJZCk7XG5cdFx0aWYgKCFjbGllbnQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYENsaWVudCAke2NsaWVudElkfSBpcyBub3QgY29ubmVjdGVkYCkpO1xuXHRcdH1cblx0XHRjb25zdCBpZCA9ICsrdGhpcy5fcmV2ZXJzZVJlcXVlc3RJZDtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JldmVyc2VSZXF1ZXN0cy5zZXQoaWQsIHsgY2xpZW50LCByZXNvbHZlOiByZXNvbHZlIGFzICh2YWx1ZTogdW5rbm93bikgPT4gdm9pZCwgcmVqZWN0IH0pO1xuXHRcdFx0Y29uc3QgcmVxdWVzdDogSnNvblJwY1JlcXVlc3QgPSB7IGpzb25ycGM6ICcyLjAnLCBpZCwgbWV0aG9kLCBwYXJhbXMgfTtcblx0XHRcdGNsaWVudC50cmFuc3BvcnQuc2VuZChyZXF1ZXN0KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWplY3RzIGFuZCBjbGVhcnMgYWxsIHBlbmRpbmcgcmV2ZXJzZS1SUEMgcmVxdWVzdHMgc2VudCBvdmVyIGEgZ2l2ZW5cblx0ICogY29ubmVjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3JlamVjdFBlbmRpbmdSZXZlcnNlUmVxdWVzdHNGb3JDb25uZWN0aW9uKGNsaWVudDogSUNvbm5lY3RlZENsaWVudCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2lkLCBwZW5kaW5nXSBvZiB0aGlzLl9wZW5kaW5nUmV2ZXJzZVJlcXVlc3RzKSB7XG5cdFx0XHRpZiAocGVuZGluZy5jbGllbnQgPT09IGNsaWVudCkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nUmV2ZXJzZVJlcXVlc3RzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdHBlbmRpbmcucmVqZWN0KG5ldyBFcnJvcihgQ2xpZW50ICR7Y2xpZW50LmNsaWVudElkfSBkaXNjb25uZWN0ZWRgKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlUmVxdWVzdChjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQsIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IHVua25vd24sIGlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBoYW5kbGVyID0gdGhpcy5fcmVxdWVzdEhhbmRsZXJzLmhhc093blByb3BlcnR5KG1ldGhvZCkgPyB0aGlzLl9yZXF1ZXN0SGFuZGxlcnNbbWV0aG9kIGFzIFJlcXVlc3RNZXRob2RdIDogdW5kZWZpbmVkO1xuXHRcdGlmIChoYW5kbGVyKSB7XG5cdFx0XHQoaGFuZGxlciBhcyAoY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50LCBwYXJhbXM6IHVua25vd24pID0+IFByb21pc2U8dW5rbm93bj4pKGNsaWVudCwgcGFyYW1zKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtQcm90b2NvbFNlcnZlcl0gUmVxdWVzdCAnJHttZXRob2R9JyBpZD0ke2lkfSBzdWNjZWVkZWRgKTtcblx0XHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKGpzb25ScGNTdWNjZXNzKGlkLCByZXN1bHQgPz8gbnVsbCkpO1xuXHRcdFx0fSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0aWYgKHNob3VsZExvZ0ZhaWxlZFJlcXVlc3QobWV0aG9kLCBwYXJhbXMsIGVycikpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbUHJvdG9jb2xTZXJ2ZXJdIFJlcXVlc3QgJyR7bWV0aG9kfScgZmFpbGVkYCwgZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjbGllbnQudHJhbnNwb3J0LnNlbmQoanNvblJwY0Vycm9yRnJvbShpZCwgZXJyKSk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBWUyBDb2RlIGV4dGVuc2lvbiBtZXRob2RzIChub3QgaW4gdGhlIHR5cGVkIHByb3RvY29sIG1hcHMgeWV0KVxuXHRcdGNvbnN0IGV4dGVuc2lvblJlc3VsdCA9IHRoaXMuX2hhbmRsZUV4dGVuc2lvblJlcXVlc3QobWV0aG9kLCBwYXJhbXMpO1xuXHRcdGlmIChleHRlbnNpb25SZXN1bHQpIHtcblx0XHRcdGV4dGVuc2lvblJlc3VsdC50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdGNsaWVudC50cmFuc3BvcnQuc2VuZChqc29uUnBjU3VjY2VzcyhpZCwgcmVzdWx0ID8/IG51bGwpKTtcblx0XHRcdH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtQcm90b2NvbFNlcnZlcl0gRXh0ZW5zaW9uIHJlcXVlc3QgJyR7bWV0aG9kfScgZmFpbGVkYCwgZXJyKTtcblx0XHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvckZyb20oaWQsIGVycikpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTUNQIHNpZGUtY2hhbm5lbDogcmVxdWVzdHMgdGFyZ2V0aW5nIGFuIGBtY3A6Ly9gIGNoYW5uZWwgY2FycnkgdGhlXG5cdFx0Ly8gY2hhbm5lbCBVUkkgaW4gYHBhcmFtcy5jaGFubmVsYC4gV2UgZm9yd2FyZCB0aGVtIHRocm91Z2ggdGhlXG5cdFx0Ly8gYWdlbnQgc2VydmljZSwgd2hpY2ggcm91dGVzIGJ5IGA8cHJvdmlkZXJJZD4vPHNlc3Npb25JZD4vPHNlcnZlck5hbWU+YFxuXHRcdC8vIHRvIHRoZSBvd25pbmcgYWdlbnQncyBNQ1AgQXBwIGltcGxlbWVudGF0aW9uLiBVbmtub3duIGNoYW5uZWxzIGFuZFxuXHRcdC8vIHVua25vd24gbWV0aG9kcyBhcmUgcmVqZWN0ZWQgd2l0aCBgLTMyNjAxYC5cblx0XHRjb25zdCBtY3BDaGFubmVsID0gcmVhZE1jcENoYW5uZWwocGFyYW1zKTtcblx0XHRpZiAobWNwQ2hhbm5lbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBwYXJhbXNPYmogPSBpc1BhcmFtc09iamVjdChwYXJhbXMpID8gcGFyYW1zIDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fYWdlbnRTZXJ2aWNlLmhhbmRsZU1jcFJlcXVlc3QobWNwQ2hhbm5lbCwgbWV0aG9kLCBwYXJhbXNPYmopLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKGpzb25ScGNTdWNjZXNzKGlkLCByZXN1bHQgPz8gbnVsbCkpO1xuXHRcdFx0fSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIEVycm9yICYmIGVyci5tZXNzYWdlLnN0YXJ0c1dpdGgoJ01ldGhvZCBub3QgZm91bmQnKSkge1xuXHRcdFx0XHRcdGNsaWVudC50cmFuc3BvcnQuc2VuZChqc29uUnBjRXJyb3IoaWQsIEpzb25ScGNFcnJvckNvZGVzLk1ldGhvZE5vdEZvdW5kLCBlcnIubWVzc2FnZSkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbUHJvdG9jb2xTZXJ2ZXJdIG1jcDovLyByZXF1ZXN0ICcke21ldGhvZH0nIG9uICR7bWNwQ2hhbm5lbH0gZmFpbGVkYCwgZXJyKTtcblx0XHRcdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvckZyb20oaWQsIGVycikpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y2xpZW50LnRyYW5zcG9ydC5zZW5kKGpzb25ScGNFcnJvcihpZCwgSnNvblJwY0Vycm9yQ29kZXMuTWV0aG9kTm90Rm91bmQsIGBNZXRob2Qgbm90IGZvdW5kOiAke21ldGhvZH1gKSk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlIFZTIENvZGUgZXh0ZW5zaW9uIG1ldGhvZHMgdGhhdCBhcmUgbm90IHlldCBwYXJ0IG9mIHRoZSB0eXBlZFxuXHQgKiBwcm90b2NvbC4gUmV0dXJucyBhIFByb21pc2UgaWYgdGhlIG1ldGhvZCB3YXMgcmVjb2duaXplZCwgdW5kZWZpbmVkXG5cdCAqIG90aGVyd2lzZS5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZUV4dGVuc2lvblJlcXVlc3QobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogdW5rbm93bik6IFByb21pc2U8dW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9jb25maWcuYWxsb3dFeHRlbnNpb25NZXRob2RzID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKG1ldGhvZCkge1xuXHRcdFx0Y2FzZSAnc2h1dGRvd24nOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLnNodXRkb3duKCk7XG5cdFx0XHRjYXNlICdnZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2FnZW50U2VydmljZS5nZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvKCk7XG5cdFx0XHRjYXNlICdnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcyc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hZ2VudFNlcnZpY2UuZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MoKTtcblx0XHRcdGNhc2UgJ2RpYWdub3N0aWNzRmV0Y2gnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZXJ2aWNlLmRpYWdub3N0aWNzRmV0Y2goKHBhcmFtcyBhcyB7IHVybDogc3RyaW5nIH0pLnVybCk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gQnJvYWRjYXN0aW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9icm9hZGNhc3RBY3Rpb24oZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1Byb3RvY29sU2VydmVyXSBCcm9hZGNhc3RpbmcgYWN0aW9uOiAke2VudmVsb3BlLmFjdGlvbi50eXBlfWApO1xuXHRcdGNvbnN0IG1zZzogQWhwU2VydmVyTm90aWZpY2F0aW9uPCdhY3Rpb24nPiA9IHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogJ2FjdGlvbicsIHBhcmFtczogZW52ZWxvcGUgfTtcblx0XHRmb3IgKGNvbnN0IHJlY29yZCBvZiB0aGlzLl9jbGllbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSB0aGlzLl9nZXRBY3RpdmVDbGllbnRGcm9tUmVjb3JkKHJlY29yZCk7XG5cdFx0XHRpZiAoY2xpZW50ICYmIHRoaXMuX2lzUmVsZXZhbnRUb0NsaWVudChjbGllbnQsIGVudmVsb3BlKSkge1xuXHRcdFx0XHRjbGllbnQudHJhbnNwb3J0LnNlbmQobXNnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9icm9hZGNhc3ROb3RpZmljYXRpb24obm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uKTogdm9pZCB7XG5cdFx0Ly8gRWFjaCBwcm90b2NvbCBub3RpZmljYXRpb24gbm93IHNoaXBzIGFzIGl0cyBvd24gdG9wLWxldmVsIG1ldGhvZC4gVGhlXG5cdFx0Ly8gYHR5cGVgIGRpc2NyaW1pbmFudCBvbiBvdXIgbG9jYWwge0BsaW5rIFByb3RvY29sTm90aWZpY2F0aW9ufSB1bmlvbiBpc1xuXHRcdC8vIHRoZSB3aXJlLWxldmVsIG1ldGhvZCBuYW1lLCBzbyB3ZSBjYW4gcm91dGUgaXQgZGlyZWN0bHkuXG5cdFx0Y29uc3QgeyB0eXBlLCAuLi5wYXJhbXMgfSA9IG5vdGlmaWNhdGlvbjtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0Y29uc3QgbXNnID0geyBqc29ucnBjOiAnMi4wJywgbWV0aG9kOiB0eXBlLCBwYXJhbXMgfSBhcyBBaHBTZXJ2ZXJOb3RpZmljYXRpb247XG5cdFx0Zm9yIChjb25zdCByZWNvcmQgb2YgdGhpcy5fY2xpZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0dGhpcy5fZ2V0QWN0aXZlQ2xpZW50RnJvbVJlY29yZChyZWNvcmQpPy50cmFuc3BvcnQuc2VuZChtc2cpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGb3J3YXJkIGFuIE1DUCBzZXJ2ZXItb3JpZ2luYXRlZCBub3RpZmljYXRpb24gKGUuZy5cblx0ICogYG5vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkYCkgb3ZlciB0aGUgQUhQIHRyYW5zcG9ydC4gVGhlXG5cdCAqIGBjaGFubmVsYCBmaWVsZCBvbiBgcGFyYW1zYCBpcyB0aGUgQUhQIHJvdXRpbmcgZW52ZWxvcGU7IHRoZVxuXHQgKiByZWNlaXZpbmcgY2xpZW50IGRlbXVsdGlwbGV4ZXMgYnkgaXQuIE5vdGlmaWNhdGlvbnMgYXJlIGJyb2FkY2FzdFxuXHQgKiB0byBldmVyeSBjb25uZWN0ZWQgY2xpZW50IFx1MjAxNCBwZXItY2hhbm5lbCBzdWJzY3JpcHRpb24gZmlsdGVyaW5nIGlzXG5cdCAqIGxlZnQgdG8gdGhlIGNsaWVudCwgc2luY2UgTUNQIG5vdGlmaWNhdGlvbnMgYXJlIGNoZWFwIGFuZCB0aGVcblx0ICogY2xpZW50IGFscmVhZHkga25vd3Mgd2hpY2ggY2hhbm5lbHMgaXQgY2FyZXMgYWJvdXQuXG5cdCAqL1xuXHRwcml2YXRlIF9icm9hZGNhc3RNY3BOb3RpZmljYXRpb24obm90aWZpY2F0aW9uOiBJTWNwTm90aWZpY2F0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgLi4uKG5vdGlmaWNhdGlvbi5wYXJhbXMgPz8ge30pLCBjaGFubmVsOiBub3RpZmljYXRpb24uY2hhbm5lbCB9O1xuXHRcdC8vIE1DUCBub3RpZmljYXRpb25zIGRvbid0IHNoYXJlIGEgZGlzY3JpbWluYXRlZCBgbWV0aG9kYCBsaXRlcmFsXG5cdFx0Ly8gd2l0aCB0aGUga25vd24ge0BsaW5rIEFocFNlcnZlck5vdGlmaWNhdGlvbn0gdW5pb24sIHNvIGNhc3Rcblx0XHQvLyB0aHJvdWdoIGB1bmtub3duYCB0byBzYXRpc2Z5IHRoZSB0cmFuc3BvcnQgY29udHJhY3QuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdGNvbnN0IG1zZyA9IHsganNvbnJwYzogJzIuMCcgYXMgY29uc3QsIG1ldGhvZDogbm90aWZpY2F0aW9uLm1ldGhvZCwgcGFyYW1zIH0gYXMgdW5rbm93biBhcyBBaHBTZXJ2ZXJOb3RpZmljYXRpb247XG5cdFx0Zm9yIChjb25zdCByZWNvcmQgb2YgdGhpcy5fY2xpZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0dGhpcy5fZ2V0QWN0aXZlQ2xpZW50RnJvbVJlY29yZChyZWNvcmQpPy50cmFuc3BvcnQuc2VuZChtc2cpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wIGEgc3Vic2NyaXB0aW9uIGlkZW50aWZpZWQgYnkgYGNoYW5uZWxgIGZyb20gYGNsaWVudGAuIEhhbmRsZXNcblx0ICogY2Fub25pY2FsaXNhdGlvbiBmb3IgT1RMUCBVUklzIChzbyBhbiBgdW5zdWJzY3JpYmVgIHdpdGggYSBVUklcblx0ICogdmFyaWFudCBjb2xsYXBzZXMgdG8gdGhlIHNhbWUgZW50cnkgYXMgdGhlIG9yaWdpbmFsIGBzdWJzY3JpYmVgKVxuXHQgKiBhbmQgdGVhcnMgZG93biB0aGUgYWdlbnQtc2VydmljZSByZWZjb3VudCBmb3Igc3RhdGUgY2hhbm5lbHMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW1vdmVTdWJzY3JpcHRpb24oY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50LCBjaGFubmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjbGFzc2lmaWVkID0gY2xhc3NpZnlDaGFubmVsKGNoYW5uZWwpO1xuXHRcdGlmICghY2xhc3NpZmllZCkge1xuXHRcdFx0Ly8gT1RMUC1mbGF2b3VyZWQgVVJJIHdpdGggYW4gdW5rbm93biBsZXZlbCBcdTIwMTQgdGhlcmUgY2FuIG5ldmVyXG5cdFx0XHQvLyBoYXZlIGJlZW4gYSBtYXRjaGluZyBzdWJzY3JpcHRpb24uIFNpbGVudGx5IGlnbm9yZS5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3ViID0gY2xpZW50LnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzaWZpZWQudXJpKTtcblx0XHRpZiAoIXN1Yikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjbGllbnQuc3Vic2NyaXB0aW9ucy5kZWxldGUoY2xhc3NpZmllZC51cmkpO1xuXHRcdGlmIChzdWIua2luZCA9PT0gQ2hhbm5lbEtpbmQuU3RhdGUpIHtcblx0XHRcdGNvbnN0IHJlY29yZCA9IHRoaXMuX2NsaWVudHMuZ2V0KGNsaWVudC5jbGllbnRJZCk7XG5cdFx0XHRpZiAocmVjb3JkICYmIHRoaXMuX2hhc1N1YnNjcmlwdGlvbkluT3RoZXJDb25uZWN0aW9uKHJlY29yZCwgY2xpZW50LCBzdWIudXJpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hZ2VudFNlcnZpY2UudW5zdWJzY3JpYmUoVVJJLnBhcnNlKHN1Yi51cmkpLCBjbGllbnQuY2xpZW50SWQpO1xuXHRcdFx0aWYgKGlzQWhwQ2hhdENoYW5uZWwoc3ViLnVyaSkpIHtcblx0XHRcdFx0dGhpcy5fcmVsZWFzZUFjdGl2ZUNsaWVudEZvclNlc3Npb24ocGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShzdWIudXJpKSwgY2xpZW50LmNsaWVudElkLCBzdWIudXJpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzdWIudXJpKTtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGF0IG9mIHN0YXRlPy5jaGF0cyA/PyBbXSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlbGVhc2VBY3RpdmVDbGllbnRGb3JTZXNzaW9uKHN1Yi51cmksIGNsaWVudC5jbGllbnRJZCwgY2hhdC5yZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHN1Yi5raW5kID09PSBDaGFubmVsS2luZC5SZXNvdXJjZVdhdGNoKSB7XG5cdFx0XHR0aGlzLl9hZ2VudFNlcnZpY2Uub25SZXNvdXJjZVdhdGNoVW5zdWJzY3JpYmVkKHN1Yi51cmkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGYW4gb3V0IGFuIE9UTFAgbG9nIHJlY29yZCB0byBldmVyeSBjb25uZWN0ZWQgY2xpZW50IHRoYXQgaGFzXG5cdCAqIHN1YnNjcmliZWQgdG8gYSBsb2dzIGNoYW5uZWwgd2hvc2UgYHtsZXZlbH1gIGJhbmQgaW5jbHVkZXMgdGhlXG5cdCAqIHJlY29yZCdzIGBzZXZlcml0eU51bWJlcmAuIFRoZSBub3RpZmljYXRpb24ncyBgY2hhbm5lbGAgZmllbGQgaXNcblx0ICogdGhlIGNhbm9uaWNhbCBVUkkgdGhlIGNsaWVudCBzdWJzY3JpYmVkIGFnYWluc3QgXHUyMDE0IGNsaWVudHMgY2FuXG5cdCAqIHJvdXRlIGJ5IFVSSSB3aXRob3V0IHJlLWRlcml2aW5nIHRoZSBsZXZlbC5cblx0ICovXG5cdHByaXZhdGUgX2Jyb2FkY2FzdE90bHBMb2cocmVjb3JkOiBJT3RscExvZ1JlY29yZCk6IHZvaWQge1xuXHRcdGNvbnN0IHBheWxvYWQgPSB0b1Jlc291cmNlTG9nc1BheWxvYWQocmVjb3JkKTtcblx0XHRmb3IgKGNvbnN0IGNsaWVudFJlY29yZCBvZiB0aGlzLl9jbGllbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSB0aGlzLl9nZXRBY3RpdmVDbGllbnRGcm9tUmVjb3JkKGNsaWVudFJlY29yZCk7XG5cdFx0XHRpZiAoIWNsaWVudCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgc3ViIG9mIGNsaWVudC5zdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmIChzdWIua2luZCAhPT0gQ2hhbm5lbEtpbmQuT3RscExvZ3MpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVjb3JkLnNldmVyaXR5TnVtYmVyIDwgbGV2ZWxUb1NldmVyaXR5TnVtYmVyKHN1Yi5sZXZlbCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtc2c6IEFocFNlcnZlck5vdGlmaWNhdGlvbjwnb3RscC9leHBvcnRMb2dzJz4gPSB7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdFx0bWV0aG9kOiAnb3RscC9leHBvcnRMb2dzJyxcblx0XHRcdFx0XHRwYXJhbXM6IHsgY2hhbm5lbDogc3ViLnVyaSwgcGF5bG9hZCB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjbGllbnQudHJhbnNwb3J0LnNlbmQobXNnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc1JlbGV2YW50VG9DbGllbnQoY2xpZW50OiBJQ29ubmVjdGVkQ2xpZW50LCBlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiBib29sZWFuIHtcblx0XHRjb25zdCBzdWIgPSBjbGllbnQuc3Vic2NyaXB0aW9ucy5nZXQoZW52ZWxvcGUuY2hhbm5lbCk7XG5cdFx0aWYgKHN1Yj8ua2luZCA9PT0gQ2hhbm5lbEtpbmQuU3RhdGUgfHwgc3ViPy5raW5kID09PSBDaGFubmVsS2luZC5SZXNvdXJjZVdhdGNoKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFpc0FocFJvb3RDaGFubmVsKGVudmVsb3BlLmNoYW5uZWwpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBpc0FjdGlvbkVudmVsb3BlUmVsZXZhbnRUb1N1YnNjcmlwdGlvblVyaXMoZW52ZWxvcGUsIHRoaXMuX3N0YXRlQW5kUmVzb3VyY2VXYXRjaFVyaXMoY2xpZW50KSk7XG5cdH1cblxuXHRwcml2YXRlICpfc3RhdGVBbmRSZXNvdXJjZVdhdGNoVXJpcyhjbGllbnQ6IElDb25uZWN0ZWRDbGllbnQpOiBJdGVyYWJsZTxzdHJpbmc+IHtcblx0XHRmb3IgKGNvbnN0IHN1YiBvZiBjbGllbnQuc3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHN1Yi5raW5kID09PSBDaGFubmVsS2luZC5TdGF0ZSB8fCBzdWIua2luZCA9PT0gQ2hhbm5lbEtpbmQuUmVzb3VyY2VXYXRjaCkge1xuXHRcdFx0XHR5aWVsZCBzdWIudXJpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCByZWNvcmQgb2YgdGhpcy5fY2xpZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHJlY29yZC5zdGF0ZSA9PT0gJ2FjdGl2ZScpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjb25uZWN0aW9uIG9mIFsuLi5yZWNvcmQuY29ubmVjdGlvbnNdKSB7XG5cdFx0XHRcdFx0Y29ubmVjdGlvbi5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlY29yZC5kaXNjb25uZWN0VGltZW91dHMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9jbGllbnRzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBbLCBwZW5kaW5nXSBvZiB0aGlzLl9wZW5kaW5nUmV2ZXJzZVJlcXVlc3RzKSB7XG5cdFx0XHRwZW5kaW5nLnJlamVjdChuZXcgRXJyb3IoJ1Byb3RvY29sU2VydmVySGFuZGxlciBkaXNwb3NlZCcpKTtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ1JldmVyc2VSZXF1ZXN0cy5jbGVhcigpO1xuXHRcdHRoaXMuX3JlcGxheUJ1ZmZlci5sZW5ndGggPSAwO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZLGVBQWUsdUJBQXVCO0FBQzNELFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQkFBNkY7QUFDdEcsU0FBUyxrREFBa0Q7QUFDM0QsU0FBUyxzQkFBc0I7QUFFL0Is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
