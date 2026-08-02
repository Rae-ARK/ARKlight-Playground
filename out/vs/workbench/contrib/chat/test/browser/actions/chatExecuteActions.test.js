import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../../platform/commands/common/commands.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { ChatSubmitAction, ExecuteHandoffActionId, GetHandoffsActionId, registerChatExecuteActions } from "../../../browser/actions/chatExecuteActions.js";
import { IChatModeService } from "../../../common/chatModes.js";
import { ChatModeKind } from "../../../common/constants.js";
import { Target } from "../../../common/promptSyntax/promptTypes.js";
import { MockChatWidgetService } from "../widget/mockChatWidget.js";
import { MockChatModeService } from "../../common/mockChatModeService.js";
async function runCommandAsync(handler, ...args) {
  return await handler(...args);
}
function createMockMode(overrides) {
  return {
    name: constObservable(overrides.id),
    label: constObservable(overrides.id),
    icon: constObservable(void 0),
    description: constObservable(void 0),
    isBuiltin: overrides.isBuiltin ?? false,
    target: constObservable(Target.Undefined),
    ...overrides
  };
}
suite("GetHandoffsAction", () => {
  const store = new DisposableStore();
  let instantiationService;
  let chatExecuteActions;
  suiteSetup(() => {
    chatExecuteActions = registerChatExecuteActions();
  });
  suiteTeardown(() => {
    chatExecuteActions.dispose();
  });
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should return all modes when no sourceCustomAgent is specified", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    const planMode = createMockMode({
      id: "plan",
      kind: ChatModeKind.Agent,
      handOffs: observableValue("handOffs", [
        { agent: "implement", label: "Start", prompt: "go" }
      ])
    });
    instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));
    const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].name, "ask");
    assert.strictEqual(result[0].handoffs.length, 0);
    assert.strictEqual(result[1].name, "plan");
    assert.strictEqual(result[1].handoffs.length, 1);
  });
  test("should filter by sourceCustomAgent (case-insensitive)", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    const planMode = createMockMode({
      id: "plan",
      kind: ChatModeKind.Agent,
      handOffs: observableValue("handOffs", [
        { agent: "implement", label: "Start", prompt: "go" }
      ])
    });
    instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [planMode] }));
    const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { sourceCustomAgent: "Plan" });
    assert.deepStrictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "plan");
    assert.strictEqual(result[0].handoffs.length, 1);
  });
  test("should return empty array for non-matching sourceCustomAgent", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    instantiationService.set(IChatModeService, new MockChatModeService({ builtin: [askMode], custom: [] }));
    const handler = CommandsRegistry.getCommand(GetHandoffsActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { sourceCustomAgent: "nonexistent" });
    assert.deepStrictEqual(result, []);
  });
});
suite("ExecuteHandoffAction", () => {
  const store = new DisposableStore();
  let instantiationService;
  let chatExecuteActions;
  suiteSetup(() => {
    chatExecuteActions = registerChatExecuteActions();
  });
  suiteTeardown(() => {
    chatExecuteActions.dispose();
  });
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  const testHandoffs = [
    { agent: "implement", label: "Start Implementation", prompt: "Implement the plan", send: true },
    { agent: "agent", label: "Open in Editor", prompt: "Open it" }
  ];
  const planMode = createMockMode({
    id: "plan",
    kind: ChatModeKind.Agent,
    handOffs: observableValue("handOffs", testHandoffs)
  });
  function createMockWidget(currentMode, chatModes) {
    const executeHandoffCalls = [];
    const widget = {
      input: {
        currentModeObs: constObservable(currentMode),
        currentChatModesObs: constObservable(chatModes)
      },
      executeHandoff: async (handoff) => {
        executeHandoffCalls.push(handoff);
      }
    };
    return { widget, executeHandoffCalls };
  }
  test("should return error when neither id nor label is provided", async () => {
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, {});
    assert.deepStrictEqual(result, { success: false, error: "Either id or label is required" });
  });
  test("should return error when no widget is found", async () => {
    instantiationService.set(IChatWidgetService, new MockChatWidgetService());
    instantiationService.set(IChatModeService, new MockChatModeService());
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "implement:start-implementation" });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("No chat widget found"));
  });
  test("should fall back to lastFocusedWidget when sessionResource is omitted", async () => {
    const chatModeService = new MockChatModeService();
    const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "implement:start-implementation" });
    assert.deepStrictEqual(result, { success: true, targetMode: "implement" });
    assert.strictEqual(executeHandoffCalls.length, 1);
    assert.strictEqual(executeHandoffCalls[0].label, "Start Implementation");
  });
  test("should resolve widget by sessionResource", async () => {
    const chatModeService = new MockChatModeService({ builtin: [], custom: [planMode] });
    const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const sessionUri = URI.parse("test://session/1");
    const mockWidgetService = new class extends MockChatWidgetService {
      getWidgetBySessionResource(resource) {
        return resource.toString() === sessionUri.toString() ? widget : void 0;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, {
      id: "implement:start-implementation",
      sessionResource: sessionUri.toString()
    });
    assert.deepStrictEqual(result, { success: true, targetMode: "implement" });
    assert.strictEqual(executeHandoffCalls.length, 1);
  });
  test("should match by id (primary)", async () => {
    const chatModeService = new MockChatModeService();
    const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "agent:open-in-editor" });
    assert.deepStrictEqual(result, { success: true, targetMode: "agent" });
    assert.strictEqual(executeHandoffCalls[0].label, "Open in Editor");
  });
  test("should fall back to label match when id is not provided", async () => {
    const chatModeService = new MockChatModeService();
    const { widget, executeHandoffCalls } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { label: "start implementation" });
    assert.deepStrictEqual(result, { success: true, targetMode: "implement" });
    assert.strictEqual(executeHandoffCalls[0].prompt, "Implement the plan");
  });
  test("should return error for non-matching identifier", async () => {
    const chatModeService = new MockChatModeService();
    const { widget } = createMockWidget(planMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "nonexistent:thing" });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("nonexistent:thing"));
  });
  test("should resolve sourceCustomAgent to look up handoffs from a different mode", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    const modeService = new MockChatModeService({ builtin: [askMode], custom: [planMode] });
    const { widget, executeHandoffCalls } = createMockWidget(askMode, await modeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, modeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, {
      id: "implement:start-implementation",
      sourceCustomAgent: "plan"
    });
    assert.deepStrictEqual(result, { success: true, targetMode: "implement" });
    assert.strictEqual(executeHandoffCalls.length, 1);
  });
  test("should return error when source mode has no handoffs", async () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    const chatModeService = new MockChatModeService({ builtin: [askMode], custom: [] });
    const { widget } = createMockWidget(askMode, await chatModeService.getLocalModes());
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = widget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    instantiationService.set(IChatModeService, chatModeService);
    const handler = CommandsRegistry.getCommand(ExecuteHandoffActionId)?.handler;
    assert.ok(handler);
    const result = await runCommandAsync(handler, instantiationService, { id: "implement:start-implementation" });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("No handoffs available"));
  });
});
suite("SwitchToNextPinnedModelAction", () => {
  const store = new DisposableStore();
  let instantiationService;
  let chatExecuteActions;
  suiteSetup(() => {
    chatExecuteActions = registerChatExecuteActions();
  });
  suiteTeardown(() => {
    chatExecuteActions.dispose();
  });
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("invokes switchToNextPinnedModel on the last focused widget", async () => {
    let switchCalls = 0;
    const mockWidget = {
      input: {
        switchToNextPinnedModel: () => {
          switchCalls++;
        }
      }
    };
    const mockWidgetService = new class extends MockChatWidgetService {
      constructor() {
        super(...arguments);
        this.lastFocusedWidget = mockWidget;
      }
    }();
    instantiationService.set(IChatWidgetService, mockWidgetService);
    const handler = CommandsRegistry.getCommand("workbench.action.chat.switchToNextPinnedModel")?.handler;
    assert.ok(handler);
    await runCommandAsync(handler, instantiationService);
    assert.strictEqual(switchCalls, 1);
  });
  test("is a no-op when there is no focused widget", async () => {
    instantiationService.set(IChatWidgetService, new MockChatWidgetService());
    const handler = CommandsRegistry.getCommand("workbench.action.chat.switchToNextPinnedModel")?.handler;
    assert.ok(handler);
    await runCommandAsync(handler, instantiationService);
  });
});
suite("ChatSubmitAction", () => {
  const store = new DisposableStore();
  let instantiationService;
  let chatExecuteActions;
  suiteSetup(() => {
    chatExecuteActions = registerChatExecuteActions();
  });
  suiteTeardown(() => {
    chatExecuteActions.dispose();
  });
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes acceptInputOptions to the widget", async () => {
    let acceptedOptions;
    const widget = {
      input: {
        pendingDelegationTarget: void 0
      },
      acceptInput: async (_query, options) => {
        acceptedOptions = options;
        return void 0;
      }
    };
    instantiationService.set(ITelemetryService, NullTelemetryService);
    instantiationService.set(IChatWidgetService, new MockChatWidgetService());
    const handler = CommandsRegistry.getCommand(ChatSubmitAction.ID)?.handler;
    assert.ok(handler);
    await runCommandAsync(handler, instantiationService, {
      widget,
      acceptInputOptions: { cancelCurrentRequest: true }
    });
    assert.deepStrictEqual(acceptedOptions, { cancelCurrentRequest: true });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FjdGlvbnMvY2hhdEV4ZWN1dGVBY3Rpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ2hhdEFjY2VwdElucHV0T3B0aW9ucywgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0U3VibWl0QWN0aW9uLCBFeGVjdXRlSGFuZG9mZkFjdGlvbklkLCBHZXRIYW5kb2Zmc0FjdGlvbklkLCByZWdpc3RlckNoYXRFeGVjdXRlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9jaGF0RXhlY3V0ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlLCBJQ2hhdE1vZGVzLCBJQ2hhdE1vZGVTZXJ2aWNlLCBJQ3VzdG9tQWdlbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElIYW5kT2ZmIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IFRhcmdldCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vd2lkZ2V0L21vY2tDaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IE1vY2tDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbW9ja0NoYXRNb2RlU2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJRXhlY3V0ZUhhbmRvZmZSZXN1bHQge1xuXHRzdWNjZXNzOiBib29sZWFuO1xuXHR0YXJnZXRNb2RlPzogc3RyaW5nO1xuXHRlcnJvcj86IHN0cmluZztcbn1cblxuXG5hc3luYyBmdW5jdGlvbiBydW5Db21tYW5kQXN5bmM8VD4oaGFuZGxlcjogRnVuY3Rpb24sIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VD4ge1xuXHRyZXR1cm4gYXdhaXQgaGFuZGxlciguLi5hcmdzKSBhcyB1bmtub3duIGFzIFQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tNb2RlKG92ZXJyaWRlczogUGFydGlhbDxJQ2hhdE1vZGU+ICYgeyBpZDogc3RyaW5nOyBraW5kOiBDaGF0TW9kZUtpbmQgfSk6IElDaGF0TW9kZSB7XG5cdHJldHVybiB7XG5cdFx0bmFtZTogY29uc3RPYnNlcnZhYmxlKG92ZXJyaWRlcy5pZCksXG5cdFx0bGFiZWw6IGNvbnN0T2JzZXJ2YWJsZShvdmVycmlkZXMuaWQpLFxuXHRcdGljb246IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGRlc2NyaXB0aW9uOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRpc0J1aWx0aW46IG92ZXJyaWRlcy5pc0J1aWx0aW4gPz8gZmFsc2UsXG5cdFx0dGFyZ2V0OiBjb25zdE9ic2VydmFibGUoVGFyZ2V0LlVuZGVmaW5lZCksXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9IGFzIElDaGF0TW9kZTtcbn1cblxuc3VpdGUoJ0dldEhhbmRvZmZzQWN0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0bGV0IGNoYXRFeGVjdXRlQWN0aW9uczogRGlzcG9zYWJsZVN0b3JlO1xuXHRzdWl0ZVNldHVwKCgpID0+IHtcblx0XHRjaGF0RXhlY3V0ZUFjdGlvbnMgPSByZWdpc3RlckNoYXRFeGVjdXRlQWN0aW9ucygpO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKCgpID0+IHtcblx0XHRjaGF0RXhlY3V0ZUFjdGlvbnMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gYWxsIG1vZGVzIHdoZW4gbm8gc291cmNlQ3VzdG9tQWdlbnQgaXMgc3BlY2lmaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFza01vZGUgPSBjcmVhdGVNb2NrTW9kZSh7IGlkOiAnYXNrJywga2luZDogQ2hhdE1vZGVLaW5kLkFzaywgaXNCdWlsdGluOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHBsYW5Nb2RlID0gY3JlYXRlTW9ja01vZGUoe1xuXHRcdFx0aWQ6ICdwbGFuJyxcblx0XHRcdGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdGhhbmRPZmZzOiBvYnNlcnZhYmxlVmFsdWUoJ2hhbmRPZmZzJywgW1xuXHRcdFx0XHR7IGFnZW50OiAnaW1wbGVtZW50JywgbGFiZWw6ICdTdGFydCcsIHByb21wdDogJ2dvJyB9IHNhdGlzZmllcyBJSGFuZE9mZixcblx0XHRcdF0pLFxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0TW9kZVNlcnZpY2UsIG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKHsgYnVpbHRpbjogW2Fza01vZGVdLCBjdXN0b206IFtwbGFuTW9kZV0gfSkpO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChHZXRIYW5kb2Zmc0FjdGlvbklkKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Db21tYW5kQXN5bmM8SUN1c3RvbUFnZW50SW5mb1tdPihoYW5kbGVyLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubmFtZSwgJ2FzaycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaGFuZG9mZnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLm5hbWUsICdwbGFuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS5oYW5kb2Zmcy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmlsdGVyIGJ5IHNvdXJjZUN1c3RvbUFnZW50IChjYXNlLWluc2Vuc2l0aXZlKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhc2tNb2RlID0gY3JlYXRlTW9ja01vZGUoeyBpZDogJ2FzaycsIGtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssIGlzQnVpbHRpbjogdHJ1ZSB9KTtcblx0XHRjb25zdCBwbGFuTW9kZSA9IGNyZWF0ZU1vY2tNb2RlKHtcblx0XHRcdGlkOiAncGxhbicsXG5cdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRoYW5kT2Zmczogb2JzZXJ2YWJsZVZhbHVlKCdoYW5kT2ZmcycsIFtcblx0XHRcdFx0eyBhZ2VudDogJ2ltcGxlbWVudCcsIGxhYmVsOiAnU3RhcnQnLCBwcm9tcHQ6ICdnbycgfSBzYXRpc2ZpZXMgSUhhbmRPZmYsXG5cdFx0XHRdKSxcblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdE1vZGVTZXJ2aWNlLCBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSh7IGJ1aWx0aW46IFthc2tNb2RlXSwgY3VzdG9tOiBbcGxhbk1vZGVdIH0pKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoR2V0SGFuZG9mZnNBY3Rpb25JZCk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuQ29tbWFuZEFzeW5jPElDdXN0b21BZ2VudEluZm9bXT4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgc291cmNlQ3VzdG9tQWdlbnQ6ICdQbGFuJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubmFtZSwgJ3BsYW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmhhbmRvZmZzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gZW1wdHkgYXJyYXkgZm9yIG5vbi1tYXRjaGluZyBzb3VyY2VDdXN0b21BZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhc2tNb2RlID0gY3JlYXRlTW9ja01vZGUoeyBpZDogJ2FzaycsIGtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssIGlzQnVpbHRpbjogdHJ1ZSB9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdE1vZGVTZXJ2aWNlLCBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSh7IGJ1aWx0aW46IFthc2tNb2RlXSwgY3VzdG9tOiBbXSB9KSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEdldEhhbmRvZmZzQWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkNvbW1hbmRBc3luYzxJQ3VzdG9tQWdlbnRJbmZvW10+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IHNvdXJjZUN1c3RvbUFnZW50OiAnbm9uZXhpc3RlbnQnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdFeGVjdXRlSGFuZG9mZkFjdGlvbicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdGxldCBjaGF0RXhlY3V0ZUFjdGlvbnM6IERpc3Bvc2FibGVTdG9yZTtcblx0c3VpdGVTZXR1cCgoKSA9PiB7XG5cdFx0Y2hhdEV4ZWN1dGVBY3Rpb25zID0gcmVnaXN0ZXJDaGF0RXhlY3V0ZUFjdGlvbnMoKTtcblx0fSk7XG5cblx0c3VpdGVUZWFyZG93bigoKSA9PiB7XG5cdFx0Y2hhdEV4ZWN1dGVBY3Rpb25zLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzdG9yZS5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB0ZXN0SGFuZG9mZnM6IElIYW5kT2ZmW10gPSBbXG5cdFx0eyBhZ2VudDogJ2ltcGxlbWVudCcsIGxhYmVsOiAnU3RhcnQgSW1wbGVtZW50YXRpb24nLCBwcm9tcHQ6ICdJbXBsZW1lbnQgdGhlIHBsYW4nLCBzZW5kOiB0cnVlIH0sXG5cdFx0eyBhZ2VudDogJ2FnZW50JywgbGFiZWw6ICdPcGVuIGluIEVkaXRvcicsIHByb21wdDogJ09wZW4gaXQnIH0sXG5cdF07XG5cblx0Y29uc3QgcGxhbk1vZGUgPSBjcmVhdGVNb2NrTW9kZSh7XG5cdFx0aWQ6ICdwbGFuJyxcblx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0aGFuZE9mZnM6IG9ic2VydmFibGVWYWx1ZSgnaGFuZE9mZnMnLCB0ZXN0SGFuZG9mZnMpLFxuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrV2lkZ2V0KGN1cnJlbnRNb2RlOiBJQ2hhdE1vZGUsIGNoYXRNb2RlczogSUNoYXRNb2Rlcyk6IHsgd2lkZ2V0OiBQYXJ0aWFsPElDaGF0V2lkZ2V0PjsgZXhlY3V0ZUhhbmRvZmZDYWxsczogSUhhbmRPZmZbXSB9IHtcblx0XHRjb25zdCBleGVjdXRlSGFuZG9mZkNhbGxzOiBJSGFuZE9mZltdID0gW107XG5cdFx0Y29uc3Qgd2lkZ2V0OiBQYXJ0aWFsPElDaGF0V2lkZ2V0PiA9IHtcblx0XHRcdGlucHV0OiB7XG5cdFx0XHRcdGN1cnJlbnRNb2RlT2JzOiBjb25zdE9ic2VydmFibGUoY3VycmVudE1vZGUpLFxuXHRcdFx0XHRjdXJyZW50Q2hhdE1vZGVzT2JzOiBjb25zdE9ic2VydmFibGUoY2hhdE1vZGVzKSxcblx0XHRcdH0gYXMgSUNoYXRXaWRnZXRbJ2lucHV0J10sXG5cdFx0XHRleGVjdXRlSGFuZG9mZjogYXN5bmMgKGhhbmRvZmY6IElIYW5kT2ZmKSA9PiB7XG5cdFx0XHRcdGV4ZWN1dGVIYW5kb2ZmQ2FsbHMucHVzaChoYW5kb2ZmKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRyZXR1cm4geyB3aWRnZXQsIGV4ZWN1dGVIYW5kb2ZmQ2FsbHMgfTtcblx0fVxuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gZXJyb3Igd2hlbiBuZWl0aGVyIGlkIG5vciBsYWJlbCBpcyBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEV4ZWN1dGVIYW5kb2ZmQWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkNvbW1hbmRBc3luYzxJRXhlY3V0ZUhhbmRvZmZSZXN1bHQ+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnRWl0aGVyIGlkIG9yIGxhYmVsIGlzIHJlcXVpcmVkJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBlcnJvciB3aGVuIG5vIHdpZGdldCBpcyBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdE1vZGVTZXJ2aWNlLCBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoRXhlY3V0ZUhhbmRvZmZBY3Rpb25JZCk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuQ29tbWFuZEFzeW5jPElFeGVjdXRlSGFuZG9mZlJlc3VsdD4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgaWQ6ICdpbXBsZW1lbnQ6c3RhcnQtaW1wbGVtZW50YXRpb24nIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3VjY2VzcywgZmFsc2UpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuZXJyb3I/LmluY2x1ZGVzKCdObyBjaGF0IHdpZGdldCBmb3VuZCcpKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGZhbGwgYmFjayB0byBsYXN0Rm9jdXNlZFdpZGdldCB3aGVuIHNlc3Npb25SZXNvdXJjZSBpcyBvbWl0dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRNb2RlU2VydmljZSA9IG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIGV4ZWN1dGVIYW5kb2ZmQ2FsbHMgfSA9IGNyZWF0ZU1vY2tXaWRnZXQocGxhbk1vZGUsIGF3YWl0IGNoYXRNb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCkpO1xuXG5cdFx0Y29uc3QgbW9ja1dpZGdldFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBNb2NrQ2hhdFdpZGdldFNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFzdEZvY3VzZWRXaWRnZXQgPSB3aWRnZXQgYXMgSUNoYXRXaWRnZXQ7XG5cdFx0fTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdFdpZGdldFNlcnZpY2UsIG1vY2tXaWRnZXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRNb2RlU2VydmljZSwgY2hhdE1vZGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoRXhlY3V0ZUhhbmRvZmZBY3Rpb25JZCk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuQ29tbWFuZEFzeW5jPElFeGVjdXRlSGFuZG9mZlJlc3VsdD4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgaWQ6ICdpbXBsZW1lbnQ6c3RhcnQtaW1wbGVtZW50YXRpb24nIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHN1Y2Nlc3M6IHRydWUsIHRhcmdldE1vZGU6ICdpbXBsZW1lbnQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlSGFuZG9mZkNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVIYW5kb2ZmQ2FsbHNbMF0ubGFiZWwsICdTdGFydCBJbXBsZW1lbnRhdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSB3aWRnZXQgYnkgc2Vzc2lvblJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRNb2RlU2VydmljZSA9IG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKHsgYnVpbHRpbjogW10sIGN1c3RvbTogW3BsYW5Nb2RlXSB9KTtcblx0XHRjb25zdCB7IHdpZGdldCwgZXhlY3V0ZUhhbmRvZmZDYWxscyB9ID0gY3JlYXRlTW9ja1dpZGdldChwbGFuTW9kZSwgYXdhaXQgY2hhdE1vZGVTZXJ2aWNlLmdldExvY2FsTW9kZXMoKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMScpO1xuXG5cdFx0Y29uc3QgbW9ja1dpZGdldFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBNb2NrQ2hhdFdpZGdldFNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gc2Vzc2lvblVyaS50b1N0cmluZygpID8gd2lkZ2V0IGFzIElDaGF0V2lkZ2V0IDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRXaWRnZXRTZXJ2aWNlLCBtb2NrV2lkZ2V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0TW9kZVNlcnZpY2UsIGNoYXRNb2RlU2VydmljZSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEV4ZWN1dGVIYW5kb2ZmQWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkNvbW1hbmRBc3luYzxJRXhlY3V0ZUhhbmRvZmZSZXN1bHQ+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ2ltcGxlbWVudDpzdGFydC1pbXBsZW1lbnRhdGlvbicsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBzdWNjZXNzOiB0cnVlLCB0YXJnZXRNb2RlOiAnaW1wbGVtZW50JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZUhhbmRvZmZDYWxscy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbWF0Y2ggYnkgaWQgKHByaW1hcnkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXRNb2RlU2VydmljZSA9IG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIGV4ZWN1dGVIYW5kb2ZmQ2FsbHMgfSA9IGNyZWF0ZU1vY2tXaWRnZXQocGxhbk1vZGUsIGF3YWl0IGNoYXRNb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCkpO1xuXG5cdFx0Y29uc3QgbW9ja1dpZGdldFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBNb2NrQ2hhdFdpZGdldFNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFzdEZvY3VzZWRXaWRnZXQgPSB3aWRnZXQgYXMgSUNoYXRXaWRnZXQ7XG5cdFx0fTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdFdpZGdldFNlcnZpY2UsIG1vY2tXaWRnZXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRNb2RlU2VydmljZSwgY2hhdE1vZGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoRXhlY3V0ZUhhbmRvZmZBY3Rpb25JZCk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuQ29tbWFuZEFzeW5jPElFeGVjdXRlSGFuZG9mZlJlc3VsdD4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgaWQ6ICdhZ2VudDpvcGVuLWluLWVkaXRvcicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgc3VjY2VzczogdHJ1ZSwgdGFyZ2V0TW9kZTogJ2FnZW50JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZUhhbmRvZmZDYWxsc1swXS5sYWJlbCwgJ09wZW4gaW4gRWRpdG9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBmYWxsIGJhY2sgdG8gbGFiZWwgbWF0Y2ggd2hlbiBpZCBpcyBub3QgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdE1vZGVTZXJ2aWNlID0gbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IHdpZGdldCwgZXhlY3V0ZUhhbmRvZmZDYWxscyB9ID0gY3JlYXRlTW9ja1dpZGdldChwbGFuTW9kZSwgYXdhaXQgY2hhdE1vZGVTZXJ2aWNlLmdldExvY2FsTW9kZXMoKSk7XG5cblx0XHRjb25zdCBtb2NrV2lkZ2V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIE1vY2tDaGF0V2lkZ2V0U2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBsYXN0Rm9jdXNlZFdpZGdldCA9IHdpZGdldCBhcyBJQ2hhdFdpZGdldDtcblx0XHR9O1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0V2lkZ2V0U2VydmljZSwgbW9ja1dpZGdldFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdE1vZGVTZXJ2aWNlLCBjaGF0TW9kZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChFeGVjdXRlSGFuZG9mZkFjdGlvbklkKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Db21tYW5kQXN5bmM8SUV4ZWN1dGVIYW5kb2ZmUmVzdWx0PihoYW5kbGVyLCBpbnN0YW50aWF0aW9uU2VydmljZSwgeyBsYWJlbDogJ3N0YXJ0IGltcGxlbWVudGF0aW9uJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBzdWNjZXNzOiB0cnVlLCB0YXJnZXRNb2RlOiAnaW1wbGVtZW50JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZUhhbmRvZmZDYWxsc1swXS5wcm9tcHQsICdJbXBsZW1lbnQgdGhlIHBsYW4nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBlcnJvciBmb3Igbm9uLW1hdGNoaW5nIGlkZW50aWZpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdE1vZGVTZXJ2aWNlID0gbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoKTtcblx0XHRjb25zdCB7IHdpZGdldCB9ID0gY3JlYXRlTW9ja1dpZGdldChwbGFuTW9kZSwgYXdhaXQgY2hhdE1vZGVTZXJ2aWNlLmdldExvY2FsTW9kZXMoKSk7XG5cblx0XHRjb25zdCBtb2NrV2lkZ2V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIE1vY2tDaGF0V2lkZ2V0U2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBsYXN0Rm9jdXNlZFdpZGdldCA9IHdpZGdldCBhcyBJQ2hhdFdpZGdldDtcblx0XHR9O1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0V2lkZ2V0U2VydmljZSwgbW9ja1dpZGdldFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdE1vZGVTZXJ2aWNlLCBjaGF0TW9kZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChFeGVjdXRlSGFuZG9mZkFjdGlvbklkKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5Db21tYW5kQXN5bmM8SUV4ZWN1dGVIYW5kb2ZmUmVzdWx0PihoYW5kbGVyLCBpbnN0YW50aWF0aW9uU2VydmljZSwgeyBpZDogJ25vbmV4aXN0ZW50OnRoaW5nJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmVycm9yPy5pbmNsdWRlcygnbm9uZXhpc3RlbnQ6dGhpbmcnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXNvbHZlIHNvdXJjZUN1c3RvbUFnZW50IHRvIGxvb2sgdXAgaGFuZG9mZnMgZnJvbSBhIGRpZmZlcmVudCBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFza01vZGUgPSBjcmVhdGVNb2NrTW9kZSh7IGlkOiAnYXNrJywga2luZDogQ2hhdE1vZGVLaW5kLkFzaywgaXNCdWlsdGluOiB0cnVlIH0pO1xuXHRcdGNvbnN0IG1vZGVTZXJ2aWNlID0gbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoeyBidWlsdGluOiBbYXNrTW9kZV0sIGN1c3RvbTogW3BsYW5Nb2RlXSB9KTtcblx0XHRjb25zdCB7IHdpZGdldCwgZXhlY3V0ZUhhbmRvZmZDYWxscyB9ID0gY3JlYXRlTW9ja1dpZGdldChhc2tNb2RlLCBhd2FpdCBtb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCkpOyAvLyB3aWRnZXQgaXMgaW4gXCJhc2tcIiBtb2RlIChubyBoYW5kb2ZmcylcblxuXHRcdGNvbnN0IG1vY2tXaWRnZXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RGb2N1c2VkV2lkZ2V0ID0gd2lkZ2V0IGFzIElDaGF0V2lkZ2V0O1xuXHRcdH07XG5cblx0XHQvLyBUaGUgcGxhbiBtb2RlIGhhcyBoYW5kb2Zmczsgc291cmNlQ3VzdG9tQWdlbnQgb3ZlcnJpZGVzIHRoZSB3aWRnZXQncyBjdXJyZW50IG1vZGVcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRXaWRnZXRTZXJ2aWNlLCBtb2NrV2lkZ2V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0TW9kZVNlcnZpY2UsIG1vZGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoRXhlY3V0ZUhhbmRvZmZBY3Rpb25JZCk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuQ29tbWFuZEFzeW5jPElFeGVjdXRlSGFuZG9mZlJlc3VsdD4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHtcblx0XHRcdGlkOiAnaW1wbGVtZW50OnN0YXJ0LWltcGxlbWVudGF0aW9uJyxcblx0XHRcdHNvdXJjZUN1c3RvbUFnZW50OiAncGxhbicsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgc3VjY2VzczogdHJ1ZSwgdGFyZ2V0TW9kZTogJ2ltcGxlbWVudCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVIYW5kb2ZmQ2FsbHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBlcnJvciB3aGVuIHNvdXJjZSBtb2RlIGhhcyBubyBoYW5kb2ZmcycsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGFza01vZGUgPSBjcmVhdGVNb2NrTW9kZSh7IGlkOiAnYXNrJywga2luZDogQ2hhdE1vZGVLaW5kLkFzaywgaXNCdWlsdGluOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGNoYXRNb2RlU2VydmljZSA9IG5ldyBNb2NrQ2hhdE1vZGVTZXJ2aWNlKHsgYnVpbHRpbjogW2Fza01vZGVdLCBjdXN0b206IFtdIH0pO1xuXHRcdGNvbnN0IHsgd2lkZ2V0IH0gPSBjcmVhdGVNb2NrV2lkZ2V0KGFza01vZGUsIGF3YWl0IGNoYXRNb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCkpOyAvLyB3aWRnZXQgaXMgaW4gXCJhc2tcIiBtb2RlIChubyBoYW5kb2ZmcylcblxuXHRcdGNvbnN0IG1vY2tXaWRnZXRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgTW9ja0NoYXRXaWRnZXRTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhc3RGb2N1c2VkV2lkZ2V0ID0gd2lkZ2V0IGFzIElDaGF0V2lkZ2V0O1xuXHRcdH07XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNoYXRXaWRnZXRTZXJ2aWNlLCBtb2NrV2lkZ2V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0TW9kZVNlcnZpY2UsIGNoYXRNb2RlU2VydmljZSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKEV4ZWN1dGVIYW5kb2ZmQWN0aW9uSWQpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bkNvbW1hbmRBc3luYzxJRXhlY3V0ZUhhbmRvZmZSZXN1bHQ+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7IGlkOiAnaW1wbGVtZW50OnN0YXJ0LWltcGxlbWVudGF0aW9uJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmVycm9yPy5pbmNsdWRlcygnTm8gaGFuZG9mZnMgYXZhaWxhYmxlJykpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnU3dpdGNoVG9OZXh0UGlubmVkTW9kZWxBY3Rpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRsZXQgY2hhdEV4ZWN1dGVBY3Rpb25zOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHN1aXRlU2V0dXAoKCkgPT4ge1xuXHRcdGNoYXRFeGVjdXRlQWN0aW9ucyA9IHJlZ2lzdGVyQ2hhdEV4ZWN1dGVBY3Rpb25zKCk7XG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oKCkgPT4ge1xuXHRcdGNoYXRFeGVjdXRlQWN0aW9ucy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaW52b2tlcyBzd2l0Y2hUb05leHRQaW5uZWRNb2RlbCBvbiB0aGUgbGFzdCBmb2N1c2VkIHdpZGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc3dpdGNoQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IG1vY2tXaWRnZXQgPSB7XG5cdFx0XHRpbnB1dDoge1xuXHRcdFx0XHRzd2l0Y2hUb05leHRQaW5uZWRNb2RlbDogKCkgPT4ge1xuXHRcdFx0XHRcdHN3aXRjaENhbGxzKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cblx0XHRjb25zdCBtb2NrV2lkZ2V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIE1vY2tDaGF0V2lkZ2V0U2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBsYXN0Rm9jdXNlZFdpZGdldCA9IG1vY2tXaWRnZXQ7XG5cdFx0fTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdFdpZGdldFNlcnZpY2UsIG1vY2tXaWRnZXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zd2l0Y2hUb05leHRQaW5uZWRNb2RlbCcpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyKTtcblxuXHRcdGF3YWl0IHJ1bkNvbW1hbmRBc3luYzx2b2lkPihoYW5kbGVyLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN3aXRjaENhbGxzLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaXMgYSBuby1vcCB3aGVuIHRoZXJlIGlzIG5vIGZvY3VzZWQgd2lkZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdFdpZGdldFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFdpZGdldFNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBoYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3dpdGNoVG9OZXh0UGlubmVkTW9kZWwnKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlcik7XG5cblx0XHRhd2FpdCBydW5Db21tYW5kQXN5bmM8dm9pZD4oaGFuZGxlciwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdFN1Ym1pdEFjdGlvbicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdGxldCBjaGF0RXhlY3V0ZUFjdGlvbnM6IERpc3Bvc2FibGVTdG9yZTtcblx0c3VpdGVTZXR1cCgoKSA9PiB7XG5cdFx0Y2hhdEV4ZWN1dGVBY3Rpb25zID0gcmVnaXN0ZXJDaGF0RXhlY3V0ZUFjdGlvbnMoKTtcblx0fSk7XG5cblx0c3VpdGVUZWFyZG93bigoKSA9PiB7XG5cdFx0Y2hhdEV4ZWN1dGVBY3Rpb25zLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzdG9yZS5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXNzZXMgYWNjZXB0SW5wdXRPcHRpb25zIHRvIHRoZSB3aWRnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGFjY2VwdGVkT3B0aW9uczogdW5rbm93bjtcblx0XHRjb25zdCB3aWRnZXQgPSB7XG5cdFx0XHRpbnB1dDoge1xuXHRcdFx0XHRwZW5kaW5nRGVsZWdhdGlvblRhcmdldDogdW5kZWZpbmVkLFxuXHRcdFx0fSBhcyBJQ2hhdFdpZGdldFsnaW5wdXQnXSxcblx0XHRcdGFjY2VwdElucHV0OiBhc3luYyAoX3F1ZXJ5OiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElDaGF0QWNjZXB0SW5wdXRPcHRpb25zIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGFjY2VwdGVkT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0gc2F0aXNmaWVzIFBhcnRpYWw8SUNoYXRXaWRnZXQ+O1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IE1vY2tDaGF0V2lkZ2V0U2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoQ2hhdFN1Ym1pdEFjdGlvbi5JRCk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKGhhbmRsZXIpO1xuXG5cdFx0YXdhaXQgcnVuQ29tbWFuZEFzeW5jPHZvaWQ+KGhhbmRsZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHR3aWRnZXQ6IHdpZGdldCBhcyBJQ2hhdFdpZGdldCxcblx0XHRcdGFjY2VwdElucHV0T3B0aW9uczogeyBjYW5jZWxDdXJyZW50UmVxdWVzdDogdHJ1ZSB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY2NlcHRlZE9wdGlvbnMsIHsgY2FuY2VsQ3VycmVudFJlcXVlc3Q6IHRydWUgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFvRCwwQkFBMEI7QUFDOUUsU0FBUyxrQkFBa0Isd0JBQXdCLHFCQUFxQixrQ0FBa0M7QUFDMUcsU0FB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QUc7QUFDOUYsV0FBTyxHQUFHLE9BQU87QUFFakIsVUFBTSxnQkFBc0IsU0FBUyxvQkFBb0I7QUFDekQsV0FBTyxZQUFZLGFBQWEsQ0FBQztBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLDhDQUE4QyxZQUFZO0FBQzlELHlCQUFxQixJQUFJLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBRXhFLFVBQU0sVUFBVSxpQkFBaUIsV0FBVywrQ0FBK0MsR0FBRztBQUM5RixXQUFPLEdBQUcsT0FBTztBQUVqQixVQUFNLGdCQUFzQixTQUFTLG9CQUFvQjtBQUFBLEVBQzFELENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxvQkFBb0IsTUFBTTtBQUMvQixRQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsTUFBSTtBQUVKLE1BQUk7QUFDSixhQUFXLE1BQU07QUFDaEIseUJBQXFCLDJCQUEyQjtBQUFBLEVBQ2pELENBQUM7QUFFRCxnQkFBYyxNQUFNO0FBQ25CLHVCQUFtQixRQUFRO0FBQUEsRUFDNUIsQ0FBQztBQUVELFFBQU0sTUFBTTtBQUNYLDJCQUF1QixNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUFBLEVBQ2hFLENBQUM7QUFFRCxXQUFTLE1BQU07QUFDZCxVQUFNLE1BQU07QUFBQSxFQUNiLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsT0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxRQUFJO0FBQ0osVUFBTSxTQUFTO0FBQUEsTUFDZCxPQUFPO0FBQUEsUUFDTix5QkFBeUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsYUFBYSxPQUFPLFFBQTRCLFlBQWlEO0FBQ2hHLDBCQUFrQjtBQUNsQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSx5QkFBcUIsSUFBSSxtQkFBbUIsb0JBQW9CO0FBQ2hFLHlCQUFxQixJQUFJLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBRXhFLFVBQU0sVUFBVSxpQkFBaUIsV0FBVyxpQkFBaUIsRUFBRSxHQUFHO0FBQ2xFLFdBQU8sR0FBRyxPQUFPO0FBRWpCLFVBQU0sZ0JBQXNCLFNBQVMsc0JBQXNCO0FBQUEsTUFDMUQ7QUFBQSxNQUNBLG9CQUFvQixFQUFFLHNCQUFzQixLQUFLO0FBQUEsSUFDbEQsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLGlCQUFpQixFQUFFLHNCQUFzQixLQUFLLENBQUM7QUFBQSxFQUN2RSxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
