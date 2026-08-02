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
import { localize } from "../../../../../../nls.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { EditorConfiguration } from "../../../../../../editor/browser/config/editorConfiguration.js";
import { CoreEditingCommands } from "../../../../../../editor/browser/coreCommands.js";
import { RedoCommand, UndoCommand } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { cursorBlinkingStyleFromString, cursorStyleFromString, TextEditorCursorBlinkingStyle, TextEditorCursorStyle } from "../../../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Selection, SelectionDirection } from "../../../../../../editor/common/core/selection.js";
import { USUAL_WORD_SEPARATORS } from "../../../../../../editor/common/core/wordHelper.js";
import { CommandExecutor, CursorsController } from "../../../../../../editor/common/cursor/cursor.js";
import { DeleteOperations } from "../../../../../../editor/common/cursor/cursorDeleteOperations.js";
import { CursorConfiguration } from "../../../../../../editor/common/cursorCommon.js";
import { CursorChangeReason } from "../../../../../../editor/common/cursorEvents.js";
import { Handler } from "../../../../../../editor/common/editorCommon.js";
import { ILanguageConfigurationService } from "../../../../../../editor/common/languages/languageConfigurationRegistry.js";
import { indentOfLine } from "../../../../../../editor/common/model/textModel.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { ViewModelEventsCollector } from "../../../../../../editor/common/viewModelEventDispatcher.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IUndoRedoService, UndoRedoElementType } from "../../../../../../platform/undoRedo/common/undoRedo.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../common/contributions.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from "../../../common/notebookContextKeys.js";
import { NotebookAction } from "../../controller/coreActions.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { CellEditorOptions } from "../../view/cellParts/cellEditorOptions.js";
import { NotebookFindContrib } from "../find/notebookFindWidget.js";
import { NotebookCellTextModel } from "../../../common/model/notebookCellTextModel.js";
const NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID = "notebook.addFindMatchToSelection";
const NOTEBOOK_SELECT_ALL_FIND_MATCHES_ID = "notebook.selectAllFindMatches";
var NotebookMultiCursorState = /* @__PURE__ */ ((NotebookMultiCursorState2) => {
  NotebookMultiCursorState2[NotebookMultiCursorState2["Idle"] = 0] = "Idle";
  NotebookMultiCursorState2[NotebookMultiCursorState2["Selecting"] = 1] = "Selecting";
  NotebookMultiCursorState2[NotebookMultiCursorState2["Editing"] = 2] = "Editing";
  return NotebookMultiCursorState2;
})(NotebookMultiCursorState || {});
const NOTEBOOK_MULTI_CURSOR_CONTEXT = {
  IsNotebookMultiCursor: new RawContextKey("isNotebookMultiSelect", false),
  NotebookMultiSelectCursorState: new RawContextKey("notebookMultiSelectCursorState", 0 /* Idle */)
};
let NotebookMultiCursorController = class extends Disposable {
  constructor(notebookEditor, contextKeyService, textModelService, languageConfigurationService, accessibilityService, configurationService, undoRedoService) {
    super();
    this.notebookEditor = notebookEditor;
    this.contextKeyService = contextKeyService;
    this.textModelService = textModelService;
    this.languageConfigurationService = languageConfigurationService;
    this.accessibilityService = accessibilityService;
    this.configurationService = configurationService;
    this.undoRedoService = undoRedoService;
    this.word = "";
    this.trackedCells = [];
    this.totalMatchesCount = 0;
    this._onDidChangeAnchorCell = this._register(new Emitter());
    this.onDidChangeAnchorCell = this._onDidChangeAnchorCell.event;
    this.anchorDisposables = this._register(new DisposableStore());
    this.cursorsDisposables = this._register(new DisposableStore());
    this.cursorsControllers = new ResourceMap();
    this.state = 0 /* Idle */;
    this._nbIsMultiSelectSession = NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor.bindTo(this.contextKeyService);
    this._nbMultiSelectState = NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.bindTo(this.contextKeyService);
    this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
    this._register(this.onDidChangeAnchorCell(async () => {
      await this.syncCursorsControllers();
      this.syncAnchorListeners();
    }));
  }
  getState() {
    return this.state;
  }
  syncAnchorListeners() {
    this.anchorDisposables.clear();
    if (!this.anchorCell) {
      throw new Error("Anchor cell is undefined");
    }
    this.anchorDisposables.add(this.anchorCell[1].onWillType((input) => {
      const collector = new ViewModelEventsCollector();
      this.trackedCells.forEach((cell) => {
        const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
        if (!controller) {
          return;
        }
        if (cell.cellViewModel.handle !== this.anchorCell?.[0].handle) {
          controller.type(collector, input, "keyboard");
        }
      });
    }));
    this.anchorDisposables.add(this.anchorCell[1].onDidType(() => {
      this.state = 2 /* Editing */;
      this._nbMultiSelectState.set(2 /* Editing */);
      const anchorController = this.cursorsControllers.get(this.anchorCell[0].uri);
      if (!anchorController) {
        return;
      }
      const activeSelections = this.notebookEditor.activeCodeEditor?.getSelections();
      if (!activeSelections) {
        return;
      }
      anchorController.setSelections(new ViewModelEventsCollector(), "keyboard", activeSelections, CursorChangeReason.Explicit);
      this.trackedCells.forEach((cell) => {
        const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
        if (!controller) {
          return;
        }
        cell.initialSelection = controller.getSelection();
        cell.matchSelections = [];
      });
      this.updateLazyDecorations();
    }));
    this.anchorDisposables.add(this.anchorCell[1].onDidChangeCursorSelection((e) => {
      if (e.source === "mouse") {
        this.resetToIdleState();
        return;
      }
      if (!e.oldSelections || e.reason === CursorChangeReason.NotSet || e.reason === CursorChangeReason.RecoverFromMarkers) {
        return;
      }
      const translation = {
        deltaStartCol: e.selection.startColumn - e.oldSelections[0].startColumn,
        deltaStartLine: e.selection.startLineNumber - e.oldSelections[0].startLineNumber,
        deltaEndCol: e.selection.endColumn - e.oldSelections[0].endColumn,
        deltaEndLine: e.selection.endLineNumber - e.oldSelections[0].endLineNumber
      };
      const translationDir = e.selection.getDirection();
      this.trackedCells.forEach((cell) => {
        const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
        if (!controller) {
          return;
        }
        const newSelections = controller.getSelections().map((selection) => {
          const newStartCol = selection.startColumn + translation.deltaStartCol;
          const newStartLine = selection.startLineNumber + translation.deltaStartLine;
          const newEndCol = selection.endColumn + translation.deltaEndCol;
          const newEndLine = selection.endLineNumber + translation.deltaEndLine;
          return Selection.createWithDirection(newStartLine, newStartCol, newEndLine, newEndCol, translationDir);
        });
        controller.setSelections(new ViewModelEventsCollector(), e.source, newSelections, CursorChangeReason.Explicit);
      });
      this.updateLazyDecorations();
    }));
    this.anchorDisposables.add(this.anchorCell[1].onWillTriggerEditorOperationEvent((e) => {
      this.handleEditorOperationEvent(e);
    }));
    this.anchorDisposables.add(this.anchorCell[1].onDidBlurEditorWidget(() => {
      if (this.state === 1 /* Selecting */ || this.state === 2 /* Editing */) {
        this.resetToIdleState();
      }
    }));
  }
  async syncCursorsControllers() {
    this.cursorsDisposables.clear();
    await Promise.all(this.trackedCells.map(async (cell) => {
      const controller = await this.createCursorController(cell);
      if (!controller) {
        return;
      }
      this.cursorsControllers.set(cell.cellViewModel.uri, controller);
      const selections = cell.matchSelections;
      controller.setSelections(new ViewModelEventsCollector(), void 0, selections, CursorChangeReason.Explicit);
    }));
    this.updateLazyDecorations();
  }
  async createCursorController(cell) {
    const textModelRef = await this.textModelService.createModelReference(cell.cellViewModel.uri);
    const textModel = textModelRef.object.textEditorModel;
    if (!textModel) {
      textModelRef.dispose();
      return void 0;
    }
    this.cursorsDisposables.add(textModelRef);
    const cursorSimpleModel = this.constructCursorSimpleModel(cell.cellViewModel);
    const converter = this.constructCoordinatesConverter();
    const editorConfig = cell.editorConfig;
    const controller = this.cursorsDisposables.add(new CursorsController(
      textModel,
      cursorSimpleModel,
      converter,
      new CursorConfiguration(textModel.getLanguageId(), textModel.getOptions(), editorConfig, this.languageConfigurationService)
    ));
    controller.setSelections(new ViewModelEventsCollector(), void 0, cell.matchSelections, CursorChangeReason.Explicit);
    return controller;
  }
  constructCoordinatesConverter() {
    return {
      convertViewPositionToModelPosition(viewPosition) {
        return viewPosition;
      },
      convertViewRangeToModelRange(viewRange) {
        return viewRange;
      },
      validateViewPosition(viewPosition, expectedModelPosition) {
        return viewPosition;
      },
      validateViewRange(viewRange, expectedModelRange) {
        return viewRange;
      },
      convertModelPositionToViewPosition(modelPosition, affinity, allowZeroLineNumber, belowHiddenRanges) {
        return modelPosition;
      },
      convertModelRangeToViewRange(modelRange, affinity) {
        return modelRange;
      },
      modelPositionIsVisible(modelPosition) {
        return true;
      },
      getModelLineViewLineCount(modelLineNumber) {
        return 1;
      },
      getViewLineNumberOfModelPosition(modelLineNumber, modelColumn) {
        return modelLineNumber;
      }
    };
  }
  constructCursorSimpleModel(cell) {
    return {
      getLineCount() {
        return cell.textBuffer.getLineCount();
      },
      getLineContent(lineNumber) {
        return cell.textBuffer.getLineContent(lineNumber);
      },
      getLineMinColumn(lineNumber) {
        return cell.textBuffer.getLineMinColumn(lineNumber);
      },
      getLineMaxColumn(lineNumber) {
        return cell.textBuffer.getLineMaxColumn(lineNumber);
      },
      getLineFirstNonWhitespaceColumn(lineNumber) {
        return cell.textBuffer.getLineFirstNonWhitespaceColumn(lineNumber);
      },
      getLineLastNonWhitespaceColumn(lineNumber) {
        return cell.textBuffer.getLineLastNonWhitespaceColumn(lineNumber);
      },
      normalizePosition(position, affinity) {
        return position;
      },
      getLineIndentColumn(lineNumber) {
        return indentOfLine(cell.textBuffer.getLineContent(lineNumber)) + 1;
      }
    };
  }
  handleEditorOperationEvent(e) {
    this.trackedCells.forEach((cell) => {
      if (cell.cellViewModel.handle === this.anchorCell?.[0].handle) {
        return;
      }
      const eventsCollector = new ViewModelEventsCollector();
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      this.executeEditorOperation(controller, eventsCollector, e);
    });
  }
  executeEditorOperation(controller, eventsCollector, e) {
    switch (e.handlerId) {
      case Handler.CompositionStart:
        controller.startComposition(eventsCollector);
        break;
      case Handler.CompositionEnd:
        controller.endComposition(eventsCollector, e.source);
        break;
      case Handler.ReplacePreviousChar: {
        const args = e.payload;
        controller.compositionType(eventsCollector, args.text || "", args.replaceCharCnt || 0, 0, 0, e.source);
        break;
      }
      case Handler.CompositionType: {
        const args = e.payload;
        controller.compositionType(eventsCollector, args.text || "", args.replacePrevCharCnt || 0, args.replaceNextCharCnt || 0, args.positionDelta || 0, e.source);
        break;
      }
      case Handler.Paste: {
        const args = e.payload;
        controller.paste(eventsCollector, args.text || "", args.pasteOnNewLine || false, args.multicursorText || null, e.source);
        break;
      }
      case Handler.Cut:
        controller.cut(eventsCollector, e.source);
        break;
    }
  }
  updateViewModelSelections() {
    for (const cell of this.trackedCells) {
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      cell.cellViewModel.setSelections(controller.getSelections());
    }
  }
  updateFinalUndoRedo() {
    const anchorCellModel = this.anchorCell?.[1].getModel();
    if (!anchorCellModel) {
      return;
    }
    const newElementsMap = new ResourceMap();
    const resources = [];
    this.trackedCells.forEach((trackedMatch) => {
      const undoRedoState = trackedMatch.undoRedoHistory;
      if (!undoRedoState) {
        return;
      }
      resources.push(trackedMatch.cellViewModel.uri);
      const currentPastElements = this.undoRedoService.getElements(trackedMatch.cellViewModel.uri).past.slice();
      const oldPastElements = trackedMatch.undoRedoHistory.past.slice();
      const newElements = currentPastElements.slice(oldPastElements.length);
      if (newElements.length === 0) {
        return;
      }
      newElementsMap.set(trackedMatch.cellViewModel.uri, newElements);
      this.undoRedoService.removeElements(trackedMatch.cellViewModel.uri);
      oldPastElements.forEach((element) => {
        this.undoRedoService.pushElement(element);
      });
    });
    this.undoRedoService.pushElement({
      type: UndoRedoElementType.Workspace,
      resources,
      label: "Multi Cursor Edit",
      code: "multiCursorEdit",
      confirmBeforeUndo: false,
      undo: async () => {
        newElementsMap.forEach(async (value) => {
          value.reverse().forEach(async (element) => {
            await element.undo();
          });
        });
      },
      redo: async () => {
        newElementsMap.forEach(async (value) => {
          value.forEach(async (element) => {
            await element.redo();
          });
        });
      }
    });
  }
  resetToIdleState() {
    this.state = 0 /* Idle */;
    this._nbMultiSelectState.set(0 /* Idle */);
    this._nbIsMultiSelectSession.set(false);
    this.updateFinalUndoRedo();
    this.trackedCells.forEach((cell) => {
      this.clearDecorations(cell);
      cell.cellViewModel.setSelections([cell.initialSelection]);
    });
    this.anchorDisposables.clear();
    this.anchorCell = void 0;
    this.cursorsDisposables.clear();
    this.cursorsControllers.clear();
    this.trackedCells = [];
    this.totalMatchesCount = 0;
    this.startPosition = void 0;
    this.word = "";
  }
  async findAndTrackNextSelection(focusedCell) {
    if (this.state === 0 /* Idle */) {
      const textModel = focusedCell.textModel;
      if (!textModel) {
        return;
      }
      const inputSelection = focusedCell.getSelections()[0];
      const word = this.getWord(inputSelection, textModel);
      if (!word) {
        return;
      }
      this.word = word.word;
      const notebookTextModel = this.notebookEditor.textModel;
      if (notebookTextModel) {
        const allMatches = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);
        this.totalMatchesCount = allMatches.reduce((sum, cellMatch) => sum + cellMatch.matches.length, 0);
      }
      const index = this.notebookEditor.getCellIndex(focusedCell);
      if (index === void 0) {
        return;
      }
      this.startPosition = {
        cellIndex: index,
        position: new Position(inputSelection.startLineNumber, word.startColumn)
      };
      const newSelection = new Selection(
        inputSelection.startLineNumber,
        word.startColumn,
        inputSelection.startLineNumber,
        word.endColumn
      );
      focusedCell.setSelections([newSelection]);
      this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
      if (!this.anchorCell || this.anchorCell[0].handle !== focusedCell.handle) {
        throw new Error("Active cell is not the same as the cell passed as context");
      }
      if (!(this.anchorCell[1] instanceof CodeEditorWidget)) {
        throw new Error("Active cell is not an instance of CodeEditorWidget");
      }
      await this.updateTrackedCell(focusedCell, [newSelection]);
      this._nbIsMultiSelectSession.set(true);
      this.state = 1 /* Selecting */;
      this._nbMultiSelectState.set(1 /* Selecting */);
      this._onDidChangeAnchorCell.fire();
    } else if (this.state === 1 /* Selecting */) {
      const notebookTextModel = this.notebookEditor.textModel;
      if (!notebookTextModel) {
        return;
      }
      const index = this.notebookEditor.getCellIndex(focusedCell);
      if (index === void 0) {
        return;
      }
      if (!this.startPosition) {
        return;
      }
      const totalSelections = this.trackedCells.reduce((sum, trackedCell) => sum + trackedCell.matchSelections.length, 0);
      if (totalSelections >= this.totalMatchesCount) {
        return;
      }
      const findResult = notebookTextModel.findNextMatch(
        this.word,
        { cellIndex: index, position: focusedCell.getSelections()[focusedCell.getSelections().length - 1].getEndPosition() },
        false,
        true,
        USUAL_WORD_SEPARATORS,
        this.startPosition
      );
      if (!findResult) {
        return;
      }
      const findResultCellViewModel = this.notebookEditor.getCellByHandle(findResult.cell.handle);
      if (!findResultCellViewModel) {
        return;
      }
      if (findResult.cell.handle === focusedCell.handle) {
        const selections = [...focusedCell.getSelections(), Selection.fromRange(findResult.match.range, SelectionDirection.LTR)];
        const trackedCell = await this.updateTrackedCell(focusedCell, selections);
        findResultCellViewModel.setSelections(trackedCell.matchSelections);
      } else if (findResult.cell.handle !== focusedCell.handle) {
        await this.notebookEditor.revealRangeInViewAsync(findResultCellViewModel, findResult.match.range);
        await this.notebookEditor.focusNotebookCell(findResultCellViewModel, "editor");
        const trackedCell = await this.updateTrackedCell(findResultCellViewModel, [Selection.fromRange(findResult.match.range, SelectionDirection.LTR)]);
        findResultCellViewModel.setSelections(trackedCell.matchSelections);
        this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
        if (!this.anchorCell || !(this.anchorCell[1] instanceof CodeEditorWidget)) {
          throw new Error("Active cell is not an instance of CodeEditorWidget");
        }
        this._onDidChangeAnchorCell.fire();
        this.initializeMultiSelectDecorations(this.trackedCells.find((trackedCell2) => trackedCell2.cellViewModel.handle === focusedCell.handle));
      }
    }
  }
  async selectAllMatches(focusedCell, matches) {
    const notebookTextModel = this.notebookEditor.textModel;
    if (!notebookTextModel) {
      return;
    }
    if (matches) {
      await this.handleFindWidgetSelectAllMatches(matches);
    } else {
      await this.handleCellEditorSelectAllMatches(notebookTextModel, focusedCell);
    }
    await this.syncCursorsControllers();
    this.syncAnchorListeners();
    this.updateLazyDecorations();
  }
  async handleFindWidgetSelectAllMatches(matches) {
    if (this.state !== 0 /* Idle */) {
      return;
    }
    if (!matches.length) {
      return;
    }
    await this.notebookEditor.focusNotebookCell(matches[0].cell, "editor");
    this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
    this.trackedCells = [];
    for (const match of matches) {
      this.updateTrackedCell(match.cell, match.contentMatches.map((match2) => Selection.fromRange(match2.range, SelectionDirection.LTR)));
      if (this.anchorCell && match.cell.handle === this.anchorCell[0].handle) {
        match.cell.setSelections(match.contentMatches.map((match2) => Selection.fromRange(match2.range, SelectionDirection.LTR)));
      }
    }
    this._nbIsMultiSelectSession.set(true);
    this.state = 1 /* Selecting */;
    this._nbMultiSelectState.set(1 /* Selecting */);
  }
  async handleCellEditorSelectAllMatches(notebookTextModel, focusedCell) {
    if (this.state === 0 /* Idle */) {
      const textModel = focusedCell.textModel;
      if (!textModel) {
        return;
      }
      const inputSelection = focusedCell.getSelections()[0];
      const word = this.getWord(inputSelection, textModel);
      if (!word) {
        return;
      }
      this.word = word.word;
      const index = this.notebookEditor.getCellIndex(focusedCell);
      if (index === void 0) {
        return;
      }
      this.startPosition = {
        cellIndex: index,
        position: new Position(inputSelection.startLineNumber, word.startColumn)
      };
      this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
      if (!this.anchorCell || this.anchorCell[0].handle !== focusedCell.handle) {
        throw new Error("Active cell is not the same as the cell passed as context");
      }
      if (!(this.anchorCell[1] instanceof CodeEditorWidget)) {
        throw new Error("Active cell is not an instance of CodeEditorWidget");
      }
      const findResults = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);
      this.trackedCells = [];
      for (const res of findResults) {
        await this.updateTrackedCell(res.cell, res.matches.map((match) => Selection.fromRange(match.range, SelectionDirection.LTR)));
        if (res.cell.handle === focusedCell.handle) {
          const cellViewModel = this.notebookEditor.getCellByHandle(res.cell.handle);
          if (cellViewModel) {
            cellViewModel.setSelections(res.matches.map((match) => Selection.fromRange(match.range, SelectionDirection.LTR)));
          }
        }
      }
      this._nbIsMultiSelectSession.set(true);
      this.state = 1 /* Selecting */;
      this._nbMultiSelectState.set(1 /* Selecting */);
    } else if (this.state === 1 /* Selecting */) {
      const findResults = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);
      for (const res of findResults) {
        await this.updateTrackedCell(res.cell, res.matches.map((match) => Selection.fromRange(match.range, SelectionDirection.LTR)));
      }
    }
  }
  async updateTrackedCell(cell, selections) {
    const cellViewModel = cell instanceof NotebookCellTextModel ? this.notebookEditor.getCellByHandle(cell.handle) : cell;
    if (!cellViewModel) {
      throw new Error("Cell not found");
    }
    let trackedMatch = this.trackedCells.find((trackedCell) => trackedCell.cellViewModel.handle === cellViewModel.handle);
    if (trackedMatch) {
      this.clearDecorations(trackedMatch);
      trackedMatch.matchSelections = selections;
    } else {
      const initialSelection = cellViewModel.getSelections()[0];
      const textModel = await cellViewModel.resolveTextModel();
      textModel.pushStackElement();
      const editorConfig = this.constructCellEditorOptions(cellViewModel);
      const rawEditorOptions = editorConfig.getRawOptions();
      const cursorConfig = {
        cursorStyle: cursorStyleFromString(rawEditorOptions.cursorStyle),
        cursorBlinking: cursorBlinkingStyleFromString(rawEditorOptions.cursorBlinking),
        cursorSmoothCaretAnimation: rawEditorOptions.cursorSmoothCaretAnimation
      };
      trackedMatch = {
        cellViewModel,
        initialSelection,
        matchSelections: selections,
        editorConfig,
        cursorConfig,
        decorationIds: [],
        undoRedoHistory: this.undoRedoService.getElements(cellViewModel.uri)
      };
      this.trackedCells.push(trackedMatch);
    }
    return trackedMatch;
  }
  async deleteLeft() {
    this.trackedCells.forEach((cell) => {
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      const [, commands] = DeleteOperations.deleteLeft(
        controller.getPrevEditOperationType(),
        controller.context.cursorConfig,
        controller.context.model,
        controller.getSelections(),
        controller.getAutoClosedCharacters()
      );
      const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
      if (!delSelections) {
        return;
      }
      controller.setSelections(new ViewModelEventsCollector(), void 0, delSelections, CursorChangeReason.Explicit);
    });
    this.updateLazyDecorations();
  }
  async deleteRight() {
    this.trackedCells.forEach((cell) => {
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      const [, commands] = DeleteOperations.deleteRight(
        controller.getPrevEditOperationType(),
        controller.context.cursorConfig,
        controller.context.model,
        controller.getSelections()
      );
      if (cell.cellViewModel.handle !== this.anchorCell?.[0].handle) {
        const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
        if (!delSelections) {
          return;
        }
        controller.setSelections(new ViewModelEventsCollector(), void 0, delSelections, CursorChangeReason.Explicit);
      } else {
        controller.setSelections(new ViewModelEventsCollector(), void 0, cell.cellViewModel.getSelections(), CursorChangeReason.Explicit);
      }
    });
    this.updateLazyDecorations();
  }
  async undo() {
    const models = [];
    for (const cell of this.trackedCells) {
      const model = await cell.cellViewModel.resolveTextModel();
      if (model) {
        models.push(model);
      }
    }
    await Promise.all(models.map((model) => model.undo()));
    this.updateViewModelSelections();
    this.updateLazyDecorations();
  }
  async redo() {
    const models = [];
    for (const cell of this.trackedCells) {
      const model = await cell.cellViewModel.resolveTextModel();
      if (model) {
        models.push(model);
      }
    }
    await Promise.all(models.map((model) => model.redo()));
    this.updateViewModelSelections();
    this.updateLazyDecorations();
  }
  constructCellEditorOptions(cell) {
    const cellEditorOptions = new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(cell.language), this.notebookEditor.notebookOptions, this.configurationService);
    const options = cellEditorOptions.getUpdatedValue(cell.internalMetadata, cell.uri);
    cellEditorOptions.dispose();
    return new EditorConfiguration(false, MenuId.EditorContent, options, null, this.accessibilityService);
  }
  /**
   * Updates the multicursor selection decorations for a specific matched cell
   *
   * @param cell -- match object containing the viewmodel + selections
   */
  initializeMultiSelectDecorations(cell) {
    if (!cell) {
      return;
    }
    const decorations = [];
    cell.matchSelections.forEach((selection) => {
      decorations.push({
        range: Selection.fromPositions(selection.getEndPosition()),
        options: {
          description: "",
          className: this.getClassName(cell.cursorConfig, true)
        }
      });
    });
    cell.decorationIds = cell.cellViewModel.deltaModelDecorations(
      cell.decorationIds,
      decorations
    );
  }
  updateLazyDecorations() {
    this.trackedCells.forEach((cell) => {
      if (cell.cellViewModel.handle === this.anchorCell?.[0].handle) {
        return;
      }
      const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
      if (!controller) {
        return;
      }
      const selections = controller.getSelections();
      const newDecorations = [];
      selections?.map((selection) => {
        const isEmpty = selection.isEmpty();
        if (!isEmpty) {
          newDecorations.push({
            range: selection,
            options: {
              description: "",
              className: this.getClassName(cell.cursorConfig, false)
            }
          });
        }
        newDecorations.push({
          range: Selection.fromPositions(selection.getPosition()),
          options: {
            description: "",
            zIndex: 1e4,
            className: this.getClassName(cell.cursorConfig, true)
          }
        });
      });
      cell.decorationIds = cell.cellViewModel.deltaModelDecorations(
        cell.decorationIds,
        newDecorations
      );
    });
  }
  clearDecorations(cell) {
    cell.decorationIds = cell.cellViewModel.deltaModelDecorations(
      cell.decorationIds,
      []
    );
  }
  getWord(selection, model) {
    const lineNumber = selection.startLineNumber;
    const startColumn = selection.startColumn;
    if (model.isDisposed()) {
      return null;
    }
    return model.getWordAtPosition({
      lineNumber,
      column: startColumn
    });
  }
  getClassName(cursorConfig, isCursor) {
    let result = isCursor ? ".nb-multicursor-cursor" : ".nb-multicursor-selection";
    if (isCursor) {
      switch (cursorConfig.cursorStyle) {
        case TextEditorCursorStyle.Line:
          break;
        // default style, no additional class needed (handled by base css style)
        case TextEditorCursorStyle.Block:
          result += ".nb-cursor-block-style";
          break;
        case TextEditorCursorStyle.Underline:
          result += ".nb-cursor-underline-style";
          break;
        case TextEditorCursorStyle.LineThin:
          result += ".nb-cursor-line-thin-style";
          break;
        case TextEditorCursorStyle.BlockOutline:
          result += ".nb-cursor-block-outline-style";
          break;
        case TextEditorCursorStyle.UnderlineThin:
          result += ".nb-cursor-underline-thin-style";
          break;
        default:
          break;
      }
      switch (cursorConfig.cursorBlinking) {
        case TextEditorCursorBlinkingStyle.Blink:
          result += ".nb-blink";
          break;
        case TextEditorCursorBlinkingStyle.Smooth:
          result += ".nb-smooth";
          break;
        case TextEditorCursorBlinkingStyle.Phase:
          result += ".nb-phase";
          break;
        case TextEditorCursorBlinkingStyle.Expand:
          result += ".nb-expand";
          break;
        case TextEditorCursorBlinkingStyle.Solid:
          result += ".nb-solid";
          break;
        default:
          result += ".nb-solid";
          break;
      }
      if (cursorConfig.cursorSmoothCaretAnimation === "on" || cursorConfig.cursorSmoothCaretAnimation === "explicit") {
        result += ".nb-smooth-caret-animation";
      }
    }
    return result;
  }
  dispose() {
    super.dispose();
    this.anchorDisposables.dispose();
    this.cursorsDisposables.dispose();
    this.trackedCells.forEach((cell) => {
      this.clearDecorations(cell);
    });
    this.trackedCells = [];
  }
};
NotebookMultiCursorController.id = "notebook.multiCursorController";
NotebookMultiCursorController = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, ILanguageConfigurationService),
  __decorateParam(4, IAccessibilityService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IUndoRedoService)
], NotebookMultiCursorController);
class NotebookSelectAllFindMatches extends NotebookAction {
  constructor() {
    super({
      id: NOTEBOOK_SELECT_ALL_FIND_MATCHES_ID,
      title: localize("selectAllFindMatches", "Select All Occurrences of Find Match"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true)
      ),
      keybinding: {
        when: ContextKeyExpr.or(
          ContextKeyExpr.and(
            ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
            NOTEBOOK_IS_ACTIVE_EDITOR,
            NOTEBOOK_CELL_EDITOR_FOCUSED
          ),
          ContextKeyExpr.and(
            ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
            KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED
          )
        ),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    if (!context.cell) {
      return;
    }
    const cursorController = editor.getContribution(NotebookMultiCursorController.id);
    const findController = editor.getContribution(NotebookFindContrib.id);
    if (findController.widget.isFocused) {
      const findModel = findController.widget.findModel;
      cursorController.selectAllMatches(context.cell, findModel.findMatches);
    } else {
      cursorController.selectAllMatches(context.cell);
    }
  }
}
class NotebookAddMatchToMultiSelectionAction extends NotebookAction {
  constructor() {
    super({
      id: NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID,
      title: localize("addFindMatchToSelection", "Add Selection to Next Find Match"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
        NOTEBOOK_IS_ACTIVE_EDITOR,
        NOTEBOOK_CELL_EDITOR_FOCUSED
      ),
      keybinding: {
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
          NOTEBOOK_IS_ACTIVE_EDITOR,
          NOTEBOOK_CELL_EDITOR_FOCUSED
        ),
        primary: KeyMod.CtrlCmd | KeyCode.KeyD,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    if (!context.cell) {
      return;
    }
    const controller = editor.getContribution(NotebookMultiCursorController.id);
    controller.findAndTrackNextSelection(context.cell);
  }
}
class NotebookExitMultiSelectionAction extends NotebookAction {
  constructor() {
    super({
      id: "noteMultiCursor.exit",
      title: localize("exitMultiSelection", "Exit Multi Cursor Mode"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
        NOTEBOOK_IS_ACTIVE_EDITOR,
        NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor
      ),
      keybinding: {
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
          NOTEBOOK_IS_ACTIVE_EDITOR,
          NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor
        ),
        primary: KeyCode.Escape,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    const controller = editor.getContribution(NotebookMultiCursorController.id);
    controller.resetToIdleState();
  }
}
class NotebookDeleteLeftMultiSelectionAction extends NotebookAction {
  constructor() {
    super({
      id: "noteMultiCursor.deleteLeft",
      title: localize("deleteLeftMultiSelection", "Delete Left"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
        NOTEBOOK_IS_ACTIVE_EDITOR,
        NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
        ContextKeyExpr.or(
          NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(1 /* Selecting */),
          NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(2 /* Editing */)
        )
      ),
      keybinding: {
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
          NOTEBOOK_IS_ACTIVE_EDITOR,
          NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
          ContextKeyExpr.or(
            NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(1 /* Selecting */),
            NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(2 /* Editing */)
          )
        ),
        primary: KeyCode.Backspace,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    const controller = editor.getContribution(NotebookMultiCursorController.id);
    controller.deleteLeft();
  }
}
class NotebookDeleteRightMultiSelectionAction extends NotebookAction {
  constructor() {
    super({
      id: "noteMultiCursor.deleteRight",
      title: localize("deleteRightMultiSelection", "Delete Right"),
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
        NOTEBOOK_IS_ACTIVE_EDITOR,
        NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
        ContextKeyExpr.or(
          NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(1 /* Selecting */),
          NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(2 /* Editing */)
        )
      ),
      keybinding: {
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
          NOTEBOOK_IS_ACTIVE_EDITOR,
          NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
          ContextKeyExpr.or(
            NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(1 /* Selecting */),
            NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(2 /* Editing */)
          )
        ),
        primary: KeyCode.Delete,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorService = accessor.get(IEditorService);
    const nbEditor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!nbEditor) {
      return;
    }
    const cellEditor = nbEditor.activeCodeEditor;
    if (!cellEditor) {
      return;
    }
    CoreEditingCommands.DeleteRight.runEditorCommand(accessor, cellEditor, null);
    const controller = nbEditor.getContribution(NotebookMultiCursorController.id);
    controller.deleteRight();
  }
}
let NotebookMultiCursorUndoRedoContribution = class extends Disposable {
  constructor(_editorService, configurationService) {
    super();
    this._editorService = _editorService;
    this.configurationService = configurationService;
    if (!this.configurationService.getValue("notebook.multiCursor.enabled")) {
      return;
    }
    const PRIORITY = 10005;
    this._register(UndoCommand.addImplementation(PRIORITY, "notebook-multicursor-undo-redo", () => {
      const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
      if (!editor) {
        return false;
      }
      if (!editor.hasModel()) {
        return false;
      }
      const controller = editor.getContribution(NotebookMultiCursorController.id);
      return controller.undo();
    }, ContextKeyExpr.and(
      ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
      NOTEBOOK_IS_ACTIVE_EDITOR,
      NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor
    )));
    this._register(RedoCommand.addImplementation(PRIORITY, "notebook-multicursor-undo-redo", () => {
      const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
      if (!editor) {
        return false;
      }
      if (!editor.hasModel()) {
        return false;
      }
      const controller = editor.getContribution(NotebookMultiCursorController.id);
      return controller.redo();
    }, ContextKeyExpr.and(
      ContextKeyExpr.equals("config.notebook.multiCursor.enabled", true),
      NOTEBOOK_IS_ACTIVE_EDITOR,
      NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor
    )));
  }
};
NotebookMultiCursorUndoRedoContribution.ID = "workbench.contrib.notebook.multiCursorUndoRedo";
NotebookMultiCursorUndoRedoContribution = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IConfigurationService)
], NotebookMultiCursorUndoRedoContribution);
registerNotebookContribution(NotebookMultiCursorController.id, NotebookMultiCursorController);
registerWorkbenchContribution2(NotebookMultiCursorUndoRedoContribution.ID, NotebookMultiCursorUndoRedoContribution, WorkbenchPhase.BlockRestore);
registerAction2(NotebookSelectAllFindMatches);
registerAction2(NotebookAddMatchToMultiSelectionAction);
registerAction2(NotebookExitMultiSelectionAction);
registerAction2(NotebookDeleteLeftMultiSelectionAction);
registerAction2(NotebookDeleteRightMultiSelectionAction);
export {
  NOTEBOOK_MULTI_CURSOR_CONTEXT,
  NotebookMultiCursorController,
  NotebookMultiCursorState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9tdWx0aWN1cnNvci9ub3RlYm9va011bHRpY3Vyc29yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb3JlRWRpdGluZ0NvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29yZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBQYXN0ZVBheWxvYWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFJlZG9Db21tYW5kLCBVbmRvQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGN1cnNvckJsaW5raW5nU3R5bGVGcm9tU3RyaW5nLCBjdXJzb3JTdHlsZUZyb21TdHJpbmcsIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLCBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiwgU2VsZWN0aW9uRGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29yZEF0UG9zaXRpb24sIFVTVUFMX1dPUkRfU0VQQVJBVE9SUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IENvbW1hbmRFeGVjdXRvciwgQ3Vyc29yc0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2N1cnNvci9jdXJzb3IuanMnO1xuaW1wb3J0IHsgRGVsZXRlT3BlcmF0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yL2N1cnNvckRlbGV0ZU9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29uZmlndXJhdGlvbiwgSUN1cnNvclNpbXBsZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jdXJzb3JDb21tb24uanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgQ29tcG9zaXRpb25UeXBlUGF5bG9hZCwgSGFuZGxlciwgSVRyaWdnZXJFZGl0b3JPcGVyYXRpb25FdmVudCwgUmVwbGFjZVByZXZpb3VzQ2hhclBheWxvYWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSVRleHRNb2RlbCwgUG9zaXRpb25BZmZpbml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgaW5kZW50T2ZMaW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3ZpZXdNb2RlbEV2ZW50RGlzcGF0Y2hlci5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElQYXN0RnV0dXJlRWxlbWVudHMsIElVbmRvUmVkb0VsZW1lbnQsIElVbmRvUmVkb1NlcnZpY2UsIFVuZG9SZWRvRWxlbWVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEtFWUJJTkRJTkdfQ09OVEVYVF9OT1RFQk9PS19GSU5EX1dJREdFVF9GT0NVU0VELCBOT1RFQk9PS19DRUxMX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rQWN0aW9uQ29udGV4dCwgTm90ZWJvb2tBY3Rpb24gfSBmcm9tICcuLi8uLi9jb250cm9sbGVyL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IENlbGxGaW5kTWF0Y2hXaXRoSW5kZXgsIGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUsIElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3IsIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENlbGxFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vdmlldy9jZWxsUGFydHMvY2VsbEVkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tGaW5kQ29udHJpYiB9IGZyb20gJy4uL2ZpbmQvbm90ZWJvb2tGaW5kV2lkZ2V0LmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va0NlbGxUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvb3JkaW5hdGVzQ29udmVydGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb29yZGluYXRlc0NvbnZlcnRlci5qcyc7XG5cbmNvbnN0IE5PVEVCT09LX0FERF9GSU5EX01BVENIX1RPX1NFTEVDVElPTl9JRCA9ICdub3RlYm9vay5hZGRGaW5kTWF0Y2hUb1NlbGVjdGlvbic7XG5jb25zdCBOT1RFQk9PS19TRUxFQ1RfQUxMX0ZJTkRfTUFUQ0hFU19JRCA9ICdub3RlYm9vay5zZWxlY3RBbGxGaW5kTWF0Y2hlcyc7XG5cbmV4cG9ydCBlbnVtIE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZSB7XG5cdElkbGUsXG5cdFNlbGVjdGluZyxcblx0RWRpdGluZyxcbn1cblxuaW50ZXJmYWNlIE5vdGVib29rQ3Vyc29yQ29uZmlnIHtcblx0Y3Vyc29yU3R5bGU6IFRleHRFZGl0b3JDdXJzb3JTdHlsZTtcblx0Y3Vyc29yQmxpbmtpbmc6IFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlO1xuXHRjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbjogJ29mZicgfCAnZXhwbGljaXQnIHwgJ29uJztcbn1cblxuaW50ZXJmYWNlIFNlbGVjdGlvblRyYW5zbGF0aW9uIHtcblx0ZGVsdGFTdGFydENvbDogbnVtYmVyO1xuXHRkZWx0YVN0YXJ0TGluZTogbnVtYmVyO1xuXHRkZWx0YUVuZENvbDogbnVtYmVyO1xuXHRkZWx0YUVuZExpbmU6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFRyYWNrZWRDZWxsIHtcblx0Y2VsbFZpZXdNb2RlbDogSUNlbGxWaWV3TW9kZWw7XG5cdGluaXRpYWxTZWxlY3Rpb246IFNlbGVjdGlvbjtcblx0bWF0Y2hTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXTtcblx0ZWRpdG9yQ29uZmlnOiBJRWRpdG9yQ29uZmlndXJhdGlvbjtcblx0Y3Vyc29yQ29uZmlnOiBOb3RlYm9va0N1cnNvckNvbmZpZztcblx0ZGVjb3JhdGlvbklkczogc3RyaW5nW107XG5cdHVuZG9SZWRvSGlzdG9yeTogSVBhc3RGdXR1cmVFbGVtZW50cztcbn1cblxuZXhwb3J0IGNvbnN0IE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhUID0ge1xuXHRJc05vdGVib29rTXVsdGlDdXJzb3I6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdpc05vdGVib29rTXVsdGlTZWxlY3QnLCBmYWxzZSksXG5cdE5vdGVib29rTXVsdGlTZWxlY3RDdXJzb3JTdGF0ZTogbmV3IFJhd0NvbnRleHRLZXk8Tm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlPignbm90ZWJvb2tNdWx0aVNlbGVjdEN1cnNvclN0YXRlJywgTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLklkbGUpLFxufTtcblxuZXhwb3J0IGNsYXNzIE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkOiBzdHJpbmcgPSAnbm90ZWJvb2subXVsdGlDdXJzb3JDb250cm9sbGVyJztcblxuXHRwcml2YXRlIHdvcmQ6IHN0cmluZztcblx0cHJpdmF0ZSBzdGFydFBvc2l0aW9uOiB7XG5cdFx0Y2VsbEluZGV4OiBudW1iZXI7XG5cdFx0cG9zaXRpb246IFBvc2l0aW9uO1xuXHR9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRyYWNrZWRDZWxsczogVHJhY2tlZENlbGxbXTtcblx0cHJpdmF0ZSB0b3RhbE1hdGNoZXNDb3VudDogbnVtYmVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQW5jaG9yQ2VsbDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBbmNob3JDZWxsOiBFdmVudDx2b2lkPjtcblx0cHJpdmF0ZSBhbmNob3JDZWxsOiBbSUNlbGxWaWV3TW9kZWwsIElDb2RlRWRpdG9yXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFuY2hvckRpc3Bvc2FibGVzO1xuXHRwcml2YXRlIHJlYWRvbmx5IGN1cnNvcnNEaXNwb3NhYmxlcztcblx0cHJpdmF0ZSBjdXJzb3JzQ29udHJvbGxlcnM6IFJlc291cmNlTWFwPEN1cnNvcnNDb250cm9sbGVyPjtcblxuXHRwcml2YXRlIHN0YXRlOiBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGU7XG5cdHB1YmxpYyBnZXRTdGF0ZSgpOiBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLnN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmJJc011bHRpU2VsZWN0U2Vzc2lvbjtcblx0cHJpdmF0ZSBfbmJNdWx0aVNlbGVjdFN0YXRlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVVuZG9SZWRvU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVuZG9SZWRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLndvcmQgPSAnJztcblx0XHR0aGlzLnRyYWNrZWRDZWxscyA9IFtdO1xuXHRcdHRoaXMudG90YWxNYXRjaGVzQ291bnQgPSAwO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQW5jaG9yQ2VsbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VBbmNob3JDZWxsID0gdGhpcy5fb25EaWRDaGFuZ2VBbmNob3JDZWxsLmV2ZW50O1xuXHRcdHRoaXMuYW5jaG9yRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMuY3Vyc29yc0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHR0aGlzLmN1cnNvcnNDb250cm9sbGVycyA9IG5ldyBSZXNvdXJjZU1hcDxDdXJzb3JzQ29udHJvbGxlcj4oKTtcblx0XHR0aGlzLnN0YXRlID0gTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLklkbGU7XG5cdFx0dGhpcy5fbmJJc011bHRpU2VsZWN0U2Vzc2lvbiA9IE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULklzTm90ZWJvb2tNdWx0aUN1cnNvci5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fbmJNdWx0aVNlbGVjdFN0YXRlID0gTk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuTm90ZWJvb2tNdWx0aVNlbGVjdEN1cnNvclN0YXRlLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuYW5jaG9yQ2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuYWN0aXZlQ2VsbEFuZENvZGVFZGl0b3I7XG5cblx0XHQvLyBhbmNob3IgY2VsbCB3aWxsIGNhdGNoIGFuZCByZWxheSBhbGwgdHlwZSwgY3V0LCBwYXN0ZSBldmVudHMgdG8gdGhlIGN1cnNvcnMgY29udHJvbGxlcnNcblx0XHQvLyBuZWVkIHRvIGNyZWF0ZSBuZXcgY29udHJvbGxlcnMgd2hlbiB0aGUgYW5jaG9yIGNlbGwgY2hhbmdlcywgdGhlbiB1cGRhdGUgdGhlaXIgbGlzdGVuZXJzXG5cdFx0Ly8gKiogY3Vyc29yIGNvbnRyb2xsZXJzIG5lZWQgdG8gaGFwcGVuIGZpcnN0LCBiZWNhdXNlIGFuY2hvciBsaXN0ZW5lcnMgcmVsYXkgdG8gdGhlbVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VBbmNob3JDZWxsKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuc3luY0N1cnNvcnNDb250cm9sbGVycygpO1xuXHRcdFx0dGhpcy5zeW5jQW5jaG9yTGlzdGVuZXJzKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzeW5jQW5jaG9yTGlzdGVuZXJzKCkge1xuXHRcdHRoaXMuYW5jaG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmICghdGhpcy5hbmNob3JDZWxsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FuY2hvciBjZWxsIGlzIHVuZGVmaW5lZCcpO1xuXHRcdH1cblxuXHRcdC8vIHR5cGluZ1xuXHRcdHRoaXMuYW5jaG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuYW5jaG9yQ2VsbFsxXS5vbldpbGxUeXBlKChpbnB1dCkgPT4ge1xuXHRcdFx0Y29uc3QgY29sbGVjdG9yID0gbmV3IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvcigpO1xuXHRcdFx0dGhpcy50cmFja2VkQ2VsbHMuZm9yRWFjaChjZWxsID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY3Vyc29yc0NvbnRyb2xsZXJzLmdldChjZWxsLmNlbGxWaWV3TW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0Ly8gc2hvdWxkIG5vdCBoYXBwZW5cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNlbGwuY2VsbFZpZXdNb2RlbC5oYW5kbGUgIT09IHRoaXMuYW5jaG9yQ2VsbD8uWzBdLmhhbmRsZSkgeyAvLyBkb24ndCByZWxheSB0byBhY3RpdmUgY2VsbCwgYWxyZWFkeSBoYXMgYSBjb250cm9sbGVyIGZvciB0eXBpbmdcblx0XHRcdFx0XHRjb250cm9sbGVyLnR5cGUoY29sbGVjdG9yLCBpbnB1dCwgJ2tleWJvYXJkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuYW5jaG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuYW5jaG9yQ2VsbFsxXS5vbkRpZFR5cGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5FZGl0aW5nOyAvLyB0eXBpbmcgd2lsbCBjb250aW51ZSB0byB3b3JrIGFzIG5vcm1hbCBhY3Jvc3MgcmFuZ2VzLCBqdXN0IHByZXBzIGZvciBhbm90aGVyIGNtZCtkXG5cdFx0XHR0aGlzLl9uYk11bHRpU2VsZWN0U3RhdGUuc2V0KE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5FZGl0aW5nKTtcblxuXHRcdFx0Y29uc3QgYW5jaG9yQ29udHJvbGxlciA9IHRoaXMuY3Vyc29yc0NvbnRyb2xsZXJzLmdldCh0aGlzLmFuY2hvckNlbGwhWzBdLnVyaSk7XG5cdFx0XHRpZiAoIWFuY2hvckNvbnRyb2xsZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aXZlU2VsZWN0aW9ucyA9IHRoaXMubm90ZWJvb2tFZGl0b3IuYWN0aXZlQ29kZUVkaXRvcj8uZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZWxlY3Rpb25zKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gbmVlZCB0byBrZWVwIGFuY2hvciBjdXJzb3IgY29udHJvbGxlciBpbiBzeW5jIG1hbnVhbGx5IChmb3IgZGVsZXRlIHVzYWdlKSwgc2luY2Ugd2UgZG9uJ3QgcmVsYXkgdHlwZSBldmVudCB0byBpdFxuXHRcdFx0YW5jaG9yQ29udHJvbGxlci5zZXRTZWxlY3Rpb25zKG5ldyBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IoKSwgJ2tleWJvYXJkJywgYWN0aXZlU2VsZWN0aW9ucywgQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KTtcblxuXHRcdFx0dGhpcy50cmFja2VkQ2VsbHMuZm9yRWFjaChjZWxsID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY3Vyc29yc0NvbnRyb2xsZXJzLmdldChjZWxsLmNlbGxWaWV3TW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdGhpcyBpcyB1c2VkIHVwb24gZXhpdGluZyB0aGUgbXVsdGljdXJzb3Igc2Vzc2lvbiB0byBzZXQgdGhlIHNlbGVjdGlvbnMgYmFjayB0byB0aGUgY29ycmVjdCBjdXJzb3Igc3RhdGVcblx0XHRcdFx0Y2VsbC5pbml0aWFsU2VsZWN0aW9uID0gY29udHJvbGxlci5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0Ly8gY2xlYXIgdHJhY2tlZCBzZWxlY3Rpb24gZGF0YSBhcyBpdCBpcyBpbnZhbGlkIG9uY2UgdHlwaW5nIGJlZ2luc1xuXHRcdFx0XHRjZWxsLm1hdGNoU2VsZWN0aW9ucyA9IFtdO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMudXBkYXRlTGF6eURlY29yYXRpb25zKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gYXJyb3cga2V5IG5hdmlnYXRpb25cblx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmFuY2hvckNlbGxbMV0ub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLnNvdXJjZSA9PT0gJ21vdXNlJykge1xuXHRcdFx0XHR0aGlzLnJlc2V0VG9JZGxlU3RhdGUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBpZ25vcmUgdGhpcyBldmVudCBpZiBpdCB3YXMgY2F1c2VkIGJ5IGEgdHlwaW5nIGV2ZW50IG9yIGEgZGVsZXRlIChOb3RTZXQgYW5kIFJlY292ZXJGcm9tTWFya2VycyByZXNwZWN0aXZlbHkpXG5cdFx0XHRpZiAoIWUub2xkU2VsZWN0aW9ucyB8fCBlLnJlYXNvbiA9PT0gQ3Vyc29yQ2hhbmdlUmVhc29uLk5vdFNldCB8fCBlLnJlYXNvbiA9PT0gQ3Vyc29yQ2hhbmdlUmVhc29uLlJlY292ZXJGcm9tTWFya2Vycykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRyYW5zbGF0aW9uOiBTZWxlY3Rpb25UcmFuc2xhdGlvbiA9IHtcblx0XHRcdFx0ZGVsdGFTdGFydENvbDogZS5zZWxlY3Rpb24uc3RhcnRDb2x1bW4gLSBlLm9sZFNlbGVjdGlvbnNbMF0uc3RhcnRDb2x1bW4sXG5cdFx0XHRcdGRlbHRhU3RhcnRMaW5lOiBlLnNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgLSBlLm9sZFNlbGVjdGlvbnNbMF0uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRkZWx0YUVuZENvbDogZS5zZWxlY3Rpb24uZW5kQ29sdW1uIC0gZS5vbGRTZWxlY3Rpb25zWzBdLmVuZENvbHVtbixcblx0XHRcdFx0ZGVsdGFFbmRMaW5lOiBlLnNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyIC0gZS5vbGRTZWxlY3Rpb25zWzBdLmVuZExpbmVOdW1iZXIsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdHJhbnNsYXRpb25EaXIgPSBlLnNlbGVjdGlvbi5nZXREaXJlY3Rpb24oKTtcblxuXHRcdFx0dGhpcy50cmFja2VkQ2VsbHMuZm9yRWFjaChjZWxsID0+IHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY3Vyc29yc0NvbnRyb2xsZXJzLmdldChjZWxsLmNlbGxWaWV3TW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9ucyA9IGNvbnRyb2xsZXIuZ2V0U2VsZWN0aW9ucygpLm1hcChzZWxlY3Rpb24gPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG5ld1N0YXJ0Q29sID0gc2VsZWN0aW9uLnN0YXJ0Q29sdW1uICsgdHJhbnNsYXRpb24uZGVsdGFTdGFydENvbDtcblx0XHRcdFx0XHRjb25zdCBuZXdTdGFydExpbmUgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyICsgdHJhbnNsYXRpb24uZGVsdGFTdGFydExpbmU7XG5cdFx0XHRcdFx0Y29uc3QgbmV3RW5kQ29sID0gc2VsZWN0aW9uLmVuZENvbHVtbiArIHRyYW5zbGF0aW9uLmRlbHRhRW5kQ29sO1xuXHRcdFx0XHRcdGNvbnN0IG5ld0VuZExpbmUgPSBzZWxlY3Rpb24uZW5kTGluZU51bWJlciArIHRyYW5zbGF0aW9uLmRlbHRhRW5kTGluZTtcblx0XHRcdFx0XHRyZXR1cm4gU2VsZWN0aW9uLmNyZWF0ZVdpdGhEaXJlY3Rpb24obmV3U3RhcnRMaW5lLCBuZXdTdGFydENvbCwgbmV3RW5kTGluZSwgbmV3RW5kQ29sLCB0cmFuc2xhdGlvbkRpcik7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnRyb2xsZXIuc2V0U2VsZWN0aW9ucyhuZXcgVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKCksIGUuc291cmNlLCBuZXdTZWxlY3Rpb25zLCBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMudXBkYXRlTGF6eURlY29yYXRpb25zKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gY29yZSBhY3Rpb25zXG5cdFx0dGhpcy5hbmNob3JEaXNwb3NhYmxlcy5hZGQodGhpcy5hbmNob3JDZWxsWzFdLm9uV2lsbFRyaWdnZXJFZGl0b3JPcGVyYXRpb25FdmVudCgoZSkgPT4ge1xuXHRcdFx0dGhpcy5oYW5kbGVFZGl0b3JPcGVyYXRpb25FdmVudChlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBleGl0IG1vZGVcblx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmFuY2hvckNlbGxbMV0ub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnN0YXRlID09PSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuU2VsZWN0aW5nIHx8IHRoaXMuc3RhdGUgPT09IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5FZGl0aW5nKSB7XG5cdFx0XHRcdHRoaXMucmVzZXRUb0lkbGVTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3luY0N1cnNvcnNDb250cm9sbGVycygpIHtcblx0XHR0aGlzLmN1cnNvcnNEaXNwb3NhYmxlcy5jbGVhcigpOyAvLyBUT0RPOiBkaWFsIHRoaXMgYmFjayBmb3IgcGVyZiBhbmQganVzdCB1cGRhdGUgdGhlIHJlbGV2YW50IGNvbnRyb2xsZXJzXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodGhpcy50cmFja2VkQ2VsbHMubWFwKGFzeW5jIGNlbGwgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGF3YWl0IHRoaXMuY3JlYXRlQ3Vyc29yQ29udHJvbGxlcihjZWxsKTtcblx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmN1cnNvcnNDb250cm9sbGVycy5zZXQoY2VsbC5jZWxsVmlld01vZGVsLnVyaSwgY29udHJvbGxlcik7XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBjZWxsLm1hdGNoU2VsZWN0aW9ucztcblx0XHRcdGNvbnRyb2xsZXIuc2V0U2VsZWN0aW9ucyhuZXcgVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKCksIHVuZGVmaW5lZCwgc2VsZWN0aW9ucywgQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZUxhenlEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVDdXJzb3JDb250cm9sbGVyKGNlbGw6IFRyYWNrZWRDZWxsKTogUHJvbWlzZTxDdXJzb3JzQ29udHJvbGxlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRleHRNb2RlbFJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShjZWxsLmNlbGxWaWV3TW9kZWwudXJpKTtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0ZXh0TW9kZWxSZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHRpZiAoIXRleHRNb2RlbCkge1xuXHRcdFx0dGV4dE1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuY3Vyc29yc0Rpc3Bvc2FibGVzLmFkZCh0ZXh0TW9kZWxSZWYpO1xuXG5cdFx0Y29uc3QgY3Vyc29yU2ltcGxlTW9kZWwgPSB0aGlzLmNvbnN0cnVjdEN1cnNvclNpbXBsZU1vZGVsKGNlbGwuY2VsbFZpZXdNb2RlbCk7XG5cdFx0Y29uc3QgY29udmVydGVyID0gdGhpcy5jb25zdHJ1Y3RDb29yZGluYXRlc0NvbnZlcnRlcigpO1xuXHRcdGNvbnN0IGVkaXRvckNvbmZpZyA9IGNlbGwuZWRpdG9yQ29uZmlnO1xuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY3Vyc29yc0Rpc3Bvc2FibGVzLmFkZChuZXcgQ3Vyc29yc0NvbnRyb2xsZXIoXG5cdFx0XHR0ZXh0TW9kZWwsXG5cdFx0XHRjdXJzb3JTaW1wbGVNb2RlbCxcblx0XHRcdGNvbnZlcnRlcixcblx0XHRcdG5ldyBDdXJzb3JDb25maWd1cmF0aW9uKHRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHRleHRNb2RlbC5nZXRPcHRpb25zKCksIGVkaXRvckNvbmZpZywgdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKVxuXHRcdCkpO1xuXG5cdFx0Y29udHJvbGxlci5zZXRTZWxlY3Rpb25zKG5ldyBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IoKSwgdW5kZWZpbmVkLCBjZWxsLm1hdGNoU2VsZWN0aW9ucywgQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KTtcblx0XHRyZXR1cm4gY29udHJvbGxlcjtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0Q29vcmRpbmF0ZXNDb252ZXJ0ZXIoKTogSUNvb3JkaW5hdGVzQ29udmVydGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbih2aWV3UG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdFx0XHRyZXR1cm4gdmlld1Bvc2l0aW9uO1xuXHRcdFx0fSxcblx0XHRcdGNvbnZlcnRWaWV3UmFuZ2VUb01vZGVsUmFuZ2Uodmlld1JhbmdlOiBSYW5nZSk6IFJhbmdlIHtcblx0XHRcdFx0cmV0dXJuIHZpZXdSYW5nZTtcblx0XHRcdH0sXG5cdFx0XHR2YWxpZGF0ZVZpZXdQb3NpdGlvbih2aWV3UG9zaXRpb246IFBvc2l0aW9uLCBleHBlY3RlZE1vZGVsUG9zaXRpb246IFBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdFx0XHRyZXR1cm4gdmlld1Bvc2l0aW9uO1xuXHRcdFx0fSxcblx0XHRcdHZhbGlkYXRlVmlld1JhbmdlKHZpZXdSYW5nZTogUmFuZ2UsIGV4cGVjdGVkTW9kZWxSYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG5cdFx0XHRcdHJldHVybiB2aWV3UmFuZ2U7XG5cdFx0XHR9LFxuXHRcdFx0Y29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihtb2RlbFBvc2l0aW9uOiBQb3NpdGlvbiwgYWZmaW5pdHk/OiBQb3NpdGlvbkFmZmluaXR5LCBhbGxvd1plcm9MaW5lTnVtYmVyPzogYm9vbGVhbiwgYmVsb3dIaWRkZW5SYW5nZXM/OiBib29sZWFuKTogUG9zaXRpb24ge1xuXHRcdFx0XHRyZXR1cm4gbW9kZWxQb3NpdGlvbjtcblx0XHRcdH0sXG5cdFx0XHRjb252ZXJ0TW9kZWxSYW5nZVRvVmlld1JhbmdlKG1vZGVsUmFuZ2U6IFJhbmdlLCBhZmZpbml0eT86IFBvc2l0aW9uQWZmaW5pdHkpOiBSYW5nZSB7XG5cdFx0XHRcdHJldHVybiBtb2RlbFJhbmdlO1xuXHRcdFx0fSxcblx0XHRcdG1vZGVsUG9zaXRpb25Jc1Zpc2libGUobW9kZWxQb3NpdGlvbjogUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TW9kZWxMaW5lVmlld0xpbmVDb3VudChtb2RlbExpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fSxcblx0XHRcdGdldFZpZXdMaW5lTnVtYmVyT2ZNb2RlbFBvc2l0aW9uKG1vZGVsTGluZU51bWJlcjogbnVtYmVyLCBtb2RlbENvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIG1vZGVsTGluZU51bWJlcjtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RDdXJzb3JTaW1wbGVNb2RlbChjZWxsOiBJQ2VsbFZpZXdNb2RlbCk6IElDdXJzb3JTaW1wbGVNb2RlbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldExpbmVDb3VudCgpOiBudW1iZXIge1xuXHRcdFx0XHRyZXR1cm4gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpO1xuXHRcdFx0fSxcblx0XHRcdGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0XHRcdHJldHVybiBjZWxsLnRleHRCdWZmZXIuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGluZU1pbkNvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0XHRyZXR1cm4gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVNaW5Db2x1bW4obGluZU51bWJlcik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0XHRyZXR1cm4gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0XHRyZXR1cm4gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiBjZWxsLnRleHRCdWZmZXIuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0fSxcblx0XHRcdG5vcm1hbGl6ZVBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgYWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkpOiBQb3NpdGlvbiB7XG5cdFx0XHRcdHJldHVybiBwb3NpdGlvbjtcblx0XHRcdH0sXG5cdFx0XHRnZXRMaW5lSW5kZW50Q29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiBpbmRlbnRPZkxpbmUoY2VsbC50ZXh0QnVmZmVyLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpKSArIDE7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRWRpdG9yT3BlcmF0aW9uRXZlbnQoZTogSVRyaWdnZXJFZGl0b3JPcGVyYXRpb25FdmVudCkge1xuXHRcdHRoaXMudHJhY2tlZENlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRpZiAoY2VsbC5jZWxsVmlld01vZGVsLmhhbmRsZSA9PT0gdGhpcy5hbmNob3JDZWxsPy5bMF0uaGFuZGxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZXZlbnRzQ29sbGVjdG9yID0gbmV3IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvcigpO1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY3Vyc29yc0NvbnRyb2xsZXJzLmdldChjZWxsLmNlbGxWaWV3TW9kZWwudXJpKTtcblx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmV4ZWN1dGVFZGl0b3JPcGVyYXRpb24oY29udHJvbGxlciwgZXZlbnRzQ29sbGVjdG9yLCBlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZXhlY3V0ZUVkaXRvck9wZXJhdGlvbihjb250cm9sbGVyOiBDdXJzb3JzQ29udHJvbGxlciwgZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IsIGU6IElUcmlnZ2VyRWRpdG9yT3BlcmF0aW9uRXZlbnQpIHtcblx0XHRzd2l0Y2ggKGUuaGFuZGxlcklkKSB7XG5cdFx0XHRjYXNlIEhhbmRsZXIuQ29tcG9zaXRpb25TdGFydDpcblx0XHRcdFx0Y29udHJvbGxlci5zdGFydENvbXBvc2l0aW9uKGV2ZW50c0NvbGxlY3Rvcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBIYW5kbGVyLkNvbXBvc2l0aW9uRW5kOlxuXHRcdFx0XHRjb250cm9sbGVyLmVuZENvbXBvc2l0aW9uKGV2ZW50c0NvbGxlY3RvciwgZS5zb3VyY2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSGFuZGxlci5SZXBsYWNlUHJldmlvdXNDaGFyOiB7XG5cdFx0XHRcdGNvbnN0IGFyZ3MgPSA8UGFydGlhbDxSZXBsYWNlUHJldmlvdXNDaGFyUGF5bG9hZD4+ZS5wYXlsb2FkO1xuXHRcdFx0XHRjb250cm9sbGVyLmNvbXBvc2l0aW9uVHlwZShldmVudHNDb2xsZWN0b3IsIGFyZ3MudGV4dCB8fCAnJywgYXJncy5yZXBsYWNlQ2hhckNudCB8fCAwLCAwLCAwLCBlLnNvdXJjZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBIYW5kbGVyLkNvbXBvc2l0aW9uVHlwZToge1xuXHRcdFx0XHRjb25zdCBhcmdzID0gPFBhcnRpYWw8Q29tcG9zaXRpb25UeXBlUGF5bG9hZD4+ZS5wYXlsb2FkO1xuXHRcdFx0XHRjb250cm9sbGVyLmNvbXBvc2l0aW9uVHlwZShldmVudHNDb2xsZWN0b3IsIGFyZ3MudGV4dCB8fCAnJywgYXJncy5yZXBsYWNlUHJldkNoYXJDbnQgfHwgMCwgYXJncy5yZXBsYWNlTmV4dENoYXJDbnQgfHwgMCwgYXJncy5wb3NpdGlvbkRlbHRhIHx8IDAsIGUuc291cmNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEhhbmRsZXIuUGFzdGU6IHtcblx0XHRcdFx0Y29uc3QgYXJncyA9IDxQYXJ0aWFsPFBhc3RlUGF5bG9hZD4+ZS5wYXlsb2FkO1xuXHRcdFx0XHRjb250cm9sbGVyLnBhc3RlKGV2ZW50c0NvbGxlY3RvciwgYXJncy50ZXh0IHx8ICcnLCBhcmdzLnBhc3RlT25OZXdMaW5lIHx8IGZhbHNlLCBhcmdzLm11bHRpY3Vyc29yVGV4dCB8fCBudWxsLCBlLnNvdXJjZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBIYW5kbGVyLkN1dDpcblx0XHRcdFx0Y29udHJvbGxlci5jdXQoZXZlbnRzQ29sbGVjdG9yLCBlLnNvdXJjZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVmlld01vZGVsU2VsZWN0aW9ucygpIHtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgdGhpcy50cmFja2VkQ2VsbHMpIHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmN1cnNvcnNDb250cm9sbGVycy5nZXQoY2VsbC5jZWxsVmlld01vZGVsLnVyaSk7XG5cdFx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdFx0Ly8gc2hvdWxkIG5vdCBoYXBwZW5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjZWxsLmNlbGxWaWV3TW9kZWwuc2V0U2VsZWN0aW9ucyhjb250cm9sbGVyLmdldFNlbGVjdGlvbnMoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGaW5hbFVuZG9SZWRvKCkge1xuXHRcdGNvbnN0IGFuY2hvckNlbGxNb2RlbCA9IHRoaXMuYW5jaG9yQ2VsbD8uWzFdLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFhbmNob3JDZWxsTW9kZWwpIHtcblx0XHRcdC8vIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3RWxlbWVudHNNYXA6IFJlc291cmNlTWFwPElVbmRvUmVkb0VsZW1lbnRbXT4gPSBuZXcgUmVzb3VyY2VNYXA8SVVuZG9SZWRvRWxlbWVudFtdPigpO1xuXHRcdGNvbnN0IHJlc291cmNlczogVVJJW10gPSBbXTtcblxuXHRcdHRoaXMudHJhY2tlZENlbGxzLmZvckVhY2godHJhY2tlZE1hdGNoID0+IHtcblx0XHRcdGNvbnN0IHVuZG9SZWRvU3RhdGUgPSB0cmFja2VkTWF0Y2gudW5kb1JlZG9IaXN0b3J5O1xuXHRcdFx0aWYgKCF1bmRvUmVkb1N0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmVzb3VyY2VzLnB1c2godHJhY2tlZE1hdGNoLmNlbGxWaWV3TW9kZWwudXJpKTtcblxuXHRcdFx0Y29uc3QgY3VycmVudFBhc3RFbGVtZW50cyA9IHRoaXMudW5kb1JlZG9TZXJ2aWNlLmdldEVsZW1lbnRzKHRyYWNrZWRNYXRjaC5jZWxsVmlld01vZGVsLnVyaSkucGFzdC5zbGljZSgpO1xuXHRcdFx0Y29uc3Qgb2xkUGFzdEVsZW1lbnRzID0gdHJhY2tlZE1hdGNoLnVuZG9SZWRvSGlzdG9yeS5wYXN0LnNsaWNlKCk7XG5cdFx0XHRjb25zdCBuZXdFbGVtZW50cyA9IGN1cnJlbnRQYXN0RWxlbWVudHMuc2xpY2Uob2xkUGFzdEVsZW1lbnRzLmxlbmd0aCk7XG5cdFx0XHRpZiAobmV3RWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bmV3RWxlbWVudHNNYXAuc2V0KHRyYWNrZWRNYXRjaC5jZWxsVmlld01vZGVsLnVyaSwgbmV3RWxlbWVudHMpO1xuXG5cdFx0XHR0aGlzLnVuZG9SZWRvU2VydmljZS5yZW1vdmVFbGVtZW50cyh0cmFja2VkTWF0Y2guY2VsbFZpZXdNb2RlbC51cmkpO1xuXHRcdFx0b2xkUGFzdEVsZW1lbnRzLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRcdHRoaXMudW5kb1JlZG9TZXJ2aWNlLnB1c2hFbGVtZW50KGVsZW1lbnQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnVuZG9SZWRvU2VydmljZS5wdXNoRWxlbWVudCh7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZSxcblx0XHRcdHJlc291cmNlczogcmVzb3VyY2VzLFxuXHRcdFx0bGFiZWw6ICdNdWx0aSBDdXJzb3IgRWRpdCcsXG5cdFx0XHRjb2RlOiAnbXVsdGlDdXJzb3JFZGl0Jyxcblx0XHRcdGNvbmZpcm1CZWZvcmVVbmRvOiBmYWxzZSxcblx0XHRcdHVuZG86IGFzeW5jICgpID0+IHtcblx0XHRcdFx0bmV3RWxlbWVudHNNYXAuZm9yRWFjaChhc3luYyB2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0dmFsdWUucmV2ZXJzZSgpLmZvckVhY2goYXN5bmMgZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCBlbGVtZW50LnVuZG8oKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVkbzogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRuZXdFbGVtZW50c01hcC5mb3JFYWNoKGFzeW5jIHZhbHVlID0+IHtcblx0XHRcdFx0XHR2YWx1ZS5mb3JFYWNoKGFzeW5jIGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgZWxlbWVudC5yZWRvKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJlc2V0VG9JZGxlU3RhdGUoKSB7XG5cdFx0dGhpcy5zdGF0ZSA9IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5JZGxlO1xuXHRcdHRoaXMuX25iTXVsdGlTZWxlY3RTdGF0ZS5zZXQoTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLklkbGUpO1xuXHRcdHRoaXMuX25iSXNNdWx0aVNlbGVjdFNlc3Npb24uc2V0KGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZUZpbmFsVW5kb1JlZG8oKTtcblxuXHRcdHRoaXMudHJhY2tlZENlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHR0aGlzLmNsZWFyRGVjb3JhdGlvbnMoY2VsbCk7XG5cdFx0XHRjZWxsLmNlbGxWaWV3TW9kZWwuc2V0U2VsZWN0aW9ucyhbY2VsbC5pbml0aWFsU2VsZWN0aW9uXSk7IC8vIGNvcnJlY3QgY3Vyc29yIHBsYWNlbWVudCB1cG9uIGV4aXRpbmcgY21kLWQgc2Vzc2lvblxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hbmNob3JEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuYW5jaG9yQ2VsbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmN1cnNvcnNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuY3Vyc29yc0NvbnRyb2xsZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy50cmFja2VkQ2VsbHMgPSBbXTtcblx0XHR0aGlzLnRvdGFsTWF0Y2hlc0NvdW50ID0gMDtcblx0XHR0aGlzLnN0YXJ0UG9zaXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy53b3JkID0gJyc7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZmluZEFuZFRyYWNrTmV4dFNlbGVjdGlvbihmb2N1c2VkQ2VsbDogSUNlbGxWaWV3TW9kZWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLklkbGUpIHsgLy8gbW92ZSBjdXJzb3IgdG8gZW5kIG9mIHRoZSBzeW1ib2wgKyB0cmFjayBpdCwgdHJhbnNpdGlvbiB0byBzZWxlY3Rpbmcgc3RhdGVcblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGZvY3VzZWRDZWxsLnRleHRNb2RlbDtcblx0XHRcdGlmICghdGV4dE1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW5wdXRTZWxlY3Rpb24gPSBmb2N1c2VkQ2VsbC5nZXRTZWxlY3Rpb25zKClbMF07XG5cdFx0XHRjb25zdCB3b3JkID0gdGhpcy5nZXRXb3JkKGlucHV0U2VsZWN0aW9uLCB0ZXh0TW9kZWwpO1xuXHRcdFx0aWYgKCF3b3JkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMud29yZCA9IHdvcmQud29yZDtcblxuXHRcdFx0Ly8gUmVjb3JkIHRoZSB0b3RhbCBudW1iZXIgb2YgbWF0Y2hlcyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBzZWxlY3Rpb24gcHJvY2VzcyBmb3IgcGVyZm9ybWFuY2Vcblx0XHRcdGNvbnN0IG5vdGVib29rVGV4dE1vZGVsID0gdGhpcy5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRpZiAobm90ZWJvb2tUZXh0TW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgYWxsTWF0Y2hlcyA9IG5vdGVib29rVGV4dE1vZGVsLmZpbmRNYXRjaGVzKHRoaXMud29yZCwgZmFsc2UsIHRydWUsIFVTVUFMX1dPUkRfU0VQQVJBVE9SUyk7XG5cdFx0XHRcdHRoaXMudG90YWxNYXRjaGVzQ291bnQgPSBhbGxNYXRjaGVzLnJlZHVjZSgoc3VtLCBjZWxsTWF0Y2gpID0+IHN1bSArIGNlbGxNYXRjaC5tYXRjaGVzLmxlbmd0aCwgMCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoZm9jdXNlZENlbGwpO1xuXHRcdFx0aWYgKGluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnN0YXJ0UG9zaXRpb24gPSB7XG5cdFx0XHRcdGNlbGxJbmRleDogaW5kZXgsXG5cdFx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oaW5wdXRTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uKSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24oXG5cdFx0XHRcdGlucHV0U2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0d29yZC5zdGFydENvbHVtbixcblx0XHRcdFx0aW5wdXRTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHR3b3JkLmVuZENvbHVtblxuXHRcdFx0KTtcblx0XHRcdGZvY3VzZWRDZWxsLnNldFNlbGVjdGlvbnMoW25ld1NlbGVjdGlvbl0pO1xuXG5cdFx0XHR0aGlzLmFuY2hvckNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmFjdGl2ZUNlbGxBbmRDb2RlRWRpdG9yO1xuXHRcdFx0aWYgKCF0aGlzLmFuY2hvckNlbGwgfHwgdGhpcy5hbmNob3JDZWxsWzBdLmhhbmRsZSAhPT0gZm9jdXNlZENlbGwuaGFuZGxlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQWN0aXZlIGNlbGwgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSBjZWxsIHBhc3NlZCBhcyBjb250ZXh0Jyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoISh0aGlzLmFuY2hvckNlbGxbMV0gaW5zdGFuY2VvZiBDb2RlRWRpdG9yV2lkZ2V0KSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FjdGl2ZSBjZWxsIGlzIG5vdCBhbiBpbnN0YW5jZSBvZiBDb2RlRWRpdG9yV2lkZ2V0Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlVHJhY2tlZENlbGwoZm9jdXNlZENlbGwsIFtuZXdTZWxlY3Rpb25dKTtcblxuXHRcdFx0dGhpcy5fbmJJc011bHRpU2VsZWN0U2Vzc2lvbi5zZXQodHJ1ZSk7XG5cdFx0XHR0aGlzLnN0YXRlID0gTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLlNlbGVjdGluZztcblx0XHRcdHRoaXMuX25iTXVsdGlTZWxlY3RTdGF0ZS5zZXQoTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLlNlbGVjdGluZyk7XG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQW5jaG9yQ2VsbC5maXJlKCk7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5TZWxlY3RpbmcpIHsgLy8gdXNlIHRoZSB3b3JkIHdlIHN0b3JlZCBmcm9tIGlkbGUgc3RhdGUgdHJhbnNpdGlvbiB0byBmaW5kIG5leHQgbWF0Y2gsIHRyYWNrIGl0XG5cdFx0XHRjb25zdCBub3RlYm9va1RleHRNb2RlbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0aWYgKCFub3RlYm9va1RleHRNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoZm9jdXNlZENlbGwpO1xuXHRcdFx0aWYgKGluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBzaG91bGQgbm90IGhhcHBlblxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuc3RhcnRQb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm47IC8vIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGlmIGFsbCBtYXRjaGVzIGFyZSBhbHJlYWR5IGNvdmVyZWQgYnkgc2VsZWN0aW9ucyB0byBhdm9pZCBpbmZpbml0ZSBsb29waW5nXG5cdFx0XHRjb25zdCB0b3RhbFNlbGVjdGlvbnMgPSB0aGlzLnRyYWNrZWRDZWxscy5yZWR1Y2UoKHN1bSwgdHJhY2tlZENlbGwpID0+IHN1bSArIHRyYWNrZWRDZWxsLm1hdGNoU2VsZWN0aW9ucy5sZW5ndGgsIDApO1xuXG5cdFx0XHRpZiAodG90YWxTZWxlY3Rpb25zID49IHRoaXMudG90YWxNYXRjaGVzQ291bnQpIHtcblx0XHRcdFx0Ly8gQWxsIG1hdGNoZXMgYXJlIGFscmVhZHkgc2VsZWN0ZWQsIG1ha2UgdGhpcyBhIG5vLW9wIGxpa2UgaW4gcmVndWxhciBlZGl0b3JzXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmluZFJlc3VsdCA9IG5vdGVib29rVGV4dE1vZGVsLmZpbmROZXh0TWF0Y2goXG5cdFx0XHRcdHRoaXMud29yZCxcblx0XHRcdFx0eyBjZWxsSW5kZXg6IGluZGV4LCBwb3NpdGlvbjogZm9jdXNlZENlbGwuZ2V0U2VsZWN0aW9ucygpW2ZvY3VzZWRDZWxsLmdldFNlbGVjdGlvbnMoKS5sZW5ndGggLSAxXS5nZXRFbmRQb3NpdGlvbigpIH0sXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRVU1VBTF9XT1JEX1NFUEFSQVRPUlMsXG5cdFx0XHRcdHRoaXMuc3RhcnRQb3NpdGlvbixcblx0XHRcdCk7XG5cdFx0XHRpZiAoIWZpbmRSZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaW5kUmVzdWx0Q2VsbFZpZXdNb2RlbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SGFuZGxlKGZpbmRSZXN1bHQuY2VsbC5oYW5kbGUpO1xuXHRcdFx0aWYgKCFmaW5kUmVzdWx0Q2VsbFZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmaW5kUmVzdWx0LmNlbGwuaGFuZGxlID09PSBmb2N1c2VkQ2VsbC5oYW5kbGUpIHsgLy8gbWF0Y2ggaXMgaW4gdGhlIHNhbWUgY2VsbCwgZmluZCB0cmFja2VkIGVudHJ5LCB1cGRhdGUgYW5kIHNldCBzZWxlY3Rpb25zIGluIHZpZXdtb2RlbCBhbmQgY3Vyc29yQ29udHJvbGxlclxuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gWy4uLmZvY3VzZWRDZWxsLmdldFNlbGVjdGlvbnMoKSwgU2VsZWN0aW9uLmZyb21SYW5nZShmaW5kUmVzdWx0Lm1hdGNoLnJhbmdlLCBTZWxlY3Rpb25EaXJlY3Rpb24uTFRSKV07XG5cdFx0XHRcdGNvbnN0IHRyYWNrZWRDZWxsID0gYXdhaXQgdGhpcy51cGRhdGVUcmFja2VkQ2VsbChmb2N1c2VkQ2VsbCwgc2VsZWN0aW9ucyk7XG5cdFx0XHRcdGZpbmRSZXN1bHRDZWxsVmlld01vZGVsLnNldFNlbGVjdGlvbnModHJhY2tlZENlbGwubWF0Y2hTZWxlY3Rpb25zKTtcblxuXG5cdFx0XHR9IGVsc2UgaWYgKGZpbmRSZXN1bHQuY2VsbC5oYW5kbGUgIT09IGZvY3VzZWRDZWxsLmhhbmRsZSkge1x0Ly8gcmVzdWx0IGlzIGluIGEgZGlmZmVyZW50IGNlbGwsIG1vdmUgZm9jdXMgdGhlcmUgYW5kIGFwcGx5IHNlbGVjdGlvbiwgdGhlbiB1cGRhdGUgYW5jaG9yXG5cdFx0XHRcdGF3YWl0IHRoaXMubm90ZWJvb2tFZGl0b3IucmV2ZWFsUmFuZ2VJblZpZXdBc3luYyhmaW5kUmVzdWx0Q2VsbFZpZXdNb2RlbCwgZmluZFJlc3VsdC5tYXRjaC5yYW5nZSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoZmluZFJlc3VsdENlbGxWaWV3TW9kZWwsICdlZGl0b3InKTtcblxuXHRcdFx0XHRjb25zdCB0cmFja2VkQ2VsbCA9IGF3YWl0IHRoaXMudXBkYXRlVHJhY2tlZENlbGwoZmluZFJlc3VsdENlbGxWaWV3TW9kZWwsIFtTZWxlY3Rpb24uZnJvbVJhbmdlKGZpbmRSZXN1bHQubWF0Y2gucmFuZ2UsIFNlbGVjdGlvbkRpcmVjdGlvbi5MVFIpXSk7XG5cdFx0XHRcdGZpbmRSZXN1bHRDZWxsVmlld01vZGVsLnNldFNlbGVjdGlvbnModHJhY2tlZENlbGwubWF0Y2hTZWxlY3Rpb25zKTtcblxuXHRcdFx0XHR0aGlzLmFuY2hvckNlbGwgPSB0aGlzLm5vdGVib29rRWRpdG9yLmFjdGl2ZUNlbGxBbmRDb2RlRWRpdG9yO1xuXHRcdFx0XHRpZiAoIXRoaXMuYW5jaG9yQ2VsbCB8fCAhKHRoaXMuYW5jaG9yQ2VsbFsxXSBpbnN0YW5jZW9mIENvZGVFZGl0b3JXaWRnZXQpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBY3RpdmUgY2VsbCBpcyBub3QgYW4gaW5zdGFuY2Ugb2YgQ29kZUVkaXRvcldpZGdldCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBbmNob3JDZWxsLmZpcmUoKTtcblxuXHRcdFx0XHQvLyB3ZSBzZXQgdGhlIGRlY29yYXRpb25zIG1hbnVhbGx5IGZvciB0aGUgY2VsbCB3ZSBoYXZlIGp1c3QgZGVwYXJ0ZWQsIHNpbmNlIGl0IGJsdXJzXG5cdFx0XHRcdC8vIHdlIGNhbiBmaW5kIHRoZSBtYXRjaCB3aXRoIHRoZSBoYW5kbGUgdGhhdCB0aGUgZmluZCBhbmQgdHJhY2sgcmVxdWVzdCBvcmlnaW5hdGVkXG5cdFx0XHRcdHRoaXMuaW5pdGlhbGl6ZU11bHRpU2VsZWN0RGVjb3JhdGlvbnModGhpcy50cmFja2VkQ2VsbHMuZmluZCh0cmFja2VkQ2VsbCA9PiB0cmFja2VkQ2VsbC5jZWxsVmlld01vZGVsLmhhbmRsZSA9PT0gZm9jdXNlZENlbGwuaGFuZGxlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIHNlbGVjdEFsbE1hdGNoZXMoZm9jdXNlZENlbGw6IElDZWxsVmlld01vZGVsLCBtYXRjaGVzPzogQ2VsbEZpbmRNYXRjaFdpdGhJbmRleFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tUZXh0TW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbDtcblx0XHRpZiAoIW5vdGVib29rVGV4dE1vZGVsKSB7XG5cdFx0XHRyZXR1cm47IC8vIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0fVxuXG5cdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlRmluZFdpZGdldFNlbGVjdEFsbE1hdGNoZXMobWF0Y2hlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlQ2VsbEVkaXRvclNlbGVjdEFsbE1hdGNoZXMobm90ZWJvb2tUZXh0TW9kZWwsIGZvY3VzZWRDZWxsKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnN5bmNDdXJzb3JzQ29udHJvbGxlcnMoKTtcblx0XHR0aGlzLnN5bmNBbmNob3JMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLnVwZGF0ZUxhenlEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVGaW5kV2lkZ2V0U2VsZWN0QWxsTWF0Y2hlcyhtYXRjaGVzOiBDZWxsRmluZE1hdGNoV2l0aEluZGV4W10pIHtcblx0XHQvLyBUT0RPOiBzdXBwb3J0IHNlbGVjdGluZyBzdGF0ZSBtYXliZS4gVVggY291bGQgZ2V0IGNvbmZ1c2luZyBzaW5jZSBzZWxlY3Rpbmcgc3RhdGUgY291bGQgYmUgaGl0IHZpYSBjdHJsK2Qgd2hpY2ggd291bGQgaGF2ZSBkaWZmZXJlbnQgZmlsdGVycyAoY2FzZSBzZW5zZXRpdmUgKyB3aG9sZSB3b3JkKVxuXHRcdGlmICh0aGlzLnN0YXRlICE9PSBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuSWRsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghbWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKG1hdGNoZXNbMF0uY2VsbCwgJ2VkaXRvcicpO1xuXHRcdHRoaXMuYW5jaG9yQ2VsbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuYWN0aXZlQ2VsbEFuZENvZGVFZGl0b3I7XG5cblx0XHR0aGlzLnRyYWNrZWRDZWxscyA9IFtdO1xuXHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuXHRcdFx0dGhpcy51cGRhdGVUcmFja2VkQ2VsbChtYXRjaC5jZWxsLCBtYXRjaC5jb250ZW50TWF0Y2hlcy5tYXAobWF0Y2ggPT4gU2VsZWN0aW9uLmZyb21SYW5nZShtYXRjaC5yYW5nZSwgU2VsZWN0aW9uRGlyZWN0aW9uLkxUUikpKTtcblxuXHRcdFx0aWYgKHRoaXMuYW5jaG9yQ2VsbCAmJiBtYXRjaC5jZWxsLmhhbmRsZSA9PT0gdGhpcy5hbmNob3JDZWxsWzBdLmhhbmRsZSkge1xuXHRcdFx0XHQvLyBvbmx5IGV4cGxpY2l0bHkgc2V0IHRoZSBmb2N1c2VkIGNlbGwncyBzZWxlY3Rpb25zLCB0aGUgcmVzdCBhcmUgaGFuZGxlZCBieSBjdXJzb3IgY29udHJvbGxlcnMgKyBkZWNvcmF0aW9uc1xuXHRcdFx0XHRtYXRjaC5jZWxsLnNldFNlbGVjdGlvbnMobWF0Y2guY29udGVudE1hdGNoZXMubWFwKG1hdGNoID0+IFNlbGVjdGlvbi5mcm9tUmFuZ2UobWF0Y2gucmFuZ2UsIFNlbGVjdGlvbkRpcmVjdGlvbi5MVFIpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbmJJc011bHRpU2VsZWN0U2Vzc2lvbi5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5zdGF0ZSA9IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5TZWxlY3Rpbmc7XG5cdFx0dGhpcy5fbmJNdWx0aVNlbGVjdFN0YXRlLnNldChOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuU2VsZWN0aW5nKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlQ2VsbEVkaXRvclNlbGVjdEFsbE1hdGNoZXMobm90ZWJvb2tUZXh0TW9kZWw6IE5vdGVib29rVGV4dE1vZGVsLCBmb2N1c2VkQ2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHQvLyBjYW4gYmUgdHJpZ2dlcmVkIG1pZCBtdWx0aXNlbGVjdCBzZXNzaW9uLCBvciBmcm9tIGlkbGUgc3RhdGVcblx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLklkbGUpIHtcblx0XHRcdC8vIGdldCB3b3JkIGZyb20gY3VycmVudCBzZWxlY3Rpb24gKyByZXN0IG9mIG5vdGVib29rIG9iamVjdHNcblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGZvY3VzZWRDZWxsLnRleHRNb2RlbDtcblx0XHRcdGlmICghdGV4dE1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlucHV0U2VsZWN0aW9uID0gZm9jdXNlZENlbGwuZ2V0U2VsZWN0aW9ucygpWzBdO1xuXHRcdFx0Y29uc3Qgd29yZCA9IHRoaXMuZ2V0V29yZChpbnB1dFNlbGVjdGlvbiwgdGV4dE1vZGVsKTtcblx0XHRcdGlmICghd29yZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLndvcmQgPSB3b3JkLndvcmQ7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGZvY3VzZWRDZWxsKTtcblx0XHRcdGlmIChpbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuc3RhcnRQb3NpdGlvbiA9IHtcblx0XHRcdFx0Y2VsbEluZGV4OiBpbmRleCxcblx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbihpbnB1dFNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHdvcmQuc3RhcnRDb2x1bW4pLFxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5hbmNob3JDZWxsID0gdGhpcy5ub3RlYm9va0VkaXRvci5hY3RpdmVDZWxsQW5kQ29kZUVkaXRvcjtcblx0XHRcdGlmICghdGhpcy5hbmNob3JDZWxsIHx8IHRoaXMuYW5jaG9yQ2VsbFswXS5oYW5kbGUgIT09IGZvY3VzZWRDZWxsLmhhbmRsZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FjdGl2ZSBjZWxsIGlzIG5vdCB0aGUgc2FtZSBhcyB0aGUgY2VsbCBwYXNzZWQgYXMgY29udGV4dCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEodGhpcy5hbmNob3JDZWxsWzFdIGluc3RhbmNlb2YgQ29kZUVkaXRvcldpZGdldCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBY3RpdmUgY2VsbCBpcyBub3QgYW4gaW5zdGFuY2Ugb2YgQ29kZUVkaXRvcldpZGdldCcpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBnZXQgYWxsIG1hdGNoZXMgaW4gdGhlIG5vdGVib29rXG5cdFx0XHRjb25zdCBmaW5kUmVzdWx0cyA9IG5vdGVib29rVGV4dE1vZGVsLmZpbmRNYXRjaGVzKHRoaXMud29yZCwgZmFsc2UsIHRydWUsIFVTVUFMX1dPUkRfU0VQQVJBVE9SUyk7XG5cblx0XHRcdC8vIGNyZWF0ZSB0aGUgdHJhY2tlZCBtYXRjaGVzIGZvciBldmVyeSByZXN1bHQsIG5lZWRlZCBmb3IgY3Vyc29yIGNvbnRyb2xsZXJzXG5cdFx0XHR0aGlzLnRyYWNrZWRDZWxscyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCByZXMgb2YgZmluZFJlc3VsdHMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVUcmFja2VkQ2VsbChyZXMuY2VsbCwgcmVzLm1hdGNoZXMubWFwKG1hdGNoID0+IFNlbGVjdGlvbi5mcm9tUmFuZ2UobWF0Y2gucmFuZ2UsIFNlbGVjdGlvbkRpcmVjdGlvbi5MVFIpKSk7XG5cblx0XHRcdFx0aWYgKHJlcy5jZWxsLmhhbmRsZSA9PT0gZm9jdXNlZENlbGwuaGFuZGxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2VsbFZpZXdNb2RlbCA9IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SGFuZGxlKHJlcy5jZWxsLmhhbmRsZSk7XG5cdFx0XHRcdFx0aWYgKGNlbGxWaWV3TW9kZWwpIHtcblx0XHRcdFx0XHRcdGNlbGxWaWV3TW9kZWwuc2V0U2VsZWN0aW9ucyhyZXMubWF0Y2hlcy5tYXAobWF0Y2ggPT4gU2VsZWN0aW9uLmZyb21SYW5nZShtYXRjaC5yYW5nZSwgU2VsZWN0aW9uRGlyZWN0aW9uLkxUUikpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbmJJc011bHRpU2VsZWN0U2Vzc2lvbi5zZXQodHJ1ZSk7XG5cdFx0XHR0aGlzLnN0YXRlID0gTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLlNlbGVjdGluZztcblx0XHRcdHRoaXMuX25iTXVsdGlTZWxlY3RTdGF0ZS5zZXQoTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLlNlbGVjdGluZyk7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5TZWxlY3RpbmcpIHtcblx0XHRcdC8vIHdlIHdpbGwgYWxyZWFkeSBoYXZlIGEgd29yZCArIHNvbWUgbnVtYmVyIG9mIHRyYWNrZWQgbWF0Y2hlcywgbmVlZCB0byB1cGRhdGUgdGhlbSB3aXRoIHRoZSByZXN0IGdpdmVuIGZpbmRBbGxNYXRjaGVzIHJlc3VsdFxuXHRcdFx0Y29uc3QgZmluZFJlc3VsdHMgPSBub3RlYm9va1RleHRNb2RlbC5maW5kTWF0Y2hlcyh0aGlzLndvcmQsIGZhbHNlLCB0cnVlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMpO1xuXG5cdFx0XHQvLyB1cGRhdGUgZXhpc3RpbmcgdHJhY2tlZCBtYXRjaGVzIHdpdGggbmV3IHNlbGVjdGlvbnMgYW5kIGNyZWF0ZSBuZXcgdHJhY2tlZCBtYXRjaGVzIGZvciBjZWxscyB0aGF0IGFyZW4ndCB0cmFja2VkIHlldFxuXHRcdFx0Zm9yIChjb25zdCByZXMgb2YgZmluZFJlc3VsdHMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVUcmFja2VkQ2VsbChyZXMuY2VsbCwgcmVzLm1hdGNoZXMubWFwKG1hdGNoID0+IFNlbGVjdGlvbi5mcm9tUmFuZ2UobWF0Y2gucmFuZ2UsIFNlbGVjdGlvbkRpcmVjdGlvbi5MVFIpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVUcmFja2VkQ2VsbChjZWxsOiBJQ2VsbFZpZXdNb2RlbCB8IE5vdGVib29rQ2VsbFRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10pIHtcblx0XHRjb25zdCBjZWxsVmlld01vZGVsID0gY2VsbCBpbnN0YW5jZW9mIE5vdGVib29rQ2VsbFRleHRNb2RlbCA/IHRoaXMubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SGFuZGxlKGNlbGwuaGFuZGxlKSA6IGNlbGw7XG5cdFx0aWYgKCFjZWxsVmlld01vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NlbGwgbm90IGZvdW5kJyk7XG5cdFx0fVxuXG5cdFx0bGV0IHRyYWNrZWRNYXRjaCA9IHRoaXMudHJhY2tlZENlbGxzLmZpbmQodHJhY2tlZENlbGwgPT4gdHJhY2tlZENlbGwuY2VsbFZpZXdNb2RlbC5oYW5kbGUgPT09IGNlbGxWaWV3TW9kZWwuaGFuZGxlKTtcblxuXHRcdGlmICh0cmFja2VkTWF0Y2gpIHtcblx0XHRcdHRoaXMuY2xlYXJEZWNvcmF0aW9ucyh0cmFja2VkTWF0Y2gpOyAvLyBuZWVkIHRoaXMgdG8gYXZvaWQgbGVha2luZyBkZWNvcmF0aW9ucyAtLSBUT0RPOiBqdXN0IG9wdGltaXplIHRoZSBsYXp5IGRlY29yYXRpb25zIGZuXG5cdFx0XHR0cmFja2VkTWF0Y2gubWF0Y2hTZWxlY3Rpb25zID0gc2VsZWN0aW9ucztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaW5pdGlhbFNlbGVjdGlvbiA9IGNlbGxWaWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpWzBdO1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gYXdhaXQgY2VsbFZpZXdNb2RlbC5yZXNvbHZlVGV4dE1vZGVsKCk7XG5cdFx0XHR0ZXh0TW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXG5cdFx0XHRjb25zdCBlZGl0b3JDb25maWcgPSB0aGlzLmNvbnN0cnVjdENlbGxFZGl0b3JPcHRpb25zKGNlbGxWaWV3TW9kZWwpO1xuXHRcdFx0Y29uc3QgcmF3RWRpdG9yT3B0aW9ucyA9IGVkaXRvckNvbmZpZy5nZXRSYXdPcHRpb25zKCk7XG5cdFx0XHRjb25zdCBjdXJzb3JDb25maWc6IE5vdGVib29rQ3Vyc29yQ29uZmlnID0ge1xuXHRcdFx0XHRjdXJzb3JTdHlsZTogY3Vyc29yU3R5bGVGcm9tU3RyaW5nKHJhd0VkaXRvck9wdGlvbnMuY3Vyc29yU3R5bGUhKSxcblx0XHRcdFx0Y3Vyc29yQmxpbmtpbmc6IGN1cnNvckJsaW5raW5nU3R5bGVGcm9tU3RyaW5nKHJhd0VkaXRvck9wdGlvbnMuY3Vyc29yQmxpbmtpbmchKSxcblx0XHRcdFx0Y3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb246IHJhd0VkaXRvck9wdGlvbnMuY3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24hXG5cdFx0XHR9O1xuXG5cdFx0XHR0cmFja2VkTWF0Y2ggPSB7XG5cdFx0XHRcdGNlbGxWaWV3TW9kZWw6IGNlbGxWaWV3TW9kZWwsXG5cdFx0XHRcdGluaXRpYWxTZWxlY3Rpb246IGluaXRpYWxTZWxlY3Rpb24sXG5cdFx0XHRcdG1hdGNoU2VsZWN0aW9uczogc2VsZWN0aW9ucyxcblx0XHRcdFx0ZWRpdG9yQ29uZmlnOiBlZGl0b3JDb25maWcsXG5cdFx0XHRcdGN1cnNvckNvbmZpZzogY3Vyc29yQ29uZmlnLFxuXHRcdFx0XHRkZWNvcmF0aW9uSWRzOiBbXSxcblx0XHRcdFx0dW5kb1JlZG9IaXN0b3J5OiB0aGlzLnVuZG9SZWRvU2VydmljZS5nZXRFbGVtZW50cyhjZWxsVmlld01vZGVsLnVyaSlcblx0XHRcdH07XG5cdFx0XHR0aGlzLnRyYWNrZWRDZWxscy5wdXNoKHRyYWNrZWRNYXRjaCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cmFja2VkTWF0Y2g7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZGVsZXRlTGVmdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRyYWNrZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuY3Vyc29yc0NvbnRyb2xsZXJzLmdldChjZWxsLmNlbGxWaWV3TW9kZWwudXJpKTtcblx0XHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0XHQvLyBzaG91bGQgbm90IGhhcHBlblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IFssIGNvbW1hbmRzXSA9IERlbGV0ZU9wZXJhdGlvbnMuZGVsZXRlTGVmdChcblx0XHRcdFx0Y29udHJvbGxlci5nZXRQcmV2RWRpdE9wZXJhdGlvblR5cGUoKSxcblx0XHRcdFx0Y29udHJvbGxlci5jb250ZXh0LmN1cnNvckNvbmZpZyxcblx0XHRcdFx0Y29udHJvbGxlci5jb250ZXh0Lm1vZGVsLFxuXHRcdFx0XHRjb250cm9sbGVyLmdldFNlbGVjdGlvbnMoKSxcblx0XHRcdFx0Y29udHJvbGxlci5nZXRBdXRvQ2xvc2VkQ2hhcmFjdGVycygpLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZGVsU2VsZWN0aW9ucyA9IENvbW1hbmRFeGVjdXRvci5leGVjdXRlQ29tbWFuZHMoY29udHJvbGxlci5jb250ZXh0Lm1vZGVsLCBjb250cm9sbGVyLmdldFNlbGVjdGlvbnMoKSwgY29tbWFuZHMpO1xuXHRcdFx0aWYgKCFkZWxTZWxlY3Rpb25zKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnRyb2xsZXIuc2V0U2VsZWN0aW9ucyhuZXcgVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKCksIHVuZGVmaW5lZCwgZGVsU2VsZWN0aW9ucywgQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KTtcblx0XHR9KTtcblx0XHR0aGlzLnVwZGF0ZUxhenlEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGRlbGV0ZVJpZ2h0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2tlZENlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5jdXJzb3JzQ29udHJvbGxlcnMuZ2V0KGNlbGwuY2VsbFZpZXdNb2RlbC51cmkpO1xuXHRcdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRcdC8vIHNob3VsZCBub3QgaGFwcGVuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgWywgY29tbWFuZHNdID0gRGVsZXRlT3BlcmF0aW9ucy5kZWxldGVSaWdodChcblx0XHRcdFx0Y29udHJvbGxlci5nZXRQcmV2RWRpdE9wZXJhdGlvblR5cGUoKSxcblx0XHRcdFx0Y29udHJvbGxlci5jb250ZXh0LmN1cnNvckNvbmZpZyxcblx0XHRcdFx0Y29udHJvbGxlci5jb250ZXh0Lm1vZGVsLFxuXHRcdFx0XHRjb250cm9sbGVyLmdldFNlbGVjdGlvbnMoKSxcblx0XHRcdCk7XG5cblx0XHRcdGlmIChjZWxsLmNlbGxWaWV3TW9kZWwuaGFuZGxlICE9PSB0aGlzLmFuY2hvckNlbGw/LlswXS5oYW5kbGUpIHtcblx0XHRcdFx0Y29uc3QgZGVsU2VsZWN0aW9ucyA9IENvbW1hbmRFeGVjdXRvci5leGVjdXRlQ29tbWFuZHMoY29udHJvbGxlci5jb250ZXh0Lm1vZGVsLCBjb250cm9sbGVyLmdldFNlbGVjdGlvbnMoKSwgY29tbWFuZHMpO1xuXHRcdFx0XHRpZiAoIWRlbFNlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udHJvbGxlci5zZXRTZWxlY3Rpb25zKG5ldyBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IoKSwgdW5kZWZpbmVkLCBkZWxTZWxlY3Rpb25zLCBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gZ2V0IHRoZSBzZWxlY3Rpb25zIGZyb20gdGhlIHZpZXdtb2RlbCBzaW5jZSB3ZSBydW4gdGhlIGNvbW1hbmQgbWFudWFsbHkgKGZvciBjdXJzb3IgZGVjb3JhdGlvbiByZWFzb25zKVxuXHRcdFx0XHRjb250cm9sbGVyLnNldFNlbGVjdGlvbnMobmV3IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvcigpLCB1bmRlZmluZWQsIGNlbGwuY2VsbFZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCksIEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCk7XG5cdFx0XHR9XG5cblx0XHR9KTtcblx0XHR0aGlzLnVwZGF0ZUxhenlEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0YXN5bmMgdW5kbygpIHtcblx0XHRjb25zdCBtb2RlbHM6IElUZXh0TW9kZWxbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiB0aGlzLnRyYWNrZWRDZWxscykge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCBjZWxsLmNlbGxWaWV3TW9kZWwucmVzb2x2ZVRleHRNb2RlbCgpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdG1vZGVscy5wdXNoKG1vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChtb2RlbHMubWFwKG1vZGVsID0+IG1vZGVsLnVuZG8oKSkpO1xuXHRcdHRoaXMudXBkYXRlVmlld01vZGVsU2VsZWN0aW9ucygpO1xuXHRcdHRoaXMudXBkYXRlTGF6eURlY29yYXRpb25zKCk7XG5cdH1cblxuXHRhc3luYyByZWRvKCkge1xuXHRcdGNvbnN0IG1vZGVsczogSVRleHRNb2RlbFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIHRoaXMudHJhY2tlZENlbGxzKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IGNlbGwuY2VsbFZpZXdNb2RlbC5yZXNvbHZlVGV4dE1vZGVsKCk7XG5cdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0bW9kZWxzLnB1c2gobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKG1vZGVscy5tYXAobW9kZWwgPT4gbW9kZWwucmVkbygpKSk7XG5cdFx0dGhpcy51cGRhdGVWaWV3TW9kZWxTZWxlY3Rpb25zKCk7XG5cdFx0dGhpcy51cGRhdGVMYXp5RGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgY29uc3RydWN0Q2VsbEVkaXRvck9wdGlvbnMoY2VsbDogSUNlbGxWaWV3TW9kZWwpOiBFZGl0b3JDb25maWd1cmF0aW9uIHtcblx0XHRjb25zdCBjZWxsRWRpdG9yT3B0aW9ucyA9IG5ldyBDZWxsRWRpdG9yT3B0aW9ucyh0aGlzLm5vdGVib29rRWRpdG9yLmdldEJhc2VDZWxsRWRpdG9yT3B0aW9ucyhjZWxsLmxhbmd1YWdlKSwgdGhpcy5ub3RlYm9va0VkaXRvci5ub3RlYm9va09wdGlvbnMsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBjZWxsRWRpdG9yT3B0aW9ucy5nZXRVcGRhdGVkVmFsdWUoY2VsbC5pbnRlcm5hbE1ldGFkYXRhLCBjZWxsLnVyaSk7XG5cdFx0Y2VsbEVkaXRvck9wdGlvbnMuZGlzcG9zZSgpO1xuXHRcdHJldHVybiBuZXcgRWRpdG9yQ29uZmlndXJhdGlvbihmYWxzZSwgTWVudUlkLkVkaXRvckNvbnRlbnQsIG9wdGlvbnMsIG51bGwsIHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIG11bHRpY3Vyc29yIHNlbGVjdGlvbiBkZWNvcmF0aW9ucyBmb3IgYSBzcGVjaWZpYyBtYXRjaGVkIGNlbGxcblx0ICpcblx0ICogQHBhcmFtIGNlbGwgLS0gbWF0Y2ggb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHZpZXdtb2RlbCArIHNlbGVjdGlvbnNcblx0ICovXG5cdHByaXZhdGUgaW5pdGlhbGl6ZU11bHRpU2VsZWN0RGVjb3JhdGlvbnMoY2VsbDogVHJhY2tlZENlbGwgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIWNlbGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRjZWxsLm1hdGNoU2VsZWN0aW9ucy5mb3JFYWNoKHNlbGVjdGlvbiA9PiB7XG5cdFx0XHQvLyBtb2NrIGN1cnNvciBhdCB0aGUgZW5kIG9mIHRoZSBzZWxlY3Rpb25cblx0XHRcdGRlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRyYW5nZTogU2VsZWN0aW9uLmZyb21Qb3NpdGlvbnMoc2VsZWN0aW9uLmdldEVuZFBvc2l0aW9uKCkpLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRcdGNsYXNzTmFtZTogdGhpcy5nZXRDbGFzc05hbWUoY2VsbC5jdXJzb3JDb25maWcsIHRydWUpLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNlbGwuZGVjb3JhdGlvbklkcyA9IGNlbGwuY2VsbFZpZXdNb2RlbC5kZWx0YU1vZGVsRGVjb3JhdGlvbnMoXG5cdFx0XHRjZWxsLmRlY29yYXRpb25JZHMsXG5cdFx0XHRkZWNvcmF0aW9uc1xuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxhenlEZWNvcmF0aW9ucygpIHtcblx0XHR0aGlzLnRyYWNrZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0aWYgKGNlbGwuY2VsbFZpZXdNb2RlbC5oYW5kbGUgPT09IHRoaXMuYW5jaG9yQ2VsbD8uWzBdLmhhbmRsZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmN1cnNvcnNDb250cm9sbGVycy5nZXQoY2VsbC5jZWxsVmlld01vZGVsLnVyaSk7XG5cdFx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdFx0Ly8gc2hvdWxkIG5vdCBoYXBwZW5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGNvbnRyb2xsZXIuZ2V0U2VsZWN0aW9ucygpO1xuXG5cdFx0XHRjb25zdCBuZXdEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRcdHNlbGVjdGlvbnM/Lm1hcChzZWxlY3Rpb24gPT4ge1xuXHRcdFx0XHRjb25zdCBpc0VtcHR5ID0gc2VsZWN0aW9uLmlzRW1wdHkoKTtcblxuXHRcdFx0XHRpZiAoIWlzRW1wdHkpIHtcblx0XHRcdFx0XHQvLyBzZWxlY3Rpb24gZGVjb3JhdGlvbiAoc2hpZnQrYXJyb3csIGV0Yylcblx0XHRcdFx0XHRuZXdEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiBzZWxlY3Rpb24sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiB0aGlzLmdldENsYXNzTmFtZShjZWxsLmN1cnNvckNvbmZpZywgZmFsc2UpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gbW9jayBjdXJzb3IgYXQgdGhlIGVuZCBvZiB0aGUgc2VsZWN0aW9uXG5cdFx0XHRcdG5ld0RlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdHJhbmdlOiBTZWxlY3Rpb24uZnJvbVBvc2l0aW9ucyhzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKSksXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRcdFx0ekluZGV4OiAxMDAwMCxcblx0XHRcdFx0XHRcdGNsYXNzTmFtZTogdGhpcy5nZXRDbGFzc05hbWUoY2VsbC5jdXJzb3JDb25maWcsIHRydWUpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y2VsbC5kZWNvcmF0aW9uSWRzID0gY2VsbC5jZWxsVmlld01vZGVsLmRlbHRhTW9kZWxEZWNvcmF0aW9ucyhcblx0XHRcdFx0Y2VsbC5kZWNvcmF0aW9uSWRzLFxuXHRcdFx0XHRuZXdEZWNvcmF0aW9uc1xuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJEZWNvcmF0aW9ucyhjZWxsOiBUcmFja2VkQ2VsbCkge1xuXHRcdGNlbGwuZGVjb3JhdGlvbklkcyA9IGNlbGwuY2VsbFZpZXdNb2RlbC5kZWx0YU1vZGVsRGVjb3JhdGlvbnMoXG5cdFx0XHRjZWxsLmRlY29yYXRpb25JZHMsXG5cdFx0XHRbXVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmQoc2VsZWN0aW9uOiBTZWxlY3Rpb24sIG1vZGVsOiBJVGV4dE1vZGVsKTogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSBzZWxlY3Rpb24uc3RhcnRDb2x1bW47XG5cblx0XHRpZiAobW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWwuZ2V0V29yZEF0UG9zaXRpb24oe1xuXHRcdFx0bGluZU51bWJlcjogbGluZU51bWJlcixcblx0XHRcdGNvbHVtbjogc3RhcnRDb2x1bW5cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q2xhc3NOYW1lKGN1cnNvckNvbmZpZzogTm90ZWJvb2tDdXJzb3JDb25maWcsIGlzQ3Vyc29yPzogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9IGlzQ3Vyc29yID8gJy5uYi1tdWx0aWN1cnNvci1jdXJzb3InIDogJy5uYi1tdWx0aWN1cnNvci1zZWxlY3Rpb24nO1xuXG5cdFx0aWYgKGlzQ3Vyc29yKSB7XG5cdFx0XHQvLyBoYW5kbGUgYmFzZSBzdHlsZVxuXHRcdFx0c3dpdGNoIChjdXJzb3JDb25maWcuY3Vyc29yU3R5bGUpIHtcblx0XHRcdFx0Y2FzZSBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZTpcblx0XHRcdFx0XHRicmVhazsgLy8gZGVmYXVsdCBzdHlsZSwgbm8gYWRkaXRpb25hbCBjbGFzcyBuZWVkZWQgKGhhbmRsZWQgYnkgYmFzZSBjc3Mgc3R5bGUpXG5cdFx0XHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrOlxuXHRcdFx0XHRcdHJlc3VsdCArPSAnLm5iLWN1cnNvci1ibG9jay1zdHlsZSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLlVuZGVybGluZTpcblx0XHRcdFx0XHRyZXN1bHQgKz0gJy5uYi1jdXJzb3ItdW5kZXJsaW5lLXN0eWxlJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuTGluZVRoaW46XG5cdFx0XHRcdFx0cmVzdWx0ICs9ICcubmItY3Vyc29yLWxpbmUtdGhpbi1zdHlsZSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrT3V0bGluZTpcblx0XHRcdFx0XHRyZXN1bHQgKz0gJy5uYi1jdXJzb3ItYmxvY2stb3V0bGluZS1zdHlsZSc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLlVuZGVybGluZVRoaW46XG5cdFx0XHRcdFx0cmVzdWx0ICs9ICcubmItY3Vyc29yLXVuZGVybGluZS10aGluLXN0eWxlJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Ly8gaGFuZGxlIGFuaW1hdGlvbiBzdHlsZVxuXHRcdFx0c3dpdGNoIChjdXJzb3JDb25maWcuY3Vyc29yQmxpbmtpbmcpIHtcblx0XHRcdFx0Y2FzZSBUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZS5CbGluazpcblx0XHRcdFx0XHRyZXN1bHQgKz0gJy5uYi1ibGluayc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUuU21vb3RoOlxuXHRcdFx0XHRcdHJlc3VsdCArPSAnLm5iLXNtb290aCc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUuUGhhc2U6XG5cdFx0XHRcdFx0cmVzdWx0ICs9ICcubmItcGhhc2UnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLkV4cGFuZDpcblx0XHRcdFx0XHRyZXN1bHQgKz0gJy5uYi1leHBhbmQnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLlNvbGlkOlxuXHRcdFx0XHRcdHJlc3VsdCArPSAnLm5iLXNvbGlkJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXN1bHQgKz0gJy5uYi1zb2xpZCc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGhhbmRsZSBjYXJldCBhbmltYXRpb24gc3R5bGVcblx0XHRcdGlmIChjdXJzb3JDb25maWcuY3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24gPT09ICdvbicgfHwgY3Vyc29yQ29uZmlnLmN1cnNvclNtb290aENhcmV0QW5pbWF0aW9uID09PSAnZXhwbGljaXQnKSB7XG5cdFx0XHRcdHJlc3VsdCArPSAnLm5iLXNtb290aC1jYXJldC1hbmltYXRpb24nO1xuXHRcdFx0fVxuXG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmFuY2hvckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmN1cnNvcnNEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLnRyYWNrZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4ge1xuXHRcdFx0dGhpcy5jbGVhckRlY29yYXRpb25zKGNlbGwpO1xuXHRcdH0pO1xuXHRcdHRoaXMudHJhY2tlZENlbGxzID0gW107XG5cdH1cblxufVxuXG5jbGFzcyBOb3RlYm9va1NlbGVjdEFsbEZpbmRNYXRjaGVzIGV4dGVuZHMgTm90ZWJvb2tBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTk9URUJPT0tfU0VMRUNUX0FMTF9GSU5EX01BVENIRVNfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NlbGVjdEFsbEZpbmRNYXRjaGVzJywgXCJTZWxlY3QgQWxsIE9jY3VycmVuY2VzIG9mIEZpbmQgTWF0Y2hcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0KSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUixcblx0XHRcdFx0XHRcdE5PVEVCT09LX0NFTExfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdFx0XHRLRVlCSU5ESU5HX0NPTlRFWFRfTk9URUJPT0tfRklORF9XSURHRVRfRk9DVVNFRFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdCksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlMLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghY29udGV4dC5jZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3Vyc29yQ29udHJvbGxlciA9IGVkaXRvci5nZXRDb250cmlidXRpb248Tm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXI+KE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyLmlkKTtcblx0XHRjb25zdCBmaW5kQ29udHJvbGxlciA9IGVkaXRvci5nZXRDb250cmlidXRpb248Tm90ZWJvb2tGaW5kQ29udHJpYj4oTm90ZWJvb2tGaW5kQ29udHJpYi5pZCk7XG5cblx0XHRpZiAoZmluZENvbnRyb2xsZXIud2lkZ2V0LmlzRm9jdXNlZCkge1xuXHRcdFx0Y29uc3QgZmluZE1vZGVsID0gZmluZENvbnRyb2xsZXIud2lkZ2V0LmZpbmRNb2RlbDtcblx0XHRcdGN1cnNvckNvbnRyb2xsZXIuc2VsZWN0QWxsTWF0Y2hlcyhjb250ZXh0LmNlbGwsIGZpbmRNb2RlbC5maW5kTWF0Y2hlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1cnNvckNvbnRyb2xsZXIuc2VsZWN0QWxsTWF0Y2hlcyhjb250ZXh0LmNlbGwpO1xuXHRcdH1cblxuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rQWRkTWF0Y2hUb011bHRpU2VsZWN0aW9uQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTk9URUJPT0tfQUREX0ZJTkRfTUFUQ0hfVE9fU0VMRUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZGRGaW5kTWF0Y2hUb1NlbGVjdGlvbicsIFwiQWRkIFNlbGVjdGlvbiB0byBOZXh0IEZpbmQgTWF0Y2hcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHROT1RFQk9PS19DRUxMX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0KSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm11bHRpQ3Vyc29yLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHRcdE5PVEVCT09LX0NFTExfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdCksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlELFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghY29udGV4dC5jZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGVkaXRvci5nZXRDb250cmlidXRpb248Tm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXI+KE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyLmlkKTtcblx0XHRjb250cm9sbGVyLmZpbmRBbmRUcmFja05leHRTZWxlY3Rpb24oY29udGV4dC5jZWxsKTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va0V4aXRNdWx0aVNlbGVjdGlvbkFjdGlvbiBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlTXVsdGlDdXJzb3IuZXhpdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2V4aXRNdWx0aVNlbGVjdGlvbicsIFwiRXhpdCBNdWx0aSBDdXJzb3IgTW9kZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULklzTm90ZWJvb2tNdWx0aUN1cnNvcixcblx0XHRcdCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdFx0Tk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUixcblx0XHRcdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Jc05vdGVib29rTXVsdGlDdXJzb3IsXG5cdFx0XHRcdCksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyPihOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlci5pZCk7XG5cdFx0Y29udHJvbGxlci5yZXNldFRvSWRsZVN0YXRlKCk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tEZWxldGVMZWZ0TXVsdGlTZWxlY3Rpb25BY3Rpb24gZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZU11bHRpQ3Vyc29yLmRlbGV0ZUxlZnQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdkZWxldGVMZWZ0TXVsdGlTZWxlY3Rpb24nLCBcIkRlbGV0ZSBMZWZ0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm11bHRpQ3Vyc29yLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0Tk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUixcblx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuSXNOb3RlYm9va011bHRpQ3Vyc29yLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Ob3RlYm9va011bHRpU2VsZWN0Q3Vyc29yU3RhdGUuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5TZWxlY3RpbmcpLFxuXHRcdFx0XHRcdE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULk5vdGVib29rTXVsdGlTZWxlY3RDdXJzb3JTdGF0ZS5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLkVkaXRpbmcpXG5cdFx0XHRcdClcblx0XHRcdCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdFx0Tk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUixcblx0XHRcdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Jc05vdGVib29rTXVsdGlDdXJzb3IsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Ob3RlYm9va011bHRpU2VsZWN0Q3Vyc29yU3RhdGUuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5TZWxlY3RpbmcpLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuTm90ZWJvb2tNdWx0aVNlbGVjdEN1cnNvclN0YXRlLmlzRXF1YWxUbyhOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuRWRpdGluZylcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyPihOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlci5pZCk7XG5cdFx0Y29udHJvbGxlci5kZWxldGVMZWZ0KCk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tEZWxldGVSaWdodE11bHRpU2VsZWN0aW9uQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVNdWx0aUN1cnNvci5kZWxldGVSaWdodCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2RlbGV0ZVJpZ2h0TXVsdGlTZWxlY3Rpb24nLCBcIkRlbGV0ZSBSaWdodFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULklzTm90ZWJvb2tNdWx0aUN1cnNvcixcblx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuTm90ZWJvb2tNdWx0aVNlbGVjdEN1cnNvclN0YXRlLmlzRXF1YWxUbyhOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuU2VsZWN0aW5nKSxcblx0XHRcdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Ob3RlYm9va011bHRpU2VsZWN0Q3Vyc29yU3RhdGUuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlDdXJzb3JTdGF0ZS5FZGl0aW5nKVxuXHRcdFx0XHQpXG5cdFx0XHQpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsIHRydWUpLFxuXHRcdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuSXNOb3RlYm9va011bHRpQ3Vyc29yLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfTVVMVElfQ1VSU09SX0NPTlRFWFQuTm90ZWJvb2tNdWx0aVNlbGVjdEN1cnNvclN0YXRlLmlzRXF1YWxUbyhOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUuU2VsZWN0aW5nKSxcblx0XHRcdFx0XHRcdE5PVEVCT09LX01VTFRJX0NVUlNPUl9DT05URVhULk5vdGVib29rTXVsdGlTZWxlY3RDdXJzb3JTdGF0ZS5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLkVkaXRpbmcpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRlbGV0ZSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgbmJFZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0aWYgKCFuYkVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjZWxsRWRpdG9yID0gbmJFZGl0b3IuYWN0aXZlQ29kZUVkaXRvcjtcblx0XHRpZiAoIWNlbGxFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBuZWVkIHRvIHJ1biB0aGUgY29tbWFuZCBtYW51YWxseSBzaW5jZSB3ZSBhcmUgb3ZlcnJpZGluZyB0aGUgY29tbWFuZCwgdGhpcyBlbnN1cmVzIHByb3BlciBjdXJzb3IgYW5pbWF0aW9uIGJlaGF2aW9yXG5cdFx0Q29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodC5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCBjZWxsRWRpdG9yLCBudWxsKTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuYkVkaXRvci5nZXRDb250cmlidXRpb248Tm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXI+KE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyLmlkKTtcblx0XHRjb250cm9sbGVyLmRlbGV0ZVJpZ2h0KCk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tNdWx0aUN1cnNvclVuZG9SZWRvQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm5vdGVib29rLm11bHRpQ3Vyc29yVW5kb1JlZG8nO1xuXG5cdGNvbnN0cnVjdG9yKEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSwgQElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKCF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdub3RlYm9vay5tdWx0aUN1cnNvci5lbmFibGVkJykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBQUklPUklUWSA9IDEwMDA1O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFVuZG9Db21tYW5kLmFkZEltcGxlbWVudGF0aW9uKFBSSU9SSVRZLCAnbm90ZWJvb2stbXVsdGljdXJzb3ItdW5kby1yZWRvJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGVkaXRvci5nZXRDb250cmlidXRpb248Tm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXI+KE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyLmlkKTtcblxuXHRcdFx0cmV0dXJuIGNvbnRyb2xsZXIudW5kbygpO1xuXHRcdH0sIENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm11bHRpQ3Vyc29yLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Jc05vdGVib29rTXVsdGlDdXJzb3IsXG5cdFx0KSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoUmVkb0NvbW1hbmQuYWRkSW1wbGVtZW50YXRpb24oUFJJT1JJVFksICdub3RlYm9vay1tdWx0aWN1cnNvci11bmRvLXJlZG8nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlcj4oTm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXIuaWQpO1xuXHRcdFx0cmV0dXJuIGNvbnRyb2xsZXIucmVkbygpO1xuXHRcdH0sIENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm11bHRpQ3Vyc29yLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHROT1RFQk9PS19NVUxUSV9DVVJTT1JfQ09OVEVYVC5Jc05vdGVib29rTXVsdGlDdXJzb3IsXG5cdFx0KSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyTm90ZWJvb2tDb250cmlidXRpb24oTm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXIuaWQsIE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihOb3RlYm9va011bHRpQ3Vyc29yVW5kb1JlZG9Db250cmlidXRpb24uSUQsIE5vdGVib29rTXVsdGlDdXJzb3JVbmRvUmVkb0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcblxucmVnaXN0ZXJBY3Rpb24yKE5vdGVib29rU2VsZWN0QWxsRmluZE1hdGNoZXMpO1xucmVnaXN0ZXJBY3Rpb24yKE5vdGVib29rQWRkTWF0Y2hUb011bHRpU2VsZWN0aW9uQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOb3RlYm9va0V4aXRNdWx0aVNlbGVjdGlvbkFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTm90ZWJvb2tEZWxldGVMZWZ0TXVsdGlTZWxlY3Rpb25BY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5vdGVib29rRGVsZXRlUmlnaHRNdWx0aVNlbGVjdGlvbkFjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsK0JBQStCLHVCQUF1QiwrQkFBK0IsNkJBQTZCO0FBQzNILFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsV0FBVywwQkFBMEI7QUFDOUMsU0FBMEIsNkJBQTZCO0FBQ3ZELFNBQVMsaUJBQWlCLHlCQUF5QjtBQUNuRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFpQyxlQUF5RTtBQUMxRyxTQUFT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
