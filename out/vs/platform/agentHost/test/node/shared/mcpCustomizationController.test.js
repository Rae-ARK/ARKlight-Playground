import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { AgentSession } from "../../../common/agentService.js";
import { ActionType } from "../../../common/state/protocol/common/actions.js";
import { CustomizationType, McpAuthRequiredReason, McpServerStatus, SessionStatus } from "../../../common/state/protocol/channels-session/state.js";
import { AgentHostStateManager } from "../../../node/agentHostStateManager.js";
import { McpCustomizationController, findMcpChildId, findMcpServerName, parseMcpChannelUri } from "../../../node/shared/mcpCustomizationController.js";
function harness(store, opts = {}) {
  const actions = [];
  const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
  const sessionUri = AgentSession.uri("copilot", "session-1");
  const session = sessionUri.toString();
  stateManager.createSession({
    resource: session,
    provider: "copilot",
    title: "Test",
    status: SessionStatus.Idle,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (opts.desiredEnabled !== void 0) {
    stateManager.dispatchServerAction(session, {
      type: ActionType.SessionCustomizationsChanged,
      customizations: [{
        type: CustomizationType.McpServer,
        id: "mcp-top-level:copilot:session-1:search",
        uri: "mcp-top-level:copilot:session-1:search",
        name: "search",
        enabled: opts.desiredEnabled,
        state: starting()
      }]
    });
  }
  const controller = new McpCustomizationController({
    providerId: "copilot",
    sessionId: "session-1",
    sessionUri,
    resolveChildId: (name) => findMcpChildId(opts.customizations ?? [], name),
    emit: (a) => actions.push(a)
  }, stateManager);
  return { controller, actions };
}
function server(name, state) {
  return { name, state };
}
function ready() {
  return { kind: McpServerStatus.Ready };
}
function starting() {
  return { kind: McpServerStatus.Starting };
}
function stopped() {
  return { kind: McpServerStatus.Stopped };
}
function authRequired() {
  return {
    kind: McpServerStatus.AuthRequired,
    reason: McpAuthRequiredReason.Required,
    resource: {
      resource: "https://mcp.example.com",
      authorization_servers: ["https://auth.example.com"]
    },
    requiredScopes: ["repo"]
  };
}
function errored(message) {
  return { kind: McpServerStatus.Error, error: { errorType: "test-error", message } };
}
const PLUGIN_CUSTOMIZATIONS = [
  {
    type: CustomizationType.Plugin,
    id: "plugin:demo",
    uri: "file:///plugins/demo",
    name: "demo-plugin",
    enabled: true,
    children: [
      {
        type: CustomizationType.McpServer,
        id: "mcp-child:demo:fs",
        uri: "mcp-child:demo:fs",
        name: "fs",
        enabled: true,
        state: { kind: McpServerStatus.Starting }
      }
    ]
  }
];
suite("McpCustomizationController", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("empty inventory dispatches nothing", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyAll([]);
    assert.deepStrictEqual(actions, []);
    assert.deepStrictEqual(controller.topLevelCustomizations(), []);
  });
  test("child-backed server: ready/error/ready transitions only update state+channel", () => {
    const { controller, actions } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
    store.add(controller);
    controller.applyOne(server("fs", ready()));
    controller.applyOne(server("fs", errored("boom")));
    controller.applyOne(server("fs", ready()));
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/fs"
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Error, error: { errorType: "test-error", message: "boom" } },
        channel: void 0
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/fs"
      }
    ]);
    assert.deepStrictEqual(controller.topLevelCustomizations(), []);
  });
  test("bare server (no child match) is surfaced as a full top-level customization", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyOne(server("search", ready()));
    const expectedId = "mcp-top-level:copilot:session-1:search";
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionCustomizationUpdated,
        customization: {
          type: CustomizationType.McpServer,
          id: expectedId,
          uri: expectedId,
          name: "search",
          enabled: true,
          state: { kind: McpServerStatus.Ready },
          channel: "mcp://copilot/session-1/search",
          mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } }
        }
      }
    ]);
    assert.deepStrictEqual(controller.topLevelCustomizations(), [
      {
        type: CustomizationType.McpServer,
        id: expectedId,
        uri: expectedId,
        name: "search",
        enabled: true,
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/search",
        mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } }
      }
    ]);
  });
  test("non-ready bare server has no channel but still advertises mcpApp (static capability)", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyOne(server("search", starting()));
    const expectedId = "mcp-top-level:copilot:session-1:search";
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionCustomizationUpdated,
        customization: {
          type: CustomizationType.McpServer,
          id: expectedId,
          uri: expectedId,
          name: "search",
          enabled: true,
          state: { kind: McpServerStatus.Starting },
          channel: void 0,
          mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } }
        }
      }
    ]);
  });
  test("removing a bare top-level server emits SessionCustomizationRemoved", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyOne(server("search", ready()));
    actions.length = 0;
    controller.remove("search");
    const expectedId = "mcp-top-level:copilot:session-1:search";
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionCustomizationRemoved,
        id: expectedId
      }
    ]);
    assert.deepStrictEqual(controller.topLevelCustomizations(), []);
  });
  test("applyAll removes servers no longer present (child) and emits Stopped", () => {
    const { controller, actions } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
    store.add(controller);
    controller.applyAll([server("fs", ready())]);
    controller.applyAll([]);
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/fs"
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Stopped }
      }
    ]);
  });
  test("runtimeStates snapshots child and top-level servers by customization id", () => {
    const { controller } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
    store.add(controller);
    controller.applyOne(server("fs", ready()));
    controller.applyOne(server("search", starting()));
    assert.deepStrictEqual(controller.runtimeStates.get(), /* @__PURE__ */ new Map([
      ["mcp-child:demo:fs", { state: { kind: McpServerStatus.Ready }, channel: "mcp://copilot/session-1/fs" }],
      ["mcp-top-level:copilot:session-1:search", { state: { kind: McpServerStatus.Starting }, channel: void 0 }]
    ]));
    assert.strictEqual(controller.serverNameForCustomizationId("mcp-child:demo:fs"), "fs");
    assert.strictEqual(controller.serverNameForCustomizationId("mcp-top-level:copilot:session-1:search"), "search");
    controller.remove("fs");
    assert.deepStrictEqual([...controller.runtimeStates.get().keys()], ["mcp-top-level:copilot:session-1:search"]);
  });
  test("top-level entry stays top-level across updates (id stable)", () => {
    const { controller, actions } = harness(store);
    store.add(controller);
    controller.applyOne(server("search", starting()));
    controller.applyOne(server("search", ready()));
    controller.applyOne(server("search", stopped()));
    const expectedId = "mcp-top-level:copilot:session-1:search";
    const ids = actions.filter((a) => a.type === ActionType.SessionCustomizationUpdated).map((a) => a.customization.id);
    assert.deepStrictEqual(ids, [expectedId, expectedId, expectedId]);
  });
  test("bare server publishes reducer-backed enablement across runtime updates", () => {
    const { controller, actions } = harness(store, { desiredEnabled: false });
    store.add(controller);
    controller.applyOne(server("search", authRequired()));
    controller.applyOne(server("search", starting()));
    assert.deepStrictEqual(actions.filter((action) => action.type === ActionType.SessionCustomizationUpdated).map((action) => action.customization.enabled), [false, false]);
  });
  test("authRequired state is preserved across coarse starting updates", () => {
    const { controller, actions } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
    store.add(controller);
    const authState = authRequired();
    controller.applyOne(server("fs", authState));
    controller.applyOne(server("fs", starting()));
    controller.applyOne(server("fs", ready()));
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: authState,
        channel: void 0
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: authState,
        channel: void 0
      },
      {
        type: ActionType.SessionMcpServerStateChanged,
        id: "mcp-child:demo:fs",
        state: { kind: McpServerStatus.Ready },
        channel: "mcp://copilot/session-1/fs"
      }
    ]);
  });
  test("parseMcpChannelUri round-trips the controller-minted channel URI", () => {
    const channel = "mcp://copilot/session-1/fs";
    assert.deepStrictEqual(parseMcpChannelUri(channel), {
      providerId: "copilot",
      sessionId: "session-1",
      serverName: "fs"
    });
  });
  test("parseMcpChannelUri decodes URL-encoded path segments", () => {
    const channel = "mcp://copilot/session%2F1/my%20server";
    assert.deepStrictEqual(parseMcpChannelUri(channel), {
      providerId: "copilot",
      sessionId: "session/1",
      serverName: "my server"
    });
  });
  test("parseMcpChannelUri rejects malformed inputs", () => {
    assert.strictEqual(parseMcpChannelUri("https://copilot/x/y"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp:///session/server"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://copilot/session-only"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://copilot/session/"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://copilot/bad%/server"), void 0);
    assert.strictEqual(parseMcpChannelUri("mcp://copilot/session/bad%2"), void 0);
  });
  test("findMcpChildId finds bare top-level entries and plugin children", () => {
    const customizations = [
      ...PLUGIN_CUSTOMIZATIONS,
      {
        type: CustomizationType.McpServer,
        id: "mcp-top-level:test:search",
        uri: "mcp-top-level:test:search",
        name: "search",
        enabled: true,
        state: { kind: McpServerStatus.Ready }
      }
    ];
    assert.strictEqual(findMcpChildId(customizations, "fs"), "mcp-child:demo:fs");
    assert.strictEqual(findMcpChildId(customizations, "search"), "mcp-top-level:test:search");
    assert.strictEqual(findMcpChildId(customizations, "missing"), void 0);
  });
  test("findMcpServerName finds bare top-level entries and plugin children", () => {
    const customizations = [
      ...PLUGIN_CUSTOMIZATIONS,
      {
        type: CustomizationType.McpServer,
        id: "mcp-top-level:test:search",
        uri: "mcp-top-level:test:search",
        name: "search",
        enabled: true,
        state: { kind: McpServerStatus.Ready }
      }
    ];
    assert.strictEqual(findMcpServerName(customizations, "mcp-child:demo:fs"), "fs");
    assert.strictEqual(findMcpServerName(customizations, "mcp-top-level:test:search"), "search");
    assert.strictEqual(findMcpServerName(customizations, "missing"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2hhcmVkL21jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgTWNwQXV0aFJlcXVpcmVkUmVhc29uLCBNY3BTZXJ2ZXJTdGF0dXMsIFNlc3Npb25TdGF0dXMsIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBNY3BTZXJ2ZXJTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlciwgZmluZE1jcENoaWxkSWQsIGZpbmRNY3BTZXJ2ZXJOYW1lLCBwYXJzZU1jcENoYW5uZWxVcmksIHR5cGUgSVNka01jcFNlcnZlciB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL21jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyLmpzJztcblxuZnVuY3Rpb24gaGFybmVzcyhzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgb3B0czogeyBjdXN0b21pemF0aW9ucz86IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXTsgZGVzaXJlZEVuYWJsZWQ/OiBib29sZWFuIH0gPSB7fSkge1xuXHRjb25zdCBhY3Rpb25zOiBTZXNzaW9uQWN0aW9uW10gPSBbXTtcblx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gc3RvcmUuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAnc2Vzc2lvbi0xJyk7XG5cdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRyZXNvdXJjZTogc2Vzc2lvbixcblx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHR9KTtcblx0aWYgKG9wdHMuZGVzaXJlZEVuYWJsZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRjdXN0b21pemF0aW9uczogW3tcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdFx0XHRpZDogJ21jcC10b3AtbGV2ZWw6Y29waWxvdDpzZXNzaW9uLTE6c2VhcmNoJyxcblx0XHRcdFx0dXJpOiAnbWNwLXRvcC1sZXZlbDpjb3BpbG90OnNlc3Npb24tMTpzZWFyY2gnLFxuXHRcdFx0XHRuYW1lOiAnc2VhcmNoJyxcblx0XHRcdFx0ZW5hYmxlZDogb3B0cy5kZXNpcmVkRW5hYmxlZCxcblx0XHRcdFx0c3RhdGU6IHN0YXJ0aW5nKCksXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXHRjb25zdCBjb250cm9sbGVyID0gbmV3IE1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyKHtcblx0XHRwcm92aWRlcklkOiAnY29waWxvdCcsXG5cdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRzZXNzaW9uVXJpLFxuXHRcdHJlc29sdmVDaGlsZElkOiBuYW1lID0+IGZpbmRNY3BDaGlsZElkKG9wdHMuY3VzdG9taXphdGlvbnMgPz8gW10sIG5hbWUpLFxuXHRcdGVtaXQ6IGEgPT4gYWN0aW9ucy5wdXNoKGEpLFxuXHR9LCBzdGF0ZU1hbmFnZXIpO1xuXHRyZXR1cm4geyBjb250cm9sbGVyLCBhY3Rpb25zIH07XG59XG5cbmZ1bmN0aW9uIHNlcnZlcihuYW1lOiBzdHJpbmcsIHN0YXRlOiBNY3BTZXJ2ZXJTdGF0ZSk6IElTZGtNY3BTZXJ2ZXIge1xuXHRyZXR1cm4geyBuYW1lLCBzdGF0ZSB9O1xufVxuXG5mdW5jdGlvbiByZWFkeSgpOiBNY3BTZXJ2ZXJTdGF0ZSB7IHJldHVybiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9OyB9XG5mdW5jdGlvbiBzdGFydGluZygpOiBNY3BTZXJ2ZXJTdGF0ZSB7IHJldHVybiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdGFydGluZyB9OyB9XG5mdW5jdGlvbiBzdG9wcGVkKCk6IE1jcFNlcnZlclN0YXRlIHsgcmV0dXJuIHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0b3BwZWQgfTsgfVxuZnVuY3Rpb24gYXV0aFJlcXVpcmVkKCk6IE1jcFNlcnZlclN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkLFxuXHRcdHJlYXNvbjogTWNwQXV0aFJlcXVpcmVkUmVhc29uLlJlcXVpcmVkLFxuXHRcdHJlc291cmNlOiB7XG5cdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJyxcblx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHR9LFxuXHRcdHJlcXVpcmVkU2NvcGVzOiBbJ3JlcG8nXSxcblx0fTtcbn1cbmZ1bmN0aW9uIGVycm9yZWQobWVzc2FnZTogc3RyaW5nKTogTWNwU2VydmVyU3RhdGUge1xuXHRyZXR1cm4geyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3IsIGVycm9yOiB7IGVycm9yVHlwZTogJ3Rlc3QtZXJyb3InLCBtZXNzYWdlIH0gfTtcbn1cblxuY29uc3QgUExVR0lOX0NVU1RPTUlaQVRJT05TOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gPSBbXG5cdHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0aWQ6ICdwbHVnaW46ZGVtbycsXG5cdFx0dXJpOiAnZmlsZTovLy9wbHVnaW5zL2RlbW8nLFxuXHRcdG5hbWU6ICdkZW1vLXBsdWdpbicsXG5cdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRjaGlsZHJlbjogW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0XHR1cmk6ICdtY3AtY2hpbGQ6ZGVtbzpmcycsXG5cdFx0XHRcdG5hbWU6ICdmcycsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdGFydGluZyB9LFxuXHRcdFx0fSxcblx0XHRdLFxuXHR9LFxuXTtcblxuc3VpdGUoJ01jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1wdHkgaW52ZW50b3J5IGRpc3BhdGNoZXMgbm90aGluZycsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUpO1xuXHRcdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlBbGwoW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnRvcExldmVsQ3VzdG9taXphdGlvbnMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGlsZC1iYWNrZWQgc2VydmVyOiByZWFkeS9lcnJvci9yZWFkeSB0cmFuc2l0aW9ucyBvbmx5IHVwZGF0ZSBzdGF0ZStjaGFubmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgYWN0aW9ucyB9ID0gaGFybmVzcyhzdG9yZSwgeyBjdXN0b21pemF0aW9uczogUExVR0lOX0NVU1RPTUlaQVRJT05TIH0pO1xuXHRcdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdmcycsIHJlYWR5KCkpKTtcblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignZnMnLCBlcnJvcmVkKCdib29tJykpKTtcblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignZnMnLCByZWFkeSgpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkLFxuXHRcdFx0XHRpZDogJ21jcC1jaGlsZDpkZW1vOmZzJyxcblx0XHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Nlc3Npb24tMS9mcycsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWQsXG5cdFx0XHRcdGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3IsIGVycm9yOiB7IGVycm9yVHlwZTogJ3Rlc3QtZXJyb3InLCBtZXNzYWdlOiAnYm9vbScgfSB9LFxuXHRcdFx0XHRjaGFubmVsOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWQsXG5cdFx0XHRcdGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdFx0Y2hhbm5lbDogJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi0xL2ZzJyxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnRvcExldmVsQ3VzdG9taXphdGlvbnMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXJlIHNlcnZlciAobm8gY2hpbGQgbWF0Y2gpIGlzIHN1cmZhY2VkIGFzIGEgZnVsbCB0b3AtbGV2ZWwgY3VzdG9taXphdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUpO1xuXHRcdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdzZWFyY2gnLCByZWFkeSgpKSk7XG5cblx0XHRjb25zdCBleHBlY3RlZElkID0gJ21jcC10b3AtbGV2ZWw6Y29waWxvdDpzZXNzaW9uLTE6c2VhcmNoJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0XHRcdFx0aWQ6IGV4cGVjdGVkSWQsXG5cdFx0XHRcdFx0dXJpOiBleHBlY3RlZElkLFxuXHRcdFx0XHRcdG5hbWU6ICdzZWFyY2gnLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHRcdFx0Y2hhbm5lbDogJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi0xL3NlYXJjaCcsXG5cdFx0XHRcdFx0bWNwQXBwOiB7IGNhcGFiaWxpdGllczogeyBzZXJ2ZXJUb29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LCBzZXJ2ZXJSZXNvdXJjZXM6IHt9LCBzYW1wbGluZzoge30gfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRyb2xsZXIudG9wTGV2ZWxDdXN0b21pemF0aW9ucygpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcixcblx0XHRcdFx0aWQ6IGV4cGVjdGVkSWQsXG5cdFx0XHRcdHVyaTogZXhwZWN0ZWRJZCxcblx0XHRcdFx0bmFtZTogJ3NlYXJjaCcsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9LFxuXHRcdFx0XHRjaGFubmVsOiAnbWNwOi8vY29waWxvdC9zZXNzaW9uLTEvc2VhcmNoJyxcblx0XHRcdFx0bWNwQXBwOiB7IGNhcGFiaWxpdGllczogeyBzZXJ2ZXJUb29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LCBzZXJ2ZXJSZXNvdXJjZXM6IHt9LCBzYW1wbGluZzoge30gfSB9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbm9uLXJlYWR5IGJhcmUgc2VydmVyIGhhcyBubyBjaGFubmVsIGJ1dCBzdGlsbCBhZHZlcnRpc2VzIG1jcEFwcCAoc3RhdGljIGNhcGFiaWxpdHkpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgYWN0aW9ucyB9ID0gaGFybmVzcyhzdG9yZSk7XG5cdFx0c3RvcmUuYWRkKGNvbnRyb2xsZXIpO1xuXG5cdFx0Y29udHJvbGxlci5hcHBseU9uZShzZXJ2ZXIoJ3NlYXJjaCcsIHN0YXJ0aW5nKCkpKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkSWQgPSAnbWNwLXRvcC1sZXZlbDpjb3BpbG90OnNlc3Npb24tMTpzZWFyY2gnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcixcblx0XHRcdFx0XHRpZDogZXhwZWN0ZWRJZCxcblx0XHRcdFx0XHR1cmk6IGV4cGVjdGVkSWQsXG5cdFx0XHRcdFx0bmFtZTogJ3NlYXJjaCcsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmcgfSxcblx0XHRcdFx0XHRjaGFubmVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bWNwQXBwOiB7IGNhcGFiaWxpdGllczogeyBzZXJ2ZXJUb29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LCBzZXJ2ZXJSZXNvdXJjZXM6IHt9LCBzYW1wbGluZzoge30gfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgYSBiYXJlIHRvcC1sZXZlbCBzZXJ2ZXIgZW1pdHMgU2Vzc2lvbkN1c3RvbWl6YXRpb25SZW1vdmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgYWN0aW9ucyB9ID0gaGFybmVzcyhzdG9yZSk7XG5cdFx0c3RvcmUuYWRkKGNvbnRyb2xsZXIpO1xuXG5cdFx0Y29udHJvbGxlci5hcHBseU9uZShzZXJ2ZXIoJ3NlYXJjaCcsIHJlYWR5KCkpKTtcblx0XHRhY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0Y29udHJvbGxlci5yZW1vdmUoJ3NlYXJjaCcpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRJZCA9ICdtY3AtdG9wLWxldmVsOmNvcGlsb3Q6c2Vzc2lvbi0xOnNlYXJjaCc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25SZW1vdmVkLFxuXHRcdFx0XHRpZDogZXhwZWN0ZWRJZCxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250cm9sbGVyLnRvcExldmVsQ3VzdG9taXphdGlvbnMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseUFsbCByZW1vdmVzIHNlcnZlcnMgbm8gbG9uZ2VyIHByZXNlbnQgKGNoaWxkKSBhbmQgZW1pdHMgU3RvcHBlZCcsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUsIHsgY3VzdG9taXphdGlvbnM6IFBMVUdJTl9DVVNUT01JWkFUSU9OUyB9KTtcblx0XHRzdG9yZS5hZGQoY29udHJvbGxlcik7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5QWxsKFtzZXJ2ZXIoJ2ZzJywgcmVhZHkoKSldKTtcblx0XHRjb250cm9sbGVyLmFwcGx5QWxsKFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWQsXG5cdFx0XHRcdGlkOiAnbWNwLWNoaWxkOmRlbW86ZnMnLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdFx0Y2hhbm5lbDogJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi0xL2ZzJyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXRlQ2hhbmdlZCxcblx0XHRcdFx0aWQ6ICdtY3AtY2hpbGQ6ZGVtbzpmcycsXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW50aW1lU3RhdGVzIHNuYXBzaG90cyBjaGlsZCBhbmQgdG9wLWxldmVsIHNlcnZlcnMgYnkgY3VzdG9taXphdGlvbiBpZCcsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIgfSA9IGhhcm5lc3Moc3RvcmUsIHsgY3VzdG9taXphdGlvbnM6IFBMVUdJTl9DVVNUT01JWkFUSU9OUyB9KTtcblx0XHRzdG9yZS5hZGQoY29udHJvbGxlcik7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignZnMnLCByZWFkeSgpKSk7XG5cdFx0Y29udHJvbGxlci5hcHBseU9uZShzZXJ2ZXIoJ3NlYXJjaCcsIHN0YXJ0aW5nKCkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udHJvbGxlci5ydW50aW1lU3RhdGVzLmdldCgpLCBuZXcgTWFwKFtcblx0XHRcdFsnbWNwLWNoaWxkOmRlbW86ZnMnLCB7IHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9LCBjaGFubmVsOiAnbWNwOi8vY29waWxvdC9zZXNzaW9uLTEvZnMnIH1dLFxuXHRcdFx0WydtY3AtdG9wLWxldmVsOmNvcGlsb3Q6c2Vzc2lvbi0xOnNlYXJjaCcsIHsgc3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH0sIGNoYW5uZWw6IHVuZGVmaW5lZCB9XSxcblx0XHRdKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuc2VydmVyTmFtZUZvckN1c3RvbWl6YXRpb25JZCgnbWNwLWNoaWxkOmRlbW86ZnMnKSwgJ2ZzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuc2VydmVyTmFtZUZvckN1c3RvbWl6YXRpb25JZCgnbWNwLXRvcC1sZXZlbDpjb3BpbG90OnNlc3Npb24tMTpzZWFyY2gnKSwgJ3NlYXJjaCcpO1xuXG5cdFx0Y29udHJvbGxlci5yZW1vdmUoJ2ZzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY29udHJvbGxlci5ydW50aW1lU3RhdGVzLmdldCgpLmtleXMoKV0sIFsnbWNwLXRvcC1sZXZlbDpjb3BpbG90OnNlc3Npb24tMTpzZWFyY2gnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvcC1sZXZlbCBlbnRyeSBzdGF5cyB0b3AtbGV2ZWwgYWNyb3NzIHVwZGF0ZXMgKGlkIHN0YWJsZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250cm9sbGVyLCBhY3Rpb25zIH0gPSBoYXJuZXNzKHN0b3JlKTtcblx0XHRzdG9yZS5hZGQoY29udHJvbGxlcik7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignc2VhcmNoJywgc3RhcnRpbmcoKSkpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdzZWFyY2gnLCByZWFkeSgpKSk7XG5cdFx0Y29udHJvbGxlci5hcHBseU9uZShzZXJ2ZXIoJ3NlYXJjaCcsIHN0b3BwZWQoKSkpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRJZCA9ICdtY3AtdG9wLWxldmVsOmNvcGlsb3Q6c2Vzc2lvbi0xOnNlYXJjaCc7XG5cdFx0Y29uc3QgaWRzID0gYWN0aW9uc1xuXHRcdFx0LmZpbHRlcihhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQpXG5cdFx0XHQubWFwKGEgPT4gKGEgYXMgeyBjdXN0b21pemF0aW9uOiB7IGlkOiBzdHJpbmcgfSB9KS5jdXN0b21pemF0aW9uLmlkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGlkcywgW2V4cGVjdGVkSWQsIGV4cGVjdGVkSWQsIGV4cGVjdGVkSWRdKTtcblx0fSk7XG5cblx0dGVzdCgnYmFyZSBzZXJ2ZXIgcHVibGlzaGVzIHJlZHVjZXItYmFja2VkIGVuYWJsZW1lbnQgYWNyb3NzIHJ1bnRpbWUgdXBkYXRlcycsICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRyb2xsZXIsIGFjdGlvbnMgfSA9IGhhcm5lc3Moc3RvcmUsIHsgZGVzaXJlZEVuYWJsZWQ6IGZhbHNlIH0pO1xuXHRcdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdzZWFyY2gnLCBhdXRoUmVxdWlyZWQoKSkpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdzZWFyY2gnLCBzdGFydGluZygpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnNcblx0XHRcdC5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZClcblx0XHRcdC5tYXAoYWN0aW9uID0+IGFjdGlvbi5jdXN0b21pemF0aW9uLmVuYWJsZWQpLCBbZmFsc2UsIGZhbHNlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dGhSZXF1aXJlZCBzdGF0ZSBpcyBwcmVzZXJ2ZWQgYWNyb3NzIGNvYXJzZSBzdGFydGluZyB1cGRhdGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udHJvbGxlciwgYWN0aW9ucyB9ID0gaGFybmVzcyhzdG9yZSwgeyBjdXN0b21pemF0aW9uczogUExVR0lOX0NVU1RPTUlaQVRJT05TIH0pO1xuXHRcdHN0b3JlLmFkZChjb250cm9sbGVyKTtcblxuXHRcdGNvbnN0IGF1dGhTdGF0ZSA9IGF1dGhSZXF1aXJlZCgpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdmcycsIGF1dGhTdGF0ZSkpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlPbmUoc2VydmVyKCdmcycsIHN0YXJ0aW5nKCkpKTtcblx0XHRjb250cm9sbGVyLmFwcGx5T25lKHNlcnZlcignZnMnLCByZWFkeSgpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkLFxuXHRcdFx0XHRpZDogJ21jcC1jaGlsZDpkZW1vOmZzJyxcblx0XHRcdFx0c3RhdGU6IGF1dGhTdGF0ZSxcblx0XHRcdFx0Y2hhbm5lbDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkLFxuXHRcdFx0XHRpZDogJ21jcC1jaGlsZDpkZW1vOmZzJyxcblx0XHRcdFx0c3RhdGU6IGF1dGhTdGF0ZSxcblx0XHRcdFx0Y2hhbm5lbDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhdGVDaGFuZ2VkLFxuXHRcdFx0XHRpZDogJ21jcC1jaGlsZDpkZW1vOmZzJyxcblx0XHRcdFx0c3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Nlc3Npb24tMS9mcycsXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZU1jcENoYW5uZWxVcmkgcm91bmQtdHJpcHMgdGhlIGNvbnRyb2xsZXItbWludGVkIGNoYW5uZWwgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYW5uZWwgPSAnbWNwOi8vY29waWxvdC9zZXNzaW9uLTEvZnMnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VNY3BDaGFubmVsVXJpKGNoYW5uZWwpLCB7XG5cdFx0XHRwcm92aWRlcklkOiAnY29waWxvdCcsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0c2VydmVyTmFtZTogJ2ZzJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VNY3BDaGFubmVsVXJpIGRlY29kZXMgVVJMLWVuY29kZWQgcGF0aCBzZWdtZW50cycsICgpID0+IHtcblx0XHRjb25zdCBjaGFubmVsID0gJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbiUyRjEvbXklMjBzZXJ2ZXInO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VNY3BDaGFubmVsVXJpKGNoYW5uZWwpLCB7XG5cdFx0XHRwcm92aWRlcklkOiAnY29waWxvdCcsXG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLzEnLFxuXHRcdFx0c2VydmVyTmFtZTogJ215IHNlcnZlcicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlTWNwQ2hhbm5lbFVyaSByZWplY3RzIG1hbGZvcm1lZCBpbnB1dHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlTWNwQ2hhbm5lbFVyaSgnaHR0cHM6Ly9jb3BpbG90L3gveScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZU1jcENoYW5uZWxVcmkoJ21jcDovLycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZU1jcENoYW5uZWxVcmkoJ21jcDovLy9zZXNzaW9uL3NlcnZlcicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZU1jcENoYW5uZWxVcmkoJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi1vbmx5JyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlTWNwQ2hhbm5lbFVyaSgnbWNwOi8vY29waWxvdC9zZXNzaW9uLycpLCB1bmRlZmluZWQpO1xuXHRcdC8vIEJhZCBwZXJjZW50IGVzY2FwZXMgbXVzdCBub3QgdGhyb3cgXHUyMDE0IGNhbGxlciB0dXJucyB1bmRlZmluZWRcblx0XHQvLyBpbnRvIGEgY2xlYW4gTWV0aG9kIG5vdCBmb3VuZCwgbm90IGFuIGludGVybmFsIGVycm9yLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZU1jcENoYW5uZWxVcmkoJ21jcDovL2NvcGlsb3QvYmFkJS9zZXJ2ZXInKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VNY3BDaGFubmVsVXJpKCdtY3A6Ly9jb3BpbG90L3Nlc3Npb24vYmFkJTInKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZE1jcENoaWxkSWQgZmluZHMgYmFyZSB0b3AtbGV2ZWwgZW50cmllcyBhbmQgcGx1Z2luIGNoaWxkcmVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gPSBbXG5cdFx0XHQuLi5QTFVHSU5fQ1VTVE9NSVpBVElPTlMsXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcixcblx0XHRcdFx0aWQ6ICdtY3AtdG9wLWxldmVsOnRlc3Q6c2VhcmNoJyxcblx0XHRcdFx0dXJpOiAnbWNwLXRvcC1sZXZlbDp0ZXN0OnNlYXJjaCcsXG5cdFx0XHRcdG5hbWU6ICdzZWFyY2gnLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWNwQ2hpbGRJZChjdXN0b21pemF0aW9ucywgJ2ZzJyksICdtY3AtY2hpbGQ6ZGVtbzpmcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWNwQ2hpbGRJZChjdXN0b21pemF0aW9ucywgJ3NlYXJjaCcpLCAnbWNwLXRvcC1sZXZlbDp0ZXN0OnNlYXJjaCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWNwQ2hpbGRJZChjdXN0b21pemF0aW9ucywgJ21pc3NpbmcnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZE1jcFNlcnZlck5hbWUgZmluZHMgYmFyZSB0b3AtbGV2ZWwgZW50cmllcyBhbmQgcGx1Z2luIGNoaWxkcmVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gPSBbXG5cdFx0XHQuLi5QTFVHSU5fQ1VTVE9NSVpBVElPTlMsXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcixcblx0XHRcdFx0aWQ6ICdtY3AtdG9wLWxldmVsOnRlc3Q6c2VhcmNoJyxcblx0XHRcdFx0dXJpOiAnbWNwLXRvcC1sZXZlbDp0ZXN0OnNlYXJjaCcsXG5cdFx0XHRcdG5hbWU6ICdzZWFyY2gnLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWNwU2VydmVyTmFtZShjdXN0b21pemF0aW9ucywgJ21jcC1jaGlsZDpkZW1vOmZzJyksICdmcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWNwU2VydmVyTmFtZShjdXN0b21pemF0aW9ucywgJ21jcC10b3AtbGV2ZWw6dGVzdDpzZWFyY2gnKSwgJ3NlYXJjaCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWNwU2VydmVyTmFtZShjdXN0b21pemF0aW9ucywgJ21pc3NpbmcnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQix1QkFBdUIsaUJBQWlCLHFCQUE4RDtBQUVsSSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE0QixnQkFBZ0IsbUJBQW1CLDBCQUE4QztBQUV0SCxTQUFTLFFBQVEsT0FBcUMsT0FBZ0YsQ0FBQyxHQUFHO0FBQ3pJ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
