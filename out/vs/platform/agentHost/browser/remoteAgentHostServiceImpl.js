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
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { DeferredPromise, raceTimeout } from "../../../base/common/async.js";
import { ConfigurationTarget, IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILabelService } from "../../label/common/label.js";
import { ILogService } from "../../log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { AgentHostAhpJsonlLoggingSettingId } from "../common/agentService.js";
import {
  RemoteAgentHostConnectionStatus,
  RemoteAgentHostEntryType,
  RemoteAgentHostsEnabledSettingId,
  RemoteAgentHostsSettingId,
  entryToRawEntry,
  getEntryAddress,
  rawEntryToEntry
} from "../common/remoteAgentHostService.js";
import { RemoteAgentHostProtocolClient, AgentHostClientState } from "./remoteAgentHostProtocolClient.js";
import { WebSocketClientTransport } from "./webSocketClientTransport.js";
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority, normalizeRemoteAgentHostAddress } from "../common/agentHostUri.js";
import { isDefined } from "../../../base/common/types.js";
import { PROTOCOL_VERSION } from "../common/state/protocol/version/registry.js";
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from "../common/agentHostClientInfo.js";
const SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY = "remoteAgentHost.sshConnections";
function disposeEntry(entry) {
  entry.store.dispose();
  entry.transportDisposable?.dispose();
}
function isRawRemoteAgentHostEntry(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value;
  return typeof candidate.address === "string" && typeof candidate.name === "string" && (candidate.connectionToken === void 0 || typeof candidate.connectionToken === "string") && (candidate.sshConfigHost === void 0 || typeof candidate.sshConfigHost === "string") && (candidate.sshHostName === void 0 || typeof candidate.sshHostName === "string") && (candidate.sshUser === void 0 || typeof candidate.sshUser === "string") && (candidate.sshPort === void 0 || typeof candidate.sshPort === "number");
}
let RemoteAgentHostService = class extends Disposable {
  constructor(_configurationService, _instantiationService, _logService, _labelService, _environmentService, _storageService) {
    super();
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._labelService = _labelService;
    this._environmentService = _environmentService;
    this._storageService = _storageService;
    this._onDidChangeConnections = this._register(new Emitter());
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._entries = /* @__PURE__ */ new Map();
    this._names = /* @__PURE__ */ new Map();
    this._tokens = /* @__PURE__ */ new Map();
    /**
     * Stores the original {@link IRemoteAgentHostEntry} for connections
     * registered via {@link addManagedConnection}. This is needed because
     * tunnel entries are not persisted to settings and therefore don't
     * appear in {@link configuredEntries}.
     */
    this._registeredEntries = /* @__PURE__ */ new Map();
    this._pendingConnectionWaits = /* @__PURE__ */ new Map();
    /** Pending reconnect timeouts, keyed by normalized address. */
    this._reconnectTimeouts = /* @__PURE__ */ new Map();
    /** Current reconnect attempt count per address for exponential backoff. */
    this._reconnectAttempts = /* @__PURE__ */ new Map();
    /**
     * Per-address {@link ILabelService} formatter handles for the
     * {@link AGENT_HOST_SCHEME}. The formatter advertises the entry's
     * human-readable name as the host label so any UI looking up the host
     * label for an agent host URI gets the friendly name.
     */
    this._labelFormatters = /* @__PURE__ */ new Map();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
        this._reconcileConnections();
      }
    }));
    this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, this._store)(() => {
      this._reconcileConnections();
      this._onDidChangeConnections.fire();
    }));
    this._migrateSSHEntriesFromSetting();
    this._reconcileConnections();
  }
  get clientInfo() {
    return editorWindowAgentHostClientInfo;
  }
  get connections() {
    const result = [];
    for (const [address, entry] of this._entries) {
      result.push({
        address,
        name: this._names.get(address) ?? address,
        clientId: entry.client.clientId,
        defaultDirectory: entry.client.defaultDirectory,
        status: entry.status
      });
    }
    return result;
  }
  get configuredEntries() {
    return this._getConfiguredEntries().map((e) => {
      if (e.connection.type === RemoteAgentHostEntryType.Tunnel) {
        return e;
      }
      return { ...e, connection: { ...e.connection, address: normalizeRemoteAgentHostAddress(e.connection.address) } };
    });
  }
  getConnection(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const entry = this._entries.get(normalized);
    return entry?.connected ? entry.client : void 0;
  }
  getConnectionByAuthority(authority) {
    for (const [address, entry] of this._entries) {
      if (entry.connected && agentHostAuthority(address) === authority) {
        return entry.client;
      }
    }
    return void 0;
  }
  getEntryByAddress(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const registered = this._registeredEntries.get(normalized);
    if (registered) {
      return registered;
    }
    return this.configuredEntries.find(
      (e) => normalizeRemoteAgentHostAddress(getEntryAddress(e)) === normalized
    );
  }
  async triggerServerUpgrade(address, method) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const entry = this._entries.get(normalized);
    if (!entry) {
      throw new Error(`No remote agent host entry found for ${address}.`);
    }
    const result = await raceTimeout(
      entry.client.triggerVscodeUpgrade(method),
      RemoteAgentHostService.UpgradeRequestTimeout
    );
    if (result === void 0) {
      throw new Error(`Server upgrade request timed out after ${RemoteAgentHostService.UpgradeRequestTimeout}ms.`);
    }
    return result;
  }
  reconnect(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const configuredEntry = this._getConfiguredEntries().find(
      (e) => normalizeRemoteAgentHostAddress(getEntryAddress(e)) === normalized
    );
    if (configuredEntry && configuredEntry.connection.type !== RemoteAgentHostEntryType.WebSocket) {
      return;
    }
    const token = this._tokens.get(normalized);
    this._cancelReconnect(normalized);
    this._reconnectAttempts.delete(normalized);
    const entry = this._entries.get(normalized);
    if (entry) {
      this._entries.delete(normalized);
      entry.store.dispose();
    }
    this._connectTo(normalized, token);
  }
  async addRemoteAgentHost(input) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const entry = input.connection.type === RemoteAgentHostEntryType.Tunnel ? input : { ...input, connection: { ...input.connection, address: normalizeRemoteAgentHostAddress(input.connection.address) } };
    const address = getEntryAddress(entry);
    const existingConnection = this._getConnectionInfo(address);
    await this._storeConfiguredEntries(this._upsertConfiguredEntry(entry));
    if (existingConnection) {
      return {
        ...existingConnection,
        name: entry.name
      };
    }
    if (entry.connection.type === RemoteAgentHostEntryType.SSH) {
      return {
        address,
        name: entry.name,
        clientId: "",
        status: RemoteAgentHostConnectionStatus.disconnected
      };
    }
    const connectedConnection = this._getConnectionInfo(address);
    if (connectedConnection) {
      return connectedConnection;
    }
    const wait = this._getOrCreateConnectionWait(address);
    const connection = await raceTimeout(wait.p, RemoteAgentHostService.ConnectionWaitTimeout, () => {
      this._pendingConnectionWaits.delete(address);
    });
    if (!connection) {
      throw new Error(`Timed out connecting to ${address}`);
    }
    return connection;
  }
  async addManagedConnection(entry, connection, transportDisposable, status = RemoteAgentHostConnectionStatus.connected) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const address = getEntryAddress(entry);
    const existingEntry = this._entries.get(address);
    if (existingEntry) {
      this._entries.delete(address);
      existingEntry.store.dispose();
    }
    const store = new DisposableStore();
    const protocolClient = connection;
    store.add(protocolClient);
    const connEntry = { store, client: protocolClient, transportDisposable, connected: RemoteAgentHostConnectionStatus.isConnected(status), status };
    this._entries.set(address, connEntry);
    this._names.set(address, entry.name);
    this._registeredEntries.set(address, entry);
    this._updateHostLabelFormatter(address, entry.name);
    if (entry.connectionToken) {
      this._tokens.set(address, entry.connectionToken);
    }
    store.add(protocolClient.onDidClose(() => {
      if (this._entries.get(address) === connEntry) {
        connEntry.connected = false;
        connEntry.status = RemoteAgentHostConnectionStatus.disconnected;
        this._onDidChangeConnections.fire();
      }
    }));
    await this._storeConfiguredEntries(this._upsertConfiguredEntry(entry));
    this._onDidChangeConnections.fire();
    return {
      address,
      name: entry.name,
      clientId: protocolClient.clientId,
      defaultDirectory: protocolClient.defaultDirectory,
      status
    };
  }
  async removeRemoteAgentHost(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const entries = this._getConfiguredEntries().filter(
      (e) => normalizeRemoteAgentHostAddress(getEntryAddress(e)) !== normalized
    );
    await this._storeConfiguredEntries(entries);
    this._names.delete(normalized);
    this._tokens.delete(normalized);
    this._registeredEntries.delete(normalized);
    this._clearHostLabelFormatter(normalized);
    this._cancelReconnect(normalized);
    this._reconnectAttempts.delete(normalized);
    this._removeConnection(normalized);
  }
  _removeConnection(address) {
    const entry = this._entries.get(address);
    if (entry) {
      this._entries.delete(address);
      disposeEntry(entry);
      this._rejectPendingConnectionWait(address, new Error(`Connection closed: ${address}`));
      this._onDidChangeConnections.fire();
    }
  }
  notifyConnectionClosed(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    const entry = this._entries.get(normalized);
    if (entry) {
      this._logService.info(`[RemoteAgentHost] notifyConnectionClosed: notifying protocol client for ${normalized}`);
      entry.client.notifyTransportClosed();
    } else {
      this._logService.info(`[RemoteAgentHost] notifyConnectionClosed: no entry found for ${normalized} (already removed?)`);
    }
  }
  _reconcileConnections() {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      for (const address of [...this._entries.keys()]) {
        this._cancelReconnect(address);
        this._removeConnection(address);
      }
      this._names.clear();
      this._tokens.clear();
      this._reconnectAttempts.clear();
      for (const address of [...this._labelFormatters.keys()]) {
        if (!this._registeredEntries.has(address)) {
          this._clearHostLabelFormatter(address);
        }
      }
      return;
    }
    const configuredEntries = this._getConfiguredEntries();
    const entriesWithAddress = configuredEntries.map((e) => ({ entry: e, address: normalizeRemoteAgentHostAddress(getEntryAddress(e)) }));
    const desired = new Set(entriesWithAddress.map((e) => e.address));
    this._logService.info(`[RemoteAgentHost] Reconciling: desired=[${[...desired].join(", ")}], current=[${[...this._entries.keys()].map((a) => `${a}(${this._entries.get(a).connected ? "connected" : "pending"})`).join(", ")}]`);
    let namesChanged = false;
    const oldNames = new Map(this._names);
    this._names.clear();
    this._tokens.clear();
    for (const { entry, address } of entriesWithAddress) {
      this._names.set(address, entry.name);
      this._tokens.set(address, entry.connectionToken);
      this._updateHostLabelFormatter(address, entry.name);
      if (this._entries.has(address) && oldNames.get(address) !== entry.name) {
        namesChanged = true;
      }
    }
    for (const address of [...this._labelFormatters.keys()]) {
      if (!desired.has(address) && !this._registeredEntries.has(address)) {
        this._clearHostLabelFormatter(address);
      }
    }
    for (const address of [...this._entries.keys()]) {
      if (!desired.has(address)) {
        this._logService.info(`[RemoteAgentHost] Disconnecting from ${address}`);
        this._cancelReconnect(address);
        this._reconnectAttempts.delete(address);
        this._removeConnection(address);
      }
    }
    for (const { entry, address } of entriesWithAddress) {
      if (!this._entries.has(address) && entry.connection.type === RemoteAgentHostEntryType.WebSocket) {
        this._connectTo(address, entry.connectionToken);
      }
    }
    if (namesChanged) {
      this._onDidChangeConnections.fire();
    }
  }
  _connectTo(address, connectionToken) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return;
    }
    const existingEntry = this._entries.get(address);
    if (existingEntry) {
      this._entries.delete(address);
      existingEntry.store.dispose();
    }
    const store = new DisposableStore();
    const ahpLoggingEnabled = !!this._configurationService.getValue(AgentHostAhpJsonlLoggingSettingId);
    const transportFactory = () => this._instantiationService.createInstance(
      WebSocketClientTransport,
      address,
      connectionToken,
      ahpLoggingEnabled ? { logsHome: this._environmentService.logsHome, connectionId: address, transport: "websocket" } : void 0
    );
    const client = store.add(this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address, transportFactory, void 0, void 0, this.clientInfo));
    const entry = { store, client, connected: false, status: RemoteAgentHostConnectionStatus.connecting };
    this._entries.set(address, entry);
    const isCurrentEntry = () => this._entries.get(address) === entry;
    store.add(client.onDidClose(() => {
      if (!isCurrentEntry()) {
        return;
      }
      this._logService.warn(`[RemoteAgentHost] Connection closed: ${address}`);
      entry.connected = false;
      entry.status = RemoteAgentHostConnectionStatus.disconnected;
      this._onDidChangeConnections.fire();
      this._scheduleReconnect(address, connectionToken);
    }));
    store.add(client.onDidChangeConnectionState((state) => {
      if (!isCurrentEntry()) {
        return;
      }
      switch (state) {
        case AgentHostClientState.Reconnecting:
          entry.connected = false;
          entry.status = RemoteAgentHostConnectionStatus.connecting;
          this._onDidChangeConnections.fire();
          break;
        case AgentHostClientState.Connected:
          entry.connected = true;
          entry.status = RemoteAgentHostConnectionStatus.connected;
          this._onDidChangeConnections.fire();
          break;
        case AgentHostClientState.Connecting:
        case AgentHostClientState.Incompatible:
        case AgentHostClientState.Closed:
          break;
      }
    }));
    this._logService.info(`[RemoteAgentHost] Connecting to ${address}`);
    this._onDidChangeConnections.fire();
    client.connect().then(() => {
      if (store.isDisposed) {
        return;
      }
      this._logService.info(`[RemoteAgentHost] Connected to ${address}`);
      entry.connected = true;
      entry.status = RemoteAgentHostConnectionStatus.connected;
      this._reconnectAttempts.delete(address);
      this._resolvePendingConnectionWait(address);
      this._onDidChangeConnections.fire();
    }).catch((err) => {
      if (!isCurrentEntry()) {
        return;
      }
      const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
      if (incompatible) {
        this._logService.warn(`[RemoteAgentHost] Incompatible with ${address}: ${incompatible.kind === "incompatible" ? incompatible.message : ""}`);
        entry.status = incompatible;
        this._reconnectAttempts.delete(address);
        this._rejectPendingConnectionWait(address, err);
        this._onDidChangeConnections.fire();
        return;
      }
      this._logService.error(`[RemoteAgentHost] Failed to connect to ${address}. Verify address and connectionToken`, err);
      entry.status = RemoteAgentHostConnectionStatus.disconnected;
      this._entries.delete(address);
      entry.store.dispose();
      this._rejectPendingConnectionWait(address, err);
      this._onDidChangeConnections.fire();
      this._scheduleReconnect(address, connectionToken);
    });
  }
  /**
   * Schedule a reconnect attempt with exponential backoff.
   * Only reconnects if the address is still in the configured entries.
   */
  _scheduleReconnect(address, connectionToken) {
    if (!this._isAddressConfigured(address)) {
      this._logService.info(`[RemoteAgentHost] Not reconnecting to ${address}: no longer configured`);
      return;
    }
    const attempt = (this._reconnectAttempts.get(address) ?? 0) + 1;
    this._reconnectAttempts.set(address, attempt);
    const delay = Math.min(
      RemoteAgentHostService.ReconnectInitialDelay * Math.pow(2, attempt - 1),
      RemoteAgentHostService.ReconnectMaxDelay
    );
    this._logService.info(`[RemoteAgentHost] Scheduling reconnect to ${address} in ${delay}ms (attempt ${attempt})`);
    this._cancelReconnect(address);
    const timeout = setTimeout(() => {
      this._reconnectTimeouts.delete(address);
      if (this._isAddressConfigured(address)) {
        this._connectTo(address, connectionToken ?? this._tokens.get(address));
      }
    }, delay);
    this._reconnectTimeouts.set(address, timeout);
  }
  /** Cancel a pending reconnect timeout for the given address. */
  _cancelReconnect(address) {
    const timeout = this._reconnectTimeouts.get(address);
    if (timeout !== void 0) {
      clearTimeout(timeout);
      this._reconnectTimeouts.delete(address);
    }
  }
  /** Check whether the given normalized address is still in the configured entries. */
  _isAddressConfigured(address) {
    const entries = this._getConfiguredEntries();
    return entries.some((e) => normalizeRemoteAgentHostAddress(getEntryAddress(e)) === address);
  }
  _getConnectionInfo(address) {
    return this.connections.find((connection) => connection.address === address && RemoteAgentHostConnectionStatus.isConnected(connection.status));
  }
  _getConfiguredEntries() {
    return this._mergeConfiguredEntries(this._getConfiguredSettingEntries(), this._getStoredSSHEntries());
  }
  _upsertConfiguredEntry(entry) {
    const configuredEntries = this._mergeConfiguredEntries(this._getConfiguredSettingEntriesForTarget(), this._getStoredSSHEntries());
    const normalizedAddress = normalizeRemoteAgentHostAddress(getEntryAddress(entry));
    const existingIndex = configuredEntries.findIndex((e) => normalizeRemoteAgentHostAddress(getEntryAddress(e)) === normalizedAddress);
    if (existingIndex === -1) {
      return [...configuredEntries, entry];
    }
    return configuredEntries.map((e, index) => index === existingIndex ? entry : e);
  }
  _getConfigurationTarget() {
    const inspected = this._configurationService.inspect(RemoteAgentHostsSettingId);
    if (inspected.userLocalValue !== void 0) {
      return ConfigurationTarget.USER_LOCAL;
    }
    if (inspected.userRemoteValue !== void 0) {
      return ConfigurationTarget.USER_REMOTE;
    }
    if (inspected.userValue !== void 0) {
      return ConfigurationTarget.USER;
    }
    return ConfigurationTarget.USER;
  }
  async _storeConfiguredEntries(entries) {
    this._storeStoredSSHEntries(entries.filter((entry) => entry.connection.type === RemoteAgentHostEntryType.SSH));
    const raw = entries.filter((entry) => entry.connection.type !== RemoteAgentHostEntryType.SSH).map(entryToRawEntry).filter(isDefined);
    await this._configurationService.updateValue(RemoteAgentHostsSettingId, raw, this._getConfigurationTarget());
  }
  _getConfiguredSettingEntries() {
    return (this._configurationService.getValue(RemoteAgentHostsSettingId) ?? []).map(rawEntryToEntry).filter(isDefined);
  }
  _getConfiguredSettingEntriesForTarget() {
    return this._getConfiguredRawEntriesForTarget().map(rawEntryToEntry).filter(isDefined);
  }
  _getConfiguredRawEntriesForTarget() {
    const target = this._getConfigurationTarget();
    const inspected = this._configurationService.inspect(RemoteAgentHostsSettingId);
    switch (target) {
      case ConfigurationTarget.USER_LOCAL:
        return inspected.userLocalValue ?? [];
      case ConfigurationTarget.USER_REMOTE:
        return inspected.userRemoteValue ?? [];
      default:
        return inspected.userValue ?? [];
    }
  }
  _getStoredSSHEntries() {
    const raw = this._storageService.get(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((item) => isRawRemoteAgentHostEntry(item) ? rawEntryToEntry(item) : void 0).filter((entry) => entry?.connection.type === RemoteAgentHostEntryType.SSH);
    } catch {
      return [];
    }
  }
  _storeStoredSSHEntries(entries) {
    const raw = entries.filter((entry) => entry.connection.type === RemoteAgentHostEntryType.SSH).map(entryToRawEntry).filter(isDefined);
    if (raw.length === 0) {
      this._storageService.remove(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, StorageScope.APPLICATION);
    } else {
      this._storageService.store(SSH_REMOTE_AGENT_HOSTS_STORAGE_KEY, JSON.stringify(raw), StorageScope.APPLICATION, StorageTarget.USER);
    }
  }
  _migrateSSHEntriesFromSetting() {
    const configuredEntries = this._getConfiguredSettingEntriesForTarget();
    const sshEntries = configuredEntries.filter((entry) => entry.connection.type === RemoteAgentHostEntryType.SSH);
    if (sshEntries.length === 0) {
      return;
    }
    const migratedEntries = this._mergeConfiguredEntries(this._getStoredSSHEntries(), sshEntries);
    this._storeStoredSSHEntries(migratedEntries);
    const nonSSHEntries = configuredEntries.filter((entry) => entry.connection.type !== RemoteAgentHostEntryType.SSH);
    const raw = nonSSHEntries.map(entryToRawEntry).filter(isDefined);
    this._configurationService.updateValue(RemoteAgentHostsSettingId, raw, this._getConfigurationTarget()).catch((err) => {
      this._logService.error("[RemoteAgentHost] Failed to migrate SSH connection details from settings to storage", err);
    });
  }
  _mergeConfiguredEntries(base, incoming) {
    let result = base;
    for (const entry of incoming) {
      const normalizedAddress = normalizeRemoteAgentHostAddress(getEntryAddress(entry));
      const existingIndex = result.findIndex((e) => normalizeRemoteAgentHostAddress(getEntryAddress(e)) === normalizedAddress);
      if (existingIndex === -1) {
        result = [...result, entry];
      } else {
        result = result.map((e, index) => index === existingIndex ? entry : e);
      }
    }
    return result;
  }
  _getOrCreateConnectionWait(address) {
    let wait = this._pendingConnectionWaits.get(address);
    if (wait) {
      return wait;
    }
    const existingConnection = this._getConnectionInfo(address);
    if (existingConnection) {
      const immediateWait = new DeferredPromise();
      immediateWait.complete(existingConnection);
      return immediateWait;
    }
    wait = new DeferredPromise();
    this._pendingConnectionWaits.set(address, wait);
    return wait;
  }
  _resolvePendingConnectionWait(address) {
    const wait = this._pendingConnectionWaits.get(address);
    const connection = this._getConnectionInfo(address);
    if (!wait || !connection) {
      return;
    }
    this._pendingConnectionWaits.delete(address);
    void wait.complete(connection);
  }
  _rejectPendingConnectionWait(address, err) {
    const wait = this._pendingConnectionWaits.get(address);
    if (!wait) {
      return;
    }
    this._pendingConnectionWaits.delete(address);
    void wait.error(err);
  }
  /**
   * Register (or re-register) the {@link AGENT_HOST_SCHEME} label formatter
   * for the given address so that {@link ILabelService.getHostLabel} resolves
   * to the entry's human-readable name. Called when an entry is added or its
   * name changes.
   */
  _updateHostLabelFormatter(address, name) {
    this._clearHostLabelFormatter(address);
    const handle = this._labelService.registerFormatter({
      scheme: AGENT_HOST_SCHEME,
      authority: agentHostAuthority(address),
      priority: true,
      formatting: {
        ...AGENT_HOST_LABEL_FORMATTER.formatting,
        workspaceSuffix: name
      }
    });
    this._labelFormatters.set(address, handle);
  }
  _clearHostLabelFormatter(address) {
    const existing = this._labelFormatters.get(address);
    if (existing) {
      existing.dispose();
      this._labelFormatters.delete(address);
    }
  }
  dispose() {
    for (const timeout of this._reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this._reconnectTimeouts.clear();
    this._reconnectAttempts.clear();
    for (const [address, wait] of this._pendingConnectionWaits) {
      void wait.error(new Error(`Remote agent host service disposed before connecting to ${address}`));
    }
    this._pendingConnectionWaits.clear();
    for (const entry of this._entries.values()) {
      disposeEntry(entry);
    }
    this._entries.clear();
    for (const handle of this._labelFormatters.values()) {
      handle.dispose();
    }
    this._labelFormatters.clear();
    super.dispose();
  }
};
RemoteAgentHostService.ConnectionWaitTimeout = 1e4;
/** Initial reconnect delay in milliseconds. */
RemoteAgentHostService.ReconnectInitialDelay = 1e3;
/** Maximum reconnect delay in milliseconds. */
RemoteAgentHostService.ReconnectMaxDelay = 3e4;
/**
 * How long to wait for a server-upgrade trigger to be acknowledged.
 * The CLI awaits the binary download synchronously before responding,
 * so this needs to accommodate first-time downloads on slow networks.
 */
