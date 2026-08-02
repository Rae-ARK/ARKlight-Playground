import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ProxyIdentifier, SerializableObjectWithBuffers } from "../../common/proxyIdentifier.js";
import { RPCProtocol } from "../../common/rpcProtocol.js";
suite("RPCProtocol", () => {
  let disposables;
  class MessagePassingProtocol {
    constructor() {
      this._onMessage = new Emitter();
      this.onMessage = this._onMessage.event;
    }
    setPair(other) {
      this._pair = other;
    }
    send(buffer) {
      Promise.resolve().then(() => {
        this._pair._onMessage.fire(buffer);
      });
    }
  }
  let delegate;
  let bProxy;
  class BClass {
    $m(a1, a2) {
      return Promise.resolve(delegate.call(null, a1, a2));
    }
  }
  setup(() => {
    disposables = new DisposableStore();
    const a_protocol = new MessagePassingProtocol();
    const b_protocol = new MessagePassingProtocol();
    a_protocol.setPair(b_protocol);
    b_protocol.setPair(a_protocol);
    const A = disposables.add(new RPCProtocol(a_protocol));
    const B = disposables.add(new RPCProtocol(b_protocol));
    const bIdentifier = new ProxyIdentifier("bb");
    const bInstance = new BClass();
    B.set(bIdentifier, bInstance);
    bProxy = A.getProxy(bIdentifier);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("simple call", function(done) {
    delegate = (a1, a2) => a1 + a2;
    bProxy.$m(4, 1).then((res) => {
      assert.strictEqual(res, 5);
      done(null);
    }, done);
  });
  test("simple call without result", function(done) {
    delegate = (a1, a2) => {
    };
    bProxy.$m(4, 1).then((res) => {
      assert.strictEqual(res, void 0);
      done(null);
    }, done);
  });
  test("passing buffer as argument", function(done) {
    delegate = (a1, a2) => {
      assert.ok(a1 instanceof VSBuffer);
      return a1.buffer[a2];
    };
    const b = VSBuffer.alloc(4);
    b.buffer[0] = 1;
    b.buffer[1] = 2;
    b.buffer[2] = 3;
    b.buffer[3] = 4;
    bProxy.$m(b, 2).then((res) => {
      assert.strictEqual(res, 3);
      done(null);
    }, done);
  });
  test("returning a buffer", function(done) {
    delegate = (a1, a2) => {
      const b = VSBuffer.alloc(4);
      b.buffer[0] = 1;
      b.buffer[1] = 2;
      b.buffer[2] = 3;
      b.buffer[3] = 4;
      return b;
    };
    bProxy.$m(4, 1).then((res) => {
      assert.ok(res instanceof VSBuffer);
      assert.strictEqual(res.buffer[0], 1);
      assert.strictEqual(res.buffer[1], 2);
      assert.strictEqual(res.buffer[2], 3);
      assert.strictEqual(res.buffer[3], 4);
      done(null);
    }, done);
  });
  test("cancelling a call via CancellationToken before", function(done) {
    delegate = (a1, a2) => a1 + a2;
    const p = bProxy.$m(4, CancellationToken.Cancelled);
    p.then((res) => {
      assert.fail("should not receive result");
    }, (err) => {
      assert.ok(true);
      done(null);
    });
  });
  test("passing CancellationToken.None", function(done) {
    delegate = (a1, token) => {
      assert.ok(!!token);
      return a1 + 1;
    };
    bProxy.$m(4, CancellationToken.None).then((res) => {
      assert.strictEqual(res, 5);
      done(null);
    }, done);
  });
  test("cancelling a call via CancellationToken quickly", function(done) {
    delegate = (a1, token) => {
      return new Promise((resolve, reject) => {
        const disposable = token.onCancellationRequested((e) => {
          disposable.dispose();
          resolve(7);
        });
      });
    };
    const tokenSource = new CancellationTokenSource();
    const p = bProxy.$m(4, tokenSource.token);
    p.then((res) => {
      assert.strictEqual(res, 7);
    }, (err) => {
      assert.fail("should not receive error");
    }).finally(done);
    tokenSource.cancel();
  });
  test("throwing an error", function(done) {
    delegate = (a1, a2) => {
      throw new Error(`nope`);
    };
    bProxy.$m(4, 1).then((res) => {
      assert.fail("unexpected");
    }, (err) => {
      assert.strictEqual(err.message, "nope");
    }).finally(done);
  });
  test("error promise", function(done) {
    delegate = (a1, a2) => {
      return Promise.reject(void 0);
    };
    bProxy.$m(4, 1).then((res) => {
      assert.fail("unexpected");
    }, (err) => {
      assert.strictEqual(err, void 0);
    }).finally(done);
  });
  test("issue #60450: Converting circular structure to JSON", function(done) {
    delegate = (a1, a2) => {
      const circular = {};
      circular.self = circular;
      return circular;
    };
    bProxy.$m(4, 1).then((res) => {
      assert.strictEqual(res, null);
    }, (err) => {
      assert.fail("unexpected");
    }).finally(done);
  });
  test("issue #72798: null errors are hard to digest", function(done) {
    delegate = (a1, a2) => {
      throw { "what": "what" };
    };
    bProxy.$m(4, 1).then((res) => {
      assert.fail("unexpected");
    }, (err) => {
      assert.strictEqual(err.what, "what");
    }).finally(done);
  });
  test("undefined arguments arrive as null", function() {
    delegate = (a1, a2) => {
      assert.strictEqual(typeof a1, "undefined");
      assert.strictEqual(a2, null);
      return 7;
    };
    return bProxy.$m(void 0, null).then((res) => {
      assert.strictEqual(res, 7);
    });
  });
  test("issue #81424: SerializeRequest should throw if an argument can not be serialized", () => {
    const badObject = {};
    badObject.loop = badObject;
    assert.throws(() => {
      bProxy.$m(badObject, "2");
    });
  });
  test("SerializableObjectWithBuffers is correctly transfered", function(done) {
    delegate = (a1, a2) => {
      return new SerializableObjectWithBuffers({ string: a1.value.string + " world", buff: a1.value.buff });
    };
    const b = VSBuffer.alloc(4);
    b.buffer[0] = 1;
    b.buffer[1] = 2;
    b.buffer[2] = 3;
    b.buffer[3] = 4;
    bProxy.$m(new SerializableObjectWithBuffers({ string: "hello", buff: b }), void 0).then((res) => {
      assert.ok(res instanceof SerializableObjectWithBuffers);
      assert.strictEqual(res.value.string, "hello world");
      assert.ok(res.value.buff instanceof VSBuffer);
      const bufferValues = Array.from(res.value.buff.buffer);
      assert.strictEqual(bufferValues[0], 1);
      assert.strictEqual(bufferValues[1], 2);
      assert.strictEqual(bufferValues[2], 3);
      assert.strictEqual(bufferValues[3], 4);
      done(null);
    }, done);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL3Rlc3QvY29tbW9uL3JwY1Byb3RvY29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUHJveHlJZGVudGlmaWVyLCBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgUlBDUHJvdG9jb2wgfSBmcm9tICcuLi8uLi9jb21tb24vcnBjUHJvdG9jb2wuanMnO1xuXG5zdWl0ZSgnUlBDUHJvdG9jb2wnLCAoKSA9PiB7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0Y2xhc3MgTWVzc2FnZVBhc3NpbmdQcm90b2NvbCBpbXBsZW1lbnRzIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIHtcblx0XHRwcml2YXRlIF9wYWlyPzogTWVzc2FnZVBhc3NpbmdQcm90b2NvbDtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uTWVzc2FnZSA9IG5ldyBFbWl0dGVyPFZTQnVmZmVyPigpO1xuXHRcdHB1YmxpYyByZWFkb25seSBvbk1lc3NhZ2U6IEV2ZW50PFZTQnVmZmVyPiA9IHRoaXMuX29uTWVzc2FnZS5ldmVudDtcblxuXHRcdHB1YmxpYyBzZXRQYWlyKG90aGVyOiBNZXNzYWdlUGFzc2luZ1Byb3RvY29sKSB7XG5cdFx0XHR0aGlzLl9wYWlyID0gb3RoZXI7XG5cdFx0fVxuXG5cdFx0cHVibGljIHNlbmQoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdFx0UHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3BhaXIhLl9vbk1lc3NhZ2UuZmlyZShidWZmZXIpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGRlbGVnYXRlOiAoYTE6IGFueSwgYTI6IGFueSkgPT4gYW55O1xuXHRsZXQgYlByb3h5OiBCQ2xhc3M7XG5cdGNsYXNzIEJDbGFzcyB7XG5cdFx0JG0oYTE6IGFueSwgYTI6IGFueSk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGRlbGVnYXRlLmNhbGwobnVsbCwgYTEsIGEyKSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgYV9wcm90b2NvbCA9IG5ldyBNZXNzYWdlUGFzc2luZ1Byb3RvY29sKCk7XG5cdFx0Y29uc3QgYl9wcm90b2NvbCA9IG5ldyBNZXNzYWdlUGFzc2luZ1Byb3RvY29sKCk7XG5cdFx0YV9wcm90b2NvbC5zZXRQYWlyKGJfcHJvdG9jb2wpO1xuXHRcdGJfcHJvdG9jb2wuc2V0UGFpcihhX3Byb3RvY29sKTtcblxuXHRcdGNvbnN0IEEgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJQQ1Byb3RvY29sKGFfcHJvdG9jb2wpKTtcblx0XHRjb25zdCBCID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSUENQcm90b2NvbChiX3Byb3RvY29sKSk7XG5cblx0XHRjb25zdCBiSWRlbnRpZmllciA9IG5ldyBQcm94eUlkZW50aWZpZXI8QkNsYXNzPignYmInKTtcblx0XHRjb25zdCBiSW5zdGFuY2UgPSBuZXcgQkNsYXNzKCk7XG5cdFx0Qi5zZXQoYklkZW50aWZpZXIsIGJJbnN0YW5jZSk7XG5cdFx0YlByb3h5ID0gQS5nZXRQcm94eShiSWRlbnRpZmllcik7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3NpbXBsZSBjYWxsJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogbnVtYmVyLCBhMjogbnVtYmVyKSA9PiBhMSArIGEyO1xuXHRcdGJQcm94eS4kbSg0LCAxKS50aGVuKChyZXM6IG51bWJlcikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcywgNSk7XG5cdFx0XHRkb25lKG51bGwpO1xuXHRcdH0sIGRvbmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW1wbGUgY2FsbCB3aXRob3V0IHJlc3VsdCcsIGZ1bmN0aW9uIChkb25lKSB7XG5cdFx0ZGVsZWdhdGUgPSAoYTE6IG51bWJlciwgYTI6IG51bWJlcikgPT4geyB9O1xuXHRcdGJQcm94eS4kbSg0LCAxKS50aGVuKChyZXM6IG51bWJlcikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcywgdW5kZWZpbmVkKTtcblx0XHRcdGRvbmUobnVsbCk7XG5cdFx0fSwgZG9uZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bhc3NpbmcgYnVmZmVyIGFzIGFyZ3VtZW50JywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogVlNCdWZmZXIsIGEyOiBudW1iZXIpID0+IHtcblx0XHRcdGFzc2VydC5vayhhMSBpbnN0YW5jZW9mIFZTQnVmZmVyKTtcblx0XHRcdHJldHVybiBhMS5idWZmZXJbYTJdO1xuXHRcdH07XG5cdFx0Y29uc3QgYiA9IFZTQnVmZmVyLmFsbG9jKDQpO1xuXHRcdGIuYnVmZmVyWzBdID0gMTtcblx0XHRiLmJ1ZmZlclsxXSA9IDI7XG5cdFx0Yi5idWZmZXJbMl0gPSAzO1xuXHRcdGIuYnVmZmVyWzNdID0gNDtcblx0XHRiUHJveHkuJG0oYiwgMikudGhlbigocmVzOiBudW1iZXIpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMsIDMpO1xuXHRcdFx0ZG9uZShudWxsKTtcblx0XHR9LCBkb25lKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJuaW5nIGEgYnVmZmVyJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogbnVtYmVyLCBhMjogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBiID0gVlNCdWZmZXIuYWxsb2MoNCk7XG5cdFx0XHRiLmJ1ZmZlclswXSA9IDE7XG5cdFx0XHRiLmJ1ZmZlclsxXSA9IDI7XG5cdFx0XHRiLmJ1ZmZlclsyXSA9IDM7XG5cdFx0XHRiLmJ1ZmZlclszXSA9IDQ7XG5cdFx0XHRyZXR1cm4gYjtcblx0XHR9O1xuXHRcdGJQcm94eS4kbSg0LCAxKS50aGVuKChyZXM6IFZTQnVmZmVyKSA9PiB7XG5cdFx0XHRhc3NlcnQub2socmVzIGluc3RhbmNlb2YgVlNCdWZmZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5idWZmZXJbMF0sIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5idWZmZXJbMV0sIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5idWZmZXJbMl0sIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5idWZmZXJbM10sIDQpO1xuXHRcdFx0ZG9uZShudWxsKTtcblx0XHR9LCBkb25lKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuY2VsbGluZyBhIGNhbGwgdmlhIENhbmNlbGxhdGlvblRva2VuIGJlZm9yZScsIGZ1bmN0aW9uIChkb25lKSB7XG5cdFx0ZGVsZWdhdGUgPSAoYTE6IG51bWJlciwgYTI6IG51bWJlcikgPT4gYTEgKyBhMjtcblx0XHRjb25zdCBwID0gYlByb3h5LiRtKDQsIENhbmNlbGxhdGlvblRva2VuLkNhbmNlbGxlZCk7XG5cdFx0cC50aGVuKChyZXM6IG51bWJlcikgPT4ge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3Nob3VsZCBub3QgcmVjZWl2ZSByZXN1bHQnKTtcblx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRhc3NlcnQub2sodHJ1ZSk7XG5cdFx0XHRkb25lKG51bGwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXNzaW5nIENhbmNlbGxhdGlvblRva2VuLk5vbmUnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGRlbGVnYXRlID0gKGExOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKCEhdG9rZW4pO1xuXHRcdFx0cmV0dXJuIGExICsgMTtcblx0XHR9O1xuXHRcdGJQcm94eS4kbSg0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKChyZXM6IG51bWJlcikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcywgNSk7XG5cdFx0XHRkb25lKG51bGwpO1xuXHRcdH0sIGRvbmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsaW5nIGEgY2FsbCB2aWEgQ2FuY2VsbGF0aW9uVG9rZW4gcXVpY2tseScsIGZ1bmN0aW9uIChkb25lKSB7XG5cdFx0Ly8gdGhpcyBpcyBhbiBpbXBsZW1lbnRhdGlvbiB3aGljaCwgd2hlbiBjYW5jZWxsYXRpb24gaXMgdHJpZ2dlcmVkLCB3aWxsIHJldHVybiA3XG5cdFx0ZGVsZWdhdGUgPSAoYTE6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKGUpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKDcpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgdG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBwID0gYlByb3h5LiRtKDQsIHRva2VuU291cmNlLnRva2VuKTtcblx0XHRwLnRoZW4oKHJlczogbnVtYmVyKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCA3KTtcblx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRhc3NlcnQuZmFpbCgnc2hvdWxkIG5vdCByZWNlaXZlIGVycm9yJyk7XG5cdFx0fSkuZmluYWxseShkb25lKTtcblx0XHR0b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0fSk7XG5cblx0dGVzdCgndGhyb3dpbmcgYW4gZXJyb3InLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGRlbGVnYXRlID0gKGExOiBudW1iZXIsIGEyOiBudW1iZXIpID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgbm9wZWApO1xuXHRcdH07XG5cdFx0YlByb3h5LiRtKDQsIDEpLnRoZW4oKHJlcykgPT4ge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ3VuZXhwZWN0ZWQnKTtcblx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyLm1lc3NhZ2UsICdub3BlJyk7XG5cdFx0fSkuZmluYWxseShkb25lKTtcblx0fSk7XG5cblx0dGVzdCgnZXJyb3IgcHJvbWlzZScsIGZ1bmN0aW9uIChkb25lKSB7XG5cdFx0ZGVsZWdhdGUgPSAoYTE6IG51bWJlciwgYTI6IG51bWJlcikgPT4ge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KHVuZGVmaW5lZCk7XG5cdFx0fTtcblx0XHRiUHJveHkuJG0oNCwgMSkudGhlbigocmVzKSA9PiB7XG5cdFx0XHRhc3NlcnQuZmFpbCgndW5leHBlY3RlZCcpO1xuXHRcdH0sIChlcnIpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIsIHVuZGVmaW5lZCk7XG5cdFx0fSkuZmluYWxseShkb25lKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzYwNDUwOiBDb252ZXJ0aW5nIGNpcmN1bGFyIHN0cnVjdHVyZSB0byBKU09OJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogbnVtYmVyLCBhMjogbnVtYmVyKSA9PiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGNvbnN0IGNpcmN1bGFyID0gPGFueT57fTtcblx0XHRcdGNpcmN1bGFyLnNlbGYgPSBjaXJjdWxhcjtcblx0XHRcdHJldHVybiBjaXJjdWxhcjtcblx0XHR9O1xuXHRcdGJQcm94eS4kbSg0LCAxKS50aGVuKChyZXMpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMsIG51bGwpO1xuXHRcdH0sIChlcnIpID0+IHtcblx0XHRcdGFzc2VydC5mYWlsKCd1bmV4cGVjdGVkJyk7XG5cdFx0fSkuZmluYWxseShkb25lKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzcyNzk4OiBudWxsIGVycm9ycyBhcmUgaGFyZCB0byBkaWdlc3QnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGRlbGVnYXRlID0gKGExOiBudW1iZXIsIGEyOiBudW1iZXIpID0+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby10aHJvdy1saXRlcmFsXG5cdFx0XHR0aHJvdyB7ICd3aGF0JzogJ3doYXQnIH07XG5cdFx0fTtcblx0XHRiUHJveHkuJG0oNCwgMSkudGhlbigocmVzKSA9PiB7XG5cdFx0XHRhc3NlcnQuZmFpbCgndW5leHBlY3RlZCcpO1xuXHRcdH0sIChlcnIpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIud2hhdCwgJ3doYXQnKTtcblx0XHR9KS5maW5hbGx5KGRvbmUpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmRlZmluZWQgYXJndW1lbnRzIGFycml2ZSBhcyBudWxsJywgZnVuY3Rpb24gKCkge1xuXHRcdGRlbGVnYXRlID0gKGExOiBhbnksIGEyOiBhbnkpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgYTEsICd1bmRlZmluZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhMiwgbnVsbCk7XG5cdFx0XHRyZXR1cm4gNztcblx0XHR9O1xuXHRcdHJldHVybiBiUHJveHkuJG0odW5kZWZpbmVkLCBudWxsKS50aGVuKChyZXMpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMsIDcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODE0MjQ6IFNlcmlhbGl6ZVJlcXVlc3Qgc2hvdWxkIHRocm93IGlmIGFuIGFyZ3VtZW50IGNhbiBub3QgYmUgc2VyaWFsaXplZCcsICgpID0+IHtcblx0XHRjb25zdCBiYWRPYmplY3QgPSB7fTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHQoPGFueT5iYWRPYmplY3QpLmxvb3AgPSBiYWRPYmplY3Q7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdGJQcm94eS4kbShiYWRPYmplY3QsICcyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIGlzIGNvcnJlY3RseSB0cmFuc2ZlcmVkJywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRkZWxlZ2F0ZSA9IChhMTogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8eyBzdHJpbmc6IHN0cmluZzsgYnVmZjogVlNCdWZmZXIgfT4sIGEyOiBudW1iZXIpID0+IHtcblx0XHRcdHJldHVybiBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBzdHJpbmc6IGExLnZhbHVlLnN0cmluZyArICcgd29ybGQnLCBidWZmOiBhMS52YWx1ZS5idWZmIH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBiID0gVlNCdWZmZXIuYWxsb2MoNCk7XG5cdFx0Yi5idWZmZXJbMF0gPSAxO1xuXHRcdGIuYnVmZmVyWzFdID0gMjtcblx0XHRiLmJ1ZmZlclsyXSA9IDM7XG5cdFx0Yi5idWZmZXJbM10gPSA0O1xuXG5cdFx0YlByb3h5LiRtKG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7IHN0cmluZzogJ2hlbGxvJywgYnVmZjogYiB9KSwgdW5kZWZpbmVkKS50aGVuKChyZXM6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPGFueT4pID0+IHtcblx0XHRcdGFzc2VydC5vayhyZXMgaW5zdGFuY2VvZiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnZhbHVlLnN0cmluZywgJ2hlbGxvIHdvcmxkJyk7XG5cblx0XHRcdGFzc2VydC5vayhyZXMudmFsdWUuYnVmZiBpbnN0YW5jZW9mIFZTQnVmZmVyKTtcblxuXHRcdFx0Y29uc3QgYnVmZmVyVmFsdWVzID0gQXJyYXkuZnJvbShyZXMudmFsdWUuYnVmZi5idWZmZXIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyVmFsdWVzWzBdLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWZmZXJWYWx1ZXNbMV0sIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1ZmZlclZhbHVlc1syXSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVmZmVyVmFsdWVzWzNdLCA0KTtcblx0XHRcdGRvbmUobnVsbCk7XG5cdFx0fSwgZG9uZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQkFBaUIscUNBQXFDO0FBQy9ELFNBQVMsbUJBQW1CO0FBRTVCLE1BQU0sZUFBZSxNQUFNO0FBRTFCLE1BQUk7QUFBQSxFQUVKLE1BQU0sdUJBQTBEO0FBQUEsSUFBaEU7QUFHQyxXQUFpQixhQUFhLElBQUksUUFBa0I7QUFDcEQsV0FBZ0IsWUFBNkIsS0FBSyxXQUFXO0FBQUE7QUFBQSxJQUV0RCxRQUFRLE9BQStCO0FBQzdDLFdBQUssUUFBUTtBQUFBLElBQ2Q7QUFBQSxJQUVPLEtBQUssUUFB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
