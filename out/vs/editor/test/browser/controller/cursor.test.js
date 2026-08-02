import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CoreEditingCommands, CoreNavigationCommands } from "../../../browser/coreCommands.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { MetadataConsts, StandardTokenType } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { IndentAction } from "../../../common/languages/languageConfiguration.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { EndOfLinePreference, EndOfLineSequence } from "../../../common/model.js";
import { TextModel } from "../../../common/model/textModel.js";
import { OutgoingViewModelEventKind } from "../../../common/viewModelEventDispatcher.js";
import { createCodeEditorServices, instantiateTestCodeEditor, withTestCodeEditor } from "../testCodeEditor.js";
import { createTextModel, instantiateTextModel } from "../../common/testTextModel.js";
import { InputMode } from "../../../common/inputMode.js";
import { EditSources } from "../../../common/textModelEditSource.js";
function moveTo(editor, viewModel, lineNumber, column, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.MoveToSelect.runCoreEditorCommand(viewModel, {
      position: new Position(lineNumber, column)
    });
  } else {
    CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, {
      position: new Position(lineNumber, column)
    });
  }
}
function moveLeft(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorLeftSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorLeft.runCoreEditorCommand(viewModel, {});
  }
}
function moveRight(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorRightSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorRight.runCoreEditorCommand(viewModel, {});
  }
}
function moveDown(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorDownSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorDown.runCoreEditorCommand(viewModel, {});
  }
}
function moveUp(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorUpSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorUp.runCoreEditorCommand(viewModel, {});
  }
}
function moveToBeginningOfLine(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorHomeSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorHome.runCoreEditorCommand(viewModel, {});
  }
}
function moveToEndOfLine(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorEndSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorEnd.runCoreEditorCommand(viewModel, {});
  }
}
function moveToBeginningOfBuffer(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorTopSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorTop.runCoreEditorCommand(viewModel, {});
  }
}
function moveToEndOfBuffer(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorBottomSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorBottom.runCoreEditorCommand(viewModel, {});
  }
}
function assertCursor(viewModel, what) {
  let selections;
  if (what instanceof Position) {
    selections = [new Selection(what.lineNumber, what.column, what.lineNumber, what.column)];
  } else if (what instanceof Selection) {
    selections = [what];
  } else {
    selections = what;
  }
  const actual = viewModel.getSelections().map((s) => s.toString());
  const expected = selections.map((s) => s.toString());
  assert.deepStrictEqual(actual, expected);
}
suite("Editor Controller - Cursor", () => {
  const LINE1 = "    	My First Line	 ";
  const LINE2 = "	My Second Line";
  const LINE3 = "    Third Line\u{1F436}";
  const LINE4 = "";
  const LINE5 = "1";
  const TEXT = LINE1 + "\r\n" + LINE2 + "\n" + LINE3 + "\n" + LINE4 + "\r\n" + LINE5;
  function runTest(callback) {
    withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
      callback(editor, viewModel);
    });
  }
  ensureNoDisposablesAreLeakedInTestSuite();
  test("cursor initialized", () => {
    runTest((editor, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("no move", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 1);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 2);
      assertCursor(viewModel, new Position(1, 2));
    });
  });
  test("move in selection mode", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 2, true);
      assertCursor(viewModel, new Selection(1, 1, 1, 2));
    });
  });
  test("move beyond line end", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 25);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("move empty line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 4, 20);
      assertCursor(viewModel, new Position(4, 1));
    });
  });
  test("move one char line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 5, 20);
      assertCursor(viewModel, new Position(5, 2));
    });
  });
  test("selection down", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 1, true);
      assertCursor(viewModel, new Selection(1, 1, 2, 1));
    });
  });
  test("move and then select", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 3);
      assertCursor(viewModel, new Position(2, 3));
      moveTo(editor, viewModel, 2, 15, true);
      assertCursor(viewModel, new Selection(2, 3, 2, 15));
      moveTo(editor, viewModel, 1, 2, true);
      assertCursor(viewModel, new Selection(2, 3, 1, 2));
    });
  });
  test("move left on top left position", () => {
    runTest((editor, viewModel) => {
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move left", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 3);
      assertCursor(viewModel, new Position(1, 3));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(1, 2));
    });
  });
  test("move left with surrogate pair", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 17);
      assertCursor(viewModel, new Position(3, 17));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(3, 15));
    });
  });
  test("move left goes to previous row", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      assertCursor(viewModel, new Position(2, 1));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(1, 21));
    });
  });
  test("move left selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      assertCursor(viewModel, new Position(2, 1));
      moveLeft(editor, viewModel, true);
      assertCursor(viewModel, new Selection(2, 1, 1, 21));
    });
  });
  test("move right on bottom right position", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 5, 2);
      assertCursor(viewModel, new Position(5, 2));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(5, 2));
    });
  });
  test("move right", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 3);
      assertCursor(viewModel, new Position(1, 3));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(1, 4));
    });
  });
  test("move right with surrogate pair", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 15);
      assertCursor(viewModel, new Position(3, 15));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(3, 17));
    });
  });
  test("move right goes to next row", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 21);
      assertCursor(viewModel, new Position(1, 21));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(2, 1));
    });
  });
  test("move right selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 21);
      assertCursor(viewModel, new Position(1, 21));
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 21, 2, 1));
    });
  });
  test("move down", () => {
    runTest((editor, viewModel) => {
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(3, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(4, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, 2));
    });
  });
  test("move down with selection", () => {
    runTest((editor, viewModel) => {
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 2, 1));
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 3, 1));
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 4, 1));
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 5, 1));
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 5, 2));
    });
  });
  test("move down with tabs", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 5);
      assertCursor(viewModel, new Position(1, 5));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 2));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(3, 5));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(4, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, 2));
    });
  });
  test("move up", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 5);
      assertCursor(viewModel, new Position(3, 5));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(2, 2));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 5));
    });
  });
  test("move up with selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 5);
      assertCursor(viewModel, new Position(3, 5));
      moveUp(editor, viewModel, true);
      assertCursor(viewModel, new Selection(3, 5, 2, 2));
      moveUp(editor, viewModel, true);
      assertCursor(viewModel, new Selection(3, 5, 1, 5));
    });
  });
  test("move up and down with tabs", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 5);
      assertCursor(viewModel, new Position(1, 5));
      moveDown(editor, viewModel);
      moveDown(editor, viewModel);
      moveDown(editor, viewModel);
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, 2));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(4, 1));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(3, 5));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(2, 2));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 5));
    });
  });
  test("move up and down with end of lines starting from a long one", () => {
    runTest((editor, viewModel) => {
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, LINE2.length + 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(3, LINE3.length + 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(4, LINE4.length + 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, LINE5.length + 1));
      moveUp(editor, viewModel);
      moveUp(editor, viewModel);
      moveUp(editor, viewModel);
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("issue #44465: cursor position not correct when move", () => {
    runTest((editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 2));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 5));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 1));
    });
  });
  test("issue #144041: Cursor up/down works", () => {
    const model = createTextModel(
      [
        "Word1 Word2 Word3 Word4",
        "Word5 Word6 Word7 Word8"
      ].join("\n")
    );
    withTestCodeEditor(model, { wrappingIndent: "indent", wordWrap: "wordWrapColumn", wordWrapColumn: 20 }, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1)]);
      const cursorPositions = [];
      function reportCursorPosition() {
        cursorPositions.push(viewModel.getCursorStates()[0].viewState.position.toString());
      }
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      assert.deepStrictEqual(cursorPositions, [
        "(1,1)",
        "(2,5)",
        "(3,1)",
        "(4,5)",
        "(4,10)",
        "(3,1)",
        "(2,5)",
        "(1,1)",
        "(1,1)"
      ]);
    });
    model.dispose();
  });
  test("issue #140195: Cursor up/down makes progress", () => {
    const model = createTextModel(
      [
        "Word1 Word2 Word3 Word4",
        "Word5 Word6 Word7 Word8"
      ].join("\n")
    );
    withTestCodeEditor(model, { wrappingIndent: "indent", wordWrap: "wordWrapColumn", wordWrapColumn: 20 }, (editor, viewModel) => {
      editor.changeDecorations((changeAccessor) => {
        changeAccessor.deltaDecorations([], [
          {
            range: new Range(1, 22, 1, 22),
            options: {
              showIfCollapsed: true,
              description: "test",
              after: {
                content: "some very very very very very very very very long text"
              }
            }
          }
        ]);
      });
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1)]);
      const cursorPositions = [];
      function reportCursorPosition() {
        cursorPositions.push(viewModel.getCursorStates()[0].viewState.position.toString());
      }
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      assert.deepStrictEqual(cursorPositions, [
        "(1,1)",
        "(2,5)",
        "(5,19)",
        "(6,1)",
        "(7,5)",
        "(6,1)",
        "(2,8)",
        "(1,1)",
        "(1,1)"
      ]);
    });
    model.dispose();
  });
  test("move to beginning of line", () => {
    runTest((editor, viewModel) => {
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 6));
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of line from within line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 6));
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of line from whitespace at beginning of line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 2);
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 6));
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of line from within line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveToBeginningOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 8, 1, 6));
      moveToBeginningOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 8, 1, 1));
    });
  });
  test("move to beginning of line with selection multiline forward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveTo(editor, viewModel, 3, 9, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 5, 3, 5));
    });
  });
  test("move to beginning of line with selection multiline backward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 9);
      moveTo(editor, viewModel, 1, 8, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(1, 6, 1, 6));
    });
  });
  test("move to beginning of line with selection single line forward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 2);
      moveTo(editor, viewModel, 3, 9, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 5, 3, 5));
    });
  });
  test("move to beginning of line with selection single line backward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 9);
      moveTo(editor, viewModel, 3, 2, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 5, 3, 5));
    });
  });
  test('issue #15401: "End" key is behaving weird when text is selected part 1', () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveTo(editor, viewModel, 3, 9, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 5, 3, 5));
    });
  });
  test("issue #17011: Shift+home/end now go to the end of the selection start's line, not the selection's end", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveTo(editor, viewModel, 3, 9, true);
      moveToBeginningOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 8, 3, 5));
    });
  });
  test("move to end of line", () => {
    runTest((editor, viewModel) => {
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("move to end of line from within line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 6);
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("move to end of line from whitespace at end of line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 20);
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("move to end of line from within line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 6);
      moveToEndOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 6, 1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 6, 1, LINE1.length + 1));
    });
  });
  test("move to end of line with selection multiline forward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 1);
      moveTo(editor, viewModel, 3, 9, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 17, 3, 17));
    });
  });
  test("move to end of line with selection multiline backward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 9);
      moveTo(editor, viewModel, 1, 1, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(1, 21, 1, 21));
    });
  });
  test("move to end of line with selection single line forward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 1);
      moveTo(editor, viewModel, 3, 9, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 17, 3, 17));
    });
  });
  test("move to end of line with selection single line backward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 9);
      moveTo(editor, viewModel, 3, 1, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 17, 3, 17));
    });
  });
  test('issue #15401: "End" key is behaving weird when text is selected part 2', () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 1);
      moveTo(editor, viewModel, 3, 9, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 17, 3, 17));
    });
  });
  test("move to beginning of buffer", () => {
    runTest((editor, viewModel) => {
      moveToBeginningOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of buffer from within first line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 3);
      moveToBeginningOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of buffer from within another line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      moveToBeginningOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of buffer from within first line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 3);
      moveToBeginningOfBuffer(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 3, 1, 1));
    });
  });
  test("move to beginning of buffer from within another line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      moveToBeginningOfBuffer(editor, viewModel, true);
      assertCursor(viewModel, new Selection(3, 3, 1, 1));
    });
  });
  test("move to end of buffer", () => {
    runTest((editor, viewModel) => {
      moveToEndOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(5, LINE5.length + 1));
    });
  });
  test("move to end of buffer from within last line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 5, 1);
      moveToEndOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(5, LINE5.length + 1));
    });
  });
  test("move to end of buffer from within another line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      moveToEndOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(5, LINE5.length + 1));
    });
  });
  test("move to end of buffer from within last line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 5, 1);
      moveToEndOfBuffer(editor, viewModel, true);
      assertCursor(viewModel, new Selection(5, 1, 5, LINE5.length + 1));
    });
  });
  test("move to end of buffer from within another line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      moveToEndOfBuffer(editor, viewModel, true);
      assertCursor(viewModel, new Selection(3, 3, 5, LINE5.length + 1));
    });
  });
  test("select all", () => {
    runTest((editor, viewModel) => {
      CoreNavigationCommands.SelectAll.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, new Selection(1, 1, 5, LINE5.length + 1));
    });
  });
  test("no move doesn't trigger event", () => {
    runTest((editor, viewModel) => {
      const disposable = viewModel.onEvent((e) => {
        assert.ok(false, "was not expecting event");
      });
      moveTo(editor, viewModel, 1, 1);
      disposable.dispose();
    });
  });
  test("move eventing", () => {
    runTest((editor, viewModel) => {
      let events = 0;
      const disposable = viewModel.onEvent((e) => {
        if (e.kind === OutgoingViewModelEventKind.CursorStateChanged) {
          events++;
          assert.deepStrictEqual(e.selections, [new Selection(1, 2, 1, 2)]);
        }
      });
      moveTo(editor, viewModel, 1, 2);
      assert.strictEqual(events, 1, "receives 1 event");
      disposable.dispose();
    });
  });
  test("move in selection mode eventing", () => {
    runTest((editor, viewModel) => {
      let events = 0;
      const disposable = viewModel.onEvent((e) => {
        if (e.kind === OutgoingViewModelEventKind.CursorStateChanged) {
          events++;
          assert.deepStrictEqual(e.selections, [new Selection(1, 1, 1, 2)]);
        }
      });
      moveTo(editor, viewModel, 1, 2, true);
      assert.strictEqual(events, 1, "receives 1 event");
      disposable.dispose();
    });
  });
  test("saveState & restoreState", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 1, true);
      assertCursor(viewModel, new Selection(1, 1, 2, 1));
      const savedState = JSON.stringify(viewModel.saveCursorState());
      moveTo(editor, viewModel, 1, 1, false);
      assertCursor(viewModel, new Position(1, 1));
      viewModel.restoreCursorState(JSON.parse(savedState));
      assertCursor(viewModel, new Selection(1, 1, 2, 1));
    });
  });
  test("Independent model edit 1", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 16, true);
      editor.getModel().applyEdits([EditOperation.delete(new Range(2, 1, 2, 2))]);
      assertCursor(viewModel, new Selection(1, 1, 2, 15));
    });
  });
  test("column select 1", () => {
    withTestCodeEditor([
      "	private compute(a:number): boolean {",
      "		if (a + 3 === 0 || a + 5 === 0) {",
      "			return false;",
      "		}",
      "	}"
    ], {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Position(1, 7));
      CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
        position: new Position(4, 4),
        viewPosition: new Position(4, 4),
        mouseColumn: 15,
        doColumnSelect: true
      });
      const expectedSelections = [
        new Selection(1, 7, 1, 12),
        new Selection(2, 4, 2, 9),
        new Selection(3, 3, 3, 6),
        new Selection(4, 4, 4, 4)
      ];
      assertCursor(viewModel, expectedSelections);
    });
  });
  test("grapheme breaking", () => {
    withTestCodeEditor([
      "abcabc",
      "a\u0303a\u0303a\u0303a\u0303a\u0303a\u0303",
      "\u8FBB\u{E0100}\u8FBB\u{E0100}\u8FBB\u{E0100}",
      "\u0BAA\u0BC1"
    ], {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 1, 2, 1)]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(2, 3));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(2, 1));
      viewModel.setSelections("test", [new Selection(3, 1, 3, 1)]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(3, 4));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(3, 1));
      viewModel.setSelections("test", [new Selection(4, 1, 4, 1)]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(4, 3));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(4, 1));
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 5));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(3, 4));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(2, 5));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 3));
    });
  });
  test("issue #4905 - column select is biased to the right", () => {
    withTestCodeEditor([
      'var gulp = require("gulp");',
      'var path = require("path");',
      'var rimraf = require("rimraf");',
      'var isarray = require("isarray");',
      'var merge = require("merge-stream");',
      'var concat = require("gulp-concat");',
      'var newer = require("gulp-newer");'
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 4, false);
      assertCursor(viewModel, new Position(1, 4));
      CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
        position: new Position(4, 1),
        viewPosition: new Position(4, 1),
        mouseColumn: 1,
        doColumnSelect: true
      });
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 1),
        new Selection(2, 4, 2, 1),
        new Selection(3, 4, 3, 1),
        new Selection(4, 4, 4, 1)
      ]);
    });
  });
  test("issue #20087: column select with mouse", () => {
    withTestCodeEditor([
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" Key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SoMEKEy" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" valuE="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="00X"/>'
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 10, 10, false);
      assertCursor(viewModel, new Position(10, 10));
      CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
        position: new Position(1, 1),
        viewPosition: new Position(1, 1),
        mouseColumn: 1,
        doColumnSelect: true
      });
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 1),
        new Selection(9, 10, 9, 1),
        new Selection(8, 10, 8, 1),
        new Selection(7, 10, 7, 1),
        new Selection(6, 10, 6, 1),
        new Selection(5, 10, 5, 1),
        new Selection(4, 10, 4, 1),
        new Selection(3, 10, 3, 1),
        new Selection(2, 10, 2, 1),
        new Selection(1, 10, 1, 1)
      ]);
      CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
        position: new Position(1, 1),
        viewPosition: new Position(1, 1),
        mouseColumn: 1,
        doColumnSelect: true
      });
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 1),
        new Selection(9, 10, 9, 1),
        new Selection(8, 10, 8, 1),
        new Selection(7, 10, 7, 1),
        new Selection(6, 10, 6, 1),
        new Selection(5, 10, 5, 1),
        new Selection(4, 10, 4, 1),
        new Selection(3, 10, 3, 1),
        new Selection(2, 10, 2, 1),
        new Selection(1, 10, 1, 1)
      ]);
    });
  });
  test("issue #20087: column select with keyboard", () => {
    withTestCodeEditor([
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" Key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SoMEKEy" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" valuE="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="00X"/>'
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 10, 10, false);
      assertCursor(viewModel, new Position(10, 10));
      CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 9)
      ]);
      CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 8)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 9)
      ]);
      CoreNavigationCommands.CursorColumnSelectUp.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 9),
        new Selection(9, 10, 9, 9)
      ]);
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 9)
      ]);
    });
  });
  test("issue #118062: Column selection cannot select first position of a line", () => {
    withTestCodeEditor([
      "hello world"
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 2, false);
      assertCursor(viewModel, new Position(1, 2));
      CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 2, 1, 1)
      ]);
    });
  });
  test("column select with keyboard", () => {
    withTestCodeEditor([
      'var gulp = require("gulp");',
      'var path = require("path");',
      'var rimraf = require("rimraf");',
      'var isarray = require("isarray");',
      'var merge = require("merge-stream");',
      'var concat = require("gulp-concat");',
      'var newer = require("gulp-newer");'
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 4, false);
      assertCursor(viewModel, new Position(1, 4));
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 5)
      ]);
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 5),
        new Selection(2, 4, 2, 5)
      ]);
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 5),
        new Selection(2, 4, 2, 5),
        new Selection(3, 4, 3, 5)
      ]);
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 5),
        new Selection(2, 4, 2, 5),
        new Selection(3, 4, 3, 5),
        new Selection(4, 4, 4, 5),
        new Selection(5, 4, 5, 5),
        new Selection(6, 4, 6, 5),
        new Selection(7, 4, 7, 5)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 6),
        new Selection(2, 4, 2, 6),
        new Selection(3, 4, 3, 6),
        new Selection(4, 4, 4, 6),
        new Selection(5, 4, 5, 6),
        new Selection(6, 4, 6, 6),
        new Selection(7, 4, 7, 6)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 16),
        new Selection(2, 4, 2, 16),
        new Selection(3, 4, 3, 16),
        new Selection(4, 4, 4, 16),
        new Selection(5, 4, 5, 16),
        new Selection(6, 4, 6, 16),
        new Selection(7, 4, 7, 16)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 26),
        new Selection(2, 4, 2, 26),
        new Selection(3, 4, 3, 26),
        new Selection(4, 4, 4, 26),
        new Selection(5, 4, 5, 26),
        new Selection(6, 4, 6, 26),
        new Selection(7, 4, 7, 26)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 28),
        new Selection(4, 4, 4, 28),
        new Selection(5, 4, 5, 28),
        new Selection(6, 4, 6, 28),
        new Selection(7, 4, 7, 28)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 32),
        new Selection(5, 4, 5, 32),
        new Selection(6, 4, 6, 32),
        new Selection(7, 4, 7, 32)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 34),
        new Selection(6, 4, 6, 34),
        new Selection(7, 4, 7, 34)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 35),
        new Selection(6, 4, 6, 35),
        new Selection(7, 4, 7, 35)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 37),
        new Selection(6, 4, 6, 37),
        new Selection(7, 4, 7, 35)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 37),
        new Selection(6, 4, 6, 37),
        new Selection(7, 4, 7, 35)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 37),
        new Selection(6, 4, 6, 37),
        new Selection(7, 4, 7, 35)
      ]);
      CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 36),
        new Selection(6, 4, 6, 36),
        new Selection(7, 4, 7, 35)
      ]);
    });
  });
  test("setSelection / setPosition with source", () => {
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        return new EncodedTokenizationResult(new Uint32Array(0), [], state);
      }
    };
    const LANGUAGE_ID = "modelModeTest1";
    const languageRegistration = TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
    const model = createTextModel("Just text", LANGUAGE_ID);
    withTestCodeEditor(model, {}, (editor1, cursor1) => {
      let event = void 0;
      const disposable = editor1.onDidChangeCursorPosition((e) => {
        event = e;
      });
      editor1.setSelection(new Range(1, 2, 1, 3), "navigation");
      assert.strictEqual(event.source, "navigation");
      event = void 0;
      editor1.setPosition(new Position(1, 2), "navigation");
      assert.strictEqual(event.source, "navigation");
      disposable.dispose();
    });
    languageRegistration.dispose();
    model.dispose();
  });
});
suite("Editor Controller", () => {
  const surroundingLanguageId = "surroundingLanguage";
  const indentRulesLanguageId = "indentRulesLanguage";
  const electricCharLanguageId = "electricCharLanguage";
  const autoClosingLanguageId = "autoClosingLanguage";
  const emptyClosingSurroundLanguageId = "emptyClosingSurroundLanguage";
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  let languageService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createCodeEditorServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: surroundingLanguageId }));
    disposables.add(languageConfigurationService.register(surroundingLanguageId, {
      autoClosingPairs: [{ open: "(", close: ")" }]
    }));
    disposables.add(languageService.registerLanguage({ id: emptyClosingSurroundLanguageId }));
    disposables.add(languageConfigurationService.register(emptyClosingSurroundLanguageId, {
      surroundingPairs: [{ open: "<", close: "" }]
    }));
    setupIndentRulesLanguage(indentRulesLanguageId, {
      decreaseIndentPattern: /^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
      increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
      indentNextLinePattern: /^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$)/,
      unIndentedLinePattern: /^(?!.*([;{}]|\S:)\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!.*(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$))/
    });
    disposables.add(languageService.registerLanguage({ id: electricCharLanguageId }));
    disposables.add(languageConfigurationService.register(electricCharLanguageId, {
      __electricCharacterSupport: {
        docComment: { open: "/**", close: " */" }
      },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    setupAutoClosingLanguage();
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function setupOnEnterLanguage(indentAction) {
    const onEnterLanguageId = "onEnterMode";
    disposables.add(languageService.registerLanguage({ id: onEnterLanguageId }));
    disposables.add(languageConfigurationService.register(onEnterLanguageId, {
      onEnterRules: [{
        beforeText: /.*/,
        action: {
          indentAction
        }
      }]
    }));
    return onEnterLanguageId;
  }
  function setupIndentRulesLanguage(languageId, indentationRules) {
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      indentationRules
    }));
    return languageId;
  }
  function setupAutoClosingLanguage() {
    disposables.add(languageService.registerLanguage({ id: autoClosingLanguageId }));
    disposables.add(languageConfigurationService.register(autoClosingLanguageId, {
      comments: {
        blockComment: ["/*", "*/"]
      },
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "'", close: "'", notIn: ["string", "comment"] },
        { open: '"', close: '"', notIn: ["string"] },
        { open: "`", close: "`", notIn: ["string", "comment"] },
        { open: "/**", close: " */", notIn: ["string"] },
        { open: "begin", close: "end", notIn: ["string"] }
      ],
      __electricCharacterSupport: {
        docComment: { open: "/**", close: " */" }
      }
    }));
  }
  function setupAutoClosingLanguageTokenization() {
    class BaseState {
      constructor(parent = null) {
        this.parent = parent;
      }
      clone() {
        return this;
      }
      equals(other) {
        if (!(other instanceof BaseState)) {
          return false;
        }
        if (!this.parent && !other.parent) {
          return true;
        }
        if (!this.parent || !other.parent) {
          return false;
        }
        return this.parent.equals(other.parent);
      }
    }
    class StringState {
      constructor(char, parentState) {
        this.char = char;
        this.parentState = parentState;
      }
      clone() {
        return this;
      }
      equals(other) {
        return other instanceof StringState && this.char === other.char && this.parentState.equals(other.parentState);
      }
    }
    class BlockCommentState {
      constructor(parentState) {
        this.parentState = parentState;
      }
      clone() {
        return this;
      }
      equals(other) {
        return other instanceof StringState && this.parentState.equals(other.parentState);
      }
    }
    const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(autoClosingLanguageId);
    disposables.add(TokenizationRegistry.register(autoClosingLanguageId, {
      getInitialState: () => new BaseState(),
      tokenize: void 0,
      tokenizeEncoded: function(line, hasEOL, _state) {
        let state = _state;
        const tokens = [];
        const generateToken = (length, type, newState) => {
          if (tokens.length > 0 && tokens[tokens.length - 1].type === type) {
            tokens[tokens.length - 1].length += length;
          } else {
            tokens.push({ length, type });
          }
          line = line.substring(length);
          if (newState) {
            state = newState;
          }
        };
        while (line.length > 0) {
          advance();
        }
        const result = new Uint32Array(tokens.length * 2);
        let startIndex = 0;
        for (let i = 0; i < tokens.length; i++) {
          result[2 * i] = startIndex;
          result[2 * i + 1] = encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET | tokens[i].type << MetadataConsts.TOKEN_TYPE_OFFSET;
          startIndex += tokens[i].length;
        }
        return new EncodedTokenizationResult(result, [], state);
        function advance() {
          if (state instanceof BaseState) {
            const m1 = line.match(/^[^'"`{}/]+/g);
            if (m1) {
              return generateToken(m1[0].length, StandardTokenType.Other);
            }
            if (/^['"`]/.test(line)) {
              return generateToken(1, StandardTokenType.String, new StringState(line.charAt(0), state));
            }
            if (/^{/.test(line)) {
              return generateToken(1, StandardTokenType.Other, new BaseState(state));
            }
            if (/^}/.test(line)) {
              return generateToken(1, StandardTokenType.Other, state.parent || new BaseState());
            }
            if (/^\/\//.test(line)) {
              return generateToken(line.length, StandardTokenType.Comment, state);
            }
            if (/^\/\*/.test(line)) {
              return generateToken(2, StandardTokenType.Comment, new BlockCommentState(state));
            }
            return generateToken(1, StandardTokenType.Other, state);
          } else if (state instanceof StringState) {
            const m1 = line.match(/^[^\\'"`\$]+/g);
            if (m1) {
              return generateToken(m1[0].length, StandardTokenType.String);
            }
            if (/^\\/.test(line)) {
              return generateToken(2, StandardTokenType.String);
            }
            if (line.charAt(0) === state.char) {
              return generateToken(1, StandardTokenType.String, state.parentState);
            }
            if (/^\$\{/.test(line)) {
              return generateToken(2, StandardTokenType.Other, new BaseState(state));
            }
            return generateToken(1, StandardTokenType.Other, state);
          } else if (state instanceof BlockCommentState) {
            const m1 = line.match(/^[^*]+/g);
            if (m1) {
              return generateToken(m1[0].length, StandardTokenType.String);
            }
            if (/^\*\//.test(line)) {
              return generateToken(2, StandardTokenType.Comment, state.parentState);
            }
            return generateToken(1, StandardTokenType.Other, state);
          } else {
            throw new Error(`unknown state`);
          }
        }
      }
    }));
  }
  function setAutoClosingLanguageEnabledSet(chars) {
    disposables.add(languageConfigurationService.register(autoClosingLanguageId, {
      autoCloseBefore: chars,
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "'", close: "'", notIn: ["string", "comment"] },
        { open: '"', close: '"', notIn: ["string"] },
        { open: "`", close: "`", notIn: ["string", "comment"] },
        { open: "/**", close: " */", notIn: ["string"] }
      ]
    }));
  }
  function createTextModel2(text, languageId = null, options = TextModel.DEFAULT_CREATION_OPTIONS, uri = null) {
    return disposables.add(instantiateTextModel(instantiationService, text, languageId, options, uri));
  }
  function withTestCodeEditor2(text, options, callback) {
    let model;
    if (typeof text === "string") {
      model = createTextModel2(text);
    } else if (Array.isArray(text)) {
      model = createTextModel2(text.join("\n"));
    } else {
      model = text;
    }
    const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model, options));
    const viewModel = editor.getViewModel();
    viewModel.setHasFocus(true);
    callback(editor, viewModel);
  }
  function usingCursor(opts, callback) {
    const model = createTextModel2(opts.text.join("\n"), opts.languageId, opts.modelOpts);
    const editorOptions = opts.editorOpts || {};
    withTestCodeEditor2(model, editorOptions, (editor, viewModel) => {
      callback(editor, model, viewModel);
    });
  }
  let AutoClosingColumnType;
  ((AutoClosingColumnType2) => {
    AutoClosingColumnType2[AutoClosingColumnType2["Normal"] = 0] = "Normal";
    AutoClosingColumnType2[AutoClosingColumnType2["Special1"] = 1] = "Special1";
    AutoClosingColumnType2[AutoClosingColumnType2["Special2"] = 2] = "Special2";
  })(AutoClosingColumnType || (AutoClosingColumnType = {}));
  function extractAutoClosingSpecialColumns(maxColumn, annotatedLine) {
    const result = [];
    for (let j = 1; j <= maxColumn; j++) {
      result[j] = 0 /* Normal */;
    }
    let column = 1;
    for (let j = 0; j < annotatedLine.length; j++) {
      if (annotatedLine.charAt(j) === "|") {
        result[column] = 1 /* Special1 */;
      } else if (annotatedLine.charAt(j) === "!") {
        result[column] = 2 /* Special2 */;
      } else {
        column++;
      }
    }
    return result;
  }
  function assertType(editor, model, viewModel, lineNumber, column, chr, expectedInsert, message) {
    const lineContent = model.getLineContent(lineNumber);
    const expected = lineContent.substr(0, column - 1) + expectedInsert + lineContent.substr(column - 1);
    moveTo(editor, viewModel, lineNumber, column);
    viewModel.type(chr, "keyboard");
    assert.deepStrictEqual(model.getLineContent(lineNumber), expected, message);
    model.undo();
  }
  test("issue microsoft/monaco-editor#443: Indentation of a single row deletes selected text in some cases", () => {
    const model = createTextModel2(
      [
        "Hello world!",
        "another line"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 13)]);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 1, 1, 14));
    });
  });
  test("Bug 9121: Auto indent + undo + redo is funky", () => {
    const model = createTextModel2(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false,
        trimAutoWhitespace: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n", "assert1");
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	", "assert2");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\n	", "assert3");
      viewModel.type("x");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\n	x", "assert4");
      CoreNavigationCommands.CursorLeft.runCoreEditorCommand(viewModel, {});
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\n	x", "assert5");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\nx", "assert6");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	x", "assert7");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert8");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x", "assert9");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert10");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\nx", "assert11");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\n	x", "assert12");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\nx", "assert13");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert14");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x", "assert15");
    });
  });
  test("issue #23539: Setting model EOL isn't undoable", () => {
    withTestCodeEditor2([
      "Hello",
      "world"
    ], {}, (editor, viewModel) => {
      const model = editor.getModel();
      assertCursor(viewModel, new Position(1, 1));
      model.setEOL(EndOfLineSequence.LF);
      assert.strictEqual(model.getValue(), "Hello\nworld");
      model.pushEOL(EndOfLineSequence.CRLF);
      assert.strictEqual(model.getValue(), "Hello\r\nworld");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), "Hello\nworld");
    });
  });
  test("issue #47733: Undo mangles unicode characters", () => {
    const languageId = "myMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      surroundingPairs: [{ open: "%", close: "%" }]
    }));
    const model = createTextModel2("'\u{1F441}'", languageId);
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelection(new Selection(1, 1, 1, 2));
      viewModel.type("%", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "%'%\u{1F441}'", "assert1");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "'\u{1F441}'", "assert2");
    });
  });
  test("issue #46208: Allow empty selections in the undo/redo stack", () => {
    const model = createTextModel2("");
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.type("Hello", "keyboard");
      viewModel.type(" ", "keyboard");
      viewModel.type("world", "keyboard");
      viewModel.type(" ", "keyboard");
      assert.strictEqual(model.getLineContent(1), "Hello world ");
      assertCursor(viewModel, new Position(1, 13));
      moveLeft(editor, viewModel);
      moveRight(editor, viewModel);
      model.pushEditOperations([], [EditOperation.replaceMove(new Range(1, 12, 1, 13), "")], () => []);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world ");
      assertCursor(viewModel, new Selection(1, 13, 1, 13));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "Hello");
      assertCursor(viewModel, new Position(1, 6));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "");
      assertCursor(viewModel, new Position(1, 1));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello");
      assertCursor(viewModel, new Position(1, 6));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world ");
      assertCursor(viewModel, new Position(1, 13));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
    });
  });
  test("bug #16815:Shift+Tab doesn't go back to tabstop", () => {
    const languageId = setupOnEnterLanguage(IndentAction.IndentOutdent);
    const model = createTextModel2(
      [
        "     function baz() {"
      ].join("\n"),
      languageId
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 6, false);
      assertCursor(viewModel, new Selection(1, 6, 1, 6));
      editor.runCommand(CoreEditingCommands.Outdent, null);
      assert.strictEqual(model.getLineContent(1), "    function baz() {");
      assertCursor(viewModel, new Selection(1, 5, 1, 5));
    });
  });
  test("Bug #18293:[regression][editor] Can't outdent whitespace line", () => {
    const model = createTextModel2(
      [
        "      "
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Selection(1, 7, 1, 7));
      editor.runCommand(CoreEditingCommands.Outdent, null);
      assert.strictEqual(model.getLineContent(1), "    ");
      assertCursor(viewModel, new Selection(1, 5, 1, 5));
    });
  });
  test("issue #95591: Unindenting moves cursor to beginning of line", () => {
    const model = createTextModel2(
      [
        "        "
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 9, false);
      assertCursor(viewModel, new Selection(1, 9, 1, 9));
      editor.runCommand(CoreEditingCommands.Outdent, null);
      assert.strictEqual(model.getLineContent(1), "    ");
      assertCursor(viewModel, new Selection(1, 5, 1, 5));
    });
  });
  test("Bug #16657: [editor] Tab on empty line of zero indentation moves cursor to position (1,1)", () => {
    const model = createTextModel2(
      [
        "function baz() {",
        "	function hello() { // something here",
        "	",
        "",
        "	}",
        "}",
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 7, 1, false);
      assertCursor(viewModel, new Selection(7, 1, 7, 1));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(7), "	");
      assertCursor(viewModel, new Selection(7, 2, 7, 2));
    });
  });
  test("bug #16740: [editor] Cut line doesn't quite cut the last line", () => {
    withTestCodeEditor2([
      "asdasd",
      "qwerty"
    ], {}, (editor, viewModel) => {
      const model = editor.getModel();
      moveTo(editor, viewModel, 2, 1, false);
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      viewModel.cut("keyboard");
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "asdasd");
    });
    withTestCodeEditor2([
      "asdasd",
      ""
    ], {}, (editor, viewModel) => {
      const model = editor.getModel();
      moveTo(editor, viewModel, 2, 1, false);
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      viewModel.cut("keyboard");
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "asdasd");
      viewModel.cut("keyboard");
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "");
    });
  });
  test("issue #128602: When cutting multiple lines (ctrl x), the last line will not be erased", () => {
    withTestCodeEditor2([
      "a1",
      "a2",
      "a3"
    ], {}, (editor, viewModel) => {
      const model = editor.getModel();
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 1),
        new Selection(2, 1, 2, 1),
        new Selection(3, 1, 3, 1)
      ]);
      viewModel.cut("keyboard");
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "");
    });
  });
  test("Bug #11476: Double bracket surrounding + undo is broken", () => {
    usingCursor({
      text: [
        "hello"
      ],
      languageId: surroundingLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 3, false);
      moveTo(editor, viewModel, 1, 5, true);
      assertCursor(viewModel, new Selection(1, 3, 1, 5));
      viewModel.type("(", "keyboard");
      assertCursor(viewModel, new Selection(1, 4, 1, 6));
      viewModel.type("(", "keyboard");
      assertCursor(viewModel, new Selection(1, 5, 1, 7));
    });
  });
  test("issue #206774: SurroundSelectionCommand with empty charAfterSelection should not throw", () => {
    usingCursor({
      text: [
        "hello world"
      ],
      languageId: emptyClosingSurroundLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 1, false);
      moveTo(editor, viewModel, 1, 6, true);
      assertCursor(viewModel, new Selection(1, 1, 1, 6));
      viewModel.type("<", "keyboard");
      assert.strictEqual(model.getValue(), "<hello world");
    });
  });
  test("issue #1140: Backspace stops prematurely", () => {
    const model = createTextModel2(
      [
        "function baz() {",
        "  return 1;",
        "};"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      moveTo(editor, viewModel, 1, 14, true);
      assertCursor(viewModel, new Selection(3, 2, 1, 14));
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assertCursor(viewModel, new Selection(1, 14, 1, 14));
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "function baz(;");
    });
  });
  test("issue #10212: Pasting entire line does not replace selection", () => {
    usingCursor({
      text: [
        "line1",
        "line2"
      ]
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 1, false);
      moveTo(editor, viewModel, 2, 6, true);
      viewModel.paste("line1\n", true);
      assert.strictEqual(model.getLineContent(1), "line1");
      assert.strictEqual(model.getLineContent(2), "line1");
      assert.strictEqual(model.getLineContent(3), "");
    });
  });
  test("issue #74722: Pasting whole line does not replace selection", () => {
    usingCursor({
      text: [
        "line1",
        "line sel 2",
        "line3"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 6, 2, 9)]);
      viewModel.paste("line1\n", true);
      assert.strictEqual(model.getLineContent(1), "line1");
      assert.strictEqual(model.getLineContent(2), "line line1");
      assert.strictEqual(model.getLineContent(3), " 2");
      assert.strictEqual(model.getLineContent(4), "line3");
    });
  });
  test("issue #4996: Multiple cursor paste pastes contents of all cursors", () => {
    usingCursor({
      text: [
        "line1",
        "line2",
        "line3"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
      viewModel.paste(
        "a\nb\nc\nd",
        false,
        [
          "a\nb",
          "c\nd"
        ]
      );
      assert.strictEqual(model.getValue(), [
        "a",
        "bline1",
        "c",
        "dline2",
        "line3"
      ].join("\n"));
    });
  });
  test("issue #16155: Paste into multiple cursors has edge case when number of lines equals number of cursors - 1", () => {
    usingCursor({
      text: [
        "test",
        "test",
        "test",
        "test"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 5),
        new Selection(2, 1, 2, 5),
        new Selection(3, 1, 3, 5),
        new Selection(4, 1, 4, 5)
      ]);
      viewModel.paste(
        "aaa\nbbb\nccc\n",
        false,
        null
      );
      assert.strictEqual(model.getValue(), [
        "aaa",
        "bbb",
        "ccc",
        "",
        "aaa",
        "bbb",
        "ccc",
        "",
        "aaa",
        "bbb",
        "ccc",
        "",
        "aaa",
        "bbb",
        "ccc",
        ""
      ].join("\n"));
    });
  });
  test("issue #43722: Multiline paste doesn't work anymore", () => {
    usingCursor({
      text: [
        "test",
        "test",
        "test",
        "test"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 5),
        new Selection(2, 1, 2, 5),
        new Selection(3, 1, 3, 5),
        new Selection(4, 1, 4, 5)
      ]);
      viewModel.paste(
        "aaa\r\nbbb\r\nccc\r\nddd\r\n",
        false,
        null
      );
      assert.strictEqual(model.getValue(), [
        "aaa",
        "bbb",
        "ccc",
        "ddd"
      ].join("\n"));
    });
  });
  test("issue #46440: (1) Pasting a multi-line selection pastes entire selection into every insertion point", () => {
    usingCursor({
      text: [
        "line1",
        "line2",
        "line3"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1), new Selection(3, 1, 3, 1)]);
      viewModel.paste(
        "a\nb\nc",
        false,
        null
      );
      assert.strictEqual(model.getValue(), [
        "aline1",
        "bline2",
        "cline3"
      ].join("\n"));
    });
  });
  test("issue #46440: (2) Pasting a multi-line selection pastes entire selection into every insertion point", () => {
    usingCursor({
      text: [
        "line1",
        "line2",
        "line3"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1), new Selection(3, 1, 3, 1)]);
      viewModel.paste(
        "a\nb\nc\n",
        false,
        null
      );
      assert.strictEqual(model.getValue(), [
        "aline1",
        "bline2",
        "cline3"
      ].join("\n"));
    });
  });
  test("issue #256039: paste from multiple cursors with empty selections and multiCursorPaste full", () => {
    usingCursor({
      text: [
        "line1",
        "line2",
        "line3"
      ],
      editorOpts: {
        multiCursorPaste: "full"
      }
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
      viewModel.paste(
        "line1\nline2\n",
        true,
        ["line1\n", "line2\n"]
      );
      assert.strictEqual(model.getValue(), [
        "line1",
        "line1",
        "line2",
        "line2",
        "line3"
      ].join("\n"));
    });
  });
  test("issue #3071: Investigate why undo stack gets corrupted", () => {
    const model = createTextModel2(
      [
        "some lines",
        "and more lines",
        "just some text"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 1, false);
      moveTo(editor, viewModel, 3, 4, true);
      let isFirst = true;
      const disposable = model.onDidChangeContent(() => {
        if (isFirst) {
          isFirst = false;
          viewModel.type("	", "keyboard");
        }
      });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getValue(), [
        "	 just some text"
      ].join("\n"), "001");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), [
        "    some lines",
        "    and more lines",
        "    just some text"
      ].join("\n"), "002");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), [
        "some lines",
        "and more lines",
        "just some text"
      ].join("\n"), "003");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), [
        "some lines",
        "and more lines",
        "just some text"
      ].join("\n"), "004");
      disposable.dispose();
    });
  });
  test("issue #12950: Cannot Double Click To Insert Emoji Using OSX Emoji Panel", () => {
    usingCursor({
      text: [
        "some lines",
        "and more lines",
        "just some text"
      ],
      languageId: null
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 1, false);
      viewModel.type("\u{1F60D}", "keyboard");
      assert.strictEqual(model.getValue(), [
        "some lines",
        "and more lines",
        "\u{1F60D}just some text"
      ].join("\n"));
    });
  });
  test("issue #3463: pressing tab adds spaces, but not as many as for a tab", () => {
    const model = createTextModel2(
      [
        "function a() {",
        "	var a = {",
        "		x: 3",
        "	};",
        "}"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(3), "	    	x: 3");
    });
  });
  test("issue #4312: trying to type a tab character over a sequence of spaces results in unexpected behaviour", () => {
    const model = createTextModel2(
      [
        "var foo = 123;       // this is a comment",
        "var bar = 4;       // another comment"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 15, false);
      moveTo(editor, viewModel, 1, 22, true);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "var foo = 123;	// this is a comment");
    });
  });
  test("issue #832: word right", () => {
    usingCursor({
      text: [
        "   /* Just some   more   text a+= 3 +5-3 + 7 */  "
      ]
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 1, false);
      function assertWordRight(col, expectedCol) {
        const args = {
          position: {
            lineNumber: 1,
            column: col
          }
        };
        if (col === 1) {
          CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, args);
        } else {
          CoreNavigationCommands.WordSelectDrag.runCoreEditorCommand(viewModel, args);
        }
        assert.strictEqual(viewModel.getSelection().startColumn, 1, "TEST FOR " + col);
        assert.strictEqual(viewModel.getSelection().endColumn, expectedCol, "TEST FOR " + col);
      }
      assertWordRight(1, "   ".length + 1);
      assertWordRight(2, "   ".length + 1);
      assertWordRight(3, "   ".length + 1);
      assertWordRight(4, "   ".length + 1);
      assertWordRight(5, "   /".length + 1);
      assertWordRight(6, "   /*".length + 1);
      assertWordRight(7, "   /* ".length + 1);
      assertWordRight(8, "   /* Just".length + 1);
      assertWordRight(9, "   /* Just".length + 1);
      assertWordRight(10, "   /* Just".length + 1);
      assertWordRight(11, "   /* Just".length + 1);
      assertWordRight(12, "   /* Just ".length + 1);
      assertWordRight(13, "   /* Just some".length + 1);
      assertWordRight(14, "   /* Just some".length + 1);
      assertWordRight(15, "   /* Just some".length + 1);
      assertWordRight(16, "   /* Just some".length + 1);
      assertWordRight(17, "   /* Just some ".length + 1);
      assertWordRight(18, "   /* Just some  ".length + 1);
      assertWordRight(19, "   /* Just some   ".length + 1);
      assertWordRight(20, "   /* Just some   more".length + 1);
      assertWordRight(21, "   /* Just some   more".length + 1);
      assertWordRight(22, "   /* Just some   more".length + 1);
      assertWordRight(23, "   /* Just some   more".length + 1);
      assertWordRight(24, "   /* Just some   more ".length + 1);
      assertWordRight(25, "   /* Just some   more  ".length + 1);
      assertWordRight(26, "   /* Just some   more   ".length + 1);
      assertWordRight(27, "   /* Just some   more   text".length + 1);
      assertWordRight(28, "   /* Just some   more   text".length + 1);
      assertWordRight(29, "   /* Just some   more   text".length + 1);
      assertWordRight(30, "   /* Just some   more   text".length + 1);
      assertWordRight(31, "   /* Just some   more   text ".length + 1);
      assertWordRight(32, "   /* Just some   more   text a".length + 1);
      assertWordRight(33, "   /* Just some   more   text a+".length + 1);
      assertWordRight(34, "   /* Just some   more   text a+=".length + 1);
      assertWordRight(35, "   /* Just some   more   text a+= ".length + 1);
      assertWordRight(36, "   /* Just some   more   text a+= 3".length + 1);
      assertWordRight(37, "   /* Just some   more   text a+= 3 ".length + 1);
      assertWordRight(38, "   /* Just some   more   text a+= 3 +".length + 1);
      assertWordRight(39, "   /* Just some   more   text a+= 3 +5".length + 1);
      assertWordRight(40, "   /* Just some   more   text a+= 3 +5-".length + 1);
      assertWordRight(41, "   /* Just some   more   text a+= 3 +5-3".length + 1);
      assertWordRight(42, "   /* Just some   more   text a+= 3 +5-3 ".length + 1);
      assertWordRight(43, "   /* Just some   more   text a+= 3 +5-3 +".length + 1);
      assertWordRight(44, "   /* Just some   more   text a+= 3 +5-3 + ".length + 1);
      assertWordRight(45, "   /* Just some   more   text a+= 3 +5-3 + 7".length + 1);
      assertWordRight(46, "   /* Just some   more   text a+= 3 +5-3 + 7 ".length + 1);
      assertWordRight(47, "   /* Just some   more   text a+= 3 +5-3 + 7 *".length + 1);
      assertWordRight(48, "   /* Just some   more   text a+= 3 +5-3 + 7 */".length + 1);
      assertWordRight(49, "   /* Just some   more   text a+= 3 +5-3 + 7 */ ".length + 1);
      assertWordRight(50, "   /* Just some   more   text a+= 3 +5-3 + 7 */  ".length + 1);
    });
  });
  test("issue #33788: Wrong cursor position when double click to select a word", () => {
    const model = createTextModel2(
      [
        "Just some text"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 8) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 6, 1, 10));
      CoreNavigationCommands.WordSelectDrag.runCoreEditorCommand(viewModel, { position: new Position(1, 8) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 6, 1, 10));
    });
  });
  test("issue #12887: Double-click highlighting separating white space", () => {
    const model = createTextModel2(
      [
        "abc def"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 5) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 5, 1, 8));
    });
  });
  test("Double-click on punctuation should select the character, not adjacent space", () => {
    const model = createTextModel2(
      [
        "// a b c 1 2 3 ~ ! @ # $ % ^ & * ( ) _ + \\ /"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 20) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 20, 1, 21), "Should select @ character");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 22) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 22, 1, 23), "Should select # character");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 18) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 18, 1, 19), "Should select ! character");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 1) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 1, 1, 3), "Should select // token");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 2) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 1, 1, 3), "Should select // token");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 42) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 42, 1, 43), "Should select \\ character");
    });
  });
  test("issue #9675: Undo/Redo adds a stop in between CHN Characters", () => {
    withTestCodeEditor2([], {}, (editor, viewModel) => {
      const model = editor.getModel();
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("\uFF53", "keyboard");
      viewModel.compositionType("\u305B", 1, 0, 0);
      viewModel.compositionType("\u305B\uFF4E", 1, 0, 0);
      viewModel.compositionType("\u305B\u3093", 2, 0, 0);
      viewModel.compositionType("\u305B\u3093\uFF53", 2, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B", 3, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B", 3, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B\u3044", 3, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B\u3044", 4, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B\u3044", 4, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B\u3044", 4, 0, 0);
      assert.strictEqual(model.getLineContent(1), "\u305B\u3093\u305B\u3044");
      assertCursor(viewModel, new Position(1, 5));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "");
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("issue #23983: Calling model.setEOL does not reset cursor position", () => {
    usingCursor({
      text: [
        "first line",
        "second line"
      ]
    }, (editor, model, viewModel) => {
      model.setEOL(EndOfLineSequence.CRLF);
      viewModel.setSelections("test", [new Selection(2, 2, 2, 2)]);
      model.setEOL(EndOfLineSequence.LF);
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
    });
  });
  test("issue #23983: Calling model.setValue() resets cursor position", () => {
    usingCursor({
      text: [
        "first line",
        "second line"
      ]
    }, (editor, model, viewModel) => {
      model.setEOL(EndOfLineSequence.CRLF);
      viewModel.setSelections("test", [new Selection(2, 2, 2, 2)]);
      model.setValue([
        "different first line",
        "different second line",
        "new third line"
      ].join("\n"));
      assertCursor(viewModel, new Selection(1, 1, 1, 1));
    });
  });
  test("issue #36740: wordwrap creates an extra step / character at the wrapping point", () => {
    withTestCodeEditor2([
      [
        "Lorem ipsum ",
        "dolor sit amet ",
        "consectetur ",
        "adipiscing elit"
      ].join("")
    ], { wordWrap: "wordWrapColumn", wordWrapColumn: 16 }, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 7, 1, 7)]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 9, 1, 9));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 10, 1, 10));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 11, 1, 11));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 13, 1, 13));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 14, 1, 14));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 13, 1, 13));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
    });
  });
  test("issue #110376: multiple selections with wordwrap behave differently", () => {
    withTestCodeEditor2([
      [
        "just a sentence. just a ",
        "sentence. just a sentence."
      ].join("")
    ], { wordWrap: "wordWrapColumn", wordWrapColumn: 25 }, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 16),
        new Selection(1, 18, 1, 33),
        new Selection(1, 35, 1, 50)
      ]);
      moveLeft(editor, viewModel);
      assertCursor(viewModel, [
        new Selection(1, 1, 1, 1),
        new Selection(1, 18, 1, 18),
        new Selection(1, 35, 1, 35)
      ]);
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 16),
        new Selection(1, 18, 1, 33),
        new Selection(1, 35, 1, 50)
      ]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, [
        new Selection(1, 16, 1, 16),
        new Selection(1, 33, 1, 33),
        new Selection(1, 50, 1, 50)
      ]);
    });
  });
  test("issue #98320: Multi-Cursor, Wrap lines and cursorSelectRight ==> cursors out of sync", () => {
    withTestCodeEditor2([
      [
        "lorem_ipsum-1993x11x13",
        "dolor_sit_amet-1998x04x27",
        "consectetur-2007x10x08",
        "adipiscing-2012x07x27",
        "elit-2015x02x27"
      ].join("\n")
    ], { wordWrap: "wordWrapColumn", wordWrapColumn: 16 }, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 13, 1, 13),
        new Selection(2, 16, 2, 16),
        new Selection(3, 13, 3, 13),
        new Selection(4, 12, 4, 12),
        new Selection(5, 6, 5, 6)
      ]);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 13),
        new Selection(2, 16, 2, 16),
        new Selection(3, 13, 3, 13),
        new Selection(4, 12, 4, 12),
        new Selection(5, 6, 5, 6)
      ]);
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 14),
        new Selection(2, 16, 2, 17),
        new Selection(3, 13, 3, 14),
        new Selection(4, 12, 4, 13),
        new Selection(5, 6, 5, 7)
      ]);
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 15),
        new Selection(2, 16, 2, 18),
        new Selection(3, 13, 3, 15),
        new Selection(4, 12, 4, 14),
        new Selection(5, 6, 5, 8)
      ]);
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 16),
        new Selection(2, 16, 2, 19),
        new Selection(3, 13, 3, 16),
        new Selection(4, 12, 4, 15),
        new Selection(5, 6, 5, 9)
      ]);
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 17),
        new Selection(2, 16, 2, 20),
        new Selection(3, 13, 3, 17),
        new Selection(4, 12, 4, 16),
        new Selection(5, 6, 5, 10)
      ]);
    });
  });
  test("issue #41573 - delete across multiple lines does not shrink the selection when word wraps", () => {
    withTestCodeEditor2([
      "Authorization: 'Bearer pHKRfCTFSnGxs6akKlb9ddIXcca0sIUSZJutPHYqz7vEeHdMTMh0SGN0IGU3a0n59DXjTLRsj5EJ2u33qLNIFi9fk5XF8pK39PndLYUZhPt4QvHGLScgSkK0L4gwzkzMloTQPpKhqiikiIOvyNNSpd2o8j29NnOmdTUOKi9DVt74PD2ohKxyOrWZ6oZprTkb3eKajcpnS0LABKfaw2rmv4',"
    ].join("\n"), { wordWrap: "wordWrapColumn", wordWrapColumn: 100 }, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 43, false);
      moveTo(editor, viewModel, 1, 147, true);
      assertCursor(viewModel, new Selection(1, 43, 1, 147));
      editor.getModel().applyEdits([{
        range: new Range(1, 1, 1, 43),
        text: ""
      }]);
      assertCursor(viewModel, new Selection(1, 1, 1, 105));
    });
  });
  test("issue #22717: Moving text cursor cause an incorrect position in Chinese", () => {
    withTestCodeEditor2([
      [
        "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341",
        "12345678901234567890"
      ].join("\n")
    ], {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(2, 10, 2, 10));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(2, 11, 2, 11));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 6, 1, 6));
    });
  });
  test("issue #112301: new stickyTabStops feature interferes with word wrap", () => {
    withTestCodeEditor2([
      [
        "function hello() {",
        "        console.log(`this is a long console message`)",
        "}"
      ].join("\n")
    ], { wordWrap: "wordWrapColumn", wordWrapColumn: 32, stickyTabStops: true }, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(2, 31, 2, 31)
      ]);
      moveRight(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 32));
      moveRight(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 33));
      moveRight(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 34));
      moveLeft(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 33));
      moveLeft(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 32));
      moveLeft(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 31));
    });
  });
  test("issue #44805: Should not be able to undo in readonly editor", () => {
    const model = createTextModel2(
      [
        ""
      ].join("\n")
    );
    withTestCodeEditor2(model, { readOnly: true }, (editor, viewModel) => {
      model.pushEditOperations([new Selection(1, 1, 1, 1)], [{
        range: new Range(1, 1, 1, 1),
        text: "Hello world!"
      }], () => [new Selection(1, 1, 1, 1)]);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "Hello world!");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "Hello world!");
    });
  });
  test("issue #46314: ViewModel is out of sync with Model!", () => {
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        return new EncodedTokenizationResult(new Uint32Array(0), [], state);
      }
    };
    const LANGUAGE_ID = "modelModeTest1";
    const languageRegistration = TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
    const model = createTextModel2("Just text", LANGUAGE_ID);
    withTestCodeEditor2(model, {}, (editor1, cursor1) => {
      withTestCodeEditor2(model, {}, (editor2, cursor2) => {
        const disposable = editor1.onDidChangeCursorPosition(() => {
          model.tokenization.tokenizeIfCheap(1);
        });
        model.applyEdits([{ range: new Range(1, 1, 1, 1), text: "-" }]);
        disposable.dispose();
      });
    });
    languageRegistration.dispose();
    model.dispose();
  });
  test("issue #37967: problem replacing consecutive characters", () => {
    const model = createTextModel2(
      [
        'const a = "foo";',
        'const b = ""'
      ].join("\n")
    );
    withTestCodeEditor2(model, { multiCursorMergeOverlapping: false }, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 12, 1, 12),
        new Selection(1, 16, 1, 16),
        new Selection(2, 12, 2, 12),
        new Selection(2, 13, 2, 13)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assertCursor(viewModel, [
        new Selection(1, 11, 1, 11),
        new Selection(1, 14, 1, 14),
        new Selection(2, 11, 2, 11),
        new Selection(2, 11, 2, 11)
      ]);
      viewModel.type("'", "keyboard");
      assert.strictEqual(model.getLineContent(1), "const a = 'foo';");
      assert.strictEqual(model.getLineContent(2), "const b = ''");
    });
  });
  test("issue #15761: Cursor doesn't move in a redo operation", () => {
    const model = createTextModel2(
      [
        "hello"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 4, 1, 4)
      ]);
      editor.executeEdits("test", [{
        range: new Range(1, 1, 1, 1),
        text: "*",
        forceMoveMarkers: true
      }]);
      assertCursor(viewModel, [
        new Selection(1, 5, 1, 5)
      ]);
      editor.runCommand(CoreEditingCommands.Undo, null);
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 4)
      ]);
      editor.runCommand(CoreEditingCommands.Redo, null);
      assertCursor(viewModel, [
        new Selection(1, 5, 1, 5)
      ]);
    });
  });
  test("issue #42783: API Calls with Undo Leave Cursor in Wrong Position", () => {
    const model = createTextModel2(
      [
        "ab"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 1, 1, 1)
      ]);
      editor.executeEdits("test", [{
        range: new Range(1, 1, 1, 3),
        text: ""
      }]);
      assertCursor(viewModel, [
        new Selection(1, 1, 1, 1)
      ]);
      editor.runCommand(CoreEditingCommands.Undo, null);
      assertCursor(viewModel, [
        new Selection(1, 1, 1, 1)
      ]);
      editor.executeEdits("test", [{
        range: new Range(1, 1, 1, 2),
        text: ""
      }]);
      assertCursor(viewModel, [
        new Selection(1, 1, 1, 1)
      ]);
    });
  });
  test("issue #85712: Paste line moves cursor to start of current line rather than start of next line", () => {
    const model = createTextModel2(
      [
        "abc123",
        ""
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(2, 1, 2, 1)
      ]);
      viewModel.paste("something\n", true);
      assert.strictEqual(model.getValue(), [
        "abc123",
        "something",
        ""
      ].join("\n"));
      assertCursor(viewModel, new Position(3, 1));
    });
  });
  test("issue #84897: Left delete behavior in some languages is changed", () => {
    const model = createTextModel2(
      [
        "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 7, 1, 7)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31\u0E2A\u0E14");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31\u0E2A");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "");
    });
  });
  test("issue #122914: Left delete behavior in some languages is changed (useTabStops: false)", () => {
    const model = createTextModel2(
      [
        "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35"
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 7, 1, 7)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31\u0E2A\u0E14");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31\u0E2A");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "");
    });
  });
  test("issue #99629: Emoji modifiers in text treated separately when using backspace", () => {
    const model = createTextModel2(
      [
        "\u{1F476}\u{1F3FE}"
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      const len = model.getValueLength();
      editor.setSelections([
        new Selection(1, 1 + len, 1, 1 + len)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "");
    });
  });
  test("issue #99629: Emoji modifiers in text treated separately when using backspace (ZWJ sequence)", () => {
    const model = createTextModel2(
      [
        "\u{1F468}\u200D\u{1F469}\u{1F3FD}\u200D\u{1F467}\u200D\u{1F466}"
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      const len = model.getValueLength();
      editor.setSelections([
        new Selection(1, 1 + len, 1, 1 + len)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u{1F468}\u200D\u{1F469}\u{1F3FD}\u200D\u{1F467}");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u{1F468}\u200D\u{1F469}\u{1F3FD}");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u{1F468}");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "");
    });
  });
  test("issue #105730: move left behaves differently for multiple cursors", () => {
    const model = createTextModel2("asdfghjkl, asdfghjkl, asdfghjkl, ");
    withTestCodeEditor2(
      model,
      {
        wordWrap: "wordWrapColumn",
        wordWrapColumn: 24
      },
      (editor, viewModel) => {
        viewModel.setSelections("test", [
          new Selection(1, 10, 1, 12),
          new Selection(1, 21, 1, 23),
          new Selection(1, 32, 1, 34)
        ]);
        moveLeft(editor, viewModel, false);
        assertCursor(viewModel, [
          new Selection(1, 10, 1, 10),
          new Selection(1, 21, 1, 21),
          new Selection(1, 32, 1, 32)
        ]);
        viewModel.setSelections("test", [
          new Selection(1, 10, 1, 12),
          new Selection(1, 21, 1, 23),
          new Selection(1, 32, 1, 34)
        ]);
        moveLeft(editor, viewModel, true);
        assertCursor(viewModel, [
          new Selection(1, 10, 1, 11),
          new Selection(1, 21, 1, 22),
          new Selection(1, 32, 1, 33)
        ]);
      }
    );
  });
  test("issue #105730: move right should always skip wrap point", () => {
    const model = createTextModel2("asdfghjkl, asdfghjkl, asdfghjkl, \nasdfghjkl,");
    withTestCodeEditor2(
      model,
      {
        wordWrap: "wordWrapColumn",
        wordWrapColumn: 24
      },
      (editor, viewModel) => {
        viewModel.setSelections("test", [
          new Selection(1, 22, 1, 22)
        ]);
        moveRight(editor, viewModel, false);
        moveRight(editor, viewModel, false);
        assertCursor(viewModel, [
          new Selection(1, 24, 1, 24)
        ]);
        viewModel.setSelections("test", [
          new Selection(1, 22, 1, 22)
        ]);
        moveRight(editor, viewModel, true);
        moveRight(editor, viewModel, true);
        assertCursor(viewModel, [
          new Selection(1, 22, 1, 24)
        ]);
      }
    );
  });
  test("issue #123178: sticky tab in consecutive wrapped lines", () => {
    const model = createTextModel2("    aaaa        aaaa", void 0, { tabSize: 4 });
    withTestCodeEditor2(
      model,
      {
        wordWrap: "wordWrapColumn",
        wordWrapColumn: 8,
        stickyTabStops: true
      },
      (editor, viewModel) => {
        viewModel.setSelections("test", [
          new Selection(1, 9, 1, 9)
        ]);
        moveRight(editor, viewModel, false);
        assertCursor(viewModel, [
          new Selection(1, 10, 1, 10)
        ]);
        moveLeft(editor, viewModel, false);
        assertCursor(viewModel, [
          new Selection(1, 9, 1, 9)
        ]);
      }
    );
  });
  test("Cursor honors insertSpaces configuration on new line", () => {
    usingCursor({
      text: [
        "    	My First Line	 ",
        "	My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    }, (editor, model, viewModel) => {
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(1, 21), source: "keyboard" });
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    	My First Line	 ");
      assert.strictEqual(model.getLineContent(2), "        ");
    });
  });
  test("Cursor honors insertSpaces configuration on tab", () => {
    const model = createTextModel2(
      [
        "    	My First Line	 ",
        "My Second Line123",
        "    Third Line",
        "",
        "1"
      ].join("\n"),
      void 0,
      {
        tabSize: 13,
        indentSize: 13
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 1) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "             My Second Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 2) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "M            y Second Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 3) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My            Second Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 4) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My           Second Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 5) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My S         econd Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 5) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My S         econd Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 13) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My Second Li ne123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 14) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My Second Lin             e123");
    });
  });
  test("Enter auto-indents with insertSpaces setting 1", () => {
    const languageId = setupOnEnterLanguage(IndentAction.Indent);
    usingCursor({
      text: [
        "	hello"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Selection(1, 7, 1, 7));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.CRLF), "	hello\r\n        ");
    });
  });
  test("Enter auto-indents with insertSpaces setting 2", () => {
    const languageId = setupOnEnterLanguage(IndentAction.None);
    usingCursor({
      text: [
        "	hello"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Selection(1, 7, 1, 7));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.CRLF), "	hello\r\n    ");
    });
  });
  test("Enter auto-indents with insertSpaces setting 3", () => {
    const languageId = setupOnEnterLanguage(IndentAction.IndentOutdent);
    usingCursor({
      text: [
        "	hell()"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Selection(1, 7, 1, 7));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.CRLF), "	hell(\r\n        \r\n    )");
    });
  });
  test("issue #148256: Pressing Enter creates line with bad indent with insertSpaces: true", () => {
    usingCursor({
      text: [
        "  	"
      ]
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 4, false);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), "  	\n    ");
    });
  });
  test("issue #148256: Pressing Enter creates line with bad indent with insertSpaces: false", () => {
    usingCursor({
      text: [
        "  	"
      ]
    }, (editor, model, viewModel) => {
      model.updateOptions({
        insertSpaces: false
      });
      moveTo(editor, viewModel, 1, 4, false);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), "  	\n	");
    });
  });
  test("removeAutoWhitespace off", () => {
    usingCursor({
      text: [
        "    some  line abc  "
      ],
      modelOpts: {
        trimAutoWhitespace: false
      }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, model.getLineContent(1).length + 1);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "    ");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "    ");
      assert.strictEqual(model.getLineContent(3), "    ");
    });
  });
  test("removeAutoWhitespace on: removes only whitespace the cursor added 1", () => {
    usingCursor({
      text: [
        "    "
      ]
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, model.getLineContent(1).length + 1);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    ");
      assert.strictEqual(model.getLineContent(2), "    ");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    ");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "    ");
    });
  });
  test("issue #115033: indent and appendText", () => {
    const languageId = "onEnterMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      onEnterRules: [{
        beforeText: /.*/,
        action: {
          indentAction: IndentAction.Indent,
          appendText: "x"
        }
      }]
    }));
    usingCursor({
      text: [
        "text"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 5);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "text");
      assert.strictEqual(model.getLineContent(2), "    x");
      assertCursor(viewModel, new Position(2, 6));
    });
  });
  test("issue #6862: Editor removes auto inserted indentation when formatting on type", () => {
    const languageId = setupOnEnterLanguage(IndentAction.IndentOutdent);
    usingCursor({
      text: [
        "function foo (params: string) {}"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 32);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "function foo (params: string) {");
      assert.strictEqual(model.getLineContent(2), "    ");
      assert.strictEqual(model.getLineContent(3), "}");
      class TestCommand {
        constructor() {
          this._selectionId = null;
        }
        getEditOperations(model2, builder) {
          builder.addEditOperation(new Range(1, 13, 1, 14), "");
          this._selectionId = builder.trackSelection(viewModel.getSelection());
        }
        computeCursorState(model2, helper) {
          return helper.getTrackedSelection(this._selectionId);
        }
      }
      viewModel.executeCommand(new TestCommand(), "autoFormat");
      assert.strictEqual(model.getLineContent(1), "function foo(params: string) {");
      assert.strictEqual(model.getLineContent(2), "    ");
      assert.strictEqual(model.getLineContent(3), "}");
    });
  });
  test("removeAutoWhitespace on: removes only whitespace the cursor added 2", () => {
    const languageId = "testLang";
    const registration = languageService.registerLanguage({ id: languageId });
    const model = createTextModel2(
      [
        "    if (a) {",
        "        ",
        "",
        "",
        "    }"
      ].join("\n"),
      languageId
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 1);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "    if (a) {");
      assert.strictEqual(model.getLineContent(2), "        ");
      assert.strictEqual(model.getLineContent(3), "    ");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "    }");
      moveTo(editor, viewModel, 4, 1);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "    if (a) {");
      assert.strictEqual(model.getLineContent(2), "        ");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "    ");
      assert.strictEqual(model.getLineContent(5), "    }");
      moveTo(editor, viewModel, 5, model.getLineMaxColumn(5));
      viewModel.type("something", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    if (a) {");
      assert.strictEqual(model.getLineContent(2), "        ");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "    }something");
    });
    registration.dispose();
  });
  test("removeAutoWhitespace on: test 1", () => {
    const model = createTextModel2(
      [
        "    some  line abc  "
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, model.getLineContent(1).length + 1);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "    ");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "    ");
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "        ");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "        ");
      moveTo(editor, viewModel, 1, 5);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    ");
      assert.strictEqual(model.getLineContent(2), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "");
      moveTo(editor, viewModel, 2, 5);
      moveTo(editor, viewModel, 3, 1, true);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    ");
      assert.strictEqual(model.getLineContent(2), "    ");
      assert.strictEqual(model.getLineContent(3), "    ");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "");
    });
  });
  test("issue #15118: remove auto whitespace when pasting entire line", () => {
    const model = createTextModel2(
      [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        return 3;",
        "    }"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, model.getLineMaxColumn(3));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        return 3;",
        "        ",
        "    }"
      ].join("\n"));
      assertCursor(viewModel, new Position(4, model.getLineMaxColumn(4)));
      viewModel.paste("        // I'm gonna copy this line\n", true);
      assert.strictEqual(model.getValue(), [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        return 3;",
        "        // I'm gonna copy this line",
        "",
        "    }"
      ].join("\n"));
      assertCursor(viewModel, new Position(5, 1));
    });
  });
  test("issue #40695: maintain cursor position when copying lines using ctrl+c, ctrl+v", () => {
    const model = createTextModel2(
      [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        // Another line",
        "        return 3;",
        "    }"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([new Selection(4, 10, 4, 10)]);
      viewModel.paste("        // I'm gonna copy this line\n", true);
      assert.strictEqual(model.getValue(), [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        // Another line",
        "        // I'm gonna copy this line",
        "        return 3;",
        "    }"
      ].join("\n"));
      assertCursor(viewModel, new Position(5, 10));
    });
  });
  test("UseTabStops is off", () => {
    const model = createTextModel2(
      [
        "    x",
        "        a    ",
        "    "
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      moveTo(editor, viewModel, 2, 9);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "       a    ");
    });
  });
  test("Backspace removes whitespaces with tab size", () => {
    const model = createTextModel2(
      [
        " 	 	     x",
        "        a    ",
        "    "
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: true }, (editor, viewModel) => {
      moveTo(editor, viewModel, 2, model.getLineContent(2).length + 1);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "        a   ");
      moveTo(editor, viewModel, 2, 9);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "    a   ");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "a   ");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "        a   ");
      moveTo(editor, viewModel, 1, 1);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), " 	 	     x");
      moveTo(editor, viewModel, 1, 10);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), " 	 	    x");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), " 	 	x");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), " 	x");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), "x");
      moveTo(editor, viewModel, 3, model.getLineContent(3).length + 1);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(3), "");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x\n        a   ");
      moveTo(editor, viewModel, 2, 3);
      moveTo(editor, viewModel, 2, 4, true);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "       a   ");
    });
  });
  test("PR #5423: Auto indent + undo + redo is funky", () => {
    const model = createTextModel2(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n", "assert1");
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	", "assert2");
      viewModel.type("y", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y", "assert2");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\n	", "assert3");
      viewModel.type("x");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\n	x", "assert4");
      CoreNavigationCommands.CursorLeft.runCoreEditorCommand(viewModel, {});
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\n	x", "assert5");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\nx", "assert6");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	yx", "assert7");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	x", "assert8");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert9");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x", "assert10");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert11");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\nx", "assert12");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\n	x", "assert13");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\nx", "assert14");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert15");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x", "assert16");
    });
  });
  test("issue #90973: Undo brings back model alternative version", () => {
    const model = createTextModel2(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      const beforeVersion = model.getVersionId();
      const beforeAltVersion = model.getAlternativeVersionId();
      viewModel.type("Hello", "keyboard");
      editor.runCommand(CoreEditingCommands.Undo, null);
      const afterVersion = model.getVersionId();
      const afterAltVersion = model.getAlternativeVersionId();
      assert.notStrictEqual(beforeVersion, afterVersion);
      assert.strictEqual(beforeAltVersion, afterAltVersion);
    });
  });
  test("Enter honors increaseIndentPattern", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 12, false);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      moveTo(editor, viewModel, 3, 13, false);
      assertCursor(viewModel, new Selection(3, 13, 3, 13));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
    });
  });
  test("Type honors decreaseIndentPattern", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	"
      ],
      languageId: indentRulesLanguageId,
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 2, false);
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      viewModel.type("}", "keyboard");
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      assert.strictEqual(model.getLineContent(2), "}", "001");
    });
  });
  test("Enter honors unIndentedLinePattern", () => {
    usingCursor({
      text: [
        "if (true) {",
        "			return true"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 15, false);
      assertCursor(viewModel, new Selection(2, 15, 2, 15));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
    });
  });
  test("Enter honors indentNextLinePattern", () => {
    usingCursor({
      text: [
        "if (true)",
        "	return true;",
        "if (true)",
        "				return true"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 14, false);
      assertCursor(viewModel, new Selection(2, 14, 2, 14));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(3, 1, 3, 1));
      moveTo(editor, viewModel, 5, 16, false);
      assertCursor(viewModel, new Selection(5, 16, 5, 16));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(6, 2, 6, 2));
    });
  });
  test("Enter honors indentNextLinePattern 2", () => {
    const model = createTextModel2(
      [
        "if (true)",
        "	if (true)"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, { autoIndent: "full" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 2, 11, false);
      assertCursor(viewModel, new Selection(2, 11, 2, 11));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("console.log();", "keyboard");
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
    });
  });
  test("Enter honors intential indent", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "return true;",
        "}}"
      ],
      languageId: indentRulesLanguageId,
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 13, false);
      assertCursor(viewModel, new Selection(3, 13, 3, 13));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      assert.strictEqual(model.getLineContent(3), "return true;", "001");
    });
  });
  test("Enter supports selection 1", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "		return true;",
        "	}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 4, 3, false);
      moveTo(editor, viewModel, 4, 4, true);
      assertCursor(viewModel, new Selection(4, 3, 4, 4));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(5, 1, 5, 1));
      assert.strictEqual(model.getLineContent(4), "	}", "001");
    });
  });
  test("Enter supports selection 2", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 12, false);
      moveTo(editor, viewModel, 2, 13, true);
      assertCursor(viewModel, new Selection(2, 12, 2, 13));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
    });
  });
  test("Enter honors tabSize and insertSpaces 1", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 12, false);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(2, 5, 2, 5));
      model.tokenization.forceTokenization(model.getLineCount());
      moveTo(editor, viewModel, 3, 13, false);
      assertCursor(viewModel, new Selection(3, 13, 3, 13));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 9, 4, 9));
    });
  });
  test("Enter honors tabSize and insertSpaces 2", () => {
    usingCursor({
      text: [
        "if (true) {",
        "    if (true) {"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 12, false);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 5, 2, 5));
      moveTo(editor, viewModel, 3, 16, false);
      assertCursor(viewModel, new Selection(3, 16, 3, 16));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(3), "    if (true) {");
      assertCursor(viewModel, new Selection(4, 9, 4, 9));
    });
  });
  test("Enter honors tabSize and insertSpaces 3", () => {
    usingCursor({
      text: [
        "if (true) {",
        "    if (true) {"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 12, false);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      moveTo(editor, viewModel, 3, 16, false);
      assertCursor(viewModel, new Selection(3, 16, 3, 16));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(3), "    if (true) {");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
    });
  });
  test("Enter supports intentional indentation", () => {
    usingCursor({
      text: [
        "	if (true) {",
        "		switch(true) {",
        "			case true:",
        "				break;",
        "		}",
        "	}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 5, 4, false);
      assertCursor(viewModel, new Selection(5, 4, 5, 4));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(5), "		}");
      assertCursor(viewModel, new Selection(6, 3, 6, 3));
    });
  });
  test("Enter should not adjust cursor position when press enter in the middle of a line 1", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "		return true;",
        "	}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 9, false);
      assertCursor(viewModel, new Selection(3, 9, 3, 9));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      assert.strictEqual(model.getLineContent(4), "		 true;", "001");
    });
  });
  test("Enter should not adjust cursor position when press enter in the middle of a line 2", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "		return true;",
        "	}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 3, false);
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      assert.strictEqual(model.getLineContent(4), "		return true;", "001");
    });
  });
  test("Enter should not adjust cursor position when press enter in the middle of a line 3", () => {
    usingCursor({
      text: [
        "if (true) {",
        "  if (true) {",
        "    return true;",
        "  }a}"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 11, false);
      assertCursor(viewModel, new Selection(3, 11, 3, 11));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 5, 4, 5));
      assert.strictEqual(model.getLineContent(4), "     true;", "001");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 1", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "		return true;",
        "	}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 2, 4, 2));
      assert.strictEqual(model.getLineContent(4), "		return true;", "001");
      moveTo(editor, viewModel, 4, 1, false);
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(5, 1, 5, 1));
      assert.strictEqual(model.getLineContent(5), "		return true;", "002");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 2", () => {
    usingCursor({
      text: [
        "	if (true) {",
        "		if (true) {",
        "	    	return true;",
        "		}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 4, false);
      assertCursor(viewModel, new Selection(3, 4, 3, 4));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      assert.strictEqual(model.getLineContent(4), "			return true;", "001");
      moveTo(editor, viewModel, 4, 1, false);
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(5, 1, 5, 1));
      assert.strictEqual(model.getLineContent(5), "			return true;", "002");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 3", () => {
    usingCursor({
      text: [
        "if (true) {",
        "  if (true) {",
        "    return true;",
        "}a}"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 2, 4, 2));
      assert.strictEqual(model.getLineContent(4), "    return true;", "001");
      moveTo(editor, viewModel, 4, 3, false);
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(5, 3, 5, 3));
      assert.strictEqual(model.getLineContent(5), "    return true;", "002");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 4", () => {
    usingCursor({
      text: [
        "if (true) {",
        "  if (true) {",
        "	  return true;",
        "}a}",
        "",
        "if (true) {",
        "  if (true) {",
        "	  return true;",
        "}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: {
        tabSize: 2,
        indentSize: 2
      }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 3, false);
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 4, 4, 4));
      assert.strictEqual(model.getLineContent(4), "    return true;", "001");
      moveTo(editor, viewModel, 9, 4, false);
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(10, 5, 10, 5));
      assert.strictEqual(model.getLineContent(10), "    return true;", "001");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 5", () => {
    usingCursor({
      text: [
        "if (true) {",
        "  if (true) {",
        "    return true;",
        "    return true;",
        ""
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { tabSize: 2 }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 5, false);
      moveTo(editor, viewModel, 4, 3, true);
      assertCursor(viewModel, new Selection(3, 5, 4, 3));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      assert.strictEqual(model.getLineContent(4), "    return true;", "001");
    });
  });
  test("issue microsoft/monaco-editor#108 part 1/2: Auto indentation on Enter with selection is half broken", () => {
    usingCursor({
      text: [
        "function baz() {",
        "	var x = 1;",
        "							return x;",
        "}"
      ],
      modelOpts: {
        insertSpaces: false
      },
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 8, false);
      moveTo(editor, viewModel, 2, 12, true);
      assertCursor(viewModel, new Selection(3, 8, 2, 12));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(3), "	return x;");
      assertCursor(viewModel, new Position(3, 2));
    });
  });
  test("issue microsoft/monaco-editor#108 part 2/2: Auto indentation on Enter with selection is half broken", () => {
    usingCursor({
      text: [
        "function baz() {",
        "	var x = 1;",
        "							return x;",
        "}"
      ],
      modelOpts: {
        insertSpaces: false
      },
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 12, false);
      moveTo(editor, viewModel, 3, 8, true);
      assertCursor(viewModel, new Selection(2, 12, 3, 8));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(3), "	return x;");
      assertCursor(viewModel, new Position(3, 2));
    });
  });
  test("onEnter works if there are no indentation rules", () => {
    usingCursor({
      text: [
        "<?",
        "	if (true) {",
        "		echo $hi;",
        "		echo $bye;",
        "	}",
        "?>"
      ],
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 5, 3, false);
      assertCursor(viewModel, new Selection(5, 3, 5, 3));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(6), "	");
      assertCursor(viewModel, new Selection(6, 2, 6, 2));
      assert.strictEqual(model.getLineContent(5), "	}");
    });
  });
  test("onEnter works if there are no indentation rules 2", () => {
    usingCursor({
      text: [
        "	if (5)",
        "		return 5;",
        "	"
      ],
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 2, 4, 2));
      assert.strictEqual(model.getLineContent(4), "	");
    });
  });
  test("bug #16543: Tab should indent to correct indentation spot immediately", () => {
    const model = createTextModel2(
      [
        "function baz() {",
        "	function hello() { // something here",
        "	",
        "",
        "	}",
        "}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 1, false);
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "		");
    });
  });
  test("bug #2938 (1): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)", () => {
    const model = createTextModel2(
      [
        "	function baz() {",
        "		function hello() { // something here",
        "		",
        "	",
        "		}",
        "	}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 2, false);
      assertCursor(viewModel, new Selection(4, 2, 4, 2));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "			");
    });
  });
  test("bug #2938 (2): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)", () => {
    const model = createTextModel2(
      [
        "	function baz() {",
        "		function hello() { // something here",
        "		",
        "    ",
        "		}",
        "	}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 1, false);
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "			");
    });
  });
  test("bug #2938 (3): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)", () => {
    const model = createTextModel2(
      [
        "	function baz() {",
        "		function hello() { // something here",
        "		",
        "			",
        "		}",
        "	}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 3, false);
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "				");
    });
  });
  test("bug #2938 (4): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)", () => {
    const model = createTextModel2(
      [
        "	function baz() {",
        "		function hello() { // something here",
        "		",
        "				",
        "		}",
        "	}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 4, false);
      assertCursor(viewModel, new Selection(4, 4, 4, 4));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "					");
    });
  });
  test("bug #31015: When pressing Tab on lines and Enter rules are avail, indent straight to the right spotTab", () => {
    const onEnterLanguageId = setupOnEnterLanguage(IndentAction.Indent);
    const model = createTextModel2(
      [
        "    if (a) {",
        "        ",
        "",
        "",
        "    }"
      ].join("\n"),
      onEnterLanguageId
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 1);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "    if (a) {");
      assert.strictEqual(model.getLineContent(2), "        ");
      assert.strictEqual(model.getLineContent(3), "        ");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "    }");
    });
  });
  test("type honors indentation rules: ruby keywords", () => {
    const rubyLanguageId = setupIndentRulesLanguage("ruby", {
      increaseIndentPattern: /^\s*((begin|class|def|else|elsif|ensure|for|if|module|rescue|unless|until|when|while)|(.*\sdo\b))\b[^\{;]*$/,
      decreaseIndentPattern: /^\s*([}\]]([,)]?\s*(#|$)|\.[a-zA-Z_]\w*\b)|(end|rescue|ensure|else|elsif|when)\b)/
    });
    const model = createTextModel2(
      [
        "class Greeter",
        "  def initialize(name)",
        "    @name = name",
        "    en"
      ].join("\n"),
      rubyLanguageId
    );
    withTestCodeEditor2(model, { autoIndent: "full" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 7, false);
      assertCursor(viewModel, new Selection(4, 7, 4, 7));
      viewModel.type("d", "keyboard");
      assert.strictEqual(model.getLineContent(4), "  end");
    });
  });
  test("Auto indent on type: increaseIndentPattern has higher priority than decreaseIndent when inheriting", () => {
    usingCursor({
      text: [
        "	if (true) {",
        "		console.log();",
        "	} else if {",
        "		console.log()",
        "	}"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 5, 3, false);
      assertCursor(viewModel, new Selection(5, 3, 5, 3));
      viewModel.type("e", "keyboard");
      assertCursor(viewModel, new Selection(5, 4, 5, 4));
      assert.strictEqual(model.getLineContent(5), "	}e", "This line should not decrease indent");
    });
  });
  test("type honors users indentation adjustment", () => {
    usingCursor({
      text: [
        "	if (true ||",
        "	 ) {",
        "	}",
        "if (true ||",
        ") {",
        "}"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 3, false);
      assertCursor(viewModel, new Selection(2, 3, 2, 3));
      viewModel.type(" ", "keyboard");
      assertCursor(viewModel, new Selection(2, 4, 2, 4));
      assert.strictEqual(model.getLineContent(2), "	  ) {", "This line should not decrease indent");
    });
  });
  test("bug 29972: if a line is line comment, open bracket should not indent next line", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	// {",
        "		"
      ],
      languageId: indentRulesLanguageId,
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 3, false);
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("}", "keyboard");
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
      assert.strictEqual(model.getLineContent(3), "}");
    });
  });
  test("issue #38261: TAB key results in bizarre indentation in C++ mode ", () => {
    const languageId = "indentRulesMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ],
      indentationRules: {
        increaseIndentPattern: new RegExp("(^.*\\{[^}]*$)"),
        decreaseIndentPattern: new RegExp("^\\s*\\}")
      }
    }));
    const model = createTextModel2(
      [
        "int main() {",
        "  return 0;",
        "}",
        "",
        "bool Foo::bar(const string &a,",
        "              const string &b) {",
        "  foo();",
        "",
        ")"
      ].join("\n"),
      languageId,
      {
        tabSize: 2,
        indentSize: 2
      }
    );
    withTestCodeEditor2(model, { autoIndent: "advanced" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 8, 1, false);
      assertCursor(viewModel, new Selection(8, 1, 8, 1));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(
        model.getValue(),
        [
          "int main() {",
          "  return 0;",
          "}",
          "",
          "bool Foo::bar(const string &a,",
          "              const string &b) {",
          "  foo();",
          "  ",
          ")"
        ].join("\n")
      );
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(8, 3, 8, 3));
    });
  });
  test("issue #57197: indent rules regex should be stateless", () => {
    const languageId = setupIndentRulesLanguage("lang", {
      decreaseIndentPattern: /^\s*}$/gm,
      increaseIndentPattern: /^(?![^\S\n]*(?!--|––|——)(?:[-❍❑■⬜□☐▪▫–—≡→›✘xX✔✓☑+]|\[[ xX+-]?\])\s[^\n]*)[^\S\n]*(.+:)[^\S\n]*(?:(?=@[^\s*~(]+(?::\/\/[^\s*~(:]+)?(?:\([^)]*\))?)|$)/gm
    });
    usingCursor({
      text: [
        "Project:"
      ],
      languageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 9, false);
      assertCursor(viewModel, new Selection(1, 9, 1, 9));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      moveTo(editor, viewModel, 1, 9, false);
      assertCursor(viewModel, new Selection(1, 9, 1, 9));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
    });
  });
  test("typing in json", () => {
    const languageId = "indentRulesMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ],
      indentationRules: {
        increaseIndentPattern: new RegExp('({+(?=([^"]*"[^"]*")*[^"}]*$))|(\\[+(?=([^"]*"[^"]*")*[^"\\]]*$))'),
        decreaseIndentPattern: new RegExp("^\\s*[}\\]],?\\s*$")
      }
    }));
    const model = createTextModel2(
      [
        "{",
        '  "scripts: {"',
        '    "watch": "a {"',
        '    "build{": "b"',
        '    "tasks": []',
        '    "tasks": ["a"]',
        '  "}"',
        '"}"'
      ].join("\n"),
      languageId,
      {
        tabSize: 2,
        indentSize: 2
      }
    );
    withTestCodeEditor2(model, { autoIndent: "full" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 19, false);
      assertCursor(viewModel, new Selection(3, 19, 3, 19));
      viewModel.type("\n", "keyboard");
      assert.deepStrictEqual(model.getLineContent(4), "    ");
      moveTo(editor, viewModel, 5, 18, false);
      assertCursor(viewModel, new Selection(5, 18, 5, 18));
      viewModel.type("\n", "keyboard");
      assert.deepStrictEqual(model.getLineContent(6), "    ");
      moveTo(editor, viewModel, 7, 15, false);
      assertCursor(viewModel, new Selection(7, 15, 7, 15));
      viewModel.type("\n", "keyboard");
      assert.deepStrictEqual(model.getLineContent(8), "      ");
      assert.deepStrictEqual(model.getLineContent(9), "    ]");
      moveTo(editor, viewModel, 10, 18, false);
      assertCursor(viewModel, new Selection(10, 18, 10, 18));
      viewModel.type("\n", "keyboard");
      assert.deepStrictEqual(model.getLineContent(11), "    ]");
    });
  });
  test("issue #111128: Multicursor `Enter` issue with indentation", () => {
    const model = createTextModel2("    let a, b, c;", indentRulesLanguageId, { detectIndentation: false, insertSpaces: false, tabSize: 4 });
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 11, 1, 11),
        new Selection(1, 14, 1, 14)
      ]);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), "    let a,\n	 b,\n	 c;");
    });
  });
  test("issue #122714: tabSize=1 prevent typing a string matching decreaseIndentPattern in an empty file", () => {
    const latextLanguageId = setupIndentRulesLanguage("latex", {
      increaseIndentPattern: new RegExp("\\\\begin{(?!document)([^}]*)}(?!.*\\\\end{\\1})"),
      decreaseIndentPattern: new RegExp("^\\s*\\\\end{(?!document)")
    });
    const model = createTextModel2(
      "\\end",
      latextLanguageId,
      { tabSize: 1 }
    );
    withTestCodeEditor2(model, { autoIndent: "full" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 5, false);
      assertCursor(viewModel, new Selection(1, 5, 1, 5));
      viewModel.type("{", "keyboard");
      assert.strictEqual(model.getLineContent(1), "\\end{}");
    });
  });
  test("ElectricCharacter - does nothing if no electric char", () => {
    usingCursor({
      text: [
        "  if (a) {",
        ""
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      viewModel.type("*", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "*");
    });
  });
  test("ElectricCharacter - indents in order to match bracket", () => {
    usingCursor({
      text: [
        "  if (a) {",
        ""
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  }");
    });
  });
  test("ElectricCharacter - unindents in order to match bracket", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "    "
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 5);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  }");
    });
  });
  test("ElectricCharacter - matches with correct bracket", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "    if (b) {",
        "    }",
        "    "
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 4, 1);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(4), "  }    ");
    });
  });
  test("ElectricCharacter - does nothing if bracket does not match", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "    if (b) {",
        "    }",
        "  }  "
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 4, 6);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(4), "  }  }");
    });
  });
  test("ElectricCharacter - matches bracket even in line with content", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "// hello"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  }// hello");
    });
  });
  test("ElectricCharacter - is no-op if bracket is lined up", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "  "
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 3);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  }");
    });
  });
  test("ElectricCharacter - is no-op if there is non-whitespace text before", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "a"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 2);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "a}");
    });
  });
  test("ElectricCharacter - is no-op if pairs are all matched before", () => {
    usingCursor({
      text: [
        "foo(() => {",
        "  ( 1 + 2 ) ",
        "})"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 13);
      viewModel.type("*", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  ( 1 + 2 ) *");
    });
  });
  test("ElectricCharacter - is no-op if matching bracket is on the same line", () => {
    usingCursor({
      text: [
        "(div"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 5);
      let changeText = null;
      const disposable = model.onDidChangeContent((e) => {
        changeText = e.changes[0].text;
      });
      viewModel.type(")", "keyboard");
      assert.deepStrictEqual(model.getLineContent(1), "(div)");
      assert.deepStrictEqual(changeText, ")");
      disposable.dispose();
    });
  });
  test("ElectricCharacter - is no-op if the line has other content", () => {
    usingCursor({
      text: [
        "Math.max(",
        "	2",
        "	3"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      viewModel.type(")", "keyboard");
      assert.deepStrictEqual(model.getLineContent(3), "	3)");
    });
  });
  test("ElectricCharacter - appends text", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "/*"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 3);
      viewModel.type("*", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "/** */");
    });
  });
  test("ElectricCharacter - appends text 2", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "  /*"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 5);
      viewModel.type("*", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  /** */");
    });
  });
  test("ElectricCharacter - issue #23711: Replacing selected text with )]} fails to delete old text with backwards-dragged selection", () => {
    usingCursor({
      text: [
        "{",
        "word"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 5);
      moveTo(editor, viewModel, 2, 1, true);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "}");
    });
  });
  test("issue #61070: backtick (`) should auto-close after a word character", () => {
    usingCursor({
      text: ["const markup = highlight"],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      model.tokenization.forceTokenization(1);
      assertType(editor, model, viewModel, 1, 25, "`", "``", `auto closes \` @ (1, 25)`);
    });
  });
  test("issue #132912: quotes should not auto-close if they are closing a string", () => {
    setupAutoClosingLanguageTokenization();
    const model = createTextModel2("const t2 = `something ${t1}", autoClosingLanguageId);
    withTestCodeEditor2(
      model,
      {},
      (editor, viewModel) => {
        const model2 = viewModel.model;
        model2.tokenization.forceTokenization(1);
        assertType(editor, model2, viewModel, 1, 28, "`", "`", `does not auto close \` @ (1, 28)`);
      }
    );
  });
  test("autoClosingPairs - open parens: default", () => {
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var| a| |=| [|]|;|",
        "var| b| |=| |`asd|`|;|",
        "var| c| |=| |'asd|'|;|",
        'var| d| |=| |"asd|"|;|',
        "var| e| |=| /*3*/|	3|;|",
        "var| f| |=| /**| 3| */3|;|",
        "var| g| |=| (3+5|)|;|",
        "var| h| |=| {| a|:| |'value|'| |}|;|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - open parens: whitespace", () => {
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "beforeWhitespace"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var| a| =| [|];|",
        "var| b| =| `asd`;|",
        "var| c| =| 'asd';|",
        'var| d| =| "asd";|',
        "var| e| =| /*3*/|	3;|",
        "var| f| =| /**| 3| */3;|",
        "var| g| =| (3+5|);|",
        "var| h| =| {| a:| 'value'| |};|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - open parens disabled/enabled open quotes enabled/disabled", () => {
    usingCursor({
      text: [
        "var a = [];"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "beforeWhitespace",
        autoClosingQuotes: "never"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var| a| =| [|];|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
          }
          assertType(editor, model, viewModel, lineNumber, column, "'", "'", `does not auto close @ (${lineNumber}, ${column})`);
        }
      }
    });
    usingCursor({
      text: [
        "var b = [];"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "never",
        autoClosingQuotes: "beforeWhitespace"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var b =| [|];|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "'", "''", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "'", "'", `does not auto close @ (${lineNumber}, ${column})`);
          }
          assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
        }
      }
    });
  });
  test("autoClosingPairs - configurable open parens", () => {
    setAutoClosingLanguageEnabledSet("abc");
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "languageDefined"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "v|ar |a = [|];|",
        "v|ar |b = `|asd`;|",
        "v|ar |c = '|asd';|",
        'v|ar d = "|asd";|',
        "v|ar e = /*3*/	3;|",
        "v|ar f = /** 3| */3;|",
        "v|ar g = (3+5|);|",
        "v|ar h = { |a: 'v|alue' |};|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - auto-pairing can be disabled", () => {
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "never",
        autoClosingQuotes: "never"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
            assertType(editor, model, viewModel, lineNumber, column, '"', '""', `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
            assertType(editor, model, viewModel, lineNumber, column, '"', '"', `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - auto wrapping is configurable", () => {
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 4),
        new Selection(1, 9, 1, 12)
      ]);
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "`var` a = `asd`");
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getValue(), "`(var)` a = `(asd)`");
    });
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoSurround: "never"
      }
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 4)
      ]);
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "` a = asd");
    });
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoSurround: "quotes"
      }
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 4)
      ]);
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "`var` a = asd");
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getValue(), "`(` a = asd");
    });
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoSurround: "brackets"
      }
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 4)
      ]);
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getValue(), "(var) a = asd");
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "(`) a = asd");
    });
  });
  test("autoClosingPairs - quote", () => {
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var a |=| [|]|;|",
        "var b |=| `asd`|;|",
        "var c |=| 'asd'|;|",
        'var d |=| "asd"|;|',
        "var e |=| /*3*/|	3;|",
        "var f |=| /**| 3 */3;|",
        "var g |=| (3+5)|;|",
        "var h |=| {| a:| 'value'| |}|;|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "'", "''", `auto closes @ (${lineNumber}, ${column})`);
          } else if (autoCloseColumns[column] === 2 /* Special2 */) {
            assertType(editor, model, viewModel, lineNumber, column, "'", "", `over types @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "'", "'", `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - multi-character autoclose", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      model.setValue("begi");
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.type("n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "beginend");
      model.setValue("/*");
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("*", "keyboard");
      assert.strictEqual(model.getLineContent(1), "/** */");
    });
  });
  test("autoClosingPairs - doc comments can be turned off", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingComments: "never"
      }
    }, (editor, model, viewModel) => {
      model.setValue("/*");
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("*", "keyboard");
      assert.strictEqual(model.getLineContent(1), "/**");
    });
  });
  test("issue #72177: multi-character autoclose with conflicting patterns", () => {
    const languageId = "autoClosingModeMultiChar";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      autoClosingPairs: [
        { open: "(", close: ")" },
        { open: "(*", close: "*)" },
        { open: "<@", close: "@>" },
        { open: "<@@", close: "@@>" }
      ]
    }));
    usingCursor({
      text: [
        ""
      ],
      languageId
    }, (editor, model, viewModel) => {
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "()");
      viewModel.type("*", "keyboard");
      assert.strictEqual(model.getLineContent(1), "(**)", `doesn't add entire close when already closed substring is there`);
      model.setValue("(");
      viewModel.setSelections("test", [new Selection(1, 2, 1, 2)]);
      viewModel.type("*", "keyboard");
      assert.strictEqual(model.getLineContent(1), "(**)", `does add entire close if not already there`);
      model.setValue("");
      viewModel.type("<@", "keyboard");
      assert.strictEqual(model.getLineContent(1), "<@@>");
      viewModel.type("@", "keyboard");
      assert.strictEqual(model.getLineContent(1), "<@@@@>", `autocloses when before multi-character closing brace`);
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "<@@()@@>", `autocloses when before multi-character closing brace`);
    });
  });
  test("issue #55314: Do not auto-close when ending with open", () => {
    const languageId = "myElectricMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "'", close: "'", notIn: ["string", "comment"] },
        { open: '"', close: '"', notIn: ["string"] },
        { open: 'B"', close: '"', notIn: ["string", "comment"] },
        { open: "`", close: "`", notIn: ["string", "comment"] },
        { open: "/**", close: " */", notIn: ["string"] }
      ]
    }));
    usingCursor({
      text: [
        "little goat",
        "little LAMB",
        "little sheep",
        "Big LAMB"
      ],
      languageId
    }, (editor, model, viewModel) => {
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 1, 4, '"', '"', `does not double quote when ending with open`);
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 2, 4, '"', '"', `does not double quote when ending with open`);
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 3, 4, '"', '"', `does not double quote when ending with open`);
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 4, 2, '"', '"', `does not double quote when ending with open`);
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 4, 3, '"', '"', `does not double quote when ending with open`);
    });
  });
  test("issue #27937: Trying to add an item to the front of a list is cumbersome", () => {
    usingCursor({
      text: [
        'var arr = ["b", "c"];'
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertType(editor, model, viewModel, 1, 12, '"', '"', `does not over type and will not auto close`);
    });
  });
  test("issue #25658 - Do not auto-close single/double quotes after word characters", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      function typeCharacters(viewModel2, chars) {
        for (let i = 0, len = chars.length; i < len; i++) {
          viewModel2.type(chars[i], "keyboard");
        }
      }
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, "teste1 = teste' ok");
      assert.strictEqual(model.getLineContent(1), "teste1 = teste' ok");
      viewModel.setSelections("test", [new Selection(1, 1e3, 1, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, "teste2 = teste 'ok");
      assert.strictEqual(model.getLineContent(2), "teste2 = teste 'ok'");
      viewModel.setSelections("test", [new Selection(2, 1e3, 2, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, 'teste3 = teste" ok');
      assert.strictEqual(model.getLineContent(3), 'teste3 = teste" ok');
      viewModel.setSelections("test", [new Selection(3, 1e3, 3, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, 'teste4 = teste "ok');
      assert.strictEqual(model.getLineContent(4), 'teste4 = teste "ok"');
      viewModel.setSelections("test", [new Selection(4, 1e3, 4, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, "teste '");
      assert.strictEqual(model.getLineContent(5), "teste ''");
      viewModel.setSelections("test", [new Selection(5, 1e3, 5, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, 'teste "');
      assert.strictEqual(model.getLineContent(6), 'teste ""');
      viewModel.setSelections("test", [new Selection(6, 1e3, 6, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, "teste'");
      assert.strictEqual(model.getLineContent(7), "teste'");
      viewModel.setSelections("test", [new Selection(7, 1e3, 7, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, 'teste"');
      assert.strictEqual(model.getLineContent(8), 'teste"');
    });
  });
  test("issue #37315 - overtypes only those characters that it inserted", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type("asd", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(asd)");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(asd)");
      viewModel.setSelections("test", [new Selection(2, 4, 2, 4)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(2), "y=());");
    });
  });
  test("issue #37315 - stops overtyping once cursor leaves area", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=())");
    });
  });
  test("issue #37315 - it overtypes only once", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.setSelections("test", [new Selection(1, 4, 1, 4)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=())");
    });
  });
  test("issue #37315 - it can remember multiple auto-closed instances", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(())");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(())");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(())");
    });
  });
  test("issue #118270 - auto closing deletes only those characters that it inserted", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type("asd", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(asd)");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), "x=()");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), "x=");
      viewModel.setSelections("test", [new Selection(2, 4, 2, 4)]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "y=);");
    });
  });
  test("issue #78527 - does not close quote on odd count", () => {
    usingCursor({
      text: [
        `std::cout << '"' << entryMap`
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 29, 1, 29)]);
      viewModel.type("[", "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap[]`);
      viewModel.type('"', "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap[""]`);
      viewModel.type("a", "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap["a"]`);
      viewModel.type('"', "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap["a"]`);
      viewModel.type("]", "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap["a"]`);
    });
  });
  test("issue #85983 - editor.autoClosingBrackets: beforeWhitespace is incorrect for Python", () => {
    const languageId = "pythonMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"', notIn: ["string"] },
        { open: 'r"', close: '"', notIn: ["string", "comment"] },
        { open: 'R"', close: '"', notIn: ["string", "comment"] },
        { open: 'u"', close: '"', notIn: ["string", "comment"] },
        { open: 'U"', close: '"', notIn: ["string", "comment"] },
        { open: 'f"', close: '"', notIn: ["string", "comment"] },
        { open: 'F"', close: '"', notIn: ["string", "comment"] },
        { open: 'b"', close: '"', notIn: ["string", "comment"] },
        { open: 'B"', close: '"', notIn: ["string", "comment"] },
        { open: "'", close: "'", notIn: ["string", "comment"] },
        { open: "r'", close: "'", notIn: ["string", "comment"] },
        { open: "R'", close: "'", notIn: ["string", "comment"] },
        { open: "u'", close: "'", notIn: ["string", "comment"] },
        { open: "U'", close: "'", notIn: ["string", "comment"] },
        { open: "f'", close: "'", notIn: ["string", "comment"] },
        { open: "F'", close: "'", notIn: ["string", "comment"] },
        { open: "b'", close: "'", notIn: ["string", "comment"] },
        { open: "B'", close: "'", notIn: ["string", "comment"] },
        { open: "`", close: "`", notIn: ["string"] }
      ]
    }));
    usingCursor({
      text: [
        "foo'hello'"
      ],
      editorOpts: {
        autoClosingBrackets: "beforeWhitespace"
      },
      languageId
    }, (editor, model, viewModel) => {
      assertType(editor, model, viewModel, 1, 4, "(", "(", `does not auto close @ (1, 4)`);
    });
  });
  test("issue #78975 - Parentheses swallowing does not work when parentheses are inserted by autocomplete", () => {
    usingCursor({
      text: [
        "<div id"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 8, 1, 8)]);
      viewModel.executeEdits("snippet", [{ range: new Range(1, 6, 1, 8), text: 'id=""' }], () => [new Selection(1, 10, 1, 10)], EditSources.unknown({}));
      assert.strictEqual(model.getLineContent(1), '<div id=""');
      viewModel.type("a", "keyboard");
      assert.strictEqual(model.getLineContent(1), '<div id="a"');
      viewModel.type('"', "keyboard");
      assert.strictEqual(model.getLineContent(1), '<div id="a"');
    });
  });
  test("issue #78833 - Add config to use old brackets/quotes overtyping", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingOvertype: "always"
      }
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.setSelections("test", [new Selection(1, 4, 1, 4)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.setSelections("test", [new Selection(2, 4, 2, 4)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(2), "y=();");
    });
  });
  test("issue #15825: accents on mac US intl keyboard", () => {
    usingCursor({
      text: [],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.startComposition();
      viewModel.type("`", "keyboard");
      viewModel.compositionType("\xE8", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "\xE8");
    });
  });
  test("issue #90016: allow accents on mac US intl keyboard to surround selection", () => {
    usingCursor({
      text: [
        "test"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 5)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "'test'");
    });
  });
  test("issue #53357: Over typing ignores characters after backslash", () => {
    usingCursor({
      text: [
        "console.log();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 13, 1, 13)]);
      viewModel.type("'", "keyboard");
      assert.strictEqual(model.getValue(), "console.log('');");
      viewModel.type("it", "keyboard");
      assert.strictEqual(model.getValue(), "console.log('it');");
      viewModel.type("\\", "keyboard");
      assert.strictEqual(model.getValue(), "console.log('it\\');");
      viewModel.type("'", "keyboard");
      assert.strictEqual(model.getValue(), "console.log('it\\'');");
    });
  });
  test("issue #84998: Overtyping Brackets doesn't work after backslash", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1)]);
      viewModel.type("\\", "keyboard");
      assert.strictEqual(model.getValue(), "\\");
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getValue(), "\\()");
      viewModel.type("abc", "keyboard");
      assert.strictEqual(model.getValue(), "\\(abc)");
      viewModel.type("\\", "keyboard");
      assert.strictEqual(model.getValue(), "\\(abc\\)");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getValue(), "\\(abc\\)");
    });
  });
  test("issue #2773: Accents (\xB4`\xA8^, others?) are inserted in the wrong position (Mac)", () => {
    usingCursor({
      text: [
        "hello",
        "world"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.startComposition();
      viewModel.type("`", "keyboard");
      moveDown(editor, viewModel, true);
      viewModel.compositionType("`", 1, 0, 0, "keyboard");
      viewModel.compositionType("`", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "`hello\nworld");
      assertCursor(viewModel, new Selection(1, 2, 2, 2));
    });
  });
  test("issue #26820: auto close quotes when not used as accents", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "''");
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "''");
      model.setValue("'abc");
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "'abc'");
      model.setValue("'abc'def ");
      viewModel.setSelections("test", [new Selection(1, 10, 1, 10)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "'abc'def ''");
      model.setValue("abc");
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      model.setValue("abc");
      viewModel.setSelections("test", [new Selection(1, 4, 1, 4)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "abc'");
    });
  });
  test("issue #144690: Quotes do not overtype when using US Intl PC keyboard layout", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.startComposition();
      viewModel.type(`'`, "keyboard");
      viewModel.compositionType(`'`, 1, 0, 0, "keyboard");
      viewModel.compositionType(`'`, 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      viewModel.startComposition();
      viewModel.type(`'`, "keyboard");
      viewModel.compositionType(`';`, 1, 0, 0, "keyboard");
      viewModel.compositionType(`';`, 2, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), `'';`);
    });
  });
  test("issue #144693: Typing a quote using US Intl PC keyboard layout always surrounds words", () => {
    usingCursor({
      text: [
        "const hello = 3;"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 7, 1, 12)]);
      viewModel.startComposition();
      viewModel.type(`'`, "keyboard");
      viewModel.compositionType(`\xE9`, 1, 0, 0, "keyboard");
      viewModel.compositionType(`\xE9`, 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), `const \xE9 = 3;`);
    });
  });
  test("issue #82701: auto close does not execute when IME is canceled via backspace", () => {
    usingCursor({
      text: [
        "{}"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 2, 1, 2)]);
      viewModel.startComposition();
      viewModel.type("a", "keyboard");
      viewModel.compositionType("", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "{}");
    });
  });
  test("issue #20891: All cursors should do the same thing", () => {
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 9, 1, 9),
        new Selection(1, 12, 1, 12)
      ]);
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "var a = `asd`");
    });
  });
  test("issue #41825: Special handling of quotes in surrounding pairs", () => {
    const languageId = "myMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      surroundingPairs: [
        { open: '"', close: '"' },
        { open: "'", close: "'" }
      ]
    }));
    const model = createTextModel2("var x = 'hi';", languageId);
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 9, 1, 10),
        new Selection(1, 12, 1, 13)
      ]);
      viewModel.type('"', "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'var x = "hi";', "assert1");
      editor.setSelections([
        new Selection(1, 9, 1, 10),
        new Selection(1, 12, 1, 13)
      ]);
      viewModel.type("'", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "var x = 'hi';", "assert2");
    });
  });
  test("All cursors should do the same thing when deleting left", () => {
    const model = createTextModel2(
      [
        "var a = ()"
      ].join("\n"),
      autoClosingLanguageId
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 4, 1, 4),
        new Selection(1, 10, 1, 10)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(), "va a = )");
    });
  });
  test("issue #7100: Mouse word selection is strange when non-word character is at the end of line", () => {
    const model = createTextModel2(
      [
        "before.a",
        "before",
        "hello:",
        "there:",
        "this is strange:",
        "here",
        "it",
        "is"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.runCommand(CoreNavigationCommands.WordSelect, {
        position: new Position(3, 7)
      });
      assertCursor(viewModel, new Selection(3, 7, 3, 7));
      editor.runCommand(CoreNavigationCommands.WordSelectDrag, {
        position: new Position(4, 7)
      });
      assertCursor(viewModel, new Selection(3, 7, 4, 7));
    });
  });
  test("issue #112039: shift-continuing a double/triple-click and drag selection does not remember its starting mode", () => {
    const model = createTextModel2(
      [
        "just some text",
        "and another line",
        "and another one"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.runCommand(CoreNavigationCommands.WordSelect, {
        position: new Position(2, 6)
      });
      editor.runCommand(CoreNavigationCommands.MoveToSelect, {
        position: new Position(1, 8)
      });
      assertCursor(viewModel, new Selection(2, 12, 1, 6));
    });
  });
  test("issue #158236: Shift click selection does not work on line number indicator", () => {
    const model = createTextModel2(
      [
        "just some text",
        "and another line",
        "and another one"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.runCommand(CoreNavigationCommands.MoveTo, {
        position: new Position(3, 5)
      });
      editor.runCommand(CoreNavigationCommands.LineSelectDrag, {
        position: new Position(2, 1)
      });
      assertCursor(viewModel, new Selection(3, 5, 2, 1));
    });
  });
  test("issue #111513: Text gets automatically selected when typing at the same location in another editor", () => {
    const model = createTextModel2(
      [
        "just",
        "",
        "some text"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor1, viewModel1) => {
      editor1.setSelections([
        new Selection(2, 1, 2, 1)
      ]);
      withTestCodeEditor2(model, {}, (editor2, viewModel2) => {
        editor2.setSelections([
          new Selection(2, 1, 2, 1)
        ]);
        viewModel2.type("e", "keyboard");
        assertCursor(viewModel2, new Position(2, 2));
        assertCursor(viewModel1, new Position(2, 2));
      });
    });
  });
});
suite("Undo stops", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("there is an undo stop between typing and deleting left", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("first", "keyboard");
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), "A fir line");
      assertCursor(viewModel, new Selection(1, 6, 1, 6));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A  line");
      assertCursor(viewModel, new Selection(1, 3, 1, 3));
    });
    model.dispose();
  });
  test("there is an undo stop between typing and deleting right", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("first", "keyboard");
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      assert.strictEqual(model.getLineContent(1), "A firstine");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A  line");
      assertCursor(viewModel, new Selection(1, 3, 1, 3));
    });
    model.dispose();
  });
  test("there is an undo stop between deleting left and typing", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 8, 2, 8)]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), " line");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      viewModel.type("Second", "keyboard");
      assert.strictEqual(model.getLineContent(2), "Second line");
      assertCursor(viewModel, new Selection(2, 7, 2, 7));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), " line");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another line");
      assertCursor(viewModel, new Selection(2, 8, 2, 8));
    });
    model.dispose();
  });
  test("there is an undo stop between deleting left and deleting right", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 8, 2, 8)]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), " line");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      assert.strictEqual(model.getLineContent(2), "");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), " line");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another line");
      assertCursor(viewModel, new Selection(2, 8, 2, 8));
    });
    model.dispose();
  });
  test("there is an undo stop between deleting right and typing", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 9, 2, 9)]);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      assert.strictEqual(model.getLineContent(2), "Another ");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      viewModel.type("text", "keyboard");
      assert.strictEqual(model.getLineContent(2), "Another text");
      assertCursor(viewModel, new Selection(2, 13, 2, 13));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another ");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another line");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
    });
    model.dispose();
  });
  test("there is an undo stop between deleting right and deleting left", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 9, 2, 9)]);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      assert.strictEqual(model.getLineContent(2), "Another ");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "An");
      assertCursor(viewModel, new Selection(2, 3, 2, 3));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another ");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another line");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
    });
    model.dispose();
  });
  test("inserts undo stop when typing space", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("first and interesting", "keyboard");
      assert.strictEqual(model.getLineContent(1), "A first and interesting line");
      assertCursor(viewModel, new Selection(1, 24, 1, 24));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A first and line");
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A  line");
      assertCursor(viewModel, new Selection(1, 3, 1, 3));
    });
    model.dispose();
  });
  test("can undo typing and EOL change in one undo stop", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("first", "keyboard");
      assert.strictEqual(model.getValue(), "A first line\nAnother line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      model.pushEOL(EndOfLineSequence.CRLF);
      assert.strictEqual(model.getValue(), "A first line\r\nAnother line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), "A  line\nAnother line");
      assertCursor(viewModel, new Selection(1, 3, 1, 3));
    });
    model.dispose();
  });
  test("issue #93585: Undo multi cursor edit corrupts document", () => {
    const model = createTextModel(
      [
        "hello world",
        "hello world"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(2, 7, 2, 12),
        new Selection(1, 7, 1, 12)
      ]);
      viewModel.type("no", "keyboard");
      assert.strictEqual(model.getValue(), "hello no\nhello no");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), "hello world\nhello world");
    });
    model.dispose();
  });
  test("there is a single undo stop for consecutive whitespaces", () => {
    const model = createTextModel(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.type("a", "keyboard");
      viewModel.type("b", "keyboard");
      viewModel.type(" ", "keyboard");
      viewModel.type(" ", "keyboard");
      viewModel.type("c", "keyboard");
      viewModel.type("d", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab  cd", "assert1");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab  ", "assert2");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab", "assert3");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "", "assert4");
    });
    model.dispose();
  });
  test("there is no undo stop after a single whitespace", () => {
    const model = createTextModel(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.type("a", "keyboard");
      viewModel.type("b", "keyboard");
      viewModel.type(" ", "keyboard");
      viewModel.type("c", "keyboard");
      viewModel.type("d", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab cd", "assert1");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab", "assert3");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "", "assert4");
    });
    model.dispose();
  });
});
suite("Overtype Mode", () => {
  setup(() => {
    InputMode.setInputMode("overtype");
  });
  teardown(() => {
    InputMode.setInputMode("insert");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("simple type", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("a", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "12a456789",
        "123456789"
      ].join("\n"), "assert1");
      viewModel.setSelections("test", [new Selection(1, 9, 1, 9)]);
      viewModel.type("bbb", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "12a45678bbb",
        "123456789"
      ].join("\n"), "assert2");
    });
    model.dispose();
  });
  test("multi-line selection type", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 2, 3)]);
      viewModel.type("cc", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234cc456789"
      ].join("\n"), "assert1");
    });
    model.dispose();
  });
  test("simple paste", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.paste("cc", false);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234cc789",
        "123456789"
      ].join("\n"), "assert1");
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.paste("dddddddd", false);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234dddddddd",
        "123456789"
      ].join("\n"), "assert2");
    });
    model.dispose();
  });
  test("multi-line selection paste", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 2, 3)]);
      viewModel.paste("cc", false);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234cc456789"
      ].join("\n"), "assert1");
    });
    model.dispose();
  });
  test("paste multi-line text", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.paste([
        "aaaaaaa",
        "bbbbbbb"
      ].join("\n"), false);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234aaaaaaa",
        "bbbbbbb",
        "123456789"
      ].join("\n"), "assert1");
    });
    model.dispose();
  });
  test("composition type", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.startComposition();
      viewModel.compositionType("\u30BB", 0, 0, 0, "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234\u30BB56789",
        "123456789"
      ].join("\n"), "assert1");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234\u30BB6789",
        "123456789"
      ].join("\n"), "assert1");
    });
    model.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvY29udHJvbGxlci9jdXJzb3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb3JlRWRpdGluZ0NvbW1hbmRzLCBDb3JlTmF2aWdhdGlvbkNvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IElDb21tYW5kLCBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEsIElFZGl0T3BlcmF0aW9uQnVpbGRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgTWV0YWRhdGFDb25zdHMsIFN0YW5kYXJkVG9rZW5UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCwgSVN0YXRlLCBJVG9rZW5pemF0aW9uU3VwcG9ydCwgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IEluZGVudEFjdGlvbiwgSW5kZW50YXRpb25SdWxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE51bGxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbnVsbFRva2VuaXplLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIEVuZE9mTGluZVNlcXVlbmNlLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbEV2ZW50RGlzcGF0Y2hlci5qcyc7XG5pbXBvcnQgeyBJVGVzdENvZGVFZGl0b3IsIFRlc3RDb2RlRWRpdG9ySW5zdGFudGlhdGlvbk9wdGlvbnMsIGNyZWF0ZUNvZGVFZGl0b3JTZXJ2aWNlcywgaW5zdGFudGlhdGVUZXN0Q29kZUVkaXRvciwgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSVJlbGF4ZWRUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMsIGNyZWF0ZVRleHRNb2RlbCwgaW5zdGFudGlhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJbnB1dE1vZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vaW5wdXRNb2RlLmpzJztcbmltcG9ydCB7IEVkaXRTb3VyY2VzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuXG4vLyAtLS0tLS0tLS0gdXRpbHNcblxuZnVuY3Rpb24gbW92ZVRvKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuID0gZmFsc2UpIHtcblx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge1xuXHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pXG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG8ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7XG5cdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbilcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBtb3ZlTGVmdChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckxlZnRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH0gZWxzZSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JMZWZ0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vdmVSaWdodChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclJpZ2h0U2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9IGVsc2Uge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yUmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbW92ZURvd24oZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IsIHZpZXdNb2RlbDogVmlld01vZGVsLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRpZiAoaW5TZWxlY3Rpb25Nb2RlKSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JEb3duU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9IGVsc2Uge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yRG93bi5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBtb3ZlVXAoZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IsIHZpZXdNb2RlbDogVmlld01vZGVsLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRpZiAoaW5TZWxlY3Rpb25Nb2RlKSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JVcFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fSBlbHNlIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclVwLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckhvbWVTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH0gZWxzZSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JIb21lLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vdmVUb0VuZE9mTGluZShlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckVuZFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fSBlbHNlIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckVuZC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBtb3ZlVG9CZWdpbm5pbmdPZkJ1ZmZlcihlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclRvcFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fSBlbHNlIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclRvcC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBtb3ZlVG9FbmRPZkJ1ZmZlcihlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckJvdHRvbVNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fSBlbHNlIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckJvdHRvbS5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBhc3NlcnRDdXJzb3Iodmlld01vZGVsOiBWaWV3TW9kZWwsIHdoYXQ6IFBvc2l0aW9uIHwgU2VsZWN0aW9uIHwgU2VsZWN0aW9uW10pOiB2b2lkIHtcblx0bGV0IHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdO1xuXHRpZiAod2hhdCBpbnN0YW5jZW9mIFBvc2l0aW9uKSB7XG5cdFx0c2VsZWN0aW9ucyA9IFtuZXcgU2VsZWN0aW9uKHdoYXQubGluZU51bWJlciwgd2hhdC5jb2x1bW4sIHdoYXQubGluZU51bWJlciwgd2hhdC5jb2x1bW4pXTtcblx0fSBlbHNlIGlmICh3aGF0IGluc3RhbmNlb2YgU2VsZWN0aW9uKSB7XG5cdFx0c2VsZWN0aW9ucyA9IFt3aGF0XTtcblx0fSBlbHNlIHtcblx0XHRzZWxlY3Rpb25zID0gd2hhdDtcblx0fVxuXHRjb25zdCBhY3R1YWwgPSB2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpLm1hcChzID0+IHMudG9TdHJpbmcoKSk7XG5cdGNvbnN0IGV4cGVjdGVkID0gc2VsZWN0aW9ucy5tYXAocyA9PiBzLnRvU3RyaW5nKCkpO1xuXG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG59XG5cbnN1aXRlKCdFZGl0b3IgQ29udHJvbGxlciAtIEN1cnNvcicsICgpID0+IHtcblx0Y29uc3QgTElORTEgPSAnICAgIFxcdE15IEZpcnN0IExpbmVcXHQgJztcblx0Y29uc3QgTElORTIgPSAnXFx0TXkgU2Vjb25kIExpbmUnO1xuXHRjb25zdCBMSU5FMyA9ICcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNic7XG5cdGNvbnN0IExJTkU0ID0gJyc7XG5cdGNvbnN0IExJTkU1ID0gJzEnO1xuXG5cdGNvbnN0IFRFWFQgPVxuXHRcdExJTkUxICsgJ1xcclxcbicgK1xuXHRcdExJTkUyICsgJ1xcbicgK1xuXHRcdExJTkUzICsgJ1xcbicgK1xuXHRcdExJTkU0ICsgJ1xcclxcbicgK1xuXHRcdExJTkU1O1xuXG5cdGZ1bmN0aW9uIHJ1blRlc3QoY2FsbGJhY2s6IChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoVEVYVCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y2FsbGJhY2soZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdH0pO1xuXHR9XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY3Vyc29yIGluaXRpYWxpemVkJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gYWJzb2x1dGUgbW92ZVxuXG5cdHRlc3QoJ25vIG1vdmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDIpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBpbiBzZWxlY3Rpb24gbW9kZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAyLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGJleW9uZCBsaW5lIGVuZCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAyNSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgTElORTEubGVuZ3RoICsgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGVtcHR5IGxpbmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgMjApO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDQsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBvbmUgY2hhciBsaW5lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDUsIDIwKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGlvbiBkb3duJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgYW5kIHRoZW4gc2VsZWN0JywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDMpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDMpKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxNSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDMsIDIsIDE1KSk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMiwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDMsIDEsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIG1vdmUgbGVmdFxuXG5cdHRlc3QoJ21vdmUgbGVmdCBvbiB0b3AgbGVmdCBwb3NpdGlvbicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBsZWZ0JywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDMpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDMpKTtcblx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgbGVmdCB3aXRoIHN1cnJvZ2F0ZSBwYWlyJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDE3KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCAxNykpO1xuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDE1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgbGVmdCBnb2VzIHRvIHByZXZpb3VzIHJvdycsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMjEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBsZWZ0IHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDEsIDIxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBtb3ZlIHJpZ2h0XG5cblx0dGVzdCgnbW92ZSByaWdodCBvbiBib3R0b20gcmlnaHQgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNSwgMik7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNSwgMikpO1xuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgcmlnaHQnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMykpO1xuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA0KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgcmlnaHQgd2l0aCBzdXJyb2dhdGUgcGFpcicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAxNSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMywgMTUpKTtcblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMywgMTcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSByaWdodCBnb2VzIHRvIG5leHQgcm93JywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDIxKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyMSkpO1xuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgcmlnaHQgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDIxKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyMSkpO1xuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMjEsIDIsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIG1vdmUgZG93blxuXG5cdHRlc3QoJ21vdmUgZG93bicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCAxKSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNCwgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgZG93biB3aXRoIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxKSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDMsIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMSwgNCwgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxLCA1LCAxKSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBkb3duIHdpdGggdGFicycsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA1KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMikpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDUpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig0LCAxKSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNSwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gbW92ZSB1cFxuXG5cdHRlc3QoJ21vdmUgdXAnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgNSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMywgNSkpO1xuXG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDIpKTtcblxuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgd2l0aCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgNSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMywgNSkpO1xuXG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCA1LCAyLCAyKSk7XG5cblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDUsIDEsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB1cCBhbmQgZG93biB3aXRoIHRhYnMnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIDIpKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNCwgMSkpO1xuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCA1KSk7XG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDIpKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHVwIGFuZCBkb3duIHdpdGggZW5kIG9mIGxpbmVzIHN0YXJ0aW5nIGZyb20gYSBsb25nIG9uZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvRW5kT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCBMSU5FMS5sZW5ndGggKyAxKSk7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCBMSU5FMi5sZW5ndGggKyAxKSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMywgTElORTMubGVuZ3RoICsgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDQsIExJTkU0Lmxlbmd0aCArIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCBMSU5FNS5sZW5ndGggKyAxKSk7XG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ0NDY1OiBjdXJzb3IgcG9zaXRpb24gbm90IGNvcnJlY3Qgd2hlbiBtb3ZlJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXSk7XG5cdFx0XHQvLyBnb2luZyBvbmNlIHVwIG9uIHRoZSBmaXJzdCBsaW5lIHJlbWVtYmVycyB0aGUgb2Zmc2V0IHZpc3VhbCBjb2x1bW5zXG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAyKSk7XG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDUpKTtcblxuXHRcdFx0Ly8gZ29pbmcgdHdpY2UgdXAgb24gdGhlIGZpcnN0IGxpbmUgZGlzY2FyZHMgdGhlIG9mZnNldCB2aXN1YWwgY29sdW1uc1xuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNDQwNDE6IEN1cnNvciB1cC9kb3duIHdvcmtzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnV29yZDEgV29yZDIgV29yZDMgV29yZDQnLFxuXHRcdFx0XHQnV29yZDUgV29yZDYgV29yZDcgV29yZDgnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgd3JhcHBpbmdJbmRlbnQ6ICdpbmRlbnQnLCB3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJywgd29yZFdyYXBDb2x1bW46IDIwIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV0pO1xuXG5cdFx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbnM6IGFueVtdID0gW107XG5cdFx0XHRmdW5jdGlvbiByZXBvcnRDdXJzb3JQb3NpdGlvbigpIHtcblx0XHRcdFx0Y3Vyc29yUG9zaXRpb25zLnB1c2godmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpWzBdLnZpZXdTdGF0ZS5wb3NpdGlvbi50b1N0cmluZygpKTtcblx0XHRcdH1cblxuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yRG93biwgbnVsbCk7XG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JEb3duLCBudWxsKTtcblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckRvd24sIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yRG93biwgbnVsbCk7XG5cblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclVwLCBudWxsKTtcblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclVwLCBudWxsKTtcblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclVwLCBudWxsKTtcblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclVwLCBudWxsKTtcblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3Vyc29yUG9zaXRpb25zLCBbXG5cdFx0XHRcdCcoMSwxKScsXG5cdFx0XHRcdCcoMiw1KScsXG5cdFx0XHRcdCcoMywxKScsXG5cdFx0XHRcdCcoNCw1KScsXG5cdFx0XHRcdCcoNCwxMCknLFxuXHRcdFx0XHQnKDMsMSknLFxuXHRcdFx0XHQnKDIsNSknLFxuXHRcdFx0XHQnKDEsMSknLFxuXHRcdFx0XHQnKDEsMSknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNDAxOTU6IEN1cnNvciB1cC9kb3duIG1ha2VzIHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnV29yZDEgV29yZDIgV29yZDMgV29yZDQnLFxuXHRcdFx0XHQnV29yZDUgV29yZDYgV29yZDcgV29yZDgnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgd3JhcHBpbmdJbmRlbnQ6ICdpbmRlbnQnLCB3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJywgd29yZFdyYXBDb2x1bW46IDIwIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKFtdLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAyMiwgMSwgMjIpLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCcsXG5cdFx0XHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudDogJ3NvbWUgdmVyeSB2ZXJ5IHZlcnkgdmVyeSB2ZXJ5IHZlcnkgdmVyeSB2ZXJ5IGxvbmcgdGV4dCcsXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSk7XG5cblx0XHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uczogYW55W10gPSBbXTtcblx0XHRcdGZ1bmN0aW9uIHJlcG9ydEN1cnNvclBvc2l0aW9uKCkge1xuXHRcdFx0XHRjdXJzb3JQb3NpdGlvbnMucHVzaCh2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKClbMF0udmlld1N0YXRlLnBvc2l0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JEb3duLCBudWxsKTtcblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckRvd24sIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yRG93biwgbnVsbCk7XG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JEb3duLCBudWxsKTtcblxuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVXAsIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVXAsIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVXAsIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVXAsIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdXJzb3JQb3NpdGlvbnMsIFtcblx0XHRcdFx0JygxLDEpJyxcblx0XHRcdFx0JygyLDUpJyxcblx0XHRcdFx0Jyg1LDE5KScsXG5cdFx0XHRcdCcoNiwxKScsXG5cdFx0XHRcdCcoNyw1KScsXG5cdFx0XHRcdCcoNiwxKScsXG5cdFx0XHRcdCcoMiw4KScsXG5cdFx0XHRcdCcoMSwxKScsXG5cdFx0XHRcdCcoMSwxKScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIG1vdmUgdG8gYmVnaW5uaW5nIG9mIGxpbmVcblxuXHR0ZXN0KCdtb3ZlIHRvIGJlZ2lubmluZyBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDYpKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGJlZ2lubmluZyBvZiBsaW5lIGZyb20gd2l0aGluIGxpbmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDYpKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGJlZ2lubmluZyBvZiBsaW5lIGZyb20gd2hpdGVzcGFjZSBhdCBiZWdpbm5pbmcgb2YgbGluZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAyKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNikpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGxpbmUgZnJvbSB3aXRoaW4gbGluZSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA2KSk7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGxpbmUgd2l0aCBzZWxlY3Rpb24gbXVsdGlsaW5lIGZvcndhcmQnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDksIHRydWUpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDUsIDMsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBiZWdpbm5pbmcgb2YgbGluZSB3aXRoIHNlbGVjdGlvbiBtdWx0aWxpbmUgYmFja3dhcmQnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDgsIHRydWUpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBiZWdpbm5pbmcgb2YgbGluZSB3aXRoIHNlbGVjdGlvbiBzaW5nbGUgbGluZSBmb3J3YXJkJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDIpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5LCB0cnVlKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCA1LCAzLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGxpbmUgd2l0aCBzZWxlY3Rpb24gc2luZ2xlIGxpbmUgYmFja3dhcmQnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDIsIHRydWUpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDUsIDMsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE1NDAxOiBcIkVuZFwiIGtleSBpcyBiZWhhdmluZyB3ZWlyZCB3aGVuIHRleHQgaXMgc2VsZWN0ZWQgcGFydCAxJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDgpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5LCB0cnVlKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCA1LCAzLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNzAxMTogU2hpZnQraG9tZS9lbmQgbm93IGdvIHRvIHRoZSBlbmQgb2YgdGhlIHNlbGVjdGlvbiBzdGFydFxcJ3MgbGluZSwgbm90IHRoZSBzZWxlY3Rpb25cXCdzIGVuZCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA4KTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOSwgdHJ1ZSk7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAzLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBtb3ZlIHRvIGVuZCBvZiBsaW5lXG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgbGluZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvRW5kT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCBMSU5FMS5sZW5ndGggKyAxKSk7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgbGluZSBmcm9tIHdpdGhpbiBsaW5lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDYpO1xuXHRcdFx0bW92ZVRvRW5kT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCBMSU5FMS5sZW5ndGggKyAxKSk7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgbGluZSBmcm9tIHdoaXRlc3BhY2UgYXQgZW5kIG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMjApO1xuXHRcdFx0bW92ZVRvRW5kT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCBMSU5FMS5sZW5ndGggKyAxKSk7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgbGluZSBmcm9tIHdpdGhpbiBsaW5lIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA2KTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgbGluZSB3aXRoIHNlbGVjdGlvbiBtdWx0aWxpbmUgZm9yd2FyZCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOSwgdHJ1ZSk7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMTcsIDMsIDE3KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZW5kIG9mIGxpbmUgd2l0aCBzZWxlY3Rpb24gbXVsdGlsaW5lIGJhY2t3YXJkJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDkpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxLCB0cnVlKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAyMSwgMSwgMjEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgbGluZSB3aXRoIHNlbGVjdGlvbiBzaW5nbGUgbGluZSBmb3J3YXJkJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDEpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5LCB0cnVlKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAxNywgMywgMTcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgbGluZSB3aXRoIHNlbGVjdGlvbiBzaW5nbGUgbGluZSBiYWNrd2FyZCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5KTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMSwgdHJ1ZSk7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMTcsIDMsIDE3KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNTQwMTogXCJFbmRcIiBrZXkgaXMgYmVoYXZpbmcgd2VpcmQgd2hlbiB0ZXh0IGlzIHNlbGVjdGVkIHBhcnQgMicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOSwgdHJ1ZSk7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMTcsIDMsIDE3KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBtb3ZlIHRvIGJlZ2lubmluZyBvZiBidWZmZXJcblxuXHR0ZXN0KCdtb3ZlIHRvIGJlZ2lubmluZyBvZiBidWZmZXInLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mQnVmZmVyKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGJ1ZmZlciBmcm9tIHdpdGhpbiBmaXJzdCBsaW5lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDMpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZCdWZmZXIoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBiZWdpbm5pbmcgb2YgYnVmZmVyIGZyb20gd2l0aGluIGFub3RoZXIgbGluZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAzKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mQnVmZmVyKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGJ1ZmZlciBmcm9tIHdpdGhpbiBmaXJzdCBsaW5lIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAzKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mQnVmZmVyKGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGJlZ2lubmluZyBvZiBidWZmZXIgZnJvbSB3aXRoaW4gYW5vdGhlciBsaW5lIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAzKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mQnVmZmVyKGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMywgMSwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gbW92ZSB0byBlbmQgb2YgYnVmZmVyXG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgYnVmZmVyJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG9FbmRPZkJ1ZmZlcihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNSwgTElORTUubGVuZ3RoICsgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBidWZmZXIgZnJvbSB3aXRoaW4gbGFzdCBsaW5lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDUsIDEpO1xuXHRcdFx0bW92ZVRvRW5kT2ZCdWZmZXIoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIExJTkU1Lmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgYnVmZmVyIGZyb20gd2l0aGluIGFub3RoZXIgbGluZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAzKTtcblx0XHRcdG1vdmVUb0VuZE9mQnVmZmVyKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCBMSU5FNS5sZW5ndGggKyAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZW5kIG9mIGJ1ZmZlciBmcm9tIHdpdGhpbiBsYXN0IGxpbmUgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDUsIDEpO1xuXHRcdFx0bW92ZVRvRW5kT2ZCdWZmZXIoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig1LCAxLCA1LCBMSU5FNS5sZW5ndGggKyAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZW5kIG9mIGJ1ZmZlciBmcm9tIHdpdGhpbiBhbm90aGVyIGxpbmUgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDMpO1xuXHRcdFx0bW92ZVRvRW5kT2ZCdWZmZXIoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAzLCA1LCBMSU5FNS5sZW5ndGggKyAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBtaXNjXG5cblx0dGVzdCgnc2VsZWN0IGFsbCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5TZWxlY3RBbGwucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIExJTkU1Lmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIGV2ZW50aW5nXG5cblx0dGVzdCgnbm8gbW92ZSBkb2VzblxcJ3QgdHJpZ2dlciBldmVudCcsICgpID0+IHtcblxuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdmlld01vZGVsLm9uRXZlbnQoKGUpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZhbHNlLCAnd2FzIG5vdCBleHBlY3RpbmcgZXZlbnQnKTtcblx0XHRcdH0pO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGV2ZW50aW5nJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRsZXQgZXZlbnRzID0gMDtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB2aWV3TW9kZWwub25FdmVudCgoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5raW5kID09PSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5DdXJzb3JTdGF0ZUNoYW5nZWQpIHtcblx0XHRcdFx0XHRldmVudHMrKztcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUuc2VsZWN0aW9ucywgW25ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMildKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cywgMSwgJ3JlY2VpdmVzIDEgZXZlbnQnKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGluIHNlbGVjdGlvbiBtb2RlIGV2ZW50aW5nJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRsZXQgZXZlbnRzID0gMDtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB2aWV3TW9kZWwub25FdmVudCgoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5raW5kID09PSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5DdXJzb3JTdGF0ZUNoYW5nZWQpIHtcblx0XHRcdFx0XHRldmVudHMrKztcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUuc2VsZWN0aW9ucywgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMildKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDIsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cywgMSwgJ3JlY2VpdmVzIDEgZXZlbnQnKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gc3RhdGUgc2F2ZSAmIHJlc3RvcmVcblxuXHR0ZXN0KCdzYXZlU3RhdGUgJiByZXN0b3JlU3RhdGUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDEpKTtcblxuXHRcdFx0Y29uc3Qgc2F2ZWRTdGF0ZSA9IEpTT04uc3RyaW5naWZ5KHZpZXdNb2RlbC5zYXZlQ3Vyc29yU3RhdGUoKSk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLnJlc3RvcmVDdXJzb3JTdGF0ZShKU09OLnBhcnNlKHNhdmVkU3RhdGUpKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMiwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gdXBkYXRpbmcgY3Vyc29yXG5cblx0dGVzdCgnSW5kZXBlbmRlbnQgbW9kZWwgZWRpdCAxJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDE2LCB0cnVlKTtcblxuXHRcdFx0ZWRpdG9yLmdldE1vZGVsKCkuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDIsIDEsIDIsIDIpKV0pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxNSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2x1bW4gc2VsZWN0IDEnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdcXHRwcml2YXRlIGNvbXB1dGUoYTpudW1iZXIpOiBib29sZWFuIHsnLFxuXHRcdFx0J1xcdFxcdGlmIChhICsgMyA9PT0gMCB8fCBhICsgNSA9PT0gMCkgeycsXG5cdFx0XHQnXFx0XFx0XFx0cmV0dXJuIGZhbHNlOycsXG5cdFx0XHQnXFx0XFx0fScsXG5cdFx0XHQnXFx0fSdcblx0XHRdLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDcpKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Db2x1bW5TZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oNCwgNCksXG5cdFx0XHRcdHZpZXdQb3NpdGlvbjogbmV3IFBvc2l0aW9uKDQsIDQpLFxuXHRcdFx0XHRtb3VzZUNvbHVtbjogMTUsXG5cdFx0XHRcdGRvQ29sdW1uU2VsZWN0OiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZXhwZWN0ZWRTZWxlY3Rpb25zID0gW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDEyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCA5KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAzLCAzLCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA0LCA0LCA0KSxcblx0XHRcdF07XG5cblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIGV4cGVjdGVkU2VsZWN0aW9ucyk7XG5cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ3JhcGhlbWUgYnJlYWtpbmcnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdhYmNhYmMnLFxuXHRcdFx0J2FcdTAzMDNhXHUwMzAzYVx1MDMwM2FcdTAzMDNhXHUwMzAzYVx1MDMwMycsXG5cdFx0XHQnXHU4RkJCXHVEQjQwXHVERDAwXHU4RkJCXHVEQjQwXHVERDAwXHU4RkJCXHVEQjQwXHVERDAwJyxcblx0XHRcdCdcdTBCQUFcdTBCQzEnLFxuXHRcdF0sIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKV0pO1xuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAzKSk7XG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDEpXSk7XG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDQpKTtcblx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCAxKSk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oNCwgMSwgNCwgMSldKTtcblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNCwgMykpO1xuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDQsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0pO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDUpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCA0KSk7XG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDUpKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMykpO1xuXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0OTA1IC0gY29sdW1uIHNlbGVjdCBpcyBiaWFzZWQgdG8gdGhlIHJpZ2h0JywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQndmFyIGd1bHAgPSByZXF1aXJlKFwiZ3VscFwiKTsnLFxuXHRcdFx0J3ZhciBwYXRoID0gcmVxdWlyZShcInBhdGhcIik7Jyxcblx0XHRcdCd2YXIgcmltcmFmID0gcmVxdWlyZShcInJpbXJhZlwiKTsnLFxuXHRcdFx0J3ZhciBpc2FycmF5ID0gcmVxdWlyZShcImlzYXJyYXlcIik7Jyxcblx0XHRcdCd2YXIgbWVyZ2UgPSByZXF1aXJlKFwibWVyZ2Utc3RyZWFtXCIpOycsXG5cdFx0XHQndmFyIGNvbmNhdCA9IHJlcXVpcmUoXCJndWxwLWNvbmNhdFwiKTsnLFxuXHRcdFx0J3ZhciBuZXdlciA9IHJlcXVpcmUoXCJndWxwLW5ld2VyXCIpOycsXG5cdFx0XS5qb2luKCdcXG4nKSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA0LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNCkpO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkNvbHVtblNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHtcblx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbig0LCAxKSxcblx0XHRcdFx0dmlld1Bvc2l0aW9uOiBuZXcgUG9zaXRpb24oNCwgMSksXG5cdFx0XHRcdG1vdXNlQ29sdW1uOiAxLFxuXHRcdFx0XHRkb0NvbHVtblNlbGVjdDogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA0LCA0LCAxKSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjAwODc6IGNvbHVtbiBzZWxlY3Qgd2l0aCBtb3VzZScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIGtleT1cIlNvbWVLZXlcIiB2YWx1ZT1cIjAwMFwiLz4nLFxuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIGtleT1cIlNvbWVLZXlcIiB2YWx1ZT1cIjAwMFwiLz4nLFxuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIEtleT1cIlNvbWVLZXlcIiB2YWx1ZT1cIjAwMFwiLz4nLFxuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIGtleT1cIlNvbWVLZXlcIiB2YWx1ZT1cIjAwMFwiLz4nLFxuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIGtleT1cIlNvTUVLRXlcIiB2YWx1ZT1cIjAwMFwiLz4nLFxuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIGtleT1cIlNvbWVLZXlcIiB2YWx1ZT1cIjAwMFwiLz4nLFxuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIGtleT1cIlNvbWVLZXlcIiB2YWx1ZT1cIjAwMFwiLz4nLFxuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIGtleT1cIlNvbWVLZXlcIiB2YWx1RT1cIjAwMFwiLz4nLFxuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIGtleT1cIlNvbWVLZXlcIiB2YWx1ZT1cIjAwMFwiLz4nLFxuXHRcdFx0Jzxwcm9wZXJ0eSBpZD1cIlNvbWVUaGluZ1wiIGtleT1cIlNvbWVLZXlcIiB2YWx1ZT1cIjAwWFwiLz4nLFxuXHRcdF0uam9pbignXFxuJyksIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxMCwgMTAsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxMCwgMTApKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Db2x1bW5TZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSksXG5cdFx0XHRcdHZpZXdQb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDEpLFxuXHRcdFx0XHRtb3VzZUNvbHVtbjogMSxcblx0XHRcdFx0ZG9Db2x1bW5TZWxlY3Q6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEwLCAxMCwgMTAsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDksIDEwLCA5LCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig4LCAxMCwgOCwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgMTAsIDcsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDEwLCA2LCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCAxMCwgNSwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMTAsIDQsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEwLCAzLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxMCwgMiwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTAsIDEsIDEpLFxuXHRcdFx0XSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ29sdW1uU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge1xuXHRcdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDEpLFxuXHRcdFx0XHR2aWV3UG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdFx0bW91c2VDb2x1bW46IDEsXG5cdFx0XHRcdGRvQ29sdW1uU2VsZWN0OiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxMCwgMTAsIDEwLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig5LCAxMCwgOSwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oOCwgMTAsIDgsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDcsIDEwLCA3LCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCAxMCwgNiwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgMTAsIDUsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEwLCA0LCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxMCwgMywgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTAsIDIsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxKSxcblx0XHRcdF0pO1xuXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMDA4NzogY29sdW1uIHNlbGVjdCB3aXRoIGtleWJvYXJkJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIgS2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29NRUtFeVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVFPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDBYXCIvPicsXG5cdFx0XS5qb2luKCdcXG4nKSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEwLCAxMCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEwLCAxMCkpO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdExlZnQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTAsIDEwLCAxMCwgOSlcblx0XHRcdF0pO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdExlZnQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTAsIDEwLCAxMCwgOClcblx0XHRcdF0pO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEwLCAxMCwgMTAsIDkpXG5cdFx0XHRdKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RVcC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxMCwgMTAsIDEwLCA5KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig5LCAxMCwgOSwgOSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3REb3duLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEwLCAxMCwgMTAsIDkpXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExODA2MjogQ29sdW1uIHNlbGVjdGlvbiBjYW5ub3Qgc2VsZWN0IGZpcnN0IHBvc2l0aW9uIG9mIGEgbGluZScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J2hlbGxvIHdvcmxkJyxcblx0XHRdLmpvaW4oJ1xcbicpLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIpKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RMZWZ0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDEpXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29sdW1uIHNlbGVjdCB3aXRoIGtleWJvYXJkJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQndmFyIGd1bHAgPSByZXF1aXJlKFwiZ3VscFwiKTsnLFxuXHRcdFx0J3ZhciBwYXRoID0gcmVxdWlyZShcInBhdGhcIik7Jyxcblx0XHRcdCd2YXIgcmltcmFmID0gcmVxdWlyZShcInJpbXJhZlwiKTsnLFxuXHRcdFx0J3ZhciBpc2FycmF5ID0gcmVxdWlyZShcImlzYXJyYXlcIik7Jyxcblx0XHRcdCd2YXIgbWVyZ2UgPSByZXF1aXJlKFwibWVyZ2Utc3RyZWFtXCIpOycsXG5cdFx0XHQndmFyIGNvbmNhdCA9IHJlcXVpcmUoXCJndWxwLWNvbmNhdFwiKTsnLFxuXHRcdFx0J3ZhciBuZXdlciA9IHJlcXVpcmUoXCJndWxwLW5ld2VyXCIpOycsXG5cdFx0XS5qb2luKCdcXG4nKSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDQsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA0KSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNSlcblx0XHRcdF0pO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdERvd24ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNSlcblx0XHRcdF0pO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdERvd24ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3REb3duLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3REb3duLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3REb3duLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3REb3duLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDQsIDMsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDQsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDQsIDYsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDcsIDQsIDcsIDUpLFxuXHRcdFx0XSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNCwgNSwgNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgNCwgNiwgNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgNiksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gMTAgdGltZXNcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAxNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCAxNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgMTYpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIDEwIHRpbWVzXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDI2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCAyNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgMjYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDQsIDI2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA0LCA1LCAyNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgNCwgNiwgMjYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDcsIDQsIDcsIDI2KSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyAyIHRpbWVzID0+IHJlYWNoaW5nIHRoZSBlbmRpbmcgb2YgbGluZXMgMSBhbmQgMlxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgMjgpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIDQgdGltZXMgPT4gcmVhY2hpbmcgdGhlIGVuZGluZyBvZiBsaW5lIDNcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAzMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgMzIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDMyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCAzMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgMzIpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIDIgdGltZXMgPT4gcmVhY2hpbmcgdGhlIGVuZGluZyBvZiBsaW5lIDRcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgMzIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDQsIDM0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA0LCA1LCAzNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgNCwgNiwgMzQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDcsIDQsIDcsIDM0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyAxIHRpbWUgPT4gcmVhY2hpbmcgdGhlIGVuZGluZyBvZiBsaW5lIDdcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAzMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgMzQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDM1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCAzNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgMzUpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIDMgdGltZXMgPT4gcmVhY2hpbmcgdGhlIGVuZGluZyBvZiBsaW5lcyA1ICYgNlxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgMzIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDQsIDM0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA0LCA1LCAzNyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgNCwgNiwgMzcpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDcsIDQsIDcsIDM1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBjYW5ub3QgZ28gYW55d2hlcmUgYW55bW9yZVxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDQsIDMsIDMyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA0LCA0LCAzNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNCwgNSwgMzcpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDQsIDYsIDM3KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig3LCA0LCA3LCAzNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gY2Fubm90IGdvIGFueXdoZXJlIGFueW1vcmUgZXZlbiBpZiB3ZSBpbnNpc3Rcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAzMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgMzQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDM3KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCAzNyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgMzUpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIGNhbiBlYXNpbHkgZ28gYmFja1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RMZWZ0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgMzIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDQsIDM0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA0LCA1LCAzNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgNCwgNiwgMzYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDcsIDQsIDcsIDM1KSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRTZWxlY3Rpb24gLyBzZXRQb3NpdGlvbiB3aXRoIHNvdXJjZScsICgpID0+IHtcblxuXHRcdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0ID0ge1xuXHRcdFx0Z2V0SW5pdGlhbFN0YXRlOiAoKSA9PiBOdWxsU3RhdGUsXG5cdFx0XHR0b2tlbml6ZTogdW5kZWZpbmVkISxcblx0XHRcdHRva2VuaXplRW5jb2RlZDogKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogSVN0YXRlKTogRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCA9PiB7XG5cdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdChuZXcgVWludDMyQXJyYXkoMCksIFtdLCBzdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IExBTkdVQUdFX0lEID0gJ21vZGVsTW9kZVRlc3QxJztcblx0XHRjb25zdCBsYW5ndWFnZVJlZ2lzdHJhdGlvbiA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKExBTkdVQUdFX0lELCB0b2tlbml6YXRpb25TdXBwb3J0KTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnSnVzdCB0ZXh0JywgTEFOR1VBR0VfSUQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvcjEsIGN1cnNvcjEpID0+IHtcblx0XHRcdGxldCBldmVudDogSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGVkaXRvcjEub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbihlID0+IHtcblx0XHRcdFx0ZXZlbnQgPSBlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGVkaXRvcjEuc2V0U2VsZWN0aW9uKG5ldyBSYW5nZSgxLCAyLCAxLCAzKSwgJ25hdmlnYXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCEuc291cmNlLCAnbmF2aWdhdGlvbicpO1xuXG5cdFx0XHRldmVudCA9IHVuZGVmaW5lZDtcblx0XHRcdGVkaXRvcjEuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIpLCAnbmF2aWdhdGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5zb3VyY2UsICduYXZpZ2F0aW9uJyk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdGxhbmd1YWdlUmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdFZGl0b3IgQ29udHJvbGxlcicsICgpID0+IHtcblxuXHRjb25zdCBzdXJyb3VuZGluZ0xhbmd1YWdlSWQgPSAnc3Vycm91bmRpbmdMYW5ndWFnZSc7XG5cdGNvbnN0IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCA9ICdpbmRlbnRSdWxlc0xhbmd1YWdlJztcblx0Y29uc3QgZWxlY3RyaWNDaGFyTGFuZ3VhZ2VJZCA9ICdlbGVjdHJpY0NoYXJMYW5ndWFnZSc7XG5cdGNvbnN0IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCA9ICdhdXRvQ2xvc2luZ0xhbmd1YWdlJztcblx0Y29uc3QgZW1wdHlDbG9zaW5nU3Vycm91bmRMYW5ndWFnZUlkID0gJ2VtcHR5Q2xvc2luZ1N1cnJvdW5kTGFuZ3VhZ2UnO1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUNvZGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0bGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IHN1cnJvdW5kaW5nTGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIoc3Vycm91bmRpbmdMYW5ndWFnZUlkLCB7XG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzOiBbeyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfV1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogZW1wdHlDbG9zaW5nU3Vycm91bmRMYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihlbXB0eUNsb3NpbmdTdXJyb3VuZExhbmd1YWdlSWQsIHtcblx0XHRcdHN1cnJvdW5kaW5nUGFpcnM6IFt7IG9wZW46ICc8JywgY2xvc2U6ICcnIH1dXG5cdFx0fSkpO1xuXG5cdFx0c2V0dXBJbmRlbnRSdWxlc0xhbmd1YWdlKGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCwge1xuXHRcdFx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXlxccyooKD8hXFxTLipcXC9bKl0pLipbKl1cXC9cXHMqKT9bfSlcXF1dfF5cXHMqKGNhc2VcXGIuKnxkZWZhdWx0KTpcXHMqKFxcL1xcLy4qfFxcL1sqXS4qWypdXFwvXFxzKik/JC8sXG5cdFx0XHRpbmNyZWFzZUluZGVudFBhdHRlcm46IC9eKCg/IVxcL1xcLykuKSooXFx7W159XCInYF0qfFxcKFteKVwiJ10qfFxcW1teXFxdXCInXSp8XlxccyooXFx7XFx9fFxcKFxcKXxcXFtcXF18KGNhc2VcXGIuKnxkZWZhdWx0KTopKVxccyooXFwvXFwvLip8XFwvWypdLipbKl1cXC9cXHMqKT8kLyxcblx0XHRcdGluZGVudE5leHRMaW5lUGF0dGVybjogL15cXHMqKGZvcnx3aGlsZXxpZnxlbHNlKVxcYig/IS4qWzt7fV1cXHMqKFxcL1xcLy4qfFxcL1sqXS4qWypdXFwvXFxzKik/JCkvLFxuXHRcdFx0dW5JbmRlbnRlZExpbmVQYXR0ZXJuOiAvXig/IS4qKFs7e31dfFxcUzopXFxzKihcXC9cXC8uKnxcXC9bKl0uKlsqXVxcL1xccyopPyQpKD8hLiooXFx7W159XCInXSp8XFwoW14pXCInXSp8XFxbW15cXF1cIiddKnxeXFxzKihcXHtcXH18XFwoXFwpfFxcW1xcXXwoY2FzZVxcYi4qfGRlZmF1bHQpOikpXFxzKihcXC9cXC8uKnxcXC9bKl0uKlsqXVxcL1xccyopPyQpKD8hXlxccyooKD8hXFxTLipcXC9bKl0pLipbKl1cXC9cXHMqKT9bfSlcXF1dfF5cXHMqKGNhc2VcXGIuKnxkZWZhdWx0KTpcXHMqKFxcL1xcLy4qfFxcL1sqXS4qWypdXFwvXFxzKik/JCkoPyFeXFxzKihmb3J8d2hpbGV8aWZ8ZWxzZSlcXGIoPyEuKls7e31dXFxzKihcXC9cXC8uKnxcXC9bKl0uKlsqXVxcL1xccyopPyQpKS9cblx0XHR9KTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihlbGVjdHJpY0NoYXJMYW5ndWFnZUlkLCB7XG5cdFx0XHRfX2VsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydDoge1xuXHRcdFx0XHRkb2NDb21tZW50OiB7IG9wZW46ICcvKionLCBjbG9zZTogJyAqLycgfVxuXHRcdFx0fSxcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsneycsICd9J10sXG5cdFx0XHRcdFsnWycsICddJ10sXG5cdFx0XHRcdFsnKCcsICcpJ11cblx0XHRcdF1cblx0XHR9KSk7XG5cblx0XHRzZXR1cEF1dG9DbG9zaW5nTGFuZ3VhZ2UoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gc2V0dXBPbkVudGVyTGFuZ3VhZ2UoaW5kZW50QWN0aW9uOiBJbmRlbnRBY3Rpb24pOiBzdHJpbmcge1xuXHRcdGNvbnN0IG9uRW50ZXJMYW5ndWFnZUlkID0gJ29uRW50ZXJNb2RlJztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBvbkVudGVyTGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIob25FbnRlckxhbmd1YWdlSWQsIHtcblx0XHRcdG9uRW50ZXJSdWxlczogW3tcblx0XHRcdFx0YmVmb3JlVGV4dDogLy4qLyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0aW5kZW50QWN0aW9uOiBpbmRlbnRBY3Rpb25cblx0XHRcdFx0fVxuXHRcdFx0fV1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIG9uRW50ZXJMYW5ndWFnZUlkO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXBJbmRlbnRSdWxlc0xhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZywgaW5kZW50YXRpb25SdWxlczogSW5kZW50YXRpb25SdWxlKTogc3RyaW5nIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwge1xuXHRcdFx0aW5kZW50YXRpb25SdWxlczogaW5kZW50YXRpb25SdWxlc1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gbGFuZ3VhZ2VJZDtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldHVwQXV0b0Nsb3NpbmdMYW5ndWFnZSgpIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsIHtcblx0XHRcdGNvbW1lbnRzOiB7XG5cdFx0XHRcdGJsb2NrQ29tbWVudDogWycvKicsICcqLyddXG5cdFx0XHR9LFxuXHRcdFx0YXV0b0Nsb3NpbmdQYWlyczogW1xuXHRcdFx0XHR7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxuXHRcdFx0XHR7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxuXHRcdFx0XHR7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxuXHRcdFx0XHR7IG9wZW46ICdcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZyddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ2AnLCBjbG9zZTogJ2AnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJy8qKicsIGNsb3NlOiAnICovJywgbm90SW46IFsnc3RyaW5nJ10gfSxcblx0XHRcdFx0eyBvcGVuOiAnYmVnaW4nLCBjbG9zZTogJ2VuZCcsIG5vdEluOiBbJ3N0cmluZyddIH1cblx0XHRcdF0sXG5cdFx0XHRfX2VsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydDoge1xuXHRcdFx0XHRkb2NDb21tZW50OiB7IG9wZW46ICcvKionLCBjbG9zZTogJyAqLycgfVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldHVwQXV0b0Nsb3NpbmdMYW5ndWFnZVRva2VuaXphdGlvbigpIHtcblx0XHRjbGFzcyBCYXNlU3RhdGUgaW1wbGVtZW50cyBJU3RhdGUge1xuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdHB1YmxpYyByZWFkb25seSBwYXJlbnQ6IFN0YXRlIHwgbnVsbCA9IG51bGxcblx0XHRcdCkgeyB9XG5cdFx0XHRjbG9uZSgpOiBJU3RhdGUgeyByZXR1cm4gdGhpczsgfVxuXHRcdFx0ZXF1YWxzKG90aGVyOiBJU3RhdGUpOiBib29sZWFuIHtcblx0XHRcdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBCYXNlU3RhdGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdGhpcy5wYXJlbnQgJiYgIW90aGVyLnBhcmVudCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdGhpcy5wYXJlbnQgfHwgIW90aGVyLnBhcmVudCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5wYXJlbnQuZXF1YWxzKG90aGVyLnBhcmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNsYXNzIFN0cmluZ1N0YXRlIGltcGxlbWVudHMgSVN0YXRlIHtcblx0XHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0XHRwdWJsaWMgcmVhZG9ubHkgY2hhcjogc3RyaW5nLFxuXHRcdFx0XHRwdWJsaWMgcmVhZG9ubHkgcGFyZW50U3RhdGU6IFN0YXRlXG5cdFx0XHQpIHsgfVxuXHRcdFx0Y2xvbmUoKTogSVN0YXRlIHsgcmV0dXJuIHRoaXM7IH1cblx0XHRcdGVxdWFscyhvdGhlcjogSVN0YXRlKTogYm9vbGVhbiB7IHJldHVybiBvdGhlciBpbnN0YW5jZW9mIFN0cmluZ1N0YXRlICYmIHRoaXMuY2hhciA9PT0gb3RoZXIuY2hhciAmJiB0aGlzLnBhcmVudFN0YXRlLmVxdWFscyhvdGhlci5wYXJlbnRTdGF0ZSk7IH1cblx0XHR9XG5cdFx0Y2xhc3MgQmxvY2tDb21tZW50U3RhdGUgaW1wbGVtZW50cyBJU3RhdGUge1xuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdHB1YmxpYyByZWFkb25seSBwYXJlbnRTdGF0ZTogU3RhdGVcblx0XHRcdCkgeyB9XG5cdFx0XHRjbG9uZSgpOiBJU3RhdGUgeyByZXR1cm4gdGhpczsgfVxuXHRcdFx0ZXF1YWxzKG90aGVyOiBJU3RhdGUpOiBib29sZWFuIHsgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgU3RyaW5nU3RhdGUgJiYgdGhpcy5wYXJlbnRTdGF0ZS5lcXVhbHMob3RoZXIucGFyZW50U3RhdGUpOyB9XG5cdFx0fVxuXHRcdHR5cGUgU3RhdGUgPSBCYXNlU3RhdGUgfCBTdHJpbmdTdGF0ZSB8IEJsb2NrQ29tbWVudFN0YXRlO1xuXG5cdFx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQoYXV0b0Nsb3NpbmdMYW5ndWFnZUlkKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoYXV0b0Nsb3NpbmdMYW5ndWFnZUlkLCB7XG5cdFx0XHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IG5ldyBCYXNlU3RhdGUoKSxcblx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiBmdW5jdGlvbiAobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIF9zdGF0ZTogSVN0YXRlKTogRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCB7XG5cdFx0XHRcdGxldCBzdGF0ZSA9IDxTdGF0ZT5fc3RhdGU7XG5cdFx0XHRcdGNvbnN0IHRva2VuczogeyBsZW5ndGg6IG51bWJlcjsgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUgfVtdID0gW107XG5cdFx0XHRcdGNvbnN0IGdlbmVyYXRlVG9rZW4gPSAobGVuZ3RoOiBudW1iZXIsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLCBuZXdTdGF0ZT86IFN0YXRlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRva2Vucy5sZW5ndGggPiAwICYmIHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0udHlwZSA9PT0gdHlwZSkge1xuXHRcdFx0XHRcdFx0Ly8gZ3JvdyBsYXN0IHRva2Vuc1xuXHRcdFx0XHRcdFx0dG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5sZW5ndGggKz0gbGVuZ3RoO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0b2tlbnMucHVzaCh7IGxlbmd0aCwgdHlwZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGluZSA9IGxpbmUuc3Vic3RyaW5nKGxlbmd0aCk7XG5cdFx0XHRcdFx0aWYgKG5ld1N0YXRlKSB7XG5cdFx0XHRcdFx0XHRzdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0d2hpbGUgKGxpbmUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGFkdmFuY2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgVWludDMyQXJyYXkodG9rZW5zLmxlbmd0aCAqIDIpO1xuXHRcdFx0XHRsZXQgc3RhcnRJbmRleCA9IDA7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0cmVzdWx0WzIgKiBpXSA9IHN0YXJ0SW5kZXg7XG5cdFx0XHRcdFx0cmVzdWx0WzIgKiBpICsgMV0gPSAoXG5cdFx0XHRcdFx0XHQoZW5jb2RlZExhbmd1YWdlSWQgPDwgTWV0YWRhdGFDb25zdHMuTEFOR1VBR0VJRF9PRkZTRVQpXG5cdFx0XHRcdFx0XHR8ICh0b2tlbnNbaV0udHlwZSA8PCBNZXRhZGF0YUNvbnN0cy5UT0tFTl9UWVBFX09GRlNFVClcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHN0YXJ0SW5kZXggKz0gdG9rZW5zW2ldLmxlbmd0aDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQocmVzdWx0LCBbXSwgc3RhdGUpO1xuXG5cdFx0XHRcdGZ1bmN0aW9uIGFkdmFuY2UoKTogdm9pZCB7XG5cdFx0XHRcdFx0aWYgKHN0YXRlIGluc3RhbmNlb2YgQmFzZVN0YXRlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtMSA9IGxpbmUubWF0Y2goL15bXidcImB7fS9dKy9nKTtcblx0XHRcdFx0XHRcdGlmIChtMSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbihtMVswXS5sZW5ndGgsIFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgvXlsnXCJgXS8udGVzdChsaW5lKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigxLCBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcsIG5ldyBTdHJpbmdTdGF0ZShsaW5lLmNoYXJBdCgwKSwgc3RhdGUpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgvXnsvLnRlc3QobGluZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGdlbmVyYXRlVG9rZW4oMSwgU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIsIG5ldyBCYXNlU3RhdGUoc3RhdGUpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgvXn0vLnRlc3QobGluZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGdlbmVyYXRlVG9rZW4oMSwgU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIsIHN0YXRlLnBhcmVudCB8fCBuZXcgQmFzZVN0YXRlKCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKC9eXFwvXFwvLy50ZXN0KGxpbmUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKGxpbmUubGVuZ3RoLCBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50LCBzdGF0ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoL15cXC9cXCovLnRlc3QobGluZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGdlbmVyYXRlVG9rZW4oMiwgU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudCwgbmV3IEJsb2NrQ29tbWVudFN0YXRlKHN0YXRlKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigxLCBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciwgc3RhdGUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgaW5zdGFuY2VvZiBTdHJpbmdTdGF0ZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbTEgPSBsaW5lLm1hdGNoKC9eW15cXFxcJ1wiYFxcJF0rL2cpO1xuXHRcdFx0XHRcdFx0aWYgKG0xKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKG0xWzBdLmxlbmd0aCwgU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgvXlxcXFwvLnRlc3QobGluZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGdlbmVyYXRlVG9rZW4oMiwgU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChsaW5lLmNoYXJBdCgwKSA9PT0gc3RhdGUuY2hhcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigxLCBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcsIHN0YXRlLnBhcmVudFN0YXRlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgvXlxcJFxcey8udGVzdChsaW5lKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigyLCBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciwgbmV3IEJhc2VTdGF0ZShzdGF0ZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGdlbmVyYXRlVG9rZW4oMSwgU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIsIHN0YXRlKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlIGluc3RhbmNlb2YgQmxvY2tDb21tZW50U3RhdGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG0xID0gbGluZS5tYXRjaCgvXlteKl0rL2cpO1xuXHRcdFx0XHRcdFx0aWYgKG0xKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKG0xWzBdLmxlbmd0aCwgU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgvXlxcKlxcLy8udGVzdChsaW5lKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigyLCBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50LCBzdGF0ZS5wYXJlbnRTdGF0ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigxLCBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciwgc3RhdGUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gc3RhdGVgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzZXRBdXRvQ2xvc2luZ0xhbmd1YWdlRW5hYmxlZFNldChjaGFyczogc3RyaW5nKTogdm9pZCB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIoYXV0b0Nsb3NpbmdMYW5ndWFnZUlkLCB7XG5cdFx0XHRhdXRvQ2xvc2VCZWZvcmU6IGNoYXJzLFxuXHRcdFx0YXV0b0Nsb3NpbmdQYWlyczogW1xuXHRcdFx0XHR7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxuXHRcdFx0XHR7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxuXHRcdFx0XHR7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxuXHRcdFx0XHR7IG9wZW46ICdcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZyddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ2AnLCBjbG9zZTogJ2AnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJy8qKicsIGNsb3NlOiAnICovJywgbm90SW46IFsnc3RyaW5nJ10gfVxuXHRcdFx0XSxcblx0XHR9KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVUZXh0TW9kZWwodGV4dDogc3RyaW5nLCBsYW5ndWFnZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbCwgb3B0aW9uczogSVJlbGF4ZWRUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMgPSBUZXh0TW9kZWwuREVGQVVMVF9DUkVBVElPTl9PUFRJT05TLCB1cmk6IFVSSSB8IG51bGwgPSBudWxsKTogVGV4dE1vZGVsIHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXh0LCBsYW5ndWFnZUlkLCBvcHRpb25zLCB1cmkpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHdpdGhUZXN0Q29kZUVkaXRvcih0ZXh0OiBJVGV4dE1vZGVsIHwgc3RyaW5nIHwgc3RyaW5nW10sIG9wdGlvbnM6IFRlc3RDb2RlRWRpdG9ySW5zdGFudGlhdGlvbk9wdGlvbnMsIGNhbGxiYWNrOiAoZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IsIHZpZXdNb2RlbDogVmlld01vZGVsKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0bGV0IG1vZGVsOiBJVGV4dE1vZGVsO1xuXHRcdGlmICh0eXBlb2YgdGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKHRleHQpO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh0ZXh0KSkge1xuXHRcdFx0bW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGV4dC5qb2luKCdcXG4nKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGVsID0gdGV4dDtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9yID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGVzdENvZGVFZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2UsIG1vZGVsLCBvcHRpb25zKSk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLmdldFZpZXdNb2RlbCgpITtcblx0XHR2aWV3TW9kZWwuc2V0SGFzRm9jdXModHJ1ZSk7XG5cdFx0Y2FsbGJhY2soZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHR9XG5cblx0aW50ZXJmYWNlIElDdXJzb3JPcHRzIHtcblx0XHR0ZXh0OiBzdHJpbmdbXTtcblx0XHRsYW5ndWFnZUlkPzogc3RyaW5nIHwgbnVsbDtcblx0XHRtb2RlbE9wdHM/OiBJUmVsYXhlZFRleHRNb2RlbENyZWF0aW9uT3B0aW9ucztcblx0XHRlZGl0b3JPcHRzPzogSUVkaXRvck9wdGlvbnM7XG5cdH1cblxuXHRmdW5jdGlvbiB1c2luZ0N1cnNvcihvcHRzOiBJQ3Vyc29yT3B0cywgY2FsbGJhY2s6IChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgbW9kZWw6IFRleHRNb2RlbCwgdmlld01vZGVsOiBWaWV3TW9kZWwpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChvcHRzLnRleHQuam9pbignXFxuJyksIG9wdHMubGFuZ3VhZ2VJZCwgb3B0cy5tb2RlbE9wdHMpO1xuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnM6IFRlc3RDb2RlRWRpdG9ySW5zdGFudGlhdGlvbk9wdGlvbnMgPSBvcHRzLmVkaXRvck9wdHMgfHwge307XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCBlZGl0b3JPcHRpb25zLCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNhbGxiYWNrKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCk7XG5cdFx0fSk7XG5cdH1cblxuXHRjb25zdCBlbnVtIEF1dG9DbG9zaW5nQ29sdW1uVHlwZSB7XG5cdFx0Tm9ybWFsID0gMCxcblx0XHRTcGVjaWFsMSA9IDEsXG5cdFx0U3BlY2lhbDIgPSAyXG5cdH1cblxuXHRmdW5jdGlvbiBleHRyYWN0QXV0b0Nsb3NpbmdTcGVjaWFsQ29sdW1ucyhtYXhDb2x1bW46IG51bWJlciwgYW5ub3RhdGVkTGluZTogc3RyaW5nKTogQXV0b0Nsb3NpbmdDb2x1bW5UeXBlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogQXV0b0Nsb3NpbmdDb2x1bW5UeXBlW10gPSBbXTtcblx0XHRmb3IgKGxldCBqID0gMTsgaiA8PSBtYXhDb2x1bW47IGorKykge1xuXHRcdFx0cmVzdWx0W2pdID0gQXV0b0Nsb3NpbmdDb2x1bW5UeXBlLk5vcm1hbDtcblx0XHR9XG5cdFx0bGV0IGNvbHVtbiA9IDE7XG5cdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBhbm5vdGF0ZWRMaW5lLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRpZiAoYW5ub3RhdGVkTGluZS5jaGFyQXQoaikgPT09ICd8Jykge1xuXHRcdFx0XHRyZXN1bHRbY29sdW1uXSA9IEF1dG9DbG9zaW5nQ29sdW1uVHlwZS5TcGVjaWFsMTtcblx0XHRcdH0gZWxzZSBpZiAoYW5ub3RhdGVkTGluZS5jaGFyQXQoaikgPT09ICchJykge1xuXHRcdFx0XHRyZXN1bHRbY29sdW1uXSA9IEF1dG9DbG9zaW5nQ29sdW1uVHlwZS5TcGVjaWFsMjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbHVtbisrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0VHlwZShlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgbW9kZWw6IElUZXh0TW9kZWwsIHZpZXdNb2RlbDogVmlld01vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBjaHI6IHN0cmluZywgZXhwZWN0ZWRJbnNlcnQ6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IGxpbmVDb250ZW50LnN1YnN0cigwLCBjb2x1bW4gLSAxKSArIGV4cGVjdGVkSW5zZXJ0ICsgbGluZUNvbnRlbnQuc3Vic3RyKGNvbHVtbiAtIDEpO1xuXHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uKTtcblx0XHR2aWV3TW9kZWwudHlwZShjaHIsICdrZXlib2FyZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlciksIGV4cGVjdGVkLCBtZXNzYWdlKTtcblx0XHRtb2RlbC51bmRvKCk7XG5cdH1cblxuXHR0ZXN0KCdpc3N1ZSBtaWNyb3NvZnQvbW9uYWNvLWVkaXRvciM0NDM6IEluZGVudGF0aW9uIG9mIGEgc2luZ2xlIHJvdyBkZWxldGVzIHNlbGVjdGVkIHRleHQgaW4gc29tZSBjYXNlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J0hlbGxvIHdvcmxkIScsXG5cdFx0XHRcdCdhbm90aGVyIGxpbmUnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdCk7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEzKV0pO1xuXG5cdFx0XHQvLyBDaGVjayB0aGF0IGluZGVudGluZyBtYWludGFpbnMgdGhlIHNlbGVjdGlvbiBzdGFydCBhdCBjb2x1bW4gMVxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTQpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQnVnIDkxMjE6IEF1dG8gaW5kZW50ICsgdW5kbyArIHJlZG8gaXMgZnVua3knLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0XHR0cmltQXV0b1doaXRlc3BhY2U6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcbicsICdhc3NlcnQxJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdCcsICdhc3NlcnQyJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdFxcblxcdCcsICdhc3NlcnQzJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd4Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHRcXG5cXHR4JywgJ2Fzc2VydDQnKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JMZWZ0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0XFxuXFx0eCcsICdhc3NlcnQ1Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHRcXG54JywgJ2Fzc2VydDYnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdHgnLCAnYXNzZXJ0NycpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxueCcsICdhc3NlcnQ4Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICd4JywgJ2Fzc2VydDknKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcbngnLCAnYXNzZXJ0MTAnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdFxcbngnLCAnYXNzZXJ0MTEnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdFxcblxcdHgnLCAnYXNzZXJ0MTInKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5SZWRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdFxcbngnLCAnYXNzZXJ0MTMnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5SZWRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcbngnLCAnYXNzZXJ0MTQnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5SZWRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ3gnLCAnYXNzZXJ0MTUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIzNTM5OiBTZXR0aW5nIG1vZGVsIEVPTCBpc25cXCd0IHVuZG9hYmxlJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnSGVsbG8nLFxuXHRcdFx0J3dvcmxkJ1xuXHRcdF0sIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdFx0bW9kZWwuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkxGKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnSGVsbG9cXG53b3JsZCcpO1xuXG5cdFx0XHRtb2RlbC5wdXNoRU9MKEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdIZWxsb1xcclxcbndvcmxkJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ0hlbGxvXFxud29ybGQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ3NzMzOiBVbmRvIG1hbmdsZXMgdW5pY29kZSBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAnbXlNb2RlJztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRzdXJyb3VuZGluZ1BhaXJzOiBbeyBvcGVuOiAnJScsIGNsb3NlOiAnJScgfV1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnXFwnXHVEODNEXHVEQzQxXFwnJywgbGFuZ3VhZ2VJZCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAyKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCclJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICclXFwnJVx1RDgzRFx1REM0MVxcJycsICdhc3NlcnQxJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXCdcdUQ4M0RcdURDNDFcXCcnLCAnYXNzZXJ0MicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDYyMDg6IEFsbG93IGVtcHR5IHNlbGVjdGlvbnMgaW4gdGhlIHVuZG8vcmVkbyBzdGFjaycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnJyk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdIZWxsbycsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyAnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCd3b3JsZCcsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyAnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hlbGxvIHdvcmxkICcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEzKSk7XG5cblx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cblx0XHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbXSwgW0VkaXRPcGVyYXRpb24ucmVwbGFjZU1vdmUobmV3IFJhbmdlKDEsIDEyLCAxLCAxMyksICcnKV0sICgpID0+IFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hlbGxvIHdvcmxkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTIpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hlbGxvIHdvcmxkICcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxMywgMSwgMTMpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hlbGxvIHdvcmxkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTIpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hlbGxvJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNikpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlJlZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSGVsbG8nKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA2KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdIZWxsbyB3b3JsZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEyKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdIZWxsbyB3b3JsZCAnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMykpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlJlZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSGVsbG8gd29ybGQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMikpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlJlZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSGVsbG8gd29ybGQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgIzE2ODE1OlNoaWZ0K1RhYiBkb2VzblxcJ3QgZ28gYmFjayB0byB0YWJzdG9wJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBzZXR1cE9uRW50ZXJMYW5ndWFnZShJbmRlbnRBY3Rpb24uSW5kZW50T3V0ZGVudCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgIGZ1bmN0aW9uIGJheigpIHsnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0bGFuZ3VhZ2VJZFxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuT3V0ZGVudCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgZnVuY3Rpb24gYmF6KCkgeycpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0J1ZyAjMTgyOTM6W3JlZ3Jlc3Npb25dW2VkaXRvcl0gQ2FuXFwndCBvdXRkZW50IHdoaXRlc3BhY2UgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyAgICAgICdcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDcsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNykpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLk91dGRlbnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgICcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5NTU5MTogVW5pbmRlbnRpbmcgbW92ZXMgY3Vyc29yIHRvIGJlZ2lubmluZyBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgICAgICAnXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyB1c2VUYWJTdG9wczogZmFsc2UgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDksIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgOSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLk91dGRlbnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgICcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0J1ZyAjMTY2NTc6IFtlZGl0b3JdIFRhYiBvbiBlbXB0eSBsaW5lIG9mIHplcm8gaW5kZW50YXRpb24gbW92ZXMgY3Vyc29yIHRvIHBvc2l0aW9uICgxLDEpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnZnVuY3Rpb24gYmF6KCkgeycsXG5cdFx0XHRcdCdcXHRmdW5jdGlvbiBoZWxsbygpIHsgLy8gc29tZXRoaW5nIGhlcmUnLFxuXHRcdFx0XHQnXFx0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdcXHR9Jyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA3LCAxLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDcsIDEsIDcsIDEpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDcpLCAnXFx0Jyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDcsIDIsIDcsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnICMxNjc0MDogW2VkaXRvcl0gQ3V0IGxpbmUgZG9lc25cXCd0IHF1aXRlIGN1dCB0aGUgbGFzdCBsaW5lJywgKCkgPT4ge1xuXG5cdFx0Ly8gUGFydCAxID0+IHRoZXJlIGlzIHRleHQgb24gdGhlIGxhc3QgbGluZVxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnYXNkYXNkJyxcblx0XHRcdCdxd2VydHknXG5cdFx0XSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cblx0XHRcdHZpZXdNb2RlbC5jdXQoJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvdW50KCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnYXNkYXNkJyk7XG5cblx0XHR9KTtcblxuXHRcdC8vIFBhcnQgMiA9PiB0aGVyZSBpcyBubyB0ZXh0IG9uIHRoZSBsYXN0IGxpbmVcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J2FzZGFzZCcsXG5cdFx0XHQnJ1xuXHRcdF0sIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwuY3V0KCdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2FzZGFzZCcpO1xuXG5cdFx0XHR2aWV3TW9kZWwuY3V0KCdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTI4NjAyOiBXaGVuIGN1dHRpbmcgbXVsdGlwbGUgbGluZXMgKGN0cmwgeCksIHRoZSBsYXN0IGxpbmUgd2lsbCBub3QgYmUgZXJhc2VkJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnYTEnLFxuXHRcdFx0J2EyJyxcblx0XHRcdCdhMydcblx0XHRdLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMywgMSksXG5cdFx0XHRdKTtcblxuXHRcdFx0dmlld01vZGVsLmN1dCgna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQnVnICMxMTQ3NjogRG91YmxlIGJyYWNrZXQgc3Vycm91bmRpbmcgKyB1bmRvIGlzIGJyb2tlbicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdoZWxsbydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBzdXJyb3VuZGluZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDMsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDUpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJygnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA3KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMDY3NzQ6IFN1cnJvdW5kU2VsZWN0aW9uQ29tbWFuZCB3aXRoIGVtcHR5IGNoYXJBZnRlclNlbGVjdGlvbiBzaG91bGQgbm90IHRocm93JywgKCkgPT4ge1xuXHRcdC8vIFRoaXMgdGVzdCByZXByb2R1Y2VzIHRoZSBpc3N1ZSB3aGVyZSBTdXJyb3VuZFNlbGVjdGlvbkNvbW1hbmQgdGhyb3dzIHdoZW4gY2hhckFmdGVyU2VsZWN0aW9uIGlzIGVtcHR5XG5cdFx0Ly8gVGhlIHByb2JsZW0gaXMgdGhhdCBhZGRUcmFja2VkRWRpdE9wZXJhdGlvbiBpZ25vcmVzIGVtcHR5IHN0cmluZ3MsIGNhdXNpbmcgY29tcHV0ZUN1cnNvclN0YXRlIHRvIGZhaWxcblx0XHQvLyB3aGVuIHRyeWluZyB0byBhY2Nlc3MgaW52ZXJzZUVkaXRPcGVyYXRpb25zWzFdLnJhbmdlICh3aGljaCBpcyB1bmRlZmluZWQpXG5cblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbXB0eUNsb3NpbmdTdXJyb3VuZExhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHQvLyBTZWxlY3QgXCJoZWxsb1wiXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNiwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDYpKTtcblxuXHRcdFx0Ly8gVHlwZSA8IHdoaWNoIHNob3VsZCBzdXJyb3VuZCB3aXRoICc8JyBhbmQgZW1wdHkgc3RyaW5nXG5cdFx0XHQvLyBUaGlzIHJlcHJvZHVjZXMgdGhlIGNyYXNoIHdoZXJlIGNoYXJBZnRlclNlbGVjdGlvbiBpcyBlbXB0eVxuXHRcdFx0dmlld01vZGVsLnR5cGUoJzwnLCAna2V5Ym9hcmQnKTtcblxuXHRcdFx0Ly8gVGVzdCBwYXNzZXMgaWYgd2UgZG9uJ3QgY3Jhc2ggLSB0aGUgZXhhY3QgY3Vyc29yIHBvc2l0aW9uIGRlcGVuZHMgb24gdGhlIGZpeFxuXHRcdFx0Ly8gVGhlIG1haW4gaXNzdWUgaXMgdGhhdCBjb21wdXRlQ3Vyc29yU3RhdGUgZmFpbHMgd2hlbiBjaGFyQWZ0ZXJTZWxlY3Rpb24gaXMgZW1wdHlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnPGhlbGxvIHdvcmxkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTQwOiBCYWNrc3BhY2Ugc3RvcHMgcHJlbWF0dXJlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdmdW5jdGlvbiBiYXooKSB7Jyxcblx0XHRcdFx0JyAgcmV0dXJuIDE7Jyxcblx0XHRcdFx0J307J1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMiwgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxNCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDIsIDEsIDE0KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDE0LCAxLCAxNCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2Z1bmN0aW9uIGJheig7Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMDIxMjogUGFzdGluZyBlbnRpcmUgbGluZSBkb2VzIG5vdCByZXBsYWNlIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdCdsaW5lMidcblx0XHRcdF0sXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxLCBmYWxzZSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDYsIHRydWUpO1xuXG5cdFx0XHR2aWV3TW9kZWwucGFzdGUoJ2xpbmUxXFxuJywgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2xpbmUxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdsaW5lMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3NDcyMjogUGFzdGluZyB3aG9sZSBsaW5lIGRvZXMgbm90IHJlcGxhY2Ugc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUgc2VsIDInLFxuXHRcdFx0XHQnbGluZTMnXG5cdFx0XHRdLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMiwgNiwgMiwgOSldKTtcblxuXHRcdFx0dmlld01vZGVsLnBhc3RlKCdsaW5lMVxcbicsIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdsaW5lMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnbGluZSBsaW5lMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnIDInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ2xpbmUzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0OTk2OiBNdWx0aXBsZSBjdXJzb3IgcGFzdGUgcGFzdGVzIGNvbnRlbnRzIG9mIGFsbCBjdXJzb3JzJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0J2xpbmUzJ1xuXHRcdFx0XSxcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpXSk7XG5cblx0XHRcdHZpZXdNb2RlbC5wYXN0ZShcblx0XHRcdFx0J2FcXG5iXFxuY1xcbmQnLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdhXFxuYicsXG5cdFx0XHRcdFx0J2NcXG5kJ1xuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnYScsXG5cdFx0XHRcdCdibGluZTEnLFxuXHRcdFx0XHQnYycsXG5cdFx0XHRcdCdkbGluZTInLFxuXHRcdFx0XHQnbGluZTMnXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2MTU1OiBQYXN0ZSBpbnRvIG11bHRpcGxlIGN1cnNvcnMgaGFzIGVkZ2UgY2FzZSB3aGVuIG51bWJlciBvZiBsaW5lcyBlcXVhbHMgbnVtYmVyIG9mIGN1cnNvcnMgLSAxJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3Rlc3QnLFxuXHRcdFx0XHQndGVzdCcsXG5cdFx0XHRcdCd0ZXN0Jyxcblx0XHRcdFx0J3Rlc3QnXG5cdFx0XHRdLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDUpLFxuXHRcdFx0XSk7XG5cblx0XHRcdHZpZXdNb2RlbC5wYXN0ZShcblx0XHRcdFx0J2FhYVxcbmJiYlxcbmNjY1xcbicsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRudWxsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnYWFhJyxcblx0XHRcdFx0J2JiYicsXG5cdFx0XHRcdCdjY2MnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J2FhYScsXG5cdFx0XHRcdCdiYmInLFxuXHRcdFx0XHQnY2NjJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdhYWEnLFxuXHRcdFx0XHQnYmJiJyxcblx0XHRcdFx0J2NjYycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnYWFhJyxcblx0XHRcdFx0J2JiYicsXG5cdFx0XHRcdCdjY2MnLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDM3MjI6IE11bHRpbGluZSBwYXN0ZSBkb2VzblxcJ3Qgd29yayBhbnltb3JlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3Rlc3QnLFxuXHRcdFx0XHQndGVzdCcsXG5cdFx0XHRcdCd0ZXN0Jyxcblx0XHRcdFx0J3Rlc3QnXG5cdFx0XHRdLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDUpLFxuXHRcdFx0XSk7XG5cblx0XHRcdHZpZXdNb2RlbC5wYXN0ZShcblx0XHRcdFx0J2FhYVxcclxcbmJiYlxcclxcbmNjY1xcclxcbmRkZFxcclxcbicsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRudWxsXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnYWFhJyxcblx0XHRcdFx0J2JiYicsXG5cdFx0XHRcdCdjY2MnLFxuXHRcdFx0XHQnZGRkJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDY0NDA6ICgxKSBQYXN0aW5nIGEgbXVsdGktbGluZSBzZWxlY3Rpb24gcGFzdGVzIGVudGlyZSBzZWxlY3Rpb24gaW50byBldmVyeSBpbnNlcnRpb24gcG9pbnQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnbGluZTEnLFxuXHRcdFx0XHQnbGluZTInLFxuXHRcdFx0XHQnbGluZTMnXG5cdFx0XHRdLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSksIG5ldyBTZWxlY3Rpb24oMywgMSwgMywgMSldKTtcblxuXHRcdFx0dmlld01vZGVsLnBhc3RlKFxuXHRcdFx0XHQnYVxcbmJcXG5jJyxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdG51bGxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdhbGluZTEnLFxuXHRcdFx0XHQnYmxpbmUyJyxcblx0XHRcdFx0J2NsaW5lMydcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDY0NDA6ICgyKSBQYXN0aW5nIGEgbXVsdGktbGluZSBzZWxlY3Rpb24gcGFzdGVzIGVudGlyZSBzZWxlY3Rpb24gaW50byBldmVyeSBpbnNlcnRpb24gcG9pbnQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnbGluZTEnLFxuXHRcdFx0XHQnbGluZTInLFxuXHRcdFx0XHQnbGluZTMnXG5cdFx0XHRdLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSksIG5ldyBTZWxlY3Rpb24oMywgMSwgMywgMSldKTtcblxuXHRcdFx0dmlld01vZGVsLnBhc3RlKFxuXHRcdFx0XHQnYVxcbmJcXG5jXFxuJyxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdG51bGxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdhbGluZTEnLFxuXHRcdFx0XHQnYmxpbmUyJyxcblx0XHRcdFx0J2NsaW5lMydcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjU2MDM5OiBwYXN0ZSBmcm9tIG11bHRpcGxlIGN1cnNvcnMgd2l0aCBlbXB0eSBzZWxlY3Rpb25zIGFuZCBtdWx0aUN1cnNvclBhc3RlIGZ1bGwnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnbGluZTEnLFxuXHRcdFx0XHQnbGluZTInLFxuXHRcdFx0XHQnbGluZTMnXG5cdFx0XHRdLFxuXHRcdFx0ZWRpdG9yT3B0czoge1xuXHRcdFx0XHRtdWx0aUN1cnNvclBhc3RlOiAnZnVsbCdcblx0XHRcdH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHQvLyAyIGN1cnNvcnMgb24gbGluZXMgMSBhbmQgMlxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKV0pO1xuXG5cdFx0XHR2aWV3TW9kZWwucGFzdGUoXG5cdFx0XHRcdCdsaW5lMVxcbmxpbmUyXFxuJyxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0WydsaW5lMVxcbicsICdsaW5lMlxcbiddXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBFYWNoIGN1cnNvciBnZXRzIGl0cyByZXNwZWN0aXZlIGxpbmVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdCdsaW5lMicsXG5cdFx0XHRcdCdsaW5lMicsXG5cdFx0XHRcdCdsaW5lMydcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzA3MTogSW52ZXN0aWdhdGUgd2h5IHVuZG8gc3RhY2sgZ2V0cyBjb3JydXB0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdzb21lIGxpbmVzJyxcblx0XHRcdFx0J2FuZCBtb3JlIGxpbmVzJyxcblx0XHRcdFx0J2p1c3Qgc29tZSB0ZXh0Jyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgNCwgdHJ1ZSk7XG5cblx0XHRcdGxldCBpc0ZpcnN0ID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNGaXJzdCkge1xuXHRcdFx0XHRcdGlzRmlyc3QgPSBmYWxzZTtcblx0XHRcdFx0XHR2aWV3TW9kZWwudHlwZSgnXFx0JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnXFx0IGp1c3Qgc29tZSB0ZXh0J1xuXHRcdFx0XS5qb2luKCdcXG4nKSwgJzAwMScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0JyAgICBzb21lIGxpbmVzJyxcblx0XHRcdFx0JyAgICBhbmQgbW9yZSBsaW5lcycsXG5cdFx0XHRcdCcgICAganVzdCBzb21lIHRleHQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJzAwMicpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J3NvbWUgbGluZXMnLFxuXHRcdFx0XHQnYW5kIG1vcmUgbGluZXMnLFxuXHRcdFx0XHQnanVzdCBzb21lIHRleHQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJzAwMycpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J3NvbWUgbGluZXMnLFxuXHRcdFx0XHQnYW5kIG1vcmUgbGluZXMnLFxuXHRcdFx0XHQnanVzdCBzb21lIHRleHQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJzAwNCcpO1xuXG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyOTUwOiBDYW5ub3QgRG91YmxlIENsaWNrIFRvIEluc2VydCBFbW9qaSBVc2luZyBPU1ggRW1vamkgUGFuZWwnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnc29tZSBsaW5lcycsXG5cdFx0XHRcdCdhbmQgbW9yZSBsaW5lcycsXG5cdFx0XHRcdCdqdXN0IHNvbWUgdGV4dCcsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogbnVsbFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMSwgZmFsc2UpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXHVEODNEXHVERTBEJywgJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdzb21lIGxpbmVzJyxcblx0XHRcdFx0J2FuZCBtb3JlIGxpbmVzJyxcblx0XHRcdFx0J1x1RDgzRFx1REUwRGp1c3Qgc29tZSB0ZXh0Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzQ2MzogcHJlc3NpbmcgdGFiIGFkZHMgc3BhY2VzLCBidXQgbm90IGFzIG1hbnkgYXMgZm9yIGEgdGFiJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnZnVuY3Rpb24gYSgpIHsnLFxuXHRcdFx0XHQnXFx0dmFyIGEgPSB7Jyxcblx0XHRcdFx0J1xcdFxcdHg6IDMnLFxuXHRcdFx0XHQnXFx0fTsnLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAyLCBmYWxzZSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICdcXHQgICAgXFx0eDogMycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDMxMjogdHJ5aW5nIHRvIHR5cGUgYSB0YWIgY2hhcmFjdGVyIG92ZXIgYSBzZXF1ZW5jZSBvZiBzcGFjZXMgcmVzdWx0cyBpbiB1bmV4cGVjdGVkIGJlaGF2aW91cicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J3ZhciBmb28gPSAxMjM7ICAgICAgIC8vIHRoaXMgaXMgYSBjb21tZW50Jyxcblx0XHRcdFx0J3ZhciBiYXIgPSA0OyAgICAgICAvLyBhbm90aGVyIGNvbW1lbnQnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMTUsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMjIsIHRydWUpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAndmFyIGZvbyA9IDEyMztcXHQvLyB0aGlzIGlzIGEgY29tbWVudCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODMyOiB3b3JkIHJpZ2h0JywgKCkgPT4ge1xuXG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICAgLyogSnVzdCBzb21lICAgbW9yZSAgIHRleHQgYSs9IDMgKzUtMyArIDcgKi8gICdcblx0XHRcdF0sXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxLCBmYWxzZSk7XG5cblx0XHRcdGZ1bmN0aW9uIGFzc2VydFdvcmRSaWdodChjb2w6IG51bWJlciwgZXhwZWN0ZWRDb2w6IG51bWJlcikge1xuXHRcdFx0XHRjb25zdCBhcmdzID0ge1xuXHRcdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0XHRsaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdFx0Y29sdW1uOiBjb2xcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChjb2wgPT09IDEpIHtcblx0XHRcdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCBhcmdzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3REcmFnLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgYXJncyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLnN0YXJ0Q29sdW1uLCAxLCAnVEVTVCBGT1IgJyArIGNvbCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCkuZW5kQ29sdW1uLCBleHBlY3RlZENvbCwgJ1RFU1QgRk9SICcgKyBjb2wpO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMSwgJyAgICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMiwgJyAgICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMywgJyAgICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNCwgJyAgICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNSwgJyAgIC8nLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDYsICcgICAvKicubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNywgJyAgIC8qICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoOCwgJyAgIC8qIEp1c3QnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDksICcgICAvKiBKdXN0Jy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgxMCwgJyAgIC8qIEp1c3QnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDExLCAnICAgLyogSnVzdCcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMTIsICcgICAvKiBKdXN0ICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMTMsICcgICAvKiBKdXN0IHNvbWUnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDE0LCAnICAgLyogSnVzdCBzb21lJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgxNSwgJyAgIC8qIEp1c3Qgc29tZScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMTYsICcgICAvKiBKdXN0IHNvbWUnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDE3LCAnICAgLyogSnVzdCBzb21lICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMTgsICcgICAvKiBKdXN0IHNvbWUgICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMTksICcgICAvKiBKdXN0IHNvbWUgICAnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDIwLCAnICAgLyogSnVzdCBzb21lICAgbW9yZScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMjEsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgyMiwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDIzLCAnICAgLyogSnVzdCBzb21lICAgbW9yZScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMjQsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMjUsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDI2LCAnICAgLyogSnVzdCBzb21lICAgbW9yZSAgICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMjcsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMjgsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMjksICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzAsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzEsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCAnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDMyLCAnICAgLyogSnVzdCBzb21lICAgbW9yZSAgIHRleHQgYScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzMsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKycubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzQsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0nLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDM1LCAnICAgLyogSnVzdCBzb21lICAgbW9yZSAgIHRleHQgYSs9ICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzYsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMycubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzcsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyAnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDM4LCAnICAgLyogSnVzdCBzb21lICAgbW9yZSAgIHRleHQgYSs9IDMgKycubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzksICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDAsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0nLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDQxLCAnICAgLyogSnVzdCBzb21lICAgbW9yZSAgIHRleHQgYSs9IDMgKzUtMycubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDIsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDMsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICsnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDQ0LCAnICAgLyogSnVzdCBzb21lICAgbW9yZSAgIHRleHQgYSs9IDMgKzUtMyArICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDUsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICsgNycubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDYsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICsgNyAnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDQ3LCAnICAgLyogSnVzdCBzb21lICAgbW9yZSAgIHRleHQgYSs9IDMgKzUtMyArIDcgKicubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDgsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICsgNyAqLycubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDksICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICsgNyAqLyAnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDUwLCAnICAgLyogSnVzdCBzb21lICAgbW9yZSAgIHRleHQgYSs9IDMgKzUtMyArIDcgKi8gICcubGVuZ3RoICsgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzMzc4ODogV3JvbmcgY3Vyc29yIHBvc2l0aW9uIHdoZW4gZG91YmxlIGNsaWNrIHRvIHNlbGVjdCBhIHdvcmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdKdXN0IHNvbWUgdGV4dCdcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgOCkgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCAxMCkpO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3REcmFnLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDgpIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgMTApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyODg3OiBEb3VibGUtY2xpY2sgaGlnaGxpZ2h0aW5nIHNlcGFyYXRpbmcgd2hpdGUgc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdhYmMgZGVmJ1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCA1KSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDgpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRG91YmxlLWNsaWNrIG9uIHB1bmN0dWF0aW9uIHNob3VsZCBzZWxlY3QgdGhlIGNoYXJhY3Rlciwgbm90IGFkamFjZW50IHNwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnLy8gYSBiIGMgMSAyIDMgfiAhIEAgIyAkICUgXiAmICogKCApIF8gKyBcXFxcIC8nXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Ly8gVGVzdCBkb3VibGUtY2xpY2sgb24gJ0AnIGF0IHBvc2l0aW9uIDIwXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMjApIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgMjAsIDEsIDIxKSwgJ1Nob3VsZCBzZWxlY3QgQCBjaGFyYWN0ZXInKTtcblxuXHRcdFx0Ly8gVGVzdCBkb3VibGUtY2xpY2sgb24gJyMnIGF0IHBvc2l0aW9uIDIyXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMjIpIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgMjIsIDEsIDIzKSwgJ1Nob3VsZCBzZWxlY3QgIyBjaGFyYWN0ZXInKTtcblxuXHRcdFx0Ly8gVGVzdCBkb3VibGUtY2xpY2sgb24gJyEnIGF0IHBvc2l0aW9uIDE4XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMTgpIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgMTgsIDEsIDE5KSwgJ1Nob3VsZCBzZWxlY3QgISBjaGFyYWN0ZXInKTtcblxuXHRcdFx0Ly8gVGVzdCBkb3VibGUtY2xpY2sgb24gZmlyc3QgJy8nIGluICcvLycgYXQgcG9zaXRpb24gMVxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Xb3JkU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDEpIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMyksICdTaG91bGQgc2VsZWN0IC8vIHRva2VuJyk7XG5cblx0XHRcdC8vIFRlc3QgZG91YmxlLWNsaWNrIG9uIHNlY29uZCAnLycgaW4gJy8vJyBhdCBwb3NpdGlvbiAyXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMikgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAzKSwgJ1Nob3VsZCBzZWxlY3QgLy8gdG9rZW4nKTtcblxuXHRcdFx0Ly8gVGVzdCBkb3VibGUtY2xpY2sgb24gJ1xcJyBhdCBwb3NpdGlvbiA0MlxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Xb3JkU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDQyKSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDQyLCAxLCA0MyksICdTaG91bGQgc2VsZWN0IFxcXFwgY2hhcmFjdGVyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5Njc1OiBVbmRvL1JlZG8gYWRkcyBhIHN0b3AgaW4gYmV0d2VlbiBDSE4gQ2hhcmFjdGVycycsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW10sIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0Ly8gVHlwaW5nIHNlbm5zZWkgaW4gSmFwYW5lc2UgLSBIaXJhZ2FuYVxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1x1RkY1MycsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXHUzMDVCJywgMSwgMCwgMCk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcdTMwNUJcdUZGNEUnLCAxLCAwLCAwKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1x1MzA1Qlx1MzA5MycsIDIsIDAsIDApO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXHUzMDVCXHUzMDkzXHVGRjUzJywgMiwgMCwgMCk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcdTMwNUJcdTMwOTNcdTMwNUInLCAzLCAwLCAwKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1x1MzA1Qlx1MzA5M1x1MzA1QicsIDMsIDAsIDApO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXHUzMDVCXHUzMDkzXHUzMDVCXHUzMDQ0JywgMywgMCwgMCk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcdTMwNUJcdTMwOTNcdTMwNUJcdTMwNDQnLCA0LCAwLCAwKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1x1MzA1Qlx1MzA5M1x1MzA1Qlx1MzA0NCcsIDQsIDAsIDApO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXHUzMDVCXHUzMDkzXHUzMDVCXHUzMDQ0JywgNCwgMCwgMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ1x1MzA1Qlx1MzA5M1x1MzA1Qlx1MzA0NCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDUpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJycpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIzOTgzOiBDYWxsaW5nIG1vZGVsLnNldEVPTCBkb2VzIG5vdCByZXNldCBjdXJzb3IgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnZmlyc3QgbGluZScsXG5cdFx0XHRcdCdzZWNvbmQgbGluZSdcblx0XHRcdF1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb2RlbC5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMildKTtcblx0XHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5MRik7XG5cblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjM5ODM6IENhbGxpbmcgbW9kZWwuc2V0VmFsdWUoKSByZXNldHMgY3Vyc29yIHBvc2l0aW9uJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2ZpcnN0IGxpbmUnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnXG5cdFx0XHRdXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW9kZWwuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpXSk7XG5cdFx0XHRtb2RlbC5zZXRWYWx1ZShbXG5cdFx0XHRcdCdkaWZmZXJlbnQgZmlyc3QgbGluZScsXG5cdFx0XHRcdCdkaWZmZXJlbnQgc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnbmV3IHRoaXJkIGxpbmUnXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzNjc0MDogd29yZHdyYXAgY3JlYXRlcyBhbiBleHRyYSBzdGVwIC8gY2hhcmFjdGVyIGF0IHRoZSB3cmFwcGluZyBwb2ludCcsICgpID0+IHtcblx0XHQvLyBhIHNpbmdsZSBtb2RlbCBsaW5lID0+IDQgdmlldyBsaW5lc1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHRbXG5cdFx0XHRcdCdMb3JlbSBpcHN1bSAnLFxuXHRcdFx0XHQnZG9sb3Igc2l0IGFtZXQgJyxcblx0XHRcdFx0J2NvbnNlY3RldHVyICcsXG5cdFx0XHRcdCdhZGlwaXNjaW5nIGVsaXQnLFxuXHRcdFx0XS5qb2luKCcnKVxuXHRcdF0sIHsgd29yZFdyYXA6ICd3b3JkV3JhcENvbHVtbicsIHdvcmRXcmFwQ29sdW1uOiAxNiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNywgMSwgNyldKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCkpO1xuXG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA5LCAxLCA5KSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxMCkpO1xuXG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgMTEpKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDEyKSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxMykpO1xuXG5cdFx0XHQvLyBtb3ZpbmcgdG8gdmlldyBsaW5lIDJcblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDE0LCAxLCAxNCkpO1xuXG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxMykpO1xuXG5cdFx0XHQvLyBtb3ZpbmcgYmFjayB0byB2aWV3IGxpbmUgMVxuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExMDM3NjogbXVsdGlwbGUgc2VsZWN0aW9ucyB3aXRoIHdvcmR3cmFwIGJlaGF2ZSBkaWZmZXJlbnRseScsICgpID0+IHtcblx0XHQvLyBhIHNpbmdsZSBtb2RlbCBsaW5lID0+IDQgdmlldyBsaW5lc1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHRbXG5cdFx0XHRcdCdqdXN0IGEgc2VudGVuY2UuIGp1c3QgYSAnLFxuXHRcdFx0XHQnc2VudGVuY2UuIGp1c3QgYSBzZW50ZW5jZS4nLFxuXHRcdFx0XS5qb2luKCcnKVxuXHRcdF0sIHsgd29yZFdyYXA6ICd3b3JkV3JhcENvbHVtbicsIHdvcmRXcmFwQ29sdW1uOiAyNSB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxOCwgMSwgMzMpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDM1LCAxLCA1MCksXG5cdFx0XHRdKTtcblxuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDE4LCAxLCAxOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMzUsIDEsIDM1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTgsIDEsIDMzKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzNSwgMSwgNTApLFxuXHRcdFx0XSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTYsIDEsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzMywgMSwgMzMpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDUwLCAxLCA1MCksXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzk4MzIwOiBNdWx0aS1DdXJzb3IsIFdyYXAgbGluZXMgYW5kIGN1cnNvclNlbGVjdFJpZ2h0ID09PiBjdXJzb3JzIG91dCBvZiBzeW5jJywgKCkgPT4ge1xuXHRcdC8vIGEgc2luZ2xlIG1vZGVsIGxpbmUgPT4gNCB2aWV3IGxpbmVzXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdFtcblx0XHRcdFx0J2xvcmVtX2lwc3VtLTE5OTN4MTF4MTMnLFxuXHRcdFx0XHQnZG9sb3Jfc2l0X2FtZXQtMTk5OHgwNHgyNycsXG5cdFx0XHRcdCdjb25zZWN0ZXR1ci0yMDA3eDEweDA4Jyxcblx0XHRcdFx0J2FkaXBpc2NpbmctMjAxMngwN3gyNycsXG5cdFx0XHRcdCdlbGl0LTIwMTV4MDJ4MjcnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdF0sIHsgd29yZFdyYXA6ICd3b3JkV3JhcENvbHVtbicsIHdvcmRXcmFwQ29sdW1uOiAxNiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxMyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTYsIDIsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxMywgMywgMTMpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEyLCA0LCAxMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNiwgNSwgNiksXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMywgMSwgMTMpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDE2LCAyLCAxNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMTMsIDMsIDEzKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxMiwgNCwgMTIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDYsIDUsIDYpLFxuXHRcdFx0XSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDE0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxNiwgMiwgMTcpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEzLCAzLCAxNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMTIsIDQsIDEzKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA2LCA1LCA3KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTYsIDIsIDE4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxMywgMywgMTUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEyLCA0LCAxNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNiwgNSwgOCksXG5cdFx0XHRdKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMywgMSwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDE2LCAyLCAxOSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMTMsIDMsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxMiwgNCwgMTUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDYsIDUsIDkpLFxuXHRcdFx0XSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDE3KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxNiwgMiwgMjApLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEzLCAzLCAxNyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMTIsIDQsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA2LCA1LCAxMCksXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQxNTczIC0gZGVsZXRlIGFjcm9zcyBtdWx0aXBsZSBsaW5lcyBkb2VzIG5vdCBzaHJpbmsgdGhlIHNlbGVjdGlvbiB3aGVuIHdvcmQgd3JhcHMnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdBdXRob3JpemF0aW9uOiBcXCdCZWFyZXIgcEhLUmZDVEZTbkd4czZha0tsYjlkZElYY2NhMHNJVVNaSnV0UEhZcXo3dkVlSGRNVE1oMFNHTjBJR1UzYTBuNTlEWGpUTFJzajVFSjJ1MzNxTE5JRmk5Zms1WEY4cEszOVBuZExZVVpoUHQ0UXZIR0xTY2dTa0swTDRnd3prek1sb1RRUHBLaHFpaWtpSU92eU5OU3BkMm84ajI5Tm5PbWRUVU9LaTlEVnQ3NFBEMm9oS3h5T3JXWjZvWnByVGtiM2VLYWpjcG5TMExBQktmYXcycm12NFxcJywnXG5cdFx0XS5qb2luKCdcXG4nKSwgeyB3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJywgd29yZFdyYXBDb2x1bW46IDEwMCB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNDMsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMTQ3LCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNDMsIDEsIDE0NykpO1xuXG5cdFx0XHRlZGl0b3IuZ2V0TW9kZWwoKS5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNDMpLFxuXHRcdFx0XHR0ZXh0OiAnJ1xuXHRcdFx0fV0pO1xuXG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEwNSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjI3MTc6IE1vdmluZyB0ZXh0IGN1cnNvciBjYXVzZSBhbiBpbmNvcnJlY3QgcG9zaXRpb24gaW4gQ2hpbmVzZScsICgpID0+IHtcblx0XHQvLyBhIHNpbmdsZSBtb2RlbCBsaW5lID0+IDQgdmlldyBsaW5lc1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHRbXG5cdFx0XHRcdCdcdTRFMDBcdTRFOENcdTRFMDlcdTU2REJcdTRFOTRcdTUxNkRcdTRFMDNcdTUxNkJcdTRFNURcdTUzNDEnLFxuXHRcdFx0XHQnMTIzNDU2Nzg5MDEyMzQ1Njc4OTAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdF0sIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSldKTtcblxuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA5LCAyLCA5KSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDEwLCAyLCAxMCkpO1xuXG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxMSwgMiwgMTEpKTtcblxuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTEyMzAxOiBuZXcgc3RpY2t5VGFiU3RvcHMgZmVhdHVyZSBpbnRlcmZlcmVzIHdpdGggd29yZCB3cmFwJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHRbXG5cdFx0XHRcdCdmdW5jdGlvbiBoZWxsbygpIHsnLFxuXHRcdFx0XHQnICAgICAgICBjb25zb2xlLmxvZyhgdGhpcyBpcyBhIGxvbmcgY29uc29sZSBtZXNzYWdlYCknLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0XSwgeyB3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJywgd29yZFdyYXBDb2x1bW46IDMyLCBzdGlja3lUYWJTdG9wczogdHJ1ZSB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDMxLCAyLCAzMSlcblx0XHRcdF0pO1xuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMzIpKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMzMpKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMzQpKTtcblxuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAzMykpO1xuXG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDMyKSk7XG5cblx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMzEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ0ODA1OiBTaG91bGQgbm90IGJlIGFibGUgdG8gdW5kbyBpbiByZWFkb25seSBlZGl0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcnXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyByZWFkT25seTogdHJ1ZSB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV0sIFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksXG5cdFx0XHRcdHRleHQ6ICdIZWxsbyB3b3JsZCEnXG5cdFx0XHR9XSwgKCkgPT4gW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ0hlbGxvIHdvcmxkIScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnSGVsbG8gd29ybGQhJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NjMxNDogVmlld01vZGVsIGlzIG91dCBvZiBzeW5jIHdpdGggTW9kZWwhJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnQgPSB7XG5cdFx0XHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IE51bGxTdGF0ZSxcblx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBJU3RhdGUpOiBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0ID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KG5ldyBVaW50MzJBcnJheSgwKSwgW10sIHN0YXRlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgTEFOR1VBR0VfSUQgPSAnbW9kZWxNb2RlVGVzdDEnO1xuXHRcdGNvbnN0IGxhbmd1YWdlUmVnaXN0cmF0aW9uID0gVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoTEFOR1VBR0VfSUQsIHRva2VuaXphdGlvblN1cHBvcnQpO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdKdXN0IHRleHQnLCBMQU5HVUFHRV9JRCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yMSwgY3Vyc29yMSkgPT4ge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvcjIsIGN1cnNvcjIpID0+IHtcblxuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gZWRpdG9yMS5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCgpID0+IHtcblx0XHRcdFx0XHRtb2RlbC50b2tlbml6YXRpb24udG9rZW5pemVJZkNoZWFwKDEpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICctJyB9XSk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGxhbmd1YWdlUmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzNzk2NzogcHJvYmxlbSByZXBsYWNpbmcgY29uc2VjdXRpdmUgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2NvbnN0IGEgPSBcImZvb1wiOycsXG5cdFx0XHRcdCdjb25zdCBiID0gXCJcIidcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IG11bHRpQ3Vyc29yTWVyZ2VPdmVybGFwcGluZzogZmFsc2UgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDEyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxNiwgMSwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEyLCAyLCAxMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTMsIDIsIDEzKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTEsIDEsIDExKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxNCwgMSwgMTQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDExLCAyLCAxMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTEsIDIsIDExKSxcblx0XHRcdF0pO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFwnJywgJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2NvbnN0IGEgPSBcXCdmb29cXCc7Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdjb25zdCBiID0gXFwnXFwnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNTc2MTogQ3Vyc29yIGRvZXNuXFwndCBtb3ZlIGluIGEgcmVkbyBvcGVyYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbydcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNClcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0JywgW3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSxcblx0XHRcdFx0dGV4dDogJyonLFxuXHRcdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiB0cnVlXG5cdFx0XHR9XSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlJlZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0Mjc4MzogQVBJIENhbGxzIHdpdGggVW5kbyBMZWF2ZSBDdXJzb3IgaW4gV3JvbmcgUG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdhYidcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSlcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0JywgW3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAzKSxcblx0XHRcdFx0dGV4dDogJydcblx0XHRcdH1dKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci5leGVjdXRlRWRpdHMoJ3Rlc3QnLCBbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDIpLFxuXHRcdFx0XHR0ZXh0OiAnJ1xuXHRcdFx0fV0pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4NTcxMjogUGFzdGUgbGluZSBtb3ZlcyBjdXJzb3IgdG8gc3RhcnQgb2YgY3VycmVudCBsaW5lIHJhdGhlciB0aGFuIHN0YXJ0IG9mIG5leHQgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2FiYzEyMycsXG5cdFx0XHRcdCcnXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpXG5cdFx0XHRdKTtcblx0XHRcdHZpZXdNb2RlbC5wYXN0ZSgnc29tZXRoaW5nXFxuJywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnYWJjMTIzJyxcblx0XHRcdFx0J3NvbWV0aGluZycsXG5cdFx0XHRcdCcnXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4NDg5NzogTGVmdCBkZWxldGUgYmVoYXZpb3IgaW4gc29tZSBsYW5ndWFnZXMgaXMgY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1x1MEUyQVx1MEUyN1x1MEUzMVx1MEUyQVx1MEUxNFx1MEUzNSdcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNylcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXHUwRTJBXHUwRTI3XHUwRTMxXHUwRTJBXHUwRTE0Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcdTBFMkFcdTBFMjdcdTBFMzFcdTBFMkEnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1x1MEUyQVx1MEUyN1x1MEUzMScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXHUwRTJBXHUwRTI3Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcdTBFMkEnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTIyOTE0OiBMZWZ0IGRlbGV0ZSBiZWhhdmlvciBpbiBzb21lIGxhbmd1YWdlcyBpcyBjaGFuZ2VkICh1c2VUYWJTdG9wczogZmFsc2UpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnXHUwRTJBXHUwRTI3XHUwRTMxXHUwRTJBXHUwRTE0XHUwRTM1J1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgdXNlVGFiU3RvcHM6IGZhbHNlIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDcpXG5cdFx0XHRdKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1x1MEUyQVx1MEUyN1x1MEUzMVx1MEUyQVx1MEUxNCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXHUwRTJBXHUwRTI3XHUwRTMxXHUwRTJBJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcdTBFMkFcdTBFMjdcdTBFMzEnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1x1MEUyQVx1MEUyNycpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXHUwRTJBJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzk5NjI5OiBFbW9qaSBtb2RpZmllcnMgaW4gdGV4dCB0cmVhdGVkIHNlcGFyYXRlbHkgd2hlbiB1c2luZyBiYWNrc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdcdUQ4M0RcdURDNzZcdUQ4M0NcdURGRkUnXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyB1c2VUYWJTdG9wczogZmFsc2UgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBsZW4gPSBtb2RlbC5nZXRWYWx1ZUxlbmd0aCgpO1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEgKyBsZW4sIDEsIDEgKyBsZW4pXG5cdFx0XHRdKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTk2Mjk6IEVtb2ppIG1vZGlmaWVycyBpbiB0ZXh0IHRyZWF0ZWQgc2VwYXJhdGVseSB3aGVuIHVzaW5nIGJhY2tzcGFjZSAoWldKIHNlcXVlbmNlKScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1x1RDgzRFx1REM2OFx1MjAwRFx1RDgzRFx1REM2OVx1RDgzQ1x1REZGRFx1MjAwRFx1RDgzRFx1REM2N1x1MjAwRFx1RDgzRFx1REM2Nidcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IHVzZVRhYlN0b3BzOiBmYWxzZSB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGxlbiA9IG1vZGVsLmdldFZhbHVlTGVuZ3RoKCk7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSArIGxlbiwgMSwgMSArIGxlbilcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXHVEODNEXHVEQzY4XHUyMDBEXHVEODNEXHVEQzY5XHVEODNDXHVERkZEXHUyMDBEXHVEODNEXHVEQzY3Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcdUQ4M0RcdURDNjhcdTIwMERcdUQ4M0RcdURDNjlcdUQ4M0NcdURGRkQnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1x1RDgzRFx1REM2OCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMDU3MzA6IG1vdmUgbGVmdCBiZWhhdmVzIGRpZmZlcmVudGx5IGZvciBtdWx0aXBsZSBjdXJzb3JzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdhc2RmZ2hqa2wsIGFzZGZnaGprbCwgYXNkZmdoamtsLCAnKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdG1vZGVsLFxuXHRcdFx0e1xuXHRcdFx0XHR3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJyxcblx0XHRcdFx0d29yZFdyYXBDb2x1bW46IDI0XG5cdFx0XHR9LFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTAsIDEsIDEyKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIxLCAxLCAyMyksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzMiwgMSwgMzQpXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTApLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMjEsIDEsIDIxKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMyLCAxLCAzMilcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTIpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMjEsIDEsIDIzKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMyLCAxLCAzNClcblx0XHRcdFx0XSk7XG5cdFx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTAsIDEsIDExKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIxLCAxLCAyMiksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzMiwgMSwgMzMpXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMDU3MzA6IG1vdmUgcmlnaHQgc2hvdWxkIGFsd2F5cyBza2lwIHdyYXAgcG9pbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FzZGZnaGprbCwgYXNkZmdoamtsLCBhc2RmZ2hqa2wsIFxcbmFzZGZnaGprbCwnKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdG1vZGVsLFxuXHRcdFx0e1xuXHRcdFx0XHR3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJyxcblx0XHRcdFx0d29yZFdyYXBDb2x1bW46IDI0XG5cdFx0XHR9LFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMjIsIDEsIDIyKVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyNCwgMSwgMjQpLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIyLCAxLCAyMilcblx0XHRcdFx0XSk7XG5cdFx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIyLCAxLCAyNCksXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjMxNzg6IHN0aWNreSB0YWIgaW4gY29uc2VjdXRpdmUgd3JhcHBlZCBsaW5lcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnICAgIGFhYWEgICAgICAgIGFhYWEnLCB1bmRlZmluZWQsIHsgdGFiU2l6ZTogNCB9KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdG1vZGVsLFxuXHRcdFx0e1xuXHRcdFx0XHR3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJyxcblx0XHRcdFx0d29yZFdyYXBDb2x1bW46IDgsXG5cdFx0XHRcdHN0aWNreVRhYlN0b3BzOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDkpXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTAsIDEsIDEwKSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgOSksXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0N1cnNvciBob25vcnMgaW5zZXJ0U3BhY2VzIGNvbmZpZ3VyYXRpb24gb24gbmV3IGxpbmUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICAgIFxcdE15IEZpcnN0IExpbmVcXHQgJyxcblx0XHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDIxKSwgc291cmNlOiAna2V5Ym9hcmQnIH0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgIFxcdE15IEZpcnN0IExpbmVcXHQgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgICAgICcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDdXJzb3IgaG9ub3JzIGluc2VydFNwYWNlcyBjb25maWd1cmF0aW9uIG9uIHRhYicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyAgICBcXHRNeSBGaXJzdCBMaW5lXFx0ICcsXG5cdFx0XHRcdCdNeSBTZWNvbmQgTGluZTEyMycsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdHRhYlNpemU6IDEzLFxuXHRcdFx0XHRpbmRlbnRTaXplOiAxMyxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHQvLyBUYWIgb24gY29sdW1uIDFcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDIsIDEpIH0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgICAgICAgICAgIE15IFNlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXG5cdFx0XHQvLyBUYWIgb24gY29sdW1uIDJcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ015IFNlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigyLCAyKSB9KTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ00gICAgICAgICAgICB5IFNlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXG5cdFx0XHQvLyBUYWIgb24gY29sdW1uIDNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ015IFNlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigyLCAzKSB9KTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ015ICAgICAgICAgICAgU2Vjb25kIExpbmUxMjMnKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cblx0XHRcdC8vIFRhYiBvbiBjb2x1bW4gNFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgU2Vjb25kIExpbmUxMjMnKTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDIsIDQpIH0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgICAgICAgICAgIFNlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXG5cdFx0XHQvLyBUYWIgb24gY29sdW1uIDVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ015IFNlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigyLCA1KSB9KTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ015IFMgICAgICAgICBlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXG5cdFx0XHQvLyBUYWIgb24gY29sdW1uIDVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ015IFNlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigyLCA1KSB9KTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ015IFMgICAgICAgICBlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXG5cdFx0XHQvLyBUYWIgb24gY29sdW1uIDEzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdNeSBTZWNvbmQgTGluZTEyMycpO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG8ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMiwgMTMpIH0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgU2Vjb25kIExpIG5lMTIzJyk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXG5cdFx0XHQvLyBUYWIgb24gY29sdW1uIDE0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdNeSBTZWNvbmQgTGluZTEyMycpO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG8ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMiwgMTQpIH0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgU2Vjb25kIExpbiAgICAgICAgICAgICBlMTIzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIGF1dG8taW5kZW50cyB3aXRoIGluc2VydFNwYWNlcyBzZXR0aW5nIDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHNldHVwT25FbnRlckxhbmd1YWdlKEluZGVudEFjdGlvbi5JbmRlbnQpO1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J1xcdGhlbGxvJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDcsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGKSwgJ1xcdGhlbGxvXFxyXFxuICAgICAgICAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgYXV0by1pbmRlbnRzIHdpdGggaW5zZXJ0U3BhY2VzIHNldHRpbmcgMicsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gc2V0dXBPbkVudGVyTGFuZ3VhZ2UoSW5kZW50QWN0aW9uLk5vbmUpO1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J1xcdGhlbGxvJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDcsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGKSwgJ1xcdGhlbGxvXFxyXFxuICAgICcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBhdXRvLWluZGVudHMgd2l0aCBpbnNlcnRTcGFjZXMgc2V0dGluZyAzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBzZXR1cE9uRW50ZXJMYW5ndWFnZShJbmRlbnRBY3Rpb24uSW5kZW50T3V0ZGVudCk7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnXFx0aGVsbCgpJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDcsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGKSwgJ1xcdGhlbGwoXFxyXFxuICAgICAgICBcXHJcXG4gICAgKScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTQ4MjU2OiBQcmVzc2luZyBFbnRlciBjcmVhdGVzIGxpbmUgd2l0aCBiYWQgaW5kZW50IHdpdGggaW5zZXJ0U3BhY2VzOiB0cnVlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgXFx0J1xuXHRcdFx0XSxcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDQsIGZhbHNlKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnICBcXHRcXG4gICAgJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNDgyNTY6IFByZXNzaW5nIEVudGVyIGNyZWF0ZXMgbGluZSB3aXRoIGJhZCBpbmRlbnQgd2l0aCBpbnNlcnRTcGFjZXM6IGZhbHNlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgXFx0J1xuXHRcdFx0XVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlXG5cdFx0XHR9KTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNCwgZmFsc2UpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcgIFxcdFxcblxcdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVBdXRvV2hpdGVzcGFjZSBvZmYnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICAgIHNvbWUgIGxpbmUgYWJjICAnXG5cdFx0XHRdLFxuXHRcdFx0bW9kZWxPcHRzOiB7XG5cdFx0XHRcdHRyaW1BdXRvV2hpdGVzcGFjZTogZmFsc2Vcblx0XHRcdH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdC8vIE1vdmUgY3Vyc29yIHRvIHRoZSBlbmQsIHZlcmlmeSB0aGF0IHdlIGRvIG5vdCB0cmltIHdoaXRlc3BhY2VzIGlmIGxpbmUgaGFzIHZhbHVlc1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCBtb2RlbC5nZXRMaW5lQ29udGVudCgxKS5sZW5ndGggKyAxKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICBzb21lICBsaW5lIGFiYyAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgJyk7XG5cblx0XHRcdC8vIFRyeSB0byBlbnRlciBhZ2Fpbiwgd2Ugc2hvdWxkIHRyaW1tZWQgcHJldmlvdXMgbGluZVxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgIHNvbWUgIGxpbmUgYWJjICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyAgICAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQXV0b1doaXRlc3BhY2Ugb246IHJlbW92ZXMgb25seSB3aGl0ZXNwYWNlIHRoZSBjdXJzb3IgYWRkZWQgMScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcgICAgJ1xuXHRcdFx0XVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgbW9kZWwuZ2V0TGluZUNvbnRlbnQoMSkubGVuZ3RoICsgMSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnICAgICcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE1MDMzOiBpbmRlbnQgYW5kIGFwcGVuZFRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdvbkVudGVyTW9kZSc7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwge1xuXHRcdFx0b25FbnRlclJ1bGVzOiBbe1xuXHRcdFx0XHRiZWZvcmVUZXh0OiAvLiovLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbi5JbmRlbnQsXG5cdFx0XHRcdFx0YXBwZW5kVGV4dDogJ3gnXG5cdFx0XHRcdH1cblx0XHRcdH1dXG5cdFx0fSkpO1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3RleHQnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogbGFuZ3VhZ2VJZCxcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd0ZXh0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgeCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDYpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzY4NjI6IEVkaXRvciByZW1vdmVzIGF1dG8gaW5zZXJ0ZWQgaW5kZW50YXRpb24gd2hlbiBmb3JtYXR0aW5nIG9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHNldHVwT25FbnRlckxhbmd1YWdlKEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KTtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdmdW5jdGlvbiBmb28gKHBhcmFtczogc3RyaW5nKSB7fSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBsYW5ndWFnZUlkLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAzMik7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdmdW5jdGlvbiBmb28gKHBhcmFtczogc3RyaW5nKSB7Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICd9Jyk7XG5cblx0XHRcdGNsYXNzIFRlc3RDb21tYW5kIGltcGxlbWVudHMgSUNvbW1hbmQge1xuXG5cdFx0XHRcdHByaXZhdGUgX3NlbGVjdGlvbklkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0XHRwdWJsaWMgZ2V0RWRpdE9wZXJhdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlcik6IHZvaWQge1xuXHRcdFx0XHRcdGJ1aWxkZXIuYWRkRWRpdE9wZXJhdGlvbihuZXcgUmFuZ2UoMSwgMTMsIDEsIDE0KSwgJycpO1xuXHRcdFx0XHRcdHRoaXMuX3NlbGVjdGlvbklkID0gYnVpbGRlci50cmFja1NlbGVjdGlvbih2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHVibGljIGNvbXB1dGVDdXJzb3JTdGF0ZShtb2RlbDogSVRleHRNb2RlbCwgaGVscGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEpOiBTZWxlY3Rpb24ge1xuXHRcdFx0XHRcdHJldHVybiBoZWxwZXIuZ2V0VHJhY2tlZFNlbGVjdGlvbih0aGlzLl9zZWxlY3Rpb25JZCEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH1cblxuXHRcdFx0dmlld01vZGVsLmV4ZWN1dGVDb21tYW5kKG5ldyBUZXN0Q29tbWFuZCgpLCAnYXV0b0Zvcm1hdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnZnVuY3Rpb24gZm9vKHBhcmFtczogc3RyaW5nKSB7Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICd9Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUF1dG9XaGl0ZXNwYWNlIG9uOiByZW1vdmVzIG9ubHkgd2hpdGVzcGFjZSB0aGUgY3Vyc29yIGFkZGVkIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICd0ZXN0TGFuZyc7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gbGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyAgICBpZiAoYSkgeycsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgICB9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGxhbmd1YWdlSWRcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgaWYgKGEpIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAgICAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcgICAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJyAgICB9Jyk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgMSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgaWYgKGEpIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAgICAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJyAgICB9Jyk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbig1KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnc29tZXRoaW5nJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgaWYgKGEpIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAgICAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnICAgIH1zb21ldGhpbmcnKTtcblx0XHR9KTtcblxuXHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUF1dG9XaGl0ZXNwYWNlIG9uOiB0ZXN0IDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgc29tZSAgbGluZSBhYmMgICdcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdC8vIE1vdmUgY3Vyc29yIHRvIHRoZSBlbmQsIHZlcmlmeSB0aGF0IHdlIGRvIG5vdCB0cmltIHdoaXRlc3BhY2VzIGlmIGxpbmUgaGFzIHZhbHVlc1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCBtb2RlbC5nZXRMaW5lQ29udGVudCgxKS5sZW5ndGggKyAxKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICBzb21lICBsaW5lIGFiYyAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgJyk7XG5cblx0XHRcdC8vIFRyeSB0byBlbnRlciBhZ2Fpbiwgd2Ugc2hvdWxkIHRyaW1tZWQgcHJldmlvdXMgbGluZVxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgIHNvbWUgIGxpbmUgYWJjICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnICAgICcpO1xuXG5cdFx0XHQvLyBNb3JlIHdoaXRlc3BhY2VzXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgc29tZSAgbGluZSBhYmMgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcgICAgICAgICcpO1xuXG5cdFx0XHQvLyBFbnRlciBhbmQgdmVyaWZ5IHRoYXQgdHJpbW1lZCBhZ2FpblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgIHNvbWUgIGxpbmUgYWJjICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcgICAgICAgICcpO1xuXG5cdFx0XHQvLyBUcmltbWVkIGlmIHdlIHdpbGwga2VlcCBvbmx5IHRleHRcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgc29tZSAgbGluZSBhYmMgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJycpO1xuXG5cdFx0XHQvLyBUcmltbWVkIGlmIHdlIHdpbGwga2VlcCBvbmx5IHRleHQgYnkgc2VsZWN0aW9uXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDUpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAxLCB0cnVlKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNTExODogcmVtb3ZlIGF1dG8gd2hpdGVzcGFjZSB3aGVuIHBhc3RpbmcgZW50aXJlIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgZnVuY3Rpb24gZigpIHsnLFxuXHRcdFx0XHQnICAgICAgICAvLyBJXFwnbSBnb25uYSBjb3B5IHRoaXMgbGluZScsXG5cdFx0XHRcdCcgICAgICAgIHJldHVybiAzOycsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4oMykpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnICAgIGZ1bmN0aW9uIGYoKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgLy8gSVxcJ20gZ29ubmEgY29weSB0aGlzIGxpbmUnLFxuXHRcdFx0XHQnICAgICAgICByZXR1cm4gMzsnLFxuXHRcdFx0XHQnICAgICAgICAnLFxuXHRcdFx0XHQnICAgIH0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNCwgbW9kZWwuZ2V0TGluZU1heENvbHVtbig0KSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwucGFzdGUoJyAgICAgICAgLy8gSVxcJ20gZ29ubmEgY29weSB0aGlzIGxpbmVcXG4nLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCcgICAgZnVuY3Rpb24gZigpIHsnLFxuXHRcdFx0XHQnICAgICAgICAvLyBJXFwnbSBnb25uYSBjb3B5IHRoaXMgbGluZScsXG5cdFx0XHRcdCcgICAgICAgIHJldHVybiAzOycsXG5cdFx0XHRcdCcgICAgICAgIC8vIElcXCdtIGdvbm5hIGNvcHkgdGhpcyBsaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0MDY5NTogbWFpbnRhaW4gY3Vyc29yIHBvc2l0aW9uIHdoZW4gY29weWluZyBsaW5lcyB1c2luZyBjdHJsK2MsIGN0cmwrdicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyAgICBmdW5jdGlvbiBmKCkgeycsXG5cdFx0XHRcdCcgICAgICAgIC8vIElcXCdtIGdvbm5hIGNvcHkgdGhpcyBsaW5lJyxcblx0XHRcdFx0JyAgICAgICAgLy8gQW5vdGhlciBsaW5lJyxcblx0XHRcdFx0JyAgICAgICAgcmV0dXJuIDM7Jyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDQsIDEwLCA0LCAxMCldKTtcblx0XHRcdHZpZXdNb2RlbC5wYXN0ZSgnICAgICAgICAvLyBJXFwnbSBnb25uYSBjb3B5IHRoaXMgbGluZVxcbicsIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnICAgIGZ1bmN0aW9uIGYoKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgLy8gSVxcJ20gZ29ubmEgY29weSB0aGlzIGxpbmUnLFxuXHRcdFx0XHQnICAgICAgICAvLyBBbm90aGVyIGxpbmUnLFxuXHRcdFx0XHQnICAgICAgICAvLyBJXFwnbSBnb25uYSBjb3B5IHRoaXMgbGluZScsXG5cdFx0XHRcdCcgICAgICAgIHJldHVybiAzOycsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCAxMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdVc2VUYWJTdG9wcyBpcyBvZmYnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgeCcsXG5cdFx0XHRcdCcgICAgICAgIGEgICAgJyxcblx0XHRcdFx0JyAgICAnXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyB1c2VUYWJTdG9wczogZmFsc2UgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHQvLyBEZWxldGVMZWZ0IHJlbW92ZXMganVzdCBvbmUgd2hpdGVzcGFjZVxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCA5KTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgICAgYSAgICAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQmFja3NwYWNlIHJlbW92ZXMgd2hpdGVzcGFjZXMgd2l0aCB0YWIgc2l6ZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyBcXHQgXFx0ICAgICB4Jyxcblx0XHRcdFx0JyAgICAgICAgYSAgICAnLFxuXHRcdFx0XHQnICAgICdcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IHVzZVRhYlN0b3BzOiB0cnVlIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Ly8gRGVsZXRlTGVmdCBkb2VzIG5vdCByZW1vdmUgdGFiIHNpemUsIGJlY2F1c2Ugc29tZSB0ZXh0IGV4aXN0cyBiZWZvcmVcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgbW9kZWwuZ2V0TGluZUNvbnRlbnQoMikubGVuZ3RoICsgMSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgICAgICBhICAgJyk7XG5cblx0XHRcdC8vIERlbGV0ZUxlZnQgcmVtb3ZlcyB0YWIgc2l6ZSA9IDRcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgOSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgIGEgICAnKTtcblxuXHRcdFx0Ly8gRGVsZXRlTGVmdCByZW1vdmVzIHRhYiBzaXplID0gNFxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ2EgICAnKTtcblxuXHRcdFx0Ly8gVW5kbyBEZWxldGVMZWZ0IC0gZ2V0IHVzIGJhY2sgdG8gb3JpZ2luYWwgaW5kZW50YXRpb25cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgICAgIGEgICAnKTtcblxuXHRcdFx0Ly8gTm90aGluZyBpcyBicm9rZW4gd2hlbiBjdXJzb3IgaXMgaW4gKDEsMSlcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnIFxcdCBcXHQgICAgIHgnKTtcblxuXHRcdFx0Ly8gRGVsZXRlTGVmdCBzdG9wcyBhdCB0YWIgc3RvcHMgZXZlbiBpbiBtaXhlZCB3aGl0ZXNwYWNlIGNhc2Vcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMTApO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyBcXHQgXFx0ICAgIHgnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyBcXHQgXFx0eCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnIFxcdHgnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3gnKTtcblxuXHRcdFx0Ly8gRGVsZXRlTGVmdCBvbiBsYXN0IGxpbmVcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgbW9kZWwuZ2V0TGluZUNvbnRlbnQoMykubGVuZ3RoICsgMSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnJyk7XG5cblx0XHRcdC8vIERlbGV0ZUxlZnQgd2l0aCByZW1vdmluZyBuZXcgbGluZSBzeW1ib2xcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICd4XFxuICAgICAgICBhICAgJyk7XG5cblx0XHRcdC8vIEluIGNhc2Ugb2Ygc2VsZWN0aW9uIERlbGV0ZUxlZnQgb25seSBkZWxldGVzIHNlbGVjdGVkIHRleHRcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMyk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDQsIHRydWUpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAgICBhICAgJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1BSICM1NDIzOiBBdXRvIGluZGVudCArIHVuZG8gKyByZWRvIGlzIGZ1bmt5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG4nLCAnYXNzZXJ0MScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHQnLCAnYXNzZXJ0MicpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgneScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0eScsICdhc3NlcnQyJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdHlcXG5cXHQnLCAnYXNzZXJ0MycpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgneCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0eVxcblxcdHgnLCAnYXNzZXJ0NCcpO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckxlZnQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHR5XFxuXFx0eCcsICdhc3NlcnQ1Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHR5XFxueCcsICdhc3NlcnQ2Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHR5eCcsICdhc3NlcnQ3Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHR4JywgJ2Fzc2VydDgnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcbngnLCAnYXNzZXJ0OScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAneCcsICdhc3NlcnQxMCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxueCcsICdhc3NlcnQxMScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0eVxcbngnLCAnYXNzZXJ0MTInKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdHlcXG5cXHR4JywgJ2Fzc2VydDEzJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHR5XFxueCcsICdhc3NlcnQxNCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlJlZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxueCcsICdhc3NlcnQxNScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlJlZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAneCcsICdhc3NlcnQxNicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTA5NzM6IFVuZG8gYnJpbmdzIGJhY2sgbW9kZWwgYWx0ZXJuYXRpdmUgdmVyc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0Jydcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgYmVmb3JlVmVyc2lvbiA9IG1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdFx0Y29uc3QgYmVmb3JlQWx0VmVyc2lvbiA9IG1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnSGVsbG8nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRjb25zdCBhZnRlclZlcnNpb24gPSBtb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHRcdGNvbnN0IGFmdGVyQWx0VmVyc2lvbiA9IG1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCk7XG5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChiZWZvcmVWZXJzaW9uLCBhZnRlclZlcnNpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlZm9yZUFsdFZlcnNpb24sIGFmdGVyQWx0VmVyc2lvbik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIGhvbm9ycyBpbmNyZWFzZUluZGVudFBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfSxcblx0XHRcdGVkaXRvck9wdHM6IHsgYXV0b0luZGVudDogJ2Z1bGwnIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEyLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCAxMikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMTMsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMTMsIDMsIDEzKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMywgNCwgMykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUeXBlIGhvbm9ycyBkZWNyZWFzZUluZGVudFBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHsgYXV0b0luZGVudDogJ2Z1bGwnIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDIsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnfScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICd9JywgJzAwMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBob25vcnMgdW5JbmRlbnRlZExpbmVQYXR0ZXJuJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdFxcdFxcdHJldHVybiB0cnVlJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdG1vZGVsT3B0czogeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH0sXG5cdFx0XHRlZGl0b3JPcHRzOiB7IGF1dG9JbmRlbnQ6ICdmdWxsJyB9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxNSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxNSwgMiwgMTUpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAyLCAzLCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIGhvbm9ycyBpbmRlbnROZXh0TGluZVBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpJyxcblx0XHRcdFx0J1xcdHJldHVybiB0cnVlOycsXG5cdFx0XHRcdCdpZiAodHJ1ZSknLFxuXHRcdFx0XHQnXFx0XFx0XFx0XFx0cmV0dXJuIHRydWUnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfSxcblx0XHRcdGVkaXRvck9wdHM6IHsgYXV0b0luZGVudDogJ2Z1bGwnIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDE0LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDE0LCAyLCAxNCkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxKSk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNSwgMTYsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNSwgMTYsIDUsIDE2KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNiwgMiwgNiwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBob25vcnMgaW5kZW50TmV4dExpbmVQYXR0ZXJuIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdpZiAodHJ1ZSknLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJyB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMTEsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMTEsIDIsIDExKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDMsIDMsIDMpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2NvbnNvbGUubG9nKCk7JywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgaG9ub3JzIGludGVudGlhbCBpbmRlbnQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQncmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0J319J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHsgYXV0b0luZGVudDogJ2Z1bGwnIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDEzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDEzLCAzLCAxMykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ3JldHVybiB0cnVlOycsICcwMDEnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgc3VwcG9ydHMgc2VsZWN0aW9uIDEnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0cmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0J1xcdH1hfSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHRtb2RlbE9wdHM6IHsgaW5zZXJ0U3BhY2VzOiBmYWxzZSB9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCAzLCBmYWxzZSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAzLCA0LCA0KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNSwgMSwgNSwgMSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnXFx0fScsICcwMDEnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgc3VwcG9ydHMgc2VsZWN0aW9uIDInLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMTIsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMTMsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxMiwgMiwgMTMpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAzLCAzLCAzKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMywgNCwgMykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBob25vcnMgdGFiU2l6ZSBhbmQgaW5zZXJ0U3BhY2VzIDEnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMTIsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDEyKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSkpO1xuXG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDEzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDEzLCAzLCAxMykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDksIDQsIDkpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgaG9ub3JzIHRhYlNpemUgYW5kIGluc2VydFNwYWNlcyAyJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdFx0JyAgICBpZiAodHJ1ZSkgeydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxMiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSkpO1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDE2LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDE2LCAzLCAxNikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcgICAgaWYgKHRydWUpIHsnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgOSwgNCwgOSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBob25vcnMgdGFiU2l6ZSBhbmQgaW5zZXJ0U3BhY2VzIDMnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICAgIGlmICh0cnVlKSB7J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdG1vZGVsT3B0czogeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEyLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCAxMikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMTYsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMTYsIDMsIDE2KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyAgICBpZiAodHJ1ZSkgeycpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAzLCA0LCAzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIHN1cHBvcnRzIGludGVudGlvbmFsIGluZGVudGF0aW9uJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J1xcdGlmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdFxcdHN3aXRjaCh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdFxcdFxcdGNhc2UgdHJ1ZTonLFxuXHRcdFx0XHQnXFx0XFx0XFx0XFx0YnJlYWs7Jyxcblx0XHRcdFx0J1xcdFxcdH0nLFxuXHRcdFx0XHQnXFx0fSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHRtb2RlbE9wdHM6IHsgaW5zZXJ0U3BhY2VzOiBmYWxzZSB9LFxuXHRcdFx0ZWRpdG9yT3B0czogeyBhdXRvSW5kZW50OiAnZnVsbCcgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNSwgNCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig1LCA0LCA1LCA0KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJ1xcdFxcdH0nKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNiwgMywgNiwgMykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBzaG91bGQgbm90IGFkanVzdCBjdXJzb3IgcG9zaXRpb24gd2hlbiBwcmVzcyBlbnRlciBpbiB0aGUgbWlkZGxlIG9mIGEgbGluZSAxJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdGlmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdFxcdHJldHVybiB0cnVlOycsXG5cdFx0XHRcdCdcXHR9YX0nXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCA5LCAzLCA5KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMywgNCwgMykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnXFx0XFx0IHRydWU7JywgJzAwMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBzaG91bGQgbm90IGFkanVzdCBjdXJzb3IgcG9zaXRpb24gd2hlbiBwcmVzcyBlbnRlciBpbiB0aGUgbWlkZGxlIG9mIGEgbGluZSAyJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdGlmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdFxcdHJldHVybiB0cnVlOycsXG5cdFx0XHRcdCdcXHR9YX0nXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAzLCAzLCAzKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMywgNCwgMykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnXFx0XFx0cmV0dXJuIHRydWU7JywgJzAwMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBzaG91bGQgbm90IGFkanVzdCBjdXJzb3IgcG9zaXRpb24gd2hlbiBwcmVzcyBlbnRlciBpbiB0aGUgbWlkZGxlIG9mIGEgbGluZSAzJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdFx0JyAgaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICAgIHJldHVybiB0cnVlOycsXG5cdFx0XHRcdCcgIH1hfSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDExLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDExLCAzLCAxMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDUsIDQsIDUpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJyAgICAgdHJ1ZTsnLCAnMDAxJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIHNob3VsZCBhZGp1c3QgY3Vyc29yIHBvc2l0aW9uIHdoZW4gcHJlc3MgZW50ZXIgaW4gdGhlIG1pZGRsZSBvZiBsZWFkaW5nIHdoaXRlc3BhY2VzIDEnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0cmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0J1xcdH1hfSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHRtb2RlbE9wdHM6IHsgaW5zZXJ0U3BhY2VzOiBmYWxzZSB9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAyLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDIsIDMsIDIpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAyLCA0LCAyKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRcXHRyZXR1cm4gdHJ1ZTsnLCAnMDAxJyk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgMSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAxLCA0LCAxKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNSwgMSwgNSwgMSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnXFx0XFx0cmV0dXJuIHRydWU7JywgJzAwMicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBzaG91bGQgYWRqdXN0IGN1cnNvciBwb3NpdGlvbiB3aGVuIHByZXNzIGVudGVyIGluIHRoZSBtaWRkbGUgb2YgbGVhZGluZyB3aGl0ZXNwYWNlcyAyJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J1xcdGlmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdFxcdGlmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdCAgICBcXHRyZXR1cm4gdHJ1ZTsnLFxuXHRcdFx0XHQnXFx0XFx0fWF9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdG1vZGVsT3B0czogeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDQsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgNCwgMywgNCkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDMsIDQsIDMpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1xcdFxcdFxcdHJldHVybiB0cnVlOycsICcwMDEnKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCAxLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICdcXHRcXHRcXHRyZXR1cm4gdHJ1ZTsnLCAnMDAyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIHNob3VsZCBhZGp1c3QgY3Vyc29yIHBvc2l0aW9uIHdoZW4gcHJlc3MgZW50ZXIgaW4gdGhlIG1pZGRsZSBvZiBsZWFkaW5nIHdoaXRlc3BhY2VzIDMnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICBpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCcgICAgcmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0J31hfSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDIsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMiwgMywgMikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDIsIDQsIDIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJyAgICByZXR1cm4gdHJ1ZTsnLCAnMDAxJyk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgMywgZmFsc2UpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig1LCAzLCA1LCAzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICcgICAgcmV0dXJuIHRydWU7JywgJzAwMicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBzaG91bGQgYWRqdXN0IGN1cnNvciBwb3NpdGlvbiB3aGVuIHByZXNzIGVudGVyIGluIHRoZSBtaWRkbGUgb2YgbGVhZGluZyB3aGl0ZXNwYWNlcyA0JywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdFx0JyAgaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0ICByZXR1cm4gdHJ1ZTsnLFxuXHRcdFx0XHQnfWF9Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCcgIGlmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdCAgcmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0J31hfSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHRtb2RlbE9wdHM6IHtcblx0XHRcdFx0dGFiU2l6ZTogMixcblx0XHRcdFx0aW5kZW50U2l6ZTogMlxuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAzLCAzLCAzKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgNCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnICAgIHJldHVybiB0cnVlOycsICcwMDEnKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA5LCA0LCBmYWxzZSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEwLCA1LCAxMCwgNSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEwKSwgJyAgICByZXR1cm4gdHJ1ZTsnLCAnMDAxJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIHNob3VsZCBhZGp1c3QgY3Vyc29yIHBvc2l0aW9uIHdoZW4gcHJlc3MgZW50ZXIgaW4gdGhlIG1pZGRsZSBvZiBsZWFkaW5nIHdoaXRlc3BhY2VzIDUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICBpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCcgICAgcmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0JyAgICByZXR1cm4gdHJ1ZTsnLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdG1vZGVsT3B0czogeyB0YWJTaXplOiAyIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDUsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgMywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDUsIDQsIDMpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAzLCA0LCAzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcgICAgcmV0dXJuIHRydWU7JywgJzAwMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSBtaWNyb3NvZnQvbW9uYWNvLWVkaXRvciMxMDggcGFydCAxLzI6IEF1dG8gaW5kZW50YXRpb24gb24gRW50ZXIgd2l0aCBzZWxlY3Rpb24gaXMgaGFsZiBicm9rZW4nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnZnVuY3Rpb24gYmF6KCkgeycsXG5cdFx0XHRcdCdcXHR2YXIgeCA9IDE7Jyxcblx0XHRcdFx0J1xcdFxcdFxcdFxcdFxcdFxcdFxcdHJldHVybiB4OycsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XSxcblx0XHRcdG1vZGVsT3B0czoge1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDgsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMTIsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCA4LCAyLCAxMikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICdcXHRyZXR1cm4geDsnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlIG1pY3Jvc29mdC9tb25hY28tZWRpdG9yIzEwOCBwYXJ0IDIvMjogQXV0byBpbmRlbnRhdGlvbiBvbiBFbnRlciB3aXRoIHNlbGVjdGlvbiBpcyBoYWxmIGJyb2tlbicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdmdW5jdGlvbiBiYXooKSB7Jyxcblx0XHRcdFx0J1xcdHZhciB4ID0gMTsnLFxuXHRcdFx0XHQnXFx0XFx0XFx0XFx0XFx0XFx0XFx0cmV0dXJuIHg7Jyxcblx0XHRcdFx0J30nXG5cdFx0XHRdLFxuXHRcdFx0bW9kZWxPcHRzOiB7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMTIsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDEyLCAzLCA4KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ1xcdHJldHVybiB4OycpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb25FbnRlciB3b3JrcyBpZiB0aGVyZSBhcmUgbm8gaW5kZW50YXRpb24gcnVsZXMnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnPD8nLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0ZWNobyAkaGk7Jyxcblx0XHRcdFx0J1xcdFxcdGVjaG8gJGJ5ZTsnLFxuXHRcdFx0XHQnXFx0fScsXG5cdFx0XHRcdCc/Pidcblx0XHRcdF0sXG5cdFx0XHRtb2RlbE9wdHM6IHsgaW5zZXJ0U3BhY2VzOiBmYWxzZSB9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA1LCAzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDUsIDMsIDUsIDMpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDYpLCAnXFx0Jyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDYsIDIsIDYsIDIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJ1xcdH0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb25FbnRlciB3b3JrcyBpZiB0aGVyZSBhcmUgbm8gaW5kZW50YXRpb24gcnVsZXMgMicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdcdGlmICg1KScsXG5cdFx0XHRcdCdcdFx0cmV0dXJuIDU7Jyxcblx0XHRcdFx0J1x0J1xuXHRcdFx0XSxcblx0XHRcdG1vZGVsT3B0czogeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDIsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMiwgMywgMikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDIsIDQsIDIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1xcdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgIzE2NTQzOiBUYWIgc2hvdWxkIGluZGVudCB0byBjb3JyZWN0IGluZGVudGF0aW9uIHNwb3QgaW1tZWRpYXRlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdmdW5jdGlvbiBiYXooKSB7Jyxcblx0XHRcdFx0J1xcdGZ1bmN0aW9uIGhlbGxvKCkgeyAvLyBzb21ldGhpbmcgaGVyZScsXG5cdFx0XHRcdCdcXHQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1xcdH0nLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHRpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCAxLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDEpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnXFx0XFx0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnYnVnICMyOTM4ICgxKTogV2hlbiBwcmVzc2luZyBUYWIgb24gd2hpdGUtc3BhY2Ugb25seSBsaW5lcywgaW5kZW50IHN0cmFpZ2h0IHRvIHRoZSByaWdodCBzcG90IChzaW1pbGFyIHRvIGVtcHR5IGxpbmVzKScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1xcdGZ1bmN0aW9uIGJheigpIHsnLFxuXHRcdFx0XHQnXFx0XFx0ZnVuY3Rpb24gaGVsbG8oKSB7IC8vIHNvbWV0aGluZyBoZXJlJyxcblx0XHRcdFx0J1xcdFxcdCcsXG5cdFx0XHRcdCdcXHQnLFxuXHRcdFx0XHQnXFx0XFx0fScsXG5cdFx0XHRcdCdcXHR9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDIsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMiwgNCwgMikpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRcXHRcXHQnKTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdidWcgIzI5MzggKDIpOiBXaGVuIHByZXNzaW5nIFRhYiBvbiB3aGl0ZS1zcGFjZSBvbmx5IGxpbmVzLCBpbmRlbnQgc3RyYWlnaHQgdG8gdGhlIHJpZ2h0IHNwb3QgKHNpbWlsYXIgdG8gZW1wdHkgbGluZXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0ZnVuY3Rpb24gYmF6KCkgeycsXG5cdFx0XHRcdCdcXHRcXHRmdW5jdGlvbiBoZWxsbygpIHsgLy8gc29tZXRoaW5nIGhlcmUnLFxuXHRcdFx0XHQnXFx0XFx0Jyxcblx0XHRcdFx0JyAgICAnLFxuXHRcdFx0XHQnXFx0XFx0fScsXG5cdFx0XHRcdCdcXHR9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDEsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgMSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRcXHRcXHQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnICMyOTM4ICgzKTogV2hlbiBwcmVzc2luZyBUYWIgb24gd2hpdGUtc3BhY2Ugb25seSBsaW5lcywgaW5kZW50IHN0cmFpZ2h0IHRvIHRoZSByaWdodCBzcG90IChzaW1pbGFyIHRvIGVtcHR5IGxpbmVzKScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1xcdGZ1bmN0aW9uIGJheigpIHsnLFxuXHRcdFx0XHQnXFx0XFx0ZnVuY3Rpb24gaGVsbG8oKSB7IC8vIHNvbWV0aGluZyBoZXJlJyxcblx0XHRcdFx0J1xcdFxcdCcsXG5cdFx0XHRcdCdcXHRcXHRcXHQnLFxuXHRcdFx0XHQnXFx0XFx0fScsXG5cdFx0XHRcdCdcXHR9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDMsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMywgNCwgMykpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRcXHRcXHRcXHQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnICMyOTM4ICg0KTogV2hlbiBwcmVzc2luZyBUYWIgb24gd2hpdGUtc3BhY2Ugb25seSBsaW5lcywgaW5kZW50IHN0cmFpZ2h0IHRvIHRoZSByaWdodCBzcG90IChzaW1pbGFyIHRvIGVtcHR5IGxpbmVzKScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1xcdGZ1bmN0aW9uIGJheigpIHsnLFxuXHRcdFx0XHQnXFx0XFx0ZnVuY3Rpb24gaGVsbG8oKSB7IC8vIHNvbWV0aGluZyBoZXJlJyxcblx0XHRcdFx0J1xcdFxcdCcsXG5cdFx0XHRcdCdcXHRcXHRcXHRcXHQnLFxuXHRcdFx0XHQnXFx0XFx0fScsXG5cdFx0XHRcdCdcXHR9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDQsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgNCkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRcXHRcXHRcXHRcXHQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnICMzMTAxNTogV2hlbiBwcmVzc2luZyBUYWIgb24gbGluZXMgYW5kIEVudGVyIHJ1bGVzIGFyZSBhdmFpbCwgaW5kZW50IHN0cmFpZ2h0IHRvIHRoZSByaWdodCBzcG90VGFiJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9uRW50ZXJMYW5ndWFnZUlkID0gc2V0dXBPbkVudGVyTGFuZ3VhZ2UoSW5kZW50QWN0aW9uLkluZGVudCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgaWYgKGEpIHsnLFxuXHRcdFx0XHQnICAgICAgICAnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgICAgfSdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHRvbkVudGVyTGFuZ3VhZ2VJZFxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAxKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICBpZiAoYSkgeycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgICAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyAgICAgICAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJyAgICB9Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R5cGUgaG9ub3JzIGluZGVudGF0aW9uIHJ1bGVzOiBydWJ5IGtleXdvcmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJ1YnlMYW5ndWFnZUlkID0gc2V0dXBJbmRlbnRSdWxlc0xhbmd1YWdlKCdydWJ5Jywge1xuXHRcdFx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXlxccyooKGJlZ2lufGNsYXNzfGRlZnxlbHNlfGVsc2lmfGVuc3VyZXxmb3J8aWZ8bW9kdWxlfHJlc2N1ZXx1bmxlc3N8dW50aWx8d2hlbnx3aGlsZSl8KC4qXFxzZG9cXGIpKVxcYlteXFx7O10qJC8sXG5cdFx0XHRkZWNyZWFzZUluZGVudFBhdHRlcm46IC9eXFxzKihbfVxcXV0oWywpXT9cXHMqKCN8JCl8XFwuW2EtekEtWl9dXFx3KlxcYil8KGVuZHxyZXNjdWV8ZW5zdXJlfGVsc2V8ZWxzaWZ8d2hlbilcXGIpL1xuXHRcdH0pO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnY2xhc3MgR3JlZXRlcicsXG5cdFx0XHRcdCcgIGRlZiBpbml0aWFsaXplKG5hbWUpJyxcblx0XHRcdFx0JyAgICBAbmFtZSA9IG5hbWUnLFxuXHRcdFx0XHQnICAgIGVuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHJ1YnlMYW5ndWFnZUlkXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDcsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgNywgNCwgNykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnZCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnICBlbmQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQXV0byBpbmRlbnQgb24gdHlwZTogaW5jcmVhc2VJbmRlbnRQYXR0ZXJuIGhhcyBoaWdoZXIgcHJpb3JpdHkgdGhhbiBkZWNyZWFzZUluZGVudCB3aGVuIGluaGVyaXRpbmcnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0Y29uc29sZS5sb2coKTsnLFxuXHRcdFx0XHQnXFx0fSBlbHNlIGlmIHsnLFxuXHRcdFx0XHQnXFx0XFx0Y29uc29sZS5sb2coKScsXG5cdFx0XHRcdCdcXHR9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNSwgMywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig1LCAzLCA1LCAzKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdlJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDQpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJ1xcdH1lJywgJ1RoaXMgbGluZSBzaG91bGQgbm90IGRlY3JlYXNlIGluZGVudCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0eXBlIGhvbm9ycyB1c2VycyBpbmRlbnRhdGlvbiBhZGp1c3RtZW50JywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J1xcdGlmICh0cnVlIHx8Jyxcblx0XHRcdFx0J1xcdCApIHsnLFxuXHRcdFx0XHQnXFx0fScsXG5cdFx0XHRcdCdpZiAodHJ1ZSB8fCcsXG5cdFx0XHRcdCcpIHsnLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDMsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMywgMiwgMykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnICcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA0LCAyLCA0KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdcXHQgICkgeycsICdUaGlzIGxpbmUgc2hvdWxkIG5vdCBkZWNyZWFzZSBpbmRlbnQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnIDI5OTcyOiBpZiBhIGxpbmUgaXMgbGluZSBjb21tZW50LCBvcGVuIGJyYWNrZXQgc2hvdWxkIG5vdCBpbmRlbnQgbmV4dCBsaW5lJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdFx0J1xcdC8vIHsnLFxuXHRcdFx0XHQnXFx0XFx0J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHsgYXV0b0luZGVudDogJ2Z1bGwnIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDMsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMywgMywgMykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnfScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAyLCAzLCAyKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICd9Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnaXNzdWUgIzM4MjYxOiBUQUIga2V5IHJlc3VsdHMgaW4gYml6YXJyZSBpbmRlbnRhdGlvbiBpbiBDKysgbW9kZSAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdpbmRlbnRSdWxlc01vZGUnO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsneycsICd9J10sXG5cdFx0XHRcdFsnWycsICddJ10sXG5cdFx0XHRcdFsnKCcsICcpJ11cblx0XHRcdF0sXG5cdFx0XHRpbmRlbnRhdGlvblJ1bGVzOiB7XG5cdFx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjogbmV3IFJlZ0V4cCgnKF4uKlxcXFx7W159XSokKScpLFxuXHRcdFx0XHRkZWNyZWFzZUluZGVudFBhdHRlcm46IG5ldyBSZWdFeHAoJ15cXFxccypcXFxcfScpXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdpbnQgbWFpbigpIHsnLFxuXHRcdFx0XHQnICByZXR1cm4gMDsnLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnYm9vbCBGb286OmJhcihjb25zdCBzdHJpbmcgJmEsJyxcblx0XHRcdFx0JyAgICAgICAgICAgICAgY29uc3Qgc3RyaW5nICZiKSB7Jyxcblx0XHRcdFx0JyAgZm9vKCk7Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcpJyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHR0YWJTaXplOiAyLFxuXHRcdFx0XHRpbmRlbnRTaXplOiAyXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnYWR2YW5jZWQnIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA4LCAxLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDgsIDEsIDgsIDEpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnaW50IG1haW4oKSB7Jyxcblx0XHRcdFx0XHQnICByZXR1cm4gMDsnLFxuXHRcdFx0XHRcdCd9Jyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnYm9vbCBGb286OmJhcihjb25zdCBzdHJpbmcgJmEsJyxcblx0XHRcdFx0XHQnICAgICAgICAgICAgICBjb25zdCBzdHJpbmcgJmIpIHsnLFxuXHRcdFx0XHRcdCcgIGZvbygpOycsXG5cdFx0XHRcdFx0JyAgJyxcblx0XHRcdFx0XHQnKScsXG5cdFx0XHRcdF0uam9pbignXFxuJylcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbig4LCAzLCA4LCAzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM1NzE5NzogaW5kZW50IHJ1bGVzIHJlZ2V4IHNob3VsZCBiZSBzdGF0ZWxlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHNldHVwSW5kZW50UnVsZXNMYW5ndWFnZSgnbGFuZycsIHtcblx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjogL15cXHMqfSQvZ20sXG5cdFx0XHRpbmNyZWFzZUluZGVudFBhdHRlcm46IC9eKD8hW15cXFNcXG5dKig/IS0tfFx1MjAxM1x1MjAxM3xcdTIwMTRcdTIwMTQpKD86Wy1cdTI3NERcdTI3NTFcdTI1QTBcdTJCMUNcdTI1QTFcdTI2MTBcdTI1QUFcdTI1QUJcdTIwMTNcdTIwMTRcdTIyNjFcdTIxOTJcdTIwM0FcdTI3MTh4WFx1MjcxNFx1MjcxM1x1MjYxMStdfFxcW1sgeFgrLV0/XFxdKVxcc1teXFxuXSopW15cXFNcXG5dKiguKzopW15cXFNcXG5dKig/Oig/PUBbXlxccyp+KF0rKD86OlxcL1xcL1teXFxzKn4oOl0rKT8oPzpcXChbXildKlxcKSk/KXwkKS9nbSxcblx0XHR9KTtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdQcm9qZWN0OicsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogbGFuZ3VhZ2VJZCxcblx0XHRcdG1vZGVsT3B0czogeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH0sXG5cdFx0XHRlZGl0b3JPcHRzOiB7IGF1dG9JbmRlbnQ6ICdmdWxsJyB9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA5LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDkpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMikpO1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDksIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgOSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0eXBpbmcgaW4ganNvbicsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ2luZGVudFJ1bGVzTW9kZSc7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0WycoJywgJyknXVxuXHRcdFx0XSxcblx0XHRcdGluZGVudGF0aW9uUnVsZXM6IHtcblx0XHRcdFx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiBuZXcgUmVnRXhwKCcoeysoPz0oW15cIl0qXCJbXlwiXSpcIikqW15cIn1dKiQpKXwoXFxcXFsrKD89KFteXCJdKlwiW15cIl0qXCIpKlteXCJcXFxcXV0qJCkpJyksXG5cdFx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjogbmV3IFJlZ0V4cCgnXlxcXFxzKlt9XFxcXF1dLD9cXFxccyokJylcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J3snLFxuXHRcdFx0XHQnICBcInNjcmlwdHM6IHtcIicsXG5cdFx0XHRcdCcgICAgXCJ3YXRjaFwiOiBcImEge1wiJyxcblx0XHRcdFx0JyAgICBcImJ1aWxke1wiOiBcImJcIicsXG5cdFx0XHRcdCcgICAgXCJ0YXNrc1wiOiBbXScsXG5cdFx0XHRcdCcgICAgXCJ0YXNrc1wiOiBbXCJhXCJdJyxcblx0XHRcdFx0JyAgXCJ9XCInLFxuXHRcdFx0XHQnXCJ9XCInXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0bGFuZ3VhZ2VJZCxcblx0XHRcdHtcblx0XHRcdFx0dGFiU2l6ZTogMixcblx0XHRcdFx0aW5kZW50U2l6ZTogMlxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAxOSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAxOSwgMywgMTkpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJyAgICAnKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA1LCAxOCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig1LCAxOCwgNSwgMTgpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg2KSwgJyAgICAnKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA3LCAxNSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig3LCAxNSwgNywgMTUpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg4KSwgJyAgICAgICcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg5KSwgJyAgICBdJyk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMTAsIDE4LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEwLCAxOCwgMTAsIDE4KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMTEpLCAnICAgIF0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExMTEyODogTXVsdGljdXJzb3IgYEVudGVyYCBpc3N1ZSB3aXRoIGluZGVudGF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcgICAgbGV0IGEsIGIsIGM7JywgaW5kZW50UnVsZXNMYW5ndWFnZUlkLCB7IGRldGVjdEluZGVudGF0aW9uOiBmYWxzZSwgaW5zZXJ0U3BhY2VzOiBmYWxzZSwgdGFiU2l6ZTogNCB9KTtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgMTEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDE0LCAxLCAxNCksXG5cdFx0XHRdKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnICAgIGxldCBhLFxcblxcdCBiLFxcblxcdCBjOycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTIyNzE0OiB0YWJTaXplPTEgcHJldmVudCB0eXBpbmcgYSBzdHJpbmcgbWF0Y2hpbmcgZGVjcmVhc2VJbmRlbnRQYXR0ZXJuIGluIGFuIGVtcHR5IGZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGF0ZXh0TGFuZ3VhZ2VJZCA9IHNldHVwSW5kZW50UnVsZXNMYW5ndWFnZSgnbGF0ZXgnLCB7XG5cdFx0XHRpbmNyZWFzZUluZGVudFBhdHRlcm46IG5ldyBSZWdFeHAoJ1xcXFxcXFxcYmVnaW57KD8hZG9jdW1lbnQpKFtefV0qKX0oPyEuKlxcXFxcXFxcZW5ke1xcXFwxfSknKSxcblx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjogbmV3IFJlZ0V4cCgnXlxcXFxzKlxcXFxcXFxcZW5keyg/IWRvY3VtZW50KScpXG5cdFx0fSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHQnXFxcXGVuZCcsXG5cdFx0XHRsYXRleHRMYW5ndWFnZUlkLFxuXHRcdFx0eyB0YWJTaXplOiAxIH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJyB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd7JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdcXFxcZW5ke30nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSBkb2VzIG5vdGhpbmcgaWYgbm8gZWxlY3RyaWMgY2hhcicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcgIGlmIChhKSB7Jyxcblx0XHRcdFx0Jydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcqJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnKicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGluZGVudHMgaW4gb3JkZXIgdG8gbWF0Y2ggYnJhY2tldCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcgIGlmIChhKSB7Jyxcblx0XHRcdFx0Jydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCd9JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICB9Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VsZWN0cmljQ2hhcmFjdGVyIC0gdW5pbmRlbnRzIGluIG9yZGVyIHRvIG1hdGNoIGJyYWNrZXQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICBpZiAoYSkgeycsXG5cdFx0XHRcdCcgICAgJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGVsZWN0cmljQ2hhckxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDUpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ30nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgIH0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSBtYXRjaGVzIHdpdGggY29ycmVjdCBicmFja2V0JywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgaWYgKGEpIHsnLFxuXHRcdFx0XHQnICAgIGlmIChiKSB7Jyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdFx0JyAgICAnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogZWxlY3RyaWNDaGFyTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgMSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnfScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJyAgfSAgICAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSBkb2VzIG5vdGhpbmcgaWYgYnJhY2tldCBkb2VzIG5vdCBtYXRjaCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcgIGlmIChhKSB7Jyxcblx0XHRcdFx0JyAgICBpZiAoYikgeycsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRcdCcgIH0gICdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCA2KTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCd9JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnICB9ICB9Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VsZWN0cmljQ2hhcmFjdGVyIC0gbWF0Y2hlcyBicmFja2V0IGV2ZW4gaW4gbGluZSB3aXRoIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICBpZiAoYSkgeycsXG5cdFx0XHRcdCcvLyBoZWxsbydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCd9JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICB9Ly8gaGVsbG8nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSBpcyBuby1vcCBpZiBicmFja2V0IGlzIGxpbmVkIHVwJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgaWYgKGEpIHsnLFxuXHRcdFx0XHQnICAnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogZWxlY3RyaWNDaGFyTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnfScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgfScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGlzIG5vLW9wIGlmIHRoZXJlIGlzIG5vbi13aGl0ZXNwYWNlIHRleHQgYmVmb3JlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgaWYgKGEpIHsnLFxuXHRcdFx0XHQnYSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAyKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCd9JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnYX0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSBpcyBuby1vcCBpZiBwYWlycyBhcmUgYWxsIG1hdGNoZWQgYmVmb3JlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2ZvbygoKSA9PiB7Jyxcblx0XHRcdFx0JyAgKCAxICsgMiApICcsXG5cdFx0XHRcdCd9KSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxMyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgKCAxICsgMiApIConKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSBpcyBuby1vcCBpZiBtYXRjaGluZyBicmFja2V0IGlzIG9uIHRoZSBzYW1lIGxpbmUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnKGRpdicsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogZWxlY3RyaWNDaGFyTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNSk7XG5cdFx0XHRsZXQgY2hhbmdlVGV4dDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gbW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGUgPT4ge1xuXHRcdFx0XHRjaGFuZ2VUZXh0ID0gZS5jaGFuZ2VzWzBdLnRleHQ7XG5cdFx0XHR9KTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnKGRpdiknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlVGV4dCwgJyknKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGlzIG5vLW9wIGlmIHRoZSBsaW5lIGhhcyBvdGhlciBjb250ZW50JywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J01hdGgubWF4KCcsXG5cdFx0XHRcdCdcXHQyJyxcblx0XHRcdFx0J1xcdDMnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogZWxlY3RyaWNDaGFyTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ1xcdDMpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VsZWN0cmljQ2hhcmFjdGVyIC0gYXBwZW5kcyB0ZXh0JywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgaWYgKGEpIHsnLFxuXHRcdFx0XHQnLyonXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogZWxlY3RyaWNDaGFyTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJy8qKiAqLycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGFwcGVuZHMgdGV4dCAyJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgaWYgKGEpIHsnLFxuXHRcdFx0XHQnICAvKidcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCA1KTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcqJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAvKiogKi8nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSBpc3N1ZSAjMjM3MTE6IFJlcGxhY2luZyBzZWxlY3RlZCB0ZXh0IHdpdGggKV19IGZhaWxzIHRvIGRlbGV0ZSBvbGQgdGV4dCB3aXRoIGJhY2t3YXJkcy1kcmFnZ2VkIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd7Jyxcblx0XHRcdFx0J3dvcmQnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogZWxlY3RyaWNDaGFyTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgNSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEsIHRydWUpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ30nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICd9Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM2MTA3MDogYmFja3RpY2sgKGApIHNob3VsZCBhdXRvLWNsb3NlIGFmdGVyIGEgd29yZCBjaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogWydjb25zdCBtYXJrdXAgPSBoaWdobGlnaHQnXSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbigxKTtcblx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCAxLCAyNSwgJ2AnLCAnYGAnLCBgYXV0byBjbG9zZXMgXFxgIEAgKDEsIDI1KWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTMyOTEyOiBxdW90ZXMgc2hvdWxkIG5vdCBhdXRvLWNsb3NlIGlmIHRoZXkgYXJlIGNsb3NpbmcgYSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0c2V0dXBBdXRvQ2xvc2luZ0xhbmd1YWdlVG9rZW5pemF0aW9uKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2NvbnN0IHQyID0gYHNvbWV0aGluZyAke3QxfScsIGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCk7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHR7fSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHZpZXdNb2RlbC5tb2RlbDtcblx0XHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDEpO1xuXHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgMSwgMjgsICdgJywgJ2AnLCBgZG9lcyBub3QgYXV0byBjbG9zZSBcXGAgQCAoMSwgMjgpYCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b0Nsb3NpbmdQYWlycyAtIG9wZW4gcGFyZW5zOiBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3ZhciBhID0gW107Jyxcblx0XHRcdFx0J3ZhciBiID0gYGFzZGA7Jyxcblx0XHRcdFx0J3ZhciBjID0gXFwnYXNkXFwnOycsXG5cdFx0XHRcdCd2YXIgZCA9IFwiYXNkXCI7Jyxcblx0XHRcdFx0J3ZhciBlID0gLyozKi9cdDM7Jyxcblx0XHRcdFx0J3ZhciBmID0gLyoqIDMgKi8zOycsXG5cdFx0XHRcdCd2YXIgZyA9ICgzKzUpOycsXG5cdFx0XHRcdCd2YXIgaCA9IHsgYTogXFwndmFsdWVcXCcgfTsnLFxuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0Y29uc3QgYXV0b0Nsb3NlUG9zaXRpb25zID0gW1xuXHRcdFx0XHQndmFyfCBhfCB8PXwgW3xdfDt8Jyxcblx0XHRcdFx0J3ZhcnwgYnwgfD18IHxgYXNkfGB8O3wnLFxuXHRcdFx0XHQndmFyfCBjfCB8PXwgfFxcJ2FzZHxcXCd8O3wnLFxuXHRcdFx0XHQndmFyfCBkfCB8PXwgfFwiYXNkfFwifDt8Jyxcblx0XHRcdFx0J3ZhcnwgZXwgfD18IC8qMyovfFx0M3w7fCcsXG5cdFx0XHRcdCd2YXJ8IGZ8IHw9fCAvKip8IDN8ICovM3w7fCcsXG5cdFx0XHRcdCd2YXJ8IGd8IHw9fCAoMys1fCl8O3wnLFxuXHRcdFx0XHQndmFyfCBofCB8PXwge3wgYXw6fCB8XFwndmFsdWV8XFwnfCB8fXw7fCcsXG5cdFx0XHRdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGF1dG9DbG9zZVBvc2l0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG5cdFx0XHRcdGNvbnN0IGF1dG9DbG9zZUNvbHVtbnMgPSBleHRyYWN0QXV0b0Nsb3NpbmdTcGVjaWFsQ29sdW1ucyhtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpLCBhdXRvQ2xvc2VQb3NpdGlvbnNbaV0pO1xuXG5cdFx0XHRcdGZvciAobGV0IGNvbHVtbiA9IDE7IGNvbHVtbiA8IGF1dG9DbG9zZUNvbHVtbnMubGVuZ3RoOyBjb2x1bW4rKykge1xuXHRcdFx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRpZiAoYXV0b0Nsb3NlQ29sdW1uc1tjb2x1bW5dID09PSBBdXRvQ2xvc2luZ0NvbHVtblR5cGUuU3BlY2lhbDEpIHtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICcoJywgJygpJywgYGF1dG8gY2xvc2VzIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCcsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b0Nsb3NpbmdQYWlycyAtIG9wZW4gcGFyZW5zOiB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3ZhciBhID0gW107Jyxcblx0XHRcdFx0J3ZhciBiID0gYGFzZGA7Jyxcblx0XHRcdFx0J3ZhciBjID0gXFwnYXNkXFwnOycsXG5cdFx0XHRcdCd2YXIgZCA9IFwiYXNkXCI7Jyxcblx0XHRcdFx0J3ZhciBlID0gLyozKi9cdDM7Jyxcblx0XHRcdFx0J3ZhciBmID0gLyoqIDMgKi8zOycsXG5cdFx0XHRcdCd2YXIgZyA9ICgzKzUpOycsXG5cdFx0XHRcdCd2YXIgaCA9IHsgYTogXFwndmFsdWVcXCcgfTsnLFxuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHtcblx0XHRcdFx0YXV0b0Nsb3NpbmdCcmFja2V0czogJ2JlZm9yZVdoaXRlc3BhY2UnXG5cdFx0XHR9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRjb25zdCBhdXRvQ2xvc2VQb3NpdGlvbnMgPSBbXG5cdFx0XHRcdCd2YXJ8IGF8ID18IFt8XTt8Jyxcblx0XHRcdFx0J3ZhcnwgYnwgPXwgYGFzZGA7fCcsXG5cdFx0XHRcdCd2YXJ8IGN8ID18IFxcJ2FzZFxcJzt8Jyxcblx0XHRcdFx0J3ZhcnwgZHwgPXwgXCJhc2RcIjt8Jyxcblx0XHRcdFx0J3ZhcnwgZXwgPXwgLyozKi98XHQzO3wnLFxuXHRcdFx0XHQndmFyfCBmfCA9fCAvKip8IDN8ICovMzt8Jyxcblx0XHRcdFx0J3ZhcnwgZ3wgPXwgKDMrNXwpO3wnLFxuXHRcdFx0XHQndmFyfCBofCA9fCB7fCBhOnwgXFwndmFsdWVcXCd8IHx9O3wnLFxuXHRcdFx0XTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhdXRvQ2xvc2VQb3NpdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xuXHRcdFx0XHRjb25zdCBhdXRvQ2xvc2VDb2x1bW5zID0gZXh0cmFjdEF1dG9DbG9zaW5nU3BlY2lhbENvbHVtbnMobW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSwgYXV0b0Nsb3NlUG9zaXRpb25zW2ldKTtcblxuXHRcdFx0XHRmb3IgKGxldCBjb2x1bW4gPSAxOyBjb2x1bW4gPCBhdXRvQ2xvc2VDb2x1bW5zLmxlbmd0aDsgY29sdW1uKyspIHtcblx0XHRcdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obGluZU51bWJlcik7XG5cdFx0XHRcdFx0aWYgKGF1dG9DbG9zZUNvbHVtbnNbY29sdW1uXSA9PT0gQXV0b0Nsb3NpbmdDb2x1bW5UeXBlLlNwZWNpYWwxKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnKCcsICcoKScsIGBhdXRvIGNsb3NlcyBAICgke2xpbmVOdW1iZXJ9LCAke2NvbHVtbn0pYCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICcoJywgJygnLCBgZG9lcyBub3QgYXV0byBjbG9zZSBAICgke2xpbmVOdW1iZXJ9LCAke2NvbHVtbn0pYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9DbG9zaW5nUGFpcnMgLSBvcGVuIHBhcmVucyBkaXNhYmxlZC9lbmFibGVkIG9wZW4gcXVvdGVzIGVuYWJsZWQvZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndmFyIGEgPSBbXTsnLFxuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHtcblx0XHRcdFx0YXV0b0Nsb3NpbmdCcmFja2V0czogJ2JlZm9yZVdoaXRlc3BhY2UnLFxuXHRcdFx0XHRhdXRvQ2xvc2luZ1F1b3RlczogJ25ldmVyJ1xuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0Y29uc3QgYXV0b0Nsb3NlUG9zaXRpb25zID0gW1xuXHRcdFx0XHQndmFyfCBhfCA9fCBbfF07fCcsXG5cdFx0XHRdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGF1dG9DbG9zZVBvc2l0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG5cdFx0XHRcdGNvbnN0IGF1dG9DbG9zZUNvbHVtbnMgPSBleHRyYWN0QXV0b0Nsb3NpbmdTcGVjaWFsQ29sdW1ucyhtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpLCBhdXRvQ2xvc2VQb3NpdGlvbnNbaV0pO1xuXG5cdFx0XHRcdGZvciAobGV0IGNvbHVtbiA9IDE7IGNvbHVtbiA8IGF1dG9DbG9zZUNvbHVtbnMubGVuZ3RoOyBjb2x1bW4rKykge1xuXHRcdFx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRpZiAoYXV0b0Nsb3NlQ29sdW1uc1tjb2x1bW5dID09PSBBdXRvQ2xvc2luZ0NvbHVtblR5cGUuU3BlY2lhbDEpIHtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICcoJywgJygpJywgYGF1dG8gY2xvc2VzIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCcsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJ1xcJycsICdcXCcnLCBgZG9lcyBub3QgYXV0byBjbG9zZSBAICgke2xpbmVOdW1iZXJ9LCAke2NvbHVtbn0pYCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3ZhciBiID0gW107Jyxcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsXG5cdFx0XHRlZGl0b3JPcHRzOiB7XG5cdFx0XHRcdGF1dG9DbG9zaW5nQnJhY2tldHM6ICduZXZlcicsXG5cdFx0XHRcdGF1dG9DbG9zaW5nUXVvdGVzOiAnYmVmb3JlV2hpdGVzcGFjZSdcblx0XHRcdH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdGNvbnN0IGF1dG9DbG9zZVBvc2l0aW9ucyA9IFtcblx0XHRcdFx0J3ZhciBiID18IFt8XTt8Jyxcblx0XHRcdF07XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXV0b0Nsb3NlUG9zaXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NlQ29sdW1ucyA9IGV4dHJhY3RBdXRvQ2xvc2luZ1NwZWNpYWxDb2x1bW5zKG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlciksIGF1dG9DbG9zZVBvc2l0aW9uc1tpXSk7XG5cblx0XHRcdFx0Zm9yIChsZXQgY29sdW1uID0gMTsgY29sdW1uIDwgYXV0b0Nsb3NlQ29sdW1ucy5sZW5ndGg7IGNvbHVtbisrKSB7XG5cdFx0XHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmIChhdXRvQ2xvc2VDb2x1bW5zW2NvbHVtbl0gPT09IEF1dG9DbG9zaW5nQ29sdW1uVHlwZS5TcGVjaWFsMSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJ1xcJycsICdcXCdcXCcnLCBgYXV0byBjbG9zZXMgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnXFwnJywgJ1xcJycsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCcsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvQ2xvc2luZ1BhaXJzIC0gY29uZmlndXJhYmxlIG9wZW4gcGFyZW5zJywgKCkgPT4ge1xuXHRcdHNldEF1dG9DbG9zaW5nTGFuZ3VhZ2VFbmFibGVkU2V0KCdhYmMnKTtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd2YXIgYSA9IFtdOycsXG5cdFx0XHRcdCd2YXIgYiA9IGBhc2RgOycsXG5cdFx0XHRcdCd2YXIgYyA9IFxcJ2FzZFxcJzsnLFxuXHRcdFx0XHQndmFyIGQgPSBcImFzZFwiOycsXG5cdFx0XHRcdCd2YXIgZSA9IC8qMyovXHQzOycsXG5cdFx0XHRcdCd2YXIgZiA9IC8qKiAzICovMzsnLFxuXHRcdFx0XHQndmFyIGcgPSAoMys1KTsnLFxuXHRcdFx0XHQndmFyIGggPSB7IGE6IFxcJ3ZhbHVlXFwnIH07Jyxcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsXG5cdFx0XHRlZGl0b3JPcHRzOiB7XG5cdFx0XHRcdGF1dG9DbG9zaW5nQnJhY2tldHM6ICdsYW5ndWFnZURlZmluZWQnXG5cdFx0XHR9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRjb25zdCBhdXRvQ2xvc2VQb3NpdGlvbnMgPSBbXG5cdFx0XHRcdCd2fGFyIHxhID0gW3xdO3wnLFxuXHRcdFx0XHQndnxhciB8YiA9IGB8YXNkYDt8Jyxcblx0XHRcdFx0J3Z8YXIgfGMgPSBcXCd8YXNkXFwnO3wnLFxuXHRcdFx0XHQndnxhciBkID0gXCJ8YXNkXCI7fCcsXG5cdFx0XHRcdCd2fGFyIGUgPSAvKjMqL1x0Mzt8Jyxcblx0XHRcdFx0J3Z8YXIgZiA9IC8qKiAzfCAqLzM7fCcsXG5cdFx0XHRcdCd2fGFyIGcgPSAoMys1fCk7fCcsXG5cdFx0XHRcdCd2fGFyIGggPSB7IHxhOiBcXCd2fGFsdWVcXCcgfH07fCcsXG5cdFx0XHRdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGF1dG9DbG9zZVBvc2l0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG5cdFx0XHRcdGNvbnN0IGF1dG9DbG9zZUNvbHVtbnMgPSBleHRyYWN0QXV0b0Nsb3NpbmdTcGVjaWFsQ29sdW1ucyhtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpLCBhdXRvQ2xvc2VQb3NpdGlvbnNbaV0pO1xuXG5cdFx0XHRcdGZvciAobGV0IGNvbHVtbiA9IDE7IGNvbHVtbiA8IGF1dG9DbG9zZUNvbHVtbnMubGVuZ3RoOyBjb2x1bW4rKykge1xuXHRcdFx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRpZiAoYXV0b0Nsb3NlQ29sdW1uc1tjb2x1bW5dID09PSBBdXRvQ2xvc2luZ0NvbHVtblR5cGUuU3BlY2lhbDEpIHtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICcoJywgJygpJywgYGF1dG8gY2xvc2VzIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCcsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b0Nsb3NpbmdQYWlycyAtIGF1dG8tcGFpcmluZyBjYW4gYmUgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndmFyIGEgPSBbXTsnLFxuXHRcdFx0XHQndmFyIGIgPSBgYXNkYDsnLFxuXHRcdFx0XHQndmFyIGMgPSBcXCdhc2RcXCc7Jyxcblx0XHRcdFx0J3ZhciBkID0gXCJhc2RcIjsnLFxuXHRcdFx0XHQndmFyIGUgPSAvKjMqL1x0MzsnLFxuXHRcdFx0XHQndmFyIGYgPSAvKiogMyAqLzM7Jyxcblx0XHRcdFx0J3ZhciBnID0gKDMrNSk7Jyxcblx0XHRcdFx0J3ZhciBoID0geyBhOiBcXCd2YWx1ZVxcJyB9OycsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkLFxuXHRcdFx0ZWRpdG9yT3B0czoge1xuXHRcdFx0XHRhdXRvQ2xvc2luZ0JyYWNrZXRzOiAnbmV2ZXInLFxuXHRcdFx0XHRhdXRvQ2xvc2luZ1F1b3RlczogJ25ldmVyJ1xuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0Y29uc3QgYXV0b0Nsb3NlUG9zaXRpb25zID0gW1xuXHRcdFx0XHQndmFyIGEgPSBbXTsnLFxuXHRcdFx0XHQndmFyIGIgPSBgYXNkYDsnLFxuXHRcdFx0XHQndmFyIGMgPSBcXCdhc2RcXCc7Jyxcblx0XHRcdFx0J3ZhciBkID0gXCJhc2RcIjsnLFxuXHRcdFx0XHQndmFyIGUgPSAvKjMqL1x0MzsnLFxuXHRcdFx0XHQndmFyIGYgPSAvKiogMyAqLzM7Jyxcblx0XHRcdFx0J3ZhciBnID0gKDMrNSk7Jyxcblx0XHRcdFx0J3ZhciBoID0geyBhOiBcXCd2YWx1ZVxcJyB9OycsXG5cdFx0XHRdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGF1dG9DbG9zZVBvc2l0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG5cdFx0XHRcdGNvbnN0IGF1dG9DbG9zZUNvbHVtbnMgPSBleHRyYWN0QXV0b0Nsb3NpbmdTcGVjaWFsQ29sdW1ucyhtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpLCBhdXRvQ2xvc2VQb3NpdGlvbnNbaV0pO1xuXG5cdFx0XHRcdGZvciAobGV0IGNvbHVtbiA9IDE7IGNvbHVtbiA8IGF1dG9DbG9zZUNvbHVtbnMubGVuZ3RoOyBjb2x1bW4rKykge1xuXHRcdFx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRpZiAoYXV0b0Nsb3NlQ29sdW1uc1tjb2x1bW5dID09PSBBdXRvQ2xvc2luZ0NvbHVtblR5cGUuU3BlY2lhbDEpIHtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICcoJywgJygpJywgYGF1dG8gY2xvc2VzIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICdcIicsICdcIlwiJywgYGF1dG8gY2xvc2VzIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCcsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICdcIicsICdcIicsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b0Nsb3NpbmdQYWlycyAtIGF1dG8gd3JhcHBpbmcgaXMgY29uZmlndXJhYmxlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3ZhciBhID0gYXNkJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgMTIpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIHR5cGUgYSBgXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYCcsICdrZXlib2FyZCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2B2YXJgIGEgPSBgYXNkYCcpO1xuXG5cdFx0XHQvLyB0eXBlIGEgKFxuXHRcdFx0dmlld01vZGVsLnR5cGUoJygnLCAna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdgKHZhcilgIGEgPSBgKGFzZClgJyk7XG5cdFx0fSk7XG5cblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd2YXIgYSA9IGFzZCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsXG5cdFx0XHRlZGl0b3JPcHRzOiB7XG5cdFx0XHRcdGF1dG9TdXJyb3VuZDogJ25ldmVyJ1xuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gdHlwZSBhIGBcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdgJywgJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnYCBhID0gYXNkJyk7XG5cdFx0fSk7XG5cblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd2YXIgYSA9IGFzZCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsXG5cdFx0XHRlZGl0b3JPcHRzOiB7XG5cdFx0XHRcdGF1dG9TdXJyb3VuZDogJ3F1b3Rlcydcblx0XHRcdH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIHR5cGUgYSBgXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdgdmFyYCBhID0gYXNkJyk7XG5cblx0XHRcdC8vIHR5cGUgYSAoXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdgKGAgYSA9IGFzZCcpO1xuXHRcdH0pO1xuXG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndmFyIGEgPSBhc2QnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkLFxuXHRcdFx0ZWRpdG9yT3B0czoge1xuXHRcdFx0XHRhdXRvU3Vycm91bmQ6ICdicmFja2V0cydcblx0XHRcdH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIHR5cGUgYSAoXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcodmFyKSBhID0gYXNkJyk7XG5cblx0XHRcdC8vIHR5cGUgYSBgXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcoYCkgYSA9IGFzZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvQ2xvc2luZ1BhaXJzIC0gcXVvdGUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndmFyIGEgPSBbXTsnLFxuXHRcdFx0XHQndmFyIGIgPSBgYXNkYDsnLFxuXHRcdFx0XHQndmFyIGMgPSBcXCdhc2RcXCc7Jyxcblx0XHRcdFx0J3ZhciBkID0gXCJhc2RcIjsnLFxuXHRcdFx0XHQndmFyIGUgPSAvKjMqL1x0MzsnLFxuXHRcdFx0XHQndmFyIGYgPSAvKiogMyAqLzM7Jyxcblx0XHRcdFx0J3ZhciBnID0gKDMrNSk7Jyxcblx0XHRcdFx0J3ZhciBoID0geyBhOiBcXCd2YWx1ZVxcJyB9OycsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRjb25zdCBhdXRvQ2xvc2VQb3NpdGlvbnMgPSBbXG5cdFx0XHRcdCd2YXIgYSB8PXwgW3xdfDt8Jyxcblx0XHRcdFx0J3ZhciBiIHw9fCBgYXNkYHw7fCcsXG5cdFx0XHRcdCd2YXIgYyB8PXwgXFwnYXNkXFwnfDt8Jyxcblx0XHRcdFx0J3ZhciBkIHw9fCBcImFzZFwifDt8Jyxcblx0XHRcdFx0J3ZhciBlIHw9fCAvKjMqL3xcdDM7fCcsXG5cdFx0XHRcdCd2YXIgZiB8PXwgLyoqfCAzICovMzt8Jyxcblx0XHRcdFx0J3ZhciBnIHw9fCAoMys1KXw7fCcsXG5cdFx0XHRcdCd2YXIgaCB8PXwge3wgYTp8IFxcJ3ZhbHVlXFwnfCB8fXw7fCcsXG5cdFx0XHRdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGF1dG9DbG9zZVBvc2l0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG5cdFx0XHRcdGNvbnN0IGF1dG9DbG9zZUNvbHVtbnMgPSBleHRyYWN0QXV0b0Nsb3NpbmdTcGVjaWFsQ29sdW1ucyhtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpLCBhdXRvQ2xvc2VQb3NpdGlvbnNbaV0pO1xuXG5cdFx0XHRcdGZvciAobGV0IGNvbHVtbiA9IDE7IGNvbHVtbiA8IGF1dG9DbG9zZUNvbHVtbnMubGVuZ3RoOyBjb2x1bW4rKykge1xuXHRcdFx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRpZiAoYXV0b0Nsb3NlQ29sdW1uc1tjb2x1bW5dID09PSBBdXRvQ2xvc2luZ0NvbHVtblR5cGUuU3BlY2lhbDEpIHtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICdcXCcnLCAnXFwnXFwnJywgYGF1dG8gY2xvc2VzIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGF1dG9DbG9zZUNvbHVtbnNbY29sdW1uXSA9PT0gQXV0b0Nsb3NpbmdDb2x1bW5UeXBlLlNwZWNpYWwyKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnXFwnJywgJycsIGBvdmVyIHR5cGVzIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJ1xcJycsICdcXCcnLCBgZG9lcyBub3QgYXV0byBjbG9zZSBAICgke2xpbmVOdW1iZXJ9LCAke2NvbHVtbn0pYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9DbG9zaW5nUGFpcnMgLSBtdWx0aS1jaGFyYWN0ZXIgYXV0b2Nsb3NlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnYmVnaScpO1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ24nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2JlZ2luZW5kJyk7XG5cblx0XHRcdG1vZGVsLnNldFZhbHVlKCcvKicpO1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyonLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJy8qKiAqLycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvQ2xvc2luZ1BhaXJzIC0gZG9jIGNvbW1lbnRzIGNhbiBiZSB0dXJuZWQgb2ZmJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkLFxuXHRcdFx0ZWRpdG9yT3B0czoge1xuXHRcdFx0XHRhdXRvQ2xvc2luZ0NvbW1lbnRzOiAnbmV2ZXInXG5cdFx0XHR9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnLyonKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcqJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcvKionKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzcyMTc3OiBtdWx0aS1jaGFyYWN0ZXIgYXV0b2Nsb3NlIHdpdGggY29uZmxpY3RpbmcgcGF0dGVybnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdhdXRvQ2xvc2luZ01vZGVNdWx0aUNoYXInO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdGF1dG9DbG9zaW5nUGFpcnM6IFtcblx0XHRcdFx0eyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcblx0XHRcdFx0eyBvcGVuOiAnKConLCBjbG9zZTogJyopJyB9LFxuXHRcdFx0XHR7IG9wZW46ICc8QCcsIGNsb3NlOiAnQD4nIH0sXG5cdFx0XHRcdHsgb3BlbjogJzxAQCcsIGNsb3NlOiAnQEA+JyB9LFxuXHRcdFx0XSxcblx0XHR9KSk7XG5cblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnKCknKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcqJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcoKiopJywgYGRvZXNuJ3QgYWRkIGVudGlyZSBjbG9zZSB3aGVuIGFscmVhZHkgY2xvc2VkIHN1YnN0cmluZyBpcyB0aGVyZWApO1xuXG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnKCcpO1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyonLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJygqKiknLCBgZG9lcyBhZGQgZW50aXJlIGNsb3NlIGlmIG5vdCBhbHJlYWR5IHRoZXJlYCk7XG5cblx0XHRcdG1vZGVsLnNldFZhbHVlKCcnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCc8QCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnPEBAPicpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ0AnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJzxAQEBAPicsIGBhdXRvY2xvc2VzIHdoZW4gYmVmb3JlIG11bHRpLWNoYXJhY3RlciBjbG9zaW5nIGJyYWNlYCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnPEBAKClAQD4nLCBgYXV0b2Nsb3NlcyB3aGVuIGJlZm9yZSBtdWx0aS1jaGFyYWN0ZXIgY2xvc2luZyBicmFjZWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNTUzMTQ6IERvIG5vdCBhdXRvLWNsb3NlIHdoZW4gZW5kaW5nIHdpdGggb3BlbicsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ215RWxlY3RyaWNNb2RlJztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzOiBbXG5cdFx0XHRcdHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXG5cdFx0XHRcdHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdcXFwiJywgY2xvc2U6ICdcXFwiJywgbm90SW46IFsnc3RyaW5nJ10gfSxcblx0XHRcdFx0eyBvcGVuOiAnQlxcXCInLCBjbG9zZTogJ1xcXCInLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ2AnLCBjbG9zZTogJ2AnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJy8qKicsIGNsb3NlOiAnICovJywgbm90SW46IFsnc3RyaW5nJ10gfVxuXHRcdFx0XSxcblx0XHR9KSk7XG5cblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdsaXR0bGUgZ29hdCcsXG5cdFx0XHRcdCdsaXR0bGUgTEFNQicsXG5cdFx0XHRcdCdsaXR0bGUgc2hlZXAnLFxuXHRcdFx0XHQnQmlnIExBTUInXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogbGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgMSwgNCwgJ1wiJywgJ1wiJywgYGRvZXMgbm90IGRvdWJsZSBxdW90ZSB3aGVuIGVuZGluZyB3aXRoIG9wZW5gKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgMiwgNCwgJ1wiJywgJ1wiJywgYGRvZXMgbm90IGRvdWJsZSBxdW90ZSB3aGVuIGVuZGluZyB3aXRoIG9wZW5gKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgMywgNCwgJ1wiJywgJ1wiJywgYGRvZXMgbm90IGRvdWJsZSBxdW90ZSB3aGVuIGVuZGluZyB3aXRoIG9wZW5gKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgNCwgMiwgJ1wiJywgJ1wiJywgYGRvZXMgbm90IGRvdWJsZSBxdW90ZSB3aGVuIGVuZGluZyB3aXRoIG9wZW5gKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgNCwgMywgJ1wiJywgJ1wiJywgYGRvZXMgbm90IGRvdWJsZSBxdW90ZSB3aGVuIGVuZGluZyB3aXRoIG9wZW5gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI3OTM3OiBUcnlpbmcgdG8gYWRkIGFuIGl0ZW0gdG8gdGhlIGZyb250IG9mIGEgbGlzdCBpcyBjdW1iZXJzb21lJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3ZhciBhcnIgPSBbXCJiXCIsIFwiY1wiXTsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIDEsIDEyLCAnXCInLCAnXCInLCBgZG9lcyBub3Qgb3ZlciB0eXBlIGFuZCB3aWxsIG5vdCBhdXRvIGNsb3NlYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNTY1OCAtIERvIG5vdCBhdXRvLWNsb3NlIHNpbmdsZS9kb3VibGUgcXVvdGVzIGFmdGVyIHdvcmQgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0ZnVuY3Rpb24gdHlwZUNoYXJhY3RlcnModmlld01vZGVsOiBWaWV3TW9kZWwsIGNoYXJzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGNoYXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0dmlld01vZGVsLnR5cGUoY2hhcnNbaV0sICdrZXlib2FyZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpcnN0IGdpZlxuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdHR5cGVDaGFyYWN0ZXJzKHZpZXdNb2RlbCwgJ3Rlc3RlMSA9IHRlc3RlXFwnIG9rJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd0ZXN0ZTEgPSB0ZXN0ZVxcJyBvaycpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEwMDAsIDEsIDEwMDApXSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICdcXG4nKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICd0ZXN0ZTIgPSB0ZXN0ZSBcXCdvaycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAndGVzdGUyID0gdGVzdGUgXFwnb2tcXCcnKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigyLCAxMDAwLCAyLCAxMDAwKV0pO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAnXFxuJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAndGVzdGUzID0gdGVzdGVcIiBvaycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAndGVzdGUzID0gdGVzdGVcIiBvaycpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDMsIDEwMDAsIDMsIDEwMDApXSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICdcXG4nKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICd0ZXN0ZTQgPSB0ZXN0ZSBcIm9rJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICd0ZXN0ZTQgPSB0ZXN0ZSBcIm9rXCInKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGdpZlxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbig0LCAxMDAwLCA0LCAxMDAwKV0pO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAnXFxuJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAndGVzdGUgXFwnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICd0ZXN0ZSBcXCdcXCcnKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbig1LCAxMDAwLCA1LCAxMDAwKV0pO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAnXFxuJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAndGVzdGUgXCInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg2KSwgJ3Rlc3RlIFwiXCInKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbig2LCAxMDAwLCA2LCAxMDAwKV0pO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAnXFxuJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAndGVzdGVcXCcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg3KSwgJ3Rlc3RlXFwnJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oNywgMTAwMCwgNywgMTAwMCldKTtcblx0XHRcdHR5cGVDaGFyYWN0ZXJzKHZpZXdNb2RlbCwgJ1xcbicpO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdHR5cGVDaGFyYWN0ZXJzKHZpZXdNb2RlbCwgJ3Rlc3RlXCInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg4KSwgJ3Rlc3RlXCInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM3MzE1IC0gb3ZlcnR5cGVzIG9ubHkgdGhvc2UgY2hhcmFjdGVycyB0aGF0IGl0IGluc2VydGVkJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCd5PSgpOydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgneD0oJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdhc2QnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3g9KGFzZCknKTtcblxuXHRcdFx0Ly8gb3ZlcnR5cGUhXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oYXNkKScpO1xuXG5cdFx0XHQvLyBkbyBub3Qgb3ZlcnR5cGUhXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDQpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAneT0oKSk7Jyk7XG5cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM3MzE1IC0gc3RvcHMgb3ZlcnR5cGluZyBvbmNlIGN1cnNvciBsZWF2ZXMgYXJlYScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQneT0oKTsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3g9KCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oKScpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oKSknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM3MzE1IC0gaXQgb3ZlcnR5cGVzIG9ubHkgb25jZScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQneT0oKTsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3g9KCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oKScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oKScpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oKSknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM3MzE1IC0gaXQgY2FuIHJlbWVtYmVyIG11bHRpcGxlIGF1dG8tY2xvc2VkIGluc3RhbmNlcycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQneT0oKTsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3g9KCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oKScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oKCkpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgoKSknKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJyknLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3g9KCgpKScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4MjcwIC0gYXV0byBjbG9zaW5nIGRlbGV0ZXMgb25seSB0aG9zZSBjaGFyYWN0ZXJzIHRoYXQgaXQgaW5zZXJ0ZWQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0J3k9KCk7J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd4PSgnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3g9KCknKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2FzZCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oYXNkKScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpJyk7XG5cblx0XHRcdC8vIGRlbGV0ZSBjbG9zaW5nIGNoYXIhXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0nKTtcblxuXHRcdFx0Ly8gZG8gbm90IGRlbGV0ZSBjbG9zaW5nIGNoYXIhXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDQpXSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAneT0pOycpO1xuXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3ODUyNyAtIGRvZXMgbm90IGNsb3NlIHF1b3RlIG9uIG9kZCBjb3VudCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdzdGQ6OmNvdXQgPDwgXFwnXCJcXCcgPDwgZW50cnlNYXAnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAyOSwgMSwgMjkpXSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdbJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdzdGQ6OmNvdXQgPDwgXFwnXCJcXCcgPDwgZW50cnlNYXBbXScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXCInLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3N0ZDo6Y291dCA8PCBcXCdcIlxcJyA8PCBlbnRyeU1hcFtcIlwiXScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnc3RkOjpjb3V0IDw8IFxcJ1wiXFwnIDw8IGVudHJ5TWFwW1wiYVwiXScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXCInLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3N0ZDo6Y291dCA8PCBcXCdcIlxcJyA8PCBlbnRyeU1hcFtcImFcIl0nKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ10nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3N0ZDo6Y291dCA8PCBcXCdcIlxcJyA8PCBlbnRyeU1hcFtcImFcIl0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzg1OTgzIC0gZWRpdG9yLmF1dG9DbG9zaW5nQnJhY2tldHM6IGJlZm9yZVdoaXRlc3BhY2UgaXMgaW5jb3JyZWN0IGZvciBQeXRob24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdweXRob25Nb2RlJztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzOiBbXG5cdFx0XHRcdHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXG5cdFx0XHRcdHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1xcXCInLCBjbG9zZTogJ1xcXCInLCBub3RJbjogWydzdHJpbmcnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdyXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnUlxcXCInLCBjbG9zZTogJ1xcXCInLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ3VcXFwiJywgY2xvc2U6ICdcXFwiJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdVXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnZlxcXCInLCBjbG9zZTogJ1xcXCInLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ0ZcXFwiJywgY2xvc2U6ICdcXFwiJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdiXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnQlxcXCInLCBjbG9zZTogJ1xcXCInLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdyXFwnJywgY2xvc2U6ICdcXCcnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1JcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAndVxcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdVXFwnJywgY2xvc2U6ICdcXCcnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ2ZcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnRlxcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdiXFwnJywgY2xvc2U6ICdcXCcnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ0JcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnYCcsIGNsb3NlOiAnYCcsIG5vdEluOiBbJ3N0cmluZyddIH1cblx0XHRcdF0sXG5cdFx0fSkpO1xuXG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnZm9vXFwnaGVsbG9cXCcnXG5cdFx0XHRdLFxuXHRcdFx0ZWRpdG9yT3B0czoge1xuXHRcdFx0XHRhdXRvQ2xvc2luZ0JyYWNrZXRzOiAnYmVmb3JlV2hpdGVzcGFjZSdcblx0XHRcdH0sXG5cdFx0XHRsYW5ndWFnZUlkOiBsYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIDEsIDQsICcoJywgJygnLCBgZG9lcyBub3QgYXV0byBjbG9zZSBAICgxLCA0KWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNzg5NzUgLSBQYXJlbnRoZXNlcyBzd2FsbG93aW5nIGRvZXMgbm90IHdvcmsgd2hlbiBwYXJlbnRoZXNlcyBhcmUgaW5zZXJ0ZWQgYnkgYXV0b2NvbXBsZXRlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JzxkaXYgaWQnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KV0pO1xuXG5cdFx0XHR2aWV3TW9kZWwuZXhlY3V0ZUVkaXRzKCdzbmlwcGV0JywgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA2LCAxLCA4KSwgdGV4dDogJ2lkPVwiXCInIH1dLCAoKSA9PiBbbmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTApXSwgRWRpdFNvdXJjZXMudW5rbm93bih7fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnPGRpdiBpZD1cIlwiJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdhJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICc8ZGl2IGlkPVwiYVwiJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcIicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnPGRpdiBpZD1cImFcIicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNzg4MzMgLSBBZGQgY29uZmlnIHRvIHVzZSBvbGQgYnJhY2tldHMvcXVvdGVzIG92ZXJ0eXBpbmcnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0J3k9KCk7J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHtcblx0XHRcdFx0YXV0b0Nsb3NpbmdPdmVydHlwZTogJ2Fsd2F5cydcblx0XHRcdH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgneD0oJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNCldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICd5PSgpOycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTU4MjU6IGFjY2VudHMgb24gbWFjIFVTIGludGwga2V5Ym9hcmQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRcdC8vIFR5cGluZyBgICsgZSBvbiB0aGUgbWFjIFVTIGludGwga2IgbGF5b3V0XG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2AnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1x1MDBFOCcsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmVuZENvbXBvc2l0aW9uKCdrZXlib2FyZCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1x1MDBFOCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTAwMTY6IGFsbG93IGFjY2VudHMgb24gbWFjIFVTIGludGwga2V5Ym9hcmQgdG8gc3Vycm91bmQgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3Rlc3QnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCA1KV0pO1xuXG5cdFx0XHQvLyBUeXBpbmcgYCArIGUgb24gdGhlIG1hYyBVUyBpbnRsIGtiIGxheW91dFxuXHRcdFx0dmlld01vZGVsLnN0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXCcnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1xcJycsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXFwnJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnXFwndGVzdFxcJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNTMzNTc6IE92ZXIgdHlwaW5nIGlnbm9yZXMgY2hhcmFjdGVycyBhZnRlciBiYWNrc2xhc2gnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnY29uc29sZS5sb2coKTsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxMyldKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcJycsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdjb25zb2xlLmxvZyhcXCdcXCcpOycpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnaXQnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnY29uc29sZS5sb2coXFwnaXRcXCcpOycpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxcXCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdjb25zb2xlLmxvZyhcXCdpdFxcXFxcXCcpOycpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFwnJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2NvbnNvbGUubG9nKFxcJ2l0XFxcXFxcJ1xcJyk7Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4NDk5ODogT3ZlcnR5cGluZyBCcmFja2V0cyBkb2VzblxcJ3Qgd29yayBhZnRlciBiYWNrc2xhc2gnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV0pO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxcXCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdcXFxcJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCcoJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1xcXFwoKScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYWJjJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1xcXFwoYWJjKScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxcXCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdcXFxcKGFiY1xcXFwpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1xcXFwoYWJjXFxcXCknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI3NzM6IEFjY2VudHMgKFx1MDBCNGBcdTAwQTheLCBvdGhlcnM/KSBhcmUgaW5zZXJ0ZWQgaW4gdGhlIHdyb25nIHBvc2l0aW9uIChNYWMpJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2hlbGxvJyxcblx0XHRcdFx0J3dvcmxkJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRcdC8vIFR5cGluZyBgIGFuZCBwcmVzc2luZyBzaGlmdCtkb3duIG9uIHRoZSBtYWMgVVMgaW50bCBrYiBsYXlvdXRcblx0XHRcdC8vIEhlcmUgd2UncmUganVzdCByZXBsYXlpbmcgd2hhdCB0aGUgY3Vyc29yIGdldHNcblx0XHRcdHZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYCcsICdrZXlib2FyZCcpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnYCcsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnYCcsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmVuZENvbXBvc2l0aW9uKCdrZXlib2FyZCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2BoZWxsb1xcbndvcmxkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDIsIDIsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI2ODIwOiBhdXRvIGNsb3NlIHF1b3RlcyB3aGVuIG5vdCB1c2VkIGFzIGFjY2VudHMnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRcdC8vIG9uIHRoZSBtYWMgVVMgaW50bCBrYiBsYXlvdXRcblxuXHRcdFx0Ly8gVHlwaW5nICcgKyBzcGFjZVxuXHRcdFx0dmlld01vZGVsLnN0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXCcnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1xcJycsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmVuZENvbXBvc2l0aW9uKCdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdcXCdcXCcnKTtcblxuXHRcdFx0Ly8gVHlwaW5nIG9uZSBtb3JlICcgKyBzcGFjZVxuXHRcdFx0dmlld01vZGVsLnN0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXCcnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1xcJycsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmVuZENvbXBvc2l0aW9uKCdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdcXCdcXCcnKTtcblxuXHRcdFx0Ly8gVHlwaW5nICcgYXMgYSBjbG9zaW5nIHRhZ1xuXHRcdFx0bW9kZWwuc2V0VmFsdWUoJ1xcJ2FiYycpO1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0pO1xuXHRcdFx0dmlld01vZGVsLnN0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXCcnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1xcJycsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmVuZENvbXBvc2l0aW9uKCdrZXlib2FyZCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1xcJ2FiY1xcJycpO1xuXG5cdFx0XHQvLyBxdW90ZXMgYmVmb3JlIHRoZSBuZXdseSBhZGRlZCBjaGFyYWN0ZXIgYXJlIGFsbCBwYWlyZWQuXG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnXFwnYWJjXFwnZGVmICcpO1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTApXSk7XG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcJycsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXFwnJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnXFwnYWJjXFwnZGVmIFxcJ1xcJycpO1xuXG5cdFx0XHQvLyBObyBhdXRvIGNsb3NpbmcgaWYgdGhlcmUgaXMgbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVyIGFmdGVyIHRoZSBjdXJzb3Jcblx0XHRcdG1vZGVsLnNldFZhbHVlKCdhYmMnKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldKTtcblx0XHRcdHZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFwnJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcXCcnLCAxLCAwLCAwLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5lbmRDb21wb3NpdGlvbigna2V5Ym9hcmQnKTtcblxuXHRcdFx0Ly8gTm8gYXV0byBjbG9zaW5nIGlmIGl0J3MgYWZ0ZXIgYSB3b3JkLlxuXHRcdFx0bW9kZWwuc2V0VmFsdWUoJ2FiYycpO1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0pO1xuXHRcdFx0dmlld01vZGVsLnN0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXCcnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1xcJycsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmVuZENvbXBvc2l0aW9uKCdrZXlib2FyZCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2FiY1xcJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTQ0NjkwOiBRdW90ZXMgZG8gbm90IG92ZXJ0eXBlIHdoZW4gdXNpbmcgVVMgSW50bCBQQyBrZXlib2FyZCBsYXlvdXQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRcdC8vIFByZXNzaW5nICcgKyAnICsgO1xuXG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoYCdgLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoYCdgLCAxLCAwLCAwLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoYCdgLCAxLCAwLCAwLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5lbmRDb21wb3NpdGlvbigna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZShgJ2AsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZShgJztgLCAxLCAwLCAwLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoYCc7YCwgMiwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBgJyc7YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNDQ2OTM6IFR5cGluZyBhIHF1b3RlIHVzaW5nIFVTIEludGwgUEMga2V5Ym9hcmQgbGF5b3V0IGFsd2F5cyBzdXJyb3VuZHMgd29yZHMnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnY29uc3QgaGVsbG8gPSAzOydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDEyKV0pO1xuXG5cdFx0XHQvLyBQcmVzc2luZyAnICsgZVxuXG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoYCdgLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoYFx1MDBFOWAsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZShgXHUwMEU5YCwgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBgY29uc3QgXHUwMEU5ID0gMztgKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzgyNzAxOiBhdXRvIGNsb3NlIGRvZXMgbm90IGV4ZWN1dGUgd2hlbiBJTUUgaXMgY2FuY2VsZWQgdmlhIGJhY2tzcGFjZScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd7fSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDIpXSk7XG5cblx0XHRcdC8vIFR5cGluZyBhICsgYmFja3NwYWNlXG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2EnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJycsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmVuZENvbXBvc2l0aW9uKCdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICd7fScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjA4OTE6IEFsbCBjdXJzb3JzIHNob3VsZCBkbyB0aGUgc2FtZSB0aGluZycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd2YXIgYSA9IGFzZCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDkpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCAxMiksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gdHlwZSBhIGBcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdgJywgJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAndmFyIGEgPSBgYXNkYCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDE4MjU6IFNwZWNpYWwgaGFuZGxpbmcgb2YgcXVvdGVzIGluIHN1cnJvdW5kaW5nIHBhaXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAnbXlNb2RlJztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRzdXJyb3VuZGluZ1BhaXJzOiBbXG5cdFx0XHRcdHsgb3BlbjogJ1wiJywgY2xvc2U6ICdcIicgfSxcblx0XHRcdFx0eyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnIH0sXG5cdFx0XHRdXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ3ZhciB4ID0gXFwnaGlcXCc7JywgbGFuZ3VhZ2VJZCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA5LCAxLCAxMCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDEzKVxuXHRcdFx0XSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXCInLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ3ZhciB4ID0gXCJoaVwiOycsICdhc3NlcnQxJyk7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA5LCAxLCAxMCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDEzKVxuXHRcdFx0XSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFwnJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICd2YXIgeCA9IFxcJ2hpXFwnOycsICdhc3NlcnQyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0FsbCBjdXJzb3JzIHNob3VsZCBkbyB0aGUgc2FtZSB0aGluZyB3aGVuIGRlbGV0aW5nIGxlZnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCd2YXIgYSA9ICgpJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxMCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gZGVsZXRlIGxlZnRcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAndmEgYSA9ICknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzcxMDA6IE1vdXNlIHdvcmQgc2VsZWN0aW9uIGlzIHN0cmFuZ2Ugd2hlbiBub24td29yZCBjaGFyYWN0ZXIgaXMgYXQgdGhlIGVuZCBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnYmVmb3JlLmEnLFxuXHRcdFx0XHQnYmVmb3JlJyxcblx0XHRcdFx0J2hlbGxvOicsXG5cdFx0XHRcdCd0aGVyZTonLFxuXHRcdFx0XHQndGhpcyBpcyBzdHJhbmdlOicsXG5cdFx0XHRcdCdoZXJlJyxcblx0XHRcdFx0J2l0Jyxcblx0XHRcdFx0J2lzJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QsIHtcblx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbigzLCA3KVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDcsIDMsIDcpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5Xb3JkU2VsZWN0RHJhZywge1xuXHRcdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDQsIDcpXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgNywgNCwgNykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTEyMDM5OiBzaGlmdC1jb250aW51aW5nIGEgZG91YmxlL3RyaXBsZS1jbGljayBhbmQgZHJhZyBzZWxlY3Rpb24gZG9lcyBub3QgcmVtZW1iZXIgaXRzIHN0YXJ0aW5nIG1vZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdqdXN0IHNvbWUgdGV4dCcsXG5cdFx0XHRcdCdhbmQgYW5vdGhlciBsaW5lJyxcblx0XHRcdFx0J2FuZCBhbm90aGVyIG9uZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5Xb3JkU2VsZWN0LCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMiwgNilcblx0XHRcdH0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG9TZWxlY3QsIHtcblx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCA4KSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxMiwgMSwgNikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTU4MjM2OiBTaGlmdCBjbGljayBzZWxlY3Rpb24gZG9lcyBub3Qgd29yayBvbiBsaW5lIG51bWJlciBpbmRpY2F0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdqdXN0IHNvbWUgdGV4dCcsXG5cdFx0XHRcdCdhbmQgYW5vdGhlciBsaW5lJyxcblx0XHRcdFx0J2FuZCBhbm90aGVyIG9uZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG8sIHtcblx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbigzLCA1KVxuXHRcdFx0fSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkxpbmVTZWxlY3REcmFnLCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMiwgMSlcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCA1LCAyLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTE1MTM6IFRleHQgZ2V0cyBhdXRvbWF0aWNhbGx5IHNlbGVjdGVkIHdoZW4gdHlwaW5nIGF0IHRoZSBzYW1lIGxvY2F0aW9uIGluIGFub3RoZXIgZWRpdG9yJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnanVzdCcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnc29tZSB0ZXh0Jyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvcjEsIHZpZXdNb2RlbDEpID0+IHtcblx0XHRcdGVkaXRvcjEuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSlcblx0XHRcdF0pO1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvcjIsIHZpZXdNb2RlbDIpID0+IHtcblx0XHRcdFx0ZWRpdG9yMi5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHR2aWV3TW9kZWwyLnR5cGUoJ2UnLCAna2V5Ym9hcmQnKTtcblx0XHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbDIsIG5ldyBQb3NpdGlvbigyLCAyKSk7XG5cdFx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwxLCBuZXcgUG9zaXRpb24oMiwgMikpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdVbmRvIHN0b3BzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3RoZXJlIGlzIGFuIHVuZG8gc3RvcCBiZXR3ZWVuIHR5cGluZyBhbmQgZGVsZXRpbmcgbGVmdCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J0EgIGxpbmUnLFxuXHRcdFx0XHQnQW5vdGhlciBsaW5lJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnZmlyc3QnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0EgZmlyc3QgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnQSBmaXIgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBIGZpcnN0IGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnQSAgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZXJlIGlzIGFuIHVuZG8gc3RvcCBiZXR3ZWVuIHR5cGluZyBhbmQgZGVsZXRpbmcgcmlnaHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdBICBsaW5lJyxcblx0XHRcdFx0J0Fub3RoZXIgbGluZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2ZpcnN0JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBIGZpcnN0IGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnQSBmaXJzdGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBIGZpcnN0IGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnQSAgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZXJlIGlzIGFuIHVuZG8gc3RvcCBiZXR3ZWVuIGRlbGV0aW5nIGxlZnQgYW5kIHR5cGluZycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J0EgIGxpbmUnLFxuXHRcdFx0XHQnQW5vdGhlciBsaW5lJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDIsIDgsIDIsIDgpXSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnU2Vjb25kJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdTZWNvbmQgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA3LCAyLCA3KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdBbm90aGVyIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgOCwgMiwgOCkpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGVyZSBpcyBhbiB1bmRvIHN0b3AgYmV0d2VlbiBkZWxldGluZyBsZWZ0IGFuZCBkZWxldGluZyByaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J0EgIGxpbmUnLFxuXHRcdFx0XHQnQW5vdGhlciBsaW5lJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDIsIDgsIDIsIDgpXSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ0Fub3RoZXIgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA4LCAyLCA4KSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZXJlIGlzIGFuIHVuZG8gc3RvcCBiZXR3ZWVuIGRlbGV0aW5nIHJpZ2h0IGFuZCB0eXBpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdBICBsaW5lJyxcblx0XHRcdFx0J0Fub3RoZXIgbGluZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigyLCA5LCAyLCA5KV0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdBbm90aGVyICcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA5LCAyLCA5KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd0ZXh0JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdBbm90aGVyIHRleHQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMTMsIDIsIDEzKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdBbm90aGVyICcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA5LCAyLCA5KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdBbm90aGVyIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgOSwgMiwgOSkpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGVyZSBpcyBhbiB1bmRvIHN0b3AgYmV0d2VlbiBkZWxldGluZyByaWdodCBhbmQgZGVsZXRpbmcgbGVmdCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J0EgIGxpbmUnLFxuXHRcdFx0XHQnQW5vdGhlciBsaW5lJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDIsIDksIDIsIDkpXSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ0Fub3RoZXIgJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDksIDIsIDkpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnQW4nKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMywgMiwgMykpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnQW5vdGhlciAnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgOSwgMiwgOSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnQW5vdGhlciBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDksIDIsIDkpKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0cyB1bmRvIHN0b3Agd2hlbiB0eXBpbmcgc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdBICBsaW5lJyxcblx0XHRcdFx0J0Fub3RoZXIgbGluZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2ZpcnN0IGFuZCBpbnRlcmVzdGluZycsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnQSBmaXJzdCBhbmQgaW50ZXJlc3RpbmcgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAyNCwgMSwgMjQpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0EgZmlyc3QgYW5kIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDEyKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBIGZpcnN0IGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnQSAgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiB1bmRvIHR5cGluZyBhbmQgRU9MIGNoYW5nZSBpbiBvbmUgdW5kbyBzdG9wJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnQSAgbGluZScsXG5cdFx0XHRcdCdBbm90aGVyIGxpbmUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdmaXJzdCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdBIGZpcnN0IGxpbmVcXG5Bbm90aGVyIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCkpO1xuXG5cdFx0XHRtb2RlbC5wdXNoRU9MKEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdBIGZpcnN0IGxpbmVcXHJcXG5Bbm90aGVyIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgOCkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdBICBsaW5lXFxuQW5vdGhlciBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzkzNTg1OiBVbmRvIG11bHRpIGN1cnNvciBlZGl0IGNvcnJ1cHRzIGRvY3VtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHQnaGVsbG8gd29ybGQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDcsIDIsIDEyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA3LCAxLCAxMiksXG5cdFx0XHRdKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdubycsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdoZWxsbyBub1xcbmhlbGxvIG5vJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2hlbGxvIHdvcmxkXFxuaGVsbG8gd29ybGQnKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndGhlcmUgaXMgYSBzaW5nbGUgdW5kbyBzdG9wIGZvciBjb25zZWN1dGl2ZSB3aGl0ZXNwYWNlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0Jydcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2EnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdiJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnICcsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyAnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdjJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnZCcsICdrZXlib2FyZCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdhYiAgY2QnLCAnYXNzZXJ0MScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnYWIgICcsICdhc3NlcnQyJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdhYicsICdhc3NlcnQzJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICcnLCAnYXNzZXJ0NCcpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGVyZSBpcyBubyB1bmRvIHN0b3AgYWZ0ZXIgYSBzaW5nbGUgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0Jydcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2EnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdiJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnICcsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2MnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdkJywgJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ2FiIGNkJywgJ2Fzc2VydDEnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ2FiJywgJ2Fzc2VydDMnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJycsICdhc3NlcnQ0Jyk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdPdmVydHlwZSBNb2RlJywgKCkgPT4ge1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRJbnB1dE1vZGUuc2V0SW5wdXRNb2RlKCdvdmVydHlwZScpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0SW5wdXRNb2RlLnNldElucHV0TW9kZSgnaW5zZXJ0Jyk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3NpbXBsZSB0eXBlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdhJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksIFtcblx0XHRcdFx0JzEyYTQ1Njc4OScsXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJ2Fzc2VydDEnKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA5LCAxLCA5KV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2JiYicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCBbXG5cdFx0XHRcdCcxMmE0NTY3OGJiYicsXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJ2Fzc2VydDInKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGktbGluZSBzZWxlY3Rpb24gdHlwZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDUsIDIsIDMpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnY2MnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgW1xuXHRcdFx0XHQnMTIzNGNjNDU2Nzg5Jyxcblx0XHRcdF0uam9pbignXFxuJyksICdhc3NlcnQxJyk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZSBwYXN0ZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXSk7XG5cdFx0XHR2aWV3TW9kZWwucGFzdGUoJ2NjJywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCBbXG5cdFx0XHRcdCcxMjM0Y2M3ODknLFxuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdF0uam9pbignXFxuJyksICdhc3NlcnQxJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSldKTtcblx0XHRcdHZpZXdNb2RlbC5wYXN0ZSgnZGRkZGRkZGQnLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksIFtcblx0XHRcdFx0JzEyMzRkZGRkZGRkZCcsXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJ2Fzc2VydDInKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGktbGluZSBzZWxlY3Rpb24gcGFzdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA1LCAyLCAzKV0pO1xuXHRcdFx0dmlld01vZGVsLnBhc3RlKCdjYycsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgW1xuXHRcdFx0XHQnMTIzNGNjNDU2Nzg5Jyxcblx0XHRcdF0uam9pbignXFxuJyksICdhc3NlcnQxJyk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bhc3RlIG11bHRpLWxpbmUgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXSk7XG5cdFx0XHR2aWV3TW9kZWwucGFzdGUoW1xuXHRcdFx0XHQnYWFhYWFhYScsXG5cdFx0XHRcdCdiYmJiYmJiJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCBbXG5cdFx0XHRcdCcxMjM0YWFhYWFhYScsXG5cdFx0XHRcdCdiYmJiYmJiJyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnYXNzZXJ0MScpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wb3NpdGlvbiB0eXBlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSldKTtcblx0XHRcdHZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcdTMwQkInLCAwLCAwLCAwLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgW1xuXHRcdFx0XHQnMTIzNFx1MzBCQjU2Nzg5Jyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnYXNzZXJ0MScpO1xuXG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksIFtcblx0XHRcdFx0JzEyMzRcdTMwQkI2Nzg5Jyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnYXNzZXJ0MScpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCLDhCQUE4QjtBQUU1RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFHMUIsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsMkJBQXlELDRCQUE0QjtBQUM5RixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFxQztBQUM5QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHFCQUFxQix5QkFBcUM7QUFDbkUsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBOEQsMEJBQTBCLDJCQUEyQiwwQkFBMEI7QUFDN0ksU0FBMkMsaUJBQWlCLDRCQUE0QjtBQUV4RixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1CQUFtQjtBQUk1QixTQUFTLE9BQU8sUUFBeUIsV0FBc0IsWUFBb0IsUUFBZ0Isa0JBQTJCLE9BQU87QUFDcEksTUFBSSxpQkFBaUI7QUFDcEIsMkJBQXVCLGFBQWEscUJBQXFCLFdBQVc7QUFBQSxNQUNuRSxVQUFVLElBQUksU0FBUyxZQUFZLE1BQU07QUFBQSxJQUMxQyxDQUFDO0FBQUEsRUFDRixPQUFPO0FBQ04sMkJBQXVCLE9BQU8scUJBQXFCLFdBQVc7QUFBQSxNQUM3RCxVQUFVLElBQUksU0FBUyxZQUFZLE1BQU07QUFBQSxJQUMxQyxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBRUEsU0FBUyxTQUFTLFFBQXlCLFdBQXNCLGtCQUEyQixPQUFPO0FBQ2xHLE1BQUksaUJBQWlCO0FBQ3BCLDJCQUF1Qixp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YyxRQUFRO0FBQUEsUUFDL0IsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDMUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3pCLENBQUM7QUFDRCxtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDMUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3pCLENBQUM7QUFFRCxnQkFBVSxRQUFRLFdBQVcsSUFBSTtBQUNqQyxtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDMUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3pCLENBQUM7QUFFRCxnQkFBVSxRQUFRLFdBQVcsSUFBSTtBQUNqQyxtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEs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QUEsRUFDZixDQUFDO0FBRUQsT0FBSyxvQkFBb0IsTUFBTTtBQUM5QixVQUFNLFFBQVE7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxRQUNDLGNBQWM7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUVBLHVCQUFtQixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNwRCxnQkFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDM0QsZ0JBQVUsaUJBQWlCO0FBQzNCLGdCQUFVLGdCQUFnQixVQUFLLEdBQUcsR0FBRyxHQUFHLFVBQVU7QUFDbEQsYUFBTyxZQUFZLE1BQU0sU0FBUyxvQkFBb0IsRUFBRSxHQUFHO0FBQUEsUUFDMUQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSSxHQUFHLFNBQVM7QUFFdkIsZ0JBQVUsZUFBZSxVQUFVO0FBQ25DLGFBQU8sWUFBWSxNQUFNLFNBQVMsb0JBQW9CLEVBQUUsR0FBRztBQUFBLFFBQzFEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUksR0FBRyxTQUFTO0FBQUEsSUFDeEIsQ0FBQztBQUVELFVBQU0sUUFBUTtBQUFBLEVBQ2YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImNyZWF0ZVRleHRNb2RlbCIsICJ3aXRoVGVzdENvZGVFZGl0b3IiLCAiQXV0b0Nsb3NpbmdDb2x1bW5UeXBlIiwgIm1vZGVsIiwgInZpZXdNb2RlbCJdCn0K
