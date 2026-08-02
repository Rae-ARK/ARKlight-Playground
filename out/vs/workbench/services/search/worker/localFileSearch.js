import * as glob from "../../../../base/common/glob.js";
import { URI } from "../../../../base/common/uri.js";
import { LocalFileSearchWorkerHost } from "../common/localFileSearchWorkerTypes.js";
import * as paths from "../../../../base/common/path.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { getFileResults } from "../common/getFileResults.js";
import { IgnoreFile } from "../common/ignoreFile.js";
import { createRegExp } from "../../../../base/common/strings.js";
import { Promises } from "../../../../base/common/async.js";
import { ExtUri } from "../../../../base/common/resources.js";
import { revive } from "../../../../base/common/marshalling.js";
const PERF = false;
const globalStart = +/* @__PURE__ */ new Date();
const itrcount = {};
const time = async (name, task) => {
  if (!PERF) {
    return task();
  }
  const start = Date.now();
  const itr = (itrcount[name] ?? 0) + 1;
  console.info(name, itr, "starting", Math.round((start - globalStart) * 10) / 1e4);
  itrcount[name] = itr;
  const r = await task();
  const end = Date.now();
  console.info(name, itr, "took", end - start);
  return r;
};
function create(workerServer) {
  return new LocalFileSearchWorker(workerServer);
}
class LocalFileSearchWorker {
  constructor(workerServer) {
    this._requestHandlerBrand = void 0;
    this.cancellationTokens = /* @__PURE__ */ new Map();
    this.host = LocalFileSearchWorkerHost.getChannel(workerServer);
  }
  $cancelQuery(queryId) {
    this.cancellationTokens.get(queryId)?.cancel();
  }
  registerCancellationToken(queryId) {
    const source = new CancellationTokenSource();
    this.cancellationTokens.set(queryId, source);
    return source;
  }
  async $listDirectory(handle, query, folderQuery, ignorePathCasing, queryId) {
    const revivedFolderQuery = reviveFolderQuery(folderQuery);
    const extUri = new ExtUri(() => ignorePathCasing);
    const token = this.registerCancellationToken(queryId);
    const entries = [];
    let limitHit = false;
    let count = 0;
    const max = query.maxResults || 512;
    const filePatternMatcher = query.filePattern ? (name) => query.filePattern.split("").every((c) => name.includes(c)) : (name) => true;
    await time("listDirectory", () => this.walkFolderQuery(handle, reviveQueryProps(query), revivedFolderQuery, extUri, (file) => {
      if (!filePatternMatcher(file.name)) {
        return;
      }
      count++;
      if (max && count > max) {
        limitHit = true;
        token.cancel();
      }
      return entries.push(file.path);
    }, token.token));
    return {
      results: entries,
      limitHit
    };
  }
  async $searchDirectory(handle, query, folderQuery, ignorePathCasing, queryId) {
    const revivedQuery = reviveFolderQuery(folderQuery);
    const extUri = new ExtUri(() => ignorePathCasing);
    return time("searchInFiles", async () => {
      const token = this.registerCancellationToken(queryId);
      const results = [];
      const pattern = createSearchRegExp(query.contentPattern);
      const onGoingProcesses = [];
      let fileCount = 0;
      let resultCount = 0;
      const limitHit = false;
      const processFile = async (file) => {
        if (token.token.isCancellationRequested) {
          return;
        }
        fileCount++;
        const contents = await file.resolve();
        if (token.token.isCancellationRequested) {
          return;
        }
        const bytes = new Uint8Array(contents);
        const fileResults = getFileResults(bytes, pattern, {
          surroundingContext: query.surroundingContext ?? 0,
          previewOptions: query.previewOptions,
          remainingResultQuota: query.maxResults ? query.maxResults - resultCount : 1e4
        });
        if (fileResults.length) {
          resultCount += fileResults.length;
          if (query.maxResults && resultCount > query.maxResults) {
            token.cancel();
          }
          const match = {
            resource: URI.joinPath(revivedQuery.folder, file.path),
            results: fileResults
          };
          this.host.$sendTextSearchMatch(match, queryId);
          results.push(match);
        }
      };
      await time(
        "walkFolderToResolve",
        () => this.walkFolderQuery(handle, reviveQueryProps(query), revivedQuery, extUri, async (file) => onGoingProcesses.push(processFile(file)), token.token)
      );
      await time("resolveOngoingProcesses", () => Promise.all(onGoingProcesses));
      if (PERF) {
        console.log("Searched in", fileCount, "files");
      }
      return {
        results,
        limitHit
      };
    });
  }
  async walkFolderQuery(handle, queryProps, folderQuery, extUri, onFile, token) {
    const ignoreGlobCase = queryProps.ignoreGlobCase || folderQuery.ignoreGlobCase;
    const globOptions = { trimForExclusions: true, ignoreCase: ignoreGlobCase };
    const folderExcludes = folderQuery.excludePattern?.map((excludePattern) => glob.parse(excludePattern.pattern ?? {}, globOptions));
    const evalFolderExcludes = (path, basename, hasSibling) => {
      return folderExcludes?.some((folderExclude) => {
        return folderExclude(path, basename, hasSibling);
      });
    };
    const isFolderExcluded = (path, basename, hasSibling) => {
      path = path.slice(1);
      if (evalFolderExcludes(path, basename, hasSibling)) {
        return true;
      }
      if (pathExcludedInQuery(queryProps, path)) {
        return true;
      }
      return false;
    };
    const isFileIncluded = (path, basename, hasSibling) => {
      path = path.slice(1);
      if (evalFolderExcludes(path, basename, hasSibling)) {
        return false;
      }
      if (!pathIncludedInQuery(queryProps, path, extUri)) {
        return false;
      }
      return true;
    };
    const processFile = (file, prior) => {
      const resolved = {
        type: "file",
        name: file.name,
        path: prior,
        resolve: () => file.getFile().then((r) => r.arrayBuffer())
      };
      return resolved;
    };
    const isFileSystemDirectoryHandle = (handle2) => {
      return handle2.kind === "directory";
    };
    const isFileSystemFileHandle = (handle2) => {
      return handle2.kind === "file";
    };
    const processDirectory = async (directory, prior, ignoreFile) => {
      if (!folderQuery.disregardIgnoreFiles) {
        const ignoreFiles = await Promise.all([
          directory.getFileHandle(".gitignore").catch((e) => void 0),
          directory.getFileHandle(".ignore").catch((e) => void 0)
        ]);
        await Promise.all(ignoreFiles.map(async (file) => {
          if (!file) {
            return;
          }
          const ignoreContents = new TextDecoder("utf8").decode(new Uint8Array(await (await file.getFile()).arrayBuffer()));
          ignoreFile = new IgnoreFile(ignoreContents, prior, ignoreFile, ignoreGlobCase);
        }));
      }
      const entries = Promises.withAsyncBody(async (c) => {
        const files = [];
        const dirs = [];
        const entries2 = [];
        const sibilings = /* @__PURE__ */ new Set();
        for await (const entry of directory.entries()) {
          entries2.push(entry);
          sibilings.add(entry[0]);
        }
        for (const [basename, handle2] of entries2) {
          if (token.isCancellationRequested) {
            break;
          }
          const path = prior + basename;
          if (ignoreFile && !ignoreFile.isPathIncludedInTraversal(path, handle2.kind === "directory")) {
            continue;
          }
          const hasSibling = (query) => sibilings.has(query);
          if (isFileSystemDirectoryHandle(handle2) && !isFolderExcluded(path, basename, hasSibling)) {
            dirs.push(processDirectory(handle2, path + "/", ignoreFile));
          } else if (isFileSystemFileHandle(handle2) && isFileIncluded(path, basename, hasSibling)) {
            files.push(processFile(handle2, path));
          }
        }
        c([...await Promise.all(dirs), ...files]);
      });
      return {
        type: "dir",
        name: directory.name,
        entries
      };
    };
    const resolveDirectory = async (directory, onFile2) => {
      if (token.isCancellationRequested) {
        return;
      }
      await Promise.all(
        (await directory.entries).sort((a, b) => -(a.type === "dir" ? 0 : 1) + (b.type === "dir" ? 0 : 1)).map(async (entry) => {
          if (entry.type === "dir") {
            return resolveDirectory(entry, onFile2);
          } else {
            return onFile2(entry);
          }
        })
      );
    };
    const processed = await time("process", () => processDirectory(handle, "/"));
    await time("resolve", () => resolveDirectory(processed, onFile));
  }
}
function createSearchRegExp(options) {
  return createRegExp(options.pattern, !!options.isRegExp, {
    wholeWord: options.isWordMatch,
    global: true,
    matchCase: options.isCaseSensitive,
    multiline: true,
    unicode: true
  });
}
function reviveFolderQuery(folderQuery) {
  return revive({
    ...revive(folderQuery),
    excludePattern: folderQuery.excludePattern?.map((ep) => ({ folder: URI.revive(ep.folder), pattern: ep.pattern })),
    folder: URI.revive(folderQuery.folder)
  });
}
function reviveQueryProps(queryProps) {
  return {
    ...queryProps,
    extraFileResources: queryProps.extraFileResources?.map((r) => URI.revive(r)),
    folderQueries: queryProps.folderQueries.map((fq) => reviveFolderQuery(fq))
  };
}
function pathExcludedInQuery(queryProps, fsPath) {
  const globOptions = queryProps.ignoreGlobCase ? { ignoreCase: true } : void 0;
  if (queryProps.excludePattern && glob.match(queryProps.excludePattern, fsPath, globOptions)) {
    return true;
  }
  return false;
}
function pathIncludedInQuery(queryProps, path, extUri) {
  const globOptions = queryProps.ignoreGlobCase ? { ignoreCase: true } : void 0;
  if (queryProps.excludePattern && glob.match(queryProps.excludePattern, path, globOptions)) {
    return false;
  }
  if (queryProps.includePattern || queryProps.usingSearchPaths) {
    if (queryProps.includePattern && glob.match(queryProps.includePattern, path, globOptions)) {
      return true;
    }
    if (queryProps.usingSearchPaths) {
      return !!queryProps.folderQueries && queryProps.folderQueries.some((fq) => {
        const searchPath = fq.folder;
        const uri = URI.file(path);
        if (extUri.isEqualOrParent(uri, searchPath)) {
          const relPath = paths.relative(searchPath.path, uri.path);
          return !fq.includePattern || !!glob.match(fq.includePattern, relPath, globOptions);
        } else {
          return false;
        }
      });
    }
    return false;
  }
  return true;
}
export {
  LocalFileSearchWorker,
  create
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvd29ya2VyL2xvY2FsRmlsZVNlYXJjaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGdsb2IgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBVcmlDb21wb25lbnRzLCBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyLCBJV2ViV29ya2VyU2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vd29ya2VyL3dlYldvcmtlci5qcyc7XG5pbXBvcnQgeyBJTG9jYWxGaWxlU2VhcmNoV29ya2VyLCBMb2NhbEZpbGVTZWFyY2hXb3JrZXJIb3N0LCBJV29ya2VyRmlsZVNlYXJjaENvbXBsZXRlLCBJV29ya2VyRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSwgSVdvcmtlckZpbGVTeXN0ZW1IYW5kbGUsIElXb3JrZXJUZXh0U2VhcmNoQ29tcGxldGUgfSBmcm9tICcuLi9jb21tb24vbG9jYWxGaWxlU2VhcmNoV29ya2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1vblF1ZXJ5UHJvcHMsIElGaWxlTWF0Y2gsIElGaWxlUXVlcnlQcm9wcywgSUZvbGRlclF1ZXJ5LCBJUGF0dGVybkluZm8sIElUZXh0UXVlcnlQcm9wcywgfSBmcm9tICcuLi9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCAqIGFzIHBhdGhzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGdldEZpbGVSZXN1bHRzIH0gZnJvbSAnLi4vY29tbW9uL2dldEZpbGVSZXN1bHRzLmpzJztcbmltcG9ydCB7IElnbm9yZUZpbGUgfSBmcm9tICcuLi9jb21tb24vaWdub3JlRmlsZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZWdFeHAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcblxuY29uc3QgUEVSRiA9IGZhbHNlO1xuXG50eXBlIEZpbGVOb2RlID0ge1xuXHR0eXBlOiAnZmlsZSc7XG5cdG5hbWU6IHN0cmluZztcblx0cGF0aDogc3RyaW5nO1xuXHRyZXNvbHZlOiAoKSA9PiBQcm9taXNlPEFycmF5QnVmZmVyPjtcbn07XG5cbnR5cGUgRGlyTm9kZSA9IHtcblx0dHlwZTogJ2Rpcic7XG5cdG5hbWU6IHN0cmluZztcblx0ZW50cmllczogUHJvbWlzZTwoRGlyTm9kZSB8IEZpbGVOb2RlKVtdPjtcbn07XG5cbmNvbnN0IGdsb2JhbFN0YXJ0ID0gK25ldyBEYXRlKCk7XG5jb25zdCBpdHJjb3VudDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuY29uc3QgdGltZSA9IGFzeW5jIDxUPihuYW1lOiBzdHJpbmcsIHRhc2s6ICgpID0+IFByb21pc2U8VD4gfCBUKSA9PiB7XG5cdGlmICghUEVSRikgeyByZXR1cm4gdGFzaygpOyB9XG5cblx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRjb25zdCBpdHIgPSAoaXRyY291bnRbbmFtZV0gPz8gMCkgKyAxO1xuXHRjb25zb2xlLmluZm8obmFtZSwgaXRyLCAnc3RhcnRpbmcnLCBNYXRoLnJvdW5kKChzdGFydCAtIGdsb2JhbFN0YXJ0KSAqIDEwKSAvIDEwMDAwKTtcblxuXHRpdHJjb3VudFtuYW1lXSA9IGl0cjtcblx0Y29uc3QgciA9IGF3YWl0IHRhc2soKTtcblx0Y29uc3QgZW5kID0gRGF0ZS5ub3coKTtcblx0Y29uc29sZS5pbmZvKG5hbWUsIGl0ciwgJ3Rvb2snLCBlbmQgLSBzdGFydCk7XG5cdHJldHVybiByO1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZSh3b3JrZXJTZXJ2ZXI6IElXZWJXb3JrZXJTZXJ2ZXIpOiBJV2ViV29ya2VyU2VydmVyUmVxdWVzdEhhbmRsZXIge1xuXHRyZXR1cm4gbmV3IExvY2FsRmlsZVNlYXJjaFdvcmtlcih3b3JrZXJTZXJ2ZXIpO1xufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxGaWxlU2VhcmNoV29ya2VyIGltcGxlbWVudHMgSUxvY2FsRmlsZVNlYXJjaFdvcmtlciwgSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyIHtcblx0X3JlcXVlc3RIYW5kbGVyQnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBob3N0OiBMb2NhbEZpbGVTZWFyY2hXb3JrZXJIb3N0O1xuXHRjYW5jZWxsYXRpb25Ub2tlbnM6IE1hcDxudW1iZXIsIENhbmNlbGxhdGlvblRva2VuU291cmNlPiA9IG5ldyBNYXAoKTtcblxuXHRjb25zdHJ1Y3Rvcih3b3JrZXJTZXJ2ZXI6IElXZWJXb3JrZXJTZXJ2ZXIpIHtcblx0XHR0aGlzLmhvc3QgPSBMb2NhbEZpbGVTZWFyY2hXb3JrZXJIb3N0LmdldENoYW5uZWwod29ya2VyU2VydmVyKTtcblx0fVxuXG5cdCRjYW5jZWxRdWVyeShxdWVyeUlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbGxhdGlvblRva2Vucy5nZXQocXVlcnlJZCk/LmNhbmNlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNhbmNlbGxhdGlvblRva2VuKHF1ZXJ5SWQ6IG51bWJlcik6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHtcblx0XHRjb25zdCBzb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLmNhbmNlbGxhdGlvblRva2Vucy5zZXQocXVlcnlJZCwgc291cmNlKTtcblx0XHRyZXR1cm4gc291cmNlO1xuXHR9XG5cblx0YXN5bmMgJGxpc3REaXJlY3RvcnkoaGFuZGxlOiBJV29ya2VyRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSwgcXVlcnk6IElGaWxlUXVlcnlQcm9wczxVcmlDb21wb25lbnRzPiwgZm9sZGVyUXVlcnk6IElGb2xkZXJRdWVyeTxVcmlDb21wb25lbnRzPiwgaWdub3JlUGF0aENhc2luZzogYm9vbGVhbiwgcXVlcnlJZDogbnVtYmVyKTogUHJvbWlzZTxJV29ya2VyRmlsZVNlYXJjaENvbXBsZXRlPiB7XG5cdFx0Y29uc3QgcmV2aXZlZEZvbGRlclF1ZXJ5ID0gcmV2aXZlRm9sZGVyUXVlcnkoZm9sZGVyUXVlcnkpO1xuXHRcdGNvbnN0IGV4dFVyaSA9IG5ldyBFeHRVcmkoKCkgPT4gaWdub3JlUGF0aENhc2luZyk7XG5cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMucmVnaXN0ZXJDYW5jZWxsYXRpb25Ub2tlbihxdWVyeUlkKTtcblx0XHRjb25zdCBlbnRyaWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBsaW1pdEhpdCA9IGZhbHNlO1xuXHRcdGxldCBjb3VudCA9IDA7XG5cblx0XHRjb25zdCBtYXggPSBxdWVyeS5tYXhSZXN1bHRzIHx8IDUxMjtcblxuXHRcdGNvbnN0IGZpbGVQYXR0ZXJuTWF0Y2hlciA9IHF1ZXJ5LmZpbGVQYXR0ZXJuXG5cdFx0XHQ/IChuYW1lOiBzdHJpbmcpID0+IHF1ZXJ5LmZpbGVQYXR0ZXJuIS5zcGxpdCgnJykuZXZlcnkoYyA9PiBuYW1lLmluY2x1ZGVzKGMpKVxuXHRcdFx0OiAobmFtZTogc3RyaW5nKSA9PiB0cnVlO1xuXG5cdFx0YXdhaXQgdGltZSgnbGlzdERpcmVjdG9yeScsICgpID0+IHRoaXMud2Fsa0ZvbGRlclF1ZXJ5KGhhbmRsZSwgcmV2aXZlUXVlcnlQcm9wcyhxdWVyeSksIHJldml2ZWRGb2xkZXJRdWVyeSwgZXh0VXJpLCBmaWxlID0+IHtcblx0XHRcdGlmICghZmlsZVBhdHRlcm5NYXRjaGVyKGZpbGUubmFtZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb3VudCsrO1xuXG5cdFx0XHRpZiAobWF4ICYmIGNvdW50ID4gbWF4KSB7XG5cdFx0XHRcdGxpbWl0SGl0ID0gdHJ1ZTtcblx0XHRcdFx0dG9rZW4uY2FuY2VsKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZW50cmllcy5wdXNoKGZpbGUucGF0aCk7XG5cdFx0fSwgdG9rZW4udG9rZW4pKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN1bHRzOiBlbnRyaWVzLFxuXHRcdFx0bGltaXRIaXRcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgJHNlYXJjaERpcmVjdG9yeShoYW5kbGU6IElXb3JrZXJGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlLCBxdWVyeTogSVRleHRRdWVyeVByb3BzPFVyaUNvbXBvbmVudHM+LCBmb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5PFVyaUNvbXBvbmVudHM+LCBpZ25vcmVQYXRoQ2FzaW5nOiBib29sZWFuLCBxdWVyeUlkOiBudW1iZXIpOiBQcm9taXNlPElXb3JrZXJUZXh0U2VhcmNoQ29tcGxldGU+IHtcblx0XHRjb25zdCByZXZpdmVkUXVlcnkgPSByZXZpdmVGb2xkZXJRdWVyeShmb2xkZXJRdWVyeSk7XG5cdFx0Y29uc3QgZXh0VXJpID0gbmV3IEV4dFVyaSgoKSA9PiBpZ25vcmVQYXRoQ2FzaW5nKTtcblxuXHRcdHJldHVybiB0aW1lKCdzZWFyY2hJbkZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSB0aGlzLnJlZ2lzdGVyQ2FuY2VsbGF0aW9uVG9rZW4ocXVlcnlJZCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdHM6IElGaWxlTWF0Y2hbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBwYXR0ZXJuID0gY3JlYXRlU2VhcmNoUmVnRXhwKHF1ZXJ5LmNvbnRlbnRQYXR0ZXJuKTtcblxuXHRcdFx0Y29uc3Qgb25Hb2luZ1Byb2Nlc3NlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cblx0XHRcdGxldCBmaWxlQ291bnQgPSAwO1xuXHRcdFx0bGV0IHJlc3VsdENvdW50ID0gMDtcblx0XHRcdGNvbnN0IGxpbWl0SGl0ID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IHByb2Nlc3NGaWxlID0gYXN5bmMgKGZpbGU6IEZpbGVOb2RlKSA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZpbGVDb3VudCsrO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgZmlsZS5yZXNvbHZlKCk7XG5cdFx0XHRcdGlmICh0b2tlbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoY29udGVudHMpO1xuXHRcdFx0XHRjb25zdCBmaWxlUmVzdWx0cyA9IGdldEZpbGVSZXN1bHRzKGJ5dGVzLCBwYXR0ZXJuLCB7XG5cdFx0XHRcdFx0c3Vycm91bmRpbmdDb250ZXh0OiBxdWVyeS5zdXJyb3VuZGluZ0NvbnRleHQgPz8gMCxcblx0XHRcdFx0XHRwcmV2aWV3T3B0aW9uczogcXVlcnkucHJldmlld09wdGlvbnMsXG5cdFx0XHRcdFx0cmVtYWluaW5nUmVzdWx0UXVvdGE6IHF1ZXJ5Lm1heFJlc3VsdHMgPyAocXVlcnkubWF4UmVzdWx0cyAtIHJlc3VsdENvdW50KSA6IDEwMDAwLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoZmlsZVJlc3VsdHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmVzdWx0Q291bnQgKz0gZmlsZVJlc3VsdHMubGVuZ3RoO1xuXHRcdFx0XHRcdGlmIChxdWVyeS5tYXhSZXN1bHRzICYmIHJlc3VsdENvdW50ID4gcXVlcnkubWF4UmVzdWx0cykge1xuXHRcdFx0XHRcdFx0dG9rZW4uY2FuY2VsKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG1hdGNoID0ge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5qb2luUGF0aChyZXZpdmVkUXVlcnkuZm9sZGVyLCBmaWxlLnBhdGgpLFxuXHRcdFx0XHRcdFx0cmVzdWx0czogZmlsZVJlc3VsdHMsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0aGlzLmhvc3QuJHNlbmRUZXh0U2VhcmNoTWF0Y2gobWF0Y2gsIHF1ZXJ5SWQpO1xuXHRcdFx0XHRcdHJlc3VsdHMucHVzaChtYXRjaCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHRpbWUoJ3dhbGtGb2xkZXJUb1Jlc29sdmUnLCAoKSA9PlxuXHRcdFx0XHR0aGlzLndhbGtGb2xkZXJRdWVyeShoYW5kbGUsIHJldml2ZVF1ZXJ5UHJvcHMocXVlcnkpLCByZXZpdmVkUXVlcnksIGV4dFVyaSwgYXN5bmMgZmlsZSA9PiBvbkdvaW5nUHJvY2Vzc2VzLnB1c2gocHJvY2Vzc0ZpbGUoZmlsZSkpLCB0b2tlbi50b2tlbilcblx0XHRcdCk7XG5cblx0XHRcdGF3YWl0IHRpbWUoJ3Jlc29sdmVPbmdvaW5nUHJvY2Vzc2VzJywgKCkgPT4gUHJvbWlzZS5hbGwob25Hb2luZ1Byb2Nlc3NlcykpO1xuXG5cdFx0XHRpZiAoUEVSRikgeyBjb25zb2xlLmxvZygnU2VhcmNoZWQgaW4nLCBmaWxlQ291bnQsICdmaWxlcycpOyB9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc3VsdHMsXG5cdFx0XHRcdGxpbWl0SGl0LFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3YWxrRm9sZGVyUXVlcnkoaGFuZGxlOiBJV29ya2VyRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZSwgcXVlcnlQcm9wczogSUNvbW1vblF1ZXJ5UHJvcHM8VVJJPiwgZm9sZGVyUXVlcnk6IElGb2xkZXJRdWVyeTxVUkk+LCBleHRVcmk6IEV4dFVyaSwgb25GaWxlOiAoZmlsZTogRmlsZU5vZGUpID0+IFByb21pc2U8dW5rbm93bj4gfCB1bmtub3duLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGlnbm9yZUdsb2JDYXNlID0gcXVlcnlQcm9wcy5pZ25vcmVHbG9iQ2FzZSB8fCBmb2xkZXJRdWVyeS5pZ25vcmVHbG9iQ2FzZTtcblx0XHRjb25zdCBnbG9iT3B0aW9ucyA9IHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUsIGlnbm9yZUNhc2U6IGlnbm9yZUdsb2JDYXNlIH07XG5cdFx0Y29uc3QgZm9sZGVyRXhjbHVkZXMgPSBmb2xkZXJRdWVyeS5leGNsdWRlUGF0dGVybj8ubWFwKGV4Y2x1ZGVQYXR0ZXJuID0+IGdsb2IucGFyc2UoZXhjbHVkZVBhdHRlcm4ucGF0dGVybiA/PyB7fSwgZ2xvYk9wdGlvbnMpIGFzIGdsb2IuUGFyc2VkRXhwcmVzc2lvbik7XG5cblx0XHRjb25zdCBldmFsRm9sZGVyRXhjbHVkZXMgPSAocGF0aDogc3RyaW5nLCBiYXNlbmFtZTogc3RyaW5nLCBoYXNTaWJsaW5nOiAocXVlcnk6IHN0cmluZykgPT4gYm9vbGVhbikgPT4ge1xuXHRcdFx0cmV0dXJuIGZvbGRlckV4Y2x1ZGVzPy5zb21lKGZvbGRlckV4Y2x1ZGUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZm9sZGVyRXhjbHVkZShwYXRoLCBiYXNlbmFtZSwgaGFzU2libGluZyk7XG5cdFx0XHR9KTtcblxuXHRcdH07XG5cdFx0Ly8gRm9yIGZvbGRlcnMsIG9ubHkgY2hlY2sgaWYgdGhlIGZvbGRlciBpcyBleHBsaWNpdGx5IGV4Y2x1ZGVkIHNvIHdhbGtpbmcgY29udGludWVzLlxuXHRcdGNvbnN0IGlzRm9sZGVyRXhjbHVkZWQgPSAocGF0aDogc3RyaW5nLCBiYXNlbmFtZTogc3RyaW5nLCBoYXNTaWJsaW5nOiAocXVlcnk6IHN0cmluZykgPT4gYm9vbGVhbikgPT4ge1xuXHRcdFx0cGF0aCA9IHBhdGguc2xpY2UoMSk7XG5cdFx0XHRpZiAoZXZhbEZvbGRlckV4Y2x1ZGVzKHBhdGgsIGJhc2VuYW1lLCBoYXNTaWJsaW5nKSkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0aWYgKHBhdGhFeGNsdWRlZEluUXVlcnkocXVlcnlQcm9wcywgcGF0aCkpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0Ly8gRm9yIGZpbGVzIGVuc3VyZSB0aGUgZnVsbCBjaGVjayB0YWtlcyBwbGFjZS5cblx0XHRjb25zdCBpc0ZpbGVJbmNsdWRlZCA9IChwYXRoOiBzdHJpbmcsIGJhc2VuYW1lOiBzdHJpbmcsIGhhc1NpYmxpbmc6IChxdWVyeTogc3RyaW5nKSA9PiBib29sZWFuKSA9PiB7XG5cdFx0XHRwYXRoID0gcGF0aC5zbGljZSgxKTtcblx0XHRcdGlmIChldmFsRm9sZGVyRXhjbHVkZXMocGF0aCwgYmFzZW5hbWUsIGhhc1NpYmxpbmcpKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0aWYgKCFwYXRoSW5jbHVkZWRJblF1ZXJ5KHF1ZXJ5UHJvcHMsIHBhdGgsIGV4dFVyaSkpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvY2Vzc0ZpbGUgPSAoZmlsZTogRmlsZVN5c3RlbUZpbGVIYW5kbGUsIHByaW9yOiBzdHJpbmcpOiBGaWxlTm9kZSA9PiB7XG5cblx0XHRcdGNvbnN0IHJlc29sdmVkOiBGaWxlTm9kZSA9IHtcblx0XHRcdFx0dHlwZTogJ2ZpbGUnLFxuXHRcdFx0XHRuYW1lOiBmaWxlLm5hbWUsXG5cdFx0XHRcdHBhdGg6IHByaW9yLFxuXHRcdFx0XHRyZXNvbHZlOiAoKSA9PiBmaWxlLmdldEZpbGUoKS50aGVuKHIgPT4gci5hcnJheUJ1ZmZlcigpKVxuXHRcdFx0fSBhcyBjb25zdDtcblxuXHRcdFx0cmV0dXJuIHJlc29sdmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCBpc0ZpbGVTeXN0ZW1EaXJlY3RvcnlIYW5kbGUgPSAoaGFuZGxlOiBJV29ya2VyRmlsZVN5c3RlbUhhbmRsZSk6IGhhbmRsZSBpcyBGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlID0+IHtcblx0XHRcdHJldHVybiBoYW5kbGUua2luZCA9PT0gJ2RpcmVjdG9yeSc7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGlzRmlsZVN5c3RlbUZpbGVIYW5kbGUgPSAoaGFuZGxlOiBJV29ya2VyRmlsZVN5c3RlbUhhbmRsZSk6IGhhbmRsZSBpcyBGaWxlU3lzdGVtRmlsZUhhbmRsZSA9PiB7XG5cdFx0XHRyZXR1cm4gaGFuZGxlLmtpbmQgPT09ICdmaWxlJztcblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvY2Vzc0RpcmVjdG9yeSA9IGFzeW5jIChkaXJlY3Rvcnk6IElXb3JrZXJGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlLCBwcmlvcjogc3RyaW5nLCBpZ25vcmVGaWxlPzogSWdub3JlRmlsZSk6IFByb21pc2U8RGlyTm9kZT4gPT4ge1xuXG5cdFx0XHRpZiAoIWZvbGRlclF1ZXJ5LmRpc3JlZ2FyZElnbm9yZUZpbGVzKSB7XG5cdFx0XHRcdGNvbnN0IGlnbm9yZUZpbGVzID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdGRpcmVjdG9yeS5nZXRGaWxlSGFuZGxlKCcuZ2l0aWdub3JlJykuY2F0Y2goZSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0XHRcdGRpcmVjdG9yeS5nZXRGaWxlSGFuZGxlKCcuaWdub3JlJykuY2F0Y2goZSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChpZ25vcmVGaWxlcy5tYXAoYXN5bmMgZmlsZSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFmaWxlKSB7IHJldHVybjsgfVxuXG5cdFx0XHRcdFx0Y29uc3QgaWdub3JlQ29udGVudHMgPSBuZXcgVGV4dERlY29kZXIoJ3V0ZjgnKS5kZWNvZGUobmV3IFVpbnQ4QXJyYXkoYXdhaXQgKGF3YWl0IGZpbGUuZ2V0RmlsZSgpKS5hcnJheUJ1ZmZlcigpKSk7XG5cdFx0XHRcdFx0aWdub3JlRmlsZSA9IG5ldyBJZ25vcmVGaWxlKGlnbm9yZUNvbnRlbnRzLCBwcmlvciwgaWdub3JlRmlsZSwgaWdub3JlR2xvYkNhc2UpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVudHJpZXMgPSBQcm9taXNlcy53aXRoQXN5bmNCb2R5PChGaWxlTm9kZSB8IERpck5vZGUpW10+KGFzeW5jIGMgPT4ge1xuXHRcdFx0XHRjb25zdCBmaWxlczogRmlsZU5vZGVbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBkaXJzOiBQcm9taXNlPERpck5vZGU+W10gPSBbXTtcblxuXHRcdFx0XHRjb25zdCBlbnRyaWVzOiBbc3RyaW5nLCBJV29ya2VyRmlsZVN5c3RlbUhhbmRsZV1bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBzaWJpbGluZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGVudHJ5IG9mIGRpcmVjdG9yeS5lbnRyaWVzKCkpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goZW50cnkpO1xuXHRcdFx0XHRcdHNpYmlsaW5ncy5hZGQoZW50cnlbMF0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBbYmFzZW5hbWUsIGhhbmRsZV0gb2YgZW50cmllcykge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcGF0aCA9IHByaW9yICsgYmFzZW5hbWU7XG5cblx0XHRcdFx0XHRpZiAoaWdub3JlRmlsZSAmJiAhaWdub3JlRmlsZS5pc1BhdGhJbmNsdWRlZEluVHJhdmVyc2FsKHBhdGgsIGhhbmRsZS5raW5kID09PSAnZGlyZWN0b3J5JykpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGhhc1NpYmxpbmcgPSAocXVlcnk6IHN0cmluZykgPT4gc2liaWxpbmdzLmhhcyhxdWVyeSk7XG5cblx0XHRcdFx0XHRpZiAoaXNGaWxlU3lzdGVtRGlyZWN0b3J5SGFuZGxlKGhhbmRsZSkgJiYgIWlzRm9sZGVyRXhjbHVkZWQocGF0aCwgYmFzZW5hbWUsIGhhc1NpYmxpbmcpKSB7XG5cdFx0XHRcdFx0XHRkaXJzLnB1c2gocHJvY2Vzc0RpcmVjdG9yeShoYW5kbGUsIHBhdGggKyAnLycsIGlnbm9yZUZpbGUpKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzRmlsZVN5c3RlbUZpbGVIYW5kbGUoaGFuZGxlKSAmJiBpc0ZpbGVJbmNsdWRlZChwYXRoLCBiYXNlbmFtZSwgaGFzU2libGluZykpIHtcblx0XHRcdFx0XHRcdGZpbGVzLnB1c2gocHJvY2Vzc0ZpbGUoaGFuZGxlLCBwYXRoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGMoWy4uLmF3YWl0IFByb21pc2UuYWxsKGRpcnMpLCAuLi5maWxlc10pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdkaXInLFxuXHRcdFx0XHRuYW1lOiBkaXJlY3RvcnkubmFtZSxcblx0XHRcdFx0ZW50cmllc1xuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzb2x2ZURpcmVjdG9yeSA9IGFzeW5jIChkaXJlY3Rvcnk6IERpck5vZGUsIG9uRmlsZTogKGY6IEZpbGVOb2RlKSA9PiBQcm9taXNlPHVua25vd24+IHwgdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7IHJldHVybjsgfVxuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChcblx0XHRcdFx0KGF3YWl0IGRpcmVjdG9yeS5lbnRyaWVzKVxuXHRcdFx0XHRcdC5zb3J0KChhLCBiKSA9PiAtKGEudHlwZSA9PT0gJ2RpcicgPyAwIDogMSkgKyAoYi50eXBlID09PSAnZGlyJyA/IDAgOiAxKSlcblx0XHRcdFx0XHQubWFwKGFzeW5jIGVudHJ5ID0+IHtcblx0XHRcdFx0XHRcdGlmIChlbnRyeS50eXBlID09PSAnZGlyJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZURpcmVjdG9yeShlbnRyeSwgb25GaWxlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gb25GaWxlKGVudHJ5KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb2Nlc3NlZCA9IGF3YWl0IHRpbWUoJ3Byb2Nlc3MnLCAoKSA9PiBwcm9jZXNzRGlyZWN0b3J5KGhhbmRsZSwgJy8nKSk7XG5cdFx0YXdhaXQgdGltZSgncmVzb2x2ZScsICgpID0+IHJlc29sdmVEaXJlY3RvcnkocHJvY2Vzc2VkLCBvbkZpbGUpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTZWFyY2hSZWdFeHAob3B0aW9uczogSVBhdHRlcm5JbmZvKTogUmVnRXhwIHtcblx0cmV0dXJuIGNyZWF0ZVJlZ0V4cChvcHRpb25zLnBhdHRlcm4sICEhb3B0aW9ucy5pc1JlZ0V4cCwge1xuXHRcdHdob2xlV29yZDogb3B0aW9ucy5pc1dvcmRNYXRjaCxcblx0XHRnbG9iYWw6IHRydWUsXG5cdFx0bWF0Y2hDYXNlOiBvcHRpb25zLmlzQ2FzZVNlbnNpdGl2ZSxcblx0XHRtdWx0aWxpbmU6IHRydWUsXG5cdFx0dW5pY29kZTogdHJ1ZSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJldml2ZUZvbGRlclF1ZXJ5KGZvbGRlclF1ZXJ5OiBJRm9sZGVyUXVlcnk8VXJpQ29tcG9uZW50cz4pOiBJRm9sZGVyUXVlcnk8VVJJPiB7XG5cdC8vIEB0b2RvOiBhbmRyZWEgLSB0cnkgdG8gc2VlIHdoeSB3ZSBjYW4ndCBqdXN0IGNhbGwgJ3Jldml2ZScgaGVyZVxuXHRyZXR1cm4gcmV2aXZlKHtcblx0XHQuLi5yZXZpdmUoZm9sZGVyUXVlcnkpLFxuXHRcdGV4Y2x1ZGVQYXR0ZXJuOiBmb2xkZXJRdWVyeS5leGNsdWRlUGF0dGVybj8ubWFwKGVwID0+ICh7IGZvbGRlcjogVVJJLnJldml2ZShlcC5mb2xkZXIpLCBwYXR0ZXJuOiBlcC5wYXR0ZXJuIH0pKSxcblx0XHRmb2xkZXI6IFVSSS5yZXZpdmUoZm9sZGVyUXVlcnkuZm9sZGVyKSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJldml2ZVF1ZXJ5UHJvcHMocXVlcnlQcm9wczogSUNvbW1vblF1ZXJ5UHJvcHM8VXJpQ29tcG9uZW50cz4pOiBJQ29tbW9uUXVlcnlQcm9wczxVUkk+IHtcblx0cmV0dXJuIHtcblx0XHQuLi5xdWVyeVByb3BzLFxuXHRcdGV4dHJhRmlsZVJlc291cmNlczogcXVlcnlQcm9wcy5leHRyYUZpbGVSZXNvdXJjZXM/Lm1hcChyID0+IFVSSS5yZXZpdmUocikpLFxuXHRcdGZvbGRlclF1ZXJpZXM6IHF1ZXJ5UHJvcHMuZm9sZGVyUXVlcmllcy5tYXAoZnEgPT4gcmV2aXZlRm9sZGVyUXVlcnkoZnEpKSxcblx0fTtcbn1cblxuXG5mdW5jdGlvbiBwYXRoRXhjbHVkZWRJblF1ZXJ5KHF1ZXJ5UHJvcHM6IElDb21tb25RdWVyeVByb3BzPFVSST4sIGZzUGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IGdsb2JPcHRpb25zID0gcXVlcnlQcm9wcy5pZ25vcmVHbG9iQ2FzZSA/IHsgaWdub3JlQ2FzZTogdHJ1ZSB9IDogdW5kZWZpbmVkO1xuXHRpZiAocXVlcnlQcm9wcy5leGNsdWRlUGF0dGVybiAmJiBnbG9iLm1hdGNoKHF1ZXJ5UHJvcHMuZXhjbHVkZVBhdHRlcm4sIGZzUGF0aCwgZ2xvYk9wdGlvbnMpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBwYXRoSW5jbHVkZWRJblF1ZXJ5KHF1ZXJ5UHJvcHM6IElDb21tb25RdWVyeVByb3BzPFVSST4sIHBhdGg6IHN0cmluZywgZXh0VXJpOiBFeHRVcmkpOiBib29sZWFuIHtcblx0Y29uc3QgZ2xvYk9wdGlvbnMgPSBxdWVyeVByb3BzLmlnbm9yZUdsb2JDYXNlID8geyBpZ25vcmVDYXNlOiB0cnVlIH0gOiB1bmRlZmluZWQ7XG5cdGlmIChxdWVyeVByb3BzLmV4Y2x1ZGVQYXR0ZXJuICYmIGdsb2IubWF0Y2gocXVlcnlQcm9wcy5leGNsdWRlUGF0dGVybiwgcGF0aCwgZ2xvYk9wdGlvbnMpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKHF1ZXJ5UHJvcHMuaW5jbHVkZVBhdHRlcm4gfHwgcXVlcnlQcm9wcy51c2luZ1NlYXJjaFBhdGhzKSB7XG5cdFx0aWYgKHF1ZXJ5UHJvcHMuaW5jbHVkZVBhdHRlcm4gJiYgZ2xvYi5tYXRjaChxdWVyeVByb3BzLmluY2x1ZGVQYXR0ZXJuLCBwYXRoLCBnbG9iT3B0aW9ucykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIElmIHNlYXJjaFBhdGhzIGFyZSBiZWluZyB1c2VkLCB0aGUgZXh0cmEgZmlsZSBtdXN0IGJlIGluIGEgc3ViZm9sZGVyIGFuZCBtYXRjaCB0aGUgcGF0dGVybiwgaWYgcHJlc2VudFxuXHRcdGlmIChxdWVyeVByb3BzLnVzaW5nU2VhcmNoUGF0aHMpIHtcblxuXHRcdFx0cmV0dXJuICEhcXVlcnlQcm9wcy5mb2xkZXJRdWVyaWVzICYmIHF1ZXJ5UHJvcHMuZm9sZGVyUXVlcmllcy5zb21lKGZxID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VhcmNoUGF0aCA9IGZxLmZvbGRlcjtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUocGF0aCk7XG5cdFx0XHRcdGlmIChleHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgc2VhcmNoUGF0aCkpIHtcblx0XHRcdFx0XHRjb25zdCByZWxQYXRoID0gcGF0aHMucmVsYXRpdmUoc2VhcmNoUGF0aC5wYXRoLCB1cmkucGF0aCk7XG5cdFx0XHRcdFx0cmV0dXJuICFmcS5pbmNsdWRlUGF0dGVybiB8fCAhIWdsb2IubWF0Y2goZnEuaW5jbHVkZVBhdHRlcm4sIHJlbFBhdGgsIGdsb2JPcHRpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxVQUFVO0FBQ3RCLFNBQXdCLFdBQVc7QUFFbkMsU0FBaUMsaUNBQWtKO0FBRW5MLFlBQVksV0FBVztBQUN2QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsY0FBYztBQUV2QixNQUFN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
