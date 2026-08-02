import { mkdirSync } from "fs";
import { createRequire } from "module";
import { dirname } from "../../../../base/common/path.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { CopilotChatAttr, GenAiAttr } from "../../common/genAiAttributes.js";
const nodeRequire = createRequire(import.meta.url);
function loadSqlite() {
  return nodeRequire("node:sqlite");
}
const SCHEMA_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
const DEFAULT_MAX_SESSIONS = 100;
const DENORMALIZED_ATTRS = {
  operation_name: GenAiAttr.OPERATION_NAME,
  provider_name: GenAiAttr.PROVIDER_NAME,
  agent_name: GenAiAttr.AGENT_NAME,
  conversation_id: GenAiAttr.CONVERSATION_ID,
  request_model: GenAiAttr.REQUEST_MODEL,
  response_model: GenAiAttr.RESPONSE_MODEL,
  input_tokens: GenAiAttr.USAGE_INPUT_TOKENS,
  output_tokens: GenAiAttr.USAGE_OUTPUT_TOKENS,
  cached_tokens: GenAiAttr.USAGE_CACHE_READ_INPUT_TOKENS,
  reasoning_tokens: GenAiAttr.USAGE_REASONING_TOKENS,
  tool_name: GenAiAttr.TOOL_NAME,
  tool_call_id: GenAiAttr.TOOL_CALL_ID,
  tool_type: GenAiAttr.TOOL_TYPE,
  chat_session_id: CopilotChatAttr.CHAT_SESSION_ID,
  turn_index: CopilotChatAttr.TURN_INDEX,
  ttft_ms: CopilotChatAttr.TIME_TO_FIRST_TOKEN
};
const IOTelSqliteStore = createDecorator("otelSqliteStore");
class OTelSqliteStore {
  constructor(dbPath) {
    this._db = null;
    // Cached prepared statements (created once per DB connection in _ensureDb)
    this._insertSpanStmt = null;
    this._insertAttrStmt = null;
    this._insertEventStmt = null;
    this._beginTx = null;
    this._commitTx = null;
    this._rollbackTx = null;
    this._dbPath = dbPath;
  }
  get dbPath() {
    return this._dbPath;
  }
  /**
   * Insert a completed span and its attributes/events into the database.
   */
  insertSpan(span) {
    this._ensureDb();
    try {
      this._beginTx.run();
      this._insertSpanStmt.run(
        span.spanId,
        span.traceId,
        span.parentSpanId ?? null,
        span.name,
        span.startTime,
        span.endTime,
        span.status.code,
        span.status.message ?? null,
        this._attr(span, DENORMALIZED_ATTRS.operation_name),
        this._attr(span, DENORMALIZED_ATTRS.provider_name),
        this._attr(span, DENORMALIZED_ATTRS.agent_name),
        this._attr(span, DENORMALIZED_ATTRS.conversation_id),
        this._attr(span, DENORMALIZED_ATTRS.request_model),
        this._attr(span, DENORMALIZED_ATTRS.response_model),
        this._attr(span, DENORMALIZED_ATTRS.input_tokens),
        this._attr(span, DENORMALIZED_ATTRS.output_tokens),
        this._attr(span, DENORMALIZED_ATTRS.cached_tokens),
        this._attr(span, DENORMALIZED_ATTRS.reasoning_tokens),
        this._attr(span, DENORMALIZED_ATTRS.tool_name),
        this._attr(span, DENORMALIZED_ATTRS.tool_call_id),
        this._attr(span, DENORMALIZED_ATTRS.tool_type),
        this._attr(span, DENORMALIZED_ATTRS.chat_session_id),
        this._attr(span, DENORMALIZED_ATTRS.turn_index),
        this._ttftMs(span)
      );
      for (const [key, value] of Object.entries(span.attributes)) {
        const serialized = Array.isArray(value) ? JSON.stringify(value) : String(value);
        this._insertAttrStmt.run(span.spanId, key, serialized);
      }
      for (const event of span.events) {
        const eventAttrs = event.attributes ? JSON.stringify(event.attributes) : null;
        this._insertEventStmt.run(span.spanId, event.name, event.timestamp, eventAttrs);
      }
      this._commitTx.run();
    } catch (err) {
      try {
        this._rollbackTx.run();
      } catch {
      }
      throw err;
    }
  }
  getSpansByTraceId(traceId) {
    return this._ensureDb().prepare("SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time_ms").all(traceId);
  }
  getSpansByConversationId(conversationId) {
    return this._ensureDb().prepare("SELECT * FROM spans WHERE conversation_id = ? OR chat_session_id = ? ORDER BY start_time_ms").all(conversationId, conversationId);
  }
  getSpanAttributes(spanId) {
    return this._ensureDb().prepare("SELECT key, value FROM span_attributes WHERE span_id = ?").all(spanId);
  }
  getSpanAttribute(spanId, key) {
    const row = this._ensureDb().prepare("SELECT value FROM span_attributes WHERE span_id = ? AND key = ?").get(spanId, key);
    return row?.value ?? null;
  }
  getSpanEvents(spanId) {
    return this._ensureDb().prepare("SELECT * FROM span_events WHERE span_id = ? ORDER BY timestamp_ms").all(spanId);
  }
  getTraceIds(conversationId) {
    const db = this._ensureDb();
    if (conversationId) {
      const rows = db.prepare(
        "SELECT DISTINCT trace_id FROM spans WHERE conversation_id = ? OR chat_session_id = ?"
      ).all(conversationId, conversationId);
      return rows.map((r) => r.trace_id);
    }
    return db.prepare("SELECT DISTINCT trace_id FROM spans").all().map((r) => r.trace_id);
  }
  /**
   * List all sessions with aggregated metrics, ordered by most recent first.
   * Uses the `sessions` SQL view over the spans table.
   */
  getSessions(limit) {
    const sql = limit ? "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?" : "SELECT * FROM sessions ORDER BY started_at DESC";
    return limit ? this._ensureDb().prepare(sql).all(limit) : this._ensureDb().prepare(sql).all();
  }
  /**
   * List sessions within a time window (chronicle-style).
   * @param sinceMs Epoch ms — only return sessions that started after this time
   */
  getSessionsSince(sinceMs) {
    return this._ensureDb().prepare(
      "SELECT * FROM sessions WHERE started_at >= ? ORDER BY started_at DESC"
    ).all(sinceMs);
  }
  cleanup(maxAgeMs = DEFAULT_MAX_AGE_MS) {
    const cutoffMs = Date.now() - maxAgeMs;
    const result = this._ensureDb().prepare("DELETE FROM spans WHERE start_time_ms < ?").run(cutoffMs);
    return Number(result.changes);
  }
  /**
   * Checkpoint WAL to flush all pending writes into the main .db file.
   * This must be called before copying the .db file, otherwise the copy
   * will be missing data that lives only in the -wal file.
   */
  checkpoint() {
    this._ensureDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
      this._insertSpanStmt = null;
      this._insertAttrStmt = null;
      this._insertEventStmt = null;
      this._beginTx = null;
      this._commitTx = null;
      this._rollbackTx = null;
    }
  }
  // -- Private ------------------------------------------------------------
  _attr(span, attrKey) {
    const val = span.attributes[attrKey];
    if (val === void 0) {
      return null;
    }
    if (Array.isArray(val)) {
      return JSON.stringify(val);
    }
    if (typeof val === "boolean") {
      return val ? 1 : 0;
    }
    return val;
  }
  /**
   * Coalesce TTFT from foreground extension (`copilot_chat.time_to_first_token`, ms)
   * and CLI runtime. The CLI runtime historically emitted `github.copilot.time_to_first_chunk`
   * (seconds) but is migrating to the OTel GenAI semconv attribute
   * `gen_ai.response.time_to_first_chunk` (also seconds). Accept both for forward/backward
   * compatibility while the runtime rollout completes.
   *
   * @see https://github.com/open-telemetry/semantic-conventions/pull/3607 (semconv addition)
   */
  _ttftMs(span) {
    const foreground = this._attr(span, CopilotChatAttr.TIME_TO_FIRST_TOKEN);
    if (foreground !== null) {
      return foreground;
    }
    const cli = span.attributes["gen_ai.response.time_to_first_chunk"] ?? span.attributes["github.copilot.time_to_first_chunk"];
    if (cli === void 0) {
      return null;
    }
    const sec = typeof cli === "number" ? cli : parseFloat(String(cli));
    return isNaN(sec) ? null : Math.round(sec * 1e3);
  }
  _ensureDb() {
    if (this._db) {
      return this._db;
    }
    if (this._dbPath !== ":memory:") {
      mkdirSync(dirname(this._dbPath), { recursive: true });
    }
    const { DatabaseSync: DatabaseSyncCtor } = loadSqlite();
    const db = new DatabaseSyncCtor(this._dbPath);
    try {
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA busy_timeout = 3000");
      db.exec("PRAGMA foreign_keys = ON");
      this._db = db;
      this._ensureSchema();
      this._prepareStatements(db);
      this._cleanupOnStartup(db);
    } catch (err) {
      db.close();
      this._db = null;
      throw err;
    }
    return this._db;
  }
  _prepareStatements(db) {
    this._insertSpanStmt = db.prepare(`
			INSERT OR REPLACE INTO spans (
				span_id, trace_id, parent_span_id, name,
				start_time_ms, end_time_ms, status_code, status_message,
				operation_name, provider_name, agent_name, conversation_id,
				request_model, response_model,
				input_tokens, output_tokens, cached_tokens, reasoning_tokens,
				tool_name, tool_call_id, tool_type,
				chat_session_id, turn_index, ttft_ms
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
    this._insertAttrStmt = db.prepare(
      "INSERT OR REPLACE INTO span_attributes (span_id, key, value) VALUES (?, ?, ?)"
    );
    this._insertEventStmt = db.prepare(
      "INSERT INTO span_events (span_id, name, timestamp_ms, attributes) VALUES (?, ?, ?, ?)"
    );
    this._beginTx = db.prepare("BEGIN");
    this._commitTx = db.prepare("COMMIT");
    this._rollbackTx = db.prepare("ROLLBACK");
  }
  _ensureSchema() {
    const db = this._db;
    const versionRow = (() => {
      try {
        return db.prepare("SELECT version FROM schema_version LIMIT 1").get();
      } catch {
        return void 0;
      }
    })();
    if ((versionRow?.version ?? 0) >= SCHEMA_VERSION) {
      return;
    }
    db.exec(`
			CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
			INSERT OR REPLACE INTO schema_version (version) VALUES (${SCHEMA_VERSION});

			CREATE TABLE IF NOT EXISTS spans (
				span_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_span_id TEXT,
				name TEXT NOT NULL, start_time_ms INTEGER NOT NULL, end_time_ms INTEGER NOT NULL,
				status_code INTEGER NOT NULL DEFAULT 0, status_message TEXT,
				operation_name TEXT, provider_name TEXT, agent_name TEXT, conversation_id TEXT,
				request_model TEXT, response_model TEXT,
				input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER, reasoning_tokens INTEGER,
				tool_name TEXT, tool_call_id TEXT, tool_type TEXT,
				chat_session_id TEXT, turn_index INTEGER, ttft_ms REAL
			);

			CREATE TABLE IF NOT EXISTS span_attributes (
				span_id TEXT NOT NULL REFERENCES spans(span_id) ON DELETE CASCADE,
				key TEXT NOT NULL, value TEXT,
				PRIMARY KEY (span_id, key)
			);

			CREATE TABLE IF NOT EXISTS span_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				span_id TEXT NOT NULL REFERENCES spans(span_id) ON DELETE CASCADE,
				name TEXT NOT NULL, timestamp_ms INTEGER NOT NULL, attributes TEXT
			);

			CREATE INDEX IF NOT EXISTS idx_spans_trace ON spans(trace_id);
			CREATE INDEX IF NOT EXISTS idx_spans_conversation ON spans(conversation_id);
			CREATE INDEX IF NOT EXISTS idx_spans_chat_session ON spans(chat_session_id);
			CREATE INDEX IF NOT EXISTS idx_spans_operation ON spans(operation_name);
			CREATE INDEX IF NOT EXISTS idx_spans_start_time ON spans(start_time_ms);
			CREATE INDEX IF NOT EXISTS idx_span_events_span ON span_events(span_id);

			-- Session view: derives session boundaries from span data.
			-- No separate sessions table needed \u2014 invoke_agent spans define session lifecycle.
			CREATE VIEW IF NOT EXISTS sessions AS
			SELECT
				COALESCE(conversation_id, chat_session_id) AS session_id,
				agent_name,
				response_model AS model,
				MIN(start_time_ms) AS started_at,
				MAX(end_time_ms) AS ended_at,
				MAX(end_time_ms) - MIN(start_time_ms) AS duration_ms,
				COUNT(*) AS span_count,
				SUM(CASE WHEN operation_name = 'chat' THEN 1 ELSE 0 END) AS llm_calls,
				SUM(CASE WHEN operation_name = 'execute_tool' THEN 1 ELSE 0 END) AS tool_calls,
				SUM(CASE WHEN operation_name = 'chat' THEN input_tokens ELSE 0 END) AS total_input_tokens,
				SUM(CASE WHEN operation_name = 'chat' THEN output_tokens ELSE 0 END) AS total_output_tokens,
				SUM(CASE WHEN operation_name = 'chat' THEN cached_tokens ELSE 0 END) AS total_cached_tokens
			FROM spans
			WHERE COALESCE(conversation_id, chat_session_id) IS NOT NULL
			GROUP BY COALESCE(conversation_id, chat_session_id);
		`);
  }
  _cleanupOnStartup(db) {
    const cutoffMs = Date.now() - DEFAULT_MAX_AGE_MS;
    db.prepare("DELETE FROM spans WHERE start_time_ms < ?").run(cutoffMs);
    const sessionCutoff = db.prepare(`
			SELECT MIN(max_start) AS cutoff_ms FROM (
				SELECT MAX(start_time_ms) AS max_start
				FROM spans
				WHERE COALESCE(conversation_id, chat_session_id) IS NOT NULL
				GROUP BY COALESCE(conversation_id, chat_session_id)
				ORDER BY max_start DESC
				LIMIT ?
			)
		`).get(DEFAULT_MAX_SESSIONS);
    if (sessionCutoff?.cutoff_ms) {
      db.prepare(`
				DELETE FROM spans
				WHERE start_time_ms < ?
				AND COALESCE(conversation_id, chat_session_id) NOT IN (
					SELECT COALESCE(conversation_id, chat_session_id)
					FROM spans
					WHERE COALESCE(conversation_id, chat_session_id) IS NOT NULL
					GROUP BY COALESCE(conversation_id, chat_session_id)
					ORDER BY MAX(start_time_ms) DESC
					LIMIT ?
				)
			`).run(sessionCutoff.cutoff_ms, DEFAULT_MAX_SESSIONS);
    }
  }
}
export {
  IOTelSqliteStore,
  OTelSqliteStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL290ZWwvbm9kZS9zcWxpdGUvb3RlbFNxbGl0ZVN0b3JlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWtkaXJTeW5jIH0gZnJvbSAnZnMnO1xuLy8gVGhlICdub2RlOm1vZHVsZScgc3BlY2lmaWVyIGlzIHVucmVzb2x2YWJsZSBieSB0aGUgRWxlY3Ryb24gcmVuZGVyZXJcbi8vIEVTTSBsb2FkZXIgKHVzZWQgYnkgdGhlIHVuaXQgdGVzdCBoYXJuZXNzKSwgc28gdXNlIHRoZSBiYXJlIGZvcm0uXG5pbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSAnbW9kdWxlJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHR5cGUgeyBEYXRhYmFzZVN5bmMsIFN0YXRlbWVudFN5bmMgfSBmcm9tICdub2RlOnNxbGl0ZSc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENvcGlsb3RDaGF0QXR0ciwgR2VuQWlBdHRyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2dlbkFpQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb21wbGV0ZWRTcGFuRGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zcGFuRGF0YS5qcyc7XG5cbi8vIGBub2RlOnNxbGl0ZWAgaXMgY3VycmVudGx5IGFuIGV4cGVyaW1lbnRhbCBOb2RlIG1vZHVsZSBhbmQgaXMgbm90XG4vLyByZWFjaGFibGUgdmlhIGEgc3RhdGljIGBpbXBvcnRgIHVuZGVyIG91ciBsYXllciBydWxlcyAoaXQgd291bGQgYWxzb1xuLy8gbG9hZCBzeW5jaHJvbm91c2x5IG9uIHN0YXJ0dXApLiBVc2UgY3JlYXRlUmVxdWlyZSBzbyB0aGUgYmluZGluZyBpc1xuLy8gb25seSByZXNvbHZlZCB3aGVuIHRoZSBzdG9yZSBpcyBhY3R1YWxseSBvcGVuZWQuXG5jb25zdCBub2RlUmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcbmZ1bmN0aW9uIGxvYWRTcWxpdGUoKTogdHlwZW9mIGltcG9ydCgnbm9kZTpzcWxpdGUnKSB7XG5cdHJldHVybiBub2RlUmVxdWlyZSgnbm9kZTpzcWxpdGUnKSBhcyB0eXBlb2YgaW1wb3J0KCdub2RlOnNxbGl0ZScpO1xufVxuXG4vKiogU2NoZW1hIHZlcnNpb24gXHUyMDE0IGJ1bXAgd2hlbiBhbHRlcmluZyB0YWJsZXMgc28gZXhpc3RpbmcgREJzIGdldCBtaWdyYXRlZC4gKi9cbmNvbnN0IFNDSEVNQV9WRVJTSU9OID0gMTtcblxuLy8gLS0gUmV0ZW50aW9uIGNvbnN0YW50cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqIE1heCBhZ2UgZm9yIHNwYW4gZGF0YSBiZWZvcmUgY2xlYW51cC4gKi9cbmNvbnN0IERFRkFVTFRfTUFYX0FHRV9NUyA9IDcgKiAyNCAqIDYwICogNjAgKiAxMDAwOyAvLyA3IGRheXNcblxuLyoqIE1heCBudW1iZXIgb2Ygc2Vzc2lvbnMgKGJ5IGNvbnZlcnNhdGlvbl9pZCkgdG8gcmV0YWluLiAqL1xuY29uc3QgREVGQVVMVF9NQVhfU0VTU0lPTlMgPSAxMDA7XG5cbi8qKlxuICogS2V5cyBleHRyYWN0ZWQgZnJvbSBJQ29tcGxldGVkU3BhbkRhdGEuYXR0cmlidXRlcyBhbmQgZGVub3JtYWxpemVkIGludG8gdGhlIHNwYW5zIHRhYmxlXG4gKiBmb3IgaW5kZXhlZCBxdWVyeSBhY2Nlc3MuIFRoZSBrZXkgaXMgdGhlIFNRTCBjb2x1bW4gbmFtZSwgdGhlIHZhbHVlIGlzIHRoZSBPVGVsIGF0dHJpYnV0ZSBrZXkuXG4gKi9cbmNvbnN0IERFTk9STUFMSVpFRF9BVFRSUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0b3BlcmF0aW9uX25hbWU6IEdlbkFpQXR0ci5PUEVSQVRJT05fTkFNRSxcblx0cHJvdmlkZXJfbmFtZTogR2VuQWlBdHRyLlBST1ZJREVSX05BTUUsXG5cdGFnZW50X25hbWU6IEdlbkFpQXR0ci5BR0VOVF9OQU1FLFxuXHRjb252ZXJzYXRpb25faWQ6IEdlbkFpQXR0ci5DT05WRVJTQVRJT05fSUQsXG5cdHJlcXVlc3RfbW9kZWw6IEdlbkFpQXR0ci5SRVFVRVNUX01PREVMLFxuXHRyZXNwb25zZV9tb2RlbDogR2VuQWlBdHRyLlJFU1BPTlNFX01PREVMLFxuXHRpbnB1dF90b2tlbnM6IEdlbkFpQXR0ci5VU0FHRV9JTlBVVF9UT0tFTlMsXG5cdG91dHB1dF90b2tlbnM6IEdlbkFpQXR0ci5VU0FHRV9PVVRQVVRfVE9LRU5TLFxuXHRjYWNoZWRfdG9rZW5zOiBHZW5BaUF0dHIuVVNBR0VfQ0FDSEVfUkVBRF9JTlBVVF9UT0tFTlMsXG5cdHJlYXNvbmluZ190b2tlbnM6IEdlbkFpQXR0ci5VU0FHRV9SRUFTT05JTkdfVE9LRU5TLFxuXHR0b29sX25hbWU6IEdlbkFpQXR0ci5UT09MX05BTUUsXG5cdHRvb2xfY2FsbF9pZDogR2VuQWlBdHRyLlRPT0xfQ0FMTF9JRCxcblx0dG9vbF90eXBlOiBHZW5BaUF0dHIuVE9PTF9UWVBFLFxuXHRjaGF0X3Nlc3Npb25faWQ6IENvcGlsb3RDaGF0QXR0ci5DSEFUX1NFU1NJT05fSUQsXG5cdHR1cm5faW5kZXg6IENvcGlsb3RDaGF0QXR0ci5UVVJOX0lOREVYLFxuXHR0dGZ0X21zOiBDb3BpbG90Q2hhdEF0dHIuVElNRV9UT19GSVJTVF9UT0tFTixcbn07XG5cbi8vIC0tIFNlcnZpY2UgaWRlbnRpZmllciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBJT1RlbFNxbGl0ZVN0b3JlID0gY3JlYXRlRGVjb3JhdG9yPE9UZWxTcWxpdGVTdG9yZT4oJ290ZWxTcWxpdGVTdG9yZScpO1xuXG4vLyAtLSBSb3cgdHlwZXMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgaW50ZXJmYWNlIFNwYW5Sb3cge1xuXHRzcGFuX2lkOiBzdHJpbmc7XG5cdHRyYWNlX2lkOiBzdHJpbmc7XG5cdHBhcmVudF9zcGFuX2lkOiBzdHJpbmcgfCBudWxsO1xuXHRuYW1lOiBzdHJpbmc7XG5cdHN0YXJ0X3RpbWVfbXM6IG51bWJlcjtcblx0ZW5kX3RpbWVfbXM6IG51bWJlcjtcblx0c3RhdHVzX2NvZGU6IG51bWJlcjtcblx0c3RhdHVzX21lc3NhZ2U6IHN0cmluZyB8IG51bGw7XG5cdG9wZXJhdGlvbl9uYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRwcm92aWRlcl9uYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRhZ2VudF9uYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRjb252ZXJzYXRpb25faWQ6IHN0cmluZyB8IG51bGw7XG5cdHJlcXVlc3RfbW9kZWw6IHN0cmluZyB8IG51bGw7XG5cdHJlc3BvbnNlX21vZGVsOiBzdHJpbmcgfCBudWxsO1xuXHRpbnB1dF90b2tlbnM6IG51bWJlciB8IG51bGw7XG5cdG91dHB1dF90b2tlbnM6IG51bWJlciB8IG51bGw7XG5cdGNhY2hlZF90b2tlbnM6IG51bWJlciB8IG51bGw7XG5cdHJlYXNvbmluZ190b2tlbnM6IG51bWJlciB8IG51bGw7XG5cdHRvb2xfbmFtZTogc3RyaW5nIHwgbnVsbDtcblx0dG9vbF9jYWxsX2lkOiBzdHJpbmcgfCBudWxsO1xuXHR0b29sX3R5cGU6IHN0cmluZyB8IG51bGw7XG5cdGNoYXRfc2Vzc2lvbl9pZDogc3RyaW5nIHwgbnVsbDtcblx0dHVybl9pbmRleDogbnVtYmVyIHwgbnVsbDtcblx0dHRmdF9tczogbnVtYmVyIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTcGFuRXZlbnRSb3cge1xuXHRpZDogbnVtYmVyO1xuXHRzcGFuX2lkOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0dGltZXN0YW1wX21zOiBudW1iZXI7XG5cdGF0dHJpYnV0ZXM6IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2Vzc2lvblJvdyB7XG5cdHNlc3Npb25faWQ6IHN0cmluZztcblx0YWdlbnRfbmFtZTogc3RyaW5nIHwgbnVsbDtcblx0bW9kZWw6IHN0cmluZyB8IG51bGw7XG5cdHN0YXJ0ZWRfYXQ6IG51bWJlcjtcblx0ZW5kZWRfYXQ6IG51bWJlcjtcblx0ZHVyYXRpb25fbXM6IG51bWJlcjtcblx0c3Bhbl9jb3VudDogbnVtYmVyO1xuXHRsbG1fY2FsbHM6IG51bWJlcjtcblx0dG9vbF9jYWxsczogbnVtYmVyO1xuXHR0b3RhbF9pbnB1dF90b2tlbnM6IG51bWJlcjtcblx0dG90YWxfb3V0cHV0X3Rva2VuczogbnVtYmVyO1xuXHR0b3RhbF9jYWNoZWRfdG9rZW5zOiBudW1iZXI7XG59XG5cbi8vIC0tIFN0b3JlIGltcGxlbWVudGF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQWx3YXlzLW9uIFNRTGl0ZSBzdG9yZSBmb3IgT1RlbCBzcGFuIGRhdGEgdXNpbmcgbm9kZTpzcWxpdGUgRGF0YWJhc2VTeW5jLlxuICpcbiAqIENvbnN1bWVycyBjYWxsIHtAbGluayBpbnNlcnRTcGFufSB3aXRoIGEgc2VyaWFsaXplZCBjb21wbGV0ZWQgc3BhbjsgdGhlIHN0b3JlXG4gKiBwZXJzaXN0cyBzcGFuIGF0dHJpYnV0ZXMgYW5kIGV2ZW50cyB3aXRoIGRlbm9ybWFsaXplZCBjb2x1bW5zIGZvciB0aGUgbW9zdFxuICogY29tbW9uIEdlbkFJIHNlbWNvbnYgYXR0cmlidXRlcyAoc28gdGhlIGV2YWwgaGFybmVzcyBjYW4gcXVlcnkgd2l0aG91dCBqb2luaW5nKS5cbiAqXG4gKiAtIFdBTCBtb2RlICsgYnVzeV90aW1lb3V0IGZvciBjb25jdXJyZW50IHJlYWQvd3JpdGUgc2FmZXR5XG4gKiAtIFNjaGVtYSB2ZXJzaW9uaW5nIHdpdGggbWlncmF0aW9uIHRhYmxlXG4gKiAtIExhenkgaW5pdGlhbGl6YXRpb24gKERCIGNyZWF0ZWQgb24gZmlyc3Qgd3JpdGUpXG4gKiAtIFN5bmNocm9ub3VzIERhdGFiYXNlU3luYyBBUElcbiAqL1xuZXhwb3J0IGNsYXNzIE9UZWxTcWxpdGVTdG9yZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kYjogRGF0YWJhc2VTeW5jIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RiUGF0aDogc3RyaW5nO1xuXG5cdC8vIENhY2hlZCBwcmVwYXJlZCBzdGF0ZW1lbnRzIChjcmVhdGVkIG9uY2UgcGVyIERCIGNvbm5lY3Rpb24gaW4gX2Vuc3VyZURiKVxuXHRwcml2YXRlIF9pbnNlcnRTcGFuU3RtdDogU3RhdGVtZW50U3luYyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9pbnNlcnRBdHRyU3RtdDogU3RhdGVtZW50U3luYyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9pbnNlcnRFdmVudFN0bXQ6IFN0YXRlbWVudFN5bmMgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfYmVnaW5UeDogU3RhdGVtZW50U3luYyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9jb21taXRUeDogU3RhdGVtZW50U3luYyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9yb2xsYmFja1R4OiBTdGF0ZW1lbnRTeW5jIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoZGJQYXRoOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9kYlBhdGggPSBkYlBhdGg7XG5cdH1cblxuXHRnZXQgZGJQYXRoKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2RiUGF0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnNlcnQgYSBjb21wbGV0ZWQgc3BhbiBhbmQgaXRzIGF0dHJpYnV0ZXMvZXZlbnRzIGludG8gdGhlIGRhdGFiYXNlLlxuXHQgKi9cblx0aW5zZXJ0U3BhbihzcGFuOiBJQ29tcGxldGVkU3BhbkRhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVEYigpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2JlZ2luVHghLnJ1bigpO1xuXG5cdFx0XHR0aGlzLl9pbnNlcnRTcGFuU3RtdCEucnVuKFxuXHRcdFx0XHRzcGFuLnNwYW5JZCwgc3Bhbi50cmFjZUlkLCBzcGFuLnBhcmVudFNwYW5JZCA/PyBudWxsLCBzcGFuLm5hbWUsXG5cdFx0XHRcdHNwYW4uc3RhcnRUaW1lLCBzcGFuLmVuZFRpbWUsIHNwYW4uc3RhdHVzLmNvZGUsIHNwYW4uc3RhdHVzLm1lc3NhZ2UgPz8gbnVsbCxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMub3BlcmF0aW9uX25hbWUpLFxuXHRcdFx0XHR0aGlzLl9hdHRyKHNwYW4sIERFTk9STUFMSVpFRF9BVFRSUy5wcm92aWRlcl9uYW1lKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMuYWdlbnRfbmFtZSksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLmNvbnZlcnNhdGlvbl9pZCksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLnJlcXVlc3RfbW9kZWwpLFxuXHRcdFx0XHR0aGlzLl9hdHRyKHNwYW4sIERFTk9STUFMSVpFRF9BVFRSUy5yZXNwb25zZV9tb2RlbCksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLmlucHV0X3Rva2VucyksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLm91dHB1dF90b2tlbnMpLFxuXHRcdFx0XHR0aGlzLl9hdHRyKHNwYW4sIERFTk9STUFMSVpFRF9BVFRSUy5jYWNoZWRfdG9rZW5zKSxcblx0XHRcdFx0dGhpcy5fYXR0cihzcGFuLCBERU5PUk1BTElaRURfQVRUUlMucmVhc29uaW5nX3Rva2VucyksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLnRvb2xfbmFtZSksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLnRvb2xfY2FsbF9pZCksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLnRvb2xfdHlwZSksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLmNoYXRfc2Vzc2lvbl9pZCksXG5cdFx0XHRcdHRoaXMuX2F0dHIoc3BhbiwgREVOT1JNQUxJWkVEX0FUVFJTLnR1cm5faW5kZXgpLFxuXHRcdFx0XHR0aGlzLl90dGZ0TXMoc3BhbiksXG5cdFx0XHQpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhzcGFuLmF0dHJpYnV0ZXMpKSB7XG5cdFx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBBcnJheS5pc0FycmF5KHZhbHVlKSA/IEpTT04uc3RyaW5naWZ5KHZhbHVlKSA6IFN0cmluZyh2YWx1ZSk7XG5cdFx0XHRcdHRoaXMuX2luc2VydEF0dHJTdG10IS5ydW4oc3Bhbi5zcGFuSWQsIGtleSwgc2VyaWFsaXplZCk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZXZlbnQgb2Ygc3Bhbi5ldmVudHMpIHtcblx0XHRcdFx0Y29uc3QgZXZlbnRBdHRycyA9IGV2ZW50LmF0dHJpYnV0ZXMgPyBKU09OLnN0cmluZ2lmeShldmVudC5hdHRyaWJ1dGVzKSA6IG51bGw7XG5cdFx0XHRcdHRoaXMuX2luc2VydEV2ZW50U3RtdCEucnVuKHNwYW4uc3BhbklkLCBldmVudC5uYW1lLCBldmVudC50aW1lc3RhbXAsIGV2ZW50QXR0cnMpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jb21taXRUeCEucnVuKCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0cnkgeyB0aGlzLl9yb2xsYmFja1R4IS5ydW4oKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0Z2V0U3BhbnNCeVRyYWNlSWQodHJhY2VJZDogc3RyaW5nKTogU3BhblJvd1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlRGIoKVxuXHRcdFx0LnByZXBhcmUoJ1NFTEVDVCAqIEZST00gc3BhbnMgV0hFUkUgdHJhY2VfaWQgPSA/IE9SREVSIEJZIHN0YXJ0X3RpbWVfbXMnKVxuXHRcdFx0LmFsbCh0cmFjZUlkKSBhcyB1bmtub3duIGFzIFNwYW5Sb3dbXTtcblx0fVxuXG5cdGdldFNwYW5zQnlDb252ZXJzYXRpb25JZChjb252ZXJzYXRpb25JZDogc3RyaW5nKTogU3BhblJvd1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlRGIoKVxuXHRcdFx0LnByZXBhcmUoJ1NFTEVDVCAqIEZST00gc3BhbnMgV0hFUkUgY29udmVyc2F0aW9uX2lkID0gPyBPUiBjaGF0X3Nlc3Npb25faWQgPSA/IE9SREVSIEJZIHN0YXJ0X3RpbWVfbXMnKVxuXHRcdFx0LmFsbChjb252ZXJzYXRpb25JZCwgY29udmVyc2F0aW9uSWQpIGFzIHVua25vd24gYXMgU3BhblJvd1tdO1xuXHR9XG5cblx0Z2V0U3BhbkF0dHJpYnV0ZXMoc3BhbklkOiBzdHJpbmcpOiBBcnJheTx7IGtleTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIHwgbnVsbCB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZURiKClcblx0XHRcdC5wcmVwYXJlKCdTRUxFQ1Qga2V5LCB2YWx1ZSBGUk9NIHNwYW5fYXR0cmlidXRlcyBXSEVSRSBzcGFuX2lkID0gPycpXG5cdFx0XHQuYWxsKHNwYW5JZCkgYXMgdW5rbm93biBhcyBBcnJheTx7IGtleTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIHwgbnVsbCB9Pjtcblx0fVxuXG5cdGdldFNwYW5BdHRyaWJ1dGUoc3BhbklkOiBzdHJpbmcsIGtleTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Y29uc3Qgcm93ID0gdGhpcy5fZW5zdXJlRGIoKVxuXHRcdFx0LnByZXBhcmUoJ1NFTEVDVCB2YWx1ZSBGUk9NIHNwYW5fYXR0cmlidXRlcyBXSEVSRSBzcGFuX2lkID0gPyBBTkQga2V5ID0gPycpXG5cdFx0XHQuZ2V0KHNwYW5JZCwga2V5KSBhcyB1bmtub3duIGFzIHsgdmFsdWU6IHN0cmluZyB8IG51bGwgfSB8IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gcm93Py52YWx1ZSA/PyBudWxsO1xuXHR9XG5cblx0Z2V0U3BhbkV2ZW50cyhzcGFuSWQ6IHN0cmluZyk6IFNwYW5FdmVudFJvd1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlRGIoKVxuXHRcdFx0LnByZXBhcmUoJ1NFTEVDVCAqIEZST00gc3Bhbl9ldmVudHMgV0hFUkUgc3Bhbl9pZCA9ID8gT1JERVIgQlkgdGltZXN0YW1wX21zJylcblx0XHRcdC5hbGwoc3BhbklkKSBhcyB1bmtub3duIGFzIFNwYW5FdmVudFJvd1tdO1xuXHR9XG5cblx0Z2V0VHJhY2VJZHMoY29udmVyc2F0aW9uSWQ/OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgZGIgPSB0aGlzLl9lbnN1cmVEYigpO1xuXHRcdGlmIChjb252ZXJzYXRpb25JZCkge1xuXHRcdFx0Y29uc3Qgcm93cyA9IGRiLnByZXBhcmUoXG5cdFx0XHRcdCdTRUxFQ1QgRElTVElOQ1QgdHJhY2VfaWQgRlJPTSBzcGFucyBXSEVSRSBjb252ZXJzYXRpb25faWQgPSA/IE9SIGNoYXRfc2Vzc2lvbl9pZCA9ID8nXG5cdFx0XHQpLmFsbChjb252ZXJzYXRpb25JZCwgY29udmVyc2F0aW9uSWQpIGFzIHVua25vd24gYXMgQXJyYXk8eyB0cmFjZV9pZDogc3RyaW5nIH0+O1xuXHRcdFx0cmV0dXJuIHJvd3MubWFwKHIgPT4gci50cmFjZV9pZCk7XG5cdFx0fVxuXHRcdHJldHVybiAoZGIucHJlcGFyZSgnU0VMRUNUIERJU1RJTkNUIHRyYWNlX2lkIEZST00gc3BhbnMnKS5hbGwoKSBhcyB1bmtub3duIGFzIEFycmF5PHsgdHJhY2VfaWQ6IHN0cmluZyB9Pilcblx0XHRcdC5tYXAociA9PiByLnRyYWNlX2lkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaXN0IGFsbCBzZXNzaW9ucyB3aXRoIGFnZ3JlZ2F0ZWQgbWV0cmljcywgb3JkZXJlZCBieSBtb3N0IHJlY2VudCBmaXJzdC5cblx0ICogVXNlcyB0aGUgYHNlc3Npb25zYCBTUUwgdmlldyBvdmVyIHRoZSBzcGFucyB0YWJsZS5cblx0ICovXG5cdGdldFNlc3Npb25zKGxpbWl0PzogbnVtYmVyKTogU2Vzc2lvblJvd1tdIHtcblx0XHRjb25zdCBzcWwgPSBsaW1pdFxuXHRcdFx0PyAnU0VMRUNUICogRlJPTSBzZXNzaW9ucyBPUkRFUiBCWSBzdGFydGVkX2F0IERFU0MgTElNSVQgPydcblx0XHRcdDogJ1NFTEVDVCAqIEZST00gc2Vzc2lvbnMgT1JERVIgQlkgc3RhcnRlZF9hdCBERVNDJztcblx0XHRyZXR1cm4gbGltaXRcblx0XHRcdD8gdGhpcy5fZW5zdXJlRGIoKS5wcmVwYXJlKHNxbCkuYWxsKGxpbWl0KSBhcyB1bmtub3duIGFzIFNlc3Npb25Sb3dbXVxuXHRcdFx0OiB0aGlzLl9lbnN1cmVEYigpLnByZXBhcmUoc3FsKS5hbGwoKSBhcyB1bmtub3duIGFzIFNlc3Npb25Sb3dbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaXN0IHNlc3Npb25zIHdpdGhpbiBhIHRpbWUgd2luZG93IChjaHJvbmljbGUtc3R5bGUpLlxuXHQgKiBAcGFyYW0gc2luY2VNcyBFcG9jaCBtcyBcdTIwMTQgb25seSByZXR1cm4gc2Vzc2lvbnMgdGhhdCBzdGFydGVkIGFmdGVyIHRoaXMgdGltZVxuXHQgKi9cblx0Z2V0U2Vzc2lvbnNTaW5jZShzaW5jZU1zOiBudW1iZXIpOiBTZXNzaW9uUm93W10ge1xuXHRcdHJldHVybiB0aGlzLl9lbnN1cmVEYigpLnByZXBhcmUoXG5cdFx0XHQnU0VMRUNUICogRlJPTSBzZXNzaW9ucyBXSEVSRSBzdGFydGVkX2F0ID49ID8gT1JERVIgQlkgc3RhcnRlZF9hdCBERVNDJ1xuXHRcdCkuYWxsKHNpbmNlTXMpIGFzIHVua25vd24gYXMgU2Vzc2lvblJvd1tdO1xuXHR9XG5cblx0Y2xlYW51cChtYXhBZ2VNczogbnVtYmVyID0gREVGQVVMVF9NQVhfQUdFX01TKTogbnVtYmVyIHtcblx0XHRjb25zdCBjdXRvZmZNcyA9IERhdGUubm93KCkgLSBtYXhBZ2VNcztcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9lbnN1cmVEYigpLnByZXBhcmUoJ0RFTEVURSBGUk9NIHNwYW5zIFdIRVJFIHN0YXJ0X3RpbWVfbXMgPCA/JykucnVuKGN1dG9mZk1zKTtcblx0XHRyZXR1cm4gTnVtYmVyKHJlc3VsdC5jaGFuZ2VzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVja3BvaW50IFdBTCB0byBmbHVzaCBhbGwgcGVuZGluZyB3cml0ZXMgaW50byB0aGUgbWFpbiAuZGIgZmlsZS5cblx0ICogVGhpcyBtdXN0IGJlIGNhbGxlZCBiZWZvcmUgY29weWluZyB0aGUgLmRiIGZpbGUsIG90aGVyd2lzZSB0aGUgY29weVxuXHQgKiB3aWxsIGJlIG1pc3NpbmcgZGF0YSB0aGF0IGxpdmVzIG9ubHkgaW4gdGhlIC13YWwgZmlsZS5cblx0ICovXG5cdGNoZWNrcG9pbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5zdXJlRGIoKS5leGVjKCdQUkFHTUEgd2FsX2NoZWNrcG9pbnQoVFJVTkNBVEUpJyk7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGIpIHtcblx0XHRcdHRoaXMuX2RiLmNsb3NlKCk7XG5cdFx0XHR0aGlzLl9kYiA9IG51bGw7XG5cdFx0XHR0aGlzLl9pbnNlcnRTcGFuU3RtdCA9IG51bGw7XG5cdFx0XHR0aGlzLl9pbnNlcnRBdHRyU3RtdCA9IG51bGw7XG5cdFx0XHR0aGlzLl9pbnNlcnRFdmVudFN0bXQgPSBudWxsO1xuXHRcdFx0dGhpcy5fYmVnaW5UeCA9IG51bGw7XG5cdFx0XHR0aGlzLl9jb21taXRUeCA9IG51bGw7XG5cdFx0XHR0aGlzLl9yb2xsYmFja1R4ID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBQcml2YXRlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX2F0dHIoc3BhbjogSUNvbXBsZXRlZFNwYW5EYXRhLCBhdHRyS2V5OiBzdHJpbmcpOiBzdHJpbmcgfCBudW1iZXIgfCBudWxsIHtcblx0XHRjb25zdCB2YWwgPSBzcGFuLmF0dHJpYnV0ZXNbYXR0cktleV07XG5cdFx0aWYgKHZhbCA9PT0gdW5kZWZpbmVkKSB7IHJldHVybiBudWxsOyB9XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsKSkgeyByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsKTsgfVxuXHRcdGlmICh0eXBlb2YgdmFsID09PSAnYm9vbGVhbicpIHsgcmV0dXJuIHZhbCA/IDEgOiAwOyB9XG5cdFx0cmV0dXJuIHZhbCBhcyBzdHJpbmcgfCBudW1iZXI7XG5cdH1cblxuXHQvKipcblx0ICogQ29hbGVzY2UgVFRGVCBmcm9tIGZvcmVncm91bmQgZXh0ZW5zaW9uIChgY29waWxvdF9jaGF0LnRpbWVfdG9fZmlyc3RfdG9rZW5gLCBtcylcblx0ICogYW5kIENMSSBydW50aW1lLiBUaGUgQ0xJIHJ1bnRpbWUgaGlzdG9yaWNhbGx5IGVtaXR0ZWQgYGdpdGh1Yi5jb3BpbG90LnRpbWVfdG9fZmlyc3RfY2h1bmtgXG5cdCAqIChzZWNvbmRzKSBidXQgaXMgbWlncmF0aW5nIHRvIHRoZSBPVGVsIEdlbkFJIHNlbWNvbnYgYXR0cmlidXRlXG5cdCAqIGBnZW5fYWkucmVzcG9uc2UudGltZV90b19maXJzdF9jaHVua2AgKGFsc28gc2Vjb25kcykuIEFjY2VwdCBib3RoIGZvciBmb3J3YXJkL2JhY2t3YXJkXG5cdCAqIGNvbXBhdGliaWxpdHkgd2hpbGUgdGhlIHJ1bnRpbWUgcm9sbG91dCBjb21wbGV0ZXMuXG5cdCAqXG5cdCAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL29wZW4tdGVsZW1ldHJ5L3NlbWFudGljLWNvbnZlbnRpb25zL3B1bGwvMzYwNyAoc2VtY29udiBhZGRpdGlvbilcblx0ICovXG5cdHByaXZhdGUgX3R0ZnRNcyhzcGFuOiBJQ29tcGxldGVkU3BhbkRhdGEpOiBudW1iZXIgfCBudWxsIHtcblx0XHRjb25zdCBmb3JlZ3JvdW5kID0gdGhpcy5fYXR0cihzcGFuLCBDb3BpbG90Q2hhdEF0dHIuVElNRV9UT19GSVJTVF9UT0tFTik7XG5cdFx0aWYgKGZvcmVncm91bmQgIT09IG51bGwpIHsgcmV0dXJuIGZvcmVncm91bmQgYXMgbnVtYmVyOyB9XG5cdFx0Y29uc3QgY2xpID0gc3Bhbi5hdHRyaWJ1dGVzWydnZW5fYWkucmVzcG9uc2UudGltZV90b19maXJzdF9jaHVuayddXG5cdFx0XHQ/PyBzcGFuLmF0dHJpYnV0ZXNbJ2dpdGh1Yi5jb3BpbG90LnRpbWVfdG9fZmlyc3RfY2h1bmsnXTtcblx0XHRpZiAoY2xpID09PSB1bmRlZmluZWQpIHsgcmV0dXJuIG51bGw7IH1cblx0XHRjb25zdCBzZWMgPSB0eXBlb2YgY2xpID09PSAnbnVtYmVyJyA/IGNsaSA6IHBhcnNlRmxvYXQoU3RyaW5nKGNsaSkpO1xuXHRcdHJldHVybiBpc05hTihzZWMpID8gbnVsbCA6IE1hdGgucm91bmQoc2VjICogMTAwMCk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVEYigpOiBEYXRhYmFzZVN5bmMge1xuXHRcdGlmICh0aGlzLl9kYikgeyByZXR1cm4gdGhpcy5fZGI7IH1cblxuXHRcdGlmICh0aGlzLl9kYlBhdGggIT09ICc6bWVtb3J5OicpIHtcblx0XHRcdG1rZGlyU3luYyhkaXJuYW1lKHRoaXMuX2RiUGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgRGF0YWJhc2VTeW5jOiBEYXRhYmFzZVN5bmNDdG9yIH0gPSBsb2FkU3FsaXRlKCk7XG5cdFx0Y29uc3QgZGIgPSBuZXcgRGF0YWJhc2VTeW5jQ3Rvcih0aGlzLl9kYlBhdGgpO1xuXHRcdHRyeSB7XG5cdFx0XHRkYi5leGVjKCdQUkFHTUEgam91cm5hbF9tb2RlID0gV0FMJyk7XG5cdFx0XHRkYi5leGVjKCdQUkFHTUEgYnVzeV90aW1lb3V0ID0gMzAwMCcpO1xuXHRcdFx0ZGIuZXhlYygnUFJBR01BIGZvcmVpZ25fa2V5cyA9IE9OJyk7XG5cdFx0XHR0aGlzLl9kYiA9IGRiO1xuXHRcdFx0dGhpcy5fZW5zdXJlU2NoZW1hKCk7XG5cdFx0XHR0aGlzLl9wcmVwYXJlU3RhdGVtZW50cyhkYik7XG5cblx0XHRcdC8vIEF1dG8tY2xlYW51cCBvbiBzdGFydHVwOiByZW1vdmUgc3BhbnMgb2xkZXIgdGhhbiA3IGRheXMsXG5cdFx0XHQvLyB0aGVuIGNhcCB0byB0aGUgbW9zdCByZWNlbnQgREVGQVVMVF9NQVhfU0VTU0lPTlMgc2Vzc2lvbnMgYnkgY29udmVyc2F0aW9uX2lkLlxuXHRcdFx0dGhpcy5fY2xlYW51cE9uU3RhcnR1cChkYik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRkYi5jbG9zZSgpO1xuXHRcdFx0dGhpcy5fZGIgPSBudWxsO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGI7XG5cdH1cblxuXHRwcml2YXRlIF9wcmVwYXJlU3RhdGVtZW50cyhkYjogRGF0YWJhc2VTeW5jKTogdm9pZCB7XG5cdFx0dGhpcy5faW5zZXJ0U3BhblN0bXQgPSBkYi5wcmVwYXJlKGBcblx0XHRcdElOU0VSVCBPUiBSRVBMQUNFIElOVE8gc3BhbnMgKFxuXHRcdFx0XHRzcGFuX2lkLCB0cmFjZV9pZCwgcGFyZW50X3NwYW5faWQsIG5hbWUsXG5cdFx0XHRcdHN0YXJ0X3RpbWVfbXMsIGVuZF90aW1lX21zLCBzdGF0dXNfY29kZSwgc3RhdHVzX21lc3NhZ2UsXG5cdFx0XHRcdG9wZXJhdGlvbl9uYW1lLCBwcm92aWRlcl9uYW1lLCBhZ2VudF9uYW1lLCBjb252ZXJzYXRpb25faWQsXG5cdFx0XHRcdHJlcXVlc3RfbW9kZWwsIHJlc3BvbnNlX21vZGVsLFxuXHRcdFx0XHRpbnB1dF90b2tlbnMsIG91dHB1dF90b2tlbnMsIGNhY2hlZF90b2tlbnMsIHJlYXNvbmluZ190b2tlbnMsXG5cdFx0XHRcdHRvb2xfbmFtZSwgdG9vbF9jYWxsX2lkLCB0b29sX3R5cGUsXG5cdFx0XHRcdGNoYXRfc2Vzc2lvbl9pZCwgdHVybl9pbmRleCwgdHRmdF9tc1xuXHRcdFx0KSBWQUxVRVMgKD8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8sID8pXG5cdFx0YCk7XG5cdFx0dGhpcy5faW5zZXJ0QXR0clN0bXQgPSBkYi5wcmVwYXJlKFxuXHRcdFx0J0lOU0VSVCBPUiBSRVBMQUNFIElOVE8gc3Bhbl9hdHRyaWJ1dGVzIChzcGFuX2lkLCBrZXksIHZhbHVlKSBWQUxVRVMgKD8sID8sID8pJ1xuXHRcdCk7XG5cdFx0dGhpcy5faW5zZXJ0RXZlbnRTdG10ID0gZGIucHJlcGFyZShcblx0XHRcdCdJTlNFUlQgSU5UTyBzcGFuX2V2ZW50cyAoc3Bhbl9pZCwgbmFtZSwgdGltZXN0YW1wX21zLCBhdHRyaWJ1dGVzKSBWQUxVRVMgKD8sID8sID8sID8pJ1xuXHRcdCk7XG5cdFx0dGhpcy5fYmVnaW5UeCA9IGRiLnByZXBhcmUoJ0JFR0lOJyk7XG5cdFx0dGhpcy5fY29tbWl0VHggPSBkYi5wcmVwYXJlKCdDT01NSVQnKTtcblx0XHR0aGlzLl9yb2xsYmFja1R4ID0gZGIucHJlcGFyZSgnUk9MTEJBQ0snKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVNjaGVtYSgpOiB2b2lkIHtcblx0XHRjb25zdCBkYiA9IHRoaXMuX2RiITtcblx0XHRjb25zdCB2ZXJzaW9uUm93ID0gKCgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBkYi5wcmVwYXJlKCdTRUxFQ1QgdmVyc2lvbiBGUk9NIHNjaGVtYV92ZXJzaW9uIExJTUlUIDEnKS5nZXQoKSBhcyB7IHZlcnNpb246IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0fSBjYXRjaCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHR9KSgpO1xuXG5cdFx0aWYgKCh2ZXJzaW9uUm93Py52ZXJzaW9uID8/IDApID49IFNDSEVNQV9WRVJTSU9OKSB7IHJldHVybjsgfVxuXG5cdFx0ZGIuZXhlYyhgXG5cdFx0XHRDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzY2hlbWFfdmVyc2lvbiAodmVyc2lvbiBJTlRFR0VSIFBSSU1BUlkgS0VZKTtcblx0XHRcdElOU0VSVCBPUiBSRVBMQUNFIElOVE8gc2NoZW1hX3ZlcnNpb24gKHZlcnNpb24pIFZBTFVFUyAoJHtTQ0hFTUFfVkVSU0lPTn0pO1xuXG5cdFx0XHRDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBzcGFucyAoXG5cdFx0XHRcdHNwYW5faWQgVEVYVCBQUklNQVJZIEtFWSwgdHJhY2VfaWQgVEVYVCBOT1QgTlVMTCwgcGFyZW50X3NwYW5faWQgVEVYVCxcblx0XHRcdFx0bmFtZSBURVhUIE5PVCBOVUxMLCBzdGFydF90aW1lX21zIElOVEVHRVIgTk9UIE5VTEwsIGVuZF90aW1lX21zIElOVEVHRVIgTk9UIE5VTEwsXG5cdFx0XHRcdHN0YXR1c19jb2RlIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLCBzdGF0dXNfbWVzc2FnZSBURVhULFxuXHRcdFx0XHRvcGVyYXRpb25fbmFtZSBURVhULCBwcm92aWRlcl9uYW1lIFRFWFQsIGFnZW50X25hbWUgVEVYVCwgY29udmVyc2F0aW9uX2lkIFRFWFQsXG5cdFx0XHRcdHJlcXVlc3RfbW9kZWwgVEVYVCwgcmVzcG9uc2VfbW9kZWwgVEVYVCxcblx0XHRcdFx0aW5wdXRfdG9rZW5zIElOVEVHRVIsIG91dHB1dF90b2tlbnMgSU5URUdFUiwgY2FjaGVkX3Rva2VucyBJTlRFR0VSLCByZWFzb25pbmdfdG9rZW5zIElOVEVHRVIsXG5cdFx0XHRcdHRvb2xfbmFtZSBURVhULCB0b29sX2NhbGxfaWQgVEVYVCwgdG9vbF90eXBlIFRFWFQsXG5cdFx0XHRcdGNoYXRfc2Vzc2lvbl9pZCBURVhULCB0dXJuX2luZGV4IElOVEVHRVIsIHR0ZnRfbXMgUkVBTFxuXHRcdFx0KTtcblxuXHRcdFx0Q1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgc3Bhbl9hdHRyaWJ1dGVzIChcblx0XHRcdFx0c3Bhbl9pZCBURVhUIE5PVCBOVUxMIFJFRkVSRU5DRVMgc3BhbnMoc3Bhbl9pZCkgT04gREVMRVRFIENBU0NBREUsXG5cdFx0XHRcdGtleSBURVhUIE5PVCBOVUxMLCB2YWx1ZSBURVhULFxuXHRcdFx0XHRQUklNQVJZIEtFWSAoc3Bhbl9pZCwga2V5KVxuXHRcdFx0KTtcblxuXHRcdFx0Q1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgc3Bhbl9ldmVudHMgKFxuXHRcdFx0XHRpZCBJTlRFR0VSIFBSSU1BUlkgS0VZIEFVVE9JTkNSRU1FTlQsXG5cdFx0XHRcdHNwYW5faWQgVEVYVCBOT1QgTlVMTCBSRUZFUkVOQ0VTIHNwYW5zKHNwYW5faWQpIE9OIERFTEVURSBDQVNDQURFLFxuXHRcdFx0XHRuYW1lIFRFWFQgTk9UIE5VTEwsIHRpbWVzdGFtcF9tcyBJTlRFR0VSIE5PVCBOVUxMLCBhdHRyaWJ1dGVzIFRFWFRcblx0XHRcdCk7XG5cblx0XHRcdENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9zcGFuc190cmFjZSBPTiBzcGFucyh0cmFjZV9pZCk7XG5cdFx0XHRDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfc3BhbnNfY29udmVyc2F0aW9uIE9OIHNwYW5zKGNvbnZlcnNhdGlvbl9pZCk7XG5cdFx0XHRDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfc3BhbnNfY2hhdF9zZXNzaW9uIE9OIHNwYW5zKGNoYXRfc2Vzc2lvbl9pZCk7XG5cdFx0XHRDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyBpZHhfc3BhbnNfb3BlcmF0aW9uIE9OIHNwYW5zKG9wZXJhdGlvbl9uYW1lKTtcblx0XHRcdENSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIGlkeF9zcGFuc19zdGFydF90aW1lIE9OIHNwYW5zKHN0YXJ0X3RpbWVfbXMpO1xuXHRcdFx0Q1JFQVRFIElOREVYIElGIE5PVCBFWElTVFMgaWR4X3NwYW5fZXZlbnRzX3NwYW4gT04gc3Bhbl9ldmVudHMoc3Bhbl9pZCk7XG5cblx0XHRcdC0tIFNlc3Npb24gdmlldzogZGVyaXZlcyBzZXNzaW9uIGJvdW5kYXJpZXMgZnJvbSBzcGFuIGRhdGEuXG5cdFx0XHQtLSBObyBzZXBhcmF0ZSBzZXNzaW9ucyB0YWJsZSBuZWVkZWQgXHUyMDE0IGludm9rZV9hZ2VudCBzcGFucyBkZWZpbmUgc2Vzc2lvbiBsaWZlY3ljbGUuXG5cdFx0XHRDUkVBVEUgVklFVyBJRiBOT1QgRVhJU1RTIHNlc3Npb25zIEFTXG5cdFx0XHRTRUxFQ1Rcblx0XHRcdFx0Q09BTEVTQ0UoY29udmVyc2F0aW9uX2lkLCBjaGF0X3Nlc3Npb25faWQpIEFTIHNlc3Npb25faWQsXG5cdFx0XHRcdGFnZW50X25hbWUsXG5cdFx0XHRcdHJlc3BvbnNlX21vZGVsIEFTIG1vZGVsLFxuXHRcdFx0XHRNSU4oc3RhcnRfdGltZV9tcykgQVMgc3RhcnRlZF9hdCxcblx0XHRcdFx0TUFYKGVuZF90aW1lX21zKSBBUyBlbmRlZF9hdCxcblx0XHRcdFx0TUFYKGVuZF90aW1lX21zKSAtIE1JTihzdGFydF90aW1lX21zKSBBUyBkdXJhdGlvbl9tcyxcblx0XHRcdFx0Q09VTlQoKikgQVMgc3Bhbl9jb3VudCxcblx0XHRcdFx0U1VNKENBU0UgV0hFTiBvcGVyYXRpb25fbmFtZSA9ICdjaGF0JyBUSEVOIDEgRUxTRSAwIEVORCkgQVMgbGxtX2NhbGxzLFxuXHRcdFx0XHRTVU0oQ0FTRSBXSEVOIG9wZXJhdGlvbl9uYW1lID0gJ2V4ZWN1dGVfdG9vbCcgVEhFTiAxIEVMU0UgMCBFTkQpIEFTIHRvb2xfY2FsbHMsXG5cdFx0XHRcdFNVTShDQVNFIFdIRU4gb3BlcmF0aW9uX25hbWUgPSAnY2hhdCcgVEhFTiBpbnB1dF90b2tlbnMgRUxTRSAwIEVORCkgQVMgdG90YWxfaW5wdXRfdG9rZW5zLFxuXHRcdFx0XHRTVU0oQ0FTRSBXSEVOIG9wZXJhdGlvbl9uYW1lID0gJ2NoYXQnIFRIRU4gb3V0cHV0X3Rva2VucyBFTFNFIDAgRU5EKSBBUyB0b3RhbF9vdXRwdXRfdG9rZW5zLFxuXHRcdFx0XHRTVU0oQ0FTRSBXSEVOIG9wZXJhdGlvbl9uYW1lID0gJ2NoYXQnIFRIRU4gY2FjaGVkX3Rva2VucyBFTFNFIDAgRU5EKSBBUyB0b3RhbF9jYWNoZWRfdG9rZW5zXG5cdFx0XHRGUk9NIHNwYW5zXG5cdFx0XHRXSEVSRSBDT0FMRVNDRShjb252ZXJzYXRpb25faWQsIGNoYXRfc2Vzc2lvbl9pZCkgSVMgTk9UIE5VTExcblx0XHRcdEdST1VQIEJZIENPQUxFU0NFKGNvbnZlcnNhdGlvbl9pZCwgY2hhdF9zZXNzaW9uX2lkKTtcblx0XHRgKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFudXBPblN0YXJ0dXAoZGI6IERhdGFiYXNlU3luYyk6IHZvaWQge1xuXHRcdC8vIDEuIFRpbWUtYmFzZWQ6IGRlbGV0ZSBzcGFucyBvbGRlciB0aGFuIERFRkFVTFRfTUFYX0FHRV9NU1xuXHRcdGNvbnN0IGN1dG9mZk1zID0gRGF0ZS5ub3coKSAtIERFRkFVTFRfTUFYX0FHRV9NUztcblx0XHRkYi5wcmVwYXJlKCdERUxFVEUgRlJPTSBzcGFucyBXSEVSRSBzdGFydF90aW1lX21zIDwgPycpLnJ1bihjdXRvZmZNcyk7XG5cblx0XHQvLyAyLiBTZXNzaW9uLWNvdW50IGNhcDoga2VlcCBvbmx5IHRoZSBtb3N0IHJlY2VudCBERUZBVUxUX01BWF9TRVNTSU9OUyBzZXNzaW9ucy5cblx0XHQvLyBBIFwic2Vzc2lvblwiIGlzIGlkZW50aWZpZWQgYnkgY29udmVyc2F0aW9uX2lkIChvciBjaGF0X3Nlc3Npb25faWQgYXMgZmFsbGJhY2spLlxuXHRcdC8vIFdlIGZpbmQgdGhlIE50aC1uZXdlc3Qgc2Vzc2lvbidzIG1heCBzdGFydF90aW1lX21zIGFuZCBkZWxldGUgZXZlcnl0aGluZyBvbGRlci5cblx0XHRjb25zdCBzZXNzaW9uQ3V0b2ZmID0gZGIucHJlcGFyZShgXG5cdFx0XHRTRUxFQ1QgTUlOKG1heF9zdGFydCkgQVMgY3V0b2ZmX21zIEZST00gKFxuXHRcdFx0XHRTRUxFQ1QgTUFYKHN0YXJ0X3RpbWVfbXMpIEFTIG1heF9zdGFydFxuXHRcdFx0XHRGUk9NIHNwYW5zXG5cdFx0XHRcdFdIRVJFIENPQUxFU0NFKGNvbnZlcnNhdGlvbl9pZCwgY2hhdF9zZXNzaW9uX2lkKSBJUyBOT1QgTlVMTFxuXHRcdFx0XHRHUk9VUCBCWSBDT0FMRVNDRShjb252ZXJzYXRpb25faWQsIGNoYXRfc2Vzc2lvbl9pZClcblx0XHRcdFx0T1JERVIgQlkgbWF4X3N0YXJ0IERFU0Ncblx0XHRcdFx0TElNSVQgP1xuXHRcdFx0KVxuXHRcdGApLmdldChERUZBVUxUX01BWF9TRVNTSU9OUykgYXMgdW5rbm93biBhcyB7IGN1dG9mZl9tczogbnVtYmVyIHwgbnVsbCB9IHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHNlc3Npb25DdXRvZmY/LmN1dG9mZl9tcykge1xuXHRcdFx0ZGIucHJlcGFyZShgXG5cdFx0XHRcdERFTEVURSBGUk9NIHNwYW5zXG5cdFx0XHRcdFdIRVJFIHN0YXJ0X3RpbWVfbXMgPCA/XG5cdFx0XHRcdEFORCBDT0FMRVNDRShjb252ZXJzYXRpb25faWQsIGNoYXRfc2Vzc2lvbl9pZCkgTk9UIElOIChcblx0XHRcdFx0XHRTRUxFQ1QgQ09BTEVTQ0UoY29udmVyc2F0aW9uX2lkLCBjaGF0X3Nlc3Npb25faWQpXG5cdFx0XHRcdFx0RlJPTSBzcGFuc1xuXHRcdFx0XHRcdFdIRVJFIENPQUxFU0NFKGNvbnZlcnNhdGlvbl9pZCwgY2hhdF9zZXNzaW9uX2lkKSBJUyBOT1QgTlVMTFxuXHRcdFx0XHRcdEdST1VQIEJZIENPQUxFU0NFKGNvbnZlcnNhdGlvbl9pZCwgY2hhdF9zZXNzaW9uX2lkKVxuXHRcdFx0XHRcdE9SREVSIEJZIE1BWChzdGFydF90aW1lX21zKSBERVNDXG5cdFx0XHRcdFx0TElNSVQgP1xuXHRcdFx0XHQpXG5cdFx0XHRgKS5ydW4oc2Vzc2lvbkN1dG9mZi5jdXRvZmZfbXMsIERFRkFVTFRfTUFYX1NFU1NJT05TKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCO0FBRzFCLFNBQVMscUJBQXFCO0FBRzlCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQixpQkFBaUI7QUFPM0MsTUFBTSxjQUFjLGNBQWMsWUFBWSxHQUFHO0FBQ2pELFNBQVMsYUFBMkM7QUFDbkQsU0FBTyxZQUFZLGFBQWE7QUFDakM7QUFHQSxNQUFNLGlCQUFpQjtBQUt2QixNQUFNLHFCQUFxQixJQUFJLEtBQUssS0FB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
