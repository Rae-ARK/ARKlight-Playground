import { CharCode } from "../../../../base/common/charCode.js";
import * as strings from "../../../../base/common/strings.js";
import { Constants } from "../../../../base/common/uint.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { BlockCommentCommand } from "./blockCommentCommand.js";
var Type = /* @__PURE__ */ ((Type2) => {
  Type2[Type2["Toggle"] = 0] = "Toggle";
  Type2[Type2["ForceAdd"] = 1] = "ForceAdd";
  Type2[Type2["ForceRemove"] = 2] = "ForceRemove";
  return Type2;
})(Type || {});
class LineCommentCommand {
  constructor(languageConfigurationService, selection, indentSize, type, insertSpace, ignoreEmptyLines, ignoreFirstLine) {
    this.languageConfigurationService = languageConfigurationService;
    this._selection = selection;
    this._indentSize = indentSize;
    this._type = type;
    this._insertSpace = insertSpace;
    this._selectionId = null;
    this._deltaColumn = 0;
    this._moveEndPositionDown = false;
    this._ignoreEmptyLines = ignoreEmptyLines;
    this._ignoreFirstLine = ignoreFirstLine || false;
  }
  /**
   * Do an initial pass over the lines and gather info about the line comment string.
   * Returns null if any of the lines doesn't support a line comment string.
   */
  static _gatherPreflightCommentStrings(model, startLineNumber, endLineNumber, languageConfigurationService) {
    model.tokenization.tokenizeIfCheap(startLineNumber);
    const languageId = model.getLanguageIdAtPosition(startLineNumber, 1);
    const config = languageConfigurationService.getLanguageConfiguration(languageId).comments;
    const commentStr = config ? config.lineCommentToken : null;
    if (!commentStr) {
      return null;
    }
    const lines = [];
    for (let i = 0, lineCount = endLineNumber - startLineNumber + 1; i < lineCount; i++) {
      lines[i] = {
        ignore: false,
        commentStr,
        commentStrOffset: 0,
        commentStrLength: commentStr.length
      };
    }
    return lines;
  }
  /**
   * Analyze lines and decide which lines are relevant and what the toggle should do.
   * Also, build up several offsets and lengths useful in the generation of editor operations.
   */
  static _analyzeLines(type, insertSpace, model, lines, startLineNumber, ignoreEmptyLines, ignoreFirstLine, languageConfigurationService, languageId) {
    let onlyWhitespaceLines = true;
    const config = languageConfigurationService.getLanguageConfiguration(languageId).comments;
    const lineCommentNoIndent = config?.lineCommentNoIndent ?? false;
    let shouldRemoveComments;
    if (type === 0 /* Toggle */) {
      shouldRemoveComments = true;
    } else if (type === 1 /* ForceAdd */) {
      shouldRemoveComments = false;
    } else {
      shouldRemoveComments = true;
    }
    for (let i = 0, lineCount = lines.length; i < lineCount; i++) {
      const lineData = lines[i];
      const lineNumber = startLineNumber + i;
      if (lineNumber === startLineNumber && ignoreFirstLine) {
        lineData.ignore = true;
        continue;
      }
      const lineContent = model.getLineContent(lineNumber);
      const lineContentStartOffset = strings.firstNonWhitespaceIndex(lineContent);
      if (lineContentStartOffset === -1) {
        lineData.ignore = ignoreEmptyLines;
        lineData.commentStrOffset = lineCommentNoIndent ? 0 : lineContent.length;
        continue;
      }
      onlyWhitespaceLines = false;
      const offset = lineCommentNoIndent ? 0 : lineContentStartOffset;
      lineData.ignore = false;
      lineData.commentStrOffset = offset;
      if (shouldRemoveComments && !BlockCommentCommand._haystackHasNeedleAtOffset(lineContent, lineData.commentStr, offset)) {
        if (type === 0 /* Toggle */) {
          shouldRemoveComments = false;
        } else if (type === 1 /* ForceAdd */) {
        } else {
          lineData.ignore = true;
        }
      }
      if (shouldRemoveComments && insertSpace) {
        const commentStrEndOffset = lineContentStartOffset + lineData.commentStrLength;
        if (commentStrEndOffset < lineContent.length && lineContent.charCodeAt(commentStrEndOffset) === CharCode.Space) {
          lineData.commentStrLength += 1;
        }
      }
    }
    if (type === 0 /* Toggle */ && onlyWhitespaceLines) {
      shouldRemoveComments = false;
      for (let i = 0, lineCount = lines.length; i < lineCount; i++) {
        lines[i].ignore = false;
      }
    }
    return {
      supported: true,
      shouldRemoveComments,
      lines
    };
  }
  /**
   * Analyze all lines and decide exactly what to do => not supported | insert line comments | remove line comments
   */
  static _gatherPreflightData(type, insertSpace, model, startLineNumber, endLineNumber, ignoreEmptyLines, ignoreFirstLine, languageConfigurationService) {
    const lines = LineCommentCommand._gatherPreflightCommentStrings(model, startLineNumber, endLineNumber, languageConfigurationService);
    const languageId = model.getLanguageIdAtPosition(startLineNumber, 1);
    if (lines === null) {
      return {
        supported: false
      };
    }
    return LineCommentCommand._analyzeLines(type, insertSpace, model, lines, startLineNumber, ignoreEmptyLines, ignoreFirstLine, languageConfigurationService, languageId);
  }
  /**
   * Given a successful analysis, execute either insert line comments, either remove line comments
   */
  _executeLineComments(model, builder, data, s) {
    let ops;
    if (data.shouldRemoveComments) {
      ops = LineCommentCommand._createRemoveLineCommentsOperations(data.lines, s.startLineNumber);
    } else {
      LineCommentCommand._normalizeInsertionPoint(model, data.lines, s.startLineNumber, this._indentSize);
      ops = this._createAddLineCommentsOperations(data.lines, s.startLineNumber);
    }
    const cursorPosition = new Position(s.positionLineNumber, s.positionColumn);
    for (let i = 0, len = ops.length; i < len; i++) {
      builder.addEditOperation(ops[i].range, ops[i].text);
      if (Range.isEmpty(ops[i].range) && Range.getStartPosition(ops[i].range).equals(cursorPosition)) {
        const lineContent = model.getLineContent(cursorPosition.lineNumber);
        if (lineContent.length + 1 === cursorPosition.column) {
          this._deltaColumn = (ops[i].text || "").length;
        }
      }
    }
    this._selectionId = builder.trackSelection(s);
  }
  _attemptRemoveBlockComment(model, s, startToken, endToken) {
    let startLineNumber = s.startLineNumber;
    let endLineNumber = s.endLineNumber;
    const startTokenAllowedBeforeColumn = endToken.length + Math.max(
      model.getLineFirstNonWhitespaceColumn(s.startLineNumber),
      s.startColumn
    );
    let startTokenIndex = model.getLineContent(startLineNumber).lastIndexOf(startToken, startTokenAllowedBeforeColumn - 1);
    let endTokenIndex = model.getLineContent(endLineNumber).indexOf(endToken, s.endColumn - 1 - startToken.length);
    if (startTokenIndex !== -1 && endTokenIndex === -1) {
      endTokenIndex = model.getLineContent(startLineNumber).indexOf(endToken, startTokenIndex + startToken.length);
      endLineNumber = startLineNumber;
    }
    if (startTokenIndex === -1 && endTokenIndex !== -1) {
      startTokenIndex = model.getLineContent(endLineNumber).lastIndexOf(startToken, endTokenIndex);
      startLineNumber = endLineNumber;
    }
    if (s.isEmpty() && (startTokenIndex === -1 || endTokenIndex === -1)) {
      startTokenIndex = model.getLineContent(startLineNumber).indexOf(startToken);
      if (startTokenIndex !== -1) {
        endTokenIndex = model.getLineContent(startLineNumber).indexOf(endToken, startTokenIndex + startToken.length);
      }
    }
    if (startTokenIndex !== -1 && model.getLineContent(startLineNumber).charCodeAt(startTokenIndex + startToken.length) === CharCode.Space) {
      startToken += " ";
    }
    if (endTokenIndex !== -1 && model.getLineContent(endLineNumber).charCodeAt(endTokenIndex - 1) === CharCode.Space) {
      endToken = " " + endToken;
      endTokenIndex -= 1;
    }
    if (startTokenIndex !== -1 && endTokenIndex !== -1) {
      return BlockCommentCommand._createRemoveBlockCommentOperations(
        new Range(startLineNumber, startTokenIndex + startToken.length + 1, endLineNumber, endTokenIndex + 1),
        startToken,
        endToken
      );
    }
    return null;
  }
  /**
   * Given an unsuccessful analysis, delegate to the block comment command
   */
  _executeBlockComment(model, builder, s) {
    model.tokenization.tokenizeIfCheap(s.startLineNumber);
    const languageId = model.getLanguageIdAtPosition(s.startLineNumber, 1);
    const config = this.languageConfigurationService.getLanguageConfiguration(languageId).comments;
    if (!config || !config.blockCommentStartToken || !config.blockCommentEndToken) {
      return;
    }
    const startToken = config.blockCommentStartToken;
    const endToken = config.blockCommentEndToken;
    let ops = this._attemptRemoveBlockComment(model, s, startToken, endToken);
    if (!ops) {
      if (s.isEmpty()) {
        const lineContent = model.getLineContent(s.startLineNumber);
        let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
        if (firstNonWhitespaceIndex === -1) {
          firstNonWhitespaceIndex = lineContent.length;
        }
        ops = BlockCommentCommand._createAddBlockCommentOperations(
          new Range(s.startLineNumber, firstNonWhitespaceIndex + 1, s.startLineNumber, lineContent.length + 1),
          startToken,
          endToken,
          this._insertSpace
        );
      } else {
        ops = BlockCommentCommand._createAddBlockCommentOperations(
          new Range(s.startLineNumber, model.getLineFirstNonWhitespaceColumn(s.startLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)),
          startToken,
          endToken,
          this._insertSpace
        );
      }
      if (ops.length === 1) {
        this._deltaColumn = startToken.length + 1;
      }
    }
    this._selectionId = builder.trackSelection(s);
    for (const op of ops) {
      builder.addEditOperation(op.range, op.text);
    }
  }
  getEditOperations(model, builder) {
    let s = this._selection;
    this._moveEndPositionDown = false;
    if (s.startLineNumber === s.endLineNumber && this._ignoreFirstLine) {
      builder.addEditOperation(new Range(s.startLineNumber, model.getLineMaxColumn(s.startLineNumber), s.startLineNumber + 1, 1), s.startLineNumber === model.getLineCount() ? "" : "\n");
      this._selectionId = builder.trackSelection(s);
      return;
    }
    if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
      this._moveEndPositionDown = true;
      s = s.setEndPosition(s.endLineNumber - 1, model.getLineMaxColumn(s.endLineNumber - 1));
    }
    const data = LineCommentCommand._gatherPreflightData(
      this._type,
      this._insertSpace,
      model,
      s.startLineNumber,
      s.endLineNumber,
      this._ignoreEmptyLines,
      this._ignoreFirstLine,
      this.languageConfigurationService
    );
    if (data.supported) {
      return this._executeLineComments(model, builder, data, s);
    }
    return this._executeBlockComment(model, builder, s);
  }
  computeCursorState(model, helper) {
    let result = helper.getTrackedSelection(this._selectionId);
    if (this._moveEndPositionDown) {
      result = result.setEndPosition(result.endLineNumber + 1, 1);
    }
    return new Selection(
      result.selectionStartLineNumber,
      result.selectionStartColumn + this._deltaColumn,
      result.positionLineNumber,
      result.positionColumn + this._deltaColumn
    );
  }
  /**
   * Generate edit operations in the remove line comment case
   */
  static _createRemoveLineCommentsOperations(lines, startLineNumber) {
    const res = [];
    for (let i = 0, len = lines.length; i < len; i++) {
      const lineData = lines[i];
      if (lineData.ignore) {
        continue;
      }
      res.push(EditOperation.delete(new Range(
        startLineNumber + i,
        lineData.commentStrOffset + 1,
        startLineNumber + i,
        lineData.commentStrOffset + lineData.commentStrLength + 1
      )));
    }
    return res;
  }
  /**
   * Generate edit operations in the add line comment case
   */
  _createAddLineCommentsOperations(lines, startLineNumber) {
    const res = [];
    const afterCommentStr = this._insertSpace ? " " : "";
    for (let i = 0, len = lines.length; i < len; i++) {
      const lineData = lines[i];
      if (lineData.ignore) {
        continue;
      }
      res.push(EditOperation.insert(new Position(startLineNumber + i, lineData.commentStrOffset + 1), lineData.commentStr + afterCommentStr));
    }
    return res;
  }
  static nextVisibleColumn(currentVisibleColumn, indentSize, isTab, columnSize) {
    if (isTab) {
      return currentVisibleColumn + (indentSize - currentVisibleColumn % indentSize);
    }
    return currentVisibleColumn + columnSize;
  }
  /**
   * Adjust insertion points to have them vertically aligned in the add line comment case
   */
  static _normalizeInsertionPoint(model, lines, startLineNumber, indentSize) {
    let minVisibleColumn = Constants.MAX_SAFE_SMALL_INTEGER;
    let j;
    let lenJ;
    for (let i = 0, len = lines.length; i < len; i++) {
      if (lines[i].ignore) {
        continue;
      }
      const lineContent = model.getLineContent(startLineNumber + i);
      let currentVisibleColumn = 0;
      for (let j2 = 0, lenJ2 = lines[i].commentStrOffset; currentVisibleColumn < minVisibleColumn && j2 < lenJ2; j2++) {
        currentVisibleColumn = LineCommentCommand.nextVisibleColumn(currentVisibleColumn, indentSize, lineContent.charCodeAt(j2) === CharCode.Tab, 1);
      }
      if (currentVisibleColumn < minVisibleColumn) {
        minVisibleColumn = currentVisibleColumn;
      }
    }
    minVisibleColumn = Math.floor(minVisibleColumn / indentSize) * indentSize;
    for (let i = 0, len = lines.length; i < len; i++) {
      if (lines[i].ignore) {
        continue;
      }
      const lineContent = model.getLineContent(startLineNumber + i);
      let currentVisibleColumn = 0;
      for (j = 0, lenJ = lines[i].commentStrOffset; currentVisibleColumn < minVisibleColumn && j < lenJ; j++) {
        currentVisibleColumn = LineCommentCommand.nextVisibleColumn(currentVisibleColumn, indentSize, lineContent.charCodeAt(j) === CharCode.Tab, 1);
      }
      if (currentVisibleColumn > minVisibleColumn) {
        lines[i].commentStrOffset = j - 1;
      } else {
        lines[i].commentStrOffset = j;
      }
    }
  }
}
export {
  LineCommentCommand,
  Type
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2NvbW1lbnQvYnJvd3Nlci9saW5lQ29tbWVudENvbW1hbmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24sIElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kLCBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEsIElFZGl0T3BlcmF0aW9uQnVpbGRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQmxvY2tDb21tZW50Q29tbWFuZCB9IGZyb20gJy4vYmxvY2tDb21tZW50Q29tbWFuZC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUluc2VydGlvblBvaW50IHtcblx0aWdub3JlOiBib29sZWFuO1xuXHRjb21tZW50U3RyT2Zmc2V0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpbmVQcmVmbGlnaHREYXRhIHtcblx0aWdub3JlOiBib29sZWFuO1xuXHRjb21tZW50U3RyOiBzdHJpbmc7XG5cdGNvbW1lbnRTdHJPZmZzZXQ6IG51bWJlcjtcblx0Y29tbWVudFN0ckxlbmd0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcmVmbGlnaHREYXRhU3VwcG9ydGVkIHtcblx0c3VwcG9ydGVkOiB0cnVlO1xuXHRzaG91bGRSZW1vdmVDb21tZW50czogYm9vbGVhbjtcblx0bGluZXM6IElMaW5lUHJlZmxpZ2h0RGF0YVtdO1xufVxuZXhwb3J0IGludGVyZmFjZSBJUHJlZmxpZ2h0RGF0YVVuc3VwcG9ydGVkIHtcblx0c3VwcG9ydGVkOiBmYWxzZTtcbn1cbmV4cG9ydCB0eXBlIElQcmVmbGlnaHREYXRhID0gSVByZWZsaWdodERhdGFTdXBwb3J0ZWQgfCBJUHJlZmxpZ2h0RGF0YVVuc3VwcG9ydGVkO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTaW1wbGVNb2RlbCB7XG5cdGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVHlwZSB7XG5cdFRvZ2dsZSA9IDAsXG5cdEZvcmNlQWRkID0gMSxcblx0Rm9yY2VSZW1vdmUgPSAyXG59XG5cbmV4cG9ydCBjbGFzcyBMaW5lQ29tbWVudENvbW1hbmQgaW1wbGVtZW50cyBJQ29tbWFuZCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0aW9uOiBTZWxlY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luZGVudFNpemU6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdHlwZTogVHlwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5zZXJ0U3BhY2U6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lnbm9yZUVtcHR5TGluZXM6IGJvb2xlYW47XG5cdHByaXZhdGUgX3NlbGVjdGlvbklkOiBzdHJpbmcgfCBudWxsO1xuXHRwcml2YXRlIF9kZWx0YUNvbHVtbjogbnVtYmVyO1xuXHRwcml2YXRlIF9tb3ZlRW5kUG9zaXRpb25Eb3duOiBib29sZWFuO1xuXHRwcml2YXRlIF9pZ25vcmVGaXJzdExpbmU6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRzZWxlY3Rpb246IFNlbGVjdGlvbixcblx0XHRpbmRlbnRTaXplOiBudW1iZXIsXG5cdFx0dHlwZTogVHlwZSxcblx0XHRpbnNlcnRTcGFjZTogYm9vbGVhbixcblx0XHRpZ25vcmVFbXB0eUxpbmVzOiBib29sZWFuLFxuXHRcdGlnbm9yZUZpcnN0TGluZT86IGJvb2xlYW4sXG5cdCkge1xuXHRcdHRoaXMuX3NlbGVjdGlvbiA9IHNlbGVjdGlvbjtcblx0XHR0aGlzLl9pbmRlbnRTaXplID0gaW5kZW50U2l6ZTtcblx0XHR0aGlzLl90eXBlID0gdHlwZTtcblx0XHR0aGlzLl9pbnNlcnRTcGFjZSA9IGluc2VydFNwYWNlO1xuXHRcdHRoaXMuX3NlbGVjdGlvbklkID0gbnVsbDtcblx0XHR0aGlzLl9kZWx0YUNvbHVtbiA9IDA7XG5cdFx0dGhpcy5fbW92ZUVuZFBvc2l0aW9uRG93biA9IGZhbHNlO1xuXHRcdHRoaXMuX2lnbm9yZUVtcHR5TGluZXMgPSBpZ25vcmVFbXB0eUxpbmVzO1xuXHRcdHRoaXMuX2lnbm9yZUZpcnN0TGluZSA9IGlnbm9yZUZpcnN0TGluZSB8fCBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEbyBhbiBpbml0aWFsIHBhc3Mgb3ZlciB0aGUgbGluZXMgYW5kIGdhdGhlciBpbmZvIGFib3V0IHRoZSBsaW5lIGNvbW1lbnQgc3RyaW5nLlxuXHQgKiBSZXR1cm5zIG51bGwgaWYgYW55IG9mIHRoZSBsaW5lcyBkb2Vzbid0IHN1cHBvcnQgYSBsaW5lIGNvbW1lbnQgc3RyaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2dhdGhlclByZWZsaWdodENvbW1lbnRTdHJpbmdzKG1vZGVsOiBJVGV4dE1vZGVsLCBzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IElMaW5lUHJlZmxpZ2h0RGF0YVtdIHwgbnVsbCB7XG5cblx0XHRtb2RlbC50b2tlbml6YXRpb24udG9rZW5pemVJZkNoZWFwKHN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IG1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKHN0YXJ0TGluZU51bWJlciwgMSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5jb21tZW50cztcblx0XHRjb25zdCBjb21tZW50U3RyID0gKGNvbmZpZyA/IGNvbmZpZy5saW5lQ29tbWVudFRva2VuIDogbnVsbCk7XG5cdFx0aWYgKCFjb21tZW50U3RyKSB7XG5cdFx0XHQvLyBNb2RlIGRvZXMgbm90IHN1cHBvcnQgbGluZSBjb21tZW50c1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZXM6IElMaW5lUHJlZmxpZ2h0RGF0YVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxpbmVDb3VudCA9IGVuZExpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXIgKyAxOyBpIDwgbGluZUNvdW50OyBpKyspIHtcblx0XHRcdGxpbmVzW2ldID0ge1xuXHRcdFx0XHRpZ25vcmU6IGZhbHNlLFxuXHRcdFx0XHRjb21tZW50U3RyOiBjb21tZW50U3RyLFxuXHRcdFx0XHRjb21tZW50U3RyT2Zmc2V0OiAwLFxuXHRcdFx0XHRjb21tZW50U3RyTGVuZ3RoOiBjb21tZW50U3RyLmxlbmd0aFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGluZXM7XG5cdH1cblxuXHQvKipcblx0ICogQW5hbHl6ZSBsaW5lcyBhbmQgZGVjaWRlIHdoaWNoIGxpbmVzIGFyZSByZWxldmFudCBhbmQgd2hhdCB0aGUgdG9nZ2xlIHNob3VsZCBkby5cblx0ICogQWxzbywgYnVpbGQgdXAgc2V2ZXJhbCBvZmZzZXRzIGFuZCBsZW5ndGhzIHVzZWZ1bCBpbiB0aGUgZ2VuZXJhdGlvbiBvZiBlZGl0b3Igb3BlcmF0aW9ucy5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgX2FuYWx5emVMaW5lcyh0eXBlOiBUeXBlLCBpbnNlcnRTcGFjZTogYm9vbGVhbiwgbW9kZWw6IElTaW1wbGVNb2RlbCwgbGluZXM6IElMaW5lUHJlZmxpZ2h0RGF0YVtdLCBzdGFydExpbmVOdW1iZXI6IG51bWJlciwgaWdub3JlRW1wdHlMaW5lczogYm9vbGVhbiwgaWdub3JlRmlyc3RMaW5lOiBib29sZWFuLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZDogc3RyaW5nKTogSVByZWZsaWdodERhdGEge1xuXHRcdGxldCBvbmx5V2hpdGVzcGFjZUxpbmVzID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmNvbW1lbnRzO1xuXHRcdGNvbnN0IGxpbmVDb21tZW50Tm9JbmRlbnQgPSBjb25maWc/LmxpbmVDb21tZW50Tm9JbmRlbnQgPz8gZmFsc2U7XG5cblx0XHRsZXQgc2hvdWxkUmVtb3ZlQ29tbWVudHM6IGJvb2xlYW47XG5cdFx0aWYgKHR5cGUgPT09IFR5cGUuVG9nZ2xlKSB7XG5cdFx0XHRzaG91bGRSZW1vdmVDb21tZW50cyA9IHRydWU7XG5cdFx0fSBlbHNlIGlmICh0eXBlID09PSBUeXBlLkZvcmNlQWRkKSB7XG5cdFx0XHRzaG91bGRSZW1vdmVDb21tZW50cyA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzaG91bGRSZW1vdmVDb21tZW50cyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxpbmVDb3VudCA9IGxpbmVzLmxlbmd0aDsgaSA8IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lRGF0YSA9IGxpbmVzW2ldO1xuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlciArIGk7XG5cblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBzdGFydExpbmVOdW1iZXIgJiYgaWdub3JlRmlyc3RMaW5lKSB7XG5cdFx0XHRcdC8vIGZpcnN0IGxpbmUgaWdub3JlZFxuXHRcdFx0XHRsaW5lRGF0YS5pZ25vcmUgPSB0cnVlO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxpbmVDb250ZW50U3RhcnRPZmZzZXQgPSBzdHJpbmdzLmZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVDb250ZW50KTtcblxuXHRcdFx0aWYgKGxpbmVDb250ZW50U3RhcnRPZmZzZXQgPT09IC0xKSB7XG5cdFx0XHRcdC8vIEVtcHR5IG9yIHdoaXRlc3BhY2Ugb25seSBsaW5lXG5cdFx0XHRcdGxpbmVEYXRhLmlnbm9yZSA9IGlnbm9yZUVtcHR5TGluZXM7XG5cdFx0XHRcdGxpbmVEYXRhLmNvbW1lbnRTdHJPZmZzZXQgPSBsaW5lQ29tbWVudE5vSW5kZW50ID8gMCA6IGxpbmVDb250ZW50Lmxlbmd0aDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdG9ubHlXaGl0ZXNwYWNlTGluZXMgPSBmYWxzZTtcblx0XHRcdGNvbnN0IG9mZnNldCA9IGxpbmVDb21tZW50Tm9JbmRlbnQgPyAwIDogbGluZUNvbnRlbnRTdGFydE9mZnNldDtcblx0XHRcdGxpbmVEYXRhLmlnbm9yZSA9IGZhbHNlO1xuXHRcdFx0bGluZURhdGEuY29tbWVudFN0ck9mZnNldCA9IG9mZnNldDtcblxuXHRcdFx0aWYgKHNob3VsZFJlbW92ZUNvbW1lbnRzICYmICFCbG9ja0NvbW1lbnRDb21tYW5kLl9oYXlzdGFja0hhc05lZWRsZUF0T2Zmc2V0KGxpbmVDb250ZW50LCBsaW5lRGF0YS5jb21tZW50U3RyLCBvZmZzZXQpKSB7XG5cdFx0XHRcdGlmICh0eXBlID09PSBUeXBlLlRvZ2dsZSkge1xuXHRcdFx0XHRcdC8vIEV2ZXJ5IGxpbmUgc28gZmFyIGhhcyBiZWVuIGEgbGluZSBjb21tZW50LCBidXQgdGhpcyBvbmUgaXMgbm90XG5cdFx0XHRcdFx0c2hvdWxkUmVtb3ZlQ29tbWVudHMgPSBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlID09PSBUeXBlLkZvcmNlQWRkKSB7XG5cdFx0XHRcdFx0Ly8gV2lsbCBub3QgaGFwcGVuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGluZURhdGEuaWdub3JlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2hvdWxkUmVtb3ZlQ29tbWVudHMgJiYgaW5zZXJ0U3BhY2UpIHtcblx0XHRcdFx0Ly8gUmVtb3ZlIGEgZm9sbG93aW5nIHNwYWNlIGlmIHByZXNlbnRcblx0XHRcdFx0Y29uc3QgY29tbWVudFN0ckVuZE9mZnNldCA9IGxpbmVDb250ZW50U3RhcnRPZmZzZXQgKyBsaW5lRGF0YS5jb21tZW50U3RyTGVuZ3RoO1xuXHRcdFx0XHRpZiAoY29tbWVudFN0ckVuZE9mZnNldCA8IGxpbmVDb250ZW50Lmxlbmd0aCAmJiBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNvbW1lbnRTdHJFbmRPZmZzZXQpID09PSBDaGFyQ29kZS5TcGFjZSkge1xuXHRcdFx0XHRcdGxpbmVEYXRhLmNvbW1lbnRTdHJMZW5ndGggKz0gMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlID09PSBUeXBlLlRvZ2dsZSAmJiBvbmx5V2hpdGVzcGFjZUxpbmVzKSB7XG5cdFx0XHQvLyBGb3Igb25seSB3aGl0ZXNwYWNlIGxpbmVzLCB3ZSBpbnNlcnQgY29tbWVudHNcblx0XHRcdHNob3VsZFJlbW92ZUNvbW1lbnRzID0gZmFsc2U7XG5cblx0XHRcdC8vIEFsc28sIG5vIGxvbmdlciBpZ25vcmUgdGhlbVxuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxpbmVDb3VudCA9IGxpbmVzLmxlbmd0aDsgaSA8IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0XHRcdGxpbmVzW2ldLmlnbm9yZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdXBwb3J0ZWQ6IHRydWUsXG5cdFx0XHRzaG91bGRSZW1vdmVDb21tZW50czogc2hvdWxkUmVtb3ZlQ29tbWVudHMsXG5cdFx0XHRsaW5lczogbGluZXNcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEFuYWx5emUgYWxsIGxpbmVzIGFuZCBkZWNpZGUgZXhhY3RseSB3aGF0IHRvIGRvID0+IG5vdCBzdXBwb3J0ZWQgfCBpbnNlcnQgbGluZSBjb21tZW50cyB8IHJlbW92ZSBsaW5lIGNvbW1lbnRzXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIF9nYXRoZXJQcmVmbGlnaHREYXRhKHR5cGU6IFR5cGUsIGluc2VydFNwYWNlOiBib29sZWFuLCBtb2RlbDogSVRleHRNb2RlbCwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgaWdub3JlRW1wdHlMaW5lczogYm9vbGVhbiwgaWdub3JlRmlyc3RMaW5lOiBib29sZWFuLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IElQcmVmbGlnaHREYXRhIHtcblx0XHRjb25zdCBsaW5lcyA9IExpbmVDb21tZW50Q29tbWFuZC5fZ2F0aGVyUHJlZmxpZ2h0Q29tbWVudFN0cmluZ3MobW9kZWwsIHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IG1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKHN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0aWYgKGxpbmVzID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdXBwb3J0ZWQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBMaW5lQ29tbWVudENvbW1hbmQuX2FuYWx5emVMaW5lcyh0eXBlLCBpbnNlcnRTcGFjZSwgbW9kZWwsIGxpbmVzLCBzdGFydExpbmVOdW1iZXIsIGlnbm9yZUVtcHR5TGluZXMsIGlnbm9yZUZpcnN0TGluZSwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZCk7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYSBzdWNjZXNzZnVsIGFuYWx5c2lzLCBleGVjdXRlIGVpdGhlciBpbnNlcnQgbGluZSBjb21tZW50cywgZWl0aGVyIHJlbW92ZSBsaW5lIGNvbW1lbnRzXG5cdCAqL1xuXHRwcml2YXRlIF9leGVjdXRlTGluZUNvbW1lbnRzKG1vZGVsOiBJU2ltcGxlTW9kZWwsIGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlciwgZGF0YTogSVByZWZsaWdodERhdGFTdXBwb3J0ZWQsIHM6IFNlbGVjdGlvbik6IHZvaWQge1xuXG5cdFx0bGV0IG9wczogSVNpbmdsZUVkaXRPcGVyYXRpb25bXTtcblxuXHRcdGlmIChkYXRhLnNob3VsZFJlbW92ZUNvbW1lbnRzKSB7XG5cdFx0XHRvcHMgPSBMaW5lQ29tbWVudENvbW1hbmQuX2NyZWF0ZVJlbW92ZUxpbmVDb21tZW50c09wZXJhdGlvbnMoZGF0YS5saW5lcywgcy5zdGFydExpbmVOdW1iZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRMaW5lQ29tbWVudENvbW1hbmQuX25vcm1hbGl6ZUluc2VydGlvblBvaW50KG1vZGVsLCBkYXRhLmxpbmVzLCBzLnN0YXJ0TGluZU51bWJlciwgdGhpcy5faW5kZW50U2l6ZSk7XG5cdFx0XHRvcHMgPSB0aGlzLl9jcmVhdGVBZGRMaW5lQ29tbWVudHNPcGVyYXRpb25zKGRhdGEubGluZXMsIHMuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihzLnBvc2l0aW9uTGluZU51bWJlciwgcy5wb3NpdGlvbkNvbHVtbik7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gb3BzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24ob3BzW2ldLnJhbmdlLCBvcHNbaV0udGV4dCk7XG5cdFx0XHRpZiAoUmFuZ2UuaXNFbXB0eShvcHNbaV0ucmFuZ2UpICYmIFJhbmdlLmdldFN0YXJ0UG9zaXRpb24ob3BzW2ldLnJhbmdlKS5lcXVhbHMoY3Vyc29yUG9zaXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoY3Vyc29yUG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdGlmIChsaW5lQ29udGVudC5sZW5ndGggKyAxID09PSBjdXJzb3JQb3NpdGlvbi5jb2x1bW4pIHtcblx0XHRcdFx0XHR0aGlzLl9kZWx0YUNvbHVtbiA9IChvcHNbaV0udGV4dCB8fCAnJykubGVuZ3RoO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBidWlsZGVyLnRyYWNrU2VsZWN0aW9uKHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXR0ZW1wdFJlbW92ZUJsb2NrQ29tbWVudChtb2RlbDogSVRleHRNb2RlbCwgczogU2VsZWN0aW9uLCBzdGFydFRva2VuOiBzdHJpbmcsIGVuZFRva2VuOiBzdHJpbmcpOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdIHwgbnVsbCB7XG5cdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IHMuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGxldCBlbmRMaW5lTnVtYmVyID0gcy5lbmRMaW5lTnVtYmVyO1xuXG5cdFx0Y29uc3Qgc3RhcnRUb2tlbkFsbG93ZWRCZWZvcmVDb2x1bW4gPSBlbmRUb2tlbi5sZW5ndGggKyBNYXRoLm1heChcblx0XHRcdG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4ocy5zdGFydExpbmVOdW1iZXIpLFxuXHRcdFx0cy5zdGFydENvbHVtblxuXHRcdCk7XG5cblx0XHRsZXQgc3RhcnRUb2tlbkluZGV4ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyKS5sYXN0SW5kZXhPZihzdGFydFRva2VuLCBzdGFydFRva2VuQWxsb3dlZEJlZm9yZUNvbHVtbiAtIDEpO1xuXHRcdGxldCBlbmRUb2tlbkluZGV4ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoZW5kTGluZU51bWJlcikuaW5kZXhPZihlbmRUb2tlbiwgcy5lbmRDb2x1bW4gLSAxIC0gc3RhcnRUb2tlbi5sZW5ndGgpO1xuXG5cdFx0aWYgKHN0YXJ0VG9rZW5JbmRleCAhPT0gLTEgJiYgZW5kVG9rZW5JbmRleCA9PT0gLTEpIHtcblx0XHRcdGVuZFRva2VuSW5kZXggPSBtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpLmluZGV4T2YoZW5kVG9rZW4sIHN0YXJ0VG9rZW5JbmRleCArIHN0YXJ0VG9rZW4ubGVuZ3RoKTtcblx0XHRcdGVuZExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXJ0VG9rZW5JbmRleCA9PT0gLTEgJiYgZW5kVG9rZW5JbmRleCAhPT0gLTEpIHtcblx0XHRcdHN0YXJ0VG9rZW5JbmRleCA9IG1vZGVsLmdldExpbmVDb250ZW50KGVuZExpbmVOdW1iZXIpLmxhc3RJbmRleE9mKHN0YXJ0VG9rZW4sIGVuZFRva2VuSW5kZXgpO1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gZW5kTGluZU51bWJlcjtcblx0XHR9XG5cblx0XHRpZiAocy5pc0VtcHR5KCkgJiYgKHN0YXJ0VG9rZW5JbmRleCA9PT0gLTEgfHwgZW5kVG9rZW5JbmRleCA9PT0gLTEpKSB7XG5cdFx0XHRzdGFydFRva2VuSW5kZXggPSBtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpLmluZGV4T2Yoc3RhcnRUb2tlbik7XG5cdFx0XHRpZiAoc3RhcnRUb2tlbkluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRlbmRUb2tlbkluZGV4ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyKS5pbmRleE9mKGVuZFRva2VuLCBzdGFydFRva2VuSW5kZXggKyBzdGFydFRva2VuLmxlbmd0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2UgaGF2ZSB0byBhZGp1c3QgdG8gcG9zc2libGUgaW5uZXIgd2hpdGUgc3BhY2UuXG5cdFx0Ly8gRm9yIFNwYWNlIGFmdGVyIHN0YXJ0VG9rZW4sIGFkZCBTcGFjZSB0byBzdGFydFRva2VuIC0gcmFuZ2UgbWF0aCB3aWxsIHdvcmsgb3V0LlxuXHRcdGlmIChzdGFydFRva2VuSW5kZXggIT09IC0xICYmIG1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlcikuY2hhckNvZGVBdChzdGFydFRva2VuSW5kZXggKyBzdGFydFRva2VuLmxlbmd0aCkgPT09IENoYXJDb2RlLlNwYWNlKSB7XG5cdFx0XHRzdGFydFRva2VuICs9ICcgJztcblx0XHR9XG5cblx0XHQvLyBGb3IgU3BhY2UgYmVmb3JlIGVuZFRva2VuLCBhZGQgU3BhY2UgYmVmb3JlIGVuZFRva2VuIGFuZCBzaGlmdCBpbmRleCBvbmUgbGVmdC5cblx0XHRpZiAoZW5kVG9rZW5JbmRleCAhPT0gLTEgJiYgbW9kZWwuZ2V0TGluZUNvbnRlbnQoZW5kTGluZU51bWJlcikuY2hhckNvZGVBdChlbmRUb2tlbkluZGV4IC0gMSkgPT09IENoYXJDb2RlLlNwYWNlKSB7XG5cdFx0XHRlbmRUb2tlbiA9ICcgJyArIGVuZFRva2VuO1xuXHRcdFx0ZW5kVG9rZW5JbmRleCAtPSAxO1xuXHRcdH1cblxuXHRcdGlmIChzdGFydFRva2VuSW5kZXggIT09IC0xICYmIGVuZFRva2VuSW5kZXggIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gQmxvY2tDb21tZW50Q29tbWFuZC5fY3JlYXRlUmVtb3ZlQmxvY2tDb21tZW50T3BlcmF0aW9ucyhcblx0XHRcdFx0bmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRUb2tlbkluZGV4ICsgc3RhcnRUb2tlbi5sZW5ndGggKyAxLCBlbmRMaW5lTnVtYmVyLCBlbmRUb2tlbkluZGV4ICsgMSksIHN0YXJ0VG9rZW4sIGVuZFRva2VuXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGFuIHVuc3VjY2Vzc2Z1bCBhbmFseXNpcywgZGVsZWdhdGUgdG8gdGhlIGJsb2NrIGNvbW1lbnQgY29tbWFuZFxuXHQgKi9cblx0cHJpdmF0ZSBfZXhlY3V0ZUJsb2NrQ29tbWVudChtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyLCBzOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0XHRtb2RlbC50b2tlbml6YXRpb24udG9rZW5pemVJZkNoZWFwKHMuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24ocy5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuY29tbWVudHM7XG5cdFx0aWYgKCFjb25maWcgfHwgIWNvbmZpZy5ibG9ja0NvbW1lbnRTdGFydFRva2VuIHx8ICFjb25maWcuYmxvY2tDb21tZW50RW5kVG9rZW4pIHtcblx0XHRcdC8vIE1vZGUgZG9lcyBub3Qgc3VwcG9ydCBibG9jayBjb21tZW50c1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0VG9rZW4gPSBjb25maWcuYmxvY2tDb21tZW50U3RhcnRUb2tlbjtcblx0XHRjb25zdCBlbmRUb2tlbiA9IGNvbmZpZy5ibG9ja0NvbW1lbnRFbmRUb2tlbjtcblxuXHRcdGxldCBvcHMgPSB0aGlzLl9hdHRlbXB0UmVtb3ZlQmxvY2tDb21tZW50KG1vZGVsLCBzLCBzdGFydFRva2VuLCBlbmRUb2tlbik7XG5cdFx0aWYgKCFvcHMpIHtcblx0XHRcdGlmIChzLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHMuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0bGV0IGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ID0gc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lQ29udGVudCk7XG5cdFx0XHRcdGlmIChmaXJzdE5vbldoaXRlc3BhY2VJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHQvLyBMaW5lIGlzIGVtcHR5IG9yIGNvbnRhaW5zIG9ubHkgd2hpdGVzcGFjZVxuXHRcdFx0XHRcdGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ID0gbGluZUNvbnRlbnQubGVuZ3RoO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9wcyA9IEJsb2NrQ29tbWVudENvbW1hbmQuX2NyZWF0ZUFkZEJsb2NrQ29tbWVudE9wZXJhdGlvbnMoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKHMuc3RhcnRMaW5lTnVtYmVyLCBmaXJzdE5vbldoaXRlc3BhY2VJbmRleCArIDEsIHMuc3RhcnRMaW5lTnVtYmVyLCBsaW5lQ29udGVudC5sZW5ndGggKyAxKSxcblx0XHRcdFx0XHRzdGFydFRva2VuLFxuXHRcdFx0XHRcdGVuZFRva2VuLFxuXHRcdFx0XHRcdHRoaXMuX2luc2VydFNwYWNlXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvcHMgPSBCbG9ja0NvbW1lbnRDb21tYW5kLl9jcmVhdGVBZGRCbG9ja0NvbW1lbnRPcGVyYXRpb25zKFxuXHRcdFx0XHRcdG5ldyBSYW5nZShzLnN0YXJ0TGluZU51bWJlciwgbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihzLnN0YXJ0TGluZU51bWJlciksIHMuZW5kTGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihzLmVuZExpbmVOdW1iZXIpKSxcblx0XHRcdFx0XHRzdGFydFRva2VuLFxuXHRcdFx0XHRcdGVuZFRva2VuLFxuXHRcdFx0XHRcdHRoaXMuX2luc2VydFNwYWNlXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChvcHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdC8vIExlYXZlIGN1cnNvciBhZnRlciB0b2tlbiBhbmQgU3BhY2Vcblx0XHRcdFx0dGhpcy5fZGVsdGFDb2x1bW4gPSBzdGFydFRva2VuLmxlbmd0aCArIDE7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3NlbGVjdGlvbklkID0gYnVpbGRlci50cmFja1NlbGVjdGlvbihzKTtcblx0XHRmb3IgKGNvbnN0IG9wIG9mIG9wcykge1xuXHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG9wLnJhbmdlLCBvcC50ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWRpdE9wZXJhdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlcik6IHZvaWQge1xuXG5cdFx0bGV0IHMgPSB0aGlzLl9zZWxlY3Rpb247XG5cdFx0dGhpcy5fbW92ZUVuZFBvc2l0aW9uRG93biA9IGZhbHNlO1xuXG5cdFx0aWYgKHMuc3RhcnRMaW5lTnVtYmVyID09PSBzLmVuZExpbmVOdW1iZXIgJiYgdGhpcy5faWdub3JlRmlyc3RMaW5lKSB7XG5cdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24obmV3IFJhbmdlKHMuc3RhcnRMaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHMuc3RhcnRMaW5lTnVtYmVyKSwgcy5zdGFydExpbmVOdW1iZXIgKyAxLCAxKSwgcy5zdGFydExpbmVOdW1iZXIgPT09IG1vZGVsLmdldExpbmVDb3VudCgpID8gJycgOiAnXFxuJyk7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25JZCA9IGJ1aWxkZXIudHJhY2tTZWxlY3Rpb24ocyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHMuc3RhcnRMaW5lTnVtYmVyIDwgcy5lbmRMaW5lTnVtYmVyICYmIHMuZW5kQ29sdW1uID09PSAxKSB7XG5cdFx0XHR0aGlzLl9tb3ZlRW5kUG9zaXRpb25Eb3duID0gdHJ1ZTtcblx0XHRcdHMgPSBzLnNldEVuZFBvc2l0aW9uKHMuZW5kTGluZU51bWJlciAtIDEsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocy5lbmRMaW5lTnVtYmVyIC0gMSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSBMaW5lQ29tbWVudENvbW1hbmQuX2dhdGhlclByZWZsaWdodERhdGEoXG5cdFx0XHR0aGlzLl90eXBlLFxuXHRcdFx0dGhpcy5faW5zZXJ0U3BhY2UsXG5cdFx0XHRtb2RlbCxcblx0XHRcdHMuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0cy5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0dGhpcy5faWdub3JlRW1wdHlMaW5lcyxcblx0XHRcdHRoaXMuX2lnbm9yZUZpcnN0TGluZSxcblx0XHRcdHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdCk7XG5cblx0XHRpZiAoZGF0YS5zdXBwb3J0ZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9leGVjdXRlTGluZUNvbW1lbnRzKG1vZGVsLCBidWlsZGVyLCBkYXRhLCBzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZXhlY3V0ZUJsb2NrQ29tbWVudChtb2RlbCwgYnVpbGRlciwgcyk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZUN1cnNvclN0YXRlKG1vZGVsOiBJVGV4dE1vZGVsLCBoZWxwZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSk6IFNlbGVjdGlvbiB7XG5cdFx0bGV0IHJlc3VsdCA9IGhlbHBlci5nZXRUcmFja2VkU2VsZWN0aW9uKHRoaXMuX3NlbGVjdGlvbklkISk7XG5cblx0XHRpZiAodGhpcy5fbW92ZUVuZFBvc2l0aW9uRG93bikge1xuXHRcdFx0cmVzdWx0ID0gcmVzdWx0LnNldEVuZFBvc2l0aW9uKHJlc3VsdC5lbmRMaW5lTnVtYmVyICsgMSwgMSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24oXG5cdFx0XHRyZXN1bHQuc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0cmVzdWx0LnNlbGVjdGlvblN0YXJ0Q29sdW1uICsgdGhpcy5fZGVsdGFDb2x1bW4sXG5cdFx0XHRyZXN1bHQucG9zaXRpb25MaW5lTnVtYmVyLFxuXHRcdFx0cmVzdWx0LnBvc2l0aW9uQ29sdW1uICsgdGhpcy5fZGVsdGFDb2x1bW5cblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdlbmVyYXRlIGVkaXQgb3BlcmF0aW9ucyBpbiB0aGUgcmVtb3ZlIGxpbmUgY29tbWVudCBjYXNlXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIF9jcmVhdGVSZW1vdmVMaW5lQ29tbWVudHNPcGVyYXRpb25zKGxpbmVzOiBJTGluZVByZWZsaWdodERhdGFbXSwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIpOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdIHtcblx0XHRjb25zdCByZXM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZURhdGEgPSBsaW5lc1tpXTtcblxuXHRcdFx0aWYgKGxpbmVEYXRhLmlnbm9yZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0cmVzLnB1c2goRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgKyBpLCBsaW5lRGF0YS5jb21tZW50U3RyT2Zmc2V0ICsgMSxcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyICsgaSwgbGluZURhdGEuY29tbWVudFN0ck9mZnNldCArIGxpbmVEYXRhLmNvbW1lbnRTdHJMZW5ndGggKyAxXG5cdFx0XHQpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcztcblx0fVxuXG5cdC8qKlxuXHQgKiBHZW5lcmF0ZSBlZGl0IG9wZXJhdGlvbnMgaW4gdGhlIGFkZCBsaW5lIGNvbW1lbnQgY2FzZVxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlQWRkTGluZUNvbW1lbnRzT3BlcmF0aW9ucyhsaW5lczogSUxpbmVQcmVmbGlnaHREYXRhW10sIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyKTogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSB7XG5cdFx0Y29uc3QgcmVzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0Y29uc3QgYWZ0ZXJDb21tZW50U3RyID0gdGhpcy5faW5zZXJ0U3BhY2UgPyAnICcgOiAnJztcblxuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lRGF0YSA9IGxpbmVzW2ldO1xuXG5cdFx0XHRpZiAobGluZURhdGEuaWdub3JlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXMucHVzaChFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oc3RhcnRMaW5lTnVtYmVyICsgaSwgbGluZURhdGEuY29tbWVudFN0ck9mZnNldCArIDEpLCBsaW5lRGF0YS5jb21tZW50U3RyICsgYWZ0ZXJDb21tZW50U3RyKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcztcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIG5leHRWaXNpYmxlQ29sdW1uKGN1cnJlbnRWaXNpYmxlQ29sdW1uOiBudW1iZXIsIGluZGVudFNpemU6IG51bWJlciwgaXNUYWI6IGJvb2xlYW4sIGNvbHVtblNpemU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGlzVGFiKSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudFZpc2libGVDb2x1bW4gKyAoaW5kZW50U2l6ZSAtIChjdXJyZW50VmlzaWJsZUNvbHVtbiAlIGluZGVudFNpemUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGN1cnJlbnRWaXNpYmxlQ29sdW1uICsgY29sdW1uU2l6ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGp1c3QgaW5zZXJ0aW9uIHBvaW50cyB0byBoYXZlIHRoZW0gdmVydGljYWxseSBhbGlnbmVkIGluIHRoZSBhZGQgbGluZSBjb21tZW50IGNhc2Vcblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgX25vcm1hbGl6ZUluc2VydGlvblBvaW50KG1vZGVsOiBJU2ltcGxlTW9kZWwsIGxpbmVzOiBJSW5zZXJ0aW9uUG9pbnRbXSwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGluZGVudFNpemU6IG51bWJlcik6IHZvaWQge1xuXHRcdGxldCBtaW5WaXNpYmxlQ29sdW1uID0gQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVI7XG5cdFx0bGV0IGo6IG51bWJlcjtcblx0XHRsZXQgbGVuSjogbnVtYmVyO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAobGluZXNbaV0uaWdub3JlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlciArIGkpO1xuXG5cdFx0XHRsZXQgY3VycmVudFZpc2libGVDb2x1bW4gPSAwO1xuXHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSBsaW5lc1tpXS5jb21tZW50U3RyT2Zmc2V0OyBjdXJyZW50VmlzaWJsZUNvbHVtbiA8IG1pblZpc2libGVDb2x1bW4gJiYgaiA8IGxlbko7IGorKykge1xuXHRcdFx0XHRjdXJyZW50VmlzaWJsZUNvbHVtbiA9IExpbmVDb21tZW50Q29tbWFuZC5uZXh0VmlzaWJsZUNvbHVtbihjdXJyZW50VmlzaWJsZUNvbHVtbiwgaW5kZW50U2l6ZSwgbGluZUNvbnRlbnQuY2hhckNvZGVBdChqKSA9PT0gQ2hhckNvZGUuVGFiLCAxKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1cnJlbnRWaXNpYmxlQ29sdW1uIDwgbWluVmlzaWJsZUNvbHVtbikge1xuXHRcdFx0XHRtaW5WaXNpYmxlQ29sdW1uID0gY3VycmVudFZpc2libGVDb2x1bW47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bWluVmlzaWJsZUNvbHVtbiA9IE1hdGguZmxvb3IobWluVmlzaWJsZUNvbHVtbiAvIGluZGVudFNpemUpICogaW5kZW50U2l6ZTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKGxpbmVzW2ldLmlnbm9yZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIgKyBpKTtcblxuXHRcdFx0bGV0IGN1cnJlbnRWaXNpYmxlQ29sdW1uID0gMDtcblx0XHRcdGZvciAoaiA9IDAsIGxlbkogPSBsaW5lc1tpXS5jb21tZW50U3RyT2Zmc2V0OyBjdXJyZW50VmlzaWJsZUNvbHVtbiA8IG1pblZpc2libGVDb2x1bW4gJiYgaiA8IGxlbko7IGorKykge1xuXHRcdFx0XHRjdXJyZW50VmlzaWJsZUNvbHVtbiA9IExpbmVDb21tZW50Q29tbWFuZC5uZXh0VmlzaWJsZUNvbHVtbihjdXJyZW50VmlzaWJsZUNvbHVtbiwgaW5kZW50U2l6ZSwgbGluZUNvbnRlbnQuY2hhckNvZGVBdChqKSA9PT0gQ2hhckNvZGUuVGFiLCAxKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1cnJlbnRWaXNpYmxlQ29sdW1uID4gbWluVmlzaWJsZUNvbHVtbikge1xuXHRcdFx0XHRsaW5lc1tpXS5jb21tZW50U3RyT2Zmc2V0ID0gaiAtIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsaW5lc1tpXS5jb21tZW50U3RyT2Zmc2V0ID0gajtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksYUFBYTtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHFCQUEyQztBQUNwRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FB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