RemoteAgentHostService.UpgradeRequestTimeout = 5 * 60 * 1e3;
RemoteAgentHostService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IStorageService)
], RemoteAgentHostService);
let AgentsWindowRemoteAgentHostService = class extends RemoteAgentHostService {
  get clientInfo() {
    return agentsWindowAgentHostClientInfo;
  }
  constructor(configurationService, instantiationService, logService, labelService, environmentService, storageService) {
    super(configurationService, instantiationService, logService, labelService, environmentService, storageService);
  }
};
AgentsWindowRemoteAgentHostService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IStorageService)
], AgentsWindowRemoteAgentHostService);
export {
  AgentsWindowRemoteAgentHostService,
  RemoteAgentHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9icm93c2VyL3JlbW90ZUFnZW50SG9zdFNlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gU2VydmljZSBpbXBsZW1lbnRhdGlvbiB0aGF0IG1hbmFnZXMgV2ViU29ja2V0IGNvbm5lY3Rpb25zIHRvIHJlbW90ZSBhZ2VudFxuLy8gaG9zdCBwcm9jZXNzZXMuIFJlYWRzIFdlYlNvY2tldCBhZGRyZXNzZXMgZnJvbSB0aGUgYGNoYXQucmVtb3RlQWdlbnRIb3N0c2Bcbi8vIHNldHRpbmcgYW5kIFNTSCBjb25uZWN0aW9uIGRldGFpbHMgZnJvbSBzdG9yYWdlLCB0aGVuIG1haW50YWlucyBjb25uZWN0aW9ucy5cblxuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuXG5pbXBvcnQgeyBBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQsIHR5cGUgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0SVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsXG5cdFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZSxcblx0UmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQsXG5cdFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQsXG5cdGVudHJ5VG9SYXdFbnRyeSxcblx0Z2V0RW50cnlBZGRyZXNzLFxuXHRyYXdFbnRyeVRvRW50cnksXG5cdHR5cGUgSVJhd1JlbW90ZUFnZW50SG9zdEVudHJ5LFxuXHR0eXBlIElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbyxcblx0dHlwZSBJUmVtb3RlQWdlbnRIb3N0RW50cnksXG59IGZyb20gJy4uL2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LCBBZ2VudEhvc3RDbGllbnRTdGF0ZSB9IGZyb20gJy4vcmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQuanMnO1xuaW1wb3J0IHsgV2ViU29ja2V0Q2xpZW50VHJhbnNwb3J0IH0gZnJvbSAnLi93ZWJTb2NrZXRDbGllbnRUcmFuc3BvcnQuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9MQUJFTF9GT1JNQVRURVIsIEFHRU5UX0hPU1RfU0NIRU1FLCBhZ2VudEhvc3RBdXRob3JpdHksIG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3MgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB0eXBlIElWc2NvZGVVcGdyYWRlUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sVXBncmFkZS5qcyc7XG5pbXBvcnQgeyBhZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvLCBlZGl0b3JXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuXG5jb25zdCBTU0hfUkVNT1RFX0FHRU5UX0hPU1RTX1NUT1JBR0VfS0VZID0gJ3JlbW90ZUFnZW50SG9zdC5zc2hDb25uZWN0aW9ucyc7XG5cbi8qKiBUcmFja3MgYSBzaW5nbGUgcmVtb3RlIGNvbm5lY3Rpb24gdGhyb3VnaCBpdHMgbGlmZWN5Y2xlLiAqL1xuaW50ZXJmYWNlIElDb25uZWN0aW9uRW50cnkge1xuXHRyZWFkb25seSBzdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBjbGllbnQ6IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50O1xuXHQvKipcblx0ICogT3B0aW9uYWwgdGVhcmRvd24gZm9yIHRoZSBzaGFyZWQtcHJvY2VzcyB0dW5uZWwgdGhhdCB0aGlzIGVudHJ5J3Ncblx0ICogdHJhbnNwb3J0IGlzIHVzaW5nIChTU0ggb3IgZGV2LXR1bm5lbHMpLiBUcmFja2VkIHNlcGFyYXRlbHkgZnJvbVxuXHQgKiB7QGxpbmsgc3RvcmV9IGJlY2F1c2Ugb24gcmVjb25uZWN0IHRoZSBuZXcgZW50cnkgdGFrZXMgb3duZXJzaGlwIG9mXG5cdCAqIHRoZSBzYW1lIHVuZGVybHlpbmcgY29ubmVjdGlvbklkIFx1MjAxNCBydW5uaW5nIHRoZSBvbGQgdGVhcmRvd24gd291bGRcblx0ICogZGlzY29ubmVjdCB0aGUgZnJlc2hseS1lc3RhYmxpc2hlZCB0dW5uZWwgYXMgYSBzaWRlIGVmZmVjdC5cblx0ICovXG5cdHJlYWRvbmx5IHRyYW5zcG9ydERpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZTtcblx0Y29ubmVjdGVkOiBib29sZWFuO1xuXHQvKiogQ3VycmVudCBjb25uZWN0aW9uIHN0YXR1cyBmb3IgVUkgZGlzcGxheS4gKi9cblx0c3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzO1xufVxuXG5mdW5jdGlvbiBkaXNwb3NlRW50cnkoZW50cnk6IElDb25uZWN0aW9uRW50cnkpOiB2b2lkIHtcblx0ZW50cnkuc3RvcmUuZGlzcG9zZSgpO1xuXHRlbnRyeS50cmFuc3BvcnREaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG59XG5cbmZ1bmN0aW9uIGlzUmF3UmVtb3RlQWdlbnRIb3N0RW50cnkodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnkge1xuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBjYW5kaWRhdGUgPSB2YWx1ZSBhcyBQYXJ0aWFsPFJlY29yZDxrZXlvZiBJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnksIHVua25vd24+Pjtcblx0cmV0dXJuIHR5cGVvZiBjYW5kaWRhdGUuYWRkcmVzcyA9PT0gJ3N0cmluZydcblx0XHQmJiB0eXBlb2YgY2FuZGlkYXRlLm5hbWUgPT09ICdzdHJpbmcnXG5cdFx0JiYgKGNhbmRpZGF0ZS5jb25uZWN0aW9uVG9rZW4gPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgY2FuZGlkYXRlLmNvbm5lY3Rpb25Ub2tlbiA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKGNhbmRpZGF0ZS5zc2hDb25maWdIb3N0ID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIGNhbmRpZGF0ZS5zc2hDb25maWdIb3N0ID09PSAnc3RyaW5nJylcblx0XHQmJiAoY2FuZGlkYXRlLnNzaEhvc3ROYW1lID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIGNhbmRpZGF0ZS5zc2hIb3N0TmFtZSA9PT0gJ3N0cmluZycpXG5cdFx0JiYgKGNhbmRpZGF0ZS5zc2hVc2VyID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIGNhbmRpZGF0ZS5zc2hVc2VyID09PSAnc3RyaW5nJylcblx0XHQmJiAoY2FuZGlkYXRlLnNzaFBvcnQgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgY2FuZGlkYXRlLnNzaFBvcnQgPT09ICdudW1iZXInKTtcbn1cblxuZXhwb3J0IGNsYXNzIFJlbW90ZUFnZW50SG9zdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2Uge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDb25uZWN0aW9uV2FpdFRpbWVvdXQgPSAxMDAwMDtcblx0LyoqIEluaXRpYWwgcmVjb25uZWN0IGRlbGF5IGluIG1pbGxpc2Vjb25kcy4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUmVjb25uZWN0SW5pdGlhbERlbGF5ID0gMTAwMDtcblx0LyoqIE1heGltdW0gcmVjb25uZWN0IGRlbGF5IGluIG1pbGxpc2Vjb25kcy4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUmVjb25uZWN0TWF4RGVsYXkgPSAzMDAwMDtcblx0LyoqXG5cdCAqIEhvdyBsb25nIHRvIHdhaXQgZm9yIGEgc2VydmVyLXVwZ3JhZGUgdHJpZ2dlciB0byBiZSBhY2tub3dsZWRnZWQuXG5cdCAqIFRoZSBDTEkgYXdhaXRzIHRoZSBiaW5hcnkgZG93bmxvYWQgc3luY2hyb25vdXNseSBiZWZvcmUgcmVzcG9uZGluZyxcblx0ICogc28gdGhpcyBuZWVkcyB0byBhY2NvbW1vZGF0ZSBmaXJzdC10aW1lIGRvd25sb2FkcyBvbiBzbG93IG5ldHdvcmtzLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVXBncmFkZVJlcXVlc3RUaW1lb3V0ID0gNSAqIDYwICogMTAwMDtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbm5lY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbm5lY3Rpb25FbnRyeT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbmFtZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbnMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPigpO1xuXHQvKipcblx0ICogU3RvcmVzIHRoZSBvcmlnaW5hbCB7QGxpbmsgSVJlbW90ZUFnZW50SG9zdEVudHJ5fSBmb3IgY29ubmVjdGlvbnNcblx0ICogcmVnaXN0ZXJlZCB2aWEge0BsaW5rIGFkZE1hbmFnZWRDb25uZWN0aW9ufS4gVGhpcyBpcyBuZWVkZWQgYmVjYXVzZVxuXHQgKiB0dW5uZWwgZW50cmllcyBhcmUgbm90IHBlcnNpc3RlZCB0byBzZXR0aW5ncyBhbmQgdGhlcmVmb3JlIGRvbid0XG5cdCAqIGFwcGVhciBpbiB7QGxpbmsgY29uZmlndXJlZEVudHJpZXN9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0ZXJlZEVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgSVJlbW90ZUFnZW50SG9zdEVudHJ5PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ29ubmVjdGlvbldhaXRzID0gbmV3IE1hcDxzdHJpbmcsIERlZmVycmVkUHJvbWlzZTxJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8+PigpO1xuXHQvKiogUGVuZGluZyByZWNvbm5lY3QgdGltZW91dHMsIGtleWVkIGJ5IG5vcm1hbGl6ZWQgYWRkcmVzcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVjb25uZWN0VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4+KCk7XG5cdC8qKiBDdXJyZW50IHJlY29ubmVjdCBhdHRlbXB0IGNvdW50IHBlciBhZGRyZXNzIGZvciBleHBvbmVudGlhbCBiYWNrb2ZmLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvbm5lY3RBdHRlbXB0cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdC8qKlxuXHQgKiBQZXItYWRkcmVzcyB7QGxpbmsgSUxhYmVsU2VydmljZX0gZm9ybWF0dGVyIGhhbmRsZXMgZm9yIHRoZVxuXHQgKiB7QGxpbmsgQUdFTlRfSE9TVF9TQ0hFTUV9LiBUaGUgZm9ybWF0dGVyIGFkdmVydGlzZXMgdGhlIGVudHJ5J3Ncblx0ICogaHVtYW4tcmVhZGFibGUgbmFtZSBhcyB0aGUgaG9zdCBsYWJlbCBzbyBhbnkgVUkgbG9va2luZyB1cCB0aGUgaG9zdFxuXHQgKiBsYWJlbCBmb3IgYW4gYWdlbnQgaG9zdCBVUkkgZ2V0cyB0aGUgZnJpZW5kbHkgbmFtZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsRm9ybWF0dGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblxuXHRwcm90ZWN0ZWQgZ2V0IGNsaWVudEluZm8oKSB7XG5cdFx0cmV0dXJuIGVkaXRvcldpbmRvd0FnZW50SG9zdENsaWVudEluZm87XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFJlYWN0IHRvIHNldHRpbmcgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMuX3JlY29uY2lsZUNvbm5lY3Rpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTU0hfUkVNT1RFX0FHRU5UX0hPU1RTX1NUT1JBR0VfS0VZLCB0aGlzLl9zdG9yZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVjb25jaWxlQ29ubmVjdGlvbnMoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX21pZ3JhdGVTU0hFbnRyaWVzRnJvbVNldHRpbmcoKTtcblxuXHRcdC8vIEluaXRpYWwgY29ubmVjdGlvblxuXHRcdHRoaXMuX3JlY29uY2lsZUNvbm5lY3Rpb25zKCk7XG5cdH1cblxuXHRnZXQgY29ubmVjdGlvbnMoKTogcmVhZG9ubHkgSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBlbnRyeV0gb2YgdGhpcy5fZW50cmllcykge1xuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRhZGRyZXNzLFxuXHRcdFx0XHRuYW1lOiB0aGlzLl9uYW1lcy5nZXQoYWRkcmVzcykgPz8gYWRkcmVzcyxcblx0XHRcdFx0Y2xpZW50SWQ6IGVudHJ5LmNsaWVudC5jbGllbnRJZCxcblx0XHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogZW50cnkuY2xpZW50LmRlZmF1bHREaXJlY3RvcnksXG5cdFx0XHRcdHN0YXR1czogZW50cnkuc3RhdHVzLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXQgY29uZmlndXJlZEVudHJpZXMoKTogcmVhZG9ubHkgSVJlbW90ZUFnZW50SG9zdEVudHJ5W10ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRDb25maWd1cmVkRW50cmllcygpLm1hcChlID0+IHtcblx0XHRcdGlmIChlLmNvbm5lY3Rpb24udHlwZSA9PT0gUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlR1bm5lbCkge1xuXHRcdFx0XHRyZXR1cm4gZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IC4uLmUsIGNvbm5lY3Rpb246IHsgLi4uZS5jb25uZWN0aW9uLCBhZGRyZXNzOiBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGUuY29ubmVjdGlvbi5hZGRyZXNzKSB9IH07XG5cdFx0fSk7XG5cdH1cblxuXHRnZXRDb25uZWN0aW9uKGFkZHJlc3M6IHN0cmluZyk6IElBZ2VudENvbm5lY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGFkZHJlc3MpO1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW50cmllcy5nZXQobm9ybWFsaXplZCk7XG5cdFx0cmV0dXJuIGVudHJ5Py5jb25uZWN0ZWQgPyBlbnRyeS5jbGllbnQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRDb25uZWN0aW9uQnlBdXRob3JpdHkoYXV0aG9yaXR5OiBzdHJpbmcpOiBJQWdlbnRDb25uZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBlbnRyeV0gb2YgdGhpcy5fZW50cmllcykge1xuXHRcdFx0aWYgKGVudHJ5LmNvbm5lY3RlZCAmJiBhZ2VudEhvc3RBdXRob3JpdHkoYWRkcmVzcykgPT09IGF1dGhvcml0eSkge1xuXHRcdFx0XHRyZXR1cm4gZW50cnkuY2xpZW50O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0RW50cnlCeUFkZHJlc3MoYWRkcmVzczogc3RyaW5nKTogSVJlbW90ZUFnZW50SG9zdEVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVtb3RlQWdlbnRIb3N0QWRkcmVzcyhhZGRyZXNzKTtcblx0XHQvLyBDaGVjayBkeW5hbWljYWxseSByZWdpc3RlcmVkIGVudHJpZXMgZmlyc3QgKGUuZy4gdHVubmVsIGNvbm5lY3Rpb25zXG5cdFx0Ly8gdGhhdCBhcmUgbm90IHBlcnNpc3RlZCB0byBzZXR0aW5ncykuXG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IHRoaXMuX3JlZ2lzdGVyZWRFbnRyaWVzLmdldChub3JtYWxpemVkKTtcblx0XHRpZiAocmVnaXN0ZXJlZCkge1xuXHRcdFx0cmV0dXJuIHJlZ2lzdGVyZWQ7XG5cdFx0fVxuXHRcdC8vIEZhbGwgYmFjayB0byBjb25maWd1cmVkIGVudHJpZXMgZnJvbSBzZXR0aW5ncy5cblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmVkRW50cmllcy5maW5kKFxuXHRcdFx0ZSA9PiBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGdldEVudHJ5QWRkcmVzcyhlKSkgPT09IG5vcm1hbGl6ZWRcblx0XHQpO1xuXHR9XG5cblx0YXN5bmMgdHJpZ2dlclNlcnZlclVwZ3JhZGUoYWRkcmVzczogc3RyaW5nLCBtZXRob2Q6IHN0cmluZyk6IFByb21pc2U8SVZzY29kZVVwZ3JhZGVSZXN1bHQ+IHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVtb3RlQWdlbnRIb3N0QWRkcmVzcyhhZGRyZXNzKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KG5vcm1hbGl6ZWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gcmVtb3RlIGFnZW50IGhvc3QgZW50cnkgZm91bmQgZm9yICR7YWRkcmVzc30uYCk7XG5cdFx0fVxuXHRcdC8vIFRoZSBwcm90b2NvbCBjbGllbnQgbWF5IGJlIGluIGFueSBzdGF0ZTogaXQgbWlnaHQgaGF2ZSBjb21wbGV0ZWRcblx0XHQvLyB0aGUgaGFuZHNoYWtlIChDb25uZWN0ZWQpIG9yIGl0IG1pZ2h0IGJlIHNpdHRpbmcgb24gYW5cblx0XHQvLyBgaW5jb21wYXRpYmxlYCBmYWlsdXJlIHdpdGggdGhlIHRyYW5zcG9ydCBzdGlsbCBvcGVuLiBFaXRoZXIgd2F5XG5cdFx0Ly8gd2Ugc2VuZCB0aGUgdXBncmFkZSByZXF1ZXN0IGFzIGEgcmF3IEpTT04tUlBDIGNhbGwgdXNpbmcgdGhlXG5cdFx0Ly8gbWV0aG9kIG5hbWUgdGhlIGhvc3QgYWR2ZXJ0aXNlZCBpbiBpdHMgYF9tZXRhYCBwYXlsb2FkOyB0aGVcblx0XHQvLyBzZXJ2ZXIgaGFuZGxlciBhbGxvd3MgaXQgcHJlLWBpbml0aWFsaXplYC5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlVGltZW91dChcblx0XHRcdGVudHJ5LmNsaWVudC50cmlnZ2VyVnNjb2RlVXBncmFkZShtZXRob2QpLFxuXHRcdFx0UmVtb3RlQWdlbnRIb3N0U2VydmljZS5VcGdyYWRlUmVxdWVzdFRpbWVvdXQsXG5cdFx0KTtcblx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2VydmVyIHVwZ3JhZGUgcmVxdWVzdCB0aW1lZCBvdXQgYWZ0ZXIgJHtSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLlVwZ3JhZGVSZXF1ZXN0VGltZW91dH1tcy5gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHJlY29ubmVjdChhZGRyZXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVtb3RlQWdlbnRIb3N0QWRkcmVzcyhhZGRyZXNzKTtcblxuXHRcdC8vIFNTSC90dW5uZWwgZW50cmllcyBhcmUgcmVjb25uZWN0ZWQgYnkgdGhlaXIgcmVzcGVjdGl2ZSBzZXJ2aWNlc1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRFbnRyeSA9IHRoaXMuX2dldENvbmZpZ3VyZWRFbnRyaWVzKCkuZmluZChcblx0XHRcdGUgPT4gbm9ybWFsaXplUmVtb3RlQWdlbnRIb3N0QWRkcmVzcyhnZXRFbnRyeUFkZHJlc3MoZSkpID09PSBub3JtYWxpemVkXG5cdFx0KTtcblx0XHRpZiAoY29uZmlndXJlZEVudHJ5ICYmIGNvbmZpZ3VyZWRFbnRyeS5jb25uZWN0aW9uLnR5cGUgIT09IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5XZWJTb2NrZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX3Rva2Vucy5nZXQobm9ybWFsaXplZCk7XG5cblx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgcmVjb25uZWN0XG5cdFx0dGhpcy5fY2FuY2VsUmVjb25uZWN0KG5vcm1hbGl6ZWQpO1xuXHRcdHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmRlbGV0ZShub3JtYWxpemVkKTtcblxuXHRcdC8vIFRlYXIgZG93biBleGlzdGluZyBjb25uZWN0aW9uIGlmIHByZXNlbnRcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KG5vcm1hbGl6ZWQpO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUobm9ybWFsaXplZCk7XG5cdFx0XHRlbnRyeS5zdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RhcnQgZnJlc2ggY29ubmVjdGlvbiBhdHRlbXB0XG5cdFx0dGhpcy5fY29ubmVjdFRvKG5vcm1hbGl6ZWQsIHRva2VuKTtcblx0fVxuXG5cdGFzeW5jIGFkZFJlbW90ZUFnZW50SG9zdChpbnB1dDogSVJlbW90ZUFnZW50SG9zdEVudHJ5KTogUHJvbWlzZTxJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8+IHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZW1vdGUgYWdlbnQgaG9zdCBjb25uZWN0aW9ucyBhcmUgbm90IGVuYWJsZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeSA9IGlucHV0LmNvbm5lY3Rpb24udHlwZSA9PT0gUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlR1bm5lbFxuXHRcdFx0PyBpbnB1dFxuXHRcdFx0OiB7IC4uLmlucHV0LCBjb25uZWN0aW9uOiB7IC4uLmlucHV0LmNvbm5lY3Rpb24sIGFkZHJlc3M6IG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3MoaW5wdXQuY29ubmVjdGlvbi5hZGRyZXNzKSB9IH07XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGdldEVudHJ5QWRkcmVzcyhlbnRyeSk7XG5cdFx0Y29uc3QgZXhpc3RpbmdDb25uZWN0aW9uID0gdGhpcy5fZ2V0Q29ubmVjdGlvbkluZm8oYWRkcmVzcyk7XG5cdFx0YXdhaXQgdGhpcy5fc3RvcmVDb25maWd1cmVkRW50cmllcyh0aGlzLl91cHNlcnRDb25maWd1cmVkRW50cnkoZW50cnkpKTtcblxuXHRcdGlmIChleGlzdGluZ0Nvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmV4aXN0aW5nQ29ubmVjdGlvbixcblx0XHRcdFx0bmFtZTogZW50cnkubmFtZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gU1NIIGVudHJpZXMgYXJlIGNvbm5lY3RlZCBleHRlcm5hbGx5IFx1MjAxNCBqdXN0IHBlcnNpc3Rcblx0XHQvLyB0aGUgZW50cnkgYW5kIHJldHVybiBhIGRpc2Nvbm5lY3RlZCBwbGFjZWhvbGRlci4gVGhlIGNvbm5lY3Rpb25cblx0XHQvLyB3aWxsIGJlIGVzdGFibGlzaGVkIGJ5IHRoZSBTU0ggY29udHJpYnV0aW9uLlxuXHRcdGlmIChlbnRyeS5jb25uZWN0aW9uLnR5cGUgPT09IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFkZHJlc3MsXG5cdFx0XHRcdG5hbWU6IGVudHJ5Lm5hbWUsXG5cdFx0XHRcdGNsaWVudElkOiAnJyxcblx0XHRcdFx0c3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdGVkQ29ubmVjdGlvbiA9IHRoaXMuX2dldENvbm5lY3Rpb25JbmZvKGFkZHJlc3MpO1xuXHRcdGlmIChjb25uZWN0ZWRDb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gY29ubmVjdGVkQ29ubmVjdGlvbjtcblx0XHR9XG5cblx0XHRjb25zdCB3YWl0ID0gdGhpcy5fZ2V0T3JDcmVhdGVDb25uZWN0aW9uV2FpdChhZGRyZXNzKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgcmFjZVRpbWVvdXQod2FpdC5wLCBSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLkNvbm5lY3Rpb25XYWl0VGltZW91dCwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0Nvbm5lY3Rpb25XYWl0cy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0fSk7XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRpbWVkIG91dCBjb25uZWN0aW5nIHRvICR7YWRkcmVzc31gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29ubmVjdGlvbjtcblx0fVxuXG5cdGFzeW5jIGFkZE1hbmFnZWRDb25uZWN0aW9uKGVudHJ5OiBJUmVtb3RlQWdlbnRIb3N0RW50cnksIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHRyYW5zcG9ydERpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZSwgc3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQpOiBQcm9taXNlPElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbz4ge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlbW90ZSBhZ2VudCBob3N0IGNvbm5lY3Rpb25zIGFyZSBub3QgZW5hYmxlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBhZGRyZXNzID0gZ2V0RW50cnlBZGRyZXNzKGVudHJ5KTtcblxuXHRcdC8vIERpc3Bvc2UgYW55IGV4aXN0aW5nIGVudHJ5IGZvciB0aGlzIGFkZHJlc3MgdG8gYXZvaWQgbGVha2luZ1xuXHRcdC8vIG9sZCBwcm90b2NvbCBjbGllbnRzIGFuZCByZWxheSB0cmFuc3BvcnRzIG9uIHJlY29ubmVjdC5cblx0XHQvL1xuXHRcdC8vIENSSVRJQ0FMOiB3ZSBkZWxpYmVyYXRlbHkgZG8gTk9UIHJ1biB0aGUgZXhpc3RpbmcgZW50cnknc1xuXHRcdC8vIHRyYW5zcG9ydERpc3Bvc2FibGUuIE9uIGEgcmVjb25uZWN0IHRvIHRoZSBzYW1lIGFkZHJlc3MsIHRoZVxuXHRcdC8vIHNoYXJlZC1wcm9jZXNzIHR1bm5lbCBrZXllZCBieSBjb25uZWN0aW9uSWQgaXMgYWxyZWFkeSBvd25lZCBieVxuXHRcdC8vIHRoZSBuZXcgY29ubmVjdGlvbiB3ZSBqdXN0IGVzdGFibGlzaGVkLiBSdW5uaW5nIHRoZSBvbGQgdGVhcmRvd25cblx0XHQvLyB3b3VsZCBjYWxsIF9tYWluU2VydmljZS5kaXNjb25uZWN0KGNvbm5lY3Rpb25JZCkgYW5kIGltbWVkaWF0ZWx5XG5cdFx0Ly8ga2lsbCB0aGUgYnJhbmQtbmV3IHR1bm5lbC5cblx0XHRjb25zdCBleGlzdGluZ0VudHJ5ID0gdGhpcy5fZW50cmllcy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKGV4aXN0aW5nRW50cnkpIHtcblx0XHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0ZXhpc3RpbmdFbnRyeS5zdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBDcmVhdGUgYSBjb25uZWN0aW9uIGVudHJ5IHdyYXBwaW5nIHRoZSBwcmUtY29ubmVjdGVkIGNsaWVudFxuXHRcdGNvbnN0IHByb3RvY29sQ2xpZW50ID0gY29ubmVjdGlvbiBhcyBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudDtcblx0XHRzdG9yZS5hZGQocHJvdG9jb2xDbGllbnQpO1xuXHRcdGNvbnN0IGNvbm5FbnRyeTogSUNvbm5lY3Rpb25FbnRyeSA9IHsgc3RvcmUsIGNsaWVudDogcHJvdG9jb2xDbGllbnQsIHRyYW5zcG9ydERpc3Bvc2FibGUsIGNvbm5lY3RlZDogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChzdGF0dXMpLCBzdGF0dXMgfTtcblx0XHR0aGlzLl9lbnRyaWVzLnNldChhZGRyZXNzLCBjb25uRW50cnkpO1xuXHRcdHRoaXMuX25hbWVzLnNldChhZGRyZXNzLCBlbnRyeS5uYW1lKTtcblx0XHR0aGlzLl9yZWdpc3RlcmVkRW50cmllcy5zZXQoYWRkcmVzcywgZW50cnkpO1xuXHRcdHRoaXMuX3VwZGF0ZUhvc3RMYWJlbEZvcm1hdHRlcihhZGRyZXNzLCBlbnRyeS5uYW1lKTtcblx0XHRpZiAoZW50cnkuY29ubmVjdGlvblRva2VuKSB7XG5cdFx0XHR0aGlzLl90b2tlbnMuc2V0KGFkZHJlc3MsIGVudHJ5LmNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0fVxuXG5cdFx0c3RvcmUuYWRkKHByb3RvY29sQ2xpZW50Lm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2VudHJpZXMuZ2V0KGFkZHJlc3MpID09PSBjb25uRW50cnkpIHtcblx0XHRcdFx0Y29ubkVudHJ5LmNvbm5lY3RlZCA9IGZhbHNlO1xuXHRcdFx0XHRjb25uRW50cnkuc3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFBlcnNpc3QgZW50cmllcyBcdTIwMTQgYXdhaXQgc28gdGhhdCB0aGUgY29uZmlnIGlzIHdyaXR0ZW4gYmVmb3JlXG5cdFx0Ly8gb25EaWRDaGFuZ2VDb25uZWN0aW9ucyBmaXJlcywgZW5zdXJpbmcgX3JlY29uY2lsZSBjcmVhdGVzIHRoZSBwcm92aWRlci5cblx0XHQvLyBUdW5uZWwgZW50cmllcyBhcmUgZmlsdGVyZWQgb3V0IGJ5IF9zdG9yZUNvbmZpZ3VyZWRFbnRyaWVzIGF1dG9tYXRpY2FsbHkuXG5cdFx0YXdhaXQgdGhpcy5fc3RvcmVDb25maWd1cmVkRW50cmllcyh0aGlzLl91cHNlcnRDb25maWd1cmVkRW50cnkoZW50cnkpKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGFkZHJlc3MsXG5cdFx0XHRuYW1lOiBlbnRyeS5uYW1lLFxuXHRcdFx0Y2xpZW50SWQ6IHByb3RvY29sQ2xpZW50LmNsaWVudElkLFxuXHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogcHJvdG9jb2xDbGllbnQuZGVmYXVsdERpcmVjdG9yeSxcblx0XHRcdHN0YXR1cyxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlUmVtb3RlQWdlbnRIb3N0KGFkZHJlc3M6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGFkZHJlc3MpO1xuXHRcdC8vIFRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgaW4gdGhlIHNlc3Npb25zIGFwcCAodXNlciBzY29wZSksIHNvIHdlXG5cdFx0Ly8gZG9uJ3QgbmVlZCB0byBpbnNwZWN0IHBlci1zY29wZSB2YWx1ZXMgbGlrZSBfdXBzZXJ0Q29uZmlndXJlZEVudHJ5IGRvZXMuXG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2dldENvbmZpZ3VyZWRFbnRyaWVzKCkuZmlsdGVyKFxuXHRcdFx0ZSA9PiBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGdldEVudHJ5QWRkcmVzcyhlKSkgIT09IG5vcm1hbGl6ZWRcblx0XHQpO1xuXHRcdGF3YWl0IHRoaXMuX3N0b3JlQ29uZmlndXJlZEVudHJpZXMoZW50cmllcyk7XG5cblx0XHQvLyBFYWdlcmx5IGNsZWFyIGluLW1lbW9yeSBzdGF0ZSBzbyB0aGUgVUkgdXBkYXRlcyBpbW1lZGlhdGVseVxuXHRcdC8vICh0aGUgY29uZmlnIGNoYW5nZSBsaXN0ZW5lciB3aWxsIHJlY29uY2lsZSwgYnV0IHRoaXMgaXMgaW5zdGFudCkuXG5cdFx0dGhpcy5fbmFtZXMuZGVsZXRlKG5vcm1hbGl6ZWQpO1xuXHRcdHRoaXMuX3Rva2Vucy5kZWxldGUobm9ybWFsaXplZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJlZEVudHJpZXMuZGVsZXRlKG5vcm1hbGl6ZWQpO1xuXHRcdHRoaXMuX2NsZWFySG9zdExhYmVsRm9ybWF0dGVyKG5vcm1hbGl6ZWQpO1xuXHRcdHRoaXMuX2NhbmNlbFJlY29ubmVjdChub3JtYWxpemVkKTtcblx0XHR0aGlzLl9yZWNvbm5lY3RBdHRlbXB0cy5kZWxldGUobm9ybWFsaXplZCk7XG5cdFx0dGhpcy5fcmVtb3ZlQ29ubmVjdGlvbihub3JtYWxpemVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUNvbm5lY3Rpb24oYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnRyaWVzLmdldChhZGRyZXNzKTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0ZGlzcG9zZUVudHJ5KGVudHJ5KTtcblx0XHRcdHRoaXMuX3JlamVjdFBlbmRpbmdDb25uZWN0aW9uV2FpdChhZGRyZXNzLCBuZXcgRXJyb3IoYENvbm5lY3Rpb24gY2xvc2VkOiAke2FkZHJlc3N9YCkpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0bm90aWZ5Q29ubmVjdGlvbkNsb3NlZChhZGRyZXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUmVtb3RlQWdlbnRIb3N0QWRkcmVzcyhhZGRyZXNzKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KG5vcm1hbGl6ZWQpO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSBub3RpZnlDb25uZWN0aW9uQ2xvc2VkOiBub3RpZnlpbmcgcHJvdG9jb2wgY2xpZW50IGZvciAke25vcm1hbGl6ZWR9YCk7XG5cdFx0XHRlbnRyeS5jbGllbnQubm90aWZ5VHJhbnNwb3J0Q2xvc2VkKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gbm90aWZ5Q29ubmVjdGlvbkNsb3NlZDogbm8gZW50cnkgZm91bmQgZm9yICR7bm9ybWFsaXplZH0gKGFscmVhZHkgcmVtb3ZlZD8pYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb25jaWxlQ29ubmVjdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdC8vIERpc2Nvbm5lY3QgYWxsIHdoZW4gZGlzYWJsZWRcblx0XHRcdGZvciAoY29uc3QgYWRkcmVzcyBvZiBbLi4udGhpcy5fZW50cmllcy5rZXlzKCldKSB7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbFJlY29ubmVjdChhZGRyZXNzKTtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlQ29ubmVjdGlvbihhZGRyZXNzKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX25hbWVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl90b2tlbnMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmNsZWFyKCk7XG5cdFx0XHQvLyBEcm9wIGxhYmVsIGZvcm1hdHRlcnMgZm9yIGVudHJpZXMgbm8gbG9uZ2VyIHJlcHJlc2VudGVkIGJ5IGFuXG5cdFx0XHQvLyBhY3RpdmUgY29ubmVjdGlvbiBvciBhIGR5bmFtaWNhbGx5IHJlZ2lzdGVyZWQgZW50cnkuIENvbm5lY3Rpb25zXG5cdFx0XHQvLyBhZGRlZCB2aWEge0BsaW5rIGFkZE1hbmFnZWRDb25uZWN0aW9ufSAoZS5nLiB0dW5uZWxzKSBsaXZlIG91dHNpZGVcblx0XHRcdC8vIHRoZSBjb25maWd1cmVkLWVudHJpZXMgc2V0IGFuZCBtdXN0IGtlZXAgdGhlaXIgZm9ybWF0dGVyLlxuXHRcdFx0Zm9yIChjb25zdCBhZGRyZXNzIG9mIFsuLi50aGlzLl9sYWJlbEZvcm1hdHRlcnMua2V5cygpXSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3JlZ2lzdGVyZWRFbnRyaWVzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHRcdHRoaXMuX2NsZWFySG9zdExhYmVsRm9ybWF0dGVyKGFkZHJlc3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJlZEVudHJpZXMgPSB0aGlzLl9nZXRDb25maWd1cmVkRW50cmllcygpO1xuXHRcdGNvbnN0IGVudHJpZXNXaXRoQWRkcmVzcyA9IGNvbmZpZ3VyZWRFbnRyaWVzLm1hcChlID0+ICh7IGVudHJ5OiBlLCBhZGRyZXNzOiBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGdldEVudHJ5QWRkcmVzcyhlKSkgfSkpO1xuXHRcdGNvbnN0IGRlc2lyZWQgPSBuZXcgU2V0KGVudHJpZXNXaXRoQWRkcmVzcy5tYXAoZSA9PiBlLmFkZHJlc3MpKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gUmVjb25jaWxpbmc6IGRlc2lyZWQ9WyR7Wy4uLmRlc2lyZWRdLmpvaW4oJywgJyl9XSwgY3VycmVudD1bJHtbLi4udGhpcy5fZW50cmllcy5rZXlzKCldLm1hcChhID0+IGAke2F9KCR7dGhpcy5fZW50cmllcy5nZXQoYSkhLmNvbm5lY3RlZCA/ICdjb25uZWN0ZWQnIDogJ3BlbmRpbmcnfSlgKS5qb2luKCcsICcpfV1gKTtcblxuXHRcdC8vIFVwZGF0ZSBuYW1lIG1hcCBhbmQgZGV0ZWN0IG5hbWUgY2hhbmdlcyBmb3IgZXhpc3RpbmcgY29ubmVjdGlvbnNcblx0XHRsZXQgbmFtZXNDaGFuZ2VkID0gZmFsc2U7XG5cdFx0Y29uc3Qgb2xkTmFtZXMgPSBuZXcgTWFwKHRoaXMuX25hbWVzKTtcblx0XHR0aGlzLl9uYW1lcy5jbGVhcigpO1xuXHRcdHRoaXMuX3Rva2Vucy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgeyBlbnRyeSwgYWRkcmVzcyB9IG9mIGVudHJpZXNXaXRoQWRkcmVzcykge1xuXHRcdFx0dGhpcy5fbmFtZXMuc2V0KGFkZHJlc3MsIGVudHJ5Lm5hbWUpO1xuXHRcdFx0dGhpcy5fdG9rZW5zLnNldChhZGRyZXNzLCBlbnRyeS5jb25uZWN0aW9uVG9rZW4pO1xuXHRcdFx0dGhpcy5fdXBkYXRlSG9zdExhYmVsRm9ybWF0dGVyKGFkZHJlc3MsIGVudHJ5Lm5hbWUpO1xuXHRcdFx0aWYgKHRoaXMuX2VudHJpZXMuaGFzKGFkZHJlc3MpICYmIG9sZE5hbWVzLmdldChhZGRyZXNzKSAhPT0gZW50cnkubmFtZSkge1xuXHRcdFx0XHRuYW1lc0NoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERyb3AgZm9ybWF0dGVycyBmb3IgYWRkcmVzc2VzIHRoYXQgYXJlIG5vIGxvbmdlciBjb25maWd1cmVkIGFuZFxuXHRcdC8vIG5vdCBkeW5hbWljYWxseSByZWdpc3RlcmVkLlxuXHRcdGZvciAoY29uc3QgYWRkcmVzcyBvZiBbLi4udGhpcy5fbGFiZWxGb3JtYXR0ZXJzLmtleXMoKV0pIHtcblx0XHRcdGlmICghZGVzaXJlZC5oYXMoYWRkcmVzcykgJiYgIXRoaXMuX3JlZ2lzdGVyZWRFbnRyaWVzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9jbGVhckhvc3RMYWJlbEZvcm1hdHRlcihhZGRyZXNzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgY29ubmVjdGlvbnMgbm8gbG9uZ2VyIGluIHRoZSBzZXR0aW5nXG5cdFx0Zm9yIChjb25zdCBhZGRyZXNzIG9mIFsuLi50aGlzLl9lbnRyaWVzLmtleXMoKV0pIHtcblx0XHRcdGlmICghZGVzaXJlZC5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSBEaXNjb25uZWN0aW5nIGZyb20gJHthZGRyZXNzfWApO1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxSZWNvbm5lY3QoYWRkcmVzcyk7XG5cdFx0XHRcdHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlQ29ubmVjdGlvbihhZGRyZXNzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgbmV3IGNvbm5lY3Rpb25zIChza2lwIFNTSCBlbnRyaWVzIFx1MjAxNCB0aG9zZSBhcmUgaGFuZGxlZCBieSBJU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHQvLyBhbmQgc2tpcCB0dW5uZWwgZW50cmllcyBcdTIwMTQgdGhvc2UgYXJlIGhhbmRsZWQgYnkgSVR1bm5lbEFnZW50SG9zdFNlcnZpY2UpXG5cdFx0Zm9yIChjb25zdCB7IGVudHJ5LCBhZGRyZXNzIH0gb2YgZW50cmllc1dpdGhBZGRyZXNzKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2VudHJpZXMuaGFzKGFkZHJlc3MpICYmIGVudHJ5LmNvbm5lY3Rpb24udHlwZSA9PT0gUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLldlYlNvY2tldCkge1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0VG8oYWRkcmVzcywgZW50cnkuY29ubmVjdGlvblRva2VuKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBvbmx5IG5hbWVzIGNoYW5nZWQgKG5vIGFkZC9yZW1vdmUpLCBub3RpZnkgc28gdGhlIFVJIHVwZGF0ZXNcblx0XHRpZiAobmFtZXNDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb25uZWN0VG8oYWRkcmVzczogc3RyaW5nLCBjb25uZWN0aW9uVG9rZW4/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2UgYW55IGV4aXN0aW5nIGVudHJ5IGZvciB0aGlzIGFkZHJlc3MgYmVmb3JlIGNyZWF0aW5nIGEgbmV3IG9uZVxuXHRcdC8vIHRvIGF2b2lkIGxlYWtpbmcgZGlzcG9zYWJsZXMgb24gcmVjb25uZWN0LlxuXHRcdGNvbnN0IGV4aXN0aW5nRW50cnkgPSB0aGlzLl9lbnRyaWVzLmdldChhZGRyZXNzKTtcblx0XHRpZiAoZXhpc3RpbmdFbnRyeSkge1xuXHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHRleGlzdGluZ0VudHJ5LnN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBhaHBMb2dnaW5nRW5hYmxlZCA9ICEhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkKTtcblx0XHQvLyBGYWN0b3J5IHNvIHRoZSBwcm90b2NvbCBjbGllbnQgY2FuIHJlcGxhY2UgdGhlIHVuZGVybHlpbmcgdHJhbnNwb3J0XG5cdFx0Ly8gYWNyb3NzIHRyYW5zaWVudCBkcm9wcyBhbmQgdXNlIHRoZSBgcmVjb25uZWN0YCBSUEMgdG8gcmVzdW1lIFx1MjAxNCBzZWVcblx0XHQvLyB7QGxpbmsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnR9LiBUaGUgc3RvcmUgb3ducyBvbmx5IHRoZSBjbGllbnQ7XG5cdFx0Ly8gaW5kaXZpZHVhbCB0cmFuc3BvcnRzIGFyZSBvd25lZCBieSB0aGUgY2xpZW50IGl0c2VsZi5cblx0XHRjb25zdCB0cmFuc3BvcnRGYWN0b3J5ID0gKCkgPT4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXZWJTb2NrZXRDbGllbnRUcmFuc3BvcnQsXG5cdFx0XHRhZGRyZXNzLFxuXHRcdFx0Y29ubmVjdGlvblRva2VuLFxuXHRcdFx0YWhwTG9nZ2luZ0VuYWJsZWRcblx0XHRcdFx0PyB7IGxvZ3NIb21lOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsIGNvbm5lY3Rpb25JZDogYWRkcmVzcywgdHJhbnNwb3J0OiAnd2Vic29ja2V0JyB9XG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LCBhZGRyZXNzLCB0cmFuc3BvcnRGYWN0b3J5LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5jbGllbnRJbmZvKSk7XG5cdFx0Y29uc3QgZW50cnk6IElDb25uZWN0aW9uRW50cnkgPSB7IHN0b3JlLCBjbGllbnQsIGNvbm5lY3RlZDogZmFsc2UsIHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0aW5nIH07XG5cdFx0dGhpcy5fZW50cmllcy5zZXQoYWRkcmVzcywgZW50cnkpO1xuXG5cdFx0Ly8gR3VhcmQgYWdhaW5zdCBzdGFsZSBjYWxsYmFja3M6IG9ubHkgYWN0IGlmIHRoZVxuXHRcdC8vIGN1cnJlbnQgZW50cnkgZm9yIHRoaXMgYWRkcmVzcyBpcyBzdGlsbCB0aGUgb25lIHdlIGNyZWF0ZWQuXG5cdFx0Y29uc3QgaXNDdXJyZW50RW50cnkgPSAoKSA9PiB0aGlzLl9lbnRyaWVzLmdldChhZGRyZXNzKSA9PT0gZW50cnk7XG5cblx0XHRzdG9yZS5hZGQoY2xpZW50Lm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0aWYgKCFpc0N1cnJlbnRFbnRyeSgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1JlbW90ZUFnZW50SG9zdF0gQ29ubmVjdGlvbiBjbG9zZWQ6ICR7YWRkcmVzc31gKTtcblx0XHRcdGVudHJ5LmNvbm5lY3RlZCA9IGZhbHNlO1xuXHRcdFx0ZW50cnkuc3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHRcdC8vIFNjaGVkdWxlIHJlY29ubmVjdCBpZiB0aGUgYWRkcmVzcyBpcyBzdGlsbCBjb25maWd1cmVkLiBUaGlzIGlzXG5cdFx0XHQvLyB0aGUgXCJmYXRhbFwiIHBhdGggXHUyMDE0IHRoZSBwcm90b2NvbCBjbGllbnQgYWxyZWFkeSBnYXZlIHVwIGl0cyBvd25cblx0XHRcdC8vIHNvZnQtcmVjb25uZWN0IGF0dGVtcHRzIChvciBpdCB3YXMgbmV2ZXIgZW5hYmxlZCksIHNvIHdlIHJlYnVpbGRcblx0XHRcdC8vIGZyb20gc2NyYXRjaC5cblx0XHRcdHRoaXMuX3NjaGVkdWxlUmVjb25uZWN0KGFkZHJlc3MsIGNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVmbGVjdCB0cmFuc2llbnQgdHJhbnNwb3J0IGRyb3BzIGFzIGBjb25uZWN0aW5nYCBzdGF0dXMgKHJhdGhlclxuXHRcdC8vIHRoYW4gYGRpc2Nvbm5lY3RlZGApIHNvIHRoZSBVSSBkb2Vzbid0IGZsaWNrZXIgc2Vzc2lvbiBsaXN0cyBpbnRvXG5cdFx0Ly8gYW4gZW1wdHkgc3RhdGUgZHVyaW5nIGEgc29mdCByZWNvbm5lY3QuXG5cdFx0c3RvcmUuYWRkKGNsaWVudC5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZShzdGF0ZSA9PiB7XG5cdFx0XHRpZiAoIWlzQ3VycmVudEVudHJ5KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdFx0XHRjYXNlIEFnZW50SG9zdENsaWVudFN0YXRlLlJlY29ubmVjdGluZzpcblx0XHRcdFx0XHRlbnRyeS5jb25uZWN0ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRlbnRyeS5zdGF0dXMgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3Rpbmc7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGVkOlxuXHRcdFx0XHRcdGVudHJ5LmNvbm5lY3RlZCA9IHRydWU7XG5cdFx0XHRcdFx0ZW50cnkuc3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQ7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ29ubmVjdGluZzpcblx0XHRcdFx0Y2FzZSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5JbmNvbXBhdGlibGU6XG5cdFx0XHRcdGNhc2UgQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkOlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gQ29ubmVjdGluZyB0byAke2FkZHJlc3N9YCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0Y2xpZW50LmNvbm5lY3QoKS50aGVuKCgpID0+IHtcblx0XHRcdGlmIChzdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gcmVtb3ZlZCBiZWZvcmUgY29ubmVjdCByZXNvbHZlZFxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSBDb25uZWN0ZWQgdG8gJHthZGRyZXNzfWApO1xuXHRcdFx0ZW50cnkuY29ubmVjdGVkID0gdHJ1ZTtcblx0XHRcdGVudHJ5LnN0YXR1cyA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGVkO1xuXHRcdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZVBlbmRpbmdDb25uZWN0aW9uV2FpdChhZGRyZXNzKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdH0pLmNhdGNoKChlcnI6IHVua25vd24pID0+IHtcblx0XHRcdGlmICghaXNDdXJyZW50RW50cnkoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByb3RvY29sIHZlcnNpb24gbWlzbWF0Y2ggaXMgYSBkZXRlcm1pbmlzdGljLCB1c2VyLXZpc2libGVcblx0XHRcdC8vIGZhaWx1cmU6IHRoZSBob3N0IGV4cGxpY2l0bHkgdG9sZCB1cyBpdCBjYW5ub3Qgc3BlYWsgb3VyXG5cdFx0XHQvLyB2ZXJzaW9uLiBTdXJmYWNlIGl0IGFzIGBpbmNvbXBhdGlibGVgIChzbyB0aGUgd29ya3NwYWNlIHBpY2tlclxuXHRcdFx0Ly8gY2FuIHNob3cgdGhlIG1lc3NhZ2UpIGFuZCBrZWVwIHRoZSBlbnRyeSBhcm91bmQgXHUyMDE0IGZ1dGlsZVxuXHRcdFx0Ly8gcmVjb25uZWN0IGF0dGVtcHRzIHdvdWxkIGp1c3Qgc3BpbiB1bnRpbCB0aGUgdXNlciB1cGdyYWRlc1xuXHRcdFx0Ly8gZWl0aGVyIHNpZGUsIHNvIGxlYXZlIHJlY292ZXJ5IHRvIHRoZSBtYW51YWwgYFJlY29ubmVjdGBcblx0XHRcdC8vIGFjdGlvbiBpbiB0aGUgcGlja2VyLlxuXHRcdFx0Y29uc3QgaW5jb21wYXRpYmxlID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5mcm9tQ29ubmVjdEVycm9yKGVyciwgW1BST1RPQ09MX1ZFUlNJT05dKTtcblx0XHRcdGlmIChpbmNvbXBhdGlibGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbUmVtb3RlQWdlbnRIb3N0XSBJbmNvbXBhdGlibGUgd2l0aCAke2FkZHJlc3N9OiAke2luY29tcGF0aWJsZS5raW5kID09PSAnaW5jb21wYXRpYmxlJyA/IGluY29tcGF0aWJsZS5tZXNzYWdlIDogJyd9YCk7XG5cdFx0XHRcdGVudHJ5LnN0YXR1cyA9IGluY29tcGF0aWJsZTtcblx0XHRcdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0XHR0aGlzLl9yZWplY3RQZW5kaW5nQ29ubmVjdGlvbldhaXQoYWRkcmVzcywgZXJyKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9ucy5maXJlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1JlbW90ZUFnZW50SG9zdF0gRmFpbGVkIHRvIGNvbm5lY3QgdG8gJHthZGRyZXNzfS4gVmVyaWZ5IGFkZHJlc3MgYW5kIGNvbm5lY3Rpb25Ub2tlbmAsIGVycik7XG5cdFx0XHRlbnRyeS5zdGF0dXMgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZDtcblx0XHRcdC8vIENsZWFuIHVwIHRoZSBmYWlsZWQgZW50cnlcblx0XHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0ZW50cnkuc3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcmVqZWN0UGVuZGluZ0Nvbm5lY3Rpb25XYWl0KGFkZHJlc3MsIGVycik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHRcdC8vIFNjaGVkdWxlIHJlY29ubmVjdCBpZiB0aGUgYWRkcmVzcyBpcyBzdGlsbCBjb25maWd1cmVkXG5cdFx0XHR0aGlzLl9zY2hlZHVsZVJlY29ubmVjdChhZGRyZXNzLCBjb25uZWN0aW9uVG9rZW4pO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNjaGVkdWxlIGEgcmVjb25uZWN0IGF0dGVtcHQgd2l0aCBleHBvbmVudGlhbCBiYWNrb2ZmLlxuXHQgKiBPbmx5IHJlY29ubmVjdHMgaWYgdGhlIGFkZHJlc3MgaXMgc3RpbGwgaW4gdGhlIGNvbmZpZ3VyZWQgZW50cmllcy5cblx0ICovXG5cdHByaXZhdGUgX3NjaGVkdWxlUmVjb25uZWN0KGFkZHJlc3M6IHN0cmluZywgY29ubmVjdGlvblRva2VuPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gRG9uJ3QgcmVjb25uZWN0IGlmIHRoZSBhZGRyZXNzIHdhcyByZW1vdmVkIGZyb20gc2V0dGluZ3Ncblx0XHRpZiAoIXRoaXMuX2lzQWRkcmVzc0NvbmZpZ3VyZWQoYWRkcmVzcykpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gTm90IHJlY29ubmVjdGluZyB0byAke2FkZHJlc3N9OiBubyBsb25nZXIgY29uZmlndXJlZGApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF0dGVtcHQgPSAodGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuZ2V0KGFkZHJlc3MpID8/IDApICsgMTtcblx0XHR0aGlzLl9yZWNvbm5lY3RBdHRlbXB0cy5zZXQoYWRkcmVzcywgYXR0ZW1wdCk7XG5cdFx0Y29uc3QgZGVsYXkgPSBNYXRoLm1pbihcblx0XHRcdFJlbW90ZUFnZW50SG9zdFNlcnZpY2UuUmVjb25uZWN0SW5pdGlhbERlbGF5ICogTWF0aC5wb3coMiwgYXR0ZW1wdCAtIDEpLFxuXHRcdFx0UmVtb3RlQWdlbnRIb3N0U2VydmljZS5SZWNvbm5lY3RNYXhEZWxheSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSBTY2hlZHVsaW5nIHJlY29ubmVjdCB0byAke2FkZHJlc3N9IGluICR7ZGVsYXl9bXMgKGF0dGVtcHQgJHthdHRlbXB0fSlgKTtcblxuXHRcdHRoaXMuX2NhbmNlbFJlY29ubmVjdChhZGRyZXNzKTtcblx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHRpZiAodGhpcy5faXNBZGRyZXNzQ29uZmlndXJlZChhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0VG8oYWRkcmVzcywgY29ubmVjdGlvblRva2VuID8/IHRoaXMuX3Rva2Vucy5nZXQoYWRkcmVzcykpO1xuXHRcdFx0fVxuXHRcdH0sIGRlbGF5KTtcblx0XHR0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy5zZXQoYWRkcmVzcywgdGltZW91dCk7XG5cdH1cblxuXHQvKiogQ2FuY2VsIGEgcGVuZGluZyByZWNvbm5lY3QgdGltZW91dCBmb3IgdGhlIGdpdmVuIGFkZHJlc3MuICovXG5cdHByaXZhdGUgX2NhbmNlbFJlY29ubmVjdChhZGRyZXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0aW1lb3V0ID0gdGhpcy5fcmVjb25uZWN0VGltZW91dHMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmICh0aW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdHRoaXMuX3JlY29ubmVjdFRpbWVvdXRzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR9XG5cdH1cblxuXHQvKiogQ2hlY2sgd2hldGhlciB0aGUgZ2l2ZW4gbm9ybWFsaXplZCBhZGRyZXNzIGlzIHN0aWxsIGluIHRoZSBjb25maWd1cmVkIGVudHJpZXMuICovXG5cdHByaXZhdGUgX2lzQWRkcmVzc0NvbmZpZ3VyZWQoYWRkcmVzczogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2dldENvbmZpZ3VyZWRFbnRyaWVzKCk7XG5cdFx0cmV0dXJuIGVudHJpZXMuc29tZShlID0+IG5vcm1hbGl6ZVJlbW90ZUFnZW50SG9zdEFkZHJlc3MoZ2V0RW50cnlBZGRyZXNzKGUpKSA9PT0gYWRkcmVzcyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb25uZWN0aW9uSW5mbyhhZGRyZXNzOiBzdHJpbmcpOiBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbm5lY3Rpb25zLmZpbmQoY29ubmVjdGlvbiA9PiBjb25uZWN0aW9uLmFkZHJlc3MgPT09IGFkZHJlc3MgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjb25uZWN0aW9uLnN0YXR1cykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29uZmlndXJlZEVudHJpZXMoKTogSVJlbW90ZUFnZW50SG9zdEVudHJ5W10ge1xuXHRcdHJldHVybiB0aGlzLl9tZXJnZUNvbmZpZ3VyZWRFbnRyaWVzKHRoaXMuX2dldENvbmZpZ3VyZWRTZXR0aW5nRW50cmllcygpLCB0aGlzLl9nZXRTdG9yZWRTU0hFbnRyaWVzKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBzZXJ0Q29uZmlndXJlZEVudHJ5KGVudHJ5OiBJUmVtb3RlQWdlbnRIb3N0RW50cnkpOiBJUmVtb3RlQWdlbnRIb3N0RW50cnlbXSB7XG5cdFx0Ly8gUmVhZCBmcm9tIHRoZSBzYW1lIHNjb3BlIHdlJ2xsIHdyaXRlIHRvLCBzbyB3ZSBkb24ndCBhY2NpZGVudGFsbHlcblx0XHQvLyBtZXJnZSBlbnRyaWVzIGZyb20gYW4gb3ZlcnJpZGluZyBzY29wZSAoZS5nLiB3b3Jrc3BhY2UpIGludG8gdGhlXG5cdFx0Ly8gdXNlciBzY29wZSBhbmQgdGhlbiBsb3NlIHRoZW0gb24gdGhlIG5leHQgcmVhZC5cblx0XHRjb25zdCBjb25maWd1cmVkRW50cmllcyA9IHRoaXMuX21lcmdlQ29uZmlndXJlZEVudHJpZXModGhpcy5fZ2V0Q29uZmlndXJlZFNldHRpbmdFbnRyaWVzRm9yVGFyZ2V0KCksIHRoaXMuX2dldFN0b3JlZFNTSEVudHJpZXMoKSk7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZEFkZHJlc3MgPSBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGdldEVudHJ5QWRkcmVzcyhlbnRyeSkpO1xuXHRcdGNvbnN0IGV4aXN0aW5nSW5kZXggPSBjb25maWd1cmVkRW50cmllcy5maW5kSW5kZXgoZSA9PiBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGdldEVudHJ5QWRkcmVzcyhlKSkgPT09IG5vcm1hbGl6ZWRBZGRyZXNzKTtcblx0XHRpZiAoZXhpc3RpbmdJbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiBbLi4uY29uZmlndXJlZEVudHJpZXMsIGVudHJ5XTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29uZmlndXJlZEVudHJpZXMubWFwKChlLCBpbmRleCkgPT4gaW5kZXggPT09IGV4aXN0aW5nSW5kZXggPyBlbnRyeSA6IGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29uZmlndXJhdGlvblRhcmdldCgpOiBDb25maWd1cmF0aW9uVGFyZ2V0IHtcblx0XHRjb25zdCBpbnNwZWN0ZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PElSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeVtdPihSZW1vdGVBZ2VudEhvc3RzU2V0dGluZ0lkKTtcblx0XHRpZiAoaW5zcGVjdGVkLnVzZXJMb2NhbFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw7XG5cdFx0fVxuXHRcdGlmIChpbnNwZWN0ZWQudXNlclJlbW90ZVZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFO1xuXHRcdH1cblx0XHRpZiAoaW5zcGVjdGVkLnVzZXJWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHRcdH1cblx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RvcmVDb25maWd1cmVkRW50cmllcyhlbnRyaWVzOiBJUmVtb3RlQWdlbnRIb3N0RW50cnlbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3N0b3JlU3RvcmVkU1NIRW50cmllcyhlbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5jb25uZWN0aW9uLnR5cGUgPT09IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gpKTtcblx0XHRjb25zdCByYXcgPSBlbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5jb25uZWN0aW9uLnR5cGUgIT09IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gpLm1hcChlbnRyeVRvUmF3RW50cnkpLmZpbHRlcihpc0RlZmluZWQpO1xuXHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQsIHJhdywgdGhpcy5fZ2V0Q29uZmlndXJhdGlvblRhcmdldCgpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbmZpZ3VyZWRTZXR0aW5nRW50cmllcygpOiBJUmVtb3RlQWdlbnRIb3N0RW50cnlbXSB7XG5cdFx0cmV0dXJuICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnlbXT4oUmVtb3RlQWdlbnRIb3N0c1NldHRpbmdJZCkgPz8gW10pLm1hcChyYXdFbnRyeVRvRW50cnkpLmZpbHRlcihpc0RlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29uZmlndXJlZFNldHRpbmdFbnRyaWVzRm9yVGFyZ2V0KCk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q29uZmlndXJlZFJhd0VudHJpZXNGb3JUYXJnZXQoKS5tYXAocmF3RW50cnlUb0VudHJ5KS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbmZpZ3VyZWRSYXdFbnRyaWVzRm9yVGFyZ2V0KCk6IHJlYWRvbmx5IElSYXdSZW1vdGVBZ2VudEhvc3RFbnRyeVtdIHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9nZXRDb25maWd1cmF0aW9uVGFyZ2V0KCk7XG5cdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxJUmF3UmVtb3RlQWdlbnRIb3N0RW50cnlbXT4oUmVtb3RlQWdlbnRIb3N0c1NldHRpbmdJZCk7XG5cdFx0c3dpdGNoICh0YXJnZXQpIHtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOlxuXHRcdFx0XHRyZXR1cm4gaW5zcGVjdGVkLnVzZXJMb2NhbFZhbHVlID8/IFtdO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFOlxuXHRcdFx0XHRyZXR1cm4gaW5zcGVjdGVkLnVzZXJSZW1vdGVWYWx1ZSA/PyBbXTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBpbnNwZWN0ZWQudXNlclZhbHVlID8/IFtdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFN0b3JlZFNTSEVudHJpZXMoKTogSVJlbW90ZUFnZW50SG9zdEVudHJ5W10ge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChTU0hfUkVNT1RFX0FHRU5UX0hPU1RTX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQ6IHVua25vd24gPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFyc2VkLm1hcChpdGVtID0+IGlzUmF3UmVtb3RlQWdlbnRIb3N0RW50cnkoaXRlbSkgPyByYXdFbnRyeVRvRW50cnkoaXRlbSkgOiB1bmRlZmluZWQpXG5cdFx0XHRcdC5maWx0ZXIoKGVudHJ5KTogZW50cnkgaXMgSVJlbW90ZUFnZW50SG9zdEVudHJ5ID0+IGVudHJ5Py5jb25uZWN0aW9uLnR5cGUgPT09IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N0b3JlU3RvcmVkU1NIRW50cmllcyhlbnRyaWVzOiBJUmVtb3RlQWdlbnRIb3N0RW50cnlbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHJhdyA9IGVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LmNvbm5lY3Rpb24udHlwZSA9PT0gUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCkubWFwKGVudHJ5VG9SYXdFbnRyeSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0aWYgKHJhdy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShTU0hfUkVNT1RFX0FHRU5UX0hPU1RTX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShTU0hfUkVNT1RFX0FHRU5UX0hPU1RTX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShyYXcpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWlncmF0ZVNTSEVudHJpZXNGcm9tU2V0dGluZygpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmVkRW50cmllcyA9IHRoaXMuX2dldENvbmZpZ3VyZWRTZXR0aW5nRW50cmllc0ZvclRhcmdldCgpO1xuXHRcdGNvbnN0IHNzaEVudHJpZXMgPSBjb25maWd1cmVkRW50cmllcy5maWx0ZXIoZW50cnkgPT4gZW50cnkuY29ubmVjdGlvbi50eXBlID09PSBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NIKTtcblx0XHRpZiAoc3NoRW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtaWdyYXRlZEVudHJpZXMgPSB0aGlzLl9tZXJnZUNvbmZpZ3VyZWRFbnRyaWVzKHRoaXMuX2dldFN0b3JlZFNTSEVudHJpZXMoKSwgc3NoRW50cmllcyk7XG5cdFx0dGhpcy5fc3RvcmVTdG9yZWRTU0hFbnRyaWVzKG1pZ3JhdGVkRW50cmllcyk7XG5cdFx0Y29uc3Qgbm9uU1NIRW50cmllcyA9IGNvbmZpZ3VyZWRFbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5jb25uZWN0aW9uLnR5cGUgIT09IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gpO1xuXHRcdGNvbnN0IHJhdyA9IG5vblNTSEVudHJpZXMubWFwKGVudHJ5VG9SYXdFbnRyeSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoUmVtb3RlQWdlbnRIb3N0c1NldHRpbmdJZCwgcmF3LCB0aGlzLl9nZXRDb25maWd1cmF0aW9uVGFyZ2V0KCkpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbUmVtb3RlQWdlbnRIb3N0XSBGYWlsZWQgdG8gbWlncmF0ZSBTU0ggY29ubmVjdGlvbiBkZXRhaWxzIGZyb20gc2V0dGluZ3MgdG8gc3RvcmFnZScsIGVycik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9tZXJnZUNvbmZpZ3VyZWRFbnRyaWVzKGJhc2U6IElSZW1vdGVBZ2VudEhvc3RFbnRyeVtdLCBpbmNvbWluZzogSVJlbW90ZUFnZW50SG9zdEVudHJ5W10pOiBJUmVtb3RlQWdlbnRIb3N0RW50cnlbXSB7XG5cdFx0bGV0IHJlc3VsdCA9IGJhc2U7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBpbmNvbWluZykge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZEFkZHJlc3MgPSBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGdldEVudHJ5QWRkcmVzcyhlbnRyeSkpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdJbmRleCA9IHJlc3VsdC5maW5kSW5kZXgoZSA9PiBub3JtYWxpemVSZW1vdGVBZ2VudEhvc3RBZGRyZXNzKGdldEVudHJ5QWRkcmVzcyhlKSkgPT09IG5vcm1hbGl6ZWRBZGRyZXNzKTtcblx0XHRcdGlmIChleGlzdGluZ0luZGV4ID09PSAtMSkge1xuXHRcdFx0XHRyZXN1bHQgPSBbLi4ucmVzdWx0LCBlbnRyeV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQgPSByZXN1bHQubWFwKChlLCBpbmRleCkgPT4gaW5kZXggPT09IGV4aXN0aW5nSW5kZXggPyBlbnRyeSA6IGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVDb25uZWN0aW9uV2FpdChhZGRyZXNzOiBzdHJpbmcpOiBEZWZlcnJlZFByb21pc2U8SVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvPiB7XG5cdFx0bGV0IHdhaXQgPSB0aGlzLl9wZW5kaW5nQ29ubmVjdGlvbldhaXRzLmdldChhZGRyZXNzKTtcblx0XHRpZiAod2FpdCkge1xuXHRcdFx0cmV0dXJuIHdhaXQ7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIGNvbm5lY3Rpb24gaXMgYWxyZWFkeSBhdmFpbGFibGUgKGZhc3QgY29ubmVjdCByZXNvbHZlZCBiZWZvcmVcblx0XHQvLyB0aGUgY2FsbGVyIGNhbGxlZCB1cyksIHJldHVybiBhbiBpbW1lZGlhdGVseS1jb21wbGV0ZWQgd2FpdC5cblx0XHRjb25zdCBleGlzdGluZ0Nvbm5lY3Rpb24gPSB0aGlzLl9nZXRDb25uZWN0aW9uSW5mbyhhZGRyZXNzKTtcblx0XHRpZiAoZXhpc3RpbmdDb25uZWN0aW9uKSB7XG5cdFx0XHRjb25zdCBpbW1lZGlhdGVXYWl0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8+KCk7XG5cdFx0XHRpbW1lZGlhdGVXYWl0LmNvbXBsZXRlKGV4aXN0aW5nQ29ubmVjdGlvbik7XG5cdFx0XHRyZXR1cm4gaW1tZWRpYXRlV2FpdDtcblx0XHR9XG5cblx0XHR3YWl0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8+KCk7XG5cdFx0dGhpcy5fcGVuZGluZ0Nvbm5lY3Rpb25XYWl0cy5zZXQoYWRkcmVzcywgd2FpdCk7XG5cdFx0cmV0dXJuIHdhaXQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlUGVuZGluZ0Nvbm5lY3Rpb25XYWl0KGFkZHJlc3M6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHdhaXQgPSB0aGlzLl9wZW5kaW5nQ29ubmVjdGlvbldhaXRzLmdldChhZGRyZXNzKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fZ2V0Q29ubmVjdGlvbkluZm8oYWRkcmVzcyk7XG5cdFx0aWYgKCF3YWl0IHx8ICFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ0Nvbm5lY3Rpb25XYWl0cy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0dm9pZCB3YWl0LmNvbXBsZXRlKGNvbm5lY3Rpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVqZWN0UGVuZGluZ0Nvbm5lY3Rpb25XYWl0KGFkZHJlc3M6IHN0cmluZywgZXJyOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FpdCA9IHRoaXMuX3BlbmRpbmdDb25uZWN0aW9uV2FpdHMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmICghd2FpdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BlbmRpbmdDb25uZWN0aW9uV2FpdHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdHZvaWQgd2FpdC5lcnJvcihlcnIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIChvciByZS1yZWdpc3RlcikgdGhlIHtAbGluayBBR0VOVF9IT1NUX1NDSEVNRX0gbGFiZWwgZm9ybWF0dGVyXG5cdCAqIGZvciB0aGUgZ2l2ZW4gYWRkcmVzcyBzbyB0aGF0IHtAbGluayBJTGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbH0gcmVzb2x2ZXNcblx0ICogdG8gdGhlIGVudHJ5J3MgaHVtYW4tcmVhZGFibGUgbmFtZS4gQ2FsbGVkIHdoZW4gYW4gZW50cnkgaXMgYWRkZWQgb3IgaXRzXG5cdCAqIG5hbWUgY2hhbmdlcy5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUhvc3RMYWJlbEZvcm1hdHRlcihhZGRyZXNzOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NsZWFySG9zdExhYmVsRm9ybWF0dGVyKGFkZHJlc3MpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2xhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRzY2hlbWU6IEFHRU5UX0hPU1RfU0NIRU1FLFxuXHRcdFx0YXV0aG9yaXR5OiBhZ2VudEhvc3RBdXRob3JpdHkoYWRkcmVzcyksXG5cdFx0XHRwcmlvcml0eTogdHJ1ZSxcblx0XHRcdGZvcm1hdHRpbmc6IHtcblx0XHRcdFx0Li4uQUdFTlRfSE9TVF9MQUJFTF9GT1JNQVRURVIuZm9ybWF0dGluZyxcblx0XHRcdFx0d29ya3NwYWNlU3VmZml4OiBuYW1lLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHR0aGlzLl9sYWJlbEZvcm1hdHRlcnMuc2V0KGFkZHJlc3MsIGhhbmRsZSk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckhvc3RMYWJlbEZvcm1hdHRlcihhZGRyZXNzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2xhYmVsRm9ybWF0dGVycy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9sYWJlbEZvcm1hdHRlcnMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB0aW1lb3V0IG9mIHRoaXMuX3JlY29ubmVjdFRpbWVvdXRzLnZhbHVlcygpKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlY29ubmVjdFRpbWVvdXRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCB3YWl0XSBvZiB0aGlzLl9wZW5kaW5nQ29ubmVjdGlvbldhaXRzKSB7XG5cdFx0XHR2b2lkIHdhaXQuZXJyb3IobmV3IEVycm9yKGBSZW1vdGUgYWdlbnQgaG9zdCBzZXJ2aWNlIGRpc3Bvc2VkIGJlZm9yZSBjb25uZWN0aW5nIHRvICR7YWRkcmVzc31gKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdDb25uZWN0aW9uV2FpdHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2VudHJpZXMudmFsdWVzKCkpIHtcblx0XHRcdGRpc3Bvc2VFbnRyeShlbnRyeSk7XG5cdFx0fVxuXHRcdHRoaXMuX2VudHJpZXMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGhhbmRsZSBvZiB0aGlzLl9sYWJlbEZvcm1hdHRlcnMudmFsdWVzKCkpIHtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2xhYmVsRm9ybWF0dGVycy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRzV2luZG93UmVtb3RlQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIFJlbW90ZUFnZW50SG9zdFNlcnZpY2Uge1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXQgY2xpZW50SW5mbygpIHtcblx0XHRyZXR1cm4gYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjb25maWd1cmF0aW9uU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2UsIGxhYmVsU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBU0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxpQkFBaUIsbUJBQW1CO0FBQzdDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUU3RCxTQUFTLHlDQUFnRTtBQUN6RTtBQUFBLEVBRUM7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUlNO0FBQ1AsU0FBUywrQkFBK0IsNEJBQTRCO0FBQ3BFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNEJBQTRCLG1CQUFtQixvQkFBb0IsdUNBQXVDO0FBQ25ILFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsaUNBQWlDLHVDQUF1QztBQUVqRixNQUFNLHFDQUFxQztBQW1CM0MsU0FBUyxhQUFhLE9BQStCO0FBQ3BELFFBQU0sTUFBTSxRQUFRO0FBQ3BCLFFBQU0scUJBQXFCLFFBQVE7QUFDcEM7QUFFQSxTQUFTLDBCQUEwQixPQUFtRDtBQUNyRixNQUFJLE9BQU8sVUFBVSxZQUFZLFVBQVUsTUFBTTtBQUNoRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sWUFBWTtBQUNsQixTQUFPLE9BQU8sVUFB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
