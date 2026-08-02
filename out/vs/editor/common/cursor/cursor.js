import { onUnexpectedError } from "../../../base/common/errors.js";
import * as strings from "../../../base/common/strings.js";
import { CursorCollection } from "./cursorCollection.js";
import { CursorState, EditOperationResult, EditOperationType } from "../cursorCommon.js";
import { CursorContext } from "./cursorContext.js";
import { DeleteOperations } from "./cursorDeleteOperations.js";
import { CursorChangeReason } from "../cursorEvents.js";
import { CompositionOutcome, TypeOperations } from "./cursorTypeOperations.js";
import { BaseTypeWithAutoClosingCommand } from "./cursorTypeEditOperations.js";
import { Range } from "../core/range.js";
import { Selection, SelectionDirection } from "../core/selection.js";
import * as editorCommon from "../editorCommon.js";
import { TrackedRangeStickiness } from "../model.js";
import { RawContentChangedType, ModelInjectedTextChangedEvent } from "../textModelEvents.js";
import { VerticalRevealType, ViewCursorStateChangedEvent, ViewRevealRangeRequestEvent } from "../viewEvents.js";
import { dispose, Disposable } from "../../../base/common/lifecycle.js";
import { CursorStateChangedEvent } from "../viewModelEventDispatcher.js";
import { EditSources } from "../textModelEditSource.js";
class CursorsController extends Disposable {
  constructor(model, viewModel, coordinatesConverter, cursorConfig) {
    super();
    this._model = model;
    this._knownModelVersionId = this._model.getVersionId();
    this._viewModel = viewModel;
    this._coordinatesConverter = coordinatesConverter;
    this.context = new CursorContext(this._model, this._viewModel, this._coordinatesConverter, cursorConfig);
    this._cursors = new CursorCollection(this.context);
    this._hasFocus = false;
    this._isHandling = false;
    this._compositionState = null;
    this._columnSelectData = null;
    this._autoClosedActions = [];
    this._prevEditOperationType = EditOperationType.Other;
  }
  dispose() {
    this._cursors.dispose();
    this._autoClosedActions = dispose(this._autoClosedActions);
    super.dispose();
  }
  updateConfiguration(cursorConfig) {
    this.context = new CursorContext(this._model, this._viewModel, this._coordinatesConverter, cursorConfig);
    this._cursors.updateContext(this.context);
  }
  onLineMappingChanged(eventsCollector) {
    if (this._knownModelVersionId !== this._model.getVersionId()) {
      return;
    }
    this.setStates(eventsCollector, "viewModel", CursorChangeReason.NotSet, this.getCursorStates());
  }
  setHasFocus(hasFocus) {
    this._hasFocus = hasFocus;
  }
  _validateAutoClosedActions() {
    if (this._autoClosedActions.length > 0) {
      const selections = this._cursors.getSelections();
      for (let i = 0; i < this._autoClosedActions.length; i++) {
        const autoClosedAction = this._autoClosedActions[i];
        if (!autoClosedAction.isValid(selections)) {
          autoClosedAction.dispose();
          this._autoClosedActions.splice(i, 1);
          i--;
        }
      }
    }
  }
  // ------ some getters/setters
  getPrimaryCursorState() {
    return this._cursors.getPrimaryCursor();
  }
  getLastAddedCursorIndex() {
    return this._cursors.getLastAddedCursorIndex();
  }
  getCursorStates() {
    return this._cursors.getAll();
  }
  setStates(eventsCollector, source, reason, states) {
    let reachedMaxCursorCount = false;
    const multiCursorLimit = this.context.cursorConfig.multiCursorLimit;
    if (states !== null && states.length > multiCursorLimit) {
      states = states.slice(0, multiCursorLimit);
      reachedMaxCursorCount = true;
    }
    const oldState = CursorModelState.from(this._model, this);
    this._cursors.setStates(states);
    this._cursors.normalize();
    this._columnSelectData = null;
    this._validateAutoClosedActions();
    return this._emitStateChangedIfNecessary(eventsCollector, source, reason, oldState, reachedMaxCursorCount);
  }
  setCursorColumnSelectData(columnSelectData) {
    this._columnSelectData = columnSelectData;
  }
  revealAll(eventsCollector, source, minimalReveal, verticalType, revealHorizontal, scrollType) {
    const viewPositions = this._cursors.getViewPositions();
    let revealViewRange = null;
    let revealViewSelections = null;
    if (viewPositions.length > 1) {
      revealViewSelections = this._cursors.getViewSelections();
    } else {
      revealViewRange = Range.fromPositions(viewPositions[0], viewPositions[0]);
    }
    eventsCollector.emitViewEvent(new ViewRevealRangeRequestEvent(source, minimalReveal, revealViewRange, revealViewSelections, verticalType, revealHorizontal, scrollType));
  }
  revealPrimary(eventsCollector, source, minimalReveal, verticalType, revealHorizontal, scrollType) {
    const primaryCursor = this._cursors.getPrimaryCursor();
    const revealViewSelections = [primaryCursor.viewState.selection];
    eventsCollector.emitViewEvent(new ViewRevealRangeRequestEvent(source, minimalReveal, null, revealViewSelections, verticalType, revealHorizontal, scrollType));
  }
  saveState() {
    const result = [];
    const selections = this._cursors.getSelections();
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      result.push({
        inSelectionMode: !selection.isEmpty(),
        selectionStart: {
          lineNumber: selection.selectionStartLineNumber,
          column: selection.selectionStartColumn
        },
        position: {
          lineNumber: selection.positionLineNumber,
          column: selection.positionColumn
        }
      });
    }
    return result;
  }
  restoreState(eventsCollector, states) {
    const desiredSelections = [];
    for (let i = 0, len = states.length; i < len; i++) {
      const state = states[i];
      let positionLineNumber = 1;
      let positionColumn = 1;
      if (state.position && state.position.lineNumber) {
        positionLineNumber = state.position.lineNumber;
      }
      if (state.position && state.position.column) {
        positionColumn = state.position.column;
      }
      let selectionStartLineNumber = positionLineNumber;
      let selectionStartColumn = positionColumn;
      if (state.selectionStart && state.selectionStart.lineNumber) {
        selectionStartLineNumber = state.selectionStart.lineNumber;
      }
      if (state.selectionStart && state.selectionStart.column) {
        selectionStartColumn = state.selectionStart.column;
      }
      desiredSelections.push({
        selectionStartLineNumber,
        selectionStartColumn,
        positionLineNumber,
        positionColumn
      });
    }
    this.setStates(eventsCollector, "restoreState", CursorChangeReason.NotSet, CursorState.fromModelSelections(desiredSelections));
    this.revealAll(eventsCollector, "restoreState", false, VerticalRevealType.Simple, true, editorCommon.ScrollType.Immediate);
  }
  onModelContentChanged(eventsCollector, event) {
    if (event instanceof ModelInjectedTextChangedEvent) {
      if (this._isHandling) {
        return;
      }
      this._isHandling = true;
      try {
        this.setStates(eventsCollector, "modelChange", CursorChangeReason.NotSet, this.getCursorStates());
      } finally {
        this._isHandling = false;
      }
    } else {
      const e = event.rawContentChangedEvent;
      this._knownModelVersionId = e.versionId;
      if (this._isHandling) {
        return;
      }
      const hadFlushEvent = e.containsEvent(RawContentChangedType.Flush);
      this._prevEditOperationType = EditOperationType.Other;
      if (hadFlushEvent) {
        this._cursors.dispose();
        this._cursors = new CursorCollection(this.context);
        this._validateAutoClosedActions();
        this._emitStateChangedIfNecessary(eventsCollector, "model", CursorChangeReason.ContentFlush, null, false);
      } else {
        if (this._hasFocus && e.resultingSelection && e.resultingSelection.length > 0) {
          const cursorState = CursorState.fromModelSelections(e.resultingSelection);
          if (this.setStates(eventsCollector, "modelChange", e.isUndoing ? CursorChangeReason.Undo : e.isRedoing ? CursorChangeReason.Redo : CursorChangeReason.RecoverFromMarkers, cursorState)) {
            this.revealAll(eventsCollector, "modelChange", false, VerticalRevealType.Simple, true, editorCommon.ScrollType.Smooth);
          }
        } else {
          const selectionsFromMarkers = this._cursors.readSelectionFromMarkers();
          this.setStates(eventsCollector, "modelChange", CursorChangeReason.RecoverFromMarkers, CursorState.fromModelSelections(selectionsFromMarkers));
        }
      }
    }
  }
  getSelection() {
    return this._cursors.getPrimaryCursor().modelState.selection;
  }
  getTopMostViewPosition() {
    return this._cursors.getTopMostViewPosition();
  }
  getBottomMostViewPosition() {
    return this._cursors.getBottomMostViewPosition();
  }
  getCursorColumnSelectData() {
    if (this._columnSelectData) {
      return this._columnSelectData;
    }
    const primaryCursor = this._cursors.getPrimaryCursor();
    const viewSelectionStart = primaryCursor.viewState.selectionStart.getStartPosition();
    const viewPosition = primaryCursor.viewState.position;
    return {
      isReal: false,
      fromViewLineNumber: viewSelectionStart.lineNumber,
      fromViewVisualColumn: this.context.cursorConfig.visibleColumnFromColumn(this._viewModel, viewSelectionStart),
      toViewLineNumber: viewPosition.lineNumber,
      toViewVisualColumn: this.context.cursorConfig.visibleColumnFromColumn(this._viewModel, viewPosition)
    };
  }
  getSelections() {
    return this._cursors.getSelections();
  }
  getPosition() {
    return this._cursors.getPrimaryCursor().modelState.position;
  }
  setSelections(eventsCollector, source, selections, reason) {
    this.setStates(eventsCollector, source, reason, CursorState.fromModelSelections(selections));
  }
  getPrevEditOperationType() {
    return this._prevEditOperationType;
  }
  setPrevEditOperationType(type) {
    this._prevEditOperationType = type;
  }
  // ------ auxiliary handling logic
  _pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges) {
    const autoClosedCharactersDeltaDecorations = [];
    const autoClosedEnclosingDeltaDecorations = [];
    for (let i = 0, len = autoClosedCharactersRanges.length; i < len; i++) {
      autoClosedCharactersDeltaDecorations.push({
        range: autoClosedCharactersRanges[i],
        options: {
          description: "auto-closed-character",
          inlineClassName: "auto-closed-character",
          stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
      autoClosedEnclosingDeltaDecorations.push({
        range: autoClosedEnclosingRanges[i],
        options: {
          description: "auto-closed-enclosing",
          stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
    }
    const autoClosedCharactersDecorations = this._model.deltaDecorations([], autoClosedCharactersDeltaDecorations);
    const autoClosedEnclosingDecorations = this._model.deltaDecorations([], autoClosedEnclosingDeltaDecorations);
    this._autoClosedActions.push(new AutoClosedAction(this._model, autoClosedCharactersDecorations, autoClosedEnclosingDecorations));
  }
  _executeEditOperation(opResult, editReason) {
    if (!opResult) {
      return;
    }
    if (opResult.shouldPushStackElementBefore) {
      this._model.pushStackElement();
    }
    const result = CommandExecutor.executeCommands(this._model, this._cursors.getSelections(), opResult.commands, editReason);
    if (result) {
      this._interpretCommandResult(result);
      const autoClosedCharactersRanges = [];
      const autoClosedEnclosingRanges = [];
      for (let i = 0; i < opResult.commands.length; i++) {
        const command = opResult.commands[i];
        if (command instanceof BaseTypeWithAutoClosingCommand && command.enclosingRange && command.closeCharacterRange) {
          autoClosedCharactersRanges.push(command.closeCharacterRange);
          autoClosedEnclosingRanges.push(command.enclosingRange);
        }
      }
      if (autoClosedCharactersRanges.length > 0) {
        this._pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges);
      }
      this._prevEditOperationType = opResult.type;
    }
    if (opResult.shouldPushStackElementAfter) {
      this._model.pushStackElement();
    }
  }
  _interpretCommandResult(cursorState) {
    if (!cursorState || cursorState.length === 0) {
      cursorState = this._cursors.readSelectionFromMarkers();
    }
    this._columnSelectData = null;
    this._cursors.setSelections(cursorState);
    this._cursors.normalize();
  }
  // -----------------------------------------------------------------------------------------------------------
  // ----- emitting events
  _emitStateChangedIfNecessary(eventsCollector, source, reason, oldState, reachedMaxCursorCount) {
    const newState = CursorModelState.from(this._model, this);
    if (newState.equals(oldState)) {
      return false;
    }
    const selections = this._cursors.getSelections();
    const viewSelections = this._cursors.getViewSelections();
    eventsCollector.emitViewEvent(new ViewCursorStateChangedEvent(viewSelections, selections, reason));
    if (!oldState || oldState.cursorState.length !== newState.cursorState.length || newState.cursorState.some((newCursorState, i) => !newCursorState.modelState.equals(oldState.cursorState[i].modelState))) {
      const oldSelections = oldState ? oldState.cursorState.map((s) => s.modelState.selection) : null;
      const oldModelVersionId = oldState ? oldState.modelVersionId : 0;
      eventsCollector.emitOutgoingEvent(new CursorStateChangedEvent(oldSelections, selections, oldModelVersionId, newState.modelVersionId, source || "keyboard", reason, reachedMaxCursorCount));
    }
    return true;
  }
  // -----------------------------------------------------------------------------------------------------------
  // ----- handlers beyond this point
  _findAutoClosingPairs(edits) {
    if (!edits.length) {
      return null;
    }
    const indices = [];
    for (let i = 0, len = edits.length; i < len; i++) {
      const edit = edits[i];
      if (!edit.text || edit.text.indexOf("\n") >= 0) {
        return null;
      }
      const m = edit.text.match(/([)\]}>'"`])([^)\]}>'"`]*)$/);
      if (!m) {
        return null;
      }
      const closeChar = m[1];
      const autoClosingPairsCandidates = this.context.cursorConfig.autoClosingPairs.autoClosingPairsCloseSingleChar.get(closeChar);
      if (!autoClosingPairsCandidates || autoClosingPairsCandidates.length !== 1) {
        return null;
      }
      const openChar = autoClosingPairsCandidates[0].open;
      const closeCharIndex = edit.text.length - m[2].length - 1;
      const openCharIndex = edit.text.lastIndexOf(openChar, closeCharIndex - 1);
      if (openCharIndex === -1) {
        return null;
      }
      indices.push([openCharIndex, closeCharIndex]);
    }
    return indices;
  }
  executeEdits(eventsCollector, source, edits, cursorStateComputer, reason) {
    let autoClosingIndices = null;
    if (source === "snippet") {
      autoClosingIndices = this._findAutoClosingPairs(edits);
    }
    if (autoClosingIndices) {
      edits[0]._isTracked = true;
    }
    const autoClosedCharactersRanges = [];
    const autoClosedEnclosingRanges = [];
    const selections = this._model.pushEditOperations(this.getSelections(), edits, (undoEdits) => {
      if (autoClosingIndices) {
        for (let i = 0, len = autoClosingIndices.length; i < len; i++) {
          const [openCharInnerIndex, closeCharInnerIndex] = autoClosingIndices[i];
          const undoEdit = undoEdits[i];
          const lineNumber = undoEdit.range.startLineNumber;
          const openCharIndex = undoEdit.range.startColumn - 1 + openCharInnerIndex;
          const closeCharIndex = undoEdit.range.startColumn - 1 + closeCharInnerIndex;
          autoClosedCharactersRanges.push(new Range(lineNumber, closeCharIndex + 1, lineNumber, closeCharIndex + 2));
          autoClosedEnclosingRanges.push(new Range(lineNumber, openCharIndex + 1, lineNumber, closeCharIndex + 2));
        }
      }
      const selections2 = cursorStateComputer(undoEdits);
      if (selections2) {
        this._isHandling = true;
      }
      return selections2;
    }, void 0, reason);
    if (selections) {
      this._isHandling = false;
      this.setSelections(eventsCollector, source, selections, CursorChangeReason.NotSet);
    }
    if (autoClosedCharactersRanges.length > 0) {
      this._pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges);
    }
  }
  _executeEdit(callback, eventsCollector, source, cursorChangeReason = CursorChangeReason.NotSet) {
    if (this.context.cursorConfig.readOnly) {
      return;
    }
    const oldState = CursorModelState.from(this._model, this);
    this._cursors.stopTrackingSelections();
    this._isHandling = true;
    try {
      this._cursors.ensureValidState();
      callback();
    } catch (err) {
      onUnexpectedError(err);
    }
    this._isHandling = false;
    this._cursors.startTrackingSelections();
    this._validateAutoClosedActions();
    if (this._emitStateChangedIfNecessary(eventsCollector, source, cursorChangeReason, oldState, false)) {
      this.revealAll(eventsCollector, source, false, VerticalRevealType.Simple, true, editorCommon.ScrollType.Smooth);
    }
  }
  getAutoClosedCharacters() {
    return AutoClosedAction.getAllAutoClosedCharacters(this._autoClosedActions);
  }
  startComposition(eventsCollector) {
    this._compositionState = new CompositionState(this._model, this.getSelections());
  }
  endComposition(eventsCollector, source) {
    const reason = EditSources.cursor({ kind: "compositionEnd", detailedSource: source });
    const compositionOutcome = this._compositionState ? this._compositionState.deduceOutcome(this._model, this.getSelections()) : null;
    this._compositionState = null;
    this._executeEdit(() => {
      if (source === "keyboard") {
        this._executeEditOperation(TypeOperations.compositionEndWithInterceptors(this._prevEditOperationType, this.context.cursorConfig, this._model, compositionOutcome, this.getSelections(), this.getAutoClosedCharacters()), reason);
      }
    }, eventsCollector, source);
  }
  type(eventsCollector, text, source) {
    const reason = EditSources.cursor({ kind: "type", detailedSource: source });
    this._executeEdit(() => {
      if (source === "keyboard") {
        const len = text.length;
        let offset = 0;
        while (offset < len) {
          const charLength = strings.nextCharLength(text, offset);
          const chr = text.substr(offset, charLength);
          this._executeEditOperation(TypeOperations.typeWithInterceptors(!!this._compositionState, this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), this.getAutoClosedCharacters(), chr), reason);
          offset += charLength;
        }
      } else {
        this._executeEditOperation(TypeOperations.typeWithoutInterceptors(this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), text), reason);
      }
    }, eventsCollector, source);
  }
  compositionType(eventsCollector, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source) {
    const reason = EditSources.cursor({ kind: "compositionType", detailedSource: source });
    if (text.length === 0 && replacePrevCharCnt === 0 && replaceNextCharCnt === 0) {
      if (positionDelta !== 0) {
        const newSelections = this.getSelections().map((selection) => {
          const position = selection.getPosition();
          return new Selection(position.lineNumber, position.column + positionDelta, position.lineNumber, position.column + positionDelta);
        });
        this.setSelections(eventsCollector, source, newSelections, CursorChangeReason.NotSet);
      }
      return;
    }
    this._executeEdit(() => {
      this._executeEditOperation(TypeOperations.compositionType(this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), text, replacePrevCharCnt, replaceNextCharCnt, positionDelta), reason);
    }, eventsCollector, source);
  }
  paste(eventsCollector, text, pasteOnNewLine, multicursorText, source) {
    const reason = EditSources.cursor({ kind: "paste", detailedSource: source });
    this._executeEdit(() => {
      this._executeEditOperation(TypeOperations.paste(this.context.cursorConfig, this._model, this.getSelections(), text, pasteOnNewLine, multicursorText || []), reason);
    }, eventsCollector, source, CursorChangeReason.Paste);
  }
  cut(eventsCollector, source) {
    const reason = EditSources.cursor({ kind: "cut", detailedSource: source });
    this._executeEdit(() => {
      this._executeEditOperation(DeleteOperations.cut(this.context.cursorConfig, this._model, this.getSelections()), reason);
    }, eventsCollector, source);
  }
  executeCommand(eventsCollector, command, source) {
    const reason = EditSources.cursor({ kind: "executeCommand", detailedSource: source });
    this._executeEdit(() => {
      this._cursors.killSecondaryCursors();
      this._executeEditOperation(new EditOperationResult(EditOperationType.Other, [command], {
        shouldPushStackElementBefore: false,
        shouldPushStackElementAfter: false
      }), reason);
    }, eventsCollector, source);
  }
  executeCommands(eventsCollector, commands, source) {
    const reason = EditSources.cursor({ kind: "executeCommands", detailedSource: source });
    this._executeEdit(() => {
      this._executeEditOperation(new EditOperationResult(EditOperationType.Other, commands, {
        shouldPushStackElementBefore: false,
        shouldPushStackElementAfter: false
      }), reason);
    }, eventsCollector, source);
  }
}
class CursorModelState {
  constructor(modelVersionId, cursorState) {
    this.modelVersionId = modelVersionId;
    this.cursorState = cursorState;
  }
  static from(model, cursor) {
    return new CursorModelState(model.getVersionId(), cursor.getCursorStates());
  }
  equals(other) {
    if (!other) {
      return false;
    }
    if (this.modelVersionId !== other.modelVersionId) {
      return false;
    }
    if (this.cursorState.length !== other.cursorState.length) {
      return false;
    }
    for (let i = 0, len = this.cursorState.length; i < len; i++) {
      if (!this.cursorState[i].equals(other.cursorState[i])) {
        return false;
      }
    }
    return true;
  }
}
class AutoClosedAction {
  static getAllAutoClosedCharacters(autoClosedActions) {
    let autoClosedCharacters = [];
    for (const autoClosedAction of autoClosedActions) {
      autoClosedCharacters = autoClosedCharacters.concat(autoClosedAction.getAutoClosedCharactersRanges());
    }
    return autoClosedCharacters;
  }
  constructor(model, autoClosedCharactersDecorations, autoClosedEnclosingDecorations) {
    this._model = model;
    this._autoClosedCharactersDecorations = autoClosedCharactersDecorations;
    this._autoClosedEnclosingDecorations = autoClosedEnclosingDecorations;
  }
  dispose() {
    this._autoClosedCharactersDecorations = this._model.deltaDecorations(this._autoClosedCharactersDecorations, []);
    this._autoClosedEnclosingDecorations = this._model.deltaDecorations(this._autoClosedEnclosingDecorations, []);
  }
  getAutoClosedCharactersRanges() {
    const result = [];
    for (let i = 0; i < this._autoClosedCharactersDecorations.length; i++) {
      const decorationRange = this._model.getDecorationRange(this._autoClosedCharactersDecorations[i]);
      if (decorationRange) {
        result.push(decorationRange);
      }
    }
    return result;
  }
  isValid(selections) {
    const enclosingRanges = [];
    for (let i = 0; i < this._autoClosedEnclosingDecorations.length; i++) {
      const decorationRange = this._model.getDecorationRange(this._autoClosedEnclosingDecorations[i]);
      if (decorationRange) {
        enclosingRanges.push(decorationRange);
        if (decorationRange.startLineNumber !== decorationRange.endLineNumber) {
          return false;
        }
      }
    }
    enclosingRanges.sort(Range.compareRangesUsingStarts);
    selections.sort(Range.compareRangesUsingStarts);
    for (let i = 0; i < selections.length; i++) {
      if (i >= enclosingRanges.length) {
        return false;
      }
      if (!enclosingRanges[i].strictContainsRange(selections[i])) {
        return false;
      }
    }
    return true;
  }
}
class CommandExecutor {
  static executeCommands(model, selectionsBefore, commands, editReason = EditSources.unknown({ name: "executeCommands" })) {
    const ctx = {
      model,
      selectionsBefore,
      trackedRanges: [],
      trackedRangesDirection: []
    };
    const result = this._innerExecuteCommands(ctx, commands, editReason);
    for (let i = 0, len = ctx.trackedRanges.length; i < len; i++) {
      ctx.model._setTrackedRange(ctx.trackedRanges[i], null, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges);
    }
    return result;
  }
  static _innerExecuteCommands(ctx, commands, editReason) {
    if (this._arrayIsEmpty(commands)) {
      return null;
    }
    const commandsData = this._getEditOperations(ctx, commands);
    if (commandsData.operations.length === 0) {
      return null;
    }
    const rawOperations = commandsData.operations;
    const loserCursorsMap = this._getLoserCursorMap(rawOperations);
    if (loserCursorsMap.hasOwnProperty("0")) {
      console.warn("Ignoring commands");
      return null;
    }
    const filteredOperations = [];
    for (let i = 0, len = rawOperations.length; i < len; i++) {
      if (!loserCursorsMap.hasOwnProperty(rawOperations[i].identifier.major.toString())) {
        filteredOperations.push(rawOperations[i]);
      }
    }
    if (commandsData.hadTrackedEditOperation && filteredOperations.length > 0) {
      filteredOperations[0]._isTracked = true;
    }
    let selectionsAfter = ctx.model.pushEditOperations(ctx.selectionsBefore, filteredOperations, (inverseEditOperations) => {
      const groupedInverseEditOperations = [];
      for (let i = 0; i < ctx.selectionsBefore.length; i++) {
        groupedInverseEditOperations[i] = [];
      }
      for (const op of inverseEditOperations) {
        if (!op.identifier) {
          continue;
        }
        groupedInverseEditOperations[op.identifier.major].push(op);
      }
      const minorBasedSorter = (a, b) => {
        return a.identifier.minor - b.identifier.minor;
      };
      const cursorSelections = [];
      for (let i = 0; i < ctx.selectionsBefore.length; i++) {
        if (groupedInverseEditOperations[i].length > 0) {
          groupedInverseEditOperations[i].sort(minorBasedSorter);
          cursorSelections[i] = commands[i].computeCursorState(ctx.model, {
            getInverseEditOperations: () => {
              return groupedInverseEditOperations[i];
            },
            getTrackedSelection: (id) => {
              const idx = parseInt(id, 10);
              const range = ctx.model._getTrackedRange(ctx.trackedRanges[idx]);
              if (ctx.trackedRangesDirection[idx] === SelectionDirection.LTR) {
                return new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
              }
              return new Selection(range.endLineNumber, range.endColumn, range.startLineNumber, range.startColumn);
            }
          });
        } else {
          cursorSelections[i] = ctx.selectionsBefore[i];
        }
      }
      return cursorSelections;
    }, void 0, editReason);
    if (!selectionsAfter) {
      selectionsAfter = ctx.selectionsBefore;
    }
    const losingCursors = [];
    for (const losingCursorIndex in loserCursorsMap) {
      if (loserCursorsMap.hasOwnProperty(losingCursorIndex)) {
        losingCursors.push(parseInt(losingCursorIndex, 10));
      }
    }
    losingCursors.sort((a, b) => {
      return b - a;
    });
    for (const losingCursor of losingCursors) {
      selectionsAfter.splice(losingCursor, 1);
    }
    return selectionsAfter;
  }
  static _arrayIsEmpty(commands) {
    for (let i = 0, len = commands.length; i < len; i++) {
      if (commands[i]) {
        return false;
      }
    }
    return true;
  }
  static _getEditOperations(ctx, commands) {
    let operations = [];
    let hadTrackedEditOperation = false;
    for (let i = 0, len = commands.length; i < len; i++) {
      const command = commands[i];
      if (command) {
        const r = this._getEditOperationsFromCommand(ctx, i, command);
        operations = operations.concat(r.operations);
        hadTrackedEditOperation = hadTrackedEditOperation || r.hadTrackedEditOperation;
      }
    }
    return {
      operations,
      hadTrackedEditOperation
    };
  }
  static _getEditOperationsFromCommand(ctx, majorIdentifier, command) {
    const operations = [];
    let operationMinor = 0;
    const addEditOperation = (range, text, forceMoveMarkers = false) => {
      if (Range.isEmpty(range) && text === "") {
        return;
      }
      operations.push({
        identifier: {
          major: majorIdentifier,
          minor: operationMinor++
        },
        range,
        text,
        forceMoveMarkers,
        isAutoWhitespaceEdit: command.insertsAutoWhitespace
      });
    };
    let hadTrackedEditOperation = false;
    const addTrackedEditOperation = (selection, text, forceMoveMarkers) => {
      hadTrackedEditOperation = true;
      addEditOperation(selection, text, forceMoveMarkers);
    };
    const trackSelection = (_selection, trackPreviousOnEmpty) => {
      const selection = Selection.liftSelection(_selection);
      let stickiness;
      if (selection.isEmpty()) {
        if (typeof trackPreviousOnEmpty === "boolean") {
          if (trackPreviousOnEmpty) {
            stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
          } else {
            stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
          }
        } else {
          const maxLineColumn = ctx.model.getLineMaxColumn(selection.startLineNumber);
          if (selection.startColumn === maxLineColumn) {
            stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
          } else {
            stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
          }
        }
      } else {
        stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
      }
      const l = ctx.trackedRanges.length;
      const id = ctx.model._setTrackedRange(null, selection, stickiness);
      ctx.trackedRanges[l] = id;
      ctx.trackedRangesDirection[l] = selection.getDirection();
      return l.toString();
    };
    const editOperationBuilder = {
      addEditOperation,
      addTrackedEditOperation,
      trackSelection
    };
    try {
      command.getEditOperations(ctx.model, editOperationBuilder);
    } catch (e) {
      onUnexpectedError(e);
      return {
        operations: [],
        hadTrackedEditOperation: false
      };
    }
    return {
      operations,
      hadTrackedEditOperation
    };
  }
  static _getLoserCursorMap(operations) {
    operations = operations.slice(0);
    operations.sort((a, b) => {
      return -Range.compareRangesUsingEnds(a.range, b.range);
    });
    const loserCursorsMap = {};
    for (let i = 1; i < operations.length; i++) {
      const previousOp = operations[i - 1];
      const currentOp = operations[i];
      if (Range.getStartPosition(previousOp.range).isBefore(Range.getEndPosition(currentOp.range))) {
        let loserMajor;
        if (previousOp.identifier.major > currentOp.identifier.major) {
          loserMajor = previousOp.identifier.major;
        } else {
          loserMajor = currentOp.identifier.major;
        }
        loserCursorsMap[loserMajor.toString()] = true;
        for (let j = 0; j < operations.length; j++) {
          if (operations[j].identifier.major === loserMajor) {
            operations.splice(j, 1);
            if (j < i) {
              i--;
            }
            j--;
          }
        }
        if (i > 0) {
          i--;
        }
      }
    }
    return loserCursorsMap;
  }
}
class CompositionLineState {
  constructor(text, lineNumber, startSelectionOffset, endSelectionOffset) {
    this.text = text;
    this.lineNumber = lineNumber;
    this.startSelectionOffset = startSelectionOffset;
    this.endSelectionOffset = endSelectionOffset;
  }
}
class CompositionState {
  static _capture(textModel, selections) {
    const result = [];
    for (const selection of selections) {
      if (selection.startLineNumber !== selection.endLineNumber) {
        return null;
      }
      const lineNumber = selection.startLineNumber;
      result.push(new CompositionLineState(
        textModel.getLineContent(lineNumber),
        lineNumber,
        selection.startColumn - 1,
        selection.endColumn - 1
      ));
    }
    return result;
  }
  constructor(textModel, selections) {
    this._original = CompositionState._capture(textModel, selections);
  }
  /**
   * Returns the inserted text during this composition.
   * If the composition resulted in existing text being changed (i.e. not a pure insertion) it returns null.
   */
  deduceOutcome(textModel, selections) {
    if (!this._original) {
      return null;
    }
    const current = CompositionState._capture(textModel, selections);
    if (!current) {
      return null;
    }
    if (this._original.length !== current.length) {
      return null;
    }
    const result = [];
    for (let i = 0, len = this._original.length; i < len; i++) {
      result.push(CompositionState._deduceOutcome(this._original[i], current[i]));
    }
    return result;
  }
  static _deduceOutcome(original, current) {
    const commonPrefix = Math.min(
      original.startSelectionOffset,
      current.startSelectionOffset,
      strings.commonPrefixLength(original.text, current.text)
    );
    const commonSuffix = Math.min(
      original.text.length - original.endSelectionOffset,
      current.text.length - current.endSelectionOffset,
      strings.commonSuffixLength(original.text, current.text)
    );
    const deletedText = original.text.substring(commonPrefix, original.text.length - commonSuffix);
    const insertedTextStartOffset = commonPrefix;
    const insertedTextEndOffset = current.text.length - commonSuffix;
    const insertedText = current.text.substring(insertedTextStartOffset, insertedTextEndOffset);
    const insertedTextRange = new Range(current.lineNumber, insertedTextStartOffset + 1, current.lineNumber, insertedTextEndOffset + 1);
    return new CompositionOutcome(
      deletedText,
      original.startSelectionOffset - commonPrefix,
      original.endSelectionOffset - commonPrefix,
      insertedText,
      current.startSelectionOffset - commonPrefix,
      current.endSelectionOffset - commonPrefix,
      insertedTextRange
    );
  }
}
export {
  CommandExecutor,
  CursorsController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY3Vyc29yL2N1cnNvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb2xsZWN0aW9uIH0gZnJvbSAnLi9jdXJzb3JDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEN1cnNvckNvbmZpZ3VyYXRpb24sIEN1cnNvclN0YXRlLCBFZGl0T3BlcmF0aW9uUmVzdWx0LCBFZGl0T3BlcmF0aW9uVHlwZSwgSUNvbHVtblNlbGVjdERhdGEsIFBhcnRpYWxDdXJzb3JTdGF0ZSwgSUN1cnNvclNpbXBsZU1vZGVsIH0gZnJvbSAnLi4vY3Vyc29yQ29tbW9uLmpzJztcbmltcG9ydCB7IEN1cnNvckNvbnRleHQgfSBmcm9tICcuL2N1cnNvckNvbnRleHQuanMnO1xuaW1wb3J0IHsgRGVsZXRlT3BlcmF0aW9ucyB9IGZyb20gJy4vY3Vyc29yRGVsZXRlT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDaGFuZ2VSZWFzb24gfSBmcm9tICcuLi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgQ29tcG9zaXRpb25PdXRjb21lLCBUeXBlT3BlcmF0aW9ucyB9IGZyb20gJy4vY3Vyc29yVHlwZU9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgQmFzZVR5cGVXaXRoQXV0b0Nsb3NpbmdDb21tYW5kIH0gZnJvbSAnLi9jdXJzb3JUeXBlRWRpdE9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlLCBJUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24sIFNlbGVjdGlvbiwgU2VsZWN0aW9uRGlyZWN0aW9uIH0gZnJvbSAnLi4vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0ICogYXMgZWRpdG9yQ29tbW9uIGZyb20gJy4uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLCBJTW9kZWxEZWx0YURlY29yYXRpb24sIElDdXJzb3JTdGF0ZUNvbXB1dGVyLCBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb24sIElWYWxpZEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBSYXdDb250ZW50Q2hhbmdlZFR5cGUsIE1vZGVsSW5qZWN0ZWRUZXh0Q2hhbmdlZEV2ZW50LCBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50IH0gZnJvbSAnLi4vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IFZlcnRpY2FsUmV2ZWFsVHlwZSwgVmlld0N1cnNvclN0YXRlQ2hhbmdlZEV2ZW50LCBWaWV3UmV2ZWFsUmFuZ2VSZXF1ZXN0RXZlbnQgfSBmcm9tICcuLi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IGRpc3Bvc2UsIERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQsIFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvciB9IGZyb20gJy4uL3ZpZXdNb2RlbEV2ZW50RGlzcGF0Y2hlci5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxFZGl0U291cmNlLCBFZGl0U291cmNlcyB9IGZyb20gJy4uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgSUNvb3JkaW5hdGVzQ29udmVydGVyIH0gZnJvbSAnLi4vY29vcmRpbmF0ZXNDb252ZXJ0ZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgQ3Vyc29yc0NvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbDtcblx0cHJpdmF0ZSBfa25vd25Nb2RlbFZlcnNpb25JZDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3TW9kZWw6IElDdXJzb3JTaW1wbGVNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29vcmRpbmF0ZXNDb252ZXJ0ZXI6IElDb29yZGluYXRlc0NvbnZlcnRlcjtcblx0cHVibGljIGNvbnRleHQ6IEN1cnNvckNvbnRleHQ7XG5cdHByaXZhdGUgX2N1cnNvcnM6IEN1cnNvckNvbGxlY3Rpb247XG5cblx0cHJpdmF0ZSBfaGFzRm9jdXM6IGJvb2xlYW47XG5cdHByaXZhdGUgX2lzSGFuZGxpbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgX2NvbXBvc2l0aW9uU3RhdGU6IENvbXBvc2l0aW9uU3RhdGUgfCBudWxsO1xuXHRwcml2YXRlIF9jb2x1bW5TZWxlY3REYXRhOiBJQ29sdW1uU2VsZWN0RGF0YSB8IG51bGw7XG5cdHByaXZhdGUgX2F1dG9DbG9zZWRBY3Rpb25zOiBBdXRvQ2xvc2VkQWN0aW9uW107XG5cdHByaXZhdGUgX3ByZXZFZGl0T3BlcmF0aW9uVHlwZTogRWRpdE9wZXJhdGlvblR5cGU7XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElUZXh0TW9kZWwsIHZpZXdNb2RlbDogSUN1cnNvclNpbXBsZU1vZGVsLCBjb29yZGluYXRlc0NvbnZlcnRlcjogSUNvb3JkaW5hdGVzQ29udmVydGVyLCBjdXJzb3JDb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24pIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fa25vd25Nb2RlbFZlcnNpb25JZCA9IHRoaXMuX21vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdHRoaXMuX3ZpZXdNb2RlbCA9IHZpZXdNb2RlbDtcblx0XHR0aGlzLl9jb29yZGluYXRlc0NvbnZlcnRlciA9IGNvb3JkaW5hdGVzQ29udmVydGVyO1xuXHRcdHRoaXMuY29udGV4dCA9IG5ldyBDdXJzb3JDb250ZXh0KHRoaXMuX21vZGVsLCB0aGlzLl92aWV3TW9kZWwsIHRoaXMuX2Nvb3JkaW5hdGVzQ29udmVydGVyLCBjdXJzb3JDb25maWcpO1xuXHRcdHRoaXMuX2N1cnNvcnMgPSBuZXcgQ3Vyc29yQ29sbGVjdGlvbih0aGlzLmNvbnRleHQpO1xuXG5cdFx0dGhpcy5faGFzRm9jdXMgPSBmYWxzZTtcblx0XHR0aGlzLl9pc0hhbmRsaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fY29tcG9zaXRpb25TdGF0ZSA9IG51bGw7XG5cdFx0dGhpcy5fY29sdW1uU2VsZWN0RGF0YSA9IG51bGw7XG5cdFx0dGhpcy5fYXV0b0Nsb3NlZEFjdGlvbnMgPSBbXTtcblx0XHR0aGlzLl9wcmV2RWRpdE9wZXJhdGlvblR5cGUgPSBFZGl0T3BlcmF0aW9uVHlwZS5PdGhlcjtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnNvcnMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2F1dG9DbG9zZWRBY3Rpb25zID0gZGlzcG9zZSh0aGlzLl9hdXRvQ2xvc2VkQWN0aW9ucyk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZUNvbmZpZ3VyYXRpb24oY3Vyc29yQ29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5jb250ZXh0ID0gbmV3IEN1cnNvckNvbnRleHQodGhpcy5fbW9kZWwsIHRoaXMuX3ZpZXdNb2RlbCwgdGhpcy5fY29vcmRpbmF0ZXNDb252ZXJ0ZXIsIGN1cnNvckNvbmZpZyk7XG5cdFx0dGhpcy5fY3Vyc29ycy51cGRhdGVDb250ZXh0KHRoaXMuY29udGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgb25MaW5lTWFwcGluZ0NoYW5nZWQoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fa25vd25Nb2RlbFZlcnNpb25JZCAhPT0gdGhpcy5fbW9kZWwuZ2V0VmVyc2lvbklkKCkpIHtcblx0XHRcdC8vIFRoZXJlIGFyZSBtb2RlbCBjaGFuZ2UgZXZlbnRzIHRoYXQgSSBkaWRuJ3QgeWV0IHJlY2VpdmUuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIHdoZW4gZWRpdGluZyB0aGUgbW9kZWwsIGFuZCB0aGUgdmlldyBtb2RlbCByZWNlaXZlcyB0aGUgY2hhbmdlIGV2ZW50cyBmaXJzdCxcblx0XHRcdC8vIGFuZCB0aGUgdmlldyBtb2RlbCBlbWl0cyBsaW5lIG1hcHBpbmcgY2hhbmdlZCBldmVudHMsIGFsbCBiZWZvcmUgdGhlIGN1cnNvciBnZXRzIGEgY2hhbmNlIHRvXG5cdFx0XHQvLyByZWNvdmVyIGZyb20gbWFya2Vycy5cblx0XHRcdC8vXG5cdFx0XHQvLyBUaGUgbW9kZWwgY2hhbmdlIGxpc3RlbmVyIGFib3ZlIHdpbGwgYmUgY2FsbGVkIHNvb24gYW5kIHdlJ2xsIGVuc3VyZSBhIHZhbGlkIGN1cnNvciBzdGF0ZSB0aGVyZS5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRW5zdXJlIHZhbGlkIHN0YXRlXG5cdFx0dGhpcy5zZXRTdGF0ZXMoZXZlbnRzQ29sbGVjdG9yLCAndmlld01vZGVsJywgQ3Vyc29yQ2hhbmdlUmVhc29uLk5vdFNldCwgdGhpcy5nZXRDdXJzb3JTdGF0ZXMoKSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0SGFzRm9jdXMoaGFzRm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9oYXNGb2N1cyA9IGhhc0ZvY3VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVBdXRvQ2xvc2VkQWN0aW9ucygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYXV0b0Nsb3NlZEFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uczogUmFuZ2VbXSA9IHRoaXMuX2N1cnNvcnMuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9hdXRvQ2xvc2VkQWN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhdXRvQ2xvc2VkQWN0aW9uID0gdGhpcy5fYXV0b0Nsb3NlZEFjdGlvbnNbaV07XG5cdFx0XHRcdGlmICghYXV0b0Nsb3NlZEFjdGlvbi5pc1ZhbGlkKHNlbGVjdGlvbnMpKSB7XG5cdFx0XHRcdFx0YXV0b0Nsb3NlZEFjdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fYXV0b0Nsb3NlZEFjdGlvbnMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdGktLTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0tLSBzb21lIGdldHRlcnMvc2V0dGVyc1xuXG5cdHB1YmxpYyBnZXRQcmltYXJ5Q3Vyc29yU3RhdGUoKTogQ3Vyc29yU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3JzLmdldFByaW1hcnlDdXJzb3IoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMYXN0QWRkZWRDdXJzb3JJbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3JzLmdldExhc3RBZGRlZEN1cnNvckluZGV4KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q3Vyc29yU3RhdGVzKCk6IEN1cnNvclN0YXRlW10ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3JzLmdldEFsbCgpO1xuXHR9XG5cblx0cHVibGljIHNldFN0YXRlcyhldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3Rvciwgc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCByZWFzb246IEN1cnNvckNoYW5nZVJlYXNvbiwgc3RhdGVzOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB8IG51bGwpOiBib29sZWFuIHtcblx0XHRsZXQgcmVhY2hlZE1heEN1cnNvckNvdW50ID0gZmFsc2U7XG5cdFx0Y29uc3QgbXVsdGlDdXJzb3JMaW1pdCA9IHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcubXVsdGlDdXJzb3JMaW1pdDtcblx0XHRpZiAoc3RhdGVzICE9PSBudWxsICYmIHN0YXRlcy5sZW5ndGggPiBtdWx0aUN1cnNvckxpbWl0KSB7XG5cdFx0XHRzdGF0ZXMgPSBzdGF0ZXMuc2xpY2UoMCwgbXVsdGlDdXJzb3JMaW1pdCk7XG5cdFx0XHRyZWFjaGVkTWF4Q3Vyc29yQ291bnQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZFN0YXRlID0gQ3Vyc29yTW9kZWxTdGF0ZS5mcm9tKHRoaXMuX21vZGVsLCB0aGlzKTtcblxuXHRcdHRoaXMuX2N1cnNvcnMuc2V0U3RhdGVzKHN0YXRlcyk7XG5cdFx0dGhpcy5fY3Vyc29ycy5ub3JtYWxpemUoKTtcblx0XHR0aGlzLl9jb2x1bW5TZWxlY3REYXRhID0gbnVsbDtcblxuXHRcdHRoaXMuX3ZhbGlkYXRlQXV0b0Nsb3NlZEFjdGlvbnMoKTtcblxuXHRcdHJldHVybiB0aGlzLl9lbWl0U3RhdGVDaGFuZ2VkSWZOZWNlc3NhcnkoZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UsIHJlYXNvbiwgb2xkU3RhdGUsIHJlYWNoZWRNYXhDdXJzb3JDb3VudCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q3Vyc29yQ29sdW1uU2VsZWN0RGF0YShjb2x1bW5TZWxlY3REYXRhOiBJQ29sdW1uU2VsZWN0RGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbHVtblNlbGVjdERhdGEgPSBjb2x1bW5TZWxlY3REYXRhO1xuXHR9XG5cblx0cHVibGljIHJldmVhbEFsbChldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3Rvciwgc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBtaW5pbWFsUmV2ZWFsOiBib29sZWFuLCB2ZXJ0aWNhbFR5cGU6IFZlcnRpY2FsUmV2ZWFsVHlwZSwgcmV2ZWFsSG9yaXpvbnRhbDogYm9vbGVhbiwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3UG9zaXRpb25zID0gdGhpcy5fY3Vyc29ycy5nZXRWaWV3UG9zaXRpb25zKCk7XG5cblx0XHRsZXQgcmV2ZWFsVmlld1JhbmdlOiBSYW5nZSB8IG51bGwgPSBudWxsO1xuXHRcdGxldCByZXZlYWxWaWV3U2VsZWN0aW9uczogU2VsZWN0aW9uW10gfCBudWxsID0gbnVsbDtcblx0XHRpZiAodmlld1Bvc2l0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRyZXZlYWxWaWV3U2VsZWN0aW9ucyA9IHRoaXMuX2N1cnNvcnMuZ2V0Vmlld1NlbGVjdGlvbnMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV2ZWFsVmlld1JhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyh2aWV3UG9zaXRpb25zWzBdLCB2aWV3UG9zaXRpb25zWzBdKTtcblx0XHR9XG5cblx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgVmlld1JldmVhbFJhbmdlUmVxdWVzdEV2ZW50KHNvdXJjZSwgbWluaW1hbFJldmVhbCwgcmV2ZWFsVmlld1JhbmdlLCByZXZlYWxWaWV3U2VsZWN0aW9ucywgdmVydGljYWxUeXBlLCByZXZlYWxIb3Jpem9udGFsLCBzY3JvbGxUeXBlKSk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsUHJpbWFyeShldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3Rvciwgc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBtaW5pbWFsUmV2ZWFsOiBib29sZWFuLCB2ZXJ0aWNhbFR5cGU6IFZlcnRpY2FsUmV2ZWFsVHlwZSwgcmV2ZWFsSG9yaXpvbnRhbDogYm9vbGVhbiwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUpOiB2b2lkIHtcblx0XHRjb25zdCBwcmltYXJ5Q3Vyc29yID0gdGhpcy5fY3Vyc29ycy5nZXRQcmltYXJ5Q3Vyc29yKCk7XG5cdFx0Y29uc3QgcmV2ZWFsVmlld1NlbGVjdGlvbnMgPSBbcHJpbWFyeUN1cnNvci52aWV3U3RhdGUuc2VsZWN0aW9uXTtcblx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgVmlld1JldmVhbFJhbmdlUmVxdWVzdEV2ZW50KHNvdXJjZSwgbWluaW1hbFJldmVhbCwgbnVsbCwgcmV2ZWFsVmlld1NlbGVjdGlvbnMsIHZlcnRpY2FsVHlwZSwgcmV2ZWFsSG9yaXpvbnRhbCwgc2Nyb2xsVHlwZSkpO1xuXHR9XG5cblx0cHVibGljIHNhdmVTdGF0ZSgpOiBlZGl0b3JDb21tb24uSUN1cnNvclN0YXRlW10ge1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBlZGl0b3JDb21tb24uSUN1cnNvclN0YXRlW10gPSBbXTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl9jdXJzb3JzLmdldFNlbGVjdGlvbnMoKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uc1tpXTtcblxuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRpblNlbGVjdGlvbk1vZGU6ICFzZWxlY3Rpb24uaXNFbXB0eSgpLFxuXHRcdFx0XHRzZWxlY3Rpb25TdGFydDoge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXI6IHNlbGVjdGlvbi5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0Y29sdW1uOiBzZWxlY3Rpb24uc2VsZWN0aW9uU3RhcnRDb2x1bW4sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0bGluZU51bWJlcjogc2VsZWN0aW9uLnBvc2l0aW9uTGluZU51bWJlcixcblx0XHRcdFx0XHRjb2x1bW46IHNlbGVjdGlvbi5wb3NpdGlvbkNvbHVtbixcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyByZXN0b3JlU3RhdGUoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHN0YXRlczogZWRpdG9yQ29tbW9uLklDdXJzb3JTdGF0ZVtdKTogdm9pZCB7XG5cblx0XHRjb25zdCBkZXNpcmVkU2VsZWN0aW9uczogSVNlbGVjdGlvbltdID0gW107XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc3RhdGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlc1tpXTtcblxuXHRcdFx0bGV0IHBvc2l0aW9uTGluZU51bWJlciA9IDE7XG5cdFx0XHRsZXQgcG9zaXRpb25Db2x1bW4gPSAxO1xuXG5cdFx0XHQvLyBBdm9pZCBtaXNzaW5nIHByb3BlcnRpZXMgb24gdGhlIGxpdGVyYWxcblx0XHRcdGlmIChzdGF0ZS5wb3NpdGlvbiAmJiBzdGF0ZS5wb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdHBvc2l0aW9uTGluZU51bWJlciA9IHN0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGUucG9zaXRpb24gJiYgc3RhdGUucG9zaXRpb24uY29sdW1uKSB7XG5cdFx0XHRcdHBvc2l0aW9uQ29sdW1uID0gc3RhdGUucG9zaXRpb24uY29sdW1uO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyID0gcG9zaXRpb25MaW5lTnVtYmVyO1xuXHRcdFx0bGV0IHNlbGVjdGlvblN0YXJ0Q29sdW1uID0gcG9zaXRpb25Db2x1bW47XG5cblx0XHRcdC8vIEF2b2lkIG1pc3NpbmcgcHJvcGVydGllcyBvbiB0aGUgbGl0ZXJhbFxuXHRcdFx0aWYgKHN0YXRlLnNlbGVjdGlvblN0YXJ0ICYmIHN0YXRlLnNlbGVjdGlvblN0YXJ0LmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0c2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyID0gc3RhdGUuc2VsZWN0aW9uU3RhcnQubGluZU51bWJlcjtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZS5zZWxlY3Rpb25TdGFydCAmJiBzdGF0ZS5zZWxlY3Rpb25TdGFydC5jb2x1bW4pIHtcblx0XHRcdFx0c2VsZWN0aW9uU3RhcnRDb2x1bW4gPSBzdGF0ZS5zZWxlY3Rpb25TdGFydC5jb2x1bW47XG5cdFx0XHR9XG5cblx0XHRcdGRlc2lyZWRTZWxlY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRzZWxlY3Rpb25TdGFydExpbmVOdW1iZXI6IHNlbGVjdGlvblN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0c2VsZWN0aW9uU3RhcnRDb2x1bW46IHNlbGVjdGlvblN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRwb3NpdGlvbkxpbmVOdW1iZXI6IHBvc2l0aW9uTGluZU51bWJlcixcblx0XHRcdFx0cG9zaXRpb25Db2x1bW46IHBvc2l0aW9uQ29sdW1uXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnNldFN0YXRlcyhldmVudHNDb2xsZWN0b3IsICdyZXN0b3JlU3RhdGUnLCBDdXJzb3JDaGFuZ2VSZWFzb24uTm90U2V0LCBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTZWxlY3Rpb25zKGRlc2lyZWRTZWxlY3Rpb25zKSk7XG5cdFx0dGhpcy5yZXZlYWxBbGwoZXZlbnRzQ29sbGVjdG9yLCAncmVzdG9yZVN0YXRlJywgZmFsc2UsIFZlcnRpY2FsUmV2ZWFsVHlwZS5TaW1wbGUsIHRydWUsIGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgb25Nb2RlbENvbnRlbnRDaGFuZ2VkKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCBldmVudDogSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCB8IE1vZGVsSW5qZWN0ZWRUZXh0Q2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50IGluc3RhbmNlb2YgTW9kZWxJbmplY3RlZFRleHRDaGFuZ2VkRXZlbnQpIHtcblx0XHRcdC8vIElmIGluamVjdGVkIHRleHRzIGNoYW5nZSwgdGhlIHZpZXcgcG9zaXRpb25zIG9mIGFsbCBjdXJzb3JzIG5lZWQgdG8gYmUgdXBkYXRlZC5cblx0XHRcdGlmICh0aGlzLl9pc0hhbmRsaW5nKSB7XG5cdFx0XHRcdC8vIFRoZSB2aWV3IHBvc2l0aW9ucyB3aWxsIGJlIHVwZGF0ZWQgd2hlbiBoYW5kbGluZyBmaW5pc2hlc1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBzZXRTdGF0ZXMgbWlnaHQgcmVtb3ZlIG1hcmtlcnMsIHdoaWNoIGNvdWxkIHRyaWdnZXIgYSBkZWNvcmF0aW9uIGNoYW5nZS5cblx0XHRcdC8vIElmIHRoZXJlIGFyZSBpbmplY3RlZCB0ZXh0IGRlY29yYXRpb25zIGZvciB0aGF0IGxpbmUsIGBvbk1vZGVsQ29udGVudENoYW5nZWRgIGlzIGVtaXR0ZWQgYWdhaW5cblx0XHRcdC8vIGFuZCBhbiBlbmRsZXNzIHJlY3Vyc2lvbiBoYXBwZW5zLlxuXHRcdFx0Ly8gX2lzSGFuZGxpbmcgcHJldmVudHMgdGhhdC5cblx0XHRcdHRoaXMuX2lzSGFuZGxpbmcgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5zZXRTdGF0ZXMoZXZlbnRzQ29sbGVjdG9yLCAnbW9kZWxDaGFuZ2UnLCBDdXJzb3JDaGFuZ2VSZWFzb24uTm90U2V0LCB0aGlzLmdldEN1cnNvclN0YXRlcygpKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX2lzSGFuZGxpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZSA9IGV2ZW50LnJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQ7XG5cdFx0XHR0aGlzLl9rbm93bk1vZGVsVmVyc2lvbklkID0gZS52ZXJzaW9uSWQ7XG5cdFx0XHRpZiAodGhpcy5faXNIYW5kbGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhhZEZsdXNoRXZlbnQgPSBlLmNvbnRhaW5zRXZlbnQoUmF3Q29udGVudENoYW5nZWRUeXBlLkZsdXNoKTtcblx0XHRcdHRoaXMuX3ByZXZFZGl0T3BlcmF0aW9uVHlwZSA9IEVkaXRPcGVyYXRpb25UeXBlLk90aGVyO1xuXG5cdFx0XHRpZiAoaGFkRmx1c2hFdmVudCkge1xuXHRcdFx0XHQvLyBhIG1vZGVsLnNldFZhbHVlKCkgd2FzIGNhbGxlZFxuXHRcdFx0XHR0aGlzLl9jdXJzb3JzLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fY3Vyc29ycyA9IG5ldyBDdXJzb3JDb2xsZWN0aW9uKHRoaXMuY29udGV4dCk7XG5cdFx0XHRcdHRoaXMuX3ZhbGlkYXRlQXV0b0Nsb3NlZEFjdGlvbnMoKTtcblx0XHRcdFx0dGhpcy5fZW1pdFN0YXRlQ2hhbmdlZElmTmVjZXNzYXJ5KGV2ZW50c0NvbGxlY3RvciwgJ21vZGVsJywgQ3Vyc29yQ2hhbmdlUmVhc29uLkNvbnRlbnRGbHVzaCwgbnVsbCwgZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMuX2hhc0ZvY3VzICYmIGUucmVzdWx0aW5nU2VsZWN0aW9uICYmIGUucmVzdWx0aW5nU2VsZWN0aW9uLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBjdXJzb3JTdGF0ZSA9IEN1cnNvclN0YXRlLmZyb21Nb2RlbFNlbGVjdGlvbnMoZS5yZXN1bHRpbmdTZWxlY3Rpb24pO1xuXHRcdFx0XHRcdGlmICh0aGlzLnNldFN0YXRlcyhldmVudHNDb2xsZWN0b3IsICdtb2RlbENoYW5nZScsIGUuaXNVbmRvaW5nID8gQ3Vyc29yQ2hhbmdlUmVhc29uLlVuZG8gOiBlLmlzUmVkb2luZyA/IEN1cnNvckNoYW5nZVJlYXNvbi5SZWRvIDogQ3Vyc29yQ2hhbmdlUmVhc29uLlJlY292ZXJGcm9tTWFya2VycywgY3Vyc29yU3RhdGUpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJldmVhbEFsbChldmVudHNDb2xsZWN0b3IsICdtb2RlbENoYW5nZScsIGZhbHNlLCBWZXJ0aWNhbFJldmVhbFR5cGUuU2ltcGxlLCB0cnVlLCBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb25zRnJvbU1hcmtlcnMgPSB0aGlzLl9jdXJzb3JzLnJlYWRTZWxlY3Rpb25Gcm9tTWFya2VycygpO1xuXHRcdFx0XHRcdHRoaXMuc2V0U3RhdGVzKGV2ZW50c0NvbGxlY3RvciwgJ21vZGVsQ2hhbmdlJywgQ3Vyc29yQ2hhbmdlUmVhc29uLlJlY292ZXJGcm9tTWFya2VycywgQ3Vyc29yU3RhdGUuZnJvbU1vZGVsU2VsZWN0aW9ucyhzZWxlY3Rpb25zRnJvbU1hcmtlcnMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogU2VsZWN0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29ycy5nZXRQcmltYXJ5Q3Vyc29yKCkubW9kZWxTdGF0ZS5zZWxlY3Rpb247XG5cdH1cblxuXHRwdWJsaWMgZ2V0VG9wTW9zdFZpZXdQb3NpdGlvbigpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnNvcnMuZ2V0VG9wTW9zdFZpZXdQb3NpdGlvbigpO1xuXHR9XG5cblx0cHVibGljIGdldEJvdHRvbU1vc3RWaWV3UG9zaXRpb24oKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3JzLmdldEJvdHRvbU1vc3RWaWV3UG9zaXRpb24oKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDdXJzb3JDb2x1bW5TZWxlY3REYXRhKCk6IElDb2x1bW5TZWxlY3REYXRhIHtcblx0XHRpZiAodGhpcy5fY29sdW1uU2VsZWN0RGF0YSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbHVtblNlbGVjdERhdGE7XG5cdFx0fVxuXHRcdGNvbnN0IHByaW1hcnlDdXJzb3IgPSB0aGlzLl9jdXJzb3JzLmdldFByaW1hcnlDdXJzb3IoKTtcblx0XHRjb25zdCB2aWV3U2VsZWN0aW9uU3RhcnQgPSBwcmltYXJ5Q3Vyc29yLnZpZXdTdGF0ZS5zZWxlY3Rpb25TdGFydC5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gcHJpbWFyeUN1cnNvci52aWV3U3RhdGUucG9zaXRpb247XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzUmVhbDogZmFsc2UsXG5cdFx0XHRmcm9tVmlld0xpbmVOdW1iZXI6IHZpZXdTZWxlY3Rpb25TdGFydC5saW5lTnVtYmVyLFxuXHRcdFx0ZnJvbVZpZXdWaXN1YWxDb2x1bW46IHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcudmlzaWJsZUNvbHVtbkZyb21Db2x1bW4odGhpcy5fdmlld01vZGVsLCB2aWV3U2VsZWN0aW9uU3RhcnQpLFxuXHRcdFx0dG9WaWV3TGluZU51bWJlcjogdmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHR0b1ZpZXdWaXN1YWxDb2x1bW46IHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcudmlzaWJsZUNvbHVtbkZyb21Db2x1bW4odGhpcy5fdmlld01vZGVsLCB2aWV3UG9zaXRpb24pLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2VsZWN0aW9ucygpOiBTZWxlY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnNvcnMuZ2V0U2VsZWN0aW9ucygpO1xuXHR9XG5cblx0cHVibGljIGdldFBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29ycy5nZXRQcmltYXJ5Q3Vyc29yKCkubW9kZWxTdGF0ZS5wb3NpdGlvbjtcblx0fVxuXG5cdHB1YmxpYyBzZXRTZWxlY3Rpb25zKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCBzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHNlbGVjdGlvbnM6IHJlYWRvbmx5IElTZWxlY3Rpb25bXSwgcmVhc29uOiBDdXJzb3JDaGFuZ2VSZWFzb24pOiB2b2lkIHtcblx0XHR0aGlzLnNldFN0YXRlcyhldmVudHNDb2xsZWN0b3IsIHNvdXJjZSwgcmVhc29uLCBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTZWxlY3Rpb25zKHNlbGVjdGlvbnMpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQcmV2RWRpdE9wZXJhdGlvblR5cGUoKTogRWRpdE9wZXJhdGlvblR5cGUge1xuXHRcdHJldHVybiB0aGlzLl9wcmV2RWRpdE9wZXJhdGlvblR5cGU7XG5cdH1cblxuXHRwdWJsaWMgc2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKHR5cGU6IEVkaXRPcGVyYXRpb25UeXBlKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJldkVkaXRPcGVyYXRpb25UeXBlID0gdHlwZTtcblx0fVxuXG5cdC8vIC0tLS0tLSBhdXhpbGlhcnkgaGFuZGxpbmcgbG9naWNcblxuXHRwcml2YXRlIF9wdXNoQXV0b0Nsb3NlZEFjdGlvbihhdXRvQ2xvc2VkQ2hhcmFjdGVyc1JhbmdlczogUmFuZ2VbXSwgYXV0b0Nsb3NlZEVuY2xvc2luZ1JhbmdlczogUmFuZ2VbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGF1dG9DbG9zZWRDaGFyYWN0ZXJzRGVsdGFEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCBhdXRvQ2xvc2VkRW5jbG9zaW5nRGVsdGFEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhdXRvQ2xvc2VkQ2hhcmFjdGVyc1Jhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0YXV0b0Nsb3NlZENoYXJhY3RlcnNEZWx0YURlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRyYW5nZTogYXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXNbaV0sXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2F1dG8tY2xvc2VkLWNoYXJhY3RlcicsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiAnYXV0by1jbG9zZWQtY2hhcmFjdGVyJyxcblx0XHRcdFx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGF1dG9DbG9zZWRFbmNsb3NpbmdEZWx0YURlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRyYW5nZTogYXV0b0Nsb3NlZEVuY2xvc2luZ1Jhbmdlc1tpXSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnYXV0by1jbG9zZWQtZW5jbG9zaW5nJyxcblx0XHRcdFx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBhdXRvQ2xvc2VkQ2hhcmFjdGVyc0RlY29yYXRpb25zID0gdGhpcy5fbW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhbXSwgYXV0b0Nsb3NlZENoYXJhY3RlcnNEZWx0YURlY29yYXRpb25zKTtcblx0XHRjb25zdCBhdXRvQ2xvc2VkRW5jbG9zaW5nRGVjb3JhdGlvbnMgPSB0aGlzLl9tb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBhdXRvQ2xvc2VkRW5jbG9zaW5nRGVsdGFEZWNvcmF0aW9ucyk7XG5cdFx0dGhpcy5fYXV0b0Nsb3NlZEFjdGlvbnMucHVzaChuZXcgQXV0b0Nsb3NlZEFjdGlvbih0aGlzLl9tb2RlbCwgYXV0b0Nsb3NlZENoYXJhY3RlcnNEZWNvcmF0aW9ucywgYXV0b0Nsb3NlZEVuY2xvc2luZ0RlY29yYXRpb25zKSk7XG5cdH1cblxuXHRwcml2YXRlIF9leGVjdXRlRWRpdE9wZXJhdGlvbihvcFJlc3VsdDogRWRpdE9wZXJhdGlvblJlc3VsdCB8IG51bGwsIGVkaXRSZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2UpOiB2b2lkIHtcblxuXHRcdGlmICghb3BSZXN1bHQpIHtcblx0XHRcdC8vIE5vdGhpbmcgdG8gZXhlY3V0ZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChvcFJlc3VsdC5zaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlKSB7XG5cdFx0XHR0aGlzLl9tb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gQ29tbWFuZEV4ZWN1dG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLl9tb2RlbCwgdGhpcy5fY3Vyc29ycy5nZXRTZWxlY3Rpb25zKCksIG9wUmVzdWx0LmNvbW1hbmRzLCBlZGl0UmVhc29uKTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHQvLyBUaGUgY29tbWFuZHMgd2VyZSBhcHBsaWVkIGNvcnJlY3RseVxuXHRcdFx0dGhpcy5faW50ZXJwcmV0Q29tbWFuZFJlc3VsdChyZXN1bHQpO1xuXG5cdFx0XHQvLyBDaGVjayBmb3IgYXV0by1jbG9zaW5nIGNsb3NlZCBjaGFyYWN0ZXJzXG5cdFx0XHRjb25zdCBhdXRvQ2xvc2VkQ2hhcmFjdGVyc1JhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdFx0Y29uc3QgYXV0b0Nsb3NlZEVuY2xvc2luZ1JhbmdlczogUmFuZ2VbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG9wUmVzdWx0LmNvbW1hbmRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBvcFJlc3VsdC5jb21tYW5kc1tpXTtcblx0XHRcdFx0aWYgKGNvbW1hbmQgaW5zdGFuY2VvZiBCYXNlVHlwZVdpdGhBdXRvQ2xvc2luZ0NvbW1hbmQgJiYgY29tbWFuZC5lbmNsb3NpbmdSYW5nZSAmJiBjb21tYW5kLmNsb3NlQ2hhcmFjdGVyUmFuZ2UpIHtcblx0XHRcdFx0XHRhdXRvQ2xvc2VkQ2hhcmFjdGVyc1Jhbmdlcy5wdXNoKGNvbW1hbmQuY2xvc2VDaGFyYWN0ZXJSYW5nZSk7XG5cdFx0XHRcdFx0YXV0b0Nsb3NlZEVuY2xvc2luZ1Jhbmdlcy5wdXNoKGNvbW1hbmQuZW5jbG9zaW5nUmFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhdXRvQ2xvc2VkQ2hhcmFjdGVyc1Jhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3B1c2hBdXRvQ2xvc2VkQWN0aW9uKGF1dG9DbG9zZWRDaGFyYWN0ZXJzUmFuZ2VzLCBhdXRvQ2xvc2VkRW5jbG9zaW5nUmFuZ2VzKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcHJldkVkaXRPcGVyYXRpb25UeXBlID0gb3BSZXN1bHQudHlwZTtcblx0XHR9XG5cblx0XHRpZiAob3BSZXN1bHQuc2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyKSB7XG5cdFx0XHR0aGlzLl9tb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW50ZXJwcmV0Q29tbWFuZFJlc3VsdChjdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKCFjdXJzb3JTdGF0ZSB8fCBjdXJzb3JTdGF0ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdGN1cnNvclN0YXRlID0gdGhpcy5fY3Vyc29ycy5yZWFkU2VsZWN0aW9uRnJvbU1hcmtlcnMoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb2x1bW5TZWxlY3REYXRhID0gbnVsbDtcblx0XHR0aGlzLl9jdXJzb3JzLnNldFNlbGVjdGlvbnMoY3Vyc29yU3RhdGUpO1xuXHRcdHRoaXMuX2N1cnNvcnMubm9ybWFsaXplKCk7XG5cdH1cblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyAtLS0tLSBlbWl0dGluZyBldmVudHNcblxuXHRwcml2YXRlIF9lbWl0U3RhdGVDaGFuZ2VkSWZOZWNlc3NhcnkoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgcmVhc29uOiBDdXJzb3JDaGFuZ2VSZWFzb24sIG9sZFN0YXRlOiBDdXJzb3JNb2RlbFN0YXRlIHwgbnVsbCwgcmVhY2hlZE1heEN1cnNvckNvdW50OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbmV3U3RhdGUgPSBDdXJzb3JNb2RlbFN0YXRlLmZyb20odGhpcy5fbW9kZWwsIHRoaXMpO1xuXHRcdGlmIChuZXdTdGF0ZS5lcXVhbHMob2xkU3RhdGUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMuX2N1cnNvcnMuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IHZpZXdTZWxlY3Rpb25zID0gdGhpcy5fY3Vyc29ycy5nZXRWaWV3U2VsZWN0aW9ucygpO1xuXG5cdFx0Ly8gTGV0IHRoZSB2aWV3IGdldCB0aGUgZXZlbnQgZmlyc3QuXG5cdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IFZpZXdDdXJzb3JTdGF0ZUNoYW5nZWRFdmVudCh2aWV3U2VsZWN0aW9ucywgc2VsZWN0aW9ucywgcmVhc29uKSk7XG5cblx0XHQvLyBPbmx5IGFmdGVyIHRoZSB2aWV3IGhhcyBiZWVuIG5vdGlmaWVkLCBsZXQgdGhlIHJlc3Qgb2YgdGhlIHdvcmxkIGtub3cuLi5cblx0XHRpZiAoIW9sZFN0YXRlXG5cdFx0XHR8fCBvbGRTdGF0ZS5jdXJzb3JTdGF0ZS5sZW5ndGggIT09IG5ld1N0YXRlLmN1cnNvclN0YXRlLmxlbmd0aFxuXHRcdFx0fHwgbmV3U3RhdGUuY3Vyc29yU3RhdGUuc29tZSgobmV3Q3Vyc29yU3RhdGUsIGkpID0+ICFuZXdDdXJzb3JTdGF0ZS5tb2RlbFN0YXRlLmVxdWFscyhvbGRTdGF0ZS5jdXJzb3JTdGF0ZVtpXS5tb2RlbFN0YXRlKSlcblx0XHQpIHtcblx0XHRcdGNvbnN0IG9sZFNlbGVjdGlvbnMgPSBvbGRTdGF0ZSA/IG9sZFN0YXRlLmN1cnNvclN0YXRlLm1hcChzID0+IHMubW9kZWxTdGF0ZS5zZWxlY3Rpb24pIDogbnVsbDtcblx0XHRcdGNvbnN0IG9sZE1vZGVsVmVyc2lvbklkID0gb2xkU3RhdGUgPyBvbGRTdGF0ZS5tb2RlbFZlcnNpb25JZCA6IDA7XG5cdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdE91dGdvaW5nRXZlbnQobmV3IEN1cnNvclN0YXRlQ2hhbmdlZEV2ZW50KG9sZFNlbGVjdGlvbnMsIHNlbGVjdGlvbnMsIG9sZE1vZGVsVmVyc2lvbklkLCBuZXdTdGF0ZS5tb2RlbFZlcnNpb25JZCwgc291cmNlIHx8ICdrZXlib2FyZCcsIHJlYXNvbiwgcmVhY2hlZE1heEN1cnNvckNvdW50KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyAtLS0tLSBoYW5kbGVycyBiZXlvbmQgdGhpcyBwb2ludFxuXG5cdHByaXZhdGUgX2ZpbmRBdXRvQ2xvc2luZ1BhaXJzKGVkaXRzOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSk6IFtudW1iZXIsIG51bWJlcl1bXSB8IG51bGwge1xuXHRcdGlmICghZWRpdHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRpY2VzOiBbbnVtYmVyLCBudW1iZXJdW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZWRpdHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGVkaXQgPSBlZGl0c1tpXTtcblx0XHRcdGlmICghZWRpdC50ZXh0IHx8IGVkaXQudGV4dC5pbmRleE9mKCdcXG4nKSA+PSAwKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtID0gZWRpdC50ZXh0Lm1hdGNoKC8oWylcXF19PidcImBdKShbXilcXF19PidcImBdKikkLyk7XG5cdFx0XHRpZiAoIW0pIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjbG9zZUNoYXIgPSBtWzFdO1xuXG5cdFx0XHRjb25zdCBhdXRvQ2xvc2luZ1BhaXJzQ2FuZGlkYXRlcyA9IHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcuYXV0b0Nsb3NpbmdQYWlycy5hdXRvQ2xvc2luZ1BhaXJzQ2xvc2VTaW5nbGVDaGFyLmdldChjbG9zZUNoYXIpO1xuXHRcdFx0aWYgKCFhdXRvQ2xvc2luZ1BhaXJzQ2FuZGlkYXRlcyB8fCBhdXRvQ2xvc2luZ1BhaXJzQ2FuZGlkYXRlcy5sZW5ndGggIT09IDEpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9wZW5DaGFyID0gYXV0b0Nsb3NpbmdQYWlyc0NhbmRpZGF0ZXNbMF0ub3Blbjtcblx0XHRcdGNvbnN0IGNsb3NlQ2hhckluZGV4ID0gZWRpdC50ZXh0Lmxlbmd0aCAtIG1bMl0ubGVuZ3RoIC0gMTtcblx0XHRcdGNvbnN0IG9wZW5DaGFySW5kZXggPSBlZGl0LnRleHQubGFzdEluZGV4T2Yob3BlbkNoYXIsIGNsb3NlQ2hhckluZGV4IC0gMSk7XG5cdFx0XHRpZiAob3BlbkNoYXJJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGluZGljZXMucHVzaChbb3BlbkNoYXJJbmRleCwgY2xvc2VDaGFySW5kZXhdKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kaWNlcztcblx0fVxuXG5cdHB1YmxpYyBleGVjdXRlRWRpdHMoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgZWRpdHM6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBjdXJzb3JTdGF0ZUNvbXB1dGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlciwgcmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlKTogdm9pZCB7XG5cdFx0bGV0IGF1dG9DbG9zaW5nSW5kaWNlczogW251bWJlciwgbnVtYmVyXVtdIHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKHNvdXJjZSA9PT0gJ3NuaXBwZXQnKSB7XG5cdFx0XHRhdXRvQ2xvc2luZ0luZGljZXMgPSB0aGlzLl9maW5kQXV0b0Nsb3NpbmdQYWlycyhlZGl0cyk7XG5cdFx0fVxuXG5cdFx0aWYgKGF1dG9DbG9zaW5nSW5kaWNlcykge1xuXHRcdFx0ZWRpdHNbMF0uX2lzVHJhY2tlZCA9IHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGF1dG9DbG9zZWRDaGFyYWN0ZXJzUmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdFx0Y29uc3QgYXV0b0Nsb3NlZEVuY2xvc2luZ1JhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl9tb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnModGhpcy5nZXRTZWxlY3Rpb25zKCksIGVkaXRzLCAodW5kb0VkaXRzKSA9PiB7XG5cdFx0XHRpZiAoYXV0b0Nsb3NpbmdJbmRpY2VzKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhdXRvQ2xvc2luZ0luZGljZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBbb3BlbkNoYXJJbm5lckluZGV4LCBjbG9zZUNoYXJJbm5lckluZGV4XSA9IGF1dG9DbG9zaW5nSW5kaWNlc1tpXTtcblx0XHRcdFx0XHRjb25zdCB1bmRvRWRpdCA9IHVuZG9FZGl0c1tpXTtcblx0XHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gdW5kb0VkaXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdGNvbnN0IG9wZW5DaGFySW5kZXggPSB1bmRvRWRpdC5yYW5nZS5zdGFydENvbHVtbiAtIDEgKyBvcGVuQ2hhcklubmVySW5kZXg7XG5cdFx0XHRcdFx0Y29uc3QgY2xvc2VDaGFySW5kZXggPSB1bmRvRWRpdC5yYW5nZS5zdGFydENvbHVtbiAtIDEgKyBjbG9zZUNoYXJJbm5lckluZGV4O1xuXG5cdFx0XHRcdFx0YXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXMucHVzaChuZXcgUmFuZ2UobGluZU51bWJlciwgY2xvc2VDaGFySW5kZXggKyAxLCBsaW5lTnVtYmVyLCBjbG9zZUNoYXJJbmRleCArIDIpKTtcblx0XHRcdFx0XHRhdXRvQ2xvc2VkRW5jbG9zaW5nUmFuZ2VzLnB1c2gobmV3IFJhbmdlKGxpbmVOdW1iZXIsIG9wZW5DaGFySW5kZXggKyAxLCBsaW5lTnVtYmVyLCBjbG9zZUNoYXJJbmRleCArIDIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGN1cnNvclN0YXRlQ29tcHV0ZXIodW5kb0VkaXRzKTtcblx0XHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdC8vIERvbid0IHJlY292ZXIgdGhlIHNlbGVjdGlvbiBmcm9tIG1hcmtlcnMgYmVjYXVzZVxuXHRcdFx0XHQvLyB3ZSBrbm93IHdoYXQgaXQgc2hvdWxkIGJlLlxuXHRcdFx0XHR0aGlzLl9pc0hhbmRsaW5nID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbnM7XG5cdFx0fSwgdW5kZWZpbmVkLCByZWFzb24pO1xuXHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHR0aGlzLl9pc0hhbmRsaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLnNldFNlbGVjdGlvbnMoZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UsIHNlbGVjdGlvbnMsIEN1cnNvckNoYW5nZVJlYXNvbi5Ob3RTZXQpO1xuXHRcdH1cblx0XHRpZiAoYXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fcHVzaEF1dG9DbG9zZWRBY3Rpb24oYXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXMsIGF1dG9DbG9zZWRFbmNsb3NpbmdSYW5nZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2V4ZWN1dGVFZGl0KGNhbGxiYWNrOiAoKSA9PiB2b2lkLCBldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3Rvciwgc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBjdXJzb3JDaGFuZ2VSZWFzb246IEN1cnNvckNoYW5nZVJlYXNvbiA9IEN1cnNvckNoYW5nZVJlYXNvbi5Ob3RTZXQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250ZXh0LmN1cnNvckNvbmZpZy5yZWFkT25seSkge1xuXHRcdFx0Ly8gd2UgY2Fubm90IGVkaXQgd2hlbiByZWFkIG9ubHkuLi5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRTdGF0ZSA9IEN1cnNvck1vZGVsU3RhdGUuZnJvbSh0aGlzLl9tb2RlbCwgdGhpcyk7XG5cdFx0dGhpcy5fY3Vyc29ycy5zdG9wVHJhY2tpbmdTZWxlY3Rpb25zKCk7XG5cdFx0dGhpcy5faXNIYW5kbGluZyA9IHRydWU7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fY3Vyc29ycy5lbnN1cmVWYWxpZFN0YXRlKCk7XG5cdFx0XHRjYWxsYmFjaygpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pc0hhbmRsaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fY3Vyc29ycy5zdGFydFRyYWNraW5nU2VsZWN0aW9ucygpO1xuXHRcdHRoaXMuX3ZhbGlkYXRlQXV0b0Nsb3NlZEFjdGlvbnMoKTtcblx0XHRpZiAodGhpcy5fZW1pdFN0YXRlQ2hhbmdlZElmTmVjZXNzYXJ5KGV2ZW50c0NvbGxlY3Rvciwgc291cmNlLCBjdXJzb3JDaGFuZ2VSZWFzb24sIG9sZFN0YXRlLCBmYWxzZSkpIHtcblx0XHRcdHRoaXMucmV2ZWFsQWxsKGV2ZW50c0NvbGxlY3Rvciwgc291cmNlLCBmYWxzZSwgVmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSwgdHJ1ZSwgZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXV0b0Nsb3NlZENoYXJhY3RlcnMoKTogUmFuZ2VbXSB7XG5cdFx0cmV0dXJuIEF1dG9DbG9zZWRBY3Rpb24uZ2V0QWxsQXV0b0Nsb3NlZENoYXJhY3RlcnModGhpcy5fYXV0b0Nsb3NlZEFjdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIHN0YXJ0Q29tcG9zaXRpb24oZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21wb3NpdGlvblN0YXRlID0gbmV3IENvbXBvc2l0aW9uU3RhdGUodGhpcy5fbW9kZWwsIHRoaXMuZ2V0U2VsZWN0aW9ucygpKTtcblx0fVxuXG5cdHB1YmxpYyBlbmRDb21wb3NpdGlvbihldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3Rvciwgc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlYXNvbiA9IEVkaXRTb3VyY2VzLmN1cnNvcih7IGtpbmQ6ICdjb21wb3NpdGlvbkVuZCcsIGRldGFpbGVkU291cmNlOiBzb3VyY2UgfSk7XG5cblx0XHRjb25zdCBjb21wb3NpdGlvbk91dGNvbWUgPSB0aGlzLl9jb21wb3NpdGlvblN0YXRlID8gdGhpcy5fY29tcG9zaXRpb25TdGF0ZS5kZWR1Y2VPdXRjb21lKHRoaXMuX21vZGVsLCB0aGlzLmdldFNlbGVjdGlvbnMoKSkgOiBudWxsO1xuXHRcdHRoaXMuX2NvbXBvc2l0aW9uU3RhdGUgPSBudWxsO1xuXG5cdFx0dGhpcy5fZXhlY3V0ZUVkaXQoKCkgPT4ge1xuXHRcdFx0aWYgKHNvdXJjZSA9PT0gJ2tleWJvYXJkJykge1xuXHRcdFx0XHQvLyBjb21wb3NpdGlvbiBmaW5pc2hlcywgbGV0J3MgY2hlY2sgaWYgd2UgbmVlZCB0byBhdXRvIGNvbXBsZXRlIGlmIG5lY2Vzc2FyeS5cblx0XHRcdFx0dGhpcy5fZXhlY3V0ZUVkaXRPcGVyYXRpb24oVHlwZU9wZXJhdGlvbnMuY29tcG9zaXRpb25FbmRXaXRoSW50ZXJjZXB0b3JzKHRoaXMuX3ByZXZFZGl0T3BlcmF0aW9uVHlwZSwgdGhpcy5jb250ZXh0LmN1cnNvckNvbmZpZywgdGhpcy5fbW9kZWwsIGNvbXBvc2l0aW9uT3V0Y29tZSwgdGhpcy5nZXRTZWxlY3Rpb25zKCksIHRoaXMuZ2V0QXV0b0Nsb3NlZENoYXJhY3RlcnMoKSksIHJlYXNvbik7XG5cdFx0XHR9XG5cdFx0fSwgZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIHR5cGUoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHRleHQ6IHN0cmluZywgc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlYXNvbiA9IEVkaXRTb3VyY2VzLmN1cnNvcih7IGtpbmQ6ICd0eXBlJywgZGV0YWlsZWRTb3VyY2U6IHNvdXJjZSB9KTtcblxuXHRcdHRoaXMuX2V4ZWN1dGVFZGl0KCgpID0+IHtcblx0XHRcdGlmIChzb3VyY2UgPT09ICdrZXlib2FyZCcpIHtcblx0XHRcdFx0Ly8gSWYgdGhpcyBldmVudCBpcyBjb21pbmcgc3RyYWlnaHQgZnJvbSB0aGUga2V5Ym9hcmQsIGxvb2sgZm9yIGVsZWN0cmljIGNoYXJhY3RlcnMgYW5kIGVudGVyXG5cblx0XHRcdFx0Y29uc3QgbGVuID0gdGV4dC5sZW5ndGg7XG5cdFx0XHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdFx0XHR3aGlsZSAob2Zmc2V0IDwgbGVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhckxlbmd0aCA9IHN0cmluZ3MubmV4dENoYXJMZW5ndGgodGV4dCwgb2Zmc2V0KTtcblx0XHRcdFx0XHRjb25zdCBjaHIgPSB0ZXh0LnN1YnN0cihvZmZzZXQsIGNoYXJMZW5ndGgpO1xuXG5cdFx0XHRcdFx0Ly8gSGVyZSB3ZSBtdXN0IGludGVycHJldCBlYWNoIHR5cGVkIGNoYXJhY3RlciBpbmRpdmlkdWFsbHlcblx0XHRcdFx0XHR0aGlzLl9leGVjdXRlRWRpdE9wZXJhdGlvbihUeXBlT3BlcmF0aW9ucy50eXBlV2l0aEludGVyY2VwdG9ycyghIXRoaXMuX2NvbXBvc2l0aW9uU3RhdGUsIHRoaXMuX3ByZXZFZGl0T3BlcmF0aW9uVHlwZSwgdGhpcy5jb250ZXh0LmN1cnNvckNvbmZpZywgdGhpcy5fbW9kZWwsIHRoaXMuZ2V0U2VsZWN0aW9ucygpLCB0aGlzLmdldEF1dG9DbG9zZWRDaGFyYWN0ZXJzKCksIGNociksIHJlYXNvbik7XG5cblx0XHRcdFx0XHRvZmZzZXQgKz0gY2hhckxlbmd0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9leGVjdXRlRWRpdE9wZXJhdGlvbihUeXBlT3BlcmF0aW9ucy50eXBlV2l0aG91dEludGVyY2VwdG9ycyh0aGlzLl9wcmV2RWRpdE9wZXJhdGlvblR5cGUsIHRoaXMuY29udGV4dC5jdXJzb3JDb25maWcsIHRoaXMuX21vZGVsLCB0aGlzLmdldFNlbGVjdGlvbnMoKSwgdGV4dCksIHJlYXNvbik7XG5cdFx0XHR9XG5cdFx0fSwgZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIGNvbXBvc2l0aW9uVHlwZShldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvciwgdGV4dDogc3RyaW5nLCByZXBsYWNlUHJldkNoYXJDbnQ6IG51bWJlciwgcmVwbGFjZU5leHRDaGFyQ250OiBudW1iZXIsIHBvc2l0aW9uRGVsdGE6IG51bWJlciwgc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlYXNvbiA9IEVkaXRTb3VyY2VzLmN1cnNvcih7IGtpbmQ6ICdjb21wb3NpdGlvblR5cGUnLCBkZXRhaWxlZFNvdXJjZTogc291cmNlIH0pO1xuXG5cdFx0aWYgKHRleHQubGVuZ3RoID09PSAwICYmIHJlcGxhY2VQcmV2Q2hhckNudCA9PT0gMCAmJiByZXBsYWNlTmV4dENoYXJDbnQgPT09IDApIHtcblx0XHRcdC8vIHRoaXMgZWRpdCBpcyBhIG5vLW9wXG5cdFx0XHRpZiAocG9zaXRpb25EZWx0YSAhPT0gMCkge1xuXHRcdFx0XHQvLyBidXQgaXQgc3RpbGwgd2FudHMgdG8gbW92ZSB0aGUgY3Vyc29yXG5cdFx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvbnMgPSB0aGlzLmdldFNlbGVjdGlvbnMoKS5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiArIHBvc2l0aW9uRGVsdGEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiArIHBvc2l0aW9uRGVsdGEpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5zZXRTZWxlY3Rpb25zKGV2ZW50c0NvbGxlY3Rvciwgc291cmNlLCBuZXdTZWxlY3Rpb25zLCBDdXJzb3JDaGFuZ2VSZWFzb24uTm90U2V0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZXhlY3V0ZUVkaXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZXhlY3V0ZUVkaXRPcGVyYXRpb24oVHlwZU9wZXJhdGlvbnMuY29tcG9zaXRpb25UeXBlKHRoaXMuX3ByZXZFZGl0T3BlcmF0aW9uVHlwZSwgdGhpcy5jb250ZXh0LmN1cnNvckNvbmZpZywgdGhpcy5fbW9kZWwsIHRoaXMuZ2V0U2VsZWN0aW9ucygpLCB0ZXh0LCByZXBsYWNlUHJldkNoYXJDbnQsIHJlcGxhY2VOZXh0Q2hhckNudCwgcG9zaXRpb25EZWx0YSksIHJlYXNvbik7XG5cdFx0fSwgZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIHBhc3RlKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCB0ZXh0OiBzdHJpbmcsIHBhc3RlT25OZXdMaW5lOiBib29sZWFuLCBtdWx0aWN1cnNvclRleHQ/OiBzdHJpbmdbXSB8IG51bGwgfCB1bmRlZmluZWQsIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZWFzb24gPSBFZGl0U291cmNlcy5jdXJzb3IoeyBraW5kOiAncGFzdGUnLCBkZXRhaWxlZFNvdXJjZTogc291cmNlIH0pO1xuXG5cdFx0dGhpcy5fZXhlY3V0ZUVkaXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZXhlY3V0ZUVkaXRPcGVyYXRpb24oVHlwZU9wZXJhdGlvbnMucGFzdGUodGhpcy5jb250ZXh0LmN1cnNvckNvbmZpZywgdGhpcy5fbW9kZWwsIHRoaXMuZ2V0U2VsZWN0aW9ucygpLCB0ZXh0LCBwYXN0ZU9uTmV3TGluZSwgbXVsdGljdXJzb3JUZXh0IHx8IFtdKSwgcmVhc29uKTtcblx0XHR9LCBldmVudHNDb2xsZWN0b3IsIHNvdXJjZSwgQ3Vyc29yQ2hhbmdlUmVhc29uLlBhc3RlKTtcblx0fVxuXG5cdHB1YmxpYyBjdXQoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZWFzb24gPSBFZGl0U291cmNlcy5jdXJzb3IoeyBraW5kOiAnY3V0JywgZGV0YWlsZWRTb3VyY2U6IHNvdXJjZSB9KTtcblx0XHR0aGlzLl9leGVjdXRlRWRpdCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9leGVjdXRlRWRpdE9wZXJhdGlvbihEZWxldGVPcGVyYXRpb25zLmN1dCh0aGlzLmNvbnRleHQuY3Vyc29yQ29uZmlnLCB0aGlzLl9tb2RlbCwgdGhpcy5nZXRTZWxlY3Rpb25zKCkpLCByZWFzb24pO1xuXHRcdH0sIGV2ZW50c0NvbGxlY3Rvciwgc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBleGVjdXRlQ29tbWFuZChldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvciwgY29tbWFuZDogZWRpdG9yQ29tbW9uLklDb21tYW5kLCBzb3VyY2U/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhc29uID0gRWRpdFNvdXJjZXMuY3Vyc29yKHsga2luZDogJ2V4ZWN1dGVDb21tYW5kJywgZGV0YWlsZWRTb3VyY2U6IHNvdXJjZSB9KTtcblxuXHRcdHRoaXMuX2V4ZWN1dGVFZGl0KCgpID0+IHtcblx0XHRcdHRoaXMuX2N1cnNvcnMua2lsbFNlY29uZGFyeUN1cnNvcnMoKTtcblxuXHRcdFx0dGhpcy5fZXhlY3V0ZUVkaXRPcGVyYXRpb24obmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuT3RoZXIsIFtjb21tYW5kXSwge1xuXHRcdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlOiBmYWxzZSxcblx0XHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyOiBmYWxzZVxuXHRcdFx0fSksIHJlYXNvbik7XG5cdFx0fSwgZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIGV4ZWN1dGVDb21tYW5kcyhldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvciwgY29tbWFuZHM6IGVkaXRvckNvbW1vbi5JQ29tbWFuZFtdLCBzb3VyY2U/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVhc29uID0gRWRpdFNvdXJjZXMuY3Vyc29yKHsga2luZDogJ2V4ZWN1dGVDb21tYW5kcycsIGRldGFpbGVkU291cmNlOiBzb3VyY2UgfSk7XG5cblx0XHR0aGlzLl9leGVjdXRlRWRpdCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9leGVjdXRlRWRpdE9wZXJhdGlvbihuZXcgRWRpdE9wZXJhdGlvblJlc3VsdChFZGl0T3BlcmF0aW9uVHlwZS5PdGhlciwgY29tbWFuZHMsIHtcblx0XHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogZmFsc2UsXG5cdFx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2Vcblx0XHRcdH0pLCByZWFzb24pO1xuXHRcdH0sIGV2ZW50c0NvbGxlY3Rvciwgc291cmNlKTtcblx0fVxufVxuXG4vKipcbiAqIEEgc25hcHNob3Qgb2YgdGhlIGN1cnNvciBhbmQgdGhlIG1vZGVsIHN0YXRlXG4gKi9cbmNsYXNzIEN1cnNvck1vZGVsU3RhdGUge1xuXHRwdWJsaWMgc3RhdGljIGZyb20obW9kZWw6IElUZXh0TW9kZWwsIGN1cnNvcjogQ3Vyc29yc0NvbnRyb2xsZXIpOiBDdXJzb3JNb2RlbFN0YXRlIHtcblx0XHRyZXR1cm4gbmV3IEN1cnNvck1vZGVsU3RhdGUobW9kZWwuZ2V0VmVyc2lvbklkKCksIGN1cnNvci5nZXRDdXJzb3JTdGF0ZXMoKSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kZWxWZXJzaW9uSWQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgY3Vyc29yU3RhdGU6IEN1cnNvclN0YXRlW10sXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGVxdWFscyhvdGhlcjogQ3Vyc29yTW9kZWxTdGF0ZSB8IG51bGwpOiBib29sZWFuIHtcblx0XHRpZiAoIW90aGVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1vZGVsVmVyc2lvbklkICE9PSBvdGhlci5tb2RlbFZlcnNpb25JZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jdXJzb3JTdGF0ZS5sZW5ndGggIT09IG90aGVyLmN1cnNvclN0YXRlLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5jdXJzb3JTdGF0ZS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKCF0aGlzLmN1cnNvclN0YXRlW2ldLmVxdWFscyhvdGhlci5jdXJzb3JTdGF0ZVtpXSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBBdXRvQ2xvc2VkQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldEFsbEF1dG9DbG9zZWRDaGFyYWN0ZXJzKGF1dG9DbG9zZWRBY3Rpb25zOiBBdXRvQ2xvc2VkQWN0aW9uW10pOiBSYW5nZVtdIHtcblx0XHRsZXQgYXV0b0Nsb3NlZENoYXJhY3RlcnM6IFJhbmdlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGF1dG9DbG9zZWRBY3Rpb24gb2YgYXV0b0Nsb3NlZEFjdGlvbnMpIHtcblx0XHRcdGF1dG9DbG9zZWRDaGFyYWN0ZXJzID0gYXV0b0Nsb3NlZENoYXJhY3RlcnMuY29uY2F0KGF1dG9DbG9zZWRBY3Rpb24uZ2V0QXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXMoKSk7XG5cdFx0fVxuXHRcdHJldHVybiBhdXRvQ2xvc2VkQ2hhcmFjdGVycztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsO1xuXG5cdHByaXZhdGUgX2F1dG9DbG9zZWRDaGFyYWN0ZXJzRGVjb3JhdGlvbnM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIF9hdXRvQ2xvc2VkRW5jbG9zaW5nRGVjb3JhdGlvbnM6IHN0cmluZ1tdO1xuXG5cdGNvbnN0cnVjdG9yKG1vZGVsOiBJVGV4dE1vZGVsLCBhdXRvQ2xvc2VkQ2hhcmFjdGVyc0RlY29yYXRpb25zOiBzdHJpbmdbXSwgYXV0b0Nsb3NlZEVuY2xvc2luZ0RlY29yYXRpb25zOiBzdHJpbmdbXSkge1xuXHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fYXV0b0Nsb3NlZENoYXJhY3RlcnNEZWNvcmF0aW9ucyA9IGF1dG9DbG9zZWRDaGFyYWN0ZXJzRGVjb3JhdGlvbnM7XG5cdFx0dGhpcy5fYXV0b0Nsb3NlZEVuY2xvc2luZ0RlY29yYXRpb25zID0gYXV0b0Nsb3NlZEVuY2xvc2luZ0RlY29yYXRpb25zO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fYXV0b0Nsb3NlZENoYXJhY3RlcnNEZWNvcmF0aW9ucyA9IHRoaXMuX21vZGVsLmRlbHRhRGVjb3JhdGlvbnModGhpcy5fYXV0b0Nsb3NlZENoYXJhY3RlcnNEZWNvcmF0aW9ucywgW10pO1xuXHRcdHRoaXMuX2F1dG9DbG9zZWRFbmNsb3NpbmdEZWNvcmF0aW9ucyA9IHRoaXMuX21vZGVsLmRlbHRhRGVjb3JhdGlvbnModGhpcy5fYXV0b0Nsb3NlZEVuY2xvc2luZ0RlY29yYXRpb25zLCBbXSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXV0b0Nsb3NlZENoYXJhY3RlcnNSYW5nZXMoKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBSYW5nZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9hdXRvQ2xvc2VkQ2hhcmFjdGVyc0RlY29yYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uUmFuZ2UgPSB0aGlzLl9tb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UodGhpcy5fYXV0b0Nsb3NlZENoYXJhY3RlcnNEZWNvcmF0aW9uc1tpXSk7XG5cdFx0XHRpZiAoZGVjb3JhdGlvblJhbmdlKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGRlY29yYXRpb25SYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgaXNWYWxpZChzZWxlY3Rpb25zOiBSYW5nZVtdKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW5jbG9zaW5nUmFuZ2VzOiBSYW5nZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9hdXRvQ2xvc2VkRW5jbG9zaW5nRGVjb3JhdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGRlY29yYXRpb25SYW5nZSA9IHRoaXMuX21vZGVsLmdldERlY29yYXRpb25SYW5nZSh0aGlzLl9hdXRvQ2xvc2VkRW5jbG9zaW5nRGVjb3JhdGlvbnNbaV0pO1xuXHRcdFx0aWYgKGRlY29yYXRpb25SYW5nZSkge1xuXHRcdFx0XHRlbmNsb3NpbmdSYW5nZXMucHVzaChkZWNvcmF0aW9uUmFuZ2UpO1xuXHRcdFx0XHRpZiAoZGVjb3JhdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gZGVjb3JhdGlvblJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHQvLyBTdG9wIHRyYWNraW5nIGlmIHRoZSByYW5nZSBiZWNvbWVzIG11bHRpbGluZS4uLlxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRlbmNsb3NpbmdSYW5nZXMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXG5cdFx0c2VsZWN0aW9ucy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlbGVjdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChpID49IGVuY2xvc2luZ1Jhbmdlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFlbmNsb3NpbmdSYW5nZXNbaV0uc3RyaWN0Q29udGFpbnNSYW5nZShzZWxlY3Rpb25zW2ldKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElFeGVjQ29udGV4dCB7XG5cdHJlYWRvbmx5IG1vZGVsOiBJVGV4dE1vZGVsO1xuXHRyZWFkb25seSBzZWxlY3Rpb25zQmVmb3JlOiBTZWxlY3Rpb25bXTtcblx0cmVhZG9ubHkgdHJhY2tlZFJhbmdlczogc3RyaW5nW107XG5cdHJlYWRvbmx5IHRyYWNrZWRSYW5nZXNEaXJlY3Rpb246IFNlbGVjdGlvbkRpcmVjdGlvbltdO1xufVxuXG5pbnRlcmZhY2UgSUNvbW1hbmREYXRhIHtcblx0b3BlcmF0aW9uczogSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW107XG5cdGhhZFRyYWNrZWRFZGl0T3BlcmF0aW9uOiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSUNvbW1hbmRzRGF0YSB7XG5cdG9wZXJhdGlvbnM6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdO1xuXHRoYWRUcmFja2VkRWRpdE9wZXJhdGlvbjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbW1hbmRFeGVjdXRvciB7XG5cblx0cHVibGljIHN0YXRpYyBleGVjdXRlQ29tbWFuZHMobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnNCZWZvcmU6IFNlbGVjdGlvbltdLCBjb21tYW5kczogKGVkaXRvckNvbW1vbi5JQ29tbWFuZCB8IG51bGwpW10sIGVkaXRSZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2UgPSBFZGl0U291cmNlcy51bmtub3duKHsgbmFtZTogJ2V4ZWN1dGVDb21tYW5kcycgfSkpOiBTZWxlY3Rpb25bXSB8IG51bGwge1xuXG5cdFx0Y29uc3QgY3R4OiBJRXhlY0NvbnRleHQgPSB7XG5cdFx0XHRtb2RlbDogbW9kZWwsXG5cdFx0XHRzZWxlY3Rpb25zQmVmb3JlOiBzZWxlY3Rpb25zQmVmb3JlLFxuXHRcdFx0dHJhY2tlZFJhbmdlczogW10sXG5cdFx0XHR0cmFja2VkUmFuZ2VzRGlyZWN0aW9uOiBbXVxuXHRcdH07XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9pbm5lckV4ZWN1dGVDb21tYW5kcyhjdHgsIGNvbW1hbmRzLCBlZGl0UmVhc29uKTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjdHgudHJhY2tlZFJhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y3R4Lm1vZGVsLl9zZXRUcmFja2VkUmFuZ2UoY3R4LnRyYWNrZWRSYW5nZXNbaV0sIG51bGwsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pbm5lckV4ZWN1dGVDb21tYW5kcyhjdHg6IElFeGVjQ29udGV4dCwgY29tbWFuZHM6IChlZGl0b3JDb21tb24uSUNvbW1hbmQgfCBudWxsKVtdLCBlZGl0UmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlKTogU2VsZWN0aW9uW10gfCBudWxsIHtcblxuXHRcdGlmICh0aGlzLl9hcnJheUlzRW1wdHkoY29tbWFuZHMpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kc0RhdGEgPSB0aGlzLl9nZXRFZGl0T3BlcmF0aW9ucyhjdHgsIGNvbW1hbmRzKTtcblx0XHRpZiAoY29tbWFuZHNEYXRhLm9wZXJhdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByYXdPcGVyYXRpb25zID0gY29tbWFuZHNEYXRhLm9wZXJhdGlvbnM7XG5cblx0XHRjb25zdCBsb3NlckN1cnNvcnNNYXAgPSB0aGlzLl9nZXRMb3NlckN1cnNvck1hcChyYXdPcGVyYXRpb25zKTtcblx0XHRpZiAobG9zZXJDdXJzb3JzTWFwLmhhc093blByb3BlcnR5KCcwJykpIHtcblx0XHRcdC8vIFRoZXNlIGNvbW1hbmRzIGFyZSB2ZXJ5IG1lc3NlZCB1cFxuXHRcdFx0Y29uc29sZS53YXJuKCdJZ25vcmluZyBjb21tYW5kcycpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIG9wZXJhdGlvbnMgYmVsb25naW5nIHRvIGxvc2luZyBjdXJzb3JzXG5cdFx0Y29uc3QgZmlsdGVyZWRPcGVyYXRpb25zOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYXdPcGVyYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoIWxvc2VyQ3Vyc29yc01hcC5oYXNPd25Qcm9wZXJ0eShyYXdPcGVyYXRpb25zW2ldLmlkZW50aWZpZXIhLm1ham9yLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdGZpbHRlcmVkT3BlcmF0aW9ucy5wdXNoKHJhd09wZXJhdGlvbnNbaV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRPRE9AQWxleDogZmluZCBhIGJldHRlciB3YXkgdG8gZG8gdGhpcy5cblx0XHQvLyBnaXZlIHRoZSBoaW50IHRoYXQgZWRpdCBvcGVyYXRpb25zIGFyZSB0cmFja2VkIHRvIHRoZSBtb2RlbFxuXHRcdGlmIChjb21tYW5kc0RhdGEuaGFkVHJhY2tlZEVkaXRPcGVyYXRpb24gJiYgZmlsdGVyZWRPcGVyYXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGZpbHRlcmVkT3BlcmF0aW9uc1swXS5faXNUcmFja2VkID0gdHJ1ZTtcblx0XHR9XG5cdFx0bGV0IHNlbGVjdGlvbnNBZnRlciA9IGN0eC5tb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoY3R4LnNlbGVjdGlvbnNCZWZvcmUsIGZpbHRlcmVkT3BlcmF0aW9ucywgKGludmVyc2VFZGl0T3BlcmF0aW9uczogSVZhbGlkRWRpdE9wZXJhdGlvbltdKTogU2VsZWN0aW9uW10gPT4ge1xuXHRcdFx0Y29uc3QgZ3JvdXBlZEludmVyc2VFZGl0T3BlcmF0aW9uczogSVZhbGlkRWRpdE9wZXJhdGlvbltdW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY3R4LnNlbGVjdGlvbnNCZWZvcmUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Z3JvdXBlZEludmVyc2VFZGl0T3BlcmF0aW9uc1tpXSA9IFtdO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBvcCBvZiBpbnZlcnNlRWRpdE9wZXJhdGlvbnMpIHtcblx0XHRcdFx0aWYgKCFvcC5pZGVudGlmaWVyKSB7XG5cdFx0XHRcdFx0Ly8gcGVyaGFwcyBhdXRvIHdoaXRlc3BhY2UgdHJpbSBlZGl0c1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGdyb3VwZWRJbnZlcnNlRWRpdE9wZXJhdGlvbnNbb3AuaWRlbnRpZmllci5tYWpvcl0ucHVzaChvcCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtaW5vckJhc2VkU29ydGVyID0gKGE6IElWYWxpZEVkaXRPcGVyYXRpb24sIGI6IElWYWxpZEVkaXRPcGVyYXRpb24pID0+IHtcblx0XHRcdFx0cmV0dXJuIGEuaWRlbnRpZmllciEubWlub3IgLSBiLmlkZW50aWZpZXIhLm1pbm9yO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGN1cnNvclNlbGVjdGlvbnM6IFNlbGVjdGlvbltdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5zZWxlY3Rpb25zQmVmb3JlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmIChncm91cGVkSW52ZXJzZUVkaXRPcGVyYXRpb25zW2ldLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRncm91cGVkSW52ZXJzZUVkaXRPcGVyYXRpb25zW2ldLnNvcnQobWlub3JCYXNlZFNvcnRlcik7XG5cdFx0XHRcdFx0Y3Vyc29yU2VsZWN0aW9uc1tpXSA9IGNvbW1hbmRzW2ldIS5jb21wdXRlQ3Vyc29yU3RhdGUoY3R4Lm1vZGVsLCB7XG5cdFx0XHRcdFx0XHRnZXRJbnZlcnNlRWRpdE9wZXJhdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGdyb3VwZWRJbnZlcnNlRWRpdE9wZXJhdGlvbnNbaV07XG5cdFx0XHRcdFx0XHR9LFxuXG5cdFx0XHRcdFx0XHRnZXRUcmFja2VkU2VsZWN0aW9uOiAoaWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpZHggPSBwYXJzZUludChpZCwgMTApO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByYW5nZSA9IGN0eC5tb2RlbC5fZ2V0VHJhY2tlZFJhbmdlKGN0eC50cmFja2VkUmFuZ2VzW2lkeF0pITtcblx0XHRcdFx0XHRcdFx0aWYgKGN0eC50cmFja2VkUmFuZ2VzRGlyZWN0aW9uW2lkeF0gPT09IFNlbGVjdGlvbkRpcmVjdGlvbi5MVFIpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbiwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3Vyc29yU2VsZWN0aW9uc1tpXSA9IGN0eC5zZWxlY3Rpb25zQmVmb3JlW2ldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY3Vyc29yU2VsZWN0aW9ucztcblx0XHR9LCB1bmRlZmluZWQsIGVkaXRSZWFzb24pO1xuXHRcdGlmICghc2VsZWN0aW9uc0FmdGVyKSB7XG5cdFx0XHRzZWxlY3Rpb25zQWZ0ZXIgPSBjdHguc2VsZWN0aW9uc0JlZm9yZTtcblx0XHR9XG5cblx0XHQvLyBFeHRyYWN0IGxvc2luZyBjdXJzb3JzXG5cdFx0Y29uc3QgbG9zaW5nQ3Vyc29yczogbnVtYmVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxvc2luZ0N1cnNvckluZGV4IGluIGxvc2VyQ3Vyc29yc01hcCkge1xuXHRcdFx0aWYgKGxvc2VyQ3Vyc29yc01hcC5oYXNPd25Qcm9wZXJ0eShsb3NpbmdDdXJzb3JJbmRleCkpIHtcblx0XHRcdFx0bG9zaW5nQ3Vyc29ycy5wdXNoKHBhcnNlSW50KGxvc2luZ0N1cnNvckluZGV4LCAxMCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNvcnQgbG9zaW5nIGN1cnNvcnMgZGVzY2VuZGluZ1xuXHRcdGxvc2luZ0N1cnNvcnMuc29ydCgoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuXHRcdFx0cmV0dXJuIGIgLSBhO1xuXHRcdH0pO1xuXG5cdFx0Ly8gUmVtb3ZlIGxvc2luZyBjdXJzb3JzXG5cdFx0Zm9yIChjb25zdCBsb3NpbmdDdXJzb3Igb2YgbG9zaW5nQ3Vyc29ycykge1xuXHRcdFx0c2VsZWN0aW9uc0FmdGVyLnNwbGljZShsb3NpbmdDdXJzb3IsIDEpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzZWxlY3Rpb25zQWZ0ZXI7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfYXJyYXlJc0VtcHR5KGNvbW1hbmRzOiAoZWRpdG9yQ29tbW9uLklDb21tYW5kIHwgbnVsbClbXSk6IGJvb2xlYW4ge1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjb21tYW5kcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKGNvbW1hbmRzW2ldKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0RWRpdE9wZXJhdGlvbnMoY3R4OiBJRXhlY0NvbnRleHQsIGNvbW1hbmRzOiAoZWRpdG9yQ29tbW9uLklDb21tYW5kIHwgbnVsbClbXSk6IElDb21tYW5kc0RhdGEge1xuXHRcdGxldCBvcGVyYXRpb25zOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGxldCBoYWRUcmFja2VkRWRpdE9wZXJhdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGNvbW1hbmRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gY29tbWFuZHNbaV07XG5cdFx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0XHRjb25zdCByID0gdGhpcy5fZ2V0RWRpdE9wZXJhdGlvbnNGcm9tQ29tbWFuZChjdHgsIGksIGNvbW1hbmQpO1xuXHRcdFx0XHRvcGVyYXRpb25zID0gb3BlcmF0aW9ucy5jb25jYXQoci5vcGVyYXRpb25zKTtcblx0XHRcdFx0aGFkVHJhY2tlZEVkaXRPcGVyYXRpb24gPSBoYWRUcmFja2VkRWRpdE9wZXJhdGlvbiB8fCByLmhhZFRyYWNrZWRFZGl0T3BlcmF0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3BlcmF0aW9uczogb3BlcmF0aW9ucyxcblx0XHRcdGhhZFRyYWNrZWRFZGl0T3BlcmF0aW9uOiBoYWRUcmFja2VkRWRpdE9wZXJhdGlvblxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0RWRpdE9wZXJhdGlvbnNGcm9tQ29tbWFuZChjdHg6IElFeGVjQ29udGV4dCwgbWFqb3JJZGVudGlmaWVyOiBudW1iZXIsIGNvbW1hbmQ6IGVkaXRvckNvbW1vbi5JQ29tbWFuZCk6IElDb21tYW5kRGF0YSB7XG5cdFx0Ly8gVGhpcyBtZXRob2QgYWN0cyBhcyBhIHRyYW5zYWN0aW9uLCBpZiB0aGUgY29tbWFuZCBmYWlsc1xuXHRcdC8vIGV2ZXJ5dGhpbmcgaXQgaGFzIGRvbmUgaXMgaWdub3JlZFxuXHRcdGNvbnN0IG9wZXJhdGlvbnM6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdID0gW107XG5cdFx0bGV0IG9wZXJhdGlvbk1pbm9yID0gMDtcblxuXHRcdGNvbnN0IGFkZEVkaXRPcGVyYXRpb24gPSAocmFuZ2U6IElSYW5nZSwgdGV4dDogc3RyaW5nIHwgbnVsbCwgZm9yY2VNb3ZlTWFya2VyczogYm9vbGVhbiA9IGZhbHNlKSA9PiB7XG5cdFx0XHRpZiAoUmFuZ2UuaXNFbXB0eShyYW5nZSkgJiYgdGV4dCA9PT0gJycpIHtcblx0XHRcdFx0Ly8gVGhpcyBjb21tYW5kIHdhbnRzIHRvIGFkZCBhIG5vLW9wID0+IG5vIHRoYW5rIHlvdVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRvcGVyYXRpb25zLnB1c2goe1xuXHRcdFx0XHRpZGVudGlmaWVyOiB7XG5cdFx0XHRcdFx0bWFqb3I6IG1ham9ySWRlbnRpZmllcixcblx0XHRcdFx0XHRtaW5vcjogb3BlcmF0aW9uTWlub3IrK1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyYW5nZTogcmFuZ2UsXG5cdFx0XHRcdHRleHQ6IHRleHQsXG5cdFx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZvcmNlTW92ZU1hcmtlcnMsXG5cdFx0XHRcdGlzQXV0b1doaXRlc3BhY2VFZGl0OiBjb21tYW5kLmluc2VydHNBdXRvV2hpdGVzcGFjZVxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGxldCBoYWRUcmFja2VkRWRpdE9wZXJhdGlvbiA9IGZhbHNlO1xuXHRcdGNvbnN0IGFkZFRyYWNrZWRFZGl0T3BlcmF0aW9uID0gKHNlbGVjdGlvbjogSVJhbmdlLCB0ZXh0OiBzdHJpbmcgfCBudWxsLCBmb3JjZU1vdmVNYXJrZXJzPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0aGFkVHJhY2tlZEVkaXRPcGVyYXRpb24gPSB0cnVlO1xuXHRcdFx0YWRkRWRpdE9wZXJhdGlvbihzZWxlY3Rpb24sIHRleHQsIGZvcmNlTW92ZU1hcmtlcnMpO1xuXHRcdH07XG5cblx0XHRjb25zdCB0cmFja1NlbGVjdGlvbiA9IChfc2VsZWN0aW9uOiBJU2VsZWN0aW9uLCB0cmFja1ByZXZpb3VzT25FbXB0eT86IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IFNlbGVjdGlvbi5saWZ0U2VsZWN0aW9uKF9zZWxlY3Rpb24pO1xuXHRcdFx0bGV0IHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3M7XG5cdFx0XHRpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRpZiAodHlwZW9mIHRyYWNrUHJldmlvdXNPbkVtcHR5ID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0XHRpZiAodHJhY2tQcmV2aW91c09uRW1wdHkpIHtcblx0XHRcdFx0XHRcdHN0aWNraW5lc3MgPSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHN0aWNraW5lc3MgPSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gVHJ5IHRvIGxvY2sgaXQgd2l0aCBzdXJyb3VuZGluZyB0ZXh0XG5cdFx0XHRcdFx0Y29uc3QgbWF4TGluZUNvbHVtbiA9IGN0eC5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb24uc3RhcnRDb2x1bW4gPT09IG1heExpbmVDb2x1bW4pIHtcblx0XHRcdFx0XHRcdHN0aWNraW5lc3MgPSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHN0aWNraW5lc3MgPSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHN0aWNraW5lc3MgPSBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbCA9IGN0eC50cmFja2VkUmFuZ2VzLmxlbmd0aDtcblx0XHRcdGNvbnN0IGlkID0gY3R4Lm1vZGVsLl9zZXRUcmFja2VkUmFuZ2UobnVsbCwgc2VsZWN0aW9uLCBzdGlja2luZXNzKTtcblx0XHRcdGN0eC50cmFja2VkUmFuZ2VzW2xdID0gaWQ7XG5cdFx0XHRjdHgudHJhY2tlZFJhbmdlc0RpcmVjdGlvbltsXSA9IHNlbGVjdGlvbi5nZXREaXJlY3Rpb24oKTtcblx0XHRcdHJldHVybiBsLnRvU3RyaW5nKCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGVkaXRPcGVyYXRpb25CdWlsZGVyOiBlZGl0b3JDb21tb24uSUVkaXRPcGVyYXRpb25CdWlsZGVyID0ge1xuXHRcdFx0YWRkRWRpdE9wZXJhdGlvbjogYWRkRWRpdE9wZXJhdGlvbixcblx0XHRcdGFkZFRyYWNrZWRFZGl0T3BlcmF0aW9uOiBhZGRUcmFja2VkRWRpdE9wZXJhdGlvbixcblx0XHRcdHRyYWNrU2VsZWN0aW9uOiB0cmFja1NlbGVjdGlvblxuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29tbWFuZC5nZXRFZGl0T3BlcmF0aW9ucyhjdHgubW9kZWwsIGVkaXRPcGVyYXRpb25CdWlsZGVyKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBUT0RPQEFsZXggdXNlIG5vdGlmaWNhdGlvbiBzZXJ2aWNlIGlmIHRoaXMgc2hvdWxkIGJlIHVzZXIgZmFjaW5nXG5cdFx0XHQvLyBlLmZyaWVuZGx5TWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnY29ycnVwdC5jb21tYW5kcycsIFwiVW5leHBlY3RlZCBleGNlcHRpb24gd2hpbGUgZXhlY3V0aW5nIGNvbW1hbmQuXCIpO1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRvcGVyYXRpb25zOiBbXSxcblx0XHRcdFx0aGFkVHJhY2tlZEVkaXRPcGVyYXRpb246IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRvcGVyYXRpb25zOiBvcGVyYXRpb25zLFxuXHRcdFx0aGFkVHJhY2tlZEVkaXRPcGVyYXRpb246IGhhZFRyYWNrZWRFZGl0T3BlcmF0aW9uXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRMb3NlckN1cnNvck1hcChvcGVyYXRpb25zOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSk6IHsgW2luZGV4OiBzdHJpbmddOiBib29sZWFuIH0ge1xuXHRcdC8vIFRoaXMgaXMgZGVzdHJ1Y3RpdmUgb24gdGhlIGFycmF5XG5cdFx0b3BlcmF0aW9ucyA9IG9wZXJhdGlvbnMuc2xpY2UoMCk7XG5cblx0XHQvLyBTb3J0IG9wZXJhdGlvbnMgd2l0aCBsYXN0IG9uZSBmaXJzdFxuXHRcdG9wZXJhdGlvbnMuc29ydCgoYTogSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uLCBiOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb24pOiBudW1iZXIgPT4ge1xuXHRcdFx0Ly8gTm90ZSB0aGUgbWludXMhXG5cdFx0XHRyZXR1cm4gLShSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdFbmRzKGEucmFuZ2UsIGIucmFuZ2UpKTtcblx0XHR9KTtcblxuXHRcdC8vIE9wZXJhdGlvbnMgY2FuIG5vdCBvdmVybGFwIVxuXHRcdGNvbnN0IGxvc2VyQ3Vyc29yc01hcDogeyBbaW5kZXg6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9O1xuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBvcGVyYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c09wID0gb3BlcmF0aW9uc1tpIC0gMV07XG5cdFx0XHRjb25zdCBjdXJyZW50T3AgPSBvcGVyYXRpb25zW2ldO1xuXG5cdFx0XHRpZiAoUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbihwcmV2aW91c09wLnJhbmdlKS5pc0JlZm9yZShSYW5nZS5nZXRFbmRQb3NpdGlvbihjdXJyZW50T3AucmFuZ2UpKSkge1xuXG5cdFx0XHRcdGxldCBsb3Nlck1ham9yOiBudW1iZXI7XG5cblx0XHRcdFx0aWYgKHByZXZpb3VzT3AuaWRlbnRpZmllciEubWFqb3IgPiBjdXJyZW50T3AuaWRlbnRpZmllciEubWFqb3IpIHtcblx0XHRcdFx0XHQvLyBwcmV2aW91c09wIGxvc2VzIHRoZSBiYXR0bGVcblx0XHRcdFx0XHRsb3Nlck1ham9yID0gcHJldmlvdXNPcC5pZGVudGlmaWVyIS5tYWpvcjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsb3Nlck1ham9yID0gY3VycmVudE9wLmlkZW50aWZpZXIhLm1ham9yO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bG9zZXJDdXJzb3JzTWFwW2xvc2VyTWFqb3IudG9TdHJpbmcoKV0gPSB0cnVlO1xuXG5cdFx0XHRcdGZvciAobGV0IGogPSAwOyBqIDwgb3BlcmF0aW9ucy5sZW5ndGg7IGorKykge1xuXHRcdFx0XHRcdGlmIChvcGVyYXRpb25zW2pdLmlkZW50aWZpZXIhLm1ham9yID09PSBsb3Nlck1ham9yKSB7XG5cdFx0XHRcdFx0XHRvcGVyYXRpb25zLnNwbGljZShqLCAxKTtcblx0XHRcdFx0XHRcdGlmIChqIDwgaSkge1xuXHRcdFx0XHRcdFx0XHRpLS07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRqLS07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGkgPiAwKSB7XG5cdFx0XHRcdFx0aS0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvc2VyQ3Vyc29yc01hcDtcblx0fVxufVxuXG5jbGFzcyBDb21wb3NpdGlvbkxpbmVTdGF0ZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB0ZXh0OiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRTZWxlY3Rpb25PZmZzZXQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZW5kU2VsZWN0aW9uT2Zmc2V0OiBudW1iZXJcblx0KSB7IH1cbn1cblxuY2xhc3MgQ29tcG9zaXRpb25TdGF0ZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWw6IENvbXBvc2l0aW9uTGluZVN0YXRlW10gfCBudWxsO1xuXG5cdHByaXZhdGUgc3RhdGljIF9jYXB0dXJlKHRleHRNb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10pOiBDb21wb3NpdGlvbkxpbmVTdGF0ZVtdIHwgbnVsbCB7XG5cdFx0Y29uc3QgcmVzdWx0OiBDb21wb3NpdGlvbkxpbmVTdGF0ZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgIT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRyZXN1bHQucHVzaChuZXcgQ29tcG9zaXRpb25MaW5lU3RhdGUoXG5cdFx0XHRcdHRleHRNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSxcblx0XHRcdFx0bGluZU51bWJlcixcblx0XHRcdFx0c2VsZWN0aW9uLnN0YXJ0Q29sdW1uIC0gMSxcblx0XHRcdFx0c2VsZWN0aW9uLmVuZENvbHVtbiAtIDFcblx0XHRcdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IodGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSkge1xuXHRcdHRoaXMuX29yaWdpbmFsID0gQ29tcG9zaXRpb25TdGF0ZS5fY2FwdHVyZSh0ZXh0TW9kZWwsIHNlbGVjdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGluc2VydGVkIHRleHQgZHVyaW5nIHRoaXMgY29tcG9zaXRpb24uXG5cdCAqIElmIHRoZSBjb21wb3NpdGlvbiByZXN1bHRlZCBpbiBleGlzdGluZyB0ZXh0IGJlaW5nIGNoYW5nZWQgKGkuZS4gbm90IGEgcHVyZSBpbnNlcnRpb24pIGl0IHJldHVybnMgbnVsbC5cblx0ICovXG5cdGRlZHVjZU91dGNvbWUodGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSk6IENvbXBvc2l0aW9uT3V0Y29tZVtdIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9vcmlnaW5hbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnQgPSBDb21wb3NpdGlvblN0YXRlLl9jYXB0dXJlKHRleHRNb2RlbCwgc2VsZWN0aW9ucyk7XG5cdFx0aWYgKCFjdXJyZW50KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX29yaWdpbmFsLmxlbmd0aCAhPT0gY3VycmVudC5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IENvbXBvc2l0aW9uT3V0Y29tZVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX29yaWdpbmFsLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRyZXN1bHQucHVzaChDb21wb3NpdGlvblN0YXRlLl9kZWR1Y2VPdXRjb21lKHRoaXMuX29yaWdpbmFsW2ldLCBjdXJyZW50W2ldKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZGVkdWNlT3V0Y29tZShvcmlnaW5hbDogQ29tcG9zaXRpb25MaW5lU3RhdGUsIGN1cnJlbnQ6IENvbXBvc2l0aW9uTGluZVN0YXRlKTogQ29tcG9zaXRpb25PdXRjb21lIHtcblx0XHRjb25zdCBjb21tb25QcmVmaXggPSBNYXRoLm1pbihcblx0XHRcdG9yaWdpbmFsLnN0YXJ0U2VsZWN0aW9uT2Zmc2V0LFxuXHRcdFx0Y3VycmVudC5zdGFydFNlbGVjdGlvbk9mZnNldCxcblx0XHRcdHN0cmluZ3MuY29tbW9uUHJlZml4TGVuZ3RoKG9yaWdpbmFsLnRleHQsIGN1cnJlbnQudGV4dClcblx0XHQpO1xuXHRcdGNvbnN0IGNvbW1vblN1ZmZpeCA9IE1hdGgubWluKFxuXHRcdFx0b3JpZ2luYWwudGV4dC5sZW5ndGggLSBvcmlnaW5hbC5lbmRTZWxlY3Rpb25PZmZzZXQsXG5cdFx0XHRjdXJyZW50LnRleHQubGVuZ3RoIC0gY3VycmVudC5lbmRTZWxlY3Rpb25PZmZzZXQsXG5cdFx0XHRzdHJpbmdzLmNvbW1vblN1ZmZpeExlbmd0aChvcmlnaW5hbC50ZXh0LCBjdXJyZW50LnRleHQpXG5cdFx0KTtcblx0XHRjb25zdCBkZWxldGVkVGV4dCA9IG9yaWdpbmFsLnRleHQuc3Vic3RyaW5nKGNvbW1vblByZWZpeCwgb3JpZ2luYWwudGV4dC5sZW5ndGggLSBjb21tb25TdWZmaXgpO1xuXHRcdGNvbnN0IGluc2VydGVkVGV4dFN0YXJ0T2Zmc2V0ID0gY29tbW9uUHJlZml4O1xuXHRcdGNvbnN0IGluc2VydGVkVGV4dEVuZE9mZnNldCA9IGN1cnJlbnQudGV4dC5sZW5ndGggLSBjb21tb25TdWZmaXg7XG5cdFx0Y29uc3QgaW5zZXJ0ZWRUZXh0ID0gY3VycmVudC50ZXh0LnN1YnN0cmluZyhpbnNlcnRlZFRleHRTdGFydE9mZnNldCwgaW5zZXJ0ZWRUZXh0RW5kT2Zmc2V0KTtcblx0XHRjb25zdCBpbnNlcnRlZFRleHRSYW5nZSA9IG5ldyBSYW5nZShjdXJyZW50LmxpbmVOdW1iZXIsIGluc2VydGVkVGV4dFN0YXJ0T2Zmc2V0ICsgMSwgY3VycmVudC5saW5lTnVtYmVyLCBpbnNlcnRlZFRleHRFbmRPZmZzZXQgKyAxKTtcblx0XHRyZXR1cm4gbmV3IENvbXBvc2l0aW9uT3V0Y29tZShcblx0XHRcdGRlbGV0ZWRUZXh0LFxuXHRcdFx0b3JpZ2luYWwuc3RhcnRTZWxlY3Rpb25PZmZzZXQgLSBjb21tb25QcmVmaXgsXG5cdFx0XHRvcmlnaW5hbC5lbmRTZWxlY3Rpb25PZmZzZXQgLSBjb21tb25QcmVmaXgsXG5cdFx0XHRpbnNlcnRlZFRleHQsXG5cdFx0XHRjdXJyZW50LnN0YXJ0U2VsZWN0aW9uT2Zmc2V0IC0gY29tbW9uUHJlZml4LFxuXHRcdFx0Y3VycmVudC5lbmRTZWxlY3Rpb25PZmZzZXQgLSBjb21tb25QcmVmaXgsXG5cdFx0XHRpbnNlcnRlZFRleHRSYW5nZVxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFlBQVksYUFBYTtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUE4QixhQUFhLHFCQUFxQix5QkFBb0Y7QUFDcEosU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0Isc0JBQXNCO0FBQ25ELFNBQVMsc0NBQXNDO0FBRS9DLFNBQVMsYUFBcUI7QUFDOUIsU0FBcUIsV0FBVywwQkFBMEI7QUFDMUQsWUFBWSxrQkFBa0I7QUFDOUIsU0FBcUIsOEJBQWdJO0FBQ3JKLFNBQVMsdUJBQXVCLHFDQUFzRTtBQUN0RyxTQUFTLG9CQUFvQiw2QkFBNkIsbUNBQW1DO0FB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
