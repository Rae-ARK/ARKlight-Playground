var _a, _b;
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CharCode } from "../../../../base/common/charCode.js";
import * as errors from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { transformIncomingURIs } from "../../../../base/common/uriIpc.js";
import { CanceledLazyPromise, LazyPromise } from "./lazyPromise.js";
import { getStringIdentifierForProxy, ProxyIdentifier, SerializableObjectWithBuffers } from "./proxyIdentifier.js";
function safeStringify(obj, replacer) {
  try {
    return JSON.stringify(obj, replacer);
  } catch (err) {
    return "null";
  }
}
const refSymbolName = "$$ref$$";
const undefinedRef = { [refSymbolName]: -1 };
class StringifiedJsonWithBufferRefs {
  constructor(jsonString, referencedBuffers) {
    this.jsonString = jsonString;
    this.referencedBuffers = referencedBuffers;
  }
}
function stringifyJsonWithBufferRefs(obj, replacer = null, useSafeStringify = false) {
  const foundBuffers = [];
  const serialized = (useSafeStringify ? safeStringify : JSON.stringify)(obj, (key, value) => {
    if (typeof value === "undefined") {
      return undefinedRef;
    } else if (typeof value === "object") {
      if (value instanceof VSBuffer) {
        const bufferIndex = foundBuffers.push(value) - 1;
        return { [refSymbolName]: bufferIndex };
      }
      if (replacer) {
        return replacer(key, value);
      }
    }
    return value;
  });
  return {
    jsonString: serialized,
    referencedBuffers: foundBuffers
  };
}
function parseJsonAndRestoreBufferRefs(jsonString, buffers, uriTransformer) {
  return JSON.parse(jsonString, (_key, value) => {
    if (value) {
      const ref = value[refSymbolName];
      if (typeof ref === "number") {
        return buffers[ref];
      }
      if (uriTransformer && value.$mid === MarshalledId.Uri) {
        return uriTransformer.transformIncoming(value);
      }
    }
    return value;
  });
}
function stringify(obj, replacer) {
  return JSON.stringify(obj, replacer);
}
function createURIReplacer(transformer) {
  if (!transformer) {
    return null;
  }
  return (key, value) => {
    if (value && value.$mid === MarshalledId.Uri) {
      return transformer.transformOutgoing(value);
    }
    return value;
  };
}
var RequestInitiator = /* @__PURE__ */ ((RequestInitiator2) => {
  RequestInitiator2[RequestInitiator2["LocalSide"] = 0] = "LocalSide";
  RequestInitiator2[RequestInitiator2["OtherSide"] = 1] = "OtherSide";
  return RequestInitiator2;
})(RequestInitiator || {});
var ResponsiveState = /* @__PURE__ */ ((ResponsiveState2) => {
  ResponsiveState2[ResponsiveState2["Responsive"] = 0] = "Responsive";
  ResponsiveState2[ResponsiveState2["Unresponsive"] = 1] = "Unresponsive";
  return ResponsiveState2;
})(ResponsiveState || {});
const noop = () => {
};
const _RPCProtocolSymbol = /* @__PURE__ */ Symbol.for("rpcProtocol");
const _RPCProxySymbol = /* @__PURE__ */ Symbol.for("rpcProxy");
const _RPCProtocol = class _RPCProtocol extends (_b = Disposable, _a = _RPCProtocolSymbol, _b) {
  constructor(protocol, logger = null, transformer = null) {
    super();
    this[_a] = true;
    // 3s
    this._onDidChangeResponsiveState = this._register(new Emitter());
    this.onDidChangeResponsiveState = this._onDidChangeResponsiveState.event;
    this._protocol = protocol;
    this._logger = logger;
    this._uriTransformer = transformer;
    this._uriReplacer = createURIReplacer(this._uriTransformer);
    this._isDisposed = false;
    this._locals = [];
    this._proxies = [];
    for (let i = 0, len = ProxyIdentifier.count; i < len; i++) {
      this._locals[i] = null;
      this._proxies[i] = null;
    }
    this._lastMessageId = 0;
    this._cancelInvokedHandlers = /* @__PURE__ */ Object.create(null);
    this._pendingRPCReplies = {};
    this._responsiveState = 0 /* Responsive */;
    this._unacknowledgedCount = 0;
    this._unresponsiveTime = 0;
    this._asyncCheckUresponsive = this._register(new RunOnceScheduler(() => this._checkUnresponsive(), 1e3));
    this._register(this._protocol.onMessage((msg) => this._receiveOneMessage(msg)));
  }
  dispose() {
    this._isDisposed = true;
    Object.keys(this._pendingRPCReplies).forEach((msgId) => {
      const pending = this._pendingRPCReplies[msgId];
      delete this._pendingRPCReplies[msgId];
      pending.resolveErr(errors.canceled());
    });
    super.dispose();
  }
  drain() {
    if (typeof this._protocol.drain === "function") {
      return this._protocol.drain();
    }
    return Promise.resolve();
  }
  _onWillSendRequest(req) {
    if (this._unacknowledgedCount === 0) {
      this._unresponsiveTime = Date.now() + _RPCProtocol.UNRESPONSIVE_TIME;
    }
    this._unacknowledgedCount++;
    if (!this._asyncCheckUresponsive.isScheduled()) {
      this._asyncCheckUresponsive.schedule();
    }
  }
  _onDidReceiveAcknowledge(req) {
    this._unresponsiveTime = Date.now() + _RPCProtocol.UNRESPONSIVE_TIME;
    this._unacknowledgedCount--;
    if (this._unacknowledgedCount === 0) {
      this._asyncCheckUresponsive.cancel();
    }
    this._setResponsiveState(0 /* Responsive */);
  }
  _checkUnresponsive() {
    if (this._unacknowledgedCount === 0) {
      return;
    }
    if (Date.now() > this._unresponsiveTime) {
      this._setResponsiveState(1 /* Unresponsive */);
    } else {
      this._asyncCheckUresponsive.schedule();
    }
  }
  _setResponsiveState(newResponsiveState) {
    if (this._responsiveState === newResponsiveState) {
      return;
    }
    this._responsiveState = newResponsiveState;
    this._onDidChangeResponsiveState.fire(this._responsiveState);
  }
  get responsiveState() {
    return this._responsiveState;
  }
  transformIncomingURIs(obj) {
    if (!this._uriTransformer) {
      return obj;
    }
    return transformIncomingURIs(obj, this._uriTransformer);
  }
  getProxy(identifier) {
    const { nid: rpcId, sid } = identifier;
    if (!this._proxies[rpcId]) {
      this._proxies[rpcId] = this._createProxy(rpcId, sid);
    }
    return this._proxies[rpcId];
  }
  _createProxy(rpcId, debugName) {
    const handler = {
      get: (target, name) => {
        if (typeof name === "string" && !target[name] && name.charCodeAt(0) === CharCode.DollarSign) {
          target[name] = (...myArgs) => {
            return this._remoteCall(rpcId, name, myArgs);
          };
        }
        if (name === _RPCProxySymbol) {
          return debugName;
        }
        return target[name];
      }
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), handler);
  }
  set(identifier, value) {
    this._locals[identifier.nid] = value;
    return value;
  }
  assertRegistered(identifiers) {
    for (let i = 0, len = identifiers.length; i < len; i++) {
      const identifier = identifiers[i];
      if (!this._locals[identifier.nid]) {
        throw new Error(`Missing proxy instance ${identifier.sid}`);
      }
    }
  }
  _receiveOneMessage(rawmsg) {
    if (this._isDisposed) {
      return;
    }
    const msgLength = rawmsg.byteLength;
    const buff = MessageBuffer.read(rawmsg, 0);
    const messageType = buff.readUInt8();
    const req = buff.readUInt32();
    switch (messageType) {
      case 1 /* RequestJSONArgs */:
      case 2 /* RequestJSONArgsWithCancellation */: {
        let { rpcId, method, args } = MessageIO.deserializeRequestJSONArgs(buff);
        if (this._uriTransformer) {
          args = transformIncomingURIs(args, this._uriTransformer);
        }
        this._receiveRequest(msgLength, req, rpcId, method, args, messageType === 2 /* RequestJSONArgsWithCancellation */);
        break;
      }
      case 3 /* RequestMixedArgs */:
      case 4 /* RequestMixedArgsWithCancellation */: {
        let { rpcId, method, args } = MessageIO.deserializeRequestMixedArgs(buff);
        if (this._uriTransformer) {
          args = transformIncomingURIs(args, this._uriTransformer);
        }
        this._receiveRequest(msgLength, req, rpcId, method, args, messageType === 4 /* RequestMixedArgsWithCancellation */);
        break;
      }
      case 5 /* Acknowledged */: {
        this._logger?.logIncoming(msgLength, req, 0 /* LocalSide */, `ack`);
        this._onDidReceiveAcknowledge(req);
        break;
      }
      case 6 /* Cancel */: {
        this._receiveCancel(msgLength, req);
        break;
      }
      case 7 /* ReplyOKEmpty */: {
        this._receiveReply(msgLength, req, void 0);
        break;
      }
      case 9 /* ReplyOKJSON */: {
        let value = MessageIO.deserializeReplyOKJSON(buff);
        if (this._uriTransformer) {
          value = transformIncomingURIs(value, this._uriTransformer);
        }
        this._receiveReply(msgLength, req, value);
        break;
      }
      case 10 /* ReplyOKJSONWithBuffers */: {
        const value = MessageIO.deserializeReplyOKJSONWithBuffers(buff, this._uriTransformer);
        this._receiveReply(msgLength, req, value);
        break;
      }
      case 8 /* ReplyOKVSBuffer */: {
        const value = MessageIO.deserializeReplyOKVSBuffer(buff);
        this._receiveReply(msgLength, req, value);
        break;
      }
      case 11 /* ReplyErrError */: {
        let err = MessageIO.deserializeReplyErrError(buff);
        if (this._uriTransformer) {
          err = transformIncomingURIs(err, this._uriTransformer);
        }
        this._receiveReplyErr(msgLength, req, err);
        break;
      }
      case 12 /* ReplyErrEmpty */: {
        this._receiveReplyErr(msgLength, req, void 0);
        break;
      }
      default:
        console.error(`received unexpected message`);
        console.error(rawmsg);
    }
  }
  _receiveRequest(msgLength, req, rpcId, method, args, usesCancellationToken) {
    this._logger?.logIncoming(msgLength, req, 1 /* OtherSide */, `receiveRequest ${getStringIdentifierForProxy(rpcId)}.${method}(`, args);
    const callId = String(req);
    let promise;
    let cancel;
    if (usesCancellationToken) {
      const cancellationTokenSource = new CancellationTokenSource();
      args.push(cancellationTokenSource.token);
      promise = this._invokeHandler(rpcId, method, args);
      cancel = () => cancellationTokenSource.cancel();
    } else {
      promise = this._invokeHandler(rpcId, method, args);
      cancel = noop;
    }
    this._cancelInvokedHandlers[callId] = cancel;
    const msg = MessageIO.serializeAcknowledged(req);
    this._logger?.logOutgoing(msg.byteLength, req, 1 /* OtherSide */, `ack`);
    this._protocol.send(msg);
    promise.then((r) => {
      delete this._cancelInvokedHandlers[callId];
      const msg2 = MessageIO.serializeReplyOK(req, r, this._uriReplacer);
      this._logger?.logOutgoing(msg2.byteLength, req, 1 /* OtherSide */, `reply:`, r);
      this._protocol.send(msg2);
    }, (err) => {
      delete this._cancelInvokedHandlers[callId];
      const msg2 = MessageIO.serializeReplyErr(req, err);
      this._logger?.logOutgoing(msg2.byteLength, req, 1 /* OtherSide */, `replyErr:`, err);
      this._protocol.send(msg2);
    });
  }
  _receiveCancel(msgLength, req) {
    this._logger?.logIncoming(msgLength, req, 1 /* OtherSide */, `receiveCancel`);
    const callId = String(req);
    this._cancelInvokedHandlers[callId]?.();
  }
  _receiveReply(msgLength, req, value) {
    this._logger?.logIncoming(msgLength, req, 0 /* LocalSide */, `receiveReply:`, value);
    const callId = String(req);
    if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
      return;
    }
    const pendingReply = this._pendingRPCReplies[callId];
    delete this._pendingRPCReplies[callId];
    pendingReply.resolveOk(value);
  }
  _receiveReplyErr(msgLength, req, value) {
    this._logger?.logIncoming(msgLength, req, 0 /* LocalSide */, `receiveReplyErr:`, value);
    const callId = String(req);
    if (!this._pendingRPCReplies.hasOwnProperty(callId)) {
      return;
    }
    const pendingReply = this._pendingRPCReplies[callId];
    delete this._pendingRPCReplies[callId];
    let err = void 0;
    if (value) {
      if (value.$isError) {
        err = new Error();
        err.name = value.name;
        err.message = value.message;
        err.stack = value.stack;
      } else {
        err = value;
      }
    }
    pendingReply.resolveErr(err);
  }
  _invokeHandler(rpcId, methodName, args) {
    try {
      return Promise.resolve(this._doInvokeHandler(rpcId, methodName, args));
    } catch (err) {
      return Promise.reject(err);
    }
  }
  _doInvokeHandler(rpcId, methodName, args) {
    const actor = this._locals[rpcId];
    if (!actor) {
      throw new Error("Unknown actor " + getStringIdentifierForProxy(rpcId));
    }
    const method = actor[methodName];
    if (typeof method !== "function") {
      throw new Error("Unknown method " + methodName + " on actor " + getStringIdentifierForProxy(rpcId));
    }
    return method.apply(actor, args);
  }
  _remoteCall(rpcId, methodName, args) {
    if (this._isDisposed) {
      return new CanceledLazyPromise();
    }
    let cancellationToken = null;
    if (args.length > 0 && CancellationToken.isCancellationToken(args[args.length - 1])) {
      cancellationToken = args.pop();
    }
    if (cancellationToken && cancellationToken.isCancellationRequested) {
      return Promise.reject(errors.canceled());
    }
    const serializedRequestArguments = MessageIO.serializeRequestArguments(args, this._uriReplacer);
    const req = ++this._lastMessageId;
    const callId = String(req);
    const result = new LazyPromise();
    const disposable = new DisposableStore();
    if (cancellationToken) {
      disposable.add(cancellationToken.onCancellationRequested(() => {
        const msg2 = MessageIO.serializeCancel(req);
        this._logger?.logOutgoing(msg2.byteLength, req, 0 /* LocalSide */, `cancel`);
        this._protocol.send(msg2);
      }));
    }
    this._pendingRPCReplies[callId] = new PendingRPCReply(result, disposable);
    this._onWillSendRequest(req);
    const msg = MessageIO.serializeRequest(req, rpcId, methodName, serializedRequestArguments, !!cancellationToken);
    this._logger?.logOutgoing(msg.byteLength, req, 0 /* LocalSide */, `request: ${getStringIdentifierForProxy(rpcId)}.${methodName}(`, args);
    this._protocol.send(msg);
    return result;
  }
};
_RPCProtocol.UNRESPONSIVE_TIME = 3 * 1e3;
let RPCProtocol = _RPCProtocol;
class PendingRPCReply {
  constructor(_promise, _disposable) {
    this._promise = _promise;
    this._disposable = _disposable;
  }
  resolveOk(value) {
    this._promise.resolveOk(value);
    this._disposable.dispose();
  }
  resolveErr(err) {
    this._promise.resolveErr(err);
    this._disposable.dispose();
  }
}
const _MessageBuffer = class _MessageBuffer {
  static alloc(type, req, messageSize) {
    const result = new _MessageBuffer(VSBuffer.alloc(
      messageSize + 1 + 4
      /* req */
    ), 0);
    result.writeUInt8(type);
    result.writeUInt32(req);
    return result;
  }
  static read(buff, offset) {
    return new _MessageBuffer(buff, offset);
  }
  get buffer() {
    return this._buff;
  }
  constructor(buff, offset) {
    this._buff = buff;
    this._offset = offset;
  }
  static sizeUInt8() {
    return 1;
  }
  writeUInt8(n) {
    this._buff.writeUInt8(n, this._offset);
    this._offset += 1;
  }
  readUInt8() {
    const n = this._buff.readUInt8(this._offset);
    this._offset += 1;
    return n;
  }
  writeUInt32(n) {
    this._buff.writeUInt32BE(n, this._offset);
    this._offset += 4;
  }
  readUInt32() {
    const n = this._buff.readUInt32BE(this._offset);
    this._offset += 4;
    return n;
  }
  static sizeShortString(str) {
    return 1 + str.byteLength;
  }
  writeShortString(str) {
    this._buff.writeUInt8(str.byteLength, this._offset);
    this._offset += 1;
    this._buff.set(str, this._offset);
    this._offset += str.byteLength;
  }
  readShortString() {
    const strByteLength = this._buff.readUInt8(this._offset);
    this._offset += 1;
    const strBuff = this._buff.slice(this._offset, this._offset + strByteLength);
    const str = strBuff.toString();
    this._offset += strByteLength;
    return str;
  }
  static sizeLongString(str) {
    return 4 + str.byteLength;
  }
  writeLongString(str) {
    this._buff.writeUInt32BE(str.byteLength, this._offset);
    this._offset += 4;
    this._buff.set(str, this._offset);
    this._offset += str.byteLength;
  }
  readLongString() {
    const strByteLength = this._buff.readUInt32BE(this._offset);
    this._offset += 4;
    const strBuff = this._buff.slice(this._offset, this._offset + strByteLength);
    const str = strBuff.toString();
    this._offset += strByteLength;
    return str;
  }
  writeBuffer(buff) {
    this._buff.writeUInt32BE(buff.byteLength, this._offset);
    this._offset += 4;
    this._buff.set(buff, this._offset);
    this._offset += buff.byteLength;
  }
  static sizeVSBuffer(buff) {
    return 4 + buff.byteLength;
  }
  writeVSBuffer(buff) {
    this._buff.writeUInt32BE(buff.byteLength, this._offset);
    this._offset += 4;
    this._buff.set(buff, this._offset);
    this._offset += buff.byteLength;
  }
  readVSBuffer() {
    const buffLength = this._buff.readUInt32BE(this._offset);
    this._offset += 4;
    const buff = this._buff.slice(this._offset, this._offset + buffLength);
    this._offset += buffLength;
    return buff;
  }
  static sizeMixedArray(arr) {
    let size = 0;
    size += 1;
    for (let i = 0, len = arr.length; i < len; i++) {
      const el = arr[i];
      size += 1;
      switch (el.type) {
        case 1 /* String */:
          size += this.sizeLongString(el.value);
          break;
        case 2 /* VSBuffer */:
          size += this.sizeVSBuffer(el.value);
          break;
        case 3 /* SerializedObjectWithBuffers */:
          size += this.sizeUInt32;
          size += this.sizeLongString(el.value);
          for (let i2 = 0; i2 < el.buffers.length; ++i2) {
            size += this.sizeVSBuffer(el.buffers[i2]);
          }
          break;
        case 4 /* Undefined */:
          break;
      }
    }
    return size;
  }
  writeMixedArray(arr) {
    this._buff.writeUInt8(arr.length, this._offset);
    this._offset += 1;
    for (let i = 0, len = arr.length; i < len; i++) {
      const el = arr[i];
      switch (el.type) {
        case 1 /* String */:
          this.writeUInt8(1 /* String */);
          this.writeLongString(el.value);
          break;
        case 2 /* VSBuffer */:
          this.writeUInt8(2 /* VSBuffer */);
          this.writeVSBuffer(el.value);
          break;
        case 3 /* SerializedObjectWithBuffers */:
          this.writeUInt8(3 /* SerializedObjectWithBuffers */);
          this.writeUInt32(el.buffers.length);
          this.writeLongString(el.value);
          for (let i2 = 0; i2 < el.buffers.length; ++i2) {
            this.writeBuffer(el.buffers[i2]);
          }
          break;
        case 4 /* Undefined */:
          this.writeUInt8(4 /* Undefined */);
          break;
      }
    }
  }
  readMixedArray() {
    const arrLen = this._buff.readUInt8(this._offset);
    this._offset += 1;
    const arr = new Array(arrLen);
    for (let i = 0; i < arrLen; i++) {
      const argType = this.readUInt8();
      switch (argType) {
        case 1 /* String */:
          arr[i] = this.readLongString();
          break;
        case 2 /* VSBuffer */:
          arr[i] = this.readVSBuffer();
          break;
        case 3 /* SerializedObjectWithBuffers */: {
          const bufferCount = this.readUInt32();
          const jsonString = this.readLongString();
          const buffers = [];
          for (let i2 = 0; i2 < bufferCount; ++i2) {
            buffers.push(this.readVSBuffer());
          }
          arr[i] = new SerializableObjectWithBuffers(parseJsonAndRestoreBufferRefs(jsonString, buffers, null));
          break;
        }
        case 4 /* Undefined */:
          arr[i] = void 0;
          break;
      }
    }
    return arr;
  }
};
_MessageBuffer.sizeUInt32 = 4;
let MessageBuffer = _MessageBuffer;
var SerializedRequestArgumentType = /* @__PURE__ */ ((SerializedRequestArgumentType2) => {
  SerializedRequestArgumentType2[SerializedRequestArgumentType2["Simple"] = 0] = "Simple";
  SerializedRequestArgumentType2[SerializedRequestArgumentType2["Mixed"] = 1] = "Mixed";
  return SerializedRequestArgumentType2;
})(SerializedRequestArgumentType || {});
class MessageIO {
  static _useMixedArgSerialization(arr) {
    for (let i = 0, len = arr.length; i < len; i++) {
      if (arr[i] instanceof VSBuffer) {
        return true;
      }
      if (arr[i] instanceof SerializableObjectWithBuffers) {
        return true;
      }
      if (typeof arr[i] === "undefined") {
        return true;
      }
    }
    return false;
  }
  static serializeRequestArguments(args, replacer) {
    if (this._useMixedArgSerialization(args)) {
      const massagedArgs = [];
      for (let i = 0, len = args.length; i < len; i++) {
        const arg = args[i];
        if (arg instanceof VSBuffer) {
          massagedArgs[i] = { type: 2 /* VSBuffer */, value: arg };
        } else if (typeof arg === "undefined") {
          massagedArgs[i] = { type: 4 /* Undefined */ };
        } else if (arg instanceof SerializableObjectWithBuffers) {
          const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(arg.value, replacer);
          massagedArgs[i] = { type: 3 /* SerializedObjectWithBuffers */, value: VSBuffer.fromString(jsonString), buffers: referencedBuffers };
        } else {
          massagedArgs[i] = { type: 1 /* String */, value: VSBuffer.fromString(stringify(arg, replacer)) };
        }
      }
      return {
        type: 1 /* Mixed */,
        args: massagedArgs
      };
    }
    return {
      type: 0 /* Simple */,
      args: stringify(args, replacer)
    };
  }
  static serializeRequest(req, rpcId, method, serializedArgs, usesCancellationToken) {
    switch (serializedArgs.type) {
      case 0 /* Simple */:
        return this._requestJSONArgs(req, rpcId, method, serializedArgs.args, usesCancellationToken);
      case 1 /* Mixed */:
        return this._requestMixedArgs(req, rpcId, method, serializedArgs.args, usesCancellationToken);
    }
  }
  static _requestJSONArgs(req, rpcId, method, args, usesCancellationToken) {
    const methodBuff = VSBuffer.fromString(method);
    const argsBuff = VSBuffer.fromString(args);
    let len = 0;
    len += MessageBuffer.sizeUInt8();
    len += MessageBuffer.sizeShortString(methodBuff);
    len += MessageBuffer.sizeLongString(argsBuff);
    const result = MessageBuffer.alloc(usesCancellationToken ? 2 /* RequestJSONArgsWithCancellation */ : 1 /* RequestJSONArgs */, req, len);
    result.writeUInt8(rpcId);
    result.writeShortString(methodBuff);
    result.writeLongString(argsBuff);
    return result.buffer;
  }
  static deserializeRequestJSONArgs(buff) {
    const rpcId = buff.readUInt8();
    const method = buff.readShortString();
    const args = buff.readLongString();
    return {
      rpcId,
      method,
      args: JSON.parse(args)
    };
  }
  static _requestMixedArgs(req, rpcId, method, args, usesCancellationToken) {
    const methodBuff = VSBuffer.fromString(method);
    let len = 0;
    len += MessageBuffer.sizeUInt8();
    len += MessageBuffer.sizeShortString(methodBuff);
    len += MessageBuffer.sizeMixedArray(args);
    const result = MessageBuffer.alloc(usesCancellationToken ? 4 /* RequestMixedArgsWithCancellation */ : 3 /* RequestMixedArgs */, req, len);
    result.writeUInt8(rpcId);
    result.writeShortString(methodBuff);
    result.writeMixedArray(args);
    return result.buffer;
  }
  static deserializeRequestMixedArgs(buff) {
    const rpcId = buff.readUInt8();
    const method = buff.readShortString();
    const rawargs = buff.readMixedArray();
    const args = new Array(rawargs.length);
    for (let i = 0, len = rawargs.length; i < len; i++) {
      const rawarg = rawargs[i];
      if (typeof rawarg === "string") {
        args[i] = JSON.parse(rawarg);
      } else {
        args[i] = rawarg;
      }
    }
    return {
      rpcId,
      method,
      args
    };
  }
  static serializeAcknowledged(req) {
    return MessageBuffer.alloc(5 /* Acknowledged */, req, 0).buffer;
  }
  static serializeCancel(req) {
    return MessageBuffer.alloc(6 /* Cancel */, req, 0).buffer;
  }
  static serializeReplyOK(req, res, replacer) {
    if (typeof res === "undefined") {
      return this._serializeReplyOKEmpty(req);
    } else if (res instanceof VSBuffer) {
      return this._serializeReplyOKVSBuffer(req, res);
    } else if (res instanceof SerializableObjectWithBuffers) {
      const { jsonString, referencedBuffers } = stringifyJsonWithBufferRefs(res.value, replacer, true);
      return this._serializeReplyOKJSONWithBuffers(req, jsonString, referencedBuffers);
    } else {
      return this._serializeReplyOKJSON(req, safeStringify(res, replacer));
    }
  }
  static _serializeReplyOKEmpty(req) {
    return MessageBuffer.alloc(7 /* ReplyOKEmpty */, req, 0).buffer;
  }
  static _serializeReplyOKVSBuffer(req, res) {
    let len = 0;
    len += MessageBuffer.sizeVSBuffer(res);
    const result = MessageBuffer.alloc(8 /* ReplyOKVSBuffer */, req, len);
    result.writeVSBuffer(res);
    return result.buffer;
  }
  static deserializeReplyOKVSBuffer(buff) {
    return buff.readVSBuffer();
  }
  static _serializeReplyOKJSON(req, res) {
    const resBuff = VSBuffer.fromString(res);
    let len = 0;
    len += MessageBuffer.sizeLongString(resBuff);
    const result = MessageBuffer.alloc(9 /* ReplyOKJSON */, req, len);
    result.writeLongString(resBuff);
    return result.buffer;
  }
  static _serializeReplyOKJSONWithBuffers(req, res, buffers) {
    const resBuff = VSBuffer.fromString(res);
    let len = 0;
    len += MessageBuffer.sizeUInt32;
    len += MessageBuffer.sizeLongString(resBuff);
    for (const buffer of buffers) {
      len += MessageBuffer.sizeVSBuffer(buffer);
    }
    const result = MessageBuffer.alloc(10 /* ReplyOKJSONWithBuffers */, req, len);
    result.writeUInt32(buffers.length);
    result.writeLongString(resBuff);
    for (const buffer of buffers) {
      result.writeBuffer(buffer);
    }
    return result.buffer;
  }
  static deserializeReplyOKJSON(buff) {
    const res = buff.readLongString();
    return JSON.parse(res);
  }
  static deserializeReplyOKJSONWithBuffers(buff, uriTransformer) {
    const bufferCount = buff.readUInt32();
    const res = buff.readLongString();
    const buffers = [];
    for (let i = 0; i < bufferCount; ++i) {
      buffers.push(buff.readVSBuffer());
    }
    return new SerializableObjectWithBuffers(parseJsonAndRestoreBufferRefs(res, buffers, uriTransformer));
  }
  static serializeReplyErr(req, err) {
    const errStr = err ? safeStringify(errors.transformErrorForSerialization(err), null) : void 0;
    if (typeof errStr !== "string") {
      return this._serializeReplyErrEmpty(req);
    }
    const errBuff = VSBuffer.fromString(errStr);
    let len = 0;
    len += MessageBuffer.sizeLongString(errBuff);
    const result = MessageBuffer.alloc(11 /* ReplyErrError */, req, len);
    result.writeLongString(errBuff);
    return result.buffer;
  }
  static deserializeReplyErrError(buff) {
    const err = buff.readLongString();
    return JSON.parse(err);
  }
  static _serializeReplyErrEmpty(req) {
    return MessageBuffer.alloc(12 /* ReplyErrEmpty */, req, 0).buffer;
  }
}
var MessageType = /* @__PURE__ */ ((MessageType2) => {
  MessageType2[MessageType2["RequestJSONArgs"] = 1] = "RequestJSONArgs";
  MessageType2[MessageType2["RequestJSONArgsWithCancellation"] = 2] = "RequestJSONArgsWithCancellation";
  MessageType2[MessageType2["RequestMixedArgs"] = 3] = "RequestMixedArgs";
  MessageType2[MessageType2["RequestMixedArgsWithCancellation"] = 4] = "RequestMixedArgsWithCancellation";
  MessageType2[MessageType2["Acknowledged"] = 5] = "Acknowledged";
  MessageType2[MessageType2["Cancel"] = 6] = "Cancel";
  MessageType2[MessageType2["ReplyOKEmpty"] = 7] = "ReplyOKEmpty";
  MessageType2[MessageType2["ReplyOKVSBuffer"] = 8] = "ReplyOKVSBuffer";
  MessageType2[MessageType2["ReplyOKJSON"] = 9] = "ReplyOKJSON";
  MessageType2[MessageType2["ReplyOKJSONWithBuffers"] = 10] = "ReplyOKJSONWithBuffers";
  MessageType2[MessageType2["ReplyErrError"] = 11] = "ReplyErrError";
  MessageType2[MessageType2["ReplyErrEmpty"] = 12] = "ReplyErrEmpty";
  return MessageType2;
})(MessageType || {});
var ArgType = /* @__PURE__ */ ((ArgType2) => {
  ArgType2[ArgType2["String"] = 1] = "String";
  ArgType2[ArgType2["VSBuffer"] = 2] = "VSBuffer";
  ArgType2[ArgType2["SerializedObjectWithBuffers"] = 3] = "SerializedObjectWithBuffers";
  ArgType2[ArgType2["Undefined"] = 4] = "Undefined";
  return ArgType2;
})(ArgType || {});
export {
  RPCProtocol,
  RequestInitiator,
  ResponsiveState,
  parseJsonAndRestoreBufferRefs,
  stringifyJsonWithBufferRefs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9ycGNQcm90b2NvbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgSVVSSVRyYW5zZm9ybWVyLCB0cmFuc2Zvcm1JbmNvbWluZ1VSSXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmlJcGMuanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IENhbmNlbGVkTGF6eVByb21pc2UsIExhenlQcm9taXNlIH0gZnJvbSAnLi9sYXp5UHJvbWlzZS5qcyc7XG5pbXBvcnQgeyBnZXRTdHJpbmdJZGVudGlmaWVyRm9yUHJveHksIElSUENQcm90b2NvbCwgUHJveGllZCwgUHJveHlJZGVudGlmaWVyLCBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4vcHJveHlJZGVudGlmaWVyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBKU09OU3RyaW5naWZ5UmVwbGFjZXIge1xuXHQoa2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBhbnk7XG59XG5cbmZ1bmN0aW9uIHNhZmVTdHJpbmdpZnkob2JqOiBhbnksIHJlcGxhY2VyOiBKU09OU3RyaW5naWZ5UmVwbGFjZXIgfCBudWxsKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkob2JqLCA8KGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiBhbnk+cmVwbGFjZXIpO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRyZXR1cm4gJ251bGwnO1xuXHR9XG59XG5cbmNvbnN0IHJlZlN5bWJvbE5hbWUgPSAnJCRyZWYkJCc7XG5jb25zdCB1bmRlZmluZWRSZWYgPSB7IFtyZWZTeW1ib2xOYW1lXTogLTEgfSBhcyBjb25zdDtcblxuY2xhc3MgU3RyaW5naWZpZWRKc29uV2l0aEJ1ZmZlclJlZnMge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkganNvblN0cmluZzogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSByZWZlcmVuY2VkQnVmZmVyczogcmVhZG9ubHkgVlNCdWZmZXJbXSxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmluZ2lmeUpzb25XaXRoQnVmZmVyUmVmczxUPihvYmo6IFQsIHJlcGxhY2VyOiBKU09OU3RyaW5naWZ5UmVwbGFjZXIgfCBudWxsID0gbnVsbCwgdXNlU2FmZVN0cmluZ2lmeSA9IGZhbHNlKTogU3RyaW5naWZpZWRKc29uV2l0aEJ1ZmZlclJlZnMge1xuXHRjb25zdCBmb3VuZEJ1ZmZlcnM6IFZTQnVmZmVyW10gPSBbXTtcblx0Y29uc3Qgc2VyaWFsaXplZCA9ICh1c2VTYWZlU3RyaW5naWZ5ID8gc2FmZVN0cmluZ2lmeSA6IEpTT04uc3RyaW5naWZ5KShvYmosIChrZXksIHZhbHVlKSA9PiB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWRSZWY7IC8vIEpTT04uc3RyaW5naWZ5IG5vcm1hbGx5IGNvbnZlcnRzICd1bmRlZmluZWQnIHRvICdudWxsJ1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0aWYgKHZhbHVlIGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHRcdFx0Y29uc3QgYnVmZmVySW5kZXggPSBmb3VuZEJ1ZmZlcnMucHVzaCh2YWx1ZSkgLSAxO1xuXHRcdFx0XHRyZXR1cm4geyBbcmVmU3ltYm9sTmFtZV06IGJ1ZmZlckluZGV4IH07XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVwbGFjZXIpIHtcblx0XHRcdFx0cmV0dXJuIHJlcGxhY2VyKGtleSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH0pO1xuXHRyZXR1cm4ge1xuXHRcdGpzb25TdHJpbmc6IHNlcmlhbGl6ZWQsXG5cdFx0cmVmZXJlbmNlZEJ1ZmZlcnM6IGZvdW5kQnVmZmVyc1xuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VKc29uQW5kUmVzdG9yZUJ1ZmZlclJlZnMoanNvblN0cmluZzogc3RyaW5nLCBidWZmZXJzOiByZWFkb25seSBWU0J1ZmZlcltdLCB1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCk6IGFueSB7XG5cdHJldHVybiBKU09OLnBhcnNlKGpzb25TdHJpbmcsIChfa2V5LCB2YWx1ZSkgPT4ge1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0Y29uc3QgcmVmID0gdmFsdWVbcmVmU3ltYm9sTmFtZV07XG5cdFx0XHRpZiAodHlwZW9mIHJlZiA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0cmV0dXJuIGJ1ZmZlcnNbcmVmXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHVyaVRyYW5zZm9ybWVyICYmICg8TWFyc2hhbGxlZE9iamVjdD52YWx1ZSkuJG1pZCA9PT0gTWFyc2hhbGxlZElkLlVyaSkge1xuXHRcdFx0XHRyZXR1cm4gdXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcodmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH0pO1xufVxuXG5cbmZ1bmN0aW9uIHN0cmluZ2lmeShvYmo6IGFueSwgcmVwbGFjZXI6IEpTT05TdHJpbmdpZnlSZXBsYWNlciB8IG51bGwpOiBzdHJpbmcge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkob2JqLCA8KGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiBhbnk+cmVwbGFjZXIpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVVUklSZXBsYWNlcih0cmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCk6IEpTT05TdHJpbmdpZnlSZXBsYWNlciB8IG51bGwge1xuXHRpZiAoIXRyYW5zZm9ybWVyKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0cmV0dXJuIChrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IGFueSA9PiB7XG5cdFx0aWYgKHZhbHVlICYmIHZhbHVlLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5VcmkpIHtcblx0XHRcdHJldHVybiB0cmFuc2Zvcm1lci50cmFuc2Zvcm1PdXRnb2luZyh2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUmVxdWVzdEluaXRpYXRvciB7XG5cdExvY2FsU2lkZSA9IDAsXG5cdE90aGVyU2lkZSA9IDFcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUmVzcG9uc2l2ZVN0YXRlIHtcblx0UmVzcG9uc2l2ZSA9IDAsXG5cdFVucmVzcG9uc2l2ZSA9IDFcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUlBDUHJvdG9jb2xMb2dnZXIge1xuXHRsb2dJbmNvbWluZyhtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcsIGRhdGE/OiBhbnkpOiB2b2lkO1xuXHRsb2dPdXRnb2luZyhtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIGluaXRpYXRvcjogUmVxdWVzdEluaXRpYXRvciwgc3RyOiBzdHJpbmcsIGRhdGE/OiBhbnkpOiB2b2lkO1xufVxuXG5jb25zdCBub29wID0gKCkgPT4geyB9O1xuXG5jb25zdCBfUlBDUHJvdG9jb2xTeW1ib2wgPSBTeW1ib2wuZm9yKCdycGNQcm90b2NvbCcpO1xuY29uc3QgX1JQQ1Byb3h5U3ltYm9sID0gU3ltYm9sLmZvcigncnBjUHJveHknKTtcblxuZXhwb3J0IGNsYXNzIFJQQ1Byb3RvY29sIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElSUENQcm90b2NvbCB7XG5cblx0W19SUENQcm90b2NvbFN5bWJvbF0gPSB0cnVlO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVOUkVTUE9OU0lWRV9USU1FID0gMyAqIDEwMDA7IC8vIDNzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZXNwb25zaXZlU3RhdGU6IEVtaXR0ZXI8UmVzcG9uc2l2ZVN0YXRlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFJlc3BvbnNpdmVTdGF0ZT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVJlc3BvbnNpdmVTdGF0ZTogRXZlbnQ8UmVzcG9uc2l2ZVN0YXRlPiA9IHRoaXMuX29uRGlkQ2hhbmdlUmVzcG9uc2l2ZVN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbDtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyOiBJUlBDUHJvdG9jb2xMb2dnZXIgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXJpUmVwbGFjZXI6IEpTT05TdHJpbmdpZnlSZXBsYWNlciB8IG51bGw7XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsczogYW55W107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3hpZXM6IGFueVtdO1xuXHRwcml2YXRlIF9sYXN0TWVzc2FnZUlkOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbmNlbEludm9rZWRIYW5kbGVyczogeyBbcmVxOiBzdHJpbmddOiAoKSA9PiB2b2lkIH07XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdSUENSZXBsaWVzOiB7IFttc2dJZDogc3RyaW5nXTogUGVuZGluZ1JQQ1JlcGx5IH07XG5cdHByaXZhdGUgX3Jlc3BvbnNpdmVTdGF0ZTogUmVzcG9uc2l2ZVN0YXRlO1xuXHRwcml2YXRlIF91bmFja25vd2xlZGdlZENvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgX3VucmVzcG9uc2l2ZVRpbWU6IG51bWJlcjtcblx0cHJpdmF0ZSBfYXN5bmNDaGVja1VyZXNwb25zaXZlOiBSdW5PbmNlU2NoZWR1bGVyO1xuXG5cdGNvbnN0cnVjdG9yKHByb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCwgbG9nZ2VyOiBJUlBDUHJvdG9jb2xMb2dnZXIgfCBudWxsID0gbnVsbCwgdHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lciB8IG51bGwgPSBudWxsKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm90b2NvbCA9IHByb3RvY29sO1xuXHRcdHRoaXMuX2xvZ2dlciA9IGxvZ2dlcjtcblx0XHR0aGlzLl91cmlUcmFuc2Zvcm1lciA9IHRyYW5zZm9ybWVyO1xuXHRcdHRoaXMuX3VyaVJlcGxhY2VyID0gY3JlYXRlVVJJUmVwbGFjZXIodGhpcy5fdXJpVHJhbnNmb3JtZXIpO1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9sb2NhbHMgPSBbXTtcblx0XHR0aGlzLl9wcm94aWVzID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IFByb3h5SWRlbnRpZmllci5jb3VudDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHR0aGlzLl9sb2NhbHNbaV0gPSBudWxsO1xuXHRcdFx0dGhpcy5fcHJveGllc1tpXSA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RNZXNzYWdlSWQgPSAwO1xuXHRcdHRoaXMuX2NhbmNlbEludm9rZWRIYW5kbGVycyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXMgPSB7fTtcblx0XHR0aGlzLl9yZXNwb25zaXZlU3RhdGUgPSBSZXNwb25zaXZlU3RhdGUuUmVzcG9uc2l2ZTtcblx0XHR0aGlzLl91bmFja25vd2xlZGdlZENvdW50ID0gMDtcblx0XHR0aGlzLl91bnJlc3BvbnNpdmVUaW1lID0gMDtcblx0XHR0aGlzLl9hc3luY0NoZWNrVXJlc3BvbnNpdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9jaGVja1VucmVzcG9uc2l2ZSgpLCAxMDAwKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvdG9jb2wub25NZXNzYWdlKChtc2cpID0+IHRoaXMuX3JlY2VpdmVPbmVNZXNzYWdlKG1zZykpKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXG5cdFx0Ly8gUmVsZWFzZSBhbGwgb3V0c3RhbmRpbmcgcHJvbWlzZXMgd2l0aCBhIGNhbmNlbGVkIGVycm9yXG5cdFx0T2JqZWN0LmtleXModGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXMpLmZvckVhY2goKG1zZ0lkKSA9PiB7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXNbbXNnSWRdO1xuXHRcdFx0ZGVsZXRlIHRoaXMuX3BlbmRpbmdSUENSZXBsaWVzW21zZ0lkXTtcblx0XHRcdHBlbmRpbmcucmVzb2x2ZUVycihlcnJvcnMuY2FuY2VsZWQoKSk7XG5cdFx0fSk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgZHJhaW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9wcm90b2NvbC5kcmFpbiA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Byb3RvY29sLmRyYWluKCk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uV2lsbFNlbmRSZXF1ZXN0KHJlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3VuYWNrbm93bGVkZ2VkQ291bnQgPT09IDApIHtcblx0XHRcdC8vIFNpbmNlIHRoaXMgaXMgdGhlIGZpcnN0IHJlcXVlc3Qgd2UgYXJlIHNlbmRpbmcgaW4gYSB3aGlsZSxcblx0XHRcdC8vIG1hcmsgdGhpcyBtb21lbnQgYXMgdGhlIHN0YXJ0IGZvciB0aGUgY291bnRkb3duIHRvIHVucmVzcG9uc2l2ZSB0aW1lXG5cdFx0XHR0aGlzLl91bnJlc3BvbnNpdmVUaW1lID0gRGF0ZS5ub3coKSArIFJQQ1Byb3RvY29sLlVOUkVTUE9OU0lWRV9USU1FO1xuXHRcdH1cblx0XHR0aGlzLl91bmFja25vd2xlZGdlZENvdW50Kys7XG5cdFx0aWYgKCF0aGlzLl9hc3luY0NoZWNrVXJlc3BvbnNpdmUuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0dGhpcy5fYXN5bmNDaGVja1VyZXNwb25zaXZlLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRSZWNlaXZlQWNrbm93bGVkZ2UocmVxOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBUaGUgbmV4dCBwb3NzaWJsZSB1bnJlc3BvbnNpdmUgdGltZSBpcyBub3cgKyBkZWx0YS5cblx0XHR0aGlzLl91bnJlc3BvbnNpdmVUaW1lID0gRGF0ZS5ub3coKSArIFJQQ1Byb3RvY29sLlVOUkVTUE9OU0lWRV9USU1FO1xuXHRcdHRoaXMuX3VuYWNrbm93bGVkZ2VkQ291bnQtLTtcblx0XHRpZiAodGhpcy5fdW5hY2tub3dsZWRnZWRDb3VudCA9PT0gMCkge1xuXHRcdFx0Ly8gTm8gbW9yZSBuZWVkIHRvIGNoZWNrIGZvciB1bnJlc3BvbnNpdmVcblx0XHRcdHRoaXMuX2FzeW5jQ2hlY2tVcmVzcG9uc2l2ZS5jYW5jZWwoKTtcblx0XHR9XG5cdFx0Ly8gVGhlIGV4dCBob3N0IGlzIHJlc3BvbnNpdmUhXG5cdFx0dGhpcy5fc2V0UmVzcG9uc2l2ZVN0YXRlKFJlc3BvbnNpdmVTdGF0ZS5SZXNwb25zaXZlKTtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrVW5yZXNwb25zaXZlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl91bmFja25vd2xlZGdlZENvdW50ID09PSAwKSB7XG5cdFx0XHQvLyBOb3Qgd2FpdGluZyBmb3IgYW55dGhpbmcgPT4gY2Fubm90IHNheSBpZiBpdCBpcyByZXNwb25zaXZlIG9yIG5vdFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChEYXRlLm5vdygpID4gdGhpcy5fdW5yZXNwb25zaXZlVGltZSkge1xuXHRcdFx0Ly8gVW5yZXNwb25zaXZlISFcblx0XHRcdHRoaXMuX3NldFJlc3BvbnNpdmVTdGF0ZShSZXNwb25zaXZlU3RhdGUuVW5yZXNwb25zaXZlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm90ICh5ZXQpIHVucmVzcG9uc2l2ZSwgYmUgc3VyZSB0byBjaGVjayBhZ2FpbiBzb29uXG5cdFx0XHR0aGlzLl9hc3luY0NoZWNrVXJlc3BvbnNpdmUuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRSZXNwb25zaXZlU3RhdGUobmV3UmVzcG9uc2l2ZVN0YXRlOiBSZXNwb25zaXZlU3RhdGUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVzcG9uc2l2ZVN0YXRlID09PSBuZXdSZXNwb25zaXZlU3RhdGUpIHtcblx0XHRcdC8vIG5vIGNoYW5nZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNwb25zaXZlU3RhdGUgPSBuZXdSZXNwb25zaXZlU3RhdGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXNwb25zaXZlU3RhdGUuZmlyZSh0aGlzLl9yZXNwb25zaXZlU3RhdGUpO1xuXHR9XG5cblx0cHVibGljIGdldCByZXNwb25zaXZlU3RhdGUoKTogUmVzcG9uc2l2ZVN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzcG9uc2l2ZVN0YXRlO1xuXHR9XG5cblx0cHVibGljIHRyYW5zZm9ybUluY29taW5nVVJJczxUPihvYmo6IFQpOiBUIHtcblx0XHRpZiAoIXRoaXMuX3VyaVRyYW5zZm9ybWVyKSB7XG5cdFx0XHRyZXR1cm4gb2JqO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJhbnNmb3JtSW5jb21pbmdVUklzKG9iaiwgdGhpcy5fdXJpVHJhbnNmb3JtZXIpO1xuXHR9XG5cblx0cHVibGljIGdldFByb3h5PFQ+KGlkZW50aWZpZXI6IFByb3h5SWRlbnRpZmllcjxUPik6IFByb3hpZWQ8VD4ge1xuXHRcdGNvbnN0IHsgbmlkOiBycGNJZCwgc2lkIH0gPSBpZGVudGlmaWVyO1xuXHRcdGlmICghdGhpcy5fcHJveGllc1tycGNJZF0pIHtcblx0XHRcdHRoaXMuX3Byb3hpZXNbcnBjSWRdID0gdGhpcy5fY3JlYXRlUHJveHkocnBjSWQsIHNpZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94aWVzW3JwY0lkXTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVByb3h5PFQ+KHJwY0lkOiBudW1iZXIsIGRlYnVnTmFtZTogc3RyaW5nKTogVCB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IHtcblx0XHRcdGdldDogKHRhcmdldDogYW55LCBuYW1lOiBQcm9wZXJ0eUtleSkgPT4ge1xuXHRcdFx0XHRpZiAodHlwZW9mIG5hbWUgPT09ICdzdHJpbmcnICYmICF0YXJnZXRbbmFtZV0gJiYgbmFtZS5jaGFyQ29kZUF0KDApID09PSBDaGFyQ29kZS5Eb2xsYXJTaWduKSB7XG5cdFx0XHRcdFx0dGFyZ2V0W25hbWVdID0gKC4uLm15QXJnczogYW55W10pID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZW1vdGVDYWxsKHJwY0lkLCBuYW1lLCBteUFyZ3MpO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5hbWUgPT09IF9SUENQcm94eVN5bWJvbCkge1xuXHRcdFx0XHRcdHJldHVybiBkZWJ1Z05hbWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRhcmdldFtuYW1lXTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHJldHVybiBuZXcgUHJveHkoT2JqZWN0LmNyZWF0ZShudWxsKSwgaGFuZGxlcik7XG5cdH1cblxuXHRwdWJsaWMgc2V0PFQsIFIgZXh0ZW5kcyBUPihpZGVudGlmaWVyOiBQcm94eUlkZW50aWZpZXI8VD4sIHZhbHVlOiBSKTogUiB7XG5cdFx0dGhpcy5fbG9jYWxzW2lkZW50aWZpZXIubmlkXSA9IHZhbHVlO1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBhc3NlcnRSZWdpc3RlcmVkKGlkZW50aWZpZXJzOiBQcm94eUlkZW50aWZpZXI8YW55PltdKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGlkZW50aWZpZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBpZGVudGlmaWVyID0gaWRlbnRpZmllcnNbaV07XG5cdFx0XHRpZiAoIXRoaXMuX2xvY2Fsc1tpZGVudGlmaWVyLm5pZF0pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIHByb3h5IGluc3RhbmNlICR7aWRlbnRpZmllci5zaWR9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjZWl2ZU9uZU1lc3NhZ2UocmF3bXNnOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbXNnTGVuZ3RoID0gcmF3bXNnLmJ5dGVMZW5ndGg7XG5cdFx0Y29uc3QgYnVmZiA9IE1lc3NhZ2VCdWZmZXIucmVhZChyYXdtc2csIDApO1xuXHRcdGNvbnN0IG1lc3NhZ2VUeXBlID0gPE1lc3NhZ2VUeXBlPmJ1ZmYucmVhZFVJbnQ4KCk7XG5cdFx0Y29uc3QgcmVxID0gYnVmZi5yZWFkVUludDMyKCk7XG5cblx0XHRzd2l0Y2ggKG1lc3NhZ2VUeXBlKSB7XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcXVlc3RKU09OQXJnczpcblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVxdWVzdEpTT05BcmdzV2l0aENhbmNlbGxhdGlvbjoge1xuXHRcdFx0XHRsZXQgeyBycGNJZCwgbWV0aG9kLCBhcmdzIH0gPSBNZXNzYWdlSU8uZGVzZXJpYWxpemVSZXF1ZXN0SlNPTkFyZ3MoYnVmZik7XG5cdFx0XHRcdGlmICh0aGlzLl91cmlUcmFuc2Zvcm1lcikge1xuXHRcdFx0XHRcdGFyZ3MgPSB0cmFuc2Zvcm1JbmNvbWluZ1VSSXMoYXJncywgdGhpcy5fdXJpVHJhbnNmb3JtZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3JlY2VpdmVSZXF1ZXN0KG1zZ0xlbmd0aCwgcmVxLCBycGNJZCwgbWV0aG9kLCBhcmdzLCAobWVzc2FnZVR5cGUgPT09IE1lc3NhZ2VUeXBlLlJlcXVlc3RKU09OQXJnc1dpdGhDYW5jZWxsYXRpb24pKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcXVlc3RNaXhlZEFyZ3M6XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcXVlc3RNaXhlZEFyZ3NXaXRoQ2FuY2VsbGF0aW9uOiB7XG5cdFx0XHRcdGxldCB7IHJwY0lkLCBtZXRob2QsIGFyZ3MgfSA9IE1lc3NhZ2VJTy5kZXNlcmlhbGl6ZVJlcXVlc3RNaXhlZEFyZ3MoYnVmZik7XG5cdFx0XHRcdGlmICh0aGlzLl91cmlUcmFuc2Zvcm1lcikge1xuXHRcdFx0XHRcdGFyZ3MgPSB0cmFuc2Zvcm1JbmNvbWluZ1VSSXMoYXJncywgdGhpcy5fdXJpVHJhbnNmb3JtZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3JlY2VpdmVSZXF1ZXN0KG1zZ0xlbmd0aCwgcmVxLCBycGNJZCwgbWV0aG9kLCBhcmdzLCAobWVzc2FnZVR5cGUgPT09IE1lc3NhZ2VUeXBlLlJlcXVlc3RNaXhlZEFyZ3NXaXRoQ2FuY2VsbGF0aW9uKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5BY2tub3dsZWRnZWQ6IHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyPy5sb2dJbmNvbWluZyhtc2dMZW5ndGgsIHJlcSwgUmVxdWVzdEluaXRpYXRvci5Mb2NhbFNpZGUsIGBhY2tgKTtcblx0XHRcdFx0dGhpcy5fb25EaWRSZWNlaXZlQWNrbm93bGVkZ2UocmVxKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLkNhbmNlbDoge1xuXHRcdFx0XHR0aGlzLl9yZWNlaXZlQ2FuY2VsKG1zZ0xlbmd0aCwgcmVxKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcGx5T0tFbXB0eToge1xuXHRcdFx0XHR0aGlzLl9yZWNlaXZlUmVwbHkobXNnTGVuZ3RoLCByZXEsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5SZXBseU9LSlNPTjoge1xuXHRcdFx0XHRsZXQgdmFsdWUgPSBNZXNzYWdlSU8uZGVzZXJpYWxpemVSZXBseU9LSlNPTihidWZmKTtcblx0XHRcdFx0aWYgKHRoaXMuX3VyaVRyYW5zZm9ybWVyKSB7XG5cdFx0XHRcdFx0dmFsdWUgPSB0cmFuc2Zvcm1JbmNvbWluZ1VSSXModmFsdWUsIHRoaXMuX3VyaVRyYW5zZm9ybWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9yZWNlaXZlUmVwbHkobXNnTGVuZ3RoLCByZXEsIHZhbHVlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcGx5T0tKU09OV2l0aEJ1ZmZlcnM6IHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBNZXNzYWdlSU8uZGVzZXJpYWxpemVSZXBseU9LSlNPTldpdGhCdWZmZXJzKGJ1ZmYsIHRoaXMuX3VyaVRyYW5zZm9ybWVyKTtcblx0XHRcdFx0dGhpcy5fcmVjZWl2ZVJlcGx5KG1zZ0xlbmd0aCwgcmVxLCB2YWx1ZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5SZXBseU9LVlNCdWZmZXI6IHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBNZXNzYWdlSU8uZGVzZXJpYWxpemVSZXBseU9LVlNCdWZmZXIoYnVmZik7XG5cdFx0XHRcdHRoaXMuX3JlY2VpdmVSZXBseShtc2dMZW5ndGgsIHJlcSwgdmFsdWUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVwbHlFcnJFcnJvcjoge1xuXHRcdFx0XHRsZXQgZXJyID0gTWVzc2FnZUlPLmRlc2VyaWFsaXplUmVwbHlFcnJFcnJvcihidWZmKTtcblx0XHRcdFx0aWYgKHRoaXMuX3VyaVRyYW5zZm9ybWVyKSB7XG5cdFx0XHRcdFx0ZXJyID0gdHJhbnNmb3JtSW5jb21pbmdVUklzKGVyciwgdGhpcy5fdXJpVHJhbnNmb3JtZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3JlY2VpdmVSZXBseUVycihtc2dMZW5ndGgsIHJlcSwgZXJyKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlJlcGx5RXJyRW1wdHk6IHtcblx0XHRcdFx0dGhpcy5fcmVjZWl2ZVJlcGx5RXJyKG1zZ0xlbmd0aCwgcmVxLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYHJlY2VpdmVkIHVuZXhwZWN0ZWQgbWVzc2FnZWApO1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKHJhd21zZyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjZWl2ZVJlcXVlc3QobXNnTGVuZ3RoOiBudW1iZXIsIHJlcTogbnVtYmVyLCBycGNJZDogbnVtYmVyLCBtZXRob2Q6IHN0cmluZywgYXJnczogYW55W10sIHVzZXNDYW5jZWxsYXRpb25Ub2tlbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlcj8ubG9nSW5jb21pbmcobXNnTGVuZ3RoLCByZXEsIFJlcXVlc3RJbml0aWF0b3IuT3RoZXJTaWRlLCBgcmVjZWl2ZVJlcXVlc3QgJHtnZXRTdHJpbmdJZGVudGlmaWVyRm9yUHJveHkocnBjSWQpfS4ke21ldGhvZH0oYCwgYXJncyk7XG5cdFx0Y29uc3QgY2FsbElkID0gU3RyaW5nKHJlcSk7XG5cblx0XHRsZXQgcHJvbWlzZTogUHJvbWlzZTxhbnk+O1xuXHRcdGxldCBjYW5jZWw6ICgpID0+IHZvaWQ7XG5cdFx0aWYgKHVzZXNDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGFyZ3MucHVzaChjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbik7XG5cdFx0XHRwcm9taXNlID0gdGhpcy5faW52b2tlSGFuZGxlcihycGNJZCwgbWV0aG9kLCBhcmdzKTtcblx0XHRcdGNhbmNlbCA9ICgpID0+IGNhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBjYW5ub3QgYmUgY2FuY2VsbGVkXG5cdFx0XHRwcm9taXNlID0gdGhpcy5faW52b2tlSGFuZGxlcihycGNJZCwgbWV0aG9kLCBhcmdzKTtcblx0XHRcdGNhbmNlbCA9IG5vb3A7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2FuY2VsSW52b2tlZEhhbmRsZXJzW2NhbGxJZF0gPSBjYW5jZWw7XG5cblx0XHQvLyBBY2tub3dsZWRnZSB0aGUgcmVxdWVzdFxuXHRcdGNvbnN0IG1zZyA9IE1lc3NhZ2VJTy5zZXJpYWxpemVBY2tub3dsZWRnZWQocmVxKTtcblx0XHR0aGlzLl9sb2dnZXI/LmxvZ091dGdvaW5nKG1zZy5ieXRlTGVuZ3RoLCByZXEsIFJlcXVlc3RJbml0aWF0b3IuT3RoZXJTaWRlLCBgYWNrYCk7XG5cdFx0dGhpcy5fcHJvdG9jb2wuc2VuZChtc2cpO1xuXG5cdFx0cHJvbWlzZS50aGVuKChyKSA9PiB7XG5cdFx0XHRkZWxldGUgdGhpcy5fY2FuY2VsSW52b2tlZEhhbmRsZXJzW2NhbGxJZF07XG5cdFx0XHRjb25zdCBtc2cgPSBNZXNzYWdlSU8uc2VyaWFsaXplUmVwbHlPSyhyZXEsIHIsIHRoaXMuX3VyaVJlcGxhY2VyKTtcblx0XHRcdHRoaXMuX2xvZ2dlcj8ubG9nT3V0Z29pbmcobXNnLmJ5dGVMZW5ndGgsIHJlcSwgUmVxdWVzdEluaXRpYXRvci5PdGhlclNpZGUsIGByZXBseTpgLCByKTtcblx0XHRcdHRoaXMuX3Byb3RvY29sLnNlbmQobXNnKTtcblx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRkZWxldGUgdGhpcy5fY2FuY2VsSW52b2tlZEhhbmRsZXJzW2NhbGxJZF07XG5cdFx0XHRjb25zdCBtc2cgPSBNZXNzYWdlSU8uc2VyaWFsaXplUmVwbHlFcnIocmVxLCBlcnIpO1xuXHRcdFx0dGhpcy5fbG9nZ2VyPy5sb2dPdXRnb2luZyhtc2cuYnl0ZUxlbmd0aCwgcmVxLCBSZXF1ZXN0SW5pdGlhdG9yLk90aGVyU2lkZSwgYHJlcGx5RXJyOmAsIGVycik7XG5cdFx0XHR0aGlzLl9wcm90b2NvbC5zZW5kKG1zZyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNlaXZlQ2FuY2VsKG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlcj8ubG9nSW5jb21pbmcobXNnTGVuZ3RoLCByZXEsIFJlcXVlc3RJbml0aWF0b3IuT3RoZXJTaWRlLCBgcmVjZWl2ZUNhbmNlbGApO1xuXHRcdGNvbnN0IGNhbGxJZCA9IFN0cmluZyhyZXEpO1xuXHRcdHRoaXMuX2NhbmNlbEludm9rZWRIYW5kbGVyc1tjYWxsSWRdPy4oKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY2VpdmVSZXBseShtc2dMZW5ndGg6IG51bWJlciwgcmVxOiBudW1iZXIsIHZhbHVlOiBhbnkpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXI/LmxvZ0luY29taW5nKG1zZ0xlbmd0aCwgcmVxLCBSZXF1ZXN0SW5pdGlhdG9yLkxvY2FsU2lkZSwgYHJlY2VpdmVSZXBseTpgLCB2YWx1ZSk7XG5cdFx0Y29uc3QgY2FsbElkID0gU3RyaW5nKHJlcSk7XG5cdFx0aWYgKCF0aGlzLl9wZW5kaW5nUlBDUmVwbGllcy5oYXNPd25Qcm9wZXJ0eShjYWxsSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ1JlcGx5ID0gdGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXNbY2FsbElkXTtcblx0XHRkZWxldGUgdGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXNbY2FsbElkXTtcblxuXHRcdHBlbmRpbmdSZXBseS5yZXNvbHZlT2sodmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjZWl2ZVJlcGx5RXJyKG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlciwgdmFsdWU6IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlcj8ubG9nSW5jb21pbmcobXNnTGVuZ3RoLCByZXEsIFJlcXVlc3RJbml0aWF0b3IuTG9jYWxTaWRlLCBgcmVjZWl2ZVJlcGx5RXJyOmAsIHZhbHVlKTtcblxuXHRcdGNvbnN0IGNhbGxJZCA9IFN0cmluZyhyZXEpO1xuXHRcdGlmICghdGhpcy5fcGVuZGluZ1JQQ1JlcGxpZXMuaGFzT3duUHJvcGVydHkoY2FsbElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdSZXBseSA9IHRoaXMuX3BlbmRpbmdSUENSZXBsaWVzW2NhbGxJZF07XG5cdFx0ZGVsZXRlIHRoaXMuX3BlbmRpbmdSUENSZXBsaWVzW2NhbGxJZF07XG5cblx0XHRsZXQgZXJyOiBhbnkgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRpZiAodmFsdWUuJGlzRXJyb3IpIHtcblx0XHRcdFx0ZXJyID0gbmV3IEVycm9yKCk7XG5cdFx0XHRcdGVyci5uYW1lID0gdmFsdWUubmFtZTtcblx0XHRcdFx0ZXJyLm1lc3NhZ2UgPSB2YWx1ZS5tZXNzYWdlO1xuXHRcdFx0XHRlcnIuc3RhY2sgPSB2YWx1ZS5zdGFjaztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVyciA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRwZW5kaW5nUmVwbHkucmVzb2x2ZUVycihlcnIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52b2tlSGFuZGxlcihycGNJZDogbnVtYmVyLCBtZXRob2ROYW1lOiBzdHJpbmcsIGFyZ3M6IGFueVtdKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9kb0ludm9rZUhhbmRsZXIocnBjSWQsIG1ldGhvZE5hbWUsIGFyZ3MpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RvSW52b2tlSGFuZGxlcihycGNJZDogbnVtYmVyLCBtZXRob2ROYW1lOiBzdHJpbmcsIGFyZ3M6IGFueVtdKTogYW55IHtcblx0XHRjb25zdCBhY3RvciA9IHRoaXMuX2xvY2Fsc1tycGNJZF07XG5cdFx0aWYgKCFhY3Rvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGFjdG9yICcgKyBnZXRTdHJpbmdJZGVudGlmaWVyRm9yUHJveHkocnBjSWQpKTtcblx0XHR9XG5cdFx0Y29uc3QgbWV0aG9kID0gYWN0b3JbbWV0aG9kTmFtZV07XG5cdFx0aWYgKHR5cGVvZiBtZXRob2QgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBtZXRob2QgJyArIG1ldGhvZE5hbWUgKyAnIG9uIGFjdG9yICcgKyBnZXRTdHJpbmdJZGVudGlmaWVyRm9yUHJveHkocnBjSWQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1ldGhvZC5hcHBseShhY3RvciwgYXJncyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdGVDYWxsKHJwY0lkOiBudW1iZXIsIG1ldGhvZE5hbWU6IHN0cmluZywgYXJnczogYW55W10pOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gbmV3IENhbmNlbGVkTGF6eVByb21pc2UoKTtcblx0XHR9XG5cdFx0bGV0IGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChhcmdzLmxlbmd0aCA+IDAgJiYgQ2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbihhcmdzW2FyZ3MubGVuZ3RoIC0gMV0pKSB7XG5cdFx0XHRjYW5jZWxsYXRpb25Ub2tlbiA9IGFyZ3MucG9wKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuICYmIGNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHQvLyBObyBuZWVkIHRvIGRvIGFueXRoaW5nLi4uXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3Q8YW55PihlcnJvcnMuY2FuY2VsZWQoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudHMgPSBNZXNzYWdlSU8uc2VyaWFsaXplUmVxdWVzdEFyZ3VtZW50cyhhcmdzLCB0aGlzLl91cmlSZXBsYWNlcik7XG5cblx0XHRjb25zdCByZXEgPSArK3RoaXMuX2xhc3RNZXNzYWdlSWQ7XG5cdFx0Y29uc3QgY2FsbElkID0gU3RyaW5nKHJlcSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IExhenlQcm9taXNlKCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0ZGlzcG9zYWJsZS5hZGQoY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtc2cgPSBNZXNzYWdlSU8uc2VyaWFsaXplQ2FuY2VsKHJlcSk7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlcj8ubG9nT3V0Z29pbmcobXNnLmJ5dGVMZW5ndGgsIHJlcSwgUmVxdWVzdEluaXRpYXRvci5Mb2NhbFNpZGUsIGBjYW5jZWxgKTtcblx0XHRcdFx0dGhpcy5fcHJvdG9jb2wuc2VuZChtc2cpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BlbmRpbmdSUENSZXBsaWVzW2NhbGxJZF0gPSBuZXcgUGVuZGluZ1JQQ1JlcGx5KHJlc3VsdCwgZGlzcG9zYWJsZSk7XG5cdFx0dGhpcy5fb25XaWxsU2VuZFJlcXVlc3QocmVxKTtcblx0XHRjb25zdCBtc2cgPSBNZXNzYWdlSU8uc2VyaWFsaXplUmVxdWVzdChyZXEsIHJwY0lkLCBtZXRob2ROYW1lLCBzZXJpYWxpemVkUmVxdWVzdEFyZ3VtZW50cywgISFjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0dGhpcy5fbG9nZ2VyPy5sb2dPdXRnb2luZyhtc2cuYnl0ZUxlbmd0aCwgcmVxLCBSZXF1ZXN0SW5pdGlhdG9yLkxvY2FsU2lkZSwgYHJlcXVlc3Q6ICR7Z2V0U3RyaW5nSWRlbnRpZmllckZvclByb3h5KHJwY0lkKX0uJHttZXRob2ROYW1lfShgLCBhcmdzKTtcblx0XHR0aGlzLl9wcm90b2NvbC5zZW5kKG1zZyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBQZW5kaW5nUlBDUmVwbHkge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9taXNlOiBMYXp5UHJvbWlzZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlOiBJRGlzcG9zYWJsZVxuXHQpIHsgfVxuXG5cdHB1YmxpYyByZXNvbHZlT2sodmFsdWU6IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb21pc2UucmVzb2x2ZU9rKHZhbHVlKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlRXJyKGVycjogYW55KTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvbWlzZS5yZXNvbHZlRXJyKGVycik7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTWVzc2FnZUJ1ZmZlciB7XG5cblx0cHVibGljIHN0YXRpYyBhbGxvYyh0eXBlOiBNZXNzYWdlVHlwZSwgcmVxOiBudW1iZXIsIG1lc3NhZ2VTaXplOiBudW1iZXIpOiBNZXNzYWdlQnVmZmVyIHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWVzc2FnZUJ1ZmZlcihWU0J1ZmZlci5hbGxvYyhtZXNzYWdlU2l6ZSArIDEgLyogdHlwZSAqLyArIDQgLyogcmVxICovKSwgMCk7XG5cdFx0cmVzdWx0LndyaXRlVUludDgodHlwZSk7XG5cdFx0cmVzdWx0LndyaXRlVUludDMyKHJlcSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZChidWZmOiBWU0J1ZmZlciwgb2Zmc2V0OiBudW1iZXIpOiBNZXNzYWdlQnVmZmVyIHtcblx0XHRyZXR1cm4gbmV3IE1lc3NhZ2VCdWZmZXIoYnVmZiwgb2Zmc2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX2J1ZmY6IFZTQnVmZmVyO1xuXHRwcml2YXRlIF9vZmZzZXQ6IG51bWJlcjtcblxuXHRwdWJsaWMgZ2V0IGJ1ZmZlcigpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmY7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKGJ1ZmY6IFZTQnVmZmVyLCBvZmZzZXQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2J1ZmYgPSBidWZmO1xuXHRcdHRoaXMuX29mZnNldCA9IG9mZnNldDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2l6ZVVJbnQ4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDE7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHNpemVVSW50MzIgPSA0O1xuXG5cdHB1YmxpYyB3cml0ZVVJbnQ4KG46IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2J1ZmYud3JpdGVVSW50OChuLCB0aGlzLl9vZmZzZXQpOyB0aGlzLl9vZmZzZXQgKz0gMTtcblx0fVxuXG5cdHB1YmxpYyByZWFkVUludDgoKTogbnVtYmVyIHtcblx0XHRjb25zdCBuID0gdGhpcy5fYnVmZi5yZWFkVUludDgodGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IDE7XG5cdFx0cmV0dXJuIG47XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVVSW50MzIobjogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYnVmZi53cml0ZVVJbnQzMkJFKG4sIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSA0O1xuXHR9XG5cblx0cHVibGljIHJlYWRVSW50MzIoKTogbnVtYmVyIHtcblx0XHRjb25zdCBuID0gdGhpcy5fYnVmZi5yZWFkVUludDMyQkUodGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IDQ7XG5cdFx0cmV0dXJuIG47XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNpemVTaG9ydFN0cmluZyhzdHI6IFZTQnVmZmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMSAvKiBzdHJpbmcgbGVuZ3RoICovICsgc3RyLmJ5dGVMZW5ndGggLyogYWN0dWFsIHN0cmluZyAqLztcblx0fVxuXG5cdHB1YmxpYyB3cml0ZVNob3J0U3RyaW5nKHN0cjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9idWZmLndyaXRlVUludDgoc3RyLmJ5dGVMZW5ndGgsIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSAxO1xuXHRcdHRoaXMuX2J1ZmYuc2V0KHN0ciwgdGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IHN0ci5ieXRlTGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIHJlYWRTaG9ydFN0cmluZygpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0ckJ5dGVMZW5ndGggPSB0aGlzLl9idWZmLnJlYWRVSW50OCh0aGlzLl9vZmZzZXQpOyB0aGlzLl9vZmZzZXQgKz0gMTtcblx0XHRjb25zdCBzdHJCdWZmID0gdGhpcy5fYnVmZi5zbGljZSh0aGlzLl9vZmZzZXQsIHRoaXMuX29mZnNldCArIHN0ckJ5dGVMZW5ndGgpO1xuXHRcdGNvbnN0IHN0ciA9IHN0ckJ1ZmYudG9TdHJpbmcoKTsgdGhpcy5fb2Zmc2V0ICs9IHN0ckJ5dGVMZW5ndGg7XG5cdFx0cmV0dXJuIHN0cjtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2l6ZUxvbmdTdHJpbmcoc3RyOiBWU0J1ZmZlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIDQgLyogc3RyaW5nIGxlbmd0aCAqLyArIHN0ci5ieXRlTGVuZ3RoIC8qIGFjdHVhbCBzdHJpbmcgKi87XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVMb25nU3RyaW5nKHN0cjogVlNCdWZmZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9idWZmLndyaXRlVUludDMyQkUoc3RyLmJ5dGVMZW5ndGgsIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSA0O1xuXHRcdHRoaXMuX2J1ZmYuc2V0KHN0ciwgdGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IHN0ci5ieXRlTGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIHJlYWRMb25nU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc3RyQnl0ZUxlbmd0aCA9IHRoaXMuX2J1ZmYucmVhZFVJbnQzMkJFKHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSA0O1xuXHRcdGNvbnN0IHN0ckJ1ZmYgPSB0aGlzLl9idWZmLnNsaWNlKHRoaXMuX29mZnNldCwgdGhpcy5fb2Zmc2V0ICsgc3RyQnl0ZUxlbmd0aCk7XG5cdFx0Y29uc3Qgc3RyID0gc3RyQnVmZi50b1N0cmluZygpOyB0aGlzLl9vZmZzZXQgKz0gc3RyQnl0ZUxlbmd0aDtcblx0XHRyZXR1cm4gc3RyO1xuXHR9XG5cblx0cHVibGljIHdyaXRlQnVmZmVyKGJ1ZmY6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYnVmZi53cml0ZVVJbnQzMkJFKGJ1ZmYuYnl0ZUxlbmd0aCwgdGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IDQ7XG5cdFx0dGhpcy5fYnVmZi5zZXQoYnVmZiwgdGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IGJ1ZmYuYnl0ZUxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2l6ZVZTQnVmZmVyKGJ1ZmY6IFZTQnVmZmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gNCAvKiBidWZmZXIgbGVuZ3RoICovICsgYnVmZi5ieXRlTGVuZ3RoIC8qIGFjdHVhbCBidWZmZXIgKi87XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVWU0J1ZmZlcihidWZmOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdHRoaXMuX2J1ZmYud3JpdGVVSW50MzJCRShidWZmLmJ5dGVMZW5ndGgsIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSA0O1xuXHRcdHRoaXMuX2J1ZmYuc2V0KGJ1ZmYsIHRoaXMuX29mZnNldCk7IHRoaXMuX29mZnNldCArPSBidWZmLmJ5dGVMZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgcmVhZFZTQnVmZmVyKCk6IFZTQnVmZmVyIHtcblx0XHRjb25zdCBidWZmTGVuZ3RoID0gdGhpcy5fYnVmZi5yZWFkVUludDMyQkUodGhpcy5fb2Zmc2V0KTsgdGhpcy5fb2Zmc2V0ICs9IDQ7XG5cdFx0Y29uc3QgYnVmZiA9IHRoaXMuX2J1ZmYuc2xpY2UodGhpcy5fb2Zmc2V0LCB0aGlzLl9vZmZzZXQgKyBidWZmTGVuZ3RoKTsgdGhpcy5fb2Zmc2V0ICs9IGJ1ZmZMZW5ndGg7XG5cdFx0cmV0dXJuIGJ1ZmY7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNpemVNaXhlZEFycmF5KGFycjogcmVhZG9ubHkgTWl4ZWRBcmdbXSk6IG51bWJlciB7XG5cdFx0bGV0IHNpemUgPSAwO1xuXHRcdHNpemUgKz0gMTsgLy8gYXJyIGxlbmd0aFxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhcnIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGVsID0gYXJyW2ldO1xuXHRcdFx0c2l6ZSArPSAxOyAvLyBhcmcgdHlwZVxuXHRcdFx0c3dpdGNoIChlbC50eXBlKSB7XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5TdHJpbmc6XG5cdFx0XHRcdFx0c2l6ZSArPSB0aGlzLnNpemVMb25nU3RyaW5nKGVsLnZhbHVlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBcmdUeXBlLlZTQnVmZmVyOlxuXHRcdFx0XHRcdHNpemUgKz0gdGhpcy5zaXplVlNCdWZmZXIoZWwudmFsdWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEFyZ1R5cGUuU2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzOlxuXHRcdFx0XHRcdHNpemUgKz0gdGhpcy5zaXplVUludDMyOyAvLyBidWZmZXIgY291bnRcblx0XHRcdFx0XHRzaXplICs9IHRoaXMuc2l6ZUxvbmdTdHJpbmcoZWwudmFsdWUpO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWwuYnVmZmVycy5sZW5ndGg7ICsraSkge1xuXHRcdFx0XHRcdFx0c2l6ZSArPSB0aGlzLnNpemVWU0J1ZmZlcihlbC5idWZmZXJzW2ldKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5VbmRlZmluZWQ6XG5cdFx0XHRcdFx0Ly8gZW1wdHkuLi5cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNpemU7XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVNaXhlZEFycmF5KGFycjogcmVhZG9ubHkgTWl4ZWRBcmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2J1ZmYud3JpdGVVSW50OChhcnIubGVuZ3RoLCB0aGlzLl9vZmZzZXQpOyB0aGlzLl9vZmZzZXQgKz0gMTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbCA9IGFycltpXTtcblx0XHRcdHN3aXRjaCAoZWwudHlwZSkge1xuXHRcdFx0XHRjYXNlIEFyZ1R5cGUuU3RyaW5nOlxuXHRcdFx0XHRcdHRoaXMud3JpdGVVSW50OChBcmdUeXBlLlN0cmluZyk7XG5cdFx0XHRcdFx0dGhpcy53cml0ZUxvbmdTdHJpbmcoZWwudmFsdWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEFyZ1R5cGUuVlNCdWZmZXI6XG5cdFx0XHRcdFx0dGhpcy53cml0ZVVJbnQ4KEFyZ1R5cGUuVlNCdWZmZXIpO1xuXHRcdFx0XHRcdHRoaXMud3JpdGVWU0J1ZmZlcihlbC52YWx1ZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5TZXJpYWxpemVkT2JqZWN0V2l0aEJ1ZmZlcnM6XG5cdFx0XHRcdFx0dGhpcy53cml0ZVVJbnQ4KEFyZ1R5cGUuU2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzKTtcblx0XHRcdFx0XHR0aGlzLndyaXRlVUludDMyKGVsLmJ1ZmZlcnMubGVuZ3RoKTtcblx0XHRcdFx0XHR0aGlzLndyaXRlTG9uZ1N0cmluZyhlbC52YWx1ZSk7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbC5idWZmZXJzLmxlbmd0aDsgKytpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLndyaXRlQnVmZmVyKGVsLmJ1ZmZlcnNbaV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBcmdUeXBlLlVuZGVmaW5lZDpcblx0XHRcdFx0XHR0aGlzLndyaXRlVUludDgoQXJnVHlwZS5VbmRlZmluZWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWFkTWl4ZWRBcnJheSgpOiBBcnJheTxzdHJpbmcgfCBWU0J1ZmZlciB8IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPGFueT4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcnJMZW4gPSB0aGlzLl9idWZmLnJlYWRVSW50OCh0aGlzLl9vZmZzZXQpOyB0aGlzLl9vZmZzZXQgKz0gMTtcblx0XHRjb25zdCBhcnI6IEFycmF5PHN0cmluZyB8IFZTQnVmZmVyIHwgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8YW55PiB8IHVuZGVmaW5lZD4gPSBuZXcgQXJyYXkoYXJyTGVuKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFyckxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBhcmdUeXBlID0gPEFyZ1R5cGU+dGhpcy5yZWFkVUludDgoKTtcblx0XHRcdHN3aXRjaCAoYXJnVHlwZSkge1xuXHRcdFx0XHRjYXNlIEFyZ1R5cGUuU3RyaW5nOlxuXHRcdFx0XHRcdGFycltpXSA9IHRoaXMucmVhZExvbmdTdHJpbmcoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBBcmdUeXBlLlZTQnVmZmVyOlxuXHRcdFx0XHRcdGFycltpXSA9IHRoaXMucmVhZFZTQnVmZmVyKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5TZXJpYWxpemVkT2JqZWN0V2l0aEJ1ZmZlcnM6IHtcblx0XHRcdFx0XHRjb25zdCBidWZmZXJDb3VudCA9IHRoaXMucmVhZFVJbnQzMigpO1xuXHRcdFx0XHRcdGNvbnN0IGpzb25TdHJpbmcgPSB0aGlzLnJlYWRMb25nU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29uc3QgYnVmZmVyczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYnVmZmVyQ291bnQ7ICsraSkge1xuXHRcdFx0XHRcdFx0YnVmZmVycy5wdXNoKHRoaXMucmVhZFZTQnVmZmVyKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhcnJbaV0gPSBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMocGFyc2VKc29uQW5kUmVzdG9yZUJ1ZmZlclJlZnMoanNvblN0cmluZywgYnVmZmVycywgbnVsbCkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgQXJnVHlwZS5VbmRlZmluZWQ6XG5cdFx0XHRcdFx0YXJyW2ldID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYXJyO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudFR5cGUge1xuXHRTaW1wbGUsXG5cdE1peGVkLFxufVxuXG50eXBlIFNlcmlhbGl6ZWRSZXF1ZXN0QXJndW1lbnRzID1cblx0fCB7IHJlYWRvbmx5IHR5cGU6IFNlcmlhbGl6ZWRSZXF1ZXN0QXJndW1lbnRUeXBlLlNpbXBsZTsgYXJnczogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IHR5cGU6IFNlcmlhbGl6ZWRSZXF1ZXN0QXJndW1lbnRUeXBlLk1peGVkOyBhcmdzOiBNaXhlZEFyZ1tdIH07XG5cblxuY2xhc3MgTWVzc2FnZUlPIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfdXNlTWl4ZWRBcmdTZXJpYWxpemF0aW9uKGFycjogYW55W10pOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXJyLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoYXJyW2ldIGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXJyW2ldIGluc3RhbmNlb2YgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGFycltpXSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2VyaWFsaXplUmVxdWVzdEFyZ3VtZW50cyhhcmdzOiBhbnlbXSwgcmVwbGFjZXI6IEpTT05TdHJpbmdpZnlSZXBsYWNlciB8IG51bGwpOiBTZXJpYWxpemVkUmVxdWVzdEFyZ3VtZW50cyB7XG5cdFx0aWYgKHRoaXMuX3VzZU1peGVkQXJnU2VyaWFsaXphdGlvbihhcmdzKSkge1xuXHRcdFx0Y29uc3QgbWFzc2FnZWRBcmdzOiBNaXhlZEFyZ1tdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXJncy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBhcmcgPSBhcmdzW2ldO1xuXHRcdFx0XHRpZiAoYXJnIGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHRcdFx0XHRtYXNzYWdlZEFyZ3NbaV0gPSB7IHR5cGU6IEFyZ1R5cGUuVlNCdWZmZXIsIHZhbHVlOiBhcmcgfTtcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgYXJnID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdG1hc3NhZ2VkQXJnc1tpXSA9IHsgdHlwZTogQXJnVHlwZS5VbmRlZmluZWQgfTtcblx0XHRcdFx0fSBlbHNlIGlmIChhcmcgaW5zdGFuY2VvZiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycykge1xuXHRcdFx0XHRcdGNvbnN0IHsganNvblN0cmluZywgcmVmZXJlbmNlZEJ1ZmZlcnMgfSA9IHN0cmluZ2lmeUpzb25XaXRoQnVmZmVyUmVmcyhhcmcudmFsdWUsIHJlcGxhY2VyKTtcblx0XHRcdFx0XHRtYXNzYWdlZEFyZ3NbaV0gPSB7IHR5cGU6IEFyZ1R5cGUuU2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzLCB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhqc29uU3RyaW5nKSwgYnVmZmVyczogcmVmZXJlbmNlZEJ1ZmZlcnMgfTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtYXNzYWdlZEFyZ3NbaV0gPSB7IHR5cGU6IEFyZ1R5cGUuU3RyaW5nLCB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhzdHJpbmdpZnkoYXJnLCByZXBsYWNlcikpIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IFNlcmlhbGl6ZWRSZXF1ZXN0QXJndW1lbnRUeXBlLk1peGVkLFxuXHRcdFx0XHRhcmdzOiBtYXNzYWdlZEFyZ3MsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudFR5cGUuU2ltcGxlLFxuXHRcdFx0YXJnczogc3RyaW5naWZ5KGFyZ3MsIHJlcGxhY2VyKVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNlcmlhbGl6ZVJlcXVlc3QocmVxOiBudW1iZXIsIHJwY0lkOiBudW1iZXIsIG1ldGhvZDogc3RyaW5nLCBzZXJpYWxpemVkQXJnczogU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudHMsIHVzZXNDYW5jZWxsYXRpb25Ub2tlbjogYm9vbGVhbik6IFZTQnVmZmVyIHtcblx0XHRzd2l0Y2ggKHNlcmlhbGl6ZWRBcmdzLnR5cGUpIHtcblx0XHRcdGNhc2UgU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudFR5cGUuU2ltcGxlOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdEpTT05BcmdzKHJlcSwgcnBjSWQsIG1ldGhvZCwgc2VyaWFsaXplZEFyZ3MuYXJncywgdXNlc0NhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdGNhc2UgU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudFR5cGUuTWl4ZWQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXF1ZXN0TWl4ZWRBcmdzKHJlcSwgcnBjSWQsIG1ldGhvZCwgc2VyaWFsaXplZEFyZ3MuYXJncywgdXNlc0NhbmNlbGxhdGlvblRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVxdWVzdEpTT05BcmdzKHJlcTogbnVtYmVyLCBycGNJZDogbnVtYmVyLCBtZXRob2Q6IHN0cmluZywgYXJnczogc3RyaW5nLCB1c2VzQ2FuY2VsbGF0aW9uVG9rZW46IGJvb2xlYW4pOiBWU0J1ZmZlciB7XG5cdFx0Y29uc3QgbWV0aG9kQnVmZiA9IFZTQnVmZmVyLmZyb21TdHJpbmcobWV0aG9kKTtcblx0XHRjb25zdCBhcmdzQnVmZiA9IFZTQnVmZmVyLmZyb21TdHJpbmcoYXJncyk7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplVUludDgoKTtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplU2hvcnRTdHJpbmcobWV0aG9kQnVmZik7XG5cdFx0bGVuICs9IE1lc3NhZ2VCdWZmZXIuc2l6ZUxvbmdTdHJpbmcoYXJnc0J1ZmYpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gTWVzc2FnZUJ1ZmZlci5hbGxvYyh1c2VzQ2FuY2VsbGF0aW9uVG9rZW4gPyBNZXNzYWdlVHlwZS5SZXF1ZXN0SlNPTkFyZ3NXaXRoQ2FuY2VsbGF0aW9uIDogTWVzc2FnZVR5cGUuUmVxdWVzdEpTT05BcmdzLCByZXEsIGxlbik7XG5cdFx0cmVzdWx0LndyaXRlVUludDgocnBjSWQpO1xuXHRcdHJlc3VsdC53cml0ZVNob3J0U3RyaW5nKG1ldGhvZEJ1ZmYpO1xuXHRcdHJlc3VsdC53cml0ZUxvbmdTdHJpbmcoYXJnc0J1ZmYpO1xuXHRcdHJldHVybiByZXN1bHQuYnVmZmVyO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZXNlcmlhbGl6ZVJlcXVlc3RKU09OQXJncyhidWZmOiBNZXNzYWdlQnVmZmVyKTogeyBycGNJZDogbnVtYmVyOyBtZXRob2Q6IHN0cmluZzsgYXJnczogYW55W10gfSB7XG5cdFx0Y29uc3QgcnBjSWQgPSBidWZmLnJlYWRVSW50OCgpO1xuXHRcdGNvbnN0IG1ldGhvZCA9IGJ1ZmYucmVhZFNob3J0U3RyaW5nKCk7XG5cdFx0Y29uc3QgYXJncyA9IGJ1ZmYucmVhZExvbmdTdHJpbmcoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cnBjSWQ6IHJwY0lkLFxuXHRcdFx0bWV0aG9kOiBtZXRob2QsXG5cdFx0XHRhcmdzOiBKU09OLnBhcnNlKGFyZ3MpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZXF1ZXN0TWl4ZWRBcmdzKHJlcTogbnVtYmVyLCBycGNJZDogbnVtYmVyLCBtZXRob2Q6IHN0cmluZywgYXJnczogcmVhZG9ubHkgTWl4ZWRBcmdbXSwgdXNlc0NhbmNlbGxhdGlvblRva2VuOiBib29sZWFuKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IG1ldGhvZEJ1ZmYgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKG1ldGhvZCk7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplVUludDgoKTtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplU2hvcnRTdHJpbmcobWV0aG9kQnVmZik7XG5cdFx0bGVuICs9IE1lc3NhZ2VCdWZmZXIuc2l6ZU1peGVkQXJyYXkoYXJncyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBNZXNzYWdlQnVmZmVyLmFsbG9jKHVzZXNDYW5jZWxsYXRpb25Ub2tlbiA/IE1lc3NhZ2VUeXBlLlJlcXVlc3RNaXhlZEFyZ3NXaXRoQ2FuY2VsbGF0aW9uIDogTWVzc2FnZVR5cGUuUmVxdWVzdE1peGVkQXJncywgcmVxLCBsZW4pO1xuXHRcdHJlc3VsdC53cml0ZVVJbnQ4KHJwY0lkKTtcblx0XHRyZXN1bHQud3JpdGVTaG9ydFN0cmluZyhtZXRob2RCdWZmKTtcblx0XHRyZXN1bHQud3JpdGVNaXhlZEFycmF5KGFyZ3MpO1xuXHRcdHJldHVybiByZXN1bHQuYnVmZmVyO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZXNlcmlhbGl6ZVJlcXVlc3RNaXhlZEFyZ3MoYnVmZjogTWVzc2FnZUJ1ZmZlcik6IHsgcnBjSWQ6IG51bWJlcjsgbWV0aG9kOiBzdHJpbmc7IGFyZ3M6IGFueVtdIH0ge1xuXHRcdGNvbnN0IHJwY0lkID0gYnVmZi5yZWFkVUludDgoKTtcblx0XHRjb25zdCBtZXRob2QgPSBidWZmLnJlYWRTaG9ydFN0cmluZygpO1xuXHRcdGNvbnN0IHJhd2FyZ3MgPSBidWZmLnJlYWRNaXhlZEFycmF5KCk7XG5cdFx0Y29uc3QgYXJnczogYW55W10gPSBuZXcgQXJyYXkocmF3YXJncy5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYXdhcmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCByYXdhcmcgPSByYXdhcmdzW2ldO1xuXHRcdFx0aWYgKHR5cGVvZiByYXdhcmcgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGFyZ3NbaV0gPSBKU09OLnBhcnNlKHJhd2FyZyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhcmdzW2ldID0gcmF3YXJnO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cnBjSWQ6IHJwY0lkLFxuXHRcdFx0bWV0aG9kOiBtZXRob2QsXG5cdFx0XHRhcmdzOiBhcmdzXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2VyaWFsaXplQWNrbm93bGVkZ2VkKHJlcTogbnVtYmVyKTogVlNCdWZmZXIge1xuXHRcdHJldHVybiBNZXNzYWdlQnVmZmVyLmFsbG9jKE1lc3NhZ2VUeXBlLkFja25vd2xlZGdlZCwgcmVxLCAwKS5idWZmZXI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNlcmlhbGl6ZUNhbmNlbChyZXE6IG51bWJlcik6IFZTQnVmZmVyIHtcblx0XHRyZXR1cm4gTWVzc2FnZUJ1ZmZlci5hbGxvYyhNZXNzYWdlVHlwZS5DYW5jZWwsIHJlcSwgMCkuYnVmZmVyO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBzZXJpYWxpemVSZXBseU9LKHJlcTogbnVtYmVyLCByZXM6IGFueSwgcmVwbGFjZXI6IEpTT05TdHJpbmdpZnlSZXBsYWNlciB8IG51bGwpOiBWU0J1ZmZlciB7XG5cdFx0aWYgKHR5cGVvZiByZXMgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2VyaWFsaXplUmVwbHlPS0VtcHR5KHJlcSk7XG5cdFx0fSBlbHNlIGlmIChyZXMgaW5zdGFuY2VvZiBWU0J1ZmZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZVJlcGx5T0tWU0J1ZmZlcihyZXEsIHJlcyk7XG5cdFx0fSBlbHNlIGlmIChyZXMgaW5zdGFuY2VvZiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycykge1xuXHRcdFx0Y29uc3QgeyBqc29uU3RyaW5nLCByZWZlcmVuY2VkQnVmZmVycyB9ID0gc3RyaW5naWZ5SnNvbldpdGhCdWZmZXJSZWZzKHJlcy52YWx1ZSwgcmVwbGFjZXIsIHRydWUpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NlcmlhbGl6ZVJlcGx5T0tKU09OV2l0aEJ1ZmZlcnMocmVxLCBqc29uU3RyaW5nLCByZWZlcmVuY2VkQnVmZmVycyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemVSZXBseU9LSlNPTihyZXEsIHNhZmVTdHJpbmdpZnkocmVzLCByZXBsYWNlcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXJpYWxpemVSZXBseU9LRW1wdHkocmVxOiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIE1lc3NhZ2VCdWZmZXIuYWxsb2MoTWVzc2FnZVR5cGUuUmVwbHlPS0VtcHR5LCByZXEsIDApLmJ1ZmZlcjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXJpYWxpemVSZXBseU9LVlNCdWZmZXIocmVxOiBudW1iZXIsIHJlczogVlNCdWZmZXIpOiBWU0J1ZmZlciB7XG5cdFx0bGV0IGxlbiA9IDA7XG5cdFx0bGVuICs9IE1lc3NhZ2VCdWZmZXIuc2l6ZVZTQnVmZmVyKHJlcyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBNZXNzYWdlQnVmZmVyLmFsbG9jKE1lc3NhZ2VUeXBlLlJlcGx5T0tWU0J1ZmZlciwgcmVxLCBsZW4pO1xuXHRcdHJlc3VsdC53cml0ZVZTQnVmZmVyKHJlcyk7XG5cdFx0cmV0dXJuIHJlc3VsdC5idWZmZXI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplUmVwbHlPS1ZTQnVmZmVyKGJ1ZmY6IE1lc3NhZ2VCdWZmZXIpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIGJ1ZmYucmVhZFZTQnVmZmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc2VyaWFsaXplUmVwbHlPS0pTT04ocmVxOiBudW1iZXIsIHJlczogc3RyaW5nKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IHJlc0J1ZmYgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKHJlcyk7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplTG9uZ1N0cmluZyhyZXNCdWZmKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IE1lc3NhZ2VCdWZmZXIuYWxsb2MoTWVzc2FnZVR5cGUuUmVwbHlPS0pTT04sIHJlcSwgbGVuKTtcblx0XHRyZXN1bHQud3JpdGVMb25nU3RyaW5nKHJlc0J1ZmYpO1xuXHRcdHJldHVybiByZXN1bHQuYnVmZmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NlcmlhbGl6ZVJlcGx5T0tKU09OV2l0aEJ1ZmZlcnMocmVxOiBudW1iZXIsIHJlczogc3RyaW5nLCBidWZmZXJzOiByZWFkb25seSBWU0J1ZmZlcltdKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IHJlc0J1ZmYgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKHJlcyk7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplVUludDMyOyAvLyBidWZmZXIgY291bnRcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplTG9uZ1N0cmluZyhyZXNCdWZmKTtcblx0XHRmb3IgKGNvbnN0IGJ1ZmZlciBvZiBidWZmZXJzKSB7XG5cdFx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplVlNCdWZmZXIoYnVmZmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBNZXNzYWdlQnVmZmVyLmFsbG9jKE1lc3NhZ2VUeXBlLlJlcGx5T0tKU09OV2l0aEJ1ZmZlcnMsIHJlcSwgbGVuKTtcblx0XHRyZXN1bHQud3JpdGVVSW50MzIoYnVmZmVycy5sZW5ndGgpO1xuXHRcdHJlc3VsdC53cml0ZUxvbmdTdHJpbmcocmVzQnVmZik7XG5cdFx0Zm9yIChjb25zdCBidWZmZXIgb2YgYnVmZmVycykge1xuXHRcdFx0cmVzdWx0LndyaXRlQnVmZmVyKGJ1ZmZlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5idWZmZXI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplUmVwbHlPS0pTT04oYnVmZjogTWVzc2FnZUJ1ZmZlcik6IGFueSB7XG5cdFx0Y29uc3QgcmVzID0gYnVmZi5yZWFkTG9uZ1N0cmluZygpO1xuXHRcdHJldHVybiBKU09OLnBhcnNlKHJlcyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplUmVwbHlPS0pTT05XaXRoQnVmZmVycyhidWZmOiBNZXNzYWdlQnVmZmVyLCB1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCk6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPGFueT4ge1xuXHRcdGNvbnN0IGJ1ZmZlckNvdW50ID0gYnVmZi5yZWFkVUludDMyKCk7XG5cdFx0Y29uc3QgcmVzID0gYnVmZi5yZWFkTG9uZ1N0cmluZygpO1xuXG5cdFx0Y29uc3QgYnVmZmVyczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYnVmZmVyQ291bnQ7ICsraSkge1xuXHRcdFx0YnVmZmVycy5wdXNoKGJ1ZmYucmVhZFZTQnVmZmVyKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMocGFyc2VKc29uQW5kUmVzdG9yZUJ1ZmZlclJlZnMocmVzLCBidWZmZXJzLCB1cmlUcmFuc2Zvcm1lcikpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBzZXJpYWxpemVSZXBseUVycihyZXE6IG51bWJlciwgZXJyOiBhbnkpOiBWU0J1ZmZlciB7XG5cdFx0Y29uc3QgZXJyU3RyOiBzdHJpbmcgfCB1bmRlZmluZWQgPSAoZXJyID8gc2FmZVN0cmluZ2lmeShlcnJvcnMudHJhbnNmb3JtRXJyb3JGb3JTZXJpYWxpemF0aW9uKGVyciksIG51bGwpIDogdW5kZWZpbmVkKTtcblx0XHRpZiAodHlwZW9mIGVyclN0ciAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZXJpYWxpemVSZXBseUVyckVtcHR5KHJlcSk7XG5cdFx0fVxuXHRcdGNvbnN0IGVyckJ1ZmYgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKGVyclN0cik7XG5cblx0XHRsZXQgbGVuID0gMDtcblx0XHRsZW4gKz0gTWVzc2FnZUJ1ZmZlci5zaXplTG9uZ1N0cmluZyhlcnJCdWZmKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IE1lc3NhZ2VCdWZmZXIuYWxsb2MoTWVzc2FnZVR5cGUuUmVwbHlFcnJFcnJvciwgcmVxLCBsZW4pO1xuXHRcdHJlc3VsdC53cml0ZUxvbmdTdHJpbmcoZXJyQnVmZik7XG5cdFx0cmV0dXJuIHJlc3VsdC5idWZmZXI7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlc2VyaWFsaXplUmVwbHlFcnJFcnJvcihidWZmOiBNZXNzYWdlQnVmZmVyKTogRXJyb3Ige1xuXHRcdGNvbnN0IGVyciA9IGJ1ZmYucmVhZExvbmdTdHJpbmcoKTtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShlcnIpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NlcmlhbGl6ZVJlcGx5RXJyRW1wdHkocmVxOiBudW1iZXIpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIE1lc3NhZ2VCdWZmZXIuYWxsb2MoTWVzc2FnZVR5cGUuUmVwbHlFcnJFbXB0eSwgcmVxLCAwKS5idWZmZXI7XG5cdH1cbn1cblxuY29uc3QgZW51bSBNZXNzYWdlVHlwZSB7XG5cdFJlcXVlc3RKU09OQXJncyA9IDEsXG5cdFJlcXVlc3RKU09OQXJnc1dpdGhDYW5jZWxsYXRpb24gPSAyLFxuXHRSZXF1ZXN0TWl4ZWRBcmdzID0gMyxcblx0UmVxdWVzdE1peGVkQXJnc1dpdGhDYW5jZWxsYXRpb24gPSA0LFxuXHRBY2tub3dsZWRnZWQgPSA1LFxuXHRDYW5jZWwgPSA2LFxuXHRSZXBseU9LRW1wdHkgPSA3LFxuXHRSZXBseU9LVlNCdWZmZXIgPSA4LFxuXHRSZXBseU9LSlNPTiA9IDksXG5cdFJlcGx5T0tKU09OV2l0aEJ1ZmZlcnMgPSAxMCxcblx0UmVwbHlFcnJFcnJvciA9IDExLFxuXHRSZXBseUVyckVtcHR5ID0gMTIsXG59XG5cbmNvbnN0IGVudW0gQXJnVHlwZSB7XG5cdFN0cmluZyA9IDEsXG5cdFZTQnVmZmVyID0gMixcblx0U2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzID0gMyxcblx0VW5kZWZpbmVkID0gNCxcbn1cblxuXG50eXBlIE1peGVkQXJnID1cblx0fCB7IHJlYWRvbmx5IHR5cGU6IEFyZ1R5cGUuU3RyaW5nOyByZWFkb25seSB2YWx1ZTogVlNCdWZmZXIgfVxuXHR8IHsgcmVhZG9ubHkgdHlwZTogQXJnVHlwZS5WU0J1ZmZlcjsgcmVhZG9ubHkgdmFsdWU6IFZTQnVmZmVyIH1cblx0fCB7IHJlYWRvbmx5IHR5cGU6IEFyZ1R5cGUuU2VyaWFsaXplZE9iamVjdFdpdGhCdWZmZXJzOyByZWFkb25seSB2YWx1ZTogVlNCdWZmZXI7IHJlYWRvbmx5IGJ1ZmZlcnM6IHJlYWRvbmx5IFZTQnVmZmVyW10gfVxuXHR8IHsgcmVhZG9ubHkgdHlwZTogQXJnVHlwZS5VbmRlZmluZWQgfVxuXHQ7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFBQTtBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQW9DO0FBRXpELFNBQVMsb0JBQW9CO0FBQzdC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QUU7QUFBQSxFQUMvRDtBQUNEO0FBRUEsSUFBVyxjQUFYLGtCQUFXQyxpQkFBWDtBQUNDLEVBQUFBLDBCQUFBLHFCQUFrQixLQUFsQjtBQUNBLEVBQUFBLDBCQUFBLHFDQUFrQyxLQUFsQztBQUNBLEVBQUFBLDBCQUFBLHNCQUFtQixLQUFuQjtBQUNBLEVBQUFBLDBCQUFBLHNDQUFtQyxLQUFuQztBQUNBLEVBQUFBLDBCQUFBLGtCQUFlLEtBQWY7QUFDQSxFQUFBQSwwQkFBQSxZQUFTLEtBQVQ7QUFDQSxFQUFBQSwwQkFBQSxrQkFBZSxLQUFmO0FBQ0EsRUFBQUEsMEJBQUEscUJBQWtCLEtBQWxCO0FBQ0EsRUFBQUEsMEJBQUEsaUJBQWMsS0FBZDtBQUNBLEVBQUFBLDBCQUFBLDRCQUF5QixNQUF6QjtBQUNBLEVBQUFBLDBCQUFBLG1CQUFnQixNQUFoQjtBQUNBLEVBQUFBLDBCQUFBLG1CQUFnQixNQUFoQjtBQVpVLFNBQUFBO0FBQUEsR0FBQTtBQWVYLElBQVcsVUFBWCxrQkFBV0MsYUFBWDtBQUNDLEVBQUFBLGtCQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLGtCQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLGtCQUFBLGlDQUE4QixLQUE5QjtBQUNBLEVBQUFBLGtCQUFBLGVBQVksS0FBWjtBQUpVLFNBQUFBO0FBQUEsR0FBQTsiLAogICJuYW1lcyI6IFsiUmVxdWVzdEluaXRpYXRvciIsICJSZXNwb25zaXZlU3RhdGUiLCAibXNnIiwgImkiLCAiU2VyaWFsaXplZFJlcXVlc3RBcmd1bWVudFR5cGUiLCAiTWVzc2FnZVR5cGUiLCAiQXJnVHlwZSJdCn0K
