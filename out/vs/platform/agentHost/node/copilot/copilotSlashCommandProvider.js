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
import { ILogService } from "../../../log/common/log.js";
import { raceTimeout } from "../../../../base/common/async.js";
let CopilotSlashCommandProvider = class {
  constructor(listCommands, _logService) {
    this.listCommands = listCommands;
    this._logService = _logService;
  }
  async getSlashCommands(options) {
    try {
      const maxWaitMs = options?.maxWaitMs;
      const catalog = await this._getRuntimeSlashCommandCatalog(maxWaitMs === void 0 ? void 0 : Math.max(0, maxWaitMs));
      return catalog.commands;
    } catch (err) {
      this._logService.warn(`[Copilot] rpc.commands.list failed`, err);
      return [];
    }
  }
  async resolveSlashCommand(command, maxWaitMs = void 0) {
    const key = this._normalizeSlashCommandKey(command);
    if (!key) {
      return void 0;
    }
    const catalog = await this._getRuntimeSlashCommandCatalog(maxWaitMs);
    return catalog.byName.get(key) ?? catalog.byAlias.get(key);
  }
  clearCache() {
    if (this._runtimeSlashCommandCache) {
      this._runtimeSlashCommandCache = void 0;
    }
  }
  async _getRuntimeSlashCommandCatalog(maxWaitMs = void 0) {
    const cache = this._runtimeSlashCommandCache ??= {};
    if (cache.value) {
      return cache.value;
    }
    const inFlight = this._refreshRuntimeSlashCommandCatalog(cache);
    if (maxWaitMs === void 0) {
      return inFlight;
    }
    const settled = await raceTimeout(inFlight, maxWaitMs);
    if (settled) {
      return settled;
    }
    if (cache.value) {
      return cache.value;
    }
    return {
      commands: [],
      byName: /* @__PURE__ */ new Map(),
      byAlias: /* @__PURE__ */ new Map()
    };
  }
  async _refreshRuntimeSlashCommandCatalog(cache) {
    if (cache.inFlight) {
      return cache.inFlight;
    }
    const inFlight = this.listCommands().then((result) => this._toRuntimeSlashCommandCatalog(result));
    cache.inFlight = inFlight;
    inFlight.then((catalog) => {
      if (this._runtimeSlashCommandCache === cache) {
        cache.value = catalog;
        cache.inFlight = void 0;
      }
    }, () => {
      if (this._runtimeSlashCommandCache === cache) {
        cache.inFlight = void 0;
        if (!cache.value) {
          this._runtimeSlashCommandCache = void 0;
        }
      }
    });
    return inFlight;
  }
  _toRuntimeSlashCommandCatalog(commands) {
    const byName = /* @__PURE__ */ new Map();
    const byAlias = /* @__PURE__ */ new Map();
    const deduped = [];
    for (const command of commands) {
      const nameKey = this._normalizeSlashCommandKey(command.name);
      if (!nameKey) {
        continue;
      }
      let canonical = byName.get(nameKey);
      if (!canonical) {
        canonical = command;
        byName.set(nameKey, canonical);
        deduped.push(canonical);
      }
      for (const alias of command.aliases ?? []) {
        const aliasKey = this._normalizeSlashCommandKey(alias);
        if (!aliasKey || byAlias.has(aliasKey)) {
          continue;
        }
        byAlias.set(aliasKey, canonical);
      }
    }
    return { commands: deduped, byName, byAlias };
  }
  _normalizeSlashCommandKey(command) {
    const trimmed = command.trim();
    if (!trimmed) {
      return void 0;
    }
    const slashStripped = trimmed.charCodeAt(0) === 47 ? trimmed.slice(1) : trimmed;
    return slashStripped.toLowerCase();
  }
};
CopilotSlashCommandProvider = __decorateClass([
  __decorateParam(1, ILogService)
], CopilotSlashCommandProvider);
export {
  CopilotSlashCommandProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvY29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBDb3BpbG90Q2xpZW50IH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG50eXBlIFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nID0ge1xuXHRyZWFkb25seSBjb21tYW5kczogcmVhZG9ubHkgUnVudGltZVNsYXNoQ29tbWFuZEluZm9bXTtcblx0cmVhZG9ubHkgYnlOYW1lOiBSZWFkb25seU1hcDxzdHJpbmcsIFJ1bnRpbWVTbGFzaENvbW1hbmRJbmZvPjtcblx0cmVhZG9ubHkgYnlBbGlhczogUmVhZG9ubHlNYXA8c3RyaW5nLCBSdW50aW1lU2xhc2hDb21tYW5kSW5mbz47XG59O1xuXG50eXBlIFJ1bnRpbWVTbGFzaENvbW1hbmRDYWNoZSA9IHtcblx0dmFsdWU/OiBSdW50aW1lU2xhc2hDb21tYW5kQ2F0YWxvZztcblx0aW5GbGlnaHQ/OiBQcm9taXNlPFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nPjtcbn07XG5cbnR5cGUgUnVudGltZVNsYXNoQ29tbWFuZEluZm8gPSBBd2FpdGVkPFJldHVyblR5cGU8Q29waWxvdENsaWVudFsncnBjJ11bJ2NvbW1hbmRzJ11bJ2xpc3QnXT4+Wydjb21tYW5kcyddW251bWJlcl07XG5cbmV4cG9ydCBjbGFzcyBDb3BpbG90U2xhc2hDb21tYW5kUHJvdmlkZXIge1xuXHRwcml2YXRlIF9ydW50aW1lU2xhc2hDb21tYW5kQ2FjaGU6IFJ1bnRpbWVTbGFzaENvbW1hbmRDYWNoZSB8IHVuZGVmaW5lZDtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsaXN0Q29tbWFuZHM6ICgpID0+IFByb21pc2U8UnVudGltZVNsYXNoQ29tbWFuZEluZm9bXT4sXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGdldFNsYXNoQ29tbWFuZHMob3B0aW9ucz86IHsgcmVhZG9ubHkgbWF4V2FpdE1zPzogbnVtYmVyIH0pOiBQcm9taXNlPHJlYWRvbmx5IFJ1bnRpbWVTbGFzaENvbW1hbmRJbmZvW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbWF4V2FpdE1zID0gb3B0aW9ucz8ubWF4V2FpdE1zO1xuXHRcdFx0Y29uc3QgY2F0YWxvZyA9IGF3YWl0IHRoaXMuX2dldFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nKG1heFdhaXRNcyA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogTWF0aC5tYXgoMCwgbWF4V2FpdE1zKSk7XG5cdFx0XHRyZXR1cm4gY2F0YWxvZy5jb21tYW5kcztcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIHJwYy5jb21tYW5kcy5saXN0IGZhaWxlZGAsIGVycik7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc29sdmVTbGFzaENvbW1hbmQoY29tbWFuZDogc3RyaW5nLCBtYXhXYWl0TXM6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IFByb21pc2U8UnVudGltZVNsYXNoQ29tbWFuZEluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9ub3JtYWxpemVTbGFzaENvbW1hbmRLZXkoY29tbWFuZCk7XG5cdFx0aWYgKCFrZXkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNhdGFsb2cgPSBhd2FpdCB0aGlzLl9nZXRSdW50aW1lU2xhc2hDb21tYW5kQ2F0YWxvZyhtYXhXYWl0TXMpO1xuXHRcdHJldHVybiBjYXRhbG9nLmJ5TmFtZS5nZXQoa2V5KSA/PyBjYXRhbG9nLmJ5QWxpYXMuZ2V0KGtleSk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJDYWNoZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcnVudGltZVNsYXNoQ29tbWFuZENhY2hlKSB7XG5cdFx0XHQvLyBLZWVwIGluLWZsaWdodCBwcm9taXNlcyBpc29sYXRlZCBmcm9tIGZyZXNoIGxvb2t1cHMgYWZ0ZXIgaW52YWxpZGF0aW9uLlxuXHRcdFx0dGhpcy5fcnVudGltZVNsYXNoQ29tbWFuZENhY2hlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nKG1heFdhaXRNczogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogUHJvbWlzZTxSdW50aW1lU2xhc2hDb21tYW5kQ2F0YWxvZz4ge1xuXHRcdGNvbnN0IGNhY2hlID0gdGhpcy5fcnVudGltZVNsYXNoQ29tbWFuZENhY2hlID8/PSB7fTtcblx0XHRpZiAoY2FjaGUudmFsdWUpIHtcblx0XHRcdHJldHVybiBjYWNoZS52YWx1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBpbkZsaWdodCA9IHRoaXMuX3JlZnJlc2hSdW50aW1lU2xhc2hDb21tYW5kQ2F0YWxvZyhjYWNoZSk7XG5cdFx0aWYgKG1heFdhaXRNcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gaW5GbGlnaHQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNldHRsZWQgPSBhd2FpdCByYWNlVGltZW91dChpbkZsaWdodCwgbWF4V2FpdE1zKTtcblx0XHRpZiAoc2V0dGxlZCkge1xuXHRcdFx0cmV0dXJuIHNldHRsZWQ7XG5cdFx0fVxuXHRcdGlmIChjYWNoZS52YWx1ZSkge1xuXHRcdFx0cmV0dXJuIGNhY2hlLnZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tbWFuZHM6IFtdLFxuXHRcdFx0YnlOYW1lOiBuZXcgTWFwKCksXG5cdFx0XHRieUFsaWFzOiBuZXcgTWFwKCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hSdW50aW1lU2xhc2hDb21tYW5kQ2F0YWxvZyhjYWNoZTogUnVudGltZVNsYXNoQ29tbWFuZENhY2hlKTogUHJvbWlzZTxSdW50aW1lU2xhc2hDb21tYW5kQ2F0YWxvZz4ge1xuXHRcdGlmIChjYWNoZS5pbkZsaWdodCkge1xuXHRcdFx0cmV0dXJuIGNhY2hlLmluRmxpZ2h0O1xuXHRcdH1cblx0XHRjb25zdCBpbkZsaWdodCA9IHRoaXMubGlzdENvbW1hbmRzKClcblx0XHRcdC50aGVuKHJlc3VsdCA9PiB0aGlzLl90b1J1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nKHJlc3VsdCkpO1xuXHRcdGNhY2hlLmluRmxpZ2h0ID0gaW5GbGlnaHQ7XG5cdFx0aW5GbGlnaHQudGhlbihjYXRhbG9nID0+IHtcblx0XHRcdGlmICh0aGlzLl9ydW50aW1lU2xhc2hDb21tYW5kQ2FjaGUgPT09IGNhY2hlKSB7XG5cdFx0XHRcdGNhY2hlLnZhbHVlID0gY2F0YWxvZztcblx0XHRcdFx0Y2FjaGUuaW5GbGlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3J1bnRpbWVTbGFzaENvbW1hbmRDYWNoZSA9PT0gY2FjaGUpIHtcblx0XHRcdFx0Y2FjaGUuaW5GbGlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghY2FjaGUudmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLl9ydW50aW1lU2xhc2hDb21tYW5kQ2FjaGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gaW5GbGlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF90b1J1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nKGNvbW1hbmRzOiByZWFkb25seSBSdW50aW1lU2xhc2hDb21tYW5kSW5mb1tdKTogUnVudGltZVNsYXNoQ29tbWFuZENhdGFsb2cge1xuXHRcdGNvbnN0IGJ5TmFtZSA9IG5ldyBNYXA8c3RyaW5nLCBSdW50aW1lU2xhc2hDb21tYW5kSW5mbz4oKTtcblx0XHRjb25zdCBieUFsaWFzID0gbmV3IE1hcDxzdHJpbmcsIFJ1bnRpbWVTbGFzaENvbW1hbmRJbmZvPigpO1xuXHRcdGNvbnN0IGRlZHVwZWQ6IFJ1bnRpbWVTbGFzaENvbW1hbmRJbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY29tbWFuZHMpIHtcblx0XHRcdGNvbnN0IG5hbWVLZXkgPSB0aGlzLl9ub3JtYWxpemVTbGFzaENvbW1hbmRLZXkoY29tbWFuZC5uYW1lKTtcblx0XHRcdGlmICghbmFtZUtleSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCBjYW5vbmljYWwgPSBieU5hbWUuZ2V0KG5hbWVLZXkpO1xuXHRcdFx0aWYgKCFjYW5vbmljYWwpIHtcblx0XHRcdFx0Y2Fub25pY2FsID0gY29tbWFuZDtcblx0XHRcdFx0YnlOYW1lLnNldChuYW1lS2V5LCBjYW5vbmljYWwpO1xuXHRcdFx0XHRkZWR1cGVkLnB1c2goY2Fub25pY2FsKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYWxpYXMgb2YgY29tbWFuZC5hbGlhc2VzID8/IFtdKSB7XG5cdFx0XHRcdGNvbnN0IGFsaWFzS2V5ID0gdGhpcy5fbm9ybWFsaXplU2xhc2hDb21tYW5kS2V5KGFsaWFzKTtcblx0XHRcdFx0aWYgKCFhbGlhc0tleSB8fCBieUFsaWFzLmhhcyhhbGlhc0tleSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRieUFsaWFzLnNldChhbGlhc0tleSwgY2Fub25pY2FsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgY29tbWFuZHM6IGRlZHVwZWQsIGJ5TmFtZSwgYnlBbGlhcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfbm9ybWFsaXplU2xhc2hDb21tYW5kS2V5KGNvbW1hbmQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IGNvbW1hbmQudHJpbSgpO1xuXHRcdGlmICghdHJpbW1lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2xhc2hTdHJpcHBlZCA9IHRyaW1tZWQuY2hhckNvZGVBdCgwKSA9PT0gMHgyZiAvKiAvICovID8gdHJpbW1lZC5zbGljZSgxKSA6IHRyaW1tZWQ7XG5cdFx0cmV0dXJuIHNsYXNoU3RyaXBwZWQudG9Mb3dlckNhc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1CQUFtQjtBQWVyQixJQUFNLDhCQUFOLE1BQWtDO0FBQUEsRUFFeEMsWUFDa0IsY0FDYSxhQUM3QjtBQUZnQjtBQUNhO0FB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
