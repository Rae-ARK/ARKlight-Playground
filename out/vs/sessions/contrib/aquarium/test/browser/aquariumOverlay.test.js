import assert from "assert";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestAccessibilityService } from "../../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { InMemoryStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { AquariumService, SESSIONS_DEVELOPER_JOY_ENABLED_SETTING } from "../../browser/aquariumOverlay.js";
suite("AquariumService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("persists and applies aquarium action visibility to mounted buttons", () => {
    const mainContainer = document.createElement("div");
    const toggleContainer = document.createElement("div");
    document.body.append(mainContainer, toggleContainer);
    store.add(toDisposable(() => {
      mainContainer.remove();
      toggleContainer.remove();
    }));
    const storageService = store.add(new InMemoryStorageService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.mainContainer = mainContainer;
      }
    }();
    const hoverService = new class extends mock() {
      setupManagedHover() {
        return {
          dispose() {
          },
          show() {
          },
          hide() {
          },
          update() {
          }
        };
      }
    }();
    const configurationService = new TestConfigurationService({ [SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: true });
    store.add(configurationService.onDidChangeConfigurationEmitter);
    const service = store.add(new AquariumService(
      layoutService,
      new MockContextKeyService(),
      hoverService,
      storageService,
      configurationService,
      new TestAccessibilityService(),
      new NullTelemetryServiceShape()
    ));
    store.add(service.mountToggle(toggleContainer));
    const button = toggleContainer.querySelector(".agents-aquarium-toggle");
    const initial = {
      visible: service.actionVisible.get(),
      display: button?.style.display
    };
    const hidden = service.toggleActionVisibility();
    const afterHide = {
      visible: service.actionVisible.get(),
      display: button?.style.display,
      stored: storageService.getBoolean("sessions.aquarium.action.visible", StorageScope.APPLICATION)
    };
    const shown = service.toggleActionVisibility();
    const afterShow = {
      visible: service.actionVisible.get(),
      display: button?.style.display
    };
    assert.deepStrictEqual({
      initial,
      hidden,
      afterHide,
      shown,
      afterShow
    }, {
      initial: { visible: true, display: "" },
      hidden: false,
      afterHide: { visible: false, display: "none", stored: false },
      shown: true,
      afterShow: { visible: true, display: "" }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXF1YXJpdW0vdGVzdC9icm93c2VyL2FxdWFyaXVtT3ZlcmxheS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvdGVzdC9jb21tb24vdGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBcXVhcml1bVNlcnZpY2UsIFNFU1NJT05TX0RFVkVMT1BFUl9KT1lfRU5BQkxFRF9TRVRUSU5HIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hcXVhcml1bU92ZXJsYXkuanMnO1xuXG5zdWl0ZSgnQXF1YXJpdW1TZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIGFuZCBhcHBsaWVzIGFxdWFyaXVtIGFjdGlvbiB2aXNpYmlsaXR5IHRvIG1vdW50ZWQgYnV0dG9ucycsICgpID0+IHtcblx0XHRjb25zdCBtYWluQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3QgdG9nZ2xlQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmQobWFpbkNvbnRhaW5lciwgdG9nZ2xlQ29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdG1haW5Db250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHR0b2dnbGVDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbWFpbkNvbnRhaW5lciA9IG1haW5Db250YWluZXI7XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGhvdmVyU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUhvdmVyU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBzZXR1cE1hbmFnZWRIb3ZlcigpOiBJTWFuYWdlZEhvdmVyIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRkaXNwb3NlKCkgeyB9LFxuXHRcdFx0XHRcdHNob3coKSB7IH0sXG5cdFx0XHRcdFx0aGlkZSgpIHsgfSxcblx0XHRcdFx0XHR1cGRhdGUoKSB7IH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IFtTRVNTSU9OU19ERVZFTE9QRVJfSk9ZX0VOQUJMRURfU0VUVElOR106IHRydWUgfSk7XG5cdFx0c3RvcmUuYWRkKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEFxdWFyaXVtU2VydmljZShcblx0XHRcdGxheW91dFNlcnZpY2UsXG5cdFx0XHRuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCksXG5cdFx0XHRob3ZlclNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0bmV3IFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUoKSxcblx0XHQpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5tb3VudFRvZ2dsZSh0b2dnbGVDb250YWluZXIpKTtcblx0XHRjb25zdCBidXR0b24gPSB0b2dnbGVDb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5hZ2VudHMtYXF1YXJpdW0tdG9nZ2xlJyk7XG5cblx0XHRjb25zdCBpbml0aWFsID0ge1xuXHRcdFx0dmlzaWJsZTogc2VydmljZS5hY3Rpb25WaXNpYmxlLmdldCgpLFxuXHRcdFx0ZGlzcGxheTogYnV0dG9uPy5zdHlsZS5kaXNwbGF5LFxuXHRcdH07XG5cdFx0Y29uc3QgaGlkZGVuID0gc2VydmljZS50b2dnbGVBY3Rpb25WaXNpYmlsaXR5KCk7XG5cdFx0Y29uc3QgYWZ0ZXJIaWRlID0ge1xuXHRcdFx0dmlzaWJsZTogc2VydmljZS5hY3Rpb25WaXNpYmxlLmdldCgpLFxuXHRcdFx0ZGlzcGxheTogYnV0dG9uPy5zdHlsZS5kaXNwbGF5LFxuXHRcdFx0c3RvcmVkOiBzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdzZXNzaW9ucy5hcXVhcml1bS5hY3Rpb24udmlzaWJsZScsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiksXG5cdFx0fTtcblx0XHRjb25zdCBzaG93biA9IHNlcnZpY2UudG9nZ2xlQWN0aW9uVmlzaWJpbGl0eSgpO1xuXHRcdGNvbnN0IGFmdGVyU2hvdyA9IHtcblx0XHRcdHZpc2libGU6IHNlcnZpY2UuYWN0aW9uVmlzaWJsZS5nZXQoKSxcblx0XHRcdGRpc3BsYXk6IGJ1dHRvbj8uc3R5bGUuZGlzcGxheSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbml0aWFsLFxuXHRcdFx0aGlkZGVuLFxuXHRcdFx0YWZ0ZXJIaWRlLFxuXHRcdFx0c2hvd24sXG5cdFx0XHRhZnRlclNob3csXG5cdFx0fSwge1xuXHRcdFx0aW5pdGlhbDogeyB2aXNpYmxlOiB0cnVlLCBkaXNwbGF5OiAnJyB9LFxuXHRcdFx0aGlkZGVuOiBmYWxzZSxcblx0XHRcdGFmdGVySGlkZTogeyB2aXNpYmxlOiBmYWxzZSwgZGlzcGxheTogJ25vbmUnLCBzdG9yZWQ6IGZhbHNlIH0sXG5cdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdGFmdGVyU2hvdzogeyB2aXNpYmxlOiB0cnVlLCBkaXNwbGF5OiAnJyB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QixvQkFBb0I7QUFDckQsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyxpQkFBaUIsOENBQThDO0FBRXhFLE1BQU0sbUJBQW1CLE1BQU07QUFDOUIsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFVBQU0sZ0JBQWdCLFNBQVMsY0FBYyxLQUFLO0FBQ2xELFVBQU0sa0JBQWtCLFNBQVMsY0FBYyxLQUFLO0FBQ3BELGFBQVMsS0FBSyxPQUFPLGVBQWUsZUFBZTtBQUNuRCxVQUFNLElBQUksYUFBYSxNQUFNO0FBQzVCLG9CQUFjLE9BQU87QUFDckIsc0JBQWdCLE9BQU87QUFBQSxJQUN4QixDQUFDLENBQUM7QUFFRixVQUFNLGlCQUFpQixNQUFNLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUM3RCxVQUFNLGdCQUFnQixJQUFJLGNBQWMsS0FBOEIsRUFBRTtBQUFBLE1BQTlDO0FBQUE7QUFDekIsYUFBa0IsZ0JBQWdCO0FBQUE7QUFBQSxJQUNuQyxFQUFFO0FBQ0YsVUFBTSxlQUFlLElBQUksY0FBYyxLQUFvQixFQUFFO0FBQUEsTUFDbkQsb0JBQW1DO0FBQzNDLGVBQU87QUFBQSxVQUNOLFVBQVU7QUFBQSxVQUFFO0FBQUEsVUFDWixPQUFPO0FBQUEsVUFBRTtBQUFBLFVBQ1QsT0FBTztBQUFBLFVBQUU7QUFBQSxVQUNULFNBQVM7QUFBQSxVQUFFO0FBQUEsUUFDWjtBQUFBLE1BQ0Q7QUFBQSxJQUNELEVBQUU7QUFDRixVQUFNLHVCQUF1QixJQUFJLHlCQUF5QixFQUFFLENBQUMsc0NBQXNDLEdBQUcsS0FBSyxDQUFDO0FBQzVHLFVBQU0sSUFBSSxxQkFBcUIsK0JBQStCO0FBQzlELFVBQU0sVUFBVSxNQUFNLElBQUksSUFBSTtBQUFBLE1BQzdCO0FBQUEsTUFDQSxJQUFJLHNCQUFzQjtBQUFBLE1BQzFCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUkseUJBQXlCO0FBQUEsTUFDN0IsSUFBSSwwQkFBMEI7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxJQUFJLFFBQVEsWUFBWSxlQUFlLENBQUM7QUFDOUMsVUFBTSxTQUFTLGdCQUFnQixjQUFpQyx5QkFBeUI7QUFFekYsVUFBTSxVQUFVO0FBQUEsTUFDZixTQUFTLFFBQVEsY0FBYyxJQUFJO0FBQUEsTUFDbkMsU0FBUyxRQUFRLE1BQU07QUFBQSxJQUN4QjtBQUNBLFVBQU0sU0FBUyxRQUFRLHVCQUF1QjtBQUM5QyxVQUFNLFlBQVk7QUFBQSxNQUNqQixTQUFTLFFBQVEsY0FBYyxJQUFJO0FBQUEsTUFDbkMsU0FBUyxRQUFRLE1BQU07QUFBQSxNQUN2QixRQUFRLGVBQWUsV0FBVyxvQ0FBb0MsYUFBYSxXQUFXO0FBQUEsSUFDL0Y7QUFDQSxVQUFNLFFBQVEsUUFBUSx1QkFBdUI7QUFDN0MsVUFBTSxZQUFZO0FBQUEsTUFDakIsU0FBUyxRQUFRLGNBQWMsSUFBSTtBQUFBLE1BQ25DLFNBQVMsUUFBUSxNQUFNO0FBQUEsSUFDeEI7QUFFQSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsU0FBUyxFQUFFLFNBQVMsTUFBTSxTQUFTLEdBQUc7QUFBQSxNQUN0QyxRQUFRO0FBQUEsTUFDUixXQUFXLEVBQUUsU0FBUyxPQUFPLFNBQVMsUUFBUSxRQUFRLE1BQU07QUFBQSxNQUM1RCxPQUFPO0FBQUEsTUFDUCxXQUFXLEVBQUUsU0FBUyxNQUFNLFNBQVMsR0FBRztBQUFBLElBQ3pDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
