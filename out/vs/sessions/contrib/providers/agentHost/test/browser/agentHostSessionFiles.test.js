import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import {
  FileEditKind,
  ResponsePartKind,
  ToolCallConfirmationReason,
  ToolCallStatus,
  ToolResultContentType
} from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { SessionFileOperation } from "../../../../../services/sessions/common/session.js";
import {
  createIncrementalChatFileEditsParser,
  parseResponseParts,
  reduceSessionFiles,
  reduceTurnChanges
} from "../../browser/agentHostSessionFiles.js";
let seq = 0;
function toolCallPart(toolCall) {
  return { kind: ResponsePartKind.ToolCall, toolCall };
}
function markdownPart(content) {
  return { kind: ResponsePartKind.Markdown, id: `md-${seq++}`, content };
}
function completedToolCallPart(content) {
  return toolCallPart({
    status: ToolCallStatus.Completed,
    toolCallId: `tc-${seq++}`,
    toolName: "editFile",
    displayName: "Edit File",
    invocationMessage: "Editing",
    confirmed: ToolCallConfirmationReason.NotNeeded,
    success: true,
    pastTenseMessage: "Edited",
    content
  });
}
function pendingConfirmationToolCallPart(items) {
  return toolCallPart({
    status: ToolCallStatus.PendingConfirmation,
    toolCallId: `tc-${seq++}`,
    toolName: "editFile",
    displayName: "Edit File",
    invocationMessage: "Editing",
    edits: { items }
  });
}
function createEdit(uri, diff) {
  return { type: ToolResultContentType.FileEdit, after: { uri, content: { uri: `${uri}.after` } }, diff };
}
function editEdit(uri, diff) {
  return {
    type: ToolResultContentType.FileEdit,
    before: { uri, content: { uri: `${uri}.before` } },
    after: { uri, content: { uri: `${uri}.after` } },
    diff
  };
}
function deleteEdit(uri, diff) {
  return { type: ToolResultContentType.FileEdit, before: { uri, content: { uri: `${uri}.before` } }, diff };
}
function parsedEdit(kind, uris, diff) {
  return {
    kind,
    afterUri: uris.after ? URI.file(uris.after) : void 0,
    beforeUri: uris.before ? URI.file(uris.before) : void 0,
    beforeContentUri: uris.beforeContent ? URI.file(uris.beforeContent) : void 0,
    insertions: diff?.insertions ?? 0,
    deletions: diff?.deletions ?? 0
  };
}
suite("agentHostSessionFiles", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("incremental parser parses each completed turn once and re-parses only the active turn", () => {
    const parseCounts = /* @__PURE__ */ new Map();
    const countingParseTurn = (parts) => {
      parseCounts.set(parts, (parseCounts.get(parts) ?? 0) + 1);
      return [];
    };
    const parse = createIncrementalChatFileEditsParser(void 0, countingParseTurn);
    const t1Parts = [];
    const t2Parts = [];
    const active1Parts = [];
    const active2Parts = [];
    const active3Parts = [];
    parse({ turns: [{ id: "t1", responseParts: t1Parts }] });
    parse({ turns: [{ id: "t1", responseParts: t1Parts }], activeTurn: { responseParts: active1Parts } });
    parse({ turns: [{ id: "t1", responseParts: t1Parts }], activeTurn: { responseParts: active2Parts } });
    parse({ turns: [{ id: "t1", responseParts: t1Parts }, { id: "t2", responseParts: t2Parts }] });
    parse({
      turns: [{ id: "t1", responseParts: t1Parts }, { id: "t2", responseParts: t2Parts }],
      activeTurn: { responseParts: active3Parts }
    });
    assert.deepStrictEqual(
      {
        t1: parseCounts.get(t1Parts),
        t2: parseCounts.get(t2Parts),
        active1: parseCounts.get(active1Parts),
        active2: parseCounts.get(active2Parts),
        active3: parseCounts.get(active3Parts)
      },
      { t1: 1, t2: 1, active1: 1, active2: 1, active3: 1 }
    );
  });
  test("incremental parser keeps completed-turn edits while a new turn streams and tracks the last turn", () => {
    const parse = createIncrementalChatFileEditsParser();
    const t1Parts = [completedToolCallPart([createEdit("file:///a.txt")])];
    const completed = { turns: [{ id: "t1", responseParts: t1Parts }] };
    const first = parse(completed);
    const streaming = parse({
      turns: [{ id: "t1", responseParts: t1Parts }],
      activeTurn: { responseParts: [completedToolCallPart([createEdit("file:///b.txt")])] }
    });
    assert.deepStrictEqual(
      {
        firstAll: first.allEdits.map((e) => e.afterUri?.toString()),
        firstLastTurn: first.lastTurnEdits.map((e) => e.afterUri?.toString()),
        streamingAll: streaming.allEdits.map((e) => e.afterUri?.toString()),
        streamingLastTurn: streaming.lastTurnEdits.map((e) => e.afterUri?.toString())
      },
      {
        // When idle, the last turn is the most recently completed turn.
        firstAll: ["file:///a.txt"],
        firstLastTurn: ["file:///a.txt"],
        // While streaming, `allEdits` unions every turn but `lastTurnEdits`
        // reflects only the in-progress turn.
        streamingAll: ["file:///a.txt", "file:///b.txt"],
        streamingLastTurn: ["file:///b.txt"]
      }
    );
  });
  test("parseResponseParts extracts edits from completed and pending tool calls and ignores non-tool parts", () => {
    const parts = [
      markdownPart("hello"),
      completedToolCallPart([createEdit("file:///created.txt"), editEdit("file:///edited.txt")]),
      pendingConfirmationToolCallPart([deleteEdit("file:///deleted.txt")])
    ];
    const parsed = parseResponseParts(parts);
    assert.deepStrictEqual(
      parsed.map((e) => ({ kind: e.kind, uri: (e.afterUri ?? e.beforeUri)?.toString() })),
      [
        { kind: FileEditKind.Create, uri: "file:///created.txt" },
        { kind: FileEditKind.Edit, uri: "file:///edited.txt" },
        { kind: FileEditKind.Delete, uri: "file:///deleted.txt" }
      ]
    );
  });
  test("reduceSessionFiles classifies operations and filters workspace files", () => {
    const edits = [
      // created-then-edited outside workspace → Created
      parsedEdit(FileEditKind.Create, { after: "/home/user/.config/app.json" }),
      parsedEdit(FileEditKind.Edit, { after: "/home/user/.config/app.json", beforeContent: "/home/user/.config/app.json.before" }),
      // edited outside workspace → Modified (keeps original for diff)
      parsedEdit(FileEditKind.Edit, { after: "/home/user/.bashrc", beforeContent: "/home/user/.bashrc.before" }),
      // deleted outside workspace → removed from the list entirely
      parsedEdit(FileEditKind.Delete, { before: "/tmp/scratch.log", beforeContent: "/tmp/scratch.log.before" }),
      // inside workspace → excluded
      parsedEdit(FileEditKind.Create, { after: "/repo/src/index.ts" })
    ];
    const files = reduceSessionFiles(edits, [URI.file("/repo")]);
    assert.deepStrictEqual(
      files.map((f) => ({ uri: f.uri.path, operation: f.operation, original: f.originalUri?.path })),
      [
        { uri: "/home/user/.bashrc", operation: SessionFileOperation.Modified, original: "/home/user/.bashrc.before" },
        { uri: "/home/user/.config/app.json", operation: SessionFileOperation.Created, original: void 0 }
      ]
    );
  });
  test("reduceSessionFiles reports a rename as a create of the target and drops the source", () => {
    const edits = [
      parsedEdit(FileEditKind.Rename, { before: "/home/user/old.txt", after: "/home/user/new.txt", beforeContent: "/home/user/old.txt.before" })
    ];
    const files = reduceSessionFiles(edits, [URI.file("/repo")]);
    assert.deepStrictEqual(
      files.map((f) => ({ uri: f.uri.path, operation: f.operation })),
      [
        { uri: "/home/user/new.txt", operation: SessionFileOperation.Created }
      ]
    );
  });
  test("reduceSessionFiles drops a file that is created and then deleted", () => {
    const edits = [
      parsedEdit(FileEditKind.Create, { after: "/home/user/scratch.tmp" }),
      parsedEdit(FileEditKind.Delete, { before: "/home/user/scratch.tmp" })
    ];
    const files = reduceSessionFiles(edits, [URI.file("/repo")]);
    assert.deepStrictEqual(files, []);
  });
  test("reduceTurnChanges collapses repeated edits per file and aggregates diff stats", () => {
    const edits = [
      // created then edited → one created change, summed diffs, no original side
      parsedEdit(FileEditKind.Create, { after: "/repo/new.ts" }, { insertions: 10 }),
      parsedEdit(FileEditKind.Edit, { after: "/repo/new.ts", beforeContent: "/repo/new.ts.before" }, { insertions: 3, deletions: 1 }),
      // pre-existing file edited twice → one modified change keeping the first original
      parsedEdit(FileEditKind.Edit, { after: "/repo/existing.ts", beforeContent: "/repo/existing.ts.before" }, { insertions: 2, deletions: 4 }),
      parsedEdit(FileEditKind.Edit, { after: "/repo/existing.ts", beforeContent: "/repo/existing.ts.before2" }, { insertions: 1 }),
      // pre-existing file deleted → surfaced as a deletion (no modified side)
      parsedEdit(FileEditKind.Delete, { before: "/repo/gone.ts", beforeContent: "/repo/gone.ts.before" }, { deletions: 8 })
    ];
    const changes = reduceTurnChanges(edits).map((c) => ({
      uri: c.uri.path,
      modified: c.modifiedUri?.path,
      original: c.originalUri?.path,
      insertions: c.insertions,
      deletions: c.deletions
    }));
    assert.deepStrictEqual(changes, [
      { uri: "/repo/new.ts", modified: "/repo/new.ts", original: void 0, insertions: 13, deletions: 1 },
      { uri: "/repo/existing.ts", modified: "/repo/existing.ts", original: "/repo/existing.ts.before", insertions: 3, deletions: 4 },
      { uri: "/repo/gone.ts", modified: void 0, original: "/repo/gone.ts.before", insertions: 0, deletions: 8 }
    ]);
  });
  test("reduceTurnChanges filters files outside the workspace and worktree roots", () => {
    const edits = [
      parsedEdit(FileEditKind.Edit, { after: "/repo/src/app.ts", beforeContent: "/repo/src/app.ts.before" }, { insertions: 2 }),
      parsedEdit(FileEditKind.Create, { after: "/tmp/session-worktree/README.md" }, { insertions: 5 }),
      parsedEdit(FileEditKind.Edit, { after: "/home/user/.config/tool.json", beforeContent: "/home/user/.config/tool.json.before" }, { insertions: 10, deletions: 1 })
    ];
    const changes = reduceTurnChanges(edits, [URI.file("/repo"), URI.file("/tmp/session-worktree")]).map((c) => ({
      uri: c.uri.path,
      modified: c.modifiedUri?.path,
      original: c.originalUri?.path,
      insertions: c.insertions,
      deletions: c.deletions
    }));
    assert.deepStrictEqual(changes, [
      { uri: "/repo/src/app.ts", modified: "/repo/src/app.ts", original: "/repo/src/app.ts.before", insertions: 2, deletions: 0 },
      { uri: "/tmp/session-worktree/README.md", modified: "/tmp/session-worktree/README.md", original: void 0, insertions: 5, deletions: 0 }
    ]);
  });
  test("reduceTurnChanges nets out a file created and then deleted in the same turn", () => {
    const edits = [
      parsedEdit(FileEditKind.Create, { after: "/repo/scratch.tmp" }, { insertions: 5 }),
      parsedEdit(FileEditKind.Delete, { before: "/repo/scratch.tmp" })
    ];
    assert.deepStrictEqual(reduceTurnChanges(edits), []);
  });
  test("reduceTurnChanges reports a rename as an edit of the target and drops the source", () => {
    const edits = [
      parsedEdit(FileEditKind.Rename, { before: "/repo/old.ts", after: "/repo/renamed.ts", beforeContent: "/repo/old.ts.before" }, { insertions: 1, deletions: 2 })
    ];
    const changes = reduceTurnChanges(edits).map((c) => ({
      uri: c.uri.path,
      modified: c.modifiedUri?.path,
      original: c.originalUri?.path,
      insertions: c.insertions,
      deletions: c.deletions
    }));
    assert.deepStrictEqual(changes, [
      { uri: "/repo/renamed.ts", modified: "/repo/renamed.ts", original: "/repo/old.ts.before", insertions: 1, deletions: 2 }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvYWdlbnRIb3N0U2Vzc2lvbkZpbGVzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQge1xuXHRGaWxlRWRpdEtpbmQsXG5cdFJlc3BvbnNlUGFydEtpbmQsXG5cdFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLFxuXHRUb29sQ2FsbFN0YXR1cyxcblx0VG9vbFJlc3VsdENvbnRlbnRUeXBlLFxuXHR0eXBlIFJlc3BvbnNlUGFydCxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkZpbGVPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQge1xuXHRjcmVhdGVJbmNyZW1lbnRhbENoYXRGaWxlRWRpdHNQYXJzZXIsXG5cdElGaWxlRWRpdENoYXRTdGF0ZSxcblx0SVBhcnNlZEZpbGVFZGl0LFxuXHRwYXJzZVJlc3BvbnNlUGFydHMsXG5cdHJlZHVjZVNlc3Npb25GaWxlcyxcblx0cmVkdWNlVHVybkNoYW5nZXMsXG59IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRIb3N0U2Vzc2lvbkZpbGVzLmpzJztcblxuLy8gXHUyNTAwXHUyNTAwIFByb3RvY29sIGZpeHR1cmUgaGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxubGV0IHNlcSA9IDA7XG5cbmZ1bmN0aW9uIHRvb2xDYWxsUGFydCh0b29sQ2FsbDogb2JqZWN0KTogUmVzcG9uc2VQYXJ0IHtcblx0cmV0dXJuIHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGwgfSBhcyBSZXNwb25zZVBhcnQ7XG59XG5cbmZ1bmN0aW9uIG1hcmtkb3duUGFydChjb250ZW50OiBzdHJpbmcpOiBSZXNwb25zZVBhcnQge1xuXHRyZXR1cm4geyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogYG1kLSR7c2VxKyt9YCwgY29udGVudCB9IGFzIFJlc3BvbnNlUGFydDtcbn1cblxuLyoqIEEgY29tcGxldGVkIHRvb2wgY2FsbCBjYXJyeWluZyB0aGUgZ2l2ZW4gZmlsZS1lZGl0IHJlc3VsdHMuICovXG5mdW5jdGlvbiBjb21wbGV0ZWRUb29sQ2FsbFBhcnQoY29udGVudDogb2JqZWN0W10pOiBSZXNwb25zZVBhcnQge1xuXHRyZXR1cm4gdG9vbENhbGxQYXJ0KHtcblx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHR0b29sQ2FsbElkOiBgdGMtJHtzZXErK31gLFxuXHRcdHRvb2xOYW1lOiAnZWRpdEZpbGUnLFxuXHRcdGRpc3BsYXlOYW1lOiAnRWRpdCBGaWxlJyxcblx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0VkaXRpbmcnLFxuXHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0VkaXRlZCcsXG5cdFx0Y29udGVudCxcblx0fSk7XG59XG5cbi8qKiBBIHRvb2wgY2FsbCBhd2FpdGluZyBjb25maXJtYXRpb24sIGNhcnJ5aW5nIGl0cyBwbGFubmVkIGVkaXRzLiAqL1xuZnVuY3Rpb24gcGVuZGluZ0NvbmZpcm1hdGlvblRvb2xDYWxsUGFydChpdGVtczogb2JqZWN0W10pOiBSZXNwb25zZVBhcnQge1xuXHRyZXR1cm4gdG9vbENhbGxQYXJ0KHtcblx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0dG9vbENhbGxJZDogYHRjLSR7c2VxKyt9YCxcblx0XHR0b29sTmFtZTogJ2VkaXRGaWxlJyxcblx0XHRkaXNwbGF5TmFtZTogJ0VkaXQgRmlsZScsXG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdFZGl0aW5nJyxcblx0XHRlZGl0czogeyBpdGVtcyB9LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRWRpdCh1cmk6IHN0cmluZywgZGlmZj86IHsgYWRkZWQ/OiBudW1iZXI7IHJlbW92ZWQ/OiBudW1iZXIgfSk6IG9iamVjdCB7XG5cdHJldHVybiB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCwgYWZ0ZXI6IHsgdXJpLCBjb250ZW50OiB7IHVyaTogYCR7dXJpfS5hZnRlcmAgfSB9LCBkaWZmIH07XG59XG5cbmZ1bmN0aW9uIGVkaXRFZGl0KHVyaTogc3RyaW5nLCBkaWZmPzogeyBhZGRlZD86IG51bWJlcjsgcmVtb3ZlZD86IG51bWJlciB9KTogb2JqZWN0IHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0YmVmb3JlOiB7IHVyaSwgY29udGVudDogeyB1cmk6IGAke3VyaX0uYmVmb3JlYCB9IH0sXG5cdFx0YWZ0ZXI6IHsgdXJpLCBjb250ZW50OiB7IHVyaTogYCR7dXJpfS5hZnRlcmAgfSB9LFxuXHRcdGRpZmYsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZUVkaXQodXJpOiBzdHJpbmcsIGRpZmY/OiB7IGFkZGVkPzogbnVtYmVyOyByZW1vdmVkPzogbnVtYmVyIH0pOiBvYmplY3Qge1xuXHRyZXR1cm4geyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsIGJlZm9yZTogeyB1cmksIGNvbnRlbnQ6IHsgdXJpOiBgJHt1cml9LmJlZm9yZWAgfSB9LCBkaWZmIH07XG59XG5cbmZ1bmN0aW9uIHBhcnNlZEVkaXQoa2luZDogRmlsZUVkaXRLaW5kLCB1cmlzOiB7IGFmdGVyPzogc3RyaW5nOyBiZWZvcmU/OiBzdHJpbmc7IGJlZm9yZUNvbnRlbnQ/OiBzdHJpbmcgfSwgZGlmZj86IHsgaW5zZXJ0aW9ucz86IG51bWJlcjsgZGVsZXRpb25zPzogbnVtYmVyIH0pOiBJUGFyc2VkRmlsZUVkaXQge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQsXG5cdFx0YWZ0ZXJVcmk6IHVyaXMuYWZ0ZXIgPyBVUkkuZmlsZSh1cmlzLmFmdGVyKSA6IHVuZGVmaW5lZCxcblx0XHRiZWZvcmVVcmk6IHVyaXMuYmVmb3JlID8gVVJJLmZpbGUodXJpcy5iZWZvcmUpIDogdW5kZWZpbmVkLFxuXHRcdGJlZm9yZUNvbnRlbnRVcmk6IHVyaXMuYmVmb3JlQ29udGVudCA/IFVSSS5maWxlKHVyaXMuYmVmb3JlQ29udGVudCkgOiB1bmRlZmluZWQsXG5cdFx0aW5zZXJ0aW9uczogZGlmZj8uaW5zZXJ0aW9ucyA/PyAwLFxuXHRcdGRlbGV0aW9uczogZGlmZj8uZGVsZXRpb25zID8/IDAsXG5cdH07XG59XG5cbi8vIFx1MjUwMFx1MjUwMCBUZXN0cyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuc3VpdGUoJ2FnZW50SG9zdFNlc3Npb25GaWxlcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpbmNyZW1lbnRhbCBwYXJzZXIgcGFyc2VzIGVhY2ggY29tcGxldGVkIHR1cm4gb25jZSBhbmQgcmUtcGFyc2VzIG9ubHkgdGhlIGFjdGl2ZSB0dXJuJywgKCkgPT4ge1xuXHRcdC8vIENvdW50IGhvdyBtYW55IHRpbWVzIGVhY2ggZGlzdGluY3QgcmVzcG9uc2VQYXJ0cyBhcnJheSBpcyBwYXJzZWQuXG5cdFx0Y29uc3QgcGFyc2VDb3VudHMgPSBuZXcgTWFwPFJlc3BvbnNlUGFydFtdLCBudW1iZXI+KCk7XG5cdFx0Y29uc3QgY291bnRpbmdQYXJzZVR1cm4gPSAocGFydHM6IFJlc3BvbnNlUGFydFtdKTogcmVhZG9ubHkgSVBhcnNlZEZpbGVFZGl0W10gPT4ge1xuXHRcdFx0cGFyc2VDb3VudHMuc2V0KHBhcnRzLCAocGFyc2VDb3VudHMuZ2V0KHBhcnRzKSA/PyAwKSArIDEpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH07XG5cblx0XHRjb25zdCBwYXJzZSA9IGNyZWF0ZUluY3JlbWVudGFsQ2hhdEZpbGVFZGl0c1BhcnNlcih1bmRlZmluZWQsIGNvdW50aW5nUGFyc2VUdXJuKTtcblxuXHRcdC8vIEVhY2ggdHVybiAvIGFjdGl2ZS10dXJuIHNuYXBzaG90IGdldHMgYSB1bmlxdWVseS1pZGVudGlmaWFibGUgYXJyYXkuXG5cdFx0Y29uc3QgdDFQYXJ0czogUmVzcG9uc2VQYXJ0W10gPSBbXTtcblx0XHRjb25zdCB0MlBhcnRzOiBSZXNwb25zZVBhcnRbXSA9IFtdO1xuXHRcdGNvbnN0IGFjdGl2ZTFQYXJ0czogUmVzcG9uc2VQYXJ0W10gPSBbXTtcblx0XHRjb25zdCBhY3RpdmUyUGFydHM6IFJlc3BvbnNlUGFydFtdID0gW107XG5cdFx0Y29uc3QgYWN0aXZlM1BhcnRzOiBSZXNwb25zZVBhcnRbXSA9IFtdO1xuXG5cdFx0Ly8gMSkgRmlyc3QgY29tcGxldGVkIHR1cm4gYXJyaXZlcy5cblx0XHRwYXJzZSh7IHR1cm5zOiBbeyBpZDogJ3QxJywgcmVzcG9uc2VQYXJ0czogdDFQYXJ0cyB9XSB9KTtcblx0XHQvLyAyKSBBIHR1cm4gc3RhcnRzIHN0cmVhbWluZyAoYWN0aXZlKS5cblx0XHRwYXJzZSh7IHR1cm5zOiBbeyBpZDogJ3QxJywgcmVzcG9uc2VQYXJ0czogdDFQYXJ0cyB9XSwgYWN0aXZlVHVybjogeyByZXNwb25zZVBhcnRzOiBhY3RpdmUxUGFydHMgfSB9KTtcblx0XHQvLyAzKSBTYW1lIGFjdGl2ZSB0dXJuIHN0cmVhbXMgYW5vdGhlciBkZWx0YS5cblx0XHRwYXJzZSh7IHR1cm5zOiBbeyBpZDogJ3QxJywgcmVzcG9uc2VQYXJ0czogdDFQYXJ0cyB9XSwgYWN0aXZlVHVybjogeyByZXNwb25zZVBhcnRzOiBhY3RpdmUyUGFydHMgfSB9KTtcblx0XHQvLyA0KSBBY3RpdmUgdHVybiBmaW5hbGl6ZXMgaW50byB0Mi5cblx0XHRwYXJzZSh7IHR1cm5zOiBbeyBpZDogJ3QxJywgcmVzcG9uc2VQYXJ0czogdDFQYXJ0cyB9LCB7IGlkOiAndDInLCByZXNwb25zZVBhcnRzOiB0MlBhcnRzIH1dIH0pO1xuXHRcdC8vIDUpIEEgbmV3IHR1cm4gc3RhcnRzIHN0cmVhbWluZy5cblx0XHRwYXJzZSh7XG5cdFx0XHR0dXJuczogW3sgaWQ6ICd0MScsIHJlc3BvbnNlUGFydHM6IHQxUGFydHMgfSwgeyBpZDogJ3QyJywgcmVzcG9uc2VQYXJ0czogdDJQYXJ0cyB9XSxcblx0XHRcdGFjdGl2ZVR1cm46IHsgcmVzcG9uc2VQYXJ0czogYWN0aXZlM1BhcnRzIH0sXG5cdFx0fSk7XG5cblx0XHQvLyBDb21wbGV0ZWQgdHVybnMgYXJlIHBhcnNlZCBleGFjdGx5IG9uY2UgcmVnYXJkbGVzcyBvZiBob3cgbWFueSBkZWx0YXNcblx0XHQvLyBmb2xsb3dlZDsgZWFjaCBhY3RpdmUtdHVybiBzbmFwc2hvdCBpcyBwYXJzZWQgZXhhY3RseSBvbmNlLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHQxOiBwYXJzZUNvdW50cy5nZXQodDFQYXJ0cyksXG5cdFx0XHRcdHQyOiBwYXJzZUNvdW50cy5nZXQodDJQYXJ0cyksXG5cdFx0XHRcdGFjdGl2ZTE6IHBhcnNlQ291bnRzLmdldChhY3RpdmUxUGFydHMpLFxuXHRcdFx0XHRhY3RpdmUyOiBwYXJzZUNvdW50cy5nZXQoYWN0aXZlMlBhcnRzKSxcblx0XHRcdFx0YWN0aXZlMzogcGFyc2VDb3VudHMuZ2V0KGFjdGl2ZTNQYXJ0cyksXG5cdFx0XHR9LFxuXHRcdFx0eyB0MTogMSwgdDI6IDEsIGFjdGl2ZTE6IDEsIGFjdGl2ZTI6IDEsIGFjdGl2ZTM6IDEgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNyZW1lbnRhbCBwYXJzZXIga2VlcHMgY29tcGxldGVkLXR1cm4gZWRpdHMgd2hpbGUgYSBuZXcgdHVybiBzdHJlYW1zIGFuZCB0cmFja3MgdGhlIGxhc3QgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZSA9IGNyZWF0ZUluY3JlbWVudGFsQ2hhdEZpbGVFZGl0c1BhcnNlcigpO1xuXG5cdFx0Y29uc3QgdDFQYXJ0cyA9IFtjb21wbGV0ZWRUb29sQ2FsbFBhcnQoW2NyZWF0ZUVkaXQoJ2ZpbGU6Ly8vYS50eHQnKV0pXTtcblx0XHRjb25zdCBjb21wbGV0ZWQ6IElGaWxlRWRpdENoYXRTdGF0ZSA9IHsgdHVybnM6IFt7IGlkOiAndDEnLCByZXNwb25zZVBhcnRzOiB0MVBhcnRzIH1dIH07XG5cblx0XHRjb25zdCBmaXJzdCA9IHBhcnNlKGNvbXBsZXRlZCk7XG5cdFx0Y29uc3Qgc3RyZWFtaW5nID0gcGFyc2Uoe1xuXHRcdFx0dHVybnM6IFt7IGlkOiAndDEnLCByZXNwb25zZVBhcnRzOiB0MVBhcnRzIH1dLFxuXHRcdFx0YWN0aXZlVHVybjogeyByZXNwb25zZVBhcnRzOiBbY29tcGxldGVkVG9vbENhbGxQYXJ0KFtjcmVhdGVFZGl0KCdmaWxlOi8vL2IudHh0JyldKV0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGZpcnN0QWxsOiBmaXJzdC5hbGxFZGl0cy5tYXAoZSA9PiBlLmFmdGVyVXJpPy50b1N0cmluZygpKSxcblx0XHRcdFx0Zmlyc3RMYXN0VHVybjogZmlyc3QubGFzdFR1cm5FZGl0cy5tYXAoZSA9PiBlLmFmdGVyVXJpPy50b1N0cmluZygpKSxcblx0XHRcdFx0c3RyZWFtaW5nQWxsOiBzdHJlYW1pbmcuYWxsRWRpdHMubWFwKGUgPT4gZS5hZnRlclVyaT8udG9TdHJpbmcoKSksXG5cdFx0XHRcdHN0cmVhbWluZ0xhc3RUdXJuOiBzdHJlYW1pbmcubGFzdFR1cm5FZGl0cy5tYXAoZSA9PiBlLmFmdGVyVXJpPy50b1N0cmluZygpKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdC8vIFdoZW4gaWRsZSwgdGhlIGxhc3QgdHVybiBpcyB0aGUgbW9zdCByZWNlbnRseSBjb21wbGV0ZWQgdHVybi5cblx0XHRcdFx0Zmlyc3RBbGw6IFsnZmlsZTovLy9hLnR4dCddLFxuXHRcdFx0XHRmaXJzdExhc3RUdXJuOiBbJ2ZpbGU6Ly8vYS50eHQnXSxcblx0XHRcdFx0Ly8gV2hpbGUgc3RyZWFtaW5nLCBgYWxsRWRpdHNgIHVuaW9ucyBldmVyeSB0dXJuIGJ1dCBgbGFzdFR1cm5FZGl0c2Bcblx0XHRcdFx0Ly8gcmVmbGVjdHMgb25seSB0aGUgaW4tcHJvZ3Jlc3MgdHVybi5cblx0XHRcdFx0c3RyZWFtaW5nQWxsOiBbJ2ZpbGU6Ly8vYS50eHQnLCAnZmlsZTovLy9iLnR4dCddLFxuXHRcdFx0XHRzdHJlYW1pbmdMYXN0VHVybjogWydmaWxlOi8vL2IudHh0J10sXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlUmVzcG9uc2VQYXJ0cyBleHRyYWN0cyBlZGl0cyBmcm9tIGNvbXBsZXRlZCBhbmQgcGVuZGluZyB0b29sIGNhbGxzIGFuZCBpZ25vcmVzIG5vbi10b29sIHBhcnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnRzOiBSZXNwb25zZVBhcnRbXSA9IFtcblx0XHRcdG1hcmtkb3duUGFydCgnaGVsbG8nKSxcblx0XHRcdGNvbXBsZXRlZFRvb2xDYWxsUGFydChbY3JlYXRlRWRpdCgnZmlsZTovLy9jcmVhdGVkLnR4dCcpLCBlZGl0RWRpdCgnZmlsZTovLy9lZGl0ZWQudHh0JyldKSxcblx0XHRcdHBlbmRpbmdDb25maXJtYXRpb25Ub29sQ2FsbFBhcnQoW2RlbGV0ZUVkaXQoJ2ZpbGU6Ly8vZGVsZXRlZC50eHQnKV0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVJlc3BvbnNlUGFydHMocGFydHMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBhcnNlZC5tYXAoZSA9PiAoeyBraW5kOiBlLmtpbmQsIHVyaTogKGUuYWZ0ZXJVcmkgPz8gZS5iZWZvcmVVcmkpPy50b1N0cmluZygpIH0pKSxcblx0XHRcdFtcblx0XHRcdFx0eyBraW5kOiBGaWxlRWRpdEtpbmQuQ3JlYXRlLCB1cmk6ICdmaWxlOi8vL2NyZWF0ZWQudHh0JyB9LFxuXHRcdFx0XHR7IGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LCB1cmk6ICdmaWxlOi8vL2VkaXRlZC50eHQnIH0sXG5cdFx0XHRcdHsga2luZDogRmlsZUVkaXRLaW5kLkRlbGV0ZSwgdXJpOiAnZmlsZTovLy9kZWxldGVkLnR4dCcgfSxcblx0XHRcdF0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVkdWNlU2Vzc2lvbkZpbGVzIGNsYXNzaWZpZXMgb3BlcmF0aW9ucyBhbmQgZmlsdGVycyB3b3Jrc3BhY2UgZmlsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdHM6IElQYXJzZWRGaWxlRWRpdFtdID0gW1xuXHRcdFx0Ly8gY3JlYXRlZC10aGVuLWVkaXRlZCBvdXRzaWRlIHdvcmtzcGFjZSBcdTIxOTIgQ3JlYXRlZFxuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuQ3JlYXRlLCB7IGFmdGVyOiAnL2hvbWUvdXNlci8uY29uZmlnL2FwcC5qc29uJyB9KSxcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvaG9tZS91c2VyLy5jb25maWcvYXBwLmpzb24nLCBiZWZvcmVDb250ZW50OiAnL2hvbWUvdXNlci8uY29uZmlnL2FwcC5qc29uLmJlZm9yZScgfSksXG5cdFx0XHQvLyBlZGl0ZWQgb3V0c2lkZSB3b3Jrc3BhY2UgXHUyMTkyIE1vZGlmaWVkIChrZWVwcyBvcmlnaW5hbCBmb3IgZGlmZilcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvaG9tZS91c2VyLy5iYXNocmMnLCBiZWZvcmVDb250ZW50OiAnL2hvbWUvdXNlci8uYmFzaHJjLmJlZm9yZScgfSksXG5cdFx0XHQvLyBkZWxldGVkIG91dHNpZGUgd29ya3NwYWNlIFx1MjE5MiByZW1vdmVkIGZyb20gdGhlIGxpc3QgZW50aXJlbHlcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkRlbGV0ZSwgeyBiZWZvcmU6ICcvdG1wL3NjcmF0Y2gubG9nJywgYmVmb3JlQ29udGVudDogJy90bXAvc2NyYXRjaC5sb2cuYmVmb3JlJyB9KSxcblx0XHRcdC8vIGluc2lkZSB3b3Jrc3BhY2UgXHUyMTkyIGV4Y2x1ZGVkXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5DcmVhdGUsIHsgYWZ0ZXI6ICcvcmVwby9zcmMvaW5kZXgudHMnIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBmaWxlcyA9IHJlZHVjZVNlc3Npb25GaWxlcyhlZGl0cywgW1VSSS5maWxlKCcvcmVwbycpXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0ZmlsZXMubWFwKGYgPT4gKHsgdXJpOiBmLnVyaS5wYXRoLCBvcGVyYXRpb246IGYub3BlcmF0aW9uLCBvcmlnaW5hbDogZi5vcmlnaW5hbFVyaT8ucGF0aCB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgdXJpOiAnL2hvbWUvdXNlci8uYmFzaHJjJywgb3BlcmF0aW9uOiBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCwgb3JpZ2luYWw6ICcvaG9tZS91c2VyLy5iYXNocmMuYmVmb3JlJyB9LFxuXHRcdFx0XHR7IHVyaTogJy9ob21lL3VzZXIvLmNvbmZpZy9hcHAuanNvbicsIG9wZXJhdGlvbjogU2Vzc2lvbkZpbGVPcGVyYXRpb24uQ3JlYXRlZCwgb3JpZ2luYWw6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWR1Y2VTZXNzaW9uRmlsZXMgcmVwb3J0cyBhIHJlbmFtZSBhcyBhIGNyZWF0ZSBvZiB0aGUgdGFyZ2V0IGFuZCBkcm9wcyB0aGUgc291cmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRzOiBJUGFyc2VkRmlsZUVkaXRbXSA9IFtcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLlJlbmFtZSwgeyBiZWZvcmU6ICcvaG9tZS91c2VyL29sZC50eHQnLCBhZnRlcjogJy9ob21lL3VzZXIvbmV3LnR4dCcsIGJlZm9yZUNvbnRlbnQ6ICcvaG9tZS91c2VyL29sZC50eHQuYmVmb3JlJyB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZmlsZXMgPSByZWR1Y2VTZXNzaW9uRmlsZXMoZWRpdHMsIFtVUkkuZmlsZSgnL3JlcG8nKV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGZpbGVzLm1hcChmID0+ICh7IHVyaTogZi51cmkucGF0aCwgb3BlcmF0aW9uOiBmLm9wZXJhdGlvbiB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgdXJpOiAnL2hvbWUvdXNlci9uZXcudHh0Jywgb3BlcmF0aW9uOiBTZXNzaW9uRmlsZU9wZXJhdGlvbi5DcmVhdGVkIH0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZHVjZVNlc3Npb25GaWxlcyBkcm9wcyBhIGZpbGUgdGhhdCBpcyBjcmVhdGVkIGFuZCB0aGVuIGRlbGV0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdHM6IElQYXJzZWRGaWxlRWRpdFtdID0gW1xuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuQ3JlYXRlLCB7IGFmdGVyOiAnL2hvbWUvdXNlci9zY3JhdGNoLnRtcCcgfSksXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5EZWxldGUsIHsgYmVmb3JlOiAnL2hvbWUvdXNlci9zY3JhdGNoLnRtcCcgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGZpbGVzID0gcmVkdWNlU2Vzc2lvbkZpbGVzKGVkaXRzLCBbVVJJLmZpbGUoJy9yZXBvJyldKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlsZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVkdWNlVHVybkNoYW5nZXMgY29sbGFwc2VzIHJlcGVhdGVkIGVkaXRzIHBlciBmaWxlIGFuZCBhZ2dyZWdhdGVzIGRpZmYgc3RhdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdHM6IElQYXJzZWRGaWxlRWRpdFtdID0gW1xuXHRcdFx0Ly8gY3JlYXRlZCB0aGVuIGVkaXRlZCBcdTIxOTIgb25lIGNyZWF0ZWQgY2hhbmdlLCBzdW1tZWQgZGlmZnMsIG5vIG9yaWdpbmFsIHNpZGVcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkNyZWF0ZSwgeyBhZnRlcjogJy9yZXBvL25ldy50cycgfSwgeyBpbnNlcnRpb25zOiAxMCB9KSxcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvcmVwby9uZXcudHMnLCBiZWZvcmVDb250ZW50OiAnL3JlcG8vbmV3LnRzLmJlZm9yZScgfSwgeyBpbnNlcnRpb25zOiAzLCBkZWxldGlvbnM6IDEgfSksXG5cdFx0XHQvLyBwcmUtZXhpc3RpbmcgZmlsZSBlZGl0ZWQgdHdpY2UgXHUyMTkyIG9uZSBtb2RpZmllZCBjaGFuZ2Uga2VlcGluZyB0aGUgZmlyc3Qgb3JpZ2luYWxcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvcmVwby9leGlzdGluZy50cycsIGJlZm9yZUNvbnRlbnQ6ICcvcmVwby9leGlzdGluZy50cy5iZWZvcmUnIH0sIHsgaW5zZXJ0aW9uczogMiwgZGVsZXRpb25zOiA0IH0pLFxuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuRWRpdCwgeyBhZnRlcjogJy9yZXBvL2V4aXN0aW5nLnRzJywgYmVmb3JlQ29udGVudDogJy9yZXBvL2V4aXN0aW5nLnRzLmJlZm9yZTInIH0sIHsgaW5zZXJ0aW9uczogMSB9KSxcblx0XHRcdC8vIHByZS1leGlzdGluZyBmaWxlIGRlbGV0ZWQgXHUyMTkyIHN1cmZhY2VkIGFzIGEgZGVsZXRpb24gKG5vIG1vZGlmaWVkIHNpZGUpXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5EZWxldGUsIHsgYmVmb3JlOiAnL3JlcG8vZ29uZS50cycsIGJlZm9yZUNvbnRlbnQ6ICcvcmVwby9nb25lLnRzLmJlZm9yZScgfSwgeyBkZWxldGlvbnM6IDggfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGNoYW5nZXMgPSByZWR1Y2VUdXJuQ2hhbmdlcyhlZGl0cykubWFwKGMgPT4gKHtcblx0XHRcdHVyaTogYy51cmkucGF0aCxcblx0XHRcdG1vZGlmaWVkOiBjLm1vZGlmaWVkVXJpPy5wYXRoLFxuXHRcdFx0b3JpZ2luYWw6IGMub3JpZ2luYWxVcmk/LnBhdGgsXG5cdFx0XHRpbnNlcnRpb25zOiBjLmluc2VydGlvbnMsXG5cdFx0XHRkZWxldGlvbnM6IGMuZGVsZXRpb25zLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlcywgW1xuXHRcdFx0eyB1cmk6ICcvcmVwby9uZXcudHMnLCBtb2RpZmllZDogJy9yZXBvL25ldy50cycsIG9yaWdpbmFsOiB1bmRlZmluZWQsIGluc2VydGlvbnM6IDEzLCBkZWxldGlvbnM6IDEgfSxcblx0XHRcdHsgdXJpOiAnL3JlcG8vZXhpc3RpbmcudHMnLCBtb2RpZmllZDogJy9yZXBvL2V4aXN0aW5nLnRzJywgb3JpZ2luYWw6ICcvcmVwby9leGlzdGluZy50cy5iZWZvcmUnLCBpbnNlcnRpb25zOiAzLCBkZWxldGlvbnM6IDQgfSxcblx0XHRcdHsgdXJpOiAnL3JlcG8vZ29uZS50cycsIG1vZGlmaWVkOiB1bmRlZmluZWQsIG9yaWdpbmFsOiAnL3JlcG8vZ29uZS50cy5iZWZvcmUnLCBpbnNlcnRpb25zOiAwLCBkZWxldGlvbnM6IDggfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVkdWNlVHVybkNoYW5nZXMgZmlsdGVycyBmaWxlcyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgYW5kIHdvcmt0cmVlIHJvb3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRzOiBJUGFyc2VkRmlsZUVkaXRbXSA9IFtcblx0XHRcdHBhcnNlZEVkaXQoRmlsZUVkaXRLaW5kLkVkaXQsIHsgYWZ0ZXI6ICcvcmVwby9zcmMvYXBwLnRzJywgYmVmb3JlQ29udGVudDogJy9yZXBvL3NyYy9hcHAudHMuYmVmb3JlJyB9LCB7IGluc2VydGlvbnM6IDIgfSksXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5DcmVhdGUsIHsgYWZ0ZXI6ICcvdG1wL3Nlc3Npb24td29ya3RyZWUvUkVBRE1FLm1kJyB9LCB7IGluc2VydGlvbnM6IDUgfSksXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5FZGl0LCB7IGFmdGVyOiAnL2hvbWUvdXNlci8uY29uZmlnL3Rvb2wuanNvbicsIGJlZm9yZUNvbnRlbnQ6ICcvaG9tZS91c2VyLy5jb25maWcvdG9vbC5qc29uLmJlZm9yZScgfSwgeyBpbnNlcnRpb25zOiAxMCwgZGVsZXRpb25zOiAxIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBjaGFuZ2VzID0gcmVkdWNlVHVybkNoYW5nZXMoZWRpdHMsIFtVUkkuZmlsZSgnL3JlcG8nKSwgVVJJLmZpbGUoJy90bXAvc2Vzc2lvbi13b3JrdHJlZScpXSkubWFwKGMgPT4gKHtcblx0XHRcdHVyaTogYy51cmkucGF0aCxcblx0XHRcdG1vZGlmaWVkOiBjLm1vZGlmaWVkVXJpPy5wYXRoLFxuXHRcdFx0b3JpZ2luYWw6IGMub3JpZ2luYWxVcmk/LnBhdGgsXG5cdFx0XHRpbnNlcnRpb25zOiBjLmluc2VydGlvbnMsXG5cdFx0XHRkZWxldGlvbnM6IGMuZGVsZXRpb25zLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlcywgW1xuXHRcdFx0eyB1cmk6ICcvcmVwby9zcmMvYXBwLnRzJywgbW9kaWZpZWQ6ICcvcmVwby9zcmMvYXBwLnRzJywgb3JpZ2luYWw6ICcvcmVwby9zcmMvYXBwLnRzLmJlZm9yZScsIGluc2VydGlvbnM6IDIsIGRlbGV0aW9uczogMCB9LFxuXHRcdFx0eyB1cmk6ICcvdG1wL3Nlc3Npb24td29ya3RyZWUvUkVBRE1FLm1kJywgbW9kaWZpZWQ6ICcvdG1wL3Nlc3Npb24td29ya3RyZWUvUkVBRE1FLm1kJywgb3JpZ2luYWw6IHVuZGVmaW5lZCwgaW5zZXJ0aW9uczogNSwgZGVsZXRpb25zOiAwIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZHVjZVR1cm5DaGFuZ2VzIG5ldHMgb3V0IGEgZmlsZSBjcmVhdGVkIGFuZCB0aGVuIGRlbGV0ZWQgaW4gdGhlIHNhbWUgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBlZGl0czogSVBhcnNlZEZpbGVFZGl0W10gPSBbXG5cdFx0XHRwYXJzZWRFZGl0KEZpbGVFZGl0S2luZC5DcmVhdGUsIHsgYWZ0ZXI6ICcvcmVwby9zY3JhdGNoLnRtcCcgfSwgeyBpbnNlcnRpb25zOiA1IH0pLFxuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuRGVsZXRlLCB7IGJlZm9yZTogJy9yZXBvL3NjcmF0Y2gudG1wJyB9KSxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWR1Y2VUdXJuQ2hhbmdlcyhlZGl0cyksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVkdWNlVHVybkNoYW5nZXMgcmVwb3J0cyBhIHJlbmFtZSBhcyBhbiBlZGl0IG9mIHRoZSB0YXJnZXQgYW5kIGRyb3BzIHRoZSBzb3VyY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdHM6IElQYXJzZWRGaWxlRWRpdFtdID0gW1xuXHRcdFx0cGFyc2VkRWRpdChGaWxlRWRpdEtpbmQuUmVuYW1lLCB7IGJlZm9yZTogJy9yZXBvL29sZC50cycsIGFmdGVyOiAnL3JlcG8vcmVuYW1lZC50cycsIGJlZm9yZUNvbnRlbnQ6ICcvcmVwby9vbGQudHMuYmVmb3JlJyB9LCB7IGluc2VydGlvbnM6IDEsIGRlbGV0aW9uczogMiB9KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgY2hhbmdlcyA9IHJlZHVjZVR1cm5DaGFuZ2VzKGVkaXRzKS5tYXAoYyA9PiAoe1xuXHRcdFx0dXJpOiBjLnVyaS5wYXRoLFxuXHRcdFx0bW9kaWZpZWQ6IGMubW9kaWZpZWRVcmk/LnBhdGgsXG5cdFx0XHRvcmlnaW5hbDogYy5vcmlnaW5hbFVyaT8ucGF0aCxcblx0XHRcdGluc2VydGlvbnM6IGMuaW5zZXJ0aW9ucyxcblx0XHRcdGRlbGV0aW9uczogYy5kZWxldGlvbnMsXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzLCBbXG5cdFx0XHR7IHVyaTogJy9yZXBvL3JlbmFtZWQudHMnLCBtb2RpZmllZDogJy9yZXBvL3JlbmFtZWQudHMnLCBvcmlnaW5hbDogJy9yZXBvL29sZC50cy5iZWZvcmUnLCBpbnNlcnRpb25zOiAxLCBkZWxldGlvbnM6IDIgfSxcblx0XHRdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BRU07QUFDUCxTQUFTLDRCQUE0QjtBQUNyQztBQUFBLEVBQ0M7QUFBQSxFQUdBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBSVAsSUFBSSxNQUFNO0FBRVYsU0FBUyxhQUFhLFVBQWdDO0FBQ3JELFNBQU8sRUFBRSxNQUFNLGlCQUFpQixVQUFVLFNBQVM7QUFDcEQ7QUFFQSxTQUFTLGFBQWEsU0FBK0I7QUFDcEQsU0FBTyxFQUFFLE1BQU0saUJBQWlCLFVBQVUsSUFBSSxNQUFNLEtBQUssSUFBSSxRQUFRO0FBQ3RFO0FBR0EsU0FBUyxzQkFBc0IsU0FBaUM7QUFDL0QsU0FBTyxhQUFhO0FBQUEsSUFDbkIsUUFBUSxlQUFlO0FBQUEsSUFDdkIsWUFBWSxNQUFNLEtBQUs7QUFBQSxJQUN2QixVQUFVO0FBQUEsSUFDVixhQUFhO0FBQUEsSUFDYixtQkFBbUI7QUFBQSxJQUNuQixXQUFXLDJCQUEyQjtBQUFBLElBQ3RDLFNBQVM7QUFBQSxJQUNULGtCQUFrQjtBQUFBLElBQ2xCO0FBQUEsRUFDRCxDQUFDO0FBQ0Y7QUFHQSxTQUFTLGdDQUFnQyxPQUErQjtBQUN2RSxTQUFPLGFBQWE7QUFBQSxJQUNuQixRQUFRLGVBQWU7QUFBQSxJQUN2QixZQUFZLE1BQU0sS0FBSztBQUFBLElBQ3ZCLFVBQVU7QUFBQSxJQUNWLGFBQWE7QUFBQSxJQUNiLG1CQUFtQjtBQUFBLElBQ25CLE9BQU8sRUFBRSxNQUFNO0FBQUEsRUFDaEIsQ0FBQztBQUNGO0FBRUEsU0FBUyxXQUFXLEtBQWEsTUFBcUQ7QUFDckYsU0FBTyxFQUFFLE1BQU0sc0JBQXNCLFVBQVUsT0FBTyxFQUFFLEtBQUssU0FBUyxFQUFFLEtBQUssR0FBRyxHQUFHLFNBQVMsRUFBRSxHQUFHLEtBQUs7QUFDdkc7QUFFQSxTQUFTLFNBQVMsS0FBYSxNQUFxRDtBQUNuRixTQUFPO0FBQUEsSUFDTixNQUFNLHNCQUFzQjtBQUFBLElBQzVCLFFBQVEsRUFBRSxLQUFLLFNBQVMsRUFBRSxLQUFLLEdBQUcsR0FBRyxVQUFVLEVBQUU7QUFBQSxJQUNqRCxPQUFPLEVBQUUsS0FBSyxTQUFTLEVBQUUsS0FBSyxHQUFHLEdBQUcsU0FBUyxFQUFFO0FBQUEsSUFDL0M7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLFdBQVcsS0FBYSxNQUFxRDtBQUNyRixTQUFPLEVBQUUsTUFBTSxzQkFBc0IsVUFBVSxRQUFRLEVBQUUsS0FBSyxTQUFTLEVBQUUsS0FBSyxHQUFHLEdBQUcsVUFBVSxFQUFFLEdBQUcsS0FBSztBQUN6RztBQUVBLFNBQVMsV0FBVyxNQUFvQixNQUFtRSxNQUFxRTtBQUMvSyxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0EsVUFBVSxLQUFLLFFBQVEsSUFBSSxLQUFLLEtBQUssS0FBSyxJQUFJO0FBQUEsSUFDOUMsV0FBVyxLQUFLLFNBQVMsSUFBSSxLQUFLLEtBQUssTUFBTSxJQUFJO0FBQUEsSUFDakQsa0JBQWtCLEtBQUssZ0JBQWdCLElBQUksS0FBSyxLQUFLLGFBQWEsSUFBSTtBQUFBLElBQ3RFLFlBQVksTUFBTSxjQUFjO0FBQUEsSUFDaEMsV0FBVyxNQUFNLGFBQWE7QUFBQSxFQUMvQjtBQUNEO0FBSUEsTUFBTSx5QkFBeUIsTUFBTTtBQUVwQywwQ0FBd0M7QUFFeEMsT0FBSyx5RkFBeUYsTUFBTTtBQUVuRyxVQUFNLGNBQWMsb0JBQUksSUFBNEI7QUFDcEQsVUFBTSxvQkFBb0IsQ0FBQyxVQUFzRDtBQUNoRixrQkFBWSxJQUFJLFFBQVEsWUFBWSxJQUFJLEtBQUssS0FBSyxLQUFLLENBQUM7QUFDeEQsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sUUFBUSxxQ0FBcUMsUUFBVyxpQkFBaUI7QUFHL0UsVUFBTSxVQUEwQixDQUFDO0FBQ2pDLFVBQU0sVUFBMEIsQ0FBQztBQUNqQyxVQUFNLGVBQStCLENBQUM7QUFDdEMsVUFBTSxlQUErQixDQUFDO0FBQ3RDLFVBQU0sZUFBK0IsQ0FBQztBQUd0QyxVQUFNLEVBQUUsT0FBTyxDQUFDLEVBQUUsSUFBSSxNQUFNLGVBQWUsUUFBUSxDQUFDLEVBQUUsQ0FBQztBQUV2RCxVQUFNLEVBQUUsT0FBTyxDQUFDLEVBQUUsSUFBSSxNQUFNLGVBQWUsUUFBUSxDQUFDLEdBQUcsWUFBWSxFQUFFLGVBQWUsYUFBYSxFQUFFLENBQUM7QUFFcEcsVUFBTSxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksTUFBTSxlQUFlLFFBQVEsQ0FBQyxHQUFHLFlBQVksRUFBRSxlQUFlLGFBQWEsRUFBRSxDQUFDO0FBRXBHLFVBQU0sRUFBRSxPQUFPLENBQUMsRUFBRSxJQUFJLE1BQU0sZUFBZSxRQUFRLEdBQUcsRUFBRSxJQUFJLE1BQU0sZUFBZSxRQUFRLENBQUMsRUFBRSxDQUFDO0FBRTdGLFVBQU07QUFBQSxNQUNMLE9BQU8sQ0FBQyxFQUFFLElBQUksTUFBTSxlQUFlLFFBQVEsR0FBRyxFQUFFLElBQUksTUFBTSxlQUFlLFFBQVEsQ0FBQztBQUFBLE1BQ2xGLFlBQVksRUFBRSxlQUFlLGFBQWE7QUFBQSxJQUMzQyxDQUFDO0FBSUQsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLElBQUksWUFBWSxJQUFJLE9BQU87QUFBQSxRQUMzQixJQUFJLFlBQVksSUFBSSxPQUFPO0FBQUEsUUFDM0IsU0FBUyxZQUFZLElBQUksWUFBWTtBQUFBLFFBQ3JDLFNBQVMsWUFBWSxJQUFJLFlBQVk7QUFBQSxRQUNyQyxTQUFTLFlBQVksSUFBSSxZQUFZO0FBQUEsTUFDdEM7QUFBQSxNQUNBLEVBQUUsSUFBSSxHQUFHLElBQUksR0FBRyxTQUFTLEdBQUcsU0FBUyxHQUFHLFNBQVMsRUFBRTtBQUFBLElBQ3BEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtR0FBbUcsTUFBTTtBQUM3RyxVQUFNLFFBQVEscUNBQXFDO0FBRW5ELFVBQU0sVUFBVSxDQUFDLHNCQUFzQixDQUFDLFdBQVcsZUFBZSxDQUFDLENBQUMsQ0FBQztBQUNyRSxVQUFNLFlBQWdDLEVBQUUsT0FBTyxDQUFDLEVBQUUsSUFBSSxNQUFNLGVBQWUsUUFBUSxDQUFDLEVBQUU7QUFFdEYsVUFBTSxRQUFRLE1BQU0sU0FBUztBQUM3QixVQUFNLFlBQVksTUFBTTtBQUFBLE1BQ3ZCLE9BQU8sQ0FBQyxFQUFFLElBQUksTUFBTSxlQUFlLFFBQVEsQ0FBQztBQUFBLE1BQzVDLFlBQVksRUFBRSxlQUFlLENBQUMsc0JBQXNCLENBQUMsV0FBVyxlQUFlLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFBQSxJQUNyRixDQUFDO0FBRUQsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLFVBQVUsTUFBTSxTQUFTLElBQUksT0FBSyxFQUFFLFVBQVUsU0FBUyxDQUFDO0FBQUEsUUFDeEQsZUFBZSxNQUFNLGNBQWMsSUFBSSxPQUFLLEVBQUUsVUFBVSxTQUFTLENBQUM7QUFBQSxRQUNsRSxjQUFjLFVBQVUsU0FBUyxJQUFJLE9BQUssRUFBRSxVQUFVLFNBQVMsQ0FBQztBQUFBLFFBQ2hFLG1CQUFtQixVQUFVLGNBQWMsSUFBSSxPQUFLLEVBQUUsVUFBVSxTQUFTLENBQUM7QUFBQSxNQUMzRTtBQUFBLE1BQ0E7QUFBQTtBQUFBLFFBRUMsVUFBVSxDQUFDLGVBQWU7QUFBQSxRQUMxQixlQUFlLENBQUMsZUFBZTtBQUFBO0FBQUE7QUFBQSxRQUcvQixjQUFjLENBQUMsaUJBQWlCLGVBQWU7QUFBQSxRQUMvQyxtQkFBbUIsQ0FBQyxlQUFlO0FBQUEsTUFDcEM7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzR0FBc0csTUFBTTtBQUNoSCxVQUFNLFFBQXdCO0FBQUEsTUFDN0IsYUFBYSxPQUFPO0FBQUEsTUFDcEIsc0JBQXNCLENBQUMsV0FBVyxxQkFBcUIsR0FBRyxTQUFTLG9CQUFvQixDQUFDLENBQUM7QUFBQSxNQUN6RixnQ0FBZ0MsQ0FBQyxXQUFXLHFCQUFxQixDQUFDLENBQUM7QUFBQSxJQUNwRTtBQUVBLFVBQU0sU0FBUyxtQkFBbUIsS0FBSztBQUV2QyxXQUFPO0FBQUEsTUFDTixPQUFPLElBQUksUUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLE1BQU0sRUFBRSxZQUFZLEVBQUUsWUFBWSxTQUFTLEVBQUUsRUFBRTtBQUFBLE1BQ2hGO0FBQUEsUUFDQyxFQUFFLE1BQU0sYUFBYSxRQUFRLEtBQUssc0JBQXNCO0FBQUEsUUFDeEQsRUFBRSxNQUFNLGFBQWEsTUFBTSxLQUFLLHFCQUFxQjtBQUFBLFFBQ3JELEVBQUUsTUFBTSxhQUFhLFFBQVEsS0FBSyxzQkFBc0I7QUFBQSxNQUN6RDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLFVBQU0sUUFBMkI7QUFBQTtBQUFBLE1BRWhDLFdBQVcsYUFBYSxRQUFRLEVBQUUsT0FBTyw4QkFBOEIsQ0FBQztBQUFBLE1BQ3hFLFdBQVcsYUFBYSxNQUFNLEVBQUUsT0FBTywrQkFBK0IsZUFBZSxxQ0FBcUMsQ0FBQztBQUFBO0FBQUEsTUFFM0gsV0FBVyxhQUFhLE1BQU0sRUFBRSxPQUFPLHNCQUFzQixlQUFlLDRCQUE0QixDQUFDO0FBQUE7QUFBQSxNQUV6RyxXQUFXLGFBQWEsUUFBUSxFQUFFLFFBQVEsb0JBQW9CLGVBQWUsMEJBQTBCLENBQUM7QUFBQTtBQUFBLE1BRXhHLFdBQVcsYUFBYSxRQUFRLEVBQUUsT0FBTyxxQkFBcUIsQ0FBQztBQUFBLElBQ2hFO0FBRUEsVUFBTSxRQUFRLG1CQUFtQixPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBRTNELFdBQU87QUFBQSxNQUNOLE1BQU0sSUFBSSxRQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksTUFBTSxXQUFXLEVBQUUsV0FBVyxVQUFVLEVBQUUsYUFBYSxLQUFLLEVBQUU7QUFBQSxNQUMzRjtBQUFBLFFBQ0MsRUFBRSxLQUFLLHNCQUFzQixXQUFXLHFCQUFxQixVQUFVLFVBQVUsNEJBQTRCO0FBQUEsUUFDN0csRUFBRSxLQUFLLCtCQUErQixXQUFXLHFCQUFxQixTQUFTLFVBQVUsT0FBVTtBQUFBLE1BQ3BHO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0ZBQXNGLE1BQU07QUFDaEcsVUFBTSxRQUEyQjtBQUFBLE1BQ2hDLFdBQVcsYUFBYSxRQUFRLEVBQUUsUUFBUSxzQkFBc0IsT0FBTyxzQkFBc0IsZUFBZSw0QkFBNEIsQ0FBQztBQUFBLElBQzFJO0FBRUEsVUFBTSxRQUFRLG1CQUFtQixPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBRTNELFdBQU87QUFBQSxNQUNOLE1BQU0sSUFBSSxRQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksTUFBTSxXQUFXLEVBQUUsVUFBVSxFQUFFO0FBQUEsTUFDNUQ7QUFBQSxRQUNDLEVBQUUsS0FBSyxzQkFBc0IsV0FBVyxxQkFBcUIsUUFBUTtBQUFBLE1BQ3RFO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0VBQW9FLE1BQU07QUFDOUUsVUFBTSxRQUEyQjtBQUFBLE1BQ2hDLFdBQVcsYUFBYSxRQUFRLEVBQUUsT0FBTyx5QkFBeUIsQ0FBQztBQUFBLE1BQ25FLFdBQVcsYUFBYSxRQUFRLEVBQUUsUUFBUSx5QkFBeUIsQ0FBQztBQUFBLElBQ3JFO0FBRUEsVUFBTSxRQUFRLG1CQUFtQixPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBRTNELFdBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDakMsQ0FBQztBQUVELE9BQUssaUZBQWlGLE1BQU07QUFDM0YsVUFBTSxRQUEyQjtBQUFBO0FBQUEsTUFFaEMsV0FBVyxhQUFhLFFBQVEsRUFBRSxPQUFPLGVBQWUsR0FBRyxFQUFFLFlBQVksR0FBRyxDQUFDO0FBQUEsTUFDN0UsV0FBVyxhQUFhLE1BQU0sRUFBRSxPQUFPLGdCQUFnQixlQUFlLHNCQUFzQixHQUFHLEVBQUUsWUFBWSxHQUFHLFdBQVcsRUFBRSxDQUFDO0FBQUE7QUFBQSxNQUU5SCxXQUFXLGFBQWEsTUFBTSxFQUFFLE9BQU8scUJBQXFCLGVBQWUsMkJBQTJCLEdBQUcsRUFBRSxZQUFZLEdBQUcsV0FBVyxFQUFFLENBQUM7QUFBQSxNQUN4SSxXQUFXLGFBQWEsTUFBTSxFQUFFLE9BQU8scUJBQXFCLGVBQWUsNEJBQTRCLEdBQUcsRUFBRSxZQUFZLEVBQUUsQ0FBQztBQUFBO0FBQUEsTUFFM0gsV0FBVyxhQUFhLFFBQVEsRUFBRSxRQUFRLGlCQUFpQixlQUFlLHVCQUF1QixHQUFHLEVBQUUsV0FBVyxFQUFFLENBQUM7QUFBQSxJQUNySDtBQUVBLFVBQU0sVUFBVSxrQkFBa0IsS0FBSyxFQUFFLElBQUksUUFBTTtBQUFBLE1BQ2xELEtBQUssRUFBRSxJQUFJO0FBQUEsTUFDWCxVQUFVLEVBQUUsYUFBYTtBQUFBLE1BQ3pCLFVBQVUsRUFBRSxhQUFhO0FBQUEsTUFDekIsWUFBWSxFQUFFO0FBQUEsTUFDZCxXQUFXLEVBQUU7QUFBQSxJQUNkLEVBQUU7QUFFRixXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0IsRUFBRSxLQUFLLGdCQUFnQixVQUFVLGdCQUFnQixVQUFVLFFBQVcsWUFBWSxJQUFJLFdBQVcsRUFBRTtBQUFBLE1BQ25HLEVBQUUsS0FBSyxxQkFBcUIsVUFBVSxxQkFBcUIsVUFBVSw0QkFBNEIsWUFBWSxHQUFHLFdBQVcsRUFBRTtBQUFBLE1BQzdILEVBQUUsS0FBSyxpQkFBaUIsVUFBVSxRQUFXLFVBQVUsd0JBQXdCLFlBQVksR0FBRyxXQUFXLEVBQUU7QUFBQSxJQUM1RyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw0RUFBNEUsTUFBTTtBQUN0RixVQUFNLFFBQTJCO0FBQUEsTUFDaEMsV0FBVyxhQUFhLE1BQU0sRUFBRSxPQUFPLG9CQUFvQixlQUFlLDBCQUEwQixHQUFHLEVBQUUsWUFBWSxFQUFFLENBQUM7QUFBQSxNQUN4SCxXQUFXLGFBQWEsUUFBUSxFQUFFLE9BQU8sa0NBQWtDLEdBQUcsRUFBRSxZQUFZLEVBQUUsQ0FBQztBQUFBLE1BQy9GLFdBQVcsYUFBYSxNQUFNLEVBQUUsT0FBTyxnQ0FBZ0MsZUFBZSxzQ0FBc0MsR0FBRyxFQUFFLFlBQVksSUFBSSxXQUFXLEVBQUUsQ0FBQztBQUFBLElBQ2hLO0FBRUEsVUFBTSxVQUFVLGtCQUFrQixPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sR0FBRyxJQUFJLEtBQUssdUJBQXVCLENBQUMsQ0FBQyxFQUFFLElBQUksUUFBTTtBQUFBLE1BQzFHLEtBQUssRUFBRSxJQUFJO0FBQUEsTUFDWCxVQUFVLEVBQUUsYUFBYTtBQUFBLE1BQ3pCLFVBQVUsRUFBRSxhQUFhO0FBQUEsTUFDekIsWUFBWSxFQUFFO0FBQUEsTUFDZCxXQUFXLEVBQUU7QUFBQSxJQUNkLEVBQUU7QUFFRixXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0IsRUFBRSxLQUFLLG9CQUFvQixVQUFVLG9CQUFvQixVQUFVLDJCQUEyQixZQUFZLEdBQUcsV0FBVyxFQUFFO0FBQUEsTUFDMUgsRUFBRSxLQUFLLG1DQUFtQyxVQUFVLG1DQUFtQyxVQUFVLFFBQVcsWUFBWSxHQUFHLFdBQVcsRUFBRTtBQUFBLElBQ3pJLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtFQUErRSxNQUFNO0FBQ3pGLFVBQU0sUUFBMkI7QUFBQSxNQUNoQyxXQUFXLGFBQWEsUUFBUSxFQUFFLE9BQU8sb0JBQW9CLEdBQUcsRUFBRSxZQUFZLEVBQUUsQ0FBQztBQUFBLE1BQ2pGLFdBQVcsYUFBYSxRQUFRLEVBQUUsUUFBUSxvQkFBb0IsQ0FBQztBQUFBLElBQ2hFO0FBRUEsV0FBTyxnQkFBZ0Isa0JBQWtCLEtBQUssR0FBRyxDQUFDLENBQUM7QUFBQSxFQUNwRCxDQUFDO0FBRUQsT0FBSyxvRkFBb0YsTUFBTTtBQUM5RixVQUFNLFFBQTJCO0FBQUEsTUFDaEMsV0FBVyxhQUFhLFFBQVEsRUFBRSxRQUFRLGdCQUFnQixPQUFPLG9CQUFvQixlQUFlLHNCQUFzQixHQUFHLEVBQUUsWUFBWSxHQUFHLFdBQVcsRUFBRSxDQUFDO0FBQUEsSUFDN0o7QUFFQSxVQUFNLFVBQVUsa0JBQWtCLEtBQUssRUFBRSxJQUFJLFFBQU07QUFBQSxNQUNsRCxLQUFLLEVBQUUsSUFBSTtBQUFBLE1BQ1gsVUFBVSxFQUFFLGFBQWE7QUFBQSxNQUN6QixVQUFVLEVBQUUsYUFBYTtBQUFBLE1BQ3pCLFlBQVksRUFBRTtBQUFBLE1BQ2QsV0FBVyxFQUFFO0FBQUEsSUFDZCxFQUFFO0FBRUYsV0FBTyxnQkFBZ0IsU0FBUztBQUFBLE1BQy9CLEVBQUUsS0FBSyxvQkFBb0IsVUFBVSxvQkFBb0IsVUFBVSx1QkFBdUIsWUFBWSxHQUFHLFdBQVcsRUFBRTtBQUFBLElBQ3ZILENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
