import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { AgentsWindowOpenSource } from "../../../../../platform/window/common/window.js";
import { TestLifecycleService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { ShutdownReason } from "../../../../../workbench/services/lifecycle/common/lifecycle.js";
import { FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS, SessionsWindowOpenTelemetry } from "../../browser/sessionsWindowOpenTelemetry.js";
class TestTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName, data) {
    if (eventName) {
      this.events.push({ name: eventName, data });
    }
  }
}
suite("SessionsWindowOpenTelemetry", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("emits captured initial state and close duration for a quick close", async () => {
    await runWithFakedTimers({ useFakeTimers: true, startTime: 1e4 }, async () => {
      const lifecycleService = disposables.add(new TestLifecycleService());
      const telemetryService = new TestTelemetryService();
      let workspacePreselected = true;
      const tracker = disposables.add(new SessionsWindowOpenTelemetry(
        AgentsWindowOpenSource.TitleBar,
        () => true,
        () => ({ workspacePreselected }),
        telemetryService,
        lifecycleService
      ));
      tracker.captureInitialViewState();
      workspacePreselected = false;
      await timeout(4e3);
      lifecycleService.fireShutdown(ShutdownReason.CLOSE);
      assert.deepStrictEqual(telemetryService.events, [{
        name: "agents/firstTimeWindowOpen",
        data: {
          source: "titleBar",
          signInDialogShown: true,
          workspacePreselected: true,
          windowCloseDurationMs: 4e3
        }
      }]);
      tracker.dispose();
      lifecycleService.dispose();
    });
  });
  test("emits once after three minutes without a close duration", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const lifecycleService = disposables.add(new TestLifecycleService());
      const telemetryService = new TestTelemetryService();
      const tracker = disposables.add(new SessionsWindowOpenTelemetry(
        AgentsWindowOpenSource.CommandPalette,
        () => false,
        () => ({ workspacePreselected: void 0 }),
        telemetryService,
        lifecycleService
      ));
      await timeout(FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS);
      lifecycleService.fireShutdown(ShutdownReason.CLOSE);
      assert.deepStrictEqual(telemetryService.events, [{
        name: "agents/firstTimeWindowOpen",
        data: {
          source: "commandPalette",
          signInDialogShown: false,
          workspacePreselected: void 0,
          windowCloseDurationMs: void 0
        }
      }]);
      tracker.dispose();
      lifecycleService.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvdGVzdC9icm93c2VyL3Nlc3Npb25zV2luZG93T3BlblRlbGVtZXRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBUZXN0TGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgU2h1dGRvd25SZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRklSU1RfVElNRV9XSU5ET1dfT1BFTl9EVVJBVElPTl9MSU1JVF9NUywgU2Vzc2lvbnNXaW5kb3dPcGVuVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uc1dpbmRvd09wZW5UZWxlbWV0cnkuanMnO1xuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBldmVudHM6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHB1YmxpY0xvZzIoZXZlbnROYW1lPzogc3RyaW5nLCBkYXRhPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmIChldmVudE5hbWUpIHtcblx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG59XG5cbnN1aXRlKCdTZXNzaW9uc1dpbmRvd09wZW5UZWxlbWV0cnknLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbWl0cyBjYXB0dXJlZCBpbml0aWFsIHN0YXRlIGFuZCBjbG9zZSBkdXJhdGlvbiBmb3IgYSBxdWljayBjbG9zZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBzdGFydFRpbWU6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaWZlY3ljbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRcdGxldCB3b3Jrc3BhY2VQcmVzZWxlY3RlZCA9IHRydWU7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uc1dpbmRvd09wZW5UZWxlbWV0cnkoXG5cdFx0XHRcdEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuVGl0bGVCYXIsXG5cdFx0XHRcdCgpID0+IHRydWUsXG5cdFx0XHRcdCgpID0+ICh7IHdvcmtzcGFjZVByZXNlbGVjdGVkIH0pLFxuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cblx0XHRcdHRyYWNrZXIuY2FwdHVyZUluaXRpYWxWaWV3U3RhdGUoKTtcblx0XHRcdHdvcmtzcGFjZVByZXNlbGVjdGVkID0gZmFsc2U7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDRfMDAwKTtcblx0XHRcdGxpZmVjeWNsZVNlcnZpY2UuZmlyZVNodXRkb3duKFNodXRkb3duUmVhc29uLkNMT1NFKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cywgW3tcblx0XHRcdFx0bmFtZTogJ2FnZW50cy9maXJzdFRpbWVXaW5kb3dPcGVuJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHNvdXJjZTogJ3RpdGxlQmFyJyxcblx0XHRcdFx0XHRzaWduSW5EaWFsb2dTaG93bjogdHJ1ZSxcblx0XHRcdFx0XHR3b3Jrc3BhY2VQcmVzZWxlY3RlZDogdHJ1ZSxcblx0XHRcdFx0XHR3aW5kb3dDbG9zZUR1cmF0aW9uTXM6IDRfMDAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pO1xuXHRcdFx0dHJhY2tlci5kaXNwb3NlKCk7XG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgb25jZSBhZnRlciB0aHJlZSBtaW51dGVzIHdpdGhvdXQgYSBjbG9zZSBkdXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpZmVjeWNsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgdHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbnNXaW5kb3dPcGVuVGVsZW1ldHJ5KFxuXHRcdFx0XHRBZ2VudHNXaW5kb3dPcGVuU291cmNlLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHQoKSA9PiBmYWxzZSxcblx0XHRcdFx0KCkgPT4gKHsgd29ya3NwYWNlUHJlc2VsZWN0ZWQ6IHVuZGVmaW5lZCB9KSxcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdFx0bGlmZWN5Y2xlU2VydmljZSxcblx0XHRcdCkpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KEZJUlNUX1RJTUVfV0lORE9XX09QRU5fRFVSQVRJT05fTElNSVRfTVMpO1xuXHRcdFx0bGlmZWN5Y2xlU2VydmljZS5maXJlU2h1dGRvd24oU2h1dGRvd25SZWFzb24uQ0xPU0UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbe1xuXHRcdFx0XHRuYW1lOiAnYWdlbnRzL2ZpcnN0VGltZVdpbmRvd09wZW4nLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0c291cmNlOiAnY29tbWFuZFBhbGV0dGUnLFxuXHRcdFx0XHRcdHNpZ25JbkRpYWxvZ1Nob3duOiBmYWxzZSxcblx0XHRcdFx0XHR3b3Jrc3BhY2VQcmVzZWxlY3RlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHdpbmRvd0Nsb3NlRHVyYXRpb25NczogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pO1xuXHRcdFx0dHJhY2tlci5kaXNwb3NlKCk7XG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQ0FBMEMsbUNBQW1DO0FBRXRGLE1BQU0sNkJBQTZCLDBCQUEwQjtBQUFBLEVBQTdEO0FBQUE7QUFDQyxTQUFTLFNBQThELENBQUM7QUFBQTtBQUFBLEVBRS9ELFdBQVcsV0FBb0IsTUFBc0I7QUFDN0QsUUFBSSxXQUFXO0FBQ2QsV0FBSyxPQUFPLEtBQUssRUFBRSxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLCtCQUErQixNQUFNO0FBRTFDLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsT0FBSyxxRUFBcUUsWUFBWTtBQUNyRixVQUFNLG1CQUFtQixFQUFFLGVBQWUsTUFBTSxXQUFXLElBQU8sR0FBRyxZQUFZO0FBQ2hGLFlBQU0sbUJBQW1CLFlBQVksSUFBSSxJQUFJLHFCQUFxQixDQUFDO0FBQ25FLFlBQU0sbUJBQW1CLElBQUkscUJBQXFCO0FBQ2xELFVBQUksdUJBQXVCO0FBQzNCLFlBQU0sVUFBVSxZQUFZLElBQUksSUFBSTtBQUFBLFFBQ25DLHVCQUF1QjtBQUFBLFFBQ3ZCLE1BQU07QUFBQSxRQUNOLE9BQU8sRUFBRSxxQkFBcUI7QUFBQSxRQUM5QjtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxjQUFRLHdCQUF3QjtBQUNoQyw2QkFBdUI7QUFDdkIsWUFBTSxRQUFRLEdBQUs7QUFDbkIsdUJBQWlCLGFBQWEsZUFBZSxLQUFLO0FBRWxELGFBQU8sZ0JBQWdCLGlCQUFpQixRQUFRLENBQUM7QUFBQSxRQUNoRCxNQUFNO0FBQUEsUUFDTixNQUFNO0FBQUEsVUFDTCxRQUFRO0FBQUEsVUFDUixtQkFBbUI7QUFBQSxVQUNuQixzQkFBc0I7QUFBQSxVQUN0Qix1QkFBdUI7QUFBQSxRQUN4QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQ0YsY0FBUSxRQUFRO0FBQ2hCLHVCQUFpQixRQUFRO0FBQUEsSUFDMUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkRBQTJELFlBQVk7QUFDM0UsVUFBTSxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxZQUFZO0FBQzdELFlBQU0sbUJBQW1CLFlBQVksSUFBSSxJQUFJLHFCQUFxQixDQUFDO0FBQ25FLFlBQU0sbUJBQW1CLElBQUkscUJBQXFCO0FBQ2xELFlBQU0sVUFBVSxZQUFZLElBQUksSUFBSTtBQUFBLFFBQ25DLHVCQUF1QjtBQUFBLFFBQ3ZCLE1BQU07QUFBQSxRQUNOLE9BQU8sRUFBRSxzQkFBc0IsT0FBVTtBQUFBLFFBQ3pDO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU0sUUFBUSx3Q0FBd0M7QUFDdEQsdUJBQWlCLGFBQWEsZUFBZSxLQUFLO0FBRWxELGFBQU8sZ0JBQWdCLGlCQUFpQixRQUFRLENBQUM7QUFBQSxRQUNoRCxNQUFNO0FBQUEsUUFDTixNQUFNO0FBQUEsVUFDTCxRQUFRO0FBQUEsVUFDUixtQkFBbUI7QUFBQSxVQUNuQixzQkFBc0I7QUFBQSxVQUN0Qix1QkFBdUI7QUFBQSxRQUN4QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQ0YsY0FBUSxRQUFRO0FBQ2hCLHVCQUFpQixRQUFRO0FBQUEsSUFDMUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
