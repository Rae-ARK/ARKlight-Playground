import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostIpcChannelTransport } from "../../browser/agentHostIpcChannelTransport.js";
import { AhpJsonlLogger } from "../../common/ahpJsonlLogger.js";
class FakeChannel extends Disposable {
  constructor() {
    super(...arguments);
    this.frameEmitter = this._register(new Emitter());
    this.closeEmitter = this._register(new Emitter());
    this.calls = [];
    this.connectResult = Promise.resolve();
    this.sendResult = Promise.resolve();
  }
  call(command, arg) {
    this.calls.push({ command, arg });
    if (command === "connect") {
      return this.connectResult;
    }
    if (command === "send") {
      return this.sendResult;
    }
    return Promise.resolve(void 0);
  }
  listen(event) {
    if (event === "frame") {
      return this.frameEmitter.event;
    }
    if (event === "close") {
      return this.closeEmitter.event;
    }
    throw new Error(`Unknown event: ${event}`);
  }
}
suite("AgentHostIpcChannelTransport", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("round-trips frames in both directions", async () => {
    const channel = ds.add(new FakeChannel());
    const transport = ds.add(new AgentHostIpcChannelTransport(channel));
    const received = [];
    ds.add(transport.onMessage((msg) => received.push(msg)));
    let closed = 0;
    ds.add(transport.onClose(() => closed++));
    await transport.connect();
    assert.deepStrictEqual(channel.calls, [{ command: "connect", arg: void 0 }]);
    assert.strictEqual(transport.isOpen, true);
    channel.frameEmitter.fire('{"jsonrpc":"2.0","id":1,"result":{}}');
    assert.deepStrictEqual(received, [{ jsonrpc: "2.0", id: 1, result: {} }]);
    transport.send({ jsonrpc: "2.0", id: 2, result: {} });
    assert.deepStrictEqual(channel.calls.at(-1), {
      command: "send",
      arg: '{"jsonrpc":"2.0","id":2,"result":{}}'
    });
    channel.closeEmitter.fire();
    assert.strictEqual(closed, 1);
    assert.strictEqual(transport.isOpen, false);
  });
  test("drops send when transport is not open", async () => {
    const channel = ds.add(new FakeChannel());
    const transport = ds.add(new AgentHostIpcChannelTransport(channel));
    let closed = 0;
    ds.add(transport.onClose(() => closed++));
    transport.send({ jsonrpc: "2.0", id: 1, result: {} });
    assert.strictEqual(closed, 1);
    assert.strictEqual(channel.calls.find((c) => c.command === "send"), void 0);
  });
  test("logs real frames and redacts authentication tokens", async () => {
    const channel = ds.add(new FakeChannel());
    const fileService = ds.add(new FileService(new NullLogService()));
    ds.add(fileService.registerProvider("file", ds.add(new InMemoryFileSystemProvider())));
    const logger = ds.add(new AhpJsonlLogger(
      { logsHome: URI.file("/logs"), connectionId: "local-client", transport: "local" },
      fileService,
      new NullLogService()
    ));
    const transport = ds.add(new AgentHostIpcChannelTransport(channel, logger));
    await transport.connect();
    transport.send({ jsonrpc: "2.0", id: 1, method: "authenticate", params: { channel: "ahp-root://", resource: "https://example.com", token: "secret-token" } });
    channel.frameEmitter.fire('{"jsonrpc":"2.0","id":1,"result":{}}');
    await logger.flush();
    const entries = (await fileService.readFile(logger.resource)).value.toString().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.deepStrictEqual(entries.map((entry) => ({
      id: entry.id,
      method: entry.method,
      params: entry.params,
      dir: entry._ahpLog.dir,
      byteLength: entry._ahpLog.byteLength
    })), [
      { id: 1, method: "authenticate", params: { channel: "ahp-root://", resource: "https://example.com", token: "<redacted>" }, dir: "c2s", byteLength: 139 },
      { id: 1, method: void 0, params: void 0, dir: "s2c", byteLength: 36 }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvYWdlbnRIb3N0SXBjQ2hhbm5lbFRyYW5zcG9ydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgSUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0SXBjQ2hhbm5lbFRyYW5zcG9ydCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRIb3N0SXBjQ2hhbm5lbFRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBBaHBKc29ubExvZ2dlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9haHBKc29ubExvZ2dlci5qcyc7XG5cbmNsYXNzIEZha2VDaGFubmVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGFubmVsIHtcblx0cmVhZG9ubHkgZnJhbWVFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgY2xvc2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IGNhbGxzOiB7IGNvbW1hbmQ6IHN0cmluZzsgYXJnOiB1bmtub3duIH1bXSA9IFtdO1xuXHRjb25uZWN0UmVzdWx0OiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdHNlbmRSZXN1bHQ6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRjYWxsPFQ+KGNvbW1hbmQ6IHN0cmluZywgYXJnPzogdW5rbm93bik6IFByb21pc2U8VD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCh7IGNvbW1hbmQsIGFyZyB9KTtcblx0XHRpZiAoY29tbWFuZCA9PT0gJ2Nvbm5lY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb25uZWN0UmVzdWx0IGFzIFByb21pc2U8VD47XG5cdFx0fVxuXHRcdGlmIChjb21tYW5kID09PSAnc2VuZCcpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlbmRSZXN1bHQgYXMgUHJvbWlzZTxUPjtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQgYXMgVCk7XG5cdH1cblxuXHRsaXN0ZW48VD4oZXZlbnQ6IHN0cmluZyk6IEV2ZW50PFQ+IHtcblx0XHRpZiAoZXZlbnQgPT09ICdmcmFtZScpIHtcblx0XHRcdHJldHVybiB0aGlzLmZyYW1lRW1pdHRlci5ldmVudCBhcyBFdmVudDx1bmtub3duPiBhcyBFdmVudDxUPjtcblx0XHR9XG5cdFx0aWYgKGV2ZW50ID09PSAnY2xvc2UnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jbG9zZUVtaXR0ZXIuZXZlbnQgYXMgRXZlbnQ8dW5rbm93bj4gYXMgRXZlbnQ8VD47XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBldmVudDogJHtldmVudH1gKTtcblx0fVxufVxuXG5zdWl0ZSgnQWdlbnRIb3N0SXBjQ2hhbm5lbFRyYW5zcG9ydCcsICgpID0+IHtcblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyb3VuZC10cmlwcyBmcmFtZXMgaW4gYm90aCBkaXJlY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBkcy5hZGQobmV3IEZha2VDaGFubmVsKCkpO1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRzLmFkZChuZXcgQWdlbnRIb3N0SXBjQ2hhbm5lbFRyYW5zcG9ydChjaGFubmVsKSk7XG5cblx0XHRjb25zdCByZWNlaXZlZDogdW5rbm93bltdID0gW107XG5cdFx0ZHMuYWRkKHRyYW5zcG9ydC5vbk1lc3NhZ2UobXNnID0+IHJlY2VpdmVkLnB1c2gobXNnKSkpO1xuXG5cdFx0bGV0IGNsb3NlZCA9IDA7XG5cdFx0ZHMuYWRkKHRyYW5zcG9ydC5vbkNsb3NlKCgpID0+IGNsb3NlZCsrKSk7XG5cblx0XHRhd2FpdCB0cmFuc3BvcnQuY29ubmVjdCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbm5lbC5jYWxscywgW3sgY29tbWFuZDogJ2Nvbm5lY3QnLCBhcmc6IHVuZGVmaW5lZCB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zcG9ydC5pc09wZW4sIHRydWUpO1xuXG5cdFx0Ly8gSW5ib3VuZCBmcmFtZSBmcm9tIHNlcnZlclxuXHRcdGNoYW5uZWwuZnJhbWVFbWl0dGVyLmZpcmUoJ3tcImpzb25ycGNcIjpcIjIuMFwiLFwiaWRcIjoxLFwicmVzdWx0XCI6e319Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZCwgW3sganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6IHt9IH1dKTtcblxuXHRcdC8vIE91dGJvdW5kIHNlbmQgaXMgc2VyaWFsaXplZCB0byBhIHN0cmluZ1xuXHRcdHRyYW5zcG9ydC5zZW5kKHsganNvbnJwYzogJzIuMCcsIGlkOiAyLCByZXN1bHQ6IHt9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbm5lbC5jYWxscy5hdCgtMSksIHtcblx0XHRcdGNvbW1hbmQ6ICdzZW5kJyxcblx0XHRcdGFyZzogJ3tcImpzb25ycGNcIjpcIjIuMFwiLFwiaWRcIjoyLFwicmVzdWx0XCI6e319Jyxcblx0XHR9KTtcblxuXHRcdC8vIFNlcnZlci1pbml0aWF0ZWQgY2xvc2Vcblx0XHRjaGFubmVsLmNsb3NlRW1pdHRlci5maXJlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlZCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zcG9ydC5pc09wZW4sIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHMgc2VuZCB3aGVuIHRyYW5zcG9ydCBpcyBub3Qgb3BlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGFubmVsID0gZHMuYWRkKG5ldyBGYWtlQ2hhbm5lbCgpKTtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBkcy5hZGQobmV3IEFnZW50SG9zdElwY0NoYW5uZWxUcmFuc3BvcnQoY2hhbm5lbCkpO1xuXG5cdFx0bGV0IGNsb3NlZCA9IDA7XG5cdFx0ZHMuYWRkKHRyYW5zcG9ydC5vbkNsb3NlKCgpID0+IGNsb3NlZCsrKSk7XG5cblx0XHQvLyBzZW5kIGJlZm9yZSBjb25uZWN0IFx1MjE5MiBkcm9wcyArIGZvcmNlcyBjbG9zZSBvbmNlXG5cdFx0dHJhbnNwb3J0LnNlbmQoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDoge30gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb3NlZCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5uZWwuY2FsbHMuZmluZChjID0+IGMuY29tbWFuZCA9PT0gJ3NlbmQnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbG9ncyByZWFsIGZyYW1lcyBhbmQgcmVkYWN0cyBhdXRoZW50aWNhdGlvbiB0b2tlbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IGRzLmFkZChuZXcgRmFrZUNoYW5uZWwoKSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZHMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgbG9nZ2VyID0gZHMuYWRkKG5ldyBBaHBKc29ubExvZ2dlcihcblx0XHRcdHsgbG9nc0hvbWU6IFVSSS5maWxlKCcvbG9ncycpLCBjb25uZWN0aW9uSWQ6ICdsb2NhbC1jbGllbnQnLCB0cmFuc3BvcnQ6ICdsb2NhbCcgfSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZHMuYWRkKG5ldyBBZ2VudEhvc3RJcGNDaGFubmVsVHJhbnNwb3J0KGNoYW5uZWwsIGxvZ2dlcikpO1xuXG5cdFx0YXdhaXQgdHJhbnNwb3J0LmNvbm5lY3QoKTtcblx0XHR0cmFuc3BvcnQuc2VuZCh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgbWV0aG9kOiAnYXV0aGVudGljYXRlJywgcGFyYW1zOiB7IGNoYW5uZWw6ICdhaHAtcm9vdDovLycsIHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsIHRva2VuOiAnc2VjcmV0LXRva2VuJyB9IH0pO1xuXHRcdGNoYW5uZWwuZnJhbWVFbWl0dGVyLmZpcmUoJ3tcImpzb25ycGNcIjpcIjIuMFwiLFwiaWRcIjoxLFwicmVzdWx0XCI6e319Jyk7XG5cdFx0YXdhaXQgbG9nZ2VyLmZsdXNoKCk7XG5cblx0XHRjb25zdCBlbnRyaWVzID0gKGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGxvZ2dlci5yZXNvdXJjZSkpLnZhbHVlLnRvU3RyaW5nKCkuc3BsaXQoJ1xcbicpLmZpbHRlcihCb29sZWFuKS5tYXAobGluZSA9PiBKU09OLnBhcnNlKGxpbmUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJpZXMubWFwKGVudHJ5ID0+ICh7XG5cdFx0XHRpZDogZW50cnkuaWQsXG5cdFx0XHRtZXRob2Q6IGVudHJ5Lm1ldGhvZCxcblx0XHRcdHBhcmFtczogZW50cnkucGFyYW1zLFxuXHRcdFx0ZGlyOiBlbnRyeS5fYWhwTG9nLmRpcixcblx0XHRcdGJ5dGVMZW5ndGg6IGVudHJ5Ll9haHBMb2cuYnl0ZUxlbmd0aCxcblx0XHR9KSksIFtcblx0XHRcdHsgaWQ6IDEsIG1ldGhvZDogJ2F1dGhlbnRpY2F0ZScsIHBhcmFtczogeyBjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLCByZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLCB0b2tlbjogJzxyZWRhY3RlZD4nIH0sIGRpcjogJ2MycycsIGJ5dGVMZW5ndGg6IDEzOSB9LFxuXHRcdFx0eyBpZDogMSwgbWV0aG9kOiB1bmRlZmluZWQsIHBhcmFtczogdW5kZWZpbmVkLCBkaXI6ICdzMmMnLCBieXRlTGVuZ3RoOiAzNiB9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0sb0JBQW9CLFdBQStCO0FBQUEsRUFBekQ7QUFBQTtBQUNDLFNBQVMsZUFBZSxLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQzVELFNBQVMsZUFBZSxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDMUQsU0FBUyxRQUE2QyxDQUFDO0FBQ3ZELHlCQUErQixRQUFRLFFBQVE7QUFDL0Msc0JBQTRCLFFBQVEsUUFBUTtBQUFBO0FBQUEsRUFFNUMsS0FBUSxTQUFpQixLQUEyQjtBQUNuRCxTQUFLLE1BQU0sS0FBSyxFQUFFLFNBQVMsSUFBSSxDQUFDO0FBQ2hDLFFBQUksWUFBWSxXQUFXO0FBQzFCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxRQUFJLFlBQVksUUFBUTtBQUN2QixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsV0FBTyxRQUFRLFFBQVEsTUFBYztBQUFBLEVBQ3RDO0FBQUEsRUFFQSxPQUFVLE9BQXlCO0FBQ2xDLFFBQUksVUFBVSxTQUFTO0FBQ3RCLGFBQU8sS0FBSyxhQUFhO0FBQUEsSUFDMUI7QUFDQSxRQUFJLFVBQVUsU0FBUztBQUN0QixhQUFPLEtBQUss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
