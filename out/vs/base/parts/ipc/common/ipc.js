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
import { getRandomElement } from "../../../common/arrays.js";
import { createCancelablePromise, timeout } from "../../../common/async.js";
import { VSBuffer } from "../../../common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../common/cancellation.js";
import { memoize } from "../../../common/decorators.js";
import { CancellationError, ErrorNoTelemetry } from "../../../common/errors.js";
import { Emitter, Event, EventMultiplexer, Relay } from "../../../common/event.js";
import { createSingleCallFunction } from "../../../common/functional.js";
import { DisposableStore, dispose, toDisposable } from "../../../common/lifecycle.js";
import { revive } from "../../../common/marshalling.js";
import * as strings from "../../../common/strings.js";
import { isFunction, isUndefinedOrNull } from "../../../common/types.js";
var RequestType = /* @__PURE__ */ ((RequestType2) => {
  RequestType2[RequestType2["Promise"] = 100] = "Promise";
  RequestType2[RequestType2["PromiseCancel"] = 101] = "PromiseCancel";
  RequestType2[RequestType2["EventListen"] = 102] = "EventListen";
  RequestType2[RequestType2["EventDispose"] = 103] = "EventDispose";
  return RequestType2;
})(RequestType || {});
function requestTypeToStr(type) {
  switch (type) {
    case 100 /* Promise */:
      return "req";
    case 101 /* PromiseCancel */:
      return "cancel";
    case 102 /* EventListen */:
      return "subscribe";
    case 103 /* EventDispose */:
      return "unsubscribe";
  }
}
var ResponseType = /* @__PURE__ */ ((ResponseType2) => {
  ResponseType2[ResponseType2["Initialize"] = 200] = "Initialize";
  ResponseType2[ResponseType2["PromiseSuccess"] = 201] = "PromiseSuccess";
  ResponseType2[ResponseType2["PromiseError"] = 202] = "PromiseError";
  ResponseType2[ResponseType2["PromiseErrorObj"] = 203] = "PromiseErrorObj";
  ResponseType2[ResponseType2["EventFire"] = 204] = "EventFire";
  return ResponseType2;
})(ResponseType || {});
function responseTypeToStr(type) {
  switch (type) {
    case 200 /* Initialize */:
      return `init`;
    case 201 /* PromiseSuccess */:
      return `reply:`;
    case 202 /* PromiseError */:
    case 203 /* PromiseErrorObj */:
      return `replyErr:`;
    case 204 /* EventFire */:
      return `event:`;
  }
}
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Uninitialized"] = 0] = "Uninitialized";
  State2[State2["Idle"] = 1] = "Idle";
  return State2;
})(State || {});
function readIntVQL(reader) {
  let value = 0;
  for (let n = 0; ; n += 7) {
    const next = reader.read(1);
    value |= (next.buffer[0] & 127) << n;
    if (!(next.buffer[0] & 128)) {
      return value;
    }
  }
}
const vqlZero = createOneByteBuffer(0);
function writeInt32VQL(writer, value) {
  if (value === 0) {
    writer.write(vqlZero);
    return;
  }
  let len = 0;
  for (let v2 = value; v2 !== 0; v2 = v2 >>> 7) {
    len++;
  }
  const scratch = VSBuffer.alloc(len);
  for (let i = 0; value !== 0; i++) {
    scratch.buffer[i] = value & 127;
    value = value >>> 7;
    if (value > 0) {
      scratch.buffer[i] |= 128;
    }
  }
  writer.write(scratch);
}
class BufferReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.pos = 0;
  }
  read(bytes) {
    const result = this.buffer.slice(this.pos, this.pos + bytes);
    this.pos += result.byteLength;
    return result;
  }
}
class BufferWriter {
  constructor() {
    this.buffers = [];
  }
  get buffer() {
    return VSBuffer.concat(this.buffers);
  }
  write(buffer) {
    this.buffers.push(buffer);
  }
  dispose() {
    this.buffers.length = 0;
  }
}
var DataType = /* @__PURE__ */ ((DataType2) => {
  DataType2[DataType2["Undefined"] = 0] = "Undefined";
  DataType2[DataType2["String"] = 1] = "String";
  DataType2[DataType2["Buffer"] = 2] = "Buffer";
  DataType2[DataType2["VSBuffer"] = 3] = "VSBuffer";
  DataType2[DataType2["Array"] = 4] = "Array";
  DataType2[DataType2["Object"] = 5] = "Object";
  DataType2[DataType2["Int"] = 6] = "Int";
  return DataType2;
})(DataType || {});
function createOneByteBuffer(value) {
  const result = VSBuffer.alloc(1);
  result.writeUInt8(value, 0);
  return result;
}
const BufferPresets = {
  Undefined: createOneByteBuffer(0 /* Undefined */),
  String: createOneByteBuffer(1 /* String */),
  Buffer: createOneByteBuffer(2 /* Buffer */),
  VSBuffer: createOneByteBuffer(3 /* VSBuffer */),
  Array: createOneByteBuffer(4 /* Array */),
  Object: createOneByteBuffer(5 /* Object */),
  Uint: createOneByteBuffer(6 /* Int */)
};
function serialize(writer, data) {
  if (typeof data === "undefined") {
    writer.write(BufferPresets.Undefined);
  } else if (typeof data === "string") {
    const buffer = VSBuffer.fromString(data);
    writer.write(BufferPresets.String);
    writeInt32VQL(writer, buffer.byteLength);
    writer.write(buffer);
  } else if (VSBuffer.isNativeBuffer(data)) {
    const buffer = VSBuffer.wrap(data);
    writer.write(BufferPresets.Buffer);
    writeInt32VQL(writer, buffer.byteLength);
    writer.write(buffer);
  } else if (data instanceof VSBuffer) {
    writer.write(BufferPresets.VSBuffer);
    writeInt32VQL(writer, data.byteLength);
    writer.write(data);
  } else if (Array.isArray(data)) {
    writer.write(BufferPresets.Array);
    writeInt32VQL(writer, data.length);
    for (const el of data) {
      serialize(writer, el);
    }
  } else if (typeof data === "number" && (data | 0) === data) {
    writer.write(BufferPresets.Uint);
    writeInt32VQL(writer, data);
  } else {
    const buffer = VSBuffer.fromString(JSON.stringify(data));
    writer.write(BufferPresets.Object);
    writeInt32VQL(writer, buffer.byteLength);
    writer.write(buffer);
  }
}
function deserialize(reader) {
  const type = reader.read(1).readUInt8(0);
  switch (type) {
    case 0 /* Undefined */:
      return void 0;
    case 1 /* String */:
      return reader.read(readIntVQL(reader)).toString();
    case 2 /* Buffer */:
      return reader.read(readIntVQL(reader)).buffer;
    case 3 /* VSBuffer */:
      return reader.read(readIntVQL(reader));
    case 4 /* Array */: {
      const length = readIntVQL(reader);
      const result = [];
      for (let i = 0; i < length; i++) {
        result.push(deserialize(reader));
      }
      return result;
    }
    case 5 /* Object */:
      return JSON.parse(reader.read(readIntVQL(reader)).toString());
    case 6 /* Int */:
      return readIntVQL(reader);
  }
}
class ChannelServer {
  constructor(protocol, ctx, logger = null, timeoutDelay = 1e3) {
    this.protocol = protocol;
    this.ctx = ctx;
    this.logger = logger;
    this.timeoutDelay = timeoutDelay;
    this.channels = /* @__PURE__ */ new Map();
    this.activeRequests = /* @__PURE__ */ new Map();
    // Requests might come in for channels which are not yet registered.
    // They will timeout after `timeoutDelay`.
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.protocolListener = this.protocol.onMessage((msg) => this.onRawMessage(msg));
    this.sendResponse({ type: 200 /* Initialize */ });
  }
  registerChannel(channelName, channel) {
    this.channels.set(channelName, channel);
    setTimeout(() => this.flushPendingRequests(channelName), 0);
  }
  sendResponse(response) {
    switch (response.type) {
      case 200 /* Initialize */: {
        const msgLength = this.send([response.type]);
        this.logger?.logOutgoing(msgLength, 0, 1 /* OtherSide */, responseTypeToStr(response.type));
        return;
      }
      case 201 /* PromiseSuccess */:
      case 202 /* PromiseError */:
      case 204 /* EventFire */:
      case 203 /* PromiseErrorObj */: {
        const msgLength = this.send([response.type, response.id], response.data);
        this.logger?.logOutgoing(msgLength, response.id, 1 /* OtherSide */, responseTypeToStr(response.type), response.data);
        return;
      }
    }
  }
  send(header, body = void 0) {
    const writer = new BufferWriter();
    try {
      serialize(writer, header);
      serialize(writer, body);
      return this.sendBuffer(writer.buffer);
    } finally {
      writer.dispose();
    }
  }
  sendBuffer(message) {
    try {
      this.protocol.send(message);
      return message.byteLength;
    } catch (err) {
      return 0;
    }
  }
  onRawMessage(message) {
    const reader = new BufferReader(message);
    const header = deserialize(reader);
    const body = deserialize(reader);
    const type = header[0];
    switch (type) {
      case 100 /* Promise */:
        this.logger?.logIncoming(message.byteLength, header[1], 1 /* OtherSide */, `${requestTypeToStr(type)}: ${header[2]}.${header[3]}`, body);
        return this.onPromise({ type, id: header[1], channelName: header[2], name: header[3], arg: body });
      case 102 /* EventListen */:
        this.logger?.logIncoming(message.byteLength, header[1], 1 /* OtherSide */, `${requestTypeToStr(type)}: ${header[2]}.${header[3]}`, body);
        return this.onEventListen({ type, id: header[1], channelName: header[2], name: header[3], arg: body });
      case 101 /* PromiseCancel */:
        this.logger?.logIncoming(message.byteLength, header[1], 1 /* OtherSide */, `${requestTypeToStr(type)}`);
        return this.disposeActiveRequest({ type, id: header[1] });
      case 103 /* EventDispose */:
        this.logger?.logIncoming(message.byteLength, header[1], 1 /* OtherSide */, `${requestTypeToStr(type)}`);
        return this.disposeActiveRequest({ type, id: header[1] });
    }
  }
  onPromise(request) {
    const channel = this.channels.get(request.channelName);
    if (!channel) {
      this.collectPendingRequest(request);
      return;
    }
    const cancellationTokenSource = new CancellationTokenSource();
    let promise;
    try {
      promise = channel.call(this.ctx, request.name, request.arg, cancellationTokenSource.token);
    } catch (err) {
      promise = Promise.reject(err);
    }
    const id = request.id;
    promise.then((data) => {
      this.sendResponse({ id, data, type: 201 /* PromiseSuccess */ });
    }, (err) => {
      if (err instanceof Error) {
        this.sendResponse({
          id,
          data: {
            message: err.message,
            name: err.name,
            stack: err.stack ? err.stack.split("\n") : void 0
          },
          type: 202 /* PromiseError */
        });
      } else {
        this.sendResponse({ id, data: err, type: 203 /* PromiseErrorObj */ });
      }
    }).finally(() => {
      disposable.dispose();
      this.activeRequests.delete(request.id);
    });
    const disposable = toDisposable(() => cancellationTokenSource.cancel());
    this.activeRequests.set(request.id, disposable);
  }
  onEventListen(request) {
    const channel = this.channels.get(request.channelName);
    if (!channel) {
      this.collectPendingRequest(request);
      return;
    }
    const id = request.id;
    const event = channel.listen(this.ctx, request.name, request.arg);
    const disposable = event((data) => this.sendResponse({ id, data, type: 204 /* EventFire */ }));
    this.activeRequests.set(request.id, disposable);
  }
  disposeActiveRequest(request) {
    const disposable = this.activeRequests.get(request.id);
    if (disposable) {
      disposable.dispose();
      this.activeRequests.delete(request.id);
    }
  }
  collectPendingRequest(request) {
    let pendingRequests = this.pendingRequests.get(request.channelName);
    if (!pendingRequests) {
      pendingRequests = [];
      this.pendingRequests.set(request.channelName, pendingRequests);
    }
    const timer = setTimeout(() => {
      console.error(`Unknown channel: ${request.channelName}`);
      if (request.type === 100 /* Promise */) {
        this.sendResponse({
          id: request.id,
          data: { name: "Unknown channel", message: `Channel name '${request.channelName}' timed out after ${this.timeoutDelay}ms`, stack: void 0 },
          type: 202 /* PromiseError */
        });
      }
    }, this.timeoutDelay);
    pendingRequests.push({ request, timeoutTimer: timer });
  }
  flushPendingRequests(channelName) {
    const requests = this.pendingRequests.get(channelName);
    if (requests) {
      for (const request of requests) {
        clearTimeout(request.timeoutTimer);
        switch (request.request.type) {
          case 100 /* Promise */:
            this.onPromise(request.request);
            break;
          case 102 /* EventListen */:
            this.onEventListen(request.request);
            break;
        }
      }
      this.pendingRequests.delete(channelName);
    }
  }
  dispose() {
    if (this.protocolListener) {
      this.protocolListener.dispose();
      this.protocolListener = null;
    }
    dispose(this.activeRequests.values());
    this.activeRequests.clear();
  }
}
var RequestInitiator = /* @__PURE__ */ ((RequestInitiator2) => {
  RequestInitiator2[RequestInitiator2["LocalSide"] = 0] = "LocalSide";
  RequestInitiator2[RequestInitiator2["OtherSide"] = 1] = "OtherSide";
  return RequestInitiator2;
})(RequestInitiator || {});
class ChannelClient {
  constructor(protocol, logger = null) {
    this.protocol = protocol;
    this.isDisposed = false;
    this.state = 0 /* Uninitialized */;
    this.activeRequests = /* @__PURE__ */ new Set();
    this.handlers = /* @__PURE__ */ new Map();
    this.lastRequestId = 0;
    this._onDidInitialize = new Emitter();
    this.onDidInitialize = this._onDidInitialize.event;
    this.protocolListener = this.protocol.onMessage((msg) => this.onBuffer(msg));
    this.logger = logger;
  }
  getChannel(channelName) {
    const that = this;
    return {
      call(command, arg, cancellationToken) {
        if (that.isDisposed) {
          return Promise.reject(new CancellationError());
        }
        return that.requestPromise(channelName, command, arg, cancellationToken);
      },
      listen(event, arg) {
        if (that.isDisposed) {
          return Event.None;
        }
        return that.requestEvent(channelName, event, arg);
      }
    };
  }
  requestPromise(channelName, name, arg, cancellationToken = CancellationToken.None) {
    const id = this.lastRequestId++;
    const type = 100 /* Promise */;
    const request = { id, type, channelName, name, arg };
    if (cancellationToken.isCancellationRequested) {
      return Promise.reject(new CancellationError());
    }
    let disposable;
    let disposableWithRequestCancel;
    const result = new Promise((c, e) => {
      if (cancellationToken.isCancellationRequested) {
        return e(new CancellationError());
      }
      const doRequest = () => {
        const handler = (response) => {
          switch (response.type) {
            case 201 /* PromiseSuccess */:
              this.handlers.delete(id);
              c(response.data);
              break;
            case 202 /* PromiseError */: {
              this.handlers.delete(id);
              const error = new Error(response.data.message);
              error.stack = Array.isArray(response.data.stack) ? response.data.stack.join("\n") : response.data.stack;
              error.name = response.data.name;
              e(error);
              break;
            }
            case 203 /* PromiseErrorObj */:
              this.handlers.delete(id);
              e(response.data);
              break;
          }
        };
        this.handlers.set(id, handler);
        try {
          this.sendRequest(request);
        } catch (err) {
          this.handlers.delete(id);
          e(err);
        }
      };
      let uninitializedPromise = null;
      if (this.state === 1 /* Idle */) {
        doRequest();
      } else {
        uninitializedPromise = createCancelablePromise((_) => this.whenInitialized());
        uninitializedPromise.then(() => {
          uninitializedPromise = null;
          doRequest();
        });
      }
      const cancel = () => {
        if (uninitializedPromise) {
          uninitializedPromise.cancel();
          uninitializedPromise = null;
        } else {
          this.sendRequest({ id, type: 101 /* PromiseCancel */ });
        }
        e(new CancellationError());
      };
      disposable = cancellationToken.onCancellationRequested(cancel);
      disposableWithRequestCancel = {
        dispose: createSingleCallFunction(() => {
          cancel();
          disposable.dispose();
        })
      };
      this.activeRequests.add(disposableWithRequestCancel);
    });
    return result.finally(() => {
      disposable?.dispose();
      this.activeRequests.delete(disposableWithRequestCancel);
    });
  }
  requestEvent(channelName, name, arg) {
    const id = this.lastRequestId++;
    const type = 102 /* EventListen */;
    const request = { id, type, channelName, name, arg };
    let uninitializedPromise = null;
    const emitter = new Emitter({
      onWillAddFirstListener: () => {
        const handler = (res) => emitter.fire(res.data);
        this.handlers.set(id, handler);
        const doRequest = () => {
          this.activeRequests.add(emitter);
          this.sendRequest(request);
        };
        if (this.state === 1 /* Idle */) {
          doRequest();
        } else {
          uninitializedPromise = createCancelablePromise((_) => this.whenInitialized());
          uninitializedPromise.then(() => {
            uninitializedPromise = null;
            doRequest();
          });
        }
      },
      onDidRemoveLastListener: () => {
        if (uninitializedPromise) {
          uninitializedPromise.cancel();
          uninitializedPromise = null;
        } else {
          this.activeRequests.delete(emitter);
          this.sendRequest({ id, type: 103 /* EventDispose */ });
        }
        this.handlers.delete(id);
      }
    });
    return emitter.event;
  }
  sendRequest(request) {
    switch (request.type) {
      case 100 /* Promise */:
      case 102 /* EventListen */: {
        const msgLength = this.send([request.type, request.id, request.channelName, request.name], request.arg);
        this.logger?.logOutgoing(msgLength, request.id, 0 /* LocalSide */, `${requestTypeToStr(request.type)}: ${request.channelName}.${request.name}`, request.arg);
        return;
      }
      case 101 /* PromiseCancel */:
      case 103 /* EventDispose */: {
        const msgLength = this.send([request.type, request.id]);
        this.logger?.logOutgoing(msgLength, request.id, 0 /* LocalSide */, requestTypeToStr(request.type));
        return;
      }
    }
  }
  send(header, body = void 0) {
    const writer = new BufferWriter();
    try {
      serialize(writer, header);
      serialize(writer, body);
      return this.sendBuffer(writer.buffer);
    } finally {
      writer.dispose();
    }
  }
  sendBuffer(message) {
    try {
      this.protocol.send(message);
      return message.byteLength;
    } catch (err) {
      return 0;
    }
  }
  onBuffer(message) {
    const reader = new BufferReader(message);
    const header = deserialize(reader);
    const body = deserialize(reader);
    const type = header[0];
    switch (type) {
      case 200 /* Initialize */:
        this.logger?.logIncoming(message.byteLength, 0, 0 /* LocalSide */, responseTypeToStr(type));
        return this.onResponse({ type: header[0] });
      case 201 /* PromiseSuccess */:
      case 202 /* PromiseError */:
      case 204 /* EventFire */:
      case 203 /* PromiseErrorObj */:
        this.logger?.logIncoming(message.byteLength, header[1], 0 /* LocalSide */, responseTypeToStr(type), body);
        return this.onResponse({ type: header[0], id: header[1], data: body });
    }
  }
  onResponse(response) {
    if (response.type === 200 /* Initialize */) {
      this.state = 1 /* Idle */;
      this._onDidInitialize.fire();
      return;
    }
    const handler = this.handlers.get(response.id);
    handler?.(response);
  }
  get onDidInitializePromise() {
    return Event.toPromise(this.onDidInitialize);
  }
  whenInitialized() {
    if (this.state === 1 /* Idle */) {
      return Promise.resolve();
    } else {
      return this.onDidInitializePromise;
    }
  }
  dispose() {
    this.isDisposed = true;
    if (this.protocolListener) {
      this.protocolListener.dispose();
      this.protocolListener = null;
    }
    dispose(this.activeRequests.values());
    this.activeRequests.clear();
    this._onDidInitialize.dispose();
  }
}
__decorateClass([
  memoize
], ChannelClient.prototype, "onDidInitializePromise", 1);
class IPCServer {
  constructor(onDidClientConnect, ipcLogger, timeoutDelay) {
    this.channels = /* @__PURE__ */ new Map();
    this._connections = /* @__PURE__ */ new Set();
    this._onDidAddConnection = new Emitter();
    this.onDidAddConnection = this._onDidAddConnection.event;
    this._onDidRemoveConnection = new Emitter();
    this.onDidRemoveConnection = this._onDidRemoveConnection.event;
    this.disposables = new DisposableStore();
    this.disposables.add(onDidClientConnect(({ protocol, onDidClientDisconnect }) => {
      const onFirstMessage = Event.once(protocol.onMessage);
      const connectionDisposables = new DisposableStore();
      const onFirstMessageDisposable = onFirstMessage((msg) => {
        const reader = new BufferReader(msg);
        const ctx = deserialize(reader);
        const channelServer = new ChannelServer(protocol, ctx, ipcLogger, timeoutDelay);
        const channelClient = new ChannelClient(protocol, ipcLogger);
        this.channels.forEach((channel, name) => channelServer.registerChannel(name, channel));
        const connection = { channelServer, channelClient, ctx };
        this._connections.add(connection);
        this._onDidAddConnection.fire(connection);
        connectionDisposables.add(onDidClientDisconnect(() => {
          channelServer.dispose();
          channelClient.dispose();
          this._connections.delete(connection);
          this._onDidRemoveConnection.fire(connection);
          this.disposables.delete(connectionDisposables);
          connectionDisposables.dispose();
        }));
      });
      connectionDisposables.add(onFirstMessageDisposable);
      this.disposables.add(connectionDisposables);
    }));
  }
  get connections() {
    const result = [];
    this._connections.forEach((ctx) => result.push(ctx));
    return result;
  }
  getChannel(channelName, routerOrClientFilter) {
    const that = this;
    return {
      call(command, arg, cancellationToken) {
        let connectionPromise;
        if (isFunction(routerOrClientFilter)) {
          const connection = getRandomElement(that.connections.filter(routerOrClientFilter));
          connectionPromise = connection ? Promise.resolve(connection) : Event.toPromise(Event.filter(that.onDidAddConnection, routerOrClientFilter));
        } else {
          connectionPromise = routerOrClientFilter.routeCall(that, command, arg);
        }
        const channelPromise = connectionPromise.then((connection) => connection.channelClient.getChannel(channelName));
        return getDelayedChannel(channelPromise).call(command, arg, cancellationToken);
      },
      listen(event, arg) {
        if (isFunction(routerOrClientFilter)) {
          return that.getMulticastEvent(channelName, routerOrClientFilter, event, arg);
        }
        const channelPromise = routerOrClientFilter.routeEvent(that, event, arg).then((connection) => connection.channelClient.getChannel(channelName));
        return getDelayedChannel(channelPromise).listen(event, arg);
      }
    };
  }
  getMulticastEvent(channelName, clientFilter, eventName, arg) {
    const that = this;
    let disposables;
    const emitter = new Emitter({
      onWillAddFirstListener: () => {
        disposables = new DisposableStore();
        const eventMultiplexer = new EventMultiplexer();
        const map = /* @__PURE__ */ new Map();
        const onDidAddConnection = (connection) => {
          const channel = connection.channelClient.getChannel(channelName);
          const event = channel.listen(eventName, arg);
          const disposable = eventMultiplexer.add(event);
          map.set(connection, disposable);
        };
        const onDidRemoveConnection = (connection) => {
          const disposable = map.get(connection);
          if (!disposable) {
            return;
          }
          disposable.dispose();
          map.delete(connection);
        };
        that.connections.filter(clientFilter).forEach(onDidAddConnection);
        Event.filter(that.onDidAddConnection, clientFilter)(onDidAddConnection, void 0, disposables);
        that.onDidRemoveConnection(onDidRemoveConnection, void 0, disposables);
        eventMultiplexer.event(emitter.fire, emitter, disposables);
        disposables.add(eventMultiplexer);
      },
      onDidRemoveLastListener: () => {
        disposables?.dispose();
        disposables = void 0;
      }
    });
    that.disposables.add(emitter);
    return emitter.event;
  }
  registerChannel(channelName, channel) {
    this.channels.set(channelName, channel);
    for (const connection of this._connections) {
      connection.channelServer.registerChannel(channelName, channel);
    }
  }
  dispose() {
    this.disposables.dispose();
    for (const connection of this._connections) {
      connection.channelClient.dispose();
      connection.channelServer.dispose();
    }
    this._connections.clear();
    this.channels.clear();
    this._onDidAddConnection.dispose();
    this._onDidRemoveConnection.dispose();
  }
}
class IPCClient {
  constructor(protocol, ctx, ipcLogger = null) {
    const writer = new BufferWriter();
    try {
      serialize(writer, ctx);
      protocol.send(writer.buffer);
    } finally {
      writer.dispose();
    }
    this.channelClient = new ChannelClient(protocol, ipcLogger);
    this.channelServer = new ChannelServer(protocol, ctx, ipcLogger);
  }
  getChannel(channelName) {
    return this.channelClient.getChannel(channelName);
  }
  registerChannel(channelName, channel) {
    this.channelServer.registerChannel(channelName, channel);
  }
  dispose() {
    this.channelClient.dispose();
    this.channelServer.dispose();
  }
}
function getDelayedChannel(promise) {
  return {
    call(command, arg, cancellationToken) {
      return promise.then((c) => c.call(command, arg, cancellationToken));
    },
    listen(event, arg) {
      const relay = new Relay();
      promise.then((c) => relay.input = c.listen(event, arg));
      return relay.event;
    }
  };
}
function getNextTickChannel(channel) {
  let didTick = false;
  return {
    call(command, arg, cancellationToken) {
      if (didTick) {
        return channel.call(command, arg, cancellationToken);
      }
      return timeout(0).then(() => didTick = true).then(() => channel.call(command, arg, cancellationToken));
    },
    listen(event, arg) {
      if (didTick) {
        return channel.listen(event, arg);
      }
      const relay = new Relay();
      timeout(0).then(() => didTick = true).then(() => relay.input = channel.listen(event, arg));
      return relay.event;
    }
  };
}
class StaticRouter {
  constructor(fn) {
    this.fn = fn;
  }
  routeCall(hub) {
    return this.route(hub);
  }
  routeEvent(hub) {
    return this.route(hub);
  }
  async route(hub) {
    for (const connection of hub.connections) {
      if (await Promise.resolve(this.fn(connection.ctx))) {
        return Promise.resolve(connection);
      }
    }
    await Event.toPromise(hub.onDidAddConnection);
    return await this.route(hub);
  }
}
var ProxyChannel;
((ProxyChannel2) => {
  function fromService(service, disposables, options) {
    const handler = service;
    const disableMarshalling = options?.disableMarshalling;
    const unbufferedEvents = options?.unbufferedEvents ? new Set(options.unbufferedEvents) : void 0;
    const mapEventNameToEvent = /* @__PURE__ */ new Map();
    for (const key in handler) {
      if (propertyIsEvent(key) && !unbufferedEvents?.has(key)) {
        mapEventNameToEvent.set(key, Event.buffer(handler[key], key, true, void 0, disposables));
      }
    }
    return new class {
      listen(_, event, arg) {
        const eventImpl = mapEventNameToEvent.get(event);
        if (eventImpl) {
          return eventImpl;
        }
        const target = handler[event];
        if (typeof target === "function") {
          if (propertyIsDynamicEvent(event)) {
            return target.call(handler, arg);
          }
          if (propertyIsEvent(event)) {
            if (unbufferedEvents?.has(event)) {
              return handler[event];
            }
            mapEventNameToEvent.set(event, Event.buffer(handler[event], event, true, void 0, disposables));
            return mapEventNameToEvent.get(event);
          }
        }
        throw new ErrorNoTelemetry(`Event not found: ${event}`);
      }
      call(_, command, args) {
        const target = handler[command];
        if (typeof target === "function") {
          if (!disableMarshalling && Array.isArray(args)) {
            for (let i = 0; i < args.length; i++) {
              args[i] = revive(args[i]);
            }
          }
          let res = target.apply(handler, args);
          if (!(res instanceof Promise)) {
            res = Promise.resolve(res);
          }
          return res;
        }
        throw new ErrorNoTelemetry(`Method not found: ${command}`);
      }
    }();
  }
  ProxyChannel2.fromService = fromService;
  function toService(channel, options) {
    const disableMarshalling = options?.disableMarshalling;
    return new Proxy({}, {
      get(_target, propKey) {
        if (typeof propKey === "string") {
          if (options?.properties?.has(propKey)) {
            return options.properties.get(propKey);
          }
          if (propertyIsDynamicEvent(propKey)) {
            return function(arg) {
              return channel.listen(propKey, arg);
            };
          }
          if (propertyIsEvent(propKey)) {
            return channel.listen(propKey);
          }
          return async function(...args) {
            let methodArgs;
            if (options && !isUndefinedOrNull(options.context)) {
              methodArgs = [options.context, ...args];
            } else {
              methodArgs = args;
            }
            const result = await channel.call(propKey, methodArgs);
            if (!disableMarshalling) {
              return revive(result);
            }
            return result;
          };
        }
        throw new ErrorNoTelemetry(`Property not found: ${String(propKey)}`);
      }
    });
  }
  ProxyChannel2.toService = toService;
  function propertyIsEvent(name) {
    return name[0] === "o" && name[1] === "n" && strings.isUpperAsciiLetter(name.charCodeAt(2));
  }
  function propertyIsDynamicEvent(name) {
    return /^onDynamic/.test(name) && strings.isUpperAsciiLetter(name.charCodeAt(9));
  }
})(ProxyChannel || (ProxyChannel = {}));
const colorTables = [
  ["#2977B1", "#FC802D", "#34A13A", "#D3282F", "#9366BA"],
  ["#8B564C", "#E177C0", "#7F7F7F", "#BBBE3D", "#2EBECD"]
];
function prettyWithoutArrays(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object" && typeof data.toString === "function") {
    const result = data.toString();
    if (result !== "[object Object]") {
      return result;
    }
  }
  return data;
}
function pretty(data) {
  if (Array.isArray(data)) {
    return data.map(prettyWithoutArrays);
  }
  return prettyWithoutArrays(data);
}
function logWithColors(direction, totalLength, msgLength, req, initiator, str, data) {
  data = pretty(data);
  const colorTable = colorTables[initiator];
  const color = colorTable[req % colorTable.length];
  let args = [`%c[${direction}]%c[${String(totalLength).padStart(7, " ")}]%c[len: ${String(msgLength).padStart(5, " ")}]%c${String(req).padStart(5, " ")} - ${str}`, "color: darkgreen", "color: grey", "color: grey", `color: ${color}`];
  if (/\($/.test(str)) {
    args = args.concat(data);
    args.push(")");
  } else {
    args.push(data);
  }
  console.log.apply(console, args);
}
class IPCLogger {
  constructor(_outgoingPrefix, _incomingPrefix) {
    this._outgoingPrefix = _outgoingPrefix;
    this._incomingPrefix = _incomingPrefix;
    this._totalIncoming = 0;
    this._totalOutgoing = 0;
  }
  logOutgoing(msgLength, requestId, initiator, str, data) {
    this._totalOutgoing += msgLength;
    logWithColors(this._outgoingPrefix, this._totalOutgoing, msgLength, requestId, initiator, str, data);
  }
  logIncoming(msgLength, requestId, initiator, str, data) {
    this._totalIncoming += msgLength;
    logWithColors(this._incomingPrefix, this._totalIncoming, msgLength, requestId, initiator, str, data);
  }
}
export {
  BufferReader,
  BufferWriter,
  ChannelClient,
  ChannelServer,
  IPCClient,
  IPCLogger,
  IPCServer,
  ProxyChannel,
  RequestInitiator,
  StaticRouter,
  deserialize,
  getDelayedChannel,
  getNextTickChannel,
  serialize
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRSYW5kb21FbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBFcnJvck5vVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgRXZlbnRNdWx0aXBsZXhlciwgUmVsYXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpc0Z1bmN0aW9uLCBpc1VuZGVmaW5lZE9yTnVsbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5cbi8qKlxuICogQW4gYElDaGFubmVsYCBpcyBhbiBhYnN0cmFjdGlvbiBvdmVyIGEgY29sbGVjdGlvbiBvZiBjb21tYW5kcy5cbiAqIFlvdSBjYW4gYGNhbGxgIHNldmVyYWwgY29tbWFuZHMgb24gYSBjaGFubmVsLCBlYWNoIHRha2luZyBhdFxuICogbW9zdCBvbmUgc2luZ2xlIGFyZ3VtZW50LiBBIGBjYWxsYCBhbHdheXMgcmV0dXJucyBhIHByb21pc2VcbiAqIHdpdGggYXQgbW9zdCBvbmUgc2luZ2xlIHJldHVybiB2YWx1ZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhbm5lbCB7XG5cdGNhbGw8VD4oY29tbWFuZDogc3RyaW5nLCBhcmc/OiBhbnksIGNhbmNlbGxhdGlvblRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+O1xuXHRsaXN0ZW48VD4oZXZlbnQ6IHN0cmluZywgYXJnPzogYW55KTogRXZlbnQ8VD47XG59XG5cbi8qKlxuICogQW4gYElTZXJ2ZXJDaGFubmVsYCBpcyB0aGUgY291bnRlciBwYXJ0IHRvIGBJQ2hhbm5lbGAsXG4gKiBvbiB0aGUgc2VydmVyLXNpZGUuIFlvdSBzaG91bGQgaW1wbGVtZW50IHRoaXMgaW50ZXJmYWNlXG4gKiBpZiB5b3UnZCBsaWtlIHRvIGhhbmRsZSByZW1vdGUgcHJvbWlzZXMgb3IgZXZlbnRzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXJ2ZXJDaGFubmVsPFRDb250ZXh0ID0gc3RyaW5nPiB7XG5cdGNhbGw8VD4oY3R4OiBUQ29udGV4dCwgY29tbWFuZDogc3RyaW5nLCBhcmc/OiBhbnksIGNhbmNlbGxhdGlvblRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+O1xuXHRsaXN0ZW48VD4oY3R4OiBUQ29udGV4dCwgZXZlbnQ6IHN0cmluZywgYXJnPzogYW55KTogRXZlbnQ8VD47XG59XG5cbmNvbnN0IGVudW0gUmVxdWVzdFR5cGUge1xuXHRQcm9taXNlID0gMTAwLFxuXHRQcm9taXNlQ2FuY2VsID0gMTAxLFxuXHRFdmVudExpc3RlbiA9IDEwMixcblx0RXZlbnREaXNwb3NlID0gMTAzXG59XG5cbmZ1bmN0aW9uIHJlcXVlc3RUeXBlVG9TdHIodHlwZTogUmVxdWVzdFR5cGUpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIFJlcXVlc3RUeXBlLlByb21pc2U6XG5cdFx0XHRyZXR1cm4gJ3JlcSc7XG5cdFx0Y2FzZSBSZXF1ZXN0VHlwZS5Qcm9taXNlQ2FuY2VsOlxuXHRcdFx0cmV0dXJuICdjYW5jZWwnO1xuXHRcdGNhc2UgUmVxdWVzdFR5cGUuRXZlbnRMaXN0ZW46XG5cdFx0XHRyZXR1cm4gJ3N1YnNjcmliZSc7XG5cdFx0Y2FzZSBSZXF1ZXN0VHlwZS5FdmVudERpc3Bvc2U6XG5cdFx0XHRyZXR1cm4gJ3Vuc3Vic2NyaWJlJztcblx0fVxufVxuXG50eXBlIElSYXdQcm9taXNlUmVxdWVzdCA9IHsgdHlwZTogUmVxdWVzdFR5cGUuUHJvbWlzZTsgaWQ6IG51bWJlcjsgY2hhbm5lbE5hbWU6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBhcmc6IGFueSB9O1xudHlwZSBJUmF3UHJvbWlzZUNhbmNlbFJlcXVlc3QgPSB7IHR5cGU6IFJlcXVlc3RUeXBlLlByb21pc2VDYW5jZWw7IGlkOiBudW1iZXIgfTtcbnR5cGUgSVJhd0V2ZW50TGlzdGVuUmVxdWVzdCA9IHsgdHlwZTogUmVxdWVzdFR5cGUuRXZlbnRMaXN0ZW47IGlkOiBudW1iZXI7IGNoYW5uZWxOYW1lOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgYXJnOiBhbnkgfTtcbnR5cGUgSVJhd0V2ZW50RGlzcG9zZVJlcXVlc3QgPSB7IHR5cGU6IFJlcXVlc3RUeXBlLkV2ZW50RGlzcG9zZTsgaWQ6IG51bWJlciB9O1xudHlwZSBJUmF3UmVxdWVzdCA9IElSYXdQcm9taXNlUmVxdWVzdCB8IElSYXdQcm9taXNlQ2FuY2VsUmVxdWVzdCB8IElSYXdFdmVudExpc3RlblJlcXVlc3QgfCBJUmF3RXZlbnREaXNwb3NlUmVxdWVzdDtcblxuY29uc3QgZW51bSBSZXNwb25zZVR5cGUge1xuXHRJbml0aWFsaXplID0gMjAwLFxuXHRQcm9taXNlU3VjY2VzcyA9IDIwMSxcblx0UHJvbWlzZUVycm9yID0gMjAyLFxuXHRQcm9taXNlRXJyb3JPYmogPSAyMDMsXG5cdEV2ZW50RmlyZSA9IDIwNFxufVxuXG5mdW5jdGlvbiByZXNwb25zZVR5cGVUb1N0cih0eXBlOiBSZXNwb25zZVR5cGUpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Jbml0aWFsaXplOlxuXHRcdFx0cmV0dXJuIGBpbml0YDtcblx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Qcm9taXNlU3VjY2Vzczpcblx0XHRcdHJldHVybiBgcmVwbHk6YDtcblx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Qcm9taXNlRXJyb3I6XG5cdFx0Y2FzZSBSZXNwb25zZVR5cGUuUHJvbWlzZUVycm9yT2JqOlxuXHRcdFx0cmV0dXJuIGByZXBseUVycjpgO1xuXHRcdGNhc2UgUmVzcG9uc2VUeXBlLkV2ZW50RmlyZTpcblx0XHRcdHJldHVybiBgZXZlbnQ6YDtcblx0fVxufVxuXG50eXBlIElSYXdJbml0aWFsaXplUmVzcG9uc2UgPSB7IHR5cGU6IFJlc3BvbnNlVHlwZS5Jbml0aWFsaXplIH07XG50eXBlIElSYXdQcm9taXNlU3VjY2Vzc1Jlc3BvbnNlID0geyB0eXBlOiBSZXNwb25zZVR5cGUuUHJvbWlzZVN1Y2Nlc3M7IGlkOiBudW1iZXI7IGRhdGE6IGFueSB9O1xudHlwZSBJUmF3UHJvbWlzZUVycm9yUmVzcG9uc2UgPSB7IHR5cGU6IFJlc3BvbnNlVHlwZS5Qcm9taXNlRXJyb3I7IGlkOiBudW1iZXI7IGRhdGE6IHsgbWVzc2FnZTogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IHN0YWNrOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB9IH07XG50eXBlIElSYXdQcm9taXNlRXJyb3JPYmpSZXNwb25zZSA9IHsgdHlwZTogUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvck9iajsgaWQ6IG51bWJlcjsgZGF0YTogYW55IH07XG50eXBlIElSYXdFdmVudEZpcmVSZXNwb25zZSA9IHsgdHlwZTogUmVzcG9uc2VUeXBlLkV2ZW50RmlyZTsgaWQ6IG51bWJlcjsgZGF0YTogYW55IH07XG50eXBlIElSYXdSZXNwb25zZSA9IElSYXdJbml0aWFsaXplUmVzcG9uc2UgfCBJUmF3UHJvbWlzZVN1Y2Nlc3NSZXNwb25zZSB8IElSYXdQcm9taXNlRXJyb3JSZXNwb25zZSB8IElSYXdQcm9taXNlRXJyb3JPYmpSZXNwb25zZSB8IElSYXdFdmVudEZpcmVSZXNwb25zZTtcblxuaW50ZXJmYWNlIElIYW5kbGVyIHtcblx0KHJlc3BvbnNlOiBJUmF3UmVzcG9uc2UpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIHtcblx0c2VuZChidWZmZXI6IFZTQnVmZmVyKTogdm9pZDtcblx0cmVhZG9ubHkgb25NZXNzYWdlOiBFdmVudDxWU0J1ZmZlcj47XG5cdC8qKlxuXHQgKiBXYWl0IGZvciB0aGUgd3JpdGUgYnVmZmVyIChpZiBhcHBsaWNhYmxlKSB0byBiZWNvbWUgZW1wdHkuXG5cdCAqL1xuXHRkcmFpbj8oKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZW51bSBTdGF0ZSB7XG5cdFVuaW5pdGlhbGl6ZWQsXG5cdElkbGVcbn1cblxuLyoqXG4gKiBBbiBgSUNoYW5uZWxTZXJ2ZXJgIGhvc3RzIGEgY29sbGVjdGlvbiBvZiBjaGFubmVscy4gWW91IGFyZVxuICogYWJsZSB0byByZWdpc3RlciBjaGFubmVscyBvbnRvIGl0LCBwcm92aWRlZCBhIGNoYW5uZWwgbmFtZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhbm5lbFNlcnZlcjxUQ29udGV4dCA9IHN0cmluZz4ge1xuXHRyZWdpc3RlckNoYW5uZWwoY2hhbm5lbE5hbWU6IHN0cmluZywgY2hhbm5lbDogSVNlcnZlckNoYW5uZWw8VENvbnRleHQ+KTogdm9pZDtcbn1cblxuLyoqXG4gKiBBbiBgSUNoYW5uZWxDbGllbnRgIGhhcyBhY2Nlc3MgdG8gYSBjb2xsZWN0aW9uIG9mIGNoYW5uZWxzLiBZb3VcbiAqIGFyZSBhYmxlIHRvIGdldCB0aG9zZSBjaGFubmVscywgZ2l2ZW4gdGhlaXIgY2hhbm5lbCBuYW1lLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGFubmVsQ2xpZW50IHtcblx0Z2V0Q2hhbm5lbDxUIGV4dGVuZHMgSUNoYW5uZWw+KGNoYW5uZWxOYW1lOiBzdHJpbmcpOiBUO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsaWVudDxUQ29udGV4dD4ge1xuXHRyZWFkb25seSBjdHg6IFRDb250ZXh0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb25uZWN0aW9uSHViPFRDb250ZXh0PiB7XG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25zOiBDb25uZWN0aW9uPFRDb250ZXh0PltdO1xuXHRyZWFkb25seSBvbkRpZEFkZENvbm5lY3Rpb246IEV2ZW50PENvbm5lY3Rpb248VENvbnRleHQ+Pjtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVDb25uZWN0aW9uOiBFdmVudDxDb25uZWN0aW9uPFRDb250ZXh0Pj47XG59XG5cbi8qKlxuICogQW4gYElDbGllbnRSb3V0ZXJgIGlzIHJlc3BvbnNpYmxlIGZvciByb3V0aW5nIGNhbGxzIHRvIHNwZWNpZmljXG4gKiBjaGFubmVscywgaW4gc2NlbmFyaW9zIGluIHdoaWNoIHRoZXJlIGFyZSBtdWx0aXBsZSBwb3NzaWJsZVxuICogY2hhbm5lbHMgKGVhY2ggZnJvbSBhIHNlcGFyYXRlIGNsaWVudCkgdG8gcGljayBmcm9tLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDbGllbnRSb3V0ZXI8VENvbnRleHQgPSBzdHJpbmc+IHtcblx0cm91dGVDYWxsKGh1YjogSUNvbm5lY3Rpb25IdWI8VENvbnRleHQ+LCBjb21tYW5kOiBzdHJpbmcsIGFyZz86IGFueSwgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Q2xpZW50PFRDb250ZXh0Pj47XG5cdHJvdXRlRXZlbnQoaHViOiBJQ29ubmVjdGlvbkh1YjxUQ29udGV4dD4sIGV2ZW50OiBzdHJpbmcsIGFyZz86IGFueSk6IFByb21pc2U8Q2xpZW50PFRDb250ZXh0Pj47XG59XG5cbi8qKlxuICogU2ltaWxhciB0byB0aGUgYElDaGFubmVsQ2xpZW50YCwgeW91IGNhbiBnZXQgY2hhbm5lbHMgZnJvbSB0aGlzXG4gKiBjb2xsZWN0aW9uIG9mIGNoYW5uZWxzLiBUaGUgZGlmZmVyZW5jZSBiZWluZyB0aGF0IGluIHRoZVxuICogYElSb3V0aW5nQ2hhbm5lbENsaWVudGAsIHRoZXJlIGFyZSBtdWx0aXBsZSBjbGllbnRzIHByb3ZpZGluZ1xuICogdGhlIHNhbWUgY2hhbm5lbC4gWW91J2xsIG5lZWQgdG8gcGFzcyBpbiBhbiBgSUNsaWVudFJvdXRlcmAgaW5cbiAqIG9yZGVyIHRvIHBpY2sgdGhlIHJpZ2h0IG9uZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUm91dGluZ0NoYW5uZWxDbGllbnQ8VENvbnRleHQgPSBzdHJpbmc+IHtcblx0Z2V0Q2hhbm5lbDxUIGV4dGVuZHMgSUNoYW5uZWw+KGNoYW5uZWxOYW1lOiBzdHJpbmcsIHJvdXRlcj86IElDbGllbnRSb3V0ZXI8VENvbnRleHQ+KTogVDtcbn1cblxuaW50ZXJmYWNlIElSZWFkZXIge1xuXHRyZWFkKGJ5dGVzOiBudW1iZXIpOiBWU0J1ZmZlcjtcbn1cblxuaW50ZXJmYWNlIElXcml0ZXIge1xuXHR3cml0ZShidWZmZXI6IFZTQnVmZmVyKTogdm9pZDtcbn1cblxuXG4vKipcbiAqIEBzZWUgaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvVmFyaWFibGUtbGVuZ3RoX3F1YW50aXR5XG4gKi9cbmZ1bmN0aW9uIHJlYWRJbnRWUUwocmVhZGVyOiBJUmVhZGVyKSB7XG5cdGxldCB2YWx1ZSA9IDA7XG5cdGZvciAobGV0IG4gPSAwOyA7IG4gKz0gNykge1xuXHRcdGNvbnN0IG5leHQgPSByZWFkZXIucmVhZCgxKTtcblx0XHR2YWx1ZSB8PSAobmV4dC5idWZmZXJbMF0gJiAwYjAxMTExMTExKSA8PCBuO1xuXHRcdGlmICghKG5leHQuYnVmZmVyWzBdICYgMGIxMDAwMDAwMCkpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgdnFsWmVybyA9IGNyZWF0ZU9uZUJ5dGVCdWZmZXIoMCk7XG5cbi8qKlxuICogQHNlZSBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9WYXJpYWJsZS1sZW5ndGhfcXVhbnRpdHlcbiAqL1xuZnVuY3Rpb24gd3JpdGVJbnQzMlZRTCh3cml0ZXI6IElXcml0ZXIsIHZhbHVlOiBudW1iZXIpIHtcblx0aWYgKHZhbHVlID09PSAwKSB7XG5cdFx0d3JpdGVyLndyaXRlKHZxbFplcm8pO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGxldCBsZW4gPSAwO1xuXHRmb3IgKGxldCB2MiA9IHZhbHVlOyB2MiAhPT0gMDsgdjIgPSB2MiA+Pj4gNykge1xuXHRcdGxlbisrO1xuXHR9XG5cblx0Y29uc3Qgc2NyYXRjaCA9IFZTQnVmZmVyLmFsbG9jKGxlbik7XG5cdGZvciAobGV0IGkgPSAwOyB2YWx1ZSAhPT0gMDsgaSsrKSB7XG5cdFx0c2NyYXRjaC5idWZmZXJbaV0gPSB2YWx1ZSAmIDBiMDExMTExMTE7XG5cdFx0dmFsdWUgPSB2YWx1ZSA+Pj4gNztcblx0XHRpZiAodmFsdWUgPiAwKSB7XG5cdFx0XHRzY3JhdGNoLmJ1ZmZlcltpXSB8PSAwYjEwMDAwMDAwO1xuXHRcdH1cblx0fVxuXG5cdHdyaXRlci53cml0ZShzY3JhdGNoKTtcbn1cblxuZXhwb3J0IGNsYXNzIEJ1ZmZlclJlYWRlciBpbXBsZW1lbnRzIElSZWFkZXIge1xuXG5cdHByaXZhdGUgcG9zID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGJ1ZmZlcjogVlNCdWZmZXIpIHsgfVxuXG5cdHJlYWQoYnl0ZXM6IG51bWJlcik6IFZTQnVmZmVyIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmJ1ZmZlci5zbGljZSh0aGlzLnBvcywgdGhpcy5wb3MgKyBieXRlcyk7XG5cdFx0dGhpcy5wb3MgKz0gcmVzdWx0LmJ5dGVMZW5ndGg7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnVmZmVyV3JpdGVyIGltcGxlbWVudHMgSVdyaXRlciwgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgYnVmZmVyczogVlNCdWZmZXJbXSA9IFtdO1xuXG5cdGdldCBidWZmZXIoKTogVlNCdWZmZXIge1xuXHRcdHJldHVybiBWU0J1ZmZlci5jb25jYXQodGhpcy5idWZmZXJzKTtcblx0fVxuXG5cdHdyaXRlKGJ1ZmZlcjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLmJ1ZmZlcnMucHVzaChidWZmZXIpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBSZWxlYXNlIHRoZSBidWZmZXJzIHNvIGEgdGhyb3duIHNlcmlhbGl6YXRpb24gZXJyb3IncyBzdGFjayBjYW4ndCBwaW4gdGhlbS5cblx0XHR0aGlzLmJ1ZmZlcnMubGVuZ3RoID0gMDtcblx0fVxufVxuXG5lbnVtIERhdGFUeXBlIHtcblx0VW5kZWZpbmVkID0gMCxcblx0U3RyaW5nID0gMSxcblx0QnVmZmVyID0gMixcblx0VlNCdWZmZXIgPSAzLFxuXHRBcnJheSA9IDQsXG5cdE9iamVjdCA9IDUsXG5cdEludCA9IDZcbn1cblxuZnVuY3Rpb24gY3JlYXRlT25lQnl0ZUJ1ZmZlcih2YWx1ZTogbnVtYmVyKTogVlNCdWZmZXIge1xuXHRjb25zdCByZXN1bHQgPSBWU0J1ZmZlci5hbGxvYygxKTtcblx0cmVzdWx0LndyaXRlVUludDgodmFsdWUsIDApO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5jb25zdCBCdWZmZXJQcmVzZXRzID0ge1xuXHRVbmRlZmluZWQ6IGNyZWF0ZU9uZUJ5dGVCdWZmZXIoRGF0YVR5cGUuVW5kZWZpbmVkKSxcblx0U3RyaW5nOiBjcmVhdGVPbmVCeXRlQnVmZmVyKERhdGFUeXBlLlN0cmluZyksXG5cdEJ1ZmZlcjogY3JlYXRlT25lQnl0ZUJ1ZmZlcihEYXRhVHlwZS5CdWZmZXIpLFxuXHRWU0J1ZmZlcjogY3JlYXRlT25lQnl0ZUJ1ZmZlcihEYXRhVHlwZS5WU0J1ZmZlciksXG5cdEFycmF5OiBjcmVhdGVPbmVCeXRlQnVmZmVyKERhdGFUeXBlLkFycmF5KSxcblx0T2JqZWN0OiBjcmVhdGVPbmVCeXRlQnVmZmVyKERhdGFUeXBlLk9iamVjdCksXG5cdFVpbnQ6IGNyZWF0ZU9uZUJ5dGVCdWZmZXIoRGF0YVR5cGUuSW50KSxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemUod3JpdGVyOiBJV3JpdGVyLCBkYXRhOiBhbnkpOiB2b2lkIHtcblx0aWYgKHR5cGVvZiBkYXRhID09PSAndW5kZWZpbmVkJykge1xuXHRcdHdyaXRlci53cml0ZShCdWZmZXJQcmVzZXRzLlVuZGVmaW5lZCk7XG5cdH0gZWxzZSBpZiAodHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnKSB7XG5cdFx0Y29uc3QgYnVmZmVyID0gVlNCdWZmZXIuZnJvbVN0cmluZyhkYXRhKTtcblx0XHR3cml0ZXIud3JpdGUoQnVmZmVyUHJlc2V0cy5TdHJpbmcpO1xuXHRcdHdyaXRlSW50MzJWUUwod3JpdGVyLCBidWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0d3JpdGVyLndyaXRlKGJ1ZmZlcik7XG5cdH0gZWxzZSBpZiAoVlNCdWZmZXIuaXNOYXRpdmVCdWZmZXIoZGF0YSkpIHtcblx0XHRjb25zdCBidWZmZXIgPSBWU0J1ZmZlci53cmFwKGRhdGEpO1xuXHRcdHdyaXRlci53cml0ZShCdWZmZXJQcmVzZXRzLkJ1ZmZlcik7XG5cdFx0d3JpdGVJbnQzMlZRTCh3cml0ZXIsIGJ1ZmZlci5ieXRlTGVuZ3RoKTtcblx0XHR3cml0ZXIud3JpdGUoYnVmZmVyKTtcblx0fSBlbHNlIGlmIChkYXRhIGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHR3cml0ZXIud3JpdGUoQnVmZmVyUHJlc2V0cy5WU0J1ZmZlcik7XG5cdFx0d3JpdGVJbnQzMlZRTCh3cml0ZXIsIGRhdGEuYnl0ZUxlbmd0aCk7XG5cdFx0d3JpdGVyLndyaXRlKGRhdGEpO1xuXHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcblx0XHR3cml0ZXIud3JpdGUoQnVmZmVyUHJlc2V0cy5BcnJheSk7XG5cdFx0d3JpdGVJbnQzMlZRTCh3cml0ZXIsIGRhdGEubGVuZ3RoKTtcblxuXHRcdGZvciAoY29uc3QgZWwgb2YgZGF0YSkge1xuXHRcdFx0c2VyaWFsaXplKHdyaXRlciwgZWwpO1xuXHRcdH1cblx0fSBlbHNlIGlmICh0eXBlb2YgZGF0YSA9PT0gJ251bWJlcicgJiYgKGRhdGEgfCAwKSA9PT0gZGF0YSkge1xuXHRcdC8vIHdyaXRlIGEgdnFsIGlmIGl0J3MgYSBudW1iZXIgdGhhdCB3ZSBjYW4gZG8gYml0d2lzZSBvcGVyYXRpb25zIG9uXG5cdFx0d3JpdGVyLndyaXRlKEJ1ZmZlclByZXNldHMuVWludCk7XG5cdFx0d3JpdGVJbnQzMlZRTCh3cml0ZXIsIGRhdGEpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoZGF0YSkpO1xuXHRcdHdyaXRlci53cml0ZShCdWZmZXJQcmVzZXRzLk9iamVjdCk7XG5cdFx0d3JpdGVJbnQzMlZRTCh3cml0ZXIsIGJ1ZmZlci5ieXRlTGVuZ3RoKTtcblx0XHR3cml0ZXIud3JpdGUoYnVmZmVyKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVzZXJpYWxpemUocmVhZGVyOiBJUmVhZGVyKTogYW55IHtcblx0Y29uc3QgdHlwZSA9IHJlYWRlci5yZWFkKDEpLnJlYWRVSW50OCgwKTtcblxuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIERhdGFUeXBlLlVuZGVmaW5lZDogcmV0dXJuIHVuZGVmaW5lZDtcblx0XHRjYXNlIERhdGFUeXBlLlN0cmluZzogcmV0dXJuIHJlYWRlci5yZWFkKHJlYWRJbnRWUUwocmVhZGVyKSkudG9TdHJpbmcoKTtcblx0XHRjYXNlIERhdGFUeXBlLkJ1ZmZlcjogcmV0dXJuIHJlYWRlci5yZWFkKHJlYWRJbnRWUUwocmVhZGVyKSkuYnVmZmVyO1xuXHRcdGNhc2UgRGF0YVR5cGUuVlNCdWZmZXI6IHJldHVybiByZWFkZXIucmVhZChyZWFkSW50VlFMKHJlYWRlcikpO1xuXHRcdGNhc2UgRGF0YVR5cGUuQXJyYXk6IHtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IHJlYWRJbnRWUUwocmVhZGVyKTtcblx0XHRcdGNvbnN0IHJlc3VsdDogYW55W10gPSBbXTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0XHRyZXN1bHQucHVzaChkZXNlcmlhbGl6ZShyZWFkZXIpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Y2FzZSBEYXRhVHlwZS5PYmplY3Q6IHJldHVybiBKU09OLnBhcnNlKHJlYWRlci5yZWFkKHJlYWRJbnRWUUwocmVhZGVyKSkudG9TdHJpbmcoKSk7XG5cdFx0Y2FzZSBEYXRhVHlwZS5JbnQ6IHJldHVybiByZWFkSW50VlFMKHJlYWRlcik7XG5cdH1cbn1cblxuaW50ZXJmYWNlIFBlbmRpbmdSZXF1ZXN0IHtcblx0cmVxdWVzdDogSVJhd1Byb21pc2VSZXF1ZXN0IHwgSVJhd0V2ZW50TGlzdGVuUmVxdWVzdDtcblx0dGltZW91dFRpbWVyOiBUaW1lb3V0O1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhbm5lbFNlcnZlcjxUQ29udGV4dCA9IHN0cmluZz4gaW1wbGVtZW50cyBJQ2hhbm5lbFNlcnZlcjxUQ29udGV4dD4sIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGNoYW5uZWxzID0gbmV3IE1hcDxzdHJpbmcsIElTZXJ2ZXJDaGFubmVsPFRDb250ZXh0Pj4oKTtcblx0cHJpdmF0ZSBhY3RpdmVSZXF1ZXN0cyA9IG5ldyBNYXA8bnVtYmVyLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSBwcm90b2NvbExpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IG51bGw7XG5cblx0Ly8gUmVxdWVzdHMgbWlnaHQgY29tZSBpbiBmb3IgY2hhbm5lbHMgd2hpY2ggYXJlIG5vdCB5ZXQgcmVnaXN0ZXJlZC5cblx0Ly8gVGhleSB3aWxsIHRpbWVvdXQgYWZ0ZXIgYHRpbWVvdXREZWxheWAuXG5cdHByaXZhdGUgcGVuZGluZ1JlcXVlc3RzID0gbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdSZXF1ZXN0W10+KCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBwcm90b2NvbDogSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wsIHByaXZhdGUgY3R4OiBUQ29udGV4dCwgcHJpdmF0ZSBsb2dnZXI6IElJUENMb2dnZXIgfCBudWxsID0gbnVsbCwgcHJpdmF0ZSB0aW1lb3V0RGVsYXkgPSAxMDAwKSB7XG5cdFx0dGhpcy5wcm90b2NvbExpc3RlbmVyID0gdGhpcy5wcm90b2NvbC5vbk1lc3NhZ2UobXNnID0+IHRoaXMub25SYXdNZXNzYWdlKG1zZykpO1xuXHRcdHRoaXMuc2VuZFJlc3BvbnNlKHsgdHlwZTogUmVzcG9uc2VUeXBlLkluaXRpYWxpemUgfSk7XG5cdH1cblxuXHRyZWdpc3RlckNoYW5uZWwoY2hhbm5lbE5hbWU6IHN0cmluZywgY2hhbm5lbDogSVNlcnZlckNoYW5uZWw8VENvbnRleHQ+KTogdm9pZCB7XG5cdFx0dGhpcy5jaGFubmVscy5zZXQoY2hhbm5lbE5hbWUsIGNoYW5uZWwpO1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzcyNTMxXG5cdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLmZsdXNoUGVuZGluZ1JlcXVlc3RzKGNoYW5uZWxOYW1lKSwgMCk7XG5cdH1cblxuXHRwcml2YXRlIHNlbmRSZXNwb25zZShyZXNwb25zZTogSVJhd1Jlc3BvbnNlKTogdm9pZCB7XG5cdFx0c3dpdGNoIChyZXNwb25zZS50eXBlKSB7XG5cdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Jbml0aWFsaXplOiB7XG5cdFx0XHRcdGNvbnN0IG1zZ0xlbmd0aCA9IHRoaXMuc2VuZChbcmVzcG9uc2UudHlwZV0pO1xuXHRcdFx0XHR0aGlzLmxvZ2dlcj8ubG9nT3V0Z29pbmcobXNnTGVuZ3RoLCAwLCBSZXF1ZXN0SW5pdGlhdG9yLk90aGVyU2lkZSwgcmVzcG9uc2VUeXBlVG9TdHIocmVzcG9uc2UudHlwZSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLlByb21pc2VTdWNjZXNzOlxuXHRcdFx0Y2FzZSBSZXNwb25zZVR5cGUuUHJvbWlzZUVycm9yOlxuXHRcdFx0Y2FzZSBSZXNwb25zZVR5cGUuRXZlbnRGaXJlOlxuXHRcdFx0Y2FzZSBSZXNwb25zZVR5cGUuUHJvbWlzZUVycm9yT2JqOiB7XG5cdFx0XHRcdGNvbnN0IG1zZ0xlbmd0aCA9IHRoaXMuc2VuZChbcmVzcG9uc2UudHlwZSwgcmVzcG9uc2UuaWRdLCByZXNwb25zZS5kYXRhKTtcblx0XHRcdFx0dGhpcy5sb2dnZXI/LmxvZ091dGdvaW5nKG1zZ0xlbmd0aCwgcmVzcG9uc2UuaWQsIFJlcXVlc3RJbml0aWF0b3IuT3RoZXJTaWRlLCByZXNwb25zZVR5cGVUb1N0cihyZXNwb25zZS50eXBlKSwgcmVzcG9uc2UuZGF0YSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNlbmQoaGVhZGVyOiB1bmtub3duLCBib2R5OiBhbnkgPSB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRcdGNvbnN0IHdyaXRlciA9IG5ldyBCdWZmZXJXcml0ZXIoKTtcblx0XHR0cnkge1xuXHRcdFx0c2VyaWFsaXplKHdyaXRlciwgaGVhZGVyKTtcblx0XHRcdHNlcmlhbGl6ZSh3cml0ZXIsIGJvZHkpO1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VuZEJ1ZmZlcih3cml0ZXIuYnVmZmVyKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0d3JpdGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNlbmRCdWZmZXIobWVzc2FnZTogVlNCdWZmZXIpOiBudW1iZXIge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnByb3RvY29sLnNlbmQobWVzc2FnZSk7XG5cdFx0XHRyZXR1cm4gbWVzc2FnZS5ieXRlTGVuZ3RoO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gbm9vcFxuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblJhd01lc3NhZ2UobWVzc2FnZTogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRjb25zdCByZWFkZXIgPSBuZXcgQnVmZmVyUmVhZGVyKG1lc3NhZ2UpO1xuXHRcdGNvbnN0IGhlYWRlciA9IGRlc2VyaWFsaXplKHJlYWRlcik7XG5cdFx0Y29uc3QgYm9keSA9IGRlc2VyaWFsaXplKHJlYWRlcik7XG5cdFx0Y29uc3QgdHlwZSA9IGhlYWRlclswXSBhcyBSZXF1ZXN0VHlwZTtcblxuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBSZXF1ZXN0VHlwZS5Qcm9taXNlOlxuXHRcdFx0XHR0aGlzLmxvZ2dlcj8ubG9nSW5jb21pbmcobWVzc2FnZS5ieXRlTGVuZ3RoLCBoZWFkZXJbMV0sIFJlcXVlc3RJbml0aWF0b3IuT3RoZXJTaWRlLCBgJHtyZXF1ZXN0VHlwZVRvU3RyKHR5cGUpfTogJHtoZWFkZXJbMl19LiR7aGVhZGVyWzNdfWAsIGJvZHkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5vblByb21pc2UoeyB0eXBlLCBpZDogaGVhZGVyWzFdLCBjaGFubmVsTmFtZTogaGVhZGVyWzJdLCBuYW1lOiBoZWFkZXJbM10sIGFyZzogYm9keSB9KTtcblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuRXZlbnRMaXN0ZW46XG5cdFx0XHRcdHRoaXMubG9nZ2VyPy5sb2dJbmNvbWluZyhtZXNzYWdlLmJ5dGVMZW5ndGgsIGhlYWRlclsxXSwgUmVxdWVzdEluaXRpYXRvci5PdGhlclNpZGUsIGAke3JlcXVlc3RUeXBlVG9TdHIodHlwZSl9OiAke2hlYWRlclsyXX0uJHtoZWFkZXJbM119YCwgYm9keSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLm9uRXZlbnRMaXN0ZW4oeyB0eXBlLCBpZDogaGVhZGVyWzFdLCBjaGFubmVsTmFtZTogaGVhZGVyWzJdLCBuYW1lOiBoZWFkZXJbM10sIGFyZzogYm9keSB9KTtcblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuUHJvbWlzZUNhbmNlbDpcblx0XHRcdFx0dGhpcy5sb2dnZXI/LmxvZ0luY29taW5nKG1lc3NhZ2UuYnl0ZUxlbmd0aCwgaGVhZGVyWzFdLCBSZXF1ZXN0SW5pdGlhdG9yLk90aGVyU2lkZSwgYCR7cmVxdWVzdFR5cGVUb1N0cih0eXBlKX1gKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZGlzcG9zZUFjdGl2ZVJlcXVlc3QoeyB0eXBlLCBpZDogaGVhZGVyWzFdIH0pO1xuXHRcdFx0Y2FzZSBSZXF1ZXN0VHlwZS5FdmVudERpc3Bvc2U6XG5cdFx0XHRcdHRoaXMubG9nZ2VyPy5sb2dJbmNvbWluZyhtZXNzYWdlLmJ5dGVMZW5ndGgsIGhlYWRlclsxXSwgUmVxdWVzdEluaXRpYXRvci5PdGhlclNpZGUsIGAke3JlcXVlc3RUeXBlVG9TdHIodHlwZSl9YCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmRpc3Bvc2VBY3RpdmVSZXF1ZXN0KHsgdHlwZSwgaWQ6IGhlYWRlclsxXSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uUHJvbWlzZShyZXF1ZXN0OiBJUmF3UHJvbWlzZVJlcXVlc3QpOiB2b2lkIHtcblx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5jaGFubmVscy5nZXQocmVxdWVzdC5jaGFubmVsTmFtZSk7XG5cblx0XHRpZiAoIWNoYW5uZWwpIHtcblx0XHRcdHRoaXMuY29sbGVjdFBlbmRpbmdSZXF1ZXN0KHJlcXVlc3QpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhbmNlbGxhdGlvblRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0bGV0IHByb21pc2U6IFByb21pc2U8YW55PjtcblxuXHRcdHRyeSB7XG5cdFx0XHRwcm9taXNlID0gY2hhbm5lbC5jYWxsKHRoaXMuY3R4LCByZXF1ZXN0Lm5hbWUsIHJlcXVlc3QuYXJnLCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRwcm9taXNlID0gUHJvbWlzZS5yZWplY3QoZXJyKTtcblx0XHR9XG5cblx0XHRjb25zdCBpZCA9IHJlcXVlc3QuaWQ7XG5cblx0XHRwcm9taXNlLnRoZW4oZGF0YSA9PiB7XG5cdFx0XHR0aGlzLnNlbmRSZXNwb25zZSh7IGlkLCBkYXRhLCB0eXBlOiBSZXNwb25zZVR5cGUuUHJvbWlzZVN1Y2Nlc3MgfSk7XG5cdFx0fSwgZXJyID0+IHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHR0aGlzLnNlbmRSZXNwb25zZSh7XG5cdFx0XHRcdFx0aWQsIGRhdGE6IHtcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGVyci5tZXNzYWdlLFxuXHRcdFx0XHRcdFx0bmFtZTogZXJyLm5hbWUsXG5cdFx0XHRcdFx0XHRzdGFjazogZXJyLnN0YWNrID8gZXJyLnN0YWNrLnNwbGl0KCdcXG4nKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sIHR5cGU6IFJlc3BvbnNlVHlwZS5Qcm9taXNlRXJyb3Jcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNlbmRSZXNwb25zZSh7IGlkLCBkYXRhOiBlcnIsIHR5cGU6IFJlc3BvbnNlVHlwZS5Qcm9taXNlRXJyb3JPYmogfSk7XG5cdFx0XHR9XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuYWN0aXZlUmVxdWVzdHMuZGVsZXRlKHJlcXVlc3QuaWQpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5jYW5jZWwoKSk7XG5cdFx0dGhpcy5hY3RpdmVSZXF1ZXN0cy5zZXQocmVxdWVzdC5pZCwgZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRXZlbnRMaXN0ZW4ocmVxdWVzdDogSVJhd0V2ZW50TGlzdGVuUmVxdWVzdCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0aGlzLmNoYW5uZWxzLmdldChyZXF1ZXN0LmNoYW5uZWxOYW1lKTtcblxuXHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0dGhpcy5jb2xsZWN0UGVuZGluZ1JlcXVlc3QocmVxdWVzdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWQgPSByZXF1ZXN0LmlkO1xuXHRcdGNvbnN0IGV2ZW50ID0gY2hhbm5lbC5saXN0ZW4odGhpcy5jdHgsIHJlcXVlc3QubmFtZSwgcmVxdWVzdC5hcmcpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBldmVudChkYXRhID0+IHRoaXMuc2VuZFJlc3BvbnNlKHsgaWQsIGRhdGEsIHR5cGU6IFJlc3BvbnNlVHlwZS5FdmVudEZpcmUgfSkpO1xuXG5cdFx0dGhpcy5hY3RpdmVSZXF1ZXN0cy5zZXQocmVxdWVzdC5pZCwgZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3Bvc2VBY3RpdmVSZXF1ZXN0KHJlcXVlc3Q6IElSYXdSZXF1ZXN0KTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuYWN0aXZlUmVxdWVzdHMuZ2V0KHJlcXVlc3QuaWQpO1xuXG5cdFx0aWYgKGRpc3Bvc2FibGUpIHtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5hY3RpdmVSZXF1ZXN0cy5kZWxldGUocmVxdWVzdC5pZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb2xsZWN0UGVuZGluZ1JlcXVlc3QocmVxdWVzdDogSVJhd1Byb21pc2VSZXF1ZXN0IHwgSVJhd0V2ZW50TGlzdGVuUmVxdWVzdCk6IHZvaWQge1xuXHRcdGxldCBwZW5kaW5nUmVxdWVzdHMgPSB0aGlzLnBlbmRpbmdSZXF1ZXN0cy5nZXQocmVxdWVzdC5jaGFubmVsTmFtZSk7XG5cblx0XHRpZiAoIXBlbmRpbmdSZXF1ZXN0cykge1xuXHRcdFx0cGVuZGluZ1JlcXVlc3RzID0gW107XG5cdFx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0cy5zZXQocmVxdWVzdC5jaGFubmVsTmFtZSwgcGVuZGluZ1JlcXVlc3RzKTtcblx0XHR9XG5cblx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgVW5rbm93biBjaGFubmVsOiAke3JlcXVlc3QuY2hhbm5lbE5hbWV9YCk7XG5cblx0XHRcdGlmIChyZXF1ZXN0LnR5cGUgPT09IFJlcXVlc3RUeXBlLlByb21pc2UpIHtcblx0XHRcdFx0dGhpcy5zZW5kUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdGlkOiByZXF1ZXN0LmlkLFxuXHRcdFx0XHRcdGRhdGE6IHsgbmFtZTogJ1Vua25vd24gY2hhbm5lbCcsIG1lc3NhZ2U6IGBDaGFubmVsIG5hbWUgJyR7cmVxdWVzdC5jaGFubmVsTmFtZX0nIHRpbWVkIG91dCBhZnRlciAke3RoaXMudGltZW91dERlbGF5fW1zYCwgc3RhY2s6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHR5cGU6IFJlc3BvbnNlVHlwZS5Qcm9taXNlRXJyb3Jcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcy50aW1lb3V0RGVsYXkpO1xuXG5cdFx0cGVuZGluZ1JlcXVlc3RzLnB1c2goeyByZXF1ZXN0LCB0aW1lb3V0VGltZXI6IHRpbWVyIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBmbHVzaFBlbmRpbmdSZXF1ZXN0cyhjaGFubmVsTmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVxdWVzdHMgPSB0aGlzLnBlbmRpbmdSZXF1ZXN0cy5nZXQoY2hhbm5lbE5hbWUpO1xuXG5cdFx0aWYgKHJlcXVlc3RzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgcmVxdWVzdHMpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHJlcXVlc3QudGltZW91dFRpbWVyKTtcblxuXHRcdFx0XHRzd2l0Y2ggKHJlcXVlc3QucmVxdWVzdC50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSBSZXF1ZXN0VHlwZS5Qcm9taXNlOiB0aGlzLm9uUHJvbWlzZShyZXF1ZXN0LnJlcXVlc3QpOyBicmVhaztcblx0XHRcdFx0XHRjYXNlIFJlcXVlc3RUeXBlLkV2ZW50TGlzdGVuOiB0aGlzLm9uRXZlbnRMaXN0ZW4ocmVxdWVzdC5yZXF1ZXN0KTsgYnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKGNoYW5uZWxOYW1lKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wcm90b2NvbExpc3RlbmVyKSB7XG5cdFx0XHR0aGlzLnByb3RvY29sTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5wcm90b2NvbExpc3RlbmVyID0gbnVsbDtcblx0XHR9XG5cdFx0ZGlzcG9zZSh0aGlzLmFjdGl2ZVJlcXVlc3RzLnZhbHVlcygpKTtcblx0XHR0aGlzLmFjdGl2ZVJlcXVlc3RzLmNsZWFyKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUmVxdWVzdEluaXRpYXRvciB7XG5cdExvY2FsU2lkZSA9IDAsXG5cdE90aGVyU2lkZSA9IDFcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSVBDTG9nZ2VyIHtcblx0bG9nSW5jb21pbmcobXNnTGVuZ3RoOiBudW1iZXIsIHJlcXVlc3RJZDogbnVtYmVyLCBpbml0aWF0b3I6IFJlcXVlc3RJbml0aWF0b3IsIHN0cjogc3RyaW5nLCBkYXRhPzogYW55KTogdm9pZDtcblx0bG9nT3V0Z29pbmcobXNnTGVuZ3RoOiBudW1iZXIsIHJlcXVlc3RJZDogbnVtYmVyLCBpbml0aWF0b3I6IFJlcXVlc3RJbml0aWF0b3IsIHN0cjogc3RyaW5nLCBkYXRhPzogYW55KTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIENoYW5uZWxDbGllbnQgaW1wbGVtZW50cyBJQ2hhbm5lbENsaWVudCwgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHN0YXRlOiBTdGF0ZSA9IFN0YXRlLlVuaW5pdGlhbGl6ZWQ7XG5cdHByaXZhdGUgYWN0aXZlUmVxdWVzdHMgPSBuZXcgU2V0PElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIGhhbmRsZXJzID0gbmV3IE1hcDxudW1iZXIsIElIYW5kbGVyPigpO1xuXHRwcml2YXRlIGxhc3RSZXF1ZXN0SWQgPSAwO1xuXHRwcml2YXRlIHByb3RvY29sTGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgbnVsbDtcblx0cHJpdmF0ZSBsb2dnZXI6IElJUENMb2dnZXIgfCBudWxsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5pdGlhbGl6ZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkSW5pdGlhbGl6ZSA9IHRoaXMuX29uRGlkSW5pdGlhbGl6ZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHByb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCwgbG9nZ2VyOiBJSVBDTG9nZ2VyIHwgbnVsbCA9IG51bGwpIHtcblx0XHR0aGlzLnByb3RvY29sTGlzdGVuZXIgPSB0aGlzLnByb3RvY29sLm9uTWVzc2FnZShtc2cgPT4gdGhpcy5vbkJ1ZmZlcihtc2cpKTtcblx0XHR0aGlzLmxvZ2dlciA9IGxvZ2dlcjtcblx0fVxuXG5cdGdldENoYW5uZWw8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsTmFtZTogc3RyaW5nKTogVCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNhbGwoY29tbWFuZDogc3RyaW5nLCBhcmc/OiBhbnksIGNhbmNlbGxhdGlvblRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0aWYgKHRoYXQuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoYXQucmVxdWVzdFByb21pc2UoY2hhbm5lbE5hbWUsIGNvbW1hbmQsIGFyZywgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdGxpc3RlbihldmVudDogc3RyaW5nLCBhcmc6IGFueSkge1xuXHRcdFx0XHRpZiAodGhhdC5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEV2ZW50Lk5vbmU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoYXQucmVxdWVzdEV2ZW50KGNoYW5uZWxOYW1lLCBldmVudCwgYXJnKTtcblx0XHRcdH1cblx0XHR9IGFzIFQ7XG5cdH1cblxuXHRwcml2YXRlIHJlcXVlc3RQcm9taXNlKGNoYW5uZWxOYW1lOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgYXJnPzogYW55LCBjYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBpZCA9IHRoaXMubGFzdFJlcXVlc3RJZCsrO1xuXHRcdGNvbnN0IHR5cGUgPSBSZXF1ZXN0VHlwZS5Qcm9taXNlO1xuXHRcdGNvbnN0IHJlcXVlc3Q6IElSYXdSZXF1ZXN0ID0geyBpZCwgdHlwZSwgY2hhbm5lbE5hbWUsIG5hbWUsIGFyZyB9O1xuXG5cdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH1cblxuXHRcdGxldCBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblx0XHRsZXQgZGlzcG9zYWJsZVdpdGhSZXF1ZXN0Q2FuY2VsOiBJRGlzcG9zYWJsZTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9taXNlKChjLCBlKSA9PiB7XG5cdFx0XHRpZiAoY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIGUobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkb1JlcXVlc3QgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZXI6IElIYW5kbGVyID0gcmVzcG9uc2UgPT4ge1xuXHRcdFx0XHRcdHN3aXRjaCAocmVzcG9uc2UudHlwZSkge1xuXHRcdFx0XHRcdFx0Y2FzZSBSZXNwb25zZVR5cGUuUHJvbWlzZVN1Y2Nlc3M6XG5cdFx0XHRcdFx0XHRcdHRoaXMuaGFuZGxlcnMuZGVsZXRlKGlkKTtcblx0XHRcdFx0XHRcdFx0YyhyZXNwb25zZS5kYXRhKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvcjoge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmhhbmRsZXJzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKHJlc3BvbnNlLmRhdGEubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHRcdGVycm9yLnN0YWNrID0gQXJyYXkuaXNBcnJheShyZXNwb25zZS5kYXRhLnN0YWNrKSA/IHJlc3BvbnNlLmRhdGEuc3RhY2suam9pbignXFxuJykgOiByZXNwb25zZS5kYXRhLnN0YWNrO1xuXHRcdFx0XHRcdFx0XHRlcnJvci5uYW1lID0gcmVzcG9uc2UuZGF0YS5uYW1lO1xuXHRcdFx0XHRcdFx0XHRlKGVycm9yKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Qcm9taXNlRXJyb3JPYmo6XG5cdFx0XHRcdFx0XHRcdHRoaXMuaGFuZGxlcnMuZGVsZXRlKGlkKTtcblx0XHRcdFx0XHRcdFx0ZShyZXNwb25zZS5kYXRhKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoaXMuaGFuZGxlcnMuc2V0KGlkLCBoYW5kbGVyKTtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMuc2VuZFJlcXVlc3QocmVxdWVzdCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdC8vIGBzZW5kUmVxdWVzdGAgY2FuIHRocm93IHN5bmNocm9ub3VzbHkgd2hpbGUgc2VyaWFsaXppbmcgdGhlXG5cdFx0XHRcdFx0Ly8gcmVxdWVzdCAoZS5nLiBhbiBvdmVyc2l6ZWQgYXJndW1lbnQpLiBUaGUgaGFuZGxlciB3YXMganVzdFxuXHRcdFx0XHRcdC8vIHJlZ2lzdGVyZWQgYnV0IG5vIHJlcXVlc3Qgd2VudCBvdXQgYW5kIGl0J3Mgb25seSByZW1vdmVkIG9uIGFcblx0XHRcdFx0XHQvLyByZXNwb25zZSwgc28gd2l0aG91dCB0aGlzIGl0IHdvdWxkIGxlYWsgKGFsb25nIHdpdGggdGhlIHJlamVjdGVkXG5cdFx0XHRcdFx0Ly8gcHJvbWlzZSBhbmQgZXJyb3IgaXQgcmV0YWlucykuIENsZWFuIHVwIGFuZCByZWplY3QuXG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVycy5kZWxldGUoaWQpO1xuXHRcdFx0XHRcdGUoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0bGV0IHVuaW5pdGlhbGl6ZWRQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuXHRcdFx0aWYgKHRoaXMuc3RhdGUgPT09IFN0YXRlLklkbGUpIHtcblx0XHRcdFx0ZG9SZXF1ZXN0KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR1bmluaXRpYWxpemVkUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKF8gPT4gdGhpcy53aGVuSW5pdGlhbGl6ZWQoKSk7XG5cdFx0XHRcdHVuaW5pdGlhbGl6ZWRQcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHVuaW5pdGlhbGl6ZWRQcm9taXNlID0gbnVsbDtcblx0XHRcdFx0XHRkb1JlcXVlc3QoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNhbmNlbCA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHVuaW5pdGlhbGl6ZWRQcm9taXNlKSB7XG5cdFx0XHRcdFx0dW5pbml0aWFsaXplZFByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHRcdFx0dW5pbml0aWFsaXplZFByb21pc2UgPSBudWxsO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuc2VuZFJlcXVlc3QoeyBpZCwgdHlwZTogUmVxdWVzdFR5cGUuUHJvbWlzZUNhbmNlbCB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGUobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZSA9IGNhbmNlbGxhdGlvblRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKGNhbmNlbCk7XG5cdFx0XHRkaXNwb3NhYmxlV2l0aFJlcXVlc3RDYW5jZWwgPSB7XG5cdFx0XHRcdGRpc3Bvc2U6IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbigoKSA9PiB7XG5cdFx0XHRcdFx0Y2FuY2VsKCk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLmFjdGl2ZVJlcXVlc3RzLmFkZChkaXNwb3NhYmxlV2l0aFJlcXVlc3RDYW5jZWwpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlc3VsdC5maW5hbGx5KCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGU/LmRpc3Bvc2UoKTsgLy8gU2VlbiBhcyB1bmRlZmluZWQgaW4gdGVzdHMuXG5cdFx0XHR0aGlzLmFjdGl2ZVJlcXVlc3RzLmRlbGV0ZShkaXNwb3NhYmxlV2l0aFJlcXVlc3RDYW5jZWwpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZXF1ZXN0RXZlbnQoY2hhbm5lbE5hbWU6IHN0cmluZywgbmFtZTogc3RyaW5nLCBhcmc/OiBhbnkpOiBFdmVudDxhbnk+IHtcblx0XHRjb25zdCBpZCA9IHRoaXMubGFzdFJlcXVlc3RJZCsrO1xuXHRcdGNvbnN0IHR5cGUgPSBSZXF1ZXN0VHlwZS5FdmVudExpc3Rlbjtcblx0XHRjb25zdCByZXF1ZXN0OiBJUmF3UmVxdWVzdCA9IHsgaWQsIHR5cGUsIGNoYW5uZWxOYW1lLCBuYW1lLCBhcmcgfTtcblxuXHRcdGxldCB1bmluaXRpYWxpemVkUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4gfCBudWxsID0gbnVsbDtcblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxhbnk+KHtcblx0XHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlcjogSUhhbmRsZXIgPSAocmVzOiBJUmF3UmVzcG9uc2UpID0+IGVtaXR0ZXIuZmlyZSgocmVzIGFzIElSYXdFdmVudEZpcmVSZXNwb25zZSkuZGF0YSk7XG5cdFx0XHRcdHRoaXMuaGFuZGxlcnMuc2V0KGlkLCBoYW5kbGVyKTtcblx0XHRcdFx0Y29uc3QgZG9SZXF1ZXN0ID0gKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlUmVxdWVzdHMuYWRkKGVtaXR0ZXIpO1xuXHRcdFx0XHRcdHRoaXMuc2VuZFJlcXVlc3QocmVxdWVzdCk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmICh0aGlzLnN0YXRlID09PSBTdGF0ZS5JZGxlKSB7XG5cdFx0XHRcdFx0ZG9SZXF1ZXN0KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dW5pbml0aWFsaXplZFByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShfID0+IHRoaXMud2hlbkluaXRpYWxpemVkKCkpO1xuXHRcdFx0XHRcdHVuaW5pdGlhbGl6ZWRQcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdFx0dW5pbml0aWFsaXplZFByb21pc2UgPSBudWxsO1xuXHRcdFx0XHRcdFx0ZG9SZXF1ZXN0KCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHRpZiAodW5pbml0aWFsaXplZFByb21pc2UpIHtcblx0XHRcdFx0XHR1bmluaXRpYWxpemVkUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdFx0XHR1bmluaXRpYWxpemVkUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVSZXF1ZXN0cy5kZWxldGUoZW1pdHRlcik7XG5cdFx0XHRcdFx0dGhpcy5zZW5kUmVxdWVzdCh7IGlkLCB0eXBlOiBSZXF1ZXN0VHlwZS5FdmVudERpc3Bvc2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5oYW5kbGVycy5kZWxldGUoaWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGVtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHRwcml2YXRlIHNlbmRSZXF1ZXN0KHJlcXVlc3Q6IElSYXdSZXF1ZXN0KTogdm9pZCB7XG5cdFx0c3dpdGNoIChyZXF1ZXN0LnR5cGUpIHtcblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuUHJvbWlzZTpcblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuRXZlbnRMaXN0ZW46IHtcblx0XHRcdFx0Y29uc3QgbXNnTGVuZ3RoID0gdGhpcy5zZW5kKFtyZXF1ZXN0LnR5cGUsIHJlcXVlc3QuaWQsIHJlcXVlc3QuY2hhbm5lbE5hbWUsIHJlcXVlc3QubmFtZV0sIHJlcXVlc3QuYXJnKTtcblx0XHRcdFx0dGhpcy5sb2dnZXI/LmxvZ091dGdvaW5nKG1zZ0xlbmd0aCwgcmVxdWVzdC5pZCwgUmVxdWVzdEluaXRpYXRvci5Mb2NhbFNpZGUsIGAke3JlcXVlc3RUeXBlVG9TdHIocmVxdWVzdC50eXBlKX06ICR7cmVxdWVzdC5jaGFubmVsTmFtZX0uJHtyZXF1ZXN0Lm5hbWV9YCwgcmVxdWVzdC5hcmcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuUHJvbWlzZUNhbmNlbDpcblx0XHRcdGNhc2UgUmVxdWVzdFR5cGUuRXZlbnREaXNwb3NlOiB7XG5cdFx0XHRcdGNvbnN0IG1zZ0xlbmd0aCA9IHRoaXMuc2VuZChbcmVxdWVzdC50eXBlLCByZXF1ZXN0LmlkXSk7XG5cdFx0XHRcdHRoaXMubG9nZ2VyPy5sb2dPdXRnb2luZyhtc2dMZW5ndGgsIHJlcXVlc3QuaWQsIFJlcXVlc3RJbml0aWF0b3IuTG9jYWxTaWRlLCByZXF1ZXN0VHlwZVRvU3RyKHJlcXVlc3QudHlwZSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZW5kKGhlYWRlcjogdW5rbm93biwgYm9keTogYW55ID0gdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0XHRjb25zdCB3cml0ZXIgPSBuZXcgQnVmZmVyV3JpdGVyKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHNlcmlhbGl6ZSh3cml0ZXIsIGhlYWRlcik7XG5cdFx0XHRzZXJpYWxpemUod3JpdGVyLCBib2R5KTtcblx0XHRcdHJldHVybiB0aGlzLnNlbmRCdWZmZXIod3JpdGVyLmJ1ZmZlcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHdyaXRlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZW5kQnVmZmVyKG1lc3NhZ2U6IFZTQnVmZmVyKTogbnVtYmVyIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5wcm90b2NvbC5zZW5kKG1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuIG1lc3NhZ2UuYnl0ZUxlbmd0aDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIG5vb3Bcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25CdWZmZXIobWVzc2FnZTogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHRjb25zdCByZWFkZXIgPSBuZXcgQnVmZmVyUmVhZGVyKG1lc3NhZ2UpO1xuXHRcdGNvbnN0IGhlYWRlciA9IGRlc2VyaWFsaXplKHJlYWRlcik7XG5cdFx0Y29uc3QgYm9keSA9IGRlc2VyaWFsaXplKHJlYWRlcik7XG5cdFx0Y29uc3QgdHlwZTogUmVzcG9uc2VUeXBlID0gaGVhZGVyWzBdO1xuXG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Jbml0aWFsaXplOlxuXHRcdFx0XHR0aGlzLmxvZ2dlcj8ubG9nSW5jb21pbmcobWVzc2FnZS5ieXRlTGVuZ3RoLCAwLCBSZXF1ZXN0SW5pdGlhdG9yLkxvY2FsU2lkZSwgcmVzcG9uc2VUeXBlVG9TdHIodHlwZSkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5vblJlc3BvbnNlKHsgdHlwZTogaGVhZGVyWzBdIH0pO1xuXG5cdFx0XHRjYXNlIFJlc3BvbnNlVHlwZS5Qcm9taXNlU3VjY2Vzczpcblx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvcjpcblx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLkV2ZW50RmlyZTpcblx0XHRcdGNhc2UgUmVzcG9uc2VUeXBlLlByb21pc2VFcnJvck9iajpcblx0XHRcdFx0dGhpcy5sb2dnZXI/LmxvZ0luY29taW5nKG1lc3NhZ2UuYnl0ZUxlbmd0aCwgaGVhZGVyWzFdLCBSZXF1ZXN0SW5pdGlhdG9yLkxvY2FsU2lkZSwgcmVzcG9uc2VUeXBlVG9TdHIodHlwZSksIGJvZHkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5vblJlc3BvbnNlKHsgdHlwZTogaGVhZGVyWzBdLCBpZDogaGVhZGVyWzFdLCBkYXRhOiBib2R5IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25SZXNwb25zZShyZXNwb25zZTogSVJhd1Jlc3BvbnNlKTogdm9pZCB7XG5cdFx0aWYgKHJlc3BvbnNlLnR5cGUgPT09IFJlc3BvbnNlVHlwZS5Jbml0aWFsaXplKSB7XG5cdFx0XHR0aGlzLnN0YXRlID0gU3RhdGUuSWRsZTtcblx0XHRcdHRoaXMuX29uRGlkSW5pdGlhbGl6ZS5maXJlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlciA9IHRoaXMuaGFuZGxlcnMuZ2V0KHJlc3BvbnNlLmlkKTtcblxuXHRcdGhhbmRsZXI/LihyZXNwb25zZSk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25EaWRJbml0aWFsaXplUHJvbWlzZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gRXZlbnQudG9Qcm9taXNlKHRoaXMub25EaWRJbml0aWFsaXplKTtcblx0fVxuXG5cdHByaXZhdGUgd2hlbkluaXRpYWxpemVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnN0YXRlID09PSBTdGF0ZS5JZGxlKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLm9uRGlkSW5pdGlhbGl6ZVByb21pc2U7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdGlmICh0aGlzLnByb3RvY29sTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMucHJvdG9jb2xMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnByb3RvY29sTGlzdGVuZXIgPSBudWxsO1xuXHRcdH1cblx0XHRkaXNwb3NlKHRoaXMuYWN0aXZlUmVxdWVzdHMudmFsdWVzKCkpO1xuXHRcdHRoaXMuYWN0aXZlUmVxdWVzdHMuY2xlYXIoKTtcblx0XHR0aGlzLl9vbkRpZEluaXRpYWxpemUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2xpZW50Q29ubmVjdGlvbkV2ZW50IHtcblx0cHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sO1xuXHRyZWFkb25seSBvbkRpZENsaWVudERpc2Nvbm5lY3Q6IEV2ZW50PHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgQ29ubmVjdGlvbjxUQ29udGV4dD4gZXh0ZW5kcyBDbGllbnQ8VENvbnRleHQ+IHtcblx0cmVhZG9ubHkgY2hhbm5lbFNlcnZlcjogQ2hhbm5lbFNlcnZlcjxUQ29udGV4dD47XG5cdHJlYWRvbmx5IGNoYW5uZWxDbGllbnQ6IENoYW5uZWxDbGllbnQ7XG59XG5cbi8qKlxuICogQW4gYElQQ1NlcnZlcmAgaXMgYm90aCBhIGNoYW5uZWwgc2VydmVyIGFuZCBhIHJvdXRpbmcgY2hhbm5lbFxuICogY2xpZW50LlxuICpcbiAqIEFzIHRoZSBvd25lciBvZiBhIHByb3RvY29sLCB5b3Ugc2hvdWxkIGV4dGVuZCBib3RoIHRoaXNcbiAqIGFuZCB0aGUgYElQQ0NsaWVudGAgY2xhc3NlcyB0byBnZXQgSVBDIGltcGxlbWVudGF0aW9uc1xuICogZm9yIHlvdXIgcHJvdG9jb2wuXG4gKi9cbmV4cG9ydCBjbGFzcyBJUENTZXJ2ZXI8VENvbnRleHQgPSBzdHJpbmc+IGltcGxlbWVudHMgSUNoYW5uZWxTZXJ2ZXI8VENvbnRleHQ+LCBJUm91dGluZ0NoYW5uZWxDbGllbnQ8VENvbnRleHQ+LCBJQ29ubmVjdGlvbkh1YjxUQ29udGV4dD4sIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGNoYW5uZWxzID0gbmV3IE1hcDxzdHJpbmcsIElTZXJ2ZXJDaGFubmVsPFRDb250ZXh0Pj4oKTtcblx0cHJpdmF0ZSBfY29ubmVjdGlvbnMgPSBuZXcgU2V0PENvbm5lY3Rpb248VENvbnRleHQ+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWRkQ29ubmVjdGlvbiA9IG5ldyBFbWl0dGVyPENvbm5lY3Rpb248VENvbnRleHQ+PigpO1xuXHRyZWFkb25seSBvbkRpZEFkZENvbm5lY3Rpb246IEV2ZW50PENvbm5lY3Rpb248VENvbnRleHQ+PiA9IHRoaXMuX29uRGlkQWRkQ29ubmVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlbW92ZUNvbm5lY3Rpb24gPSBuZXcgRW1pdHRlcjxDb25uZWN0aW9uPFRDb250ZXh0Pj4oKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVDb25uZWN0aW9uOiBFdmVudDxDb25uZWN0aW9uPFRDb250ZXh0Pj4gPSB0aGlzLl9vbkRpZFJlbW92ZUNvbm5lY3Rpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRnZXQgY29ubmVjdGlvbnMoKTogQ29ubmVjdGlvbjxUQ29udGV4dD5bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBDb25uZWN0aW9uPFRDb250ZXh0PltdID0gW107XG5cdFx0dGhpcy5fY29ubmVjdGlvbnMuZm9yRWFjaChjdHggPT4gcmVzdWx0LnB1c2goY3R4KSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKG9uRGlkQ2xpZW50Q29ubmVjdDogRXZlbnQ8Q2xpZW50Q29ubmVjdGlvbkV2ZW50PiwgaXBjTG9nZ2VyPzogSUlQQ0xvZ2dlciB8IG51bGwsIHRpbWVvdXREZWxheT86IG51bWJlcikge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG9uRGlkQ2xpZW50Q29ubmVjdCgoeyBwcm90b2NvbCwgb25EaWRDbGllbnREaXNjb25uZWN0IH0pID0+IHtcblx0XHRcdGNvbnN0IG9uRmlyc3RNZXNzYWdlID0gRXZlbnQub25jZShwcm90b2NvbC5vbk1lc3NhZ2UpO1xuXG5cdFx0XHRjb25zdCBjb25uZWN0aW9uRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGNvbnN0IG9uRmlyc3RNZXNzYWdlRGlzcG9zYWJsZSA9IG9uRmlyc3RNZXNzYWdlKG1zZyA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBCdWZmZXJSZWFkZXIobXNnKTtcblx0XHRcdFx0Y29uc3QgY3R4ID0gZGVzZXJpYWxpemUocmVhZGVyKSBhcyBUQ29udGV4dDtcblxuXHRcdFx0XHRjb25zdCBjaGFubmVsU2VydmVyID0gbmV3IENoYW5uZWxTZXJ2ZXIocHJvdG9jb2wsIGN0eCwgaXBjTG9nZ2VyLCB0aW1lb3V0RGVsYXkpO1xuXHRcdFx0XHRjb25zdCBjaGFubmVsQ2xpZW50ID0gbmV3IENoYW5uZWxDbGllbnQocHJvdG9jb2wsIGlwY0xvZ2dlcik7XG5cblx0XHRcdFx0dGhpcy5jaGFubmVscy5mb3JFYWNoKChjaGFubmVsLCBuYW1lKSA9PiBjaGFubmVsU2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChuYW1lLCBjaGFubmVsKSk7XG5cblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbjogQ29ubmVjdGlvbjxUQ29udGV4dD4gPSB7IGNoYW5uZWxTZXJ2ZXIsIGNoYW5uZWxDbGllbnQsIGN0eCB9O1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5hZGQoY29ubmVjdGlvbik7XG5cdFx0XHRcdHRoaXMuX29uRGlkQWRkQ29ubmVjdGlvbi5maXJlKGNvbm5lY3Rpb24pO1xuXG5cdFx0XHRcdGNvbm5lY3Rpb25EaXNwb3NhYmxlcy5hZGQob25EaWRDbGllbnREaXNjb25uZWN0KCgpID0+IHtcblx0XHRcdFx0XHRjaGFubmVsU2VydmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRjaGFubmVsQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGUoY29ubmVjdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZW1vdmVDb25uZWN0aW9uLmZpcmUoY29ubmVjdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5kZWxldGUoY29ubmVjdGlvbkRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRjb25uZWN0aW9uRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29ubmVjdGlvbkRpc3Bvc2FibGVzLmFkZChvbkZpcnN0TWVzc2FnZURpc3Bvc2FibGUpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY29ubmVjdGlvbkRpc3Bvc2FibGVzKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGEgY2hhbm5lbCBmcm9tIGEgcmVtb3RlIGNsaWVudC4gV2hlbiBwYXNzZWQgYSByb3V0ZXIsXG5cdCAqIG9uZSBjYW4gc3BlY2lmeSB3aGljaCBjbGllbnQgaXQgd2FudHMgdG8gY2FsbCBhbmQgbGlzdGVuIHRvL2Zyb20uXG5cdCAqIE90aGVyd2lzZSwgd2hlbiBjYWxsaW5nIHdpdGhvdXQgYSByb3V0ZXIsIGEgcmFuZG9tIGNsaWVudCB3aWxsXG5cdCAqIGJlIHNlbGVjdGVkIGFuZCB3aGVuIGxpc3RlbmluZyB3aXRob3V0IGEgcm91dGVyLCBldmVyeSBjbGllbnRcblx0ICogd2lsbCBiZSBsaXN0ZW5lZCB0by5cblx0ICovXG5cdGdldENoYW5uZWw8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsTmFtZTogc3RyaW5nLCByb3V0ZXI6IElDbGllbnRSb3V0ZXI8VENvbnRleHQ+KTogVDtcblx0Z2V0Q2hhbm5lbDxUIGV4dGVuZHMgSUNoYW5uZWw+KGNoYW5uZWxOYW1lOiBzdHJpbmcsIGNsaWVudEZpbHRlcjogKGNsaWVudDogQ2xpZW50PFRDb250ZXh0PikgPT4gYm9vbGVhbik6IFQ7XG5cdGdldENoYW5uZWw8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsTmFtZTogc3RyaW5nLCByb3V0ZXJPckNsaWVudEZpbHRlcjogSUNsaWVudFJvdXRlcjxUQ29udGV4dD4gfCAoKGNsaWVudDogQ2xpZW50PFRDb250ZXh0PikgPT4gYm9vbGVhbikpOiBUIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2FsbChjb21tYW5kOiBzdHJpbmcsIGFyZz86IGFueSwgY2FuY2VsbGF0aW9uVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VD4ge1xuXHRcdFx0XHRsZXQgY29ubmVjdGlvblByb21pc2U6IFByb21pc2U8Q2xpZW50PFRDb250ZXh0Pj47XG5cblx0XHRcdFx0aWYgKGlzRnVuY3Rpb24ocm91dGVyT3JDbGllbnRGaWx0ZXIpKSB7XG5cdFx0XHRcdFx0Ly8gd2hlbiBubyByb3V0ZXIgaXMgcHJvdmlkZWQsIHdlIGdvIHJhbmRvbSBjbGllbnQgcGlja2luZ1xuXHRcdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBnZXRSYW5kb21FbGVtZW50KHRoYXQuY29ubmVjdGlvbnMuZmlsdGVyKHJvdXRlck9yQ2xpZW50RmlsdGVyKSk7XG5cblx0XHRcdFx0XHRjb25uZWN0aW9uUHJvbWlzZSA9IGNvbm5lY3Rpb25cblx0XHRcdFx0XHRcdC8vIGlmIHdlIGZvdW5kIGEgY2xpZW50LCBsZXQncyBjYWxsIG9uIGl0XG5cdFx0XHRcdFx0XHQ/IFByb21pc2UucmVzb2x2ZShjb25uZWN0aW9uKVxuXHRcdFx0XHRcdFx0Ly8gZWxzZSwgbGV0J3Mgd2FpdCBmb3IgYSBjbGllbnQgdG8gY29tZSBhbG9uZ1xuXHRcdFx0XHRcdFx0OiBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHRoYXQub25EaWRBZGRDb25uZWN0aW9uLCByb3V0ZXJPckNsaWVudEZpbHRlcikpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbm5lY3Rpb25Qcm9taXNlID0gcm91dGVyT3JDbGllbnRGaWx0ZXIucm91dGVDYWxsKHRoYXQsIGNvbW1hbmQsIGFyZyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjaGFubmVsUHJvbWlzZSA9IGNvbm5lY3Rpb25Qcm9taXNlXG5cdFx0XHRcdFx0LnRoZW4oY29ubmVjdGlvbiA9PiAoY29ubmVjdGlvbiBhcyBDb25uZWN0aW9uPFRDb250ZXh0PikuY2hhbm5lbENsaWVudC5nZXRDaGFubmVsKGNoYW5uZWxOYW1lKSk7XG5cblx0XHRcdFx0cmV0dXJuIGdldERlbGF5ZWRDaGFubmVsKGNoYW5uZWxQcm9taXNlKVxuXHRcdFx0XHRcdC5jYWxsKGNvbW1hbmQsIGFyZywgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdGxpc3RlbihldmVudDogc3RyaW5nLCBhcmc6IGFueSk6IEV2ZW50PFQ+IHtcblx0XHRcdFx0aWYgKGlzRnVuY3Rpb24ocm91dGVyT3JDbGllbnRGaWx0ZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoYXQuZ2V0TXVsdGljYXN0RXZlbnQoY2hhbm5lbE5hbWUsIHJvdXRlck9yQ2xpZW50RmlsdGVyLCBldmVudCwgYXJnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNoYW5uZWxQcm9taXNlID0gcm91dGVyT3JDbGllbnRGaWx0ZXIucm91dGVFdmVudCh0aGF0LCBldmVudCwgYXJnKVxuXHRcdFx0XHRcdC50aGVuKGNvbm5lY3Rpb24gPT4gKGNvbm5lY3Rpb24gYXMgQ29ubmVjdGlvbjxUQ29udGV4dD4pLmNoYW5uZWxDbGllbnQuZ2V0Q2hhbm5lbChjaGFubmVsTmFtZSkpO1xuXG5cdFx0XHRcdHJldHVybiBnZXREZWxheWVkQ2hhbm5lbChjaGFubmVsUHJvbWlzZSlcblx0XHRcdFx0XHQubGlzdGVuKGV2ZW50LCBhcmcpO1xuXHRcdFx0fVxuXHRcdH0gYXMgVDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TXVsdGljYXN0RXZlbnQ8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsTmFtZTogc3RyaW5nLCBjbGllbnRGaWx0ZXI6IChjbGllbnQ6IENsaWVudDxUQ29udGV4dD4pID0+IGJvb2xlYW4sIGV2ZW50TmFtZTogc3RyaW5nLCBhcmc6IGFueSk6IEV2ZW50PFQ+IHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIENyZWF0ZSBhbiBlbWl0dGVyIHdoaWNoIGhvb2tzIHVwIHRvIGFsbCBjbGllbnRzXG5cdFx0Ly8gYXMgc29vbiBhcyBmaXJzdCBsaXN0ZW5lciBpcyBhZGRlZC4gSXQgYWxzb1xuXHRcdC8vIGRpc2Nvbm5lY3RzIGZyb20gYWxsIGNsaWVudHMgYXMgc29vbiBhcyB0aGUgbGFzdCBsaXN0ZW5lclxuXHRcdC8vIGlzIHJlbW92ZWQuXG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPFQ+KHtcblx0XHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdFx0Ly8gVGhlIGV2ZW50IG11bHRpcGxleGVyIGlzIHVzZWZ1bCBzaW5jZSB0aGUgYWN0aXZlXG5cdFx0XHRcdC8vIGNsaWVudCBsaXN0IGlzIGR5bmFtaWMuIFdlIG5lZWQgdG8gaG9vayB1cCBhbmQgZGlzY29ubmVjdGlvblxuXHRcdFx0XHQvLyB0by9mcm9tIGNsaWVudHMgYXMgdGhleSBjb21lIGFuZCBnby5cblx0XHRcdFx0Y29uc3QgZXZlbnRNdWx0aXBsZXhlciA9IG5ldyBFdmVudE11bHRpcGxleGVyPFQ+KCk7XG5cdFx0XHRcdGNvbnN0IG1hcCA9IG5ldyBNYXA8Q29ubmVjdGlvbjxUQ29udGV4dD4sIElEaXNwb3NhYmxlPigpO1xuXG5cdFx0XHRcdGNvbnN0IG9uRGlkQWRkQ29ubmVjdGlvbiA9IChjb25uZWN0aW9uOiBDb25uZWN0aW9uPFRDb250ZXh0PikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5uZWwgPSBjb25uZWN0aW9uLmNoYW5uZWxDbGllbnQuZ2V0Q2hhbm5lbChjaGFubmVsTmFtZSk7XG5cdFx0XHRcdFx0Y29uc3QgZXZlbnQgPSBjaGFubmVsLmxpc3RlbjxUPihldmVudE5hbWUsIGFyZyk7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGV2ZW50TXVsdGlwbGV4ZXIuYWRkKGV2ZW50KTtcblxuXHRcdFx0XHRcdG1hcC5zZXQoY29ubmVjdGlvbiwgZGlzcG9zYWJsZSk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3Qgb25EaWRSZW1vdmVDb25uZWN0aW9uID0gKGNvbm5lY3Rpb246IENvbm5lY3Rpb248VENvbnRleHQ+KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG1hcC5nZXQoY29ubmVjdGlvbik7XG5cblx0XHRcdFx0XHRpZiAoIWRpc3Bvc2FibGUpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRtYXAuZGVsZXRlKGNvbm5lY3Rpb24pO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoYXQuY29ubmVjdGlvbnMuZmlsdGVyKGNsaWVudEZpbHRlcikuZm9yRWFjaChvbkRpZEFkZENvbm5lY3Rpb24pO1xuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhhdC5vbkRpZEFkZENvbm5lY3Rpb24sIGNsaWVudEZpbHRlcikob25EaWRBZGRDb25uZWN0aW9uLCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0dGhhdC5vbkRpZFJlbW92ZUNvbm5lY3Rpb24ob25EaWRSZW1vdmVDb25uZWN0aW9uLCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0ZXZlbnRNdWx0aXBsZXhlci5ldmVudChlbWl0dGVyLmZpcmUsIGVtaXR0ZXIsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXZlbnRNdWx0aXBsZXhlcik7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXM/LmRpc3Bvc2UoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhhdC5kaXNwb3NhYmxlcy5hZGQoZW1pdHRlcik7XG5cblx0XHRyZXR1cm4gZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhbm5lbChjaGFubmVsTmFtZTogc3RyaW5nLCBjaGFubmVsOiBJU2VydmVyQ2hhbm5lbDxUQ29udGV4dD4pOiB2b2lkIHtcblx0XHR0aGlzLmNoYW5uZWxzLnNldChjaGFubmVsTmFtZSwgY2hhbm5lbCk7XG5cblx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgdGhpcy5fY29ubmVjdGlvbnMpIHtcblx0XHRcdGNvbm5lY3Rpb24uY2hhbm5lbFNlcnZlci5yZWdpc3RlckNoYW5uZWwoY2hhbm5lbE5hbWUsIGNoYW5uZWwpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgdGhpcy5fY29ubmVjdGlvbnMpIHtcblx0XHRcdGNvbm5lY3Rpb24uY2hhbm5lbENsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRjb25uZWN0aW9uLmNoYW5uZWxTZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5jaGFubmVscy5jbGVhcigpO1xuXHRcdHRoaXMuX29uRGlkQWRkQ29ubmVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZW1vdmVDb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIEFuIGBJUENDbGllbnRgIGlzIGJvdGggYSBjaGFubmVsIGNsaWVudCBhbmQgYSBjaGFubmVsIHNlcnZlci5cbiAqXG4gKiBBcyB0aGUgb3duZXIgb2YgYSBwcm90b2NvbCwgeW91IHNob3VsZCBleHRlbmQgYm90aCB0aGlzXG4gKiBhbmQgdGhlIGBJUENTZXJ2ZXJgIGNsYXNzZXMgdG8gZ2V0IElQQyBpbXBsZW1lbnRhdGlvbnNcbiAqIGZvciB5b3VyIHByb3RvY29sLlxuICovXG5leHBvcnQgY2xhc3MgSVBDQ2xpZW50PFRDb250ZXh0ID0gc3RyaW5nPiBpbXBsZW1lbnRzIElDaGFubmVsQ2xpZW50LCBJQ2hhbm5lbFNlcnZlcjxUQ29udGV4dD4sIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGNoYW5uZWxDbGllbnQ6IENoYW5uZWxDbGllbnQ7XG5cdHByaXZhdGUgY2hhbm5lbFNlcnZlcjogQ2hhbm5lbFNlcnZlcjxUQ29udGV4dD47XG5cblx0Y29uc3RydWN0b3IocHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sLCBjdHg6IFRDb250ZXh0LCBpcGNMb2dnZXI6IElJUENMb2dnZXIgfCBudWxsID0gbnVsbCkge1xuXHRcdGNvbnN0IHdyaXRlciA9IG5ldyBCdWZmZXJXcml0ZXIoKTtcblx0XHR0cnkge1xuXHRcdFx0c2VyaWFsaXplKHdyaXRlciwgY3R4KTtcblx0XHRcdHByb3RvY29sLnNlbmQod3JpdGVyLmJ1ZmZlcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHdyaXRlci5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jaGFubmVsQ2xpZW50ID0gbmV3IENoYW5uZWxDbGllbnQocHJvdG9jb2wsIGlwY0xvZ2dlcik7XG5cdFx0dGhpcy5jaGFubmVsU2VydmVyID0gbmV3IENoYW5uZWxTZXJ2ZXIocHJvdG9jb2wsIGN0eCwgaXBjTG9nZ2VyKTtcblx0fVxuXG5cdGdldENoYW5uZWw8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsTmFtZTogc3RyaW5nKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbm5lbENsaWVudC5nZXRDaGFubmVsKGNoYW5uZWxOYW1lKTtcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhbm5lbChjaGFubmVsTmFtZTogc3RyaW5nLCBjaGFubmVsOiBJU2VydmVyQ2hhbm5lbDxUQ29udGV4dD4pOiB2b2lkIHtcblx0XHR0aGlzLmNoYW5uZWxTZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKGNoYW5uZWxOYW1lLCBjaGFubmVsKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGFubmVsQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNoYW5uZWxTZXJ2ZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWxheWVkQ2hhbm5lbDxUIGV4dGVuZHMgSUNoYW5uZWw+KHByb21pc2U6IFByb21pc2U8VD4pOiBUIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRyZXR1cm4ge1xuXHRcdGNhbGwoY29tbWFuZDogc3RyaW5nLCBhcmc/OiBhbnksIGNhbmNlbGxhdGlvblRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+IHtcblx0XHRcdHJldHVybiBwcm9taXNlLnRoZW4oYyA9PiBjLmNhbGw8VD4oY29tbWFuZCwgYXJnLCBjYW5jZWxsYXRpb25Ub2tlbikpO1xuXHRcdH0sXG5cblx0XHRsaXN0ZW48VD4oZXZlbnQ6IHN0cmluZywgYXJnPzogYW55KTogRXZlbnQ8VD4ge1xuXHRcdFx0Y29uc3QgcmVsYXkgPSBuZXcgUmVsYXk8YW55PigpO1xuXHRcdFx0cHJvbWlzZS50aGVuKGMgPT4gcmVsYXkuaW5wdXQgPSBjLmxpc3RlbihldmVudCwgYXJnKSk7XG5cdFx0XHRyZXR1cm4gcmVsYXkuZXZlbnQ7XG5cdFx0fVxuXHR9IGFzIFQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXROZXh0VGlja0NoYW5uZWw8VCBleHRlbmRzIElDaGFubmVsPihjaGFubmVsOiBUKTogVCB7XG5cdGxldCBkaWRUaWNrID0gZmFsc2U7XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRyZXR1cm4ge1xuXHRcdGNhbGw8VD4oY29tbWFuZDogc3RyaW5nLCBhcmc/OiBhbnksIGNhbmNlbGxhdGlvblRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFQ+IHtcblx0XHRcdGlmIChkaWRUaWNrKSB7XG5cdFx0XHRcdHJldHVybiBjaGFubmVsLmNhbGwoY29tbWFuZCwgYXJnLCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aW1lb3V0KDApXG5cdFx0XHRcdC50aGVuKCgpID0+IGRpZFRpY2sgPSB0cnVlKVxuXHRcdFx0XHQudGhlbigoKSA9PiBjaGFubmVsLmNhbGw8VD4oY29tbWFuZCwgYXJnLCBjYW5jZWxsYXRpb25Ub2tlbikpO1xuXHRcdH0sXG5cdFx0bGlzdGVuPFQ+KGV2ZW50OiBzdHJpbmcsIGFyZz86IGFueSk6IEV2ZW50PFQ+IHtcblx0XHRcdGlmIChkaWRUaWNrKSB7XG5cdFx0XHRcdHJldHVybiBjaGFubmVsLmxpc3RlbjxUPihldmVudCwgYXJnKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVsYXkgPSBuZXcgUmVsYXk8VD4oKTtcblxuXHRcdFx0dGltZW91dCgwKVxuXHRcdFx0XHQudGhlbigoKSA9PiBkaWRUaWNrID0gdHJ1ZSlcblx0XHRcdFx0LnRoZW4oKCkgPT4gcmVsYXkuaW5wdXQgPSBjaGFubmVsLmxpc3RlbjxUPihldmVudCwgYXJnKSk7XG5cblx0XHRcdHJldHVybiByZWxheS5ldmVudDtcblx0XHR9XG5cdH0gYXMgVDtcbn1cblxuZXhwb3J0IGNsYXNzIFN0YXRpY1JvdXRlcjxUQ29udGV4dCA9IHN0cmluZz4gaW1wbGVtZW50cyBJQ2xpZW50Um91dGVyPFRDb250ZXh0PiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBmbjogKGN0eDogVENvbnRleHQpID0+IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+KSB7IH1cblxuXHRyb3V0ZUNhbGwoaHViOiBJQ29ubmVjdGlvbkh1YjxUQ29udGV4dD4pOiBQcm9taXNlPENsaWVudDxUQ29udGV4dD4+IHtcblx0XHRyZXR1cm4gdGhpcy5yb3V0ZShodWIpO1xuXHR9XG5cblx0cm91dGVFdmVudChodWI6IElDb25uZWN0aW9uSHViPFRDb250ZXh0Pik6IFByb21pc2U8Q2xpZW50PFRDb250ZXh0Pj4ge1xuXHRcdHJldHVybiB0aGlzLnJvdXRlKGh1Yik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJvdXRlKGh1YjogSUNvbm5lY3Rpb25IdWI8VENvbnRleHQ+KTogUHJvbWlzZTxDbGllbnQ8VENvbnRleHQ+PiB7XG5cdFx0Zm9yIChjb25zdCBjb25uZWN0aW9uIG9mIGh1Yi5jb25uZWN0aW9ucykge1xuXHRcdFx0aWYgKGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLmZuKGNvbm5lY3Rpb24uY3R4KSkpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShjb25uZWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoaHViLm9uRGlkQWRkQ29ubmVjdGlvbik7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMucm91dGUoaHViKTtcblx0fVxufVxuXG4vKipcbiAqIFVzZSBQcm94eUNoYW5uZWxzIHRvIGF1dG9tYXRpY2FsbHkgd3JhcHBpbmcgYW5kIHVud3JhcHBpbmdcbiAqIHNlcnZpY2VzIHRvL2Zyb20gSVBDIGNoYW5uZWxzLCBpbnN0ZWFkIG9mIG1hbnVhbGx5IHdyYXBwaW5nXG4gKiBlYWNoIHNlcnZpY2UgbWV0aG9kIGFuZCBldmVudC5cbiAqXG4gKiBSZXN0cmljdGlvbnM6XG4gKiAtIElmIG1hcnNoYWxsaW5nIGlzIGVuYWJsZWQsIG9ubHkgYFVSSWAgYW5kIGBSZWdFeHBgIGlzIGNvbnZlcnRlZFxuICogICBhdXRvbWF0aWNhbGx5IGZvciB5b3VcbiAqIC0gRXZlbnRzIG11c3QgZm9sbG93IHRoZSBuYW1pbmcgY29udmVudGlvbiBgb25VcHBlckNhc2VgXG4gKiAtIGBDYW5jZWxsYXRpb25Ub2tlbmAgaXMgY3VycmVudGx5IG5vdCBzdXBwb3J0ZWRcbiAqIC0gSWYgYSBjb250ZXh0IGlzIHByb3ZpZGVkLCB5b3UgY2FuIHVzZSBgQWRkRmlyc3RQYXJhbWV0ZXJUb0Z1bmN0aW9uc2BcbiAqICAgdXRpbGl0eSB0byBzaWduYWwgdGhpcyBpbiB0aGUgcmVjZWl2aW5nIHNpZGUgdHlwZVxuICovXG5leHBvcnQgbmFtZXNwYWNlIFByb3h5Q2hhbm5lbCB7XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJUHJveHlPcHRpb25zIHtcblxuXHRcdC8qKlxuXHRcdCAqIERpc2FibGVzIGF1dG9tYXRpYyBtYXJzaGFsbGluZyBvZiBgVVJJYC5cblx0XHQgKiBJZiBtYXJzaGFsbGluZyBpcyBkaXNhYmxlZCwgYFVyaUNvbXBvbmVudHNgXG5cdFx0ICogbXVzdCBiZSB1c2VkIGluc3RlYWQuXG5cdFx0ICovXG5cdFx0ZGlzYWJsZU1hcnNoYWxsaW5nPzogYm9vbGVhbjtcblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSUNyZWF0ZVNlcnZpY2VDaGFubmVsT3B0aW9ucyBleHRlbmRzIElQcm94eU9wdGlvbnMge1xuXG5cdFx0LyoqXG5cdFx0ICogRXZlbnRzIHRoYXQgc2hvdWxkIHN1YnNjcmliZSBsYXppbHkgYW5kIG5vdCByZXBsYXkgZW1pc3Npb25zIGJlZm9yZSB0aGUgZmlyc3QgSVBDIGxpc3RlbmVyLlxuXHRcdCAqL1xuXHRcdHVuYnVmZmVyZWRFdmVudHM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU2VydmljZTxUQ29udGV4dD4oc2VydmljZTogdW5rbm93biwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgb3B0aW9ucz86IElDcmVhdGVTZXJ2aWNlQ2hhbm5lbE9wdGlvbnMpOiBJU2VydmVyQ2hhbm5lbDxUQ29udGV4dD4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBzZXJ2aWNlIGFzIHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9O1xuXHRcdGNvbnN0IGRpc2FibGVNYXJzaGFsbGluZyA9IG9wdGlvbnM/LmRpc2FibGVNYXJzaGFsbGluZztcblx0XHRjb25zdCB1bmJ1ZmZlcmVkRXZlbnRzID0gb3B0aW9ucz8udW5idWZmZXJlZEV2ZW50cyA/IG5ldyBTZXQob3B0aW9ucy51bmJ1ZmZlcmVkRXZlbnRzKSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIEJ1ZmZlciBhbnkgZXZlbnQgdGhhdCBzaG91bGQgYmUgc3VwcG9ydGVkIGJ5XG5cdFx0Ly8gaXRlcmF0aW5nIG92ZXIgYWxsIHByb3BlcnR5IGtleXMgYW5kIGZpbmRpbmcgdGhlbVxuXHRcdC8vIEhvd2V2ZXIsIHRoaXMgd2lsbCBub3Qgd29yayBmb3Igc2VydmljZXMgdGhhdFxuXHRcdC8vIGFyZSBsYXp5IGFuZCB1c2UgYSBQcm94eSB3aXRoaW4uIEZvciB0aGF0IHdlXG5cdFx0Ly8gc3RpbGwgbmVlZCB0byBjaGVjayBsYXRlciAoc2VlIGJlbG93KS5cblx0XHRjb25zdCBtYXBFdmVudE5hbWVUb0V2ZW50ID0gbmV3IE1hcDxzdHJpbmcsIEV2ZW50PHVua25vd24+PigpO1xuXHRcdGZvciAoY29uc3Qga2V5IGluIGhhbmRsZXIpIHtcblx0XHRcdGlmIChwcm9wZXJ0eUlzRXZlbnQoa2V5KSAmJiAhdW5idWZmZXJlZEV2ZW50cz8uaGFzKGtleSkpIHtcblx0XHRcdFx0bWFwRXZlbnROYW1lVG9FdmVudC5zZXQoa2V5LCBFdmVudC5idWZmZXIoaGFuZGxlcltrZXldIGFzIEV2ZW50PHVua25vd24+LCBrZXksIHRydWUsIHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IGNsYXNzIGltcGxlbWVudHMgSVNlcnZlckNoYW5uZWwge1xuXG5cdFx0XHRsaXN0ZW48VD4oXzogdW5rbm93biwgZXZlbnQ6IHN0cmluZywgYXJnOiBhbnkpOiBFdmVudDxUPiB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50SW1wbCA9IG1hcEV2ZW50TmFtZVRvRXZlbnQuZ2V0KGV2ZW50KTtcblx0XHRcdFx0aWYgKGV2ZW50SW1wbCkge1xuXHRcdFx0XHRcdHJldHVybiBldmVudEltcGwgYXMgRXZlbnQ8VD47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBoYW5kbGVyW2V2ZW50XTtcblx0XHRcdFx0aWYgKHR5cGVvZiB0YXJnZXQgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHRpZiAocHJvcGVydHlJc0R5bmFtaWNFdmVudChldmVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0YXJnZXQuY2FsbChoYW5kbGVyLCBhcmcpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChwcm9wZXJ0eUlzRXZlbnQoZXZlbnQpKSB7XG5cdFx0XHRcdFx0XHRpZiAodW5idWZmZXJlZEV2ZW50cz8uaGFzKGV2ZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gaGFuZGxlcltldmVudF0gYXMgRXZlbnQ8VD47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdG1hcEV2ZW50TmFtZVRvRXZlbnQuc2V0KGV2ZW50LCBFdmVudC5idWZmZXIoaGFuZGxlcltldmVudF0gYXMgRXZlbnQ8dW5rbm93bj4sIGV2ZW50LCB0cnVlLCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cblx0XHRcdFx0XHRcdHJldHVybiBtYXBFdmVudE5hbWVUb0V2ZW50LmdldChldmVudCkgYXMgRXZlbnQ8VD47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoYEV2ZW50IG5vdCBmb3VuZDogJHtldmVudH1gKTtcblx0XHRcdH1cblxuXHRcdFx0Y2FsbChfOiB1bmtub3duLCBjb21tYW5kOiBzdHJpbmcsIGFyZ3M/OiBhbnlbXSk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGhhbmRsZXJbY29tbWFuZF07XG5cdFx0XHRcdGlmICh0eXBlb2YgdGFyZ2V0ID09PSAnZnVuY3Rpb24nKSB7XG5cblx0XHRcdFx0XHQvLyBSZXZpdmUgdW5sZXNzIG1hcnNoYWxsaW5nIGRpc2FibGVkXG5cdFx0XHRcdFx0aWYgKCFkaXNhYmxlTWFyc2hhbGxpbmcgJiYgQXJyYXkuaXNBcnJheShhcmdzKSkge1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGFyZ3NbaV0gPSByZXZpdmUoYXJnc1tpXSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IHJlcyA9IHRhcmdldC5hcHBseShoYW5kbGVyLCBhcmdzKTtcblx0XHRcdFx0XHRpZiAoIShyZXMgaW5zdGFuY2VvZiBQcm9taXNlKSkge1xuXHRcdFx0XHRcdFx0cmVzID0gUHJvbWlzZS5yZXNvbHZlKHJlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiByZXM7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3JOb1RlbGVtZXRyeShgTWV0aG9kIG5vdCBmb3VuZDogJHtjb21tYW5kfWApO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIElDcmVhdGVQcm94eVNlcnZpY2VPcHRpb25zIGV4dGVuZHMgSVByb3h5T3B0aW9ucyB7XG5cblx0XHQvKipcblx0XHQgKiBJZiBwcm92aWRlZCwgd2lsbCBhZGQgdGhlIHZhbHVlIG9mIGBjb250ZXh0YFxuXHRcdCAqIHRvIGVhY2ggbWV0aG9kIGNhbGwgdG8gdGhlIHRhcmdldC5cblx0XHQgKi9cblx0XHRjb250ZXh0PzogdW5rbm93bjtcblxuXHRcdC8qKlxuXHRcdCAqIElmIHByb3ZpZGVkLCB3aWxsIG5vdCBwcm94eSBhbnkgb2YgdGhlIHByb3BlcnRpZXNcblx0XHQgKiB0aGF0IGFyZSBwYXJ0IG9mIHRoZSBNYXAgYnV0IHJhdGhlciByZXR1cm4gdGhhdCB2YWx1ZS5cblx0XHQgKi9cblx0XHRwcm9wZXJ0aWVzPzogTWFwPHN0cmluZywgdW5rbm93bj47XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG9TZXJ2aWNlPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IElDaGFubmVsLCBvcHRpb25zPzogSUNyZWF0ZVByb3h5U2VydmljZU9wdGlvbnMpOiBUIHtcblx0XHRjb25zdCBkaXNhYmxlTWFyc2hhbGxpbmcgPSBvcHRpb25zPy5kaXNhYmxlTWFyc2hhbGxpbmc7XG5cblx0XHRyZXR1cm4gbmV3IFByb3h5KHt9LCB7XG5cdFx0XHRnZXQoX3RhcmdldDogVCwgcHJvcEtleTogUHJvcGVydHlLZXkpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBwcm9wS2V5ID09PSAnc3RyaW5nJykge1xuXG5cdFx0XHRcdFx0Ly8gQ2hlY2sgZm9yIHByZWRlZmluZWQgdmFsdWVzXG5cdFx0XHRcdFx0aWYgKG9wdGlvbnM/LnByb3BlcnRpZXM/Lmhhcyhwcm9wS2V5KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG9wdGlvbnMucHJvcGVydGllcy5nZXQocHJvcEtleSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRHluYW1pYyBFdmVudFxuXHRcdFx0XHRcdGlmIChwcm9wZXJ0eUlzRHluYW1pY0V2ZW50KHByb3BLZXkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZnVuY3Rpb24gKGFyZzogdW5rbm93bikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY2hhbm5lbC5saXN0ZW4ocHJvcEtleSwgYXJnKTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRXZlbnRcblx0XHRcdFx0XHRpZiAocHJvcGVydHlJc0V2ZW50KHByb3BLZXkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY2hhbm5lbC5saXN0ZW4ocHJvcEtleSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRnVuY3Rpb25cblx0XHRcdFx0XHRyZXR1cm4gYXN5bmMgZnVuY3Rpb24gKC4uLmFyZ3M6IHVua25vd25bXSkge1xuXG5cdFx0XHRcdFx0XHQvLyBBZGQgY29udGV4dCBpZiBhbnlcblx0XHRcdFx0XHRcdGxldCBtZXRob2RBcmdzOiB1bmtub3duW107XG5cdFx0XHRcdFx0XHRpZiAob3B0aW9ucyAmJiAhaXNVbmRlZmluZWRPck51bGwob3B0aW9ucy5jb250ZXh0KSkge1xuXHRcdFx0XHRcdFx0XHRtZXRob2RBcmdzID0gW29wdGlvbnMuY29udGV4dCwgLi4uYXJnc107XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtZXRob2RBcmdzID0gYXJncztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2hhbm5lbC5jYWxsKHByb3BLZXksIG1ldGhvZEFyZ3MpO1xuXG5cdFx0XHRcdFx0XHQvLyBSZXZpdmUgdW5sZXNzIG1hcnNoYWxsaW5nIGRpc2FibGVkXG5cdFx0XHRcdFx0XHRpZiAoIWRpc2FibGVNYXJzaGFsbGluZykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmV2aXZlKHJlc3VsdCk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KGBQcm9wZXJ0eSBub3QgZm91bmQ6ICR7U3RyaW5nKHByb3BLZXkpfWApO1xuXHRcdFx0fVxuXHRcdH0pIGFzIFQ7XG5cdH1cblxuXHRmdW5jdGlvbiBwcm9wZXJ0eUlzRXZlbnQobmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Ly8gQXNzdW1lIGEgcHJvcGVydHkgaXMgYW4gZXZlbnQgaWYgaXQgaGFzIGEgZm9ybSBvZiBcIm9uU29tZXRoaW5nXCJcblx0XHRyZXR1cm4gbmFtZVswXSA9PT0gJ28nICYmIG5hbWVbMV0gPT09ICduJyAmJiBzdHJpbmdzLmlzVXBwZXJBc2NpaUxldHRlcihuYW1lLmNoYXJDb2RlQXQoMikpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcHJvcGVydHlJc0R5bmFtaWNFdmVudChuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHQvLyBBc3N1bWUgYSBwcm9wZXJ0eSBpcyBhIGR5bmFtaWMgZXZlbnQgKGEgbWV0aG9kIHRoYXQgcmV0dXJucyBhbiBldmVudCkgaWYgaXQgaGFzIGEgZm9ybSBvZiBcIm9uRHluYW1pY1NvbWV0aGluZ1wiXG5cdFx0cmV0dXJuIC9eb25EeW5hbWljLy50ZXN0KG5hbWUpICYmIHN0cmluZ3MuaXNVcHBlckFzY2lpTGV0dGVyKG5hbWUuY2hhckNvZGVBdCg5KSk7XG5cdH1cbn1cblxuY29uc3QgY29sb3JUYWJsZXMgPSBbXG5cdFsnIzI5NzdCMScsICcjRkM4MDJEJywgJyMzNEExM0EnLCAnI0QzMjgyRicsICcjOTM2NkJBJ10sXG5cdFsnIzhCNTY0QycsICcjRTE3N0MwJywgJyM3RjdGN0YnLCAnI0JCQkUzRCcsICcjMkVCRUNEJ11cbl07XG5cbmZ1bmN0aW9uIHByZXR0eVdpdGhvdXRBcnJheXMoZGF0YTogdW5rbm93bik6IGFueSB7XG5cdGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblx0aWYgKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdvYmplY3QnICYmIHR5cGVvZiBkYXRhLnRvU3RyaW5nID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGF0YS50b1N0cmluZygpO1xuXHRcdGlmIChyZXN1bHQgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZGF0YTtcbn1cblxuZnVuY3Rpb24gcHJldHR5KGRhdGE6IHVua25vd24pOiBhbnkge1xuXHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuXHRcdHJldHVybiBkYXRhLm1hcChwcmV0dHlXaXRob3V0QXJyYXlzKTtcblx0fVxuXHRyZXR1cm4gcHJldHR5V2l0aG91dEFycmF5cyhkYXRhKTtcbn1cblxuZnVuY3Rpb24gbG9nV2l0aENvbG9ycyhkaXJlY3Rpb246IHN0cmluZywgdG90YWxMZW5ndGg6IG51bWJlciwgbXNnTGVuZ3RoOiBudW1iZXIsIHJlcTogbnVtYmVyLCBpbml0aWF0b3I6IFJlcXVlc3RJbml0aWF0b3IsIHN0cjogc3RyaW5nLCBkYXRhOiBhbnkpOiB2b2lkIHtcblx0ZGF0YSA9IHByZXR0eShkYXRhKTtcblxuXHRjb25zdCBjb2xvclRhYmxlID0gY29sb3JUYWJsZXNbaW5pdGlhdG9yXTtcblx0Y29uc3QgY29sb3IgPSBjb2xvclRhYmxlW3JlcSAlIGNvbG9yVGFibGUubGVuZ3RoXTtcblx0bGV0IGFyZ3MgPSBbYCVjWyR7ZGlyZWN0aW9ufV0lY1ske1N0cmluZyh0b3RhbExlbmd0aCkucGFkU3RhcnQoNywgJyAnKX1dJWNbbGVuOiAke1N0cmluZyhtc2dMZW5ndGgpLnBhZFN0YXJ0KDUsICcgJyl9XSVjJHtTdHJpbmcocmVxKS5wYWRTdGFydCg1LCAnICcpfSAtICR7c3RyfWAsICdjb2xvcjogZGFya2dyZWVuJywgJ2NvbG9yOiBncmV5JywgJ2NvbG9yOiBncmV5JywgYGNvbG9yOiAke2NvbG9yfWBdO1xuXHRpZiAoL1xcKCQvLnRlc3Qoc3RyKSkge1xuXHRcdGFyZ3MgPSBhcmdzLmNvbmNhdChkYXRhKTtcblx0XHRhcmdzLnB1c2goJyknKTtcblx0fSBlbHNlIHtcblx0XHRhcmdzLnB1c2goZGF0YSk7XG5cdH1cblx0Y29uc29sZS5sb2cuYXBwbHkoY29uc29sZSwgYXJncyBhcyBbc3RyaW5nLCAuLi5zdHJpbmdbXV0pO1xufVxuXG5leHBvcnQgY2xhc3MgSVBDTG9nZ2VyIGltcGxlbWVudHMgSUlQQ0xvZ2dlciB7XG5cdHByaXZhdGUgX3RvdGFsSW5jb21pbmcgPSAwO1xuXHRwcml2YXRlIF90b3RhbE91dGdvaW5nID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vdXRnb2luZ1ByZWZpeDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luY29taW5nUHJlZml4OiBzdHJpbmcsXG5cdCkgeyB9XG5cblx0cHVibGljIGxvZ091dGdvaW5nKG1zZ0xlbmd0aDogbnVtYmVyLCByZXF1ZXN0SWQ6IG51bWJlciwgaW5pdGlhdG9yOiBSZXF1ZXN0SW5pdGlhdG9yLCBzdHI6IHN0cmluZywgZGF0YT86IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuX3RvdGFsT3V0Z29pbmcgKz0gbXNnTGVuZ3RoO1xuXHRcdGxvZ1dpdGhDb2xvcnModGhpcy5fb3V0Z29pbmdQcmVmaXgsIHRoaXMuX3RvdGFsT3V0Z29pbmcsIG1zZ0xlbmd0aCwgcmVxdWVzdElkLCBpbml0aWF0b3IsIHN0ciwgZGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgbG9nSW5jb21pbmcobXNnTGVuZ3RoOiBudW1iZXIsIHJlcXVlc3RJZDogbnVtYmVyLCBpbml0aWF0b3I6IFJlcXVlc3RJbml0aWF0b3IsIHN0cjogc3RyaW5nLCBkYXRhPzogYW55KTogdm9pZCB7XG5cdFx0dGhpcy5fdG90YWxJbmNvbWluZyArPSBtc2dMZW5ndGg7XG5cdFx0bG9nV2l0aENvbG9ycyh0aGlzLl9pbmNvbWluZ1ByZWZpeCwgdGhpcy5fdG90YWxJbmNvbWlu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QU8sU0FBUyxZQUFZLE9BQU8sS0FBSyxhQUFhLFlBQVk7QUFDNUUsVUFBTSxTQUFTLEtBQUssU0FBUztBQUM3QixRQUFJLFdBQVcsbUJBQW1CO0FBQ2pDLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsT0FBTyxNQUFvQjtBQUNuQyxNQUFJLE1BQU0sUUFBUSxJQUFJLEdBQUc7QUFDeEIsV0FBTyxLQUFLLElBQUksbUJBQW1CO0FBQUEsRUFDcEM7QUFDQSxTQUFPLG9CQUFvQixJQUFJO0FBQ2hDO0FBRUEsU0FBUyxjQUFjLFdBQW1CLGFBQXFCLFdBQW1CLEtBQWEsV0FBNkIsS0FBYSxNQUFpQjtBQUN6SixTQUFPLE9BQU8sSUFBSTtBQUVsQixRQUFNLGFBQWEsWUFBWSxTQUFTO0FBQ3hDLFFBQU0sUUFBUSxXQUFXLE1BQU0sV0FBVyxNQUFNO0FBQ2hELE1BQUksT0FBTyxDQUFDLE1BQU0sU0FBUyxPQUFPLE9BQU8sV0FBVyxFQUFFLFNBQVMsR0FBRyxHQUFHLENBQUMsWUFBWSxPQUFPLFNBQVMsRUFBRSxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sT0FBTyxHQUFHLEVBQUUsU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxvQkFBb0IsZUFBZSxlQUFlLFVBQVUsS0FBSyxFQUFFO0FBQ3RPLE1BQUksTUFBTSxLQUFLLEdBQUcsR0FBRztBQUNwQixXQUFPLEtBQUssT0FBTyxJQUFJO0FBQ3ZCLFNBQUssS0FBSyxHQUFHO0FBQUEsRUFDZCxPQUFPO0FBQ04sU0FBSyxLQUFLLElBQUk7QUFBQSxFQUNmO0FBQ0EsVUFBUSxJQUFJLE1BQU0sU0FBUyxJQUE2QjtBQUN6RDtBQUVPLE1BQU0sVUFBZ0M7QUFBQSxFQUk1QyxZQUNrQixpQkFDQSxpQkFDaEI7QUFGZ0I7QUFDQTtBQUxsQixTQUFRLGlCQUFpQjtBQUN6QixTQUFRLGlCQUFpQjtBQUFBLEVBS3JCO0FBQUEsRUFFRyxZQUFZLFdBQW1CLFdBQW1CLFdBQTZCLEtBQWEsTUFBa0I7QUFDcEgsU0FBSyxrQkFBa0I7QUFDdkIsa0JBQWMsS0FBSyxpQkFBaUIsS0FBSyxnQkFBZ0IsV0FBVyxXQUFXLFdBQVcsS0FBSyxJQUFJO0FBQUEsRUFDcEc7QUFBQSxFQUVPLFlBQVksV0FBbUIsV0FBbUIsV0FBNkIsS0FBYSxNQUFrQjtBQUNwSCxTQUFLLGtCQUFrQjtBQUN2QixrQkFBYyxLQUFLLGlCQUFpQixLQUFLLGdCQUFnQixXQUFXLFdBQVcsV0FBVyxLQUFLLElBQUk7QUFBQSxFQUNwRztBQUNEOyIsCiAgIm5hbWVzIjogWyJSZXF1ZXN0VHlwZSIsICJSZXNwb25zZVR5cGUiLCAiU3RhdGUiLCAiRGF0YVR5cGUiLCAiUmVxdWVzdEluaXRpYXRvciIsICJQcm94eUNoYW5uZWwiXQp9Cg==
