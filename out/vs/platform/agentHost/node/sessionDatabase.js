import * as fs from "fs";
import { Sequencer, SequencerByKey } from "../../../base/common/async.js";
import { dirname } from "../../../base/common/path.js";
import { URI } from "../../../base/common/uri.js";
const sessionDatabaseMigrations = [
  {
    version: 1,
    sql: [
      `CREATE TABLE IF NOT EXISTS turns (
				id TEXT PRIMARY KEY NOT NULL
			)`,
      `CREATE TABLE IF NOT EXISTS file_edits (
				turn_id        TEXT    NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
				tool_call_id   TEXT    NOT NULL,
				file_path      TEXT    NOT NULL,
				before_content BLOB   NOT NULL,
				after_content  BLOB   NOT NULL,
				added_lines    INTEGER,
				removed_lines  INTEGER,
				PRIMARY KEY (tool_call_id, file_path)
			)`
    ].join(";\n")
  },
  {
    version: 2,
    sql: `CREATE TABLE IF NOT EXISTS session_metadata (
			key   TEXT PRIMARY KEY NOT NULL,
			value TEXT NOT NULL
		)`
  },
  {
    version: 3,
    sql: [
      // Recreate file_edits with new columns: edit_type, original_path,
      // and nullable before_content/after_content.
      `CREATE TABLE file_edits_v3 (
				turn_id        TEXT    NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
				tool_call_id   TEXT    NOT NULL,
				file_path      TEXT    NOT NULL,
				edit_type      TEXT    NOT NULL DEFAULT 'edit',
				original_path  TEXT,
				before_content BLOB,
				after_content  BLOB,
				added_lines    INTEGER,
				removed_lines  INTEGER,
				PRIMARY KEY (tool_call_id, file_path)
			)`,
      `INSERT INTO file_edits_v3 (turn_id, tool_call_id, file_path, edit_type, before_content, after_content, added_lines, removed_lines)
				SELECT turn_id, tool_call_id, file_path, 'edit', before_content, after_content, added_lines, removed_lines FROM file_edits`,
      `DROP TABLE file_edits`,
      `ALTER TABLE file_edits_v3 RENAME TO file_edits`
    ].join(";\n")
  },
  {
    version: 4,
    sql: [
      `ALTER TABLE turns ADD COLUMN event_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_turns_event_id ON turns(event_id)`
    ].join(";\n")
  },
  {
    version: 5,
    sql: `ALTER TABLE turns ADD COLUMN checkpoint_ref TEXT`
  },
  {
    version: 6,
    sql: `CREATE TABLE IF NOT EXISTS chat_drafts (
			chat_uri TEXT PRIMARY KEY NOT NULL,
			draft    TEXT NOT NULL
		)`
  },
  {
    version: 7,
    sql: `CREATE TABLE IF NOT EXISTS reviewed_files (
			uri   TEXT NOT NULL,
			nonce TEXT NOT NULL,
			PRIMARY KEY (uri, nonce)
		)`
  },
  {
    version: 8,
    sql: `CREATE TABLE IF NOT EXISTS local_turns (
			turn_id        TEXT PRIMARY KEY NOT NULL,
			chat_uri       TEXT NOT NULL,
			anchor_turn_id TEXT,
			seq            INTEGER NOT NULL,
			payload        TEXT NOT NULL
		)`
  },
  {
    version: 9,
    // `turn_usage` is a child of `turns` so every prune path (`deleteTurn`,
    // `truncateFromTurn`, `deleteTurnsAfter`, `deleteAllTurns`, and the fork
    // remap) reaches it by cascade and the table cannot grow unbounded.
    //
    // The foreign key forces `setTurnUsage` to `INSERT OR IGNORE` a parent row,
    // and rows created that way carry `event_id IS NULL`. That is safe here:
    // `getFirstTurnEventId` / `getNextTurnEventId` scan by rowid and are read
    // only by the Copilot agent (Claude resolves fork/truncate boundaries from
    // its own persisted mapping), and in a Copilot database `setTurnEventId`
    // runs on `user.message` — before any usage is reported — so the parent row
    // already exists and the insert is a no-op. Were usage ever to land first,
    // `setTurnEventId` fills the existing row in (`UPDATE … WHERE event_id IS
    // NULL`) and the position is still correct, since a turn's usage precedes
    // the next turn. Each peer chat gets its own database (see
    // `SessionDataService`), so a peer turn cannot interleave with another
    // chat's turns either.
    sql: `CREATE TABLE IF NOT EXISTS turn_usage (
			turn_id TEXT PRIMARY KEY NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
			usage   TEXT NOT NULL
		)`
  }
];
function dbExec(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => err ? reject(err) : resolve());
  });
}
function dbRun(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        return reject(err);
      }
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}
function dbGet(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        return reject(err);
      }
      resolve(row);
    });
  });
}
function dbAll(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}
function dbClose(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => err ? reject(err) : resolve());
  });
}
function dbOpen(path) {
  return new Promise((resolve, reject) => {
    import("@vscode/sqlite3").then((sqlite3) => {
      const db = new sqlite3.default.Database(path, (err) => {
        if (err) {
          return reject(err);
        }
        resolve(db);
      });
    }, reject);
  });
}
async function runMigrations(db, migrations) {
  await dbExec(db, "PRAGMA foreign_keys = ON");
  const row = await dbGet(db, "PRAGMA user_version", []);
  const currentVersion = row?.user_version ?? 0;
  const pending = migrations.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);
  if (pending.length === 0) {
    return;
  }
  await dbExec(db, "BEGIN TRANSACTION");
  try {
    for (const migration of pending) {
      await dbExec(db, migration.sql);
      await dbExec(db, `PRAGMA user_version = ${migration.version}`);
    }
    await dbExec(db, "COMMIT");
  } catch (err) {
    await dbExec(db, "ROLLBACK");
    throw err;
  }
}
class SessionDatabase {
  constructor(_path, _migrations = sessionDatabaseMigrations) {
    this._path = _path;
    this._migrations = _migrations;
    this._fileEditSequencer = new SequencerByKey();
    /**
     * Serializes `setMetadata` writes per key. `@vscode/sqlite3` runs in
     * parallelized mode, so two `db.run()` calls on the same connection
     * can be dispatched to the libuv thread pool and complete out of
     * submission order. For "last writer wins" keys (notably `configValues`
     * via {@link setMetadata}), that meant a fast-following second write
     * could be overtaken by the first and silently lose its value — see
     * the "Session Config persistence across restarts" integration test.
     * Sequencing by key preserves intra-key order while still allowing
     * writes for different keys to run concurrently.
     */
    this._metadataSequencer = new SequencerByKey();
    /**
     * Serializes every `turn_usage` access — writes, prunes, the fork remap, and the restore read
     * alike. `@vscode/sqlite3` runs in parallelized mode (see {@link _metadataSequencer}), so a
     * fire-and-forget `setTurnUsage` submitted before a truncation can otherwise complete *after*
     * it and resurrect a row the truncation was meant to remove, and a read can otherwise overtake
     * a write it was submitted after. Mutations must go through {@link _mutateTurnUsage} rather
     * than queueing on this directly, so they are tracked for {@link whenIdle}.
     */
    this._turnUsageSequencer = new Sequencer();
    /**
     * In-flight write operations. Tracked so {@link whenIdle} can await them
     * before the process exits — without this, a `SIGTERM` arriving between
     * a fire-and-forget mutating call (e.g. `setMetadata`) being invoked and
     * its underlying SQLite query completing would silently drop the write.
     * Every public mutating method routes its returned promise through
     * {@link _track}; reads (`getMetadata`, `getFileEdits`, ...) skip
     * tracking since shutdown does not need to wait for them.
     */
    this._pendingWrites = /* @__PURE__ */ new Set();
  }
  /**
   * Runs a mutation that touches `turn_usage`, tracked for {@link whenIdle}
   * and serialized against every other such mutation.
   */
  _mutateTurnUsage(operation) {
    return this._track(() => this._turnUsageSequencer.queue(async () => operation(await this._ensureDb())));
  }
  /**
   * Opens (or creates) a SQLite database at {@link path} and applies
   * any pending migrations. Only used in tests where synchronous
   * construction + immediate readiness is desired.
   */
  static async open(path, migrations = sessionDatabaseMigrations) {
    const inst = new SessionDatabase(path, migrations);
    await inst._ensureDb();
    return inst;
  }
  _ensureDb() {
    if (this._closed) {
      return Promise.reject(new Error("SessionDatabase has been disposed"));
    }
    if (!this._dbPromise) {
      this._dbPromise = (async () => {
        await fs.promises.mkdir(dirname(this._path), { recursive: true });
        const db = await dbOpen(this._path);
        try {
          await runMigrations(db, this._migrations);
        } catch (err) {
          await dbClose(db);
          this._dbPromise = void 0;
          throw err;
        }
        if (this._closed) {
          await dbClose(db);
          throw new Error("SessionDatabase has been disposed");
        }
        return db;
      })().catch((err) => {
        this._dbPromise = void 0;
        throw err;
      });
    }
    return this._dbPromise;
  }
  /**
   * Returns the names of all user-created tables in the database.
   * Useful for testing migration behavior.
   */
  async getAllTables() {
    const db = await this._ensureDb();
    const rows = await dbAll(db, `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, []);
    return rows.map((r) => r.name);
  }
  // ---- Turns ----------------------------------------------------------
  createTurn(turnId) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [turnId]);
    });
  }
  deleteTurn(turnId) {
    return this._mutateTurnUsage(async (db) => {
      await dbRun(db, "DELETE FROM turns WHERE id = ?", [turnId]);
    });
  }
  setTurnEventId(turnId, eventId) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [turnId]);
      await dbRun(db, "UPDATE turns SET event_id = ? WHERE id = ? AND event_id IS NULL", [eventId, turnId]);
    });
  }
  async getTurnEventId(turnId) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT event_id FROM turns WHERE id = ?", [turnId]);
    return row?.event_id ?? void 0;
  }
  async getNextTurnEventId(turnId) {
    const db = await this._ensureDb();
    const row = await dbGet(
      db,
      `SELECT event_id FROM turns
				WHERE rowid > (
					SELECT rowid FROM turns WHERE id = ?1 OR event_id = ?1 LIMIT 1
				)
				ORDER BY rowid LIMIT 1`,
      [turnId]
    );
    return row?.event_id ?? void 0;
  }
  async getFirstTurnEventId() {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT event_id FROM turns ORDER BY rowid LIMIT 1", []);
    return row?.event_id ?? void 0;
  }
  setTurnUsage(turnId, usage) {
    return this._mutateTurnUsage(async (db) => {
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [turnId]);
      await dbRun(db, "INSERT OR REPLACE INTO turn_usage (turn_id, usage) VALUES (?, ?)", [turnId, usage]);
    });
  }
  async getTurnUsages() {
    return this._turnUsageSequencer.queue(async () => {
      const db = await this._ensureDb();
      const rows = await dbAll(
        db,
        `SELECT u.turn_id AS turn_id, t.event_id AS event_id, u.usage AS usage
				FROM turn_usage u LEFT JOIN turns t ON t.id = u.turn_id`,
        []
      );
      const result = /* @__PURE__ */ new Map();
      for (const row of rows) {
        const usage = row.usage;
        result.set(row.turn_id, usage);
        const eventId = row.event_id;
        if (eventId) {
          result.set(eventId, usage);
        }
      }
      return result;
    });
  }
  setTurnCheckpointRef(turnId, ref) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [turnId]);
      await dbRun(db, "UPDATE turns SET checkpoint_ref = ? WHERE id = ?", [ref, turnId]);
    });
  }
  async getTurnCheckpointRef(turnId) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT checkpoint_ref FROM turns WHERE id = ?1 OR event_id = ?1 LIMIT 1", [turnId]);
    return row?.checkpoint_ref ?? void 0;
  }
  async getPreviousCheckpointRef(turnId) {
    const db = await this._ensureDb();
    const row = await dbGet(
      db,
      `SELECT checkpoint_ref FROM turns
				WHERE rowid < (SELECT rowid FROM turns WHERE id = ?1 OR event_id = ?1 LIMIT 1)
					AND checkpoint_ref IS NOT NULL
				ORDER BY rowid DESC LIMIT 1`,
      [turnId]
    );
    return row?.checkpoint_ref ?? void 0;
  }
  async getAllCheckpointRefs() {
    const db = await this._ensureDb();
    const rows = await dbAll(db, "SELECT checkpoint_ref FROM turns WHERE checkpoint_ref IS NOT NULL ORDER BY rowid", []);
    return rows.map((r) => r.checkpoint_ref);
  }
  truncateFromTurn(turnId) {
    return this._mutateTurnUsage(async (db) => {
      await dbRun(
        db,
        `DELETE FROM turns WHERE rowid >= (SELECT rowid FROM turns WHERE id = ?)`,
        [turnId]
      );
    });
  }
  deleteTurnsAfter(turnId) {
    return this._mutateTurnUsage(async (db) => {
      await dbRun(
        db,
        `DELETE FROM turns WHERE rowid > (SELECT rowid FROM turns WHERE id = ?)`,
        [turnId]
      );
    });
  }
  deleteAllTurns() {
    return this._mutateTurnUsage(async (db) => {
      await dbExec(db, "DELETE FROM turns");
    });
  }
  // ---- Local (host-injected) turns ------------------------------------
  insertLocalTurn(record) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(
        db,
        "INSERT OR REPLACE INTO local_turns (turn_id, chat_uri, anchor_turn_id, seq, payload) VALUES (?, ?, ?, ?, ?)",
        [record.turnId, record.chatUri, record.anchorTurnId ?? null, record.seq, record.payload]
      );
    });
  }
  async getLocalTurns() {
    const db = await this._ensureDb();
    const rows = await dbAll(db, "SELECT turn_id, chat_uri, anchor_turn_id, seq, payload FROM local_turns ORDER BY seq", []);
    return rows.map((r) => ({
      turnId: r.turn_id,
      chatUri: r.chat_uri,
      anchorTurnId: r.anchor_turn_id ?? void 0,
      seq: r.seq,
      payload: r.payload
    }));
  }
  deleteLocalTurns(turnIds) {
    return this._track(async () => {
      if (turnIds.length === 0) {
        return;
      }
      const db = await this._ensureDb();
      const placeholders = turnIds.map(() => "?").join(",");
      await dbRun(db, `DELETE FROM local_turns WHERE turn_id IN (${placeholders})`, [...turnIds]);
    });
  }
  // ---- File edits -----------------------------------------------------
  storeFileEdit(edit) {
    return this._track(() => this._fileEditSequencer.queue(edit.filePath, async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO turns (id) VALUES (?)", [edit.turnId]);
      await dbRun(
        db,
        `INSERT OR REPLACE INTO file_edits
					(turn_id, tool_call_id, file_path, edit_type, original_path, before_content, after_content, added_lines, removed_lines)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          edit.turnId,
          edit.toolCallId,
          edit.filePath,
          edit.kind,
          edit.originalPath ?? null,
          edit.beforeContent ? Buffer.from(edit.beforeContent) : null,
          edit.afterContent ? Buffer.from(edit.afterContent) : null,
          edit.addedLines ?? null,
          edit.removedLines ?? null
        ]
      );
    }));
  }
  async getFileEdits(toolCallIds) {
    if (toolCallIds.length === 0) {
      return [];
    }
    const db = await this._ensureDb();
    const placeholders = toolCallIds.map(() => "?").join(",");
    const rows = await dbAll(
      db,
      `SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				WHERE tool_call_id IN (${placeholders})
				ORDER BY rowid`,
      toolCallIds
    );
    return rows.map((row) => ({
      turnId: row.turn_id,
      toolCallId: row.tool_call_id,
      filePath: row.file_path,
      kind: row.edit_type ?? "edit",
      originalPath: row.original_path ?? void 0,
      addedLines: row.added_lines ?? void 0,
      removedLines: row.removed_lines ?? void 0
    }));
  }
  async getAllFileEdits() {
    const db = await this._ensureDb();
    const rows = await dbAll(
      db,
      `SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				ORDER BY rowid`,
      []
    );
    return rows.map((row) => ({
      turnId: row.turn_id,
      toolCallId: row.tool_call_id,
      filePath: row.file_path,
      kind: row.edit_type ?? "edit",
      originalPath: row.original_path ?? void 0,
      addedLines: row.added_lines ?? void 0,
      removedLines: row.removed_lines ?? void 0
    }));
  }
  async getFileEditsByTurn(turnId) {
    const db = await this._ensureDb();
    const rows = await dbAll(
      db,
      `SELECT turn_id, tool_call_id, file_path, edit_type, original_path, added_lines, removed_lines
				FROM file_edits
				WHERE turn_id = ?
				ORDER BY rowid`,
      [turnId]
    );
    return rows.map((row) => ({
      turnId: row.turn_id,
      toolCallId: row.tool_call_id,
      filePath: row.file_path,
      kind: row.edit_type ?? "edit",
      originalPath: row.original_path ?? void 0,
      addedLines: row.added_lines ?? void 0,
      removedLines: row.removed_lines ?? void 0
    }));
  }
  async readFileEditContent(toolCallId, filePath) {
    return this._fileEditSequencer.queue(filePath, async () => {
      const db = await this._ensureDb();
      const row = await dbGet(
        db,
        `SELECT before_content, after_content
					FROM file_edits
					WHERE tool_call_id = ? AND file_path = ?`,
        [toolCallId, filePath]
      );
      if (!row) {
        return void 0;
      }
      return {
        beforeContent: row.before_content ? toUint8Array(row.before_content) : void 0,
        afterContent: row.after_content ? toUint8Array(row.after_content) : void 0
      };
    });
  }
  // ---- Session metadata -----------------------------------------------
  async getMetadata(key) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT value FROM session_metadata WHERE key = ?", [key]);
    return row?.value;
  }
  async getMetadataObject(obj) {
    const keys = Object.keys(obj);
    const result = {};
    if (keys.length === 0) {
      return result;
    }
    const db = await this._ensureDb();
    const placeholders = keys.map(() => "?").join(",");
    const rows = await dbAll(db, `SELECT key, value FROM session_metadata WHERE key IN (${placeholders})`, keys);
    for (const key of keys) {
      result[key] = void 0;
    }
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
  setMetadata(key, value) {
    return this._track(() => this._metadataSequencer.queue(key, async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR REPLACE INTO session_metadata (key, value) VALUES (?, ?)", [key, value]);
    }));
  }
  setChatDraft(chat, draft) {
    const chatUri = chat.toString();
    return this._track(async () => {
      const db = await this._ensureDb();
      if (!draft) {
        await dbRun(db, "DELETE FROM chat_drafts WHERE chat_uri = ?", [chatUri]);
        return;
      }
      await dbRun(db, "INSERT OR REPLACE INTO chat_drafts (chat_uri, draft) VALUES (?, ?)", [chatUri, JSON.stringify(draft)]);
    });
  }
  async getChatDraft(chat) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT draft FROM chat_drafts WHERE chat_uri = ?", [chat.toString()]);
    if (typeof row?.draft !== "string") {
      return void 0;
    }
    try {
      return JSON.parse(row.draft);
    } catch {
      return void 0;
    }
  }
  // ---- Reviewed files -------------------------------------------------
  markFileReviewed(uri, nonce) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "INSERT OR IGNORE INTO reviewed_files (uri, nonce) VALUES (?, ?)", [uri.toString(), nonce]);
    });
  }
  unmarkFileReviewed(uri, nonce) {
    return this._track(async () => {
      const db = await this._ensureDb();
      await dbRun(db, "DELETE FROM reviewed_files WHERE uri = ? AND nonce = ?", [uri.toString(), nonce]);
    });
  }
  async getReviewedFiles() {
    const db = await this._ensureDb();
    const rows = await dbAll(db, "SELECT uri, nonce FROM reviewed_files ORDER BY rowid", []);
    return rows.map(toReviewedFileRecord);
  }
  async getReviewedFilesForUri(uri) {
    const db = await this._ensureDb();
    const rows = await dbAll(db, "SELECT uri, nonce FROM reviewed_files WHERE uri = ? ORDER BY rowid", [uri.toString()]);
    return rows.map(toReviewedFileRecord);
  }
  async isFileReviewed(uri, nonce) {
    const db = await this._ensureDb();
    const row = await dbGet(db, "SELECT 1 FROM reviewed_files WHERE uri = ? AND nonce = ? LIMIT 1", [uri.toString(), nonce]);
    return !!row;
  }
  remapTurnIds(mapping) {
    return this._mutateTurnUsage(async (db) => {
      await dbExec(db, "PRAGMA defer_foreign_keys = ON");
      await dbExec(db, "BEGIN TRANSACTION");
      try {
        const oldIds = [...mapping.keys()];
        if (oldIds.length > 0) {
          const placeholders = oldIds.map(() => "?").join(",");
          await dbRun(
            db,
            `DELETE FROM turns WHERE id NOT IN (${placeholders})`,
            oldIds
          );
        }
        for (const [oldId, newId] of mapping) {
          await dbRun(db, "UPDATE turns SET id = ? WHERE id = ?", [newId, oldId]);
          await dbRun(db, "UPDATE file_edits SET turn_id = ? WHERE turn_id = ?", [newId, oldId]);
        }
        if (oldIds.length > 0) {
          const placeholders = oldIds.map(() => "?").join(",");
          await dbRun(
            db,
            `DELETE FROM local_turns WHERE turn_id NOT IN (${placeholders})`,
            oldIds
          );
        }
        for (const [oldId, newId] of mapping) {
          await dbRun(db, "UPDATE local_turns SET turn_id = ? WHERE turn_id = ?", [newId, oldId]);
          await dbRun(db, "UPDATE local_turns SET anchor_turn_id = ? WHERE anchor_turn_id = ?", [newId, oldId]);
        }
        for (const [oldId, newId] of mapping) {
          await dbRun(db, "UPDATE turn_usage SET turn_id = ? WHERE turn_id = ?", [newId, oldId]);
        }
        await dbExec(db, "COMMIT");
      } catch (err) {
        await dbExec(db, "ROLLBACK");
        throw err;
      }
    });
  }
  /**
   * Resolves once all currently in-flight write operations have settled.
   * Used by graceful shutdown to flush pending fire-and-forget writes
   * before the process exits. Should be called from a path where no
   * further writes are expected; loops until idle to also drain any
   * writes that get queued while we're awaiting.
   */
  async whenIdle() {
    while (this._pendingWrites.size > 0) {
      await Promise.allSettled([...this._pendingWrites]);
    }
  }
  async vacuumInto(targetPath) {
    const db = await this._ensureDb();
    await dbRun(db, "VACUUM INTO ?", [targetPath]);
  }
  /**
   * Wrap a mutating operation's promise so {@link whenIdle} can await it.
   * Invoke at the **outermost** layer of every public mutating method so
   * that any internal awaits (notably `_ensureDb()`) are covered too —
   * tracking only the leaf `dbRun`/`dbExec` would miss the window
   * between the method being called and the query actually being queued.
   */
  _track(fn) {
    const p = fn();
    this._pendingWrites.add(p);
    const untrack = () => {
      this._pendingWrites.delete(p);
    };
    p.then(untrack, untrack);
    return p;
  }
  async close() {
    await (this._closed ??= this._dbPromise?.then((db) => dbClose(db)).catch(() => {
    }) || true);
  }
  dispose() {
    this.close();
  }
}
function toReviewedFileRecord(row) {
  return {
    uri: URI.parse(row.uri),
    nonce: row.nonce
  };
}
function toUint8Array(value) {
  if (value instanceof Buffer) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  return new Uint8Array(0);
}
export {
  SessionDatabase,
  runMigrations,
  sessionDatabaseMigrations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3Nlc3Npb25EYXRhYmFzZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IFNlcXVlbmNlciwgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgdHlwZSB7IERhdGFiYXNlLCBSdW5SZXN1bHQgfSBmcm9tICdAdnNjb2RlL3NxbGl0ZTMnO1xuaW1wb3J0IHR5cGUgeyBJRmlsZUVkaXRDb250ZW50LCBJRmlsZUVkaXRSZWNvcmQsIElMb2NhbFR1cm5SZWNvcmQsIElSZXZpZXdlZEZpbGVSZWNvcmQsIElTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IE1lc3NhZ2UgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcblxuLyoqXG4gKiBBIHNpbmdsZSBudW1iZXJlZCBtaWdyYXRpb24uIE1pZ3JhdGlvbnMgYXJlIGFwcGxpZWQgaW4gb3JkZXIgb2ZcbiAqIHtAbGluayB2ZXJzaW9ufSBhbmQgdHJhY2tlZCB2aWEgYFBSQUdNQSB1c2VyX3ZlcnNpb25gLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uRGF0YWJhc2VNaWdyYXRpb24ge1xuXHQvKiogTW9ub3RvbmljYWxseS1pbmNyZWFzaW5nIHZlcnNpb24gbnVtYmVyICgxLWJhc2VkKS4gKi9cblx0cmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuXHQvKiogU1FMIHRvIGV4ZWN1dGUgZm9yIHRoaXMgbWlncmF0aW9uLiAqL1xuXHRyZWFkb25seSBzcWw6IHN0cmluZztcbn1cblxuLyoqXG4gKiBUaGUgc2V0IG9mIG1pZ3JhdGlvbnMgdGhhdCBkZWZpbmUgdGhlIGN1cnJlbnQgc2Vzc2lvbiBkYXRhYmFzZSBzY2hlbWEuXG4gKiBOZXcgbWlncmF0aW9ucyBzaG91bGQgYmUgKiphcHBlbmRlZCoqIHRvIHRoaXMgYXJyYXkgd2l0aCB0aGUgbmV4dCB2ZXJzaW9uXG4gKiBudW1iZXIuIE5ldmVyIHJlb3JkZXIgb3IgbXV0YXRlIGV4aXN0aW5nIGVudHJpZXMuXG4gKi9cbmV4cG9ydCBjb25zdCBzZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25zOiByZWFkb25seSBJU2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9uW10gPSBbXG5cdHtcblx0XHR2ZXJzaW9uOiAxLFxuXHRcdHNxbDogW1xuXHRcdFx0YENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHR1cm5zIChcblx0XHRcdFx0aWQgVEVYVCBQUklNQVJZIEtFWSBOT1QgTlVMTFxuXHRcdFx0KWAsXG5cdFx0XHRgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgZmlsZV9lZGl0cyAoXG5cdFx0XHRcdHR1cm5faWQgICAgICAgIFRFWFQgICAgTk9UIE5VTEwgUkVGRVJFTkNFUyB0dXJucyhpZCkgT04gREVMRVRFIENBU0NBREUsXG5cdFx0XHRcdHRvb2xfY2FsbF9pZCAgIFRFWFQgICAgTk9UIE5VTEwsXG5cdFx0XHRcdGZpbGVfcGF0aCAgICAgIFRFWFQgICAgTk9UIE5VTEwsXG5cdFx0XHRcdGJlZm9yZV9jb250ZW50IEJMT0IgICBOT1QgTlVMTCxcblx0XHRcdFx0YWZ0ZXJfY29udGVudCAgQkxPQiAgIE5PVCBOVUxMLFxuXHRcdFx0XHRhZGRlZF9saW5lcyAgICBJTlRFR0VSLFxuXHRcdFx0XHRyZW1vdmVkX2xpbmVzICBJTlRFR0VSLFxuXHRcdFx0XHRQUklNQVJZIEtFWSAodG9vbF9jYWxsX2lkLCBmaWxlX3BhdGgpXG5cdFx0XHQpYCxcblx0XHRdLmpvaW4oJztcXG4nKSxcblx0fSxcblx0e1xuXHRcdHZlcnNpb246IDIsXG5cdFx0c3FsOiBgQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgc2Vzc2lvbl9tZXRhZGF0YSAoXG5cdFx0XHRrZXkgICBURVhUIFBSSU1BUlkgS0VZIE5PVCBOVUxMLFxuXHRcdFx0dmFsdWUgVEVYVCBOT1QgTlVMTFxuXHRcdClgLFxuXHR9LFxuXHR7XG5cdFx0dmVyc2lvbjogMyxcblx0XHRzcWw6IFtcblx0XHRcdC8vIFJlY3JlYXRlIGZpbGVfZWRpdHMgd2l0aCBuZXcgY29sdW1uczogZWRpdF90eXBlLCBvcmlnaW5hbF9wYXRoLFxuXHRcdFx0Ly8gYW5kIG51bGxhYmxlIGJlZm9yZV9jb250ZW50L2FmdGVyX2NvbnRlbnQuXG5cdFx0XHRgQ1JFQVRFIFRBQkxFIGZpbGVfZWRpdHNfdjMgKFxuXHRcdFx0XHR0dXJuX2lkICAgICAgICBURVhUICAgIE5PVCBOVUxMIFJFRkVSRU5DRVMgdHVybnMoaWQpIE9OIERFTEVURSBDQVNDQURFLFxuXHRcdFx0XHR0b29sX2NhbGxfaWQgICBURVhUICAgIE5PVCBOVUxMLFxuXHRcdFx0XHRmaWxlX3BhdGggICAgICBURVhUICAgIE5PVCBOVUxMLFxuXHRcdFx0XHRlZGl0X3R5cGUgICAgICBURVhUICAgIE5PVCBOVUxMIERFRkFVTFQgJ2VkaXQnLFxuXHRcdFx0XHRvcmlnaW5hbF9wYXRoICBURVhULFxuXHRcdFx0XHRiZWZvcmVfY29udGVudCBCTE9CLFxuXHRcdFx0XHRhZnRlcl9jb250ZW50ICBCTE9CLFxuXHRcdFx0XHRhZGRlZF9saW5lcyAgICBJTlRFR0VSLFxuXHRcdFx0XHRyZW1vdmVkX2xpbmVzICBJTlRFR0VSLFxuXHRcdFx0XHRQUklNQVJZIEtFWSAodG9vbF9jYWxsX2lkLCBmaWxlX3BhdGgpXG5cdFx0XHQpYCxcblx0XHRcdGBJTlNFUlQgSU5UTyBmaWxlX2VkaXRzX3YzICh0dXJuX2lkLCB0b29sX2NhbGxfaWQsIGZpbGVfcGF0aCwgZWRpdF90eXBlLCBiZWZvcmVfY29udGVudCwgYWZ0ZXJfY29udGVudCwgYWRkZWRfbGluZXMsIHJlbW92ZWRfbGluZXMpXG5cdFx0XHRcdFNFTEVDVCB0dXJuX2lkLCB0b29sX2NhbGxfaWQsIGZpbGVfcGF0aCwgJ2VkaXQnLCBiZWZvcmVfY29udGVudCwgYWZ0ZXJfY29udGVudCwgYWRkZWRfbGluZXMsIHJlbW92ZWRfbGluZXMgRlJPTSBmaWxlX2VkaXRzYCxcblx0XHRcdGBEUk9QIFRBQkxFIGZpbGVfZWRpdHNgLFxuXHRcdFx0YEFMVEVSIFRBQkxFIGZpbGVfZWRpdHNfdjMgUkVOQU1FIFRPIGZpbGVfZWRpdHNgLFxuXHRcdF0uam9pbignO1xcbicpLFxuXHR9LFxuXHR7XG5cdFx0dmVyc2lvbjogNCxcblx0XHRzcWw6IFtcblx0XHRcdGBBTFRFUiBUQUJMRSB0dXJucyBBREQgQ09MVU1OIGV2ZW50X2lkIFRFWFRgLFxuXHRcdFx0YENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF90dXJuc19ldmVudF9pZCBPTiB0dXJucyhldmVudF9pZClgLFxuXHRcdF0uam9pbignO1xcbicpLFxuXHR9LFxuXHR7XG5cdFx0dmVyc2lvbjogNSxcblx0XHRzcWw6IGBBTFRFUiBUQUJMRSB0dXJucyBBREQgQ09MVU1OIGNoZWNrcG9pbnRfcmVmIFRFWFRgLFxuXHR9LFxuXHR7XG5cdFx0dmVyc2lvbjogNixcblx0XHRzcWw6IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBjaGF0X2RyYWZ0cyAoXG5cdFx0XHRjaGF0X3VyaSBURVhUIFBSSU1BUlkgS0VZIE5PVCBOVUxMLFxuXHRcdFx0ZHJhZnQgICAgVEVYVCBOT1QgTlVMTFxuXHRcdClgLFxuXHR9LFxuXHR7XG5cdFx0dmVyc2lvbjogNyxcblx0XHRzcWw6IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyByZXZpZXdlZF9maWxlcyAoXG5cdFx0XHR1cmkgICBURVhUIE5PVCBOVUxMLFxuXHRcdFx0bm9uY2UgVEVYVCBOT1QgTlVMTCxcblx0XHRcdFBSSU1BUlkgS0VZICh1cmksIG5vbmNlKVxuXHRcdClgLFxuXHR9LFxuXHR7XG5cdFx0dmVyc2lvbjogOCxcblx0XHRzcWw6IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBsb2NhbF90dXJucyAoXG5cdFx0XHR0dXJuX2lkICAgICAgICBURVhUIFBSSU1BUlkgS0VZIE5PVCBOVUxMLFxuXHRcdFx0Y2hhdF91cmkgICAgICAgVEVYVCBOT1QgTlVMTCxcblx0XHRcdGFuY2hvcl90dXJuX2lkIFRFWFQsXG5cdFx0XHRzZXEgICAgICAgICAgICBJTlRFR0VSIE5PVCBOVUxMLFxuXHRcdFx0cGF5bG9hZCAgICAgICAgVEVYVCBOT1QgTlVMTFxuXHRcdClgLFxuXHR9LFxuXHR7XG5cdFx0dmVyc2lvbjogOSxcblx0XHQvLyBgdHVybl91c2FnZWAgaXMgYSBjaGlsZCBvZiBgdHVybnNgIHNvIGV2ZXJ5IHBydW5lIHBhdGggKGBkZWxldGVUdXJuYCxcblx0XHQvLyBgdHJ1bmNhdGVGcm9tVHVybmAsIGBkZWxldGVUdXJuc0FmdGVyYCwgYGRlbGV0ZUFsbFR1cm5zYCwgYW5kIHRoZSBmb3JrXG5cdFx0Ly8gcmVtYXApIHJlYWNoZXMgaXQgYnkgY2FzY2FkZSBhbmQgdGhlIHRhYmxlIGNhbm5vdCBncm93IHVuYm91bmRlZC5cblx0XHQvL1xuXHRcdC8vIFRoZSBmb3JlaWduIGtleSBmb3JjZXMgYHNldFR1cm5Vc2FnZWAgdG8gYElOU0VSVCBPUiBJR05PUkVgIGEgcGFyZW50IHJvdyxcblx0XHQvLyBhbmQgcm93cyBjcmVhdGVkIHRoYXQgd2F5IGNhcnJ5IGBldmVudF9pZCBJUyBOVUxMYC4gVGhhdCBpcyBzYWZlIGhlcmU6XG5cdFx0Ly8gYGdldEZpcnN0VHVybkV2ZW50SWRgIC8gYGdldE5leHRUdXJuRXZlbnRJZGAgc2NhbiBieSByb3dpZCBhbmQgYXJlIHJlYWRcblx0XHQvLyBvbmx5IGJ5IHRoZSBDb3BpbG90IGFnZW50IChDbGF1ZGUgcmVzb2x2ZXMgZm9yay90cnVuY2F0ZSBib3VuZGFyaWVzIGZyb21cblx0XHQvLyBpdHMgb3duIHBlcnNpc3RlZCBtYXBwaW5nKSwgYW5kIGluIGEgQ29waWxvdCBkYXRhYmFzZSBgc2V0VHVybkV2ZW50SWRgXG5cdFx0Ly8gcnVucyBvbiBgdXNlci5tZXNzYWdlYCBcdTIwMTQgYmVmb3JlIGFueSB1c2FnZSBpcyByZXBvcnRlZCBcdTIwMTQgc28gdGhlIHBhcmVudCByb3dcblx0XHQvLyBhbHJlYWR5IGV4aXN0cyBhbmQgdGhlIGluc2VydCBpcyBhIG5vLW9wLiBXZXJlIHVzYWdlIGV2ZXIgdG8gbGFuZCBmaXJzdCxcblx0XHQvLyBgc2V0VHVybkV2ZW50SWRgIGZpbGxzIHRoZSBleGlzdGluZyByb3cgaW4gKGBVUERBVEUgXHUyMDI2IFdIRVJFIGV2ZW50X2lkIElTXG5cdFx0Ly8gTlVMTGApIGFuZCB0aGUgcG9zaXRpb24gaXMgc3RpbGwgY29ycmVjdCwgc2luY2UgYSB0dXJuJ3MgdXNhZ2UgcHJlY2VkZXNcblx0XHQvLyB0aGUgbmV4dCB0dXJuLiBFYWNoIHBlZXIgY2hhdCBnZXRzIGl0cyBvd24gZGF0YWJhc2UgKHNlZVxuXHRcdC8vIGBTZXNzaW9uRGF0YVNlcnZpY2VgKSwgc28gYSBwZWVyIHR1cm4gY2Fubm90IGludGVybGVhdmUgd2l0aCBhbm90aGVyXG5cdFx0Ly8gY2hhdCdzIHR1cm5zIGVpdGhlci5cblx0XHRzcWw6IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyB0dXJuX3VzYWdlIChcblx0XHRcdHR1cm5faWQgVEVYVCBQUklNQVJZIEtFWSBOT1QgTlVMTCBSRUZFUkVOQ0VTIHR1cm5zKGlkKSBPTiBERUxFVEUgQ0FTQ0FERSxcblx0XHRcdHVzYWdlICAgVEVYVCBOT1QgTlVMTFxuXHRcdClgLFxuXHR9LFxuXTtcblxuLy8gLS0tLSBQcm9taXNlIHdyYXBwZXJzIGFyb3VuZCBjYWxsYmFjay1iYXNlZCBAdnNjb2RlL3NxbGl0ZTMgQVBJIC0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGRiRXhlYyhkYjogRGF0YWJhc2UsIHNxbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0ZGIuZXhlYyhzcWwsIGVyciA9PiBlcnIgPyByZWplY3QoZXJyKSA6IHJlc29sdmUoKSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBkYlJ1bihkYjogRGF0YWJhc2UsIHNxbDogc3RyaW5nLCBwYXJhbXM6IHVua25vd25bXSk6IFByb21pc2U8eyBjaGFuZ2VzOiBudW1iZXI7IGxhc3RJRDogbnVtYmVyIH0+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRkYi5ydW4oc3FsLCBwYXJhbXMsIGZ1bmN0aW9uICh0aGlzOiBSdW5SZXN1bHQsIGVycjogRXJyb3IgfCBudWxsKSB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiByZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHRcdHJlc29sdmUoeyBjaGFuZ2VzOiB0aGlzLmNoYW5nZXMsIGxhc3RJRDogdGhpcy5sYXN0SUQgfSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBkYkdldChkYjogRGF0YWJhc2UsIHNxbDogc3RyaW5nLCBwYXJhbXM6IHVua25vd25bXSk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRkYi5nZXQoc3FsLCBwYXJhbXMsIChlcnI6IEVycm9yIHwgbnVsbCwgcm93OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycik7XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlKHJvdyk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBkYkFsbChkYjogRGF0YWJhc2UsIHNxbDogc3RyaW5nLCBwYXJhbXM6IHVua25vd25bXSk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj5bXT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGRiLmFsbChzcWwsIHBhcmFtcywgKGVycjogRXJyb3IgfCBudWxsLCByb3dzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPltdKSA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiByZWplY3QoZXJyKTtcblx0XHRcdH1cblx0XHRcdHJlc29sdmUocm93cyk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBkYkNsb3NlKGRiOiBEYXRhYmFzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGRiLmNsb3NlKGVyciA9PiBlcnIgPyByZWplY3QoZXJyKSA6IHJlc29sdmUoKSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBkYk9wZW4ocGF0aDogc3RyaW5nKTogUHJvbWlzZTxEYXRhYmFzZT4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGltcG9ydCgnQHZzY29kZS9zcWxpdGUzJykudGhlbihzcWxpdGUzID0+IHtcblx0XHRcdGNvbnN0IGRiID0gbmV3IHNxbGl0ZTMuZGVmYXVsdC5EYXRhYmFzZShwYXRoLCAoZXJyOiBFcnJvciB8IG51bGwpID0+IHtcblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdHJldHVybiByZWplY3QoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKGRiKTtcblx0XHRcdH0pO1xuXHRcdH0sIHJlamVjdCk7XG5cdH0pO1xufVxuXG4vKipcbiAqIEFwcGxpZXMgYW55IHBlbmRpbmcge0BsaW5rIElTZXNzaW9uRGF0YWJhc2VNaWdyYXRpb24gbWlncmF0aW9uc30gdG8gYVxuICogZGF0YWJhc2UuIE1pZ3JhdGlvbnMgd2hvc2UgdmVyc2lvbiBpcyBncmVhdGVyIHRoYW4gdGhlIGN1cnJlbnRcbiAqIGBQUkFHTUEgdXNlcl92ZXJzaW9uYCBhcmUgcnVuIGluc2lkZSBhIHNlcmlhbGl6ZWQgdHJhbnNhY3Rpb24uIEFmdGVyIGFsbFxuICogbWlncmF0aW9ucyBjb21wbGV0ZSB0aGUgcHJhZ21hIGlzIHVwZGF0ZWQgdG8gdGhlIGhpZ2hlc3QgYXBwbGllZCB2ZXJzaW9uLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuTWlncmF0aW9ucyhkYjogRGF0YWJhc2UsIG1pZ3JhdGlvbnM6IHJlYWRvbmx5IElTZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHQvLyBFbmFibGUgZm9yZWlnbiBrZXkgZW5mb3JjZW1lbnQgXHUyMDE0IG11c3QgYmUgc2V0IG91dHNpZGUgYSB0cmFuc2FjdGlvblxuXHQvLyBhbmQgZXZlcnkgdGltZSBhIGNvbm5lY3Rpb24gaXMgb3BlbmVkLlxuXHRhd2FpdCBkYkV4ZWMoZGIsICdQUkFHTUEgZm9yZWlnbl9rZXlzID0gT04nKTtcblxuXHRjb25zdCByb3cgPSBhd2FpdCBkYkdldChkYiwgJ1BSQUdNQSB1c2VyX3ZlcnNpb24nLCBbXSk7XG5cdGNvbnN0IGN1cnJlbnRWZXJzaW9uID0gKHJvdz8udXNlcl92ZXJzaW9uIGFzIG51bWJlciB8IHVuZGVmaW5lZCkgPz8gMDtcblxuXHRjb25zdCBwZW5kaW5nID0gbWlncmF0aW9uc1xuXHRcdC5maWx0ZXIobSA9PiBtLnZlcnNpb24gPiBjdXJyZW50VmVyc2lvbilcblx0XHQuc29ydCgoYSwgYikgPT4gYS52ZXJzaW9uIC0gYi52ZXJzaW9uKTtcblxuXHRpZiAocGVuZGluZy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRhd2FpdCBkYkV4ZWMoZGIsICdCRUdJTiBUUkFOU0FDVElPTicpO1xuXHR0cnkge1xuXHRcdGZvciAoY29uc3QgbWlncmF0aW9uIG9mIHBlbmRpbmcpIHtcblx0XHRcdGF3YWl0IGRiRXhlYyhkYiwgbWlncmF0aW9uLnNxbCk7XG5cdFx0XHQvLyBQUkFHTUEgY2Fubm90IGJlIHBhcmFtZXRlcml6ZWQ7IHRoZSB2ZXJzaW9uIGlzIGEgdHJ1c3RlZCBsaXRlcmFsLlxuXHRcdFx0YXdhaXQgZGJFeGVjKGRiLCBgUFJBR01BIHVzZXJfdmVyc2lvbiA9ICR7bWlncmF0aW9uLnZlcnNpb259YCk7XG5cdFx0fVxuXHRcdGF3YWl0IGRiRXhlYyhkYiwgJ0NPTU1JVCcpO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRhd2FpdCBkYkV4ZWMoZGIsICdST0xMQkFDSycpO1xuXHRcdHRocm93IGVycjtcblx0fVxufVxuXG4vKipcbiAqIEEgd3JhcHBlciBhcm91bmQgYSBgQHZzY29kZS9zcWxpdGUzYCB7QGxpbmsgRGF0YWJhc2V9IGluc3RhbmNlIHdpdGhcbiAqIGxhenkgaW5pdGlhbGlzYXRpb24uXG4gKlxuICogVGhlIHVuZGVybHlpbmcgY29ubmVjdGlvbiBpcyBvcGVuZWQgb24gdGhlIGZpcnN0IGFzeW5jIG1ldGhvZCBjYWxsXG4gKiAobm90IGF0IGNvbnN0cnVjdGlvbiB0aW1lKSwgYWxsb3dpbmcgdGhlIG9iamVjdCB0byBiZSBjcmVhdGVkXG4gKiBzeW5jaHJvbm91c2x5IGFuZCBzaGFyZWQgdmlhIGEge0BsaW5rIFJlZmVyZW5jZUNvbGxlY3Rpb259LlxuICpcbiAqIENhbGxpbmcge0BsaW5rIGRpc3Bvc2V9IGNsb3NlcyB0aGUgY29ubmVjdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb25EYXRhYmFzZSBpbXBsZW1lbnRzIElTZXNzaW9uRGF0YWJhc2Uge1xuXG5cdHByb3RlY3RlZCBfZGJQcm9taXNlOiBQcm9taXNlPERhdGFiYXNlPiB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIF9jbG9zZWQ6IFByb21pc2U8dm9pZD4gfCB0cnVlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlRWRpdFNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cblx0LyoqXG5cdCAqIFNlcmlhbGl6ZXMgYHNldE1ldGFkYXRhYCB3cml0ZXMgcGVyIGtleS4gYEB2c2NvZGUvc3FsaXRlM2AgcnVucyBpblxuXHQgKiBwYXJhbGxlbGl6ZWQgbW9kZSwgc28gdHdvIGBkYi5ydW4oKWAgY2FsbHMgb24gdGhlIHNhbWUgY29ubmVjdGlvblxuXHQgKiBjYW4gYmUgZGlzcGF0Y2hlZCB0byB0aGUgbGlidXYgdGhyZWFkIHBvb2wgYW5kIGNvbXBsZXRlIG91dCBvZlxuXHQgKiBzdWJtaXNzaW9uIG9yZGVyLiBGb3IgXCJsYXN0IHdyaXRlciB3aW5zXCIga2V5cyAobm90YWJseSBgY29uZmlnVmFsdWVzYFxuXHQgKiB2aWEge0BsaW5rIHNldE1ldGFkYXRhfSksIHRoYXQgbWVhbnQgYSBmYXN0LWZvbGxvd2luZyBzZWNvbmQgd3JpdGVcblx0ICogY291bGQgYmUgb3ZlcnRha2VuIGJ5IHRoZSBmaXJzdCBhbmQgc2lsZW50bHkgbG9zZSBpdHMgdmFsdWUgXHUyMDE0IHNlZVxuXHQgKiB0aGUgXCJTZXNzaW9uIENvbmZpZyBwZXJzaXN0ZW5jZSBhY3Jvc3MgcmVzdGFydHNcIiBpbnRlZ3JhdGlvbiB0ZXN0LlxuXHQgKiBTZXF1ZW5jaW5nIGJ5IGtleSBwcmVzZXJ2ZXMgaW50cmEta2V5IG9yZGVyIHdoaWxlIHN0aWxsIGFsbG93aW5nXG5cdCAqIHdyaXRlcyBmb3IgZGlmZmVyZW50IGtleXMgdG8gcnVuIGNvbmN1cnJlbnRseS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFkYXRhU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogU2VyaWFsaXplcyBldmVyeSBgdHVybl91c2FnZWAgYWNjZXNzIFx1MjAxNCB3cml0ZXMsIHBydW5lcywgdGhlIGZvcmsgcmVtYXAsIGFuZCB0aGUgcmVzdG9yZSByZWFkXG5cdCAqIGFsaWtlLiBgQHZzY29kZS9zcWxpdGUzYCBydW5zIGluIHBhcmFsbGVsaXplZCBtb2RlIChzZWUge0BsaW5rIF9tZXRhZGF0YVNlcXVlbmNlcn0pLCBzbyBhXG5cdCAqIGZpcmUtYW5kLWZvcmdldCBgc2V0VHVyblVzYWdlYCBzdWJtaXR0ZWQgYmVmb3JlIGEgdHJ1bmNhdGlvbiBjYW4gb3RoZXJ3aXNlIGNvbXBsZXRlICphZnRlcipcblx0ICogaXQgYW5kIHJlc3VycmVjdCBhIHJvdyB0aGUgdHJ1bmNhdGlvbiB3YXMgbWVhbnQgdG8gcmVtb3ZlLCBhbmQgYSByZWFkIGNhbiBvdGhlcndpc2Ugb3ZlcnRha2Vcblx0ICogYSB3cml0ZSBpdCB3YXMgc3VibWl0dGVkIGFmdGVyLiBNdXRhdGlvbnMgbXVzdCBnbyB0aHJvdWdoIHtAbGluayBfbXV0YXRlVHVyblVzYWdlfSByYXRoZXJcblx0ICogdGhhbiBxdWV1ZWluZyBvbiB0aGlzIGRpcmVjdGx5LCBzbyB0aGV5IGFyZSB0cmFja2VkIGZvciB7QGxpbmsgd2hlbklkbGV9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdHVyblVzYWdlU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXG5cdC8qKlxuXHQgKiBSdW5zIGEgbXV0YXRpb24gdGhhdCB0b3VjaGVzIGB0dXJuX3VzYWdlYCwgdHJhY2tlZCBmb3Ige0BsaW5rIHdoZW5JZGxlfVxuXHQgKiBhbmQgc2VyaWFsaXplZCBhZ2FpbnN0IGV2ZXJ5IG90aGVyIHN1Y2ggbXV0YXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9tdXRhdGVUdXJuVXNhZ2Uob3BlcmF0aW9uOiAoZGI6IERhdGFiYXNlKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrKCgpID0+IHRoaXMuX3R1cm5Vc2FnZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiBvcGVyYXRpb24oYXdhaXQgdGhpcy5fZW5zdXJlRGIoKSkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbi1mbGlnaHQgd3JpdGUgb3BlcmF0aW9ucy4gVHJhY2tlZCBzbyB7QGxpbmsgd2hlbklkbGV9IGNhbiBhd2FpdCB0aGVtXG5cdCAqIGJlZm9yZSB0aGUgcHJvY2VzcyBleGl0cyBcdTIwMTQgd2l0aG91dCB0aGlzLCBhIGBTSUdURVJNYCBhcnJpdmluZyBiZXR3ZWVuXG5cdCAqIGEgZmlyZS1hbmQtZm9yZ2V0IG11dGF0aW5nIGNhbGwgKGUuZy4gYHNldE1ldGFkYXRhYCkgYmVpbmcgaW52b2tlZCBhbmRcblx0ICogaXRzIHVuZGVybHlpbmcgU1FMaXRlIHF1ZXJ5IGNvbXBsZXRpbmcgd291bGQgc2lsZW50bHkgZHJvcCB0aGUgd3JpdGUuXG5cdCAqIEV2ZXJ5IHB1YmxpYyBtdXRhdGluZyBtZXRob2Qgcm91dGVzIGl0cyByZXR1cm5lZCBwcm9taXNlIHRocm91Z2hcblx0ICoge0BsaW5rIF90cmFja307IHJlYWRzIChgZ2V0TWV0YWRhdGFgLCBgZ2V0RmlsZUVkaXRzYCwgLi4uKSBza2lwXG5cdCAqIHRyYWNraW5nIHNpbmNlIHNodXRkb3duIGRvZXMgbm90IG5lZWQgdG8gd2FpdCBmb3IgdGhlbS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdXcml0ZXMgPSBuZXcgU2V0PFByb21pc2U8dW5rbm93bj4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGF0aDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21pZ3JhdGlvbnM6IHJlYWRvbmx5IElTZXNzaW9uRGF0YWJhc2VNaWdyYXRpb25bXSA9IHNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbnMsXG5cdCkgeyB9XG5cblx0LyoqXG5cdCAqIE9wZW5zIChvciBjcmVhdGVzKSBhIFNRTGl0ZSBkYXRhYmFzZSBhdCB7QGxpbmsgcGF0aH0gYW5kIGFwcGxpZXNcblx0ICogYW55IHBlbmRpbmcgbWlncmF0aW9ucy4gT25seSB1c2VkIGluIHRlc3RzIHdoZXJlIHN5bmNocm9ub3VzXG5cdCAqIGNvbnN0cnVjdGlvbiArIGltbWVkaWF0ZSByZWFkaW5lc3MgaXMgZGVzaXJlZC5cblx0ICovXG5cdHN0YXRpYyBhc3luYyBvcGVuKHBhdGg6IHN0cmluZywgbWlncmF0aW9uczogcmVhZG9ubHkgSVNlc3Npb25EYXRhYmFzZU1pZ3JhdGlvbltdID0gc2Vzc2lvbkRhdGFiYXNlTWlncmF0aW9ucyk6IFByb21pc2U8U2Vzc2lvbkRhdGFiYXNlPiB7XG5cdFx0Y29uc3QgaW5zdCA9IG5ldyBTZXNzaW9uRGF0YWJhc2UocGF0aCwgbWlncmF0aW9ucyk7XG5cdFx0YXdhaXQgaW5zdC5fZW5zdXJlRGIoKTtcblx0XHRyZXR1cm4gaW5zdDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZW5zdXJlRGIoKTogUHJvbWlzZTxEYXRhYmFzZT4ge1xuXHRcdGlmICh0aGlzLl9jbG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1Nlc3Npb25EYXRhYmFzZSBoYXMgYmVlbiBkaXNwb3NlZCcpKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9kYlByb21pc2UpIHtcblx0XHRcdHRoaXMuX2RiUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIEVuc3VyZSB0aGUgcGFyZW50IGRpcmVjdG9yeSBleGlzdHMgYmVmb3JlIFNRTGl0ZSB0cmllcyB0b1xuXHRcdFx0XHQvLyBjcmVhdGUgdGhlIGRhdGFiYXNlIGZpbGUuXG5cdFx0XHRcdGF3YWl0IGZzLnByb21pc2VzLm1rZGlyKGRpcm5hbWUodGhpcy5fcGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRjb25zdCBkYiA9IGF3YWl0IGRiT3Blbih0aGlzLl9wYXRoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBydW5NaWdyYXRpb25zKGRiLCB0aGlzLl9taWdyYXRpb25zKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0YXdhaXQgZGJDbG9zZShkYik7XG5cdFx0XHRcdFx0dGhpcy5fZGJQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBJZiBkaXNwb3NlKCkgd2FzIGNhbGxlZCB3aGlsZSB3ZSB3ZXJlIG9wZW5pbmcsIGNsb3NlIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHRpZiAodGhpcy5fY2xvc2VkKSB7XG5cdFx0XHRcdFx0YXdhaXQgZGJDbG9zZShkYik7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTZXNzaW9uRGF0YWJhc2UgaGFzIGJlZW4gZGlzcG9zZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZGI7XG5cdFx0XHR9KSgpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2RiUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kYlByb21pc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbmFtZXMgb2YgYWxsIHVzZXItY3JlYXRlZCB0YWJsZXMgaW4gdGhlIGRhdGFiYXNlLlxuXHQgKiBVc2VmdWwgZm9yIHRlc3RpbmcgbWlncmF0aW9uIGJlaGF2aW9yLlxuXHQgKi9cblx0YXN5bmMgZ2V0QWxsVGFibGVzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93cyA9IGF3YWl0IGRiQWxsKGRiLCBgU0VMRUNUIG5hbWUgRlJPTSBzcWxpdGVfbWFzdGVyIFdIRVJFIHR5cGU9J3RhYmxlJyBPUkRFUiBCWSBuYW1lYCwgW10pO1xuXHRcdHJldHVybiByb3dzLm1hcChyID0+IHIubmFtZSBhcyBzdHJpbmcpO1xuXHR9XG5cblx0Ly8gLS0tLSBUdXJucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0Y3JlYXRlVHVybih0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFjayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0lOU0VSVCBPUiBJR05PUkUgSU5UTyB0dXJucyAoaWQpIFZBTFVFUyAoPyknLCBbdHVybklkXSk7XG5cdFx0fSk7XG5cdH1cblxuXHRkZWxldGVUdXJuKHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX211dGF0ZVR1cm5Vc2FnZShhc3luYyBkYiA9PiB7XG5cdFx0XHQvLyBGaWxlIGVkaXRzIGFuZCB0dXJuIHVzYWdlIGNhc2NhZGUtZGVsZXRlIHZpYSB0aGVpciBmb3JlaWduIGtleXMuXG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0RFTEVURSBGUk9NIHR1cm5zIFdIRVJFIGlkID0gPycsIFt0dXJuSWRdKTtcblx0XHR9KTtcblx0fVxuXG5cdHNldFR1cm5FdmVudElkKHR1cm5JZDogc3RyaW5nLCBldmVudElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0YXdhaXQgZGJSdW4oZGIsICdJTlNFUlQgT1IgSUdOT1JFIElOVE8gdHVybnMgKGlkKSBWQUxVRVMgKD8pJywgW3R1cm5JZF0pO1xuXHRcdFx0Ly8gT25seSBzZXQgdGhlIGV2ZW50IElEIGlmIG5vdCBhbHJlYWR5IHNldCBcdTIwMTQgc3RlZXJpbmcgbWVzc2FnZXNcblx0XHRcdC8vIHRyaWdnZXIgYWRkaXRpb25hbCB1c2VyLm1lc3NhZ2UgZXZlbnRzIHdpdGhpbiB0aGUgc2FtZSB0dXJuLFxuXHRcdFx0Ly8gYW5kIHdlIG11c3QgcHJlc2VydmUgdGhlIGZpcnN0IChib3VuZGFyeSkgZXZlbnQgSUQuXG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ1VQREFURSB0dXJucyBTRVQgZXZlbnRfaWQgPSA/IFdIRVJFIGlkID0gPyBBTkQgZXZlbnRfaWQgSVMgTlVMTCcsIFtldmVudElkLCB0dXJuSWRdKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldFR1cm5FdmVudElkKHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93ID0gYXdhaXQgZGJHZXQoZGIsICdTRUxFQ1QgZXZlbnRfaWQgRlJPTSB0dXJucyBXSEVSRSBpZCA9ID8nLCBbdHVybklkXSk7XG5cdFx0cmV0dXJuIHJvdz8uZXZlbnRfaWQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldE5leHRUdXJuRXZlbnRJZCh0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdC8vIGB0dXJucy5pZGAgaXMgdGhlIGNhbm9uaWNhbCB0dXJuIGtleSBcdTIwMTQgZWl0aGVyIGEgbGl2ZSBgcmVxdWVzdF94eHhgXG5cdFx0Ly8gZGlzcGF0Y2hlZCBieSB0aGUgY2xpZW50IG9yLCBmb3Igc2Vzc2lvbnMgcmVzdG9yZWQgZnJvbSBkaXNrLCB0aGVcblx0XHQvLyBTREsgZW52ZWxvcGUgaWQgc3VyZmFjZWQgYnkgYG1hcFNlc3Npb25FdmVudHNgLiBUaGUgYGV2ZW50X2lkYFxuXHRcdC8vIGZhbGxiYWNrIGNvdmVycyB0aGUgY2FzZSB3aGVyZSB0aGUgY2FsbGVyIGFza3MgYWJvdXQgYSB0dXJuIHRoYXRcblx0XHQvLyB3YXMgc2V0IHVwIGxpdmUgKGlkPWByZXF1ZXN0X3h4eGApIGJ1dCBpcyBub3cgYmVpbmcgcmVmZXJlbmNlZFxuXHRcdC8vIHZpYSB0aGUgU0RLIGV2ZW50IGlkLCBvciB2aWNlIHZlcnNhLlxuXHRcdGNvbnN0IHJvdyA9IGF3YWl0IGRiR2V0KFxuXHRcdFx0ZGIsXG5cdFx0XHRgU0VMRUNUIGV2ZW50X2lkIEZST00gdHVybnNcblx0XHRcdFx0V0hFUkUgcm93aWQgPiAoXG5cdFx0XHRcdFx0U0VMRUNUIHJvd2lkIEZST00gdHVybnMgV0hFUkUgaWQgPSA/MSBPUiBldmVudF9pZCA9ID8xIExJTUlUIDFcblx0XHRcdFx0KVxuXHRcdFx0XHRPUkRFUiBCWSByb3dpZCBMSU1JVCAxYCxcblx0XHRcdFt0dXJuSWRdLFxuXHRcdCk7XG5cdFx0cmV0dXJuIHJvdz8uZXZlbnRfaWQgYXMgc3RyaW5nIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldEZpcnN0VHVybkV2ZW50SWQoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93ID0gYXdhaXQgZGJHZXQoZGIsICdTRUxFQ1QgZXZlbnRfaWQgRlJPTSB0dXJucyBPUkRFUiBCWSByb3dpZCBMSU1JVCAxJywgW10pO1xuXHRcdHJldHVybiByb3c/LmV2ZW50X2lkIGFzIHN0cmluZyB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXRUdXJuVXNhZ2UodHVybklkOiBzdHJpbmcsIHVzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbXV0YXRlVHVyblVzYWdlKGFzeW5jIGRiID0+IHtcblx0XHRcdC8vIEVuc3VyZSB0aGUgdHVybiBleGlzdHMgXHUyMDE0IGxhemlseSBpbnNlcnQgc2luY2UgdGhlIHR1cm4gcmVjb3JkIG1heSBub3Rcblx0XHRcdC8vIGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGFuIGV4cGxpY2l0IGNyZWF0ZVR1cm4oKSBjYWxsLiBUaGlzIGlzIHdoYXQgbWFrZXNcblx0XHRcdC8vIHRoZSByb3cgcmVhY2hhYmxlIGJ5IHRoZSBjYXNjYWRlIG9uIGV2ZXJ5IHBydW5lIHBhdGg7IHNlZSBtaWdyYXRpb24gOVxuXHRcdFx0Ly8gZm9yIHdoeSBjcmVhdGluZyBpdCBjYW5ub3QgcGVydHVyYiB0dXJuIG9yZGVyaW5nLlxuXHRcdFx0YXdhaXQgZGJSdW4oZGIsICdJTlNFUlQgT1IgSUdOT1JFIElOVE8gdHVybnMgKGlkKSBWQUxVRVMgKD8pJywgW3R1cm5JZF0pO1xuXHRcdFx0YXdhaXQgZGJSdW4oZGIsICdJTlNFUlQgT1IgUkVQTEFDRSBJTlRPIHR1cm5fdXNhZ2UgKHR1cm5faWQsIHVzYWdlKSBWQUxVRVMgKD8sID8pJywgW3R1cm5JZCwgdXNhZ2VdKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldFR1cm5Vc2FnZXMoKTogUHJvbWlzZTxNYXA8c3RyaW5nLCBzdHJpbmc+PiB7XG5cdFx0Ly8gUXVldWVkIG9uIHRoZSBzYW1lIHNlcXVlbmNlciBhcyB0aGUgd3JpdGVzLCBub3QgcnVuIGRpcmVjdGx5OiBgc2V0VHVyblVzYWdlYCBpc1xuXHRcdC8vIGZpcmUtYW5kLWZvcmdldCBhbmQgYEB2c2NvZGUvc3FsaXRlM2AgaXMgcGFyYWxsZWxpemVkLCBzbyBhIHJlc3RvcmUgdGhhdCByZWFkcyBzdHJhaWdodFxuXHRcdC8vIHRocm91Z2ggY2FuIG1pc3MgYSB3cml0ZSBzdWJtaXR0ZWQgYmVmb3JlIGl0IGFuZCBwZXJtYW5lbnRseSByZWJ1aWxkIHRoYXQgdHVybiB3aXRob3V0XG5cdFx0Ly8gaXRzIGNvc3QuIFJlYWQtYWZ0ZXItd3JpdGUgb3JkZXJpbmcgaXMgd2hhdCBtYWtlcyB0aGUgb3ZlcmxheSBkZXRlcm1pbmlzdGljLlxuXHRcdHJldHVybiB0aGlzLl90dXJuVXNhZ2VTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0Ly8gTGVmdC1qb2luIGB0dXJuc2Agc28gYSB1c2FnZSByb3cgcmVjb3JkZWQgYWdhaW5zdCBhIGxpdmUgcmVxdWVzdCBpZCBpc1xuXHRcdFx0Ly8gYWxzbyByZWFjaGFibGUgYnkgdGhlIFNESyBldmVudCBpZCBhIHJlc3RvcmVkIHR1cm4gaXMga2V5ZWQgYnkuXG5cdFx0XHRjb25zdCByb3dzID0gYXdhaXQgZGJBbGwoXG5cdFx0XHRcdGRiLFxuXHRcdFx0XHRgU0VMRUNUIHUudHVybl9pZCBBUyB0dXJuX2lkLCB0LmV2ZW50X2lkIEFTIGV2ZW50X2lkLCB1LnVzYWdlIEFTIHVzYWdlXG5cdFx0XHRcdEZST00gdHVybl91c2FnZSB1IExFRlQgSk9JTiB0dXJucyB0IE9OIHQuaWQgPSB1LnR1cm5faWRgLFxuXHRcdFx0XHRbXSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdFx0Zm9yIChjb25zdCByb3cgb2Ygcm93cykge1xuXHRcdFx0XHRjb25zdCB1c2FnZSA9IHJvdy51c2FnZSBhcyBzdHJpbmc7XG5cdFx0XHRcdHJlc3VsdC5zZXQocm93LnR1cm5faWQgYXMgc3RyaW5nLCB1c2FnZSk7XG5cdFx0XHRcdGNvbnN0IGV2ZW50SWQgPSByb3cuZXZlbnRfaWQgYXMgc3RyaW5nIHwgbnVsbDtcblx0XHRcdFx0aWYgKGV2ZW50SWQpIHtcblx0XHRcdFx0XHRyZXN1bHQuc2V0KGV2ZW50SWQsIHVzYWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0fVxuXG5cdHNldFR1cm5DaGVja3BvaW50UmVmKHR1cm5JZDogc3RyaW5nLCByZWY6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFjayhhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0lOU0VSVCBPUiBJR05PUkUgSU5UTyB0dXJucyAoaWQpIFZBTFVFUyAoPyknLCBbdHVybklkXSk7XG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ1VQREFURSB0dXJucyBTRVQgY2hlY2twb2ludF9yZWYgPSA/IFdIRVJFIGlkID0gPycsIFtyZWYsIHR1cm5JZF0pO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0VHVybkNoZWNrcG9pbnRSZWYodHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3cgPSBhd2FpdCBkYkdldChkYiwgJ1NFTEVDVCBjaGVja3BvaW50X3JlZiBGUk9NIHR1cm5zIFdIRVJFIGlkID0gPzEgT1IgZXZlbnRfaWQgPSA/MSBMSU1JVCAxJywgW3R1cm5JZF0pO1xuXHRcdHJldHVybiByb3c/LmNoZWNrcG9pbnRfcmVmIGFzIHN0cmluZyB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRQcmV2aW91c0NoZWNrcG9pbnRSZWYodHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3cgPSBhd2FpdCBkYkdldChcblx0XHRcdGRiLFxuXHRcdFx0YFNFTEVDVCBjaGVja3BvaW50X3JlZiBGUk9NIHR1cm5zXG5cdFx0XHRcdFdIRVJFIHJvd2lkIDwgKFNFTEVDVCByb3dpZCBGUk9NIHR1cm5zIFdIRVJFIGlkID0gPzEgT1IgZXZlbnRfaWQgPSA/MSBMSU1JVCAxKVxuXHRcdFx0XHRcdEFORCBjaGVja3BvaW50X3JlZiBJUyBOT1QgTlVMTFxuXHRcdFx0XHRPUkRFUiBCWSByb3dpZCBERVNDIExJTUlUIDFgLFxuXHRcdFx0W3R1cm5JZF0sXG5cdFx0KTtcblx0XHRyZXR1cm4gcm93Py5jaGVja3BvaW50X3JlZiBhcyBzdHJpbmcgfCB1bmRlZmluZWQgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWxsQ2hlY2twb2ludFJlZnMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3dzID0gYXdhaXQgZGJBbGwoZGIsICdTRUxFQ1QgY2hlY2twb2ludF9yZWYgRlJPTSB0dXJucyBXSEVSRSBjaGVja3BvaW50X3JlZiBJUyBOT1QgTlVMTCBPUkRFUiBCWSByb3dpZCcsIFtdKTtcblx0XHRyZXR1cm4gcm93cy5tYXAociA9PiByLmNoZWNrcG9pbnRfcmVmIGFzIHN0cmluZyk7XG5cdH1cblxuXHR0cnVuY2F0ZUZyb21UdXJuKHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX211dGF0ZVR1cm5Vc2FnZShhc3luYyBkYiA9PiB7XG5cdFx0XHQvLyBEZWxldGUgdGhlIHRhcmdldCB0dXJuIGFuZCBhbGwgdHVybnMgaW5zZXJ0ZWQgYWZ0ZXIgaXQgKGJ5IHJvd2lkIG9yZGVyKS5cblx0XHRcdC8vIEZpbGUgZWRpdHMgYW5kIHR1cm4gdXNhZ2UgY2FzY2FkZS1kZWxldGUgdmlhIHRoZWlyIGZvcmVpZ24ga2V5cy5cblx0XHRcdGF3YWl0IGRiUnVuKGRiLFxuXHRcdFx0XHRgREVMRVRFIEZST00gdHVybnMgV0hFUkUgcm93aWQgPj0gKFNFTEVDVCByb3dpZCBGUk9NIHR1cm5zIFdIRVJFIGlkID0gPylgLFxuXHRcdFx0XHRbdHVybklkXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRkZWxldGVUdXJuc0FmdGVyKHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX211dGF0ZVR1cm5Vc2FnZShhc3luYyBkYiA9PiB7XG5cdFx0XHQvLyBEZWxldGUgYWxsIHR1cm5zIGluc2VydGVkIGFmdGVyIHRoZSBnaXZlbiB0dXJuIChieSByb3dpZCBvcmRlciksXG5cdFx0XHQvLyBrZWVwaW5nIHRoZSBnaXZlbiB0dXJuIGl0c2VsZi4gRmlsZSBlZGl0cyBhbmQgdHVybiB1c2FnZVxuXHRcdFx0Ly8gY2FzY2FkZS1kZWxldGUgdmlhIHRoZWlyIGZvcmVpZ24ga2V5cy5cblx0XHRcdGF3YWl0IGRiUnVuKGRiLFxuXHRcdFx0XHRgREVMRVRFIEZST00gdHVybnMgV0hFUkUgcm93aWQgPiAoU0VMRUNUIHJvd2lkIEZST00gdHVybnMgV0hFUkUgaWQgPSA/KWAsXG5cdFx0XHRcdFt0dXJuSWRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdGRlbGV0ZUFsbFR1cm5zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9tdXRhdGVUdXJuVXNhZ2UoYXN5bmMgZGIgPT4ge1xuXHRcdFx0Ly8gRmlsZSBlZGl0cyBhbmQgdHVybiB1c2FnZSBjYXNjYWRlLWRlbGV0ZSB2aWEgdGhlaXIgZm9yZWlnbiBrZXlzLlxuXHRcdFx0YXdhaXQgZGJFeGVjKGRiLCAnREVMRVRFIEZST00gdHVybnMnKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLS0gTG9jYWwgKGhvc3QtaW5qZWN0ZWQpIHR1cm5zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGluc2VydExvY2FsVHVybihyZWNvcmQ6IElMb2NhbFR1cm5SZWNvcmQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0YXdhaXQgZGJSdW4oZGIsXG5cdFx0XHRcdCdJTlNFUlQgT1IgUkVQTEFDRSBJTlRPIGxvY2FsX3R1cm5zICh0dXJuX2lkLCBjaGF0X3VyaSwgYW5jaG9yX3R1cm5faWQsIHNlcSwgcGF5bG9hZCkgVkFMVUVTICg/LCA/LCA/LCA/LCA/KScsXG5cdFx0XHRcdFtyZWNvcmQudHVybklkLCByZWNvcmQuY2hhdFVyaSwgcmVjb3JkLmFuY2hvclR1cm5JZCA/PyBudWxsLCByZWNvcmQuc2VxLCByZWNvcmQucGF5bG9hZF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0TG9jYWxUdXJucygpOiBQcm9taXNlPElMb2NhbFR1cm5SZWNvcmRbXT4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3dzID0gYXdhaXQgZGJBbGwoZGIsICdTRUxFQ1QgdHVybl9pZCwgY2hhdF91cmksIGFuY2hvcl90dXJuX2lkLCBzZXEsIHBheWxvYWQgRlJPTSBsb2NhbF90dXJucyBPUkRFUiBCWSBzZXEnLCBbXSk7XG5cdFx0cmV0dXJuIHJvd3MubWFwKHIgPT4gKHtcblx0XHRcdHR1cm5JZDogci50dXJuX2lkIGFzIHN0cmluZyxcblx0XHRcdGNoYXRVcmk6IHIuY2hhdF91cmkgYXMgc3RyaW5nLFxuXHRcdFx0YW5jaG9yVHVybklkOiAoci5hbmNob3JfdHVybl9pZCBhcyBzdHJpbmcgfCBudWxsKSA/PyB1bmRlZmluZWQsXG5cdFx0XHRzZXE6IHIuc2VxIGFzIG51bWJlcixcblx0XHRcdHBheWxvYWQ6IHIucGF5bG9hZCBhcyBzdHJpbmcsXG5cdFx0fSkpO1xuXHR9XG5cblx0ZGVsZXRlTG9jYWxUdXJucyh0dXJuSWRzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFjayhhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodHVybklkcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJzID0gdHVybklkcy5tYXAoKCkgPT4gJz8nKS5qb2luKCcsJyk7XG5cdFx0XHRhd2FpdCBkYlJ1bihkYiwgYERFTEVURSBGUk9NIGxvY2FsX3R1cm5zIFdIRVJFIHR1cm5faWQgSU4gKCR7cGxhY2Vob2xkZXJzfSlgLCBbLi4udHVybklkc10pO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tLSBGaWxlIGVkaXRzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3RvcmVGaWxlRWRpdChlZGl0OiBJRmlsZUVkaXRSZWNvcmQgJiBJRmlsZUVkaXRDb250ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrKCgpID0+IHRoaXMuX2ZpbGVFZGl0U2VxdWVuY2VyLnF1ZXVlKGVkaXQuZmlsZVBhdGgsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRcdC8vIEVuc3VyZSB0aGUgdHVybiBleGlzdHMgXHUyMDE0IGxhemlseSBpbnNlcnQgc2luY2UgdGhlIHR1cm4gcmVjb3JkXG5cdFx0XHQvLyBtYXkgbm90IGhhdmUgYmVlbiBjcmVhdGVkIGJ5IGFuIGV4cGxpY2l0IGNyZWF0ZVR1cm4oKSBjYWxsLlxuXHRcdFx0YXdhaXQgZGJSdW4oZGIsICdJTlNFUlQgT1IgSUdOT1JFIElOVE8gdHVybnMgKGlkKSBWQUxVRVMgKD8pJywgW2VkaXQudHVybklkXSk7XG5cdFx0XHRhd2FpdCBkYlJ1bihcblx0XHRcdFx0ZGIsXG5cdFx0XHRcdGBJTlNFUlQgT1IgUkVQTEFDRSBJTlRPIGZpbGVfZWRpdHNcblx0XHRcdFx0XHQodHVybl9pZCwgdG9vbF9jYWxsX2lkLCBmaWxlX3BhdGgsIGVkaXRfdHlwZSwgb3JpZ2luYWxfcGF0aCwgYmVmb3JlX2NvbnRlbnQsIGFmdGVyX2NvbnRlbnQsIGFkZGVkX2xpbmVzLCByZW1vdmVkX2xpbmVzKVxuXHRcdFx0XHRWQUxVRVMgKD8sID8sID8sID8sID8sID8sID8sID8sID8pYCxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGVkaXQudHVybklkLFxuXHRcdFx0XHRcdGVkaXQudG9vbENhbGxJZCxcblx0XHRcdFx0XHRlZGl0LmZpbGVQYXRoLFxuXHRcdFx0XHRcdGVkaXQua2luZCxcblx0XHRcdFx0XHRlZGl0Lm9yaWdpbmFsUGF0aCA/PyBudWxsLFxuXHRcdFx0XHRcdGVkaXQuYmVmb3JlQ29udGVudCA/IEJ1ZmZlci5mcm9tKGVkaXQuYmVmb3JlQ29udGVudCkgOiBudWxsLFxuXHRcdFx0XHRcdGVkaXQuYWZ0ZXJDb250ZW50ID8gQnVmZmVyLmZyb20oZWRpdC5hZnRlckNvbnRlbnQpIDogbnVsbCxcblx0XHRcdFx0XHRlZGl0LmFkZGVkTGluZXMgPz8gbnVsbCxcblx0XHRcdFx0XHRlZGl0LnJlbW92ZWRMaW5lcyA/PyBudWxsLFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRGaWxlRWRpdHModG9vbENhbGxJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxJRmlsZUVkaXRSZWNvcmRbXT4ge1xuXHRcdGlmICh0b29sQ2FsbElkcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHBsYWNlaG9sZGVycyA9IHRvb2xDYWxsSWRzLm1hcCgoKSA9PiAnPycpLmpvaW4oJywnKTtcblx0XHRjb25zdCByb3dzID0gYXdhaXQgZGJBbGwoXG5cdFx0XHRkYixcblx0XHRcdGBTRUxFQ1QgdHVybl9pZCwgdG9vbF9jYWxsX2lkLCBmaWxlX3BhdGgsIGVkaXRfdHlwZSwgb3JpZ2luYWxfcGF0aCwgYWRkZWRfbGluZXMsIHJlbW92ZWRfbGluZXNcblx0XHRcdFx0RlJPTSBmaWxlX2VkaXRzXG5cdFx0XHRcdFdIRVJFIHRvb2xfY2FsbF9pZCBJTiAoJHtwbGFjZWhvbGRlcnN9KVxuXHRcdFx0XHRPUkRFUiBCWSByb3dpZGAsXG5cdFx0XHR0b29sQ2FsbElkcyxcblx0XHQpO1xuXHRcdHJldHVybiByb3dzLm1hcChyb3cgPT4gKHtcblx0XHRcdHR1cm5JZDogcm93LnR1cm5faWQgYXMgc3RyaW5nLFxuXHRcdFx0dG9vbENhbGxJZDogcm93LnRvb2xfY2FsbF9pZCBhcyBzdHJpbmcsXG5cdFx0XHRmaWxlUGF0aDogcm93LmZpbGVfcGF0aCBhcyBzdHJpbmcsXG5cdFx0XHRraW5kOiAocm93LmVkaXRfdHlwZSBhcyBJRmlsZUVkaXRSZWNvcmRbJ2tpbmQnXSkgPz8gJ2VkaXQnLFxuXHRcdFx0b3JpZ2luYWxQYXRoOiByb3cub3JpZ2luYWxfcGF0aCBhcyBzdHJpbmcgfCB1bmRlZmluZWQgPz8gdW5kZWZpbmVkLFxuXHRcdFx0YWRkZWRMaW5lczogcm93LmFkZGVkX2xpbmVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQsXG5cdFx0XHRyZW1vdmVkTGluZXM6IHJvdy5yZW1vdmVkX2xpbmVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQsXG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWxsRmlsZUVkaXRzKCk6IFByb21pc2U8SUZpbGVFZGl0UmVjb3JkW10+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93cyA9IGF3YWl0IGRiQWxsKFxuXHRcdFx0ZGIsXG5cdFx0XHRgU0VMRUNUIHR1cm5faWQsIHRvb2xfY2FsbF9pZCwgZmlsZV9wYXRoLCBlZGl0X3R5cGUsIG9yaWdpbmFsX3BhdGgsIGFkZGVkX2xpbmVzLCByZW1vdmVkX2xpbmVzXG5cdFx0XHRcdEZST00gZmlsZV9lZGl0c1xuXHRcdFx0XHRPUkRFUiBCWSByb3dpZGAsXG5cdFx0XHRbXSxcblx0XHQpO1xuXHRcdHJldHVybiByb3dzLm1hcChyb3cgPT4gKHtcblx0XHRcdHR1cm5JZDogcm93LnR1cm5faWQgYXMgc3RyaW5nLFxuXHRcdFx0dG9vbENhbGxJZDogcm93LnRvb2xfY2FsbF9pZCBhcyBzdHJpbmcsXG5cdFx0XHRmaWxlUGF0aDogcm93LmZpbGVfcGF0aCBhcyBzdHJpbmcsXG5cdFx0XHRraW5kOiAocm93LmVkaXRfdHlwZSBhcyBJRmlsZUVkaXRSZWNvcmRbJ2tpbmQnXSkgPz8gJ2VkaXQnLFxuXHRcdFx0b3JpZ2luYWxQYXRoOiByb3cub3JpZ2luYWxfcGF0aCBhcyBzdHJpbmcgfCB1bmRlZmluZWQgPz8gdW5kZWZpbmVkLFxuXHRcdFx0YWRkZWRMaW5lczogcm93LmFkZGVkX2xpbmVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQsXG5cdFx0XHRyZW1vdmVkTGluZXM6IHJvdy5yZW1vdmVkX2xpbmVzIGFzIG51bWJlciB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQsXG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0RmlsZUVkaXRzQnlUdXJuKHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxJRmlsZUVkaXRSZWNvcmRbXT4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3dzID0gYXdhaXQgZGJBbGwoXG5cdFx0XHRkYixcblx0XHRcdGBTRUxFQ1QgdHVybl9pZCwgdG9vbF9jYWxsX2lkLCBmaWxlX3BhdGgsIGVkaXRfdHlwZSwgb3JpZ2luYWxfcGF0aCwgYWRkZWRfbGluZXMsIHJlbW92ZWRfbGluZXNcblx0XHRcdFx0RlJPTSBmaWxlX2VkaXRzXG5cdFx0XHRcdFdIRVJFIHR1cm5faWQgPSA/XG5cdFx0XHRcdE9SREVSIEJZIHJvd2lkYCxcblx0XHRcdFt0dXJuSWRdLFxuXHRcdCk7XG5cdFx0cmV0dXJuIHJvd3MubWFwKHJvdyA9PiAoe1xuXHRcdFx0dHVybklkOiByb3cudHVybl9pZCBhcyBzdHJpbmcsXG5cdFx0XHR0b29sQ2FsbElkOiByb3cudG9vbF9jYWxsX2lkIGFzIHN0cmluZyxcblx0XHRcdGZpbGVQYXRoOiByb3cuZmlsZV9wYXRoIGFzIHN0cmluZyxcblx0XHRcdGtpbmQ6IChyb3cuZWRpdF90eXBlIGFzIElGaWxlRWRpdFJlY29yZFsna2luZCddKSA/PyAnZWRpdCcsXG5cdFx0XHRvcmlnaW5hbFBhdGg6IHJvdy5vcmlnaW5hbF9wYXRoIGFzIHN0cmluZyB8IHVuZGVmaW5lZCA/PyB1bmRlZmluZWQsXG5cdFx0XHRhZGRlZExpbmVzOiByb3cuYWRkZWRfbGluZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZCxcblx0XHRcdHJlbW92ZWRMaW5lczogcm93LnJlbW92ZWRfbGluZXMgYXMgbnVtYmVyIHwgdW5kZWZpbmVkID8/IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyByZWFkRmlsZUVkaXRDb250ZW50KHRvb2xDYWxsSWQ6IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZyk6IFByb21pc2U8SUZpbGVFZGl0Q29udGVudCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9maWxlRWRpdFNlcXVlbmNlci5xdWV1ZShmaWxlUGF0aCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0Y29uc3Qgcm93ID0gYXdhaXQgZGJHZXQoXG5cdFx0XHRcdGRiLFxuXHRcdFx0XHRgU0VMRUNUIGJlZm9yZV9jb250ZW50LCBhZnRlcl9jb250ZW50XG5cdFx0XHRcdFx0RlJPTSBmaWxlX2VkaXRzXG5cdFx0XHRcdFx0V0hFUkUgdG9vbF9jYWxsX2lkID0gPyBBTkQgZmlsZV9wYXRoID0gP2AsXG5cdFx0XHRcdFt0b29sQ2FsbElkLCBmaWxlUGF0aF0sXG5cdFx0XHQpO1xuXHRcdFx0aWYgKCFyb3cpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IHJvdy5iZWZvcmVfY29udGVudCA/IHRvVWludDhBcnJheShyb3cuYmVmb3JlX2NvbnRlbnQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IHJvdy5hZnRlcl9jb250ZW50ID8gdG9VaW50OEFycmF5KHJvdy5hZnRlcl9jb250ZW50KSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0tIFNlc3Npb24gbWV0YWRhdGEgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBnZXRNZXRhZGF0YShrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHJvdyA9IGF3YWl0IGRiR2V0KGRiLCAnU0VMRUNUIHZhbHVlIEZST00gc2Vzc2lvbl9tZXRhZGF0YSBXSEVSRSBrZXkgPSA/JywgW2tleV0pO1xuXHRcdHJldHVybiByb3c/LnZhbHVlIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldE1ldGFkYXRhT2JqZWN0PFQgZXh0ZW5kcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4ob2JqOiBUKTogUHJvbWlzZTx7IFtLIGluIGtleW9mIFRdOiBzdHJpbmcgfCB1bmRlZmluZWQgfT4ge1xuXHRcdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhvYmopIGFzIChrZXlvZiBUICYgc3RyaW5nKVtdO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRjb25zdCByZXN1bHQgPSB7fSBhcyB7IFtLIGluIGtleW9mIFRdOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCBwbGFjZWhvbGRlcnMgPSBrZXlzLm1hcCgoKSA9PiAnPycpLmpvaW4oJywnKTtcblx0XHRjb25zdCByb3dzID0gYXdhaXQgZGJBbGwoZGIsIGBTRUxFQ1Qga2V5LCB2YWx1ZSBGUk9NIHNlc3Npb25fbWV0YWRhdGEgV0hFUkUga2V5IElOICgke3BsYWNlaG9sZGVyc30pYCwga2V5cyk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0cmVzdWx0W2tleV0gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcblx0XHRcdHJlc3VsdFtyb3cua2V5IGFzIGtleW9mIFRdID0gcm93LnZhbHVlIGFzIHN0cmluZztcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHNldE1ldGFkYXRhKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrKCgpID0+IHRoaXMuX21ldGFkYXRhU2VxdWVuY2VyLnF1ZXVlKGtleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0YXdhaXQgZGJSdW4oZGIsICdJTlNFUlQgT1IgUkVQTEFDRSBJTlRPIHNlc3Npb25fbWV0YWRhdGEgKGtleSwgdmFsdWUpIFZBTFVFUyAoPywgPyknLCBba2V5LCB2YWx1ZV0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldENoYXREcmFmdChjaGF0OiBVUkksIGRyYWZ0OiBNZXNzYWdlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHRyZXR1cm4gdGhpcy5fdHJhY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdFx0aWYgKCFkcmFmdCkge1xuXHRcdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ0RFTEVURSBGUk9NIGNoYXRfZHJhZnRzIFdIRVJFIGNoYXRfdXJpID0gPycsIFtjaGF0VXJpXSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnSU5TRVJUIE9SIFJFUExBQ0UgSU5UTyBjaGF0X2RyYWZ0cyAoY2hhdF91cmksIGRyYWZ0KSBWQUxVRVMgKD8sID8pJywgW2NoYXRVcmksIEpTT04uc3RyaW5naWZ5KGRyYWZ0KV0pO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hhdERyYWZ0KGNoYXQ6IFVSSSk6IFByb21pc2U8TWVzc2FnZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3cgPSBhd2FpdCBkYkdldChkYiwgJ1NFTEVDVCBkcmFmdCBGUk9NIGNoYXRfZHJhZnRzIFdIRVJFIGNoYXRfdXJpID0gPycsIFtjaGF0LnRvU3RyaW5nKCldKTtcblx0XHRpZiAodHlwZW9mIHJvdz8uZHJhZnQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2Uocm93LmRyYWZ0KSBhcyBNZXNzYWdlO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIFJldmlld2VkIGZpbGVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRtYXJrRmlsZVJldmlld2VkKHVyaTogVVJJLCBub25jZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnSU5TRVJUIE9SIElHTk9SRSBJTlRPIHJldmlld2VkX2ZpbGVzICh1cmksIG5vbmNlKSBWQUxVRVMgKD8sID8pJywgW3VyaS50b1N0cmluZygpLCBub25jZV0pO1xuXHRcdH0pO1xuXHR9XG5cblx0dW5tYXJrRmlsZVJldmlld2VkKHVyaTogVVJJLCBub25jZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNrKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnREVMRVRFIEZST00gcmV2aWV3ZWRfZmlsZXMgV0hFUkUgdXJpID0gPyBBTkQgbm9uY2UgPSA/JywgW3VyaS50b1N0cmluZygpLCBub25jZV0pO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0UmV2aWV3ZWRGaWxlcygpOiBQcm9taXNlPElSZXZpZXdlZEZpbGVSZWNvcmRbXT4ge1xuXHRcdGNvbnN0IGRiID0gYXdhaXQgdGhpcy5fZW5zdXJlRGIoKTtcblx0XHRjb25zdCByb3dzID0gYXdhaXQgZGJBbGwoZGIsICdTRUxFQ1QgdXJpLCBub25jZSBGUk9NIHJldmlld2VkX2ZpbGVzIE9SREVSIEJZIHJvd2lkJywgW10pO1xuXHRcdHJldHVybiByb3dzLm1hcCh0b1Jldmlld2VkRmlsZVJlY29yZCk7XG5cdH1cblxuXHRhc3luYyBnZXRSZXZpZXdlZEZpbGVzRm9yVXJpKHVyaTogVVJJKTogUHJvbWlzZTxJUmV2aWV3ZWRGaWxlUmVjb3JkW10+IHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0Y29uc3Qgcm93cyA9IGF3YWl0IGRiQWxsKGRiLCAnU0VMRUNUIHVyaSwgbm9uY2UgRlJPTSByZXZpZXdlZF9maWxlcyBXSEVSRSB1cmkgPSA/IE9SREVSIEJZIHJvd2lkJywgW3VyaS50b1N0cmluZygpXSk7XG5cdFx0cmV0dXJuIHJvd3MubWFwKHRvUmV2aWV3ZWRGaWxlUmVjb3JkKTtcblx0fVxuXG5cdGFzeW5jIGlzRmlsZVJldmlld2VkKHVyaTogVVJJLCBub25jZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZGIgPSBhd2FpdCB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGNvbnN0IHJvdyA9IGF3YWl0IGRiR2V0KGRiLCAnU0VMRUNUIDEgRlJPTSByZXZpZXdlZF9maWxlcyBXSEVSRSB1cmkgPSA/IEFORCBub25jZSA9ID8gTElNSVQgMScsIFt1cmkudG9TdHJpbmcoKSwgbm9uY2VdKTtcblx0XHRyZXR1cm4gISFyb3c7XG5cdH1cblxuXHRyZW1hcFR1cm5JZHMobWFwcGluZzogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTXV0YXRlcyBgdHVybl91c2FnZWAsIHNvIGl0IG11c3Qgc2VyaWFsaXplIHdpdGggZXZlcnkgb3RoZXIgc3VjaFxuXHRcdC8vIG11dGF0aW9uIFx1MjAxNCBhIHVzYWdlIHdyaXRlIHJhY2luZyB0aGUgZm9yayB0cmFuc2FjdGlvbiB3b3VsZCBvdGhlcndpc2Vcblx0XHQvLyBsYW5kIGFnYWluc3QgZWl0aGVyIHRoZSBvbGQgb3IgdGhlIG5ldyB0dXJuIGlkIHVucHJlZGljdGFibHkuXG5cdFx0cmV0dXJuIHRoaXMuX211dGF0ZVR1cm5Vc2FnZShhc3luYyBkYiA9PiB7XG5cdFx0XHQvLyBEZWZlciBGSyBjaGVja3MgdG8gY29tbWl0IHRpbWUgc28gd2UgY2FuIHVwZGF0ZSB0dXJucy5pZCBhbmRcblx0XHRcdC8vIGZpbGVfZWRpdHMudHVybl9pZCBpbiBhbnkgb3JkZXIgd2l0aG91dCBtaWQtc3RhdGVtZW50IHZpb2xhdGlvbnMuXG5cdFx0XHQvLyBUaGlzIHByYWdtYSBhdXRvLXJlc2V0cyBhZnRlciB0aGUgdHJhbnNhY3Rpb24gZW5kcy5cblx0XHRcdGF3YWl0IGRiRXhlYyhkYiwgJ1BSQUdNQSBkZWZlcl9mb3JlaWduX2tleXMgPSBPTicpO1xuXHRcdFx0YXdhaXQgZGJFeGVjKGRiLCAnQkVHSU4gVFJBTlNBQ1RJT04nKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIERlbGV0ZSB0dXJucyBub3QgcHJlc2VudCBpbiB0aGUgbWFwcGluZyAoZS5nLiB0dXJucyBiZXlvbmRcblx0XHRcdFx0Ly8gdGhlIGZvcmsgcG9pbnQpLiBGaWxlIGVkaXRzIGNhc2NhZGUtZGVsZXRlIHZpYSBGSy5cblx0XHRcdFx0Y29uc3Qgb2xkSWRzID0gWy4uLm1hcHBpbmcua2V5cygpXTtcblx0XHRcdFx0aWYgKG9sZElkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJzID0gb2xkSWRzLm1hcCgoKSA9PiAnPycpLmpvaW4oJywnKTtcblx0XHRcdFx0XHRhd2FpdCBkYlJ1bihkYixcblx0XHRcdFx0XHRcdGBERUxFVEUgRlJPTSB0dXJucyBXSEVSRSBpZCBOT1QgSU4gKCR7cGxhY2Vob2xkZXJzfSlgLFxuXHRcdFx0XHRcdFx0b2xkSWRzLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZW1hcCB0aGUgcmVtYWluaW5nIHR1cm4gSURzIHRvIHRoZWlyIG5ldyB2YWx1ZXNcblx0XHRcdFx0Zm9yIChjb25zdCBbb2xkSWQsIG5ld0lkXSBvZiBtYXBwaW5nKSB7XG5cdFx0XHRcdFx0YXdhaXQgZGJSdW4oZGIsICdVUERBVEUgdHVybnMgU0VUIGlkID0gPyBXSEVSRSBpZCA9ID8nLCBbbmV3SWQsIG9sZElkXSk7XG5cdFx0XHRcdFx0YXdhaXQgZGJSdW4oZGIsICdVUERBVEUgZmlsZV9lZGl0cyBTRVQgdHVybl9pZCA9ID8gV0hFUkUgdHVybl9pZCA9ID8nLCBbbmV3SWQsIG9sZElkXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAob2xkSWRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBwbGFjZWhvbGRlcnMgPSBvbGRJZHMubWFwKCgpID0+ICc/Jykuam9pbignLCcpO1xuXHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLFxuXHRcdFx0XHRcdFx0YERFTEVURSBGUk9NIGxvY2FsX3R1cm5zIFdIRVJFIHR1cm5faWQgTk9UIElOICgke3BsYWNlaG9sZGVyc30pYCxcblx0XHRcdFx0XHRcdG9sZElkcyxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgW29sZElkLCBuZXdJZF0gb2YgbWFwcGluZykge1xuXHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnVVBEQVRFIGxvY2FsX3R1cm5zIFNFVCB0dXJuX2lkID0gPyBXSEVSRSB0dXJuX2lkID0gPycsIFtuZXdJZCwgb2xkSWRdKTtcblx0XHRcdFx0XHRhd2FpdCBkYlJ1bihkYiwgJ1VQREFURSBsb2NhbF90dXJucyBTRVQgYW5jaG9yX3R1cm5faWQgPSA/IFdIRVJFIGFuY2hvcl90dXJuX2lkID0gPycsIFtuZXdJZCwgb2xkSWRdKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJvd3MgcGFzdCB0aGUgZm9yayBwb2ludCB3ZXJlIGFscmVhZHkgcmVtb3ZlZCBieSB0aGUgYHR1cm5zYFxuXHRcdFx0XHQvLyBkZWxldGUgYWJvdmUsIHZpYSB0aGUgc2FtZSBjYXNjYWRlIGFzIGZpbGUgZWRpdHMuIFRoZSBzdXJ2aXZpbmdcblx0XHRcdFx0Ly8gaWRzIHN0aWxsIG5lZWQgcmVtYXBwaW5nICh0aGUgRksgY2FzY2FkZXMgZGVsZXRlcywgbm90IHVwZGF0ZXMpLFxuXHRcdFx0XHQvLyBvciB0aGUgZm9ya2VkIHNlc3Npb24gd291bGQgcmVzdG9yZSB3aXRoIG5vIGdhdWdlIGFuZCB6ZXJvIGNvc3QuXG5cdFx0XHRcdGZvciAoY29uc3QgW29sZElkLCBuZXdJZF0gb2YgbWFwcGluZykge1xuXHRcdFx0XHRcdGF3YWl0IGRiUnVuKGRiLCAnVVBEQVRFIHR1cm5fdXNhZ2UgU0VUIHR1cm5faWQgPSA/IFdIRVJFIHR1cm5faWQgPSA/JywgW25ld0lkLCBvbGRJZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IGRiRXhlYyhkYiwgJ0NPTU1JVCcpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGF3YWl0IGRiRXhlYyhkYiwgJ1JPTExCQUNLJyk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBvbmNlIGFsbCBjdXJyZW50bHkgaW4tZmxpZ2h0IHdyaXRlIG9wZXJhdGlvbnMgaGF2ZSBzZXR0bGVkLlxuXHQgKiBVc2VkIGJ5IGdyYWNlZnVsIHNodXRkb3duIHRvIGZsdXNoIHBlbmRpbmcgZmlyZS1hbmQtZm9yZ2V0IHdyaXRlc1xuXHQgKiBiZWZvcmUgdGhlIHByb2Nlc3MgZXhpdHMuIFNob3VsZCBiZSBjYWxsZWQgZnJvbSBhIHBhdGggd2hlcmUgbm9cblx0ICogZnVydGhlciB3cml0ZXMgYXJlIGV4cGVjdGVkOyBsb29wcyB1bnRpbCBpZGxlIHRvIGFsc28gZHJhaW4gYW55XG5cdCAqIHdyaXRlcyB0aGF0IGdldCBxdWV1ZWQgd2hpbGUgd2UncmUgYXdhaXRpbmcuXG5cdCAqL1xuXHRhc3luYyB3aGVuSWRsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAodGhpcy5fcGVuZGluZ1dyaXRlcy5zaXplID4gMCkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFsuLi50aGlzLl9wZW5kaW5nV3JpdGVzXSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdmFjdXVtSW50byh0YXJnZXRQYXRoOiBzdHJpbmcpIHtcblx0XHRjb25zdCBkYiA9IGF3YWl0IHRoaXMuX2Vuc3VyZURiKCk7XG5cdFx0YXdhaXQgZGJSdW4oZGIsICdWQUNVVU0gSU5UTyA/JywgW3RhcmdldFBhdGhdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXcmFwIGEgbXV0YXRpbmcgb3BlcmF0aW9uJ3MgcHJvbWlzZSBzbyB7QGxpbmsgd2hlbklkbGV9IGNhbiBhd2FpdCBpdC5cblx0ICogSW52b2tlIGF0IHRoZSAqKm91dGVybW9zdCoqIGxheWVyIG9mIGV2ZXJ5IHB1YmxpYyBtdXRhdGluZyBtZXRob2Qgc29cblx0ICogdGhhdCBhbnkgaW50ZXJuYWwgYXdhaXRzIChub3RhYmx5IGBfZW5zdXJlRGIoKWApIGFyZSBjb3ZlcmVkIHRvbyBcdTIwMTRcblx0ICogdHJhY2tpbmcgb25seSB0aGUgbGVhZiBgZGJSdW5gL2BkYkV4ZWNgIHdvdWxkIG1pc3MgdGhlIHdpbmRvd1xuXHQgKiBiZXR3ZWVuIHRoZSBtZXRob2QgYmVpbmcgY2FsbGVkIGFuZCB0aGUgcXVlcnkgYWN0dWFsbHkgYmVpbmcgcXVldWVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJhY2s8VD4oZm46ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBwID0gZm4oKTtcblx0XHR0aGlzLl9wZW5kaW5nV3JpdGVzLmFkZChwKTtcblx0XHRjb25zdCB1bnRyYWNrID0gKCkgPT4geyB0aGlzLl9wZW5kaW5nV3JpdGVzLmRlbGV0ZShwKTsgfTtcblx0XHRwLnRoZW4odW50cmFjaywgdW50cmFjayk7XG5cdFx0cmV0dXJuIHA7XG5cdH1cblxuXHRhc3luYyBjbG9zZSgpIHtcblx0XHRhd2FpdCAodGhpcy5fY2xvc2VkID8/PSB0aGlzLl9kYlByb21pc2U/LnRoZW4oZGIgPT4gZGJDbG9zZShkYikpLmNhdGNoKCgpID0+IHsgfSkgfHwgdHJ1ZSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b1Jldmlld2VkRmlsZVJlY29yZChyb3c6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogSVJldmlld2VkRmlsZVJlY29yZCB7XG5cdHJldHVybiB7XG5cdFx0dXJpOiBVUkkucGFyc2Uocm93LnVyaSBhcyBzdHJpbmcpLFxuXHRcdG5vbmNlOiByb3cubm9uY2UgYXMgc3RyaW5nLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0b1VpbnQ4QXJyYXkodmFsdWU6IHVua25vd24pOiBVaW50OEFycmF5IHtcblx0aWYgKHZhbHVlIGluc3RhbmNlb2YgQnVmZmVyKSB7XG5cdFx0cmV0dXJuIG5ldyBVaW50OEFycmF5KHZhbHVlLmJ1ZmZlciwgdmFsdWUuYnl0ZU9mZnNldCwgdmFsdWUuYnl0ZUxlbmd0aCk7XG5cdH1cblx0aWYgKHZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUodmFsdWUpO1xuXHR9XG5cdHJldHVybiBuZXcgVWludDhBcnJheSgwKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLFdBQVcsc0JBQXNCO0FBRzFDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFtQmIsTUFBTSw0QkFBa0U7QUFBQSxFQUM5RTtBQUFBLElBQ0MsU0FBUztBQUFBLElBQ1QsS0FBSztBQUFBLE1BQ0o7QUFBQTtBQUFBO0FBQUEsTUFHQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBVUQsRUFBRSxLQUFLLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFDQTtBQUFBLElBQ0MsU0FBUztBQUFBLElBQ1QsS0FBSztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBSU47QUFBQSxFQUNBO0FBQUEsSUFDQyxTQUFTO0FBQUEsSUFDVCxLQUFLO0FBQUE7QUFBQTtBQUFBLE1BR0o7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFZQTtBQUFBO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxLQUFLO0FBQUEs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
