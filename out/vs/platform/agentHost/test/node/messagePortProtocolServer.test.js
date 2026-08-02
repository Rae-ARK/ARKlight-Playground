import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { JSON_RPC_PARSE_ERROR } from "../../common/state/sessionProtocol.js";
import { MessagePortProtocolServer } from "../../node/messagePortProtocolServer.js";
suite("MessagePortProtocolServer", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("isolates raw frames for each connected IPC client", async () => {
    const server = ds.add(new MessagePortProtocolServer());
    const frames = /* @__PURE__ */ new Map();
    const messages = /* @__PURE__ */ new Map();
    const transports = [];
    for (const client of ["one", "two"]) {
      frames.set(client, []);
      messages.set(client, []);
      ds.add(server.listen(client, "frame")((frame) => frames.get(client).push(frame)));
    }
    ds.add(server.onConnection((transport) => {
      const index = transports.push(transport) - 1;
      ds.add(transport.onMessage((message) => messages.get(index === 0 ? "one" : "two").push(message)));
    }));
    await server.call("one", "connect");
    await server.call("two", "connect");
    await server.call("one", "send", '{"jsonrpc":"2.0","id":1,"method":"one"}');
    await server.call("two", "send", '{"jsonrpc":"2.0","id":2,"method":"two"}');
    transports[0].send({ jsonrpc: "2.0", id: 1, result: { client: "one" } });
    transports[1].send({ jsonrpc: "2.0", id: 2, result: { client: "two" } });
    assert.deepStrictEqual({ messages, frames }, {
      messages: /* @__PURE__ */ new Map([
        ["one", [{ jsonrpc: "2.0", id: 1, method: "one" }]],
        ["two", [{ jsonrpc: "2.0", id: 2, method: "two" }]]
      ]),
      frames: /* @__PURE__ */ new Map([
        ["one", ['{"jsonrpc":"2.0","id":1,"result":{"client":"one"}}']],
        ["two", ['{"jsonrpc":"2.0","id":2,"result":{"client":"two"}}']]
      ])
    });
  });
  test("returns a parse error to only the client that sends malformed JSON", async () => {
    const server = ds.add(new MessagePortProtocolServer());
    const frames = /* @__PURE__ */ new Map([["one", []], ["two", []]]);
    const received = [];
    for (const client of frames.keys()) {
      ds.add(server.listen(client, "frame")((frame) => frames.get(client).push(frame)));
    }
    ds.add(server.onConnection((transport) => ds.add(transport.onMessage((message) => received.push(message)))));
    await server.call("one", "connect");
    await server.call("two", "connect");
    await server.call("one", "send", "{invalid");
    assert.deepStrictEqual({ frames, received }, {
      frames: /* @__PURE__ */ new Map([
        ["one", [JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: JSON_RPC_PARSE_ERROR, message: "Parse error" } })]],
        ["two", []]
      ]),
      received: []
    });
  });
  test("closes independent transports on IPC disconnect and channel close", async () => {
    const server = ds.add(new MessagePortProtocolServer());
    const closed = /* @__PURE__ */ new Map([["one", 0], ["two", 0]]);
    const messages = /* @__PURE__ */ new Map([["one", []], ["two", []]]);
    for (const client of closed.keys()) {
      ds.add(server.listen(client, "close")(() => closed.set(client, closed.get(client) + 1)));
    }
    let connection = 0;
    ds.add(server.onConnection((transport) => {
      const client = connection++ === 0 ? "one" : "two";
      ds.add(transport.onMessage((message) => messages.get(client).push(message)));
    }));
    await server.call("one", "connect");
    await server.call("two", "connect");
    server.closeClient("one");
    await assert.rejects(() => server.call("one", "send", '{"jsonrpc":"2.0","method":"closed"}'), /not connected/);
    await server.call("two", "send", '{"jsonrpc":"2.0","method":"open"}');
    await server.call("two", "close");
    assert.deepStrictEqual({ closed, messages }, {
      closed: /* @__PURE__ */ new Map([["one", 1], ["two", 1]]),
      messages: /* @__PURE__ */ new Map([
        ["one", []],
        ["two", [{ jsonrpc: "2.0", method: "open" }]]
      ])
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvbWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBKU09OX1JQQ19QQVJTRV9FUlJPUiwgdHlwZSBQcm90b2NvbE1lc3NhZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB0eXBlIHsgSVByb3RvY29sVHJhbnNwb3J0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25UcmFuc3BvcnQuanMnO1xuaW1wb3J0IHsgTWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlciB9IGZyb20gJy4uLy4uL25vZGUvbWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlci5qcyc7XG5cbnN1aXRlKCdNZXNzYWdlUG9ydFByb3RvY29sU2VydmVyJywgKCkgPT4ge1xuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2lzb2xhdGVzIHJhdyBmcmFtZXMgZm9yIGVhY2ggY29ubmVjdGVkIElQQyBjbGllbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gZHMuYWRkKG5ldyBNZXNzYWdlUG9ydFByb3RvY29sU2VydmVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgZnJhbWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZ1tdPigpO1xuXHRcdGNvbnN0IG1lc3NhZ2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb3RvY29sTWVzc2FnZVtdPigpO1xuXHRcdGNvbnN0IHRyYW5zcG9ydHM6IElQcm90b2NvbFRyYW5zcG9ydFtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGNsaWVudCBvZiBbJ29uZScsICd0d28nXSkge1xuXHRcdFx0ZnJhbWVzLnNldChjbGllbnQsIFtdKTtcblx0XHRcdG1lc3NhZ2VzLnNldChjbGllbnQsIFtdKTtcblx0XHRcdGRzLmFkZChzZXJ2ZXIubGlzdGVuPHN0cmluZz4oY2xpZW50LCAnZnJhbWUnKShmcmFtZSA9PiBmcmFtZXMuZ2V0KGNsaWVudCkhLnB1c2goZnJhbWUpKSk7XG5cdFx0fVxuXHRcdGRzLmFkZChzZXJ2ZXIub25Db25uZWN0aW9uKHRyYW5zcG9ydCA9PiB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRyYW5zcG9ydHMucHVzaCh0cmFuc3BvcnQpIC0gMTtcblx0XHRcdGRzLmFkZCh0cmFuc3BvcnQub25NZXNzYWdlKG1lc3NhZ2UgPT4gbWVzc2FnZXMuZ2V0KGluZGV4ID09PSAwID8gJ29uZScgOiAndHdvJykhLnB1c2gobWVzc2FnZSkpKTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBzZXJ2ZXIuY2FsbCgnb25lJywgJ2Nvbm5lY3QnKTtcblx0XHRhd2FpdCBzZXJ2ZXIuY2FsbCgndHdvJywgJ2Nvbm5lY3QnKTtcblx0XHRhd2FpdCBzZXJ2ZXIuY2FsbCgnb25lJywgJ3NlbmQnLCAne1wianNvbnJwY1wiOlwiMi4wXCIsXCJpZFwiOjEsXCJtZXRob2RcIjpcIm9uZVwifScpO1xuXHRcdGF3YWl0IHNlcnZlci5jYWxsKCd0d28nLCAnc2VuZCcsICd7XCJqc29ucnBjXCI6XCIyLjBcIixcImlkXCI6MixcIm1ldGhvZFwiOlwidHdvXCJ9Jyk7XG5cdFx0dHJhbnNwb3J0c1swXS5zZW5kKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCByZXN1bHQ6IHsgY2xpZW50OiAnb25lJyB9IH0pO1xuXHRcdHRyYW5zcG9ydHNbMV0uc2VuZCh7IGpzb25ycGM6ICcyLjAnLCBpZDogMiwgcmVzdWx0OiB7IGNsaWVudDogJ3R3bycgfSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBtZXNzYWdlcywgZnJhbWVzIH0sIHtcblx0XHRcdG1lc3NhZ2VzOiBuZXcgTWFwKFtcblx0XHRcdFx0WydvbmUnLCBbeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIG1ldGhvZDogJ29uZScgfV1dLFxuXHRcdFx0XHRbJ3R3bycsIFt7IGpzb25ycGM6ICcyLjAnLCBpZDogMiwgbWV0aG9kOiAndHdvJyB9XV0sXG5cdFx0XHRdKSxcblx0XHRcdGZyYW1lczogbmV3IE1hcChbXG5cdFx0XHRcdFsnb25lJywgWyd7XCJqc29ucnBjXCI6XCIyLjBcIixcImlkXCI6MSxcInJlc3VsdFwiOntcImNsaWVudFwiOlwib25lXCJ9fSddXSxcblx0XHRcdFx0Wyd0d28nLCBbJ3tcImpzb25ycGNcIjpcIjIuMFwiLFwiaWRcIjoyLFwicmVzdWx0XCI6e1wiY2xpZW50XCI6XCJ0d29cIn19J11dLFxuXHRcdFx0XSksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYSBwYXJzZSBlcnJvciB0byBvbmx5IHRoZSBjbGllbnQgdGhhdCBzZW5kcyBtYWxmb3JtZWQgSlNPTicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBkcy5hZGQobmV3IE1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBmcmFtZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KFtbJ29uZScsIFtdXSwgWyd0d28nLCBbXV1dKTtcblx0XHRjb25zdCByZWNlaXZlZDogUHJvdG9jb2xNZXNzYWdlW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgY2xpZW50IG9mIGZyYW1lcy5rZXlzKCkpIHtcblx0XHRcdGRzLmFkZChzZXJ2ZXIubGlzdGVuPHN0cmluZz4oY2xpZW50LCAnZnJhbWUnKShmcmFtZSA9PiBmcmFtZXMuZ2V0KGNsaWVudCkhLnB1c2goZnJhbWUpKSk7XG5cdFx0fVxuXHRcdGRzLmFkZChzZXJ2ZXIub25Db25uZWN0aW9uKHRyYW5zcG9ydCA9PiBkcy5hZGQodHJhbnNwb3J0Lm9uTWVzc2FnZShtZXNzYWdlID0+IHJlY2VpdmVkLnB1c2gobWVzc2FnZSkpKSkpO1xuXG5cdFx0YXdhaXQgc2VydmVyLmNhbGwoJ29uZScsICdjb25uZWN0Jyk7XG5cdFx0YXdhaXQgc2VydmVyLmNhbGwoJ3R3bycsICdjb25uZWN0Jyk7XG5cdFx0YXdhaXQgc2VydmVyLmNhbGwoJ29uZScsICdzZW5kJywgJ3tpbnZhbGlkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZnJhbWVzLCByZWNlaXZlZCB9LCB7XG5cdFx0XHRmcmFtZXM6IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ29uZScsIFtKU09OLnN0cmluZ2lmeSh7IGpzb25ycGM6ICcyLjAnLCBpZDogbnVsbCwgZXJyb3I6IHsgY29kZTogSlNPTl9SUENfUEFSU0VfRVJST1IsIG1lc3NhZ2U6ICdQYXJzZSBlcnJvcicgfSB9KV1dLFxuXHRcdFx0XHRbJ3R3bycsIFtdXSxcblx0XHRcdF0pLFxuXHRcdFx0cmVjZWl2ZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG9zZXMgaW5kZXBlbmRlbnQgdHJhbnNwb3J0cyBvbiBJUEMgZGlzY29ubmVjdCBhbmQgY2hhbm5lbCBjbG9zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSBkcy5hZGQobmV3IE1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBjbG9zZWQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPihbWydvbmUnLCAwXSwgWyd0d28nLCAwXV0pO1xuXHRcdGNvbnN0IG1lc3NhZ2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb3RvY29sTWVzc2FnZVtdPihbWydvbmUnLCBbXV0sIFsndHdvJywgW11dXSk7XG5cblx0XHRmb3IgKGNvbnN0IGNsaWVudCBvZiBjbG9zZWQua2V5cygpKSB7XG5cdFx0XHRkcy5hZGQoc2VydmVyLmxpc3Rlbjx2b2lkPihjbGllbnQsICdjbG9zZScpKCgpID0+IGNsb3NlZC5zZXQoY2xpZW50LCBjbG9zZWQuZ2V0KGNsaWVudCkhICsgMSkpKTtcblx0XHR9XG5cdFx0bGV0IGNvbm5lY3Rpb24gPSAwO1xuXHRcdGRzLmFkZChzZXJ2ZXIub25Db25uZWN0aW9uKHRyYW5zcG9ydCA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBjb25uZWN0aW9uKysgPT09IDAgPyAnb25lJyA6ICd0d28nO1xuXHRcdFx0ZHMuYWRkKHRyYW5zcG9ydC5vbk1lc3NhZ2UobWVzc2FnZSA9PiBtZXNzYWdlcy5nZXQoY2xpZW50KSEucHVzaChtZXNzYWdlKSkpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHNlcnZlci5jYWxsKCdvbmUnLCAnY29ubmVjdCcpO1xuXHRcdGF3YWl0IHNlcnZlci5jYWxsKCd0d28nLCAnY29ubmVjdCcpO1xuXHRcdHNlcnZlci5jbG9zZUNsaWVudCgnb25lJyk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc2VydmVyLmNhbGwoJ29uZScsICdzZW5kJywgJ3tcImpzb25ycGNcIjpcIjIuMFwiLFwibWV0aG9kXCI6XCJjbG9zZWRcIn0nKSwgL25vdCBjb25uZWN0ZWQvKTtcblx0XHRhd2FpdCBzZXJ2ZXIuY2FsbCgndHdvJywgJ3NlbmQnLCAne1wianNvbnJwY1wiOlwiMi4wXCIsXCJtZXRob2RcIjpcIm9wZW5cIn0nKTtcblx0XHRhd2FpdCBzZXJ2ZXIuY2FsbCgndHdvJywgJ2Nsb3NlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY2xvc2VkLCBtZXNzYWdlcyB9LCB7XG5cdFx0XHRjbG9zZWQ6IG5ldyBNYXAoW1snb25lJywgMV0sIFsndHdvJywgMV1dKSxcblx0XHRcdG1lc3NhZ2VzOiBuZXcgTWFwKFtcblx0XHRcdFx0WydvbmUnLCBbXV0sXG5cdFx0XHRcdFsndHdvJywgW3sganNvbnJwYzogJzIuMCcsIG1ldGhvZDogJ29wZW4nIH1dXSxcblx0XHRcdF0pLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNEJBQWtEO0FBRTNELFNBQVMsaUNBQWlDO0FBRTFDLE1BQU0sNkJBQTZCLE1BQU07QUFDeEMsUUFBTSxLQUFLLHdDQUF3QztBQUVuRCxPQUFLLHFEQUFxRCxZQUFZO0FBQ3JFLFVBQU0sU0FBUyxHQUFHLElBQUksSUFBSSwwQkFBa0MsQ0FBQztBQUM3RCxVQUFNLFNBQVMsb0JBQUksSUFBc0I7QUFDekMsVUFBTSxXQUFXLG9CQUFJLElBQStCO0FBQ3BELFVBQU0sYUFBbUMsQ0FBQztBQUUxQyxlQUFXLFVBQVUsQ0FBQyxPQUFPLEtBQUssR0FBRztBQUNwQyxhQUFPLElBQUksUUFBUSxDQUFDLENBQUM7QUFDckIsZUFBUyxJQUFJLFFBQVEsQ0FBQyxDQUFDO0FBQ3ZCLFNBQUcsSUFBSSxPQUFPLE9BQWUsUUFBUSxPQUFPLEVBQUUsV0FBUyxPQUFPLElBQUksTUFBTSxFQUFHLEtBQUssS0FBSyxDQUFDLENBQUM7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
