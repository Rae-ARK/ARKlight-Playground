var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as cp from "child_process";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import { rgDiskPath } from "../../../base/node/ripgrep.js";
const MAX_FILES = 5e4;
const CACHE_TTL_MS = 3e4;
let AgentHostWorkspaceFiles = class extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._cache = /* @__PURE__ */ new Map();
    /** Active ripgrep child processes, killed on dispose. */
    this._activeChildren = /* @__PURE__ */ new Set();
  }
  dispose() {
    for (const child of this._activeChildren) {
      try {
        child.kill();
      } catch {
      }
    }
    this._activeChildren.clear();
    this._cache.clear();
    super.dispose();
  }
  /**
   * Return the list of files under `workingDirectory`. Concurrent calls
   * with the same working directory share an in-flight enumeration.
   *
   * Only `file://` URIs are supported. Other schemes return an empty list.
   */
  async getFiles(workingDirectory, token) {
    if (workingDirectory.scheme !== Schemas.file) {
      return [];
    }
    const key = workingDirectory.toString();
    const now = Date.now();
    const existing = this._cache.get(key);
    let shared;
    if (existing && existing.expiresAt > now) {
      shared = existing.promise;
    } else {
      shared = this._enumerate(workingDirectory);
      const entry = { promise: shared, expiresAt: now + CACHE_TTL_MS };
      this._cache.set(key, entry);
      shared.catch(() => {
        if (this._cache.get(key) === entry) {
          this._cache.delete(key);
        }
      });
    }
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    if (token === CancellationToken.None) {
      return shared;
    }
    return new Promise((resolve, reject) => {
      const cancelListener = token.onCancellationRequested(() => {
        cancelListener.dispose();
        reject(new CancellationError());
      });
      shared.then((value) => {
        cancelListener.dispose();
        resolve(value);
      }, (err) => {
        cancelListener.dispose();
        reject(err);
      });
    });
  }
  async _enumerate(workingDirectory) {
    const resolvedRgDiskPath = await rgDiskPath();
    return new Promise((resolve) => {
      const cwd = workingDirectory.fsPath;
      const args = ["--files", "--hidden", "--no-require-git", "--follow", "--no-config", "--glob", "!.git"];
      let child;
      try {
        child = cp.spawn(resolvedRgDiskPath, args, { cwd });
      } catch (err) {
        this._logService.warn(`[AgentHostWorkspaceFiles] Failed to spawn ripgrep: ${err}`);
        resolve([]);
        return;
      }
      this._activeChildren.add(child);
      const results = [];
      let buffer = "";
      let limitHit = false;
      let settled = false;
      const finish = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        this._activeChildren.delete(child);
        resolve(value);
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (limitHit) {
          return;
        }
        buffer += chunk;
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) {
            continue;
          }
          results.push(URI.joinPath(workingDirectory, line));
          if (results.length >= MAX_FILES) {
            limitHit = true;
            try {
              child.kill();
            } catch {
            }
            break;
          }
        }
      });
      child.stderr.setEncoding("utf8");
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (err) => {
        this._logService.warn(`[AgentHostWorkspaceFiles] ripgrep error: ${err}`);
        finish([]);
      });
      child.on("close", () => {
        if (!limitHit && buffer.length > 0) {
          const line = buffer.replace(/\r$/, "");
          if (line) {
            results.push(URI.joinPath(workingDirectory, line));
          }
          buffer = "";
        }
        if (stderr) {
          this._logService.trace(`[AgentHostWorkspaceFiles] ripgrep stderr: ${stderr}`);
        }
        finish(results);
      });
    });
  }
};
AgentHostWorkspaceFiles = __decorateClass([
  __decorateParam(0, ILogService)
], AgentHostWorkspaceFiles);
export {
  AgentHostWorkspaceFiles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdFdvcmtzcGFjZUZpbGVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHJnRGlza1BhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcmlwZ3JlcC5qcyc7XG5cbi8qKiBNYXhpbXVtIG51bWJlciBvZiBmaWxlcyBjYWNoZWQgcGVyIHdvcmtpbmcgZGlyZWN0b3J5LiAqL1xuY29uc3QgTUFYX0ZJTEVTID0gNTBfMDAwO1xuXG4vKiogVFRMIGZvciBhIGNhY2hlZCBmaWxlIGxpc3QgYmVmb3JlIHdlIHJlLWVudW1lcmF0ZS4gKi9cbmNvbnN0IENBQ0hFX1RUTF9NUyA9IDMwXzAwMDtcblxuaW50ZXJmYWNlIElDYWNoZUVudHJ5IHtcblx0cmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTxyZWFkb25seSBVUklbXT47XG5cdGV4cGlyZXNBdDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEVudW1lcmF0ZXMgZmlsZXMgdW5kZXIgYSB3b3JraW5nIGRpcmVjdG9yeSB1c2luZyByaXBncmVwLCB3aXRoIHJlc3VsdHNcbiAqIGNhY2hlZCBwZXIgd29ya2luZyBkaXJlY3RvcnkgZm9yIGEgc2hvcnQgVFRMLlxuICpcbiAqIE1pcnJvcnMgdGhlIHdvcmtiZW5jaCdzIGZpbGUtc2VhcmNoIGludm9jYXRpb24gcGF0dGVybiAoc2VlXG4gKiBgcmlwZ3JlcEZpbGVTZWFyY2gudHNgIGluIGB2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL25vZGUvYCkgYnV0IGRvZXNcbiAqIG5vdCBkZXBlbmQgb24gdGhlIHdvcmtiZW5jaCBsYXllciBcdTIwMTQgdGhlIGFnZW50IGhvc3QgcnVucyBpbiBhIHNlcGFyYXRlXG4gKiBub2RlIHByb2Nlc3MgdGhhdCBtYXkgbm90IGltcG9ydCBmcm9tIGB2cy93b3JrYmVuY2gvYC5cbiAqXG4gKiBGaWxlcyBhcmUgcmV0dXJuZWQgYXMgYWJzb2x1dGUge0BsaW5rIFVSSX1zIHJlbGF0aXZlIHRvIHRoZSB3b3JraW5nXG4gKiBkaXJlY3RvcnkuIGAuZ2l0aWdub3JlYCBhbmQgb3RoZXIgYC5pZ25vcmVgIGZpbGVzIGFyZSBob25vdXJlZCBieVxuICogcmlwZ3JlcC4gU3ltbGlua3MgYXJlIGZvbGxvd2VkLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBJQ2FjaGVFbnRyeT4oKTtcblx0LyoqIEFjdGl2ZSByaXBncmVwIGNoaWxkIHByb2Nlc3Nlcywga2lsbGVkIG9uIGRpc3Bvc2UuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNoaWxkcmVuID0gbmV3IFNldDxjcC5DaGlsZFByb2Nlc3NXaXRob3V0TnVsbFN0cmVhbXM+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuX2FjdGl2ZUNoaWxkcmVuKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjaGlsZC5raWxsKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZUNoaWxkcmVuLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2FjaGUuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBsaXN0IG9mIGZpbGVzIHVuZGVyIGB3b3JraW5nRGlyZWN0b3J5YC4gQ29uY3VycmVudCBjYWxsc1xuXHQgKiB3aXRoIHRoZSBzYW1lIHdvcmtpbmcgZGlyZWN0b3J5IHNoYXJlIGFuIGluLWZsaWdodCBlbnVtZXJhdGlvbi5cblx0ICpcblx0ICogT25seSBgZmlsZTovL2AgVVJJcyBhcmUgc3VwcG9ydGVkLiBPdGhlciBzY2hlbWVzIHJldHVybiBhbiBlbXB0eSBsaXN0LlxuXHQgKi9cblx0YXN5bmMgZ2V0RmlsZXMod29ya2luZ0RpcmVjdG9yeTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcnkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSB3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NhY2hlLmdldChrZXkpO1xuXHRcdGxldCBzaGFyZWQ6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+O1xuXHRcdGlmIChleGlzdGluZyAmJiBleGlzdGluZy5leHBpcmVzQXQgPiBub3cpIHtcblx0XHRcdHNoYXJlZCA9IGV4aXN0aW5nLnByb21pc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNoYXJlZCA9IHRoaXMuX2VudW1lcmF0ZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGNvbnN0IGVudHJ5OiBJQ2FjaGVFbnRyeSA9IHsgcHJvbWlzZTogc2hhcmVkLCBleHBpcmVzQXQ6IG5vdyArIENBQ0hFX1RUTF9NUyB9O1xuXHRcdFx0dGhpcy5fY2FjaGUuc2V0KGtleSwgZW50cnkpO1xuXHRcdFx0Ly8gSWYgZW51bWVyYXRpb24gZmFpbHMsIGRyb3AgdGhlIGNhY2hlIGVudHJ5IHNvIHRoZSBuZXh0IGNhbGxlciByZXRyaWVzLlxuXHRcdFx0c2hhcmVkLmNhdGNoKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2NhY2hlLmdldChrZXkpID09PSBlbnRyeSkge1xuXHRcdFx0XHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBSYWNlIHRoZSBzaGFyZWQgZW51bWVyYXRpb24gYWdhaW5zdCB0aGUgY2FsbGVyJ3MgY2FuY2VsbGF0aW9uXG5cdFx0Ly8gdG9rZW4uIE9ubHkgdGhlIGNhbGxlcidzIHByb21pc2UgcmVqZWN0cyBvbiBjYW5jZWxsYXRpb247IHRoZVxuXHRcdC8vIHNoYXJlZCBlbnVtZXJhdGlvbiBydW5zIHRvIGNvbXBsZXRpb24gc28gY29uY3VycmVudCBjYWxsZXJzIChhbmRcblx0XHQvLyBmdXR1cmUgY2FjaGUgaGl0cyB3aXRoaW4gdGhlIFRUTCkgc3RpbGwgc2VlIHRoZSByZXN1bHQuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKHRva2VuID09PSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSB7XG5cdFx0XHRyZXR1cm4gc2hhcmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8cmVhZG9ubHkgVVJJW10+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IGNhbmNlbExpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRjYW5jZWxMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHR9KTtcblx0XHRcdHNoYXJlZC50aGVuKHZhbHVlID0+IHtcblx0XHRcdFx0Y2FuY2VsTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHZhbHVlKTtcblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdGNhbmNlbExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2VudW1lcmF0ZSh3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRSZ0Rpc2tQYXRoID0gYXdhaXQgcmdEaXNrUGF0aCgpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxyZWFkb25seSBVUklbXT4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBjd2QgPSB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aDtcblx0XHRcdC8vIE1pcnJvciB0aGUgd29ya2JlbmNoJ3MgYHJpcGdyZXBGaWxlU2VhcmNoLnRzYCBpbnZvY2F0aW9uOiBwYXNzXG5cdFx0XHQvLyBgLS1uby1jb25maWdgIHNvIGEgdXNlcidzIGdsb2JhbCBgfi8ucmlwZ3JlcHJjYCBjYW5ub3QgY2hhbmdlXG5cdFx0XHQvLyBlbnVtZXJhdGlvbiByZXN1bHRzIChvciBlbmFibGUgcHJlcHJvY2Vzc29ycyBldGMuKS5cblx0XHRcdGNvbnN0IGFyZ3MgPSBbJy0tZmlsZXMnLCAnLS1oaWRkZW4nLCAnLS1uby1yZXF1aXJlLWdpdCcsICctLWZvbGxvdycsICctLW5vLWNvbmZpZycsICctLWdsb2InLCAnIS5naXQnXTtcblxuXHRcdFx0bGV0IGNoaWxkOiBjcC5DaGlsZFByb2Nlc3NXaXRob3V0TnVsbFN0cmVhbXM7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjaGlsZCA9IGNwLnNwYXduKHJlc29sdmVkUmdEaXNrUGF0aCwgYXJncywgeyBjd2QgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0V29ya3NwYWNlRmlsZXNdIEZhaWxlZCB0byBzcGF3biByaXBncmVwOiAke2Vycn1gKTtcblx0XHRcdFx0cmVzb2x2ZShbXSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FjdGl2ZUNoaWxkcmVuLmFkZChjaGlsZCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdHM6IFVSSVtdID0gW107XG5cdFx0XHRsZXQgYnVmZmVyID0gJyc7XG5cdFx0XHRsZXQgbGltaXRIaXQgPSBmYWxzZTtcblx0XHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IGZpbmlzaCA9ICh2YWx1ZTogcmVhZG9ubHkgVVJJW10pID0+IHtcblx0XHRcdFx0aWYgKHNldHRsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0c2V0dGxlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUNoaWxkcmVuLmRlbGV0ZShjaGlsZCk7XG5cdFx0XHRcdHJlc29sdmUodmFsdWUpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y2hpbGQuc3Rkb3V0LnNldEVuY29kaW5nKCd1dGY4Jyk7XG5cdFx0XHRjaGlsZC5zdGRvdXQub24oJ2RhdGEnLCAoY2h1bms6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAobGltaXRIaXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0YnVmZmVyICs9IGNodW5rO1xuXHRcdFx0XHRsZXQgbmV3bGluZUluZGV4OiBudW1iZXI7XG5cdFx0XHRcdHdoaWxlICgobmV3bGluZUluZGV4ID0gYnVmZmVyLmluZGV4T2YoJ1xcbicpKSA+PSAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZSA9IGJ1ZmZlci5zbGljZSgwLCBuZXdsaW5lSW5kZXgpLnJlcGxhY2UoL1xcciQvLCAnJyk7XG5cdFx0XHRcdFx0YnVmZmVyID0gYnVmZmVyLnNsaWNlKG5ld2xpbmVJbmRleCArIDEpO1xuXHRcdFx0XHRcdGlmICghbGluZSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc3VsdHMucHVzaChVUkkuam9pblBhdGgod29ya2luZ0RpcmVjdG9yeSwgbGluZSkpO1xuXHRcdFx0XHRcdGlmIChyZXN1bHRzLmxlbmd0aCA+PSBNQVhfRklMRVMpIHtcblx0XHRcdFx0XHRcdGxpbWl0SGl0ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNoaWxkLmtpbGwoKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNoaWxkLnN0ZGVyci5zZXRFbmNvZGluZygndXRmOCcpO1xuXHRcdFx0bGV0IHN0ZGVyciA9ICcnO1xuXHRcdFx0Y2hpbGQuc3RkZXJyLm9uKCdkYXRhJywgKGNodW5rOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0c3RkZXJyICs9IGNodW5rO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNoaWxkLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFdvcmtzcGFjZUZpbGVzXSByaXBncmVwIGVycm9yOiAke2Vycn1gKTtcblx0XHRcdFx0ZmluaXNoKFtdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjaGlsZC5vbignY2xvc2UnLCAoKSA9PiB7XG5cdFx0XHRcdC8vIEZsdXNoIGFueSB0cmFpbGluZyBsaW5lIHN0aWxsIGluIHRoZSBidWZmZXIuXG5cdFx0XHRcdGlmICghbGltaXRIaXQgJiYgYnVmZmVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lID0gYnVmZmVyLnJlcGxhY2UoL1xcciQvLCAnJyk7XG5cdFx0XHRcdFx0aWYgKGxpbmUpIHtcblx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaChVUkkuam9pblBhdGgod29ya2luZ0RpcmVjdG9yeSwgbGluZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRidWZmZXIgPSAnJztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RkZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdFdvcmtzcGFjZUZpbGVzXSByaXBncmVwIHN0ZGVycjogJHtzdGRlcnJ9YCk7XG5cdFx0XHRcdH1cblx0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
