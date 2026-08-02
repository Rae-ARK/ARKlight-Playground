import * as path from "../../../../base/common/path.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import * as strings from "../../../../base/common/strings.js";
import * as glob from "../../../../base/common/glob.js";
import * as resources from "../../../../base/common/resources.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { QueryGlobTester, resolvePatternsForProvider, hasSiblingFn, excludeToGlobPattern, DEFAULT_MAX_SEARCH_RESULTS } from "./search.js";
import { OldFileSearchProviderConverter } from "./searchExtConversionTypes.js";
import { FolderQuerySearchTree } from "./folderQuerySearchTree.js";
class FileSearchEngine {
  constructor(config, provider, sessionLifecycle) {
    this.config = config;
    this.provider = provider;
    this.sessionLifecycle = sessionLifecycle;
    this.isLimitHit = false;
    this.resultCount = 0;
    this.isCanceled = false;
    this.filePattern = config.filePattern;
    const globOptions = config.ignoreGlobCase ? { ignoreCase: true } : void 0;
    this.includePattern = config.includePattern && glob.parse(config.includePattern, globOptions);
    this.maxResults = config.maxResults || void 0;
    this.exists = config.exists;
    this.activeCancellationTokens = /* @__PURE__ */ new Set();
    this.globalExcludePattern = config.excludePattern && glob.parse(config.excludePattern, globOptions);
  }
  cancel() {
    this.isCanceled = true;
    this.activeCancellationTokens.forEach((t) => t.cancel());
    this.activeCancellationTokens = /* @__PURE__ */ new Set();
  }
  search(_onResult) {
    const folderQueries = this.config.folderQueries || [];
    return new Promise((resolve, reject) => {
      const onResult = (match) => {
        this.resultCount++;
        _onResult(match);
      };
      if (this.isCanceled) {
        return resolve({ limitHit: this.isLimitHit });
      }
      if (this.config.extraFileResources) {
        this.config.extraFileResources.forEach((extraFile) => {
          const extraFileStr = extraFile.toString();
          const basename = path.basename(extraFileStr);
          if (this.globalExcludePattern && this.globalExcludePattern(extraFileStr, basename)) {
            return;
          }
          this.matchFile(onResult, { base: extraFile, basename });
        });
      }
      this.doSearch(folderQueries, onResult).then((stats) => {
        resolve({
          limitHit: this.isLimitHit,
          stats: stats || void 0
          // Only looking at single-folder workspace stats...
        });
      }, (err) => {
        reject(new Error(toErrorMessage(err)));
      });
    });
  }
  async doSearch(fqs, onResult) {
    const cancellation = new CancellationTokenSource();
    const folderOptions = fqs.map((fq) => this.getSearchOptionsForFolder(fq));
    const session = this.provider instanceof OldFileSearchProviderConverter ? this.sessionLifecycle?.tokenSource.token : this.sessionLifecycle?.obj;
    const options = {
      folderOptions,
      maxResults: this.config.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS,
      session
    };
    const getFolderQueryInfo = (fq) => {
      const queryTester = new QueryGlobTester(this.config, fq);
      const noSiblingsClauses = !queryTester.hasSiblingExcludeClauses();
      return { queryTester, noSiblingsClauses, folder: fq.folder, tree: this.initDirectoryTree() };
    };
    const folderMappings = new FolderQuerySearchTree(fqs, getFolderQueryInfo);
    let providerSW;
    try {
      this.activeCancellationTokens.add(cancellation);
      providerSW = StopWatch.create();
      const results = await this.provider.provideFileSearchResults(
        this.config.filePattern || "",
        options,
        cancellation.token
      );
      const providerTime = providerSW.elapsed();
      const postProcessSW = StopWatch.create();
      if (this.isCanceled && !this.isLimitHit) {
        return null;
      }
      if (results) {
        results.forEach((result) => {
          const fqFolderInfo = folderMappings.findQueryFragmentAwareSubstr(result);
          const relativePath = path.posix.relative(fqFolderInfo.folder.path, result.path);
          if (fqFolderInfo.noSiblingsClauses) {
            const basename = path.basename(result.path);
            this.matchFile(onResult, { base: fqFolderInfo.folder, relativePath, basename });
            return;
          }
          this.addDirectoryEntries(fqFolderInfo.tree, fqFolderInfo.folder, relativePath, onResult);
        });
      }
      if (this.isCanceled && !this.isLimitHit) {
        return null;
      }
      folderMappings.forEachFolderQueryInfo((e) => {
        this.matchDirectoryTree(e.tree, e.queryTester, onResult);
      });
      return {
        providerTime,
        postProcessTime: postProcessSW.elapsed()
      };
    } finally {
      cancellation.dispose();
      this.activeCancellationTokens.delete(cancellation);
    }
  }
  getSearchOptionsForFolder(fq) {
    const includes = resolvePatternsForProvider(this.config.includePattern, fq.includePattern);
    let excludePattern = fq.excludePattern?.map((e) => ({
      folder: e.folder,
      patterns: resolvePatternsForProvider(this.config.excludePattern, e.pattern)
    }));
    if (!excludePattern?.length) {
      excludePattern = [{
        folder: void 0,
        patterns: resolvePatternsForProvider(this.config.excludePattern, void 0)
      }];
    }
    const excludes = excludeToGlobPattern(excludePattern);
    return {
      folder: fq.folder,
      excludes,
      includes,
      useIgnoreFiles: {
        local: !fq.disregardIgnoreFiles,
        parent: !fq.disregardParentIgnoreFiles,
        global: !fq.disregardGlobalIgnoreFiles
      },
      followSymlinks: !fq.ignoreSymlinks
    };
  }
  initDirectoryTree() {
    const tree = {
      rootEntries: [],
      pathToEntries: /* @__PURE__ */ Object.create(null)
    };
    tree.pathToEntries["."] = tree.rootEntries;
    return tree;
  }
  addDirectoryEntries({ pathToEntries }, base, relativeFile, onResult) {
    if (this.filePattern && strings.equals(relativeFile, this.filePattern, this.config.ignoreGlobCase)) {
      const basename = path.basename(this.filePattern);
      this.matchFile(onResult, { base, relativePath: this.filePattern, basename });
    }
    function add(relativePath) {
      const basename = path.basename(relativePath);
      const dirname = path.dirname(relativePath);
      let entries = pathToEntries[dirname];
      if (!entries) {
        entries = pathToEntries[dirname] = [];
        add(dirname);
      }
      entries.push({
        base,
        relativePath,
        basename
      });
    }
    add(relativeFile);
  }
  matchDirectoryTree({ rootEntries, pathToEntries }, queryTester, onResult) {
    const self = this;
    const filePattern = this.filePattern;
    const ignoreGlobCase = this.config.ignoreGlobCase;
    function matchDirectory(entries) {
      const hasSibling = hasSiblingFn(() => entries.map((entry) => entry.basename));
      for (let i = 0, n = entries.length; i < n; i++) {
        const entry = entries[i];
        const { relativePath, basename } = entry;
        if (queryTester.matchesExcludesSync(relativePath, basename, !strings.equals(filePattern, basename, ignoreGlobCase) ? hasSibling : void 0)) {
          continue;
        }
        const sub = pathToEntries[relativePath];
        if (sub) {
          matchDirectory(sub);
        } else {
          if (strings.equals(relativePath, filePattern, ignoreGlobCase)) {
            continue;
          }
          self.matchFile(onResult, entry);
        }
        if (self.isLimitHit) {
          break;
        }
      }
    }
    matchDirectory(rootEntries);
  }
  matchFile(onResult, candidate) {
    if (!this.includePattern || candidate.relativePath && this.includePattern(candidate.relativePath, candidate.basename)) {
      if (this.exists || this.maxResults && this.resultCount >= this.maxResults) {
        this.isLimitHit = true;
        this.cancel();
      }
      if (!this.isLimitHit) {
        onResult(candidate);
      }
    }
  }
}
class SessionLifecycle {
  constructor() {
    this._obj = new Object();
    this.tokenSource = new CancellationTokenSource();
  }
  get obj() {
    if (this._obj) {
      return this._obj;
    }
    throw new Error("Session object has been dereferenced.");
  }
  cancel() {
    this.tokenSource.cancel();
    this._obj = void 0;
  }
}
const _FileSearchManager = class _FileSearchManager {
  constructor() {
    this.sessions = /* @__PURE__ */ new Map();
  }
  fileSearch(config, provider, onBatch, token) {
    const sessionTokenSource = this.getSessionTokenSource(config.cacheKey);
    const engine = new FileSearchEngine(config, provider, sessionTokenSource);
    let resultCount = 0;
    const onInternalResult = (batch) => {
      resultCount += batch.length;
      onBatch(batch.map((m) => this.rawMatchToSearchItem(m)));
    };
    return this.doSearch(engine, _FileSearchManager.BATCH_SIZE, onInternalResult, token).then(
      (result) => {
        return {
          limitHit: result.limitHit,
          stats: result.stats ? {
            fromCache: false,
            type: "fileSearchProvider",
            resultCount,
            detailStats: result.stats
          } : void 0,
          messages: []
        };
      }
    );
  }
  clearCache(cacheKey) {
    this.sessions.get(cacheKey)?.cancel();
    this.sessions.delete(cacheKey);
  }
  getSessionTokenSource(cacheKey) {
    if (!cacheKey) {
      return void 0;
    }
    if (!this.sessions.has(cacheKey)) {
      this.sessions.set(cacheKey, new SessionLifecycle());
    }
    return this.sessions.get(cacheKey);
  }
  rawMatchToSearchItem(match) {
    if (match.relativePath) {
      return {
        resource: resources.joinPath(match.base, match.relativePath)
      };
    } else {
      return {
        resource: match.base
      };
    }
  }
  doSearch(engine, batchSize, onResultBatch, token) {
    const listener = token.onCancellationRequested(() => {
      engine.cancel();
    });
    const _onResult = (match) => {
      if (match) {
        batch.push(match);
        if (batchSize > 0 && batch.length >= batchSize) {
          onResultBatch(batch);
          batch = [];
        }
      }
    };
    let batch = [];
    return engine.search(_onResult).then((result) => {
      if (batch.length) {
        onResultBatch(batch);
      }
      listener.dispose();
      return result;
    }, (error) => {
      if (batch.length) {
        onResultBatch(batch);
      }
      listener.dispose();
      return Promise.reject(error);
    });
  }
};
_FileSearchManager.BATCH_SIZE = 512;
let FileSearchManager = _FileSearchManager;
export {
  FileSearchManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL2ZpbGVTZWFyY2hNYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZU1hdGNoLCBJRmlsZVNlYXJjaFByb3ZpZGVyU3RhdHMsIElGb2xkZXJRdWVyeSwgSVNlYXJjaENvbXBsZXRlU3RhdHMsIElGaWxlUXVlcnksIFF1ZXJ5R2xvYlRlc3RlciwgcmVzb2x2ZVBhdHRlcm5zRm9yUHJvdmlkZXIsIGhhc1NpYmxpbmdGbiwgZXhjbHVkZVRvR2xvYlBhdHRlcm4sIERFRkFVTFRfTUFYX1NFQVJDSF9SRVNVTFRTIH0gZnJvbSAnLi9zZWFyY2guanMnO1xuaW1wb3J0IHsgRmlsZVNlYXJjaFByb3ZpZGVyRm9sZGVyT3B0aW9ucywgRmlsZVNlYXJjaFByb3ZpZGVyMiwgRmlsZVNlYXJjaFByb3ZpZGVyT3B0aW9ucyB9IGZyb20gJy4vc2VhcmNoRXh0VHlwZXMuanMnO1xuaW1wb3J0IHsgT2xkRmlsZVNlYXJjaFByb3ZpZGVyQ29udmVydGVyIH0gZnJvbSAnLi9zZWFyY2hFeHRDb252ZXJzaW9uVHlwZXMuanMnO1xuaW1wb3J0IHsgRm9sZGVyUXVlcnlTZWFyY2hUcmVlIH0gZnJvbSAnLi9mb2xkZXJRdWVyeVNlYXJjaFRyZWUuanMnO1xuXG5pbnRlcmZhY2UgSUludGVybmFsRmlsZU1hdGNoIHtcblx0YmFzZTogVVJJO1xuXHRvcmlnaW5hbD86IFVSSTtcblx0cmVsYXRpdmVQYXRoPzogc3RyaW5nOyAvLyBOb3QgcHJlc2VudCBmb3IgZXh0cmFGaWxlcyBvciBhYnNvbHV0ZSBwYXRoIG1hdGNoZXNcblx0YmFzZW5hbWU6IHN0cmluZztcblx0c2l6ZT86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElEaXJlY3RvcnlFbnRyeSB7XG5cdGJhc2U6IFVSSTtcblx0cmVsYXRpdmVQYXRoOiBzdHJpbmc7XG5cdGJhc2VuYW1lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBGb2xkZXJRdWVyeUluZm8ge1xuXHRxdWVyeVRlc3RlcjogUXVlcnlHbG9iVGVzdGVyO1xuXHRub1NpYmxpbmdzQ2xhdXNlczogYm9vbGVhbjtcblx0Zm9sZGVyOiBVUkk7XG5cdHRyZWU6IElEaXJlY3RvcnlUcmVlO1xufVxuXG5pbnRlcmZhY2UgSURpcmVjdG9yeVRyZWUge1xuXHRyb290RW50cmllczogSURpcmVjdG9yeUVudHJ5W107XG5cdHBhdGhUb0VudHJpZXM6IHsgW3JlbGF0aXZlUGF0aDogc3RyaW5nXTogSURpcmVjdG9yeUVudHJ5W10gfTtcbn1cblxuY2xhc3MgRmlsZVNlYXJjaEVuZ2luZSB7XG5cdHByaXZhdGUgZmlsZVBhdHRlcm4/OiBzdHJpbmc7XG5cdHByaXZhdGUgaW5jbHVkZVBhdHRlcm4/OiBnbG9iLlBhcnNlZEV4cHJlc3Npb247XG5cdHByaXZhdGUgbWF4UmVzdWx0cz86IG51bWJlcjtcblx0cHJpdmF0ZSBleGlzdHM/OiBib29sZWFuO1xuXHRwcml2YXRlIGlzTGltaXRIaXQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZXN1bHRDb3VudCA9IDA7XG5cdHByaXZhdGUgaXNDYW5jZWxlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgYWN0aXZlQ2FuY2VsbGF0aW9uVG9rZW5zOiBTZXQ8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+O1xuXG5cdHByaXZhdGUgZ2xvYmFsRXhjbHVkZVBhdHRlcm4/OiBnbG9iLlBhcnNlZEV4cHJlc3Npb247XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBjb25maWc6IElGaWxlUXVlcnksIHByaXZhdGUgcHJvdmlkZXI6IEZpbGVTZWFyY2hQcm92aWRlcjIsIHByaXZhdGUgc2Vzc2lvbkxpZmVjeWNsZT86IFNlc3Npb25MaWZlY3ljbGUpIHtcblx0XHR0aGlzLmZpbGVQYXR0ZXJuID0gY29uZmlnLmZpbGVQYXR0ZXJuO1xuXHRcdGNvbnN0IGdsb2JPcHRpb25zID0gY29uZmlnLmlnbm9yZUdsb2JDYXNlID8geyBpZ25vcmVDYXNlOiB0cnVlIH0gOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5pbmNsdWRlUGF0dGVybiA9IGNvbmZpZy5pbmNsdWRlUGF0dGVybiAmJiBnbG9iLnBhcnNlKGNvbmZpZy5pbmNsdWRlUGF0dGVybiwgZ2xvYk9wdGlvbnMpO1xuXHRcdHRoaXMubWF4UmVzdWx0cyA9IGNvbmZpZy5tYXhSZXN1bHRzIHx8IHVuZGVmaW5lZDtcblx0XHR0aGlzLmV4aXN0cyA9IGNvbmZpZy5leGlzdHM7XG5cdFx0dGhpcy5hY3RpdmVDYW5jZWxsYXRpb25Ub2tlbnMgPSBuZXcgU2V0PENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXG5cdFx0dGhpcy5nbG9iYWxFeGNsdWRlUGF0dGVybiA9IGNvbmZpZy5leGNsdWRlUGF0dGVybiAmJiBnbG9iLnBhcnNlKGNvbmZpZy5leGNsdWRlUGF0dGVybiwgZ2xvYk9wdGlvbnMpO1xuXHR9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNDYW5jZWxlZCA9IHRydWU7XG5cdFx0dGhpcy5hY3RpdmVDYW5jZWxsYXRpb25Ub2tlbnMuZm9yRWFjaCh0ID0+IHQuY2FuY2VsKCkpO1xuXHRcdHRoaXMuYWN0aXZlQ2FuY2VsbGF0aW9uVG9rZW5zID0gbmV3IFNldCgpO1xuXHR9XG5cblx0c2VhcmNoKF9vblJlc3VsdDogKG1hdGNoOiBJSW50ZXJuYWxGaWxlTWF0Y2gpID0+IHZvaWQpOiBQcm9taXNlPElJbnRlcm5hbFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0Y29uc3QgZm9sZGVyUXVlcmllcyA9IHRoaXMuY29uZmlnLmZvbGRlclF1ZXJpZXMgfHwgW107XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3Qgb25SZXN1bHQgPSAobWF0Y2g6IElJbnRlcm5hbEZpbGVNYXRjaCkgPT4ge1xuXHRcdFx0XHR0aGlzLnJlc3VsdENvdW50Kys7XG5cdFx0XHRcdF9vblJlc3VsdChtYXRjaCk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTdXBwb3J0IHRoYXQgdGhlIGZpbGUgcGF0dGVybiBpcyBhIGZ1bGwgcGF0aCB0byBhIGZpbGUgdGhhdCBleGlzdHNcblx0XHRcdGlmICh0aGlzLmlzQ2FuY2VsZWQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmUoeyBsaW1pdEhpdDogdGhpcy5pc0xpbWl0SGl0IH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb3IgZWFjaCBleHRyYSBmaWxlXG5cdFx0XHRpZiAodGhpcy5jb25maWcuZXh0cmFGaWxlUmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMuY29uZmlnLmV4dHJhRmlsZVJlc291cmNlc1xuXHRcdFx0XHRcdC5mb3JFYWNoKGV4dHJhRmlsZSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBleHRyYUZpbGVTdHIgPSBleHRyYUZpbGUudG9TdHJpbmcoKTsgLy8gP1xuXHRcdFx0XHRcdFx0Y29uc3QgYmFzZW5hbWUgPSBwYXRoLmJhc2VuYW1lKGV4dHJhRmlsZVN0cik7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5nbG9iYWxFeGNsdWRlUGF0dGVybiAmJiB0aGlzLmdsb2JhbEV4Y2x1ZGVQYXR0ZXJuKGV4dHJhRmlsZVN0ciwgYmFzZW5hbWUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjsgLy8gZXhjbHVkZWRcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gRmlsZTogQ2hlY2sgZm9yIG1hdGNoIG9uIGZpbGUgcGF0dGVybiBhbmQgaW5jbHVkZSBwYXR0ZXJuXG5cdFx0XHRcdFx0XHR0aGlzLm1hdGNoRmlsZShvblJlc3VsdCwgeyBiYXNlOiBleHRyYUZpbGUsIGJhc2VuYW1lIH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb3IgZWFjaCByb290IGZvbGRlcidcblxuXHRcdFx0Ly8gTkVXOiBjYW4ganVzdCBjYWxsIHdpdGggYW4gYXJyYXkgb2YgZm9sZGVyIGluZm9cblx0XHRcdHRoaXMuZG9TZWFyY2goZm9sZGVyUXVlcmllcywgb25SZXN1bHQpLnRoZW4oc3RhdHMgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHtcblx0XHRcdFx0XHRsaW1pdEhpdDogdGhpcy5pc0xpbWl0SGl0LFxuXHRcdFx0XHRcdHN0YXRzOiBzdGF0cyB8fCB1bmRlZmluZWQgLy8gT25seSBsb29raW5nIGF0IHNpbmdsZS1mb2xkZXIgd29ya3NwYWNlIHN0YXRzLi4uXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgKGVycjogRXJyb3IpID0+IHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcih0b0Vycm9yTWVzc2FnZShlcnIpKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cblx0cHJpdmF0ZSBhc3luYyBkb1NlYXJjaChmcXM6IElGb2xkZXJRdWVyeTxVUkk+W10sIG9uUmVzdWx0OiAobWF0Y2g6IElJbnRlcm5hbEZpbGVNYXRjaCkgPT4gdm9pZCk6IFByb21pc2U8SUZpbGVTZWFyY2hQcm92aWRlclN0YXRzIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGZvbGRlck9wdGlvbnMgPSBmcXMubWFwKGZxID0+IHRoaXMuZ2V0U2VhcmNoT3B0aW9uc0ZvckZvbGRlcihmcSkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLnByb3ZpZGVyIGluc3RhbmNlb2YgT2xkRmlsZVNlYXJjaFByb3ZpZGVyQ29udmVydGVyID8gdGhpcy5zZXNzaW9uTGlmZWN5Y2xlPy50b2tlblNvdXJjZS50b2tlbiA6IHRoaXMuc2Vzc2lvbkxpZmVjeWNsZT8ub2JqO1xuXHRcdGNvbnN0IG9wdGlvbnM6IEZpbGVTZWFyY2hQcm92aWRlck9wdGlvbnMgPSB7XG5cdFx0XHRmb2xkZXJPcHRpb25zLFxuXHRcdFx0bWF4UmVzdWx0czogdGhpcy5jb25maWcubWF4UmVzdWx0cyA/PyBERUZBVUxUX01BWF9TRUFSQ0hfUkVTVUxUUyxcblx0XHRcdHNlc3Npb25cblx0XHR9O1xuXG5cblx0XHRjb25zdCBnZXRGb2xkZXJRdWVyeUluZm8gPSAoZnE6IElGb2xkZXJRdWVyeSkgPT4ge1xuXHRcdFx0Y29uc3QgcXVlcnlUZXN0ZXIgPSBuZXcgUXVlcnlHbG9iVGVzdGVyKHRoaXMuY29uZmlnLCBmcSk7XG5cdFx0XHRjb25zdCBub1NpYmxpbmdzQ2xhdXNlcyA9ICFxdWVyeVRlc3Rlci5oYXNTaWJsaW5nRXhjbHVkZUNsYXVzZXMoKTtcblx0XHRcdHJldHVybiB7IHF1ZXJ5VGVzdGVyLCBub1NpYmxpbmdzQ2xhdXNlcywgZm9sZGVyOiBmcS5mb2xkZXIsIHRyZWU6IHRoaXMuaW5pdERpcmVjdG9yeVRyZWUoKSB9O1xuXHRcdH07XG5cblx0XHRjb25zdCBmb2xkZXJNYXBwaW5nczogRm9sZGVyUXVlcnlTZWFyY2hUcmVlPEZvbGRlclF1ZXJ5SW5mbz4gPSBuZXcgRm9sZGVyUXVlcnlTZWFyY2hUcmVlPEZvbGRlclF1ZXJ5SW5mbz4oZnFzLCBnZXRGb2xkZXJRdWVyeUluZm8pO1xuXG5cdFx0bGV0IHByb3ZpZGVyU1c6IFN0b3BXYXRjaDtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUNhbmNlbGxhdGlvblRva2Vucy5hZGQoY2FuY2VsbGF0aW9uKTtcblxuXHRcdFx0cHJvdmlkZXJTVyA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLnByb3ZpZGVyLnByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhcblx0XHRcdFx0dGhpcy5jb25maWcuZmlsZVBhdHRlcm4gfHwgJycsXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdGNhbmNlbGxhdGlvbi50b2tlbik7XG5cdFx0XHRjb25zdCBwcm92aWRlclRpbWUgPSBwcm92aWRlclNXLmVsYXBzZWQoKTtcblx0XHRcdGNvbnN0IHBvc3RQcm9jZXNzU1cgPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cblx0XHRcdGlmICh0aGlzLmlzQ2FuY2VsZWQgJiYgIXRoaXMuaXNMaW1pdEhpdCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXG5cdFx0XHRpZiAocmVzdWx0cykge1xuXHRcdFx0XHRyZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRjb25zdCBmcUZvbGRlckluZm8gPSBmb2xkZXJNYXBwaW5ncy5maW5kUXVlcnlGcmFnbWVudEF3YXJlU3Vic3RyKHJlc3VsdCkhO1xuXHRcdFx0XHRcdGNvbnN0IHJlbGF0aXZlUGF0aCA9IHBhdGgucG9zaXgucmVsYXRpdmUoZnFGb2xkZXJJbmZvLmZvbGRlci5wYXRoLCByZXN1bHQucGF0aCk7XG5cblx0XHRcdFx0XHRpZiAoZnFGb2xkZXJJbmZvLm5vU2libGluZ3NDbGF1c2VzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBiYXNlbmFtZSA9IHBhdGguYmFzZW5hbWUocmVzdWx0LnBhdGgpO1xuXHRcdFx0XHRcdFx0dGhpcy5tYXRjaEZpbGUob25SZXN1bHQsIHsgYmFzZTogZnFGb2xkZXJJbmZvLmZvbGRlciwgcmVsYXRpdmVQYXRoLCBiYXNlbmFtZSB9KTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFRPRE86IE9wdGltaXplIHNpYmxpbmdzIGNsYXVzZXMgd2l0aCByaXBncmVwIGhlcmUuXG5cdFx0XHRcdFx0dGhpcy5hZGREaXJlY3RvcnlFbnRyaWVzKGZxRm9sZGVySW5mby50cmVlLCBmcUZvbGRlckluZm8uZm9sZGVyLCByZWxhdGl2ZVBhdGgsIG9uUmVzdWx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmlzQ2FuY2VsZWQgJiYgIXRoaXMuaXNMaW1pdEhpdCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Zm9sZGVyTWFwcGluZ3MuZm9yRWFjaEZvbGRlclF1ZXJ5SW5mbyhlID0+IHtcblx0XHRcdFx0dGhpcy5tYXRjaERpcmVjdG9yeVRyZWUoZS50cmVlLCBlLnF1ZXJ5VGVzdGVyLCBvblJlc3VsdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJvdmlkZXJUaW1lLFxuXHRcdFx0XHRwb3N0UHJvY2Vzc1RpbWU6IHBvc3RQcm9jZXNzU1cuZWxhcHNlZCgpXG5cdFx0XHR9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjYW5jZWxsYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5hY3RpdmVDYW5jZWxsYXRpb25Ub2tlbnMuZGVsZXRlKGNhbmNlbGxhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWFyY2hPcHRpb25zRm9yRm9sZGVyKGZxOiBJRm9sZGVyUXVlcnk8VVJJPik6IEZpbGVTZWFyY2hQcm92aWRlckZvbGRlck9wdGlvbnMge1xuXHRcdGNvbnN0IGluY2x1ZGVzID0gcmVzb2x2ZVBhdHRlcm5zRm9yUHJvdmlkZXIodGhpcy5jb25maWcuaW5jbHVkZVBhdHRlcm4sIGZxLmluY2x1ZGVQYXR0ZXJuKTtcblx0XHRsZXQgZXhjbHVkZVBhdHRlcm4gPSBmcS5leGNsdWRlUGF0dGVybj8ubWFwKGUgPT4gKHtcblx0XHRcdGZvbGRlcjogZS5mb2xkZXIsXG5cdFx0XHRwYXR0ZXJuczogcmVzb2x2ZVBhdHRlcm5zRm9yUHJvdmlkZXIodGhpcy5jb25maWcuZXhjbHVkZVBhdHRlcm4sIGUucGF0dGVybilcblx0XHR9KSk7XG5cdFx0aWYgKCFleGNsdWRlUGF0dGVybj8ubGVuZ3RoKSB7XG5cdFx0XHRleGNsdWRlUGF0dGVybiA9IFt7XG5cdFx0XHRcdGZvbGRlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRwYXR0ZXJuczogcmVzb2x2ZVBhdHRlcm5zRm9yUHJvdmlkZXIodGhpcy5jb25maWcuZXhjbHVkZVBhdHRlcm4sIHVuZGVmaW5lZClcblx0XHRcdH1dO1xuXHRcdH1cblx0XHRjb25zdCBleGNsdWRlcyA9IGV4Y2x1ZGVUb0dsb2JQYXR0ZXJuKGV4Y2x1ZGVQYXR0ZXJuKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRmb2xkZXI6IGZxLmZvbGRlcixcblx0XHRcdGV4Y2x1ZGVzLFxuXHRcdFx0aW5jbHVkZXMsXG5cdFx0XHR1c2VJZ25vcmVGaWxlczoge1xuXHRcdFx0XHRsb2NhbDogIWZxLmRpc3JlZ2FyZElnbm9yZUZpbGVzLFxuXHRcdFx0XHRwYXJlbnQ6ICFmcS5kaXNyZWdhcmRQYXJlbnRJZ25vcmVGaWxlcyxcblx0XHRcdFx0Z2xvYmFsOiAhZnEuZGlzcmVnYXJkR2xvYmFsSWdub3JlRmlsZXNcblx0XHRcdH0sXG5cdFx0XHRmb2xsb3dTeW1saW5rczogIWZxLmlnbm9yZVN5bWxpbmtzLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGluaXREaXJlY3RvcnlUcmVlKCk6IElEaXJlY3RvcnlUcmVlIHtcblx0XHRjb25zdCB0cmVlOiBJRGlyZWN0b3J5VHJlZSA9IHtcblx0XHRcdHJvb3RFbnRyaWVzOiBbXSxcblx0XHRcdHBhdGhUb0VudHJpZXM6IE9iamVjdC5jcmVhdGUobnVsbClcblx0XHR9O1xuXHRcdHRyZWUucGF0aFRvRW50cmllc1snLiddID0gdHJlZS5yb290RW50cmllcztcblx0XHRyZXR1cm4gdHJlZTtcblx0fVxuXG5cdHByaXZhdGUgYWRkRGlyZWN0b3J5RW50cmllcyh7IHBhdGhUb0VudHJpZXMgfTogSURpcmVjdG9yeVRyZWUsIGJhc2U6IFVSSSwgcmVsYXRpdmVGaWxlOiBzdHJpbmcsIG9uUmVzdWx0OiAocmVzdWx0OiBJSW50ZXJuYWxGaWxlTWF0Y2gpID0+IHZvaWQpIHtcblx0XHQvLyBTdXBwb3J0IHJlbGF0aXZlIHBhdGhzIHRvIGZpbGVzIGZyb20gYSByb290IHJlc291cmNlIChpZ25vcmVzIGV4Y2x1ZGVzKVxuXHRcdGlmICh0aGlzLmZpbGVQYXR0ZXJuICYmIHN0cmluZ3MuZXF1YWxzKHJlbGF0aXZlRmlsZSwgdGhpcy5maWxlUGF0dGVybiwgdGhpcy5jb25maWcuaWdub3JlR2xvYkNhc2UpKSB7XG5cdFx0XHRjb25zdCBiYXNlbmFtZSA9IHBhdGguYmFzZW5hbWUodGhpcy5maWxlUGF0dGVybik7XG5cdFx0XHR0aGlzLm1hdGNoRmlsZShvblJlc3VsdCwgeyBiYXNlOiBiYXNlLCByZWxhdGl2ZVBhdGg6IHRoaXMuZmlsZVBhdHRlcm4sIGJhc2VuYW1lIH0pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGFkZChyZWxhdGl2ZVBhdGg6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgYmFzZW5hbWUgPSBwYXRoLmJhc2VuYW1lKHJlbGF0aXZlUGF0aCk7XG5cdFx0XHRjb25zdCBkaXJuYW1lID0gcGF0aC5kaXJuYW1lKHJlbGF0aXZlUGF0aCk7XG5cdFx0XHRsZXQgZW50cmllcyA9IHBhdGhUb0VudHJpZXNbZGlybmFtZV07XG5cdFx0XHRpZiAoIWVudHJpZXMpIHtcblx0XHRcdFx0ZW50cmllcyA9IHBhdGhUb0VudHJpZXNbZGlybmFtZV0gPSBbXTtcblx0XHRcdFx0YWRkKGRpcm5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdFx0YmFzZSxcblx0XHRcdFx0cmVsYXRpdmVQYXRoLFxuXHRcdFx0XHRiYXNlbmFtZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YWRkKHJlbGF0aXZlRmlsZSk7XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoRGlyZWN0b3J5VHJlZSh7IHJvb3RFbnRyaWVzLCBwYXRoVG9FbnRyaWVzIH06IElEaXJlY3RvcnlUcmVlLCBxdWVyeVRlc3RlcjogUXVlcnlHbG9iVGVzdGVyLCBvblJlc3VsdDogKHJlc3VsdDogSUludGVybmFsRmlsZU1hdGNoKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0Y29uc3QgZmlsZVBhdHRlcm4gPSB0aGlzLmZpbGVQYXR0ZXJuO1xuXHRcdGNvbnN0IGlnbm9yZUdsb2JDYXNlID0gdGhpcy5jb25maWcuaWdub3JlR2xvYkNhc2U7XG5cdFx0ZnVuY3Rpb24gbWF0Y2hEaXJlY3RvcnkoZW50cmllczogSURpcmVjdG9yeUVudHJ5W10pIHtcblx0XHRcdGNvbnN0IGhhc1NpYmxpbmcgPSBoYXNTaWJsaW5nRm4oKCkgPT4gZW50cmllcy5tYXAoZW50cnkgPT4gZW50cnkuYmFzZW5hbWUpKTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBuID0gZW50cmllcy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlbnRyaWVzW2ldO1xuXHRcdFx0XHRjb25zdCB7IHJlbGF0aXZlUGF0aCwgYmFzZW5hbWUgfSA9IGVudHJ5O1xuXG5cdFx0XHRcdC8vIENoZWNrIGV4Y2x1ZGUgcGF0dGVyblxuXHRcdFx0XHQvLyBJZiB0aGUgdXNlciBzZWFyY2hlcyBmb3IgdGhlIGV4YWN0IGZpbGUgbmFtZSwgd2UgYWRqdXN0IHRoZSBnbG9iIG1hdGNoaW5nXG5cdFx0XHRcdC8vIHRvIGlnbm9yZSBmaWx0ZXJpbmcgYnkgc2libGluZ3MgYmVjYXVzZSB0aGUgdXNlciBzZWVtcyB0byBrbm93IHdoYXQgdGhleVxuXHRcdFx0XHQvLyBhcmUgc2VhcmNoaW5nIGZvciBhbmQgd2Ugd2FudCB0byBpbmNsdWRlIHRoZSByZXN1bHQgaW4gdGhhdCBjYXNlIGFueXdheVxuXHRcdFx0XHRpZiAocXVlcnlUZXN0ZXIubWF0Y2hlc0V4Y2x1ZGVzU3luYyhyZWxhdGl2ZVBhdGgsIGJhc2VuYW1lLCAhc3RyaW5ncy5lcXVhbHMoZmlsZVBhdHRlcm4sIGJhc2VuYW1lLCBpZ25vcmVHbG9iQ2FzZSkgPyBoYXNTaWJsaW5nIDogdW5kZWZpbmVkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc3ViID0gcGF0aFRvRW50cmllc1tyZWxhdGl2ZVBhdGhdO1xuXHRcdFx0XHRpZiAoc3ViKSB7XG5cdFx0XHRcdFx0bWF0Y2hEaXJlY3Rvcnkoc3ViKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoc3RyaW5ncy5lcXVhbHMocmVsYXRpdmVQYXRoLCBmaWxlUGF0dGVybiwgaWdub3JlR2xvYkNhc2UpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gaWdub3JlIGZpbGUgaWYgaXRzIHBhdGggbWF0Y2hlcyB3aXRoIHRoZSBmaWxlIHBhdHRlcm4gYmVjYXVzZSB0aGF0IGlzIGFscmVhZHkgbWF0Y2hlZCBhYm92ZVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHNlbGYubWF0Y2hGaWxlKG9uUmVzdWx0LCBlbnRyeSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoc2VsZi5pc0xpbWl0SGl0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0bWF0Y2hEaXJlY3Rvcnkocm9vdEVudHJpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaEZpbGUob25SZXN1bHQ6IChyZXN1bHQ6IElJbnRlcm5hbEZpbGVNYXRjaCkgPT4gdm9pZCwgY2FuZGlkYXRlOiBJSW50ZXJuYWxGaWxlTWF0Y2gpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaW5jbHVkZVBhdHRlcm4gfHwgKGNhbmRpZGF0ZS5yZWxhdGl2ZVBhdGggJiYgdGhpcy5pbmNsdWRlUGF0dGVybihjYW5kaWRhdGUucmVsYXRpdmVQYXRoLCBjYW5kaWRhdGUuYmFzZW5hbWUpKSkge1xuXHRcdFx0aWYgKHRoaXMuZXhpc3RzIHx8ICh0aGlzLm1heFJlc3VsdHMgJiYgdGhpcy5yZXN1bHRDb3VudCA+PSB0aGlzLm1heFJlc3VsdHMpKSB7XG5cdFx0XHRcdHRoaXMuaXNMaW1pdEhpdCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5pc0xpbWl0SGl0KSB7XG5cdFx0XHRcdG9uUmVzdWx0KGNhbmRpZGF0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBJSW50ZXJuYWxTZWFyY2hDb21wbGV0ZSB7XG5cdGxpbWl0SGl0OiBib29sZWFuO1xuXHRzdGF0cz86IElGaWxlU2VhcmNoUHJvdmlkZXJTdGF0cztcbn1cblxuLyoqXG4gKiBGb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHksIHN0b3JlIGJvdGggYSBjYW5jZWxsYXRpb24gdG9rZW4gYW5kIGEgc2Vzc2lvbiBvYmplY3QuIFRoZSBzZXNzaW9uIG9iamVjdCBpcyB0aGUgbmV3IGltcGxlbWVudGF0aW9uLCB3aGVyZVxuICovXG5jbGFzcyBTZXNzaW9uTGlmZWN5Y2xlIHtcblx0cHJpdmF0ZSBfb2JqOiBvYmplY3QgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSB0b2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fb2JqID0gbmV3IE9iamVjdCgpO1xuXHRcdHRoaXMudG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb2JqKCkge1xuXHRcdGlmICh0aGlzLl9vYmopIHtcblx0XHRcdHJldHVybiB0aGlzLl9vYmo7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdTZXNzaW9uIG9iamVjdCBoYXMgYmVlbiBkZXJlZmVyZW5jZWQuJyk7XG5cdH1cblxuXHRjYW5jZWwoKSB7XG5cdFx0dGhpcy50b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHR0aGlzLl9vYmogPSB1bmRlZmluZWQ7IC8vIGRlcmVmZXJlbmNlXG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVTZWFyY2hNYW5hZ2VyIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBCQVRDSF9TSVpFID0gNTEyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgU2Vzc2lvbkxpZmVjeWNsZT4oKTtcblxuXHRmaWxlU2VhcmNoKGNvbmZpZzogSUZpbGVRdWVyeSwgcHJvdmlkZXI6IEZpbGVTZWFyY2hQcm92aWRlcjIsIG9uQmF0Y2g6IChtYXRjaGVzOiBJRmlsZU1hdGNoW10pID0+IHZvaWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlU3RhdHM+IHtcblx0XHRjb25zdCBzZXNzaW9uVG9rZW5Tb3VyY2UgPSB0aGlzLmdldFNlc3Npb25Ub2tlblNvdXJjZShjb25maWcuY2FjaGVLZXkpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IG5ldyBGaWxlU2VhcmNoRW5naW5lKGNvbmZpZywgcHJvdmlkZXIsIHNlc3Npb25Ub2tlblNvdXJjZSk7XG5cblx0XHRsZXQgcmVzdWx0Q291bnQgPSAwO1xuXHRcdGNvbnN0IG9uSW50ZXJuYWxSZXN1bHQgPSAoYmF0Y2g6IElJbnRlcm5hbEZpbGVNYXRjaFtdKSA9PiB7XG5cdFx0XHRyZXN1bHRDb3VudCArPSBiYXRjaC5sZW5ndGg7XG5cdFx0XHRvbkJhdGNoKGJhdGNoLm1hcChtID0+IHRoaXMucmF3TWF0Y2hUb1NlYXJjaEl0ZW0obSkpKTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRoaXMuZG9TZWFyY2goZW5naW5lLCBGaWxlU2VhcmNoTWFuYWdlci5CQVRDSF9TSVpFLCBvbkludGVybmFsUmVzdWx0LCB0b2tlbikudGhlbihcblx0XHRcdHJlc3VsdCA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGltaXRIaXQ6IHJlc3VsdC5saW1pdEhpdCxcblx0XHRcdFx0XHRzdGF0czogcmVzdWx0LnN0YXRzID8ge1xuXHRcdFx0XHRcdFx0ZnJvbUNhY2hlOiBmYWxzZSxcblx0XHRcdFx0XHRcdHR5cGU6ICdmaWxlU2VhcmNoUHJvdmlkZXInLFxuXHRcdFx0XHRcdFx0cmVzdWx0Q291bnQsXG5cdFx0XHRcdFx0XHRkZXRhaWxTdGF0czogcmVzdWx0LnN0YXRzXG5cdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtZXNzYWdlczogW11cblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHR9XG5cblx0Y2xlYXJDYWNoZShjYWNoZUtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gY2FuY2VsIHRoZSB0b2tlblxuXHRcdHRoaXMuc2Vzc2lvbnMuZ2V0KGNhY2hlS2V5KT8uY2FuY2VsKCk7XG5cdFx0Ly8gd2l0aCBubyByZWZlcmVuY2UgdG8gdGhpcywgaXQgd2lsbCBiZSByZW1vdmVkIGZyb20gV2Vha01hcHNcblx0XHR0aGlzLnNlc3Npb25zLmRlbGV0ZShjYWNoZUtleSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlc3Npb25Ub2tlblNvdXJjZShjYWNoZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkKTogU2Vzc2lvbkxpZmVjeWNsZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFjYWNoZUtleSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuc2Vzc2lvbnMuaGFzKGNhY2hlS2V5KSkge1xuXHRcdFx0dGhpcy5zZXNzaW9ucy5zZXQoY2FjaGVLZXksIG5ldyBTZXNzaW9uTGlmZWN5Y2xlKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNlc3Npb25zLmdldChjYWNoZUtleSk7XG5cdH1cblxuXHRwcml2YXRlIHJhd01hdGNoVG9TZWFyY2hJdGVtKG1hdGNoOiBJSW50ZXJuYWxGaWxlTWF0Y2gpOiBJRmlsZU1hdGNoIHtcblx0XHRpZiAobWF0Y2gucmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXNvdXJjZTogcmVzb3VyY2VzLmpvaW5QYXRoKG1hdGNoLmJhc2UsIG1hdGNoLnJlbGF0aXZlUGF0aClcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGV4dHJhRmlsZVJlc291cmNlc1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzb3VyY2U6IG1hdGNoLmJhc2Vcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1NlYXJjaChlbmdpbmU6IEZpbGVTZWFyY2hFbmdpbmUsIGJhdGNoU2l6ZTogbnVtYmVyLCBvblJlc3VsdEJhdGNoOiAobWF0Y2hlczogSUludGVybmFsRmlsZU1hdGNoW10pID0+IHZvaWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUludGVybmFsU2VhcmNoQ29tcGxldGU+IHtcblx0XHRjb25zdCBsaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdGVuZ2luZS5jYW5jZWwoKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IF9vblJlc3VsdCA9IChtYXRjaDogSUludGVybmFsRmlsZU1hdGNoKSA9PiB7XG5cdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0YmF0Y2gucHVzaChtYXRjaCk7XG5cdFx0XHRcdGlmIChiYXRjaFNpemUgPiAwICYmIGJhdGNoLmxlbmd0aCA+PSBiYXRjaFNpemUpIHtcblx0XHRcdFx0XHRvblJlc3VsdEJhdGNoKGJhdGNoKTtcblx0XHRcdFx0XHRiYXRjaCA9IFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGxldCBiYXRjaDogSUludGVybmFsRmlsZU1hdGNoW10gPSBbXTtcblx0XHRyZXR1cm4gZW5naW5lLnNlYXJjaChfb25SZXN1bHQpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmIChiYXRjaC5sZW5ndGgpIHtcblx0XHRcdFx0b25SZXN1bHRCYXRjaChiYXRjaCk7XG5cdFx0XHR9XG5cblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSwgZXJyb3IgPT4ge1xuXHRcdFx0aWYgKGJhdGNoLmxlbmd0aCkge1xuXHRcdFx0XHRvblJlc3VsdEJhdGNoKGJhdGNoKTtcblx0XHRcdH1cblxuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxVQUFVO0FBQ3RCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLHNCQUFzQjtBQUMvQixZQUFZLGFBQWE7QUFDekIsWUFBWSxVQUFVO0FBQ3RCLFlBQVksZUFBZTtBQUMzQixTQUFTLGlCQUFpQjtBQUUxQixTQUErRixpQkFBaUIsNEJBQTRCLGNBQWMsc0JBQXNCLGtDQUFrQztBQUVsTixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDZCQUE2QjtBQTRCdEMsTUFBTSxpQkFBaUI7QUFBQSxFQWF0QixZQUFvQixRQUE0QixVQUF1QyxrQkFBcUM7QUFBeEc7QUFBNEI7QUFBdUM7QUFSdkYsU0FBUSxhQUFhO0FBQ3JCLFNBQVEsY0FBYztBQUN0QixTQUFRLGFBQWE7QUFPcEIsU0FBSyxjQUFjLE9BQU87QUFDMUIsVUFBTSxjQUFjLE9BQU8saUJBQWlCLEVBQUUsWUFBWSxLQUFLLElBQUk7QUFDbkUsU0FBSyxpQkFBaUIsT0FBTyxrQkFBa0IsS0FBSyxNQUFNLE9BQU8sZ0JBQWdCLFdBQVc7QUFDNUYsU0FBSyxhQUFhLE9BQU8sY0FBYztBQUN2QyxTQUFLLFNBQVMsT0FBTztBQUNyQixTQUFLLDJCQUEyQixvQkFBSSxJQUE2QjtBQUVqRSxTQUFLLHVCQUF1QixPQUFPLGtCQUFrQixLQUFLLE1BQU0sT0FBTyxnQkFBZ0IsV0FBVztBQUFBLEVBQ25HO0FBQUEsRUFFQSxTQUFlO0FBQ2QsU0FBSyxhQUFhO0FBQ2xCLFNBQUsseUJBQXlCLFFBQVEsT0FBSyxFQUFFLE9BQU8sQ0FBQztBQUNyRCxTQUFLLDJCQUEyQixvQkFBSSxJQUFJO0FBQUEsRUFDekM7QUFBQSxFQUVBLE9BQU8sV0FBa0Y7QUFDeEYsVUFBTSxnQkFBZ0IsS0FBSyxPQUFPLGlCQUFpQixDQUFDO0FBRXBELFdBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3ZDLFlBQU0sV0FBVyxDQUFDLFVBQThCO0FBQy9DLGFBQUs7QUFDTCxrQkFBVSxLQUFLO0FBQUEsTUFDaEI7QUFHQSxVQUFJLEtBQUssWUFBWTtBQUNwQixlQUFPLFFBQVEsRUFBRSxVQUFVLEtBQUssV0FBVyxDQUFDO0FBQUEsTUFDN0M7QUFHQSxVQUFJLEtBQUssT0FBTyxvQkFBb0I7QUFDbkMsYUFBSyxPQUFPLG1CQUNWLFFBQVEsZUFBYTtBQUNyQixnQkFBTSxlQUFlLFVBQVUsU0FBUztBQUN4QyxnQkFBTSxXQUFXLEtBQUssU0FBUyxZQUFZO0FBQzNDLGNBQUksS0FBSyx3QkFBd0IsS0FBSyxxQkFBcUIsY0FBYyxRQUFRLEdBQUc7QUFDbkY7QUFBQSxVQUNEO0FBR0EsZUFBSyxVQUFVLFVBQVUsRUFBRSxNQUFNLFdBQVcsU0FBUyxDQUFDO0FBQUEsUUFDdkQsQ0FBQztBQUFBLE1BQ0g7QUFLQSxXQUFLLFNBQVMsZUFBZSxRQUFRLEVBQUUsS0FBSyxXQUFTO0FBQ3BELGdCQUFRO0FBQUEsVUFDUCxVQUFVLEtBQUs7QUFBQSxVQUNmLE9BQU8sU0FBUztBQUFBO0FBQUEsUUFDakIsQ0FBQztBQUFBLE1BQ0YsR0FBRyxDQUFDLFFBQWU7QUFDbEIsZUFBTyxJQUFJLE1BQU0sZUFBZSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3RDLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFHQSxNQUFjLFNBQVMsS0FBMEIsVUFBeUY7QUFDekksVUFBTSxlQUFlLElBQUksd0JBQXdCO0FBQ2pELFVBQU0sZ0JBQWdCLElBQUksSUFBSSxRQUFNLEtBQUssMEJBQTBCLEVBQUUsQ0FBQztBQUN0RSxVQUFNLFVBQVUsS0FBSyxvQkFBb0IsaUNBQWlDLEtBQUssa0JBQWtCLFlBQVksUUFBUSxLQUFLLGtCQUFrQjtBQUM1SSxVQUFNLFVBQXFDO0FBQUEsTUFDMUM7QUFBQSxNQUNBLFlBQVksS0FBSyxPQUFPLGNBQWM7QUFBQSxNQUN0QztBQUFBLElBQ0Q7QUFHQSxVQUFNLHFCQUFxQixDQUFDLE9BQXFCO0FBQ2hELFlBQU0sY0FBYyxJQUFJLGdCQUFnQixLQUFLLFFBQVEsRUFBRTtBQUN2RCxZQUFNLG9CQUFvQixDQUFDLFlBQVkseUJBQXlCO0FBQ2hFLGFBQU8sRUFBRSxhQUFhLG1CQUFtQixRQUFRLEdBQUcsUUFBUSxNQUFNLEtBQUssa0JBQWtCLEVBQUU7QUFBQSxJQUM1RjtBQUVBLFVBQU0saUJBQXlELElBQUksc0JBQXVDLEtBQUssa0JBQWtCO0FBRWpJLFFBQUk7QUFFSixRQUFJO0FBQ0gsV0FBSyx5QkFBeUIsSUFBSSxZQUFZO0FBRTlDLG1CQUFhLFVBQVUsT0FBTztBQUM5QixZQUFNLFVBQVUsTUFBTSxLQUFLLFNBQVM7QUFBQSxRQUNuQyxLQUFLLE9BQU8sZUFBZTtBQUFBLFFBQzNCO0FBQUEsUUFDQSxhQUFhO0FBQUEsTUFBSztBQUNuQixZQUFNLGVBQWUsV0FBVyxRQUFRO0FBQ3hDLFlBQU0sZ0JBQWdCLFVBQVUsT0FBTztBQUV2QyxVQUFJLEtBQUssY0FBYyxDQUFDLEtBQUssWUFBWTtBQUN4QyxlQUFPO0FBQUEsTUFDUjtBQUdBLFVBQUksU0FBUztBQUNaLGdCQUFRLFFBQVEsWUFBVTtBQUN6QixnQkFBTSxlQUFlLGVBQWUsNkJBQTZCLE1BQU07QUFDdkUsZ0JBQU0sZUFBZSxLQUFLLE1BQU0sU0FBUyxhQUFhLE9BQU8sTUFBTSxPQUFPLElBQUk7QUFFOUUsY0FBSSxhQUFhLG1CQUFtQjtBQUNuQyxrQkFBTSxXQUFXLEtBQUssU0FBUyxPQUFPLElBQUk7QUFDMUMsaUJBQUssVUFBVSxVQUFVLEVBQUUsTUFBTSxhQUFhLFFBQVEsY0FBYyxTQUFTLENBQUM7QUFFOUU7QUFBQSxVQUNEO0FBR0EsZUFBSyxvQkFBb0IsYUFBYSxNQUFNLGFBQWEsUUFBUSxjQUFjLFFBQVE7QUFBQSxRQUN4RixDQUFDO0FBQUEsTUFDRjtBQUVBLFVBQUksS0FBSyxjQUFjLENBQUMsS0FBSyxZQUFZO0FBQ3hDLGVBQU87QUFBQSxNQUNSO0FBRUEscUJBQWUsdUJBQXVCLE9BQUs7QUFDMUMsYUFBSyxtQkFBbUIsRUFBRSxNQUFNLEVBQUUsYUFBYSxRQUFRO0FBQUEsTUFDeEQsQ0FBQztBQUVELGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQSxpQkFBaUIsY0FBYyxRQUFRO0FBQUEsTUFDeEM7QUFBQSxJQUNELFVBQUU7QUFDRCxtQkFBYSxRQUFRO0FBQ3JCLFdBQUsseUJBQXlCLE9BQU8sWUFBWTtBQUFBLElBQ2xEO0FBQUEsRUFDRDtBQUFBLEVBRVEsMEJBQTBCLElBQXdEO0FBQ3pGLFVBQU0sV0FBVywyQkFBMkIsS0FBSyxPQUFPLGdCQUFnQixHQUFHLGNBQWM7QUFDekYsUUFBSSxpQkFBaUIsR0FBRyxnQkFBZ0IsSUFBSSxRQUFNO0FBQUEsTUFDakQsUUFBUSxFQUFFO0FBQUEsTUFDVixVQUFVLDJCQUEyQixLQUFLLE9BQU8sZ0JBQWdCLEVBQUUsT0FBTztBQUFBLElBQzNFLEVBQUU7QUFDRixRQUFJLENBQUMsZ0JBQWdCLFFBQVE7QUFDNUIsdUJBQWlCLENBQUM7QUFBQSxRQUNqQixRQUFRO0FBQUEsUUFDUixVQUFVLDJCQUEyQixLQUFLLE9BQU8sZ0JBQWdCLE1BQVM7QUFBQSxNQUMzRSxDQUFDO0FBQUEsSUFDRjtBQUNBLFVBQU0sV0FBVyxxQkFBcUIsY0FBYztBQUVwRCxXQUFPO0FBQUEsTUFDTixRQUFRLEdBQUc7QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLE1BQ0EsZ0JBQWdCO0FBQUEsUUFDZixPQUFPLENBQUMsR0FBRztBQUFBLFFBQ1gsUUFBUSxDQUFDLEdBQUc7QUFBQSxRQUNaLFFBQVEsQ0FBQyxHQUFHO0FBQUEsTUFDYjtBQUFBLE1BQ0EsZ0JBQWdCLENBQUMsR0FBRztBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQW9DO0FBQzNDLFVBQU0sT0FBdUI7QUFBQSxNQUM1QixhQUFhLENBQUM7QUFBQSxNQUNkLGVBQWUsdUJBQU8sT0FBTyxJQUFJO0FBQUEsSUFDbEM7QUFDQSxTQUFLLGNBQWMsR0FBRyxJQUFJLEtBQUs7QUFDL0IsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG9CQUFvQixFQUFFLGNBQWMsR0FBbUIsTUFBVyxjQUFzQixVQUFnRDtBQUUvSSxRQUFJLEtBQUssZUFBZSxRQUFRLE9BQU8sY0FBYyxLQUFLLGFBQWEsS0FBSyxPQUFPLGNBQWMsR0FBRztBQUNuRyxZQUFNLFdBQVcsS0FBSyxTQUFTLEtBQUssV0FBVztBQUMvQyxXQUFLLFVBQVUsVUFBVSxFQUFFLE1BQVksY0FBYyxLQUFLLGFBQWEsU0FBUyxDQUFDO0FBQUEsSUFDbEY7QUFFQSxhQUFTLElBQUksY0FBc0I7QUFDbEMsWUFBTSxXQUFXLEtBQUssU0FBUyxZQUFZO0FBQzNDLFlBQU0sVUFBVSxLQUFLLFFBQVEsWUFBWTtBQUN6QyxVQUFJLFVBQVUsY0FBYyxPQUFPO0FBQ25DLFVBQUksQ0FBQyxTQUFTO0FBQ2Isa0JBQVUsY0FBYyxPQUFPLElBQUksQ0FBQztBQUNwQyxZQUFJLE9BQU87QUFBQSxNQUNaO0FBQ0EsY0FBUSxLQUFLO0FBQUEsUUFDWjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUVBLFFBQUksWUFBWTtBQUFBLEVBQ2pCO0FBQUEsRUFFUSxtQkFBbUIsRUFBRSxhQUFhLGNBQWMsR0FBbUIsYUFBOEIsVUFBZ0Q7QUFDeEosVUFBTSxPQUFPO0FBQ2IsVUFBTSxjQUFjLEtBQUs7QUFDekIsVUFBTSxpQkFBaUIsS0FBSyxPQUFPO0FBQ25DLGFBQVMsZUFBZSxTQUE0QjtBQUNuRCxZQUFNLGFBQWEsYUFBYSxNQUFNLFFBQVEsSUFBSSxXQUFTLE1BQU0sUUFBUSxDQUFDO0FBQzFFLGVBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxRQUFRLElBQUksR0FBRyxLQUFLO0FBQy9DLGNBQU0sUUFBUSxRQUFRLENBQUM7QUFDdkIsY0FBTSxFQUFFLGNBQWMsU0FBUyxJQUFJO0FBTW5DLFlBQUksWUFBWSxvQkFBb0IsY0FBYyxVQUFVLENBQUMsUUFBUSxPQUFPLGFBQWEsVUFBVSxjQUFjLElBQUksYUFBYSxNQUFTLEdBQUc7QUFDN0k7QUFBQSxRQUNEO0FBRUEsY0FBTSxNQUFNLGNBQWMsWUFBWTtBQUN0QyxZQUFJLEtBQUs7QUFDUix5QkFBZSxHQUFHO0FBQUEsUUFDbkIsT0FBTztBQUNOLGNBQUksUUFBUSxPQUFPLGNBQWMsYUFBYSxjQUFjLEdBQUc7QUFDOUQ7QUFBQSxVQUNEO0FBRUEsZUFBSyxVQUFVLFVBQVUsS0FBSztBQUFBLFFBQy9CO0FBRUEsWUFBSSxLQUFLLFlBQVk7QUFDcEI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxtQkFBZSxXQUFXO0FBQUEsRUFDM0I7QUFBQSxFQUVRLFVBQVUsVUFBZ0QsV0FBcUM7QUFDdEcsUUFBSSxDQUFDLEtBQUssa0JBQW1CLFVBQVUsZ0JBQWdCLEtBQUssZUFBZSxVQUFVLGNBQWMsVUFBVSxRQUFRLEdBQUk7QUFDeEgsVUFBSSxLQUFLLFVBQVcsS0FBSyxjQUFjLEtBQUssZUFBZSxLQUFLLFlBQWE7QUFDNUUsYUFBSyxhQUFhO0FBQ2xCLGFBQUssT0FBTztBQUFBLE1BQ2I7QUFFQSxVQUFJLENBQUMsS0FBSyxZQUFZO0FBQ3JCLGlCQUFTLFNBQVM7QUFBQSxNQUNuQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFVQSxNQUFNLGlCQUFpQjtBQUFBLEVBSXRCLGNBQWM7QUFDYixTQUFLLE9BQU8sSUFBSSxPQUFPO0FBQ3ZCLFNBQUssY0FBYyxJQUFJLHdCQUF3QjtBQUFBLEVBQ2hEO0FBQUEsRUFFQSxJQUFXLE1BQU07QUFDaEIsUUFBSSxLQUFLLE1BQU07QUFDZCxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBRUEsVUFBTSxJQUFJLE1BQU0sdUNBQXVDO0FBQUEsRUFDeEQ7QUFBQSxFQUVBLFNBQVM7QUFDUixTQUFLLFlBQVksT0FBTztBQUN4QixTQUFLLE9BQU87QUFBQSxFQUNiO0FBQ0Q7QUFFTyxNQUFNLHFCQUFOLE1BQU0sbUJBQWtCO0FBQUEsRUFBeEI7QUFJTixTQUFpQixXQUFXLG9CQUFJLElBQThCO0FBQUE7QUFBQSxFQUU5RCxXQUFXLFFBQW9CLFVBQStCLFNBQTBDLE9BQXlEO0FBQ2hLLFVBQU0scUJBQXFCLEtBQUssc0JBQXNCLE9BQU8sUUFBUTtBQUNyRSxVQUFNLFNBQVMsSUFBSSxpQkFBaUIsUUFBUSxVQUFVLGtCQUFrQjtBQUV4RSxRQUFJLGNBQWM7QUFDbEIsVUFBTSxtQkFBbUIsQ0FBQyxVQUFnQztBQUN6RCxxQkFBZSxNQUFNO0FBQ3JCLGNBQVEsTUFBTSxJQUFJLE9BQUssS0FBSyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUNyRDtBQUVBLFdBQU8sS0FBSyxTQUFTLFFBQVEsbUJBQWtCLFlBQVksa0JBQWtCLEtBQUssRUFBRTtBQUFBLE1BQ25GLFlBQVU7QUFDVCxlQUFPO0FBQUEsVUFDTixVQUFVLE9BQU87QUFBQSxVQUNqQixPQUFPLE9BQU8sUUFBUTtBQUFBLFlBQ3JCLFdBQVc7QUFBQSxZQUNYLE1BQU07QUFBQSxZQUNOO0FBQUEsWUFDQSxhQUFhLE9BQU87QUFBQSxVQUNyQixJQUFJO0FBQUEsVUFDSixVQUFVLENBQUM7QUFBQSxRQUNaO0FBQUEsTUFDRDtBQUFBLElBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxXQUFXLFVBQXdCO0FBRWxDLFNBQUssU0FBUyxJQUFJLFFBQVEsR0FBRyxPQUFPO0FBRXBDLFNBQUssU0FBUyxPQUFPLFFBQVE7QUFBQSxFQUM5QjtBQUFBLEVBRVEsc0JBQXNCLFVBQTREO0FBQ3pGLFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLENBQUMsS0FBSyxTQUFTLElBQUksUUFBUSxHQUFHO0FBQ2pDLFdBQUssU0FBUyxJQUFJLFVBQVUsSUFBSSxpQkFBaUIsQ0FBQztBQUFBLElBQ25EO0FBRUEsV0FBTyxLQUFLLFNBQVMsSUFBSSxRQUFRO0FBQUEsRUFDbEM7QUFBQSxFQUVRLHFCQUFxQixPQUF1QztBQUNuRSxRQUFJLE1BQU0sY0FBYztBQUN2QixhQUFPO0FBQUEsUUFDTixVQUFVLFVBQVUsU0FBUyxNQUFNLE1BQU0sTUFBTSxZQUFZO0FBQUEsTUFDNUQ7QUFBQSxJQUNELE9BQU87QUFFTixhQUFPO0FBQUEsUUFDTixVQUFVLE1BQU07QUFBQSxNQUNqQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxTQUFTLFFBQTBCLFdBQW1CLGVBQXdELE9BQTREO0FBQ2pMLFVBQU0sV0FBVyxNQUFNLHdCQUF3QixNQUFNO0FBQ3BELGFBQU8sT0FBTztBQUFBLElBQ2YsQ0FBQztBQUVELFVBQU0sWUFBWSxDQUFDLFVBQThCO0FBQ2hELFVBQUksT0FBTztBQUNWLGNBQU0sS0FBSyxLQUFLO0FBQ2hCLFlBQUksWUFBWSxLQUFLLE1BQU0sVUFBVSxXQUFXO0FBQy9DLHdCQUFjLEtBQUs7QUFDbkIsa0JBQVEsQ0FBQztBQUFBLFFBQ1Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksUUFBOEIsQ0FBQztBQUNuQyxXQUFPLE9BQU8sT0FBTyxTQUFTLEVBQUUsS0FBSyxZQUFVO0FBQzlDLFVBQUksTUFBTSxRQUFRO0FBQ2pCLHNCQUFjLEtBQUs7QUFBQSxNQUNwQjtBQUVBLGVBQVMsUUFBUTtBQUNqQixhQUFPO0FBQUEsSUFDUixHQUFHLFdBQVM7QUFDWCxVQUFJLE1BQU0sUUFBUTtBQUNqQixzQkFBYyxLQUFLO0FBQUEsTUFDcEI7QUFFQSxlQUFTLFFBQVE7QUFDakIsYUFBTyxRQUFRLE9BQU8sS0FBSztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUEvRmEsbUJBRVksYUFBYTtBQUYvQixJQUFNLG9CQUFOOyIsCiAgIm5hbWVzIjogW10KfQo=
