import assert from "assert";
import { timeout } from "../../../../common/async.js";
import { VSBuffer } from "../../../../common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../common/cancellation.js";
import { canceled } from "../../../../common/errors.js";
import { Emitter, Event } from "../../../../common/event.js";
import { DisposableStore } from "../../../../common/lifecycle.js";
import { isEqual } from "../../../../common/resources.js";
import { URI } from "../../../../common/uri.js";
import { BufferReader, BufferWriter, ChannelClient, ChannelServer, deserialize, IPCClient, IPCServer, ProxyChannel, serialize } from "../../common/ipc.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../test/common/utils.js";
class QueueProtocol {
  constructor() {
    this.buffering = true;
    this.buffers = [];
    this._onMessage = new Emitter({
      onDidAddFirstListener: () => {
        for (const buffer of this.buffers) {
          this._onMessage.fire(buffer);
        }
        this.buffers = [];
        this.buffering = false;
      },
      onDidRemoveLastListener: () => {
        this.buffering = true;
      }
    });
    this.onMessage = this._onMessage.event;
  }
  send(buffer) {
    this.other.receive(buffer);
  }
  receive(buffer) {
    if (this.buffering) {
      this.buffers.push(buffer);
    } else {
      this._onMessage.fire(buffer);
    }
  }
}
function createProtocolPair() {
  const one = new QueueProtocol();
  const other = new QueueProtocol();
  one.other = other;
  other.other = one;
  return [one, other];
}
class TestIPCClient extends IPCClient {
  constructor(protocol, id) {
    super(protocol, id);
    this._onDidDisconnect = new Emitter();
    this.onDidDisconnect = this._onDidDisconnect.event;
  }
  dispose() {
    this._onDidDisconnect.fire();
    super.dispose();
  }
}
class TestIPCServer extends IPCServer {
  constructor() {
    const onDidClientConnect = new Emitter();
    super(onDidClientConnect.event);
    this.onDidClientConnect = onDidClientConnect;
  }
  createConnection(id) {
    const [pc, ps] = createProtocolPair();
    const client = new TestIPCClient(pc, id);
    this.onDidClientConnect.fire({
      protocol: ps,
      onDidClientDisconnect: client.onDidDisconnect
    });
    return client;
  }
}
const TestChannelId = "testchannel";
class TestService {
  constructor() {
    this.disposables = new DisposableStore();
    this._onPong = new Emitter();
    this.onPong = this._onPong.event;
  }
  get hasPongListeners() {
    return this._onPong.hasListeners();
  }
  marco() {
    return Promise.resolve("polo");
  }
  error(message) {
    return Promise.reject(new Error(message));
  }
  neverComplete() {
    return new Promise((_) => {
    });
  }
  neverCompleteCT(cancellationToken) {
    if (cancellationToken.isCancellationRequested) {
      return Promise.reject(canceled());
    }
    return new Promise((_, e) => this.disposables.add(cancellationToken.onCancellationRequested(() => e(canceled()))));
  }
  buffersLength(buffers) {
    return Promise.resolve(buffers.reduce((r, b) => r + b.buffer.length, 0));
  }
  ping(msg) {
    this._onPong.fire(msg);
  }
  marshall(uri) {
    return Promise.resolve(uri);
  }
  context(context) {
    return Promise.resolve(context);
  }
  dispose() {
    this.disposables.dispose();
  }
}
class TestChannel {
  constructor(service) {
    this.service = service;
  }
  call(_, command, arg, cancellationToken) {
    switch (command) {
      case "marco":
        return this.service.marco();
      case "error":
        return this.service.error(arg);
      case "neverComplete":
        return this.service.neverComplete();
      case "neverCompleteCT":
        return this.service.neverCompleteCT(cancellationToken);
      case "buffersLength":
        return this.service.buffersLength(arg);
      default:
        return Promise.reject(new Error("not implemented"));
    }
  }
  listen(_, event, arg) {
    switch (event) {
      case "onPong":
        return this.service.onPong;
      default:
        throw new Error("not implemented");
    }
  }
}
class TestChannelClient {
  constructor(channel) {
    this.channel = channel;
  }
  get onPong() {
    return this.channel.listen("onPong");
  }
  marco() {
    return this.channel.call("marco");
  }
  error(message) {
    return this.channel.call("error", message);
  }
  neverComplete() {
    return this.channel.call("neverComplete");
  }
  neverCompleteCT(cancellationToken) {
    return this.channel.call("neverCompleteCT", void 0, cancellationToken);
  }
  buffersLength(buffers) {
    return this.channel.call("buffersLength", buffers);
  }
  marshall(uri) {
    return this.channel.call("marshall", uri);
  }
  context() {
    return this.channel.call("context");
  }
}
suite("Base IPC", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("createProtocolPair", async function() {
    const [clientProtocol, serverProtocol] = createProtocolPair();
    const b1 = VSBuffer.alloc(0);
    clientProtocol.send(b1);
    const b3 = VSBuffer.alloc(0);
    serverProtocol.send(b3);
    const b2 = await Event.toPromise(serverProtocol.onMessage);
    const b4 = await Event.toPromise(clientProtocol.onMessage);
    assert.strictEqual(b1, b2);
    assert.strictEqual(b3, b4);
  });
  suite("one to one", function() {
    let server;
    let client;
    let service;
    let ipcService;
    setup(function() {
      service = store.add(new TestService());
      const testServer = store.add(new TestIPCServer());
      server = testServer;
      server.registerChannel(TestChannelId, new TestChannel(service));
      client = store.add(testServer.createConnection("client1"));
      ipcService = new TestChannelClient(client.getChannel(TestChannelId));
    });
    test("call success", async function() {
      const r = await ipcService.marco();
      return assert.strictEqual(r, "polo");
    });
    test("call error", async function() {
      try {
        await ipcService.error("nice error");
        return assert.fail("should not reach here");
      } catch (err) {
        return assert.strictEqual(err.message, "nice error");
      }
    });
    test("cancel call with cancelled cancellation token", async function() {
      try {
        await ipcService.neverCompleteCT(CancellationToken.Cancelled);
        return assert.fail("should not reach here");
      } catch (err) {
        return assert(err.message === "Canceled");
      }
    });
    test("cancel call with cancellation token (sync)", function() {
      const cts = new CancellationTokenSource();
      const promise = ipcService.neverCompleteCT(cts.token).then(
        (_) => assert.fail("should not reach here"),
        (err) => assert(err.message === "Canceled")
      );
      cts.cancel();
      return promise;
    });
    test("cancel call with cancellation token (async)", function() {
      const cts = new CancellationTokenSource();
      const promise = ipcService.neverCompleteCT(cts.token).then(
        (_) => assert.fail("should not reach here"),
        (err) => assert(err.message === "Canceled")
      );
      setTimeout(() => cts.cancel());
      return promise;
    });
    test("listen to events", async function() {
      const messages = [];
      store.add(ipcService.onPong((msg) => messages.push(msg)));
      await timeout(0);
      assert.deepStrictEqual(messages, []);
      service.ping("hello");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      service.ping("world");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello", "world"]);
    });
    test("unbuffered events subscribe lazily", function() {
      const service2 = store.add(new TestService());
      const channelDisposables = store.add(new DisposableStore());
      const channel = ProxyChannel.fromService(service2, channelDisposables, { unbufferedEvents: ["onPong"] });
      const onPong = channel.listen("context", "onPong");
      const messages = [];
      service2.ping("before");
      assert.strictEqual(service2.hasPongListeners, false);
      const listener = channelDisposables.add(onPong((message) => messages.push(message)));
      assert.strictEqual(service2.hasPongListeners, true);
      service2.ping("after");
      channelDisposables.delete(listener);
      assert.deepStrictEqual({ messages, hasPongListeners: service2.hasPongListeners }, {
        messages: ["after"],
        hasPongListeners: false
      });
    });
    test("listen to events (resubscribe)", async function() {
      const onPong = ipcService.onPong;
      const messages = [];
      const disposable1 = onPong((msg) => messages.push(msg));
      await timeout(0);
      assert.deepStrictEqual(messages, []);
      service.ping("hello");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      disposable1.dispose();
      const disposable2 = onPong((msg) => messages.push(msg));
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      service.ping("world");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello", "world"]);
      disposable2.dispose();
    });
    test("buffers in arrays", async function() {
      const r = await ipcService.buffersLength([VSBuffer.alloc(2), VSBuffer.alloc(3)]);
      return assert.strictEqual(r, 5);
    });
    test("round trips numbers", () => {
      const input = [
        0,
        1,
        -1,
        12345,
        -12345,
        42.6,
        123412341234
      ];
      const writer = new BufferWriter();
      serialize(writer, input);
      assert.deepStrictEqual(deserialize(new BufferReader(writer.buffer)), input);
    });
    test("BufferWriter releases its buffers on dispose", () => {
      const writer = new BufferWriter();
      serialize(writer, ["a", "b", "c"]);
      assert.ok(writer.buffer.byteLength > 0);
      writer.dispose();
      assert.strictEqual(writer.buffer.byteLength, 0);
    });
    test("request rejects (and cleans up) when serialization throws on the deferred path", async function() {
      const clientIncoming = store.add(new Emitter());
      const clientProtocol = {
        onMessage: clientIncoming.event,
        send: () => {
        }
      };
      const serverOutbox = [];
      const serverProtocol = {
        onMessage: Event.None,
        send: (buffer) => serverOutbox.push(buffer)
      };
      const channelClient = store.add(new ChannelClient(clientProtocol));
      store.add(new ChannelServer(serverProtocol, "ctx"));
      const circular = {};
      circular.self = circular;
      const resultPromise = channelClient.getChannel("testchannel").call("cmd", circular);
      assert.strictEqual(serverOutbox.length, 1);
      clientIncoming.fire(serverOutbox[0]);
      await assert.rejects(resultPromise);
    });
  });
  suite("one to one (proxy)", function() {
    let server;
    let client;
    let service;
    let ipcService;
    const disposables = new DisposableStore();
    setup(function() {
      service = store.add(new TestService());
      const testServer = disposables.add(new TestIPCServer());
      server = testServer;
      server.registerChannel(TestChannelId, ProxyChannel.fromService(service, disposables));
      client = disposables.add(testServer.createConnection("client1"));
      ipcService = ProxyChannel.toService(client.getChannel(TestChannelId));
    });
    teardown(function() {
      disposables.clear();
    });
    test("call success", async function() {
      const r = await ipcService.marco();
      return assert.strictEqual(r, "polo");
    });
    test("call error", async function() {
      try {
        await ipcService.error("nice error");
        return assert.fail("should not reach here");
      } catch (err) {
        return assert.strictEqual(err.message, "nice error");
      }
    });
    test("listen to events", async function() {
      const messages = [];
      disposables.add(ipcService.onPong((msg) => messages.push(msg)));
      await timeout(0);
      assert.deepStrictEqual(messages, []);
      service.ping("hello");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      service.ping("world");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello", "world"]);
    });
    test("listen to events (resubscribe)", async function() {
      const onPong = ipcService.onPong;
      const messages = [];
      const disposable1 = onPong((msg) => messages.push(msg));
      await timeout(0);
      assert.deepStrictEqual(messages, []);
      service.ping("hello");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      disposable1.dispose();
      const disposable2 = onPong((msg) => messages.push(msg));
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello"]);
      service.ping("world");
      await timeout(0);
      assert.deepStrictEqual(messages, ["hello", "world"]);
      disposable2.dispose();
    });
    test("marshalling uri", async function() {
      const uri = URI.file("foobar");
      const r = await ipcService.marshall(uri);
      assert.ok(r instanceof URI);
      return assert.ok(isEqual(r, uri));
    });
    test("buffers in arrays", async function() {
      const r = await ipcService.buffersLength([VSBuffer.alloc(2), VSBuffer.alloc(3)]);
      return assert.strictEqual(r, 5);
    });
  });
  suite("one to one (proxy, extra context)", function() {
    let server;
    let client;
    let service;
    let ipcService;
    const disposables = new DisposableStore();
    setup(function() {
      service = store.add(new TestService());
      const testServer = disposables.add(new TestIPCServer());
      server = testServer;
      server.registerChannel(TestChannelId, ProxyChannel.fromService(service, disposables));
      client = disposables.add(testServer.createConnection("client1"));
      ipcService = ProxyChannel.toService(client.getChannel(TestChannelId), { context: "Super Context" });
    });
    teardown(function() {
      disposables.clear();
    });
    test("call extra context", async function() {
      const r = await ipcService.context();
      return assert.strictEqual(r, "Super Context");
    });
  });
  suite("one to many", function() {
    test("all clients get pinged", async function() {
      const service = store.add(new TestService());
      const channel = new TestChannel(service);
      const server = store.add(new TestIPCServer());
      server.registerChannel("channel", channel);
      let client1GotPinged = false;
      const client1 = store.add(server.createConnection("client1"));
      const ipcService1 = new TestChannelClient(client1.getChannel("channel"));
      store.add(ipcService1.onPong(() => client1GotPinged = true));
      let client2GotPinged = false;
      const client2 = store.add(server.createConnection("client2"));
      const ipcService2 = new TestChannelClient(client2.getChannel("channel"));
      store.add(ipcService2.onPong(() => client2GotPinged = true));
      await timeout(1);
      service.ping("hello");
      await timeout(1);
      assert(client1GotPinged, "client 1 got pinged");
      assert(client2GotPinged, "client 2 got pinged");
    });
    test("server gets pings from all clients (broadcast channel)", async function() {
      const server = store.add(new TestIPCServer());
      const client1 = server.createConnection("client1");
      const clientService1 = store.add(new TestService());
      const clientChannel1 = new TestChannel(clientService1);
      client1.registerChannel("channel", clientChannel1);
      const pings = [];
      const channel = server.getChannel("channel", () => true);
      const service = new TestChannelClient(channel);
      store.add(service.onPong((msg) => pings.push(msg)));
      await timeout(1);
      clientService1.ping("hello 1");
      await timeout(1);
      assert.deepStrictEqual(pings, ["hello 1"]);
      const client2 = server.createConnection("client2");
      const clientService2 = store.add(new TestService());
      const clientChannel2 = new TestChannel(clientService2);
      client2.registerChannel("channel", clientChannel2);
      await timeout(1);
      clientService2.ping("hello 2");
      await timeout(1);
      assert.deepStrictEqual(pings, ["hello 1", "hello 2"]);
      client1.dispose();
      clientService1.ping("hello 1");
      await timeout(1);
      assert.deepStrictEqual(pings, ["hello 1", "hello 2"]);
      await timeout(1);
      clientService2.ping("hello again 2");
      await timeout(1);
      assert.deepStrictEqual(pings, ["hello 1", "hello 2", "hello again 2"]);
      client2.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvcGFydHMvaXBjL3Rlc3QvY29tbW9uL2lwYy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjYW5jZWxlZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEJ1ZmZlclJlYWRlciwgQnVmZmVyV3JpdGVyLCBDaGFubmVsQ2xpZW50LCBDaGFubmVsU2VydmVyLCBDbGllbnRDb25uZWN0aW9uRXZlbnQsIGRlc2VyaWFsaXplLCBJQ2hhbm5lbCwgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wsIElQQ0NsaWVudCwgSVBDU2VydmVyLCBJU2VydmVyQ2hhbm5lbCwgUHJveHlDaGFubmVsLCBzZXJpYWxpemUgfSBmcm9tICcuLi8uLi9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuY2xhc3MgUXVldWVQcm90b2NvbCBpbXBsZW1lbnRzIElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIHtcblxuXHRwcml2YXRlIGJ1ZmZlcmluZyA9IHRydWU7XG5cdHByaXZhdGUgYnVmZmVyczogVlNCdWZmZXJbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWVzc2FnZSA9IG5ldyBFbWl0dGVyPFZTQnVmZmVyPih7XG5cdFx0b25EaWRBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGJ1ZmZlciBvZiB0aGlzLmJ1ZmZlcnMpIHtcblx0XHRcdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUoYnVmZmVyKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5idWZmZXJzID0gW107XG5cdFx0XHR0aGlzLmJ1ZmZlcmluZyA9IGZhbHNlO1xuXHRcdH0sXG5cdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdHRoaXMuYnVmZmVyaW5nID0gdHJ1ZTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlYWRvbmx5IG9uTWVzc2FnZSA9IHRoaXMuX29uTWVzc2FnZS5ldmVudDtcblx0b3RoZXIhOiBRdWV1ZVByb3RvY29sO1xuXG5cdHNlbmQoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdHRoaXMub3RoZXIucmVjZWl2ZShidWZmZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlY2VpdmUoYnVmZmVyOiBWU0J1ZmZlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmJ1ZmZlcmluZykge1xuXHRcdFx0dGhpcy5idWZmZXJzLnB1c2goYnVmZmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUoYnVmZmVyKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlUHJvdG9jb2xQYWlyKCk6IFtJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCwgSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2xdIHtcblx0Y29uc3Qgb25lID0gbmV3IFF1ZXVlUHJvdG9jb2woKTtcblx0Y29uc3Qgb3RoZXIgPSBuZXcgUXVldWVQcm90b2NvbCgpO1xuXHRvbmUub3RoZXIgPSBvdGhlcjtcblx0b3RoZXIub3RoZXIgPSBvbmU7XG5cblx0cmV0dXJuIFtvbmUsIG90aGVyXTtcbn1cblxuY2xhc3MgVGVzdElQQ0NsaWVudCBleHRlbmRzIElQQ0NsaWVudDxzdHJpbmc+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc2Nvbm5lY3QgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZERpc2Nvbm5lY3QgPSB0aGlzLl9vbkRpZERpc2Nvbm5lY3QuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sLCBpZDogc3RyaW5nKSB7XG5cdFx0c3VwZXIocHJvdG9jb2wsIGlkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWREaXNjb25uZWN0LmZpcmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdElQQ1NlcnZlciBleHRlbmRzIElQQ1NlcnZlcjxzdHJpbmc+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2xpZW50Q29ubmVjdDogRW1pdHRlcjxDbGllbnRDb25uZWN0aW9uRXZlbnQ+O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IG9uRGlkQ2xpZW50Q29ubmVjdCA9IG5ldyBFbWl0dGVyPENsaWVudENvbm5lY3Rpb25FdmVudD4oKTtcblx0XHRzdXBlcihvbkRpZENsaWVudENvbm5lY3QuZXZlbnQpO1xuXHRcdHRoaXMub25EaWRDbGllbnRDb25uZWN0ID0gb25EaWRDbGllbnRDb25uZWN0O1xuXHR9XG5cblx0Y3JlYXRlQ29ubmVjdGlvbihpZDogc3RyaW5nKTogSVBDQ2xpZW50PHN0cmluZz4ge1xuXHRcdGNvbnN0IFtwYywgcHNdID0gY3JlYXRlUHJvdG9jb2xQYWlyKCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IFRlc3RJUENDbGllbnQocGMsIGlkKTtcblxuXHRcdHRoaXMub25EaWRDbGllbnRDb25uZWN0LmZpcmUoe1xuXHRcdFx0cHJvdG9jb2w6IHBzLFxuXHRcdFx0b25EaWRDbGllbnREaXNjb25uZWN0OiBjbGllbnQub25EaWREaXNjb25uZWN0XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gY2xpZW50O1xuXHR9XG59XG5cbmNvbnN0IFRlc3RDaGFubmVsSWQgPSAndGVzdGNoYW5uZWwnO1xuXG5pbnRlcmZhY2UgSVRlc3RTZXJ2aWNlIHtcblx0bWFyY28oKTogUHJvbWlzZTxzdHJpbmc+O1xuXHRlcnJvcihtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXHRuZXZlckNvbXBsZXRlKCk6IFByb21pc2U8dm9pZD47XG5cdG5ldmVyQ29tcGxldGVDVChjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+O1xuXHRidWZmZXJzTGVuZ3RoKGJ1ZmZlcnM6IFZTQnVmZmVyW10pOiBQcm9taXNlPG51bWJlcj47XG5cdG1hcnNoYWxsKHVyaTogVVJJKTogUHJvbWlzZTxVUkk+O1xuXHRjb250ZXh0KCk6IFByb21pc2U8dW5rbm93bj47XG5cblx0cmVhZG9ubHkgb25Qb25nOiBFdmVudDxzdHJpbmc+O1xufVxuXG5jbGFzcyBUZXN0U2VydmljZSBpbXBsZW1lbnRzIElUZXN0U2VydmljZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblBvbmcgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IG9uUG9uZyA9IHRoaXMuX29uUG9uZy5ldmVudDtcblx0Z2V0IGhhc1BvbmdMaXN0ZW5lcnMoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9vblBvbmcuaGFzTGlzdGVuZXJzKCk7IH1cblxuXHRtYXJjbygpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoJ3BvbG8nKTtcblx0fVxuXG5cdGVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobWVzc2FnZSkpO1xuXHR9XG5cblx0bmV2ZXJDb21wbGV0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoXyA9PiB7IH0pO1xuXHR9XG5cblx0bmV2ZXJDb21wbGV0ZUNUKGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGNhbmNlbGVkKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgoXywgZSkgPT4gdGhpcy5kaXNwb3NhYmxlcy5hZGQoY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gZShjYW5jZWxlZCgpKSkpKTtcblx0fVxuXG5cdGJ1ZmZlcnNMZW5ndGgoYnVmZmVyczogVlNCdWZmZXJbXSk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShidWZmZXJzLnJlZHVjZSgociwgYikgPT4gciArIGIuYnVmZmVyLmxlbmd0aCwgMCkpO1xuXHR9XG5cblx0cGluZyhtc2c6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29uUG9uZy5maXJlKG1zZyk7XG5cdH1cblxuXHRtYXJzaGFsbCh1cmk6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1cmkpO1xuXHR9XG5cblx0Y29udGV4dChjb250ZXh0PzogdW5rbm93bik6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoY29udGV4dCk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RDaGFubmVsIGltcGxlbWVudHMgSVNlcnZlckNoYW5uZWwge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc2VydmljZTogSVRlc3RTZXJ2aWNlKSB7IH1cblxuXHRjYWxsKF86IHVua25vd24sIGNvbW1hbmQ6IHN0cmluZywgYXJnOiBhbnksIGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8YW55PiB7XG5cdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRjYXNlICdtYXJjbyc6IHJldHVybiB0aGlzLnNlcnZpY2UubWFyY28oKTtcblx0XHRcdGNhc2UgJ2Vycm9yJzogcmV0dXJuIHRoaXMuc2VydmljZS5lcnJvcihhcmcpO1xuXHRcdFx0Y2FzZSAnbmV2ZXJDb21wbGV0ZSc6IHJldHVybiB0aGlzLnNlcnZpY2UubmV2ZXJDb21wbGV0ZSgpO1xuXHRcdFx0Y2FzZSAnbmV2ZXJDb21wbGV0ZUNUJzogcmV0dXJuIHRoaXMuc2VydmljZS5uZXZlckNvbXBsZXRlQ1QoY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdFx0Y2FzZSAnYnVmZmVyc0xlbmd0aCc6IHJldHVybiB0aGlzLnNlcnZpY2UuYnVmZmVyc0xlbmd0aChhcmcpO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJykpO1xuXHRcdH1cblx0fVxuXG5cdGxpc3RlbihfOiB1bmtub3duLCBldmVudDogc3RyaW5nLCBhcmc/OiBhbnkpOiBFdmVudDxhbnk+IHtcblx0XHRzd2l0Y2ggKGV2ZW50KSB7XG5cdFx0XHRjYXNlICdvblBvbmcnOiByZXR1cm4gdGhpcy5zZXJ2aWNlLm9uUG9uZztcblx0XHRcdGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRlc3RDaGFubmVsQ2xpZW50IGltcGxlbWVudHMgSVRlc3RTZXJ2aWNlIHtcblxuXHRnZXQgb25Qb25nKCk6IEV2ZW50PHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLmNoYW5uZWwubGlzdGVuKCdvblBvbmcnKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgY2hhbm5lbDogSUNoYW5uZWwpIHsgfVxuXG5cdG1hcmNvKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbm5lbC5jYWxsKCdtYXJjbycpO1xuXHR9XG5cblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbm5lbC5jYWxsKCdlcnJvcicsIG1lc3NhZ2UpO1xuXHR9XG5cblx0bmV2ZXJDb21wbGV0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVsLmNhbGwoJ25ldmVyQ29tcGxldGUnKTtcblx0fVxuXG5cdG5ldmVyQ29tcGxldGVDVChjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVsLmNhbGwoJ25ldmVyQ29tcGxldGVDVCcsIHVuZGVmaW5lZCwgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHR9XG5cblx0YnVmZmVyc0xlbmd0aChidWZmZXJzOiBWU0J1ZmZlcltdKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVsLmNhbGwoJ2J1ZmZlcnNMZW5ndGgnLCBidWZmZXJzKTtcblx0fVxuXG5cdG1hcnNoYWxsKHVyaTogVVJJKTogUHJvbWlzZTxVUkk+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVsLmNhbGwoJ21hcnNoYWxsJywgdXJpKTtcblx0fVxuXG5cdGNvbnRleHQoKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhbm5lbC5jYWxsKCdjb250ZXh0Jyk7XG5cdH1cbn1cblxuc3VpdGUoJ0Jhc2UgSVBDJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY3JlYXRlUHJvdG9jb2xQYWlyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IFtjbGllbnRQcm90b2NvbCwgc2VydmVyUHJvdG9jb2xdID0gY3JlYXRlUHJvdG9jb2xQYWlyKCk7XG5cblx0XHRjb25zdCBiMSA9IFZTQnVmZmVyLmFsbG9jKDApO1xuXHRcdGNsaWVudFByb3RvY29sLnNlbmQoYjEpO1xuXG5cdFx0Y29uc3QgYjMgPSBWU0J1ZmZlci5hbGxvYygwKTtcblx0XHRzZXJ2ZXJQcm90b2NvbC5zZW5kKGIzKTtcblxuXHRcdGNvbnN0IGIyID0gYXdhaXQgRXZlbnQudG9Qcm9taXNlKHNlcnZlclByb3RvY29sLm9uTWVzc2FnZSk7XG5cdFx0Y29uc3QgYjQgPSBhd2FpdCBFdmVudC50b1Byb21pc2UoY2xpZW50UHJvdG9jb2wub25NZXNzYWdlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiMSwgYjIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiMywgYjQpO1xuXHR9KTtcblxuXHRzdWl0ZSgnb25lIHRvIG9uZScsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgc2VydmVyOiBJUENTZXJ2ZXI7XG5cdFx0bGV0IGNsaWVudDogSVBDQ2xpZW50O1xuXHRcdGxldCBzZXJ2aWNlOiBUZXN0U2VydmljZTtcblx0XHRsZXQgaXBjU2VydmljZTogSVRlc3RTZXJ2aWNlO1xuXG5cdFx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdFx0c2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCB0ZXN0U2VydmVyID0gc3RvcmUuYWRkKG5ldyBUZXN0SVBDU2VydmVyKCkpO1xuXHRcdFx0c2VydmVyID0gdGVzdFNlcnZlcjtcblxuXHRcdFx0c2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChUZXN0Q2hhbm5lbElkLCBuZXcgVGVzdENoYW5uZWwoc2VydmljZSkpO1xuXG5cdFx0XHRjbGllbnQgPSBzdG9yZS5hZGQodGVzdFNlcnZlci5jcmVhdGVDb25uZWN0aW9uKCdjbGllbnQxJykpO1xuXHRcdFx0aXBjU2VydmljZSA9IG5ldyBUZXN0Q2hhbm5lbENsaWVudChjbGllbnQuZ2V0Q2hhbm5lbChUZXN0Q2hhbm5lbElkKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWxsIHN1Y2Nlc3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCByID0gYXdhaXQgaXBjU2VydmljZS5tYXJjbygpO1xuXHRcdFx0cmV0dXJuIGFzc2VydC5zdHJpY3RFcXVhbChyLCAncG9sbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FsbCBlcnJvcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGlwY1NlcnZpY2UuZXJyb3IoJ25pY2UgZXJyb3InKTtcblx0XHRcdFx0cmV0dXJuIGFzc2VydC5mYWlsKCdzaG91bGQgbm90IHJlYWNoIGhlcmUnKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZXR1cm4gYXNzZXJ0LnN0cmljdEVxdWFsKGVyci5tZXNzYWdlLCAnbmljZSBlcnJvcicpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VsIGNhbGwgd2l0aCBjYW5jZWxsZWQgY2FuY2VsbGF0aW9uIHRva2VuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgaXBjU2VydmljZS5uZXZlckNvbXBsZXRlQ1QoQ2FuY2VsbGF0aW9uVG9rZW4uQ2FuY2VsbGVkKTtcblx0XHRcdFx0cmV0dXJuIGFzc2VydC5mYWlsKCdzaG91bGQgbm90IHJlYWNoIGhlcmUnKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZXR1cm4gYXNzZXJ0KGVyci5tZXNzYWdlID09PSAnQ2FuY2VsZWQnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbCBjYWxsIHdpdGggY2FuY2VsbGF0aW9uIHRva2VuIChzeW5jKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGlwY1NlcnZpY2UubmV2ZXJDb21wbGV0ZUNUKGN0cy50b2tlbikudGhlbihcblx0XHRcdFx0XyA9PiBhc3NlcnQuZmFpbCgnc2hvdWxkIG5vdCByZWFjaCBoZXJlJyksXG5cdFx0XHRcdGVyciA9PiBhc3NlcnQoZXJyLm1lc3NhZ2UgPT09ICdDYW5jZWxlZCcpXG5cdFx0XHQpO1xuXG5cdFx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRcdHJldHVybiBwcm9taXNlO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VsIGNhbGwgd2l0aCBjYW5jZWxsYXRpb24gdG9rZW4gKGFzeW5jKScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGlwY1NlcnZpY2UubmV2ZXJDb21wbGV0ZUNUKGN0cy50b2tlbikudGhlbihcblx0XHRcdFx0XyA9PiBhc3NlcnQuZmFpbCgnc2hvdWxkIG5vdCByZWFjaCBoZXJlJyksXG5cdFx0XHRcdGVyciA9PiBhc3NlcnQoZXJyLm1lc3NhZ2UgPT09ICdDYW5jZWxlZCcpXG5cdFx0XHQpO1xuXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IGN0cy5jYW5jZWwoKSk7XG5cblx0XHRcdHJldHVybiBwcm9taXNlO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGlzdGVuIHRvIGV2ZW50cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRzdG9yZS5hZGQoaXBjU2VydmljZS5vblBvbmcobXNnID0+IG1lc3NhZ2VzLnB1c2gobXNnKSkpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgW10pO1xuXHRcdFx0c2VydmljZS5waW5nKCdoZWxsbycpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgWydoZWxsbyddKTtcblx0XHRcdHNlcnZpY2UucGluZygnd29ybGQnKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFsnaGVsbG8nLCAnd29ybGQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bmJ1ZmZlcmVkIGV2ZW50cyBzdWJzY3JpYmUgbGF6aWx5JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBjaGFubmVsRGlzcG9zYWJsZXMgPSBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRcdGNvbnN0IGNoYW5uZWwgPSBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2Uoc2VydmljZSwgY2hhbm5lbERpc3Bvc2FibGVzLCB7IHVuYnVmZmVyZWRFdmVudHM6IFsnb25Qb25nJ10gfSk7XG5cdFx0XHRjb25zdCBvblBvbmcgPSBjaGFubmVsLmxpc3RlbjxzdHJpbmc+KCdjb250ZXh0JywgJ29uUG9uZycpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdHNlcnZpY2UucGluZygnYmVmb3JlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNQb25nTGlzdGVuZXJzLCBmYWxzZSk7XG5cblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gY2hhbm5lbERpc3Bvc2FibGVzLmFkZChvblBvbmcobWVzc2FnZSA9PiBtZXNzYWdlcy5wdXNoKG1lc3NhZ2UpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNQb25nTGlzdGVuZXJzLCB0cnVlKTtcblx0XHRcdHNlcnZpY2UucGluZygnYWZ0ZXInKTtcblx0XHRcdGNoYW5uZWxEaXNwb3NhYmxlcy5kZWxldGUobGlzdGVuZXIpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgbWVzc2FnZXMsIGhhc1BvbmdMaXN0ZW5lcnM6IHNlcnZpY2UuaGFzUG9uZ0xpc3RlbmVycyB9LCB7XG5cdFx0XHRcdG1lc3NhZ2VzOiBbJ2FmdGVyJ10sXG5cdFx0XHRcdGhhc1BvbmdMaXN0ZW5lcnM6IGZhbHNlXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpc3RlbiB0byBldmVudHMgKHJlc3Vic2NyaWJlKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IG9uUG9uZyA9IGlwY1NlcnZpY2Uub25Qb25nO1xuXHRcdFx0Y29uc3QgbWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUxID0gb25Qb25nKG1zZyA9PiBtZXNzYWdlcy5wdXNoKG1zZykpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtdKTtcblx0XHRcdHNlcnZpY2UucGluZygnaGVsbG8nKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbJ2hlbGxvJ10pO1xuXHRcdFx0ZGlzcG9zYWJsZTEuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlMiA9IG9uUG9uZyhtc2cgPT4gKG1lc3NhZ2VzIGFzIHN0cmluZ1tdKS5wdXNoKG1zZykpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFsnaGVsbG8nXSk7XG5cdFx0XHRzZXJ2aWNlLnBpbmcoJ3dvcmxkJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgWydoZWxsbycsICd3b3JsZCddKTtcblx0XHRcdGRpc3Bvc2FibGUyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2J1ZmZlcnMgaW4gYXJyYXlzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgciA9IGF3YWl0IGlwY1NlcnZpY2UuYnVmZmVyc0xlbmd0aChbVlNCdWZmZXIuYWxsb2MoMiksIFZTQnVmZmVyLmFsbG9jKDMpXSk7XG5cdFx0XHRyZXR1cm4gYXNzZXJ0LnN0cmljdEVxdWFsKHIsIDUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncm91bmQgdHJpcHMgbnVtYmVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gW1xuXHRcdFx0XHQwLFxuXHRcdFx0XHQxLFxuXHRcdFx0XHQtMSxcblx0XHRcdFx0MTIzNDUsXG5cdFx0XHRcdC0xMjM0NSxcblx0XHRcdFx0NDIuNixcblx0XHRcdFx0MTIzNDEyMzQxMjM0XG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCB3cml0ZXIgPSBuZXcgQnVmZmVyV3JpdGVyKCk7XG5cdFx0XHRzZXJpYWxpemUod3JpdGVyLCBpbnB1dCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlc2VyaWFsaXplKG5ldyBCdWZmZXJSZWFkZXIod3JpdGVyLmJ1ZmZlcikpLCBpbnB1dCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdCdWZmZXJXcml0ZXIgcmVsZWFzZXMgaXRzIGJ1ZmZlcnMgb24gZGlzcG9zZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHdyaXRlciA9IG5ldyBCdWZmZXJXcml0ZXIoKTtcblx0XHRcdHNlcmlhbGl6ZSh3cml0ZXIsIFsnYScsICdiJywgJ2MnXSk7XG5cdFx0XHRhc3NlcnQub2sod3JpdGVyLmJ1ZmZlci5ieXRlTGVuZ3RoID4gMCk7XG5cblx0XHRcdHdyaXRlci5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIEFmdGVyIGRpc3Bvc2UgdGhlIHdyaXRlciBubyBsb25nZXIgcmV0YWlucyB0aGUgc2VyaWFsaXplZCBidWZmZXJzLCBzb1xuXHRcdFx0Ly8gYGJ1ZmZlcmAgaXMgZW1wdHkuIFRoaXMgZ3VhcmRzIGFnYWluc3QgYSB0aHJvd24gZXJyb3IncyBjYXB0dXJlZCBzdGFja1xuXHRcdFx0Ly8gcGlubmluZyBsYXJnZSBpbnRlcm1lZGlhdGUgYnVmZmVycyAoc2VlIENoYW5uZWxDbGllbnQvQ2hhbm5lbFNlcnZlci5zZW5kKS5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cml0ZXIuYnVmZmVyLmJ5dGVMZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVxdWVzdCByZWplY3RzIChhbmQgY2xlYW5zIHVwKSB3aGVuIHNlcmlhbGl6YXRpb24gdGhyb3dzIG9uIHRoZSBkZWZlcnJlZCBwYXRoJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gUmVwcm9kdWNlcyB0aGUgbGVhayB3aGVyZSBhIHN5bmNocm9ub3VzIHNlcmlhbGl6YXRpb24gZmFpbHVyZSBsZWZ0IGFcblx0XHRcdC8vIGRhbmdsaW5nIGVudHJ5IGluIGBDaGFubmVsQ2xpZW50LmhhbmRsZXJzYCAoYW5kLCBvbiB0aGUgdW5pbml0aWFsaXplZFxuXHRcdFx0Ly8gcGF0aCwgYSBwZXJtYW5lbnRseSBwZW5kaW5nIHByb21pc2UpLiBXZSBtYWtlIGEgY2FsbCAqYmVmb3JlKiB0aGVcblx0XHRcdC8vIGNsaWVudCBpcyBpbml0aWFsaXplZCBzbyB0aGUgcmVxdWVzdCBpcyBkZWZlcnJlZCB1bnRpbCBpbml0OyB3aGVuIGl0XG5cdFx0XHQvLyBmaW5hbGx5IHNlcmlhbGl6ZXMsIGEgY2lyY3VsYXIgYXJndW1lbnQgbWFrZXMgYEpTT04uc3RyaW5naWZ5YCB0aHJvdy5cblx0XHRcdGNvbnN0IGNsaWVudEluY29taW5nID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPFZTQnVmZmVyPigpKTtcblx0XHRcdGNvbnN0IGNsaWVudFByb3RvY29sOiBJTWVzc2FnZVBhc3NpbmdQcm90b2NvbCA9IHtcblx0XHRcdFx0b25NZXNzYWdlOiBjbGllbnRJbmNvbWluZy5ldmVudCxcblx0XHRcdFx0c2VuZDogKCkgPT4geyAvKiBjbGllbnQgb3V0Ym91bmQgaXMgaXJyZWxldmFudCB0byB0aGlzIHRlc3QgKi8gfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNlcnZlck91dGJveDogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VydmVyUHJvdG9jb2w6IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sID0ge1xuXHRcdFx0XHRvbk1lc3NhZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHNlbmQ6IGJ1ZmZlciA9PiBzZXJ2ZXJPdXRib3gucHVzaChidWZmZXIpXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjaGFubmVsQ2xpZW50ID0gc3RvcmUuYWRkKG5ldyBDaGFubmVsQ2xpZW50KGNsaWVudFByb3RvY29sKSk7XG5cdFx0XHQvLyBDb25zdHJ1Y3RpbmcgdGhlIHNlcnZlciBlbWl0cyBhbiBJbml0aWFsaXplIG1lc3NhZ2UgaW50byBpdHMgb3V0Ym94LlxuXHRcdFx0c3RvcmUuYWRkKG5ldyBDaGFubmVsU2VydmVyKHNlcnZlclByb3RvY29sLCAnY3R4JykpO1xuXG5cdFx0XHQvLyBJc3N1ZSB0aGUgY2FsbCB3aGlsZSB0aGUgY2xpZW50IGlzIHN0aWxsIHVuaW5pdGlhbGl6ZWQ6IGl0IGlzIHF1ZXVlZFxuXHRcdFx0Ly8gYmVoaW5kIGB3aGVuSW5pdGlhbGl6ZWQoKWAgcmF0aGVyIHRoYW4gc2VyaWFsaXplZCBpbW1lZGlhdGVseS5cblx0XHRcdGNvbnN0IGNpcmN1bGFyOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdFx0Y2lyY3VsYXIuc2VsZiA9IGNpcmN1bGFyO1xuXHRcdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGNoYW5uZWxDbGllbnQuZ2V0Q2hhbm5lbCgndGVzdGNoYW5uZWwnKS5jYWxsKCdjbWQnLCBjaXJjdWxhcik7XG5cblx0XHRcdC8vIERlbGl2ZXIgdGhlIHNlcnZlcidzIEluaXRpYWxpemUgc28gdGhlIGRlZmVycmVkIHJlcXVlc3QgcnVucyBhbmQgdGhyb3dzLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlck91dGJveC5sZW5ndGgsIDEpO1xuXHRcdFx0Y2xpZW50SW5jb21pbmcuZmlyZShzZXJ2ZXJPdXRib3hbMF0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXN1bHRQcm9taXNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ29uZSB0byBvbmUgKHByb3h5KScsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgc2VydmVyOiBJUENTZXJ2ZXI7XG5cdFx0bGV0IGNsaWVudDogSVBDQ2xpZW50O1xuXHRcdGxldCBzZXJ2aWNlOiBUZXN0U2VydmljZTtcblx0XHRsZXQgaXBjU2VydmljZTogSVRlc3RTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHRlc3RTZXJ2ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJUENTZXJ2ZXIoKSk7XG5cdFx0XHRzZXJ2ZXIgPSB0ZXN0U2VydmVyO1xuXG5cdFx0XHRzZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKFRlc3RDaGFubmVsSWQsIFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShzZXJ2aWNlLCBkaXNwb3NhYmxlcykpO1xuXG5cdFx0XHRjbGllbnQgPSBkaXNwb3NhYmxlcy5hZGQodGVzdFNlcnZlci5jcmVhdGVDb25uZWN0aW9uKCdjbGllbnQxJykpO1xuXHRcdFx0aXBjU2VydmljZSA9IFByb3h5Q2hhbm5lbC50b1NlcnZpY2UoY2xpZW50LmdldENoYW5uZWwoVGVzdENoYW5uZWxJZCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbGwgc3VjY2VzcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHIgPSBhd2FpdCBpcGNTZXJ2aWNlLm1hcmNvKCk7XG5cdFx0XHRyZXR1cm4gYXNzZXJ0LnN0cmljdEVxdWFsKHIsICdwb2xvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWxsIGVycm9yJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgaXBjU2VydmljZS5lcnJvcignbmljZSBlcnJvcicpO1xuXHRcdFx0XHRyZXR1cm4gYXNzZXJ0LmZhaWwoJ3Nob3VsZCBub3QgcmVhY2ggaGVyZScpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiBhc3NlcnQuc3RyaWN0RXF1YWwoZXJyLm1lc3NhZ2UsICduaWNlIGVycm9yJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaXN0ZW4gdG8gZXZlbnRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpcGNTZXJ2aWNlLm9uUG9uZyhtc2cgPT4gbWVzc2FnZXMucHVzaChtc2cpKSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbXSk7XG5cdFx0XHRzZXJ2aWNlLnBpbmcoJ2hlbGxvJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbJ2hlbGxvJ10pO1xuXHRcdFx0c2VydmljZS5waW5nKCd3b3JsZCcpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgWydoZWxsbycsICd3b3JsZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpc3RlbiB0byBldmVudHMgKHJlc3Vic2NyaWJlKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IG9uUG9uZyA9IGlwY1NlcnZpY2Uub25Qb25nO1xuXHRcdFx0Y29uc3QgbWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUxID0gb25Qb25nKG1zZyA9PiBtZXNzYWdlcy5wdXNoKG1zZykpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtdKTtcblx0XHRcdHNlcnZpY2UucGluZygnaGVsbG8nKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbJ2hlbGxvJ10pO1xuXHRcdFx0ZGlzcG9zYWJsZTEuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlMiA9IG9uUG9uZyhtc2cgPT4gKG1lc3NhZ2VzIGFzIHN0cmluZ1tdKS5wdXNoKG1zZykpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFsnaGVsbG8nXSk7XG5cdFx0XHRzZXJ2aWNlLnBpbmcoJ3dvcmxkJyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgWydoZWxsbycsICd3b3JsZCddKTtcblx0XHRcdGRpc3Bvc2FibGUyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcnNoYWxsaW5nIHVyaScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCdmb29iYXInKTtcblx0XHRcdGNvbnN0IHIgPSBhd2FpdCBpcGNTZXJ2aWNlLm1hcnNoYWxsKHVyaSk7XG5cdFx0XHRhc3NlcnQub2sociBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0XHRyZXR1cm4gYXNzZXJ0Lm9rKGlzRXF1YWwociwgdXJpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdidWZmZXJzIGluIGFycmF5cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHIgPSBhd2FpdCBpcGNTZXJ2aWNlLmJ1ZmZlcnNMZW5ndGgoW1ZTQnVmZmVyLmFsbG9jKDIpLCBWU0J1ZmZlci5hbGxvYygzKV0pO1xuXHRcdFx0cmV0dXJuIGFzc2VydC5zdHJpY3RFcXVhbChyLCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ29uZSB0byBvbmUgKHByb3h5LCBleHRyYSBjb250ZXh0KScsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgc2VydmVyOiBJUENTZXJ2ZXI7XG5cdFx0bGV0IGNsaWVudDogSVBDQ2xpZW50O1xuXHRcdGxldCBzZXJ2aWNlOiBUZXN0U2VydmljZTtcblx0XHRsZXQgaXBjU2VydmljZTogSVRlc3RTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHRlc3RTZXJ2ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJUENTZXJ2ZXIoKSk7XG5cdFx0XHRzZXJ2ZXIgPSB0ZXN0U2VydmVyO1xuXG5cdFx0XHRzZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKFRlc3RDaGFubmVsSWQsIFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShzZXJ2aWNlLCBkaXNwb3NhYmxlcykpO1xuXG5cdFx0XHRjbGllbnQgPSBkaXNwb3NhYmxlcy5hZGQodGVzdFNlcnZlci5jcmVhdGVDb25uZWN0aW9uKCdjbGllbnQxJykpO1xuXHRcdFx0aXBjU2VydmljZSA9IFByb3h5Q2hhbm5lbC50b1NlcnZpY2UoY2xpZW50LmdldENoYW5uZWwoVGVzdENoYW5uZWxJZCksIHsgY29udGV4dDogJ1N1cGVyIENvbnRleHQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbGwgZXh0cmEgY29udGV4dCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHIgPSBhd2FpdCBpcGNTZXJ2aWNlLmNvbnRleHQoKTtcblx0XHRcdHJldHVybiBhc3NlcnQuc3RyaWN0RXF1YWwociwgJ1N1cGVyIENvbnRleHQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ29uZSB0byBtYW55JywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3QoJ2FsbCBjbGllbnRzIGdldCBwaW5nZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNoYW5uZWwgPSBuZXcgVGVzdENoYW5uZWwoc2VydmljZSk7XG5cdFx0XHRjb25zdCBzZXJ2ZXIgPSBzdG9yZS5hZGQobmV3IFRlc3RJUENTZXJ2ZXIoKSk7XG5cdFx0XHRzZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKCdjaGFubmVsJywgY2hhbm5lbCk7XG5cblx0XHRcdGxldCBjbGllbnQxR290UGluZ2VkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBjbGllbnQxID0gc3RvcmUuYWRkKHNlcnZlci5jcmVhdGVDb25uZWN0aW9uKCdjbGllbnQxJykpO1xuXHRcdFx0Y29uc3QgaXBjU2VydmljZTEgPSBuZXcgVGVzdENoYW5uZWxDbGllbnQoY2xpZW50MS5nZXRDaGFubmVsKCdjaGFubmVsJykpO1xuXHRcdFx0c3RvcmUuYWRkKGlwY1NlcnZpY2UxLm9uUG9uZygoKSA9PiBjbGllbnQxR290UGluZ2VkID0gdHJ1ZSkpO1xuXG5cdFx0XHRsZXQgY2xpZW50MkdvdFBpbmdlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgY2xpZW50MiA9IHN0b3JlLmFkZChzZXJ2ZXIuY3JlYXRlQ29ubmVjdGlvbignY2xpZW50MicpKTtcblx0XHRcdGNvbnN0IGlwY1NlcnZpY2UyID0gbmV3IFRlc3RDaGFubmVsQ2xpZW50KGNsaWVudDIuZ2V0Q2hhbm5lbCgnY2hhbm5lbCcpKTtcblx0XHRcdHN0b3JlLmFkZChpcGNTZXJ2aWNlMi5vblBvbmcoKCkgPT4gY2xpZW50MkdvdFBpbmdlZCA9IHRydWUpKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdHNlcnZpY2UucGluZygnaGVsbG8nKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydChjbGllbnQxR290UGluZ2VkLCAnY2xpZW50IDEgZ290IHBpbmdlZCcpO1xuXHRcdFx0YXNzZXJ0KGNsaWVudDJHb3RQaW5nZWQsICdjbGllbnQgMiBnb3QgcGluZ2VkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXJ2ZXIgZ2V0cyBwaW5ncyBmcm9tIGFsbCBjbGllbnRzIChicm9hZGNhc3QgY2hhbm5lbCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXJ2ZXIgPSBzdG9yZS5hZGQobmV3IFRlc3RJUENTZXJ2ZXIoKSk7XG5cblx0XHRcdGNvbnN0IGNsaWVudDEgPSBzZXJ2ZXIuY3JlYXRlQ29ubmVjdGlvbignY2xpZW50MScpO1xuXHRcdFx0Y29uc3QgY2xpZW50U2VydmljZTEgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgY2xpZW50Q2hhbm5lbDEgPSBuZXcgVGVzdENoYW5uZWwoY2xpZW50U2VydmljZTEpO1xuXHRcdFx0Y2xpZW50MS5yZWdpc3RlckNoYW5uZWwoJ2NoYW5uZWwnLCBjbGllbnRDaGFubmVsMSk7XG5cblx0XHRcdGNvbnN0IHBpbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgY2hhbm5lbCA9IHNlcnZlci5nZXRDaGFubmVsKCdjaGFubmVsJywgKCkgPT4gdHJ1ZSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RDaGFubmVsQ2xpZW50KGNoYW5uZWwpO1xuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25Qb25nKG1zZyA9PiBwaW5ncy5wdXNoKG1zZykpKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGNsaWVudFNlcnZpY2UxLnBpbmcoJ2hlbGxvIDEnKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGluZ3MsIFsnaGVsbG8gMSddKTtcblxuXHRcdFx0Y29uc3QgY2xpZW50MiA9IHNlcnZlci5jcmVhdGVDb25uZWN0aW9uKCdjbGllbnQyJyk7XG5cdFx0XHRjb25zdCBjbGllbnRTZXJ2aWNlMiA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBjbGllbnRDaGFubmVsMiA9IG5ldyBUZXN0Q2hhbm5lbChjbGllbnRTZXJ2aWNlMik7XG5cdFx0XHRjbGllbnQyLnJlZ2lzdGVyQ2hhbm5lbCgnY2hhbm5lbCcsIGNsaWVudENoYW5uZWwyKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGNsaWVudFNlcnZpY2UyLnBpbmcoJ2hlbGxvIDInKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGluZ3MsIFsnaGVsbG8gMScsICdoZWxsbyAyJ10pO1xuXG5cdFx0XHRjbGllbnQxLmRpc3Bvc2UoKTtcblx0XHRcdGNsaWVudFNlcnZpY2UxLnBpbmcoJ2hlbGxvIDEnKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGluZ3MsIFsnaGVsbG8gMScsICdoZWxsbyAyJ10pO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0Y2xpZW50U2VydmljZTIucGluZygnaGVsbG8gYWdhaW4gMicpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaW5ncywgWydoZWxsbyAxJywgJ2hlbGxvIDInLCAnaGVsbG8gYWdhaW4gMiddKTtcblxuXHRcdFx0Y2xpZW50Mi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVB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
