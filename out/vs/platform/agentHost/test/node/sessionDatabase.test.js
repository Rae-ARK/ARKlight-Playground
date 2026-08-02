import assert from "assert";
import { tmpdir } from "os";
import * as fs from "fs/promises";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { SessionDatabase, runMigrations, sessionDatabaseMigrations } from "../../node/sessionDatabase.js";
import { FileEditKind, MessageKind } from "../../common/state/sessionState.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
suite("SessionDatabase", () => {
  const disposables = new DisposableStore();
  let db;
  let db2;
  teardown(async () => {
    disposables.clear();
    await Promise.all([db?.close(), db2?.close()]);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("initialization", () => {
    test("retries after a transient initialization failure", async () => {
      const tempRoot = await fs.mkdtemp(join(tmpdir(), "session-db-retry-" + generateUuid()));
      try {
        const databaseDir = join(tempRoot, "blocked");
        const databasePath = join(databaseDir, "session.db");
        await fs.writeFile(databaseDir, "");
        const database = new SessionDatabase(databasePath);
        try {
          await assert.rejects(() => database.setMetadata("key", "first"), { code: "EEXIST" });
          await fs.rm(databaseDir);
          await database.setMetadata("key", "second");
          assert.strictEqual(await database.getMetadata("key"), "second");
        } finally {
          await database.close();
        }
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    });
  });
  class TestableSessionDatabase extends SessionDatabase {
    static async open(path, migrations = sessionDatabaseMigrations) {
      const inst = new TestableSessionDatabase(path, migrations);
      await inst._ensureDb();
      return inst;
    }
    async setRawChatDraft(chat, draft) {
      const rawDb = await this._ensureDb();
      await new Promise((resolve, reject) => {
        rawDb.run("INSERT OR REPLACE INTO chat_drafts (chat_uri, draft) VALUES (?, ?)", [chat.toString(), draft], (err) => err ? reject(err) : resolve());
      });
    }
    /** Extract the raw db connection; this instance becomes inert. */
    async ejectDb() {
      const rawDb = await this._ensureDb();
      this._dbPromise = void 0;
      this._closed = true;
      return rawDb;
    }
    /** Create a TestableSessionDatabase wrapping an existing raw db. */
    static async fromDb(rawDb, migrations = sessionDatabaseMigrations) {
      await runMigrations(rawDb, migrations);
      const inst = new TestableSessionDatabase(":memory:", migrations);
      inst._dbPromise = Promise.resolve(rawDb);
      return inst;
    }
  }
  suite("migrations", () => {
    test("applies all migrations on a fresh database", async () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "CREATE TABLE t2 (id INTEGER PRIMARY KEY)" }
      ];
      db = disposables.add(await SessionDatabase.open(":memory:", migrations));
      const tables = (await db.getAllTables()).sort();
      assert.deepStrictEqual(tables, ["t1", "t2"]);
    });
    test("reopening with same migrations is a no-op", async () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" }
      ];
      const db1 = await TestableSessionDatabase.open(":memory:", migrations);
      const rawDb = await db1.ejectDb();
      db2 = disposables.add(await TestableSessionDatabase.fromDb(rawDb, migrations));
      assert.deepStrictEqual(await db2.getAllTables(), ["t1"]);
    });
    test("only applies new migrations on reopen", async () => {
      const v1 = [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" }
      ];
      const db1 = await TestableSessionDatabase.open(":memory:", v1);
      const rawDb = await db1.ejectDb();
      const v2 = [
        ...v1,
        { version: 2, sql: "CREATE TABLE t2 (id INTEGER PRIMARY KEY)" }
      ];
      db2 = disposables.add(await TestableSessionDatabase.fromDb(rawDb, v2));
      const tables = (await db2.getAllTables()).sort();
      assert.deepStrictEqual(tables, ["t1", "t2"]);
    });
    test("rolls back on migration failure", async () => {
      const migrations = [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" },
        { version: 2, sql: "THIS IS INVALID SQL" }
      ];
      await assert.rejects(() => SessionDatabase.open(":memory:", migrations));
      db = disposables.add(await SessionDatabase.open(":memory:", [
        { version: 1, sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY)" }
      ]));
      assert.deepStrictEqual(await db.getAllTables(), ["t1"]);
    });
  });
  suite("file edits", () => {
    test("store and retrieve a file edit", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        beforeContent: new TextEncoder().encode("before"),
        afterContent: new TextEncoder().encode("after"),
        addedLines: 5,
        removedLines: 2
      });
      const edits = await db.getFileEdits(["tc-1"]);
      assert.deepStrictEqual(edits, [{
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        originalPath: void 0,
        addedLines: 5,
        removedLines: 2
      }]);
    });
    test("retrieve multiple edits for a single tool call", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/a.ts",
        beforeContent: new TextEncoder().encode("a-before"),
        afterContent: new TextEncoder().encode("a-after"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/b.ts",
        beforeContent: new TextEncoder().encode("b-before"),
        afterContent: new TextEncoder().encode("b-after"),
        addedLines: 1,
        removedLines: 0
      });
      const edits = await db.getFileEdits(["tc-1"]);
      assert.strictEqual(edits.length, 2);
      assert.strictEqual(edits[0].filePath, "/workspace/a.ts");
      assert.strictEqual(edits[1].filePath, "/workspace/b.ts");
    });
    test("retrieve edits across multiple tool calls", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/a.ts",
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("hello"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-2",
        kind: FileEditKind.Edit,
        filePath: "/workspace/b.ts",
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("world"),
        addedLines: void 0,
        removedLines: void 0
      });
      const edits = await db.getFileEdits(["tc-1", "tc-2"]);
      assert.strictEqual(edits.length, 2);
      const edits2 = await db.getFileEdits(["tc-2"]);
      assert.strictEqual(edits2.length, 1);
      assert.strictEqual(edits2[0].toolCallId, "tc-2");
    });
    test("returns empty array for unknown tool call IDs", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const edits = await db.getFileEdits(["nonexistent"]);
      assert.deepStrictEqual(edits, []);
    });
    test("returns empty array when given empty array", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const edits = await db.getFileEdits([]);
      assert.deepStrictEqual(edits, []);
    });
    test("replace on conflict (same toolCallId + filePath)", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        beforeContent: new TextEncoder().encode("v1"),
        afterContent: new TextEncoder().encode("v1-after"),
        addedLines: 1,
        removedLines: 0
      });
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        beforeContent: new TextEncoder().encode("v2"),
        afterContent: new TextEncoder().encode("v2-after"),
        addedLines: 3,
        removedLines: 1
      });
      const edits = await db.getFileEdits(["tc-1"]);
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(edits[0].addedLines, 3);
      const content = await db.readFileEditContent("tc-1", "/workspace/file.ts");
      assert.ok(content);
      assert.deepStrictEqual(new TextDecoder().decode(content.beforeContent), "v2");
    });
    test("readFileEditContent returns content on demand", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/file.ts",
        beforeContent: new TextEncoder().encode("before"),
        afterContent: new TextEncoder().encode("after"),
        addedLines: void 0,
        removedLines: void 0
      });
      const content = await db.readFileEditContent("tc-1", "/workspace/file.ts");
      assert.ok(content);
      assert.deepStrictEqual(content.beforeContent, new TextEncoder().encode("before"));
      assert.deepStrictEqual(content.afterContent, new TextEncoder().encode("after"));
    });
    test("readFileEditContent returns undefined for missing edit", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const content = await db.readFileEditContent("tc-missing", "/no/such/file");
      assert.strictEqual(content, void 0);
    });
    test("persists binary content correctly", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const binary = new Uint8Array([0, 1, 2, 255, 128, 64]);
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-bin",
        kind: FileEditKind.Edit,
        filePath: "/workspace/image.png",
        beforeContent: new Uint8Array(0),
        afterContent: binary,
        addedLines: void 0,
        removedLines: void 0
      });
      const content = await db.readFileEditContent("tc-bin", "/workspace/image.png");
      assert.ok(content);
      assert.deepStrictEqual(content.afterContent, binary);
    });
    test("auto-creates turn if it does not exist", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.storeFileEdit({
        turnId: "auto-turn",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/x",
        beforeContent: new Uint8Array(0),
        afterContent: new Uint8Array(0),
        addedLines: void 0,
        removedLines: void 0
      });
      const edits = await db.getFileEdits(["tc-1"]);
      assert.strictEqual(edits.length, 1);
      assert.strictEqual(edits[0].turnId, "auto-turn");
    });
  });
  suite("turns", () => {
    test("createTurn is idempotent", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.createTurn("turn-1");
    });
    test("deleteTurn cascades to file edits", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/a.ts",
        beforeContent: new TextEncoder().encode("before"),
        afterContent: new TextEncoder().encode("after"),
        addedLines: void 0,
        removedLines: void 0
      });
      assert.strictEqual((await db.getFileEdits(["tc-1"])).length, 1);
      await db.deleteTurn("turn-1");
      assert.deepStrictEqual(await db.getFileEdits(["tc-1"]), []);
    });
    test("deleteTurn only removes its own edits", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.createTurn("turn-2");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-1",
        kind: FileEditKind.Edit,
        filePath: "/workspace/a.ts",
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("a"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.storeFileEdit({
        turnId: "turn-2",
        toolCallId: "tc-2",
        kind: FileEditKind.Edit,
        filePath: "/workspace/b.ts",
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("b"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.deleteTurn("turn-1");
      assert.deepStrictEqual(await db.getFileEdits(["tc-1"]), []);
      assert.strictEqual((await db.getFileEdits(["tc-2"])).length, 1);
    });
    test("deleteTurn is a no-op for unknown turn", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.deleteTurn("nonexistent");
    });
  });
  suite("turn event ids", () => {
    test("getNextTurnEventId returns the next turn's event id by `turns.id`", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.createTurn("turn-2");
      await db.setTurnEventId("turn-1", "evt-1");
      await db.setTurnEventId("turn-2", "evt-2");
      assert.strictEqual(await db.getNextTurnEventId("turn-1"), "evt-2");
    });
    test("getNextTurnEventId falls back to `event_id` when the key is the SDK event id", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("request_aaa");
      await db.createTurn("request_bbb");
      await db.setTurnEventId("request_aaa", "sdk-evt-1");
      await db.setTurnEventId("request_bbb", "sdk-evt-2");
      assert.strictEqual(await db.getNextTurnEventId("sdk-evt-1"), "sdk-evt-2");
    });
    test("getNextTurnEventId returns undefined for the last turn", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnEventId("turn-1", "evt-1");
      assert.strictEqual(await db.getNextTurnEventId("turn-1"), void 0);
      assert.strictEqual(await db.getNextTurnEventId("evt-1"), void 0);
    });
    test("getNextTurnEventId returns undefined for an unknown key", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnEventId("turn-1", "evt-1");
      assert.strictEqual(await db.getNextTurnEventId("does-not-exist"), void 0);
    });
  });
  suite("turn usage", () => {
    test("getTurnUsages indexes the last usage by both turn id and SDK event id", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("request_aaa");
      await db.createTurn("request_bbb");
      await db.setTurnEventId("request_aaa", "sdk-evt-1");
      await db.setTurnUsage("request_aaa", '{"inputTokens":1}');
      await db.setTurnUsage("request_aaa", '{"inputTokens":2}');
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], [
        ["request_aaa", '{"inputTokens":2}'],
        ["sdk-evt-1", '{"inputTokens":2}']
      ]);
    });
    test("records usage for a turn with no `turns` row, creating one so it can be pruned", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnEventId("turn-1", "evt-1");
      await db.createTurn("turn-2");
      await db.setTurnEventId("turn-2", "evt-2");
      await db.setTurnUsage("usage-only-turn", '{"inputTokens":9}');
      assert.deepStrictEqual({
        usage: (await db.getTurnUsages()).get("usage-only-turn"),
        // Ordering is untouched: turn-1's successor is still turn-2.
        next: await db.getNextTurnEventId("turn-1"),
        first: await db.getFirstTurnEventId()
      }, {
        usage: '{"inputTokens":9}',
        next: "evt-2",
        first: "evt-1"
      });
    });
    test("truncation prunes usage for turns that have no other DB rows", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnUsage("turn-1", '{"inputTokens":1}');
      await db.setTurnUsage("usage-only-2", '{"inputTokens":2}');
      await db.setTurnUsage("usage-only-3", '{"inputTokens":3}');
      await db.deleteTurnsAfter("turn-1");
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], [["turn-1", '{"inputTokens":1}']]);
    });
    test("deleting a session's turns leaves no usage behind", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.setTurnUsage("usage-only-1", '{"inputTokens":1}');
      await db.setTurnUsage("usage-only-2", '{"inputTokens":2}');
      await db.deleteAllTurns();
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], []);
    });
    test("reads see a fire-and-forget write submitted before them", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      const write = db.setTurnUsage("turn-1", '{"inputTokens":7}');
      const usages = await db.getTurnUsages();
      await write;
      assert.deepStrictEqual([...usages.entries()], [["turn-1", '{"inputTokens":7}']]);
    });
    test("truncation prunes the usage of removed turns", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.createTurn("turn-2");
      await db.setTurnUsage("turn-1", '{"inputTokens":1}');
      await db.setTurnUsage("turn-2", '{"inputTokens":2}');
      await db.deleteTurnsAfter("turn-1");
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], [["turn-1", '{"inputTokens":1}']]);
    });
    test("remapTurnIds carries usage onto the forked turn ids and drops the rest", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("old-1");
      await db.createTurn("old-2");
      await db.setTurnUsage("old-1", '{"inputTokens":1}');
      await db.setTurnUsage("old-2", '{"inputTokens":2}');
      await db.remapTurnIds(/* @__PURE__ */ new Map([["old-1", "new-1"]]));
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], [["new-1", '{"inputTokens":1}']]);
    });
  });
  suite("turn checkpoint refs", () => {
    test("getTurnCheckpointRef falls back to `event_id` when the key is the SDK event id", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("request_aaa");
      await db.setTurnEventId("request_aaa", "sdk-evt-1");
      await db.setTurnCheckpointRef("request_aaa", "ref-1");
      assert.strictEqual(await db.getTurnCheckpointRef("sdk-evt-1"), "ref-1");
    });
    test("getPreviousCheckpointRef falls back to `event_id` when the key is the SDK event id", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("request_aaa");
      await db.createTurn("request_bbb");
      await db.setTurnEventId("request_aaa", "sdk-evt-1");
      await db.setTurnEventId("request_bbb", "sdk-evt-2");
      await db.setTurnCheckpointRef("request_aaa", "ref-1");
      await db.setTurnCheckpointRef("request_bbb", "ref-2");
      assert.strictEqual(await db.getPreviousCheckpointRef("sdk-evt-2"), "ref-1");
    });
  });
  suite("dispose", () => {
    test("methods throw after dispose", async () => {
      db = await SessionDatabase.open(":memory:");
      db.close();
      await assert.rejects(
        () => db.createTurn("turn-1"),
        /disposed/
      );
    });
    test("double dispose is safe", async () => {
      db = await SessionDatabase.open(":memory:");
      await db.close();
      await db.close();
    });
  });
  suite("lazy open", () => {
    test("constructor does not open the database", () => {
      db = new SessionDatabase(":memory:");
      disposables.add(db);
    });
    test("first async call opens and migrates the database", async () => {
      db = disposables.add(new SessionDatabase(":memory:"));
      await db.createTurn("turn-1");
      const edits = await db.getFileEdits(["nonexistent"]);
      assert.deepStrictEqual(edits, []);
    });
    test("multiple concurrent calls share the same open promise", async () => {
      db = disposables.add(new SessionDatabase(":memory:"));
      await Promise.all([
        db.createTurn("turn-1"),
        db.createTurn("turn-2"),
        db.getFileEdits([])
      ]);
    });
    test("dispose during open rejects subsequent calls", async () => {
      db = new SessionDatabase(":memory:");
      await db.close();
      await assert.rejects(() => db.createTurn("turn-1"), /disposed/);
    });
  });
  suite("session metadata", () => {
    test("getMetadata returns undefined for missing key", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      assert.strictEqual(await db.getMetadata("nonexistent"), void 0);
    });
    test("setMetadata and getMetadata round-trip", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.setMetadata("customTitle", "My Session");
      assert.strictEqual(await db.getMetadata("customTitle"), "My Session");
    });
    test("setMetadata overwrites existing value", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.setMetadata("customTitle", "First");
      await db.setMetadata("customTitle", "Second");
      assert.strictEqual(await db.getMetadata("customTitle"), "Second");
    });
    test("metadata persists across reopen", async () => {
      const db1 = disposables.add(await TestableSessionDatabase.open(":memory:"));
      await db1.setMetadata("customTitle", "Persistent Title");
      const rawDb = await db1.ejectDb();
      db = disposables.add(await TestableSessionDatabase.fromDb(rawDb));
      assert.strictEqual(await db.getMetadata("customTitle"), "Persistent Title");
    });
    test("migration v2 creates session_metadata table", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const tables = await db.getAllTables();
      assert.ok(tables.includes("session_metadata"));
    });
  });
  suite("chat drafts", () => {
    const chat = URI.parse("ahp-chat://default/Y29waWxvdDovLy9zZXNzaW9uLTE");
    test("setChatDraft and getChatDraft round-trip", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const draft = {
        text: "draft",
        origin: { kind: MessageKind.User },
        model: { id: "opus" },
        agent: { uri: "agent://reviewer" }
      };
      await db.setChatDraft(chat, draft);
      assert.deepStrictEqual(await db.getChatDraft(chat), draft);
    });
    test("setChatDraft undefined clears a draft", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const draft = { text: "draft", origin: { kind: MessageKind.User } };
      await db.setChatDraft(chat, draft);
      await db.setChatDraft(chat, void 0);
      assert.strictEqual(await db.getChatDraft(chat), void 0);
    });
    test("getChatDraft returns undefined for corrupt draft rows", async () => {
      const testDb = disposables.add(await TestableSessionDatabase.open(":memory:"));
      db = testDb;
      await testDb.setRawChatDraft(chat, "{");
      assert.strictEqual(await db.getChatDraft(chat), void 0);
    });
    test("migration v6 creates chat draft tables", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const tables = await db.getAllTables();
      assert.ok(tables.includes("chat_drafts"));
    });
  });
  suite("reviewed files", () => {
    const uriA = URI.parse("file:///workspace/a.ts");
    const uriB = URI.parse("file:///workspace/b.ts");
    const normalize = (records) => records.map((r) => ({ uri: r.uri.toString(), nonce: r.nonce }));
    test("markFileReviewed and isFileReviewed discriminate by uri and nonce", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      assert.deepStrictEqual(
        await Promise.all([
          db.isFileReviewed(uriA, "n1"),
          db.isFileReviewed(uriA, "n2"),
          db.isFileReviewed(uriB, "n1")
        ]),
        [true, false, false]
      );
    });
    test("getReviewedFiles returns all entries in insertion order", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      await db.markFileReviewed(uriB, "n2");
      await db.markFileReviewed(uriA, "n3");
      assert.deepStrictEqual(normalize(await db.getReviewedFiles()), [
        { uri: uriA.toString(), nonce: "n1" },
        { uri: uriB.toString(), nonce: "n2" },
        { uri: uriA.toString(), nonce: "n3" }
      ]);
    });
    test("getReviewedFilesForUri returns only the given uri", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      await db.markFileReviewed(uriB, "n2");
      await db.markFileReviewed(uriA, "n3");
      assert.deepStrictEqual(normalize(await db.getReviewedFilesForUri(uriA)), [
        { uri: uriA.toString(), nonce: "n1" },
        { uri: uriA.toString(), nonce: "n3" }
      ]);
    });
    test("unmarkFileReviewed removes an entry and is a no-op when absent", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      await db.unmarkFileReviewed(uriA, "n1");
      await db.unmarkFileReviewed(uriA, "n1");
      assert.deepStrictEqual(
        await Promise.all([db.isFileReviewed(uriA, "n1"), db.getReviewedFiles()]),
        [false, []]
      );
    });
    test("marking the same (uri, nonce) twice keeps a single entry", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.markFileReviewed(uriA, "n1");
      await db.markFileReviewed(uriA, "n1");
      assert.deepStrictEqual(normalize(await db.getReviewedFiles()), [{ uri: uriA.toString(), nonce: "n1" }]);
    });
    test("migration v7 creates the reviewed_files table", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const tables = await db.getAllTables();
      assert.ok(tables.includes("reviewed_files"));
    });
  });
  suite("vacuumInto", () => {
    let tmpDir;
    setup(async () => {
      tmpDir = await fs.mkdtemp(join(tmpdir(), "session-db-test-" + generateUuid()));
    });
    teardown(async () => {
      await Promise.all([db?.close(), db2?.close()]);
      db = db2 = void 0;
      await fs.rm(tmpDir, { recursive: true, force: true });
    });
    test("produces a copy with the same data", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.setTurnEventId("turn-1", "evt-1");
      await db.setMetadata("key", "value");
      const targetPath = join(tmpDir, "copy.db");
      await db.vacuumInto(targetPath);
      db2 = disposables.add(await SessionDatabase.open(targetPath));
      assert.strictEqual(await db2.getTurnEventId("turn-1"), "evt-1");
      assert.strictEqual(await db2.getMetadata("key"), "value");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2Vzc2lvbkRhdGFiYXNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uRGF0YWJhc2UsIHJ1bk1pZ3JhdGlvbnMsIHNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbnMsIHR5cGUgSVNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbiB9IGZyb20gJy4uLy4uL25vZGUvc2Vzc2lvbkRhdGFiYXNlLmpzJztcbmltcG9ydCB7IEZpbGVFZGl0S2luZCwgTWVzc2FnZUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgSVJldmlld2VkRmlsZVJlY29yZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBEYXRhYmFzZSB9IGZyb20gJ0B2c2NvZGUvc3FsaXRlMyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbnN1aXRlKCdTZXNzaW9uRGF0YWJhc2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBkYjogU2Vzc2lvbkRhdGFiYXNlIHwgdW5kZWZpbmVkO1xuXHRsZXQgZGIyOiBTZXNzaW9uRGF0YWJhc2UgfCB1bmRlZmluZWQ7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2RiPy5jbG9zZSgpLCBkYjI/LmNsb3NlKCldKTtcblx0fSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdpbml0aWFsaXphdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHJpZXMgYWZ0ZXIgYSB0cmFuc2llbnQgaW5pdGlhbGl6YXRpb24gZmFpbHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlbXBSb290ID0gYXdhaXQgZnMubWtkdGVtcChqb2luKHRtcGRpcigpLCAnc2Vzc2lvbi1kYi1yZXRyeS0nICsgZ2VuZXJhdGVVdWlkKCkpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGRhdGFiYXNlRGlyID0gam9pbih0ZW1wUm9vdCwgJ2Jsb2NrZWQnKTtcblx0XHRcdFx0Y29uc3QgZGF0YWJhc2VQYXRoID0gam9pbihkYXRhYmFzZURpciwgJ3Nlc3Npb24uZGInKTtcblx0XHRcdFx0YXdhaXQgZnMud3JpdGVGaWxlKGRhdGFiYXNlRGlyLCAnJyk7XG5cdFx0XHRcdGNvbnN0IGRhdGFiYXNlID0gbmV3IFNlc3Npb25EYXRhYmFzZShkYXRhYmFzZVBhdGgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGRhdGFiYXNlLnNldE1ldGFkYXRhKCdrZXknLCAnZmlyc3QnKSwgeyBjb2RlOiAnRUVYSVNUJyB9KTtcblx0XHRcdFx0XHRhd2FpdCBmcy5ybShkYXRhYmFzZURpcik7XG5cblx0XHRcdFx0XHRhd2FpdCBkYXRhYmFzZS5zZXRNZXRhZGF0YSgna2V5JywgJ3NlY29uZCcpO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRhdGFiYXNlLmdldE1ldGFkYXRhKCdrZXknKSwgJ3NlY29uZCcpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGF3YWl0IGRhdGFiYXNlLmNsb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGF3YWl0IGZzLnJtKHRlbXBSb290LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8qKlxuXHQgKiBFeHRlbmRzIFNlc3Npb25EYXRhYmFzZSB0byBhbGxvdyBlamVjdGluZy9pbmplY3RpbmcgdGhlIHJhdyBzcWxpdGUzXG5cdCAqIERhdGFiYXNlIGluc3RhbmNlLCBlbmFibGluZyByZW9wZW4gdGVzdHMgd2l0aCA6bWVtb3J5OiBkYXRhYmFzZXMuXG5cdCAqL1xuXHRjbGFzcyBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZSBleHRlbmRzIFNlc3Npb25EYXRhYmFzZSB7XG5cdFx0c3RhdGljIG92ZXJyaWRlIGFzeW5jIG9wZW4ocGF0aDogc3RyaW5nLCBtaWdyYXRpb25zOiByZWFkb25seSBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uW10gPSBzZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25zKTogUHJvbWlzZTxUZXN0YWJsZVNlc3Npb25EYXRhYmFzZT4ge1xuXHRcdFx0Y29uc3QgaW5zdCA9IG5ldyBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZShwYXRoLCBtaWdyYXRpb25zKTtcblx0XHRcdGF3YWl0IGluc3QuX2Vuc3VyZURiKCk7XG5cdFx0XHRyZXR1cm4gaW5zdDtcblx0XHR9XG5cblx0XHRhc3luYyBzZXRSYXdDaGF0RHJhZnQoY2hhdDogVVJJLCBkcmFmdDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCByYXdEYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHJhd0RiLnJ1bignSU5TRVJUIE9SIFJFUExBQ0UgSU5UTyBjaGF0X2RyYWZ0cyAoY2hhdF91cmksIGRyYWZ0KSBWQUxVRVMgKD8sID8pJywgW2NoYXQudG9TdHJpbmcoKSwgZHJhZnRdLCBlcnIgPT4gZXJyID8gcmVqZWN0KGVycikgOiByZXNvbHZlKCkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0LyoqIEV4dHJhY3QgdGhlIHJhdyBkYiBjb25uZWN0aW9uOyB0aGlzIGluc3RhbmNlIGJlY29tZXMgaW5lcnQuICovXG5cdFx0YXN5bmMgZWplY3REYigpOiBQcm9taXNlPERhdGFiYXNlPiB7XG5cdFx0XHRjb25zdCByYXdEYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHR0aGlzLl9kYlByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jbG9zZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHJhd0RiO1xuXHRcdH1cblxuXHRcdC8qKiBDcmVhdGUgYSBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZSB3cmFwcGluZyBhbiBleGlzdGluZyByYXcgZGIuICovXG5cdFx0c3RhdGljIGFzeW5jIGZyb21EYihcblx0XHRcdHJhd0RiOiBEYXRhYmFzZSxcblx0XHRcdG1pZ3JhdGlvbnM6IHJlYWRvbmx5IElTZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25bXSA9IHNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbnMsXG5cdFx0KTogUHJvbWlzZTxUZXN0YWJsZVNlc3Npb25EYXRhYmFzZT4ge1xuXHRcdFx0YXdhaXQgcnVuTWlncmF0aW9ucyhyYXdEYiwgbWlncmF0aW9ucyk7XG5cdFx0XHRjb25zdCBpbnN0ID0gbmV3IFRlc3RhYmxlU2Vzc2lvbkRhdGFiYXNlKCc6bWVtb3J5OicsIG1pZ3JhdGlvbnMpO1xuXHRcdFx0aW5zdC5fZGJQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHJhd0RiKTtcblx0XHRcdHJldHVybiBpbnN0O1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gTWlncmF0aW9uIHN5c3RlbSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdtaWdyYXRpb25zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYXBwbGllcyBhbGwgbWlncmF0aW9ucyBvbiBhIGZyZXNoIGRhdGFiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWlncmF0aW9uczogSVNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbltdID0gW1xuXHRcdFx0XHR7IHZlcnNpb246IDEsIHNxbDogJ0NSRUFURSBUQUJMRSB0MSAoaWQgSU5URUdFUiBQUklNQVJZIEtFWSknIH0sXG5cdFx0XHRcdHsgdmVyc2lvbjogMiwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQyIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdF07XG5cblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicsIG1pZ3JhdGlvbnMpKTtcblxuXHRcdFx0Y29uc3QgdGFibGVzID0gKGF3YWl0IGRiLmdldEFsbFRhYmxlcygpKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhYmxlcywgWyd0MScsICd0MiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlb3BlbmluZyB3aXRoIHNhbWUgbWlncmF0aW9ucyBpcyBhIG5vLW9wJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWlncmF0aW9uczogSVNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbltdID0gW1xuXHRcdFx0XHR7IHZlcnNpb246IDEsIHNxbDogJ0NSRUFURSBUQUJMRSB0MSAoaWQgSU5URUdFUiBQUklNQVJZIEtFWSknIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBkYjEgPSBhd2FpdCBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicsIG1pZ3JhdGlvbnMpO1xuXHRcdFx0Y29uc3QgcmF3RGIgPSBhd2FpdCBkYjEuZWplY3REYigpO1xuXG5cdFx0XHQvLyBSZW9wZW4gXHUyMDE0IHNob3VsZCBub3QgdGhyb3cgKHRhYmxlIGFscmVhZHkgZXhpc3RzLCBtaWdyYXRpb24gc2tpcHBlZClcblx0XHRcdGRiMiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZS5mcm9tRGIocmF3RGIsIG1pZ3JhdGlvbnMpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZGIyLmdldEFsbFRhYmxlcygpLCBbJ3QxJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25seSBhcHBsaWVzIG5ldyBtaWdyYXRpb25zIG9uIHJlb3BlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHYxOiBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uW10gPSBbXG5cdFx0XHRcdHsgdmVyc2lvbjogMSwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQxIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBkYjEgPSBhd2FpdCBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicsIHYxKTtcblx0XHRcdGNvbnN0IHJhd0RiID0gYXdhaXQgZGIxLmVqZWN0RGIoKTtcblxuXHRcdFx0Y29uc3QgdjI6IElTZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25bXSA9IFtcblx0XHRcdFx0Li4udjEsXG5cdFx0XHRcdHsgdmVyc2lvbjogMiwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQyIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdF07XG5cdFx0XHRkYjIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgVGVzdGFibGVTZXNzaW9uRGF0YWJhc2UuZnJvbURiKHJhd0RiLCB2MikpO1xuXG5cdFx0XHRjb25zdCB0YWJsZXMgPSAoYXdhaXQgZGIyLmdldEFsbFRhYmxlcygpKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhYmxlcywgWyd0MScsICd0MiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JvbGxzIGJhY2sgb24gbWlncmF0aW9uIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtaWdyYXRpb25zOiBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uW10gPSBbXG5cdFx0XHRcdHsgdmVyc2lvbjogMSwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQxIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdFx0eyB2ZXJzaW9uOiAyLCBzcWw6ICdUSElTIElTIElOVkFMSUQgU1FMJyB9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JywgbWlncmF0aW9ucykpO1xuXG5cdFx0XHQvLyBBIGZyZXNoIDptZW1vcnk6IG9wZW4gd2l0aCB2YWxpZCBtaWdyYXRpb25zIHN1Y2NlZWRzXG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonLCBbXG5cdFx0XHRcdHsgdmVyc2lvbjogMSwgc3FsOiAnQ1JFQVRFIFRBQkxFIHQxIChpZCBJTlRFR0VSIFBSSU1BUlkgS0VZKScgfSxcblx0XHRcdF0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0QWxsVGFibGVzKCksIFsndDEnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gRmlsZSBlZGl0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdmaWxlIGVkaXRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3RvcmUgYW5kIHJldHJpZXZlIGEgZmlsZSBlZGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYmVmb3JlJyksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhZnRlcicpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiA1LFxuXHRcdFx0XHRyZW1vdmVkTGluZXM6IDIsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZWRpdHMgPSBhd2FpdCBkYi5nZXRGaWxlRWRpdHMoWyd0Yy0xJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0cywgW3tcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL2ZpbGUudHMnLFxuXHRcdFx0XHRvcmlnaW5hbFBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdFx0YWRkZWRMaW5lczogNSxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiAyLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0cmlldmUgbXVsdGlwbGUgZWRpdHMgZm9yIGEgc2luZ2xlIHRvb2wgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblxuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zdG9yZUZpbGVFZGl0KHtcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL2EudHMnLFxuXHRcdFx0XHRiZWZvcmVDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ2EtYmVmb3JlJyksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhLWFmdGVyJyksXG5cdFx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYi50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYi1iZWZvcmUnKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ2ItYWZ0ZXInKSxcblx0XHRcdFx0YWRkZWRMaW5lczogMSxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiAwLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMSddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0cy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzWzBdLmZpbGVQYXRoLCAnL3dvcmtzcGFjZS9hLnRzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdHNbMV0uZmlsZVBhdGgsICcvd29ya3NwYWNlL2IudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHJpZXZlIGVkaXRzIGFjcm9zcyBtdWx0aXBsZSB0b29sIGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBVaW50OEFycmF5KDApLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnaGVsbG8nKSxcblx0XHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0yJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9iLnRzJyxcblx0XHRcdFx0YmVmb3JlQ29udGVudDogbmV3IFVpbnQ4QXJyYXkoMCksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCd3b3JsZCcpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMScsICd0Yy0yJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzLmxlbmd0aCwgMik7XG5cblx0XHRcdC8vIE9ubHkgdGMtMlxuXHRcdFx0Y29uc3QgZWRpdHMyID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMiddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0czIubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0czJbMF0udG9vbENhbGxJZCwgJ3RjLTInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgZm9yIHVua25vd24gdG9vbCBjYWxsIElEcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsnbm9uZXhpc3RlbnQnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGFycmF5IHdoZW4gZ2l2ZW4gZW1wdHkgYXJyYXknIC8qIFJlZ3Jlc3Npb24gdGVzdCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMwNjA1NyAqLywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBhd2FpdCBkYi5nZXRGaWxlRWRpdHMoW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0cywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwbGFjZSBvbiBjb25mbGljdCAoc2FtZSB0b29sQ2FsbElkICsgZmlsZVBhdGgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgndjEnKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ3YxLWFmdGVyJyksXG5cdFx0XHRcdGFkZGVkTGluZXM6IDEsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogMCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdFx0YmVmb3JlQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCd2MicpLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgndjItYWZ0ZXInKSxcblx0XHRcdFx0YWRkZWRMaW5lczogMyxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiAxLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMSddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzWzBdLmFkZGVkTGluZXMsIDMpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZGIucmVhZEZpbGVFZGl0Q29udGVudCgndGMtMScsICcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGNvbnRlbnQuYmVmb3JlQ29udGVudCksICd2MicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZEZpbGVFZGl0Q29udGVudCByZXR1cm5zIGNvbnRlbnQgb24gZGVtYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYmVmb3JlJyksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhZnRlcicpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBkYi5yZWFkRmlsZUVkaXRDb250ZW50KCd0Yy0xJywgJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZW50LmJlZm9yZUNvbnRlbnQsIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYmVmb3JlJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZW50LmFmdGVyQ29udGVudCwgbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhZnRlcicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRGaWxlRWRpdENvbnRlbnQgcmV0dXJucyB1bmRlZmluZWQgZm9yIG1pc3NpbmcgZWRpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBkYi5yZWFkRmlsZUVkaXRDb250ZW50KCd0Yy1taXNzaW5nJywgJy9uby9zdWNoL2ZpbGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVyc2lzdHMgYmluYXJ5IGNvbnRlbnQgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3QgYmluYXJ5ID0gbmV3IFVpbnQ4QXJyYXkoWzAsIDEsIDIsIDI1NSwgMTI4LCA2NF0pO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYmluJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9pbWFnZS5wbmcnLFxuXHRcdFx0XHRiZWZvcmVDb250ZW50OiBuZXcgVWludDhBcnJheSgwKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBiaW5hcnksXG5cdFx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGRiLnJlYWRGaWxlRWRpdENvbnRlbnQoJ3RjLWJpbicsICcvd29ya3NwYWNlL2ltYWdlLnBuZycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZW50LmFmdGVyQ29udGVudCwgYmluYXJ5KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dG8tY3JlYXRlcyB0dXJuIGlmIGl0IGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHQvLyBzdG9yZUZpbGVFZGl0IHNob3VsZCBzdWNjZWVkIGV2ZW4gd2l0aG91dCBhIHByaW9yIGNyZWF0ZVR1cm4gY2FsbFxuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ2F1dG8tdHVybicsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3gnLFxuXHRcdFx0XHRiZWZvcmVDb250ZW50OiBuZXcgVWludDhBcnJheSgwKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBuZXcgVWludDhBcnJheSgwKSxcblx0XHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IGRiLmdldEZpbGVFZGl0cyhbJ3RjLTEnXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0c1swXS50dXJuSWQsICdhdXRvLXR1cm4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBUdXJucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3R1cm5zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY3JlYXRlVHVybiBpcyBpZGVtcG90ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTsgLy8gc2hvdWxkIG5vdCB0aHJvd1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlVHVybiBjYXNjYWRlcyB0byBmaWxlIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYS50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYmVmb3JlJyksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhZnRlcicpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEVkaXRzIGV4aXN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGRiLmdldEZpbGVFZGl0cyhbJ3RjLTEnXSkpLmxlbmd0aCwgMSk7XG5cblx0XHRcdC8vIERlbGV0ZSB0aGUgdHVybiBcdTIwMTQgZWRpdHMgc2hvdWxkIGJlIGdvbmVcblx0XHRcdGF3YWl0IGRiLmRlbGV0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBkYi5nZXRGaWxlRWRpdHMoWyd0Yy0xJ10pLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGVUdXJuIG9ubHkgcmVtb3ZlcyBpdHMgb3duIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMicpO1xuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9hLnRzJyxcblx0XHRcdFx0YmVmb3JlQ29udGVudDogbmV3IFVpbnQ4QXJyYXkoMCksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhJyksXG5cdFx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMicsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYi50cycsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBVaW50OEFycmF5KDApLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYicpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGRiLmRlbGV0ZVR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGRiLmdldEZpbGVFZGl0cyhbJ3RjLTEnXSksIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZGIuZ2V0RmlsZUVkaXRzKFsndGMtMiddKSkubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0ZVR1cm4gaXMgYSBuby1vcCBmb3IgdW5rbm93biB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuZGVsZXRlVHVybignbm9uZXhpc3RlbnQnKTsgLy8gc2hvdWxkIG5vdCB0aHJvd1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFR1cm4gZXZlbnQgaWRzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndHVybiBldmVudCBpZHMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdnZXROZXh0VHVybkV2ZW50SWQgcmV0dXJucyB0aGUgbmV4dCB0dXJuXFwncyBldmVudCBpZCBieSBgdHVybnMuaWRgJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTInKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5FdmVudElkKCd0dXJuLTEnLCAnZXZ0LTEnKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5FdmVudElkKCd0dXJuLTInLCAnZXZ0LTInKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldE5leHRUdXJuRXZlbnRJZCgndHVybi0xJyksICdldnQtMicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0TmV4dFR1cm5FdmVudElkIGZhbGxzIGJhY2sgdG8gYGV2ZW50X2lkYCB3aGVuIHRoZSBrZXkgaXMgdGhlIFNESyBldmVudCBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFNlc3Npb25zIHJlc3RvcmVkIGZyb20gZGlzayBzdXJmYWNlIFNESyBlbnZlbG9wZSBpZHMgYXMgdGhlXG5cdFx0XHQvLyBwcm90b2NvbCB0dXJuIGlkIChzZWUgbWFwU2Vzc2lvbkV2ZW50cy50cyksIGJ1dCBgdHVybnMuaWRgXG5cdFx0XHQvLyB3YXMgcG9wdWxhdGVkIGxpdmUgd2l0aCB0aGUgY2xpZW50LXNpZGUgYHJlcXVlc3RfeHh4YCBpZC5cblx0XHRcdC8vIFRoZSBmYWxsYmFjayBsZXRzIGZvcmsgLyB0cnVuY2F0ZSByZXNvbHZlIHRoZSBib3VuZGFyeVxuXHRcdFx0Ly8gd2l0aG91dCBmb3JjaW5nIGV2ZXJ5IGNhbGxlciB0byB0cmFuc2xhdGUuXG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCdyZXF1ZXN0X2FhYScpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigncmVxdWVzdF9iYmInKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5FdmVudElkKCdyZXF1ZXN0X2FhYScsICdzZGstZXZ0LTEnKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5FdmVudElkKCdyZXF1ZXN0X2JiYicsICdzZGstZXZ0LTInKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldE5leHRUdXJuRXZlbnRJZCgnc2RrLWV2dC0xJyksICdzZGstZXZ0LTInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldE5leHRUdXJuRXZlbnRJZCByZXR1cm5zIHVuZGVmaW5lZCBmb3IgdGhlIGxhc3QgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkV2ZW50SWQoJ3R1cm4tMScsICdldnQtMScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0TmV4dFR1cm5FdmVudElkKCd0dXJuLTEnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXROZXh0VHVybkV2ZW50SWQoJ2V2dC0xJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXROZXh0VHVybkV2ZW50SWQgcmV0dXJucyB1bmRlZmluZWQgZm9yIGFuIHVua25vd24ga2V5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgndHVybi0xJywgJ2V2dC0xJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXROZXh0VHVybkV2ZW50SWQoJ2RvZXMtbm90LWV4aXN0JyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gVHVybiB1c2FnZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndHVybiB1c2FnZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2dldFR1cm5Vc2FnZXMgaW5kZXhlcyB0aGUgbGFzdCB1c2FnZSBieSBib3RoIHR1cm4gaWQgYW5kIFNESyBldmVudCBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3JlcXVlc3RfYWFhJyk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCdyZXF1ZXN0X2JiYicpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkV2ZW50SWQoJ3JlcXVlc3RfYWFhJywgJ3Nkay1ldnQtMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVyblVzYWdlKCdyZXF1ZXN0X2FhYScsICd7XCJpbnB1dFRva2Vuc1wiOjF9Jyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuVXNhZ2UoJ3JlcXVlc3RfYWFhJywgJ3tcImlucHV0VG9rZW5zXCI6Mn0nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uKGF3YWl0IGRiLmdldFR1cm5Vc2FnZXMoKSkuZW50cmllcygpXSwgW1xuXHRcdFx0XHRbJ3JlcXVlc3RfYWFhJywgJ3tcImlucHV0VG9rZW5zXCI6Mn0nXSxcblx0XHRcdFx0WydzZGstZXZ0LTEnLCAne1wiaW5wdXRUb2tlbnNcIjoyfSddLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNvcmRzIHVzYWdlIGZvciBhIHR1cm4gd2l0aCBubyBgdHVybnNgIHJvdywgY3JlYXRpbmcgb25lIHNvIGl0IGNhbiBiZSBwcnVuZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBBIHR1cm4gY2FuIHJlcG9ydCB1c2FnZSB3aXRob3V0IG90aGVyd2lzZSB0b3VjaGluZyB0aGUgREIgKGUuZy4gYVxuXHRcdFx0Ly8gQ2xhdWRlIHR1cm4gdGhhdCBlZGl0cyBubyBmaWxlcykuIFRoZSBwYXJlbnQgcm93IGlzIGNyZWF0ZWQgc28gdGhlXG5cdFx0XHQvLyB1c2FnZSBpcyByZWFjaGFibGUgYnkgdGhlIGNhc2NhZGU7IHdpdGhvdXQgaXQgdGhlIHJvdyB3b3VsZCBzdXJ2aXZlXG5cdFx0XHQvLyBldmVyeSBwcnVuZSBwYXRoIGFuZCB0aGUgdGFibGUgd291bGQgZ3JvdyBmb3IgdGhlIGxpZmUgb2YgdGhlXG5cdFx0XHQvLyBzZXNzaW9uLiBDcmVhdGluZyBpdCBjYW5ub3QgZGlzdHVyYiB0aGUgdHVybiBvcmRlcmluZyB0aGF0XG5cdFx0XHQvLyBgZ2V0TmV4dFR1cm5FdmVudElkYCAvIGNoZWNrcG9pbnQgcmVzb2x1dGlvbiByZWx5IG9uLCBiZWNhdXNlIGFcblx0XHRcdC8vIHR1cm4ncyB1c2FnZSBpcyBhbHdheXMgcmVwb3J0ZWQgYmVmb3JlIHRoZSBuZXh0IHR1cm4gYmVnaW5zLlxuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuRXZlbnRJZCgndHVybi0xJywgJ2V2dC0xJyk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTInKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5FdmVudElkKCd0dXJuLTInLCAnZXZ0LTInKTtcblxuXHRcdFx0YXdhaXQgZGIuc2V0VHVyblVzYWdlKCd1c2FnZS1vbmx5LXR1cm4nLCAne1wiaW5wdXRUb2tlbnNcIjo5fScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dXNhZ2U6IChhd2FpdCBkYi5nZXRUdXJuVXNhZ2VzKCkpLmdldCgndXNhZ2Utb25seS10dXJuJyksXG5cdFx0XHRcdC8vIE9yZGVyaW5nIGlzIHVudG91Y2hlZDogdHVybi0xJ3Mgc3VjY2Vzc29yIGlzIHN0aWxsIHR1cm4tMi5cblx0XHRcdFx0bmV4dDogYXdhaXQgZGIuZ2V0TmV4dFR1cm5FdmVudElkKCd0dXJuLTEnKSxcblx0XHRcdFx0Zmlyc3Q6IGF3YWl0IGRiLmdldEZpcnN0VHVybkV2ZW50SWQoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dXNhZ2U6ICd7XCJpbnB1dFRva2Vuc1wiOjl9Jyxcblx0XHRcdFx0bmV4dDogJ2V2dC0yJyxcblx0XHRcdFx0Zmlyc3Q6ICdldnQtMScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydW5jYXRpb24gcHJ1bmVzIHVzYWdlIGZvciB0dXJucyB0aGF0IGhhdmUgbm8gb3RoZXIgREIgcm93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSB1bmJvdW5kZWQtZ3Jvd3RoIGNhc2U6IHR1cm5zIHdob3NlIG9ubHkgREIgZm9vdHByaW50IGlzIHRoZWlyXG5cdFx0XHQvLyB1c2FnZSByb3cuIFRoZXkgbXVzdCBiZSBwcnVuZWQgYnkgYSByZXdpbmQgbGlrZSBhbnkgb3RoZXIgdHVybi5cblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVyblVzYWdlKCd0dXJuLTEnLCAne1wiaW5wdXRUb2tlbnNcIjoxfScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVyblVzYWdlKCd1c2FnZS1vbmx5LTInLCAne1wiaW5wdXRUb2tlbnNcIjoyfScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVyblVzYWdlKCd1c2FnZS1vbmx5LTMnLCAne1wiaW5wdXRUb2tlbnNcIjozfScpO1xuXG5cdFx0XHRhd2FpdCBkYi5kZWxldGVUdXJuc0FmdGVyKCd0dXJuLTEnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uKGF3YWl0IGRiLmdldFR1cm5Vc2FnZXMoKSkuZW50cmllcygpXSwgW1sndHVybi0xJywgJ3tcImlucHV0VG9rZW5zXCI6MX0nXV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRpbmcgYSBzZXNzaW9uXFwncyB0dXJucyBsZWF2ZXMgbm8gdXNhZ2UgYmVoaW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVyblVzYWdlKCd1c2FnZS1vbmx5LTEnLCAne1wiaW5wdXRUb2tlbnNcIjoxfScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVyblVzYWdlKCd1c2FnZS1vbmx5LTInLCAne1wiaW5wdXRUb2tlbnNcIjoyfScpO1xuXG5cdFx0XHRhd2FpdCBkYi5kZWxldGVBbGxUdXJucygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi4oYXdhaXQgZGIuZ2V0VHVyblVzYWdlcygpKS5lbnRyaWVzKCldLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkcyBzZWUgYSBmaXJlLWFuZC1mb3JnZXQgd3JpdGUgc3VibWl0dGVkIGJlZm9yZSB0aGVtJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gYHNldFR1cm5Vc2FnZWAgaXMgZGVsaWJlcmF0ZWx5IGZpcmUtYW5kLWZvcmdldCBhbmQgc3FsaXRlMyBydW5zIHBhcmFsbGVsaXplZCwgc28gdGhlXG5cdFx0XHQvLyByZXN0b3JlIHJlYWQgbXVzdCBxdWV1ZSBiZWhpbmQgcHJpb3Igd3JpdGVzLiBXaXRob3V0IHRoYXQgb3JkZXJpbmcgYSByZWNvbm5lY3QgY2FuXG5cdFx0XHQvLyByZWFkIGZpcnN0IGFuZCBwZXJtYW5lbnRseSByZWJ1aWxkIHRoZSB0dXJuIHdpdGhvdXQgaXRzIGNvc3QuXG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0Y29uc3Qgd3JpdGUgPSBkYi5zZXRUdXJuVXNhZ2UoJ3R1cm4tMScsICd7XCJpbnB1dFRva2Vuc1wiOjd9Jyk7XG5cdFx0XHRjb25zdCB1c2FnZXMgPSBhd2FpdCBkYi5nZXRUdXJuVXNhZ2VzKCk7XG5cdFx0XHRhd2FpdCB3cml0ZTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4udXNhZ2VzLmVudHJpZXMoKV0sIFtbJ3R1cm4tMScsICd7XCJpbnB1dFRva2Vuc1wiOjd9J11dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydW5jYXRpb24gcHJ1bmVzIHRoZSB1c2FnZSBvZiByZW1vdmVkIHR1cm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTInKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgndHVybi0xJywgJ3tcImlucHV0VG9rZW5zXCI6MX0nKTtcblx0XHRcdGF3YWl0IGRiLnNldFR1cm5Vc2FnZSgndHVybi0yJywgJ3tcImlucHV0VG9rZW5zXCI6Mn0nKTtcblxuXHRcdFx0YXdhaXQgZGIuZGVsZXRlVHVybnNBZnRlcigndHVybi0xJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLihhd2FpdCBkYi5nZXRUdXJuVXNhZ2VzKCkpLmVudHJpZXMoKV0sIFtbJ3R1cm4tMScsICd7XCJpbnB1dFRva2Vuc1wiOjF9J11dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbWFwVHVybklkcyBjYXJyaWVzIHVzYWdlIG9udG8gdGhlIGZvcmtlZCB0dXJuIGlkcyBhbmQgZHJvcHMgdGhlIHJlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBGb3JrIGZpbGUtY29waWVzIHRoZSBzb3VyY2UgZGF0YWJhc2UgdGhlbiByZW1hcHMgdHVybiBpZHMuIFdpdGhvdXRcblx0XHRcdC8vIHJlbWFwcGluZyBgdHVybl91c2FnZWAgdGhlIGZvcmtlZCBzZXNzaW9uIHJlc3RvcmVzIHdpdGggbm8gZ2F1Z2Vcblx0XHRcdC8vIGFuZCB6ZXJvIGNvc3QsIGFuZCByb3dzIHBhc3QgdGhlIGZvcmsgcG9pbnQgbGVhayBwZXJtYW5lbnRseVxuXHRcdFx0Ly8gKGV2ZXJ5IHBydW5lIHBhdGggam9pbnMgdGhyb3VnaCBgdHVybnNgKS5cblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ29sZC0xJyk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCdvbGQtMicpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVyblVzYWdlKCdvbGQtMScsICd7XCJpbnB1dFRva2Vuc1wiOjF9Jyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuVXNhZ2UoJ29sZC0yJywgJ3tcImlucHV0VG9rZW5zXCI6Mn0nKTtcblxuXHRcdFx0Ly8gRm9yayBrZWVwaW5nIG9ubHkgYG9sZC0xYCwgcmVtYXBwZWQgdG8gYSBmcmVzaCBpZC5cblx0XHRcdGF3YWl0IGRiLnJlbWFwVHVybklkcyhuZXcgTWFwKFtbJ29sZC0xJywgJ25ldy0xJ11dKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLihhd2FpdCBkYi5nZXRUdXJuVXNhZ2VzKCkpLmVudHJpZXMoKV0sIFtbJ25ldy0xJywgJ3tcImlucHV0VG9rZW5zXCI6MX0nXV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFR1cm4gY2hlY2twb2ludCByZWZzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndHVybiBjaGVja3BvaW50IHJlZnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdnZXRUdXJuQ2hlY2twb2ludFJlZiBmYWxscyBiYWNrIHRvIGBldmVudF9pZGAgd2hlbiB0aGUga2V5IGlzIHRoZSBTREsgZXZlbnQgaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCdyZXF1ZXN0X2FhYScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkV2ZW50SWQoJ3JlcXVlc3RfYWFhJywgJ3Nkay1ldnQtMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkNoZWNrcG9pbnRSZWYoJ3JlcXVlc3RfYWFhJywgJ3JlZi0xJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXRUdXJuQ2hlY2twb2ludFJlZignc2RrLWV2dC0xJyksICdyZWYtMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UHJldmlvdXNDaGVja3BvaW50UmVmIGZhbGxzIGJhY2sgdG8gYGV2ZW50X2lkYCB3aGVuIHRoZSBrZXkgaXMgdGhlIFNESyBldmVudCBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3JlcXVlc3RfYWFhJyk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCdyZXF1ZXN0X2JiYicpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkV2ZW50SWQoJ3JlcXVlc3RfYWFhJywgJ3Nkay1ldnQtMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkV2ZW50SWQoJ3JlcXVlc3RfYmJiJywgJ3Nkay1ldnQtMicpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkNoZWNrcG9pbnRSZWYoJ3JlcXVlc3RfYWFhJywgJ3JlZi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zZXRUdXJuQ2hlY2twb2ludFJlZigncmVxdWVzdF9iYmInLCAncmVmLTInKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiLmdldFByZXZpb3VzQ2hlY2twb2ludFJlZignc2RrLWV2dC0yJyksICdyZWYtMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIERpc3Bvc2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZGlzcG9zZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ21ldGhvZHMgdGhyb3cgYWZ0ZXIgZGlzcG9zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6Jyk7XG5cdFx0XHRkYi5jbG9zZSgpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gZGIhLmNyZWF0ZVR1cm4oJ3R1cm4tMScpLFxuXHRcdFx0XHQvZGlzcG9zZWQvLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvdWJsZSBkaXNwb3NlIGlzIHNhZmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpO1xuXHRcdFx0YXdhaXQgZGIuY2xvc2UoKTtcblx0XHRcdGF3YWl0IGRiLmNsb3NlKCk7IC8vIHNob3VsZCBub3QgdGhyb3dcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBMYXp5IG9wZW4gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2xhenkgb3BlbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NvbnN0cnVjdG9yIGRvZXMgbm90IG9wZW4gdGhlIGRhdGFiYXNlJywgKCkgPT4ge1xuXHRcdFx0ZGIgPSBuZXcgU2Vzc2lvbkRhdGFiYXNlKCc6bWVtb3J5OicpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRiKTtcblx0XHRcdC8vIE5vIGVycm9yIFx1MjAxNCB0aGUgZGF0YWJhc2UgaXMgbm90IG9wZW5lZCB1bnRpbCBmaXJzdCB1c2Vcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpcnN0IGFzeW5jIGNhbGwgb3BlbnMgYW5kIG1pZ3JhdGVzIHRoZSBkYXRhYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IGRiLmdldEZpbGVFZGl0cyhbJ25vbmV4aXN0ZW50J10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0cywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgY29uY3VycmVudCBjYWxscyBzaGFyZSB0aGUgc2FtZSBvcGVuIHByb21pc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbkRhdGFiYXNlKCc6bWVtb3J5OicpKTtcblx0XHRcdC8vIEZpcmUgbXVsdGlwbGUgY2FsbHMgY29uY3VycmVudGx5IFx1MjAxNCBhbGwgc2hvdWxkIHN1Y2NlZWRcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0ZGIuY3JlYXRlVHVybigndHVybi0xJyksXG5cdFx0XHRcdGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMicpLFxuXHRcdFx0XHRkYi5nZXRGaWxlRWRpdHMoW10pLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlIGR1cmluZyBvcGVuIHJlamVjdHMgc3Vic2VxdWVudCBjYWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gbmV3IFNlc3Npb25EYXRhYmFzZSgnOm1lbW9yeTonKTtcblx0XHRcdGF3YWl0IGRiLmNsb3NlKCk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBkYiEuY3JlYXRlVHVybigndHVybi0xJyksIC9kaXNwb3NlZC8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gbWV0YWRhdGEgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnc2Vzc2lvbiBtZXRhZGF0YScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2dldE1ldGFkYXRhIHJldHVybnMgdW5kZWZpbmVkIGZvciBtaXNzaW5nIGtleScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXRNZXRhZGF0YSgnbm9uZXhpc3RlbnQnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NldE1ldGFkYXRhIGFuZCBnZXRNZXRhZGF0YSByb3VuZC10cmlwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuc2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJywgJ015IFNlc3Npb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSwgJ015IFNlc3Npb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NldE1ldGFkYXRhIG92ZXJ3cml0ZXMgZXhpc3RpbmcgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5zZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnLCAnRmlyc3QnKTtcblx0XHRcdGF3YWl0IGRiLnNldE1ldGFkYXRhKCdjdXN0b21UaXRsZScsICdTZWNvbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSwgJ1NlY29uZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWV0YWRhdGEgcGVyc2lzdHMgYWNyb3NzIHJlb3BlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRiMSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiMS5zZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnLCAnUGVyc2lzdGVudCBUaXRsZScpO1xuXHRcdFx0Y29uc3QgcmF3RGIgPSBhd2FpdCBkYjEuZWplY3REYigpO1xuXG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBUZXN0YWJsZVNlc3Npb25EYXRhYmFzZS5mcm9tRGIocmF3RGIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSwgJ1BlcnNpc3RlbnQgVGl0bGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pZ3JhdGlvbiB2MiBjcmVhdGVzIHNlc3Npb25fbWV0YWRhdGEgdGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRjb25zdCB0YWJsZXMgPSBhd2FpdCBkYi5nZXRBbGxUYWJsZXMoKTtcblx0XHRcdGFzc2VydC5vayh0YWJsZXMuaW5jbHVkZXMoJ3Nlc3Npb25fbWV0YWRhdGEnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjaGF0IGRyYWZ0cycsICgpID0+IHtcblx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKCdhaHAtY2hhdDovL2RlZmF1bHQvWTI5d2FXeHZkRG92THk5elpYTnphVzl1TFRFJyk7XG5cblx0XHR0ZXN0KCdzZXRDaGF0RHJhZnQgYW5kIGdldENoYXREcmFmdCByb3VuZC10cmlwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3QgZHJhZnQgPSB7XG5cdFx0XHRcdHRleHQ6ICdkcmFmdCcsXG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdG1vZGVsOiB7IGlkOiAnb3B1cycgfSxcblx0XHRcdFx0YWdlbnQ6IHsgdXJpOiAnYWdlbnQ6Ly9yZXZpZXdlcicgfSxcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGRiLnNldENoYXREcmFmdChjaGF0LCBkcmFmdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0Q2hhdERyYWZ0KGNoYXQpLCBkcmFmdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRDaGF0RHJhZnQgdW5kZWZpbmVkIGNsZWFycyBhIGRyYWZ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0Y29uc3QgZHJhZnQgPSB7IHRleHQ6ICdkcmFmdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfTtcblxuXHRcdFx0YXdhaXQgZGIuc2V0Q2hhdERyYWZ0KGNoYXQsIGRyYWZ0KTtcblx0XHRcdGF3YWl0IGRiLnNldENoYXREcmFmdChjaGF0LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0Q2hhdERyYWZ0KGNoYXQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0Q2hhdERyYWZ0IHJldHVybnMgdW5kZWZpbmVkIGZvciBjb3JydXB0IGRyYWZ0IHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0RGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgVGVzdGFibGVTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRkYiA9IHRlc3REYjtcblxuXHRcdFx0YXdhaXQgdGVzdERiLnNldFJhd0NoYXREcmFmdChjaGF0LCAneycpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0Q2hhdERyYWZ0KGNoYXQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWlncmF0aW9uIHY2IGNyZWF0ZXMgY2hhdCBkcmFmdCB0YWJsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRjb25zdCB0YWJsZXMgPSBhd2FpdCBkYi5nZXRBbGxUYWJsZXMoKTtcblx0XHRcdGFzc2VydC5vayh0YWJsZXMuaW5jbHVkZXMoJ2NoYXRfZHJhZnRzJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHJldmlld2VkIGZpbGVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncmV2aWV3ZWQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpQSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvYS50cycpO1xuXHRcdGNvbnN0IHVyaUIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL2IudHMnKTtcblxuXHRcdGNvbnN0IG5vcm1hbGl6ZSA9IChyZWNvcmRzOiByZWFkb25seSBJUmV2aWV3ZWRGaWxlUmVjb3JkW10pID0+IHJlY29yZHMubWFwKHIgPT4gKHsgdXJpOiByLnVyaS50b1N0cmluZygpLCBub25jZTogci5ub25jZSB9KSk7XG5cblx0XHR0ZXN0KCdtYXJrRmlsZVJldmlld2VkIGFuZCBpc0ZpbGVSZXZpZXdlZCBkaXNjcmltaW5hdGUgYnkgdXJpIGFuZCBub25jZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblxuXHRcdFx0YXdhaXQgZGIubWFya0ZpbGVSZXZpZXdlZCh1cmlBLCAnbjEnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdGRiLmlzRmlsZVJldmlld2VkKHVyaUEsICduMScpLFxuXHRcdFx0XHRcdGRiLmlzRmlsZVJldmlld2VkKHVyaUEsICduMicpLFxuXHRcdFx0XHRcdGRiLmlzRmlsZVJldmlld2VkKHVyaUIsICduMScpLFxuXHRcdFx0XHRdKSxcblx0XHRcdFx0W3RydWUsIGZhbHNlLCBmYWxzZV0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UmV2aWV3ZWRGaWxlcyByZXR1cm5zIGFsbCBlbnRyaWVzIGluIGluc2VydGlvbiBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblxuXHRcdFx0YXdhaXQgZGIubWFya0ZpbGVSZXZpZXdlZCh1cmlBLCAnbjEnKTtcblx0XHRcdGF3YWl0IGRiLm1hcmtGaWxlUmV2aWV3ZWQodXJpQiwgJ24yJyk7XG5cdFx0XHRhd2FpdCBkYi5tYXJrRmlsZVJldmlld2VkKHVyaUEsICduMycpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vcm1hbGl6ZShhd2FpdCBkYi5nZXRSZXZpZXdlZEZpbGVzKCkpLCBbXG5cdFx0XHRcdHsgdXJpOiB1cmlBLnRvU3RyaW5nKCksIG5vbmNlOiAnbjEnIH0sXG5cdFx0XHRcdHsgdXJpOiB1cmlCLnRvU3RyaW5nKCksIG5vbmNlOiAnbjInIH0sXG5cdFx0XHRcdHsgdXJpOiB1cmlBLnRvU3RyaW5nKCksIG5vbmNlOiAnbjMnIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFJldmlld2VkRmlsZXNGb3JVcmkgcmV0dXJucyBvbmx5IHRoZSBnaXZlbiB1cmknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cblx0XHRcdGF3YWl0IGRiLm1hcmtGaWxlUmV2aWV3ZWQodXJpQSwgJ24xJyk7XG5cdFx0XHRhd2FpdCBkYi5tYXJrRmlsZVJldmlld2VkKHVyaUIsICduMicpO1xuXHRcdFx0YXdhaXQgZGIubWFya0ZpbGVSZXZpZXdlZCh1cmlBLCAnbjMnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub3JtYWxpemUoYXdhaXQgZGIuZ2V0UmV2aWV3ZWRGaWxlc0ZvclVyaSh1cmlBKSksIFtcblx0XHRcdFx0eyB1cmk6IHVyaUEudG9TdHJpbmcoKSwgbm9uY2U6ICduMScgfSxcblx0XHRcdFx0eyB1cmk6IHVyaUEudG9TdHJpbmcoKSwgbm9uY2U6ICduMycgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5tYXJrRmlsZVJldmlld2VkIHJlbW92ZXMgYW4gZW50cnkgYW5kIGlzIGEgbm8tb3Agd2hlbiBhYnNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cblx0XHRcdGF3YWl0IGRiLm1hcmtGaWxlUmV2aWV3ZWQodXJpQSwgJ24xJyk7XG5cdFx0XHRhd2FpdCBkYi51bm1hcmtGaWxlUmV2aWV3ZWQodXJpQSwgJ24xJyk7XG5cdFx0XHRhd2FpdCBkYi51bm1hcmtGaWxlUmV2aWV3ZWQodXJpQSwgJ24xJyk7IC8vIG5vLW9wLCBtdXN0IG5vdCB0aHJvd1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbZGIuaXNGaWxlUmV2aWV3ZWQodXJpQSwgJ24xJyksIGRiLmdldFJldmlld2VkRmlsZXMoKV0pLFxuXHRcdFx0XHRbZmFsc2UsIFtdXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJraW5nIHRoZSBzYW1lICh1cmksIG5vbmNlKSB0d2ljZSBrZWVwcyBhIHNpbmdsZSBlbnRyeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblxuXHRcdFx0YXdhaXQgZGIubWFya0ZpbGVSZXZpZXdlZCh1cmlBLCAnbjEnKTtcblx0XHRcdGF3YWl0IGRiLm1hcmtGaWxlUmV2aWV3ZWQodXJpQSwgJ24xJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9ybWFsaXplKGF3YWl0IGRiLmdldFJldmlld2VkRmlsZXMoKSksIFt7IHVyaTogdXJpQS50b1N0cmluZygpLCBub25jZTogJ24xJyB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWdyYXRpb24gdjcgY3JlYXRlcyB0aGUgcmV2aWV3ZWRfZmlsZXMgdGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRjb25zdCB0YWJsZXMgPSBhd2FpdCBkYi5nZXRBbGxUYWJsZXMoKTtcblx0XHRcdGFzc2VydC5vayh0YWJsZXMuaW5jbHVkZXMoJ3Jldmlld2VkX2ZpbGVzJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHZhY3V1bUludG8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndmFjdXVtSW50bycsICgpID0+IHtcblxuXHRcdGxldCB0bXBEaXI6IHN0cmluZztcblxuXHRcdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRcdHRtcERpciA9IGF3YWl0IGZzLm1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ3Nlc3Npb24tZGItdGVzdC0nICsgZ2VuZXJhdGVVdWlkKCkpKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtkYj8uY2xvc2UoKSwgZGIyPy5jbG9zZSgpXSk7XG5cdFx0XHRkYiA9IGRiMiA9IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IGZzLnJtKHRtcERpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvZHVjZXMgYSBjb3B5IHdpdGggdGhlIHNhbWUgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0VHVybkV2ZW50SWQoJ3R1cm4tMScsICdldnQtMScpO1xuXHRcdFx0YXdhaXQgZGIuc2V0TWV0YWRhdGEoJ2tleScsICd2YWx1ZScpO1xuXG5cdFx0XHRjb25zdCB0YXJnZXRQYXRoID0gam9pbih0bXBEaXIsICdjb3B5LmRiJyk7XG5cdFx0XHRhd2FpdCBkYi52YWN1dW1JbnRvKHRhcmdldFBhdGgpO1xuXG5cdFx0XHRkYjIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4odGFyZ2V0UGF0aCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiMi5nZXRUdXJuRXZlbnRJZCgndHVybi0xJyksICdldnQtMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRiMi5nZXRNZXRhZGF0YSgna2V5JyksICd2YWx1ZScpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsY0FBYztBQUN2QixZQUFZLFFBQVE7QUFDcEIsU0FBUywr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
