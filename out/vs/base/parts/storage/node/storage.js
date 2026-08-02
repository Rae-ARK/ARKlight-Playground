import * as fs from "fs";
import { timeout } from "../../../common/async.js";
import { Event } from "../../../common/event.js";
import { mapToString, setToString } from "../../../common/map.js";
import { basename } from "../../../common/path.js";
import { Promises } from "../../../node/pfs.js";
const _SQLiteStorageDatabase = class _SQLiteStorageDatabase {
  constructor(path, options = /* @__PURE__ */ Object.create(null)) {
    this.path = path;
    this.name = basename(this.path);
    this.logger = new SQLiteStorageDatabaseLogger(options.logging);
    this.useWAL = !!options.useWAL;
    this.busyTimeout = options.busyTimeout;
    this.whenConnected = this.connect(this.path);
  }
  get onDidChangeItemsExternal() {
    return Event.None;
  }
  async getItems() {
    const connection = await this.whenConnected;
    const items = /* @__PURE__ */ new Map();
    const rows = await this.all(connection, "SELECT * FROM ItemTable");
    rows.forEach((row) => items.set(row.key, row.value));
    if (this.logger.isTracing) {
      this.logger.trace(`[storage ${this.name}] getItems(): ${items.size} rows`);
    }
    return items;
  }
  async updateItems(request) {
    const connection = await this.whenConnected;
    return this.doUpdateItems(connection, request);
  }
  doUpdateItems(connection, request) {
    if (this.logger.isTracing) {
      this.logger.trace(`[storage ${this.name}] updateItems(): insert(${request.insert ? mapToString(request.insert) : "0"}), delete(${request.delete ? setToString(request.delete) : "0"})`);
    }
    return this.transaction(connection, () => {
      const toInsert = request.insert;
      const toDelete = request.delete;
      if (toInsert && toInsert.size > 0) {
        const keysValuesChunks = [];
        keysValuesChunks.push([]);
        let currentChunkIndex = 0;
        toInsert.forEach((value, key) => {
          let keyValueChunk = keysValuesChunks[currentChunkIndex];
          if (keyValueChunk.length > _SQLiteStorageDatabase.MAX_HOST_PARAMETERS) {
            currentChunkIndex++;
            keyValueChunk = [];
            keysValuesChunks.push(keyValueChunk);
          }
          keyValueChunk.push(key, value);
        });
        keysValuesChunks.forEach((keysValuesChunk) => {
          this.prepare(connection, `INSERT INTO ItemTable VALUES ${new Array(keysValuesChunk.length / 2).fill("(?,?)").join(",")} ON CONFLICT (key) DO UPDATE SET value = excluded.value WHERE value != excluded.value`, (stmt) => stmt.run(keysValuesChunk), () => {
            const keys = [];
            let length = 0;
            toInsert.forEach((value, key) => {
              keys.push(key);
              length += value.length;
            });
            return `Keys: ${keys.join(", ")} Length: ${length}`;
          });
        });
      }
      if (toDelete?.size) {
        const keysChunks = [];
        keysChunks.push([]);
        let currentChunkIndex = 0;
        toDelete.forEach((key) => {
          let keyChunk = keysChunks[currentChunkIndex];
          if (keyChunk.length > _SQLiteStorageDatabase.MAX_HOST_PARAMETERS) {
            currentChunkIndex++;
            keyChunk = [];
            keysChunks.push(keyChunk);
          }
          keyChunk.push(key);
        });
        keysChunks.forEach((keysChunk) => {
          this.prepare(connection, `DELETE FROM ItemTable WHERE key IN (${new Array(keysChunk.length).fill("?").join(",")})`, (stmt) => stmt.run(keysChunk), () => {
            const keys = [];
            toDelete.forEach((key) => {
              keys.push(key);
            });
            return `Keys: ${keys.join(", ")}`;
          });
        });
      }
    });
  }
  async optimize() {
    this.logger.trace(`[storage ${this.name}] vacuum()`);
    const connection = await this.whenConnected;
    return this.exec(connection, "VACUUM");
  }
  async close(recovery) {
    this.logger.trace(`[storage ${this.name}] close()`);
    const connection = await this.whenConnected;
    return this.doClose(connection, recovery);
  }
  doClose(connection, recovery) {
    return new Promise((resolve, reject) => {
      connection.db.close((closeError) => {
        if (closeError) {
          this.handleSQLiteError(connection, `[storage ${this.name}] close(): ${closeError}`);
        }
        if (this.path === _SQLiteStorageDatabase.IN_MEMORY_PATH) {
          return resolve();
        }
        if (!connection.isErroneous && !connection.isInMemory) {
          return this.backup().then(resolve, (error) => {
            this.logger.error(`[storage ${this.name}] backup(): ${error}`);
            return resolve();
          });
        }
        if (typeof recovery === "function") {
          return fs.promises.unlink(this.path).then(() => {
            return this.doConnect(this.path).then((recoveryConnection) => {
              const closeRecoveryConnection = () => {
                return this.doClose(
                  recoveryConnection,
                  void 0
                  /* do not attempt to recover again */
                );
              };
              return this.doUpdateItems(recoveryConnection, { insert: recovery() }).then(() => closeRecoveryConnection(), (error) => {
                closeRecoveryConnection();
                return Promise.reject(error);
              });
            });
          }).then(resolve, reject);
        }
        return reject(closeError || new Error("Database has errors or is in-memory without recovery option"));
      });
    });
  }
  backup() {
    const backupPath = this.toBackupPath(this.path);
    return Promises.copy(this.path, backupPath, { preserveSymlinks: false });
  }
  toBackupPath(path) {
    return `${path}.backup`;
  }
  async checkIntegrity(full) {
    this.logger.trace(`[storage ${this.name}] checkIntegrity(full: ${full})`);
    const connection = await this.whenConnected;
    const row = await this.get(connection, full ? "PRAGMA integrity_check" : "PRAGMA quick_check");
    const integrity = full ? row.integrity_check : row.quick_check;
    if (connection.isErroneous) {
      return `${integrity} (last error: ${connection.lastError})`;
    }
    if (connection.isInMemory) {
      return `${integrity} (in-memory!)`;
    }
    return integrity;
  }
  async connect(path, retryOnBusy = true) {
    this.logger.trace(`[storage ${this.name}] open(${path}, retryOnBusy: ${retryOnBusy})`);
    try {
      return await this.doConnect(path);
    } catch (error) {
      this.logger.error(`[storage ${this.name}] open(): Unable to open DB due to ${error}`);
      if (error.code === "SQLITE_BUSY" && retryOnBusy) {
        await timeout(_SQLiteStorageDatabase.BUSY_OPEN_TIMEOUT);
        return this.connect(
          path,
          false
          /* not another retry */
        );
      }
      try {
        await fs.promises.unlink(path);
        try {
          await Promises.rename(
            this.toBackupPath(path),
            path,
            false
            /* no retry */
          );
        } catch {
        }
        return await this.doConnect(path);
      } catch (error2) {
        this.logger.error(`[storage ${this.name}] open(): Unable to use backup due to ${error2}`);
        return this.doConnect(_SQLiteStorageDatabase.IN_MEMORY_PATH);
      }
    }
  }
  handleSQLiteError(connection, msg) {
    connection.isErroneous = true;
    connection.lastError = msg;
    this.logger.error(msg);
  }
  doConnect(path) {
    return new Promise((resolve, reject) => {
      import("@vscode/sqlite3").then((sqlite3) => {
        const ctor = this.logger.isTracing ? sqlite3.default.verbose().Database : sqlite3.default.Database;
        const connection = {
          db: new ctor(path, (error) => {
            if (error) {
              return connection.db && error.code !== "SQLITE_CANTOPEN" ? connection.db.close(() => reject(error)) : reject(error);
            }
            const pragmas = [
              "PRAGMA user_version = 1;",
              "CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);"
            ];
            if (this.useWAL) {
              pragmas.push("PRAGMA journal_mode=WAL;");
            }
            if (this.busyTimeout) {
              pragmas.push(`PRAGMA busy_timeout=${this.busyTimeout};`);
            }
            return this.exec(connection, pragmas.join("")).then(() => {
              return resolve(connection);
            }, (error2) => {
              return connection.db.close(() => reject(error2));
            });
          }),
          isInMemory: path === _SQLiteStorageDatabase.IN_MEMORY_PATH
        };
        connection.db.on("error", (error) => this.handleSQLiteError(connection, `[storage ${this.name}] Error (event): ${error}`));
        if (this.logger.isTracing) {
          connection.db.on("trace", (sql) => this.logger.trace(`[storage ${this.name}] Trace (event): ${sql}`));
        }
      }, reject);
    });
  }
  exec(connection, sql) {
    return new Promise((resolve, reject) => {
      connection.db.exec(sql, (error) => {
        if (error) {
          this.handleSQLiteError(connection, `[storage ${this.name}] exec(): ${error}`);
          return reject(error);
        }
        return resolve();
      });
    });
  }
  get(connection, sql) {
    return new Promise((resolve, reject) => {
      connection.db.get(sql, (error, row) => {
        if (error) {
          this.handleSQLiteError(connection, `[storage ${this.name}] get(): ${error}`);
          return reject(error);
        }
        return resolve(row);
      });
    });
  }
  all(connection, sql) {
    return new Promise((resolve, reject) => {
      connection.db.all(sql, (error, rows) => {
        if (error) {
          this.handleSQLiteError(connection, `[storage ${this.name}] all(): ${error}`);
          return reject(error);
        }
        return resolve(rows);
      });
    });
  }
  transaction(connection, transactions) {
    return new Promise((resolve, reject) => {
      connection.db.serialize(() => {
        connection.db.run("BEGIN TRANSACTION");
        transactions();
        connection.db.run("END TRANSACTION", (error) => {
          if (error) {
            this.handleSQLiteError(connection, `[storage ${this.name}] transaction(): ${error}`);
            return reject(error);
          }
          return resolve();
        });
      });
    });
  }
  prepare(connection, sql, runCallback, errorDetails) {
    const stmt = connection.db.prepare(sql);
    const statementErrorListener = (error) => {
      this.handleSQLiteError(connection, `[storage ${this.name}] prepare(): ${error} (${sql}). Details: ${errorDetails()}`);
    };
    stmt.on("error", statementErrorListener);
    runCallback(stmt);
    stmt.finalize((error) => {
      if (error) {
        statementErrorListener(error);
      }
      stmt.removeListener("error", statementErrorListener);
    });
  }
};
_SQLiteStorageDatabase.IN_MEMORY_PATH = ":memory:";
// since we are the only client, there can be no external changes
_SQLiteStorageDatabase.BUSY_OPEN_TIMEOUT = 2e3;
// timeout in ms to retry when opening DB fails with SQLITE_BUSY
_SQLiteStorageDatabase.MAX_HOST_PARAMETERS = 256;
let SQLiteStorageDatabase = _SQLiteStorageDatabase;
const _SQLiteStorageDatabaseLogger = class _SQLiteStorageDatabaseLogger {
  constructor(options) {
    if (options && typeof options.logTrace === "function" && process.env[_SQLiteStorageDatabaseLogger.VSCODE_TRACE_STORAGE]) {
      this.logTrace = options.logTrace;
    }
    if (options && typeof options.logError === "function") {
      this.logError = options.logError;
    }
  }
  get isTracing() {
    return !!this.logTrace;
  }
  trace(msg) {
    this.logTrace?.(msg);
  }
  error(error) {
    this.logError?.(error);
  }
};
// to reduce lots of output, require an environment variable to enable tracing
// this helps when running with --verbose normally where the storage tracing
// might hide useful output to look at
_SQLiteStorageDatabaseLogger.VSCODE_TRACE_STORAGE = "VSCODE_TRACE_STORAGE";
let SQLiteStorageDatabaseLogger = _SQLiteStorageDatabaseLogger;
export {
  SQLiteStorageDatabase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvcGFydHMvc3RvcmFnZS9ub2RlL3N0b3JhZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG1hcFRvU3RyaW5nLCBzZXRUb1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlRGF0YWJhc2UsIElTdG9yYWdlSXRlbXNDaGFuZ2VFdmVudCwgSVVwZGF0ZVJlcXVlc3QgfSBmcm9tICcuLi9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgdHlwZSB7IERhdGFiYXNlLCBTdGF0ZW1lbnQgfSBmcm9tICdAdnNjb2RlL3NxbGl0ZTMnO1xuXG5pbnRlcmZhY2UgSURhdGFiYXNlQ29ubmVjdGlvbiB7XG5cdHJlYWRvbmx5IGRiOiBEYXRhYmFzZTtcblx0cmVhZG9ubHkgaXNJbk1lbW9yeTogYm9vbGVhbjtcblxuXHRpc0Vycm9uZW91cz86IGJvb2xlYW47XG5cdGxhc3RFcnJvcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU1FMaXRlU3RvcmFnZURhdGFiYXNlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGxvZ2dpbmc/OiBJU1FMaXRlU3RvcmFnZURhdGFiYXNlTG9nZ2luZ09wdGlvbnM7XG5cdHJlYWRvbmx5IHVzZVdBTD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIElmIHNldCwgY29uZmlndXJlcyBTUUxpdGUncyBidXN5IHRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzLlxuXHQgKiBXaGVuIGFub3RoZXIgcHJvY2VzcyBob2xkcyBhIHdyaXRlIGxvY2ssIFNRTGl0ZSB3aWxsIHJldHJ5XG5cdCAqIGZvciB0aGlzIGR1cmF0aW9uIGJlZm9yZSByZXR1cm5pbmcgU1FMSVRFX0JVU1kuXG5cdCAqL1xuXHRyZWFkb25seSBidXN5VGltZW91dD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU1FMaXRlU3RvcmFnZURhdGFiYXNlTG9nZ2luZ09wdGlvbnMge1xuXHRsb2dFcnJvcj86IChlcnJvcjogc3RyaW5nIHwgRXJyb3IpID0+IHZvaWQ7XG5cdGxvZ1RyYWNlPzogKG1zZzogc3RyaW5nKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgU1FMaXRlU3RvcmFnZURhdGFiYXNlIGltcGxlbWVudHMgSVN0b3JhZ2VEYXRhYmFzZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElOX01FTU9SWV9QQVRIID0gJzptZW1vcnk6JztcblxuXHRnZXQgb25EaWRDaGFuZ2VJdGVtc0V4dGVybmFsKCk6IEV2ZW50PElTdG9yYWdlSXRlbXNDaGFuZ2VFdmVudD4geyByZXR1cm4gRXZlbnQuTm9uZTsgfSAvLyBzaW5jZSB3ZSBhcmUgdGhlIG9ubHkgY2xpZW50LCB0aGVyZSBjYW4gYmUgbm8gZXh0ZXJuYWwgY2hhbmdlc1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEJVU1lfT1BFTl9USU1FT1VUID0gMjAwMDsgLy8gdGltZW91dCBpbiBtcyB0byByZXRyeSB3aGVuIG9wZW5pbmcgREIgZmFpbHMgd2l0aCBTUUxJVEVfQlVTWVxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfSE9TVF9QQVJBTUVURVJTID0gMjU2OyAvLyBtYXhpbXVtIG51bWJlciBvZiBwYXJhbWV0ZXJzIHdpdGhpbiBhIHN0YXRlbWVudFxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyOiBTUUxpdGVTdG9yYWdlRGF0YWJhc2VMb2dnZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgdXNlV0FMOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IGJ1c3lUaW1lb3V0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aGVuQ29ubmVjdGVkOiBQcm9taXNlPElEYXRhYmFzZUNvbm5lY3Rpb24+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGF0aDogc3RyaW5nLFxuXHRcdG9wdGlvbnM6IElTUUxpdGVTdG9yYWdlRGF0YWJhc2VPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKVxuXHQpIHtcblx0XHR0aGlzLm5hbWUgPSBiYXNlbmFtZSh0aGlzLnBhdGgpO1xuXHRcdHRoaXMubG9nZ2VyID0gbmV3IFNRTGl0ZVN0b3JhZ2VEYXRhYmFzZUxvZ2dlcihvcHRpb25zLmxvZ2dpbmcpO1xuXHRcdHRoaXMudXNlV0FMID0gISFvcHRpb25zLnVzZVdBTDtcblx0XHR0aGlzLmJ1c3lUaW1lb3V0ID0gb3B0aW9ucy5idXN5VGltZW91dDtcblx0XHR0aGlzLndoZW5Db25uZWN0ZWQgPSB0aGlzLmNvbm5lY3QodGhpcy5wYXRoKTtcblx0fVxuXG5cdGFzeW5jIGdldEl0ZW1zKCk6IFByb21pc2U8TWFwPHN0cmluZywgc3RyaW5nPj4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLndoZW5Db25uZWN0ZWQ7XG5cblx0XHRjb25zdCBpdGVtcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0XHRjb25zdCByb3dzID0gYXdhaXQgdGhpcy5hbGwoY29ubmVjdGlvbiwgJ1NFTEVDVCAqIEZST00gSXRlbVRhYmxlJyk7XG5cdFx0cm93cy5mb3JFYWNoKHJvdyA9PiBpdGVtcy5zZXQocm93LmtleSwgcm93LnZhbHVlKSk7XG5cblx0XHRpZiAodGhpcy5sb2dnZXIuaXNUcmFjaW5nKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci50cmFjZShgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBnZXRJdGVtcygpOiAke2l0ZW1zLnNpemV9IHJvd3NgKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVJdGVtcyhyZXF1ZXN0OiBJVXBkYXRlUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLndoZW5Db25uZWN0ZWQ7XG5cblx0XHRyZXR1cm4gdGhpcy5kb1VwZGF0ZUl0ZW1zKGNvbm5lY3Rpb24sIHJlcXVlc3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZUl0ZW1zKGNvbm5lY3Rpb246IElEYXRhYmFzZUNvbm5lY3Rpb24sIHJlcXVlc3Q6IElVcGRhdGVSZXF1ZXN0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMubG9nZ2VyLmlzVHJhY2luZykge1xuXHRcdFx0dGhpcy5sb2dnZXIudHJhY2UoYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gdXBkYXRlSXRlbXMoKTogaW5zZXJ0KCR7cmVxdWVzdC5pbnNlcnQgPyBtYXBUb1N0cmluZyhyZXF1ZXN0Lmluc2VydCkgOiAnMCd9KSwgZGVsZXRlKCR7cmVxdWVzdC5kZWxldGUgPyBzZXRUb1N0cmluZyhyZXF1ZXN0LmRlbGV0ZSkgOiAnMCd9KWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnRyYW5zYWN0aW9uKGNvbm5lY3Rpb24sICgpID0+IHtcblx0XHRcdGNvbnN0IHRvSW5zZXJ0ID0gcmVxdWVzdC5pbnNlcnQ7XG5cdFx0XHRjb25zdCB0b0RlbGV0ZSA9IHJlcXVlc3QuZGVsZXRlO1xuXG5cdFx0XHQvLyBJTlNFUlRcblx0XHRcdGlmICh0b0luc2VydCAmJiB0b0luc2VydC5zaXplID4gMCkge1xuXHRcdFx0XHRjb25zdCBrZXlzVmFsdWVzQ2h1bmtzOiAoc3RyaW5nW10pW10gPSBbXTtcblx0XHRcdFx0a2V5c1ZhbHVlc0NodW5rcy5wdXNoKFtdKTsgLy8gc2VlZCB3aXRoIGluaXRpYWwgZW1wdHkgY2h1bmtcblxuXHRcdFx0XHQvLyBTcGxpdCBrZXkvdmFsdWVzIGludG8gY2h1bmtzIG9mIFNRTGl0ZVN0b3JhZ2VEYXRhYmFzZS5NQVhfSE9TVF9QQVJBTUVURVJTXG5cdFx0XHRcdC8vIHNvIHRoYXQgd2UgY2FuIGVmZmljaWVudGx5IHJ1biB0aGUgSU5TRVJUIHdpdGggYXMgbWFueSBIT1NUIHBhcmFtZXRlcnMgYXMgcG9zc2libGVcblx0XHRcdFx0bGV0IGN1cnJlbnRDaHVua0luZGV4ID0gMDtcblx0XHRcdFx0dG9JbnNlcnQuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0XHRcdGxldCBrZXlWYWx1ZUNodW5rID0ga2V5c1ZhbHVlc0NodW5rc1tjdXJyZW50Q2h1bmtJbmRleF07XG5cblx0XHRcdFx0XHRpZiAoa2V5VmFsdWVDaHVuay5sZW5ndGggPiBTUUxpdGVTdG9yYWdlRGF0YWJhc2UuTUFYX0hPU1RfUEFSQU1FVEVSUykge1xuXHRcdFx0XHRcdFx0Y3VycmVudENodW5rSW5kZXgrKztcblx0XHRcdFx0XHRcdGtleVZhbHVlQ2h1bmsgPSBbXTtcblx0XHRcdFx0XHRcdGtleXNWYWx1ZXNDaHVua3MucHVzaChrZXlWYWx1ZUNodW5rKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRrZXlWYWx1ZUNodW5rLnB1c2goa2V5LCB2YWx1ZSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGtleXNWYWx1ZXNDaHVua3MuZm9yRWFjaChrZXlzVmFsdWVzQ2h1bmsgPT4ge1xuXHRcdFx0XHRcdHRoaXMucHJlcGFyZShjb25uZWN0aW9uLCBgSU5TRVJUIElOVE8gSXRlbVRhYmxlIFZBTFVFUyAke25ldyBBcnJheShrZXlzVmFsdWVzQ2h1bmsubGVuZ3RoIC8gMikuZmlsbCgnKD8sPyknKS5qb2luKCcsJyl9IE9OIENPTkZMSUNUIChrZXkpIERPIFVQREFURSBTRVQgdmFsdWUgPSBleGNsdWRlZC52YWx1ZSBXSEVSRSB2YWx1ZSAhPSBleGNsdWRlZC52YWx1ZWAsIHN0bXQgPT4gc3RtdC5ydW4oa2V5c1ZhbHVlc0NodW5rKSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0XHRcdGxldCBsZW5ndGggPSAwO1xuXHRcdFx0XHRcdFx0dG9JbnNlcnQuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRrZXlzLnB1c2goa2V5KTtcblx0XHRcdFx0XHRcdFx0bGVuZ3RoICs9IHZhbHVlLmxlbmd0aDtcblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gYEtleXM6ICR7a2V5cy5qb2luKCcsICcpfSBMZW5ndGg6ICR7bGVuZ3RofWA7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBERUxFVEVcblx0XHRcdGlmICh0b0RlbGV0ZT8uc2l6ZSkge1xuXHRcdFx0XHRjb25zdCBrZXlzQ2h1bmtzOiAoc3RyaW5nW10pW10gPSBbXTtcblx0XHRcdFx0a2V5c0NodW5rcy5wdXNoKFtdKTsgLy8gc2VlZCB3aXRoIGluaXRpYWwgZW1wdHkgY2h1bmtcblxuXHRcdFx0XHQvLyBTcGxpdCBrZXlzIGludG8gY2h1bmtzIG9mIFNRTGl0ZVN0b3JhZ2VEYXRhYmFzZS5NQVhfSE9TVF9QQVJBTUVURVJTXG5cdFx0XHRcdC8vIHNvIHRoYXQgd2UgY2FuIGVmZmljaWVudGx5IHJ1biB0aGUgREVMRVRFIHdpdGggYXMgbWFueSBIT1NUIHBhcmFtZXRlcnNcblx0XHRcdFx0Ly8gYXMgcG9zc2libGVcblx0XHRcdFx0bGV0IGN1cnJlbnRDaHVua0luZGV4ID0gMDtcblx0XHRcdFx0dG9EZWxldGUuZm9yRWFjaChrZXkgPT4ge1xuXHRcdFx0XHRcdGxldCBrZXlDaHVuayA9IGtleXNDaHVua3NbY3VycmVudENodW5rSW5kZXhdO1xuXG5cdFx0XHRcdFx0aWYgKGtleUNodW5rLmxlbmd0aCA+IFNRTGl0ZVN0b3JhZ2VEYXRhYmFzZS5NQVhfSE9TVF9QQVJBTUVURVJTKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50Q2h1bmtJbmRleCsrO1xuXHRcdFx0XHRcdFx0a2V5Q2h1bmsgPSBbXTtcblx0XHRcdFx0XHRcdGtleXNDaHVua3MucHVzaChrZXlDaHVuayk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0a2V5Q2h1bmsucHVzaChrZXkpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRrZXlzQ2h1bmtzLmZvckVhY2goa2V5c0NodW5rID0+IHtcblx0XHRcdFx0XHR0aGlzLnByZXBhcmUoY29ubmVjdGlvbiwgYERFTEVURSBGUk9NIEl0ZW1UYWJsZSBXSEVSRSBrZXkgSU4gKCR7bmV3IEFycmF5KGtleXNDaHVuay5sZW5ndGgpLmZpbGwoJz8nKS5qb2luKCcsJyl9KWAsIHN0bXQgPT4gc3RtdC5ydW4oa2V5c0NodW5rKSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0XHRcdHRvRGVsZXRlLmZvckVhY2goa2V5ID0+IHtcblx0XHRcdFx0XHRcdFx0a2V5cy5wdXNoKGtleSk7XG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIGBLZXlzOiAke2tleXMuam9pbignLCAnKX1gO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIG9wdGltaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIHZhY3V1bSgpYCk7XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy53aGVuQ29ubmVjdGVkO1xuXG5cdFx0cmV0dXJuIHRoaXMuZXhlYyhjb25uZWN0aW9uLCAnVkFDVVVNJyk7XG5cdH1cblxuXHRhc3luYyBjbG9zZShyZWNvdmVyeT86ICgpID0+IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ2dlci50cmFjZShgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBjbG9zZSgpYCk7XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy53aGVuQ29ubmVjdGVkO1xuXG5cdFx0cmV0dXJuIHRoaXMuZG9DbG9zZShjb25uZWN0aW9uLCByZWNvdmVyeSk7XG5cdH1cblxuXHRwcml2YXRlIGRvQ2xvc2UoY29ubmVjdGlvbjogSURhdGFiYXNlQ29ubmVjdGlvbiwgcmVjb3Zlcnk/OiAoKSA9PiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbm5lY3Rpb24uZGIuY2xvc2UoY2xvc2VFcnJvciA9PiB7XG5cdFx0XHRcdGlmIChjbG9zZUVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVTUUxpdGVFcnJvcihjb25uZWN0aW9uLCBgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBjbG9zZSgpOiAke2Nsb3NlRXJyb3J9YCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhpcyBzdG9yYWdlIHdhcyBjcmVhdGVkIG9ubHkgaW4tbWVtb3J5XG5cdFx0XHRcdC8vIGUuZy4gd2hlbiBydW5uaW5nIHRlc3RzIHdlIGRvIG5vdCBuZWVkIHRvIGJhY2t1cC5cblx0XHRcdFx0aWYgKHRoaXMucGF0aCA9PT0gU1FMaXRlU3RvcmFnZURhdGFiYXNlLklOX01FTU9SWV9QQVRIKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHRoZSBEQiBjbG9zZWQgc3VjY2Vzc2Z1bGx5IGFuZCB3ZSBhcmUgbm90IHJ1bm5pbmcgaW4tbWVtb3J5XG5cdFx0XHRcdC8vIGFuZCB0aGUgREIgZGlkIG5vdCBnZXQgZXJyb3JzIGR1cmluZyBydW50aW1lLCBtYWtlIGEgYmFja3VwXG5cdFx0XHRcdC8vIG9mIHRoZSBEQiBzbyB0aGF0IHdlIGNhbiB1c2UgaXQgYXMgZmFsbGJhY2sgaW4gY2FzZSB0aGUgYWN0dWFsXG5cdFx0XHRcdC8vIERCIGJlY29tZXMgY29ycnVwdCBpbiB0aGUgZnV0dXJlLlxuXHRcdFx0XHRpZiAoIWNvbm5lY3Rpb24uaXNFcnJvbmVvdXMgJiYgIWNvbm5lY3Rpb24uaXNJbk1lbW9yeSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmJhY2t1cCgpLnRoZW4ocmVzb2x2ZSwgZXJyb3IgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IoYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gYmFja3VwKCk6ICR7ZXJyb3J9YCk7XG5cblx0XHRcdFx0XHRcdHJldHVybiByZXNvbHZlKCk7IC8vIGlnbm9yZSBmYWlsaW5nIGJhY2t1cFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVjb3Zlcnk6IGlmIHdlIGRldGVjdGVkIGVycm9ycyB3aGlsZSB1c2luZyB0aGUgREIgb3Igd2UgYXJlIHVzaW5nXG5cdFx0XHRcdC8vIGFuIGlubWVtb3J5IERCIChhcyBhIGZhbGxiYWNrIHRvIG5vdCBiZWluZyBhYmxlIHRvIG9wZW4gdGhlIERCIGluaXRpYWxseSlcblx0XHRcdFx0Ly8gYW5kIHdlIGhhdmUgYSByZWNvdmVyeSBmdW5jdGlvbiBwcm92aWRlZCwgd2UgcmVjcmVhdGUgdGhlIERCIHdpdGggdGhpc1xuXHRcdFx0XHQvLyBkYXRhIHRvIHJlY292ZXIgYWxsIGtub3duIGRhdGEgd2l0aG91dCBsb3NzIGlmIHBvc3NpYmxlLlxuXHRcdFx0XHRpZiAodHlwZW9mIHJlY292ZXJ5ID09PSAnZnVuY3Rpb24nKSB7XG5cblx0XHRcdFx0XHQvLyBEZWxldGUgdGhlIGV4aXN0aW5nIERCLiBJZiB0aGUgcGF0aCBkb2VzIG5vdCBleGlzdCBvciBmYWlscyB0b1xuXHRcdFx0XHRcdC8vIGJlIGRlbGV0ZWQsIHdlIGRvIG5vdCB0cnkgdG8gcmVjb3ZlciBhbnltb3JlIGJlY2F1c2Ugd2UgYXNzdW1lXG5cdFx0XHRcdFx0Ly8gdGhhdCB0aGUgcGF0aCBpcyBubyBsb25nZXIgd3JpdGVhYmxlIGZvciB1cy5cblx0XHRcdFx0XHRyZXR1cm4gZnMucHJvbWlzZXMudW5saW5rKHRoaXMucGF0aCkudGhlbigoKSA9PiB7XG5cblx0XHRcdFx0XHRcdC8vIFJlLW9wZW4gdGhlIERCIGZyZXNoXG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb0Nvbm5lY3QodGhpcy5wYXRoKS50aGVuKHJlY292ZXJ5Q29ubmVjdGlvbiA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNsb3NlUmVjb3ZlcnlDb25uZWN0aW9uID0gKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmRvQ2xvc2UocmVjb3ZlcnlDb25uZWN0aW9uLCB1bmRlZmluZWQgLyogZG8gbm90IGF0dGVtcHQgdG8gcmVjb3ZlciBhZ2FpbiAqLyk7XG5cdFx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdFx0Ly8gU3RvcmUgaXRlbXNcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZG9VcGRhdGVJdGVtcyhyZWNvdmVyeUNvbm5lY3Rpb24sIHsgaW5zZXJ0OiByZWNvdmVyeSgpIH0pLnRoZW4oKCkgPT4gY2xvc2VSZWNvdmVyeUNvbm5lY3Rpb24oKSwgZXJyb3IgPT4ge1xuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gSW4gY2FzZSBvZiBhbiBlcnJvciB1cGRhdGluZyBpdGVtcywgc3RpbGwgZW5zdXJlIHRvIGNsb3NlIHRoZSBjb25uZWN0aW9uXG5cdFx0XHRcdFx0XHRcdFx0Ly8gdG8gcHJldmVudCBTUUxJVEVfQlVTWSBlcnJvcnMgd2hlbiB0aGUgY29ubmVjdGlvbiBpcyByZWVzdGFibGlzaGVkXG5cdFx0XHRcdFx0XHRcdFx0Y2xvc2VSZWNvdmVyeUNvbm5lY3Rpb24oKTtcblxuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSkudGhlbihyZXNvbHZlLCByZWplY3QpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRmluYWxseSB3aXRob3V0IHJlY292ZXJ5IHdlIGp1c3QgcmVqZWN0XG5cdFx0XHRcdHJldHVybiByZWplY3QoY2xvc2VFcnJvciB8fCBuZXcgRXJyb3IoJ0RhdGFiYXNlIGhhcyBlcnJvcnMgb3IgaXMgaW4tbWVtb3J5IHdpdGhvdXQgcmVjb3Zlcnkgb3B0aW9uJykpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGJhY2t1cCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBiYWNrdXBQYXRoID0gdGhpcy50b0JhY2t1cFBhdGgodGhpcy5wYXRoKTtcblxuXHRcdHJldHVybiBQcm9taXNlcy5jb3B5KHRoaXMucGF0aCwgYmFja3VwUGF0aCwgeyBwcmVzZXJ2ZVN5bWxpbmtzOiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgdG9CYWNrdXBQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3BhdGh9LmJhY2t1cGA7XG5cdH1cblxuXHRhc3luYyBjaGVja0ludGVncml0eShmdWxsOiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0aGlzLmxvZ2dlci50cmFjZShgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBjaGVja0ludGVncml0eShmdWxsOiAke2Z1bGx9KWApO1xuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMud2hlbkNvbm5lY3RlZDtcblx0XHRjb25zdCByb3cgPSBhd2FpdCB0aGlzLmdldChjb25uZWN0aW9uLCBmdWxsID8gJ1BSQUdNQSBpbnRlZ3JpdHlfY2hlY2snIDogJ1BSQUdNQSBxdWlja19jaGVjaycpO1xuXG5cdFx0Y29uc3QgaW50ZWdyaXR5ID0gZnVsbCA/IChyb3cgYXMgeyBpbnRlZ3JpdHlfY2hlY2s6IHN0cmluZyB9KS5pbnRlZ3JpdHlfY2hlY2sgOiAocm93IGFzIHsgcXVpY2tfY2hlY2s6IHN0cmluZyB9KS5xdWlja19jaGVjaztcblxuXHRcdGlmIChjb25uZWN0aW9uLmlzRXJyb25lb3VzKSB7XG5cdFx0XHRyZXR1cm4gYCR7aW50ZWdyaXR5fSAobGFzdCBlcnJvcjogJHtjb25uZWN0aW9uLmxhc3RFcnJvcn0pYDtcblx0XHR9XG5cblx0XHRpZiAoY29ubmVjdGlvbi5pc0luTWVtb3J5KSB7XG5cdFx0XHRyZXR1cm4gYCR7aW50ZWdyaXR5fSAoaW4tbWVtb3J5ISlgO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbnRlZ3JpdHk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbm5lY3QocGF0aDogc3RyaW5nLCByZXRyeU9uQnVzeSA9IHRydWUpOiBQcm9taXNlPElEYXRhYmFzZUNvbm5lY3Rpb24+IHtcblx0XHR0aGlzLmxvZ2dlci50cmFjZShgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBvcGVuKCR7cGF0aH0sIHJldHJ5T25CdXN5OiAke3JldHJ5T25CdXN5fSlgKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5kb0Nvbm5lY3QocGF0aCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIG9wZW4oKTogVW5hYmxlIHRvIG9wZW4gREIgZHVlIHRvICR7ZXJyb3J9YCk7XG5cblx0XHRcdC8vIFNRTElURV9CVVNZIHNob3VsZCBvbmx5IGFyaXNlIGlmIGFub3RoZXIgcHJvY2VzcyBpcyBsb2NraW5nIHRoZSBzYW1lIERCIHdlIHdhbnRcblx0XHRcdC8vIHRvIG9wZW4gYXQgdGhhdCB0aW1lLiBUaGlzIHR5cGljYWxseSBuZXZlciBoYXBwZW5zIGJlY2F1c2UgYSBEQiBjb25uZWN0aW9uIGlzXG5cdFx0XHQvLyBsaW1pdGVkIHBlciB3aW5kb3cuIEhvd2V2ZXIsIGluIHRoZSBldmVudCBvZiBhIHdpbmRvdyByZWxvYWQsIGl0IG1heSBiZSBwb3NzaWJsZVxuXHRcdFx0Ly8gdGhhdCB0aGUgcHJldmlvdXMgY29ubmVjdGlvbiB3YXMgbm90IHByb3Blcmx5IGNsb3NlZCB3aGlsZSB0aGUgbmV3IGNvbm5lY3Rpb24gaXNcblx0XHRcdC8vIGFscmVhZHkgZXN0YWJsaXNoZWQuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gSW4gdGhpcyBjYXNlIHdlIHNpbXBseSB3YWl0IGZvciBzb21lIHRpbWUgYW5kIHJldHJ5IG9uY2UgdG8gZXN0YWJsaXNoIHRoZSBjb25uZWN0aW9uLlxuXHRcdFx0Ly9cblx0XHRcdGlmIChlcnJvci5jb2RlID09PSAnU1FMSVRFX0JVU1knICYmIHJldHJ5T25CdXN5KSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoU1FMaXRlU3RvcmFnZURhdGFiYXNlLkJVU1lfT1BFTl9USU1FT1VUKTtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5jb25uZWN0KHBhdGgsIGZhbHNlIC8qIG5vdCBhbm90aGVyIHJldHJ5ICovKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBiZXN0IHdlIGNhbiBkbyBpcyB0byByZWNvdmVyIGZyb20gYSBiYWNrdXAgaWYgdGhhdCBleGlzdHMsIGFzIHN1Y2ggd2Vcblx0XHRcdC8vIG1vdmUgdGhlIERCIHRvIGEgZGlmZmVyZW50IGZpbGVuYW1lIGFuZCB0cnkgdG8gbG9hZCBmcm9tIGJhY2t1cC4gSWYgdGhhdCBmYWlscyxcblx0XHRcdC8vIGEgbmV3IGVtcHR5IERCIGlzIGJlaW5nIGNyZWF0ZWQgYXV0b21hdGljYWxseS5cblx0XHRcdC8vXG5cdFx0XHQvLyBUaGUgZmluYWwgZmFsbGJhY2sgaXMgdG8gdXNlIGFuIGluLW1lbW9yeSBEQiB3aGljaCBzaG91bGQgb25seSBoYXBwZW4gaWYgdGhlIHRhcmdldFxuXHRcdFx0Ly8gZm9sZGVyIGlzIHJlYWxseSBub3Qgd3JpdGVhYmxlIGZvciB1cy5cblx0XHRcdC8vXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmcy5wcm9taXNlcy51bmxpbmsocGF0aCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZXMucmVuYW1lKHRoaXMudG9CYWNrdXBQYXRoKHBhdGgpLCBwYXRoLCBmYWxzZSAvKiBubyByZXRyeSAqLyk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZG9Db25uZWN0KHBhdGgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IoYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gb3BlbigpOiBVbmFibGUgdG8gdXNlIGJhY2t1cCBkdWUgdG8gJHtlcnJvcn1gKTtcblxuXHRcdFx0XHQvLyBJbiBjYXNlIG9mIGFueSBlcnJvciB0byBvcGVuIHRoZSBEQiwgdXNlIGFuIGluLW1lbW9yeVxuXHRcdFx0XHQvLyBEQiBzbyB0aGF0IHdlIGFsd2F5cyBoYXZlIGEgdmFsaWQgREIgdG8gdGFsayB0by5cblx0XHRcdFx0cmV0dXJuIHRoaXMuZG9Db25uZWN0KFNRTGl0ZVN0b3JhZ2VEYXRhYmFzZS5JTl9NRU1PUllfUEFUSCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVTUUxpdGVFcnJvcihjb25uZWN0aW9uOiBJRGF0YWJhc2VDb25uZWN0aW9uLCBtc2c6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbm5lY3Rpb24uaXNFcnJvbmVvdXMgPSB0cnVlO1xuXHRcdGNvbm5lY3Rpb24ubGFzdEVycm9yID0gbXNnO1xuXG5cdFx0dGhpcy5sb2dnZXIuZXJyb3IobXNnKTtcblx0fVxuXG5cdHByaXZhdGUgZG9Db25uZWN0KHBhdGg6IHN0cmluZyk6IFByb21pc2U8SURhdGFiYXNlQ29ubmVjdGlvbj4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRpbXBvcnQoJ0B2c2NvZGUvc3FsaXRlMycpLnRoZW4oc3FsaXRlMyA9PiB7XG5cdFx0XHRcdGNvbnN0IGN0b3IgPSAodGhpcy5sb2dnZXIuaXNUcmFjaW5nID8gc3FsaXRlMy5kZWZhdWx0LnZlcmJvc2UoKS5EYXRhYmFzZSA6IHNxbGl0ZTMuZGVmYXVsdC5EYXRhYmFzZSk7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb246IElEYXRhYmFzZUNvbm5lY3Rpb24gPSB7XG5cdFx0XHRcdFx0ZGI6IG5ldyBjdG9yKHBhdGgsIChlcnJvcjogKEVycm9yICYgeyBjb2RlPzogc3RyaW5nIH0pIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiAoY29ubmVjdGlvbi5kYiAmJiBlcnJvci5jb2RlICE9PSAnU1FMSVRFX0NBTlRPUEVOJyAvKiBodHRwczovL2dpdGh1Yi5jb20vVHJ5R2hvc3Qvbm9kZS1zcWxpdGUzL2lzc3Vlcy8xNjE3ICovKSA/IGNvbm5lY3Rpb24uZGIuY2xvc2UoKCkgPT4gcmVqZWN0KGVycm9yKSkgOiByZWplY3QoZXJyb3IpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBUaGUgZm9sbG93aW5nIGV4ZWMoKSBzdGF0ZW1lbnQgc2VydmVzIHR3byBwdXJwb3Nlczpcblx0XHRcdFx0XHRcdC8vIC0gY3JlYXRlIHRoZSBEQiBpZiBpdCBkb2VzIG5vdCBleGlzdCB5ZXRcblx0XHRcdFx0XHRcdC8vIC0gdmFsaWRhdGUgdGhhdCB0aGUgREIgaXMgbm90IGNvcnJ1cHQgKHRoZSBvcGVuKCkgY2FsbCBkb2VzIG5vdCB0aHJvdyBvdGhlcndpc2UpXG5cdFx0XHRcdFx0XHRjb25zdCBwcmFnbWFzOiBzdHJpbmdbXSA9IFtcblx0XHRcdFx0XHRcdFx0J1BSQUdNQSB1c2VyX3ZlcnNpb24gPSAxOycsXG5cdFx0XHRcdFx0XHRcdCdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBJdGVtVGFibGUgKGtleSBURVhUIFVOSVFVRSBPTiBDT05GTElDVCBSRVBMQUNFLCB2YWx1ZSBCTE9CKTsnXG5cdFx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMudXNlV0FMKSB7XG5cdFx0XHRcdFx0XHRcdHByYWdtYXMucHVzaCgnUFJBR01BIGpvdXJuYWxfbW9kZT1XQUw7Jyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5idXN5VGltZW91dCkge1xuXHRcdFx0XHRcdFx0XHRwcmFnbWFzLnB1c2goYFBSQUdNQSBidXN5X3RpbWVvdXQ9JHt0aGlzLmJ1c3lUaW1lb3V0fTtgKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmV4ZWMoY29ubmVjdGlvbiwgcHJhZ21hcy5qb2luKCcnKSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNvbm5lY3Rpb24pO1xuXHRcdFx0XHRcdFx0fSwgZXJyb3IgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gY29ubmVjdGlvbi5kYi5jbG9zZSgoKSA9PiByZWplY3QoZXJyb3IpKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdGlzSW5NZW1vcnk6IHBhdGggPT09IFNRTGl0ZVN0b3JhZ2VEYXRhYmFzZS5JTl9NRU1PUllfUEFUSFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdC8vIEVycm9yc1xuXHRcdFx0XHRjb25uZWN0aW9uLmRiLm9uKCdlcnJvcicsIGVycm9yID0+IHRoaXMuaGFuZGxlU1FMaXRlRXJyb3IoY29ubmVjdGlvbiwgYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gRXJyb3IgKGV2ZW50KTogJHtlcnJvcn1gKSk7XG5cblx0XHRcdFx0Ly8gVHJhY2luZ1xuXHRcdFx0XHRpZiAodGhpcy5sb2dnZXIuaXNUcmFjaW5nKSB7XG5cdFx0XHRcdFx0Y29ubmVjdGlvbi5kYi5vbigndHJhY2UnLCBzcWwgPT4gdGhpcy5sb2dnZXIudHJhY2UoYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gVHJhY2UgKGV2ZW50KTogJHtzcWx9YCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCByZWplY3QpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBleGVjKGNvbm5lY3Rpb246IElEYXRhYmFzZUNvbm5lY3Rpb24sIHNxbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbm5lY3Rpb24uZGIuZXhlYyhzcWwsIGVycm9yID0+IHtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVTUUxpdGVFcnJvcihjb25uZWN0aW9uLCBgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBleGVjKCk6ICR7ZXJyb3J9YCk7XG5cblx0XHRcdFx0XHRyZXR1cm4gcmVqZWN0KGVycm9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZXNvbHZlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0KGNvbm5lY3Rpb246IElEYXRhYmFzZUNvbm5lY3Rpb24sIHNxbDogc3RyaW5nKTogUHJvbWlzZTxvYmplY3Q+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29ubmVjdGlvbi5kYi5nZXQoc3FsLCAoZXJyb3IsIHJvdykgPT4ge1xuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZVNRTGl0ZUVycm9yKGNvbm5lY3Rpb24sIGBbc3RvcmFnZSAke3RoaXMubmFtZX1dIGdldCgpOiAke2Vycm9yfWApO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHJlamVjdChlcnJvcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShyb3cpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFsbChjb25uZWN0aW9uOiBJRGF0YWJhc2VDb25uZWN0aW9uLCBzcWw6IHN0cmluZyk6IFByb21pc2U8eyBrZXk6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29ubmVjdGlvbi5kYi5hbGwoc3FsLCAoZXJyb3IsIHJvd3MpID0+IHtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVTUUxpdGVFcnJvcihjb25uZWN0aW9uLCBgW3N0b3JhZ2UgJHt0aGlzLm5hbWV9XSBhbGwoKTogJHtlcnJvcn1gKTtcblxuXHRcdFx0XHRcdHJldHVybiByZWplY3QoZXJyb3IpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHJlc29sdmUocm93cyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdHJhbnNhY3Rpb24oY29ubmVjdGlvbjogSURhdGFiYXNlQ29ubmVjdGlvbiwgdHJhbnNhY3Rpb25zOiAoKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbm5lY3Rpb24uZGIuc2VyaWFsaXplKCgpID0+IHtcblx0XHRcdFx0Y29ubmVjdGlvbi5kYi5ydW4oJ0JFR0lOIFRSQU5TQUNUSU9OJyk7XG5cblx0XHRcdFx0dHJhbnNhY3Rpb25zKCk7XG5cblx0XHRcdFx0Y29ubmVjdGlvbi5kYi5ydW4oJ0VORCBUUkFOU0FDVElPTicsIGVycm9yID0+IHtcblx0XHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMuaGFuZGxlU1FMaXRlRXJyb3IoY29ubmVjdGlvbiwgYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gdHJhbnNhY3Rpb24oKTogJHtlcnJvcn1gKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIHJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcHJlcGFyZShjb25uZWN0aW9uOiBJRGF0YWJhc2VDb25uZWN0aW9uLCBzcWw6IHN0cmluZywgcnVuQ2FsbGJhY2s6IChzdG10OiBTdGF0ZW1lbnQpID0+IHZvaWQsIGVycm9yRGV0YWlsczogKCkgPT4gc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RtdCA9IGNvbm5lY3Rpb24uZGIucHJlcGFyZShzcWwpO1xuXG5cdFx0Y29uc3Qgc3RhdGVtZW50RXJyb3JMaXN0ZW5lciA9IChlcnJvcjogRXJyb3IpID0+IHtcblx0XHRcdHRoaXMuaGFuZGxlU1FMaXRlRXJyb3IoY29ubmVjdGlvbiwgYFtzdG9yYWdlICR7dGhpcy5uYW1lfV0gcHJlcGFyZSgpOiAke2Vycm9yfSAoJHtzcWx9KS4gRGV0YWlsczogJHtlcnJvckRldGFpbHMoKX1gKTtcblx0XHR9O1xuXG5cdFx0c3RtdC5vbignZXJyb3InLCBzdGF0ZW1lbnRFcnJvckxpc3RlbmVyKTtcblxuXHRcdHJ1bkNhbGxiYWNrKHN0bXQpO1xuXG5cdFx0c3RtdC5maW5hbGl6ZShlcnJvciA9PiB7XG5cdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0c3RhdGVtZW50RXJyb3JMaXN0ZW5lcihlcnJvcik7XG5cdFx0XHR9XG5cblx0XHRcdHN0bXQucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgc3RhdGVtZW50RXJyb3JMaXN0ZW5lcik7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgU1FMaXRlU3RvcmFnZURhdGFiYXNlTG9nZ2VyIHtcblxuXHQvLyB0byByZWR1Y2UgbG90cyBvZiBvdXRwdXQsIHJlcXVpcmUgYW4gZW52aXJvbm1lbnQgdmFyaWFibGUgdG8gZW5hYmxlIHRyYWNpbmdcblx0Ly8gdGhpcyBoZWxwcyB3aGVuIHJ1bm5pbmcgd2l0aCAtLXZlcmJvc2Ugbm9ybWFsbHkgd2hlcmUgdGhlIHN0b3JhZ2UgdHJhY2luZ1xuXHQvLyBtaWdodCBoaWRlIHVzZWZ1bCBvdXRwdXQgdG8gbG9vayBhdFxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBWU0NPREVfVFJBQ0VfU1RPUkFHRSA9ICdWU0NPREVfVFJBQ0VfU1RPUkFHRSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2dUcmFjZTogKChtc2c6IHN0cmluZykgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbG9nRXJyb3I6ICgoZXJyb3I6IHN0cmluZyB8IEVycm9yKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zPzogSVNRTGl0ZVN0b3JhZ2VEYXRhYmFzZUxvZ2dpbmdPcHRpb25zKSB7XG5cdFx0aWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubG9nVHJhY2UgPT09ICdmdW5jdGlvbicgJiYgcHJvY2Vzcy5lbnZbU1FMaXRlU3RvcmFnZURhdGFiYXNlTG9nZ2VyLlZTQ09ERV9UUkFDRV9TVE9SQUdFXSkge1xuXHRcdFx0dGhpcy5sb2dUcmFjZSA9IG9wdGlvbnMubG9nVHJhY2U7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubG9nRXJyb3IgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRoaXMubG9nRXJyb3IgPSBvcHRpb25zLmxvZ0Vycm9yO1xuXHRcdH1cblx0fVxuXG5cdGdldCBpc1RyYWNpbmcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5sb2dUcmFjZTtcblx0fVxuXG5cdHRyYWNlKG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dUcmFjZT8uKG1zZyk7XG5cdH1cblxuXHRlcnJvcihlcnJvcjogc3RyaW5nIHwgRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ0Vycm9yPy4oZXJyb3IpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBNkJsQixNQUFNLHlCQUFOLE1BQU0sdUJBQWtEO0FBQUEsRUFpQjlELFlBQ2tCLE1BQ2pCLFVBQXlDLHVCQUFPLE9BQU8sSUFBSSxHQUMxRDtBQUZnQjtBQUdqQixTQUFLLE9BQU8sU0FBUyxLQUFLLElBQUk7QUFDOUIsU0FBSyxTQUFTLElBQUksNEJBQTRCLFFBQVEsT0FBTztBQUM3RCxTQUFLLFNBQVMsQ0FBQyxDQUFDLFFBQVE7QUFDeEIsU0FBSyxjQUFjLFFBQVE7QUFDM0IsU0FBSyxnQkFBZ0IsS0FBSyxRQUFRLEtBQUssSUFBSTtBQUFBLEVBQzVDO0FBQUEsRUF0QkEsSUFBSSwyQkFBNEQ7QUFBRSxXQUFPLE1BQU07QUFBQSxFQUFNO0FBQUEsRUF3QnJGLE1BQU0sV0FBeUM7QUFDOUMsVUFBTSxhQUFhLE1BQU0sS0FBSztBQUU5QixVQUFNLFFBQVEsb0JBQUksSUFBb0I7QUFFdEMsVUFBTSxPQUFPLE1BQU0sS0FBSyxJQUFJLFlBQVkseUJBQXlCO0FBQ2pFLFNBQUssUUFBUSxTQUFPLE1BQU0sSUFBSSxJQUFJLEtBQUssSUFBSSxLQUFLLENBQUM7QUFFakQsUUFBSSxLQUFLLE9BQU8sV0FBVztBQUMxQixXQUFLLE9B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
