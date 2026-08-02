import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { quickInputButtonToAction, quickInputButtonsToActionArrays } from "../../browser/quickInputUtils.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("QuickInputUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("quickInputButtonToAction", () => {
    test("should convert simple button to action", () => {
      const button = {
        iconPath: { dark: URI.file("/path/to/icon.svg") },
        tooltip: "Test Tooltip"
      };
      let runCalled = false;
      const action = quickInputButtonToAction(button, "test-id", () => {
        runCalled = true;
      });
      assert.strictEqual(action.id, "test-id");
      assert.strictEqual(action.tooltip, "Test Tooltip");
      assert.strictEqual(action.enabled, true);
      assert.ok(action.class);
      action.run();
      assert.strictEqual(runCalled, true);
    });
    test("should handle button with iconClass", () => {
      const button = {
        iconClass: "custom-icon-class",
        tooltip: "Test"
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.ok(action.class?.includes("custom-icon-class"));
    });
    test("should handle alwaysVisible button", () => {
      const button = {
        iconClass: "icon-class",
        tooltip: "Test",
        alwaysVisible: true
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.ok(action.class?.includes("always-visible"));
      assert.ok(action.class?.includes("icon-class"));
    });
    test("should handle alwaysVisible without iconClass", () => {
      const button = {
        tooltip: "Test",
        alwaysVisible: true
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.strictEqual(action.class, "always-visible");
    });
    test("should handle toggle button", () => {
      const toggle = {
        checked: false
      };
      const button = {
        iconClass: "toggle-icon",
        tooltip: "Toggle Test",
        toggle
      };
      let runCalled = false;
      const action = quickInputButtonToAction(button, "toggle-id", () => {
        runCalled = true;
      });
      assert.strictEqual(action.id, "toggle-id");
      assert.strictEqual(action.label, "Toggle Test");
      assert.strictEqual(action.tooltip, "");
      assert.notStrictEqual(action.checked, void 0);
      assert.strictEqual(action.checked, false);
      assert.strictEqual(toggle.checked, false);
      action.run();
      assert.strictEqual(runCalled, true);
      assert.strictEqual(action.checked, true);
      assert.strictEqual(toggle.checked, true);
    });
    test("should handle toggle button with initial checked state", () => {
      const toggle = {
        checked: true
      };
      const button = {
        iconClass: "toggle-icon",
        tooltip: "Toggle Test",
        toggle
      };
      const action = quickInputButtonToAction(button, "toggle-id", () => {
      });
      assert.strictEqual(action.checked, true);
      assert.strictEqual(toggle.checked, true);
      action.run();
      assert.strictEqual(action.checked, false);
      assert.strictEqual(toggle.checked, false);
    });
    test("should use empty string for tooltip when not provided", () => {
      const button = {
        iconClass: "icon"
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.strictEqual(action.tooltip, "");
    });
    test("should handle button with label", () => {
      const button = {
        iconClass: "icon",
        tooltip: "Test",
        label: "Button Label"
      };
      const action = quickInputButtonToAction(button, "test-id", () => {
      });
      assert.strictEqual(action.label, "");
    });
  });
  suite("quickInputButtonsToActionArrays", () => {
    test("should convert empty array", () => {
      const buttons = [];
      const result = quickInputButtonsToActionArrays(buttons, "prefix", () => {
      });
      assert.strictEqual(result.primary.length, 0);
      assert.strictEqual(result.secondary.length, 0);
    });
    test("should convert primary buttons", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Button 1" },
        { iconClass: "icon2", tooltip: "Button 2" }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      assert.strictEqual(result.primary.length, 2);
      assert.strictEqual(result.secondary.length, 0);
      assert.strictEqual(result.primary[0].id, "test-0");
      assert.strictEqual(result.primary[1].id, "test-1");
    });
    test("should convert secondary buttons", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Button 1", secondary: true },
        { iconClass: "icon2", tooltip: "Button 2", secondary: true }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      assert.strictEqual(result.primary.length, 0);
      assert.strictEqual(result.secondary.length, 2);
      assert.strictEqual(result.secondary[0].id, "test-0");
      assert.strictEqual(result.secondary[1].id, "test-1");
    });
    test("should convert mixed primary and secondary buttons", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Primary 1" },
        { iconClass: "icon2", tooltip: "Secondary 1", secondary: true },
        { iconClass: "icon3", tooltip: "Primary 2" },
        { iconClass: "icon4", tooltip: "Secondary 2", secondary: true }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      assert.strictEqual(result.primary.length, 2);
      assert.strictEqual(result.secondary.length, 2);
      assert.strictEqual(result.primary[0].id, "test-0");
      assert.strictEqual(result.primary[1].id, "test-2");
      assert.strictEqual(result.secondary[0].id, "test-1");
      assert.strictEqual(result.secondary[1].id, "test-3");
    });
    test("should apply label to actions", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Button 1", label: "Label 1" },
        { iconClass: "icon2", tooltip: "Button 2" }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      assert.strictEqual(result.primary[0].label, "Label 1");
      assert.strictEqual(result.primary[1].label, "");
    });
    test("should trigger callback with correct button", () => {
      const button1 = { iconClass: "icon1", tooltip: "Button 1" };
      const button2 = { iconClass: "icon2", tooltip: "Button 2" };
      const buttons = [button1, button2];
      const triggeredButtons = [];
      const result = quickInputButtonsToActionArrays(buttons, "test", (button) => {
        triggeredButtons.push(button);
      });
      result.primary[0].run();
      assert.strictEqual(triggeredButtons.length, 1);
      assert.strictEqual(triggeredButtons[0], button1);
      result.primary[1].run();
      assert.strictEqual(triggeredButtons.length, 2);
      assert.strictEqual(triggeredButtons[1], button2);
    });
    test("should handle toggle buttons in arrays", () => {
      const toggle = { checked: false };
      const buttons = [
        { iconClass: "icon1", tooltip: "Toggle", toggle },
        { iconClass: "icon2", tooltip: "Regular" }
      ];
      const result = quickInputButtonsToActionArrays(buttons, "test", () => {
      });
      const toggleAction = result.primary[0];
      assert.strictEqual(toggleAction.checked, false);
      toggleAction.run();
      assert.strictEqual(toggleAction.checked, true);
      assert.strictEqual(toggle.checked, true);
    });
    test("should use correct id prefix", () => {
      const buttons = [
        { iconClass: "icon1", tooltip: "Button 1" }
      ];
      const result1 = quickInputButtonsToActionArrays(buttons, "custom-prefix", () => {
      });
      assert.strictEqual(result1.primary[0].id, "custom-prefix-0");
      const result2 = quickInputButtonsToActionArrays(buttons, "another", () => {
      });
      assert.strictEqual(result2.primary[0].id, "another-0");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3F1aWNraW5wdXQvdGVzdC9icm93c2VyL3F1aWNrSW5wdXRVdGlscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgcXVpY2tJbnB1dEJ1dHRvblRvQWN0aW9uLCBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9xdWlja0lucHV0VXRpbHMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdRdWlja0lucHV0VXRpbHMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdxdWlja0lucHV0QnV0dG9uVG9BY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGNvbnZlcnQgc2ltcGxlIGJ1dHRvbiB0byBhY3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdFx0XHRpY29uUGF0aDogeyBkYXJrOiBVUkkuZmlsZSgnL3BhdGgvdG8vaWNvbi5zdmcnKSB9LFxuXHRcdFx0XHR0b29sdGlwOiAnVGVzdCBUb29sdGlwJ1xuXHRcdFx0fTtcblxuXHRcdFx0bGV0IHJ1bkNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gcXVpY2tJbnB1dEJ1dHRvblRvQWN0aW9uKGJ1dHRvbiwgJ3Rlc3QtaWQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1bkNhbGxlZCA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5pZCwgJ3Rlc3QtaWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24udG9vbHRpcCwgJ1Rlc3QgVG9vbHRpcCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5lbmFibGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayhhY3Rpb24uY2xhc3MpO1xuXG5cdFx0XHRhY3Rpb24ucnVuKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuQ2FsbGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYnV0dG9uIHdpdGggaWNvbkNsYXNzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRcdFx0aWNvbkNsYXNzOiAnY3VzdG9tLWljb24tY2xhc3MnLFxuXHRcdFx0XHR0b29sdGlwOiAnVGVzdCdcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHF1aWNrSW5wdXRCdXR0b25Ub0FjdGlvbihidXR0b24sICd0ZXN0LWlkJywgKCkgPT4geyB9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbi5jbGFzcz8uaW5jbHVkZXMoJ2N1c3RvbS1pY29uLWNsYXNzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBhbHdheXNWaXNpYmxlIGJ1dHRvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0XHRcdGljb25DbGFzczogJ2ljb24tY2xhc3MnLFxuXHRcdFx0XHR0b29sdGlwOiAnVGVzdCcsXG5cdFx0XHRcdGFsd2F5c1Zpc2libGU6IHRydWVcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHF1aWNrSW5wdXRCdXR0b25Ub0FjdGlvbihidXR0b24sICd0ZXN0LWlkJywgKCkgPT4geyB9KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbi5jbGFzcz8uaW5jbHVkZXMoJ2Fsd2F5cy12aXNpYmxlJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbi5jbGFzcz8uaW5jbHVkZXMoJ2ljb24tY2xhc3MnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGFsd2F5c1Zpc2libGUgd2l0aG91dCBpY29uQ2xhc3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b246IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHRcdFx0XHR0b29sdGlwOiAnVGVzdCcsXG5cdFx0XHRcdGFsd2F5c1Zpc2libGU6IHRydWVcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHF1aWNrSW5wdXRCdXR0b25Ub0FjdGlvbihidXR0b24sICd0ZXN0LWlkJywgKCkgPT4geyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5jbGFzcywgJ2Fsd2F5cy12aXNpYmxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHRvZ2dsZSBidXR0b24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b2dnbGUgPSB7XG5cdFx0XHRcdGNoZWNrZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRcdFx0aWNvbkNsYXNzOiAndG9nZ2xlLWljb24nLFxuXHRcdFx0XHR0b29sdGlwOiAnVG9nZ2xlIFRlc3QnLFxuXHRcdFx0XHR0b2dnbGVcblx0XHRcdH07XG5cblx0XHRcdGxldCBydW5DYWxsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHF1aWNrSW5wdXRCdXR0b25Ub0FjdGlvbihidXR0b24sICd0b2dnbGUtaWQnLCAoKSA9PiB7XG5cdFx0XHRcdHJ1bkNhbGxlZCA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5pZCwgJ3RvZ2dsZS1pZCcpO1xuXHRcdFx0Ly8gRm9yIHRvZ2dsZSBidXR0b25zLCB0b29sdGlwIGlzIHVzZWQgYXMgbGFiZWxcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24ubGFiZWwsICdUb2dnbGUgVGVzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi50b29sdGlwLCAnJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYWN0aW9uLmNoZWNrZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRcdC8vIEluaXRpYWwgc3RhdGVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24uY2hlY2tlZCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvZ2dsZS5jaGVja2VkLCBmYWxzZSk7XG5cblx0XHRcdC8vIFJ1biB0aGUgYWN0aW9uXG5cdFx0XHRhY3Rpb24ucnVuKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuQ2FsbGVkLCB0cnVlKTtcblxuXHRcdFx0Ly8gVG9nZ2xlIHN0YXRlIHNob3VsZCBiZSBmbGlwcGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLmNoZWNrZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvZ2dsZS5jaGVja2VkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgdG9nZ2xlIGJ1dHRvbiB3aXRoIGluaXRpYWwgY2hlY2tlZCBzdGF0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvZ2dsZSA9IHtcblx0XHRcdFx0Y2hlY2tlZDogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0XHRcdGljb25DbGFzczogJ3RvZ2dsZS1pY29uJyxcblx0XHRcdFx0dG9vbHRpcDogJ1RvZ2dsZSBUZXN0Jyxcblx0XHRcdFx0dG9nZ2xlXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBhY3Rpb24gPSBxdWlja0lucHV0QnV0dG9uVG9BY3Rpb24oYnV0dG9uLCAndG9nZ2xlLWlkJywgKCkgPT4geyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5jaGVja2VkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2dnbGUuY2hlY2tlZCwgdHJ1ZSk7XG5cblx0XHRcdC8vIFJ1biBzaG91bGQgZmxpcCB0aGUgc3RhdGVcblx0XHRcdGFjdGlvbi5ydW4oKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5jaGVja2VkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9nZ2xlLmNoZWNrZWQsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZW1wdHkgc3RyaW5nIGZvciB0b29sdGlwIHdoZW4gbm90IHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRcdFx0aWNvbkNsYXNzOiAnaWNvbidcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHF1aWNrSW5wdXRCdXR0b25Ub0FjdGlvbihidXR0b24sICd0ZXN0LWlkJywgKCkgPT4geyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi50b29sdGlwLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGJ1dHRvbiB3aXRoIGxhYmVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRcdFx0aWNvbkNsYXNzOiAnaWNvbicsXG5cdFx0XHRcdHRvb2x0aXA6ICdUZXN0Jyxcblx0XHRcdFx0bGFiZWw6ICdCdXR0b24gTGFiZWwnXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBhY3Rpb24gPSBxdWlja0lucHV0QnV0dG9uVG9BY3Rpb24oYnV0dG9uLCAndGVzdC1pZCcsICgpID0+IHsgfSk7XG5cblx0XHRcdC8vIFRoZSBsYWJlbCBwcm9wZXJ0eSBleGlzdHMgb24gdGhlIGJ1dHRvbiBidXQgdGhlIGFjdGlvbidzIGxhYmVsIGlzIGluaXRpYWxseSBlbXB0eVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi5sYWJlbCwgJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncXVpY2tJbnB1dEJ1dHRvbnNUb0FjdGlvbkFycmF5cycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBlbXB0eSBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcXVpY2tJbnB1dEJ1dHRvbnNUb0FjdGlvbkFycmF5cyhidXR0b25zLCAncHJlZml4JywgKCkgPT4geyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wcmltYXJ5Lmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlY29uZGFyeS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNvbnZlcnQgcHJpbWFyeSBidXR0b25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMScsIHRvb2x0aXA6ICdCdXR0b24gMScgfSxcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMicsIHRvb2x0aXA6ICdCdXR0b24gMicgfVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcXVpY2tJbnB1dEJ1dHRvbnNUb0FjdGlvbkFycmF5cyhidXR0b25zLCAndGVzdCcsICgpID0+IHsgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJpbWFyeS5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZWNvbmRhcnkubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJpbWFyeVswXS5pZCwgJ3Rlc3QtMCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wcmltYXJ5WzFdLmlkLCAndGVzdC0xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBzZWNvbmRhcnkgYnV0dG9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXG5cdFx0XHRcdHsgaWNvbkNsYXNzOiAnaWNvbjEnLCB0b29sdGlwOiAnQnV0dG9uIDEnLCBzZWNvbmRhcnk6IHRydWUgfSxcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMicsIHRvb2x0aXA6ICdCdXR0b24gMicsIHNlY29uZGFyeTogdHJ1ZSB9XG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKGJ1dHRvbnMsICd0ZXN0JywgKCkgPT4geyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wcmltYXJ5Lmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlY29uZGFyeS5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZWNvbmRhcnlbMF0uaWQsICd0ZXN0LTAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2Vjb25kYXJ5WzFdLmlkLCAndGVzdC0xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29udmVydCBtaXhlZCBwcmltYXJ5IGFuZCBzZWNvbmRhcnkgYnV0dG9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXG5cdFx0XHRcdHsgaWNvbkNsYXNzOiAnaWNvbjEnLCB0b29sdGlwOiAnUHJpbWFyeSAxJyB9LFxuXHRcdFx0XHR7IGljb25DbGFzczogJ2ljb24yJywgdG9vbHRpcDogJ1NlY29uZGFyeSAxJywgc2Vjb25kYXJ5OiB0cnVlIH0sXG5cdFx0XHRcdHsgaWNvbkNsYXNzOiAnaWNvbjMnLCB0b29sdGlwOiAnUHJpbWFyeSAyJyB9LFxuXHRcdFx0XHR7IGljb25DbGFzczogJ2ljb240JywgdG9vbHRpcDogJ1NlY29uZGFyeSAyJywgc2Vjb25kYXJ5OiB0cnVlIH1cblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoYnV0dG9ucywgJ3Rlc3QnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByaW1hcnkubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2Vjb25kYXJ5Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByaW1hcnlbMF0uaWQsICd0ZXN0LTAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucHJpbWFyeVsxXS5pZCwgJ3Rlc3QtMicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZWNvbmRhcnlbMF0uaWQsICd0ZXN0LTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2Vjb25kYXJ5WzFdLmlkLCAndGVzdC0zJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXBwbHkgbGFiZWwgdG8gYWN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXG5cdFx0XHRcdHsgaWNvbkNsYXNzOiAnaWNvbjEnLCB0b29sdGlwOiAnQnV0dG9uIDEnLCBsYWJlbDogJ0xhYmVsIDEnIH0sXG5cdFx0XHRcdHsgaWNvbkNsYXNzOiAnaWNvbjInLCB0b29sdGlwOiAnQnV0dG9uIDInIH1cblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoYnV0dG9ucywgJ3Rlc3QnLCAoKSA9PiB7IH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByaW1hcnlbMF0ubGFiZWwsICdMYWJlbCAxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByaW1hcnlbMV0ubGFiZWwsICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0cmlnZ2VyIGNhbGxiYWNrIHdpdGggY29ycmVjdCBidXR0b24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b24xOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHsgaWNvbkNsYXNzOiAnaWNvbjEnLCB0b29sdGlwOiAnQnV0dG9uIDEnIH07XG5cdFx0XHRjb25zdCBidXR0b24yOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHsgaWNvbkNsYXNzOiAnaWNvbjInLCB0b29sdGlwOiAnQnV0dG9uIDInIH07XG5cdFx0XHRjb25zdCBidXR0b25zID0gW2J1dHRvbjEsIGJ1dHRvbjJdO1xuXG5cdFx0XHRjb25zdCB0cmlnZ2VyZWRCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cdFx0XHRjb25zdCByZXN1bHQgPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKGJ1dHRvbnMsICd0ZXN0JywgKGJ1dHRvbikgPT4ge1xuXHRcdFx0XHR0cmlnZ2VyZWRCdXR0b25zLnB1c2goYnV0dG9uKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXN1bHQucHJpbWFyeVswXS5ydW4oKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmlnZ2VyZWRCdXR0b25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJpZ2dlcmVkQnV0dG9uc1swXSwgYnV0dG9uMSk7XG5cblx0XHRcdHJlc3VsdC5wcmltYXJ5WzFdLnJ1bigpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyaWdnZXJlZEJ1dHRvbnMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmlnZ2VyZWRCdXR0b25zWzFdLCBidXR0b24yKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgdG9nZ2xlIGJ1dHRvbnMgaW4gYXJyYXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9nZ2xlID0geyBjaGVja2VkOiBmYWxzZSB9O1xuXHRcdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMScsIHRvb2x0aXA6ICdUb2dnbGUnLCB0b2dnbGUgfSxcblx0XHRcdFx0eyBpY29uQ2xhc3M6ICdpY29uMicsIHRvb2x0aXA6ICdSZWd1bGFyJyB9XG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKGJ1dHRvbnMsICd0ZXN0JywgKCkgPT4geyB9KTtcblxuXHRcdFx0Y29uc3QgdG9nZ2xlQWN0aW9uID0gcmVzdWx0LnByaW1hcnlbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9nZ2xlQWN0aW9uLmNoZWNrZWQsIGZhbHNlKTtcblx0XHRcdHRvZ2dsZUFjdGlvbi5ydW4oKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2dnbGVBY3Rpb24uY2hlY2tlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9nZ2xlLmNoZWNrZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBjb3JyZWN0IGlkIHByZWZpeCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXG5cdFx0XHRcdHsgaWNvbkNsYXNzOiAnaWNvbjEnLCB0b29sdGlwOiAnQnV0dG9uIDEnIH1cblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKGJ1dHRvbnMsICdjdXN0b20tcHJlZml4JywgKCkgPT4geyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLnByaW1hcnlbMF0uaWQsICdjdXN0b20tcHJlZml4LTAnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MiA9IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMoYnV0dG9ucywgJ2Fub3RoZXInLCAoKSA9PiB7IH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDIucHJpbWFyeVswXS5pZCwgJ2Fub3RoZXItMCcpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUVwQixTQUFTLDBCQUEwQix1Q0FBdUM7QUFDMUUsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxtQkFBbUIsTUFBTTtBQUM5QiwwQ0FBd0M7QUFFeEMsUUFBTSw0QkFBNEIsTUFBTTtBQUN2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
