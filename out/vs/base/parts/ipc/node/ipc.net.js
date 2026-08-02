import { createHash } from "crypto";
import { createConnection, createServer } from "net";
import { tmpdir } from "os";
import { createDeflateRaw, createInflateRaw } from "zlib";
import { VSBuffer } from "../../../common/buffer.js";
import { onUnexpectedError } from "../../../common/errors.js";
import { Emitter, Event } from "../../../common/event.js";
import { Disposable } from "../../../common/lifecycle.js";
import { join } from "../../../common/path.js";
import { Platform, platform } from "../../../common/platform.js";
import { generateUuid } from "../../../common/uuid.js";
import { IPCServer } from "../common/ipc.js";
import { ChunkStream, Client, Protocol, SocketCloseEventType, SocketDiagnostics, SocketDiagnosticsEventType } from "../common/ipc.net.js";
function upgradeToISocket(req, socket, {
  debugLabel,
  skipWebSocketFrames = false,
  disableWebSocketCompression = false,
  enableMessageSplitting = true
}) {
  if (req.headers.upgrade === void 0 || req.headers.upgrade.toLowerCase() !== "websocket") {
    socket.end("HTTP/1.1 400 Bad Request");
    return;
  }
  const requestNonce = req.headers["sec-websocket-key"];
  const hash = createHash("sha1");
  hash.update(requestNonce + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
  const responseNonce = hash.digest("base64");
  const responseHeaders = [
    `HTTP/1.1 101 Switching Protocols`,
    `Upgrade: websocket`,
    `Connection: Upgrade`,
    `Sec-WebSocket-Accept: ${responseNonce}`
  ];
  let permessageDeflate = false;
  if (!skipWebSocketFrames && !disableWebSocketCompression && req.headers["sec-websocket-extensions"]) {
    const websocketExtensionOptions = Array.isArray(req.headers["sec-websocket-extensions"]) ? req.headers["sec-websocket-extensions"] : [req.headers["sec-websocket-extensions"]];
    for (const websocketExtensionOption of websocketExtensionOptions) {
      if (/\b((server_max_window_bits)|(server_no_context_takeover)|(client_no_context_takeover))\b/.test(websocketExtensionOption)) {
        continue;
      }
      if (/\b(permessage-deflate)\b/.test(websocketExtensionOption)) {
        permessageDeflate = true;
        responseHeaders.push(`Sec-WebSocket-Extensions: permessage-deflate`);
        break;
      }
      if (/\b(x-webkit-deflate-frame)\b/.test(websocketExtensionOption)) {
        permessageDeflate = true;
        responseHeaders.push(`Sec-WebSocket-Extensions: x-webkit-deflate-frame`);
        break;
      }
    }
  }
  socket.write(responseHeaders.join("\r\n") + "\r\n\r\n");
  socket.setTimeout(0);
  socket.setNoDelay(true);
  if (skipWebSocketFrames) {
    return new NodeSocket(socket, debugLabel);
  } else {
    return new WebSocketNodeSocket(new NodeSocket(socket, debugLabel), permessageDeflate, null, true, enableMessageSplitting);
  }
}
const socketEndTimeoutMs = 3e4;
class NodeSocket {
  constructor(socket, debugLabel = "") {
    this._canWrite = true;
    this.debugLabel = debugLabel;
    this.socket = socket;
    this.traceSocketEvent(SocketDiagnosticsEventType.Created, { type: "NodeSocket" });
    this._errorListener = (err) => {
      this.traceSocketEvent(SocketDiagnosticsEventType.Error, { code: err?.code, message: err?.message });
      if (err) {
        if (err.code === "EPIPE") {
          return;
        }
        onUnexpectedError(err);
      }
    };
    this.socket.on("error", this._errorListener);
    this._closeListener = (hadError) => {
      this.traceSocketEvent(SocketDiagnosticsEventType.Close, { hadError });
      this._canWrite = false;
      if (this._endTimeoutHandle) {
        clearTimeout(this._endTimeoutHandle);
      }
    };
    this.socket.on("close", this._closeListener);
    this._endListener = () => {
      this.traceSocketEvent(SocketDiagnosticsEventType.NodeEndReceived);
      this._canWrite = false;
      this._endTimeoutHandle = setTimeout(() => socket.destroy(), socketEndTimeoutMs);
    };
    this.socket.on("end", this._endListener);
  }
  traceSocketEvent(type, data) {
    SocketDiagnostics.traceSocketEvent(this.socket, this.debugLabel, type, data);
  }
  dispose(destroySocket = true) {
    if (this._endTimeoutHandle) {
      clearTimeout(this._endTimeoutHandle);
      this._endTimeoutHandle = void 0;
    }
    this.socket.off("error", this._errorListener);
    this.socket.off("close", this._closeListener);
    this.socket.off("end", this._endListener);
    if (destroySocket) {
      this.socket.destroy();
    }
  }
  onData(_listener) {
    const listener = (buff) => {
      this.traceSocketEvent(SocketDiagnosticsEventType.Read, buff);
      _listener(VSBuffer.wrap(buff));
    };
    this.socket.on("data", listener);
    return {
      dispose: () => this.socket.off("data", listener)
    };
  }
  onClose(listener) {
    const adapter = (hadError) => {
      listener({
        type: SocketCloseEventType.NodeSocketCloseEvent,
        hadError,
        error: void 0
      });
    };
    this.socket.on("close", adapter);
    return {
      dispose: () => this.socket.off("close", adapter)
    };
  }
  onEnd(listener) {
    const adapter = () => {
      listener();
    };
    this.socket.on("end", adapter);
    return {
      dispose: () => this.socket.off("end", adapter)
    };
  }
  write(buffer) {
    if (this.socket.destroyed || !this._canWrite) {
      return;
    }
    try {
      this.traceSocketEvent(SocketDiagnosticsEventType.Write, buffer);
      this.socket.write(buffer.buffer, (err) => {
        if (err) {
          if (err.code === "EPIPE") {
            return;
          }
          onUnexpectedError(err);
        }
      });
    } catch (err) {
      if (err.code === "EPIPE") {
        return;
      }
      onUnexpectedError(err);
    }
  }
  end() {
    this.traceSocketEvent(SocketDiagnosticsEventType.NodeEndSent);
    this.socket.end();
  }
  drain() {
    this.traceSocketEvent(SocketDiagnosticsEventType.NodeDrainBegin);
    return new Promise((resolve, reject) => {
      if (this.socket.bufferSize === 0) {
        this.traceSocketEvent(SocketDiagnosticsEventType.NodeDrainEnd);
        resolve();
        return;
      }
      const finished = () => {
        this.socket.off("close", finished);
        this.socket.off("end", finished);
        this.socket.off("error", finished);
        this.socket.off("timeout", finished);
        this.socket.off("drain", finished);
        this.traceSocketEvent(SocketDiagnosticsEventType.NodeDrainEnd);
        resolve();
      };
      this.socket.on("close", finished);
      this.socket.on("end", finished);
      this.socket.on("error", finished);
      this.socket.on("timeout", finished);
      this.socket.on("drain", finished);
    });
  }
}
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MinHeaderByteSize"] = 2] = "MinHeaderByteSize";
  Constants2[Constants2["MaxWebSocketMessageLength"] = 262144] = "MaxWebSocketMessageLength";
  return Constants2;
})(Constants || {});
var ReadState = /* @__PURE__ */ ((ReadState2) => {
  ReadState2[ReadState2["PeekHeader"] = 1] = "PeekHeader";
  ReadState2[ReadState2["ReadHeader"] = 2] = "ReadHeader";
  ReadState2[ReadState2["ReadBody"] = 3] = "ReadBody";
  ReadState2[ReadState2["Fin"] = 4] = "Fin";
  return ReadState2;
})(ReadState || {});
class WebSocketNodeSocket extends Disposable {
  /**
   * Create a socket which can communicate using WebSocket frames.
   *
   * **NOTE**: When using the permessage-deflate WebSocket extension, if parts of inflating was done
   *  in a different zlib instance, we need to pass all those bytes into zlib, otherwise the inflate
   *  might hit an inflated portion referencing a distance too far back.
   *
   * @param socket The underlying socket
   * @param permessageDeflate Use the permessage-deflate WebSocket extension
   * @param inflateBytes "Seed" zlib inflate with these bytes.
   * @param recordInflateBytes Record all bytes sent to inflate
   */
  constructor(socket, permessageDeflate, inflateBytes, recordInflateBytes, enableMessageSplitting = true) {
    super();
    this._onData = this._register(new Emitter());
    this._onClose = this._register(new Emitter());
    this._isEnded = false;
    this._state = {
      state: 1 /* PeekHeader */,
      readLen: 2 /* MinHeaderByteSize */,
      fin: 0,
      compressed: false,
      firstFrameOfMessage: true,
      mask: 0,
      opcode: 0
    };
    this.socket = socket;
    this._maxSocketMessageLength = enableMessageSplitting ? 262144 /* MaxWebSocketMessageLength */ : Infinity;
    this.traceSocketEvent(SocketDiagnosticsEventType.Created, { type: "WebSocketNodeSocket", permessageDeflate, inflateBytesLength: inflateBytes?.byteLength || 0, recordInflateBytes });
    this._flowManager = this._register(new WebSocketFlowManager(
      this,
      permessageDeflate,
      inflateBytes,
      recordInflateBytes,
      this._onData,
      (data, options) => this._write(data, options)
    ));
    this._register(this._flowManager.onError((err) => {
      console.error(err);
      onUnexpectedError(err);
      this._onClose.fire({
        type: SocketCloseEventType.NodeSocketCloseEvent,
        hadError: true,
        error: err
      });
    }));
    this._incomingData = new ChunkStream();
    this._register(this.socket.onData((data) => this._acceptChunk(data)));
    this._register(this.socket.onClose(async (e) => {
      if (this._flowManager.isProcessingReadQueue()) {
        await Event.toPromise(this._flowManager.onDidFinishProcessingReadQueue);
      }
      this._onClose.fire(e);
    }));
  }
  get permessageDeflate() {
    return this._flowManager.permessageDeflate;
  }
  get recordedInflateBytes() {
    return this._flowManager.recordedInflateBytes;
  }
  setRecordInflateBytes(record) {
    this._flowManager.setRecordInflateBytes(record);
  }
  traceSocketEvent(type, data) {
    this.socket.traceSocketEvent(type, data);
  }
  dispose() {
    if (this._flowManager.isProcessingWriteQueue()) {
      this._register(this._flowManager.onDidFinishProcessingWriteQueue(() => {
        this.dispose();
      }));
    } else {
      this.socket.dispose();
      super.dispose();
    }
  }
  onData(listener) {
    return this._onData.event(listener);
  }
  onClose(listener) {
    return this._onClose.event(listener);
  }
  onEnd(listener) {
    return this.socket.onEnd(listener);
  }
  write(buffer) {
    let start = 0;
    while (start < buffer.byteLength) {
      this._flowManager.writeMessage(buffer.slice(start, Math.min(start + this._maxSocketMessageLength, buffer.byteLength)), {
        compressed: true,
        opcode: 2
        /* Binary frame */
      });
      start += this._maxSocketMessageLength;
    }
  }
  _write(buffer, { compressed, opcode }) {
    if (this._isEnded) {
      return;
    }
    this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketWrite, buffer);
    let headerLen = 2 /* MinHeaderByteSize */;
    if (buffer.byteLength < 126) {
      headerLen += 0;
    } else if (buffer.byteLength < 2 ** 16) {
      headerLen += 2;
    } else {
      headerLen += 8;
    }
    const header = VSBuffer.alloc(headerLen);
    const compressedFlag = compressed ? 64 : 0;
    const opcodeFlag = opcode & 15;
    header.writeUInt8(128 | compressedFlag | opcodeFlag, 0);
    if (buffer.byteLength < 126) {
      header.writeUInt8(buffer.byteLength, 1);
    } else if (buffer.byteLength < 2 ** 16) {
      header.writeUInt8(126, 1);
      let offset = 1;
      header.writeUInt8(buffer.byteLength >>> 8 & 255, ++offset);
      header.writeUInt8(buffer.byteLength >>> 0 & 255, ++offset);
    } else {
      header.writeUInt8(127, 1);
      let offset = 1;
      header.writeUInt8(0, ++offset);
      header.writeUInt8(0, ++offset);
      header.writeUInt8(0, ++offset);
      header.writeUInt8(0, ++offset);
      header.writeUInt8(buffer.byteLength >>> 24 & 255, ++offset);
      header.writeUInt8(buffer.byteLength >>> 16 & 255, ++offset);
      header.writeUInt8(buffer.byteLength >>> 8 & 255, ++offset);
      header.writeUInt8(buffer.byteLength >>> 0 & 255, ++offset);
    }
    this.socket.write(VSBuffer.concat([header, buffer]));
  }
  end() {
    this._isEnded = true;
    this.socket.end();
  }
  _acceptChunk(data) {
    if (data.byteLength === 0) {
      return;
    }
    this._incomingData.acceptChunk(data);
    while (this._incomingData.byteLength >= this._state.readLen) {
      if (this._state.state === 1 /* PeekHeader */) {
        const peekHeader = this._incomingData.peek(this._state.readLen);
        const firstByte = peekHeader.readUInt8(0);
        const finBit = (firstByte & 128) >>> 7;
        const rsv1Bit = (firstByte & 64) >>> 6;
        const opcode = firstByte & 15;
        const secondByte = peekHeader.readUInt8(1);
        const hasMask = (secondByte & 128) >>> 7;
        const len = secondByte & 127;
        this._state.state = 2 /* ReadHeader */;
        this._state.readLen = 2 /* MinHeaderByteSize */ + (hasMask ? 4 : 0) + (len === 126 ? 2 : 0) + (len === 127 ? 8 : 0);
        this._state.fin = finBit;
        if (this._state.firstFrameOfMessage) {
          this._state.compressed = Boolean(rsv1Bit);
        }
        this._state.firstFrameOfMessage = Boolean(finBit);
        this._state.mask = 0;
        this._state.opcode = opcode;
        this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketPeekedHeader, { headerSize: this._state.readLen, compressed: this._state.compressed, fin: this._state.fin, opcode: this._state.opcode });
      } else if (this._state.state === 2 /* ReadHeader */) {
        const header = this._incomingData.read(this._state.readLen);
        const secondByte = header.readUInt8(1);
        const hasMask = (secondByte & 128) >>> 7;
        let len = secondByte & 127;
        let offset = 1;
        if (len === 126) {
          len = header.readUInt8(++offset) * 2 ** 8 + header.readUInt8(++offset);
        } else if (len === 127) {
          len = header.readUInt8(++offset) * 0 + header.readUInt8(++offset) * 0 + header.readUInt8(++offset) * 0 + header.readUInt8(++offset) * 0 + header.readUInt8(++offset) * 2 ** 24 + header.readUInt8(++offset) * 2 ** 16 + header.readUInt8(++offset) * 2 ** 8 + header.readUInt8(++offset);
        }
        let mask = 0;
        if (hasMask) {
          mask = header.readUInt8(++offset) * 2 ** 24 + header.readUInt8(++offset) * 2 ** 16 + header.readUInt8(++offset) * 2 ** 8 + header.readUInt8(++offset);
        }
        this._state.state = 3 /* ReadBody */;
        this._state.readLen = len;
        this._state.mask = mask;
        this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketPeekedHeader, { bodySize: this._state.readLen, compressed: this._state.compressed, fin: this._state.fin, mask: this._state.mask, opcode: this._state.opcode });
      } else if (this._state.state === 3 /* ReadBody */) {
        const body = this._incomingData.read(this._state.readLen);
        this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketReadData, body);
        unmask(body, this._state.mask);
        this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketUnmaskedData, body);
        this._state.state = 1 /* PeekHeader */;
        this._state.readLen = 2 /* MinHeaderByteSize */;
        this._state.mask = 0;
        if (this._state.opcode <= 2) {
          this._flowManager.acceptFrame(body, this._state.compressed, !!this._state.fin);
        } else if (this._state.opcode === 9) {
          this._flowManager.writeMessage(body, {
            compressed: false,
            opcode: 10
            /* Pong frame */
          });
        }
      }
    }
  }
  async drain() {
    this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketDrainBegin);
    if (this._flowManager.isProcessingWriteQueue()) {
      await Event.toPromise(this._flowManager.onDidFinishProcessingWriteQueue);
    }
    await this.socket.drain();
    this.traceSocketEvent(SocketDiagnosticsEventType.WebSocketNodeSocketDrainEnd);
  }
}
class WebSocketFlowManager extends Disposable {
  constructor(_tracer, permessageDeflate, inflateBytes, recordInflateBytes, _onData, _writeFn) {
    super();
    this._tracer = _tracer;
    this._onData = _onData;
    this._writeFn = _writeFn;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this._writeQueue = [];
    this._readQueue = [];
    this._onDidFinishProcessingReadQueue = this._register(new Emitter());
    this.onDidFinishProcessingReadQueue = this._onDidFinishProcessingReadQueue.event;
    this._onDidFinishProcessingWriteQueue = this._register(new Emitter());
    this.onDidFinishProcessingWriteQueue = this._onDidFinishProcessingWriteQueue.event;
    this._isProcessingWriteQueue = false;
    this._isProcessingReadQueue = false;
    if (permessageDeflate) {
      this._zlibInflateStream = this._register(new ZlibInflateStream(this._tracer, recordInflateBytes, inflateBytes, { windowBits: 15 }));
      this._zlibDeflateStream = this._register(new ZlibDeflateStream(this._tracer, { windowBits: 15 }));
      this._register(this._zlibInflateStream.onError((err) => this._onError.fire(err)));
      this._register(this._zlibDeflateStream.onError((err) => this._onError.fire(err)));
    } else {
      this._zlibInflateStream = null;
      this._zlibDeflateStream = null;
    }
  }
  get permessageDeflate() {
    return Boolean(this._zlibInflateStream && this._zlibDeflateStream);
  }
  get recordedInflateBytes() {
    if (this._zlibInflateStream) {
      return this._zlibInflateStream.recordedInflateBytes;
    }
    return VSBuffer.alloc(0);
  }
  setRecordInflateBytes(record) {
    this._zlibInflateStream?.setRecordInflateBytes(record);
  }
  writeMessage(data, options) {
    this._writeQueue.push({ data, options });
    this._processWriteQueue();
  }
  async _processWriteQueue() {
    if (this._isProcessingWriteQueue) {
      return;
    }
    this._isProcessingWriteQueue = true;
    while (this._writeQueue.length > 0) {
      const { data, options } = this._writeQueue.shift();
      if (this._zlibDeflateStream && options.compressed) {
        const compressedData = await this._deflateMessage(this._zlibDeflateStream, data);
        this._writeFn(compressedData, options);
      } else {
        this._writeFn(data, { ...options, compressed: false });
      }
    }
    this._isProcessingWriteQueue = false;
    this._onDidFinishProcessingWriteQueue.fire();
  }
  isProcessingWriteQueue() {
    return this._isProcessingWriteQueue;
  }
  /**
   * Subsequent calls should wait for the previous `_deflateBuffer` call to complete.
   */
  _deflateMessage(zlibDeflateStream, buffer) {
    return new Promise((resolve, reject) => {
      zlibDeflateStream.write(buffer);
      zlibDeflateStream.flush((data) => resolve(data));
    });
  }
  acceptFrame(data, isCompressed, isLastFrameOfMessage) {
    this._readQueue.push({ data, isCompressed, isLastFrameOfMessage });
    this._processReadQueue();
  }
  async _processReadQueue() {
    if (this._isProcessingReadQueue) {
      return;
    }
    this._isProcessingReadQueue = true;
    while (this._readQueue.length > 0) {
      const frameInfo = this._readQueue.shift();
      if (this._zlibInflateStream && frameInfo.isCompressed) {
        const data = await this._inflateFrame(this._zlibInflateStream, frameInfo.data, frameInfo.isLastFrameOfMessage);
        this._onData.fire(data);
      } else {
        this._onData.fire(frameInfo.data);
      }
    }
    this._isProcessingReadQueue = false;
    this._onDidFinishProcessingReadQueue.fire();
  }
  isProcessingReadQueue() {
    return this._isProcessingReadQueue;
  }
  /**
   * Subsequent calls should wait for the previous `transformRead` call to complete.
   */
  _inflateFrame(zlibInflateStream, buffer, isLastFrameOfMessage) {
    return new Promise((resolve, reject) => {
      zlibInflateStream.write(buffer);
      if (isLastFrameOfMessage) {
        zlibInflateStream.write(VSBuffer.fromByteArray([0, 0, 255, 255]));
      }
      zlibInflateStream.flush((data) => resolve(data));
    });
  }
}
class ZlibInflateStream extends Disposable {
  constructor(_tracer, recordInflateBytes, inflateBytes, options) {
    super();
    this._tracer = _tracer;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this._recordedInflateBytes = [];
    this._pendingInflateData = [];
    this._recordInflateBytes = recordInflateBytes;
    this._zlibInflate = createInflateRaw(options);
    this._zlibInflate.on("error", (err) => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateError, { message: err?.message, code: err?.code });
      this._onError.fire(err);
    });
    this._zlibInflate.on("data", (data) => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateData, data);
      this._pendingInflateData.push(VSBuffer.wrap(data));
    });
    if (inflateBytes) {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateInitialWrite, inflateBytes.buffer);
      this._zlibInflate.write(inflateBytes.buffer);
      this._zlibInflate.flush(() => {
        this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateInitialFlushFired);
        this._pendingInflateData.length = 0;
      });
    }
  }
  get recordedInflateBytes() {
    if (this._recordInflateBytes) {
      return VSBuffer.concat(this._recordedInflateBytes);
    }
    return VSBuffer.alloc(0);
  }
  write(buffer) {
    if (this._recordInflateBytes) {
      this._recordedInflateBytes.push(buffer.clone());
    }
    this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateWrite, buffer);
    this._zlibInflate.write(buffer.buffer);
  }
  setRecordInflateBytes(record) {
    this._recordInflateBytes = record;
    if (!record) {
      this._recordedInflateBytes.length = 0;
    }
  }
  flush(callback) {
    this._zlibInflate.flush(() => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibInflateFlushFired);
      const data = VSBuffer.concat(this._pendingInflateData);
      this._pendingInflateData.length = 0;
      callback(data);
    });
  }
  dispose() {
    this._recordedInflateBytes.length = 0;
    this._pendingInflateData.length = 0;
    try {
      this._zlibInflate.close();
    } catch {
    }
    super.dispose();
  }
}
class ZlibDeflateStream extends Disposable {
  constructor(_tracer, options) {
    super();
    this._tracer = _tracer;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this._pendingDeflateData = [];
    this._zlibDeflate = createDeflateRaw({
      windowBits: 15
    });
    this._zlibDeflate.on("error", (err) => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateError, { message: err?.message, code: err?.code });
      this._onError.fire(err);
    });
    this._zlibDeflate.on("data", (data) => {
      this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateData, data);
      this._pendingDeflateData.push(VSBuffer.wrap(data));
    });
  }
  write(buffer) {
    this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateWrite, buffer.buffer);
    this._zlibDeflate.write(buffer.buffer);
  }
  flush(callback) {
    this._zlibDeflate.flush(
      /*Z_SYNC_FLUSH*/
      2,
      () => {
        this._tracer.traceSocketEvent(SocketDiagnosticsEventType.zlibDeflateFlushFired);
        let data = VSBuffer.concat(this._pendingDeflateData);
        this._pendingDeflateData.length = 0;
        data = data.slice(0, data.byteLength - 4);
        callback(data);
      }
    );
  }
  dispose() {
    this._pendingDeflateData.length = 0;
    try {
      this._zlibDeflate.close();
    } catch {
    }
    super.dispose();
  }
}
function unmask(buffer, mask) {
  if (mask === 0) {
    return;
  }
  const cnt = buffer.byteLength >>> 2;
  for (let i = 0; i < cnt; i++) {
    const v = buffer.readUInt32BE(i * 4);
    buffer.writeUInt32BE(v ^ mask, i * 4);
  }
  const offset = cnt * 4;
  const bytesLeft = buffer.byteLength - offset;
  const m3 = mask >>> 24 & 255;
  const m2 = mask >>> 16 & 255;
  const m1 = mask >>> 8 & 255;
  if (bytesLeft >= 1) {
    buffer.writeUInt8(buffer.readUInt8(offset) ^ m3, offset);
  }
  if (bytesLeft >= 2) {
    buffer.writeUInt8(buffer.readUInt8(offset + 1) ^ m2, offset + 1);
  }
  if (bytesLeft >= 3) {
    buffer.writeUInt8(buffer.readUInt8(offset + 2) ^ m1, offset + 2);
  }
}
const XDG_RUNTIME_DIR = process.env["XDG_RUNTIME_DIR"];
const safeIpcPathLengths = {
  [Platform.Linux]: 107,
  [Platform.Mac]: 103
};
function createRandomIPCHandle() {
  const randomSuffix = generateUuid();
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\vscode-ipc-${randomSuffix}-sock`;
  }
  const basePath = process.platform !== "darwin" && XDG_RUNTIME_DIR ? XDG_RUNTIME_DIR : tmpdir();
  const limit = safeIpcPathLengths[platform];
  let suffix = randomSuffix;
  if (typeof limit === "number") {
    const available = Math.max(0, limit - 1 - join(basePath, `vscode-ipc-.sock`).length);
    if (available < suffix.length) {
      suffix = suffix.slice(0, available);
    }
  }
  return join(basePath, `vscode-ipc-${suffix}.sock`);
}
function createStaticIPCHandle(directoryPath, type, version) {
  const scope = createHash("sha256").update(directoryPath).digest("hex");
  const scopeForSocket = scope.substr(0, 8);
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${scopeForSocket}-${version}-${type}-sock`;
  }
  const versionForSocket = version.substr(0, 4);
  const typeForSocket = type.substr(0, 6);
  let result;
  if (process.platform !== "darwin" && XDG_RUNTIME_DIR && !process.env["VSCODE_PORTABLE"]) {
    result = join(XDG_RUNTIME_DIR, `vscode-${scopeForSocket}-${versionForSocket}-${typeForSocket}.sock`);
  } else {
    result = join(directoryPath, `${versionForSocket}-${typeForSocket}.sock`);
  }
  validateIPCHandleLength(result);
  return result;
}
function validateIPCHandleLength(handle) {
  const limit = safeIpcPathLengths[platform];
  if (typeof limit === "number" && handle.length >= limit) {
    console.warn(`WARNING: IPC handle "${handle}" is longer than ${limit} chars, try a shorter --user-data-dir`);
  }
}
class Server extends IPCServer {
  static toClientConnectionEvent(server) {
    const onConnection = Event.fromNodeEventEmitter(server, "connection");
    return Event.map(onConnection, (socket) => ({
      protocol: new Protocol(new NodeSocket(socket, "ipc-server-connection")),
      onDidClientDisconnect: Event.once(Event.fromNodeEventEmitter(socket, "close"))
    }));
  }
  constructor(server) {
    super(Server.toClientConnectionEvent(server));
    this.server = server;
  }
  dispose() {
    super.dispose();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
function serve(hook) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(hook, () => {
      server.removeListener("error", reject);
      resolve(new Server(server));
    });
  });
}
function connect(hook, clientId) {
  return new Promise((resolve, reject) => {
    let socket;
    const callbackHandler = () => {
      socket.removeListener("error", reject);
      resolve(Client.fromSocket(new NodeSocket(socket, `ipc-client${clientId}`), clientId));
    };
    if (typeof hook === "string") {
      socket = createConnection(hook, callbackHandler);
    } else {
      socket = createConnection(hook, callbackHandler);
    }
    socket.once("error", reject);
  });
}
export {
  NodeSocket,
  Server,
  WebSocketNodeSocket,
  XDG_RUNTIME_DIR,
  connect,
  createRandomIPCHandle,
  createStaticIPCHandle,
  serve,
  upgradeToISocket
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgU2VydmVyIGFzIE5ldFNlcnZlciwgU29ja2V0LCBjcmVhdGVDb25uZWN0aW9uLCBjcmVhdGVTZXJ2ZXIgfSBmcm9tICduZXQnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgRGVmbGF0ZVJhdywgSW5mbGF0ZVJhdywgWmxpYk9wdGlvbnMsIGNyZWF0ZURlZmxhdGVSYXcsIGNyZWF0ZUluZmxhdGVSYXcgfSBmcm9tICd6bGliJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBQbGF0Zm9ybSwgcGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgQ2xpZW50Q29ubmVjdGlvbkV2ZW50LCBJUENTZXJ2ZXIgfSBmcm9tICcuLi9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IENodW5rU3RyZWFtLCBDbGllbnQsIElTb2NrZXQsIFByb3RvY29sLCBTb2NrZXRDbG9zZUV2ZW50LCBTb2NrZXRDbG9zZUV2ZW50VHlwZSwgU29ja2V0RGlhZ25vc3RpY3MsIFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2lwYy5uZXQuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gdXBncmFkZVRvSVNvY2tldChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCBzb2NrZXQ6IFNvY2tldCwge1xuXHRkZWJ1Z0xhYmVsLFxuXHRza2lwV2ViU29ja2V0RnJhbWVzID0gZmFsc2UsXG5cdGRpc2FibGVXZWJTb2NrZXRDb21wcmVzc2lvbiA9IGZhbHNlLFxuXHRlbmFibGVNZXNzYWdlU3BsaXR0aW5nID0gdHJ1ZSxcbn06IHtcblx0ZGVidWdMYWJlbDogc3RyaW5nO1xuXHRza2lwV2ViU29ja2V0RnJhbWVzPzogYm9vbGVhbjtcblx0ZGlzYWJsZVdlYlNvY2tldENvbXByZXNzaW9uPzogYm9vbGVhbjtcblx0ZW5hYmxlTWVzc2FnZVNwbGl0dGluZz86IGJvb2xlYW47XG59KTogTm9kZVNvY2tldCB8IFdlYlNvY2tldE5vZGVTb2NrZXQgfCB1bmRlZmluZWQge1xuXHRpZiAocmVxLmhlYWRlcnMudXBncmFkZSA9PT0gdW5kZWZpbmVkIHx8IHJlcS5oZWFkZXJzLnVwZ3JhZGUudG9Mb3dlckNhc2UoKSAhPT0gJ3dlYnNvY2tldCcpIHtcblx0XHRzb2NrZXQuZW5kKCdIVFRQLzEuMSA0MDAgQmFkIFJlcXVlc3QnKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNjQ1NSNzZWN0aW9uLTRcblx0Y29uc3QgcmVxdWVzdE5vbmNlID0gcmVxLmhlYWRlcnNbJ3NlYy13ZWJzb2NrZXQta2V5J107XG5cdGNvbnN0IGhhc2ggPSBjcmVhdGVIYXNoKCdzaGExJyk7Ly8gQ29kZVFMIFtTTTA0NTE0XSBTSEExIG11c3QgYmUgdXNlZCBoZXJlIHRvIHJlc3BlY3QgdGhlIFdlYlNvY2tldCBwcm90b2NvbCBzcGVjaWZpY2F0aW9uXG5cdGhhc2gudXBkYXRlKHJlcXVlc3ROb25jZSArICcyNThFQUZBNS1FOTE0LTQ3REEtOTVDQS1DNUFCMERDODVCMTEnKTtcblx0Y29uc3QgcmVzcG9uc2VOb25jZSA9IGhhc2guZGlnZXN0KCdiYXNlNjQnKTtcblxuXHRjb25zdCByZXNwb25zZUhlYWRlcnMgPSBbXG5cdFx0YEhUVFAvMS4xIDEwMSBTd2l0Y2hpbmcgUHJvdG9jb2xzYCxcblx0XHRgVXBncmFkZTogd2Vic29ja2V0YCxcblx0XHRgQ29ubmVjdGlvbjogVXBncmFkZWAsXG5cdFx0YFNlYy1XZWJTb2NrZXQtQWNjZXB0OiAke3Jlc3BvbnNlTm9uY2V9YFxuXHRdO1xuXG5cdC8vIFNlZSBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNzY5MiNwYWdlLTEyXG5cdGxldCBwZXJtZXNzYWdlRGVmbGF0ZSA9IGZhbHNlO1xuXHRpZiAoIXNraXBXZWJTb2NrZXRGcmFtZXMgJiYgIWRpc2FibGVXZWJTb2NrZXRDb21wcmVzc2lvbiAmJiByZXEuaGVhZGVyc1snc2VjLXdlYnNvY2tldC1leHRlbnNpb25zJ10pIHtcblx0XHRjb25zdCB3ZWJzb2NrZXRFeHRlbnNpb25PcHRpb25zID0gQXJyYXkuaXNBcnJheShyZXEuaGVhZGVyc1snc2VjLXdlYnNvY2tldC1leHRlbnNpb25zJ10pID8gcmVxLmhlYWRlcnNbJ3NlYy13ZWJzb2NrZXQtZXh0ZW5zaW9ucyddIDogW3JlcS5oZWFkZXJzWydzZWMtd2Vic29ja2V0LWV4dGVuc2lvbnMnXV07XG5cdFx0Zm9yIChjb25zdCB3ZWJzb2NrZXRFeHRlbnNpb25PcHRpb24gb2Ygd2Vic29ja2V0RXh0ZW5zaW9uT3B0aW9ucykge1xuXHRcdFx0aWYgKC9cXGIoKHNlcnZlcl9tYXhfd2luZG93X2JpdHMpfChzZXJ2ZXJfbm9fY29udGV4dF90YWtlb3Zlcil8KGNsaWVudF9ub19jb250ZXh0X3Rha2VvdmVyKSlcXGIvLnRlc3Qod2Vic29ja2V0RXh0ZW5zaW9uT3B0aW9uKSkge1xuXHRcdFx0XHQvLyBzb3JyeSwgdGhlIHNlcnZlciBkb2VzIG5vdCBzdXBwb3J0IHpsaWIgcGFyYW1ldGVyIHR3ZWFrc1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICgvXFxiKHBlcm1lc3NhZ2UtZGVmbGF0ZSlcXGIvLnRlc3Qod2Vic29ja2V0RXh0ZW5zaW9uT3B0aW9uKSkge1xuXHRcdFx0XHRwZXJtZXNzYWdlRGVmbGF0ZSA9IHRydWU7XG5cdFx0XHRcdHJlc3BvbnNlSGVhZGVycy5wdXNoKGBTZWMtV2ViU29ja2V0LUV4dGVuc2lvbnM6IHBlcm1lc3NhZ2UtZGVmbGF0ZWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmICgvXFxiKHgtd2Via2l0LWRlZmxhdGUtZnJhbWUpXFxiLy50ZXN0KHdlYnNvY2tldEV4dGVuc2lvbk9wdGlvbikpIHtcblx0XHRcdFx0cGVybWVzc2FnZURlZmxhdGUgPSB0cnVlO1xuXHRcdFx0XHRyZXNwb25zZUhlYWRlcnMucHVzaChgU2VjLVdlYlNvY2tldC1FeHRlbnNpb25zOiB4LXdlYmtpdC1kZWZsYXRlLWZyYW1lYCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHNvY2tldC53cml0ZShyZXNwb25zZUhlYWRlcnMuam9pbignXFxyXFxuJykgKyAnXFxyXFxuXFxyXFxuJyk7XG5cblx0Ly8gTmV2ZXIgdGltZW91dCB0aGlzIHNvY2tldCBkdWUgdG8gaW5hY3Rpdml0eSFcblx0c29ja2V0LnNldFRpbWVvdXQoMCk7XG5cdC8vIERpc2FibGUgTmFnbGUncyBhbGdvcml0aG1cblx0c29ja2V0LnNldE5vRGVsYXkodHJ1ZSk7XG5cdC8vIEZpbmFsbHkhXG5cblx0aWYgKHNraXBXZWJTb2NrZXRGcmFtZXMpIHtcblx0XHRyZXR1cm4gbmV3IE5vZGVTb2NrZXQoc29ja2V0LCBkZWJ1Z0xhYmVsKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gbmV3IFdlYlNvY2tldE5vZGVTb2NrZXQobmV3IE5vZGVTb2NrZXQoc29ja2V0LCBkZWJ1Z0xhYmVsKSwgcGVybWVzc2FnZURlZmxhdGUsIG51bGwsIHRydWUsIGVuYWJsZU1lc3NhZ2VTcGxpdHRpbmcpO1xuXHR9XG59XG5cbi8qKlxuICogTWF4aW11bSB0aW1lIHRvIHdhaXQgZm9yIGEgJ2Nsb3NlJyBldmVudCB0byBmaXJlIGFmdGVyIHRoZSBzb2NrZXQgc3RyZWFtXG4gKiBlbmRzLiBGb3IgdW5peCBkb21haW4gc29ja2V0cywgdGhlIGNsb3NlIGV2ZW50IG1heSBub3QgZmlyZSBjb25zaXN0ZW50bHlcbiAqIGR1ZSB0byB3aGF0IGFwcGVhcnMgdG8gYmUgYSBOb2RlLmpzIGJ1Zy5cbiAqXG4gKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMTE0NjIjaXNzdWVjb21tZW50LTIxNTU0NzE5OTZcbiAqL1xuY29uc3Qgc29ja2V0RW5kVGltZW91dE1zID0gMzBfMDAwO1xuXG5leHBvcnQgY2xhc3MgTm9kZVNvY2tldCBpbXBsZW1lbnRzIElTb2NrZXQge1xuXG5cdHB1YmxpYyByZWFkb25seSBkZWJ1Z0xhYmVsOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBzb2NrZXQ6IFNvY2tldDtcblx0cHJpdmF0ZSByZWFkb25seSBfZXJyb3JMaXN0ZW5lcjogKGVycjogTm9kZUpTLkVycm5vRXhjZXB0aW9uKSA9PiB2b2lkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zZUxpc3RlbmVyOiAoaGFkRXJyb3I6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuZExpc3RlbmVyOiAoKSA9PiB2b2lkO1xuXHRwcml2YXRlIF9lbmRUaW1lb3V0SGFuZGxlOiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jYW5Xcml0ZSA9IHRydWU7XG5cblx0cHVibGljIHRyYWNlU29ja2V0RXZlbnQodHlwZTogU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUsIGRhdGE/OiBWU0J1ZmZlciB8IFVpbnQ4QXJyYXkgfCBBcnJheUJ1ZmZlciB8IEFycmF5QnVmZmVyVmlldyB8IHVua25vd24pOiB2b2lkIHtcblx0XHRTb2NrZXREaWFnbm9zdGljcy50cmFjZVNvY2tldEV2ZW50KHRoaXMuc29ja2V0LCB0aGlzLmRlYnVnTGFiZWwsIHR5cGUsIGRhdGEpO1xuXHR9XG5cblx0Y29uc3RydWN0b3Ioc29ja2V0OiBTb2NrZXQsIGRlYnVnTGFiZWwgPSAnJykge1xuXHRcdHRoaXMuZGVidWdMYWJlbCA9IGRlYnVnTGFiZWw7XG5cdFx0dGhpcy5zb2NrZXQgPSBzb2NrZXQ7XG5cdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLkNyZWF0ZWQsIHsgdHlwZTogJ05vZGVTb2NrZXQnIH0pO1xuXHRcdHRoaXMuX2Vycm9yTGlzdGVuZXIgPSAoZXJyOiBOb2RlSlMuRXJybm9FeGNlcHRpb24pID0+IHtcblx0XHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5FcnJvciwgeyBjb2RlOiBlcnI/LmNvZGUsIG1lc3NhZ2U6IGVycj8ubWVzc2FnZSB9KTtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0aWYgKGVyci5jb2RlID09PSAnRVBJUEUnKSB7XG5cdFx0XHRcdFx0Ly8gQW4gRVBJUEUgZXhjZXB0aW9uIGF0IHRoZSB3cm9uZyB0aW1lIGNhbiBsZWFkIHRvIGEgcmVuZGVyZXIgcHJvY2VzcyBjcmFzaFxuXHRcdFx0XHRcdC8vIHNvIGlnbm9yZSB0aGUgZXJyb3Igc2luY2UgdGhlIHNvY2tldCB3aWxsIGZpcmUgdGhlIGNsb3NlIGV2ZW50IHNvb24gYW55d2F5czpcblx0XHRcdFx0XHQvLyA+IGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvZXJyb3JzLmh0bWwjZXJyb3JzX2NvbW1vbl9zeXN0ZW1fZXJyb3JzXG5cdFx0XHRcdFx0Ly8gPiBFUElQRSAoQnJva2VuIHBpcGUpOiBBIHdyaXRlIG9uIGEgcGlwZSwgc29ja2V0LCBvciBGSUZPIGZvciB3aGljaCB0aGVyZSBpcyBub1xuXHRcdFx0XHRcdC8vID4gcHJvY2VzcyB0byByZWFkIHRoZSBkYXRhLiBDb21tb25seSBlbmNvdW50ZXJlZCBhdCB0aGUgbmV0IGFuZCBodHRwIGxheWVycyxcblx0XHRcdFx0XHQvLyA+IGluZGljYXRpdmUgdGhhdCB0aGUgcmVtb3RlIHNpZGUgb2YgdGhlIHN0cmVhbSBiZWluZyB3cml0dGVuIHRvIGhhcyBiZWVuIGNsb3NlZC5cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuc29ja2V0Lm9uKCdlcnJvcicsIHRoaXMuX2Vycm9yTGlzdGVuZXIpO1xuXG5cdFx0dGhpcy5fY2xvc2VMaXN0ZW5lciA9IChoYWRFcnJvcjogYm9vbGVhbikgPT4ge1xuXHRcdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLkNsb3NlLCB7IGhhZEVycm9yIH0pO1xuXHRcdFx0dGhpcy5fY2FuV3JpdGUgPSBmYWxzZTtcblx0XHRcdGlmICh0aGlzLl9lbmRUaW1lb3V0SGFuZGxlKSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9lbmRUaW1lb3V0SGFuZGxlKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuc29ja2V0Lm9uKCdjbG9zZScsIHRoaXMuX2Nsb3NlTGlzdGVuZXIpO1xuXG5cdFx0dGhpcy5fZW5kTGlzdGVuZXIgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuTm9kZUVuZFJlY2VpdmVkKTtcblx0XHRcdHRoaXMuX2NhbldyaXRlID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9lbmRUaW1lb3V0SGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiBzb2NrZXQuZGVzdHJveSgpLCBzb2NrZXRFbmRUaW1lb3V0TXMpO1xuXHRcdH07XG5cdFx0dGhpcy5zb2NrZXQub24oJ2VuZCcsIHRoaXMuX2VuZExpc3RlbmVyKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKGRlc3Ryb3lTb2NrZXQgPSB0cnVlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2VuZFRpbWVvdXRIYW5kbGUpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9lbmRUaW1lb3V0SGFuZGxlKTtcblx0XHRcdHRoaXMuX2VuZFRpbWVvdXRIYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuc29ja2V0Lm9mZignZXJyb3InLCB0aGlzLl9lcnJvckxpc3RlbmVyKTtcblx0XHR0aGlzLnNvY2tldC5vZmYoJ2Nsb3NlJywgdGhpcy5fY2xvc2VMaXN0ZW5lcik7XG5cdFx0dGhpcy5zb2NrZXQub2ZmKCdlbmQnLCB0aGlzLl9lbmRMaXN0ZW5lcik7XG5cdFx0aWYgKGRlc3Ryb3lTb2NrZXQpIHtcblx0XHRcdHRoaXMuc29ja2V0LmRlc3Ryb3koKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb25EYXRhKF9saXN0ZW5lcjogKGU6IFZTQnVmZmVyKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGxpc3RlbmVyID0gKGJ1ZmY6IEJ1ZmZlcikgPT4ge1xuXHRcdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLlJlYWQsIGJ1ZmYpO1xuXHRcdFx0X2xpc3RlbmVyKFZTQnVmZmVyLndyYXAoYnVmZikpO1xuXHRcdH07XG5cdFx0dGhpcy5zb2NrZXQub24oJ2RhdGEnLCBsaXN0ZW5lcik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHRoaXMuc29ja2V0Lm9mZignZGF0YScsIGxpc3RlbmVyKVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgb25DbG9zZShsaXN0ZW5lcjogKGU6IFNvY2tldENsb3NlRXZlbnQpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgYWRhcHRlciA9IChoYWRFcnJvcjogYm9vbGVhbikgPT4ge1xuXHRcdFx0bGlzdGVuZXIoe1xuXHRcdFx0XHR0eXBlOiBTb2NrZXRDbG9zZUV2ZW50VHlwZS5Ob2RlU29ja2V0Q2xvc2VFdmVudCxcblx0XHRcdFx0aGFkRXJyb3I6IGhhZEVycm9yLFxuXHRcdFx0XHRlcnJvcjogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdHRoaXMuc29ja2V0Lm9uKCdjbG9zZScsIGFkYXB0ZXIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB0aGlzLnNvY2tldC5vZmYoJ2Nsb3NlJywgYWRhcHRlcilcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIG9uRW5kKGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGFkYXB0ZXIgPSAoKSA9PiB7XG5cdFx0XHRsaXN0ZW5lcigpO1xuXHRcdH07XG5cdFx0dGhpcy5zb2NrZXQub24oJ2VuZCcsIGFkYXB0ZXIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB0aGlzLnNvY2tldC5vZmYoJ2VuZCcsIGFkYXB0ZXIpXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyB3cml0ZShidWZmZXI6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0Ly8gcmV0dXJuIGVhcmx5IGlmIHNvY2tldCBoYXMgYmVlbiBkZXN0cm95ZWQgaW4gdGhlIG1lYW50aW1lXG5cdFx0aWYgKHRoaXMuc29ja2V0LmRlc3Ryb3llZCB8fCAhdGhpcy5fY2FuV3JpdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyB3ZSBpZ25vcmUgdGhlIHJldHVybmVkIHZhbHVlIGZyb20gYHdyaXRlYCBiZWNhdXNlIHdlIHdvdWxkIGhhdmUgdG8gY2FjaGVkIHRoZSBkYXRhXG5cdFx0Ly8gYW55d2F5cyBhbmQgbm9kZWpzIGlzIGFscmVhZHkgZG9pbmcgdGhhdCBmb3IgdXM6XG5cdFx0Ly8gPiBodHRwczovL25vZGVqcy5vcmcvYXBpL3N0cmVhbS5odG1sI3N0cmVhbV93cml0YWJsZV93cml0ZV9jaHVua19lbmNvZGluZ19jYWxsYmFja1xuXHRcdC8vID4gSG93ZXZlciwgdGhlIGZhbHNlIHJldHVybiB2YWx1ZSBpcyBvbmx5IGFkdmlzb3J5IGFuZCB0aGUgd3JpdGFibGUgc3RyZWFtIHdpbGwgdW5jb25kaXRpb25hbGx5XG5cdFx0Ly8gPiBhY2NlcHQgYW5kIGJ1ZmZlciBjaHVuayBldmVuIGlmIGl0IGhhcyBub3QgYmVlbiBhbGxvd2VkIHRvIGRyYWluLlxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuV3JpdGUsIGJ1ZmZlcik7XG5cdFx0XHR0aGlzLnNvY2tldC53cml0ZShidWZmZXIuYnVmZmVyLCAoZXJyOiBOb2RlSlMuRXJybm9FeGNlcHRpb24gfCBudWxsIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHRpZiAoZXJyLmNvZGUgPT09ICdFUElQRScpIHtcblx0XHRcdFx0XHRcdC8vIEFuIEVQSVBFIGV4Y2VwdGlvbiBhdCB0aGUgd3JvbmcgdGltZSBjYW4gbGVhZCB0byBhIHJlbmRlcmVyIHByb2Nlc3MgY3Jhc2hcblx0XHRcdFx0XHRcdC8vIHNvIGlnbm9yZSB0aGUgZXJyb3Igc2luY2UgdGhlIHNvY2tldCB3aWxsIGZpcmUgdGhlIGNsb3NlIGV2ZW50IHNvb24gYW55d2F5czpcblx0XHRcdFx0XHRcdC8vID4gaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9lcnJvcnMuaHRtbCNlcnJvcnNfY29tbW9uX3N5c3RlbV9lcnJvcnNcblx0XHRcdFx0XHRcdC8vID4gRVBJUEUgKEJyb2tlbiBwaXBlKTogQSB3cml0ZSBvbiBhIHBpcGUsIHNvY2tldCwgb3IgRklGTyBmb3Igd2hpY2ggdGhlcmUgaXMgbm9cblx0XHRcdFx0XHRcdC8vID4gcHJvY2VzcyB0byByZWFkIHRoZSBkYXRhLiBDb21tb25seSBlbmNvdW50ZXJlZCBhdCB0aGUgbmV0IGFuZCBodHRwIGxheWVycyxcblx0XHRcdFx0XHRcdC8vID4gaW5kaWNhdGl2ZSB0aGF0IHRoZSByZW1vdGUgc2lkZSBvZiB0aGUgc3RyZWFtIGJlaW5nIHdyaXR0ZW4gdG8gaGFzIGJlZW4gY2xvc2VkLlxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlcnIuY29kZSA9PT0gJ0VQSVBFJykge1xuXHRcdFx0XHQvLyBBbiBFUElQRSBleGNlcHRpb24gYXQgdGhlIHdyb25nIHRpbWUgY2FuIGxlYWQgdG8gYSByZW5kZXJlciBwcm9jZXNzIGNyYXNoXG5cdFx0XHRcdC8vIHNvIGlnbm9yZSB0aGUgZXJyb3Igc2luY2UgdGhlIHNvY2tldCB3aWxsIGZpcmUgdGhlIGNsb3NlIGV2ZW50IHNvb24gYW55d2F5czpcblx0XHRcdFx0Ly8gPiBodHRwczovL25vZGVqcy5vcmcvYXBpL2Vycm9ycy5odG1sI2Vycm9yc19jb21tb25fc3lzdGVtX2Vycm9yc1xuXHRcdFx0XHQvLyA+IEVQSVBFIChCcm9rZW4gcGlwZSk6IEEgd3JpdGUgb24gYSBwaXBlLCBzb2NrZXQsIG9yIEZJRk8gZm9yIHdoaWNoIHRoZXJlIGlzIG5vXG5cdFx0XHRcdC8vID4gcHJvY2VzcyB0byByZWFkIHRoZSBkYXRhLiBDb21tb25seSBlbmNvdW50ZXJlZCBhdCB0aGUgbmV0IGFuZCBodHRwIGxheWVycyxcblx0XHRcdFx0Ly8gPiBpbmRpY2F0aXZlIHRoYXQgdGhlIHJlbW90ZSBzaWRlIG9mIHRoZSBzdHJlYW0gYmVpbmcgd3JpdHRlbiB0byBoYXMgYmVlbiBjbG9zZWQuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGVuZCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuTm9kZUVuZFNlbnQpO1xuXHRcdHRoaXMuc29ja2V0LmVuZCgpO1xuXHR9XG5cblx0cHVibGljIGRyYWluKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5Ob2RlRHJhaW5CZWdpbik7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGlmICh0aGlzLnNvY2tldC5idWZmZXJTaXplID09PSAwKSB7XG5cdFx0XHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5Ob2RlRHJhaW5FbmQpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZpbmlzaGVkID0gKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNvY2tldC5vZmYoJ2Nsb3NlJywgZmluaXNoZWQpO1xuXHRcdFx0XHR0aGlzLnNvY2tldC5vZmYoJ2VuZCcsIGZpbmlzaGVkKTtcblx0XHRcdFx0dGhpcy5zb2NrZXQub2ZmKCdlcnJvcicsIGZpbmlzaGVkKTtcblx0XHRcdFx0dGhpcy5zb2NrZXQub2ZmKCd0aW1lb3V0JywgZmluaXNoZWQpO1xuXHRcdFx0XHR0aGlzLnNvY2tldC5vZmYoJ2RyYWluJywgZmluaXNoZWQpO1xuXHRcdFx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuTm9kZURyYWluRW5kKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMuc29ja2V0Lm9uKCdjbG9zZScsIGZpbmlzaGVkKTtcblx0XHRcdHRoaXMuc29ja2V0Lm9uKCdlbmQnLCBmaW5pc2hlZCk7XG5cdFx0XHR0aGlzLnNvY2tldC5vbignZXJyb3InLCBmaW5pc2hlZCk7XG5cdFx0XHR0aGlzLnNvY2tldC5vbigndGltZW91dCcsIGZpbmlzaGVkKTtcblx0XHRcdHRoaXMuc29ja2V0Lm9uKCdkcmFpbicsIGZpbmlzaGVkKTtcblx0XHR9KTtcblx0fVxufVxuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdE1pbkhlYWRlckJ5dGVTaXplID0gMixcblx0LyoqXG5cdCAqIElmIHdlIG5lZWQgdG8gd3JpdGUgYSBsYXJnZSBidWZmZXIsIHdlIHdpbGwgc3BsaXQgaXQgaW50byAyNTZLQiBjaHVua3MgYW5kXG5cdCAqIHNlbmQgZWFjaCBjaHVuayBhcyBhIHdlYnNvY2tldCBtZXNzYWdlLiBUaGlzIGlzIHRvIHByZXZlbnQgdGhhdCB0aGUgc2VuZGluZ1xuXHQgKiBzaWRlIGlzIHN0dWNrIHdhaXRpbmcgZm9yIHRoZSBlbnRpcmUgYnVmZmVyIHRvIGJlIGNvbXByZXNzZWQgYmVmb3JlIHdyaXRpbmdcblx0ICogdG8gdGhlIHVuZGVybHlpbmcgc29ja2V0IG9yIHRoYXQgdGhlIHJlY2VpdmluZyBzaWRlIGlzIHN0dWNrIHdhaXRpbmcgZm9yIHRoZVxuXHQgKiBlbnRpcmUgbWVzc2FnZSB0byBiZSByZWNlaXZlZCBiZWZvcmUgcHJvY2Vzc2luZyB0aGUgYnl0ZXMuXG5cdCAqL1xuXHRNYXhXZWJTb2NrZXRNZXNzYWdlTGVuZ3RoID0gMjU2ICogMTAyNCAvLyAyNTYgS0Jcbn1cblxuY29uc3QgZW51bSBSZWFkU3RhdGUge1xuXHRQZWVrSGVhZGVyID0gMSxcblx0UmVhZEhlYWRlciA9IDIsXG5cdFJlYWRCb2R5ID0gMyxcblx0RmluID0gNFxufVxuXG5pbnRlcmZhY2UgSVNvY2tldFRyYWNlciB7XG5cdHRyYWNlU29ja2V0RXZlbnQodHlwZTogU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUsIGRhdGE/OiBWU0J1ZmZlciB8IFVpbnQ4QXJyYXkgfCBBcnJheUJ1ZmZlciB8IEFycmF5QnVmZmVyVmlldyB8IHVua25vd24pOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgRnJhbWVPcHRpb25zIHtcblx0Y29tcHJlc3NlZDogYm9vbGVhbjtcblx0b3Bjb2RlOiBudW1iZXI7XG59XG5cbi8qKlxuICogU2VlIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM2NDU1I3NlY3Rpb24tNS4yXG4gKi9cbmV4cG9ydCBjbGFzcyBXZWJTb2NrZXROb2RlU29ja2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTb2NrZXQsIElTb2NrZXRUcmFjZXIge1xuXG5cdHB1YmxpYyByZWFkb25seSBzb2NrZXQ6IE5vZGVTb2NrZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Zsb3dNYW5hZ2VyOiBXZWJTb2NrZXRGbG93TWFuYWdlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5jb21pbmdEYXRhOiBDaHVua1N0cmVhbTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VlNCdWZmZXI+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U29ja2V0Q2xvc2VFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21heFNvY2tldE1lc3NhZ2VMZW5ndGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfaXNFbmRlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0ge1xuXHRcdHN0YXRlOiBSZWFkU3RhdGUuUGVla0hlYWRlcixcblx0XHRyZWFkTGVuOiBDb25zdGFudHMuTWluSGVhZGVyQnl0ZVNpemUsXG5cdFx0ZmluOiAwLFxuXHRcdGNvbXByZXNzZWQ6IGZhbHNlLFxuXHRcdGZpcnN0RnJhbWVPZk1lc3NhZ2U6IHRydWUsXG5cdFx0bWFzazogMCxcblx0XHRvcGNvZGU6IDBcblx0fTtcblxuXHRwdWJsaWMgZ2V0IHBlcm1lc3NhZ2VEZWZsYXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9mbG93TWFuYWdlci5wZXJtZXNzYWdlRGVmbGF0ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgcmVjb3JkZWRJbmZsYXRlQnl0ZXMoKTogVlNCdWZmZXIge1xuXHRcdHJldHVybiB0aGlzLl9mbG93TWFuYWdlci5yZWNvcmRlZEluZmxhdGVCeXRlcztcblx0fVxuXG5cdHB1YmxpYyBzZXRSZWNvcmRJbmZsYXRlQnl0ZXMocmVjb3JkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZmxvd01hbmFnZXIuc2V0UmVjb3JkSW5mbGF0ZUJ5dGVzKHJlY29yZCk7XG5cdH1cblxuXHRwdWJsaWMgdHJhY2VTb2NrZXRFdmVudCh0eXBlOiBTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZSwgZGF0YT86IFZTQnVmZmVyIHwgVWludDhBcnJheSB8IEFycmF5QnVmZmVyIHwgQXJyYXlCdWZmZXJWaWV3IHwgdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMuc29ja2V0LnRyYWNlU29ja2V0RXZlbnQodHlwZSwgZGF0YSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgc29ja2V0IHdoaWNoIGNhbiBjb21tdW5pY2F0ZSB1c2luZyBXZWJTb2NrZXQgZnJhbWVzLlxuXHQgKlxuXHQgKiAqKk5PVEUqKjogV2hlbiB1c2luZyB0aGUgcGVybWVzc2FnZS1kZWZsYXRlIFdlYlNvY2tldCBleHRlbnNpb24sIGlmIHBhcnRzIG9mIGluZmxhdGluZyB3YXMgZG9uZVxuXHQgKiAgaW4gYSBkaWZmZXJlbnQgemxpYiBpbnN0YW5jZSwgd2UgbmVlZCB0byBwYXNzIGFsbCB0aG9zZSBieXRlcyBpbnRvIHpsaWIsIG90aGVyd2lzZSB0aGUgaW5mbGF0ZVxuXHQgKiAgbWlnaHQgaGl0IGFuIGluZmxhdGVkIHBvcnRpb24gcmVmZXJlbmNpbmcgYSBkaXN0YW5jZSB0b28gZmFyIGJhY2suXG5cdCAqXG5cdCAqIEBwYXJhbSBzb2NrZXQgVGhlIHVuZGVybHlpbmcgc29ja2V0XG5cdCAqIEBwYXJhbSBwZXJtZXNzYWdlRGVmbGF0ZSBVc2UgdGhlIHBlcm1lc3NhZ2UtZGVmbGF0ZSBXZWJTb2NrZXQgZXh0ZW5zaW9uXG5cdCAqIEBwYXJhbSBpbmZsYXRlQnl0ZXMgXCJTZWVkXCIgemxpYiBpbmZsYXRlIHdpdGggdGhlc2UgYnl0ZXMuXG5cdCAqIEBwYXJhbSByZWNvcmRJbmZsYXRlQnl0ZXMgUmVjb3JkIGFsbCBieXRlcyBzZW50IHRvIGluZmxhdGVcblx0ICovXG5cdGNvbnN0cnVjdG9yKHNvY2tldDogTm9kZVNvY2tldCwgcGVybWVzc2FnZURlZmxhdGU6IGJvb2xlYW4sIGluZmxhdGVCeXRlczogVlNCdWZmZXIgfCBudWxsLCByZWNvcmRJbmZsYXRlQnl0ZXM6IGJvb2xlYW4sIGVuYWJsZU1lc3NhZ2VTcGxpdHRpbmcgPSB0cnVlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNvY2tldCA9IHNvY2tldDtcblx0XHR0aGlzLl9tYXhTb2NrZXRNZXNzYWdlTGVuZ3RoID0gZW5hYmxlTWVzc2FnZVNwbGl0dGluZyA/IENvbnN0YW50cy5NYXhXZWJTb2NrZXRNZXNzYWdlTGVuZ3RoIDogSW5maW5pdHk7XG5cdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLkNyZWF0ZWQsIHsgdHlwZTogJ1dlYlNvY2tldE5vZGVTb2NrZXQnLCBwZXJtZXNzYWdlRGVmbGF0ZSwgaW5mbGF0ZUJ5dGVzTGVuZ3RoOiBpbmZsYXRlQnl0ZXM/LmJ5dGVMZW5ndGggfHwgMCwgcmVjb3JkSW5mbGF0ZUJ5dGVzIH0pO1xuXHRcdHRoaXMuX2Zsb3dNYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFdlYlNvY2tldEZsb3dNYW5hZ2VyKFxuXHRcdFx0dGhpcyxcblx0XHRcdHBlcm1lc3NhZ2VEZWZsYXRlLFxuXHRcdFx0aW5mbGF0ZUJ5dGVzLFxuXHRcdFx0cmVjb3JkSW5mbGF0ZUJ5dGVzLFxuXHRcdFx0dGhpcy5fb25EYXRhLFxuXHRcdFx0KGRhdGEsIG9wdGlvbnMpID0+IHRoaXMuX3dyaXRlKGRhdGEsIG9wdGlvbnMpXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmxvd01hbmFnZXIub25FcnJvcigoZXJyKSA9PiB7XG5cdFx0XHQvLyB6bGliIGVycm9ycyBhcmUgZmF0YWwsIHNpbmNlIHdlIGhhdmUgbm8gaWRlYSBob3cgdG8gcmVjb3ZlclxuXHRcdFx0Y29uc29sZS5lcnJvcihlcnIpO1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdHRoaXMuX29uQ2xvc2UuZmlyZSh7XG5cdFx0XHRcdHR5cGU6IFNvY2tldENsb3NlRXZlbnRUeXBlLk5vZGVTb2NrZXRDbG9zZUV2ZW50LFxuXHRcdFx0XHRoYWRFcnJvcjogdHJ1ZSxcblx0XHRcdFx0ZXJyb3I6IGVyclxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2luY29taW5nRGF0YSA9IG5ldyBDaHVua1N0cmVhbSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc29ja2V0Lm9uRGF0YShkYXRhID0+IHRoaXMuX2FjY2VwdENodW5rKGRhdGEpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zb2NrZXQub25DbG9zZShhc3luYyAoZSkgPT4ge1xuXHRcdFx0Ly8gRGVsYXkgc3VyZmFjaW5nIHRoZSBjbG9zZSBldmVudCB1bnRpbCB0aGUgYXN5bmMgaW5mbGF0aW5nIGlzIGRvbmVcblx0XHRcdC8vIGFuZCBhbGwgZGF0YSBoYXMgYmVlbiBlbWl0dGVkXG5cdFx0XHRpZiAodGhpcy5fZmxvd01hbmFnZXIuaXNQcm9jZXNzaW5nUmVhZFF1ZXVlKCkpIHtcblx0XHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHRoaXMuX2Zsb3dNYW5hZ2VyLm9uRGlkRmluaXNoUHJvY2Vzc2luZ1JlYWRRdWV1ZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkNsb3NlLmZpcmUoZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Zsb3dNYW5hZ2VyLmlzUHJvY2Vzc2luZ1dyaXRlUXVldWUoKSkge1xuXHRcdFx0Ly8gV2FpdCBmb3IgYW55IG91dHN0YW5kaW5nIHdyaXRlcyB0byBmaW5pc2ggYmVmb3JlIGRpc3Bvc2luZ1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmxvd01hbmFnZXIub25EaWRGaW5pc2hQcm9jZXNzaW5nV3JpdGVRdWV1ZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNvY2tldC5kaXNwb3NlKCk7XG5cdFx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG9uRGF0YShsaXN0ZW5lcjogKGU6IFZTQnVmZmVyKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLl9vbkRhdGEuZXZlbnQobGlzdGVuZXIpO1xuXHR9XG5cblx0cHVibGljIG9uQ2xvc2UobGlzdGVuZXI6IChlOiBTb2NrZXRDbG9zZUV2ZW50KSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLl9vbkNsb3NlLmV2ZW50KGxpc3RlbmVyKTtcblx0fVxuXG5cdHB1YmxpYyBvbkVuZChsaXN0ZW5lcjogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5zb2NrZXQub25FbmQobGlzdGVuZXIpO1xuXHR9XG5cblx0cHVibGljIHdyaXRlKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHQvLyBJZiB3ZSB3cml0ZSBtYW55IGxvZ2ljYWwgbWVzc2FnZXMgKGxldCdzIHNheSAxMDAwIG1lc3NhZ2VzIG9mIDEwMEtCKSBkdXJpbmcgYSBzaW5nbGUgcHJvY2VzcyB0aWNrLCB3ZSBkb1xuXHRcdC8vIHRoaXMgdGhpbmcgd2hlcmUgd2UgaW5zdGFsbCBhIHByb2Nlc3MubmV4dFRpY2sgdGltZXIgYW5kIGdyb3VwIGFsbCBvZiB0aGVtIHRvZ2V0aGVyIGFuZCB3ZSB0aGVuIGlzc3VlIGFcblx0XHQvLyBzaW5nbGUgV2ViU29ja2V0Tm9kZVNvY2tldC53cml0ZSB3aXRoIGEgMTAwTUIgYnVmZmVyLlxuXHRcdC8vXG5cdFx0Ly8gVGhlIGZpcnN0IHByb2JsZW0gaXMgdGhhdCB0aGUgYWN0dWFsIHdyaXRpbmcgdG8gdGhlIHVuZGVybHlpbmcgbm9kZSBzb2NrZXQgd2lsbCBvbmx5IGhhcHBlbiBhZnRlciBhbGwgb2Zcblx0XHQvLyB0aGUgMTAwTUIgaGF2ZSBiZWVuIGRlZmxhdGVkIChkdWUgdG8gd2FpdGluZyBvbiB6bGliIGZsdXNoKS4gVGhlIHNlY29uZCBwcm9ibGVtIGlzIG9uIHRoZSByZWFkaW5nIHNpZGUsXG5cdFx0Ly8gd2hlcmUgd2Ugd2lsbCBnZXQgYSBzaW5nbGUgV2ViU29ja2V0Tm9kZVNvY2tldC5vbkRhdGEgZXZlbnQgZmlyZWQgd2hlbiBhbGwgdGhlIDEwME1CIGhhdmUgYXJyaXZlZCxcblx0XHQvLyBkZWxheWluZyBwcm9jZXNzaW5nIHRoZSAxMDAwIHJlY2VpdmVkIG1lc3NhZ2VzIHVudGlsIGFsbCBoYXZlIGFycml2ZWQsIGluc3RlYWQgb2YgcHJvY2Vzc2luZyB0aGVtIGFzIGVhY2hcblx0XHQvLyBvbmUgYXJyaXZlcy5cblx0XHQvL1xuXHRcdC8vIFdlIHRoZXJlZm9yZSBzcGxpdCB0aGUgYnVmZmVyIGludG8gY2h1bmtzLCBhbmQgaXNzdWUgYSB3cml0ZSBmb3IgZWFjaCBjaHVuay5cblxuXHRcdGxldCBzdGFydCA9IDA7XG5cdFx0d2hpbGUgKHN0YXJ0IDwgYnVmZmVyLmJ5dGVMZW5ndGgpIHtcblx0XHRcdHRoaXMuX2Zsb3dNYW5hZ2VyLndyaXRlTWVzc2FnZShidWZmZXIuc2xpY2Uoc3RhcnQsIE1hdGgubWluKHN0YXJ0ICsgdGhpcy5fbWF4U29ja2V0TWVzc2FnZUxlbmd0aCwgYnVmZmVyLmJ5dGVMZW5ndGgpKSwgeyBjb21wcmVzc2VkOiB0cnVlLCBvcGNvZGU6IDB4MDIgLyogQmluYXJ5IGZyYW1lICovIH0pO1xuXHRcdFx0c3RhcnQgKz0gdGhpcy5fbWF4U29ja2V0TWVzc2FnZUxlbmd0aDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93cml0ZShidWZmZXI6IFZTQnVmZmVyLCB7IGNvbXByZXNzZWQsIG9wY29kZSB9OiBGcmFtZU9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNFbmRlZCkge1xuXHRcdFx0Ly8gQXZvaWQgRVJSX1NUUkVBTV9XUklURV9BRlRFUl9FTkRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuV2ViU29ja2V0Tm9kZVNvY2tldFdyaXRlLCBidWZmZXIpO1xuXHRcdGxldCBoZWFkZXJMZW4gPSBDb25zdGFudHMuTWluSGVhZGVyQnl0ZVNpemU7XG5cdFx0aWYgKGJ1ZmZlci5ieXRlTGVuZ3RoIDwgMTI2KSB7XG5cdFx0XHRoZWFkZXJMZW4gKz0gMDtcblx0XHR9IGVsc2UgaWYgKGJ1ZmZlci5ieXRlTGVuZ3RoIDwgMiAqKiAxNikge1xuXHRcdFx0aGVhZGVyTGVuICs9IDI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGhlYWRlckxlbiArPSA4O1xuXHRcdH1cblx0XHRjb25zdCBoZWFkZXIgPSBWU0J1ZmZlci5hbGxvYyhoZWFkZXJMZW4pO1xuXG5cdFx0Ly8gVGhlIFJTVjEgYml0IGluZGljYXRlcyBhIGNvbXByZXNzZWQgZnJhbWVcblx0XHRjb25zdCBjb21wcmVzc2VkRmxhZyA9IGNvbXByZXNzZWQgPyAwYjAxMDAwMDAwIDogMDtcblx0XHRjb25zdCBvcGNvZGVGbGFnID0gb3Bjb2RlICYgMGIwMDAwMTExMTtcblx0XHRoZWFkZXIud3JpdGVVSW50OCgwYjEwMDAwMDAwIHwgY29tcHJlc3NlZEZsYWcgfCBvcGNvZGVGbGFnLCAwKTtcblx0XHRpZiAoYnVmZmVyLmJ5dGVMZW5ndGggPCAxMjYpIHtcblx0XHRcdGhlYWRlci53cml0ZVVJbnQ4KGJ1ZmZlci5ieXRlTGVuZ3RoLCAxKTtcblx0XHR9IGVsc2UgaWYgKGJ1ZmZlci5ieXRlTGVuZ3RoIDwgMiAqKiAxNikge1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoMTI2LCAxKTtcblx0XHRcdGxldCBvZmZzZXQgPSAxO1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoKGJ1ZmZlci5ieXRlTGVuZ3RoID4+PiA4KSAmIDBiMTExMTExMTEsICsrb2Zmc2V0KTtcblx0XHRcdGhlYWRlci53cml0ZVVJbnQ4KChidWZmZXIuYnl0ZUxlbmd0aCA+Pj4gMCkgJiAwYjExMTExMTExLCArK29mZnNldCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGhlYWRlci53cml0ZVVJbnQ4KDEyNywgMSk7XG5cdFx0XHRsZXQgb2Zmc2V0ID0gMTtcblx0XHRcdGhlYWRlci53cml0ZVVJbnQ4KDAsICsrb2Zmc2V0KTtcblx0XHRcdGhlYWRlci53cml0ZVVJbnQ4KDAsICsrb2Zmc2V0KTtcblx0XHRcdGhlYWRlci53cml0ZVVJbnQ4KDAsICsrb2Zmc2V0KTtcblx0XHRcdGhlYWRlci53cml0ZVVJbnQ4KDAsICsrb2Zmc2V0KTtcblx0XHRcdGhlYWRlci53cml0ZVVJbnQ4KChidWZmZXIuYnl0ZUxlbmd0aCA+Pj4gMjQpICYgMGIxMTExMTExMSwgKytvZmZzZXQpO1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoKGJ1ZmZlci5ieXRlTGVuZ3RoID4+PiAxNikgJiAwYjExMTExMTExLCArK29mZnNldCk7XG5cdFx0XHRoZWFkZXIud3JpdGVVSW50OCgoYnVmZmVyLmJ5dGVMZW5ndGggPj4+IDgpICYgMGIxMTExMTExMSwgKytvZmZzZXQpO1xuXHRcdFx0aGVhZGVyLndyaXRlVUludDgoKGJ1ZmZlci5ieXRlTGVuZ3RoID4+PiAwKSAmIDBiMTExMTExMTEsICsrb2Zmc2V0KTtcblx0XHR9XG5cblx0XHR0aGlzLnNvY2tldC53cml0ZShWU0J1ZmZlci5jb25jYXQoW2hlYWRlciwgYnVmZmVyXSkpO1xuXHR9XG5cblx0cHVibGljIGVuZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0VuZGVkID0gdHJ1ZTtcblx0XHR0aGlzLnNvY2tldC5lbmQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2FjY2VwdENodW5rKGRhdGE6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0aWYgKGRhdGEuYnl0ZUxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2luY29taW5nRGF0YS5hY2NlcHRDaHVuayhkYXRhKTtcblxuXHRcdHdoaWxlICh0aGlzLl9pbmNvbWluZ0RhdGEuYnl0ZUxlbmd0aCA+PSB0aGlzLl9zdGF0ZS5yZWFkTGVuKSB7XG5cblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5zdGF0ZSA9PT0gUmVhZFN0YXRlLlBlZWtIZWFkZXIpIHtcblx0XHRcdFx0Ly8gcGVlayB0byBzZWUgaWYgd2UgY2FuIHJlYWQgdGhlIGVudGlyZSBoZWFkZXJcblx0XHRcdFx0Y29uc3QgcGVla0hlYWRlciA9IHRoaXMuX2luY29taW5nRGF0YS5wZWVrKHRoaXMuX3N0YXRlLnJlYWRMZW4pO1xuXHRcdFx0XHRjb25zdCBmaXJzdEJ5dGUgPSBwZWVrSGVhZGVyLnJlYWRVSW50OCgwKTtcblx0XHRcdFx0Y29uc3QgZmluQml0ID0gKGZpcnN0Qnl0ZSAmIDBiMTAwMDAwMDApID4+PiA3O1xuXHRcdFx0XHRjb25zdCByc3YxQml0ID0gKGZpcnN0Qnl0ZSAmIDBiMDEwMDAwMDApID4+PiA2O1xuXHRcdFx0XHRjb25zdCBvcGNvZGUgPSAoZmlyc3RCeXRlICYgMGIwMDAwMTExMSk7XG5cblx0XHRcdFx0Y29uc3Qgc2Vjb25kQnl0ZSA9IHBlZWtIZWFkZXIucmVhZFVJbnQ4KDEpO1xuXHRcdFx0XHRjb25zdCBoYXNNYXNrID0gKHNlY29uZEJ5dGUgJiAwYjEwMDAwMDAwKSA+Pj4gNztcblx0XHRcdFx0Y29uc3QgbGVuID0gKHNlY29uZEJ5dGUgJiAwYjAxMTExMTExKTtcblxuXHRcdFx0XHR0aGlzLl9zdGF0ZS5zdGF0ZSA9IFJlYWRTdGF0ZS5SZWFkSGVhZGVyO1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5yZWFkTGVuID0gQ29uc3RhbnRzLk1pbkhlYWRlckJ5dGVTaXplICsgKGhhc01hc2sgPyA0IDogMCkgKyAobGVuID09PSAxMjYgPyAyIDogMCkgKyAobGVuID09PSAxMjcgPyA4IDogMCk7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmZpbiA9IGZpbkJpdDtcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlLmZpcnN0RnJhbWVPZk1lc3NhZ2UpIHtcblx0XHRcdFx0XHQvLyBpZiB0aGUgZnJhbWUgaXMgY29tcHJlc3NlZCwgdGhlIFJTVjEgYml0IGlzIHNldCBvbmx5IGZvciB0aGUgZmlyc3QgZnJhbWUgb2YgdGhlIG1lc3NhZ2Vcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZS5jb21wcmVzc2VkID0gQm9vbGVhbihyc3YxQml0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zdGF0ZS5maXJzdEZyYW1lT2ZNZXNzYWdlID0gQm9vbGVhbihmaW5CaXQpO1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5tYXNrID0gMDtcblx0XHRcdFx0dGhpcy5fc3RhdGUub3Bjb2RlID0gb3Bjb2RlO1xuXG5cdFx0XHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5XZWJTb2NrZXROb2RlU29ja2V0UGVla2VkSGVhZGVyLCB7IGhlYWRlclNpemU6IHRoaXMuX3N0YXRlLnJlYWRMZW4sIGNvbXByZXNzZWQ6IHRoaXMuX3N0YXRlLmNvbXByZXNzZWQsIGZpbjogdGhpcy5fc3RhdGUuZmluLCBvcGNvZGU6IHRoaXMuX3N0YXRlLm9wY29kZSB9KTtcblxuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9zdGF0ZS5zdGF0ZSA9PT0gUmVhZFN0YXRlLlJlYWRIZWFkZXIpIHtcblx0XHRcdFx0Ly8gcmVhZCBlbnRpcmUgaGVhZGVyXG5cdFx0XHRcdGNvbnN0IGhlYWRlciA9IHRoaXMuX2luY29taW5nRGF0YS5yZWFkKHRoaXMuX3N0YXRlLnJlYWRMZW4pO1xuXHRcdFx0XHRjb25zdCBzZWNvbmRCeXRlID0gaGVhZGVyLnJlYWRVSW50OCgxKTtcblx0XHRcdFx0Y29uc3QgaGFzTWFzayA9IChzZWNvbmRCeXRlICYgMGIxMDAwMDAwMCkgPj4+IDc7XG5cdFx0XHRcdGxldCBsZW4gPSAoc2Vjb25kQnl0ZSAmIDBiMDExMTExMTEpO1xuXG5cdFx0XHRcdGxldCBvZmZzZXQgPSAxO1xuXHRcdFx0XHRpZiAobGVuID09PSAxMjYpIHtcblx0XHRcdFx0XHRsZW4gPSAoXG5cdFx0XHRcdFx0XHRoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KSAqIDIgKiogOFxuXHRcdFx0XHRcdFx0KyBoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAobGVuID09PSAxMjcpIHtcblx0XHRcdFx0XHRsZW4gPSAoXG5cdFx0XHRcdFx0XHRoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KSAqIDBcblx0XHRcdFx0XHRcdCsgaGVhZGVyLnJlYWRVSW50OCgrK29mZnNldCkgKiAwXG5cdFx0XHRcdFx0XHQrIGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpICogMFxuXHRcdFx0XHRcdFx0KyBoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KSAqIDBcblx0XHRcdFx0XHRcdCsgaGVhZGVyLnJlYWRVSW50OCgrK29mZnNldCkgKiAyICoqIDI0XG5cdFx0XHRcdFx0XHQrIGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpICogMiAqKiAxNlxuXHRcdFx0XHRcdFx0KyBoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KSAqIDIgKiogOFxuXHRcdFx0XHRcdFx0KyBoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgbWFzayA9IDA7XG5cdFx0XHRcdGlmIChoYXNNYXNrKSB7XG5cdFx0XHRcdFx0bWFzayA9IChcblx0XHRcdFx0XHRcdGhlYWRlci5yZWFkVUludDgoKytvZmZzZXQpICogMiAqKiAyNFxuXHRcdFx0XHRcdFx0KyBoZWFkZXIucmVhZFVJbnQ4KCsrb2Zmc2V0KSAqIDIgKiogMTZcblx0XHRcdFx0XHRcdCsgaGVhZGVyLnJlYWRVSW50OCgrK29mZnNldCkgKiAyICoqIDhcblx0XHRcdFx0XHRcdCsgaGVhZGVyLnJlYWRVSW50OCgrK29mZnNldClcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fc3RhdGUuc3RhdGUgPSBSZWFkU3RhdGUuUmVhZEJvZHk7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnJlYWRMZW4gPSBsZW47XG5cdFx0XHRcdHRoaXMuX3N0YXRlLm1hc2sgPSBtYXNrO1xuXG5cdFx0XHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5XZWJTb2NrZXROb2RlU29ja2V0UGVla2VkSGVhZGVyLCB7IGJvZHlTaXplOiB0aGlzLl9zdGF0ZS5yZWFkTGVuLCBjb21wcmVzc2VkOiB0aGlzLl9zdGF0ZS5jb21wcmVzc2VkLCBmaW46IHRoaXMuX3N0YXRlLmZpbiwgbWFzazogdGhpcy5fc3RhdGUubWFzaywgb3Bjb2RlOiB0aGlzLl9zdGF0ZS5vcGNvZGUgfSk7XG5cblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fc3RhdGUuc3RhdGUgPT09IFJlYWRTdGF0ZS5SZWFkQm9keSkge1xuXHRcdFx0XHQvLyByZWFkIGJvZHlcblxuXHRcdFx0XHRjb25zdCBib2R5ID0gdGhpcy5faW5jb21pbmdEYXRhLnJlYWQodGhpcy5fc3RhdGUucmVhZExlbik7XG5cdFx0XHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5XZWJTb2NrZXROb2RlU29ja2V0UmVhZERhdGEsIGJvZHkpO1xuXG5cdFx0XHRcdHVubWFzayhib2R5LCB0aGlzLl9zdGF0ZS5tYXNrKTtcblx0XHRcdFx0dGhpcy50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLldlYlNvY2tldE5vZGVTb2NrZXRVbm1hc2tlZERhdGEsIGJvZHkpO1xuXG5cdFx0XHRcdHRoaXMuX3N0YXRlLnN0YXRlID0gUmVhZFN0YXRlLlBlZWtIZWFkZXI7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLnJlYWRMZW4gPSBDb25zdGFudHMuTWluSGVhZGVyQnl0ZVNpemU7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLm1hc2sgPSAwO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZS5vcGNvZGUgPD0gMHgwMiAvKiBDb250aW51YXRpb24gZnJhbWUgb3IgVGV4dCBmcmFtZSBvciBiaW5hcnkgZnJhbWUgKi8pIHtcblx0XHRcdFx0XHR0aGlzLl9mbG93TWFuYWdlci5hY2NlcHRGcmFtZShib2R5LCB0aGlzLl9zdGF0ZS5jb21wcmVzc2VkLCAhIXRoaXMuX3N0YXRlLmZpbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fc3RhdGUub3Bjb2RlID09PSAweDA5IC8qIFBpbmcgZnJhbWUgKi8pIHtcblx0XHRcdFx0XHQvLyBQaW5nIGZyYW1lcyBjb3VsZCBiZSBzZW5kIGJ5IHNvbWUgYnJvd3NlcnMgZS5nLiBGaXJlZm94XG5cdFx0XHRcdFx0dGhpcy5fZmxvd01hbmFnZXIud3JpdGVNZXNzYWdlKGJvZHksIHsgY29tcHJlc3NlZDogZmFsc2UsIG9wY29kZTogMHgwQSAvKiBQb25nIGZyYW1lICovIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGRyYWluKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5XZWJTb2NrZXROb2RlU29ja2V0RHJhaW5CZWdpbik7XG5cdFx0aWYgKHRoaXMuX2Zsb3dNYW5hZ2VyLmlzUHJvY2Vzc2luZ1dyaXRlUXVldWUoKSkge1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHRoaXMuX2Zsb3dNYW5hZ2VyLm9uRGlkRmluaXNoUHJvY2Vzc2luZ1dyaXRlUXVldWUpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnNvY2tldC5kcmFpbigpO1xuXHRcdHRoaXMudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS5XZWJTb2NrZXROb2RlU29ja2V0RHJhaW5FbmQpO1xuXHR9XG59XG5cbmNsYXNzIFdlYlNvY2tldEZsb3dNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25FcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEVycm9yPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRXJyb3IgPSB0aGlzLl9vbkVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3psaWJJbmZsYXRlU3RyZWFtOiBabGliSW5mbGF0ZVN0cmVhbSB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3psaWJEZWZsYXRlU3RyZWFtOiBabGliRGVmbGF0ZVN0cmVhbSB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dyaXRlUXVldWU6IHsgZGF0YTogVlNCdWZmZXI7IG9wdGlvbnM6IEZyYW1lT3B0aW9ucyB9W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVhZFF1ZXVlOiB7IGRhdGE6IFZTQnVmZmVyOyBpc0NvbXByZXNzZWQ6IGJvb2xlYW47IGlzTGFzdEZyYW1lT2ZNZXNzYWdlOiBib29sZWFuIH1bXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRmluaXNoUHJvY2Vzc2luZ1JlYWRRdWV1ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRGaW5pc2hQcm9jZXNzaW5nUmVhZFF1ZXVlID0gdGhpcy5fb25EaWRGaW5pc2hQcm9jZXNzaW5nUmVhZFF1ZXVlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRmluaXNoUHJvY2Vzc2luZ1dyaXRlUXVldWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkRmluaXNoUHJvY2Vzc2luZ1dyaXRlUXVldWUgPSB0aGlzLl9vbkRpZEZpbmlzaFByb2Nlc3NpbmdXcml0ZVF1ZXVlLmV2ZW50O1xuXG5cdHB1YmxpYyBnZXQgcGVybWVzc2FnZURlZmxhdGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIEJvb2xlYW4odGhpcy5femxpYkluZmxhdGVTdHJlYW0gJiYgdGhpcy5femxpYkRlZmxhdGVTdHJlYW0pO1xuXHR9XG5cblx0cHVibGljIGdldCByZWNvcmRlZEluZmxhdGVCeXRlcygpOiBWU0J1ZmZlciB7XG5cdFx0aWYgKHRoaXMuX3psaWJJbmZsYXRlU3RyZWFtKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5femxpYkluZmxhdGVTdHJlYW0ucmVjb3JkZWRJbmZsYXRlQnl0ZXM7XG5cdFx0fVxuXHRcdHJldHVybiBWU0J1ZmZlci5hbGxvYygwKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRSZWNvcmRJbmZsYXRlQnl0ZXMocmVjb3JkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5femxpYkluZmxhdGVTdHJlYW0/LnNldFJlY29yZEluZmxhdGVCeXRlcyhyZWNvcmQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJhY2VyOiBJU29ja2V0VHJhY2VyLFxuXHRcdHBlcm1lc3NhZ2VEZWZsYXRlOiBib29sZWFuLFxuXHRcdGluZmxhdGVCeXRlczogVlNCdWZmZXIgfCBudWxsLFxuXHRcdHJlY29yZEluZmxhdGVCeXRlczogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRhdGE6IEVtaXR0ZXI8VlNCdWZmZXI+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dyaXRlRm46IChkYXRhOiBWU0J1ZmZlciwgb3B0aW9uczogRnJhbWVPcHRpb25zKSA9PiB2b2lkXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0aWYgKHBlcm1lc3NhZ2VEZWZsYXRlKSB7XG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzc2OTIjcGFnZS0xNlxuXHRcdFx0Ly8gVG8gc2ltcGxpZnkgb3VyIGxvZ2ljLCB3ZSBkb24ndCBuZWdvdGlhdGUgdGhlIHdpbmRvdyBzaXplXG5cdFx0XHQvLyBhbmQgc2ltcGx5IGRlZGljYXRlICgyXjE1KSAvIDMya2IgcGVyIHdlYiBzb2NrZXRcblx0XHRcdHRoaXMuX3psaWJJbmZsYXRlU3RyZWFtID0gdGhpcy5fcmVnaXN0ZXIobmV3IFpsaWJJbmZsYXRlU3RyZWFtKHRoaXMuX3RyYWNlciwgcmVjb3JkSW5mbGF0ZUJ5dGVzLCBpbmZsYXRlQnl0ZXMsIHsgd2luZG93Qml0czogMTUgfSkpO1xuXHRcdFx0dGhpcy5femxpYkRlZmxhdGVTdHJlYW0gPSB0aGlzLl9yZWdpc3RlcihuZXcgWmxpYkRlZmxhdGVTdHJlYW0odGhpcy5fdHJhY2VyLCB7IHdpbmRvd0JpdHM6IDE1IH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3psaWJJbmZsYXRlU3RyZWFtLm9uRXJyb3IoKGVycikgPT4gdGhpcy5fb25FcnJvci5maXJlKGVycikpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3psaWJEZWZsYXRlU3RyZWFtLm9uRXJyb3IoKGVycikgPT4gdGhpcy5fb25FcnJvci5maXJlKGVycikpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5femxpYkluZmxhdGVTdHJlYW0gPSBudWxsO1xuXHRcdFx0dGhpcy5femxpYkRlZmxhdGVTdHJlYW0gPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB3cml0ZU1lc3NhZ2UoZGF0YTogVlNCdWZmZXIsIG9wdGlvbnM6IEZyYW1lT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX3dyaXRlUXVldWUucHVzaCh7IGRhdGEsIG9wdGlvbnMgfSk7XG5cdFx0dGhpcy5fcHJvY2Vzc1dyaXRlUXVldWUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzUHJvY2Vzc2luZ1dyaXRlUXVldWUgPSBmYWxzZTtcblx0cHJpdmF0ZSBhc3luYyBfcHJvY2Vzc1dyaXRlUXVldWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lzUHJvY2Vzc2luZ1dyaXRlUXVldWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNQcm9jZXNzaW5nV3JpdGVRdWV1ZSA9IHRydWU7XG5cdFx0d2hpbGUgKHRoaXMuX3dyaXRlUXVldWUubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgeyBkYXRhLCBvcHRpb25zIH0gPSB0aGlzLl93cml0ZVF1ZXVlLnNoaWZ0KCkhO1xuXHRcdFx0aWYgKHRoaXMuX3psaWJEZWZsYXRlU3RyZWFtICYmIG9wdGlvbnMuY29tcHJlc3NlZCkge1xuXHRcdFx0XHRjb25zdCBjb21wcmVzc2VkRGF0YSA9IGF3YWl0IHRoaXMuX2RlZmxhdGVNZXNzYWdlKHRoaXMuX3psaWJEZWZsYXRlU3RyZWFtLCBkYXRhKTtcblx0XHRcdFx0dGhpcy5fd3JpdGVGbihjb21wcmVzc2VkRGF0YSwgb3B0aW9ucyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl93cml0ZUZuKGRhdGEsIHsgLi4ub3B0aW9ucywgY29tcHJlc3NlZDogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2lzUHJvY2Vzc2luZ1dyaXRlUXVldWUgPSBmYWxzZTtcblx0XHR0aGlzLl9vbkRpZEZpbmlzaFByb2Nlc3NpbmdXcml0ZVF1ZXVlLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBpc1Byb2Nlc3NpbmdXcml0ZVF1ZXVlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5faXNQcm9jZXNzaW5nV3JpdGVRdWV1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2VxdWVudCBjYWxscyBzaG91bGQgd2FpdCBmb3IgdGhlIHByZXZpb3VzIGBfZGVmbGF0ZUJ1ZmZlcmAgY2FsbCB0byBjb21wbGV0ZS5cblx0ICovXG5cdHByaXZhdGUgX2RlZmxhdGVNZXNzYWdlKHpsaWJEZWZsYXRlU3RyZWFtOiBabGliRGVmbGF0ZVN0cmVhbSwgYnVmZmVyOiBWU0J1ZmZlcik6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8VlNCdWZmZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHpsaWJEZWZsYXRlU3RyZWFtLndyaXRlKGJ1ZmZlcik7XG5cdFx0XHR6bGliRGVmbGF0ZVN0cmVhbS5mbHVzaChkYXRhID0+IHJlc29sdmUoZGF0YSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdEZyYW1lKGRhdGE6IFZTQnVmZmVyLCBpc0NvbXByZXNzZWQ6IGJvb2xlYW4sIGlzTGFzdEZyYW1lT2ZNZXNzYWdlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVhZFF1ZXVlLnB1c2goeyBkYXRhLCBpc0NvbXByZXNzZWQsIGlzTGFzdEZyYW1lT2ZNZXNzYWdlIH0pO1xuXHRcdHRoaXMuX3Byb2Nlc3NSZWFkUXVldWUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzUHJvY2Vzc2luZ1JlYWRRdWV1ZSA9IGZhbHNlO1xuXHRwcml2YXRlIGFzeW5jIF9wcm9jZXNzUmVhZFF1ZXVlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pc1Byb2Nlc3NpbmdSZWFkUXVldWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faXNQcm9jZXNzaW5nUmVhZFF1ZXVlID0gdHJ1ZTtcblx0XHR3aGlsZSAodGhpcy5fcmVhZFF1ZXVlLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGZyYW1lSW5mbyA9IHRoaXMuX3JlYWRRdWV1ZS5zaGlmdCgpITtcblx0XHRcdGlmICh0aGlzLl96bGliSW5mbGF0ZVN0cmVhbSAmJiBmcmFtZUluZm8uaXNDb21wcmVzc2VkKSB7XG5cdFx0XHRcdC8vIFNlZSBodHRwczovL2RhdGF0cmFja2VyLmlldGYub3JnL2RvYy9odG1sL3JmYzc2OTIjc2VjdGlvbi05LjJcblx0XHRcdFx0Ly8gRXZlbiBpZiBwZXJtZXNzYWdlRGVmbGF0ZSBpcyBuZWdvdGlhdGVkLCBpdCBpcyBwb3NzaWJsZVxuXHRcdFx0XHQvLyB0aGF0IHRoZSBvdGhlciBzaWRlIG1pZ2h0IGRlY2lkZSB0byBzZW5kIHVuY29tcHJlc3NlZCBtZXNzYWdlc1xuXHRcdFx0XHQvLyBTbyBvbmx5IGRlY29tcHJlc3MgbWVzc2FnZXMgdGhhdCBoYXZlIHRoZSBSU1YgMSBiaXQgc2V0XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLl9pbmZsYXRlRnJhbWUodGhpcy5femxpYkluZmxhdGVTdHJlYW0sIGZyYW1lSW5mby5kYXRhLCBmcmFtZUluZm8uaXNMYXN0RnJhbWVPZk1lc3NhZ2UpO1xuXHRcdFx0XHR0aGlzLl9vbkRhdGEuZmlyZShkYXRhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uRGF0YS5maXJlKGZyYW1lSW5mby5kYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5faXNQcm9jZXNzaW5nUmVhZFF1ZXVlID0gZmFsc2U7XG5cdFx0dGhpcy5fb25EaWRGaW5pc2hQcm9jZXNzaW5nUmVhZFF1ZXVlLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBpc1Byb2Nlc3NpbmdSZWFkUXVldWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLl9pc1Byb2Nlc3NpbmdSZWFkUXVldWUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN1YnNlcXVlbnQgY2FsbHMgc2hvdWxkIHdhaXQgZm9yIHRoZSBwcmV2aW91cyBgdHJhbnNmb3JtUmVhZGAgY2FsbCB0byBjb21wbGV0ZS5cblx0ICovXG5cdHByaXZhdGUgX2luZmxhdGVGcmFtZSh6bGliSW5mbGF0ZVN0cmVhbTogWmxpYkluZmxhdGVTdHJlYW0sIGJ1ZmZlcjogVlNCdWZmZXIsIGlzTGFzdEZyYW1lT2ZNZXNzYWdlOiBib29sZWFuKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxWU0J1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM3NjkyI3NlY3Rpb24tNy4yLjJcblx0XHRcdHpsaWJJbmZsYXRlU3RyZWFtLndyaXRlKGJ1ZmZlcik7XG5cdFx0XHRpZiAoaXNMYXN0RnJhbWVPZk1lc3NhZ2UpIHtcblx0XHRcdFx0emxpYkluZmxhdGVTdHJlYW0ud3JpdGUoVlNCdWZmZXIuZnJvbUJ5dGVBcnJheShbMHgwMCwgMHgwMCwgMHhmZiwgMHhmZl0pKTtcblx0XHRcdH1cblx0XHRcdHpsaWJJbmZsYXRlU3RyZWFtLmZsdXNoKGRhdGEgPT4gcmVzb2x2ZShkYXRhKSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgWmxpYkluZmxhdGVTdHJlYW0gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RXJyb3I+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25FcnJvciA9IHRoaXMuX29uRXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfemxpYkluZmxhdGU6IEluZmxhdGVSYXc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY29yZGVkSW5mbGF0ZUJ5dGVzOiBWU0J1ZmZlcltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdJbmZsYXRlRGF0YTogVlNCdWZmZXJbXSA9IFtdO1xuXHRwcml2YXRlIF9yZWNvcmRJbmZsYXRlQnl0ZXM6IGJvb2xlYW47XG5cblx0cHVibGljIGdldCByZWNvcmRlZEluZmxhdGVCeXRlcygpOiBWU0J1ZmZlciB7XG5cdFx0aWYgKHRoaXMuX3JlY29yZEluZmxhdGVCeXRlcykge1xuXHRcdFx0cmV0dXJuIFZTQnVmZmVyLmNvbmNhdCh0aGlzLl9yZWNvcmRlZEluZmxhdGVCeXRlcyk7XG5cdFx0fVxuXHRcdHJldHVybiBWU0J1ZmZlci5hbGxvYygwKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RyYWNlcjogSVNvY2tldFRyYWNlcixcblx0XHRyZWNvcmRJbmZsYXRlQnl0ZXM6IGJvb2xlYW4sXG5cdFx0aW5mbGF0ZUJ5dGVzOiBWU0J1ZmZlciB8IG51bGwsXG5cdFx0b3B0aW9uczogWmxpYk9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWNvcmRJbmZsYXRlQnl0ZXMgPSByZWNvcmRJbmZsYXRlQnl0ZXM7XG5cdFx0dGhpcy5femxpYkluZmxhdGUgPSBjcmVhdGVJbmZsYXRlUmF3KG9wdGlvbnMpO1xuXHRcdHRoaXMuX3psaWJJbmZsYXRlLm9uKCdlcnJvcicsIChlcnI6IEVycm9yKSA9PiB7XG5cdFx0XHR0aGlzLl90cmFjZXIudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS56bGliSW5mbGF0ZUVycm9yLCB7IG1lc3NhZ2U6IGVycj8ubWVzc2FnZSwgY29kZTogKGVyciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pPy5jb2RlIH0pO1xuXHRcdFx0dGhpcy5fb25FcnJvci5maXJlKGVycik7XG5cdFx0fSk7XG5cdFx0dGhpcy5femxpYkluZmxhdGUub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7XG5cdFx0XHR0aGlzLl90cmFjZXIudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS56bGliSW5mbGF0ZURhdGEsIGRhdGEpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0luZmxhdGVEYXRhLnB1c2goVlNCdWZmZXIud3JhcChkYXRhKSk7XG5cdFx0fSk7XG5cdFx0aWYgKGluZmxhdGVCeXRlcykge1xuXHRcdFx0dGhpcy5fdHJhY2VyLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuemxpYkluZmxhdGVJbml0aWFsV3JpdGUsIGluZmxhdGVCeXRlcy5idWZmZXIpO1xuXHRcdFx0dGhpcy5femxpYkluZmxhdGUud3JpdGUoaW5mbGF0ZUJ5dGVzLmJ1ZmZlcik7XG5cdFx0XHR0aGlzLl96bGliSW5mbGF0ZS5mbHVzaCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3RyYWNlci50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLnpsaWJJbmZsYXRlSW5pdGlhbEZsdXNoRmlyZWQpO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nSW5mbGF0ZURhdGEubGVuZ3RoID0gMDtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB3cml0ZShidWZmZXI6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlY29yZEluZmxhdGVCeXRlcykge1xuXHRcdFx0dGhpcy5fcmVjb3JkZWRJbmZsYXRlQnl0ZXMucHVzaChidWZmZXIuY2xvbmUoKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3RyYWNlci50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLnpsaWJJbmZsYXRlV3JpdGUsIGJ1ZmZlcik7XG5cdFx0dGhpcy5femxpYkluZmxhdGUud3JpdGUoYnVmZmVyLmJ1ZmZlcik7XG5cdH1cblxuXHRwdWJsaWMgc2V0UmVjb3JkSW5mbGF0ZUJ5dGVzKHJlY29yZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3JlY29yZEluZmxhdGVCeXRlcyA9IHJlY29yZDtcblx0XHRpZiAoIXJlY29yZCkge1xuXHRcdFx0dGhpcy5fcmVjb3JkZWRJbmZsYXRlQnl0ZXMubGVuZ3RoID0gMDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZmx1c2goY2FsbGJhY2s6IChkYXRhOiBWU0J1ZmZlcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX3psaWJJbmZsYXRlLmZsdXNoKCgpID0+IHtcblx0XHRcdHRoaXMuX3RyYWNlci50cmFjZVNvY2tldEV2ZW50KFNvY2tldERpYWdub3N0aWNzRXZlbnRUeXBlLnpsaWJJbmZsYXRlRmx1c2hGaXJlZCk7XG5cdFx0XHRjb25zdCBkYXRhID0gVlNCdWZmZXIuY29uY2F0KHRoaXMuX3BlbmRpbmdJbmZsYXRlRGF0YSk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nSW5mbGF0ZURhdGEubGVuZ3RoID0gMDtcblx0XHRcdGNhbGxiYWNrKGRhdGEpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVjb3JkZWRJbmZsYXRlQnl0ZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9wZW5kaW5nSW5mbGF0ZURhdGEubGVuZ3RoID0gMDtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5femxpYkluZmxhdGUuY2xvc2UoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZSBlcnJvcnMgd2hpbGUgZGlzcG9zaW5nXG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBabGliRGVmbGF0ZVN0cmVhbSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxFcnJvcj4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkVycm9yID0gdGhpcy5fb25FcnJvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF96bGliRGVmbGF0ZTogRGVmbGF0ZVJhdztcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0RlZmxhdGVEYXRhOiBWU0J1ZmZlcltdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJhY2VyOiBJU29ja2V0VHJhY2VyLFxuXHRcdG9wdGlvbnM6IFpsaWJPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl96bGliRGVmbGF0ZSA9IGNyZWF0ZURlZmxhdGVSYXcoe1xuXHRcdFx0d2luZG93Qml0czogMTVcblx0XHR9KTtcblx0XHR0aGlzLl96bGliRGVmbGF0ZS5vbignZXJyb3InLCAoZXJyOiBFcnJvcikgPT4ge1xuXHRcdFx0dGhpcy5fdHJhY2VyLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuemxpYkRlZmxhdGVFcnJvciwgeyBtZXNzYWdlOiBlcnI/Lm1lc3NhZ2UsIGNvZGU6IChlcnIgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKT8uY29kZSB9KTtcblx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShlcnIpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3psaWJEZWZsYXRlLm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4ge1xuXHRcdFx0dGhpcy5fdHJhY2VyLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuemxpYkRlZmxhdGVEYXRhLCBkYXRhKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdEZWZsYXRlRGF0YS5wdXNoKFZTQnVmZmVyLndyYXAoZGF0YSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHdyaXRlKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLl90cmFjZXIudHJhY2VTb2NrZXRFdmVudChTb2NrZXREaWFnbm9zdGljc0V2ZW50VHlwZS56bGliRGVmbGF0ZVdyaXRlLCBidWZmZXIuYnVmZmVyKTtcblx0XHR0aGlzLl96bGliRGVmbGF0ZS53cml0ZSg8QnVmZmVyPmJ1ZmZlci5idWZmZXIpO1xuXHR9XG5cblx0cHVibGljIGZsdXNoKGNhbGxiYWNrOiAoZGF0YTogVlNCdWZmZXIpID0+IHZvaWQpOiB2b2lkIHtcblx0XHQvLyBTZWUgaHR0cHM6Ly96bGliLm5ldC9tYW51YWwuaHRtbCNDb25zdGFudHNcblx0XHR0aGlzLl96bGliRGVmbGF0ZS5mbHVzaCgvKlpfU1lOQ19GTFVTSCovMiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fdHJhY2VyLnRyYWNlU29ja2V0RXZlbnQoU29ja2V0RGlhZ25vc3RpY3NFdmVudFR5cGUuemxpYkRlZmxhdGVGbHVzaEZpcmVkKTtcblxuXHRcdFx0bGV0IGRhdGEgPSBWU0J1ZmZlci5jb25jYXQodGhpcy5fcGVuZGluZ0RlZmxhdGVEYXRhKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdEZWZsYXRlRGF0YS5sZW5ndGggPSAwO1xuXG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzc2OTIjc2VjdGlvbi03LjIuMVxuXHRcdFx0ZGF0YSA9IGRhdGEuc2xpY2UoMCwgZGF0YS5ieXRlTGVuZ3RoIC0gNCk7XG5cblx0XHRcdGNhbGxiYWNrKGRhdGEpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0RlZmxhdGVEYXRhLmxlbmd0aCA9IDA7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3psaWJEZWZsYXRlLmNsb3NlKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmUgZXJyb3JzIHdoaWxlIGRpc3Bvc2luZ1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gdW5tYXNrKGJ1ZmZlcjogVlNCdWZmZXIsIG1hc2s6IG51bWJlcik6IHZvaWQge1xuXHRpZiAobWFzayA9PT0gMCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBjbnQgPSBidWZmZXIuYnl0ZUxlbmd0aCA+Pj4gMjtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjbnQ7IGkrKykge1xuXHRcdGNvbnN0IHYgPSBidWZmZXIucmVhZFVJbnQzMkJFKGkgKiA0KTtcblx0XHRidWZmZXIud3JpdGVVSW50MzJCRSh2IF4gbWFzaywgaSAqIDQpO1xuXHR9XG5cdGNvbnN0IG9mZnNldCA9IGNudCAqIDQ7XG5cdGNvbnN0IGJ5dGVzTGVmdCA9IGJ1ZmZlci5ieXRlTGVuZ3RoIC0gb2Zmc2V0O1xuXHRjb25zdCBtMyA9IChtYXNrID4+PiAyNCkgJiAwYjExMTExMTExO1xuXHRjb25zdCBtMiA9IChtYXNrID4+PiAxNikgJiAwYjExMTExMTExO1xuXHRjb25zdCBtMSA9IChtYXNrID4+PiA4KSAmIDBiMTExMTExMTE7XG5cdGlmIChieXRlc0xlZnQgPj0gMSkge1xuXHRcdGJ1ZmZlci53cml0ZVVJbnQ4KGJ1ZmZlci5yZWFkVUludDgob2Zmc2V0KSBeIG0zLCBvZmZzZXQpO1xuXHR9XG5cdGlmIChieXRlc0xlZnQgPj0gMikge1xuXHRcdGJ1ZmZlci53cml0ZVVJbnQ4KGJ1ZmZlci5yZWFkVUludDgob2Zmc2V0ICsgMSkgXiBtMiwgb2Zmc2V0ICsgMSk7XG5cdH1cblx0aWYgKGJ5dGVzTGVmdCA+PSAzKSB7XG5cdFx0YnVmZmVyLndyaXRlVUludDgoYnVmZmVyLnJlYWRVSW50OChvZmZzZXQgKyAyKSBeIG0xLCBvZmZzZXQgKyAyKTtcblx0fVxufVxuXG4vLyBSZWFkIHRoaXMgYmVmb3JlIHRoZXJlJ3MgYW55IGNoYW5jZSBpdCBpcyBvdmVyd3JpdHRlblxuLy8gUmVsYXRlZCB0byBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzA2MjRcbmV4cG9ydCBjb25zdCBYREdfUlVOVElNRV9ESVIgPSBwcm9jZXNzLmVudlsnWERHX1JVTlRJTUVfRElSJ107XG5cbmNvbnN0IHNhZmVJcGNQYXRoTGVuZ3RoczogeyBbcGxhdGZvcm06IG51bWJlcl06IG51bWJlciB9ID0ge1xuXHRbUGxhdGZvcm0uTGludXhdOiAxMDcsXG5cdFtQbGF0Zm9ybS5NYWNdOiAxMDNcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSYW5kb21JUENIYW5kbGUoKTogc3RyaW5nIHtcblx0Y29uc3QgcmFuZG9tU3VmZml4ID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0Ly8gV2luZG93czogdXNlIG5hbWVkIHBpcGVcblx0aWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicpIHtcblx0XHRyZXR1cm4gYFxcXFxcXFxcLlxcXFxwaXBlXFxcXHZzY29kZS1pcGMtJHtyYW5kb21TdWZmaXh9LXNvY2tgO1xuXHR9XG5cblx0Ly8gTWFjICYgVW5peDogVXNlIHNvY2tldCBmaWxlXG5cdC8vIFVuaXg6IFByZWZlciBYREdfUlVOVElNRV9ESVIgb3ZlciB1c2VyIGRhdGEgcGF0aFxuXHRjb25zdCBiYXNlUGF0aCA9IHByb2Nlc3MucGxhdGZvcm0gIT09ICdkYXJ3aW4nICYmIFhER19SVU5USU1FX0RJUiA/IFhER19SVU5USU1FX0RJUiA6IHRtcGRpcigpO1xuXG5cdC8vIEFzIG9mIE5vZGUuanMgMjQsIHNvY2tldCBwYXRocyB0aGF0IGV4Y2VlZCB0aGVcblx0Ly8gcGxhdGZvcm0gbGltaXQgY2F1c2UgYW4gYEVJTlZBTGAgZXJyb3IgYXQgYmluZCB0aW1lIGluc3RlYWQgb2YgYmVpbmcgc2lsZW50bHlcblx0Ly8gdHJ1bmNhdGVkLiBUaGUgc3VmZml4IG9ubHkgbmVlZHMgdG8gYmUgdW5pcXVlLCBzbyB0cmltIGl0ICh3aGlsZSBrZWVwaW5nIGVub3VnaFxuXHQvLyBlbnRyb3B5KSB0byBtYWtlIHRoZSBwYXRoIGZpdCB3aXRoaW4gdGhlIGxpbWl0LlxuXHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2NvbW1pdC83NTg4NDY3OGQ3ZTdlZjIyOGM4ZjhmODJiNGMwODUyNThjNzBhODIzXG5cdGNvbnN0IGxpbWl0ID0gc2FmZUlwY1BhdGhMZW5ndGhzW3BsYXRmb3JtXTtcblx0bGV0IHN1ZmZpeCA9IHJhbmRvbVN1ZmZpeDtcblx0aWYgKHR5cGVvZiBsaW1pdCA9PT0gJ251bWJlcicpIHtcblx0XHRjb25zdCBhdmFpbGFibGUgPSBNYXRoLm1heCgwLCAobGltaXQgLSAxKSAtIGpvaW4oYmFzZVBhdGgsIGB2c2NvZGUtaXBjLS5zb2NrYCkubGVuZ3RoKTtcblx0XHRpZiAoYXZhaWxhYmxlIDwgc3VmZml4Lmxlbmd0aCkge1xuXHRcdFx0c3VmZml4ID0gc3VmZml4LnNsaWNlKDAsIGF2YWlsYWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGpvaW4oYmFzZVBhdGgsIGB2c2NvZGUtaXBjLSR7c3VmZml4fS5zb2NrYCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTdGF0aWNJUENIYW5kbGUoZGlyZWN0b3J5UGF0aDogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNjb3BlID0gY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGRpcmVjdG9yeVBhdGgpLmRpZ2VzdCgnaGV4Jyk7XG5cdGNvbnN0IHNjb3BlRm9yU29ja2V0ID0gc2NvcGUuc3Vic3RyKDAsIDgpO1xuXG5cdC8vIFdpbmRvd3M6IHVzZSBuYW1lZCBwaXBlXG5cdGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSB7XG5cdFx0cmV0dXJuIGBcXFxcXFxcXC5cXFxccGlwZVxcXFwke3Njb3BlRm9yU29ja2V0fS0ke3ZlcnNpb259LSR7dHlwZX0tc29ja2A7XG5cdH1cblxuXHQvLyBNYWMgJiBVbml4OiBVc2Ugc29ja2V0IGZpbGVcblx0Ly8gVW5peDogUHJlZmVyIFhER19SVU5USU1FX0RJUiBvdmVyIHVzZXIgZGF0YSBwYXRoLCB1bmxlc3MgcG9ydGFibGVcblx0Ly8gVHJpbSB0aGUgdmVyc2lvbiBhbmQgdHlwZSB2YWx1ZXMgZm9yIHRoZSBzb2NrZXQgdG8gcHJldmVudCB0b28gbGFyZ2Vcblx0Ly8gZmlsZSBuYW1lcyBjYXVzaW5nIGlzc3VlczogaHR0cHM6Ly91bml4LnN0YWNrZXhjaGFuZ2UuY29tL3EvMzY3MDA4XG5cblx0Y29uc3QgdmVyc2lvbkZvclNvY2tldCA9IHZlcnNpb24uc3Vic3RyKDAsIDQpO1xuXHRjb25zdCB0eXBlRm9yU29ja2V0ID0gdHlwZS5zdWJzdHIoMCwgNik7XG5cblx0bGV0IHJlc3VsdDogc3RyaW5nO1xuXHRpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ2RhcndpbicgJiYgWERHX1JVTlRJTUVfRElSICYmICFwcm9jZXNzLmVudlsnVlNDT0RFX1BPUlRBQkxFJ10pIHtcblx0XHRyZXN1bHQgPSBqb2luKFhER19SVU5USU1FX0RJUiwgYHZzY29kZS0ke3Njb3BlRm9yU29ja2V0fS0ke3ZlcnNpb25Gb3JTb2NrZXR9LSR7dHlwZUZvclNvY2tldH0uc29ja2ApO1xuXHR9IGVsc2Uge1xuXHRcdHJlc3VsdCA9IGpvaW4oZGlyZWN0b3J5UGF0aCwgYCR7dmVyc2lvbkZvclNvY2tldH0tJHt0eXBlRm9yU29ja2V0fS5zb2NrYCk7XG5cdH1cblxuXHQvLyBWYWxpZGF0ZSBsZW5ndGguIFVubGlrZSBgY3JlYXRlUmFuZG9tSVBDSGFuZGxlYCwgdGhlIHBhdGggaGVyZSBtdXN0IGJlIGRlcml2ZWRcblx0Ly8gZGV0ZXJtaW5pc3RpY2FsbHkgZnJvbSBgZGlyZWN0b3J5UGF0aGAgc28gdGhhdCB0aGUgc2VydmVyIGFuZCBpdHMgY2xpZW50cyBhZ3JlZVxuXHQvLyBvbiB0aGUgc2FtZSBzb2NrZXQuIFRoZXJlIGlzIG5vIHJhbmRvbSBjb21wb25lbnQgdG8gdHJpbSwgc28gYW4gb3Zlci1sb25nXG5cdC8vIGAtLXVzZXItZGF0YS1kaXJgIGNhbiBzdGlsbCBwcm9kdWNlIGEgcGF0aCB0aGF0IGV4Y2VlZHMgdGhlIHBsYXRmb3JtIGxpbWl0LlxuXHR2YWxpZGF0ZUlQQ0hhbmRsZUxlbmd0aChyZXN1bHQpO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlSVBDSGFuZGxlTGVuZ3RoKGhhbmRsZTogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IGxpbWl0ID0gc2FmZUlwY1BhdGhMZW5ndGhzW3BsYXRmb3JtXTtcblx0aWYgKHR5cGVvZiBsaW1pdCA9PT0gJ251bWJlcicgJiYgaGFuZGxlLmxlbmd0aCA+PSBsaW1pdCkge1xuXHRcdC8vIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvbmV0Lmh0bWwjbmV0X2lkZW50aWZ5aW5nX3BhdGhzX2Zvcl9pcGNfY29ubmVjdGlvbnNcblx0XHRjb25zb2xlLndhcm4oYFdBUk5JTkc6IElQQyBoYW5kbGUgXCIke2hhbmRsZX1cIiBpcyBsb25nZXIgdGhhbiAke2xpbWl0fSBjaGFycywgdHJ5IGEgc2hvcnRlciAtLXVzZXItZGF0YS1kaXJgKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VydmVyIGV4dGVuZHMgSVBDU2VydmVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyB0b0NsaWVudENvbm5lY3Rpb25FdmVudChzZXJ2ZXI6IE5ldFNlcnZlcik6IEV2ZW50PENsaWVudENvbm5lY3Rpb25FdmVudD4ge1xuXHRcdGNvbnN0IG9uQ29ubmVjdGlvbiA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPFNvY2tldD4oc2VydmVyLCAnY29ubmVjdGlvbicpO1xuXG5cdFx0cmV0dXJuIEV2ZW50Lm1hcChvbkNvbm5lY3Rpb24sIHNvY2tldCA9PiAoe1xuXHRcdFx0cHJvdG9jb2w6IG5ldyBQcm90b2NvbChuZXcgTm9kZVNvY2tldChzb2NrZXQsICdpcGMtc2VydmVyLWNvbm5lY3Rpb24nKSksXG5cdFx0XHRvbkRpZENsaWVudERpc2Nvbm5lY3Q6IEV2ZW50Lm9uY2UoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8dm9pZD4oc29ja2V0LCAnY2xvc2UnKSlcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHNlcnZlcjogTmV0U2VydmVyIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihzZXJ2ZXI6IE5ldFNlcnZlcikge1xuXHRcdHN1cGVyKFNlcnZlci50b0NsaWVudENvbm5lY3Rpb25FdmVudChzZXJ2ZXIpKTtcblx0XHR0aGlzLnNlcnZlciA9IHNlcnZlcjtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGlmICh0aGlzLnNlcnZlcikge1xuXHRcdFx0dGhpcy5zZXJ2ZXIuY2xvc2UoKTtcblx0XHRcdHRoaXMuc2VydmVyID0gbnVsbDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlcnZlKHBvcnQ6IG51bWJlcik6IFByb21pc2U8U2VydmVyPjtcbmV4cG9ydCBmdW5jdGlvbiBzZXJ2ZShuYW1lZFBpcGU6IHN0cmluZyk6IFByb21pc2U8U2VydmVyPjtcbmV4cG9ydCBmdW5jdGlvbiBzZXJ2ZShob29rOiBudW1iZXIgfCBzdHJpbmcpOiBQcm9taXNlPFNlcnZlcj4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8U2VydmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gY3JlYXRlU2VydmVyKCk7XG5cblx0XHRzZXJ2ZXIub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRzZXJ2ZXIubGlzdGVuKGhvb2ssICgpID0+IHtcblx0XHRcdHNlcnZlci5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCByZWplY3QpO1xuXHRcdFx0cmVzb2x2ZShuZXcgU2VydmVyKHNlcnZlcikpO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbm5lY3Qob3B0aW9uczogeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9LCBjbGllbnRJZDogc3RyaW5nKTogUHJvbWlzZTxDbGllbnQ+O1xuZXhwb3J0IGZ1bmN0aW9uIGNvbm5lY3QobmFtZWRQaXBlOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPENsaWVudD47XG5leHBvcnQgZnVuY3Rpb24gY29ubmVjdChob29rOiB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0gfCBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPENsaWVudD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8Q2xpZW50PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0bGV0IHNvY2tldDogU29ja2V0O1xuXG5cdFx0Y29uc3QgY2FsbGJhY2tIYW5kbGVyID0gKCkgPT4ge1xuXHRcdFx0c29ja2V0LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRyZXNvbHZlKENsaWVudC5mcm9tU29ja2V0KG5ldyBOb2RlU29ja2V0KHNvY2tldCwgYGlwYy1jbGllbnQke2NsaWVudElkfWApLCBjbGllbnRJZCkpO1xuXHRcdH07XG5cblx0XHRpZiAodHlwZW9mIGhvb2sgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRzb2NrZXQgPSBjcmVhdGVDb25uZWN0aW9uKGhvb2ssIGNhbGxiYWNrSGFuZGxlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNvY2tldCA9IGNyZWF0ZUNvbm5lY3Rpb24oaG9vaywgY2FsbGJhY2tIYW5kbGVyKTtcblx0XHR9XG5cblx0XHRzb2NrZXQub25jZSgnZXJyb3InLCByZWplY3QpO1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBRTNCLFNBQXNDLGtCQUFrQixvQkFBb0I7QUFDNUUsU0FBUyxjQUFjO0FBQ3ZCLFNBQThDLGtCQUFrQix3QkFBd0I7QUFDeEYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBZ0MsaUJBQWlCO0FBQ2pELFNBQVMsYUFBYSxRQUFpQixVQUE0QixzQkFBc0IsbUJBQW1CLGtDQUFrQztBQUV2SSxTQUFTLGlCQUFpQixLQUEyQixRQUFnQjtBQUFBLEVBQzNFO0FBQUEsRUFDQSxzQkFB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QWdCLElBQUksYUFBYSxPQUFPO0FBQUEsRUFDcEcsT0FBTztBQUNOLGFBQVMsS0FBSyxlQUFlLEdBQUcsZ0JBQWdCLElBQUksYUFBYSxPQUFPO0FBQUEsRUFDekU7QUFNQSwwQkFBd0IsTUFBTTtBQUU5QixTQUFPO0FBQ1I7QUFFQSxTQUFTLHdCQUF3QixRQUFzQjtBQUN0RCxRQUFNLFFBQVEsbUJBQW1CLFFBQVE7QUFDekMsTUFBSSxPQUFPLFVBQVUsWUFBWSxPQUFPLFVBQVUsT0FBTztBQUV4RCxZQUFRLEtBQUssd0JBQXdCLE1BQU0sb0JBQW9CLEtBQUssdUNBQXVDO0FBQUEsRUFDNUc7QUFDRDtBQUVPLE1BQU0sZUFBZSxVQUFVO0FBQUEsRUFFckMsT0FBZSx3QkFBd0IsUUFBaUQ7QUFDdkYsVUFBTSxlQUFlLE1BQU0scUJBQTZCLFFBQVEsWUFBWTtBQUU1RSxXQUFPLE1BQU0sSUFBSSxjQUFjLGFBQVc7QUFBQSxNQUN6QyxVQUFVLElBQUksU0FBUyxJQUFJLFdBQVcsUUFBUSx1QkFBdUIsQ0FBQztBQUFBLE1BQ3RFLHVCQUF1QixNQUFNLEtBQUssTUFBTSxxQkFBMkIsUUFBUSxPQUFPLENBQUM7QUFBQSxJQUNwRixFQUFFO0FBQUEsRUFDSDtBQUFBLEVBSUEsWUFBWSxRQUFtQjtBQUM5QixVQUFNLE9BQU8sd0JBQXdCLE1BQU0sQ0FBQztBQUM1QyxTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixVQUFNLFFBQVE7QUFDZCxRQUFJLEtBQUssUUFBUTtBQUNoQixXQUFLLE9BQU8sTUFBTTtBQUNsQixXQUFLLFNBQVM7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQUNEO0FBSU8sU0FBUyxNQUFNLE1BQXdDO0FBQzdELFNBQU8sSUFBSSxRQUFnQixDQUFDLFNBQVMsV0FBVztBQUMvQyxVQUFNLFNBQVMsYUFBYTtBQUU1QixXQUFPLEdBQUcsU0FBUyxNQUFNO0FBQ3pCLFdBQU8sT0FBTyxNQUFNLE1BQU07QUFDekIsYUFBTyxlQUFlLFNBQVMsTUFBTTtBQUNyQyxjQUFRLElBQUksT0FBTyxNQUFNLENBQUM7QUFBQSxJQUMzQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0Y7QUFJTyxTQUFTLFFBQVEsTUFBK0MsVUFBbUM7QUFDekcsU0FBTyxJQUFJLFFBQWdCLENBQUMsU0FBUyxXQUFXO0FBQy9DLFFBQUk7QUFFSixVQUFNLGtCQUFrQixNQUFNO0FBQzdCLGFBQU8sZUFBZSxTQUFTLE1BQU07QUFDckMsY0FBUSxPQUFPLFdBQVcsSUFBSSxXQUFXLFFBQVEsYUFBYSxRQUFRLEVBQUUsR0FBRyxRQUFRLENBQUM7QUFBQSxJQUNyRjtBQUVBLFFBQUksT0FBTyxTQUFTLFVBQVU7QUFDN0IsZUFBUyxpQkFBaUIsTUFBTSxlQUFlO0FBQUEsSUFDaEQsT0FBTztBQUNOLGVBQVMsaUJBQWlCLE1BQU0sZUFBZTtBQUFBLElBQ2hEO0FBRUEsV0FBTyxLQUFLLFNBQVMsTUFBTTtBQUFBLEVBQzVCLENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFsiQ29uc3RhbnRzIiwgIlJlYWRTdGF0ZSJdCn0K
