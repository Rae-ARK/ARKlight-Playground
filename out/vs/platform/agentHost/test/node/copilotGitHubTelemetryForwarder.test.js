import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { CopilotGitHubTelemetryForwarder } from "../../node/copilot/copilotGitHubTelemetryForwarder.js";
class TestTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.USAGE;
    this.sendErrorTelemetry = true;
    this.sessionId = "sessionId";
    this.machineId = "machineId";
    this.sqmId = "sqmId";
    this.devDeviceId = "devDeviceId";
    this.firstSessionDate = "firstSessionDate";
    this.events = [];
  }
  publicLog(eventName, data) {
    this.events.push({ eventName, data });
  }
  publicLogError() {
  }
  publicLog2() {
  }
  publicLogError2() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite("CopilotGitHubTelemetryForwarder", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("forwards a standard event to VS Code telemetry", () => {
    const telemetryService = new TestTelemetryService();
    const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);
    forwarder.forward({
      sessionId: "notification-session",
      restricted: false,
      event: {
        kind: "tool_call_executed",
        created_at: "2026-07-10T12:00:00Z",
        model_call_id: "model-call",
        properties: { tool_name: "grep" },
        metrics: { duration_ms: 42 },
        exp_assignment_context: "experiment",
        features: { featureA: "enabled" },
        copilot_tracking_id: "tracking-id",
        client: {
          cli_version: "1.0.69",
          os_platform: "win32",
          os_version: "11",
          os_arch: "x64",
          node_version: "24.0.0",
          is_staff: true
        }
      }
    });
    assert.deepStrictEqual(telemetryService.events, [{
      eventName: "copilotCli/tool_call_executed",
      data: {
        cli_version: "1.0.69",
        os_platform: "win32",
        os_version: "11",
        os_arch: "x64",
        node_version: "24.0.0",
        is_staff: true,
        tool_name: "grep",
        duration_ms: 42,
        created_at: "2026-07-10T12:00:00Z",
        model_call_id: "model-call",
        exp_assignment_context: "experiment",
        session_id: "notification-session",
        sdk_session_id: "notification-session",
        copilot_tracking_id: "tracking-id",
        kind: "tool_call_executed",
        restricted: false,
        "feature.featureA": "enabled"
      }
    }]);
  });
  test("gates restricted events on the restricted telemetry option", () => {
    const telemetryService = new TestTelemetryService();
    let restrictedTelemetryEnabled = false;
    const forwarder = new CopilotGitHubTelemetryForwarder(() => restrictedTelemetryEnabled, telemetryService);
    const notification = {
      sessionId: "session",
      restricted: true,
      event: {
        kind: "restricted_event",
        properties: {},
        metrics: {}
      }
    };
    forwarder.forward(notification);
    restrictedTelemetryEnabled = true;
    forwarder.forward(notification);
    assert.deepStrictEqual(telemetryService.events, [{
      eventName: "copilotCli/restricted_event",
      data: {
        created_at: void 0,
        model_call_id: void 0,
        exp_assignment_context: void 0,
        session_id: "session",
        sdk_session_id: "session",
        copilot_tracking_id: void 0,
        kind: "restricted_event",
        restricted: true
      }
    }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdEdpdEh1YlRlbGVtZXRyeUZvcndhcmRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBHaXRIdWJUZWxlbWV0cnlOb3RpZmljYXRpb24gfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeURhdGEsIElUZWxlbWV0cnlTZXJ2aWNlLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENvcGlsb3RHaXRIdWJUZWxlbWV0cnlGb3J3YXJkZXIgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvY29waWxvdEdpdEh1YlRlbGVtZXRyeUZvcndhcmRlci5qcyc7XG5cbmludGVyZmFjZSBDYXB0dXJlZEV2ZW50IHtcblx0ZXZlbnROYW1lOiBzdHJpbmc7XG5cdGRhdGE6IElUZWxlbWV0cnlEYXRhIHwgdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBpbXBsZW1lbnRzIElUZWxlbWV0cnlTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgdGVsZW1ldHJ5TGV2ZWwgPSBUZWxlbWV0cnlMZXZlbC5VU0FHRTtcblx0cmVhZG9ubHkgc2VuZEVycm9yVGVsZW1ldHJ5ID0gdHJ1ZTtcblx0cmVhZG9ubHkgc2Vzc2lvbklkID0gJ3Nlc3Npb25JZCc7XG5cdHJlYWRvbmx5IG1hY2hpbmVJZCA9ICdtYWNoaW5lSWQnO1xuXHRyZWFkb25seSBzcW1JZCA9ICdzcW1JZCc7XG5cdHJlYWRvbmx5IGRldkRldmljZUlkID0gJ2RldkRldmljZUlkJztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZSA9ICdmaXJzdFNlc3Npb25EYXRlJztcblx0cmVhZG9ubHkgZXZlbnRzOiBDYXB0dXJlZEV2ZW50W10gPSBbXTtcblxuXHRwdWJsaWNMb2coZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiBJVGVsZW1ldHJ5RGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGEgfSk7XG5cdH1cblx0cHVibGljTG9nRXJyb3IoKTogdm9pZCB7IH1cblx0cHVibGljTG9nMigpOiB2b2lkIHsgfVxuXHRwdWJsaWNMb2dFcnJvcjIoKTogdm9pZCB7IH1cblx0c2V0RXhwZXJpbWVudFByb3BlcnR5KCk6IHZvaWQgeyB9XG5cdHNldENvbW1vblByb3BlcnR5KCk6IHZvaWQgeyB9XG59XG5cbnN1aXRlKCdDb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmb3J3YXJkcyBhIHN0YW5kYXJkIGV2ZW50IHRvIFZTIENvZGUgdGVsZW1ldHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCBmb3J3YXJkZXIgPSBuZXcgQ29waWxvdEdpdEh1YlRlbGVtZXRyeUZvcndhcmRlcigoKSA9PiBmYWxzZSwgdGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRmb3J3YXJkZXIuZm9yd2FyZCh7XG5cdFx0XHRzZXNzaW9uSWQ6ICdub3RpZmljYXRpb24tc2Vzc2lvbicsXG5cdFx0XHRyZXN0cmljdGVkOiBmYWxzZSxcblx0XHRcdGV2ZW50OiB7XG5cdFx0XHRcdGtpbmQ6ICd0b29sX2NhbGxfZXhlY3V0ZWQnLFxuXHRcdFx0XHRjcmVhdGVkX2F0OiAnMjAyNi0wNy0xMFQxMjowMDowMFonLFxuXHRcdFx0XHRtb2RlbF9jYWxsX2lkOiAnbW9kZWwtY2FsbCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHsgdG9vbF9uYW1lOiAnZ3JlcCcgfSxcblx0XHRcdFx0bWV0cmljczogeyBkdXJhdGlvbl9tczogNDIgfSxcblx0XHRcdFx0ZXhwX2Fzc2lnbm1lbnRfY29udGV4dDogJ2V4cGVyaW1lbnQnLFxuXHRcdFx0XHRmZWF0dXJlczogeyBmZWF0dXJlQTogJ2VuYWJsZWQnIH0sXG5cdFx0XHRcdGNvcGlsb3RfdHJhY2tpbmdfaWQ6ICd0cmFja2luZy1pZCcsXG5cdFx0XHRcdGNsaWVudDoge1xuXHRcdFx0XHRcdGNsaV92ZXJzaW9uOiAnMS4wLjY5Jyxcblx0XHRcdFx0XHRvc19wbGF0Zm9ybTogJ3dpbjMyJyxcblx0XHRcdFx0XHRvc192ZXJzaW9uOiAnMTEnLFxuXHRcdFx0XHRcdG9zX2FyY2g6ICd4NjQnLFxuXHRcdFx0XHRcdG5vZGVfdmVyc2lvbjogJzI0LjAuMCcsXG5cdFx0XHRcdFx0aXNfc3RhZmY6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cywgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2NvcGlsb3RDbGkvdG9vbF9jYWxsX2V4ZWN1dGVkJyxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0Y2xpX3ZlcnNpb246ICcxLjAuNjknLFxuXHRcdFx0XHRvc19wbGF0Zm9ybTogJ3dpbjMyJyxcblx0XHRcdFx0b3NfdmVyc2lvbjogJzExJyxcblx0XHRcdFx0b3NfYXJjaDogJ3g2NCcsXG5cdFx0XHRcdG5vZGVfdmVyc2lvbjogJzI0LjAuMCcsXG5cdFx0XHRcdGlzX3N0YWZmOiB0cnVlLFxuXHRcdFx0XHR0b29sX25hbWU6ICdncmVwJyxcblx0XHRcdFx0ZHVyYXRpb25fbXM6IDQyLFxuXHRcdFx0XHRjcmVhdGVkX2F0OiAnMjAyNi0wNy0xMFQxMjowMDowMFonLFxuXHRcdFx0XHRtb2RlbF9jYWxsX2lkOiAnbW9kZWwtY2FsbCcsXG5cdFx0XHRcdGV4cF9hc3NpZ25tZW50X2NvbnRleHQ6ICdleHBlcmltZW50Jyxcblx0XHRcdFx0c2Vzc2lvbl9pZDogJ25vdGlmaWNhdGlvbi1zZXNzaW9uJyxcblx0XHRcdFx0c2RrX3Nlc3Npb25faWQ6ICdub3RpZmljYXRpb24tc2Vzc2lvbicsXG5cdFx0XHRcdGNvcGlsb3RfdHJhY2tpbmdfaWQ6ICd0cmFja2luZy1pZCcsXG5cdFx0XHRcdGtpbmQ6ICd0b29sX2NhbGxfZXhlY3V0ZWQnLFxuXHRcdFx0XHRyZXN0cmljdGVkOiBmYWxzZSxcblx0XHRcdFx0J2ZlYXR1cmUuZmVhdHVyZUEnOiAnZW5hYmxlZCcsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZ2F0ZXMgcmVzdHJpY3RlZCBldmVudHMgb24gdGhlIHJlc3RyaWN0ZWQgdGVsZW1ldHJ5IG9wdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0bGV0IHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZm9yd2FyZGVyID0gbmV3IENvcGlsb3RHaXRIdWJUZWxlbWV0cnlGb3J3YXJkZXIoKCkgPT4gcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbjogR2l0SHViVGVsZW1ldHJ5Tm90aWZpY2F0aW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbicsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZXZlbnQ6IHtcblx0XHRcdFx0a2luZDogJ3Jlc3RyaWN0ZWRfZXZlbnQnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7fSxcblx0XHRcdFx0bWV0cmljczoge30sXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRmb3J3YXJkZXIuZm9yd2FyZChub3RpZmljYXRpb24pO1xuXHRcdHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkID0gdHJ1ZTtcblx0XHRmb3J3YXJkZXIuZm9yd2FyZChub3RpZmljYXRpb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cywgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2NvcGlsb3RDbGkvcmVzdHJpY3RlZF9ldmVudCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGNyZWF0ZWRfYXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZWxfY2FsbF9pZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRleHBfYXNzaWdubWVudF9jb250ZXh0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlc3Npb25faWQ6ICdzZXNzaW9uJyxcblx0XHRcdFx0c2RrX3Nlc3Npb25faWQ6ICdzZXNzaW9uJyxcblx0XHRcdFx0Y29waWxvdF90cmFja2luZ19pZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRraW5kOiAncmVzdHJpY3RlZF9ldmVudCcsXG5cdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUE0QyxzQkFBc0I7QUFDbEUsU0FBUyx1Q0FBdUM7QUFPaEQsTUFBTSxxQkFBa0Q7QUFBQSxFQUF4RDtBQUdDLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFFBQVE7QUFDakIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsU0FBMEIsQ0FBQztBQUFBO0FBQUEsRUFFcEMsVUFBVSxXQUFtQixNQUE2QjtBQUN6RCxTQUFLLE9BQU8sS0FBSyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQUEsRUFDckM7QUFBQSxFQUNBLGlCQUF1QjtBQUFBLEVBQUU7QUFBQSxFQUN6QixhQUFtQjtBQUFBLEVBQUU7QUFBQSxFQUNyQixrQkFBd0I7QUFBQSxFQUFFO0FBQUEsRUFDMUIsd0JBQThCO0FBQUEsRUFBRTtBQUFBLEVBQ2hDLG9CQUEwQjtBQUFBLEVBQUU7QUFDN0I7QUFFQSxNQUFNLG1DQUFtQyxNQUFNO0FBQzlDLDBDQUF3QztBQUV4QyxPQUFLLGtEQUFrRCxNQUFNO0FBQzVELFVBQU0sbUJBQW1CLElBQUkscUJBQXFCO0FBQ2xELFVBQU0sWUFBWSxJQUFJLGdDQUFnQyxNQUFNLE9BQU8sZ0JBQWdCO0FBRW5GLGNBQVUsUUFBUTtBQUFBLE1BQ2pCLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxNQUNaLE9BQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLGVBQWU7QUFBQSxRQUNmLFlBQVksRUFBRSxXQUFXLE9BQU87QUFBQSxRQUNoQyxTQUFTLEVBQUUsYUFBYSxHQUFHO0FBQUEsUUFDM0Isd0JBQXdCO0FBQUEsUUFDeEIsVUFBVSxFQUFFLFVBQVUsVUFBVTtBQUFBLFFBQ2hDLHFCQUFxQjtBQUFBLFFBQ3JCLFFBQVE7QUFBQSxVQUNQLGFBQWE7QUFBQSxVQUNiLGFBQWE7QUFBQSxVQUNiLFlBQVk7QUFBQSxVQUNaLFNBQVM7QUFBQSxVQUNULGNBQWM7QUFBQSxVQUNkLFVBQVU7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLGlCQUFpQixRQUFRLENBQUM7QUFBQSxNQUNoRCxXQUFXO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTCxhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixZQUFZO0FBQUEsUUFDWixTQUFTO0FBQUEsUUFDVCxjQUFjO0FBQUEsUUFDZCxVQUFVO0FBQUEsUUFDVixXQUFXO0FBQUEsUUFDWCxhQUFhO0FBQUEsUUFDYixZQUFZO0FBQUEsUUFDWixlQUFlO0FBQUEsUUFDZix3QkFBd0I7QUFBQSxRQUN4QixZQUFZO0FBQUEsUUFDWixnQkFBZ0I7QUFBQSxRQUNoQixxQkFBcUI7QUFBQSxRQUNyQixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixvQkFBb0I7QUFBQSxNQUNyQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLG1CQUFtQixJQUFJLHFCQUFxQjtBQUNsRCxRQUFJLDZCQUE2QjtBQUNqQyxVQUFNLFlBQVksSUFBSSxnQ0FBZ0MsTUFBTSw0QkFBNEIsZ0JBQWdCO0FBQ3hHLFVBQU0sZUFBNEM7QUFBQSxNQUNqRCxXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixZQUFZLENBQUM7QUFBQSxRQUNiLFNBQVMsQ0FBQztBQUFBLE1BQ1g7QUFBQSxJQUNEO0FBRUEsY0FBVSxRQUFRLFlBQVk7QUFDOUIsaUNBQTZCO0FBQzdCLGNBQVUsUUFBUSxZQUFZO0FBRTlCLFdBQU8sZ0JBQWdCLGlCQUFpQixRQUFRLENBQUM7QUFBQSxNQUNoRCxXQUFXO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTCxZQUFZO0FBQUEsUUFDWixlQUFlO0FBQUEsUUFDZix3QkFBd0I7QUFBQSxRQUN4QixZQUFZO0FBQUEsUUFDWixnQkFBZ0I7QUFBQSxRQUNoQixxQkFBcUI7QUFBQSxRQUNyQixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
