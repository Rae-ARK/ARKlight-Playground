import assert from "assert";
import { DeferredPromise } from "../../common/async.js";
import { CancellationTokenSource } from "../../common/cancellation.js";
import { CancellationError } from "../../common/errors.js";
import { JsonRpcError, JsonRpcProtocol } from "../../common/jsonRpcProtocol.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JsonRpcProtocol", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const createProtocol = (handlers = {}) => {
    const sentMessages = [];
    const protocol = new JsonRpcProtocol((message) => sentMessages.push(message), handlers);
    store.add(protocol);
    return { protocol, sentMessages };
  };
  test("sendNotification adds jsonrpc envelope", () => {
    const { protocol, sentMessages } = createProtocol();
    protocol.sendNotification({ method: "notify", params: { value: 1 } });
    assert.deepStrictEqual(sentMessages, [{
      jsonrpc: "2.0",
      method: "notify",
      params: { value: 1 }
    }]);
  });
  test("sendRequest resolves on success response", async () => {
    const { protocol, sentMessages } = createProtocol();
    const requestPromise = protocol.sendRequest({ method: "echo", params: { value: "ok" } });
    const outgoingRequest = sentMessages[0];
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: outgoingRequest.id,
      result: "done"
    });
    const result = await requestPromise;
    assert.strictEqual(result, "done");
    assert.deepStrictEqual(replies, []);
  });
  test("sendRequest rejects on error response", async () => {
    const { protocol, sentMessages } = createProtocol();
    const requestPromise = protocol.sendRequest({ method: "fail" });
    const outgoingRequest = sentMessages[0];
    await protocol.handleMessage({
      jsonrpc: "2.0",
      id: outgoingRequest.id,
      error: {
        code: 123,
        message: "Failure",
        data: { source: "test" }
      }
    });
    await assert.rejects(requestPromise, (error) => {
      assert.ok(error instanceof JsonRpcError);
      assert.strictEqual(error.code, 123);
      assert.strictEqual(error.message, "Failure");
      assert.deepStrictEqual(error.data, { source: "test" });
      return true;
    });
  });
  test("sendRequest honors cancellation token and invokes onCancel", async () => {
    const { protocol, sentMessages } = createProtocol();
    const cts = new CancellationTokenSource();
    let canceledId;
    const requestPromise = protocol.sendRequest(
      { method: "cancel-me" },
      cts.token,
      (id) => canceledId = id
    );
    const outgoingRequest = sentMessages[0];
    cts.cancel();
    await assert.rejects(requestPromise, (error) => error instanceof CancellationError);
    assert.strictEqual(canceledId, outgoingRequest.id);
    cts.dispose(true);
  });
  test("cancelPendingRequest rejects active request", async () => {
    const { protocol, sentMessages } = createProtocol();
    const requestPromise = protocol.sendRequest({ method: "pending" });
    const outgoingRequest = sentMessages[0];
    protocol.cancelPendingRequest(outgoingRequest.id);
    await assert.rejects(requestPromise, (error) => error instanceof CancellationError);
  });
  test("handleRequest responds with method not found without handler", async () => {
    const { protocol, sentMessages } = createProtocol();
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: 7,
      method: "unknown"
    });
    const expected = [{
      jsonrpc: "2.0",
      id: 7,
      error: {
        code: -32601,
        message: "Method not found: unknown"
      }
    }];
    assert.deepStrictEqual(sentMessages, expected);
    assert.deepStrictEqual(replies, expected);
  });
  test("handleRequest responds with result and passes cancellation token", async () => {
    let receivedToken;
    let wasCanceledDuringHandler;
    const { protocol, sentMessages } = createProtocol({
      handleRequest: async (request, token) => {
        receivedToken = token;
        wasCanceledDuringHandler = token.isCancellationRequested;
        return `${request.method}:ok`;
      }
    });
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: 9,
      method: "compute"
    });
    assert.ok(receivedToken);
    assert.strictEqual(wasCanceledDuringHandler, false);
    const expected = [{
      jsonrpc: "2.0",
      id: 9,
      result: "compute:ok"
    }];
    assert.deepStrictEqual(sentMessages, expected);
    assert.deepStrictEqual(replies, expected);
  });
  test("handleRequest serializes JsonRpcError and returns it", async () => {
    const { protocol, sentMessages } = createProtocol({
      handleRequest: () => {
        throw new JsonRpcError(88, "bad request", { detail: true });
      }
    });
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: "a",
      method: "boom"
    });
    const expected = [{
      jsonrpc: "2.0",
      id: "a",
      error: {
        code: 88,
        message: "bad request",
        data: { detail: true }
      }
    }];
    assert.deepStrictEqual(sentMessages, expected);
    assert.deepStrictEqual(replies, expected);
  });
  test("handleRequest maps unknown errors to internal error and returns it", async () => {
    const { protocol, sentMessages } = createProtocol({
      handleRequest: () => {
        throw new Error("unexpected");
      }
    });
    const replies = await protocol.handleMessage({
      jsonrpc: "2.0",
      id: "b",
      method: "explode"
    });
    const expected = [{
      jsonrpc: "2.0",
      id: "b",
      error: {
        code: -32603,
        message: "unexpected"
      }
    }];
    assert.deepStrictEqual(sentMessages, expected);
    assert.deepStrictEqual(replies, expected);
  });
  test("handleMessage processes batch sequentially", async () => {
    const sequence = [];
    const gate = new DeferredPromise();
    const { protocol } = createProtocol({
      handleRequest: async () => {
        sequence.push("request:start");
        await gate.p;
        sequence.push("request:end");
        return true;
      },
      handleNotification: () => {
        sequence.push("notification");
      }
    });
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "first"
    };
    const notification = {
      jsonrpc: "2.0",
      method: "second"
    };
    const handlingPromise = protocol.handleMessage([request, notification]);
    assert.deepStrictEqual(sequence, ["request:start"]);
    gate.complete();
    const replies = await handlingPromise;
    assert.deepStrictEqual(sequence, ["request:start", "request:end", "notification"]);
    assert.deepStrictEqual(replies, [{ jsonrpc: "2.0", id: 1, result: true }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vanNvblJwY1Byb3RvY29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUpzb25ScGNOb3RpZmljYXRpb24sIElKc29uUnBjUHJvdG9jb2xIYW5kbGVycywgSUpzb25ScGNSZXF1ZXN0LCBKc29uUnBjRXJyb3IsIEpzb25ScGNNZXNzYWdlLCBKc29uUnBjUHJvdG9jb2wgfSBmcm9tICcuLi8uLi9jb21tb24vanNvblJwY1Byb3RvY29sLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnSnNvblJwY1Byb3RvY29sJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgY3JlYXRlUHJvdG9jb2wgPSAoaGFuZGxlcnM6IElKc29uUnBjUHJvdG9jb2xIYW5kbGVycyA9IHt9KSA9PiB7XG5cdFx0Y29uc3Qgc2VudE1lc3NhZ2VzOiBKc29uUnBjTWVzc2FnZVtdID0gW107XG5cdFx0Y29uc3QgcHJvdG9jb2wgPSBuZXcgSnNvblJwY1Byb3RvY29sKG1lc3NhZ2UgPT4gc2VudE1lc3NhZ2VzLnB1c2gobWVzc2FnZSksIGhhbmRsZXJzKTtcblx0XHRzdG9yZS5hZGQocHJvdG9jb2wpO1xuXHRcdHJldHVybiB7IHByb3RvY29sLCBzZW50TWVzc2FnZXMgfTtcblx0fTtcblxuXHR0ZXN0KCdzZW5kTm90aWZpY2F0aW9uIGFkZHMganNvbnJwYyBlbnZlbG9wZScsICgpID0+IHtcblx0XHRjb25zdCB7IHByb3RvY29sLCBzZW50TWVzc2FnZXMgfSA9IGNyZWF0ZVByb3RvY29sKCk7XG5cblx0XHRwcm90b2NvbC5zZW5kTm90aWZpY2F0aW9uKHsgbWV0aG9kOiAnbm90aWZ5JywgcGFyYW1zOiB7IHZhbHVlOiAxIH0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnRNZXNzYWdlcywgW3tcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0bWV0aG9kOiAnbm90aWZ5Jyxcblx0XHRcdHBhcmFtczogeyB2YWx1ZTogMSB9XG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCByZXNvbHZlcyBvbiBzdWNjZXNzIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdG9jb2wsIHNlbnRNZXNzYWdlcyB9ID0gY3JlYXRlUHJvdG9jb2woKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RQcm9taXNlID0gcHJvdG9jb2wuc2VuZFJlcXVlc3Q8c3RyaW5nPih7IG1ldGhvZDogJ2VjaG8nLCBwYXJhbXM6IHsgdmFsdWU6ICdvaycgfSB9KTtcblx0XHRjb25zdCBvdXRnb2luZ1JlcXVlc3QgPSBzZW50TWVzc2FnZXNbMF0gYXMgSUpzb25ScGNSZXF1ZXN0O1xuXG5cdFx0Y29uc3QgcmVwbGllcyA9IGF3YWl0IHByb3RvY29sLmhhbmRsZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogb3V0Z29pbmdSZXF1ZXN0LmlkLFxuXHRcdFx0cmVzdWx0OiAnZG9uZSdcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlcXVlc3RQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdkb25lJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXBsaWVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRSZXF1ZXN0IHJlamVjdHMgb24gZXJyb3IgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm90b2NvbCwgc2VudE1lc3NhZ2VzIH0gPSBjcmVhdGVQcm90b2NvbCgpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdFByb21pc2UgPSBwcm90b2NvbC5zZW5kUmVxdWVzdCh7IG1ldGhvZDogJ2ZhaWwnIH0pO1xuXHRcdGNvbnN0IG91dGdvaW5nUmVxdWVzdCA9IHNlbnRNZXNzYWdlc1swXSBhcyBJSnNvblJwY1JlcXVlc3Q7XG5cblx0XHRhd2FpdCBwcm90b2NvbC5oYW5kbGVNZXNzYWdlKHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IG91dGdvaW5nUmVxdWVzdC5pZCxcblx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdGNvZGU6IDEyMyxcblx0XHRcdFx0bWVzc2FnZTogJ0ZhaWx1cmUnLFxuXHRcdFx0XHRkYXRhOiB7IHNvdXJjZTogJ3Rlc3QnIH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlcXVlc3RQcm9taXNlLCBlcnJvciA9PiB7XG5cdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBKc29uUnBjRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmNvZGUsIDEyMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IubWVzc2FnZSwgJ0ZhaWx1cmUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXJyb3IuZGF0YSwgeyBzb3VyY2U6ICd0ZXN0JyB9KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCBob25vcnMgY2FuY2VsbGF0aW9uIHRva2VuIGFuZCBpbnZva2VzIG9uQ2FuY2VsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdG9jb2wsIHNlbnRNZXNzYWdlcyB9ID0gY3JlYXRlUHJvdG9jb2woKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRsZXQgY2FuY2VsZWRJZDogc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcmVxdWVzdFByb21pc2UgPSBwcm90b2NvbC5zZW5kUmVxdWVzdChcblx0XHRcdHsgbWV0aG9kOiAnY2FuY2VsLW1lJyB9LFxuXHRcdFx0Y3RzLnRva2VuLFxuXHRcdFx0aWQgPT4gY2FuY2VsZWRJZCA9IGlkLFxuXHRcdCk7XG5cdFx0Y29uc3Qgb3V0Z29pbmdSZXF1ZXN0ID0gc2VudE1lc3NhZ2VzWzBdIGFzIElKc29uUnBjUmVxdWVzdDtcblxuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlcXVlc3RQcm9taXNlLCBlcnJvciA9PiBlcnJvciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VsZWRJZCwgb3V0Z29pbmdSZXF1ZXN0LmlkKTtcblxuXHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxQZW5kaW5nUmVxdWVzdCByZWplY3RzIGFjdGl2ZSByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdG9jb2wsIHNlbnRNZXNzYWdlcyB9ID0gY3JlYXRlUHJvdG9jb2woKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RQcm9taXNlID0gcHJvdG9jb2wuc2VuZFJlcXVlc3QoeyBtZXRob2Q6ICdwZW5kaW5nJyB9KTtcblx0XHRjb25zdCBvdXRnb2luZ1JlcXVlc3QgPSBzZW50TWVzc2FnZXNbMF0gYXMgSUpzb25ScGNSZXF1ZXN0O1xuXHRcdHByb3RvY29sLmNhbmNlbFBlbmRpbmdSZXF1ZXN0KG91dGdvaW5nUmVxdWVzdC5pZCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXF1ZXN0UHJvbWlzZSwgZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZVJlcXVlc3QgcmVzcG9uZHMgd2l0aCBtZXRob2Qgbm90IGZvdW5kIHdpdGhvdXQgaGFuZGxlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3RvY29sLCBzZW50TWVzc2FnZXMgfSA9IGNyZWF0ZVByb3RvY29sKCk7XG5cblx0XHRjb25zdCByZXBsaWVzID0gYXdhaXQgcHJvdG9jb2wuaGFuZGxlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiA3LFxuXHRcdFx0bWV0aG9kOiAndW5rbm93bidcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW3tcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6IDcsXG5cdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRjb2RlOiAtMzI2MDEsXG5cdFx0XHRcdG1lc3NhZ2U6ICdNZXRob2Qgbm90IGZvdW5kOiB1bmtub3duJ1xuXHRcdFx0fVxuXHRcdH1dO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VudE1lc3NhZ2VzLCBleHBlY3RlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXBsaWVzLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZVJlcXVlc3QgcmVzcG9uZHMgd2l0aCByZXN1bHQgYW5kIHBhc3NlcyBjYW5jZWxsYXRpb24gdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlY2VpdmVkVG9rZW46IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB3YXNDYW5jZWxlZER1cmluZ0hhbmRsZXI6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgeyBwcm90b2NvbCwgc2VudE1lc3NhZ2VzIH0gPSBjcmVhdGVQcm90b2NvbCh7XG5cdFx0XHRoYW5kbGVSZXF1ZXN0OiBhc3luYyAocmVxdWVzdCwgdG9rZW4pID0+IHtcblx0XHRcdFx0cmVjZWl2ZWRUb2tlbiA9IHRva2VuO1xuXHRcdFx0XHR3YXNDYW5jZWxlZER1cmluZ0hhbmRsZXIgPSB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZDtcblx0XHRcdFx0cmV0dXJuIGAke3JlcXVlc3QubWV0aG9kfTpva2A7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXBsaWVzID0gYXdhaXQgcHJvdG9jb2wuaGFuZGxlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiA5LFxuXHRcdFx0bWV0aG9kOiAnY29tcHV0ZSdcblx0XHR9KTtcblxuXHRcdGFzc2VydC5vayhyZWNlaXZlZFRva2VuKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2FzQ2FuY2VsZWREdXJpbmdIYW5kbGVyLCBmYWxzZSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogOSxcblx0XHRcdHJlc3VsdDogJ2NvbXB1dGU6b2snXG5cdFx0fV07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZW50TWVzc2FnZXMsIGV4cGVjdGVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcGxpZXMsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlUmVxdWVzdCBzZXJpYWxpemVzIEpzb25ScGNFcnJvciBhbmQgcmV0dXJucyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3RvY29sLCBzZW50TWVzc2FnZXMgfSA9IGNyZWF0ZVByb3RvY29sKHtcblx0XHRcdGhhbmRsZVJlcXVlc3Q6ICgpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEpzb25ScGNFcnJvcig4OCwgJ2JhZCByZXF1ZXN0JywgeyBkZXRhaWw6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXBsaWVzID0gYXdhaXQgcHJvdG9jb2wuaGFuZGxlTWVzc2FnZSh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAnYScsXG5cdFx0XHRtZXRob2Q6ICdib29tJ1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogJ2EnLFxuXHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0Y29kZTogODgsXG5cdFx0XHRcdG1lc3NhZ2U6ICdiYWQgcmVxdWVzdCcsXG5cdFx0XHRcdGRhdGE6IHsgZGV0YWlsOiB0cnVlIH1cblx0XHRcdH1cblx0XHR9XTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnRNZXNzYWdlcywgZXhwZWN0ZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVwbGllcywgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVSZXF1ZXN0IG1hcHMgdW5rbm93biBlcnJvcnMgdG8gaW50ZXJuYWwgZXJyb3IgYW5kIHJldHVybnMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm90b2NvbCwgc2VudE1lc3NhZ2VzIH0gPSBjcmVhdGVQcm90b2NvbCh7XG5cdFx0XHRoYW5kbGVSZXF1ZXN0OiAoKSA9PiB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigndW5leHBlY3RlZCcpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVwbGllcyA9IGF3YWl0IHByb3RvY29sLmhhbmRsZU1lc3NhZ2Uoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogJ2InLFxuXHRcdFx0bWV0aG9kOiAnZXhwbG9kZSdcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gW3tcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0aWQ6ICdiJyxcblx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdGNvZGU6IC0zMjYwMyxcblx0XHRcdFx0bWVzc2FnZTogJ3VuZXhwZWN0ZWQnXG5cdFx0XHR9XG5cdFx0fV07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZW50TWVzc2FnZXMsIGV4cGVjdGVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcGxpZXMsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlTWVzc2FnZSBwcm9jZXNzZXMgYmF0Y2ggc2VxdWVudGlhbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcXVlbmNlOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGdhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgeyBwcm90b2NvbCB9ID0gY3JlYXRlUHJvdG9jb2woe1xuXHRcdFx0aGFuZGxlUmVxdWVzdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXF1ZW5jZS5wdXNoKCdyZXF1ZXN0OnN0YXJ0Jyk7XG5cdFx0XHRcdGF3YWl0IGdhdGUucDtcblx0XHRcdFx0c2VxdWVuY2UucHVzaCgncmVxdWVzdDplbmQnKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0aGFuZGxlTm90aWZpY2F0aW9uOiAoKSA9PiB7XG5cdFx0XHRcdHNlcXVlbmNlLnB1c2goJ25vdGlmaWNhdGlvbicpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVxdWVzdDogSUpzb25ScGNSZXF1ZXN0ID0ge1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogMSxcblx0XHRcdG1ldGhvZDogJ2ZpcnN0J1xuXHRcdH07XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uOiBJSnNvblJwY05vdGlmaWNhdGlvbiA9IHtcblx0XHRcdGpzb25ycGM6ICcyLjAnLFxuXHRcdFx0bWV0aG9kOiAnc2Vjb25kJ1xuXHRcdH07XG5cblx0XHRjb25zdCBoYW5kbGluZ1Byb21pc2UgPSBwcm90b2NvbC5oYW5kbGVNZXNzYWdlKFtyZXF1ZXN0LCBub3RpZmljYXRpb25dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcXVlbmNlLCBbJ3JlcXVlc3Q6c3RhcnQnXSk7XG5cblx0XHRnYXRlLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgcmVwbGllcyA9IGF3YWl0IGhhbmRsaW5nUHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VxdWVuY2UsIFsncmVxdWVzdDpzdGFydCcsICdyZXF1ZXN0OmVuZCcsICdub3RpZmljYXRpb24nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXBsaWVzLCBbeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIHJlc3VsdDogdHJ1ZSB9XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMseUJBQXlCO0FBQ2xDLFNBQTBFLGNBQThCLHVCQUF1QjtBQUMvSCxTQUFTLCtDQUErQztBQUV4RCxNQUFNLG1CQUFt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
