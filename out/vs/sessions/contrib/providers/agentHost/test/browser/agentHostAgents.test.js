import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CustomizationLoadStatus, CustomizationType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { getEffectiveAgents } from "../../../../../../platform/agentHost/common/customAgents.js";
function sc(uri, children, enabled = true) {
  return {
    type: CustomizationType.Plugin,
    id: uri,
    uri,
    name: uri,
    enabled,
    load: { kind: CustomizationLoadStatus.Loaded },
    ...children ? { children } : {}
  };
}
function agent(uri, name, description) {
  return {
    type: CustomizationType.Agent,
    id: uri,
    uri,
    name,
    ...description ? { description } : {}
  };
}
suite("getEffectiveAgents", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns an empty list when no customizations contribute agents", () => {
    assert.deepStrictEqual(getEffectiveAgents(void 0), []);
    assert.deepStrictEqual(getEffectiveAgents([sc("plugin://a"), sc("plugin://b", [])]), []);
  });
  test("treats undefined `children` as unknown and empty array as no agents", () => {
    const result = getEffectiveAgents([
      sc("plugin://a", [agent("agent://review", "review")]),
      sc("plugin://b", [])
    ]);
    assert.deepStrictEqual(result, [agent("agent://review", "review")]);
  });
  test("skips disabled session customizations", () => {
    const result = getEffectiveAgents([
      sc("plugin://a", [agent("agent://a", "a")], false),
      sc("plugin://b", [agent("agent://b", "b")])
    ]);
    assert.deepStrictEqual(result, [agent("agent://b", "b")]);
  });
  test("de-dupes by uri (first-seen wins)", () => {
    const result = getEffectiveAgents([
      sc("plugin://a", [
        agent("agent://shared", "shared", "from a"),
        agent("agent://only-a", "only-a")
      ]),
      sc("plugin://b", [
        agent("agent://shared", "shared", "from b"),
        agent("agent://only-b", "only-b")
      ])
    ]);
    assert.deepStrictEqual(result, [
      agent("agent://only-a", "only-a"),
      agent("agent://only-b", "only-b"),
      agent("agent://shared", "shared", "from a")
    ]);
  });
  test("sorts by name, breaking ties by uri", () => {
    const result = getEffectiveAgents([
      sc("plugin://a", [
        agent("agent://z", "beta"),
        agent("agent://x", "beta"),
        agent("agent://y", "alpha")
      ])
    ]);
    assert.deepStrictEqual(result.map((a) => a.uri), ["agent://y", "agent://x", "agent://z"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvYWdlbnRIb3N0QWdlbnRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBDdXN0b21pemF0aW9uVHlwZSwgdHlwZSBBZ2VudEN1c3RvbWl6YXRpb24sIHR5cGUgQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgZ2V0RWZmZWN0aXZlQWdlbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jdXN0b21BZ2VudHMuanMnO1xuXG5mdW5jdGlvbiBzYyh1cmk6IHN0cmluZywgY2hpbGRyZW4/OiBBZ2VudEN1c3RvbWl6YXRpb25bXSwgZW5hYmxlZCA9IHRydWUpOiBDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0aWQ6IHVyaSxcblx0XHR1cmksXG5cdFx0bmFtZTogdXJpLFxuXHRcdGVuYWJsZWQsXG5cdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHQuLi4oY2hpbGRyZW4gPyB7IGNoaWxkcmVuIH0gOiB7fSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGFnZW50KHVyaTogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogQWdlbnRDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCxcblx0XHRpZDogdXJpLFxuXHRcdHVyaSxcblx0XHRuYW1lLFxuXHRcdC4uLihkZXNjcmlwdGlvbiA/IHsgZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0fTtcbn1cblxuc3VpdGUoJ2dldEVmZmVjdGl2ZUFnZW50cycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyBhbiBlbXB0eSBsaXN0IHdoZW4gbm8gY3VzdG9taXphdGlvbnMgY29udHJpYnV0ZSBhZ2VudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFZmZlY3RpdmVBZ2VudHModW5kZWZpbmVkKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWZmZWN0aXZlQWdlbnRzKFtzYygncGx1Z2luOi8vYScpLCBzYygncGx1Z2luOi8vYicsIFtdKV0pLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0cyB1bmRlZmluZWQgYGNoaWxkcmVuYCBhcyB1bmtub3duIGFuZCBlbXB0eSBhcnJheSBhcyBubyBhZ2VudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0RWZmZWN0aXZlQWdlbnRzKFtcblx0XHRcdHNjKCdwbHVnaW46Ly9hJywgW2FnZW50KCdhZ2VudDovL3JldmlldycsICdyZXZpZXcnKV0pLFxuXHRcdFx0c2MoJ3BsdWdpbjovL2InLCBbXSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFthZ2VudCgnYWdlbnQ6Ly9yZXZpZXcnLCAncmV2aWV3JyldKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgZGlzYWJsZWQgc2Vzc2lvbiBjdXN0b21pemF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRFZmZlY3RpdmVBZ2VudHMoW1xuXHRcdFx0c2MoJ3BsdWdpbjovL2EnLCBbYWdlbnQoJ2FnZW50Oi8vYScsICdhJyldLCBmYWxzZSksXG5cdFx0XHRzYygncGx1Z2luOi8vYicsIFthZ2VudCgnYWdlbnQ6Ly9iJywgJ2InKV0pLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbYWdlbnQoJ2FnZW50Oi8vYicsICdiJyldKTtcblx0fSk7XG5cblx0dGVzdCgnZGUtZHVwZXMgYnkgdXJpIChmaXJzdC1zZWVuIHdpbnMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEVmZmVjdGl2ZUFnZW50cyhbXG5cdFx0XHRzYygncGx1Z2luOi8vYScsIFtcblx0XHRcdFx0YWdlbnQoJ2FnZW50Oi8vc2hhcmVkJywgJ3NoYXJlZCcsICdmcm9tIGEnKSxcblx0XHRcdFx0YWdlbnQoJ2FnZW50Oi8vb25seS1hJywgJ29ubHktYScpLFxuXHRcdFx0XSksXG5cdFx0XHRzYygncGx1Z2luOi8vYicsIFtcblx0XHRcdFx0YWdlbnQoJ2FnZW50Oi8vc2hhcmVkJywgJ3NoYXJlZCcsICdmcm9tIGInKSxcblx0XHRcdFx0YWdlbnQoJ2FnZW50Oi8vb25seS1iJywgJ29ubHktYicpLFxuXHRcdFx0XSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdGFnZW50KCdhZ2VudDovL29ubHktYScsICdvbmx5LWEnKSxcblx0XHRcdGFnZW50KCdhZ2VudDovL29ubHktYicsICdvbmx5LWInKSxcblx0XHRcdGFnZW50KCdhZ2VudDovL3NoYXJlZCcsICdzaGFyZWQnLCAnZnJvbSBhJyksXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRzIGJ5IG5hbWUsIGJyZWFraW5nIHRpZXMgYnkgdXJpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEVmZmVjdGl2ZUFnZW50cyhbXG5cdFx0XHRzYygncGx1Z2luOi8vYScsIFtcblx0XHRcdFx0YWdlbnQoJ2FnZW50Oi8veicsICdiZXRhJyksXG5cdFx0XHRcdGFnZW50KCdhZ2VudDovL3gnLCAnYmV0YScpLFxuXHRcdFx0XHRhZ2VudCgnYWdlbnQ6Ly95JywgJ2FscGhhJyksXG5cdFx0XHRdKSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoYSA9PiBhLnVyaSksIFsnYWdlbnQ6Ly95JywgJ2FnZW50Oi8veCcsICdhZ2VudDovL3onXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx5QkFBeUIseUJBQXNFO0FBQ3hHLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsR0FBRyxLQUFhLFVBQWlDLFVBQVUsTUFBcUI7QUFDeEYsU0FBTztBQUFBLElBQ04sTUFBTSxrQkFBa0I7QUFBQSxJQUN4QixJQUFJO0FBQUEsSUFDSjtBQUFBLElBQ0EsTUFBTTtBQUFBLElBQ047QUFB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
