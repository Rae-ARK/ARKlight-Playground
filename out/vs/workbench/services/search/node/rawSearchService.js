import * as arrays from "../../../../base/common/arrays.js";
import { createCancelablePromise } from "../../../../base/common/async.js";
import { canceled } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { compareItemsByFuzzyScore, prepareQuery } from "../../../../base/common/fuzzyScorer.js";
import { revive } from "../../../../base/common/marshalling.js";
import { basename, dirname, join, sep } from "../../../../base/common/path.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import { ByteSize } from "../../../../platform/files/common/files.js";
import { DEFAULT_MAX_SEARCH_RESULTS, isFilePatternMatch } from "../common/search.js";
import { Engine as FileSearchEngine } from "./fileSearch.js";
import { TextSearchEngineAdapter } from "./textSearchAdapter.js";
const _SearchService = class _SearchService {
  constructor(processType = "searchProcess", getNumThreads) {
    this.processType = processType;
    this.getNumThreads = getNumThreads;
    this.caches = /* @__PURE__ */ Object.create(null);
  }
  fileSearch(config) {
    let promise;
    const query = reviveQuery(config);
    const emitter = new Emitter({
      onDidAddFirstListener: () => {
        promise = createCancelablePromise(async (token) => {
          const numThreads = await this.getNumThreads?.();
          return this.doFileSearchWithEngine(FileSearchEngine, query, (p) => emitter.fire(p), token, _SearchService.BATCH_SIZE, numThreads);
        });
        promise.then(
          (c) => emitter.fire(c),
          (err) => emitter.fire({ type: "error", error: { message: err.message, stack: err.stack } })
        );
      },
      onDidRemoveLastListener: () => {
        promise.cancel();
      }
    });
    return emitter.event;
  }
  textSearch(rawQuery) {
    let promise;
    const query = reviveQuery(rawQuery);
    const emitter = new Emitter({
      onDidAddFirstListener: () => {
        promise = createCancelablePromise((token) => {
          return this.ripgrepTextSearch(query, (p) => emitter.fire(p), token);
        });
        promise.then(
          (c) => emitter.fire(c),
          (err) => emitter.fire({ type: "error", error: { message: err.message, stack: err.stack } })
        );
      },
      onDidRemoveLastListener: () => {
        promise.cancel();
      }
    });
    return emitter.event;
  }
  async ripgrepTextSearch(config, progressCallback, token) {
    config.maxFileSize = this.getPlatformFileLimits().maxFileSize;
    const numThreads = await this.getNumThreads?.();
    const engine = new TextSearchEngineAdapter(config, numThreads);
    return engine.search(token, progressCallback, progressCallback);
  }
  getPlatformFileLimits() {
    return {
      maxFileSize: 16 * ByteSize.GB
    };
  }
  doFileSearch(config, numThreads, progressCallback, token) {
    return this.doFileSearchWithEngine(FileSearchEngine, config, progressCallback, token, _SearchService.BATCH_SIZE, numThreads);
  }
  doFileSearchWithEngine(EngineClass, config, progressCallback, token, batchSize = _SearchService.BATCH_SIZE, threads) {
    let resultCount = 0;
    const fileProgressCallback = (progress) => {
      if (Array.isArray(progress)) {
        resultCount += progress.length;
        progressCallback(progress.map((m) => this.rawMatchToSearchItem(m)));
      } else if (progress.relativePath) {
        resultCount++;
        progressCallback(this.rawMatchToSearchItem(progress));
      } else {
        progressCallback(progress);
      }
    };
    if (config.sortByScore) {
      let sortedSearch = this.trySortedSearchFromCache(config, fileProgressCallback, token);
      if (!sortedSearch) {
        const walkerConfig = config.maxResults ? Object.assign({}, config, { maxResults: null }) : config;
        const engine2 = new EngineClass(walkerConfig, threads);
        sortedSearch = this.doSortedSearch(engine2, config, progressCallback, fileProgressCallback, token);
      }
      return new Promise((c, e) => {
        sortedSearch.then(([result, rawMatches]) => {
          const serializedMatches = rawMatches.map((rawMatch) => this.rawMatchToSearchItem(rawMatch));
          this.sendProgress(serializedMatches, progressCallback, batchSize);
          c(result);
        }, e);
      });
    }
    const engine = new EngineClass(config, threads);
    return this.doSearch(engine, fileProgressCallback, batchSize, token).then((complete) => {
      return {
        limitHit: complete.limitHit,
        type: "success",
        stats: {
          detailStats: complete.stats,
          type: this.processType,
          fromCache: false,
          resultCount,
          sortingTime: void 0
        },
        messages: []
      };
    });
  }
  rawMatchToSearchItem(match) {
    return { path: match.base ? join(match.base, match.relativePath) : match.relativePath };
  }
  doSortedSearch(engine, config, progressCallback, fileProgressCallback, token) {
    const emitter = new Emitter();
    let allResultsPromise = createCancelablePromise((token2) => {
      let results = [];
      const innerProgressCallback = (progress) => {
        if (Array.isArray(progress)) {
          results = progress;
        } else {
          fileProgressCallback(progress);
          emitter.fire(progress);
        }
      };
      return this.doSearch(engine, innerProgressCallback, -1, token2).then((result) => {
        return [result, results];
      });
    });
    let cache;
    if (config.cacheKey) {
      cache = this.getOrCreateCache(config.cacheKey);
      const cacheRow = {
        promise: allResultsPromise,
        event: emitter.event,
        resolved: false
      };
      cache.resultsToSearchCache[config.filePattern || ""] = cacheRow;
      allResultsPromise.then(() => {
        cacheRow.resolved = true;
      }, (err) => {
        delete cache.resultsToSearchCache[config.filePattern || ""];
      });
      allResultsPromise = this.preventCancellation(allResultsPromise);
    }
    return allResultsPromise.then(([result, results]) => {
      const scorerCache = cache ? cache.scorerCache : /* @__PURE__ */ Object.create(null);
      const sortSW = (typeof config.maxResults !== "number" || config.maxResults > 0) && StopWatch.create(false);
      return this.sortResults(config, results, scorerCache, token).then((sortedResults) => {
        const sortingTime = sortSW ? sortSW.elapsed() : -1;
        return [{
          type: "success",
          stats: {
            detailStats: result.stats,
            sortingTime,
            fromCache: false,
            type: this.processType,
            resultCount: sortedResults.length
          },
          messages: result.messages,
          limitHit: result.limitHit || typeof config.maxResults === "number" && results.length > config.maxResults
        }, sortedResults];
      });
    });
  }
  getOrCreateCache(cacheKey) {
    const existing = this.caches[cacheKey];
    if (existing) {
      return existing;
    }
    return this.caches[cacheKey] = new Cache();
  }
  trySortedSearchFromCache(config, progressCallback, token) {
    const cache = config.cacheKey && this.caches[config.cacheKey];
    if (!cache) {
      return void 0;
    }
    const cached = this.getResultsFromCache(cache, config.filePattern || "", progressCallback, token);
    if (cached) {
      return cached.then(([result, results, cacheStats]) => {
        const sortSW = StopWatch.create(false);
        return this.sortResults(config, results, cache.scorerCache, token).then((sortedResults) => {
          const sortingTime = sortSW.elapsed();
          const stats = {
            fromCache: true,
            detailStats: cacheStats,
            type: this.processType,
            resultCount: results.length,
            sortingTime
          };
          return [
            {
              type: "success",
              limitHit: result.limitHit || typeof config.maxResults === "number" && results.length > config.maxResults,
              stats,
              messages: []
            },
            sortedResults
          ];
        });
      });
    }
    return void 0;
  }
  sortResults(config, results, scorerCache, token) {
    const query = prepareQuery(config.filePattern || "");
    const compare = (matchA, matchB) => compareItemsByFuzzyScore(matchA, matchB, query, true, FileMatchItemAccessor, scorerCache);
    const maxResults = typeof config.maxResults === "number" ? config.maxResults : DEFAULT_MAX_SEARCH_RESULTS;
    return arrays.topAsync(results, compare, maxResults, 1e4, token);
  }
  sendProgress(results, progressCb, batchSize) {
    if (batchSize && batchSize > 0) {
      for (let i = 0; i < results.length; i += batchSize) {
        progressCb(results.slice(i, i + batchSize));
      }
    } else {
      progressCb(results);
    }
  }
  getResultsFromCache(cache, searchValue, progressCallback, token) {
    const cacheLookupSW = StopWatch.create(false);
    const hasPathSep = searchValue.indexOf(sep) >= 0;
    let cachedRow;
    for (const previousSearch in cache.resultsToSearchCache) {
      if (searchValue.startsWith(previousSearch)) {
        if (hasPathSep && previousSearch.indexOf(sep) < 0 && previousSearch !== "") {
          continue;
        }
        const row = cache.resultsToSearchCache[previousSearch];
        cachedRow = {
          promise: this.preventCancellation(row.promise),
          event: row.event,
          resolved: row.resolved
        };
        break;
      }
    }
    if (!cachedRow) {
      return null;
    }
    const cacheLookupTime = cacheLookupSW.elapsed();
    const cacheFilterSW = StopWatch.create(false);
    const listener = cachedRow.event(progressCallback);
    if (token) {
      token.onCancellationRequested(() => {
        listener.dispose();
      });
    }
    return cachedRow.promise.then(([complete, cachedEntries]) => {
      if (token && token.isCancellationRequested) {
        throw canceled();
      }
      const results = [];
      const normalizedSearchValueLowercase = prepareQuery(searchValue).normalizedLowercase;
      for (const entry of cachedEntries) {
        if (!isFilePatternMatch(entry, normalizedSearchValueLowercase)) {
          continue;
        }
        results.push(entry);
      }
      return [complete, results, {
        cacheWasResolved: cachedRow.resolved,
        cacheLookupTime,
        cacheFilterTime: cacheFilterSW.elapsed(),
        cacheEntryCount: cachedEntries.length
      }];
    });
  }
  doSearch(engine, progressCallback, batchSize, token) {
    return new Promise((c, e) => {
      let batch = [];
      token?.onCancellationRequested(() => engine.cancel());
      engine.search((match) => {
        if (match) {
          if (batchSize) {
            batch.push(match);
            if (batchSize > 0 && batch.length >= batchSize) {
              progressCallback(batch);
              batch = [];
            }
          } else {
            progressCallback(match);
          }
        }
      }, (progress) => {
        progressCallback(progress);
      }, (error, complete) => {
        if (batch.length) {
          progressCallback(batch);
        }
        if (error) {
          progressCallback({ message: "Search finished. Error: " + error.message });
          e(error);
        } else {
          progressCallback({ message: "Search finished. Stats: " + JSON.stringify(complete.stats) });
          c(complete);
        }
      });
    });
  }
  clearCache(cacheKey) {
    delete this.caches[cacheKey];
    return Promise.resolve(void 0);
  }
  /**
   * Return a CancelablePromise which is not actually cancelable
   * TODO@rob - Is this really needed?
   */
  preventCancellation(promise) {
    return new class {
      get [Symbol.toStringTag]() {
        return this.toString();
      }
      cancel() {
      }
      then(resolve, reject) {
        return promise.then(resolve, reject);
      }
      catch(reject) {
        return this.then(void 0, reject);
      }
      finally(onFinally) {
        return promise.finally(onFinally);
      }
    }();
  }
};
_SearchService.BATCH_SIZE = 512;
let SearchService = _SearchService;
class Cache {
  constructor() {
    this.resultsToSearchCache = /* @__PURE__ */ Object.create(null);
    this.scorerCache = /* @__PURE__ */ Object.create(null);
  }
}
const FileMatchItemAccessor = new class {
  getItemLabel(match) {
    return basename(match.relativePath);
  }
  getItemDescription(match) {
    return dirname(match.relativePath);
  }
  getItemPath(match) {
    return match.relativePath;
  }
}();
function reviveQuery(rawQuery) {
  return {
    // eslint-disable-next-line local/code-no-any-casts
    ...rawQuery,
    // TODO
    ...{
      folderQueries: rawQuery.folderQueries && rawQuery.folderQueries.map(reviveFolderQuery),
      extraFileResources: rawQuery.extraFileResources && rawQuery.extraFileResources.map((components) => URI.revive(components))
    }
  };
}
function reviveFolderQuery(rawFolderQuery) {
  return revive(rawFolderQuery);
}
export {
  SearchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvbm9kZS9yYXdTZWFyY2hTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjYW5jZWxlZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbXBhcmVJdGVtc0J5RnV6enlTY29yZSwgRnV6enlTY29yZXJDYWNoZSwgSUl0ZW1BY2Nlc3NvciwgcHJlcGFyZVF1ZXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZnV6enlTY29yZXIuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGpvaW4sIHNlcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX01BWF9TRUFSQ0hfUkVTVUxUUywgSUNhY2hlZFNlYXJjaFN0YXRzLCBJRmlsZVF1ZXJ5LCBJRmlsZVNlYXJjaFByb2dyZXNzSXRlbSwgSUZpbGVTZWFyY2hTdGF0cywgSUZvbGRlclF1ZXJ5LCBJUHJvZ3Jlc3NNZXNzYWdlLCBJUmF3RmlsZU1hdGNoLCBJUmF3RmlsZVF1ZXJ5LCBJUmF3UXVlcnksIElSYXdTZWFyY2hTZXJ2aWNlLCBJUmF3VGV4dFF1ZXJ5LCBJU2VhcmNoRW5naW5lLCBJU2VhcmNoRW5naW5lU3VjY2VzcywgSVNlcmlhbGl6ZWRGaWxlTWF0Y2gsIElTZXJpYWxpemVkU2VhcmNoQ29tcGxldGUsIElTZXJpYWxpemVkU2VhcmNoUHJvZ3Jlc3NJdGVtLCBJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3MsIGlzRmlsZVBhdHRlcm5NYXRjaCwgSVRleHRRdWVyeSB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgRW5naW5lIGFzIEZpbGVTZWFyY2hFbmdpbmUgfSBmcm9tICcuL2ZpbGVTZWFyY2guanMnO1xuaW1wb3J0IHsgVGV4dFNlYXJjaEVuZ2luZUFkYXB0ZXIgfSBmcm9tICcuL3RleHRTZWFyY2hBZGFwdGVyLmpzJztcblxuZXhwb3J0IHR5cGUgSVByb2dyZXNzQ2FsbGJhY2sgPSAocDogSVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHZvaWQ7XG50eXBlIElGaWxlUHJvZ3Jlc3NDYWxsYmFjayA9IChwOiBJRmlsZVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZDtcblxuZXhwb3J0IGNsYXNzIFNlYXJjaFNlcnZpY2UgaW1wbGVtZW50cyBJUmF3U2VhcmNoU2VydmljZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQkFUQ0hfU0laRSA9IDUxMjtcblxuXHRwcml2YXRlIGNhY2hlczogeyBbY2FjaGVLZXk6IHN0cmluZ106IENhY2hlIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgcHJvY2Vzc1R5cGU6IElGaWxlU2VhcmNoU3RhdHNbJ3R5cGUnXSA9ICdzZWFyY2hQcm9jZXNzJywgcHJpdmF0ZSByZWFkb25seSBnZXROdW1UaHJlYWRzPzogKCkgPT4gUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+KSB7IH1cblxuXHRmaWxlU2VhcmNoKGNvbmZpZzogSVJhd0ZpbGVRdWVyeSk6IEV2ZW50PElTZXJpYWxpemVkU2VhcmNoUHJvZ3Jlc3NJdGVtIHwgSVNlcmlhbGl6ZWRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdGxldCBwcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3M+O1xuXG5cdFx0Y29uc3QgcXVlcnkgPSByZXZpdmVRdWVyeShjb25maWcpO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJU2VyaWFsaXplZFNlYXJjaFByb2dyZXNzSXRlbSB8IElTZXJpYWxpemVkU2VhcmNoQ29tcGxldGU+KHtcblx0XHRcdG9uRGlkQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHRwcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG51bVRocmVhZHMgPSBhd2FpdCB0aGlzLmdldE51bVRocmVhZHM/LigpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmRvRmlsZVNlYXJjaFdpdGhFbmdpbmUoRmlsZVNlYXJjaEVuZ2luZSwgcXVlcnksIHAgPT4gZW1pdHRlci5maXJlKHApLCB0b2tlbiwgU2VhcmNoU2VydmljZS5CQVRDSF9TSVpFLCBudW1UaHJlYWRzKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cHJvbWlzZS50aGVuKFxuXHRcdFx0XHRcdGMgPT4gZW1pdHRlci5maXJlKGMpLFxuXHRcdFx0XHRcdGVyciA9PiBlbWl0dGVyLmZpcmUoeyB0eXBlOiAnZXJyb3InLCBlcnJvcjogeyBtZXNzYWdlOiBlcnIubWVzc2FnZSwgc3RhY2s6IGVyci5zdGFjayB9IH0pKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHRwcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGVtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHR0ZXh0U2VhcmNoKHJhd1F1ZXJ5OiBJUmF3VGV4dFF1ZXJ5KTogRXZlbnQ8SVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0gfCBJU2VyaWFsaXplZFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0bGV0IHByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPElTZXJpYWxpemVkU2VhcmNoQ29tcGxldGU+O1xuXG5cdFx0Y29uc3QgcXVlcnkgPSByZXZpdmVRdWVyeShyYXdRdWVyeSk7XG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPElTZXJpYWxpemVkU2VhcmNoUHJvZ3Jlc3NJdGVtIHwgSVNlcmlhbGl6ZWRTZWFyY2hDb21wbGV0ZT4oe1xuXHRcdFx0b25EaWRBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRcdHByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucmlwZ3JlcFRleHRTZWFyY2gocXVlcnksIHAgPT4gZW1pdHRlci5maXJlKHApLCB0b2tlbik7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHByb21pc2UudGhlbihcblx0XHRcdFx0XHRjID0+IGVtaXR0ZXIuZmlyZShjKSxcblx0XHRcdFx0XHRlcnIgPT4gZW1pdHRlci5maXJlKHsgdHlwZTogJ2Vycm9yJywgZXJyb3I6IHsgbWVzc2FnZTogZXJyLm1lc3NhZ2UsIHN0YWNrOiBlcnIuc3RhY2sgfSB9KSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0cHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBlbWl0dGVyLmV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByaXBncmVwVGV4dFNlYXJjaChjb25maWc6IElUZXh0UXVlcnksIHByb2dyZXNzQ2FsbGJhY2s6IElQcm9ncmVzc0NhbGxiYWNrLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZXJpYWxpemVkU2VhcmNoU3VjY2Vzcz4ge1xuXHRcdGNvbmZpZy5tYXhGaWxlU2l6ZSA9IHRoaXMuZ2V0UGxhdGZvcm1GaWxlTGltaXRzKCkubWF4RmlsZVNpemU7XG5cdFx0Y29uc3QgbnVtVGhyZWFkcyA9IGF3YWl0IHRoaXMuZ2V0TnVtVGhyZWFkcz8uKCk7XG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IFRleHRTZWFyY2hFbmdpbmVBZGFwdGVyKGNvbmZpZywgbnVtVGhyZWFkcyk7XG5cblx0XHRyZXR1cm4gZW5naW5lLnNlYXJjaCh0b2tlbiwgcHJvZ3Jlc3NDYWxsYmFjaywgcHJvZ3Jlc3NDYWxsYmFjayk7XG5cdH1cblxuXHRwcml2YXRlIGdldFBsYXRmb3JtRmlsZUxpbWl0cygpOiB7IHJlYWRvbmx5IG1heEZpbGVTaXplOiBudW1iZXIgfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1heEZpbGVTaXplOiAxNiAqIEJ5dGVTaXplLkdCXG5cdFx0fTtcblx0fVxuXG5cdGRvRmlsZVNlYXJjaChjb25maWc6IElGaWxlUXVlcnksIG51bVRocmVhZHM6IG51bWJlciB8IHVuZGVmaW5lZCwgcHJvZ3Jlc3NDYWxsYmFjazogSVByb2dyZXNzQ2FsbGJhY2ssIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZXJpYWxpemVkU2VhcmNoU3VjY2Vzcz4ge1xuXHRcdHJldHVybiB0aGlzLmRvRmlsZVNlYXJjaFdpdGhFbmdpbmUoRmlsZVNlYXJjaEVuZ2luZSwgY29uZmlnLCBwcm9ncmVzc0NhbGxiYWNrLCB0b2tlbiwgU2VhcmNoU2VydmljZS5CQVRDSF9TSVpFLCBudW1UaHJlYWRzKTtcblx0fVxuXG5cdGRvRmlsZVNlYXJjaFdpdGhFbmdpbmUoRW5naW5lQ2xhc3M6IHsgbmV3KGNvbmZpZzogSUZpbGVRdWVyeSwgbnVtVGhyZWFkcz86IG51bWJlciB8IHVuZGVmaW5lZCk6IElTZWFyY2hFbmdpbmU8SVJhd0ZpbGVNYXRjaD4gfSwgY29uZmlnOiBJRmlsZVF1ZXJ5LCBwcm9ncmVzc0NhbGxiYWNrOiBJUHJvZ3Jlc3NDYWxsYmFjaywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiwgYmF0Y2hTaXplID0gU2VhcmNoU2VydmljZS5CQVRDSF9TSVpFLCB0aHJlYWRzPzogbnVtYmVyKTogUHJvbWlzZTxJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3M+IHtcblx0XHRsZXQgcmVzdWx0Q291bnQgPSAwO1xuXHRcdGNvbnN0IGZpbGVQcm9ncmVzc0NhbGxiYWNrOiBJRmlsZVByb2dyZXNzQ2FsbGJhY2sgPSBwcm9ncmVzcyA9PiB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwcm9ncmVzcykpIHtcblx0XHRcdFx0cmVzdWx0Q291bnQgKz0gcHJvZ3Jlc3MubGVuZ3RoO1xuXHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKHByb2dyZXNzLm1hcChtID0+IHRoaXMucmF3TWF0Y2hUb1NlYXJjaEl0ZW0obSkpKTtcblx0XHRcdH0gZWxzZSBpZiAoKDxJUmF3RmlsZU1hdGNoPnByb2dyZXNzKS5yZWxhdGl2ZVBhdGgpIHtcblx0XHRcdFx0cmVzdWx0Q291bnQrKztcblx0XHRcdFx0cHJvZ3Jlc3NDYWxsYmFjayh0aGlzLnJhd01hdGNoVG9TZWFyY2hJdGVtKDxJUmF3RmlsZU1hdGNoPnByb2dyZXNzKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKDxJUHJvZ3Jlc3NNZXNzYWdlPnByb2dyZXNzKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKGNvbmZpZy5zb3J0QnlTY29yZSkge1xuXHRcdFx0bGV0IHNvcnRlZFNlYXJjaCA9IHRoaXMudHJ5U29ydGVkU2VhcmNoRnJvbUNhY2hlKGNvbmZpZywgZmlsZVByb2dyZXNzQ2FsbGJhY2ssIHRva2VuKTtcblx0XHRcdGlmICghc29ydGVkU2VhcmNoKSB7XG5cdFx0XHRcdGNvbnN0IHdhbGtlckNvbmZpZyA9IGNvbmZpZy5tYXhSZXN1bHRzID8gT2JqZWN0LmFzc2lnbih7fSwgY29uZmlnLCB7IG1heFJlc3VsdHM6IG51bGwgfSkgOiBjb25maWc7XG5cdFx0XHRcdGNvbnN0IGVuZ2luZSA9IG5ldyBFbmdpbmVDbGFzcyh3YWxrZXJDb25maWcsIHRocmVhZHMpO1xuXHRcdFx0XHRzb3J0ZWRTZWFyY2ggPSB0aGlzLmRvU29ydGVkU2VhcmNoKGVuZ2luZSwgY29uZmlnLCBwcm9ncmVzc0NhbGxiYWNrLCBmaWxlUHJvZ3Jlc3NDYWxsYmFjaywgdG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8SVNlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzPigoYywgZSkgPT4ge1xuXHRcdFx0XHRzb3J0ZWRTZWFyY2gudGhlbigoW3Jlc3VsdCwgcmF3TWF0Y2hlc10pID0+IHtcblx0XHRcdFx0XHRjb25zdCBzZXJpYWxpemVkTWF0Y2hlcyA9IHJhd01hdGNoZXMubWFwKHJhd01hdGNoID0+IHRoaXMucmF3TWF0Y2hUb1NlYXJjaEl0ZW0ocmF3TWF0Y2gpKTtcblx0XHRcdFx0XHR0aGlzLnNlbmRQcm9ncmVzcyhzZXJpYWxpemVkTWF0Y2hlcywgcHJvZ3Jlc3NDYWxsYmFjaywgYmF0Y2hTaXplKTtcblx0XHRcdFx0XHRjKHJlc3VsdCk7XG5cdFx0XHRcdH0sIGUpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5naW5lID0gbmV3IEVuZ2luZUNsYXNzKGNvbmZpZywgdGhyZWFkcyk7XG5cblx0XHRyZXR1cm4gdGhpcy5kb1NlYXJjaChlbmdpbmUsIGZpbGVQcm9ncmVzc0NhbGxiYWNrLCBiYXRjaFNpemUsIHRva2VuKS50aGVuKGNvbXBsZXRlID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxpbWl0SGl0OiBjb21wbGV0ZS5saW1pdEhpdCxcblx0XHRcdFx0dHlwZTogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRzdGF0czoge1xuXHRcdFx0XHRcdGRldGFpbFN0YXRzOiBjb21wbGV0ZS5zdGF0cyxcblx0XHRcdFx0XHR0eXBlOiB0aGlzLnByb2Nlc3NUeXBlLFxuXHRcdFx0XHRcdGZyb21DYWNoZTogZmFsc2UsXG5cdFx0XHRcdFx0cmVzdWx0Q291bnQsXG5cdFx0XHRcdFx0c29ydGluZ1RpbWU6IHVuZGVmaW5lZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZXNzYWdlczogW11cblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJhd01hdGNoVG9TZWFyY2hJdGVtKG1hdGNoOiBJUmF3RmlsZU1hdGNoKTogSVNlcmlhbGl6ZWRGaWxlTWF0Y2gge1xuXHRcdHJldHVybiB7IHBhdGg6IG1hdGNoLmJhc2UgPyBqb2luKG1hdGNoLmJhc2UsIG1hdGNoLnJlbGF0aXZlUGF0aCkgOiBtYXRjaC5yZWxhdGl2ZVBhdGggfTtcblx0fVxuXG5cdHByaXZhdGUgZG9Tb3J0ZWRTZWFyY2goZW5naW5lOiBJU2VhcmNoRW5naW5lPElSYXdGaWxlTWF0Y2g+LCBjb25maWc6IElGaWxlUXVlcnksIHByb2dyZXNzQ2FsbGJhY2s6IElQcm9ncmVzc0NhbGxiYWNrLCBmaWxlUHJvZ3Jlc3NDYWxsYmFjazogSUZpbGVQcm9ncmVzc0NhbGxiYWNrLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxbSVNlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzLCBJUmF3RmlsZU1hdGNoW11dPiB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPElGaWxlU2VhcmNoUHJvZ3Jlc3NJdGVtPigpO1xuXG5cdFx0bGV0IGFsbFJlc3VsdHNQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4ge1xuXHRcdFx0bGV0IHJlc3VsdHM6IElSYXdGaWxlTWF0Y2hbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBpbm5lclByb2dyZXNzQ2FsbGJhY2s6IElGaWxlUHJvZ3Jlc3NDYWxsYmFjayA9IHByb2dyZXNzID0+IHtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocHJvZ3Jlc3MpKSB7XG5cdFx0XHRcdFx0cmVzdWx0cyA9IHByb2dyZXNzO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZpbGVQcm9ncmVzc0NhbGxiYWNrKHByb2dyZXNzKTtcblx0XHRcdFx0XHRlbWl0dGVyLmZpcmUocHJvZ3Jlc3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5kb1NlYXJjaChlbmdpbmUsIGlubmVyUHJvZ3Jlc3NDYWxsYmFjaywgLTEsIHRva2VuKVxuXHRcdFx0XHQudGhlbjxbSVNlYXJjaEVuZ2luZVN1Y2Nlc3MsIElSYXdGaWxlTWF0Y2hbXV0+KHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIFtyZXN1bHQsIHJlc3VsdHNdO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGxldCBjYWNoZTogQ2FjaGU7XG5cdFx0aWYgKGNvbmZpZy5jYWNoZUtleSkge1xuXHRcdFx0Y2FjaGUgPSB0aGlzLmdldE9yQ3JlYXRlQ2FjaGUoY29uZmlnLmNhY2hlS2V5KTtcblx0XHRcdGNvbnN0IGNhY2hlUm93OiBJQ2FjaGVSb3cgPSB7XG5cdFx0XHRcdHByb21pc2U6IGFsbFJlc3VsdHNQcm9taXNlLFxuXHRcdFx0XHRldmVudDogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0cmVzb2x2ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0Y2FjaGUucmVzdWx0c1RvU2VhcmNoQ2FjaGVbY29uZmlnLmZpbGVQYXR0ZXJuIHx8ICcnXSA9IGNhY2hlUm93O1xuXHRcdFx0YWxsUmVzdWx0c1Byb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdGNhY2hlUm93LnJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdGRlbGV0ZSBjYWNoZS5yZXN1bHRzVG9TZWFyY2hDYWNoZVtjb25maWcuZmlsZVBhdHRlcm4gfHwgJyddO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFsbFJlc3VsdHNQcm9taXNlID0gdGhpcy5wcmV2ZW50Q2FuY2VsbGF0aW9uKGFsbFJlc3VsdHNQcm9taXNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYWxsUmVzdWx0c1Byb21pc2UudGhlbigoW3Jlc3VsdCwgcmVzdWx0c10pID0+IHtcblx0XHRcdGNvbnN0IHNjb3JlckNhY2hlOiBGdXp6eVNjb3JlckNhY2hlID0gY2FjaGUgPyBjYWNoZS5zY29yZXJDYWNoZSA6IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRjb25zdCBzb3J0U1cgPSAodHlwZW9mIGNvbmZpZy5tYXhSZXN1bHRzICE9PSAnbnVtYmVyJyB8fCBjb25maWcubWF4UmVzdWx0cyA+IDApICYmIFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRcdFx0cmV0dXJuIHRoaXMuc29ydFJlc3VsdHMoY29uZmlnLCByZXN1bHRzLCBzY29yZXJDYWNoZSwgdG9rZW4pXG5cdFx0XHRcdC50aGVuPFtJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3MsIElSYXdGaWxlTWF0Y2hbXV0+KHNvcnRlZFJlc3VsdHMgPT4ge1xuXHRcdFx0XHRcdC8vIHNvcnRpbmdUaW1lOiAtMSBpbmRpY2F0ZXMgYSBcInNvcnRlZFwiIHNlYXJjaCB0aGF0IHdhcyBub3Qgc29ydGVkLCBpLmUuIHBvcHVsYXRpbmcgdGhlIGNhY2hlIHdoZW4gcXVpY2thY2Nlc3MgaXMgb3BlbmVkLlxuXHRcdFx0XHRcdC8vIENvbnRyYXN0aW5nIHdpdGggZmluZEZpbGVzIHdoaWNoIGlzIG5vdCBzb3J0ZWQgYW5kIHdpbGwgaGF2ZSBzb3J0aW5nVGltZTogdW5kZWZpbmVkXG5cdFx0XHRcdFx0Y29uc3Qgc29ydGluZ1RpbWUgPSBzb3J0U1cgPyBzb3J0U1cuZWxhcHNlZCgpIDogLTE7XG5cblx0XHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRcdHR5cGU6ICdzdWNjZXNzJyxcblx0XHRcdFx0XHRcdHN0YXRzOiB7XG5cdFx0XHRcdFx0XHRcdGRldGFpbFN0YXRzOiByZXN1bHQuc3RhdHMsXG5cdFx0XHRcdFx0XHRcdHNvcnRpbmdUaW1lLFxuXHRcdFx0XHRcdFx0XHRmcm9tQ2FjaGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiB0aGlzLnByb2Nlc3NUeXBlLFxuXHRcdFx0XHRcdFx0XHRyZXN1bHRDb3VudDogc29ydGVkUmVzdWx0cy5sZW5ndGhcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRtZXNzYWdlczogcmVzdWx0Lm1lc3NhZ2VzLFxuXHRcdFx0XHRcdFx0bGltaXRIaXQ6IHJlc3VsdC5saW1pdEhpdCB8fCB0eXBlb2YgY29uZmlnLm1heFJlc3VsdHMgPT09ICdudW1iZXInICYmIHJlc3VsdHMubGVuZ3RoID4gY29uZmlnLm1heFJlc3VsdHNcblx0XHRcdFx0XHR9LCBzb3J0ZWRSZXN1bHRzXTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE9yQ3JlYXRlQ2FjaGUoY2FjaGVLZXk6IHN0cmluZyk6IENhY2hlIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuY2FjaGVzW2NhY2hlS2V5XTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVzW2NhY2hlS2V5XSA9IG5ldyBDYWNoZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cnlTb3J0ZWRTZWFyY2hGcm9tQ2FjaGUoY29uZmlnOiBJRmlsZVF1ZXJ5LCBwcm9ncmVzc0NhbGxiYWNrOiBJRmlsZVByb2dyZXNzQ2FsbGJhY2ssIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFtJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3MsIElSYXdGaWxlTWF0Y2hbXV0+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjYWNoZSA9IGNvbmZpZy5jYWNoZUtleSAmJiB0aGlzLmNhY2hlc1tjb25maWcuY2FjaGVLZXldO1xuXHRcdGlmICghY2FjaGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5nZXRSZXN1bHRzRnJvbUNhY2hlKGNhY2hlLCBjb25maWcuZmlsZVBhdHRlcm4gfHwgJycsIHByb2dyZXNzQ2FsbGJhY2ssIHRva2VuKTtcblx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkLnRoZW4oKFtyZXN1bHQsIHJlc3VsdHMsIGNhY2hlU3RhdHNdKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNvcnRTVyA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zb3J0UmVzdWx0cyhjb25maWcsIHJlc3VsdHMsIGNhY2hlLnNjb3JlckNhY2hlLCB0b2tlbilcblx0XHRcdFx0XHQudGhlbjxbSVNlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzLCBJUmF3RmlsZU1hdGNoW11dPihzb3J0ZWRSZXN1bHRzID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHNvcnRpbmdUaW1lID0gc29ydFNXLmVsYXBzZWQoKTtcblx0XHRcdFx0XHRcdGNvbnN0IHN0YXRzOiBJRmlsZVNlYXJjaFN0YXRzID0ge1xuXHRcdFx0XHRcdFx0XHRmcm9tQ2FjaGU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGRldGFpbFN0YXRzOiBjYWNoZVN0YXRzLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiB0aGlzLnByb2Nlc3NUeXBlLFxuXHRcdFx0XHRcdFx0XHRyZXN1bHRDb3VudDogcmVzdWx0cy5sZW5ndGgsXG5cdFx0XHRcdFx0XHRcdHNvcnRpbmdUaW1lXG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRcdFx0XHRcdGxpbWl0SGl0OiByZXN1bHQubGltaXRIaXQgfHwgdHlwZW9mIGNvbmZpZy5tYXhSZXN1bHRzID09PSAnbnVtYmVyJyAmJiByZXN1bHRzLmxlbmd0aCA+IGNvbmZpZy5tYXhSZXN1bHRzLFxuXHRcdFx0XHRcdFx0XHRcdHN0YXRzLFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2VzOiBbXSxcblx0XHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSVNlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzLFxuXHRcdFx0XHRcdFx0XHRzb3J0ZWRSZXN1bHRzXG5cdFx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNvcnRSZXN1bHRzKGNvbmZpZzogSUZpbGVRdWVyeSwgcmVzdWx0czogSVJhd0ZpbGVNYXRjaFtdLCBzY29yZXJDYWNoZTogRnV6enlTY29yZXJDYWNoZSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJhd0ZpbGVNYXRjaFtdPiB7XG5cdFx0Ly8gd2UgdXNlIHRoZSBzYW1lIGNvbXBhcmUgZnVuY3Rpb24gdGhhdCBpcyB1c2VkIGxhdGVyIHdoZW4gc2hvd2luZyB0aGUgcmVzdWx0cyB1c2luZyBmdXp6eSBzY29yaW5nXG5cdFx0Ly8gdGhpcyBpcyB2ZXJ5IGltcG9ydGFudCBiZWNhdXNlIHdlIGFyZSBhbHNvIGxpbWl0aW5nIHRoZSBudW1iZXIgb2YgcmVzdWx0cyBieSBjb25maWcubWF4UmVzdWx0c1xuXHRcdC8vIGFuZCBhcyBzdWNoIHdlIHdhbnQgdGhlIHRvcCBpdGVtcyB0byBiZSBpbmNsdWRlZCBpbiB0aGlzIHJlc3VsdCBzZXQgaWYgdGhlIG51bWJlciBvZiBpdGVtc1xuXHRcdC8vIGV4Y2VlZHMgY29uZmlnLm1heFJlc3VsdHMuXG5cdFx0Y29uc3QgcXVlcnkgPSBwcmVwYXJlUXVlcnkoY29uZmlnLmZpbGVQYXR0ZXJuIHx8ICcnKTtcblx0XHRjb25zdCBjb21wYXJlID0gKG1hdGNoQTogSVJhd0ZpbGVNYXRjaCwgbWF0Y2hCOiBJUmF3RmlsZU1hdGNoKSA9PiBjb21wYXJlSXRlbXNCeUZ1enp5U2NvcmUobWF0Y2hBLCBtYXRjaEIsIHF1ZXJ5LCB0cnVlLCBGaWxlTWF0Y2hJdGVtQWNjZXNzb3IsIHNjb3JlckNhY2hlKTtcblxuXHRcdGNvbnN0IG1heFJlc3VsdHMgPSB0eXBlb2YgY29uZmlnLm1heFJlc3VsdHMgPT09ICdudW1iZXInID8gY29uZmlnLm1heFJlc3VsdHMgOiBERUZBVUxUX01BWF9TRUFSQ0hfUkVTVUxUUztcblx0XHRyZXR1cm4gYXJyYXlzLnRvcEFzeW5jKHJlc3VsdHMsIGNvbXBhcmUsIG1heFJlc3VsdHMsIDEwMDAwLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIHNlbmRQcm9ncmVzcyhyZXN1bHRzOiBJU2VyaWFsaXplZEZpbGVNYXRjaFtdLCBwcm9ncmVzc0NiOiBJUHJvZ3Jlc3NDYWxsYmFjaywgYmF0Y2hTaXplOiBudW1iZXIpIHtcblx0XHRpZiAoYmF0Y2hTaXplICYmIGJhdGNoU2l6ZSA+IDApIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0cy5sZW5ndGg7IGkgKz0gYmF0Y2hTaXplKSB7XG5cdFx0XHRcdHByb2dyZXNzQ2IocmVzdWx0cy5zbGljZShpLCBpICsgYmF0Y2hTaXplKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByb2dyZXNzQ2IocmVzdWx0cyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXN1bHRzRnJvbUNhY2hlKGNhY2hlOiBDYWNoZSwgc2VhcmNoVmFsdWU6IHN0cmluZywgcHJvZ3Jlc3NDYWxsYmFjazogSUZpbGVQcm9ncmVzc0NhbGxiYWNrLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxbSVNlYXJjaEVuZ2luZVN1Y2Nlc3MsIElSYXdGaWxlTWF0Y2hbXSwgSUNhY2hlZFNlYXJjaFN0YXRzXT4gfCBudWxsIHtcblx0XHRjb25zdCBjYWNoZUxvb2t1cFNXID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cblx0XHQvLyBGaW5kIGNhY2hlIGVudHJpZXMgYnkgcHJlZml4IG9mIHNlYXJjaCB2YWx1ZVxuXHRcdGNvbnN0IGhhc1BhdGhTZXAgPSBzZWFyY2hWYWx1ZS5pbmRleE9mKHNlcCkgPj0gMDtcblx0XHRsZXQgY2FjaGVkUm93OiBJQ2FjaGVSb3cgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBwcmV2aW91c1NlYXJjaCBpbiBjYWNoZS5yZXN1bHRzVG9TZWFyY2hDYWNoZSkge1xuXHRcdFx0Ly8gSWYgd2UgbmFycm93IGRvd24sIHdlIG1pZ2h0IGJlIGFibGUgdG8gcmV1c2UgdGhlIGNhY2hlZCByZXN1bHRzXG5cdFx0XHRpZiAoc2VhcmNoVmFsdWUuc3RhcnRzV2l0aChwcmV2aW91c1NlYXJjaCkpIHtcblx0XHRcdFx0aWYgKGhhc1BhdGhTZXAgJiYgcHJldmlvdXNTZWFyY2guaW5kZXhPZihzZXApIDwgMCAmJiBwcmV2aW91c1NlYXJjaCAhPT0gJycpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gc2luY2UgYSBwYXRoIGNoYXJhY3RlciB3aWRlbnMgdGhlIHNlYXJjaCBmb3IgcG90ZW50aWFsIG1vcmUgbWF0Y2hlcywgcmVxdWlyZSBpdCBpbiBwcmV2aW91cyBzZWFyY2ggdG9vXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByb3cgPSBjYWNoZS5yZXN1bHRzVG9TZWFyY2hDYWNoZVtwcmV2aW91c1NlYXJjaF07XG5cdFx0XHRcdGNhY2hlZFJvdyA9IHtcblx0XHRcdFx0XHRwcm9taXNlOiB0aGlzLnByZXZlbnRDYW5jZWxsYXRpb24ocm93LnByb21pc2UpLFxuXHRcdFx0XHRcdGV2ZW50OiByb3cuZXZlbnQsXG5cdFx0XHRcdFx0cmVzb2x2ZWQ6IHJvdy5yZXNvbHZlZFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWNhY2hlZFJvdykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVMb29rdXBUaW1lID0gY2FjaGVMb29rdXBTVy5lbGFwc2VkKCk7XG5cdFx0Y29uc3QgY2FjaGVGaWx0ZXJTVyA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBjYWNoZWRSb3cuZXZlbnQocHJvZ3Jlc3NDYWxsYmFjayk7XG5cdFx0aWYgKHRva2VuKSB7XG5cdFx0XHR0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjYWNoZWRSb3cucHJvbWlzZS50aGVuPFtJU2VhcmNoRW5naW5lU3VjY2VzcywgSVJhd0ZpbGVNYXRjaFtdLCBJQ2FjaGVkU2VhcmNoU3RhdHNdPigoW2NvbXBsZXRlLCBjYWNoZWRFbnRyaWVzXSkgPT4ge1xuXHRcdFx0aWYgKHRva2VuICYmIHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRocm93IGNhbmNlbGVkKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFBhdHRlcm4gbWF0Y2ggb24gcmVzdWx0c1xuXHRcdFx0Y29uc3QgcmVzdWx0czogSVJhd0ZpbGVNYXRjaFtdID0gW107XG5cdFx0XHRjb25zdCBub3JtYWxpemVkU2VhcmNoVmFsdWVMb3dlcmNhc2UgPSBwcmVwYXJlUXVlcnkoc2VhcmNoVmFsdWUpLm5vcm1hbGl6ZWRMb3dlcmNhc2U7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGNhY2hlZEVudHJpZXMpIHtcblxuXHRcdFx0XHQvLyBDaGVjayBpZiB0aGlzIGVudHJ5IGlzIGEgbWF0Y2ggZm9yIHRoZSBzZWFyY2ggdmFsdWVcblx0XHRcdFx0aWYgKCFpc0ZpbGVQYXR0ZXJuTWF0Y2goZW50cnksIG5vcm1hbGl6ZWRTZWFyY2hWYWx1ZUxvd2VyY2FzZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc3VsdHMucHVzaChlbnRyeSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBbY29tcGxldGUsIHJlc3VsdHMsIHtcblx0XHRcdFx0Y2FjaGVXYXNSZXNvbHZlZDogY2FjaGVkUm93LnJlc29sdmVkLFxuXHRcdFx0XHRjYWNoZUxvb2t1cFRpbWUsXG5cdFx0XHRcdGNhY2hlRmlsdGVyVGltZTogY2FjaGVGaWx0ZXJTVy5lbGFwc2VkKCksXG5cdFx0XHRcdGNhY2hlRW50cnlDb3VudDogY2FjaGVkRW50cmllcy5sZW5ndGhcblx0XHRcdH1dO1xuXHRcdH0pO1xuXHR9XG5cblxuXG5cdHByaXZhdGUgZG9TZWFyY2goZW5naW5lOiBJU2VhcmNoRW5naW5lPElSYXdGaWxlTWF0Y2g+LCBwcm9ncmVzc0NhbGxiYWNrOiBJRmlsZVByb2dyZXNzQ2FsbGJhY2ssIGJhdGNoU2l6ZTogbnVtYmVyLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoRW5naW5lU3VjY2Vzcz4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJU2VhcmNoRW5naW5lU3VjY2Vzcz4oKGMsIGUpID0+IHtcblx0XHRcdGxldCBiYXRjaDogSVJhd0ZpbGVNYXRjaFtdID0gW107XG5cdFx0XHR0b2tlbj8ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gZW5naW5lLmNhbmNlbCgpKTtcblxuXHRcdFx0ZW5naW5lLnNlYXJjaCgobWF0Y2gpID0+IHtcblx0XHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdFx0aWYgKGJhdGNoU2l6ZSkge1xuXHRcdFx0XHRcdFx0YmF0Y2gucHVzaChtYXRjaCk7XG5cdFx0XHRcdFx0XHRpZiAoYmF0Y2hTaXplID4gMCAmJiBiYXRjaC5sZW5ndGggPj0gYmF0Y2hTaXplKSB7XG5cdFx0XHRcdFx0XHRcdHByb2dyZXNzQ2FsbGJhY2soYmF0Y2gpO1xuXHRcdFx0XHRcdFx0XHRiYXRjaCA9IFtdO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKG1hdGNoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIChwcm9ncmVzcykgPT4ge1xuXHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKHByb2dyZXNzKTtcblx0XHRcdH0sIChlcnJvciwgY29tcGxldGUpID0+IHtcblx0XHRcdFx0aWYgKGJhdGNoLmxlbmd0aCkge1xuXHRcdFx0XHRcdHByb2dyZXNzQ2FsbGJhY2soYmF0Y2gpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0cHJvZ3Jlc3NDYWxsYmFjayh7IG1lc3NhZ2U6ICdTZWFyY2ggZmluaXNoZWQuIEVycm9yOiAnICsgZXJyb3IubWVzc2FnZSB9KTtcblx0XHRcdFx0XHRlKGVycm9yKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKHsgbWVzc2FnZTogJ1NlYXJjaCBmaW5pc2hlZC4gU3RhdHM6ICcgKyBKU09OLnN0cmluZ2lmeShjb21wbGV0ZS5zdGF0cykgfSk7XG5cdFx0XHRcdFx0Yyhjb21wbGV0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0Y2xlYXJDYWNoZShjYWNoZUtleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZGVsZXRlIHRoaXMuY2FjaGVzW2NhY2hlS2V5XTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIGEgQ2FuY2VsYWJsZVByb21pc2Ugd2hpY2ggaXMgbm90IGFjdHVhbGx5IGNhbmNlbGFibGVcblx0ICogVE9ET0Byb2IgLSBJcyB0aGlzIHJlYWxseSBuZWVkZWQ/XG5cdCAqL1xuXHRwcml2YXRlIHByZXZlbnRDYW5jZWxsYXRpb248Qz4ocHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8Qz4pOiBDYW5jZWxhYmxlUHJvbWlzZTxDPiB7XG5cdFx0cmV0dXJuIG5ldyBjbGFzcyBpbXBsZW1lbnRzIENhbmNlbGFibGVQcm9taXNlPEM+IHtcblx0XHRcdGdldCBbU3ltYm9sLnRvU3RyaW5nVGFnXSgpIHsgcmV0dXJuIHRoaXMudG9TdHJpbmcoKTsgfVxuXHRcdFx0Y2FuY2VsKCkge1xuXHRcdFx0XHQvLyBEbyBub3RoaW5nXG5cdFx0XHR9XG5cdFx0XHR0aGVuPFRSZXN1bHQxID0gQywgVFJlc3VsdDIgPSBuZXZlcj4ocmVzb2x2ZT86ICgodmFsdWU6IEMpID0+IFRSZXN1bHQxIHwgUHJvbWlzZTxUUmVzdWx0MT4pIHwgdW5kZWZpbmVkIHwgbnVsbCwgcmVqZWN0PzogKChyZWFzb246IGFueSkgPT4gVFJlc3VsdDIgfCBQcm9taXNlPFRSZXN1bHQyPikgfCB1bmRlZmluZWQgfCBudWxsKTogUHJvbWlzZTxUUmVzdWx0MSB8IFRSZXN1bHQyPiB7XG5cdFx0XHRcdHJldHVybiBwcm9taXNlLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcblx0XHRcdH1cblx0XHRcdGNhdGNoKHJlamVjdD86IGFueSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy50aGVuKHVuZGVmaW5lZCwgcmVqZWN0KTtcblx0XHRcdH1cblx0XHRcdGZpbmFsbHkob25GaW5hbGx5OiBhbnkpIHtcblx0XHRcdFx0cmV0dXJuIHByb21pc2UuZmluYWxseShvbkZpbmFsbHkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDYWNoZVJvdyB7XG5cdC8vIFRPRE9Acm9ibG91IC0gbmV2ZXIgYWN0dWFsbHkgY2FuY2VsZWRcblx0cHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8W0lTZWFyY2hFbmdpbmVTdWNjZXNzLCBJUmF3RmlsZU1hdGNoW11dPjtcblx0cmVzb2x2ZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGV2ZW50OiBFdmVudDxJRmlsZVNlYXJjaFByb2dyZXNzSXRlbT47XG59XG5cbmNsYXNzIENhY2hlIHtcblxuXHRyZXN1bHRzVG9TZWFyY2hDYWNoZTogeyBbc2VhcmNoVmFsdWU6IHN0cmluZ106IElDYWNoZVJvdyB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRzY29yZXJDYWNoZTogRnV6enlTY29yZXJDYWNoZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG59XG5cbmNvbnN0IEZpbGVNYXRjaEl0ZW1BY2Nlc3NvciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElJdGVtQWNjZXNzb3I8SVJhd0ZpbGVNYXRjaD4ge1xuXG5cdGdldEl0ZW1MYWJlbChtYXRjaDogSVJhd0ZpbGVNYXRjaCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGJhc2VuYW1lKG1hdGNoLnJlbGF0aXZlUGF0aCk7IC8vIGUuZy4gbXlGaWxlLnR4dFxuXHR9XG5cblx0Z2V0SXRlbURlc2NyaXB0aW9uKG1hdGNoOiBJUmF3RmlsZU1hdGNoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZGlybmFtZShtYXRjaC5yZWxhdGl2ZVBhdGgpOyAvLyBlLmcuIHNvbWUvcGF0aC90by9maWxlXG5cdH1cblxuXHRnZXRJdGVtUGF0aChtYXRjaDogSVJhd0ZpbGVNYXRjaCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG1hdGNoLnJlbGF0aXZlUGF0aDsgLy8gZS5nLiBzb21lL3BhdGgvdG8vZmlsZS9teUZpbGUudHh0XG5cdH1cbn07XG5cbmZ1bmN0aW9uIHJldml2ZVF1ZXJ5PFUgZXh0ZW5kcyBJUmF3UXVlcnk+KHJhd1F1ZXJ5OiBVKTogVSBleHRlbmRzIElSYXdUZXh0UXVlcnkgPyBJVGV4dFF1ZXJ5IDogSUZpbGVRdWVyeSB7XG5cdHJldHVybiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Li4uPGFueT5yYXdRdWVyeSwgLy8gVE9ET1xuXHRcdC4uLntcblx0XHRcdGZvbGRlclF1ZXJpZXM6IHJhd1F1ZXJ5LmZvbGRlclF1ZXJpZXMgJiYgcmF3UXVlcnkuZm9sZGVyUXVlcmllcy5tYXAocmV2aXZlRm9sZGVyUXVlcnkpLFxuXHRcdFx0ZXh0cmFGaWxlUmVzb3VyY2VzOiByYXdRdWVyeS5leHRyYUZpbGVSZXNvdXJjZXMgJiYgcmF3UXVlcnkuZXh0cmFGaWxlUmVzb3VyY2VzLm1hcChjb21wb25lbnRzID0+IFVSSS5yZXZpdmUoY29tcG9uZW50cykpXG5cdFx0fVxuXHR9O1xufVxuXG5mdW5jdGlvbiByZXZpdmVGb2xkZXJRdWVyeShyYXdGb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5PFVyaUNvbXBvbmVudHM+KTogSUZvbGRlclF1ZXJ5PFVSST4ge1xuXHRyZXR1cm4gcmV2aXZlKHJhd0ZvbGRlclF1ZXJ5KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUE0QiwrQkFBK0I7QUFFM0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLDBCQUEyRCxvQkFBb0I7QUFDeEYsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsVUFBVSxTQUFTLE1BQU0sV0FBVztBQUM3QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQTBCO0FBQ25D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
