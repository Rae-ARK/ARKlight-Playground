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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import * as nls from "../../../../nls.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { ShiftCommand } from "../../../common/commands/shiftCommand.js";
import { EditorAutoIndentStrategy, EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { StandardTokenType } from "../../../common/encodedTokenAttributes.js";
import { getGoodIndentForLine, getIndentMetadata } from "../../../common/languages/autoIndent.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { IndentConsts } from "../../../common/languages/supports/indentRules.js";
import { IModelService } from "../../../common/services/model.js";
import { getStandardTokenTypeAtPosition } from "../../../common/tokens/lineTokens.js";
import { getReindentEditOperations } from "../common/indentation.js";
import * as indentUtils from "../common/indentUtils.js";
const _IndentationToSpacesAction = class _IndentationToSpacesAction extends EditorAction {
  constructor() {
    super({
      id: _IndentationToSpacesAction.ID,
      label: nls.localize2("indentationToSpaces", "Convert Indentation to Spaces"),
      precondition: EditorContextKeys.writable,
      metadata: {
        description: nls.localize2("indentationToSpacesDescription", "Convert the tab indentation to spaces.")
      }
    });
  }
  run(accessor, editor) {
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const modelOpts = model.getOptions();
    const selection = editor.getSelection();
    if (!selection) {
      return;
    }
    const command = new IndentationToSpacesCommand(selection, modelOpts.tabSize);
    editor.pushUndoStop();
    editor.executeCommands(this.id, [command]);
    editor.pushUndoStop();
    model.updateOptions({
      insertSpaces: true
    });
  }
};
_IndentationToSpacesAction.ID = "editor.action.indentationToSpaces";
let IndentationToSpacesAction = _IndentationToSpacesAction;
const _IndentationToTabsAction = class _IndentationToTabsAction extends EditorAction {
  constructor() {
    super({
      id: _IndentationToTabsAction.ID,
      label: nls.localize2("indentationToTabs", "Convert Indentation to Tabs"),
      precondition: EditorContextKeys.writable,
      metadata: {
        description: nls.localize2("indentationToTabsDescription", "Convert the spaces indentation to tabs.")
      }
    });
  }
  run(accessor, editor) {
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const modelOpts = model.getOptions();
    const selection = editor.getSelection();
    if (!selection) {
      return;
    }
    const command = new IndentationToTabsCommand(selection, modelOpts.tabSize);
    editor.pushUndoStop();
    editor.executeCommands(this.id, [command]);
    editor.pushUndoStop();
    model.updateOptions({
      insertSpaces: false
    });
  }
};
_IndentationToTabsAction.ID = "editor.action.indentationToTabs";
let IndentationToTabsAction = _IndentationToTabsAction;
class ChangeIndentationSizeAction extends EditorAction {
  constructor(insertSpaces, displaySizeOnly, opts) {
    super(opts);
    this.insertSpaces = insertSpaces;
    this.displaySizeOnly = displaySizeOnly;
  }
  run(accessor, editor) {
    const quickInputService = accessor.get(IQuickInputService);
    const modelService = accessor.get(IModelService);
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const creationOpts = modelService.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
    const modelOpts = model.getOptions();
    const picks = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      id: n.toString(),
      label: n.toString(),
      // add description for tabSize value set in the configuration
      description: n === creationOpts.tabSize && n === modelOpts.tabSize ? nls.localize("configuredTabSize", "Configured Tab Size") : n === creationOpts.tabSize ? nls.localize("defaultTabSize", "Default Tab Size") : n === modelOpts.tabSize ? nls.localize("currentTabSize", "Current Tab Size") : void 0
    }));
    const autoFocusIndex = Math.min(model.getOptions().tabSize - 1, 7);
    setTimeout(
      () => {
        quickInputService.pick(picks, { placeHolder: nls.localize({ key: "selectTabWidth", comment: ["Tab corresponds to the tab key"] }, "Select Tab Size for Current File"), activeItem: picks[autoFocusIndex] }).then((pick) => {
          if (pick) {
            if (model && !model.isDisposed()) {
              const pickedVal = parseInt(pick.label, 10);
              if (this.displaySizeOnly) {
                model.updateOptions({
                  tabSize: pickedVal
                });
              } else {
                model.updateOptions({
                  tabSize: pickedVal,
                  indentSize: pickedVal,
                  insertSpaces: this.insertSpaces
                });
              }
            }
          }
        });
      },
      50
      /* quick input is sensitive to being opened so soon after another */
    );
  }
}
const _IndentUsingTabs = class _IndentUsingTabs extends ChangeIndentationSizeAction {
  constructor() {
    super(false, false, {
      id: _IndentUsingTabs.ID,
      label: nls.localize2("indentUsingTabs", "Indent Using Tabs"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("indentUsingTabsDescription", "Use indentation with tabs.")
      }
    });
  }
};
_IndentUsingTabs.ID = "editor.action.indentUsingTabs";
let IndentUsingTabs = _IndentUsingTabs;
const _IndentUsingSpaces = class _IndentUsingSpaces extends ChangeIndentationSizeAction {
  constructor() {
    super(true, false, {
      id: _IndentUsingSpaces.ID,
      label: nls.localize2("indentUsingSpaces", "Indent Using Spaces"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("indentUsingSpacesDescription", "Use indentation with spaces.")
      }
    });
  }
};
_IndentUsingSpaces.ID = "editor.action.indentUsingSpaces";
let IndentUsingSpaces = _IndentUsingSpaces;
const _ChangeTabDisplaySize = class _ChangeTabDisplaySize extends ChangeIndentationSizeAction {
  constructor() {
    super(true, true, {
      id: _ChangeTabDisplaySize.ID,
      label: nls.localize2("changeTabDisplaySize", "Change Tab Display Size"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("changeTabDisplaySizeDescription", "Change the space size equivalent of the tab.")
      }
    });
  }
};
_ChangeTabDisplaySize.ID = "editor.action.changeTabDisplaySize";
let ChangeTabDisplaySize = _ChangeTabDisplaySize;
const _DetectIndentation = class _DetectIndentation extends EditorAction {
  constructor() {
    super({
      id: _DetectIndentation.ID,
      label: nls.localize2("detectIndentation", "Detect Indentation from Content"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("detectIndentationDescription", "Detect the indentation from content.")
      }
    });
  }
  run(accessor, editor) {
    const modelService = accessor.get(IModelService);
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const creationOpts = modelService.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
    model.detectIndentation(creationOpts.insertSpaces, creationOpts.tabSize);
  }
};
_DetectIndentation.ID = "editor.action.detectIndentation";
let DetectIndentation = _DetectIndentation;
class ReindentLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.reindentlines",
      label: nls.localize2("editor.reindentlines", "Reindent Lines"),
      precondition: EditorContextKeys.writable,
      metadata: {
        description: nls.localize2("editor.reindentlinesDescription", "Reindent the lines of the editor.")
      },
      canTriggerInlineEdits: true
    });
  }
  run(accessor, editor) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const edits = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    if (edits.length > 0) {
      editor.pushUndoStop();
      editor.executeEdits(this.id, edits);
      editor.pushUndoStop();
    }
  }
}
class ReindentSelectedLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.reindentselectedlines",
      label: nls.localize2("editor.reindentselectedlines", "Reindent Selected Lines"),
      precondition: EditorContextKeys.writable,
      metadata: {
        description: nls.localize2("editor.reindentselectedlinesDescription", "Reindent the selected lines of the editor.")
      },
      canTriggerInlineEdits: true
    });
  }
  run(accessor, editor) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const selections = editor.getSelections();
    if (selections === null) {
      return;
    }
    const edits = [];
    for (const selection of selections) {
      let startLineNumber = selection.startLineNumber;
      let endLineNumber = selection.endLineNumber;
      if (startLineNumber !== endLineNumber && selection.endColumn === 1) {
        endLineNumber--;
      }
      if (startLineNumber === 1) {
        if (startLineNumber === endLineNumber) {
          continue;
        }
      } else {
        startLineNumber--;
      }
      const editOperations = getReindentEditOperations(model, languageConfigurationService, startLineNumber, endLineNumber);
      edits.push(...editOperations);
    }
    if (edits.length > 0) {
      editor.pushUndoStop();
      editor.executeEdits(this.id, edits);
      editor.pushUndoStop();
    }
  }
}
class AutoIndentOnPasteCommand {
  constructor(edits, initialSelection) {
    this._initialSelection = initialSelection;
    this._edits = [];
    this._selectionId = null;
    for (const edit of edits) {
      if (edit.range && typeof edit.text === "string") {
        this._edits.push(edit);
      }
    }
  }
  getEditOperations(model, builder) {
    for (const edit of this._edits) {
      builder.addEditOperation(Range.lift(edit.range), edit.text);
    }
    let selectionIsSet = false;
    if (Array.isArray(this._edits) && this._edits.length === 1 && this._initialSelection.isEmpty()) {
      if (this._edits[0].range.startColumn === this._initialSelection.endColumn && this._edits[0].range.startLineNumber === this._initialSelection.endLineNumber) {
        selectionIsSet = true;
        this._selectionId = builder.trackSelection(this._initialSelection, true);
      } else if (this._edits[0].range.endColumn === this._initialSelection.startColumn && this._edits[0].range.endLineNumber === this._initialSelection.startLineNumber) {
        selectionIsSet = true;
        this._selectionId = builder.trackSelection(this._initialSelection, false);
      }
    }
    if (!selectionIsSet) {
      this._selectionId = builder.trackSelection(this._initialSelection);
    }
  }
  computeCursorState(model, helper) {
    return helper.getTrackedSelection(this._selectionId);
  }
}
let AutoIndentOnPaste = class {
  constructor(editor, _languageConfigurationService) {
    this.editor = editor;
    this._languageConfigurationService = _languageConfigurationService;
    this.callOnDispose = new DisposableStore();
    this.callOnModel = new DisposableStore();
    this.callOnDispose.add(editor.onDidChangeConfiguration(() => this.update()));
    this.callOnDispose.add(editor.onDidChangeModel(() => this.update()));
    this.callOnDispose.add(editor.onDidChangeModelLanguage(() => this.update()));
  }
  update() {
    this.callOnModel.clear();
    if (!this.editor.getOption(EditorOption.autoIndentOnPaste) || this.editor.getOption(EditorOption.autoIndent) < EditorAutoIndentStrategy.Full) {
      return;
    }
    if (!this.editor.hasModel()) {
      return;
    }
    this.callOnModel.add(this.editor.onDidPaste(({ range }) => {
      this.trigger(range);
    }));
  }
  trigger(range) {
    const selections = this.editor.getSelections();
    if (selections === null || selections.length > 1) {
      return;
    }
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    const containsOnlyWhitespace = this.rangeContainsOnlyWhitespaceCharacters(model, range);
    if (containsOnlyWhitespace) {
      return;
    }
    if (!this.editor.getOption(EditorOption.autoIndentOnPasteWithinString) && isStartOrEndInString(model, range)) {
      return;
    }
    if (!model.tokenization.isCheapToTokenize(range.getStartPosition().lineNumber)) {
      return;
    }
    const autoIndent = this.editor.getOption(EditorOption.autoIndent);
    const { tabSize, indentSize, insertSpaces } = model.getOptions();
    const textEdits = [];
    const indentConverter = {
      shiftIndent: (indentation) => {
        return ShiftCommand.shiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
      },
      unshiftIndent: (indentation) => {
        return ShiftCommand.unshiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
      }
    };
    let startLineNumber = range.startLineNumber;
    let firstLineText = model.getLineContent(startLineNumber);
    if (!/\S/.test(firstLineText.substring(0, range.startColumn - 1))) {
      const indentOfFirstLine = getGoodIndentForLine(autoIndent, model, model.getLanguageId(), startLineNumber, indentConverter, this._languageConfigurationService);
      if (indentOfFirstLine !== null) {
        const oldIndentation = strings.getLeadingWhitespace(firstLineText);
        const newSpaceCnt = indentUtils.getSpaceCnt(indentOfFirstLine, tabSize);
        const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
        if (newSpaceCnt !== oldSpaceCnt) {
          const newIndent = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
          textEdits.push({
            range: new Range(startLineNumber, 1, startLineNumber, oldIndentation.length + 1),
            text: newIndent
          });
          firstLineText = newIndent + firstLineText.substring(oldIndentation.length);
        } else {
          const indentMetadata = getIndentMetadata(model, startLineNumber, this._languageConfigurationService);
          if (indentMetadata === 0 || indentMetadata === IndentConsts.UNINDENT_MASK) {
            return;
          }
        }
      }
    }
    const firstLineNumber = startLineNumber;
    while (startLineNumber < range.endLineNumber) {
      if (!/\S/.test(model.getLineContent(startLineNumber + 1))) {
        startLineNumber++;
        continue;
      }
      break;
    }
    if (startLineNumber !== range.endLineNumber) {
      const virtualModel = {
        tokenization: {
          getLineTokens: (lineNumber) => {
            return model.tokenization.getLineTokens(lineNumber);
          },
          getLanguageId: () => {
            return model.getLanguageId();
          },
          getLanguageIdAtPosition: (lineNumber, column) => {
            return model.getLanguageIdAtPosition(lineNumber, column);
          }
        },
        getLineContent: (lineNumber) => {
          if (lineNumber === firstLineNumber) {
            return firstLineText;
          } else {
            return model.getLineContent(lineNumber);
          }
        }
      };
      const indentOfSecondLine = getGoodIndentForLine(autoIndent, virtualModel, model.getLanguageId(), startLineNumber + 1, indentConverter, this._languageConfigurationService);
      if (indentOfSecondLine !== null) {
        const newSpaceCntOfSecondLine = indentUtils.getSpaceCnt(indentOfSecondLine, tabSize);
        const oldSpaceCntOfSecondLine = indentUtils.getSpaceCnt(strings.getLeadingWhitespace(model.getLineContent(startLineNumber + 1)), tabSize);
        if (newSpaceCntOfSecondLine !== oldSpaceCntOfSecondLine) {
          const spaceCntOffset = newSpaceCntOfSecondLine - oldSpaceCntOfSecondLine;
          for (let i = startLineNumber + 1; i <= range.endLineNumber; i++) {
            const lineContent = model.getLineContent(i);
            const originalIndent = strings.getLeadingWhitespace(lineContent);
            const originalSpacesCnt = indentUtils.getSpaceCnt(originalIndent, tabSize);
            const newSpacesCnt = originalSpacesCnt + spaceCntOffset;
            const newIndent = indentUtils.generateIndent(newSpacesCnt, tabSize, insertSpaces);
            if (newIndent !== originalIndent) {
              textEdits.push({
                range: new Range(i, 1, i, originalIndent.length + 1),
                text: newIndent
              });
            }
          }
        }
      }
    }
    if (textEdits.length > 0) {
      this.editor.pushUndoStop();
      const cmd = new AutoIndentOnPasteCommand(textEdits, this.editor.getSelection());
      this.editor.executeCommand("autoIndentOnPaste", cmd);
      this.editor.pushUndoStop();
    }
  }
  rangeContainsOnlyWhitespaceCharacters(model, range) {
    const lineContainsOnlyWhitespace = (content) => {
      return content.trim().length === 0;
    };
    let containsOnlyWhitespace = true;
    if (range.startLineNumber === range.endLineNumber) {
      const lineContent = model.getLineContent(range.startLineNumber);
      const linePart = lineContent.substring(range.startColumn - 1, range.endColumn - 1);
      containsOnlyWhitespace = lineContainsOnlyWhitespace(linePart);
    } else {
      for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
        const lineContent = model.getLineContent(i);
        if (i === range.startLineNumber) {
          const linePart = lineContent.substring(range.startColumn - 1);
          containsOnlyWhitespace = lineContainsOnlyWhitespace(linePart);
        } else if (i === range.endLineNumber) {
          const linePart = lineContent.substring(0, range.endColumn - 1);
          containsOnlyWhitespace = lineContainsOnlyWhitespace(linePart);
        } else {
          containsOnlyWhitespace = model.getLineFirstNonWhitespaceColumn(i) === 0;
        }
        if (!containsOnlyWhitespace) {
          break;
        }
      }
    }
    return containsOnlyWhitespace;
  }
  dispose() {
    this.callOnDispose.dispose();
    this.callOnModel.dispose();
  }
};
AutoIndentOnPaste.ID = "editor.contrib.autoIndentOnPaste";
AutoIndentOnPaste = __decorateClass([
  __decorateParam(1, ILanguageConfigurationService)
], AutoIndentOnPaste);
function isStartOrEndInString(model, range) {
  const isPositionInString = (position) => {
    const tokenType = getStandardTokenTypeAtPosition(model, position);
    return tokenType === StandardTokenType.String;
  };
  return isPositionInString(range.getStartPosition()) || isPositionInString(range.getEndPosition());
}
function getIndentationEditOperations(model, builder, tabSize, tabsToSpaces) {
  if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
    return;
  }
  let spaces = "";
  for (let i = 0; i < tabSize; i++) {
    spaces += " ";
  }
  const spacesRegExp = new RegExp(spaces, "gi");
  for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
    let lastIndentationColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
    if (lastIndentationColumn === 0) {
      lastIndentationColumn = model.getLineMaxColumn(lineNumber);
    }
    if (lastIndentationColumn === 1) {
      continue;
    }
    const originalIndentationRange = new Range(lineNumber, 1, lineNumber, lastIndentationColumn);
    const originalIndentation = model.getValueInRange(originalIndentationRange);
    const newIndentation = tabsToSpaces ? originalIndentation.replace(/\t/ig, spaces) : originalIndentation.replace(spacesRegExp, "	");
    builder.addEditOperation(originalIndentationRange, newIndentation);
  }
}
class IndentationToSpacesCommand {
  constructor(selection, tabSize) {
    this.selection = selection;
    this.tabSize = tabSize;
    this.selectionId = null;
  }
  getEditOperations(model, builder) {
    this.selectionId = builder.trackSelection(this.selection);
    getIndentationEditOperations(model, builder, this.tabSize, true);
  }
  computeCursorState(model, helper) {
    return helper.getTrackedSelection(this.selectionId);
  }
}
class IndentationToTabsCommand {
  constructor(selection, tabSize) {
    this.selection = selection;
    this.tabSize = tabSize;
    this.selectionId = null;
  }
  getEditOperations(model, builder) {
    this.selectionId = builder.trackSelection(this.selection);
    getIndentationEditOperations(model, builder, this.tabSize, false);
  }
  computeCursorState(model, helper) {
    return helper.getTrackedSelection(this.selectionId);
  }
}
registerEditorContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(IndentationToSpacesAction);
registerEditorAction(IndentationToTabsAction);
registerEditorAction(IndentUsingTabs);
registerEditorAction(IndentUsingSpaces);
registerEditorAction(ChangeTabDisplaySize);
registerEditorAction(DetectIndentation);
registerEditorAction(ReindentLinesAction);
registerEditorAction(ReindentSelectedLinesAction);
export {
  AutoIndentOnPaste,
  AutoIndentOnPasteCommand,
  ChangeIndentationSizeAction,
  ChangeTabDisplaySize,
  DetectIndentation,
  IndentUsingSpaces,
  IndentUsingTabs,
  IndentationToSpacesAction,
  IndentationToSpacesCommand,
  IndentationToTabsAction,
  IndentationToTabsCommand,
  ReindentLinesAction,
  ReindentSelectedLinesAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2luZGVudGF0aW9uL2Jyb3dzZXIvaW5kZW50YXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIElBY3Rpb25PcHRpb25zLCByZWdpc3RlckVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24sIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2hpZnRDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbW1hbmRzL3NoaWZ0Q29tbWFuZC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3ksIEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kLCBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEsIElFZGl0T3BlcmF0aW9uQnVpbGRlciwgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRUb2tlblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgZ2V0R29vZEluZGVudEZvckxpbmUsIGdldEluZGVudE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9hdXRvSW5kZW50LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJbmRlbnRDb25zdHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL2luZGVudFJ1bGVzLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVNlcXVlbmNlLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0U3RhbmRhcmRUb2tlblR5cGVBdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IGdldFJlaW5kZW50RWRpdE9wZXJhdGlvbnMgfSBmcm9tICcuLi9jb21tb24vaW5kZW50YXRpb24uanMnO1xuaW1wb3J0ICogYXMgaW5kZW50VXRpbHMgZnJvbSAnLi4vY29tbW9uL2luZGVudFV0aWxzLmpzJztcblxuZXhwb3J0IGNsYXNzIEluZGVudGF0aW9uVG9TcGFjZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24uaW5kZW50YXRpb25Ub1NwYWNlcyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEluZGVudGF0aW9uVG9TcGFjZXNBY3Rpb24uSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignaW5kZW50YXRpb25Ub1NwYWNlcycsIFwiQ29udmVydCBJbmRlbnRhdGlvbiB0byBTcGFjZXNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2luZGVudGF0aW9uVG9TcGFjZXNEZXNjcmlwdGlvbicsIFwiQ29udmVydCB0aGUgdGFiIGluZGVudGF0aW9uIHRvIHNwYWNlcy5cIiksXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsT3B0cyA9IG1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKCFzZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZCA9IG5ldyBJbmRlbnRhdGlvblRvU3BhY2VzQ29tbWFuZChzZWxlY3Rpb24sIG1vZGVsT3B0cy50YWJTaXplKTtcblxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIFtjb21tYW5kXSk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXG5cdFx0bW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRpbnNlcnRTcGFjZXM6IHRydWVcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5kZW50YXRpb25Ub1RhYnNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24uaW5kZW50YXRpb25Ub1RhYnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBJbmRlbnRhdGlvblRvVGFic0FjdGlvbi5JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdpbmRlbnRhdGlvblRvVGFicycsIFwiQ29udmVydCBJbmRlbnRhdGlvbiB0byBUYWJzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdpbmRlbnRhdGlvblRvVGFic0Rlc2NyaXB0aW9uJywgXCJDb252ZXJ0IHRoZSBzcGFjZXMgaW5kZW50YXRpb24gdG8gdGFicy5cIiksXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsT3B0cyA9IG1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKCFzZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZCA9IG5ldyBJbmRlbnRhdGlvblRvVGFic0NvbW1hbmQoc2VsZWN0aW9uLCBtb2RlbE9wdHMudGFiU2l6ZSk7XG5cblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcyh0aGlzLmlkLCBbY29tbWFuZF0pO1xuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblxuXHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGFuZ2VJbmRlbnRhdGlvblNpemVBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgaW5zZXJ0U3BhY2VzOiBib29sZWFuLCBwcml2YXRlIHJlYWRvbmx5IGRpc3BsYXlTaXplT25seTogYm9vbGVhbiwgb3B0czogSUFjdGlvbk9wdGlvbnMpIHtcblx0XHRzdXBlcihvcHRzKTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNyZWF0aW9uT3B0cyA9IG1vZGVsU2VydmljZS5nZXRDcmVhdGlvbk9wdGlvbnMobW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBtb2RlbC51cmksIG1vZGVsLmlzRm9yU2ltcGxlV2lkZ2V0KTtcblx0XHRjb25zdCBtb2RlbE9wdHMgPSBtb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0Y29uc3QgcGlja3MgPSBbMSwgMiwgMywgNCwgNSwgNiwgNywgOF0ubWFwKG4gPT4gKHtcblx0XHRcdGlkOiBuLnRvU3RyaW5nKCksXG5cdFx0XHRsYWJlbDogbi50b1N0cmluZygpLFxuXHRcdFx0Ly8gYWRkIGRlc2NyaXB0aW9uIGZvciB0YWJTaXplIHZhbHVlIHNldCBpbiB0aGUgY29uZmlndXJhdGlvblxuXHRcdFx0ZGVzY3JpcHRpb246IChcblx0XHRcdFx0biA9PT0gY3JlYXRpb25PcHRzLnRhYlNpemUgJiYgbiA9PT0gbW9kZWxPcHRzLnRhYlNpemVcblx0XHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnY29uZmlndXJlZFRhYlNpemUnLCBcIkNvbmZpZ3VyZWQgVGFiIFNpemVcIilcblx0XHRcdFx0XHQ6IG4gPT09IGNyZWF0aW9uT3B0cy50YWJTaXplXG5cdFx0XHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnZGVmYXVsdFRhYlNpemUnLCBcIkRlZmF1bHQgVGFiIFNpemVcIilcblx0XHRcdFx0XHRcdDogbiA9PT0gbW9kZWxPcHRzLnRhYlNpemVcblx0XHRcdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2N1cnJlbnRUYWJTaXplJywgXCJDdXJyZW50IFRhYiBTaXplXCIpXG5cdFx0XHRcdFx0XHRcdDogdW5kZWZpbmVkXG5cdFx0XHQpXG5cdFx0fSkpO1xuXG5cdFx0Ly8gYXV0byBmb2N1cyB0aGUgdGFiU2l6ZSBzZXQgZm9yIHRoZSBjdXJyZW50IGVkaXRvclxuXHRcdGNvbnN0IGF1dG9Gb2N1c0luZGV4ID0gTWF0aC5taW4obW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemUgLSAxLCA3KTtcblxuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0cXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKHsga2V5OiAnc2VsZWN0VGFiV2lkdGgnLCBjb21tZW50OiBbJ1RhYiBjb3JyZXNwb25kcyB0byB0aGUgdGFiIGtleSddIH0sIFwiU2VsZWN0IFRhYiBTaXplIGZvciBDdXJyZW50IEZpbGVcIiksIGFjdGl2ZUl0ZW06IHBpY2tzW2F1dG9Gb2N1c0luZGV4XSB9KS50aGVuKHBpY2sgPT4ge1xuXHRcdFx0XHRpZiAocGljaykge1xuXHRcdFx0XHRcdGlmIChtb2RlbCAmJiAhbW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwaWNrZWRWYWwgPSBwYXJzZUludChwaWNrLmxhYmVsLCAxMCk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5kaXNwbGF5U2l6ZU9ubHkpIHtcblx0XHRcdFx0XHRcdFx0bW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0XHRcdFx0dGFiU2l6ZTogcGlja2VkVmFsXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0bW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0XHRcdFx0dGFiU2l6ZTogcGlja2VkVmFsLFxuXHRcdFx0XHRcdFx0XHRcdGluZGVudFNpemU6IHBpY2tlZFZhbCxcblx0XHRcdFx0XHRcdFx0XHRpbnNlcnRTcGFjZXM6IHRoaXMuaW5zZXJ0U3BhY2VzXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSwgNTAvKiBxdWljayBpbnB1dCBpcyBzZW5zaXRpdmUgdG8gYmVpbmcgb3BlbmVkIHNvIHNvb24gYWZ0ZXIgYW5vdGhlciAqLyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluZGVudFVzaW5nVGFicyBleHRlbmRzIENoYW5nZUluZGVudGF0aW9uU2l6ZUFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuYWN0aW9uLmluZGVudFVzaW5nVGFicyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoZmFsc2UsIGZhbHNlLCB7XG5cdFx0XHRpZDogSW5kZW50VXNpbmdUYWJzLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2luZGVudFVzaW5nVGFicycsIFwiSW5kZW50IFVzaW5nIFRhYnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdpbmRlbnRVc2luZ1RhYnNEZXNjcmlwdGlvbicsIFwiVXNlIGluZGVudGF0aW9uIHdpdGggdGFicy5cIiksXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluZGVudFVzaW5nU3BhY2VzIGV4dGVuZHMgQ2hhbmdlSW5kZW50YXRpb25TaXplQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24uaW5kZW50VXNpbmdTcGFjZXMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHRydWUsIGZhbHNlLCB7XG5cdFx0XHRpZDogSW5kZW50VXNpbmdTcGFjZXMuSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignaW5kZW50VXNpbmdTcGFjZXMnLCBcIkluZGVudCBVc2luZyBTcGFjZXNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdpbmRlbnRVc2luZ1NwYWNlc0Rlc2NyaXB0aW9uJywgXCJVc2UgaW5kZW50YXRpb24gd2l0aCBzcGFjZXMuXCIpLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGFuZ2VUYWJEaXNwbGF5U2l6ZSBleHRlbmRzIENoYW5nZUluZGVudGF0aW9uU2l6ZUFjdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuYWN0aW9uLmNoYW5nZVRhYkRpc3BsYXlTaXplJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih0cnVlLCB0cnVlLCB7XG5cdFx0XHRpZDogQ2hhbmdlVGFiRGlzcGxheVNpemUuSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignY2hhbmdlVGFiRGlzcGxheVNpemUnLCBcIkNoYW5nZSBUYWIgRGlzcGxheSBTaXplXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignY2hhbmdlVGFiRGlzcGxheVNpemVEZXNjcmlwdGlvbicsIFwiQ2hhbmdlIHRoZSBzcGFjZSBzaXplIGVxdWl2YWxlbnQgb2YgdGhlIHRhYi5cIiksXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERldGVjdEluZGVudGF0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24uZGV0ZWN0SW5kZW50YXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBEZXRlY3RJbmRlbnRhdGlvbi5JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdkZXRlY3RJbmRlbnRhdGlvbicsIFwiRGV0ZWN0IEluZGVudGF0aW9uIGZyb20gQ29udGVudFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2RldGVjdEluZGVudGF0aW9uRGVzY3JpcHRpb24nLCBcIkRldGVjdCB0aGUgaW5kZW50YXRpb24gZnJvbSBjb250ZW50LlwiKSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjcmVhdGlvbk9wdHMgPSBtb2RlbFNlcnZpY2UuZ2V0Q3JlYXRpb25PcHRpb25zKG1vZGVsLmdldExhbmd1YWdlSWQoKSwgbW9kZWwudXJpLCBtb2RlbC5pc0ZvclNpbXBsZVdpZGdldCk7XG5cdFx0bW9kZWwuZGV0ZWN0SW5kZW50YXRpb24oY3JlYXRpb25PcHRzLmluc2VydFNwYWNlcywgY3JlYXRpb25PcHRzLnRhYlNpemUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZWluZGVudExpbmVzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnJlaW5kZW50bGluZXMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2VkaXRvci5yZWluZGVudGxpbmVzJywgXCJSZWluZGVudCBMaW5lc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignZWRpdG9yLnJlaW5kZW50bGluZXNEZXNjcmlwdGlvbicsIFwiUmVpbmRlbnQgdGhlIGxpbmVzIG9mIHRoZSBlZGl0b3IuXCIpLFxuXHRcdFx0fSxcblx0XHRcdGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlZGl0cyA9IGdldFJlaW5kZW50RWRpdE9wZXJhdGlvbnMobW9kZWwsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIDEsIG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRpZiAoZWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cyh0aGlzLmlkLCBlZGl0cyk7XG5cdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZWluZGVudFNlbGVjdGVkTGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ucmVpbmRlbnRzZWxlY3RlZGxpbmVzJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdlZGl0b3IucmVpbmRlbnRzZWxlY3RlZGxpbmVzJywgXCJSZWluZGVudCBTZWxlY3RlZCBMaW5lc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignZWRpdG9yLnJlaW5kZW50c2VsZWN0ZWRsaW5lc0Rlc2NyaXB0aW9uJywgXCJSZWluZGVudCB0aGUgc2VsZWN0ZWQgbGluZXMgb2YgdGhlIGVkaXRvci5cIiksXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRsZXQgZW5kTGluZU51bWJlciA9IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyO1xuXG5cdFx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyICE9PSBlbmRMaW5lTnVtYmVyICYmIHNlbGVjdGlvbi5lbmRDb2x1bW4gPT09IDEpIHtcblx0XHRcdFx0ZW5kTGluZU51bWJlci0tO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyID09PSAxKSB7XG5cdFx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgPT09IGVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyLS07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVkaXRPcGVyYXRpb25zID0gZ2V0UmVpbmRlbnRFZGl0T3BlcmF0aW9ucyhtb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyKTtcblx0XHRcdGVkaXRzLnB1c2goLi4uZWRpdE9wZXJhdGlvbnMpO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKHRoaXMuaWQsIGVkaXRzKTtcblx0XHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEF1dG9JbmRlbnRPblBhc3RlQ29tbWFuZCBpbXBsZW1lbnRzIElDb21tYW5kIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0czogeyByYW5nZTogSVJhbmdlOyB0ZXh0OiBzdHJpbmc7IGVvbD86IEVuZE9mTGluZVNlcXVlbmNlIH1bXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0aWFsU2VsZWN0aW9uOiBTZWxlY3Rpb247XG5cdHByaXZhdGUgX3NlbGVjdGlvbklkOiBzdHJpbmcgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKGVkaXRzOiBUZXh0RWRpdFtdLCBpbml0aWFsU2VsZWN0aW9uOiBTZWxlY3Rpb24pIHtcblx0XHR0aGlzLl9pbml0aWFsU2VsZWN0aW9uID0gaW5pdGlhbFNlbGVjdGlvbjtcblx0XHR0aGlzLl9lZGl0cyA9IFtdO1xuXHRcdHRoaXMuX3NlbGVjdGlvbklkID0gbnVsbDtcblxuXHRcdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdFx0aWYgKGVkaXQucmFuZ2UgJiYgdHlwZW9mIGVkaXQudGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy5fZWRpdHMucHVzaChlZGl0IGFzIHsgcmFuZ2U6IElSYW5nZTsgdGV4dDogc3RyaW5nOyBlb2w/OiBFbmRPZkxpbmVTZXF1ZW5jZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWRpdE9wZXJhdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlcik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiB0aGlzLl9lZGl0cykge1xuXHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKFJhbmdlLmxpZnQoZWRpdC5yYW5nZSksIGVkaXQudGV4dCk7XG5cdFx0fVxuXG5cdFx0bGV0IHNlbGVjdGlvbklzU2V0ID0gZmFsc2U7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodGhpcy5fZWRpdHMpICYmIHRoaXMuX2VkaXRzLmxlbmd0aCA9PT0gMSAmJiB0aGlzLl9pbml0aWFsU2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRzWzBdLnJhbmdlLnN0YXJ0Q29sdW1uID09PSB0aGlzLl9pbml0aWFsU2VsZWN0aW9uLmVuZENvbHVtbiAmJlxuXHRcdFx0XHR0aGlzLl9lZGl0c1swXS5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHRoaXMuX2luaXRpYWxTZWxlY3Rpb24uZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRzZWxlY3Rpb25Jc1NldCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGlvbklkID0gYnVpbGRlci50cmFja1NlbGVjdGlvbih0aGlzLl9pbml0aWFsU2VsZWN0aW9uLCB0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fZWRpdHNbMF0ucmFuZ2UuZW5kQ29sdW1uID09PSB0aGlzLl9pbml0aWFsU2VsZWN0aW9uLnN0YXJ0Q29sdW1uICYmXG5cdFx0XHRcdHRoaXMuX2VkaXRzWzBdLnJhbmdlLmVuZExpbmVOdW1iZXIgPT09IHRoaXMuX2luaXRpYWxTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHNlbGVjdGlvbklzU2V0ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBidWlsZGVyLnRyYWNrU2VsZWN0aW9uKHRoaXMuX2luaXRpYWxTZWxlY3Rpb24sIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXNlbGVjdGlvbklzU2V0KSB7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25JZCA9IGJ1aWxkZXIudHJhY2tTZWxlY3Rpb24odGhpcy5faW5pdGlhbFNlbGVjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNvbXB1dGVDdXJzb3JTdGF0ZShtb2RlbDogSVRleHRNb2RlbCwgaGVscGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEpOiBTZWxlY3Rpb24ge1xuXHRcdHJldHVybiBoZWxwZXIuZ2V0VHJhY2tlZFNlbGVjdGlvbih0aGlzLl9zZWxlY3Rpb25JZCEpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBdXRvSW5kZW50T25QYXN0ZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmF1dG9JbmRlbnRPblBhc3RlJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNhbGxPbkRpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2FsbE9uTW9kZWwgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblxuXHRcdHRoaXMuY2FsbE9uRGlzcG9zZS5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5jYWxsT25EaXNwb3NlLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5jYWxsT25EaXNwb3NlLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xuXG5cdFx0Ly8gY2xlYW4gdXBcblx0XHR0aGlzLmNhbGxPbk1vZGVsLmNsZWFyKCk7XG5cblx0XHQvLyB3ZSBhcmUgZGlzYWJsZWRcblx0XHRpZiAoIXRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uYXV0b0luZGVudE9uUGFzdGUpIHx8IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uYXV0b0luZGVudCkgPCBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIG5vIG1vZGVsXG5cdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jYWxsT25Nb2RlbC5hZGQodGhpcy5lZGl0b3Iub25EaWRQYXN0ZSgoeyByYW5nZSB9KSA9PiB7XG5cdFx0XHR0aGlzLnRyaWdnZXIocmFuZ2UpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyB0cmlnZ2VyKHJhbmdlOiBSYW5nZSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMgPT09IG51bGwgfHwgc2VsZWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29udGFpbnNPbmx5V2hpdGVzcGFjZSA9IHRoaXMucmFuZ2VDb250YWluc09ubHlXaGl0ZXNwYWNlQ2hhcmFjdGVycyhtb2RlbCwgcmFuZ2UpO1xuXHRcdGlmIChjb250YWluc09ubHlXaGl0ZXNwYWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hdXRvSW5kZW50T25QYXN0ZVdpdGhpblN0cmluZykgJiYgaXNTdGFydE9yRW5kSW5TdHJpbmcobW9kZWwsIHJhbmdlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIW1vZGVsLnRva2VuaXphdGlvbi5pc0NoZWFwVG9Ub2tlbml6ZShyYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkubGluZU51bWJlcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXV0b0luZGVudCA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uYXV0b0luZGVudCk7XG5cdFx0Y29uc3QgeyB0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMgfSA9IG1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRjb25zdCB0ZXh0RWRpdHM6IFRleHRFZGl0W10gPSBbXTtcblxuXHRcdGNvbnN0IGluZGVudENvbnZlcnRlciA9IHtcblx0XHRcdHNoaWZ0SW5kZW50OiAoaW5kZW50YXRpb246IHN0cmluZykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gU2hpZnRDb21tYW5kLnNoaWZ0SW5kZW50KGluZGVudGF0aW9uLCBpbmRlbnRhdGlvbi5sZW5ndGggKyAxLCB0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMpO1xuXHRcdFx0fSxcblx0XHRcdHVuc2hpZnRJbmRlbnQ6IChpbmRlbnRhdGlvbjogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHJldHVybiBTaGlmdENvbW1hbmQudW5zaGlmdEluZGVudChpbmRlbnRhdGlvbiwgaW5kZW50YXRpb24ubGVuZ3RoICsgMSwgdGFiU2l6ZSwgaW5kZW50U2l6ZSwgaW5zZXJ0U3BhY2VzKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblxuXHRcdGxldCBmaXJzdExpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRpZiAoIS9cXFMvLnRlc3QoZmlyc3RMaW5lVGV4dC5zdWJzdHJpbmcoMCwgcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxKSkpIHtcblx0XHRcdGNvbnN0IGluZGVudE9mRmlyc3RMaW5lID0gZ2V0R29vZEluZGVudEZvckxpbmUoYXV0b0luZGVudCwgbW9kZWwsIG1vZGVsLmdldExhbmd1YWdlSWQoKSwgc3RhcnRMaW5lTnVtYmVyLCBpbmRlbnRDb252ZXJ0ZXIsIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRpZiAoaW5kZW50T2ZGaXJzdExpbmUgIT09IG51bGwpIHtcblx0XHRcdFx0Y29uc3Qgb2xkSW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKGZpcnN0TGluZVRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdTcGFjZUNudCA9IGluZGVudFV0aWxzLmdldFNwYWNlQ250KGluZGVudE9mRmlyc3RMaW5lLCB0YWJTaXplKTtcblx0XHRcdFx0Y29uc3Qgb2xkU3BhY2VDbnQgPSBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChvbGRJbmRlbnRhdGlvbiwgdGFiU2l6ZSk7XG5cblx0XHRcdFx0aWYgKG5ld1NwYWNlQ250ICE9PSBvbGRTcGFjZUNudCkge1xuXHRcdFx0XHRcdGNvbnN0IG5ld0luZGVudCA9IGluZGVudFV0aWxzLmdlbmVyYXRlSW5kZW50KG5ld1NwYWNlQ250LCB0YWJTaXplLCBpbnNlcnRTcGFjZXMpO1xuXHRcdFx0XHRcdHRleHRFZGl0cy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCAxLCBzdGFydExpbmVOdW1iZXIsIG9sZEluZGVudGF0aW9uLmxlbmd0aCArIDEpLFxuXHRcdFx0XHRcdFx0dGV4dDogbmV3SW5kZW50XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Zmlyc3RMaW5lVGV4dCA9IG5ld0luZGVudCArIGZpcnN0TGluZVRleHQuc3Vic3RyaW5nKG9sZEluZGVudGF0aW9uLmxlbmd0aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZW50TWV0YWRhdGEgPSBnZXRJbmRlbnRNZXRhZGF0YShtb2RlbCwgc3RhcnRMaW5lTnVtYmVyLCB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0XHRcdGlmIChpbmRlbnRNZXRhZGF0YSA9PT0gMCB8fCBpbmRlbnRNZXRhZGF0YSA9PT0gSW5kZW50Q29uc3RzLlVOSU5ERU5UX01BU0spIHtcblx0XHRcdFx0XHRcdC8vIHdlIHBhc3RlIGNvbnRlbnQgaW50byBhIGxpbmUgd2hlcmUgb25seSBjb250YWlucyB3aGl0ZXNwYWNlc1xuXHRcdFx0XHRcdFx0Ly8gYWZ0ZXIgcGFzdGluZywgdGhlIGluZGVudGF0aW9uIG9mIHRoZSBmaXJzdCBsaW5lIGlzIGFscmVhZHkgY29ycmVjdFxuXHRcdFx0XHRcdFx0Ly8gdGhlIGZpcnN0IGxpbmUgZG9lc24ndCBtYXRjaCBhbnkgaW5kZW50YXRpb24gcnVsZVxuXHRcdFx0XHRcdFx0Ly8gdGhlbiBuby1vcC5cblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cblx0XHQvLyBpZ25vcmUgZW1wdHkgb3IgaWdub3JlZCBsaW5lc1xuXHRcdHdoaWxlIChzdGFydExpbmVOdW1iZXIgPCByYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRpZiAoIS9cXFMvLnRlc3QobW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyICsgMSkpKSB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcisrO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChzdGFydExpbmVOdW1iZXIgIT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdGNvbnN0IHZpcnR1YWxNb2RlbCA9IHtcblx0XHRcdFx0dG9rZW5pemF0aW9uOiB7XG5cdFx0XHRcdFx0Z2V0TGluZVRva2VuczogKGxpbmVOdW1iZXI6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0TGFuZ3VhZ2VJZDogKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldExhbmd1YWdlSWRBdFBvc2l0aW9uOiAobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0TGluZUNvbnRlbnQ6IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHtcblx0XHRcdFx0XHRpZiAobGluZU51bWJlciA9PT0gZmlyc3RMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmlyc3RMaW5lVGV4dDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGluZGVudE9mU2Vjb25kTGluZSA9IGdldEdvb2RJbmRlbnRGb3JMaW5lKGF1dG9JbmRlbnQsIHZpcnR1YWxNb2RlbCwgbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBzdGFydExpbmVOdW1iZXIgKyAxLCBpbmRlbnRDb252ZXJ0ZXIsIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0aWYgKGluZGVudE9mU2Vjb25kTGluZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRjb25zdCBuZXdTcGFjZUNudE9mU2Vjb25kTGluZSA9IGluZGVudFV0aWxzLmdldFNwYWNlQ250KGluZGVudE9mU2Vjb25kTGluZSwgdGFiU2l6ZSk7XG5cdFx0XHRcdGNvbnN0IG9sZFNwYWNlQ250T2ZTZWNvbmRMaW5lID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQoc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIgKyAxKSksIHRhYlNpemUpO1xuXG5cdFx0XHRcdGlmIChuZXdTcGFjZUNudE9mU2Vjb25kTGluZSAhPT0gb2xkU3BhY2VDbnRPZlNlY29uZExpbmUpIHtcblx0XHRcdFx0XHRjb25zdCBzcGFjZUNudE9mZnNldCA9IG5ld1NwYWNlQ250T2ZTZWNvbmRMaW5lIC0gb2xkU3BhY2VDbnRPZlNlY29uZExpbmU7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IHN0YXJ0TGluZU51bWJlciArIDE7IGkgPD0gcmFuZ2UuZW5kTGluZU51bWJlcjsgaSsrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGkpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxJbmRlbnQgPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKGxpbmVDb250ZW50KTtcblx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsU3BhY2VzQ250ID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQob3JpZ2luYWxJbmRlbnQsIHRhYlNpemUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbmV3U3BhY2VzQ250ID0gb3JpZ2luYWxTcGFjZXNDbnQgKyBzcGFjZUNudE9mZnNldDtcblx0XHRcdFx0XHRcdGNvbnN0IG5ld0luZGVudCA9IGluZGVudFV0aWxzLmdlbmVyYXRlSW5kZW50KG5ld1NwYWNlc0NudCwgdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzKTtcblxuXHRcdFx0XHRcdFx0aWYgKG5ld0luZGVudCAhPT0gb3JpZ2luYWxJbmRlbnQpIHtcblx0XHRcdFx0XHRcdFx0dGV4dEVkaXRzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoaSwgMSwgaSwgb3JpZ2luYWxJbmRlbnQubGVuZ3RoICsgMSksXG5cdFx0XHRcdFx0XHRcdFx0dGV4dDogbmV3SW5kZW50XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0ZXh0RWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRjb25zdCBjbWQgPSBuZXcgQXV0b0luZGVudE9uUGFzdGVDb21tYW5kKHRleHRFZGl0cywgdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9uKCkhKTtcblx0XHRcdHRoaXMuZWRpdG9yLmV4ZWN1dGVDb21tYW5kKCdhdXRvSW5kZW50T25QYXN0ZScsIGNtZCk7XG5cdFx0XHR0aGlzLmVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJhbmdlQ29udGFpbnNPbmx5V2hpdGVzcGFjZUNoYXJhY3RlcnMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGxpbmVDb250YWluc09ubHlXaGl0ZXNwYWNlID0gKGNvbnRlbnQ6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudHJpbSgpLmxlbmd0aCA9PT0gMDtcblx0XHR9O1xuXHRcdGxldCBjb250YWluc09ubHlXaGl0ZXNwYWNlOiBib29sZWFuID0gdHJ1ZTtcblx0XHRpZiAocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSByYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBsaW5lUGFydCA9IGxpbmVDb250ZW50LnN1YnN0cmluZyhyYW5nZS5zdGFydENvbHVtbiAtIDEsIHJhbmdlLmVuZENvbHVtbiAtIDEpO1xuXHRcdFx0Y29udGFpbnNPbmx5V2hpdGVzcGFjZSA9IGxpbmVDb250YWluc09ubHlXaGl0ZXNwYWNlKGxpbmVQYXJ0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChsZXQgaSA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjsgaSA8PSByYW5nZS5lbmRMaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChpKTtcblx0XHRcdFx0aWYgKGkgPT09IHJhbmdlLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVQYXJ0ID0gbGluZUNvbnRlbnQuc3Vic3RyaW5nKHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSk7XG5cdFx0XHRcdFx0Y29udGFpbnNPbmx5V2hpdGVzcGFjZSA9IGxpbmVDb250YWluc09ubHlXaGl0ZXNwYWNlKGxpbmVQYXJ0KTtcblx0XHRcdFx0fSBlbHNlIGlmIChpID09PSByYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZVBhcnQgPSBsaW5lQ29udGVudC5zdWJzdHJpbmcoMCwgcmFuZ2UuZW5kQ29sdW1uIC0gMSk7XG5cdFx0XHRcdFx0Y29udGFpbnNPbmx5V2hpdGVzcGFjZSA9IGxpbmVDb250YWluc09ubHlXaGl0ZXNwYWNlKGxpbmVQYXJ0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb250YWluc09ubHlXaGl0ZXNwYWNlID0gbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihpKSA9PT0gMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWNvbnRhaW5zT25seVdoaXRlc3BhY2UpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29udGFpbnNPbmx5V2hpdGVzcGFjZTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FsbE9uRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jYWxsT25Nb2RlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNTdGFydE9yRW5kSW5TdHJpbmcobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSk6IGJvb2xlYW4ge1xuXHRjb25zdCBpc1Bvc2l0aW9uSW5TdHJpbmcgPSAocG9zaXRpb246IFBvc2l0aW9uKTogYm9vbGVhbiA9PiB7XG5cdFx0Y29uc3QgdG9rZW5UeXBlID0gZ2V0U3RhbmRhcmRUb2tlblR5cGVBdFBvc2l0aW9uKG1vZGVsLCBwb3NpdGlvbik7XG5cdFx0cmV0dXJuIHRva2VuVHlwZSA9PT0gU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nO1xuXHR9O1xuXHRyZXR1cm4gaXNQb3NpdGlvbkluU3RyaW5nKHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSkgfHwgaXNQb3NpdGlvbkluU3RyaW5nKHJhbmdlLmdldEVuZFBvc2l0aW9uKCkpO1xufVxuXG5mdW5jdGlvbiBnZXRJbmRlbnRhdGlvbkVkaXRPcGVyYXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBidWlsZGVyOiBJRWRpdE9wZXJhdGlvbkJ1aWxkZXIsIHRhYlNpemU6IG51bWJlciwgdGFic1RvU3BhY2VzOiBib29sZWFuKTogdm9pZCB7XG5cdGlmIChtb2RlbC5nZXRMaW5lQ291bnQoKSA9PT0gMSAmJiBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKDEpID09PSAxKSB7XG5cdFx0Ly8gTW9kZWwgaXMgZW1wdHlcblx0XHRyZXR1cm47XG5cdH1cblxuXHRsZXQgc3BhY2VzID0gJyc7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgdGFiU2l6ZTsgaSsrKSB7XG5cdFx0c3BhY2VzICs9ICcgJztcblx0fVxuXG5cdGNvbnN0IHNwYWNlc1JlZ0V4cCA9IG5ldyBSZWdFeHAoc3BhY2VzLCAnZ2knKTtcblxuXHRmb3IgKGxldCBsaW5lTnVtYmVyID0gMSwgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7IGxpbmVOdW1iZXIgPD0gbGluZUNvdW50OyBsaW5lTnVtYmVyKyspIHtcblx0XHRsZXQgbGFzdEluZGVudGF0aW9uQ29sdW1uID0gbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRpZiAobGFzdEluZGVudGF0aW9uQ29sdW1uID09PSAwKSB7XG5cdFx0XHRsYXN0SW5kZW50YXRpb25Db2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0SW5kZW50YXRpb25Db2x1bW4gPT09IDEpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsSW5kZW50YXRpb25SYW5nZSA9IG5ldyBSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCBsYXN0SW5kZW50YXRpb25Db2x1bW4pO1xuXHRcdGNvbnN0IG9yaWdpbmFsSW5kZW50YXRpb24gPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2Uob3JpZ2luYWxJbmRlbnRhdGlvblJhbmdlKTtcblx0XHRjb25zdCBuZXdJbmRlbnRhdGlvbiA9IChcblx0XHRcdHRhYnNUb1NwYWNlc1xuXHRcdFx0XHQ/IG9yaWdpbmFsSW5kZW50YXRpb24ucmVwbGFjZSgvXFx0L2lnLCBzcGFjZXMpXG5cdFx0XHRcdDogb3JpZ2luYWxJbmRlbnRhdGlvbi5yZXBsYWNlKHNwYWNlc1JlZ0V4cCwgJ1xcdCcpXG5cdFx0KTtcblxuXHRcdGJ1aWxkZXIuYWRkRWRpdE9wZXJhdGlvbihvcmlnaW5hbEluZGVudGF0aW9uUmFuZ2UsIG5ld0luZGVudGF0aW9uKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5kZW50YXRpb25Ub1NwYWNlc0NvbW1hbmQgaW1wbGVtZW50cyBJQ29tbWFuZCB7XG5cblx0cHJpdmF0ZSBzZWxlY3Rpb25JZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzZWxlY3Rpb246IFNlbGVjdGlvbiwgcHJpdmF0ZSB0YWJTaXplOiBudW1iZXIpIHsgfVxuXG5cdHB1YmxpYyBnZXRFZGl0T3BlcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3Rpb25JZCA9IGJ1aWxkZXIudHJhY2tTZWxlY3Rpb24odGhpcy5zZWxlY3Rpb24pO1xuXHRcdGdldEluZGVudGF0aW9uRWRpdE9wZXJhdGlvbnMobW9kZWwsIGJ1aWxkZXIsIHRoaXMudGFiU2l6ZSwgdHJ1ZSk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZUN1cnNvclN0YXRlKG1vZGVsOiBJVGV4dE1vZGVsLCBoZWxwZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSk6IFNlbGVjdGlvbiB7XG5cdFx0cmV0dXJuIGhlbHBlci5nZXRUcmFja2VkU2VsZWN0aW9uKHRoaXMuc2VsZWN0aW9uSWQhKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5kZW50YXRpb25Ub1RhYnNDb21tYW5kIGltcGxlbWVudHMgSUNvbW1hbmQge1xuXG5cdHByaXZhdGUgc2VsZWN0aW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIHByaXZhdGUgdGFiU2l6ZTogbnVtYmVyKSB7IH1cblxuXHRwdWJsaWMgZ2V0RWRpdE9wZXJhdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlcik6IHZvaWQge1xuXHRcdHRoaXMuc2VsZWN0aW9uSWQgPSBidWlsZGVyLnRyYWNrU2VsZWN0aW9uKHRoaXMuc2VsZWN0aW9uKTtcblx0XHRnZXRJbmRlbnRhdGlvbkVkaXRPcGVyYXRpb25zKG1vZGVsLCBidWlsZGVyLCB0aGlzLnRhYlNpemUsIGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlQ3Vyc29yU3RhdGUobW9kZWw6IElUZXh0TW9kZWwsIGhlbHBlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXJEYXRhKTogU2VsZWN0aW9uIHtcblx0XHRyZXR1cm4gaGVscGVyLmdldFRyYWNrZWRTZWxlY3Rpb24odGhpcy5zZWxlY3Rpb25JZCEpO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKEF1dG9JbmRlbnRPblBhc3RlLklELCBBdXRvSW5kZW50T25QYXN0ZSwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5CZWZvcmVGaXJzdEludGVyYWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEluZGVudGF0aW9uVG9TcGFjZXNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oSW5kZW50YXRpb25Ub1RhYnNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oSW5kZW50VXNpbmdUYWJzKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEluZGVudFVzaW5nU3BhY2VzKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKENoYW5nZVRhYkRpc3BsYXlTaXplKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKERldGVjdEluZGVudGF0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFJlaW5kZW50TGluZXNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oUmVpbmRlbnRTZWxlY3RlZExpbmVzQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsWUFBWSxhQUFhO0FBQ3pCLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGNBQWMsaUNBQWlELHNCQUFzQixrQ0FBb0Q7QUFDbEosU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEIsb0JBQW9CO0FBR3ZELFNBQWlCLGFBQWE7QUFHOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxzQkFBc0IseUJBQXlCO0FBQ3hELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMscUJB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
