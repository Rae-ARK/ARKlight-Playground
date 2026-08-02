import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { JSON_RPC_PARSE_ERROR } from "../common/state/sessionProtocol.js";
class MessagePortProtocolServer extends Disposable {
  constructor() {
    super(...arguments);
    this._onConnection = this._register(new Emitter());
    this.onConnection = this._onConnection.event;
    this.address = void 0;
    this._transports = /* @__PURE__ */ new Map();
  }
  listen(ctx, event) {
    switch (event) {
      case "frame":
        return this._getOrCreateTransport(ctx).onFrame;
      case "close":
        return this._getOrCreateTransport(ctx).onClose;
    }
    throw new Error(`Invalid listen: ${event}`);
  }
  async call(ctx, command, arg) {
    switch (command) {
      case "connect": {
        const transport = this._getOrCreateTransport(ctx);
        if (transport.connect()) {
          this._onConnection.fire(transport);
        }
        return void 0;
      }
      case "send": {
        if (typeof arg !== "string") {
          throw new Error("send: arg must be a string frame");
        }
        const transport = this._transports.get(ctx);
        if (!transport?.isConnected) {
          throw new Error("send: client is not connected");
        }
        transport.acceptFrame(arg);
        return void 0;
      }
      case "close":
        this.closeClient(ctx);
        return void 0;
    }
    throw new Error(`Invalid call: ${command}`);
  }
  /**
   * Closes a client's transport after its owning IPC connection disappears.
   */
  closeClient(ctx) {
    const transport = this._transports.get(ctx);
    if (!transport) {
      return;
    }
    this._transports.delete(ctx);
    transport.dispose();
  }
  dispose() {
    const transports = [...this._transports.values()];
    this._transports.clear();
    for (const transport of transports) {
      transport.dispose();
    }
    super.dispose();
  }
  _getOrCreateTransport(ctx) {
    if (this._store.isDisposed) {
      throw new Error("MessagePortProtocolServer is disposed");
    }
    let transport = this._transports.get(ctx);
    if (!transport) {
      transport = new MessagePortProtocolTransport();
      this._transports.set(ctx, transport);
      const onClose = transport.onClose(() => {
        onClose.dispose();
        if (this._transports.get(ctx) === transport) {
          this._transports.delete(ctx);
        }
      });
    }
    return transport;
  }
}
class MessagePortProtocolTransport extends Disposable {
  constructor() {
    super(...arguments);
    this._onFrame = this._register(new Emitter());
    this.onFrame = this._onFrame.event;
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this._isConnected = false;
    this._isClosed = false;
  }
  get isConnected() {
    return this._isConnected && !this._isClosed;
  }
  connect() {
    if (this._isClosed || this._isConnected) {
      return false;
    }
    this._isConnected = true;
    return true;
  }
  acceptFrame(frame) {
    try {
      this._onMessage.fire(JSON.parse(frame));
    } catch {
      this.send({ jsonrpc: "2.0", id: null, error: { code: JSON_RPC_PARSE_ERROR, message: "Parse error" } });
    }
  }
  send(message) {
    if (!this.isConnected) {
      return;
    }
    this._onFrame.fire(JSON.stringify(message));
  }
  dispose() {
    if (this._isClosed) {
      return;
    }
    this._isClosed = true;
    this._isConnected = false;
    this._onClose.fire();
    super.dispose();
  }
}
export {
  MessagePortProtocolServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL21lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVNlcnZlckNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IEpTT05fUlBDX1BBUlNFX0VSUk9SLCB0eXBlIEFocFNlcnZlck5vdGlmaWNhdGlvbiwgdHlwZSBKc29uUnBjTm90aWZpY2F0aW9uLCB0eXBlIEpzb25ScGNQYXJzZUVycm9yUmVzcG9uc2UsIHR5cGUgSnNvblJwY1JlcXVlc3QsIHR5cGUgSnNvblJwY1Jlc3BvbnNlLCB0eXBlIFByb3RvY29sTWVzc2FnZSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvdG9jb2xTZXJ2ZXIsIElQcm90b2NvbFRyYW5zcG9ydCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uVHJhbnNwb3J0LmpzJztcblxuLyoqXG4gKiBBZGFwdHMgTWVzc2FnZVBvcnQgSVBDIGNsaWVudHMgdG8gQWdlbnQgSG9zdCBQcm90b2NvbCB0cmFuc3BvcnRzLlxuICpcbiAqIENvbnN1bWVycyBtdXN0IGNhbGwge0BsaW5rIGNsb3NlQ2xpZW50fSB3aGVuIGEgVXRpbGl0eVByb2Nlc3NTZXJ2ZXIgY2xpZW50XG4gKiBjb25uZWN0aW9uIGRpc2FwcGVhcnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBNZXNzYWdlUG9ydFByb3RvY29sU2VydmVyPFRDb250ZXh0PiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJvdG9jb2xTZXJ2ZXIsIElTZXJ2ZXJDaGFubmVsPFRDb250ZXh0PiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Db25uZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByb3RvY29sVHJhbnNwb3J0PigpKTtcblx0cmVhZG9ubHkgb25Db25uZWN0aW9uID0gdGhpcy5fb25Db25uZWN0aW9uLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGFkZHJlc3MgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNwb3J0cyA9IG5ldyBNYXA8VENvbnRleHQsIE1lc3NhZ2VQb3J0UHJvdG9jb2xUcmFuc3BvcnQ+KCk7XG5cblx0bGlzdGVuPFQ+KGN0eDogVENvbnRleHQsIGV2ZW50OiBzdHJpbmcpOiBFdmVudDxUPiB7XG5cdFx0c3dpdGNoIChldmVudCkge1xuXHRcdFx0Y2FzZSAnZnJhbWUnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0T3JDcmVhdGVUcmFuc3BvcnQoY3R4KS5vbkZyYW1lIGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSAnY2xvc2UnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0T3JDcmVhdGVUcmFuc3BvcnQoY3R4KS5vbkNsb3NlIGFzIEV2ZW50PFQ+O1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBsaXN0ZW46ICR7ZXZlbnR9YCk7XG5cdH1cblxuXHRhc3luYyBjYWxsPFQ+KGN0eDogVENvbnRleHQsIGNvbW1hbmQ6IHN0cmluZywgYXJnPzogdW5rbm93bik6IFByb21pc2U8VD4ge1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSAnY29ubmVjdCc6IHtcblx0XHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gdGhpcy5fZ2V0T3JDcmVhdGVUcmFuc3BvcnQoY3R4KTtcblx0XHRcdFx0aWYgKHRyYW5zcG9ydC5jb25uZWN0KCkpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkNvbm5lY3Rpb24uZmlyZSh0cmFuc3BvcnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQgYXMgVDtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3NlbmQnOiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgYXJnICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignc2VuZDogYXJnIG11c3QgYmUgYSBzdHJpbmcgZnJhbWUnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IHRoaXMuX3RyYW5zcG9ydHMuZ2V0KGN0eCk7XG5cdFx0XHRcdGlmICghdHJhbnNwb3J0Py5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignc2VuZDogY2xpZW50IGlzIG5vdCBjb25uZWN0ZWQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyYW5zcG9ydC5hY2NlcHRGcmFtZShhcmcpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkIGFzIFQ7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdjbG9zZSc6XG5cdFx0XHRcdHRoaXMuY2xvc2VDbGllbnQoY3R4KTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZCBhcyBUO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBjYWxsOiAke2NvbW1hbmR9YCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2xvc2VzIGEgY2xpZW50J3MgdHJhbnNwb3J0IGFmdGVyIGl0cyBvd25pbmcgSVBDIGNvbm5lY3Rpb24gZGlzYXBwZWFycy5cblx0ICovXG5cdGNsb3NlQ2xpZW50KGN0eDogVENvbnRleHQpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSB0aGlzLl90cmFuc3BvcnRzLmdldChjdHgpO1xuXHRcdGlmICghdHJhbnNwb3J0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdHJhbnNwb3J0cy5kZWxldGUoY3R4KTtcblx0XHR0cmFuc3BvcnQuZGlzcG9zZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFuc3BvcnRzID0gWy4uLnRoaXMuX3RyYW5zcG9ydHMudmFsdWVzKCldO1xuXHRcdHRoaXMuX3RyYW5zcG9ydHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHRyYW5zcG9ydCBvZiB0cmFuc3BvcnRzKSB7XG5cdFx0XHR0cmFuc3BvcnQuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZVRyYW5zcG9ydChjdHg6IFRDb250ZXh0KTogTWVzc2FnZVBvcnRQcm90b2NvbFRyYW5zcG9ydCB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlciBpcyBkaXNwb3NlZCcpO1xuXHRcdH1cblxuXHRcdGxldCB0cmFuc3BvcnQgPSB0aGlzLl90cmFuc3BvcnRzLmdldChjdHgpO1xuXHRcdGlmICghdHJhbnNwb3J0KSB7XG5cdFx0XHR0cmFuc3BvcnQgPSBuZXcgTWVzc2FnZVBvcnRQcm90b2NvbFRyYW5zcG9ydCgpO1xuXHRcdFx0dGhpcy5fdHJhbnNwb3J0cy5zZXQoY3R4LCB0cmFuc3BvcnQpO1xuXG5cdFx0XHRjb25zdCBvbkNsb3NlID0gdHJhbnNwb3J0Lm9uQ2xvc2UoKCkgPT4ge1xuXHRcdFx0XHRvbkNsb3NlLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKHRoaXMuX3RyYW5zcG9ydHMuZ2V0KGN0eCkgPT09IHRyYW5zcG9ydCkge1xuXHRcdFx0XHRcdHRoaXMuX3RyYW5zcG9ydHMuZGVsZXRlKGN0eCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cmFuc3BvcnQ7XG5cdH1cbn1cblxuY2xhc3MgTWVzc2FnZVBvcnRQcm90b2NvbFRyYW5zcG9ydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJvdG9jb2xUcmFuc3BvcnQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRnJhbWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkZyYW1lID0gdGhpcy5fb25GcmFtZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQcm90b2NvbE1lc3NhZ2U+KCkpO1xuXHRyZWFkb25seSBvbk1lc3NhZ2UgPSB0aGlzLl9vbk1lc3NhZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25DbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkNsb3NlID0gdGhpcy5fb25DbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIF9pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc0Nsb3NlZCA9IGZhbHNlO1xuXG5cdGdldCBpc0Nvbm5lY3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNDb25uZWN0ZWQgJiYgIXRoaXMuX2lzQ2xvc2VkO1xuXHR9XG5cblx0Y29ubmVjdCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5faXNDbG9zZWQgfHwgdGhpcy5faXNDb25uZWN0ZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9pc0Nvbm5lY3RlZCA9IHRydWU7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhY2NlcHRGcmFtZShmcmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX29uTWVzc2FnZS5maXJlKEpTT04ucGFyc2UoZnJhbWUpIGFzIFByb3RvY29sTWVzc2FnZSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLnNlbmQoeyBqc29ucnBjOiAnMi4wJywgaWQ6IG51bGwsIGVycm9yOiB7IGNvZGU6IEpTT05fUlBDX1BBUlNFX0VSUk9SLCBtZXNzYWdlOiAnUGFyc2UgZXJyb3InIH0gfSk7XG5cdFx0fVxuXHR9XG5cblx0c2VuZChtZXNzYWdlOiBQcm90b2NvbE1lc3NhZ2UgfCBBaHBTZXJ2ZXJOb3RpZmljYXRpb24gfCBKc29uUnBjTm90aWZpY2F0aW9uIHwgSnNvblJwY1BhcnNlRXJyb3JSZXNwb25zZSB8IEpzb25ScGNSZXNwb25zZSB8IEpzb25ScGNSZXF1ZXN0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25GcmFtZS5maXJlKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzQ2xvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNDbG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX2lzQ29ubmVjdGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fb25D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
