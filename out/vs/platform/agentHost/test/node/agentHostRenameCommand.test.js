import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { MessageAttachmentKind } from "../../common/state/protocol/state.js";
import { AgentHostRenameCompletionProvider, parseRenameCommand } from "../../node/agentHostRenameCommand.js";
suite("agentHostRenameCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseRenameCommand", () => {
    test("matches lone /rename as empty title", () => {
      assert.strictEqual(parseRenameCommand("/rename"), "");
    });
    test("captures the trimmed title after a space", () => {
      assert.strictEqual(parseRenameCommand("/rename My New Title"), "My New Title");
    });
    test("trims surrounding whitespace from the title", () => {
      assert.strictEqual(parseRenameCommand("/rename   spaced   "), "spaced");
    });
    test("rejects /renamed (longer command)", () => {
      assert.strictEqual(parseRenameCommand("/renamed"), void 0);
    });
    test("rejects /rename-foo (no separator)", () => {
      assert.strictEqual(parseRenameCommand("/rename-foo"), void 0);
    });
    test("rejects leading whitespace", () => {
      assert.strictEqual(parseRenameCommand(" /rename x"), void 0);
    });
    test("case-sensitive", () => {
      assert.strictEqual(parseRenameCommand("/RENAME x"), void 0);
    });
  });
  suite("AgentHostRenameCompletionProvider", () => {
    const session = "mock:/abc";
    function run(text, hasHistory = true, offset = text.length) {
      const provider = new AgentHostRenameCompletionProvider(() => hasHistory);
      return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: session, text, offset }, CancellationToken.None);
    }
    test('offers /rename for a lone "/" when the session has history', async () => {
      const items = await run("/");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/rename "]);
    });
    test('offers /rename when "/r" is typed', async () => {
      const items = await run("/r");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/rename "]);
    });
    test("offers /rename when fuzzily matched", async () => {
      const items = await run("/rae");
      assert.deepStrictEqual(items.map((i) => i.insertText), ["/rename "]);
    });
    test("omits /rename when the session has no history", async () => {
      const items = await run("/", false);
      assert.deepStrictEqual(items, []);
    });
    test("returns nothing when the typed prefix does not match", async () => {
      const items = await run("/zz");
      assert.deepStrictEqual(items, []);
    });
    test("returns nothing when input does not start with /", async () => {
      const items = await run("hello", true, 5);
      assert.deepStrictEqual(items, []);
    });
    test("attachment is Simple with command + description meta", async () => {
      const items = await run("/");
      assert.deepStrictEqual(items.map((i) => i.attachment), [{
        type: MessageAttachmentKind.Simple,
        label: "/rename",
        _meta: { command: "rename", description: "Rename this chat" }
      }]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0UmVuYW1lQ29tbWFuZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFJlbmFtZUNvbXBsZXRpb25Qcm92aWRlciwgcGFyc2VSZW5hbWVDb21tYW5kIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RSZW5hbWVDb21tYW5kLmpzJztcblxuc3VpdGUoJ2FnZW50SG9zdFJlbmFtZUNvbW1hbmQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3BhcnNlUmVuYW1lQ29tbWFuZCcsICgpID0+IHtcblx0XHR0ZXN0KCdtYXRjaGVzIGxvbmUgL3JlbmFtZSBhcyBlbXB0eSB0aXRsZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVJlbmFtZUNvbW1hbmQoJy9yZW5hbWUnKSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FwdHVyZXMgdGhlIHRyaW1tZWQgdGl0bGUgYWZ0ZXIgYSBzcGFjZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVJlbmFtZUNvbW1hbmQoJy9yZW5hbWUgTXkgTmV3IFRpdGxlJyksICdNeSBOZXcgVGl0bGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyaW1zIHN1cnJvdW5kaW5nIHdoaXRlc3BhY2UgZnJvbSB0aGUgdGl0bGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VSZW5hbWVDb21tYW5kKCcvcmVuYW1lICAgc3BhY2VkICAgJyksICdzcGFjZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgL3JlbmFtZWQgKGxvbmdlciBjb21tYW5kKScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVJlbmFtZUNvbW1hbmQoJy9yZW5hbWVkJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIC9yZW5hbWUtZm9vIChubyBzZXBhcmF0b3IpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUmVuYW1lQ29tbWFuZCgnL3JlbmFtZS1mb28nKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgbGVhZGluZyB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUmVuYW1lQ29tbWFuZCgnIC9yZW5hbWUgeCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FzZS1zZW5zaXRpdmUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VSZW5hbWVDb21tYW5kKCcvUkVOQU1FIHgnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0FnZW50SG9zdFJlbmFtZUNvbXBsZXRpb25Qcm92aWRlcicsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gJ21vY2s6L2FiYyc7XG5cblx0XHRmdW5jdGlvbiBydW4odGV4dDogc3RyaW5nLCBoYXNIaXN0b3J5ID0gdHJ1ZSwgb2Zmc2V0ID0gdGV4dC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IEFnZW50SG9zdFJlbmFtZUNvbXBsZXRpb25Qcm92aWRlcigoKSA9PiBoYXNIaXN0b3J5KTtcblx0XHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uLCB0ZXh0LCBvZmZzZXQgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnb2ZmZXJzIC9yZW5hbWUgZm9yIGEgbG9uZSBcIi9cIiB3aGVuIHRoZSBzZXNzaW9uIGhhcyBoaXN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5pbnNlcnRUZXh0KSwgWycvcmVuYW1lICddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29mZmVycyAvcmVuYW1lIHdoZW4gXCIvclwiIGlzIHR5cGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBydW4oJy9yJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL3JlbmFtZSAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvZmZlcnMgL3JlbmFtZSB3aGVuIGZ1enppbHkgbWF0Y2hlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgcnVuKCcvcmFlJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+IGkuaW5zZXJ0VGV4dCksIFsnL3JlbmFtZSAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyAvcmVuYW1lIHdoZW4gdGhlIHNlc3Npb24gaGFzIG5vIGhpc3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignLycsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgbm90aGluZyB3aGVuIHRoZSB0eXBlZCBwcmVmaXggZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignL3p6Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5vdGhpbmcgd2hlbiBpbnB1dCBkb2VzIG5vdCBzdGFydCB3aXRoIC8nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignaGVsbG8nLCB0cnVlLCA1KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F0dGFjaG1lbnQgaXMgU2ltcGxlIHdpdGggY29tbWFuZCArIGRlc2NyaXB0aW9uIG1ldGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHJ1bignLycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaSA9PiBpLmF0dGFjaG1lbnQpLCBbe1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRsYWJlbDogJy9yZW5hbWUnLFxuXHRcdFx0XHRfbWV0YTogeyBjb21tYW5kOiAncmVuYW1lJywgZGVzY3JpcHRpb246ICdSZW5hbWUgdGhpcyBjaGF0JyB9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUNBQW1DLDBCQUEwQjtBQUV0RSxNQUFNLDBCQUEwQixNQUFNO0FBRXJDLDBDQUF3QztBQUV4QyxRQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUssdUNBQXVDLE1BQU07QUFDakQsYUFBTyxZQUFZLG1CQUFtQixTQUFTLEdBQUcsRUFBRTtBQUFBLElBQ3JELENBQUM7QUFFRCxTQUFLLDRDQUE0QyxNQUFNO0FBQ3RELGFBQU8sWUFBWSxtQkFBbUIsc0JBQXNCLEdBQUcsY0FBYztBQUFBLElBQzlFLENBQUM7QUFFRCxTQUFLLCtDQUErQyxNQUFNO0FBQ3pELGFBQU8sWUFBWSxtQkFBbUIscUJBQXFCLEdBQUcsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFFRCxTQUFLLHFDQUFxQyxNQUFNO0FBQy9DLGFBQU8sWUFBWSxtQkFBbUIsVUFBVSxHQUFHLE1BQVM7QUFBQSxJQUM3RCxDQUFDO0FBRUQsU0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxhQUFPLFlBQVksbUJBQW1CLGFBQWEsR0FBRyxNQUFTO0FBQUEsSUFDaEUsQ0FBQztBQUVELFNBQUssOEJBQThCLE1BQU07QUFDeEMsYUFBTyxZQUFZLG1CQUFtQixZQUFZLEdBQUcsTUFBUztBQUFBLElBQy9ELENBQUM7QUFFRCxTQUFLLGtCQUFrQixNQUFNO0FBQzVCLGFBQU8sWUFBWSxtQkFBbUIsV0FBVyxHQUFHLE1BQVM7QUFBQSxJQUM5RCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxxQ0FBcUMsTUFBTTtBQUNoRCxVQUFNLFVBQVU7QUFFaEIsYUFBUyxJQUFJLE1BQWMsYUFBYSxNQUFNLFNBQVMsS0FBSyxRQUFRO0FBQ25FLFlBQU0sV0FBVyxJQUFJLGtDQUFrQyxNQUFNLFVBQVU7QUFDdkUsYUFBTyxTQUFTLHVCQUF1QixFQUFFLE1BQU0sbUJBQW1CLGFBQWEsU0FBUyxTQUFTLE1BQU0sT0FBTyxHQUFHLGtCQUFrQixJQUFJO0FBQUEsSUFDeEk7QUFFQSxTQUFLLDhEQUE4RCxZQUFZO0FBQzlFLFlBQU0sUUFBUSxNQUFNLElBQUksR0FBRztBQUMzQixhQUFPLGdCQUFnQixNQUFNLElBQUksT0FBSyxFQUFFLFVBQVUsR0FBRyxDQUFDLFVBQVUsQ0FBQztBQUFBLElBQ2xFLENBQUM7QUFFRCxTQUFLLHFDQUFxQyxZQUFZO0FBQ3JELFlBQU0sUUFBUSxNQUFNLElBQUksSUFBSTtBQUM1QixhQUFPLGdCQUFnQixNQUFNLElBQUksT0FBSyxFQUFFLFVBQVUsR0FBRyxDQUFDLFVBQVUsQ0FBQztBQUFBLElBQ2xFLENBQUM7QUFFRCxTQUFLLHVDQUF1QyxZQUFZO0FBQ3ZELFlBQU0sUUFBUSxNQUFNLElBQUksTUFBTTtBQUM5QixhQUFPLGdCQUFnQixNQUFNLElBQUksT0FBSyxFQUFFLFVBQVUsR0FBRyxDQUFDLFVBQVUsQ0FBQztBQUFBLElBQ2xFLENBQUM7QUFFRCxTQUFLLGlEQUFpRCxZQUFZO0FBQ2pFLFlBQU0sUUFBUSxNQUFNLElBQUksS0FBSyxLQUFLO0FBQ2xDLGFBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDakMsQ0FBQztBQUVELFNBQUssd0RBQXdELFlBQVk7QUFDeEUsWUFBTSxRQUFRLE1BQU0sSUFBSSxLQUFLO0FBQzdCLGFBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDakMsQ0FBQztBQUVELFNBQUssb0RBQW9ELFlBQVk7QUFDcEUsWUFBTSxRQUFRLE1BQU0sSUFBSSxTQUFTLE1BQU0sQ0FBQztBQUN4QyxhQUFPLGdCQUFnQixPQUFPLENBQUMsQ0FBQztBQUFBLElBQ2pDLENBQUM7QUFFRCxTQUFLLHdEQUF3RCxZQUFZO0FBQ3hFLFlBQU0sUUFBUSxNQUFNLElBQUksR0FBRztBQUMzQixhQUFPLGdCQUFnQixNQUFNLElBQUksT0FBSyxFQUFFLFVBQVUsR0FBRyxDQUFDO0FBQUEsUUFDckQsTUFBTSxzQkFBc0I7QUFBQSxRQUM1QixPQUFPO0FBQUEsUUFDUCxPQUFPLEVBQUUsU0FBUyxVQUFVLGFBQWEsbUJBQW1CO0FBQUEsTUFDN0QsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
