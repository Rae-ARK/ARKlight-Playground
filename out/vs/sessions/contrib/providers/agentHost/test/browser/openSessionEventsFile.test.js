import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { RemoteAgentHostConnectionStatus } from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IsSessionsWindowContext } from "../../../../../../workbench/common/contextkeys.js";
import { OpenCopilotCliStateFileAction } from "../../../../../../workbench/contrib/chat/browser/actions/openCopilotCliStateFileAction.js";
import { ChatContextKeys } from "../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { buildLocalCopilotLogsUri, buildRemoteCopilotLogsUri, getCopilotCliSessionRawId, resolveEventsUri } from "../../../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js";
import { IsAgentHostSession } from "../../browser/agentHostSkillButtons.js";
import { OpenSessionEventsFileAction } from "../../browser/openSessionEventsFileActions.js";
suite("openSessionEventsFile resolveEventsUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const userHome = URI.file("/home/me");
  function makeRemoteConn(address, defaultDirectory) {
    return {
      address,
      name: address,
      clientId: "client-1",
      defaultDirectory,
      status: RemoteAgentHostConnectionStatus.connected
    };
  }
  function context(values) {
    return {
      getValue: (key) => values[key]
    };
  }
  test("workbench command is disabled in the Agents window", () => {
    const workbenchPrecondition = new OpenCopilotCliStateFileAction().desc.precondition;
    const sessionsPrecondition = new OpenSessionEventsFileAction().desc.precondition;
    assert.deepStrictEqual({
      workbenchVSCodeWindow: workbenchPrecondition?.evaluate(context({
        [ChatContextKeys.enabled.key]: true,
        [IsSessionsWindowContext.key]: false
      })),
      workbenchAgentsWindow: workbenchPrecondition?.evaluate(context({
        [ChatContextKeys.enabled.key]: true,
        [IsSessionsWindowContext.key]: true
      })),
      sessionsCopilotCliSession: sessionsPrecondition?.evaluate(context({
        [ChatContextKeys.enabled.key]: true,
        [IsAgentHostSession.key]: false
      })),
      sessionsAgentHostSession: sessionsPrecondition?.evaluate(context({
        [ChatContextKeys.enabled.key]: true,
        [IsAgentHostSession.key]: true
      }))
    }, {
      workbenchVSCodeWindow: true,
      workbenchAgentsWindow: false,
      sessionsCopilotCliSession: false,
      sessionsAgentHostSession: true
    });
  });
  test("local AH copilotcli session resolves to ~/.copilot/session-state/<id>/events.jsonl", () => {
    const result = resolveEventsUri(URI.parse("agent-host-copilotcli:/abc"), userHome, () => void 0);
    assert.deepStrictEqual(
      { kind: result.kind, resource: result.kind === "ok" ? result.resource.toString() : void 0 },
      { kind: "ok", resource: "file:///home/me/.copilot/session-state/abc/events.jsonl" }
    );
  });
  test("local AH copilotcli session resolves from COPILOT_HOME", () => {
    const result = resolveEventsUri(
      URI.parse("agent-host-copilotcli:/abc"),
      userHome,
      () => void 0,
      { COPILOT_HOME: "/custom/copilot" }
    );
    assert.deepStrictEqual(
      { kind: result.kind, resource: result.kind === "ok" ? result.resource.toString() : void 0 },
      { kind: "ok", resource: "file:///custom/copilot/session-state/abc/events.jsonl" }
    );
  });
  test("copilot log roots resolve beside session-state", () => {
    const conn = makeRemoteConn("localhost:4321", "/home/remote");
    const remoteLogs = buildRemoteCopilotLogsUri(conn);
    assert.deepStrictEqual({
      rawId: getCopilotCliSessionRawId(URI.parse("agent-host-copilotcli:/abc")),
      nonCopilotRawId: getCopilotCliSessionRawId(URI.parse("agent-host-copilot:/abc")),
      localLogs: buildLocalCopilotLogsUri(userHome).toString(),
      remoteLogs: remoteLogs ? {
        scheme: remoteLogs.scheme,
        authority: remoteLogs.authority,
        isLogsPath: remoteLogs.path.endsWith("/home/remote/.copilot/logs")
      } : void 0
    }, {
      rawId: "abc",
      nonCopilotRawId: void 0,
      localLogs: "file:///home/me/.copilot/logs",
      remoteLogs: {
        scheme: "vscode-agent-host",
        authority: "localhost__4321",
        isLogsPath: true
      }
    });
  });
  test("local copilot log root resolves from COPILOT_HOME", () => {
    assert.strictEqual(
      buildLocalCopilotLogsUri(userHome, { COPILOT_HOME: "/custom/copilot" }).toString(),
      "file:///custom/copilot/logs"
    );
  });
  test("EH CLI copilotcli session resolves to ~/.copilot/session-state/<id>/events.jsonl", () => {
    const result = resolveEventsUri(URI.parse("copilotcli:/abc"), userHome, () => void 0);
    assert.deepStrictEqual(
      { kind: result.kind, resource: result.kind === "ok" ? result.resource.toString() : void 0 },
      { kind: "ok", resource: "file:///home/me/.copilot/session-state/abc/events.jsonl" }
    );
  });
  test("remote copilotcli session wraps host events.jsonl in vscode-agent-host URI", () => {
    const conn = makeRemoteConn("localhost:4321", "/home/remote");
    const result = resolveEventsUri(
      URI.parse("remote-localhost__4321-copilotcli:/xyz"),
      userHome,
      (authority) => authority === "localhost__4321" ? conn : void 0
    );
    assert.deepStrictEqual(
      { kind: result.kind, resource: result.kind === "ok" ? result.resource.toString() : void 0 },
      { kind: "ok", resource: "vscode-agent-host://localhost__4321/home/remote/.copilot/session-state/xyz/events.jsonl?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0" }
    );
  });
  test("remote scheme without an active connection returns remote-not-connected", () => {
    const result = resolveEventsUri(
      URI.parse("remote-myhost-copilotcli:/abc"),
      userHome,
      () => void 0
    );
    assert.deepStrictEqual(result, { kind: "remote-not-connected", authority: "myhost" });
  });
  test("remote scheme without a defaultDirectory returns remote-no-home", () => {
    const conn = makeRemoteConn("myhost", void 0);
    const result = resolveEventsUri(
      URI.parse("remote-myhost-copilotcli:/abc"),
      userHome,
      (authority) => authority === "myhost" ? conn : void 0
    );
    assert.deepStrictEqual(result, { kind: "remote-no-home", authority: "myhost" });
  });
  test("unknown scheme returns unsupported-scheme", () => {
    const result = resolveEventsUri(URI.parse("claude:/abc"), userHome, () => void 0);
    assert.deepStrictEqual(result, { kind: "unsupported-scheme", scheme: "claude" });
  });
  test("missing session resource returns no-session", () => {
    const result = resolveEventsUri(void 0, userHome, () => void 0);
    assert.deepStrictEqual(result, { kind: "no-session" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvb3BlblNlc3Npb25FdmVudHNGaWxlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbnRleHRLZXlWYWx1ZSwgSUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgT3BlbkNvcGlsb3RDbGlTdGF0ZUZpbGVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9vcGVuQ29waWxvdENsaVN0YXRlRmlsZUFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBidWlsZExvY2FsQ29waWxvdExvZ3NVcmksIGJ1aWxkUmVtb3RlQ29waWxvdExvZ3NVcmksIGdldENvcGlsb3RDbGlTZXNzaW9uUmF3SWQsIHJlc29sdmVFdmVudHNVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY29waWxvdENsaUV2ZW50c1VyaS5qcyc7XG5pbXBvcnQgeyBJc0FnZW50SG9zdFNlc3Npb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2FnZW50SG9zdFNraWxsQnV0dG9ucy5qcyc7XG5pbXBvcnQgeyBPcGVuU2Vzc2lvbkV2ZW50c0ZpbGVBY3Rpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL29wZW5TZXNzaW9uRXZlbnRzRmlsZUFjdGlvbnMuanMnO1xuXG5zdWl0ZSgnb3BlblNlc3Npb25FdmVudHNGaWxlIHJlc29sdmVFdmVudHNVcmknLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHVzZXJIb21lID0gVVJJLmZpbGUoJy9ob21lL21lJyk7XG5cblx0ZnVuY3Rpb24gbWFrZVJlbW90ZUNvbm4oYWRkcmVzczogc3RyaW5nLCBkZWZhdWx0RGlyZWN0b3J5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRhZGRyZXNzLFxuXHRcdFx0bmFtZTogYWRkcmVzcyxcblx0XHRcdGNsaWVudElkOiAnY2xpZW50LTEnLFxuXHRcdFx0ZGVmYXVsdERpcmVjdG9yeSxcblx0XHRcdHN0YXR1czogUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnRleHQodmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBDb250ZXh0S2V5VmFsdWU+KTogSUNvbnRleHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRWYWx1ZTogPFQgZXh0ZW5kcyBDb250ZXh0S2V5VmFsdWUgPSBDb250ZXh0S2V5VmFsdWU+KGtleTogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCA9PiB2YWx1ZXNba2V5XSBhcyBUIHwgdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCd3b3JrYmVuY2ggY29tbWFuZCBpcyBkaXNhYmxlZCBpbiB0aGUgQWdlbnRzIHdpbmRvdycsICgpID0+IHtcblx0XHRjb25zdCB3b3JrYmVuY2hQcmVjb25kaXRpb24gPSBuZXcgT3BlbkNvcGlsb3RDbGlTdGF0ZUZpbGVBY3Rpb24oKS5kZXNjLnByZWNvbmRpdGlvbjtcblx0XHRjb25zdCBzZXNzaW9uc1ByZWNvbmRpdGlvbiA9IG5ldyBPcGVuU2Vzc2lvbkV2ZW50c0ZpbGVBY3Rpb24oKS5kZXNjLnByZWNvbmRpdGlvbjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d29ya2JlbmNoVlNDb2RlV2luZG93OiB3b3JrYmVuY2hQcmVjb25kaXRpb24/LmV2YWx1YXRlKGNvbnRleHQoe1xuXHRcdFx0XHRbQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQua2V5XTogdHJ1ZSxcblx0XHRcdFx0W0lzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LmtleV06IGZhbHNlLFxuXHRcdFx0fSkpLFxuXHRcdFx0d29ya2JlbmNoQWdlbnRzV2luZG93OiB3b3JrYmVuY2hQcmVjb25kaXRpb24/LmV2YWx1YXRlKGNvbnRleHQoe1xuXHRcdFx0XHRbQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQua2V5XTogdHJ1ZSxcblx0XHRcdFx0W0lzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LmtleV06IHRydWUsXG5cdFx0XHR9KSksXG5cdFx0XHRzZXNzaW9uc0NvcGlsb3RDbGlTZXNzaW9uOiBzZXNzaW9uc1ByZWNvbmRpdGlvbj8uZXZhbHVhdGUoY29udGV4dCh7XG5cdFx0XHRcdFtDaGF0Q29udGV4dEtleXMuZW5hYmxlZC5rZXldOiB0cnVlLFxuXHRcdFx0XHRbSXNBZ2VudEhvc3RTZXNzaW9uLmtleV06IGZhbHNlLFxuXHRcdFx0fSkpLFxuXHRcdFx0c2Vzc2lvbnNBZ2VudEhvc3RTZXNzaW9uOiBzZXNzaW9uc1ByZWNvbmRpdGlvbj8uZXZhbHVhdGUoY29udGV4dCh7XG5cdFx0XHRcdFtDaGF0Q29udGV4dEtleXMuZW5hYmxlZC5rZXldOiB0cnVlLFxuXHRcdFx0XHRbSXNBZ2VudEhvc3RTZXNzaW9uLmtleV06IHRydWUsXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0d29ya2JlbmNoVlNDb2RlV2luZG93OiB0cnVlLFxuXHRcdFx0d29ya2JlbmNoQWdlbnRzV2luZG93OiBmYWxzZSxcblx0XHRcdHNlc3Npb25zQ29waWxvdENsaVNlc3Npb246IGZhbHNlLFxuXHRcdFx0c2Vzc2lvbnNBZ2VudEhvc3RTZXNzaW9uOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBBSCBjb3BpbG90Y2xpIHNlc3Npb24gcmVzb2x2ZXMgdG8gfi8uY29waWxvdC9zZXNzaW9uLXN0YXRlLzxpZD4vZXZlbnRzLmpzb25sJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVFdmVudHNVcmkoVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L2FiYycpLCB1c2VySG9tZSwgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBraW5kOiByZXN1bHQua2luZCwgcmVzb3VyY2U6IHJlc3VsdC5raW5kID09PSAnb2snID8gcmVzdWx0LnJlc291cmNlLnRvU3RyaW5nKCkgOiB1bmRlZmluZWQgfSxcblx0XHRcdHsga2luZDogJ29rJywgcmVzb3VyY2U6ICdmaWxlOi8vL2hvbWUvbWUvLmNvcGlsb3Qvc2Vzc2lvbi1zdGF0ZS9hYmMvZXZlbnRzLmpzb25sJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvY2FsIEFIIGNvcGlsb3RjbGkgc2Vzc2lvbiByZXNvbHZlcyBmcm9tIENPUElMT1RfSE9NRScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlRXZlbnRzVXJpKFxuXHRcdFx0VVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L2FiYycpLFxuXHRcdFx0dXNlckhvbWUsXG5cdFx0XHQoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHR7IENPUElMT1RfSE9NRTogJy9jdXN0b20vY29waWxvdCcgfSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGtpbmQ6IHJlc3VsdC5raW5kLCByZXNvdXJjZTogcmVzdWx0LmtpbmQgPT09ICdvaycgPyByZXN1bHQucmVzb3VyY2UudG9TdHJpbmcoKSA6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBraW5kOiAnb2snLCByZXNvdXJjZTogJ2ZpbGU6Ly8vY3VzdG9tL2NvcGlsb3Qvc2Vzc2lvbi1zdGF0ZS9hYmMvZXZlbnRzLmpzb25sJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcGlsb3QgbG9nIHJvb3RzIHJlc29sdmUgYmVzaWRlIHNlc3Npb24tc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubiA9IG1ha2VSZW1vdGVDb25uKCdsb2NhbGhvc3Q6NDMyMScsICcvaG9tZS9yZW1vdGUnKTtcblx0XHRjb25zdCByZW1vdGVMb2dzID0gYnVpbGRSZW1vdGVDb3BpbG90TG9nc1VyaShjb25uKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJhd0lkOiBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkKFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9hYmMnKSksXG5cdFx0XHRub25Db3BpbG90UmF3SWQ6IGdldENvcGlsb3RDbGlTZXNzaW9uUmF3SWQoVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3Q6L2FiYycpKSxcblx0XHRcdGxvY2FsTG9nczogYnVpbGRMb2NhbENvcGlsb3RMb2dzVXJpKHVzZXJIb21lKS50b1N0cmluZygpLFxuXHRcdFx0cmVtb3RlTG9nczogcmVtb3RlTG9ncyA/IHtcblx0XHRcdFx0c2NoZW1lOiByZW1vdGVMb2dzLnNjaGVtZSxcblx0XHRcdFx0YXV0aG9yaXR5OiByZW1vdGVMb2dzLmF1dGhvcml0eSxcblx0XHRcdFx0aXNMb2dzUGF0aDogcmVtb3RlTG9ncy5wYXRoLmVuZHNXaXRoKCcvaG9tZS9yZW1vdGUvLmNvcGlsb3QvbG9ncycpLFxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRyYXdJZDogJ2FiYycsXG5cdFx0XHRub25Db3BpbG90UmF3SWQ6IHVuZGVmaW5lZCxcblx0XHRcdGxvY2FsTG9nczogJ2ZpbGU6Ly8vaG9tZS9tZS8uY29waWxvdC9sb2dzJyxcblx0XHRcdHJlbW90ZUxvZ3M6IHtcblx0XHRcdFx0c2NoZW1lOiAndnNjb2RlLWFnZW50LWhvc3QnLFxuXHRcdFx0XHRhdXRob3JpdHk6ICdsb2NhbGhvc3RfXzQzMjEnLFxuXHRcdFx0XHRpc0xvZ3NQYXRoOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbG9jYWwgY29waWxvdCBsb2cgcm9vdCByZXNvbHZlcyBmcm9tIENPUElMT1RfSE9NRScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRidWlsZExvY2FsQ29waWxvdExvZ3NVcmkodXNlckhvbWUsIHsgQ09QSUxPVF9IT01FOiAnL2N1c3RvbS9jb3BpbG90JyB9KS50b1N0cmluZygpLFxuXHRcdFx0J2ZpbGU6Ly8vY3VzdG9tL2NvcGlsb3QvbG9ncycsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnRUggQ0xJIGNvcGlsb3RjbGkgc2Vzc2lvbiByZXNvbHZlcyB0byB+Ly5jb3BpbG90L3Nlc3Npb24tc3RhdGUvPGlkPi9ldmVudHMuanNvbmwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUV2ZW50c1VyaShVUkkucGFyc2UoJ2NvcGlsb3RjbGk6L2FiYycpLCB1c2VySG9tZSwgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBraW5kOiByZXN1bHQua2luZCwgcmVzb3VyY2U6IHJlc3VsdC5raW5kID09PSAnb2snID8gcmVzdWx0LnJlc291cmNlLnRvU3RyaW5nKCkgOiB1bmRlZmluZWQgfSxcblx0XHRcdHsga2luZDogJ29rJywgcmVzb3VyY2U6ICdmaWxlOi8vL2hvbWUvbWUvLmNvcGlsb3Qvc2Vzc2lvbi1zdGF0ZS9hYmMvZXZlbnRzLmpzb25sJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW90ZSBjb3BpbG90Y2xpIHNlc3Npb24gd3JhcHMgaG9zdCBldmVudHMuanNvbmwgaW4gdnNjb2RlLWFnZW50LWhvc3QgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm4gPSBtYWtlUmVtb3RlQ29ubignbG9jYWxob3N0OjQzMjEnLCAnL2hvbWUvcmVtb3RlJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUV2ZW50c1VyaShcblx0XHRcdFVSSS5wYXJzZSgncmVtb3RlLWxvY2FsaG9zdF9fNDMyMS1jb3BpbG90Y2xpOi94eXonKSxcblx0XHRcdHVzZXJIb21lLFxuXHRcdFx0YXV0aG9yaXR5ID0+IGF1dGhvcml0eSA9PT0gJ2xvY2FsaG9zdF9fNDMyMScgPyBjb25uIDogdW5kZWZpbmVkLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsga2luZDogcmVzdWx0LmtpbmQsIHJlc291cmNlOiByZXN1bHQua2luZCA9PT0gJ29rJyA/IHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpIDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGtpbmQ6ICdvaycsIHJlc291cmNlOiAndnNjb2RlLWFnZW50LWhvc3Q6Ly9sb2NhbGhvc3RfXzQzMjEvaG9tZS9yZW1vdGUvLmNvcGlsb3Qvc2Vzc2lvbi1zdGF0ZS94eXovZXZlbnRzLmpzb25sP19haCUzRGV5SnpZMmhsYldVaU9pSm1hV3hsSW4wJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW90ZSBzY2hlbWUgd2l0aG91dCBhbiBhY3RpdmUgY29ubmVjdGlvbiByZXR1cm5zIHJlbW90ZS1ub3QtY29ubmVjdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVFdmVudHNVcmkoXG5cdFx0XHRVUkkucGFyc2UoJ3JlbW90ZS1teWhvc3QtY29waWxvdGNsaTovYWJjJyksXG5cdFx0XHR1c2VySG9tZSxcblx0XHRcdCgpID0+IHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6ICdyZW1vdGUtbm90LWNvbm5lY3RlZCcsIGF1dGhvcml0eTogJ215aG9zdCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW90ZSBzY2hlbWUgd2l0aG91dCBhIGRlZmF1bHREaXJlY3RvcnkgcmV0dXJucyByZW1vdGUtbm8taG9tZScsICgpID0+IHtcblx0XHRjb25zdCBjb25uID0gbWFrZVJlbW90ZUNvbm4oJ215aG9zdCcsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUV2ZW50c1VyaShcblx0XHRcdFVSSS5wYXJzZSgncmVtb3RlLW15aG9zdC1jb3BpbG90Y2xpOi9hYmMnKSxcblx0XHRcdHVzZXJIb21lLFxuXHRcdFx0YXV0aG9yaXR5ID0+IGF1dGhvcml0eSA9PT0gJ215aG9zdCcgPyBjb25uIDogdW5kZWZpbmVkLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ3JlbW90ZS1uby1ob21lJywgYXV0aG9yaXR5OiAnbXlob3N0JyB9KTtcblx0fSk7XG5cblx0dGVzdCgndW5rbm93biBzY2hlbWUgcmV0dXJucyB1bnN1cHBvcnRlZC1zY2hlbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUV2ZW50c1VyaShVUkkucGFyc2UoJ2NsYXVkZTovYWJjJyksIHVzZXJIb21lLCAoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6ICd1bnN1cHBvcnRlZC1zY2hlbWUnLCBzY2hlbWU6ICdjbGF1ZGUnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtaXNzaW5nIHNlc3Npb24gcmVzb3VyY2UgcmV0dXJucyBuby1zZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVFdmVudHNVcmkodW5kZWZpbmVkLCB1c2VySG9tZSwgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAnbm8tc2Vzc2lvbicgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBRXhELFNBQXlDLHVDQUF1QztBQUNoRixTQUFTLCtC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
