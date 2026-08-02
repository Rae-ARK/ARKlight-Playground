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
import * as strings from "../../../../base/common/strings.js";
import { ShiftCommand } from "../../../common/commands/shiftCommand.js";
import { EditorAutoIndentStrategy } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { IndentAction } from "../../../common/languages/languageConfiguration.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { IndentConsts } from "../../../common/languages/supports/indentRules.js";
import * as indentUtils from "../../indentation/common/indentUtils.js";
import { getGoodIndentForLine, getIndentMetadata } from "../../../common/languages/autoIndent.js";
import { getEnterAction } from "../../../common/languages/enterAction.js";
let MoveLinesCommand = class {
  constructor(selection, isMovingDown, autoIndent, _languageConfigurationService) {
    this._languageConfigurationService = _languageConfigurationService;
    this._selection = selection;
    this._isMovingDown = isMovingDown;
    this._autoIndent = autoIndent;
    this._selectionId = null;
    this._moveEndLineSelectionShrink = false;
  }
  createVirtualModel(model, lineNumberMapper, contentOverride) {
    return {
      tokenization: {
        getLineTokens: (lineNumber) => model.tokenization.getLineTokens(lineNumberMapper(lineNumber)),
        getLanguageId: () => model.getLanguageId(),
        getLanguageIdAtPosition: (lineNumber, column) => model.getLanguageIdAtPosition(lineNumber, column)
      },
      getLineContent: (lineNumber) => {
        const customContent = contentOverride?.(lineNumber);
        if (customContent !== void 0) {
          return customContent;
        }
        return model.getLineContent(lineNumberMapper(lineNumber));
      }
    };
  }
  getEditOperations(model, builder) {
    const modelLineCount = model.getLineCount();
    if (this._isMovingDown && this._selection.endLineNumber === modelLineCount) {
      this._selectionId = builder.trackSelection(this._selection);
      return;
    }
    if (!this._isMovingDown && this._selection.startLineNumber === 1) {
      this._selectionId = builder.trackSelection(this._selection);
      return;
    }
    this._moveEndPositionDown = false;
    let s = this._selection;
    if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
      this._moveEndPositionDown = true;
      s = s.setEndPosition(s.endLineNumber - 1, model.getLineMaxColumn(s.endLineNumber - 1));
    }
    const { tabSize, indentSize, insertSpaces } = model.getOptions();
    const indentConverter = this.buildIndentConverter(tabSize, indentSize, insertSpaces);
    if (s.startLineNumber === s.endLineNumber && model.getLineMaxColumn(s.startLineNumber) === 1) {
      const lineNumber = s.startLineNumber;
      const otherLineNumber = this._isMovingDown ? lineNumber + 1 : lineNumber - 1;
      if (model.getLineMaxColumn(otherLineNumber) === 1) {
        builder.addEditOperation(new Range(1, 1, 1, 1), null);
      } else {
        builder.addEditOperation(new Range(lineNumber, 1, lineNumber, 1), model.getLineContent(otherLineNumber));
        builder.addEditOperation(new Range(otherLineNumber, 1, otherLineNumber, model.getLineMaxColumn(otherLineNumber)), null);
      }
      s = new Selection(otherLineNumber, 1, otherLineNumber, 1);
    } else {
      let movingLineNumber;
      let movingLineText;
      if (this._isMovingDown) {
        movingLineNumber = s.endLineNumber + 1;
        movingLineText = model.getLineContent(movingLineNumber);
        builder.addEditOperation(new Range(movingLineNumber - 1, model.getLineMaxColumn(movingLineNumber - 1), movingLineNumber, model.getLineMaxColumn(movingLineNumber)), null);
        let insertingText = movingLineText;
        if (this.shouldAutoIndent(model, s)) {
          const movingLineMatchResult = this.matchEnterRule(model, indentConverter, tabSize, movingLineNumber, s.startLineNumber - 1);
          if (movingLineMatchResult !== null) {
            const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
            const newSpaceCnt = movingLineMatchResult + indentUtils.getSpaceCnt(oldIndentation, tabSize);
            const newIndentation = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
            insertingText = newIndentation + this.trimStart(movingLineText);
          } else {
            const virtualModel = this.createVirtualModel(
              model,
              (lineNumber) => lineNumber === s.startLineNumber ? movingLineNumber : lineNumber
            );
            const indentOfMovingLine = getGoodIndentForLine(
              this._autoIndent,
              virtualModel,
              model.getLanguageIdAtPosition(movingLineNumber, 1),
              s.startLineNumber,
              indentConverter,
              this._languageConfigurationService
            );
            if (indentOfMovingLine !== null) {
              const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
              const newSpaceCnt = indentUtils.getSpaceCnt(indentOfMovingLine, tabSize);
              const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
              if (newSpaceCnt !== oldSpaceCnt) {
                const newIndentation = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
                insertingText = newIndentation + this.trimStart(movingLineText);
              }
            }
          }
          builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + "\n");
          const ret = this.matchEnterRuleMovingDown(model, indentConverter, tabSize, s.startLineNumber, movingLineNumber, insertingText);
          if (ret !== null) {
            if (ret !== 0) {
              this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
            }
          } else {
            const virtualModel = this.createVirtualModel(
              model,
              (lineNumber) => {
                if (lineNumber === s.startLineNumber) {
                  return movingLineNumber;
                } else if (lineNumber >= s.startLineNumber + 1 && lineNumber <= s.endLineNumber + 1) {
                  return lineNumber - 1;
                } else {
                  return lineNumber;
                }
              },
              (lineNumber) => lineNumber === s.startLineNumber ? insertingText : void 0
            );
            const newIndentatOfMovingBlock = getGoodIndentForLine(
              this._autoIndent,
              virtualModel,
              model.getLanguageIdAtPosition(movingLineNumber, 1),
              s.startLineNumber + 1,
              indentConverter,
              this._languageConfigurationService
            );
            if (newIndentatOfMovingBlock !== null) {
              const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
              const newSpaceCnt = indentUtils.getSpaceCnt(newIndentatOfMovingBlock, tabSize);
              const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
              if (newSpaceCnt !== oldSpaceCnt) {
                const spaceCntOffset = newSpaceCnt - oldSpaceCnt;
                this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, spaceCntOffset);
              }
            }
          }
        } else {
          builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + "\n");
        }
      } else {
        movingLineNumber = s.startLineNumber - 1;
        movingLineText = model.getLineContent(movingLineNumber);
        builder.addEditOperation(new Range(movingLineNumber, 1, movingLineNumber + 1, 1), null);
        builder.addEditOperation(new Range(s.endLineNumber, model.getLineMaxColumn(s.endLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)), "\n" + movingLineText);
        if (this.shouldAutoIndent(model, s)) {
          const virtualModel = this.createVirtualModel(
            model,
            (lineNumber) => lineNumber === movingLineNumber ? s.startLineNumber : lineNumber
          );
          const ret = this.matchEnterRule(model, indentConverter, tabSize, s.startLineNumber, s.startLineNumber - 2);
          if (ret !== null) {
            if (ret !== 0) {
              this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
            }
          } else {
            const indentOfFirstLine = getGoodIndentForLine(
              this._autoIndent,
              virtualModel,
              model.getLanguageIdAtPosition(s.startLineNumber, 1),
              movingLineNumber,
              indentConverter,
              this._languageConfigurationService
            );
            if (indentOfFirstLine !== null) {
              const oldIndent = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
              const newSpaceCnt = indentUtils.getSpaceCnt(indentOfFirstLine, tabSize);
              const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndent, tabSize);
              if (newSpaceCnt !== oldSpaceCnt) {
                const spaceCntOffset = newSpaceCnt - oldSpaceCnt;
                this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, spaceCntOffset);
              }
            }
          }
        }
      }
    }
    this._selectionId = builder.trackSelection(s);
  }
  buildIndentConverter(tabSize, indentSize, insertSpaces) {
    return {
      shiftIndent: (indentation) => {
        return ShiftCommand.shiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
      },
      unshiftIndent: (indentation) => {
        return ShiftCommand.unshiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
      }
    };
  }
  parseEnterResult(model, indentConverter, tabSize, line, enter) {
    if (enter) {
      let enterPrefix = enter.indentation;
      if (enter.indentAction === IndentAction.None) {
        enterPrefix = enter.indentation + enter.appendText;
      } else if (enter.indentAction === IndentAction.Indent) {
        enterPrefix = enter.indentation + enter.appendText;
      } else if (enter.indentAction === IndentAction.IndentOutdent) {
        enterPrefix = enter.indentation;
      } else if (enter.indentAction === IndentAction.Outdent) {
        enterPrefix = indentConverter.unshiftIndent(enter.indentation) + enter.appendText;
      }
      const movingLineText = model.getLineContent(line);
      if (this.trimStart(movingLineText).indexOf(this.trimStart(enterPrefix)) >= 0) {
        const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(line));
        let newIndentation = strings.getLeadingWhitespace(enterPrefix);
        const indentMetadataOfMovelingLine = getIndentMetadata(model, line, this._languageConfigurationService);
        if (indentMetadataOfMovelingLine !== null && indentMetadataOfMovelingLine & IndentConsts.DECREASE_MASK) {
          newIndentation = indentConverter.unshiftIndent(newIndentation);
        }
        const newSpaceCnt = indentUtils.getSpaceCnt(newIndentation, tabSize);
        const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
        return newSpaceCnt - oldSpaceCnt;
      }
    }
    return null;
  }
  /**
   *
   * @param model
   * @param indentConverter
   * @param tabSize
   * @param line the line moving down
   * @param futureAboveLineNumber the line which will be at the `line` position
   * @param futureAboveLineText
   */
  matchEnterRuleMovingDown(model, indentConverter, tabSize, line, futureAboveLineNumber, futureAboveLineText) {
    if (strings.lastNonWhitespaceIndex(futureAboveLineText) >= 0) {
      const maxColumn = model.getLineMaxColumn(futureAboveLineNumber);
      const enter = getEnterAction(this._autoIndent, model, new Range(futureAboveLineNumber, maxColumn, futureAboveLineNumber, maxColumn), this._languageConfigurationService);
      return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
    } else {
      let validPrecedingLine = line - 1;
      while (validPrecedingLine >= 1) {
        const lineContent = model.getLineContent(validPrecedingLine);
        const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineContent);
        if (nonWhitespaceIdx >= 0) {
          break;
        }
        validPrecedingLine--;
      }
      if (validPrecedingLine < 1 || line > model.getLineCount()) {
        return null;
      }
      const maxColumn = model.getLineMaxColumn(validPrecedingLine);
      const enter = getEnterAction(this._autoIndent, model, new Range(validPrecedingLine, maxColumn, validPrecedingLine, maxColumn), this._languageConfigurationService);
      return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
    }
  }
  matchEnterRule(model, indentConverter, tabSize, line, oneLineAbove, previousLineText) {
    let validPrecedingLine = oneLineAbove;
    while (validPrecedingLine >= 1) {
      let lineContent;
      if (validPrecedingLine === oneLineAbove && previousLineText !== void 0) {
        lineContent = previousLineText;
      } else {
        lineContent = model.getLineContent(validPrecedingLine);
      }
      const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineContent);
      if (nonWhitespaceIdx >= 0) {
        break;
      }
      validPrecedingLine--;
    }
    if (validPrecedingLine < 1 || line > model.getLineCount()) {
      return null;
    }
    const maxColumn = model.getLineMaxColumn(validPrecedingLine);
    const enter = getEnterAction(this._autoIndent, model, new Range(validPrecedingLine, maxColumn, validPrecedingLine, maxColumn), this._languageConfigurationService);
    return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
  }
  trimStart(str) {
    return str.replace(/^\s+/, "");
  }
  shouldAutoIndent(model, selection) {
    if (this._autoIndent < EditorAutoIndentStrategy.Full) {
      return false;
    }
    if (!model.tokenization.isCheapToTokenize(selection.startLineNumber)) {
      return false;
    }
    const languageAtSelectionStart = model.getLanguageIdAtPosition(selection.startLineNumber, 1);
    const languageAtSelectionEnd = model.getLanguageIdAtPosition(selection.endLineNumber, 1);
    if (languageAtSelectionStart !== languageAtSelectionEnd) {
      return false;
    }
    if (this._languageConfigurationService.getLanguageConfiguration(languageAtSelectionStart).indentRulesSupport === null) {
      return false;
    }
    return true;
  }
  getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, offset) {
    for (let i = s.startLineNumber; i <= s.endLineNumber; i++) {
      const lineContent = model.getLineContent(i);
      const originalIndent = strings.getLeadingWhitespace(lineContent);
      const originalSpacesCnt = indentUtils.getSpaceCnt(originalIndent, tabSize);
      const newSpacesCnt = originalSpacesCnt + offset;
      const newIndent = indentUtils.generateIndent(newSpacesCnt, tabSize, insertSpaces);
      if (newIndent !== originalIndent) {
        builder.addEditOperation(new Range(i, 1, i, originalIndent.length + 1), newIndent);
        if (i === s.endLineNumber && s.endColumn <= originalIndent.length + 1 && newIndent === "") {
          this._moveEndLineSelectionShrink = true;
        }
      }
    }
  }
  computeCursorState(model, helper) {
    let result = helper.getTrackedSelection(this._selectionId);
    if (this._moveEndPositionDown) {
      result = result.setEndPosition(result.endLineNumber + 1, 1);
    }
    if (this._moveEndLineSelectionShrink && result.startLineNumber < result.endLineNumber) {
      result = result.setEndPosition(result.endLineNumber, 2);
    }
    return result;
  }
};
MoveLinesCommand = __decorateClass([
  __decorateParam(3, ILanguageConfigurationService)
], MoveLinesCommand);
export {
  MoveLinesCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2xpbmVzT3BlcmF0aW9ucy9icm93c2VyL21vdmVMaW5lc0NvbW1hbmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgU2hpZnRDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbW1hbmRzL3NoaWZ0Q29tbWFuZC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmQsIElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSwgSUVkaXRPcGVyYXRpb25CdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENvbXBsZXRlRW50ZXJBY3Rpb24sIEluZGVudEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJbmRlbnRDb25zdHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL2luZGVudFJ1bGVzLmpzJztcbmltcG9ydCAqIGFzIGluZGVudFV0aWxzIGZyb20gJy4uLy4uL2luZGVudGF0aW9uL2NvbW1vbi9pbmRlbnRVdGlscy5qcyc7XG5pbXBvcnQgeyBnZXRHb29kSW5kZW50Rm9yTGluZSwgZ2V0SW5kZW50TWV0YWRhdGEsIElJbmRlbnRDb252ZXJ0ZXIsIElWaXJ0dWFsTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2F1dG9JbmRlbnQuanMnO1xuaW1wb3J0IHsgZ2V0RW50ZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2VudGVyQWN0aW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIE1vdmVMaW5lc0NvbW1hbmQgaW1wbGVtZW50cyBJQ29tbWFuZCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0aW9uOiBTZWxlY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzTW92aW5nRG93bjogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfYXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5O1xuXG5cdHByaXZhdGUgX3NlbGVjdGlvbklkOiBzdHJpbmcgfCBudWxsO1xuXHRwcml2YXRlIF9tb3ZlRW5kUG9zaXRpb25Eb3duPzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfbW92ZUVuZExpbmVTZWxlY3Rpb25TaHJpbms6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c2VsZWN0aW9uOiBTZWxlY3Rpb24sXG5cdFx0aXNNb3ZpbmdEb3duOiBib29sZWFuLFxuXHRcdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fc2VsZWN0aW9uID0gc2VsZWN0aW9uO1xuXHRcdHRoaXMuX2lzTW92aW5nRG93biA9IGlzTW92aW5nRG93bjtcblx0XHR0aGlzLl9hdXRvSW5kZW50ID0gYXV0b0luZGVudDtcblx0XHR0aGlzLl9zZWxlY3Rpb25JZCA9IG51bGw7XG5cdFx0dGhpcy5fbW92ZUVuZExpbmVTZWxlY3Rpb25TaHJpbmsgPSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVmlydHVhbE1vZGVsKFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdGxpbmVOdW1iZXJNYXBwZXI6IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IG51bWJlcixcblx0XHRjb250ZW50T3ZlcnJpZGU/OiAobGluZU51bWJlcjogbnVtYmVyKSA9PiBzdHJpbmcgfCB1bmRlZmluZWRcblx0KTogSVZpcnR1YWxNb2RlbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRva2VuaXphdGlvbjoge1xuXHRcdFx0XHRnZXRMaW5lVG9rZW5zOiAobGluZU51bWJlcikgPT4gbW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlck1hcHBlcihsaW5lTnVtYmVyKSksXG5cdFx0XHRcdGdldExhbmd1YWdlSWQ6ICgpID0+IG1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdFx0Z2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb246IChsaW5lTnVtYmVyLCBjb2x1bW4pID0+IG1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbilcblx0XHRcdH0sXG5cdFx0XHRnZXRMaW5lQ29udGVudDogKGxpbmVOdW1iZXIpID0+IHtcblx0XHRcdFx0Y29uc3QgY3VzdG9tQ29udGVudCA9IGNvbnRlbnRPdmVycmlkZT8uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRpZiAoY3VzdG9tQ29udGVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGN1c3RvbUNvbnRlbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXJNYXBwZXIobGluZU51bWJlcikpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWRpdE9wZXJhdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlcik6IHZvaWQge1xuXG5cdFx0Y29uc3QgbW9kZWxMaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblxuXHRcdGlmICh0aGlzLl9pc01vdmluZ0Rvd24gJiYgdGhpcy5fc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgPT09IG1vZGVsTGluZUNvdW50KSB7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25JZCA9IGJ1aWxkZXIudHJhY2tTZWxlY3Rpb24odGhpcy5fc2VsZWN0aW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9pc01vdmluZ0Rvd24gJiYgdGhpcy5fc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA9PT0gMSkge1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBidWlsZGVyLnRyYWNrU2VsZWN0aW9uKHRoaXMuX3NlbGVjdGlvbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbW92ZUVuZFBvc2l0aW9uRG93biA9IGZhbHNlO1xuXHRcdGxldCBzID0gdGhpcy5fc2VsZWN0aW9uO1xuXG5cdFx0aWYgKHMuc3RhcnRMaW5lTnVtYmVyIDwgcy5lbmRMaW5lTnVtYmVyICYmIHMuZW5kQ29sdW1uID09PSAxKSB7XG5cdFx0XHR0aGlzLl9tb3ZlRW5kUG9zaXRpb25Eb3duID0gdHJ1ZTtcblx0XHRcdHMgPSBzLnNldEVuZFBvc2l0aW9uKHMuZW5kTGluZU51bWJlciAtIDEsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocy5lbmRMaW5lTnVtYmVyIC0gMSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdGFiU2l6ZSwgaW5kZW50U2l6ZSwgaW5zZXJ0U3BhY2VzIH0gPSBtb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0Y29uc3QgaW5kZW50Q29udmVydGVyID0gdGhpcy5idWlsZEluZGVudENvbnZlcnRlcih0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMpO1xuXG5cdFx0aWYgKHMuc3RhcnRMaW5lTnVtYmVyID09PSBzLmVuZExpbmVOdW1iZXIgJiYgbW9kZWwuZ2V0TGluZU1heENvbHVtbihzLnN0YXJ0TGluZU51bWJlcikgPT09IDEpIHtcblx0XHRcdC8vIEN1cnJlbnQgbGluZSBpcyBlbXB0eVxuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHMuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3Qgb3RoZXJMaW5lTnVtYmVyID0gKHRoaXMuX2lzTW92aW5nRG93biA/IGxpbmVOdW1iZXIgKyAxIDogbGluZU51bWJlciAtIDEpO1xuXG5cdFx0XHRpZiAobW9kZWwuZ2V0TGluZU1heENvbHVtbihvdGhlckxpbmVOdW1iZXIpID09PSAxKSB7XG5cdFx0XHRcdC8vIE90aGVyIGxpbmUgbnVtYmVyIGlzIGVtcHR5IHRvbywgc28gbm8gZWRpdGluZyBpcyBuZWVkZWRcblx0XHRcdFx0Ly8gQWRkIGEgbm8tb3AgdG8gZm9yY2UgcnVubmluZyBieSB0aGUgbW9kZWxcblx0XHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgbnVsbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBUeXBlIGNvbnRlbnQgZnJvbSBvdGhlciBsaW5lIG51bWJlciBvbiBsaW5lIG51bWJlclxuXHRcdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24obmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIDEpLCBtb2RlbC5nZXRMaW5lQ29udGVudChvdGhlckxpbmVOdW1iZXIpKTtcblxuXHRcdFx0XHQvLyBSZW1vdmUgY29udGVudCBmcm9tIG90aGVyIGxpbmUgbnVtYmVyXG5cdFx0XHRcdGJ1aWxkZXIuYWRkRWRpdE9wZXJhdGlvbihuZXcgUmFuZ2Uob3RoZXJMaW5lTnVtYmVyLCAxLCBvdGhlckxpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ob3RoZXJMaW5lTnVtYmVyKSksIG51bGwpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVHJhY2sgc2VsZWN0aW9uIGF0IHRoZSBvdGhlciBsaW5lIG51bWJlclxuXHRcdFx0cyA9IG5ldyBTZWxlY3Rpb24ob3RoZXJMaW5lTnVtYmVyLCAxLCBvdGhlckxpbmVOdW1iZXIsIDEpO1xuXG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0bGV0IG1vdmluZ0xpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRcdGxldCBtb3ZpbmdMaW5lVGV4dDogc3RyaW5nO1xuXG5cdFx0XHRpZiAodGhpcy5faXNNb3ZpbmdEb3duKSB7XG5cdFx0XHRcdG1vdmluZ0xpbmVOdW1iZXIgPSBzLmVuZExpbmVOdW1iZXIgKyAxO1xuXHRcdFx0XHRtb3ZpbmdMaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KG1vdmluZ0xpbmVOdW1iZXIpO1xuXHRcdFx0XHQvLyBEZWxldGUgbGluZSB0aGF0IG5lZWRzIHRvIGJlIG1vdmVkXG5cdFx0XHRcdGJ1aWxkZXIuYWRkRWRpdE9wZXJhdGlvbihuZXcgUmFuZ2UobW92aW5nTGluZU51bWJlciAtIDEsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obW92aW5nTGluZU51bWJlciAtIDEpLCBtb3ZpbmdMaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKG1vdmluZ0xpbmVOdW1iZXIpKSwgbnVsbCk7XG5cblx0XHRcdFx0bGV0IGluc2VydGluZ1RleHQgPSBtb3ZpbmdMaW5lVGV4dDtcblxuXHRcdFx0XHRpZiAodGhpcy5zaG91bGRBdXRvSW5kZW50KG1vZGVsLCBzKSkge1xuXHRcdFx0XHRcdGNvbnN0IG1vdmluZ0xpbmVNYXRjaFJlc3VsdCA9IHRoaXMubWF0Y2hFbnRlclJ1bGUobW9kZWwsIGluZGVudENvbnZlcnRlciwgdGFiU2l6ZSwgbW92aW5nTGluZU51bWJlciwgcy5zdGFydExpbmVOdW1iZXIgLSAxKTtcblx0XHRcdFx0XHQvLyBpZiBzLnN0YXJ0TGluZU51bWJlciAtIDEgbWF0Y2hlcyBvbkVudGVyIHJ1bGUsIHdlIHN0aWxsIGhvbm9yIHRoYXQuXG5cdFx0XHRcdFx0aWYgKG1vdmluZ0xpbmVNYXRjaFJlc3VsdCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb2xkSW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KG1vdmluZ0xpbmVOdW1iZXIpKTtcblx0XHRcdFx0XHRcdGNvbnN0IG5ld1NwYWNlQ250ID0gbW92aW5nTGluZU1hdGNoUmVzdWx0ICsgaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQob2xkSW5kZW50YXRpb24sIHRhYlNpemUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbmV3SW5kZW50YXRpb24gPSBpbmRlbnRVdGlscy5nZW5lcmF0ZUluZGVudChuZXdTcGFjZUNudCwgdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzKTtcblx0XHRcdFx0XHRcdGluc2VydGluZ1RleHQgPSBuZXdJbmRlbnRhdGlvbiArIHRoaXMudHJpbVN0YXJ0KG1vdmluZ0xpbmVUZXh0KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gbm8gZW50ZXIgcnVsZSBtYXRjaGVzLCBsZXQncyBjaGVjayBpbmRlbnRhdGluIHJ1bGVzIHRoZW4uXG5cdFx0XHRcdFx0XHRjb25zdCB2aXJ0dWFsTW9kZWwgPSB0aGlzLmNyZWF0ZVZpcnR1YWxNb2RlbChcblx0XHRcdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0XHRcdChsaW5lTnVtYmVyKSA9PiBsaW5lTnVtYmVyID09PSBzLnN0YXJ0TGluZU51bWJlciA/IG1vdmluZ0xpbmVOdW1iZXIgOiBsaW5lTnVtYmVyXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5kZW50T2ZNb3ZpbmdMaW5lID0gZ2V0R29vZEluZGVudEZvckxpbmUoXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2F1dG9JbmRlbnQsXG5cdFx0XHRcdFx0XHRcdHZpcnR1YWxNb2RlbCxcblx0XHRcdFx0XHRcdFx0bW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obW92aW5nTGluZU51bWJlciwgMSksXG5cdFx0XHRcdFx0XHRcdHMuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRpbmRlbnRDb252ZXJ0ZXIsXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRpZiAoaW5kZW50T2ZNb3ZpbmdMaW5lICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9sZEluZGVudGF0aW9uID0gc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShtb2RlbC5nZXRMaW5lQ29udGVudChtb3ZpbmdMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5ld1NwYWNlQ250ID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQoaW5kZW50T2ZNb3ZpbmdMaW5lLCB0YWJTaXplKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2xkU3BhY2VDbnQgPSBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChvbGRJbmRlbnRhdGlvbiwgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChuZXdTcGFjZUNudCAhPT0gb2xkU3BhY2VDbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBuZXdJbmRlbnRhdGlvbiA9IGluZGVudFV0aWxzLmdlbmVyYXRlSW5kZW50KG5ld1NwYWNlQ250LCB0YWJTaXplLCBpbnNlcnRTcGFjZXMpO1xuXHRcdFx0XHRcdFx0XHRcdGluc2VydGluZ1RleHQgPSBuZXdJbmRlbnRhdGlvbiArIHRoaXMudHJpbVN0YXJ0KG1vdmluZ0xpbmVUZXh0KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGFkZCBlZGl0IG9wZXJhdGlvbnMgZm9yIG1vdmluZyBsaW5lIGZpcnN0IHRvIG1ha2Ugc3VyZSBpdCdzIGV4ZWN1dGVkIGFmdGVyIHdlIG1ha2UgaW5kZW50YXRpb24gY2hhbmdlXG5cdFx0XHRcdFx0Ly8gdG8gcy5zdGFydExpbmVOdW1iZXJcblx0XHRcdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24obmV3IFJhbmdlKHMuc3RhcnRMaW5lTnVtYmVyLCAxLCBzLnN0YXJ0TGluZU51bWJlciwgMSksIGluc2VydGluZ1RleHQgKyAnXFxuJyk7XG5cblx0XHRcdFx0XHRjb25zdCByZXQgPSB0aGlzLm1hdGNoRW50ZXJSdWxlTW92aW5nRG93bihtb2RlbCwgaW5kZW50Q29udmVydGVyLCB0YWJTaXplLCBzLnN0YXJ0TGluZU51bWJlciwgbW92aW5nTGluZU51bWJlciwgaW5zZXJ0aW5nVGV4dCk7XG5cblx0XHRcdFx0XHQvLyBjaGVjayBpZiB0aGUgbGluZSBiZWluZyBtb3ZlZCBiZWZvcmUgbWF0Y2hlcyBvbkVudGVyIHJ1bGVzLCBpZiBzbyBsZXQncyBhZGp1c3QgdGhlIGluZGVudGF0aW9uIGJ5IG9uRW50ZXIgcnVsZXMuXG5cdFx0XHRcdFx0aWYgKHJldCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0aWYgKHJldCAhPT0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmdldEluZGVudEVkaXRzT2ZNb3ZpbmdCbG9jayhtb2RlbCwgYnVpbGRlciwgcywgdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzLCByZXQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBpdCBkb2Vzbid0IG1hdGNoIG9uRW50ZXIgcnVsZXMsIGxldCdzIGNoZWNrIGluZGVudGF0aW9uIHJ1bGVzIHRoZW4uXG5cdFx0XHRcdFx0XHRjb25zdCB2aXJ0dWFsTW9kZWwgPSB0aGlzLmNyZWF0ZVZpcnR1YWxNb2RlbChcblx0XHRcdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0XHRcdChsaW5lTnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IHMuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBUT0RPQGFpZGF5LW1hcjogdGhlIHRva2VucyBoZXJlIGRvbid0IGNvcnJlc3BvbmQgZXhhY3RseSB0byB0aGUgY29ycmVzcG9uZGluZyBjb250ZW50IChhZnRlciBpbmRlbnRhdGlvbiBhZGp1c3RtZW50KSwgaGF2ZSB0byBmaXggdGhpcy5cblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBtb3ZpbmdMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAobGluZU51bWJlciA+PSBzLnN0YXJ0TGluZU51bWJlciArIDEgJiYgbGluZU51bWJlciA8PSBzLmVuZExpbmVOdW1iZXIgKyAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gbGluZU51bWJlciAtIDE7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBsaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0KGxpbmVOdW1iZXIpID0+IGxpbmVOdW1iZXIgPT09IHMuc3RhcnRMaW5lTnVtYmVyID8gaW5zZXJ0aW5nVGV4dCA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgbmV3SW5kZW50YXRPZk1vdmluZ0Jsb2NrID0gZ2V0R29vZEluZGVudEZvckxpbmUoXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2F1dG9JbmRlbnQsXG5cdFx0XHRcdFx0XHRcdHZpcnR1YWxNb2RlbCxcblx0XHRcdFx0XHRcdFx0bW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obW92aW5nTGluZU51bWJlciwgMSksXG5cdFx0XHRcdFx0XHRcdHMuc3RhcnRMaW5lTnVtYmVyICsgMSxcblx0XHRcdFx0XHRcdFx0aW5kZW50Q29udmVydGVyLFxuXHRcdFx0XHRcdFx0XHR0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHRpZiAobmV3SW5kZW50YXRPZk1vdmluZ0Jsb2NrICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9sZEluZGVudGF0aW9uID0gc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShtb2RlbC5nZXRMaW5lQ29udGVudChzLnN0YXJ0TGluZU51bWJlcikpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBuZXdTcGFjZUNudCA9IGluZGVudFV0aWxzLmdldFNwYWNlQ250KG5ld0luZGVudGF0T2ZNb3ZpbmdCbG9jaywgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9sZFNwYWNlQ250ID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQob2xkSW5kZW50YXRpb24sIHRhYlNpemUpO1xuXHRcdFx0XHRcdFx0XHRpZiAobmV3U3BhY2VDbnQgIT09IG9sZFNwYWNlQ250KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc3BhY2VDbnRPZmZzZXQgPSBuZXdTcGFjZUNudCAtIG9sZFNwYWNlQ250O1xuXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5nZXRJbmRlbnRFZGl0c09mTW92aW5nQmxvY2sobW9kZWwsIGJ1aWxkZXIsIHMsIHRhYlNpemUsIGluc2VydFNwYWNlcywgc3BhY2VDbnRPZmZzZXQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEluc2VydCBsaW5lIHRoYXQgbmVlZHMgdG8gYmUgbW92ZWQgYmVmb3JlXG5cdFx0XHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG5ldyBSYW5nZShzLnN0YXJ0TGluZU51bWJlciwgMSwgcy5zdGFydExpbmVOdW1iZXIsIDEpLCBpbnNlcnRpbmdUZXh0ICsgJ1xcbicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtb3ZpbmdMaW5lTnVtYmVyID0gcy5zdGFydExpbmVOdW1iZXIgLSAxO1xuXHRcdFx0XHRtb3ZpbmdMaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KG1vdmluZ0xpbmVOdW1iZXIpO1xuXG5cdFx0XHRcdC8vIERlbGV0ZSBsaW5lIHRoYXQgbmVlZHMgdG8gYmUgbW92ZWRcblx0XHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG5ldyBSYW5nZShtb3ZpbmdMaW5lTnVtYmVyLCAxLCBtb3ZpbmdMaW5lTnVtYmVyICsgMSwgMSksIG51bGwpO1xuXG5cdFx0XHRcdC8vIEluc2VydCBsaW5lIHRoYXQgbmVlZHMgdG8gYmUgbW92ZWQgYWZ0ZXJcblx0XHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG5ldyBSYW5nZShzLmVuZExpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocy5lbmRMaW5lTnVtYmVyKSwgcy5lbmRMaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHMuZW5kTGluZU51bWJlcikpLCAnXFxuJyArIG1vdmluZ0xpbmVUZXh0KTtcblxuXHRcdFx0XHRpZiAodGhpcy5zaG91bGRBdXRvSW5kZW50KG1vZGVsLCBzKSkge1xuXHRcdFx0XHRcdGNvbnN0IHZpcnR1YWxNb2RlbCA9IHRoaXMuY3JlYXRlVmlydHVhbE1vZGVsKFxuXHRcdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0XHQobGluZU51bWJlcikgPT4gbGluZU51bWJlciA9PT0gbW92aW5nTGluZU51bWJlciA/IHMuc3RhcnRMaW5lTnVtYmVyIDogbGluZU51bWJlclxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRjb25zdCByZXQgPSB0aGlzLm1hdGNoRW50ZXJSdWxlKG1vZGVsLCBpbmRlbnRDb252ZXJ0ZXIsIHRhYlNpemUsIHMuc3RhcnRMaW5lTnVtYmVyLCBzLnN0YXJ0TGluZU51bWJlciAtIDIpO1xuXHRcdFx0XHRcdC8vIGNoZWNrIGlmIHMuc3RhcnRMaW5lTnVtYmVyIC0gMiBtYXRjaGVzIG9uRW50ZXIgcnVsZXMsIGlmIHNvIGFkanVzdCB0aGUgbW92aW5nIGJsb2NrIGJ5IG9uRW50ZXIgcnVsZXMuXG5cdFx0XHRcdFx0aWYgKHJldCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0aWYgKHJldCAhPT0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmdldEluZGVudEVkaXRzT2ZNb3ZpbmdCbG9jayhtb2RlbCwgYnVpbGRlciwgcywgdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzLCByZXQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBpdCBkb2Vzbid0IG1hdGNoIGFueSBvbkVudGVyIHJ1bGUsIGxldCdzIGNoZWNrIGluZGVudGF0aW9uIHJ1bGVzIHRoZW4uXG5cdFx0XHRcdFx0XHRjb25zdCBpbmRlbnRPZkZpcnN0TGluZSA9IGdldEdvb2RJbmRlbnRGb3JMaW5lKFxuXHRcdFx0XHRcdFx0XHR0aGlzLl9hdXRvSW5kZW50LFxuXHRcdFx0XHRcdFx0XHR2aXJ0dWFsTW9kZWwsXG5cdFx0XHRcdFx0XHRcdG1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKHMuc3RhcnRMaW5lTnVtYmVyLCAxKSxcblx0XHRcdFx0XHRcdFx0bW92aW5nTGluZU51bWJlcixcblx0XHRcdFx0XHRcdFx0aW5kZW50Q29udmVydGVyLFxuXHRcdFx0XHRcdFx0XHR0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0aWYgKGluZGVudE9mRmlyc3RMaW5lICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGFkanVzdCB0aGUgaW5kZW50YXRpb24gb2YgdGhlIG1vdmluZyBibG9ja1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvbGRJbmRlbnQgPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KHMuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5ld1NwYWNlQ250ID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQoaW5kZW50T2ZGaXJzdExpbmUsIHRhYlNpemUpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvbGRTcGFjZUNudCA9IGluZGVudFV0aWxzLmdldFNwYWNlQ250KG9sZEluZGVudCwgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChuZXdTcGFjZUNudCAhPT0gb2xkU3BhY2VDbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBzcGFjZUNudE9mZnNldCA9IG5ld1NwYWNlQ250IC0gb2xkU3BhY2VDbnQ7XG5cblx0XHRcdFx0XHRcdFx0XHR0aGlzLmdldEluZGVudEVkaXRzT2ZNb3ZpbmdCbG9jayhtb2RlbCwgYnVpbGRlciwgcywgdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzLCBzcGFjZUNudE9mZnNldCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9zZWxlY3Rpb25JZCA9IGJ1aWxkZXIudHJhY2tTZWxlY3Rpb24ocyk7XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkSW5kZW50Q29udmVydGVyKHRhYlNpemU6IG51bWJlciwgaW5kZW50U2l6ZTogbnVtYmVyLCBpbnNlcnRTcGFjZXM6IGJvb2xlYW4pOiBJSW5kZW50Q29udmVydGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2hpZnRJbmRlbnQ6IChpbmRlbnRhdGlvbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gU2hpZnRDb21tYW5kLnNoaWZ0SW5kZW50KGluZGVudGF0aW9uLCBpbmRlbnRhdGlvbi5sZW5ndGggKyAxLCB0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMpO1xuXHRcdFx0fSxcblx0XHRcdHVuc2hpZnRJbmRlbnQ6IChpbmRlbnRhdGlvbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gU2hpZnRDb21tYW5kLnVuc2hpZnRJbmRlbnQoaW5kZW50YXRpb24sIGluZGVudGF0aW9uLmxlbmd0aCArIDEsIHRhYlNpemUsIGluZGVudFNpemUsIGluc2VydFNwYWNlcyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VFbnRlclJlc3VsdChtb2RlbDogSVRleHRNb2RlbCwgaW5kZW50Q29udmVydGVyOiBJSW5kZW50Q29udmVydGVyLCB0YWJTaXplOiBudW1iZXIsIGxpbmU6IG51bWJlciwgZW50ZXI6IENvbXBsZXRlRW50ZXJBY3Rpb24gfCBudWxsKSB7XG5cdFx0aWYgKGVudGVyKSB7XG5cdFx0XHRsZXQgZW50ZXJQcmVmaXggPSBlbnRlci5pbmRlbnRhdGlvbjtcblxuXHRcdFx0aWYgKGVudGVyLmluZGVudEFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLk5vbmUpIHtcblx0XHRcdFx0ZW50ZXJQcmVmaXggPSBlbnRlci5pbmRlbnRhdGlvbiArIGVudGVyLmFwcGVuZFRleHQ7XG5cdFx0XHR9IGVsc2UgaWYgKGVudGVyLmluZGVudEFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLkluZGVudCkge1xuXHRcdFx0XHRlbnRlclByZWZpeCA9IGVudGVyLmluZGVudGF0aW9uICsgZW50ZXIuYXBwZW5kVGV4dDtcblx0XHRcdH0gZWxzZSBpZiAoZW50ZXIuaW5kZW50QWN0aW9uID09PSBJbmRlbnRBY3Rpb24uSW5kZW50T3V0ZGVudCkge1xuXHRcdFx0XHRlbnRlclByZWZpeCA9IGVudGVyLmluZGVudGF0aW9uO1xuXHRcdFx0fSBlbHNlIGlmIChlbnRlci5pbmRlbnRBY3Rpb24gPT09IEluZGVudEFjdGlvbi5PdXRkZW50KSB7XG5cdFx0XHRcdGVudGVyUHJlZml4ID0gaW5kZW50Q29udmVydGVyLnVuc2hpZnRJbmRlbnQoZW50ZXIuaW5kZW50YXRpb24pICsgZW50ZXIuYXBwZW5kVGV4dDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1vdmluZ0xpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZSk7XG5cdFx0XHRpZiAodGhpcy50cmltU3RhcnQobW92aW5nTGluZVRleHQpLmluZGV4T2YodGhpcy50cmltU3RhcnQoZW50ZXJQcmVmaXgpKSA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IG9sZEluZGVudGF0aW9uID0gc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lKSk7XG5cdFx0XHRcdGxldCBuZXdJbmRlbnRhdGlvbiA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UoZW50ZXJQcmVmaXgpO1xuXHRcdFx0XHRjb25zdCBpbmRlbnRNZXRhZGF0YU9mTW92ZWxpbmdMaW5lID0gZ2V0SW5kZW50TWV0YWRhdGEobW9kZWwsIGxpbmUsIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRpZiAoaW5kZW50TWV0YWRhdGFPZk1vdmVsaW5nTGluZSAhPT0gbnVsbCAmJiBpbmRlbnRNZXRhZGF0YU9mTW92ZWxpbmdMaW5lICYgSW5kZW50Q29uc3RzLkRFQ1JFQVNFX01BU0spIHtcblx0XHRcdFx0XHRuZXdJbmRlbnRhdGlvbiA9IGluZGVudENvbnZlcnRlci51bnNoaWZ0SW5kZW50KG5ld0luZGVudGF0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuZXdTcGFjZUNudCA9IGluZGVudFV0aWxzLmdldFNwYWNlQ250KG5ld0luZGVudGF0aW9uLCB0YWJTaXplKTtcblx0XHRcdFx0Y29uc3Qgb2xkU3BhY2VDbnQgPSBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChvbGRJbmRlbnRhdGlvbiwgdGFiU2l6ZSk7XG5cdFx0XHRcdHJldHVybiBuZXdTcGFjZUNudCAtIG9sZFNwYWNlQ250O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0LyoqXG5cdCAqXG5cdCAqIEBwYXJhbSBtb2RlbFxuXHQgKiBAcGFyYW0gaW5kZW50Q29udmVydGVyXG5cdCAqIEBwYXJhbSB0YWJTaXplXG5cdCAqIEBwYXJhbSBsaW5lIHRoZSBsaW5lIG1vdmluZyBkb3duXG5cdCAqIEBwYXJhbSBmdXR1cmVBYm92ZUxpbmVOdW1iZXIgdGhlIGxpbmUgd2hpY2ggd2lsbCBiZSBhdCB0aGUgYGxpbmVgIHBvc2l0aW9uXG5cdCAqIEBwYXJhbSBmdXR1cmVBYm92ZUxpbmVUZXh0XG5cdCAqL1xuXHRwcml2YXRlIG1hdGNoRW50ZXJSdWxlTW92aW5nRG93bihtb2RlbDogSVRleHRNb2RlbCwgaW5kZW50Q29udmVydGVyOiBJSW5kZW50Q29udmVydGVyLCB0YWJTaXplOiBudW1iZXIsIGxpbmU6IG51bWJlciwgZnV0dXJlQWJvdmVMaW5lTnVtYmVyOiBudW1iZXIsIGZ1dHVyZUFib3ZlTGluZVRleHQ6IHN0cmluZykge1xuXHRcdGlmIChzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgoZnV0dXJlQWJvdmVMaW5lVGV4dCkgPj0gMCkge1xuXHRcdFx0Ly8gYnJlYWtcblx0XHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4oZnV0dXJlQWJvdmVMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGVudGVyID0gZ2V0RW50ZXJBY3Rpb24odGhpcy5fYXV0b0luZGVudCwgbW9kZWwsIG5ldyBSYW5nZShmdXR1cmVBYm92ZUxpbmVOdW1iZXIsIG1heENvbHVtbiwgZnV0dXJlQWJvdmVMaW5lTnVtYmVyLCBtYXhDb2x1bW4pLCB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdHJldHVybiB0aGlzLnBhcnNlRW50ZXJSZXN1bHQobW9kZWwsIGluZGVudENvbnZlcnRlciwgdGFiU2l6ZSwgbGluZSwgZW50ZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBnbyB1cHdhcmRzLCBzdGFydGluZyBmcm9tIGBsaW5lIC0gMWBcblx0XHRcdGxldCB2YWxpZFByZWNlZGluZ0xpbmUgPSBsaW5lIC0gMTtcblx0XHRcdHdoaWxlICh2YWxpZFByZWNlZGluZ0xpbmUgPj0gMSkge1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHZhbGlkUHJlY2VkaW5nTGluZSk7XG5cdFx0XHRcdGNvbnN0IG5vbldoaXRlc3BhY2VJZHggPSBzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgobGluZUNvbnRlbnQpO1xuXG5cdFx0XHRcdGlmIChub25XaGl0ZXNwYWNlSWR4ID49IDApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHZhbGlkUHJlY2VkaW5nTGluZS0tO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmFsaWRQcmVjZWRpbmdMaW5lIDwgMSB8fCBsaW5lID4gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4odmFsaWRQcmVjZWRpbmdMaW5lKTtcblx0XHRcdGNvbnN0IGVudGVyID0gZ2V0RW50ZXJBY3Rpb24odGhpcy5fYXV0b0luZGVudCwgbW9kZWwsIG5ldyBSYW5nZSh2YWxpZFByZWNlZGluZ0xpbmUsIG1heENvbHVtbiwgdmFsaWRQcmVjZWRpbmdMaW5lLCBtYXhDb2x1bW4pLCB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdHJldHVybiB0aGlzLnBhcnNlRW50ZXJSZXN1bHQobW9kZWwsIGluZGVudENvbnZlcnRlciwgdGFiU2l6ZSwgbGluZSwgZW50ZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hFbnRlclJ1bGUobW9kZWw6IElUZXh0TW9kZWwsIGluZGVudENvbnZlcnRlcjogSUluZGVudENvbnZlcnRlciwgdGFiU2l6ZTogbnVtYmVyLCBsaW5lOiBudW1iZXIsIG9uZUxpbmVBYm92ZTogbnVtYmVyLCBwcmV2aW91c0xpbmVUZXh0Pzogc3RyaW5nKSB7XG5cdFx0bGV0IHZhbGlkUHJlY2VkaW5nTGluZSA9IG9uZUxpbmVBYm92ZTtcblx0XHR3aGlsZSAodmFsaWRQcmVjZWRpbmdMaW5lID49IDEpIHtcblx0XHRcdC8vIHNoaXAgZW1wdHkgbGluZXMgYXMgZW1wdHkgbGluZXMganVzdCBpbmhlcml0IGluZGVudGF0aW9uXG5cdFx0XHRsZXQgbGluZUNvbnRlbnQ7XG5cdFx0XHRpZiAodmFsaWRQcmVjZWRpbmdMaW5lID09PSBvbmVMaW5lQWJvdmUgJiYgcHJldmlvdXNMaW5lVGV4dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGxpbmVDb250ZW50ID0gcHJldmlvdXNMaW5lVGV4dDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQodmFsaWRQcmVjZWRpbmdMaW5lKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgbm9uV2hpdGVzcGFjZUlkeCA9IHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lQ29udGVudCk7XG5cdFx0XHRpZiAobm9uV2hpdGVzcGFjZUlkeCA+PSAwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0dmFsaWRQcmVjZWRpbmdMaW5lLS07XG5cdFx0fVxuXG5cdFx0aWYgKHZhbGlkUHJlY2VkaW5nTGluZSA8IDEgfHwgbGluZSA+IG1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBtYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHZhbGlkUHJlY2VkaW5nTGluZSk7XG5cdFx0Y29uc3QgZW50ZXIgPSBnZXRFbnRlckFjdGlvbih0aGlzLl9hdXRvSW5kZW50LCBtb2RlbCwgbmV3IFJhbmdlKHZhbGlkUHJlY2VkaW5nTGluZSwgbWF4Q29sdW1uLCB2YWxpZFByZWNlZGluZ0xpbmUsIG1heENvbHVtbiksIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHJldHVybiB0aGlzLnBhcnNlRW50ZXJSZXN1bHQobW9kZWwsIGluZGVudENvbnZlcnRlciwgdGFiU2l6ZSwgbGluZSwgZW50ZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmltU3RhcnQoc3RyOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrLywgJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRBdXRvSW5kZW50KG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbikge1xuXHRcdGlmICh0aGlzLl9hdXRvSW5kZW50IDwgRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gaWYgaXQncyBub3QgZWFzeSB0byB0b2tlbml6ZSwgd2Ugc3RvcCBhdXRvIGluZGVudC5cblx0XHRpZiAoIW1vZGVsLnRva2VuaXphdGlvbi5pc0NoZWFwVG9Ub2tlbml6ZShzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBsYW5ndWFnZUF0U2VsZWN0aW9uU3RhcnQgPSBtb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRjb25zdCBsYW5ndWFnZUF0U2VsZWN0aW9uRW5kID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24oc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsIDEpO1xuXG5cdFx0aWYgKGxhbmd1YWdlQXRTZWxlY3Rpb25TdGFydCAhPT0gbGFuZ3VhZ2VBdFNlbGVjdGlvbkVuZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUF0U2VsZWN0aW9uU3RhcnQpLmluZGVudFJ1bGVzU3VwcG9ydCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJbmRlbnRFZGl0c09mTW92aW5nQmxvY2sobW9kZWw6IElUZXh0TW9kZWwsIGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlciwgczogU2VsZWN0aW9uLCB0YWJTaXplOiBudW1iZXIsIGluc2VydFNwYWNlczogYm9vbGVhbiwgb2Zmc2V0OiBudW1iZXIpIHtcblx0XHRmb3IgKGxldCBpID0gcy5zdGFydExpbmVOdW1iZXI7IGkgPD0gcy5lbmRMaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoaSk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbEluZGVudCA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobGluZUNvbnRlbnQpO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTcGFjZXNDbnQgPSBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChvcmlnaW5hbEluZGVudCwgdGFiU2l6ZSk7XG5cdFx0XHRjb25zdCBuZXdTcGFjZXNDbnQgPSBvcmlnaW5hbFNwYWNlc0NudCArIG9mZnNldDtcblx0XHRcdGNvbnN0IG5ld0luZGVudCA9IGluZGVudFV0aWxzLmdlbmVyYXRlSW5kZW50KG5ld1NwYWNlc0NudCwgdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzKTtcblxuXHRcdFx0aWYgKG5ld0luZGVudCAhPT0gb3JpZ2luYWxJbmRlbnQpIHtcblx0XHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG5ldyBSYW5nZShpLCAxLCBpLCBvcmlnaW5hbEluZGVudC5sZW5ndGggKyAxKSwgbmV3SW5kZW50KTtcblxuXHRcdFx0XHRpZiAoaSA9PT0gcy5lbmRMaW5lTnVtYmVyICYmIHMuZW5kQ29sdW1uIDw9IG9yaWdpbmFsSW5kZW50Lmxlbmd0aCArIDEgJiYgbmV3SW5kZW50ID09PSAnJykge1xuXHRcdFx0XHRcdC8vIGFzIHVzZXJzIHNlbGVjdCBwYXJ0IG9mIHRoZSBvcmlnaW5hbCBpbmRlbnQgd2hpdGUgc3BhY2VzXG5cdFx0XHRcdFx0Ly8gd2hlbiB3ZSBhZGp1c3QgdGhlIGluZGVudGF0aW9uIG9mIGVuZExpbmUsIHdlIHNob3VsZCBhZGp1c3QgdGhlIGN1cnNvciBwb3NpdGlvbiBhcyB3ZWxsLlxuXHRcdFx0XHRcdHRoaXMuX21vdmVFbmRMaW5lU2VsZWN0aW9uU2hyaW5rID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNvbXB1dGVDdXJzb3JTdGF0ZShtb2RlbDogSVRleHRNb2RlbCwgaGVscGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEpOiBTZWxlY3Rpb24ge1xuXHRcdGxldCByZXN1bHQgPSBoZWxwZXIuZ2V0VHJhY2tlZFNlbGVjdGlvbih0aGlzLl9zZWxlY3Rpb25JZCEpO1xuXG5cdFx0aWYgKHRoaXMuX21vdmVFbmRQb3NpdGlvbkRvd24pIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5zZXRFbmRQb3NpdGlvbihyZXN1bHQuZW5kTGluZU51bWJlciArIDEsIDEpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9tb3ZlRW5kTGluZVNlbGVjdGlvblNocmluayAmJiByZXN1bHQuc3RhcnRMaW5lTnVtYmVyIDwgcmVzdWx0LmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5zZXRFbmRQb3NpdGlvbihyZXN1bHQuZW5kTGluZU51bWJlciwgMik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLGFBQWE7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBRzFCLFNBQThCLG9CQUFvQjtBQUNsRCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG9CQUFvQjtBQUM3QixZQUFZLGlCQUFpQjtBQUM3QixTQUFTLHNCQUFzQix5QkFBMEQ7QUFDekYsU0FBUyxzQkFBc0I7QUFFeEIsSUFBTSxtQkFBTixNQUEyQztBQUFBLEVBVWpELFlBQ0MsV0FDQSxjQUNBLFlBQ2dELCtCQUMvQztBQUQrQztBQUVoRCxTQUFLLGFBQWE7QUFDbEIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxjQUFjO0FBQ25CLFNBQUssZUFBZTtBQUNwQixTQUFLLDhCQUE4QjtBQUFBLEVBQ3BDO0FBQUEsRUFFUSxtQkFDUCxPQUNBLGtCQUNBLGlCQUNnQjtBQUNoQixXQUFPO0FBQUEsTUFDTixjQUFjO0FBQUEsUUFDYixlQUFlLENBQUMsZUFBZSxNQUFNLGFBQWEsY0FBYyxpQkFBaUIsVUFBVSxDQUFDO0FBQUEsUUFDNUYsZUFBZSxNQUFNLE1BQU0sY0FBYztBQUFBLFFBQ3pDLHlCQUF5QixDQUFDLFlBQVksV0FBVyxNQUFNLHdCQUF3QixZQUFZLE1BQU07QUFBQSxNQUNsRztBQUFBLE1BQ0EsZ0JBQWdCLENBQUMsZUFBZTtBQUMvQixjQUFNLGdCQUFnQixrQkFBa0IsVUFBVTtBQUNsRCxZQUFJLGtCQUFrQixRQUFXO0FBQ2hDLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGVBQU8sTUFBTSxl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
