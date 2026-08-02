import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileEditKind } from "../../common/state/sessionState.js";
import { encodeString, TestDiffComputeService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
import { computeSessionDiffs, computeUnionedDiffs } from "../../node/sessionDiffAggregator.js";
import { parseSessionDbUri } from "../../common/sessionDbUri.js";
const TEST_SESSION_URI = "session://test-session";
const createTestDiffService = () => new TestDiffComputeService();
function fileDiff(path, added, removed) {
  const uri = URI.file(path).toString();
  return { after: { uri, content: { uri } }, diff: { added, removed } };
}
function getDiffUri(diff) {
  return diff.after?.uri ?? diff.before?.uri;
}
function simplify(diff) {
  return {
    uri: getDiffUri(diff),
    added: diff.diff?.added ?? 0,
    removed: diff.diff?.removed ?? 0
  };
}
function simpleDiff(path, added, removed) {
  return { uri: URI.file(path).toString(), added, removed };
}
suite("computeSessionDiffs", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns empty array for no edits", async () => {
    const db = new TestSessionDatabase();
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.deepStrictEqual(result, []);
  });
  test("computes diffs for a single edited file", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("line1\nline2"),
      afterContent: encodeString("line1\nline2\nline3")
    });
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.deepStrictEqual(result.map(simplify), [simpleDiff("/a.txt", 1, 0)]);
    assert.strictEqual(diffService.callCount, 1);
  });
  test("populates before/after with session-db content URIs for edits", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("v1"),
      afterContent: encodeString("v2")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("v2"),
      afterContent: encodeString("v3")
    });
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, createTestDiffService());
    assert.strictEqual(result.length, 1);
    const [diff] = result;
    const fileUri = URI.file("/a.txt").toString();
    assert.strictEqual(diff.before?.uri, fileUri);
    assert.strictEqual(diff.after?.uri, fileUri);
    const beforeFields = parseSessionDbUri(diff.before.content.uri);
    assert.deepStrictEqual(beforeFields, {
      sessionUri: TEST_SESSION_URI,
      toolCallId: "tc1",
      filePath: "/a.txt",
      part: "before"
    });
    const afterFields = parseSessionDbUri(diff.after.content.uri);
    assert.deepStrictEqual(afterFields, {
      sessionUri: TEST_SESSION_URI,
      toolCallId: "tc2",
      filePath: "/a.txt",
      part: "after"
    });
  });
  test("omits before for creates and after for deletes", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/created.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("new")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/deleted.txt",
      kind: FileEditKind.Delete,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("bye")
    });
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, createTestDiffService());
    result.sort((a, b) => (getDiffUri(a) ?? "").localeCompare(getDiffUri(b) ?? ""));
    assert.strictEqual(result.length, 2);
    const [created, deleted] = result;
    assert.strictEqual(created.before, void 0, "create has no before");
    assert.ok(created.after, "create has after");
    assert.ok(deleted.before, "delete has before");
    assert.strictEqual(deleted.after, void 0, "delete has no after");
  });
  test("skips files with no net change", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("same"),
      afterContent: encodeString("different")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("different"),
      afterContent: encodeString("same")
    });
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.deepStrictEqual(result, []);
    assert.strictEqual(diffService.callCount, 0, "no diff computation needed for zero net change");
  });
  test("tracks rename chains correctly", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("hello")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/b.txt",
      kind: FileEditKind.Rename,
      originalPath: "/a.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("hello"),
      afterContent: encodeString("hello world")
    });
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(getDiffUri(result[0]), URI.file("/b.txt").toString(), "uses terminal path after rename");
  });
  test("incremental: reuses previousDiffs for untouched files", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a-before"),
      afterContent: encodeString("a-after")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/b.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("b-before"),
      afterContent: encodeString("b-after\nnew")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 42, 7)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    result.sort((a, b) => (getDiffUri(a) ?? "").localeCompare(getDiffUri(b) ?? ""));
    assert.deepStrictEqual(result.map(simplify), [
      simpleDiff("/a.txt", 42, 7),
      // carried over
      simpleDiff("/b.txt", 1, 0)
      // recomputed
    ]);
    assert.strictEqual(diffService.callCount, 1, "only touched file should be diffed");
  });
  test("incremental: recomputes file edited in current turn", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("original"),
      afterContent: encodeString("after-turn1")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("after-turn1"),
      afterContent: encodeString("after-turn2\nextra")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 100, 100)
      // stale
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.deepStrictEqual(result.map(simplify), [simpleDiff("/a.txt", 1, 0)]);
    assert.strictEqual(diffService.callCount, 1);
  });
  test("incremental: rename in current turn drops old URI from previousDiffs", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/old.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("content")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/new.txt",
      kind: FileEditKind.Rename,
      originalPath: "/old.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("content"),
      afterContent: encodeString("content")
    });
    const previousDiffs = [
      fileDiff("/old.txt", 5, 0)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(getDiffUri(result[0]), URI.file("/new.txt").toString(), "uses new URI after rename");
  });
  test("incremental: file with zero net change in current turn is excluded even if in previousDiffs", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("original"),
      afterContent: encodeString("modified")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("modified"),
      afterContent: encodeString("original")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 10, 5)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.deepStrictEqual(result, []);
  });
  test("incremental: previousDiffs entry for file not in current identities is dropped (slow path)", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("before"),
      afterContent: encodeString("after")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("after"),
      afterContent: encodeString("latest\nline")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 1, 0),
      fileDiff("/orphan.txt", 99, 99)
      // no longer in DB
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(getDiffUri(result[0]), URI.file("/a.txt").toString());
  });
  test("full mode recomputes all files (no incremental options)", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a"),
      afterContent: encodeString("a\nb")
    });
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc2",
      filePath: "/b.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("new")
    });
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(TEST_SESSION_URI, db, diffService);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(diffService.callCount, 2, "both files should be diffed in full mode");
  });
  test("incremental fast path: new files only uses getFileEditsByTurn, not getAllFileEdits", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/old.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("old-before"),
      afterContent: encodeString("old-after")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/new.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("brand new")
    });
    const previousDiffs = [
      fileDiff("/old.txt", 3, 1)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(db.getFileEditsByTurnCalls, 1);
    assert.strictEqual(db.getAllFileEditsCalls, 0, "fast path should not call getAllFileEdits");
    result.sort((a, b) => (getDiffUri(a) ?? "").localeCompare(getDiffUri(b) ?? ""));
    assert.deepStrictEqual(result.map(simplify), [
      simpleDiff("/new.txt", 1, 0),
      simpleDiff("/old.txt", 3, 1)
      // carried over
    ]);
  });
  test("incremental slow path: re-edit of existing file falls back to getAllFileEdits", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("original"),
      afterContent: encodeString("turn1")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("turn1"),
      afterContent: encodeString("turn2\nextra")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 5, 0)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(db.getFileEditsByTurnCalls, 1, "should try turn-scoped query first");
    assert.strictEqual(db.getAllFileEditsCalls, 1, "should fall back to getAllFileEdits");
    assert.deepStrictEqual(result.map(simplify), [simpleDiff("/a.txt", 1, 0)]);
  });
  test("incremental slow path: rename in current turn falls back to getAllFileEdits", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      afterContent: encodeString("content")
    });
    db.addEdit({
      turnId: "t2",
      toolCallId: "tc2",
      filePath: "/b.txt",
      kind: FileEditKind.Rename,
      originalPath: "/a.txt",
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("content"),
      afterContent: encodeString("content")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 1, 0)
    ];
    const diffService = createTestDiffService();
    await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(db.getAllFileEditsCalls, 1, "should fall back for renames");
  });
  test("incremental: no edits in turn returns previousDiffs unchanged", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("before"),
      afterContent: encodeString("after")
    });
    const previousDiffs = [
      fileDiff("/a.txt", 5, 2)
    ];
    const diffService = createTestDiffService();
    const result = await computeSessionDiffs(
      TEST_SESSION_URI,
      db,
      diffService,
      { changedTurnId: "t2", previousDiffs }
    );
    assert.strictEqual(db.getAllFileEditsCalls, 0, "no computation needed");
    assert.deepStrictEqual(result, previousDiffs);
  });
});
suite("computeUnionedDiffs", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const PEER_CHAT_URI = "ahp-chat://peer/encoded";
  test("returns empty array when no source has edits", async () => {
    const result = await computeUnionedDiffs(
      [{ sessionUri: TEST_SESSION_URI, db: new TestSessionDatabase() }],
      createTestDiffService()
    );
    assert.deepStrictEqual(result, []);
  });
  test("unions edits from the session DB and a peer chat DB", async () => {
    const sessionDb = new TestSessionDatabase();
    sessionDb.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/a.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("a1"),
      afterContent: encodeString("a1\na2")
    });
    const peerDb = new TestSessionDatabase();
    peerDb.addEdit({
      turnId: "pt1",
      toolCallId: "ptc1",
      filePath: "/b.txt",
      kind: FileEditKind.Create,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: void 0,
      afterContent: encodeString("b1\nb2\nb3")
    });
    const result = await computeUnionedDiffs(
      [
        { sessionUri: TEST_SESSION_URI, db: sessionDb },
        { sessionUri: PEER_CHAT_URI, db: peerDb }
      ],
      createTestDiffService()
    );
    assert.deepStrictEqual(
      result.map(simplify).sort((x, y) => (x.uri ?? "").localeCompare(y.uri ?? "")),
      [simpleDiff("/a.txt", 1, 0), simpleDiff("/b.txt", 3, 0)]
    );
    const peerDiff = result.find((d) => getDiffUri(d) === URI.file("/b.txt").toString());
    const afterFields = parseSessionDbUri(peerDiff.after.content.uri);
    assert.deepStrictEqual(afterFields, {
      sessionUri: PEER_CHAT_URI,
      toolCallId: "ptc1",
      filePath: "/b.txt",
      part: "after"
    });
  });
  test("a file edited by multiple sources takes before from the first and after from the last source", async () => {
    const sessionDb = new TestSessionDatabase();
    sessionDb.addEdit({
      turnId: "t1",
      toolCallId: "tc1",
      filePath: "/shared.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("v1"),
      afterContent: encodeString("v2")
    });
    const peerDb = new TestSessionDatabase();
    peerDb.addEdit({
      turnId: "pt1",
      toolCallId: "ptc1",
      filePath: "/shared.txt",
      kind: FileEditKind.Edit,
      addedLines: void 0,
      removedLines: void 0,
      beforeContent: encodeString("v2"),
      afterContent: encodeString("v3")
    });
    const result = await computeUnionedDiffs(
      [
        { sessionUri: TEST_SESSION_URI, db: sessionDb },
        { sessionUri: PEER_CHAT_URI, db: peerDb }
      ],
      createTestDiffService()
    );
    assert.strictEqual(result.length, 1);
    const [diff] = result;
    assert.deepStrictEqual(parseSessionDbUri(diff.before.content.uri), {
      sessionUri: TEST_SESSION_URI,
      toolCallId: "tc1",
      filePath: "/shared.txt",
      part: "before"
    });
    assert.deepStrictEqual(parseSessionDbUri(diff.after.content.uri), {
      sessionUri: PEER_CHAT_URI,
      toolCallId: "ptc1",
      filePath: "/shared.txt",
      part: "after"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2Vzc2lvbkRpZmZBZ2dyZWdhdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdEtpbmQsIHR5cGUgSVNlc3Npb25GaWxlRGlmZiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgZW5jb2RlU3RyaW5nLCBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlLCBUZXN0U2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlU2Vzc2lvbkRpZmZzLCBjb21wdXRlVW5pb25lZERpZmZzIH0gZnJvbSAnLi4vLi4vbm9kZS9zZXNzaW9uRGlmZkFnZ3JlZ2F0b3IuanMnO1xuaW1wb3J0IHsgcGFyc2VTZXNzaW9uRGJVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRiVXJpLmpzJztcblxuY29uc3QgVEVTVF9TRVNTSU9OX1VSSSA9ICdzZXNzaW9uOi8vdGVzdC1zZXNzaW9uJztcblxuY29uc3QgY3JlYXRlVGVzdERpZmZTZXJ2aWNlID0gKCkgPT4gbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKTtcblxuZnVuY3Rpb24gZmlsZURpZmYocGF0aDogc3RyaW5nLCBhZGRlZDogbnVtYmVyLCByZW1vdmVkOiBudW1iZXIpOiBJU2Vzc2lvbkZpbGVEaWZmIHtcblx0Y29uc3QgdXJpID0gVVJJLmZpbGUocGF0aCkudG9TdHJpbmcoKTtcblx0cmV0dXJuIHsgYWZ0ZXI6IHsgdXJpLCBjb250ZW50OiB7IHVyaSB9IH0sIGRpZmY6IHsgYWRkZWQsIHJlbW92ZWQgfSB9O1xufVxuXG5mdW5jdGlvbiBnZXREaWZmVXJpKGRpZmY6IElTZXNzaW9uRmlsZURpZmYpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZGlmZi5hZnRlcj8udXJpID8/IGRpZmYuYmVmb3JlPy51cmk7XG59XG5cbmludGVyZmFjZSBJU2ltcGxlRGlmZiB7XG5cdHVyaTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRhZGRlZDogbnVtYmVyO1xuXHRyZW1vdmVkOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHNpbXBsaWZ5KGRpZmY6IElTZXNzaW9uRmlsZURpZmYpOiBJU2ltcGxlRGlmZiB7XG5cdHJldHVybiB7XG5cdFx0dXJpOiBnZXREaWZmVXJpKGRpZmYpLFxuXHRcdGFkZGVkOiBkaWZmLmRpZmY/LmFkZGVkID8/IDAsXG5cdFx0cmVtb3ZlZDogZGlmZi5kaWZmPy5yZW1vdmVkID8/IDAsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHNpbXBsZURpZmYocGF0aDogc3RyaW5nLCBhZGRlZDogbnVtYmVyLCByZW1vdmVkOiBudW1iZXIpOiBJU2ltcGxlRGlmZiB7XG5cdHJldHVybiB7IHVyaTogVVJJLmZpbGUocGF0aCkudG9TdHJpbmcoKSwgYWRkZWQsIHJlbW92ZWQgfTtcbn1cblxuc3VpdGUoJ2NvbXB1dGVTZXNzaW9uRGlmZnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tLSBGdWxsLW1vZGUgdGVzdHMgKG5vIGluY3JlbWVudGFsIG9wdGlvbnMpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgZm9yIG5vIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRjb25zdCBkaWZmU2VydmljZSA9IGNyZWF0ZVRlc3REaWZmU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoVEVTVF9TRVNTSU9OX1VSSSwgZGIsIGRpZmZTZXJ2aWNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlcyBkaWZmcyBmb3IgYSBzaW5nbGUgZWRpdGVkIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2xpbmUxXFxubGluZTInKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2xpbmUxXFxubGluZTJcXG5saW5lMycpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFRFU1RfU0VTU0lPTl9VUkksIGRiLCBkaWZmU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoc2ltcGxpZnkpLCBbc2ltcGxlRGlmZignL2EudHh0JywgMSwgMCldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlNlcnZpY2UuY2FsbENvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgncG9wdWxhdGVzIGJlZm9yZS9hZnRlciB3aXRoIHNlc3Npb24tZGIgY29udGVudCBVUklzIGZvciBlZGl0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygndjEnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ3YyJyksXG5cdFx0fSk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygndjInKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ3YzJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFRFU1RfU0VTU0lPTl9VUkksIGRiLCBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2RpZmZdID0gcmVzdWx0O1xuXHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL2EudHh0JykudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZi5iZWZvcmU/LnVyaSwgZmlsZVVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmYuYWZ0ZXI/LnVyaSwgZmlsZVVyaSk7XG5cblx0XHQvLyBiZWZvcmUgY29udGVudCBwb2ludHMgdG8gdGhlIEZJUlNUIHNuYXBzaG90ICh0YzEpXG5cdFx0Y29uc3QgYmVmb3JlRmllbGRzID0gcGFyc2VTZXNzaW9uRGJVcmkoZGlmZi5iZWZvcmUhLmNvbnRlbnQudXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJlZm9yZUZpZWxkcywge1xuXHRcdFx0c2Vzc2lvblVyaTogVEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0YzEnLFxuXHRcdFx0ZmlsZVBhdGg6ICcvYS50eHQnLFxuXHRcdFx0cGFydDogJ2JlZm9yZScsXG5cdFx0fSk7XG5cblx0XHQvLyBhZnRlciBjb250ZW50IHBvaW50cyB0byB0aGUgTEFTVCBzbmFwc2hvdCAodGMyKVxuXHRcdGNvbnN0IGFmdGVyRmllbGRzID0gcGFyc2VTZXNzaW9uRGJVcmkoZGlmZi5hZnRlciEuY29udGVudC51cmkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWZ0ZXJGaWVsZHMsIHtcblx0XHRcdHNlc3Npb25Vcmk6IFRFU1RfU0VTU0lPTl9VUkksXG5cdFx0XHR0b29sQ2FsbElkOiAndGMyJyxcblx0XHRcdGZpbGVQYXRoOiAnL2EudHh0Jyxcblx0XHRcdHBhcnQ6ICdhZnRlcicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIGJlZm9yZSBmb3IgY3JlYXRlcyBhbmQgYWZ0ZXIgZm9yIGRlbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvY3JlYXRlZC50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuQ3JlYXRlLFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCduZXcnKSxcblx0XHR9KTtcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMicsIGZpbGVQYXRoOiAnL2RlbGV0ZWQudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkRlbGV0ZSxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2J5ZScpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhURVNUX1NFU1NJT05fVVJJLCBkYiwgY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCkpO1xuXHRcdHJlc3VsdC5zb3J0KChhLCBiKSA9PiAoZ2V0RGlmZlVyaShhKSA/PyAnJykubG9jYWxlQ29tcGFyZShnZXREaWZmVXJpKGIpID8/ICcnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0Y29uc3QgW2NyZWF0ZWQsIGRlbGV0ZWRdID0gcmVzdWx0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkLmJlZm9yZSwgdW5kZWZpbmVkLCAnY3JlYXRlIGhhcyBubyBiZWZvcmUnKTtcblx0XHRhc3NlcnQub2soY3JlYXRlZC5hZnRlciwgJ2NyZWF0ZSBoYXMgYWZ0ZXInKTtcblx0XHRhc3NlcnQub2soZGVsZXRlZC5iZWZvcmUsICdkZWxldGUgaGFzIGJlZm9yZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLmFmdGVyLCB1bmRlZmluZWQsICdkZWxldGUgaGFzIG5vIGFmdGVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGZpbGVzIHdpdGggbm8gbmV0IGNoYW5nZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnc2FtZScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnZGlmZmVyZW50JyksXG5cdFx0fSk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnZGlmZmVyZW50JyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdzYW1lJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaWZmU2VydmljZSA9IGNyZWF0ZVRlc3REaWZmU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoVEVTVF9TRVNTSU9OX1VSSSwgZGIsIGRpZmZTZXJ2aWNlKTtcblxuXHRcdC8vIEJlZm9yZSA9IHRjMS5iZWZvcmUgPSAnc2FtZScsIEFmdGVyID0gdGMyLmFmdGVyID0gJ3NhbWUnIFx1MjE5MiB6ZXJvIG5ldCBjaGFuZ2Vcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmU2VydmljZS5jYWxsQ291bnQsIDAsICdubyBkaWZmIGNvbXB1dGF0aW9uIG5lZWRlZCBmb3IgemVybyBuZXQgY2hhbmdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYWNrcyByZW5hbWUgY2hhaW5zIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5DcmVhdGUsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2hlbGxvJyksXG5cdFx0fSk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9iLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5SZW5hbWUsIG9yaWdpbmFsUGF0aDogJy9hLnR4dCcsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdoZWxsbycpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnaGVsbG8gd29ybGQnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhURVNUX1NFU1NJT05fVVJJLCBkYiwgZGlmZlNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXREaWZmVXJpKHJlc3VsdFswXSksIFVSSS5maWxlKCcvYi50eHQnKS50b1N0cmluZygpLCAndXNlcyB0ZXJtaW5hbCBwYXRoIGFmdGVyIHJlbmFtZScpO1xuXHR9KTtcblxuXHQvLyAtLS0tIEluY3JlbWVudGFsLW1vZGUgdGVzdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnaW5jcmVtZW50YWw6IHJldXNlcyBwcmV2aW91c0RpZmZzIGZvciB1bnRvdWNoZWQgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIEZpbGUgQSBlZGl0ZWQgaW4gdHVybiAxIG9ubHlcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdhLWJlZm9yZScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYS1hZnRlcicpLFxuXHRcdH0pO1xuXHRcdC8vIEZpbGUgQiBlZGl0ZWQgaW4gdHVybiAyXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9iLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYi1iZWZvcmUnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2ItYWZ0ZXJcXG5uZXcnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHByZXZpb3VzRGlmZnM6IElTZXNzaW9uRmlsZURpZmZbXSA9IFtcblx0XHRcdGZpbGVEaWZmKCcvYS50eHQnLCA0MiwgNyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhcblx0XHRcdFRFU1RfU0VTU0lPTl9VUkksXG5cdFx0XHRkYixcblx0XHRcdGRpZmZTZXJ2aWNlLFxuXHRcdFx0eyBjaGFuZ2VkVHVybklkOiAndDInLCBwcmV2aW91c0RpZmZzIH0sXG5cdFx0KTtcblxuXHRcdC8vIFNvcnQgdG8gZW5zdXJlIHN0YWJsZSBjb21wYXJpc29uXG5cdFx0cmVzdWx0LnNvcnQoKGEsIGIpID0+IChnZXREaWZmVXJpKGEpID8/ICcnKS5sb2NhbGVDb21wYXJlKGdldERpZmZVcmkoYikgPz8gJycpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChzaW1wbGlmeSksIFtcblx0XHRcdHNpbXBsZURpZmYoJy9hLnR4dCcsIDQyLCA3KSwgLy8gY2FycmllZCBvdmVyXG5cdFx0XHRzaW1wbGVEaWZmKCcvYi50eHQnLCAxLCAwKSwgIC8vIHJlY29tcHV0ZWRcblx0XHRdKTtcblx0XHQvLyBPbmx5IGZpbGUgQiBzaG91bGQgaGF2ZSB0cmlnZ2VyZWQgYSBkaWZmIGNvbXB1dGF0aW9uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZTZXJ2aWNlLmNhbGxDb3VudCwgMSwgJ29ubHkgdG91Y2hlZCBmaWxlIHNob3VsZCBiZSBkaWZmZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jcmVtZW50YWw6IHJlY29tcHV0ZXMgZmlsZSBlZGl0ZWQgaW4gY3VycmVudCB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHQvLyBGaWxlIEEgZWRpdGVkIGluIHR1cm4gMSBhbmQgdHVybiAyXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnb3JpZ2luYWwnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2FmdGVyLXR1cm4xJyksXG5cdFx0fSk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYWZ0ZXItdHVybjEnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2FmdGVyLXR1cm4yXFxuZXh0cmEnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHByZXZpb3VzRGlmZnM6IElTZXNzaW9uRmlsZURpZmZbXSA9IFtcblx0XHRcdGZpbGVEaWZmKCcvYS50eHQnLCAxMDAsIDEwMCksIC8vIHN0YWxlXG5cdFx0XTtcblxuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhcblx0XHRcdFRFU1RfU0VTU0lPTl9VUkksXG5cdFx0XHRkYixcblx0XHRcdGRpZmZTZXJ2aWNlLFxuXHRcdFx0eyBjaGFuZ2VkVHVybklkOiAndDInLCBwcmV2aW91c0RpZmZzIH0sXG5cdFx0KTtcblxuXHRcdC8vIFNob3VsZCBjb21wYXJlIHRjMS5iZWZvcmU9J29yaWdpbmFsJyB2cyB0YzIuYWZ0ZXI9J2FmdGVyLXR1cm4yXFxuZXh0cmEnXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKHNpbXBsaWZ5KSwgW3NpbXBsZURpZmYoJy9hLnR4dCcsIDEsIDApXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZTZXJ2aWNlLmNhbGxDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY3JlbWVudGFsOiByZW5hbWUgaW4gY3VycmVudCB0dXJuIGRyb3BzIG9sZCBVUkkgZnJvbSBwcmV2aW91c0RpZmZzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHQvLyBGaWxlIGNyZWF0ZWQgaW4gdHVybiAxXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9vbGQudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkNyZWF0ZSxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnY29udGVudCcpLFxuXHRcdH0pO1xuXHRcdC8vIFJlbmFtZWQgaW4gdHVybiAyXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9uZXcudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLlJlbmFtZSxcblx0XHRcdG9yaWdpbmFsUGF0aDogJy9vbGQudHh0Jyxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2NvbnRlbnQnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2NvbnRlbnQnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHByZXZpb3VzRGlmZnM6IElTZXNzaW9uRmlsZURpZmZbXSA9IFtcblx0XHRcdGZpbGVEaWZmKCcvb2xkLnR4dCcsIDUsIDApLFxuXHRcdF07XG5cblx0XHRjb25zdCBkaWZmU2VydmljZSA9IGNyZWF0ZVRlc3REaWZmU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoXG5cdFx0XHRURVNUX1NFU1NJT05fVVJJLFxuXHRcdFx0ZGIsXG5cdFx0XHRkaWZmU2VydmljZSxcblx0XHRcdHsgY2hhbmdlZFR1cm5JZDogJ3QyJywgcHJldmlvdXNEaWZmcyB9LFxuXHRcdCk7XG5cblx0XHQvLyBDcmVhdGUgXHUyMTkyIFJlbmFtZSB3aXRoIHNhbWUgY29udGVudDogYmVmb3JlPScnIChjcmVhdGUpLCBhZnRlcj0nY29udGVudCcgKHJlbmFtZSlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldERpZmZVcmkocmVzdWx0WzBdKSwgVVJJLmZpbGUoJy9uZXcudHh0JykudG9TdHJpbmcoKSwgJ3VzZXMgbmV3IFVSSSBhZnRlciByZW5hbWUnKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jcmVtZW50YWw6IGZpbGUgd2l0aCB6ZXJvIG5ldCBjaGFuZ2UgaW4gY3VycmVudCB0dXJuIGlzIGV4Y2x1ZGVkIGV2ZW4gaWYgaW4gcHJldmlvdXNEaWZmcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnb3JpZ2luYWwnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ21vZGlmaWVkJyksXG5cdFx0fSk7XG5cdFx0Ly8gVHVybiAyIHJldmVydHMgdGhlIGNoYW5nZVxuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDInLCB0b29sQ2FsbElkOiAndGMyJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ21vZGlmaWVkJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdvcmlnaW5hbCcpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNEaWZmczogSVNlc3Npb25GaWxlRGlmZltdID0gW1xuXHRcdFx0ZmlsZURpZmYoJy9hLnR4dCcsIDEwLCA1KSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFxuXHRcdFx0VEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdGRiLFxuXHRcdFx0ZGlmZlNlcnZpY2UsXG5cdFx0XHR7IGNoYW5nZWRUdXJuSWQ6ICd0MicsIHByZXZpb3VzRGlmZnMgfSxcblx0XHQpO1xuXG5cdFx0Ly8gTmV0IGNoYW5nZSBpcyB6ZXJvIChyZXZlcnRlZCksIHNvIGZpbGUgc2hvdWxkIGJlIGV4Y2x1ZGVkXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5jcmVtZW50YWw6IHByZXZpb3VzRGlmZnMgZW50cnkgZm9yIGZpbGUgbm90IGluIGN1cnJlbnQgaWRlbnRpdGllcyBpcyBkcm9wcGVkIChzbG93IHBhdGgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHQvLyBGaWxlIEEgd2FzIGVkaXRlZCBpbiB0dXJuIDEgYW5kIGlzIGluIHByZXZpb3VzRGlmZnNcblx0XHRkYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdiZWZvcmUnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2FmdGVyJyksXG5cdFx0fSk7XG5cdFx0Ly8gRmlsZSBBIGlzIGVkaXRlZCBhZ2FpbiBpbiB0dXJuIDIgXHUyMTkyIHRyaWdnZXJzIHNsb3cgcGF0aCAocmUtZWRpdCBvZiBleGlzdGluZyBmaWxlKVxuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDInLCB0b29sQ2FsbElkOiAndGMyJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2FmdGVyJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdsYXRlc3RcXG5saW5lJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcmV2aW91c0RpZmZzOiBJU2Vzc2lvbkZpbGVEaWZmW10gPSBbXG5cdFx0XHRmaWxlRGlmZignL2EudHh0JywgMSwgMCksXG5cdFx0XHRmaWxlRGlmZignL29ycGhhbi50eHQnLCA5OSwgOTkpLCAvLyBubyBsb25nZXIgaW4gREJcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFxuXHRcdFx0VEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdGRiLFxuXHRcdFx0ZGlmZlNlcnZpY2UsXG5cdFx0XHR7IGNoYW5nZWRUdXJuSWQ6ICd0MicsIHByZXZpb3VzRGlmZnMgfSxcblx0XHQpO1xuXG5cdFx0Ly8gU2xvdyBwYXRoOiBvcnBoYW4gaXMgZHJvcHBlZCBiZWNhdXNlIGl0IGhhcyBubyBpZGVudGl0eSBpbiB0aGUgZnVsbCBncmFwaFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0RGlmZlVyaShyZXN1bHRbMF0pLCBVUkkuZmlsZSgnL2EudHh0JykudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1bGwgbW9kZSByZWNvbXB1dGVzIGFsbCBmaWxlcyAobm8gaW5jcmVtZW50YWwgb3B0aW9ucyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2EnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2FcXG5iJyksXG5cdFx0fSk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9iLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5DcmVhdGUsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ25ldycpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFRFU1RfU0VTU0lPTl9VUkksIGRiLCBkaWZmU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZTZXJ2aWNlLmNhbGxDb3VudCwgMiwgJ2JvdGggZmlsZXMgc2hvdWxkIGJlIGRpZmZlZCBpbiBmdWxsIG1vZGUnKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBGYXN0LXBhdGggdGVzdHMgKHR1cm4tc2NvcGVkIHF1ZXJ5IG9wdGltaXphdGlvbikgLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2luY3JlbWVudGFsIGZhc3QgcGF0aDogbmV3IGZpbGVzIG9ubHkgdXNlcyBnZXRGaWxlRWRpdHNCeVR1cm4sIG5vdCBnZXRBbGxGaWxlRWRpdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIFR1cm4gMTogZXhpc3RpbmcgZmlsZSB1bnRvdWNoZWQgaW4gdHVybiAyXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9vbGQudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdvbGQtYmVmb3JlJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdvbGQtYWZ0ZXInKSxcblx0XHR9KTtcblx0XHQvLyBUdXJuIDI6IGNyZWF0ZXMgYSBuZXcgZmlsZVxuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDInLCB0b29sQ2FsbElkOiAndGMyJywgZmlsZVBhdGg6ICcvbmV3LnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5DcmVhdGUsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2JyYW5kIG5ldycpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNEaWZmczogSVNlc3Npb25GaWxlRGlmZltdID0gW1xuXHRcdFx0ZmlsZURpZmYoJy9vbGQudHh0JywgMywgMSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhcblx0XHRcdFRFU1RfU0VTU0lPTl9VUkksXG5cdFx0XHRkYixcblx0XHRcdGRpZmZTZXJ2aWNlLFxuXHRcdFx0eyBjaGFuZ2VkVHVybklkOiAndDInLCBwcmV2aW91c0RpZmZzIH0sXG5cdFx0KTtcblxuXHRcdC8vIEZhc3QgcGF0aDogb25seSBnZXRGaWxlRWRpdHNCeVR1cm4gY2FsbGVkLCBub3QgZ2V0QWxsRmlsZUVkaXRzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRiLmdldEZpbGVFZGl0c0J5VHVybkNhbGxzLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGIuZ2V0QWxsRmlsZUVkaXRzQ2FsbHMsIDAsICdmYXN0IHBhdGggc2hvdWxkIG5vdCBjYWxsIGdldEFsbEZpbGVFZGl0cycpO1xuXG5cdFx0cmVzdWx0LnNvcnQoKGEsIGIpID0+IChnZXREaWZmVXJpKGEpID8/ICcnKS5sb2NhbGVDb21wYXJlKGdldERpZmZVcmkoYikgPz8gJycpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoc2ltcGxpZnkpLCBbXG5cdFx0XHRzaW1wbGVEaWZmKCcvbmV3LnR4dCcsIDEsIDApLFxuXHRcdFx0c2ltcGxlRGlmZignL29sZC50eHQnLCAzLCAxKSwgLy8gY2FycmllZCBvdmVyXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY3JlbWVudGFsIHNsb3cgcGF0aDogcmUtZWRpdCBvZiBleGlzdGluZyBmaWxlIGZhbGxzIGJhY2sgdG8gZ2V0QWxsRmlsZUVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHQvLyBUdXJuIDE6IGVkaXQgZmlsZSBBXG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9hLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnb3JpZ2luYWwnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ3R1cm4xJyksXG5cdFx0fSk7XG5cdFx0Ly8gVHVybiAyOiBlZGl0IGZpbGUgQSBhZ2FpblxuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDInLCB0b29sQ2FsbElkOiAndGMyJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ3R1cm4xJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCd0dXJuMlxcbmV4dHJhJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcmV2aW91c0RpZmZzOiBJU2Vzc2lvbkZpbGVEaWZmW10gPSBbXG5cdFx0XHRmaWxlRGlmZignL2EudHh0JywgNSwgMCksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gY3JlYXRlVGVzdERpZmZTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcHV0ZVNlc3Npb25EaWZmcyhcblx0XHRcdFRFU1RfU0VTU0lPTl9VUkksXG5cdFx0XHRkYixcblx0XHRcdGRpZmZTZXJ2aWNlLFxuXHRcdFx0eyBjaGFuZ2VkVHVybklkOiAndDInLCBwcmV2aW91c0RpZmZzIH0sXG5cdFx0KTtcblxuXHRcdC8vIFNsb3cgcGF0aDogZmFsbHMgYmFjayB0byBnZXRBbGxGaWxlRWRpdHMgYmVjYXVzZSAvYS50eHQgaXMgaW4gcHJldmlvdXNEaWZmc1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYi5nZXRGaWxlRWRpdHNCeVR1cm5DYWxscywgMSwgJ3Nob3VsZCB0cnkgdHVybi1zY29wZWQgcXVlcnkgZmlyc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGIuZ2V0QWxsRmlsZUVkaXRzQ2FsbHMsIDEsICdzaG91bGQgZmFsbCBiYWNrIHRvIGdldEFsbEZpbGVFZGl0cycpO1xuXG5cdFx0Ly8gQ3VtdWxhdGl2ZSBkaWZmOiBvcmlnaW5hbCBcdTIxOTIgdHVybjJcXG5leHRyYVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChzaW1wbGlmeSksIFtzaW1wbGVEaWZmKCcvYS50eHQnLCAxLCAwKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNyZW1lbnRhbCBzbG93IHBhdGg6IHJlbmFtZSBpbiBjdXJyZW50IHR1cm4gZmFsbHMgYmFjayB0byBnZXRBbGxGaWxlRWRpdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuQ3JlYXRlLFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdjb250ZW50JyksXG5cdFx0fSk7XG5cdFx0ZGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MicsIHRvb2xDYWxsSWQ6ICd0YzInLCBmaWxlUGF0aDogJy9iLnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5SZW5hbWUsXG5cdFx0XHRvcmlnaW5hbFBhdGg6ICcvYS50eHQnLFxuXHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnY29udGVudCcpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnY29udGVudCcpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNEaWZmczogSVNlc3Npb25GaWxlRGlmZltdID0gW1xuXHRcdFx0ZmlsZURpZmYoJy9hLnR4dCcsIDEsIDApLFxuXHRcdF07XG5cblx0XHRjb25zdCBkaWZmU2VydmljZSA9IGNyZWF0ZVRlc3REaWZmU2VydmljZSgpO1xuXHRcdGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoXG5cdFx0XHRURVNUX1NFU1NJT05fVVJJLFxuXHRcdFx0ZGIsXG5cdFx0XHRkaWZmU2VydmljZSxcblx0XHRcdHsgY2hhbmdlZFR1cm5JZDogJ3QyJywgcHJldmlvdXNEaWZmcyB9LFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGIuZ2V0QWxsRmlsZUVkaXRzQ2FsbHMsIDEsICdzaG91bGQgZmFsbCBiYWNrIGZvciByZW5hbWVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY3JlbWVudGFsOiBubyBlZGl0cyBpbiB0dXJuIHJldHVybnMgcHJldmlvdXNEaWZmcyB1bmNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAndDEnLCB0b29sQ2FsbElkOiAndGMxJywgZmlsZVBhdGg6ICcvYS50eHQnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2JlZm9yZScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYWZ0ZXInKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHByZXZpb3VzRGlmZnM6IElTZXNzaW9uRmlsZURpZmZbXSA9IFtcblx0XHRcdGZpbGVEaWZmKCcvYS50eHQnLCA1LCAyKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGlmZlNlcnZpY2UgPSBjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKFxuXHRcdFx0VEVTVF9TRVNTSU9OX1VSSSxcblx0XHRcdGRiLFxuXHRcdFx0ZGlmZlNlcnZpY2UsXG5cdFx0XHR7IGNoYW5nZWRUdXJuSWQ6ICd0MicsIHByZXZpb3VzRGlmZnMgfSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRiLmdldEFsbEZpbGVFZGl0c0NhbGxzLCAwLCAnbm8gY29tcHV0YXRpb24gbmVlZGVkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHByZXZpb3VzRGlmZnMpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY29tcHV0ZVVuaW9uZWREaWZmcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBQRUVSX0NIQVRfVVJJID0gJ2FocC1jaGF0Oi8vcGVlci9lbmNvZGVkJztcblxuXHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGFycmF5IHdoZW4gbm8gc291cmNlIGhhcyBlZGl0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wdXRlVW5pb25lZERpZmZzKFxuXHRcdFx0W3sgc2Vzc2lvblVyaTogVEVTVF9TRVNTSU9OX1VSSSwgZGI6IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCkgfV0sXG5cdFx0XHRjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuaW9ucyBlZGl0cyBmcm9tIHRoZSBzZXNzaW9uIERCIGFuZCBhIHBlZXIgY2hhdCBEQicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uRGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdHNlc3Npb25EYi5hZGRFZGl0KHtcblx0XHRcdHR1cm5JZDogJ3QxJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL2EudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCdhMScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYTFcXG5hMicpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGVlckRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRwZWVyRGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICdwdDEnLCB0b29sQ2FsbElkOiAncHRjMScsIGZpbGVQYXRoOiAnL2IudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkNyZWF0ZSxcblx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVDb250ZW50OiB1bmRlZmluZWQsIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCdiMVxcbmIyXFxuYjMnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVVbmlvbmVkRGlmZnMoXG5cdFx0XHRbXG5cdFx0XHRcdHsgc2Vzc2lvblVyaTogVEVTVF9TRVNTSU9OX1VSSSwgZGI6IHNlc3Npb25EYiB9LFxuXHRcdFx0XHR7IHNlc3Npb25Vcmk6IFBFRVJfQ0hBVF9VUkksIGRiOiBwZWVyRGIgfSxcblx0XHRcdF0sXG5cdFx0XHRjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlc3VsdC5tYXAoc2ltcGxpZnkpLnNvcnQoKHgsIHkpID0+ICh4LnVyaSA/PyAnJykubG9jYWxlQ29tcGFyZSh5LnVyaSA/PyAnJykpLFxuXHRcdFx0W3NpbXBsZURpZmYoJy9hLnR4dCcsIDEsIDApLCBzaW1wbGVEaWZmKCcvYi50eHQnLCAzLCAwKV0sXG5cdFx0KTtcblxuXHRcdC8vIFRoZSBwZWVyIGZpbGUncyBjb250ZW50IFVSSSBtdXN0IGVuY29kZSB0aGUgcGVlciBjaGF0IFVSSSBzbyB0aGVcblx0XHQvLyByZXNvdXJjZSByZXNvbHZlciBvcGVucyB0aGUgcGVlciBEQiwgbm90IHRoZSBzZXNzaW9uIERCLlxuXHRcdGNvbnN0IHBlZXJEaWZmID0gcmVzdWx0LmZpbmQoZCA9PiBnZXREaWZmVXJpKGQpID09PSBVUkkuZmlsZSgnL2IudHh0JykudG9TdHJpbmcoKSkhO1xuXHRcdGNvbnN0IGFmdGVyRmllbGRzID0gcGFyc2VTZXNzaW9uRGJVcmkocGVlckRpZmYuYWZ0ZXIhLmNvbnRlbnQudXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFmdGVyRmllbGRzLCB7XG5cdFx0XHRzZXNzaW9uVXJpOiBQRUVSX0NIQVRfVVJJLFxuXHRcdFx0dG9vbENhbGxJZDogJ3B0YzEnLFxuXHRcdFx0ZmlsZVBhdGg6ICcvYi50eHQnLFxuXHRcdFx0cGFydDogJ2FmdGVyJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBmaWxlIGVkaXRlZCBieSBtdWx0aXBsZSBzb3VyY2VzIHRha2VzIGJlZm9yZSBmcm9tIHRoZSBmaXJzdCBhbmQgYWZ0ZXIgZnJvbSB0aGUgbGFzdCBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRzZXNzaW9uRGIuYWRkRWRpdCh7XG5cdFx0XHR0dXJuSWQ6ICd0MScsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9zaGFyZWQudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCd2MScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygndjInKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBlZXJEYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0cGVlckRiLmFkZEVkaXQoe1xuXHRcdFx0dHVybklkOiAncHQxJywgdG9vbENhbGxJZDogJ3B0YzEnLCBmaWxlUGF0aDogJy9zaGFyZWQudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCd2MicpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygndjMnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbXB1dGVVbmlvbmVkRGlmZnMoXG5cdFx0XHRbXG5cdFx0XHRcdHsgc2Vzc2lvblVyaTogVEVTVF9TRVNTSU9OX1VSSSwgZGI6IHNlc3Npb25EYiB9LFxuXHRcdFx0XHR7IHNlc3Npb25Vcmk6IFBFRVJfQ0hBVF9VUkksIGRiOiBwZWVyRGIgfSxcblx0XHRcdF0sXG5cdFx0XHRjcmVhdGVUZXN0RGlmZlNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtkaWZmXSA9IHJlc3VsdDtcblxuXHRcdC8vIGJlZm9yZSBzbmFwc2hvdCBmcm9tIHRoZSBzZXNzaW9uIERCIChmaXJzdCBzb3VyY2UpXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNlc3Npb25EYlVyaShkaWZmLmJlZm9yZSEuY29udGVudC51cmkpLCB7XG5cdFx0XHRzZXNzaW9uVXJpOiBURVNUX1NFU1NJT05fVVJJLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjMScsXG5cdFx0XHRmaWxlUGF0aDogJy9zaGFyZWQudHh0Jyxcblx0XHRcdHBhcnQ6ICdiZWZvcmUnLFxuXHRcdH0pO1xuXHRcdC8vIGFmdGVyIHNuYXBzaG90IGZyb20gdGhlIHBlZXIgY2hhdCBEQiAobGFzdCBzb3VyY2UpXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVNlc3Npb25EYlVyaShkaWZmLmFmdGVyIS5jb250ZW50LnVyaSksIHtcblx0XHRcdHNlc3Npb25Vcmk6IFBFRVJfQ0hBVF9VUkksXG5cdFx0XHR0b29sQ2FsbElkOiAncHRjMScsXG5cdFx0XHRmaWxlUGF0aDogJy9zaGFyZWQudHh0Jyxcblx0XHRcdHBhcnQ6ICdhZnRlcicsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsb0JBQTJDO0FBQ3BELFNBQVMsY0FBYyx3QkFBd0IsMkJBQTJCO0FBQzFFLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLG1CQUFtQjtBQUV6QixNQUFNLHdCQUF3QixNQUFNLElBQUksdUJBQXVCO0FBRS9ELFNBQVMsU0FBUyxNQUFjLE9BQWUsU0FBbUM7QUFDakYsUUFBTSxNQUFNLElBQUksS0FBSyxJQUFJLEVBQUUsU0FBUztBQUNwQyxTQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssU0FBUyxFQUFFLElBQUksRUFBRSxHQUFHLE1BQU0sRUFBRSxPQUFPLFFBQVEsRUFBRTtBQUNyRTtBQUVBLFNBQVMsV0FBVyxNQUE0QztBQUMvRCxTQUFPLEtBQUssT0FBTyxPQUFPLEtBQUssUUFBUTtBQUN4QztBQVFBLFNBQVMsU0FBUyxNQUFxQztBQUN0RCxTQUFPO0FBQUEsSUFDTixLQUFLLFdBQVcsSUFBSTtBQUFBLElBQ3BCLE9BQU8sS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUMzQixTQUFTLEtBQUssTUFBTSxXQUFXO0FBQUEsRUFDaEM7QUFDRDtBQUVBLFNBQVMsV0FBVyxNQUFjLE9BQWUsU0FBOEI7QUFDOUUsU0FBTyxFQUFFLEtBQUssSUFBSSxLQUFLLElBQUksRUFBRSxTQUFTLEdBQUcsT0FBTyxRQUFRO0FBQ3pEO0FBRUEsTUFBTSx1QkFBdUIsTUFBTTtBQUVsQywwQ0FBd0M7QUFJeEMsT0FBSyxvQ0FBb0MsWUFBWTtBQUNwRCxVQUFNLEtBQUssSUFBSSxvQkFBb0I7QUFDbkMsVUFBTSxjQUFjLHNCQUFzQjtBQUMxQyxVQUFNLFNBQVMsTUFBTSxvQkFBb0Isa0JBQWtCLElBQUksV0FBVztBQUMxRSxXQUFPLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxZQUFZO0FBQzNELFVBQU0sS0FBSyxJQUFJLG9CQUFvQjtBQUNuQyxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFVLE1BQU0sYUFBYTtBQUFBLE1BQ3hFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxlQUFlLGFBQWEsY0FBYztBQUFBLE1BQUcsY0FBYyxhQUFhLHFCQUFxQjtBQUFBLElBQzlGLENBQUM7QUFFRCxVQUFNLGNBQWMsc0JBQXNCO0FBQzFDLFVBQU0sU0FBUyxNQUFNLG9CQUFvQixrQkFBa0IsSUFBSSxXQUFXO0FBRTFFLFdBQU8sZ0JBQWdCLE9BQU8sSUFBSSxRQUFRLEdBQUcsQ0FBQyxXQUFXLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN6RSxXQUFPLFlBQVksWUFBWSxXQUFXLENBQUM7QUFBQSxFQUM1QyxDQUFDO0FBRUQsT0FBSyxpRUFBaUUsWUFBWTtBQUNqRixVQUFNLEtBQUssSUFBSSxvQkFBb0I7QUFDbkMsT0FBRyxRQUFRO0FBQUEsTUFDVixRQUFRO0FBQUEsTUFBTSxZQUFZO0FBQUEsTUFBTyxVQUFVO0FBQUEsTUFBVSxNQUFNLGFBQWE7QUFBQSxNQUN4RSxZQUFZO0FBQUEsTUFBVyxjQUFjO0FBQUEsTUFDckMsZUFBZSxhQUFhLElBQUk7QUFBQSxNQUFHLGNBQWMsYUFBYSxJQUFJO0FBQUEsSUFDbkUsQ0FBQztBQUNELE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVUsTUFBTSxhQUFhO0FBQUEsTUFDeEUsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxJQUFJO0FBQUEsTUFBRyxjQUFjLGFBQWEsSUFBSTtBQUFBLElBQ25FLENBQUM7QUFFRCxVQUFNLFNBQVMsTUFBTSxvQkFBb0Isa0JBQWtCLElBQUksc0JBQXNCLENBQUM7QUFFdEYsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFVBQU0sQ0FBQyxJQUFJLElBQUk7QUFDZixVQUFNLFVBQVUsSUFBSSxLQUFLLFFBQVEsRUFBRSxTQUFTO0FBQzVDLFdBQU8sWUFBWSxLQUFLLFFBQVEsS0FBSyxPQUFPO0FBQzVDLFdBQU8sWUFBWSxLQUFLLE9BQU8sS0FBSyxPQUFPO0FBRzNDLFVBQU0sZUFBZSxrQkFBa0IsS0FBSyxPQUFRLFFBQVEsR0FBRztBQUMvRCxXQUFPLGdCQUFnQixjQUFjO0FBQUEsTUFDcEMsWUFBWTtBQUFBLE1BQ1osWUFBWTtBQUFBLE1BQ1osVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLElBQ1AsQ0FBQztBQUdELFVBQU0sY0FBYyxrQkFBa0IsS0FBSyxNQUFPLFFBQVEsR0FBRztBQUM3RCxXQUFPLGdCQUFnQixhQUFhO0FBQUEsTUFDbkMsWUFBWTtBQUFBLE1BQ1osWUFBWTtBQUFBLE1BQ1osVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLElBQ1AsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0RBQWtELFlBQVk7QUFDbEUsVUFBTSxLQUFLLElBQUksb0JBQW9CO0FBQ25DLE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQWdCLE1BQU0sYUFBYTtBQUFBLE1BQzlFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxjQUFjLGFBQWEsS0FBSztBQUFBLElBQ2pDLENBQUM7QUFDRCxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFnQixNQUFNLGFBQWE7QUFBQSxNQUM5RSxZQUFZO0FBQUEsTUFBVyxjQUFjO0FBQUEsTUFDckMsZUFBZSxhQUFhLEtBQUs7QUFBQSxJQUNsQyxDQUFDO0FBRUQsVUFBTSxTQUFTLE1BQU0sb0JBQW9CLGtCQUFrQixJQUFJLHNCQUFzQixDQUFDO0FBQ3RGLFdBQU8sS0FBSyxDQUFDLEdBQUcsT0FBTyxXQUFXLENBQUMsS0FBSyxJQUFJLGNBQWMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO0FBRTlFLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxVQUFNLENBQUMsU0FBUyxPQUFPLElBQUk7QUFDM0IsV0FBTyxZQUFZLFFBQVEsUUFBUSxRQUFXLHNCQUFzQjtBQUNwRSxXQUFPLEdBQUcsUUFBUSxPQUFPLGtCQUFrQjtBQUMzQyxXQUFPLEdBQUcsUUFBUSxRQUFRLG1CQUFtQjtBQUM3QyxXQUFPLFlBQVksUUFBUSxPQUFPLFFBQVcscUJBQXFCO0FBQUEsRUFDbkUsQ0FBQztBQUVELE9BQUssa0NBQWtDLFlBQVk7QUFDbEQsVUFBTSxLQUFLLElBQUksb0JBQW9CO0FBQ25DLE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVUsTUFBTSxhQUFhO0FBQUEsTUFDeEUsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxNQUFNO0FBQUEsTUFBRyxjQUFjLGFBQWEsV0FBVztBQUFBLElBQzVFLENBQUM7QUFDRCxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFVLE1BQU0sYUFBYTtBQUFBLE1BQ3hFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxlQUFlLGFBQWEsV0FBVztBQUFBLE1BQUcsY0FBYyxhQUFhLE1BQU07QUFBQSxJQUM1RSxDQUFDO0FBRUQsVUFBTSxjQUFjLHNCQUFzQjtBQUMxQyxVQUFNLFNBQVMsTUFBTSxvQkFBb0Isa0JBQWtCLElBQUksV0FBVztBQUcxRSxXQUFPLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUNqQyxXQUFPLFlBQVksWUFBWSxXQUFXLEdBQUcsZ0RBQWdEO0FBQUEsRUFDOUYsQ0FBQztBQUVELE9BQUssa0NBQWtDLFlBQVk7QUFDbEQsVUFBTSxLQUFLLElBQUksb0JBQW9CO0FBQ25DLE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVUsTUFBTSxhQUFhO0FBQUEsTUFDeEUsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGNBQWMsYUFBYSxPQUFPO0FBQUEsSUFDbkMsQ0FBQztBQUNELE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVUsTUFBTSxhQUFhO0FBQUEsTUFBUSxjQUFjO0FBQUEsTUFDOUYsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxPQUFPO0FBQUEsTUFBRyxjQUFjLGFBQWEsYUFBYTtBQUFBLElBQy9FLENBQUM7QUFFRCxVQUFNLGNBQWMsc0JBQXNCO0FBQzFDLFVBQU0sU0FBUyxNQUFNLG9CQUFvQixrQkFBa0IsSUFBSSxXQUFXO0FBRTFFLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLFlBQVksV0FBVyxPQUFPLENBQUMsQ0FBQyxHQUFHLElBQUksS0FBSyxRQUFRLEVBQUUsU0FBUyxHQUFHLGlDQUFpQztBQUFBLEVBQzNHLENBQUM7QUFJRCxPQUFLLHlEQUF5RCxZQUFZO0FBQ3pFLFVBQU0sS0FBSyxJQUFJLG9CQUFvQjtBQUVuQyxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFVLE1BQU0sYUFBYTtBQUFBLE1BQ3hFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxlQUFlLGFBQWEsVUFBVTtBQUFBLE1BQUcsY0FBYyxhQUFhLFNBQVM7QUFBQSxJQUM5RSxDQUFDO0FBRUQsT0FBRyxRQUFRO0FBQUEsTUFDVixRQUFRO0FBQUEsTUFBTSxZQUFZO0FBQUEsTUFBTyxVQUFVO0FBQUEsTUFBVSxNQUFNLGFBQWE7QUFBQSxNQUN4RSxZQUFZO0FBQUEsTUFBVyxjQUFjO0FBQUEsTUFDckMsZUFBZSxhQUFhLFVBQVU7QUFBQSxNQUFHLGNBQWMsYUFBYSxjQUFjO0FBQUEsSUFDbkYsQ0FBQztBQUVELFVBQU0sZ0JBQW9DO0FBQUEsTUFDekMsU0FBUyxVQUFVLElBQUksQ0FBQztBQUFBLElBQ3pCO0FBRUEsVUFBTSxjQUFjLHNCQUFzQjtBQUMxQyxVQUFNLFNBQVMsTUFBTTtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUUsZUFBZSxNQUFNLGNBQWM7QUFBQSxJQUN0QztBQUdBLFdBQU8sS0FBSyxDQUFDLEdBQUcsT0FBTyxXQUFXLENBQUMsS0FBSyxJQUFJLGNBQWMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO0FBRTlFLFdBQU8sZ0JBQWdCLE9BQU8sSUFBSSxRQUFRLEdBQUc7QUFBQSxNQUM1QyxXQUFXLFVBQVUsSUFBSSxDQUFDO0FBQUE7QUFBQSxNQUMxQixXQUFXLFVBQVUsR0FBRyxDQUFDO0FBQUE7QUFBQSxJQUMxQixDQUFDO0FBRUQsV0FBTyxZQUFZLFlBQVksV0FBVyxHQUFHLG9DQUFvQztBQUFBLEVBQ2xGLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLFVBQU0sS0FBSyxJQUFJLG9CQUFvQjtBQUVuQyxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFVLE1BQU0sYUFBYTtBQUFBLE1BQ3hFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxlQUFlLGFBQWEsVUFBVTtBQUFBLE1BQUcsY0FBYyxhQUFhLGFBQWE7QUFBQSxJQUNsRixDQUFDO0FBQ0QsT0FBRyxRQUFRO0FBQUEsTUFDVixRQUFRO0FBQUEsTUFBTSxZQUFZO0FBQUEsTUFBTyxVQUFVO0FBQUEsTUFBVSxNQUFNLGFBQWE7QUFBQSxNQUN4RSxZQUFZO0FBQUEsTUFBVyxjQUFjO0FBQUEsTUFDckMsZUFBZSxhQUFhLGFBQWE7QUFBQSxNQUFHLGNBQWMsYUFBYSxvQkFBb0I7QUFBQSxJQUM1RixDQUFDO0FBRUQsVUFBTSxnQkFBb0M7QUFBQSxNQUN6QyxTQUFTLFVBQVUsS0FBSyxHQUFHO0FBQUE7QUFBQSxJQUM1QjtBQUVBLFVBQU0sY0FBYyxzQkFBc0I7QUFDMUMsVUFBTSxTQUFTLE1BQU07QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFLGVBQWUsTUFBTSxjQUFjO0FBQUEsSUFDdEM7QUFHQSxXQUFPLGdCQUFnQixPQUFPLElBQUksUUFBUSxHQUFHLENBQUMsV0FBVyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDekUsV0FBTyxZQUFZLFlBQVksV0FBVyxDQUFDO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssd0VBQXdFLFlBQVk7QUFDeEYsVUFBTSxLQUFLLElBQUksb0JBQW9CO0FBRW5DLE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVksTUFBTSxhQUFhO0FBQUEsTUFDMUUsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGNBQWMsYUFBYSxTQUFTO0FBQUEsSUFDckMsQ0FBQztBQUVELE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVksTUFBTSxhQUFhO0FBQUEsTUFDMUUsY0FBYztBQUFBLE1BQ2QsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxTQUFTO0FBQUEsTUFBRyxjQUFjLGFBQWEsU0FBUztBQUFBLElBQzdFLENBQUM7QUFFRCxVQUFNLGdCQUFvQztBQUFBLE1BQ3pDLFNBQVMsWUFBWSxHQUFHLENBQUM7QUFBQSxJQUMxQjtBQUVBLFVBQU0sY0FBYyxzQkFBc0I7QUFDMUMsVUFBTSxTQUFTLE1BQU07QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFLGVBQWUsTUFBTSxjQUFjO0FBQUEsSUFDdEM7QUFHQSxXQUFPLFlBQVksT0FBTyxRQUFRLENBQUM7QUFDbkMsV0FBTyxZQUFZLFdBQVcsT0FBTyxDQUFDLENBQUMsR0FBRyxJQUFJLEtBQUssVUFBVSxFQUFFLFNBQVMsR0FBRywyQkFBMkI7QUFBQSxFQUN2RyxDQUFDO0FBRUQsT0FBSywrRkFBK0YsWUFBWTtBQUMvRyxVQUFNLEtBQUssSUFBSSxvQkFBb0I7QUFDbkMsT0FBRyxRQUFRO0FBQUEsTUFDVixRQUFRO0FBQUEsTUFBTSxZQUFZO0FBQUEsTUFBTyxVQUFVO0FBQUEsTUFBVSxNQUFNLGFBQWE7QUFBQSxNQUN4RSxZQUFZO0FBQUEsTUFBVyxjQUFjO0FBQUEsTUFDckMsZUFBZSxhQUFhLFVBQVU7QUFBQSxNQUFHLGNBQWMsYUFBYSxVQUFVO0FBQUEsSUFDL0UsQ0FBQztBQUVELE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVUsTUFBTSxhQUFhO0FBQUEsTUFDeEUsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxVQUFVO0FBQUEsTUFBRyxjQUFjLGFBQWEsVUFBVTtBQUFBLElBQy9FLENBQUM7QUFFRCxVQUFNLGdCQUFvQztBQUFBLE1BQ3pDLFNBQVMsVUFBVSxJQUFJLENBQUM7QUFBQSxJQUN6QjtBQUVBLFVBQU0sY0FBYyxzQkFBc0I7QUFDMUMsVUFBTSxTQUFTLE1BQU07QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFLGVBQWUsTUFBTSxjQUFjO0FBQUEsSUFDdEM7QUFHQSxXQUFPLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLDhGQUE4RixZQUFZO0FBQzlHLFVBQU0sS0FBSyxJQUFJLG9CQUFvQjtBQUVuQyxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFVLE1BQU0sYUFBYTtBQUFBLE1BQ3hFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxlQUFlLGFBQWEsUUFBUTtBQUFBLE1BQUcsY0FBYyxhQUFhLE9BQU87QUFBQSxJQUMxRSxDQUFDO0FBRUQsT0FBRyxRQUFRO0FBQUEsTUFDVixRQUFRO0FBQUEsTUFBTSxZQUFZO0FBQUEsTUFBTyxVQUFVO0FBQUEsTUFBVSxNQUFNLGFBQWE7QUFBQSxNQUN4RSxZQUFZO0FBQUEsTUFBVyxjQUFjO0FBQUEsTUFDckMsZUFBZSxhQUFhLE9BQU87QUFBQSxNQUFHLGNBQWMsYUFBYSxjQUFjO0FBQUEsSUFDaEYsQ0FBQztBQUVELFVBQU0sZ0JBQW9DO0FBQUEsTUFDekMsU0FBUyxVQUFVLEdBQUcsQ0FBQztBQUFBLE1BQ3ZCLFNBQVMsZUFBZSxJQUFJLEVBQUU7QUFBQTtBQUFBLElBQy9CO0FBRUEsVUFBTSxjQUFjLHNCQUFzQjtBQUMxQyxVQUFNLFNBQVMsTUFBTTtBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUUsZUFBZSxNQUFNLGNBQWM7QUFBQSxJQUN0QztBQUdBLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLFlBQVksV0FBVyxPQUFPLENBQUMsQ0FBQyxHQUFHLElBQUksS0FBSyxRQUFRLEVBQUUsU0FBUyxDQUFDO0FBQUEsRUFDeEUsQ0FBQztBQUVELE9BQUssMkRBQTJELFlBQVk7QUFDM0UsVUFBTSxLQUFLLElBQUksb0JBQW9CO0FBQ25DLE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVUsTUFBTSxhQUFhO0FBQUEsTUFDeEUsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxHQUFHO0FBQUEsTUFBRyxjQUFjLGFBQWEsTUFBTTtBQUFBLElBQ3BFLENBQUM7QUFDRCxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFVLE1BQU0sYUFBYTtBQUFBLE1BQ3hFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxjQUFjLGFBQWEsS0FBSztBQUFBLElBQ2pDLENBQUM7QUFFRCxVQUFNLGNBQWMsc0JBQXNCO0FBQzFDLFVBQU0sU0FBUyxNQUFNLG9CQUFvQixrQkFBa0IsSUFBSSxXQUFXO0FBRTFFLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLFlBQVksWUFBWSxXQUFXLEdBQUcsMENBQTBDO0FBQUEsRUFDeEYsQ0FBQztBQUlELE9BQUssc0ZBQXNGLFlBQVk7QUFDdEcsVUFBTSxLQUFLLElBQUksb0JBQW9CO0FBRW5DLE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVksTUFBTSxhQUFhO0FBQUEsTUFDMUUsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxZQUFZO0FBQUEsTUFBRyxjQUFjLGFBQWEsV0FBVztBQUFBLElBQ2xGLENBQUM7QUFFRCxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFZLE1BQU0sYUFBYTtBQUFBLE1BQzFFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxjQUFjLGFBQWEsV0FBVztBQUFBLElBQ3ZDLENBQUM7QUFFRCxVQUFNLGdCQUFvQztBQUFBLE1BQ3pDLFNBQVMsWUFBWSxHQUFHLENBQUM7QUFBQSxJQUMxQjtBQUVBLFVBQU0sY0FBYyxzQkFBc0I7QUFDMUMsVUFBTSxTQUFTLE1BQU07QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFLGVBQWUsTUFBTSxjQUFjO0FBQUEsSUFDdEM7QUFHQSxXQUFPLFlBQVksR0FBRyx5QkFBeUIsQ0FBQztBQUNoRCxXQUFPLFlBQVksR0FBRyxzQkFBc0IsR0FBRywyQ0FBMkM7QUFFMUYsV0FBTyxLQUFLLENBQUMsR0FBRyxPQUFPLFdBQVcsQ0FBQyxLQUFLLElBQUksY0FBYyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7QUFDOUUsV0FBTyxnQkFBZ0IsT0FBTyxJQUFJLFFBQVEsR0FBRztBQUFBLE1BQzVDLFdBQVcsWUFBWSxHQUFHLENBQUM7QUFBQSxNQUMzQixXQUFXLFlBQVksR0FBRyxDQUFDO0FBQUE7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpRkFBaUYsWUFBWTtBQUNqRyxVQUFNLEtBQUssSUFBSSxvQkFBb0I7QUFFbkMsT0FBRyxRQUFRO0FBQUEsTUFDVixRQUFRO0FBQUEsTUFBTSxZQUFZO0FBQUEsTUFBTyxVQUFVO0FBQUEsTUFBVSxNQUFNLGFBQWE7QUFBQSxNQUN4RSxZQUFZO0FBQUEsTUFBVyxjQUFjO0FBQUEsTUFDckMsZUFBZSxhQUFhLFVBQVU7QUFBQSxNQUFHLGNBQWMsYUFBYSxPQUFPO0FBQUEsSUFDNUUsQ0FBQztBQUVELE9BQUcsUUFBUTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVUsTUFBTSxhQUFhO0FBQUEsTUFDeEUsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxPQUFPO0FBQUEsTUFBRyxjQUFjLGFBQWEsY0FBYztBQUFBLElBQ2hGLENBQUM7QUFFRCxVQUFNLGdCQUFvQztBQUFBLE1BQ3pDLFNBQVMsVUFBVSxHQUFHLENBQUM7QUFBQSxJQUN4QjtBQUVBLFVBQU0sY0FBYyxzQkFBc0I7QUFDMUMsVUFBTSxTQUFTLE1BQU07QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxFQUFFLGVBQWUsTUFBTSxjQUFjO0FBQUEsSUFDdEM7QUFHQSxXQUFPLFlBQVksR0FBRyx5QkFBeUIsR0FBRyxvQ0FBb0M7QUFDdEYsV0FBTyxZQUFZLEdBQUcsc0JBQXNCLEdBQUcscUNBQXFDO0FBR3BGLFdBQU8sZ0JBQWdCLE9BQU8sSUFBSSxRQUFRLEdBQUcsQ0FBQyxXQUFXLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQzFFLENBQUM7QUFFRCxPQUFLLCtFQUErRSxZQUFZO0FBQy9GLFVBQU0sS0FBSyxJQUFJLG9CQUFvQjtBQUNuQyxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFVLE1BQU0sYUFBYTtBQUFBLE1BQ3hFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxjQUFjLGFBQWEsU0FBUztBQUFBLElBQ3JDLENBQUM7QUFDRCxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFVLE1BQU0sYUFBYTtBQUFBLE1BQ3hFLGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxlQUFlLGFBQWEsU0FBUztBQUFBLE1BQUcsY0FBYyxhQUFhLFNBQVM7QUFBQSxJQUM3RSxDQUFDO0FBRUQsVUFBTSxnQkFBb0M7QUFBQSxNQUN6QyxTQUFTLFVBQVUsR0FBRyxDQUFDO0FBQUEsSUFDeEI7QUFFQSxVQUFNLGNBQWMsc0JBQXNCO0FBQzFDLFVBQU07QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEVBQUUsZUFBZSxNQUFNLGNBQWM7QUFBQSxJQUN0QztBQUVBLFdBQU8sWUFBWSxHQUFHLHNCQUFzQixHQUFHLDhCQUE4QjtBQUFBLEVBQzlFLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxZQUFZO0FBQ2pGLFVBQU0sS0FBSyxJQUFJLG9CQUFvQjtBQUNuQyxPQUFHLFFBQVE7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUFNLFlBQVk7QUFBQSxNQUFPLFVBQVU7QUFBQSxNQUFVLE1BQU0sYUFBYTtBQUFBLE1BQ3hFLFlBQVk7QUFBQSxNQUFXLGNBQWM7QUFBQSxNQUNyQyxlQUFlLGFBQWEsUUFBUTtBQUFBLE1BQUcsY0FBYyxhQUFhLE9BQU87QUFBQSxJQUMxRSxDQUFDO0FBRUQsVUFBTSxnQkFBb0M7QUFBQSxNQUN6QyxTQUFTLFVBQVUsR0FBRyxDQUFDO0FBQUEsSUFDeEI7QUFFQSxVQUFNLGNBQWMsc0JBQXNCO0FBQzFDLFVBQU0sU0FBUyxNQUFNO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsRUFBRSxlQUFlLE1BQU0sY0FBYztBQUFBLElBQ3RDO0FBRUEsV0FBTyxZQUFZLEdBQUcsc0JBQXNCLEdBQUcsdUJBQXVCO0FBQ3RFLFdBQU8sZ0JBQWdCLFFBQVEsYUFBYTtBQUFBLEVBQzdDLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSx1QkFBdUIsTUFBTTtBQUVsQywwQ0FBd0M7QUFFeEMsUUFBTSxnQkFBZ0I7QUFFdEIsT0FBSyxnREFBZ0QsWUFBWTtBQUNoRSxVQUFNLFNBQVMsTUFBTTtBQUFBLE1BQ3BCLENBQUMsRUFBRSxZQUFZLGtCQUFrQixJQUFJLElBQUksb0JBQW9CLEVBQUUsQ0FBQztBQUFBLE1BQ2hFLHNCQUFzQjtBQUFBLElBQ3ZCO0FBQ0EsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNsQyxDQUFDO0FBRUQsT0FBSyx1REFBdUQsWUFBWTtBQUN2RSxVQUFNLFlBQVksSUFBSSxvQkFBb0I7QUFDMUMsY0FBVSxRQUFRO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQVUsTUFBTSxhQUFhO0FBQUEsTUFDeEUsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxJQUFJO0FBQUEsTUFBRyxjQUFjLGFBQWEsUUFBUTtBQUFBLElBQ3ZFLENBQUM7QUFFRCxVQUFNLFNBQVMsSUFBSSxvQkFBb0I7QUFDdkMsV0FBTyxRQUFRO0FBQUEsTUFDZCxRQUFRO0FBQUEsTUFBTyxZQUFZO0FBQUEsTUFBUSxVQUFVO0FBQUEsTUFBVSxNQUFNLGFBQWE7QUFBQSxNQUMxRSxZQUFZO0FBQUEsTUFBVyxjQUFjO0FBQUEsTUFDckMsZUFBZTtBQUFBLE1BQVcsY0FBYyxhQUFhLFlBQVk7QUFBQSxJQUNsRSxDQUFDO0FBRUQsVUFBTSxTQUFTLE1BQU07QUFBQSxNQUNwQjtBQUFBLFFBQ0MsRUFBRSxZQUFZLGtCQUFrQixJQUFJLFVBQVU7QUFBQSxRQUM5QyxFQUFFLFlBQVksZUFBZSxJQUFJLE9BQU87QUFBQSxNQUN6QztBQUFBLE1BQ0Esc0JBQXNCO0FBQUEsSUFDdkI7QUFFQSxXQUFPO0FBQUEsTUFDTixPQUFPLElBQUksUUFBUSxFQUFFLEtBQUssQ0FBQyxHQUFHLE9BQU8sRUFBRSxPQUFPLElBQUksY0FBYyxFQUFFLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDNUUsQ0FBQyxXQUFXLFVBQVUsR0FBRyxDQUFDLEdBQUcsV0FBVyxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDeEQ7QUFJQSxVQUFNLFdBQVcsT0FBTyxLQUFLLE9BQUssV0FBVyxDQUFDLE1BQU0sSUFBSSxLQUFLLFFBQVEsRUFBRSxTQUFTLENBQUM7QUFDakYsVUFBTSxjQUFjLGtCQUFrQixTQUFTLE1BQU8sUUFBUSxHQUFHO0FBQ2pFLFdBQU8sZ0JBQWdCLGFBQWE7QUFBQSxNQUNuQyxZQUFZO0FBQUEsTUFDWixZQUFZO0FBQUEsTUFDWixVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsSUFDUCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnR0FBZ0csWUFBWTtBQUNoSCxVQUFNLFlBQVksSUFBSSxvQkFBb0I7QUFDMUMsY0FBVSxRQUFRO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQU0sWUFBWTtBQUFBLE1BQU8sVUFBVTtBQUFBLE1BQWUsTUFBTSxhQUFhO0FBQUEsTUFDN0UsWUFBWTtBQUFBLE1BQVcsY0FBYztBQUFBLE1BQ3JDLGVBQWUsYUFBYSxJQUFJO0FBQUEsTUFBRyxjQUFjLGFBQWEsSUFBSTtBQUFBLElBQ25FLENBQUM7QUFFRCxVQUFNLFNBQVMsSUFBSSxvQkFBb0I7QUFDdkMsV0FBTyxRQUFRO0FBQUEsTUFDZCxRQUFRO0FBQUEsTUFBTyxZQUFZO0FBQUEsTUFBUSxVQUFVO0FBQUEsTUFBZSxNQUFNLGFBQWE7QUFBQSxNQUMvRSxZQUFZO0FBQUEsTUFBVyxjQUFjO0FBQUEsTUFDckMsZUFBZSxhQUFhLElBQUk7QUFBQSxNQUFHLGNBQWMsYUFBYSxJQUFJO0FBQUEsSUFDbkUsQ0FBQztBQUVELFVBQU0sU0FBUyxNQUFNO0FBQUEsTUFDcEI7QUFBQSxRQUNDLEVBQUUsWUFBWSxrQkFBa0IsSUFBSSxVQUFVO0FBQUEsUUFDOUMsRUFBRSxZQUFZLGVBQWUsSUFBSSxPQUFPO0FBQUEsTUFDekM7QUFBQSxNQUNBLHNCQUFzQjtBQUFBLElBQ3ZCO0FBRUEsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFVBQU0sQ0FBQyxJQUFJLElBQUk7QUFHZixXQUFPLGdCQUFnQixrQkFBa0IsS0FBSyxPQUFRLFFBQVEsR0FBRyxHQUFHO0FBQUEsTUFDbkUsWUFBWTtBQUFBLE1BQ1osWUFBWTtBQUFBLE1BQ1osVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLElBQ1AsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLGtCQUFrQixLQUFLLE1BQU8sUUFBUSxHQUFHLEdBQUc7QUFBQSxNQUNsRSxZQUFZO0FBQUEsTUFDWixZQUFZO0FBQUEsTUFDWixVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsSUFDUCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
