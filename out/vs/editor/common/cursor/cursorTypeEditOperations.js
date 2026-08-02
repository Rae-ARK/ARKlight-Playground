import { CharCode } from "../../../base/common/charCode.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import * as strings from "../../../base/common/strings.js";
import { ReplaceCommand, ReplaceCommandWithOffsetCursorState, ReplaceCommandWithoutChangingPosition, ReplaceCommandThatPreservesSelection, ReplaceOvertypeCommand, ReplaceOvertypeCommandOnCompositionEnd } from "../commands/replaceCommand.js";
import { ShiftCommand } from "../commands/shiftCommand.js";
import { SurroundSelectionCommand } from "../commands/surroundSelectionCommand.js";
import { EditOperationResult, EditOperationType, isQuote } from "../cursorCommon.js";
import { WordCharacterClass, getMapForWordSeparators } from "../core/wordCharacterClassifier.js";
import { Range } from "../core/range.js";
import { Position } from "../core/position.js";
import { IndentAction } from "../languages/languageConfiguration.js";
import { getIndentationAtPosition } from "../languages/languageConfigurationRegistry.js";
import { EditorAutoIndentStrategy } from "../config/editorOptions.js";
import { createScopedLineTokens } from "../languages/supports.js";
import { getIndentActionForType, getIndentForEnter, getInheritIndentForLine } from "../languages/autoIndent.js";
import { getEnterAction } from "../languages/enterAction.js";
class AutoIndentOperation {
  static getEdits(config, model, selections, ch, isDoingComposition) {
    if (!isDoingComposition && this._isAutoIndentType(config, model, selections)) {
      const indentationForSelections = [];
      for (const selection of selections) {
        const indentation = this._findActualIndentationForSelection(config, model, selection, ch);
        if (indentation === null) {
          return;
        }
        indentationForSelections.push({ selection, indentation });
      }
      const autoClosingPairClose = AutoClosingOpenCharTypeOperation.getAutoClosingPairClose(config, model, selections, ch, false);
      return this._getIndentationAndAutoClosingPairEdits(config, model, indentationForSelections, ch, autoClosingPairClose);
    }
    return;
  }
  static _isAutoIndentType(config, model, selections) {
    if (config.autoIndent < EditorAutoIndentStrategy.Full) {
      return false;
    }
    for (let i = 0, len = selections.length; i < len; i++) {
      if (!model.tokenization.isCheapToTokenize(selections[i].getEndPosition().lineNumber)) {
        return false;
      }
    }
    return true;
  }
  static _findActualIndentationForSelection(config, model, selection, ch) {
    const actualIndentation = getIndentActionForType(config, model, selection, ch, {
      shiftIndent: (indentation) => {
        return shiftIndent(config, indentation);
      },
      unshiftIndent: (indentation) => {
        return unshiftIndent(config, indentation);
      }
    }, config.languageConfigurationService);
    if (actualIndentation === null) {
      return null;
    }
    const currentIndentation = getIndentationAtPosition(model, selection.startLineNumber, selection.startColumn);
    if (actualIndentation === config.normalizeIndentation(currentIndentation)) {
      return null;
    }
    return actualIndentation;
  }
  static _getIndentationAndAutoClosingPairEdits(config, model, indentationForSelections, ch, autoClosingPairClose) {
    const commands = indentationForSelections.map(({ selection, indentation }) => {
      if (autoClosingPairClose !== null) {
        const indentationEdit = this._getEditFromIndentationAndSelection(config, model, indentation, selection, ch, false);
        return new TypeWithIndentationAndAutoClosingCommand(indentationEdit, selection, ch, autoClosingPairClose);
      } else {
        const indentationEdit = this._getEditFromIndentationAndSelection(config, model, indentation, selection, ch, true);
        return typeCommand(indentationEdit.range, indentationEdit.text, false);
      }
    });
    const editOptions = { shouldPushStackElementBefore: true, shouldPushStackElementAfter: false };
    return new EditOperationResult(EditOperationType.TypingOther, commands, editOptions);
  }
  static _getEditFromIndentationAndSelection(config, model, indentation, selection, ch, includeChInEdit = true) {
    const startLineNumber = selection.startLineNumber;
    const firstNonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(startLineNumber);
    let text = config.normalizeIndentation(indentation);
    if (firstNonWhitespaceColumn !== 0) {
      const startLine = model.getLineContent(startLineNumber);
      text += startLine.substring(firstNonWhitespaceColumn - 1, selection.startColumn - 1);
    }
    text += includeChInEdit ? ch : "";
    const range = new Range(startLineNumber, 1, selection.endLineNumber, selection.endColumn);
    return { range, text };
  }
}
class AutoClosingOvertypeOperation {
  static getEdits(prevEditOperationType, config, model, selections, autoClosedCharacters, ch) {
    if (isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch)) {
      return this._runAutoClosingOvertype(prevEditOperationType, selections, ch);
    }
    return;
  }
  static _runAutoClosingOvertype(prevEditOperationType, selections, ch) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      const position = selection.getPosition();
      const typeSelection = new Range(position.lineNumber, position.column, position.lineNumber, position.column + 1);
      commands[i] = new ReplaceCommand(typeSelection, ch);
    }
    return new EditOperationResult(EditOperationType.TypingOther, commands, {
      shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, EditOperationType.TypingOther),
      shouldPushStackElementAfter: false
    });
  }
}
class AutoClosingOvertypeWithInterceptorsOperation {
  static getEdits(config, model, selections, autoClosedCharacters, ch) {
    if (isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch)) {
      const commands = selections.map((s) => new ReplaceCommand(new Range(s.positionLineNumber, s.positionColumn, s.positionLineNumber, s.positionColumn + 1), "", false));
      return new EditOperationResult(EditOperationType.TypingOther, commands, {
        shouldPushStackElementBefore: true,
        shouldPushStackElementAfter: false
      });
    }
    return;
  }
}
class AutoClosingOpenCharTypeOperation {
  static getEdits(config, model, selections, ch, chIsAlreadyTyped, isDoingComposition) {
    if (!isDoingComposition) {
      const autoClosingPairClose = this.getAutoClosingPairClose(config, model, selections, ch, chIsAlreadyTyped);
      if (autoClosingPairClose !== null) {
        return this._runAutoClosingOpenCharType(selections, ch, chIsAlreadyTyped, autoClosingPairClose);
      }
    }
    return;
  }
  static _runAutoClosingOpenCharType(selections, ch, chIsAlreadyTyped, autoClosingPairClose) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      commands[i] = new TypeWithAutoClosingCommand(selection, ch, !chIsAlreadyTyped, autoClosingPairClose);
    }
    return new EditOperationResult(EditOperationType.TypingOther, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: false
    });
  }
  static getAutoClosingPairClose(config, model, selections, ch, chIsAlreadyTyped) {
    for (const selection of selections) {
      if (!selection.isEmpty()) {
        return null;
      }
    }
    const positions = selections.map((s) => {
      const position = s.getPosition();
      if (chIsAlreadyTyped) {
        return { lineNumber: position.lineNumber, beforeColumn: position.column - ch.length, afterColumn: position.column };
      } else {
        return { lineNumber: position.lineNumber, beforeColumn: position.column, afterColumn: position.column };
      }
    });
    const pair = this._findAutoClosingPairOpen(config, model, positions.map((p) => new Position(p.lineNumber, p.beforeColumn)), ch);
    if (!pair) {
      return null;
    }
    let autoCloseConfig;
    let shouldAutoCloseBefore;
    const chIsQuote = isQuote(ch);
    if (chIsQuote) {
      autoCloseConfig = config.autoClosingQuotes;
      shouldAutoCloseBefore = config.shouldAutoCloseBefore.quote;
    } else {
      const pairIsForComments = config.blockCommentStartToken ? pair.open.includes(config.blockCommentStartToken) : false;
      if (pairIsForComments) {
        autoCloseConfig = config.autoClosingComments;
        shouldAutoCloseBefore = config.shouldAutoCloseBefore.comment;
      } else {
        autoCloseConfig = config.autoClosingBrackets;
        shouldAutoCloseBefore = config.shouldAutoCloseBefore.bracket;
      }
    }
    if (autoCloseConfig === "never") {
      return null;
    }
    const containedPair = this._findContainedAutoClosingPair(config, pair);
    const containedPairClose = containedPair ? containedPair.close : "";
    let isContainedPairPresent = true;
    for (const position of positions) {
      const { lineNumber, beforeColumn, afterColumn } = position;
      const lineText = model.getLineContent(lineNumber);
      const lineBefore = lineText.substring(0, beforeColumn - 1);
      const lineAfter = lineText.substring(afterColumn - 1);
      if (!lineAfter.startsWith(containedPairClose)) {
        isContainedPairPresent = false;
      }
      if (lineAfter.length > 0) {
        const characterAfter = lineAfter.charAt(0);
        const isBeforeCloseBrace = this._isBeforeClosingBrace(config, lineAfter);
        if (!isBeforeCloseBrace && !shouldAutoCloseBefore(characterAfter)) {
          return null;
        }
      }
      if (pair.open.length === 1 && (ch === "'" || ch === '"') && autoCloseConfig !== "always") {
        const wordSeparators = getMapForWordSeparators(config.wordSeparators, []);
        if (lineBefore.length > 0) {
          const characterBefore = lineBefore.charCodeAt(lineBefore.length - 1);
          if (wordSeparators.get(characterBefore) === WordCharacterClass.Regular) {
            return null;
          }
        }
      }
      if (!model.tokenization.isCheapToTokenize(lineNumber)) {
        return null;
      }
      model.tokenization.forceTokenization(lineNumber);
      const lineTokens = model.tokenization.getLineTokens(lineNumber);
      const scopedLineTokens = createScopedLineTokens(lineTokens, beforeColumn - 1);
      if (!pair.shouldAutoClose(scopedLineTokens, beforeColumn - scopedLineTokens.firstCharOffset)) {
        return null;
      }
      const neutralCharacter = pair.findNeutralCharacter();
      if (neutralCharacter) {
        const tokenType = model.tokenization.getTokenTypeIfInsertingCharacter(lineNumber, beforeColumn, neutralCharacter);
        if (!pair.isOK(tokenType)) {
          return null;
        }
      }
    }
    if (isContainedPairPresent) {
      return pair.close.substring(0, pair.close.length - containedPairClose.length);
    } else {
      return pair.close;
    }
  }
  /**
   * Find another auto-closing pair that is contained by the one passed in.
   *
   * e.g. when having [(,)] and [(*,*)] as auto-closing pairs
   * this method will find [(,)] as a containment pair for [(*,*)]
   */
  static _findContainedAutoClosingPair(config, pair) {
    if (pair.open.length <= 1) {
      return null;
    }
    const lastChar = pair.close.charAt(pair.close.length - 1);
    const candidates = config.autoClosingPairs.autoClosingPairsCloseByEnd.get(lastChar) || [];
    let result = null;
    for (const candidate of candidates) {
      if (candidate.open !== pair.open && pair.open.includes(candidate.open) && pair.close.endsWith(candidate.close)) {
        if (!result || candidate.open.length > result.open.length) {
          result = candidate;
        }
      }
    }
    return result;
  }
  /**
   * Determine if typing `ch` at all `positions` in the `model` results in an
   * auto closing open sequence being typed.
   *
   * Auto closing open sequences can consist of multiple characters, which
   * can lead to ambiguities. In such a case, the longest auto-closing open
   * sequence is returned.
   */
  static _findAutoClosingPairOpen(config, model, positions, ch) {
    const candidates = config.autoClosingPairs.autoClosingPairsOpenByEnd.get(ch);
    if (!candidates) {
      return null;
    }
    let result = null;
    for (const candidate of candidates) {
      if (result === null || candidate.open.length > result.open.length) {
        let candidateIsMatch = true;
        for (const position of positions) {
          const relevantText = model.getValueInRange(new Range(position.lineNumber, position.column - candidate.open.length + 1, position.lineNumber, position.column));
          if (relevantText + ch !== candidate.open) {
            candidateIsMatch = false;
            break;
          }
        }
        if (candidateIsMatch) {
          result = candidate;
        }
      }
    }
    return result;
  }
  static _isBeforeClosingBrace(config, lineAfter) {
    const nextChar = lineAfter.charAt(0);
    const potentialStartingBraces = config.autoClosingPairs.autoClosingPairsOpenByStart.get(nextChar) || [];
    const potentialClosingBraces = config.autoClosingPairs.autoClosingPairsCloseByStart.get(nextChar) || [];
    const isBeforeStartingBrace = potentialStartingBraces.some((x) => lineAfter.startsWith(x.open));
    const isBeforeClosingBrace = potentialClosingBraces.some((x) => lineAfter.startsWith(x.close));
    return !isBeforeStartingBrace && isBeforeClosingBrace;
  }
}
class CompositionEndOvertypeOperation {
  static getEdits(config, compositions) {
    const isOvertypeMode = config.inputMode === "overtype";
    if (!isOvertypeMode) {
      return null;
    }
    const commands = compositions.map((composition) => new ReplaceOvertypeCommandOnCompositionEnd(composition.insertedTextRange));
    return new EditOperationResult(EditOperationType.TypingOther, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: false
    });
  }
}
class SurroundSelectionOperation {
  static getEdits(config, model, selections, ch, isDoingComposition) {
    if (!isDoingComposition && this._isSurroundSelectionType(config, model, selections, ch)) {
      return this._runSurroundSelectionType(config, selections, ch);
    }
    return;
  }
  static _runSurroundSelectionType(config, selections, ch) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      const closeCharacter = config.surroundingPairs[ch];
      commands[i] = new SurroundSelectionCommand(selection, ch, closeCharacter);
    }
    return new EditOperationResult(EditOperationType.Other, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: true
    });
  }
  static _isSurroundSelectionType(config, model, selections, ch) {
    if (!shouldSurroundChar(config, ch) || !config.surroundingPairs.hasOwnProperty(ch)) {
      return false;
    }
    const isTypingAQuoteCharacter = isQuote(ch);
    for (const selection of selections) {
      if (selection.isEmpty()) {
        return false;
      }
      let selectionContainsOnlyWhitespace = true;
      for (let lineNumber = selection.startLineNumber; lineNumber <= selection.endLineNumber; lineNumber++) {
        const lineText = model.getLineContent(lineNumber);
        const startIndex = lineNumber === selection.startLineNumber ? selection.startColumn - 1 : 0;
        const endIndex = lineNumber === selection.endLineNumber ? selection.endColumn - 1 : lineText.length;
        const selectedText = lineText.substring(startIndex, endIndex);
        if (/[^ \t]/.test(selectedText)) {
          selectionContainsOnlyWhitespace = false;
          break;
        }
      }
      if (selectionContainsOnlyWhitespace) {
        return false;
      }
      if (isTypingAQuoteCharacter && selection.startLineNumber === selection.endLineNumber && selection.startColumn + 1 === selection.endColumn) {
        const selectionText = model.getValueInRange(selection);
        if (isQuote(selectionText)) {
          return false;
        }
      }
    }
    return true;
  }
}
class InterceptorElectricCharOperation {
  static getEdits(prevEditOperationType, config, model, selections, ch, isDoingComposition) {
    if (!isDoingComposition && this._isTypeInterceptorElectricChar(config, model, selections)) {
      const r = this._typeInterceptorElectricChar(prevEditOperationType, config, model, selections[0], ch);
      if (r) {
        return r;
      }
    }
    return;
  }
  static _isTypeInterceptorElectricChar(config, model, selections) {
    if (selections.length === 1 && model.tokenization.isCheapToTokenize(selections[0].getEndPosition().lineNumber)) {
      return true;
    }
    return false;
  }
  static _typeInterceptorElectricChar(prevEditOperationType, config, model, selection, ch) {
    if (!config.electricChars.hasOwnProperty(ch) || !selection.isEmpty()) {
      return null;
    }
    const position = selection.getPosition();
    model.tokenization.forceTokenization(position.lineNumber);
    const lineTokens = model.tokenization.getLineTokens(position.lineNumber);
    let electricAction;
    try {
      electricAction = config.onElectricCharacter(ch, lineTokens, position.column);
    } catch (e) {
      onUnexpectedError(e);
      return null;
    }
    if (!electricAction) {
      return null;
    }
    if (electricAction.matchOpenBracket) {
      const endColumn = (lineTokens.getLineContent() + ch).lastIndexOf(electricAction.matchOpenBracket) + 1;
      const match = model.bracketPairs.findMatchingBracketUp(
        electricAction.matchOpenBracket,
        {
          lineNumber: position.lineNumber,
          column: endColumn
        },
        500
        /* give at most 500ms to compute */
      );
      if (match) {
        if (match.startLineNumber === position.lineNumber) {
          return null;
        }
        const matchLine = model.getLineContent(match.startLineNumber);
        const matchLineIndentation = strings.getLeadingWhitespace(matchLine);
        const newIndentation = config.normalizeIndentation(matchLineIndentation);
        const lineText = model.getLineContent(position.lineNumber);
        const lineFirstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(position.lineNumber) || position.column;
        const prefix = lineText.substring(lineFirstNonBlankColumn - 1, position.column - 1);
        const typeText = newIndentation + prefix + ch;
        const typeSelection = new Range(position.lineNumber, 1, position.lineNumber, position.column);
        const command = new ReplaceCommand(typeSelection, typeText);
        return new EditOperationResult(getTypingOperation(typeText, prevEditOperationType), [command], {
          shouldPushStackElementBefore: false,
          shouldPushStackElementAfter: true
        });
      }
    }
    return null;
  }
}
class SimpleCharacterTypeOperation {
  static getEdits(config, prevEditOperationType, selections, ch, isDoingComposition) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const ChosenReplaceCommand = config.inputMode === "overtype" && !isDoingComposition ? ReplaceOvertypeCommand : ReplaceCommand;
      commands[i] = new ChosenReplaceCommand(selections[i], ch);
    }
    const opType = getTypingOperation(ch, prevEditOperationType);
    return new EditOperationResult(opType, commands, {
      shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, opType),
      shouldPushStackElementAfter: false
    });
  }
}
class EnterOperation {
  static getEdits(config, model, selections, ch, isDoingComposition) {
    if (!isDoingComposition && ch === "\n") {
      const commands = [];
      for (let i = 0, len = selections.length; i < len; i++) {
        commands[i] = this._enter(config, model, false, selections[i]);
      }
      return new EditOperationResult(EditOperationType.TypingOther, commands, {
        shouldPushStackElementBefore: true,
        shouldPushStackElementAfter: false
      });
    }
    return;
  }
  static _enter(config, model, keepPosition, range) {
    if (config.autoIndent === EditorAutoIndentStrategy.None) {
      return typeCommand(range, "\n", keepPosition);
    }
    if (!model.tokenization.isCheapToTokenize(range.getStartPosition().lineNumber) || config.autoIndent === EditorAutoIndentStrategy.Keep) {
      const lineText2 = model.getLineContent(range.startLineNumber);
      const indentation2 = strings.getLeadingWhitespace(lineText2).substring(0, range.startColumn - 1);
      return typeCommand(range, "\n" + config.normalizeIndentation(indentation2), keepPosition);
    }
    const r = getEnterAction(config.autoIndent, model, range, config.languageConfigurationService);
    if (r) {
      if (r.indentAction === IndentAction.None) {
        return typeCommand(range, "\n" + config.normalizeIndentation(r.indentation + r.appendText), keepPosition);
      } else if (r.indentAction === IndentAction.Indent) {
        return typeCommand(range, "\n" + config.normalizeIndentation(r.indentation + r.appendText), keepPosition);
      } else if (r.indentAction === IndentAction.IndentOutdent) {
        const normalIndent = config.normalizeIndentation(r.indentation);
        const increasedIndent = config.normalizeIndentation(r.indentation + r.appendText);
        const typeText = "\n" + increasedIndent + "\n" + normalIndent;
        if (keepPosition) {
          return new ReplaceCommandWithoutChangingPosition(range, typeText, true);
        } else {
          return new ReplaceCommandWithOffsetCursorState(range, typeText, -1, increasedIndent.length - normalIndent.length, true);
        }
      } else if (r.indentAction === IndentAction.Outdent) {
        const actualIndentation = unshiftIndent(config, r.indentation);
        return typeCommand(range, "\n" + config.normalizeIndentation(actualIndentation + r.appendText), keepPosition);
      }
    }
    const lineText = model.getLineContent(range.startLineNumber);
    const indentation = strings.getLeadingWhitespace(lineText).substring(0, range.startColumn - 1);
    if (config.autoIndent >= EditorAutoIndentStrategy.Full) {
      const ir = getIndentForEnter(config.autoIndent, model, range, {
        unshiftIndent: (indent) => {
          return unshiftIndent(config, indent);
        },
        shiftIndent: (indent) => {
          return shiftIndent(config, indent);
        },
        normalizeIndentation: (indent) => {
          return config.normalizeIndentation(indent);
        }
      }, config.languageConfigurationService);
      if (ir) {
        let oldEndViewColumn = config.visibleColumnFromColumn(model, range.getEndPosition());
        const oldEndColumn = range.endColumn;
        const newLineContent = model.getLineContent(range.endLineNumber);
        const firstNonWhitespace = strings.firstNonWhitespaceIndex(newLineContent);
        if (firstNonWhitespace >= 0) {
          range = range.setEndPosition(range.endLineNumber, Math.max(range.endColumn, firstNonWhitespace + 1));
        } else {
          range = range.setEndPosition(range.endLineNumber, model.getLineMaxColumn(range.endLineNumber));
        }
        if (keepPosition) {
          return new ReplaceCommandWithoutChangingPosition(range, "\n" + config.normalizeIndentation(ir.afterEnter), true);
        } else {
          let offset = 0;
          if (oldEndColumn <= firstNonWhitespace + 1) {
            if (!config.insertSpaces) {
              oldEndViewColumn = Math.ceil(oldEndViewColumn / config.indentSize);
            }
            offset = Math.min(oldEndViewColumn + 1 - config.normalizeIndentation(ir.afterEnter).length - 1, 0);
          }
          return new ReplaceCommandWithOffsetCursorState(range, "\n" + config.normalizeIndentation(ir.afterEnter), 0, offset, true);
        }
      }
    }
    return typeCommand(range, "\n" + config.normalizeIndentation(indentation), keepPosition);
  }
  static lineInsertBefore(config, model, selections) {
    if (model === null || selections === null) {
      return [];
    }
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      let lineNumber = selections[i].positionLineNumber;
      if (lineNumber === 1) {
        commands[i] = new ReplaceCommandWithoutChangingPosition(new Range(1, 1, 1, 1), "\n");
      } else {
        lineNumber--;
        const column = model.getLineMaxColumn(lineNumber);
        commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
      }
    }
    return commands;
  }
  static lineInsertAfter(config, model, selections) {
    if (model === null || selections === null) {
      return [];
    }
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const lineNumber = selections[i].positionLineNumber;
      const column = model.getLineMaxColumn(lineNumber);
      commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
    }
    return commands;
  }
  static lineBreakInsert(config, model, selections) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      commands[i] = this._enter(config, model, true, selections[i]);
    }
    return commands;
  }
}
class PasteOperation {
  static getEdits(config, model, selections, text, pasteOnNewLine, multicursorText) {
    const distributedPaste = this._distributePasteToCursors(config, selections, text, pasteOnNewLine, multicursorText);
    if (distributedPaste) {
      selections = selections.sort(Range.compareRangesUsingStarts);
      return this._distributedPaste(config, model, selections, distributedPaste);
    } else {
      return this._simplePaste(config, model, selections, text, pasteOnNewLine);
    }
  }
  static _distributePasteToCursors(config, selections, text, pasteOnNewLine, multicursorText) {
    if (selections.length === 1) {
      return null;
    }
    if (multicursorText && multicursorText.length === selections.length) {
      return multicursorText;
    }
    if (pasteOnNewLine) {
      return null;
    }
    if (config.multiCursorPaste === "spread") {
      if (text.charCodeAt(text.length - 1) === CharCode.LineFeed) {
        text = text.substring(0, text.length - 1);
      }
      if (text.charCodeAt(text.length - 1) === CharCode.CarriageReturn) {
        text = text.substring(0, text.length - 1);
      }
      const lines = strings.splitLines(text);
      if (lines.length === selections.length) {
        return lines;
      }
    }
    return null;
  }
  static _distributedPaste(config, model, selections, text) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const shouldOvertypeOnPaste = config.overtypeOnPaste && config.inputMode === "overtype";
      const ChosenReplaceCommand = shouldOvertypeOnPaste ? ReplaceOvertypeCommand : ReplaceCommand;
      commands[i] = new ChosenReplaceCommand(selections[i], text[i]);
    }
    return new EditOperationResult(EditOperationType.Other, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: true
    });
  }
  static _simplePaste(config, model, selections, text, pasteOnNewLine) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      const position = selection.getPosition();
      if (pasteOnNewLine && !selection.isEmpty()) {
        pasteOnNewLine = false;
      }
      if (pasteOnNewLine && text.indexOf("\n") !== text.length - 1) {
        pasteOnNewLine = false;
      }
      if (pasteOnNewLine) {
        const typeSelection = new Range(position.lineNumber, 1, position.lineNumber, 1);
        commands[i] = new ReplaceCommandThatPreservesSelection(typeSelection, text, selection, true);
      } else {
        const shouldOvertypeOnPaste = config.overtypeOnPaste && config.inputMode === "overtype";
        const ChosenReplaceCommand = shouldOvertypeOnPaste ? ReplaceOvertypeCommand : ReplaceCommand;
        commands[i] = new ChosenReplaceCommand(selection, text);
      }
    }
    return new EditOperationResult(EditOperationType.Other, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: true
    });
  }
}
class CompositionOperation {
  static getEdits(prevEditOperationType, config, model, selections, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
    const commands = selections.map((selection) => this._compositionType(model, selection, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta));
    return new EditOperationResult(EditOperationType.TypingOther, commands, {
      shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, EditOperationType.TypingOther),
      shouldPushStackElementAfter: false
    });
  }
  static _compositionType(model, selection, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
    if (!selection.isEmpty()) {
      return null;
    }
    const pos = selection.getPosition();
    const startColumn = Math.max(1, pos.column - replacePrevCharCnt);
    const endColumn = Math.min(model.getLineMaxColumn(pos.lineNumber), pos.column + replaceNextCharCnt);
    const range = new Range(pos.lineNumber, startColumn, pos.lineNumber, endColumn);
    return new ReplaceCommandWithOffsetCursorState(range, text, 0, positionDelta);
  }
}
class TypeWithoutInterceptorsOperation {
  static getEdits(prevEditOperationType, selections, str) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      commands[i] = new ReplaceCommand(selections[i], str);
    }
    const opType = getTypingOperation(str, prevEditOperationType);
    return new EditOperationResult(opType, commands, {
      shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, opType),
      shouldPushStackElementAfter: false
    });
  }
}
class TabOperation {
  static getCommands(config, model, selections) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      if (selection.isEmpty()) {
        const lineText = model.getLineContent(selection.startLineNumber);
        if (/^\s*$/.test(lineText) && model.tokenization.isCheapToTokenize(selection.startLineNumber)) {
          let goodIndent = this._goodIndentForLine(config, model, selection.startLineNumber);
          goodIndent = goodIndent || "	";
          const possibleTypeText = config.normalizeIndentation(goodIndent);
          if (!lineText.startsWith(possibleTypeText)) {
            commands[i] = new ReplaceCommand(new Range(selection.startLineNumber, 1, selection.startLineNumber, lineText.length + 1), possibleTypeText, true);
            continue;
          }
        }
        commands[i] = this._replaceJumpToNextIndent(config, model, selection, true);
      } else {
        if (selection.startLineNumber === selection.endLineNumber) {
          const lineMaxColumn = model.getLineMaxColumn(selection.startLineNumber);
          if (selection.startColumn !== 1 || selection.endColumn !== lineMaxColumn) {
            commands[i] = this._replaceJumpToNextIndent(config, model, selection, false);
            continue;
          }
        }
        commands[i] = new ShiftCommand(selection, {
          isUnshift: false,
          tabSize: config.tabSize,
          indentSize: config.indentSize,
          insertSpaces: config.insertSpaces,
          useTabStops: config.useTabStops,
          autoIndent: config.autoIndent
        }, config.languageConfigurationService);
      }
    }
    return commands;
  }
  static _goodIndentForLine(config, model, lineNumber) {
    let action = null;
    let indentation = "";
    const expectedIndentAction = getInheritIndentForLine(config.autoIndent, model, lineNumber, false, config.languageConfigurationService);
    if (expectedIndentAction) {
      action = expectedIndentAction.action;
      indentation = expectedIndentAction.indentation;
    } else if (lineNumber > 1) {
      let lastLineNumber;
      for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
        const lineText = model.getLineContent(lastLineNumber);
        const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineText);
        if (nonWhitespaceIdx >= 0) {
          break;
        }
      }
      if (lastLineNumber < 1) {
        return null;
      }
      const maxColumn = model.getLineMaxColumn(lastLineNumber);
      const expectedEnterAction = getEnterAction(config.autoIndent, model, new Range(lastLineNumber, maxColumn, lastLineNumber, maxColumn), config.languageConfigurationService);
      if (expectedEnterAction) {
        indentation = expectedEnterAction.indentation + expectedEnterAction.appendText;
      }
    }
    if (action) {
      if (action === IndentAction.Indent) {
        indentation = shiftIndent(config, indentation);
      }
      if (action === IndentAction.Outdent) {
        indentation = unshiftIndent(config, indentation);
      }
      indentation = config.normalizeIndentation(indentation);
    }
    if (!indentation) {
      return null;
    }
    return indentation;
  }
  static _replaceJumpToNextIndent(config, model, selection, insertsAutoWhitespace) {
    let typeText = "";
    const position = selection.getStartPosition();
    if (config.insertSpaces) {
      const visibleColumnFromColumn = config.visibleColumnFromColumn(model, position);
      const indentSize = config.indentSize;
      const spacesCnt = indentSize - visibleColumnFromColumn % indentSize;
      for (let i = 0; i < spacesCnt; i++) {
        typeText += " ";
      }
    } else {
      typeText = "	";
    }
    return new ReplaceCommand(selection, typeText, insertsAutoWhitespace);
  }
}
class BaseTypeWithAutoClosingCommand extends ReplaceCommandWithOffsetCursorState {
  constructor(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter) {
    super(selection, text, lineNumberDeltaOffset, columnDeltaOffset);
    this._openCharacter = openCharacter;
    this._closeCharacter = closeCharacter;
    this.closeCharacterRange = null;
    this.enclosingRange = null;
  }
  _computeCursorStateWithRange(model, range, helper) {
    this.closeCharacterRange = new Range(range.startLineNumber, range.endColumn - this._closeCharacter.length, range.endLineNumber, range.endColumn);
    this.enclosingRange = new Range(range.startLineNumber, range.endColumn - this._openCharacter.length - this._closeCharacter.length, range.endLineNumber, range.endColumn);
    return super.computeCursorState(model, helper);
  }
}
class TypeWithAutoClosingCommand extends BaseTypeWithAutoClosingCommand {
  constructor(selection, openCharacter, insertOpenCharacter, closeCharacter) {
    const text = (insertOpenCharacter ? openCharacter : "") + closeCharacter;
    const lineNumberDeltaOffset = 0;
    const columnDeltaOffset = -closeCharacter.length;
    super(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter);
  }
  computeCursorState(model, helper) {
    const inverseEditOperations = helper.getInverseEditOperations();
    const range = inverseEditOperations[0].range;
    return this._computeCursorStateWithRange(model, range, helper);
  }
}
class TypeWithIndentationAndAutoClosingCommand extends BaseTypeWithAutoClosingCommand {
  constructor(autoIndentationEdit, selection, openCharacter, closeCharacter) {
    const text = openCharacter + closeCharacter;
    const lineNumberDeltaOffset = 0;
    const columnDeltaOffset = openCharacter.length;
    super(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter);
    this._autoIndentationEdit = autoIndentationEdit;
    this._autoClosingEdit = { range: selection, text };
  }
  getEditOperations(model, builder) {
    builder.addTrackedEditOperation(this._autoIndentationEdit.range, this._autoIndentationEdit.text);
    builder.addTrackedEditOperation(this._autoClosingEdit.range, this._autoClosingEdit.text);
  }
  computeCursorState(model, helper) {
    const inverseEditOperations = helper.getInverseEditOperations();
    if (inverseEditOperations.length !== 2) {
      throw new Error("There should be two inverse edit operations!");
    }
    const range1 = inverseEditOperations[0].range;
    const range2 = inverseEditOperations[1].range;
    const range = range1.plusRange(range2);
    return this._computeCursorStateWithRange(model, range, helper);
  }
}
function getTypingOperation(typedText, previousTypingOperation) {
  if (typedText === " ") {
    return previousTypingOperation === EditOperationType.TypingFirstSpace || previousTypingOperation === EditOperationType.TypingConsecutiveSpace ? EditOperationType.TypingConsecutiveSpace : EditOperationType.TypingFirstSpace;
  }
  return EditOperationType.TypingOther;
}
function shouldPushStackElementBetween(previousTypingOperation, typingOperation) {
  if (isTypingOperation(previousTypingOperation) && !isTypingOperation(typingOperation)) {
    return true;
  }
  if (previousTypingOperation === EditOperationType.TypingFirstSpace) {
    return false;
  }
  return normalizeOperationType(previousTypingOperation) !== normalizeOperationType(typingOperation);
}
function normalizeOperationType(type) {
  return type === EditOperationType.TypingConsecutiveSpace || type === EditOperationType.TypingFirstSpace ? "space" : type;
}
function isTypingOperation(type) {
  return type === EditOperationType.TypingOther || type === EditOperationType.TypingFirstSpace || type === EditOperationType.TypingConsecutiveSpace;
}
function isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch) {
  if (config.autoClosingOvertype === "never") {
    return false;
  }
  if (!config.autoClosingPairs.autoClosingPairsCloseSingleChar.has(ch)) {
    return false;
  }
  for (let i = 0, len = selections.length; i < len; i++) {
    const selection = selections[i];
    if (!selection.isEmpty()) {
      return false;
    }
    const position = selection.getPosition();
    const lineText = model.getLineContent(position.lineNumber);
    const afterCharacter = lineText.charAt(position.column - 1);
    if (afterCharacter !== ch) {
      return false;
    }
    const chIsQuote = isQuote(ch);
    const beforeCharacter = position.column > 2 ? lineText.charCodeAt(position.column - 2) : CharCode.Null;
    if (beforeCharacter === CharCode.Backslash && chIsQuote) {
      return false;
    }
    if (config.autoClosingOvertype === "auto") {
      let found = false;
      for (let j = 0, lenJ = autoClosedCharacters.length; j < lenJ; j++) {
        const autoClosedCharacter = autoClosedCharacters[j];
        if (position.lineNumber === autoClosedCharacter.startLineNumber && position.column === autoClosedCharacter.startColumn) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
  }
  return true;
}
function typeCommand(range, text, keepPosition) {
  if (keepPosition) {
    return new ReplaceCommandWithoutChangingPosition(range, text, true);
  } else {
    return new ReplaceCommand(range, text, true);
  }
}
function shiftIndent(config, indentation, count) {
  count = count || 1;
  return ShiftCommand.shiftIndent(indentation, indentation.length + count, config.tabSize, config.indentSize, config.insertSpaces);
}
function unshiftIndent(config, indentation, count) {
  count = count || 1;
  return ShiftCommand.unshiftIndent(indentation, indentation.length + count, config.tabSize, config.indentSize, config.insertSpaces);
}
function shouldSurroundChar(config, ch) {
  if (isQuote(ch)) {
    return config.autoSurround === "quotes" || config.autoSurround === "languageDefined";
  } else {
    return config.autoSurround === "brackets" || config.autoSurround === "languageDefined";
  }
}
export {
  AutoClosingOpenCharTypeOperation,
  AutoClosingOvertypeOperation,
  AutoClosingOvertypeWithInterceptorsOperation,
  AutoIndentOperation,
  BaseTypeWithAutoClosingCommand,
  CompositionEndOvertypeOperation,
  CompositionOperation,
  EnterOperation,
  InterceptorElectricCharOperation,
  PasteOperation,
  SimpleCharacterTypeOperation,
  SurroundSelectionOperation,
  TabOperation,
  TypeWithoutInterceptorsOperation,
  shiftIndent,
  shouldSurroundChar,
  unshiftIndent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY3Vyc29yL2N1cnNvclR5cGVFZGl0T3BlcmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFJlcGxhY2VDb21tYW5kLCBSZXBsYWNlQ29tbWFuZFdpdGhPZmZzZXRDdXJzb3JTdGF0ZSwgUmVwbGFjZUNvbW1hbmRXaXRob3V0Q2hhbmdpbmdQb3NpdGlvbiwgUmVwbGFjZUNvbW1hbmRUaGF0UHJlc2VydmVzU2VsZWN0aW9uLCBSZXBsYWNlT3ZlcnR5cGVDb21tYW5kLCBSZXBsYWNlT3ZlcnR5cGVDb21tYW5kT25Db21wb3NpdGlvbkVuZCB9IGZyb20gJy4uL2NvbW1hbmRzL3JlcGxhY2VDb21tYW5kLmpzJztcbmltcG9ydCB7IFNoaWZ0Q29tbWFuZCB9IGZyb20gJy4uL2NvbW1hbmRzL3NoaWZ0Q29tbWFuZC5qcyc7XG5pbXBvcnQgeyBTdXJyb3VuZFNlbGVjdGlvbkNvbW1hbmQgfSBmcm9tICcuLi9jb21tYW5kcy9zdXJyb3VuZFNlbGVjdGlvbkNvbW1hbmQuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29uZmlndXJhdGlvbiwgRWRpdE9wZXJhdGlvblJlc3VsdCwgRWRpdE9wZXJhdGlvblR5cGUsIElDdXJzb3JTaW1wbGVNb2RlbCwgaXNRdW90ZSB9IGZyb20gJy4uL2N1cnNvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBXb3JkQ2hhcmFjdGVyQ2xhc3MsIGdldE1hcEZvcldvcmRTZXBhcmF0b3JzIH0gZnJvbSAnLi4vY29yZS93b3JkQ2hhcmFjdGVyQ2xhc3NpZmllci5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kLCBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEsIElFZGl0T3BlcmF0aW9uQnVpbGRlciB9IGZyb20gJy4uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgRW50ZXJBY3Rpb24sIEluZGVudEFjdGlvbiwgU3RhbmRhcmRBdXRvQ2xvc2luZ1BhaXJDb25kaXRpb25hbCB9IGZyb20gJy4uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0SW5kZW50YXRpb25BdFBvc2l0aW9uIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElFbGVjdHJpY0FjdGlvbiB9IGZyb20gJy4uL2xhbmd1YWdlcy9zdXBwb3J0cy9lbGVjdHJpY0NoYXJhY3Rlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBdXRvQ2xvc2luZ1N0cmF0ZWd5LCBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kgfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTY29wZWRMaW5lVG9rZW5zIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL3N1cHBvcnRzLmpzJztcbmltcG9ydCB7IGdldEluZGVudEFjdGlvbkZvclR5cGUsIGdldEluZGVudEZvckVudGVyLCBnZXRJbmhlcml0SW5kZW50Rm9yTGluZSB9IGZyb20gJy4uL2xhbmd1YWdlcy9hdXRvSW5kZW50LmpzJztcbmltcG9ydCB7IGdldEVudGVyQWN0aW9uIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2VudGVyQWN0aW9uLmpzJztcbmltcG9ydCB7IENvbXBvc2l0aW9uT3V0Y29tZSB9IGZyb20gJy4vY3Vyc29yVHlwZU9wZXJhdGlvbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgQXV0b0luZGVudE9wZXJhdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFZGl0cyhjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgY2g6IHN0cmluZywgaXNEb2luZ0NvbXBvc2l0aW9uOiBib29sZWFuKTogRWRpdE9wZXJhdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFpc0RvaW5nQ29tcG9zaXRpb24gJiYgdGhpcy5faXNBdXRvSW5kZW50VHlwZShjb25maWcsIG1vZGVsLCBzZWxlY3Rpb25zKSkge1xuXHRcdFx0Y29uc3QgaW5kZW50YXRpb25Gb3JTZWxlY3Rpb25zOiB7IHNlbGVjdGlvbjogU2VsZWN0aW9uOyBpbmRlbnRhdGlvbjogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0XHRjb25zdCBpbmRlbnRhdGlvbiA9IHRoaXMuX2ZpbmRBY3R1YWxJbmRlbnRhdGlvbkZvclNlbGVjdGlvbihjb25maWcsIG1vZGVsLCBzZWxlY3Rpb24sIGNoKTtcblx0XHRcdFx0aWYgKGluZGVudGF0aW9uID09PSBudWxsKSB7XG5cdFx0XHRcdFx0Ly8gQXV0byBpbmRlbnRhdGlvbiBmYWlsZWRcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5kZW50YXRpb25Gb3JTZWxlY3Rpb25zLnB1c2goeyBzZWxlY3Rpb24sIGluZGVudGF0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXV0b0Nsb3NpbmdQYWlyQ2xvc2UgPSBBdXRvQ2xvc2luZ09wZW5DaGFyVHlwZU9wZXJhdGlvbi5nZXRBdXRvQ2xvc2luZ1BhaXJDbG9zZShjb25maWcsIG1vZGVsLCBzZWxlY3Rpb25zLCBjaCwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldEluZGVudGF0aW9uQW5kQXV0b0Nsb3NpbmdQYWlyRWRpdHMoY29uZmlnLCBtb2RlbCwgaW5kZW50YXRpb25Gb3JTZWxlY3Rpb25zLCBjaCwgYXV0b0Nsb3NpbmdQYWlyQ2xvc2UpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNBdXRvSW5kZW50VHlwZShjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSk6IGJvb2xlYW4ge1xuXHRcdGlmIChjb25maWcuYXV0b0luZGVudCA8IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoIW1vZGVsLnRva2VuaXphdGlvbi5pc0NoZWFwVG9Ub2tlbml6ZShzZWxlY3Rpb25zW2ldLmdldEVuZFBvc2l0aW9uKCkubGluZU51bWJlcikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9maW5kQWN0dWFsSW5kZW50YXRpb25Gb3JTZWxlY3Rpb24oY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGNoOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCBhY3R1YWxJbmRlbnRhdGlvbiA9IGdldEluZGVudEFjdGlvbkZvclR5cGUoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9uLCBjaCwge1xuXHRcdFx0c2hpZnRJbmRlbnQ6IChpbmRlbnRhdGlvbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gc2hpZnRJbmRlbnQoY29uZmlnLCBpbmRlbnRhdGlvbik7XG5cdFx0XHR9LFxuXHRcdFx0dW5zaGlmdEluZGVudDogKGluZGVudGF0aW9uKSA9PiB7XG5cdFx0XHRcdHJldHVybiB1bnNoaWZ0SW5kZW50KGNvbmZpZywgaW5kZW50YXRpb24pO1xuXHRcdFx0fSxcblx0XHR9LCBjb25maWcubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRpZiAoYWN0dWFsSW5kZW50YXRpb24gPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRJbmRlbnRhdGlvbiA9IGdldEluZGVudGF0aW9uQXRQb3NpdGlvbihtb2RlbCwgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uKTtcblx0XHRpZiAoYWN0dWFsSW5kZW50YXRpb24gPT09IGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihjdXJyZW50SW5kZW50YXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIGFjdHVhbEluZGVudGF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldEluZGVudGF0aW9uQW5kQXV0b0Nsb3NpbmdQYWlyRWRpdHMoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgaW5kZW50YXRpb25Gb3JTZWxlY3Rpb25zOiB7IHNlbGVjdGlvbjogU2VsZWN0aW9uOyBpbmRlbnRhdGlvbjogc3RyaW5nIH1bXSwgY2g6IHN0cmluZywgYXV0b0Nsb3NpbmdQYWlyQ2xvc2U6IHN0cmluZyB8IG51bGwpOiBFZGl0T3BlcmF0aW9uUmVzdWx0IHtcblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IGluZGVudGF0aW9uRm9yU2VsZWN0aW9ucy5tYXAoKHsgc2VsZWN0aW9uLCBpbmRlbnRhdGlvbiB9KSA9PiB7XG5cdFx0XHRpZiAoYXV0b0Nsb3NpbmdQYWlyQ2xvc2UgIT09IG51bGwpIHtcblx0XHRcdFx0Ly8gQXBwbHkgYm90aCBhdXRvIGNsb3NpbmcgcGFpciBlZGl0cyBhbmQgYXV0byBpbmRlbnRhdGlvbiBlZGl0c1xuXHRcdFx0XHRjb25zdCBpbmRlbnRhdGlvbkVkaXQgPSB0aGlzLl9nZXRFZGl0RnJvbUluZGVudGF0aW9uQW5kU2VsZWN0aW9uKGNvbmZpZywgbW9kZWwsIGluZGVudGF0aW9uLCBzZWxlY3Rpb24sIGNoLCBmYWxzZSk7XG5cdFx0XHRcdHJldHVybiBuZXcgVHlwZVdpdGhJbmRlbnRhdGlvbkFuZEF1dG9DbG9zaW5nQ29tbWFuZChpbmRlbnRhdGlvbkVkaXQsIHNlbGVjdGlvbiwgY2gsIGF1dG9DbG9zaW5nUGFpckNsb3NlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEFwcGx5IG9ubHkgYXV0byBpbmRlbnRhdGlvbiBlZGl0c1xuXHRcdFx0XHRjb25zdCBpbmRlbnRhdGlvbkVkaXQgPSB0aGlzLl9nZXRFZGl0RnJvbUluZGVudGF0aW9uQW5kU2VsZWN0aW9uKGNvbmZpZywgbW9kZWwsIGluZGVudGF0aW9uLCBzZWxlY3Rpb24sIGNoLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuIHR5cGVDb21tYW5kKGluZGVudGF0aW9uRWRpdC5yYW5nZSwgaW5kZW50YXRpb25FZGl0LnRleHQsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBlZGl0T3B0aW9ucyA9IHsgc2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogdHJ1ZSwgc2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyOiBmYWxzZSB9O1xuXHRcdHJldHVybiBuZXcgRWRpdE9wZXJhdGlvblJlc3VsdChFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdPdGhlciwgY29tbWFuZHMsIGVkaXRPcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRFZGl0RnJvbUluZGVudGF0aW9uQW5kU2VsZWN0aW9uKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIGluZGVudGF0aW9uOiBzdHJpbmcsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBjaDogc3RyaW5nLCBpbmNsdWRlQ2hJbkVkaXQ6IGJvb2xlYW4gPSB0cnVlKTogeyByYW5nZTogUmFuZ2U7IHRleHQ6IHN0cmluZyB9IHtcblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbiA9IG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRsZXQgdGV4dDogc3RyaW5nID0gY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKGluZGVudGF0aW9uKTtcblx0XHRpZiAoZmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uICE9PSAwKSB7XG5cdFx0XHRjb25zdCBzdGFydExpbmUgPSBtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0dGV4dCArPSBzdGFydExpbmUuc3Vic3RyaW5nKGZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbiAtIDEsIHNlbGVjdGlvbi5zdGFydENvbHVtbiAtIDEpO1xuXHRcdH1cblx0XHR0ZXh0ICs9IGluY2x1ZGVDaEluRWRpdCA/IGNoIDogJyc7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCAxLCBzZWxlY3Rpb24uZW5kTGluZU51bWJlciwgc2VsZWN0aW9uLmVuZENvbHVtbik7XG5cdFx0cmV0dXJuIHsgcmFuZ2UsIHRleHQgfTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXV0b0Nsb3NpbmdPdmVydHlwZU9wZXJhdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFZGl0cyhwcmV2RWRpdE9wZXJhdGlvblR5cGU6IEVkaXRPcGVyYXRpb25UeXBlLCBjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgYXV0b0Nsb3NlZENoYXJhY3RlcnM6IFJhbmdlW10sIGNoOiBzdHJpbmcpOiBFZGl0T3BlcmF0aW9uUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNBdXRvQ2xvc2luZ092ZXJ0eXBlKGNvbmZpZywgbW9kZWwsIHNlbGVjdGlvbnMsIGF1dG9DbG9zZWRDaGFyYWN0ZXJzLCBjaCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ydW5BdXRvQ2xvc2luZ092ZXJ0eXBlKHByZXZFZGl0T3BlcmF0aW9uVHlwZSwgc2VsZWN0aW9ucywgY2gpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcnVuQXV0b0Nsb3NpbmdPdmVydHlwZShwcmV2RWRpdE9wZXJhdGlvblR5cGU6IEVkaXRPcGVyYXRpb25UeXBlLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgY2g6IHN0cmluZyk6IEVkaXRPcGVyYXRpb25SZXN1bHQge1xuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3QgdHlwZVNlbGVjdGlvbiA9IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiArIDEpO1xuXHRcdFx0Y29tbWFuZHNbaV0gPSBuZXcgUmVwbGFjZUNvbW1hbmQodHlwZVNlbGVjdGlvbiwgY2gpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nT3RoZXIsIGNvbW1hbmRzLCB7XG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlOiBzaG91bGRQdXNoU3RhY2tFbGVtZW50QmV0d2VlbihwcmV2RWRpdE9wZXJhdGlvblR5cGUsIEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ090aGVyKSxcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2Vcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXV0b0Nsb3NpbmdPdmVydHlwZVdpdGhJbnRlcmNlcHRvcnNPcGVyYXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RWRpdHMoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGF1dG9DbG9zZWRDaGFyYWN0ZXJzOiBSYW5nZVtdLCBjaDogc3RyaW5nKTogRWRpdE9wZXJhdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlzQXV0b0Nsb3NpbmdPdmVydHlwZShjb25maWcsIG1vZGVsLCBzZWxlY3Rpb25zLCBhdXRvQ2xvc2VkQ2hhcmFjdGVycywgY2gpKSB7XG5cdFx0XHQvLyBVbmZvcnR1bmF0ZWx5LCB0aGUgY2xvc2UgY2hhcmFjdGVyIGlzIGF0IHRoaXMgcG9pbnQgXCJkb3VibGVkXCIsIHNvIHdlIG5lZWQgdG8gZGVsZXRlIGl0Li4uXG5cdFx0XHRjb25zdCBjb21tYW5kcyA9IHNlbGVjdGlvbnMubWFwKHMgPT4gbmV3IFJlcGxhY2VDb21tYW5kKG5ldyBSYW5nZShzLnBvc2l0aW9uTGluZU51bWJlciwgcy5wb3NpdGlvbkNvbHVtbiwgcy5wb3NpdGlvbkxpbmVOdW1iZXIsIHMucG9zaXRpb25Db2x1bW4gKyAxKSwgJycsIGZhbHNlKSk7XG5cdFx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nT3RoZXIsIGNvbW1hbmRzLCB7XG5cdFx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IHRydWUsXG5cdFx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEF1dG9DbG9zaW5nT3BlbkNoYXJUeXBlT3BlcmF0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldEVkaXRzKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBjaDogc3RyaW5nLCBjaElzQWxyZWFkeVR5cGVkOiBib29sZWFuLCBpc0RvaW5nQ29tcG9zaXRpb246IGJvb2xlYW4pOiBFZGl0T3BlcmF0aW9uUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWlzRG9pbmdDb21wb3NpdGlvbikge1xuXHRcdFx0Y29uc3QgYXV0b0Nsb3NpbmdQYWlyQ2xvc2UgPSB0aGlzLmdldEF1dG9DbG9zaW5nUGFpckNsb3NlKGNvbmZpZywgbW9kZWwsIHNlbGVjdGlvbnMsIGNoLCBjaElzQWxyZWFkeVR5cGVkKTtcblx0XHRcdGlmIChhdXRvQ2xvc2luZ1BhaXJDbG9zZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcnVuQXV0b0Nsb3NpbmdPcGVuQ2hhclR5cGUoc2VsZWN0aW9ucywgY2gsIGNoSXNBbHJlYWR5VHlwZWQsIGF1dG9DbG9zaW5nUGFpckNsb3NlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3J1bkF1dG9DbG9zaW5nT3BlbkNoYXJUeXBlKHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBjaDogc3RyaW5nLCBjaElzQWxyZWFkeVR5cGVkOiBib29sZWFuLCBhdXRvQ2xvc2luZ1BhaXJDbG9zZTogc3RyaW5nKTogRWRpdE9wZXJhdGlvblJlc3VsdCB7XG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uc1tpXTtcblx0XHRcdGNvbW1hbmRzW2ldID0gbmV3IFR5cGVXaXRoQXV0b0Nsb3NpbmdDb21tYW5kKHNlbGVjdGlvbiwgY2gsICFjaElzQWxyZWFkeVR5cGVkLCBhdXRvQ2xvc2luZ1BhaXJDbG9zZSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgRWRpdE9wZXJhdGlvblJlc3VsdChFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdPdGhlciwgY29tbWFuZHMsIHtcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IHRydWUsXG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QWZ0ZXI6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldEF1dG9DbG9zaW5nUGFpckNsb3NlKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBjaDogc3RyaW5nLCBjaElzQWxyZWFkeVR5cGVkOiBib29sZWFuKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0aWYgKCFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYm90aCB3aGVuIHR5cGluZyAocmVndWxhcmx5KSBhbmQgd2hlbiBjb21wb3NpdGlvbiBlbmRzXG5cdFx0Ly8gVGhpcyBtZWFucyB0aGF0IHdlIG5lZWQgdG8gd29yayB3aXRoIGEgdGV4dCBidWZmZXIgd2hlcmUgc29tZXRpbWVzIGBjaGAgaXMgbm90XG5cdFx0Ly8gdGhlcmUgKGl0IGlzIGJlaW5nIHR5cGVkIHJpZ2h0IG5vdykgb3Igd2l0aCBhIHRleHQgYnVmZmVyIHdoZXJlIGBjaGAgaGFzIGFscmVhZHkgYmVlbiB0eXBlZFxuXHRcdC8vXG5cdFx0Ly8gSW4gb3JkZXIgdG8gYXZvaWQgYWRkaW5nIGNoZWNrcyBmb3IgYGNoSXNBbHJlYWR5VHlwZWRgIGluIGFsbCBwbGFjZXMsIHdlIHdpbGwgd29ya1xuXHRcdC8vIHdpdGggdHdvIGNvbmNlcHR1YWwgcG9zaXRpb25zLCB0aGUgcG9zaXRpb24gYmVmb3JlIGBjaGAgYW5kIHRoZSBwb3NpdGlvbiBhZnRlciBgY2hgXG5cdFx0Ly9cblx0XHRjb25zdCBwb3NpdGlvbnM6IHsgbGluZU51bWJlcjogbnVtYmVyOyBiZWZvcmVDb2x1bW46IG51bWJlcjsgYWZ0ZXJDb2x1bW46IG51bWJlciB9W10gPSBzZWxlY3Rpb25zLm1hcCgocykgPT4ge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBzLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRpZiAoY2hJc0FscmVhZHlUeXBlZCkge1xuXHRcdFx0XHRyZXR1cm4geyBsaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLCBiZWZvcmVDb2x1bW46IHBvc2l0aW9uLmNvbHVtbiAtIGNoLmxlbmd0aCwgYWZ0ZXJDb2x1bW46IHBvc2l0aW9uLmNvbHVtbiB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHsgbGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgYmVmb3JlQ29sdW1uOiBwb3NpdGlvbi5jb2x1bW4sIGFmdGVyQ29sdW1uOiBwb3NpdGlvbi5jb2x1bW4gfTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHQvLyBGaW5kIHRoZSBsb25nZXN0IGF1dG8tY2xvc2luZyBvcGVuIHBhaXIgaW4gY2FzZSBvZiBtdWx0aXBsZSBlbmRpbmcgaW4gYGNoYFxuXHRcdC8vIGUuZy4gd2hlbiBoYXZpbmcgW2ZcIixcIl0gYW5kIFtcIixcIl0sIGl0IHBpY2tzIFtmXCIsXCJdIGlmIHRoZSBjaGFyYWN0ZXIgYmVmb3JlIGlzIGZcblx0XHRjb25zdCBwYWlyID0gdGhpcy5fZmluZEF1dG9DbG9zaW5nUGFpck9wZW4oY29uZmlnLCBtb2RlbCwgcG9zaXRpb25zLm1hcChwID0+IG5ldyBQb3NpdGlvbihwLmxpbmVOdW1iZXIsIHAuYmVmb3JlQ29sdW1uKSksIGNoKTtcblx0XHRpZiAoIXBhaXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRsZXQgYXV0b0Nsb3NlQ29uZmlnOiBFZGl0b3JBdXRvQ2xvc2luZ1N0cmF0ZWd5O1xuXHRcdGxldCBzaG91bGRBdXRvQ2xvc2VCZWZvcmU6IChjaDogc3RyaW5nKSA9PiBib29sZWFuO1xuXG5cdFx0Y29uc3QgY2hJc1F1b3RlID0gaXNRdW90ZShjaCk7XG5cdFx0aWYgKGNoSXNRdW90ZSkge1xuXHRcdFx0YXV0b0Nsb3NlQ29uZmlnID0gY29uZmlnLmF1dG9DbG9zaW5nUXVvdGVzO1xuXHRcdFx0c2hvdWxkQXV0b0Nsb3NlQmVmb3JlID0gY29uZmlnLnNob3VsZEF1dG9DbG9zZUJlZm9yZS5xdW90ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcGFpcklzRm9yQ29tbWVudHMgPSBjb25maWcuYmxvY2tDb21tZW50U3RhcnRUb2tlbiA/IHBhaXIub3Blbi5pbmNsdWRlcyhjb25maWcuYmxvY2tDb21tZW50U3RhcnRUb2tlbikgOiBmYWxzZTtcblx0XHRcdGlmIChwYWlySXNGb3JDb21tZW50cykge1xuXHRcdFx0XHRhdXRvQ2xvc2VDb25maWcgPSBjb25maWcuYXV0b0Nsb3NpbmdDb21tZW50cztcblx0XHRcdFx0c2hvdWxkQXV0b0Nsb3NlQmVmb3JlID0gY29uZmlnLnNob3VsZEF1dG9DbG9zZUJlZm9yZS5jb21tZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXV0b0Nsb3NlQ29uZmlnID0gY29uZmlnLmF1dG9DbG9zaW5nQnJhY2tldHM7XG5cdFx0XHRcdHNob3VsZEF1dG9DbG9zZUJlZm9yZSA9IGNvbmZpZy5zaG91bGRBdXRvQ2xvc2VCZWZvcmUuYnJhY2tldDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGF1dG9DbG9zZUNvbmZpZyA9PT0gJ25ldmVyJykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdC8vIFNvbWV0aW1lcywgaXQgaXMgcG9zc2libGUgdG8gaGF2ZSB0d28gYXV0by1jbG9zaW5nIHBhaXJzIHRoYXQgaGF2ZSBhIGNvbnRhaW5tZW50IHJlbGF0aW9uc2hpcFxuXHRcdC8vIGUuZy4gd2hlbiBoYXZpbmcgWygsKV0gYW5kIFsoKiwqKV1cblx0XHQvLyAtIHdoZW4gdHlwaW5nICgsIHRoZSByZXN1bHRpbmcgc3RhdGUgaXMgKHwpXG5cdFx0Ly8gLSB3aGVuIHR5cGluZyAqLCB0aGUgZGVzaXJlZCByZXN1bHRpbmcgc3RhdGUgaXMgKCp8KiksIG5vdCAoKnwqKSlcblx0XHRjb25zdCBjb250YWluZWRQYWlyID0gdGhpcy5fZmluZENvbnRhaW5lZEF1dG9DbG9zaW5nUGFpcihjb25maWcsIHBhaXIpO1xuXHRcdGNvbnN0IGNvbnRhaW5lZFBhaXJDbG9zZSA9IGNvbnRhaW5lZFBhaXIgPyBjb250YWluZWRQYWlyLmNsb3NlIDogJyc7XG5cdFx0bGV0IGlzQ29udGFpbmVkUGFpclByZXNlbnQgPSB0cnVlO1xuXG5cdFx0Zm9yIChjb25zdCBwb3NpdGlvbiBvZiBwb3NpdGlvbnMpIHtcblx0XHRcdGNvbnN0IHsgbGluZU51bWJlciwgYmVmb3JlQ29sdW1uLCBhZnRlckNvbHVtbiB9ID0gcG9zaXRpb247XG5cdFx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgbGluZUJlZm9yZSA9IGxpbmVUZXh0LnN1YnN0cmluZygwLCBiZWZvcmVDb2x1bW4gLSAxKTtcblx0XHRcdGNvbnN0IGxpbmVBZnRlciA9IGxpbmVUZXh0LnN1YnN0cmluZyhhZnRlckNvbHVtbiAtIDEpO1xuXG5cdFx0XHRpZiAoIWxpbmVBZnRlci5zdGFydHNXaXRoKGNvbnRhaW5lZFBhaXJDbG9zZSkpIHtcblx0XHRcdFx0aXNDb250YWluZWRQYWlyUHJlc2VudCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gT25seSBjb25zaWRlciBhdXRvIGNsb3NpbmcgdGhlIHBhaXIgaWYgYW4gYWxsb3dlZCBjaGFyYWN0ZXIgZm9sbG93cyBvciBpZiBhbm90aGVyIGF1dG9jbG9zZWQgcGFpciBjbG9zaW5nIGJyYWNlIGZvbGxvd3Ncblx0XHRcdGlmIChsaW5lQWZ0ZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBjaGFyYWN0ZXJBZnRlciA9IGxpbmVBZnRlci5jaGFyQXQoMCk7XG5cdFx0XHRcdGNvbnN0IGlzQmVmb3JlQ2xvc2VCcmFjZSA9IHRoaXMuX2lzQmVmb3JlQ2xvc2luZ0JyYWNlKGNvbmZpZywgbGluZUFmdGVyKTtcblx0XHRcdFx0aWYgKCFpc0JlZm9yZUNsb3NlQnJhY2UgJiYgIXNob3VsZEF1dG9DbG9zZUJlZm9yZShjaGFyYWN0ZXJBZnRlcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gRG8gbm90IGF1dG8tY2xvc2UgJyBvciBcIiBhZnRlciBhIHdvcmQgY2hhcmFjdGVyXG5cdFx0XHRpZiAocGFpci5vcGVuLmxlbmd0aCA9PT0gMSAmJiAoY2ggPT09ICdcXCcnIHx8IGNoID09PSAnXCInKSAmJiBhdXRvQ2xvc2VDb25maWcgIT09ICdhbHdheXMnKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoY29uZmlnLndvcmRTZXBhcmF0b3JzLCBbXSk7XG5cdFx0XHRcdGlmIChsaW5lQmVmb3JlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBjaGFyYWN0ZXJCZWZvcmUgPSBsaW5lQmVmb3JlLmNoYXJDb2RlQXQobGluZUJlZm9yZS5sZW5ndGggLSAxKTtcblx0XHRcdFx0XHRpZiAod29yZFNlcGFyYXRvcnMuZ2V0KGNoYXJhY3RlckJlZm9yZSkgPT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5SZWd1bGFyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghbW9kZWwudG9rZW5pemF0aW9uLmlzQ2hlYXBUb1Rva2VuaXplKGxpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdC8vIERvIG5vdCBmb3JjZSB0b2tlbml6YXRpb25cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBsaW5lVG9rZW5zID0gbW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBzY29wZWRMaW5lVG9rZW5zID0gY3JlYXRlU2NvcGVkTGluZVRva2VucyhsaW5lVG9rZW5zLCBiZWZvcmVDb2x1bW4gLSAxKTtcblx0XHRcdGlmICghcGFpci5zaG91bGRBdXRvQ2xvc2Uoc2NvcGVkTGluZVRva2VucywgYmVmb3JlQ29sdW1uIC0gc2NvcGVkTGluZVRva2Vucy5maXJzdENoYXJPZmZzZXQpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVHlwaW5nIGZvciBleGFtcGxlIGEgcXVvdGUgY291bGQgZWl0aGVyIHN0YXJ0IGEgbmV3IHN0cmluZywgaW4gd2hpY2ggY2FzZSBhdXRvLWNsb3NpbmcgaXMgZGVzaXJhYmxlXG5cdFx0XHQvLyBvciBpdCBjb3VsZCBlbmQgYSBwcmV2aW91c2x5IHN0YXJ0ZWQgc3RyaW5nLCBpbiB3aGljaCBjYXNlIGF1dG8tY2xvc2luZyBpcyBub3QgZGVzaXJhYmxlXG5cdFx0XHQvL1xuXHRcdFx0Ly8gSW4gY2VydGFpbiBjYXNlcywgaXQgaXMgcmVhbGx5IG5vdCBwb3NzaWJsZSB0byBsb29rIGF0IHRoZSBwcmV2aW91cyB0b2tlbiB0byBkZXRlcm1pbmVcblx0XHRcdC8vIHdoYXQgd291bGQgaGFwcGVuLiBUaGF0J3Mgd2h5IHdlIGRvIHNvbWV0aGluZyByZWFsbHkgdW51c3VhbCwgd2UgcHJldGVuZCB0byB0eXBlIGEgZGlmZmVyZW50XG5cdFx0XHQvLyBjaGFyYWN0ZXIgYW5kIGFzayB0aGUgdG9rZW5pemVyIHdoYXQgdGhlIG91dGNvbWUgb2YgZG9pbmcgdGhhdCBpczogYWZ0ZXIgdHlwaW5nIGEgbmV1dHJhbFxuXHRcdFx0Ly8gY2hhcmFjdGVyLCBhcmUgd2UgaW4gYSBzdHJpbmcgKGkuZS4gdGhlIHF1b3RlIHdvdWxkIG1vc3QgbGlrZWx5IGVuZCBhIHN0cmluZykgb3Igbm90P1xuXHRcdFx0Ly9cblx0XHRcdGNvbnN0IG5ldXRyYWxDaGFyYWN0ZXIgPSBwYWlyLmZpbmROZXV0cmFsQ2hhcmFjdGVyKCk7XG5cdFx0XHRpZiAobmV1dHJhbENoYXJhY3Rlcikge1xuXHRcdFx0XHRjb25zdCB0b2tlblR5cGUgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0VG9rZW5UeXBlSWZJbnNlcnRpbmdDaGFyYWN0ZXIobGluZU51bWJlciwgYmVmb3JlQ29sdW1uLCBuZXV0cmFsQ2hhcmFjdGVyKTtcblx0XHRcdFx0aWYgKCFwYWlyLmlzT0sodG9rZW5UeXBlKSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChpc0NvbnRhaW5lZFBhaXJQcmVzZW50KSB7XG5cdFx0XHRyZXR1cm4gcGFpci5jbG9zZS5zdWJzdHJpbmcoMCwgcGFpci5jbG9zZS5sZW5ndGggLSBjb250YWluZWRQYWlyQ2xvc2UubGVuZ3RoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHBhaXIuY2xvc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgYW5vdGhlciBhdXRvLWNsb3NpbmcgcGFpciB0aGF0IGlzIGNvbnRhaW5lZCBieSB0aGUgb25lIHBhc3NlZCBpbi5cblx0ICpcblx0ICogZS5nLiB3aGVuIGhhdmluZyBbKCwpXSBhbmQgWygqLCopXSBhcyBhdXRvLWNsb3NpbmcgcGFpcnNcblx0ICogdGhpcyBtZXRob2Qgd2lsbCBmaW5kIFsoLCldIGFzIGEgY29udGFpbm1lbnQgcGFpciBmb3IgWygqLCopXVxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpbmRDb250YWluZWRBdXRvQ2xvc2luZ1BhaXIoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBwYWlyOiBTdGFuZGFyZEF1dG9DbG9zaW5nUGFpckNvbmRpdGlvbmFsKTogU3RhbmRhcmRBdXRvQ2xvc2luZ1BhaXJDb25kaXRpb25hbCB8IG51bGwge1xuXHRcdGlmIChwYWlyLm9wZW4ubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBsYXN0Q2hhciA9IHBhaXIuY2xvc2UuY2hhckF0KHBhaXIuY2xvc2UubGVuZ3RoIC0gMSk7XG5cdFx0Ly8gZ2V0IGNhbmRpZGF0ZXMgd2l0aCB0aGUgc2FtZSBsYXN0IGNoYXJhY3RlciBhcyBjbG9zZVxuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBjb25maWcuYXV0b0Nsb3NpbmdQYWlycy5hdXRvQ2xvc2luZ1BhaXJzQ2xvc2VCeUVuZC5nZXQobGFzdENoYXIpIHx8IFtdO1xuXHRcdGxldCByZXN1bHQ6IFN0YW5kYXJkQXV0b0Nsb3NpbmdQYWlyQ29uZGl0aW9uYWwgfCBudWxsID0gbnVsbDtcblx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG5cdFx0XHRpZiAoY2FuZGlkYXRlLm9wZW4gIT09IHBhaXIub3BlbiAmJiBwYWlyLm9wZW4uaW5jbHVkZXMoY2FuZGlkYXRlLm9wZW4pICYmIHBhaXIuY2xvc2UuZW5kc1dpdGgoY2FuZGlkYXRlLmNsb3NlKSkge1xuXHRcdFx0XHRpZiAoIXJlc3VsdCB8fCBjYW5kaWRhdGUub3Blbi5sZW5ndGggPiByZXN1bHQub3Blbi5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBjYW5kaWRhdGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXRlcm1pbmUgaWYgdHlwaW5nIGBjaGAgYXQgYWxsIGBwb3NpdGlvbnNgIGluIHRoZSBgbW9kZWxgIHJlc3VsdHMgaW4gYW5cblx0ICogYXV0byBjbG9zaW5nIG9wZW4gc2VxdWVuY2UgYmVpbmcgdHlwZWQuXG5cdCAqXG5cdCAqIEF1dG8gY2xvc2luZyBvcGVuIHNlcXVlbmNlcyBjYW4gY29uc2lzdCBvZiBtdWx0aXBsZSBjaGFyYWN0ZXJzLCB3aGljaFxuXHQgKiBjYW4gbGVhZCB0byBhbWJpZ3VpdGllcy4gSW4gc3VjaCBhIGNhc2UsIHRoZSBsb25nZXN0IGF1dG8tY2xvc2luZyBvcGVuXG5cdCAqIHNlcXVlbmNlIGlzIHJldHVybmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpbmRBdXRvQ2xvc2luZ1BhaXJPcGVuKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uczogUG9zaXRpb25bXSwgY2g6IHN0cmluZyk6IFN0YW5kYXJkQXV0b0Nsb3NpbmdQYWlyQ29uZGl0aW9uYWwgfCBudWxsIHtcblx0XHRjb25zdCBjYW5kaWRhdGVzID0gY29uZmlnLmF1dG9DbG9zaW5nUGFpcnMuYXV0b0Nsb3NpbmdQYWlyc09wZW5CeUVuZC5nZXQoY2gpO1xuXHRcdGlmICghY2FuZGlkYXRlcykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdC8vIERldGVybWluZSB3aGljaCBhdXRvLWNsb3NpbmcgcGFpciBpdCBpc1xuXHRcdGxldCByZXN1bHQ6IFN0YW5kYXJkQXV0b0Nsb3NpbmdQYWlyQ29uZGl0aW9uYWwgfCBudWxsID0gbnVsbDtcblx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG5cdFx0XHRpZiAocmVzdWx0ID09PSBudWxsIHx8IGNhbmRpZGF0ZS5vcGVuLmxlbmd0aCA+IHJlc3VsdC5vcGVuLmxlbmd0aCkge1xuXHRcdFx0XHRsZXQgY2FuZGlkYXRlSXNNYXRjaCA9IHRydWU7XG5cdFx0XHRcdGZvciAoY29uc3QgcG9zaXRpb24gb2YgcG9zaXRpb25zKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVsZXZhbnRUZXh0ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4gLSBjYW5kaWRhdGUub3Blbi5sZW5ndGggKyAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pKTtcblx0XHRcdFx0XHRpZiAocmVsZXZhbnRUZXh0ICsgY2ggIT09IGNhbmRpZGF0ZS5vcGVuKSB7XG5cdFx0XHRcdFx0XHRjYW5kaWRhdGVJc01hdGNoID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNhbmRpZGF0ZUlzTWF0Y2gpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSBjYW5kaWRhdGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc0JlZm9yZUNsb3NpbmdCcmFjZShjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIGxpbmVBZnRlcjogc3RyaW5nKSB7XG5cdFx0Ly8gSWYgdGhlIHN0YXJ0IG9mIGxpbmVBZnRlciBjYW4gYmUgaW50ZXJwcmV0dGVkIGFzIGJvdGggYSBzdGFydGluZyBvciBlbmRpbmcgYnJhY2UsIGRlZmF1bHQgdG8gcmV0dXJuaW5nIGZhbHNlXG5cdFx0Y29uc3QgbmV4dENoYXIgPSBsaW5lQWZ0ZXIuY2hhckF0KDApO1xuXHRcdGNvbnN0IHBvdGVudGlhbFN0YXJ0aW5nQnJhY2VzID0gY29uZmlnLmF1dG9DbG9zaW5nUGFpcnMuYXV0b0Nsb3NpbmdQYWlyc09wZW5CeVN0YXJ0LmdldChuZXh0Q2hhcikgfHwgW107XG5cdFx0Y29uc3QgcG90ZW50aWFsQ2xvc2luZ0JyYWNlcyA9IGNvbmZpZy5hdXRvQ2xvc2luZ1BhaXJzLmF1dG9DbG9zaW5nUGFpcnNDbG9zZUJ5U3RhcnQuZ2V0KG5leHRDaGFyKSB8fCBbXTtcblxuXHRcdGNvbnN0IGlzQmVmb3JlU3RhcnRpbmdCcmFjZSA9IHBvdGVudGlhbFN0YXJ0aW5nQnJhY2VzLnNvbWUoeCA9PiBsaW5lQWZ0ZXIuc3RhcnRzV2l0aCh4Lm9wZW4pKTtcblx0XHRjb25zdCBpc0JlZm9yZUNsb3NpbmdCcmFjZSA9IHBvdGVudGlhbENsb3NpbmdCcmFjZXMuc29tZSh4ID0+IGxpbmVBZnRlci5zdGFydHNXaXRoKHguY2xvc2UpKTtcblxuXHRcdHJldHVybiAhaXNCZWZvcmVTdGFydGluZ0JyYWNlICYmIGlzQmVmb3JlQ2xvc2luZ0JyYWNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NpdGlvbkVuZE92ZXJ0eXBlT3BlcmF0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldEVkaXRzKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgY29tcG9zaXRpb25zOiBDb21wb3NpdGlvbk91dGNvbWVbXSk6IEVkaXRPcGVyYXRpb25SZXN1bHQgfCBudWxsIHtcblx0XHRjb25zdCBpc092ZXJ0eXBlTW9kZSA9IGNvbmZpZy5pbnB1dE1vZGUgPT09ICdvdmVydHlwZSc7XG5cdFx0aWYgKCFpc092ZXJ0eXBlTW9kZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbW1hbmRzID0gY29tcG9zaXRpb25zLm1hcChjb21wb3NpdGlvbiA9PiBuZXcgUmVwbGFjZU92ZXJ0eXBlQ29tbWFuZE9uQ29tcG9zaXRpb25FbmQoY29tcG9zaXRpb24uaW5zZXJ0ZWRUZXh0UmFuZ2UpKTtcblx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nT3RoZXIsIGNvbW1hbmRzLCB7XG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlOiB0cnVlLFxuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdXJyb3VuZFNlbGVjdGlvbk9wZXJhdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFZGl0cyhjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgY2g6IHN0cmluZywgaXNEb2luZ0NvbXBvc2l0aW9uOiBib29sZWFuKTogRWRpdE9wZXJhdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFpc0RvaW5nQ29tcG9zaXRpb24gJiYgdGhpcy5faXNTdXJyb3VuZFNlbGVjdGlvblR5cGUoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9ucywgY2gpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcnVuU3Vycm91bmRTZWxlY3Rpb25UeXBlKGNvbmZpZywgc2VsZWN0aW9ucywgY2gpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcnVuU3Vycm91bmRTZWxlY3Rpb25UeXBlKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGNoOiBzdHJpbmcpOiBFZGl0T3BlcmF0aW9uUmVzdWx0IHtcblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBzZWxlY3Rpb25zW2ldO1xuXHRcdFx0Y29uc3QgY2xvc2VDaGFyYWN0ZXIgPSBjb25maWcuc3Vycm91bmRpbmdQYWlyc1tjaF07XG5cdFx0XHRjb21tYW5kc1tpXSA9IG5ldyBTdXJyb3VuZFNlbGVjdGlvbkNvbW1hbmQoc2VsZWN0aW9uLCBjaCwgY2xvc2VDaGFyYWN0ZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuT3RoZXIsIGNvbW1hbmRzLCB7XG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlOiB0cnVlLFxuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNTdXJyb3VuZFNlbGVjdGlvblR5cGUoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGNoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXNob3VsZFN1cnJvdW5kQ2hhcihjb25maWcsIGNoKSB8fCAhY29uZmlnLnN1cnJvdW5kaW5nUGFpcnMuaGFzT3duUHJvcGVydHkoY2gpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGlzVHlwaW5nQVF1b3RlQ2hhcmFjdGVyID0gaXNRdW90ZShjaCk7XG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHNlbGVjdGlvbkNvbnRhaW5zT25seVdoaXRlc3BhY2UgPSB0cnVlO1xuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBzdGFydEluZGV4ID0gKGxpbmVOdW1iZXIgPT09IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgPyBzZWxlY3Rpb24uc3RhcnRDb2x1bW4gLSAxIDogMCk7XG5cdFx0XHRcdGNvbnN0IGVuZEluZGV4ID0gKGxpbmVOdW1iZXIgPT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyID8gc2VsZWN0aW9uLmVuZENvbHVtbiAtIDEgOiBsaW5lVGV4dC5sZW5ndGgpO1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZFRleHQgPSBsaW5lVGV4dC5zdWJzdHJpbmcoc3RhcnRJbmRleCwgZW5kSW5kZXgpO1xuXHRcdFx0XHRpZiAoL1teIFxcdF0vLnRlc3Qoc2VsZWN0ZWRUZXh0KSkge1xuXHRcdFx0XHRcdC8vIHRoaXMgc2VsZWN0ZWQgdGV4dCBjb250YWlucyBzb21ldGhpbmcgb3RoZXIgdGhhbiB3aGl0ZXNwYWNlXG5cdFx0XHRcdFx0c2VsZWN0aW9uQ29udGFpbnNPbmx5V2hpdGVzcGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VsZWN0aW9uQ29udGFpbnNPbmx5V2hpdGVzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNUeXBpbmdBUXVvdGVDaGFyYWN0ZXIgJiYgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA9PT0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgJiYgc2VsZWN0aW9uLnN0YXJ0Q29sdW1uICsgMSA9PT0gc2VsZWN0aW9uLmVuZENvbHVtbikge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb25UZXh0ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHNlbGVjdGlvbik7XG5cdFx0XHRcdGlmIChpc1F1b3RlKHNlbGVjdGlvblRleHQpKSB7XG5cdFx0XHRcdFx0Ly8gVHlwaW5nIGEgcXVvdGUgY2hhcmFjdGVyIG9uIHRvcCBvZiBhbm90aGVyIHF1b3RlIGNoYXJhY3RlclxuXHRcdFx0XHRcdC8vID0+IGRpc2FibGUgc3Vycm91bmQgc2VsZWN0aW9uIHR5cGVcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEludGVyY2VwdG9yRWxlY3RyaWNDaGFyT3BlcmF0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldEVkaXRzKHByZXZFZGl0T3BlcmF0aW9uVHlwZTogRWRpdE9wZXJhdGlvblR5cGUsIGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBjaDogc3RyaW5nLCBpc0RvaW5nQ29tcG9zaXRpb246IGJvb2xlYW4pOiBFZGl0T3BlcmF0aW9uUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBFbGVjdHJpYyBjaGFyYWN0ZXJzIG1ha2Ugc2Vuc2Ugb25seSB3aGVuIGRlYWxpbmcgd2l0aCBhIHNpbmdsZSBjdXJzb3IsXG5cdFx0Ly8gYXMgbXVsdGlwbGUgY3Vyc29ycyB0eXBpbmcgYnJhY2tldHMgZm9yIGV4YW1wbGUgd291bGQgaW50ZXJmZXIgd2l0aCBicmFja2V0IG1hdGNoaW5nXG5cdFx0aWYgKCFpc0RvaW5nQ29tcG9zaXRpb24gJiYgdGhpcy5faXNUeXBlSW50ZXJjZXB0b3JFbGVjdHJpY0NoYXIoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9ucykpIHtcblx0XHRcdGNvbnN0IHIgPSB0aGlzLl90eXBlSW50ZXJjZXB0b3JFbGVjdHJpY0NoYXIocHJldkVkaXRPcGVyYXRpb25UeXBlLCBjb25maWcsIG1vZGVsLCBzZWxlY3Rpb25zWzBdLCBjaCk7XG5cdFx0XHRpZiAocikge1xuXHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lzVHlwZUludGVyY2VwdG9yRWxlY3RyaWNDaGFyKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdKSB7XG5cdFx0aWYgKHNlbGVjdGlvbnMubGVuZ3RoID09PSAxICYmIG1vZGVsLnRva2VuaXphdGlvbi5pc0NoZWFwVG9Ub2tlbml6ZShzZWxlY3Rpb25zWzBdLmdldEVuZFBvc2l0aW9uKCkubGluZU51bWJlcikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfdHlwZUludGVyY2VwdG9yRWxlY3RyaWNDaGFyKHByZXZFZGl0T3BlcmF0aW9uVHlwZTogRWRpdE9wZXJhdGlvblR5cGUsIGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBjaDogc3RyaW5nKTogRWRpdE9wZXJhdGlvblJlc3VsdCB8IG51bGwge1xuXHRcdGlmICghY29uZmlnLmVsZWN0cmljQ2hhcnMuaGFzT3duUHJvcGVydHkoY2gpIHx8ICFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24ocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGxldCBlbGVjdHJpY0FjdGlvbjogSUVsZWN0cmljQWN0aW9uIHwgbnVsbDtcblx0XHR0cnkge1xuXHRcdFx0ZWxlY3RyaWNBY3Rpb24gPSBjb25maWcub25FbGVjdHJpY0NoYXJhY3RlcihjaCwgbGluZVRva2VucywgcG9zaXRpb24uY29sdW1uKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoIWVsZWN0cmljQWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGVsZWN0cmljQWN0aW9uLm1hdGNoT3BlbkJyYWNrZXQpIHtcblx0XHRcdGNvbnN0IGVuZENvbHVtbiA9IChsaW5lVG9rZW5zLmdldExpbmVDb250ZW50KCkgKyBjaCkubGFzdEluZGV4T2YoZWxlY3RyaWNBY3Rpb24ubWF0Y2hPcGVuQnJhY2tldCkgKyAxO1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZE1hdGNoaW5nQnJhY2tldFVwKGVsZWN0cmljQWN0aW9uLm1hdGNoT3BlbkJyYWNrZXQsIHtcblx0XHRcdFx0bGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0Y29sdW1uOiBlbmRDb2x1bW5cblx0XHRcdH0sIDUwMCAvKiBnaXZlIGF0IG1vc3QgNTAwbXMgdG8gY29tcHV0ZSAqLyk7XG5cdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0aWYgKG1hdGNoLnN0YXJ0TGluZU51bWJlciA9PT0gcG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHRcdC8vIG1hdGNoZWQgc29tZXRoaW5nIG9uIHRoZSBzYW1lIGxpbmUgPT4gbm8gY2hhbmdlIGluIGluZGVudGF0aW9uXG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWF0Y2hMaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobWF0Y2guc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3QgbWF0Y2hMaW5lSW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1hdGNoTGluZSk7XG5cdFx0XHRcdGNvbnN0IG5ld0luZGVudGF0aW9uID0gY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKG1hdGNoTGluZUluZGVudGF0aW9uKTtcblx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3QgbGluZUZpcnN0Tm9uQmxhbmtDb2x1bW4gPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpIHx8IHBvc2l0aW9uLmNvbHVtbjtcblx0XHRcdFx0Y29uc3QgcHJlZml4ID0gbGluZVRleHQuc3Vic3RyaW5nKGxpbmVGaXJzdE5vbkJsYW5rQ29sdW1uIC0gMSwgcG9zaXRpb24uY29sdW1uIC0gMSk7XG5cdFx0XHRcdGNvbnN0IHR5cGVUZXh0ID0gbmV3SW5kZW50YXRpb24gKyBwcmVmaXggKyBjaDtcblx0XHRcdFx0Y29uc3QgdHlwZVNlbGVjdGlvbiA9IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gbmV3IFJlcGxhY2VDb21tYW5kKHR5cGVTZWxlY3Rpb24sIHR5cGVUZXh0KTtcblx0XHRcdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KGdldFR5cGluZ09wZXJhdGlvbih0eXBlVGV4dCwgcHJldkVkaXRPcGVyYXRpb25UeXBlKSwgW2NvbW1hbmRdLCB7XG5cdFx0XHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogZmFsc2UsXG5cdFx0XHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2ltcGxlQ2hhcmFjdGVyVHlwZU9wZXJhdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFZGl0cyhjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIHByZXZFZGl0T3BlcmF0aW9uVHlwZTogRWRpdE9wZXJhdGlvblR5cGUsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBjaDogc3RyaW5nLCBpc0RvaW5nQ29tcG9zaXRpb246IGJvb2xlYW4pOiBFZGl0T3BlcmF0aW9uUmVzdWx0IHtcblx0XHQvLyBBIHNpbXBsZSBjaGFyYWN0ZXIgdHlwZVxuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IENob3NlblJlcGxhY2VDb21tYW5kID0gY29uZmlnLmlucHV0TW9kZSA9PT0gJ292ZXJ0eXBlJyAmJiAhaXNEb2luZ0NvbXBvc2l0aW9uID8gUmVwbGFjZU92ZXJ0eXBlQ29tbWFuZCA6IFJlcGxhY2VDb21tYW5kO1xuXHRcdFx0Y29tbWFuZHNbaV0gPSBuZXcgQ2hvc2VuUmVwbGFjZUNvbW1hbmQoc2VsZWN0aW9uc1tpXSwgY2gpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wVHlwZSA9IGdldFR5cGluZ09wZXJhdGlvbihjaCwgcHJldkVkaXRPcGVyYXRpb25UeXBlKTtcblx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQob3BUeXBlLCBjb21tYW5kcywge1xuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogc2hvdWxkUHVzaFN0YWNrRWxlbWVudEJldHdlZW4ocHJldkVkaXRPcGVyYXRpb25UeXBlLCBvcFR5cGUpLFxuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFbnRlck9wZXJhdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFZGl0cyhjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgY2g6IHN0cmluZywgaXNEb2luZ0NvbXBvc2l0aW9uOiBib29sZWFuKTogRWRpdE9wZXJhdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFpc0RvaW5nQ29tcG9zaXRpb24gJiYgY2ggPT09ICdcXG4nKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29tbWFuZHNbaV0gPSB0aGlzLl9lbnRlcihjb25maWcsIG1vZGVsLCBmYWxzZSwgc2VsZWN0aW9uc1tpXSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nT3RoZXIsIGNvbW1hbmRzLCB7XG5cdFx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IHRydWUsXG5cdFx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2VudGVyKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIGtlZXBQb3NpdGlvbjogYm9vbGVhbiwgcmFuZ2U6IFJhbmdlKTogSUNvbW1hbmQge1xuXHRcdGlmIChjb25maWcuYXV0b0luZGVudCA9PT0gRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5Lk5vbmUpIHtcblx0XHRcdHJldHVybiB0eXBlQ29tbWFuZChyYW5nZSwgJ1xcbicsIGtlZXBQb3NpdGlvbik7XG5cdFx0fVxuXHRcdGlmICghbW9kZWwudG9rZW5pemF0aW9uLmlzQ2hlYXBUb1Rva2VuaXplKHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKS5saW5lTnVtYmVyKSB8fCBjb25maWcuYXV0b0luZGVudCA9PT0gRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LktlZXApIHtcblx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGluZGVudGF0aW9uID0gc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShsaW5lVGV4dCkuc3Vic3RyaW5nKDAsIHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSk7XG5cdFx0XHRyZXR1cm4gdHlwZUNvbW1hbmQocmFuZ2UsICdcXG4nICsgY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKGluZGVudGF0aW9uKSwga2VlcFBvc2l0aW9uKTtcblx0XHR9XG5cdFx0Y29uc3QgciA9IGdldEVudGVyQWN0aW9uKGNvbmZpZy5hdXRvSW5kZW50LCBtb2RlbCwgcmFuZ2UsIGNvbmZpZy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAocikge1xuXHRcdFx0aWYgKHIuaW5kZW50QWN0aW9uID09PSBJbmRlbnRBY3Rpb24uTm9uZSkge1xuXHRcdFx0XHQvLyBOb3RoaW5nIHNwZWNpYWxcblx0XHRcdFx0cmV0dXJuIHR5cGVDb21tYW5kKHJhbmdlLCAnXFxuJyArIGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihyLmluZGVudGF0aW9uICsgci5hcHBlbmRUZXh0KSwga2VlcFBvc2l0aW9uKTtcblxuXHRcdFx0fSBlbHNlIGlmIChyLmluZGVudEFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLkluZGVudCkge1xuXHRcdFx0XHQvLyBJbmRlbnQgb25jZVxuXHRcdFx0XHRyZXR1cm4gdHlwZUNvbW1hbmQocmFuZ2UsICdcXG4nICsgY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKHIuaW5kZW50YXRpb24gKyByLmFwcGVuZFRleHQpLCBrZWVwUG9zaXRpb24pO1xuXG5cdFx0XHR9IGVsc2UgaWYgKHIuaW5kZW50QWN0aW9uID09PSBJbmRlbnRBY3Rpb24uSW5kZW50T3V0ZGVudCkge1xuXHRcdFx0XHQvLyBVbHRyYSBzcGVjaWFsXG5cdFx0XHRcdGNvbnN0IG5vcm1hbEluZGVudCA9IGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihyLmluZGVudGF0aW9uKTtcblx0XHRcdFx0Y29uc3QgaW5jcmVhc2VkSW5kZW50ID0gY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKHIuaW5kZW50YXRpb24gKyByLmFwcGVuZFRleHQpO1xuXHRcdFx0XHRjb25zdCB0eXBlVGV4dCA9ICdcXG4nICsgaW5jcmVhc2VkSW5kZW50ICsgJ1xcbicgKyBub3JtYWxJbmRlbnQ7XG5cdFx0XHRcdGlmIChrZWVwUG9zaXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFJlcGxhY2VDb21tYW5kV2l0aG91dENoYW5naW5nUG9zaXRpb24ocmFuZ2UsIHR5cGVUZXh0LCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFJlcGxhY2VDb21tYW5kV2l0aE9mZnNldEN1cnNvclN0YXRlKHJhbmdlLCB0eXBlVGV4dCwgLTEsIGluY3JlYXNlZEluZGVudC5sZW5ndGggLSBub3JtYWxJbmRlbnQubGVuZ3RoLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChyLmluZGVudEFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLk91dGRlbnQpIHtcblx0XHRcdFx0Y29uc3QgYWN0dWFsSW5kZW50YXRpb24gPSB1bnNoaWZ0SW5kZW50KGNvbmZpZywgci5pbmRlbnRhdGlvbik7XG5cdFx0XHRcdHJldHVybiB0eXBlQ29tbWFuZChyYW5nZSwgJ1xcbicgKyBjb25maWcubm9ybWFsaXplSW5kZW50YXRpb24oYWN0dWFsSW5kZW50YXRpb24gKyByLmFwcGVuZFRleHQpLCBrZWVwUG9zaXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBpbmRlbnRhdGlvbiA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobGluZVRleHQpLnN1YnN0cmluZygwLCByYW5nZS5zdGFydENvbHVtbiAtIDEpO1xuXG5cdFx0aWYgKGNvbmZpZy5hdXRvSW5kZW50ID49IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsKSB7XG5cdFx0XHRjb25zdCBpciA9IGdldEluZGVudEZvckVudGVyKGNvbmZpZy5hdXRvSW5kZW50LCBtb2RlbCwgcmFuZ2UsIHtcblx0XHRcdFx0dW5zaGlmdEluZGVudDogKGluZGVudCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB1bnNoaWZ0SW5kZW50KGNvbmZpZywgaW5kZW50KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2hpZnRJbmRlbnQ6IChpbmRlbnQpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gc2hpZnRJbmRlbnQoY29uZmlnLCBpbmRlbnQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRub3JtYWxpemVJbmRlbnRhdGlvbjogKGluZGVudCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBjb25maWcubm9ybWFsaXplSW5kZW50YXRpb24oaW5kZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgY29uZmlnLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRpZiAoaXIpIHtcblx0XHRcdFx0bGV0IG9sZEVuZFZpZXdDb2x1bW4gPSBjb25maWcudmlzaWJsZUNvbHVtbkZyb21Db2x1bW4obW9kZWwsIHJhbmdlLmdldEVuZFBvc2l0aW9uKCkpO1xuXHRcdFx0XHRjb25zdCBvbGRFbmRDb2x1bW4gPSByYW5nZS5lbmRDb2x1bW47XG5cdFx0XHRcdGNvbnN0IG5ld0xpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IGZpcnN0Tm9uV2hpdGVzcGFjZSA9IHN0cmluZ3MuZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXgobmV3TGluZUNvbnRlbnQpO1xuXHRcdFx0XHRpZiAoZmlyc3ROb25XaGl0ZXNwYWNlID49IDApIHtcblx0XHRcdFx0XHRyYW5nZSA9IHJhbmdlLnNldEVuZFBvc2l0aW9uKHJhbmdlLmVuZExpbmVOdW1iZXIsIE1hdGgubWF4KHJhbmdlLmVuZENvbHVtbiwgZmlyc3ROb25XaGl0ZXNwYWNlICsgMSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJhbmdlID0gcmFuZ2Uuc2V0RW5kUG9zaXRpb24ocmFuZ2UuZW5kTGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihyYW5nZS5lbmRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGtlZXBQb3NpdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUmVwbGFjZUNvbW1hbmRXaXRob3V0Q2hhbmdpbmdQb3NpdGlvbihyYW5nZSwgJ1xcbicgKyBjb25maWcubm9ybWFsaXplSW5kZW50YXRpb24oaXIuYWZ0ZXJFbnRlciksIHRydWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdFx0XHRcdGlmIChvbGRFbmRDb2x1bW4gPD0gZmlyc3ROb25XaGl0ZXNwYWNlICsgMSkge1xuXHRcdFx0XHRcdFx0aWYgKCFjb25maWcuaW5zZXJ0U3BhY2VzKSB7XG5cdFx0XHRcdFx0XHRcdG9sZEVuZFZpZXdDb2x1bW4gPSBNYXRoLmNlaWwob2xkRW5kVmlld0NvbHVtbiAvIGNvbmZpZy5pbmRlbnRTaXplKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdG9mZnNldCA9IE1hdGgubWluKG9sZEVuZFZpZXdDb2x1bW4gKyAxIC0gY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKGlyLmFmdGVyRW50ZXIpLmxlbmd0aCAtIDEsIDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gbmV3IFJlcGxhY2VDb21tYW5kV2l0aE9mZnNldEN1cnNvclN0YXRlKHJhbmdlLCAnXFxuJyArIGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihpci5hZnRlckVudGVyKSwgMCwgb2Zmc2V0LCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHlwZUNvbW1hbmQocmFuZ2UsICdcXG4nICsgY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKGluZGVudGF0aW9uKSwga2VlcFBvc2l0aW9uKTtcblx0fVxuXG5cblx0cHVibGljIHN0YXRpYyBsaW5lSW5zZXJ0QmVmb3JlKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwgfCBudWxsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSB8IG51bGwpOiBJQ29tbWFuZFtdIHtcblx0XHRpZiAobW9kZWwgPT09IG51bGwgfHwgc2VsZWN0aW9ucyA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRsZXQgbGluZU51bWJlciA9IHNlbGVjdGlvbnNbaV0ucG9zaXRpb25MaW5lTnVtYmVyO1xuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IDEpIHtcblx0XHRcdFx0Y29tbWFuZHNbaV0gPSBuZXcgUmVwbGFjZUNvbW1hbmRXaXRob3V0Q2hhbmdpbmdQb3NpdGlvbihuZXcgUmFuZ2UoMSwgMSwgMSwgMSksICdcXG4nKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxpbmVOdW1iZXItLTtcblx0XHRcdFx0Y29uc3QgY29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblxuXHRcdFx0XHRjb21tYW5kc1tpXSA9IHRoaXMuX2VudGVyKGNvbmZpZywgbW9kZWwsIGZhbHNlLCBuZXcgUmFuZ2UobGluZU51bWJlciwgY29sdW1uLCBsaW5lTnVtYmVyLCBjb2x1bW4pKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbW1hbmRzO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBsaW5lSW5zZXJ0QWZ0ZXIoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCB8IG51bGwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdIHwgbnVsbCk6IElDb21tYW5kW10ge1xuXHRcdGlmIChtb2RlbCA9PT0gbnVsbCB8fCBzZWxlY3Rpb25zID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBzZWxlY3Rpb25zW2ldLnBvc2l0aW9uTGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHRjb21tYW5kc1tpXSA9IHRoaXMuX2VudGVyKGNvbmZpZywgbW9kZWwsIGZhbHNlLCBuZXcgUmFuZ2UobGluZU51bWJlciwgY29sdW1uLCBsaW5lTnVtYmVyLCBjb2x1bW4pKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbW1hbmRzO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBsaW5lQnJlYWtJbnNlcnQoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10pOiBJQ29tbWFuZFtdIHtcblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb21tYW5kc1tpXSA9IHRoaXMuX2VudGVyKGNvbmZpZywgbW9kZWwsIHRydWUsIHNlbGVjdGlvbnNbaV0pO1xuXHRcdH1cblx0XHRyZXR1cm4gY29tbWFuZHM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFBhc3RlT3BlcmF0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldEVkaXRzKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIHRleHQ6IHN0cmluZywgcGFzdGVPbk5ld0xpbmU6IGJvb2xlYW4sIG11bHRpY3Vyc29yVGV4dDogc3RyaW5nW10pIHtcblx0XHRjb25zdCBkaXN0cmlidXRlZFBhc3RlID0gdGhpcy5fZGlzdHJpYnV0ZVBhc3RlVG9DdXJzb3JzKGNvbmZpZywgc2VsZWN0aW9ucywgdGV4dCwgcGFzdGVPbk5ld0xpbmUsIG11bHRpY3Vyc29yVGV4dCk7XG5cdFx0aWYgKGRpc3RyaWJ1dGVkUGFzdGUpIHtcblx0XHRcdHNlbGVjdGlvbnMgPSBzZWxlY3Rpb25zLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblx0XHRcdHJldHVybiB0aGlzLl9kaXN0cmlidXRlZFBhc3RlKGNvbmZpZywgbW9kZWwsIHNlbGVjdGlvbnMsIGRpc3RyaWJ1dGVkUGFzdGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2ltcGxlUGFzdGUoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9ucywgdGV4dCwgcGFzdGVPbk5ld0xpbmUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9kaXN0cmlidXRlUGFzdGVUb0N1cnNvcnMoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgdGV4dDogc3RyaW5nLCBwYXN0ZU9uTmV3TGluZTogYm9vbGVhbiwgbXVsdGljdXJzb3JUZXh0OiBzdHJpbmdbXSk6IHN0cmluZ1tdIHwgbnVsbCB7XG5cdFx0aWYgKHNlbGVjdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKG11bHRpY3Vyc29yVGV4dCAmJiBtdWx0aWN1cnNvclRleHQubGVuZ3RoID09PSBzZWxlY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG11bHRpY3Vyc29yVGV4dDtcblx0XHR9XG5cdFx0aWYgKHBhc3RlT25OZXdMaW5lKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGNvbmZpZy5tdWx0aUN1cnNvclBhc3RlID09PSAnc3ByZWFkJykge1xuXHRcdFx0Ly8gVHJ5IHRvIHNwcmVhZCB0aGUgcGFzdGVkIHRleHQgaW4gY2FzZSB0aGUgbGluZSBjb3VudCBtYXRjaGVzIHRoZSBjdXJzb3IgY291bnRcblx0XHRcdC8vIFJlbW92ZSB0cmFpbGluZyBcXG4gaWYgcHJlc2VudFxuXHRcdFx0aWYgKHRleHQuY2hhckNvZGVBdCh0ZXh0Lmxlbmd0aCAtIDEpID09PSBDaGFyQ29kZS5MaW5lRmVlZCkge1xuXHRcdFx0XHR0ZXh0ID0gdGV4dC5zdWJzdHJpbmcoMCwgdGV4dC5sZW5ndGggLSAxKTtcblx0XHRcdH1cblx0XHRcdC8vIFJlbW92ZSB0cmFpbGluZyBcXHIgaWYgcHJlc2VudFxuXHRcdFx0aWYgKHRleHQuY2hhckNvZGVBdCh0ZXh0Lmxlbmd0aCAtIDEpID09PSBDaGFyQ29kZS5DYXJyaWFnZVJldHVybikge1xuXHRcdFx0XHR0ZXh0ID0gdGV4dC5zdWJzdHJpbmcoMCwgdGV4dC5sZW5ndGggLSAxKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmVzID0gc3RyaW5ncy5zcGxpdExpbmVzKHRleHQpO1xuXHRcdFx0aWYgKGxpbmVzLmxlbmd0aCA9PT0gc2VsZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGxpbmVzO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9kaXN0cmlidXRlZFBhc3RlKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIHRleHQ6IHN0cmluZ1tdKTogRWRpdE9wZXJhdGlvblJlc3VsdCB7XG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2hvdWxkT3ZlcnR5cGVPblBhc3RlID0gY29uZmlnLm92ZXJ0eXBlT25QYXN0ZSAmJiBjb25maWcuaW5wdXRNb2RlID09PSAnb3ZlcnR5cGUnO1xuXHRcdFx0Y29uc3QgQ2hvc2VuUmVwbGFjZUNvbW1hbmQgPSBzaG91bGRPdmVydHlwZU9uUGFzdGUgPyBSZXBsYWNlT3ZlcnR5cGVDb21tYW5kIDogUmVwbGFjZUNvbW1hbmQ7XG5cdFx0XHRjb21tYW5kc1tpXSA9IG5ldyBDaG9zZW5SZXBsYWNlQ29tbWFuZChzZWxlY3Rpb25zW2ldLCB0ZXh0W2ldKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KEVkaXRPcGVyYXRpb25UeXBlLk90aGVyLCBjb21tYW5kcywge1xuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogdHJ1ZSxcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NpbXBsZVBhc3RlKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIHRleHQ6IHN0cmluZywgcGFzdGVPbk5ld0xpbmU6IGJvb2xlYW4pOiBFZGl0T3BlcmF0aW9uUmVzdWx0IHtcblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBzZWxlY3Rpb25zW2ldO1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblx0XHRcdGlmIChwYXN0ZU9uTmV3TGluZSAmJiAhc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRwYXN0ZU9uTmV3TGluZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhc3RlT25OZXdMaW5lICYmIHRleHQuaW5kZXhPZignXFxuJykgIT09IHRleHQubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRwYXN0ZU9uTmV3TGluZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhc3RlT25OZXdMaW5lKSB7XG5cdFx0XHRcdC8vIFBhc3RlIGVudGlyZSBsaW5lIGF0IHRoZSBiZWdpbm5pbmcgb2YgbGluZVxuXHRcdFx0XHRjb25zdCB0eXBlU2VsZWN0aW9uID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIDEpO1xuXHRcdFx0XHRjb21tYW5kc1tpXSA9IG5ldyBSZXBsYWNlQ29tbWFuZFRoYXRQcmVzZXJ2ZXNTZWxlY3Rpb24odHlwZVNlbGVjdGlvbiwgdGV4dCwgc2VsZWN0aW9uLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHNob3VsZE92ZXJ0eXBlT25QYXN0ZSA9IGNvbmZpZy5vdmVydHlwZU9uUGFzdGUgJiYgY29uZmlnLmlucHV0TW9kZSA9PT0gJ292ZXJ0eXBlJztcblx0XHRcdFx0Y29uc3QgQ2hvc2VuUmVwbGFjZUNvbW1hbmQgPSBzaG91bGRPdmVydHlwZU9uUGFzdGUgPyBSZXBsYWNlT3ZlcnR5cGVDb21tYW5kIDogUmVwbGFjZUNvbW1hbmQ7XG5cdFx0XHRcdGNvbW1hbmRzW2ldID0gbmV3IENob3NlblJlcGxhY2VDb21tYW5kKHNlbGVjdGlvbiwgdGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgRWRpdE9wZXJhdGlvblJlc3VsdChFZGl0T3BlcmF0aW9uVHlwZS5PdGhlciwgY29tbWFuZHMsIHtcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IHRydWUsXG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QWZ0ZXI6IHRydWVcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29tcG9zaXRpb25PcGVyYXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RWRpdHMocHJldkVkaXRPcGVyYXRpb25UeXBlOiBFZGl0T3BlcmF0aW9uVHlwZSwgY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIHRleHQ6IHN0cmluZywgcmVwbGFjZVByZXZDaGFyQ250OiBudW1iZXIsIHJlcGxhY2VOZXh0Q2hhckNudDogbnVtYmVyLCBwb3NpdGlvbkRlbHRhOiBudW1iZXIpIHtcblx0XHRjb25zdCBjb21tYW5kcyA9IHNlbGVjdGlvbnMubWFwKHNlbGVjdGlvbiA9PiB0aGlzLl9jb21wb3NpdGlvblR5cGUobW9kZWwsIHNlbGVjdGlvbiwgdGV4dCwgcmVwbGFjZVByZXZDaGFyQ250LCByZXBsYWNlTmV4dENoYXJDbnQsIHBvc2l0aW9uRGVsdGEpKTtcblx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nT3RoZXIsIGNvbW1hbmRzLCB7XG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlOiBzaG91bGRQdXNoU3RhY2tFbGVtZW50QmV0d2VlbihwcmV2RWRpdE9wZXJhdGlvblR5cGUsIEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ090aGVyKSxcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jb21wb3NpdGlvblR5cGUobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCB0ZXh0OiBzdHJpbmcsIHJlcGxhY2VQcmV2Q2hhckNudDogbnVtYmVyLCByZXBsYWNlTmV4dENoYXJDbnQ6IG51bWJlciwgcG9zaXRpb25EZWx0YTogbnVtYmVyKTogSUNvbW1hbmQgfCBudWxsIHtcblx0XHRpZiAoIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdC8vIGxvb2tzIGxpa2UgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3NzNcblx0XHRcdC8vIHdoZXJlIGEgY3Vyc29yIG9wZXJhdGlvbiBvY2N1cnJlZCBiZWZvcmUgYSBjYW5jZWxlZCBjb21wb3NpdGlvblxuXHRcdFx0Ly8gPT4gaWdub3JlIGNvbXBvc2l0aW9uXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgcG9zID0gc2VsZWN0aW9uLmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBNYXRoLm1heCgxLCBwb3MuY29sdW1uIC0gcmVwbGFjZVByZXZDaGFyQ250KTtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSBNYXRoLm1pbihtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvcy5saW5lTnVtYmVyKSwgcG9zLmNvbHVtbiArIHJlcGxhY2VOZXh0Q2hhckNudCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zLmxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBwb3MubGluZU51bWJlciwgZW5kQ29sdW1uKTtcblx0XHRyZXR1cm4gbmV3IFJlcGxhY2VDb21tYW5kV2l0aE9mZnNldEN1cnNvclN0YXRlKHJhbmdlLCB0ZXh0LCAwLCBwb3NpdGlvbkRlbHRhKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHlwZVdpdGhvdXRJbnRlcmNlcHRvcnNPcGVyYXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RWRpdHMocHJldkVkaXRPcGVyYXRpb25UeXBlOiBFZGl0T3BlcmF0aW9uVHlwZSwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIHN0cjogc3RyaW5nKTogRWRpdE9wZXJhdGlvblJlc3VsdCB7XG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29tbWFuZHNbaV0gPSBuZXcgUmVwbGFjZUNvbW1hbmQoc2VsZWN0aW9uc1tpXSwgc3RyKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3BUeXBlID0gZ2V0VHlwaW5nT3BlcmF0aW9uKHN0ciwgcHJldkVkaXRPcGVyYXRpb25UeXBlKTtcblx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQob3BUeXBlLCBjb21tYW5kcywge1xuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogc2hvdWxkUHVzaFN0YWNrRWxlbWVudEJldHdlZW4ocHJldkVkaXRPcGVyYXRpb25UeXBlLCBvcFR5cGUpLFxuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUYWJPcGVyYXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0Q29tbWFuZHMoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10pIHtcblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBzZWxlY3Rpb25zW2ldO1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0aWYgKC9eXFxzKiQvLnRlc3QobGluZVRleHQpICYmIG1vZGVsLnRva2VuaXphdGlvbi5pc0NoZWFwVG9Ub2tlbml6ZShzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdGxldCBnb29kSW5kZW50ID0gdGhpcy5fZ29vZEluZGVudEZvckxpbmUoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdFx0Z29vZEluZGVudCA9IGdvb2RJbmRlbnQgfHwgJ1xcdCc7XG5cdFx0XHRcdFx0Y29uc3QgcG9zc2libGVUeXBlVGV4dCA9IGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihnb29kSW5kZW50KTtcblx0XHRcdFx0XHRpZiAoIWxpbmVUZXh0LnN0YXJ0c1dpdGgocG9zc2libGVUeXBlVGV4dCkpIHtcblx0XHRcdFx0XHRcdGNvbW1hbmRzW2ldID0gbmV3IFJlcGxhY2VDb21tYW5kKG5ldyBSYW5nZShzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCAxLCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCBsaW5lVGV4dC5sZW5ndGggKyAxKSwgcG9zc2libGVUeXBlVGV4dCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29tbWFuZHNbaV0gPSB0aGlzLl9yZXBsYWNlSnVtcFRvTmV4dEluZGVudChjb25maWcsIG1vZGVsLCBzZWxlY3Rpb24sIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgPT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZU1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4oc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbi5zdGFydENvbHVtbiAhPT0gMSB8fCBzZWxlY3Rpb24uZW5kQ29sdW1uICE9PSBsaW5lTWF4Q29sdW1uKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGlzIGlzIGEgc2luZ2xlIGxpbmUgc2VsZWN0aW9uIHRoYXQgaXMgbm90IHRoZSBlbnRpcmUgbGluZVxuXHRcdFx0XHRcdFx0Y29tbWFuZHNbaV0gPSB0aGlzLl9yZXBsYWNlSnVtcFRvTmV4dEluZGVudChjb25maWcsIG1vZGVsLCBzZWxlY3Rpb24sIGZhbHNlKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb21tYW5kc1tpXSA9IG5ldyBTaGlmdENvbW1hbmQoc2VsZWN0aW9uLCB7XG5cdFx0XHRcdFx0aXNVbnNoaWZ0OiBmYWxzZSxcblx0XHRcdFx0XHR0YWJTaXplOiBjb25maWcudGFiU2l6ZSxcblx0XHRcdFx0XHRpbmRlbnRTaXplOiBjb25maWcuaW5kZW50U2l6ZSxcblx0XHRcdFx0XHRpbnNlcnRTcGFjZXM6IGNvbmZpZy5pbnNlcnRTcGFjZXMsXG5cdFx0XHRcdFx0dXNlVGFiU3RvcHM6IGNvbmZpZy51c2VUYWJTdG9wcyxcblx0XHRcdFx0XHRhdXRvSW5kZW50OiBjb25maWcuYXV0b0luZGVudFxuXHRcdFx0XHR9LCBjb25maWcubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb21tYW5kcztcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nb29kSW5kZW50Rm9yTGluZShjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRsZXQgYWN0aW9uOiBJbmRlbnRBY3Rpb24gfCBFbnRlckFjdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBpbmRlbnRhdGlvbjogc3RyaW5nID0gJyc7XG5cdFx0Y29uc3QgZXhwZWN0ZWRJbmRlbnRBY3Rpb24gPSBnZXRJbmhlcml0SW5kZW50Rm9yTGluZShjb25maWcuYXV0b0luZGVudCwgbW9kZWwsIGxpbmVOdW1iZXIsIGZhbHNlLCBjb25maWcubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKGV4cGVjdGVkSW5kZW50QWN0aW9uKSB7XG5cdFx0XHRhY3Rpb24gPSBleHBlY3RlZEluZGVudEFjdGlvbi5hY3Rpb247XG5cdFx0XHRpbmRlbnRhdGlvbiA9IGV4cGVjdGVkSW5kZW50QWN0aW9uLmluZGVudGF0aW9uO1xuXHRcdH0gZWxzZSBpZiAobGluZU51bWJlciA+IDEpIHtcblx0XHRcdGxldCBsYXN0TGluZU51bWJlcjogbnVtYmVyO1xuXHRcdFx0Zm9yIChsYXN0TGluZU51bWJlciA9IGxpbmVOdW1iZXIgLSAxOyBsYXN0TGluZU51bWJlciA+PSAxOyBsYXN0TGluZU51bWJlci0tKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGFzdExpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBub25XaGl0ZXNwYWNlSWR4ID0gc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVUZXh0KTtcblx0XHRcdFx0aWYgKG5vbldoaXRlc3BhY2VJZHggPj0gMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobGFzdExpbmVOdW1iZXIgPCAxKSB7XG5cdFx0XHRcdC8vIE5vIHByZXZpb3VzIGxpbmUgd2l0aCBjb250ZW50IGZvdW5kXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsYXN0TGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBleHBlY3RlZEVudGVyQWN0aW9uID0gZ2V0RW50ZXJBY3Rpb24oY29uZmlnLmF1dG9JbmRlbnQsIG1vZGVsLCBuZXcgUmFuZ2UobGFzdExpbmVOdW1iZXIsIG1heENvbHVtbiwgbGFzdExpbmVOdW1iZXIsIG1heENvbHVtbiksIGNvbmZpZy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGlmIChleHBlY3RlZEVudGVyQWN0aW9uKSB7XG5cdFx0XHRcdGluZGVudGF0aW9uID0gZXhwZWN0ZWRFbnRlckFjdGlvbi5pbmRlbnRhdGlvbiArIGV4cGVjdGVkRW50ZXJBY3Rpb24uYXBwZW5kVGV4dDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGFjdGlvbikge1xuXHRcdFx0aWYgKGFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLkluZGVudCkge1xuXHRcdFx0XHRpbmRlbnRhdGlvbiA9IHNoaWZ0SW5kZW50KGNvbmZpZywgaW5kZW50YXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLk91dGRlbnQpIHtcblx0XHRcdFx0aW5kZW50YXRpb24gPSB1bnNoaWZ0SW5kZW50KGNvbmZpZywgaW5kZW50YXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0aW5kZW50YXRpb24gPSBjb25maWcubm9ybWFsaXplSW5kZW50YXRpb24oaW5kZW50YXRpb24pO1xuXHRcdH1cblx0XHRpZiAoIWluZGVudGF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIGluZGVudGF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlcGxhY2VKdW1wVG9OZXh0SW5kZW50KGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGluc2VydHNBdXRvV2hpdGVzcGFjZTogYm9vbGVhbik6IFJlcGxhY2VDb21tYW5kIHtcblx0XHRsZXQgdHlwZVRleHQgPSAnJztcblx0XHRjb25zdCBwb3NpdGlvbiA9IHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0aWYgKGNvbmZpZy5pbnNlcnRTcGFjZXMpIHtcblx0XHRcdGNvbnN0IHZpc2libGVDb2x1bW5Gcm9tQ29sdW1uID0gY29uZmlnLnZpc2libGVDb2x1bW5Gcm9tQ29sdW1uKG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0XHRjb25zdCBpbmRlbnRTaXplID0gY29uZmlnLmluZGVudFNpemU7XG5cdFx0XHRjb25zdCBzcGFjZXNDbnQgPSBpbmRlbnRTaXplIC0gKHZpc2libGVDb2x1bW5Gcm9tQ29sdW1uICUgaW5kZW50U2l6ZSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNwYWNlc0NudDsgaSsrKSB7XG5cdFx0XHRcdHR5cGVUZXh0ICs9ICcgJztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dHlwZVRleHQgPSAnXFx0Jztcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSZXBsYWNlQ29tbWFuZChzZWxlY3Rpb24sIHR5cGVUZXh0LCBpbnNlcnRzQXV0b1doaXRlc3BhY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCYXNlVHlwZVdpdGhBdXRvQ2xvc2luZ0NvbW1hbmQgZXh0ZW5kcyBSZXBsYWNlQ29tbWFuZFdpdGhPZmZzZXRDdXJzb3JTdGF0ZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3BlbkNoYXJhY3Rlcjogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zZUNoYXJhY3Rlcjogc3RyaW5nO1xuXHRwdWJsaWMgY2xvc2VDaGFyYWN0ZXJSYW5nZTogUmFuZ2UgfCBudWxsO1xuXHRwdWJsaWMgZW5jbG9zaW5nUmFuZ2U6IFJhbmdlIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihzZWxlY3Rpb246IFNlbGVjdGlvbiwgdGV4dDogc3RyaW5nLCBsaW5lTnVtYmVyRGVsdGFPZmZzZXQ6IG51bWJlciwgY29sdW1uRGVsdGFPZmZzZXQ6IG51bWJlciwgb3BlbkNoYXJhY3Rlcjogc3RyaW5nLCBjbG9zZUNoYXJhY3Rlcjogc3RyaW5nKSB7XG5cdFx0c3VwZXIoc2VsZWN0aW9uLCB0ZXh0LCBsaW5lTnVtYmVyRGVsdGFPZmZzZXQsIGNvbHVtbkRlbHRhT2Zmc2V0KTtcblx0XHR0aGlzLl9vcGVuQ2hhcmFjdGVyID0gb3BlbkNoYXJhY3Rlcjtcblx0XHR0aGlzLl9jbG9zZUNoYXJhY3RlciA9IGNsb3NlQ2hhcmFjdGVyO1xuXHRcdHRoaXMuY2xvc2VDaGFyYWN0ZXJSYW5nZSA9IG51bGw7XG5cdFx0dGhpcy5lbmNsb3NpbmdSYW5nZSA9IG51bGw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NvbXB1dGVDdXJzb3JTdGF0ZVdpdGhSYW5nZShtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlLCBoZWxwZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSk6IFNlbGVjdGlvbiB7XG5cdFx0dGhpcy5jbG9zZUNoYXJhY3RlclJhbmdlID0gbmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uIC0gdGhpcy5fY2xvc2VDaGFyYWN0ZXIubGVuZ3RoLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXHRcdHRoaXMuZW5jbG9zaW5nUmFuZ2UgPSBuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4gLSB0aGlzLl9vcGVuQ2hhcmFjdGVyLmxlbmd0aCAtIHRoaXMuX2Nsb3NlQ2hhcmFjdGVyLmxlbmd0aCwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRyZXR1cm4gc3VwZXIuY29tcHV0ZUN1cnNvclN0YXRlKG1vZGVsLCBoZWxwZXIpO1xuXHR9XG59XG5cbmNsYXNzIFR5cGVXaXRoQXV0b0Nsb3NpbmdDb21tYW5kIGV4dGVuZHMgQmFzZVR5cGVXaXRoQXV0b0Nsb3NpbmdDb21tYW5kIHtcblxuXHRjb25zdHJ1Y3RvcihzZWxlY3Rpb246IFNlbGVjdGlvbiwgb3BlbkNoYXJhY3Rlcjogc3RyaW5nLCBpbnNlcnRPcGVuQ2hhcmFjdGVyOiBib29sZWFuLCBjbG9zZUNoYXJhY3Rlcjogc3RyaW5nKSB7XG5cdFx0Y29uc3QgdGV4dCA9IChpbnNlcnRPcGVuQ2hhcmFjdGVyID8gb3BlbkNoYXJhY3RlciA6ICcnKSArIGNsb3NlQ2hhcmFjdGVyO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJEZWx0YU9mZnNldCA9IDA7XG5cdFx0Y29uc3QgY29sdW1uRGVsdGFPZmZzZXQgPSAtY2xvc2VDaGFyYWN0ZXIubGVuZ3RoO1xuXHRcdHN1cGVyKHNlbGVjdGlvbiwgdGV4dCwgbGluZU51bWJlckRlbHRhT2Zmc2V0LCBjb2x1bW5EZWx0YU9mZnNldCwgb3BlbkNoYXJhY3RlciwgY2xvc2VDaGFyYWN0ZXIpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGNvbXB1dGVDdXJzb3JTdGF0ZShtb2RlbDogSVRleHRNb2RlbCwgaGVscGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEpOiBTZWxlY3Rpb24ge1xuXHRcdGNvbnN0IGludmVyc2VFZGl0T3BlcmF0aW9ucyA9IGhlbHBlci5nZXRJbnZlcnNlRWRpdE9wZXJhdGlvbnMoKTtcblx0XHRjb25zdCByYW5nZSA9IGludmVyc2VFZGl0T3BlcmF0aW9uc1swXS5yYW5nZTtcblx0XHRyZXR1cm4gdGhpcy5fY29tcHV0ZUN1cnNvclN0YXRlV2l0aFJhbmdlKG1vZGVsLCByYW5nZSwgaGVscGVyKTtcblx0fVxufVxuXG5jbGFzcyBUeXBlV2l0aEluZGVudGF0aW9uQW5kQXV0b0Nsb3NpbmdDb21tYW5kIGV4dGVuZHMgQmFzZVR5cGVXaXRoQXV0b0Nsb3NpbmdDb21tYW5kIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvSW5kZW50YXRpb25FZGl0OiB7IHJhbmdlOiBSYW5nZTsgdGV4dDogc3RyaW5nIH07XG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9DbG9zaW5nRWRpdDogeyByYW5nZTogUmFuZ2U7IHRleHQ6IHN0cmluZyB9O1xuXG5cdGNvbnN0cnVjdG9yKGF1dG9JbmRlbnRhdGlvbkVkaXQ6IHsgcmFuZ2U6IFJhbmdlOyB0ZXh0OiBzdHJpbmcgfSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIG9wZW5DaGFyYWN0ZXI6IHN0cmluZywgY2xvc2VDaGFyYWN0ZXI6IHN0cmluZykge1xuXHRcdGNvbnN0IHRleHQgPSBvcGVuQ2hhcmFjdGVyICsgY2xvc2VDaGFyYWN0ZXI7XG5cdFx0Y29uc3QgbGluZU51bWJlckRlbHRhT2Zmc2V0ID0gMDtcblx0XHRjb25zdCBjb2x1bW5EZWx0YU9mZnNldCA9IG9wZW5DaGFyYWN0ZXIubGVuZ3RoO1xuXHRcdHN1cGVyKHNlbGVjdGlvbiwgdGV4dCwgbGluZU51bWJlckRlbHRhT2Zmc2V0LCBjb2x1bW5EZWx0YU9mZnNldCwgb3BlbkNoYXJhY3RlciwgY2xvc2VDaGFyYWN0ZXIpO1xuXHRcdHRoaXMuX2F1dG9JbmRlbnRhdGlvbkVkaXQgPSBhdXRvSW5kZW50YXRpb25FZGl0O1xuXHRcdHRoaXMuX2F1dG9DbG9zaW5nRWRpdCA9IHsgcmFuZ2U6IHNlbGVjdGlvbiwgdGV4dCB9O1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldEVkaXRPcGVyYXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBidWlsZGVyOiBJRWRpdE9wZXJhdGlvbkJ1aWxkZXIpOiB2b2lkIHtcblx0XHRidWlsZGVyLmFkZFRyYWNrZWRFZGl0T3BlcmF0aW9uKHRoaXMuX2F1dG9JbmRlbnRhdGlvbkVkaXQucmFuZ2UsIHRoaXMuX2F1dG9JbmRlbnRhdGlvbkVkaXQudGV4dCk7XG5cdFx0YnVpbGRlci5hZGRUcmFja2VkRWRpdE9wZXJhdGlvbih0aGlzLl9hdXRvQ2xvc2luZ0VkaXQucmFuZ2UsIHRoaXMuX2F1dG9DbG9zaW5nRWRpdC50ZXh0KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjb21wdXRlQ3Vyc29yU3RhdGUobW9kZWw6IElUZXh0TW9kZWwsIGhlbHBlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXJEYXRhKTogU2VsZWN0aW9uIHtcblx0XHRjb25zdCBpbnZlcnNlRWRpdE9wZXJhdGlvbnMgPSBoZWxwZXIuZ2V0SW52ZXJzZUVkaXRPcGVyYXRpb25zKCk7XG5cdFx0aWYgKGludmVyc2VFZGl0T3BlcmF0aW9ucy5sZW5ndGggIT09IDIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhlcmUgc2hvdWxkIGJlIHR3byBpbnZlcnNlIGVkaXQgb3BlcmF0aW9ucyEnKTtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2UxID0gaW52ZXJzZUVkaXRPcGVyYXRpb25zWzBdLnJhbmdlO1xuXHRcdGNvbnN0IHJhbmdlMiA9IGludmVyc2VFZGl0T3BlcmF0aW9uc1sxXS5yYW5nZTtcblx0XHRjb25zdCByYW5nZSA9IHJhbmdlMS5wbHVzUmFuZ2UocmFuZ2UyKTtcblx0XHRyZXR1cm4gdGhpcy5fY29tcHV0ZUN1cnNvclN0YXRlV2l0aFJhbmdlKG1vZGVsLCByYW5nZSwgaGVscGVyKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRUeXBpbmdPcGVyYXRpb24odHlwZWRUZXh0OiBzdHJpbmcsIHByZXZpb3VzVHlwaW5nT3BlcmF0aW9uOiBFZGl0T3BlcmF0aW9uVHlwZSk6IEVkaXRPcGVyYXRpb25UeXBlIHtcblx0aWYgKHR5cGVkVGV4dCA9PT0gJyAnKSB7XG5cdFx0cmV0dXJuIHByZXZpb3VzVHlwaW5nT3BlcmF0aW9uID09PSBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdGaXJzdFNwYWNlXG5cdFx0XHR8fCBwcmV2aW91c1R5cGluZ09wZXJhdGlvbiA9PT0gRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nQ29uc2VjdXRpdmVTcGFjZVxuXHRcdFx0PyBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdDb25zZWN1dGl2ZVNwYWNlXG5cdFx0XHQ6IEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ0ZpcnN0U3BhY2U7XG5cdH1cblxuXHRyZXR1cm4gRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nT3RoZXI7XG59XG5cbmZ1bmN0aW9uIHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZXR3ZWVuKHByZXZpb3VzVHlwaW5nT3BlcmF0aW9uOiBFZGl0T3BlcmF0aW9uVHlwZSwgdHlwaW5nT3BlcmF0aW9uOiBFZGl0T3BlcmF0aW9uVHlwZSk6IGJvb2xlYW4ge1xuXHRpZiAoaXNUeXBpbmdPcGVyYXRpb24ocHJldmlvdXNUeXBpbmdPcGVyYXRpb24pICYmICFpc1R5cGluZ09wZXJhdGlvbih0eXBpbmdPcGVyYXRpb24pKSB7XG5cdFx0Ly8gQWx3YXlzIHNldCBhbiB1bmRvIHN0b3AgYmVmb3JlIG5vbi10eXBlIG9wZXJhdGlvbnNcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAocHJldmlvdXNUeXBpbmdPcGVyYXRpb24gPT09IEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ0ZpcnN0U3BhY2UpIHtcblx0XHQvLyBgYWJjIHxkYDogTm8gdW5kbyBzdG9wXG5cdFx0Ly8gYGFiYyAgfGRgOiBVbmRvIHN0b3Bcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Ly8gSW5zZXJ0IHVuZG8gc3RvcCBiZXR3ZWVuIGRpZmZlcmVudCBvcGVyYXRpb24gdHlwZXNcblx0cmV0dXJuIG5vcm1hbGl6ZU9wZXJhdGlvblR5cGUocHJldmlvdXNUeXBpbmdPcGVyYXRpb24pICE9PSBub3JtYWxpemVPcGVyYXRpb25UeXBlKHR5cGluZ09wZXJhdGlvbik7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU9wZXJhdGlvblR5cGUodHlwZTogRWRpdE9wZXJhdGlvblR5cGUpOiBFZGl0T3BlcmF0aW9uVHlwZSB8ICdzcGFjZScge1xuXHRyZXR1cm4gKHR5cGUgPT09IEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ0NvbnNlY3V0aXZlU3BhY2UgfHwgdHlwZSA9PT0gRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nRmlyc3RTcGFjZSlcblx0XHQ/ICdzcGFjZSdcblx0XHQ6IHR5cGU7XG59XG5cbmZ1bmN0aW9uIGlzVHlwaW5nT3BlcmF0aW9uKHR5cGU6IEVkaXRPcGVyYXRpb25UeXBlKTogYm9vbGVhbiB7XG5cdHJldHVybiB0eXBlID09PSBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdPdGhlclxuXHRcdHx8IHR5cGUgPT09IEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ0ZpcnN0U3BhY2Vcblx0XHR8fCB0eXBlID09PSBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdDb25zZWN1dGl2ZVNwYWNlO1xufVxuXG5mdW5jdGlvbiBpc0F1dG9DbG9zaW5nT3ZlcnR5cGUoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGF1dG9DbG9zZWRDaGFyYWN0ZXJzOiBSYW5nZVtdLCBjaDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChjb25maWcuYXV0b0Nsb3NpbmdPdmVydHlwZSA9PT0gJ25ldmVyJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoIWNvbmZpZy5hdXRvQ2xvc2luZ1BhaXJzLmF1dG9DbG9zaW5nUGFpcnNDbG9zZVNpbmdsZUNoYXIuaGFzKGNoKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cdFx0aWYgKCFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uID0gc2VsZWN0aW9uLmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBhZnRlckNoYXJhY3RlciA9IGxpbmVUZXh0LmNoYXJBdChwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0XHRpZiAoYWZ0ZXJDaGFyYWN0ZXIgIT09IGNoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIERvIG5vdCBvdmVyLXR5cGUgcXVvdGVzIGFmdGVyIGEgYmFja3NsYXNoXG5cdFx0Y29uc3QgY2hJc1F1b3RlID0gaXNRdW90ZShjaCk7XG5cdFx0Y29uc3QgYmVmb3JlQ2hhcmFjdGVyID0gcG9zaXRpb24uY29sdW1uID4gMiA/IGxpbmVUZXh0LmNoYXJDb2RlQXQocG9zaXRpb24uY29sdW1uIC0gMikgOiBDaGFyQ29kZS5OdWxsO1xuXHRcdGlmIChiZWZvcmVDaGFyYWN0ZXIgPT09IENoYXJDb2RlLkJhY2tzbGFzaCAmJiBjaElzUXVvdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gTXVzdCBvdmVyLXR5cGUgYSBjbG9zaW5nIGNoYXJhY3RlciB0eXBlZCBieSB0aGUgZWRpdG9yXG5cdFx0aWYgKGNvbmZpZy5hdXRvQ2xvc2luZ092ZXJ0eXBlID09PSAnYXV0bycpIHtcblx0XHRcdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSBhdXRvQ2xvc2VkQ2hhcmFjdGVycy5sZW5ndGg7IGogPCBsZW5KOyBqKyspIHtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NlZENoYXJhY3RlciA9IGF1dG9DbG9zZWRDaGFyYWN0ZXJzW2pdO1xuXHRcdFx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA9PT0gYXV0b0Nsb3NlZENoYXJhY3Rlci5zdGFydExpbmVOdW1iZXIgJiYgcG9zaXRpb24uY29sdW1uID09PSBhdXRvQ2xvc2VkQ2hhcmFjdGVyLnN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZvdW5kKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHR5cGVDb21tYW5kKHJhbmdlOiBSYW5nZSwgdGV4dDogc3RyaW5nLCBrZWVwUG9zaXRpb246IGJvb2xlYW4pOiBJQ29tbWFuZCB7XG5cdGlmIChrZWVwUG9zaXRpb24pIHtcblx0XHRyZXR1cm4gbmV3IFJlcGxhY2VDb21tYW5kV2l0aG91dENoYW5naW5nUG9zaXRpb24ocmFuZ2UsIHRleHQsIHRydWUpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBuZXcgUmVwbGFjZUNvbW1hbmQocmFuZ2UsIHRleHQsIHRydWUpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaGlmdEluZGVudChjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIGluZGVudGF0aW9uOiBzdHJpbmcsIGNvdW50PzogbnVtYmVyKTogc3RyaW5nIHtcblx0Y291bnQgPSBjb3VudCB8fCAxO1xuXHRyZXR1cm4gU2hpZnRDb21tYW5kLnNoaWZ0SW5kZW50KGluZGVudGF0aW9uLCBpbmRlbnRhdGlvbi5sZW5ndGggKyBjb3VudCwgY29uZmlnLnRhYlNpemUsIGNvbmZpZy5pbmRlbnRTaXplLCBjb25maWcuaW5zZXJ0U3BhY2VzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVuc2hpZnRJbmRlbnQoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBpbmRlbnRhdGlvbjogc3RyaW5nLCBjb3VudD86IG51bWJlcik6IHN0cmluZyB7XG5cdGNvdW50ID0gY291bnQgfHwgMTtcblx0cmV0dXJuIFNoaWZ0Q29tbWFuZC51bnNoaWZ0SW5kZW50KGluZGVudGF0aW9uLCBpbmRlbnRhdGlvbi5sZW5ndGggKyBjb3VudCwgY29uZmlnLnRhYlNpemUsIGNvbmZpZy5pbmRlbnRTaXplLCBjb25maWcuaW5zZXJ0U3BhY2VzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFN1cnJvdW5kQ2hhcihjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIGNoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGlzUXVvdGUoY2gpKSB7XG5cdFx0cmV0dXJuIChjb25maWcuYXV0b1N1cnJvdW5kID09PSAncXVvdGVzJyB8fCBjb25maWcuYXV0b1N1cnJvdW5kID09PSAnbGFuZ3VhZ2VEZWZpbmVkJyk7XG5cdH0gZWxzZSB7XG5cdFx0Ly8gQ2hhcmFjdGVyIGlzIGEgYnJhY2tldFxuXHRcdHJldHVybiAoY29uZmlnLmF1dG9TdXJyb3VuZCA9PT0gJ2JyYWNrZXRzJyB8fCBjb25maWcuYXV0b1N1cnJvdW5kID09PSAnbGFuZ3VhZ2VEZWZpbmVkJyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFlBQVksYUFBYTtBQUN6QixTQUFTLGdCQUFnQixxQ0FBcUMsdUNBQXVDLHNDQUFzQyx3QkFBd0IsOENBQThDO0FBQ2pOLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQThCLHFCQUFxQixtQkFBdUMsZUFBZTtBQUN6RyxTQUFTLG9CQUFvQiwrQkFBK0I7QUFDNUQsU0FBUyxhQUFhO0FBRXRCLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQXNCLG9CQUF3RDtBQUM5RSxTQUFTLGdDQUFnQztBQUV6QyxTQUFvQyxnQ0FBZ0M7QUFDcEUsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx3QkFBd0IsbUJBQW1CLCtCQUErQjtBQUNuRixTQUFTLHNCQUFzQjtBQUd4QixNQUFNLG9CQUFvQjtBQUFBLEVBRWhDLE9BQWMsU0FBUyxRQUE2QixPQUFtQixZQUF5QixJQUFZLG9CQUE4RDtBQUN6SyxRQUFJLENBQUMsc0JBQXNCLEtBQUssa0JBQWtCLFFBQVEsT0FBTyxVQUFVLEdBQUc7QUFDN0UsWUFBTSwyQkFBNEUsQ0FBQztBQUNuRixpQkFBVyxhQUFhLFlBQVk7QUFDbkMsY0FBTSxjQUFjLEtBQUssbUNBQW1DLFFBQVEsT0FBTyxXQUFXLEVBQUU7QUFDeEYsWUFBSSxnQkFBZ0IsTUFBTTtBQUV6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LFlBQVksV0FBVyxDQUFDO0FBQzlCLFFBQUksQ0FBQyxVQUFVLFFBQVEsR0FBRztBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sV0FBVyxVQUFVLFlBQVk7QUFDdkMsVUFBTSxXQUFXLE1BQU0sZUFBZSxTQUFTLFVBQVU7QUFDekQsVUFBTSxpQkFBaUIsU0FBUyxPQUFPLFNBQVMsU0FBUyxDQUFDO0FBQzFELFFBQUksbUJBQW1CLElBQUk7QUFDMUIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFlBQVksUUFBUSxFQUFFO0FBQzVCLFVBQU0sa0JBQWtCLFNBQVMsU0FBUyxJQUFJLFNBQVMsV0FBVyxTQUFTLFNBQVMsQ0FBQyxJQUFJLFNBQVM7QUFDbEcsUUFBSSxvQkFBb0IsU0FBUyxhQUFhLFdBQVc7QUFDeEQsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLE9BQU8sd0JBQXdCLFFBQVE7QUFDMUMsVUFBSSxRQUFRO0FBQ1osZUFBUyxJQUFJLEdBQUcsT0FBTyxxQkFBcUIsUUFBUSxJQUFJLE1BQU0sS0FBSztBQUNsRSxjQUFNLHNCQUFzQixxQkFBcUIsQ0FBQztBQUNsRCxZQUFJLFNBQVMsZUFBZSxvQkFBb0IsbUJBQW1CLFNBQVMsV0FBVyxvQkFBb0IsYUFBYTtBQUN2SCxrQkFBUTtBQUNSO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsT0FBTztBQUNYLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLFlBQVksT0FBYyxNQUFjLGNBQWlDO0FBQ2pGLE1BQUksY0FBYztBQUNqQixXQUFPLElBQUksc0NBQXNDLE9BQU8sTUFBTSxJQUFJO0FBQUEsRUFDbkUsT0FBTztBQUNOLFdBQU8sSUFBSSxlQUFlLE9BQU8sTUFBTSxJQUFJO0FBQUEsRUFDNUM7QUFDRDtBQUVPLFNBQVMsWUFBWSxRQUE2QixhQUFxQixPQUF3QjtBQUNyRyxVQUFRLFNBQVM7QUFDakIsU0FBTyxhQUFhLFlBQVksYUFBYSxZQUFZLFNBQVMsT0FBTyxPQUFPLFNBQVMsT0FBTyxZQUFZLE9BQU8sWUFBWTtBQUNoSTtBQUVPLFNBQVMsY0FBYyxRQUE2QixhQUFxQixPQUF3QjtBQUN2RyxVQUFRLFNBQVM7QUFDakIsU0FBTyxhQUFhLGNBQWMsYUFBYSxZQUFZLFNBQVMsT0FBTyxPQUFPLFNBQVMsT0FBTyxZQUFZLE9BQU8sWUFBWTtBQUNsSTtBQUVPLFNBQVMsbUJBQW1CLFFBQTZCLElBQXFCO0FBQ3BGLE1BQUksUUFBUSxFQUFFLEdBQUc7QUFDaEIsV0FBUSxPQUFPLGlCQUFpQixZQUFZLE9BQU8saUJBQWlCO0FBQUEsRUFDckUsT0FBTztBQUVOLFdBQVEsT0FBTyxpQkFBaUIsY0FBYyxPQUFPLGlCQUFpQjtBQUFBLEVBQ3ZFO0FBQ0Q7IiwKICAibmFtZXMiOiBbImxpbmVUZXh0IiwgImluZGVudGF0aW9uIl0KfQo=
