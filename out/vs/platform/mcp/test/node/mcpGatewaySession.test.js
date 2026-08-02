import assert from "assert";
import { EventEmitter } from "events";
import { Emitter } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { McpGatewaySession } from "../../node/mcpGatewaySession.js";
class TestServerResponse extends EventEmitter {
  constructor() {
    super(...arguments);
    this.writes = [];
    this.destroyed = false;
    this.writableEnded = false;
  }
  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }
  write(chunk) {
    this.writes.push(chunk);
    return true;
  }
  end(chunk) {
    if (chunk) {
      this.writes.push(chunk);
    }
    this.writableEnded = true;
    this.destroyed = true;
    this.emit("close");
    return this;
  }
}
suite("McpGatewaySession", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createInvoker() {
    const onDidChangeTools = new Emitter();
    const onDidChangeResources = new Emitter();
    const tools = [{
      name: "test_tool",
      description: "Test tool",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" }
        }
      }
    }];
    const resources = [{
      uri: "file:///test/resource.txt",
      name: "resource.txt"
    }];
    return {
      onDidChangeTools,
      onDidChangeResources,
      invoker: {
        onDidChangeTools: onDidChangeTools.event,
        onDidChangeResources: onDidChangeResources.event,
        listTools: async () => tools,
        callTool: async (_name, args) => ({
          content: [{ type: "text", text: `Hello, ${typeof args.name === "string" ? args.name : "World"}!` }]
        }),
        listResources: async () => resources,
        readResource: async (_uri) => ({
          contents: [{ uri: "file:///test/resource.txt", text: "hello world", mimeType: "text/plain" }]
        }),
        listResourceTemplates: async () => [{ uriTemplate: "file:///test/{name}", name: "Test Template" }]
      }
    };
  }
  test("returns initialize result", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-1", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" }
      }
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.jsonrpc, "2.0");
    assert.strictEqual(response.id, 1);
    assert.strictEqual(response.result.protocolVersion, "2025-11-25");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("negotiates to older protocol version when client requests it", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-negotiate-1", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" }
      }
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.result.protocolVersion, "2025-03-26");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("negotiates to each supported protocol version", async () => {
    const supportedVersions = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"];
    for (const version of supportedVersions) {
      const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
      const session = new McpGatewaySession(`session-ver-${version}`, new NullLogService(), () => {
      }, invoker);
      const responses = await session.handleIncoming({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: version, capabilities: {} }
      });
      const response = responses[0];
      assert.strictEqual(
        response.result.protocolVersion,
        version,
        `Expected server to negotiate to ${version}`
      );
      session.dispose();
      onDidChangeTools.dispose();
      onDidChangeResources.dispose();
    }
  });
  test("falls back to latest version for unsupported client version", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-negotiate-2", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2099-01-01",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" }
      }
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.result.protocolVersion, "2025-11-25");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("falls back to latest version when no params provided", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-negotiate-3", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize"
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.result.protocolVersion, "2025-11-25");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("falls back to latest version when protocolVersion is not a string", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-negotiate-4", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: 42,
        capabilities: {}
      }
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.result.protocolVersion, "2025-11-25");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("initialize response includes server info and capabilities", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-init-caps", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {} }
    });
    const result = responses[0].result;
    assert.deepStrictEqual(result, {
      protocolVersion: "2025-03-26",
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true }
      },
      serverInfo: {
        name: "VS Code MCP Gateway",
        version: "1.0.0"
      }
    });
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("rejects non-initialize requests before initialized notification", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-2", new NullLogService(), () => {
    }, invoker);
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    });
    assert.strictEqual(responses.length, 1);
    const response = responses[0];
    assert.strictEqual(response.jsonrpc, "2.0");
    assert.strictEqual(response.id, 2);
    assert.strictEqual(response.error.code, -32600);
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("serves tools/list and tools/call after initialized notification", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-3", new NullLogService(), () => {
    }, invoker);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const notificationResponses = await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.strictEqual(notificationResponses.length, 0);
    const listResponses = await session.handleIncoming({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    const listResponse = listResponses[0];
    const tools = listResponse.result.tools;
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].name, "test_tool");
    const callResponses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "test_tool",
        arguments: {
          name: "VS Code"
        }
      }
    });
    const callResponse = callResponses[0];
    const text = callResponse.result.content[0].text;
    assert.strictEqual(text, "Hello, VS Code!");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("broadcasts notifications to attached SSE clients", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-4", new NullLogService(), () => {
    }, invoker);
    const response = new TestServerResponse();
    session.attachSseClient({}, response);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers?.["Content-Type"], "text/event-stream");
    assert.ok(response.writes.some((chunk) => chunk.includes(": connected")));
    assert.ok(response.writes.some((chunk) => chunk.includes("event: message")));
    assert.ok(response.writes.some((chunk) => chunk.includes("notifications/tools/list_changed")));
    assert.ok(response.writes.some((chunk) => chunk.includes("notifications/resources/list_changed")));
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("emits list changed on tool invoker changes", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-5", new NullLogService(), () => {
    }, invoker);
    const response = new TestServerResponse();
    session.attachSseClient({}, response);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const writesBefore = response.writes.length;
    onDidChangeTools.fire();
    assert.ok(response.writes.length > writesBefore);
    assert.ok(response.writes.slice(writesBefore).some((chunk) => chunk.includes("notifications/tools/list_changed")));
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("disposes attached SSE clients and callback", () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    let disposed = false;
    const session = new McpGatewaySession("session-6", new NullLogService(), () => {
      disposed = true;
    }, invoker);
    const response = new TestServerResponse();
    session.attachSseClient({}, response);
    session.dispose();
    assert.strictEqual(response.writableEnded, true);
    assert.strictEqual(disposed, true);
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("emits resources list changed on resource invoker changes", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-7", new NullLogService(), () => {
    }, invoker);
    const response = new TestServerResponse();
    session.attachSseClient({}, response);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const writesBefore = response.writes.length;
    onDidChangeResources.fire();
    assert.ok(response.writes.length > writesBefore);
    assert.ok(response.writes.slice(writesBefore).some((chunk) => chunk.includes("notifications/resources/list_changed")));
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("serves resources/list with raw URIs", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-8", new NullLogService(), () => {
    }, invoker);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const responses = await session.handleIncoming({ jsonrpc: "2.0", id: 2, method: "resources/list" });
    const response = responses[0];
    const resources = response.result.resources;
    assert.strictEqual(resources.length, 1);
    assert.strictEqual(resources[0].uri, "file:///test/resource.txt");
    assert.strictEqual(resources[0].name, "resource.txt");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("serves resources/read with raw URIs", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-9", new NullLogService(), () => {
    }, invoker);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const responses = await session.handleIncoming({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/read",
      params: { uri: "file:///test/resource.txt" }
    });
    const response = responses[0];
    const contents = response.result.contents;
    assert.strictEqual(contents.length, 1);
    assert.strictEqual(contents[0].uri, "file:///test/resource.txt");
    assert.strictEqual(contents[0].text, "hello world");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
  test("serves resources/templates/list with raw URI templates", async () => {
    const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
    const session = new McpGatewaySession("session-10", new NullLogService(), () => {
    }, invoker);
    await session.handleIncoming({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await session.handleIncoming({ jsonrpc: "2.0", method: "notifications/initialized" });
    const responses = await session.handleIncoming({ jsonrpc: "2.0", id: 2, method: "resources/templates/list" });
    const response = responses[0];
    const templates = response.result.resourceTemplates;
    assert.strictEqual(templates.length, 1);
    assert.strictEqual(templates[0].uriTemplate, "file:///test/{name}");
    assert.strictEqual(templates[0].name, "Test Template");
    session.dispose();
    onDidChangeTools.dispose();
    onDidChangeResources.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21jcC90ZXN0L25vZGUvbWNwR2F0ZXdheVNlc3Npb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUpzb25ScGNFcnJvclJlc3BvbnNlLCBJSnNvblJwY1N1Y2Nlc3NSZXNwb25zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25ScGNQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcbmltcG9ydCB7IE1jcEdhdGV3YXlTZXNzaW9uIH0gZnJvbSAnLi4vLi4vbm9kZS9tY3BHYXRld2F5U2Vzc2lvbi5qcyc7XG5cbmNsYXNzIFRlc3RTZXJ2ZXJSZXNwb25zZSBleHRlbmRzIEV2ZW50RW1pdHRlciB7XG5cdHB1YmxpYyBzdGF0dXNDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgd3JpdGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwdWJsaWMgZGVzdHJveWVkID0gZmFsc2U7XG5cdHB1YmxpYyB3cml0YWJsZUVuZGVkID0gZmFsc2U7XG5cblx0d3JpdGVIZWFkKHN0YXR1c0NvZGU6IG51bWJlciwgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pIHtcblx0XHR0aGlzLnN0YXR1c0NvZGUgPSBzdGF0dXNDb2RlO1xuXHRcdHRoaXMuaGVhZGVycyA9IGhlYWRlcnM7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHR3cml0ZShjaHVuazogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0dGhpcy53cml0ZXMucHVzaChjaHVuayk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRlbmQoY2h1bms/OiBzdHJpbmcpOiB0aGlzIHtcblx0XHRpZiAoY2h1bmspIHtcblx0XHRcdHRoaXMud3JpdGVzLnB1c2goY2h1bmspO1xuXHRcdH1cblxuXHRcdHRoaXMud3JpdGFibGVFbmRlZCA9IHRydWU7XG5cdFx0dGhpcy5kZXN0cm95ZWQgPSB0cnVlO1xuXHRcdHRoaXMuZW1pdCgnY2xvc2UnKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxufVxuXG5zdWl0ZSgnTWNwR2F0ZXdheVNlc3Npb24nLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUludm9rZXIoKSB7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VUb29scyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VSZXNvdXJjZXMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdGNvbnN0IHRvb2xzOiByZWFkb25seSBNQ1AuVG9vbFtdID0gW3tcblx0XHRcdG5hbWU6ICd0ZXN0X3Rvb2wnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHRvb2wnLFxuXHRcdFx0aW5wdXRTY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnIH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1dO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VzOiByZWFkb25seSBNQ1AuUmVzb3VyY2VbXSA9IFt7XG5cdFx0XHR1cmk6ICdmaWxlOi8vL3Rlc3QvcmVzb3VyY2UudHh0Jyxcblx0XHRcdG5hbWU6ICdyZXNvdXJjZS50eHQnLFxuXHRcdH1dO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGlkQ2hhbmdlVG9vbHMsXG5cdFx0XHRvbkRpZENoYW5nZVJlc291cmNlcyxcblx0XHRcdGludm9rZXI6IHtcblx0XHRcdFx0b25EaWRDaGFuZ2VUb29sczogb25EaWRDaGFuZ2VUb29scy5ldmVudCxcblx0XHRcdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXM6IG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmV2ZW50LFxuXHRcdFx0XHRsaXN0VG9vbHM6IGFzeW5jICgpID0+IHRvb2xzLFxuXHRcdFx0XHRjYWxsVG9vbDogYXN5bmMgKF9uYW1lOiBzdHJpbmcsIGFyZ3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiAoe1xuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JyBhcyBjb25zdCwgdGV4dDogYEhlbGxvLCAke3R5cGVvZiBhcmdzLm5hbWUgPT09ICdzdHJpbmcnID8gYXJncy5uYW1lIDogJ1dvcmxkJ30hYCB9XVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0bGlzdFJlc291cmNlczogYXN5bmMgKCkgPT4gcmVzb3VyY2VzLFxuXHRcdFx0XHRyZWFkUmVzb3VyY2U6IGFzeW5jIChfdXJpOiBzdHJpbmcpID0+ICh7XG5cdFx0XHRcdFx0Y29udGVudHM6IFt7IHVyaTogJ2ZpbGU6Ly8vdGVzdC9yZXNvdXJjZS50eHQnLCB0ZXh0OiAnaGVsbG8gd29ybGQnLCBtaW1lVHlwZTogJ3RleHQvcGxhaW4nIH1dLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0bGlzdFJlc291cmNlVGVtcGxhdGVzOiBhc3luYyAoKSA9PiBbeyB1cmlUZW1wbGF0ZTogJ2ZpbGU6Ly8vdGVzdC97bmFtZX0nLCBuYW1lOiAnVGVzdCBUZW1wbGF0ZScgfV0sXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3JldHVybnMgaW5pdGlhbGl6ZSByZXN1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tMScsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAxLFxuXHRcdFx0bWV0aG9kOiAnaW5pdGlhbGl6ZScsXG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uOiAnMjAyNS0xMS0yNScsXG5cdFx0XHRcdGNhcGFiaWxpdGllczoge30sXG5cdFx0XHRcdGNsaWVudEluZm86IHsgbmFtZTogJ3Rlc3QtY2xpZW50JywgdmVyc2lvbjogJzEuMC4wJyB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZXMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHJlc3BvbnNlc1swXSBhcyBJSnNvblJwY1N1Y2Nlc3NSZXNwb25zZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuanNvbnJwYywgJzIuMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5pZCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXNwb25zZS5yZXN1bHQgYXMgeyBwcm90b2NvbFZlcnNpb246IHN0cmluZyB9KS5wcm90b2NvbFZlcnNpb24sICcyMDI1LTExLTI1Jyk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCduZWdvdGlhdGVzIHRvIG9sZGVyIHByb3RvY29sIHZlcnNpb24gd2hlbiBjbGllbnQgcmVxdWVzdHMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tbmVnb3RpYXRlLTEnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgKCkgPT4geyB9LCBpbnZva2VyKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlcyA9IGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogMSxcblx0XHRcdG1ldGhvZDogJ2luaXRpYWxpemUnLFxuXHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdHByb3RvY29sVmVyc2lvbjogJzIwMjUtMDMtMjYnLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHt9LFxuXHRcdFx0XHRjbGllbnRJbmZvOiB7IG5hbWU6ICd0ZXN0LWNsaWVudCcsIHZlcnNpb246ICcxLjAuMCcgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2VzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZXNbMF0gYXMgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXNwb25zZS5yZXN1bHQgYXMgeyBwcm90b2NvbFZlcnNpb246IHN0cmluZyB9KS5wcm90b2NvbFZlcnNpb24sICcyMDI1LTAzLTI2Jyk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCduZWdvdGlhdGVzIHRvIGVhY2ggc3VwcG9ydGVkIHByb3RvY29sIHZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VwcG9ydGVkVmVyc2lvbnMgPSBbJzIwMjUtMTEtMjUnLCAnMjAyNS0wNi0xOCcsICcyMDI1LTAzLTI2JywgJzIwMjQtMTEtMDUnLCAnMjAyNC0xMC0wNyddO1xuXHRcdGZvciAoY29uc3QgdmVyc2lvbiBvZiBzdXBwb3J0ZWRWZXJzaW9ucykge1xuXHRcdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbihgc2Vzc2lvbi12ZXItJHt2ZXJzaW9ufWAsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0XHRjb25zdCByZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHtcblx0XHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRcdGlkOiAxLFxuXHRcdFx0XHRtZXRob2Q6ICdpbml0aWFsaXplJyxcblx0XHRcdFx0cGFyYW1zOiB7IHByb3RvY29sVmVyc2lvbjogdmVyc2lvbiwgY2FwYWJpbGl0aWVzOiB7fSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHQocmVzcG9uc2UucmVzdWx0IGFzIHsgcHJvdG9jb2xWZXJzaW9uOiBzdHJpbmcgfSkucHJvdG9jb2xWZXJzaW9uLFxuXHRcdFx0XHR2ZXJzaW9uLFxuXHRcdFx0XHRgRXhwZWN0ZWQgc2VydmVyIHRvIG5lZ290aWF0ZSB0byAke3ZlcnNpb259YFxuXHRcdFx0KTtcblx0XHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIGxhdGVzdCB2ZXJzaW9uIGZvciB1bnN1cHBvcnRlZCBjbGllbnQgdmVyc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi1uZWdvdGlhdGUtMicsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAxLFxuXHRcdFx0bWV0aG9kOiAnaW5pdGlhbGl6ZScsXG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0cHJvdG9jb2xWZXJzaW9uOiAnMjA5OS0wMS0wMScsXG5cdFx0XHRcdGNhcGFiaWxpdGllczoge30sXG5cdFx0XHRcdGNsaWVudEluZm86IHsgbmFtZTogJ3Rlc3QtY2xpZW50JywgdmVyc2lvbjogJzEuMC4wJyB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZXMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCByZXNwb25zZSA9IHJlc3BvbnNlc1swXSBhcyBJSnNvblJwY1N1Y2Nlc3NSZXNwb25zZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3BvbnNlLnJlc3VsdCBhcyB7IHByb3RvY29sVmVyc2lvbjogc3RyaW5nIH0pLnByb3RvY29sVmVyc2lvbiwgJzIwMjUtMTEtMjUnKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gbGF0ZXN0IHZlcnNpb24gd2hlbiBubyBwYXJhbXMgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tbmVnb3RpYXRlLTMnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgKCkgPT4geyB9LCBpbnZva2VyKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlcyA9IGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogMSxcblx0XHRcdG1ldGhvZDogJ2luaXRpYWxpemUnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzcG9uc2UucmVzdWx0IGFzIHsgcHJvdG9jb2xWZXJzaW9uOiBzdHJpbmcgfSkucHJvdG9jb2xWZXJzaW9uLCAnMjAyNS0xMS0yNScpO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlVG9vbHMuZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBsYXRlc3QgdmVyc2lvbiB3aGVuIHByb3RvY29sVmVyc2lvbiBpcyBub3QgYSBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tbmVnb3RpYXRlLTQnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgKCkgPT4geyB9LCBpbnZva2VyKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlcyA9IGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogMSxcblx0XHRcdG1ldGhvZDogJ2luaXRpYWxpemUnLFxuXHRcdFx0cGFyYW1zOiB7XG5cdFx0XHRcdHByb3RvY29sVmVyc2lvbjogNDIsXG5cdFx0XHRcdGNhcGFiaWxpdGllczoge30sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzcG9uc2UucmVzdWx0IGFzIHsgcHJvdG9jb2xWZXJzaW9uOiBzdHJpbmcgfSkucHJvdG9jb2xWZXJzaW9uLCAnMjAyNS0xMS0yNScpO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlVG9vbHMuZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZSByZXNwb25zZSBpbmNsdWRlcyBzZXJ2ZXIgaW5mbyBhbmQgY2FwYWJpbGl0aWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW52b2tlciwgb25EaWRDaGFuZ2VUb29scywgb25EaWRDaGFuZ2VSZXNvdXJjZXMgfSA9IGNyZWF0ZUludm9rZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IE1jcEdhdGV3YXlTZXNzaW9uKCdzZXNzaW9uLWluaXQtY2FwcycsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiAxLFxuXHRcdFx0bWV0aG9kOiAnaW5pdGlhbGl6ZScsXG5cdFx0XHRwYXJhbXM6IHsgcHJvdG9jb2xWZXJzaW9uOiAnMjAyNS0wMy0yNicsIGNhcGFiaWxpdGllczoge30gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IChyZXNwb25zZXNbMF0gYXMgSUpzb25ScGNTdWNjZXNzUmVzcG9uc2UpLnJlc3VsdCBhcyBNQ1AuSW5pdGlhbGl6ZVJlc3VsdDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0cHJvdG9jb2xWZXJzaW9uOiAnMjAyNS0wMy0yNicsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0dG9vbHM6IHsgbGlzdENoYW5nZWQ6IHRydWUgfSxcblx0XHRcdFx0cmVzb3VyY2VzOiB7IGxpc3RDaGFuZ2VkOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdFx0c2VydmVySW5mbzoge1xuXHRcdFx0XHRuYW1lOiAnVlMgQ29kZSBNQ1AgR2F0ZXdheScsXG5cdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlVG9vbHMuZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBub24taW5pdGlhbGl6ZSByZXF1ZXN0cyBiZWZvcmUgaW5pdGlhbGl6ZWQgbm90aWZpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW52b2tlciwgb25EaWRDaGFuZ2VUb29scywgb25EaWRDaGFuZ2VSZXNvdXJjZXMgfSA9IGNyZWF0ZUludm9rZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IE1jcEdhdGV3YXlTZXNzaW9uKCdzZXNzaW9uLTInLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgKCkgPT4geyB9LCBpbnZva2VyKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlcyA9IGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogMixcblx0XHRcdG1ldGhvZDogJ3Rvb2xzL2xpc3QnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdIGFzIElKc29uUnBjRXJyb3JSZXNwb25zZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuanNvbnJwYywgJzIuMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5pZCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmVycm9yLmNvZGUsIC0zMjYwMCk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXMgdG9vbHMvbGlzdCBhbmQgdG9vbHMvY2FsbCBhZnRlciBpbml0aWFsaXplZCBub3RpZmljYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tMycsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0YXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgbWV0aG9kOiAnaW5pdGlhbGl6ZScgfSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uUmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBtZXRob2Q6ICdub3RpZmljYXRpb25zL2luaXRpYWxpemVkJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uUmVzcG9uc2VzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCBsaXN0UmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMywgbWV0aG9kOiAndG9vbHMvbGlzdCcgfSk7XG5cdFx0Y29uc3QgbGlzdFJlc3BvbnNlID0gbGlzdFJlc3BvbnNlc1swXSBhcyBJSnNvblJwY1N1Y2Nlc3NSZXNwb25zZTtcblx0XHRjb25zdCB0b29scyA9IChsaXN0UmVzcG9uc2UucmVzdWx0IGFzIHsgdG9vbHM6IEFycmF5PHsgbmFtZTogc3RyaW5nIH0+IH0pLnRvb2xzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29scy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sc1swXS5uYW1lLCAndGVzdF90b29sJyk7XG5cblx0XHRjb25zdCBjYWxsUmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7XG5cdFx0XHRqc29ucnBjOiAnMi4wJyxcblx0XHRcdGlkOiA0LFxuXHRcdFx0bWV0aG9kOiAndG9vbHMvY2FsbCcsXG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0bmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGFyZ3VtZW50czoge1xuXHRcdFx0XHRcdG5hbWU6ICdWUyBDb2RlJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjYWxsUmVzcG9uc2UgPSBjYWxsUmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdGNvbnN0IHRleHQgPSAoKGNhbGxSZXNwb25zZS5yZXN1bHQgYXMgeyBjb250ZW50OiBBcnJheTx7IHRleHQ6IHN0cmluZyB9PiB9KS5jb250ZW50WzBdLnRleHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0LCAnSGVsbG8sIFZTIENvZGUhJyk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdicm9hZGNhc3RzIG5vdGlmaWNhdGlvbnMgdG8gYXR0YWNoZWQgU1NFIGNsaWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tNCcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gbmV3IFRlc3RTZXJ2ZXJSZXNwb25zZSgpO1xuXG5cdFx0c2Vzc2lvbi5hdHRhY2hTc2VDbGllbnQoe30gYXMgaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlc3BvbnNlIGFzIHVua25vd24gYXMgaHR0cC5TZXJ2ZXJSZXNwb25zZSk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgbWV0aG9kOiAnaW5pdGlhbGl6ZScgfSk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBtZXRob2Q6ICdub3RpZmljYXRpb25zL2luaXRpYWxpemVkJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5oZWFkZXJzPy5bJ0NvbnRlbnQtVHlwZSddLCAndGV4dC9ldmVudC1zdHJlYW0nKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2Uud3JpdGVzLnNvbWUoY2h1bmsgPT4gY2h1bmsuaW5jbHVkZXMoJzogY29ubmVjdGVkJykpKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2Uud3JpdGVzLnNvbWUoY2h1bmsgPT4gY2h1bmsuaW5jbHVkZXMoJ2V2ZW50OiBtZXNzYWdlJykpKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2Uud3JpdGVzLnNvbWUoY2h1bmsgPT4gY2h1bmsuaW5jbHVkZXMoJ25vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkJykpKTtcblx0XHRhc3NlcnQub2socmVzcG9uc2Uud3JpdGVzLnNvbWUoY2h1bmsgPT4gY2h1bmsuaW5jbHVkZXMoJ25vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL2xpc3RfY2hhbmdlZCcpKSk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBsaXN0IGNoYW5nZWQgb24gdG9vbCBpbnZva2VyIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tNScsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gbmV3IFRlc3RTZXJ2ZXJSZXNwb25zZSgpO1xuXG5cdFx0c2Vzc2lvbi5hdHRhY2hTc2VDbGllbnQoe30gYXMgaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlc3BvbnNlIGFzIHVua25vd24gYXMgaHR0cC5TZXJ2ZXJSZXNwb25zZSk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgbWV0aG9kOiAnaW5pdGlhbGl6ZScgfSk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBtZXRob2Q6ICdub3RpZmljYXRpb25zL2luaXRpYWxpemVkJyB9KTtcblxuXHRcdGNvbnN0IHdyaXRlc0JlZm9yZSA9IHJlc3BvbnNlLndyaXRlcy5sZW5ndGg7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5maXJlKCk7XG5cblx0XHRhc3NlcnQub2socmVzcG9uc2Uud3JpdGVzLmxlbmd0aCA+IHdyaXRlc0JlZm9yZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlLndyaXRlcy5zbGljZSh3cml0ZXNCZWZvcmUpLnNvbWUoY2h1bmsgPT4gY2h1bmsuaW5jbHVkZXMoJ25vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkJykpKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVRvb2xzLmRpc3Bvc2UoKTtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2VzIGF0dGFjaGVkIFNTRSBjbGllbnRzIGFuZCBjYWxsYmFjaycsICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi02JywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHtcblx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHR9LCBpbnZva2VyKTtcblx0XHRjb25zdCByZXNwb25zZSA9IG5ldyBUZXN0U2VydmVyUmVzcG9uc2UoKTtcblxuXHRcdHNlc3Npb24uYXR0YWNoU3NlQ2xpZW50KHt9IGFzIGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXNwb25zZSBhcyB1bmtub3duIGFzIGh0dHAuU2VydmVyUmVzcG9uc2UpO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLndyaXRhYmxlRW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZCwgdHJ1ZSk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyByZXNvdXJjZXMgbGlzdCBjaGFuZ2VkIG9uIHJlc291cmNlIGludm9rZXIgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi03JywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBuZXcgVGVzdFNlcnZlclJlc3BvbnNlKCk7XG5cblx0XHRzZXNzaW9uLmF0dGFjaFNzZUNsaWVudCh7fSBhcyBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzcG9uc2UgYXMgdW5rbm93biBhcyBodHRwLlNlcnZlclJlc3BvbnNlKTtcblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBtZXRob2Q6ICdpbml0aWFsaXplJyB9KTtcblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvaW5pdGlhbGl6ZWQnIH0pO1xuXG5cdFx0Y29uc3Qgd3JpdGVzQmVmb3JlID0gcmVzcG9uc2Uud3JpdGVzLmxlbmd0aDtcblx0XHRvbkRpZENoYW5nZVJlc291cmNlcy5maXJlKCk7XG5cblx0XHRhc3NlcnQub2socmVzcG9uc2Uud3JpdGVzLmxlbmd0aCA+IHdyaXRlc0JlZm9yZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3BvbnNlLndyaXRlcy5zbGljZSh3cml0ZXNCZWZvcmUpLnNvbWUoY2h1bmsgPT4gY2h1bmsuaW5jbHVkZXMoJ25vdGlmaWNhdGlvbnMvcmVzb3VyY2VzL2xpc3RfY2hhbmdlZCcpKSk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXMgcmVzb3VyY2VzL2xpc3Qgd2l0aCByYXcgVVJJcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGludm9rZXIsIG9uRGlkQ2hhbmdlVG9vbHMsIG9uRGlkQ2hhbmdlUmVzb3VyY2VzIH0gPSBjcmVhdGVJbnZva2VyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBNY3BHYXRld2F5U2Vzc2lvbignc2Vzc2lvbi04JywgbmV3IE51bGxMb2dTZXJ2aWNlKCksICgpID0+IHsgfSwgaW52b2tlcik7XG5cblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIGlkOiAxLCBtZXRob2Q6ICdpbml0aWFsaXplJyB9KTtcblx0XHRhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIG1ldGhvZDogJ25vdGlmaWNhdGlvbnMvaW5pdGlhbGl6ZWQnIH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMiwgbWV0aG9kOiAncmVzb3VyY2VzL2xpc3QnIH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IChyZXNwb25zZS5yZXN1bHQgYXMgeyByZXNvdXJjZXM6IEFycmF5PHsgdXJpOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9PiB9KS5yZXNvdXJjZXM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc291cmNlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvdXJjZXNbMF0udXJpLCAnZmlsZTovLy90ZXN0L3Jlc291cmNlLnR4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvdXJjZXNbMF0ubmFtZSwgJ3Jlc291cmNlLnR4dCcpO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlVG9vbHMuZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2VydmVzIHJlc291cmNlcy9yZWFkIHdpdGggcmF3IFVSSXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tOScsIG5ldyBOdWxsTG9nU2VydmljZSgpLCAoKSA9PiB7IH0sIGludm9rZXIpO1xuXG5cdFx0YXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBpZDogMSwgbWV0aG9kOiAnaW5pdGlhbGl6ZScgfSk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyh7IGpzb25ycGM6ICcyLjAnLCBtZXRob2Q6ICdub3RpZmljYXRpb25zL2luaXRpYWxpemVkJyB9KTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlcyA9IGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoe1xuXHRcdFx0anNvbnJwYzogJzIuMCcsXG5cdFx0XHRpZDogMixcblx0XHRcdG1ldGhvZDogJ3Jlc291cmNlcy9yZWFkJyxcblx0XHRcdHBhcmFtczogeyB1cmk6ICdmaWxlOi8vL3Rlc3QvcmVzb3VyY2UudHh0JyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gKHJlc3BvbnNlLnJlc3VsdCBhcyB7IGNvbnRlbnRzOiBBcnJheTx7IHVyaTogc3RyaW5nOyB0ZXh0OiBzdHJpbmcgfT4gfSkuY29udGVudHM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRzWzBdLnVyaSwgJ2ZpbGU6Ly8vdGVzdC9yZXNvdXJjZS50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudHNbMF0udGV4dCwgJ2hlbGxvIHdvcmxkJyk7XG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VUb29scy5kaXNwb3NlKCk7XG5cdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXMgcmVzb3VyY2VzL3RlbXBsYXRlcy9saXN0IHdpdGggcmF3IFVSSSB0ZW1wbGF0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnZva2VyLCBvbkRpZENoYW5nZVRvb2xzLCBvbkRpZENoYW5nZVJlc291cmNlcyB9ID0gY3JlYXRlSW52b2tlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBuZXcgTWNwR2F0ZXdheVNlc3Npb24oJ3Nlc3Npb24tMTAnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgKCkgPT4geyB9LCBpbnZva2VyKTtcblxuXHRcdGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoeyBqc29ucnBjOiAnMi4wJywgaWQ6IDEsIG1ldGhvZDogJ2luaXRpYWxpemUnIH0pO1xuXHRcdGF3YWl0IHNlc3Npb24uaGFuZGxlSW5jb21pbmcoeyBqc29ucnBjOiAnMi4wJywgbWV0aG9kOiAnbm90aWZpY2F0aW9ucy9pbml0aWFsaXplZCcgfSk7XG5cblx0XHRjb25zdCByZXNwb25zZXMgPSBhd2FpdCBzZXNzaW9uLmhhbmRsZUluY29taW5nKHsganNvbnJwYzogJzIuMCcsIGlkOiAyLCBtZXRob2Q6ICdyZXNvdXJjZXMvdGVtcGxhdGVzL2xpc3QnIH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdIGFzIElKc29uUnBjU3VjY2Vzc1Jlc3BvbnNlO1xuXHRcdGNvbnN0IHRlbXBsYXRlcyA9IChyZXNwb25zZS5yZXN1bHQgYXMgeyByZXNvdXJjZVRlbXBsYXRlczogQXJyYXk8eyB1cmlUZW1wbGF0ZTogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfT4gfSkucmVzb3VyY2VUZW1wbGF0ZXM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlbXBsYXRlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZW1wbGF0ZXNbMF0udXJpVGVtcGxhdGUsICdmaWxlOi8vL3Rlc3Qve25hbWV9Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlbXBsYXRlc1swXS5uYW1lLCAnVGVzdCBUZW1wbGF0ZScpO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlVG9vbHMuZGlzcG9zZSgpO1xuXHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VzLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFFeEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSwyQkFBMkIsYUFBYTtBQUFBLEVBQTlDO0FBQUE7QUFHQyxTQUFnQixTQUFtQixDQUFDO0FBQ3BDLFNBQU8sWUFBWTtBQUNuQixTQUFPLGdCQUFnQjtBQUFBO0FBQUEsRUFFdkIsVUFBVSxZQUFvQixTQUFrQztBQUMvRCxTQUFLLGFBQWE7QUFDbEIsU0FBSyxVQUFVO0FBQ2YsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sT0FBd0I7QUFDN0IsU0FBSyxPQUFPLEtBQUssS0FBSztBQUN0QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsSUFBSSxPQUFzQjtBQUN6QixRQUFJLE9BQU87QUFDVixXQUFLLE9BQU8sS0FBSyxLQUFLO0FBQUEsSUFDdkI7QUFFQSxTQUFLLGdCQUFn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
