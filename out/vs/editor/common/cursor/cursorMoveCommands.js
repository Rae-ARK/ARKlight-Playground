import * as types from "../../../base/common/types.js";
import { CursorState, SelectionStartKind, SingleCursorState } from "../cursorCommon.js";
import { MoveOperations } from "./cursorMoveOperations.js";
import { WordOperations } from "./cursorWordOperations.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { TextDirection } from "../model.js";
class CursorMoveCommands {
  static addCursorDown(viewModel, cursors, useLogicalLine) {
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
      if (useLogicalLine) {
        result[resultLen++] = CursorState.fromModelState(MoveOperations.translateDown(viewModel.cursorConfig, viewModel.model, cursor.modelState));
      } else {
        result[resultLen++] = CursorState.fromViewState(MoveOperations.translateDown(viewModel.cursorConfig, viewModel, cursor.viewState));
      }
    }
    return result;
  }
  static addCursorUp(viewModel, cursors, useLogicalLine) {
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[resultLen++] = new CursorState(cursor.modelState, cursor.viewState);
      if (useLogicalLine) {
        result[resultLen++] = CursorState.fromModelState(MoveOperations.translateUp(viewModel.cursorConfig, viewModel.model, cursor.modelState));
      } else {
        result[resultLen++] = CursorState.fromViewState(MoveOperations.translateUp(viewModel.cursorConfig, viewModel, cursor.viewState));
      }
    }
    return result;
  }
  static moveToBeginningOfLine(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = this._moveToLineStart(viewModel, cursor, inSelectionMode);
    }
    return result;
  }
  static _moveToLineStart(viewModel, cursor, inSelectionMode) {
    const currentViewStateColumn = cursor.viewState.position.column;
    const currentModelStateColumn = cursor.modelState.position.column;
    const isFirstLineOfWrappedLine = currentViewStateColumn === currentModelStateColumn;
    const currentViewStatelineNumber = cursor.viewState.position.lineNumber;
    const firstNonBlankColumn = viewModel.getLineFirstNonWhitespaceColumn(currentViewStatelineNumber);
    const isBeginningOfViewLine = currentViewStateColumn === firstNonBlankColumn;
    if (!isFirstLineOfWrappedLine && !isBeginningOfViewLine) {
      return this._moveToLineStartByView(viewModel, cursor, inSelectionMode);
    } else {
      return this._moveToLineStartByModel(viewModel, cursor, inSelectionMode);
    }
  }
  static _moveToLineStartByView(viewModel, cursor, inSelectionMode) {
    return CursorState.fromViewState(
      MoveOperations.moveToBeginningOfLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode)
    );
  }
  static _moveToLineStartByModel(viewModel, cursor, inSelectionMode) {
    return CursorState.fromModelState(
      MoveOperations.moveToBeginningOfLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode)
    );
  }
  static moveToEndOfLine(viewModel, cursors, inSelectionMode, sticky) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = this._moveToLineEnd(viewModel, cursor, inSelectionMode, sticky);
    }
    return result;
  }
  static _moveToLineEnd(viewModel, cursor, inSelectionMode, sticky) {
    const viewStatePosition = cursor.viewState.position;
    const viewModelMaxColumn = viewModel.getLineMaxColumn(viewStatePosition.lineNumber);
    const isEndOfViewLine = viewStatePosition.column === viewModelMaxColumn;
    const modelStatePosition = cursor.modelState.position;
    const modelMaxColumn = viewModel.model.getLineMaxColumn(modelStatePosition.lineNumber);
    const isEndLineOfWrappedLine = viewModelMaxColumn - viewStatePosition.column === modelMaxColumn - modelStatePosition.column;
    if (isEndOfViewLine || isEndLineOfWrappedLine) {
      return this._moveToLineEndByModel(viewModel, cursor, inSelectionMode, sticky);
    } else {
      return this._moveToLineEndByView(viewModel, cursor, inSelectionMode, sticky);
    }
  }
  static _moveToLineEndByView(viewModel, cursor, inSelectionMode, sticky) {
    return CursorState.fromViewState(
      MoveOperations.moveToEndOfLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, sticky)
    );
  }
  static _moveToLineEndByModel(viewModel, cursor, inSelectionMode, sticky) {
    return CursorState.fromModelState(
      MoveOperations.moveToEndOfLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, sticky)
    );
  }
  static expandLineSelection(viewModel, cursors) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const startLineNumber = cursor.modelState.selection.startLineNumber;
      const lineCount = viewModel.model.getLineCount();
      let endLineNumber = cursor.modelState.selection.endLineNumber;
      let endColumn;
      if (endLineNumber === lineCount) {
        endColumn = viewModel.model.getLineMaxColumn(lineCount);
      } else {
        endLineNumber++;
        endColumn = 1;
      }
      result[i] = CursorState.fromModelState(new SingleCursorState(
        new Range(startLineNumber, 1, startLineNumber, 1),
        SelectionStartKind.Simple,
        0,
        new Position(endLineNumber, endColumn),
        0
      ));
    }
    return result;
  }
  static moveToBeginningOfBuffer(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromModelState(MoveOperations.moveToBeginningOfBuffer(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode));
    }
    return result;
  }
  static moveToEndOfBuffer(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromModelState(MoveOperations.moveToEndOfBuffer(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode));
    }
    return result;
  }
  static selectAll(viewModel, cursor) {
    const lineCount = viewModel.model.getLineCount();
    const maxColumn = viewModel.model.getLineMaxColumn(lineCount);
    return CursorState.fromModelState(new SingleCursorState(
      new Range(1, 1, 1, 1),
      SelectionStartKind.Simple,
      0,
      new Position(lineCount, maxColumn),
      0
    ));
  }
  static line(viewModel, cursor, inSelectionMode, _position, _viewPosition) {
    const position = viewModel.model.validatePosition(_position);
    const viewPosition = _viewPosition ? viewModel.coordinatesConverter.validateViewPosition(new Position(_viewPosition.lineNumber, _viewPosition.column), position) : viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
    if (!inSelectionMode) {
      const lineCount = viewModel.model.getLineCount();
      let selectToLineNumber = position.lineNumber + 1;
      let selectToColumn = 1;
      if (selectToLineNumber > lineCount) {
        selectToLineNumber = lineCount;
        selectToColumn = viewModel.model.getLineMaxColumn(selectToLineNumber);
      }
      return CursorState.fromModelState(new SingleCursorState(
        new Range(position.lineNumber, 1, selectToLineNumber, selectToColumn),
        SelectionStartKind.Line,
        0,
        new Position(selectToLineNumber, selectToColumn),
        0
      ));
    }
    const enteringLineNumber = cursor.modelState.selectionStart.getStartPosition().lineNumber;
    if (position.lineNumber < enteringLineNumber) {
      return CursorState.fromViewState(cursor.viewState.move(
        true,
        viewPosition.lineNumber,
        1,
        0
      ));
    } else if (position.lineNumber > enteringLineNumber) {
      const lineCount = viewModel.getLineCount();
      let selectToViewLineNumber = viewPosition.lineNumber + 1;
      let selectToViewColumn = 1;
      if (selectToViewLineNumber > lineCount) {
        selectToViewLineNumber = lineCount;
        selectToViewColumn = viewModel.getLineMaxColumn(selectToViewLineNumber);
      }
      return CursorState.fromViewState(cursor.viewState.move(
        true,
        selectToViewLineNumber,
        selectToViewColumn,
        0
      ));
    } else {
      const endPositionOfSelectionStart = cursor.modelState.selectionStart.getEndPosition();
      return CursorState.fromModelState(cursor.modelState.move(
        true,
        endPositionOfSelectionStart.lineNumber,
        endPositionOfSelectionStart.column,
        0
      ));
    }
  }
  static word(viewModel, cursor, inSelectionMode, _position) {
    const position = viewModel.model.validatePosition(_position);
    return CursorState.fromModelState(WordOperations.word(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, position));
  }
  static cancelSelection(viewModel, cursor) {
    if (!cursor.modelState.hasSelection()) {
      return new CursorState(cursor.modelState, cursor.viewState);
    }
    const lineNumber = cursor.viewState.position.lineNumber;
    const column = cursor.viewState.position.column;
    return CursorState.fromViewState(new SingleCursorState(
      new Range(lineNumber, column, lineNumber, column),
      SelectionStartKind.Simple,
      0,
      new Position(lineNumber, column),
      0
    ));
  }
  static moveTo(viewModel, cursor, inSelectionMode, _position, _viewPosition) {
    if (inSelectionMode) {
      if (cursor.modelState.selectionStartKind === SelectionStartKind.Word) {
        return this.word(viewModel, cursor, inSelectionMode, _position);
      }
      if (cursor.modelState.selectionStartKind === SelectionStartKind.Line) {
        return this.line(viewModel, cursor, inSelectionMode, _position, _viewPosition);
      }
    }
    const position = viewModel.model.validatePosition(_position);
    const viewPosition = _viewPosition ? viewModel.coordinatesConverter.validateViewPosition(new Position(_viewPosition.lineNumber, _viewPosition.column), position) : viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
    return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, viewPosition.lineNumber, viewPosition.column, 0));
  }
  static simpleMove(viewModel, cursors, direction, inSelectionMode, value, unit) {
    switch (direction) {
      case CursorMove.Direction.Left: {
        if (unit === CursorMove.Unit.HalfLine) {
          return this._moveHalfLineLeft(viewModel, cursors, inSelectionMode);
        } else {
          return this._moveLeft(viewModel, cursors, inSelectionMode, value);
        }
      }
      case CursorMove.Direction.Right: {
        if (unit === CursorMove.Unit.HalfLine) {
          return this._moveHalfLineRight(viewModel, cursors, inSelectionMode);
        } else {
          return this._moveRight(viewModel, cursors, inSelectionMode, value);
        }
      }
      case CursorMove.Direction.Up: {
        if (unit === CursorMove.Unit.WrappedLine) {
          return this._moveUpByViewLines(viewModel, cursors, inSelectionMode, value);
        } else if (unit === CursorMove.Unit.FoldedLine) {
          return this._moveUpByFoldedLines(viewModel, cursors, inSelectionMode, value);
        } else {
          return this._moveUpByModelLines(viewModel, cursors, inSelectionMode, value);
        }
      }
      case CursorMove.Direction.Down: {
        if (unit === CursorMove.Unit.WrappedLine) {
          return this._moveDownByViewLines(viewModel, cursors, inSelectionMode, value);
        } else if (unit === CursorMove.Unit.FoldedLine) {
          return this._moveDownByFoldedLines(viewModel, cursors, inSelectionMode, value);
        } else {
          return this._moveDownByModelLines(viewModel, cursors, inSelectionMode, value);
        }
      }
      case CursorMove.Direction.PrevBlankLine: {
        if (unit === CursorMove.Unit.WrappedLine) {
          return cursors.map((cursor) => CursorState.fromViewState(MoveOperations.moveToPrevBlankLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode)));
        } else {
          return cursors.map((cursor) => CursorState.fromModelState(MoveOperations.moveToPrevBlankLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode)));
        }
      }
      case CursorMove.Direction.NextBlankLine: {
        if (unit === CursorMove.Unit.WrappedLine) {
          return cursors.map((cursor) => CursorState.fromViewState(MoveOperations.moveToNextBlankLine(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode)));
        } else {
          return cursors.map((cursor) => CursorState.fromModelState(MoveOperations.moveToNextBlankLine(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode)));
        }
      }
      case CursorMove.Direction.WrappedLineStart: {
        return this._moveToViewMinColumn(viewModel, cursors, inSelectionMode);
      }
      case CursorMove.Direction.WrappedLineFirstNonWhitespaceCharacter: {
        return this._moveToViewFirstNonWhitespaceColumn(viewModel, cursors, inSelectionMode);
      }
      case CursorMove.Direction.WrappedLineColumnCenter: {
        return this._moveToViewCenterColumn(viewModel, cursors, inSelectionMode);
      }
      case CursorMove.Direction.WrappedLineEnd: {
        return this._moveToViewMaxColumn(viewModel, cursors, inSelectionMode);
      }
      case CursorMove.Direction.WrappedLineLastNonWhitespaceCharacter: {
        return this._moveToViewLastNonWhitespaceColumn(viewModel, cursors, inSelectionMode);
      }
      default:
        return null;
    }
  }
  static viewportMove(viewModel, cursors, direction, inSelectionMode, value) {
    const visibleViewRange = viewModel.getCompletelyVisibleViewRange();
    const visibleModelRange = viewModel.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);
    switch (direction) {
      case CursorMove.Direction.ViewPortTop: {
        const modelLineNumber = this._firstLineNumberInRange(viewModel.model, visibleModelRange, value);
        const modelColumn = viewModel.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
        return [this._moveToModelPosition(viewModel, cursors[0], inSelectionMode, modelLineNumber, modelColumn)];
      }
      case CursorMove.Direction.ViewPortBottom: {
        const modelLineNumber = this._lastLineNumberInRange(viewModel.model, visibleModelRange, value);
        const modelColumn = viewModel.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
        return [this._moveToModelPosition(viewModel, cursors[0], inSelectionMode, modelLineNumber, modelColumn)];
      }
      case CursorMove.Direction.ViewPortCenter: {
        const modelLineNumber = Math.round((visibleModelRange.startLineNumber + visibleModelRange.endLineNumber) / 2);
        const modelColumn = viewModel.model.getLineFirstNonWhitespaceColumn(modelLineNumber);
        return [this._moveToModelPosition(viewModel, cursors[0], inSelectionMode, modelLineNumber, modelColumn)];
      }
      case CursorMove.Direction.ViewPortIfOutside: {
        const result = [];
        for (let i = 0, len = cursors.length; i < len; i++) {
          const cursor = cursors[i];
          result[i] = this.findPositionInViewportIfOutside(viewModel, cursor, visibleViewRange, inSelectionMode);
        }
        return result;
      }
      default:
        return null;
    }
  }
  static findPositionInViewportIfOutside(viewModel, cursor, visibleViewRange, inSelectionMode) {
    const viewLineNumber = cursor.viewState.position.lineNumber;
    if (visibleViewRange.startLineNumber <= viewLineNumber && viewLineNumber <= visibleViewRange.endLineNumber - 1) {
      return new CursorState(cursor.modelState, cursor.viewState);
    } else {
      let newViewLineNumber;
      if (viewLineNumber > visibleViewRange.endLineNumber - 1) {
        newViewLineNumber = visibleViewRange.endLineNumber - 1;
      } else if (viewLineNumber < visibleViewRange.startLineNumber) {
        newViewLineNumber = visibleViewRange.startLineNumber;
      } else {
        newViewLineNumber = viewLineNumber;
      }
      const position = MoveOperations.vertical(viewModel.cursorConfig, viewModel, viewLineNumber, cursor.viewState.position.column, cursor.viewState.leftoverVisibleColumns, newViewLineNumber, false);
      return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, position.lineNumber, position.column, position.leftoverVisibleColumns));
    }
  }
  /**
   * Find the nth line start included in the range (from the start).
   */
  static _firstLineNumberInRange(model, range, count) {
    let startLineNumber = range.startLineNumber;
    if (range.startColumn !== model.getLineMinColumn(startLineNumber)) {
      startLineNumber++;
    }
    return Math.min(range.endLineNumber, startLineNumber + count - 1);
  }
  /**
   * Find the nth line start included in the range (from the end).
   */
  static _lastLineNumberInRange(model, range, count) {
    let startLineNumber = range.startLineNumber;
    if (range.startColumn !== model.getLineMinColumn(startLineNumber)) {
      startLineNumber++;
    }
    return Math.max(startLineNumber, range.endLineNumber - count + 1);
  }
  static _moveLeft(viewModel, cursors, inSelectionMode, noOfColumns) {
    return cursors.map((cursor) => {
      const direction = viewModel.getTextDirection(cursor.viewState.position.lineNumber);
      const isRtl = direction === TextDirection.RTL;
      return CursorState.fromViewState(
        isRtl ? MoveOperations.moveRight(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns) : MoveOperations.moveLeft(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns)
      );
    });
  }
  static _moveHalfLineLeft(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const halfLine = Math.round(viewModel.getLineLength(viewLineNumber) / 2);
      result[i] = CursorState.fromViewState(MoveOperations.moveLeft(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, halfLine));
    }
    return result;
  }
  static _moveRight(viewModel, cursors, inSelectionMode, noOfColumns) {
    return cursors.map((cursor) => {
      const direction = viewModel.getTextDirection(cursor.viewState.position.lineNumber);
      const isRtl = direction === TextDirection.RTL;
      return CursorState.fromViewState(
        isRtl ? MoveOperations.moveLeft(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns) : MoveOperations.moveRight(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, noOfColumns)
      );
    });
  }
  static _moveHalfLineRight(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const halfLine = Math.round(viewModel.getLineLength(viewLineNumber) / 2);
      result[i] = CursorState.fromViewState(MoveOperations.moveRight(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, halfLine));
    }
    return result;
  }
  static _moveDownByViewLines(viewModel, cursors, inSelectionMode, linesCount) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromViewState(MoveOperations.moveDown(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, linesCount));
    }
    return result;
  }
  static _moveDownByModelLines(viewModel, cursors, inSelectionMode, linesCount) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromModelState(MoveOperations.moveDown(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, linesCount));
    }
    return result;
  }
  static _moveUpByViewLines(viewModel, cursors, inSelectionMode, linesCount) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromViewState(MoveOperations.moveUp(viewModel.cursorConfig, viewModel, cursor.viewState, inSelectionMode, linesCount));
    }
    return result;
  }
  static _moveUpByModelLines(viewModel, cursors, inSelectionMode, linesCount) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      result[i] = CursorState.fromModelState(MoveOperations.moveUp(viewModel.cursorConfig, viewModel.model, cursor.modelState, inSelectionMode, linesCount));
    }
    return result;
  }
  static _moveDownByFoldedLines(viewModel, cursors, inSelectionMode, count) {
    const model = viewModel.model;
    const lineCount = model.getLineCount();
    const hiddenAreas = viewModel.getHiddenAreas();
    return cursors.map((cursor) => {
      const startLine = cursor.modelState.hasSelection() && !inSelectionMode ? cursor.modelState.selection.endLineNumber : cursor.modelState.position.lineNumber;
      const targetLine = CursorMoveCommands._targetFoldedDown(startLine, count, hiddenAreas, lineCount);
      const delta = targetLine - startLine;
      if (delta === 0) {
        return CursorState.fromModelState(cursor.modelState);
      }
      return CursorState.fromModelState(MoveOperations.moveDown(viewModel.cursorConfig, model, cursor.modelState, inSelectionMode, delta));
    });
  }
  static _moveUpByFoldedLines(viewModel, cursors, inSelectionMode, count) {
    const model = viewModel.model;
    const hiddenAreas = viewModel.getHiddenAreas();
    return cursors.map((cursor) => {
      const startLine = cursor.modelState.hasSelection() && !inSelectionMode ? cursor.modelState.selection.startLineNumber : cursor.modelState.position.lineNumber;
      const targetLine = CursorMoveCommands._targetFoldedUp(startLine, count, hiddenAreas);
      const delta = startLine - targetLine;
      if (delta === 0) {
        return CursorState.fromModelState(cursor.modelState);
      }
      return CursorState.fromModelState(MoveOperations.moveUp(viewModel.cursorConfig, model, cursor.modelState, inSelectionMode, delta));
    });
  }
  // Compute the target line after moving `count` steps downward from `startLine`,
  // treating each folded region as a single step.
  static _targetFoldedDown(startLine, count, hiddenAreas, lineCount) {
    let line = startLine;
    let i = 0;
    while (i < hiddenAreas.length && hiddenAreas[i].endLineNumber < line + 1) {
      i++;
    }
    for (let step = 0; step < count; step++) {
      if (line >= lineCount) {
        return lineCount;
      }
      let candidate = line + 1;
      while (i < hiddenAreas.length && hiddenAreas[i].endLineNumber < candidate) {
        i++;
      }
      if (i < hiddenAreas.length && hiddenAreas[i].startLineNumber <= candidate) {
        candidate = hiddenAreas[i].endLineNumber + 1;
      }
      if (candidate > lineCount) {
        return line;
      }
      line = candidate;
    }
    return line;
  }
  // Compute the target line after moving `count` steps upward from `startLine`,
  // treating each folded region as a single step.
  static _targetFoldedUp(startLine, count, hiddenAreas) {
    let line = startLine;
    let i = hiddenAreas.length - 1;
    while (i >= 0 && hiddenAreas[i].startLineNumber > line - 1) {
      i--;
    }
    for (let step = 0; step < count; step++) {
      if (line <= 1) {
        return 1;
      }
      let candidate = line - 1;
      while (i >= 0 && hiddenAreas[i].startLineNumber > candidate) {
        i--;
      }
      if (i >= 0 && hiddenAreas[i].endLineNumber >= candidate) {
        candidate = hiddenAreas[i].startLineNumber - 1;
      }
      if (candidate < 1) {
        return line;
      }
      line = candidate;
    }
    return line;
  }
  static _moveToViewPosition(viewModel, cursor, inSelectionMode, toViewLineNumber, toViewColumn) {
    return CursorState.fromViewState(cursor.viewState.move(inSelectionMode, toViewLineNumber, toViewColumn, 0));
  }
  static _moveToModelPosition(viewModel, cursor, inSelectionMode, toModelLineNumber, toModelColumn) {
    return CursorState.fromModelState(cursor.modelState.move(inSelectionMode, toModelLineNumber, toModelColumn, 0));
  }
  static _moveToViewMinColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = viewModel.getLineMinColumn(viewLineNumber);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
  static _moveToViewFirstNonWhitespaceColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = viewModel.getLineFirstNonWhitespaceColumn(viewLineNumber);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
  static _moveToViewCenterColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = Math.round((viewModel.getLineMaxColumn(viewLineNumber) + viewModel.getLineMinColumn(viewLineNumber)) / 2);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
  static _moveToViewMaxColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = viewModel.getLineMaxColumn(viewLineNumber);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
  static _moveToViewLastNonWhitespaceColumn(viewModel, cursors, inSelectionMode) {
    const result = [];
    for (let i = 0, len = cursors.length; i < len; i++) {
      const cursor = cursors[i];
      const viewLineNumber = cursor.viewState.position.lineNumber;
      const viewColumn = viewModel.getLineLastNonWhitespaceColumn(viewLineNumber);
      result[i] = this._moveToViewPosition(viewModel, cursor, inSelectionMode, viewLineNumber, viewColumn);
    }
    return result;
  }
}
var CursorMove;
((CursorMove2) => {
  const isCursorMoveArgs = function(arg) {
    if (!types.isObject(arg)) {
      return false;
    }
    const cursorMoveArg = arg;
    if (!types.isString(cursorMoveArg.to)) {
      return false;
    }
    if (!types.isUndefined(cursorMoveArg.select) && !types.isBoolean(cursorMoveArg.select)) {
      return false;
    }
    if (!types.isUndefined(cursorMoveArg.by) && !types.isString(cursorMoveArg.by)) {
      return false;
    }
    if (!types.isUndefined(cursorMoveArg.value) && !types.isNumber(cursorMoveArg.value)) {
      return false;
    }
    if (!types.isUndefined(cursorMoveArg.noHistory) && !types.isBoolean(cursorMoveArg.noHistory)) {
      return false;
    }
    return true;
  };
  CursorMove2.metadata = {
    description: "Move cursor to a logical position in the view",
    args: [
      {
        name: "Cursor move argument object",
        description: `Property-value pairs that can be passed through this argument:
					* 'to': A mandatory logical position value providing where to move the cursor.
						\`\`\`
						'left', 'right', 'up', 'down', 'prevBlankLine', 'nextBlankLine',
						'wrappedLineStart', 'wrappedLineEnd', 'wrappedLineColumnCenter'
						'wrappedLineFirstNonWhitespaceCharacter', 'wrappedLineLastNonWhitespaceCharacter'
						'viewPortTop', 'viewPortCenter', 'viewPortBottom', 'viewPortIfOutside'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'character', 'halfLine', 'foldedLine'
						\`\`\`
						Use 'foldedLine' with 'up'/'down' to move by logical lines while treating each
						folded region as a single step.
					* 'value': Number of units to move. Default is '1'.
					* 'select': If 'true' makes the selection. Default is 'false'.
					* 'noHistory': If 'true' does not add the movement to navigation history. Default is 'false'.
				`,
        constraint: isCursorMoveArgs,
        schema: {
          "type": "object",
          "required": ["to"],
          "properties": {
            "to": {
              "type": "string",
              "enum": ["left", "right", "up", "down", "prevBlankLine", "nextBlankLine", "wrappedLineStart", "wrappedLineEnd", "wrappedLineColumnCenter", "wrappedLineFirstNonWhitespaceCharacter", "wrappedLineLastNonWhitespaceCharacter", "viewPortTop", "viewPortCenter", "viewPortBottom", "viewPortIfOutside"]
            },
            "by": {
              "type": "string",
              "enum": ["line", "wrappedLine", "character", "halfLine", "foldedLine"]
            },
            "value": {
              "type": "number",
              "default": 1
            },
            "select": {
              "type": "boolean",
              "default": false
            },
            "noHistory": {
              "type": "boolean",
              "default": false
            }
          }
        }
      }
    ]
  };
  CursorMove2.RawDirection = {
    Left: "left",
    Right: "right",
    Up: "up",
    Down: "down",
    PrevBlankLine: "prevBlankLine",
    NextBlankLine: "nextBlankLine",
    WrappedLineStart: "wrappedLineStart",
    WrappedLineFirstNonWhitespaceCharacter: "wrappedLineFirstNonWhitespaceCharacter",
    WrappedLineColumnCenter: "wrappedLineColumnCenter",
    WrappedLineEnd: "wrappedLineEnd",
    WrappedLineLastNonWhitespaceCharacter: "wrappedLineLastNonWhitespaceCharacter",
    ViewPortTop: "viewPortTop",
    ViewPortCenter: "viewPortCenter",
    ViewPortBottom: "viewPortBottom",
    ViewPortIfOutside: "viewPortIfOutside"
  };
  CursorMove2.RawUnit = {
    Line: "line",
    WrappedLine: "wrappedLine",
    Character: "character",
    HalfLine: "halfLine",
    FoldedLine: "foldedLine"
  };
  function parse(args) {
    if (!args.to) {
      return null;
    }
    let direction;
    switch (args.to) {
      case CursorMove2.RawDirection.Left:
        direction = 0 /* Left */;
        break;
      case CursorMove2.RawDirection.Right:
        direction = 1 /* Right */;
        break;
      case CursorMove2.RawDirection.Up:
        direction = 2 /* Up */;
        break;
      case CursorMove2.RawDirection.Down:
        direction = 3 /* Down */;
        break;
      case CursorMove2.RawDirection.PrevBlankLine:
        direction = 4 /* PrevBlankLine */;
        break;
      case CursorMove2.RawDirection.NextBlankLine:
        direction = 5 /* NextBlankLine */;
        break;
      case CursorMove2.RawDirection.WrappedLineStart:
        direction = 6 /* WrappedLineStart */;
        break;
      case CursorMove2.RawDirection.WrappedLineFirstNonWhitespaceCharacter:
        direction = 7 /* WrappedLineFirstNonWhitespaceCharacter */;
        break;
      case CursorMove2.RawDirection.WrappedLineColumnCenter:
        direction = 8 /* WrappedLineColumnCenter */;
        break;
      case CursorMove2.RawDirection.WrappedLineEnd:
        direction = 9 /* WrappedLineEnd */;
        break;
      case CursorMove2.RawDirection.WrappedLineLastNonWhitespaceCharacter:
        direction = 10 /* WrappedLineLastNonWhitespaceCharacter */;
        break;
      case CursorMove2.RawDirection.ViewPortTop:
        direction = 11 /* ViewPortTop */;
        break;
      case CursorMove2.RawDirection.ViewPortBottom:
        direction = 13 /* ViewPortBottom */;
        break;
      case CursorMove2.RawDirection.ViewPortCenter:
        direction = 12 /* ViewPortCenter */;
        break;
      case CursorMove2.RawDirection.ViewPortIfOutside:
        direction = 14 /* ViewPortIfOutside */;
        break;
      default:
        return null;
    }
    let unit = 0 /* None */;
    switch (args.by) {
      case CursorMove2.RawUnit.Line:
        unit = 1 /* Line */;
        break;
      case CursorMove2.RawUnit.WrappedLine:
        unit = 2 /* WrappedLine */;
        break;
      case CursorMove2.RawUnit.Character:
        unit = 3 /* Character */;
        break;
      case CursorMove2.RawUnit.HalfLine:
        unit = 4 /* HalfLine */;
        break;
      case CursorMove2.RawUnit.FoldedLine:
        unit = 5 /* FoldedLine */;
        break;
    }
    return {
      direction,
      unit,
      select: !!args.select,
      value: args.value || 1,
      noHistory: !!args.noHistory
    };
  }
  CursorMove2.parse = parse;
  let Direction;
  ((Direction2) => {
    Direction2[Direction2["Left"] = 0] = "Left";
    Direction2[Direction2["Right"] = 1] = "Right";
    Direction2[Direction2["Up"] = 2] = "Up";
    Direction2[Direction2["Down"] = 3] = "Down";
    Direction2[Direction2["PrevBlankLine"] = 4] = "PrevBlankLine";
    Direction2[Direction2["NextBlankLine"] = 5] = "NextBlankLine";
    Direction2[Direction2["WrappedLineStart"] = 6] = "WrappedLineStart";
    Direction2[Direction2["WrappedLineFirstNonWhitespaceCharacter"] = 7] = "WrappedLineFirstNonWhitespaceCharacter";
    Direction2[Direction2["WrappedLineColumnCenter"] = 8] = "WrappedLineColumnCenter";
    Direction2[Direction2["WrappedLineEnd"] = 9] = "WrappedLineEnd";
    Direction2[Direction2["WrappedLineLastNonWhitespaceCharacter"] = 10] = "WrappedLineLastNonWhitespaceCharacter";
    Direction2[Direction2["ViewPortTop"] = 11] = "ViewPortTop";
    Direction2[Direction2["ViewPortCenter"] = 12] = "ViewPortCenter";
    Direction2[Direction2["ViewPortBottom"] = 13] = "ViewPortBottom";
    Direction2[Direction2["ViewPortIfOutside"] = 14] = "ViewPortIfOutside";
  })(Direction = CursorMove2.Direction || (CursorMove2.Direction = {}));
  let Unit;
  ((Unit2) => {
    Unit2[Unit2["None"] = 0] = "None";
    Unit2[Unit2["Line"] = 1] = "Line";
    Unit2[Unit2["WrappedLine"] = 2] = "WrappedLine";
    Unit2[Unit2["Character"] = 3] = "Character";
    Unit2[Unit2["HalfLine"] = 4] = "HalfLine";
    Unit2[Unit2["FoldedLine"] = 5] = "FoldedLine";
  })(Unit = CursorMove2.Unit || (CursorMove2.Unit = {}));
})(CursorMove || (CursorMove = {}));
export {
  CursorMove,
  CursorMoveCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY3Vyc29yL2N1cnNvck1vdmVDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEN1cnNvclN0YXRlLCBJQ3Vyc29yU2ltcGxlTW9kZWwsIFBhcnRpYWxDdXJzb3JTdGF0ZSwgU2VsZWN0aW9uU3RhcnRLaW5kLCBTaW5nbGVDdXJzb3JTdGF0ZSB9IGZyb20gJy4uL2N1cnNvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBNb3ZlT3BlcmF0aW9ucyB9IGZyb20gJy4vY3Vyc29yTW92ZU9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgV29yZE9wZXJhdGlvbnMgfSBmcm9tICcuL2N1cnNvcldvcmRPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElWaWV3TW9kZWwgfSBmcm9tICcuLi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dERpcmVjdGlvbiB9IGZyb20gJy4uL21vZGVsLmpzJztcblxuZXhwb3J0IGNsYXNzIEN1cnNvck1vdmVDb21tYW5kcyB7XG5cblx0cHVibGljIHN0YXRpYyBhZGRDdXJzb3JEb3duKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgdXNlTG9naWNhbExpbmU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBDdXJzb3JTdGF0ZShjdXJzb3IubW9kZWxTdGF0ZSwgY3Vyc29yLnZpZXdTdGF0ZSk7XG5cdFx0XHRpZiAodXNlTG9naWNhbExpbmUpIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKE1vdmVPcGVyYXRpb25zLnRyYW5zbGF0ZURvd24odmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoTW92ZU9wZXJhdGlvbnMudHJhbnNsYXRlRG93bih2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgYWRkQ3Vyc29yVXAodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCB1c2VMb2dpY2FsTGluZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gbmV3IEN1cnNvclN0YXRlKGN1cnNvci5tb2RlbFN0YXRlLCBjdXJzb3Iudmlld1N0YXRlKTtcblx0XHRcdGlmICh1c2VMb2dpY2FsTGluZSkge1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoTW92ZU9wZXJhdGlvbnMudHJhbnNsYXRlVXAodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoTW92ZU9wZXJhdGlvbnMudHJhbnNsYXRlVXAodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBjdXJzb3Iudmlld1N0YXRlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG1vdmVUb0JlZ2lubmluZ09mTGluZSh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRyZXN1bHRbaV0gPSB0aGlzLl9tb3ZlVG9MaW5lU3RhcnQodmlld01vZGVsLCBjdXJzb3IsIGluU2VsZWN0aW9uTW9kZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVG9MaW5lU3RhcnQodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdGNvbnN0IGN1cnJlbnRWaWV3U3RhdGVDb2x1bW4gPSBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmNvbHVtbjtcblx0XHRjb25zdCBjdXJyZW50TW9kZWxTdGF0ZUNvbHVtbiA9IGN1cnNvci5tb2RlbFN0YXRlLnBvc2l0aW9uLmNvbHVtbjtcblx0XHRjb25zdCBpc0ZpcnN0TGluZU9mV3JhcHBlZExpbmUgPSBjdXJyZW50Vmlld1N0YXRlQ29sdW1uID09PSBjdXJyZW50TW9kZWxTdGF0ZUNvbHVtbjtcblxuXHRcdGNvbnN0IGN1cnJlbnRWaWV3U3RhdGVsaW5lTnVtYmVyID0gY3Vyc29yLnZpZXdTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGZpcnN0Tm9uQmxhbmtDb2x1bW4gPSB2aWV3TW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihjdXJyZW50Vmlld1N0YXRlbGluZU51bWJlcik7XG5cdFx0Y29uc3QgaXNCZWdpbm5pbmdPZlZpZXdMaW5lID0gY3VycmVudFZpZXdTdGF0ZUNvbHVtbiA9PT0gZmlyc3ROb25CbGFua0NvbHVtbjtcblxuXHRcdGlmICghaXNGaXJzdExpbmVPZldyYXBwZWRMaW5lICYmICFpc0JlZ2lubmluZ09mVmlld0xpbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVG9MaW5lU3RhcnRCeVZpZXcodmlld01vZGVsLCBjdXJzb3IsIGluU2VsZWN0aW9uTW9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVG9MaW5lU3RhcnRCeU1vZGVsKHZpZXdNb2RlbCwgY3Vyc29yLCBpblNlbGVjdGlvbk1vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVG9MaW5lU3RhcnRCeVZpZXcodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKFxuXHRcdFx0TW92ZU9wZXJhdGlvbnMubW92ZVRvQmVnaW5uaW5nT2ZMaW5lKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlKVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVRvTGluZVN0YXJ0QnlNb2RlbCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcjogQ3Vyc29yU3RhdGUsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZSB7XG5cdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKFxuXHRcdFx0TW92ZU9wZXJhdGlvbnMubW92ZVRvQmVnaW5uaW5nT2ZMaW5lKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgY3Vyc29yLm1vZGVsU3RhdGUsIGluU2VsZWN0aW9uTW9kZSlcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBtb3ZlVG9FbmRPZkxpbmUodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIHN0aWNreTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRyZXN1bHRbaV0gPSB0aGlzLl9tb3ZlVG9MaW5lRW5kKHZpZXdNb2RlbCwgY3Vyc29yLCBpblNlbGVjdGlvbk1vZGUsIHN0aWNreSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVG9MaW5lRW5kKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yOiBDdXJzb3JTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBzdGlja3k6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdGNvbnN0IHZpZXdTdGF0ZVBvc2l0aW9uID0gY3Vyc29yLnZpZXdTdGF0ZS5wb3NpdGlvbjtcblx0XHRjb25zdCB2aWV3TW9kZWxNYXhDb2x1bW4gPSB2aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbih2aWV3U3RhdGVQb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBpc0VuZE9mVmlld0xpbmUgPSB2aWV3U3RhdGVQb3NpdGlvbi5jb2x1bW4gPT09IHZpZXdNb2RlbE1heENvbHVtbjtcblxuXHRcdGNvbnN0IG1vZGVsU3RhdGVQb3NpdGlvbiA9IGN1cnNvci5tb2RlbFN0YXRlLnBvc2l0aW9uO1xuXHRcdGNvbnN0IG1vZGVsTWF4Q29sdW1uID0gdmlld01vZGVsLm1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWxTdGF0ZVBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGlzRW5kTGluZU9mV3JhcHBlZExpbmUgPSB2aWV3TW9kZWxNYXhDb2x1bW4gLSB2aWV3U3RhdGVQb3NpdGlvbi5jb2x1bW4gPT09IG1vZGVsTWF4Q29sdW1uIC0gbW9kZWxTdGF0ZVBvc2l0aW9uLmNvbHVtbjtcblxuXHRcdGlmIChpc0VuZE9mVmlld0xpbmUgfHwgaXNFbmRMaW5lT2ZXcmFwcGVkTGluZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vdmVUb0xpbmVFbmRCeU1vZGVsKHZpZXdNb2RlbCwgY3Vyc29yLCBpblNlbGVjdGlvbk1vZGUsIHN0aWNreSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVG9MaW5lRW5kQnlWaWV3KHZpZXdNb2RlbCwgY3Vyc29yLCBpblNlbGVjdGlvbk1vZGUsIHN0aWNreSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVUb0xpbmVFbmRCeVZpZXcodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIHN0aWNreTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZSB7XG5cdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoXG5cdFx0XHRNb3ZlT3BlcmF0aW9ucy5tb3ZlVG9FbmRPZkxpbmUodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBjdXJzb3Iudmlld1N0YXRlLCBpblNlbGVjdGlvbk1vZGUsIHN0aWNreSlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVUb0xpbmVFbmRCeU1vZGVsKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yOiBDdXJzb3JTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBzdGlja3k6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShcblx0XHRcdE1vdmVPcGVyYXRpb25zLm1vdmVUb0VuZE9mTGluZSh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwubW9kZWwsIGN1cnNvci5tb2RlbFN0YXRlLCBpblNlbGVjdGlvbk1vZGUsIHN0aWNreSlcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBleHBhbmRMaW5lU2VsZWN0aW9uKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSk6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IGN1cnNvci5tb2RlbFN0YXRlLnNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBsaW5lQ291bnQgPSB2aWV3TW9kZWwubW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cblx0XHRcdGxldCBlbmRMaW5lTnVtYmVyID0gY3Vyc29yLm1vZGVsU3RhdGUuc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRsZXQgZW5kQ29sdW1uOiBudW1iZXI7XG5cdFx0XHRpZiAoZW5kTGluZU51bWJlciA9PT0gbGluZUNvdW50KSB7XG5cdFx0XHRcdGVuZENvbHVtbiA9IHZpZXdNb2RlbC5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVDb3VudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbmRMaW5lTnVtYmVyKys7XG5cdFx0XHRcdGVuZENvbHVtbiA9IDE7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdFtpXSA9IEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKG5ldyBTaW5nbGVDdXJzb3JTdGF0ZShcblx0XHRcdFx0bmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgMSwgc3RhcnRMaW5lTnVtYmVyLCAxKSwgU2VsZWN0aW9uU3RhcnRLaW5kLlNpbXBsZSwgMCxcblx0XHRcdFx0bmV3IFBvc2l0aW9uKGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksIDBcblx0XHRcdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBtb3ZlVG9CZWdpbm5pbmdPZkJ1ZmZlcih2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRyZXN1bHRbaV0gPSBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShNb3ZlT3BlcmF0aW9ucy5tb3ZlVG9CZWdpbm5pbmdPZkJ1ZmZlcih2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwubW9kZWwsIGN1cnNvci5tb2RlbFN0YXRlLCBpblNlbGVjdGlvbk1vZGUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbW92ZVRvRW5kT2ZCdWZmZXIodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0cmVzdWx0W2ldID0gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZVRvRW5kT2ZCdWZmZXIodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNlbGVjdEFsbCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcjogQ3Vyc29yU3RhdGUpOiBQYXJ0aWFsQ3Vyc29yU3RhdGUge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHZpZXdNb2RlbC5tb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBtYXhDb2x1bW4gPSB2aWV3TW9kZWwubW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpO1xuXG5cdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKG5ldyBTaW5nbGVDdXJzb3JTdGF0ZShcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgU2VsZWN0aW9uU3RhcnRLaW5kLlNpbXBsZSwgMCxcblx0XHRcdG5ldyBQb3NpdGlvbihsaW5lQ291bnQsIG1heENvbHVtbiksIDBcblx0XHQpKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbGluZSh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcjogQ3Vyc29yU3RhdGUsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgX3Bvc2l0aW9uOiBJUG9zaXRpb24sIF92aWV3UG9zaXRpb246IElQb3NpdGlvbiB8IHVuZGVmaW5lZCk6IFBhcnRpYWxDdXJzb3JTdGF0ZSB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB2aWV3TW9kZWwubW9kZWwudmFsaWRhdGVQb3NpdGlvbihfcG9zaXRpb24pO1xuXHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IChcblx0XHRcdF92aWV3UG9zaXRpb25cblx0XHRcdFx0PyB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIudmFsaWRhdGVWaWV3UG9zaXRpb24obmV3IFBvc2l0aW9uKF92aWV3UG9zaXRpb24ubGluZU51bWJlciwgX3ZpZXdQb3NpdGlvbi5jb2x1bW4pLCBwb3NpdGlvbilcblx0XHRcdFx0OiB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihwb3NpdGlvbilcblx0XHQpO1xuXG5cdFx0aWYgKCFpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRcdC8vIEVudGVyaW5nIGxpbmUgc2VsZWN0aW9uIGZvciB0aGUgZmlyc3QgdGltZVxuXHRcdFx0Y29uc3QgbGluZUNvdW50ID0gdmlld01vZGVsLm1vZGVsLmdldExpbmVDb3VudCgpO1xuXG5cdFx0XHRsZXQgc2VsZWN0VG9MaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlciArIDE7XG5cdFx0XHRsZXQgc2VsZWN0VG9Db2x1bW4gPSAxO1xuXHRcdFx0aWYgKHNlbGVjdFRvTGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0XHRzZWxlY3RUb0xpbmVOdW1iZXIgPSBsaW5lQ291bnQ7XG5cdFx0XHRcdHNlbGVjdFRvQ29sdW1uID0gdmlld01vZGVsLm1vZGVsLmdldExpbmVNYXhDb2x1bW4oc2VsZWN0VG9MaW5lTnVtYmVyKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKG5ldyBTaW5nbGVDdXJzb3JTdGF0ZShcblx0XHRcdFx0bmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIDEsIHNlbGVjdFRvTGluZU51bWJlciwgc2VsZWN0VG9Db2x1bW4pLCBTZWxlY3Rpb25TdGFydEtpbmQuTGluZSwgMCxcblx0XHRcdFx0bmV3IFBvc2l0aW9uKHNlbGVjdFRvTGluZU51bWJlciwgc2VsZWN0VG9Db2x1bW4pLCAwXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHQvLyBDb250aW51aW5nIGxpbmUgc2VsZWN0aW9uXG5cdFx0Y29uc3QgZW50ZXJpbmdMaW5lTnVtYmVyID0gY3Vyc29yLm1vZGVsU3RhdGUuc2VsZWN0aW9uU3RhcnQuZ2V0U3RhcnRQb3NpdGlvbigpLmxpbmVOdW1iZXI7XG5cblx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA8IGVudGVyaW5nTGluZU51bWJlcikge1xuXG5cdFx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbVZpZXdTdGF0ZShjdXJzb3Iudmlld1N0YXRlLm1vdmUoXG5cdFx0XHRcdHRydWUsIHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLCAxLCAwXG5cdFx0XHQpKTtcblxuXHRcdH0gZWxzZSBpZiAocG9zaXRpb24ubGluZU51bWJlciA+IGVudGVyaW5nTGluZU51bWJlcikge1xuXG5cdFx0XHRjb25zdCBsaW5lQ291bnQgPSB2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cblx0XHRcdGxldCBzZWxlY3RUb1ZpZXdMaW5lTnVtYmVyID0gdmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIgKyAxO1xuXHRcdFx0bGV0IHNlbGVjdFRvVmlld0NvbHVtbiA9IDE7XG5cdFx0XHRpZiAoc2VsZWN0VG9WaWV3TGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0XHRzZWxlY3RUb1ZpZXdMaW5lTnVtYmVyID0gbGluZUNvdW50O1xuXHRcdFx0XHRzZWxlY3RUb1ZpZXdDb2x1bW4gPSB2aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihzZWxlY3RUb1ZpZXdMaW5lTnVtYmVyKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoY3Vyc29yLnZpZXdTdGF0ZS5tb3ZlKFxuXHRcdFx0XHR0cnVlLCBzZWxlY3RUb1ZpZXdMaW5lTnVtYmVyLCBzZWxlY3RUb1ZpZXdDb2x1bW4sIDBcblx0XHRcdCkpO1xuXG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0Y29uc3QgZW5kUG9zaXRpb25PZlNlbGVjdGlvblN0YXJ0ID0gY3Vyc29yLm1vZGVsU3RhdGUuc2VsZWN0aW9uU3RhcnQuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShjdXJzb3IubW9kZWxTdGF0ZS5tb3ZlKFxuXHRcdFx0XHR0cnVlLCBlbmRQb3NpdGlvbk9mU2VsZWN0aW9uU3RhcnQubGluZU51bWJlciwgZW5kUG9zaXRpb25PZlNlbGVjdGlvblN0YXJ0LmNvbHVtbiwgMFxuXHRcdFx0KSk7XG5cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHdvcmQodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIF9wb3NpdGlvbjogSVBvc2l0aW9uKTogUGFydGlhbEN1cnNvclN0YXRlIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHZpZXdNb2RlbC5tb2RlbC52YWxpZGF0ZVBvc2l0aW9uKF9wb3NpdGlvbik7XG5cdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKFdvcmRPcGVyYXRpb25zLndvcmQodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBwb3NpdGlvbikpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjYW5jZWxTZWxlY3Rpb24odmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlKTogUGFydGlhbEN1cnNvclN0YXRlIHtcblx0XHRpZiAoIWN1cnNvci5tb2RlbFN0YXRlLmhhc1NlbGVjdGlvbigpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IEN1cnNvclN0YXRlKGN1cnNvci5tb2RlbFN0YXRlLCBjdXJzb3Iudmlld1N0YXRlKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gY3Vyc29yLnZpZXdTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGNvbHVtbiA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24uY29sdW1uO1xuXG5cdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUobmV3IFNpbmdsZUN1cnNvclN0YXRlKFxuXHRcdFx0bmV3IFJhbmdlKGxpbmVOdW1iZXIsIGNvbHVtbiwgbGluZU51bWJlciwgY29sdW1uKSwgU2VsZWN0aW9uU3RhcnRLaW5kLlNpbXBsZSwgMCxcblx0XHRcdG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pLCAwXG5cdFx0KSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG1vdmVUbyh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcjogQ3Vyc29yU3RhdGUsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgX3Bvc2l0aW9uOiBJUG9zaXRpb24sIF92aWV3UG9zaXRpb246IElQb3NpdGlvbiB8IHVuZGVmaW5lZCk6IFBhcnRpYWxDdXJzb3JTdGF0ZSB7XG5cdFx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdFx0aWYgKGN1cnNvci5tb2RlbFN0YXRlLnNlbGVjdGlvblN0YXJ0S2luZCA9PT0gU2VsZWN0aW9uU3RhcnRLaW5kLldvcmQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMud29yZCh2aWV3TW9kZWwsIGN1cnNvciwgaW5TZWxlY3Rpb25Nb2RlLCBfcG9zaXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnNvci5tb2RlbFN0YXRlLnNlbGVjdGlvblN0YXJ0S2luZCA9PT0gU2VsZWN0aW9uU3RhcnRLaW5kLkxpbmUpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMubGluZSh2aWV3TW9kZWwsIGN1cnNvciwgaW5TZWxlY3Rpb25Nb2RlLCBfcG9zaXRpb24sIF92aWV3UG9zaXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBwb3NpdGlvbiA9IHZpZXdNb2RlbC5tb2RlbC52YWxpZGF0ZVBvc2l0aW9uKF9wb3NpdGlvbik7XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gKFxuXHRcdFx0X3ZpZXdQb3NpdGlvblxuXHRcdFx0XHQ/IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci52YWxpZGF0ZVZpZXdQb3NpdGlvbihuZXcgUG9zaXRpb24oX3ZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLCBfdmlld1Bvc2l0aW9uLmNvbHVtbiksIHBvc2l0aW9uKVxuXHRcdFx0XHQ6IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKHBvc2l0aW9uKVxuXHRcdCk7XG5cdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoY3Vyc29yLnZpZXdTdGF0ZS5tb3ZlKGluU2VsZWN0aW9uTW9kZSwgdmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIsIHZpZXdQb3NpdGlvbi5jb2x1bW4sIDApKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2ltcGxlTW92ZSh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGRpcmVjdGlvbjogQ3Vyc29yTW92ZS5TaW1wbGVNb3ZlRGlyZWN0aW9uLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIHZhbHVlOiBudW1iZXIsIHVuaXQ6IEN1cnNvck1vdmUuVW5pdCk6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHwgbnVsbCB7XG5cdFx0c3dpdGNoIChkaXJlY3Rpb24pIHtcblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uTGVmdDoge1xuXHRcdFx0XHRpZiAodW5pdCA9PT0gQ3Vyc29yTW92ZS5Vbml0LkhhbGZMaW5lKSB7XG5cdFx0XHRcdFx0Ly8gTW92ZSBsZWZ0IGJ5IGhhbGYgdGhlIGN1cnJlbnQgbGluZSBsZW5ndGhcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZUhhbGZMaW5lTGVmdCh2aWV3TW9kZWwsIGN1cnNvcnMsIGluU2VsZWN0aW9uTW9kZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gTW92ZSBsZWZ0IGJ5IGBtb3ZlUGFyYW1zLnZhbHVlYCBjb2x1bW5zXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmVMZWZ0KHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlLCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uUmlnaHQ6IHtcblx0XHRcdFx0aWYgKHVuaXQgPT09IEN1cnNvck1vdmUuVW5pdC5IYWxmTGluZSkge1xuXHRcdFx0XHRcdC8vIE1vdmUgcmlnaHQgYnkgaGFsZiB0aGUgY3VycmVudCBsaW5lIGxlbmd0aFxuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlSGFsZkxpbmVSaWdodCh2aWV3TW9kZWwsIGN1cnNvcnMsIGluU2VsZWN0aW9uTW9kZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gTW92ZSByaWdodCBieSBgbW92ZVBhcmFtcy52YWx1ZWAgY29sdW1uc1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlUmlnaHQodmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUsIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDdXJzb3JNb3ZlLkRpcmVjdGlvbi5VcDoge1xuXHRcdFx0XHRpZiAodW5pdCA9PT0gQ3Vyc29yTW92ZS5Vbml0LldyYXBwZWRMaW5lKSB7XG5cdFx0XHRcdFx0Ly8gTW92ZSB1cCBieSB2aWV3IGxpbmVzXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmVVcEJ5Vmlld0xpbmVzKHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlLCB2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodW5pdCA9PT0gQ3Vyc29yTW92ZS5Vbml0LkZvbGRlZExpbmUpIHtcblx0XHRcdFx0XHQvLyBNb3ZlIHVwIGJ5IG1vZGVsIGxpbmVzLCBza2lwcGluZyBvdmVyIGZvbGRlZCByZWdpb25zXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmVVcEJ5Rm9sZGVkTGluZXModmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUsIHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBNb3ZlIHVwIGJ5IG1vZGVsIGxpbmVzXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmVVcEJ5TW9kZWxMaW5lcyh2aWV3TW9kZWwsIGN1cnNvcnMsIGluU2VsZWN0aW9uTW9kZSwgdmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLkRvd246IHtcblx0XHRcdFx0aWYgKHVuaXQgPT09IEN1cnNvck1vdmUuVW5pdC5XcmFwcGVkTGluZSkge1xuXHRcdFx0XHRcdC8vIE1vdmUgZG93biBieSB2aWV3IGxpbmVzXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmVEb3duQnlWaWV3TGluZXModmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUsIHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh1bml0ID09PSBDdXJzb3JNb3ZlLlVuaXQuRm9sZGVkTGluZSkge1xuXHRcdFx0XHRcdC8vIE1vdmUgZG93biBieSBtb2RlbCBsaW5lcywgc2tpcHBpbmcgb3ZlciBmb2xkZWQgcmVnaW9uc1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlRG93bkJ5Rm9sZGVkTGluZXModmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUsIHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBNb3ZlIGRvd24gYnkgbW9kZWwgbGluZXNcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZURvd25CeU1vZGVsTGluZXModmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUsIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDdXJzb3JNb3ZlLkRpcmVjdGlvbi5QcmV2QmxhbmtMaW5lOiB7XG5cdFx0XHRcdGlmICh1bml0ID09PSBDdXJzb3JNb3ZlLlVuaXQuV3JhcHBlZExpbmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gY3Vyc29ycy5tYXAoY3Vyc29yID0+IEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZVRvUHJldkJsYW5rTGluZSh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUsIGluU2VsZWN0aW9uTW9kZSkpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gY3Vyc29ycy5tYXAoY3Vyc29yID0+IEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVUb1ByZXZCbGFua0xpbmUodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCBjdXJzb3IubW9kZWxTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLk5leHRCbGFua0xpbmU6IHtcblx0XHRcdFx0aWYgKHVuaXQgPT09IEN1cnNvck1vdmUuVW5pdC5XcmFwcGVkTGluZSkge1xuXHRcdFx0XHRcdHJldHVybiBjdXJzb3JzLm1hcChjdXJzb3IgPT4gQ3Vyc29yU3RhdGUuZnJvbVZpZXdTdGF0ZShNb3ZlT3BlcmF0aW9ucy5tb3ZlVG9OZXh0QmxhbmtMaW5lKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlKSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBjdXJzb3JzLm1hcChjdXJzb3IgPT4gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZVRvTmV4dEJsYW5rTGluZSh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwubW9kZWwsIGN1cnNvci5tb2RlbFN0YXRlLCBpblNlbGVjdGlvbk1vZGUpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uV3JhcHBlZExpbmVTdGFydDoge1xuXHRcdFx0XHQvLyBNb3ZlIHRvIHRoZSBiZWdpbm5pbmcgb2YgdGhlIGN1cnJlbnQgdmlldyBsaW5lXG5cdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVG9WaWV3TWluQ29sdW1uKHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uV3JhcHBlZExpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXI6IHtcblx0XHRcdFx0Ly8gTW92ZSB0byB0aGUgZmlyc3Qgbm9uLXdoaXRlc3BhY2UgY29sdW1uIG9mIHRoZSBjdXJyZW50IHZpZXcgbGluZVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvVmlld0ZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbih2aWV3TW9kZWwsIGN1cnNvcnMsIGluU2VsZWN0aW9uTW9kZSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLldyYXBwZWRMaW5lQ29sdW1uQ2VudGVyOiB7XG5cdFx0XHRcdC8vIE1vdmUgdG8gdGhlIFwiY2VudGVyXCIgb2YgdGhlIGN1cnJlbnQgdmlldyBsaW5lXG5cdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVG9WaWV3Q2VudGVyQ29sdW1uKHZpZXdNb2RlbCwgY3Vyc29ycywgaW5TZWxlY3Rpb25Nb2RlKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uV3JhcHBlZExpbmVFbmQ6IHtcblx0XHRcdFx0Ly8gTW92ZSB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IHZpZXcgbGluZVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvVmlld01heENvbHVtbih2aWV3TW9kZWwsIGN1cnNvcnMsIGluU2VsZWN0aW9uTW9kZSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLldyYXBwZWRMaW5lTGFzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXI6IHtcblx0XHRcdFx0Ly8gTW92ZSB0byB0aGUgbGFzdCBub24td2hpdGVzcGFjZSBjb2x1bW4gb2YgdGhlIGN1cnJlbnQgdmlldyBsaW5lXG5cdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlVG9WaWV3TGFzdE5vbldoaXRlc3BhY2VDb2x1bW4odmlld01vZGVsLCBjdXJzb3JzLCBpblNlbGVjdGlvbk1vZGUpO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHZpZXdwb3J0TW92ZSh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGRpcmVjdGlvbjogQ3Vyc29yTW92ZS5WaWV3cG9ydERpcmVjdGlvbiwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCB2YWx1ZTogbnVtYmVyKTogUGFydGlhbEN1cnNvclN0YXRlW10gfCBudWxsIHtcblx0XHRjb25zdCB2aXNpYmxlVmlld1JhbmdlID0gdmlld01vZGVsLmdldENvbXBsZXRlbHlWaXNpYmxlVmlld1JhbmdlKCk7XG5cdFx0Y29uc3QgdmlzaWJsZU1vZGVsUmFuZ2UgPSB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdSYW5nZVRvTW9kZWxSYW5nZSh2aXNpYmxlVmlld1JhbmdlKTtcblx0XHRzd2l0Y2ggKGRpcmVjdGlvbikge1xuXHRcdFx0Y2FzZSBDdXJzb3JNb3ZlLkRpcmVjdGlvbi5WaWV3UG9ydFRvcDoge1xuXHRcdFx0XHQvLyBNb3ZlIHRvIHRoZSBudGggbGluZSBzdGFydCBpbiB0aGUgdmlld3BvcnQgKGZyb20gdGhlIHRvcClcblx0XHRcdFx0Y29uc3QgbW9kZWxMaW5lTnVtYmVyID0gdGhpcy5fZmlyc3RMaW5lTnVtYmVySW5SYW5nZSh2aWV3TW9kZWwubW9kZWwsIHZpc2libGVNb2RlbFJhbmdlLCB2YWx1ZSk7XG5cdFx0XHRcdGNvbnN0IG1vZGVsQ29sdW1uID0gdmlld01vZGVsLm1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4obW9kZWxMaW5lTnVtYmVyKTtcblx0XHRcdFx0cmV0dXJuIFt0aGlzLl9tb3ZlVG9Nb2RlbFBvc2l0aW9uKHZpZXdNb2RlbCwgY3Vyc29yc1swXSwgaW5TZWxlY3Rpb25Nb2RlLCBtb2RlbExpbmVOdW1iZXIsIG1vZGVsQ29sdW1uKV07XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEN1cnNvck1vdmUuRGlyZWN0aW9uLlZpZXdQb3J0Qm90dG9tOiB7XG5cdFx0XHRcdC8vIE1vdmUgdG8gdGhlIG50aCBsaW5lIHN0YXJ0IGluIHRoZSB2aWV3cG9ydCAoZnJvbSB0aGUgYm90dG9tKVxuXHRcdFx0XHRjb25zdCBtb2RlbExpbmVOdW1iZXIgPSB0aGlzLl9sYXN0TGluZU51bWJlckluUmFuZ2Uodmlld01vZGVsLm1vZGVsLCB2aXNpYmxlTW9kZWxSYW5nZSwgdmFsdWUpO1xuXHRcdFx0XHRjb25zdCBtb2RlbENvbHVtbiA9IHZpZXdNb2RlbC5tb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKG1vZGVsTGluZU51bWJlcik7XG5cdFx0XHRcdHJldHVybiBbdGhpcy5fbW92ZVRvTW9kZWxQb3NpdGlvbih2aWV3TW9kZWwsIGN1cnNvcnNbMF0sIGluU2VsZWN0aW9uTW9kZSwgbW9kZWxMaW5lTnVtYmVyLCBtb2RlbENvbHVtbildO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDdXJzb3JNb3ZlLkRpcmVjdGlvbi5WaWV3UG9ydENlbnRlcjoge1xuXHRcdFx0XHQvLyBNb3ZlIHRvIHRoZSBsaW5lIHN0YXJ0IGluIHRoZSB2aWV3cG9ydCBjZW50ZXJcblx0XHRcdFx0Y29uc3QgbW9kZWxMaW5lTnVtYmVyID0gTWF0aC5yb3VuZCgodmlzaWJsZU1vZGVsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgdmlzaWJsZU1vZGVsUmFuZ2UuZW5kTGluZU51bWJlcikgLyAyKTtcblx0XHRcdFx0Y29uc3QgbW9kZWxDb2x1bW4gPSB2aWV3TW9kZWwubW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihtb2RlbExpbmVOdW1iZXIpO1xuXHRcdFx0XHRyZXR1cm4gW3RoaXMuX21vdmVUb01vZGVsUG9zaXRpb24odmlld01vZGVsLCBjdXJzb3JzWzBdLCBpblNlbGVjdGlvbk1vZGUsIG1vZGVsTGluZU51bWJlciwgbW9kZWxDb2x1bW4pXTtcblx0XHRcdH1cblx0XHRcdGNhc2UgQ3Vyc29yTW92ZS5EaXJlY3Rpb24uVmlld1BvcnRJZk91dHNpZGU6IHtcblx0XHRcdFx0Ly8gTW92ZSB0byBhIHBvc2l0aW9uIGluc2lkZSB0aGUgdmlld3BvcnRcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY3Vyc29ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRcdFx0cmVzdWx0W2ldID0gdGhpcy5maW5kUG9zaXRpb25JblZpZXdwb3J0SWZPdXRzaWRlKHZpZXdNb2RlbCwgY3Vyc29yLCB2aXNpYmxlVmlld1JhbmdlLCBpblNlbGVjdGlvbk1vZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGZpbmRQb3NpdGlvbkluVmlld3BvcnRJZk91dHNpZGUodmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3I6IEN1cnNvclN0YXRlLCB2aXNpYmxlVmlld1JhbmdlOiBSYW5nZSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuKTogUGFydGlhbEN1cnNvclN0YXRlIHtcblx0XHRjb25zdCB2aWV3TGluZU51bWJlciA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblxuXHRcdGlmICh2aXNpYmxlVmlld1JhbmdlLnN0YXJ0TGluZU51bWJlciA8PSB2aWV3TGluZU51bWJlciAmJiB2aWV3TGluZU51bWJlciA8PSB2aXNpYmxlVmlld1JhbmdlLmVuZExpbmVOdW1iZXIgLSAxKSB7XG5cdFx0XHQvLyBOb3RoaW5nIHRvIGRvLCBjdXJzb3IgaXMgaW4gdmlld3BvcnRcblx0XHRcdHJldHVybiBuZXcgQ3Vyc29yU3RhdGUoY3Vyc29yLm1vZGVsU3RhdGUsIGN1cnNvci52aWV3U3RhdGUpO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBuZXdWaWV3TGluZU51bWJlcjogbnVtYmVyO1xuXHRcdFx0aWYgKHZpZXdMaW5lTnVtYmVyID4gdmlzaWJsZVZpZXdSYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSkge1xuXHRcdFx0XHRuZXdWaWV3TGluZU51bWJlciA9IHZpc2libGVWaWV3UmFuZ2UuZW5kTGluZU51bWJlciAtIDE7XG5cdFx0XHR9IGVsc2UgaWYgKHZpZXdMaW5lTnVtYmVyIDwgdmlzaWJsZVZpZXdSYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0bmV3Vmlld0xpbmVOdW1iZXIgPSB2aXNpYmxlVmlld1JhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5ld1ZpZXdMaW5lTnVtYmVyID0gdmlld0xpbmVOdW1iZXI7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IE1vdmVPcGVyYXRpb25zLnZlcnRpY2FsKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgdmlld0xpbmVOdW1iZXIsIGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24uY29sdW1uLCBjdXJzb3Iudmlld1N0YXRlLmxlZnRvdmVyVmlzaWJsZUNvbHVtbnMsIG5ld1ZpZXdMaW5lTnVtYmVyLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbVZpZXdTdGF0ZShjdXJzb3Iudmlld1N0YXRlLm1vdmUoaW5TZWxlY3Rpb25Nb2RlLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmxlZnRvdmVyVmlzaWJsZUNvbHVtbnMpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRmluZCB0aGUgbnRoIGxpbmUgc3RhcnQgaW5jbHVkZWQgaW4gdGhlIHJhbmdlIChmcm9tIHRoZSBzdGFydCkuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyBfZmlyc3RMaW5lTnVtYmVySW5SYW5nZShtb2RlbDogSUN1cnNvclNpbXBsZU1vZGVsLCByYW5nZTogUmFuZ2UsIGNvdW50OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxldCBzdGFydExpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0aWYgKHJhbmdlLnN0YXJ0Q29sdW1uICE9PSBtb2RlbC5nZXRMaW5lTWluQ29sdW1uKHN0YXJ0TGluZU51bWJlcikpIHtcblx0XHRcdC8vIE1vdmUgb24gdG8gdGhlIHNlY29uZCBsaW5lIGlmIHRoZSBmaXJzdCBsaW5lIHN0YXJ0IGlzIG5vdCBpbmNsdWRlZCBpbiB0aGUgcmFuZ2Vcblx0XHRcdHN0YXJ0TGluZU51bWJlcisrO1xuXHRcdH1cblxuXHRcdHJldHVybiBNYXRoLm1pbihyYW5nZS5lbmRMaW5lTnVtYmVyLCBzdGFydExpbmVOdW1iZXIgKyBjb3VudCAtIDEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgdGhlIG50aCBsaW5lIHN0YXJ0IGluY2x1ZGVkIGluIHRoZSByYW5nZSAoZnJvbSB0aGUgZW5kKS5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIF9sYXN0TGluZU51bWJlckluUmFuZ2UobW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbCwgcmFuZ2U6IFJhbmdlLCBjb3VudDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGlmIChyYW5nZS5zdGFydENvbHVtbiAhPT0gbW9kZWwuZ2V0TGluZU1pbkNvbHVtbihzdGFydExpbmVOdW1iZXIpKSB7XG5cdFx0XHQvLyBNb3ZlIG9uIHRvIHRoZSBzZWNvbmQgbGluZSBpZiB0aGUgZmlyc3QgbGluZSBzdGFydCBpcyBub3QgaW5jbHVkZWQgaW4gdGhlIHJhbmdlXG5cdFx0XHRzdGFydExpbmVOdW1iZXIrKztcblx0XHR9XG5cblx0XHRyZXR1cm4gTWF0aC5tYXgoc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5lbmRMaW5lTnVtYmVyIC0gY291bnQgKyAxKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlTGVmdCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgbm9PZkNvbHVtbnM6IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRyZXR1cm4gY3Vyc29ycy5tYXAoY3Vyc29yID0+IHtcblx0XHRcdGNvbnN0IGRpcmVjdGlvbiA9IHZpZXdNb2RlbC5nZXRUZXh0RGlyZWN0aW9uKGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBpc1J0bCA9IGRpcmVjdGlvbiA9PT0gVGV4dERpcmVjdGlvbi5SVEw7XG5cblx0XHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKFxuXHRcdFx0XHRpc1J0bFxuXHRcdFx0XHRcdD8gTW92ZU9wZXJhdGlvbnMubW92ZVJpZ2h0KHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBub09mQ29sdW1ucylcblx0XHRcdFx0XHQ6IE1vdmVPcGVyYXRpb25zLm1vdmVMZWZ0KHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBub09mQ29sdW1ucylcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZUhhbGZMaW5lTGVmdCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRjb25zdCB2aWV3TGluZU51bWJlciA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGhhbGZMaW5lID0gTWF0aC5yb3VuZCh2aWV3TW9kZWwuZ2V0TGluZUxlbmd0aCh2aWV3TGluZU51bWJlcikgLyAyKTtcblx0XHRcdHJlc3VsdFtpXSA9IEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZUxlZnQodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBjdXJzb3Iudmlld1N0YXRlLCBpblNlbGVjdGlvbk1vZGUsIGhhbGZMaW5lKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVJpZ2h0KHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBub09mQ29sdW1uczogbnVtYmVyKTogUGFydGlhbEN1cnNvclN0YXRlW10ge1xuXHRcdHJldHVybiBjdXJzb3JzLm1hcChjdXJzb3IgPT4ge1xuXHRcdFx0Y29uc3QgZGlyZWN0aW9uID0gdmlld01vZGVsLmdldFRleHREaXJlY3Rpb24oY3Vyc29yLnZpZXdTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGlzUnRsID0gZGlyZWN0aW9uID09PSBUZXh0RGlyZWN0aW9uLlJUTDtcblxuXHRcdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoXG5cdFx0XHRcdGlzUnRsXG5cdFx0XHRcdFx0PyBNb3ZlT3BlcmF0aW9ucy5tb3ZlTGVmdCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIGN1cnNvci52aWV3U3RhdGUsIGluU2VsZWN0aW9uTW9kZSwgbm9PZkNvbHVtbnMpXG5cdFx0XHRcdFx0OiBNb3ZlT3BlcmF0aW9ucy5tb3ZlUmlnaHQodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBjdXJzb3Iudmlld1N0YXRlLCBpblNlbGVjdGlvbk1vZGUsIG5vT2ZDb2x1bW5zKVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlSGFsZkxpbmVSaWdodCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRjb25zdCB2aWV3TGluZU51bWJlciA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGhhbGZMaW5lID0gTWF0aC5yb3VuZCh2aWV3TW9kZWwuZ2V0TGluZUxlbmd0aCh2aWV3TGluZU51bWJlcikgLyAyKTtcblx0XHRcdHJlc3VsdFtpXSA9IEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZVJpZ2h0KHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBoYWxmTGluZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVEb3duQnlWaWV3TGluZXModmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIGxpbmVzQ291bnQ6IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRyZXN1bHRbaV0gPSBDdXJzb3JTdGF0ZS5mcm9tVmlld1N0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVEb3duKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBsaW5lc0NvdW50KSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZURvd25CeU1vZGVsTGluZXModmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4sIGxpbmVzQ291bnQ6IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRyZXN1bHRbaV0gPSBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShNb3ZlT3BlcmF0aW9ucy5tb3ZlRG93bih2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwubW9kZWwsIGN1cnNvci5tb2RlbFN0YXRlLCBpblNlbGVjdGlvbk1vZGUsIGxpbmVzQ291bnQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVXBCeVZpZXdMaW5lcyh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgbGluZXNDb3VudDogbnVtYmVyKTogUGFydGlhbEN1cnNvclN0YXRlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUGFydGlhbEN1cnNvclN0YXRlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY3Vyc29ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgY3Vyc29yID0gY3Vyc29yc1tpXTtcblx0XHRcdHJlc3VsdFtpXSA9IEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZVVwKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgY3Vyc29yLnZpZXdTdGF0ZSwgaW5TZWxlY3Rpb25Nb2RlLCBsaW5lc0NvdW50KSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVVwQnlNb2RlbExpbmVzKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuLCBsaW5lc0NvdW50OiBudW1iZXIpOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0cmVzdWx0W2ldID0gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZVVwKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgY3Vyc29yLm1vZGVsU3RhdGUsIGluU2VsZWN0aW9uTW9kZSwgbGluZXNDb3VudCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVEb3duQnlGb2xkZWRMaW5lcyh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgY291bnQ6IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCBtb2RlbCA9IHZpZXdNb2RlbC5tb2RlbDtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBoaWRkZW5BcmVhcyA9IHZpZXdNb2RlbC5nZXRIaWRkZW5BcmVhcygpO1xuXG5cdFx0cmV0dXJuIGN1cnNvcnMubWFwKGN1cnNvciA9PiB7XG5cdFx0XHRjb25zdCBzdGFydExpbmUgPSBjdXJzb3IubW9kZWxTdGF0ZS5oYXNTZWxlY3Rpb24oKSAmJiAhaW5TZWxlY3Rpb25Nb2RlXG5cdFx0XHRcdD8gY3Vyc29yLm1vZGVsU3RhdGUuc2VsZWN0aW9uLmVuZExpbmVOdW1iZXJcblx0XHRcdFx0OiBjdXJzb3IubW9kZWxTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyO1xuXG5cdFx0XHRjb25zdCB0YXJnZXRMaW5lID0gQ3Vyc29yTW92ZUNvbW1hbmRzLl90YXJnZXRGb2xkZWREb3duKHN0YXJ0TGluZSwgY291bnQsIGhpZGRlbkFyZWFzLCBsaW5lQ291bnQpO1xuXHRcdFx0Y29uc3QgZGVsdGEgPSB0YXJnZXRMaW5lIC0gc3RhcnRMaW5lO1xuXHRcdFx0aWYgKGRlbHRhID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShjdXJzb3IubW9kZWxTdGF0ZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoTW92ZU9wZXJhdGlvbnMubW92ZURvd24odmlld01vZGVsLmN1cnNvckNvbmZpZywgbW9kZWwsIGN1cnNvci5tb2RlbFN0YXRlLCBpblNlbGVjdGlvbk1vZGUsIGRlbHRhKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVVwQnlGb2xkZWRMaW5lcyh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgY291bnQ6IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCBtb2RlbCA9IHZpZXdNb2RlbC5tb2RlbDtcblx0XHRjb25zdCBoaWRkZW5BcmVhcyA9IHZpZXdNb2RlbC5nZXRIaWRkZW5BcmVhcygpO1xuXG5cdFx0cmV0dXJuIGN1cnNvcnMubWFwKGN1cnNvciA9PiB7XG5cdFx0XHRjb25zdCBzdGFydExpbmUgPSBjdXJzb3IubW9kZWxTdGF0ZS5oYXNTZWxlY3Rpb24oKSAmJiAhaW5TZWxlY3Rpb25Nb2RlXG5cdFx0XHRcdD8gY3Vyc29yLm1vZGVsU3RhdGUuc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlclxuXHRcdFx0XHQ6IGN1cnNvci5tb2RlbFN0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cblx0XHRcdGNvbnN0IHRhcmdldExpbmUgPSBDdXJzb3JNb3ZlQ29tbWFuZHMuX3RhcmdldEZvbGRlZFVwKHN0YXJ0TGluZSwgY291bnQsIGhpZGRlbkFyZWFzKTtcblx0XHRcdGNvbnN0IGRlbHRhID0gc3RhcnRMaW5lIC0gdGFyZ2V0TGluZTtcblx0XHRcdGlmIChkZWx0YSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoY3Vyc29yLm1vZGVsU3RhdGUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKE1vdmVPcGVyYXRpb25zLm1vdmVVcCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCBtb2RlbCwgY3Vyc29yLm1vZGVsU3RhdGUsIGluU2VsZWN0aW9uTW9kZSwgZGVsdGEpKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIENvbXB1dGUgdGhlIHRhcmdldCBsaW5lIGFmdGVyIG1vdmluZyBgY291bnRgIHN0ZXBzIGRvd253YXJkIGZyb20gYHN0YXJ0TGluZWAsXG5cdC8vIHRyZWF0aW5nIGVhY2ggZm9sZGVkIHJlZ2lvbiBhcyBhIHNpbmdsZSBzdGVwLlxuXHRwcml2YXRlIHN0YXRpYyBfdGFyZ2V0Rm9sZGVkRG93bihzdGFydExpbmU6IG51bWJlciwgY291bnQ6IG51bWJlciwgaGlkZGVuQXJlYXM6IFJhbmdlW10sIGxpbmVDb3VudDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgbGluZSA9IHN0YXJ0TGluZTtcblx0XHRsZXQgaSA9IDA7XG5cblx0XHR3aGlsZSAoaSA8IGhpZGRlbkFyZWFzLmxlbmd0aCAmJiBoaWRkZW5BcmVhc1tpXS5lbmRMaW5lTnVtYmVyIDwgbGluZSArIDEpIHtcblx0XHRcdGkrKztcblx0XHR9XG5cblx0XHRmb3IgKGxldCBzdGVwID0gMDsgc3RlcCA8IGNvdW50OyBzdGVwKyspIHtcblx0XHRcdGlmIChsaW5lID49IGxpbmVDb3VudCkge1xuXHRcdFx0XHRyZXR1cm4gbGluZUNvdW50O1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY2FuZGlkYXRlID0gbGluZSArIDE7XG5cdFx0XHR3aGlsZSAoaSA8IGhpZGRlbkFyZWFzLmxlbmd0aCAmJiBoaWRkZW5BcmVhc1tpXS5lbmRMaW5lTnVtYmVyIDwgY2FuZGlkYXRlKSB7XG5cdFx0XHRcdGkrKztcblx0XHRcdH1cblxuXHRcdFx0aWYgKGkgPCBoaWRkZW5BcmVhcy5sZW5ndGggJiYgaGlkZGVuQXJlYXNbaV0uc3RhcnRMaW5lTnVtYmVyIDw9IGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRjYW5kaWRhdGUgPSBoaWRkZW5BcmVhc1tpXS5lbmRMaW5lTnVtYmVyICsgMTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNhbmRpZGF0ZSA+IGxpbmVDb3VudCkge1xuXHRcdFx0XHQvLyBUaGUgbmV4dCB2aXNpYmxlIGxpbmUgZG9lcyBub3QgZXhpc3QgKGUuZy4gYSBmb2xkIHJlYWNoZXMgRU9GKS5cblx0XHRcdFx0cmV0dXJuIGxpbmU7XG5cdFx0XHR9XG5cblx0XHRcdGxpbmUgPSBjYW5kaWRhdGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxpbmU7XG5cdH1cblxuXHQvLyBDb21wdXRlIHRoZSB0YXJnZXQgbGluZSBhZnRlciBtb3ZpbmcgYGNvdW50YCBzdGVwcyB1cHdhcmQgZnJvbSBgc3RhcnRMaW5lYCxcblx0Ly8gdHJlYXRpbmcgZWFjaCBmb2xkZWQgcmVnaW9uIGFzIGEgc2luZ2xlIHN0ZXAuXG5cdHByaXZhdGUgc3RhdGljIF90YXJnZXRGb2xkZWRVcChzdGFydExpbmU6IG51bWJlciwgY291bnQ6IG51bWJlciwgaGlkZGVuQXJlYXM6IFJhbmdlW10pOiBudW1iZXIge1xuXHRcdGxldCBsaW5lID0gc3RhcnRMaW5lO1xuXHRcdGxldCBpID0gaGlkZGVuQXJlYXMubGVuZ3RoIC0gMTtcblxuXHRcdHdoaWxlIChpID49IDAgJiYgaGlkZGVuQXJlYXNbaV0uc3RhcnRMaW5lTnVtYmVyID4gbGluZSAtIDEpIHtcblx0XHRcdGktLTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBzdGVwID0gMDsgc3RlcCA8IGNvdW50OyBzdGVwKyspIHtcblx0XHRcdGlmIChsaW5lIDw9IDEpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjYW5kaWRhdGUgPSBsaW5lIC0gMTtcblx0XHRcdHdoaWxlIChpID49IDAgJiYgaGlkZGVuQXJlYXNbaV0uc3RhcnRMaW5lTnVtYmVyID4gY2FuZGlkYXRlKSB7XG5cdFx0XHRcdGktLTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGkgPj0gMCAmJiBoaWRkZW5BcmVhc1tpXS5lbmRMaW5lTnVtYmVyID49IGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRjYW5kaWRhdGUgPSBoaWRkZW5BcmVhc1tpXS5zdGFydExpbmVOdW1iZXIgLSAxO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2FuZGlkYXRlIDwgMSkge1xuXHRcdFx0XHQvLyBUaGUgcHJldmlvdXMgdmlzaWJsZSBsaW5lIGRvZXMgbm90IGV4aXN0IChlLmcuIGEgZm9sZCByZWFjaGVzIEJPRikuXG5cdFx0XHRcdHJldHVybiBsaW5lO1xuXHRcdFx0fVxuXG5cdFx0XHRsaW5lID0gY2FuZGlkYXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiBsaW5lO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVUb1ZpZXdQb3NpdGlvbih2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcjogQ3Vyc29yU3RhdGUsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgdG9WaWV3TGluZU51bWJlcjogbnVtYmVyLCB0b1ZpZXdDb2x1bW46IG51bWJlcik6IFBhcnRpYWxDdXJzb3JTdGF0ZSB7XG5cdFx0cmV0dXJuIEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUoY3Vyc29yLnZpZXdTdGF0ZS5tb3ZlKGluU2VsZWN0aW9uTW9kZSwgdG9WaWV3TGluZU51bWJlciwgdG9WaWV3Q29sdW1uLCAwKSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVRvTW9kZWxQb3NpdGlvbih2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcjogQ3Vyc29yU3RhdGUsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgdG9Nb2RlbExpbmVOdW1iZXI6IG51bWJlciwgdG9Nb2RlbENvbHVtbjogbnVtYmVyKTogUGFydGlhbEN1cnNvclN0YXRlIHtcblx0XHRyZXR1cm4gQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU3RhdGUoY3Vyc29yLm1vZGVsU3RhdGUubW92ZShpblNlbGVjdGlvbk1vZGUsIHRvTW9kZWxMaW5lTnVtYmVyLCB0b01vZGVsQ29sdW1uLCAwKSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVRvVmlld01pbkNvbHVtbih2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRjb25zdCB2aWV3TGluZU51bWJlciA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHZpZXdDb2x1bW4gPSB2aWV3TW9kZWwuZ2V0TGluZU1pbkNvbHVtbih2aWV3TGluZU51bWJlcik7XG5cdFx0XHRyZXN1bHRbaV0gPSB0aGlzLl9tb3ZlVG9WaWV3UG9zaXRpb24odmlld01vZGVsLCBjdXJzb3IsIGluU2VsZWN0aW9uTW9kZSwgdmlld0xpbmVOdW1iZXIsIHZpZXdDb2x1bW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVUb1ZpZXdGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4odmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4pOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdXJzb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXJzb3IgPSBjdXJzb3JzW2ldO1xuXHRcdFx0Y29uc3Qgdmlld0xpbmVOdW1iZXIgPSBjdXJzb3Iudmlld1N0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCB2aWV3Q29sdW1uID0gdmlld01vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4odmlld0xpbmVOdW1iZXIpO1xuXHRcdFx0cmVzdWx0W2ldID0gdGhpcy5fbW92ZVRvVmlld1Bvc2l0aW9uKHZpZXdNb2RlbCwgY3Vyc29yLCBpblNlbGVjdGlvbk1vZGUsIHZpZXdMaW5lTnVtYmVyLCB2aWV3Q29sdW1uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlVG9WaWV3Q2VudGVyQ29sdW1uKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuKTogUGFydGlhbEN1cnNvclN0YXRlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogUGFydGlhbEN1cnNvclN0YXRlW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY3Vyc29ycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgY3Vyc29yID0gY3Vyc29yc1tpXTtcblx0XHRcdGNvbnN0IHZpZXdMaW5lTnVtYmVyID0gY3Vyc29yLnZpZXdTdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyO1xuXHRcdFx0Y29uc3Qgdmlld0NvbHVtbiA9IE1hdGgucm91bmQoKHZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHZpZXdMaW5lTnVtYmVyKSArIHZpZXdNb2RlbC5nZXRMaW5lTWluQ29sdW1uKHZpZXdMaW5lTnVtYmVyKSkgLyAyKTtcblx0XHRcdHJlc3VsdFtpXSA9IHRoaXMuX21vdmVUb1ZpZXdQb3NpdGlvbih2aWV3TW9kZWwsIGN1cnNvciwgaW5TZWxlY3Rpb25Nb2RlLCB2aWV3TGluZU51bWJlciwgdmlld0NvbHVtbik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbW92ZVRvVmlld01heENvbHVtbih2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRjb25zdCB2aWV3TGluZU51bWJlciA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHZpZXdDb2x1bW4gPSB2aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbih2aWV3TGluZU51bWJlcik7XG5cdFx0XHRyZXN1bHRbaV0gPSB0aGlzLl9tb3ZlVG9WaWV3UG9zaXRpb24odmlld01vZGVsLCBjdXJzb3IsIGluU2VsZWN0aW9uTW9kZSwgdmlld0xpbmVOdW1iZXIsIHZpZXdDb2x1bW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21vdmVUb1ZpZXdMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbih2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGN1cnNvcnM6IEN1cnNvclN0YXRlW10sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFBhcnRpYWxDdXJzb3JTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IGN1cnNvcnNbaV07XG5cdFx0XHRjb25zdCB2aWV3TGluZU51bWJlciA9IGN1cnNvci52aWV3U3RhdGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHZpZXdDb2x1bW4gPSB2aWV3TW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRcdHJlc3VsdFtpXSA9IHRoaXMuX21vdmVUb1ZpZXdQb3NpdGlvbih2aWV3TW9kZWwsIGN1cnNvciwgaW5TZWxlY3Rpb25Nb2RlLCB2aWV3TGluZU51bWJlciwgdmlld0NvbHVtbik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDdXJzb3JNb3ZlIHtcblxuXHRjb25zdCBpc0N1cnNvck1vdmVBcmdzID0gZnVuY3Rpb24gKGFyZzogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRcdGlmICghdHlwZXMuaXNPYmplY3QoYXJnKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnNvck1vdmVBcmc6IFJhd0FyZ3VtZW50cyA9IGFyZyBhcyBSYXdBcmd1bWVudHM7XG5cblx0XHRpZiAoIXR5cGVzLmlzU3RyaW5nKGN1cnNvck1vdmVBcmcudG8pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZChjdXJzb3JNb3ZlQXJnLnNlbGVjdCkgJiYgIXR5cGVzLmlzQm9vbGVhbihjdXJzb3JNb3ZlQXJnLnNlbGVjdCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIXR5cGVzLmlzVW5kZWZpbmVkKGN1cnNvck1vdmVBcmcuYnkpICYmICF0eXBlcy5pc1N0cmluZyhjdXJzb3JNb3ZlQXJnLmJ5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdHlwZXMuaXNVbmRlZmluZWQoY3Vyc29yTW92ZUFyZy52YWx1ZSkgJiYgIXR5cGVzLmlzTnVtYmVyKGN1cnNvck1vdmVBcmcudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZChjdXJzb3JNb3ZlQXJnLm5vSGlzdG9yeSkgJiYgIXR5cGVzLmlzQm9vbGVhbihjdXJzb3JNb3ZlQXJnLm5vSGlzdG9yeSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fTtcblxuXHRleHBvcnQgY29uc3QgbWV0YWRhdGE6IElDb21tYW5kTWV0YWRhdGEgPSB7XG5cdFx0ZGVzY3JpcHRpb246ICdNb3ZlIGN1cnNvciB0byBhIGxvZ2ljYWwgcG9zaXRpb24gaW4gdGhlIHZpZXcnLFxuXHRcdGFyZ3M6IFtcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogJ0N1cnNvciBtb3ZlIGFyZ3VtZW50IG9iamVjdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgUHJvcGVydHktdmFsdWUgcGFpcnMgdGhhdCBjYW4gYmUgcGFzc2VkIHRocm91Z2ggdGhpcyBhcmd1bWVudDpcblx0XHRcdFx0XHQqICd0byc6IEEgbWFuZGF0b3J5IGxvZ2ljYWwgcG9zaXRpb24gdmFsdWUgcHJvdmlkaW5nIHdoZXJlIHRvIG1vdmUgdGhlIGN1cnNvci5cblx0XHRcdFx0XHRcdFxcYFxcYFxcYFxuXHRcdFx0XHRcdFx0J2xlZnQnLCAncmlnaHQnLCAndXAnLCAnZG93bicsICdwcmV2QmxhbmtMaW5lJywgJ25leHRCbGFua0xpbmUnLFxuXHRcdFx0XHRcdFx0J3dyYXBwZWRMaW5lU3RhcnQnLCAnd3JhcHBlZExpbmVFbmQnLCAnd3JhcHBlZExpbmVDb2x1bW5DZW50ZXInXG5cdFx0XHRcdFx0XHQnd3JhcHBlZExpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXInLCAnd3JhcHBlZExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcidcblx0XHRcdFx0XHRcdCd2aWV3UG9ydFRvcCcsICd2aWV3UG9ydENlbnRlcicsICd2aWV3UG9ydEJvdHRvbScsICd2aWV3UG9ydElmT3V0c2lkZSdcblx0XHRcdFx0XHRcdFxcYFxcYFxcYFxuXHRcdFx0XHRcdCogJ2J5JzogVW5pdCB0byBtb3ZlLiBEZWZhdWx0IGlzIGNvbXB1dGVkIGJhc2VkIG9uICd0bycgdmFsdWUuXG5cdFx0XHRcdFx0XHRcXGBcXGBcXGBcblx0XHRcdFx0XHRcdCdsaW5lJywgJ3dyYXBwZWRMaW5lJywgJ2NoYXJhY3RlcicsICdoYWxmTGluZScsICdmb2xkZWRMaW5lJ1xuXHRcdFx0XHRcdFx0XFxgXFxgXFxgXG5cdFx0XHRcdFx0XHRVc2UgJ2ZvbGRlZExpbmUnIHdpdGggJ3VwJy8nZG93bicgdG8gbW92ZSBieSBsb2dpY2FsIGxpbmVzIHdoaWxlIHRyZWF0aW5nIGVhY2hcblx0XHRcdFx0XHRcdGZvbGRlZCByZWdpb24gYXMgYSBzaW5nbGUgc3RlcC5cblx0XHRcdFx0XHQqICd2YWx1ZSc6IE51bWJlciBvZiB1bml0cyB0byBtb3ZlLiBEZWZhdWx0IGlzICcxJy5cblx0XHRcdFx0XHQqICdzZWxlY3QnOiBJZiAndHJ1ZScgbWFrZXMgdGhlIHNlbGVjdGlvbi4gRGVmYXVsdCBpcyAnZmFsc2UnLlxuXHRcdFx0XHRcdCogJ25vSGlzdG9yeSc6IElmICd0cnVlJyBkb2VzIG5vdCBhZGQgdGhlIG1vdmVtZW50IHRvIG5hdmlnYXRpb24gaGlzdG9yeS4gRGVmYXVsdCBpcyAnZmFsc2UnLlxuXHRcdFx0XHRgLFxuXHRcdFx0XHRjb25zdHJhaW50OiBpc0N1cnNvck1vdmVBcmdzLFxuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdCdyZXF1aXJlZCc6IFsndG8nXSxcblx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdCd0byc6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0J2VudW0nOiBbJ2xlZnQnLCAncmlnaHQnLCAndXAnLCAnZG93bicsICdwcmV2QmxhbmtMaW5lJywgJ25leHRCbGFua0xpbmUnLCAnd3JhcHBlZExpbmVTdGFydCcsICd3cmFwcGVkTGluZUVuZCcsICd3cmFwcGVkTGluZUNvbHVtbkNlbnRlcicsICd3cmFwcGVkTGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlcicsICd3cmFwcGVkTGluZUxhc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyJywgJ3ZpZXdQb3J0VG9wJywgJ3ZpZXdQb3J0Q2VudGVyJywgJ3ZpZXdQb3J0Qm90dG9tJywgJ3ZpZXdQb3J0SWZPdXRzaWRlJ11cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnYnknOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdCdlbnVtJzogWydsaW5lJywgJ3dyYXBwZWRMaW5lJywgJ2NoYXJhY3RlcicsICdoYWxmTGluZScsICdmb2xkZWRMaW5lJ11cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQndmFsdWUnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRcdCdkZWZhdWx0JzogMVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCdzZWxlY3QnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J25vSGlzdG9yeSc6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdCdkZWZhdWx0JzogZmFsc2Vcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRdXG5cdH07XG5cblx0LyoqXG5cdCAqIFBvc2l0aW9ucyBpbiB0aGUgdmlldyBmb3IgY3Vyc29yIG1vdmUgY29tbWFuZC5cblx0ICovXG5cdGV4cG9ydCBjb25zdCBSYXdEaXJlY3Rpb24gPSB7XG5cdFx0TGVmdDogJ2xlZnQnLFxuXHRcdFJpZ2h0OiAncmlnaHQnLFxuXHRcdFVwOiAndXAnLFxuXHRcdERvd246ICdkb3duJyxcblxuXHRcdFByZXZCbGFua0xpbmU6ICdwcmV2QmxhbmtMaW5lJyxcblx0XHROZXh0QmxhbmtMaW5lOiAnbmV4dEJsYW5rTGluZScsXG5cblx0XHRXcmFwcGVkTGluZVN0YXJ0OiAnd3JhcHBlZExpbmVTdGFydCcsXG5cdFx0V3JhcHBlZExpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXI6ICd3cmFwcGVkTGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlcicsXG5cdFx0V3JhcHBlZExpbmVDb2x1bW5DZW50ZXI6ICd3cmFwcGVkTGluZUNvbHVtbkNlbnRlcicsXG5cdFx0V3JhcHBlZExpbmVFbmQ6ICd3cmFwcGVkTGluZUVuZCcsXG5cdFx0V3JhcHBlZExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlcjogJ3dyYXBwZWRMaW5lTGFzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXInLFxuXG5cdFx0Vmlld1BvcnRUb3A6ICd2aWV3UG9ydFRvcCcsXG5cdFx0Vmlld1BvcnRDZW50ZXI6ICd2aWV3UG9ydENlbnRlcicsXG5cdFx0Vmlld1BvcnRCb3R0b206ICd2aWV3UG9ydEJvdHRvbScsXG5cblx0XHRWaWV3UG9ydElmT3V0c2lkZTogJ3ZpZXdQb3J0SWZPdXRzaWRlJ1xuXHR9O1xuXG5cdC8qKlxuXHQgKiBVbml0cyBmb3IgQ3Vyc29yIG1vdmUgJ2J5JyBhcmd1bWVudFxuXHQgKi9cblx0ZXhwb3J0IGNvbnN0IFJhd1VuaXQgPSB7XG5cdFx0TGluZTogJ2xpbmUnLFxuXHRcdFdyYXBwZWRMaW5lOiAnd3JhcHBlZExpbmUnLFxuXHRcdENoYXJhY3RlcjogJ2NoYXJhY3RlcicsXG5cdFx0SGFsZkxpbmU6ICdoYWxmTGluZScsXG5cdFx0Rm9sZGVkTGluZTogJ2ZvbGRlZExpbmUnXG5cdH07XG5cblx0LyoqXG5cdCAqIEFyZ3VtZW50cyBmb3IgQ3Vyc29yIG1vdmUgY29tbWFuZFxuXHQgKi9cblx0ZXhwb3J0IGludGVyZmFjZSBSYXdBcmd1bWVudHMge1xuXHRcdHRvOiBzdHJpbmc7XG5cdFx0c2VsZWN0PzogYm9vbGVhbjtcblx0XHRieT86IHN0cmluZztcblx0XHR2YWx1ZT86IG51bWJlcjtcblx0XHRub0hpc3Rvcnk/OiBib29sZWFuO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKGFyZ3M6IFBhcnRpYWw8UmF3QXJndW1lbnRzPik6IFBhcnNlZEFyZ3VtZW50cyB8IG51bGwge1xuXHRcdGlmICghYXJncy50bykge1xuXHRcdFx0Ly8gaWxsZWdhbCBhcmd1bWVudHNcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCBkaXJlY3Rpb246IERpcmVjdGlvbjtcblx0XHRzd2l0Y2ggKGFyZ3MudG8pIHtcblx0XHRcdGNhc2UgUmF3RGlyZWN0aW9uLkxlZnQ6XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5MZWZ0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3RGlyZWN0aW9uLlJpZ2h0OlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uUmlnaHQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uVXA6XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5VcDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5Eb3duOlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uRG93bjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5QcmV2QmxhbmtMaW5lOlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uUHJldkJsYW5rTGluZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5OZXh0QmxhbmtMaW5lOlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uTmV4dEJsYW5rTGluZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5XcmFwcGVkTGluZVN0YXJ0OlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uV3JhcHBlZExpbmVTdGFydDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5XcmFwcGVkTGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcjpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLldyYXBwZWRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3RGlyZWN0aW9uLldyYXBwZWRMaW5lQ29sdW1uQ2VudGVyOlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uV3JhcHBlZExpbmVDb2x1bW5DZW50ZXI7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uV3JhcHBlZExpbmVFbmQ6XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5XcmFwcGVkTGluZUVuZDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5XcmFwcGVkTGluZUxhc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyOlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uV3JhcHBlZExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5WaWV3UG9ydFRvcDpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLlZpZXdQb3J0VG9wO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3RGlyZWN0aW9uLlZpZXdQb3J0Qm90dG9tOlxuXHRcdFx0XHRkaXJlY3Rpb24gPSBEaXJlY3Rpb24uVmlld1BvcnRCb3R0b207XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uVmlld1BvcnRDZW50ZXI6XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5WaWV3UG9ydENlbnRlcjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5WaWV3UG9ydElmT3V0c2lkZTpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLlZpZXdQb3J0SWZPdXRzaWRlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdC8vIGlsbGVnYWwgYXJndW1lbnRzXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCB1bml0ID0gVW5pdC5Ob25lO1xuXHRcdHN3aXRjaCAoYXJncy5ieSkge1xuXHRcdFx0Y2FzZSBSYXdVbml0LkxpbmU6XG5cdFx0XHRcdHVuaXQgPSBVbml0LkxpbmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdVbml0LldyYXBwZWRMaW5lOlxuXHRcdFx0XHR1bml0ID0gVW5pdC5XcmFwcGVkTGluZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd1VuaXQuQ2hhcmFjdGVyOlxuXHRcdFx0XHR1bml0ID0gVW5pdC5DaGFyYWN0ZXI7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdVbml0LkhhbGZMaW5lOlxuXHRcdFx0XHR1bml0ID0gVW5pdC5IYWxmTGluZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd1VuaXQuRm9sZGVkTGluZTpcblx0XHRcdFx0dW5pdCA9IFVuaXQuRm9sZGVkTGluZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpcmVjdGlvbjogZGlyZWN0aW9uLFxuXHRcdFx0dW5pdDogdW5pdCxcblx0XHRcdHNlbGVjdDogKCEhYXJncy5zZWxlY3QpLFxuXHRcdFx0dmFsdWU6IChhcmdzLnZhbHVlIHx8IDEpLFxuXHRcdFx0bm9IaXN0b3J5OiAoISFhcmdzLm5vSGlzdG9yeSlcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBQYXJzZWRBcmd1bWVudHMge1xuXHRcdGRpcmVjdGlvbjogRGlyZWN0aW9uO1xuXHRcdHVuaXQ6IFVuaXQ7XG5cdFx0c2VsZWN0OiBib29sZWFuO1xuXHRcdHZhbHVlOiBudW1iZXI7XG5cdFx0bm9IaXN0b3J5OiBib29sZWFuO1xuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBTaW1wbGVNb3ZlQXJndW1lbnRzIHtcblx0XHRkaXJlY3Rpb246IFNpbXBsZU1vdmVEaXJlY3Rpb247XG5cdFx0dW5pdDogVW5pdDtcblx0XHRzZWxlY3Q6IGJvb2xlYW47XG5cdFx0dmFsdWU6IG51bWJlcjtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBlbnVtIERpcmVjdGlvbiB7XG5cdFx0TGVmdCxcblx0XHRSaWdodCxcblx0XHRVcCxcblx0XHREb3duLFxuXHRcdFByZXZCbGFua0xpbmUsXG5cdFx0TmV4dEJsYW5rTGluZSxcblxuXHRcdFdyYXBwZWRMaW5lU3RhcnQsXG5cdFx0V3JhcHBlZExpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXIsXG5cdFx0V3JhcHBlZExpbmVDb2x1bW5DZW50ZXIsXG5cdFx0V3JhcHBlZExpbmVFbmQsXG5cdFx0V3JhcHBlZExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlcixcblxuXHRcdFZpZXdQb3J0VG9wLFxuXHRcdFZpZXdQb3J0Q2VudGVyLFxuXHRcdFZpZXdQb3J0Qm90dG9tLFxuXG5cdFx0Vmlld1BvcnRJZk91dHNpZGUsXG5cdH1cblxuXHRleHBvcnQgdHlwZSBTaW1wbGVNb3ZlRGlyZWN0aW9uID0gKFxuXHRcdERpcmVjdGlvbi5MZWZ0XG5cdFx0fCBEaXJlY3Rpb24uUmlnaHRcblx0XHR8IERpcmVjdGlvbi5VcFxuXHRcdHwgRGlyZWN0aW9uLkRvd25cblx0XHR8IERpcmVjdGlvbi5QcmV2QmxhbmtMaW5lXG5cdFx0fCBEaXJlY3Rpb24uTmV4dEJsYW5rTGluZVxuXHRcdHwgRGlyZWN0aW9uLldyYXBwZWRMaW5lU3RhcnRcblx0XHR8IERpcmVjdGlvbi5XcmFwcGVkTGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlclxuXHRcdHwgRGlyZWN0aW9uLldyYXBwZWRMaW5lQ29sdW1uQ2VudGVyXG5cdFx0fCBEaXJlY3Rpb24uV3JhcHBlZExpbmVFbmRcblx0XHR8IERpcmVjdGlvbi5XcmFwcGVkTGluZUxhc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyXG5cdCk7XG5cblx0ZXhwb3J0IHR5cGUgVmlld3BvcnREaXJlY3Rpb24gPSAoXG5cdFx0RGlyZWN0aW9uLlZpZXdQb3J0VG9wXG5cdFx0fCBEaXJlY3Rpb24uVmlld1BvcnRDZW50ZXJcblx0XHR8IERpcmVjdGlvbi5WaWV3UG9ydEJvdHRvbVxuXHRcdHwgRGlyZWN0aW9uLlZpZXdQb3J0SWZPdXRzaWRlXG5cdCk7XG5cblx0ZXhwb3J0IGNvbnN0IGVudW0gVW5pdCB7XG5cdFx0Tm9uZSxcblx0XHRMaW5lLFxuXHRcdFdyYXBwZWRMaW5lLFxuXHRcdENoYXJhY3Rlcixcblx0XHRIYWxmTGluZSxcblx0XHRGb2xkZWRMaW5lLFxuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksV0FBVztBQUN2QixTQUFTLGFBQXFELG9CQUFvQix5QkFBeUI7QUFDM0csU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQVMsYUFBYTtBQUd0QixTQUFTLHFCQUFxQjtBQUV2QixNQUFNLG1CQUFtQjtBQUFBLEVBRS9CLE9BQWMsY0FBYyxXQUF1QixTQUF3QixnQkFBK0M7QUFDekgsVUFBTSxTQUErQixDQUFDO0FBQ3RDLFFBQUksWUFBWTtBQUNoQixhQUFTLElBQUksR0FBRyxNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNuRCxZQUFNLFNBQVMsUUFBUSxDQUFDO0FBQ3hCLGFBQU8sV0FBVyxJQUFJLElBQUksWUFBWSxPQUFPLFlBQVksT0FBTyxTQUFTO0FBQ3pFLFVBQUksZ0JBQWdCO0FBQ25CLGVBQU8sV0FBVyxJQUFJLFlBQVksZUFBZSxlQUFlLGNBQWMsVUFBVSxjQUFjLFVBQVUs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QUFBQSxNQUNELEtBQUtBLFlBQUEsYUFBYTtBQUNqQixvQkFBWTtBQUNaO0FBQUEsTUFDRCxLQUFLQSxZQUFBLGFBQWE7QUFDakIsb0JBQVk7QUFDWjtBQUFBLE1BQ0QsS0FBS0EsWUFBQSxhQUFhO0FBQ2pCLG9CQUFZO0FBQ1o7QUFBQSxNQUNELEtBQUtBLFlBQUEsYUFBYTtBQUNqQixvQkFBWTtBQUNaO0FBQUEsTUFDRCxLQUFLQSxZQUFBLGFBQWE7QUFDakIsb0JBQVk7QUFDWjtBQUFBLE1BQ0QsS0FBS0EsWUFBQSxhQUFhO0FBQ2pCLG9CQUFZO0FBQ1o7QUFBQSxNQUNELEtBQUtBLFlBQUEsYUFBYTtBQUNqQixvQkFBWTtBQUNaO0FBQUEsTUFDRDtBQUVDLGVBQU87QUFBQSxJQUNUO0FBRUEsUUFBSSxPQUFPO0FBQ1gsWUFBUSxLQUFLLElBQUk7QUFBQSxNQUNoQixLQUFLQSxZQUFBLFFBQVE7QUFDWixlQUFPO0FBQ1A7QUFBQSxNQUNELEtBQUtBLFlBQUEsUUFBUTtBQUNaLGVBQU87QUFDUDtBQUFBLE1BQ0QsS0FBS0EsWUFBQSxRQUFRO0FBQ1osZUFBTztBQUNQO0FBQUEsTUFDRCxLQUFLQSxZQUFBLFFBQVE7QUFDWixlQUFPO0FBQ1A7QUFBQSxNQUNELEtBQUtBLFlBQUEsUUFBUTtBQUNaLGVBQU87QUFDUDtBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBLFFBQVMsQ0FBQyxDQUFDLEtBQUs7QUFBQSxNQUNoQixPQUFRLEtBQUssU0FBUztBQUFBLE1BQ3RCLFdBQVksQ0FBQyxDQUFDLEtBQUs7QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFwRk8sRUFBQUEsWUFBUztBQXFHVCxNQUFXO0FBQVgsSUFBV0MsZUFBWDtBQUNOLElBQUFBLHNCQUFBO0FBQ0EsSUFBQUEsc0JBQUE7QUFDQSxJQUFBQSxzQkFBQTtBQUNBLElBQUFBLHNCQUFBO0FBQ0EsSUFBQUEsc0JBQUE7QUFDQSxJQUFBQSxzQkFBQTtBQUVBLElBQUFBLHNCQUFBO0FBQ0EsSUFBQUEsc0JBQUE7QUFDQSxJQUFBQSxzQkFBQTtBQUNBLElBQUFBLHNCQUFBO0FBQ0EsSUFBQUEsc0JBQUE7QUFFQSxJQUFBQSxzQkFBQTtBQUNBLElBQUFBLHNCQUFBO0FBQ0EsSUFBQUEsc0JBQUE7QUFFQSxJQUFBQSxzQkFBQTtBQUFBLEtBbEJpQixZQUFBRCxZQUFBLGNBQUFBLFlBQUE7QUEwQ1gsTUFBVztBQUFYLElBQVdFLFVBQVg7QUFDTixJQUFBQSxZQUFBO0FBQ0EsSUFBQUEsWUFBQTtBQUNBLElBQUFBLFlBQUE7QUFDQSxJQUFBQSxZQUFBO0FBQ0EsSUFBQUEsWUFBQTtBQUNBLElBQUFBLFlBQUE7QUFBQSxLQU5pQixPQUFBRixZQUFBLFNBQUFBLFlBQUE7QUFBQSxHQXBSRjsiLAogICJuYW1lcyI6IFsiQ3Vyc29yTW92ZSIsICJEaXJlY3Rpb24iLCAiVW5pdCJdCn0K
