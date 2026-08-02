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
import { DeferredPromise, TimeoutTimer } from "../../../base/common/async.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ILogService } from "../../log/common/log.js";
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from "../../files/common/files.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { AgentSession, AgentHostCodexAgentEnabledSettingId, AgentHostCodexMultiRootEnabledSettingId, AgentHostCopilotMultiRootEnabledSettingId, AgentHostClaudeMultiRootEnabledSettingId, AgentHostSystemProxyEnabledSettingId } from "../common/agentService.js";
import { AMBIENT_AGENT_HOST_AUTHORITY } from "../common/agentHostConnectionsService.js";
import { createRemoteWatchHandle } from "../common/agentHostFileSystemProvider.js";
import { AgentSubscriptionManager } from "../common/state/agentSubscription.js";
import { agentHostAuthority, fromAgentHostUri, toAgentHostUri } from "../common/agentHostUri.js";
import { AgentHostResourcePermissionError, IAgentHostResourceService, LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from "../common/agentHostResourceService.js";
import { ActionType } from "../common/state/sessionActions.js";
import { MessageAttachmentKind, ROOT_STATE_URI, isAhpRootChannel } from "../common/state/sessionState.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "../common/state/protocol/version/registry.js";
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, ProtocolError, ReconnectResultType } from "../common/state/sessionProtocol.js";
import { isClientTransport } from "../common/state/sessionTransport.js";
import { AhpErrorCodes } from "../common/state/protocol/errors.js";
import { ChatSourceKind, ContentEncoding } from "../common/state/protocol/commands.js";
import { encodeBase64 } from "../../../base/common/buffer.js";
import { LoadEstimator } from "../../../base/parts/ipc/common/ipc.net.js";
import { TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SETTING_ID } from "../../telemetry/common/telemetry.js";
import { getTelemetryLevel } from "../../telemetry/common/telemetryUtils.js";
import { AgentHostTelemetryLevelConfigKey, AgentHostCodexEnabledConfigKey, AgentHostCodexMultiRootEnabledConfigKey, AgentHostCopilotMultiRootEnabledConfigKey, AgentHostClaudeMultiRootEnabledConfigKey, AgentHostSessionSyncEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostAutoReplyEnabledConfigKey, AgentHostPreferLongContextEnabledConfigKey, AgentHostSystemProxyEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, AgentHostEditTelemetryEnabledConfigKey, getAgentHostTerminalAutoApproveRulesConfig, SESSION_SYNC_ENABLED_SETTING_ID, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, GLOBAL_AUTO_APPROVE_SETTING_ID, AUTO_REPLY_SETTING_ID, PREFER_LONG_CONTEXT_SETTING_ID, TERMINAL_AUTO_APPROVE_SETTING_ID, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, EDIT_TELEMETRY_ENABLED_SETTING_ID, telemetryLevelToAgentHostConfigValue } from "../common/agentHostSchema.js";
import { dirname } from "../../../base/common/resources.js";
import { observableValue } from "../../../base/common/observable.js";
import { isFileResourceRead } from "../common/resourceReadLogging.js";
import { ResourceSet } from "../../../base/common/map.js";
const AHP_CLIENT_CONNECTION_CLOSED = -32e3;
const RECONNECT_INITIAL_DELAY_MS = 1e3;
const RECONNECT_MAX_DELAY_MS = 3e4;
const PING_INTERVAL_MS = 5e3;
const LIVENESS_TIMEOUT_MS = 2e4;
function connectionTimeoutError(address, silenceMs) {
  return new ProtocolError(
    AHP_CLIENT_CONNECTION_CLOSED,
    `Connection appears dead: ${address}; no message received for ${silenceMs}ms.`
  );
}
function connectionClosedError(address) {
  return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection closed: ${address}`);
}
function connectionDisposedError(address) {
  return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Connection disposed: ${address}`);
}
function transportLostError(address) {
  return new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, `Transport lost (reconnecting): ${address}`);
}
var AgentHostClientState = /* @__PURE__ */ ((AgentHostClientState2) => {
  AgentHostClientState2["Connecting"] = "connecting";
  AgentHostClientState2["Incompatible"] = "incompatible";
  AgentHostClientState2["Connected"] = "connected";
  AgentHostClientState2["Reconnecting"] = "reconnecting";
  AgentHostClientState2["Closed"] = "closed";
  return AgentHostClientState2;
})(AgentHostClientState || {});
let RemoteAgentHostProtocolClient = class extends Disposable {
  constructor(identity, transportOrFactory, loadEstimator, clientId = void 0, _clientInfo, _logService, _resourceService, _configurationService) {
    super();
    this._clientInfo = _clientInfo;
    this._logService = _logService;
    this._resourceService = _resourceService;
    this._configurationService = _configurationService;
    /** Disposable holding the listeners attached to the current transport. */
    this._transportListeners = this._register(new MutableDisposable());
    this._serverSeq = 0;
    this._nextClientSeq = 1;
    /**
     * Latest `initialize` response from the host. Captured at the end of
     * {@link connect} and re-captured after a soft-reconnect that pulled
     * a fresh snapshot. `undefined` before the handshake completes.
     */
    this._initializeResult = observableValue("agentHostInitializeResult", void 0);
    this._onDidAction = this._register(new Emitter());
    this.onDidAction = this._onDidAction.event;
    this._onDidNotification = this._register(new Emitter());
    this.onDidNotification = this._onDidNotification.event;
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    /**
     * Fires for every `otlp/exportLogs` notification the host sends on a
     * channel this client has subscribed to. Each payload is an
     * OTLP/JSON `ExportLogsServiceRequest` value verbatim; consumers
     * decode it (see `iterateOtlpLogRecords`) and route the records to a
     * registered logger or sink.
     *
     * Channel URIs are kept opaque on the wire so the same event covers
     * every {@link TelemetryCapabilities.logs} URI the host advertises —
     * subscribers should filter by `channel` if they care.
     */
    this._onDidReceiveOtlpLogs = this._register(new Emitter());
    this.onDidReceiveOtlpLogs = this._onDidReceiveOtlpLogs.event;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeConnectionState = this._register(new Emitter());
    this.onDidChangeConnectionState = this._onDidChangeConnectionState.event;
    /**
     * Discriminated state union. Read via narrowing (`_state.kind === ...`);
     * reconnect-only fields like the gate/outbox/attempt counter are only
     * accessible while {@link _state.kind} is {@link AgentHostClientState.Reconnecting},
     * and protocol errors are only accessible while the state is
     * {@link AgentHostClientState.Incompatible} or {@link AgentHostClientState.Closed}.
     */
    this._state = { kind: "connecting" /* Connecting */, outbox: [] };
    /** Pending JSON-RPC requests keyed by request id. */
    this._pendingRequests = /* @__PURE__ */ new Map();
    this._nextRequestId = 1;
    /**
     * Timestamp of the most recent message of any kind received from the
     * server. Used only for diagnostic logging when the close timer fires.
     */
    this._lastReadTime = Date.now();
    /**
     * Liveness watchdog — see {@link _resetLivenessTimers}.
     *
     * {@link _pingTimer} fires after {@link PING_INTERVAL_MS} of inbound
     * silence and sends an application-level `ping` so we have something
     * to time out on. {@link _closeTimer} fires after another
     * {@link LIVENESS_TIMEOUT_MS} of continued silence and force-closes
     * the transport so the renderer's reconnect logic kicks in. Both are
     * reset on every received message, so busy connections generate no
     * ping traffic at all.
     *
     * Detects silently-dead transports (e.g. SSH/tunnel after laptop
     * sleep + network change) that don't produce a socket close event of
     * their own.
     */
    this._pingTimer = this._register(new TimeoutTimer());
    this._closeTimer = this._register(new TimeoutTimer());
    /**
     * URIs we have already granted implicit read access for on this connection.
     * Uses URI-aware comparison to dedupe repeat sends and is cleared with the connection.
     */
    this._grantedImplicitReadUris = new ResourceSet();
    this._implicitReadGrants = this._register(new DisposableStore());
    this._resourceIdentity = identity;
    this._address = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? AMBIENT_AGENT_HOST_AUTHORITY : identity;
    this._clientId = clientId ?? generateUuid();
    this._connectionAuthority = identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY ? AMBIENT_AGENT_HOST_AUTHORITY : agentHostAuthority(identity);
    this._loadEstimator = loadEstimator ?? LoadEstimator.getInstance();
    if (typeof transportOrFactory === "function") {
      this._transportFactory = transportOrFactory;
      this._installTransport(transportOrFactory());
    } else {
      this._transportFactory = void 0;
      this._installTransport(transportOrFactory);
    }
    this._subscriptionManager = this._register(new AgentSubscriptionManager(
      this._clientId,
      () => this.nextClientSeq(),
      (msg) => this._logService.warn(`[RemoteAgentHostProtocolClient] ${msg}`),
      (resource) => this.subscribe(resource),
      (resource) => this.unsubscribe(resource)
    ));
    this._register(this.onDidAction((envelope) => {
      this._subscriptionManager.receiveEnvelope(envelope);
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID) || e.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateTelemetryLevel();
      }
      if (e.affectsConfiguration(EDIT_TELEMETRY_ENABLED_SETTING_ID)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateEditTelemetryEnabled();
      }
      if (e.affectsConfiguration(SESSION_SYNC_ENABLED_SETTING_ID)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateSessionSyncEnabled();
      }
      if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateTerminalAutoApproveEnabled();
      }
      if (e.affectsConfiguration(GLOBAL_AUTO_APPROVE_SETTING_ID)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateGlobalAutoApproveEnabled();
      }
      if (e.affectsConfiguration(AUTO_REPLY_SETTING_ID)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateAutoReplyEnabled();
      }
      if (e.affectsConfiguration(PREFER_LONG_CONTEXT_SETTING_ID)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updatePreferLongContextEnabled();
      }
      if (e.affectsConfiguration(AgentHostSystemProxyEnabledSettingId)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateSystemProxyEnabled();
      }
      if (e.affectsConfiguration(AgentHostCopilotMultiRootEnabledSettingId)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateCopilotMultiRootEnabled();
      }
      if (e.affectsConfiguration(AgentHostClaudeMultiRootEnabledSettingId)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateClaudeMultiRootEnabled();
      }
      if (e.affectsConfiguration(AgentHostCodexMultiRootEnabledSettingId)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateCodexMultiRootEnabled();
      }
      if (e.affectsConfiguration(TERMINAL_AUTO_APPROVE_SETTING_ID) || e.affectsConfiguration(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateTerminalAutoApproveRules();
      }
      if (e.affectsConfiguration(AgentHostCodexAgentEnabledSettingId)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateCodexEnabled();
      }
      if (e.affectsConfiguration(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID)) {
        if (this._state.kind !== "connected" /* Connected */) {
          return;
        }
        this._updateDisableRepoInfoTelemetry();
      }
    }));
    if (!isClientTransport(this._transport)) {
      this._resetLivenessTimers();
    }
  }
  get clientId() {
    return this._clientId;
  }
  get address() {
    return this._address;
  }
  get defaultDirectory() {
    return this._defaultDirectory;
  }
  get connectionState() {
    return this._state.kind;
  }
  /**
   * The latest `initialize` response from the host, or `undefined` if
   * the handshake has not completed yet. Exposed observably so callers can
   * react as advertised capabilities (telemetry, `completionTriggerCharacters`,
   * `terminalCommandPrefix`, ...) arrive.
   */
  get initializeResult() {
    return this._initializeResult;
  }
  /**
   * Install a transport and wire listeners. Used both for the initial
   * transport and for replacements created by the factory during a
   * transport-level reconnect.
   */
  _installTransport(transport) {
    const listeners = new DisposableStore();
    listeners.add(transport);
    listeners.add(transport.onMessage((msg) => this._handleMessage(msg)));
    listeners.add(transport.onClose(() => this._handleTransportClose()));
    this._transport = transport;
    this._transportListeners.value = listeners;
  }
  /**
   * Transition to a new {@link ClientState}. Fires {@link onDidChangeConnectionState}
   * only when the variant kind actually changes; in-place mutation of
   * reconnect-state fields (e.g. swapping the gate on a failed retry) does
   * NOT count as a transition and produces no event.
   */
  _transitionTo(next) {
    if (this._state.kind === next.kind) {
      return;
    }
    this._state = next;
    this._onDidChangeConnectionState.fire(next.kind);
  }
  _newReconnectGate() {
    const deferred = new DeferredPromise();
    deferred.p.then(void 0, () => {
    });
    return deferred;
  }
  _newReconnectState() {
    return { gate: this._newReconnectGate(), outbox: [], attempt: 0, timeoutHandle: void 0 };
  }
  dispose() {
    this._handleClose(connectionDisposedError(this._address));
    super.dispose();
  }
  /**
   * Connect to the remote agent host and perform the protocol handshake.
   */
  async connect() {
    try {
      if (isClientTransport(this._transport)) {
        await this._raceClose(this._transport.connect());
      }
      const result = await this._dispatchRequest("initialize", {
        channel: ROOT_STATE_URI,
        // Advertise every version this client can negotiate, most-preferred first, so an
        // older host (a cloud sandbox running a 0.5.x `copilotd`) can negotiate down
        // instead of rejecting the connection. A current host still picks the newest.
        protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
        clientId: this._clientId,
        clientInfo: this._clientInfo,
        initialSubscriptions: [ROOT_STATE_URI]
      }, { bypassInitializeQueue: true });
      this._applyInitializeResult(result);
      for (const snapshot of result.snapshots ?? []) {
        if (isAhpRootChannel(snapshot.resource)) {
          this._subscriptionManager.handleRootSnapshot(snapshot.state, snapshot.fromSeq);
        }
      }
      if (isClientTransport(this._transport) && this._state.kind === "connecting" /* Connecting */) {
        for (const message of this._state.outbox) {
          this._transport.send(message);
        }
        this._state.outbox.length = 0;
      }
      this._transitionTo({ kind: "connected" /* Connected */ });
      this._resetLivenessTimers();
    } catch (error) {
      const protocolError = error instanceof ProtocolError ? error : new ProtocolError(AHP_CLIENT_CONNECTION_CLOSED, error instanceof Error ? error.message : String(error));
      if (protocolError.code === AhpErrorCodes.UnsupportedProtocolVersion) {
        this._cancelLivenessTimers();
        if (this._state.kind === "connecting" /* Connecting */) {
          this._state.outbox.length = 0;
        }
        this._rejectPendingRequests(protocolError);
        this._transitionTo({ kind: "incompatible" /* Incompatible */, error: protocolError });
        throw error;
      }
      this._handleClose(protocolError);
      throw error;
    }
  }
  /**
   * Externally signal that the transport has closed. Used by services
   * managing a passive transport (SSH / dev-tunnels) when they observe
   * a connection-loss IPC event independent of the transport's own
   * onClose — without this, a single dropped IPC delivery on the
   * transport's close channel leaves the client stranded in
   * `Connected` until its watchdog fires (which can take hours when
   * the renderer is backgrounded and `setTimeout` is throttled).
   *
   * Idempotent — no-op if already closed or mid-reconnect.
   */
  notifyTransportClosed() {
    this._handleTransportClose();
  }
  /**
   * Called from the transport's `onClose` event. When a {@link _transportFactory}
   * is configured we attempt to soft-reconnect rather than fire `onDidClose` —
   * the protocol-level `reconnect` request lets the server replay missed
   * actions and preserves the `clientId` so pending tool calls etc. are not
   * cancelled by the host-side disconnect timeout. Without a factory
   * (passive-transport SSH/relay path) we fall back to "close means closed"
   * and let the service decide whether to spin up a fresh client.
   */
  _handleTransportClose() {
    switch (this._state.kind) {
      case "closed" /* Closed */:
        return;
      case "connecting" /* Connecting */:
        this._handleClose(connectionClosedError(this._address));
        return;
      case "incompatible" /* Incompatible */:
        this._handleClose(connectionClosedError(this._address));
        return;
      case "connected" /* Connected */: {
        if (!this._transportFactory) {
          this._handleClose(connectionClosedError(this._address));
          return;
        }
        this._logService.info(`[RemoteAgentHostProtocol] Transport lost for ${this._address}; scheduling reconnect.`);
        this._transitionTo({ kind: "reconnecting" /* Reconnecting */, reconnect: this._newReconnectState() });
        this._cancelLivenessTimers();
        this._rejectPendingRequests(transportLostError(this._address));
        this._scheduleReconnect();
        return;
      }
      case "reconnecting" /* Reconnecting */:
        this._logService.info(`[RemoteAgentHostProtocol] Transport lost for ${this._address} mid-reconnect; aborting the current attempt.`);
        this._cancelLivenessTimers();
        this._rejectPendingRequests(transportLostError(this._address));
        return;
    }
  }
  _scheduleReconnect() {
    if (this._state.kind !== "reconnecting" /* Reconnecting */ || !this._transportFactory) {
      return;
    }
    const reconnect = this._state.reconnect;
    if (reconnect.timeoutHandle !== void 0) {
      return;
    }
    const attempt = reconnect.attempt + 1;
    const delay = Math.min(RECONNECT_INITIAL_DELAY_MS * Math.pow(2, attempt - 1), RECONNECT_MAX_DELAY_MS);
    this._logService.info(`[RemoteAgentHostProtocol] Reconnecting to ${this._address} in ${delay}ms (attempt ${attempt}).`);
    reconnect.timeoutHandle = setTimeout(() => {
      if (this._state.kind === "reconnecting" /* Reconnecting */) {
        this._state.reconnect.timeoutHandle = void 0;
      }
      void this._attemptReconnect();
    }, delay);
  }
  async _attemptReconnect() {
    if (this._state.kind !== "reconnecting" /* Reconnecting */ || !this._transportFactory) {
      return;
    }
    const reconnect = this._state.reconnect;
    reconnect.attempt++;
    let transport;
    try {
      transport = this._transportFactory();
      this._installTransport(transport);
      if (isClientTransport(transport)) {
        await transport.connect();
      }
      if (this._state.kind !== "reconnecting" /* Reconnecting */) {
        return;
      }
      const subscriptions = this._subscriptionManager.currentSubscriptionUris().map((u) => u.toString());
      if (!subscriptions.includes(ROOT_STATE_URI)) {
        subscriptions.unshift(ROOT_STATE_URI);
      }
      const lastSeenServerSeq = this._serverSeq;
      const result = await this._reconnectOrInitialize(lastSeenServerSeq, subscriptions);
      if (this._state.kind !== "reconnecting" /* Reconnecting */) {
        return;
      }
      this._applyReconnectResult(result);
      const { gate } = reconnect;
      this._drainAfterReconnect(reconnect.outbox);
      this._lastReadTime = Date.now();
      this._resetLivenessTimers();
      this._transitionTo({ kind: "connected" /* Connected */ });
      gate.complete();
      this._logService.info(`[RemoteAgentHostProtocol] Reconnected to ${this._address}.`);
    } catch (err) {
      this._logService.warn(`[RemoteAgentHostProtocol] Reconnect attempt failed for ${this._address}: ${err instanceof Error ? err.message : String(err)}`);
      transport?.dispose();
      if (this._state.kind !== "reconnecting" /* Reconnecting */) {
        return;
      }
      const oldGate = this._state.reconnect.gate;
      this._state.reconnect.gate = this._newReconnectGate();
      oldGate.error(err);
      this._scheduleReconnect();
    }
  }
  async _reconnectOrInitialize(lastSeenServerSeq, subscriptions) {
    try {
      return await this._dispatchRequest("reconnect", {
        clientId: this._clientId,
        lastSeenServerSeq,
        subscriptions
      }, { bypassReconnectGate: true });
    } catch (error) {
      if (!(error instanceof ProtocolError) || error.code !== AhpErrorCodes.NotFound) {
        throw error;
      }
    }
    this._logService.info(`[RemoteAgentHostProtocol] Server forgot client ${this._clientId}; initializing a fresh connection.`);
    const initializeResult = await this._dispatchRequest("initialize", {
      channel: ROOT_STATE_URI,
      protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
      clientId: this._clientId,
      clientInfo: this._clientInfo,
      initialSubscriptions: subscriptions
    }, { bypassReconnectGate: true });
    this._applyInitializeResult(initializeResult);
    return { type: ReconnectResultType.Snapshot, snapshots: initializeResult.snapshots ?? [] };
  }
  _applyInitializeResult(result) {
    this._initializeResult.set(result, void 0);
    this._serverSeq = result.serverSeq;
    if (result.defaultDirectory) {
      const directory = result.defaultDirectory;
      this._defaultDirectory = typeof directory === "string" ? URI.parse(directory).path : URI.revive(directory).path;
    }
    this._updateTelemetryLevel();
    this._updateEditTelemetryEnabled();
    this._updateSessionSyncEnabled();
    this._updateTerminalAutoApproveEnabled();
    this._updateGlobalAutoApproveEnabled();
    this._updateAutoReplyEnabled();
    this._updatePreferLongContextEnabled();
    this._updateSystemProxyEnabled();
    this._updateCopilotMultiRootEnabled();
    this._updateClaudeMultiRootEnabled();
    this._updateCodexMultiRootEnabled();
    this._updateTerminalAutoApproveRules();
    this._updateCodexEnabled();
    this._updateDisableRepoInfoTelemetry();
  }
  /**
   * Apply a `reconnect` RPC result to the subscription manager. On `replay`
   * we feed each missed envelope through the normal action path; on
   * `snapshot` we reseat each named subscription with the fresh state and
   * advance the server seq cursor accordingly.
   */
  _applyReconnectResult(result) {
    if (result.type === ReconnectResultType.Replay) {
      let maxSeq = this._serverSeq;
      for (const envelope of result.actions) {
        if (envelope.origin?.clientId === this._clientId && envelope.origin.clientSeq !== void 0 && !envelope.rejectionReason) {
          this._subscriptionManager.dropPendingSessionAction(envelope.channel, envelope.origin.clientSeq);
        }
        if (envelope.serverSeq > maxSeq) {
          maxSeq = envelope.serverSeq;
        }
        this._onDidAction.fire(envelope);
      }
      this._serverSeq = maxSeq;
      if (result.missing.length > 0) {
        this._logService.info(`[RemoteAgentHostProtocol] Server cannot resume ${result.missing.length} subscription(s) after reconnect.`);
        this._subscriptionManager.markSubscriptionsMissing(result.missing.map((u) => URI.parse(u)));
      }
    } else {
      let maxSeq = this._serverSeq;
      for (const snapshot of result.snapshots) {
        this._subscriptionManager.applyReconnectSnapshot(snapshot.resource, snapshot.state, snapshot.fromSeq);
        if (snapshot.fromSeq > maxSeq) {
          maxSeq = snapshot.fromSeq;
        }
      }
      this._serverSeq = maxSeq;
    }
  }
  /**
   * Drain queued outgoing wire traffic after a successful soft reconnect:
   *
   * 1. Resend pending optimistic session actions that the server did NOT
   *    echo back in the replay buffer (i.e. anything still on
   *    {@link AgentSubscriptionManager.getPendingSessionActions}).
   * 2. Flush every message that {@link _sendNotification} queued onto the
   *    outbox while the gate was engaged.
   *
   * Replays are deduped against the outbox by `clientSeq` so a session
   * action that was both optimistic-tracked AND queued during the
   * reconnect window only goes out once.
   */
  _drainAfterReconnect(outbox) {
    const queuedSeqs = /* @__PURE__ */ new Set();
    for (const msg of outbox) {
      if (hasKey(msg, { method: true }) && msg.method === "dispatchAction") {
        queuedSeqs.add(msg.params.clientSeq);
      }
    }
    const replays = [];
    for (const entry of this._subscriptionManager.getPendingSessionActions()) {
      if (queuedSeqs.has(entry.clientSeq)) {
        continue;
      }
      this._grantImplicitReadsForOutgoingAction(entry.action);
      replays.push({
        jsonrpc: "2.0",
        method: "dispatchAction",
        params: { channel: entry.channel, clientSeq: entry.clientSeq, action: entry.action }
      });
    }
    if (replays.length > 0) {
      this._logService.info(`[RemoteAgentHostProtocol] Replaying ${replays.length} pending action(s) after reconnect to ${this._address}.`);
    }
    for (const msg of replays) {
      this._transport.send(msg);
    }
    for (const msg of outbox) {
      this._transport.send(msg);
    }
  }
  // ---- IAgentConnection subscription API ----------------------------------
  get rootState() {
    return this._subscriptionManager.rootState;
  }
  getSubscription(kind, resource, owner) {
    return this._subscriptionManager.getSubscription(kind, resource, owner);
  }
  getSubscriptionUnmanaged(_kind, resource) {
    return this._subscriptionManager.getSubscriptionUnmanaged(resource);
  }
  getInflightSessionCreate(resource) {
    return this._subscriptionManager.getInflightSessionCreate(resource);
  }
  trackSessionCreate(resource, promise) {
    this._subscriptionManager.trackSessionCreate(resource, promise);
  }
  getActiveSubscriptions() {
    return this._subscriptionManager.getActiveSubscriptions();
  }
  dispatch(channel, action) {
    const seq = this._subscriptionManager.dispatchOptimistic(channel, action);
    this.dispatchAction(channel, action, this._clientId, seq);
  }
  /**
   * Subscribe to state at a URI. Returns the current state snapshot.
   *
   * For stateless channels (e.g. `ahp-otlp:` telemetry channels) use
   * {@link subscribeStateless} — calling this method on a stateless
   * channel rejects because the server omits `snapshot` on the
   * response.
   */
  async subscribe(resource) {
    const result = await this._sendRequest("subscribe", { channel: resource.toString() });
    if (!result.snapshot) {
      throw new Error(`subscribe to ${resource.toString()} returned no snapshot`);
    }
    return result.snapshot;
  }
  /**
   * Subscribe to a stateless channel — one for which the server does
   * not maintain replayable state and therefore omits `snapshot` from
   * the `subscribe` response. Used today for the host's OTLP telemetry
   * channels (`ahp-otlp:`).
   *
   * Returns once the subscription is confirmed by the server.
   * Subsequent notifications on the channel arrive via the relevant
   * dispatch event (e.g. {@link onDidReceiveOtlpLogs} for log records).
   */
  async subscribeStateless(resource) {
    await this._sendRequest("subscribe", { channel: resource.toString() });
  }
  /**
   * Unsubscribe from state at a URI.
   */
  unsubscribe(resource) {
    this._sendNotification("unsubscribe", { channel: resource.toString() });
  }
  /**
   * Dispatch a client action to the server. Returns the clientSeq used.
   */
  dispatchAction(channel, action, _clientId, clientSeq) {
    this._grantImplicitReadsForOutgoingAction(action);
    this._sendNotification("dispatchAction", { channel, clientSeq, action });
  }
  /**
   * Create a new session on the remote agent host.
   */
  createSession(config) {
    const provider = config?.provider;
    if (!provider) {
      throw new Error("Cannot create remote agent host session without a provider.");
    }
    const session = config?.session ?? AgentSession.uri(provider, generateUuid());
    if (config?.activeClient?.customizations) {
      this._grantImplicitReadsForCustomizations(config.activeClient.customizations);
    }
    const promise = this._sendRequest("createSession", {
      channel: session.toString(),
      provider,
      workingDirectories: config?.workingDirectories?.map((d) => fromAgentHostUri(d).toString()),
      fork: config?.fork ? { session: fromAgentHostUri(config.fork.session).toString(), turnId: config.fork.turnId } : void 0,
      config: config?.config,
      activeClient: config?.activeClient,
      progressToken: config?.progressToken
    }).then(() => session);
    this._subscriptionManager.trackSessionCreate(session, promise);
    return promise;
  }
  async resolveSessionConfig(params) {
    return this._sendRequest("resolveSessionConfig", {
      channel: ROOT_STATE_URI,
      provider: params.provider,
      workingDirectory: params.workingDirectory ? fromAgentHostUri(params.workingDirectory).toString() : void 0,
      config: params.config
    });
  }
  async sessionConfigCompletions(params) {
    return this._sendRequest("sessionConfigCompletions", {
      channel: ROOT_STATE_URI,
      provider: params.provider,
      workingDirectory: params.workingDirectory ? fromAgentHostUri(params.workingDirectory).toString() : void 0,
      config: params.config,
      property: params.property,
      query: params.query
    });
  }
  async completions(params) {
    return this._sendRequest("completions", params);
  }
  /**
   * Send an application-level ping and wait for the server's response.
   * Used by {@link _watchdogTick} to keep idle connections under
   * watchdog supervision; safe to call from external code as well.
   *
   * The returned promise rejects with a {@link ProtocolError} if the
   * connection closes before a response arrives.
   */
  async ping() {
    await this._sendRequest("ping", { channel: ROOT_STATE_URI });
  }
  /**
   * Returns the trigger characters captured from the `initialize` handshake.
   * Empty when the remote host did not announce any.
   */
  async getCompletionTriggerCharacters() {
    while (this._state.kind === "connecting" /* Connecting */) {
      await Event.toPromise(this.onDidChangeConnectionState);
    }
    switch (this._state.kind) {
      case "incompatible" /* Incompatible */:
      case "closed" /* Closed */:
        throw this._state.error;
      case "connected" /* Connected */:
      case "reconnecting" /* Reconnecting */:
        return this._initializeResult.get()?.completionTriggerCharacters ?? [];
    }
  }
  /**
   * Authenticate with the remote agent host using a specific scheme.
   */
  async authenticate(params) {
    await this._sendRequest("authenticate", { channel: ROOT_STATE_URI, ...params, scopes: params.scopes ? [...params.scopes] : void 0 });
    return { authenticated: true };
  }
  /**
   * Gracefully shut down all sessions on the remote host.
   */
  async shutdown() {
    await this._sendExtensionRequest("shutdown");
  }
  /**
   * List the endpoints the remote agent host suggests probing for connectivity.
   */
  async getNetworkDiagnosticsInfo() {
    return this._sendExtensionRequest("getNetworkDiagnosticsInfo");
  }
  async getManagedSettingsDiagnostics() {
    return this._sendExtensionRequest("getManagedSettingsDiagnostics");
  }
  /**
   * Probe connectivity from the remote agent host to a single `url`.
   */
  async diagnosticsFetch(url) {
    return this._sendExtensionRequest("diagnosticsFetch", { url });
  }
  /**
   * Dispose a session on the remote agent host.
   */
  async disposeSession(session) {
    await this._sendRequest("disposeSession", { channel: session.toString() });
  }
  async createChat(session, chat, options) {
    await this._sendRequest("createChat", {
      channel: session.toString(),
      chat: chat.toString(),
      ...options?.fork ? {
        source: { kind: ChatSourceKind.Fork, chat: options.fork.source.toString(), turnId: options.fork.turnId }
      } : {},
      ...options?.sideChat ? {
        source: {
          kind: ChatSourceKind.SideChat,
          chat: options.sideChat.source.toString(),
          turnId: options.sideChat.turnId,
          ...options.sideChat.selection ? { selection: options.sideChat.selection } : {}
        }
      } : {}
    });
  }
  async disposeChat(chat) {
    await this._sendRequest("disposeChat", { channel: chat.toString() });
  }
  /**
   * Create a new terminal on the remote agent host.
   */
  async createTerminal(params) {
    await this._sendRequest("createTerminal", params);
  }
  /**
   * Dispose a terminal on the remote agent host.
   */
  async disposeTerminal(terminal) {
    await this._sendRequest("disposeTerminal", { channel: terminal.toString() });
  }
  async invokeChangesetOperation(params) {
    return await this._sendRequest("invokeChangesetOperation", params);
  }
  /**
   * Send a request on an `mcp://` AHP side channel. The agent-host
   * routes by `params.channel` so we inject it automatically.
   */
  async handleMcpRequest(channel, method, params) {
    return await this._dispatchRequest(method, { ...params ?? {}, channel });
  }
  /**
   * List all sessions from the remote agent host.
   */
  async listSessions() {
    const result = await this._sendRequest("listSessions", { channel: ROOT_STATE_URI });
    return result.items.map((s) => ({
      session: URI.parse(s.resource),
      startTime: Date.parse(s.createdAt),
      modifiedTime: Date.parse(s.modifiedAt),
      ...s.project ? {
        project: {
          uri: this._toLocalProjectUri(URI.parse(s.project.uri)),
          displayName: s.project.displayName
        }
      } : {},
      summary: s.title,
      status: s.status,
      activity: s.activity,
      workingDirectory: typeof s.workingDirectories?.[0] === "string" ? toAgentHostUri(URI.parse(s.workingDirectories?.[0]), this._connectionAuthority) : void 0,
      workingDirectories: s.workingDirectories?.map((d) => toAgentHostUri(URI.parse(d), this._connectionAuthority)),
      changes: s.changes,
      // Carry `_meta` so a session first materialized from a listing (window
      // reload, list refresh) resolves its kind correctly.
      ...s._meta !== void 0 ? { _meta: s._meta } : {}
    }));
  }
  _toLocalProjectUri(uri) {
    return uri.scheme === Schemas.file ? toAgentHostUri(uri, this._connectionAuthority) : uri;
  }
  /**
   * Inspect an outgoing client-dispatched action and grant implicit reads for
   * resources that the host will need to read after receiving the action.
   */
  _grantImplicitReadsForOutgoingAction(action) {
    switch (action.type) {
      case ActionType.SessionActiveClientSet:
        if (action.activeClient.customizations) {
          this._grantImplicitReadsForCustomizations(action.activeClient.customizations);
        }
        break;
      case ActionType.ChatTurnStarted:
      case ActionType.ChatPendingMessageSet:
        this._grantImplicitReadsForMessage(action.message);
        break;
    }
  }
  _grantImplicitReadsForMessage(message) {
    for (const attachment of message.attachments ?? []) {
      if (attachment.type !== MessageAttachmentKind.Resource) {
        continue;
      }
      try {
        this._grantImplicitRead(URI.parse(attachment.uri));
      } catch {
        continue;
      }
    }
  }
  /**
   * Register implicit read grants for each customization URI that we are
   * about to send to the host. The host needs to read these to materialize
   * the customization, but should not need to write them. Grants are
   * deduped per connection and revoked when the connection closes.
   */
  _grantImplicitReadsForCustomizations(refs) {
    for (const ref of refs) {
      let uri;
      try {
        uri = URI.parse(ref.uri);
      } catch {
        continue;
      }
      this._grantImplicitRead(dirname(uri));
    }
  }
  _grantImplicitRead(uri) {
    if (this._grantedImplicitReadUris.has(uri)) {
      return;
    }
    this._grantedImplicitReadUris.add(uri);
    this._implicitReadGrants.add(this._resourceService.grantImplicitRead(this._resourceIdentity, uri));
  }
  /**
   * List the contents of a directory on the remote host's filesystem.
   */
  async resourceList(uri) {
    return await this._sendRequest("resourceList", { channel: ROOT_STATE_URI, uri: uri.toString() });
  }
  /**
   * Read the content of a resource on the remote host.
   */
  async resourceRead(uri) {
    return this._sendRequest("resourceRead", { channel: ROOT_STATE_URI, uri: uri.toString() });
  }
  async resourceWrite(params) {
    return this._sendRequest("resourceWrite", params);
  }
  async resourceCopy(params) {
    return this._sendRequest("resourceCopy", params);
  }
  async resourceDelete(params) {
    return this._sendRequest("resourceDelete", params);
  }
  async resourceMove(params) {
    return this._sendRequest("resourceMove", params);
  }
  async resourceResolve(params) {
    return this._sendRequest("resourceResolve", params);
  }
  async resourceMkdir(params) {
    return this._sendRequest("resourceMkdir", params);
  }
  async createResourceWatch(params) {
    return this._sendRequest("createResourceWatch", params);
  }
  /**
   * Convenience wrapper used by {@link AHPFileSystemProvider.watch}:
   * runs `createResourceWatch` + `subscribe` and returns a handle that
   * surfaces `resourceWatch/changed` envelopes as
   * {@link IFileChange}[] events. Disposing the handle unsubscribes
   * the watch channel.
   */
  watchResource(params) {
    return createRemoteWatchHandle({
      createResourceWatch: (p) => this.createResourceWatch(p),
      subscribe: (uri) => this.subscribe(uri),
      unsubscribe: (uri) => this.unsubscribe(uri),
      onDidAction: this.onDidAction
    }, params);
  }
  /**
   * Trigger the CLI-managed upgrade flow for this agent host using the
   * method name advertised by the server (typically
   * {@link VSCODE_UPGRADE_METHOD}). Callable before {@link connect} has
   * completed — typically used when the host has just rejected our
   * `initialize` with an `UnsupportedProtocolVersion` error. The
   * transport stays open after the rejection, so the extension request
   * rides over it without a special out-of-band path.
   *
   * The result mirrors the CLI's HTTP response: ok flag, whether the
   * upgrade is needed / started, running/latest commits.
   */
  triggerVscodeUpgrade(method) {
    return this._dispatchRequest(method, {}, { allowIncompatibleUpgrade: true });
  }
  _handleMessage(msg) {
    if (this._state.kind === "closed" /* Closed */) {
      return;
    }
    this._lastReadTime = Date.now();
    this._resetLivenessTimers();
    if (isJsonRpcRequest(msg)) {
      this._handleReverseRequest(msg.id, msg.method, msg.params);
    } else if (isJsonRpcResponse(msg)) {
      const pending = this._pendingRequests.get(msg.id);
      if (pending) {
        this._pendingRequests.delete(msg.id);
        if (hasKey(msg, { error: true })) {
          if (this._shouldLogFailedRequest(pending, msg.error)) {
            this._logService.warn(`[RemoteAgentHostProtocol] Request ${msg.id} failed:`, msg.error);
          }
          pending.deferred.error(this._toProtocolError(msg.error));
        } else {
          pending.deferred.complete(msg.result);
        }
      } else {
        this._logService.warn(`[RemoteAgentHostProtocol] Received response for unknown request id ${msg.id}`);
      }
    } else if (isJsonRpcNotification(msg)) {
      switch (msg.method) {
        case "action": {
          const envelope = msg.params;
          this._serverSeq = Math.max(this._serverSeq, envelope.serverSeq);
          this._onDidAction.fire(envelope);
          break;
        }
        case "root/sessionAdded":
        case "root/sessionRemoved":
        case "root/sessionSummaryChanged":
        case "root/progress":
        case "auth/required": {
          this._logService.trace(`[RemoteAgentHostProtocol] Notification: ${msg.method}`);
          this._onDidNotification.fire({ type: msg.method, ...msg.params });
          break;
        }
        case "otlp/exportLogs":
          this._onDidReceiveOtlpLogs.fire(msg.params);
          break;
        case "otlp/exportTraces":
        case "otlp/exportMetrics":
          break;
        default: {
          const rawChannel = msg.params && typeof msg.params === "object" ? msg.params.channel : void 0;
          if (typeof rawChannel === "string" && rawChannel.toLowerCase().startsWith("mcp:/")) {
            const { channel: _channel, ...rest } = msg.params;
            this._onMcpNotification.fire({ channel: rawChannel, method: msg.method, params: rest });
            break;
          }
          this._logService.trace(`[RemoteAgentHostProtocol] Unhandled method: ${msg.method}`);
          break;
        }
      }
    } else {
      this._logService.warn(`[RemoteAgentHostProtocol] Unrecognized message:`, JSON.stringify(msg));
    }
  }
  _handleClose(error) {
    if (this._state.kind === "closed" /* Closed */) {
      return;
    }
    this._cancelLivenessTimers();
    if (this._state.kind === "reconnecting" /* Reconnecting */) {
      const reconnect = this._state.reconnect;
      if (reconnect.timeoutHandle !== void 0) {
        clearTimeout(reconnect.timeoutHandle);
      }
      if (!reconnect.gate.isSettled) {
        reconnect.gate.error(error);
      }
    }
    if (this._state.kind === "connecting" /* Connecting */) {
      this._state.outbox.length = 0;
    }
    this._rejectPendingRequests(error);
    this._grantedImplicitReadUris.clear();
    this._implicitReadGrants.clear();
    this._resourceService.connectionClosed(this._resourceIdentity);
    this._transitionTo({ kind: "closed" /* Closed */, error });
    this._onDidClose.fire();
  }
  async _raceClose(promise) {
    if (this._state.kind === "closed" /* Closed */) {
      return Promise.reject(this._state.error);
    }
    let closeListener = Disposable.None;
    const closePromise = new Promise((_resolve, reject) => {
      closeListener = this.onDidClose(() => reject(this._state.kind === "closed" /* Closed */ ? this._state.error : connectionClosedError(this._address)));
    });
    try {
      return await Promise.race([promise, closePromise]);
    } finally {
      closeListener.dispose();
    }
  }
  /**
   * Handles reverse RPC requests from the server (e.g. resourceList,
   * resourceRead). Thin wire adapter — dispatches each frame to
   * {@link IAgentHostResourceService} (which owns gating, virtual reads,
   * and the user-prompt flow) and translates results / errors back into
   * JSON-RPC frames.
   */
  _handleReverseRequest(id, method, params) {
    const transport = this._transport;
    const sendResult = (result) => {
      transport.send({ jsonrpc: "2.0", id, result });
    };
    const sendError = (err) => {
      if (err instanceof AgentHostResourcePermissionError) {
        transport.send({
          jsonrpc: "2.0",
          id,
          error: {
            code: AhpErrorCodes.PermissionDenied,
            message: err.message,
            data: err.request ? { request: err.request } : void 0
          }
        });
        return;
      }
      const fsCode = toFileSystemProviderErrorCode(err instanceof Error ? err : void 0);
      let code = -32e3;
      switch (fsCode) {
        case FileSystemProviderErrorCode.FileNotFound:
          code = AhpErrorCodes.NotFound;
          break;
        case FileSystemProviderErrorCode.NoPermissions:
          code = AhpErrorCodes.PermissionDenied;
          break;
        case FileSystemProviderErrorCode.FileExists:
          code = AhpErrorCodes.AlreadyExists;
          break;
      }
      transport.send({ jsonrpc: "2.0", id, error: { code, message: err instanceof Error ? err.message : String(err) } });
    };
    const p = params ?? {};
    const identity = this._resourceIdentity;
    void (async () => {
      try {
        switch (method) {
          case "resourceList": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            const result = await this._resourceService.list(identity, URI.parse(p.uri));
            sendResult({ entries: result.entries });
            return;
          }
          case "resourceRead": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            const result = await this._resourceService.read(identity, URI.parse(p.uri));
            sendResult({ data: encodeBase64(result.bytes), encoding: ContentEncoding.Base64 });
            return;
          }
          case "resourceWrite": {
            if (!p.uri || p.data === void 0) {
              throw new Error("Missing uri or data");
            }
            await this._resourceService.write(identity, p);
            sendResult({});
            return;
          }
          case "resourceDelete": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            await this._resourceService.del(identity, p);
            sendResult({});
            return;
          }
          case "resourceMove": {
            if (!p.source || !p.destination) {
              throw new Error("Missing source or destination");
            }
            await this._resourceService.move(identity, p);
            sendResult({});
            return;
          }
          case "resourceCopy": {
            if (!p.source || !p.destination) {
              throw new Error("Missing source or destination");
            }
            await this._resourceService.copy(identity, p);
            sendResult({});
            return;
          }
          case "resourceResolve": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            const result = await this._resourceService.resolve(identity, p);
            sendResult(result);
            return;
          }
          case "resourceMkdir": {
            if (!p.uri) {
              throw new Error("Missing uri");
            }
            await this._resourceService.mkdir(identity, p);
            sendResult({});
            return;
          }
          case "resourceRequest": {
            try {
              await this._resourceService.request(identity, p);
              sendResult({});
            } catch (err) {
              if (err instanceof CancellationError) {
                throw new AgentHostResourcePermissionError(void 0);
              }
              throw err;
            }
            return;
          }
          default:
            this._logService.warn(`[RemoteAgentHostProtocol] Unhandled reverse request: ${method}`);
            throw new Error(`Unknown method: ${method}`);
        }
      } catch (err) {
        sendError(err);
      }
    })();
  }
  /** Send a typed JSON-RPC notification for a protocol-defined method. */
  _sendNotification(method, params) {
    if (this._state.kind === "closed" /* Closed */ || this._state.kind === "incompatible" /* Incompatible */) {
      return;
    }
    const message = { jsonrpc: "2.0", method, params };
    if (isClientTransport(this._transport) && this._state.kind === "connecting" /* Connecting */) {
      this._state.outbox.push(message);
      return;
    }
    if (this._state.kind === "reconnecting" /* Reconnecting */) {
      this._state.reconnect.outbox.push(message);
      return;
    }
    this._transport.send(message);
  }
  /** Send a typed JSON-RPC request for a protocol-defined method. */
  _sendRequest(method, params) {
    return this._dispatchRequest(method, params);
  }
  /** Send a JSON-RPC request for a VS Code extension method (not in the protocol spec). */
  _sendExtensionRequest(method, params) {
    return this._dispatchRequest(method, params);
  }
  _updateTelemetryLevel() {
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(getTelemetryLevel(this._configurationService)) }
    }, this._clientId, 0);
  }
  _updateEditTelemetryEnabled() {
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostEditTelemetryEnabledConfigKey]: this._configurationService.getValue(EDIT_TELEMETRY_ENABLED_SETTING_ID) !== false }
    }, this._clientId, 0);
  }
  _updateDisableRepoInfoTelemetry() {
    const disabled = this._configurationService.getValue(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID) === true;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostDisableRepoInfoTelemetryConfigKey]: disabled }
    }, this._clientId, 0);
  }
  _updateSessionSyncEnabled() {
    const enabled = !!this._configurationService.getValue(SESSION_SYNC_ENABLED_SETTING_ID);
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostSessionSyncEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updateTerminalAutoApproveEnabled() {
    const enabled = this._configurationService.getValue(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID) !== false;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostTerminalAutoApproveEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updateGlobalAutoApproveEnabled() {
    const enabled = this._configurationService.getValue(GLOBAL_AUTO_APPROVE_SETTING_ID) === true;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostGlobalAutoApproveEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updateAutoReplyEnabled() {
    const enabled = this._configurationService.getValue(AUTO_REPLY_SETTING_ID) === true;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostAutoReplyEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updatePreferLongContextEnabled() {
    const enabled = this._configurationService.getValue(PREFER_LONG_CONTEXT_SETTING_ID) === true;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostPreferLongContextEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updateSystemProxyEnabled() {
    const enabled = this._configurationService.getValue(AgentHostSystemProxyEnabledSettingId) !== false;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostSystemProxyEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updateCopilotMultiRootEnabled() {
    const enabled = this._configurationService.getValue(AgentHostCopilotMultiRootEnabledSettingId) === true;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostCopilotMultiRootEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updateClaudeMultiRootEnabled() {
    const enabled = this._configurationService.getValue(AgentHostClaudeMultiRootEnabledSettingId) === true;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostClaudeMultiRootEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updateCodexMultiRootEnabled() {
    const enabled = this._configurationService.getValue(AgentHostCodexMultiRootEnabledSettingId) === true;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostCodexMultiRootEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updateCodexEnabled() {
    const enabled = this._configurationService.getValue(AgentHostCodexAgentEnabledSettingId) === true;
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostCodexEnabledConfigKey]: enabled }
    }, this._clientId, 0);
  }
  _updateTerminalAutoApproveRules() {
    this.dispatchAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { [AgentHostTerminalAutoApproveRulesConfigKey]: getAgentHostTerminalAutoApproveRulesConfig(this._configurationService) }
    }, this._clientId, 0);
  }
  /**
   * Common path for outgoing JSON-RPC requests: queue pre-initialize traffic,
   * gate on any in-flight reconnect (unless explicitly bypassed for the
   * `reconnect` RPC itself), assign an id, register the pending deferred, and
   * write to the wire.
   *
   * The reconnect-gate bypass exists because the `reconnect` request is sent
   * from inside `_attemptReconnect` while the gate is engaged, so it can't
   * wait on its own resolution.
   */
  async _dispatchRequest(method, params, options = {}) {
    if (this._state.kind === "closed" /* Closed */) {
      throw this._state.error;
    }
    if (this._state.kind === "incompatible" /* Incompatible */) {
      if (!options.allowIncompatibleUpgrade) {
        throw this._state.error;
      }
      const { request: request2, result: result2 } = this._createRequest(method, params);
      this._transport.send(request2);
      return result2;
    }
    if (!options.bypassInitializeQueue && isClientTransport(this._transport) && this._state.kind === "connecting" /* Connecting */) {
      const { request: request2, result: result2 } = this._createRequest(method, params);
      this._state.outbox.push(request2);
      return result2;
    }
    while (!options.bypassReconnectGate && this._state.kind === "reconnecting" /* Reconnecting */) {
      const current2 = this._state;
      if (current2.kind !== "reconnecting" /* Reconnecting */) {
        break;
      }
      try {
        await current2.reconnect.gate.p;
      } catch {
      }
    }
    const current = this._state;
    if (current.kind === "closed" /* Closed */ || current.kind === "incompatible" /* Incompatible */) {
      throw current.error;
    }
    const { request, result } = this._createRequest(method, params);
    this._transport.send(request);
    return result;
  }
  _createRequest(method, params) {
    const id = this._nextRequestId++;
    const deferred = new DeferredPromise();
    this._pendingRequests.set(id, { deferred, suppressNotFoundWarning: isFileResourceRead(method, params), sentAt: Date.now() });
    return {
      request: { jsonrpc: "2.0", id, method, params },
      result: deferred.p
    };
  }
  _shouldLogFailedRequest(request, error) {
    if (error.code === AhpErrorCodes.NotFound && request.suppressNotFoundWarning) {
      return false;
    }
    return true;
  }
  _toProtocolError(error) {
    return new ProtocolError(error.code, error.message, error.data);
  }
  _rejectPendingRequests(error) {
    for (const pending of this._pendingRequests.values()) {
      pending.deferred.error(error);
    }
    this._pendingRequests.clear();
  }
  /**
   * Reset the liveness timers. Called at construction for an already-open
   * passive transport, after a successful client-transport initialization,
   * once on every received message (which is itself proof the remote is
   * alive), and once after a successful soft reconnect.
   *
   * Two timers cooperate:
   *
   * 1. {@link _pingTimer} fires after {@link PING_INTERVAL_MS} of silence
   *    and sends an application-level `ping` so the close timer has
   *    something to time out on. Tolerates servers that don't implement
   *    `ping` — the error response still resets both timers.
   *
   * 2. {@link _closeTimer} fires after {@link PING_INTERVAL_MS}+
   *    {@link LIVENESS_TIMEOUT_MS} of continued silence and force-closes
   *    the transport so the renderer's reconnect logic kicks in. Catches
   *    silently-dead transports (e.g. SSH/tunnel after laptop sleep +
   *    network change) that don't emit a socket close event of their own.
   *
   * After laptop sleep + wake the JS event loop is paused, so a timer
   * armed before sleep fires immediately after wake. That's fine —
   * any inbound message processed during the wake catch-up resets it
   * before the close handler runs.
   *
   * No-op while {@link _state.kind} is {@link AgentHostClientState.Incompatible},
   * {@link AgentHostClientState.Reconnecting}, or {@link AgentHostClientState.Closed}:
   * the transport is not available for normal liveness traffic in those states.
   */
  _resetLivenessTimers() {
    if (this._state.kind === "incompatible" /* Incompatible */ || this._state.kind === "reconnecting" /* Reconnecting */ || this._state.kind === "closed" /* Closed */) {
      return;
    }
    this._pingTimer.cancelAndSet(() => this._onPingTimer(), PING_INTERVAL_MS);
    this._closeTimer.cancelAndSet(() => this._onCloseTimer(), PING_INTERVAL_MS + LIVENESS_TIMEOUT_MS);
  }
  _cancelLivenessTimers() {
    this._pingTimer.cancel();
    this._closeTimer.cancel();
  }
  _onPingTimer() {
    if (this._state.kind === "incompatible" /* Incompatible */ || this._state.kind === "closed" /* Closed */ || this._state.kind === "reconnecting" /* Reconnecting */) {
      return;
    }
    void this.ping().catch(() => void 0);
  }
  _onCloseTimer() {
    if (this._state.kind === "incompatible" /* Incompatible */ || this._state.kind === "closed" /* Closed */ || this._state.kind === "reconnecting" /* Reconnecting */) {
      return;
    }
    if (this._loadEstimator.hasHighLoad()) {
      this._closeTimer.cancelAndSet(() => this._onCloseTimer(), PING_INTERVAL_MS);
      return;
    }
    const silence = Date.now() - this._lastReadTime;
    this._logService.info(
      `[RemoteAgentHostProtocol] Liveness: no message from ${this._address} for ${silence}ms; forcing close to trigger reconnect.`
    );
    this._transportListeners.clear();
    if (this._transportFactory) {
      this._rejectPendingRequests(connectionTimeoutError(this._address, silence));
      this._handleTransportClose();
      return;
    }
    this._handleClose(connectionTimeoutError(this._address, silence));
  }
  /**
   * Get the next client sequence number for optimistic dispatch.
   */
  nextClientSeq() {
    return this._nextClientSeq++;
  }
};
RemoteAgentHostProtocolClient = __decorateClass([
  __decorateParam(5, ILogService),
  __decorateParam(6, IAgentHostResourceService),
  __decorateParam(7, IConfigurationService)
], RemoteAgentHostProtocolClient);
export {
  AgentHostClientState,
  RemoteAgentHostProtocolClient
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9icm93c2VyL3JlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gUHJvdG9jb2wgY2xpZW50IGZvciBjb21tdW5pY2F0aW5nIHdpdGggYSByZW1vdGUgYWdlbnQgaG9zdCBwcm9jZXNzLlxuLy8gV3JhcHMgV2ViU29ja2V0Q2xpZW50VHJhbnNwb3J0IGFuZCBTZXNzaW9uQ2xpZW50U3RhdGUgdG8gcHJvdmlkZSBhXG4vLyBoaWdoZXItbGV2ZWwgQVBJIG1hdGNoaW5nIElBZ2VudFNlcnZpY2UuXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLCB0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZFNldHRpbmdJZCwgQWdlbnRIb3N0Q29waWxvdE11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdENsYXVkZU11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdFN5c3RlbVByb3h5RW5hYmxlZFNldHRpbmdJZCwgSUFnZW50Q29ubmVjdGlvbiwgSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMsIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcywgSUFnZW50SG9zdE5ldHdvcmtEaWFnbm9zdGljc0luZm8sIElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQsIElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zLCBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMsIElBZ2VudFNlc3Npb25NZXRhZGF0YSwgQXV0aGVudGljYXRlUGFyYW1zLCBBdXRoZW50aWNhdGVSZXN1bHQsIElNY3BOb3RpZmljYXRpb24gfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFNQklFTlRfQUdFTlRfSE9TVF9BVVRIT1JJVFkgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlbW90ZVdhdGNoSGFuZGxlLCB0eXBlIElSZW1vdGVXYXRjaEhhbmRsZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTdWJzY3JpcHRpb25NYW5hZ2VyLCB0eXBlIElBY3RpdmVTdWJzY3JpcHRpb25JbmZvLCB0eXBlIElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBhZ2VudEhvc3RBdXRob3JpdHksIGZyb21BZ2VudEhvc3RVcmksIHRvQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RSZXNvdXJjZUlkZW50aXR5LCBBZ2VudEhvc3RSZXNvdXJjZVBlcm1pc3Npb25FcnJvciwgSUFnZW50SG9zdFJlc291cmNlU2VydmljZSwgTE9DQUxfQUdFTlRfSE9TVF9SRVNPVVJDRV9JREVOVElUWSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBDbGllbnROb3RpZmljYXRpb25NYXAsIENvbW1hbmRNYXAsIEpzb25ScGNFcnJvclJlc3BvbnNlLCBKc29uUnBjUmVxdWVzdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9tZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCB0eXBlIEFjdGlvbkVudmVsb3BlLCB0eXBlIENoYXRBY3Rpb24sIHR5cGUgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24sIHR5cGUgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uLCB0eXBlIElOb3RpZmljYXRpb24sIHR5cGUgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24sIHR5cGUgVGVybWluYWxBY3Rpb24gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCBTZXNzaW9uU3VtbWFyeSwgUk9PVF9TVEFURV9VUkksIFN0YXRlQ29tcG9uZW50cywgaXNBaHBSb290Q2hhbm5lbCwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIE1lc3NhZ2UsIHR5cGUgUm9vdFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBTVVBQT1JURURfUFJPVE9DT0xfVkVSU0lPTlMgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc0pzb25ScGNOb3RpZmljYXRpb24sIGlzSnNvblJwY1JlcXVlc3QsIGlzSnNvblJwY1Jlc3BvbnNlLCBQcm90b2NvbEVycm9yLCBSZWNvbm5lY3RSZXN1bHRUeXBlLCB0eXBlIFByb3RvY29sTWVzc2FnZSwgdHlwZSBJU3RhdGVTbmFwc2hvdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgdHlwZSBJVnNjb2RlVXBncmFkZVJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbFVwZ3JhZGUuanMnO1xuaW1wb3J0IHsgaXNDbGllbnRUcmFuc3BvcnQsIHR5cGUgSVByb3RvY29sVHJhbnNwb3J0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25UcmFuc3BvcnQuanMnO1xuaW1wb3J0IHsgQWhwRXJyb3JDb2RlcyB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9lcnJvcnMuanMnO1xuaW1wb3J0IHsgQ2hhdFNvdXJjZUtpbmQsIENvbnRlbnRFbmNvZGluZywgUmVzb3VyY2VSZXF1ZXN0UGFyYW1zLCB0eXBlIENvbXBsZXRpb25zUGFyYW1zLCB0eXBlIENvbXBsZXRpb25zUmVzdWx0LCB0eXBlIENyZWF0ZVRlcm1pbmFsUGFyYW1zLCB0eXBlIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCB0eXBlIFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgdHlwZSB7IEludm9rZUNoYW5nZXNldE9wZXJhdGlvblBhcmFtcywgSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLWNoYW5nZXNldC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSUxvYWRFc3RpbWF0b3IsIExvYWRFc3RpbWF0b3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBURUxFTUVUUllfQ1JBU0hfUkVQT1JURVJfU0VUVElOR19JRCwgVEVMRU1FVFJZX09MRF9TRVRUSU5HX0lELCBURUxFTUVUUllfU0VUVElOR19JRCB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGdldFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbENvbmZpZ0tleSwgQWdlbnRIb3N0Q29kZXhFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RTZXNzaW9uU3luY0VuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdEF1dG9SZXBseUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdFByZWZlckxvbmdDb250ZXh0RW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXksIEFnZW50SG9zdERpc2FibGVSZXBvSW5mb1RlbGVtZXRyeUNvbmZpZ0tleSwgQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXksIGdldEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZywgU0VTU0lPTl9TWU5DX0VOQUJMRURfU0VUVElOR19JRCwgVEVSTUlOQUxfQVVUT19BUFBST1ZFX0VOQUJMRURfU0VUVElOR19JRCwgR0xPQkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lELCBBVVRPX1JFUExZX1NFVFRJTkdfSUQsIFBSRUZFUl9MT05HX0NPTlRFWFRfU0VUVElOR19JRCwgVEVSTUlOQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQsIFRFUk1JTkFMX0lHTk9SRV9ERUZBVUxUX0FVVE9fQVBQUk9WRV9SVUxFU19TRVRUSU5HX0lELCBESVNBQkxFX1JFUE9fSU5GT19URUxFTUVUUllfU0VUVElOR19JRCwgRURJVF9URUxFTUVUUllfRU5BQkxFRF9TRVRUSU5HX0lELCB0ZWxlbWV0cnlMZXZlbFRvQWdlbnRIb3N0Q29uZmlnVmFsdWUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB0eXBlIHsgT3RscEV4cG9ydExvZ3NQYXJhbXMgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtb3RscC9ub3RpZmljYXRpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgVGVsZW1ldHJ5Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLW90bHAvc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJbXBsZW1lbnRhdGlvbiwgSW5pdGlhbGl6ZVJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUsIHR5cGUgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRmlsZVJlc291cmNlUmVhZCB9IGZyb20gJy4uL2NvbW1vbi9yZXNvdXJjZVJlYWRMb2dnaW5nLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcblxuY29uc3QgQUhQX0NMSUVOVF9DT05ORUNUSU9OX0NMT1NFRCA9IC0zMjAwMDtcblxuLyoqIEluaXRpYWwgZGVsYXkgYmVmb3JlIHRoZSBmaXJzdCB0cmFuc3BvcnQtbGV2ZWwgcmVjb25uZWN0IGF0dGVtcHQuICovXG5jb25zdCBSRUNPTk5FQ1RfSU5JVElBTF9ERUxBWV9NUyA9IDFfMDAwO1xuXG4vKiogVXBwZXIgYm91bmQgb24gdGhlIGV4cG9uZW50aWFsIGJhY2tvZmYgYmV0d2VlbiByZWNvbm5lY3QgYXR0ZW1wdHMuICovXG5jb25zdCBSRUNPTk5FQ1RfTUFYX0RFTEFZX01TID0gMzBfMDAwO1xuXG4vKipcbiAqIEFmdGVyIHRoaXMgbXVjaCBpbmJvdW5kIHNpbGVuY2UsIHNlbmQgYW4gYXBwbGljYXRpb24tbGV2ZWwgYHBpbmdgIHRvXG4gKiB0aGUgcmVtb3RlIHNvIHdlIGhhdmUgc29tZXRoaW5nIHRvIHRpbWUgb3V0IG9uLiBSZXNldCBvbiBldmVyeSByZWNlaXZlZFxuICogbWVzc2FnZSBcdTIwMTQgYnVzeSBjb25uZWN0aW9ucyBkb24ndCBnZW5lcmF0ZSBwaW5nIHRyYWZmaWMuXG4gKlxuICogTWlycm9ycyB7QGxpbmsgUHJvdG9jb2xDb25zdGFudHMuS2VlcEFsaXZlU2VuZFRpbWV9IGZyb20gdGhlIHJlZ3VsYXJcbiAqIHJlbW90ZSBleHRlbnNpb24gaG9zdCBzdGFjay5cbiAqL1xuY29uc3QgUElOR19JTlRFUlZBTF9NUyA9IDVfMDAwO1xuXG4vKipcbiAqIFRvdGFsIGluYm91bmQgc2lsZW5jZSAocGluZyBpbnRlcnZhbCArIHRoaXMpIGJlZm9yZSB0aGUgY29ubmVjdGlvbiBpc1xuICogZGVjbGFyZWQgZGVhZCBhbmQgZm9yY2UtY2xvc2VkIHNvIHRoZSByZW5kZXJlcidzIHJlY29ubmVjdCBsb2dpYyBraWNrc1xuICogaW4uIFJlc2V0IG9uIGV2ZXJ5IHJlY2VpdmVkIG1lc3NhZ2U7IHRoZSBvbmx5IHdheSB0byByZWFjaCB0aGlzIGlzIGZvclxuICogdGhlIHBpbmcgdG8gaXRzZWxmIGdvIHVuYW5zd2VyZWQuXG4gKlxuICogTWF0Y2hlcyB7QGxpbmsgUHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWV9IGZyb20gdGhlIHJlZ3VsYXIgcmVtb3RlXG4gKiBleHRlbnNpb24gaG9zdCBzdGFjay5cbiAqL1xuY29uc3QgTElWRU5FU1NfVElNRU9VVF9NUyA9IDIwXzAwMDtcblxuZnVuY3Rpb24gY29ubmVjdGlvblRpbWVvdXRFcnJvcihhZGRyZXNzOiBzdHJpbmcsIHNpbGVuY2VNczogbnVtYmVyKTogUHJvdG9jb2xFcnJvciB7XG5cdHJldHVybiBuZXcgUHJvdG9jb2xFcnJvcihcblx0XHRBSFBfQ0xJRU5UX0NPTk5FQ1RJT05fQ0xPU0VELFxuXHRcdGBDb25uZWN0aW9uIGFwcGVhcnMgZGVhZDogJHthZGRyZXNzfTsgbm8gbWVzc2FnZSByZWNlaXZlZCBmb3IgJHtzaWxlbmNlTXN9bXMuYCxcblx0KTtcbn1cblxuZnVuY3Rpb24gY29ubmVjdGlvbkNsb3NlZEVycm9yKGFkZHJlc3M6IHN0cmluZyk6IFByb3RvY29sRXJyb3Ige1xuXHRyZXR1cm4gbmV3IFByb3RvY29sRXJyb3IoQUhQX0NMSUVOVF9DT05ORUNUSU9OX0NMT1NFRCwgYENvbm5lY3Rpb24gY2xvc2VkOiAke2FkZHJlc3N9YCk7XG59XG5cbmZ1bmN0aW9uIGNvbm5lY3Rpb25EaXNwb3NlZEVycm9yKGFkZHJlc3M6IHN0cmluZyk6IFByb3RvY29sRXJyb3Ige1xuXHRyZXR1cm4gbmV3IFByb3RvY29sRXJyb3IoQUhQX0NMSUVOVF9DT05ORUNUSU9OX0NMT1NFRCwgYENvbm5lY3Rpb24gZGlzcG9zZWQ6ICR7YWRkcmVzc31gKTtcbn1cblxuZnVuY3Rpb24gdHJhbnNwb3J0TG9zdEVycm9yKGFkZHJlc3M6IHN0cmluZyk6IFByb3RvY29sRXJyb3Ige1xuXHRyZXR1cm4gbmV3IFByb3RvY29sRXJyb3IoQUhQX0NMSUVOVF9DT05ORUNUSU9OX0NMT1NFRCwgYFRyYW5zcG9ydCBsb3N0IChyZWNvbm5lY3RpbmcpOiAke2FkZHJlc3N9YCk7XG59XG5cbmludGVyZmFjZSBJUmVtb3RlQWdlbnRIb3N0RXh0ZW5zaW9uQ29tbWFuZE1hcCB7XG5cdCdzaHV0ZG93bic6IHsgcGFyYW1zOiB1bmRlZmluZWQ7IHJlc3VsdDogdm9pZCB9O1xuXHQnZ2V0TmV0d29ya0RpYWdub3N0aWNzSW5mbyc6IHsgcGFyYW1zOiB1bmRlZmluZWQ7IHJlc3VsdDogSUFnZW50SG9zdE5ldHdvcmtEaWFnbm9zdGljc0luZm8gfTtcblx0J2dldE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzJzogeyBwYXJhbXM6IHVuZGVmaW5lZDsgcmVzdWx0OiByZWFkb25seSBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3NbXSB9O1xuXHQnZGlhZ25vc3RpY3NGZXRjaCc6IHsgcGFyYW1zOiB7IHVybDogc3RyaW5nIH07IHJlc3VsdDogSUFnZW50SG9zdE5ldHdvcmtGZXRjaFJlc3VsdCB9O1xufVxuXG5pbnRlcmZhY2UgSVBlbmRpbmdSZXF1ZXN0IHtcblx0cmVhZG9ubHkgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTx1bmtub3duPjtcblx0cmVhZG9ubHkgc3VwcHJlc3NOb3RGb3VuZFdhcm5pbmc6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNlbnRBdDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEhpZ2gtbGV2ZWwgY29ubmVjdGlvbiBzdGF0ZSBvZiBhIHtAbGluayBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudH0uXG4gKiBFeHBvc2VkIHZpYSB7QGxpbmsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQub25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGV9XG4gKiBzbyBjb25zdW1lcnMgY2FuIHN1cmZhY2UgdHJhbnNpZW50IHJlY29ubmVjdCBhY3Rpdml0eSBpbiB0aGUgVUkuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIEFnZW50SG9zdENsaWVudFN0YXRlIHtcblx0LyoqIEluaXRpYWwgaGFuZHNoYWtlIGluIHByb2dyZXNzLiAqL1xuXHRDb25uZWN0aW5nID0gJ2Nvbm5lY3RpbmcnLFxuXHQvKiogVGhlIGhvc3QgcmVqZWN0ZWQgdGhlIGluaXRpYWwgcHJvdG9jb2wgdmVyc2lvbjsgdXBncmFkZSByZW1haW5zIGF2YWlsYWJsZS4gKi9cblx0SW5jb21wYXRpYmxlID0gJ2luY29tcGF0aWJsZScsXG5cdC8qKiBUcmFuc3BvcnQgaXMgb3BlbiBhbmQgaGFuZHNoYWtlL3JlY29ubmVjdCBoYXMgY29tcGxldGVkLiAqL1xuXHRDb25uZWN0ZWQgPSAnY29ubmVjdGVkJyxcblx0LyoqIFRyYW5zcG9ydCBjbG9zZWQgdW5leHBlY3RlZGx5OyBhbiBhdXRvbWF0aWMgcmVjb25uZWN0IGlzIGluIGZsaWdodCBvciBzY2hlZHVsZWQuICovXG5cdFJlY29ubmVjdGluZyA9ICdyZWNvbm5lY3RpbmcnLFxuXHQvKiogQ2xpZW50IGhhcyBiZWVuIGRpc3Bvc2VkIG9yIGhhcyBnaXZlbiB1cCByZWNvbm5lY3RpbmcuIFRlcm1pbmFsIHN0YXRlLiAqL1xuXHRDbG9zZWQgPSAnY2xvc2VkJyxcbn1cblxuLyoqXG4gKiBSZWNvbm5lY3Qtb25seSBib29ra2VlcGluZy4gTGl2ZXMgZXhjbHVzaXZlbHkgaW5zaWRlIHRoZSBgUmVjb25uZWN0aW5nYFxuICogdmFyaWFudCBvZiB7QGxpbmsgQ2xpZW50U3RhdGV9IHNvIHRoZSBmaWVsZHMgY2FuJ3QgYmUgcmVhZCBvciBtdXRhdGVkIHdoZW5cbiAqIHRoZXkncmUgbm90IG1lYW5pbmdmdWwuXG4gKi9cbmludGVyZmFjZSBJUmVjb25uZWN0U3RhdGUge1xuXHQvKipcblx0ICogUmVzb2x2ZXMgd2hlbiB0aGUgY3VycmVudCBhdHRlbXB0J3MgaGFuZHNoYWtlIHN1Y2NlZWRzOyByZWplY3RlZCBhbmRcblx0ICogcmVwbGFjZWQgKHZpYSB7QGxpbmsgX25ld1JlY29ubmVjdEdhdGV9KSBvbiBhIGZhaWxlZCBhdHRlbXB0IHNvIGF3YWl0aW5nXG5cdCAqIGNhbGxlcnMgc2VlIHRoZSBmYWlsdXJlIHdoaWxlIG5ldyBjYWxsZXJzIGdhdGUgb24gdGhlIG5leHQgYXR0ZW1wdC5cblx0ICovXG5cdGdhdGU6IERlZmVycmVkUHJvbWlzZTx2b2lkPjtcblx0LyoqXG5cdCAqIFdpcmUgbWVzc2FnZXMgYnVmZmVyZWQgd2hpbGUgdGhlIGdhdGUgaXMgZW5nYWdlZC4gRHJhaW5lZCBvbnRvIHRoZSBuZXdcblx0ICogdHJhbnNwb3J0IGJ5IHtAbGluayBfZHJhaW5BZnRlclJlY29ubmVjdH0gb25jZSB0aGUgaGFuZHNoYWtlIGNvbXBsZXRlcztcblx0ICogc3Vydml2ZXMgYWNyb3NzIGZhaWxlZCBhdHRlbXB0cyBzbyBtZXNzYWdlcyByaWRlIHRocm91Z2ggcmV0cnkgY3ljbGVzLlxuXHQgKi9cblx0cmVhZG9ubHkgb3V0Ym94OiBQcm90b2NvbE1lc3NhZ2VbXTtcblx0LyoqIE51bWJlciBvZiByZWNvbm5lY3QgYXR0ZW1wdHMgcGVyZm9ybWVkIGluIHRoaXMgcmVjb25uZWN0IGN5Y2xlLiAqL1xuXHRhdHRlbXB0OiBudW1iZXI7XG5cdC8qKiBUaW1lciBmb3IgdGhlIG5leHQgc2NoZWR1bGVkIGF0dGVtcHQsIGlmIGFueS4gKi9cblx0dGltZW91dEhhbmRsZTogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogSW50ZXJuYWwgY29ubmVjdGlvbiBzdGF0ZSwgZGlzY3JpbWluYXRlZCBieSB7QGxpbmsgQWdlbnRIb3N0Q2xpZW50U3RhdGV9LlxuICogTXV0dWFsbHktZXhjbHVzaXZlIGZpZWxkcyAoY2xvc2UgZXJyb3IsIHJlY29ubmVjdCBib29ra2VlcGluZykgbGl2ZSBpbnNpZGVcbiAqIHRoZSB2YXJpYW50IHdoZXJlIHRoZXkncmUgbWVhbmluZ2Z1bCBzbyBjYWxsZXJzIGNhbid0IGFjY2lkZW50YWxseSByZWFkIG9yXG4gKiB3cml0ZSB0aGVtIGluIHRoZSB3cm9uZyBzdGF0ZS5cbiAqL1xudHlwZSBDbGllbnRTdGF0ZSA9XG5cdHwgeyByZWFkb25seSBraW5kOiBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0aW5nOyByZWFkb25seSBvdXRib3g6IFByb3RvY29sTWVzc2FnZVtdIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZTsgcmVhZG9ubHkgZXJyb3I6IFByb3RvY29sRXJyb3IgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZzsgcmVhZG9ubHkgcmVjb25uZWN0OiBJUmVjb25uZWN0U3RhdGUgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkOyByZWFkb25seSBlcnJvcjogUHJvdG9jb2xFcnJvciB9O1xuXG4vKipcbiAqIEEgcHJvdG9jb2wtbGV2ZWwgY2xpZW50IGZvciBhIHNpbmdsZSByZW1vdGUgYWdlbnQgaG9zdCBjb25uZWN0aW9uLlxuICogTWFuYWdlcyB0aGUgV2ViU29ja2V0IHRyYW5zcG9ydCwgaGFuZHNoYWtlLCBzdWJzY3JpcHRpb25zLCBhY3Rpb24gZGlzcGF0Y2gsXG4gKiBhbmQgY29tbWFuZC9yZXNwb25zZSBjb3JyZWxhdGlvbi5cbiAqXG4gKiBJbXBsZW1lbnRzIHtAbGluayBJQWdlbnRDb25uZWN0aW9ufSBzbyBjb25zdW1lcnMgY2FuIHByb2dyYW0gYWdhaW5zdFxuICogYSBzaW5nbGUgaW50ZXJmYWNlIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0aGUgYWdlbnQgaG9zdCBpcyBsb2NhbCBvciByZW1vdGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRDb25uZWN0aW9uIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jbGllbnRJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZGRyZXNzOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlSWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zcG9ydEZhY3Rvcnk6ICgoKSA9PiBJUHJvdG9jb2xUcmFuc3BvcnQpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90cmFuc3BvcnQhOiBJUHJvdG9jb2xUcmFuc3BvcnQ7XG5cdC8qKiBEaXNwb3NhYmxlIGhvbGRpbmcgdGhlIGxpc3RlbmVycyBhdHRhY2hlZCB0byB0aGUgY3VycmVudCB0cmFuc3BvcnQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zcG9ydExpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmc7XG5cdHByaXZhdGUgX3NlcnZlclNlcSA9IDA7XG5cdHByaXZhdGUgX25leHRDbGllbnRTZXEgPSAxO1xuXHRwcml2YXRlIF9kZWZhdWx0RGlyZWN0b3J5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBMYXRlc3QgYGluaXRpYWxpemVgIHJlc3BvbnNlIGZyb20gdGhlIGhvc3QuIENhcHR1cmVkIGF0IHRoZSBlbmQgb2Zcblx0ICoge0BsaW5rIGNvbm5lY3R9IGFuZCByZS1jYXB0dXJlZCBhZnRlciBhIHNvZnQtcmVjb25uZWN0IHRoYXQgcHVsbGVkXG5cdCAqIGEgZnJlc2ggc25hcHNob3QuIGB1bmRlZmluZWRgIGJlZm9yZSB0aGUgaGFuZHNoYWtlIGNvbXBsZXRlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxpemVSZXN1bHQgPSBvYnNlcnZhYmxlVmFsdWU8SW5pdGlhbGl6ZVJlc3VsdCB8IHVuZGVmaW5lZD4oJ2FnZW50SG9zdEluaXRpYWxpemVSZXN1bHQnLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJzY3JpcHRpb25NYW5hZ2VyOiBBZ2VudFN1YnNjcmlwdGlvbk1hbmFnZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aW9uID0gdGhpcy5fb25EaWRBY3Rpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWROb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90aWZpY2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWROb3RpZmljYXRpb24gPSB0aGlzLl9vbkRpZE5vdGlmaWNhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1jcE5vdGlmaWNhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNY3BOb3RpZmljYXRpb24+KCkpO1xuXHRyZWFkb25seSBvbk1jcE5vdGlmaWNhdGlvbiA9IHRoaXMuX29uTWNwTm90aWZpY2F0aW9uLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBGaXJlcyBmb3IgZXZlcnkgYG90bHAvZXhwb3J0TG9nc2Agbm90aWZpY2F0aW9uIHRoZSBob3N0IHNlbmRzIG9uIGFcblx0ICogY2hhbm5lbCB0aGlzIGNsaWVudCBoYXMgc3Vic2NyaWJlZCB0by4gRWFjaCBwYXlsb2FkIGlzIGFuXG5cdCAqIE9UTFAvSlNPTiBgRXhwb3J0TG9nc1NlcnZpY2VSZXF1ZXN0YCB2YWx1ZSB2ZXJiYXRpbTsgY29uc3VtZXJzXG5cdCAqIGRlY29kZSBpdCAoc2VlIGBpdGVyYXRlT3RscExvZ1JlY29yZHNgKSBhbmQgcm91dGUgdGhlIHJlY29yZHMgdG8gYVxuXHQgKiByZWdpc3RlcmVkIGxvZ2dlciBvciBzaW5rLlxuXHQgKlxuXHQgKiBDaGFubmVsIFVSSXMgYXJlIGtlcHQgb3BhcXVlIG9uIHRoZSB3aXJlIHNvIHRoZSBzYW1lIGV2ZW50IGNvdmVyc1xuXHQgKiBldmVyeSB7QGxpbmsgVGVsZW1ldHJ5Q2FwYWJpbGl0aWVzLmxvZ3N9IFVSSSB0aGUgaG9zdCBhZHZlcnRpc2VzIFx1MjAxNFxuXHQgKiBzdWJzY3JpYmVycyBzaG91bGQgZmlsdGVyIGJ5IGBjaGFubmVsYCBpZiB0aGV5IGNhcmUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlY2VpdmVPdGxwTG9ncyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE90bHBFeHBvcnRMb2dzUGFyYW1zPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWNlaXZlT3RscExvZ3MgPSB0aGlzLl9vbkRpZFJlY2VpdmVPdGxwTG9ncy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2UgPSB0aGlzLl9vbkRpZENsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QWdlbnRIb3N0Q2xpZW50U3RhdGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBEaXNjcmltaW5hdGVkIHN0YXRlIHVuaW9uLiBSZWFkIHZpYSBuYXJyb3dpbmcgKGBfc3RhdGUua2luZCA9PT0gLi4uYCk7XG5cdCAqIHJlY29ubmVjdC1vbmx5IGZpZWxkcyBsaWtlIHRoZSBnYXRlL291dGJveC9hdHRlbXB0IGNvdW50ZXIgYXJlIG9ubHlcblx0ICogYWNjZXNzaWJsZSB3aGlsZSB7QGxpbmsgX3N0YXRlLmtpbmR9IGlzIHtAbGluayBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3Rpbmd9LFxuXHQgKiBhbmQgcHJvdG9jb2wgZXJyb3JzIGFyZSBvbmx5IGFjY2Vzc2libGUgd2hpbGUgdGhlIHN0YXRlIGlzXG5cdCAqIHtAbGluayBBZ2VudEhvc3RDbGllbnRTdGF0ZS5JbmNvbXBhdGlibGV9IG9yIHtAbGluayBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWR9LlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhdGU6IENsaWVudFN0YXRlID0geyBraW5kOiBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0aW5nLCBvdXRib3g6IFtdIH07XG5cblx0LyoqIFBlbmRpbmcgSlNPTi1SUEMgcmVxdWVzdHMga2V5ZWQgYnkgcmVxdWVzdCBpZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1JlcXVlc3RzID0gbmV3IE1hcDxudW1iZXIsIElQZW5kaW5nUmVxdWVzdD4oKTtcblx0cHJpdmF0ZSBfbmV4dFJlcXVlc3RJZCA9IDE7XG5cblx0LyoqXG5cdCAqIFRpbWVzdGFtcCBvZiB0aGUgbW9zdCByZWNlbnQgbWVzc2FnZSBvZiBhbnkga2luZCByZWNlaXZlZCBmcm9tIHRoZVxuXHQgKiBzZXJ2ZXIuIFVzZWQgb25seSBmb3IgZGlhZ25vc3RpYyBsb2dnaW5nIHdoZW4gdGhlIGNsb3NlIHRpbWVyIGZpcmVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfbGFzdFJlYWRUaW1lID0gRGF0ZS5ub3coKTtcblxuXHQvKipcblx0ICogTGl2ZW5lc3Mgd2F0Y2hkb2cgXHUyMDE0IHNlZSB7QGxpbmsgX3Jlc2V0TGl2ZW5lc3NUaW1lcnN9LlxuXHQgKlxuXHQgKiB7QGxpbmsgX3BpbmdUaW1lcn0gZmlyZXMgYWZ0ZXIge0BsaW5rIFBJTkdfSU5URVJWQUxfTVN9IG9mIGluYm91bmRcblx0ICogc2lsZW5jZSBhbmQgc2VuZHMgYW4gYXBwbGljYXRpb24tbGV2ZWwgYHBpbmdgIHNvIHdlIGhhdmUgc29tZXRoaW5nXG5cdCAqIHRvIHRpbWUgb3V0IG9uLiB7QGxpbmsgX2Nsb3NlVGltZXJ9IGZpcmVzIGFmdGVyIGFub3RoZXJcblx0ICoge0BsaW5rIExJVkVORVNTX1RJTUVPVVRfTVN9IG9mIGNvbnRpbnVlZCBzaWxlbmNlIGFuZCBmb3JjZS1jbG9zZXNcblx0ICogdGhlIHRyYW5zcG9ydCBzbyB0aGUgcmVuZGVyZXIncyByZWNvbm5lY3QgbG9naWMga2lja3MgaW4uIEJvdGggYXJlXG5cdCAqIHJlc2V0IG9uIGV2ZXJ5IHJlY2VpdmVkIG1lc3NhZ2UsIHNvIGJ1c3kgY29ubmVjdGlvbnMgZ2VuZXJhdGUgbm9cblx0ICogcGluZyB0cmFmZmljIGF0IGFsbC5cblx0ICpcblx0ICogRGV0ZWN0cyBzaWxlbnRseS1kZWFkIHRyYW5zcG9ydHMgKGUuZy4gU1NIL3R1bm5lbCBhZnRlciBsYXB0b3Bcblx0ICogc2xlZXAgKyBuZXR3b3JrIGNoYW5nZSkgdGhhdCBkb24ndCBwcm9kdWNlIGEgc29ja2V0IGNsb3NlIGV2ZW50IG9mXG5cdCAqIHRoZWlyIG93bi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BpbmdUaW1lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaW1lb3V0VGltZXIoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nsb3NlVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGltZW91dFRpbWVyKCkpO1xuXG5cdC8qKlxuXHQgKiBVc2VkIHRvIHN1cHByZXNzIHdhdGNoZG9nLXRyaWdnZXJlZCBjbG9zZXMgd2hlbiBvdXIgb3duIEpTIGV2ZW50IGxvb3Bcblx0ICogaGFzIGJlZW4gcGVnZ2VkIFx1MjAxNCBpbiB0aGF0IGNhc2UgdGhlIHNpbGVuY2UgaXMgb24gb3VyIHNpZGUsIG5vdCB0aGVcblx0ICogcmVtb3RlJ3MsIGFuZCB0ZWFyaW5nIGRvd24gdGhlIHRyYW5zcG9ydCB3b3VsZCBqdXN0IGdlbmVyYXRlIGEgdXNlbGVzc1xuXHQgKiByZWNvbm5lY3QgY3ljbGUgdGhhdCBhYm9ydHMgaW4tZmxpZ2h0IHJlcXVlc3RzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbG9hZEVzdGltYXRvcjogSUxvYWRFc3RpbWF0b3I7XG5cblx0LyoqXG5cdCAqIFVSSXMgd2UgaGF2ZSBhbHJlYWR5IGdyYW50ZWQgaW1wbGljaXQgcmVhZCBhY2Nlc3MgZm9yIG9uIHRoaXMgY29ubmVjdGlvbi5cblx0ICogVXNlcyBVUkktYXdhcmUgY29tcGFyaXNvbiB0byBkZWR1cGUgcmVwZWF0IHNlbmRzIGFuZCBpcyBjbGVhcmVkIHdpdGggdGhlIGNvbm5lY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ncmFudGVkSW1wbGljaXRSZWFkVXJpcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbXBsaWNpdFJlYWRHcmFudHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGdldCBjbGllbnRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9jbGllbnRJZDtcblx0fVxuXG5cdGdldCBhZGRyZXNzKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2FkZHJlc3M7XG5cdH1cblxuXHRnZXQgZGVmYXVsdERpcmVjdG9yeSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kZWZhdWx0RGlyZWN0b3J5O1xuXHR9XG5cblx0Z2V0IGNvbm5lY3Rpb25TdGF0ZSgpOiBBZ2VudEhvc3RDbGllbnRTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlLmtpbmQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGxhdGVzdCBgaW5pdGlhbGl6ZWAgcmVzcG9uc2UgZnJvbSB0aGUgaG9zdCwgb3IgYHVuZGVmaW5lZGAgaWZcblx0ICogdGhlIGhhbmRzaGFrZSBoYXMgbm90IGNvbXBsZXRlZCB5ZXQuIEV4cG9zZWQgb2JzZXJ2YWJseSBzbyBjYWxsZXJzIGNhblxuXHQgKiByZWFjdCBhcyBhZHZlcnRpc2VkIGNhcGFiaWxpdGllcyAodGVsZW1ldHJ5LCBgY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzYCxcblx0ICogYHRlcm1pbmFsQ29tbWFuZFByZWZpeGAsIC4uLikgYXJyaXZlLlxuXHQgKi9cblx0Z2V0IGluaXRpYWxpemVSZXN1bHQoKTogSU9ic2VydmFibGU8SW5pdGlhbGl6ZVJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsaXplUmVzdWx0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWRlbnRpdHk6IEFnZW50SG9zdFJlc291cmNlSWRlbnRpdHksXG5cdFx0dHJhbnNwb3J0T3JGYWN0b3J5OiBJUHJvdG9jb2xUcmFuc3BvcnQgfCAoKCkgPT4gSVByb3RvY29sVHJhbnNwb3J0KSxcblx0XHRsb2FkRXN0aW1hdG9yOiBJTG9hZEVzdGltYXRvciB8IHVuZGVmaW5lZCxcblx0XHRjbGllbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudEluZm86IEltcGxlbWVudGF0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUFnZW50SG9zdFJlc291cmNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZVNlcnZpY2U6IElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Jlc291cmNlSWRlbnRpdHkgPSBpZGVudGl0eTtcblx0XHR0aGlzLl9hZGRyZXNzID0gaWRlbnRpdHkgPT09IExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFkgPyBBTUJJRU5UX0FHRU5UX0hPU1RfQVVUSE9SSVRZIDogaWRlbnRpdHk7XG5cdFx0dGhpcy5fY2xpZW50SWQgPSBjbGllbnRJZCA/PyBnZW5lcmF0ZVV1aWQoKTtcblx0XHR0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5ID0gaWRlbnRpdHkgPT09IExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFkgPyBBTUJJRU5UX0FHRU5UX0hPU1RfQVVUSE9SSVRZIDogYWdlbnRIb3N0QXV0aG9yaXR5KGlkZW50aXR5KTtcblx0XHR0aGlzLl9sb2FkRXN0aW1hdG9yID0gbG9hZEVzdGltYXRvciA/PyBMb2FkRXN0aW1hdG9yLmdldEluc3RhbmNlKCk7XG5cblx0XHRpZiAodHlwZW9mIHRyYW5zcG9ydE9yRmFjdG9yeSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0dGhpcy5fdHJhbnNwb3J0RmFjdG9yeSA9IHRyYW5zcG9ydE9yRmFjdG9yeTtcblx0XHRcdHRoaXMuX2luc3RhbGxUcmFuc3BvcnQodHJhbnNwb3J0T3JGYWN0b3J5KCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90cmFuc3BvcnRGYWN0b3J5ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5faW5zdGFsbFRyYW5zcG9ydCh0cmFuc3BvcnRPckZhY3RvcnkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWdlbnRTdWJzY3JpcHRpb25NYW5hZ2VyKFxuXHRcdFx0dGhpcy5fY2xpZW50SWQsXG5cdFx0XHQoKSA9PiB0aGlzLm5leHRDbGllbnRTZXEoKSxcblx0XHRcdG1zZyA9PiB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudF0gJHttc2d9YCksXG5cdFx0XHRyZXNvdXJjZSA9PiB0aGlzLnN1YnNjcmliZShyZXNvdXJjZSksXG5cdFx0XHRyZXNvdXJjZSA9PiB0aGlzLnVuc3Vic2NyaWJlKHJlc291cmNlKSxcblx0XHQpKTtcblxuXHRcdC8vIEZvcndhcmQgYWN0aW9uIGVudmVsb3BlcyBmcm9tIHRoZSB0cmFuc3BvcnQgdG8gdGhlIHN1YnNjcmlwdGlvbiBtYW5hZ2VyXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZEFjdGlvbihlbnZlbG9wZSA9PiB7XG5cdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25NYW5hZ2VyLnJlY2VpdmVFbnZlbG9wZShlbnZlbG9wZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVEVMRU1FVFJZX1NFVFRJTkdfSUQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVEVMRU1FVFJZX09MRF9TRVRUSU5HX0lEKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRFTEVNRVRSWV9DUkFTSF9SRVBPUlRFUl9TRVRUSU5HX0lEKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUua2luZCAhPT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRlbGVtZXRyeUxldmVsKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihFRElUX1RFTEVNRVRSWV9FTkFCTEVEX1NFVFRJTkdfSUQpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlRWRpdFRlbGVtZXRyeUVuYWJsZWQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFNFU1NJT05fU1lOQ19FTkFCTEVEX1NFVFRJTkdfSUQpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlU2Vzc2lvblN5bmNFbmFibGVkKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihURVJNSU5BTF9BVVRPX0FQUFJPVkVfRU5BQkxFRF9TRVRUSU5HX0lEKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUua2luZCAhPT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihHTE9CQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlR2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBVVRPX1JFUExZX1NFVFRJTkdfSUQpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlQXV0b1JlcGx5RW5hYmxlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUFJFRkVSX0xPTkdfQ09OVEVYVF9TRVRUSU5HX0lEKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUua2luZCAhPT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVByZWZlckxvbmdDb250ZXh0RW5hYmxlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUua2luZCAhPT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVN5c3RlbVByb3h5RW5hYmxlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q29waWxvdE11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlQ29waWxvdE11bHRpUm9vdEVuYWJsZWQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFnZW50SG9zdENsYXVkZU11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlQ2xhdWRlTXVsdGlSb290RW5hYmxlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUua2luZCAhPT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUNvZGV4TXVsdGlSb290RW5hYmxlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVEVSTUlOQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVEVSTUlOQUxfSUdOT1JFX0RFRkFVTFRfQVVUT19BUFBST1ZFX1JVTEVTX1NFVFRJTkdfSUQpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlVGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl91cGRhdGVDb2RleEVuYWJsZWQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKERJU0FCTEVfUkVQT19JTkZPX1RFTEVNRVRSWV9TRVRUSU5HX0lEKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUua2luZCAhPT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZURpc2FibGVSZXBvSW5mb1RlbGVtZXRyeSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICghaXNDbGllbnRUcmFuc3BvcnQodGhpcy5fdHJhbnNwb3J0KSkge1xuXHRcdFx0Ly8gUGFzc2l2ZSB0cmFuc3BvcnRzIGFyZSBhbHJlYWR5IGNvbm5lY3RlZCB3aGVuIGNvbnN0cnVjdGVkLlxuXHRcdFx0dGhpcy5fcmVzZXRMaXZlbmVzc1RpbWVycygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBJbnN0YWxsIGEgdHJhbnNwb3J0IGFuZCB3aXJlIGxpc3RlbmVycy4gVXNlZCBib3RoIGZvciB0aGUgaW5pdGlhbFxuXHQgKiB0cmFuc3BvcnQgYW5kIGZvciByZXBsYWNlbWVudHMgY3JlYXRlZCBieSB0aGUgZmFjdG9yeSBkdXJpbmcgYVxuXHQgKiB0cmFuc3BvcnQtbGV2ZWwgcmVjb25uZWN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfaW5zdGFsbFRyYW5zcG9ydCh0cmFuc3BvcnQ6IElQcm90b2NvbFRyYW5zcG9ydCk6IHZvaWQge1xuXHRcdGNvbnN0IGxpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsaXN0ZW5lcnMuYWRkKHRyYW5zcG9ydCk7XG5cdFx0bGlzdGVuZXJzLmFkZCh0cmFuc3BvcnQub25NZXNzYWdlKG1zZyA9PiB0aGlzLl9oYW5kbGVNZXNzYWdlKG1zZykpKTtcblx0XHRsaXN0ZW5lcnMuYWRkKHRyYW5zcG9ydC5vbkNsb3NlKCgpID0+IHRoaXMuX2hhbmRsZVRyYW5zcG9ydENsb3NlKCkpKTtcblx0XHR0aGlzLl90cmFuc3BvcnQgPSB0cmFuc3BvcnQ7XG5cdFx0dGhpcy5fdHJhbnNwb3J0TGlzdGVuZXJzLnZhbHVlID0gbGlzdGVuZXJzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYW5zaXRpb24gdG8gYSBuZXcge0BsaW5rIENsaWVudFN0YXRlfS4gRmlyZXMge0BsaW5rIG9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlfVxuXHQgKiBvbmx5IHdoZW4gdGhlIHZhcmlhbnQga2luZCBhY3R1YWxseSBjaGFuZ2VzOyBpbi1wbGFjZSBtdXRhdGlvbiBvZlxuXHQgKiByZWNvbm5lY3Qtc3RhdGUgZmllbGRzIChlLmcuIHN3YXBwaW5nIHRoZSBnYXRlIG9uIGEgZmFpbGVkIHJldHJ5KSBkb2VzXG5cdCAqIE5PVCBjb3VudCBhcyBhIHRyYW5zaXRpb24gYW5kIHByb2R1Y2VzIG5vIGV2ZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJhbnNpdGlvblRvKG5leHQ6IENsaWVudFN0YXRlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IG5leHQua2luZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZSA9IG5leHQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUuZmlyZShuZXh0LmtpbmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmV3UmVjb25uZWN0R2F0ZSgpOiBEZWZlcnJlZFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdC8vIEFsd2F5cy1hdHRhY2hlZCBoYW5kbGVyIHNvIGEgcmVqZWN0aW9uIHdpdGhvdXQgYW4gYXdhaXRlciAoZS5nLiBhXG5cdFx0Ly8gcmV0cnktZmFpbCBkdXJpbmcgdGhlIHJlY29ubmVjdCBSUEMgYnlwYXNzIHdpbmRvdykgZG9lc24ndCBnZXRcblx0XHQvLyBmbGFnZ2VkIGFzIHVuaGFuZGxlZC4gQWN0dWFsIGNvbnN1bWVycyBhdHRhY2ggdGhlaXIgb3duIGAudGhlbmAvYGF3YWl0YC5cblx0XHRkZWZlcnJlZC5wLnRoZW4odW5kZWZpbmVkLCAoKSA9PiB7IC8qIHN3YWxsb3cgXHUyMDE0IGVhY2ggcmVhbCBjb25zdW1lciBoYW5kbGVzIGl0cyBvd24gYXdhaXQgKi8gfSk7XG5cdFx0cmV0dXJuIGRlZmVycmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmV3UmVjb25uZWN0U3RhdGUoKTogSVJlY29ubmVjdFN0YXRlIHtcblx0XHRyZXR1cm4geyBnYXRlOiB0aGlzLl9uZXdSZWNvbm5lY3RHYXRlKCksIG91dGJveDogW10sIGF0dGVtcHQ6IDAsIHRpbWVvdXRIYW5kbGU6IHVuZGVmaW5lZCB9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9oYW5kbGVDbG9zZShjb25uZWN0aW9uRGlzcG9zZWRFcnJvcih0aGlzLl9hZGRyZXNzKSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbm5lY3QgdG8gdGhlIHJlbW90ZSBhZ2VudCBob3N0IGFuZCBwZXJmb3JtIHRoZSBwcm90b2NvbCBoYW5kc2hha2UuXG5cdCAqL1xuXHRhc3luYyBjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoaXNDbGllbnRUcmFuc3BvcnQodGhpcy5fdHJhbnNwb3J0KSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yYWNlQ2xvc2UodGhpcy5fdHJhbnNwb3J0LmNvbm5lY3QoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2Rpc3BhdGNoUmVxdWVzdDxDb21tYW5kTWFwWydpbml0aWFsaXplJ11bJ3Jlc3VsdCddPignaW5pdGlhbGl6ZScsIHtcblx0XHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdC8vIEFkdmVydGlzZSBldmVyeSB2ZXJzaW9uIHRoaXMgY2xpZW50IGNhbiBuZWdvdGlhdGUsIG1vc3QtcHJlZmVycmVkIGZpcnN0LCBzbyBhblxuXHRcdFx0XHQvLyBvbGRlciBob3N0IChhIGNsb3VkIHNhbmRib3ggcnVubmluZyBhIDAuNS54IGBjb3BpbG90ZGApIGNhbiBuZWdvdGlhdGUgZG93blxuXHRcdFx0XHQvLyBpbnN0ZWFkIG9mIHJlamVjdGluZyB0aGUgY29ubmVjdGlvbi4gQSBjdXJyZW50IGhvc3Qgc3RpbGwgcGlja3MgdGhlIG5ld2VzdC5cblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uczogWy4uLlNVUFBPUlRFRF9QUk9UT0NPTF9WRVJTSU9OU10sXG5cdFx0XHRcdGNsaWVudElkOiB0aGlzLl9jbGllbnRJZCxcblx0XHRcdFx0Y2xpZW50SW5mbzogdGhpcy5fY2xpZW50SW5mbyxcblx0XHRcdFx0aW5pdGlhbFN1YnNjcmlwdGlvbnM6IFtST09UX1NUQVRFX1VSSV0sXG5cdFx0XHR9LCB7IGJ5cGFzc0luaXRpYWxpemVRdWV1ZTogdHJ1ZSB9KTtcblx0XHRcdHRoaXMuX2FwcGx5SW5pdGlhbGl6ZVJlc3VsdChyZXN1bHQpO1xuXG5cdFx0XHQvLyBIeWRyYXRlIHJvb3Qgc3RhdGUgZnJvbSB0aGUgaW5pdGlhbCBzbmFwc2hvdFxuXHRcdFx0Zm9yIChjb25zdCBzbmFwc2hvdCBvZiByZXN1bHQuc25hcHNob3RzID8/IFtdKSB7XG5cdFx0XHRcdGlmIChpc0FocFJvb3RDaGFubmVsKHNuYXBzaG90LnJlc291cmNlKSkge1xuXHRcdFx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIuaGFuZGxlUm9vdFNuYXBzaG90KHNuYXBzaG90LnN0YXRlIGFzIFJvb3RTdGF0ZSwgc25hcHNob3QuZnJvbVNlcSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzQ2xpZW50VHJhbnNwb3J0KHRoaXMuX3RyYW5zcG9ydCkgJiYgdGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGluZykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgdGhpcy5fc3RhdGUub3V0Ym94KSB7XG5cdFx0XHRcdFx0dGhpcy5fdHJhbnNwb3J0LnNlbmQobWVzc2FnZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3RhdGUub3V0Ym94Lmxlbmd0aCA9IDA7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90cmFuc2l0aW9uVG8oeyBraW5kOiBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQgfSk7XG5cdFx0XHR0aGlzLl9yZXNldExpdmVuZXNzVGltZXJzKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IHByb3RvY29sRXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3Jcblx0XHRcdFx0PyBlcnJvclxuXHRcdFx0XHQ6IG5ldyBQcm90b2NvbEVycm9yKEFIUF9DTElFTlRfQ09OTkVDVElPTl9DTE9TRUQsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSk7XG5cdFx0XHRpZiAocHJvdG9jb2xFcnJvci5jb2RlID09PSBBaHBFcnJvckNvZGVzLlVuc3VwcG9ydGVkUHJvdG9jb2xWZXJzaW9uKSB7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbExpdmVuZXNzVGltZXJzKCk7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUub3V0Ym94Lmxlbmd0aCA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmVqZWN0UGVuZGluZ1JlcXVlc3RzKHByb3RvY29sRXJyb3IpO1xuXHRcdFx0XHR0aGlzLl90cmFuc2l0aW9uVG8oeyBraW5kOiBBZ2VudEhvc3RDbGllbnRTdGF0ZS5JbmNvbXBhdGlibGUsIGVycm9yOiBwcm90b2NvbEVycm9yIH0pO1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hhbmRsZUNsb3NlKHByb3RvY29sRXJyb3IpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEV4dGVybmFsbHkgc2lnbmFsIHRoYXQgdGhlIHRyYW5zcG9ydCBoYXMgY2xvc2VkLiBVc2VkIGJ5IHNlcnZpY2VzXG5cdCAqIG1hbmFnaW5nIGEgcGFzc2l2ZSB0cmFuc3BvcnQgKFNTSCAvIGRldi10dW5uZWxzKSB3aGVuIHRoZXkgb2JzZXJ2ZVxuXHQgKiBhIGNvbm5lY3Rpb24tbG9zcyBJUEMgZXZlbnQgaW5kZXBlbmRlbnQgb2YgdGhlIHRyYW5zcG9ydCdzIG93blxuXHQgKiBvbkNsb3NlIFx1MjAxNCB3aXRob3V0IHRoaXMsIGEgc2luZ2xlIGRyb3BwZWQgSVBDIGRlbGl2ZXJ5IG9uIHRoZVxuXHQgKiB0cmFuc3BvcnQncyBjbG9zZSBjaGFubmVsIGxlYXZlcyB0aGUgY2xpZW50IHN0cmFuZGVkIGluXG5cdCAqIGBDb25uZWN0ZWRgIHVudGlsIGl0cyB3YXRjaGRvZyBmaXJlcyAod2hpY2ggY2FuIHRha2UgaG91cnMgd2hlblxuXHQgKiB0aGUgcmVuZGVyZXIgaXMgYmFja2dyb3VuZGVkIGFuZCBgc2V0VGltZW91dGAgaXMgdGhyb3R0bGVkKS5cblx0ICpcblx0ICogSWRlbXBvdGVudCBcdTIwMTQgbm8tb3AgaWYgYWxyZWFkeSBjbG9zZWQgb3IgbWlkLXJlY29ubmVjdC5cblx0ICovXG5cdG5vdGlmeVRyYW5zcG9ydENsb3NlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9oYW5kbGVUcmFuc3BvcnRDbG9zZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCBmcm9tIHRoZSB0cmFuc3BvcnQncyBgb25DbG9zZWAgZXZlbnQuIFdoZW4gYSB7QGxpbmsgX3RyYW5zcG9ydEZhY3Rvcnl9XG5cdCAqIGlzIGNvbmZpZ3VyZWQgd2UgYXR0ZW1wdCB0byBzb2Z0LXJlY29ubmVjdCByYXRoZXIgdGhhbiBmaXJlIGBvbkRpZENsb3NlYCBcdTIwMTRcblx0ICogdGhlIHByb3RvY29sLWxldmVsIGByZWNvbm5lY3RgIHJlcXVlc3QgbGV0cyB0aGUgc2VydmVyIHJlcGxheSBtaXNzZWRcblx0ICogYWN0aW9ucyBhbmQgcHJlc2VydmVzIHRoZSBgY2xpZW50SWRgIHNvIHBlbmRpbmcgdG9vbCBjYWxscyBldGMuIGFyZSBub3Rcblx0ICogY2FuY2VsbGVkIGJ5IHRoZSBob3N0LXNpZGUgZGlzY29ubmVjdCB0aW1lb3V0LiBXaXRob3V0IGEgZmFjdG9yeVxuXHQgKiAocGFzc2l2ZS10cmFuc3BvcnQgU1NIL3JlbGF5IHBhdGgpIHdlIGZhbGwgYmFjayB0byBcImNsb3NlIG1lYW5zIGNsb3NlZFwiXG5cdCAqIGFuZCBsZXQgdGhlIHNlcnZpY2UgZGVjaWRlIHdoZXRoZXIgdG8gc3BpbiB1cCBhIGZyZXNoIGNsaWVudC5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZVRyYW5zcG9ydENsb3NlKCk6IHZvaWQge1xuXHRcdHN3aXRjaCAodGhpcy5fc3RhdGUua2luZCkge1xuXHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWQ6XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGluZzpcblx0XHRcdFx0Ly8gTm8gaGFuZHNoYWtlIHlldDsgd2UgY2FuJ3QgcmVzdW1lIHNvIGFsd2F5cyB0cmVhdCBhcyBmYXRhbFxuXHRcdFx0XHQvLyByZWdhcmRsZXNzIG9mIHdoZXRoZXIgYSBmYWN0b3J5IGlzIGNvbmZpZ3VyZWQuXG5cdFx0XHRcdHRoaXMuX2hhbmRsZUNsb3NlKGNvbm5lY3Rpb25DbG9zZWRFcnJvcih0aGlzLl9hZGRyZXNzKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlOlxuXHRcdFx0XHR0aGlzLl9oYW5kbGVDbG9zZShjb25uZWN0aW9uQ2xvc2VkRXJyb3IodGhpcy5fYWRkcmVzcykpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlIEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RlZDoge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3RyYW5zcG9ydEZhY3RvcnkpIHtcblx0XHRcdFx0XHQvLyBQYXNzaXZlLXRyYW5zcG9ydCBwYXRoIChTU0gvdHVubmVsKTogdGhlIHRyYW5zcG9ydFxuXHRcdFx0XHRcdC8vIGNhbid0IGJlIHJlY29uc3RydWN0ZWQgZnJvbSBoZXJlLCBzbyB3ZSBzdXJmYWNlIHRoZVxuXHRcdFx0XHRcdC8vIGNsb3NlIGFuZCBsZXQgdGhlIHNlcnZpY2UgZGVjaWRlIHdoZXRoZXIgdG8gc3BpbiB1cFxuXHRcdFx0XHRcdC8vIGEgZnJlc2ggY2xpZW50LlxuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZUNsb3NlKGNvbm5lY3Rpb25DbG9zZWRFcnJvcih0aGlzLl9hZGRyZXNzKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBUcmFuc3BvcnQgbG9zdCBmb3IgJHt0aGlzLl9hZGRyZXNzfTsgc2NoZWR1bGluZyByZWNvbm5lY3QuYCk7XG5cdFx0XHRcdHRoaXMuX3RyYW5zaXRpb25Ubyh7IGtpbmQ6IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZywgcmVjb25uZWN0OiB0aGlzLl9uZXdSZWNvbm5lY3RTdGF0ZSgpIH0pO1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxMaXZlbmVzc1RpbWVycygpO1xuXHRcdFx0XHQvLyBJbi1mbGlnaHQgcmVxdWVzdHMgY2FuJ3QgYmUgYW5zd2VyZWQgXHUyMDE0IHRoZSBuZXcgdHJhbnNwb3J0IGhhcyBhXG5cdFx0XHRcdC8vIHNlcGFyYXRlIHJlcXVlc3QtaWQgc3BhY2UuIFJlamVjdCB0aGVtIHNvIGNhbGxlcnMgY2FuIHJldHJ5LlxuXHRcdFx0XHR0aGlzLl9yZWplY3RQZW5kaW5nUmVxdWVzdHModHJhbnNwb3J0TG9zdEVycm9yKHRoaXMuX2FkZHJlc3MpKTtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVSZWNvbm5lY3QoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3Rpbmc6XG5cdFx0XHRcdC8vIEEgc2Vjb25kIHRyYW5zcG9ydCBkcm9wIHdoaWxlIGEgcmVjb25uZWN0IHdhcyBhbHJlYWR5IGluIGZsaWdodC5cblx0XHRcdFx0Ly8gUmVqZWN0IHRoZSBpbi1mbGlnaHQgYHJlY29ubmVjdGAgUlBDIHNvIGBfYXR0ZW1wdFJlY29ubmVjdGAnc1xuXHRcdFx0XHQvLyBjYXRjaCBwYXRoIHJ1bnMgYW5kIHNjaGVkdWxlcyB0aGUgbmV4dCBhdHRlbXB0IFx1MjAxNCByZXR1cm5pbmcgZWFybHlcblx0XHRcdFx0Ly8gd291bGQgbGVhdmUgdGhlIGF3YWl0IHBlbmRpbmcgZm9yZXZlciAoI2FnZW50LWhvc3QtZGVhZGxvY2spLlxuXHRcdFx0XHQvLyBTY2hlZHVsaW5nIGxpdmVzIGluIHRoZSBjYXRjaCBzbyB3ZSBkb24ndCBlbmQgdXAgd2l0aCB0d29cblx0XHRcdFx0Ly8gY29uY3VycmVudCBzZXRUaW1lb3V0cyByYWNpbmcgdG8gaW5zdGFsbCBuZXcgdHJhbnNwb3J0cy5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFRyYW5zcG9ydCBsb3N0IGZvciAke3RoaXMuX2FkZHJlc3N9IG1pZC1yZWNvbm5lY3Q7IGFib3J0aW5nIHRoZSBjdXJyZW50IGF0dGVtcHQuYCk7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbExpdmVuZXNzVGltZXJzKCk7XG5cdFx0XHRcdHRoaXMuX3JlamVjdFBlbmRpbmdSZXF1ZXN0cyh0cmFuc3BvcnRMb3N0RXJyb3IodGhpcy5fYWRkcmVzcykpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVSZWNvbm5lY3QoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZyB8fCAhdGhpcy5fdHJhbnNwb3J0RmFjdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZWNvbm5lY3QgPSB0aGlzLl9zdGF0ZS5yZWNvbm5lY3Q7XG5cdFx0aWYgKHJlY29ubmVjdC50aW1lb3V0SGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXR0ZW1wdCA9IHJlY29ubmVjdC5hdHRlbXB0ICsgMTtcblx0XHRjb25zdCBkZWxheSA9IE1hdGgubWluKFJFQ09OTkVDVF9JTklUSUFMX0RFTEFZX01TICogTWF0aC5wb3coMiwgYXR0ZW1wdCAtIDEpLCBSRUNPTk5FQ1RfTUFYX0RFTEFZX01TKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RQcm90b2NvbF0gUmVjb25uZWN0aW5nIHRvICR7dGhpcy5fYWRkcmVzc30gaW4gJHtkZWxheX1tcyAoYXR0ZW1wdCAke2F0dGVtcHR9KS5gKTtcblx0XHRyZWNvbm5lY3QudGltZW91dEhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZykge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5yZWNvbm5lY3QudGltZW91dEhhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHZvaWQgdGhpcy5fYXR0ZW1wdFJlY29ubmVjdCgpO1xuXHRcdH0sIGRlbGF5KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2F0dGVtcHRSZWNvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZyB8fCAhdGhpcy5fdHJhbnNwb3J0RmFjdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZWNvbm5lY3QgPSB0aGlzLl9zdGF0ZS5yZWNvbm5lY3Q7XG5cdFx0cmVjb25uZWN0LmF0dGVtcHQrKztcblx0XHRsZXQgdHJhbnNwb3J0OiBJUHJvdG9jb2xUcmFuc3BvcnQgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHRyYW5zcG9ydCA9IHRoaXMuX3RyYW5zcG9ydEZhY3RvcnkoKTtcblx0XHRcdHRoaXMuX2luc3RhbGxUcmFuc3BvcnQodHJhbnNwb3J0KTtcblx0XHRcdGlmIChpc0NsaWVudFRyYW5zcG9ydCh0cmFuc3BvcnQpKSB7XG5cdFx0XHRcdGF3YWl0IHRyYW5zcG9ydC5jb25uZWN0KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fc3RhdGUua2luZCAhPT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9ucyA9IHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIuY3VycmVudFN1YnNjcmlwdGlvblVyaXMoKS5tYXAodSA9PiB1LnRvU3RyaW5nKCkpO1xuXHRcdFx0Ly8gQWx3YXlzIGluY2x1ZGUgdGhlIGFsd2F5cy1saXZlIHJvb3Qgc3RhdGUgYWxvbmdzaWRlIGdldFN1YnNjcmlwdGlvbi1tYW5hZ2VkIGVudHJpZXMuXG5cdFx0XHRpZiAoIXN1YnNjcmlwdGlvbnMuaW5jbHVkZXMoUk9PVF9TVEFURV9VUkkpKSB7XG5cdFx0XHRcdHN1YnNjcmlwdGlvbnMudW5zaGlmdChST09UX1NUQVRFX1VSSSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsYXN0U2VlblNlcnZlclNlcSA9IHRoaXMuX3NlcnZlclNlcTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3JlY29ubmVjdE9ySW5pdGlhbGl6ZShsYXN0U2VlblNlcnZlclNlcSwgc3Vic2NyaXB0aW9ucyk7XG5cblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9hcHBseVJlY29ubmVjdFJlc3VsdChyZXN1bHQpO1xuXG5cdFx0XHQvLyBEcmFpbiB0aGUgb3V0Ym94IEJFRk9SRSB0aGUgdHJhbnNpdGlvbiBzbyBsaXN0ZW5lcnMgcmVhY3RpbmcgdG9cblx0XHRcdC8vIHtAbGluayBvbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZX0gdGhhdCBzeW5jaHJvbm91c2x5IGRpc3BhdGNoIHNlZVxuXHRcdFx0Ly8gc3RhdGU9Q29ubmVjdGVkIGFuZCBnbyBkaXJlY3QsIGxhbmRpbmcgYWZ0ZXIgdGhlIGRyYWluZWQgb3V0Ym94XG5cdFx0XHQvLyBpbiB3aXJlIG9yZGVyLlxuXHRcdFx0Y29uc3QgeyBnYXRlIH0gPSByZWNvbm5lY3Q7XG5cdFx0XHR0aGlzLl9kcmFpbkFmdGVyUmVjb25uZWN0KHJlY29ubmVjdC5vdXRib3gpO1xuXG5cdFx0XHR0aGlzLl9sYXN0UmVhZFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0dGhpcy5fcmVzZXRMaXZlbmVzc1RpbWVycygpO1xuXHRcdFx0dGhpcy5fdHJhbnNpdGlvblRvKHsga2luZDogQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkIH0pO1xuXHRcdFx0Z2F0ZS5jb21wbGV0ZSgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFJlY29ubmVjdGVkIHRvICR7dGhpcy5fYWRkcmVzc30uYCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtSZW1vdGVBZ2VudEhvc3RQcm90b2NvbF0gUmVjb25uZWN0IGF0dGVtcHQgZmFpbGVkIGZvciAke3RoaXMuX2FkZHJlc3N9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdHRyYW5zcG9ydD8uZGlzcG9zZSgpO1xuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgIT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBSZXBsYWNlIHRoZSBnYXRlIHNvIGF3YWl0aW5nIGNhbGxlcnMgc2VlIHRoZSBmYWlsdXJlIGJ1dCBuZXdcblx0XHRcdC8vIGNhbGxlcnMgZ2F0ZSBvbiB0aGUgbmV4dCBhdHRlbXB0IGluc3RlYWQgb2Ygc2xpcHBpbmcgdGhyb3VnaCBvbnRvXG5cdFx0XHQvLyB0aGUgZGVhZCB0cmFuc3BvcnQuIE91dGJveCBjYXJyaWVzIGZvcndhcmQgdG8gdGhlIG5leHQgYXR0ZW1wdC5cblx0XHRcdGNvbnN0IG9sZEdhdGUgPSB0aGlzLl9zdGF0ZS5yZWNvbm5lY3QuZ2F0ZTtcblx0XHRcdHRoaXMuX3N0YXRlLnJlY29ubmVjdC5nYXRlID0gdGhpcy5fbmV3UmVjb25uZWN0R2F0ZSgpO1xuXHRcdFx0b2xkR2F0ZS5lcnJvcihlcnIpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVSZWNvbm5lY3QoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvbm5lY3RPckluaXRpYWxpemUobGFzdFNlZW5TZXJ2ZXJTZXE6IG51bWJlciwgc3Vic2NyaXB0aW9uczogc3RyaW5nW10pOiBQcm9taXNlPENvbW1hbmRNYXBbJ3JlY29ubmVjdCddWydyZXN1bHQnXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZGlzcGF0Y2hSZXF1ZXN0PENvbW1hbmRNYXBbJ3JlY29ubmVjdCddWydyZXN1bHQnXT4oJ3JlY29ubmVjdCcsIHtcblx0XHRcdFx0Y2xpZW50SWQ6IHRoaXMuX2NsaWVudElkLFxuXHRcdFx0XHRsYXN0U2VlblNlcnZlclNlcSxcblx0XHRcdFx0c3Vic2NyaXB0aW9ucyxcblx0XHRcdH0sIHsgYnlwYXNzUmVjb25uZWN0R2F0ZTogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCEoZXJyb3IgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yKSB8fCBlcnJvci5jb2RlICE9PSBBaHBFcnJvckNvZGVzLk5vdEZvdW5kKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBTZXJ2ZXIgZm9yZ290IGNsaWVudCAke3RoaXMuX2NsaWVudElkfTsgaW5pdGlhbGl6aW5nIGEgZnJlc2ggY29ubmVjdGlvbi5gKTtcblx0XHRjb25zdCBpbml0aWFsaXplUmVzdWx0ID0gYXdhaXQgdGhpcy5fZGlzcGF0Y2hSZXF1ZXN0PENvbW1hbmRNYXBbJ2luaXRpYWxpemUnXVsncmVzdWx0J10+KCdpbml0aWFsaXplJywge1xuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRwcm90b2NvbFZlcnNpb25zOiBbLi4uU1VQUE9SVEVEX1BST1RPQ09MX1ZFUlNJT05TXSxcblx0XHRcdGNsaWVudElkOiB0aGlzLl9jbGllbnRJZCxcblx0XHRcdGNsaWVudEluZm86IHRoaXMuX2NsaWVudEluZm8sXG5cdFx0XHRpbml0aWFsU3Vic2NyaXB0aW9uczogc3Vic2NyaXB0aW9ucyxcblx0XHR9LCB7IGJ5cGFzc1JlY29ubmVjdEdhdGU6IHRydWUgfSk7XG5cdFx0dGhpcy5fYXBwbHlJbml0aWFsaXplUmVzdWx0KGluaXRpYWxpemVSZXN1bHQpO1xuXHRcdHJldHVybiB7IHR5cGU6IFJlY29ubmVjdFJlc3VsdFR5cGUuU25hcHNob3QsIHNuYXBzaG90czogaW5pdGlhbGl6ZVJlc3VsdC5zbmFwc2hvdHMgPz8gW10gfTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5SW5pdGlhbGl6ZVJlc3VsdChyZXN1bHQ6IENvbW1hbmRNYXBbJ2luaXRpYWxpemUnXVsncmVzdWx0J10pOiB2b2lkIHtcblx0XHR0aGlzLl9pbml0aWFsaXplUmVzdWx0LnNldChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc2VydmVyU2VxID0gcmVzdWx0LnNlcnZlclNlcTtcblx0XHRpZiAocmVzdWx0LmRlZmF1bHREaXJlY3RvcnkpIHtcblx0XHRcdGNvbnN0IGRpcmVjdG9yeSA9IHJlc3VsdC5kZWZhdWx0RGlyZWN0b3J5O1xuXHRcdFx0dGhpcy5fZGVmYXVsdERpcmVjdG9yeSA9IHR5cGVvZiBkaXJlY3RvcnkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKGRpcmVjdG9yeSkucGF0aCA6IFVSSS5yZXZpdmUoZGlyZWN0b3J5KS5wYXRoO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVUZWxlbWV0cnlMZXZlbCgpO1xuXHRcdHRoaXMuX3VwZGF0ZUVkaXRUZWxlbWV0cnlFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlU2Vzc2lvblN5bmNFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlVGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWQoKTtcblx0XHR0aGlzLl91cGRhdGVHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWQoKTtcblx0XHR0aGlzLl91cGRhdGVBdXRvUmVwbHlFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlUHJlZmVyTG9uZ0NvbnRleHRFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlU3lzdGVtUHJveHlFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlQ29waWxvdE11bHRpUm9vdEVuYWJsZWQoKTtcblx0XHR0aGlzLl91cGRhdGVDbGF1ZGVNdWx0aVJvb3RFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlQ29kZXhNdWx0aVJvb3RFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlVGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzKCk7XG5cdFx0dGhpcy5fdXBkYXRlQ29kZXhFbmFibGVkKCk7XG5cdFx0dGhpcy5fdXBkYXRlRGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5KCk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgYSBgcmVjb25uZWN0YCBSUEMgcmVzdWx0IHRvIHRoZSBzdWJzY3JpcHRpb24gbWFuYWdlci4gT24gYHJlcGxheWBcblx0ICogd2UgZmVlZCBlYWNoIG1pc3NlZCBlbnZlbG9wZSB0aHJvdWdoIHRoZSBub3JtYWwgYWN0aW9uIHBhdGg7IG9uXG5cdCAqIGBzbmFwc2hvdGAgd2UgcmVzZWF0IGVhY2ggbmFtZWQgc3Vic2NyaXB0aW9uIHdpdGggdGhlIGZyZXNoIHN0YXRlIGFuZFxuXHQgKiBhZHZhbmNlIHRoZSBzZXJ2ZXIgc2VxIGN1cnNvciBhY2NvcmRpbmdseS5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5UmVjb25uZWN0UmVzdWx0KHJlc3VsdDogQ29tbWFuZE1hcFsncmVjb25uZWN0J11bJ3Jlc3VsdCddKTogdm9pZCB7XG5cdFx0aWYgKHJlc3VsdC50eXBlID09PSBSZWNvbm5lY3RSZXN1bHRUeXBlLlJlcGxheSkge1xuXHRcdFx0bGV0IG1heFNlcSA9IHRoaXMuX3NlcnZlclNlcTtcblx0XHRcdGZvciAoY29uc3QgZW52ZWxvcGUgb2YgcmVzdWx0LmFjdGlvbnMpIHtcblx0XHRcdFx0Ly8gRm9yIG93biBub24tcmVqZWN0ZWQgYWN0aW9ucywgZHJvcCB0aGUgbWF0Y2hpbmcgcGVuZGluZyBlbnRyeSB1cFxuXHRcdFx0XHQvLyBmcm9udCBzbyB3ZSBkb24ndCByZXNlbmQgaXQgdmlhIHtAbGluayBfcmVwbGF5UGVuZGluZ0FjdGlvbnN9LlxuXHRcdFx0XHQvLyBGb3IgcmVqZWN0ZWQgYWN0aW9ucyB3ZSBNVVNUIGxlYXZlIHRoZSBlbnRyeSBpbiBwbGFjZSBzbyB0aGVcblx0XHRcdFx0Ly8gc3Vic2NyaXB0aW9uJ3MgcmVjb25jaWxlIHBhdGggc2VlcyBgaWR4ICE9PSAtMWAgYW5kIGRpc2NhcmRzXG5cdFx0XHRcdC8vIHRoZSBhY3Rpb24gaW5zdGVhZCBvZiBhcHBseWluZyBpdCB0byBjb25maXJtZWQgc3RhdGUuXG5cdFx0XHRcdGlmIChlbnZlbG9wZS5vcmlnaW4/LmNsaWVudElkID09PSB0aGlzLl9jbGllbnRJZFxuXHRcdFx0XHRcdCYmIGVudmVsb3BlLm9yaWdpbi5jbGllbnRTZXEgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdCYmICFlbnZlbG9wZS5yZWplY3Rpb25SZWFzb24pIHtcblx0XHRcdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25NYW5hZ2VyLmRyb3BQZW5kaW5nU2Vzc2lvbkFjdGlvbihlbnZlbG9wZS5jaGFubmVsLCBlbnZlbG9wZS5vcmlnaW4uY2xpZW50U2VxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZW52ZWxvcGUuc2VydmVyU2VxID4gbWF4U2VxKSB7XG5cdFx0XHRcdFx0bWF4U2VxID0gZW52ZWxvcGUuc2VydmVyU2VxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29uRGlkQWN0aW9uLmZpcmUoZW52ZWxvcGUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2VydmVyU2VxID0gbWF4U2VxO1xuXHRcdFx0aWYgKHJlc3VsdC5taXNzaW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFNlcnZlciBjYW5ub3QgcmVzdW1lICR7cmVzdWx0Lm1pc3NpbmcubGVuZ3RofSBzdWJzY3JpcHRpb24ocykgYWZ0ZXIgcmVjb25uZWN0LmApO1xuXHRcdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25NYW5hZ2VyLm1hcmtTdWJzY3JpcHRpb25zTWlzc2luZyhyZXN1bHQubWlzc2luZy5tYXAodSA9PiBVUkkucGFyc2UodSkpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IG1heFNlcSA9IHRoaXMuX3NlcnZlclNlcTtcblx0XHRcdGZvciAoY29uc3Qgc25hcHNob3Qgb2YgcmVzdWx0LnNuYXBzaG90cykge1xuXHRcdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25NYW5hZ2VyLmFwcGx5UmVjb25uZWN0U25hcHNob3Qoc25hcHNob3QucmVzb3VyY2UsIHNuYXBzaG90LnN0YXRlLCBzbmFwc2hvdC5mcm9tU2VxKTtcblx0XHRcdFx0aWYgKHNuYXBzaG90LmZyb21TZXEgPiBtYXhTZXEpIHtcblx0XHRcdFx0XHRtYXhTZXEgPSBzbmFwc2hvdC5mcm9tU2VxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXJ2ZXJTZXEgPSBtYXhTZXE7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERyYWluIHF1ZXVlZCBvdXRnb2luZyB3aXJlIHRyYWZmaWMgYWZ0ZXIgYSBzdWNjZXNzZnVsIHNvZnQgcmVjb25uZWN0OlxuXHQgKlxuXHQgKiAxLiBSZXNlbmQgcGVuZGluZyBvcHRpbWlzdGljIHNlc3Npb24gYWN0aW9ucyB0aGF0IHRoZSBzZXJ2ZXIgZGlkIE5PVFxuXHQgKiAgICBlY2hvIGJhY2sgaW4gdGhlIHJlcGxheSBidWZmZXIgKGkuZS4gYW55dGhpbmcgc3RpbGwgb25cblx0ICogICAge0BsaW5rIEFnZW50U3Vic2NyaXB0aW9uTWFuYWdlci5nZXRQZW5kaW5nU2Vzc2lvbkFjdGlvbnN9KS5cblx0ICogMi4gRmx1c2ggZXZlcnkgbWVzc2FnZSB0aGF0IHtAbGluayBfc2VuZE5vdGlmaWNhdGlvbn0gcXVldWVkIG9udG8gdGhlXG5cdCAqICAgIG91dGJveCB3aGlsZSB0aGUgZ2F0ZSB3YXMgZW5nYWdlZC5cblx0ICpcblx0ICogUmVwbGF5cyBhcmUgZGVkdXBlZCBhZ2FpbnN0IHRoZSBvdXRib3ggYnkgYGNsaWVudFNlcWAgc28gYSBzZXNzaW9uXG5cdCAqIGFjdGlvbiB0aGF0IHdhcyBib3RoIG9wdGltaXN0aWMtdHJhY2tlZCBBTkQgcXVldWVkIGR1cmluZyB0aGVcblx0ICogcmVjb25uZWN0IHdpbmRvdyBvbmx5IGdvZXMgb3V0IG9uY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9kcmFpbkFmdGVyUmVjb25uZWN0KG91dGJveDogcmVhZG9ubHkgUHJvdG9jb2xNZXNzYWdlW10pOiB2b2lkIHtcblx0XHQvLyBCdWlsZCB0aGUgc2V0IG9mIGNsaWVudFNlcXMgYWxyZWFkeSByZXByZXNlbnRlZCBpbiB0aGUgb3V0Ym94IHNvIHdlXG5cdFx0Ly8gZG9uJ3QgcmVwbGF5IGEgZHVwbGljYXRlLiBPbmx5IGBkaXNwYXRjaEFjdGlvbmAgbm90aWZpY2F0aW9ucyBjYXJyeVxuXHRcdC8vIGEgY2xpZW50U2VxOyBub3RoaW5nIGVsc2UgaXMgaW5kZXBlbmRlbnRseSByZS1lbWl0dGVkIGJ5IHRoZSByZXBsYXlcblx0XHQvLyBwYXRoLCBzbyBvdGhlciBxdWV1ZWQgbWVzc2FnZSBraW5kcyBuZWVkIG5vIGRlZHVwLlxuXHRcdGNvbnN0IHF1ZXVlZFNlcXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRmb3IgKGNvbnN0IG1zZyBvZiBvdXRib3gpIHtcblx0XHRcdGlmIChoYXNLZXkobXNnLCB7IG1ldGhvZDogdHJ1ZSB9KSAmJiBtc2cubWV0aG9kID09PSAnZGlzcGF0Y2hBY3Rpb24nKSB7XG5cdFx0XHRcdHF1ZXVlZFNlcXMuYWRkKG1zZy5wYXJhbXMuY2xpZW50U2VxKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXBsYXlzOiBQcm90b2NvbE1lc3NhZ2VbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5nZXRQZW5kaW5nU2Vzc2lvbkFjdGlvbnMoKSkge1xuXHRcdFx0aWYgKHF1ZXVlZFNlcXMuaGFzKGVudHJ5LmNsaWVudFNlcSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ncmFudEltcGxpY2l0UmVhZHNGb3JPdXRnb2luZ0FjdGlvbihlbnRyeS5hY3Rpb24pO1xuXHRcdFx0cmVwbGF5cy5wdXNoKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdG1ldGhvZDogJ2Rpc3BhdGNoQWN0aW9uJyxcblx0XHRcdFx0cGFyYW1zOiB7IGNoYW5uZWw6IGVudHJ5LmNoYW5uZWwsIGNsaWVudFNlcTogZW50cnkuY2xpZW50U2VxLCBhY3Rpb246IGVudHJ5LmFjdGlvbiB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlcGxheXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFJlcGxheWluZyAke3JlcGxheXMubGVuZ3RofSBwZW5kaW5nIGFjdGlvbihzKSBhZnRlciByZWNvbm5lY3QgdG8gJHt0aGlzLl9hZGRyZXNzfS5gKTtcblx0XHR9XG5cblx0XHQvLyBSZXBsYXlzIGZpcnN0IChkaXNwYXRjaGVkIGJlZm9yZSB0aGUgcmVjb25uZWN0IHdpbmRvdyksIHRoZW4gdGhlXG5cdFx0Ly8gb3V0Ym94IChkaXNwYXRjaGVkIGR1cmluZyBpdCkgc28gd2lyZSBvcmRlciByb3VnaGx5IHRyYWNrc1xuXHRcdC8vIGRpc3BhdGNoIG9yZGVyLlxuXHRcdGZvciAoY29uc3QgbXNnIG9mIHJlcGxheXMpIHtcblx0XHRcdHRoaXMuX3RyYW5zcG9ydC5zZW5kKG1zZyk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbXNnIG9mIG91dGJveCkge1xuXHRcdFx0dGhpcy5fdHJhbnNwb3J0LnNlbmQobXNnKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIElBZ2VudENvbm5lY3Rpb24gc3Vic2NyaXB0aW9uIEFQSSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Z2V0IHJvb3RTdGF0ZSgpOiBJQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIucm9vdFN0YXRlO1xuXHR9XG5cblx0Z2V0U3Vic2NyaXB0aW9uPFQ+KGtpbmQ6IFN0YXRlQ29tcG9uZW50cywgcmVzb3VyY2U6IFVSSSwgb3duZXI6IHN0cmluZyk6IElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPFQ+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIuZ2V0U3Vic2NyaXB0aW9uPFQ+KGtpbmQsIHJlc291cmNlLCBvd25lcik7XG5cdH1cblxuXHRnZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQ8VD4oX2tpbmQ6IFN0YXRlQ29tcG9uZW50cywgcmVzb3VyY2U6IFVSSSk6IElBZ2VudFN1YnNjcmlwdGlvbjxUPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIuZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFQ+KHJlc291cmNlKTtcblx0fVxuXG5cdGdldEluZmxpZ2h0U2Vzc2lvbkNyZWF0ZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbk1hbmFnZXIuZ2V0SW5mbGlnaHRTZXNzaW9uQ3JlYXRlKHJlc291cmNlKTtcblx0fVxuXG5cdHRyYWNrU2Vzc2lvbkNyZWF0ZShyZXNvdXJjZTogVVJJLCBwcm9taXNlOiBQcm9taXNlPHVua25vd24+KTogdm9pZCB7XG5cdFx0dGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci50cmFja1Nlc3Npb25DcmVhdGUocmVzb3VyY2UsIHByb21pc2UpO1xuXHR9XG5cblx0Z2V0QWN0aXZlU3Vic2NyaXB0aW9ucygpOiByZWFkb25seSBJQWN0aXZlU3Vic2NyaXB0aW9uSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5nZXRBY3RpdmVTdWJzY3JpcHRpb25zKCk7XG5cdH1cblxuXHRkaXNwYXRjaChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudENoYW5nZXNldEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VxID0gdGhpcy5fc3Vic2NyaXB0aW9uTWFuYWdlci5kaXNwYXRjaE9wdGltaXN0aWMoY2hhbm5lbCwgYWN0aW9uKTtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKGNoYW5uZWwsIGFjdGlvbiwgdGhpcy5fY2xpZW50SWQsIHNlcSk7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2NyaWJlIHRvIHN0YXRlIGF0IGEgVVJJLiBSZXR1cm5zIHRoZSBjdXJyZW50IHN0YXRlIHNuYXBzaG90LlxuXHQgKlxuXHQgKiBGb3Igc3RhdGVsZXNzIGNoYW5uZWxzIChlLmcuIGBhaHAtb3RscDpgIHRlbGVtZXRyeSBjaGFubmVscykgdXNlXG5cdCAqIHtAbGluayBzdWJzY3JpYmVTdGF0ZWxlc3N9IFx1MjAxNCBjYWxsaW5nIHRoaXMgbWV0aG9kIG9uIGEgc3RhdGVsZXNzXG5cdCAqIGNoYW5uZWwgcmVqZWN0cyBiZWNhdXNlIHRoZSBzZXJ2ZXIgb21pdHMgYHNuYXBzaG90YCBvbiB0aGVcblx0ICogcmVzcG9uc2UuXG5cdCAqL1xuXHRhc3luYyBzdWJzY3JpYmUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVN0YXRlU25hcHNob3Q+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdCgnc3Vic2NyaWJlJywgeyBjaGFubmVsOiByZXNvdXJjZS50b1N0cmluZygpIH0pO1xuXHRcdGlmICghcmVzdWx0LnNuYXBzaG90KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHN1YnNjcmliZSB0byAke3Jlc291cmNlLnRvU3RyaW5nKCl9IHJldHVybmVkIG5vIHNuYXBzaG90YCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQuc25hcHNob3Q7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2NyaWJlIHRvIGEgc3RhdGVsZXNzIGNoYW5uZWwgXHUyMDE0IG9uZSBmb3Igd2hpY2ggdGhlIHNlcnZlciBkb2VzXG5cdCAqIG5vdCBtYWludGFpbiByZXBsYXlhYmxlIHN0YXRlIGFuZCB0aGVyZWZvcmUgb21pdHMgYHNuYXBzaG90YCBmcm9tXG5cdCAqIHRoZSBgc3Vic2NyaWJlYCByZXNwb25zZS4gVXNlZCB0b2RheSBmb3IgdGhlIGhvc3QncyBPVExQIHRlbGVtZXRyeVxuXHQgKiBjaGFubmVscyAoYGFocC1vdGxwOmApLlxuXHQgKlxuXHQgKiBSZXR1cm5zIG9uY2UgdGhlIHN1YnNjcmlwdGlvbiBpcyBjb25maXJtZWQgYnkgdGhlIHNlcnZlci5cblx0ICogU3Vic2VxdWVudCBub3RpZmljYXRpb25zIG9uIHRoZSBjaGFubmVsIGFycml2ZSB2aWEgdGhlIHJlbGV2YW50XG5cdCAqIGRpc3BhdGNoIGV2ZW50IChlLmcuIHtAbGluayBvbkRpZFJlY2VpdmVPdGxwTG9nc30gZm9yIGxvZyByZWNvcmRzKS5cblx0ICovXG5cdGFzeW5jIHN1YnNjcmliZVN0YXRlbGVzcyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fc2VuZFJlcXVlc3QoJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcmVzb3VyY2UudG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVbnN1YnNjcmliZSBmcm9tIHN0YXRlIGF0IGEgVVJJLlxuXHQgKi9cblx0dW5zdWJzY3JpYmUocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbmROb3RpZmljYXRpb24oJ3Vuc3Vic2NyaWJlJywgeyBjaGFubmVsOiByZXNvdXJjZS50b1N0cmluZygpIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3BhdGNoIGEgY2xpZW50IGFjdGlvbiB0byB0aGUgc2VydmVyLiBSZXR1cm5zIHRoZSBjbGllbnRTZXEgdXNlZC5cblx0ICovXG5cdHByaXZhdGUgZGlzcGF0Y2hBY3Rpb24oY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgX2NsaWVudElkOiBzdHJpbmcsIGNsaWVudFNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZ3JhbnRJbXBsaWNpdFJlYWRzRm9yT3V0Z29pbmdBY3Rpb24oYWN0aW9uKTtcblx0XHR0aGlzLl9zZW5kTm90aWZpY2F0aW9uKCdkaXNwYXRjaEFjdGlvbicsIHsgY2hhbm5lbCwgY2xpZW50U2VxLCBhY3Rpb24gfSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHNlc3Npb24gb24gdGhlIHJlbW90ZSBhZ2VudCBob3N0LlxuXHQgKi9cblx0Y3JlYXRlU2Vzc2lvbihjb25maWc/OiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNvbmZpZz8ucHJvdmlkZXI7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY3JlYXRlIHJlbW90ZSBhZ2VudCBob3N0IHNlc3Npb24gd2l0aG91dCBhIHByb3ZpZGVyLicpO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gY29uZmlnPy5zZXNzaW9uID8/IEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIsIGdlbmVyYXRlVXVpZCgpKTtcblx0XHRpZiAoY29uZmlnPy5hY3RpdmVDbGllbnQ/LmN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHR0aGlzLl9ncmFudEltcGxpY2l0UmVhZHNGb3JDdXN0b21pemF0aW9ucyhjb25maWcuYWN0aXZlQ2xpZW50LmN1c3RvbWl6YXRpb25zKTtcblx0XHR9XG5cdFx0Ly8gVXNlIGAudGhlbmAgKG5vdCBgYXN5bmNgKSBzbyB0aGUgdHJhY2tlZCBwcm9taXNlIGFuZCB0aGUgcmV0dXJuZWQgcHJvbWlzZSBhcmUgdGhlIHNhbWUgb2JqZWN0IFx1MjAxNCBjYWxsZXJzXG5cdFx0Ly8gYXdhaXRpbmcgdmlhIGBnZXRJbmZsaWdodFNlc3Npb25DcmVhdGVgIHJlc3VtZSBvbiB0aGUgc2FtZSBtaWNyb3Rhc2sgcXVldWUgYXMgZGlyZWN0IGBjcmVhdGVTZXNzaW9uKClgIGF3YWl0ZXJzLlxuXHRcdGNvbnN0IHByb21pc2UgPSB0aGlzLl9zZW5kUmVxdWVzdCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBjb25maWc/LndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gZnJvbUFnZW50SG9zdFVyaShkKS50b1N0cmluZygpKSxcblx0XHRcdGZvcms6IGNvbmZpZz8uZm9yayA/IHsgc2Vzc2lvbjogZnJvbUFnZW50SG9zdFVyaShjb25maWcuZm9yay5zZXNzaW9uKS50b1N0cmluZygpLCB0dXJuSWQ6IGNvbmZpZy5mb3JrLnR1cm5JZCB9IDogdW5kZWZpbmVkLFxuXHRcdFx0Y29uZmlnOiBjb25maWc/LmNvbmZpZyxcblx0XHRcdGFjdGl2ZUNsaWVudDogY29uZmlnPy5hY3RpdmVDbGllbnQsXG5cdFx0XHRwcm9ncmVzc1Rva2VuOiBjb25maWc/LnByb2dyZXNzVG9rZW4sXG5cdFx0fSkudGhlbigoKSA9PiBzZXNzaW9uKTtcblx0XHR0aGlzLl9zdWJzY3JpcHRpb25NYW5hZ2VyLnRyYWNrU2Vzc2lvbkNyZWF0ZShzZXNzaW9uLCBwcm9taXNlKTtcblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVTZXNzaW9uQ29uZmlnKHBhcmFtczogSUFnZW50UmVzb2x2ZVNlc3Npb25Db25maWdQYXJhbXMpOiBQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRSZXF1ZXN0KCdyZXNvbHZlU2Vzc2lvbkNvbmZpZycsIHtcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0cHJvdmlkZXI6IHBhcmFtcy5wcm92aWRlcixcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHBhcmFtcy53b3JraW5nRGlyZWN0b3J5ID8gZnJvbUFnZW50SG9zdFVyaShwYXJhbXMud29ya2luZ0RpcmVjdG9yeSkudG9TdHJpbmcoKSA6IHVuZGVmaW5lZCxcblx0XHRcdGNvbmZpZzogcGFyYW1zLmNvbmZpZyxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHNlc3Npb25Db25maWdDb21wbGV0aW9ucyhwYXJhbXM6IElBZ2VudFNlc3Npb25Db25maWdDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRSZXF1ZXN0KCdzZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMnLCB7XG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHByb3ZpZGVyOiBwYXJhbXMucHJvdmlkZXIsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBwYXJhbXMud29ya2luZ0RpcmVjdG9yeSA/IGZyb21BZ2VudEhvc3RVcmkocGFyYW1zLndvcmtpbmdEaXJlY3RvcnkpLnRvU3RyaW5nKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maWc6IHBhcmFtcy5jb25maWcsXG5cdFx0XHRwcm9wZXJ0eTogcGFyYW1zLnByb3BlcnR5LFxuXHRcdFx0cXVlcnk6IHBhcmFtcy5xdWVyeSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNvbXBsZXRpb25zKHBhcmFtczogQ29tcGxldGlvbnNQYXJhbXMpOiBQcm9taXNlPENvbXBsZXRpb25zUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRSZXF1ZXN0KCdjb21wbGV0aW9ucycsIHBhcmFtcyk7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCBhbiBhcHBsaWNhdGlvbi1sZXZlbCBwaW5nIGFuZCB3YWl0IGZvciB0aGUgc2VydmVyJ3MgcmVzcG9uc2UuXG5cdCAqIFVzZWQgYnkge0BsaW5rIF93YXRjaGRvZ1RpY2t9IHRvIGtlZXAgaWRsZSBjb25uZWN0aW9ucyB1bmRlclxuXHQgKiB3YXRjaGRvZyBzdXBlcnZpc2lvbjsgc2FmZSB0byBjYWxsIGZyb20gZXh0ZXJuYWwgY29kZSBhcyB3ZWxsLlxuXHQgKlxuXHQgKiBUaGUgcmV0dXJuZWQgcHJvbWlzZSByZWplY3RzIHdpdGggYSB7QGxpbmsgUHJvdG9jb2xFcnJvcn0gaWYgdGhlXG5cdCAqIGNvbm5lY3Rpb24gY2xvc2VzIGJlZm9yZSBhIHJlc3BvbnNlIGFycml2ZXMuXG5cdCAqL1xuXHRhc3luYyBwaW5nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdwaW5nJywgeyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB0cmlnZ2VyIGNoYXJhY3RlcnMgY2FwdHVyZWQgZnJvbSB0aGUgYGluaXRpYWxpemVgIGhhbmRzaGFrZS5cblx0ICogRW1wdHkgd2hlbiB0aGUgcmVtb3RlIGhvc3QgZGlkIG5vdCBhbm5vdW5jZSBhbnkuXG5cdCAqL1xuXHRhc3luYyBnZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4ge1xuXHRcdHdoaWxlICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0aW5nKSB7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGhpcy5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSk7XG5cdFx0fVxuXHRcdHN3aXRjaCAodGhpcy5fc3RhdGUua2luZCkge1xuXHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5JbmNvbXBhdGlibGU6XG5cdFx0XHRjYXNlIEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZDpcblx0XHRcdFx0dGhyb3cgdGhpcy5fc3RhdGUuZXJyb3I7XG5cdFx0XHRjYXNlIEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RlZDpcblx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faW5pdGlhbGl6ZVJlc3VsdC5nZXQoKT8uY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzID8/IFtdO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBdXRoZW50aWNhdGUgd2l0aCB0aGUgcmVtb3RlIGFnZW50IGhvc3QgdXNpbmcgYSBzcGVjaWZpYyBzY2hlbWUuXG5cdCAqL1xuXHRhc3luYyBhdXRoZW50aWNhdGUocGFyYW1zOiBBdXRoZW50aWNhdGVQYXJhbXMpOiBQcm9taXNlPEF1dGhlbnRpY2F0ZVJlc3VsdD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdhdXRoZW50aWNhdGUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCAuLi5wYXJhbXMsIHNjb3BlczogcGFyYW1zLnNjb3BlcyA/IFsuLi5wYXJhbXMuc2NvcGVzXSA6IHVuZGVmaW5lZCB9KTtcblx0XHRyZXR1cm4geyBhdXRoZW50aWNhdGVkOiB0cnVlIH07XG5cdH1cblxuXHQvKipcblx0ICogR3JhY2VmdWxseSBzaHV0IGRvd24gYWxsIHNlc3Npb25zIG9uIHRoZSByZW1vdGUgaG9zdC5cblx0ICovXG5cdGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRFeHRlbnNpb25SZXF1ZXN0KCdzaHV0ZG93bicpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgdGhlIGVuZHBvaW50cyB0aGUgcmVtb3RlIGFnZW50IGhvc3Qgc3VnZ2VzdHMgcHJvYmluZyBmb3IgY29ubmVjdGl2aXR5LlxuXHQgKi9cblx0YXN5bmMgZ2V0TmV0d29ya0RpYWdub3N0aWNzSW5mbygpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRGlhZ25vc3RpY3NJbmZvPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRFeHRlbnNpb25SZXF1ZXN0KCdnZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvJyk7XG5cdH1cblxuXHRhc3luYyBnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcygpOiBQcm9taXNlPHJlYWRvbmx5IElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljc1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRFeHRlbnNpb25SZXF1ZXN0KCdnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2JlIGNvbm5lY3Rpdml0eSBmcm9tIHRoZSByZW1vdGUgYWdlbnQgaG9zdCB0byBhIHNpbmdsZSBgdXJsYC5cblx0ICovXG5cdGFzeW5jIGRpYWdub3N0aWNzRmV0Y2godXJsOiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZEV4dGVuc2lvblJlcXVlc3QoJ2RpYWdub3N0aWNzRmV0Y2gnLCB7IHVybCB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIGEgc2Vzc2lvbiBvbiB0aGUgcmVtb3RlIGFnZW50IGhvc3QuXG5cdCAqL1xuXHRhc3luYyBkaXNwb3NlU2Vzc2lvbihzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdCgnZGlzcG9zZVNlc3Npb24nLCB7IGNoYW5uZWw6IHNlc3Npb24udG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkksIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdjcmVhdGVDaGF0Jywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0Y2hhdDogY2hhdC50b1N0cmluZygpLFxuXHRcdFx0Li4uKG9wdGlvbnM/LmZvcmsgPyB7XG5cdFx0XHRcdHNvdXJjZTogeyBraW5kOiBDaGF0U291cmNlS2luZC5Gb3JrLCBjaGF0OiBvcHRpb25zLmZvcmsuc291cmNlLnRvU3RyaW5nKCksIHR1cm5JZDogb3B0aW9ucy5mb3JrLnR1cm5JZCB9XG5cdFx0XHR9IDoge30pLFxuXHRcdFx0Li4uKG9wdGlvbnM/LnNpZGVDaGF0ID8ge1xuXHRcdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0XHRraW5kOiBDaGF0U291cmNlS2luZC5TaWRlQ2hhdCxcblx0XHRcdFx0XHRjaGF0OiBvcHRpb25zLnNpZGVDaGF0LnNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHR1cm5JZDogb3B0aW9ucy5zaWRlQ2hhdC50dXJuSWQsXG5cdFx0XHRcdFx0Li4uKG9wdGlvbnMuc2lkZUNoYXQuc2VsZWN0aW9uID8geyBzZWxlY3Rpb246IG9wdGlvbnMuc2lkZUNoYXQuc2VsZWN0aW9uIH0gOiB7fSksXG5cdFx0XHRcdH1cblx0XHRcdH0gOiB7fSksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBkaXNwb3NlQ2hhdChjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdCgnZGlzcG9zZUNoYXQnLCB7IGNoYW5uZWw6IGNoYXQudG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgdGVybWluYWwgb24gdGhlIHJlbW90ZSBhZ2VudCBob3N0LlxuXHQgKi9cblx0YXN5bmMgY3JlYXRlVGVybWluYWwocGFyYW1zOiBDcmVhdGVUZXJtaW5hbFBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdjcmVhdGVUZXJtaW5hbCcsIHBhcmFtcyk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZSBhIHRlcm1pbmFsIG9uIHRoZSByZW1vdGUgYWdlbnQgaG9zdC5cblx0ICovXG5cdGFzeW5jIGRpc3Bvc2VUZXJtaW5hbCh0ZXJtaW5hbDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fc2VuZFJlcXVlc3QoJ2Rpc3Bvc2VUZXJtaW5hbCcsIHsgY2hhbm5lbDogdGVybWluYWwudG9TdHJpbmcoKSB9KTtcblx0fVxuXG5cdGFzeW5jIGludm9rZUNoYW5nZXNldE9wZXJhdGlvbihwYXJhbXM6IEludm9rZUNoYW5nZXNldE9wZXJhdGlvblBhcmFtcyk6IFByb21pc2U8SW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0PiB7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24nLCBwYXJhbXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYSByZXF1ZXN0IG9uIGFuIGBtY3A6Ly9gIEFIUCBzaWRlIGNoYW5uZWwuIFRoZSBhZ2VudC1ob3N0XG5cdCAqIHJvdXRlcyBieSBgcGFyYW1zLmNoYW5uZWxgIHNvIHdlIGluamVjdCBpdCBhdXRvbWF0aWNhbGx5LlxuXHQgKi9cblx0YXN5bmMgaGFuZGxlTWNwUmVxdWVzdChjaGFubmVsOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2Rpc3BhdGNoUmVxdWVzdDx1bmtub3duPihtZXRob2QsIHsgLi4uKHBhcmFtcyA/PyB7fSksIGNoYW5uZWwgfSk7XG5cdH1cblxuXHQvKipcblx0ICogTGlzdCBhbGwgc2Vzc2lvbnMgZnJvbSB0aGUgcmVtb3RlIGFnZW50IGhvc3QuXG5cdCAqL1xuXHRhc3luYyBsaXN0U2Vzc2lvbnMoKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdHJldHVybiByZXN1bHQuaXRlbXMubWFwKChzOiBTZXNzaW9uU3VtbWFyeSkgPT4gKHtcblx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzLnJlc291cmNlKSxcblx0XHRcdHN0YXJ0VGltZTogRGF0ZS5wYXJzZShzLmNyZWF0ZWRBdCksXG5cdFx0XHRtb2RpZmllZFRpbWU6IERhdGUucGFyc2Uocy5tb2RpZmllZEF0KSxcblx0XHRcdC4uLihzLnByb2plY3QgPyB7XG5cdFx0XHRcdHByb2plY3Q6IHtcblx0XHRcdFx0XHR1cmk6IHRoaXMuX3RvTG9jYWxQcm9qZWN0VXJpKFVSSS5wYXJzZShzLnByb2plY3QudXJpKSksXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6IHMucHJvamVjdC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0fVxuXHRcdFx0fSA6IHt9KSxcblx0XHRcdHN1bW1hcnk6IHMudGl0bGUsXG5cdFx0XHRzdGF0dXM6IHMuc3RhdHVzLFxuXHRcdFx0YWN0aXZpdHk6IHMuYWN0aXZpdHksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB0eXBlb2Ygcy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSA9PT0gJ3N0cmluZycgPyB0b0FnZW50SG9zdFVyaShVUkkucGFyc2Uocy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSksIHRoaXMuX2Nvbm5lY3Rpb25BdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzLndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gdG9BZ2VudEhvc3RVcmkoVVJJLnBhcnNlKGQpLCB0aGlzLl9jb25uZWN0aW9uQXV0aG9yaXR5KSksXG5cdFx0XHRjaGFuZ2VzOiBzLmNoYW5nZXMsXG5cdFx0XHQvLyBDYXJyeSBgX21ldGFgIHNvIGEgc2Vzc2lvbiBmaXJzdCBtYXRlcmlhbGl6ZWQgZnJvbSBhIGxpc3RpbmcgKHdpbmRvd1xuXHRcdFx0Ly8gcmVsb2FkLCBsaXN0IHJlZnJlc2gpIHJlc29sdmVzIGl0cyBraW5kIGNvcnJlY3RseS5cblx0XHRcdC4uLihzLl9tZXRhICE9PSB1bmRlZmluZWQgPyB7IF9tZXRhOiBzLl9tZXRhIH0gOiB7fSksXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Mb2NhbFByb2plY3RVcmkodXJpOiBVUkkpOiBVUkkge1xuXHRcdHJldHVybiB1cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyB0b0FnZW50SG9zdFVyaSh1cmksIHRoaXMuX2Nvbm5lY3Rpb25BdXRob3JpdHkpIDogdXJpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluc3BlY3QgYW4gb3V0Z29pbmcgY2xpZW50LWRpc3BhdGNoZWQgYWN0aW9uIGFuZCBncmFudCBpbXBsaWNpdCByZWFkcyBmb3Jcblx0ICogcmVzb3VyY2VzIHRoYXQgdGhlIGhvc3Qgd2lsbCBuZWVkIHRvIHJlYWQgYWZ0ZXIgcmVjZWl2aW5nIHRoZSBhY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9ncmFudEltcGxpY2l0UmVhZHNGb3JPdXRnb2luZ0FjdGlvbihhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IHZvaWQge1xuXHRcdHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0OlxuXHRcdFx0XHRpZiAoYWN0aW9uLmFjdGl2ZUNsaWVudC5jdXN0b21pemF0aW9ucykge1xuXHRcdFx0XHRcdHRoaXMuX2dyYW50SW1wbGljaXRSZWFkc0ZvckN1c3RvbWl6YXRpb25zKGFjdGlvbi5hY3RpdmVDbGllbnQuY3VzdG9taXphdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZDpcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQ6XG5cdFx0XHRcdHRoaXMuX2dyYW50SW1wbGljaXRSZWFkc0Zvck1lc3NhZ2UoYWN0aW9uLm1lc3NhZ2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9ncmFudEltcGxpY2l0UmVhZHNGb3JNZXNzYWdlKG1lc3NhZ2U6IE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGF0dGFjaG1lbnQgb2YgbWVzc2FnZS5hdHRhY2htZW50cyA/PyBbXSkge1xuXHRcdFx0aWYgKGF0dGFjaG1lbnQudHlwZSAhPT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fZ3JhbnRJbXBsaWNpdFJlYWQoVVJJLnBhcnNlKGF0dGFjaG1lbnQudXJpKSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGltcGxpY2l0IHJlYWQgZ3JhbnRzIGZvciBlYWNoIGN1c3RvbWl6YXRpb24gVVJJIHRoYXQgd2UgYXJlXG5cdCAqIGFib3V0IHRvIHNlbmQgdG8gdGhlIGhvc3QuIFRoZSBob3N0IG5lZWRzIHRvIHJlYWQgdGhlc2UgdG8gbWF0ZXJpYWxpemVcblx0ICogdGhlIGN1c3RvbWl6YXRpb24sIGJ1dCBzaG91bGQgbm90IG5lZWQgdG8gd3JpdGUgdGhlbS4gR3JhbnRzIGFyZVxuXHQgKiBkZWR1cGVkIHBlciBjb25uZWN0aW9uIGFuZCByZXZva2VkIHdoZW4gdGhlIGNvbm5lY3Rpb24gY2xvc2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ3JhbnRJbXBsaWNpdFJlYWRzRm9yQ3VzdG9taXphdGlvbnMocmVmczogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCByZWYgb2YgcmVmcykge1xuXHRcdFx0bGV0IHVyaTogVVJJO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dXJpID0gVVJJLnBhcnNlKHJlZi51cmkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZ3JhbnRJbXBsaWNpdFJlYWQoZGlybmFtZSh1cmkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9ncmFudEltcGxpY2l0UmVhZCh1cmk6IFVSSSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9ncmFudGVkSW1wbGljaXRSZWFkVXJpcy5oYXModXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9ncmFudGVkSW1wbGljaXRSZWFkVXJpcy5hZGQodXJpKTtcblx0XHR0aGlzLl9pbXBsaWNpdFJlYWRHcmFudHMuYWRkKHRoaXMuX3Jlc291cmNlU2VydmljZS5ncmFudEltcGxpY2l0UmVhZCh0aGlzLl9yZXNvdXJjZUlkZW50aXR5LCB1cmkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaXN0IHRoZSBjb250ZW50cyBvZiBhIGRpcmVjdG9yeSBvbiB0aGUgcmVtb3RlIGhvc3QncyBmaWxlc3lzdGVtLlxuXHQgKi9cblx0YXN5bmMgcmVzb3VyY2VMaXN0KHVyaTogVVJJKTogUHJvbWlzZTxDb21tYW5kTWFwWydyZXNvdXJjZUxpc3QnXVsncmVzdWx0J10+IHtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fc2VuZFJlcXVlc3QoJ3Jlc291cmNlTGlzdCcsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHVyaTogdXJpLnRvU3RyaW5nKCkgfSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZCB0aGUgY29udGVudCBvZiBhIHJlc291cmNlIG9uIHRoZSByZW1vdGUgaG9zdC5cblx0ICovXG5cdGFzeW5jIHJlc291cmNlUmVhZCh1cmk6IFVSSSk6IFByb21pc2U8Q29tbWFuZE1hcFsncmVzb3VyY2VSZWFkJ11bJ3Jlc3VsdCddPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRSZXF1ZXN0KCdyZXNvdXJjZVJlYWQnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLCB1cmk6IHVyaS50b1N0cmluZygpIH0pO1xuXHR9XG5cblx0YXN5bmMgcmVzb3VyY2VXcml0ZShwYXJhbXM6IENvbW1hbmRNYXBbJ3Jlc291cmNlV3JpdGUnXVsncGFyYW1zJ10pOiBQcm9taXNlPENvbW1hbmRNYXBbJ3Jlc291cmNlV3JpdGUnXVsncmVzdWx0J10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZFJlcXVlc3QoJ3Jlc291cmNlV3JpdGUnLCBwYXJhbXMpO1xuXHR9XG5cblx0YXN5bmMgcmVzb3VyY2VDb3B5KHBhcmFtczogQ29tbWFuZE1hcFsncmVzb3VyY2VDb3B5J11bJ3BhcmFtcyddKTogUHJvbWlzZTxDb21tYW5kTWFwWydyZXNvdXJjZUNvcHknXVsncmVzdWx0J10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZFJlcXVlc3QoJ3Jlc291cmNlQ29weScsIHBhcmFtcyk7XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZURlbGV0ZShwYXJhbXM6IENvbW1hbmRNYXBbJ3Jlc291cmNlRGVsZXRlJ11bJ3BhcmFtcyddKTogUHJvbWlzZTxDb21tYW5kTWFwWydyZXNvdXJjZURlbGV0ZSddWydyZXN1bHQnXT4ge1xuXHRcdHJldHVybiB0aGlzLl9zZW5kUmVxdWVzdCgncmVzb3VyY2VEZWxldGUnLCBwYXJhbXMpO1xuXHR9XG5cblx0YXN5bmMgcmVzb3VyY2VNb3ZlKHBhcmFtczogQ29tbWFuZE1hcFsncmVzb3VyY2VNb3ZlJ11bJ3BhcmFtcyddKTogUHJvbWlzZTxDb21tYW5kTWFwWydyZXNvdXJjZU1vdmUnXVsncmVzdWx0J10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VuZFJlcXVlc3QoJ3Jlc291cmNlTW92ZScsIHBhcmFtcyk7XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZVJlc29sdmUocGFyYW1zOiBDb21tYW5kTWFwWydyZXNvdXJjZVJlc29sdmUnXVsncGFyYW1zJ10pOiBQcm9taXNlPENvbW1hbmRNYXBbJ3Jlc291cmNlUmVzb2x2ZSddWydyZXN1bHQnXT4ge1xuXHRcdHJldHVybiB0aGlzLl9zZW5kUmVxdWVzdCgncmVzb3VyY2VSZXNvbHZlJywgcGFyYW1zKTtcblx0fVxuXG5cdGFzeW5jIHJlc291cmNlTWtkaXIocGFyYW1zOiBDb21tYW5kTWFwWydyZXNvdXJjZU1rZGlyJ11bJ3BhcmFtcyddKTogUHJvbWlzZTxDb21tYW5kTWFwWydyZXNvdXJjZU1rZGlyJ11bJ3Jlc3VsdCddPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRSZXF1ZXN0KCdyZXNvdXJjZU1rZGlyJywgcGFyYW1zKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVJlc291cmNlV2F0Y2gocGFyYW1zOiBDb21tYW5kTWFwWydjcmVhdGVSZXNvdXJjZVdhdGNoJ11bJ3BhcmFtcyddKTogUHJvbWlzZTxDb21tYW5kTWFwWydjcmVhdGVSZXNvdXJjZVdhdGNoJ11bJ3Jlc3VsdCddPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRSZXF1ZXN0KCdjcmVhdGVSZXNvdXJjZVdhdGNoJywgcGFyYW1zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZW5pZW5jZSB3cmFwcGVyIHVzZWQgYnkge0BsaW5rIEFIUEZpbGVTeXN0ZW1Qcm92aWRlci53YXRjaH06XG5cdCAqIHJ1bnMgYGNyZWF0ZVJlc291cmNlV2F0Y2hgICsgYHN1YnNjcmliZWAgYW5kIHJldHVybnMgYSBoYW5kbGUgdGhhdFxuXHQgKiBzdXJmYWNlcyBgcmVzb3VyY2VXYXRjaC9jaGFuZ2VkYCBlbnZlbG9wZXMgYXNcblx0ICoge0BsaW5rIElGaWxlQ2hhbmdlfVtdIGV2ZW50cy4gRGlzcG9zaW5nIHRoZSBoYW5kbGUgdW5zdWJzY3JpYmVzXG5cdCAqIHRoZSB3YXRjaCBjaGFubmVsLlxuXHQgKi9cblx0d2F0Y2hSZXNvdXJjZShwYXJhbXM6IENvbW1hbmRNYXBbJ2NyZWF0ZVJlc291cmNlV2F0Y2gnXVsncGFyYW1zJ10pOiBQcm9taXNlPElSZW1vdGVXYXRjaEhhbmRsZT4ge1xuXHRcdHJldHVybiBjcmVhdGVSZW1vdGVXYXRjaEhhbmRsZSh7XG5cdFx0XHRjcmVhdGVSZXNvdXJjZVdhdGNoOiBwID0+IHRoaXMuY3JlYXRlUmVzb3VyY2VXYXRjaChwKSxcblx0XHRcdHN1YnNjcmliZTogdXJpID0+IHRoaXMuc3Vic2NyaWJlKHVyaSksXG5cdFx0XHR1bnN1YnNjcmliZTogdXJpID0+IHRoaXMudW5zdWJzY3JpYmUodXJpKSxcblx0XHRcdG9uRGlkQWN0aW9uOiB0aGlzLm9uRGlkQWN0aW9uLFxuXHRcdH0sIHBhcmFtcyk7XG5cdH1cblxuXHQvKipcblx0ICogVHJpZ2dlciB0aGUgQ0xJLW1hbmFnZWQgdXBncmFkZSBmbG93IGZvciB0aGlzIGFnZW50IGhvc3QgdXNpbmcgdGhlXG5cdCAqIG1ldGhvZCBuYW1lIGFkdmVydGlzZWQgYnkgdGhlIHNlcnZlciAodHlwaWNhbGx5XG5cdCAqIHtAbGluayBWU0NPREVfVVBHUkFERV9NRVRIT0R9KS4gQ2FsbGFibGUgYmVmb3JlIHtAbGluayBjb25uZWN0fSBoYXNcblx0ICogY29tcGxldGVkIFx1MjAxNCB0eXBpY2FsbHkgdXNlZCB3aGVuIHRoZSBob3N0IGhhcyBqdXN0IHJlamVjdGVkIG91clxuXHQgKiBgaW5pdGlhbGl6ZWAgd2l0aCBhbiBgVW5zdXBwb3J0ZWRQcm90b2NvbFZlcnNpb25gIGVycm9yLiBUaGVcblx0ICogdHJhbnNwb3J0IHN0YXlzIG9wZW4gYWZ0ZXIgdGhlIHJlamVjdGlvbiwgc28gdGhlIGV4dGVuc2lvbiByZXF1ZXN0XG5cdCAqIHJpZGVzIG92ZXIgaXQgd2l0aG91dCBhIHNwZWNpYWwgb3V0LW9mLWJhbmQgcGF0aC5cblx0ICpcblx0ICogVGhlIHJlc3VsdCBtaXJyb3JzIHRoZSBDTEkncyBIVFRQIHJlc3BvbnNlOiBvayBmbGFnLCB3aGV0aGVyIHRoZVxuXHQgKiB1cGdyYWRlIGlzIG5lZWRlZCAvIHN0YXJ0ZWQsIHJ1bm5pbmcvbGF0ZXN0IGNvbW1pdHMuXG5cdCAqL1xuXHR0cmlnZ2VyVnNjb2RlVXBncmFkZShtZXRob2Q6IHN0cmluZyk6IFByb21pc2U8SVZzY29kZVVwZ3JhZGVSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGlzcGF0Y2hSZXF1ZXN0PElWc2NvZGVVcGdyYWRlUmVzdWx0PihtZXRob2QsIHt9LCB7IGFsbG93SW5jb21wYXRpYmxlVXBncmFkZTogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZU1lc3NhZ2UobXNnOiBQcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkKSB7XG5cdFx0XHQvLyBBZnRlciBjbG9zZSwgdGhlIHRyYW5zcG9ydCBtYXkgc3RpbGwgZW1pdCBsYXRlIG1lc3NhZ2VzIChlLmcuXG5cdFx0XHQvLyBiZWNhdXNlIHRoZSBzYW1lIHNoYXJlZCBldmVudCBzb3VyY2UgaXMgYWxzbyBmZWVkaW5nIGEgbmV3ZXJcblx0XHRcdC8vIHRyYW5zcG9ydCBmb3IgdGhlIHNhbWUgY29ubmVjdGlvbklkKS4gRHJvcCB0aGVtIHNvIHRoZXkgY2FuJ3Rcblx0XHRcdC8vIHRyaWdnZXIgYW55IHNpZGUgZWZmZWN0cy5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBbnkgaW5ib3VuZCB0cmFmZmljIFx1MjAxNCBpbmNsdWRpbmcgdGhpcyBtZXNzYWdlIFx1MjAxNCBpcyBldmlkZW5jZSB0aGVcblx0XHQvLyB0cmFuc3BvcnQgaXMgc3RpbGwgYWxpdmUuIFJlc2V0IHRoZSBsaXZlbmVzcyB0aW1lcnMgYmVmb3JlXG5cdFx0Ly8gZGlzcGF0Y2ggc28gdGhleSdyZSBjb25zaXN0ZW50IGV2ZW4gaWYgYSBoYW5kbGVyIHN5bmNocm9ub3VzbHlcblx0XHQvLyBzY2hlZHVsZXMgd29yay5cblx0XHR0aGlzLl9sYXN0UmVhZFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdHRoaXMuX3Jlc2V0TGl2ZW5lc3NUaW1lcnMoKTtcblxuXHRcdGlmIChpc0pzb25ScGNSZXF1ZXN0KG1zZykpIHtcblx0XHRcdHRoaXMuX2hhbmRsZVJldmVyc2VSZXF1ZXN0KG1zZy5pZCwgbXNnLm1ldGhvZCwgbXNnLnBhcmFtcyk7XG5cdFx0fSBlbHNlIGlmIChpc0pzb25ScGNSZXNwb25zZShtc2cpKSB7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmdldChtc2cuaWQpO1xuXHRcdFx0aWYgKHBlbmRpbmcpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmRlbGV0ZShtc2cuaWQpO1xuXHRcdFx0XHRpZiAoaGFzS2V5KG1zZywgeyBlcnJvcjogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zaG91bGRMb2dGYWlsZWRSZXF1ZXN0KHBlbmRpbmcsIG1zZy5lcnJvcikpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1JlbW90ZUFnZW50SG9zdFByb3RvY29sXSBSZXF1ZXN0ICR7bXNnLmlkfSBmYWlsZWQ6YCwgbXNnLmVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cGVuZGluZy5kZWZlcnJlZC5lcnJvcih0aGlzLl90b1Byb3RvY29sRXJyb3IobXNnLmVycm9yKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cGVuZGluZy5kZWZlcnJlZC5jb21wbGV0ZShtc2cucmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFJlY2VpdmVkIHJlc3BvbnNlIGZvciB1bmtub3duIHJlcXVlc3QgaWQgJHttc2cuaWR9YCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc0pzb25ScGNOb3RpZmljYXRpb24obXNnKSkge1xuXHRcdFx0c3dpdGNoIChtc2cubWV0aG9kKSB7XG5cdFx0XHRcdGNhc2UgJ2FjdGlvbic6IHtcblx0XHRcdFx0XHQvLyBQcm90b2NvbCBlbnZlbG9wZSBcdTIxOTIgVlMgQ29kZSBlbnZlbG9wZSAoc3VwZXJzZXQgb2YgYWN0aW9uIHR5cGVzKVxuXHRcdFx0XHRcdGNvbnN0IGVudmVsb3BlID0gbXNnLnBhcmFtcztcblx0XHRcdFx0XHR0aGlzLl9zZXJ2ZXJTZXEgPSBNYXRoLm1heCh0aGlzLl9zZXJ2ZXJTZXEsIGVudmVsb3BlLnNlcnZlclNlcSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRBY3Rpb24uZmlyZShlbnZlbG9wZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAncm9vdC9zZXNzaW9uQWRkZWQnOlxuXHRcdFx0XHRjYXNlICdyb290L3Nlc3Npb25SZW1vdmVkJzpcblx0XHRcdFx0Y2FzZSAncm9vdC9zZXNzaW9uU3VtbWFyeUNoYW5nZWQnOlxuXHRcdFx0XHRjYXNlICdyb290L3Byb2dyZXNzJzpcblx0XHRcdFx0Y2FzZSAnYXV0aC9yZXF1aXJlZCc6IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIE5vdGlmaWNhdGlvbjogJHttc2cubWV0aG9kfWApO1xuXHRcdFx0XHRcdC8vIFRoZSBjYXNlIG5hcnJvd3MgYG1zZy5tZXRob2RgIHRvIGEgc2luZ2xlIGxpdGVyYWw7IHRoZSBtYXRjaGluZyBwYXJhbXNcblx0XHRcdFx0XHQvLyBzaGFwZSBpcyBwYWlyZWQgd2l0aCB0aGF0IGxpdGVyYWwgYnkgdGhlIHtAbGluayBTZXJ2ZXJOb3RpZmljYXRpb25NYXB9XG5cdFx0XHRcdFx0Ly8gZGVmaW5pdGlvbiwgc28gc3ByZWFkaW5nIGlzIHNhZmUuXG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkTm90aWZpY2F0aW9uLmZpcmUoeyB0eXBlOiBtc2cubWV0aG9kLCAuLi5tc2cucGFyYW1zIH0gYXMgSU5vdGlmaWNhdGlvbik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnb3RscC9leHBvcnRMb2dzJzpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlY2VpdmVPdGxwTG9ncy5maXJlKG1zZy5wYXJhbXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdvdGxwL2V4cG9ydFRyYWNlcyc6XG5cdFx0XHRcdGNhc2UgJ290bHAvZXhwb3J0TWV0cmljcyc6XG5cdFx0XHRcdFx0Ly8gTm90IHJlY29yZGVkLCB5ZXRcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdGNvbnN0IHJhd0NoYW5uZWwgPSBtc2cucGFyYW1zICYmIHR5cGVvZiBtc2cucGFyYW1zID09PSAnb2JqZWN0J1xuXHRcdFx0XHRcdFx0PyAobXNnLnBhcmFtcyBhcyB7IGNoYW5uZWw/OiB1bmtub3duIH0pLmNoYW5uZWxcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgcmF3Q2hhbm5lbCA9PT0gJ3N0cmluZycgJiYgcmF3Q2hhbm5lbC50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ21jcDovJykpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHsgY2hhbm5lbDogX2NoYW5uZWwsIC4uLnJlc3QgfSA9IG1zZy5wYXJhbXMgYXMgeyBjaGFubmVsOiBzdHJpbmc7W2s6IHN0cmluZ106IHVua25vd24gfTtcblx0XHRcdFx0XHRcdHRoaXMuX29uTWNwTm90aWZpY2F0aW9uLmZpcmUoeyBjaGFubmVsOiByYXdDaGFubmVsLCBtZXRob2Q6IG1zZy5tZXRob2QsIHBhcmFtczogcmVzdCB9KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFVuaGFuZGxlZCBtZXRob2Q6ICR7bXNnLm1ldGhvZH1gKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtSZW1vdGVBZ2VudEhvc3RQcm90b2NvbF0gVW5yZWNvZ25pemVkIG1lc3NhZ2U6YCwgSlNPTi5zdHJpbmdpZnkobXNnKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ2xvc2UoZXJyb3I6IFByb3RvY29sRXJyb3IpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFN0b3AgdGhlIGxpdmVuZXNzIHRpbWVycyBzbyB0aGV5IGRvbid0IGtlZXAgdGlja2luZyBvbiBhIGRlYWRcblx0XHQvLyBjb25uZWN0aW9uICh0aGUgY2xpZW50IG1heSBvdXRsaXZlIHRoZSBjbG9zZSwgd2FpdGluZyB0byBiZSByZXBsYWNlZCkuXG5cdFx0dGhpcy5fY2FuY2VsTGl2ZW5lc3NUaW1lcnMoKTtcblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nKSB7XG5cdFx0XHRjb25zdCByZWNvbm5lY3QgPSB0aGlzLl9zdGF0ZS5yZWNvbm5lY3Q7XG5cdFx0XHRpZiAocmVjb25uZWN0LnRpbWVvdXRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQocmVjb25uZWN0LnRpbWVvdXRIYW5kbGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZWNvbm5lY3QuZ2F0ZS5pc1NldHRsZWQpIHtcblx0XHRcdFx0cmVjb25uZWN0LmdhdGUuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gT3V0Ym94IGlzIGRyb3BwZWQgd2hlbiB0aGUgcmVjb25uZWN0IHN0YXRlIGlzIGRpc2NhcmRlZCBieSB0aGVcblx0XHRcdC8vIHRyYW5zaXRpb24gYmVsb3cuXG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0aW5nKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5vdXRib3gubGVuZ3RoID0gMDtcblx0XHR9XG5cdFx0dGhpcy5fcmVqZWN0UGVuZGluZ1JlcXVlc3RzKGVycm9yKTtcblx0XHR0aGlzLl9ncmFudGVkSW1wbGljaXRSZWFkVXJpcy5jbGVhcigpO1xuXHRcdHRoaXMuX2ltcGxpY2l0UmVhZEdyYW50cy5jbGVhcigpO1xuXHRcdHRoaXMuX3Jlc291cmNlU2VydmljZS5jb25uZWN0aW9uQ2xvc2VkKHRoaXMuX3Jlc291cmNlSWRlbnRpdHkpO1xuXHRcdHRoaXMuX3RyYW5zaXRpb25Ubyh7IGtpbmQ6IEFnZW50SG9zdENsaWVudFN0YXRlLkNsb3NlZCwgZXJyb3IgfSk7XG5cdFx0dGhpcy5fb25EaWRDbG9zZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yYWNlQ2xvc2U8VD4ocHJvbWlzZTogUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdCh0aGlzLl9zdGF0ZS5lcnJvcik7XG5cdFx0fVxuXG5cdFx0bGV0IGNsb3NlTGlzdGVuZXIgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0Y29uc3QgY2xvc2VQcm9taXNlID0gbmV3IFByb21pc2U8bmV2ZXI+KChfcmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjbG9zZUxpc3RlbmVyID0gdGhpcy5vbkRpZENsb3NlKCgpID0+IHJlamVjdCh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWQgPyB0aGlzLl9zdGF0ZS5lcnJvciA6IGNvbm5lY3Rpb25DbG9zZWRFcnJvcih0aGlzLl9hZGRyZXNzKSkpO1xuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBQcm9taXNlLnJhY2UoW3Byb21pc2UsIGNsb3NlUHJvbWlzZV0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyByZXZlcnNlIFJQQyByZXF1ZXN0cyBmcm9tIHRoZSBzZXJ2ZXIgKGUuZy4gcmVzb3VyY2VMaXN0LFxuXHQgKiByZXNvdXJjZVJlYWQpLiBUaGluIHdpcmUgYWRhcHRlciBcdTIwMTQgZGlzcGF0Y2hlcyBlYWNoIGZyYW1lIHRvXG5cdCAqIHtAbGluayBJQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlfSAod2hpY2ggb3ducyBnYXRpbmcsIHZpcnR1YWwgcmVhZHMsXG5cdCAqIGFuZCB0aGUgdXNlci1wcm9tcHQgZmxvdykgYW5kIHRyYW5zbGF0ZXMgcmVzdWx0cyAvIGVycm9ycyBiYWNrIGludG9cblx0ICogSlNPTi1SUEMgZnJhbWVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlUmV2ZXJzZVJlcXVlc3QoaWQ6IG51bWJlciwgbWV0aG9kOiBzdHJpbmcsIHBhcmFtczogdW5rbm93bik6IHZvaWQge1xuXHRcdC8vIENhcHR1cmUgdGhlIHRyYW5zcG9ydCBhdCByZXF1ZXN0LWVudHJ5IHNvIGFzeW5jIGhhbmRsZXJzIChwZXJtaXNzaW9uXG5cdFx0Ly8gY2hlY2tzLCBmaWxlIG9wcykgcmVwbHkgb24gdGhlIHNhbWUgdHJhbnNwb3J0IHRoZSByZXF1ZXN0IGFycml2ZWQgb24uXG5cdFx0Ly8gV2l0aG91dCB0aGlzLCBhIHNvZnQgcmVjb25uZWN0IG1pZC1oYW5kbGVyIHdvdWxkIHJvdXRlIHRoZSByZXNwb25zZVxuXHRcdC8vIG9udG8gYSBuZXcgdHJhbnNwb3J0IHdpdGggYSBzdGFsZSBpZCBcdTIwMTQgc3RyYXkgcmVzcG9uc2UgYXQgYmVzdCwgaWRcblx0XHQvLyBjb2xsaXNpb24gd2l0aCBhIG5ldyBzZXJ2ZXItaXNzdWVkIHJldmVyc2UgUlBDIGF0IHdvcnN0LlxuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IHRoaXMuX3RyYW5zcG9ydDtcblx0XHRjb25zdCBzZW5kUmVzdWx0ID0gKHJlc3VsdDogdW5rbm93bikgPT4ge1xuXHRcdFx0dHJhbnNwb3J0LnNlbmQoeyBqc29ucnBjOiAnMi4wJywgaWQsIHJlc3VsdCB9KTtcblx0XHR9O1xuXHRcdGNvbnN0IHNlbmRFcnJvciA9IChlcnI6IHVua25vd24pID0+IHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBBZ2VudEhvc3RSZXNvdXJjZVBlcm1pc3Npb25FcnJvcikge1xuXHRcdFx0XHR0cmFuc3BvcnQuc2VuZCh7XG5cdFx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRcdGNvZGU6IEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGVyci5tZXNzYWdlLFxuXHRcdFx0XHRcdFx0ZGF0YTogZXJyLnJlcXVlc3QgPyB7IHJlcXVlc3Q6IGVyci5yZXF1ZXN0IH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZzQ29kZSA9IHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyIDogdW5kZWZpbmVkKTtcblx0XHRcdGxldCBjb2RlID0gLTMyMDAwO1xuXHRcdFx0c3dpdGNoIChmc0NvZGUpIHtcblx0XHRcdFx0Y2FzZSBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kOiBjb2RlID0gQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZDsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnM6IGNvZGUgPSBBaHBFcnJvckNvZGVzLlBlcm1pc3Npb25EZW5pZWQ7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlRXhpc3RzOiBjb2RlID0gQWhwRXJyb3JDb2Rlcy5BbHJlYWR5RXhpc3RzOyBicmVhaztcblx0XHRcdH1cblx0XHRcdHRyYW5zcG9ydC5zZW5kKHsganNvbnJwYzogJzIuMCcsIGlkLCBlcnJvcjogeyBjb2RlLCBtZXNzYWdlOiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikgfSB9KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcCA9IChwYXJhbXMgPz8ge30pIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGNvbnN0IGlkZW50aXR5ID0gdGhpcy5fcmVzb3VyY2VJZGVudGl0eTtcblx0XHR2b2lkIChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzd2l0Y2ggKG1ldGhvZCkge1xuXHRcdFx0XHRcdGNhc2UgJ3Jlc291cmNlTGlzdCc6IHtcblx0XHRcdFx0XHRcdGlmICghcC51cmkpIHsgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHVyaScpOyB9XG5cdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvdXJjZVNlcnZpY2UubGlzdChpZGVudGl0eSwgVVJJLnBhcnNlKHAudXJpIGFzIHN0cmluZykpO1xuXHRcdFx0XHRcdFx0c2VuZFJlc3VsdCh7IGVudHJpZXM6IHJlc3VsdC5lbnRyaWVzIH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdyZXNvdXJjZVJlYWQnOiB7XG5cdFx0XHRcdFx0XHRpZiAoIXAudXJpKSB7IHRocm93IG5ldyBFcnJvcignTWlzc2luZyB1cmknKTsgfVxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcmVzb3VyY2VTZXJ2aWNlLnJlYWQoaWRlbnRpdHksIFVSSS5wYXJzZShwLnVyaSBhcyBzdHJpbmcpKTtcblx0XHRcdFx0XHRcdHNlbmRSZXN1bHQoeyBkYXRhOiBlbmNvZGVCYXNlNjQocmVzdWx0LmJ5dGVzKSwgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5CYXNlNjQgfSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3Jlc291cmNlV3JpdGUnOiB7XG5cdFx0XHRcdFx0XHRpZiAoIXAudXJpIHx8IHAuZGF0YSA9PT0gdW5kZWZpbmVkKSB7IHRocm93IG5ldyBFcnJvcignTWlzc2luZyB1cmkgb3IgZGF0YScpOyB9XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZXNvdXJjZVNlcnZpY2Uud3JpdGUoaWRlbnRpdHksIHAgYXMgdW5rbm93biBhcyBQYXJhbWV0ZXJzPHR5cGVvZiB0aGlzLl9yZXNvdXJjZVNlcnZpY2Uud3JpdGU+WzFdKTtcblx0XHRcdFx0XHRcdHNlbmRSZXN1bHQoe30pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdyZXNvdXJjZURlbGV0ZSc6IHtcblx0XHRcdFx0XHRcdGlmICghcC51cmkpIHsgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHVyaScpOyB9XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZXNvdXJjZVNlcnZpY2UuZGVsKGlkZW50aXR5LCBwIGFzIHVua25vd24gYXMgUGFyYW1ldGVyczx0eXBlb2YgdGhpcy5fcmVzb3VyY2VTZXJ2aWNlLmRlbD5bMV0pO1xuXHRcdFx0XHRcdFx0c2VuZFJlc3VsdCh7fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3Jlc291cmNlTW92ZSc6IHtcblx0XHRcdFx0XHRcdGlmICghcC5zb3VyY2UgfHwgIXAuZGVzdGluYXRpb24pIHsgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHNvdXJjZSBvciBkZXN0aW5hdGlvbicpOyB9XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZXNvdXJjZVNlcnZpY2UubW92ZShpZGVudGl0eSwgcCBhcyB1bmtub3duIGFzIFBhcmFtZXRlcnM8dHlwZW9mIHRoaXMuX3Jlc291cmNlU2VydmljZS5tb3ZlPlsxXSk7XG5cdFx0XHRcdFx0XHRzZW5kUmVzdWx0KHt9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAncmVzb3VyY2VDb3B5Jzoge1xuXHRcdFx0XHRcdFx0aWYgKCFwLnNvdXJjZSB8fCAhcC5kZXN0aW5hdGlvbikgeyB0aHJvdyBuZXcgRXJyb3IoJ01pc3Npbmcgc291cmNlIG9yIGRlc3RpbmF0aW9uJyk7IH1cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc291cmNlU2VydmljZS5jb3B5KGlkZW50aXR5LCBwIGFzIHVua25vd24gYXMgUGFyYW1ldGVyczx0eXBlb2YgdGhpcy5fcmVzb3VyY2VTZXJ2aWNlLmNvcHk+WzFdKTtcblx0XHRcdFx0XHRcdHNlbmRSZXN1bHQoe30pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdyZXNvdXJjZVJlc29sdmUnOiB7XG5cdFx0XHRcdFx0XHRpZiAoIXAudXJpKSB7IHRocm93IG5ldyBFcnJvcignTWlzc2luZyB1cmknKTsgfVxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcmVzb3VyY2VTZXJ2aWNlLnJlc29sdmUoaWRlbnRpdHksIHAgYXMgdW5rbm93biBhcyBQYXJhbWV0ZXJzPHR5cGVvZiB0aGlzLl9yZXNvdXJjZVNlcnZpY2UucmVzb2x2ZT5bMV0pO1xuXHRcdFx0XHRcdFx0c2VuZFJlc3VsdChyZXN1bHQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdyZXNvdXJjZU1rZGlyJzoge1xuXHRcdFx0XHRcdFx0aWYgKCFwLnVyaSkgeyB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgdXJpJyk7IH1cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc291cmNlU2VydmljZS5ta2RpcihpZGVudGl0eSwgcCBhcyB1bmtub3duIGFzIFBhcmFtZXRlcnM8dHlwZW9mIHRoaXMuX3Jlc291cmNlU2VydmljZS5ta2Rpcj5bMV0pO1xuXHRcdFx0XHRcdFx0c2VuZFJlc3VsdCh7fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3Jlc291cmNlUmVxdWVzdCc6IHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc291cmNlU2VydmljZS5yZXF1ZXN0KGlkZW50aXR5LCBwIGFzIHVua25vd24gYXMgUmVzb3VyY2VSZXF1ZXN0UGFyYW1zKTtcblx0XHRcdFx0XHRcdFx0c2VuZFJlc3VsdCh7fSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEFnZW50SG9zdFJlc291cmNlUGVybWlzc2lvbkVycm9yKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIFVuaGFuZGxlZCByZXZlcnNlIHJlcXVlc3Q6ICR7bWV0aG9kfWApO1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIG1ldGhvZDogJHttZXRob2R9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRzZW5kRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXHR9XG5cblx0LyoqIFNlbmQgYSB0eXBlZCBKU09OLVJQQyBub3RpZmljYXRpb24gZm9yIGEgcHJvdG9jb2wtZGVmaW5lZCBtZXRob2QuICovXG5cdHByaXZhdGUgX3NlbmROb3RpZmljYXRpb248TSBleHRlbmRzIGtleW9mIENsaWVudE5vdGlmaWNhdGlvbk1hcD4obWV0aG9kOiBNLCBwYXJhbXM6IENsaWVudE5vdGlmaWNhdGlvbk1hcFtNXVsncGFyYW1zJ10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkIHx8IHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBHZW5lcmljIE0gY2FuJ3Qgc2F0aXNmeSB0aGUgZGlzdHJpYnV0aXZlIEFocE5vdGlmaWNhdGlvbiB1bmlvbiBkaXJlY3RseVxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRjb25zdCBtZXNzYWdlID0geyBqc29ucnBjOiAnMi4wJyBhcyBjb25zdCwgbWV0aG9kLCBwYXJhbXMgfSBhcyBQcm90b2NvbE1lc3NhZ2U7XG5cdFx0aWYgKGlzQ2xpZW50VHJhbnNwb3J0KHRoaXMuX3RyYW5zcG9ydCkgJiYgdGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGluZykge1xuXHRcdFx0dGhpcy5fc3RhdGUub3V0Ym94LnB1c2gobWVzc2FnZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdC8vIFF1ZXVlIGZvciB0aGUgbmV3IHRyYW5zcG9ydCBcdTIwMTQgZHJhaW5lZCBieSB7QGxpbmsgX2RyYWluQWZ0ZXJSZWNvbm5lY3R9XG5cdFx0XHQvLyBvbmNlIHRoZSBzb2Z0LXJlY29ubmVjdCBoYW5kc2hha2UgY29tcGxldGVzLiBUaGUgb3V0Ym94IHBlcnNpc3RzXG5cdFx0XHQvLyBhY3Jvc3MgZmFpbGVkIGF0dGVtcHRzIHNvIGEgbWVzc2FnZSByaWRlcyB0aHJvdWdoIHJldHJ5IGN5Y2xlc1xuXHRcdFx0Ly8gcmF0aGVyIHRoYW4gYmVpbmcgc2lsZW50bHkgZHJvcHBlZC5cblx0XHRcdHRoaXMuX3N0YXRlLnJlY29ubmVjdC5vdXRib3gucHVzaChtZXNzYWdlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdHJhbnNwb3J0LnNlbmQobWVzc2FnZSk7XG5cdH1cblxuXHQvKiogU2VuZCBhIHR5cGVkIEpTT04tUlBDIHJlcXVlc3QgZm9yIGEgcHJvdG9jb2wtZGVmaW5lZCBtZXRob2QuICovXG5cdHByaXZhdGUgX3NlbmRSZXF1ZXN0PE0gZXh0ZW5kcyBrZXlvZiBDb21tYW5kTWFwPihtZXRob2Q6IE0sIHBhcmFtczogQ29tbWFuZE1hcFtNXVsncGFyYW1zJ10pOiBQcm9taXNlPENvbW1hbmRNYXBbTV1bJ3Jlc3VsdCddPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Rpc3BhdGNoUmVxdWVzdDxDb21tYW5kTWFwW01dWydyZXN1bHQnXT4obWV0aG9kLCBwYXJhbXMpO1xuXHR9XG5cblx0LyoqIFNlbmQgYSBKU09OLVJQQyByZXF1ZXN0IGZvciBhIFZTIENvZGUgZXh0ZW5zaW9uIG1ldGhvZCAobm90IGluIHRoZSBwcm90b2NvbCBzcGVjKS4gKi9cblx0cHJpdmF0ZSBfc2VuZEV4dGVuc2lvblJlcXVlc3Q8TSBleHRlbmRzIGtleW9mIElSZW1vdGVBZ2VudEhvc3RFeHRlbnNpb25Db21tYW5kTWFwPihtZXRob2Q6IE0sIHBhcmFtcz86IElSZW1vdGVBZ2VudEhvc3RFeHRlbnNpb25Db21tYW5kTWFwW01dWydwYXJhbXMnXSk6IFByb21pc2U8SVJlbW90ZUFnZW50SG9zdEV4dGVuc2lvbkNvbW1hbmRNYXBbTV1bJ3Jlc3VsdCddPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Rpc3BhdGNoUmVxdWVzdDxJUmVtb3RlQWdlbnRIb3N0RXh0ZW5zaW9uQ29tbWFuZE1hcFtNXVsncmVzdWx0J10+KG1ldGhvZCwgcGFyYW1zKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRlbGVtZXRyeUxldmVsKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcGF0Y2hBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFRlbGVtZXRyeUxldmVsQ29uZmlnS2V5XTogdGVsZW1ldHJ5TGV2ZWxUb0FnZW50SG9zdENvbmZpZ1ZhbHVlKGdldFRlbGVtZXRyeUxldmVsKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSkgfSxcblx0XHR9LCB0aGlzLl9jbGllbnRJZCwgMCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVFZGl0VGVsZW1ldHJ5RW5hYmxlZCgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RFZGl0VGVsZW1ldHJ5RW5hYmxlZENvbmZpZ0tleV06IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEVESVRfVEVMRU1FVFJZX0VOQUJMRURfU0VUVElOR19JRCkgIT09IGZhbHNlIH0sXG5cdFx0fSwgdGhpcy5fY2xpZW50SWQsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5KCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc2FibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oRElTQUJMRV9SRVBPX0lORk9fVEVMRU1FVFJZX1NFVFRJTkdfSUQpID09PSB0cnVlO1xuXHRcdHRoaXMuZGlzcGF0Y2hBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdERpc2FibGVSZXBvSW5mb1RlbGVtZXRyeUNvbmZpZ0tleV06IGRpc2FibGVkIH0sXG5cdFx0fSwgdGhpcy5fY2xpZW50SWQsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2Vzc2lvblN5bmNFbmFibGVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSAhIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFNFU1NJT05fU1lOQ19FTkFCTEVEX1NFVFRJTkdfSUQpO1xuXHRcdHRoaXMuZGlzcGF0Y2hBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFNlc3Npb25TeW5jRW5hYmxlZENvbmZpZ0tleV06IGVuYWJsZWQgfSxcblx0XHR9LCB0aGlzLl9jbGllbnRJZCwgMCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oVEVSTUlOQUxfQVVUT19BUFBST1ZFX0VOQUJMRURfU0VUVElOR19JRCkgIT09IGZhbHNlO1xuXHRcdHRoaXMuZGlzcGF0Y2hBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5XTogZW5hYmxlZCB9LFxuXHRcdH0sIHRoaXMuX2NsaWVudElkLCAwKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oR0xPQkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lEKSA9PT0gdHJ1ZTtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXldOiBlbmFibGVkIH0sXG5cdFx0fSwgdGhpcy5fY2xpZW50SWQsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQXV0b1JlcGx5RW5hYmxlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQVVUT19SRVBMWV9TRVRUSU5HX0lEKSA9PT0gdHJ1ZTtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RBdXRvUmVwbHlFbmFibGVkQ29uZmlnS2V5XTogZW5hYmxlZCB9LFxuXHRcdH0sIHRoaXMuX2NsaWVudElkLCAwKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVByZWZlckxvbmdDb250ZXh0RW5hYmxlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUFJFRkVSX0xPTkdfQ09OVEVYVF9TRVRUSU5HX0lEKSA9PT0gdHJ1ZTtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RQcmVmZXJMb25nQ29udGV4dEVuYWJsZWRDb25maWdLZXldOiBlbmFibGVkIH0sXG5cdFx0fSwgdGhpcy5fY2xpZW50SWQsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU3lzdGVtUHJveHlFbmFibGVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RTeXN0ZW1Qcm94eUVuYWJsZWRTZXR0aW5nSWQpICE9PSBmYWxzZTtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RTeXN0ZW1Qcm94eUVuYWJsZWRDb25maWdLZXldOiBlbmFibGVkIH0sXG5cdFx0fSwgdGhpcy5fY2xpZW50SWQsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29waWxvdE11bHRpUm9vdEVuYWJsZWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkKSA9PT0gdHJ1ZTtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IGVuYWJsZWQgfSxcblx0XHR9LCB0aGlzLl9jbGllbnRJZCwgMCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDbGF1ZGVNdWx0aVJvb3RFbmFibGVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkKSA9PT0gdHJ1ZTtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5XTogZW5hYmxlZCB9LFxuXHRcdH0sIHRoaXMuX2NsaWVudElkLCAwKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvZGV4TXVsdGlSb290RW5hYmxlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkKSA9PT0gdHJ1ZTtcblx0XHR0aGlzLmRpc3BhdGNoQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXldOiBlbmFibGVkIH0sXG5cdFx0fSwgdGhpcy5fY2xpZW50SWQsIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29kZXhFbmFibGVkKCk6IHZvaWQge1xuXHRcdC8vIEFsd2F5cyBmb3J3YXJkcyB0aGUgY3VycmVudCB2YWx1ZTsgdGhlIGhvc3Qgb25seSBhY3RzIG9uIGVuYWJsZSwgc28gYVxuXHRcdC8vIGZvcndhcmRlZCBgZmFsc2VgIG9ubHkgdGFrZXMgZWZmZWN0IG9uIHRoZSBuZXh0IGFnZW50IGhvc3QgcmVzdGFydFxuXHRcdC8vIChvdGhlcndpc2UgaW4tcHJvZ3Jlc3MgQ29kZXggc2Vzc2lvbnMgd291bGQgaGF2ZSB0byBiZSBzdG9wcGVkKS5cblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWQpID09PSB0cnVlO1xuXHRcdHRoaXMuZGlzcGF0Y2hBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdENvZGV4RW5hYmxlZENvbmZpZ0tleV06IGVuYWJsZWQgfSxcblx0XHR9LCB0aGlzLl9jbGllbnRJZCwgMCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaEFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyBbQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5XTogZ2V0QWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSB9LFxuXHRcdH0sIHRoaXMuX2NsaWVudElkLCAwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21tb24gcGF0aCBmb3Igb3V0Z29pbmcgSlNPTi1SUEMgcmVxdWVzdHM6IHF1ZXVlIHByZS1pbml0aWFsaXplIHRyYWZmaWMsXG5cdCAqIGdhdGUgb24gYW55IGluLWZsaWdodCByZWNvbm5lY3QgKHVubGVzcyBleHBsaWNpdGx5IGJ5cGFzc2VkIGZvciB0aGVcblx0ICogYHJlY29ubmVjdGAgUlBDIGl0c2VsZiksIGFzc2lnbiBhbiBpZCwgcmVnaXN0ZXIgdGhlIHBlbmRpbmcgZGVmZXJyZWQsIGFuZFxuXHQgKiB3cml0ZSB0byB0aGUgd2lyZS5cblx0ICpcblx0ICogVGhlIHJlY29ubmVjdC1nYXRlIGJ5cGFzcyBleGlzdHMgYmVjYXVzZSB0aGUgYHJlY29ubmVjdGAgcmVxdWVzdCBpcyBzZW50XG5cdCAqIGZyb20gaW5zaWRlIGBfYXR0ZW1wdFJlY29ubmVjdGAgd2hpbGUgdGhlIGdhdGUgaXMgZW5nYWdlZCwgc28gaXQgY2FuJ3Rcblx0ICogd2FpdCBvbiBpdHMgb3duIHJlc29sdXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9kaXNwYXRjaFJlcXVlc3Q8VFJlc3VsdD4oXG5cdFx0bWV0aG9kOiBzdHJpbmcsXG5cdFx0cGFyYW1zOiB1bmtub3duLFxuXHRcdG9wdGlvbnM6IHsgcmVhZG9ubHkgYnlwYXNzSW5pdGlhbGl6ZVF1ZXVlPzogYm9vbGVhbjsgcmVhZG9ubHkgYWxsb3dJbmNvbXBhdGlibGVVcGdyYWRlPzogYm9vbGVhbjsgcmVhZG9ubHkgYnlwYXNzUmVjb25uZWN0R2F0ZT86IGJvb2xlYW4gfSA9IHt9LFxuXHQpOiBQcm9taXNlPFRSZXN1bHQ+IHtcblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkKSB7XG5cdFx0XHR0aHJvdyB0aGlzLl9zdGF0ZS5lcnJvcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZSkge1xuXHRcdFx0aWYgKCFvcHRpb25zLmFsbG93SW5jb21wYXRpYmxlVXBncmFkZSkge1xuXHRcdFx0XHR0aHJvdyB0aGlzLl9zdGF0ZS5lcnJvcjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgcmVxdWVzdCwgcmVzdWx0IH0gPSB0aGlzLl9jcmVhdGVSZXF1ZXN0PFRSZXN1bHQ+KG1ldGhvZCwgcGFyYW1zKTtcblx0XHRcdHRoaXMuX3RyYW5zcG9ydC5zZW5kKHJlcXVlc3QpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0aWYgKCFvcHRpb25zLmJ5cGFzc0luaXRpYWxpemVRdWV1ZSAmJiBpc0NsaWVudFRyYW5zcG9ydCh0aGlzLl90cmFuc3BvcnQpICYmIHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkNvbm5lY3RpbmcpIHtcblx0XHRcdGNvbnN0IHsgcmVxdWVzdCwgcmVzdWx0IH0gPSB0aGlzLl9jcmVhdGVSZXF1ZXN0PFRSZXN1bHQ+KG1ldGhvZCwgcGFyYW1zKTtcblx0XHRcdHRoaXMuX3N0YXRlLm91dGJveC5wdXNoKHJlcXVlc3QgYXMgUHJvdG9jb2xNZXNzYWdlKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdC8vIFJpZGUgdGhyb3VnaCBhbnkgbnVtYmVyIG9mIHJlY29ubmVjdCBjeWNsZXMgdW50aWwgdGhlIGNsaWVudCBpc1xuXHRcdC8vIGVpdGhlciBDb25uZWN0ZWQgKHByb2NlZWQpIG9yIENsb3NlZCAodGhyb3cpLiBBIHRyYW5zaWVudCBmYWlsZWRcblx0XHQvLyBhdHRlbXB0IGRvZXMgTk9UIHN1cmZhY2UgdG8gdGhlIGNhbGxlciBcdTIwMTQgdGhlIHJlcXVlc3Qgc3RheXMgZ2F0ZWRcblx0XHQvLyB1bnRpbCB0aGUgY29ubmVjdGlvbiBldmVudHVhbGx5IHJlc3VtZXMsIG1hdGNoaW5nIGhvdyB0aGVcblx0XHQvLyBub3RpZmljYXRpb24gb3V0Ym94IHJpZGVzIGFjcm9zcyByZXRyaWVzLiBBIHN1YnNlcXVlbnQgdHJhbnNwb3J0XG5cdFx0Ly8gZHJvcCB0aGF0IGJvdW5jZXMgdXMgYmFjayBpbnRvIFJlY29ubmVjdGluZyBhZnRlciB0aGUgZ2F0ZSBhbHJlYWR5XG5cdFx0Ly8gcmVzb2x2ZWQgaXMgYWxzbyBoYW5kbGVkIGhlcmU6IHRoZSBsb29wIHJlLWNoZWNrcyBzdGF0ZSBvbiBlYWNoXG5cdFx0Ly8gaXRlcmF0aW9uIHNvIHdlIG5ldmVyIHNlbmQgb24gYSBkZWFkL3JlY29ubmVjdGluZyB0cmFuc3BvcnQuXG5cdFx0d2hpbGUgKCFvcHRpb25zLmJ5cGFzc1JlY29ubmVjdEdhdGUgJiYgdGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuUmVjb25uZWN0aW5nKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fc3RhdGUgYXMgQ2xpZW50U3RhdGU7XG5cdFx0XHRpZiAoY3VycmVudC5raW5kICE9PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBjdXJyZW50LnJlY29ubmVjdC5nYXRlLnA7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gVHJhbnNpZW50IGF0dGVtcHQgZmFpbHVyZSBcdTIwMTQgc3dhbGxvdyBhbmQgcmUtY2hlY2sgc3RhdGUgb24gdGhlXG5cdFx0XHRcdC8vIG5leHQgbG9vcCBpdGVyYXRpb24uIElmIHdlIHRyYW5zaXRpb25lZCB0byBDbG9zZWQgdGhlIGNoZWNrXG5cdFx0XHRcdC8vIGFmdGVyIHRoZSBsb29wIHN1cmZhY2VzIHRoZSBlcnJvcjsgaWYgd2UncmUgc3RpbGwgUmVjb25uZWN0aW5nXG5cdFx0XHRcdC8vIHdpdGggYSBmcmVzaCBnYXRlIHdlJ2xsIGF3YWl0IHRoYXQgb25lLlxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fc3RhdGUgYXMgQ2xpZW50U3RhdGU7XG5cdFx0aWYgKGN1cnJlbnQua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkIHx8IGN1cnJlbnQua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlKSB7XG5cdFx0XHR0aHJvdyBjdXJyZW50LmVycm9yO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcmVxdWVzdCwgcmVzdWx0IH0gPSB0aGlzLl9jcmVhdGVSZXF1ZXN0PFRSZXN1bHQ+KG1ldGhvZCwgcGFyYW1zKTtcblx0XHR0aGlzLl90cmFuc3BvcnQuc2VuZChyZXF1ZXN0KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUmVxdWVzdDxUUmVzdWx0PihtZXRob2Q6IHN0cmluZywgcGFyYW1zOiB1bmtub3duKTogeyByZXF1ZXN0OiBKc29uUnBjUmVxdWVzdDsgcmVzdWx0OiBQcm9taXNlPFRSZXN1bHQ+IH0ge1xuXHRcdGNvbnN0IGlkID0gdGhpcy5fbmV4dFJlcXVlc3RJZCsrO1xuXHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx1bmtub3duPigpO1xuXHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5zZXQoaWQsIHsgZGVmZXJyZWQsIHN1cHByZXNzTm90Rm91bmRXYXJuaW5nOiBpc0ZpbGVSZXNvdXJjZVJlYWQobWV0aG9kLCBwYXJhbXMpLCBzZW50QXQ6IERhdGUubm93KCkgfSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlcXVlc3Q6IHsganNvbnJwYzogJzIuMCcsIGlkLCBtZXRob2QsIHBhcmFtcyB9LFxuXHRcdFx0cmVzdWx0OiBkZWZlcnJlZC5wIGFzIFByb21pc2U8VFJlc3VsdD4sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZExvZ0ZhaWxlZFJlcXVlc3QocmVxdWVzdDogSVBlbmRpbmdSZXF1ZXN0LCBlcnJvcjogSnNvblJwY0Vycm9yUmVzcG9uc2VbJ2Vycm9yJ10pOiBib29sZWFuIHtcblx0XHRpZiAoZXJyb3IuY29kZSA9PT0gQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCAmJiByZXF1ZXN0LnN1cHByZXNzTm90Rm91bmRXYXJuaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Qcm90b2NvbEVycm9yKGVycm9yOiBKc29uUnBjRXJyb3JSZXNwb25zZVsnZXJyb3InXSk6IFByb3RvY29sRXJyb3Ige1xuXHRcdHJldHVybiBuZXcgUHJvdG9jb2xFcnJvcihlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBlcnJvci5kYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlamVjdFBlbmRpbmdSZXF1ZXN0cyhlcnJvcjogUHJvdG9jb2xFcnJvcik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiB0aGlzLl9wZW5kaW5nUmVxdWVzdHMudmFsdWVzKCkpIHtcblx0XHRcdHBlbmRpbmcuZGVmZXJyZWQuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuY2xlYXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNldCB0aGUgbGl2ZW5lc3MgdGltZXJzLiBDYWxsZWQgYXQgY29uc3RydWN0aW9uIGZvciBhbiBhbHJlYWR5LW9wZW5cblx0ICogcGFzc2l2ZSB0cmFuc3BvcnQsIGFmdGVyIGEgc3VjY2Vzc2Z1bCBjbGllbnQtdHJhbnNwb3J0IGluaXRpYWxpemF0aW9uLFxuXHQgKiBvbmNlIG9uIGV2ZXJ5IHJlY2VpdmVkIG1lc3NhZ2UgKHdoaWNoIGlzIGl0c2VsZiBwcm9vZiB0aGUgcmVtb3RlIGlzXG5cdCAqIGFsaXZlKSwgYW5kIG9uY2UgYWZ0ZXIgYSBzdWNjZXNzZnVsIHNvZnQgcmVjb25uZWN0LlxuXHQgKlxuXHQgKiBUd28gdGltZXJzIGNvb3BlcmF0ZTpcblx0ICpcblx0ICogMS4ge0BsaW5rIF9waW5nVGltZXJ9IGZpcmVzIGFmdGVyIHtAbGluayBQSU5HX0lOVEVSVkFMX01TfSBvZiBzaWxlbmNlXG5cdCAqICAgIGFuZCBzZW5kcyBhbiBhcHBsaWNhdGlvbi1sZXZlbCBgcGluZ2Agc28gdGhlIGNsb3NlIHRpbWVyIGhhc1xuXHQgKiAgICBzb21ldGhpbmcgdG8gdGltZSBvdXQgb24uIFRvbGVyYXRlcyBzZXJ2ZXJzIHRoYXQgZG9uJ3QgaW1wbGVtZW50XG5cdCAqICAgIGBwaW5nYCBcdTIwMTQgdGhlIGVycm9yIHJlc3BvbnNlIHN0aWxsIHJlc2V0cyBib3RoIHRpbWVycy5cblx0ICpcblx0ICogMi4ge0BsaW5rIF9jbG9zZVRpbWVyfSBmaXJlcyBhZnRlciB7QGxpbmsgUElOR19JTlRFUlZBTF9NU30rXG5cdCAqICAgIHtAbGluayBMSVZFTkVTU19USU1FT1VUX01TfSBvZiBjb250aW51ZWQgc2lsZW5jZSBhbmQgZm9yY2UtY2xvc2VzXG5cdCAqICAgIHRoZSB0cmFuc3BvcnQgc28gdGhlIHJlbmRlcmVyJ3MgcmVjb25uZWN0IGxvZ2ljIGtpY2tzIGluLiBDYXRjaGVzXG5cdCAqICAgIHNpbGVudGx5LWRlYWQgdHJhbnNwb3J0cyAoZS5nLiBTU0gvdHVubmVsIGFmdGVyIGxhcHRvcCBzbGVlcCArXG5cdCAqICAgIG5ldHdvcmsgY2hhbmdlKSB0aGF0IGRvbid0IGVtaXQgYSBzb2NrZXQgY2xvc2UgZXZlbnQgb2YgdGhlaXIgb3duLlxuXHQgKlxuXHQgKiBBZnRlciBsYXB0b3Agc2xlZXAgKyB3YWtlIHRoZSBKUyBldmVudCBsb29wIGlzIHBhdXNlZCwgc28gYSB0aW1lclxuXHQgKiBhcm1lZCBiZWZvcmUgc2xlZXAgZmlyZXMgaW1tZWRpYXRlbHkgYWZ0ZXIgd2FrZS4gVGhhdCdzIGZpbmUgXHUyMDE0XG5cdCAqIGFueSBpbmJvdW5kIG1lc3NhZ2UgcHJvY2Vzc2VkIGR1cmluZyB0aGUgd2FrZSBjYXRjaC11cCByZXNldHMgaXRcblx0ICogYmVmb3JlIHRoZSBjbG9zZSBoYW5kbGVyIHJ1bnMuXG5cdCAqXG5cdCAqIE5vLW9wIHdoaWxlIHtAbGluayBfc3RhdGUua2luZH0gaXMge0BsaW5rIEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZX0sXG5cdCAqIHtAbGluayBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3Rpbmd9LCBvciB7QGxpbmsgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkfTpcblx0ICogdGhlIHRyYW5zcG9ydCBpcyBub3QgYXZhaWxhYmxlIGZvciBub3JtYWwgbGl2ZW5lc3MgdHJhZmZpYyBpbiB0aG9zZSBzdGF0ZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNldExpdmVuZXNzVGltZXJzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5JbmNvbXBhdGlibGVcblx0XHRcdHx8IHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZ1xuXHRcdFx0fHwgdGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BpbmdUaW1lci5jYW5jZWxBbmRTZXQoKCkgPT4gdGhpcy5fb25QaW5nVGltZXIoKSwgUElOR19JTlRFUlZBTF9NUyk7XG5cdFx0dGhpcy5fY2xvc2VUaW1lci5jYW5jZWxBbmRTZXQoKCkgPT4gdGhpcy5fb25DbG9zZVRpbWVyKCksIFBJTkdfSU5URVJWQUxfTVMgKyBMSVZFTkVTU19USU1FT1VUX01TKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbExpdmVuZXNzVGltZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BpbmdUaW1lci5jYW5jZWwoKTtcblx0XHR0aGlzLl9jbG9zZVRpbWVyLmNhbmNlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25QaW5nVGltZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZVxuXHRcdFx0fHwgdGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkXG5cdFx0XHR8fCB0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRmlyZS1hbmQtZm9yZ2V0LiBUaGUgcmVwbHkgKG9yIGFueSBvdGhlciBpbmJvdW5kIG1lc3NhZ2UgdGhhdFxuXHRcdC8vIGhhcHBlbnMgdG8gYXJyaXZlIGZpcnN0KSB3aWxsIHJlc2V0IGJvdGggdGltZXJzOyBpZiBub3RoaW5nXG5cdFx0Ly8gYXJyaXZlcywge0BsaW5rIF9vbkNsb3NlVGltZXJ9IGZpcmVzLlxuXHRcdHZvaWQgdGhpcy5waW5nKCkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX29uQ2xvc2VUaW1lcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUua2luZCA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuSW5jb21wYXRpYmxlXG5cdFx0XHR8fCB0aGlzLl9zdGF0ZS5raW5kID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5DbG9zZWRcblx0XHRcdHx8IHRoaXMuX3N0YXRlLmtpbmQgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyB7QGxpbmsgSUxvYWRFc3RpbWF0b3J9IGd1YXJkcyBhZ2FpbnN0IHRoZSAqbG9jYWwqIHNpZGUgb2YgdGhlXG5cdFx0Ly8gY29uZnVzaW9uOiBpZiBvdXIgb3duIEpTIGV2ZW50IGxvb3AgaGFzIGJlZW4gcGVnZ2VkIHdlIHN1cHByZXNzXG5cdFx0Ly8gdGhlIGNsb3NlIFx1MjAxNCB0aGUgc2lsZW5jZSBpcyBvbiBvdXIgZW5kLCBub3QgdGhlIHJlbW90ZSdzLCBhbmRcblx0XHQvLyB0ZWFyaW5nIGRvd24gdGhlIHRyYW5zcG9ydCB3b3VsZCBqdXN0IGFib3J0IGluLWZsaWdodCByZXF1ZXN0cy5cblx0XHQvLyBSZS1hcm0gb25seSB0aGUgY2xvc2UgdGltZXIgYXQge0BsaW5rIFBJTkdfSU5URVJWQUxfTVN9IHNvIHdlXG5cdFx0Ly8gcmUtZXZhbHVhdGUgcHJvbXB0bHkgb25jZSBsb2FkIG5vcm1hbGl6ZXMgKHJhdGhlciB0aGFuIHdhaXRpbmcgYVxuXHRcdC8vIGZ1bGwgUElOR19JTlRFUlZBTCArIExJVkVORVNTX1RJTUVPVVQgd2luZG93KS5cblx0XHRpZiAodGhpcy5fbG9hZEVzdGltYXRvci5oYXNIaWdoTG9hZCgpKSB7XG5cdFx0XHR0aGlzLl9jbG9zZVRpbWVyLmNhbmNlbEFuZFNldCgoKSA9PiB0aGlzLl9vbkNsb3NlVGltZXIoKSwgUElOR19JTlRFUlZBTF9NUyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNpbGVuY2UgPSBEYXRlLm5vdygpIC0gdGhpcy5fbGFzdFJlYWRUaW1lO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdGBbUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xdIExpdmVuZXNzOiBubyBtZXNzYWdlIGZyb20gJHt0aGlzLl9hZGRyZXNzfSBmb3IgJHtzaWxlbmNlfW1zOyBmb3JjaW5nIGNsb3NlIHRvIHRyaWdnZXIgcmVjb25uZWN0LmAsXG5cdFx0KTtcblx0XHQvLyBUZWFyIGRvd24gdGhlIGRlYWQgdHJhbnNwb3J0IHNvIGl0IGNhbid0IGtlZXAgZGVsaXZlcmluZyBtZXNzYWdlc1xuXHRcdC8vIHRvIGEgUmVjb25uZWN0aW5nL0Nsb3NlZCBjbGllbnQgKGFuZCwgb24gdGhlIG5vbi1mYWN0b3J5IHBhdGgsXG5cdFx0Ly8gc28gd2UgZG9uJ3QgbGVhayBhIGhhbGYtb3BlbiBzb2NrZXQgd2FpdGluZyBmb3IgY2xpZW50IGRpc3Bvc2FsKS5cblx0XHQvLyBXZWJTb2NrZXRDbGllbnRUcmFuc3BvcnQuZGlzcG9zZSgpIGRpc3Bvc2VzIGl0cyBlbWl0dGVyc1xuXHRcdC8vIHN5bmNocm9ub3VzbHkgYmVmb3JlIHRoZSBuYXRpdmUgY2xvc2UgZXZlbnQgYXJyaXZlcywgc28gdGhpc1xuXHRcdC8vIHdvbid0IHJlLWVudGVyIHtAbGluayBfaGFuZGxlVHJhbnNwb3J0Q2xvc2V9LlxuXHRcdHRoaXMuX3RyYW5zcG9ydExpc3RlbmVycy5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl90cmFuc3BvcnRGYWN0b3J5KSB7XG5cdFx0XHQvLyBJbiBmYWN0b3J5IG1vZGUsIHJvdXRlIGRpcmVjdGx5IHRocm91Z2ggdGhlIHNvZnQtcmVjb25uZWN0IHBhdGguXG5cdFx0XHR0aGlzLl9yZWplY3RQZW5kaW5nUmVxdWVzdHMoY29ubmVjdGlvblRpbWVvdXRFcnJvcih0aGlzLl9hZGRyZXNzLCBzaWxlbmNlKSk7XG5cdFx0XHR0aGlzLl9oYW5kbGVUcmFuc3BvcnRDbG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9oYW5kbGVDbG9zZShjb25uZWN0aW9uVGltZW91dEVycm9yKHRoaXMuX2FkZHJlc3MsIHNpbGVuY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIG5leHQgY2xpZW50IHNlcXVlbmNlIG51bWJlciBmb3Igb3B0aW1pc3RpYyBkaXNwYXRjaC5cblx0ICovXG5cdG5leHRDbGllbnRTZXEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbmV4dENsaWVudFNlcSsrO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVNBLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJBQWlCLHlCQUFxQztBQUMzRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1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QUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQThCUSx1QkFBNkI7QUFDcEMsUUFBSSxLQUFLLE9BQU8sU0FBUyxxQ0FDckIsS0FBSyxPQUFPLFNBQVMscUNBQ3JCLEtBQUssT0FBTyxTQUFTLHVCQUE2QjtBQUNyRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVcsYUFBYSxNQUFNLEtBQUssYUFBYSxHQUFHLGdCQUFnQjtBQUN4RSxTQUFLLFlBQVksYUFBYSxNQUFNLEtBQUssY0FBYyxHQUFHLG1CQUFtQixtQkFBbUI7QUFBQSxFQUNqRztBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFNBQUssV0FBVyxPQUFPO0FBQ3ZCLFNBQUssWUFBWSxPQUFPO0FBQUEsRUFDekI7QUFBQSxFQUVRLGVBQXFCO0FBQzVCLFFBQUksS0FBSyxPQUFPLFNBQVMscUNBQ3JCLEtBQUssT0FBTyxTQUFTLHlCQUNyQixLQUFLLE9BQU8sU0FBUyxtQ0FBbUM7QUFDM0Q7QUFBQSxJQUNEO0FBSUEsU0FBSyxLQUFLLEtBQUssRUFBRSxNQUFNLE1BQU0sTUFBUztBQUFBLEVBQ3ZDO0FBQUEsRUFFUSxnQkFBc0I7QUFDN0IsUUFBSSxLQUFLLE9BQU8sU0FBUyxxQ0FDckIsS0FBSyxPQUFPLFNBQVMseUJBQ3JCLEtBQUssT0FBTyxTQUFTLG1DQUFtQztBQUMzRDtBQUFBLElBQ0Q7QUFRQSxRQUFJLEtBQUssZUFBZSxZQUFZLEdBQUc7QUFDdEMsV0FBSyxZQUFZLGFBQWEsTUFBTSxLQUFLLGNBQWMsR0FBRyxnQkFBZ0I7QUFDMUU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxVQUFVLEtBQUssSUFBSSxJQUFJLEtBQUs7QUFDbEMsU0FBSyxZQUFZO0FBQUEsTUFDaEIsdURBQXVELEtBQUssUUFBUSxRQUFRLE9BQU87QUFBQSxJQUNwRjtBQU9BLFNBQUssb0JBQW9CLE1BQU07QUFDL0IsUUFBSSxLQUFLLG1CQUFtQjtBQUUzQixXQUFLLHVCQUF1Qix1QkFBdUIsS0FBSyxVQUFVLE9BQU8sQ0FBQztBQUMxRSxXQUFLLHNCQUFzQjtBQUMzQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGFBQWEsdUJBQXVCLEtBQUssVUFBVSxPQUFPLENBQUM7QUFBQSxFQUNqRTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsZ0JBQXdCO0FBQ3ZCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQWhtRGEsZ0NBQU47QUFBQSxFQXdJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0ExSVU7IiwKICAibmFtZXMiOiBbIkFnZW50SG9zdENsaWVudFN0YXRlIiwgInJlcXVlc3QiLCAicmVzdWx0IiwgImN1cnJlbnQiXQp9Cg==
