import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { SessionStatus } from "../../common/state/sessionState.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { MessageAttachmentKind } from "../../common/state/protocol/state.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostCompletions, CompletionTriggerCharacter } from "../../node/agentHostCompletions.js";
import { AgentHostFileCompletionProvider, extractAtToken } from "../../node/agentHostFileCompletionProvider.js";
import { AgentHostWorkspaceFiles } from "../../node/agentHostWorkspaceFiles.js";
class FakeWorkspaceFiles extends AgentHostWorkspaceFiles {
  constructor(_files) {
    super(new NullLogService());
    this._files = _files;
  }
  async getFiles() {
    return this._files;
  }
}
function assertResourceUri(attachment, expected) {
  assert.ok(attachment, "expected attachment to be defined");
  assert.strictEqual(attachment.type, MessageAttachmentKind.Resource);
  assert.strictEqual(attachment.type === MessageAttachmentKind.Resource && attachment.uri, expected);
}
suite("AgentHostFileCompletionProvider", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test('announces "@" and "#" as trigger characters via IAgentHostCompletions', () => {
    const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const workspaceFiles = disposables.add(new FakeWorkspaceFiles([]));
    disposables.add(completions.registerProvider(new AgentHostFileCompletionProvider(stateManager, workspaceFiles)));
    assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.File, CompletionTriggerCharacter.Hash]);
  });
  suite("extractAtToken", () => {
    test("returns undefined when there is no @", () => {
      assert.strictEqual(extractAtToken("hello world", 5), void 0);
    });
    test("returns undefined when offset is in plain text after whitespace", () => {
      assert.strictEqual(extractAtToken("look at the file", 7), void 0);
    });
    test("extracts a lone @ at end of string", () => {
      assert.deepStrictEqual(extractAtToken("look at @", 9), { token: "", triggerChar: "@", rangeStart: 8, rangeEnd: 9 });
    });
    test("extracts an @-token after a space", () => {
      assert.deepStrictEqual(extractAtToken("look at @foo", 12), { token: "foo", triggerChar: "@", rangeStart: 8, rangeEnd: 12 });
    });
    test("extracts an @-token at start of string", () => {
      assert.deepStrictEqual(extractAtToken("@foo", 4), { token: "foo", triggerChar: "@", rangeStart: 0, rangeEnd: 4 });
    });
    test("returns undefined when @ is not preceded by whitespace", () => {
      assert.strictEqual(extractAtToken("user@example", 12), void 0);
    });
    test("returns undefined when whitespace separates @ from the cursor", () => {
      assert.strictEqual(extractAtToken("@foo bar", 8), void 0);
    });
    test("honours offset (token = chars between @ and cursor)", () => {
      assert.deepStrictEqual(extractAtToken("look at @foo", 11), { token: "fo", triggerChar: "@", rangeStart: 8, rangeEnd: 11 });
    });
    test("returns undefined for out-of-range offset", () => {
      assert.strictEqual(extractAtToken("hi", 99), void 0);
      assert.strictEqual(extractAtToken("hi", -1), void 0);
    });
    test("extracts a lone # at end of string", () => {
      assert.deepStrictEqual(extractAtToken("look at #", 9), { token: "", triggerChar: "#", rangeStart: 8, rangeEnd: 9 });
    });
    test("extracts a #-token after a space", () => {
      assert.deepStrictEqual(extractAtToken("look at #foo", 12), { token: "foo", triggerChar: "#", rangeStart: 8, rangeEnd: 12 });
    });
    test("extracts a #-token at start of string", () => {
      assert.deepStrictEqual(extractAtToken("#foo", 4), { token: "foo", triggerChar: "#", rangeStart: 0, rangeEnd: 4 });
    });
    test("returns undefined when # is not preceded by whitespace", () => {
      assert.strictEqual(extractAtToken("foo#bar", 7), void 0);
    });
  });
  suite("provideCompletionItems", () => {
    function makeSummary(resource, workingDirectory) {
      return {
        resource,
        provider: "copilot",
        title: "t",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        project: { uri: "file:///project", displayName: "Project" },
        workingDirectories: workingDirectory ? [workingDirectory] : void 0
      };
    }
    function setup(opts) {
      const sessionUri = URI.from({ scheme: "copilot", path: "/test" }).toString();
      const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      stateManager.createSession(makeSummary(sessionUri, opts.workingDirectory?.toString()));
      const workspaceFiles = disposables.add(new FakeWorkspaceFiles(opts.files ?? []));
      const provider = new AgentHostFileCompletionProvider(stateManager, workspaceFiles);
      return { sessionUri, provider };
    }
    test("returns [] when session has no working directory", async () => {
      const { sessionUri, provider } = setup({});
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.deepStrictEqual(result, []);
    });
    test("returns [] for non-file working directory", async () => {
      const { sessionUri, provider } = setup({ workingDirectory: URI.parse("vscode-vfs://github/foo/bar") });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.deepStrictEqual(result, []);
    });
    test("returns [] when there is no @-token at the cursor", async () => {
      const wd = URI.file("/wd");
      const files = [URI.joinPath(wd, "foo.ts")];
      const { sessionUri, provider } = setup({ workingDirectory: wd, files });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "hello world", offset: 5 },
        CancellationToken.None
      );
      assert.deepStrictEqual(result, []);
    });
    test("ranks files by fuzzy match on basename and emits CompletionItems with File attachments", async () => {
      const wd = URI.file("/wd");
      const files = [
        URI.joinPath(wd, "src/util.ts"),
        URI.joinPath(wd, "test/agentHostFileCompletionProvider.test.ts"),
        URI.joinPath(wd, "README.md")
      ];
      const { sessionUri, provider } = setup({ workingDirectory: wd, files });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "see @util", offset: 9 },
        CancellationToken.None
      );
      assert.strictEqual(result.length, 1);
      assert.deepStrictEqual(result[0], {
        insertText: "@util.ts",
        rangeStart: 4,
        rangeEnd: 9,
        attachment: {
          type: MessageAttachmentKind.Resource,
          uri: URI.joinPath(wd, "src/util.ts").toString(),
          label: "util.ts",
          displayKind: "document"
        }
      });
    });
    test('uses "#" as the insertText prefix when triggered with #', async () => {
      const wd = URI.file("/wd");
      const files = [URI.joinPath(wd, "src/util.ts")];
      const { sessionUri, provider } = setup({ workingDirectory: wd, files });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "see #util", offset: 9 },
        CancellationToken.None
      );
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].insertText, "#util.ts");
      assert.strictEqual(result[0].rangeStart, 4);
    });
    test("returns the first MAX_RESULTS files in enumeration order for an empty token", async () => {
      const wd = URI.file("/wd");
      const files = Array.from({ length: 100 }, (_, i) => URI.joinPath(wd, `file${i}.ts`));
      const { sessionUri, provider } = setup({ workingDirectory: wd, files });
      const result = await provider.provideCompletionItems(
        { kind: CompletionItemKind.UserMessage, channel: sessionUri, text: "@", offset: 1 },
        CancellationToken.None
      );
      assert.strictEqual(result.length, 50);
      assertResourceUri(result[0].attachment, files[0].toString());
      assertResourceUri(result[49].attachment, files[49].toString());
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Qcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cywgdHlwZSBTZXNzaW9uU3VtbWFyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW1LaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VBdHRhY2htZW50S2luZCwgdHlwZSBNZXNzYWdlQXR0YWNobWVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb21wbGV0aW9ucywgQ29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdENvbXBsZXRpb25zLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEZpbGVDb21wbGV0aW9uUHJvdmlkZXIsIGV4dHJhY3RBdFRva2VuIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RGaWxlQ29tcGxldGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFdvcmtzcGFjZUZpbGVzIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcy5qcyc7XG5cbmNsYXNzIEZha2VXb3Jrc3BhY2VGaWxlcyBleHRlbmRzIEFnZW50SG9zdFdvcmtzcGFjZUZpbGVzIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZmlsZXM6IHJlYWRvbmx5IFVSSVtdKSB7XG5cdFx0c3VwZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIGdldEZpbGVzKCk6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsZXM7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNzZXJ0UmVzb3VyY2VVcmkoYXR0YWNobWVudDogTWVzc2FnZUF0dGFjaG1lbnQgfCB1bmRlZmluZWQsIGV4cGVjdGVkOiBzdHJpbmcpOiB2b2lkIHtcblx0YXNzZXJ0Lm9rKGF0dGFjaG1lbnQsICdleHBlY3RlZCBhdHRhY2htZW50IHRvIGJlIGRlZmluZWQnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaG1lbnQudHlwZSwgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaG1lbnQudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlICYmIGF0dGFjaG1lbnQudXJpLCBleHBlY3RlZCk7XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RGaWxlQ29tcGxldGlvblByb3ZpZGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYW5ub3VuY2VzIFwiQFwiIGFuZCBcIiNcIiBhcyB0cmlnZ2VyIGNoYXJhY3RlcnMgdmlhIElBZ2VudEhvc3RDb21wbGV0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q29tcGxldGlvbnMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZpbGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlV29ya3NwYWNlRmlsZXMoW10pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29tcGxldGlvbnMucmVnaXN0ZXJQcm92aWRlcihuZXcgQWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Qcm92aWRlcihzdGF0ZU1hbmFnZXIsIHdvcmtzcGFjZUZpbGVzKSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNvbXBsZXRpb25zLnRyaWdnZXJDaGFyYWN0ZXJzXSwgW0NvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyLkZpbGUsIENvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyLkhhc2hdKTtcblx0fSk7XG5cblx0c3VpdGUoJ2V4dHJhY3RBdFRva2VuJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdGhlcmUgaXMgbm8gQCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0QXRUb2tlbignaGVsbG8gd29ybGQnLCA1KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gb2Zmc2V0IGlzIGluIHBsYWluIHRleHQgYWZ0ZXIgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0QXRUb2tlbignbG9vayBhdCB0aGUgZmlsZScsIDcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgYSBsb25lIEAgYXQgZW5kIG9mIHN0cmluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ2xvb2sgYXQgQCcsIDkpLCB7IHRva2VuOiAnJywgdHJpZ2dlckNoYXI6ICdAJywgcmFuZ2VTdGFydDogOCwgcmFuZ2VFbmQ6IDkgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBhbiBALXRva2VuIGFmdGVyIGEgc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBdFRva2VuKCdsb29rIGF0IEBmb28nLCAxMiksIHsgdG9rZW46ICdmb28nLCB0cmlnZ2VyQ2hhcjogJ0AnLCByYW5nZVN0YXJ0OiA4LCByYW5nZUVuZDogMTIgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBhbiBALXRva2VuIGF0IHN0YXJ0IG9mIHN0cmluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ0Bmb28nLCA0KSwgeyB0b2tlbjogJ2ZvbycsIHRyaWdnZXJDaGFyOiAnQCcsIHJhbmdlU3RhcnQ6IDAsIHJhbmdlRW5kOiA0IH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBAIGlzIG5vdCBwcmVjZWRlZCBieSB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdFx0Ly8gZS5nLiBhbiBlbWFpbC1saWtlIHRva2VuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ3VzZXJAZXhhbXBsZScsIDEyKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gd2hpdGVzcGFjZSBzZXBhcmF0ZXMgQCBmcm9tIHRoZSBjdXJzb3InLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ0Bmb28gYmFyJywgOCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob25vdXJzIG9mZnNldCAodG9rZW4gPSBjaGFycyBiZXR3ZWVuIEAgYW5kIGN1cnNvciknLCAoKSA9PiB7XG5cdFx0XHQvLyBDdXJzb3IgaXMgbWlkLXRva2VuOiBcImxvb2sgYXQgQGZvfG9cIlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QXRUb2tlbignbG9vayBhdCBAZm9vJywgMTEpLCB7IHRva2VuOiAnZm8nLCB0cmlnZ2VyQ2hhcjogJ0AnLCByYW5nZVN0YXJ0OiA4LCByYW5nZUVuZDogMTEgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igb3V0LW9mLXJhbmdlIG9mZnNldCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0QXRUb2tlbignaGknLCA5OSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ2hpJywgLTEpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgYSBsb25lICMgYXQgZW5kIG9mIHN0cmluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ2xvb2sgYXQgIycsIDkpLCB7IHRva2VuOiAnJywgdHJpZ2dlckNoYXI6ICcjJywgcmFuZ2VTdGFydDogOCwgcmFuZ2VFbmQ6IDkgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBhICMtdG9rZW4gYWZ0ZXIgYSBzcGFjZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXh0cmFjdEF0VG9rZW4oJ2xvb2sgYXQgI2ZvbycsIDEyKSwgeyB0b2tlbjogJ2ZvbycsIHRyaWdnZXJDaGFyOiAnIycsIHJhbmdlU3RhcnQ6IDgsIHJhbmdlRW5kOiAxMiB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGEgIy10b2tlbiBhdCBzdGFydCBvZiBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBdFRva2VuKCcjZm9vJywgNCksIHsgdG9rZW46ICdmb28nLCB0cmlnZ2VyQ2hhcjogJyMnLCByYW5nZVN0YXJ0OiAwLCByYW5nZUVuZDogNCB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gIyBpcyBub3QgcHJlY2VkZWQgYnkgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0QXRUb2tlbignZm9vI2JhcicsIDcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJvdmlkZUNvbXBsZXRpb25JdGVtcycsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIG1ha2VTdW1tYXJ5KHJlc291cmNlOiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFNlc3Npb25TdW1tYXJ5IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHR0aXRsZTogJ3QnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnUHJvamVjdCcgfSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzZXR1cChvcHRzOiB7IHdvcmtpbmdEaXJlY3Rvcnk/OiBVUkk7IGZpbGVzPzogcmVhZG9ubHkgVVJJW10gfSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvdGVzdCcgfSkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShzZXNzaW9uVXJpLCBvcHRzLndvcmtpbmdEaXJlY3Rvcnk/LnRvU3RyaW5nKCkpKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZpbGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGYWtlV29ya3NwYWNlRmlsZXMob3B0cy5maWxlcyA/PyBbXSkpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgQWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Qcm92aWRlcihzdGF0ZU1hbmFnZXIsIHdvcmtzcGFjZUZpbGVzKTtcblx0XHRcdHJldHVybiB7IHNlc3Npb25VcmksIHByb3ZpZGVyIH07XG5cdFx0fVxuXG5cdFx0dGVzdCgncmV0dXJucyBbXSB3aGVuIHNlc3Npb24gaGFzIG5vIHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwcm92aWRlciB9ID0gc2V0dXAoe30pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdFx0eyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb25VcmksIHRleHQ6ICdAJywgb2Zmc2V0OiAxIH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgW10gZm9yIG5vbi1maWxlIHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwcm92aWRlciB9ID0gc2V0dXAoeyB3b3JraW5nRGlyZWN0b3J5OiBVUkkucGFyc2UoJ3ZzY29kZS12ZnM6Ly9naXRodWIvZm9vL2JhcicpIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdFx0eyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb25VcmksIHRleHQ6ICdAJywgb2Zmc2V0OiAxIH0sXG5cdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgW10gd2hlbiB0aGVyZSBpcyBubyBALXRva2VuIGF0IHRoZSBjdXJzb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3ZCA9IFVSSS5maWxlKCcvd2QnKTtcblx0XHRcdGNvbnN0IGZpbGVzID0gW1VSSS5qb2luUGF0aCh3ZCwgJ2Zvby50cycpXTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcHJvdmlkZXIgfSA9IHNldHVwKHsgd29ya2luZ0RpcmVjdG9yeTogd2QsIGZpbGVzIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdFx0eyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb25VcmksIHRleHQ6ICdoZWxsbyB3b3JsZCcsIG9mZnNldDogNSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyYW5rcyBmaWxlcyBieSBmdXp6eSBtYXRjaCBvbiBiYXNlbmFtZSBhbmQgZW1pdHMgQ29tcGxldGlvbkl0ZW1zIHdpdGggRmlsZSBhdHRhY2htZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHdkID0gVVJJLmZpbGUoJy93ZCcpO1xuXHRcdFx0Y29uc3QgZmlsZXMgPSBbXG5cdFx0XHRcdFVSSS5qb2luUGF0aCh3ZCwgJ3NyYy91dGlsLnRzJyksXG5cdFx0XHRcdFVSSS5qb2luUGF0aCh3ZCwgJ3Rlc3QvYWdlbnRIb3N0RmlsZUNvbXBsZXRpb25Qcm92aWRlci50ZXN0LnRzJyksXG5cdFx0XHRcdFVSSS5qb2luUGF0aCh3ZCwgJ1JFQURNRS5tZCcpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgcHJvdmlkZXIgfSA9IHNldHVwKHsgd29ya2luZ0RpcmVjdG9yeTogd2QsIGZpbGVzIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRcdFx0eyBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVXNlck1lc3NhZ2UsIGNoYW5uZWw6IHNlc3Npb25VcmksIHRleHQ6ICdzZWUgQHV0aWwnLCBvZmZzZXQ6IDkgfSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwge1xuXHRcdFx0XHRpbnNlcnRUZXh0OiAnQHV0aWwudHMnLFxuXHRcdFx0XHRyYW5nZVN0YXJ0OiA0LFxuXHRcdFx0XHRyYW5nZUVuZDogOSxcblx0XHRcdFx0YXR0YWNobWVudDoge1xuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aCh3ZCwgJ3NyYy91dGlsLnRzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRsYWJlbDogJ3V0aWwudHMnLFxuXHRcdFx0XHRcdGRpc3BsYXlLaW5kOiAnZG9jdW1lbnQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIFwiI1wiIGFzIHRoZSBpbnNlcnRUZXh0IHByZWZpeCB3aGVuIHRyaWdnZXJlZCB3aXRoICMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3ZCA9IFVSSS5maWxlKCcvd2QnKTtcblx0XHRcdGNvbnN0IGZpbGVzID0gW1VSSS5qb2luUGF0aCh3ZCwgJ3NyYy91dGlsLnRzJyldO1xuXHRcdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBwcm92aWRlciB9ID0gc2V0dXAoeyB3b3JraW5nRGlyZWN0b3J5OiB3ZCwgZmlsZXMgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKFxuXHRcdFx0XHR7IGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSwgY2hhbm5lbDogc2Vzc2lvblVyaSwgdGV4dDogJ3NlZSAjdXRpbCcsIG9mZnNldDogOSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaW5zZXJ0VGV4dCwgJyN1dGlsLnRzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnJhbmdlU3RhcnQsIDQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0aGUgZmlyc3QgTUFYX1JFU1VMVFMgZmlsZXMgaW4gZW51bWVyYXRpb24gb3JkZXIgZm9yIGFuIGVtcHR5IHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2QgPSBVUkkuZmlsZSgnL3dkJyk7XG5cdFx0XHRjb25zdCBmaWxlcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEwMCB9LCAoXywgaSkgPT4gVVJJLmpvaW5QYXRoKHdkLCBgZmlsZSR7aX0udHNgKSk7XG5cdFx0XHRjb25zdCB7IHNlc3Npb25VcmksIHByb3ZpZGVyIH0gPSBzZXR1cCh7IHdvcmtpbmdEaXJlY3Rvcnk6IHdkLCBmaWxlcyB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0XHRcdHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiBzZXNzaW9uVXJpLCB0ZXh0OiAnQCcsIG9mZnNldDogMSB9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA1MCk7XG5cdFx0XHRhc3NlcnRSZXNvdXJjZVVyaShyZXN1bHRbMF0uYXR0YWNobWVudCwgZmlsZXNbMF0udG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnRSZXNvdXJjZVVyaShyZXN1bHRbNDldLmF0dGFjaG1lbnQsIGZpbGVzWzQ5XS50b1N0cmluZygpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBMEM7QUFDbkQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBcUQ7QUFDOUQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0Isa0NBQWtDO0FBQ2pFLFNBQVMsaUNBQWlDLHNCQUFzQjtBQUNoRSxTQUFTLCtCQUErQjtBQUV4QyxNQUFNLDJCQUEyQix3QkFBd0I7QUFBQSxFQUN4RCxZQUE2QixRQUF3QjtBQUNwRCxVQUFNLElBQUksZUFBZSxDQUFDO0FBREU7QUFBQSxFQUU3QjtBQUFBLEVBQ0EsTUFBZSxXQUFvQztBQUNsRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFFQSxTQUFTLGtCQUFrQixZQUEyQyxVQUF3QjtBQUM3RixTQUFPLEdBQUcsWUFBWSxtQ0FBbUM7QUFDekQsU0FBTyxZQUFZLFdBQVcsTUFBTSxzQkFBc0Is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
