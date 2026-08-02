import { stringDiff } from "../../../base/common/diff/diff.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { computeLinks } from "../languages/linkComputer.js";
import { BasicInplaceReplace } from "../languages/supports/inplaceReplaceSupport.js";
import { createMonacoBaseAPI } from "./editorBaseApi.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { UnicodeTextModelHighlighter } from "./unicodeTextModelHighlighter.js";
import { DiffComputer } from "../diff/legacyLinesDiffComputer.js";
import { DetailedLineRangeMapping } from "../diff/rangeMapping.js";
import { linesDiffComputers } from "../diff/linesDiffComputers.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
import { computeDefaultDocumentColors } from "../languages/defaultDocumentColorsComputer.js";
import { findSectionHeaders } from "./findSectionHeaders.js";
import { WorkerTextModelSyncServer } from "./textModelSync/textModelSync.impl.js";
import { StringText } from "../core/text/abstractText.js";
import { ensureDependenciesAreSet } from "../core/text/positionToOffset.js";
const _EditorWorker = class _EditorWorker {
  constructor(_foreignModule = null) {
    this._foreignModule = _foreignModule;
    this._requestHandlerBrand = void 0;
    this._workerTextModelSyncServer = new WorkerTextModelSyncServer();
  }
  dispose() {
  }
  async $ping() {
    return "pong";
  }
  _getModel(uri) {
    return this._workerTextModelSyncServer.getModel(uri);
  }
  getModels() {
    return this._workerTextModelSyncServer.getModels();
  }
  $acceptNewModel(data) {
    this._workerTextModelSyncServer.$acceptNewModel(data);
  }
  $acceptModelChanged(uri, e) {
    this._workerTextModelSyncServer.$acceptModelChanged(uri, e);
  }
  $acceptRemovedModel(uri) {
    this._workerTextModelSyncServer.$acceptRemovedModel(uri);
  }
  async $computeUnicodeHighlights(url, options, range) {
    const model = this._getModel(url);
    if (!model) {
      return { ranges: [], hasMore: false, ambiguousCharacterCount: 0, invisibleCharacterCount: 0, nonBasicAsciiCharacterCount: 0 };
    }
    return UnicodeTextModelHighlighter.computeUnicodeHighlights(model, options, range);
  }
  async $findSectionHeaders(url, options) {
    const model = this._getModel(url);
    if (!model) {
      return [];
    }
    return findSectionHeaders(model, options);
  }
  // ---- BEGIN diff --------------------------------------------------------------------------
  async $computeDiff(originalUrl, modifiedUrl, options, algorithm) {
    const original = this._getModel(originalUrl);
    const modified = this._getModel(modifiedUrl);
    if (!original || !modified) {
      return null;
    }
    const diffAlgorithm = await resolveLinesDiffComputer(algorithm);
    const result = _EditorWorker.computeDiff(original, modified, options, diffAlgorithm);
    return result;
  }
  static computeDiff(originalTextModel, modifiedTextModel, options, diffAlgorithm) {
    const originalLines = originalTextModel.getLinesContent();
    const modifiedLines = modifiedTextModel.getLinesContent();
    const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, options);
    const identical = result.changes.length > 0 ? false : this._modelsAreIdentical(originalTextModel, modifiedTextModel);
    function getLineChanges(changes) {
      return changes.map((m) => [m.original.startLineNumber, m.original.endLineNumberExclusive, m.modified.startLineNumber, m.modified.endLineNumberExclusive, m.innerChanges?.map((m2) => [
        m2.originalRange.startLineNumber,
        m2.originalRange.startColumn,
        m2.originalRange.endLineNumber,
        m2.originalRange.endColumn,
        m2.modifiedRange.startLineNumber,
        m2.modifiedRange.startColumn,
        m2.modifiedRange.endLineNumber,
        m2.modifiedRange.endColumn
      ])]);
    }
    return {
      identical,
      quitEarly: result.hitTimeout,
      changes: getLineChanges(result.changes),
      moves: result.moves.map((m) => [
        m.lineRangeMapping.original.startLineNumber,
        m.lineRangeMapping.original.endLineNumberExclusive,
        m.lineRangeMapping.modified.startLineNumber,
        m.lineRangeMapping.modified.endLineNumberExclusive,
        getLineChanges(m.changes)
      ])
    };
  }
  static _modelsAreIdentical(original, modified) {
    const originalLineCount = original.getLineCount();
    const modifiedLineCount = modified.getLineCount();
    if (originalLineCount !== modifiedLineCount) {
      return false;
    }
    for (let line = 1; line <= originalLineCount; line++) {
      const originalLine = original.getLineContent(line);
      const modifiedLine = modified.getLineContent(line);
      if (originalLine !== modifiedLine) {
        return false;
      }
    }
    return true;
  }
  async $computeDirtyDiff(originalUrl, modifiedUrl, ignoreTrimWhitespace) {
    const original = this._getModel(originalUrl);
    const modified = this._getModel(modifiedUrl);
    if (!original || !modified) {
      return null;
    }
    const originalLines = original.getLinesContent();
    const modifiedLines = modified.getLinesContent();
    const diffComputer = new DiffComputer(originalLines, modifiedLines, {
      shouldComputeCharChanges: false,
      shouldPostProcessCharChanges: false,
      shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
      shouldMakePrettyDiff: true,
      maxComputationTime: 1e3
    });
    return diffComputer.computeDiff().changes;
  }
  async $computeStringDiff(original, modified, options, algorithm) {
    return (await computeStringDiff(original, modified, options, algorithm)).toJson();
  }
  async $computeMoreMinimalEdits(modelUrl, edits, pretty) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return edits;
    }
    const result = [];
    let lastEol = void 0;
    edits = edits.slice(0).sort((a, b) => {
      if (a.range && b.range) {
        return Range.compareRangesUsingStarts(a.range, b.range);
      }
      const aRng = a.range ? 0 : 1;
      const bRng = b.range ? 0 : 1;
      return aRng - bRng;
    });
    let writeIndex = 0;
    for (let readIndex = 1; readIndex < edits.length; readIndex++) {
      if (Range.getEndPosition(edits[writeIndex].range).equals(Range.getStartPosition(edits[readIndex].range))) {
        edits[writeIndex].range = Range.fromPositions(Range.getStartPosition(edits[writeIndex].range), Range.getEndPosition(edits[readIndex].range));
        edits[writeIndex].text += edits[readIndex].text;
      } else {
        writeIndex++;
        edits[writeIndex] = edits[readIndex];
      }
    }
    edits.length = writeIndex + 1;
    for (let { range, text, eol } of edits) {
      if (typeof eol === "number") {
        lastEol = eol;
      }
      if (Range.isEmpty(range) && !text) {
        continue;
      }
      const original = model.getValueInRange(range);
      text = text.replace(/\r\n|\n|\r/g, model.eol);
      if (original === text) {
        continue;
      }
      if (Math.max(text.length, original.length) > _EditorWorker._diffLimit) {
        result.push({ range, text });
        continue;
      }
      const changes = stringDiff(original, text, pretty);
      const editOffset = model.offsetAt(Range.lift(range).getStartPosition());
      for (const change of changes) {
        const start = model.positionAt(editOffset + change.originalStart);
        const end = model.positionAt(editOffset + change.originalStart + change.originalLength);
        const newEdit = {
          text: text.substr(change.modifiedStart, change.modifiedLength),
          range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }
        };
        if (model.getValueInRange(newEdit.range) !== newEdit.text) {
          result.push(newEdit);
        }
      }
    }
    if (typeof lastEol === "number") {
      result.push({ eol: lastEol, text: "", range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } });
    }
    return result;
  }
  $computeHumanReadableDiff(modelUrl, edits, options) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return edits;
    }
    const result = [];
    let lastEol = void 0;
    edits = edits.slice(0).sort((a, b) => {
      if (a.range && b.range) {
        return Range.compareRangesUsingStarts(a.range, b.range);
      }
      const aRng = a.range ? 0 : 1;
      const bRng = b.range ? 0 : 1;
      return aRng - bRng;
    });
    for (let { range, text, eol } of edits) {
      let addPositions2 = function(pos1, pos2) {
        return new Position(pos1.lineNumber + pos2.lineNumber - 1, pos2.lineNumber === 1 ? pos1.column + pos2.column - 1 : pos2.column);
      }, getText2 = function(lines, range2) {
        const result2 = [];
        for (let i = range2.startLineNumber; i <= range2.endLineNumber; i++) {
          const line = lines[i - 1];
          if (i === range2.startLineNumber && i === range2.endLineNumber) {
            result2.push(line.substring(range2.startColumn - 1, range2.endColumn - 1));
          } else if (i === range2.startLineNumber) {
            result2.push(line.substring(range2.startColumn - 1));
          } else if (i === range2.endLineNumber) {
            result2.push(line.substring(0, range2.endColumn - 1));
          } else {
            result2.push(line);
          }
        }
        return result2;
      };
      var addPositions = addPositions2, getText = getText2;
      if (typeof eol === "number") {
        lastEol = eol;
      }
      if (Range.isEmpty(range) && !text) {
        continue;
      }
      const original = model.getValueInRange(range);
      text = text.replace(/\r\n|\n|\r/g, model.eol);
      if (original === text) {
        continue;
      }
      if (Math.max(text.length, original.length) > _EditorWorker._diffLimit) {
        result.push({ range, text });
        continue;
      }
      const originalLines = original.split(/\r\n|\n|\r/);
      const modifiedLines = text.split(/\r\n|\n|\r/);
      const diff = linesDiffComputers.getDefault().computeDiff(originalLines, modifiedLines, options);
      const start = Range.lift(range).getStartPosition();
      for (const c of diff.changes) {
        if (c.innerChanges) {
          for (const x of c.innerChanges) {
            result.push({
              range: Range.fromPositions(
                addPositions2(start, x.originalRange.getStartPosition()),
                addPositions2(start, x.originalRange.getEndPosition())
              ),
              text: getText2(modifiedLines, x.modifiedRange).join(model.eol)
            });
          }
        } else {
          throw new BugIndicatingError("The experimental diff algorithm always produces inner changes");
        }
      }
    }
    if (typeof lastEol === "number") {
      result.push({ eol: lastEol, text: "", range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } });
    }
    return result;
  }
  // ---- END minimal edits ---------------------------------------------------------------
  async $computeLinks(modelUrl) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return null;
    }
    return computeLinks(model);
  }
  // --- BEGIN default document colors -----------------------------------------------------------
  async $computeDefaultDocumentColors(modelUrl) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return null;
    }
    return computeDefaultDocumentColors(model);
  }
  async $textualSuggest(modelUrls, leadingWord, wordDef, wordDefFlags) {
    const sw = new StopWatch();
    const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
    const seen = /* @__PURE__ */ new Set();
    outer: for (const url of modelUrls) {
      const model = this._getModel(url);
      if (!model) {
        continue;
      }
      for (const word of model.words(wordDefRegExp)) {
        if (word === leadingWord || !isNaN(Number(word))) {
          continue;
        }
        seen.add(word);
        if (seen.size > _EditorWorker._suggestionsLimit) {
          break outer;
        }
      }
    }
    return { words: Array.from(seen), duration: sw.elapsed() };
  }
  // ---- END suggest --------------------------------------------------------------------------
  //#region -- word ranges --
  async $computeWordRanges(modelUrl, range, wordDef, wordDefFlags) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return /* @__PURE__ */ Object.create(null);
    }
    const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
    const result = /* @__PURE__ */ Object.create(null);
    for (let line = range.startLineNumber; line < range.endLineNumber; line++) {
      const words = model.getLineWords(line, wordDefRegExp);
      for (const word of words) {
        if (!isNaN(Number(word.word))) {
          continue;
        }
        let array = result[word.word];
        if (!array) {
          array = [];
          result[word.word] = array;
        }
        array.push({
          startLineNumber: line,
          startColumn: word.startColumn,
          endLineNumber: line,
          endColumn: word.endColumn
        });
      }
    }
    return result;
  }
  //#endregion
  async $navigateValueSet(modelUrl, range, up, wordDef, wordDefFlags) {
    const model = this._getModel(modelUrl);
    if (!model) {
      return null;
    }
    const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
    if (range.startColumn === range.endColumn) {
      range = {
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn + 1
      };
    }
    const selectionText = model.getValueInRange(range);
    const wordRange = model.getWordAtPosition({ lineNumber: range.startLineNumber, column: range.startColumn }, wordDefRegExp);
    if (!wordRange) {
      return null;
    }
    const word = model.getValueInRange(wordRange);
    const result = BasicInplaceReplace.INSTANCE.navigateValueSet(range, selectionText, wordRange, word, up);
    return result;
  }
  // ---- BEGIN foreign module support --------------------------------------------------------------------------
  // foreign method request
  $fmr(method, args) {
    if (!this._foreignModule || typeof this._foreignModule[method] !== "function") {
      return Promise.reject(new Error("Missing requestHandler or method: " + method));
    }
    try {
      return Promise.resolve(this._foreignModule[method].apply(this._foreignModule, args));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  // ---- END foreign module support --------------------------------------------------------------------------
};
// ---- END diff --------------------------------------------------------------------------
// ---- BEGIN minimal edits ---------------------------------------------------------------
_EditorWorker._diffLimit = 1e5;
// ---- BEGIN suggest --------------------------------------------------------------------------
_EditorWorker._suggestionsLimit = 1e4;
let EditorWorker = _EditorWorker;
if (typeof importScripts === "function") {
  globalThis.monaco = createMonacoBaseAPI();
}
function resolveLinesDiffComputer(algorithm) {
  switch (algorithm) {
    case "legacy":
      return linesDiffComputers.getLegacy();
    case "advanced":
      return linesDiffComputers.getDefault();
    case "advanced-external":
      return linesDiffComputers.getAdvancedExternal();
    case "advanced-wasm":
      return linesDiffComputers.getAdvancedWasm();
  }
}
async function computeStringDiff(original, modified, options, algorithm) {
  const diffAlgorithm = await resolveLinesDiffComputer(algorithm);
  ensureDependenciesAreSet();
  const originalText = new StringText(original);
  const originalLines = originalText.getLines();
  const modifiedText = new StringText(modified);
  const modifiedLines = modifiedText.getLines();
  const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, { ignoreTrimWhitespace: false, maxComputationTimeMs: options.maxComputationTimeMs, computeMoves: false, extendToSubwords: false });
  const textEdit = DetailedLineRangeMapping.toTextEdit(result.changes, modifiedText);
  const strEdit = originalText.getTransformer().getStringEdit(textEdit);
  return strEdit;
}
export {
  EditorWorker,
  computeStringDiff
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV2ViV29ya2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgc3RyaW5nRGlmZiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RpZmYvZGlmZi5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vd29ya2VyL3dlYldvcmtlci5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UsIElUZXh0TW9kZWwgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTWlycm9yVGV4dE1vZGVsLCBJTW9kZWxDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi9tb2RlbC9taXJyb3JUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvbG9ySW5mb3JtYXRpb24sIElJbnBsYWNlUmVwbGFjZVN1cHBvcnRSZXN1bHQsIElMaW5rLCBUZXh0RWRpdCB9IGZyb20gJy4uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlTGlua3MgfSBmcm9tICcuLi9sYW5ndWFnZXMvbGlua0NvbXB1dGVyLmpzJztcbmltcG9ydCB7IEJhc2ljSW5wbGFjZVJlcGxhY2UgfSBmcm9tICcuLi9sYW5ndWFnZXMvc3VwcG9ydHMvaW5wbGFjZVJlcGxhY2VTdXBwb3J0LmpzJztcbmltcG9ydCB7IERpZmZBbGdvcml0aG1OYW1lLCBJRGlmZkNvbXB1dGF0aW9uUmVzdWx0LCBJTGluZUNoYW5nZSwgSVVuaWNvZGVIaWdobGlnaHRzUmVzdWx0IH0gZnJvbSAnLi9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9uYWNvQmFzZUFQSSB9IGZyb20gJy4vZWRpdG9yQmFzZUFwaS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVW5pY29kZVRleHRNb2RlbEhpZ2hsaWdodGVyLCBVbmljb2RlSGlnaGxpZ2h0ZXJPcHRpb25zIH0gZnJvbSAnLi91bmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIuanMnO1xuaW1wb3J0IHsgRGlmZkNvbXB1dGVyLCBJQ2hhbmdlIH0gZnJvbSAnLi4vZGlmZi9sZWdhY3lMaW5lc0RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBJTGluZXNEaWZmQ29tcHV0ZXIsIElMaW5lc0RpZmZDb21wdXRlck9wdGlvbnMgfSBmcm9tICcuLi9kaWZmL2xpbmVzRGlmZkNvbXB1dGVyLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IGxpbmVzRGlmZkNvbXB1dGVycyB9IGZyb20gJy4uL2RpZmYvbGluZXNEaWZmQ29tcHV0ZXJzLmpzJztcbmltcG9ydCB7IElEb2N1bWVudERpZmZQcm92aWRlck9wdGlvbnMgfSBmcm9tICcuLi9kaWZmL2RvY3VtZW50RGlmZlByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2RlZmF1bHREb2N1bWVudENvbG9yc0NvbXB1dGVyLmpzJztcbmltcG9ydCB7IEZpbmRTZWN0aW9uSGVhZGVyT3B0aW9ucywgU2VjdGlvbkhlYWRlciwgZmluZFNlY3Rpb25IZWFkZXJzIH0gZnJvbSAnLi9maW5kU2VjdGlvbkhlYWRlcnMuanMnO1xuaW1wb3J0IHsgSVJhd01vZGVsRGF0YSwgSVdvcmtlclRleHRNb2RlbFN5bmNDaGFubmVsU2VydmVyIH0gZnJvbSAnLi90ZXh0TW9kZWxTeW5jL3RleHRNb2RlbFN5bmMucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUNvbW1vbk1vZGVsLCBXb3JrZXJUZXh0TW9kZWxTeW5jU2VydmVyIH0gZnJvbSAnLi90ZXh0TW9kZWxTeW5jL3RleHRNb2RlbFN5bmMuaW1wbC5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZFN0cmluZ0VkaXQsIFN0cmluZ0VkaXQgfSBmcm9tICcuLi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgU3RyaW5nVGV4dCB9IGZyb20gJy4uL2NvcmUvdGV4dC9hYnN0cmFjdFRleHQuanMnO1xuaW1wb3J0IHsgZW5zdXJlRGVwZW5kZW5jaWVzQXJlU2V0IH0gZnJvbSAnLi4vY29yZS90ZXh0L3Bvc2l0aW9uVG9PZmZzZXQuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElNaXJyb3JNb2RlbCBleHRlbmRzIElNaXJyb3JUZXh0TW9kZWwge1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgdmVyc2lvbjogbnVtYmVyO1xuXHRnZXRWYWx1ZSgpOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtlckNvbnRleHQ8SCA9IHt9PiB7XG5cdC8qKlxuXHQgKiBBIHByb3h5IHRvIHRoZSBtYWluIHRocmVhZCBob3N0IG9iamVjdC5cblx0ICovXG5cdGhvc3Q6IEg7XG5cdC8qKlxuXHQgKiBHZXQgYWxsIGF2YWlsYWJsZSBtaXJyb3IgbW9kZWxzIGluIHRoaXMgd29ya2VyLlxuXHQgKi9cblx0Z2V0TWlycm9yTW9kZWxzKCk6IElNaXJyb3JNb2RlbFtdO1xufVxuXG4vKipcbiAqIFJhbmdlIG9mIGEgd29yZCBpbnNpZGUgYSBtb2RlbC5cbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgaW50ZXJmYWNlIElXb3JkUmFuZ2Uge1xuXHQvKipcblx0ICogVGhlIGluZGV4IHdoZXJlIHRoZSB3b3JkIHN0YXJ0cy5cblx0ICovXG5cdHJlYWRvbmx5IHN0YXJ0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgaW5kZXggd2hlcmUgdGhlIHdvcmQgZW5kcy5cblx0ICovXG5cdHJlYWRvbmx5IGVuZDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgY2xhc3MgRWRpdG9yV29ya2VyIGltcGxlbWVudHMgSURpc3Bvc2FibGUsIElXb3JrZXJUZXh0TW9kZWxTeW5jQ2hhbm5lbFNlcnZlciwgSVdlYldvcmtlclNlcnZlclJlcXVlc3RIYW5kbGVyIHtcblx0X3JlcXVlc3RIYW5kbGVyQnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd29ya2VyVGV4dE1vZGVsU3luY1NlcnZlciA9IG5ldyBXb3JrZXJUZXh0TW9kZWxTeW5jU2VydmVyKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZm9yZWlnbk1vZHVsZTogdW5rbm93biB8IG51bGwgPSBudWxsXG5cdCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkcGluZygpIHtcblx0XHRyZXR1cm4gJ3BvbmcnO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRNb2RlbCh1cmk6IHN0cmluZyk6IElDb21tb25Nb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtlclRleHRNb2RlbFN5bmNTZXJ2ZXIuZ2V0TW9kZWwodXJpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNb2RlbHMoKTogSUNvbW1vbk1vZGVsW10ge1xuXHRcdHJldHVybiB0aGlzLl93b3JrZXJUZXh0TW9kZWxTeW5jU2VydmVyLmdldE1vZGVscygpO1xuXHR9XG5cblx0cHVibGljICRhY2NlcHROZXdNb2RlbChkYXRhOiBJUmF3TW9kZWxEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya2VyVGV4dE1vZGVsU3luY1NlcnZlci4kYWNjZXB0TmV3TW9kZWwoZGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdE1vZGVsQ2hhbmdlZCh1cmk6IHN0cmluZywgZTogSU1vZGVsQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya2VyVGV4dE1vZGVsU3luY1NlcnZlci4kYWNjZXB0TW9kZWxDaGFuZ2VkKHVyaSwgZSk7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdFJlbW92ZWRNb2RlbCh1cmk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dvcmtlclRleHRNb2RlbFN5bmNTZXJ2ZXIuJGFjY2VwdFJlbW92ZWRNb2RlbCh1cmkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRjb21wdXRlVW5pY29kZUhpZ2hsaWdodHModXJsOiBzdHJpbmcsIG9wdGlvbnM6IFVuaWNvZGVIaWdobGlnaHRlck9wdGlvbnMsIHJhbmdlPzogSVJhbmdlKTogUHJvbWlzZTxJVW5pY29kZUhpZ2hsaWdodHNSZXN1bHQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2dldE1vZGVsKHVybCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIHsgcmFuZ2VzOiBbXSwgaGFzTW9yZTogZmFsc2UsIGFtYmlndW91c0NoYXJhY3RlckNvdW50OiAwLCBpbnZpc2libGVDaGFyYWN0ZXJDb3VudDogMCwgbm9uQmFzaWNBc2NpaUNoYXJhY3RlckNvdW50OiAwIH07XG5cdFx0fVxuXHRcdHJldHVybiBVbmljb2RlVGV4dE1vZGVsSGlnaGxpZ2h0ZXIuY29tcHV0ZVVuaWNvZGVIaWdobGlnaHRzKG1vZGVsLCBvcHRpb25zLCByYW5nZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGZpbmRTZWN0aW9uSGVhZGVycyh1cmw6IHN0cmluZywgb3B0aW9uczogRmluZFNlY3Rpb25IZWFkZXJPcHRpb25zKTogUHJvbWlzZTxTZWN0aW9uSGVhZGVyW10+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2dldE1vZGVsKHVybCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gZmluZFNlY3Rpb25IZWFkZXJzKG1vZGVsLCBvcHRpb25zKTtcblx0fVxuXG5cdC8vIC0tLS0gQkVHSU4gZGlmZiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHB1YmxpYyBhc3luYyAkY29tcHV0ZURpZmYob3JpZ2luYWxVcmw6IHN0cmluZywgbW9kaWZpZWRVcmw6IHN0cmluZywgb3B0aW9uczogSURvY3VtZW50RGlmZlByb3ZpZGVyT3B0aW9ucywgYWxnb3JpdGhtOiBEaWZmQWxnb3JpdGhtTmFtZSk6IFByb21pc2U8SURpZmZDb21wdXRhdGlvblJlc3VsdCB8IG51bGw+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IHRoaXMuX2dldE1vZGVsKG9yaWdpbmFsVXJsKTtcblx0XHRjb25zdCBtb2RpZmllZCA9IHRoaXMuX2dldE1vZGVsKG1vZGlmaWVkVXJsKTtcblx0XHRpZiAoIW9yaWdpbmFsIHx8ICFtb2RpZmllZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlmZkFsZ29yaXRobSA9IGF3YWl0IHJlc29sdmVMaW5lc0RpZmZDb21wdXRlcihhbGdvcml0aG0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IEVkaXRvcldvcmtlci5jb21wdXRlRGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIG9wdGlvbnMsIGRpZmZBbGdvcml0aG0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBjb21wdXRlRGlmZihvcmlnaW5hbFRleHRNb2RlbDogSUNvbW1vbk1vZGVsIHwgSVRleHRNb2RlbCwgbW9kaWZpZWRUZXh0TW9kZWw6IElDb21tb25Nb2RlbCB8IElUZXh0TW9kZWwsIG9wdGlvbnM6IElEb2N1bWVudERpZmZQcm92aWRlck9wdGlvbnMsIGRpZmZBbGdvcml0aG06IElMaW5lc0RpZmZDb21wdXRlcik6IElEaWZmQ29tcHV0YXRpb25SZXN1bHQge1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxMaW5lcyA9IG9yaWdpbmFsVGV4dE1vZGVsLmdldExpbmVzQ29udGVudCgpO1xuXHRcdGNvbnN0IG1vZGlmaWVkTGluZXMgPSBtb2RpZmllZFRleHRNb2RlbC5nZXRMaW5lc0NvbnRlbnQoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGRpZmZBbGdvcml0aG0uY29tcHV0ZURpZmYob3JpZ2luYWxMaW5lcywgbW9kaWZpZWRMaW5lcywgb3B0aW9ucyk7XG5cblx0XHRjb25zdCBpZGVudGljYWwgPSAocmVzdWx0LmNoYW5nZXMubGVuZ3RoID4gMCA/IGZhbHNlIDogdGhpcy5fbW9kZWxzQXJlSWRlbnRpY2FsKG9yaWdpbmFsVGV4dE1vZGVsLCBtb2RpZmllZFRleHRNb2RlbCkpO1xuXG5cdFx0ZnVuY3Rpb24gZ2V0TGluZUNoYW5nZXMoY2hhbmdlczogcmVhZG9ubHkgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10pOiBJTGluZUNoYW5nZVtdIHtcblx0XHRcdHJldHVybiBjaGFuZ2VzLm1hcChtID0+IChbbS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIsIG0ub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSwgbS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsIG0ubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSwgbS5pbm5lckNoYW5nZXM/Lm1hcChtID0+IFtcblx0XHRcdFx0bS5vcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0bS5vcmlnaW5hbFJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRtLm9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0bS5vcmlnaW5hbFJhbmdlLmVuZENvbHVtbixcblx0XHRcdFx0bS5tb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0bS5tb2RpZmllZFJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRtLm1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0bS5tb2RpZmllZFJhbmdlLmVuZENvbHVtbixcblx0XHRcdF0pXSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZGVudGljYWwsXG5cdFx0XHRxdWl0RWFybHk6IHJlc3VsdC5oaXRUaW1lb3V0LFxuXHRcdFx0Y2hhbmdlczogZ2V0TGluZUNoYW5nZXMocmVzdWx0LmNoYW5nZXMpLFxuXHRcdFx0bW92ZXM6IHJlc3VsdC5tb3Zlcy5tYXAobSA9PiAoW1xuXHRcdFx0XHRtLmxpbmVSYW5nZU1hcHBpbmcub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRtLmxpbmVSYW5nZU1hcHBpbmcub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSxcblx0XHRcdFx0bS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0bS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsXG5cdFx0XHRcdGdldExpbmVDaGFuZ2VzKG0uY2hhbmdlcylcblx0XHRcdF0pKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vZGVsc0FyZUlkZW50aWNhbChvcmlnaW5hbDogSUNvbW1vbk1vZGVsIHwgSVRleHRNb2RlbCwgbW9kaWZpZWQ6IElDb21tb25Nb2RlbCB8IElUZXh0TW9kZWwpOiBib29sZWFuIHtcblx0XHRjb25zdCBvcmlnaW5hbExpbmVDb3VudCA9IG9yaWdpbmFsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IG1vZGlmaWVkTGluZUNvdW50ID0gbW9kaWZpZWQuZ2V0TGluZUNvdW50KCk7XG5cdFx0aWYgKG9yaWdpbmFsTGluZUNvdW50ICE9PSBtb2RpZmllZExpbmVDb3VudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGxldCBsaW5lID0gMTsgbGluZSA8PSBvcmlnaW5hbExpbmVDb3VudDsgbGluZSsrKSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbExpbmUgPSBvcmlnaW5hbC5nZXRMaW5lQ29udGVudChsaW5lKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZSA9IG1vZGlmaWVkLmdldExpbmVDb250ZW50KGxpbmUpO1xuXHRcdFx0aWYgKG9yaWdpbmFsTGluZSAhPT0gbW9kaWZpZWRMaW5lKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGNvbXB1dGVEaXJ0eURpZmYob3JpZ2luYWxVcmw6IHN0cmluZywgbW9kaWZpZWRVcmw6IHN0cmluZywgaWdub3JlVHJpbVdoaXRlc3BhY2U6IGJvb2xlYW4pOiBQcm9taXNlPElDaGFuZ2VbXSB8IG51bGw+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IHRoaXMuX2dldE1vZGVsKG9yaWdpbmFsVXJsKTtcblx0XHRjb25zdCBtb2RpZmllZCA9IHRoaXMuX2dldE1vZGVsKG1vZGlmaWVkVXJsKTtcblx0XHRpZiAoIW9yaWdpbmFsIHx8ICFtb2RpZmllZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxMaW5lcyA9IG9yaWdpbmFsLmdldExpbmVzQ29udGVudCgpO1xuXHRcdGNvbnN0IG1vZGlmaWVkTGluZXMgPSBtb2RpZmllZC5nZXRMaW5lc0NvbnRlbnQoKTtcblx0XHRjb25zdCBkaWZmQ29tcHV0ZXIgPSBuZXcgRGlmZkNvbXB1dGVyKG9yaWdpbmFsTGluZXMsIG1vZGlmaWVkTGluZXMsIHtcblx0XHRcdHNob3VsZENvbXB1dGVDaGFyQ2hhbmdlczogZmFsc2UsXG5cdFx0XHRzaG91bGRQb3N0UHJvY2Vzc0NoYXJDaGFuZ2VzOiBmYWxzZSxcblx0XHRcdHNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlOiBpZ25vcmVUcmltV2hpdGVzcGFjZSxcblx0XHRcdHNob3VsZE1ha2VQcmV0dHlEaWZmOiB0cnVlLFxuXHRcdFx0bWF4Q29tcHV0YXRpb25UaW1lOiAxMDAwXG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRpZmZDb21wdXRlci5jb21wdXRlRGlmZigpLmNoYW5nZXM7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGNvbXB1dGVTdHJpbmdEaWZmKG9yaWdpbmFsOiBzdHJpbmcsIG1vZGlmaWVkOiBzdHJpbmcsIG9wdGlvbnM6IHsgbWF4Q29tcHV0YXRpb25UaW1lTXM6IG51bWJlciB9LCBhbGdvcml0aG06IERpZmZBbGdvcml0aG1OYW1lKTogUHJvbWlzZTxJU2VyaWFsaXplZFN0cmluZ0VkaXQ+IHtcblx0XHRyZXR1cm4gKGF3YWl0IGNvbXB1dGVTdHJpbmdEaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgb3B0aW9ucywgYWxnb3JpdGhtKSkudG9Kc29uKCk7XG5cdH1cblxuXHQvLyAtLS0tIEVORCBkaWZmIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblxuXHQvLyAtLS0tIEJFR0lOIG1pbmltYWwgZWRpdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2RpZmZMaW1pdCA9IDEwMDAwMDtcblxuXHRwdWJsaWMgYXN5bmMgJGNvbXB1dGVNb3JlTWluaW1hbEVkaXRzKG1vZGVsVXJsOiBzdHJpbmcsIGVkaXRzOiBUZXh0RWRpdFtdLCBwcmV0dHk6IGJvb2xlYW4pOiBQcm9taXNlPFRleHRFZGl0W10+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2dldE1vZGVsKG1vZGVsVXJsKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gZWRpdHM7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBUZXh0RWRpdFtdID0gW107XG5cdFx0bGV0IGxhc3RFb2w6IEVuZE9mTGluZVNlcXVlbmNlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0ZWRpdHMgPSBlZGl0cy5zbGljZSgwKS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5yYW5nZSAmJiBiLnJhbmdlKSB7XG5cdFx0XHRcdHJldHVybiBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYS5yYW5nZSwgYi5yYW5nZSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBlb2wgb25seSBjaGFuZ2VzIHNob3VsZCBnbyB0byB0aGUgZW5kXG5cdFx0XHRjb25zdCBhUm5nID0gYS5yYW5nZSA/IDAgOiAxO1xuXHRcdFx0Y29uc3QgYlJuZyA9IGIucmFuZ2UgPyAwIDogMTtcblx0XHRcdHJldHVybiBhUm5nIC0gYlJuZztcblx0XHR9KTtcblxuXHRcdC8vIG1lcmdlIGFkamFjZW50IGVkaXRzXG5cdFx0bGV0IHdyaXRlSW5kZXggPSAwO1xuXHRcdGZvciAobGV0IHJlYWRJbmRleCA9IDE7IHJlYWRJbmRleCA8IGVkaXRzLmxlbmd0aDsgcmVhZEluZGV4KyspIHtcblx0XHRcdGlmIChSYW5nZS5nZXRFbmRQb3NpdGlvbihlZGl0c1t3cml0ZUluZGV4XS5yYW5nZSkuZXF1YWxzKFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oZWRpdHNbcmVhZEluZGV4XS5yYW5nZSkpKSB7XG5cdFx0XHRcdGVkaXRzW3dyaXRlSW5kZXhdLnJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhSYW5nZS5nZXRTdGFydFBvc2l0aW9uKGVkaXRzW3dyaXRlSW5kZXhdLnJhbmdlKSwgUmFuZ2UuZ2V0RW5kUG9zaXRpb24oZWRpdHNbcmVhZEluZGV4XS5yYW5nZSkpO1xuXHRcdFx0XHRlZGl0c1t3cml0ZUluZGV4XS50ZXh0ICs9IGVkaXRzW3JlYWRJbmRleF0udGV4dDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdyaXRlSW5kZXgrKztcblx0XHRcdFx0ZWRpdHNbd3JpdGVJbmRleF0gPSBlZGl0c1tyZWFkSW5kZXhdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlZGl0cy5sZW5ndGggPSB3cml0ZUluZGV4ICsgMTtcblxuXHRcdGZvciAobGV0IHsgcmFuZ2UsIHRleHQsIGVvbCB9IG9mIGVkaXRzKSB7XG5cblx0XHRcdGlmICh0eXBlb2YgZW9sID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRsYXN0RW9sID0gZW9sO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoUmFuZ2UuaXNFbXB0eShyYW5nZSkgJiYgIXRleHQpIHtcblx0XHRcdFx0Ly8gZW1wdHkgY2hhbmdlXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShyYW5nZSk7XG5cdFx0XHR0ZXh0ID0gdGV4dC5yZXBsYWNlKC9cXHJcXG58XFxufFxcci9nLCBtb2RlbC5lb2wpO1xuXG5cdFx0XHRpZiAob3JpZ2luYWwgPT09IHRleHQpIHtcblx0XHRcdFx0Ly8gbm9vcFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gbWFrZSBzdXJlIGRpZmYgd29uJ3QgdGFrZSB0b28gbG9uZ1xuXHRcdFx0aWYgKE1hdGgubWF4KHRleHQubGVuZ3RoLCBvcmlnaW5hbC5sZW5ndGgpID4gRWRpdG9yV29ya2VyLl9kaWZmTGltaXQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyByYW5nZSwgdGV4dCB9KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNvbXB1dGUgZGlmZiBiZXR3ZWVuIG9yaWdpbmFsIGFuZCBlZGl0LnRleHRcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBzdHJpbmdEaWZmKG9yaWdpbmFsLCB0ZXh0LCBwcmV0dHkpO1xuXHRcdFx0Y29uc3QgZWRpdE9mZnNldCA9IG1vZGVsLm9mZnNldEF0KFJhbmdlLmxpZnQocmFuZ2UpLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cblx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnQgPSBtb2RlbC5wb3NpdGlvbkF0KGVkaXRPZmZzZXQgKyBjaGFuZ2Uub3JpZ2luYWxTdGFydCk7XG5cdFx0XHRcdGNvbnN0IGVuZCA9IG1vZGVsLnBvc2l0aW9uQXQoZWRpdE9mZnNldCArIGNoYW5nZS5vcmlnaW5hbFN0YXJ0ICsgY2hhbmdlLm9yaWdpbmFsTGVuZ3RoKTtcblx0XHRcdFx0Y29uc3QgbmV3RWRpdDogVGV4dEVkaXQgPSB7XG5cdFx0XHRcdFx0dGV4dDogdGV4dC5zdWJzdHIoY2hhbmdlLm1vZGlmaWVkU3RhcnQsIGNoYW5nZS5tb2RpZmllZExlbmd0aCksXG5cdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiBzdGFydC5saW5lTnVtYmVyLCBzdGFydENvbHVtbjogc3RhcnQuY29sdW1uLCBlbmRMaW5lTnVtYmVyOiBlbmQubGluZU51bWJlciwgZW5kQ29sdW1uOiBlbmQuY29sdW1uIH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRpZiAobW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ld0VkaXQucmFuZ2UpICE9PSBuZXdFZGl0LnRleHQpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChuZXdFZGl0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbGFzdEVvbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgZW9sOiBsYXN0RW9sLCB0ZXh0OiAnJywgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAwLCBzdGFydENvbHVtbjogMCwgZW5kTGluZU51bWJlcjogMCwgZW5kQ29sdW1uOiAwIH0gfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyAkY29tcHV0ZUh1bWFuUmVhZGFibGVEaWZmKG1vZGVsVXJsOiBzdHJpbmcsIGVkaXRzOiBUZXh0RWRpdFtdLCBvcHRpb25zOiBJTGluZXNEaWZmQ29tcHV0ZXJPcHRpb25zKTogVGV4dEVkaXRbXSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRNb2RlbChtb2RlbFVybCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIGVkaXRzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogVGV4dEVkaXRbXSA9IFtdO1xuXHRcdGxldCBsYXN0RW9sOiBFbmRPZkxpbmVTZXF1ZW5jZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGVkaXRzID0gZWRpdHMuc2xpY2UoMCkuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGEucmFuZ2UgJiYgYi5yYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gZW9sIG9ubHkgY2hhbmdlcyBzaG91bGQgZ28gdG8gdGhlIGVuZFxuXHRcdFx0Y29uc3QgYVJuZyA9IGEucmFuZ2UgPyAwIDogMTtcblx0XHRcdGNvbnN0IGJSbmcgPSBiLnJhbmdlID8gMCA6IDE7XG5cdFx0XHRyZXR1cm4gYVJuZyAtIGJSbmc7XG5cdFx0fSk7XG5cblx0XHRmb3IgKGxldCB7IHJhbmdlLCB0ZXh0LCBlb2wgfSBvZiBlZGl0cykge1xuXG5cdFx0XHRpZiAodHlwZW9mIGVvbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0bGFzdEVvbCA9IGVvbDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKFJhbmdlLmlzRW1wdHkocmFuZ2UpICYmICF0ZXh0KSB7XG5cdFx0XHRcdC8vIGVtcHR5IGNoYW5nZVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpO1xuXHRcdFx0dGV4dCA9IHRleHQucmVwbGFjZSgvXFxyXFxufFxcbnxcXHIvZywgbW9kZWwuZW9sKTtcblxuXHRcdFx0aWYgKG9yaWdpbmFsID09PSB0ZXh0KSB7XG5cdFx0XHRcdC8vIG5vb3Bcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG1ha2Ugc3VyZSBkaWZmIHdvbid0IHRha2UgdG9vIGxvbmdcblx0XHRcdGlmIChNYXRoLm1heCh0ZXh0Lmxlbmd0aCwgb3JpZ2luYWwubGVuZ3RoKSA+IEVkaXRvcldvcmtlci5fZGlmZkxpbWl0KSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgcmFuZ2UsIHRleHQgfSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBjb21wdXRlIGRpZmYgYmV0d2VlbiBvcmlnaW5hbCBhbmQgZWRpdC50ZXh0XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsTGluZXMgPSBvcmlnaW5hbC5zcGxpdCgvXFxyXFxufFxcbnxcXHIvKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZXMgPSB0ZXh0LnNwbGl0KC9cXHJcXG58XFxufFxcci8pO1xuXG5cdFx0XHRjb25zdCBkaWZmID0gbGluZXNEaWZmQ29tcHV0ZXJzLmdldERlZmF1bHQoKS5jb21wdXRlRGlmZihvcmlnaW5hbExpbmVzLCBtb2RpZmllZExpbmVzLCBvcHRpb25zKTtcblxuXHRcdFx0Y29uc3Qgc3RhcnQgPSBSYW5nZS5saWZ0KHJhbmdlKS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cblx0XHRcdGZ1bmN0aW9uIGFkZFBvc2l0aW9ucyhwb3MxOiBQb3NpdGlvbiwgcG9zMjogUG9zaXRpb24pOiBQb3NpdGlvbiB7XG5cdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24ocG9zMS5saW5lTnVtYmVyICsgcG9zMi5saW5lTnVtYmVyIC0gMSwgcG9zMi5saW5lTnVtYmVyID09PSAxID8gcG9zMS5jb2x1bW4gKyBwb3MyLmNvbHVtbiAtIDEgOiBwb3MyLmNvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIGdldFRleHQobGluZXM6IHN0cmluZ1tdLCByYW5nZTogUmFuZ2UpOiBzdHJpbmdbXSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjsgaSA8PSByYW5nZS5lbmRMaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lID0gbGluZXNbaSAtIDFdO1xuXHRcdFx0XHRcdGlmIChpID09PSByYW5nZS5zdGFydExpbmVOdW1iZXIgJiYgaSA9PT0gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2gobGluZS5zdWJzdHJpbmcocmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCByYW5nZS5lbmRDb2x1bW4gLSAxKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpID09PSByYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGxpbmUuc3Vic3RyaW5nKHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaSA9PT0gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2gobGluZS5zdWJzdHJpbmcoMCwgcmFuZ2UuZW5kQ29sdW1uIC0gMSkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChsaW5lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBjIG9mIGRpZmYuY2hhbmdlcykge1xuXHRcdFx0XHRpZiAoYy5pbm5lckNoYW5nZXMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHggb2YgYy5pbm5lckNoYW5nZXMpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMoXG5cdFx0XHRcdFx0XHRcdFx0YWRkUG9zaXRpb25zKHN0YXJ0LCB4Lm9yaWdpbmFsUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSxcblx0XHRcdFx0XHRcdFx0XHRhZGRQb3NpdGlvbnMoc3RhcnQsIHgub3JpZ2luYWxSYW5nZS5nZXRFbmRQb3NpdGlvbigpKVxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiBnZXRUZXh0KG1vZGlmaWVkTGluZXMsIHgubW9kaWZpZWRSYW5nZSkuam9pbihtb2RlbC5lb2wpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVGhlIGV4cGVyaW1lbnRhbCBkaWZmIGFsZ29yaXRobSBhbHdheXMgcHJvZHVjZXMgaW5uZXIgY2hhbmdlcycpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBsYXN0RW9sID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmVzdWx0LnB1c2goeyBlb2w6IGxhc3RFb2wsIHRleHQ6ICcnLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDAsIHN0YXJ0Q29sdW1uOiAwLCBlbmRMaW5lTnVtYmVyOiAwLCBlbmRDb2x1bW46IDAgfSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8gLS0tLSBFTkQgbWluaW1hbCBlZGl0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwdWJsaWMgYXN5bmMgJGNvbXB1dGVMaW5rcyhtb2RlbFVybDogc3RyaW5nKTogUHJvbWlzZTxJTGlua1tdIHwgbnVsbD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZ2V0TW9kZWwobW9kZWxVcmwpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb21wdXRlTGlua3MobW9kZWwpO1xuXHR9XG5cblx0Ly8gLS0tIEJFR0lOIGRlZmF1bHQgZG9jdW1lbnQgY29sb3JzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHVibGljIGFzeW5jICRjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsVXJsOiBzdHJpbmcpOiBQcm9taXNlPElDb2xvckluZm9ybWF0aW9uW10gfCBudWxsPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9nZXRNb2RlbChtb2RlbFVybCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBjb21wdXRlRGVmYXVsdERvY3VtZW50Q29sb3JzKG1vZGVsKTtcblx0fVxuXG5cdC8vIC0tLS0gQkVHSU4gc3VnZ2VzdCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9zdWdnZXN0aW9uc0xpbWl0ID0gMTAwMDA7XG5cblx0cHVibGljIGFzeW5jICR0ZXh0dWFsU3VnZ2VzdChtb2RlbFVybHM6IHN0cmluZ1tdLCBsZWFkaW5nV29yZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB3b3JkRGVmOiBzdHJpbmcsIHdvcmREZWZGbGFnczogc3RyaW5nKTogUHJvbWlzZTx7IHdvcmRzOiBzdHJpbmdbXTsgZHVyYXRpb246IG51bWJlciB9IHwgbnVsbD4ge1xuXG5cdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0Y29uc3Qgd29yZERlZlJlZ0V4cCA9IG5ldyBSZWdFeHAod29yZERlZiwgd29yZERlZkZsYWdzKTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRvdXRlcjogZm9yIChjb25zdCB1cmwgb2YgbW9kZWxVcmxzKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2dldE1vZGVsKHVybCk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHdvcmQgb2YgbW9kZWwud29yZHMod29yZERlZlJlZ0V4cCkpIHtcblx0XHRcdFx0aWYgKHdvcmQgPT09IGxlYWRpbmdXb3JkIHx8ICFpc05hTihOdW1iZXIod29yZCkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2Vlbi5hZGQod29yZCk7XG5cdFx0XHRcdGlmIChzZWVuLnNpemUgPiBFZGl0b3JXb3JrZXIuX3N1Z2dlc3Rpb25zTGltaXQpIHtcblx0XHRcdFx0XHRicmVhayBvdXRlcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHdvcmRzOiBBcnJheS5mcm9tKHNlZW4pLCBkdXJhdGlvbjogc3cuZWxhcHNlZCgpIH07XG5cdH1cblxuXG5cdC8vIC0tLS0gRU5EIHN1Z2dlc3QgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvLyNyZWdpb24gLS0gd29yZCByYW5nZXMgLS1cblxuXHRwdWJsaWMgYXN5bmMgJGNvbXB1dGVXb3JkUmFuZ2VzKG1vZGVsVXJsOiBzdHJpbmcsIHJhbmdlOiBJUmFuZ2UsIHdvcmREZWY6IHN0cmluZywgd29yZERlZkZsYWdzOiBzdHJpbmcpOiBQcm9taXNlPHsgW3dvcmQ6IHN0cmluZ106IElSYW5nZVtdIH0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2dldE1vZGVsKG1vZGVsVXJsKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR9XG5cdFx0Y29uc3Qgd29yZERlZlJlZ0V4cCA9IG5ldyBSZWdFeHAod29yZERlZiwgd29yZERlZkZsYWdzKTtcblx0XHRjb25zdCByZXN1bHQ6IHsgW3dvcmQ6IHN0cmluZ106IElSYW5nZVtdIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGZvciAobGV0IGxpbmUgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7IGxpbmUgPCByYW5nZS5lbmRMaW5lTnVtYmVyOyBsaW5lKyspIHtcblx0XHRcdGNvbnN0IHdvcmRzID0gbW9kZWwuZ2V0TGluZVdvcmRzKGxpbmUsIHdvcmREZWZSZWdFeHApO1xuXHRcdFx0Zm9yIChjb25zdCB3b3JkIG9mIHdvcmRzKSB7XG5cdFx0XHRcdGlmICghaXNOYU4oTnVtYmVyKHdvcmQud29yZCkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IGFycmF5ID0gcmVzdWx0W3dvcmQud29yZF07XG5cdFx0XHRcdGlmICghYXJyYXkpIHtcblx0XHRcdFx0XHRhcnJheSA9IFtdO1xuXHRcdFx0XHRcdHJlc3VsdFt3b3JkLndvcmRdID0gYXJyYXk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXJyYXkucHVzaCh7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsaW5lLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiB3b3JkLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGxpbmUsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiB3b3JkLmVuZENvbHVtblxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHB1YmxpYyBhc3luYyAkbmF2aWdhdGVWYWx1ZVNldChtb2RlbFVybDogc3RyaW5nLCByYW5nZTogSVJhbmdlLCB1cDogYm9vbGVhbiwgd29yZERlZjogc3RyaW5nLCB3b3JkRGVmRmxhZ3M6IHN0cmluZyk6IFByb21pc2U8SUlucGxhY2VSZXBsYWNlU3VwcG9ydFJlc3VsdCB8IG51bGw+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2dldE1vZGVsKG1vZGVsVXJsKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCB3b3JkRGVmUmVnRXhwID0gbmV3IFJlZ0V4cCh3b3JkRGVmLCB3b3JkRGVmRmxhZ3MpO1xuXG5cdFx0aWYgKHJhbmdlLnN0YXJ0Q29sdW1uID09PSByYW5nZS5lbmRDb2x1bW4pIHtcblx0XHRcdHJhbmdlID0ge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0c3RhcnRDb2x1bW46IHJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiByYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRlbmRDb2x1bW46IHJhbmdlLmVuZENvbHVtbiArIDFcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uVGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShyYW5nZSk7XG5cblx0XHRjb25zdCB3b3JkUmFuZ2UgPSBtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0TGluZU51bWJlciwgY29sdW1uOiByYW5nZS5zdGFydENvbHVtbiB9LCB3b3JkRGVmUmVnRXhwKTtcblx0XHRpZiAoIXdvcmRSYW5nZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2Uod29yZFJhbmdlKTtcblx0XHRjb25zdCByZXN1bHQgPSBCYXNpY0lucGxhY2VSZXBsYWNlLklOU1RBTkNFLm5hdmlnYXRlVmFsdWVTZXQocmFuZ2UsIHNlbGVjdGlvblRleHQsIHdvcmRSYW5nZSwgd29yZCwgdXApO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyAtLS0tIEJFR0lOIGZvcmVpZ24gbW9kdWxlIHN1cHBvcnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvLyBmb3JlaWduIG1ldGhvZCByZXF1ZXN0XG5cdHB1YmxpYyAkZm1yKG1ldGhvZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRpZiAoIXRoaXMuX2ZvcmVpZ25Nb2R1bGUgfHwgdHlwZW9mICh0aGlzLl9mb3JlaWduTW9kdWxlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVttZXRob2RdICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdNaXNzaW5nIHJlcXVlc3RIYW5kbGVyIG9yIG1ldGhvZDogJyArIG1ldGhvZCkpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCh0aGlzLl9mb3JlaWduTW9kdWxlIGFzIFJlY29yZDxzdHJpbmcsIEZ1bmN0aW9uPilbbWV0aG9kXS5hcHBseSh0aGlzLl9mb3JlaWduTW9kdWxlLCBhcmdzKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gRU5EIGZvcmVpZ24gbW9kdWxlIHN1cHBvcnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbn1cblxuLy8gVGhpcyBpcyBvbmx5IGF2YWlsYWJsZSBpbiBhIFdlYiBXb3JrZXJcbmRlY2xhcmUgZnVuY3Rpb24gaW1wb3J0U2NyaXB0cyguLi51cmxzOiBzdHJpbmdbXSk6IHZvaWQ7XG5cbmlmICh0eXBlb2YgaW1wb3J0U2NyaXB0cyA9PT0gJ2Z1bmN0aW9uJykge1xuXHQvLyBSdW5uaW5nIGluIGEgd2ViIHdvcmtlclxuXHRnbG9iYWxUaGlzLm1vbmFjbyA9IGNyZWF0ZU1vbmFjb0Jhc2VBUEkoKTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUxpbmVzRGlmZkNvbXB1dGVyKGFsZ29yaXRobTogRGlmZkFsZ29yaXRobU5hbWUpOiBJTGluZXNEaWZmQ29tcHV0ZXIgfCBQcm9taXNlPElMaW5lc0RpZmZDb21wdXRlcj4ge1xuXHRzd2l0Y2ggKGFsZ29yaXRobSkge1xuXHRcdGNhc2UgJ2xlZ2FjeSc6IHJldHVybiBsaW5lc0RpZmZDb21wdXRlcnMuZ2V0TGVnYWN5KCk7XG5cdFx0Y2FzZSAnYWR2YW5jZWQnOiByZXR1cm4gbGluZXNEaWZmQ29tcHV0ZXJzLmdldERlZmF1bHQoKTtcblx0XHRjYXNlICdhZHZhbmNlZC1leHRlcm5hbCc6IHJldHVybiBsaW5lc0RpZmZDb21wdXRlcnMuZ2V0QWR2YW5jZWRFeHRlcm5hbCgpO1xuXHRcdGNhc2UgJ2FkdmFuY2VkLXdhc20nOiByZXR1cm4gbGluZXNEaWZmQ29tcHV0ZXJzLmdldEFkdmFuY2VkV2FzbSgpO1xuXHR9XG59XG5cbi8qKlxuICogQGludGVybmFsXG4qL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbXB1dGVTdHJpbmdEaWZmKG9yaWdpbmFsOiBzdHJpbmcsIG1vZGlmaWVkOiBzdHJpbmcsIG9wdGlvbnM6IHsgbWF4Q29tcHV0YXRpb25UaW1lTXM6IG51bWJlciB9LCBhbGdvcml0aG06IERpZmZBbGdvcml0aG1OYW1lKTogUHJvbWlzZTxTdHJpbmdFZGl0PiB7XG5cdGNvbnN0IGRpZmZBbGdvcml0aG0gPSBhd2FpdCByZXNvbHZlTGluZXNEaWZmQ29tcHV0ZXIoYWxnb3JpdGhtKTtcblxuXHRlbnN1cmVEZXBlbmRlbmNpZXNBcmVTZXQoKTtcblxuXHRjb25zdCBvcmlnaW5hbFRleHQgPSBuZXcgU3RyaW5nVGV4dChvcmlnaW5hbCk7XG5cdGNvbnN0IG9yaWdpbmFsTGluZXMgPSBvcmlnaW5hbFRleHQuZ2V0TGluZXMoKTtcblx0Y29uc3QgbW9kaWZpZWRUZXh0ID0gbmV3IFN0cmluZ1RleHQobW9kaWZpZWQpO1xuXHRjb25zdCBtb2RpZmllZExpbmVzID0gbW9kaWZpZWRUZXh0LmdldExpbmVzKCk7XG5cblx0Y29uc3QgcmVzdWx0ID0gZGlmZkFsZ29yaXRobS5jb21wdXRlRGlmZihvcmlnaW5hbExpbmVzLCBtb2RpZmllZExpbmVzLCB7IGlnbm9yZVRyaW1XaGl0ZXNwYWNlOiBmYWxzZSwgbWF4Q29tcHV0YXRpb25UaW1lTXM6IG9wdGlvbnMubWF4Q29tcHV0YXRpb25UaW1lTXMsIGNvbXB1dGVNb3ZlczogZmFsc2UsIGV4dGVuZFRvU3Vid29yZHM6IGZhbHNlIH0pO1xuXG5cdGNvbnN0IHRleHRFZGl0ID0gRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLnRvVGV4dEVkaXQocmVzdWx0LmNoYW5nZXMsIG1vZGlmaWVkVGV4dCk7XG5cdGNvbnN0IHN0ckVkaXQgPSBvcmlnaW5hbFRleHQuZ2V0VHJhbnNmb3JtZXIoKS5nZXRTdHJpbmdFZGl0KHRleHRFZGl0KTtcblxuXHRyZXR1cm4gc3RyRWRpdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBSTNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWlCLGFBQWE7QUFJOUIs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
