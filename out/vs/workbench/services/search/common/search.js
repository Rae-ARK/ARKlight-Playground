import { mapArrayOrNot } from "../../../../base/common/arrays.js";
import * as glob from "../../../../base/common/glob.js";
import * as objects from "../../../../base/common/objects.js";
import * as extpath from "../../../../base/common/extpath.js";
import { fuzzyContains, getNLines } from "../../../../base/common/strings.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import * as paths from "../../../../base/common/path.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { TextSearchCompleteMessageType } from "./searchExtTypes.js";
import { isThenable } from "../../../../base/common/async.js";
const VIEWLET_ID = "workbench.view.search";
const PANEL_ID = "workbench.panel.search";
const VIEW_ID = "workbench.view.search";
const SEARCH_RESULT_LANGUAGE_ID = "search-result";
const SEARCH_EXCLUDE_CONFIG = "search.exclude";
const DEFAULT_MAX_SEARCH_RESULTS = 2e4;
const SEARCH_ELIDED_PREFIX = "\u27EA ";
const SEARCH_ELIDED_SUFFIX = " characters skipped \u27EB";
const SEARCH_ELIDED_MIN_LEN = (SEARCH_ELIDED_PREFIX.length + SEARCH_ELIDED_SUFFIX.length + 5) * 2;
const ISearchService = createDecorator("searchService");
var SearchProviderType = /* @__PURE__ */ ((SearchProviderType2) => {
  SearchProviderType2[SearchProviderType2["file"] = 0] = "file";
  SearchProviderType2[SearchProviderType2["text"] = 1] = "text";
  SearchProviderType2[SearchProviderType2["aiText"] = 2] = "aiText";
  return SearchProviderType2;
})(SearchProviderType || {});
var QueryType = /* @__PURE__ */ ((QueryType2) => {
  QueryType2[QueryType2["File"] = 1] = "File";
  QueryType2[QueryType2["Text"] = 2] = "Text";
  QueryType2[QueryType2["aiText"] = 3] = "aiText";
  return QueryType2;
})(QueryType || {});
function resultIsMatch(result) {
  return !!result.rangeLocations && !!result.previewText;
}
function isFileMatch(p) {
  return !!p.resource;
}
function isAIKeyword(p) {
  return !!p.keyword;
}
function isProgressMessage(p) {
  return !!p.message;
}
var SearchCompletionExitCode = /* @__PURE__ */ ((SearchCompletionExitCode2) => {
  SearchCompletionExitCode2[SearchCompletionExitCode2["Normal"] = 0] = "Normal";
  SearchCompletionExitCode2[SearchCompletionExitCode2["NewSearchStarted"] = 1] = "NewSearchStarted";
  return SearchCompletionExitCode2;
})(SearchCompletionExitCode || {});
class FileMatch {
  constructor(resource) {
    this.resource = resource;
    this.results = [];
  }
}
class TextSearchMatch {
  constructor(text, ranges, previewOptions, webviewIndex) {
    this.rangeLocations = [];
    this.webviewIndex = webviewIndex;
    const rangesArr = Array.isArray(ranges) ? ranges : [ranges];
    if (previewOptions && previewOptions.matchLines === 1 && isSingleLineRangeList(rangesArr)) {
      text = getNLines(text, previewOptions.matchLines);
      let result = "";
      let shift = 0;
      let lastEnd = 0;
      const leadingChars = Math.floor(previewOptions.charsPerLine / 5);
      for (const range of rangesArr) {
        const previewStart = Math.max(range.startColumn - leadingChars, 0);
        const previewEnd = range.startColumn + previewOptions.charsPerLine;
        if (previewStart > lastEnd + leadingChars + SEARCH_ELIDED_MIN_LEN) {
          const elision = SEARCH_ELIDED_PREFIX + (previewStart - lastEnd) + SEARCH_ELIDED_SUFFIX;
          result += elision + text.slice(previewStart, previewEnd);
          shift += previewStart - (lastEnd + elision.length);
        } else {
          result += text.slice(lastEnd, previewEnd);
        }
        lastEnd = previewEnd;
        this.rangeLocations.push({
          source: range,
          preview: new OneLineRange(0, range.startColumn - shift, range.endColumn - shift)
        });
      }
      this.previewText = result;
    } else {
      const firstMatchLine = Array.isArray(ranges) ? ranges[0].startLineNumber : ranges.startLineNumber;
      const rangeLocs = mapArrayOrNot(ranges, (r) => ({
        preview: new SearchRange(r.startLineNumber - firstMatchLine, r.startColumn, r.endLineNumber - firstMatchLine, r.endColumn),
        source: r
      }));
      this.rangeLocations = Array.isArray(rangeLocs) ? rangeLocs : [rangeLocs];
      this.previewText = text;
    }
  }
}
function isSingleLineRangeList(ranges) {
  const line = ranges[0].startLineNumber;
  for (const r of ranges) {
    if (r.startLineNumber !== line || r.endLineNumber !== line) {
      return false;
    }
  }
  return true;
}
class SearchRange {
  constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
    this.startLineNumber = startLineNumber;
    this.startColumn = startColumn;
    this.endLineNumber = endLineNumber;
    this.endColumn = endColumn;
  }
}
class OneLineRange extends SearchRange {
  constructor(lineNumber, startColumn, endColumn) {
    super(lineNumber, startColumn, lineNumber, endColumn);
  }
}
var ViewMode = /* @__PURE__ */ ((ViewMode2) => {
  ViewMode2["List"] = "list";
  ViewMode2["Tree"] = "tree";
  return ViewMode2;
})(ViewMode || {});
var SearchSortOrder = /* @__PURE__ */ ((SearchSortOrder2) => {
  SearchSortOrder2["Default"] = "default";
  SearchSortOrder2["FileNames"] = "fileNames";
  SearchSortOrder2["Type"] = "type";
  SearchSortOrder2["Modified"] = "modified";
  SearchSortOrder2["CountDescending"] = "countDescending";
  SearchSortOrder2["CountAscending"] = "countAscending";
  return SearchSortOrder2;
})(SearchSortOrder || {});
var SemanticSearchBehavior = /* @__PURE__ */ ((SemanticSearchBehavior2) => {
  SemanticSearchBehavior2["Auto"] = "auto";
  SemanticSearchBehavior2["Manual"] = "manual";
  SemanticSearchBehavior2["RunOnEmpty"] = "runOnEmpty";
  return SemanticSearchBehavior2;
})(SemanticSearchBehavior || {});
function getExcludes(configuration, includeSearchExcludes = true) {
  const fileExcludes = configuration && configuration.files && configuration.files.exclude;
  const searchExcludes = includeSearchExcludes && configuration && configuration.search && configuration.search.exclude;
  if (!fileExcludes && !searchExcludes) {
    return void 0;
  }
  if (!fileExcludes || !searchExcludes) {
    return fileExcludes || searchExcludes || void 0;
  }
  let allExcludes = /* @__PURE__ */ Object.create(null);
  allExcludes = objects.mixin(allExcludes, objects.deepClone(fileExcludes));
  allExcludes = objects.mixin(allExcludes, objects.deepClone(searchExcludes), true);
  return allExcludes;
}
function pathIncludedInQuery(queryProps, fsPath) {
  const globOptions = queryProps.ignoreGlobCase ? { ignoreCase: true } : void 0;
  if (queryProps.excludePattern && glob.match(queryProps.excludePattern, fsPath, globOptions)) {
    return false;
  }
  if (queryProps.includePattern || queryProps.usingSearchPaths) {
    if (queryProps.includePattern && glob.match(queryProps.includePattern, fsPath, globOptions)) {
      return true;
    }
    if (queryProps.usingSearchPaths) {
      return !!queryProps.folderQueries && queryProps.folderQueries.some((fq) => {
        const searchPath = fq.folder.fsPath;
        if (extpath.isEqualOrParent(fsPath, searchPath, queryProps.ignoreGlobCase)) {
          const relPath = paths.relative(searchPath, fsPath);
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
var SearchErrorCode = /* @__PURE__ */ ((SearchErrorCode2) => {
  SearchErrorCode2[SearchErrorCode2["unknownEncoding"] = 1] = "unknownEncoding";
  SearchErrorCode2[SearchErrorCode2["regexParseError"] = 2] = "regexParseError";
  SearchErrorCode2[SearchErrorCode2["globParseError"] = 3] = "globParseError";
  SearchErrorCode2[SearchErrorCode2["invalidLiteral"] = 4] = "invalidLiteral";
  SearchErrorCode2[SearchErrorCode2["rgProcessError"] = 5] = "rgProcessError";
  SearchErrorCode2[SearchErrorCode2["other"] = 6] = "other";
  SearchErrorCode2[SearchErrorCode2["canceled"] = 7] = "canceled";
  return SearchErrorCode2;
})(SearchErrorCode || {});
class SearchError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
function deserializeSearchError(error) {
  const errorMsg = error.message;
  if (isCancellationError(error)) {
    return new SearchError(errorMsg, 7 /* canceled */);
  }
  try {
    const details = JSON.parse(errorMsg);
    return new SearchError(details.message, details.code);
  } catch (e) {
    return new SearchError(errorMsg, 6 /* other */);
  }
}
function serializeSearchError(searchError) {
  const details = { message: searchError.message, code: searchError.code };
  return new Error(JSON.stringify(details));
}
function isSerializedSearchComplete(arg) {
  if (arg.type === "error") {
    return true;
  } else if (arg.type === "success") {
    return true;
  } else {
    return false;
  }
}
function isSerializedSearchSuccess(arg) {
  return arg.type === "success";
}
function isSerializedFileMatch(arg) {
  return !!arg.path;
}
const filePatternIgnoreCaseOptions = { ignoreCase: true };
function isFilePatternMatch(candidate, filePatternToUse, fuzzy = true, ignoreCase) {
  const pathToMatch = candidate.searchPath ? candidate.searchPath : candidate.relativePath;
  return fuzzy ? fuzzyContains(pathToMatch, filePatternToUse) : glob.match(filePatternToUse, pathToMatch, ignoreCase ? filePatternIgnoreCaseOptions : void 0);
}
class SerializableFileMatch {
  constructor(path) {
    this.path = path;
    this.results = [];
  }
  addMatch(match) {
    this.results.push(match);
  }
  serialize() {
    return {
      path: this.path,
      results: this.results,
      numMatches: this.results.length
    };
  }
}
function resolvePatternsForProvider(globalPattern, folderPattern) {
  const merged = {
    ...globalPattern || {},
    ...folderPattern || {}
  };
  return Object.keys(merged).filter((key) => {
    const value = merged[key];
    return typeof value === "boolean" && value;
  });
}
class QueryGlobTester {
  constructor(config, folderQuery) {
    this._parsedIncludeExpression = null;
    const globOptions = config.ignoreGlobCase || folderQuery.ignoreGlobCase ? { ignoreCase: true } : void 0;
    this._excludeExpression = folderQuery.excludePattern?.map((excludePattern) => {
      return {
        ...config.excludePattern || {},
        ...excludePattern.pattern || {}
      };
    }) ?? [];
    if (this._excludeExpression.length === 0) {
      this._excludeExpression = [config.excludePattern || {}];
    }
    this._parsedExcludeExpression = this._excludeExpression.map((e) => glob.parse(e, globOptions));
    let includeExpression = config.includePattern;
    if (folderQuery.includePattern) {
      if (includeExpression) {
        includeExpression = {
          ...includeExpression,
          ...folderQuery.includePattern
        };
      } else {
        includeExpression = folderQuery.includePattern;
      }
    }
    if (includeExpression) {
      this._parsedIncludeExpression = glob.parse(includeExpression, globOptions);
    }
  }
  _evalParsedExcludeExpression(testPath, basename, hasSibling) {
    let result = null;
    for (const folderExclude of this._parsedExcludeExpression) {
      const evaluation = folderExclude(testPath, basename, hasSibling);
      if (typeof evaluation === "string") {
        result = evaluation;
        break;
      }
    }
    return result;
  }
  matchesExcludesSync(testPath, basename, hasSibling) {
    if (this._parsedExcludeExpression && this._evalParsedExcludeExpression(testPath, basename, hasSibling)) {
      return true;
    }
    return false;
  }
  /**
   * Guaranteed sync - siblingsFn should not return a promise.
   */
  includedInQuerySync(testPath, basename, hasSibling) {
    if (this._parsedExcludeExpression && this._evalParsedExcludeExpression(testPath, basename, hasSibling)) {
      return false;
    }
    if (this._parsedIncludeExpression && !this._parsedIncludeExpression(testPath, basename, hasSibling)) {
      return false;
    }
    return true;
  }
  /**
   * Evaluating the exclude expression is only async if it includes sibling clauses. As an optimization, avoid doing anything with Promises
   * unless the expression is async.
   */
  includedInQuery(testPath, basename, hasSibling) {
    const isIncluded = () => {
      return this._parsedIncludeExpression ? !!this._parsedIncludeExpression(testPath, basename, hasSibling) : true;
    };
    return Promise.all(this._parsedExcludeExpression.map((e) => {
      const excluded = e(testPath, basename, hasSibling);
      if (isThenable(excluded)) {
        return excluded.then((excluded2) => {
          if (excluded2) {
            return false;
          }
          return isIncluded();
        });
      }
      return isIncluded();
    })).then((e) => e.some((e2) => !!e2));
  }
  hasSiblingExcludeClauses() {
    return this._excludeExpression.reduce((prev, curr) => hasSiblingClauses(curr) || prev, false);
  }
}
function hasSiblingClauses(pattern) {
  for (const key in pattern) {
    if (typeof pattern[key] !== "boolean") {
      return true;
    }
  }
  return false;
}
function hasSiblingPromiseFn(siblingsFn) {
  if (!siblingsFn) {
    return void 0;
  }
  let siblings;
  return (name) => {
    if (!siblings) {
      siblings = (siblingsFn() || Promise.resolve([])).then((list) => list ? listToMap(list) : {});
    }
    return siblings.then((map) => !!map[name]);
  };
}
function hasSiblingFn(siblingsFn) {
  if (!siblingsFn) {
    return void 0;
  }
  let siblings;
  return (name) => {
    if (!siblings) {
      const list = siblingsFn();
      siblings = list ? listToMap(list) : {};
    }
    return !!siblings[name];
  };
}
function listToMap(list) {
  const map = {};
  for (const key of list) {
    map[key] = true;
  }
  return map;
}
function excludeToGlobPattern(excludesForFolder) {
  return excludesForFolder.flatMap((exclude) => exclude.patterns.map((pattern) => {
    return exclude.baseUri ? {
      baseUri: exclude.baseUri,
      pattern
    } : pattern;
  }));
}
const DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS = {
  matchLines: 100,
  charsPerLine: 1e4
};
export {
  DEFAULT_MAX_SEARCH_RESULTS,
  DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS,
  FileMatch,
  ISearchService,
  OneLineRange,
  PANEL_ID,
  QueryGlobTester,
  QueryType,
  SEARCH_EXCLUDE_CONFIG,
  SEARCH_RESULT_LANGUAGE_ID,
  SearchCompletionExitCode,
  SearchError,
  SearchErrorCode,
  SearchProviderType,
  SearchRange,
  SearchSortOrder,
  SemanticSearchBehavior,
  SerializableFileMatch,
  TextSearchCompleteMessageType,
  TextSearchMatch,
  VIEWLET_ID,
  VIEW_ID,
  ViewMode,
  deserializeSearchError,
  excludeToGlobPattern,
  getExcludes,
  hasSiblingFn,
  hasSiblingPromiseFn,
  isAIKeyword,
  isFileMatch,
  isFilePatternMatch,
  isProgressMessage,
  isSerializedFileMatch,
  isSerializedSearchComplete,
  isSerializedSearchSuccess,
  pathIncludedInQuery,
  resolvePatternsForProvider,
  resultIsMatch,
  serializeSearchError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1hcEFycmF5T3JOb3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgKiBhcyBleHRwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgZnV6enlDb250YWlucywgZ2V0TkxpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyBwYXRocyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgQUlTZWFyY2hLZXl3b3JkLCBHbG9iUGF0dGVybiwgVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUgfSBmcm9tICcuL3NlYXJjaEV4dFR5cGVzLmpzJztcbmltcG9ydCB7IGlzVGhlbmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5cbmV4cG9ydCB7IFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2VUeXBlIH07XG5cbmV4cG9ydCBjb25zdCBWSUVXTEVUX0lEID0gJ3dvcmtiZW5jaC52aWV3LnNlYXJjaCc7XG5leHBvcnQgY29uc3QgUEFORUxfSUQgPSAnd29ya2JlbmNoLnBhbmVsLnNlYXJjaCc7XG5leHBvcnQgY29uc3QgVklFV19JRCA9ICd3b3JrYmVuY2gudmlldy5zZWFyY2gnO1xuZXhwb3J0IGNvbnN0IFNFQVJDSF9SRVNVTFRfTEFOR1VBR0VfSUQgPSAnc2VhcmNoLXJlc3VsdCc7XG5cbmV4cG9ydCBjb25zdCBTRUFSQ0hfRVhDTFVERV9DT05GSUcgPSAnc2VhcmNoLmV4Y2x1ZGUnO1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfTUFYX1NFQVJDSF9SRVNVTFRTID0gMjAwMDA7XG5cbi8vIFdhcm5pbmc6IHRoaXMgcGF0dGVybiBpcyB1c2VkIGluIHRoZSBzZWFyY2ggZWRpdG9yIHRvIGRldGVjdCBvZmZzZXRzLiBJZiB5b3Vcbi8vIGNoYW5nZSB0aGlzLCBhbHNvIGNoYW5nZSB0aGUgc2VhcmNoLXJlc3VsdCBidWlsdC1pbiBleHRlbnNpb25cbmNvbnN0IFNFQVJDSF9FTElERURfUFJFRklYID0gJ1x1MjdFQSAnO1xuY29uc3QgU0VBUkNIX0VMSURFRF9TVUZGSVggPSAnIGNoYXJhY3RlcnMgc2tpcHBlZCBcdTI3RUInO1xuY29uc3QgU0VBUkNIX0VMSURFRF9NSU5fTEVOID0gKFNFQVJDSF9FTElERURfUFJFRklYLmxlbmd0aCArIFNFQVJDSF9FTElERURfU1VGRklYLmxlbmd0aCArIDUpICogMjtcblxuZXhwb3J0IGNvbnN0IElTZWFyY2hTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElTZWFyY2hTZXJ2aWNlPignc2VhcmNoU2VydmljZScpO1xuXG4vKipcbiAqIEEgc2VydmljZSB0aGF0IGVuYWJsZXMgdG8gc2VhcmNoIGZvciBmaWxlcyBvciB3aXRoIGluIGZpbGVzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHR0ZXh0U2VhcmNoKHF1ZXJ5OiBJVGV4dFF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuLCBvblByb2dyZXNzPzogKHJlc3VsdDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCk6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPjtcblx0YWlUZXh0U2VhcmNoKHF1ZXJ5OiBJQUlUZXh0UXVlcnksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4sIG9uUHJvZ3Jlc3M/OiAocmVzdWx0OiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+O1xuXHRnZXRBSU5hbWUoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHR0ZXh0U2VhcmNoU3BsaXRTeW5jQXN5bmMocXVlcnk6IElUZXh0UXVlcnksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWQsIG9uUHJvZ3Jlc3M/OiAoKHJlc3VsdDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCkgfCB1bmRlZmluZWQsIG5vdGVib29rRmlsZXNUb0lnbm9yZT86IFJlc291cmNlU2V0LCBhc3luY05vdGVib29rRmlsZXNUb0lnbm9yZT86IFByb21pc2U8UmVzb3VyY2VTZXQ+KTogeyBzeW5jUmVzdWx0czogSVNlYXJjaENvbXBsZXRlOyBhc3luY1Jlc3VsdHM6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB9O1xuXHRmaWxlU2VhcmNoKHF1ZXJ5OiBJRmlsZVF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+O1xuXHRzY2hlbWVIYXNGaWxlU2VhcmNoUHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcpOiBib29sZWFuO1xuXHRjbGVhckNhY2hlKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZWdpc3RlclNlYXJjaFJlc3VsdFByb3ZpZGVyKHNjaGVtZTogc3RyaW5nLCB0eXBlOiBTZWFyY2hQcm92aWRlclR5cGUsIHByb3ZpZGVyOiBJU2VhcmNoUmVzdWx0UHJvdmlkZXIpOiBJRGlzcG9zYWJsZTtcbn1cblxuLyoqXG4gKiBUT0RPQHJvYmxvdSAtIHNwbGl0IHRleHQgZnJvbSBmaWxlIHNlYXJjaCBlbnRpcmVseSwgb3Igc2hhcmUgY29kZSBpbiBhIG1vcmUgbmF0dXJhbCB3YXkuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFNlYXJjaFByb3ZpZGVyVHlwZSB7XG5cdGZpbGUsXG5cdHRleHQsXG5cdGFpVGV4dFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hSZXN1bHRQcm92aWRlciB7XG5cdGdldEFJTmFtZSgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHRleHRTZWFyY2gocXVlcnk6IElUZXh0UXVlcnksIG9uUHJvZ3Jlc3M/OiAocDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPjtcblx0ZmlsZVNlYXJjaChxdWVyeTogSUZpbGVRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPjtcblx0Y2xlYXJDYWNoZShjYWNoZUtleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuXG5leHBvcnQgaW50ZXJmYWNlIEV4Y2x1ZGVHbG9iUGF0dGVybjxVIGV4dGVuZHMgVXJpQ29tcG9uZW50cyA9IFVSST4ge1xuXHRmb2xkZXI/OiBVO1xuXHRwYXR0ZXJuOiBnbG9iLklFeHByZXNzaW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGb2xkZXJRdWVyeTxVIGV4dGVuZHMgVXJpQ29tcG9uZW50cyA9IFVSST4ge1xuXHRmb2xkZXI6IFU7XG5cdGZvbGRlck5hbWU/OiBzdHJpbmc7XG5cdGV4Y2x1ZGVQYXR0ZXJuPzogRXhjbHVkZUdsb2JQYXR0ZXJuPFU+W107XG5cdGluY2x1ZGVQYXR0ZXJuPzogZ2xvYi5JRXhwcmVzc2lvbjtcblx0aWdub3JlR2xvYkNhc2U/OiBib29sZWFuO1xuXHRmaWxlRW5jb2Rpbmc/OiBzdHJpbmc7XG5cdGRpc3JlZ2FyZElnbm9yZUZpbGVzPzogYm9vbGVhbjtcblx0ZGlzcmVnYXJkR2xvYmFsSWdub3JlRmlsZXM/OiBib29sZWFuO1xuXHRkaXNyZWdhcmRQYXJlbnRJZ25vcmVGaWxlcz86IGJvb2xlYW47XG5cdGlnbm9yZVN5bWxpbmtzPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tbW9uUXVlcnlQcm9wczxVIGV4dGVuZHMgVXJpQ29tcG9uZW50cz4ge1xuXHQvKiogRm9yIHRlbGVtZXRyeSAtIGluZGljYXRlcyB3aGF0IGlzIHRyaWdnZXJpbmcgdGhlIHNvdXJjZSAqL1xuXHRfcmVhc29uPzogc3RyaW5nO1xuXG5cdGZvbGRlclF1ZXJpZXM6IElGb2xkZXJRdWVyeTxVPltdO1xuXHQvLyBUaGUgaW5jbHVkZSBwYXR0ZXJuIGZvciBmaWxlcyB0aGF0IGdldHMgcGFzc2VkIGludG8gcmlwZ3JlcC5cblx0Ly8gTm90ZSB0aGF0IHRoaXMgd2lsbCBvdmVycmlkZSBhbnkgaWdub3JlIGZpbGVzIGlmIGFwcGxpY2FibGUuXG5cdGluY2x1ZGVQYXR0ZXJuPzogZ2xvYi5JRXhwcmVzc2lvbjtcblx0ZXhjbHVkZVBhdHRlcm4/OiBnbG9iLklFeHByZXNzaW9uO1xuXHRpZ25vcmVHbG9iQ2FzZT86IGJvb2xlYW47XG5cdGV4dHJhRmlsZVJlc291cmNlcz86IFVbXTtcblxuXHRvbmx5T3BlbkVkaXRvcnM/OiBib29sZWFuO1xuXG5cdG1heFJlc3VsdHM/OiBudW1iZXI7XG5cdHVzaW5nU2VhcmNoUGF0aHM/OiBib29sZWFuO1xuXHRvbmx5RmlsZVNjaGVtZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVRdWVyeVByb3BzPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzPiBleHRlbmRzIElDb21tb25RdWVyeVByb3BzPFU+IHtcblx0dHlwZTogUXVlcnlUeXBlLkZpbGU7XG5cdGZpbGVQYXR0ZXJuPzogc3RyaW5nO1xuXG5cdC8vIHdoZW4gd2Fsa2luZyB0aHJvdWdoIHRoZSB0cmVlIHRvIGZpbmQgdGhlIHJlc3VsdCwgZG9uJ3QgdXNlIHRoZSBmaWxlUGF0dGVybiB0byBmdXp6eSBtYXRjaC5cblx0Ly8gSW5zdGVhZCwgc2hvdWxkIHVzZSBnbG9iIG1hdGNoaW5nLlxuXHRzaG91bGRHbG9iTWF0Y2hGaWxlUGF0dGVybj86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIElmIHRydWUgbm8gcmVzdWx0cyB3aWxsIGJlIHJldHVybmVkLiBJbnN0ZWFkIGBsaW1pdEhpdGAgd2lsbCBpbmRpY2F0ZSBpZiBhdCBsZWFzdCBvbmUgcmVzdWx0IGV4aXN0cyBvciBub3QuXG5cdCAqIEN1cnJlbnRseSBkb2VzIG5vdCB3b3JrIHdpdGggcXVlcmllcyBpbmNsdWRpbmcgYSAnc2libGluZ3MgY2xhdXNlJy5cblx0ICovXG5cdGV4aXN0cz86IGJvb2xlYW47XG5cdHNvcnRCeVNjb3JlPzogYm9vbGVhbjtcblx0Y2FjaGVLZXk/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRRdWVyeVByb3BzPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzPiBleHRlbmRzIElDb21tb25RdWVyeVByb3BzPFU+IHtcblx0dHlwZTogUXVlcnlUeXBlLlRleHQ7XG5cdGNvbnRlbnRQYXR0ZXJuOiBJUGF0dGVybkluZm87XG5cblx0cHJldmlld09wdGlvbnM/OiBJVGV4dFNlYXJjaFByZXZpZXdPcHRpb25zO1xuXHRtYXhGaWxlU2l6ZT86IG51bWJlcjtcblx0c3Vycm91bmRpbmdDb250ZXh0PzogbnVtYmVyO1xuXG5cdHVzZXJEaXNhYmxlZEV4Y2x1ZGVzQW5kSWdub3JlRmlsZXM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBSVRleHRRdWVyeVByb3BzPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzPiBleHRlbmRzIElDb21tb25RdWVyeVByb3BzPFU+IHtcblx0dHlwZTogUXVlcnlUeXBlLmFpVGV4dDtcblx0Y29udGVudFBhdHRlcm46IHN0cmluZztcblxuXHRwcmV2aWV3T3B0aW9ucz86IElUZXh0U2VhcmNoUHJldmlld09wdGlvbnM7XG5cdG1heEZpbGVTaXplPzogbnVtYmVyO1xuXHRzdXJyb3VuZGluZ0NvbnRleHQ/OiBudW1iZXI7XG5cblx0dXNlckRpc2FibGVkRXhjbHVkZXNBbmRJZ25vcmVGaWxlcz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIElGaWxlUXVlcnkgPSBJRmlsZVF1ZXJ5UHJvcHM8VVJJPjtcbmV4cG9ydCB0eXBlIElSYXdGaWxlUXVlcnkgPSBJRmlsZVF1ZXJ5UHJvcHM8VXJpQ29tcG9uZW50cz47XG5leHBvcnQgdHlwZSBJVGV4dFF1ZXJ5ID0gSVRleHRRdWVyeVByb3BzPFVSST47XG5leHBvcnQgdHlwZSBJUmF3VGV4dFF1ZXJ5ID0gSVRleHRRdWVyeVByb3BzPFVyaUNvbXBvbmVudHM+O1xuZXhwb3J0IHR5cGUgSUFJVGV4dFF1ZXJ5ID0gSUFJVGV4dFF1ZXJ5UHJvcHM8VVJJPjtcbmV4cG9ydCB0eXBlIElSYXdBSVRleHRRdWVyeSA9IElBSVRleHRRdWVyeVByb3BzPFVyaUNvbXBvbmVudHM+O1xuXG5leHBvcnQgdHlwZSBJUmF3UXVlcnkgPSBJUmF3VGV4dFF1ZXJ5IHwgSVJhd0ZpbGVRdWVyeSB8IElSYXdBSVRleHRRdWVyeTtcbmV4cG9ydCB0eXBlIElTZWFyY2hRdWVyeSA9IElUZXh0UXVlcnkgfCBJRmlsZVF1ZXJ5IHwgSUFJVGV4dFF1ZXJ5O1xuZXhwb3J0IHR5cGUgSVRleHRTZWFyY2hRdWVyeSA9IElUZXh0UXVlcnkgfCBJQUlUZXh0UXVlcnk7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFF1ZXJ5VHlwZSB7XG5cdEZpbGUgPSAxLFxuXHRUZXh0ID0gMixcblx0YWlUZXh0ID0gM1xufVxuXG4vKiBfX0dEUFJfX0ZSQUdNRU5UX19cblx0XCJJUGF0dGVybkluZm9cIiA6IHtcblx0XHRcImlzUmVnRXhwXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XCJpc1dvcmRNYXRjaFwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9LFxuXHRcdFwid29yZFNlcGFyYXRvcnNcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9LFxuXHRcdFwiaXNNdWx0aWxpbmVcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcImlzQ2FzZVNlbnNpdGl2ZVwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9LFxuXHRcdFwiaXNTbWFydENhc2VcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfVxuXHR9XG4qL1xuZXhwb3J0IGludGVyZmFjZSBJUGF0dGVybkluZm8ge1xuXHRwYXR0ZXJuOiBzdHJpbmc7XG5cdGlzUmVnRXhwPzogYm9vbGVhbjtcblx0aXNXb3JkTWF0Y2g/OiBib29sZWFuO1xuXHR3b3JkU2VwYXJhdG9ycz86IHN0cmluZztcblx0aXNNdWx0aWxpbmU/OiBib29sZWFuO1xuXHRpc1VuaWNvZGU/OiBib29sZWFuO1xuXHRpc0Nhc2VTZW5zaXRpdmU/OiBib29sZWFuO1xuXHRub3RlYm9va0luZm8/OiBJTm90ZWJvb2tQYXR0ZXJuSW5mbztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tQYXR0ZXJuSW5mbyB7XG5cdGlzSW5Ob3RlYm9va01hcmtkb3duSW5wdXQ/OiBib29sZWFuO1xuXHRpc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXc/OiBib29sZWFuO1xuXHRpc0luTm90ZWJvb2tDZWxsSW5wdXQ/OiBib29sZWFuO1xuXHRpc0luTm90ZWJvb2tDZWxsT3V0cHV0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZU1hdGNoPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzID0gVVJJPiB7XG5cdHJlc291cmNlOiBVO1xuXHRyZXN1bHRzPzogSVRleHRTZWFyY2hSZXN1bHQ8VT5bXTtcbn1cblxuZXhwb3J0IHR5cGUgSVJhd0ZpbGVNYXRjaDIgPSBJRmlsZU1hdGNoPFVyaUNvbXBvbmVudHM+O1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0U2VhcmNoUHJldmlld09wdGlvbnMge1xuXHRtYXRjaExpbmVzOiBudW1iZXI7XG5cdGNoYXJzUGVyTGluZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hSYW5nZSB7XG5cdHJlYWRvbmx5IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRyZWFkb25seSBzdGFydENvbHVtbjogbnVtYmVyO1xuXHRyZWFkb25seSBlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZENvbHVtbjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0U2VhcmNoTWF0Y2g8VSBleHRlbmRzIFVyaUNvbXBvbmVudHMgPSBVUkk+IHtcblx0dXJpPzogVTtcblx0cmFuZ2VMb2NhdGlvbnM6IFNlYXJjaFJhbmdlU2V0UGFpcmluZ1tdO1xuXHRwcmV2aWV3VGV4dDogc3RyaW5nO1xuXHR3ZWJ2aWV3SW5kZXg/OiBudW1iZXI7XG5cdGNlbGxGcmFnbWVudD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGV4dFNlYXJjaENvbnRleHQ8VSBleHRlbmRzIFVyaUNvbXBvbmVudHMgPSBVUkk+IHtcblx0dXJpPzogVTtcblx0dGV4dDogc3RyaW5nO1xuXHRsaW5lTnVtYmVyOiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIElUZXh0U2VhcmNoUmVzdWx0PFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzID0gVVJJPiA9IElUZXh0U2VhcmNoTWF0Y2g8VT4gfCBJVGV4dFNlYXJjaENvbnRleHQ8VT47XG5cbmV4cG9ydCBmdW5jdGlvbiByZXN1bHRJc01hdGNoKHJlc3VsdDogSVRleHRTZWFyY2hSZXN1bHQpOiByZXN1bHQgaXMgSVRleHRTZWFyY2hNYXRjaCB7XG5cdHJldHVybiAhISg8SVRleHRTZWFyY2hNYXRjaD5yZXN1bHQpLnJhbmdlTG9jYXRpb25zICYmICEhKDxJVGV4dFNlYXJjaE1hdGNoPnJlc3VsdCkucHJldmlld1RleHQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2dyZXNzTWVzc2FnZSB7XG5cdG1lc3NhZ2U6IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgSVNlYXJjaFByb2dyZXNzSXRlbSA9IElGaWxlTWF0Y2ggfCBJUHJvZ3Jlc3NNZXNzYWdlIHwgQUlTZWFyY2hLZXl3b3JkO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNGaWxlTWF0Y2gocDogSVNlYXJjaFByb2dyZXNzSXRlbSk6IHAgaXMgSUZpbGVNYXRjaCB7XG5cdHJldHVybiAhISg8SUZpbGVNYXRjaD5wKS5yZXNvdXJjZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQUlLZXl3b3JkKHA6IElTZWFyY2hQcm9ncmVzc0l0ZW0pOiBwIGlzIEFJU2VhcmNoS2V5d29yZCB7XG5cdHJldHVybiAhISg8QUlTZWFyY2hLZXl3b3JkPnApLmtleXdvcmQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Byb2dyZXNzTWVzc2FnZShwOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtIHwgSVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0pOiBwIGlzIElQcm9ncmVzc01lc3NhZ2Uge1xuXHRyZXR1cm4gISEocCBhcyBJUHJvZ3Jlc3NNZXNzYWdlKS5tZXNzYWdlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlIHtcblx0dGV4dDogc3RyaW5nO1xuXHR0eXBlOiBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZTtcblx0dHJ1c3RlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaENvbXBsZXRlU3RhdHMge1xuXHRsaW1pdEhpdD86IGJvb2xlYW47XG5cdG1lc3NhZ2VzOiBJVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVtdO1xuXHRzdGF0cz86IElGaWxlU2VhcmNoU3RhdHMgfCBJVGV4dFNlYXJjaFN0YXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hDb21wbGV0ZSBleHRlbmRzIElTZWFyY2hDb21wbGV0ZVN0YXRzIHtcblx0cmVzdWx0czogSUZpbGVNYXRjaFtdO1xuXHRleGl0PzogU2VhcmNoQ29tcGxldGlvbkV4aXRDb2RlO1xuXHRhaUtleXdvcmRzPzogQUlTZWFyY2hLZXl3b3JkW107XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNlYXJjaENvbXBsZXRpb25FeGl0Q29kZSB7XG5cdE5vcm1hbCxcblx0TmV3U2VhcmNoU3RhcnRlZFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0U2VhcmNoU3RhdHMge1xuXHR0eXBlOiAndGV4dFNlYXJjaFByb3ZpZGVyJyB8ICdzZWFyY2hQcm9jZXNzJyB8ICdhaVRleHRTZWFyY2hQcm92aWRlcic7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVTZWFyY2hTdGF0cyB7XG5cdGZyb21DYWNoZTogYm9vbGVhbjtcblx0ZGV0YWlsU3RhdHM6IElTZWFyY2hFbmdpbmVTdGF0cyB8IElDYWNoZWRTZWFyY2hTdGF0cyB8IElGaWxlU2VhcmNoUHJvdmlkZXJTdGF0cztcblxuXHRyZXN1bHRDb3VudDogbnVtYmVyO1xuXHR0eXBlOiAnZmlsZVNlYXJjaFByb3ZpZGVyJyB8ICdzZWFyY2hQcm9jZXNzJztcblx0c29ydGluZ1RpbWU/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNhY2hlZFNlYXJjaFN0YXRzIHtcblx0Y2FjaGVXYXNSZXNvbHZlZDogYm9vbGVhbjtcblx0Y2FjaGVMb29rdXBUaW1lOiBudW1iZXI7XG5cdGNhY2hlRmlsdGVyVGltZTogbnVtYmVyO1xuXHRjYWNoZUVudHJ5Q291bnQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VhcmNoRW5naW5lU3RhdHMge1xuXHRmaWxlV2Fsa1RpbWU6IG51bWJlcjtcblx0ZGlyZWN0b3JpZXNXYWxrZWQ6IG51bWJlcjtcblx0ZmlsZXNXYWxrZWQ6IG51bWJlcjtcblx0Y21kVGltZTogbnVtYmVyO1xuXHRjbWRSZXN1bHRDb3VudD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVNlYXJjaFByb3ZpZGVyU3RhdHMge1xuXHRwcm92aWRlclRpbWU6IG51bWJlcjtcblx0cG9zdFByb2Nlc3NUaW1lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlTWF0Y2ggaW1wbGVtZW50cyBJRmlsZU1hdGNoIHtcblx0cmVzdWx0czogSVRleHRTZWFyY2hSZXN1bHRbXSA9IFtdO1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVzb3VyY2U6IFVSSSkge1xuXHRcdC8vIGVtcHR5XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWFyY2hSYW5nZVNldFBhaXJpbmcge1xuXHRzb3VyY2U6IElTZWFyY2hSYW5nZTtcblx0cHJldmlldzogSVNlYXJjaFJhbmdlO1xufVxuXG5leHBvcnQgY2xhc3MgVGV4dFNlYXJjaE1hdGNoIGltcGxlbWVudHMgSVRleHRTZWFyY2hNYXRjaCB7XG5cdHJhbmdlTG9jYXRpb25zOiBTZWFyY2hSYW5nZVNldFBhaXJpbmdbXSA9IFtdO1xuXHRwcmV2aWV3VGV4dDogc3RyaW5nO1xuXHR3ZWJ2aWV3SW5kZXg/OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IodGV4dDogc3RyaW5nLCByYW5nZXM6IElTZWFyY2hSYW5nZSB8IElTZWFyY2hSYW5nZVtdLCBwcmV2aWV3T3B0aW9ucz86IElUZXh0U2VhcmNoUHJldmlld09wdGlvbnMsIHdlYnZpZXdJbmRleD86IG51bWJlcikge1xuXHRcdHRoaXMud2Vidmlld0luZGV4ID0gd2Vidmlld0luZGV4O1xuXG5cdFx0Ly8gVHJpbSBwcmV2aWV3IGlmIHRoaXMgaXMgb25lIG1hdGNoIGFuZCBhIHNpbmdsZS1saW5lIG1hdGNoIHdpdGggYSBwcmV2aWV3IHJlcXVlc3RlZC5cblx0XHQvLyBPdGhlcndpc2Ugc2VuZCB0aGUgZnVsbCB0ZXh0LCBsaWtlIGZvciByZXBsYWNlIG9yIGZvciBzaG93aW5nIG11bHRpcGxlIHByZXZpZXdzLlxuXHRcdC8vIFRPRE8gdGhpcyBpcyBmaXNoeS5cblx0XHRjb25zdCByYW5nZXNBcnIgPSBBcnJheS5pc0FycmF5KHJhbmdlcykgPyByYW5nZXMgOiBbcmFuZ2VzXTtcblxuXHRcdGlmIChwcmV2aWV3T3B0aW9ucyAmJiBwcmV2aWV3T3B0aW9ucy5tYXRjaExpbmVzID09PSAxICYmIGlzU2luZ2xlTGluZVJhbmdlTGlzdChyYW5nZXNBcnIpKSB7XG5cdFx0XHQvLyAxIGxpbmUgcHJldmlldyByZXF1ZXN0ZWRcblx0XHRcdHRleHQgPSBnZXROTGluZXModGV4dCwgcHJldmlld09wdGlvbnMubWF0Y2hMaW5lcyk7XG5cblx0XHRcdGxldCByZXN1bHQgPSAnJztcblx0XHRcdGxldCBzaGlmdCA9IDA7XG5cdFx0XHRsZXQgbGFzdEVuZCA9IDA7XG5cdFx0XHRjb25zdCBsZWFkaW5nQ2hhcnMgPSBNYXRoLmZsb29yKHByZXZpZXdPcHRpb25zLmNoYXJzUGVyTGluZSAvIDUpO1xuXHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiByYW5nZXNBcnIpIHtcblx0XHRcdFx0Y29uc3QgcHJldmlld1N0YXJ0ID0gTWF0aC5tYXgocmFuZ2Uuc3RhcnRDb2x1bW4gLSBsZWFkaW5nQ2hhcnMsIDApO1xuXHRcdFx0XHRjb25zdCBwcmV2aWV3RW5kID0gcmFuZ2Uuc3RhcnRDb2x1bW4gKyBwcmV2aWV3T3B0aW9ucy5jaGFyc1BlckxpbmU7XG5cdFx0XHRcdGlmIChwcmV2aWV3U3RhcnQgPiBsYXN0RW5kICsgbGVhZGluZ0NoYXJzICsgU0VBUkNIX0VMSURFRF9NSU5fTEVOKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWxpc2lvbiA9IFNFQVJDSF9FTElERURfUFJFRklYICsgKHByZXZpZXdTdGFydCAtIGxhc3RFbmQpICsgU0VBUkNIX0VMSURFRF9TVUZGSVg7XG5cdFx0XHRcdFx0cmVzdWx0ICs9IGVsaXNpb24gKyB0ZXh0LnNsaWNlKHByZXZpZXdTdGFydCwgcHJldmlld0VuZCk7XG5cdFx0XHRcdFx0c2hpZnQgKz0gcHJldmlld1N0YXJ0IC0gKGxhc3RFbmQgKyBlbGlzaW9uLmxlbmd0aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0ICs9IHRleHQuc2xpY2UobGFzdEVuZCwgcHJldmlld0VuZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsYXN0RW5kID0gcHJldmlld0VuZDtcblx0XHRcdFx0dGhpcy5yYW5nZUxvY2F0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRzb3VyY2U6IHJhbmdlLFxuXHRcdFx0XHRcdHByZXZpZXc6IG5ldyBPbmVMaW5lUmFuZ2UoMCwgcmFuZ2Uuc3RhcnRDb2x1bW4gLSBzaGlmdCwgcmFuZ2UuZW5kQ29sdW1uIC0gc2hpZnQpXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucHJldmlld1RleHQgPSByZXN1bHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGZpcnN0TWF0Y2hMaW5lID0gQXJyYXkuaXNBcnJheShyYW5nZXMpID8gcmFuZ2VzWzBdLnN0YXJ0TGluZU51bWJlciA6IHJhbmdlcy5zdGFydExpbmVOdW1iZXI7XG5cblx0XHRcdGNvbnN0IHJhbmdlTG9jcyA9IG1hcEFycmF5T3JOb3QocmFuZ2VzLCByID0+ICh7XG5cdFx0XHRcdHByZXZpZXc6IG5ldyBTZWFyY2hSYW5nZShyLnN0YXJ0TGluZU51bWJlciAtIGZpcnN0TWF0Y2hMaW5lLCByLnN0YXJ0Q29sdW1uLCByLmVuZExpbmVOdW1iZXIgLSBmaXJzdE1hdGNoTGluZSwgci5lbmRDb2x1bW4pLFxuXHRcdFx0XHRzb3VyY2U6IHJcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5yYW5nZUxvY2F0aW9ucyA9IEFycmF5LmlzQXJyYXkocmFuZ2VMb2NzKSA/IHJhbmdlTG9jcyA6IFtyYW5nZUxvY3NdO1xuXHRcdFx0dGhpcy5wcmV2aWV3VGV4dCA9IHRleHQ7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGlzU2luZ2xlTGluZVJhbmdlTGlzdChyYW5nZXM6IElTZWFyY2hSYW5nZVtdKTogYm9vbGVhbiB7XG5cdGNvbnN0IGxpbmUgPSByYW5nZXNbMF0uc3RhcnRMaW5lTnVtYmVyO1xuXHRmb3IgKGNvbnN0IHIgb2YgcmFuZ2VzKSB7XG5cdFx0aWYgKHIuc3RhcnRMaW5lTnVtYmVyICE9PSBsaW5lIHx8IHIuZW5kTGluZU51bWJlciAhPT0gbGluZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgY2xhc3MgU2VhcmNoUmFuZ2UgaW1wbGVtZW50cyBJU2VhcmNoUmFuZ2Uge1xuXHRzdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0c3RhcnRDb2x1bW46IG51bWJlcjtcblx0ZW5kTGluZU51bWJlcjogbnVtYmVyO1xuXHRlbmRDb2x1bW46IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihzdGFydExpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlcikge1xuXHRcdHRoaXMuc3RhcnRMaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdHRoaXMuc3RhcnRDb2x1bW4gPSBzdGFydENvbHVtbjtcblx0XHR0aGlzLmVuZExpbmVOdW1iZXIgPSBlbmRMaW5lTnVtYmVyO1xuXHRcdHRoaXMuZW5kQ29sdW1uID0gZW5kQ29sdW1uO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPbmVMaW5lUmFuZ2UgZXh0ZW5kcyBTZWFyY2hSYW5nZSB7XG5cdGNvbnN0cnVjdG9yKGxpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIpIHtcblx0XHRzdXBlcihsaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgbGluZU51bWJlciwgZW5kQ29sdW1uKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBWaWV3TW9kZSB7XG5cdExpc3QgPSAnbGlzdCcsXG5cdFRyZWUgPSAndHJlZSdcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU2VhcmNoU29ydE9yZGVyIHtcblx0RGVmYXVsdCA9ICdkZWZhdWx0Jyxcblx0RmlsZU5hbWVzID0gJ2ZpbGVOYW1lcycsXG5cdFR5cGUgPSAndHlwZScsXG5cdE1vZGlmaWVkID0gJ21vZGlmaWVkJyxcblx0Q291bnREZXNjZW5kaW5nID0gJ2NvdW50RGVzY2VuZGluZycsXG5cdENvdW50QXNjZW5kaW5nID0gJ2NvdW50QXNjZW5kaW5nJ1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTZW1hbnRpY1NlYXJjaEJlaGF2aW9yIHtcblx0QXV0byA9ICdhdXRvJyxcblx0TWFudWFsID0gJ21hbnVhbCcsXG5cdFJ1bk9uRW1wdHkgPSAncnVuT25FbXB0eScsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIHtcblx0ZXhjbHVkZTogZ2xvYi5JRXhwcmVzc2lvbjtcblx0LyoqXG5cdCAqIFVzZSBpZ25vcmUgZmlsZSBmb3IgZmlsZSBzZWFyY2guXG5cdCAqL1xuXHR1c2VJZ25vcmVGaWxlczogYm9vbGVhbjtcblx0dXNlR2xvYmFsSWdub3JlRmlsZXM6IGJvb2xlYW47XG5cdHVzZVBhcmVudElnbm9yZUZpbGVzOiBib29sZWFuO1xuXHRmb2xsb3dTeW1saW5rczogYm9vbGVhbjtcblx0c21hcnRDYXNlOiBib29sZWFuO1xuXHRnbG9iYWxGaW5kQ2xpcGJvYXJkOiBib29sZWFuO1xuXHR1c2VSZXBsYWNlUHJldmlldzogYm9vbGVhbjtcblx0c2hvd0xpbmVOdW1iZXJzOiBib29sZWFuO1xuXHRhY3Rpb25zUG9zaXRpb246ICdhdXRvJyB8ICdyaWdodCc7XG5cdG1heFJlc3VsdHM6IG51bWJlciB8IG51bGw7XG5cdGNvbGxhcHNlUmVzdWx0czogJ2F1dG8nIHwgJ2Fsd2F5c0NvbGxhcHNlJyB8ICdhbHdheXNFeHBhbmQnO1xuXHRzZWFyY2hPblR5cGU6IGJvb2xlYW47XG5cdHNlZWRPbkZvY3VzOiBib29sZWFuO1xuXHRzZWVkV2l0aE5lYXJlc3RXb3JkOiBib29sZWFuO1xuXHRzZWFyY2hPblR5cGVEZWJvdW5jZVBlcmlvZDogbnVtYmVyO1xuXHRtb2RlOiAndmlldycgfCAncmV1c2VFZGl0b3InIHwgJ25ld0VkaXRvcic7XG5cdHNlYXJjaEVkaXRvcjoge1xuXHRcdGRvdWJsZUNsaWNrQmVoYXZpb3VyOiAnc2VsZWN0V29yZCcgfCAnZ29Ub0xvY2F0aW9uJyB8ICdvcGVuTG9jYXRpb25Ub1NpZGUnO1xuXHRcdHNpbmdsZUNsaWNrQmVoYXZpb3VyOiAnZGVmYXVsdCcgfCAncGVla0RlZmluaXRpb24nO1xuXHRcdHJldXNlUHJpb3JTZWFyY2hDb25maWd1cmF0aW9uOiBib29sZWFuO1xuXHRcdGRlZmF1bHROdW1iZXJPZkNvbnRleHRMaW5lczogbnVtYmVyIHwgbnVsbDtcblx0XHRmb2N1c1Jlc3VsdHNPblNlYXJjaDogYm9vbGVhbjtcblx0XHRleHBlcmltZW50YWw6IHt9O1xuXHR9O1xuXHRzb3J0T3JkZXI6IFNlYXJjaFNvcnRPcmRlcjtcblx0ZGVjb3JhdGlvbnM6IHtcblx0XHRjb2xvcnM6IGJvb2xlYW47XG5cdFx0YmFkZ2VzOiBib29sZWFuO1xuXHR9O1xuXHRxdWlja0FjY2Vzczoge1xuXHRcdHByZXNlcnZlSW5wdXQ6IGJvb2xlYW47XG5cdH07XG5cdGRlZmF1bHRWaWV3TW9kZTogVmlld01vZGU7XG5cdGV4cGVyaW1lbnRhbDoge1xuXHRcdGNsb3NlZE5vdGVib29rUmljaENvbnRlbnRSZXN1bHRzOiBib29sZWFuO1xuXHR9O1xuXHRzZWFyY2hWaWV3OiB7XG5cdFx0c2VtYW50aWNTZWFyY2hCZWhhdmlvcjogc3RyaW5nO1xuXHRcdGtleXdvcmRTdWdnZXN0aW9uczogYm9vbGVhbjtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VhcmNoQ29uZmlndXJhdGlvbiBleHRlbmRzIElGaWxlc0NvbmZpZ3VyYXRpb24ge1xuXHRzZWFyY2g/OiBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXM7XG5cdGVkaXRvcjoge1xuXHRcdHdvcmRTZXBhcmF0b3JzOiBzdHJpbmc7XG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFeGNsdWRlcyhjb25maWd1cmF0aW9uOiBJU2VhcmNoQ29uZmlndXJhdGlvbiwgaW5jbHVkZVNlYXJjaEV4Y2x1ZGVzID0gdHJ1ZSk6IGdsb2IuSUV4cHJlc3Npb24gfCB1bmRlZmluZWQge1xuXHRjb25zdCBmaWxlRXhjbHVkZXMgPSBjb25maWd1cmF0aW9uICYmIGNvbmZpZ3VyYXRpb24uZmlsZXMgJiYgY29uZmlndXJhdGlvbi5maWxlcy5leGNsdWRlO1xuXHRjb25zdCBzZWFyY2hFeGNsdWRlcyA9IGluY2x1ZGVTZWFyY2hFeGNsdWRlcyAmJiBjb25maWd1cmF0aW9uICYmIGNvbmZpZ3VyYXRpb24uc2VhcmNoICYmIGNvbmZpZ3VyYXRpb24uc2VhcmNoLmV4Y2x1ZGU7XG5cblx0aWYgKCFmaWxlRXhjbHVkZXMgJiYgIXNlYXJjaEV4Y2x1ZGVzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmICghZmlsZUV4Y2x1ZGVzIHx8ICFzZWFyY2hFeGNsdWRlcykge1xuXHRcdHJldHVybiBmaWxlRXhjbHVkZXMgfHwgc2VhcmNoRXhjbHVkZXMgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0bGV0IGFsbEV4Y2x1ZGVzOiBnbG9iLklFeHByZXNzaW9uID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0Ly8gY2xvbmUgdGhlIGNvbmZpZyBhcyBpdCBjb3VsZCBiZSBmcm96ZW5cblx0YWxsRXhjbHVkZXMgPSBvYmplY3RzLm1peGluKGFsbEV4Y2x1ZGVzLCBvYmplY3RzLmRlZXBDbG9uZShmaWxlRXhjbHVkZXMpKTtcblx0YWxsRXhjbHVkZXMgPSBvYmplY3RzLm1peGluKGFsbEV4Y2x1ZGVzLCBvYmplY3RzLmRlZXBDbG9uZShzZWFyY2hFeGNsdWRlcyksIHRydWUpO1xuXG5cdHJldHVybiBhbGxFeGNsdWRlcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhdGhJbmNsdWRlZEluUXVlcnkocXVlcnlQcm9wczogSUNvbW1vblF1ZXJ5UHJvcHM8VVJJPiwgZnNQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgZ2xvYk9wdGlvbnMgPSBxdWVyeVByb3BzLmlnbm9yZUdsb2JDYXNlID8geyBpZ25vcmVDYXNlOiB0cnVlIH0gOiB1bmRlZmluZWQ7XG5cdGlmIChxdWVyeVByb3BzLmV4Y2x1ZGVQYXR0ZXJuICYmIGdsb2IubWF0Y2gocXVlcnlQcm9wcy5leGNsdWRlUGF0dGVybiwgZnNQYXRoLCBnbG9iT3B0aW9ucykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAocXVlcnlQcm9wcy5pbmNsdWRlUGF0dGVybiB8fCBxdWVyeVByb3BzLnVzaW5nU2VhcmNoUGF0aHMpIHtcblx0XHRpZiAocXVlcnlQcm9wcy5pbmNsdWRlUGF0dGVybiAmJiBnbG9iLm1hdGNoKHF1ZXJ5UHJvcHMuaW5jbHVkZVBhdHRlcm4sIGZzUGF0aCwgZ2xvYk9wdGlvbnMpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBJZiBzZWFyY2hQYXRocyBhcmUgYmVpbmcgdXNlZCwgdGhlIGV4dHJhIGZpbGUgbXVzdCBiZSBpbiBhIHN1YmZvbGRlciBhbmQgbWF0Y2ggdGhlIHBhdHRlcm4sIGlmIHByZXNlbnRcblx0XHRpZiAocXVlcnlQcm9wcy51c2luZ1NlYXJjaFBhdGhzKSB7XG5cdFx0XHRyZXR1cm4gISFxdWVyeVByb3BzLmZvbGRlclF1ZXJpZXMgJiYgcXVlcnlQcm9wcy5mb2xkZXJRdWVyaWVzLnNvbWUoZnEgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWFyY2hQYXRoID0gZnEuZm9sZGVyLmZzUGF0aDtcblx0XHRcdFx0aWYgKGV4dHBhdGguaXNFcXVhbE9yUGFyZW50KGZzUGF0aCwgc2VhcmNoUGF0aCwgcXVlcnlQcm9wcy5pZ25vcmVHbG9iQ2FzZSkpIHtcblx0XHRcdFx0XHRjb25zdCByZWxQYXRoID0gcGF0aHMucmVsYXRpdmUoc2VhcmNoUGF0aCwgZnNQYXRoKTtcblx0XHRcdFx0XHRyZXR1cm4gIWZxLmluY2x1ZGVQYXR0ZXJuIHx8ICEhZ2xvYi5tYXRjaChmcS5pbmNsdWRlUGF0dGVybiwgcmVsUGF0aCwgZ2xvYk9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBlbnVtIFNlYXJjaEVycm9yQ29kZSB7XG5cdHVua25vd25FbmNvZGluZyA9IDEsXG5cdHJlZ2V4UGFyc2VFcnJvcixcblx0Z2xvYlBhcnNlRXJyb3IsXG5cdGludmFsaWRMaXRlcmFsLFxuXHRyZ1Byb2Nlc3NFcnJvcixcblx0b3RoZXIsXG5cdGNhbmNlbGVkXG59XG5cbmV4cG9ydCBjbGFzcyBTZWFyY2hFcnJvciBleHRlbmRzIEVycm9yIHtcblx0Y29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nLCByZWFkb25seSBjb2RlPzogU2VhcmNoRXJyb3JDb2RlKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlc2VyaWFsaXplU2VhcmNoRXJyb3IoZXJyb3I6IEVycm9yKTogU2VhcmNoRXJyb3Ige1xuXHRjb25zdCBlcnJvck1zZyA9IGVycm9yLm1lc3NhZ2U7XG5cblx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0cmV0dXJuIG5ldyBTZWFyY2hFcnJvcihlcnJvck1zZywgU2VhcmNoRXJyb3JDb2RlLmNhbmNlbGVkKTtcblx0fVxuXG5cdHRyeSB7XG5cdFx0Y29uc3QgZGV0YWlscyA9IEpTT04ucGFyc2UoZXJyb3JNc2cpO1xuXHRcdHJldHVybiBuZXcgU2VhcmNoRXJyb3IoZGV0YWlscy5tZXNzYWdlLCBkZXRhaWxzLmNvZGUpO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0cmV0dXJuIG5ldyBTZWFyY2hFcnJvcihlcnJvck1zZywgU2VhcmNoRXJyb3JDb2RlLm90aGVyKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplU2VhcmNoRXJyb3Ioc2VhcmNoRXJyb3I6IFNlYXJjaEVycm9yKTogRXJyb3Ige1xuXHRjb25zdCBkZXRhaWxzID0geyBtZXNzYWdlOiBzZWFyY2hFcnJvci5tZXNzYWdlLCBjb2RlOiBzZWFyY2hFcnJvci5jb2RlIH07XG5cdHJldHVybiBuZXcgRXJyb3IoSlNPTi5zdHJpbmdpZnkoZGV0YWlscykpO1xufVxuZXhwb3J0IGludGVyZmFjZSBJVGVsZW1ldHJ5RXZlbnQge1xuXHRldmVudE5hbWU6IHN0cmluZztcblx0ZGF0YTogSVRlbGVtZXRyeURhdGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJhd1NlYXJjaFNlcnZpY2Uge1xuXHRmaWxlU2VhcmNoKHNlYXJjaDogSVJhd0ZpbGVRdWVyeSk6IEV2ZW50PElTZXJpYWxpemVkU2VhcmNoUHJvZ3Jlc3NJdGVtIHwgSVNlcmlhbGl6ZWRTZWFyY2hDb21wbGV0ZT47XG5cdHRleHRTZWFyY2goc2VhcmNoOiBJUmF3VGV4dFF1ZXJ5KTogRXZlbnQ8SVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0gfCBJU2VyaWFsaXplZFNlYXJjaENvbXBsZXRlPjtcblx0Y2xlYXJDYWNoZShjYWNoZUtleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmF3RmlsZU1hdGNoIHtcblx0YmFzZT86IHN0cmluZztcblx0LyoqXG5cdCAqIFRoZSBwYXRoIG9mIHRoZSBmaWxlIHJlbGF0aXZlIHRvIHRoZSBjb250YWluaW5nIGBiYXNlYCBmb2xkZXIuXG5cdCAqIFRoaXMgcGF0aCBpcyBleGFjdGx5IGFzIGl0IGFwcGVhcnMgb24gdGhlIGZpbGVzeXN0ZW0uXG5cdCAqL1xuXHRyZWxhdGl2ZVBhdGg6IHN0cmluZztcblx0LyoqXG5cdCAqIFRoaXMgcGF0aCBpcyB0cmFuc2Zvcm1lZCBmb3Igc2VhcmNoIHB1cnBvc2VzLiBGb3IgZXhhbXBsZSwgdGhpcyBjb3VsZCBiZVxuXHQgKiB0aGUgYHJlbGF0aXZlUGF0aGAgd2l0aCB0aGUgd29ya3NwYWNlIGZvbGRlciBuYW1lIHByZXBlbmRlZC4gVGhpcyB3YXkgdGhlXG5cdCAqIHNlYXJjaCBhbGdvcml0aG0gd291bGQgYWxzbyBtYXRjaCBhZ2FpbnN0IHRoZSBuYW1lIG9mIHRoZSBjb250YWluaW5nIGZvbGRlci5cblx0ICpcblx0ICogSWYgbm90IGdpdmVuLCB0aGUgc2VhcmNoIGFsZ29yaXRobSBzaG91bGQgdXNlIGByZWxhdGl2ZVBhdGhgLlxuXHQgKi9cblx0c2VhcmNoUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hFbmdpbmU8VD4ge1xuXHRzZWFyY2g6IChvblJlc3VsdDogKG1hdGNoZXM6IFQpID0+IHZvaWQsIG9uUHJvZ3Jlc3M6IChwcm9ncmVzczogSVByb2dyZXNzTWVzc2FnZSkgPT4gdm9pZCwgZG9uZTogKGVycm9yOiBFcnJvciB8IG51bGwsIGNvbXBsZXRlOiBJU2VhcmNoRW5naW5lU3VjY2VzcykgPT4gdm9pZCkgPT4gdm9pZDtcblx0Y2FuY2VsOiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkU2VhcmNoU3VjY2VzcyB7XG5cdHR5cGU6ICdzdWNjZXNzJztcblx0bGltaXRIaXQ6IGJvb2xlYW47XG5cdG1lc3NhZ2VzOiBJVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVtdO1xuXHRzdGF0cz86IElGaWxlU2VhcmNoU3RhdHMgfCBJVGV4dFNlYXJjaFN0YXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hFbmdpbmVTdWNjZXNzIHtcblx0bGltaXRIaXQ6IGJvb2xlYW47XG5cdG1lc3NhZ2VzOiBJVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVtdO1xuXHRzdGF0czogSVNlYXJjaEVuZ2luZVN0YXRzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkU2VhcmNoRXJyb3Ige1xuXHR0eXBlOiAnZXJyb3InO1xuXHRlcnJvcjoge1xuXHRcdG1lc3NhZ2U6IHN0cmluZztcblx0XHRzdGFjazogc3RyaW5nO1xuXHR9O1xufVxuXG5leHBvcnQgdHlwZSBJU2VyaWFsaXplZFNlYXJjaENvbXBsZXRlID0gSVNlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzIHwgSVNlcmlhbGl6ZWRTZWFyY2hFcnJvcjtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzU2VyaWFsaXplZFNlYXJjaENvbXBsZXRlKGFyZzogSVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0gfCBJU2VyaWFsaXplZFNlYXJjaENvbXBsZXRlKTogYXJnIGlzIElTZXJpYWxpemVkU2VhcmNoQ29tcGxldGUge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0aWYgKChhcmcgYXMgYW55KS50eXBlID09PSAnZXJyb3InKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdH0gZWxzZSBpZiAoKGFyZyBhcyBhbnkpLnR5cGUgPT09ICdzdWNjZXNzJykge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTZXJpYWxpemVkU2VhcmNoU3VjY2Vzcyhhcmc6IElTZXJpYWxpemVkU2VhcmNoQ29tcGxldGUpOiBhcmcgaXMgSVNlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzIHtcblx0cmV0dXJuIGFyZy50eXBlID09PSAnc3VjY2Vzcyc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NlcmlhbGl6ZWRGaWxlTWF0Y2goYXJnOiBJU2VyaWFsaXplZFNlYXJjaFByb2dyZXNzSXRlbSk6IGFyZyBpcyBJU2VyaWFsaXplZEZpbGVNYXRjaCB7XG5cdHJldHVybiAhISg8SVNlcmlhbGl6ZWRGaWxlTWF0Y2g+YXJnKS5wYXRoO1xufVxuXG5jb25zdCBmaWxlUGF0dGVybklnbm9yZUNhc2VPcHRpb25zID0geyBpZ25vcmVDYXNlOiB0cnVlIH07XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ZpbGVQYXR0ZXJuTWF0Y2goY2FuZGlkYXRlOiBJUmF3RmlsZU1hdGNoLCBmaWxlUGF0dGVyblRvVXNlOiBzdHJpbmcsIGZ1enp5ID0gdHJ1ZSwgaWdub3JlQ2FzZT86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0Y29uc3QgcGF0aFRvTWF0Y2ggPSBjYW5kaWRhdGUuc2VhcmNoUGF0aCA/IGNhbmRpZGF0ZS5zZWFyY2hQYXRoIDogY2FuZGlkYXRlLnJlbGF0aXZlUGF0aDtcblx0cmV0dXJuIGZ1enp5ID9cblx0XHRmdXp6eUNvbnRhaW5zKHBhdGhUb01hdGNoLCBmaWxlUGF0dGVyblRvVXNlKSA6XG5cdFx0Z2xvYi5tYXRjaChmaWxlUGF0dGVyblRvVXNlLCBwYXRoVG9NYXRjaCwgaWdub3JlQ2FzZSA/IGZpbGVQYXR0ZXJuSWdub3JlQ2FzZU9wdGlvbnMgOiB1bmRlZmluZWQpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkRmlsZU1hdGNoIHtcblx0cGF0aDogc3RyaW5nO1xuXHRyZXN1bHRzPzogSVRleHRTZWFyY2hSZXN1bHRbXTtcblx0bnVtTWF0Y2hlcz86IG51bWJlcjtcbn1cblxuLy8gVHlwZSBvZiB0aGUgcG9zc2libGUgdmFsdWVzIGZvciBwcm9ncmVzcyBjYWxscyBmcm9tIHRoZSBlbmdpbmVcbmV4cG9ydCB0eXBlIElTZXJpYWxpemVkU2VhcmNoUHJvZ3Jlc3NJdGVtID0gSVNlcmlhbGl6ZWRGaWxlTWF0Y2ggfCBJU2VyaWFsaXplZEZpbGVNYXRjaFtdIHwgSVByb2dyZXNzTWVzc2FnZTtcbmV4cG9ydCB0eXBlIElGaWxlU2VhcmNoUHJvZ3Jlc3NJdGVtID0gSVJhd0ZpbGVNYXRjaCB8IElSYXdGaWxlTWF0Y2hbXSB8IElQcm9ncmVzc01lc3NhZ2U7XG5cblxuZXhwb3J0IGNsYXNzIFNlcmlhbGl6YWJsZUZpbGVNYXRjaCBpbXBsZW1lbnRzIElTZXJpYWxpemVkRmlsZU1hdGNoIHtcblx0cGF0aDogc3RyaW5nO1xuXHRyZXN1bHRzOiBJVGV4dFNlYXJjaE1hdGNoW107XG5cblx0Y29uc3RydWN0b3IocGF0aDogc3RyaW5nKSB7XG5cdFx0dGhpcy5wYXRoID0gcGF0aDtcblx0XHR0aGlzLnJlc3VsdHMgPSBbXTtcblx0fVxuXG5cdGFkZE1hdGNoKG1hdGNoOiBJVGV4dFNlYXJjaE1hdGNoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXN1bHRzLnB1c2gobWF0Y2gpO1xuXHR9XG5cblx0c2VyaWFsaXplKCk6IElTZXJpYWxpemVkRmlsZU1hdGNoIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGF0aDogdGhpcy5wYXRoLFxuXHRcdFx0cmVzdWx0czogdGhpcy5yZXN1bHRzLFxuXHRcdFx0bnVtTWF0Y2hlczogdGhpcy5yZXN1bHRzLmxlbmd0aFxuXHRcdH07XG5cdH1cbn1cblxuLyoqXG4gKiAgQ29tcHV0ZXMgdGhlIHBhdHRlcm5zIHRoYXQgdGhlIHByb3ZpZGVyIGhhbmRsZXMuIERpc2NhcmRzIHNpYmxpbmcgY2xhdXNlcyBhbmQgJ2ZhbHNlJyBwYXR0ZXJuc1xuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVBhdHRlcm5zRm9yUHJvdmlkZXIoZ2xvYmFsUGF0dGVybjogZ2xvYi5JRXhwcmVzc2lvbiB8IHVuZGVmaW5lZCwgZm9sZGVyUGF0dGVybjogZ2xvYi5JRXhwcmVzc2lvbiB8IHVuZGVmaW5lZCk6IHN0cmluZ1tdIHtcblx0Y29uc3QgbWVyZ2VkID0ge1xuXHRcdC4uLihnbG9iYWxQYXR0ZXJuIHx8IHt9KSxcblx0XHQuLi4oZm9sZGVyUGF0dGVybiB8fCB7fSlcblx0fTtcblxuXHRyZXR1cm4gT2JqZWN0LmtleXMobWVyZ2VkKVxuXHRcdC5maWx0ZXIoa2V5ID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gbWVyZ2VkW2tleV07XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicgJiYgdmFsdWU7XG5cdFx0fSk7XG59XG5cbmV4cG9ydCBjbGFzcyBRdWVyeUdsb2JUZXN0ZXIge1xuXG5cdHByaXZhdGUgX2V4Y2x1ZGVFeHByZXNzaW9uOiBnbG9iLklFeHByZXNzaW9uW107IC8vIFRPRE86IGV2YWx1YXRlIGdsb2JzIGJhc2VkIG9uIGJhc2VVUkkgb2YgcGF0dGVyblxuXHRwcml2YXRlIF9wYXJzZWRFeGNsdWRlRXhwcmVzc2lvbjogZ2xvYi5QYXJzZWRFeHByZXNzaW9uW107XG5cblx0cHJpdmF0ZSBfcGFyc2VkSW5jbHVkZUV4cHJlc3Npb246IGdsb2IuUGFyc2VkRXhwcmVzc2lvbiB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKGNvbmZpZzogSVNlYXJjaFF1ZXJ5LCBmb2xkZXJRdWVyeTogSUZvbGRlclF1ZXJ5KSB7XG5cdFx0Y29uc3QgZ2xvYk9wdGlvbnMgPSBjb25maWcuaWdub3JlR2xvYkNhc2UgfHwgZm9sZGVyUXVlcnkuaWdub3JlR2xvYkNhc2UgPyB7IGlnbm9yZUNhc2U6IHRydWUgfSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIHRvZG86IHRyeSB0byBpbmNvcnBvcmF0ZSBmb2xkZXJRdWVyeS5leGNsdWRlUGF0dGVybi5mb2xkZXIgaWYgYXZhaWxhYmxlXG5cdFx0dGhpcy5fZXhjbHVkZUV4cHJlc3Npb24gPSBmb2xkZXJRdWVyeS5leGNsdWRlUGF0dGVybj8ubWFwKGV4Y2x1ZGVQYXR0ZXJuID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLihjb25maWcuZXhjbHVkZVBhdHRlcm4gfHwge30pLFxuXHRcdFx0XHQuLi4oZXhjbHVkZVBhdHRlcm4ucGF0dGVybiB8fCB7fSlcblx0XHRcdH0gc2F0aXNmaWVzIGdsb2IuSUV4cHJlc3Npb247XG5cdFx0fSkgPz8gW107XG5cblx0XHRpZiAodGhpcy5fZXhjbHVkZUV4cHJlc3Npb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBldmVuIGlmIHRoZXJlIGFyZSBubyBmb2xkZXJRdWVyaWVzLCB3ZSB3YW50IHRvIG9ic2VydmUgIHRoZSBnbG9iYWwgZXhjbHVkZXNcblx0XHRcdHRoaXMuX2V4Y2x1ZGVFeHByZXNzaW9uID0gW2NvbmZpZy5leGNsdWRlUGF0dGVybiB8fCB7fV07XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGFyc2VkRXhjbHVkZUV4cHJlc3Npb24gPSB0aGlzLl9leGNsdWRlRXhwcmVzc2lvbi5tYXAoZSA9PiBnbG9iLnBhcnNlKGUsIGdsb2JPcHRpb25zKSk7XG5cblx0XHQvLyBFbXB0eSBpbmNsdWRlRXhwcmVzc2lvbiBtZWFucyBpbmNsdWRlIG5vdGhpbmcsIHNvIG5vIHt9IHNob3J0Y3V0c1xuXHRcdGxldCBpbmNsdWRlRXhwcmVzc2lvbjogZ2xvYi5JRXhwcmVzc2lvbiB8IHVuZGVmaW5lZCA9IGNvbmZpZy5pbmNsdWRlUGF0dGVybjtcblx0XHRpZiAoZm9sZGVyUXVlcnkuaW5jbHVkZVBhdHRlcm4pIHtcblx0XHRcdGlmIChpbmNsdWRlRXhwcmVzc2lvbikge1xuXHRcdFx0XHRpbmNsdWRlRXhwcmVzc2lvbiA9IHtcblx0XHRcdFx0XHQuLi5pbmNsdWRlRXhwcmVzc2lvbixcblx0XHRcdFx0XHQuLi5mb2xkZXJRdWVyeS5pbmNsdWRlUGF0dGVyblxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5jbHVkZUV4cHJlc3Npb24gPSBmb2xkZXJRdWVyeS5pbmNsdWRlUGF0dGVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaW5jbHVkZUV4cHJlc3Npb24pIHtcblx0XHRcdHRoaXMuX3BhcnNlZEluY2x1ZGVFeHByZXNzaW9uID0gZ2xvYi5wYXJzZShpbmNsdWRlRXhwcmVzc2lvbiwgZ2xvYk9wdGlvbnMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2V2YWxQYXJzZWRFeGNsdWRlRXhwcmVzc2lvbih0ZXN0UGF0aDogc3RyaW5nLCBiYXNlbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBoYXNTaWJsaW5nPzogKG5hbWU6IHN0cmluZykgPT4gYm9vbGVhbik6IHN0cmluZyB8IG51bGwge1xuXHRcdC8vIHRvZG86IGxlc3MgaGFja3kgd2F5IG9mIGV2YWx1YXRpbmcgc3luYyB2cyBhc3luYyBzaWJsaW5nIGNsYXVzZXNcblx0XHRsZXQgcmVzdWx0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRcdGZvciAoY29uc3QgZm9sZGVyRXhjbHVkZSBvZiB0aGlzLl9wYXJzZWRFeGNsdWRlRXhwcmVzc2lvbikge1xuXG5cdFx0XHQvLyBmaW5kIGZpcnN0IG5vbi1udWxsIHJlc3VsdFxuXHRcdFx0Y29uc3QgZXZhbHVhdGlvbiA9IGZvbGRlckV4Y2x1ZGUodGVzdFBhdGgsIGJhc2VuYW1lLCBoYXNTaWJsaW5nKTtcblxuXHRcdFx0aWYgKHR5cGVvZiBldmFsdWF0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXN1bHQgPSBldmFsdWF0aW9uO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cblx0bWF0Y2hlc0V4Y2x1ZGVzU3luYyh0ZXN0UGF0aDogc3RyaW5nLCBiYXNlbmFtZT86IHN0cmluZywgaGFzU2libGluZz86IChuYW1lOiBzdHJpbmcpID0+IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fcGFyc2VkRXhjbHVkZUV4cHJlc3Npb24gJiYgdGhpcy5fZXZhbFBhcnNlZEV4Y2x1ZGVFeHByZXNzaW9uKHRlc3RQYXRoLCBiYXNlbmFtZSwgaGFzU2libGluZykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHdWFyYW50ZWVkIHN5bmMgLSBzaWJsaW5nc0ZuIHNob3VsZCBub3QgcmV0dXJuIGEgcHJvbWlzZS5cblx0ICovXG5cdGluY2x1ZGVkSW5RdWVyeVN5bmModGVzdFBhdGg6IHN0cmluZywgYmFzZW5hbWU/OiBzdHJpbmcsIGhhc1NpYmxpbmc/OiAobmFtZTogc3RyaW5nKSA9PiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3BhcnNlZEV4Y2x1ZGVFeHByZXNzaW9uICYmIHRoaXMuX2V2YWxQYXJzZWRFeGNsdWRlRXhwcmVzc2lvbih0ZXN0UGF0aCwgYmFzZW5hbWUsIGhhc1NpYmxpbmcpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BhcnNlZEluY2x1ZGVFeHByZXNzaW9uICYmICF0aGlzLl9wYXJzZWRJbmNsdWRlRXhwcmVzc2lvbih0ZXN0UGF0aCwgYmFzZW5hbWUsIGhhc1NpYmxpbmcpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogRXZhbHVhdGluZyB0aGUgZXhjbHVkZSBleHByZXNzaW9uIGlzIG9ubHkgYXN5bmMgaWYgaXQgaW5jbHVkZXMgc2libGluZyBjbGF1c2VzLiBBcyBhbiBvcHRpbWl6YXRpb24sIGF2b2lkIGRvaW5nIGFueXRoaW5nIHdpdGggUHJvbWlzZXNcblx0ICogdW5sZXNzIHRoZSBleHByZXNzaW9uIGlzIGFzeW5jLlxuXHQgKi9cblx0aW5jbHVkZWRJblF1ZXJ5KHRlc3RQYXRoOiBzdHJpbmcsIGJhc2VuYW1lPzogc3RyaW5nLCBoYXNTaWJsaW5nPzogKG5hbWU6IHN0cmluZykgPT4gYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4pOiBQcm9taXNlPGJvb2xlYW4+IHwgYm9vbGVhbiB7XG5cblx0XHRjb25zdCBpc0luY2x1ZGVkID0gKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BhcnNlZEluY2x1ZGVFeHByZXNzaW9uID9cblx0XHRcdFx0ISEodGhpcy5fcGFyc2VkSW5jbHVkZUV4cHJlc3Npb24odGVzdFBhdGgsIGJhc2VuYW1lLCBoYXNTaWJsaW5nKSkgOlxuXHRcdFx0XHR0cnVlO1xuXHRcdH07XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwodGhpcy5fcGFyc2VkRXhjbHVkZUV4cHJlc3Npb24ubWFwKGUgPT4ge1xuXHRcdFx0Y29uc3QgZXhjbHVkZWQgPSBlKHRlc3RQYXRoLCBiYXNlbmFtZSwgaGFzU2libGluZyk7XG5cdFx0XHRpZiAoaXNUaGVuYWJsZShleGNsdWRlZCkpIHtcblx0XHRcdFx0cmV0dXJuIGV4Y2x1ZGVkLnRoZW4oZXhjbHVkZWQgPT4ge1xuXHRcdFx0XHRcdGlmIChleGNsdWRlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBpc0luY2x1ZGVkKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaXNJbmNsdWRlZCgpO1xuXG5cdFx0fSkpLnRoZW4oZSA9PiBlLnNvbWUoZSA9PiAhIWUpKTtcblxuXG5cdH1cblxuXHRoYXNTaWJsaW5nRXhjbHVkZUNsYXVzZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4Y2x1ZGVFeHByZXNzaW9uLnJlZHVjZSgocHJldiwgY3VycikgPT4gaGFzU2libGluZ0NsYXVzZXMoY3VycikgfHwgcHJldiwgZmFsc2UpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGhhc1NpYmxpbmdDbGF1c2VzKHBhdHRlcm46IGdsb2IuSUV4cHJlc3Npb24pOiBib29sZWFuIHtcblx0Zm9yIChjb25zdCBrZXkgaW4gcGF0dGVybikge1xuXHRcdGlmICh0eXBlb2YgcGF0dGVybltrZXldICE9PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc1NpYmxpbmdQcm9taXNlRm4oc2libGluZ3NGbj86ICgpID0+IFByb21pc2U8c3RyaW5nW10+KSB7XG5cdGlmICghc2libGluZ3NGbikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgc2libGluZ3M6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdHJ1ZT4+O1xuXHRyZXR1cm4gKG5hbWU6IHN0cmluZykgPT4ge1xuXHRcdGlmICghc2libGluZ3MpIHtcblx0XHRcdHNpYmxpbmdzID0gKHNpYmxpbmdzRm4oKSB8fCBQcm9taXNlLnJlc29sdmUoW10pKVxuXHRcdFx0XHQudGhlbihsaXN0ID0+IGxpc3QgPyBsaXN0VG9NYXAobGlzdCkgOiB7fSk7XG5cdFx0fVxuXHRcdHJldHVybiBzaWJsaW5ncy50aGVuKG1hcCA9PiAhIW1hcFtuYW1lXSk7XG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNTaWJsaW5nRm4oc2libGluZ3NGbj86ICgpID0+IHN0cmluZ1tdKSB7XG5cdGlmICghc2libGluZ3NGbikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgc2libGluZ3M6IFJlY29yZDxzdHJpbmcsIHRydWU+O1xuXHRyZXR1cm4gKG5hbWU6IHN0cmluZykgPT4ge1xuXHRcdGlmICghc2libGluZ3MpIHtcblx0XHRcdGNvbnN0IGxpc3QgPSBzaWJsaW5nc0ZuKCk7XG5cdFx0XHRzaWJsaW5ncyA9IGxpc3QgPyBsaXN0VG9NYXAobGlzdCkgOiB7fTtcblx0XHR9XG5cdFx0cmV0dXJuICEhc2libGluZ3NbbmFtZV07XG5cdH07XG59XG5cbmZ1bmN0aW9uIGxpc3RUb01hcChsaXN0OiBzdHJpbmdbXSkge1xuXHRjb25zdCBtYXA6IFJlY29yZDxzdHJpbmcsIHRydWU+ID0ge307XG5cdGZvciAoY29uc3Qga2V5IG9mIGxpc3QpIHtcblx0XHRtYXBba2V5XSA9IHRydWU7XG5cdH1cblx0cmV0dXJuIG1hcDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4Y2x1ZGVUb0dsb2JQYXR0ZXJuKGV4Y2x1ZGVzRm9yRm9sZGVyOiB7IGJhc2VVcmk/OiBVUkkgfCB1bmRlZmluZWQ7IHBhdHRlcm5zOiBzdHJpbmdbXSB9W10pOiBHbG9iUGF0dGVybltdIHtcblx0cmV0dXJuIGV4Y2x1ZGVzRm9yRm9sZGVyLmZsYXRNYXAoZXhjbHVkZSA9PiBleGNsdWRlLnBhdHRlcm5zLm1hcChwYXR0ZXJuID0+IHtcblx0XHRyZXR1cm4gZXhjbHVkZS5iYXNlVXJpID9cblx0XHRcdHtcblx0XHRcdFx0YmFzZVVyaTogZXhjbHVkZS5iYXNlVXJpLFxuXHRcdFx0XHRwYXR0ZXJuOiBwYXR0ZXJuXG5cdFx0XHR9IDogcGF0dGVybjtcblx0fSkpO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9URVhUX1NFQVJDSF9QUkVWSUVXX09QVElPTlMgPSB7XG5cdG1hdGNoTGluZXM6IDEwMCxcblx0Y2hhcnNQZXJMaW5lOiAxMDAwMFxufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMscUJBQXFCO0FBRTlCLFlBQVksVUFBVTtBQUV0QixZQUFZLGFBQWE7QUFDekIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsZUFBZSxpQkFBaUI7QUFHekMsU0FBUyx1QkFBdUI7QUFHaEMsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQXVDLHFDQUFxQztBQUM1RSxTQUFTLGtCQUFrQjtBQUtwQixNQUFNLGFBQWE7QUFDbkIsTUFBTSxXQUFXO0FBQ2pCLE1BQU0s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
