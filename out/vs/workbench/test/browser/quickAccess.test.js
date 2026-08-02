var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import assert from "assert";
import { Registry } from "../../../platform/registry/common/platform.js";
import { Extensions } from "../../../platform/quickinput/common/quickAccess.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { TestServiceAccessor, workbenchInstantiationService, createEditorPart } from "./workbenchTestServices.js";
import { DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { timeout } from "../../../base/common/async.js";
import { PickerQuickAccessProvider } from "../../../platform/quickinput/browser/pickerQuickAccess.js";
import { URI } from "../../../base/common/uri.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { EditorService } from "../../services/editor/browser/editorService.js";
import { PickerEditorState } from "../../browser/quickaccess.js";
import { EditorsOrder } from "../../common/editor.js";
import { Range } from "../../../editor/common/core/range.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { IContextKeyService, ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../platform/configuration/test/common/testConfigurationService.js";
suite("QuickAccess", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let accessor;
  let providerDefaultCalled = false;
  let providerDefaultCanceled = false;
  let providerDefaultDisposed = false;
  let provider1Called = false;
  let provider1Canceled = false;
  let provider1Disposed = false;
  let provider2Called = false;
  let provider2Canceled = false;
  let provider2Disposed = false;
  let provider3Called = false;
  let provider3Canceled = false;
  let provider3Disposed = false;
  let TestProviderDefault = class {
    constructor(quickInputService, disposables2) {
      this.quickInputService = quickInputService;
    }
    provide(picker, token) {
      assert.ok(picker);
      providerDefaultCalled = true;
      const store = new DisposableStore();
      store.add(toDisposable(() => providerDefaultDisposed = true));
      store.add(token.onCancellationRequested(() => providerDefaultCanceled = true));
      setTimeout(() => this.quickInputService.quickAccess.show(providerDescriptor3.prefix));
      return store;
    }
  };
  TestProviderDefault = __decorateClass([
    __decorateParam(0, IQuickInputService)
  ], TestProviderDefault);
  class TestProvider1 {
    provide(picker, token) {
      assert.ok(picker);
      provider1Called = true;
      const store = new DisposableStore();
      store.add(token.onCancellationRequested(() => provider1Canceled = true));
      store.add(toDisposable(() => provider1Disposed = true));
      return store;
    }
  }
  class TestProvider2 {
    provide(picker, token) {
      assert.ok(picker);
      provider2Called = true;
      const store = new DisposableStore();
      store.add(token.onCancellationRequested(() => provider2Canceled = true));
      store.add(toDisposable(() => provider2Disposed = true));
      return store;
    }
  }
  class TestProvider3 {
    provide(picker, token) {
      assert.ok(picker);
      provider3Called = true;
      const store = new DisposableStore();
      store.add(token.onCancellationRequested(() => provider3Canceled = true));
      setTimeout(() => picker.hide());
      store.add(toDisposable(() => provider3Disposed = true));
      return store;
    }
  }
  const providerDescriptorDefault = { ctor: TestProviderDefault, prefix: "", helpEntries: [] };
  const providerDescriptor1 = { ctor: TestProvider1, prefix: "test", helpEntries: [] };
  const providerDescriptor2 = { ctor: TestProvider2, prefix: "test something", helpEntries: [] };
  const providerDescriptor3 = { ctor: TestProvider3, prefix: "changed", helpEntries: [] };
  setup(() => {
    instantiationService = workbenchInstantiationService(void 0, disposables);
    accessor = instantiationService.createInstance(TestServiceAccessor);
  });
  test("registry", () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const contextKeyService = instantiationService.get(IContextKeyService);
    assert.ok(!registry.getQuickAccessProvider("test", contextKeyService));
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptorDefault));
    assert(registry.getQuickAccessProvider("", contextKeyService) === providerDescriptorDefault);
    assert(registry.getQuickAccessProvider("test", contextKeyService) === providerDescriptorDefault);
    const disposable = disposables2.add(registry.registerQuickAccessProvider(providerDescriptor1));
    assert(registry.getQuickAccessProvider("test", contextKeyService) === providerDescriptor1);
    const providers = registry.getQuickAccessProviders(contextKeyService);
    assert(providers.some((provider) => provider.prefix === "test"));
    disposable.dispose();
    assert(registry.getQuickAccessProvider("test", contextKeyService) === providerDescriptorDefault);
    disposables2.dispose();
    assert.ok(!registry.getQuickAccessProvider("test", contextKeyService));
    restore();
  });
  test("registry - when condition", () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
    const localDisposables = new DisposableStore();
    const contextKey = contextKeyService.createKey("testQuickAccessContextKey", void 0);
    const providerWithWhen = {
      ctor: TestProvider1,
      prefix: "whentest",
      helpEntries: [],
      when: ContextKeyExpr.has("testQuickAccessContextKey")
    };
    localDisposables.add(registry.registerQuickAccessProvider(providerWithWhen));
    assert.strictEqual(contextKeyService.contextMatchesRules(providerWithWhen.when), false);
    assert.strictEqual(registry.getQuickAccessProvider("whentest", contextKeyService), void 0);
    let providers = registry.getQuickAccessProviders(contextKeyService);
    assert.ok(!providers.some((p) => p.prefix === "whentest"));
    contextKey.set(true);
    assert.strictEqual(contextKeyService.contextMatchesRules(providerWithWhen.when), true);
    assert.strictEqual(registry.getQuickAccessProvider("whentest", contextKeyService), providerWithWhen);
    providers = registry.getQuickAccessProviders(contextKeyService);
    assert.ok(providers.some((p) => p.prefix === "whentest"));
    contextKey.set(void 0);
    assert.strictEqual(registry.getQuickAccessProvider("whentest", contextKeyService), void 0);
    localDisposables.dispose();
    restore();
  });
  test("provider", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptorDefault));
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptor1));
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptor2));
    disposables2.add(registry.registerQuickAccessProvider(providerDescriptor3));
    accessor.quickInputService.quickAccess.show("test");
    assert.strictEqual(providerDefaultCalled, false);
    assert.strictEqual(provider1Called, true);
    assert.strictEqual(provider2Called, false);
    assert.strictEqual(provider3Called, false);
    assert.strictEqual(providerDefaultCanceled, false);
    assert.strictEqual(provider1Canceled, false);
    assert.strictEqual(provider2Canceled, false);
    assert.strictEqual(provider3Canceled, false);
    assert.strictEqual(providerDefaultDisposed, false);
    assert.strictEqual(provider1Disposed, false);
    assert.strictEqual(provider2Disposed, false);
    assert.strictEqual(provider3Disposed, false);
    provider1Called = false;
    accessor.quickInputService.quickAccess.show("test something");
    assert.strictEqual(providerDefaultCalled, false);
    assert.strictEqual(provider1Called, false);
    assert.strictEqual(provider2Called, true);
    assert.strictEqual(provider3Called, false);
    assert.strictEqual(providerDefaultCanceled, false);
    assert.strictEqual(provider1Canceled, true);
    assert.strictEqual(provider2Canceled, false);
    assert.strictEqual(provider3Canceled, false);
    assert.strictEqual(providerDefaultDisposed, false);
    assert.strictEqual(provider1Disposed, true);
    assert.strictEqual(provider2Disposed, false);
    assert.strictEqual(provider3Disposed, false);
    provider2Called = false;
    provider1Canceled = false;
    provider1Disposed = false;
    accessor.quickInputService.quickAccess.show("usedefault");
    assert.strictEqual(providerDefaultCalled, true);
    assert.strictEqual(provider1Called, false);
    assert.strictEqual(provider2Called, false);
    assert.strictEqual(provider3Called, false);
    assert.strictEqual(providerDefaultCanceled, false);
    assert.strictEqual(provider1Canceled, false);
    assert.strictEqual(provider2Canceled, true);
    assert.strictEqual(provider3Canceled, false);
    assert.strictEqual(providerDefaultDisposed, false);
    assert.strictEqual(provider1Disposed, false);
    assert.strictEqual(provider2Disposed, true);
    assert.strictEqual(provider3Disposed, false);
    await timeout(1);
    assert.strictEqual(providerDefaultCanceled, true);
    assert.strictEqual(providerDefaultDisposed, true);
    assert.strictEqual(provider3Called, true);
    await timeout(1);
    assert.strictEqual(provider3Canceled, true);
    assert.strictEqual(provider3Disposed, true);
    disposables2.dispose();
    restore();
  });
  let fastProviderCalled = false;
  let slowProviderCalled = false;
  let fastAndSlowProviderCalled = false;
  let slowProviderCanceled = false;
  let fastAndSlowProviderCanceled = false;
  class FastTestQuickPickProvider extends PickerQuickAccessProvider {
    constructor() {
      super("fast");
    }
    _getPicks(filter, disposables2, token) {
      fastProviderCalled = true;
      return [{ label: "Fast Pick" }];
    }
  }
  class SlowTestQuickPickProvider extends PickerQuickAccessProvider {
    constructor() {
      super("slow");
    }
    async _getPicks(filter, disposables2, token) {
      slowProviderCalled = true;
      await timeout(1);
      if (token.isCancellationRequested) {
        slowProviderCanceled = true;
      }
      return [{ label: "Slow Pick" }];
    }
  }
  class FastAndSlowTestQuickPickProvider extends PickerQuickAccessProvider {
    constructor() {
      super("bothFastAndSlow");
    }
    _getPicks(filter, disposables2, token) {
      fastAndSlowProviderCalled = true;
      return {
        picks: [{ label: "Fast Pick" }],
        additionalPicks: (async () => {
          await timeout(1);
          if (token.isCancellationRequested) {
            fastAndSlowProviderCanceled = true;
          }
          return [{ label: "Slow Pick" }];
        })()
      };
    }
  }
  const fastProviderDescriptor = { ctor: FastTestQuickPickProvider, prefix: "fast", helpEntries: [] };
  const slowProviderDescriptor = { ctor: SlowTestQuickPickProvider, prefix: "slow", helpEntries: [] };
  const fastAndSlowProviderDescriptor = { ctor: FastAndSlowTestQuickPickProvider, prefix: "bothFastAndSlow", helpEntries: [] };
  test("quick pick access - show()", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(fastProviderDescriptor));
    disposables2.add(registry.registerQuickAccessProvider(slowProviderDescriptor));
    disposables2.add(registry.registerQuickAccessProvider(fastAndSlowProviderDescriptor));
    accessor.quickInputService.quickAccess.show("fast");
    assert.strictEqual(fastProviderCalled, true);
    assert.strictEqual(slowProviderCalled, false);
    assert.strictEqual(fastAndSlowProviderCalled, false);
    fastProviderCalled = false;
    accessor.quickInputService.quickAccess.show("slow");
    await timeout(2);
    assert.strictEqual(fastProviderCalled, false);
    assert.strictEqual(slowProviderCalled, true);
    assert.strictEqual(slowProviderCanceled, false);
    assert.strictEqual(fastAndSlowProviderCalled, false);
    slowProviderCalled = false;
    accessor.quickInputService.quickAccess.show("bothFastAndSlow");
    await timeout(2);
    assert.strictEqual(fastProviderCalled, false);
    assert.strictEqual(slowProviderCalled, false);
    assert.strictEqual(fastAndSlowProviderCalled, true);
    assert.strictEqual(fastAndSlowProviderCanceled, false);
    fastAndSlowProviderCalled = false;
    accessor.quickInputService.quickAccess.show("slow");
    accessor.quickInputService.quickAccess.show("bothFastAndSlow");
    accessor.quickInputService.quickAccess.show("fast");
    assert.strictEqual(fastProviderCalled, true);
    assert.strictEqual(slowProviderCalled, true);
    assert.strictEqual(fastAndSlowProviderCalled, true);
    await timeout(2);
    assert.strictEqual(slowProviderCanceled, true);
    assert.strictEqual(fastAndSlowProviderCanceled, true);
    disposables2.dispose();
    restore();
  });
  test("quick pick access - pick()", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(fastProviderDescriptor));
    const result = accessor.quickInputService.quickAccess.pick("fast");
    assert.strictEqual(fastProviderCalled, true);
    assert.ok(result instanceof Promise);
    disposables2.dispose();
    restore();
  });
  test("PickerEditorState can properly restore editors", async () => {
    const part = await createEditorPart(instantiationService, disposables.add(new DisposableStore()));
    instantiationService.stub(IEditorGroupsService, part);
    const editorService = disposables.add(instantiationService.createInstance(EditorService, void 0));
    instantiationService.stub(IEditorService, editorService);
    const editorViewState = disposables.add(instantiationService.createInstance(PickerEditorState));
    disposables.add(part);
    disposables.add(editorService);
    const input1 = {
      resource: URI.parse("foo://bar1"),
      options: {
        pinned: true,
        preserveFocus: true,
        selection: new Range(1, 0, 1, 3)
      }
    };
    const input2 = {
      resource: URI.parse("foo://bar2"),
      options: {
        pinned: true,
        selection: new Range(1, 0, 1, 3)
      }
    };
    const input3 = {
      resource: URI.parse("foo://bar3")
    };
    const input4 = {
      resource: URI.parse("foo://bar4")
    };
    const editor = await editorService.openEditor(input1);
    assert.strictEqual(editor, editorService.activeEditorPane);
    editorViewState.set();
    await editorService.openEditor(input2);
    await editorViewState.openTransientEditor(input3);
    await editorViewState.openTransientEditor(input4);
    await editorViewState.restore();
    assert.strictEqual(part.activeGroup.activeEditor?.resource, input1.resource);
    assert.deepStrictEqual(part.activeGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map((e) => e.resource), [input1.resource, input2.resource]);
    if (part.activeGroup.activeEditorPane?.getSelection) {
      assert.deepStrictEqual(part.activeGroup.activeEditorPane?.getSelection(), input1.options.selection);
    }
    await part.activeGroup.closeAllEditors();
  });
  let attachTestAcceptCalled = false;
  let attachTestAttachCalled = false;
  let attachTestAttachKeyMods;
  class AttachTestQuickPickProvider extends PickerQuickAccessProvider {
    constructor() {
      super("attach");
    }
    _getPicks() {
      return [{
        label: "Test Item",
        accept: () => {
          attachTestAcceptCalled = true;
        },
        attach: (keyMods) => {
          attachTestAttachCalled = true;
          attachTestAttachKeyMods = keyMods;
        }
      }];
    }
  }
  class AttachTestNoAttachProvider extends PickerQuickAccessProvider {
    constructor() {
      super("noattach");
    }
    _getPicks() {
      return [{
        label: "No Attach Item",
        accept: () => {
          attachTestAcceptCalled = true;
        }
      }];
    }
  }
  const attachProviderDescriptor = { ctor: AttachTestQuickPickProvider, prefix: "attach", helpEntries: [] };
  const noAttachProviderDescriptor = { ctor: AttachTestNoAttachProvider, prefix: "noattach", helpEntries: [] };
  function resetAttachState() {
    attachTestAcceptCalled = false;
    attachTestAttachCalled = false;
    attachTestAttachKeyMods = void 0;
  }
  test("quick pick access - accept without modifier keys calls accept, not attach", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(attachProviderDescriptor));
    resetAttachState();
    accessor.quickInputService.quickAccess.show("attach");
    await accessor.quickInputService.accept();
    assert.strictEqual(attachTestAcceptCalled, true);
    assert.strictEqual(attachTestAttachCalled, false);
    disposables2.dispose();
    restore();
  });
  test("quick pick access - accept with ctrlCmd calls attach instead of accept", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(attachProviderDescriptor));
    resetAttachState();
    accessor.quickInputService.quickAccess.show("attach");
    await accessor.quickInputService.accept({ ctrlCmd: true, alt: false, shift: false });
    assert.strictEqual(attachTestAcceptCalled, false);
    assert.strictEqual(attachTestAttachCalled, true);
    assert.deepStrictEqual(attachTestAttachKeyMods, { ctrlCmd: true, alt: false, shift: false });
    disposables2.dispose();
    restore();
  });
  test("quick pick access - accept with alt calls attach instead of accept", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(attachProviderDescriptor));
    resetAttachState();
    accessor.quickInputService.quickAccess.show("attach");
    await accessor.quickInputService.accept({ ctrlCmd: false, alt: true, shift: false });
    assert.strictEqual(attachTestAcceptCalled, false);
    assert.strictEqual(attachTestAttachCalled, true);
    assert.deepStrictEqual(attachTestAttachKeyMods, { ctrlCmd: false, alt: true, shift: false });
    disposables2.dispose();
    restore();
  });
  test("quick pick access - accept with modifier keys but no attach method calls accept", async () => {
    const registry = Registry.as(Extensions.Quickaccess);
    const restore = registry.clear();
    const disposables2 = new DisposableStore();
    disposables2.add(registry.registerQuickAccessProvider(noAttachProviderDescriptor));
    resetAttachState();
    accessor.quickInputService.quickAccess.show("noattach");
    await accessor.quickInputService.accept({ ctrlCmd: true, alt: false, shift: false });
    assert.strictEqual(attachTestAcceptCalled, true);
    assert.strictEqual(attachTestAttachCalled, false);
    disposables2.dispose();
    restore();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvcXVpY2tBY2Nlc3MudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElRdWlja0FjY2Vzc1JlZ2lzdHJ5LCBFeHRlbnNpb25zLCBJUXVpY2tBY2Nlc3NQcm92aWRlciwgUXVpY2tBY2Nlc3NSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElLZXlNb2RzLCBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RTZXJ2aWNlQWNjZXNzb3IsIHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlLCBjcmVhdGVFZGl0b3JQYXJ0IH0gZnJvbSAnLi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyLCBGYXN0QW5kU2xvd1BpY2tzLCBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3BpY2tlclF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2Jyb3dzZXIvZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQaWNrZXJFZGl0b3JTdGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcXVpY2thY2Nlc3MuanMnO1xuaW1wb3J0IHsgRWRpdG9yc09yZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1F1aWNrQWNjZXNzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgYWNjZXNzb3I6IFRlc3RTZXJ2aWNlQWNjZXNzb3I7XG5cblx0bGV0IHByb3ZpZGVyRGVmYXVsdENhbGxlZCA9IGZhbHNlO1xuXHRsZXQgcHJvdmlkZXJEZWZhdWx0Q2FuY2VsZWQgPSBmYWxzZTtcblx0bGV0IHByb3ZpZGVyRGVmYXVsdERpc3Bvc2VkID0gZmFsc2U7XG5cblx0bGV0IHByb3ZpZGVyMUNhbGxlZCA9IGZhbHNlO1xuXHRsZXQgcHJvdmlkZXIxQ2FuY2VsZWQgPSBmYWxzZTtcblx0bGV0IHByb3ZpZGVyMURpc3Bvc2VkID0gZmFsc2U7XG5cblx0bGV0IHByb3ZpZGVyMkNhbGxlZCA9IGZhbHNlO1xuXHRsZXQgcHJvdmlkZXIyQ2FuY2VsZWQgPSBmYWxzZTtcblx0bGV0IHByb3ZpZGVyMkRpc3Bvc2VkID0gZmFsc2U7XG5cblx0bGV0IHByb3ZpZGVyM0NhbGxlZCA9IGZhbHNlO1xuXHRsZXQgcHJvdmlkZXIzQ2FuY2VsZWQgPSBmYWxzZTtcblx0bGV0IHByb3ZpZGVyM0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y2xhc3MgVGVzdFByb3ZpZGVyRGVmYXVsdCBpbXBsZW1lbnRzIElRdWlja0FjY2Vzc1Byb3ZpZGVyIHtcblxuXHRcdGNvbnN0cnVjdG9yKEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSB7IH1cblxuXHRcdHByb3ZpZGUocGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IElEaXNwb3NhYmxlIHtcblx0XHRcdGFzc2VydC5vayhwaWNrZXIpO1xuXHRcdFx0cHJvdmlkZXJEZWZhdWx0Q2FsbGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwcm92aWRlckRlZmF1bHREaXNwb3NlZCA9IHRydWUpKTtcblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBwcm92aWRlckRlZmF1bHRDYW5jZWxlZCA9IHRydWUpKTtcblxuXHRcdFx0Ly8gYnJpbmcgdXAgcHJvdmlkZXIgIzNcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KHByb3ZpZGVyRGVzY3JpcHRvcjMucHJlZml4KSk7XG5cblx0XHRcdHJldHVybiBzdG9yZTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBUZXN0UHJvdmlkZXIxIGltcGxlbWVudHMgSVF1aWNrQWNjZXNzUHJvdmlkZXIge1xuXHRcdHByb3ZpZGUocGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IElEaXNwb3NhYmxlIHtcblx0XHRcdGFzc2VydC5vayhwaWNrZXIpO1xuXHRcdFx0cHJvdmlkZXIxQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHByb3ZpZGVyMUNhbmNlbGVkID0gdHJ1ZSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHByb3ZpZGVyMURpc3Bvc2VkID0gdHJ1ZSkpO1xuXHRcdFx0cmV0dXJuIHN0b3JlO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIFRlc3RQcm92aWRlcjIgaW1wbGVtZW50cyBJUXVpY2tBY2Nlc3NQcm92aWRlciB7XG5cdFx0cHJvdmlkZShwaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogSURpc3Bvc2FibGUge1xuXHRcdFx0YXNzZXJ0Lm9rKHBpY2tlcik7XG5cdFx0XHRwcm92aWRlcjJDYWxsZWQgPSB0cnVlO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcHJvdmlkZXIyQ2FuY2VsZWQgPSB0cnVlKSk7XG5cblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcHJvdmlkZXIyRGlzcG9zZWQgPSB0cnVlKSk7XG5cdFx0XHRyZXR1cm4gc3RvcmU7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgVGVzdFByb3ZpZGVyMyBpbXBsZW1lbnRzIElRdWlja0FjY2Vzc1Byb3ZpZGVyIHtcblx0XHRwcm92aWRlKHBpY2tlcjogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0XHRhc3NlcnQub2socGlja2VyKTtcblx0XHRcdHByb3ZpZGVyM0NhbGxlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBwcm92aWRlcjNDYW5jZWxlZCA9IHRydWUpKTtcblxuXHRcdFx0Ly8gaGlkZSB3aXRob3V0IHBpY2tpbmdcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gcGlja2VyLmhpZGUoKSk7XG5cblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcHJvdmlkZXIzRGlzcG9zZWQgPSB0cnVlKSk7XG5cdFx0XHRyZXR1cm4gc3RvcmU7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgcHJvdmlkZXJEZXNjcmlwdG9yRGVmYXVsdCA9IHsgY3RvcjogVGVzdFByb3ZpZGVyRGVmYXVsdCwgcHJlZml4OiAnJywgaGVscEVudHJpZXM6IFtdIH07XG5cdGNvbnN0IHByb3ZpZGVyRGVzY3JpcHRvcjEgPSB7IGN0b3I6IFRlc3RQcm92aWRlcjEsIHByZWZpeDogJ3Rlc3QnLCBoZWxwRW50cmllczogW10gfTtcblx0Y29uc3QgcHJvdmlkZXJEZXNjcmlwdG9yMiA9IHsgY3RvcjogVGVzdFByb3ZpZGVyMiwgcHJlZml4OiAndGVzdCBzb21ldGhpbmcnLCBoZWxwRW50cmllczogW10gfTtcblx0Y29uc3QgcHJvdmlkZXJEZXNjcmlwdG9yMyA9IHsgY3RvcjogVGVzdFByb3ZpZGVyMywgcHJlZml4OiAnY2hhbmdlZCcsIGhlbHBFbnRyaWVzOiBbXSB9O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpO1xuXHRcdGFjY2Vzc29yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlcnZpY2VBY2Nlc3Nvcik7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gKFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlF1aWNrYWNjZXNzKSk7XG5cdFx0Y29uc3QgcmVzdG9yZSA9IChyZWdpc3RyeSBhcyBRdWlja0FjY2Vzc1JlZ2lzdHJ5KS5jbGVhcigpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRhc3NlcnQub2soIXJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIoJ3Rlc3QnLCBjb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHByb3ZpZGVyRGVzY3JpcHRvckRlZmF1bHQpKTtcblx0XHRhc3NlcnQocmVnaXN0cnkuZ2V0UXVpY2tBY2Nlc3NQcm92aWRlcignJywgY29udGV4dEtleVNlcnZpY2UpID09PSBwcm92aWRlckRlc2NyaXB0b3JEZWZhdWx0KTtcblx0XHRhc3NlcnQocmVnaXN0cnkuZ2V0UXVpY2tBY2Nlc3NQcm92aWRlcigndGVzdCcsIGNvbnRleHRLZXlTZXJ2aWNlKSA9PT0gcHJvdmlkZXJEZXNjcmlwdG9yRGVmYXVsdCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihwcm92aWRlckRlc2NyaXB0b3IxKSk7XG5cdFx0YXNzZXJ0KHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIoJ3Rlc3QnLCBjb250ZXh0S2V5U2VydmljZSkgPT09IHByb3ZpZGVyRGVzY3JpcHRvcjEpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gcmVnaXN0cnkuZ2V0UXVpY2tBY2Nlc3NQcm92aWRlcnMoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydChwcm92aWRlcnMuc29tZShwcm92aWRlciA9PiBwcm92aWRlci5wcmVmaXggPT09ICd0ZXN0JykpO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0KHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIoJ3Rlc3QnLCBjb250ZXh0S2V5U2VydmljZSkgPT09IHByb3ZpZGVyRGVzY3JpcHRvckRlZmF1bHQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayghcmVnaXN0cnkuZ2V0UXVpY2tBY2Nlc3NQcm92aWRlcigndGVzdCcsIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cblx0XHRyZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdHJ5IC0gd2hlbiBjb25kaXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSAoUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpKTtcblx0XHRjb25zdCByZXN0b3JlID0gKHJlZ2lzdHJ5IGFzIFF1aWNrQWNjZXNzUmVnaXN0cnkpLmNsZWFyKCk7XG5cblx0XHQvLyBVc2UgcmVhbCBDb250ZXh0S2V5U2VydmljZSB0aGF0IHByb3Blcmx5IGV2YWx1YXRlcyBydWxlc1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBsb2NhbERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgY29udGV4dCBrZXkgdGhhdCBzdGFydHMgYXMgdW5kZWZpbmVkIChmYWxzeSlcblx0XHRjb25zdCBjb250ZXh0S2V5ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4gfCB1bmRlZmluZWQ+KCd0ZXN0UXVpY2tBY2Nlc3NDb250ZXh0S2V5JywgdW5kZWZpbmVkKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGEgcHJvdmlkZXIgd2l0aCBhIHdoZW4gY29uZGl0aW9uIHRoYXQgcmVxdWlyZXMgdGVzdFF1aWNrQWNjZXNzQ29udGV4dEtleSB0byBiZSB0cnV0aHlcblx0XHRjb25zdCBwcm92aWRlcldpdGhXaGVuID0ge1xuXHRcdFx0Y3RvcjogVGVzdFByb3ZpZGVyMSxcblx0XHRcdHByZWZpeDogJ3doZW50ZXN0Jyxcblx0XHRcdGhlbHBFbnRyaWVzOiBbXSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmhhcygndGVzdFF1aWNrQWNjZXNzQ29udGV4dEtleScpXG5cdFx0fTtcblx0XHRsb2NhbERpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIocHJvdmlkZXJXaXRoV2hlbikpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBleHByZXNzaW9uIHdvcmtzIHdpdGggdGhlIGNvbnRleHQga2V5IHNlcnZpY2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhwcm92aWRlcldpdGhXaGVuLndoZW4pLCBmYWxzZSk7XG5cblx0XHQvLyBQcm92aWRlciB3aXRoIGZhbHNlIHdoZW4gY29uZGl0aW9uIHNob3VsZCBub3QgYmUgZm91bmRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkuZ2V0UXVpY2tBY2Nlc3NQcm92aWRlcignd2hlbnRlc3QnLCBjb250ZXh0S2V5U2VydmljZSksIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBTaG91bGQgbm90IGFwcGVhciBpbiB0aGUgbGlzdCBvZiBwcm92aWRlcnNcblx0XHRsZXQgcHJvdmlkZXJzID0gcmVnaXN0cnkuZ2V0UXVpY2tBY2Nlc3NQcm92aWRlcnMoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayghcHJvdmlkZXJzLnNvbWUocCA9PiBwLnByZWZpeCA9PT0gJ3doZW50ZXN0JykpO1xuXG5cdFx0Ly8gU2V0IHRoZSBjb250ZXh0IGtleSB0byB0cnVlXG5cdFx0Y29udGV4dEtleS5zZXQodHJ1ZSk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGV4cHJlc3Npb24gbm93IG1hdGNoZXNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhwcm92aWRlcldpdGhXaGVuLndoZW4pLCB0cnVlKTtcblxuXHRcdC8vIE5vdyB0aGUgcHJvdmlkZXIgc2hvdWxkIGJlIGZvdW5kXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIoJ3doZW50ZXN0JywgY29udGV4dEtleVNlcnZpY2UpLCBwcm92aWRlcldpdGhXaGVuKTtcblxuXHRcdC8vIFNob3VsZCBhcHBlYXIgaW4gdGhlIGxpc3Qgb2YgcHJvdmlkZXJzXG5cdFx0cHJvdmlkZXJzID0gcmVnaXN0cnkuZ2V0UXVpY2tBY2Nlc3NQcm92aWRlcnMoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGFzc2VydC5vayhwcm92aWRlcnMuc29tZShwID0+IHAucHJlZml4ID09PSAnd2hlbnRlc3QnKSk7XG5cblx0XHQvLyBTZXQgY29udGV4dCBrZXkgYmFjayB0byB1bmRlZmluZWQgKGZhbHN5KVxuXHRcdGNvbnRleHRLZXkuc2V0KHVuZGVmaW5lZCk7XG5cblx0XHQvLyBQcm92aWRlciBzaG91bGQgbm90IGJlIGZvdW5kIGFnYWluXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIoJ3doZW50ZXN0JywgY29udGV4dEtleVNlcnZpY2UpLCB1bmRlZmluZWQpO1xuXG5cdFx0bG9jYWxEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRyZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gKFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlF1aWNrYWNjZXNzKSk7XG5cdFx0Y29uc3QgcmVzdG9yZSA9IChyZWdpc3RyeSBhcyBRdWlja0FjY2Vzc1JlZ2lzdHJ5KS5jbGVhcigpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHByb3ZpZGVyRGVzY3JpcHRvckRlZmF1bHQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHByb3ZpZGVyRGVzY3JpcHRvcjEpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHByb3ZpZGVyRGVzY3JpcHRvcjIpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHByb3ZpZGVyRGVzY3JpcHRvcjMpKTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ3Rlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJEZWZhdWx0Q2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMUNhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMkNhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjNDYWxsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJEZWZhdWx0Q2FuY2VsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIxQ2FuY2VsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIyQ2FuY2VsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzQ2FuY2VsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJEZWZhdWx0RGlzcG9zZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIxRGlzcG9zZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIyRGlzcG9zZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzRGlzcG9zZWQsIGZhbHNlKTtcblx0XHRwcm92aWRlcjFDYWxsZWQgPSBmYWxzZTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ3Rlc3Qgc29tZXRoaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdENhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjFDYWxsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIyQ2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzQ2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdENhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMUNhbmNlbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIyQ2FuY2VsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIzQ2FuY2VsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJEZWZhdWx0RGlzcG9zZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIxRGlzcG9zZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjJEaXNwb3NlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjNEaXNwb3NlZCwgZmFsc2UpO1xuXHRcdHByb3ZpZGVyMkNhbGxlZCA9IGZhbHNlO1xuXHRcdHByb3ZpZGVyMUNhbmNlbGVkID0gZmFsc2U7XG5cdFx0cHJvdmlkZXIxRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ3VzZWRlZmF1bHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJEZWZhdWx0Q2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIxQ2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyMkNhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjNDYWxsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJEZWZhdWx0Q2FuY2VsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIxQ2FuY2VsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIyQ2FuY2VsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjNDYW5jZWxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlckRlZmF1bHREaXNwb3NlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjFEaXNwb3NlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjJEaXNwb3NlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyM0Rpc3Bvc2VkLCBmYWxzZSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyRGVmYXVsdENhbmNlbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJEZWZhdWx0RGlzcG9zZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjNDYWxsZWQsIHRydWUpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlcjNDYW5jZWxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyM0Rpc3Bvc2VkLCB0cnVlKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHJlc3RvcmUoKTtcblx0fSk7XG5cblx0bGV0IGZhc3RQcm92aWRlckNhbGxlZCA9IGZhbHNlO1xuXHRsZXQgc2xvd1Byb3ZpZGVyQ2FsbGVkID0gZmFsc2U7XG5cdGxldCBmYXN0QW5kU2xvd1Byb3ZpZGVyQ2FsbGVkID0gZmFsc2U7XG5cblx0bGV0IHNsb3dQcm92aWRlckNhbmNlbGVkID0gZmFsc2U7XG5cdGxldCBmYXN0QW5kU2xvd1Byb3ZpZGVyQ2FuY2VsZWQgPSBmYWxzZTtcblxuXHRjbGFzcyBGYXN0VGVzdFF1aWNrUGlja1Byb3ZpZGVyIGV4dGVuZHMgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlcjxJUXVpY2tQaWNrSXRlbT4ge1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcignZmFzdCcpO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBfZ2V0UGlja3MoZmlsdGVyOiBzdHJpbmcsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IEFycmF5PElRdWlja1BpY2tJdGVtPiB7XG5cdFx0XHRmYXN0UHJvdmlkZXJDYWxsZWQgPSB0cnVlO1xuXG5cdFx0XHRyZXR1cm4gW3sgbGFiZWw6ICdGYXN0IFBpY2snIH1dO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIFNsb3dUZXN0UXVpY2tQaWNrUHJvdmlkZXIgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElRdWlja1BpY2tJdGVtPiB7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKCdzbG93Jyk7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIGFzeW5jIF9nZXRQaWNrcyhmaWx0ZXI6IHN0cmluZywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxBcnJheTxJUXVpY2tQaWNrSXRlbT4+IHtcblx0XHRcdHNsb3dQcm92aWRlckNhbGxlZCA9IHRydWU7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRzbG93UHJvdmlkZXJDYW5jZWxlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBbeyBsYWJlbDogJ1Nsb3cgUGljaycgfV07XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgRmFzdEFuZFNsb3dUZXN0UXVpY2tQaWNrUHJvdmlkZXIgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElRdWlja1BpY2tJdGVtPiB7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKCdib3RoRmFzdEFuZFNsb3cnKTtcblx0XHR9XG5cblx0XHRwcm90ZWN0ZWQgX2dldFBpY2tzKGZpbHRlcjogc3RyaW5nLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBGYXN0QW5kU2xvd1BpY2tzPElRdWlja1BpY2tJdGVtPiB7XG5cdFx0XHRmYXN0QW5kU2xvd1Byb3ZpZGVyQ2FsbGVkID0gdHJ1ZTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cGlja3M6IFt7IGxhYmVsOiAnRmFzdCBQaWNrJyB9XSxcblx0XHRcdFx0YWRkaXRpb25hbFBpY2tzOiAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdGZhc3RBbmRTbG93UHJvdmlkZXJDYW5jZWxlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIFt7IGxhYmVsOiAnU2xvdyBQaWNrJyB9XTtcblx0XHRcdFx0fSkoKVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBmYXN0UHJvdmlkZXJEZXNjcmlwdG9yID0geyBjdG9yOiBGYXN0VGVzdFF1aWNrUGlja1Byb3ZpZGVyLCBwcmVmaXg6ICdmYXN0JywgaGVscEVudHJpZXM6IFtdIH07XG5cdGNvbnN0IHNsb3dQcm92aWRlckRlc2NyaXB0b3IgPSB7IGN0b3I6IFNsb3dUZXN0UXVpY2tQaWNrUHJvdmlkZXIsIHByZWZpeDogJ3Nsb3cnLCBoZWxwRW50cmllczogW10gfTtcblx0Y29uc3QgZmFzdEFuZFNsb3dQcm92aWRlckRlc2NyaXB0b3IgPSB7IGN0b3I6IEZhc3RBbmRTbG93VGVzdFF1aWNrUGlja1Byb3ZpZGVyLCBwcmVmaXg6ICdib3RoRmFzdEFuZFNsb3cnLCBoZWxwRW50cmllczogW10gfTtcblxuXHR0ZXN0KCdxdWljayBwaWNrIGFjY2VzcyAtIHNob3coKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IChSZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5RdWlja2FjY2VzcykpO1xuXHRcdGNvbnN0IHJlc3RvcmUgPSAocmVnaXN0cnkgYXMgUXVpY2tBY2Nlc3NSZWdpc3RyeSkuY2xlYXIoKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihmYXN0UHJvdmlkZXJEZXNjcmlwdG9yKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihzbG93UHJvdmlkZXJEZXNjcmlwdG9yKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihmYXN0QW5kU2xvd1Byb3ZpZGVyRGVzY3JpcHRvcikpO1xuXG5cdFx0YWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdygnZmFzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXN0UHJvdmlkZXJDYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbG93UHJvdmlkZXJDYWxsZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdEFuZFNsb3dQcm92aWRlckNhbGxlZCwgZmFsc2UpO1xuXHRcdGZhc3RQcm92aWRlckNhbGxlZCA9IGZhbHNlO1xuXG5cdFx0YWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdygnc2xvdycpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdFByb3ZpZGVyQ2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsb3dQcm92aWRlckNhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsb3dQcm92aWRlckNhbmNlbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhc3RBbmRTbG93UHJvdmlkZXJDYWxsZWQsIGZhbHNlKTtcblx0XHRzbG93UHJvdmlkZXJDYWxsZWQgPSBmYWxzZTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ2JvdGhGYXN0QW5kU2xvdycpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdFByb3ZpZGVyQ2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsb3dQcm92aWRlckNhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXN0QW5kU2xvd1Byb3ZpZGVyQ2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdEFuZFNsb3dQcm92aWRlckNhbmNlbGVkLCBmYWxzZSk7XG5cdFx0ZmFzdEFuZFNsb3dQcm92aWRlckNhbGxlZCA9IGZhbHNlO1xuXG5cdFx0YWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdygnc2xvdycpO1xuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ2JvdGhGYXN0QW5kU2xvdycpO1xuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ2Zhc3QnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXN0UHJvdmlkZXJDYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbG93UHJvdmlkZXJDYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXN0QW5kU2xvd1Byb3ZpZGVyQ2FsbGVkLCB0cnVlKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsb3dQcm92aWRlckNhbmNlbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFzdEFuZFNsb3dQcm92aWRlckNhbmNlbGVkLCB0cnVlKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHJlc3RvcmUoKTtcblx0fSk7XG5cblx0dGVzdCgncXVpY2sgcGljayBhY2Nlc3MgLSBwaWNrKCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSAoUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpKTtcblx0XHRjb25zdCByZXN0b3JlID0gKHJlZ2lzdHJ5IGFzIFF1aWNrQWNjZXNzUmVnaXN0cnkpLmNsZWFyKCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoZmFzdFByb3ZpZGVyRGVzY3JpcHRvcikpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3MucGljaygnZmFzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXN0UHJvdmlkZXJDYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHJlc3RvcmUoKTtcblx0fSk7XG5cblx0dGVzdCgnUGlja2VyRWRpdG9yU3RhdGUgY2FuIHByb3Blcmx5IHJlc3RvcmUgZWRpdG9ycycsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IHBhcnQgPSBhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yR3JvdXBzU2VydmljZSwgcGFydCk7XG5cblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvclNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIGVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZWRpdG9yVmlld1N0YXRlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBpY2tlckVkaXRvclN0YXRlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGlucHV0MSA9IHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZvbzovL2JhcjEnKSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0cGlubmVkOiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCBzZWxlY3Rpb246IG5ldyBSYW5nZSgxLCAwLCAxLCAzKVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgaW5wdXQyID0ge1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgnZm9vOi8vYmFyMicpLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRwaW5uZWQ6IHRydWUsIHNlbGVjdGlvbjogbmV3IFJhbmdlKDEsIDAsIDEsIDMpXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBpbnB1dDMgPSB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdmb286Ly9iYXIzJylcblx0XHR9O1xuXHRcdGNvbnN0IGlucHV0NCA9IHtcblx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZvbzovL2JhcjQnKVxuXHRcdH07XG5cblx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLCBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdGVkaXRvclZpZXdTdGF0ZS5zZXQoKTtcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQyKTtcblx0XHRhd2FpdCBlZGl0b3JWaWV3U3RhdGUub3BlblRyYW5zaWVudEVkaXRvcihpbnB1dDMpO1xuXHRcdGF3YWl0IGVkaXRvclZpZXdTdGF0ZS5vcGVuVHJhbnNpZW50RWRpdG9yKGlucHV0NCk7XG5cdFx0YXdhaXQgZWRpdG9yVmlld1N0YXRlLnJlc3RvcmUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvcj8ucmVzb3VyY2UsIGlucHV0MS5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0LmFjdGl2ZUdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5tYXAoZSA9PiBlLnJlc291cmNlKSwgW2lucHV0MS5yZXNvdXJjZSwgaW5wdXQyLnJlc291cmNlXSk7XG5cdFx0aWYgKHBhcnQuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0U2VsZWN0aW9uKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0U2VsZWN0aW9uKCksIGlucHV0MS5vcHRpb25zLnNlbGVjdGlvbik7XG5cdFx0fVxuXHRcdGF3YWl0IHBhcnQuYWN0aXZlR3JvdXAuY2xvc2VBbGxFZGl0b3JzKCk7XG5cdH0pO1xuXG5cdC8vI3JlZ2lvbiBhdHRhY2ggZGlzcGF0Y2ggdGVzdHNcblxuXHRpbnRlcmZhY2UgSVRlc3RBdHRhY2hQaWNrSXRlbSBleHRlbmRzIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0ge1xuXHRcdGxhYmVsOiBzdHJpbmc7XG5cdFx0YWNjZXB0PyhrZXlNb2RzOiBJS2V5TW9kcywgZXZlbnQ6IElRdWlja1BpY2tEaWRBY2NlcHRFdmVudCk6IHZvaWQ7XG5cdFx0YXR0YWNoPyhrZXlNb2RzOiBJS2V5TW9kcywgZXZlbnQ6IElRdWlja1BpY2tEaWRBY2NlcHRFdmVudCk6IHZvaWQ7XG5cdH1cblxuXHRsZXQgYXR0YWNoVGVzdEFjY2VwdENhbGxlZCA9IGZhbHNlO1xuXHRsZXQgYXR0YWNoVGVzdEF0dGFjaENhbGxlZCA9IGZhbHNlO1xuXHRsZXQgYXR0YWNoVGVzdEF0dGFjaEtleU1vZHM6IElLZXlNb2RzIHwgdW5kZWZpbmVkO1xuXG5cdGNsYXNzIEF0dGFjaFRlc3RRdWlja1BpY2tQcm92aWRlciBleHRlbmRzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8SVRlc3RBdHRhY2hQaWNrSXRlbT4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoJ2F0dGFjaCcpO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBfZ2V0UGlja3MoKTogSVRlc3RBdHRhY2hQaWNrSXRlbVtdIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgSXRlbScsXG5cdFx0XHRcdGFjY2VwdDogKCkgPT4ge1xuXHRcdFx0XHRcdGF0dGFjaFRlc3RBY2NlcHRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhdHRhY2g6IChrZXlNb2RzKSA9PiB7XG5cdFx0XHRcdFx0YXR0YWNoVGVzdEF0dGFjaENhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXR0YWNoVGVzdEF0dGFjaEtleU1vZHMgPSBrZXlNb2RzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XTtcblx0XHR9XG5cdH1cblxuXHRjbGFzcyBBdHRhY2hUZXN0Tm9BdHRhY2hQcm92aWRlciBleHRlbmRzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8SVRlc3RBdHRhY2hQaWNrSXRlbT4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoJ25vYXR0YWNoJyk7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIF9nZXRQaWNrcygpOiBJVGVzdEF0dGFjaFBpY2tJdGVtW10ge1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdGxhYmVsOiAnTm8gQXR0YWNoIEl0ZW0nLFxuXHRcdFx0XHRhY2NlcHQ6ICgpID0+IHtcblx0XHRcdFx0XHRhdHRhY2hUZXN0QWNjZXB0Q2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fV07XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgYXR0YWNoUHJvdmlkZXJEZXNjcmlwdG9yID0geyBjdG9yOiBBdHRhY2hUZXN0UXVpY2tQaWNrUHJvdmlkZXIsIHByZWZpeDogJ2F0dGFjaCcsIGhlbHBFbnRyaWVzOiBbXSB9O1xuXHRjb25zdCBub0F0dGFjaFByb3ZpZGVyRGVzY3JpcHRvciA9IHsgY3RvcjogQXR0YWNoVGVzdE5vQXR0YWNoUHJvdmlkZXIsIHByZWZpeDogJ25vYXR0YWNoJywgaGVscEVudHJpZXM6IFtdIH07XG5cblx0ZnVuY3Rpb24gcmVzZXRBdHRhY2hTdGF0ZSgpIHtcblx0XHRhdHRhY2hUZXN0QWNjZXB0Q2FsbGVkID0gZmFsc2U7XG5cdFx0YXR0YWNoVGVzdEF0dGFjaENhbGxlZCA9IGZhbHNlO1xuXHRcdGF0dGFjaFRlc3RBdHRhY2hLZXlNb2RzID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0dGVzdCgncXVpY2sgcGljayBhY2Nlc3MgLSBhY2NlcHQgd2l0aG91dCBtb2RpZmllciBrZXlzIGNhbGxzIGFjY2VwdCwgbm90IGF0dGFjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IChSZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5RdWlja2FjY2VzcykpO1xuXHRcdGNvbnN0IHJlc3RvcmUgPSAocmVnaXN0cnkgYXMgUXVpY2tBY2Nlc3NSZWdpc3RyeSkuY2xlYXIoKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoYXR0YWNoUHJvdmlkZXJEZXNjcmlwdG9yKSk7XG5cdFx0cmVzZXRBdHRhY2hTdGF0ZSgpO1xuXG5cdFx0YWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdygnYXR0YWNoJyk7XG5cdFx0YXdhaXQgYWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UuYWNjZXB0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0YWNoVGVzdEFjY2VwdENhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaFRlc3RBdHRhY2hDYWxsZWQsIGZhbHNlKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRyZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3F1aWNrIHBpY2sgYWNjZXNzIC0gYWNjZXB0IHdpdGggY3RybENtZCBjYWxscyBhdHRhY2ggaW5zdGVhZCBvZiBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSAoUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpKTtcblx0XHRjb25zdCByZXN0b3JlID0gKHJlZ2lzdHJ5IGFzIFF1aWNrQWNjZXNzUmVnaXN0cnkpLmNsZWFyKCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKGF0dGFjaFByb3ZpZGVyRGVzY3JpcHRvcikpO1xuXHRcdHJlc2V0QXR0YWNoU3RhdGUoKTtcblxuXHRcdGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coJ2F0dGFjaCcpO1xuXHRcdGF3YWl0IGFjY2Vzc29yLnF1aWNrSW5wdXRTZXJ2aWNlLmFjY2VwdCh7IGN0cmxDbWQ6IHRydWUsIGFsdDogZmFsc2UsIHNoaWZ0OiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRhY2hUZXN0QWNjZXB0Q2FsbGVkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaFRlc3RBdHRhY2hDYWxsZWQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXR0YWNoVGVzdEF0dGFjaEtleU1vZHMsIHsgY3RybENtZDogdHJ1ZSwgYWx0OiBmYWxzZSwgc2hpZnQ6IGZhbHNlIH0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHJlc3RvcmUoKTtcblx0fSk7XG5cblx0dGVzdCgncXVpY2sgcGljayBhY2Nlc3MgLSBhY2NlcHQgd2l0aCBhbHQgY2FsbHMgYXR0YWNoIGluc3RlYWQgb2YgYWNjZXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gKFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlF1aWNrYWNjZXNzKSk7XG5cdFx0Y29uc3QgcmVzdG9yZSA9IChyZWdpc3RyeSBhcyBRdWlja0FjY2Vzc1JlZ2lzdHJ5KS5jbGVhcigpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcihhdHRhY2hQcm92aWRlckRlc2NyaXB0b3IpKTtcblx0XHRyZXNldEF0dGFjaFN0YXRlKCk7XG5cblx0XHRhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5xdWlja0FjY2Vzcy5zaG93KCdhdHRhY2gnKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5hY2NlcHQoeyBjdHJsQ21kOiBmYWxzZSwgYWx0OiB0cnVlLCBzaGlmdDogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0YWNoVGVzdEFjY2VwdENhbGxlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRhY2hUZXN0QXR0YWNoQ2FsbGVkLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF0dGFjaFRlc3RBdHRhY2hLZXlNb2RzLCB7IGN0cmxDbWQ6IGZhbHNlLCBhbHQ6IHRydWUsIHNoaWZ0OiBmYWxzZSB9KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRyZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3F1aWNrIHBpY2sgYWNjZXNzIC0gYWNjZXB0IHdpdGggbW9kaWZpZXIga2V5cyBidXQgbm8gYXR0YWNoIG1ldGhvZCBjYWxscyBhY2NlcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSAoUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpKTtcblx0XHRjb25zdCByZXN0b3JlID0gKHJlZ2lzdHJ5IGFzIFF1aWNrQWNjZXNzUmVnaXN0cnkpLmNsZWFyKCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKG5vQXR0YWNoUHJvdmlkZXJEZXNjcmlwdG9yKSk7XG5cdFx0cmVzZXRBdHRhY2hTdGF0ZSgpO1xuXG5cdFx0YWNjZXNzb3IucXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdygnbm9hdHRhY2gnKTtcblx0XHRhd2FpdCBhY2Nlc3Nvci5xdWlja0lucHV0U2VydmljZS5hY2NlcHQoeyBjdHJsQ21kOiB0cnVlLCBhbHQ6IGZhbHNlLCBzaGlmdDogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXR0YWNoVGVzdEFjY2VwdENhbGxlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaFRlc3RBdHRhY2hDYWxsZWQsIGZhbHNlKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRyZXN0b3JlKCk7XG5cdH0pO1xuXG5cdC8vI2VuZHJlZ2lvblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUErQixrQkFBNkQ7QUFDNUYsU0FBcUMsMEJBQThEO0FBRW5HLFNBQVMscUJBQXFCLCtCQUErQix3QkFBd0I7QUFDckYsU0FBUyxpQkFBaUIsb0JBQWlDO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlDQUEyRTtBQUNwRixTQUFTLFdBQVc7QUFDcEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxhQUFhO0FBRXRCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsb0JBQW9CLHNCQUFzQjtBQUNuRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUV6QyxNQUFNLGVBQWUsTUFBTTtBQUUxQixRQUFNLGNBQWMsd0NBQXdDO0FBQzVELE1BQUk7QUFDSixNQUFJO0FBRUosTUFBSSx3QkFBd0I7QUFDNUIsTUFBSSwwQkFBMEI7QUFDOUIsTUFBSSwwQkFBMEI7QUFFOUIsTUFBSSxrQkFBa0I7QUFDdEIsTUFBSSxvQkFBb0I7QUFDeEIsTUFBSSxvQkFBb0I7QUFFeEIsTUFBSSxrQkFBa0I7QUFDdEIsTUFB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
