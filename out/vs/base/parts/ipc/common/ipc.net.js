import { VSBuffer } from "../../../common/buffer.js";
import { Emitter } from "../../../common/event.js";
import { Disposable, DisposableStore } from "../../../common/lifecycle.js";
import { IPCClient } from "./ipc.js";
var SocketDiagnosticsEventType = /* @__PURE__ */ ((SocketDiagnosticsEventType2) => {
  SocketDiagnosticsEventType2["Created"] = "created";
  SocketDiagnosticsEventType2["Read"] = "read";
  SocketDiagnosticsEventType2["Write"] = "write";
  SocketDiagnosticsEventType2["Open"] = "open";
  SocketDiagnosticsEventType2["Error"] = "error";
  SocketDiagnosticsEventType2["Close"] = "close";
  SocketDiagnosticsEventType2["BrowserWebSocketBlobReceived"] = "browserWebSocketBlobReceived";
  SocketDiagnosticsEventType2["NodeEndReceived"] = "nodeEndReceived";
  SocketDiagnosticsEventType2["NodeEndSent"] = "nodeEndSent";
  SocketDiagnosticsEventType2["NodeDrainBegin"] = "nodeDrainBegin";
  SocketDiagnosticsEventType2["NodeDrainEnd"] = "nodeDrainEnd";
  SocketDiagnosticsEventType2["zlibInflateError"] = "zlibInflateError";
  SocketDiagnosticsEventType2["zlibInflateData"] = "zlibInflateData";
  SocketDiagnosticsEventType2["zlibInflateInitialWrite"] = "zlibInflateInitialWrite";
  SocketDiagnosticsEventType2["zlibInflateInitialFlushFired"] = "zlibInflateInitialFlushFired";
  SocketDiagnosticsEventType2["zlibInflateWrite"] = "zlibInflateWrite";
  SocketDiagnosticsEventType2["zlibInflateFlushFired"] = "zlibInflateFlushFired";
  SocketDiagnosticsEventType2["zlibDeflateError"] = "zlibDeflateError";
  SocketDiagnosticsEventType2["zlibDeflateData"] = "zlibDeflateData";
  SocketDiagnosticsEventType2["zlibDeflateWrite"] = "zlibDeflateWrite";
  SocketDiagnosticsEventType2["zlibDeflateFlushFired"] = "zlibDeflateFlushFired";
  SocketDiagnosticsEventType2["WebSocketNodeSocketWrite"] = "webSocketNodeSocketWrite";
  SocketDiagnosticsEventType2["WebSocketNodeSocketPeekedHeader"] = "webSocketNodeSocketPeekedHeader";
  SocketDiagnosticsEventType2["WebSocketNodeSocketReadHeader"] = "webSocketNodeSocketReadHeader";
  SocketDiagnosticsEventType2["WebSocketNodeSocketReadData"] = "webSocketNodeSocketReadData";
  SocketDiagnosticsEventType2["WebSocketNodeSocketUnmaskedData"] = "webSocketNodeSocketUnmaskedData";
  SocketDiagnosticsEventType2["WebSocketNodeSocketDrainBegin"] = "webSocketNodeSocketDrainBegin";
  SocketDiagnosticsEventType2["WebSocketNodeSocketDrainEnd"] = "webSocketNodeSocketDrainEnd";
  SocketDiagnosticsEventType2["ProtocolHeaderRead"] = "protocolHeaderRead";
  SocketDiagnosticsEventType2["ProtocolMessageRead"] = "protocolMessageRead";
  SocketDiagnosticsEventType2["ProtocolHeaderWrite"] = "protocolHeaderWrite";
  SocketDiagnosticsEventType2["ProtocolMessageWrite"] = "protocolMessageWrite";
  SocketDiagnosticsEventType2["ProtocolWrite"] = "protocolWrite";
  return SocketDiagnosticsEventType2;
})(SocketDiagnosticsEventType || {});
var SocketDiagnostics;
((SocketDiagnostics2) => {
  SocketDiagnostics2.enableDiagnostics = false;
  SocketDiagnostics2.records = [];
  const socketIds = /* @__PURE__ */ new WeakMap();
  let lastUsedSocketId = 0;
  function getSocketId(nativeObject, label) {
    if (!socketIds.has(nativeObject)) {
      const id = String(++lastUsedSocketId);
      socketIds.set(nativeObject, id);
    }
    return socketIds.get(nativeObject);
  }
  function traceSocketEvent(nativeObject, socketDebugLabel, type, data) {
    if (!SocketDiagnostics2.enableDiagnostics) {
      return;
    }
    const id = getSocketId(nativeObject, socketDebugLabel);
    if (data instanceof VSBuffer || data instanceof Uint8Array || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const copiedData = VSBuffer.alloc(data.byteLength);
      copiedData.set(data);
      SocketDiagnostics2.records.push({ timestamp: Date.now(), id, label: socketDebugLabel, type, buff: copiedData });
    } else {
      SocketDiagnostics2.records.push({ timestamp: Date.now(), id, label: socketDebugLabel, type, data });
    }
  }
  SocketDiagnostics2.traceSocketEvent = traceSocketEvent;
})(SocketDiagnostics || (SocketDiagnostics = {}));
var SocketCloseEventType = /* @__PURE__ */ ((SocketCloseEventType2) => {
  SocketCloseEventType2[SocketCloseEventType2["NodeSocketCloseEvent"] = 0] = "NodeSocketCloseEvent";
  SocketCloseEventType2[SocketCloseEventType2["WebSocketCloseEvent"] = 1] = "WebSocketCloseEvent";
  return SocketCloseEventType2;
})(SocketCloseEventType || {});
var SocketTimeoutReason = /* @__PURE__ */ ((SocketTimeoutReason2) => {
  SocketTimeoutReason2["UNACKNOWLEDGED_MESSAGE"] = "unacknowledgedMessage";
  SocketTimeoutReason2["KEEP_ALIVE"] = "keepAlive";
  return SocketTimeoutReason2;
})(SocketTimeoutReason || {});
let emptyBuffer = null;
function getEmptyBuffer() {
  if (!emptyBuffer) {
    emptyBuffer = VSBuffer.alloc(0);
  }
  return emptyBuffer;
}
class ChunkStream {
  get byteLength() {
    return this._totalLength;
  }
  constructor() {
    this._chunks = [];
    this._totalLength = 0;
  }
  acceptChunk(buff) {
    this._chunks.push(buff);
    this._totalLength += buff.byteLength;
  }
  read(byteCount) {
    return this._read(byteCount, true);
  }
  peek(byteCount) {
    return this._read(byteCount, false);
  }
  _read(byteCount, advance) {
    if (byteCount === 0) {
      return getEmptyBuffer();
    }
    if (byteCount > this._totalLength) {
      throw new Error(`Cannot read so many bytes!`);
    }
    if (this._chunks[0].byteLength === byteCount) {
      const result2 = this._chunks[0];
      if (advance) {
        this._chunks.shift();
        this._totalLength -= byteCount;
      }
      return result2;
    }
    if (this._chunks[0].byteLength > byteCount) {
      const result2 = this._chunks[0].slice(0, byteCount);
      if (advance) {
        this._chunks[0] = this._chunks[0].slice(byteCount);
        this._totalLength -= byteCount;
      }
      return result2;
    }
    const result = VSBuffer.alloc(byteCount);
    let resultOffset = 0;
    let chunkIndex = 0;
    while (byteCount > 0) {
      const chunk = this._chunks[chunkIndex];
      if (chunk.byteLength > byteCount) {
        const chunkPart = chunk.slice(0, byteCount);
        result.set(chunkPart, resultOffset);
        resultOffset += byteCount;
        if (advance) {
          this._chunks[chunkIndex] = chunk.slice(byteCount);
          this._totalLength -= byteCount;
        }
        byteCount -= byteCount;
      } else {
        result.set(chunk, resultOffset);
        resultOffset += chunk.byteLength;
        if (advance) {
          this._chunks.shift();
          this._totalLength -= chunk.byteLength;
        } else {
          chunkIndex++;
        }
        byteCount -= chunk.byteLength;
      }
    }
    return result;
  }
}
var ProtocolMessageType = /* @__PURE__ */ ((ProtocolMessageType2) => {
  ProtocolMessageType2[ProtocolMessageType2["None"] = 0] = "None";
  ProtocolMessageType2[ProtocolMessageType2["Regular"] = 1] = "Regular";
  ProtocolMessageType2[ProtocolMessageType2["Control"] = 2] = "Control";
  ProtocolMessageType2[ProtocolMessageType2["Ack"] = 3] = "Ack";
  ProtocolMessageType2[ProtocolMessageType2["Disconnect"] = 5] = "Disconnect";
  ProtocolMessageType2[ProtocolMessageType2["ReplayRequest"] = 6] = "ReplayRequest";
  ProtocolMessageType2[ProtocolMessageType2["Pause"] = 7] = "Pause";
  ProtocolMessageType2[ProtocolMessageType2["Resume"] = 8] = "Resume";
  ProtocolMessageType2[ProtocolMessageType2["KeepAlive"] = 9] = "KeepAlive";
  return ProtocolMessageType2;
})(ProtocolMessageType || {});
function protocolMessageTypeToString(messageType) {
  switch (messageType) {
    case 0 /* None */:
      return "None";
    case 1 /* Regular */:
      return "Regular";
    case 2 /* Control */:
      return "Control";
    case 3 /* Ack */:
      return "Ack";
    case 5 /* Disconnect */:
      return "Disconnect";
    case 6 /* ReplayRequest */:
      return "ReplayRequest";
    case 7 /* Pause */:
      return "PauseWriting";
    case 8 /* Resume */:
      return "ResumeWriting";
    case 9 /* KeepAlive */:
      return "KeepAlive";
  }
}
var ProtocolConstants = /* @__PURE__ */ ((ProtocolConstants2) => {
  ProtocolConstants2[ProtocolConstants2["HeaderLength"] = 13] = "HeaderLength";
  ProtocolConstants2[ProtocolConstants2["AcknowledgeTime"] = 2e3] = "AcknowledgeTime";
  ProtocolConstants2[ProtocolConstants2["TimeoutTime"] = 2e4] = "TimeoutTime";
  ProtocolConstants2[ProtocolConstants2["ReconnectionGraceTime"] = 108e5] = "ReconnectionGraceTime";
  ProtocolConstants2[ProtocolConstants2["ReconnectionShortGraceTime"] = 3e5] = "ReconnectionShortGraceTime";
  ProtocolConstants2[ProtocolConstants2["KeepAliveSendTime"] = 5e3] = "KeepAliveSendTime";
  return ProtocolConstants2;
})(ProtocolConstants || {});
class ProtocolMessage {
  constructor(type, id, ack, data) {
    this.type = type;
    this.id = id;
    this.ack = ack;
    this.data = data;
    this.writtenTime = 0;
  }
  get size() {
    return this.data.byteLength;
  }
}
class ProtocolReader extends Disposable {
  constructor(socket) {
    super();
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._state = {
      readHead: true,
      readLen: 13 /* HeaderLength */,
      messageType: 0 /* None */,
      id: 0,
      ack: 0
    };
    this._socket = socket;
    this._isDisposed = false;
    this._incomingData = new ChunkStream();
    this._register(this._socket.onData((data) => this.acceptChunk(data)));
    this.lastReadTime = Date.now();
  }
  acceptChunk(data) {
    if (!data || data.byteLength === 0) {
      return;
    }
    this.lastReadTime = Date.now();
    this._incomingData.acceptChunk(data);
    while (this._incomingData.byteLength >= this._state.readLen) {
      const buff = this._incomingData.read(this._state.readLen);
      if (this._state.readHead) {
        this._state.readHead = false;
        this._state.readLen = buff.readUInt32BE(9);
        this._state.messageType = buff.readUInt8(0);
        this._state.id = buff.readUInt32BE(1);
        this._state.ack = buff.readUInt32BE(5);
        this._socket.traceSocketEvent("protocolHeaderRead" /* ProtocolHeaderRead */, { messageType: protocolMessageTypeToString(this._state.messageType), id: this._state.id, ack: this._state.ack, messageSize: this._state.readLen });
      } else {
        const messageType = this._state.messageType;
        const id = this._state.id;
        const ack = this._state.ack;
        this._state.readHead = true;
        this._state.readLen = 13 /* HeaderLength */;
        this._state.messageType = 0 /* None */;
        this._state.id = 0;
        this._state.ack = 0;
        this._socket.traceSocketEvent("protocolMessageRead" /* ProtocolMessageRead */, buff);
        this._onMessage.fire(new ProtocolMessage(messageType, id, ack, buff));
        if (this._isDisposed) {
          break;
        }
      }
    }
  }
  readEntireBuffer() {
    return this._incomingData.read(this._incomingData.byteLength);
  }
  dispose() {
    this._isDisposed = true;
    super.dispose();
  }
}
class ProtocolWriter {
  constructor(socket) {
    this._writeNowTimeout = null;
    this._isDisposed = false;
    this._isPaused = false;
    this._socket = socket;
    this._data = [];
    this._totalLength = 0;
    this.lastWriteTime = 0;
  }
  dispose() {
    try {
      this.flush();
    } catch (err) {
    }
    this._isDisposed = true;
  }
  drain() {
    this.flush();
    return this._socket.drain();
  }
  flush() {
    this._writeNow();
  }
  pause() {
    this._isPaused = true;
  }
  resume() {
    this._isPaused = false;
    this._scheduleWriting();
  }
  write(msg) {
    if (this._isDisposed) {
      return;
    }
    msg.writtenTime = Date.now();
    this.lastWriteTime = Date.now();
    const header = VSBuffer.alloc(13 /* HeaderLength */);
    header.writeUInt8(msg.type, 0);
    header.writeUInt32BE(msg.id, 1);
    header.writeUInt32BE(msg.ack, 5);
    header.writeUInt32BE(msg.data.byteLength, 9);
    this._socket.traceSocketEvent("protocolHeaderWrite" /* ProtocolHeaderWrite */, { messageType: protocolMessageTypeToString(msg.type), id: msg.id, ack: msg.ack, messageSize: msg.data.byteLength });
    this._socket.traceSocketEvent("protocolMessageWrite" /* ProtocolMessageWrite */, msg.data);
    this._writeSoon(header, msg.data);
  }
  _bufferAdd(head, body) {
    const wasEmpty = this._totalLength === 0;
    this._data.push(head, body);
    this._totalLength += head.byteLength + body.byteLength;
    return wasEmpty;
  }
  _bufferTake() {
    const ret = VSBuffer.concat(this._data, this._totalLength);
    this._data.length = 0;
    this._totalLength = 0;
    return ret;
  }
  _writeSoon(header, data) {
    if (this._bufferAdd(header, data)) {
      this._scheduleWriting();
    }
  }
  _scheduleWriting() {
    if (this._writeNowTimeout) {
      return;
    }
    this._writeNowTimeout = setTimeout(() => {
      this._writeNowTimeout = null;
      this._writeNow();
    });
  }
  _writeNow() {
    if (this._totalLength === 0) {
      return;
    }
    if (this._isPaused) {
      return;
    }
    const data = this._bufferTake();
    this._socket.traceSocketEvent("protocolWrite" /* ProtocolWrite */, { byteLength: data.byteLength });
    this._socket.write(data);
  }
}
class Protocol extends Disposable {
  constructor(socket) {
    super();
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._socket = socket;
    this._socketWriter = this._register(new ProtocolWriter(this._socket));
    this._socketReader = this._register(new ProtocolReader(this._socket));
    this._register(this._socketReader.onMessage((msg) => {
      if (msg.type === 1 /* Regular */) {
        this._onMessage.fire(msg.data);
      }
    }));
    this._register(this._socket.onClose(() => this._onDidDispose.fire()));
  }
  drain() {
    return this._socketWriter.drain();
  }
  getSocket() {
    return this._socket;
  }
  sendDisconnect() {
  }
  send(buffer) {
    this._socketWriter.write(new ProtocolMessage(1 /* Regular */, 0, 0, buffer));
  }
}
class Client extends IPCClient {
  constructor(protocol, id, ipcLogger = null) {
    super(protocol, id, ipcLogger);
    this.protocol = protocol;
  }
  static fromSocket(socket, id) {
    return new Client(new Protocol(socket), id);
  }
  get onDidDispose() {
    return this.protocol.onDidDispose;
  }
  dispose() {
    super.dispose();
    const socket = this.protocol.getSocket();
    this.protocol.sendDisconnect();
    this.protocol.dispose();
    socket.end();
  }
}
class BufferedEmitter {
  constructor() {
    this._hasListeners = false;
    this._isDeliveringMessages = false;
    this._bufferedMessages = [];
    this._emitter = new Emitter({
      onWillAddFirstListener: () => {
        this._hasListeners = true;
        queueMicrotask(() => this._deliverMessages());
      },
      onDidRemoveLastListener: () => {
        this._hasListeners = false;
      }
    });
    this.event = this._emitter.event;
  }
  _deliverMessages() {
    if (this._isDeliveringMessages) {
      return;
    }
    this._isDeliveringMessages = true;
    while (this._hasListeners && this._bufferedMessages.length > 0) {
      this._emitter.fire(this._bufferedMessages.shift());
    }
    this._isDeliveringMessages = false;
  }
  fire(event) {
    if (this._hasListeners) {
      if (this._bufferedMessages.length > 0) {
        this._bufferedMessages.push(event);
      } else {
        this._emitter.fire(event);
      }
    } else {
      this._bufferedMessages.push(event);
    }
  }
  flushBuffer() {
    this._bufferedMessages = [];
  }
}
class QueueElement {
  constructor(data) {
    this.data = data;
    this.next = null;
  }
}
class Queue {
  constructor() {
    this._first = null;
    this._last = null;
  }
  length() {
    let result = 0;
    let current = this._first;
    while (current) {
      current = current.next;
      result++;
    }
    return result;
  }
  peek() {
    if (!this._first) {
      return null;
    }
    return this._first.data;
  }
  toArray() {
    const result = [];
    let resultLen = 0;
    let it = this._first;
    while (it) {
      result[resultLen++] = it.data;
      it = it.next;
    }
    return result;
  }
  pop() {
    if (!this._first) {
      return;
    }
    if (this._first === this._last) {
      this._first = null;
      this._last = null;
      return;
    }
    this._first = this._first.next;
  }
  push(item) {
    const element = new QueueElement(item);
    if (!this._first) {
      this._first = element;
      this._last = element;
      return;
    }
    this._last.next = element;
    this._last = element;
  }
}
const _LoadEstimator = class _LoadEstimator {
  static getInstance() {
    if (!_LoadEstimator._INSTANCE) {
      _LoadEstimator._INSTANCE = new _LoadEstimator();
    }
    return _LoadEstimator._INSTANCE;
  }
  constructor() {
    this.lastRuns = [];
    const now = Date.now();
    for (let i = 0; i < _LoadEstimator._HISTORY_LENGTH; i++) {
      this.lastRuns[i] = now - 1e3 * i;
    }
    setInterval(() => {
      for (let i = _LoadEstimator._HISTORY_LENGTH; i >= 1; i--) {
        this.lastRuns[i] = this.lastRuns[i - 1];
      }
      this.lastRuns[0] = Date.now();
    }, 1e3);
  }
  /**
   * returns an estimative number, from 0 (low load) to 1 (high load)
   */
  load() {
    const now = Date.now();
    const historyLimit = (1 + _LoadEstimator._HISTORY_LENGTH) * 1e3;
    let score = 0;
    for (let i = 0; i < _LoadEstimator._HISTORY_LENGTH; i++) {
      if (now - this.lastRuns[i] <= historyLimit) {
        score++;
      }
    }
    return 1 - score / _LoadEstimator._HISTORY_LENGTH;
  }
  hasHighLoad() {
    return this.load() >= 0.5;
  }
};
_LoadEstimator._HISTORY_LENGTH = 10;
_LoadEstimator._INSTANCE = null;
let LoadEstimator = _LoadEstimator;
class PersistentProtocol {
  constructor(opts) {
    this._onControlMessage = new BufferedEmitter();
    this.onControlMessage = this._onControlMessage.event;
    this._onMessage = new BufferedEmitter();
    this.onMessage = this._onMessage.event;
    this._onDidDispose = new BufferedEmitter();
    this.onDidDispose = this._onDidDispose.event;
    this._onSocketClose = new BufferedEmitter();
    this.onSocketClose = this._onSocketClose.event;
    this._onSocketTimeout = new BufferedEmitter();
    this.onSocketTimeout = this._onSocketTimeout.event;
    this._loadEstimator = opts.loadEstimator ?? LoadEstimator.getInstance();
    this._shouldSendKeepAlive = opts.sendKeepAlive ?? true;
    this._isReconnecting = false;
    this._outgoingUnackMsg = new Queue();
    this._outgoingMsgId = 0;
    this._outgoingAckId = 0;
    this._outgoingAckTimeout = null;
    this._incomingMsgId = 0;
    this._incomingAckId = 0;
    this._incomingMsgLastTime = 0;
    this._incomingAckTimeout = null;
    this._lastReplayRequestTime = 0;
    this._lastSocketTimeoutTime = Date.now();
    this._socketDisposables = new DisposableStore();
    this._socket = opts.socket;
    this._socketWriter = this._socketDisposables.add(new ProtocolWriter(this._socket));
    this._socketReader = this._socketDisposables.add(new ProtocolReader(this._socket));
    this._socketDisposables.add(this._socketReader.onMessage((msg) => this._receiveMessage(msg)));
    this._socketDisposables.add(this._socket.onClose((e) => this._onSocketClose.fire(e)));
    if (opts.initialChunk) {
      this._socketReader.acceptChunk(opts.initialChunk);
    }
    if (this._shouldSendKeepAlive) {
      this._keepAliveInterval = setInterval(() => {
        this._sendKeepAlive();
      }, 5e3 /* KeepAliveSendTime */);
    } else {
      this._keepAliveInterval = null;
    }
  }
  get unacknowledgedCount() {
    return this._outgoingMsgId - this._outgoingAckId;
  }
  dispose() {
    if (this._outgoingAckTimeout) {
      clearTimeout(this._outgoingAckTimeout);
      this._outgoingAckTimeout = null;
    }
    if (this._incomingAckTimeout) {
      clearTimeout(this._incomingAckTimeout);
      this._incomingAckTimeout = null;
    }
    if (this._keepAliveInterval) {
      clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = null;
    }
    this._socketDisposables.dispose();
  }
  drain() {
    return this._socketWriter.drain();
  }
  sendDisconnect() {
    if (!this._didSendDisconnect) {
      this._didSendDisconnect = true;
      const msg = new ProtocolMessage(5 /* Disconnect */, 0, 0, getEmptyBuffer());
      this._socketWriter.write(msg);
      this._socketWriter.flush();
    }
  }
  sendPause() {
    const msg = new ProtocolMessage(7 /* Pause */, 0, 0, getEmptyBuffer());
    this._socketWriter.write(msg);
  }
  sendResume() {
    const msg = new ProtocolMessage(8 /* Resume */, 0, 0, getEmptyBuffer());
    this._socketWriter.write(msg);
  }
  pauseSocketWriting() {
    this._socketWriter.pause();
  }
  getSocket() {
    return this._socket;
  }
  getMillisSinceLastIncomingData() {
    return Date.now() - this._socketReader.lastReadTime;
  }
  beginAcceptReconnection(socket, initialDataChunk) {
    this._isReconnecting = true;
    this._socketDisposables.dispose();
    this._socketDisposables = new DisposableStore();
    this._onControlMessage.flushBuffer();
    this._onSocketClose.flushBuffer();
    this._onSocketTimeout.flushBuffer();
    this._socket.dispose();
    this._lastReplayRequestTime = 0;
    this._lastSocketTimeoutTime = Date.now();
    this._socket = socket;
    this._socketWriter = this._socketDisposables.add(new ProtocolWriter(this._socket));
    this._socketReader = this._socketDisposables.add(new ProtocolReader(this._socket));
    this._socketDisposables.add(this._socketReader.onMessage((msg) => this._receiveMessage(msg)));
    this._socketDisposables.add(this._socket.onClose((e) => this._onSocketClose.fire(e)));
    this._socketReader.acceptChunk(initialDataChunk);
  }
  endAcceptReconnection() {
    this._isReconnecting = false;
    this._incomingAckId = this._incomingMsgId;
    const msg = new ProtocolMessage(3 /* Ack */, 0, this._incomingAckId, getEmptyBuffer());
    this._socketWriter.write(msg);
    const toSend = this._outgoingUnackMsg.toArray();
    for (let i = 0, len = toSend.length; i < len; i++) {
      this._socketWriter.write(toSend[i]);
    }
    this._recvAckCheck();
  }
  acceptDisconnect() {
    this._onDidDispose.fire();
  }
  _receiveMessage(msg) {
    if (msg.ack > this._outgoingAckId) {
      this._outgoingAckId = msg.ack;
      do {
        const first = this._outgoingUnackMsg.peek();
        if (first && first.id <= msg.ack) {
          this._outgoingUnackMsg.pop();
        } else {
          break;
        }
      } while (true);
    }
    switch (msg.type) {
      case 0 /* None */: {
        break;
      }
      case 1 /* Regular */: {
        if (msg.id > this._incomingMsgId) {
          if (msg.id !== this._incomingMsgId + 1) {
            const now = Date.now();
            if (now - this._lastReplayRequestTime > 1e4) {
              this._lastReplayRequestTime = now;
              this._socketWriter.write(new ProtocolMessage(6 /* ReplayRequest */, 0, 0, getEmptyBuffer()));
            }
          } else {
            this._incomingMsgId = msg.id;
            this._incomingMsgLastTime = Date.now();
            this._sendAckCheck();
            this._onMessage.fire(msg.data);
          }
        }
        break;
      }
      case 2 /* Control */: {
        this._onControlMessage.fire(msg.data);
        break;
      }
      case 3 /* Ack */: {
        break;
      }
      case 5 /* Disconnect */: {
        this._onDidDispose.fire();
        break;
      }
      case 6 /* ReplayRequest */: {
        const toSend = this._outgoingUnackMsg.toArray();
        for (let i = 0, len = toSend.length; i < len; i++) {
          this._socketWriter.write(toSend[i]);
        }
        this._recvAckCheck();
        break;
      }
      case 7 /* Pause */: {
        this._socketWriter.pause();
        break;
      }
      case 8 /* Resume */: {
        this._socketWriter.resume();
        break;
      }
      case 9 /* KeepAlive */: {
        break;
      }
    }
  }
  readEntireBuffer() {
    return this._socketReader.readEntireBuffer();
  }
  flush() {
    this._socketWriter.flush();
  }
  send(buffer) {
    const myId = ++this._outgoingMsgId;
    this._incomingAckId = this._incomingMsgId;
    const msg = new ProtocolMessage(1 /* Regular */, myId, this._incomingAckId, buffer);
    this._outgoingUnackMsg.push(msg);
    if (!this._isReconnecting) {
      this._socketWriter.write(msg);
      this._recvAckCheck();
    }
  }
  /**
   * Send a message which will not be part of the regular acknowledge flow.
   * Use this for early control messages which are repeated in case of reconnection.
   */
  sendControl(buffer) {
    const msg = new ProtocolMessage(2 /* Control */, 0, 0, buffer);
    this._socketWriter.write(msg);
  }
  _sendAckCheck() {
    if (this._incomingMsgId <= this._incomingAckId) {
      return;
    }
    if (this._incomingAckTimeout) {
      return;
    }
    const timeSinceLastIncomingMsg = Date.now() - this._incomingMsgLastTime;
    if (timeSinceLastIncomingMsg >= 2e3 /* AcknowledgeTime */) {
      this._sendAck();
      return;
    }
    this._incomingAckTimeout = setTimeout(() => {
      this._incomingAckTimeout = null;
      this._sendAckCheck();
    }, 2e3 /* AcknowledgeTime */ - timeSinceLastIncomingMsg + 5);
  }
  _recvAckCheck() {
    if (this._outgoingMsgId <= this._outgoingAckId) {
      return;
    }
    if (this._outgoingAckTimeout) {
      return;
    }
    if (this._isReconnecting) {
      return;
    }
    const oldestUnacknowledgedMsg = this._outgoingUnackMsg.peek();
    const timeSinceOldestUnacknowledgedMsg = Date.now() - oldestUnacknowledgedMsg.writtenTime;
    const timeSinceLastReceivedSomeData = Date.now() - this._socketReader.lastReadTime;
    const timeSinceLastTimeout = Date.now() - this._lastSocketTimeoutTime;
    if (timeSinceOldestUnacknowledgedMsg >= 2e4 /* TimeoutTime */ && timeSinceLastReceivedSomeData >= 2e4 /* TimeoutTime */ && timeSinceLastTimeout >= 2e4 /* TimeoutTime */) {
      if (!this._loadEstimator.hasHighLoad()) {
        this._lastSocketTimeoutTime = Date.now();
        this._onSocketTimeout.fire({
          reason: "unacknowledgedMessage" /* UNACKNOWLEDGED_MESSAGE */,
          unacknowledgedMsgCount: this._outgoingUnackMsg.length(),
          timeSinceOldestUnacknowledgedMsg,
          timeSinceLastReceivedSomeData
        });
        return;
      }
    }
    const minimumTimeUntilTimeout = Math.max(
      2e4 /* TimeoutTime */ - timeSinceOldestUnacknowledgedMsg,
      2e4 /* TimeoutTime */ - timeSinceLastReceivedSomeData,
      2e4 /* TimeoutTime */ - timeSinceLastTimeout,
      500
    );
    this._outgoingAckTimeout = setTimeout(() => {
      this._outgoingAckTimeout = null;
      this._recvAckCheck();
    }, minimumTimeUntilTimeout);
  }
  /**
   * Called after sending a keepalive. Both sides of this protocol send
   * keepalives every KeepAliveSendTime (5s), so receiving no data for
   * TimeoutTime (20s) means the connection is dead. This catches silent
   * connection deaths that _recvAckCheck cannot detect because there are
   * no unacknowledged regular messages.
   */
  _keepAliveTimeoutCheck() {
    if (this._isReconnecting) {
      return;
    }
    const now = Date.now();
    const timeSinceLastReceivedSomeData = now - this._socketReader.lastReadTime;
    const timeSinceLastTimeout = now - this._lastSocketTimeoutTime;
    if (timeSinceLastReceivedSomeData >= 2e4 /* TimeoutTime */ && timeSinceLastTimeout >= 2e4 /* TimeoutTime */) {
      if (!this._loadEstimator.hasHighLoad()) {
        this._lastSocketTimeoutTime = now;
        const unacknowledgedMsgCount = this._outgoingUnackMsg.length();
        const oldestUnacknowledgedMsg = this._outgoingUnackMsg.peek();
        this._onSocketTimeout.fire({
          reason: "keepAlive" /* KEEP_ALIVE */,
          unacknowledgedMsgCount,
          timeSinceOldestUnacknowledgedMsg: oldestUnacknowledgedMsg ? now - oldestUnacknowledgedMsg.writtenTime : void 0,
          timeSinceLastReceivedSomeData
        });
      }
    }
  }
  _sendAck() {
    if (this._incomingMsgId <= this._incomingAckId) {
      return;
    }
    this._incomingAckId = this._incomingMsgId;
    const msg = new ProtocolMessage(3 /* Ack */, 0, this._incomingAckId, getEmptyBuffer());
    this._socketWriter.write(msg);
  }
  _sendKeepAlive() {
    this._incomingAckId = this._incomingMsgId;
    const msg = new ProtocolMessage(9 /* KeepAlive */, 0, this._incomingAckId, getEmptyBuffer());
    this._socketWriter.write(msg);
    this._keepAliveTimeoutCheck();
  }
}
export {
  BufferedEmitter,
  ChunkStream,
  Client,
  LoadEstimator,
  PersistentProtocol,
  Protocol,
  ProtocolConstants,
  SocketCloseEventType,
  SocketDiagnostics,
  SocketDiagnosticsEventType,
  SocketTimeoutReason
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElJUENMb2dnZXIsIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sLCBJUENDbGllbnQgfSBmcm9tICcuL2lwYy5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlIHtcblx0Q3JlYXRlZCA9ICdjcmVhdGVkJyxcblx0UmVhZCA9ICdyZWFkJyxcblx0V3JpdGUgPSAnd3JpdGUnLFxuXHRPcGVuID0gJ29wZW4nLFxuXHRFcnJvciA9ICdlcnJvcicsXG5cdENsb3NlID0gJ2Nsb3NlJyxcblxuXHRCcm93c2VyV2ViU29ja2V0QmxvYlJlY2VpdmVkID0gJ2Jyb3dzZXJXZWJTb2NrZXRCbG9iUmVjZWl2ZWQnLFxuXG5cdE5vZGVFbmRSZWNlaXZlZCA9ICdub2RlRW5kUmVjZWl2ZWQnLFxuXHROb2RlRW5kU2VudCA9ICdub2RlRW5kU2VudCcsXG5cdE5vZGVEcmFpbkJlZ2luID0gJ25vZGVEcmFpbkJlZ2luJyxcblx0Tm9kZURyYWluRW5kID0gJ25vZGVEcmFpbkVuZCcsXG5cblx0emxpYkluZmxhdGVFcnJvciA9ICd6bGliSW5mbGF0ZUVycm9yJyxcblx0emxpYkluZmxhdGVEYXRhID0gJ3psaWJJbmZsYXRlRGF0YScsXG5cdHpsaWJJbmZsYXRlSW5pdGlhbFdyaXRlID0gJ3psaWJJbmZsYXRlSW5pdGlhbFdyaXRlJyxcblx0emxpYkluZmxhdGVJbml0aWFsRmx1c2hGaXJlZCA9ICd6bGliSW5mbGF0ZUluaXRpYWxGbHVzaEZpcmVkJyxcblx0emxpYkluZmxhdGVXcml0ZSA9ICd6bGliSW5mbGF0ZVdyaXRlJyxcblx0emxpYkluZmxhdGVGbHVzaEZpcmVkID0gJ3psaWJJbmZsYXRlRmx1c2hGaXJlZCcsXG5cdHpsaWJEZWZsYXRlRXJyb3IgPSAnemxpYkRlZmxhdGVFcnJvcicsXG5cdHpsaWJEZWZsYXRlRGF0YSA9ICd6bGliRGVmbGF0ZURhdGEnLFxuXHR6bGliRGVmbGF0ZVdyaXRlID0gJ3psaWJEZWZsYXRlV3JpdGUnLFxuXHR6bGliRGVmbGF0ZUZsdXNoRmlyZWQgPSAnemxpYkRlZmxhdGVGbHVzaEZpcmVkJyxcblxuXHRXZWJTb2NrZXROb2RlU29ja2V0V3JpdGUgPSAnd2ViU29ja2V0Tm9kZVNvY2tldFdyaXRlJyxcblx0V2ViU29ja2V0Tm9kZVNvY2tldFBlZWtlZEhlYWRlciA9ICd3ZWJTb2NrZXROb2RlU29ja2V0UGVla2VkSGVhZGVyJyxcblx0V2ViU29ja2V0Tm9kZVNvY2tldFJlYWRIZWFkZXIgPSAnd2ViU29ja2V0Tm9kZVNvY2tldFJlYWRIZWFkZXInLFxuXHRXZWJTb2NrZXROb2RlU29ja2V0UmVhZERhdGEgPSAnd2ViU29ja2V0Tm9kZVNvY2tldFJlYWREYXRhJyxcblx0V2ViU29ja2V0Tm9kZVNvY2tldFVubWFza2VkRGF0YSA9ICd3ZWJTb2NrZXROb2RlU29ja2V0VW5tYXNrZWREYXRhJyxcblx0V2ViU29ja2V0Tm9kZVNvY2tldERyYWluQmVnaW4gPSAnd2ViU29ja2V0Tm9kZVNvY2tldERyYWluQmVnaW4nLFxuXHRXZWJTb2NrZXROb2RlU29ja2V0RHJhaW5FbmQgPSAnd2ViU29ja2V0Tm9kZVNvY2tldERyYWluRW5kJyxcblxuXHRQcm90b2NvbEhlYWRlclJlYWQgPSAncHJvdG9jb2xIZWFkZXJSZWFkJyxcblx0UHJvdG9jb2xNZXNzYWdlUmVhZCA9ICdwcm90b2NvbE1lc3NhZ2VSZWFkJyxcblx0UHJvdG9jb2xIZWFkZXJXcml0ZSA9ICdwcm90b2NvbEhlYWRlcldyaXRlJyxcblx0UHJvdG9jb2xNZXNzYWdlV3JpdGUgPSAncHJvdG9jb2xNZXNzYWdlV3JpdGUnLFxuXHRQcm90b2NvbFdyaXRlID0gJ3Byb3RvY29sV3JpdGUnLFxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFNvY2tldERpYWdub3N0aWNzIHtcblxuXHRleHBvcnQgY29uc3QgZW5hYmxlRGlhZ25vc3RpY3MgPSBmYWxzZTtcblxuXHRleHBvcnQgaW50ZXJmYWNlIElSZWNvcmQge1xuXHRcdHRpbWVzdGFtcDogbnVtYmVyO1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0bGFiZWw6IHN0cmluZztcblx0XHR0eXBlOiBTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZTtcblx0XHRidWZmPzogVlNCdWZmZXI7XG5cdFx0ZGF0YT86IGFueTtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCByZWNvcmRzOiBJUmVjb3JkW10gPSBbXTtcblx0Y29uc3Qgc29ja2V0SWRzID0gbmV3IFdlYWtNYXA8YW55LCBzdHJpbmc+KCk7XG5cdGxldCBsYXN0VXNlZFNvY2tldElkID0gMDtcblxuXHRmdW5jdGlvbiBnZXRTb2NrZXRJZChuYXRpdmVPYmplY3Q6IHVua25vd24sIGxhYmVsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICghc29ja2V0SWRzLmhhcyhuYXRpdmVPYmplY3QpKSB7XG5cdFx0XHRjb25zdCBpZCA9IFN0cmluZygrK2xhc3RVc2VkU29ja2V0SWQpO1xuXHRcdFx0c29ja2V0SWRzLnNldChuYXRpdmVPYmplY3QsIGlkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNvY2tldElkcy5nZXQobmF0aXZlT2JqZWN0KSE7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdHJhY2VTb2NrZXRFdmVudChuYXRpdmVPYmplY3Q6IHVua25vd24sIHNvY2tldERlYnVnTGFiZWw6IHN0cmluZywgdHlwZTogU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUsIGRhdGE/OiBWU0J1ZmZlciB8IFVpbnQ4QXJyYXkgfCBBcnJheUJ1ZmZlciB8IEFycmF5QnVmZmVyVmlldyB8IGFueSk6IHZvaWQge1xuXHRcdGlmICghZW5hYmxlRGlhZ25vc3RpY3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaWQgPSBnZXRTb2NrZXRJZChuYXRpdmVPYmplY3QsIHNvY2tldERlYnVnTGFiZWwpO1xuXG5cdFx0aWYgKGRhdGEgaW5zdGFuY2VvZiBWU0J1ZmZlciB8fCBkYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSB8fCBkYXRhIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIgfHwgQXJyYXlCdWZmZXIuaXNWaWV3KGRhdGEpKSB7XG5cdFx0XHRjb25zdCBjb3BpZWREYXRhID0gVlNCdWZmZXIuYWxsb2MoZGF0YS5ieXRlTGVuZ3RoKTtcblx0XHRcdGNvcGllZERhdGEuc2V0KGRhdGEpO1xuXHRcdFx0cmVjb3Jkcy5wdXNoKHsgdGltZXN0YW1wOiBEYXRlLm5vdygpLCBpZCwgbGFiZWw6IHNvY2tldERlYnVnTGFiZWwsIHR5cGUsIGJ1ZmY6IGNvcGllZERhdGEgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGRhdGEgaXMgYSBjdXN0b20gb2JqZWN0XG5cdFx0XHRyZWNvcmRzLnB1c2goeyB0aW1lc3RhbXA6IERhdGUubm93KCksIGlkLCBsYWJlbDogc29ja2V0RGVidWdMYWJlbCwgdHlwZSwgZGF0YTogZGF0YSB9KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU29ja2V0Q2xvc2VFdmVudFR5cGUge1xuXHROb2RlU29ja2V0Q2xvc2VFdmVudCA9IDAsXG5cdFdlYlNvY2tldENsb3NlRXZlbnQgPSAxXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm9kZVNvY2tldENsb3NlRXZlbnQge1xuXHQvKipcblx0ICogVGhlIHR5cGUgb2YgdGhlIGV2ZW50XG5cdCAqL1xuXHRyZWFkb25seSB0eXBlOiBTb2NrZXRDbG9zZUV2ZW50VHlwZS5Ob2RlU29ja2V0Q2xvc2VFdmVudDtcblx0LyoqXG5cdCAqIGB0cnVlYCBpZiB0aGUgc29ja2V0IGhhZCBhIHRyYW5zbWlzc2lvbiBlcnJvci5cblx0ICovXG5cdHJlYWRvbmx5IGhhZEVycm9yOiBib29sZWFuO1xuXHQvKipcblx0ICogVW5kZXJseWluZyBlcnJvci5cblx0ICovXG5cdHJlYWRvbmx5IGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXZWJTb2NrZXRDbG9zZUV2ZW50IHtcblx0LyoqXG5cdCAqIFRoZSB0eXBlIG9mIHRoZSBldmVudFxuXHQgKi9cblx0cmVhZG9ubHkgdHlwZTogU29ja2V0Q2xvc2VFdmVudFR5cGUuV2ViU29ja2V0Q2xvc2VFdmVudDtcblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIFdlYlNvY2tldCBjb25uZWN0aW9uIGNsb3NlIGNvZGUgcHJvdmlkZWQgYnkgdGhlIHNlcnZlci5cblx0ICovXG5cdHJlYWRvbmx5IGNvZGU6IG51bWJlcjtcblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIFdlYlNvY2tldCBjb25uZWN0aW9uIGNsb3NlIHJlYXNvbiBwcm92aWRlZCBieSB0aGUgc2VydmVyLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVhc29uOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIGNvbm5lY3Rpb24gY2xvc2VkIGNsZWFubHk7IGZhbHNlIG90aGVyd2lzZS5cblx0ICovXG5cdHJlYWRvbmx5IHdhc0NsZWFuOiBib29sZWFuO1xuXHQvKipcblx0ICogVW5kZXJseWluZyBldmVudC5cblx0ICovXG5cdHJlYWRvbmx5IGV2ZW50OiBhbnkgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCB0eXBlIFNvY2tldENsb3NlRXZlbnQgPSBOb2RlU29ja2V0Q2xvc2VFdmVudCB8IFdlYlNvY2tldENsb3NlRXZlbnQgfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNvY2tldFRpbWVvdXRSZWFzb24ge1xuXHRVTkFDS05PV0xFREdFRF9NRVNTQUdFID0gJ3VuYWNrbm93bGVkZ2VkTWVzc2FnZScsXG5cdEtFRVBfQUxJVkUgPSAna2VlcEFsaXZlJyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTb2NrZXRUaW1lb3V0RXZlbnQge1xuXHRyZWFkb25seSByZWFzb246IFNvY2tldFRpbWVvdXRSZWFzb247XG5cdHJlYWRvbmx5IHVuYWNrbm93bGVkZ2VkTXNnQ291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgdGltZVNpbmNlT2xkZXN0VW5hY2tub3dsZWRnZWRNc2c/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHRpbWVTaW5jZUxhc3RSZWNlaXZlZFNvbWVEYXRhOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNvY2tldCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0b25EYXRhKGxpc3RlbmVyOiAoZTogVlNCdWZmZXIpID0+IHZvaWQpOiBJRGlzcG9zYWJsZTtcblx0b25DbG9zZShsaXN0ZW5lcjogKGU6IFNvY2tldENsb3NlRXZlbnQpID0+IHZvaWQpOiBJRGlzcG9zYWJsZTtcblx0b25FbmQobGlzdGVuZXI6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZTtcblx0d3JpdGUoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQ7XG5cdGVuZCgpOiB2b2lkO1xuXHRkcmFpbigpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHRyYWNlU29ja2V0RXZlbnQodHlwZTogU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUsIGRhdGE/OiBWU0J1ZmZlciB8IFVpbnQ4QXJyYXkgfCBBcnJheUJ1ZmZlciB8IEFycmF5QnVmZmVyVmlldyB8IGFueSk6IHZvaWQ7XG59XG5cbmxldCBlbXB0eUJ1ZmZlcjogVlNCdWZmZXIgfCBudWxsID0gbnVsbDtcbmZ1bmN0aW9uIGdldEVtcHR5QnVmZmVyKCk6IFZTQnVmZmVyIHtcblx0aWYgKCFlbXB0eUJ1ZmZlcikge1xuXHRcdGVtcHR5QnVmZmVyID0gVlNCdWZmZXIuYWxsb2MoMCk7XG5cdH1cblx0cmV0dXJuIGVtcHR5QnVmZmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQ2h1bmtTdHJlYW0ge1xuXG5cdHByaXZhdGUgX2NodW5rczogVlNCdWZmZXJbXTtcblx0cHJpdmF0ZSBfdG90YWxMZW5ndGg6IG51bWJlcjtcblxuXHRwdWJsaWMgZ2V0IGJ5dGVMZW5ndGgoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RvdGFsTGVuZ3RoO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fY2h1bmtzID0gW107XG5cdFx0dGhpcy5fdG90YWxMZW5ndGggPSAwO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdENodW5rKGJ1ZmY6IFZTQnVmZmVyKSB7XG5cdFx0dGhpcy5fY2h1bmtzLnB1c2goYnVmZik7XG5cdFx0dGhpcy5fdG90YWxMZW5ndGggKz0gYnVmZi5ieXRlTGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIHJlYWQoYnl0ZUNvdW50OiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlYWQoYnl0ZUNvdW50LCB0cnVlKTtcblx0fVxuXG5cdHB1YmxpYyBwZWVrKGJ5dGVDb3VudDogbnVtYmVyKTogVlNCdWZmZXIge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkKGJ5dGVDb3VudCwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZChieXRlQ291bnQ6IG51bWJlciwgYWR2YW5jZTogYm9vbGVhbik6IFZTQnVmZmVyIHtcblxuXHRcdGlmIChieXRlQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybiBnZXRFbXB0eUJ1ZmZlcigpO1xuXHRcdH1cblxuXHRcdGlmIChieXRlQ291bnQgPiB0aGlzLl90b3RhbExlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVhZCBzbyBtYW55IGJ5dGVzIWApO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jaHVua3NbMF0uYnl0ZUxlbmd0aCA9PT0gYnl0ZUNvdW50KSB7XG5cdFx0XHQvLyBzdXBlciBmYXN0IHBhdGgsIHByZWNpc2VseSBmaXJzdCBjaHVuayBtdXN0IGJlIHJldHVybmVkXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jaHVua3NbMF07XG5cdFx0XHRpZiAoYWR2YW5jZSkge1xuXHRcdFx0XHR0aGlzLl9jaHVua3Muc2hpZnQoKTtcblx0XHRcdFx0dGhpcy5fdG90YWxMZW5ndGggLT0gYnl0ZUNvdW50O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY2h1bmtzWzBdLmJ5dGVMZW5ndGggPiBieXRlQ291bnQpIHtcblx0XHRcdC8vIGZhc3QgcGF0aCwgdGhlIHJlYWRpbmcgaXMgZW50aXJlbHkgd2l0aGluIHRoZSBmaXJzdCBjaHVua1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fY2h1bmtzWzBdLnNsaWNlKDAsIGJ5dGVDb3VudCk7XG5cdFx0XHRpZiAoYWR2YW5jZSkge1xuXHRcdFx0XHR0aGlzLl9jaHVua3NbMF0gPSB0aGlzLl9jaHVua3NbMF0uc2xpY2UoYnl0ZUNvdW50KTtcblx0XHRcdFx0dGhpcy5fdG90YWxMZW5ndGggLT0gYnl0ZUNvdW50O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBWU0J1ZmZlci5hbGxvYyhieXRlQ291bnQpO1xuXHRcdGxldCByZXN1bHRPZmZzZXQgPSAwO1xuXHRcdGxldCBjaHVua0luZGV4ID0gMDtcblx0XHR3aGlsZSAoYnl0ZUNvdW50ID4gMCkge1xuXHRcdFx0Y29uc3QgY2h1bmsgPSB0aGlzLl9jaHVua3NbY2h1bmtJbmRleF07XG5cdFx0XHRpZiAoY2h1bmsuYnl0ZUxlbmd0aCA+IGJ5dGVDb3VudCkge1xuXHRcdFx0XHQvLyB0aGlzIGNodW5rIHdpbGwgc3Vydml2ZVxuXHRcdFx0XHRjb25zdCBjaHVua1BhcnQgPSBjaHVuay5zbGljZSgwLCBieXRlQ291bnQpO1xuXHRcdFx0XHRyZXN1bHQuc2V0KGNodW5rUGFydCwgcmVzdWx0T2Zmc2V0KTtcblx0XHRcdFx0cmVzdWx0T2Zmc2V0ICs9IGJ5dGVDb3VudDtcblxuXHRcdFx0XHRpZiAoYWR2YW5jZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NodW5rc1tjaHVua0luZGV4XSA9IGNodW5rLnNsaWNlKGJ5dGVDb3VudCk7XG5cdFx0XHRcdFx0dGhpcy5fdG90YWxMZW5ndGggLT0gYnl0ZUNvdW50O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ynl0ZUNvdW50IC09IGJ5dGVDb3VudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHRoaXMgY2h1bmsgd2lsbCBiZSBlbnRpcmVseSByZWFkXG5cdFx0XHRcdHJlc3VsdC5zZXQoY2h1bmssIHJlc3VsdE9mZnNldCk7XG5cdFx0XHRcdHJlc3VsdE9mZnNldCArPSBjaHVuay5ieXRlTGVuZ3RoO1xuXG5cdFx0XHRcdGlmIChhZHZhbmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2h1bmtzLnNoaWZ0KCk7XG5cdFx0XHRcdFx0dGhpcy5fdG90YWxMZW5ndGggLT0gY2h1bmsuYnl0ZUxlbmd0aDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjaHVua0luZGV4Kys7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRieXRlQ291bnQgLT0gY2h1bmsuYnl0ZUxlbmd0aDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jb25zdCBlbnVtIFByb3RvY29sTWVzc2FnZVR5cGUge1xuXHROb25lID0gMCxcblx0UmVndWxhciA9IDEsXG5cdENvbnRyb2wgPSAyLFxuXHRBY2sgPSAzLFxuXHREaXNjb25uZWN0ID0gNSxcblx0UmVwbGF5UmVxdWVzdCA9IDYsXG5cdFBhdXNlID0gNyxcblx0UmVzdW1lID0gOCxcblx0S2VlcEFsaXZlID0gOVxufVxuXG5mdW5jdGlvbiBwcm90b2NvbE1lc3NhZ2VUeXBlVG9TdHJpbmcobWVzc2FnZVR5cGU6IFByb3RvY29sTWVzc2FnZVR5cGUpIHtcblx0c3dpdGNoIChtZXNzYWdlVHlwZSkge1xuXHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5Ob25lOiByZXR1cm4gJ05vbmUnO1xuXHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5SZWd1bGFyOiByZXR1cm4gJ1JlZ3VsYXInO1xuXHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5Db250cm9sOiByZXR1cm4gJ0NvbnRyb2wnO1xuXHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5BY2s6IHJldHVybiAnQWNrJztcblx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuRGlzY29ubmVjdDogcmV0dXJuICdEaXNjb25uZWN0Jztcblx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuUmVwbGF5UmVxdWVzdDogcmV0dXJuICdSZXBsYXlSZXF1ZXN0Jztcblx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuUGF1c2U6IHJldHVybiAnUGF1c2VXcml0aW5nJztcblx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuUmVzdW1lOiByZXR1cm4gJ1Jlc3VtZVdyaXRpbmcnO1xuXHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5LZWVwQWxpdmU6IHJldHVybiAnS2VlcEFsaXZlJztcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBQcm90b2NvbENvbnN0YW50cyB7XG5cdEhlYWRlckxlbmd0aCA9IDEzLFxuXHQvKipcblx0ICogU2VuZCBhbiBBY2tub3dsZWRnZSBtZXNzYWdlIGF0IG1vc3QgMiBzZWNvbmRzIGxhdGVyLi4uXG5cdCAqL1xuXHRBY2tub3dsZWRnZVRpbWUgPSAyMDAwLCAvLyAyIHNlY29uZHNcblx0LyoqXG5cdCAqIElmIHRoZXJlIGlzIGEgc2VudCBtZXNzYWdlIHRoYXQgaGFzIGJlZW4gdW5hY2tub3dsZWRnZWQgZm9yIDIwIHNlY29uZHMsXG5cdCAqIGFuZCB3ZSBkaWRuJ3Qgc2VlIGFueSBpbmNvbWluZyBzZXJ2ZXIgZGF0YSBpbiB0aGUgcGFzdCAyMCBzZWNvbmRzLFxuXHQgKiB0aGVuIGNvbnNpZGVyIHRoZSBjb25uZWN0aW9uIGhhcyB0aW1lZCBvdXQuXG5cdCAqL1xuXHRUaW1lb3V0VGltZSA9IDIwMDAwLCAvLyAyMCBzZWNvbmRzXG5cdC8qKlxuXHQgKiBJZiB0aGVyZSBpcyBubyByZWNvbm5lY3Rpb24gd2l0aGluIHRoaXMgdGltZS1mcmFtZSwgY29uc2lkZXIgdGhlIGNvbm5lY3Rpb24gcGVybWFuZW50bHkgY2xvc2VkLi4uXG5cdCAqL1xuXHRSZWNvbm5lY3Rpb25HcmFjZVRpbWUgPSAzICogNjAgKiA2MCAqIDEwMDAsIC8vIDNocnNcblx0LyoqXG5cdCAqIE1heGltYWwgZ3JhY2UgdGltZSBiZXR3ZWVuIHRoZSBmaXJzdCBhbmQgdGhlIGxhc3QgcmVjb25uZWN0aW9uLi4uXG5cdCAqL1xuXHRSZWNvbm5lY3Rpb25TaG9ydEdyYWNlVGltZSA9IDUgKiA2MCAqIDEwMDAsIC8vIDVtaW5cblx0LyoqXG5cdCAqIFNlbmQgYSBtZXNzYWdlIGV2ZXJ5IDUgc2Vjb25kcyB0byBhdm9pZCB0aGF0IHRoZSBjb25uZWN0aW9uIGlzIGNsb3NlZCBieSB0aGUgT1MuXG5cdCAqL1xuXHRLZWVwQWxpdmVTZW5kVGltZSA9IDUwMDAsIC8vIDUgc2Vjb25kc1xufVxuXG5jbGFzcyBQcm90b2NvbE1lc3NhZ2Uge1xuXG5cdHB1YmxpYyB3cml0dGVuVGltZTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB0eXBlOiBQcm90b2NvbE1lc3NhZ2VUeXBlLFxuXHRcdHB1YmxpYyByZWFkb25seSBpZDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBhY2s6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGF0YTogVlNCdWZmZXJcblx0KSB7XG5cdFx0dGhpcy53cml0dGVuVGltZSA9IDA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhLmJ5dGVMZW5ndGg7XG5cdH1cbn1cblxuY2xhc3MgUHJvdG9jb2xSZWFkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zb2NrZXQ6IElTb2NrZXQ7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luY29taW5nRGF0YTogQ2h1bmtTdHJlYW07XG5cdHB1YmxpYyBsYXN0UmVhZFRpbWU6IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQcm90b2NvbE1lc3NhZ2U+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25NZXNzYWdlOiBFdmVudDxQcm90b2NvbE1lc3NhZ2U+ID0gdGhpcy5fb25NZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0ge1xuXHRcdHJlYWRIZWFkOiB0cnVlLFxuXHRcdHJlYWRMZW46IFByb3RvY29sQ29uc3RhbnRzLkhlYWRlckxlbmd0aCxcblx0XHRtZXNzYWdlVHlwZTogUHJvdG9jb2xNZXNzYWdlVHlwZS5Ob25lLFxuXHRcdGlkOiAwLFxuXHRcdGFjazogMFxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKHNvY2tldDogSVNvY2tldCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc29ja2V0ID0gc29ja2V0O1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9pbmNvbWluZ0RhdGEgPSBuZXcgQ2h1bmtTdHJlYW0oKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zb2NrZXQub25EYXRhKGRhdGEgPT4gdGhpcy5hY2NlcHRDaHVuayhkYXRhKSkpO1xuXHRcdHRoaXMubGFzdFJlYWRUaW1lID0gRGF0ZS5ub3coKTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRDaHVuayhkYXRhOiBWU0J1ZmZlciB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoIWRhdGEgfHwgZGF0YS5ieXRlTGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0UmVhZFRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0dGhpcy5faW5jb21pbmdEYXRhLmFjY2VwdENodW5rKGRhdGEpO1xuXG5cdFx0d2hpbGUgKHRoaXMuX2luY29taW5nRGF0YS5ieXRlTGVuZ3RoID49IHRoaXMuX3N0YXRlLnJlYWRMZW4pIHtcblxuXHRcdFx0Y29uc3QgYnVmZiA9IHRoaXMuX2luY29taW5nRGF0YS5yZWFkKHRoaXMuX3N0YXRlLnJlYWRMZW4pO1xuXG5cdFx0XHRpZiAodGhpcy5fc3RhdGUucmVhZEhlYWQpIHtcblx0XHRcdFx0Ly8gYnVmZiBpcyB0aGUgaGVhZGVyXG5cblx0XHRcdFx0Ly8gc2F2ZSBuZXcgc3RhdGUgPT4gbmV4dCB0aW1lIHdpbGwgcmVhZCB0aGUgYm9keVxuXHRcdFx0XHR0aGlzLl9zdGF0ZS5yZWFkSGVhZCA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5yZWFkTGVuID0gYnVmZi5yZWFkVUludDMyQkUoOSk7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLm1lc3NhZ2VUeXBlID0gYnVmZi5yZWFkVUludDgoMCk7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmlkID0gYnVmZi5yZWFkVUludDMyQkUoMSk7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmFjayA9IGJ1ZmYucmVhZFVJbnQzMkJFKDUpO1xuXG5cdFx0XHRcdHRoaXMuX3NvY2tldC50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLlByb3RvY29sSGVhZGVyUmVhZCwgeyBtZXNzYWdlVHlwZTogcHJvdG9jb2xNZXNzYWdlVHlwZVRvU3RyaW5nKHRoaXMuX3N0YXRlLm1lc3NhZ2VUeXBlKSwgaWQ6IHRoaXMuX3N0YXRlLmlkLCBhY2s6IHRoaXMuX3N0YXRlLmFjaywgbWVzc2FnZVNpemU6IHRoaXMuX3N0YXRlLnJlYWRMZW4gfSk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGJ1ZmYgaXMgdGhlIGJvZHlcblx0XHRcdFx0Y29uc3QgbWVzc2FnZVR5cGUgPSB0aGlzLl9zdGF0ZS5tZXNzYWdlVHlwZTtcblx0XHRcdFx0Y29uc3QgaWQgPSB0aGlzLl9zdGF0ZS5pZDtcblx0XHRcdFx0Y29uc3QgYWNrID0gdGhpcy5fc3RhdGUuYWNrO1xuXG5cdFx0XHRcdC8vIHNhdmUgbmV3IHN0YXRlID0+IG5leHQgdGltZSB3aWxsIHJlYWQgdGhlIGhlYWRlclxuXHRcdFx0XHR0aGlzLl9zdGF0ZS5yZWFkSGVhZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnJlYWRMZW4gPSBQcm90b2NvbENvbnN0YW50cy5IZWFkZXJMZW5ndGg7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLm1lc3NhZ2VUeXBlID0gUHJvdG9jb2xNZXNzYWdlVHlwZS5Ob25lO1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5pZCA9IDA7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmFjayA9IDA7XG5cblx0XHRcdFx0dGhpcy5fc29ja2V0LnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuUHJvdG9jb2xNZXNzYWdlUmVhZCwgYnVmZik7XG5cblx0XHRcdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUobmV3IFByb3RvY29sTWVzc2FnZShtZXNzYWdlVHlwZSwgaWQsIGFjaywgYnVmZikpO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0Ly8gY2hlY2sgaWYgYW4gZXZlbnQgbGlzdGVuZXIgbGVhZCB0byBvdXIgZGlzcG9zYWxcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWFkRW50aXJlQnVmZmVyKCk6IFZTQnVmZmVyIHtcblx0XHRyZXR1cm4gdGhpcy5faW5jb21pbmdEYXRhLnJlYWQodGhpcy5faW5jb21pbmdEYXRhLmJ5dGVMZW5ndGgpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFByb3RvY29sV3JpdGVyIHtcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuO1xuXHRwcml2YXRlIF9pc1BhdXNlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfc29ja2V0OiBJU29ja2V0O1xuXHRwcml2YXRlIF9kYXRhOiBWU0J1ZmZlcltdO1xuXHRwcml2YXRlIF90b3RhbExlbmd0aDogbnVtYmVyO1xuXHRwdWJsaWMgbGFzdFdyaXRlVGltZTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHNvY2tldDogSVNvY2tldCkge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9pc1BhdXNlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3NvY2tldCA9IHNvY2tldDtcblx0XHR0aGlzLl9kYXRhID0gW107XG5cdFx0dGhpcy5fdG90YWxMZW5ndGggPSAwO1xuXHRcdHRoaXMubGFzdFdyaXRlVGltZSA9IDA7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5mbHVzaCgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gaWdub3JlIGVycm9yLCBzaW5jZSB0aGUgc29ja2V0IGNvdWxkIGJlIGFscmVhZHkgY2xvc2VkXG5cdFx0fVxuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHR9XG5cblx0cHVibGljIGRyYWluKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZmx1c2goKTtcblx0XHRyZXR1cm4gdGhpcy5fc29ja2V0LmRyYWluKCk7XG5cdH1cblxuXHRwdWJsaWMgZmx1c2goKTogdm9pZCB7XG5cdFx0Ly8gZmx1c2hcblx0XHR0aGlzLl93cml0ZU5vdygpO1xuXHR9XG5cblx0cHVibGljIHBhdXNlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzUGF1c2VkID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyByZXN1bWUoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNQYXVzZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9zY2hlZHVsZVdyaXRpbmcoKTtcblx0fVxuXG5cdHB1YmxpYyB3cml0ZShtc2c6IFByb3RvY29sTWVzc2FnZSkge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHQvLyBpZ25vcmU6IHRoZXJlIGNvdWxkIGJlIGxlZnQtb3ZlciBwcm9taXNlcyB3aGljaCBjb21wbGV0ZSBhbmQgdGhlblxuXHRcdFx0Ly8gZGVjaWRlIHRvIHdyaXRlIGEgcmVzcG9uc2UsIGV0Yy4uLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRtc2cud3JpdHRlblRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdHRoaXMubGFzdFdyaXRlVGltZSA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgaGVhZGVyID0gVlNCdWZmZXIuYWxsb2MoUHJvdG9jb2xDb25zdGFudHMuSGVhZGVyTGVuZ3RoKTtcblx0XHRoZWFkZXIud3JpdGVVSW50OChtc2cudHlwZSwgMCk7XG5cdFx0aGVhZGVyLndyaXRlVUludDMyQkUobXNnLmlkLCAxKTtcblx0XHRoZWFkZXIud3JpdGVVSW50MzJCRShtc2cuYWNrLCA1KTtcblx0XHRoZWFkZXIud3JpdGVVSW50MzJCRShtc2cuZGF0YS5ieXRlTGVuZ3RoLCA5KTtcblxuXHRcdHRoaXMuX3NvY2tldC50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLlByb3RvY29sSGVhZGVyV3JpdGUsIHsgbWVzc2FnZVR5cGU6IHByb3RvY29sTWVzc2FnZVR5cGVUb1N0cmluZyhtc2cudHlwZSksIGlkOiBtc2cuaWQsIGFjazogbXNnLmFjaywgbWVzc2FnZVNpemU6IG1zZy5kYXRhLmJ5dGVMZW5ndGggfSk7XG5cdFx0dGhpcy5fc29ja2V0LnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuUHJvdG9jb2xNZXNzYWdlV3JpdGUsIG1zZy5kYXRhKTtcblxuXHRcdHRoaXMuX3dyaXRlU29vbihoZWFkZXIsIG1zZy5kYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX2J1ZmZlckFkZChoZWFkOiBWU0J1ZmZlciwgYm9keTogVlNCdWZmZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCB3YXNFbXB0eSA9IHRoaXMuX3RvdGFsTGVuZ3RoID09PSAwO1xuXHRcdHRoaXMuX2RhdGEucHVzaChoZWFkLCBib2R5KTtcblx0XHR0aGlzLl90b3RhbExlbmd0aCArPSBoZWFkLmJ5dGVMZW5ndGggKyBib2R5LmJ5dGVMZW5ndGg7XG5cdFx0cmV0dXJuIHdhc0VtcHR5O1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVmZmVyVGFrZSgpOiBWU0J1ZmZlciB7XG5cdFx0Y29uc3QgcmV0ID0gVlNCdWZmZXIuY29uY2F0KHRoaXMuX2RhdGEsIHRoaXMuX3RvdGFsTGVuZ3RoKTtcblx0XHR0aGlzLl9kYXRhLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fdG90YWxMZW5ndGggPSAwO1xuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRwcml2YXRlIF93cml0ZVNvb24oaGVhZGVyOiBWU0J1ZmZlciwgZGF0YTogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYnVmZmVyQWRkKGhlYWRlciwgZGF0YSkpIHtcblx0XHRcdHRoaXMuX3NjaGVkdWxlV3JpdGluZygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlTm93VGltZW91dDogVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9zY2hlZHVsZVdyaXRpbmcoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dyaXRlTm93VGltZW91dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl93cml0ZU5vd1RpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3dyaXRlTm93VGltZW91dCA9IG51bGw7XG5cdFx0XHR0aGlzLl93cml0ZU5vdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfd3JpdGVOb3coKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3RvdGFsTGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc1BhdXNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkYXRhID0gdGhpcy5fYnVmZmVyVGFrZSgpO1xuXHRcdHRoaXMuX3NvY2tldC50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLlByb3RvY29sV3JpdGUsIHsgYnl0ZUxlbmd0aDogZGF0YS5ieXRlTGVuZ3RoIH0pO1xuXHRcdHRoaXMuX3NvY2tldC53cml0ZShkYXRhKTtcblx0fVxufVxuXG4vKipcbiAqIEEgbWVzc2FnZSBoYXMgdGhlIGZvbGxvd2luZyBmb3JtYXQ6XG4gKiBgYGBcbiAqICAgICAvLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS1cXFxuICogICAgIHwgICAgICAgICAgICAgSEVBREVSICAgICAgICAgICAgfCAgICAgIHxcbiAqICAgICB8LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwgREFUQSB8XG4gKiAgICAgfCBUWVBFIHwgSUQgfCBBQ0sgfCBEQVRBX0xFTkdUSCB8ICAgICAgfFxuICogICAgIFxcLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0vXG4gKiBgYGBcbiAqIFRoZSBoZWFkZXIgaXMgOSBieXRlcyBhbmQgY29uc2lzdHMgb2Y6XG4gKiAgLSBUWVBFIGlzIDEgYnl0ZSAoUHJvdG9jb2xNZXNzYWdlVHlwZSkgLSB0aGUgbWVzc2FnZSB0eXBlXG4gKiAgLSBJRCBpcyA0IGJ5dGVzICh1MzJiZSkgLSB0aGUgbWVzc2FnZSBpZCAoY2FuIGJlIDAgdG8gaW5kaWNhdGUgdG8gYmUgaWdub3JlZClcbiAqICAtIEFDSyBpcyA0IGJ5dGVzICh1MzJiZSkgLSB0aGUgYWNrbm93bGVkZ2VkIG1lc3NhZ2UgaWQgKGNhbiBiZSAwIHRvIGluZGljYXRlIHRvIGJlIGlnbm9yZWQpXG4gKiAgLSBEQVRBX0xFTkdUSCBpcyA0IGJ5dGVzICh1MzJiZSkgLSB0aGUgbGVuZ3RoIGluIGJ5dGVzIG9mIERBVEFcbiAqXG4gKiBPbmx5IFJlZ3VsYXIgbWVzc2FnZXMgYXJlIGNvdW50ZWQsIG90aGVyIG1lc3NhZ2VzIGFyZSBub3QgY291bnRlZCwgbm9yIGFja25vd2xlZGdlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIFByb3RvY29sIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIHtcblxuXHRwcml2YXRlIF9zb2NrZXQ6IElTb2NrZXQ7XG5cdHByaXZhdGUgX3NvY2tldFdyaXRlcjogUHJvdG9jb2xXcml0ZXI7XG5cdHByaXZhdGUgX3NvY2tldFJlYWRlcjogUHJvdG9jb2xSZWFkZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25NZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VlNCdWZmZXI+KCkpO1xuXHRyZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PFZTQnVmZmVyPiA9IHRoaXMuX29uTWVzc2FnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRGlzcG9zZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihzb2NrZXQ6IElTb2NrZXQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3NvY2tldCA9IHNvY2tldDtcblx0XHR0aGlzLl9zb2NrZXRXcml0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUHJvdG9jb2xXcml0ZXIodGhpcy5fc29ja2V0KSk7XG5cdFx0dGhpcy5fc29ja2V0UmVhZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb3RvY29sUmVhZGVyKHRoaXMuX3NvY2tldCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc29ja2V0UmVhZGVyLm9uTWVzc2FnZSgobXNnKSA9PiB7XG5cdFx0XHRpZiAobXNnLnR5cGUgPT09IFByb3RvY29sTWVzc2FnZVR5cGUuUmVndWxhcikge1xuXHRcdFx0XHR0aGlzLl9vbk1lc3NhZ2UuZmlyZShtc2cuZGF0YSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc29ja2V0Lm9uQ2xvc2UoKCkgPT4gdGhpcy5fb25EaWREaXNwb3NlLmZpcmUoKSkpO1xuXHR9XG5cblx0ZHJhaW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvY2tldFdyaXRlci5kcmFpbigpO1xuXHR9XG5cblx0Z2V0U29ja2V0KCk6IElTb2NrZXQge1xuXHRcdHJldHVybiB0aGlzLl9zb2NrZXQ7XG5cdH1cblxuXHRzZW5kRGlzY29ubmVjdCgpOiB2b2lkIHtcblx0XHQvLyBOb3RoaW5nIHRvIGRvLi4uXG5cdH1cblxuXHRzZW5kKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9zb2NrZXRXcml0ZXIud3JpdGUobmV3IFByb3RvY29sTWVzc2FnZShQcm90b2NvbE1lc3NhZ2VUeXBlLlJlZ3VsYXIsIDAsIDAsIGJ1ZmZlcikpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDbGllbnQ8VENvbnRleHQgPSBzdHJpbmc+IGV4dGVuZHMgSVBDQ2xpZW50PFRDb250ZXh0PiB7XG5cblx0c3RhdGljIGZyb21Tb2NrZXQ8VENvbnRleHQgPSBzdHJpbmc+KHNvY2tldDogSVNvY2tldCwgaWQ6IFRDb250ZXh0KTogQ2xpZW50PFRDb250ZXh0PiB7XG5cdFx0cmV0dXJuIG5ldyBDbGllbnQobmV3IFByb3RvY29sKHNvY2tldCksIGlkKTtcblx0fVxuXG5cdGdldCBvbkRpZERpc3Bvc2UoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5wcm90b2NvbC5vbkRpZERpc3Bvc2U7IH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHByb3RvY29sOiBQcm90b2NvbCB8IFBlcnNpc3RlbnRQcm90b2NvbCwgaWQ6IFRDb250ZXh0LCBpcGNMb2dnZXI6IElJUENMb2dnZXIgfCBudWxsID0gbnVsbCkge1xuXHRcdHN1cGVyKHByb3RvY29sLCBpZCwgaXBjTG9nZ2VyKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGNvbnN0IHNvY2tldCA9IHRoaXMucHJvdG9jb2wuZ2V0U29ja2V0KCk7XG5cdFx0Ly8gc2hvdWxkIGJlIHNlbnQgZ3JhY2VmdWxseSB3aXRoIGEgLmZsdXNoKCksIGJ1dCB0cnkgdG8gc2VuZCBpdCBvdXQgYXMgYVxuXHRcdC8vIGxhc3QgcmVzb3J0IGhlcmUgaWYgbm90aGluZyBlbHNlOlxuXHRcdHRoaXMucHJvdG9jb2wuc2VuZERpc2Nvbm5lY3QoKTtcblx0XHR0aGlzLnByb3RvY29sLmRpc3Bvc2UoKTtcblx0XHRzb2NrZXQuZW5kKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBXaWxsIGVuc3VyZSBubyBtZXNzYWdlcyBhcmUgbG9zdCBpZiB0aGVyZSBhcmUgbm8gZXZlbnQgbGlzdGVuZXJzLlxuICovXG5leHBvcnQgY2xhc3MgQnVmZmVyZWRFbWl0dGVyPFQ+IHtcblx0cHJpdmF0ZSBfZW1pdHRlcjogRW1pdHRlcjxUPjtcblx0cHVibGljIHJlYWRvbmx5IGV2ZW50OiBFdmVudDxUPjtcblxuXHRwcml2YXRlIF9oYXNMaXN0ZW5lcnMgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNEZWxpdmVyaW5nTWVzc2FnZXMgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYnVmZmVyZWRNZXNzYWdlczogVFtdID0gW107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fZW1pdHRlciA9IG5ldyBFbWl0dGVyPFQ+KHtcblx0XHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5faGFzTGlzdGVuZXJzID0gdHJ1ZTtcblx0XHRcdFx0Ly8gaXQgaXMgaW1wb3J0YW50IHRvIGRlbGl2ZXIgdGhlc2UgbWVzc2FnZXMgYWZ0ZXIgdGhpcyBjYWxsLCBidXQgYmVmb3JlXG5cdFx0XHRcdC8vIG90aGVyIG1lc3NhZ2VzIGhhdmUgYSBjaGFuY2UgdG8gYmUgcmVjZWl2ZWQgKHRvIGd1YXJhbnRlZSBpbiBvcmRlciBkZWxpdmVyeSlcblx0XHRcdFx0Ly8gdGhhdCdzIHdoeSB3ZSdyZSB1c2luZyBoZXJlIHF1ZXVlTWljcm90YXNrIGFuZCBub3Qgb3RoZXIgdHlwZXMgb2YgdGltZW91dHNcblx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gdGhpcy5fZGVsaXZlck1lc3NhZ2VzKCkpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2hhc0xpc3RlbmVycyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5ldmVudCA9IHRoaXMuX2VtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZWxpdmVyTWVzc2FnZXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGVsaXZlcmluZ01lc3NhZ2VzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzRGVsaXZlcmluZ01lc3NhZ2VzID0gdHJ1ZTtcblx0XHR3aGlsZSAodGhpcy5faGFzTGlzdGVuZXJzICYmIHRoaXMuX2J1ZmZlcmVkTWVzc2FnZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fZW1pdHRlci5maXJlKHRoaXMuX2J1ZmZlcmVkTWVzc2FnZXMuc2hpZnQoKSEpO1xuXHRcdH1cblx0XHR0aGlzLl9pc0RlbGl2ZXJpbmdNZXNzYWdlcyA9IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGZpcmUoZXZlbnQ6IFQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGFzTGlzdGVuZXJzKSB7XG5cdFx0XHRpZiAodGhpcy5fYnVmZmVyZWRNZXNzYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2J1ZmZlcmVkTWVzc2FnZXMucHVzaChldmVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9lbWl0dGVyLmZpcmUoZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9idWZmZXJlZE1lc3NhZ2VzLnB1c2goZXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmbHVzaEJ1ZmZlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9idWZmZXJlZE1lc3NhZ2VzID0gW107XG5cdH1cbn1cblxuY2xhc3MgUXVldWVFbGVtZW50PFQ+IHtcblx0cHVibGljIHJlYWRvbmx5IGRhdGE6IFQ7XG5cdHB1YmxpYyBuZXh0OiBRdWV1ZUVsZW1lbnQ8VD4gfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKGRhdGE6IFQpIHtcblx0XHR0aGlzLmRhdGEgPSBkYXRhO1xuXHRcdHRoaXMubmV4dCA9IG51bGw7XG5cdH1cbn1cblxuY2xhc3MgUXVldWU8VD4ge1xuXG5cdHByaXZhdGUgX2ZpcnN0OiBRdWV1ZUVsZW1lbnQ8VD4gfCBudWxsO1xuXHRwcml2YXRlIF9sYXN0OiBRdWV1ZUVsZW1lbnQ8VD4gfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2ZpcnN0ID0gbnVsbDtcblx0XHR0aGlzLl9sYXN0ID0gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRsZXQgcmVzdWx0ID0gMDtcblx0XHRsZXQgY3VycmVudCA9IHRoaXMuX2ZpcnN0O1xuXHRcdHdoaWxlIChjdXJyZW50KSB7XG5cdFx0XHRjdXJyZW50ID0gY3VycmVudC5uZXh0O1xuXHRcdFx0cmVzdWx0Kys7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgcGVlaygpOiBUIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9maXJzdCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9maXJzdC5kYXRhO1xuXHR9XG5cblx0cHVibGljIHRvQXJyYXkoKTogVFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFRbXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXHRcdGxldCBpdCA9IHRoaXMuX2ZpcnN0O1xuXHRcdHdoaWxlIChpdCkge1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IGl0LmRhdGE7XG5cdFx0XHRpdCA9IGl0Lm5leHQ7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgcG9wKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZmlyc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2ZpcnN0ID09PSB0aGlzLl9sYXN0KSB7XG5cdFx0XHR0aGlzLl9maXJzdCA9IG51bGw7XG5cdFx0XHR0aGlzLl9sYXN0ID0gbnVsbDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZmlyc3QgPSB0aGlzLl9maXJzdC5uZXh0O1xuXHR9XG5cblx0cHVibGljIHB1c2goaXRlbTogVCk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBuZXcgUXVldWVFbGVtZW50KGl0ZW0pO1xuXHRcdGlmICghdGhpcy5fZmlyc3QpIHtcblx0XHRcdHRoaXMuX2ZpcnN0ID0gZWxlbWVudDtcblx0XHRcdHRoaXMuX2xhc3QgPSBlbGVtZW50O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0IS5uZXh0ID0gZWxlbWVudDtcblx0XHR0aGlzLl9sYXN0ID0gZWxlbWVudDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTG9hZEVzdGltYXRvciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX0hJU1RPUllfTEVOR1RIID0gMTA7XG5cdHByaXZhdGUgc3RhdGljIF9JTlNUQU5DRTogTG9hZEVzdGltYXRvciB8IG51bGwgPSBudWxsO1xuXHRwdWJsaWMgc3RhdGljIGdldEluc3RhbmNlKCk6IExvYWRFc3RpbWF0b3Ige1xuXHRcdGlmICghTG9hZEVzdGltYXRvci5fSU5TVEFOQ0UpIHtcblx0XHRcdExvYWRFc3RpbWF0b3IuX0lOU1RBTkNFID0gbmV3IExvYWRFc3RpbWF0b3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIExvYWRFc3RpbWF0b3IuX0lOU1RBTkNFO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXN0UnVuczogbnVtYmVyW107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5sYXN0UnVucyA9IFtdO1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBMb2FkRXN0aW1hdG9yLl9ISVNUT1JZX0xFTkdUSDsgaSsrKSB7XG5cdFx0XHR0aGlzLmxhc3RSdW5zW2ldID0gbm93IC0gMTAwMCAqIGk7XG5cdFx0fVxuXHRcdHNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSBMb2FkRXN0aW1hdG9yLl9ISVNUT1JZX0xFTkdUSDsgaSA+PSAxOyBpLS0pIHtcblx0XHRcdFx0dGhpcy5sYXN0UnVuc1tpXSA9IHRoaXMubGFzdFJ1bnNbaSAtIDFdO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sYXN0UnVuc1swXSA9IERhdGUubm93KCk7XG5cdFx0fSwgMTAwMCk7XG5cdH1cblxuXHQvKipcblx0ICogcmV0dXJucyBhbiBlc3RpbWF0aXZlIG51bWJlciwgZnJvbSAwIChsb3cgbG9hZCkgdG8gMSAoaGlnaCBsb2FkKVxuXHQgKi9cblx0cHJpdmF0ZSBsb2FkKCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBoaXN0b3J5TGltaXQgPSAoMSArIExvYWRFc3RpbWF0b3IuX0hJU1RPUllfTEVOR1RIKSAqIDEwMDA7XG5cdFx0bGV0IHNjb3JlID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IExvYWRFc3RpbWF0b3IuX0hJU1RPUllfTEVOR1RIOyBpKyspIHtcblx0XHRcdGlmIChub3cgLSB0aGlzLmxhc3RSdW5zW2ldIDw9IGhpc3RvcnlMaW1pdCkge1xuXHRcdFx0XHRzY29yZSsrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gMSAtIHNjb3JlIC8gTG9hZEVzdGltYXRvci5fSElTVE9SWV9MRU5HVEg7XG5cdH1cblxuXHRwdWJsaWMgaGFzSGlnaExvYWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubG9hZCgpID49IDAuNTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMb2FkRXN0aW1hdG9yIHtcblx0aGFzSGlnaExvYWQoKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQZXJzaXN0ZW50UHJvdG9jb2xPcHRpb25zIHtcblx0LyoqXG5cdCAqIFRoZSBzb2NrZXQgdG8gdXNlLlxuXHQgKi9cblx0c29ja2V0OiBJU29ja2V0O1xuXHQvKipcblx0ICogVGhlIGluaXRpYWwgY2h1bmsgb2YgZGF0YSB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gcmVjZWl2ZWQgZnJvbSB0aGUgc29ja2V0LlxuXHQgKi9cblx0aW5pdGlhbENodW5rPzogVlNCdWZmZXIgfCBudWxsO1xuXHQvKipcblx0ICogVGhlIENQVSBsb2FkIGVzdGltYXRvciB0byB1c2UuXG5cdCAqL1xuXHRsb2FkRXN0aW1hdG9yPzogSUxvYWRFc3RpbWF0b3I7XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRvIHNlbmQga2VlcCBhbGl2ZSBtZXNzYWdlcy4gRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHNlbmRLZWVwQWxpdmU/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFNhbWUgYXMgUHJvdG9jb2wsIGJ1dCB3aWxsIGFjdHVhbGx5IHRyYWNrIG1lc3NhZ2VzIGFuZCBhY2tzLlxuICogTW9yZW92ZXIsIGl0IHdpbGwgZW5zdXJlIG5vIG1lc3NhZ2VzIGFyZSBsb3N0IGlmIHRoZXJlIGFyZSBubyBldmVudCBsaXN0ZW5lcnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBQZXJzaXN0ZW50UHJvdG9jb2wgaW1wbGVtZW50cyBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCB7XG5cblx0cHJpdmF0ZSBfaXNSZWNvbm5lY3Rpbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgX2RpZFNlbmREaXNjb25uZWN0PzogYm9vbGVhbjtcblxuXHRwcml2YXRlIF9vdXRnb2luZ1VuYWNrTXNnOiBRdWV1ZTxQcm90b2NvbE1lc3NhZ2U+O1xuXHRwcml2YXRlIF9vdXRnb2luZ01zZ0lkOiBudW1iZXI7XG5cdHByaXZhdGUgX291dGdvaW5nQWNrSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfb3V0Z29pbmdBY2tUaW1lb3V0OiBUaW1lb3V0IHwgbnVsbDtcblxuXHRwcml2YXRlIF9pbmNvbWluZ01zZ0lkOiBudW1iZXI7XG5cdHByaXZhdGUgX2luY29taW5nQWNrSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfaW5jb21pbmdNc2dMYXN0VGltZTogbnVtYmVyO1xuXHRwcml2YXRlIF9pbmNvbWluZ0Fja1RpbWVvdXQ6IFRpbWVvdXQgfCBudWxsO1xuXG5cdHByaXZhdGUgX2tlZXBBbGl2ZUludGVydmFsOiBUaW1lb3V0IHwgbnVsbDtcblxuXHRwcml2YXRlIF9sYXN0UmVwbGF5UmVxdWVzdFRpbWU6IG51bWJlcjtcblx0cHJpdmF0ZSBfbGFzdFNvY2tldFRpbWVvdXRUaW1lOiBudW1iZXI7XG5cblx0cHJpdmF0ZSBfc29ja2V0OiBJU29ja2V0O1xuXHRwcml2YXRlIF9zb2NrZXRXcml0ZXI6IFByb3RvY29sV3JpdGVyO1xuXHRwcml2YXRlIF9zb2NrZXRSZWFkZXI6IFByb3RvY29sUmVhZGVyO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1wb3RlbnRpYWxseS11bnNhZmUtZGlzcG9zYWJsZXNcblx0cHJpdmF0ZSBfc29ja2V0RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2FkRXN0aW1hdG9yOiBJTG9hZEVzdGltYXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2hvdWxkU2VuZEtlZXBBbGl2ZTogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbnRyb2xNZXNzYWdlID0gbmV3IEJ1ZmZlcmVkRW1pdHRlcjxWU0J1ZmZlcj4oKTtcblx0cmVhZG9ubHkgb25Db250cm9sTWVzc2FnZTogRXZlbnQ8VlNCdWZmZXI+ID0gdGhpcy5fb25Db250cm9sTWVzc2FnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSBuZXcgQnVmZmVyZWRFbWl0dGVyPFZTQnVmZmVyPigpO1xuXHRyZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PFZTQnVmZmVyPiA9IHRoaXMuX29uTWVzc2FnZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSBuZXcgQnVmZmVyZWRFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZERpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Tb2NrZXRDbG9zZSA9IG5ldyBCdWZmZXJlZEVtaXR0ZXI8U29ja2V0Q2xvc2VFdmVudD4oKTtcblx0cmVhZG9ubHkgb25Tb2NrZXRDbG9zZTogRXZlbnQ8U29ja2V0Q2xvc2VFdmVudD4gPSB0aGlzLl9vblNvY2tldENsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU29ja2V0VGltZW91dCA9IG5ldyBCdWZmZXJlZEVtaXR0ZXI8U29ja2V0VGltZW91dEV2ZW50PigpO1xuXHRyZWFkb25seSBvblNvY2tldFRpbWVvdXQ6IEV2ZW50PFNvY2tldFRpbWVvdXRFdmVudD4gPSB0aGlzLl9vblNvY2tldFRpbWVvdXQuZXZlbnQ7XG5cblx0cHVibGljIGdldCB1bmFja25vd2xlZGdlZENvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX291dGdvaW5nTXNnSWQgLSB0aGlzLl9vdXRnb2luZ0Fja0lkO1xuXHR9XG5cblx0Y29uc3RydWN0b3Iob3B0czogUGVyc2lzdGVudFByb3RvY29sT3B0aW9ucykge1xuXHRcdHRoaXMuX2xvYWRFc3RpbWF0b3IgPSBvcHRzLmxvYWRFc3RpbWF0b3IgPz8gTG9hZEVzdGltYXRvci5nZXRJbnN0YW5jZSgpO1xuXHRcdHRoaXMuX3Nob3VsZFNlbmRLZWVwQWxpdmUgPSBvcHRzLnNlbmRLZWVwQWxpdmUgPz8gdHJ1ZTtcblx0XHR0aGlzLl9pc1JlY29ubmVjdGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX291dGdvaW5nVW5hY2tNc2cgPSBuZXcgUXVldWU8UHJvdG9jb2xNZXNzYWdlPigpO1xuXHRcdHRoaXMuX291dGdvaW5nTXNnSWQgPSAwO1xuXHRcdHRoaXMuX291dGdvaW5nQWNrSWQgPSAwO1xuXHRcdHRoaXMuX291dGdvaW5nQWNrVGltZW91dCA9IG51bGw7XG5cblx0XHR0aGlzLl9pbmNvbWluZ01zZ0lkID0gMDtcblx0XHR0aGlzLl9pbmNvbWluZ0Fja0lkID0gMDtcblx0XHR0aGlzLl9pbmNvbWluZ01zZ0xhc3RUaW1lID0gMDtcblx0XHR0aGlzLl9pbmNvbWluZ0Fja1RpbWVvdXQgPSBudWxsO1xuXG5cdFx0dGhpcy5fbGFzdFJlcGxheVJlcXVlc3RUaW1lID0gMDtcblx0XHR0aGlzLl9sYXN0U29ja2V0VGltZW91dFRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0dGhpcy5fc29ja2V0RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fc29ja2V0ID0gb3B0cy5zb2NrZXQ7XG5cdFx0dGhpcy5fc29ja2V0V3JpdGVyID0gdGhpcy5fc29ja2V0RGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFdyaXRlcih0aGlzLl9zb2NrZXQpKTtcblx0XHR0aGlzLl9zb2NrZXRSZWFkZXIgPSB0aGlzLl9zb2NrZXREaXNwb3NhYmxlcy5hZGQobmV3IFByb3RvY29sUmVhZGVyKHRoaXMuX3NvY2tldCkpO1xuXHRcdHRoaXMuX3NvY2tldERpc3Bvc2FibGVzLmFkZCh0aGlzLl9zb2NrZXRSZWFkZXIub25NZXNzYWdlKG1zZyA9PiB0aGlzLl9yZWNlaXZlTWVzc2FnZShtc2cpKSk7XG5cdFx0dGhpcy5fc29ja2V0RGlzcG9zYWJsZXMuYWRkKHRoaXMuX3NvY2tldC5vbkNsb3NlKGUgPT4gdGhpcy5fb25Tb2NrZXRDbG9zZS5maXJlKGUpKSk7XG5cblx0XHRpZiAob3B0cy5pbml0aWFsQ2h1bmspIHtcblx0XHRcdHRoaXMuX3NvY2tldFJlYWRlci5hY2NlcHRDaHVuayhvcHRzLmluaXRpYWxDaHVuayk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3Nob3VsZFNlbmRLZWVwQWxpdmUpIHtcblx0XHRcdHRoaXMuX2tlZXBBbGl2ZUludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zZW5kS2VlcEFsaXZlKCk7XG5cdFx0XHR9LCBQcm90b2NvbENvbnN0YW50cy5LZWVwQWxpdmVTZW5kVGltZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2tlZXBBbGl2ZUludGVydmFsID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9vdXRnb2luZ0Fja1RpbWVvdXQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9vdXRnb2luZ0Fja1RpbWVvdXQpO1xuXHRcdFx0dGhpcy5fb3V0Z29pbmdBY2tUaW1lb3V0ID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2luY29taW5nQWNrVGltZW91dCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2luY29taW5nQWNrVGltZW91dCk7XG5cdFx0XHR0aGlzLl9pbmNvbWluZ0Fja1RpbWVvdXQgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fa2VlcEFsaXZlSW50ZXJ2YWwpIHtcblx0XHRcdGNsZWFySW50ZXJ2YWwodGhpcy5fa2VlcEFsaXZlSW50ZXJ2YWwpO1xuXHRcdFx0dGhpcy5fa2VlcEFsaXZlSW50ZXJ2YWwgPSBudWxsO1xuXHRcdH1cblx0XHR0aGlzLl9zb2NrZXREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRkcmFpbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc29ja2V0V3JpdGVyLmRyYWluKCk7XG5cdH1cblxuXHRzZW5kRGlzY29ubmVjdCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2RpZFNlbmREaXNjb25uZWN0KSB7XG5cdFx0XHR0aGlzLl9kaWRTZW5kRGlzY29ubmVjdCA9IHRydWU7XG5cdFx0XHRjb25zdCBtc2cgPSBuZXcgUHJvdG9jb2xNZXNzYWdlKFByb3RvY29sTWVzc2FnZVR5cGUuRGlzY29ubmVjdCwgMCwgMCwgZ2V0RW1wdHlCdWZmZXIoKSk7XG5cdFx0XHR0aGlzLl9zb2NrZXRXcml0ZXIud3JpdGUobXNnKTtcblx0XHRcdHRoaXMuX3NvY2tldFdyaXRlci5mbHVzaCgpO1xuXHRcdH1cblx0fVxuXG5cdHNlbmRQYXVzZSgpOiB2b2lkIHtcblx0XHRjb25zdCBtc2cgPSBuZXcgUHJvdG9jb2xNZXNzYWdlKFByb3RvY29sTWVzc2FnZVR5cGUuUGF1c2UsIDAsIDAsIGdldEVtcHR5QnVmZmVyKCkpO1xuXHRcdHRoaXMuX3NvY2tldFdyaXRlci53cml0ZShtc2cpO1xuXHR9XG5cblx0c2VuZFJlc3VtZSgpOiB2b2lkIHtcblx0XHRjb25zdCBtc2cgPSBuZXcgUHJvdG9jb2xNZXNzYWdlKFByb3RvY29sTWVzc2FnZVR5cGUuUmVzdW1lLCAwLCAwLCBnZXRFbXB0eUJ1ZmZlcigpKTtcblx0XHR0aGlzLl9zb2NrZXRXcml0ZXIud3JpdGUobXNnKTtcblx0fVxuXG5cdHBhdXNlU29ja2V0V3JpdGluZygpIHtcblx0XHR0aGlzLl9zb2NrZXRXcml0ZXIucGF1c2UoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTb2NrZXQoKTogSVNvY2tldCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvY2tldDtcblx0fVxuXG5cdHB1YmxpYyBnZXRNaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMuX3NvY2tldFJlYWRlci5sYXN0UmVhZFRpbWU7XG5cdH1cblxuXHRwdWJsaWMgYmVnaW5BY2NlcHRSZWNvbm5lY3Rpb24oc29ja2V0OiBJU29ja2V0LCBpbml0aWFsRGF0YUNodW5rOiBWU0J1ZmZlciB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9pc1JlY29ubmVjdGluZyA9IHRydWU7XG5cblx0XHR0aGlzLl9zb2NrZXREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc29ja2V0RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fb25Db250cm9sTWVzc2FnZS5mbHVzaEJ1ZmZlcigpO1xuXHRcdHRoaXMuX29uU29ja2V0Q2xvc2UuZmx1c2hCdWZmZXIoKTtcblx0XHR0aGlzLl9vblNvY2tldFRpbWVvdXQuZmx1c2hCdWZmZXIoKTtcblx0XHR0aGlzLl9zb2NrZXQuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fbGFzdFJlcGxheVJlcXVlc3RUaW1lID0gMDtcblx0XHR0aGlzLl9sYXN0U29ja2V0VGltZW91dFRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0dGhpcy5fc29ja2V0ID0gc29ja2V0O1xuXHRcdHRoaXMuX3NvY2tldFdyaXRlciA9IHRoaXMuX3NvY2tldERpc3Bvc2FibGVzLmFkZChuZXcgUHJvdG9jb2xXcml0ZXIodGhpcy5fc29ja2V0KSk7XG5cdFx0dGhpcy5fc29ja2V0UmVhZGVyID0gdGhpcy5fc29ja2V0RGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFJlYWRlcih0aGlzLl9zb2NrZXQpKTtcblx0XHR0aGlzLl9zb2NrZXREaXNwb3NhYmxlcy5hZGQodGhpcy5fc29ja2V0UmVhZGVyLm9uTWVzc2FnZShtc2cgPT4gdGhpcy5fcmVjZWl2ZU1lc3NhZ2UobXNnKSkpO1xuXHRcdHRoaXMuX3NvY2tldERpc3Bvc2FibGVzLmFkZCh0aGlzLl9zb2NrZXQub25DbG9zZShlID0+IHRoaXMuX29uU29ja2V0Q2xvc2UuZmlyZShlKSkpO1xuXG5cdFx0dGhpcy5fc29ja2V0UmVhZGVyLmFjY2VwdENodW5rKGluaXRpYWxEYXRhQ2h1bmspO1xuXHR9XG5cblx0cHVibGljIGVuZEFjY2VwdFJlY29ubmVjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9pc1JlY29ubmVjdGluZyA9IGZhbHNlO1xuXG5cdFx0Ly8gQWZ0ZXIgYSByZWNvbm5lY3Rpb24sIGxldCB0aGUgb3RoZXIgcGFydHkga25vdyAoYWdhaW4pIHdoaWNoIG1lc3NhZ2VzIGhhdmUgYmVlbiByZWNlaXZlZC5cblx0XHQvLyAocGVyaGFwcyB0aGUgb3RoZXIgcGFydHkgZGlkbid0IHJlY2VpdmUgYSBwcmV2aW91cyBBQ0spXG5cdFx0dGhpcy5faW5jb21pbmdBY2tJZCA9IHRoaXMuX2luY29taW5nTXNnSWQ7XG5cdFx0Y29uc3QgbXNnID0gbmV3IFByb3RvY29sTWVzc2FnZShQcm90b2NvbE1lc3NhZ2VUeXBlLkFjaywgMCwgdGhpcy5faW5jb21pbmdBY2tJZCwgZ2V0RW1wdHlCdWZmZXIoKSk7XG5cdFx0dGhpcy5fc29ja2V0V3JpdGVyLndyaXRlKG1zZyk7XG5cblx0XHQvLyBTZW5kIGFnYWluIGFsbCB1bmFja25vd2xlZGdlZCBtZXNzYWdlc1xuXHRcdGNvbnN0IHRvU2VuZCA9IHRoaXMuX291dGdvaW5nVW5hY2tNc2cudG9BcnJheSgpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0b1NlbmQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHRoaXMuX3NvY2tldFdyaXRlci53cml0ZSh0b1NlbmRbaV0pO1xuXHRcdH1cblx0XHR0aGlzLl9yZWN2QWNrQ2hlY2soKTtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHREaXNjb25uZWN0KCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNlaXZlTWVzc2FnZShtc2c6IFByb3RvY29sTWVzc2FnZSk6IHZvaWQge1xuXHRcdGlmIChtc2cuYWNrID4gdGhpcy5fb3V0Z29pbmdBY2tJZCkge1xuXHRcdFx0dGhpcy5fb3V0Z29pbmdBY2tJZCA9IG1zZy5hY2s7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdGNvbnN0IGZpcnN0ID0gdGhpcy5fb3V0Z29pbmdVbmFja01zZy5wZWVrKCk7XG5cdFx0XHRcdGlmIChmaXJzdCAmJiBmaXJzdC5pZCA8PSBtc2cuYWNrKSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyBtZXNzYWdlIGhhcyBiZWVuIGNvbmZpcm1lZCwgcmVtb3ZlIGl0XG5cdFx0XHRcdFx0dGhpcy5fb3V0Z29pbmdVbmFja01zZy5wb3AoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSB3aGlsZSAodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChtc2cudHlwZSkge1xuXHRcdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLk5vbmU6IHtcblx0XHRcdFx0Ly8gTi9BXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLlJlZ3VsYXI6IHtcblx0XHRcdFx0aWYgKG1zZy5pZCA+IHRoaXMuX2luY29taW5nTXNnSWQpIHtcblx0XHRcdFx0XHRpZiAobXNnLmlkICE9PSB0aGlzLl9pbmNvbWluZ01zZ0lkICsgMSkge1xuXHRcdFx0XHRcdFx0Ly8gaW4gY2FzZSB3ZSBtaXNzZWQgc29tZSBtZXNzYWdlcyB3ZSBhc2sgdGhlIG90aGVyIHBhcnR5IHRvIHJlc2VuZCB0aGVtXG5cdFx0XHRcdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRcdFx0aWYgKG5vdyAtIHRoaXMuX2xhc3RSZXBsYXlSZXF1ZXN0VGltZSA+IDEwMDAwKSB7XG5cdFx0XHRcdFx0XHRcdC8vIHNlbmQgYSByZXBsYXkgcmVxdWVzdCBhdCBtb3N0IG9uY2UgZXZlcnkgMTBzXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xhc3RSZXBsYXlSZXF1ZXN0VGltZSA9IG5vdztcblx0XHRcdFx0XHRcdFx0dGhpcy5fc29ja2V0V3JpdGVyLndyaXRlKG5ldyBQcm90b2NvbE1lc3NhZ2UoUHJvdG9jb2xNZXNzYWdlVHlwZS5SZXBsYXlSZXF1ZXN0LCAwLCAwLCBnZXRFbXB0eUJ1ZmZlcigpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2luY29taW5nTXNnSWQgPSBtc2cuaWQ7XG5cdFx0XHRcdFx0XHR0aGlzLl9pbmNvbWluZ01zZ0xhc3RUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0XHRcdHRoaXMuX3NlbmRBY2tDaGVjaygpO1xuXHRcdFx0XHRcdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUobXNnLmRhdGEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5Db250cm9sOiB7XG5cdFx0XHRcdHRoaXMuX29uQ29udHJvbE1lc3NhZ2UuZmlyZShtc2cuZGF0YSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLkFjazoge1xuXHRcdFx0XHQvLyBub3RoaW5nIHRvIGRvLCAuYWNrIGlzIGhhbmRsZWQgYWJvdmUgYWxyZWFkeVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUHJvdG9jb2xNZXNzYWdlVHlwZS5EaXNjb25uZWN0OiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLlJlcGxheVJlcXVlc3Q6IHtcblx0XHRcdFx0Ly8gU2VuZCBhZ2FpbiBhbGwgdW5hY2tub3dsZWRnZWQgbWVzc2FnZXNcblx0XHRcdFx0Y29uc3QgdG9TZW5kID0gdGhpcy5fb3V0Z29pbmdVbmFja01zZy50b0FycmF5KCk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0b1NlbmQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHR0aGlzLl9zb2NrZXRXcml0ZXIud3JpdGUodG9TZW5kW2ldKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9yZWN2QWNrQ2hlY2soKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb3RvY29sTWVzc2FnZVR5cGUuUGF1c2U6IHtcblx0XHRcdFx0dGhpcy5fc29ja2V0V3JpdGVyLnBhdXNlKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLlJlc3VtZToge1xuXHRcdFx0XHR0aGlzLl9zb2NrZXRXcml0ZXIucmVzdW1lKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm90b2NvbE1lc3NhZ2VUeXBlLktlZXBBbGl2ZToge1xuXHRcdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlYWRFbnRpcmVCdWZmZXIoKTogVlNCdWZmZXIge1xuXHRcdHJldHVybiB0aGlzLl9zb2NrZXRSZWFkZXIucmVhZEVudGlyZUJ1ZmZlcigpO1xuXHR9XG5cblx0Zmx1c2goKTogdm9pZCB7XG5cdFx0dGhpcy5fc29ja2V0V3JpdGVyLmZsdXNoKCk7XG5cdH1cblxuXHRzZW5kKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRjb25zdCBteUlkID0gKyt0aGlzLl9vdXRnb2luZ01zZ0lkO1xuXHRcdHRoaXMuX2luY29taW5nQWNrSWQgPSB0aGlzLl9pbmNvbWluZ01zZ0lkO1xuXHRcdGNvbnN0IG1zZyA9IG5ldyBQcm90b2NvbE1lc3NhZ2UoUHJvdG9jb2xNZXNzYWdlVHlwZS5SZWd1bGFyLCBteUlkLCB0aGlzLl9pbmNvbWluZ0Fja0lkLCBidWZmZXIpO1xuXHRcdHRoaXMuX291dGdvaW5nVW5hY2tNc2cucHVzaChtc2cpO1xuXHRcdGlmICghdGhpcy5faXNSZWNvbm5lY3RpbmcpIHtcblx0XHRcdHRoaXMuX3NvY2tldFdyaXRlci53cml0ZShtc2cpO1xuXHRcdFx0dGhpcy5fcmVjdkFja0NoZWNrKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYSBtZXNzYWdlIHdoaWNoIHdpbGwgbm90IGJlIHBhcnQgb2YgdGhlIHJlZ3VsYXIgYWNrbm93bGVkZ2UgZmxvdy5cblx0ICogVXNlIHRoaXMgZm9yIGVhcmx5IGNvbnRyb2wgbWVzc2FnZXMgd2hpY2ggYXJlIHJlcGVhdGVkIGluIGNhc2Ugb2YgcmVjb25uZWN0aW9uLlxuXHQgKi9cblx0c2VuZENvbnRyb2woYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdGNvbnN0IG1zZyA9IG5ldyBQcm90b2NvbE1lc3NhZ2UoUHJvdG9jb2xNZXNzYWdlVHlwZS5Db250cm9sLCAwLCAwLCBidWZmZXIpO1xuXHRcdHRoaXMuX3NvY2tldFdyaXRlci53cml0ZShtc2cpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZEFja0NoZWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pbmNvbWluZ01zZ0lkIDw9IHRoaXMuX2luY29taW5nQWNrSWQpIHtcblx0XHRcdC8vIG5vdGhpbmsgdG8gYWNrbm93bGVkZ2Vcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faW5jb21pbmdBY2tUaW1lb3V0KSB7XG5cdFx0XHQvLyB0aGVyZSB3aWxsIGJlIGEgY2hlY2sgaW4gdGhlIG5lYXIgZnV0dXJlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGltZVNpbmNlTGFzdEluY29taW5nTXNnID0gRGF0ZS5ub3coKSAtIHRoaXMuX2luY29taW5nTXNnTGFzdFRpbWU7XG5cdFx0aWYgKHRpbWVTaW5jZUxhc3RJbmNvbWluZ01zZyA+PSBQcm90b2NvbENvbnN0YW50cy5BY2tub3dsZWRnZVRpbWUpIHtcblx0XHRcdC8vIHN1ZmZpY2llbnQgdGltZSBoYXMgcGFzc2VkIHNpbmNlIHRoaXMgbWVzc2FnZSBoYXMgYmVlbiByZWNlaXZlZCxcblx0XHRcdC8vIGFuZCBubyBtZXNzYWdlIGZyb20gb3VyIHNpZGUgbmVlZGVkIHRvIGJlIHNlbnQgaW4gdGhlIG1lYW50aW1lLFxuXHRcdFx0Ly8gc28gd2Ugd2lsbCBzZW5kIGEgbWVzc2FnZSBjb250YWluaW5nIG9ubHkgYW4gYWNrLlxuXHRcdFx0dGhpcy5fc2VuZEFjaygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2luY29taW5nQWNrVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5faW5jb21pbmdBY2tUaW1lb3V0ID0gbnVsbDtcblx0XHRcdHRoaXMuX3NlbmRBY2tDaGVjaygpO1xuXHRcdH0sIFByb3RvY29sQ29uc3RhbnRzLkFja25vd2xlZGdlVGltZSAtIHRpbWVTaW5jZUxhc3RJbmNvbWluZ01zZyArIDUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjdkFja0NoZWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9vdXRnb2luZ01zZ0lkIDw9IHRoaXMuX291dGdvaW5nQWNrSWQpIHtcblx0XHRcdC8vIGV2ZXJ5dGhpbmcgaGFzIGJlZW4gYWNrbm93bGVkZ2VkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX291dGdvaW5nQWNrVGltZW91dCkge1xuXHRcdFx0Ly8gdGhlcmUgd2lsbCBiZSBhIGNoZWNrIGluIHRoZSBuZWFyIGZ1dHVyZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc1JlY29ubmVjdGluZykge1xuXHRcdFx0Ly8gZG8gbm90IGNhdXNlIGEgdGltZW91dCBkdXJpbmcgcmVjb25uZWN0aW9uLFxuXHRcdFx0Ly8gYmVjYXVzZSBtZXNzYWdlcyB3aWxsIG5vdCBiZSBhY3R1YWxseSB3cml0dGVuIHVudGlsIGBlbmRBY2NlcHRSZWNvbm5lY3Rpb25gXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2xkZXN0VW5hY2tub3dsZWRnZWRNc2cgPSB0aGlzLl9vdXRnb2luZ1VuYWNrTXNnLnBlZWsoKSE7XG5cdFx0Y29uc3QgdGltZVNpbmNlT2xkZXN0VW5hY2tub3dsZWRnZWRNc2cgPSBEYXRlLm5vdygpIC0gb2xkZXN0VW5hY2tub3dsZWRnZWRNc2cud3JpdHRlblRpbWU7XG5cdFx0Y29uc3QgdGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGEgPSBEYXRlLm5vdygpIC0gdGhpcy5fc29ja2V0UmVhZGVyLmxhc3RSZWFkVGltZTtcblx0XHRjb25zdCB0aW1lU2luY2VMYXN0VGltZW91dCA9IERhdGUubm93KCkgLSB0aGlzLl9sYXN0U29ja2V0VGltZW91dFRpbWU7XG5cblx0XHRpZiAoXG5cdFx0XHR0aW1lU2luY2VPbGRlc3RVbmFja25vd2xlZGdlZE1zZyA+PSBQcm90b2NvbENvbnN0YW50cy5UaW1lb3V0VGltZVxuXHRcdFx0JiYgdGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGEgPj0gUHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWVcblx0XHRcdCYmIHRpbWVTaW5jZUxhc3RUaW1lb3V0ID49IFByb3RvY29sQ29uc3RhbnRzLlRpbWVvdXRUaW1lXG5cdFx0KSB7XG5cdFx0XHQvLyBJdCdzIGJlZW4gYSBsb25nIHRpbWUgc2luY2Ugb3VyIHNlbnQgbWVzc2FnZSB3YXMgYWNrbm93bGVkZ2VkXG5cdFx0XHQvLyBhbmQgYSBsb25nIHRpbWUgc2luY2Ugd2UgcmVjZWl2ZWQgc29tZSBkYXRhXG5cblx0XHRcdC8vIEJ1dCB0aGlzIG1pZ2h0IGJlIGNhdXNlZCBieSB0aGUgZXZlbnQgbG9vcCBiZWluZyBidXN5IGFuZCBmYWlsaW5nIHRvIHJlYWQgbWVzc2FnZXNcblx0XHRcdGlmICghdGhpcy5fbG9hZEVzdGltYXRvci5oYXNIaWdoTG9hZCgpKSB7XG5cdFx0XHRcdC8vIFRyYXNoIHRoZSBzb2NrZXRcblx0XHRcdFx0dGhpcy5fbGFzdFNvY2tldFRpbWVvdXRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0dGhpcy5fb25Tb2NrZXRUaW1lb3V0LmZpcmUoe1xuXHRcdFx0XHRcdHJlYXNvbjogU29ja2V0VGltZW91dFJlYXNvbi5VTkFDS05PV0xFREdFRF9NRVNTQUdFLFxuXHRcdFx0XHRcdHVuYWNrbm93bGVkZ2VkTXNnQ291bnQ6IHRoaXMuX291dGdvaW5nVW5hY2tNc2cubGVuZ3RoKCksXG5cdFx0XHRcdFx0dGltZVNpbmNlT2xkZXN0VW5hY2tub3dsZWRnZWRNc2csXG5cdFx0XHRcdFx0dGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGFcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtaW5pbXVtVGltZVVudGlsVGltZW91dCA9IE1hdGgubWF4KFxuXHRcdFx0UHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWUgLSB0aW1lU2luY2VPbGRlc3RVbmFja25vd2xlZGdlZE1zZyxcblx0XHRcdFByb3RvY29sQ29uc3RhbnRzLlRpbWVvdXRUaW1lIC0gdGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGEsXG5cdFx0XHRQcm90b2NvbENvbnN0YW50cy5UaW1lb3V0VGltZSAtIHRpbWVTaW5jZUxhc3RUaW1lb3V0LFxuXHRcdFx0NTAwXG5cdFx0KTtcblxuXHRcdHRoaXMuX291dGdvaW5nQWNrVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb3V0Z29pbmdBY2tUaW1lb3V0ID0gbnVsbDtcblx0XHRcdHRoaXMuX3JlY3ZBY2tDaGVjaygpO1xuXHRcdH0sIG1pbmltdW1UaW1lVW50aWxUaW1lb3V0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgYWZ0ZXIgc2VuZGluZyBhIGtlZXBhbGl2ZS4gQm90aCBzaWRlcyBvZiB0aGlzIHByb3RvY29sIHNlbmRcblx0ICoga2VlcGFsaXZlcyBldmVyeSBLZWVwQWxpdmVTZW5kVGltZSAoNXMpLCBzbyByZWNlaXZpbmcgbm8gZGF0YSBmb3Jcblx0ICogVGltZW91dFRpbWUgKDIwcykgbWVhbnMgdGhlIGNvbm5lY3Rpb24gaXMgZGVhZC4gVGhpcyBjYXRjaGVzIHNpbGVudFxuXHQgKiBjb25uZWN0aW9uIGRlYXRocyB0aGF0IF9yZWN2QWNrQ2hlY2sgY2Fubm90IGRldGVjdCBiZWNhdXNlIHRoZXJlIGFyZVxuXHQgKiBubyB1bmFja25vd2xlZGdlZCByZWd1bGFyIG1lc3NhZ2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBfa2VlcEFsaXZlVGltZW91dENoZWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1JlY29ubmVjdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgdGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGEgPSBub3cgLSB0aGlzLl9zb2NrZXRSZWFkZXIubGFzdFJlYWRUaW1lO1xuXHRcdGNvbnN0IHRpbWVTaW5jZUxhc3RUaW1lb3V0ID0gbm93IC0gdGhpcy5fbGFzdFNvY2tldFRpbWVvdXRUaW1lO1xuXG5cdFx0aWYgKFxuXHRcdFx0dGltZVNpbmNlTGFzdFJlY2VpdmVkU29tZURhdGEgPj0gUHJvdG9jb2xDb25zdGFudHMuVGltZW91dFRpbWVcblx0XHRcdCYmIHRpbWVTaW5jZUxhc3RUaW1lb3V0ID49IFByb3RvY29sQ29uc3RhbnRzLlRpbWVvdXRUaW1lXG5cdFx0KSB7XG5cdFx0XHQvLyBCdXQgdGhpcyBtaWdodCBiZSBjYXVzZWQgYnkgdGhlIGV2ZW50IGxvb3AgYmVpbmcgYnVzeSBhbmQgZmFpbGluZyB0byByZWFkIG1lc3NhZ2VzXG5cdFx0XHRpZiAoIXRoaXMuX2xvYWRFc3RpbWF0b3IuaGFzSGlnaExvYWQoKSkge1xuXHRcdFx0XHR0aGlzLl9sYXN0U29ja2V0VGltZW91dFRpbWUgPSBub3c7XG5cdFx0XHRcdGNvbnN0IHVuYWNrbm93bGVkZ2VkTXNnQ291bnQgPSB0aGlzLl9vdXRnb2luZ1VuYWNrTXNnLmxlbmd0aCgpO1xuXHRcdFx0XHRjb25zdCBvbGRlc3RVbmFja25vd2xlZGdlZE1zZyA9IHRoaXMuX291dGdvaW5nVW5hY2tNc2cucGVlaygpO1xuXHRcdFx0XHR0aGlzLl9vblNvY2tldFRpbWVvdXQuZmlyZSh7XG5cdFx0XHRcdFx0cmVhc29uOiBTb2NrZXRUaW1lb3V0UmVhc29uLktFRVBfQUxJVkUsXG5cdFx0XHRcdFx0dW5hY2tub3dsZWRnZWRNc2dDb3VudCxcblx0XHRcdFx0XHR0aW1lU2luY2VPbGRlc3RVbmFja25vd2xlZGdlZE1zZzogb2xkZXN0VW5hY2tub3dsZWRnZWRNc2cgPyBub3cgLSBvbGRlc3RVbmFja25vd2xlZGdlZE1zZy53cml0dGVuVGltZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0aW1lU2luY2VMYXN0UmVjZWl2ZWRTb21lRGF0YVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kQWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pbmNvbWluZ01zZ0lkIDw9IHRoaXMuX2luY29taW5nQWNrSWQpIHtcblx0XHRcdC8vIG5vdGhpbmsgdG8gYWNrbm93bGVkZ2Vcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pbmNvbWluZ0Fja0lkID0gdGhpcy5faW5jb21pbmdNc2dJZDtcblx0XHRjb25zdCBtc2cgPSBuZXcgUHJvdG9jb2xNZXNzYWdlKFByb3RvY29sTWVzc2FnZVR5cGUuQWNrLCAwLCB0aGlzLl9pbmNvbWluZ0Fja0lkLCBnZXRFbXB0eUJ1ZmZlcigpKTtcblx0XHR0aGlzLl9zb2NrZXRXcml0ZXIud3JpdGUobXNnKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRLZWVwQWxpdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5faW5jb21pbmdBY2tJZCA9IHRoaXMuX2luY29taW5nTXNnSWQ7XG5cdFx0Y29uc3QgbXNnID0gbmV3IFByb3RvY29sTWVzc2FnZShQcm90b2NvbE1lc3NhZ2VUeXBlLktlZXBBbGl2ZSwgMCwgdGhpcy5faW5jb21pbmdBY2tJZCwgZ2V0RW1wdHlCdWZmZXIoKSk7XG5cdFx0dGhpcy5fc29ja2V0V3JpdGVyLndyaXRlKG1zZyk7XG5cdFx0dGhpcy5fa2VlcEFsaXZlVGltZW91dENoZWNrKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUE4QyxpQkFBaUI7QUFFeEQsSUFBVyw2QkFBWCxrQkFBV0EsZ0NBQVg7QUFDTixFQUFBQSw0QkFBQSxhQUFVO0FBQ1YsRUFBQUEsNEJBQUEsVUFBTztBQUNQLEVBQUFBLDRCQUFBLFdBQVE7QUFDUixFQUFBQSw0QkFBQSxVQUFPO0FBQ1AsRUFBQUEsNEJBQUEsV0FBUTtBQUNSLEVBQUFBLDRCQUFBLFdBQVE7QUFFUixFQUFBQSw0QkFBQSxrQ0FBK0I7QUFFL0IsRUFBQUEsNEJBQUEscUJBQWtCO0FBQ2xCLEVBQUFBLDRCQUFBLGlCQUFjO0FBQ2QsRUFBQUEsNEJBQUEsb0JBQWlCO0FBQ2pCLEVBQUFBLDRCQUFBLGtCQUFlO0FBRWYsRUFBQUEsNEJBQUEsc0JBQW1CO0FBQ25CLEVBQUFB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Q0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sMEJBQTBCLEtBQUs7QUFBQSxNQUNwQyx3QkFBZ0M7QUFBQSxNQUNoQyx3QkFBZ0M7QUFBQSxNQUNoQyx3QkFBZ0M7QUFBQSxNQUNoQztBQUFBLElBQ0Q7QUFFQSxTQUFLLHNCQUFzQixXQUFXLE1BQU07QUFDM0MsV0FBSyxzQkFBc0I7QUFDM0IsV0FBSyxjQUFjO0FBQUEsSUFDcEIsR0FBRyx1QkFBdUI7QUFBQSxFQUMzQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTUSx5QkFBK0I7QUFDdEMsUUFBSSxLQUFLLGlCQUFpQjtBQUN6QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLE1BQU0sS0FBSyxJQUFJO0FBQ3JCLFVBQU0sZ0NBQWdDLE1BQU0sS0FBSyxjQUFjO0FBQy9ELFVBQU0sdUJBQXVCLE1BQU0sS0FBSztBQUV4QyxRQUNDLGlDQUFpQyx5QkFDOUIsd0JBQXdCLHVCQUMxQjtBQUVELFVBQUksQ0FBQyxLQUFLLGVBQWUsWUFBWSxHQUFHO0FBQ3ZDLGFBQUsseUJBQXlCO0FBQzlCLGNBQU0seUJBQXlCLEtBQUssa0JBQWtCLE9BQU87QUFDN0QsY0FBTSwwQkFBMEIsS0FBSyxrQkFBa0IsS0FBSztBQUM1RCxhQUFLLGlCQUFpQixLQUFLO0FBQUEsVUFDMUIsUUFBUTtBQUFBLFVBQ1I7QUFBQSxVQUNBLGtDQUFrQywwQkFBMEIsTUFBTSx3QkFBd0IsY0FBYztBQUFBLFVBQ3hHO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxXQUFpQjtBQUN4QixRQUFJLEtBQUssa0JBQWtCLEtBQUssZ0JBQWdCO0FBRS9DO0FBQUEsSUFDRDtBQUVBLFNBQUssaUJBQWlCLEtBQUs7QUFDM0IsVUFBTSxNQUFNLElBQUksZ0JBQWdCLGFBQXlCLEdBQUcsS0FBSyxnQkFBZ0IsZUFBZSxDQUFDO0FBQ2pHLFNBQUssY0FBYyxNQUFNLEdBQUc7QUFBQSxFQUM3QjtBQUFBLEVBRVEsaUJBQXVCO0FBQzlCLFNBQUssaUJBQWlCLEtBQUs7QUFDM0IsVUFBTSxNQUFNLElBQUksZ0JBQWdCLG1CQUErQixHQUFHLEtBQUssZ0JBQWdCLGVBQWUsQ0FBQztBQUN2RyxTQUFLLGNBQWMsTUFBTSxHQUFHO0FBQzVCLFNBQUssdUJBQXVCO0FBQUEsRUFDN0I7QUFDRDsiLAogICJuYW1lcyI6IFsiU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUiLCAiU29ja2V0RGlhZ25vc3RpY3MiLCAiU29ja2V0Q2xvc2VFdmVudFR5cGUiLCAiU29ja2V0VGltZW91dFJlYXNvbiIsICJyZXN1bHQiLCAiUHJvdG9jb2xNZXNzYWdlVHlwZSIsICJQcm90b2NvbENvbnN0YW50cyJdCn0K
