import { createCancelablePromise, promiseWithResolvers } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { isCancellationError, onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { RemoteAuthorities } from "../../../base/common/network.js";
import * as performance from "../../../base/common/performance.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { Client, PersistentProtocol, ProtocolConstants, SocketCloseEventType } from "../../../base/parts/ipc/common/ipc.net.js";
import { RemoteAuthorityResolverError } from "./remoteAuthorityResolver.js";
const RECONNECT_TIMEOUT = 30 * 1e3;
var ConnectionType = /* @__PURE__ */ ((ConnectionType2) => {
  ConnectionType2[ConnectionType2["Management"] = 1] = "Management";
  ConnectionType2[ConnectionType2["ExtensionHost"] = 2] = "ExtensionHost";
  ConnectionType2[ConnectionType2["Tunnel"] = 3] = "Tunnel";
  return ConnectionType2;
})(ConnectionType || {});
function connectionTypeToString(connectionType) {
  switch (connectionType) {
    case 1 /* Management */:
      return "Management";
    case 2 /* ExtensionHost */:
      return "ExtensionHost";
    case 3 /* Tunnel */:
      return "Tunnel";
  }
}
function createTimeoutCancellation(millis) {
  const source = new CancellationTokenSource();
  setTimeout(() => source.cancel(), millis);
  return source.token;
}
function combineTimeoutCancellation(a, b) {
  if (a.isCancellationRequested || b.isCancellationRequested) {
    return CancellationToken.Cancelled;
  }
  const source = new CancellationTokenSource();
  a.onCancellationRequested(() => source.cancel());
  b.onCancellationRequested(() => source.cancel());
  return source.token;
}
class PromiseWithTimeout {
  get didTimeout() {
    return this._state === "timedout";
  }
  constructor(timeoutCancellationToken) {
    this._state = "pending";
    this._disposables = new DisposableStore();
    ({ promise: this.promise, resolve: this._resolvePromise, reject: this._rejectPromise } = promiseWithResolvers());
    if (timeoutCancellationToken.isCancellationRequested) {
      this._timeout();
    } else {
      this._disposables.add(timeoutCancellationToken.onCancellationRequested(() => this._timeout()));
    }
  }
  registerDisposable(disposable) {
    if (this._state === "pending") {
      this._disposables.add(disposable);
    } else {
      disposable.dispose();
    }
  }
  _timeout() {
    if (this._state !== "pending") {
      return;
    }
    this._disposables.dispose();
    this._state = "timedout";
    this._rejectPromise(this._createTimeoutError());
  }
  _createTimeoutError() {
    const err = new Error("Time limit reached");
    err.code = "ETIMEDOUT";
    err.syscall = "connect";
    return err;
  }
  resolve(value) {
    if (this._state !== "pending") {
      return;
    }
    this._disposables.dispose();
    this._state = "resolved";
    this._resolvePromise(value);
  }
  reject(err) {
    if (this._state !== "pending") {
      return;
    }
    this._disposables.dispose();
    this._state = "rejected";
    this._rejectPromise(err);
  }
}
function readOneControlMessage(protocol, timeoutCancellationToken) {
  const result = new PromiseWithTimeout(timeoutCancellationToken);
  result.registerDisposable(protocol.onControlMessage((raw) => {
    const msg = JSON.parse(raw.toString());
    const error = getErrorFromMessage(msg);
    if (error) {
      result.reject(error);
    } else {
      result.resolve(msg);
    }
  }));
  return result.promise;
}
function createSocket(logService, remoteSocketFactoryService, connectTo, path, query, debugConnectionType, debugLabel, timeoutCancellationToken) {
  const result = new PromiseWithTimeout(timeoutCancellationToken);
  const sw = StopWatch.create(false);
  logService.info(`Creating a socket (${debugLabel})...`);
  performance.mark(`code/willCreateSocket/${debugConnectionType}`);
  remoteSocketFactoryService.connect(connectTo, path, query, debugLabel).then((socket) => {
    if (result.didTimeout) {
      performance.mark(`code/didCreateSocketError/${debugConnectionType}`);
      logService.info(`Creating a socket (${debugLabel}) finished after ${sw.elapsed()} ms, but this is too late and has timed out already.`);
      socket?.dispose();
    } else {
      performance.mark(`code/didCreateSocketOK/${debugConnectionType}`);
      logService.info(`Creating a socket (${debugLabel}) was successful after ${sw.elapsed()} ms.`);
      result.resolve(socket);
    }
  }, (err) => {
    performance.mark(`code/didCreateSocketError/${debugConnectionType}`);
    logService.info(`Creating a socket (${debugLabel}) returned an error after ${sw.elapsed()} ms.`);
    logService.error(err);
    result.reject(err);
  });
  return result.promise;
}
function raceWithTimeoutCancellation(promise, timeoutCancellationToken) {
  const result = new PromiseWithTimeout(timeoutCancellationToken);
  promise.then(
    (res) => {
      if (!result.didTimeout) {
        result.resolve(res);
      }
    },
    (err) => {
      if (!result.didTimeout) {
        result.reject(err);
      }
    }
  );
  return result.promise;
}
async function connectToRemoteExtensionHostAgent(options, connectionType, args, timeoutCancellationToken) {
  const logPrefix = connectLogPrefix(options, connectionType);
  options.logService.trace(`${logPrefix} 1/6. invoking socketFactory.connect().`);
  let socket;
  try {
    socket = await createSocket(options.logService, options.remoteSocketFactoryService, options.connectTo, RemoteAuthorities.getServerRootPath(), `reconnectionToken=${options.reconnectionToken}&reconnection=${options.reconnectionProtocol ? "true" : "false"}`, connectionTypeToString(connectionType), `renderer-${connectionTypeToString(connectionType)}-${options.reconnectionToken}`, timeoutCancellationToken);
  } catch (error) {
    options.logService.error(`${logPrefix} socketFactory.connect() failed or timed out. Error:`);
    options.logService.error(error);
    throw error;
  }
  options.logService.trace(`${logPrefix} 2/6. socketFactory.connect() was successful.`);
  let protocol;
  let ownsProtocol;
  if (options.reconnectionProtocol) {
    options.reconnectionProtocol.beginAcceptReconnection(socket, null);
    protocol = options.reconnectionProtocol;
    ownsProtocol = false;
  } else {
    protocol = new PersistentProtocol({ socket });
    ownsProtocol = true;
  }
  options.logService.trace(`${logPrefix} 3/6. sending AuthRequest control message.`);
  const message = await raceWithTimeoutCancellation(options.signService.createNewMessage(generateUuid()), timeoutCancellationToken);
  const authRequest = {
    type: "auth",
    auth: options.connectionToken || "00000000000000000000",
    data: message.data
  };
  protocol.sendControl(VSBuffer.fromString(JSON.stringify(authRequest)));
  try {
    const msg = await readOneControlMessage(protocol, combineTimeoutCancellation(timeoutCancellationToken, createTimeoutCancellation(1e4)));
    if (msg.type !== "sign" || typeof msg.data !== "string") {
      const error = new Error("Unexpected handshake message");
      error.code = "VSCODE_CONNECTION_ERROR";
      throw error;
    }
    options.logService.trace(`${logPrefix} 4/6. received SignRequest control message.`);
    const isValid = await raceWithTimeoutCancellation(options.signService.validate(message, msg.signedData), timeoutCancellationToken);
    if (!isValid) {
      const error = new Error("Refused to connect to unsupported server");
      error.code = "VSCODE_CONNECTION_ERROR";
      throw error;
    }
    const signed = await raceWithTimeoutCancellation(options.signService.sign(msg.data), timeoutCancellationToken);
    const connTypeRequest = {
      type: "connectionType",
      commit: options.commit,
      signedData: signed,
      desiredConnectionType: connectionType
    };
    if (args) {
      connTypeRequest.args = args;
    }
    options.logService.trace(`${logPrefix} 5/6. sending ConnectionTypeRequest control message.`);
    protocol.sendControl(VSBuffer.fromString(JSON.stringify(connTypeRequest)));
    return { protocol, ownsProtocol };
  } catch (error) {
    if (error && error.code === "ETIMEDOUT") {
      options.logService.error(`${logPrefix} the handshake timed out. Error:`);
      options.logService.error(error);
    }
    if (error && error.code === "VSCODE_CONNECTION_ERROR") {
      options.logService.error(`${logPrefix} received error control message when negotiating connection. Error:`);
      options.logService.error(error);
    }
    if (ownsProtocol) {
      safeDisposeProtocolAndSocket(protocol);
    }
    throw error;
  }
}
async function connectToRemoteExtensionHostAgentAndReadOneMessage(options, connectionType, args, timeoutCancellationToken) {
  const startTime = Date.now();
  const logPrefix = connectLogPrefix(options, connectionType);
  const { protocol, ownsProtocol } = await connectToRemoteExtensionHostAgent(options, connectionType, args, timeoutCancellationToken);
  const result = new PromiseWithTimeout(timeoutCancellationToken);
  result.registerDisposable(protocol.onControlMessage((raw) => {
    const msg = JSON.parse(raw.toString());
    const error = getErrorFromMessage(msg);
    if (error) {
      options.logService.error(`${logPrefix} received error control message when negotiating connection. Error:`);
      options.logService.error(error);
      if (ownsProtocol) {
        safeDisposeProtocolAndSocket(protocol);
      }
      result.reject(error);
    } else {
      options.reconnectionProtocol?.endAcceptReconnection();
      options.logService.trace(`${logPrefix} 6/6. handshake finished, connection is up and running after ${logElapsed(startTime)}!`);
      result.resolve({ protocol, firstMessage: msg });
    }
  }));
  return result.promise;
}
async function doConnectRemoteAgentManagement(options, timeoutCancellationToken) {
  const { protocol } = await connectToRemoteExtensionHostAgentAndReadOneMessage(options, 1 /* Management */, void 0, timeoutCancellationToken);
  return { protocol };
}
async function doConnectRemoteAgentExtensionHost(options, startArguments, timeoutCancellationToken) {
  const { protocol, firstMessage } = await connectToRemoteExtensionHostAgentAndReadOneMessage(options, 2 /* ExtensionHost */, startArguments, timeoutCancellationToken);
  const debugPort = firstMessage && firstMessage.debugPort;
  return { protocol, debugPort };
}
async function doConnectRemoteAgentTunnel(options, startParams, timeoutCancellationToken) {
  const startTime = Date.now();
  const logPrefix = connectLogPrefix(options, 3 /* Tunnel */);
  const { protocol } = await connectToRemoteExtensionHostAgentAndReadOneMessage(options, 3 /* Tunnel */, startParams, timeoutCancellationToken);
  options.logService.trace(`${logPrefix} 6/6. handshake finished, connection is up and running after ${logElapsed(startTime)}!`);
  return protocol;
}
async function resolveConnectionOptions(options, reconnectionToken, reconnectionProtocol) {
  const { connectTo, connectionToken } = await options.addressProvider.getAddress();
  return {
    commit: options.commit,
    quality: options.quality,
    connectTo,
    connectionToken,
    reconnectionToken,
    reconnectionProtocol,
    remoteSocketFactoryService: options.remoteSocketFactoryService,
    signService: options.signService,
    logService: options.logService
  };
}
async function connectRemoteAgentManagement(options, remoteAuthority, clientId) {
  return createInitialConnection(
    options,
    async (simpleOptions) => {
      const { protocol } = await doConnectRemoteAgentManagement(simpleOptions, CancellationToken.None);
      return new ManagementPersistentConnection(options, remoteAuthority, clientId, simpleOptions.reconnectionToken, protocol);
    }
  );
}
async function connectRemoteAgentExtensionHost(options, startArguments) {
  return createInitialConnection(
    options,
    async (simpleOptions) => {
      const { protocol, debugPort } = await doConnectRemoteAgentExtensionHost(simpleOptions, startArguments, CancellationToken.None);
      return new ExtensionHostPersistentConnection(options, startArguments, simpleOptions.reconnectionToken, protocol, debugPort);
    }
  );
}
async function createInitialConnection(options, connectionFactory) {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      const reconnectionToken = generateUuid();
      const simpleOptions = await resolveConnectionOptions(options, reconnectionToken, null);
      const result = await connectionFactory(simpleOptions);
      return result;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        options.logService.error(`[remote-connection][attempt ${attempt}] An error occurred in initial connection! Will retry... Error:`);
        options.logService.error(err);
      } else {
        options.logService.error(`[remote-connection][attempt ${attempt}]  An error occurred in initial connection! It will be treated as a permanent error. Error:`);
        options.logService.error(err);
        PersistentConnection.triggerPermanentFailure(0, 0, RemoteAuthorityResolverError.isHandled(err));
        throw err;
      }
    }
  }
}
async function connectRemoteAgentTunnel(options, tunnelRemoteHost, tunnelRemotePort) {
  const simpleOptions = await resolveConnectionOptions(options, generateUuid(), null);
  const protocol = await doConnectRemoteAgentTunnel(simpleOptions, { host: tunnelRemoteHost, port: tunnelRemotePort }, CancellationToken.None);
  return protocol;
}
function sleep(seconds) {
  return createCancelablePromise((token) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, seconds * 1e3);
      token.onCancellationRequested(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  });
}
var PersistentConnectionEventType = /* @__PURE__ */ ((PersistentConnectionEventType2) => {
  PersistentConnectionEventType2[PersistentConnectionEventType2["ConnectionLost"] = 0] = "ConnectionLost";
  PersistentConnectionEventType2[PersistentConnectionEventType2["ReconnectionWait"] = 1] = "ReconnectionWait";
  PersistentConnectionEventType2[PersistentConnectionEventType2["ReconnectionRunning"] = 2] = "ReconnectionRunning";
  PersistentConnectionEventType2[PersistentConnectionEventType2["ReconnectionPermanentFailure"] = 3] = "ReconnectionPermanentFailure";
  PersistentConnectionEventType2[PersistentConnectionEventType2["ConnectionGain"] = 4] = "ConnectionGain";
  return PersistentConnectionEventType2;
})(PersistentConnectionEventType || {});
class ConnectionLostEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.type = 0 /* ConnectionLost */;
  }
}
class ReconnectionWaitEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData, durationSeconds, cancellableTimer) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.durationSeconds = durationSeconds;
    this.cancellableTimer = cancellableTimer;
    this.type = 1 /* ReconnectionWait */;
  }
  skipWait() {
    this.cancellableTimer.cancel();
  }
}
class ReconnectionRunningEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData, attempt) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.attempt = attempt;
    this.type = 2 /* ReconnectionRunning */;
  }
}
class ConnectionGainEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData, attempt) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.attempt = attempt;
    this.type = 4 /* ConnectionGain */;
  }
}
class ReconnectionPermanentFailureEvent {
  constructor(reconnectionToken, millisSinceLastIncomingData, attempt, handled) {
    this.reconnectionToken = reconnectionToken;
    this.millisSinceLastIncomingData = millisSinceLastIncomingData;
    this.attempt = attempt;
    this.handled = handled;
    this.type = 3 /* ReconnectionPermanentFailure */;
  }
}
const _PersistentConnection = class _PersistentConnection extends Disposable {
  constructor(_connectionType, _options, reconnectionToken, protocol, _reconnectionFailureIsFatal) {
    super();
    this._connectionType = _connectionType;
    this._options = _options;
    this.reconnectionToken = reconnectionToken;
    this.protocol = protocol;
    this._reconnectionFailureIsFatal = _reconnectionFailureIsFatal;
    this._onDidStateChange = this._register(new Emitter());
    this.onDidStateChange = this._onDidStateChange.event;
    this._permanentFailure = false;
    this._isReconnecting = false;
    this._isDisposed = false;
    this._reconnectionGraceTime = ProtocolConstants.ReconnectionGraceTime;
    this._onDidStateChange.fire(new ConnectionGainEvent(this.reconnectionToken, 0, 0));
    this._register(protocol.onSocketClose((e) => {
      const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
      if (!e) {
        this._options.logService.info(`${logPrefix} received socket close event.`);
      } else if (e.type === SocketCloseEventType.NodeSocketCloseEvent) {
        this._options.logService.info(`${logPrefix} received socket close event (hadError: ${e.hadError}).`);
        if (e.error) {
          this._options.logService.error(e.error);
        }
      } else {
        this._options.logService.info(`${logPrefix} received socket close event (wasClean: ${e.wasClean}, code: ${e.code}, reason: ${e.reason}).`);
        if (e.event) {
          this._options.logService.error(e.event);
        }
      }
      this._beginReconnecting();
    }));
    this._register(protocol.onSocketTimeout((e) => {
      const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
      this._options.logService.info(`${logPrefix} received socket timeout event (reason: ${e.reason}, unacknowledgedMsgCount: ${e.unacknowledgedMsgCount}, timeSinceOldestUnacknowledgedMsg: ${e.timeSinceOldestUnacknowledgedMsg}, timeSinceLastReceivedSomeData: ${e.timeSinceLastReceivedSomeData}).`);
      this._beginReconnecting();
    }));
    _PersistentConnection._instances.push(this);
    this._register(toDisposable(() => {
      const myIndex = _PersistentConnection._instances.indexOf(this);
      if (myIndex >= 0) {
        _PersistentConnection._instances.splice(myIndex, 1);
      }
    }));
    if (this._isPermanentFailure) {
      this._gotoPermanentFailure(_PersistentConnection._permanentFailureMillisSinceLastIncomingData, _PersistentConnection._permanentFailureAttempt, _PersistentConnection._permanentFailureHandled);
    }
  }
  static triggerPermanentFailure(millisSinceLastIncomingData, attempt, handled) {
    this._permanentFailure = true;
    this._permanentFailureMillisSinceLastIncomingData = millisSinceLastIncomingData;
    this._permanentFailureAttempt = attempt;
    this._permanentFailureHandled = handled;
    this._instances.forEach((instance) => instance._gotoPermanentFailure(this._permanentFailureMillisSinceLastIncomingData, this._permanentFailureAttempt, this._permanentFailureHandled));
  }
  static debugTriggerReconnection() {
    this._instances.forEach((instance) => instance._beginReconnecting());
  }
  static debugPauseSocketWriting() {
    this._instances.forEach((instance) => instance._pauseSocketWriting());
  }
  get _isPermanentFailure() {
    return this._permanentFailure || _PersistentConnection._permanentFailure;
  }
  updateGraceTime(graceTime) {
    const sanitizedGrace = sanitizeGraceTime(graceTime, ProtocolConstants.ReconnectionGraceTime);
    const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, false);
    this._options.logService.trace(`${logPrefix} Applying reconnection grace time: ${sanitizedGrace}ms (${Math.floor(sanitizedGrace / 1e3)}s)`);
    this._reconnectionGraceTime = sanitizedGrace;
  }
  dispose() {
    super.dispose();
    this._isDisposed = true;
  }
  async _beginReconnecting() {
    if (this._isReconnecting) {
      return;
    }
    try {
      this._isReconnecting = true;
      await this._runReconnectingLoop();
    } finally {
      this._isReconnecting = false;
    }
  }
  async _runReconnectingLoop() {
    if (this._isPermanentFailure || this._isDisposed) {
      return;
    }
    const logPrefix = commonLogPrefix(this._connectionType, this.reconnectionToken, true);
    this._options.logService.info(`${logPrefix} starting reconnecting loop. You can get more information with the trace log level.`);
    this._onDidStateChange.fire(new ConnectionLostEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData()));
    const TIMES = [0, 5, 5, 10, 10, 10, 10, 10, 30];
    const graceTime = this._reconnectionGraceTime;
    this._options.logService.info(`${logPrefix} starting reconnection with grace time: ${graceTime}ms (${Math.floor(graceTime / 1e3)}s)`);
    if (graceTime <= 0) {
      this._options.logService.error(`${logPrefix} reconnection grace time is set to 0ms, will not attempt to reconnect.`);
      this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), 0, false);
      return;
    }
    const loopStartTime = Date.now();
    let attempt = -1;
    do {
      attempt++;
      const waitTime = attempt < TIMES.length ? TIMES[attempt] : TIMES[TIMES.length - 1];
      try {
        if (waitTime > 0) {
          const sleepPromise = sleep(waitTime);
          this._onDidStateChange.fire(new ReconnectionWaitEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), waitTime, sleepPromise));
          this._options.logService.info(`${logPrefix} waiting for ${waitTime} seconds before reconnecting...`);
          try {
            await sleepPromise;
          } catch {
          }
        }
        if (this._isPermanentFailure) {
          this._options.logService.error(`${logPrefix} permanent failure occurred while running the reconnecting loop.`);
          break;
        }
        this._onDidStateChange.fire(new ReconnectionRunningEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), attempt + 1));
        this._options.logService.info(`${logPrefix} resolving connection...`);
        const simpleOptions = await resolveConnectionOptions(this._options, this.reconnectionToken, this.protocol);
        this._options.logService.info(`${logPrefix} connecting to ${simpleOptions.connectTo}...`);
        await this._reconnect(simpleOptions, createTimeoutCancellation(RECONNECT_TIMEOUT));
        this._options.logService.info(`${logPrefix} reconnected!`);
        this._onDidStateChange.fire(new ConnectionGainEvent(this.reconnectionToken, this.protocol.getMillisSinceLastIncomingData(), attempt + 1));
        break;
      } catch (err) {
        if (err.code === "VSCODE_CONNECTION_ERROR") {
          this._options.logService.error(`${logPrefix} A permanent error occurred in the reconnecting loop! Will give up now! Error:`);
          this._options.logService.error(err);
          this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
          break;
        }
        if (Date.now() - loopStartTime >= graceTime) {
          const graceSeconds = Math.round(graceTime / 1e3);
          this._options.logService.error(`${logPrefix} An error occurred while reconnecting, but it will be treated as a permanent error because the reconnection grace time (${graceSeconds}s) has expired! Will give up now! Error:`);
          this._options.logService.error(err);
          this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
          break;
        }
        if (RemoteAuthorityResolverError.isTemporarilyNotAvailable(err)) {
          this._options.logService.info(`${logPrefix} A temporarily not available error occurred while trying to reconnect, will try again...`);
          this._options.logService.trace(err);
          continue;
        }
        if ((err.code === "ETIMEDOUT" || err.code === "ENETUNREACH" || err.code === "ECONNREFUSED" || err.code === "ECONNRESET") && err.syscall === "connect") {
          this._options.logService.info(`${logPrefix} A network error occurred while trying to reconnect, will try again...`);
          this._options.logService.trace(err);
          continue;
        }
        if (isCancellationError(err)) {
          this._options.logService.info(`${logPrefix} A promise cancelation error occurred while trying to reconnect, will try again...`);
          this._options.logService.trace(err);
          continue;
        }
        if (err instanceof RemoteAuthorityResolverError) {
          this._options.logService.error(`${logPrefix} A RemoteAuthorityResolverError occurred while trying to reconnect. Will give up now! Error:`);
          this._options.logService.error(err);
          this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, RemoteAuthorityResolverError.isHandled(err));
          break;
        }
        this._options.logService.error(`${logPrefix} An unknown error occurred while trying to reconnect, since this is an unknown case, it will be treated as a permanent error! Will give up now! Error:`);
        this._options.logService.error(err);
        this._onReconnectionPermanentFailure(this.protocol.getMillisSinceLastIncomingData(), attempt + 1, false);
        break;
      }
    } while (!this._isPermanentFailure && !this._isDisposed);
  }
  _onReconnectionPermanentFailure(millisSinceLastIncomingData, attempt, handled) {
    if (this._reconnectionFailureIsFatal) {
      _PersistentConnection.triggerPermanentFailure(millisSinceLastIncomingData, attempt, handled);
    } else {
      this._gotoPermanentFailure(millisSinceLastIncomingData, attempt, handled);
    }
  }
  _gotoPermanentFailure(millisSinceLastIncomingData, attempt, handled) {
    this._onDidStateChange.fire(new ReconnectionPermanentFailureEvent(this.reconnectionToken, millisSinceLastIncomingData, attempt, handled));
    safeDisposeProtocolAndSocket(this.protocol);
  }
  _pauseSocketWriting() {
    this.protocol.pauseSocketWriting();
  }
};
_PersistentConnection._permanentFailure = false;
_PersistentConnection._permanentFailureMillisSinceLastIncomingData = 0;
_PersistentConnection._permanentFailureAttempt = 0;
_PersistentConnection._permanentFailureHandled = false;
_PersistentConnection._instances = [];
let PersistentConnection = _PersistentConnection;
class ManagementPersistentConnection extends PersistentConnection {
  constructor(options, remoteAuthority, clientId, reconnectionToken, protocol) {
    super(
      1 /* Management */,
      options,
      reconnectionToken,
      protocol,
      /*reconnectionFailureIsFatal*/
      true
    );
    this.client = this._register(new Client(protocol, {
      remoteAuthority,
      clientId
    }, options.ipcLogger));
  }
  async _reconnect(options, timeoutCancellationToken) {
    await doConnectRemoteAgentManagement(options, timeoutCancellationToken);
  }
}
class ExtensionHostPersistentConnection extends PersistentConnection {
  constructor(options, startArguments, reconnectionToken, protocol, debugPort) {
    super(
      2 /* ExtensionHost */,
      options,
      reconnectionToken,
      protocol,
      /*reconnectionFailureIsFatal*/
      false
    );
    this._startArguments = startArguments;
    this.debugPort = debugPort;
  }
  async _reconnect(options, timeoutCancellationToken) {
    await doConnectRemoteAgentExtensionHost(options, this._startArguments, timeoutCancellationToken);
  }
}
function safeDisposeProtocolAndSocket(protocol) {
  try {
    protocol.acceptDisconnect();
    const socket = protocol.getSocket();
    protocol.dispose();
    socket.dispose();
  } catch (err) {
    onUnexpectedError(err);
  }
}
function getErrorFromMessage(msg) {
  if (msg && msg.type === "error") {
    const error = new Error(`Connection error: ${msg.reason}`);
    error.code = "VSCODE_CONNECTION_ERROR";
    return error;
  }
  return null;
}
function sanitizeGraceTime(candidate, fallback) {
  if (typeof candidate !== "number" || !isFinite(candidate) || candidate < 0) {
    return fallback;
  }
  if (candidate > Number.MAX_SAFE_INTEGER) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.floor(candidate);
}
function stringRightPad(str, len) {
  while (str.length < len) {
    str += " ";
  }
  return str;
}
function _commonLogPrefix(connectionType, reconnectionToken) {
  return `[remote-connection][${stringRightPad(connectionTypeToString(connectionType), 13)}][${reconnectionToken.substr(0, 5)}\u2026]`;
}
function commonLogPrefix(connectionType, reconnectionToken, isReconnect) {
  return `${_commonLogPrefix(connectionType, reconnectionToken)}[${isReconnect ? "reconnect" : "initial"}]`;
}
function connectLogPrefix(options, connectionType) {
  return `${commonLogPrefix(connectionType, options.reconnectionToken, !!options.reconnectionProtocol)}[${options.connectTo}]`;
}
function logElapsed(startTime) {
  return `${Date.now() - startTime} ms`;
}
export {
  ConnectionGainEvent,
  ConnectionLostEvent,
  ConnectionType,
  ExtensionHostPersistentConnection,
  ManagementPersistentConnection,
  PersistentConnection,
  PersistentConnectionEventType,
  ReconnectionPermanentFailureEvent,
  ReconnectionRunningEvent,
  ReconnectionWaitEvent,
  connectRemoteAgentExtensionHost,
  connectRemoteAgentManagement,
  connectRemoteAgentTunnel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRDb25uZWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBwcm9taXNlV2l0aFJlc29sdmVycyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yLCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlbW90ZUF1dGhvcml0aWVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwZXJmb3JtYW5jZSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJSVBDTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBDbGllbnQsIElTb2NrZXQsIFBlcnNpc3RlbnRQcm90b2NvbCwgUHJvdG9jb2xDb25zdGFudHMsIFNvY2tldENsb3NlRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudENvbm5lY3Rpb25Db250ZXh0IH0gZnJvbSAnLi9yZW1vdGVBZ2VudEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IsIFJlbW90ZUNvbm5lY3Rpb24gfSBmcm9tICcuL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElSZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZSB9IGZyb20gJy4vcmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNpZ25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2lnbi9jb21tb24vc2lnbi5qcyc7XG5cbmNvbnN0IFJFQ09OTkVDVF9USU1FT1VUID0gMzAgKiAxMDAwIC8qIDMwcyAqLztcblxuZXhwb3J0IGNvbnN0IGVudW0gQ29ubmVjdGlvblR5cGUge1xuXHRNYW5hZ2VtZW50ID0gMSxcblx0RXh0ZW5zaW9uSG9zdCA9IDIsXG5cdFR1bm5lbCA9IDMsXG59XG5cbmZ1bmN0aW9uIGNvbm5lY3Rpb25UeXBlVG9TdHJpbmcoY29ubmVjdGlvblR5cGU6IENvbm5lY3Rpb25UeXBlKTogc3RyaW5nIHtcblx0c3dpdGNoIChjb25uZWN0aW9uVHlwZSkge1xuXHRcdGNhc2UgQ29ubmVjdGlvblR5cGUuTWFuYWdlbWVudDpcblx0XHRcdHJldHVybiAnTWFuYWdlbWVudCc7XG5cdFx0Y2FzZSBDb25uZWN0aW9uVHlwZS5FeHRlbnNpb25Ib3N0OlxuXHRcdFx0cmV0dXJuICdFeHRlbnNpb25Ib3N0Jztcblx0XHRjYXNlIENvbm5lY3Rpb25UeXBlLlR1bm5lbDpcblx0XHRcdHJldHVybiAnVHVubmVsJztcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhSZXF1ZXN0IHtcblx0dHlwZTogJ2F1dGgnO1xuXHRhdXRoOiBzdHJpbmc7XG5cdGRhdGE6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTaWduUmVxdWVzdCB7XG5cdHR5cGU6ICdzaWduJztcblx0ZGF0YTogc3RyaW5nO1xuXHRzaWduZWREYXRhOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29ubmVjdGlvblR5cGVSZXF1ZXN0IHtcblx0dHlwZTogJ2Nvbm5lY3Rpb25UeXBlJztcblx0Y29tbWl0Pzogc3RyaW5nO1xuXHRzaWduZWREYXRhOiBzdHJpbmc7XG5cdGRlc2lyZWRDb25uZWN0aW9uVHlwZT86IENvbm5lY3Rpb25UeXBlO1xuXHRhcmdzPzogYW55O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEVycm9yTWVzc2FnZSB7XG5cdHR5cGU6ICdlcnJvcic7XG5cdHJlYXNvbjogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE9LTWVzc2FnZSB7XG5cdHR5cGU6ICdvayc7XG59XG5cbmV4cG9ydCB0eXBlIEhhbmRzaGFrZU1lc3NhZ2UgPSBBdXRoUmVxdWVzdCB8IFNpZ25SZXF1ZXN0IHwgQ29ubmVjdGlvblR5cGVSZXF1ZXN0IHwgRXJyb3JNZXNzYWdlIHwgT0tNZXNzYWdlO1xuXG5cbmludGVyZmFjZSBJU2ltcGxlQ29ubmVjdGlvbk9wdGlvbnM8VCBleHRlbmRzIFJlbW90ZUNvbm5lY3Rpb24gPSBSZW1vdGVDb25uZWN0aW9uPiB7XG5cdGNvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRxdWFsaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGNvbm5lY3RUbzogVDtcblx0Y29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmc7XG5cdHJlY29ubmVjdGlvblByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wgfCBudWxsO1xuXHRyZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZTogSVJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlO1xuXHRzaWduU2VydmljZTogSVNpZ25TZXJ2aWNlO1xuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGltZW91dENhbmNlbGxhdGlvbihtaWxsaXM6IG51bWJlcik6IENhbmNlbGxhdGlvblRva2VuIHtcblx0Y29uc3Qgc291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdHNldFRpbWVvdXQoKCkgPT4gc291cmNlLmNhbmNlbCgpLCBtaWxsaXMpO1xuXHRyZXR1cm4gc291cmNlLnRva2VuO1xufVxuXG5mdW5jdGlvbiBjb21iaW5lVGltZW91dENhbmNlbGxhdGlvbihhOiBDYW5jZWxsYXRpb25Ub2tlbiwgYjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBDYW5jZWxsYXRpb25Ub2tlbiB7XG5cdGlmIChhLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IGIuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRyZXR1cm4gQ2FuY2VsbGF0aW9uVG9rZW4uQ2FuY2VsbGVkO1xuXHR9XG5cdGNvbnN0IHNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRhLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHNvdXJjZS5jYW5jZWwoKSk7XG5cdGIub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gc291cmNlLmNhbmNlbCgpKTtcblx0cmV0dXJuIHNvdXJjZS50b2tlbjtcbn1cblxuY2xhc3MgUHJvbWlzZVdpdGhUaW1lb3V0PFQ+IHtcblxuXHRwcml2YXRlIF9zdGF0ZTogJ3BlbmRpbmcnIHwgJ3Jlc29sdmVkJyB8ICdyZWplY3RlZCcgfCAndGltZWRvdXQnO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTxUPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZVByb21pc2U6ICh2YWx1ZTogVCkgPT4gdm9pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVqZWN0UHJvbWlzZTogKGVycjogYW55KSA9PiB2b2lkO1xuXG5cdHB1YmxpYyBnZXQgZGlkVGltZW91dCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX3N0YXRlID09PSAndGltZWRvdXQnKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHR0aGlzLl9zdGF0ZSA9ICdwZW5kaW5nJztcblx0XHR0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdCh7IHByb21pc2U6IHRoaXMucHJvbWlzZSwgcmVzb2x2ZTogdGhpcy5fcmVzb2x2ZVByb21pc2UsIHJlamVjdDogdGhpcy5fcmVqZWN0UHJvbWlzZSB9ID0gcHJvbWlzZVdpdGhSZXNvbHZlcnM8VD4oKSk7XG5cblx0XHRpZiAodGltZW91dENhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLl90aW1lb3V0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gdGhpcy5fdGltZW91dCgpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gJ3BlbmRpbmcnKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RpbWVvdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlICE9PSAncGVuZGluZycpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0YXRlID0gJ3RpbWVkb3V0Jztcblx0XHR0aGlzLl9yZWplY3RQcm9taXNlKHRoaXMuX2NyZWF0ZVRpbWVvdXRFcnJvcigpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRpbWVvdXRFcnJvcigpOiBFcnJvciB7XG5cdFx0Y29uc3QgZXJyOiBhbnkgPSBuZXcgRXJyb3IoJ1RpbWUgbGltaXQgcmVhY2hlZCcpO1xuXHRcdGVyci5jb2RlID0gJ0VUSU1FRE9VVCc7XG5cdFx0ZXJyLnN5c2NhbGwgPSAnY29ubmVjdCc7XG5cdFx0cmV0dXJuIGVycjtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlKHZhbHVlOiBUKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlICE9PSAncGVuZGluZycpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0YXRlID0gJ3Jlc29sdmVkJztcblx0XHR0aGlzLl9yZXNvbHZlUHJvbWlzZSh2YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVqZWN0KGVycjogYW55KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlICE9PSAncGVuZGluZycpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0YXRlID0gJ3JlamVjdGVkJztcblx0XHR0aGlzLl9yZWplY3RQcm9taXNlKGVycik7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVhZE9uZUNvbnRyb2xNZXNzYWdlPFQ+KHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2wsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+IHtcblx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21pc2VXaXRoVGltZW91dDxUPih0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRyZXN1bHQucmVnaXN0ZXJEaXNwb3NhYmxlKHByb3RvY29sLm9uQ29udHJvbE1lc3NhZ2UocmF3ID0+IHtcblx0XHRjb25zdCBtc2c6IFQgPSBKU09OLnBhcnNlKHJhdy50b1N0cmluZygpKTtcblx0XHRjb25zdCBlcnJvciA9IGdldEVycm9yRnJvbU1lc3NhZ2UobXNnKTtcblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdHJlc3VsdC5yZWplY3QoZXJyb3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQucmVzb2x2ZShtc2cpO1xuXHRcdH1cblx0fSkpO1xuXHRyZXR1cm4gcmVzdWx0LnByb21pc2U7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNvY2tldDxUIGV4dGVuZHMgUmVtb3RlQ29ubmVjdGlvbj4obG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIHJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlOiBJUmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2UsIGNvbm5lY3RUbzogVCwgcGF0aDogc3RyaW5nLCBxdWVyeTogc3RyaW5nLCBkZWJ1Z0Nvbm5lY3Rpb25UeXBlOiBzdHJpbmcsIGRlYnVnTGFiZWw6IHN0cmluZywgdGltZW91dENhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNvY2tldD4ge1xuXHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbWlzZVdpdGhUaW1lb3V0PElTb2NrZXQ+KHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cdGxvZ1NlcnZpY2UuaW5mbyhgQ3JlYXRpbmcgYSBzb2NrZXQgKCR7ZGVidWdMYWJlbH0pLi4uYCk7XG5cdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvd2lsbENyZWF0ZVNvY2tldC8ke2RlYnVnQ29ubmVjdGlvblR5cGV9YCk7XG5cblx0cmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2UuY29ubmVjdChjb25uZWN0VG8sIHBhdGgsIHF1ZXJ5LCBkZWJ1Z0xhYmVsKS50aGVuKChzb2NrZXQpID0+IHtcblx0XHRpZiAocmVzdWx0LmRpZFRpbWVvdXQpIHtcblx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZGlkQ3JlYXRlU29ja2V0RXJyb3IvJHtkZWJ1Z0Nvbm5lY3Rpb25UeXBlfWApO1xuXHRcdFx0bG9nU2VydmljZS5pbmZvKGBDcmVhdGluZyBhIHNvY2tldCAoJHtkZWJ1Z0xhYmVsfSkgZmluaXNoZWQgYWZ0ZXIgJHtzdy5lbGFwc2VkKCl9IG1zLCBidXQgdGhpcyBpcyB0b28gbGF0ZSBhbmQgaGFzIHRpbWVkIG91dCBhbHJlYWR5LmApO1xuXHRcdFx0c29ja2V0Py5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZGlkQ3JlYXRlU29ja2V0T0svJHtkZWJ1Z0Nvbm5lY3Rpb25UeXBlfWApO1xuXHRcdFx0bG9nU2VydmljZS5pbmZvKGBDcmVhdGluZyBhIHNvY2tldCAoJHtkZWJ1Z0xhYmVsfSkgd2FzIHN1Y2Nlc3NmdWwgYWZ0ZXIgJHtzdy5lbGFwc2VkKCl9IG1zLmApO1xuXHRcdFx0cmVzdWx0LnJlc29sdmUoc29ja2V0KTtcblx0XHR9XG5cdH0sIChlcnIpID0+IHtcblx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2RpZENyZWF0ZVNvY2tldEVycm9yLyR7ZGVidWdDb25uZWN0aW9uVHlwZX1gKTtcblx0XHRsb2dTZXJ2aWNlLmluZm8oYENyZWF0aW5nIGEgc29ja2V0ICgke2RlYnVnTGFiZWx9KSByZXR1cm5lZCBhbiBlcnJvciBhZnRlciAke3N3LmVsYXBzZWQoKX0gbXMuYCk7XG5cdFx0bG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdHJlc3VsdC5yZWplY3QoZXJyKTtcblx0fSk7XG5cblx0cmV0dXJuIHJlc3VsdC5wcm9taXNlO1xufVxuXG5mdW5jdGlvbiByYWNlV2l0aFRpbWVvdXRDYW5jZWxsYXRpb248VD4ocHJvbWlzZTogUHJvbWlzZTxUPiwgdGltZW91dENhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VD4ge1xuXHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbWlzZVdpdGhUaW1lb3V0PFQ+KHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cdHByb21pc2UudGhlbihcblx0XHQocmVzKSA9PiB7XG5cdFx0XHRpZiAoIXJlc3VsdC5kaWRUaW1lb3V0KSB7XG5cdFx0XHRcdHJlc3VsdC5yZXNvbHZlKHJlcyk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHQoZXJyKSA9PiB7XG5cdFx0XHRpZiAoIXJlc3VsdC5kaWRUaW1lb3V0KSB7XG5cdFx0XHRcdHJlc3VsdC5yZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdCk7XG5cdHJldHVybiByZXN1bHQucHJvbWlzZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29ubmVjdFRvUmVtb3RlRXh0ZW5zaW9uSG9zdEFnZW50PFQgZXh0ZW5kcyBSZW1vdGVDb25uZWN0aW9uPihvcHRpb25zOiBJU2ltcGxlQ29ubmVjdGlvbk9wdGlvbnM8VD4sIGNvbm5lY3Rpb25UeXBlOiBDb25uZWN0aW9uVHlwZSwgYXJnczogYW55IHwgdW5kZWZpbmVkLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2w7IG93bnNQcm90b2NvbDogYm9vbGVhbiB9PiB7XG5cdGNvbnN0IGxvZ1ByZWZpeCA9IGNvbm5lY3RMb2dQcmVmaXgob3B0aW9ucywgY29ubmVjdGlvblR5cGUpO1xuXG5cdG9wdGlvbnMubG9nU2VydmljZS50cmFjZShgJHtsb2dQcmVmaXh9IDEvNi4gaW52b2tpbmcgc29ja2V0RmFjdG9yeS5jb25uZWN0KCkuYCk7XG5cblx0bGV0IHNvY2tldDogSVNvY2tldDtcblx0dHJ5IHtcblx0XHRzb2NrZXQgPSBhd2FpdCBjcmVhdGVTb2NrZXQob3B0aW9ucy5sb2dTZXJ2aWNlLCBvcHRpb25zLnJlbW90ZVNvY2tldEZhY3RvcnlTZXJ2aWNlLCBvcHRpb25zLmNvbm5lY3RUbywgUmVtb3RlQXV0aG9yaXRpZXMuZ2V0U2VydmVyUm9vdFBhdGgoKSwgYHJlY29ubmVjdGlvblRva2VuPSR7b3B0aW9ucy5yZWNvbm5lY3Rpb25Ub2tlbn0mcmVjb25uZWN0aW9uPSR7b3B0aW9ucy5yZWNvbm5lY3Rpb25Qcm90b2NvbCA/ICd0cnVlJyA6ICdmYWxzZSd9YCwgY29ubmVjdGlvblR5cGVUb1N0cmluZyhjb25uZWN0aW9uVHlwZSksIGByZW5kZXJlci0ke2Nvbm5lY3Rpb25UeXBlVG9TdHJpbmcoY29ubmVjdGlvblR5cGUpfS0ke29wdGlvbnMucmVjb25uZWN0aW9uVG9rZW59YCwgdGltZW91dENhbmNlbGxhdGlvblRva2VuKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRvcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoYCR7bG9nUHJlZml4fSBzb2NrZXRGYWN0b3J5LmNvbm5lY3QoKSBmYWlsZWQgb3IgdGltZWQgb3V0LiBFcnJvcjpgKTtcblx0XHRvcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdHRocm93IGVycm9yO1xuXHR9XG5cblx0b3B0aW9ucy5sb2dTZXJ2aWNlLnRyYWNlKGAke2xvZ1ByZWZpeH0gMi82LiBzb2NrZXRGYWN0b3J5LmNvbm5lY3QoKSB3YXMgc3VjY2Vzc2Z1bC5gKTtcblxuXHRsZXQgcHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbDtcblx0bGV0IG93bnNQcm90b2NvbDogYm9vbGVhbjtcblx0aWYgKG9wdGlvbnMucmVjb25uZWN0aW9uUHJvdG9jb2wpIHtcblx0XHRvcHRpb25zLnJlY29ubmVjdGlvblByb3RvY29sLmJlZ2luQWNjZXB0UmVjb25uZWN0aW9uKHNvY2tldCwgbnVsbCk7XG5cdFx0cHJvdG9jb2wgPSBvcHRpb25zLnJlY29ubmVjdGlvblByb3RvY29sO1xuXHRcdG93bnNQcm90b2NvbCA9IGZhbHNlO1xuXHR9IGVsc2Uge1xuXHRcdHByb3RvY29sID0gbmV3IFBlcnNpc3RlbnRQcm90b2NvbCh7IHNvY2tldCB9KTtcblx0XHRvd25zUHJvdG9jb2wgPSB0cnVlO1xuXHR9XG5cblx0b3B0aW9ucy5sb2dTZXJ2aWNlLnRyYWNlKGAke2xvZ1ByZWZpeH0gMy82LiBzZW5kaW5nIEF1dGhSZXF1ZXN0IGNvbnRyb2wgbWVzc2FnZS5gKTtcblx0Y29uc3QgbWVzc2FnZSA9IGF3YWl0IHJhY2VXaXRoVGltZW91dENhbmNlbGxhdGlvbihvcHRpb25zLnNpZ25TZXJ2aWNlLmNyZWF0ZU5ld01lc3NhZ2UoZ2VuZXJhdGVVdWlkKCkpLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXG5cdGNvbnN0IGF1dGhSZXF1ZXN0OiBBdXRoUmVxdWVzdCA9IHtcblx0XHR0eXBlOiAnYXV0aCcsXG5cdFx0YXV0aDogb3B0aW9ucy5jb25uZWN0aW9uVG9rZW4gfHwgJzAwMDAwMDAwMDAwMDAwMDAwMDAwJyxcblx0XHRkYXRhOiBtZXNzYWdlLmRhdGFcblx0fTtcblx0cHJvdG9jb2wuc2VuZENvbnRyb2woVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShhdXRoUmVxdWVzdCkpKTtcblxuXHR0cnkge1xuXHRcdGNvbnN0IG1zZyA9IGF3YWl0IHJlYWRPbmVDb250cm9sTWVzc2FnZTxIYW5kc2hha2VNZXNzYWdlPihwcm90b2NvbCwgY29tYmluZVRpbWVvdXRDYW5jZWxsYXRpb24odGltZW91dENhbmNlbGxhdGlvblRva2VuLCBjcmVhdGVUaW1lb3V0Q2FuY2VsbGF0aW9uKDEwMDAwKSkpO1xuXG5cdFx0aWYgKG1zZy50eXBlICE9PSAnc2lnbicgfHwgdHlwZW9mIG1zZy5kYXRhICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgZXJyb3I6IGFueSA9IG5ldyBFcnJvcignVW5leHBlY3RlZCBoYW5kc2hha2UgbWVzc2FnZScpO1xuXHRcdFx0ZXJyb3IuY29kZSA9ICdWU0NPREVfQ09OTkVDVElPTl9FUlJPUic7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHRvcHRpb25zLmxvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSA0LzYuIHJlY2VpdmVkIFNpZ25SZXF1ZXN0IGNvbnRyb2wgbWVzc2FnZS5gKTtcblxuXHRcdGNvbnN0IGlzVmFsaWQgPSBhd2FpdCByYWNlV2l0aFRpbWVvdXRDYW5jZWxsYXRpb24ob3B0aW9ucy5zaWduU2VydmljZS52YWxpZGF0ZShtZXNzYWdlLCBtc2cuc2lnbmVkRGF0YSksIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0aWYgKCFpc1ZhbGlkKSB7XG5cdFx0XHRjb25zdCBlcnJvcjogYW55ID0gbmV3IEVycm9yKCdSZWZ1c2VkIHRvIGNvbm5lY3QgdG8gdW5zdXBwb3J0ZWQgc2VydmVyJyk7XG5cdFx0XHRlcnJvci5jb2RlID0gJ1ZTQ09ERV9DT05ORUNUSU9OX0VSUk9SJztcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpZ25lZCA9IGF3YWl0IHJhY2VXaXRoVGltZW91dENhbmNlbGxhdGlvbihvcHRpb25zLnNpZ25TZXJ2aWNlLnNpZ24obXNnLmRhdGEpLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdGNvbnN0IGNvbm5UeXBlUmVxdWVzdDogQ29ubmVjdGlvblR5cGVSZXF1ZXN0ID0ge1xuXHRcdFx0dHlwZTogJ2Nvbm5lY3Rpb25UeXBlJyxcblx0XHRcdGNvbW1pdDogb3B0aW9ucy5jb21taXQsXG5cdFx0XHRzaWduZWREYXRhOiBzaWduZWQsXG5cdFx0XHRkZXNpcmVkQ29ubmVjdGlvblR5cGU6IGNvbm5lY3Rpb25UeXBlXG5cdFx0fTtcblx0XHRpZiAoYXJncykge1xuXHRcdFx0Y29ublR5cGVSZXF1ZXN0LmFyZ3MgPSBhcmdzO1xuXHRcdH1cblxuXHRcdG9wdGlvbnMubG9nU2VydmljZS50cmFjZShgJHtsb2dQcmVmaXh9IDUvNi4gc2VuZGluZyBDb25uZWN0aW9uVHlwZVJlcXVlc3QgY29udHJvbCBtZXNzYWdlLmApO1xuXHRcdHByb3RvY29sLnNlbmRDb250cm9sKFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoY29ublR5cGVSZXF1ZXN0KSkpO1xuXG5cdFx0cmV0dXJuIHsgcHJvdG9jb2wsIG93bnNQcm90b2NvbCB9O1xuXG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0aWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09ICdFVElNRURPVVQnKSB7XG5cdFx0XHRvcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoYCR7bG9nUHJlZml4fSB0aGUgaGFuZHNoYWtlIHRpbWVkIG91dC4gRXJyb3I6YCk7XG5cdFx0XHRvcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0XHRpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gJ1ZTQ09ERV9DT05ORUNUSU9OX0VSUk9SJykge1xuXHRcdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gcmVjZWl2ZWQgZXJyb3IgY29udHJvbCBtZXNzYWdlIHdoZW4gbmVnb3RpYXRpbmcgY29ubmVjdGlvbi4gRXJyb3I6YCk7XG5cdFx0XHRvcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0XHRpZiAob3duc1Byb3RvY29sKSB7XG5cdFx0XHRzYWZlRGlzcG9zZVByb3RvY29sQW5kU29ja2V0KHByb3RvY29sKTtcblx0XHR9XG5cdFx0dGhyb3cgZXJyb3I7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNYW5hZ2VtZW50Q29ubmVjdGlvblJlc3VsdCB7XG5cdHByb3RvY29sOiBQZXJzaXN0ZW50UHJvdG9jb2w7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNvbm5lY3RUb1JlbW90ZUV4dGVuc2lvbkhvc3RBZ2VudEFuZFJlYWRPbmVNZXNzYWdlPFQ+KG9wdGlvbnM6IElTaW1wbGVDb25uZWN0aW9uT3B0aW9ucywgY29ubmVjdGlvblR5cGU6IENvbm5lY3Rpb25UeXBlLCBhcmdzOiBhbnkgfCB1bmRlZmluZWQsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgcHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbDsgZmlyc3RNZXNzYWdlOiBUIH0+IHtcblx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0Y29uc3QgbG9nUHJlZml4ID0gY29ubmVjdExvZ1ByZWZpeChvcHRpb25zLCBjb25uZWN0aW9uVHlwZSk7XG5cdGNvbnN0IHsgcHJvdG9jb2wsIG93bnNQcm90b2NvbCB9ID0gYXdhaXQgY29ubmVjdFRvUmVtb3RlRXh0ZW5zaW9uSG9zdEFnZW50KG9wdGlvbnMsIGNvbm5lY3Rpb25UeXBlLCBhcmdzLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbWlzZVdpdGhUaW1lb3V0PHsgcHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbDsgZmlyc3RNZXNzYWdlOiBUIH0+KHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cdHJlc3VsdC5yZWdpc3RlckRpc3Bvc2FibGUocHJvdG9jb2wub25Db250cm9sTWVzc2FnZShyYXcgPT4ge1xuXHRcdGNvbnN0IG1zZzogVCA9IEpTT04ucGFyc2UocmF3LnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGVycm9yID0gZ2V0RXJyb3JGcm9tTWVzc2FnZShtc2cpO1xuXHRcdGlmIChlcnJvcikge1xuXHRcdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gcmVjZWl2ZWQgZXJyb3IgY29udHJvbCBtZXNzYWdlIHdoZW4gbmVnb3RpYXRpbmcgY29ubmVjdGlvbi4gRXJyb3I6YCk7XG5cdFx0XHRvcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0aWYgKG93bnNQcm90b2NvbCkge1xuXHRcdFx0XHRzYWZlRGlzcG9zZVByb3RvY29sQW5kU29ja2V0KHByb3RvY29sKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5yZWplY3QoZXJyb3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvcHRpb25zLnJlY29ubmVjdGlvblByb3RvY29sPy5lbmRBY2NlcHRSZWNvbm5lY3Rpb24oKTtcblx0XHRcdG9wdGlvbnMubG9nU2VydmljZS50cmFjZShgJHtsb2dQcmVmaXh9IDYvNi4gaGFuZHNoYWtlIGZpbmlzaGVkLCBjb25uZWN0aW9uIGlzIHVwIGFuZCBydW5uaW5nIGFmdGVyICR7bG9nRWxhcHNlZChzdGFydFRpbWUpfSFgKTtcblx0XHRcdHJlc3VsdC5yZXNvbHZlKHsgcHJvdG9jb2wsIGZpcnN0TWVzc2FnZTogbXNnIH0pO1xuXHRcdH1cblx0fSkpO1xuXHRyZXR1cm4gcmVzdWx0LnByb21pc2U7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRvQ29ubmVjdFJlbW90ZUFnZW50TWFuYWdlbWVudChvcHRpb25zOiBJU2ltcGxlQ29ubmVjdGlvbk9wdGlvbnMsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNYW5hZ2VtZW50Q29ubmVjdGlvblJlc3VsdD4ge1xuXHRjb25zdCB7IHByb3RvY29sIH0gPSBhd2FpdCBjb25uZWN0VG9SZW1vdGVFeHRlbnNpb25Ib3N0QWdlbnRBbmRSZWFkT25lTWVzc2FnZShvcHRpb25zLCBDb25uZWN0aW9uVHlwZS5NYW5hZ2VtZW50LCB1bmRlZmluZWQsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cdHJldHVybiB7IHByb3RvY29sIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbW90ZUV4dGVuc2lvbkhvc3RTdGFydFBhcmFtcyB7XG5cdGxhbmd1YWdlOiBzdHJpbmc7XG5cdGRlYnVnSWQ/OiBzdHJpbmc7XG5cdGJyZWFrPzogYm9vbGVhbjtcblx0cG9ydD86IG51bWJlciB8IG51bGw7XG5cdGVudj86IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgbnVsbCB9O1xufVxuXG5pbnRlcmZhY2UgSUV4dGVuc2lvbkhvc3RDb25uZWN0aW9uUmVzdWx0IHtcblx0cHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbDtcblx0ZGVidWdQb3J0PzogbnVtYmVyO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkb0Nvbm5lY3RSZW1vdGVBZ2VudEV4dGVuc2lvbkhvc3Qob3B0aW9uczogSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zLCBzdGFydEFyZ3VtZW50czogSVJlbW90ZUV4dGVuc2lvbkhvc3RTdGFydFBhcmFtcywgdGltZW91dENhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUV4dGVuc2lvbkhvc3RDb25uZWN0aW9uUmVzdWx0PiB7XG5cdGNvbnN0IHsgcHJvdG9jb2wsIGZpcnN0TWVzc2FnZSB9ID0gYXdhaXQgY29ubmVjdFRvUmVtb3RlRXh0ZW5zaW9uSG9zdEFnZW50QW5kUmVhZE9uZU1lc3NhZ2U8eyBkZWJ1Z1BvcnQ/OiBudW1iZXIgfT4ob3B0aW9ucywgQ29ubmVjdGlvblR5cGUuRXh0ZW5zaW9uSG9zdCwgc3RhcnRBcmd1bWVudHMsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cdGNvbnN0IGRlYnVnUG9ydCA9IGZpcnN0TWVzc2FnZSAmJiBmaXJzdE1lc3NhZ2UuZGVidWdQb3J0O1xuXHRyZXR1cm4geyBwcm90b2NvbCwgZGVidWdQb3J0IH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVR1bm5lbENvbm5lY3Rpb25TdGFydFBhcmFtcyB7XG5cdGhvc3Q6IHN0cmluZztcblx0cG9ydDogbnVtYmVyO1xufVxuXG5hc3luYyBmdW5jdGlvbiBkb0Nvbm5lY3RSZW1vdGVBZ2VudFR1bm5lbChvcHRpb25zOiBJU2ltcGxlQ29ubmVjdGlvbk9wdGlvbnMsIHN0YXJ0UGFyYW1zOiBJVHVubmVsQ29ubmVjdGlvblN0YXJ0UGFyYW1zLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxQZXJzaXN0ZW50UHJvdG9jb2w+IHtcblx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0Y29uc3QgbG9nUHJlZml4ID0gY29ubmVjdExvZ1ByZWZpeChvcHRpb25zLCBDb25uZWN0aW9uVHlwZS5UdW5uZWwpO1xuXHRjb25zdCB7IHByb3RvY29sIH0gPSBhd2FpdCBjb25uZWN0VG9SZW1vdGVFeHRlbnNpb25Ib3N0QWdlbnRBbmRSZWFkT25lTWVzc2FnZShvcHRpb25zLCBDb25uZWN0aW9uVHlwZS5UdW5uZWwsIHN0YXJ0UGFyYW1zLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRvcHRpb25zLmxvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSA2LzYuIGhhbmRzaGFrZSBmaW5pc2hlZCwgY29ubmVjdGlvbiBpcyB1cCBhbmQgcnVubmluZyBhZnRlciAke2xvZ0VsYXBzZWQoc3RhcnRUaW1lKX0hYCk7XG5cdHJldHVybiBwcm90b2NvbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29ubmVjdGlvbk9wdGlvbnM8VCBleHRlbmRzIFJlbW90ZUNvbm5lY3Rpb24gPSBSZW1vdGVDb25uZWN0aW9uPiB7XG5cdGNvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRxdWFsaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGFkZHJlc3NQcm92aWRlcjogSUFkZHJlc3NQcm92aWRlcjxUPjtcblx0cmVtb3RlU29ja2V0RmFjdG9yeVNlcnZpY2U6IElSZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZTtcblx0c2lnblNlcnZpY2U6IElTaWduU2VydmljZTtcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cdGlwY0xvZ2dlcjogSUlQQ0xvZ2dlciB8IG51bGw7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVDb25uZWN0aW9uT3B0aW9uczxUIGV4dGVuZHMgUmVtb3RlQ29ubmVjdGlvbj4ob3B0aW9uczogSUNvbm5lY3Rpb25PcHRpb25zPFQ+LCByZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLCByZWNvbm5lY3Rpb25Qcm90b2NvbDogUGVyc2lzdGVudFByb3RvY29sIHwgbnVsbCk6IFByb21pc2U8SVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zPFQ+PiB7XG5cdGNvbnN0IHsgY29ubmVjdFRvLCBjb25uZWN0aW9uVG9rZW4gfSA9IGF3YWl0IG9wdGlvbnMuYWRkcmVzc1Byb3ZpZGVyLmdldEFkZHJlc3MoKTtcblx0cmV0dXJuIHtcblx0XHRjb21taXQ6IG9wdGlvbnMuY29tbWl0LFxuXHRcdHF1YWxpdHk6IG9wdGlvbnMucXVhbGl0eSxcblx0XHRjb25uZWN0VG8sXG5cdFx0Y29ubmVjdGlvblRva2VuOiBjb25uZWN0aW9uVG9rZW4sXG5cdFx0cmVjb25uZWN0aW9uVG9rZW46IHJlY29ubmVjdGlvblRva2VuLFxuXHRcdHJlY29ubmVjdGlvblByb3RvY29sOiByZWNvbm5lY3Rpb25Qcm90b2NvbCxcblx0XHRyZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZTogb3B0aW9ucy5yZW1vdGVTb2NrZXRGYWN0b3J5U2VydmljZSxcblx0XHRzaWduU2VydmljZTogb3B0aW9ucy5zaWduU2VydmljZSxcblx0XHRsb2dTZXJ2aWNlOiBvcHRpb25zLmxvZ1NlcnZpY2Vcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWRkcmVzczxUIGV4dGVuZHMgUmVtb3RlQ29ubmVjdGlvbiA9IFJlbW90ZUNvbm5lY3Rpb24+IHtcblx0Y29ubmVjdFRvOiBUO1xuXHRjb25uZWN0aW9uVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWRkcmVzc1Byb3ZpZGVyPFQgZXh0ZW5kcyBSZW1vdGVDb25uZWN0aW9uID0gUmVtb3RlQ29ubmVjdGlvbj4ge1xuXHRnZXRBZGRyZXNzKCk6IFByb21pc2U8SUFkZHJlc3M8VD4+O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29ubmVjdFJlbW90ZUFnZW50TWFuYWdlbWVudChvcHRpb25zOiBJQ29ubmVjdGlvbk9wdGlvbnMsIHJlbW90ZUF1dGhvcml0eTogc3RyaW5nLCBjbGllbnRJZDogc3RyaW5nKTogUHJvbWlzZTxNYW5hZ2VtZW50UGVyc2lzdGVudENvbm5lY3Rpb24+IHtcblx0cmV0dXJuIGNyZWF0ZUluaXRpYWxDb25uZWN0aW9uKFxuXHRcdG9wdGlvbnMsXG5cdFx0YXN5bmMgKHNpbXBsZU9wdGlvbnMpID0+IHtcblx0XHRcdGNvbnN0IHsgcHJvdG9jb2wgfSA9IGF3YWl0IGRvQ29ubmVjdFJlbW90ZUFnZW50TWFuYWdlbWVudChzaW1wbGVPcHRpb25zLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdHJldHVybiBuZXcgTWFuYWdlbWVudFBlcnNpc3RlbnRDb25uZWN0aW9uKG9wdGlvbnMsIHJlbW90ZUF1dGhvcml0eSwgY2xpZW50SWQsIHNpbXBsZU9wdGlvbnMucmVjb25uZWN0aW9uVG9rZW4sIHByb3RvY29sKTtcblx0XHR9XG5cdCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25uZWN0UmVtb3RlQWdlbnRFeHRlbnNpb25Ib3N0KG9wdGlvbnM6IElDb25uZWN0aW9uT3B0aW9ucywgc3RhcnRBcmd1bWVudHM6IElSZW1vdGVFeHRlbnNpb25Ib3N0U3RhcnRQYXJhbXMpOiBQcm9taXNlPEV4dGVuc2lvbkhvc3RQZXJzaXN0ZW50Q29ubmVjdGlvbj4ge1xuXHRyZXR1cm4gY3JlYXRlSW5pdGlhbENvbm5lY3Rpb24oXG5cdFx0b3B0aW9ucyxcblx0XHRhc3luYyAoc2ltcGxlT3B0aW9ucykgPT4ge1xuXHRcdFx0Y29uc3QgeyBwcm90b2NvbCwgZGVidWdQb3J0IH0gPSBhd2FpdCBkb0Nvbm5lY3RSZW1vdGVBZ2VudEV4dGVuc2lvbkhvc3Qoc2ltcGxlT3B0aW9ucywgc3RhcnRBcmd1bWVudHMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0cmV0dXJuIG5ldyBFeHRlbnNpb25Ib3N0UGVyc2lzdGVudENvbm5lY3Rpb24ob3B0aW9ucywgc3RhcnRBcmd1bWVudHMsIHNpbXBsZU9wdGlvbnMucmVjb25uZWN0aW9uVG9rZW4sIHByb3RvY29sLCBkZWJ1Z1BvcnQpO1xuXHRcdH1cblx0KTtcbn1cblxuLyoqXG4gKiBXaWxsIGF0dGVtcHQgdG8gY29ubmVjdCA1IHRpbWVzLiBJZiBpdCBmYWlscyA1IGNvbnNlY3V0aXZlIHRpbWVzLCBpdCB3aWxsIGdpdmUgdXAuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUluaXRpYWxDb25uZWN0aW9uPFQgZXh0ZW5kcyBQZXJzaXN0ZW50Q29ubmVjdGlvbiwgTyBleHRlbmRzIFJlbW90ZUNvbm5lY3Rpb24+KG9wdGlvbnM6IElDb25uZWN0aW9uT3B0aW9uczxPPiwgY29ubmVjdGlvbkZhY3Rvcnk6IChzaW1wbGVPcHRpb25zOiBJU2ltcGxlQ29ubmVjdGlvbk9wdGlvbnM8Tz4pID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0Y29uc3QgTUFYX0FUVEVNUFRTID0gNTtcblxuXHRmb3IgKGxldCBhdHRlbXB0ID0gMTsgOyBhdHRlbXB0KyspIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVjb25uZWN0aW9uVG9rZW4gPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdGNvbnN0IHNpbXBsZU9wdGlvbnMgPSBhd2FpdCByZXNvbHZlQ29ubmVjdGlvbk9wdGlvbnMob3B0aW9ucywgcmVjb25uZWN0aW9uVG9rZW4sIG51bGwpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbkZhY3Rvcnkoc2ltcGxlT3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGF0dGVtcHQgPCBNQVhfQVRURU1QVFMpIHtcblx0XHRcdFx0b3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGBbcmVtb3RlLWNvbm5lY3Rpb25dW2F0dGVtcHQgJHthdHRlbXB0fV0gQW4gZXJyb3Igb2NjdXJyZWQgaW4gaW5pdGlhbCBjb25uZWN0aW9uISBXaWxsIHJldHJ5Li4uIEVycm9yOmApO1xuXHRcdFx0XHRvcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9wdGlvbnMubG9nU2VydmljZS5lcnJvcihgW3JlbW90ZS1jb25uZWN0aW9uXVthdHRlbXB0ICR7YXR0ZW1wdH1dICBBbiBlcnJvciBvY2N1cnJlZCBpbiBpbml0aWFsIGNvbm5lY3Rpb24hIEl0IHdpbGwgYmUgdHJlYXRlZCBhcyBhIHBlcm1hbmVudCBlcnJvci4gRXJyb3I6YCk7XG5cdFx0XHRcdG9wdGlvbnMubG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRQZXJzaXN0ZW50Q29ubmVjdGlvbi50cmlnZ2VyUGVybWFuZW50RmFpbHVyZSgwLCAwLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLmlzSGFuZGxlZChlcnIpKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29ubmVjdFJlbW90ZUFnZW50VHVubmVsKG9wdGlvbnM6IElDb25uZWN0aW9uT3B0aW9ucywgdHVubmVsUmVtb3RlSG9zdDogc3RyaW5nLCB0dW5uZWxSZW1vdGVQb3J0OiBudW1iZXIpOiBQcm9taXNlPFBlcnNpc3RlbnRQcm90b2NvbD4ge1xuXHRjb25zdCBzaW1wbGVPcHRpb25zID0gYXdhaXQgcmVzb2x2ZUNvbm5lY3Rpb25PcHRpb25zKG9wdGlvbnMsIGdlbmVyYXRlVXVpZCgpLCBudWxsKTtcblx0Y29uc3QgcHJvdG9jb2wgPSBhd2FpdCBkb0Nvbm5lY3RSZW1vdGVBZ2VudFR1bm5lbChzaW1wbGVPcHRpb25zLCB7IGhvc3Q6IHR1bm5lbFJlbW90ZUhvc3QsIHBvcnQ6IHR1bm5lbFJlbW90ZVBvcnQgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdHJldHVybiBwcm90b2NvbDtcbn1cblxuZnVuY3Rpb24gc2xlZXAoc2Vjb25kczogbnVtYmVyKTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dChyZXNvbHZlLCBzZWNvbmRzICogMTAwMCk7XG5cdFx0XHR0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZSB7XG5cdENvbm5lY3Rpb25Mb3N0LFxuXHRSZWNvbm5lY3Rpb25XYWl0LFxuXHRSZWNvbm5lY3Rpb25SdW5uaW5nLFxuXHRSZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlLFxuXHRDb25uZWN0aW9uR2FpblxufVxuZXhwb3J0IGNsYXNzIENvbm5lY3Rpb25Mb3N0RXZlbnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLkNvbm5lY3Rpb25Mb3N0O1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXJcblx0KSB7IH1cbn1cbmV4cG9ydCBjbGFzcyBSZWNvbm5lY3Rpb25XYWl0RXZlbnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLlJlY29ubmVjdGlvbldhaXQ7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZHVyYXRpb25TZWNvbmRzOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjYW5jZWxsYWJsZVRpbWVyOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPlxuXHQpIHsgfVxuXG5cdHB1YmxpYyBza2lwV2FpdCgpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbGxhYmxlVGltZXIuY2FuY2VsKCk7XG5cdH1cbn1cbmV4cG9ydCBjbGFzcyBSZWNvbm5lY3Rpb25SdW5uaW5nRXZlbnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLlJlY29ubmVjdGlvblJ1bm5pbmc7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgYXR0ZW1wdDogbnVtYmVyXG5cdCkgeyB9XG59XG5leHBvcnQgY2xhc3MgQ29ubmVjdGlvbkdhaW5FdmVudCB7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuQ29ubmVjdGlvbkdhaW47XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgYXR0ZW1wdDogbnVtYmVyXG5cdCkgeyB9XG59XG5leHBvcnQgY2xhc3MgUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZUV2ZW50IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5SZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGF0dGVtcHQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgaGFuZGxlZDogYm9vbGVhblxuXHQpIHsgfVxufVxuZXhwb3J0IHR5cGUgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudCA9IENvbm5lY3Rpb25HYWluRXZlbnQgfCBDb25uZWN0aW9uTG9zdEV2ZW50IHwgUmVjb25uZWN0aW9uV2FpdEV2ZW50IHwgUmVjb25uZWN0aW9uUnVubmluZ0V2ZW50IHwgUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZUV2ZW50O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgUGVyc2lzdGVudENvbm5lY3Rpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwdWJsaWMgc3RhdGljIHRyaWdnZXJQZXJtYW5lbnRGYWlsdXJlKG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogbnVtYmVyLCBhdHRlbXB0OiBudW1iZXIsIGhhbmRsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9wZXJtYW5lbnRGYWlsdXJlID0gdHJ1ZTtcblx0XHR0aGlzLl9wZXJtYW5lbnRGYWlsdXJlTWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhID0gbWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhO1xuXHRcdHRoaXMuX3Blcm1hbmVudEZhaWx1cmVBdHRlbXB0ID0gYXR0ZW1wdDtcblx0XHR0aGlzLl9wZXJtYW5lbnRGYWlsdXJlSGFuZGxlZCA9IGhhbmRsZWQ7XG5cdFx0dGhpcy5faW5zdGFuY2VzLmZvckVhY2goaW5zdGFuY2UgPT4gaW5zdGFuY2UuX2dvdG9QZXJtYW5lbnRGYWlsdXJlKHRoaXMuX3Blcm1hbmVudEZhaWx1cmVNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEsIHRoaXMuX3Blcm1hbmVudEZhaWx1cmVBdHRlbXB0LCB0aGlzLl9wZXJtYW5lbnRGYWlsdXJlSGFuZGxlZCkpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZWJ1Z1RyaWdnZXJSZWNvbm5lY3Rpb24oKSB7XG5cdFx0dGhpcy5faW5zdGFuY2VzLmZvckVhY2goaW5zdGFuY2UgPT4gaW5zdGFuY2UuX2JlZ2luUmVjb25uZWN0aW5nKCkpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZWJ1Z1BhdXNlU29ja2V0V3JpdGluZygpIHtcblx0XHR0aGlzLl9pbnN0YW5jZXMuZm9yRWFjaChpbnN0YW5jZSA9PiBpbnN0YW5jZS5fcGF1c2VTb2NrZXRXcml0aW5nKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Blcm1hbmVudEZhaWx1cmU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzdGF0aWMgX3Blcm1hbmVudEZhaWx1cmVNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgc3RhdGljIF9wZXJtYW5lbnRGYWlsdXJlQXR0ZW1wdDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBzdGF0aWMgX3Blcm1hbmVudEZhaWx1cmVIYW5kbGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgc3RhdGljIF9pbnN0YW5jZXM6IFBlcnNpc3RlbnRDb25uZWN0aW9uW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN0YXRlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UGVyc2lzdGVudENvbm5lY3Rpb25FdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFN0YXRlQ2hhbmdlID0gdGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9wZXJtYW5lbnRGYWlsdXJlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgZ2V0IF9pc1Blcm1hbmVudEZhaWx1cmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Blcm1hbmVudEZhaWx1cmUgfHwgUGVyc2lzdGVudENvbm5lY3Rpb24uX3Blcm1hbmVudEZhaWx1cmU7XG5cdH1cblxuXHRwcml2YXRlIF9pc1JlY29ubmVjdGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3JlY29ubmVjdGlvbkdyYWNlVGltZTogbnVtYmVyID0gUHJvdG9jb2xDb25zdGFudHMuUmVjb25uZWN0aW9uR3JhY2VUaW1lO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25UeXBlOiBDb25uZWN0aW9uVHlwZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29wdGlvbnM6IElDb25uZWN0aW9uT3B0aW9ucyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWNvbm5lY3Rpb25GYWlsdXJlSXNGYXRhbDogYm9vbGVhblxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cblx0XHR0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlLmZpcmUobmV3IENvbm5lY3Rpb25HYWluRXZlbnQodGhpcy5yZWNvbm5lY3Rpb25Ub2tlbiwgMCwgMCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocHJvdG9jb2wub25Tb2NrZXRDbG9zZSgoZSkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nUHJlZml4ID0gY29tbW9uTG9nUHJlZml4KHRoaXMuX2Nvbm5lY3Rpb25UeXBlLCB0aGlzLnJlY29ubmVjdGlvblRva2VuLCB0cnVlKTtcblx0XHRcdGlmICghZSkge1xuXHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuaW5mbyhgJHtsb2dQcmVmaXh9IHJlY2VpdmVkIHNvY2tldCBjbG9zZSBldmVudC5gKTtcblx0XHRcdH0gZWxzZSBpZiAoZS50eXBlID09PSBTb2NrZXRDbG9zZUV2ZW50VHlwZS5Ob2RlU29ja2V0Q2xvc2VFdmVudCkge1xuXHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuaW5mbyhgJHtsb2dQcmVmaXh9IHJlY2VpdmVkIHNvY2tldCBjbG9zZSBldmVudCAoaGFkRXJyb3I6ICR7ZS5oYWRFcnJvcn0pLmApO1xuXHRcdFx0XHRpZiAoZS5lcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5lcnJvcihlLmVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSByZWNlaXZlZCBzb2NrZXQgY2xvc2UgZXZlbnQgKHdhc0NsZWFuOiAke2Uud2FzQ2xlYW59LCBjb2RlOiAke2UuY29kZX0sIHJlYXNvbjogJHtlLnJlYXNvbn0pLmApO1xuXHRcdFx0XHRpZiAoZS5ldmVudCkge1xuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5lcnJvcihlLmV2ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYmVnaW5SZWNvbm5lY3RpbmcoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocHJvdG9jb2wub25Tb2NrZXRUaW1lb3V0KChlKSA9PiB7XG5cdFx0XHRjb25zdCBsb2dQcmVmaXggPSBjb21tb25Mb2dQcmVmaXgodGhpcy5fY29ubmVjdGlvblR5cGUsIHRoaXMucmVjb25uZWN0aW9uVG9rZW4sIHRydWUpO1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSByZWNlaXZlZCBzb2NrZXQgdGltZW91dCBldmVudCAocmVhc29uOiAke2UucmVhc29ufSwgdW5hY2tub3dsZWRnZWRNc2dDb3VudDogJHtlLnVuYWNrbm93bGVkZ2VkTXNnQ291bnR9LCB0aW1lU2luY2VPbGRlc3RVbmFja25vd2xlZGdlZE1zZzogJHtlLnRpbWVTaW5jZU9sZGVzdFVuYWNrbm93bGVkZ2VkTXNnfSwgdGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGE6ICR7ZS50aW1lU2luY2VMYXN0UmVjZWl2ZWRTb21lRGF0YX0pLmApO1xuXHRcdFx0dGhpcy5fYmVnaW5SZWNvbm5lY3RpbmcoKTtcblx0XHR9KSk7XG5cblx0XHRQZXJzaXN0ZW50Q29ubmVjdGlvbi5faW5zdGFuY2VzLnB1c2godGhpcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IG15SW5kZXggPSBQZXJzaXN0ZW50Q29ubmVjdGlvbi5faW5zdGFuY2VzLmluZGV4T2YodGhpcyk7XG5cdFx0XHRpZiAobXlJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFBlcnNpc3RlbnRDb25uZWN0aW9uLl9pbnN0YW5jZXMuc3BsaWNlKG15SW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLl9pc1Blcm1hbmVudEZhaWx1cmUpIHtcblx0XHRcdHRoaXMuX2dvdG9QZXJtYW5lbnRGYWlsdXJlKFBlcnNpc3RlbnRDb25uZWN0aW9uLl9wZXJtYW5lbnRGYWlsdXJlTWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhLCBQZXJzaXN0ZW50Q29ubmVjdGlvbi5fcGVybWFuZW50RmFpbHVyZUF0dGVtcHQsIFBlcnNpc3RlbnRDb25uZWN0aW9uLl9wZXJtYW5lbnRGYWlsdXJlSGFuZGxlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHVwZGF0ZUdyYWNlVGltZShncmFjZVRpbWU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHNhbml0aXplZEdyYWNlID0gc2FuaXRpemVHcmFjZVRpbWUoZ3JhY2VUaW1lLCBQcm90b2NvbENvbnN0YW50cy5SZWNvbm5lY3Rpb25HcmFjZVRpbWUpO1xuXHRcdGNvbnN0IGxvZ1ByZWZpeCA9IGNvbW1vbkxvZ1ByZWZpeCh0aGlzLl9jb25uZWN0aW9uVHlwZSwgdGhpcy5yZWNvbm5lY3Rpb25Ub2tlbiwgZmFsc2UpO1xuXHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS50cmFjZShgJHtsb2dQcmVmaXh9IEFwcGx5aW5nIHJlY29ubmVjdGlvbiBncmFjZSB0aW1lOiAke3Nhbml0aXplZEdyYWNlfW1zICgke01hdGguZmxvb3Ioc2FuaXRpemVkR3JhY2UgLyAxMDAwKX1zKWApO1xuXHRcdHRoaXMuX3JlY29ubmVjdGlvbkdyYWNlVGltZSA9IHNhbml0aXplZEdyYWNlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYmVnaW5SZWNvbm5lY3RpbmcoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gT25seSBoYXZlIG9uZSByZWNvbm5lY3Rpb24gbG9vcCBhY3RpdmUgYXQgYSB0aW1lLlxuXHRcdGlmICh0aGlzLl9pc1JlY29ubmVjdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5faXNSZWNvbm5lY3RpbmcgPSB0cnVlO1xuXHRcdFx0YXdhaXQgdGhpcy5fcnVuUmVjb25uZWN0aW5nTG9vcCgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc1JlY29ubmVjdGluZyA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1blJlY29ubmVjdGluZ0xvb3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lzUGVybWFuZW50RmFpbHVyZSB8fCB0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHQvLyBubyBtb3JlIGF0dGVtcHRzIVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsb2dQcmVmaXggPSBjb21tb25Mb2dQcmVmaXgodGhpcy5fY29ubmVjdGlvblR5cGUsIHRoaXMucmVjb25uZWN0aW9uVG9rZW4sIHRydWUpO1xuXHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5pbmZvKGAke2xvZ1ByZWZpeH0gc3RhcnRpbmcgcmVjb25uZWN0aW5nIGxvb3AuIFlvdSBjYW4gZ2V0IG1vcmUgaW5mb3JtYXRpb24gd2l0aCB0aGUgdHJhY2UgbG9nIGxldmVsLmApO1xuXHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZmlyZShuZXcgQ29ubmVjdGlvbkxvc3RFdmVudCh0aGlzLnJlY29ubmVjdGlvblRva2VuLCB0aGlzLnByb3RvY29sLmdldE1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSgpKSk7XG5cdFx0Y29uc3QgVElNRVMgPSBbMCwgNSwgNSwgMTAsIDEwLCAxMCwgMTAsIDEwLCAzMF07XG5cdFx0Y29uc3QgZ3JhY2VUaW1lID0gdGhpcy5fcmVjb25uZWN0aW9uR3JhY2VUaW1lO1xuXHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5pbmZvKGAke2xvZ1ByZWZpeH0gc3RhcnRpbmcgcmVjb25uZWN0aW9uIHdpdGggZ3JhY2UgdGltZTogJHtncmFjZVRpbWV9bXMgKCR7TWF0aC5mbG9vcihncmFjZVRpbWUgLyAxMDAwKX1zKWApO1xuXHRcdGlmIChncmFjZVRpbWUgPD0gMCkge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gcmVjb25uZWN0aW9uIGdyYWNlIHRpbWUgaXMgc2V0IHRvIDBtcywgd2lsbCBub3QgYXR0ZW1wdCB0byByZWNvbm5lY3QuYCk7XG5cdFx0XHR0aGlzLl9vblJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmUodGhpcy5wcm90b2NvbC5nZXRNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEoKSwgMCwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsb29wU3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRsZXQgYXR0ZW1wdCA9IC0xO1xuXHRcdGRvIHtcblx0XHRcdGF0dGVtcHQrKztcblx0XHRcdGNvbnN0IHdhaXRUaW1lID0gKGF0dGVtcHQgPCBUSU1FUy5sZW5ndGggPyBUSU1FU1thdHRlbXB0XSA6IFRJTUVTW1RJTUVTLmxlbmd0aCAtIDFdKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmICh3YWl0VGltZSA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBzbGVlcFByb21pc2UgPSBzbGVlcCh3YWl0VGltZSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5maXJlKG5ldyBSZWNvbm5lY3Rpb25XYWl0RXZlbnQodGhpcy5yZWNvbm5lY3Rpb25Ub2tlbiwgdGhpcy5wcm90b2NvbC5nZXRNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEoKSwgd2FpdFRpbWUsIHNsZWVwUHJvbWlzZSkpO1xuXG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSB3YWl0aW5nIGZvciAke3dhaXRUaW1lfSBzZWNvbmRzIGJlZm9yZSByZWNvbm5lY3RpbmcuLi5gKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgc2xlZXBQcm9taXNlO1xuXHRcdFx0XHRcdH0gY2F0Y2ggeyB9IC8vIFVzZXIgY2FuY2VsZWQgdGltZXJcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl9pc1Blcm1hbmVudEZhaWx1cmUpIHtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoYCR7bG9nUHJlZml4fSBwZXJtYW5lbnQgZmFpbHVyZSBvY2N1cnJlZCB3aGlsZSBydW5uaW5nIHRoZSByZWNvbm5lY3RpbmcgbG9vcC5gKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGNvbm5lY3Rpb24gd2FzIGxvc3QsIGxldCdzIHRyeSB0byByZS1lc3RhYmxpc2ggaXRcblx0XHRcdFx0dGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5maXJlKG5ldyBSZWNvbm5lY3Rpb25SdW5uaW5nRXZlbnQodGhpcy5yZWNvbm5lY3Rpb25Ub2tlbiwgdGhpcy5wcm90b2NvbC5nZXRNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEoKSwgYXR0ZW1wdCArIDEpKTtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSByZXNvbHZpbmcgY29ubmVjdGlvbi4uLmApO1xuXHRcdFx0XHRjb25zdCBzaW1wbGVPcHRpb25zID0gYXdhaXQgcmVzb2x2ZUNvbm5lY3Rpb25PcHRpb25zKHRoaXMuX29wdGlvbnMsIHRoaXMucmVjb25uZWN0aW9uVG9rZW4sIHRoaXMucHJvdG9jb2wpO1xuXHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuaW5mbyhgJHtsb2dQcmVmaXh9IGNvbm5lY3RpbmcgdG8gJHtzaW1wbGVPcHRpb25zLmNvbm5lY3RUb30uLi5gKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVjb25uZWN0KHNpbXBsZU9wdGlvbnMsIGNyZWF0ZVRpbWVvdXRDYW5jZWxsYXRpb24oUkVDT05ORUNUX1RJTUVPVVQpKTtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmluZm8oYCR7bG9nUHJlZml4fSByZWNvbm5lY3RlZCFgKTtcblx0XHRcdFx0dGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5maXJlKG5ldyBDb25uZWN0aW9uR2FpbkV2ZW50KHRoaXMucmVjb25uZWN0aW9uVG9rZW4sIHRoaXMucHJvdG9jb2wuZ2V0TWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhKCksIGF0dGVtcHQgKyAxKSk7XG5cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0aWYgKGVyci5jb2RlID09PSAnVlNDT0RFX0NPTk5FQ1RJT05fRVJST1InKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLmVycm9yKGAke2xvZ1ByZWZpeH0gQSBwZXJtYW5lbnQgZXJyb3Igb2NjdXJyZWQgaW4gdGhlIHJlY29ubmVjdGluZyBsb29wISBXaWxsIGdpdmUgdXAgbm93ISBFcnJvcjpgKTtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHR0aGlzLl9vblJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmUodGhpcy5wcm90b2NvbC5nZXRNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEoKSwgYXR0ZW1wdCArIDEsIGZhbHNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoRGF0ZS5ub3coKSAtIGxvb3BTdGFydFRpbWUgPj0gZ3JhY2VUaW1lKSB7XG5cdFx0XHRcdFx0Y29uc3QgZ3JhY2VTZWNvbmRzID0gTWF0aC5yb3VuZChncmFjZVRpbWUgLyAxMDAwKTtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoYCR7bG9nUHJlZml4fSBBbiBlcnJvciBvY2N1cnJlZCB3aGlsZSByZWNvbm5lY3RpbmcsIGJ1dCBpdCB3aWxsIGJlIHRyZWF0ZWQgYXMgYSBwZXJtYW5lbnQgZXJyb3IgYmVjYXVzZSB0aGUgcmVjb25uZWN0aW9uIGdyYWNlIHRpbWUgKCR7Z3JhY2VTZWNvbmRzfXMpIGhhcyBleHBpcmVkISBXaWxsIGdpdmUgdXAgbm93ISBFcnJvcjpgKTtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHR0aGlzLl9vblJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmUodGhpcy5wcm90b2NvbC5nZXRNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEoKSwgYXR0ZW1wdCArIDEsIGZhbHNlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvci5pc1RlbXBvcmFyaWx5Tm90QXZhaWxhYmxlKGVycikpIHtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuaW5mbyhgJHtsb2dQcmVmaXh9IEEgdGVtcG9yYXJpbHkgbm90IGF2YWlsYWJsZSBlcnJvciBvY2N1cnJlZCB3aGlsZSB0cnlpbmcgdG8gcmVjb25uZWN0LCB3aWxsIHRyeSBhZ2Fpbi4uLmApO1xuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS50cmFjZShlcnIpO1xuXHRcdFx0XHRcdC8vIHRyeSBhZ2FpbiFcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoKGVyci5jb2RlID09PSAnRVRJTUVET1VUJyB8fCBlcnIuY29kZSA9PT0gJ0VORVRVTlJFQUNIJyB8fCBlcnIuY29kZSA9PT0gJ0VDT05OUkVGVVNFRCcgfHwgZXJyLmNvZGUgPT09ICdFQ09OTlJFU0VUJykgJiYgZXJyLnN5c2NhbGwgPT09ICdjb25uZWN0Jykge1xuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5pbmZvKGAke2xvZ1ByZWZpeH0gQSBuZXR3b3JrIGVycm9yIG9jY3VycmVkIHdoaWxlIHRyeWluZyB0byByZWNvbm5lY3QsIHdpbGwgdHJ5IGFnYWluLi4uYCk7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2dTZXJ2aWNlLnRyYWNlKGVycik7XG5cdFx0XHRcdFx0Ly8gdHJ5IGFnYWluIVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuaW5mbyhgJHtsb2dQcmVmaXh9IEEgcHJvbWlzZSBjYW5jZWxhdGlvbiBlcnJvciBvY2N1cnJlZCB3aGlsZSB0cnlpbmcgdG8gcmVjb25uZWN0LCB3aWxsIHRyeSBhZ2Fpbi4uLmApO1xuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS50cmFjZShlcnIpO1xuXHRcdFx0XHRcdC8vIHRyeSBhZ2FpbiFcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5lcnJvcihgJHtsb2dQcmVmaXh9IEEgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvciBvY2N1cnJlZCB3aGlsZSB0cnlpbmcgdG8gcmVjb25uZWN0LiBXaWxsIGdpdmUgdXAgbm93ISBFcnJvcjpgKTtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHR0aGlzLl9vblJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmUodGhpcy5wcm90b2NvbC5nZXRNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEoKSwgYXR0ZW1wdCArIDEsIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IuaXNIYW5kbGVkKGVycikpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5lcnJvcihgJHtsb2dQcmVmaXh9IEFuIHVua25vd24gZXJyb3Igb2NjdXJyZWQgd2hpbGUgdHJ5aW5nIHRvIHJlY29ubmVjdCwgc2luY2UgdGhpcyBpcyBhbiB1bmtub3duIGNhc2UsIGl0IHdpbGwgYmUgdHJlYXRlZCBhcyBhIHBlcm1hbmVudCBlcnJvciEgV2lsbCBnaXZlIHVwIG5vdyEgRXJyb3I6YCk7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMubG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHR0aGlzLl9vblJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmUodGhpcy5wcm90b2NvbC5nZXRNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEoKSwgYXR0ZW1wdCArIDEsIGZhbHNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSB3aGlsZSAoIXRoaXMuX2lzUGVybWFuZW50RmFpbHVyZSAmJiAhdGhpcy5faXNEaXNwb3NlZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmUobWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXIsIGF0dGVtcHQ6IG51bWJlciwgaGFuZGxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZWNvbm5lY3Rpb25GYWlsdXJlSXNGYXRhbCkge1xuXHRcdFx0UGVyc2lzdGVudENvbm5lY3Rpb24udHJpZ2dlclBlcm1hbmVudEZhaWx1cmUobWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhLCBhdHRlbXB0LCBoYW5kbGVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZ290b1Blcm1hbmVudEZhaWx1cmUobWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhLCBhdHRlbXB0LCBoYW5kbGVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nb3RvUGVybWFuZW50RmFpbHVyZShtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IG51bWJlciwgYXR0ZW1wdDogbnVtYmVyLCBoYW5kbGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5maXJlKG5ldyBSZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlRXZlbnQodGhpcy5yZWNvbm5lY3Rpb25Ub2tlbiwgbWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhLCBhdHRlbXB0LCBoYW5kbGVkKSk7XG5cdFx0c2FmZURpc3Bvc2VQcm90b2NvbEFuZFNvY2tldCh0aGlzLnByb3RvY29sKTtcblx0fVxuXG5cdHByaXZhdGUgX3BhdXNlU29ja2V0V3JpdGluZygpOiB2b2lkIHtcblx0XHR0aGlzLnByb3RvY29sLnBhdXNlU29ja2V0V3JpdGluZygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9yZWNvbm5lY3Qob3B0aW9uczogSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNsYXNzIE1hbmFnZW1lbnRQZXJzaXN0ZW50Q29ubmVjdGlvbiBleHRlbmRzIFBlcnNpc3RlbnRDb25uZWN0aW9uIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgY2xpZW50OiBDbGllbnQ8UmVtb3RlQWdlbnRDb25uZWN0aW9uQ29udGV4dD47XG5cblx0Y29uc3RydWN0b3Iob3B0aW9uczogSUNvbm5lY3Rpb25PcHRpb25zLCByZW1vdGVBdXRob3JpdHk6IHN0cmluZywgY2xpZW50SWQ6IHN0cmluZywgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZywgcHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbCkge1xuXHRcdHN1cGVyKENvbm5lY3Rpb25UeXBlLk1hbmFnZW1lbnQsIG9wdGlvbnMsIHJlY29ubmVjdGlvblRva2VuLCBwcm90b2NvbCwgLypyZWNvbm5lY3Rpb25GYWlsdXJlSXNGYXRhbCovdHJ1ZSk7XG5cdFx0dGhpcy5jbGllbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2xpZW50PFJlbW90ZUFnZW50Q29ubmVjdGlvbkNvbnRleHQ+KHByb3RvY29sLCB7XG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSxcblx0XHRcdGNsaWVudElkOiBjbGllbnRJZFxuXHRcdH0sIG9wdGlvbnMuaXBjTG9nZ2VyKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3JlY29ubmVjdChvcHRpb25zOiBJU2ltcGxlQ29ubmVjdGlvbk9wdGlvbnMsIHRpbWVvdXRDYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBkb0Nvbm5lY3RSZW1vdGVBZ2VudE1hbmFnZW1lbnQob3B0aW9ucywgdGltZW91dENhbmNlbGxhdGlvblRva2VuKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uSG9zdFBlcnNpc3RlbnRDb25uZWN0aW9uIGV4dGVuZHMgUGVyc2lzdGVudENvbm5lY3Rpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXJ0QXJndW1lbnRzOiBJUmVtb3RlRXh0ZW5zaW9uSG9zdFN0YXJ0UGFyYW1zO1xuXHRwdWJsaWMgcmVhZG9ubHkgZGVidWdQb3J0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9uczogSUNvbm5lY3Rpb25PcHRpb25zLCBzdGFydEFyZ3VtZW50czogSVJlbW90ZUV4dGVuc2lvbkhvc3RTdGFydFBhcmFtcywgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZywgcHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbCwgZGVidWdQb3J0OiBudW1iZXIgfCB1bmRlZmluZWQpIHtcblx0XHRzdXBlcihDb25uZWN0aW9uVHlwZS5FeHRlbnNpb25Ib3N0LCBvcHRpb25zLCByZWNvbm5lY3Rpb25Ub2tlbiwgcHJvdG9jb2wsIC8qcmVjb25uZWN0aW9uRmFpbHVyZUlzRmF0YWwqL2ZhbHNlKTtcblx0XHR0aGlzLl9zdGFydEFyZ3VtZW50cyA9IHN0YXJ0QXJndW1lbnRzO1xuXHRcdHRoaXMuZGVidWdQb3J0ID0gZGVidWdQb3J0O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9yZWNvbm5lY3Qob3B0aW9uczogSVNpbXBsZUNvbm5lY3Rpb25PcHRpb25zLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgZG9Db25uZWN0UmVtb3RlQWdlbnRFeHRlbnNpb25Ib3N0KG9wdGlvbnMsIHRoaXMuX3N0YXJ0QXJndW1lbnRzLCB0aW1lb3V0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNhZmVEaXNwb3NlUHJvdG9jb2xBbmRTb2NrZXQocHJvdG9jb2w6IFBlcnNpc3RlbnRQcm90b2NvbCk6IHZvaWQge1xuXHR0cnkge1xuXHRcdHByb3RvY29sLmFjY2VwdERpc2Nvbm5lY3QoKTtcblx0XHRjb25zdCBzb2NrZXQgPSBwcm90b2NvbC5nZXRTb2NrZXQoKTtcblx0XHRwcm90b2NvbC5kaXNwb3NlKCk7XG5cdFx0c29ja2V0LmRpc3Bvc2UoKTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRFcnJvckZyb21NZXNzYWdlKG1zZzogYW55KTogRXJyb3IgfCBudWxsIHtcblx0aWYgKG1zZyAmJiBtc2cudHlwZSA9PT0gJ2Vycm9yJykge1xuXHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBDb25uZWN0aW9uIGVycm9yOiAke21zZy5yZWFzb259YCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0KDxhbnk+ZXJyb3IpLmNvZGUgPSAnVlNDT0RFX0NPTk5FQ1RJT05fRVJST1InO1xuXHRcdHJldHVybiBlcnJvcjtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVHcmFjZVRpbWUoY2FuZGlkYXRlOiBudW1iZXIsIGZhbGxiYWNrOiBudW1iZXIpOiBudW1iZXIge1xuXHRpZiAodHlwZW9mIGNhbmRpZGF0ZSAhPT0gJ251bWJlcicgfHwgIWlzRmluaXRlKGNhbmRpZGF0ZSkgfHwgY2FuZGlkYXRlIDwgMCkge1xuXHRcdHJldHVybiBmYWxsYmFjaztcblx0fVxuXHRpZiAoY2FuZGlkYXRlID4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcblx0XHRyZXR1cm4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVI7XG5cdH1cblx0cmV0dXJuIE1hdGguZmxvb3IoY2FuZGlkYXRlKTtcbn1cblxuZnVuY3Rpb24gc3RyaW5nUmlnaHRQYWQoc3RyOiBzdHJpbmcsIGxlbjogbnVtYmVyKTogc3RyaW5nIHtcblx0d2hpbGUgKHN0ci5sZW5ndGggPCBsZW4pIHtcblx0XHRzdHIgKz0gJyAnO1xuXHR9XG5cdHJldHVybiBzdHI7XG59XG5cbmZ1bmN0aW9uIF9jb21tb25Mb2dQcmVmaXgoY29ubmVjdGlvblR5cGU6IENvbm5lY3Rpb25UeXBlLCByZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGBbcmVtb3RlLWNvbm5lY3Rpb25dWyR7c3RyaW5nUmlnaHRQYWQoY29ubmVjdGlvblR5cGVUb1N0cmluZyhjb25uZWN0aW9uVHlwZSksIDEzKX1dWyR7cmVjb25uZWN0aW9uVG9rZW4uc3Vic3RyKDAsIDUpfVx1MjAyNl1gO1xufVxuXG5mdW5jdGlvbiBjb21tb25Mb2dQcmVmaXgoY29ubmVjdGlvblR5cGU6IENvbm5lY3Rpb25UeXBlLCByZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLCBpc1JlY29ubmVjdDogYm9vbGVhbik6IHN0cmluZyB7XG5cdHJldHVybiBgJHtfY29tbW9uTG9nUHJlZml4KGNvbm5lY3Rpb25UeXBlLCByZWNvbm5lY3Rpb25Ub2tlbil9WyR7aXNSZWNvbm5lY3QgPyAncmVjb25uZWN0JyA6ICdpbml0aWFsJ31dYDtcbn1cblxuZnVuY3Rpb24gY29ubmVjdExvZ1ByZWZpeChvcHRpb25zOiBJU2ltcGxlQ29ubmVjdGlvbk9wdGlvbnMsIGNvbm5lY3Rpb25UeXBlOiBDb25uZWN0aW9uVHlwZSk6IHN0cmluZyB7XG5cdHJldHVybiBgJHtjb21tb25Mb2dQcmVmaXgoY29ubmVjdGlvblR5cGUsIG9wdGlvbnMucmVjb25uZWN0aW9uVG9rZW4sICEhb3B0aW9ucy5yZWNvbm5lY3Rpb25Qcm90b2NvbCl9WyR7b3B0aW9ucy5jb25uZWN0VG99XWA7XG59XG5cbmZ1bmN0aW9uIGxvZ0VsYXBzZWQoc3RhcnRUaW1lOiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7RGF0ZS5ub3coKSAtIHN0YXJ0VGltZX0gbXNgO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBNEIseUJBQXlCLDRCQUE0QjtBQUNqRixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxxQkFBcUIseUJBQXlCO0FBQ3ZELFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLHlCQUF5QjtBQUNsQyxZQUFZLGlCQUFpQjtBQUM3QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG9CQUFvQjtBQUU3QixTQUFTLFFBQWlCLG9CQUFvQixtQkFBbUIsNEJBQTRCO0FBRzdGLFNBQVMsb0NBQXNEO0FBSS9ELE1BQU0sb0JBQW9CLEtBQUs7QUFFeEIsSUFBVyxpQkFBWCxrQkFBV0Esb0JBQVg7QUFDTixFQUFBQSxnQ0FBQSxnQkFBYSxLQUFiO0FBQ0EsRUFBQUEsZ0NBQUEsbUJBQWdCLEtBQWhCO0FBQ0EsRUFBQUEsZ0NBQUEsWUFBUyxLQUFUO0FBSGlCLFNBQUFBO0FBQUEsR0FBQTtBQU1sQixTQUFTLHVCQUF1QixnQkFBd0M7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QVMsa0JBQWtCLFdBQW1CLFVBQTBCO0FBQ3ZFLE1BQUksT0FBTyxjQUFjLFlBQVksQ0FBQyxTQUFTLFNBQVMsS0FBSyxZQUFZLEdBQUc7QUFDM0UsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLFlBQVksT0FBTyxrQkFBa0I7QUFDeEMsV0FBTyxPQUFPO0FBQUEsRUFDZjtBQUNBLFNBQU8sS0FBSyxNQUFNLFNBQVM7QUFDNUI7QUFFQSxTQUFTLGVBQWUsS0FBYSxLQUFxQjtBQUN6RCxTQUFPLElBQUksU0FBUyxLQUFLO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxpQkFBaUIsZ0JBQWdDLG1CQUFtQztBQUM1RixTQUFPLHVCQUF1QixlQUFlLHVCQUF1QixjQUFjLEdBQUcsRUFBRSxDQUFDLEtBQUssa0JBQWtCLE9BQU8sR0FBRyxDQUFDLENBQUM7QUFDNUg7QUFFQSxTQUFTLGdCQUFnQixnQkFBZ0MsbUJBQTJCLGFBQThCO0FBQ2pILFNBQU8sR0FBRyxpQkFBaUIsZ0JBQWdCLGlCQUFpQixDQUFDLElBQUksY0FBYyxjQUFjLFNBQVM7QUFDdkc7QUFFQSxTQUFTLGlCQUFpQixTQUFtQyxnQkFBd0M7QUFDcEcsU0FBTyxHQUFHLGdCQUFnQixnQkFBZ0IsUUFBUSxtQkFBbUIsQ0FBQyxDQUFDLFFBQVEsb0JBQW9CLENBQUMsSUFBSSxRQUFRLFNBQVM7QUFDMUg7QUFFQSxTQUFTLFdBQVcsV0FBMkI7QUFDOUMsU0FBTyxHQUFHLEtBQUssSUFBSSxJQUFJLFNBQVM7QUFDakM7IiwKICAibmFtZXMiOiBbIkNvbm5lY3Rpb25UeXBlIiwgIlBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlIl0KfQo=
