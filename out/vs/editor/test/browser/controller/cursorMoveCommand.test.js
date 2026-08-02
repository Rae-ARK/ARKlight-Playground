import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CoreNavigationCommands } from "../../../browser/coreCommands.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { CursorMove } from "../../../common/cursor/cursorMoveCommands.js";
import { withTestCodeEditor } from "../testCodeEditor.js";
suite("Cursor move command test", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const TEXT = [
    "    	My First Line	 ",
    "	My Second Line",
    "    Third Line\u{1F436}",
    "",
    "1"
  ].join("\n");
  function executeTest(callback) {
    withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
      callback(editor, viewModel);
    });
  }
  test("move left should move to left character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveLeft(viewModel);
      cursorEqual(viewModel, 1, 7);
    });
  });
  test("move left should move to left by n characters", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveLeft(viewModel, 3);
      cursorEqual(viewModel, 1, 5);
    });
  });
  test("move left should move to left by half line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveLeft(viewModel, 1, CursorMove.RawUnit.HalfLine);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move left moves to previous line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 2, 3);
      moveLeft(viewModel, 10);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move right should move to right character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 5);
      moveRight(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move right should move to right by n characters", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 2);
      moveRight(viewModel, 6);
      cursorEqual(viewModel, 1, 8);
    });
  });
  test("move right should move to right by half line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 4);
      moveRight(viewModel, 1, CursorMove.RawUnit.HalfLine);
      cursorEqual(viewModel, 1, 14);
    });
  });
  test("move right moves to next line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveRight(viewModel, 100);
      cursorEqual(viewModel, 2, 1);
    });
  });
  test("move to first character of line from middle", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineStart(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move to first character of line from first non white space character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 6);
      moveToLineStart(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move to first character of line from first character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 1);
      moveToLineStart(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move to first non white space character of line from middle", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineFirstNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move to first non white space character of line from first non white space character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 6);
      moveToLineFirstNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move to first non white space character of line from first character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 1);
      moveToLineFirstNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move to end of line from middle", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineEnd(viewModel);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move to end of line from last non white space character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 19);
      moveToLineEnd(viewModel);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move to end of line from line end", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 21);
      moveToLineEnd(viewModel);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move to last non white space character from middle", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineLastNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 19);
    });
  });
  test("move to last non white space character from last non white space character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 19);
      moveToLineLastNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 19);
    });
  });
  test("move to last non white space character from line end", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 21);
      moveToLineLastNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 19);
    });
  });
  test("move to center of line not from center", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineCenter(viewModel);
      cursorEqual(viewModel, 1, 11);
    });
  });
  test("move to center of line from center", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 11);
      moveToLineCenter(viewModel);
      cursorEqual(viewModel, 1, 11);
    });
  });
  test("move to center of line from start", () => {
    executeTest((editor, viewModel) => {
      moveToLineStart(viewModel);
      moveToLineCenter(viewModel);
      cursorEqual(viewModel, 1, 11);
    });
  });
  test("move to center of line from end", () => {
    executeTest((editor, viewModel) => {
      moveToLineEnd(viewModel);
      moveToLineCenter(viewModel);
      cursorEqual(viewModel, 1, 11);
    });
  });
  test("move up by cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 3, 5);
      cursorEqual(viewModel, 3, 5);
      moveUp(viewModel, 2);
      cursorEqual(viewModel, 1, 5);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move up by model line cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 3, 5);
      cursorEqual(viewModel, 3, 5);
      moveUpByModelLine(viewModel, 2);
      cursorEqual(viewModel, 1, 5);
      moveUpByModelLine(viewModel, 1);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move down by model line cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 3, 5);
      cursorEqual(viewModel, 3, 5);
      moveDownByModelLine(viewModel, 2);
      cursorEqual(viewModel, 5, 2);
      moveDownByModelLine(viewModel, 1);
      cursorEqual(viewModel, 5, 2);
    });
  });
  test("move up with selection by cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 3, 5);
      cursorEqual(viewModel, 3, 5);
      moveUp(viewModel, 1, true);
      cursorEqual(viewModel, 2, 2, 3, 5);
      moveUp(viewModel, 1, true);
      cursorEqual(viewModel, 1, 5, 3, 5);
    });
  });
  test("move up and down with tabs by cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 5);
      cursorEqual(viewModel, 1, 5);
      moveDown(viewModel, 4);
      cursorEqual(viewModel, 5, 2);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 4, 1);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 3, 5);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 2, 2);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 1, 5);
    });
  });
  test("move up and down with end of lines starting from a long one by cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveToEndOfLine(viewModel);
      cursorEqual(viewModel, 1, 21);
      moveToEndOfLine(viewModel);
      cursorEqual(viewModel, 1, 21);
      moveDown(viewModel, 2);
      cursorEqual(viewModel, 3, 17);
      moveDown(viewModel, 1);
      cursorEqual(viewModel, 4, 1);
      moveDown(viewModel, 1);
      cursorEqual(viewModel, 5, 2);
      moveUp(viewModel, 4);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move to view top line moves to first visible line if it is first line", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 10, 1);
      moveTo(viewModel, 2, 2);
      moveToTop(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move to view top line moves to top visible line when first line is not visible", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(2, 1, 10, 1);
      moveTo(viewModel, 4, 1);
      moveToTop(viewModel);
      cursorEqual(viewModel, 2, 2);
    });
  });
  test("move to view top line moves to nth line from top", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 10, 1);
      moveTo(viewModel, 4, 1);
      moveToTop(viewModel, 3);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view top line moves to last line if n is greater than last visible line number", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 3, 1);
      moveTo(viewModel, 2, 2);
      moveToTop(viewModel, 4);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view center line moves to the center line", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(3, 1, 3, 1);
      moveTo(viewModel, 2, 2);
      moveToCenter(viewModel);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view bottom line moves to last visible line if it is last line", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 5, 1);
      moveTo(viewModel, 2, 2);
      moveToBottom(viewModel);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move to view bottom line moves to last visible line when last line is not visible", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(2, 1, 3, 1);
      moveTo(viewModel, 2, 2);
      moveToBottom(viewModel);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view bottom line moves to nth line from bottom", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 5, 1);
      moveTo(viewModel, 4, 1);
      moveToBottom(viewModel, 3);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view bottom line moves to first line if n is lesser than first visible line number", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(2, 1, 5, 1);
      moveTo(viewModel, 4, 1);
      moveToBottom(viewModel, 5);
      cursorEqual(viewModel, 2, 2);
    });
  });
});
suite("Cursor move by blankline test", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const TEXT = [
    "    	My First Line	 ",
    "	My Second Line",
    "    Third Line\u{1F436}",
    "",
    "1",
    "2",
    "3",
    "",
    "         ",
    "a",
    "b"
  ].join("\n");
  function executeTest(callback) {
    withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
      callback(editor, viewModel);
    });
  }
  test("move down should move to start of next blank line", () => {
    executeTest((editor, viewModel) => {
      moveDownByBlankLine(viewModel, false);
      cursorEqual(viewModel, 4, 1);
    });
  });
  test("move up should move to start of previous blank line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 7, 1);
      moveUpByBlankLine(viewModel, false);
      cursorEqual(viewModel, 4, 1);
    });
  });
  test("move down should skip over whitespace if already on blank line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 8, 1);
      moveDownByBlankLine(viewModel, false);
      cursorEqual(viewModel, 11, 1);
    });
  });
  test("move up should skip over whitespace if already on blank line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 9, 1);
      moveUpByBlankLine(viewModel, false);
      cursorEqual(viewModel, 4, 1);
    });
  });
  test("move up should go to first column of first line if not empty", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 2, 1);
      moveUpByBlankLine(viewModel, false);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move down should go to first column of last line if not empty", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 10, 1);
      moveDownByBlankLine(viewModel, false);
      cursorEqual(viewModel, 11, 1);
    });
  });
  test("select down should select to start of next blank line", () => {
    executeTest((editor, viewModel) => {
      moveDownByBlankLine(viewModel, true);
      selectionEqual(viewModel.getSelection(), 4, 1, 1, 1);
    });
  });
  test("select up should select to start of previous blank line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 7, 1);
      moveUpByBlankLine(viewModel, true);
      selectionEqual(viewModel.getSelection(), 4, 1, 7, 1);
    });
  });
});
suite("Cursor move command - foldedLine unit", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function executeFoldTest(callback) {
    withTestCodeEditor([
      "line1",
      "line2",
      "line3",
      "line4",
      "line5"
    ].join("\n"), {}, (editor, viewModel) => {
      callback(editor, viewModel);
    });
  }
  test("move down by foldedLine skips a fold below the cursor", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(4, 1, 4, 1)]);
      moveTo(viewModel, 2, 1);
      moveDownByFoldedLine(viewModel);
      cursorEqual(viewModel, 3, 1);
      moveDownByFoldedLine(viewModel);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move up by foldedLine skips a fold above the cursor", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(3, 1, 3, 1)]);
      moveTo(viewModel, 4, 1);
      moveUpByFoldedLine(viewModel);
      cursorEqual(viewModel, 2, 1);
      moveUpByFoldedLine(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move down by foldedLine with count treats each fold as one step", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(3, 1, 3, 1)]);
      moveTo(viewModel, 1, 1);
      moveDownByFoldedLine(viewModel, 3);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move down by foldedLine skips a multi-line fold as one step", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(2, 1, 4, 1)]);
      moveTo(viewModel, 1, 1);
      moveDownByFoldedLine(viewModel);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move down by foldedLine at last line stays at last line", () => {
    executeFoldTest((editor, viewModel) => {
      moveTo(viewModel, 5, 1);
      moveDownByFoldedLine(viewModel);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move up by foldedLine at first line stays at first line", () => {
    executeFoldTest((editor, viewModel) => {
      moveTo(viewModel, 1, 1);
      moveUpByFoldedLine(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move down by foldedLine with count clamps to last visible line after fold", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(2, 1, 4, 1)]);
      moveTo(viewModel, 1, 1);
      moveDownByFoldedLine(viewModel, 2);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move up by foldedLine with count clamps to first visible line before fold", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(2, 1, 4, 1)]);
      moveTo(viewModel, 5, 1);
      moveUpByFoldedLine(viewModel, 2);
      cursorEqual(viewModel, 1, 1);
    });
  });
});
function move(viewModel, args) {
  CoreNavigationCommands.CursorMove.runCoreEditorCommand(viewModel, args);
}
function moveToLineStart(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineStart });
}
function moveToLineFirstNonWhitespaceCharacter(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineFirstNonWhitespaceCharacter });
}
function moveToLineCenter(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineColumnCenter });
}
function moveToLineEnd(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineEnd });
}
function moveToLineLastNonWhitespaceCharacter(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineLastNonWhitespaceCharacter });
}
function moveLeft(viewModel, value, by, select) {
  move(viewModel, { to: CursorMove.RawDirection.Left, by, value, select });
}
function moveRight(viewModel, value, by, select) {
  move(viewModel, { to: CursorMove.RawDirection.Right, by, value, select });
}
function moveUp(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Up, by: CursorMove.RawUnit.WrappedLine, value: noOfLines, select });
}
function moveUpByBlankLine(viewModel, select) {
  move(viewModel, { to: CursorMove.RawDirection.PrevBlankLine, by: CursorMove.RawUnit.WrappedLine, select });
}
function moveUpByModelLine(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Up, value: noOfLines, select });
}
function moveDown(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Down, by: CursorMove.RawUnit.WrappedLine, value: noOfLines, select });
}
function moveDownByBlankLine(viewModel, select) {
  move(viewModel, { to: CursorMove.RawDirection.NextBlankLine, by: CursorMove.RawUnit.WrappedLine, select });
}
function moveDownByModelLine(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Down, value: noOfLines, select });
}
function moveDownByFoldedLine(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Down, by: CursorMove.RawUnit.FoldedLine, value: noOfLines, select });
}
function moveUpByFoldedLine(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Up, by: CursorMove.RawUnit.FoldedLine, value: noOfLines, select });
}
function moveToTop(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.ViewPortTop, value: noOfLines, select });
}
function moveToCenter(viewModel, select) {
  move(viewModel, { to: CursorMove.RawDirection.ViewPortCenter, select });
}
function moveToBottom(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.ViewPortBottom, value: noOfLines, select });
}
function cursorEqual(viewModel, posLineNumber, posColumn, selLineNumber = posLineNumber, selColumn = posColumn) {
  positionEqual(viewModel.getPosition(), posLineNumber, posColumn);
  selectionEqual(viewModel.getSelection(), posLineNumber, posColumn, selLineNumber, selColumn);
}
function positionEqual(position, lineNumber, column) {
  assert.deepStrictEqual(position, new Position(lineNumber, column), "position equal");
}
function selectionEqual(selection, posLineNumber, posColumn, selLineNumber, selColumn) {
  assert.deepStrictEqual({
    selectionStartLineNumber: selection.selectionStartLineNumber,
    selectionStartColumn: selection.selectionStartColumn,
    positionLineNumber: selection.positionLineNumber,
    positionColumn: selection.positionColumn
  }, {
    selectionStartLineNumber: selLineNumber,
    selectionStartColumn: selColumn,
    positionLineNumber: posLineNumber,
    positionColumn: posColumn
  }, "selection equal");
}
function moveTo(viewModel, lineNumber, column, inSelectionMode = false) {
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
function moveToEndOfLine(viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorEndSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorEnd.runCoreEditorCommand(viewModel, {});
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvY29udHJvbGxlci9jdXJzb3JNb3ZlQ29tbWFuZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb3JlTmF2aWdhdGlvbkNvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDdXJzb3JNb3ZlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvci9jdXJzb3JNb3ZlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IElUZXN0Q29kZUVkaXRvciwgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vdGVzdENvZGVFZGl0b3IuanMnO1xuXG5zdWl0ZSgnQ3Vyc29yIG1vdmUgY29tbWFuZCB0ZXN0JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IFRFWFQgPSBbXG5cdFx0JyAgICBcXHRNeSBGaXJzdCBMaW5lXFx0ICcsXG5cdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHQnICAgIFRoaXJkIExpbmVcdUQ4M0RcdURDMzYnLFxuXHRcdCcnLFxuXHRcdCcxJ1xuXHRdLmpvaW4oJ1xcbicpO1xuXG5cdGZ1bmN0aW9uIGV4ZWN1dGVUZXN0KGNhbGxiYWNrOiAoZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IsIHZpZXdNb2RlbDogVmlld01vZGVsKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFRFWFQsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNhbGxiYWNrKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ21vdmUgbGVmdCBzaG91bGQgbW92ZSB0byBsZWZ0IGNoYXJhY3RlcicsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDgpO1xuXHRcdFx0bW92ZUxlZnQodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgbGVmdCBzaG91bGQgbW92ZSB0byBsZWZ0IGJ5IG4gY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDgpO1xuXHRcdFx0bW92ZUxlZnQodmlld01vZGVsLCAzKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgbGVmdCBzaG91bGQgbW92ZSB0byBsZWZ0IGJ5IGhhbGYgbGluZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDgpO1xuXHRcdFx0bW92ZUxlZnQodmlld01vZGVsLCAxLCBDdXJzb3JNb3ZlLlJhd1VuaXQuSGFsZkxpbmUpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBsZWZ0IG1vdmVzIHRvIHByZXZpb3VzIGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAyLCAzKTtcblx0XHRcdG1vdmVMZWZ0KHZpZXdNb2RlbCwgMTApO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAyMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgcmlnaHQgc2hvdWxkIG1vdmUgdG8gcmlnaHQgY2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgNSk7XG5cdFx0XHRtb3ZlUmlnaHQodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgcmlnaHQgc2hvdWxkIG1vdmUgdG8gcmlnaHQgYnkgbiBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMik7XG5cdFx0XHRtb3ZlUmlnaHQodmlld01vZGVsLCA2KTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgcmlnaHQgc2hvdWxkIG1vdmUgdG8gcmlnaHQgYnkgaGFsZiBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgNCk7XG5cdFx0XHRtb3ZlUmlnaHQodmlld01vZGVsLCAxLCBDdXJzb3JNb3ZlLlJhd1VuaXQuSGFsZkxpbmUpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxNCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgcmlnaHQgbW92ZXMgdG8gbmV4dCBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlUmlnaHQodmlld01vZGVsLCAxMDApO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAyLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBmaXJzdCBjaGFyYWN0ZXIgb2YgbGluZSBmcm9tIG1pZGRsZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDgpO1xuXHRcdFx0bW92ZVRvTGluZVN0YXJ0KHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGZpcnN0IGNoYXJhY3RlciBvZiBsaW5lIGZyb20gZmlyc3Qgbm9uIHdoaXRlIHNwYWNlIGNoYXJhY3RlcicsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDYpO1xuXHRcdFx0bW92ZVRvTGluZVN0YXJ0KHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGZpcnN0IGNoYXJhY3RlciBvZiBsaW5lIGZyb20gZmlyc3QgY2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0XHRtb3ZlVG9MaW5lU3RhcnQodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZmlyc3Qgbm9uIHdoaXRlIHNwYWNlIGNoYXJhY3RlciBvZiBsaW5lIGZyb20gbWlkZGxlJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlVG9MaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDYpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGZpcnN0IG5vbiB3aGl0ZSBzcGFjZSBjaGFyYWN0ZXIgb2YgbGluZSBmcm9tIGZpcnN0IG5vbiB3aGl0ZSBzcGFjZSBjaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCA2KTtcblx0XHRcdG1vdmVUb0xpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXIodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZmlyc3Qgbm9uIHdoaXRlIHNwYWNlIGNoYXJhY3RlciBvZiBsaW5lIGZyb20gZmlyc3QgY2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0XHRtb3ZlVG9MaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDYpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lIGZyb20gbWlkZGxlJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlVG9MaW5lRW5kKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDIxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgbGluZSBmcm9tIGxhc3Qgbm9uIHdoaXRlIHNwYWNlIGNoYXJhY3RlcicsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDE5KTtcblx0XHRcdG1vdmVUb0xpbmVFbmQodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMjEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lIGZyb20gbGluZSBlbmQnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCAyMSk7XG5cdFx0XHRtb3ZlVG9MaW5lRW5kKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDIxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBsYXN0IG5vbiB3aGl0ZSBzcGFjZSBjaGFyYWN0ZXIgZnJvbSBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCA4KTtcblx0XHRcdG1vdmVUb0xpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcih2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxOSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gbGFzdCBub24gd2hpdGUgc3BhY2UgY2hhcmFjdGVyIGZyb20gbGFzdCBub24gd2hpdGUgc3BhY2UgY2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMTkpO1xuXHRcdFx0bW92ZVRvTGluZUxhc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDE5KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBsYXN0IG5vbiB3aGl0ZSBzcGFjZSBjaGFyYWN0ZXIgZnJvbSBsaW5lIGVuZCcsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDIxKTtcblx0XHRcdG1vdmVUb0xpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcih2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxOSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gY2VudGVyIG9mIGxpbmUgbm90IGZyb20gY2VudGVyJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlVG9MaW5lQ2VudGVyKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDExKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBjZW50ZXIgb2YgbGluZSBmcm9tIGNlbnRlcicsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDExKTtcblx0XHRcdG1vdmVUb0xpbmVDZW50ZXIodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMTEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGNlbnRlciBvZiBsaW5lIGZyb20gc3RhcnQnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG9MaW5lU3RhcnQodmlld01vZGVsKTtcblx0XHRcdG1vdmVUb0xpbmVDZW50ZXIodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMTEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGNlbnRlciBvZiBsaW5lIGZyb20gZW5kJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvTGluZUVuZCh2aWV3TW9kZWwpO1xuXHRcdFx0bW92ZVRvTGluZUNlbnRlcih2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgYnkgY3Vyc29yIG1vdmUgY29tbWFuZCcsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDMsIDUpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAzLCA1KTtcblxuXHRcdFx0bW92ZVVwKHZpZXdNb2RlbCwgMik7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDUpO1xuXG5cdFx0XHRtb3ZlVXAodmlld01vZGVsLCAxKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgYnkgbW9kZWwgbGluZSBjdXJzb3IgbW92ZSBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMywgNSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDMsIDUpO1xuXG5cdFx0XHRtb3ZlVXBCeU1vZGVsTGluZSh2aWV3TW9kZWwsIDIpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA1KTtcblxuXHRcdFx0bW92ZVVwQnlNb2RlbExpbmUodmlld01vZGVsLCAxKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgZG93biBieSBtb2RlbCBsaW5lIGN1cnNvciBtb3ZlIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAzLCA1KTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMywgNSk7XG5cblx0XHRcdG1vdmVEb3duQnlNb2RlbExpbmUodmlld01vZGVsLCAyKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNSwgMik7XG5cblx0XHRcdG1vdmVEb3duQnlNb2RlbExpbmUodmlld01vZGVsLCAxKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNSwgMik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgd2l0aCBzZWxlY3Rpb24gYnkgY3Vyc29yIG1vdmUgY29tbWFuZCcsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDMsIDUpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAzLCA1KTtcblxuXHRcdFx0bW92ZVVwKHZpZXdNb2RlbCwgMSwgdHJ1ZSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDIsIDIsIDMsIDUpO1xuXG5cdFx0XHRtb3ZlVXAodmlld01vZGVsLCAxLCB0cnVlKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNSwgMywgNSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgYW5kIGRvd24gd2l0aCB0YWJzIGJ5IGN1cnNvciBtb3ZlIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCA1KTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNSk7XG5cblx0XHRcdG1vdmVEb3duKHZpZXdNb2RlbCwgNCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDUsIDIpO1xuXG5cdFx0XHRtb3ZlVXAodmlld01vZGVsLCAxKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNCwgMSk7XG5cblx0XHRcdG1vdmVVcCh2aWV3TW9kZWwsIDEpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAzLCA1KTtcblxuXHRcdFx0bW92ZVVwKHZpZXdNb2RlbCwgMSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDIsIDIpO1xuXG5cdFx0XHRtb3ZlVXAodmlld01vZGVsLCAxKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgYW5kIGRvd24gd2l0aCBlbmQgb2YgbGluZXMgc3RhcnRpbmcgZnJvbSBhIGxvbmcgb25lIGJ5IGN1cnNvciBtb3ZlIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMjEpO1xuXG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMjEpO1xuXG5cdFx0XHRtb3ZlRG93bih2aWV3TW9kZWwsIDIpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAzLCAxNyk7XG5cblx0XHRcdG1vdmVEb3duKHZpZXdNb2RlbCwgMSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDQsIDEpO1xuXG5cdFx0XHRtb3ZlRG93bih2aWV3TW9kZWwsIDEpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCA1LCAyKTtcblxuXHRcdFx0bW92ZVVwKHZpZXdNb2RlbCwgNCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDIxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byB2aWV3IHRvcCBsaW5lIG1vdmVzIHRvIGZpcnN0IHZpc2libGUgbGluZSBpZiBpdCBpcyBmaXJzdCBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLmdldENvbXBsZXRlbHlWaXNpYmxlVmlld1JhbmdlID0gKCkgPT4gbmV3IFJhbmdlKDEsIDEsIDEwLCAxKTtcblxuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMiwgMik7XG5cdFx0XHRtb3ZlVG9Ub3Aodmlld01vZGVsKTtcblxuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA2KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byB2aWV3IHRvcCBsaW5lIG1vdmVzIHRvIHRvcCB2aXNpYmxlIGxpbmUgd2hlbiBmaXJzdCBsaW5lIGlzIG5vdCB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLmdldENvbXBsZXRlbHlWaXNpYmxlVmlld1JhbmdlID0gKCkgPT4gbmV3IFJhbmdlKDIsIDEsIDEwLCAxKTtcblxuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgNCwgMSk7XG5cdFx0XHRtb3ZlVG9Ub3Aodmlld01vZGVsKTtcblxuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAyLCAyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byB2aWV3IHRvcCBsaW5lIG1vdmVzIHRvIG50aCBsaW5lIGZyb20gdG9wJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLmdldENvbXBsZXRlbHlWaXNpYmxlVmlld1JhbmdlID0gKCkgPT4gbmV3IFJhbmdlKDEsIDEsIDEwLCAxKTtcblxuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgNCwgMSk7XG5cdFx0XHRtb3ZlVG9Ub3Aodmlld01vZGVsLCAzKTtcblxuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAzLCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byB2aWV3IHRvcCBsaW5lIG1vdmVzIHRvIGxhc3QgbGluZSBpZiBuIGlzIGdyZWF0ZXIgdGhhbiBsYXN0IHZpc2libGUgbGluZSBudW1iZXInLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UgPSAoKSA9PiBuZXcgUmFuZ2UoMSwgMSwgMywgMSk7XG5cblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDIsIDIpO1xuXHRcdFx0bW92ZVRvVG9wKHZpZXdNb2RlbCwgNCk7XG5cblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMywgNSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gdmlldyBjZW50ZXIgbGluZSBtb3ZlcyB0byB0aGUgY2VudGVyIGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UgPSAoKSA9PiBuZXcgUmFuZ2UoMywgMSwgMywgMSk7XG5cblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDIsIDIpO1xuXHRcdFx0bW92ZVRvQ2VudGVyKHZpZXdNb2RlbCk7XG5cblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMywgNSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gdmlldyBib3R0b20gbGluZSBtb3ZlcyB0byBsYXN0IHZpc2libGUgbGluZSBpZiBpdCBpcyBsYXN0IGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UgPSAoKSA9PiBuZXcgUmFuZ2UoMSwgMSwgNSwgMSk7XG5cblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDIsIDIpO1xuXHRcdFx0bW92ZVRvQm90dG9tKHZpZXdNb2RlbCk7XG5cblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gdmlldyBib3R0b20gbGluZSBtb3ZlcyB0byBsYXN0IHZpc2libGUgbGluZSB3aGVuIGxhc3QgbGluZSBpcyBub3QgdmlzaWJsZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5nZXRDb21wbGV0ZWx5VmlzaWJsZVZpZXdSYW5nZSA9ICgpID0+IG5ldyBSYW5nZSgyLCAxLCAzLCAxKTtcblxuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMiwgMik7XG5cdFx0XHRtb3ZlVG9Cb3R0b20odmlld01vZGVsKTtcblxuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAzLCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byB2aWV3IGJvdHRvbSBsaW5lIG1vdmVzIHRvIG50aCBsaW5lIGZyb20gYm90dG9tJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLmdldENvbXBsZXRlbHlWaXNpYmxlVmlld1JhbmdlID0gKCkgPT4gbmV3IFJhbmdlKDEsIDEsIDUsIDEpO1xuXG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCA0LCAxKTtcblx0XHRcdG1vdmVUb0JvdHRvbSh2aWV3TW9kZWwsIDMpO1xuXG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDMsIDUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIHZpZXcgYm90dG9tIGxpbmUgbW92ZXMgdG8gZmlyc3QgbGluZSBpZiBuIGlzIGxlc3NlciB0aGFuIGZpcnN0IHZpc2libGUgbGluZSBudW1iZXInLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UgPSAoKSA9PiBuZXcgUmFuZ2UoMiwgMSwgNSwgMSk7XG5cblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDQsIDEpO1xuXHRcdFx0bW92ZVRvQm90dG9tKHZpZXdNb2RlbCwgNSk7XG5cblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMiwgMik7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDdXJzb3IgbW92ZSBieSBibGFua2xpbmUgdGVzdCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBURVhUID0gW1xuXHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdCdcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0JyAgICBUaGlyZCBMaW5lXHVEODNEXHVEQzM2Jyxcblx0XHQnJyxcblx0XHQnMScsXG5cdFx0JzInLFxuXHRcdCczJyxcblx0XHQnJyxcblx0XHQnICAgICAgICAgJyxcblx0XHQnYScsXG5cdFx0J2InLFxuXHRdLmpvaW4oJ1xcbicpO1xuXG5cdGZ1bmN0aW9uIGV4ZWN1dGVUZXN0KGNhbGxiYWNrOiAoZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IsIHZpZXdNb2RlbDogVmlld01vZGVsKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFRFWFQsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNhbGxiYWNrKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ21vdmUgZG93biBzaG91bGQgbW92ZSB0byBzdGFydCBvZiBuZXh0IGJsYW5rIGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlRG93bkJ5QmxhbmtMaW5lKHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCA0LCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB1cCBzaG91bGQgbW92ZSB0byBzdGFydCBvZiBwcmV2aW91cyBibGFuayBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgNywgMSk7XG5cdFx0XHRtb3ZlVXBCeUJsYW5rTGluZSh2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNCwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgZG93biBzaG91bGQgc2tpcCBvdmVyIHdoaXRlc3BhY2UgaWYgYWxyZWFkeSBvbiBibGFuayBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgOCwgMSk7XG5cdFx0XHRtb3ZlRG93bkJ5QmxhbmtMaW5lKHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxMSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgc2hvdWxkIHNraXAgb3ZlciB3aGl0ZXNwYWNlIGlmIGFscmVhZHkgb24gYmxhbmsgbGluZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDksIDEpO1xuXHRcdFx0bW92ZVVwQnlCbGFua0xpbmUodmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHVwIHNob3VsZCBnbyB0byBmaXJzdCBjb2x1bW4gb2YgZmlyc3QgbGluZSBpZiBub3QgZW1wdHknLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAyLCAxKTtcblx0XHRcdG1vdmVVcEJ5QmxhbmtMaW5lKHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBkb3duIHNob3VsZCBnbyB0byBmaXJzdCBjb2x1bW4gb2YgbGFzdCBsaW5lIGlmIG5vdCBlbXB0eScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEwLCAxKTtcblx0XHRcdG1vdmVEb3duQnlCbGFua0xpbmUodmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDExLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0IGRvd24gc2hvdWxkIHNlbGVjdCB0byBzdGFydCBvZiBuZXh0IGJsYW5rIGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlRG93bkJ5QmxhbmtMaW5lKHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRzZWxlY3Rpb25FcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIDQsIDEsIDEsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxlY3QgdXAgc2hvdWxkIHNlbGVjdCB0byBzdGFydCBvZiBwcmV2aW91cyBibGFuayBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgNywgMSk7XG5cdFx0XHRtb3ZlVXBCeUJsYW5rTGluZSh2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0c2VsZWN0aW9uRXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCA0LCAxLCA3LCAxKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuLy8gVGVzdHMgZm9yICdmb2xkZWRMaW5lJyB1bml0OiBtb3ZlcyBieSBtb2RlbCBsaW5lcyBidXQgdHJlYXRzIGVhY2ggZm9sZCBhcyBhIHNpbmdsZSBzdGVwLlxuLy8gVGhpcyBpcyB0aGUgc2VtYW50aWNzIHJlcXVpcmVkIGJ5IHZpbSdzIGovazogbW92ZSB0aHJvdWdoIHZpc2libGUgbGluZXMsIHNraXAgaGlkZGVuIG9uZXMuXG5cbnN1aXRlKCdDdXJzb3IgbW92ZSBjb21tYW5kIC0gZm9sZGVkTGluZSB1bml0JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGV4ZWN1dGVGb2xkVGVzdChjYWxsYmFjazogKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnbGluZTEnLFxuXHRcdFx0J2xpbmUyJyxcblx0XHRcdCdsaW5lMycsXG5cdFx0XHQnbGluZTQnLFxuXHRcdFx0J2xpbmU1Jyxcblx0XHRdLmpvaW4oJ1xcbicpLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjYWxsYmFjayhlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdtb3ZlIGRvd24gYnkgZm9sZGVkTGluZSBza2lwcyBhIGZvbGQgYmVsb3cgdGhlIGN1cnNvcicsICgpID0+IHtcblx0XHRleGVjdXRlRm9sZFRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHQvLyBMaW5lIDQgaXMgaGlkZGVuIChmb2xkZWQgdW5kZXIgbGluZSAzIGFzIGhlYWRlcilcblx0XHRcdHZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhbbmV3IFJhbmdlKDQsIDEsIDQsIDEpXSk7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAyLCAxKTtcblx0XHRcdC8vIGogZnJvbSBsaW5lIDIgXHUyMTkyIGxpbmUgMyAodmlzaWJsZSBmb2xkIGhlYWRlcilcblx0XHRcdG1vdmVEb3duQnlGb2xkZWRMaW5lKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDMsIDEpO1xuXHRcdFx0Ly8gaiBmcm9tIGxpbmUgMyAoZm9sZCBoZWFkZXIpIFx1MjE5MiBsaW5lIDQgaXMgaGlkZGVuLCBsYW5kcyBvbiBsaW5lIDVcblx0XHRcdG1vdmVEb3duQnlGb2xkZWRMaW5lKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDUsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHVwIGJ5IGZvbGRlZExpbmUgc2tpcHMgYSBmb2xkIGFib3ZlIHRoZSBjdXJzb3InLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZUZvbGRUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Ly8gTGluZSAzIGlzIGhpZGRlbiAoZm9sZGVkIHVuZGVyIGxpbmUgMiBhcyBoZWFkZXIpXG5cdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgzLCAxLCAzLCAxKV0pO1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgNCwgMSk7XG5cdFx0XHQvLyBrIGZyb20gbGluZSA0OiBsaW5lIDMgaXMgaGlkZGVuLCBsYW5kcyBvbiBsaW5lIDIgKGZvbGQgaGVhZGVyKVxuXHRcdFx0bW92ZVVwQnlGb2xkZWRMaW5lKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDIsIDEpO1xuXHRcdFx0Ly8gayBmcm9tIGxpbmUgMiBcdTIxOTIgbGluZSAxXG5cdFx0XHRtb3ZlVXBCeUZvbGRlZExpbmUodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgZG93biBieSBmb2xkZWRMaW5lIHdpdGggY291bnQgdHJlYXRzIGVhY2ggZm9sZCBhcyBvbmUgc3RlcCcsICgpID0+IHtcblx0XHRleGVjdXRlRm9sZFRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHQvLyBMaW5lIDMgaXMgaGlkZGVuXG5cdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgzLCAxLCAzLCAxKV0pO1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0XHQvLyAzaiBmcm9tIGxpbmUgMTogc3RlcDFcdTIxOTIyLCBzdGVwMlx1MjE5MjMoaGlkZGVuKVx1MjE5MjQsIHN0ZXAzXHUyMTkyNVxuXHRcdFx0bW92ZURvd25CeUZvbGRlZExpbmUodmlld01vZGVsLCAzKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgZG93biBieSBmb2xkZWRMaW5lIHNraXBzIGEgbXVsdGktbGluZSBmb2xkIGFzIG9uZSBzdGVwJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVGb2xkVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIExpbmVzIDItNCBhcmUgaGlkZGVuIChmb2xkZWQgdW5kZXIgbGluZSAxIGFzIGhlYWRlcilcblx0XHRcdHZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhbbmV3IFJhbmdlKDIsIDEsIDQsIDEpXSk7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCAxKTtcblx0XHRcdC8vIGogZnJvbSBsaW5lIDE6IGxpbmVzIDItNCBhcmUgYWxsIGhpZGRlbiwgbGFuZHMgZGlyZWN0bHkgb24gbGluZSA1XG5cdFx0XHRtb3ZlRG93bkJ5Rm9sZGVkTGluZSh2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCA1LCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBkb3duIGJ5IGZvbGRlZExpbmUgYXQgbGFzdCBsaW5lIHN0YXlzIGF0IGxhc3QgbGluZScsICgpID0+IHtcblx0XHRleGVjdXRlRm9sZFRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCA1LCAxKTtcblx0XHRcdG1vdmVEb3duQnlGb2xkZWRMaW5lKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDUsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHVwIGJ5IGZvbGRlZExpbmUgYXQgZmlyc3QgbGluZSBzdGF5cyBhdCBmaXJzdCBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVGb2xkVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdFx0bW92ZVVwQnlGb2xkZWRMaW5lKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGRvd24gYnkgZm9sZGVkTGluZSB3aXRoIGNvdW50IGNsYW1wcyB0byBsYXN0IHZpc2libGUgbGluZSBhZnRlciBmb2xkJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVGb2xkVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIExpbmVzIDItNCBhcmUgaGlkZGVuLiBWaXNpYmxlIGxpbmVzIGFyZSAxIGFuZCA1LlxuXHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoMiwgMSwgNCwgMSldKTtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdFx0Ly8gMmogc2hvdWxkIGxhbmQgb24gbGluZSA1IGFuZCBjbGFtcCB0aGVyZS5cblx0XHRcdG1vdmVEb3duQnlGb2xkZWRMaW5lKHZpZXdNb2RlbCwgMik7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDUsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHVwIGJ5IGZvbGRlZExpbmUgd2l0aCBjb3VudCBjbGFtcHMgdG8gZmlyc3QgdmlzaWJsZSBsaW5lIGJlZm9yZSBmb2xkJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVGb2xkVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIExpbmVzIDItNCBhcmUgaGlkZGVuLiBWaXNpYmxlIGxpbmVzIGFyZSAxIGFuZCA1LlxuXHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoMiwgMSwgNCwgMSldKTtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDUsIDEpO1xuXHRcdFx0Ly8gMmsgc2hvdWxkIGxhbmQgb24gbGluZSAxIGFuZCBjbGFtcCB0aGVyZS5cblx0XHRcdG1vdmVVcEJ5Rm9sZGVkTGluZSh2aWV3TW9kZWwsIDIpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuLy8gTW92ZSBjb21tYW5kXG5cbmZ1bmN0aW9uIG1vdmUodmlld01vZGVsOiBWaWV3TW9kZWwsIGFyZ3M6IGFueSkge1xuXHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvck1vdmUucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCBhcmdzKTtcbn1cblxuZnVuY3Rpb24gbW92ZVRvTGluZVN0YXJ0KHZpZXdNb2RlbDogVmlld01vZGVsKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5XcmFwcGVkTGluZVN0YXJ0IH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlVG9MaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyKHZpZXdNb2RlbDogVmlld01vZGVsKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5XcmFwcGVkTGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlciB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVRvTGluZUNlbnRlcih2aWV3TW9kZWw6IFZpZXdNb2RlbCkge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uV3JhcHBlZExpbmVDb2x1bW5DZW50ZXIgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVUb0xpbmVFbmQodmlld01vZGVsOiBWaWV3TW9kZWwpIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLldyYXBwZWRMaW5lRW5kIH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlVG9MaW5lTGFzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXIodmlld01vZGVsOiBWaWV3TW9kZWwpIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLldyYXBwZWRMaW5lTGFzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXIgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVMZWZ0KHZpZXdNb2RlbDogVmlld01vZGVsLCB2YWx1ZT86IG51bWJlciwgYnk/OiBzdHJpbmcsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLkxlZnQsIGJ5OiBieSwgdmFsdWU6IHZhbHVlLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVJpZ2h0KHZpZXdNb2RlbDogVmlld01vZGVsLCB2YWx1ZT86IG51bWJlciwgYnk/OiBzdHJpbmcsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLlJpZ2h0LCBieTogYnksIHZhbHVlOiB2YWx1ZSwgc2VsZWN0OiBzZWxlY3QgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVVcCh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgbm9PZkxpbmVzOiBudW1iZXIgPSAxLCBzZWxlY3Q/OiBib29sZWFuKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5VcCwgYnk6IEN1cnNvck1vdmUuUmF3VW5pdC5XcmFwcGVkTGluZSwgdmFsdWU6IG5vT2ZMaW5lcywgc2VsZWN0OiBzZWxlY3QgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVVcEJ5QmxhbmtMaW5lKHZpZXdNb2RlbDogVmlld01vZGVsLCBzZWxlY3Q/OiBib29sZWFuKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5QcmV2QmxhbmtMaW5lLCBieTogQ3Vyc29yTW92ZS5SYXdVbml0LldyYXBwZWRMaW5lLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVVwQnlNb2RlbExpbmUodmlld01vZGVsOiBWaWV3TW9kZWwsIG5vT2ZMaW5lczogbnVtYmVyID0gMSwgc2VsZWN0PzogYm9vbGVhbikge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uVXAsIHZhbHVlOiBub09mTGluZXMsIHNlbGVjdDogc2VsZWN0IH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlRG93bih2aWV3TW9kZWw6IFZpZXdNb2RlbCwgbm9PZkxpbmVzOiBudW1iZXIgPSAxLCBzZWxlY3Q/OiBib29sZWFuKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5Eb3duLCBieTogQ3Vyc29yTW92ZS5SYXdVbml0LldyYXBwZWRMaW5lLCB2YWx1ZTogbm9PZkxpbmVzLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZURvd25CeUJsYW5rTGluZSh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgc2VsZWN0PzogYm9vbGVhbikge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uTmV4dEJsYW5rTGluZSwgYnk6IEN1cnNvck1vdmUuUmF3VW5pdC5XcmFwcGVkTGluZSwgc2VsZWN0OiBzZWxlY3QgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVEb3duQnlNb2RlbExpbmUodmlld01vZGVsOiBWaWV3TW9kZWwsIG5vT2ZMaW5lczogbnVtYmVyID0gMSwgc2VsZWN0PzogYm9vbGVhbikge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uRG93biwgdmFsdWU6IG5vT2ZMaW5lcywgc2VsZWN0OiBzZWxlY3QgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVEb3duQnlGb2xkZWRMaW5lKHZpZXdNb2RlbDogVmlld01vZGVsLCBub09mTGluZXM6IG51bWJlciA9IDEsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLkRvd24sIGJ5OiBDdXJzb3JNb3ZlLlJhd1VuaXQuRm9sZGVkTGluZSwgdmFsdWU6IG5vT2ZMaW5lcywgc2VsZWN0OiBzZWxlY3QgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVVcEJ5Rm9sZGVkTGluZSh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgbm9PZkxpbmVzOiBudW1iZXIgPSAxLCBzZWxlY3Q/OiBib29sZWFuKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5VcCwgYnk6IEN1cnNvck1vdmUuUmF3VW5pdC5Gb2xkZWRMaW5lLCB2YWx1ZTogbm9PZkxpbmVzLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVRvVG9wKHZpZXdNb2RlbDogVmlld01vZGVsLCBub09mTGluZXM6IG51bWJlciA9IDEsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLlZpZXdQb3J0VG9wLCB2YWx1ZTogbm9PZkxpbmVzLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVRvQ2VudGVyKHZpZXdNb2RlbDogVmlld01vZGVsLCBzZWxlY3Q/OiBib29sZWFuKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5WaWV3UG9ydENlbnRlciwgc2VsZWN0OiBzZWxlY3QgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVUb0JvdHRvbSh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgbm9PZkxpbmVzOiBudW1iZXIgPSAxLCBzZWxlY3Q/OiBib29sZWFuKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5WaWV3UG9ydEJvdHRvbSwgdmFsdWU6IG5vT2ZMaW5lcywgc2VsZWN0OiBzZWxlY3QgfSk7XG59XG5cbmZ1bmN0aW9uIGN1cnNvckVxdWFsKHZpZXdNb2RlbDogVmlld01vZGVsLCBwb3NMaW5lTnVtYmVyOiBudW1iZXIsIHBvc0NvbHVtbjogbnVtYmVyLCBzZWxMaW5lTnVtYmVyOiBudW1iZXIgPSBwb3NMaW5lTnVtYmVyLCBzZWxDb2x1bW46IG51bWJlciA9IHBvc0NvbHVtbikge1xuXHRwb3NpdGlvbkVxdWFsKHZpZXdNb2RlbC5nZXRQb3NpdGlvbigpLCBwb3NMaW5lTnVtYmVyLCBwb3NDb2x1bW4pO1xuXHRzZWxlY3Rpb25FcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIHBvc0xpbmVOdW1iZXIsIHBvc0NvbHVtbiwgc2VsTGluZU51bWJlciwgc2VsQ29sdW1uKTtcbn1cblxuZnVuY3Rpb24gcG9zaXRpb25FcXVhbChwb3NpdGlvbjogUG9zaXRpb24sIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwb3NpdGlvbiwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbiksICdwb3NpdGlvbiBlcXVhbCcpO1xufVxuXG5mdW5jdGlvbiBzZWxlY3Rpb25FcXVhbChzZWxlY3Rpb246IFNlbGVjdGlvbiwgcG9zTGluZU51bWJlcjogbnVtYmVyLCBwb3NDb2x1bW46IG51bWJlciwgc2VsTGluZU51bWJlcjogbnVtYmVyLCBzZWxDb2x1bW46IG51bWJlcikge1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRzZWxlY3Rpb25TdGFydExpbmVOdW1iZXI6IHNlbGVjdGlvbi5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsXG5cdFx0c2VsZWN0aW9uU3RhcnRDb2x1bW46IHNlbGVjdGlvbi5zZWxlY3Rpb25TdGFydENvbHVtbixcblx0XHRwb3NpdGlvbkxpbmVOdW1iZXI6IHNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXIsXG5cdFx0cG9zaXRpb25Db2x1bW46IHNlbGVjdGlvbi5wb3NpdGlvbkNvbHVtblxuXHR9LCB7XG5cdFx0c2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyOiBzZWxMaW5lTnVtYmVyLFxuXHRcdHNlbGVjdGlvblN0YXJ0Q29sdW1uOiBzZWxDb2x1bW4sXG5cdFx0cG9zaXRpb25MaW5lTnVtYmVyOiBwb3NMaW5lTnVtYmVyLFxuXHRcdHBvc2l0aW9uQ29sdW1uOiBwb3NDb2x1bW5cblx0fSwgJ3NlbGVjdGlvbiBlcXVhbCcpO1xufVxuXG5mdW5jdGlvbiBtb3ZlVG8odmlld01vZGVsOiBWaWV3TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUb1NlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHtcblx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKVxuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge1xuXHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pXG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbW92ZVRvRW5kT2ZMaW5lKHZpZXdNb2RlbDogVmlld01vZGVsLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRpZiAoaW5TZWxlY3Rpb25Nb2RlKSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JFbmRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH0gZWxzZSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JFbmQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFFdEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBMEIsMEJBQTBCO0FBRXBELE1BQU0sNEJBQTRCLE1BQU07QUFFdkMsMENBQXdDO0FBRXhDLFFBQU0sT0FBTztBQUFBLElBQ1o7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRCxFQUFFLEtBQUssSUFBSTtBQUVYLFdBQVMsWUFBWSxVQUF5RTtBQUM3Rix1QkFBbUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLGNBQWM7QUFDbkQsZUFBUyxRQUFRLFNBQVM7QUFBQSxJQUMzQixDQUFDO0FBQUEsRUFDRjtBQUVBLE9BQUssMkNBQTJDLE1BQU07QUFDckQsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixlQUFTLFNBQVM7QUFDbEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpREFBaUQsTUFBTTtBQUMzRCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLGVBQVMsV0FBVyxDQUFDO0FBQ3JCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixlQUFTLFdBQVcsR0FBRyxXQUFXLFFBQVEsUUFBUTtBQUNsRCxrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9DQUFvQyxNQUFNO0FBQzlDLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsZUFBUyxXQUFXLEVBQUU7QUFDdEIsa0JBQVksV0FBVyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLGdCQUFVLFNBQVM7QUFDbkIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtREFBbUQsTUFBTTtBQUM3RCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLGdCQUFVLFdBQVcsQ0FBQztBQUN0QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdEQUFnRCxNQUFNO0FBQzFELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsZ0JBQVUsV0FBVyxHQUFHLFdBQVcsUUFBUSxRQUFRO0FBQ25ELGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUNBQWlDLE1BQU07QUFDM0MsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixnQkFBVSxXQUFXLEdBQUc7QUFDeEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLHNCQUFnQixTQUFTO0FBQ3pCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0VBQXdFLE1BQU07QUFDbEYsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixzQkFBZ0IsU0FBUztBQUN6QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsc0JBQWdCLFNBQVM7QUFDekIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrREFBK0QsTUFBTTtBQUN6RSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLDRDQUFzQyxTQUFTO0FBQy9DLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0ZBQXdGLE1BQU07QUFDbEcsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0Qiw0Q0FBc0MsU0FBUztBQUMvQyxrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsNENBQXNDLFNBQVM7QUFDL0Msa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLG9CQUFjLFNBQVM7QUFDdkIsa0JBQVksV0FBVyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxFQUFFO0FBQ3ZCLG9CQUFjLFNBQVM7QUFDdkIsa0JBQVksV0FBVyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxFQUFFO0FBQ3ZCLG9CQUFjLFNBQVM7QUFDdkIsa0JBQVksV0FBVyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzREFBc0QsTUFBTTtBQUNoRSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLDJDQUFxQyxTQUFTO0FBQzlDLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOEVBQThFLE1BQU07QUFDeEYsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsRUFBRTtBQUN2QiwyQ0FBcUMsU0FBUztBQUM5QyxrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLEVBQUU7QUFDdkIsMkNBQXFDLFNBQVM7QUFDOUMsa0JBQVksV0FBVyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwQ0FBMEMsTUFBTTtBQUNwRCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLHVCQUFpQixTQUFTO0FBQzFCLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0NBQXNDLE1BQU07QUFDaEQsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsRUFBRTtBQUN2Qix1QkFBaUIsU0FBUztBQUMxQixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxNQUFNO0FBQy9DLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLHNCQUFnQixTQUFTO0FBQ3pCLHVCQUFpQixTQUFTO0FBQzFCLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbUNBQW1DLE1BQU07QUFDN0MsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsb0JBQWMsU0FBUztBQUN2Qix1QkFBaUIsU0FBUztBQUMxQixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtDQUFrQyxNQUFNO0FBQzVDLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0IsYUFBTyxXQUFXLENBQUM7QUFDbkIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0IsYUFBTyxXQUFXLENBQUM7QUFDbkIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBRTNCLHdCQUFrQixXQUFXLENBQUM7QUFDOUIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0Isd0JBQWtCLFdBQVcsQ0FBQztBQUM5QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtDQUErQyxNQUFNO0FBQ3pELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0IsMEJBQW9CLFdBQVcsQ0FBQztBQUNoQyxrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQiwwQkFBb0IsV0FBVyxDQUFDO0FBQ2hDLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaURBQWlELE1BQU07QUFDM0QsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixhQUFPLFdBQVcsR0FBRyxJQUFJO0FBQ3pCLGtCQUFZLFdBQVcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUVqQyxhQUFPLFdBQVcsR0FBRyxJQUFJO0FBQ3pCLGtCQUFZLFdBQVcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ2xDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0IsZUFBUyxXQUFXLENBQUM7QUFDckIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0IsYUFBTyxXQUFXLENBQUM7QUFDbkIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0IsYUFBTyxXQUFXLENBQUM7QUFDbkIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0IsYUFBTyxXQUFXLENBQUM7QUFDbkIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0IsYUFBTyxXQUFXLENBQUM7QUFDbkIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRkFBc0YsTUFBTTtBQUNoRyxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxzQkFBZ0IsU0FBUztBQUN6QixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUU1QixzQkFBZ0IsU0FBUztBQUN6QixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUU1QixlQUFTLFdBQVcsQ0FBQztBQUNyQixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUU1QixlQUFTLFdBQVcsQ0FBQztBQUNyQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixlQUFTLFdBQVcsQ0FBQztBQUNyQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixhQUFPLFdBQVcsQ0FBQztBQUNuQixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBQ25GLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGdCQUFVLGdDQUFnQyxNQUFNLElBQUksTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDO0FBRXJFLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsZ0JBQVUsU0FBUztBQUVuQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtGQUFrRixNQUFNO0FBQzVGLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGdCQUFVLGdDQUFnQyxNQUFNLElBQUksTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDO0FBRXJFLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsZ0JBQVUsU0FBUztBQUVuQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9EQUFvRCxNQUFNO0FBQzlELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGdCQUFVLGdDQUFnQyxNQUFNLElBQUksTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDO0FBRXJFLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsZ0JBQVUsV0FBVyxDQUFDO0FBRXRCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEZBQTBGLE1BQU07QUFDcEcsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsZ0JBQVUsZ0NBQWdDLE1BQU0sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFFcEUsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixnQkFBVSxXQUFXLENBQUM7QUFFdEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxnQkFBVSxnQ0FBZ0MsTUFBTSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUVwRSxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLG1CQUFhLFNBQVM7QUFFdEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRUFBMEUsTUFBTTtBQUNwRixnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxnQkFBVSxnQ0FBZ0MsTUFBTSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUVwRSxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLG1CQUFhLFNBQVM7QUFFdEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxRkFBcUYsTUFBTTtBQUMvRixnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxnQkFBVSxnQ0FBZ0MsTUFBTSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUVwRSxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLG1CQUFhLFNBQVM7QUFFdEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxnQkFBVSxnQ0FBZ0MsTUFBTSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUVwRSxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLG1CQUFhLFdBQVcsQ0FBQztBQUV6QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhGQUE4RixNQUFNO0FBQ3hHLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGdCQUFVLGdDQUFnQyxNQUFNLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBRXBFLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsbUJBQWEsV0FBVyxDQUFDO0FBRXpCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGlDQUFpQyxNQUFNO0FBRTVDLDBDQUF3QztBQUV4QyxRQUFNLE9BQU87QUFBQSxJQUNaO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0QsRUFBRSxLQUFLLElBQUk7QUFFWCxXQUFTLFlBQVksVUFBeUU7QUFDN0YsdUJBQW1CLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ25ELGVBQVMsUUFBUSxTQUFTO0FBQUEsSUFDM0IsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLDBCQUFvQixXQUFXLEtBQUs7QUFDcEMsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLHdCQUFrQixXQUFXLEtBQUs7QUFDbEMsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLDBCQUFvQixXQUFXLEtBQUs7QUFDcEMsa0JBQVksV0FBVyxJQUFJLENBQUM7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLHdCQUFrQixXQUFXLEtBQUs7QUFDbEMsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLHdCQUFrQixXQUFXLEtBQUs7QUFDbEMsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsSUFBSSxDQUFDO0FBQ3ZCLDBCQUFvQixXQUFXLEtBQUs7QUFDcEMsa0JBQVksV0FBVyxJQUFJLENBQUM7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQywwQkFBb0IsV0FBVyxJQUFJO0FBQ25DLHFCQUFlLFVBQVUsYUFBYSxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUNwRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLHdCQUFrQixXQUFXLElBQUk7QUFDakMscUJBQWUsVUFBVSxhQUFhLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3BELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDO0FBS0QsTUFBTSx5Q0FBeUMsTUFBTTtBQUVwRCwwQ0FBd0M7QUFFeEMsV0FBUyxnQkFBZ0IsVUFBeUU7QUFDakcsdUJBQW1CO0FBQUEsTUFDbEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUN4QyxlQUFTLFFBQVEsU0FBUztBQUFBLElBQzNCLENBQUM7QUFBQSxFQUNGO0FBRUEsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxvQkFBZ0IsQ0FBQyxRQUFRLGNBQWM7QUFFdEMsZ0JBQVUsZUFBZSxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNoRCxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBRXRCLDJCQUFxQixTQUFTO0FBQzlCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBRTNCLDJCQUFxQixTQUFTO0FBQzlCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdURBQXVELE1BQU07QUFDakUsb0JBQWdCLENBQUMsUUFBUSxjQUFjO0FBRXRDLGdCQUFVLGVBQWUsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDaEQsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUV0Qix5QkFBbUIsU0FBUztBQUM1QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQix5QkFBbUIsU0FBUztBQUM1QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxNQUFNO0FBQzdFLG9CQUFnQixDQUFDLFFBQVEsY0FBYztBQUV0QyxnQkFBVSxlQUFlLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2hELGFBQU8sV0FBVyxHQUFHLENBQUM7QUFFdEIsMkJBQXFCLFdBQVcsQ0FBQztBQUNqQyxrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLG9CQUFnQixDQUFDLFFBQVEsY0FBYztBQUV0QyxnQkFBVSxlQUFlLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2hELGFBQU8sV0FBVyxHQUFHLENBQUM7QUFFdEIsMkJBQXFCLFNBQVM7QUFDOUIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxvQkFBZ0IsQ0FBQyxRQUFRLGNBQWM7QUFDdEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QiwyQkFBcUIsU0FBUztBQUM5QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLG9CQUFnQixDQUFDLFFBQVEsY0FBYztBQUN0QyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLHlCQUFtQixTQUFTO0FBQzVCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkVBQTZFLE1BQU07QUFDdkYsb0JBQWdCLENBQUMsUUFBUSxjQUFjO0FBRXRDLGdCQUFVLGVBQWUsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDaEQsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUV0QiwyQkFBcUIsV0FBVyxDQUFDO0FBQ2pDLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkVBQTZFLE1BQU07QUFDdkYsb0JBQWdCLENBQUMsUUFBUSxjQUFjO0FBRXRDLGdCQUFVLGVBQWUsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDaEQsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUV0Qix5QkFBbUIsV0FBVyxDQUFDO0FBQy9CLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFJRCxTQUFTLEtBQUssV0FBc0IsTUFBVztBQUM5Qyx5QkFBdUIsV0FBVyxxQkFBcUIsV0FBVyxJQUFJO0FBQ3ZFO0FBRUEsU0FBUyxnQkFBZ0IsV0FBc0I7QUFDOUMsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsaUJBQWlCLENBQUM7QUFDakU7QUFFQSxTQUFTLHNDQUFzQyxXQUFzQjtBQUNwRSxPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSx1Q0FBdUMsQ0FBQztBQUN2RjtBQUVBLFNBQVMsaUJBQWlCLFdBQXNCO0FBQy9DLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLHdCQUF3QixDQUFDO0FBQ3hFO0FBRUEsU0FBUyxjQUFjLFdBQXNCO0FBQzVDLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLGVBQWUsQ0FBQztBQUMvRDtBQUVBLFNBQVMscUNBQXFDLFdBQXNCO0FBQ25FLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLHNDQUFzQyxDQUFDO0FBQ3RGO0FBRUEsU0FBUyxTQUFTLFdBQXNCLE9BQWdCLElBQWEsUUFBa0I7QUFDdEYsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsTUFBTSxJQUFRLE9BQWMsT0FBZSxDQUFDO0FBQzNGO0FBRUEsU0FBUyxVQUFVLFdBQXNCLE9BQWdCLElBQWEsUUFBa0I7QUFDdkYsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsT0FBTyxJQUFRLE9BQWMsT0FBZSxDQUFDO0FBQzVGO0FBRUEsU0FBUyxPQUFPLFdBQXNCLFlBQW9CLEdBQUcsUUFBa0I7QUFDOUUsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsSUFBSSxJQUFJLFdBQVcsUUFBUSxhQUFhLE9BQU8sV0FBVyxPQUFlLENBQUM7QUFDekg7QUFFQSxTQUFTLGtCQUFrQixXQUFzQixRQUFrQjtBQUNsRSxPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxlQUFlLElBQUksV0FBVyxRQUFRLGFBQWEsT0FBZSxDQUFDO0FBQ2xIO0FBRUEsU0FBUyxrQkFBa0IsV0FBc0IsWUFBb0IsR0FBRyxRQUFrQjtBQUN6RixPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxJQUFJLE9BQU8sV0FBVyxPQUFlLENBQUM7QUFDckY7QUFFQSxTQUFTLFNBQVMsV0FBc0IsWUFBb0IsR0FBRyxRQUFrQjtBQUNoRixPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxNQUFNLElBQUksV0FBVyxRQUFRLGFBQWEsT0FBTyxXQUFXLE9BQWUsQ0FBQztBQUMzSDtBQUVBLFNBQVMsb0JBQW9CLFdBQXNCLFFBQWtCO0FBQ3BFLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLGVBQWUsSUFBSSxXQUFXLFFBQVEsYUFBYSxPQUFlLENBQUM7QUFDbEg7QUFFQSxTQUFTLG9CQUFvQixXQUFzQixZQUFvQixHQUFHLFFBQWtCO0FBQzNGLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLE1BQU0sT0FBTyxXQUFXLE9BQWUsQ0FBQztBQUN2RjtBQUVBLFNBQVMscUJBQXFCLFdBQXNCLFlBQW9CLEdBQUcsUUFBa0I7QUFDNUYsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsTUFBTSxJQUFJLFdBQVcsUUFBUSxZQUFZLE9BQU8sV0FBVyxPQUFlLENBQUM7QUFDMUg7QUFFQSxTQUFTLG1CQUFtQixXQUFzQixZQUFvQixHQUFHLFFBQWtCO0FBQzFGLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLElBQUksSUFBSSxXQUFXLFFBQVEsWUFBWSxPQUFPLFdBQVcsT0FBZSxDQUFDO0FBQ3hIO0FBRUEsU0FBUyxVQUFVLFdBQXNCLFlBQW9CLEdBQUcsUUFBa0I7QUFDakYsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsYUFBYSxPQUFPLFdBQVcsT0FBZSxDQUFDO0FBQzlGO0FBRUEsU0FBUyxhQUFhLFdBQXNCLFFBQWtCO0FBQzdELE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLGdCQUFnQixPQUFlLENBQUM7QUFDL0U7QUFFQSxTQUFTLGFBQWEsV0FBc0IsWUFBb0IsR0FBRyxRQUFrQjtBQUNwRixPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxnQkFBZ0IsT0FBTyxXQUFXLE9BQWUsQ0FBQztBQUNqRztBQUVBLFNBQVMsWUFBWSxXQUFzQixlQUF1QixXQUFtQixnQkFBd0IsZUFBZSxZQUFvQixXQUFXO0FBQzFKLGdCQUFjLFVBQVUsWUFBWSxHQUFHLGVBQWUsU0FBUztBQUMvRCxpQkFBZSxVQUFVLGFBQWEsR0FBRyxlQUFlLFdBQVcsZUFBZSxTQUFTO0FBQzVGO0FBRUEsU0FBUyxjQUFjLFVBQW9CLFlBQW9CLFFBQWdCO0FBQzlFLFNBQU8sZ0JBQWdCLFVBQVUsSUFBSSxTQUFTLFlBQVksTUFBTSxHQUFHLGdCQUFnQjtBQUNwRjtBQUVBLFNBQVMsZUFBZSxXQUFzQixlQUF1QixXQUFtQixlQUF1QixXQUFtQjtBQUNqSSxTQUFPLGdCQUFnQjtBQUFBLElBQ3RCLDBCQUEwQixVQUFVO0FBQUEsSUFDcEMsc0JBQXNCLFVBQVU7QUFBQSxJQUNoQyxvQkFBb0IsVUFBVTtBQUFBLElBQzlCLGdCQUFnQixVQUFVO0FBQUEsRUFDM0IsR0FBRztBQUFBLElBQ0YsMEJBQTBCO0FBQUEsSUFDMUIsc0JBQXNCO0FBQUEsSUFDdEIsb0JBQW9CO0FBQUEsSUFDcEIsZ0JBQWdCO0FBQUEsRUFDakIsR0FBRyxpQkFBaUI7QUFDckI7QUFFQSxTQUFTLE9BQU8sV0FBc0IsWUFBb0IsUUFBZ0Isa0JBQTJCLE9BQU87QUFDM0csTUFBSSxpQkFBaUI7QUFDcEIsMkJBQXVCLGFBQWEscUJBQXFCLFdBQVc7QUFBQSxNQUNuRSxVQUFVLElBQUksU0FBUyxZQUFZLE1BQU07QUFBQSxJQUMxQyxDQUFDO0FBQUEsRUFDRixPQUFPO0FBQ04sMkJBQXVCLE9BQU8scUJBQXFCLFdBQVc7QUFBQSxNQUM3RCxVQUFVLElBQUksU0FBUyxZQUFZLE1BQU07QUFBQSxJQUMxQyxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBRUEsU0FBUyxnQkFBZ0IsV0FBc0Isa0JBQTJCLE9BQU87QUFDaEYsTUFBSSxpQkFBaUI7QUFDcEIsMkJBQXVCLGdCQUFnQixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUMxRSxPQUFPO0FBQ04sMkJBQXVCLFVBQVUscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDcEU7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
