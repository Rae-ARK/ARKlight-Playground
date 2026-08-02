import assert from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ByokLmBridgeRegistry } from "../../node/byokLmBridgeRegistry.js";
suite("ByokLmBridgeRegistry", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function pushable() {
    const emitter = store.add(new Emitter());
    return {
      connection: {
        chat: async () => ({ output: [] }),
        onDidChangeModels: emitter.event
      },
      push: (models) => emitter.fire(models)
    };
  }
  test("surfaces the serving window's models and routes inference to it; a non-serving window is excluded", () => {
    const registry = new ByokLmBridgeRegistry();
    const serving = pushable();
    const nonServing = pushable();
    const regServing = registry.register("editor", serving.connection);
    const regNonServing = registry.register("no-handler", nonServing.connection);
    serving.push([{ vendor: "acme", id: "claude" }, { vendor: "acme", id: "gpt" }]);
    assert.deepStrictEqual({
      models: registry.getModels(),
      serving: registry.getServingConnection() === serving.connection
    }, {
      models: [{ vendor: "acme", id: "claude" }, { vendor: "acme", id: "gpt" }],
      serving: true
    });
    regServing.dispose();
    regNonServing.dispose();
  });
  test("a window that pushes an empty list is still a valid serving target", () => {
    const registry = new ByokLmBridgeRegistry();
    const only = pushable();
    const reg = registry.register("client-only", only.connection);
    only.push([]);
    assert.deepStrictEqual({
      models: registry.getModels(),
      serving: registry.getServingConnection() === only.connection
    }, { models: [], serving: true });
    reg.dispose();
  });
  test("a window that pushed empty does not shadow a peer that has models, even when it connected first", () => {
    const registry = new ByokLmBridgeRegistry();
    const empty = pushable();
    const withModels = pushable();
    const regEmpty = registry.register("agents", empty.connection);
    const regWithModels = registry.register("editor", withModels.connection);
    empty.push([]);
    withModels.push([{ vendor: "acme", id: "claude" }]);
    assert.deepStrictEqual({
      models: registry.getModels(),
      serving: registry.getServingConnection() === withModels.connection
    }, {
      models: [{ vendor: "acme", id: "claude" }],
      serving: true
    });
    regEmpty.dispose();
    regWithModels.dispose();
  });
  test("unregistering the serving connection drops its models and notifies listeners", () => {
    const registry = new ByokLmBridgeRegistry();
    let changes = 0;
    store.add(registry.onDidChangeModels(() => {
      changes++;
    }));
    const conn = pushable();
    const reg = registry.register("client-a", conn.connection);
    conn.push([{ vendor: "acme", id: "claude" }]);
    assert.strictEqual(registry.getModels().length, 1);
    const changesBeforeDispose = changes;
    reg.dispose();
    assert.deepStrictEqual({
      models: registry.getModels(),
      serving: registry.getServingConnection(),
      firedOnDispose: changes > changesBeforeDispose
    }, {
      models: [],
      serving: void 0,
      firedOnDispose: true
    });
  });
  test("caches and notifies when a connection pushes a new snapshot", () => {
    const registry = new ByokLmBridgeRegistry();
    const conn = pushable();
    const reg = registry.register("client-a", conn.connection);
    conn.push([]);
    assert.strictEqual(registry.getModels().length, 0);
    let changed = false;
    store.add(registry.onDidChangeModels(() => {
      changed = true;
    }));
    conn.push([{ vendor: "acme", id: "claude" }]);
    assert.deepStrictEqual({ changed, models: registry.getModels() }, {
      changed: true,
      models: [{ vendor: "acme", id: "claude" }]
    });
    reg.dispose();
  });
  test("treats a change in only the model identifier as a model change (re-publishes)", () => {
    const registry = new ByokLmBridgeRegistry();
    const conn = pushable();
    const reg = store.add(registry.register("client-a", conn.connection));
    conn.push([{ vendor: "openrouter", id: "aion-labs/aion-3.0", modelIdentifier: "openrouter/OpenRouter 1/aion-labs/aion-3.0" }]);
    let changes = 0;
    store.add(registry.onDidChangeModels(() => {
      changes++;
    }));
    conn.push([{ vendor: "openrouter", id: "aion-labs/aion-3.0", modelIdentifier: "openrouter/OpenRouter 2/aion-labs/aion-3.0" }]);
    assert.deepStrictEqual({ changes, models: registry.getModels() }, {
      changes: 1,
      models: [{ vendor: "openrouter", id: "aion-labs/aion-3.0", modelIdentifier: "openrouter/OpenRouter 2/aion-labs/aion-3.0" }]
    });
    reg.dispose();
  });
  test("compares reasoning effort metadata structurally", () => {
    const registry = new ByokLmBridgeRegistry();
    const conn = pushable();
    const reg = store.add(registry.register("client-a", conn.connection));
    conn.push([{
      vendor: "acme",
      id: "reasoning",
      supportedReasoningEfforts: ["low", "high"],
      defaultReasoningEffort: "low"
    }]);
    let changes = 0;
    store.add(registry.onDidChangeModels(() => {
      changes++;
    }));
    conn.push([{
      vendor: "acme",
      id: "reasoning",
      supportedReasoningEfforts: ["low", "high"],
      defaultReasoningEffort: "low"
    }]);
    conn.push([{
      vendor: "acme",
      id: "reasoning",
      supportedReasoningEfforts: ["low", "high"],
      defaultReasoningEffort: "high"
    }]);
    conn.push([{
      vendor: "acme",
      id: "reasoning",
      supportedReasoningEfforts: ["low", "medium", "high"],
      defaultReasoningEffort: "high"
    }]);
    assert.deepStrictEqual({
      changes,
      models: registry.getModels()
    }, {
      changes: 2,
      models: [{
        vendor: "acme",
        id: "reasoning",
        supportedReasoningEfforts: ["low", "medium", "high"],
        defaultReasoningEffort: "high"
      }]
    });
    reg.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYnlva0xtQnJpZGdlUmVnaXN0cnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgSUJ5b2tMbUJyaWRnZUNvbm5lY3Rpb24sIElCeW9rTG1DaGF0UmVzdWx0LCBJQnlva0xtTW9kZWxJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEJ5b2tMbS5qcyc7XG5pbXBvcnQgeyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSB9IGZyb20gJy4uLy4uL25vZGUvYnlva0xtQnJpZGdlUmVnaXN0cnkuanMnO1xuXG4vKipcbiAqIFBpbnMgdGhlIGJlaGF2aW91ciBvZiB7QGxpbmsgQnlva0xtQnJpZGdlUmVnaXN0cnl9OiBpdCBjYWNoZXMgdGhlIG1vZGVsXG4gKiBzbmFwc2hvdHMgcHVzaGVkIGJ5IGVhY2ggY29ubmVjdGlvbiwgc3VyZmFjZXMgdGhlIG1vZGVscyBvZiBhIHNpbmdsZSAqc2VydmluZypcbiAqIGNvbm5lY3Rpb24gKHByZWZlcnJpbmcgb25lIHRoYXQgYWN0dWFsbHkgaGFzIG1vZGVscyksIHJvdXRlcyBpbmZlcmVuY2UgdGhlcmUsXG4gKiBleGNsdWRlcyBjb25uZWN0aW9ucyB0aGF0IG5ldmVyIHB1c2gsIGFuZCBub3RpZmllcyBsaXN0ZW5lcnMgb25cbiAqIG1vZGVsL2Nvbm5lY3Rpb24gY2hhbmdlcy5cbiAqL1xuc3VpdGUoJ0J5b2tMbUJyaWRnZVJlZ2lzdHJ5JywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0LyoqXG5cdCAqIEEgc2NyaXB0ZWQgYnJpZGdlIGNvbm5lY3Rpb24gd2hvc2UgbW9kZWwgc25hcHNob3RzIGFyZSBwdXNoZWQgb24gZGVtYW5kIHZpYVxuXHQgKiB0aGUgcmV0dXJuZWQgYHB1c2hgLiBBIGNvbm5lY3Rpb24gdGhhdCBuZXZlciBwdXNoZXMgc3RheXMgbm9uLXNlcnZpbmcuXG5cdCAqIGBjaGF0YCBpcyB1bnVzZWQgYnkgdGhlc2UgdGVzdHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBwdXNoYWJsZSgpOiB7IGNvbm5lY3Rpb246IElCeW9rTG1CcmlkZ2VDb25uZWN0aW9uOyBwdXNoOiAobW9kZWxzOiBJQnlva0xtTW9kZWxJbmZvW10pID0+IHZvaWQgfSB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJQnlva0xtTW9kZWxJbmZvW10+KCkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb25uZWN0aW9uOiB7XG5cdFx0XHRcdGNoYXQ6IGFzeW5jICgpOiBQcm9taXNlPElCeW9rTG1DaGF0UmVzdWx0PiA9PiAoeyBvdXRwdXQ6IFtdIH0pLFxuXHRcdFx0XHRvbkRpZENoYW5nZU1vZGVsczogZW1pdHRlci5ldmVudCxcblx0XHRcdH0sXG5cdFx0XHRwdXNoOiBtb2RlbHMgPT4gZW1pdHRlci5maXJlKG1vZGVscyksXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3N1cmZhY2VzIHRoZSBzZXJ2aW5nIHdpbmRvd1xcJ3MgbW9kZWxzIGFuZCByb3V0ZXMgaW5mZXJlbmNlIHRvIGl0OyBhIG5vbi1zZXJ2aW5nIHdpbmRvdyBpcyBleGNsdWRlZCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdC8vIEEgc2VydmluZyB3aW5kb3cgKGl0IHB1c2hlcyBhIHNuYXBzaG90KSBhbmQgYSB3aW5kb3cgdGhhdCBjb25uZWN0ZWRcblx0XHQvLyB3aXRob3V0IGEgQllPSyBoYW5kbGVyLCB3aGljaCBuZXZlciBwdXNoZXMuXG5cdFx0Y29uc3Qgc2VydmluZyA9IHB1c2hhYmxlKCk7XG5cdFx0Y29uc3Qgbm9uU2VydmluZyA9IHB1c2hhYmxlKCk7XG5cdFx0Y29uc3QgcmVnU2VydmluZyA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdlZGl0b3InLCBzZXJ2aW5nLmNvbm5lY3Rpb24pO1xuXHRcdGNvbnN0IHJlZ05vblNlcnZpbmcgPSByZWdpc3RyeS5yZWdpc3Rlcignbm8taGFuZGxlcicsIG5vblNlcnZpbmcuY29ubmVjdGlvbik7XG5cblx0XHRzZXJ2aW5nLnB1c2goW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJyB9LCB7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2dwdCcgfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbHM6IHJlZ2lzdHJ5LmdldE1vZGVscygpLFxuXHRcdFx0c2VydmluZzogcmVnaXN0cnkuZ2V0U2VydmluZ0Nvbm5lY3Rpb24oKSA9PT0gc2VydmluZy5jb25uZWN0aW9uLFxuXHRcdH0sIHtcblx0XHRcdG1vZGVsczogW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJyB9LCB7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2dwdCcgfV0sXG5cdFx0XHRzZXJ2aW5nOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0cmVnU2VydmluZy5kaXNwb3NlKCk7XG5cdFx0cmVnTm9uU2VydmluZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egd2luZG93IHRoYXQgcHVzaGVzIGFuIGVtcHR5IGxpc3QgaXMgc3RpbGwgYSB2YWxpZCBzZXJ2aW5nIHRhcmdldCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IG9ubHkgPSBwdXNoYWJsZSgpO1xuXHRcdGNvbnN0IHJlZyA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtb25seScsIG9ubHkuY29ubmVjdGlvbik7XG5cdFx0b25seS5wdXNoKFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW9kZWxzOiByZWdpc3RyeS5nZXRNb2RlbHMoKSxcblx0XHRcdHNlcnZpbmc6IHJlZ2lzdHJ5LmdldFNlcnZpbmdDb25uZWN0aW9uKCkgPT09IG9ubHkuY29ubmVjdGlvbixcblx0XHR9LCB7IG1vZGVsczogW10sIHNlcnZpbmc6IHRydWUgfSk7XG5cblx0XHRyZWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHdpbmRvdyB0aGF0IHB1c2hlZCBlbXB0eSBkb2VzIG5vdCBzaGFkb3cgYSBwZWVyIHRoYXQgaGFzIG1vZGVscywgZXZlbiB3aGVuIGl0IGNvbm5lY3RlZCBmaXJzdCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdC8vIFRoZSBBZ2VudHMgYXBwIGNvbm5lY3RzIGZpcnN0IGFuZCBwdXNoZXMgZW1wdHkgKGl0cyBCWU9LIGV4dGVuc2lvbiBoYXNcblx0XHQvLyBub3QgcmVnaXN0ZXJlZCBtb2RlbHMgeWV0KTsgYSBwZWVyIHdpbmRvdyBwdXNoZXMgbW9kZWxzLiBUaGUgcGVlciBtdXN0XG5cdFx0Ly8gd2luIFx1MjAxNCBhbiBlbXB0eS1idXQtc2VydmluZyB3aW5kb3cgbXVzdCBuZXZlciBzaGFkb3cgYSBwb3B1bGF0ZWQgb25lLlxuXHRcdGNvbnN0IGVtcHR5ID0gcHVzaGFibGUoKTtcblx0XHRjb25zdCB3aXRoTW9kZWxzID0gcHVzaGFibGUoKTtcblx0XHRjb25zdCByZWdFbXB0eSA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdhZ2VudHMnLCBlbXB0eS5jb25uZWN0aW9uKTtcblx0XHRjb25zdCByZWdXaXRoTW9kZWxzID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2VkaXRvcicsIHdpdGhNb2RlbHMuY29ubmVjdGlvbik7XG5cblx0XHRlbXB0eS5wdXNoKFtdKTtcblx0XHR3aXRoTW9kZWxzLnB1c2goW3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJyB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vZGVsczogcmVnaXN0cnkuZ2V0TW9kZWxzKCksXG5cdFx0XHRzZXJ2aW5nOiByZWdpc3RyeS5nZXRTZXJ2aW5nQ29ubmVjdGlvbigpID09PSB3aXRoTW9kZWxzLmNvbm5lY3Rpb24sXG5cdFx0fSwge1xuXHRcdFx0bW9kZWxzOiBbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdjbGF1ZGUnIH1dLFxuXHRcdFx0c2VydmluZzogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdHJlZ0VtcHR5LmRpc3Bvc2UoKTtcblx0XHRyZWdXaXRoTW9kZWxzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndW5yZWdpc3RlcmluZyB0aGUgc2VydmluZyBjb25uZWN0aW9uIGRyb3BzIGl0cyBtb2RlbHMgYW5kIG5vdGlmaWVzIGxpc3RlbmVycycsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGxldCBjaGFuZ2VzID0gMDtcblx0XHRzdG9yZS5hZGQocmVnaXN0cnkub25EaWRDaGFuZ2VNb2RlbHMoKCkgPT4geyBjaGFuZ2VzKys7IH0pKTtcblxuXHRcdGNvbnN0IGNvbm4gPSBwdXNoYWJsZSgpO1xuXHRcdGNvbnN0IHJlZyA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtYScsIGNvbm4uY29ubmVjdGlvbik7XG5cdFx0Y29ubi5wdXNoKFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRNb2RlbHMoKS5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgY2hhbmdlc0JlZm9yZURpc3Bvc2UgPSBjaGFuZ2VzO1xuXHRcdHJlZy5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vZGVsczogcmVnaXN0cnkuZ2V0TW9kZWxzKCksXG5cdFx0XHRzZXJ2aW5nOiByZWdpc3RyeS5nZXRTZXJ2aW5nQ29ubmVjdGlvbigpLFxuXHRcdFx0ZmlyZWRPbkRpc3Bvc2U6IGNoYW5nZXMgPiBjaGFuZ2VzQmVmb3JlRGlzcG9zZSxcblx0XHR9LCB7XG5cdFx0XHRtb2RlbHM6IFtdLFxuXHRcdFx0c2VydmluZzogdW5kZWZpbmVkLFxuXHRcdFx0ZmlyZWRPbkRpc3Bvc2U6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhY2hlcyBhbmQgbm90aWZpZXMgd2hlbiBhIGNvbm5lY3Rpb24gcHVzaGVzIGEgbmV3IHNuYXBzaG90JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgY29ubiA9IHB1c2hhYmxlKCk7XG5cdFx0Y29uc3QgcmVnID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2NsaWVudC1hJywgY29ubi5jb25uZWN0aW9uKTtcblx0XHRjb25uLnB1c2goW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5nZXRNb2RlbHMoKS5sZW5ndGgsIDApO1xuXG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRzdG9yZS5hZGQocmVnaXN0cnkub25EaWRDaGFuZ2VNb2RlbHMoKCkgPT4geyBjaGFuZ2VkID0gdHJ1ZTsgfSkpO1xuXHRcdGNvbm4ucHVzaChbeyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdjbGF1ZGUnIH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjaGFuZ2VkLCBtb2RlbHM6IHJlZ2lzdHJ5LmdldE1vZGVscygpIH0sIHtcblx0XHRcdGNoYW5nZWQ6IHRydWUsXG5cdFx0XHRtb2RlbHM6IFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScgfV0sXG5cdFx0fSk7XG5cblx0XHRyZWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmVhdHMgYSBjaGFuZ2UgaW4gb25seSB0aGUgbW9kZWwgaWRlbnRpZmllciBhcyBhIG1vZGVsIGNoYW5nZSAocmUtcHVibGlzaGVzKScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IGNvbm4gPSBwdXNoYWJsZSgpO1xuXHRcdGNvbnN0IHJlZyA9IHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlcignY2xpZW50LWEnLCBjb25uLmNvbm5lY3Rpb24pKTtcblx0XHRjb25uLnB1c2goW3sgdmVuZG9yOiAnb3BlbnJvdXRlcicsIGlkOiAnYWlvbi1sYWJzL2Fpb24tMy4wJywgbW9kZWxJZGVudGlmaWVyOiAnb3BlbnJvdXRlci9PcGVuUm91dGVyIDEvYWlvbi1sYWJzL2Fpb24tMy4wJyB9XSk7XG5cblx0XHRsZXQgY2hhbmdlcyA9IDA7XG5cdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlTW9kZWxzKCgpID0+IHsgY2hhbmdlcysrOyB9KSk7XG5cblx0XHQvLyBPbmx5IHRoZSBjYXJyaWVkIGlkZW50aWZpZXIgY2hhbmdlZCAoZS5nLiB0aGUgdXNlciByZW5hbWVkIHRoZSBwcm92aWRlciBncm91cCkgXHUyMDE0IHRoZVxuXHRcdC8vIHJlZ2lzdHJ5IG11c3Qgc3RpbGwgbm90aWNlIGFuZCByZS1wdWJsaXNoIHNvIHRoZSBwaWNrZXIga2V5cyB2aXNpYmlsaXR5IGJ5IHRoZSBuZXcgaWQuXG5cdFx0Y29ubi5wdXNoKFt7IHZlbmRvcjogJ29wZW5yb3V0ZXInLCBpZDogJ2Fpb24tbGFicy9haW9uLTMuMCcsIG1vZGVsSWRlbnRpZmllcjogJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2Fpb24tbGFicy9haW9uLTMuMCcgfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNoYW5nZXMsIG1vZGVsczogcmVnaXN0cnkuZ2V0TW9kZWxzKCkgfSwge1xuXHRcdFx0Y2hhbmdlczogMSxcblx0XHRcdG1vZGVsczogW3sgdmVuZG9yOiAnb3BlbnJvdXRlcicsIGlkOiAnYWlvbi1sYWJzL2Fpb24tMy4wJywgbW9kZWxJZGVudGlmaWVyOiAnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWlvbi1sYWJzL2Fpb24tMy4wJyB9XSxcblx0XHR9KTtcblxuXHRcdHJlZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVzIHJlYXNvbmluZyBlZmZvcnQgbWV0YWRhdGEgc3RydWN0dXJhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgY29ubiA9IHB1c2hhYmxlKCk7XG5cdFx0Y29uc3QgcmVnID0gc3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtYScsIGNvbm4uY29ubmVjdGlvbikpO1xuXHRcdGNvbm4ucHVzaChbe1xuXHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRpZDogJ3JlYXNvbmluZycsXG5cdFx0XHRzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzOiBbJ2xvdycsICdoaWdoJ10sXG5cdFx0XHRkZWZhdWx0UmVhc29uaW5nRWZmb3J0OiAnbG93Jyxcblx0XHR9XSk7XG5cblx0XHRsZXQgY2hhbmdlcyA9IDA7XG5cdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlTW9kZWxzKCgpID0+IHsgY2hhbmdlcysrOyB9KSk7XG5cblx0XHRjb25uLnB1c2goW3tcblx0XHRcdHZlbmRvcjogJ2FjbWUnLFxuXHRcdFx0aWQ6ICdyZWFzb25pbmcnLFxuXHRcdFx0c3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0czogWydsb3cnLCAnaGlnaCddLFxuXHRcdFx0ZGVmYXVsdFJlYXNvbmluZ0VmZm9ydDogJ2xvdycsXG5cdFx0fV0pO1xuXHRcdGNvbm4ucHVzaChbe1xuXHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRpZDogJ3JlYXNvbmluZycsXG5cdFx0XHRzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzOiBbJ2xvdycsICdoaWdoJ10sXG5cdFx0XHRkZWZhdWx0UmVhc29uaW5nRWZmb3J0OiAnaGlnaCcsXG5cdFx0fV0pO1xuXHRcdGNvbm4ucHVzaChbe1xuXHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRpZDogJ3JlYXNvbmluZycsXG5cdFx0XHRzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzOiBbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCddLFxuXHRcdFx0ZGVmYXVsdFJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnLFxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hhbmdlcyxcblx0XHRcdG1vZGVsczogcmVnaXN0cnkuZ2V0TW9kZWxzKCksXG5cdFx0fSwge1xuXHRcdFx0Y2hhbmdlczogMixcblx0XHRcdG1vZGVsczogW3tcblx0XHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRcdGlkOiAncmVhc29uaW5nJyxcblx0XHRcdFx0c3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0czogWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnXSxcblx0XHRcdFx0ZGVmYXVsdFJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cblx0XHRyZWcuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUV4RCxTQUFTLDRCQUE0QjtBQVNyQyxNQUFNLHdCQUF3QixNQUFNO0FBRW5DLFFBQU0sUUFBUSx3Q0FBd0M7QUFPdEQsV0FBUyxXQUFnRztBQUN4RyxVQUFNLFVBQVUsTUFBTSxJQUFJLElBQUksUUFBNEIsQ0FBQztBQUMzRCxXQUFPO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxNQUFNLGFBQXlDLEVBQUUsUUFBUSxDQUFDLEVBQUU7QUFBQSxRQUM1RCxtQkFBbUIsUUFBUTtBQUFBLE1BQzVCO0FBQUEsTUFDQSxNQUFNLFlBQVUsUUFBUSxLQUFLLE1BQU07QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFFQSxPQUFLLHFHQUFzRyxNQUFNO0FBQ2hILFVBQU0sV0FBVyxJQUFJLHFCQUFxQjtBQUcxQyxVQUFNLFVBQVUsU0FBUztBQUN6QixVQUFNLGFBQWEsU0FBUztBQUM1QixVQUFNLGFBQWEsU0FBUyxTQUFTLFVBQVUsUUFBUSxVQUFVO0FBQ2pFLFVBQU0sZ0JBQWdCLFNBQVMsU0FBUyxjQUFjLFdBQVcsVUFBVTtBQUUzRSxZQUFRLEtBQUssQ0FBQyxFQUFFLFFBQVEsUUFBUSxJQUFJLFNBQVMsR0FBRyxFQUFFLFFBQVEsUUFBUSxJQUFJLE1BQU0sQ0FBQyxDQUFDO0FBRTlFLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxTQUFTLFVBQVU7QUFBQSxNQUMzQixTQUFTLFNBQVMscUJBQXFCLE1BQU0sUUFBUTtBQUFBLElBQ3RELEdBQUc7QUFBQSxNQUNGLFFBQVEsQ0FBQyxFQUFFLFFBQVEsUUFBUSxJQUFJLFNBQVMsR0FBRyxFQUFFLFFB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
