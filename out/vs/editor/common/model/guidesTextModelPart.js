import { findLast } from "../../../base/common/arraysFind.js";
import * as strings from "../../../base/common/strings.js";
import { CursorColumns } from "../core/cursorColumns.js";
import { Range } from "../core/range.js";
import { TextModelPart } from "./textModelPart.js";
import { computeIndentLevel } from "./utils.js";
import { HorizontalGuidesState, IndentGuide, IndentGuideHorizontalLine } from "../textModelGuides.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
class GuidesTextModelPart extends TextModelPart {
  constructor(textModel, languageConfigurationService) {
    super();
    this.textModel = textModel;
    this.languageConfigurationService = languageConfigurationService;
  }
  getLanguageConfiguration(languageId) {
    return this.languageConfigurationService.getLanguageConfiguration(
      languageId
    );
  }
  _computeIndentLevel(lineIndex) {
    return computeIndentLevel(
      this.textModel.getLineContent(lineIndex + 1),
      this.textModel.getOptions().tabSize
    );
  }
  getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber) {
    this.assertNotDisposed();
    const lineCount = this.textModel.getLineCount();
    if (lineNumber < 1 || lineNumber > lineCount) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    const foldingRules = this.getLanguageConfiguration(
      this.textModel.getLanguageId()
    ).foldingRules;
    const offSide = Boolean(foldingRules && foldingRules.offSide);
    let up_aboveContentLineIndex = -2;
    let up_aboveContentLineIndent = -1;
    let up_belowContentLineIndex = -2;
    let up_belowContentLineIndent = -1;
    const up_resolveIndents = (lineNumber2) => {
      if (up_aboveContentLineIndex !== -1 && (up_aboveContentLineIndex === -2 || up_aboveContentLineIndex > lineNumber2 - 1)) {
        up_aboveContentLineIndex = -1;
        up_aboveContentLineIndent = -1;
        for (let lineIndex = lineNumber2 - 2; lineIndex >= 0; lineIndex--) {
          const indent2 = this._computeIndentLevel(lineIndex);
          if (indent2 >= 0) {
            up_aboveContentLineIndex = lineIndex;
            up_aboveContentLineIndent = indent2;
            break;
          }
        }
      }
      if (up_belowContentLineIndex === -2) {
        up_belowContentLineIndex = -1;
        up_belowContentLineIndent = -1;
        for (let lineIndex = lineNumber2; lineIndex < lineCount; lineIndex++) {
          const indent2 = this._computeIndentLevel(lineIndex);
          if (indent2 >= 0) {
            up_belowContentLineIndex = lineIndex;
            up_belowContentLineIndent = indent2;
            break;
          }
        }
      }
    };
    let down_aboveContentLineIndex = -2;
    let down_aboveContentLineIndent = -1;
    let down_belowContentLineIndex = -2;
    let down_belowContentLineIndent = -1;
    const down_resolveIndents = (lineNumber2) => {
      if (down_aboveContentLineIndex === -2) {
        down_aboveContentLineIndex = -1;
        down_aboveContentLineIndent = -1;
        for (let lineIndex = lineNumber2 - 2; lineIndex >= 0; lineIndex--) {
          const indent2 = this._computeIndentLevel(lineIndex);
          if (indent2 >= 0) {
            down_aboveContentLineIndex = lineIndex;
            down_aboveContentLineIndent = indent2;
            break;
          }
        }
      }
      if (down_belowContentLineIndex !== -1 && (down_belowContentLineIndex === -2 || down_belowContentLineIndex < lineNumber2 - 1)) {
        down_belowContentLineIndex = -1;
        down_belowContentLineIndent = -1;
        for (let lineIndex = lineNumber2; lineIndex < lineCount; lineIndex++) {
          const indent2 = this._computeIndentLevel(lineIndex);
          if (indent2 >= 0) {
            down_belowContentLineIndex = lineIndex;
            down_belowContentLineIndent = indent2;
            break;
          }
        }
      }
    };
    let startLineNumber = 0;
    let goUp = true;
    let endLineNumber = 0;
    let goDown = true;
    let indent = 0;
    let initialIndent = 0;
    for (let distance = 0; goUp || goDown; distance++) {
      const upLineNumber = lineNumber - distance;
      const downLineNumber = lineNumber + distance;
      if (distance > 1 && (upLineNumber < 1 || upLineNumber < minLineNumber)) {
        goUp = false;
      }
      if (distance > 1 && (downLineNumber > lineCount || downLineNumber > maxLineNumber)) {
        goDown = false;
      }
      if (distance > 5e4) {
        goUp = false;
        goDown = false;
      }
      let upLineIndentLevel = -1;
      if (goUp && upLineNumber >= 1) {
        const currentIndent = this._computeIndentLevel(upLineNumber - 1);
        if (currentIndent >= 0) {
          up_belowContentLineIndex = upLineNumber - 1;
          up_belowContentLineIndent = currentIndent;
          upLineIndentLevel = Math.ceil(
            currentIndent / this.textModel.getOptions().indentSize
          );
        } else {
          up_resolveIndents(upLineNumber);
          upLineIndentLevel = this._getIndentLevelForWhitespaceLine(
            offSide,
            up_aboveContentLineIndent,
            up_belowContentLineIndent
          );
        }
      }
      let downLineIndentLevel = -1;
      if (goDown && downLineNumber <= lineCount) {
        const currentIndent = this._computeIndentLevel(downLineNumber - 1);
        if (currentIndent >= 0) {
          down_aboveContentLineIndex = downLineNumber - 1;
          down_aboveContentLineIndent = currentIndent;
          downLineIndentLevel = Math.ceil(
            currentIndent / this.textModel.getOptions().indentSize
          );
        } else {
          down_resolveIndents(downLineNumber);
          downLineIndentLevel = this._getIndentLevelForWhitespaceLine(
            offSide,
            down_aboveContentLineIndent,
            down_belowContentLineIndent
          );
        }
      }
      if (distance === 0) {
        initialIndent = upLineIndentLevel;
        continue;
      }
      if (distance === 1) {
        if (downLineNumber <= lineCount && downLineIndentLevel >= 0 && initialIndent + 1 === downLineIndentLevel) {
          goUp = false;
          startLineNumber = downLineNumber;
          endLineNumber = downLineNumber;
          indent = downLineIndentLevel;
          continue;
        }
        if (upLineNumber >= 1 && upLineIndentLevel >= 0 && upLineIndentLevel - 1 === initialIndent) {
          goDown = false;
          startLineNumber = upLineNumber;
          endLineNumber = upLineNumber;
          indent = upLineIndentLevel;
          continue;
        }
        startLineNumber = lineNumber;
        endLineNumber = lineNumber;
        indent = initialIndent;
        if (indent === 0) {
          return { startLineNumber, endLineNumber, indent };
        }
      }
      if (goUp) {
        if (upLineIndentLevel >= indent) {
          startLineNumber = upLineNumber;
        } else {
          goUp = false;
        }
      }
      if (goDown) {
        if (downLineIndentLevel >= indent) {
          endLineNumber = downLineNumber;
        } else {
          goDown = false;
        }
      }
    }
    return { startLineNumber, endLineNumber, indent };
  }
  getLinesBracketGuides(startLineNumber, endLineNumber, activePosition, options) {
    const result = [];
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      result.push([]);
    }
    const includeSingleLinePairs = true;
    const bracketPairs = this.textModel.bracketPairs.getBracketPairsInRangeWithMinIndentation(
      new Range(
        startLineNumber,
        1,
        endLineNumber,
        this.textModel.getLineMaxColumn(endLineNumber)
      )
    ).toArray();
    let activeBracketPairRange = void 0;
    if (activePosition && bracketPairs.length > 0) {
      const bracketsContainingActivePosition = (startLineNumber <= activePosition.lineNumber && activePosition.lineNumber <= endLineNumber ? bracketPairs : this.textModel.bracketPairs.getBracketPairsInRange(
        Range.fromPositions(activePosition)
      ).toArray()).filter((bp) => Range.strictContainsPosition(bp.range, activePosition));
      activeBracketPairRange = findLast(
        bracketsContainingActivePosition,
        (i) => includeSingleLinePairs || i.range.startLineNumber !== i.range.endLineNumber
      )?.range;
    }
    const independentColorPoolPerBracketType = this.textModel.getOptions().bracketPairColorizationOptions.independentColorPoolPerBracketType;
    const colorProvider = new BracketPairGuidesClassNames();
    for (const pair of bracketPairs) {
      if (!pair.closingBracketRange) {
        continue;
      }
      const isActive = activeBracketPairRange && pair.range.equalsRange(activeBracketPairRange);
      if (!isActive && !options.includeInactive) {
        continue;
      }
      const className = colorProvider.getInlineClassName(pair.nestingLevel, pair.nestingLevelOfEqualBracketType, independentColorPoolPerBracketType) + (options.highlightActive && isActive ? " " + colorProvider.activeClassName : "");
      const start = pair.openingBracketRange.getStartPosition();
      const end = pair.closingBracketRange.getStartPosition();
      const horizontalGuides = options.horizontalGuides === HorizontalGuidesState.Enabled || options.horizontalGuides === HorizontalGuidesState.EnabledForActive && isActive;
      if (pair.range.startLineNumber === pair.range.endLineNumber) {
        if (includeSingleLinePairs && horizontalGuides) {
          result[pair.range.startLineNumber - startLineNumber].push(
            new IndentGuide(
              -1,
              pair.openingBracketRange.getEndPosition().column,
              className,
              new IndentGuideHorizontalLine(false, end.column),
              -1,
              -1
            )
          );
        }
        continue;
      }
      const endVisibleColumn = this.getVisibleColumnFromPosition(end);
      const startVisibleColumn = this.getVisibleColumnFromPosition(
        pair.openingBracketRange.getStartPosition()
      );
      const guideVisibleColumn = Math.min(startVisibleColumn, endVisibleColumn, pair.minVisibleColumnIndentation + 1);
      let renderHorizontalEndLineAtTheBottom = false;
      const firstNonWsIndex = strings.firstNonWhitespaceIndex(
        this.textModel.getLineContent(
          pair.closingBracketRange.startLineNumber
        )
      );
      const hasTextBeforeClosingBracket = firstNonWsIndex < pair.closingBracketRange.startColumn - 1;
      if (hasTextBeforeClosingBracket) {
        renderHorizontalEndLineAtTheBottom = true;
      }
      const visibleGuideStartLineNumber = Math.max(start.lineNumber, startLineNumber);
      const visibleGuideEndLineNumber = Math.min(end.lineNumber, endLineNumber);
      const offset = renderHorizontalEndLineAtTheBottom ? 1 : 0;
      for (let l = visibleGuideStartLineNumber; l < visibleGuideEndLineNumber + offset; l++) {
        result[l - startLineNumber].push(
          new IndentGuide(
            guideVisibleColumn,
            -1,
            className,
            null,
            l === start.lineNumber ? start.column : -1,
            l === end.lineNumber ? end.column : -1
          )
        );
      }
      if (horizontalGuides) {
        if (start.lineNumber >= startLineNumber && startVisibleColumn > guideVisibleColumn) {
          result[start.lineNumber - startLineNumber].push(
            new IndentGuide(
              guideVisibleColumn,
              -1,
              className,
              new IndentGuideHorizontalLine(false, start.column),
              -1,
              -1
            )
          );
        }
        if (end.lineNumber <= endLineNumber && endVisibleColumn > guideVisibleColumn) {
          result[end.lineNumber - startLineNumber].push(
            new IndentGuide(
              guideVisibleColumn,
              -1,
              className,
              new IndentGuideHorizontalLine(!renderHorizontalEndLineAtTheBottom, end.column),
              -1,
              -1
            )
          );
        }
      }
    }
    for (const guides of result) {
      guides.sort((a, b) => a.visibleColumn - b.visibleColumn);
    }
    return result;
  }
  getVisibleColumnFromPosition(position) {
    return CursorColumns.visibleColumnFromColumn(
      this.textModel.getLineContent(position.lineNumber),
      position.column,
      this.textModel.getOptions().tabSize
    ) + 1;
  }
  getLinesIndentGuides(startLineNumber, endLineNumber) {
    this.assertNotDisposed();
    const lineCount = this.textModel.getLineCount();
    if (startLineNumber < 1 || startLineNumber > lineCount) {
      throw new Error("Illegal value for startLineNumber");
    }
    if (endLineNumber < 1 || endLineNumber > lineCount) {
      throw new Error("Illegal value for endLineNumber");
    }
    const options = this.textModel.getOptions();
    const foldingRules = this.getLanguageConfiguration(
      this.textModel.getLanguageId()
    ).foldingRules;
    const offSide = Boolean(foldingRules && foldingRules.offSide);
    const result = new Array(
      endLineNumber - startLineNumber + 1
    );
    let aboveContentLineIndex = -2;
    let aboveContentLineIndent = -1;
    let belowContentLineIndex = -2;
    let belowContentLineIndent = -1;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const resultIndex = lineNumber - startLineNumber;
      const currentIndent = this._computeIndentLevel(lineNumber - 1);
      if (currentIndent >= 0) {
        aboveContentLineIndex = lineNumber - 1;
        aboveContentLineIndent = currentIndent;
        result[resultIndex] = Math.ceil(currentIndent / options.indentSize);
        continue;
      }
      if (aboveContentLineIndex === -2) {
        aboveContentLineIndex = -1;
        aboveContentLineIndent = -1;
        for (let lineIndex = lineNumber - 2; lineIndex >= 0; lineIndex--) {
          const indent = this._computeIndentLevel(lineIndex);
          if (indent >= 0) {
            aboveContentLineIndex = lineIndex;
            aboveContentLineIndent = indent;
            break;
          }
        }
      }
      if (belowContentLineIndex !== -1 && (belowContentLineIndex === -2 || belowContentLineIndex < lineNumber - 1)) {
        belowContentLineIndex = -1;
        belowContentLineIndent = -1;
        for (let lineIndex = lineNumber; lineIndex < lineCount; lineIndex++) {
          const indent = this._computeIndentLevel(lineIndex);
          if (indent >= 0) {
            belowContentLineIndex = lineIndex;
            belowContentLineIndent = indent;
            break;
          }
        }
      }
      result[resultIndex] = this._getIndentLevelForWhitespaceLine(
        offSide,
        aboveContentLineIndent,
        belowContentLineIndent
      );
    }
    return result;
  }
  _getIndentLevelForWhitespaceLine(offSide, aboveContentLineIndent, belowContentLineIndent) {
    const options = this.textModel.getOptions();
    if (aboveContentLineIndent === -1 || belowContentLineIndent === -1) {
      return 0;
    } else if (aboveContentLineIndent < belowContentLineIndent) {
      return 1 + Math.floor(aboveContentLineIndent / options.indentSize);
    } else if (aboveContentLineIndent === belowContentLineIndent) {
      return Math.ceil(belowContentLineIndent / options.indentSize);
    } else {
      if (offSide) {
        return Math.ceil(belowContentLineIndent / options.indentSize);
      } else {
        return 1 + Math.floor(belowContentLineIndent / options.indentSize);
      }
    }
  }
}
class BracketPairGuidesClassNames {
  constructor() {
    this.activeClassName = "indent-active";
  }
  getInlineClassName(nestingLevel, nestingLevelOfEqualBracketType, independentColorPoolPerBracketType) {
    return this.getInlineClassNameOfLevel(independentColorPoolPerBracketType ? nestingLevelOfEqualBracketType : nestingLevel);
  }
  getInlineClassNameOfLevel(level) {
    return `bracket-indent-guide lvl-${level % 30}`;
  }
}
export {
  BracketPairGuidesClassNames,
  GuidesTextModelPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvZ3VpZGVzVGV4dE1vZGVsUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGZpbmRMYXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29sdW1ucyB9IGZyb20gJy4uL2NvcmUvY3Vyc29yQ29sdW1ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHR5cGUgeyBUZXh0TW9kZWwgfSBmcm9tICcuL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxQYXJ0IH0gZnJvbSAnLi90ZXh0TW9kZWxQYXJ0LmpzJztcbmltcG9ydCB7IGNvbXB1dGVJbmRlbnRMZXZlbCB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEJyYWNrZXRHdWlkZU9wdGlvbnMsIEhvcml6b250YWxHdWlkZXNTdGF0ZSwgSUFjdGl2ZUluZGVudEd1aWRlSW5mbywgSUd1aWRlc1RleHRNb2RlbFBhcnQsIEluZGVudEd1aWRlLCBJbmRlbnRHdWlkZUhvcml6b250YWxMaW5lIH0gZnJvbSAnLi4vdGV4dE1vZGVsR3VpZGVzLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBHdWlkZXNUZXh0TW9kZWxQYXJ0IGV4dGVuZHMgVGV4dE1vZGVsUGFydCBpbXBsZW1lbnRzIElHdWlkZXNUZXh0TW9kZWxQYXJ0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWw6IFRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldExhbmd1YWdlQ29uZmlndXJhdGlvbihcblx0XHRsYW5ndWFnZUlkOiBzdHJpbmdcblx0KTogUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKFxuXHRcdFx0bGFuZ3VhZ2VJZFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlSW5kZW50TGV2ZWwobGluZUluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBjb21wdXRlSW5kZW50TGV2ZWwoXG5cdFx0XHR0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lSW5kZXggKyAxKSxcblx0XHRcdHRoaXMudGV4dE1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3RpdmVJbmRlbnRHdWlkZShcblx0XHRsaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0bWluTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdG1heExpbmVOdW1iZXI6IG51bWJlclxuXHQpOiBJQWN0aXZlSW5kZW50R3VpZGVJbmZvIHtcblx0XHR0aGlzLmFzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cblx0XHRpZiAobGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignSWxsZWdhbCB2YWx1ZSBmb3IgbGluZU51bWJlcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbGRpbmdSdWxlcyA9IHRoaXMuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKFxuXHRcdFx0dGhpcy50ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpXG5cdFx0KS5mb2xkaW5nUnVsZXM7XG5cdFx0Y29uc3Qgb2ZmU2lkZSA9IEJvb2xlYW4oZm9sZGluZ1J1bGVzICYmIGZvbGRpbmdSdWxlcy5vZmZTaWRlKTtcblxuXHRcdGxldCB1cF9hYm92ZUNvbnRlbnRMaW5lSW5kZXggPVxuXHRcdFx0LTI7IC8qIC0yIGlzIGEgbWFya2VyIGZvciBub3QgaGF2aW5nIGNvbXB1dGVkIGl0ICovXG5cdFx0bGV0IHVwX2Fib3ZlQ29udGVudExpbmVJbmRlbnQgPSAtMTtcblx0XHRsZXQgdXBfYmVsb3dDb250ZW50TGluZUluZGV4ID1cblx0XHRcdC0yOyAvKiAtMiBpcyBhIG1hcmtlciBmb3Igbm90IGhhdmluZyBjb21wdXRlZCBpdCAqL1xuXHRcdGxldCB1cF9iZWxvd0NvbnRlbnRMaW5lSW5kZW50ID0gLTE7XG5cdFx0Y29uc3QgdXBfcmVzb2x2ZUluZGVudHMgPSAobGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdHVwX2Fib3ZlQ29udGVudExpbmVJbmRleCAhPT0gLTEgJiZcblx0XHRcdFx0KHVwX2Fib3ZlQ29udGVudExpbmVJbmRleCA9PT0gLTIgfHxcblx0XHRcdFx0XHR1cF9hYm92ZUNvbnRlbnRMaW5lSW5kZXggPiBsaW5lTnVtYmVyIC0gMSlcblx0XHRcdCkge1xuXHRcdFx0XHR1cF9hYm92ZUNvbnRlbnRMaW5lSW5kZXggPSAtMTtcblx0XHRcdFx0dXBfYWJvdmVDb250ZW50TGluZUluZGVudCA9IC0xO1xuXG5cdFx0XHRcdC8vIG11c3QgZmluZCBwcmV2aW91cyBsaW5lIHdpdGggY29udGVudFxuXHRcdFx0XHRmb3IgKGxldCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gMjsgbGluZUluZGV4ID49IDA7IGxpbmVJbmRleC0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZW50ID0gdGhpcy5fY29tcHV0ZUluZGVudExldmVsKGxpbmVJbmRleCk7XG5cdFx0XHRcdFx0aWYgKGluZGVudCA+PSAwKSB7XG5cdFx0XHRcdFx0XHR1cF9hYm92ZUNvbnRlbnRMaW5lSW5kZXggPSBsaW5lSW5kZXg7XG5cdFx0XHRcdFx0XHR1cF9hYm92ZUNvbnRlbnRMaW5lSW5kZW50ID0gaW5kZW50O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh1cF9iZWxvd0NvbnRlbnRMaW5lSW5kZXggPT09IC0yKSB7XG5cdFx0XHRcdHVwX2JlbG93Q29udGVudExpbmVJbmRleCA9IC0xO1xuXHRcdFx0XHR1cF9iZWxvd0NvbnRlbnRMaW5lSW5kZW50ID0gLTE7XG5cblx0XHRcdFx0Ly8gbXVzdCBmaW5kIG5leHQgbGluZSB3aXRoIGNvbnRlbnRcblx0XHRcdFx0Zm9yIChsZXQgbGluZUluZGV4ID0gbGluZU51bWJlcjsgbGluZUluZGV4IDwgbGluZUNvdW50OyBsaW5lSW5kZXgrKykge1xuXHRcdFx0XHRcdGNvbnN0IGluZGVudCA9IHRoaXMuX2NvbXB1dGVJbmRlbnRMZXZlbChsaW5lSW5kZXgpO1xuXHRcdFx0XHRcdGlmIChpbmRlbnQgPj0gMCkge1xuXHRcdFx0XHRcdFx0dXBfYmVsb3dDb250ZW50TGluZUluZGV4ID0gbGluZUluZGV4O1xuXHRcdFx0XHRcdFx0dXBfYmVsb3dDb250ZW50TGluZUluZGVudCA9IGluZGVudDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgZG93bl9hYm92ZUNvbnRlbnRMaW5lSW5kZXggPVxuXHRcdFx0LTI7IC8qIC0yIGlzIGEgbWFya2VyIGZvciBub3QgaGF2aW5nIGNvbXB1dGVkIGl0ICovXG5cdFx0bGV0IGRvd25fYWJvdmVDb250ZW50TGluZUluZGVudCA9IC0xO1xuXHRcdGxldCBkb3duX2JlbG93Q29udGVudExpbmVJbmRleCA9XG5cdFx0XHQtMjsgLyogLTIgaXMgYSBtYXJrZXIgZm9yIG5vdCBoYXZpbmcgY29tcHV0ZWQgaXQgKi9cblx0XHRsZXQgZG93bl9iZWxvd0NvbnRlbnRMaW5lSW5kZW50ID0gLTE7XG5cdFx0Y29uc3QgZG93bl9yZXNvbHZlSW5kZW50cyA9IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHtcblx0XHRcdGlmIChkb3duX2Fib3ZlQ29udGVudExpbmVJbmRleCA9PT0gLTIpIHtcblx0XHRcdFx0ZG93bl9hYm92ZUNvbnRlbnRMaW5lSW5kZXggPSAtMTtcblx0XHRcdFx0ZG93bl9hYm92ZUNvbnRlbnRMaW5lSW5kZW50ID0gLTE7XG5cblx0XHRcdFx0Ly8gbXVzdCBmaW5kIHByZXZpb3VzIGxpbmUgd2l0aCBjb250ZW50XG5cdFx0XHRcdGZvciAobGV0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSAyOyBsaW5lSW5kZXggPj0gMDsgbGluZUluZGV4LS0pIHtcblx0XHRcdFx0XHRjb25zdCBpbmRlbnQgPSB0aGlzLl9jb21wdXRlSW5kZW50TGV2ZWwobGluZUluZGV4KTtcblx0XHRcdFx0XHRpZiAoaW5kZW50ID49IDApIHtcblx0XHRcdFx0XHRcdGRvd25fYWJvdmVDb250ZW50TGluZUluZGV4ID0gbGluZUluZGV4O1xuXHRcdFx0XHRcdFx0ZG93bl9hYm92ZUNvbnRlbnRMaW5lSW5kZW50ID0gaW5kZW50O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChcblx0XHRcdFx0ZG93bl9iZWxvd0NvbnRlbnRMaW5lSW5kZXggIT09IC0xICYmXG5cdFx0XHRcdChkb3duX2JlbG93Q29udGVudExpbmVJbmRleCA9PT0gLTIgfHxcblx0XHRcdFx0XHRkb3duX2JlbG93Q29udGVudExpbmVJbmRleCA8IGxpbmVOdW1iZXIgLSAxKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGRvd25fYmVsb3dDb250ZW50TGluZUluZGV4ID0gLTE7XG5cdFx0XHRcdGRvd25fYmVsb3dDb250ZW50TGluZUluZGVudCA9IC0xO1xuXG5cdFx0XHRcdC8vIG11c3QgZmluZCBuZXh0IGxpbmUgd2l0aCBjb250ZW50XG5cdFx0XHRcdGZvciAobGV0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXI7IGxpbmVJbmRleCA8IGxpbmVDb3VudDsgbGluZUluZGV4KyspIHtcblx0XHRcdFx0XHRjb25zdCBpbmRlbnQgPSB0aGlzLl9jb21wdXRlSW5kZW50TGV2ZWwobGluZUluZGV4KTtcblx0XHRcdFx0XHRpZiAoaW5kZW50ID49IDApIHtcblx0XHRcdFx0XHRcdGRvd25fYmVsb3dDb250ZW50TGluZUluZGV4ID0gbGluZUluZGV4O1xuXHRcdFx0XHRcdFx0ZG93bl9iZWxvd0NvbnRlbnRMaW5lSW5kZW50ID0gaW5kZW50O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGxldCBzdGFydExpbmVOdW1iZXIgPSAwO1xuXHRcdGxldCBnb1VwID0gdHJ1ZTtcblx0XHRsZXQgZW5kTGluZU51bWJlciA9IDA7XG5cdFx0bGV0IGdvRG93biA9IHRydWU7XG5cdFx0bGV0IGluZGVudCA9IDA7XG5cblx0XHRsZXQgaW5pdGlhbEluZGVudCA9IDA7XG5cblx0XHRmb3IgKGxldCBkaXN0YW5jZSA9IDA7IGdvVXAgfHwgZ29Eb3duOyBkaXN0YW5jZSsrKSB7XG5cdFx0XHRjb25zdCB1cExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyIC0gZGlzdGFuY2U7XG5cdFx0XHRjb25zdCBkb3duTGluZU51bWJlciA9IGxpbmVOdW1iZXIgKyBkaXN0YW5jZTtcblxuXHRcdFx0aWYgKGRpc3RhbmNlID4gMSAmJiAodXBMaW5lTnVtYmVyIDwgMSB8fCB1cExpbmVOdW1iZXIgPCBtaW5MaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRnb1VwID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGRpc3RhbmNlID4gMSAmJlxuXHRcdFx0XHQoZG93bkxpbmVOdW1iZXIgPiBsaW5lQ291bnQgfHwgZG93bkxpbmVOdW1iZXIgPiBtYXhMaW5lTnVtYmVyKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGdvRG93biA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRpc3RhbmNlID4gNTAwMDApIHtcblx0XHRcdFx0Ly8gc3RvcCBwcm9jZXNzaW5nXG5cdFx0XHRcdGdvVXAgPSBmYWxzZTtcblx0XHRcdFx0Z29Eb3duID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGxldCB1cExpbmVJbmRlbnRMZXZlbDogbnVtYmVyID0gLTE7XG5cdFx0XHRpZiAoZ29VcCAmJiB1cExpbmVOdW1iZXIgPj0gMSkge1xuXHRcdFx0XHQvLyBjb21wdXRlIGluZGVudCBsZXZlbCBnb2luZyB1cFxuXHRcdFx0XHRjb25zdCBjdXJyZW50SW5kZW50ID0gdGhpcy5fY29tcHV0ZUluZGVudExldmVsKHVwTGluZU51bWJlciAtIDEpO1xuXHRcdFx0XHRpZiAoY3VycmVudEluZGVudCA+PSAwKSB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBsaW5lIGhhcyBjb250ZW50IChiZXNpZGVzIHdoaXRlc3BhY2UpXG5cdFx0XHRcdFx0Ly8gVXNlIHRoZSBsaW5lJ3MgaW5kZW50XG5cdFx0XHRcdFx0dXBfYmVsb3dDb250ZW50TGluZUluZGV4ID0gdXBMaW5lTnVtYmVyIC0gMTtcblx0XHRcdFx0XHR1cF9iZWxvd0NvbnRlbnRMaW5lSW5kZW50ID0gY3VycmVudEluZGVudDtcblx0XHRcdFx0XHR1cExpbmVJbmRlbnRMZXZlbCA9IE1hdGguY2VpbChcblx0XHRcdFx0XHRcdGN1cnJlbnRJbmRlbnQgLyB0aGlzLnRleHRNb2RlbC5nZXRPcHRpb25zKCkuaW5kZW50U2l6ZVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dXBfcmVzb2x2ZUluZGVudHModXBMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHR1cExpbmVJbmRlbnRMZXZlbCA9IHRoaXMuX2dldEluZGVudExldmVsRm9yV2hpdGVzcGFjZUxpbmUoXG5cdFx0XHRcdFx0XHRvZmZTaWRlLFxuXHRcdFx0XHRcdFx0dXBfYWJvdmVDb250ZW50TGluZUluZGVudCxcblx0XHRcdFx0XHRcdHVwX2JlbG93Q29udGVudExpbmVJbmRlbnRcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCBkb3duTGluZUluZGVudExldmVsID0gLTE7XG5cdFx0XHRpZiAoZ29Eb3duICYmIGRvd25MaW5lTnVtYmVyIDw9IGxpbmVDb3VudCkge1xuXHRcdFx0XHQvLyBjb21wdXRlIGluZGVudCBsZXZlbCBnb2luZyBkb3duXG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRJbmRlbnQgPSB0aGlzLl9jb21wdXRlSW5kZW50TGV2ZWwoZG93bkxpbmVOdW1iZXIgLSAxKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRJbmRlbnQgPj0gMCkge1xuXHRcdFx0XHRcdC8vIFRoaXMgbGluZSBoYXMgY29udGVudCAoYmVzaWRlcyB3aGl0ZXNwYWNlKVxuXHRcdFx0XHRcdC8vIFVzZSB0aGUgbGluZSdzIGluZGVudFxuXHRcdFx0XHRcdGRvd25fYWJvdmVDb250ZW50TGluZUluZGV4ID0gZG93bkxpbmVOdW1iZXIgLSAxO1xuXHRcdFx0XHRcdGRvd25fYWJvdmVDb250ZW50TGluZUluZGVudCA9IGN1cnJlbnRJbmRlbnQ7XG5cdFx0XHRcdFx0ZG93bkxpbmVJbmRlbnRMZXZlbCA9IE1hdGguY2VpbChcblx0XHRcdFx0XHRcdGN1cnJlbnRJbmRlbnQgLyB0aGlzLnRleHRNb2RlbC5nZXRPcHRpb25zKCkuaW5kZW50U2l6ZVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZG93bl9yZXNvbHZlSW5kZW50cyhkb3duTGluZU51bWJlcik7XG5cdFx0XHRcdFx0ZG93bkxpbmVJbmRlbnRMZXZlbCA9IHRoaXMuX2dldEluZGVudExldmVsRm9yV2hpdGVzcGFjZUxpbmUoXG5cdFx0XHRcdFx0XHRvZmZTaWRlLFxuXHRcdFx0XHRcdFx0ZG93bl9hYm92ZUNvbnRlbnRMaW5lSW5kZW50LFxuXHRcdFx0XHRcdFx0ZG93bl9iZWxvd0NvbnRlbnRMaW5lSW5kZW50XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGlzdGFuY2UgPT09IDApIHtcblx0XHRcdFx0aW5pdGlhbEluZGVudCA9IHVwTGluZUluZGVudExldmVsO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRpc3RhbmNlID09PSAxKSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHRkb3duTGluZU51bWJlciA8PSBsaW5lQ291bnQgJiZcblx0XHRcdFx0XHRkb3duTGluZUluZGVudExldmVsID49IDAgJiZcblx0XHRcdFx0XHRpbml0aWFsSW5kZW50ICsgMSA9PT0gZG93bkxpbmVJbmRlbnRMZXZlbFxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHQvLyBUaGlzIGlzIHRoZSBiZWdpbm5pbmcgb2YgYSBzY29wZSwgd2UgaGF2ZSBzcGVjaWFsIGhhbmRsaW5nIGhlcmUsIHNpbmNlIHdlIHdhbnQgdGhlXG5cdFx0XHRcdFx0Ly8gY2hpbGQgc2NvcGUgaW5kZW50IHRvIGJlIGFjdGl2ZSwgbm90IHRoZSBwYXJlbnQgc2NvcGVcblx0XHRcdFx0XHRnb1VwID0gZmFsc2U7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gZG93bkxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlciA9IGRvd25MaW5lTnVtYmVyO1xuXHRcdFx0XHRcdGluZGVudCA9IGRvd25MaW5lSW5kZW50TGV2ZWw7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0dXBMaW5lTnVtYmVyID49IDEgJiZcblx0XHRcdFx0XHR1cExpbmVJbmRlbnRMZXZlbCA+PSAwICYmXG5cdFx0XHRcdFx0dXBMaW5lSW5kZW50TGV2ZWwgLSAxID09PSBpbml0aWFsSW5kZW50XG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdC8vIFRoaXMgaXMgdGhlIGVuZCBvZiBhIHNjb3BlLCBqdXN0IGxpa2UgYWJvdmVcblx0XHRcdFx0XHRnb0Rvd24gPSBmYWxzZTtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSB1cExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlciA9IHVwTGluZU51bWJlcjtcblx0XHRcdFx0XHRpbmRlbnQgPSB1cExpbmVJbmRlbnRMZXZlbDtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdFx0XHRpbmRlbnQgPSBpbml0aWFsSW5kZW50O1xuXHRcdFx0XHRpZiAoaW5kZW50ID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gTm8gbmVlZCB0byBjb250aW51ZVxuXHRcdFx0XHRcdHJldHVybiB7IHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciwgaW5kZW50IH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGdvVXApIHtcblx0XHRcdFx0aWYgKHVwTGluZUluZGVudExldmVsID49IGluZGVudCkge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlciA9IHVwTGluZU51bWJlcjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRnb1VwID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChnb0Rvd24pIHtcblx0XHRcdFx0aWYgKGRvd25MaW5lSW5kZW50TGV2ZWwgPj0gaW5kZW50KSB7XG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlciA9IGRvd25MaW5lTnVtYmVyO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGdvRG93biA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyLCBpbmRlbnQgfTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lc0JyYWNrZXRHdWlkZXMoXG5cdFx0c3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0ZW5kTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdGFjdGl2ZVBvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsLFxuXHRcdG9wdGlvbnM6IEJyYWNrZXRHdWlkZU9wdGlvbnNcblx0KTogSW5kZW50R3VpZGVbXVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IEluZGVudEd1aWRlW11bXSA9IFtdO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRyZXN1bHQucHVzaChbXSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgcmVxdWVzdGVkLCB0aGlzIGNvdWxkIGJlIG1hZGUgY29uZmlndXJhYmxlLlxuXHRcdGNvbnN0IGluY2x1ZGVTaW5nbGVMaW5lUGFpcnMgPSB0cnVlO1xuXG5cdFx0Y29uc3QgYnJhY2tldFBhaXJzID1cblx0XHRcdHRoaXMudGV4dE1vZGVsLmJyYWNrZXRQYWlycy5nZXRCcmFja2V0UGFpcnNJblJhbmdlV2l0aE1pbkluZGVudGF0aW9uKFxuXHRcdFx0XHRuZXcgUmFuZ2UoXG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdDEsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHR0aGlzLnRleHRNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpXG5cdFx0XHRcdClcblx0XHRcdCkudG9BcnJheSgpO1xuXG5cdFx0bGV0IGFjdGl2ZUJyYWNrZXRQYWlyUmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChhY3RpdmVQb3NpdGlvbiAmJiBicmFja2V0UGFpcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgYnJhY2tldHNDb250YWluaW5nQWN0aXZlUG9zaXRpb24gPSAoXG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlciA8PSBhY3RpdmVQb3NpdGlvbi5saW5lTnVtYmVyICYmXG5cdFx0XHRcdFx0YWN0aXZlUG9zaXRpb24ubGluZU51bWJlciA8PSBlbmRMaW5lTnVtYmVyXG5cdFx0XHRcdFx0Ly8gV2UgZG9uJ3QgbmVlZCB0byBxdWVyeSB0aGUgYnJhY2tldHMgYWdhaW4gaWYgdGhlIGN1cnNvciBpcyBpbiB0aGUgdmlld3BvcnRcblx0XHRcdFx0XHQ/IGJyYWNrZXRQYWlyc1xuXHRcdFx0XHRcdDogdGhpcy50ZXh0TW9kZWwuYnJhY2tldFBhaXJzLmdldEJyYWNrZXRQYWlyc0luUmFuZ2UoXG5cdFx0XHRcdFx0XHRSYW5nZS5mcm9tUG9zaXRpb25zKGFjdGl2ZVBvc2l0aW9uKVxuXHRcdFx0XHRcdCkudG9BcnJheSgpXG5cdFx0XHQpLmZpbHRlcigoYnApID0+IFJhbmdlLnN0cmljdENvbnRhaW5zUG9zaXRpb24oYnAucmFuZ2UsIGFjdGl2ZVBvc2l0aW9uKSk7XG5cblx0XHRcdGFjdGl2ZUJyYWNrZXRQYWlyUmFuZ2UgPSBmaW5kTGFzdChcblx0XHRcdFx0YnJhY2tldHNDb250YWluaW5nQWN0aXZlUG9zaXRpb24sXG5cdFx0XHRcdChpKSA9PiBpbmNsdWRlU2luZ2xlTGluZVBhaXJzIHx8IGkucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBpLnJhbmdlLmVuZExpbmVOdW1iZXJcblx0XHRcdCk/LnJhbmdlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGUgPSB0aGlzLnRleHRNb2RlbC5nZXRPcHRpb25zKCkuYnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zLmluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGU7XG5cdFx0Y29uc3QgY29sb3JQcm92aWRlciA9IG5ldyBCcmFja2V0UGFpckd1aWRlc0NsYXNzTmFtZXMoKTtcblxuXHRcdGZvciAoY29uc3QgcGFpciBvZiBicmFja2V0UGFpcnMpIHtcblx0XHRcdC8qXG5cblxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHR8XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdHxcblx0XHRcdFx0XHQtLS0tfVxuXG5cdFx0XHRcdF9fX197XG5cdFx0XHRcdHx0ZXN0XG5cdFx0XHRcdC0tLS19XG5cblx0XHRcdFx0cmVuZGVySG9yaXpvbnRhbEVuZExpbmVBdFRoZUJvdHRvbTpcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0fFxuXHRcdFx0XHRcdHx4fVxuXHRcdFx0XHRcdC0tXG5cdFx0XHRcdHJlbmRlckhvcml6b250YWxFbmRMaW5lQXRUaGVCb3R0b206XG5cdFx0XHRcdF9fX197XG5cdFx0XHRcdHx0ZXN0XG5cdFx0XHRcdHwgeCB9XG5cdFx0XHRcdC0tLS1cblx0XHRcdCovXG5cblx0XHRcdGlmICghcGFpci5jbG9zaW5nQnJhY2tldFJhbmdlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGFjdGl2ZUJyYWNrZXRQYWlyUmFuZ2UgJiYgcGFpci5yYW5nZS5lcXVhbHNSYW5nZShhY3RpdmVCcmFja2V0UGFpclJhbmdlKTtcblxuXHRcdFx0aWYgKCFpc0FjdGl2ZSAmJiAhb3B0aW9ucy5pbmNsdWRlSW5hY3RpdmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNsYXNzTmFtZSA9XG5cdFx0XHRcdGNvbG9yUHJvdmlkZXIuZ2V0SW5saW5lQ2xhc3NOYW1lKHBhaXIubmVzdGluZ0xldmVsLCBwYWlyLm5lc3RpbmdMZXZlbE9mRXF1YWxCcmFja2V0VHlwZSwgaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZSkgK1xuXHRcdFx0XHQob3B0aW9ucy5oaWdobGlnaHRBY3RpdmUgJiYgaXNBY3RpdmVcblx0XHRcdFx0XHQ/ICcgJyArIGNvbG9yUHJvdmlkZXIuYWN0aXZlQ2xhc3NOYW1lXG5cdFx0XHRcdFx0OiAnJyk7XG5cblxuXHRcdFx0Y29uc3Qgc3RhcnQgPSBwYWlyLm9wZW5pbmdCcmFja2V0UmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3QgZW5kID0gcGFpci5jbG9zaW5nQnJhY2tldFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblxuXHRcdFx0Y29uc3QgaG9yaXpvbnRhbEd1aWRlcyA9IG9wdGlvbnMuaG9yaXpvbnRhbEd1aWRlcyA9PT0gSG9yaXpvbnRhbEd1aWRlc1N0YXRlLkVuYWJsZWQgfHwgKG9wdGlvbnMuaG9yaXpvbnRhbEd1aWRlcyA9PT0gSG9yaXpvbnRhbEd1aWRlc1N0YXRlLkVuYWJsZWRGb3JBY3RpdmUgJiYgaXNBY3RpdmUpO1xuXG5cdFx0XHRpZiAocGFpci5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHBhaXIucmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRpZiAoaW5jbHVkZVNpbmdsZUxpbmVQYWlycyAmJiBob3Jpem9udGFsR3VpZGVzKSB7XG5cblx0XHRcdFx0XHRyZXN1bHRbcGFpci5yYW5nZS5zdGFydExpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXJdLnB1c2goXG5cdFx0XHRcdFx0XHRuZXcgSW5kZW50R3VpZGUoXG5cdFx0XHRcdFx0XHRcdC0xLFxuXHRcdFx0XHRcdFx0XHRwYWlyLm9wZW5pbmdCcmFja2V0UmFuZ2UuZ2V0RW5kUG9zaXRpb24oKS5jb2x1bW4sXG5cdFx0XHRcdFx0XHRcdGNsYXNzTmFtZSxcblx0XHRcdFx0XHRcdFx0bmV3IEluZGVudEd1aWRlSG9yaXpvbnRhbExpbmUoZmFsc2UsIGVuZC5jb2x1bW4pLFxuXHRcdFx0XHRcdFx0XHQtMSxcblx0XHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbmRWaXNpYmxlQ29sdW1uID0gdGhpcy5nZXRWaXNpYmxlQ29sdW1uRnJvbVBvc2l0aW9uKGVuZCk7XG5cdFx0XHRjb25zdCBzdGFydFZpc2libGVDb2x1bW4gPSB0aGlzLmdldFZpc2libGVDb2x1bW5Gcm9tUG9zaXRpb24oXG5cdFx0XHRcdHBhaXIub3BlbmluZ0JyYWNrZXRSYW5nZS5nZXRTdGFydFBvc2l0aW9uKClcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBndWlkZVZpc2libGVDb2x1bW4gPSBNYXRoLm1pbihzdGFydFZpc2libGVDb2x1bW4sIGVuZFZpc2libGVDb2x1bW4sIHBhaXIubWluVmlzaWJsZUNvbHVtbkluZGVudGF0aW9uICsgMSk7XG5cblx0XHRcdGxldCByZW5kZXJIb3Jpem9udGFsRW5kTGluZUF0VGhlQm90dG9tID0gZmFsc2U7XG5cblxuXHRcdFx0Y29uc3QgZmlyc3ROb25Xc0luZGV4ID0gc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleChcblx0XHRcdFx0dGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQoXG5cdFx0XHRcdFx0cGFpci5jbG9zaW5nQnJhY2tldFJhbmdlLnN0YXJ0TGluZU51bWJlclxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgaGFzVGV4dEJlZm9yZUNsb3NpbmdCcmFja2V0ID0gZmlyc3ROb25Xc0luZGV4IDwgcGFpci5jbG9zaW5nQnJhY2tldFJhbmdlLnN0YXJ0Q29sdW1uIC0gMTtcblx0XHRcdGlmIChoYXNUZXh0QmVmb3JlQ2xvc2luZ0JyYWNrZXQpIHtcblx0XHRcdFx0cmVuZGVySG9yaXpvbnRhbEVuZExpbmVBdFRoZUJvdHRvbSA9IHRydWU7XG5cdFx0XHR9XG5cblxuXHRcdFx0Y29uc3QgdmlzaWJsZUd1aWRlU3RhcnRMaW5lTnVtYmVyID0gTWF0aC5tYXgoc3RhcnQubGluZU51bWJlciwgc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IHZpc2libGVHdWlkZUVuZExpbmVOdW1iZXIgPSBNYXRoLm1pbihlbmQubGluZU51bWJlciwgZW5kTGluZU51bWJlcik7XG5cblx0XHRcdGNvbnN0IG9mZnNldCA9IHJlbmRlckhvcml6b250YWxFbmRMaW5lQXRUaGVCb3R0b20gPyAxIDogMDtcblxuXHRcdFx0Zm9yIChsZXQgbCA9IHZpc2libGVHdWlkZVN0YXJ0TGluZU51bWJlcjsgbCA8IHZpc2libGVHdWlkZUVuZExpbmVOdW1iZXIgKyBvZmZzZXQ7IGwrKykge1xuXHRcdFx0XHRyZXN1bHRbbCAtIHN0YXJ0TGluZU51bWJlcl0ucHVzaChcblx0XHRcdFx0XHRuZXcgSW5kZW50R3VpZGUoXG5cdFx0XHRcdFx0XHRndWlkZVZpc2libGVDb2x1bW4sXG5cdFx0XHRcdFx0XHQtMSxcblx0XHRcdFx0XHRcdGNsYXNzTmFtZSxcblx0XHRcdFx0XHRcdG51bGwsXG5cdFx0XHRcdFx0XHRsID09PSBzdGFydC5saW5lTnVtYmVyID8gc3RhcnQuY29sdW1uIDogLTEsXG5cdFx0XHRcdFx0XHRsID09PSBlbmQubGluZU51bWJlciA/IGVuZC5jb2x1bW4gOiAtMVxuXHRcdFx0XHRcdClcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhvcml6b250YWxHdWlkZXMpIHtcblx0XHRcdFx0aWYgKHN0YXJ0LmxpbmVOdW1iZXIgPj0gc3RhcnRMaW5lTnVtYmVyICYmIHN0YXJ0VmlzaWJsZUNvbHVtbiA+IGd1aWRlVmlzaWJsZUNvbHVtbikge1xuXHRcdFx0XHRcdHJlc3VsdFtzdGFydC5saW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyXS5wdXNoKFxuXHRcdFx0XHRcdFx0bmV3IEluZGVudEd1aWRlKFxuXHRcdFx0XHRcdFx0XHRndWlkZVZpc2libGVDb2x1bW4sXG5cdFx0XHRcdFx0XHRcdC0xLFxuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWUsXG5cdFx0XHRcdFx0XHRcdG5ldyBJbmRlbnRHdWlkZUhvcml6b250YWxMaW5lKGZhbHNlLCBzdGFydC5jb2x1bW4pLFxuXHRcdFx0XHRcdFx0XHQtMSxcblx0XHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlbmQubGluZU51bWJlciA8PSBlbmRMaW5lTnVtYmVyICYmIGVuZFZpc2libGVDb2x1bW4gPiBndWlkZVZpc2libGVDb2x1bW4pIHtcblx0XHRcdFx0XHRyZXN1bHRbZW5kLmxpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXJdLnB1c2goXG5cdFx0XHRcdFx0XHRuZXcgSW5kZW50R3VpZGUoXG5cdFx0XHRcdFx0XHRcdGd1aWRlVmlzaWJsZUNvbHVtbixcblx0XHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHRcdGNsYXNzTmFtZSxcblx0XHRcdFx0XHRcdFx0bmV3IEluZGVudEd1aWRlSG9yaXpvbnRhbExpbmUoIXJlbmRlckhvcml6b250YWxFbmRMaW5lQXRUaGVCb3R0b20sIGVuZC5jb2x1bW4pLFxuXHRcdFx0XHRcdFx0XHQtMSxcblx0XHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZ3VpZGVzIG9mIHJlc3VsdCkge1xuXHRcdFx0Z3VpZGVzLnNvcnQoKGEsIGIpID0+IGEudmlzaWJsZUNvbHVtbiAtIGIudmlzaWJsZUNvbHVtbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VmlzaWJsZUNvbHVtbkZyb21Qb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBudW1iZXIge1xuXHRcdHJldHVybiAoXG5cdFx0XHRDdXJzb3JDb2x1bW5zLnZpc2libGVDb2x1bW5Gcm9tQ29sdW1uKFxuXHRcdFx0XHR0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSxcblx0XHRcdFx0cG9zaXRpb24uY29sdW1uLFxuXHRcdFx0XHR0aGlzLnRleHRNb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZVxuXHRcdFx0KSArIDFcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVzSW5kZW50R3VpZGVzKFxuXHRcdHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLFxuXHRcdGVuZExpbmVOdW1iZXI6IG51bWJlclxuXHQpOiBudW1iZXJbXSB7XG5cdFx0dGhpcy5hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMudGV4dE1vZGVsLmdldExpbmVDb3VudCgpO1xuXG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciA8IDEgfHwgc3RhcnRMaW5lTnVtYmVyID4gbGluZUNvdW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lsbGVnYWwgdmFsdWUgZm9yIHN0YXJ0TGluZU51bWJlcicpO1xuXHRcdH1cblx0XHRpZiAoZW5kTGluZU51bWJlciA8IDEgfHwgZW5kTGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbGxlZ2FsIHZhbHVlIGZvciBlbmRMaW5lTnVtYmVyJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMudGV4dE1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRjb25zdCBmb2xkaW5nUnVsZXMgPSB0aGlzLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihcblx0XHRcdHRoaXMudGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKVxuXHRcdCkuZm9sZGluZ1J1bGVzO1xuXHRcdGNvbnN0IG9mZlNpZGUgPSBCb29sZWFuKGZvbGRpbmdSdWxlcyAmJiBmb2xkaW5nUnVsZXMub2ZmU2lkZSk7XG5cblx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gbmV3IEFycmF5PG51bWJlcj4oXG5cdFx0XHRlbmRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyICsgMVxuXHRcdCk7XG5cblx0XHRsZXQgYWJvdmVDb250ZW50TGluZUluZGV4ID1cblx0XHRcdC0yOyAvKiAtMiBpcyBhIG1hcmtlciBmb3Igbm90IGhhdmluZyBjb21wdXRlZCBpdCAqL1xuXHRcdGxldCBhYm92ZUNvbnRlbnRMaW5lSW5kZW50ID0gLTE7XG5cblx0XHRsZXQgYmVsb3dDb250ZW50TGluZUluZGV4ID1cblx0XHRcdC0yOyAvKiAtMiBpcyBhIG1hcmtlciBmb3Igbm90IGhhdmluZyBjb21wdXRlZCBpdCAqL1xuXHRcdGxldCBiZWxvd0NvbnRlbnRMaW5lSW5kZW50ID0gLTE7XG5cblx0XHRmb3IgKFxuXHRcdFx0bGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0XHRsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7XG5cdFx0XHRsaW5lTnVtYmVyKytcblx0XHQpIHtcblx0XHRcdGNvbnN0IHJlc3VsdEluZGV4ID0gbGluZU51bWJlciAtIHN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0Y29uc3QgY3VycmVudEluZGVudCA9IHRoaXMuX2NvbXB1dGVJbmRlbnRMZXZlbChsaW5lTnVtYmVyIC0gMSk7XG5cdFx0XHRpZiAoY3VycmVudEluZGVudCA+PSAwKSB7XG5cdFx0XHRcdC8vIFRoaXMgbGluZSBoYXMgY29udGVudCAoYmVzaWRlcyB3aGl0ZXNwYWNlKVxuXHRcdFx0XHQvLyBVc2UgdGhlIGxpbmUncyBpbmRlbnRcblx0XHRcdFx0YWJvdmVDb250ZW50TGluZUluZGV4ID0gbGluZU51bWJlciAtIDE7XG5cdFx0XHRcdGFib3ZlQ29udGVudExpbmVJbmRlbnQgPSBjdXJyZW50SW5kZW50O1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0SW5kZXhdID0gTWF0aC5jZWlsKGN1cnJlbnRJbmRlbnQgLyBvcHRpb25zLmluZGVudFNpemUpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFib3ZlQ29udGVudExpbmVJbmRleCA9PT0gLTIpIHtcblx0XHRcdFx0YWJvdmVDb250ZW50TGluZUluZGV4ID0gLTE7XG5cdFx0XHRcdGFib3ZlQ29udGVudExpbmVJbmRlbnQgPSAtMTtcblxuXHRcdFx0XHQvLyBtdXN0IGZpbmQgcHJldmlvdXMgbGluZSB3aXRoIGNvbnRlbnRcblx0XHRcdFx0Zm9yIChsZXQgbGluZUluZGV4ID0gbGluZU51bWJlciAtIDI7IGxpbmVJbmRleCA+PSAwOyBsaW5lSW5kZXgtLSkge1xuXHRcdFx0XHRcdGNvbnN0IGluZGVudCA9IHRoaXMuX2NvbXB1dGVJbmRlbnRMZXZlbChsaW5lSW5kZXgpO1xuXHRcdFx0XHRcdGlmIChpbmRlbnQgPj0gMCkge1xuXHRcdFx0XHRcdFx0YWJvdmVDb250ZW50TGluZUluZGV4ID0gbGluZUluZGV4O1xuXHRcdFx0XHRcdFx0YWJvdmVDb250ZW50TGluZUluZGVudCA9IGluZGVudDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdGJlbG93Q29udGVudExpbmVJbmRleCAhPT0gLTEgJiZcblx0XHRcdFx0KGJlbG93Q29udGVudExpbmVJbmRleCA9PT0gLTIgfHwgYmVsb3dDb250ZW50TGluZUluZGV4IDwgbGluZU51bWJlciAtIDEpXG5cdFx0XHQpIHtcblx0XHRcdFx0YmVsb3dDb250ZW50TGluZUluZGV4ID0gLTE7XG5cdFx0XHRcdGJlbG93Q29udGVudExpbmVJbmRlbnQgPSAtMTtcblxuXHRcdFx0XHQvLyBtdXN0IGZpbmQgbmV4dCBsaW5lIHdpdGggY29udGVudFxuXHRcdFx0XHRmb3IgKGxldCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyOyBsaW5lSW5kZXggPCBsaW5lQ291bnQ7IGxpbmVJbmRleCsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZW50ID0gdGhpcy5fY29tcHV0ZUluZGVudExldmVsKGxpbmVJbmRleCk7XG5cdFx0XHRcdFx0aWYgKGluZGVudCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRiZWxvd0NvbnRlbnRMaW5lSW5kZXggPSBsaW5lSW5kZXg7XG5cdFx0XHRcdFx0XHRiZWxvd0NvbnRlbnRMaW5lSW5kZW50ID0gaW5kZW50O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdFtyZXN1bHRJbmRleF0gPSB0aGlzLl9nZXRJbmRlbnRMZXZlbEZvcldoaXRlc3BhY2VMaW5lKFxuXHRcdFx0XHRvZmZTaWRlLFxuXHRcdFx0XHRhYm92ZUNvbnRlbnRMaW5lSW5kZW50LFxuXHRcdFx0XHRiZWxvd0NvbnRlbnRMaW5lSW5kZW50XG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SW5kZW50TGV2ZWxGb3JXaGl0ZXNwYWNlTGluZShcblx0XHRvZmZTaWRlOiBib29sZWFuLFxuXHRcdGFib3ZlQ29udGVudExpbmVJbmRlbnQ6IG51bWJlcixcblx0XHRiZWxvd0NvbnRlbnRMaW5lSW5kZW50OiBudW1iZXJcblx0KTogbnVtYmVyIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy50ZXh0TW9kZWwuZ2V0T3B0aW9ucygpO1xuXG5cdFx0aWYgKGFib3ZlQ29udGVudExpbmVJbmRlbnQgPT09IC0xIHx8IGJlbG93Q29udGVudExpbmVJbmRlbnQgPT09IC0xKSB7XG5cdFx0XHQvLyBBdCB0aGUgdG9wIG9yIGJvdHRvbSBvZiB0aGUgZmlsZVxuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fSBlbHNlIGlmIChhYm92ZUNvbnRlbnRMaW5lSW5kZW50IDwgYmVsb3dDb250ZW50TGluZUluZGVudCkge1xuXHRcdFx0Ly8gd2UgYXJlIGluc2lkZSB0aGUgcmVnaW9uIGFib3ZlXG5cdFx0XHRyZXR1cm4gMSArIE1hdGguZmxvb3IoYWJvdmVDb250ZW50TGluZUluZGVudCAvIG9wdGlvbnMuaW5kZW50U2l6ZSk7XG5cdFx0fSBlbHNlIGlmIChhYm92ZUNvbnRlbnRMaW5lSW5kZW50ID09PSBiZWxvd0NvbnRlbnRMaW5lSW5kZW50KSB7XG5cdFx0XHQvLyB3ZSBhcmUgaW4gYmV0d2VlbiB0d28gcmVnaW9uc1xuXHRcdFx0cmV0dXJuIE1hdGguY2VpbChiZWxvd0NvbnRlbnRMaW5lSW5kZW50IC8gb3B0aW9ucy5pbmRlbnRTaXplKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKG9mZlNpZGUpIHtcblx0XHRcdFx0Ly8gc2FtZSBsZXZlbCBhcyByZWdpb24gYmVsb3dcblx0XHRcdFx0cmV0dXJuIE1hdGguY2VpbChiZWxvd0NvbnRlbnRMaW5lSW5kZW50IC8gb3B0aW9ucy5pbmRlbnRTaXplKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHdlIGFyZSBpbnNpZGUgdGhlIHJlZ2lvbiB0aGF0IGVuZHMgYmVsb3dcblx0XHRcdFx0cmV0dXJuIDEgKyBNYXRoLmZsb29yKGJlbG93Q29udGVudExpbmVJbmRlbnQgLyBvcHRpb25zLmluZGVudFNpemUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnJhY2tldFBhaXJHdWlkZXNDbGFzc05hbWVzIHtcblx0cHVibGljIHJlYWRvbmx5IGFjdGl2ZUNsYXNzTmFtZSA9ICdpbmRlbnQtYWN0aXZlJztcblxuXHRnZXRJbmxpbmVDbGFzc05hbWUobmVzdGluZ0xldmVsOiBudW1iZXIsIG5lc3RpbmdMZXZlbE9mRXF1YWxCcmFja2V0VHlwZTogbnVtYmVyLCBpbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlOiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRJbmxpbmVDbGFzc05hbWVPZkxldmVsKGluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGUgPyBuZXN0aW5nTGV2ZWxPZkVxdWFsQnJhY2tldFR5cGUgOiBuZXN0aW5nTGV2ZWwpO1xuXHR9XG5cblx0Z2V0SW5saW5lQ2xhc3NOYW1lT2ZMZXZlbChsZXZlbDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHQvLyBUbyBzdXBwb3J0IGEgZHluYW1pYyBhbW91bnQgb2YgY29sb3JzIHVwIHRvIDYgY29sb3JzLFxuXHRcdC8vIHdlIHVzZSBhIG51bWJlciB0aGF0IGlzIGEgbGNtIG9mIGFsbCBudW1iZXJzIGZyb20gMSB0byA2LlxuXHRcdHJldHVybiBgYnJhY2tldC1pbmRlbnQtZ3VpZGUgbHZsLSR7bGV2ZWwgJSAzMH1gO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLGFBQWE7QUFDekIsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxhQUFhO0FBRXRCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBRW5DLFNBQThCLHVCQUFxRSxhQUFhLGlDQUFpQztBQUNqSixTQUFTLDBCQUEwQjtBQUU1QixNQUFNLDRCQUE0QixjQUE4QztBQUFBLEVBQ3RGLFlBQ2tCLFdBQ0EsOEJBQ2hCO0FBQ0QsVUFBTTtBQUhXO0FBQ0E7QUFBQSxFQUdsQjtBQUFBLEVBRVEseUJBQ1As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
