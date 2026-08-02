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
import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { CursorColumns } from "../core/cursorColumns.js";
import { Range } from "../core/range.js";
import { Selection, SelectionDirection } from "../core/selection.js";
import { getEnterAction } from "../languages/enterAction.js";
import { ILanguageConfigurationService } from "../languages/languageConfigurationRegistry.js";
const repeatCache = /* @__PURE__ */ Object.create(null);
function cachedStringRepeat(str, count) {
  if (count <= 0) {
    return "";
  }
  if (!repeatCache[str]) {
    repeatCache[str] = ["", str];
  }
  const cache = repeatCache[str];
  for (let i = cache.length; i <= count; i++) {
    cache[i] = cache[i - 1] + str;
  }
  return cache[count];
}
let ShiftCommand = class {
  constructor(range, opts, _languageConfigurationService) {
    this._languageConfigurationService = _languageConfigurationService;
    this._opts = opts;
    this._selection = range;
    this._selectionId = null;
    this._useLastEditRangeForCursorEndPosition = false;
    this._selectionStartColumnStaysPut = false;
  }
  static unshiftIndent(line, column, tabSize, indentSize, insertSpaces) {
    const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);
    if (insertSpaces) {
      const indent = cachedStringRepeat(" ", indentSize);
      const desiredTabStop = CursorColumns.prevIndentTabStop(contentStartVisibleColumn, indentSize);
      const indentCount = desiredTabStop / indentSize;
      return cachedStringRepeat(indent, indentCount);
    } else {
      const indent = "	";
      const desiredTabStop = CursorColumns.prevRenderTabStop(contentStartVisibleColumn, tabSize);
      const indentCount = desiredTabStop / tabSize;
      return cachedStringRepeat(indent, indentCount);
    }
  }
  static shiftIndent(line, column, tabSize, indentSize, insertSpaces) {
    const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);
    if (insertSpaces) {
      const indent = cachedStringRepeat(" ", indentSize);
      const desiredTabStop = CursorColumns.nextIndentTabStop(contentStartVisibleColumn, indentSize);
      const indentCount = desiredTabStop / indentSize;
      return cachedStringRepeat(indent, indentCount);
    } else {
      const indent = "	";
      const desiredTabStop = CursorColumns.nextRenderTabStop(contentStartVisibleColumn, tabSize);
      const indentCount = desiredTabStop / tabSize;
      return cachedStringRepeat(indent, indentCount);
    }
  }
  _addEditOperation(builder, range, text) {
    if (this._useLastEditRangeForCursorEndPosition) {
      builder.addTrackedEditOperation(range, text);
    } else {
      builder.addEditOperation(range, text);
    }
  }
  getEditOperations(model, builder) {
    const startLine = this._selection.startLineNumber;
    let endLine = this._selection.endLineNumber;
    if (this._selection.endColumn === 1 && startLine !== endLine) {
      endLine = endLine - 1;
    }
    const { tabSize, indentSize, insertSpaces } = this._opts;
    const shouldIndentEmptyLines = startLine === endLine;
    if (this._opts.useTabStops) {
      if (this._selection.isEmpty()) {
        if (/^\s*$/.test(model.getLineContent(startLine))) {
          this._useLastEditRangeForCursorEndPosition = true;
        }
      }
      let previousLineExtraSpaces = 0, extraSpaces = 0;
      for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++, previousLineExtraSpaces = extraSpaces) {
        extraSpaces = 0;
        const lineText = model.getLineContent(lineNumber);
        let indentationEndIndex = strings.firstNonWhitespaceIndex(lineText);
        if (this._opts.isUnshift && (lineText.length === 0 || indentationEndIndex === 0)) {
          continue;
        }
        if (!shouldIndentEmptyLines && !this._opts.isUnshift && lineText.length === 0) {
          continue;
        }
        if (indentationEndIndex === -1) {
          indentationEndIndex = lineText.length;
        }
        if (lineNumber > 1) {
          const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(lineText, indentationEndIndex + 1, tabSize);
          if (contentStartVisibleColumn % indentSize !== 0) {
            if (model.tokenization.isCheapToTokenize(lineNumber - 1)) {
              const enterAction = getEnterAction(this._opts.autoIndent, model, new Range(lineNumber - 1, model.getLineMaxColumn(lineNumber - 1), lineNumber - 1, model.getLineMaxColumn(lineNumber - 1)), this._languageConfigurationService);
              if (enterAction) {
                extraSpaces = previousLineExtraSpaces;
                if (enterAction.appendText) {
                  for (let j = 0, lenJ = enterAction.appendText.length; j < lenJ && extraSpaces < indentSize; j++) {
                    if (enterAction.appendText.charCodeAt(j) === CharCode.Space) {
                      extraSpaces++;
                    } else {
                      break;
                    }
                  }
                }
                if (enterAction.removeText) {
                  extraSpaces = Math.max(0, extraSpaces - enterAction.removeText);
                }
                for (let j = 0; j < extraSpaces; j++) {
                  if (indentationEndIndex === 0 || lineText.charCodeAt(indentationEndIndex - 1) !== CharCode.Space) {
                    break;
                  }
                  indentationEndIndex--;
                }
              }
            }
          }
        }
        if (this._opts.isUnshift && indentationEndIndex === 0) {
          continue;
        }
        let desiredIndent;
        if (this._opts.isUnshift) {
          desiredIndent = ShiftCommand.unshiftIndent(lineText, indentationEndIndex + 1, tabSize, indentSize, insertSpaces);
        } else {
          desiredIndent = ShiftCommand.shiftIndent(lineText, indentationEndIndex + 1, tabSize, indentSize, insertSpaces);
        }
        this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), desiredIndent);
        if (lineNumber === startLine && !this._selection.isEmpty()) {
          this._selectionStartColumnStaysPut = this._selection.startColumn <= indentationEndIndex + 1;
        }
      }
    } else {
      if (!this._opts.isUnshift && this._selection.isEmpty() && model.getLineLength(startLine) === 0) {
        this._useLastEditRangeForCursorEndPosition = true;
      }
      const oneIndent = insertSpaces ? cachedStringRepeat(" ", indentSize) : "	";
      for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
        const lineText = model.getLineContent(lineNumber);
        let indentationEndIndex = strings.firstNonWhitespaceIndex(lineText);
        if (this._opts.isUnshift && (lineText.length === 0 || indentationEndIndex === 0)) {
          continue;
        }
        if (!shouldIndentEmptyLines && !this._opts.isUnshift && lineText.length === 0) {
          continue;
        }
        if (indentationEndIndex === -1) {
          indentationEndIndex = lineText.length;
        }
        if (this._opts.isUnshift && indentationEndIndex === 0) {
          continue;
        }
        if (this._opts.isUnshift) {
          indentationEndIndex = Math.min(indentationEndIndex, indentSize);
          for (let i = 0; i < indentationEndIndex; i++) {
            const chr = lineText.charCodeAt(i);
            if (chr === CharCode.Tab) {
              indentationEndIndex = i + 1;
              break;
            }
          }
          this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), "");
        } else {
          this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, 1), oneIndent);
          if (lineNumber === startLine && !this._selection.isEmpty()) {
            this._selectionStartColumnStaysPut = this._selection.startColumn === 1;
          }
        }
      }
    }
    this._selectionId = builder.trackSelection(this._selection);
  }
  computeCursorState(model, helper) {
    if (this._useLastEditRangeForCursorEndPosition) {
      const lastOp = helper.getInverseEditOperations()[0];
      return new Selection(lastOp.range.endLineNumber, lastOp.range.endColumn, lastOp.range.endLineNumber, lastOp.range.endColumn);
    }
    const result = helper.getTrackedSelection(this._selectionId);
    if (this._selectionStartColumnStaysPut) {
      const initialStartColumn = this._selection.startColumn;
      const resultStartColumn = result.startColumn;
      if (resultStartColumn <= initialStartColumn) {
        return result;
      }
      if (result.getDirection() === SelectionDirection.LTR) {
        return new Selection(result.startLineNumber, initialStartColumn, result.endLineNumber, result.endColumn);
      }
      return new Selection(result.endLineNumber, result.endColumn, result.startLineNumber, initialStartColumn);
    }
    return result;
  }
};
ShiftCommand = __decorateClass([
  __decorateParam(2, ILanguageConfigurationService)
], ShiftCommand);
export {
  ShiftCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29tbWFuZHMvc2hpZnRDb21tYW5kLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29sdW1ucyB9IGZyb20gJy4uL2NvcmUvY3Vyc29yQ29sdW1ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uLCBTZWxlY3Rpb25EaXJlY3Rpb24gfSBmcm9tICcuLi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZCwgSUN1cnNvclN0YXRlQ29tcHV0ZXJEYXRhLCBJRWRpdE9wZXJhdGlvbkJ1aWxkZXIgfSBmcm9tICcuLi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSB9IGZyb20gJy4uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IGdldEVudGVyQWN0aW9uIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2VudGVyQWN0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJU2hpZnRDb21tYW5kT3B0cyB7XG5cdGlzVW5zaGlmdDogYm9vbGVhbjtcblx0dGFiU2l6ZTogbnVtYmVyO1xuXHRpbmRlbnRTaXplOiBudW1iZXI7XG5cdGluc2VydFNwYWNlczogYm9vbGVhbjtcblx0dXNlVGFiU3RvcHM6IGJvb2xlYW47XG5cdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneTtcbn1cblxuY29uc3QgcmVwZWF0Q2FjaGU6IHsgW3N0cjogc3RyaW5nXTogc3RyaW5nW10gfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5mdW5jdGlvbiBjYWNoZWRTdHJpbmdSZXBlYXQoc3RyOiBzdHJpbmcsIGNvdW50OiBudW1iZXIpOiBzdHJpbmcge1xuXHRpZiAoY291bnQgPD0gMCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRpZiAoIXJlcGVhdENhY2hlW3N0cl0pIHtcblx0XHRyZXBlYXRDYWNoZVtzdHJdID0gWycnLCBzdHJdO1xuXHR9XG5cdGNvbnN0IGNhY2hlID0gcmVwZWF0Q2FjaGVbc3RyXTtcblx0Zm9yIChsZXQgaSA9IGNhY2hlLmxlbmd0aDsgaSA8PSBjb3VudDsgaSsrKSB7XG5cdFx0Y2FjaGVbaV0gPSBjYWNoZVtpIC0gMV0gKyBzdHI7XG5cdH1cblx0cmV0dXJuIGNhY2hlW2NvdW50XTtcbn1cblxuZXhwb3J0IGNsYXNzIFNoaWZ0Q29tbWFuZCBpbXBsZW1lbnRzIElDb21tYW5kIHtcblxuXHRwdWJsaWMgc3RhdGljIHVuc2hpZnRJbmRlbnQobGluZTogc3RyaW5nLCBjb2x1bW46IG51bWJlciwgdGFiU2l6ZTogbnVtYmVyLCBpbmRlbnRTaXplOiBudW1iZXIsIGluc2VydFNwYWNlczogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0Ly8gRGV0ZXJtaW5lIHRoZSB2aXNpYmxlIGNvbHVtbiB3aGVyZSB0aGUgY29udGVudCBzdGFydHNcblx0XHRjb25zdCBjb250ZW50U3RhcnRWaXNpYmxlQ29sdW1uID0gQ3Vyc29yQ29sdW1ucy52aXNpYmxlQ29sdW1uRnJvbUNvbHVtbihsaW5lLCBjb2x1bW4sIHRhYlNpemUpO1xuXG5cdFx0aWYgKGluc2VydFNwYWNlcykge1xuXHRcdFx0Y29uc3QgaW5kZW50ID0gY2FjaGVkU3RyaW5nUmVwZWF0KCcgJywgaW5kZW50U2l6ZSk7XG5cdFx0XHRjb25zdCBkZXNpcmVkVGFiU3RvcCA9IEN1cnNvckNvbHVtbnMucHJldkluZGVudFRhYlN0b3AoY29udGVudFN0YXJ0VmlzaWJsZUNvbHVtbiwgaW5kZW50U2l6ZSk7XG5cdFx0XHRjb25zdCBpbmRlbnRDb3VudCA9IGRlc2lyZWRUYWJTdG9wIC8gaW5kZW50U2l6ZTsgLy8gd2lsbCBiZSBhbiBpbnRlZ2VyXG5cdFx0XHRyZXR1cm4gY2FjaGVkU3RyaW5nUmVwZWF0KGluZGVudCwgaW5kZW50Q291bnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBpbmRlbnQgPSAnXFx0Jztcblx0XHRcdGNvbnN0IGRlc2lyZWRUYWJTdG9wID0gQ3Vyc29yQ29sdW1ucy5wcmV2UmVuZGVyVGFiU3RvcChjb250ZW50U3RhcnRWaXNpYmxlQ29sdW1uLCB0YWJTaXplKTtcblx0XHRcdGNvbnN0IGluZGVudENvdW50ID0gZGVzaXJlZFRhYlN0b3AgLyB0YWJTaXplOyAvLyB3aWxsIGJlIGFuIGludGVnZXJcblx0XHRcdHJldHVybiBjYWNoZWRTdHJpbmdSZXBlYXQoaW5kZW50LCBpbmRlbnRDb3VudCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN0YXRpYyBzaGlmdEluZGVudChsaW5lOiBzdHJpbmcsIGNvbHVtbjogbnVtYmVyLCB0YWJTaXplOiBudW1iZXIsIGluZGVudFNpemU6IG51bWJlciwgaW5zZXJ0U3BhY2VzOiBib29sZWFuKTogc3RyaW5nIHtcblx0XHQvLyBEZXRlcm1pbmUgdGhlIHZpc2libGUgY29sdW1uIHdoZXJlIHRoZSBjb250ZW50IHN0YXJ0c1xuXHRcdGNvbnN0IGNvbnRlbnRTdGFydFZpc2libGVDb2x1bW4gPSBDdXJzb3JDb2x1bW5zLnZpc2libGVDb2x1bW5Gcm9tQ29sdW1uKGxpbmUsIGNvbHVtbiwgdGFiU2l6ZSk7XG5cblx0XHRpZiAoaW5zZXJ0U3BhY2VzKSB7XG5cdFx0XHRjb25zdCBpbmRlbnQgPSBjYWNoZWRTdHJpbmdSZXBlYXQoJyAnLCBpbmRlbnRTaXplKTtcblx0XHRcdGNvbnN0IGRlc2lyZWRUYWJTdG9wID0gQ3Vyc29yQ29sdW1ucy5uZXh0SW5kZW50VGFiU3RvcChjb250ZW50U3RhcnRWaXNpYmxlQ29sdW1uLCBpbmRlbnRTaXplKTtcblx0XHRcdGNvbnN0IGluZGVudENvdW50ID0gZGVzaXJlZFRhYlN0b3AgLyBpbmRlbnRTaXplOyAvLyB3aWxsIGJlIGFuIGludGVnZXJcblx0XHRcdHJldHVybiBjYWNoZWRTdHJpbmdSZXBlYXQoaW5kZW50LCBpbmRlbnRDb3VudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluZGVudCA9ICdcXHQnO1xuXHRcdFx0Y29uc3QgZGVzaXJlZFRhYlN0b3AgPSBDdXJzb3JDb2x1bW5zLm5leHRSZW5kZXJUYWJTdG9wKGNvbnRlbnRTdGFydFZpc2libGVDb2x1bW4sIHRhYlNpemUpO1xuXHRcdFx0Y29uc3QgaW5kZW50Q291bnQgPSBkZXNpcmVkVGFiU3RvcCAvIHRhYlNpemU7IC8vIHdpbGwgYmUgYW4gaW50ZWdlclxuXHRcdFx0cmV0dXJuIGNhY2hlZFN0cmluZ1JlcGVhdChpbmRlbnQsIGluZGVudENvdW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcHRzOiBJU2hpZnRDb21tYW5kT3B0cztcblx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0aW9uOiBTZWxlY3Rpb247XG5cdHByaXZhdGUgX3NlbGVjdGlvbklkOiBzdHJpbmcgfCBudWxsO1xuXHRwcml2YXRlIF91c2VMYXN0RWRpdFJhbmdlRm9yQ3Vyc29yRW5kUG9zaXRpb246IGJvb2xlYW47XG5cdHByaXZhdGUgX3NlbGVjdGlvblN0YXJ0Q29sdW1uU3RheXNQdXQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmFuZ2U6IFNlbGVjdGlvbixcblx0XHRvcHRzOiBJU2hpZnRDb21tYW5kT3B0cyxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fb3B0cyA9IG9wdHM7XG5cdFx0dGhpcy5fc2VsZWN0aW9uID0gcmFuZ2U7XG5cdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBudWxsO1xuXHRcdHRoaXMuX3VzZUxhc3RFZGl0UmFuZ2VGb3JDdXJzb3JFbmRQb3NpdGlvbiA9IGZhbHNlO1xuXHRcdHRoaXMuX3NlbGVjdGlvblN0YXJ0Q29sdW1uU3RheXNQdXQgPSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZEVkaXRPcGVyYXRpb24oYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyLCByYW5nZTogUmFuZ2UsIHRleHQ6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl91c2VMYXN0RWRpdFJhbmdlRm9yQ3Vyc29yRW5kUG9zaXRpb24pIHtcblx0XHRcdGJ1aWxkZXIuYWRkVHJhY2tlZEVkaXRPcGVyYXRpb24ocmFuZ2UsIHRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24ocmFuZ2UsIHRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRFZGl0T3BlcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gdGhpcy5fc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjtcblxuXHRcdGxldCBlbmRMaW5lID0gdGhpcy5fc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7XG5cdFx0aWYgKHRoaXMuX3NlbGVjdGlvbi5lbmRDb2x1bW4gPT09IDEgJiYgc3RhcnRMaW5lICE9PSBlbmRMaW5lKSB7XG5cdFx0XHRlbmRMaW5lID0gZW5kTGluZSAtIDE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMgfSA9IHRoaXMuX29wdHM7XG5cdFx0Y29uc3Qgc2hvdWxkSW5kZW50RW1wdHlMaW5lcyA9IChzdGFydExpbmUgPT09IGVuZExpbmUpO1xuXG5cdFx0aWYgKHRoaXMuX29wdHMudXNlVGFiU3RvcHMpIHtcblx0XHRcdC8vIGlmIGluZGVudGluZyBvciBvdXRkZW50aW5nIG9uIGEgd2hpdGVzcGFjZSBvbmx5IGxpbmVcblx0XHRcdGlmICh0aGlzLl9zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGlmICgvXlxccyokLy50ZXN0KG1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZSkpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdXNlTGFzdEVkaXRSYW5nZUZvckN1cnNvckVuZFBvc2l0aW9uID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBrZWVwIHRyYWNrIG9mIHByZXZpb3VzIGxpbmUncyBcIm1pc3MtYWxpZ25tZW50XCJcblx0XHRcdGxldCBwcmV2aW91c0xpbmVFeHRyYVNwYWNlcyA9IDAsIGV4dHJhU3BhY2VzID0gMDtcblx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmU7IGxpbmVOdW1iZXIgPD0gZW5kTGluZTsgbGluZU51bWJlcisrLCBwcmV2aW91c0xpbmVFeHRyYVNwYWNlcyA9IGV4dHJhU3BhY2VzKSB7XG5cdFx0XHRcdGV4dHJhU3BhY2VzID0gMDtcblx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdFx0bGV0IGluZGVudGF0aW9uRW5kSW5kZXggPSBzdHJpbmdzLmZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVUZXh0KTtcblxuXHRcdFx0XHRpZiAodGhpcy5fb3B0cy5pc1Vuc2hpZnQgJiYgKGxpbmVUZXh0Lmxlbmd0aCA9PT0gMCB8fCBpbmRlbnRhdGlvbkVuZEluZGV4ID09PSAwKSkge1xuXHRcdFx0XHRcdC8vIGVtcHR5IGxpbmUgb3IgbGluZSB3aXRoIG5vIGxlYWRpbmcgd2hpdGVzcGFjZSA9PiBub3RoaW5nIHRvIGRvXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXNob3VsZEluZGVudEVtcHR5TGluZXMgJiYgIXRoaXMuX29wdHMuaXNVbnNoaWZ0ICYmIGxpbmVUZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIGRvIG5vdCBpbmRlbnQgZW1wdHkgbGluZXMgPT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGluZGVudGF0aW9uRW5kSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0Ly8gdGhlIGVudGlyZSBsaW5lIGlzIHdoaXRlc3BhY2Vcblx0XHRcdFx0XHRpbmRlbnRhdGlvbkVuZEluZGV4ID0gbGluZVRleHQubGVuZ3RoO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPiAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGVudFN0YXJ0VmlzaWJsZUNvbHVtbiA9IEN1cnNvckNvbHVtbnMudmlzaWJsZUNvbHVtbkZyb21Db2x1bW4obGluZVRleHQsIGluZGVudGF0aW9uRW5kSW5kZXggKyAxLCB0YWJTaXplKTtcblx0XHRcdFx0XHRpZiAoY29udGVudFN0YXJ0VmlzaWJsZUNvbHVtbiAlIGluZGVudFNpemUgIT09IDApIHtcblx0XHRcdFx0XHRcdC8vIFRoZSBjdXJyZW50IGxpbmUgaXMgXCJtaXNzLWFsaWduZWRcIiwgc28gbGV0J3Mgc2VlIGlmIHRoaXMgaXMgZXhwZWN0ZWQuLi5cblx0XHRcdFx0XHRcdC8vIFRoaXMgY2FuIG9ubHkgaGFwcGVuIHdoZW4gaXQgaGFzIHRyYWlsaW5nIGNvbW1hcyBpbiB0aGUgaW5kZW50XG5cdFx0XHRcdFx0XHRpZiAobW9kZWwudG9rZW5pemF0aW9uLmlzQ2hlYXBUb1Rva2VuaXplKGxpbmVOdW1iZXIgLSAxKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlbnRlckFjdGlvbiA9IGdldEVudGVyQWN0aW9uKHRoaXMuX29wdHMuYXV0b0luZGVudCwgbW9kZWwsIG5ldyBSYW5nZShsaW5lTnVtYmVyIC0gMSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyIC0gMSksIGxpbmVOdW1iZXIgLSAxLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIgLSAxKSksIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHRpZiAoZW50ZXJBY3Rpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRleHRyYVNwYWNlcyA9IHByZXZpb3VzTGluZUV4dHJhU3BhY2VzO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChlbnRlckFjdGlvbi5hcHBlbmRUZXh0KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb3IgKGxldCBqID0gMCwgbGVuSiA9IGVudGVyQWN0aW9uLmFwcGVuZFRleHQubGVuZ3RoOyBqIDwgbGVuSiAmJiBleHRyYVNwYWNlcyA8IGluZGVudFNpemU7IGorKykge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZiAoZW50ZXJBY3Rpb24uYXBwZW5kVGV4dC5jaGFyQ29kZUF0KGopID09PSBDaGFyQ29kZS5TcGFjZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGV4dHJhU3BhY2VzKys7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGVudGVyQWN0aW9uLnJlbW92ZVRleHQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGV4dHJhU3BhY2VzID0gTWF0aC5tYXgoMCwgZXh0cmFTcGFjZXMgLSBlbnRlckFjdGlvbi5yZW1vdmVUZXh0KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHQvLyBBY3QgYXMgaWYgYHByZWZpeFNwYWNlc2AgaXMgbm90IHBhcnQgb2YgdGhlIGluZGVudGF0aW9uXG5cdFx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBleHRyYVNwYWNlczsgaisrKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoaW5kZW50YXRpb25FbmRJbmRleCA9PT0gMCB8fCBsaW5lVGV4dC5jaGFyQ29kZUF0KGluZGVudGF0aW9uRW5kSW5kZXggLSAxKSAhPT0gQ2hhckNvZGUuU3BhY2UpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRpbmRlbnRhdGlvbkVuZEluZGV4LS07XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblxuXHRcdFx0XHRpZiAodGhpcy5fb3B0cy5pc1Vuc2hpZnQgJiYgaW5kZW50YXRpb25FbmRJbmRleCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIGxpbmUgd2l0aCBubyBsZWFkaW5nIHdoaXRlc3BhY2UgPT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGRlc2lyZWRJbmRlbnQ6IHN0cmluZztcblx0XHRcdFx0aWYgKHRoaXMuX29wdHMuaXNVbnNoaWZ0KSB7XG5cdFx0XHRcdFx0ZGVzaXJlZEluZGVudCA9IFNoaWZ0Q29tbWFuZC51bnNoaWZ0SW5kZW50KGxpbmVUZXh0LCBpbmRlbnRhdGlvbkVuZEluZGV4ICsgMSwgdGFiU2l6ZSwgaW5kZW50U2l6ZSwgaW5zZXJ0U3BhY2VzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZXNpcmVkSW5kZW50ID0gU2hpZnRDb21tYW5kLnNoaWZ0SW5kZW50KGxpbmVUZXh0LCBpbmRlbnRhdGlvbkVuZEluZGV4ICsgMSwgdGFiU2l6ZSwgaW5kZW50U2l6ZSwgaW5zZXJ0U3BhY2VzKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2FkZEVkaXRPcGVyYXRpb24oYnVpbGRlciwgbmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIGluZGVudGF0aW9uRW5kSW5kZXggKyAxKSwgZGVzaXJlZEluZGVudCk7XG5cdFx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBzdGFydExpbmUgJiYgIXRoaXMuX3NlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHQvLyBGb3JjZSB0aGUgc3RhcnRDb2x1bW4gdG8gc3RheSBwdXQgYmVjYXVzZSB3ZSdyZSBpbnNlcnRpbmcgYWZ0ZXIgaXRcblx0XHRcdFx0XHR0aGlzLl9zZWxlY3Rpb25TdGFydENvbHVtblN0YXlzUHV0ID0gKHRoaXMuX3NlbGVjdGlvbi5zdGFydENvbHVtbiA8PSBpbmRlbnRhdGlvbkVuZEluZGV4ICsgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXG5cdFx0XHQvLyBpZiBpbmRlbnRpbmcgb3Igb3V0ZGVudGluZyBvbiBhIHdoaXRlc3BhY2Ugb25seSBsaW5lXG5cdFx0XHRpZiAoIXRoaXMuX29wdHMuaXNVbnNoaWZ0ICYmIHRoaXMuX3NlbGVjdGlvbi5pc0VtcHR5KCkgJiYgbW9kZWwuZ2V0TGluZUxlbmd0aChzdGFydExpbmUpID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3VzZUxhc3RFZGl0UmFuZ2VGb3JDdXJzb3JFbmRQb3NpdGlvbiA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9uZUluZGVudCA9IChpbnNlcnRTcGFjZXMgPyBjYWNoZWRTdHJpbmdSZXBlYXQoJyAnLCBpbmRlbnRTaXplKSA6ICdcXHQnKTtcblxuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHN0YXJ0TGluZTsgbGluZU51bWJlciA8PSBlbmRMaW5lOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdFx0bGV0IGluZGVudGF0aW9uRW5kSW5kZXggPSBzdHJpbmdzLmZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVUZXh0KTtcblxuXHRcdFx0XHRpZiAodGhpcy5fb3B0cy5pc1Vuc2hpZnQgJiYgKGxpbmVUZXh0Lmxlbmd0aCA9PT0gMCB8fCBpbmRlbnRhdGlvbkVuZEluZGV4ID09PSAwKSkge1xuXHRcdFx0XHRcdC8vIGVtcHR5IGxpbmUgb3IgbGluZSB3aXRoIG5vIGxlYWRpbmcgd2hpdGVzcGFjZSA9PiBub3RoaW5nIHRvIGRvXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXNob3VsZEluZGVudEVtcHR5TGluZXMgJiYgIXRoaXMuX29wdHMuaXNVbnNoaWZ0ICYmIGxpbmVUZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIGRvIG5vdCBpbmRlbnQgZW1wdHkgbGluZXMgPT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGluZGVudGF0aW9uRW5kSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0Ly8gdGhlIGVudGlyZSBsaW5lIGlzIHdoaXRlc3BhY2Vcblx0XHRcdFx0XHRpbmRlbnRhdGlvbkVuZEluZGV4ID0gbGluZVRleHQubGVuZ3RoO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX29wdHMuaXNVbnNoaWZ0ICYmIGluZGVudGF0aW9uRW5kSW5kZXggPT09IDApIHtcblx0XHRcdFx0XHQvLyBsaW5lIHdpdGggbm8gbGVhZGluZyB3aGl0ZXNwYWNlID0+IG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl9vcHRzLmlzVW5zaGlmdCkge1xuXG5cdFx0XHRcdFx0aW5kZW50YXRpb25FbmRJbmRleCA9IE1hdGgubWluKGluZGVudGF0aW9uRW5kSW5kZXgsIGluZGVudFNpemUpO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW5kZW50YXRpb25FbmRJbmRleDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjaHIgPSBsaW5lVGV4dC5jaGFyQ29kZUF0KGkpO1xuXHRcdFx0XHRcdFx0aWYgKGNociA9PT0gQ2hhckNvZGUuVGFiKSB7XG5cdFx0XHRcdFx0XHRcdGluZGVudGF0aW9uRW5kSW5kZXggPSBpICsgMTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fYWRkRWRpdE9wZXJhdGlvbihidWlsZGVyLCBuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgaW5kZW50YXRpb25FbmRJbmRleCArIDEpLCAnJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fYWRkRWRpdE9wZXJhdGlvbihidWlsZGVyLCBuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgMSksIG9uZUluZGVudCk7XG5cdFx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IHN0YXJ0TGluZSAmJiAhdGhpcy5fc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdFx0Ly8gRm9yY2UgdGhlIHN0YXJ0Q29sdW1uIHRvIHN0YXkgcHV0IGJlY2F1c2Ugd2UncmUgaW5zZXJ0aW5nIGFmdGVyIGl0XG5cdFx0XHRcdFx0XHR0aGlzLl9zZWxlY3Rpb25TdGFydENvbHVtblN0YXlzUHV0ID0gKHRoaXMuX3NlbGVjdGlvbi5zdGFydENvbHVtbiA9PT0gMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBidWlsZGVyLnRyYWNrU2VsZWN0aW9uKHRoaXMuX3NlbGVjdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZUN1cnNvclN0YXRlKG1vZGVsOiBJVGV4dE1vZGVsLCBoZWxwZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSk6IFNlbGVjdGlvbiB7XG5cdFx0aWYgKHRoaXMuX3VzZUxhc3RFZGl0UmFuZ2VGb3JDdXJzb3JFbmRQb3NpdGlvbikge1xuXHRcdFx0Y29uc3QgbGFzdE9wID0gaGVscGVyLmdldEludmVyc2VFZGl0T3BlcmF0aW9ucygpWzBdO1xuXHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24obGFzdE9wLnJhbmdlLmVuZExpbmVOdW1iZXIsIGxhc3RPcC5yYW5nZS5lbmRDb2x1bW4sIGxhc3RPcC5yYW5nZS5lbmRMaW5lTnVtYmVyLCBsYXN0T3AucmFuZ2UuZW5kQ29sdW1uKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gaGVscGVyLmdldFRyYWNrZWRTZWxlY3Rpb24odGhpcy5fc2VsZWN0aW9uSWQhKTtcblxuXHRcdGlmICh0aGlzLl9zZWxlY3Rpb25TdGFydENvbHVtblN0YXlzUHV0KSB7XG5cdFx0XHQvLyBUaGUgc2VsZWN0aW9uIHN0YXJ0IHNob3VsZCBub3QgbW92ZVxuXHRcdFx0Y29uc3QgaW5pdGlhbFN0YXJ0Q29sdW1uID0gdGhpcy5fc2VsZWN0aW9uLnN0YXJ0Q29sdW1uO1xuXHRcdFx0Y29uc3QgcmVzdWx0U3RhcnRDb2x1bW4gPSByZXN1bHQuc3RhcnRDb2x1bW47XG5cdFx0XHRpZiAocmVzdWx0U3RhcnRDb2x1bW4gPD0gaW5pdGlhbFN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQuZ2V0RGlyZWN0aW9uKCkgPT09IFNlbGVjdGlvbkRpcmVjdGlvbi5MVFIpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24ocmVzdWx0LnN0YXJ0TGluZU51bWJlciwgaW5pdGlhbFN0YXJ0Q29sdW1uLCByZXN1bHQuZW5kTGluZU51bWJlciwgcmVzdWx0LmVuZENvbHVtbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihyZXN1bHQuZW5kTGluZU51bWJlciwgcmVzdWx0LmVuZENvbHVtbiwgcmVzdWx0LnN0YXJ0TGluZU51bWJlciwgaW5pdGlhbFN0YXJ0Q29sdW1uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksYUFBYTtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXLDBCQUEwQjtBQUk5QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFDQUFxQztBQVc5QyxNQUFNLGNBQTJDLHVCQUFPLE9BQU8sSUFBSTtBQUNuRSxTQUFTLG1CQUFtQixLQUFhLE9BQXVCO0FBQy9ELE1BQUksU0FBUyxHQUFHO0FBQ2YsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLENBQUMsWUFBWSxHQUFHLEdBQUc7QUFDdEIsZ0JBQVksR0FBRyxJQUFJLENBQUMsSUFBSSxHQUFHO0FBQUEsRUFDNUI7QUFDQSxRQUFNLFFBQVEsWUFBWSxHQUFHO0FBQzdCLFdBQVMsSUFBSSxNQUFNLFFBQVEsS0FBSyxPQUFPLEtBQUs7QUFDM0MsVUFBTSxDQUFDLElBQUksTUFBTSxJ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
