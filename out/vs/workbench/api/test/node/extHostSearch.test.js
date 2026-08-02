import assert from "assert";
import { mapArrayOrNot } from "../../../../base/common/arrays.js";
import { timeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { revive } from "../../../../base/common/marshalling.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { MainContext } from "../../common/extHost.protocol.js";
import { Range } from "../../common/extHostTypes.js";
import { URITransformerService } from "../../common/extHostUriTransformerService.js";
import { NativeExtHostSearch } from "../../node/extHostSearch.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { QueryType, resultIsMatch } from "../../../services/search/common/search.js";
import { NativeTextSearchManager } from "../../../services/search/node/textSearchManager.js";
let rpcProtocol;
let extHostSearch;
let mockMainThreadSearch;
class MockMainThreadSearch {
  constructor() {
    this.results = [];
    this.keywords = [];
  }
  $registerFileSearchProvider(handle, scheme) {
    this.lastHandle = handle;
  }
  $registerTextSearchProvider(handle, scheme) {
    this.lastHandle = handle;
  }
  $registerAITextSearchProvider(handle, scheme) {
    this.lastHandle = handle;
  }
  $unregisterProvider(handle) {
  }
  $handleFileMatch(handle, session, data) {
    this.results.push(...data);
  }
  $handleTextMatch(handle, session, data) {
    this.results.push(...data);
  }
  $handleKeywordResult(handle, session, data) {
    this.keywords.push(data);
  }
  $handleTelemetry(eventName, data) {
  }
  dispose() {
  }
}
let mockPFS;
function extensionResultIsMatch(data) {
  return !!data.preview;
}
suite("ExtHostSearch", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  async function registerTestTextSearchProvider(provider, scheme = "file") {
    disposables.add(extHostSearch.registerTextSearchProviderOld(scheme, provider));
    await rpcProtocol.sync();
  }
  async function registerTestFileSearchProvider(provider, scheme = "file") {
    disposables.add(extHostSearch.registerFileSearchProviderOld(scheme, provider));
    await rpcProtocol.sync();
  }
  async function runFileSearch(query, cancel = false) {
    let stats;
    try {
      const cancellation = new CancellationTokenSource();
      const p = extHostSearch.$provideFileSearchResults(mockMainThreadSearch.lastHandle, 0, query, cancellation.token);
      if (cancel) {
        await timeout(0);
        cancellation.cancel();
      }
      stats = await p;
    } catch (err) {
      if (!isCancellationError(err)) {
        await rpcProtocol.sync();
        throw err;
      }
    }
    await rpcProtocol.sync();
    return {
      results: mockMainThreadSearch.results.map((r) => URI.revive(r)),
      stats
    };
  }
  async function runTextSearch(query) {
    let stats;
    try {
      const cancellation = new CancellationTokenSource();
      const p = extHostSearch.$provideTextSearchResults(mockMainThreadSearch.lastHandle, 0, query, cancellation.token);
      stats = await p;
    } catch (err) {
      if (!isCancellationError(err)) {
        await rpcProtocol.sync();
        throw err;
      }
    }
    await rpcProtocol.sync();
    const results = revive(mockMainThreadSearch.results);
    return { results, stats };
  }
  setup(() => {
    rpcProtocol = new TestRPCProtocol();
    mockMainThreadSearch = new MockMainThreadSearch();
    const logService = new NullLogService();
    rpcProtocol.set(MainContext.MainThreadSearch, mockMainThreadSearch);
    mockPFS = {};
    extHostSearch = disposables.add(new class extends NativeExtHostSearch {
      constructor() {
        super(
          rpcProtocol,
          new class extends mock() {
            constructor() {
              super(...arguments);
              this.remote = { isRemote: false, authority: void 0, connectionData: null };
            }
          }(),
          new URITransformerService(null),
          new class extends mock() {
            async getConfigProvider() {
              return {
                onDidChangeConfiguration(_listener) {
                },
                getConfiguration() {
                  return {
                    get() {
                    },
                    has() {
                      return false;
                    },
                    inspect() {
                      return void 0;
                    },
                    async update() {
                    }
                  };
                }
              };
            }
          }(),
          logService
        );
        this._pfs = mockPFS;
      }
      createTextSearchManager(query, provider) {
        return new NativeTextSearchManager(query, provider, this._pfs);
      }
    }());
  });
  teardown(() => {
    return rpcProtocol.sync();
  });
  const rootFolderA = URI.file("/foo/bar1");
  const rootFolderB = URI.file("/foo/bar2");
  const fancyScheme = "fancy";
  const fancySchemeFolderA = URI.from({ scheme: fancyScheme, path: "/project/folder1" });
  suite("File:", () => {
    function getSimpleQuery(filePattern = "") {
      return {
        type: QueryType.File,
        filePattern,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
    }
    function compareURIs(actual, expected) {
      const sortAndStringify = (arr) => arr.sort().map((u) => u.toString());
      assert.deepStrictEqual(
        sortAndStringify(actual),
        sortAndStringify(expected)
      );
    }
    test("no results", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          return Promise.resolve(null);
        }
      });
      const { results, stats } = await runFileSearch(getSimpleQuery());
      assert(!stats.limitHit);
      assert(!results.length);
    });
    test("simple results", async () => {
      const reportedResults = [
        joinPath(rootFolderA, "file1.ts"),
        joinPath(rootFolderA, "file2.ts"),
        joinPath(rootFolderA, "subfolder/file3.ts")
      ];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          return Promise.resolve(reportedResults);
        }
      });
      const { results, stats } = await runFileSearch(getSimpleQuery());
      assert(!stats.limitHit);
      assert.strictEqual(results.length, 3);
      compareURIs(results, reportedResults);
    });
    test("Search canceled", async () => {
      let cancelRequested = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          return new Promise((resolve, reject) => {
            function onCancel() {
              cancelRequested = true;
              resolve([joinPath(options.folder, "file1.ts")]);
            }
            if (token.isCancellationRequested) {
              onCancel();
            } else {
              disposables.add(token.onCancellationRequested(() => onCancel()));
            }
          });
        }
      });
      const { results } = await runFileSearch(getSimpleQuery(), true);
      assert(cancelRequested);
      assert(!results.length);
    });
    test("session cancellation should work", async () => {
      let numSessionCancelled = 0;
      const disposables2 = [];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          disposables2.push(options.session?.onCancellationRequested(() => {
            numSessionCancelled++;
          }));
          return Promise.resolve([]);
        }
      });
      await runFileSearch({ ...getSimpleQuery(), cacheKey: "1" }, true);
      await runFileSearch({ ...getSimpleQuery(), cacheKey: "2" }, true);
      extHostSearch.$clearCache("1");
      assert.strictEqual(numSessionCancelled, 1);
      disposables2.forEach((d) => d?.dispose());
    });
    test("provider returns null", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          return null;
        }
      });
      try {
        await runFileSearch(getSimpleQuery());
        assert(false, "Expected to fail");
      } catch {
      }
    });
    test("all provider calls get global include/excludes", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          assert(options.excludes.length === 2 && options.includes.length === 2, "Missing global include/excludes");
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        includePattern: {
          "foo": true,
          "bar": true
        },
        excludePattern: {
          "something": true,
          "else": true
        },
        folderQueries: [
          { folder: rootFolderA },
          { folder: rootFolderB }
        ]
      };
      await runFileSearch(query);
    });
    test("global/local include/excludes combined", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          if (options.folder.toString() === rootFolderA.toString()) {
            assert.deepStrictEqual(options.includes.sort(), ["*.ts", "foo"]);
            assert.deepStrictEqual(options.excludes.sort(), ["*.js", "bar"]);
          } else {
            assert.deepStrictEqual(options.includes.sort(), ["*.ts"]);
            assert.deepStrictEqual(options.excludes.sort(), ["*.js"]);
          }
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        includePattern: {
          "*.ts": true
        },
        excludePattern: {
          "*.js": true
        },
        folderQueries: [
          {
            folder: rootFolderA,
            includePattern: {
              "foo": true
            },
            excludePattern: [{
              pattern: {
                "bar": true
              }
            }]
          },
          { folder: rootFolderB }
        ]
      };
      await runFileSearch(query);
    });
    test("include/excludes resolved correctly", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          assert.deepStrictEqual(options.includes.sort(), ["*.jsx", "*.ts"]);
          assert.deepStrictEqual(options.excludes.sort(), []);
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        includePattern: {
          "*.ts": true,
          "*.jsx": false
        },
        excludePattern: {
          "*.js": true,
          "*.tsx": false
        },
        folderQueries: [
          {
            folder: rootFolderA,
            includePattern: {
              "*.jsx": true
            },
            excludePattern: [{
              pattern: {
                "*.js": false
              }
            }]
          }
        ]
      };
      await runFileSearch(query);
    });
    test("basic sibling exclude clause", async () => {
      const reportedResults = [
        "file1.ts",
        "file1.js"
      ];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          return Promise.resolve(reportedResults.map((relativePath) => joinPath(options.folder, relativePath)));
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          }
        },
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results } = await runFileSearch(query);
      compareURIs(
        results,
        [
          joinPath(rootFolderA, "file1.ts")
        ]
      );
    });
    test("include, sibling exclude, and subfolder", async () => {
      const reportedResults = [
        "foo/file1.ts",
        "foo/file1.js"
      ];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          return Promise.resolve(reportedResults.map((relativePath) => joinPath(options.folder, relativePath)));
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        includePattern: { "**/*.ts": true },
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          }
        },
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results } = await runFileSearch(query);
      compareURIs(
        results,
        [
          joinPath(rootFolderA, "foo/file1.ts")
        ]
      );
    });
    test("multiroot sibling exclude clause", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          let reportedResults;
          if (options.folder.fsPath === rootFolderA.fsPath) {
            reportedResults = [
              "folder/fileA.scss",
              "folder/fileA.css",
              "folder/file2.css"
            ].map((relativePath) => joinPath(rootFolderA, relativePath));
          } else {
            reportedResults = [
              "fileB.ts",
              "fileB.js",
              "file3.js"
            ].map((relativePath) => joinPath(rootFolderB, relativePath));
          }
          return Promise.resolve(reportedResults);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          },
          "*.css": true
        },
        folderQueries: [
          {
            folder: rootFolderA,
            excludePattern: [{
              pattern: {
                "folder/*.css": {
                  when: "$(basename).scss"
                }
              }
            }]
          },
          {
            folder: rootFolderB,
            excludePattern: [{
              pattern: {
                "*.js": false
              }
            }]
          }
        ]
      };
      const { results } = await runFileSearch(query);
      compareURIs(
        results,
        [
          joinPath(rootFolderA, "folder/fileA.scss"),
          joinPath(rootFolderA, "folder/file2.css"),
          joinPath(rootFolderB, "fileB.ts"),
          joinPath(rootFolderB, "fileB.js"),
          joinPath(rootFolderB, "file3.js")
        ]
      );
    });
    test("max results = 1", async () => {
      const reportedResults = [
        joinPath(rootFolderA, "file1.ts"),
        joinPath(rootFolderA, "file2.ts"),
        joinPath(rootFolderA, "file3.ts")
      ];
      let wasCanceled = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          return Promise.resolve(reportedResults);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        maxResults: 1,
        folderQueries: [
          {
            folder: rootFolderA
          }
        ]
      };
      const { results, stats } = await runFileSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assert.strictEqual(results.length, 1);
      compareURIs(results, reportedResults.slice(0, 1));
      assert(wasCanceled, "Expected to be canceled when hitting limit");
    });
    test("max results = 2", async () => {
      const reportedResults = [
        joinPath(rootFolderA, "file1.ts"),
        joinPath(rootFolderA, "file2.ts"),
        joinPath(rootFolderA, "file3.ts")
      ];
      let wasCanceled = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          return Promise.resolve(reportedResults);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        maxResults: 2,
        folderQueries: [
          {
            folder: rootFolderA
          }
        ]
      };
      const { results, stats } = await runFileSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assert.strictEqual(results.length, 2);
      compareURIs(results, reportedResults.slice(0, 2));
      assert(wasCanceled, "Expected to be canceled when hitting limit");
    });
    test("provider returns maxResults exactly", async () => {
      const reportedResults = [
        joinPath(rootFolderA, "file1.ts"),
        joinPath(rootFolderA, "file2.ts")
      ];
      let wasCanceled = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          return Promise.resolve(reportedResults);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        maxResults: 2,
        folderQueries: [
          {
            folder: rootFolderA
          }
        ]
      };
      const { results, stats } = await runFileSearch(query);
      assert(!stats.limitHit, "Expected not to return limitHit");
      assert.strictEqual(results.length, 2);
      compareURIs(results, reportedResults);
      assert(!wasCanceled, "Expected not to be canceled when just reaching limit");
    });
    test("multiroot max results", async () => {
      let cancels = 0;
      await registerTestFileSearchProvider({
        async provideFileSearchResults(query2, options, token) {
          disposables.add(token.onCancellationRequested(() => cancels++));
          await new Promise((r) => process.nextTick(r));
          return [
            "file1.ts",
            "file2.ts",
            "file3.ts"
          ].map((relativePath) => joinPath(options.folder, relativePath));
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        maxResults: 2,
        folderQueries: [
          {
            folder: rootFolderA
          },
          {
            folder: rootFolderB
          }
        ]
      };
      const { results } = await runFileSearch(query);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(cancels, 2, "Expected all invocations to be canceled when hitting limit");
    });
    test("works with non-file schemes", async () => {
      const reportedResults = [
        joinPath(fancySchemeFolderA, "file1.ts"),
        joinPath(fancySchemeFolderA, "file2.ts"),
        joinPath(fancySchemeFolderA, "subfolder/file3.ts")
      ];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          return Promise.resolve(reportedResults);
        }
      }, fancyScheme);
      const query = {
        type: QueryType.File,
        filePattern: "",
        folderQueries: [
          {
            folder: fancySchemeFolderA
          }
        ]
      };
      const { results } = await runFileSearch(query);
      compareURIs(results, reportedResults);
    });
    test("if onlyFileScheme is set, do not call custom schemes", async () => {
      let fancySchemeCalled = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          fancySchemeCalled = true;
          return Promise.resolve([]);
        }
      }, fancyScheme);
      const query = {
        type: QueryType.File,
        filePattern: "",
        folderQueries: []
      };
      await runFileSearch(query);
      assert(!fancySchemeCalled);
    });
  });
  suite("Text:", () => {
    function makePreview(text) {
      return {
        matches: [new Range(0, 0, 0, text.length)],
        text
      };
    }
    function makeTextResult(baseFolder, relativePath) {
      return {
        preview: makePreview("foo"),
        ranges: [new Range(0, 0, 0, 3)],
        uri: joinPath(baseFolder, relativePath)
      };
    }
    function getSimpleQuery(queryText) {
      return {
        type: QueryType.Text,
        contentPattern: getPattern(queryText),
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
    }
    function getPattern(queryText) {
      return {
        pattern: queryText
      };
    }
    function assertResults(actual, expected) {
      const actualTextSearchResults = [];
      for (const fileMatch of actual) {
        for (const lineResult of fileMatch.results) {
          if (resultIsMatch(lineResult)) {
            actualTextSearchResults.push({
              preview: {
                text: lineResult.previewText,
                matches: mapArrayOrNot(
                  lineResult.rangeLocations.map((r) => r.preview),
                  (m) => new Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn)
                )
              },
              ranges: mapArrayOrNot(
                lineResult.rangeLocations.map((r) => r.source),
                (r) => new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn)
              ),
              uri: fileMatch.resource
            });
          } else {
            actualTextSearchResults.push({
              text: lineResult.text,
              lineNumber: lineResult.lineNumber,
              uri: fileMatch.resource
            });
          }
        }
      }
      const rangeToString = (r) => `(${r.start.line}, ${r.start.character}), (${r.end.line}, ${r.end.character})`;
      const makeComparable = (results) => results.sort((a, b) => {
        const compareKeyA = a.uri.toString() + ": " + (extensionResultIsMatch(a) ? a.preview.text : a.text);
        const compareKeyB = b.uri.toString() + ": " + (extensionResultIsMatch(b) ? b.preview.text : b.text);
        return compareKeyB.localeCompare(compareKeyA);
      }).map((r) => extensionResultIsMatch(r) ? {
        uri: r.uri.toString(),
        range: mapArrayOrNot(r.ranges, rangeToString),
        preview: {
          text: r.preview.text,
          match: null
          // Don't care about this right now
        }
      } : {
        uri: r.uri.toString(),
        text: r.text,
        lineNumber: r.lineNumber
      });
      return assert.deepStrictEqual(
        makeComparable(actualTextSearchResults),
        makeComparable(expected)
      );
    }
    test("no results", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query, options, progress, token) {
          return Promise.resolve(null);
        }
      });
      const { results, stats } = await runTextSearch(getSimpleQuery("foo"));
      assert(!stats.limitHit);
      assert(!results.length);
    });
    test("basic results", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const { results, stats } = await runTextSearch(getSimpleQuery("foo"));
      assert(!stats.limitHit);
      assertResults(results, providedResults);
    });
    test("all provider calls get global include/excludes", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          assert.strictEqual(options.includes.length, 1);
          assert.strictEqual(options.excludes.length, 1);
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        includePattern: {
          "*.ts": true
        },
        excludePattern: {
          "*.js": true
        },
        folderQueries: [
          { folder: rootFolderA },
          { folder: rootFolderB }
        ]
      };
      await runTextSearch(query);
    });
    test("global/local include/excludes combined", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          if (options.folder.toString() === rootFolderA.toString()) {
            assert.deepStrictEqual(options.includes.sort(), ["*.ts", "foo"]);
            assert.deepStrictEqual(options.excludes.sort(), ["*.js", "bar"]);
          } else {
            assert.deepStrictEqual(options.includes.sort(), ["*.ts"]);
            assert.deepStrictEqual(options.excludes.sort(), ["*.js"]);
          }
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        includePattern: {
          "*.ts": true
        },
        excludePattern: {
          "*.js": true
        },
        folderQueries: [
          {
            folder: rootFolderA,
            includePattern: {
              "foo": true
            },
            excludePattern: [{
              pattern: {
                "bar": true
              }
            }]
          },
          { folder: rootFolderB }
        ]
      };
      await runTextSearch(query);
    });
    test("include/excludes resolved correctly", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          assert.deepStrictEqual(options.includes.sort(), ["*.jsx", "*.ts"]);
          assert.deepStrictEqual(options.excludes.sort(), []);
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        includePattern: {
          "*.ts": true,
          "*.jsx": false
        },
        excludePattern: {
          "*.js": true,
          "*.tsx": false
        },
        folderQueries: [
          {
            folder: rootFolderA,
            includePattern: {
              "*.jsx": true
            },
            excludePattern: [{
              pattern: {
                "*.js": false
              }
            }]
          }
        ]
      };
      await runTextSearch(query);
    });
    test("provider fail", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query, options, progress, token) {
          throw new Error("Provider fail");
        }
      });
      try {
        await runTextSearch(getSimpleQuery("foo"));
        assert(false, "Expected to fail");
      } catch {
      }
    });
    test("basic sibling clause", async () => {
      mockPFS.Promises = {
        readdir: (_path) => {
          if (_path === rootFolderA.fsPath) {
            return Promise.resolve([
              "file1.js",
              "file1.ts"
            ]);
          } else {
            return Promise.reject(new Error("Wrong path"));
          }
        }
      };
      const providedResults = [
        makeTextResult(rootFolderA, "file1.js"),
        makeTextResult(rootFolderA, "file1.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          }
        },
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results } = await runTextSearch(query);
      assertResults(results, providedResults.slice(1));
    });
    test("multiroot sibling clause", async () => {
      mockPFS.Promises = {
        readdir: (_path) => {
          if (_path === joinPath(rootFolderA, "folder").fsPath) {
            return Promise.resolve([
              "fileA.scss",
              "fileA.css",
              "file2.css"
            ]);
          } else if (_path === rootFolderB.fsPath) {
            return Promise.resolve([
              "fileB.ts",
              "fileB.js",
              "file3.js"
            ]);
          } else {
            return Promise.reject(new Error("Wrong path"));
          }
        }
      };
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          let reportedResults;
          if (options.folder.fsPath === rootFolderA.fsPath) {
            reportedResults = [
              makeTextResult(rootFolderA, "folder/fileA.scss"),
              makeTextResult(rootFolderA, "folder/fileA.css"),
              makeTextResult(rootFolderA, "folder/file2.css")
            ];
          } else {
            reportedResults = [
              makeTextResult(rootFolderB, "fileB.ts"),
              makeTextResult(rootFolderB, "fileB.js"),
              makeTextResult(rootFolderB, "file3.js")
            ];
          }
          reportedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          },
          "*.css": true
        },
        folderQueries: [
          {
            folder: rootFolderA,
            excludePattern: [{
              pattern: {
                "folder/*.css": {
                  when: "$(basename).scss"
                }
              }
            }]
          },
          {
            folder: rootFolderB,
            excludePattern: [{
              pattern: {
                "*.js": false
              }
            }]
          }
        ]
      };
      const { results } = await runTextSearch(query);
      assertResults(results, [
        makeTextResult(rootFolderA, "folder/fileA.scss"),
        makeTextResult(rootFolderA, "folder/file2.css"),
        makeTextResult(rootFolderB, "fileB.ts"),
        makeTextResult(rootFolderB, "fileB.js"),
        makeTextResult(rootFolderB, "file3.js")
      ]);
    });
    test("include pattern applied", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.js"),
        makeTextResult(rootFolderA, "file1.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        includePattern: {
          "*.ts": true
        },
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results } = await runTextSearch(query);
      assertResults(results, providedResults.slice(1));
    });
    test("max results = 1", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts")
      ];
      let wasCanceled = false;
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 1,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results, stats } = await runTextSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assertResults(results, providedResults.slice(0, 1));
      assert(wasCanceled, "Expected to be canceled");
    });
    test("max results = 2", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts"),
        makeTextResult(rootFolderA, "file3.ts")
      ];
      let wasCanceled = false;
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 2,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results, stats } = await runTextSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assertResults(results, providedResults.slice(0, 2));
      assert(wasCanceled, "Expected to be canceled");
    });
    test("provider returns maxResults exactly", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts")
      ];
      let wasCanceled = false;
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 2,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results, stats } = await runTextSearch(query);
      assert(!stats.limitHit, "Expected not to return limitHit");
      assertResults(results, providedResults);
      assert(!wasCanceled, "Expected not to be canceled");
    });
    test("provider returns early with limitHit", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts"),
        makeTextResult(rootFolderA, "file3.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve({ limitHit: true });
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 1e3,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results, stats } = await runTextSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assertResults(results, providedResults);
    });
    test("multiroot max results", async () => {
      let cancels = 0;
      await registerTestTextSearchProvider({
        async provideTextSearchResults(query2, options, progress, token) {
          disposables.add(token.onCancellationRequested(() => cancels++));
          await new Promise((r) => process.nextTick(r));
          [
            "file1.ts",
            "file2.ts",
            "file3.ts"
          ].forEach((f) => progress.report(makeTextResult(options.folder, f)));
          return null;
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 2,
        folderQueries: [
          { folder: rootFolderA },
          { folder: rootFolderB }
        ]
      };
      const { results } = await runTextSearch(query);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(cancels, 2);
    });
    test("works with non-file schemes", async () => {
      const providedResults = [
        makeTextResult(fancySchemeFolderA, "file1.ts"),
        makeTextResult(fancySchemeFolderA, "file2.ts"),
        makeTextResult(fancySchemeFolderA, "file3.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      }, fancyScheme);
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        folderQueries: [
          { folder: fancySchemeFolderA }
        ]
      };
      const { results } = await runTextSearch(query);
      assertResults(results, providedResults);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9ub2RlL2V4dEhvc3RTZWFyY2gudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1hcEFycmF5T3JOb3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIHBmcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE1haW5Db250ZXh0LCBNYWluVGhyZWFkU2VhcmNoU2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29uZmlnUHJvdmlkZXIsIElFeHRIb3N0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0SW5pdERhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBVUklUcmFuc2Zvcm1lclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFVyaVRyYW5zZm9ybWVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOYXRpdmVFeHRIb3N0U2VhcmNoIH0gZnJvbSAnLi4vLi4vbm9kZS9leHRIb3N0U2VhcmNoLmpzJztcbmltcG9ydCB7IFRlc3RSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUZpbGVNYXRjaCwgSUZpbGVRdWVyeSwgSVBhdHRlcm5JbmZvLCBJUmF3RmlsZU1hdGNoMiwgSVNlYXJjaENvbXBsZXRlU3RhdHMsIElTZWFyY2hRdWVyeSwgSVRleHRRdWVyeSwgUXVlcnlUeXBlLCByZXN1bHRJc01hdGNoIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgVGV4dFNlYXJjaE1hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3RleHRTZWFyY2hNYW5hZ2VyLmpzJztcbmltcG9ydCB7IE5hdGl2ZVRleHRTZWFyY2hNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL25vZGUvdGV4dFNlYXJjaE1hbmFnZXIuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEFJU2VhcmNoS2V5d29yZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoRXh0VHlwZXMuanMnO1xuXG5sZXQgcnBjUHJvdG9jb2w6IFRlc3RSUENQcm90b2NvbDtcbmxldCBleHRIb3N0U2VhcmNoOiBOYXRpdmVFeHRIb3N0U2VhcmNoO1xuXG5sZXQgbW9ja01haW5UaHJlYWRTZWFyY2g6IE1vY2tNYWluVGhyZWFkU2VhcmNoO1xuY2xhc3MgTW9ja01haW5UaHJlYWRTZWFyY2ggaW1wbGVtZW50cyBNYWluVGhyZWFkU2VhcmNoU2hhcGUge1xuXHRsYXN0SGFuZGxlITogbnVtYmVyO1xuXG5cdHJlc3VsdHM6IEFycmF5PFVyaUNvbXBvbmVudHMgfCBJUmF3RmlsZU1hdGNoMj4gPSBbXTtcblxuXHRrZXl3b3JkczogQXJyYXk8QUlTZWFyY2hLZXl3b3JkPiA9IFtdO1xuXG5cdCRyZWdpc3RlckZpbGVTZWFyY2hQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2NoZW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmxhc3RIYW5kbGUgPSBoYW5kbGU7XG5cdH1cblxuXHQkcmVnaXN0ZXJUZXh0U2VhcmNoUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNjaGVtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0SGFuZGxlID0gaGFuZGxlO1xuXHR9XG5cblx0JHJlZ2lzdGVyQUlUZXh0U2VhcmNoUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNjaGVtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0SGFuZGxlID0gaGFuZGxlO1xuXHR9XG5cblx0JHVucmVnaXN0ZXJQcm92aWRlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHR9XG5cblx0JGhhbmRsZUZpbGVNYXRjaChoYW5kbGU6IG51bWJlciwgc2Vzc2lvbjogbnVtYmVyLCBkYXRhOiBVcmlDb21wb25lbnRzW10pOiB2b2lkIHtcblx0XHR0aGlzLnJlc3VsdHMucHVzaCguLi5kYXRhKTtcblx0fVxuXG5cdCRoYW5kbGVUZXh0TWF0Y2goaGFuZGxlOiBudW1iZXIsIHNlc3Npb246IG51bWJlciwgZGF0YTogSVJhd0ZpbGVNYXRjaDJbXSk6IHZvaWQge1xuXHRcdHRoaXMucmVzdWx0cy5wdXNoKC4uLmRhdGEpO1xuXHR9XG5cblx0JGhhbmRsZUtleXdvcmRSZXN1bHQoaGFuZGxlOiBudW1iZXIsIHNlc3Npb246IG51bWJlciwgZGF0YTogQUlTZWFyY2hLZXl3b3JkKTogdm9pZCB7XG5cdFx0dGhpcy5rZXl3b3Jkcy5wdXNoKGRhdGEpO1xuXHR9XG5cblx0JGhhbmRsZVRlbGVtZXRyeShldmVudE5hbWU6IHN0cmluZywgZGF0YTogYW55KTogdm9pZCB7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHR9XG59XG5cbmxldCBtb2NrUEZTOiBQYXJ0aWFsPHR5cGVvZiBwZnM+O1xuXG5mdW5jdGlvbiBleHRlbnNpb25SZXN1bHRJc01hdGNoKGRhdGE6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0KTogZGF0YSBpcyB2c2NvZGUuVGV4dFNlYXJjaE1hdGNoIHtcblx0cmV0dXJuICEhKDx2c2NvZGUuVGV4dFNlYXJjaE1hdGNoPmRhdGEpLnByZXZpZXc7XG59XG5cbnN1aXRlKCdFeHRIb3N0U2VhcmNoJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLlRleHRTZWFyY2hQcm92aWRlciwgc2NoZW1lID0gJ2ZpbGUnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3RTZWFyY2gucmVnaXN0ZXJUZXh0U2VhcmNoUHJvdmlkZXJPbGQoc2NoZW1lLCBwcm92aWRlcikpO1xuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkZpbGVTZWFyY2hQcm92aWRlciwgc2NoZW1lID0gJ2ZpbGUnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3RTZWFyY2gucmVnaXN0ZXJGaWxlU2VhcmNoUHJvdmlkZXJPbGQoc2NoZW1lLCBwcm92aWRlcikpO1xuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHJ1bkZpbGVTZWFyY2gocXVlcnk6IElGaWxlUXVlcnksIGNhbmNlbCA9IGZhbHNlKTogUHJvbWlzZTx7IHJlc3VsdHM6IFVSSVtdOyBzdGF0czogSVNlYXJjaENvbXBsZXRlU3RhdHMgfT4ge1xuXHRcdGxldCBzdGF0czogSVNlYXJjaENvbXBsZXRlU3RhdHM7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0Y29uc3QgcCA9IGV4dEhvc3RTZWFyY2guJHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhtb2NrTWFpblRocmVhZFNlYXJjaC5sYXN0SGFuZGxlLCAwLCBxdWVyeSwgY2FuY2VsbGF0aW9uLnRva2VuKTtcblx0XHRcdGlmIChjYW5jZWwpIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0Y2FuY2VsbGF0aW9uLmNhbmNlbCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdGF0cyA9IGF3YWl0IHA7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc3VsdHM6ICg8VXJpQ29tcG9uZW50c1tdPm1vY2tNYWluVGhyZWFkU2VhcmNoLnJlc3VsdHMpLm1hcChyID0+IFVSSS5yZXZpdmUocikpLFxuXHRcdFx0c3RhdHM6IHN0YXRzIVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBydW5UZXh0U2VhcmNoKHF1ZXJ5OiBJVGV4dFF1ZXJ5KTogUHJvbWlzZTx7IHJlc3VsdHM6IElGaWxlTWF0Y2hbXTsgc3RhdHM6IElTZWFyY2hDb21wbGV0ZVN0YXRzIH0+IHtcblx0XHRsZXQgc3RhdHM6IElTZWFyY2hDb21wbGV0ZVN0YXRzO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjYW5jZWxsYXRpb24gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGNvbnN0IHAgPSBleHRIb3N0U2VhcmNoLiRwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMobW9ja01haW5UaHJlYWRTZWFyY2gubGFzdEhhbmRsZSwgMCwgcXVlcnksIGNhbmNlbGxhdGlvbi50b2tlbik7XG5cblx0XHRcdHN0YXRzID0gYXdhaXQgcDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCByZXN1bHRzOiBJRmlsZU1hdGNoW10gPSByZXZpdmUoPElSYXdGaWxlTWF0Y2gyW10+bW9ja01haW5UaHJlYWRTZWFyY2gucmVzdWx0cyk7XG5cblx0XHRyZXR1cm4geyByZXN1bHRzLCBzdGF0czogc3RhdHMhIH07XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0cnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRtb2NrTWFpblRocmVhZFNlYXJjaCA9IG5ldyBNb2NrTWFpblRocmVhZFNlYXJjaCgpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkU2VhcmNoLCBtb2NrTWFpblRocmVhZFNlYXJjaCk7XG5cblx0XHRtb2NrUEZTID0ge307XG5cdFx0ZXh0SG9zdFNlYXJjaCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgY2xhc3MgZXh0ZW5kcyBOYXRpdmVFeHRIb3N0U2VhcmNoIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcihcblx0XHRcdFx0XHRycGNQcm90b2NvbCxcblx0XHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVtb3RlID0geyBpc1JlbW90ZTogZmFsc2UsIGF1dGhvcml0eTogdW5kZWZpbmVkLCBjb25uZWN0aW9uRGF0YTogbnVsbCB9OyB9LFxuXHRcdFx0XHRcdG5ldyBVUklUcmFuc2Zvcm1lclNlcnZpY2UobnVsbCksXG5cdFx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdENvbmZpZ3VyYXRpb24+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0Q29uZmlnUHJvdmlkZXIoKTogUHJvbWlzZTxFeHRIb3N0Q29uZmlnUHJvdmlkZXI+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oX2xpc3RlbmVyOiAoZXZlbnQ6IHZzY29kZS5Db25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpID0+IHZvaWQpIHsgfSxcblx0XHRcdFx0XHRcdFx0XHRnZXRDb25maWd1cmF0aW9uKCk6IHZzY29kZS5Xb3Jrc3BhY2VDb25maWd1cmF0aW9uIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGdldCgpIHsgfSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0aGFzKCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0aW5zcGVjdCgpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRhc3luYyB1cGRhdGUoKSB7IH1cblx0XHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdFx0fSxcblxuXHRcdFx0XHRcdFx0XHR9IGFzIEV4dEhvc3RDb25maWdQcm92aWRlcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGxvZ1NlcnZpY2Vcblx0XHRcdFx0KTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdHRoaXMuX3BmcyA9IG1vY2tQRlMgYXMgYW55O1xuXHRcdFx0fVxuXG5cdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlVGV4dFNlYXJjaE1hbmFnZXIocXVlcnk6IElUZXh0UXVlcnksIHByb3ZpZGVyOiB2c2NvZGUuVGV4dFNlYXJjaFByb3ZpZGVyMik6IFRleHRTZWFyY2hNYW5hZ2VyIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBOYXRpdmVUZXh0U2VhcmNoTWFuYWdlcihxdWVyeSwgcHJvdmlkZXIsIHRoaXMuX3Bmcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpO1xuXHR9KTtcblxuXHRjb25zdCByb290Rm9sZGVyQSA9IFVSSS5maWxlKCcvZm9vL2JhcjEnKTtcblx0Y29uc3Qgcm9vdEZvbGRlckIgPSBVUkkuZmlsZSgnL2Zvby9iYXIyJyk7XG5cdGNvbnN0IGZhbmN5U2NoZW1lID0gJ2ZhbmN5Jztcblx0Y29uc3QgZmFuY3lTY2hlbWVGb2xkZXJBID0gVVJJLmZyb20oeyBzY2hlbWU6IGZhbmN5U2NoZW1lLCBwYXRoOiAnL3Byb2plY3QvZm9sZGVyMScgfSk7XG5cblx0c3VpdGUoJ0ZpbGU6JywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gZ2V0U2ltcGxlUXVlcnkoZmlsZVBhdHRlcm4gPSAnJyk6IElGaWxlUXVlcnkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cblx0XHRcdFx0ZmlsZVBhdHRlcm4sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckEgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNvbXBhcmVVUklzKGFjdHVhbDogVVJJW10sIGV4cGVjdGVkOiBVUklbXSkge1xuXHRcdFx0Y29uc3Qgc29ydEFuZFN0cmluZ2lmeSA9IChhcnI6IFVSSVtdKSA9PiBhcnIuc29ydCgpLm1hcCh1ID0+IHUudG9TdHJpbmcoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNvcnRBbmRTdHJpbmdpZnkoYWN0dWFsKSxcblx0XHRcdFx0c29ydEFuZFN0cmluZ2lmeShleHBlY3RlZCkpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ25vIHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cywgc3RhdHMgfSA9IGF3YWl0IHJ1bkZpbGVTZWFyY2goZ2V0U2ltcGxlUXVlcnkoKSk7XG5cdFx0XHRhc3NlcnQoIXN0YXRzLmxpbWl0SGl0KTtcblx0XHRcdGFzc2VydCghcmVzdWx0cy5sZW5ndGgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2ltcGxlIHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnZmlsZTEudHMnKSxcblx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckEsICdmaWxlMi50cycpLFxuXHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ3N1YmZvbGRlci9maWxlMy50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlcG9ydGVkUmVzdWx0cyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMsIHN0YXRzIH0gPSBhd2FpdCBydW5GaWxlU2VhcmNoKGdldFNpbXBsZVF1ZXJ5KCkpO1xuXHRcdFx0YXNzZXJ0KCFzdGF0cy5saW1pdEhpdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0cy5sZW5ndGgsIDMpO1xuXHRcdFx0Y29tcGFyZVVSSXMocmVzdWx0cywgcmVwb3J0ZWRSZXN1bHRzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1NlYXJjaCBjYW5jZWxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYW5jZWxSZXF1ZXN0ZWQgPSBmYWxzZTtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0XHRcdGZ1bmN0aW9uIG9uQ2FuY2VsKCkge1xuXHRcdFx0XHRcdFx0XHRjYW5jZWxSZXF1ZXN0ZWQgPSB0cnVlO1xuXG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoW2pvaW5QYXRoKG9wdGlvbnMuZm9sZGVyLCAnZmlsZTEudHMnKV0pOyAvLyBvciByZWplY3Qgb3Igbm90aGluZz9cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdG9uQ2FuY2VsKCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gb25DYW5jZWwoKSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBydW5GaWxlU2VhcmNoKGdldFNpbXBsZVF1ZXJ5KCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0KGNhbmNlbFJlcXVlc3RlZCk7XG5cdFx0XHRhc3NlcnQoIXJlc3VsdHMubGVuZ3RoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nlc3Npb24gY2FuY2VsbGF0aW9uIHNob3VsZCB3b3JrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IG51bVNlc3Npb25DYW5jZWxsZWQgPSAwO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXM6ICh2c2NvZGUuRGlzcG9zYWJsZSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5wdXNoKG9wdGlvbnMuc2Vzc2lvbj8ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0bnVtU2Vzc2lvbkNhbmNlbGxlZCsrO1xuXHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXG5cdFx0XHRhd2FpdCBydW5GaWxlU2VhcmNoKHsgLi4uZ2V0U2ltcGxlUXVlcnkoKSwgY2FjaGVLZXk6ICcxJyB9LCB0cnVlKTtcblx0XHRcdGF3YWl0IHJ1bkZpbGVTZWFyY2goeyAuLi5nZXRTaW1wbGVRdWVyeSgpLCBjYWNoZUtleTogJzInIH0sIHRydWUpO1xuXHRcdFx0ZXh0SG9zdFNlYXJjaC4kY2xlYXJDYWNoZSgnMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG51bVNlc3Npb25DYW5jZWxsZWQsIDEpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZm9yRWFjaChkID0+IGQ/LmRpc3Bvc2UoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm92aWRlciByZXR1cm5zIG51bGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbCE7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBydW5GaWxlU2VhcmNoKGdldFNpbXBsZVF1ZXJ5KCkpO1xuXHRcdFx0XHRhc3NlcnQoZmFsc2UsICdFeHBlY3RlZCB0byBmYWlsJyk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gRXhwZWN0ZWQgdG8gdGhyb3dcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FsbCBwcm92aWRlciBjYWxscyBnZXQgZ2xvYmFsIGluY2x1ZGUvZXhjbHVkZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRhc3NlcnQob3B0aW9ucy5leGNsdWRlcy5sZW5ndGggPT09IDIgJiYgb3B0aW9ucy5pbmNsdWRlcy5sZW5ndGggPT09IDIsICdNaXNzaW5nIGdsb2JhbCBpbmNsdWRlL2V4Y2x1ZGVzJyk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblxuXHRcdFx0XHRmaWxlUGF0dGVybjogJycsXG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0J2Zvbyc6IHRydWUsXG5cdFx0XHRcdFx0J2Jhcic6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnc29tZXRoaW5nJzogdHJ1ZSxcblx0XHRcdFx0XHQnZWxzZSc6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQSB9LFxuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQiB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHJ1bkZpbGVTZWFyY2gocXVlcnkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2xvYmFsL2xvY2FsIGluY2x1ZGUvZXhjbHVkZXMgY29tYmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRpZiAob3B0aW9ucy5mb2xkZXIudG9TdHJpbmcoKSA9PT0gcm9vdEZvbGRlckEudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVzLnNvcnQoKSwgWycqLnRzJywgJ2ZvbyddKTtcblx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlcy5zb3J0KCksIFsnKi5qcycsICdiYXInXSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlcy5zb3J0KCksIFsnKi50cyddKTtcblx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlcy5zb3J0KCksIFsnKi5qcyddKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi50cyc6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi5qcyc6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZvbGRlcjogcm9vdEZvbGRlckEsXG5cdFx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHQnZm9vJzogdHJ1ZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0J2Jhcic6IHRydWVcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQiB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHJ1bkZpbGVTZWFyY2gocXVlcnkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZS9leGNsdWRlcyByZXNvbHZlZCBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZXMuc29ydCgpLCBbJyouanN4JywgJyoudHMnXSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVzLnNvcnQoKSwgW10pO1xuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblxuXHRcdFx0XHRmaWxlUGF0dGVybjogJycsXG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyoudHMnOiB0cnVlLFxuXHRcdFx0XHRcdCcqLmpzeCc6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyouanMnOiB0cnVlLFxuXHRcdFx0XHRcdCcqLnRzeCc6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IHJvb3RGb2xkZXJBLFxuXHRcdFx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0JyouanN4JzogdHJ1ZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0JyouanMnOiBmYWxzZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgcnVuRmlsZVNlYXJjaChxdWVyeSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYXNpYyBzaWJsaW5nIGV4Y2x1ZGUgY2xhdXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVwb3J0ZWRSZXN1bHRzID0gW1xuXHRcdFx0XHQnZmlsZTEudHMnLFxuXHRcdFx0XHQnZmlsZTEuanMnLFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXBvcnRlZFJlc3VsdHNcblx0XHRcdFx0XHRcdC5tYXAocmVsYXRpdmVQYXRoID0+IGpvaW5QYXRoKG9wdGlvbnMuZm9sZGVyLCByZWxhdGl2ZVBhdGgpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblxuXHRcdFx0XHRmaWxlUGF0dGVybjogJycsXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyouanMnOiB7XG5cdFx0XHRcdFx0XHR3aGVuOiAnJChiYXNlbmFtZSkudHMnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJBIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBydW5GaWxlU2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGNvbXBhcmVVUklzKFxuXHRcdFx0XHRyZXN1bHRzLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckEsICdmaWxlMS50cycpXG5cdFx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUtcmVtb3RlaHViL2lzc3Vlcy8yNTVcblx0XHR0ZXN0KCdpbmNsdWRlLCBzaWJsaW5nIGV4Y2x1ZGUsIGFuZCBzdWJmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdCdmb28vZmlsZTEudHMnLFxuXHRcdFx0XHQnZm9vL2ZpbGUxLmpzJyxcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVwb3J0ZWRSZXN1bHRzXG5cdFx0XHRcdFx0XHQubWFwKHJlbGF0aXZlUGF0aCA9PiBqb2luUGF0aChvcHRpb25zLmZvbGRlciwgcmVsYXRpdmVQYXRoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cblx0XHRcdFx0ZmlsZVBhdHRlcm46ICcnLFxuXHRcdFx0XHRpbmNsdWRlUGF0dGVybjogeyAnKiovKi50cyc6IHRydWUgfSxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi5qcyc6IHtcblx0XHRcdFx0XHRcdHdoZW46ICckKGJhc2VuYW1lKS50cydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckEgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHJ1bkZpbGVTZWFyY2gocXVlcnkpO1xuXHRcdFx0Y29tcGFyZVVSSXMoXG5cdFx0XHRcdHJlc3VsdHMsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2Zvby9maWxlMS50cycpXG5cdFx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlyb290IHNpYmxpbmcgZXhjbHVkZSBjbGF1c2UnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdGxldCByZXBvcnRlZFJlc3VsdHM6IFVSSVtdO1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLmZvbGRlci5mc1BhdGggPT09IHJvb3RGb2xkZXJBLmZzUGF0aCkge1xuXHRcdFx0XHRcdFx0cmVwb3J0ZWRSZXN1bHRzID0gW1xuXHRcdFx0XHRcdFx0XHQnZm9sZGVyL2ZpbGVBLnNjc3MnLFxuXHRcdFx0XHRcdFx0XHQnZm9sZGVyL2ZpbGVBLmNzcycsXG5cdFx0XHRcdFx0XHRcdCdmb2xkZXIvZmlsZTIuY3NzJ1xuXHRcdFx0XHRcdFx0XS5tYXAocmVsYXRpdmVQYXRoID0+IGpvaW5QYXRoKHJvb3RGb2xkZXJBLCByZWxhdGl2ZVBhdGgpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVwb3J0ZWRSZXN1bHRzID0gW1xuXHRcdFx0XHRcdFx0XHQnZmlsZUIudHMnLFxuXHRcdFx0XHRcdFx0XHQnZmlsZUIuanMnLFxuXHRcdFx0XHRcdFx0XHQnZmlsZTMuanMnXG5cdFx0XHRcdFx0XHRdLm1hcChyZWxhdGl2ZVBhdGggPT4gam9pblBhdGgocm9vdEZvbGRlckIsIHJlbGF0aXZlUGF0aCkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVwb3J0ZWRSZXN1bHRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi5qcyc6IHtcblx0XHRcdFx0XHRcdHdoZW46ICckKGJhc2VuYW1lKS50cydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCcqLmNzcyc6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZvbGRlcjogcm9vdEZvbGRlckEsXG5cdFx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogW3tcblx0XHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHRcdCdmb2xkZXIvKi5jc3MnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR3aGVuOiAnJChiYXNlbmFtZSkuc2Nzcydcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IHJvb3RGb2xkZXJCLFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IFt7XG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0XHQnKi5qcyc6IGZhbHNlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHJ1bkZpbGVTZWFyY2gocXVlcnkpO1xuXHRcdFx0Y29tcGFyZVVSSXMoXG5cdFx0XHRcdHJlc3VsdHMsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZvbGRlci9maWxlQS5zY3NzJyksXG5cdFx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckEsICdmb2xkZXIvZmlsZTIuY3NzJyksXG5cblx0XHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQiwgJ2ZpbGVCLnRzJyksXG5cdFx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckIsICdmaWxlQi5qcycpLFxuXHRcdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJCLCAnZmlsZTMuanMnKSxcblx0XHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXggcmVzdWx0cyA9IDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnZmlsZTEudHMnKSxcblx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckEsICdmaWxlMi50cycpLFxuXHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZpbGUzLnRzJyksXG5cdFx0XHRdO1xuXG5cdFx0XHRsZXQgd2FzQ2FuY2VsZWQgPSBmYWxzZTtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB3YXNDYW5jZWxlZCA9IHRydWUpKTtcblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVwb3J0ZWRSZXN1bHRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0bWF4UmVzdWx0czogMSxcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzLCBzdGF0cyB9ID0gYXdhaXQgcnVuRmlsZVNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnQoc3RhdHMubGltaXRIaXQsICdFeHBlY3RlZCB0byByZXR1cm4gbGltaXRIaXQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb21wYXJlVVJJcyhyZXN1bHRzLCByZXBvcnRlZFJlc3VsdHMuc2xpY2UoMCwgMSkpO1xuXHRcdFx0YXNzZXJ0KHdhc0NhbmNlbGVkLCAnRXhwZWN0ZWQgdG8gYmUgY2FuY2VsZWQgd2hlbiBoaXR0aW5nIGxpbWl0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXggcmVzdWx0cyA9IDInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnZmlsZTEudHMnKSxcblx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckEsICdmaWxlMi50cycpLFxuXHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZpbGUzLnRzJyksXG5cdFx0XHRdO1xuXG5cdFx0XHRsZXQgd2FzQ2FuY2VsZWQgPSBmYWxzZTtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB3YXNDYW5jZWxlZCA9IHRydWUpKTtcblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVwb3J0ZWRSZXN1bHRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0bWF4UmVzdWx0czogMixcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzLCBzdGF0cyB9ID0gYXdhaXQgcnVuRmlsZVNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnQoc3RhdHMubGltaXRIaXQsICdFeHBlY3RlZCB0byByZXR1cm4gbGltaXRIaXQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzLmxlbmd0aCwgMik7XG5cdFx0XHRjb21wYXJlVVJJcyhyZXN1bHRzLCByZXBvcnRlZFJlc3VsdHMuc2xpY2UoMCwgMikpO1xuXHRcdFx0YXNzZXJ0KHdhc0NhbmNlbGVkLCAnRXhwZWN0ZWQgdG8gYmUgY2FuY2VsZWQgd2hlbiBoaXR0aW5nIGxpbWl0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm92aWRlciByZXR1cm5zIG1heFJlc3VsdHMgZXhhY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlcG9ydGVkUmVzdWx0cyA9IFtcblx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZpbGUyLnRzJyksXG5cdFx0XHRdO1xuXG5cdFx0XHRsZXQgd2FzQ2FuY2VsZWQgPSBmYWxzZTtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB3YXNDYW5jZWxlZCA9IHRydWUpKTtcblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVwb3J0ZWRSZXN1bHRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0bWF4UmVzdWx0czogMixcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzLCBzdGF0cyB9ID0gYXdhaXQgcnVuRmlsZVNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnQoIXN0YXRzLmxpbWl0SGl0LCAnRXhwZWN0ZWQgbm90IHRvIHJldHVybiBsaW1pdEhpdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHMubGVuZ3RoLCAyKTtcblx0XHRcdGNvbXBhcmVVUklzKHJlc3VsdHMsIHJlcG9ydGVkUmVzdWx0cyk7XG5cdFx0XHRhc3NlcnQoIXdhc0NhbmNlbGVkLCAnRXhwZWN0ZWQgbm90IHRvIGJlIGNhbmNlbGVkIHdoZW4ganVzdCByZWFjaGluZyBsaW1pdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlyb290IG1heCByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhbmNlbHMgPSAwO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0YXN5bmMgcHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGNhbmNlbHMrKykpO1xuXG5cdFx0XHRcdFx0Ly8gUHJvdmljZSByZXN1bHRzIGFzeW5jIHNvIGl0IGhhcyBhIGNoYW5jZSB0byBpbnZva2UgZXZlcnkgcHJvdmlkZXJcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHByb2Nlc3MubmV4dFRpY2socikpO1xuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnZmlsZTEudHMnLFxuXHRcdFx0XHRcdFx0J2ZpbGUyLnRzJyxcblx0XHRcdFx0XHRcdCdmaWxlMy50cycsXG5cdFx0XHRcdFx0XS5tYXAocmVsYXRpdmVQYXRoID0+IGpvaW5QYXRoKG9wdGlvbnMuZm9sZGVyLCByZWxhdGl2ZVBhdGgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0bWF4UmVzdWx0czogMixcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBydW5GaWxlU2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzLmxlbmd0aCwgMik7IC8vIERvbid0IGNhcmUgd2hpY2ggMiB3ZSBnb3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5jZWxzLCAyLCAnRXhwZWN0ZWQgYWxsIGludm9jYXRpb25zIHRvIGJlIGNhbmNlbGVkIHdoZW4gaGl0dGluZyBsaW1pdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd29ya3Mgd2l0aCBub24tZmlsZSBzY2hlbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVwb3J0ZWRSZXN1bHRzID0gW1xuXHRcdFx0XHRqb2luUGF0aChmYW5jeVNjaGVtZUZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRqb2luUGF0aChmYW5jeVNjaGVtZUZvbGRlckEsICdmaWxlMi50cycpLFxuXHRcdFx0XHRqb2luUGF0aChmYW5jeVNjaGVtZUZvbGRlckEsICdzdWJmb2xkZXIvZmlsZTMudHMnKSxcblxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXBvcnRlZFJlc3VsdHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBmYW5jeVNjaGVtZSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0XHRmaWxlUGF0dGVybjogJycsXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IGZhbmN5U2NoZW1lRm9sZGVyQVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBydW5GaWxlU2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGNvbXBhcmVVUklzKHJlc3VsdHMsIHJlcG9ydGVkUmVzdWx0cyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnaWYgb25seUZpbGVTY2hlbWUgaXMgc2V0LCBkbyBub3QgY2FsbCBjdXN0b20gc2NoZW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBmYW5jeVNjaGVtZUNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0XHRcdFx0ZmFuY3lTY2hlbWVDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBmYW5jeVNjaGVtZSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXHRcdFx0XHRmaWxlUGF0dGVybjogJycsXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtdXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBydW5GaWxlU2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGFzc2VydCghZmFuY3lTY2hlbWVDYWxsZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVGV4dDonLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBtYWtlUHJldmlldyh0ZXh0OiBzdHJpbmcpOiB2c2NvZGUuVGV4dFNlYXJjaE1hdGNoWydwcmV2aWV3J10ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bWF0Y2hlczogW25ldyBSYW5nZSgwLCAwLCAwLCB0ZXh0Lmxlbmd0aCldLFxuXHRcdFx0XHR0ZXh0XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIG1ha2VUZXh0UmVzdWx0KGJhc2VGb2xkZXI6IFVSSSwgcmVsYXRpdmVQYXRoOiBzdHJpbmcpOiB2c2NvZGUuVGV4dFNlYXJjaE1hdGNoIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByZXZpZXc6IG1ha2VQcmV2aWV3KCdmb28nKSxcblx0XHRcdFx0cmFuZ2VzOiBbbmV3IFJhbmdlKDAsIDAsIDAsIDMpXSxcblx0XHRcdFx0dXJpOiBqb2luUGF0aChiYXNlRm9sZGVyLCByZWxhdGl2ZVBhdGgpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldFNpbXBsZVF1ZXJ5KHF1ZXJ5VGV4dDogc3RyaW5nKTogSVRleHRRdWVyeSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4ocXVlcnlUZXh0KSxcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJBIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRQYXR0ZXJuKHF1ZXJ5VGV4dDogc3RyaW5nKTogSVBhdHRlcm5JbmZvIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBhdHRlcm46IHF1ZXJ5VGV4dFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRSZXN1bHRzKGFjdHVhbDogSUZpbGVNYXRjaFtdLCBleHBlY3RlZDogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSkge1xuXHRcdFx0Y29uc3QgYWN0dWFsVGV4dFNlYXJjaFJlc3VsdHM6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZmlsZU1hdGNoIG9mIGFjdHVhbCkge1xuXHRcdFx0XHQvLyBNYWtlIHJlbGF0aXZlXG5cdFx0XHRcdGZvciAoY29uc3QgbGluZVJlc3VsdCBvZiBmaWxlTWF0Y2gucmVzdWx0cyEpIHtcblx0XHRcdFx0XHRpZiAocmVzdWx0SXNNYXRjaChsaW5lUmVzdWx0KSkge1xuXHRcdFx0XHRcdFx0YWN0dWFsVGV4dFNlYXJjaFJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHByZXZpZXc6IHtcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiBsaW5lUmVzdWx0LnByZXZpZXdUZXh0LFxuXHRcdFx0XHRcdFx0XHRcdG1hdGNoZXM6IG1hcEFycmF5T3JOb3QoXG5cdFx0XHRcdFx0XHRcdFx0XHRsaW5lUmVzdWx0LnJhbmdlTG9jYXRpb25zLm1hcChyID0+IHIucHJldmlldyksXG5cdFx0XHRcdFx0XHRcdFx0XHRtID0+IG5ldyBSYW5nZShtLnN0YXJ0TGluZU51bWJlciwgbS5zdGFydENvbHVtbiwgbS5lbmRMaW5lTnVtYmVyLCBtLmVuZENvbHVtbikpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHJhbmdlczogbWFwQXJyYXlPck5vdChcblx0XHRcdFx0XHRcdFx0XHRsaW5lUmVzdWx0LnJhbmdlTG9jYXRpb25zLm1hcChyID0+IHIuc291cmNlKSxcblx0XHRcdFx0XHRcdFx0XHRyID0+IG5ldyBSYW5nZShyLnN0YXJ0TGluZU51bWJlciwgci5zdGFydENvbHVtbiwgci5lbmRMaW5lTnVtYmVyLCByLmVuZENvbHVtbiksXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdHVyaTogZmlsZU1hdGNoLnJlc291cmNlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YWN0dWFsVGV4dFNlYXJjaFJlc3VsdHMucHVzaCg8dnNjb2RlLlRleHRTZWFyY2hDb250ZXh0Pntcblx0XHRcdFx0XHRcdFx0dGV4dDogbGluZVJlc3VsdC50ZXh0LFxuXHRcdFx0XHRcdFx0XHRsaW5lTnVtYmVyOiBsaW5lUmVzdWx0LmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRcdHVyaTogZmlsZU1hdGNoLnJlc291cmNlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmFuZ2VUb1N0cmluZyA9IChyOiB2c2NvZGUuUmFuZ2UpID0+IGAoJHtyLnN0YXJ0LmxpbmV9LCAke3Iuc3RhcnQuY2hhcmFjdGVyfSksICgke3IuZW5kLmxpbmV9LCAke3IuZW5kLmNoYXJhY3Rlcn0pYDtcblxuXHRcdFx0Y29uc3QgbWFrZUNvbXBhcmFibGUgPSAocmVzdWx0czogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSkgPT4gcmVzdWx0c1xuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBhcmVLZXlBID0gYS51cmkudG9TdHJpbmcoKSArICc6ICcgKyAoZXh0ZW5zaW9uUmVzdWx0SXNNYXRjaChhKSA/IGEucHJldmlldy50ZXh0IDogYS50ZXh0KTtcblx0XHRcdFx0XHRjb25zdCBjb21wYXJlS2V5QiA9IGIudXJpLnRvU3RyaW5nKCkgKyAnOiAnICsgKGV4dGVuc2lvblJlc3VsdElzTWF0Y2goYikgPyBiLnByZXZpZXcudGV4dCA6IGIudGV4dCk7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbXBhcmVLZXlCLmxvY2FsZUNvbXBhcmUoY29tcGFyZUtleUEpO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQubWFwKHIgPT4gZXh0ZW5zaW9uUmVzdWx0SXNNYXRjaChyKSA/IHtcblx0XHRcdFx0XHR1cmk6IHIudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0cmFuZ2U6IG1hcEFycmF5T3JOb3Qoci5yYW5nZXMsIHJhbmdlVG9TdHJpbmcpLFxuXHRcdFx0XHRcdHByZXZpZXc6IHtcblx0XHRcdFx0XHRcdHRleHQ6IHIucHJldmlldy50ZXh0LFxuXHRcdFx0XHRcdFx0bWF0Y2g6IG51bGwgLy8gRG9uJ3QgY2FyZSBhYm91dCB0aGlzIHJpZ2h0IG5vd1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSA6IHtcblx0XHRcdFx0XHR1cmk6IHIudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0dGV4dDogci50ZXh0LFxuXHRcdFx0XHRcdGxpbmVOdW1iZXI6IHIubGluZU51bWJlclxuXHRcdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1ha2VDb21wYXJhYmxlKGFjdHVhbFRleHRTZWFyY2hSZXN1bHRzKSxcblx0XHRcdFx0bWFrZUNvbXBhcmFibGUoZXhwZWN0ZWQpKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdubyByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMsIHN0YXRzIH0gPSBhd2FpdCBydW5UZXh0U2VhcmNoKGdldFNpbXBsZVF1ZXJ5KCdmb28nKSk7XG5cdFx0XHRhc3NlcnQoIXN0YXRzLmxpbWl0SGl0KTtcblx0XHRcdGFzc2VydCghcmVzdWx0cy5sZW5ndGgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmFzaWMgcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVkUmVzdWx0czogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSA9IFtcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUyLnRzJylcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdHByb3ZpZGVkUmVzdWx0cy5mb3JFYWNoKHIgPT4gcHJvZ3Jlc3MucmVwb3J0KHIpKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cywgc3RhdHMgfSA9IGF3YWl0IHJ1blRleHRTZWFyY2goZ2V0U2ltcGxlUXVlcnkoJ2ZvbycpKTtcblx0XHRcdGFzc2VydCghc3RhdHMubGltaXRIaXQpO1xuXHRcdFx0YXNzZXJ0UmVzdWx0cyhyZXN1bHRzLCBwcm92aWRlZFJlc3VsdHMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsIHByb3ZpZGVyIGNhbGxzIGdldCBnbG9iYWwgaW5jbHVkZS9leGNsdWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZXMubGVuZ3RoLCAxKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJVGV4dFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4oJ2ZvbycpLFxuXG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyoudHMnOiB0cnVlXG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi5qcyc6IHRydWVcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJBIH0sXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJCIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnbG9iYWwvbG9jYWwgaW5jbHVkZS9leGNsdWRlcyBjb21iaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLmZvbGRlci50b1N0cmluZygpID09PSByb290Rm9sZGVyQS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZXMuc29ydCgpLCBbJyoudHMnLCAnZm9vJ10pO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVzLnNvcnQoKSwgWycqLmpzJywgJ2JhciddKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVzLnNvcnQoKSwgWycqLnRzJ10pO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVzLnNvcnQoKSwgWycqLmpzJ10pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElUZXh0UXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi50cyc6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi5qcyc6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZvbGRlcjogcm9vdEZvbGRlckEsXG5cdFx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHQnZm9vJzogdHJ1ZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0J2Jhcic6IHRydWVcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQiB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHJ1blRleHRTZWFyY2gocXVlcnkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZS9leGNsdWRlcyByZXNvbHZlZCBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RUZXh0U2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5UZXh0U2VhcmNoT3B0aW9ucywgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdD4sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5UZXh0U2VhcmNoQ29tcGxldGU+IHtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZXMuc29ydCgpLCBbJyouanN4JywgJyoudHMnXSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVzLnNvcnQoKSwgW10pO1xuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4oJ2ZvbycpLFxuXG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyoudHMnOiB0cnVlLFxuXHRcdFx0XHRcdCcqLmpzeCc6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyouanMnOiB0cnVlLFxuXHRcdFx0XHRcdCcqLnRzeCc6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IHJvb3RGb2xkZXJBLFxuXHRcdFx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0JyouanN4JzogdHJ1ZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0JyouanMnOiBmYWxzZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm92aWRlciBmYWlsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQcm92aWRlciBmYWlsJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBydW5UZXh0U2VhcmNoKGdldFNpbXBsZVF1ZXJ5KCdmb28nKSk7XG5cdFx0XHRcdGFzc2VydChmYWxzZSwgJ0V4cGVjdGVkIHRvIGZhaWwnKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBleHBlY3RlZCB0byBmYWlsXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYXNpYyBzaWJsaW5nIGNsYXVzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0KG1vY2tQRlMgYXMgYW55KS5Qcm9taXNlcyA9IHtcblx0XHRcdFx0cmVhZGRpcjogKF9wYXRoOiBzdHJpbmcpOiBhbnkgPT4ge1xuXHRcdFx0XHRcdGlmIChfcGF0aCA9PT0gcm9vdEZvbGRlckEuZnNQYXRoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtcblx0XHRcdFx0XHRcdFx0J2ZpbGUxLmpzJyxcblx0XHRcdFx0XHRcdFx0J2ZpbGUxLnRzJ1xuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1dyb25nIHBhdGgnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcm92aWRlZFJlc3VsdHM6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0W10gPSBbXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZmlsZTEuanMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMS50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RUZXh0U2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5UZXh0U2VhcmNoT3B0aW9ucywgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdD4sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5UZXh0U2VhcmNoQ29tcGxldGU+IHtcblx0XHRcdFx0XHRwcm92aWRlZFJlc3VsdHMuZm9yRWFjaChyID0+IHByb2dyZXNzLnJlcG9ydChyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4oJ2ZvbycpLFxuXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyouanMnOiB7XG5cdFx0XHRcdFx0XHR3aGVuOiAnJChiYXNlbmFtZSkudHMnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckEgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHJ1blRleHRTZWFyY2gocXVlcnkpO1xuXHRcdFx0YXNzZXJ0UmVzdWx0cyhyZXN1bHRzLCBwcm92aWRlZFJlc3VsdHMuc2xpY2UoMSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlyb290IHNpYmxpbmcgY2xhdXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHQobW9ja1BGUyBhcyBhbnkpLlByb21pc2VzID0ge1xuXHRcdFx0XHRyZWFkZGlyOiAoX3BhdGg6IHN0cmluZyk6IGFueSA9PiB7XG5cdFx0XHRcdFx0aWYgKF9wYXRoID09PSBqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZvbGRlcicpLmZzUGF0aCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXG5cdFx0XHRcdFx0XHRcdCdmaWxlQS5zY3NzJyxcblx0XHRcdFx0XHRcdFx0J2ZpbGVBLmNzcycsXG5cdFx0XHRcdFx0XHRcdCdmaWxlMi5jc3MnXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKF9wYXRoID09PSByb290Rm9sZGVyQi5mc1BhdGgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW1xuXHRcdFx0XHRcdFx0XHQnZmlsZUIudHMnLFxuXHRcdFx0XHRcdFx0XHQnZmlsZUIuanMnLFxuXHRcdFx0XHRcdFx0XHQnZmlsZTMuanMnXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignV3JvbmcgcGF0aCcpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdGxldCByZXBvcnRlZFJlc3VsdHM7XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMuZm9sZGVyLmZzUGF0aCA9PT0gcm9vdEZvbGRlckEuZnNQYXRoKSB7XG5cdFx0XHRcdFx0XHRyZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZm9sZGVyL2ZpbGVBLnNjc3MnKSxcblx0XHRcdFx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmb2xkZXIvZmlsZUEuY3NzJyksXG5cdFx0XHRcdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZm9sZGVyL2ZpbGUyLmNzcycpXG5cdFx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJCLCAnZmlsZUIudHMnKSxcblx0XHRcdFx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckIsICdmaWxlQi5qcycpLFxuXHRcdFx0XHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQiwgJ2ZpbGUzLmpzJylcblx0XHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVwb3J0ZWRSZXN1bHRzLmZvckVhY2gociA9PiBwcm9ncmVzcy5yZXBvcnQocikpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHQsXG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBnZXRQYXR0ZXJuKCdmb28nKSxcblxuXHRcdFx0XHRleGNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCcqLmpzJzoge1xuXHRcdFx0XHRcdFx0d2hlbjogJyQoYmFzZW5hbWUpLnRzJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0JyouY3NzJzogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQSxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0J2ZvbGRlci8qLmNzcyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHdoZW46ICckKGJhc2VuYW1lKS5zY3NzJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZvbGRlcjogcm9vdEZvbGRlckIsXG5cdFx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogW3tcblx0XHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHRcdCcqLmpzJzogZmFsc2Vcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnRSZXN1bHRzKHJlc3VsdHMsIFtcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmb2xkZXIvZmlsZUEuc2NzcycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZvbGRlci9maWxlMi5jc3MnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckIsICdmaWxlQi50cycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQiwgJ2ZpbGVCLmpzJyksXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJCLCAnZmlsZTMuanMnKV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZSBwYXR0ZXJuIGFwcGxpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlZFJlc3VsdHM6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0W10gPSBbXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZmlsZTEuanMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMS50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RUZXh0U2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5UZXh0U2VhcmNoT3B0aW9ucywgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdD4sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5UZXh0U2VhcmNoQ29tcGxldGU+IHtcblx0XHRcdFx0XHRwcm92aWRlZFJlc3VsdHMuZm9yRWFjaChyID0+IHByb2dyZXNzLnJlcG9ydChyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4oJ2ZvbycpLFxuXG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyoudHMnOiB0cnVlXG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnRSZXN1bHRzKHJlc3VsdHMsIHByb3ZpZGVkUmVzdWx0cy5zbGljZSgxKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXggcmVzdWx0cyA9IDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlZFJlc3VsdHM6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0W10gPSBbXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZmlsZTEudHMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMi50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRsZXQgd2FzQ2FuY2VsZWQgPSBmYWxzZTtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB3YXNDYW5jZWxlZCA9IHRydWUpKTtcblx0XHRcdFx0XHRwcm92aWRlZFJlc3VsdHMuZm9yRWFjaChyID0+IHByb2dyZXNzLnJlcG9ydChyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4oJ2ZvbycpLFxuXG5cdFx0XHRcdG1heFJlc3VsdHM6IDEsXG5cblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cywgc3RhdHMgfSA9IGF3YWl0IHJ1blRleHRTZWFyY2gocXVlcnkpO1xuXHRcdFx0YXNzZXJ0KHN0YXRzLmxpbWl0SGl0LCAnRXhwZWN0ZWQgdG8gcmV0dXJuIGxpbWl0SGl0Jyk7XG5cdFx0XHRhc3NlcnRSZXN1bHRzKHJlc3VsdHMsIHByb3ZpZGVkUmVzdWx0cy5zbGljZSgwLCAxKSk7XG5cdFx0XHRhc3NlcnQod2FzQ2FuY2VsZWQsICdFeHBlY3RlZCB0byBiZSBjYW5jZWxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF4IHJlc3VsdHMgPSAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZWRSZXN1bHRzOiB2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdFtdID0gW1xuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZmlsZTIudHMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMy50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRsZXQgd2FzQ2FuY2VsZWQgPSBmYWxzZTtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB3YXNDYW5jZWxlZCA9IHRydWUpKTtcblx0XHRcdFx0XHRwcm92aWRlZFJlc3VsdHMuZm9yRWFjaChyID0+IHByb2dyZXNzLnJlcG9ydChyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4oJ2ZvbycpLFxuXG5cdFx0XHRcdG1heFJlc3VsdHM6IDIsXG5cblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cywgc3RhdHMgfSA9IGF3YWl0IHJ1blRleHRTZWFyY2gocXVlcnkpO1xuXHRcdFx0YXNzZXJ0KHN0YXRzLmxpbWl0SGl0LCAnRXhwZWN0ZWQgdG8gcmV0dXJuIGxpbWl0SGl0Jyk7XG5cdFx0XHRhc3NlcnRSZXN1bHRzKHJlc3VsdHMsIHByb3ZpZGVkUmVzdWx0cy5zbGljZSgwLCAyKSk7XG5cdFx0XHRhc3NlcnQod2FzQ2FuY2VsZWQsICdFeHBlY3RlZCB0byBiZSBjYW5jZWxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvdmlkZXIgcmV0dXJucyBtYXhSZXN1bHRzIGV4YWN0bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlZFJlc3VsdHM6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0W10gPSBbXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZmlsZTEudHMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMi50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRsZXQgd2FzQ2FuY2VsZWQgPSBmYWxzZTtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB3YXNDYW5jZWxlZCA9IHRydWUpKTtcblx0XHRcdFx0XHRwcm92aWRlZFJlc3VsdHMuZm9yRWFjaChyID0+IHByb2dyZXNzLnJlcG9ydChyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4oJ2ZvbycpLFxuXG5cdFx0XHRcdG1heFJlc3VsdHM6IDIsXG5cblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cywgc3RhdHMgfSA9IGF3YWl0IHJ1blRleHRTZWFyY2gocXVlcnkpO1xuXHRcdFx0YXNzZXJ0KCFzdGF0cy5saW1pdEhpdCwgJ0V4cGVjdGVkIG5vdCB0byByZXR1cm4gbGltaXRIaXQnKTtcblx0XHRcdGFzc2VydFJlc3VsdHMocmVzdWx0cywgcHJvdmlkZWRSZXN1bHRzKTtcblx0XHRcdGFzc2VydCghd2FzQ2FuY2VsZWQsICdFeHBlY3RlZCBub3QgdG8gYmUgY2FuY2VsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb3ZpZGVyIHJldHVybnMgZWFybHkgd2l0aCBsaW1pdEhpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVkUmVzdWx0czogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSA9IFtcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUyLnRzJyksXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZmlsZTMudHMnKVxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0cHJvdmlkZWRSZXN1bHRzLmZvckVhY2gociA9PiBwcm9ncmVzcy5yZXBvcnQocikpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBsaW1pdEhpdDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0bWF4UmVzdWx0czogMTAwMCxcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJBIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzLCBzdGF0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnQoc3RhdHMubGltaXRIaXQsICdFeHBlY3RlZCB0byByZXR1cm4gbGltaXRIaXQnKTtcblx0XHRcdGFzc2VydFJlc3VsdHMocmVzdWx0cywgcHJvdmlkZWRSZXN1bHRzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcm9vdCBtYXggcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYW5jZWxzID0gMDtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdGFzeW5jIHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBjYW5jZWxzKyspKTtcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHByb2Nlc3MubmV4dFRpY2socikpO1xuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCdmaWxlMS50cycsXG5cdFx0XHRcdFx0XHQnZmlsZTIudHMnLFxuXHRcdFx0XHRcdFx0J2ZpbGUzLnRzJyxcblx0XHRcdFx0XHRdLmZvckVhY2goZiA9PiBwcm9ncmVzcy5yZXBvcnQobWFrZVRleHRSZXN1bHQob3B0aW9ucy5mb2xkZXIsIGYpKSk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGwhO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHQsXG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBnZXRQYXR0ZXJuKCdmb28nKSxcblxuXHRcdFx0XHRtYXhSZXN1bHRzOiAyLFxuXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckEgfSxcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckIgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHJ1blRleHRTZWFyY2gocXVlcnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5jZWxzLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dvcmtzIHdpdGggbm9uLWZpbGUgc2NoZW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVkUmVzdWx0czogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSA9IFtcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQoZmFuY3lTY2hlbWVGb2xkZXJBLCAnZmlsZTEudHMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQoZmFuY3lTY2hlbWVGb2xkZXJBLCAnZmlsZTIudHMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQoZmFuY3lTY2hlbWVGb2xkZXJBLCAnZmlsZTMudHMnKVxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0cHJvdmlkZWRSZXN1bHRzLmZvckVhY2gociA9PiBwcm9ncmVzcy5yZXBvcnQocikpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBmYW5jeVNjaGVtZSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiBmYW5jeVNjaGVtZUZvbGRlckEgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHJ1blRleHRTZWFyY2gocXVlcnkpO1xuXHRcdFx0YXNzZXJ0UmVzdWx0cyhyZXN1bHRzLCBwcm92aWRlZFJlc3VsdHMpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFB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
