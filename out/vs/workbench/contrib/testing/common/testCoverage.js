import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { deepClone } from "../../../../base/common/objects.js";
import { observableSignal } from "../../../../base/common/observable.js";
import { WellDefinedPrefixTree } from "../../../../base/common/prefixTree.js";
import { URI } from "../../../../base/common/uri.js";
import { DetailType, ICoverageCount } from "./testTypes.js";
let incId = 0;
class TestCoverage {
  constructor(result, fromTaskId, uriIdentityService, accessor) {
    this.result = result;
    this.fromTaskId = fromTaskId;
    this.uriIdentityService = uriIdentityService;
    this.accessor = accessor;
    this.fileCoverage = new ResourceMap();
    this.didAddCoverage = observableSignal(this);
    this.tree = new WellDefinedPrefixTree();
    this.associatedData = /* @__PURE__ */ new Map();
  }
  /** Gets all test IDs that were included in this test run. */
  *allPerTestIDs() {
    const seen = /* @__PURE__ */ new Set();
    for (const root of this.tree.nodes) {
      if (root.value && root.value.perTestData) {
        for (const id of root.value.perTestData) {
          if (!seen.has(id)) {
            seen.add(id);
            yield id;
          }
        }
      }
    }
  }
  append(coverage, tx) {
    const previous = this.getComputedForUri(coverage.uri);
    const result = this.result;
    const applyDelta = (kind, node) => {
      if (!node[kind]) {
        if (coverage[kind]) {
          node[kind] = { ...coverage[kind] };
        }
      } else {
        node[kind].covered += (coverage[kind]?.covered || 0) - (previous?.[kind]?.covered || 0);
        node[kind].total += (coverage[kind]?.total || 0) - (previous?.[kind]?.total || 0);
      }
    };
    const canonical = [...this.treePathForUri(
      coverage.uri,
      /* canonical = */
      true
    )];
    const chain = [];
    this.tree.mutatePath(this.treePathForUri(
      coverage.uri,
      /* canonical = */
      false
    ), (node) => {
      chain.push(node);
      if (chain.length === canonical.length) {
        if (node.value) {
          const v = node.value;
          v.id = coverage.id;
          v.statement = coverage.statement;
          v.branch = coverage.branch;
          v.declaration = coverage.declaration;
        } else {
          const v = node.value = new FileCoverage(coverage, result, this.accessor);
          this.fileCoverage.set(coverage.uri, v);
        }
      } else {
        if (!node.value) {
          const intermediate = deepClone(coverage);
          intermediate.id = String(incId++);
          intermediate.uri = this.treePathToUri(canonical.slice(0, chain.length));
          node.value = new ComputedFileCoverage(intermediate, result);
        } else {
          applyDelta("statement", node.value);
          applyDelta("branch", node.value);
          applyDelta("declaration", node.value);
          node.value.didChange.trigger(tx);
        }
      }
      if (coverage.testIds) {
        node.value.perTestData ??= /* @__PURE__ */ new Set();
        for (const id of coverage.testIds) {
          node.value.perTestData.add(id);
        }
      }
    });
    if (chain) {
      this.didAddCoverage.trigger(tx, chain);
    }
  }
  /**
   * Builds a new tree filtered to per-test coverage data for the given ID.
   */
  filterTreeForTest(testId) {
    const tree = new WellDefinedPrefixTree();
    for (const node of this.tree.values()) {
      if (node instanceof FileCoverage) {
        if (!node.perTestData?.has(testId.toString())) {
          continue;
        }
        const canonical = [...this.treePathForUri(
          node.uri,
          /* canonical = */
          true
        )];
        const chain = [];
        tree.mutatePath(this.treePathForUri(
          node.uri,
          /* canonical = */
          false
        ), (n) => {
          chain.push(n);
          n.value ??= new BypassedFileCoverage(this.treePathToUri(canonical.slice(0, chain.length)), node.fromResult);
        });
      }
    }
    return tree;
  }
  /**
   * Gets coverage information for all files.
   */
  getAllFiles() {
    return this.fileCoverage;
  }
  /**
   * Gets coverage information for a specific file.
   */
  getUri(uri) {
    return this.fileCoverage.get(uri);
  }
  /**
   * Gets computed information for a file, including DFS-computed information
   * from child tests.
   */
  getComputedForUri(uri) {
    return this.tree.find(this.treePathForUri(
      uri,
      /* canonical = */
      false
    ));
  }
  *treePathForUri(uri, canconicalPath) {
    yield uri.scheme;
    yield uri.authority;
    const path = !canconicalPath && this.uriIdentityService.extUri.ignorePathCasing(uri) ? uri.path.toLowerCase() : uri.path;
    yield* path.split("/");
  }
  treePathToUri(path) {
    return URI.from({ scheme: path[0], authority: path[1], path: path.slice(2).join("/") });
  }
}
const getTotalCoveragePercent = (statement, branch, function_) => {
  let numerator = statement.covered;
  let denominator = statement.total;
  if (branch) {
    numerator += branch.covered;
    denominator += branch.total;
  }
  if (function_) {
    numerator += function_.covered;
    denominator += function_.total;
  }
  return denominator === 0 ? 1 : numerator / denominator;
};
class AbstractFileCoverage {
  constructor(coverage, fromResult) {
    this.fromResult = fromResult;
    this.didChange = observableSignal(this);
    this.id = coverage.id;
    this.uri = coverage.uri;
    this.statement = coverage.statement;
    this.branch = coverage.branch;
    this.declaration = coverage.declaration;
  }
  /**
   * Gets the total coverage percent based on information provided.
   * This is based on the Clover total coverage formula
   */
  get tpc() {
    return getTotalCoveragePercent(this.statement, this.branch, this.declaration);
  }
}
class ComputedFileCoverage extends AbstractFileCoverage {
}
class BypassedFileCoverage extends ComputedFileCoverage {
  constructor(uri, result) {
    super({ id: String(incId++), uri, statement: { covered: 0, total: 0 } }, result);
  }
}
class FileCoverage extends AbstractFileCoverage {
  constructor(coverage, fromResult, accessor) {
    super(coverage, fromResult);
    this.accessor = accessor;
  }
  /** Gets whether details are synchronously available */
  get hasSynchronousDetails() {
    return this._details instanceof Array || this.resolved;
  }
  /**
   * Gets per-line coverage details.
   */
  async detailsForTest(_testId, token = CancellationToken.None) {
    this._detailsForTest ??= /* @__PURE__ */ new Map();
    const testId = _testId.toString();
    const prev = this._detailsForTest.get(testId);
    if (prev) {
      return prev;
    }
    const promise = (async () => {
      try {
        return await this.accessor.getCoverageDetails(this.id, testId, token);
      } catch (e) {
        this._detailsForTest?.delete(testId);
        throw e;
      }
    })();
    this._detailsForTest.set(testId, promise);
    return promise;
  }
  /**
   * Gets per-line coverage details.
   */
  async details(token = CancellationToken.None) {
    this._details ??= this.accessor.getCoverageDetails(this.id, void 0, token);
    try {
      const d = await this._details;
      this.resolved = true;
      return d;
    } catch (e) {
      this._details = void 0;
      throw e;
    }
  }
}
const totalFromCoverageDetails = (uri, details) => {
  const fc = {
    id: "",
    uri,
    statement: ICoverageCount.empty()
  };
  for (const detail of details) {
    if (detail.type === DetailType.Statement) {
      fc.statement.total++;
      fc.statement.total += detail.count ? 1 : 0;
      for (const branch of detail.branches || []) {
        fc.branch ??= ICoverageCount.empty();
        fc.branch.total++;
        fc.branch.covered += branch.count ? 1 : 0;
      }
    } else {
      fc.declaration ??= ICoverageCount.empty();
      fc.declaration.total++;
      fc.declaration.covered += detail.count ? 1 : 0;
    }
  }
  return fc;
};
export {
  AbstractFileCoverage,
  BypassedFileCoverage,
  ComputedFileCoverage,
  FileCoverage,
  TestCoverage,
  getTotalCoveragePercent,
  totalFromCoverageDetails
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RDb3ZlcmFnZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlU2lnbmFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJUHJlZml4VHJlZU5vZGUsIFdlbGxEZWZpbmVkUHJlZml4VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3ByZWZpeFRyZWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgTGl2ZVRlc3RSZXN1bHQgfSBmcm9tICcuL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgQ292ZXJhZ2VEZXRhaWxzLCBEZXRhaWxUeXBlLCBJQ292ZXJhZ2VDb3VudCwgSUZpbGVDb3ZlcmFnZSB9IGZyb20gJy4vdGVzdFR5cGVzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQ292ZXJhZ2VBY2Nlc3NvciB7XG5cdGdldENvdmVyYWdlRGV0YWlsczogKGlkOiBzdHJpbmcsIHRlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8Q292ZXJhZ2VEZXRhaWxzW10+O1xufVxuXG5sZXQgaW5jSWQgPSAwO1xuXG4vKipcbiAqIENsYXNzIHRoYXQgZXhwb3Nlc2UgY292ZXJhZ2UgaW5mb3JtYXRpb24gZm9yIGEgcnVuLlxuICovXG5leHBvcnQgY2xhc3MgVGVzdENvdmVyYWdlIHtcblx0cHJpdmF0ZSByZWFkb25seSBmaWxlQ292ZXJhZ2UgPSBuZXcgUmVzb3VyY2VNYXA8RmlsZUNvdmVyYWdlPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgZGlkQWRkQ292ZXJhZ2UgPSBvYnNlcnZhYmxlU2lnbmFsPElQcmVmaXhUcmVlTm9kZTxBYnN0cmFjdEZpbGVDb3ZlcmFnZT5bXT4odGhpcyk7XG5cdHB1YmxpYyByZWFkb25seSB0cmVlID0gbmV3IFdlbGxEZWZpbmVkUHJlZml4VHJlZTxBYnN0cmFjdEZpbGVDb3ZlcmFnZT4oKTtcblx0cHVibGljIHJlYWRvbmx5IGFzc29jaWF0ZWREYXRhID0gbmV3IE1hcDx1bmtub3duLCB1bmtub3duPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZXN1bHQ6IExpdmVUZXN0UmVzdWx0LFxuXHRcdHB1YmxpYyByZWFkb25seSBmcm9tVGFza0lkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY2Nlc3NvcjogSUNvdmVyYWdlQWNjZXNzb3IsXG5cdCkgeyB9XG5cblx0LyoqIEdldHMgYWxsIHRlc3QgSURzIHRoYXQgd2VyZSBpbmNsdWRlZCBpbiB0aGlzIHRlc3QgcnVuLiAqL1xuXHRwdWJsaWMgKmFsbFBlclRlc3RJRHMoKSB7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiB0aGlzLnRyZWUubm9kZXMpIHtcblx0XHRcdGlmIChyb290LnZhbHVlICYmIHJvb3QudmFsdWUucGVyVGVzdERhdGEpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBvZiByb290LnZhbHVlLnBlclRlc3REYXRhKSB7XG5cdFx0XHRcdFx0aWYgKCFzZWVuLmhhcyhpZCkpIHtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKGlkKTtcblx0XHRcdFx0XHRcdHlpZWxkIGlkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhcHBlbmQoY292ZXJhZ2U6IElGaWxlQ292ZXJhZ2UsIHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuZ2V0Q29tcHV0ZWRGb3JVcmkoY292ZXJhZ2UudXJpKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnJlc3VsdDtcblx0XHRjb25zdCBhcHBseURlbHRhID0gKGtpbmQ6ICdzdGF0ZW1lbnQnIHwgJ2JyYW5jaCcgfCAnZGVjbGFyYXRpb24nLCBub2RlOiBDb21wdXRlZEZpbGVDb3ZlcmFnZSkgPT4ge1xuXHRcdFx0aWYgKCFub2RlW2tpbmRdKSB7XG5cdFx0XHRcdGlmIChjb3ZlcmFnZVtraW5kXSkge1xuXHRcdFx0XHRcdG5vZGVba2luZF0gPSB7IC4uLmNvdmVyYWdlW2tpbmRdISB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRub2RlW2tpbmRdIS5jb3ZlcmVkICs9IChjb3ZlcmFnZVtraW5kXT8uY292ZXJlZCB8fCAwKSAtIChwcmV2aW91cz8uW2tpbmRdPy5jb3ZlcmVkIHx8IDApO1xuXHRcdFx0XHRub2RlW2tpbmRdIS50b3RhbCArPSAoY292ZXJhZ2Vba2luZF0/LnRvdGFsIHx8IDApIC0gKHByZXZpb3VzPy5ba2luZF0/LnRvdGFsIHx8IDApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBXZSBpbnNlcnQgdXNpbmcgdGhlIG5vbi1jYW5vbmljYWwgcGF0aCB0byBub3JtYWxpemUgZm9yIGNhc2luZyBkaWZmZXJlbmNlc1xuXHRcdC8vIGJldHdlZW4gVVJJcywgYnV0IHdoZW4gaW5zZXJ0aW5nIGFuIGludGVybWVkaWF0ZSBub2RlIGFsd2F5cyB1c2UgJ2EnIGNhbm9uaWNhbFxuXHRcdC8vIHZlcnNpb24uXG5cdFx0Y29uc3QgY2Fub25pY2FsID0gWy4uLnRoaXMudHJlZVBhdGhGb3JVcmkoY292ZXJhZ2UudXJpLCAvKiBjYW5vbmljYWwgPSAqLyB0cnVlKV07XG5cdFx0Y29uc3QgY2hhaW46IElQcmVmaXhUcmVlTm9kZTxBYnN0cmFjdEZpbGVDb3ZlcmFnZT5bXSA9IFtdO1xuXG5cdFx0dGhpcy50cmVlLm11dGF0ZVBhdGgodGhpcy50cmVlUGF0aEZvclVyaShjb3ZlcmFnZS51cmksIC8qIGNhbm9uaWNhbCA9ICovIGZhbHNlKSwgbm9kZSA9PiB7XG5cdFx0XHRjaGFpbi5wdXNoKG5vZGUpO1xuXG5cdFx0XHRpZiAoY2hhaW4ubGVuZ3RoID09PSBjYW5vbmljYWwubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIHdlIHJlYWNoZWQgb3VyIGRlc3RpbmF0aW9uIG5vZGUsIGFwcGx5IHRoZSBjb3ZlcmFnZSBhcyBuZWNlc3Nhcnk6XG5cdFx0XHRcdGlmIChub2RlLnZhbHVlKSB7XG5cdFx0XHRcdFx0Y29uc3QgdiA9IG5vZGUudmFsdWU7XG5cdFx0XHRcdFx0Ly8gaWYgSUQgd2FzIGdlbmVyYXRlZCBmcm9tIGEgdGVzdC1zcGVjaWZpYyBjb3ZlcmFnZSwgcmVhc3NpZ24gaXQgdG8gZ2V0IGl0cyByZWFsIElEIGluIHRoZSBleHRlbnNpb24gaG9zdC5cblx0XHRcdFx0XHR2LmlkID0gY292ZXJhZ2UuaWQ7XG5cdFx0XHRcdFx0di5zdGF0ZW1lbnQgPSBjb3ZlcmFnZS5zdGF0ZW1lbnQ7XG5cdFx0XHRcdFx0di5icmFuY2ggPSBjb3ZlcmFnZS5icmFuY2g7XG5cdFx0XHRcdFx0di5kZWNsYXJhdGlvbiA9IGNvdmVyYWdlLmRlY2xhcmF0aW9uO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHYgPSBub2RlLnZhbHVlID0gbmV3IEZpbGVDb3ZlcmFnZShjb3ZlcmFnZSwgcmVzdWx0LCB0aGlzLmFjY2Vzc29yKTtcblx0XHRcdFx0XHR0aGlzLmZpbGVDb3ZlcmFnZS5zZXQoY292ZXJhZ2UudXJpLCB2KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gT3RoZXJ3aXNlLCBpZiB0aGlzIGlzIG5vdCBhIHBhcnRpYWwgcGVyLXRlc3QgY292ZXJhZ2UsIG1lcmdlIHRoZVxuXHRcdFx0XHQvLyBjb3ZlcmFnZSBjaGFuZ2VzIGludG8gdGhlIGNoYWluLiBQZXItdGVzdCBjb3ZlcmFnZXMgYXJlIG5vdCBjb21wbGV0ZVxuXHRcdFx0XHQvLyBhbmQgd2UgZG9uJ3Qgd2FudCB0byBjb25zaWRlciB0aGVtIGZvciBjb21wdXRhdGlvbi5cblx0XHRcdFx0aWYgKCFub2RlLnZhbHVlKSB7XG5cdFx0XHRcdFx0Ly8gY2xvbmUgYmVjYXVzZSBsYXRlciBpbnRlcnNlcnRpb25zIGNhbiBtb2RpZnkgdGhlIGNvdW50czpcblx0XHRcdFx0XHRjb25zdCBpbnRlcm1lZGlhdGUgPSBkZWVwQ2xvbmUoY292ZXJhZ2UpO1xuXHRcdFx0XHRcdGludGVybWVkaWF0ZS5pZCA9IFN0cmluZyhpbmNJZCsrKTtcblx0XHRcdFx0XHRpbnRlcm1lZGlhdGUudXJpID0gdGhpcy50cmVlUGF0aFRvVXJpKGNhbm9uaWNhbC5zbGljZSgwLCBjaGFpbi5sZW5ndGgpKTtcblx0XHRcdFx0XHRub2RlLnZhbHVlID0gbmV3IENvbXB1dGVkRmlsZUNvdmVyYWdlKGludGVybWVkaWF0ZSwgcmVzdWx0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhcHBseURlbHRhKCdzdGF0ZW1lbnQnLCBub2RlLnZhbHVlKTtcblx0XHRcdFx0XHRhcHBseURlbHRhKCdicmFuY2gnLCBub2RlLnZhbHVlKTtcblx0XHRcdFx0XHRhcHBseURlbHRhKCdkZWNsYXJhdGlvbicsIG5vZGUudmFsdWUpO1xuXHRcdFx0XHRcdG5vZGUudmFsdWUuZGlkQ2hhbmdlLnRyaWdnZXIodHgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb3ZlcmFnZS50ZXN0SWRzKSB7XG5cdFx0XHRcdG5vZGUudmFsdWUhLnBlclRlc3REYXRhID8/PSBuZXcgU2V0KCk7XG5cdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgY292ZXJhZ2UudGVzdElkcykge1xuXHRcdFx0XHRcdG5vZGUudmFsdWUhLnBlclRlc3REYXRhLmFkZChpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChjaGFpbikge1xuXHRcdFx0dGhpcy5kaWRBZGRDb3ZlcmFnZS50cmlnZ2VyKHR4LCBjaGFpbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyBhIG5ldyB0cmVlIGZpbHRlcmVkIHRvIHBlci10ZXN0IGNvdmVyYWdlIGRhdGEgZm9yIHRoZSBnaXZlbiBJRC5cblx0ICovXG5cdHB1YmxpYyBmaWx0ZXJUcmVlRm9yVGVzdCh0ZXN0SWQ6IFRlc3RJZCkge1xuXHRcdGNvbnN0IHRyZWUgPSBuZXcgV2VsbERlZmluZWRQcmVmaXhUcmVlPEFic3RyYWN0RmlsZUNvdmVyYWdlPigpO1xuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiB0aGlzLnRyZWUudmFsdWVzKCkpIHtcblx0XHRcdGlmIChub2RlIGluc3RhbmNlb2YgRmlsZUNvdmVyYWdlKSB7XG5cdFx0XHRcdGlmICghbm9kZS5wZXJUZXN0RGF0YT8uaGFzKHRlc3RJZC50b1N0cmluZygpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY2Fub25pY2FsID0gWy4uLnRoaXMudHJlZVBhdGhGb3JVcmkobm9kZS51cmksIC8qIGNhbm9uaWNhbCA9ICovIHRydWUpXTtcblx0XHRcdFx0Y29uc3QgY2hhaW46IElQcmVmaXhUcmVlTm9kZTxBYnN0cmFjdEZpbGVDb3ZlcmFnZT5bXSA9IFtdO1xuXHRcdFx0XHR0cmVlLm11dGF0ZVBhdGgodGhpcy50cmVlUGF0aEZvclVyaShub2RlLnVyaSwgLyogY2Fub25pY2FsID0gKi8gZmFsc2UpLCBuID0+IHtcblx0XHRcdFx0XHRjaGFpbi5wdXNoKG4pO1xuXHRcdFx0XHRcdG4udmFsdWUgPz89IG5ldyBCeXBhc3NlZEZpbGVDb3ZlcmFnZSh0aGlzLnRyZWVQYXRoVG9VcmkoY2Fub25pY2FsLnNsaWNlKDAsIGNoYWluLmxlbmd0aCkpLCBub2RlLmZyb21SZXN1bHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJlZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGNvdmVyYWdlIGluZm9ybWF0aW9uIGZvciBhbGwgZmlsZXMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0QWxsRmlsZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZUNvdmVyYWdlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgY292ZXJhZ2UgaW5mb3JtYXRpb24gZm9yIGEgc3BlY2lmaWMgZmlsZS5cblx0ICovXG5cdHB1YmxpYyBnZXRVcmkodXJpOiBVUkkpIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlQ292ZXJhZ2UuZ2V0KHVyaSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBjb21wdXRlZCBpbmZvcm1hdGlvbiBmb3IgYSBmaWxlLCBpbmNsdWRpbmcgREZTLWNvbXB1dGVkIGluZm9ybWF0aW9uXG5cdCAqIGZyb20gY2hpbGQgdGVzdHMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Q29tcHV0ZWRGb3JVcmkodXJpOiBVUkkpIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmZpbmQodGhpcy50cmVlUGF0aEZvclVyaSh1cmksIC8qIGNhbm9uaWNhbCA9ICovIGZhbHNlKSk7XG5cdH1cblxuXHRwcml2YXRlICp0cmVlUGF0aEZvclVyaSh1cmk6IFVSSSwgY2FuY29uaWNhbFBhdGg6IGJvb2xlYW4pIHtcblx0XHR5aWVsZCB1cmkuc2NoZW1lO1xuXHRcdHlpZWxkIHVyaS5hdXRob3JpdHk7XG5cblx0XHRjb25zdCBwYXRoID0gIWNhbmNvbmljYWxQYXRoICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pZ25vcmVQYXRoQ2FzaW5nKHVyaSkgPyB1cmkucGF0aC50b0xvd2VyQ2FzZSgpIDogdXJpLnBhdGg7XG5cdFx0eWllbGQqIHBhdGguc3BsaXQoJy8nKTtcblx0fVxuXG5cdHByaXZhdGUgdHJlZVBhdGhUb1VyaShwYXRoOiBzdHJpbmdbXSkge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogcGF0aFswXSwgYXV0aG9yaXR5OiBwYXRoWzFdLCBwYXRoOiBwYXRoLnNsaWNlKDIpLmpvaW4oJy8nKSB9KTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZ2V0VG90YWxDb3ZlcmFnZVBlcmNlbnQgPSAoc3RhdGVtZW50OiBJQ292ZXJhZ2VDb3VudCwgYnJhbmNoOiBJQ292ZXJhZ2VDb3VudCB8IHVuZGVmaW5lZCwgZnVuY3Rpb25fOiBJQ292ZXJhZ2VDb3VudCB8IHVuZGVmaW5lZCkgPT4ge1xuXHRsZXQgbnVtZXJhdG9yID0gc3RhdGVtZW50LmNvdmVyZWQ7XG5cdGxldCBkZW5vbWluYXRvciA9IHN0YXRlbWVudC50b3RhbDtcblxuXHRpZiAoYnJhbmNoKSB7XG5cdFx0bnVtZXJhdG9yICs9IGJyYW5jaC5jb3ZlcmVkO1xuXHRcdGRlbm9taW5hdG9yICs9IGJyYW5jaC50b3RhbDtcblx0fVxuXG5cdGlmIChmdW5jdGlvbl8pIHtcblx0XHRudW1lcmF0b3IgKz0gZnVuY3Rpb25fLmNvdmVyZWQ7XG5cdFx0ZGVub21pbmF0b3IgKz0gZnVuY3Rpb25fLnRvdGFsO1xuXHR9XG5cblx0cmV0dXJuIGRlbm9taW5hdG9yID09PSAwID8gMSA6IG51bWVyYXRvciAvIGRlbm9taW5hdG9yO1xufTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0RmlsZUNvdmVyYWdlIHtcblx0cHVibGljIGlkOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSB1cmk6IFVSSTtcblx0cHVibGljIHN0YXRlbWVudDogSUNvdmVyYWdlQ291bnQ7XG5cdHB1YmxpYyBicmFuY2g/OiBJQ292ZXJhZ2VDb3VudDtcblx0cHVibGljIGRlY2xhcmF0aW9uPzogSUNvdmVyYWdlQ291bnQ7XG5cdHB1YmxpYyByZWFkb25seSBkaWRDaGFuZ2UgPSBvYnNlcnZhYmxlU2lnbmFsKHRoaXMpO1xuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSB0b3RhbCBjb3ZlcmFnZSBwZXJjZW50IGJhc2VkIG9uIGluZm9ybWF0aW9uIHByb3ZpZGVkLlxuXHQgKiBUaGlzIGlzIGJhc2VkIG9uIHRoZSBDbG92ZXIgdG90YWwgY292ZXJhZ2UgZm9ybXVsYVxuXHQgKi9cblx0cHVibGljIGdldCB0cGMoKSB7XG5cdFx0cmV0dXJuIGdldFRvdGFsQ292ZXJhZ2VQZXJjZW50KHRoaXMuc3RhdGVtZW50LCB0aGlzLmJyYW5jaCwgdGhpcy5kZWNsYXJhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogUGVyLXRlc3QgY292ZXJhZ2UgZGF0YSBmb3IgdGhpcyBmaWxlLCBpZiBhdmFpbGFibGUuXG5cdCAqL1xuXHRwdWJsaWMgcGVyVGVzdERhdGE/OiBTZXQ8c3RyaW5nPjtcblxuXHRjb25zdHJ1Y3Rvcihjb3ZlcmFnZTogSUZpbGVDb3ZlcmFnZSwgcHVibGljIHJlYWRvbmx5IGZyb21SZXN1bHQ6IExpdmVUZXN0UmVzdWx0KSB7XG5cdFx0dGhpcy5pZCA9IGNvdmVyYWdlLmlkO1xuXHRcdHRoaXMudXJpID0gY292ZXJhZ2UudXJpO1xuXHRcdHRoaXMuc3RhdGVtZW50ID0gY292ZXJhZ2Uuc3RhdGVtZW50O1xuXHRcdHRoaXMuYnJhbmNoID0gY292ZXJhZ2UuYnJhbmNoO1xuXHRcdHRoaXMuZGVjbGFyYXRpb24gPSBjb3ZlcmFnZS5kZWNsYXJhdGlvbjtcblx0fVxufVxuXG4vKipcbiAqIEZpbGUgY292ZXJhZ2UgaW5mbyBjb21wdXRlZCBmcm9tIGNoaWxkcmVuIGluIHRoZSB0cmVlLCBub3QgcHJvdmlkZWQgYnkgdGhlXG4gKiBleHRlbnNpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBDb21wdXRlZEZpbGVDb3ZlcmFnZSBleHRlbmRzIEFic3RyYWN0RmlsZUNvdmVyYWdlIHsgfVxuXG4vKipcbiAqIEEgdmlydHVhbCBub2RlIHRoYXQgZG9lc24ndCBoYXZlIGFueSBhZGRlZCBjb3ZlcmFnZSBpbmZvLlxuICovXG5leHBvcnQgY2xhc3MgQnlwYXNzZWRGaWxlQ292ZXJhZ2UgZXh0ZW5kcyBDb21wdXRlZEZpbGVDb3ZlcmFnZSB7XG5cdGNvbnN0cnVjdG9yKHVyaTogVVJJLCByZXN1bHQ6IExpdmVUZXN0UmVzdWx0KSB7XG5cdFx0c3VwZXIoeyBpZDogU3RyaW5nKGluY0lkKyspLCB1cmksIHN0YXRlbWVudDogeyBjb3ZlcmVkOiAwLCB0b3RhbDogMCB9IH0sIHJlc3VsdCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVDb3ZlcmFnZSBleHRlbmRzIEFic3RyYWN0RmlsZUNvdmVyYWdlIHtcblx0cHJpdmF0ZSBfZGV0YWlscz86IFByb21pc2U8Q292ZXJhZ2VEZXRhaWxzW10+O1xuXHRwcml2YXRlIHJlc29sdmVkPzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfZGV0YWlsc0ZvclRlc3Q/OiBNYXA8c3RyaW5nLCBQcm9taXNlPENvdmVyYWdlRGV0YWlsc1tdPj47XG5cblx0LyoqIEdldHMgd2hldGhlciBkZXRhaWxzIGFyZSBzeW5jaHJvbm91c2x5IGF2YWlsYWJsZSAqL1xuXHRwdWJsaWMgZ2V0IGhhc1N5bmNocm9ub3VzRGV0YWlscygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGV0YWlscyBpbnN0YW5jZW9mIEFycmF5IHx8IHRoaXMucmVzb2x2ZWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihjb3ZlcmFnZTogSUZpbGVDb3ZlcmFnZSwgZnJvbVJlc3VsdDogTGl2ZVRlc3RSZXN1bHQsIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzb3I6IElDb3ZlcmFnZUFjY2Vzc29yKSB7XG5cdFx0c3VwZXIoY292ZXJhZ2UsIGZyb21SZXN1bHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgcGVyLWxpbmUgY292ZXJhZ2UgZGV0YWlscy5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBkZXRhaWxzRm9yVGVzdChfdGVzdElkOiBUZXN0SWQsIHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkge1xuXHRcdHRoaXMuX2RldGFpbHNGb3JUZXN0ID8/PSBuZXcgTWFwKCk7XG5cdFx0Y29uc3QgdGVzdElkID0gX3Rlc3RJZC50b1N0cmluZygpO1xuXHRcdGNvbnN0IHByZXYgPSB0aGlzLl9kZXRhaWxzRm9yVGVzdC5nZXQodGVzdElkKTtcblx0XHRpZiAocHJldikge1xuXHRcdFx0cmV0dXJuIHByZXY7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5hY2Nlc3Nvci5nZXRDb3ZlcmFnZURldGFpbHModGhpcy5pZCwgdGVzdElkLCB0b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHNGb3JUZXN0Py5kZWxldGUodGVzdElkKTtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0dGhpcy5fZGV0YWlsc0ZvclRlc3Quc2V0KHRlc3RJZCwgcHJvbWlzZSk7XG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBwZXItbGluZSBjb3ZlcmFnZSBkZXRhaWxzLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGRldGFpbHModG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSB7XG5cdFx0dGhpcy5fZGV0YWlscyA/Pz0gdGhpcy5hY2Nlc3Nvci5nZXRDb3ZlcmFnZURldGFpbHModGhpcy5pZCwgdW5kZWZpbmVkLCB0b2tlbik7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZCA9IGF3YWl0IHRoaXMuX2RldGFpbHM7XG5cdFx0XHR0aGlzLnJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdHJldHVybiBkO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2RldGFpbHMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY29uc3QgdG90YWxGcm9tQ292ZXJhZ2VEZXRhaWxzID0gKHVyaTogVVJJLCBkZXRhaWxzOiBDb3ZlcmFnZURldGFpbHNbXSk6IElGaWxlQ292ZXJhZ2UgPT4ge1xuXHRjb25zdCBmYzogSUZpbGVDb3ZlcmFnZSA9IHtcblx0XHRpZDogJycsXG5cdFx0dXJpLFxuXHRcdHN0YXRlbWVudDogSUNvdmVyYWdlQ291bnQuZW1wdHkoKSxcblx0fTtcblxuXHRmb3IgKGNvbnN0IGRldGFpbCBvZiBkZXRhaWxzKSB7XG5cdFx0aWYgKGRldGFpbC50eXBlID09PSBEZXRhaWxUeXBlLlN0YXRlbWVudCkge1xuXHRcdFx0ZmMuc3RhdGVtZW50LnRvdGFsKys7XG5cdFx0XHRmYy5zdGF0ZW1lbnQudG90YWwgKz0gZGV0YWlsLmNvdW50ID8gMSA6IDA7XG5cblx0XHRcdGZvciAoY29uc3QgYnJhbmNoIG9mIGRldGFpbC5icmFuY2hlcyB8fCBbXSkge1xuXHRcdFx0XHRmYy5icmFuY2ggPz89IElDb3ZlcmFnZUNvdW50LmVtcHR5KCk7XG5cdFx0XHRcdGZjLmJyYW5jaC50b3RhbCsrO1xuXHRcdFx0XHRmYy5icmFuY2guY292ZXJlZCArPSBicmFuY2guY291bnQgPyAxIDogMDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZmMuZGVjbGFyYXRpb24gPz89IElDb3ZlcmFnZUNvdW50LmVtcHR5KCk7XG5cdFx0XHRmYy5kZWNsYXJhdGlvbi50b3RhbCsrO1xuXHRcdFx0ZmMuZGVjbGFyYXRpb24uY292ZXJlZCArPSBkZXRhaWwuY291bnQgPyAxIDogMDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZmM7XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBdUIsd0JBQXdCO0FBQy9DLFNBQTBCLDZCQUE2QjtBQUN2RCxTQUFTLFdBQVc7QUFJcEIsU0FBMEIsWUFBWSxzQkFBcUM7QUFNM0UsSUFBSSxRQUFRO0FBS0wsTUFBTSxhQUFhO0FBQUEsRUFNekIsWUFDaUIsUUFDQSxZQUNDLG9CQUNBLFVBQ2hCO0FBSmU7QUFDQTtBQUNDO0FBQ0E7QUFUbEIsU0FBaUIsZUFBZSxJQUFJLFlBQTBCO0FBQzlELFNBQWdCLGlCQUFpQixpQkFBMEQsSUFBSTtBQUMvRixTQUFnQixPQUFPLElBQUksc0JBQTRDO0FBQ3ZFLFNBQWdCLGlCQUFpQixvQkFBSSxJQUFzQjtBQUFBLEVBT3ZEO0FBQUE7QUFBQSxFQUdKLENBQVEsZ0JBQWdCO0FBQ3ZCLFVBQU0sT0FBTyxvQkFBSSxJQUFZO0FBQzdCLGVBQVcsUUFBUSxLQUFLLEtBQUssT0FBTztBQUNuQyxVQUFJLEtBQUssU0FBUyxLQUFLLE1BQU0s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
