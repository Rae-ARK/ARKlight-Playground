import assert from "assert";
import { getActiveDocument } from "../../../../../../base/browser/dom.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { OS } from "../../../../../../base/common/platform.js";
import { URI } from "../../../../../../base/common/uri.js";
import { upcastPartial } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { KeybindingsRegistry } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeybindingResolver } from "../../../../../../platform/keybinding/common/keybindingResolver.js";
import { ResolvedKeybindingItem } from "../../../../../../platform/keybinding/common/resolvedKeybindingItem.js";
import { USLayoutResolvedKeybinding } from "../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../../../platform/notification/test/common/testNotificationService.js";
import { IChatWidgetService } from "../../../browser/chat.js";
import { ChatAskInSideChatAction, ChatQueueMessageAction, ChatSteerWithMessageAction, registerChatQueueActions } from "../../../browser/actions/chatQueueActions.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { IChatSideChatService } from "../../../common/chatSideChatService.js";
import { ChatConfiguration } from "../../../common/constants.js";
registerChatQueueActions();
suite("Queue/Steer keybinding resolution", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function buildResolverForCommands(commandIds) {
    const items = [];
    for (const item of KeybindingsRegistry.getDefaultKeybindingsForOS(OS)) {
      if (!item.command || !commandIds.includes(item.command) || !item.keybinding) {
        continue;
      }
      const resolved = USLayoutResolvedKeybinding.resolveKeybinding(item.keybinding, OS)[0];
      items.push(new ResolvedKeybindingItem(resolved, item.command, item.commandArgs, item.when ?? void 0, true, null, false));
    }
    return new KeybindingResolver(items, [], () => {
    });
  }
  function lookupForConfig(defaultAction) {
    const config = new TestConfigurationService({ [ChatConfiguration.RequestQueueingDefaultAction]: defaultAction });
    const ctxService = new ContextKeyService(config);
    const overlay = ctxService.createOverlay([
      [ChatContextKeys.inputHasText.key, true],
      [ChatContextKeys.inChatInput.key, true],
      [ChatContextKeys.requestInProgress.key, true]
    ]);
    const resolver = buildResolverForCommands([ChatQueueMessageAction.ID, ChatSteerWithMessageAction.ID]);
    return {
      result: {
        queue: resolver.lookupPrimaryKeybinding(ChatQueueMessageAction.ID, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0] ?? null,
        steer: resolver.lookupPrimaryKeybinding(ChatSteerWithMessageAction.ID, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0] ?? null
      },
      dispose: () => ctxService.dispose()
    };
  }
  test("with default=steer, Enter steers and Alt+Enter queues", () => {
    const { result, dispose } = lookupForConfig("steer");
    try {
      assert.deepStrictEqual(result, { queue: "alt+Enter", steer: "Enter" });
    } finally {
      dispose();
    }
  });
  test("with default=queue, Enter queues and Alt+Enter steers", () => {
    const { result, dispose } = lookupForConfig("queue");
    try {
      assert.deepStrictEqual(result, { queue: "Enter", steer: "alt+Enter" });
    } finally {
      dispose();
    }
  });
});
suite("ChatAskInSideChatAction", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function setup(options = {}) {
    const store = disposables.add(new DisposableStore());
    const instantiationService = store.add(new TestInstantiationService());
    const sessionResource = URI.parse("test:///chat/source");
    let input = "what about this?";
    instantiationService.stub(IChatWidgetService, upcastPartial({
      lastFocusedWidget: upcastPartial({
        domNode: getActiveDocument().createElement("div"),
        inputEditor: { getDomNode: () => null },
        getInput: () => input,
        setInput: (value) => {
          input = value ?? "";
        },
        viewModel: upcastPartial({ model: upcastPartial({ sessionResource }) })
      })
    }));
    const asked = [];
    instantiationService.stub(IChatSideChatService, upcastPartial({
      canAskInSideChat: () => options.canAsk ?? true,
      askInSideChat: async (resource, query) => {
        if (options.askFails) {
          asked.push("failed");
          throw new Error("nope");
        }
        asked.push(`${resource.toString()}:${query}`);
      }
    }));
    instantiationService.stub(INotificationService, new TestNotificationService());
    instantiationService.stub(ILogService, new NullLogService());
    const action = new ChatAskInSideChatAction();
    return {
      run: () => instantiationService.invokeFunction((accessor) => action.run(accessor)),
      asked,
      sessionResource,
      getInput: () => input
    };
  }
  test("delegates the composed message to the side chat service and clears the input", async () => {
    const { run, asked, sessionResource, getInput } = setup();
    await run();
    assert.deepStrictEqual({ asked, input: getInput() }, {
      asked: [`${sessionResource.toString()}:what about this?`],
      input: ""
    });
  });
  test("restores the composed message when the side chat cannot be created", async () => {
    const { run, asked, getInput } = setup({ askFails: true });
    await run();
    assert.deepStrictEqual({ asked, input: getInput() }, {
      asked: ["failed"],
      input: "what about this?"
    });
  });
  test("does nothing but warn when no provider supports the conversation", async () => {
    const { run, asked, getInput } = setup({ canAsk: false });
    await run();
    assert.deepStrictEqual({ asked, input: getInput() }, {
      asked: [],
      input: "what about this?"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FjdGlvbnMvY2hhdFF1ZXVlQWN0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlRG9jdW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdSZXNvbHZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL3VzTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0QXNrSW5TaWRlQ2hhdEFjdGlvbiwgQ2hhdFF1ZXVlTWVzc2FnZUFjdGlvbiwgQ2hhdFN0ZWVyV2l0aE1lc3NhZ2VBY3Rpb24sIHJlZ2lzdGVyQ2hhdFF1ZXVlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9jaGF0UXVldWVBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNpZGVDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2lkZUNoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcblxuLy8gUmVnaXN0ZXIgYWN0aW9ucyBvbmNlIHNvIHRoZSBrZXliaW5kaW5ncyBhcHBlYXIgaW4gS2V5YmluZGluZ3NSZWdpc3RyeS5cbnJlZ2lzdGVyQ2hhdFF1ZXVlQWN0aW9ucygpO1xuXG5zdWl0ZSgnUXVldWUvU3RlZXIga2V5YmluZGluZyByZXNvbHV0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGJ1aWxkUmVzb2x2ZXJGb3JDb21tYW5kcyhjb21tYW5kSWRzOiBzdHJpbmdbXSk6IEtleWJpbmRpbmdSZXNvbHZlciB7XG5cdFx0Y29uc3QgaXRlbXM6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBLZXliaW5kaW5nc1JlZ2lzdHJ5LmdldERlZmF1bHRLZXliaW5kaW5nc0Zvck9TKE9TKSkge1xuXHRcdFx0aWYgKCFpdGVtLmNvbW1hbmQgfHwgIWNvbW1hbmRJZHMuaW5jbHVkZXMoaXRlbS5jb21tYW5kKSB8fCAhaXRlbS5rZXliaW5kaW5nKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZy5yZXNvbHZlS2V5YmluZGluZyhpdGVtLmtleWJpbmRpbmcsIE9TKVswXTtcblx0XHRcdGl0ZW1zLnB1c2gobmV3IFJlc29sdmVkS2V5YmluZGluZ0l0ZW0ocmVzb2x2ZWQsIGl0ZW0uY29tbWFuZCwgaXRlbS5jb21tYW5kQXJncywgaXRlbS53aGVuID8/IHVuZGVmaW5lZCwgdHJ1ZSwgbnVsbCwgZmFsc2UpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBLZXliaW5kaW5nUmVzb2x2ZXIoaXRlbXMsIFtdLCAoKSA9PiB7IH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gbG9va3VwRm9yQ29uZmlnKGRlZmF1bHRBY3Rpb246ICdzdGVlcicgfCAncXVldWUnKSB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IFtDaGF0Q29uZmlndXJhdGlvbi5SZXF1ZXN0UXVldWVpbmdEZWZhdWx0QWN0aW9uXTogZGVmYXVsdEFjdGlvbiB9KTtcblx0XHRjb25zdCBjdHhTZXJ2aWNlID0gbmV3IENvbnRleHRLZXlTZXJ2aWNlKGNvbmZpZyk7XG5cdFx0Ly8gU2ltdWxhdGUgdGhlIGNoYXQgaW5wdXQgYmVpbmcgZm9jdXNlZCB3aXRoIGEgcmVxdWVzdCBpbiBwcm9ncmVzcywgbGlrZSB0aGUgcGlja2VyIGRvZXMuXG5cdFx0Y29uc3Qgb3ZlcmxheSA9IGN0eFNlcnZpY2UuY3JlYXRlT3ZlcmxheShbXG5cdFx0XHRbQ2hhdENvbnRleHRLZXlzLmlucHV0SGFzVGV4dC5rZXksIHRydWVdLFxuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dC5rZXksIHRydWVdLFxuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5yZXF1ZXN0SW5Qcm9ncmVzcy5rZXksIHRydWVdLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gYnVpbGRSZXNvbHZlckZvckNvbW1hbmRzKFtDaGF0UXVldWVNZXNzYWdlQWN0aW9uLklELCBDaGF0U3RlZXJXaXRoTWVzc2FnZUFjdGlvbi5JRF0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0cXVldWU6IHJlc29sdmVyLmxvb2t1cFByaW1hcnlLZXliaW5kaW5nKENoYXRRdWV1ZU1lc3NhZ2VBY3Rpb24uSUQsIG92ZXJsYXksIHRydWUpPy5yZXNvbHZlZEtleWJpbmRpbmc/LmdldERpc3BhdGNoQ2hvcmRzKClbMF0gPz8gbnVsbCxcblx0XHRcdFx0c3RlZXI6IHJlc29sdmVyLmxvb2t1cFByaW1hcnlLZXliaW5kaW5nKENoYXRTdGVlcldpdGhNZXNzYWdlQWN0aW9uLklELCBvdmVybGF5LCB0cnVlKT8ucmVzb2x2ZWRLZXliaW5kaW5nPy5nZXREaXNwYXRjaENob3JkcygpWzBdID8/IG51bGwsXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gY3R4U2VydmljZS5kaXNwb3NlKCksXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3dpdGggZGVmYXVsdD1zdGVlciwgRW50ZXIgc3RlZXJzIGFuZCBBbHQrRW50ZXIgcXVldWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzdWx0LCBkaXNwb3NlIH0gPSBsb29rdXBGb3JDb25maWcoJ3N0ZWVyJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHF1ZXVlOiAnYWx0K0VudGVyJywgc3RlZXI6ICdFbnRlcicgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3dpdGggZGVmYXVsdD1xdWV1ZSwgRW50ZXIgcXVldWVzIGFuZCBBbHQrRW50ZXIgc3RlZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzdWx0LCBkaXNwb3NlIH0gPSBsb29rdXBGb3JDb25maWcoJ3F1ZXVlJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHF1ZXVlOiAnRW50ZXInLCBzdGVlcjogJ2FsdCtFbnRlcicgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDaGF0QXNrSW5TaWRlQ2hhdEFjdGlvbicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzZXR1cChvcHRpb25zOiB7IGNhbkFzaz86IGJvb2xlYW47IGFza0ZhaWxzPzogYm9vbGVhbiB9ID0ge30pIHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQvc291cmNlJyk7XG5cblx0XHRsZXQgaW5wdXQgPSAnd2hhdCBhYm91dCB0aGlzPyc7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SUNoYXRXaWRnZXRTZXJ2aWNlPih7XG5cdFx0XHRsYXN0Rm9jdXNlZFdpZGdldDogdXBjYXN0UGFydGlhbDxJQ2hhdFdpZGdldD4oe1xuXHRcdFx0XHRkb21Ob2RlOiBnZXRBY3RpdmVEb2N1bWVudCgpLmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0XHRpbnB1dEVkaXRvcjogeyBnZXREb21Ob2RlOiAoKSA9PiBudWxsIH0gYXMgSUNvZGVFZGl0b3IsXG5cdFx0XHRcdGdldElucHV0OiAoKSA9PiBpbnB1dCxcblx0XHRcdFx0c2V0SW5wdXQ6ICh2YWx1ZT86IHN0cmluZykgPT4geyBpbnB1dCA9IHZhbHVlID8/ICcnOyB9LFxuXHRcdFx0XHR2aWV3TW9kZWw6IHVwY2FzdFBhcnRpYWw8SUNoYXRWaWV3TW9kZWw+KHsgbW9kZWw6IHVwY2FzdFBhcnRpYWw8SUNoYXRNb2RlbD4oeyBzZXNzaW9uUmVzb3VyY2UgfSkgfSksXG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhc2tlZDogc3RyaW5nW10gPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2lkZUNoYXRTZXJ2aWNlLCB1cGNhc3RQYXJ0aWFsPElDaGF0U2lkZUNoYXRTZXJ2aWNlPih7XG5cdFx0XHRjYW5Bc2tJblNpZGVDaGF0OiAoKSA9PiBvcHRpb25zLmNhbkFzayA/PyB0cnVlLFxuXHRcdFx0YXNrSW5TaWRlQ2hhdDogYXN5bmMgKHJlc291cmNlLCBxdWVyeSkgPT4ge1xuXHRcdFx0XHRpZiAob3B0aW9ucy5hc2tGYWlscykge1xuXHRcdFx0XHRcdGFza2VkLnB1c2goJ2ZhaWxlZCcpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm9wZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFza2VkLnB1c2goYCR7cmVzb3VyY2UudG9TdHJpbmcoKX06JHtxdWVyeX1gKTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGlmaWNhdGlvblNlcnZpY2UsIG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBhY3Rpb24gPSBuZXcgQ2hhdEFza0luU2lkZUNoYXRBY3Rpb24oKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cnVuOiAoKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY3Rpb24ucnVuKGFjY2Vzc29yKSksXG5cdFx0XHRhc2tlZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGdldElucHV0OiAoKSA9PiBpbnB1dCxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnZGVsZWdhdGVzIHRoZSBjb21wb3NlZCBtZXNzYWdlIHRvIHRoZSBzaWRlIGNoYXQgc2VydmljZSBhbmQgY2xlYXJzIHRoZSBpbnB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHJ1biwgYXNrZWQsIHNlc3Npb25SZXNvdXJjZSwgZ2V0SW5wdXQgfSA9IHNldHVwKCk7XG5cblx0XHRhd2FpdCBydW4oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhc2tlZCwgaW5wdXQ6IGdldElucHV0KCkgfSwge1xuXHRcdFx0YXNrZWQ6IFtgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX06d2hhdCBhYm91dCB0aGlzP2BdLFxuXHRcdFx0aW5wdXQ6ICcnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyB0aGUgY29tcG9zZWQgbWVzc2FnZSB3aGVuIHRoZSBzaWRlIGNoYXQgY2Fubm90IGJlIGNyZWF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBydW4sIGFza2VkLCBnZXRJbnB1dCB9ID0gc2V0dXAoeyBhc2tGYWlsczogdHJ1ZSB9KTtcblxuXHRcdGF3YWl0IHJ1bigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFza2VkLCBpbnB1dDogZ2V0SW5wdXQoKSB9LCB7XG5cdFx0XHRhc2tlZDogWydmYWlsZWQnXSxcblx0XHRcdGlucHV0OiAnd2hhdCBhYm91dCB0aGlzPycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90aGluZyBidXQgd2FybiB3aGVuIG5vIHByb3ZpZGVyIHN1cHBvcnRzIHRoZSBjb252ZXJzYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBydW4sIGFza2VkLCBnZXRJbnB1dCB9ID0gc2V0dXAoeyBjYW5Bc2s6IGZhbHNlIH0pO1xuXG5cdFx0YXdhaXQgcnVuKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYXNrZWQsIGlucHV0OiBnZXRJbnB1dCgpIH0sIHtcblx0XHRcdGFza2VkOiBbXSxcblx0XHRcdGlucHV0OiAnd2hhdCBhYm91dCB0aGlzPycsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxV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
