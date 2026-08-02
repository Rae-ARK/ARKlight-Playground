import { CharCode } from "../charCode.js";
import { onUnexpectedError, transformErrorForSerialization } from "../errors.js";
import { Emitter } from "../event.js";
import { Disposable } from "../lifecycle.js";
import { isWeb } from "../platform.js";
import * as strings from "../strings.js";
const DEFAULT_CHANNEL = "default";
const INITIALIZE = "$initialize";
let webWorkerWarningLogged = false;
function logOnceWebWorkerWarning(err) {
  if (!isWeb) {
    return;
  }
  if (!webWorkerWarningLogged) {
    webWorkerWarningLogged = true;
    console.warn("Could not create web worker(s). Falling back to loading web worker code in main thread, which might cause UI freezes. Please see https://github.com/microsoft/monaco-editor#faq");
  }
  console.warn(err.message);
}
var MessageType = /* @__PURE__ */ ((MessageType2) => {
  MessageType2[MessageType2["Request"] = 0] = "Request";
  MessageType2[MessageType2["Reply"] = 1] = "Reply";
  MessageType2[MessageType2["SubscribeEvent"] = 2] = "SubscribeEvent";
  MessageType2[MessageType2["Event"] = 3] = "Event";
  MessageType2[MessageType2["UnsubscribeEvent"] = 4] = "UnsubscribeEvent";
  return MessageType2;
})(MessageType || {});
class RequestMessage {
  constructor(vsWorker, req, channel, method, args) {
    this.vsWorker = vsWorker;
    this.req = req;
    this.channel = channel;
    this.method = method;
    this.args = args;
    this.type = 0 /* Request */;
  }
}
class ReplyMessage {
  constructor(vsWorker, seq, res, err) {
    this.vsWorker = vsWorker;
    this.seq = seq;
    this.res = res;
    this.err = err;
    this.type = 1 /* Reply */;
  }
}
class SubscribeEventMessage {
  constructor(vsWorker, req, channel, eventName, arg) {
    this.vsWorker = vsWorker;
    this.req = req;
    this.channel = channel;
    this.eventName = eventName;
    this.arg = arg;
    this.type = 2 /* SubscribeEvent */;
  }
}
class EventMessage {
  constructor(vsWorker, req, event) {
    this.vsWorker = vsWorker;
    this.req = req;
    this.event = event;
    this.type = 3 /* Event */;
  }
}
class UnsubscribeEventMessage {
  constructor(vsWorker, req) {
    this.vsWorker = vsWorker;
    this.req = req;
    this.type = 4 /* UnsubscribeEvent */;
  }
}
class WebWorkerProtocol {
  constructor(handler) {
    this._workerId = -1;
    this._handler = handler;
    this._lastSentReq = 0;
    this._pendingReplies = /* @__PURE__ */ Object.create(null);
    this._pendingEmitters = /* @__PURE__ */ new Map();
    this._pendingEvents = /* @__PURE__ */ new Map();
  }
  setWorkerId(workerId) {
    this._workerId = workerId;
  }
  async sendMessage(channel, method, args) {
    const req = String(++this._lastSentReq);
    return new Promise((resolve, reject) => {
      this._pendingReplies[req] = {
        resolve,
        reject
      };
      this._send(new RequestMessage(this._workerId, req, channel, method, args));
    });
  }
  listen(channel, eventName, arg) {
    let req = null;
    const emitter = new Emitter({
      onWillAddFirstListener: () => {
        req = String(++this._lastSentReq);
        this._pendingEmitters.set(req, emitter);
        this._send(new SubscribeEventMessage(this._workerId, req, channel, eventName, arg));
      },
      onDidRemoveLastListener: () => {
        this._pendingEmitters.delete(req);
        this._send(new UnsubscribeEventMessage(this._workerId, req));
        req = null;
      }
    });
    return emitter.event;
  }
  handleMessage(message) {
    if (!message || !message.vsWorker) {
      return;
    }
    if (this._workerId !== -1 && message.vsWorker !== this._workerId) {
      return;
    }
    this._handleMessage(message);
  }
  createProxyToRemoteChannel(channel, sendMessageBarrier) {
    const handler = {
      get: (target, name) => {
        if (typeof name === "string" && !target[name]) {
          if (propertyIsDynamicEvent(name)) {
            target[name] = (arg) => {
              return this.listen(channel, name, arg);
            };
          } else if (propertyIsEvent(name)) {
            target[name] = this.listen(channel, name, void 0);
          } else if (name.charCodeAt(0) === CharCode.DollarSign) {
            target[name] = async (...myArgs) => {
              await sendMessageBarrier?.();
              return this.sendMessage(channel, name, myArgs);
            };
          }
        }
        return target[name];
      }
    };
    return new Proxy(/* @__PURE__ */ Object.create(null), handler);
  }
  _handleMessage(msg) {
    switch (msg.type) {
      case 1 /* Reply */:
        return this._handleReplyMessage(msg);
      case 0 /* Request */:
        return this._handleRequestMessage(msg);
      case 2 /* SubscribeEvent */:
        return this._handleSubscribeEventMessage(msg);
      case 3 /* Event */:
        return this._handleEventMessage(msg);
      case 4 /* UnsubscribeEvent */:
        return this._handleUnsubscribeEventMessage(msg);
    }
  }
  _handleReplyMessage(replyMessage) {
    if (!this._pendingReplies[replyMessage.seq]) {
      console.warn("Got reply to unknown seq");
      return;
    }
    const reply = this._pendingReplies[replyMessage.seq];
    delete this._pendingReplies[replyMessage.seq];
    if (replyMessage.err) {
      let err = replyMessage.err;
      if (replyMessage.err.$isError) {
        const newErr = new Error();
        newErr.name = replyMessage.err.name;
        newErr.message = replyMessage.err.message;
        newErr.stack = replyMessage.err.stack;
        err = newErr;
      }
      reply.reject(err);
      return;
    }
    reply.resolve(replyMessage.res);
  }
  _handleRequestMessage(requestMessage) {
    const req = requestMessage.req;
    const result = this._handler.handleMessage(requestMessage.channel, requestMessage.method, requestMessage.args);
    result.then((r) => {
      this._send(new ReplyMessage(this._workerId, req, r, void 0));
    }, (e) => {
      if (e.detail instanceof Error) {
        e.detail = transformErrorForSerialization(e.detail);
      }
      this._send(new ReplyMessage(this._workerId, req, void 0, transformErrorForSerialization(e)));
    });
  }
  _handleSubscribeEventMessage(msg) {
    const req = msg.req;
    const disposable = this._handler.handleEvent(msg.channel, msg.eventName, msg.arg)((event) => {
      this._send(new EventMessage(this._workerId, req, event));
    });
    this._pendingEvents.set(req, disposable);
  }
  _handleEventMessage(msg) {
    const emitter = this._pendingEmitters.get(msg.req);
    if (emitter === void 0) {
      console.warn("Got event for unknown req");
      return;
    }
    emitter.fire(msg.event);
  }
  _handleUnsubscribeEventMessage(msg) {
    const event = this._pendingEvents.get(msg.req);
    if (event === void 0) {
      console.warn("Got unsubscribe for unknown req");
      return;
    }
    event.dispose();
    this._pendingEvents.delete(msg.req);
  }
  _send(msg) {
    const transfer = [];
    if (msg.type === 0 /* Request */) {
      for (let i = 0; i < msg.args.length; i++) {
        const arg = msg.args[i];
        if (arg instanceof ArrayBuffer) {
          transfer.push(arg);
        }
      }
    } else if (msg.type === 1 /* Reply */) {
      if (msg.res instanceof ArrayBuffer) {
        transfer.push(msg.res);
      }
    }
    this._handler.sendMessage(msg, transfer);
  }
}
class WebWorkerClient extends Disposable {
  constructor(worker) {
    super();
    this._localChannels = /* @__PURE__ */ new Map();
    this._remoteChannels = /* @__PURE__ */ new Map();
    this._worker = this._register(worker);
    this._register(this._worker.onMessage((msg) => {
      this._protocol.handleMessage(msg);
    }));
    this._register(this._worker.onError((err) => {
      logOnceWebWorkerWarning(err);
      onUnexpectedError(err);
    }));
    this._protocol = new WebWorkerProtocol({
      sendMessage: (msg, transfer) => {
        this._worker.postMessage(msg, transfer);
      },
      handleMessage: (channel, method, args) => {
        return this._handleMessage(channel, method, args);
      },
      handleEvent: (channel, eventName, arg) => {
        return this._handleEvent(channel, eventName, arg);
      }
    });
    this._protocol.setWorkerId(this._worker.getId());
    this._onModuleLoaded = this._protocol.sendMessage(DEFAULT_CHANNEL, INITIALIZE, [
      this._worker.getId()
    ]).then(() => {
    });
    this.proxy = this._protocol.createProxyToRemoteChannel(DEFAULT_CHANNEL, async () => {
      await this._onModuleLoaded;
    });
    this._onModuleLoaded.catch((e) => {
      this._onError("Worker failed to load ", e);
    });
  }
  _handleMessage(channelName, method, args) {
    const channel = this._localChannels.get(channelName);
    if (!channel) {
      return Promise.reject(new Error(`Missing channel ${channelName} on main thread`));
    }
    const fn = channel[method];
    if (typeof fn !== "function") {
      return Promise.reject(new Error(`Missing method ${method} on main thread channel ${channelName}`));
    }
    try {
      return Promise.resolve(fn.apply(channel, args));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  _handleEvent(channelName, eventName, arg) {
    const channel = this._localChannels.get(channelName);
    if (!channel) {
      throw new Error(`Missing channel ${channelName} on main thread`);
    }
    if (propertyIsDynamicEvent(eventName)) {
      const fn = channel[eventName];
      if (typeof fn !== "function") {
        throw new Error(`Missing dynamic event ${eventName} on main thread channel ${channelName}.`);
      }
      const event = fn.call(channel, arg);
      if (typeof event !== "function") {
        throw new Error(`Missing dynamic event ${eventName} on main thread channel ${channelName}.`);
      }
      return event;
    }
    if (propertyIsEvent(eventName)) {
      const event = channel[eventName];
      if (typeof event !== "function") {
        throw new Error(`Missing event ${eventName} on main thread channel ${channelName}.`);
      }
      return event;
    }
    throw new Error(`Malformed event name ${eventName}`);
  }
  setChannel(channel, handler) {
    this._localChannels.set(channel, handler);
  }
  getChannel(channel) {
    let inst = this._remoteChannels.get(channel);
    if (inst === void 0) {
      inst = this._protocol.createProxyToRemoteChannel(channel, async () => {
        await this._onModuleLoaded;
      });
      this._remoteChannels.set(channel, inst);
    }
    return inst;
  }
  _onError(message, error) {
    console.error(message);
    console.info(error);
  }
}
function propertyIsEvent(name) {
  return name[0] === "o" && name[1] === "n" && strings.isUpperAsciiLetter(name.charCodeAt(2));
}
function propertyIsDynamicEvent(name) {
  return /^onDynamic/.test(name) && strings.isUpperAsciiLetter(name.charCodeAt(9));
}
class WebWorkerServer {
  constructor(postMessage, requestHandlerFactory) {
    this._localChannels = /* @__PURE__ */ new Map();
    this._remoteChannels = /* @__PURE__ */ new Map();
    this._protocol = new WebWorkerProtocol({
      sendMessage: (msg, transfer) => {
        postMessage(msg, transfer);
      },
      handleMessage: (channel, method, args) => this._handleMessage(channel, method, args),
      handleEvent: (channel, eventName, arg) => this._handleEvent(channel, eventName, arg)
    });
    this.requestHandler = requestHandlerFactory(this);
  }
  onmessage(msg) {
    this._protocol.handleMessage(msg);
  }
  _handleMessage(channel, method, args) {
    if (channel === DEFAULT_CHANNEL && method === INITIALIZE) {
      return this.initialize(args[0]);
    }
    const requestHandler = channel === DEFAULT_CHANNEL ? this.requestHandler : this._localChannels.get(channel);
    if (!requestHandler) {
      return Promise.reject(new Error(`Missing channel ${channel} on worker thread`));
    }
    const fn = requestHandler[method];
    if (typeof fn !== "function") {
      return Promise.reject(new Error(`Missing method ${method} on worker thread channel ${channel}`));
    }
    try {
      return Promise.resolve(fn.apply(requestHandler, args));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  _handleEvent(channel, eventName, arg) {
    const requestHandler = channel === DEFAULT_CHANNEL ? this.requestHandler : this._localChannels.get(channel);
    if (!requestHandler) {
      throw new Error(`Missing channel ${channel} on worker thread`);
    }
    if (propertyIsDynamicEvent(eventName)) {
      const fn = requestHandler[eventName];
      if (typeof fn !== "function") {
        throw new Error(`Missing dynamic event ${eventName} on request handler.`);
      }
      const event = fn.call(requestHandler, arg);
      if (typeof event !== "function") {
        throw new Error(`Missing dynamic event ${eventName} on request handler.`);
      }
      return event;
    }
    if (propertyIsEvent(eventName)) {
      const event = requestHandler[eventName];
      if (typeof event !== "function") {
        throw new Error(`Missing event ${eventName} on request handler.`);
      }
      return event;
    }
    throw new Error(`Malformed event name ${eventName}`);
  }
  setChannel(channel, handler) {
    this._localChannels.set(channel, handler);
  }
  getChannel(channel) {
    let inst = this._remoteChannels.get(channel);
    if (inst === void 0) {
      inst = this._protocol.createProxyToRemoteChannel(channel);
      this._remoteChannels.set(channel, inst);
    }
    return inst;
  }
  async initialize(workerId) {
    this._protocol.setWorkerId(workerId);
  }
}
export {
  WebWorkerClient,
  WebWorkerServer,
  logOnceWebWorkerWarning
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvY29tbW9uL3dvcmtlci93ZWJXb3JrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yLCBTZXJpYWxpemVkRXJyb3IsIHRyYW5zZm9ybUVycm9yRm9yU2VyaWFsaXphdGlvbiB9IGZyb20gJy4uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi9zdHJpbmdzLmpzJztcblxuY29uc3QgREVGQVVMVF9DSEFOTkVMID0gJ2RlZmF1bHQnO1xuY29uc3QgSU5JVElBTElaRSA9ICckaW5pdGlhbGl6ZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdlYldvcmtlciBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0Z2V0SWQoKTogbnVtYmVyO1xuXHRyZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PE1lc3NhZ2U+O1xuXHRyZWFkb25seSBvbkVycm9yOiBFdmVudDx1bmtub3duPjtcblx0cG9zdE1lc3NhZ2UobWVzc2FnZTogTWVzc2FnZSwgdHJhbnNmZXI6IEFycmF5QnVmZmVyW10pOiB2b2lkO1xufVxuXG5sZXQgd2ViV29ya2VyV2FybmluZ0xvZ2dlZCA9IGZhbHNlO1xuZXhwb3J0IGZ1bmN0aW9uIGxvZ09uY2VXZWJXb3JrZXJXYXJuaW5nKGVycjogdW5rbm93bik6IHZvaWQge1xuXHRpZiAoIWlzV2ViKSB7XG5cdFx0Ly8gcnVubmluZyB0ZXN0c1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAoIXdlYldvcmtlcldhcm5pbmdMb2dnZWQpIHtcblx0XHR3ZWJXb3JrZXJXYXJuaW5nTG9nZ2VkID0gdHJ1ZTtcblx0XHRjb25zb2xlLndhcm4oJ0NvdWxkIG5vdCBjcmVhdGUgd2ViIHdvcmtlcihzKS4gRmFsbGluZyBiYWNrIHRvIGxvYWRpbmcgd2ViIHdvcmtlciBjb2RlIGluIG1haW4gdGhyZWFkLCB3aGljaCBtaWdodCBjYXVzZSBVSSBmcmVlemVzLiBQbGVhc2Ugc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvbW9uYWNvLWVkaXRvciNmYXEnKTtcblx0fVxuXHRjb25zb2xlLndhcm4oKGVyciBhcyBFcnJvcikubWVzc2FnZSk7XG59XG5cbmNvbnN0IGVudW0gTWVzc2FnZVR5cGUge1xuXHRSZXF1ZXN0LFxuXHRSZXBseSxcblx0U3Vic2NyaWJlRXZlbnQsXG5cdEV2ZW50LFxuXHRVbnN1YnNjcmliZUV2ZW50XG59XG5jbGFzcyBSZXF1ZXN0TWVzc2FnZSB7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gTWVzc2FnZVR5cGUuUmVxdWVzdDtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHZzV29ya2VyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBjaGFubmVsOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBhcmdzOiB1bmtub3duW11cblx0KSB7IH1cbn1cbmNsYXNzIFJlcGx5TWVzc2FnZSB7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gTWVzc2FnZVR5cGUuUmVwbHk7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB2c1dvcmtlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzZXE6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVzOiB1bmtub3duLFxuXHRcdHB1YmxpYyByZWFkb25seSBlcnI6IHVua25vd24gfCBTZXJpYWxpemVkRXJyb3Jcblx0KSB7IH1cbn1cbmNsYXNzIFN1YnNjcmliZUV2ZW50TWVzc2FnZSB7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gTWVzc2FnZVR5cGUuU3Vic2NyaWJlRXZlbnQ7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB2c1dvcmtlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSByZXE6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY2hhbm5lbDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBldmVudE5hbWU6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYXJnOiB1bmtub3duXG5cdCkgeyB9XG59XG5jbGFzcyBFdmVudE1lc3NhZ2Uge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IE1lc3NhZ2VUeXBlLkV2ZW50O1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdnNXb3JrZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVxOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGV2ZW50OiB1bmtub3duXG5cdCkgeyB9XG59XG5jbGFzcyBVbnN1YnNjcmliZUV2ZW50TWVzc2FnZSB7XG5cdHB1YmxpYyByZWFkb25seSB0eXBlID0gTWVzc2FnZVR5cGUuVW5zdWJzY3JpYmVFdmVudDtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHZzV29ya2VyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlcTogc3RyaW5nXG5cdCkgeyB9XG59XG5leHBvcnQgdHlwZSBNZXNzYWdlID0gUmVxdWVzdE1lc3NhZ2UgfCBSZXBseU1lc3NhZ2UgfCBTdWJzY3JpYmVFdmVudE1lc3NhZ2UgfCBFdmVudE1lc3NhZ2UgfCBVbnN1YnNjcmliZUV2ZW50TWVzc2FnZTtcblxuaW50ZXJmYWNlIElNZXNzYWdlUmVwbHkge1xuXHRyZXNvbHZlOiAodmFsdWU/OiB1bmtub3duKSA9PiB2b2lkO1xuXHRyZWplY3Q6IChlcnJvcj86IHVua25vd24pID0+IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJTWVzc2FnZUhhbmRsZXIge1xuXHRzZW5kTWVzc2FnZShtc2c6IHVua25vd24sIHRyYW5zZmVyPzogQXJyYXlCdWZmZXJbXSk6IHZvaWQ7XG5cdGhhbmRsZU1lc3NhZ2UoY2hhbm5lbDogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPjtcblx0aGFuZGxlRXZlbnQoY2hhbm5lbDogc3RyaW5nLCBldmVudE5hbWU6IHN0cmluZywgYXJnOiB1bmtub3duKTogRXZlbnQ8dW5rbm93bj47XG59XG5cbmNsYXNzIFdlYldvcmtlclByb3RvY29sIHtcblxuXHRwcml2YXRlIF93b3JrZXJJZDogbnVtYmVyO1xuXHRwcml2YXRlIF9sYXN0U2VudFJlcTogbnVtYmVyO1xuXHRwcml2YXRlIF9wZW5kaW5nUmVwbGllczogeyBbcmVxOiBzdHJpbmddOiBJTWVzc2FnZVJlcGx5IH07XG5cdHByaXZhdGUgX3BlbmRpbmdFbWl0dGVyczogTWFwPHN0cmluZywgRW1pdHRlcjx1bmtub3duPj47XG5cdHByaXZhdGUgX3BlbmRpbmdFdmVudHM6IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPjtcblx0cHJpdmF0ZSBfaGFuZGxlcjogSU1lc3NhZ2VIYW5kbGVyO1xuXG5cdGNvbnN0cnVjdG9yKGhhbmRsZXI6IElNZXNzYWdlSGFuZGxlcikge1xuXHRcdHRoaXMuX3dvcmtlcklkID0gLTE7XG5cdFx0dGhpcy5faGFuZGxlciA9IGhhbmRsZXI7XG5cdFx0dGhpcy5fbGFzdFNlbnRSZXEgPSAwO1xuXHRcdHRoaXMuX3BlbmRpbmdSZXBsaWVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9wZW5kaW5nRW1pdHRlcnMgPSBuZXcgTWFwPHN0cmluZywgRW1pdHRlcjx1bmtub3duPj4oKTtcblx0XHR0aGlzLl9wZW5kaW5nRXZlbnRzID0gbmV3IE1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpO1xuXHR9XG5cblx0cHVibGljIHNldFdvcmtlcklkKHdvcmtlcklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93b3JrZXJJZCA9IHdvcmtlcklkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNlbmRNZXNzYWdlKGNoYW5uZWw6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IHJlcSA9IFN0cmluZygrK3RoaXMuX2xhc3RTZW50UmVxKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dW5rbm93bj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcGxpZXNbcmVxXSA9IHtcblx0XHRcdFx0cmVzb2x2ZTogcmVzb2x2ZSxcblx0XHRcdFx0cmVqZWN0OiByZWplY3Rcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9zZW5kKG5ldyBSZXF1ZXN0TWVzc2FnZSh0aGlzLl93b3JrZXJJZCwgcmVxLCBjaGFubmVsLCBtZXRob2QsIGFyZ3MpKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBsaXN0ZW4oY2hhbm5lbDogc3RyaW5nLCBldmVudE5hbWU6IHN0cmluZywgYXJnOiB1bmtub3duKTogRXZlbnQ8dW5rbm93bj4ge1xuXHRcdGxldCByZXE6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx1bmtub3duPih7XG5cdFx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRcdHJlcSA9IFN0cmluZygrK3RoaXMuX2xhc3RTZW50UmVxKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0VtaXR0ZXJzLnNldChyZXEsIGVtaXR0ZXIpO1xuXHRcdFx0XHR0aGlzLl9zZW5kKG5ldyBTdWJzY3JpYmVFdmVudE1lc3NhZ2UodGhpcy5fd29ya2VySWQsIHJlcSwgY2hhbm5lbCwgZXZlbnROYW1lLCBhcmcpKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nRW1pdHRlcnMuZGVsZXRlKHJlcSEpO1xuXHRcdFx0XHR0aGlzLl9zZW5kKG5ldyBVbnN1YnNjcmliZUV2ZW50TWVzc2FnZSh0aGlzLl93b3JrZXJJZCwgcmVxISkpO1xuXHRcdFx0XHRyZXEgPSBudWxsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBlbWl0dGVyLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGhhbmRsZU1lc3NhZ2UobWVzc2FnZTogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmICghbWVzc2FnZSB8fCAhKG1lc3NhZ2UgYXMgTWVzc2FnZSkudnNXb3JrZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3dvcmtlcklkICE9PSAtMSAmJiAobWVzc2FnZSBhcyBNZXNzYWdlKS52c1dvcmtlciAhPT0gdGhpcy5fd29ya2VySWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGFuZGxlTWVzc2FnZShtZXNzYWdlIGFzIE1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVByb3h5VG9SZW1vdGVDaGFubmVsPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IHN0cmluZywgc2VuZE1lc3NhZ2VCYXJyaWVyPzogKCkgPT4gUHJvbWlzZTx2b2lkPik6IFQge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSB7XG5cdFx0XHRnZXQ6ICh0YXJnZXQ6IFJlY29yZDxQcm9wZXJ0eUtleSwgdW5rbm93bj4sIG5hbWU6IFByb3BlcnR5S2V5KSA9PiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgbmFtZSA9PT0gJ3N0cmluZycgJiYgIXRhcmdldFtuYW1lXSkge1xuXHRcdFx0XHRcdGlmIChwcm9wZXJ0eUlzRHluYW1pY0V2ZW50KG5hbWUpKSB7IC8vIG9uRHluYW1pYy4uLlxuXHRcdFx0XHRcdFx0dGFyZ2V0W25hbWVdID0gKGFyZzogdW5rbm93bik6IEV2ZW50PHVua25vd24+ID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMubGlzdGVuKGNoYW5uZWwsIG5hbWUsIGFyZyk7XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocHJvcGVydHlJc0V2ZW50KG5hbWUpKSB7IC8vIG9uLi4uXG5cdFx0XHRcdFx0XHR0YXJnZXRbbmFtZV0gPSB0aGlzLmxpc3RlbihjaGFubmVsLCBuYW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAobmFtZS5jaGFyQ29kZUF0KDApID09PSBDaGFyQ29kZS5Eb2xsYXJTaWduKSB7IC8vICQuLi5cblx0XHRcdFx0XHRcdHRhcmdldFtuYW1lXSA9IGFzeW5jICguLi5teUFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBzZW5kTWVzc2FnZUJhcnJpZXI/LigpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5zZW5kTWVzc2FnZShjaGFubmVsLCBuYW1lLCBteUFyZ3MpO1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRhcmdldFtuYW1lXTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHJldHVybiBuZXcgUHJveHkoT2JqZWN0LmNyZWF0ZShudWxsKSwgaGFuZGxlcik7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVNZXNzYWdlKG1zZzogTWVzc2FnZSk6IHZvaWQge1xuXHRcdHN3aXRjaCAobXNnLnR5cGUpIHtcblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVwbHk6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVSZXBseU1lc3NhZ2UobXNnKTtcblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuUmVxdWVzdDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2hhbmRsZVJlcXVlc3RNZXNzYWdlKG1zZyk7XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlN1YnNjcmliZUV2ZW50OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlU3Vic2NyaWJlRXZlbnRNZXNzYWdlKG1zZyk7XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLkV2ZW50OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlRXZlbnRNZXNzYWdlKG1zZyk7XG5cdFx0XHRjYXNlIE1lc3NhZ2VUeXBlLlVuc3Vic2NyaWJlRXZlbnQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZUV2ZW50TWVzc2FnZShtc2cpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVJlcGx5TWVzc2FnZShyZXBseU1lc3NhZ2U6IFJlcGx5TWVzc2FnZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcGVuZGluZ1JlcGxpZXNbcmVwbHlNZXNzYWdlLnNlcV0pIHtcblx0XHRcdGNvbnNvbGUud2FybignR290IHJlcGx5IHRvIHVua25vd24gc2VxJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwbHkgPSB0aGlzLl9wZW5kaW5nUmVwbGllc1tyZXBseU1lc3NhZ2Uuc2VxXTtcblx0XHRkZWxldGUgdGhpcy5fcGVuZGluZ1JlcGxpZXNbcmVwbHlNZXNzYWdlLnNlcV07XG5cblx0XHRpZiAocmVwbHlNZXNzYWdlLmVycikge1xuXHRcdFx0bGV0IGVyciA9IHJlcGx5TWVzc2FnZS5lcnI7XG5cdFx0XHRpZiAoKHJlcGx5TWVzc2FnZS5lcnIgYXMgU2VyaWFsaXplZEVycm9yKS4kaXNFcnJvcikge1xuXHRcdFx0XHRjb25zdCBuZXdFcnIgPSBuZXcgRXJyb3IoKTtcblx0XHRcdFx0bmV3RXJyLm5hbWUgPSAocmVwbHlNZXNzYWdlLmVyciBhcyBTZXJpYWxpemVkRXJyb3IpLm5hbWU7XG5cdFx0XHRcdG5ld0Vyci5tZXNzYWdlID0gKHJlcGx5TWVzc2FnZS5lcnIgYXMgU2VyaWFsaXplZEVycm9yKS5tZXNzYWdlO1xuXHRcdFx0XHRuZXdFcnIuc3RhY2sgPSAocmVwbHlNZXNzYWdlLmVyciBhcyBTZXJpYWxpemVkRXJyb3IpLnN0YWNrO1xuXHRcdFx0XHRlcnIgPSBuZXdFcnI7XG5cdFx0XHR9XG5cdFx0XHRyZXBseS5yZWplY3QoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXBseS5yZXNvbHZlKHJlcGx5TWVzc2FnZS5yZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlUmVxdWVzdE1lc3NhZ2UocmVxdWVzdE1lc3NhZ2U6IFJlcXVlc3RNZXNzYWdlKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVxID0gcmVxdWVzdE1lc3NhZ2UucmVxO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2hhbmRsZXIuaGFuZGxlTWVzc2FnZShyZXF1ZXN0TWVzc2FnZS5jaGFubmVsLCByZXF1ZXN0TWVzc2FnZS5tZXRob2QsIHJlcXVlc3RNZXNzYWdlLmFyZ3MpO1xuXHRcdHJlc3VsdC50aGVuKChyKSA9PiB7XG5cdFx0XHR0aGlzLl9zZW5kKG5ldyBSZXBseU1lc3NhZ2UodGhpcy5fd29ya2VySWQsIHJlcSwgciwgdW5kZWZpbmVkKSk7XG5cdFx0fSwgKGUpID0+IHtcblx0XHRcdGlmIChlLmRldGFpbCBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdC8vIExvYWRpbmcgZXJyb3JzIGhhdmUgYSBkZXRhaWwgcHJvcGVydHkgdGhhdCBwb2ludHMgdG8gdGhlIGFjdHVhbCBlcnJvclxuXHRcdFx0XHRlLmRldGFpbCA9IHRyYW5zZm9ybUVycm9yRm9yU2VyaWFsaXphdGlvbihlLmRldGFpbCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZW5kKG5ldyBSZXBseU1lc3NhZ2UodGhpcy5fd29ya2VySWQsIHJlcSwgdW5kZWZpbmVkLCB0cmFuc2Zvcm1FcnJvckZvclNlcmlhbGl6YXRpb24oZSkpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVN1YnNjcmliZUV2ZW50TWVzc2FnZShtc2c6IFN1YnNjcmliZUV2ZW50TWVzc2FnZSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcSA9IG1zZy5yZXE7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX2hhbmRsZXIuaGFuZGxlRXZlbnQobXNnLmNoYW5uZWwsIG1zZy5ldmVudE5hbWUsIG1zZy5hcmcpKChldmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fc2VuZChuZXcgRXZlbnRNZXNzYWdlKHRoaXMuX3dvcmtlcklkLCByZXEsIGV2ZW50KSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcGVuZGluZ0V2ZW50cy5zZXQocmVxLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUV2ZW50TWVzc2FnZShtc2c6IEV2ZW50TWVzc2FnZSk6IHZvaWQge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSB0aGlzLl9wZW5kaW5nRW1pdHRlcnMuZ2V0KG1zZy5yZXEpO1xuXHRcdGlmIChlbWl0dGVyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnNvbGUud2FybignR290IGV2ZW50IGZvciB1bmtub3duIHJlcScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlbWl0dGVyLmZpcmUobXNnLmV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVVuc3Vic2NyaWJlRXZlbnRNZXNzYWdlKG1zZzogVW5zdWJzY3JpYmVFdmVudE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRjb25zdCBldmVudCA9IHRoaXMuX3BlbmRpbmdFdmVudHMuZ2V0KG1zZy5yZXEpO1xuXHRcdGlmIChldmVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oJ0dvdCB1bnN1YnNjcmliZSBmb3IgdW5rbm93biByZXEnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZXZlbnQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3BlbmRpbmdFdmVudHMuZGVsZXRlKG1zZy5yZXEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZChtc2c6IE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFuc2ZlcjogQXJyYXlCdWZmZXJbXSA9IFtdO1xuXHRcdGlmIChtc2cudHlwZSA9PT0gTWVzc2FnZVR5cGUuUmVxdWVzdCkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtc2cuYXJncy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhcmcgPSBtc2cuYXJnc1tpXTtcblx0XHRcdFx0aWYgKGFyZyBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdFx0dHJhbnNmZXIucHVzaChhcmcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChtc2cudHlwZSA9PT0gTWVzc2FnZVR5cGUuUmVwbHkpIHtcblx0XHRcdGlmIChtc2cucmVzIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcblx0XHRcdFx0dHJhbnNmZXIucHVzaChtc2cucmVzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5faGFuZGxlci5zZW5kTWVzc2FnZShtc2csIHRyYW5zZmVyKTtcblx0fVxufVxuXG50eXBlIFByb3hpZWRNZXRob2ROYW1lID0gKGAkJHtzdHJpbmd9YCB8IGBvbiR7c3RyaW5nfWApO1xuXG5leHBvcnQgdHlwZSBQcm94aWVkPFQ+ID0geyBbSyBpbiBrZXlvZiBUXTogVFtLXSBleHRlbmRzICguLi5hcmdzOiBpbmZlciBBKSA9PiBpbmZlciBSXG5cdD8gKFxuXHRcdEsgZXh0ZW5kcyBQcm94aWVkTWV0aG9kTmFtZVxuXHRcdD8gKC4uLmFyZ3M6IEEpID0+IFByb21pc2U8QXdhaXRlZDxSPj5cblx0XHQ6IG5ldmVyXG5cdClcblx0OiBuZXZlclxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJV2ViV29ya2VyQ2xpZW50PFRQcm94eT4ge1xuXHRwcm94eTogUHJveGllZDxUUHJveHk+O1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG5cdHNldENoYW5uZWw8VCBleHRlbmRzIG9iamVjdD4oY2hhbm5lbDogc3RyaW5nLCBoYW5kbGVyOiBUKTogdm9pZDtcblx0Z2V0Q2hhbm5lbDxUIGV4dGVuZHMgb2JqZWN0PihjaGFubmVsOiBzdHJpbmcpOiBQcm94aWVkPFQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXZWJXb3JrZXJTZXJ2ZXIge1xuXHRzZXRDaGFubmVsPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IHN0cmluZywgaGFuZGxlcjogVCk6IHZvaWQ7XG5cdGdldENoYW5uZWw8VCBleHRlbmRzIG9iamVjdD4oY2hhbm5lbDogc3RyaW5nKTogUHJveGllZDxUPjtcbn1cblxuLyoqXG4gKiBNYWluIHRocmVhZCBzaWRlXG4gKi9cbmV4cG9ydCBjbGFzcyBXZWJXb3JrZXJDbGllbnQ8VyBleHRlbmRzIG9iamVjdD4gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdlYldvcmtlckNsaWVudDxXPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd29ya2VyOiBJV2ViV29ya2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vZHVsZUxvYWRlZDogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdG9jb2w6IFdlYldvcmtlclByb3RvY29sO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJveHk6IFByb3hpZWQ8Vz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsQ2hhbm5lbHM6IE1hcDxzdHJpbmcsIG9iamVjdD4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUNoYW5uZWxzOiBNYXA8c3RyaW5nLCBvYmplY3Q+ID0gbmV3IE1hcCgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHdvcmtlcjogSVdlYldvcmtlclxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fd29ya2VyID0gdGhpcy5fcmVnaXN0ZXIod29ya2VyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93b3JrZXIub25NZXNzYWdlKChtc2cpID0+IHtcblx0XHRcdHRoaXMuX3Byb3RvY29sLmhhbmRsZU1lc3NhZ2UobXNnKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya2VyLm9uRXJyb3IoKGVycikgPT4ge1xuXHRcdFx0bG9nT25jZVdlYldvcmtlcldhcm5pbmcoZXJyKTtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcHJvdG9jb2wgPSBuZXcgV2ViV29ya2VyUHJvdG9jb2woe1xuXHRcdFx0c2VuZE1lc3NhZ2U6IChtc2c6IE1lc3NhZ2UsIHRyYW5zZmVyOiBBcnJheUJ1ZmZlcltdKTogdm9pZCA9PiB7XG5cdFx0XHRcdHRoaXMuX3dvcmtlci5wb3N0TWVzc2FnZShtc2csIHRyYW5zZmVyKTtcblx0XHRcdH0sXG5cdFx0XHRoYW5kbGVNZXNzYWdlOiAoY2hhbm5lbDogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVNZXNzYWdlKGNoYW5uZWwsIG1ldGhvZCwgYXJncyk7XG5cdFx0XHR9LFxuXHRcdFx0aGFuZGxlRXZlbnQ6IChjaGFubmVsOiBzdHJpbmcsIGV2ZW50TmFtZTogc3RyaW5nLCBhcmc6IHVua25vd24pOiBFdmVudDx1bmtub3duPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVFdmVudChjaGFubmVsLCBldmVudE5hbWUsIGFyZyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcHJvdG9jb2wuc2V0V29ya2VySWQodGhpcy5fd29ya2VyLmdldElkKCkpO1xuXG5cdFx0Ly8gU2VuZCBpbml0aWFsaXplIG1lc3NhZ2Vcblx0XHR0aGlzLl9vbk1vZHVsZUxvYWRlZCA9IHRoaXMuX3Byb3RvY29sLnNlbmRNZXNzYWdlKERFRkFVTFRfQ0hBTk5FTCwgSU5JVElBTElaRSwgW1xuXHRcdFx0dGhpcy5fd29ya2VyLmdldElkKCksXG5cdFx0XSkudGhlbigoKSA9PiB7IH0pO1xuXG5cdFx0dGhpcy5wcm94eSA9IHRoaXMuX3Byb3RvY29sLmNyZWF0ZVByb3h5VG9SZW1vdGVDaGFubmVsKERFRkFVTFRfQ0hBTk5FTCwgYXN5bmMgKCkgPT4geyBhd2FpdCB0aGlzLl9vbk1vZHVsZUxvYWRlZDsgfSk7XG5cdFx0dGhpcy5fb25Nb2R1bGVMb2FkZWQuY2F0Y2goKGUpID0+IHtcblx0XHRcdHRoaXMuX29uRXJyb3IoJ1dvcmtlciBmYWlsZWQgdG8gbG9hZCAnLCBlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZU1lc3NhZ2UoY2hhbm5lbE5hbWU6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IGNoYW5uZWw6IG9iamVjdCB8IHVuZGVmaW5lZCA9IHRoaXMuX2xvY2FsQ2hhbm5lbHMuZ2V0KGNoYW5uZWxOYW1lKTtcblx0XHRpZiAoIWNoYW5uZWwpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYE1pc3NpbmcgY2hhbm5lbCAke2NoYW5uZWxOYW1lfSBvbiBtYWluIHRocmVhZGApKTtcblx0XHR9XG5cblx0XHRjb25zdCBmbiA9IChjaGFubmVsIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVttZXRob2RdO1xuXHRcdGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYE1pc3NpbmcgbWV0aG9kICR7bWV0aG9kfSBvbiBtYWluIHRocmVhZCBjaGFubmVsICR7Y2hhbm5lbE5hbWV9YCkpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZuLmFwcGx5KGNoYW5uZWwsIGFyZ3MpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlRXZlbnQoY2hhbm5lbE5hbWU6IHN0cmluZywgZXZlbnROYW1lOiBzdHJpbmcsIGFyZzogdW5rbm93bik6IEV2ZW50PHVua25vd24+IHtcblx0XHRjb25zdCBjaGFubmVsOiBvYmplY3QgfCB1bmRlZmluZWQgPSB0aGlzLl9sb2NhbENoYW5uZWxzLmdldChjaGFubmVsTmFtZSk7XG5cdFx0aWYgKCFjaGFubmVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgY2hhbm5lbCAke2NoYW5uZWxOYW1lfSBvbiBtYWluIHRocmVhZGApO1xuXHRcdH1cblx0XHRpZiAocHJvcGVydHlJc0R5bmFtaWNFdmVudChldmVudE5hbWUpKSB7XG5cdFx0XHRjb25zdCBmbiA9IChjaGFubmVsIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtldmVudE5hbWVdO1xuXHRcdFx0aWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZHluYW1pYyBldmVudCAke2V2ZW50TmFtZX0gb24gbWFpbiB0aHJlYWQgY2hhbm5lbCAke2NoYW5uZWxOYW1lfS5gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV2ZW50ID0gZm4uY2FsbChjaGFubmVsLCBhcmcpO1xuXHRcdFx0aWYgKHR5cGVvZiBldmVudCAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZHluYW1pYyBldmVudCAke2V2ZW50TmFtZX0gb24gbWFpbiB0aHJlYWQgY2hhbm5lbCAke2NoYW5uZWxOYW1lfS5gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBldmVudDtcblx0XHR9XG5cdFx0aWYgKHByb3BlcnR5SXNFdmVudChldmVudE5hbWUpKSB7XG5cdFx0XHRjb25zdCBldmVudCA9IChjaGFubmVsIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtldmVudE5hbWVdO1xuXHRcdFx0aWYgKHR5cGVvZiBldmVudCAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZXZlbnQgJHtldmVudE5hbWV9IG9uIG1haW4gdGhyZWFkIGNoYW5uZWwgJHtjaGFubmVsTmFtZX0uYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXZlbnQgYXMgRXZlbnQ8dW5rbm93bj47XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihgTWFsZm9ybWVkIGV2ZW50IG5hbWUgJHtldmVudE5hbWV9YCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q2hhbm5lbDxUIGV4dGVuZHMgb2JqZWN0PihjaGFubmVsOiBzdHJpbmcsIGhhbmRsZXI6IFQpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2NhbENoYW5uZWxzLnNldChjaGFubmVsLCBoYW5kbGVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDaGFubmVsPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IHN0cmluZyk6IFByb3hpZWQ8VD4ge1xuXHRcdGxldCBpbnN0ID0gdGhpcy5fcmVtb3RlQ2hhbm5lbHMuZ2V0KGNoYW5uZWwpO1xuXHRcdGlmIChpbnN0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGluc3QgPSB0aGlzLl9wcm90b2NvbC5jcmVhdGVQcm94eVRvUmVtb3RlQ2hhbm5lbChjaGFubmVsLCBhc3luYyAoKSA9PiB7IGF3YWl0IHRoaXMuX29uTW9kdWxlTG9hZGVkOyB9KTtcblx0XHRcdHRoaXMuX3JlbW90ZUNoYW5uZWxzLnNldChjaGFubmVsLCBpbnN0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGluc3QgYXMgUHJveGllZDxUPjtcblx0fVxuXG5cdHByaXZhdGUgX29uRXJyb3IobWVzc2FnZTogc3RyaW5nLCBlcnJvcj86IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zb2xlLmVycm9yKG1lc3NhZ2UpO1xuXHRcdGNvbnNvbGUuaW5mbyhlcnJvcik7XG5cdH1cbn1cblxuZnVuY3Rpb24gcHJvcGVydHlJc0V2ZW50KG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHQvLyBBc3N1bWUgYSBwcm9wZXJ0eSBpcyBhbiBldmVudCBpZiBpdCBoYXMgYSBmb3JtIG9mIFwib25Tb21ldGhpbmdcIlxuXHRyZXR1cm4gbmFtZVswXSA9PT0gJ28nICYmIG5hbWVbMV0gPT09ICduJyAmJiBzdHJpbmdzLmlzVXBwZXJBc2NpaUxldHRlcihuYW1lLmNoYXJDb2RlQXQoMikpO1xufVxuXG5mdW5jdGlvbiBwcm9wZXJ0eUlzRHluYW1pY0V2ZW50KG5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHQvLyBBc3N1bWUgYSBwcm9wZXJ0eSBpcyBhIGR5bmFtaWMgZXZlbnQgKGEgbWV0aG9kIHRoYXQgcmV0dXJucyBhbiBldmVudCkgaWYgaXQgaGFzIGEgZm9ybSBvZiBcIm9uRHluYW1pY1NvbWV0aGluZ1wiXG5cdHJldHVybiAvXm9uRHluYW1pYy8udGVzdChuYW1lKSAmJiBzdHJpbmdzLmlzVXBwZXJBc2NpaUxldHRlcihuYW1lLmNoYXJDb2RlQXQoOSkpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXZWJXb3JrZXJTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB7XG5cdF9yZXF1ZXN0SGFuZGxlckJyYW5kOiB2b2lkO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRbcHJvcDogc3RyaW5nXTogYW55O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXZWJXb3JrZXJTZXJ2ZXJSZXF1ZXN0SGFuZGxlckZhY3Rvcnk8VCBleHRlbmRzIElXZWJXb3JrZXJTZXJ2ZXJSZXF1ZXN0SGFuZGxlcj4ge1xuXHQod29ya2VyU2VydmVyOiBJV2ViV29ya2VyU2VydmVyKTogVDtcbn1cblxuLyoqXG4gKiBXb3JrZXIgc2lkZVxuICovXG5leHBvcnQgY2xhc3MgV2ViV29ya2VyU2VydmVyPFQgZXh0ZW5kcyBJV2ViV29ya2VyU2VydmVyUmVxdWVzdEhhbmRsZXI+IGltcGxlbWVudHMgSVdlYldvcmtlclNlcnZlciB7XG5cblx0cHVibGljIHJlYWRvbmx5IHJlcXVlc3RIYW5kbGVyOiBUO1xuXHRwcml2YXRlIF9wcm90b2NvbDogV2ViV29ya2VyUHJvdG9jb2w7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsQ2hhbm5lbHM6IE1hcDxzdHJpbmcsIG9iamVjdD4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUNoYW5uZWxzOiBNYXA8c3RyaW5nLCBvYmplY3Q+ID0gbmV3IE1hcCgpO1xuXG5cdGNvbnN0cnVjdG9yKHBvc3RNZXNzYWdlOiAobXNnOiBNZXNzYWdlLCB0cmFuc2Zlcj86IEFycmF5QnVmZmVyW10pID0+IHZvaWQsIHJlcXVlc3RIYW5kbGVyRmFjdG9yeTogSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyRmFjdG9yeTxUPikge1xuXHRcdHRoaXMuX3Byb3RvY29sID0gbmV3IFdlYldvcmtlclByb3RvY29sKHtcblx0XHRcdHNlbmRNZXNzYWdlOiAobXNnOiBNZXNzYWdlLCB0cmFuc2ZlcjogQXJyYXlCdWZmZXJbXSk6IHZvaWQgPT4ge1xuXHRcdFx0XHRwb3N0TWVzc2FnZShtc2csIHRyYW5zZmVyKTtcblx0XHRcdH0sXG5cdFx0XHRoYW5kbGVNZXNzYWdlOiAoY2hhbm5lbDogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPiA9PiB0aGlzLl9oYW5kbGVNZXNzYWdlKGNoYW5uZWwsIG1ldGhvZCwgYXJncyksXG5cdFx0XHRoYW5kbGVFdmVudDogKGNoYW5uZWw6IHN0cmluZywgZXZlbnROYW1lOiBzdHJpbmcsIGFyZzogdW5rbm93bik6IEV2ZW50PHVua25vd24+ID0+IHRoaXMuX2hhbmRsZUV2ZW50KGNoYW5uZWwsIGV2ZW50TmFtZSwgYXJnKVxuXHRcdH0pO1xuXHRcdHRoaXMucmVxdWVzdEhhbmRsZXIgPSByZXF1ZXN0SGFuZGxlckZhY3RvcnkodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgb25tZXNzYWdlKG1zZzogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMuX3Byb3RvY29sLmhhbmRsZU1lc3NhZ2UobXNnKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZU1lc3NhZ2UoY2hhbm5lbDogc3RyaW5nLCBtZXRob2Q6IHN0cmluZywgYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0aWYgKGNoYW5uZWwgPT09IERFRkFVTFRfQ0hBTk5FTCAmJiBtZXRob2QgPT09IElOSVRJQUxJWkUpIHtcblx0XHRcdHJldHVybiB0aGlzLmluaXRpYWxpemUoPG51bWJlcj5hcmdzWzBdKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0SGFuZGxlcjogb2JqZWN0IHwgbnVsbCB8IHVuZGVmaW5lZCA9IChjaGFubmVsID09PSBERUZBVUxUX0NIQU5ORUwgPyB0aGlzLnJlcXVlc3RIYW5kbGVyIDogdGhpcy5fbG9jYWxDaGFubmVscy5nZXQoY2hhbm5lbCkpO1xuXHRcdGlmICghcmVxdWVzdEhhbmRsZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYE1pc3NpbmcgY2hhbm5lbCAke2NoYW5uZWx9IG9uIHdvcmtlciB0aHJlYWRgKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm4gPSAocmVxdWVzdEhhbmRsZXIgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW21ldGhvZF07XG5cdFx0aWYgKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgTWlzc2luZyBtZXRob2QgJHttZXRob2R9IG9uIHdvcmtlciB0aHJlYWQgY2hhbm5lbCAke2NoYW5uZWx9YCkpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZuLmFwcGx5KHJlcXVlc3RIYW5kbGVyLCBhcmdzKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUV2ZW50KGNoYW5uZWw6IHN0cmluZywgZXZlbnROYW1lOiBzdHJpbmcsIGFyZzogdW5rbm93bik6IEV2ZW50PHVua25vd24+IHtcblx0XHRjb25zdCByZXF1ZXN0SGFuZGxlcjogb2JqZWN0IHwgbnVsbCB8IHVuZGVmaW5lZCA9IChjaGFubmVsID09PSBERUZBVUxUX0NIQU5ORUwgPyB0aGlzLnJlcXVlc3RIYW5kbGVyIDogdGhpcy5fbG9jYWxDaGFubmVscy5nZXQoY2hhbm5lbCkpO1xuXHRcdGlmICghcmVxdWVzdEhhbmRsZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBjaGFubmVsICR7Y2hhbm5lbH0gb24gd29ya2VyIHRocmVhZGApO1xuXHRcdH1cblx0XHRpZiAocHJvcGVydHlJc0R5bmFtaWNFdmVudChldmVudE5hbWUpKSB7XG5cdFx0XHRjb25zdCBmbiA9IChyZXF1ZXN0SGFuZGxlciBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbZXZlbnROYW1lXTtcblx0XHRcdGlmICh0eXBlb2YgZm4gIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGR5bmFtaWMgZXZlbnQgJHtldmVudE5hbWV9IG9uIHJlcXVlc3QgaGFuZGxlci5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZXZlbnQgPSBmbi5jYWxsKHJlcXVlc3RIYW5kbGVyLCBhcmcpO1xuXHRcdFx0aWYgKHR5cGVvZiBldmVudCAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZHluYW1pYyBldmVudCAke2V2ZW50TmFtZX0gb24gcmVxdWVzdCBoYW5kbGVyLmApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV2ZW50O1xuXHRcdH1cblx0XHRpZiAocHJvcGVydHlJc0V2ZW50KGV2ZW50TmFtZSkpIHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gKHJlcXVlc3RIYW5kbGVyIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtldmVudE5hbWVdO1xuXHRcdFx0aWYgKHR5cGVvZiBldmVudCAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZXZlbnQgJHtldmVudE5hbWV9IG9uIHJlcXVlc3QgaGFuZGxlci5gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBldmVudCBhcyBFdmVudDx1bmtub3duPjtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBNYWxmb3JtZWQgZXZlbnQgbmFtZSAke2V2ZW50TmFtZX1gKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRDaGFubmVsPFQgZXh0ZW5kcyBvYmplY3Q+KGNoYW5uZWw6IHN0cmluZywgaGFuZGxlcjogVCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvY2FsQ2hhbm5lbHMuc2V0KGNoYW5uZWwsIGhhbmRsZXIpO1xuXHR9XG5cblx0cHVibGljIGdldENoYW5uZWw8VCBleHRlbmRzIG9iamVjdD4oY2hhbm5lbDogc3RyaW5nKTogUHJveGllZDxUPiB7XG5cdFx0bGV0IGluc3QgPSB0aGlzLl9yZW1vdGVDaGFubmVscy5nZXQoY2hhbm5lbCk7XG5cdFx0aWYgKGluc3QgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aW5zdCA9IHRoaXMuX3Byb3RvY29sLmNyZWF0ZVByb3h5VG9SZW1vdGVDaGFubmVsKGNoYW5uZWwpO1xuXHRcdFx0dGhpcy5fcmVtb3RlQ2hhbm5lbHMuc2V0KGNoYW5uZWwsIGluc3QpO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5zdCBhcyBQcm94aWVkPFQ+O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKHdvcmtlcklkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9wcm90b2NvbC5zZXRXb3JrZXJJZCh3b3JrZXJJZCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW9DLHNDQUFzQztBQUNuRixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsYUFBYTtBQUN0QixZQUFZLGFBQWE7QUFFekIsTUFBTSxrQkFBa0I7QUFDeEIsTUFBTSxhQUFhO0FBU25CLElBQUkseUJBQXlCO0FBQ3RCLFNBQVMsd0JBQXdCLEtBQW9CO0FBQzNELE1BQUksQ0FBQyxPQUFPO0FBRVg7QUFBQSxFQUNEO0FBQ0EsTUFBSSxDQUFDLHdCQUF3QjtBQUM1Qiw2QkFBeUI7QUFDekIsWUFBUSxLQUFLLGlMQUFpTDtBQUFBLEVBQy9MO0FBQ0EsVUFBUSxLQUFNLElBQWMsT0FBTztBQUNwQztBQUVBLElBQVcsY0FBWCxrQkFBV0EsaUJBQVg7QUFDQyxFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBQ0EsRUFBQUEsMEJBQUE7QUFDQSxFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBTFUsU0FBQUE7QUFBQSxHQUFBO0FBT1gsTUFBTSxlQUFlO0FBQUEsRUFFcEIsWUFDaUIsVUFDQSxLQUNBLFNBQ0EsUUFDQSxNQUNmO0FBTGU7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQU5qQixTQUFnQixPQUFPO0FBQUEsRUFPbkI7QUFDTDtBQUNBLE1BQU0sYUFBYTtBQUFBLEVBRWxCLFlBQ2lCLFVBQ0EsS0FDQSxLQUNB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
