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
import assert from "assert";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ShiftCommand } from "../../../common/commands/shiftCommand.js";
import { EditorAutoIndentStrategy } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { getEditOperation, testCommand } from "../testCommand.js";
import { javascriptOnEnterRules } from "../../common/modes/supports/onEnterRules.js";
import { TestLanguageConfigurationService } from "../../common/modes/testLanguageConfigurationService.js";
import { withEditorModel } from "../../common/testTextModel.js";
function createSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
  return {
    range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
    text,
    forceMoveMarkers: false
  };
}
let DocBlockCommentMode = class extends Disposable {
  constructor(languageService, languageConfigurationService) {
    super();
    this.languageId = DocBlockCommentMode.languageId;
    this._register(languageService.registerLanguage({ id: this.languageId }));
    this._register(languageConfigurationService.register(this.languageId, {
      brackets: [
        ["(", ")"],
        ["{", "}"],
        ["[", "]"]
      ],
      onEnterRules: javascriptOnEnterRules
    }));
  }
};
DocBlockCommentMode.languageId = "commentMode";
DocBlockCommentMode = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, ILanguageConfigurationService)
], DocBlockCommentMode);
function testShiftCommand(lines, languageId, useTabStops, selection, expectedLines, expectedSelection, prepare) {
  testCommand(lines, languageId, selection, (accessor, sel) => new ShiftCommand(sel, {
    isUnshift: false,
    tabSize: 4,
    indentSize: 4,
    insertSpaces: false,
    useTabStops,
    autoIndent: EditorAutoIndentStrategy.Full
  }, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection, void 0, prepare);
}
function testUnshiftCommand(lines, languageId, useTabStops, selection, expectedLines, expectedSelection, prepare) {
  testCommand(lines, languageId, selection, (accessor, sel) => new ShiftCommand(sel, {
    isUnshift: true,
    tabSize: 4,
    indentSize: 4,
    insertSpaces: false,
    useTabStops,
    autoIndent: EditorAutoIndentStrategy.Full
  }, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection, void 0, prepare);
}
function prepareDocBlockCommentLanguage(accessor, disposables) {
  const languageConfigurationService = accessor.get(ILanguageConfigurationService);
  const languageService = accessor.get(ILanguageService);
  disposables.add(new DocBlockCommentMode(languageService, languageConfigurationService));
}
suite("Editor Commands - ShiftCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Bug 9503: Shifting without any selection", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 1, 1),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 2, 1, 2)
    );
  });
  test("shift on single line selection 1", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 3, 1, 1),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 4, 1, 1)
    );
  });
  test("shift on single line selection 2", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 1, 3),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 1, 4)
    );
  });
  test("simple shift", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 2, 1),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 2, 1)
    );
  });
  test("shifting on two separate lines", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 2, 1),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 2, 1)
    );
    testShiftCommand(
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 1, 3, 1),
      [
        "	My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 1, 3, 1)
    );
  });
  test("shifting on two lines", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 2, 2, 2),
      [
        "	My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 3, 2, 2)
    );
  });
  test("shifting on two lines again", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 2, 1, 2),
      [
        "	My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 2, 1, 3)
    );
  });
  test("shifting at end of file", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(4, 1, 5, 2),
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "	123"
      ],
      new Selection(4, 1, 5, 3)
    );
  });
  test("issue #1120 TAB should not indent empty lines in a multi-line selection", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 5, 2),
      [
        "	My First Line",
        "			My Second Line",
        "		Third Line",
        "",
        "	123"
      ],
      new Selection(1, 1, 5, 3)
    );
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(4, 1, 5, 1),
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "	",
        "123"
      ],
      new Selection(4, 1, 5, 1)
    );
  });
  test("unshift on single line selection 1", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 3, 2, 1),
      [
        "My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 3, 2, 1)
    );
  });
  test("unshift on single line selection 2", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 1, 2, 3),
      [
        "My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 1, 2, 3)
    );
  });
  test("simple unshift", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 2, 1),
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 2, 1)
    );
  });
  test("unshifting on two lines 1", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 2, 2, 2),
      [
        "My First Line",
        "	My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 2, 2, 2)
    );
  });
  test("unshifting on two lines 2", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 3, 2, 1),
      [
        "My First Line",
        "	My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 2, 2, 1)
    );
  });
  test("unshifting at the end of the file", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(4, 1, 5, 2),
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(4, 1, 5, 2)
    );
  });
  test("unshift many times + shift", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 5, 4),
      [
        "My First Line",
        "	My Second Line",
        "Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 5, 4)
    );
    testUnshiftCommand(
      [
        "My First Line",
        "	My Second Line",
        "Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 5, 4),
      [
        "My First Line",
        "My Second Line",
        "Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 5, 4)
    );
    testShiftCommand(
      [
        "My First Line",
        "My Second Line",
        "Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 5, 4),
      [
        "	My First Line",
        "	My Second Line",
        "	Third Line",
        "",
        "	123"
      ],
      new Selection(1, 1, 5, 5)
    );
  });
  test("Bug 9119: Unshift from first column doesn't work", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 1, 2, 1),
      [
        "My First Line",
        "	My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 1, 2, 1)
    );
  });
  test("issue #348: indenting around doc block comments", () => {
    testShiftCommand(
      [
        "",
        "/**",
        " * a doc comment",
        " */",
        "function hello() {}"
      ],
      DocBlockCommentMode.languageId,
      true,
      new Selection(1, 1, 5, 20),
      [
        "",
        "	/**",
        "	 * a doc comment",
        "	 */",
        "	function hello() {}"
      ],
      new Selection(1, 1, 5, 21),
      prepareDocBlockCommentLanguage
    );
    testUnshiftCommand(
      [
        "",
        "/**",
        " * a doc comment",
        " */",
        "function hello() {}"
      ],
      DocBlockCommentMode.languageId,
      true,
      new Selection(1, 1, 5, 20),
      [
        "",
        "/**",
        " * a doc comment",
        " */",
        "function hello() {}"
      ],
      new Selection(1, 1, 5, 20),
      prepareDocBlockCommentLanguage
    );
    testUnshiftCommand(
      [
        "	",
        "	/**",
        "	 * a doc comment",
        "	 */",
        "	function hello() {}"
      ],
      DocBlockCommentMode.languageId,
      true,
      new Selection(1, 1, 5, 21),
      [
        "",
        "/**",
        " * a doc comment",
        " */",
        "function hello() {}"
      ],
      new Selection(1, 1, 5, 20),
      prepareDocBlockCommentLanguage
    );
  });
  test("issue #1609: Wrong indentation of block comments", () => {
    testShiftCommand(
      [
        "",
        "/**",
        " * test",
        " *",
        " * @type {number}",
        " */",
        "var foo = 0;"
      ],
      DocBlockCommentMode.languageId,
      true,
      new Selection(1, 1, 7, 13),
      [
        "",
        "	/**",
        "	 * test",
        "	 *",
        "	 * @type {number}",
        "	 */",
        "	var foo = 0;"
      ],
      new Selection(1, 1, 7, 14),
      prepareDocBlockCommentLanguage
    );
  });
  test("issue #1620: a) Line indent doesn't handle leading whitespace properly", () => {
    testCommand(
      [
        "   Written | Numeric",
        "       one | 1",
        "       two | 2",
        "     three | 3",
        "      four | 4",
        "      five | 5",
        "       six | 6",
        "     seven | 7",
        "     eight | 8",
        "      nine | 9",
        "       ten | 10",
        "    eleven | 11",
        ""
      ],
      null,
      new Selection(1, 1, 13, 1),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: false,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: true,
        useTabStops: false,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "       Written | Numeric",
        "           one | 1",
        "           two | 2",
        "         three | 3",
        "          four | 4",
        "          five | 5",
        "           six | 6",
        "         seven | 7",
        "         eight | 8",
        "          nine | 9",
        "           ten | 10",
        "        eleven | 11",
        ""
      ],
      new Selection(1, 1, 13, 1)
    );
  });
  test("issue #1620: b) Line indent doesn't handle leading whitespace properly", () => {
    testCommand(
      [
        "       Written | Numeric",
        "           one | 1",
        "           two | 2",
        "         three | 3",
        "          four | 4",
        "          five | 5",
        "           six | 6",
        "         seven | 7",
        "         eight | 8",
        "          nine | 9",
        "           ten | 10",
        "        eleven | 11",
        ""
      ],
      null,
      new Selection(1, 1, 13, 1),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: true,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: true,
        useTabStops: false,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "   Written | Numeric",
        "       one | 1",
        "       two | 2",
        "     three | 3",
        "      four | 4",
        "      five | 5",
        "       six | 6",
        "     seven | 7",
        "     eight | 8",
        "      nine | 9",
        "       ten | 10",
        "    eleven | 11",
        ""
      ],
      new Selection(1, 1, 13, 1)
    );
  });
  test("issue #1620: c) Line indent doesn't handle leading whitespace properly", () => {
    testCommand(
      [
        "       Written | Numeric",
        "           one | 1",
        "           two | 2",
        "         three | 3",
        "          four | 4",
        "          five | 5",
        "           six | 6",
        "         seven | 7",
        "         eight | 8",
        "          nine | 9",
        "           ten | 10",
        "        eleven | 11",
        ""
      ],
      null,
      new Selection(1, 1, 13, 1),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: true,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: false,
        useTabStops: false,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "   Written | Numeric",
        "       one | 1",
        "       two | 2",
        "     three | 3",
        "      four | 4",
        "      five | 5",
        "       six | 6",
        "     seven | 7",
        "     eight | 8",
        "      nine | 9",
        "       ten | 10",
        "    eleven | 11",
        ""
      ],
      new Selection(1, 1, 13, 1)
    );
  });
  test("issue #1620: d) Line indent doesn't handle leading whitespace properly", () => {
    testCommand(
      [
        "	   Written | Numeric",
        "	       one | 1",
        "	       two | 2",
        "	     three | 3",
        "	      four | 4",
        "	      five | 5",
        "	       six | 6",
        "	     seven | 7",
        "	     eight | 8",
        "	      nine | 9",
        "	       ten | 10",
        "	    eleven | 11",
        ""
      ],
      null,
      new Selection(1, 1, 13, 1),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: true,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: true,
        useTabStops: false,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "   Written | Numeric",
        "       one | 1",
        "       two | 2",
        "     three | 3",
        "      four | 4",
        "      five | 5",
        "       six | 6",
        "     seven | 7",
        "     eight | 8",
        "      nine | 9",
        "       ten | 10",
        "    eleven | 11",
        ""
      ],
      new Selection(1, 1, 13, 1)
    );
  });
  test("issue microsoft/monaco-editor#443: Indentation of a single row deletes selected text in some cases", () => {
    testCommand(
      [
        "Hello world!",
        "another line"
      ],
      null,
      new Selection(1, 1, 1, 13),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: false,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: false,
        useTabStops: true,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "	Hello world!",
        "another line"
      ],
      new Selection(1, 1, 1, 14)
    );
  });
  test("bug #16815:Shift+Tab doesn't go back to tabstop", () => {
    const repeatStr = (str, cnt) => {
      let r = "";
      for (let i = 0; i < cnt; i++) {
        r += str;
      }
      return r;
    };
    const testOutdent = (tabSize, indentSize, insertSpaces, lineText, expectedIndents) => {
      const oneIndent = insertSpaces ? repeatStr(" ", indentSize) : "	";
      const expectedIndent = repeatStr(oneIndent, expectedIndents);
      if (lineText.length > 0) {
        _assertUnshiftCommand(tabSize, indentSize, insertSpaces, [lineText + "aaa"], [createSingleEditOp(expectedIndent, 1, 1, 1, lineText.length + 1)]);
      } else {
        _assertUnshiftCommand(tabSize, indentSize, insertSpaces, [lineText + "aaa"], []);
      }
    };
    const testIndent = (tabSize, indentSize, insertSpaces, lineText, expectedIndents) => {
      const oneIndent = insertSpaces ? repeatStr(" ", indentSize) : "	";
      const expectedIndent = repeatStr(oneIndent, expectedIndents);
      _assertShiftCommand(tabSize, indentSize, insertSpaces, [lineText + "aaa"], [createSingleEditOp(expectedIndent, 1, 1, 1, lineText.length + 1)]);
    };
    const testIndentation = (tabSize, indentSize, lineText, expectedOnOutdent, expectedOnIndent) => {
      testOutdent(tabSize, indentSize, true, lineText, expectedOnOutdent);
      testOutdent(tabSize, indentSize, false, lineText, expectedOnOutdent);
      testIndent(tabSize, indentSize, true, lineText, expectedOnIndent);
      testIndent(tabSize, indentSize, false, lineText, expectedOnIndent);
    };
    testIndentation(4, 4, "", 0, 1);
    testIndentation(4, 4, "	", 0, 2);
    testIndentation(4, 4, " ", 0, 1);
    testIndentation(4, 4, " 	", 0, 2);
    testIndentation(4, 4, "  ", 0, 1);
    testIndentation(4, 4, "  	", 0, 2);
    testIndentation(4, 4, "   ", 0, 1);
    testIndentation(4, 4, "   	", 0, 2);
    testIndentation(4, 4, "    ", 0, 2);
    testIndentation(4, 4, "		", 1, 3);
    testIndentation(4, 4, "	 ", 1, 2);
    testIndentation(4, 4, "	 	", 1, 3);
    testIndentation(4, 4, "	  ", 1, 2);
    testIndentation(4, 4, "	  	", 1, 3);
    testIndentation(4, 4, "	   ", 1, 2);
    testIndentation(4, 4, "	   	", 1, 3);
    testIndentation(4, 4, "	    ", 1, 3);
    testIndentation(4, 4, " 		", 1, 3);
    testIndentation(4, 4, " 	 ", 1, 2);
    testIndentation(4, 4, " 	 	", 1, 3);
    testIndentation(4, 4, " 	  ", 1, 2);
    testIndentation(4, 4, " 	  	", 1, 3);
    testIndentation(4, 4, " 	   ", 1, 2);
    testIndentation(4, 4, " 	   	", 1, 3);
    testIndentation(4, 4, " 	    ", 1, 3);
    testIndentation(4, 4, "  		", 1, 3);
    testIndentation(4, 4, "  	 ", 1, 2);
    testIndentation(4, 4, "  	 	", 1, 3);
    testIndentation(4, 4, "  	  ", 1, 2);
    testIndentation(4, 4, "  	  	", 1, 3);
    testIndentation(4, 4, "  	   ", 1, 2);
    testIndentation(4, 4, "  	   	", 1, 3);
    testIndentation(4, 4, "  	    ", 1, 3);
    testIndentation(4, 4, "   		", 1, 3);
    testIndentation(4, 4, "   	 ", 1, 2);
    testIndentation(4, 4, "   	 	", 1, 3);
    testIndentation(4, 4, "   	  ", 1, 2);
    testIndentation(4, 4, "   	  	", 1, 3);
    testIndentation(4, 4, "   	   ", 1, 2);
    testIndentation(4, 4, "   	   	", 1, 3);
    testIndentation(4, 4, "   	    ", 1, 3);
    testIndentation(4, 4, "    	", 1, 3);
    testIndentation(4, 4, "     ", 1, 2);
    testIndentation(4, 4, "     	", 1, 3);
    testIndentation(4, 4, "      ", 1, 2);
    testIndentation(4, 4, "      	", 1, 3);
    testIndentation(4, 4, "       ", 1, 2);
    testIndentation(4, 4, "       	", 1, 3);
    testIndentation(4, 4, "        ", 1, 3);
    testIndentation(4, 4, "         ", 2, 3);
    function _assertUnshiftCommand(tabSize, indentSize, insertSpaces, text, expected) {
      return withEditorModel(text, (model) => {
        const testLanguageConfigurationService = new TestLanguageConfigurationService();
        const op = new ShiftCommand(new Selection(1, 1, text.length + 1, 1), {
          isUnshift: true,
          tabSize,
          indentSize,
          insertSpaces,
          useTabStops: true,
          autoIndent: EditorAutoIndentStrategy.Full
        }, testLanguageConfigurationService);
        const actual = getEditOperation(model, op);
        assert.deepStrictEqual(actual, expected);
        testLanguageConfigurationService.dispose();
      });
    }
    function _assertShiftCommand(tabSize, indentSize, insertSpaces, text, expected) {
      return withEditorModel(text, (model) => {
        const testLanguageConfigurationService = new TestLanguageConfigurationService();
        const op = new ShiftCommand(new Selection(1, 1, text.length + 1, 1), {
          isUnshift: false,
          tabSize,
          indentSize,
          insertSpaces,
          useTabStops: true,
          autoIndent: EditorAutoIndentStrategy.Full
        }, testLanguageConfigurationService);
        const actual = getEditOperation(model, op);
        assert.deepStrictEqual(actual, expected);
        testLanguageConfigurationService.dispose();
      });
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvY29tbWFuZHMvc2hpZnRDb21tYW5kLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTaGlmdENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29tbWFuZHMvc2hpZnRDb21tYW5kLmpzJztcbmltcG9ydCB7IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldEVkaXRPcGVyYXRpb24sIHRlc3RDb21tYW5kIH0gZnJvbSAnLi4vdGVzdENvbW1hbmQuanMnO1xuaW1wb3J0IHsgamF2YXNjcmlwdE9uRW50ZXJSdWxlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2Rlcy9zdXBwb3J0cy9vbkVudGVyUnVsZXMuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZXMvdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgd2l0aEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG4vKipcbiAqIENyZWF0ZSBzaW5nbGUgZWRpdCBvcGVyYXRpb25cbiAqL1xuZnVuY3Rpb24gY3JlYXRlU2luZ2xlRWRpdE9wKHRleHQ6IHN0cmluZywgcG9zaXRpb25MaW5lTnVtYmVyOiBudW1iZXIsIHBvc2l0aW9uQ29sdW1uOiBudW1iZXIsIHNlbGVjdGlvbkxpbmVOdW1iZXI6IG51bWJlciA9IHBvc2l0aW9uTGluZU51bWJlciwgc2VsZWN0aW9uQ29sdW1uOiBudW1iZXIgPSBwb3NpdGlvbkNvbHVtbik6IElTaW5nbGVFZGl0T3BlcmF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRyYW5nZTogbmV3IFJhbmdlKHNlbGVjdGlvbkxpbmVOdW1iZXIsIHNlbGVjdGlvbkNvbHVtbiwgcG9zaXRpb25MaW5lTnVtYmVyLCBwb3NpdGlvbkNvbHVtbiksXG5cdFx0dGV4dDogdGV4dCxcblx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmYWxzZVxuXHR9O1xufVxuXG5jbGFzcyBEb2NCbG9ja0NvbW1lbnRNb2RlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHVibGljIHN0YXRpYyBsYW5ndWFnZUlkID0gJ2NvbW1lbnRNb2RlJztcblx0cHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQgPSBEb2NCbG9ja0NvbW1lbnRNb2RlLmxhbmd1YWdlSWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IHRoaXMubGFuZ3VhZ2VJZCB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3Rlcih0aGlzLmxhbmd1YWdlSWQsIHtcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsnKCcsICcpJ10sXG5cdFx0XHRcdFsneycsICd9J10sXG5cdFx0XHRcdFsnWycsICddJ11cblx0XHRcdF0sXG5cblx0XHRcdG9uRW50ZXJSdWxlczogamF2YXNjcmlwdE9uRW50ZXJSdWxlc1xuXHRcdH0pKTtcblx0fVxufVxuXG5mdW5jdGlvbiB0ZXN0U2hpZnRDb21tYW5kKGxpbmVzOiBzdHJpbmdbXSwgbGFuZ3VhZ2VJZDogc3RyaW5nIHwgbnVsbCwgdXNlVGFiU3RvcHM6IGJvb2xlYW4sIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBleHBlY3RlZExpbmVzOiBzdHJpbmdbXSwgZXhwZWN0ZWRTZWxlY3Rpb246IFNlbGVjdGlvbiwgcHJlcGFyZT86IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSkgPT4gdm9pZCk6IHZvaWQge1xuXHR0ZXN0Q29tbWFuZChsaW5lcywgbGFuZ3VhZ2VJZCwgc2VsZWN0aW9uLCAoYWNjZXNzb3IsIHNlbCkgPT4gbmV3IFNoaWZ0Q29tbWFuZChzZWwsIHtcblx0XHRpc1Vuc2hpZnQ6IGZhbHNlLFxuXHRcdHRhYlNpemU6IDQsXG5cdFx0aW5kZW50U2l6ZTogNCxcblx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdHVzZVRhYlN0b3BzOiB1c2VUYWJTdG9wcyxcblx0XHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCxcblx0fSwgYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSksIGV4cGVjdGVkTGluZXMsIGV4cGVjdGVkU2VsZWN0aW9uLCB1bmRlZmluZWQsIHByZXBhcmUpO1xufVxuXG5mdW5jdGlvbiB0ZXN0VW5zaGlmdENvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBsYW5ndWFnZUlkOiBzdHJpbmcgfCBudWxsLCB1c2VUYWJTdG9wczogYm9vbGVhbiwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGV4cGVjdGVkTGluZXM6IHN0cmluZ1tdLCBleHBlY3RlZFNlbGVjdGlvbjogU2VsZWN0aW9uLCBwcmVwYXJlPzogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSA9PiB2b2lkKTogdm9pZCB7XG5cdHRlc3RDb21tYW5kKGxpbmVzLCBsYW5ndWFnZUlkLCBzZWxlY3Rpb24sIChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgU2hpZnRDb21tYW5kKHNlbCwge1xuXHRcdGlzVW5zaGlmdDogdHJ1ZSxcblx0XHR0YWJTaXplOiA0LFxuXHRcdGluZGVudFNpemU6IDQsXG5cdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHR1c2VUYWJTdG9wczogdXNlVGFiU3RvcHMsXG5cdFx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwsXG5cdH0sIGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpLCBleHBlY3RlZExpbmVzLCBleHBlY3RlZFNlbGVjdGlvbiwgdW5kZWZpbmVkLCBwcmVwYXJlKTtcbn1cblxuZnVuY3Rpb24gcHJlcGFyZURvY0Jsb2NrQ29tbWVudExhbmd1YWdlKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSB7XG5cdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGRpc3Bvc2FibGVzLmFkZChuZXcgRG9jQmxvY2tDb21tZW50TW9kZShsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcbn1cblxuc3VpdGUoJ0VkaXRvciBDb21tYW5kcyAtIFNoaWZ0Q29tbWFuZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tLS0tLS0gc2hpZnRcblxuXHR0ZXN0KCdCdWcgOTUwMzogU2hpZnRpbmcgd2l0aG91dCBhbnkgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0TXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMilcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaGlmdCBvbiBzaW5nbGUgbGluZSBzZWxlY3Rpb24gMScsICgpID0+IHtcblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdE15IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hpZnQgb24gc2luZ2xlIGxpbmUgc2VsZWN0aW9uIDInLCAoKSA9PiB7XG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMyksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZSBzaGlmdCcsICgpID0+IHtcblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdE15IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hpZnRpbmcgb24gdHdvIHNlcGFyYXRlIGxpbmVzJywgKCkgPT4ge1xuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0TXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMiwgMSlcblx0XHQpO1xuXG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J1xcdE15IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMywgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAzLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoaWZ0aW5nIG9uIHR3byBsaW5lcycsICgpID0+IHtcblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyLCAyLCAyKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdE15IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDIsIDIpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hpZnRpbmcgb24gdHdvIGxpbmVzIGFnYWluJywgKCkgPT4ge1xuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDIsIDEsIDIpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0TXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMiwgMSwgMylcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaGlmdGluZyBhdCBlbmQgb2YgZmlsZScsICgpID0+IHtcblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxLCA1LCAyKSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1xcdDEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDUsIDMpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExMjAgVEFCIHNob3VsZCBub3QgaW5kZW50IGVtcHR5IGxpbmVzIGluIGEgbXVsdGktbGluZSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgMiksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1xcdDEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDMpXG5cdFx0KTtcblxuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDUsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCdcXHQnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gdW5zaGlmdFxuXG5cdHRlc3QoJ3Vuc2hpZnQgb24gc2luZ2xlIGxpbmUgc2VsZWN0aW9uIDEnLCAoKSA9PiB7XG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMywgMiwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAzLCAyLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vuc2hpZnQgb24gc2luZ2xlIGxpbmUgc2VsZWN0aW9uIDInLCAoKSA9PiB7XG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMyksXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCAzKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZSB1bnNoaWZ0JywgKCkgPT4ge1xuXHRcdHRlc3RVbnNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMiwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vuc2hpZnRpbmcgb24gdHdvIGxpbmVzIDEnLCAoKSA9PiB7XG5cdFx0dGVzdFVuc2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyLCAyLCAyKSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIsIDIsIDIpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndW5zaGlmdGluZyBvbiB0d28gbGluZXMgMicsICgpID0+IHtcblx0XHR0ZXN0VW5zaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDMsIDIsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnNoaWZ0aW5nIGF0IHRoZSBlbmQgb2YgdGhlIGZpbGUnLCAoKSA9PiB7XG5cdFx0dGVzdFVuc2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxLCA1LCAyKSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDUsIDIpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndW5zaGlmdCBtYW55IHRpbWVzICsgc2hpZnQnLCAoKSA9PiB7XG5cdFx0dGVzdFVuc2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCA0KSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgNClcblx0XHQpO1xuXG5cdFx0dGVzdFVuc2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCdUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDQpLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCdUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCA0KVxuXHRcdCk7XG5cblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCdUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDQpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0TXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCdcXHRUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdcXHQxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCA1KVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0J1ZyA5MTE5OiBVbnNoaWZ0IGZyb20gZmlyc3QgY29sdW1uIGRvZXNuXFwndCB3b3JrJywgKCkgPT4ge1xuXHRcdHRlc3RVbnNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzNDg6IGluZGVudGluZyBhcm91bmQgZG9jIGJsb2NrIGNvbW1lbnRzJywgKCkgPT4ge1xuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnLyoqJyxcblx0XHRcdFx0JyAqIGEgZG9jIGNvbW1lbnQnLFxuXHRcdFx0XHQnICovJyxcblx0XHRcdFx0J2Z1bmN0aW9uIGhlbGxvKCkge30nXG5cdFx0XHRdLFxuXHRcdFx0RG9jQmxvY2tDb21tZW50TW9kZS5sYW5ndWFnZUlkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgMjApLFxuXHRcdFx0W1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1xcdC8qKicsXG5cdFx0XHRcdCdcXHQgKiBhIGRvYyBjb21tZW50Jyxcblx0XHRcdFx0J1xcdCAqLycsXG5cdFx0XHRcdCdcXHRmdW5jdGlvbiBoZWxsbygpIHt9J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgMjEpLFxuXHRcdFx0cHJlcGFyZURvY0Jsb2NrQ29tbWVudExhbmd1YWdlXG5cdFx0KTtcblxuXHRcdHRlc3RVbnNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcvKionLFxuXHRcdFx0XHQnICogYSBkb2MgY29tbWVudCcsXG5cdFx0XHRcdCcgKi8nLFxuXHRcdFx0XHQnZnVuY3Rpb24gaGVsbG8oKSB7fSdcblx0XHRcdF0sXG5cdFx0XHREb2NCbG9ja0NvbW1lbnRNb2RlLmxhbmd1YWdlSWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCAyMCksXG5cdFx0XHRbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnLyoqJyxcblx0XHRcdFx0JyAqIGEgZG9jIGNvbW1lbnQnLFxuXHRcdFx0XHQnICovJyxcblx0XHRcdFx0J2Z1bmN0aW9uIGhlbGxvKCkge30nXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCAyMCksXG5cdFx0XHRwcmVwYXJlRG9jQmxvY2tDb21tZW50TGFuZ3VhZ2Vcblx0XHQpO1xuXG5cdFx0dGVzdFVuc2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0Jyxcblx0XHRcdFx0J1xcdC8qKicsXG5cdFx0XHRcdCdcXHQgKiBhIGRvYyBjb21tZW50Jyxcblx0XHRcdFx0J1xcdCAqLycsXG5cdFx0XHRcdCdcXHRmdW5jdGlvbiBoZWxsbygpIHt9J1xuXHRcdFx0XSxcblx0XHRcdERvY0Jsb2NrQ29tbWVudE1vZGUubGFuZ3VhZ2VJZCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDIxKSxcblx0XHRcdFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcvKionLFxuXHRcdFx0XHQnICogYSBkb2MgY29tbWVudCcsXG5cdFx0XHRcdCcgKi8nLFxuXHRcdFx0XHQnZnVuY3Rpb24gaGVsbG8oKSB7fSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDIwKSxcblx0XHRcdHByZXBhcmVEb2NCbG9ja0NvbW1lbnRMYW5ndWFnZVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNjA5OiBXcm9uZyBpbmRlbnRhdGlvbiBvZiBibG9jayBjb21tZW50cycsICgpID0+IHtcblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0Jy8qKicsXG5cdFx0XHRcdCcgKiB0ZXN0Jyxcblx0XHRcdFx0JyAqJyxcblx0XHRcdFx0JyAqIEB0eXBlIHtudW1iZXJ9Jyxcblx0XHRcdFx0JyAqLycsXG5cdFx0XHRcdCd2YXIgZm9vID0gMDsnXG5cdFx0XHRdLFxuXHRcdFx0RG9jQmxvY2tDb21tZW50TW9kZS5sYW5ndWFnZUlkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNywgMTMpLFxuXHRcdFx0W1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1xcdC8qKicsXG5cdFx0XHRcdCdcXHQgKiB0ZXN0Jyxcblx0XHRcdFx0J1xcdCAqJyxcblx0XHRcdFx0J1xcdCAqIEB0eXBlIHtudW1iZXJ9Jyxcblx0XHRcdFx0J1xcdCAqLycsXG5cdFx0XHRcdCdcXHR2YXIgZm9vID0gMDsnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA3LCAxNCksXG5cdFx0XHRwcmVwYXJlRG9jQmxvY2tDb21tZW50TGFuZ3VhZ2Vcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTYyMDogYSkgTGluZSBpbmRlbnQgZG9lc25cXCd0IGhhbmRsZSBsZWFkaW5nIHdoaXRlc3BhY2UgcHJvcGVybHknLCAoKSA9PiB7XG5cdFx0dGVzdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICBXcml0dGVuIHwgTnVtZXJpYycsXG5cdFx0XHRcdCcgICAgICAgb25lIHwgMScsXG5cdFx0XHRcdCcgICAgICAgdHdvIHwgMicsXG5cdFx0XHRcdCcgICAgIHRocmVlIHwgMycsXG5cdFx0XHRcdCcgICAgICBmb3VyIHwgNCcsXG5cdFx0XHRcdCcgICAgICBmaXZlIHwgNScsXG5cdFx0XHRcdCcgICAgICAgc2l4IHwgNicsXG5cdFx0XHRcdCcgICAgIHNldmVuIHwgNycsXG5cdFx0XHRcdCcgICAgIGVpZ2h0IHwgOCcsXG5cdFx0XHRcdCcgICAgICBuaW5lIHwgOScsXG5cdFx0XHRcdCcgICAgICAgdGVuIHwgMTAnLFxuXHRcdFx0XHQnICAgIGVsZXZlbiB8IDExJyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMTMsIDEpLFxuXHRcdFx0KGFjY2Vzc29yLCBzZWwpID0+IG5ldyBTaGlmdENvbW1hbmQoc2VsLCB7XG5cdFx0XHRcdGlzVW5zaGlmdDogZmFsc2UsXG5cdFx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRcdGluc2VydFNwYWNlczogdHJ1ZSxcblx0XHRcdFx0dXNlVGFiU3RvcHM6IGZhbHNlLFxuXHRcdFx0XHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCxcblx0XHRcdH0sIGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgICAgIFdyaXR0ZW4gfCBOdW1lcmljJyxcblx0XHRcdFx0JyAgICAgICAgICAgb25lIHwgMScsXG5cdFx0XHRcdCcgICAgICAgICAgIHR3byB8IDInLFxuXHRcdFx0XHQnICAgICAgICAgdGhyZWUgfCAzJyxcblx0XHRcdFx0JyAgICAgICAgICBmb3VyIHwgNCcsXG5cdFx0XHRcdCcgICAgICAgICAgZml2ZSB8IDUnLFxuXHRcdFx0XHQnICAgICAgICAgICBzaXggfCA2Jyxcblx0XHRcdFx0JyAgICAgICAgIHNldmVuIHwgNycsXG5cdFx0XHRcdCcgICAgICAgICBlaWdodCB8IDgnLFxuXHRcdFx0XHQnICAgICAgICAgIG5pbmUgfCA5Jyxcblx0XHRcdFx0JyAgICAgICAgICAgdGVuIHwgMTAnLFxuXHRcdFx0XHQnICAgICAgICBlbGV2ZW4gfCAxMScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMTMsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2MjA6IGIpIExpbmUgaW5kZW50IGRvZXNuXFwndCBoYW5kbGUgbGVhZGluZyB3aGl0ZXNwYWNlIHByb3Blcmx5JywgKCkgPT4ge1xuXHRcdHRlc3RDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgICAgIFdyaXR0ZW4gfCBOdW1lcmljJyxcblx0XHRcdFx0JyAgICAgICAgICAgb25lIHwgMScsXG5cdFx0XHRcdCcgICAgICAgICAgIHR3byB8IDInLFxuXHRcdFx0XHQnICAgICAgICAgdGhyZWUgfCAzJyxcblx0XHRcdFx0JyAgICAgICAgICBmb3VyIHwgNCcsXG5cdFx0XHRcdCcgICAgICAgICAgZml2ZSB8IDUnLFxuXHRcdFx0XHQnICAgICAgICAgICBzaXggfCA2Jyxcblx0XHRcdFx0JyAgICAgICAgIHNldmVuIHwgNycsXG5cdFx0XHRcdCcgICAgICAgICBlaWdodCB8IDgnLFxuXHRcdFx0XHQnICAgICAgICAgIG5pbmUgfCA5Jyxcblx0XHRcdFx0JyAgICAgICAgICAgdGVuIHwgMTAnLFxuXHRcdFx0XHQnICAgICAgICBlbGV2ZW4gfCAxMScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEzLCAxKSxcblx0XHRcdChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgU2hpZnRDb21tYW5kKHNlbCwge1xuXHRcdFx0XHRpc1Vuc2hpZnQ6IHRydWUsXG5cdFx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRcdGluc2VydFNwYWNlczogdHJ1ZSxcblx0XHRcdFx0dXNlVGFiU3RvcHM6IGZhbHNlLFxuXHRcdFx0XHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCxcblx0XHRcdH0sIGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgV3JpdHRlbiB8IE51bWVyaWMnLFxuXHRcdFx0XHQnICAgICAgIG9uZSB8IDEnLFxuXHRcdFx0XHQnICAgICAgIHR3byB8IDInLFxuXHRcdFx0XHQnICAgICB0aHJlZSB8IDMnLFxuXHRcdFx0XHQnICAgICAgZm91ciB8IDQnLFxuXHRcdFx0XHQnICAgICAgZml2ZSB8IDUnLFxuXHRcdFx0XHQnICAgICAgIHNpeCB8IDYnLFxuXHRcdFx0XHQnICAgICBzZXZlbiB8IDcnLFxuXHRcdFx0XHQnICAgICBlaWdodCB8IDgnLFxuXHRcdFx0XHQnICAgICAgbmluZSB8IDknLFxuXHRcdFx0XHQnICAgICAgIHRlbiB8IDEwJyxcblx0XHRcdFx0JyAgICBlbGV2ZW4gfCAxMScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMTMsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2MjA6IGMpIExpbmUgaW5kZW50IGRvZXNuXFwndCBoYW5kbGUgbGVhZGluZyB3aGl0ZXNwYWNlIHByb3Blcmx5JywgKCkgPT4ge1xuXHRcdHRlc3RDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgICAgIFdyaXR0ZW4gfCBOdW1lcmljJyxcblx0XHRcdFx0JyAgICAgICAgICAgb25lIHwgMScsXG5cdFx0XHRcdCcgICAgICAgICAgIHR3byB8IDInLFxuXHRcdFx0XHQnICAgICAgICAgdGhyZWUgfCAzJyxcblx0XHRcdFx0JyAgICAgICAgICBmb3VyIHwgNCcsXG5cdFx0XHRcdCcgICAgICAgICAgZml2ZSB8IDUnLFxuXHRcdFx0XHQnICAgICAgICAgICBzaXggfCA2Jyxcblx0XHRcdFx0JyAgICAgICAgIHNldmVuIHwgNycsXG5cdFx0XHRcdCcgICAgICAgICBlaWdodCB8IDgnLFxuXHRcdFx0XHQnICAgICAgICAgIG5pbmUgfCA5Jyxcblx0XHRcdFx0JyAgICAgICAgICAgdGVuIHwgMTAnLFxuXHRcdFx0XHQnICAgICAgICBlbGV2ZW4gfCAxMScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEzLCAxKSxcblx0XHRcdChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgU2hpZnRDb21tYW5kKHNlbCwge1xuXHRcdFx0XHRpc1Vuc2hpZnQ6IHRydWUsXG5cdFx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRcdHVzZVRhYlN0b3BzOiBmYWxzZSxcblx0XHRcdFx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwsXG5cdFx0XHR9LCBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKSxcblx0XHRcdFtcblx0XHRcdFx0JyAgIFdyaXR0ZW4gfCBOdW1lcmljJyxcblx0XHRcdFx0JyAgICAgICBvbmUgfCAxJyxcblx0XHRcdFx0JyAgICAgICB0d28gfCAyJyxcblx0XHRcdFx0JyAgICAgdGhyZWUgfCAzJyxcblx0XHRcdFx0JyAgICAgIGZvdXIgfCA0Jyxcblx0XHRcdFx0JyAgICAgIGZpdmUgfCA1Jyxcblx0XHRcdFx0JyAgICAgICBzaXggfCA2Jyxcblx0XHRcdFx0JyAgICAgc2V2ZW4gfCA3Jyxcblx0XHRcdFx0JyAgICAgZWlnaHQgfCA4Jyxcblx0XHRcdFx0JyAgICAgIG5pbmUgfCA5Jyxcblx0XHRcdFx0JyAgICAgICB0ZW4gfCAxMCcsXG5cdFx0XHRcdCcgICAgZWxldmVuIHwgMTEnLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEzLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNjIwOiBkKSBMaW5lIGluZGVudCBkb2VzblxcJ3QgaGFuZGxlIGxlYWRpbmcgd2hpdGVzcGFjZSBwcm9wZXJseScsICgpID0+IHtcblx0XHR0ZXN0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J1xcdCAgIFdyaXR0ZW4gfCBOdW1lcmljJyxcblx0XHRcdFx0J1xcdCAgICAgICBvbmUgfCAxJyxcblx0XHRcdFx0J1xcdCAgICAgICB0d28gfCAyJyxcblx0XHRcdFx0J1xcdCAgICAgdGhyZWUgfCAzJyxcblx0XHRcdFx0J1xcdCAgICAgIGZvdXIgfCA0Jyxcblx0XHRcdFx0J1xcdCAgICAgIGZpdmUgfCA1Jyxcblx0XHRcdFx0J1xcdCAgICAgICBzaXggfCA2Jyxcblx0XHRcdFx0J1xcdCAgICAgc2V2ZW4gfCA3Jyxcblx0XHRcdFx0J1xcdCAgICAgZWlnaHQgfCA4Jyxcblx0XHRcdFx0J1xcdCAgICAgIG5pbmUgfCA5Jyxcblx0XHRcdFx0J1xcdCAgICAgICB0ZW4gfCAxMCcsXG5cdFx0XHRcdCdcXHQgICAgZWxldmVuIHwgMTEnLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxMywgMSksXG5cdFx0XHQoYWNjZXNzb3IsIHNlbCkgPT4gbmV3IFNoaWZ0Q29tbWFuZChzZWwsIHtcblx0XHRcdFx0aXNVbnNoaWZ0OiB0cnVlLFxuXHRcdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IHRydWUsXG5cdFx0XHRcdHVzZVRhYlN0b3BzOiBmYWxzZSxcblx0XHRcdFx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwsXG5cdFx0XHR9LCBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKSxcblx0XHRcdFtcblx0XHRcdFx0JyAgIFdyaXR0ZW4gfCBOdW1lcmljJyxcblx0XHRcdFx0JyAgICAgICBvbmUgfCAxJyxcblx0XHRcdFx0JyAgICAgICB0d28gfCAyJyxcblx0XHRcdFx0JyAgICAgdGhyZWUgfCAzJyxcblx0XHRcdFx0JyAgICAgIGZvdXIgfCA0Jyxcblx0XHRcdFx0JyAgICAgIGZpdmUgfCA1Jyxcblx0XHRcdFx0JyAgICAgICBzaXggfCA2Jyxcblx0XHRcdFx0JyAgICAgc2V2ZW4gfCA3Jyxcblx0XHRcdFx0JyAgICAgZWlnaHQgfCA4Jyxcblx0XHRcdFx0JyAgICAgIG5pbmUgfCA5Jyxcblx0XHRcdFx0JyAgICAgICB0ZW4gfCAxMCcsXG5cdFx0XHRcdCcgICAgZWxldmVuIHwgMTEnLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEzLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlIG1pY3Jvc29mdC9tb25hY28tZWRpdG9yIzQ0MzogSW5kZW50YXRpb24gb2YgYSBzaW5nbGUgcm93IGRlbGV0ZXMgc2VsZWN0ZWQgdGV4dCBpbiBzb21lIGNhc2VzJywgKCkgPT4ge1xuXHRcdHRlc3RDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnSGVsbG8gd29ybGQhJyxcblx0XHRcdFx0J2Fub3RoZXIgbGluZSdcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxMyksXG5cdFx0XHQoYWNjZXNzb3IsIHNlbCkgPT4gbmV3IFNoaWZ0Q29tbWFuZChzZWwsIHtcblx0XHRcdFx0aXNVbnNoaWZ0OiBmYWxzZSxcblx0XHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdFx0dXNlVGFiU3RvcHM6IHRydWUsXG5cdFx0XHRcdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsLFxuXHRcdFx0fSwgYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRIZWxsbyB3b3JsZCEnLFxuXHRcdFx0XHQnYW5vdGhlciBsaW5lJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTQpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnICMxNjgxNTpTaGlmdCtUYWIgZG9lc25cXCd0IGdvIGJhY2sgdG8gdGFic3RvcCcsICgpID0+IHtcblxuXHRcdGNvbnN0IHJlcGVhdFN0ciA9IChzdHI6IHN0cmluZywgY250OiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuXHRcdFx0bGV0IHIgPSAnJztcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY250OyBpKyspIHtcblx0XHRcdFx0ciArPSBzdHI7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdGVzdE91dGRlbnQgPSAodGFiU2l6ZTogbnVtYmVyLCBpbmRlbnRTaXplOiBudW1iZXIsIGluc2VydFNwYWNlczogYm9vbGVhbiwgbGluZVRleHQ6IHN0cmluZywgZXhwZWN0ZWRJbmRlbnRzOiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IG9uZUluZGVudCA9IGluc2VydFNwYWNlcyA/IHJlcGVhdFN0cignICcsIGluZGVudFNpemUpIDogJ1xcdCc7XG5cdFx0XHRjb25zdCBleHBlY3RlZEluZGVudCA9IHJlcGVhdFN0cihvbmVJbmRlbnQsIGV4cGVjdGVkSW5kZW50cyk7XG5cdFx0XHRpZiAobGluZVRleHQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRfYXNzZXJ0VW5zaGlmdENvbW1hbmQodGFiU2l6ZSwgaW5kZW50U2l6ZSwgaW5zZXJ0U3BhY2VzLCBbbGluZVRleHQgKyAnYWFhJ10sIFtjcmVhdGVTaW5nbGVFZGl0T3AoZXhwZWN0ZWRJbmRlbnQsIDEsIDEsIDEsIGxpbmVUZXh0Lmxlbmd0aCArIDEpXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRfYXNzZXJ0VW5zaGlmdENvbW1hbmQodGFiU2l6ZSwgaW5kZW50U2l6ZSwgaW5zZXJ0U3BhY2VzLCBbbGluZVRleHQgKyAnYWFhJ10sIFtdKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgdGVzdEluZGVudCA9ICh0YWJTaXplOiBudW1iZXIsIGluZGVudFNpemU6IG51bWJlciwgaW5zZXJ0U3BhY2VzOiBib29sZWFuLCBsaW5lVGV4dDogc3RyaW5nLCBleHBlY3RlZEluZGVudHM6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3Qgb25lSW5kZW50ID0gaW5zZXJ0U3BhY2VzID8gcmVwZWF0U3RyKCcgJywgaW5kZW50U2l6ZSkgOiAnXFx0Jztcblx0XHRcdGNvbnN0IGV4cGVjdGVkSW5kZW50ID0gcmVwZWF0U3RyKG9uZUluZGVudCwgZXhwZWN0ZWRJbmRlbnRzKTtcblx0XHRcdF9hc3NlcnRTaGlmdENvbW1hbmQodGFiU2l6ZSwgaW5kZW50U2l6ZSwgaW5zZXJ0U3BhY2VzLCBbbGluZVRleHQgKyAnYWFhJ10sIFtjcmVhdGVTaW5nbGVFZGl0T3AoZXhwZWN0ZWRJbmRlbnQsIDEsIDEsIDEsIGxpbmVUZXh0Lmxlbmd0aCArIDEpXSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRlc3RJbmRlbnRhdGlvbiA9ICh0YWJTaXplOiBudW1iZXIsIGluZGVudFNpemU6IG51bWJlciwgbGluZVRleHQ6IHN0cmluZywgZXhwZWN0ZWRPbk91dGRlbnQ6IG51bWJlciwgZXhwZWN0ZWRPbkluZGVudDogbnVtYmVyKSA9PiB7XG5cdFx0XHR0ZXN0T3V0ZGVudCh0YWJTaXplLCBpbmRlbnRTaXplLCB0cnVlLCBsaW5lVGV4dCwgZXhwZWN0ZWRPbk91dGRlbnQpO1xuXHRcdFx0dGVzdE91dGRlbnQodGFiU2l6ZSwgaW5kZW50U2l6ZSwgZmFsc2UsIGxpbmVUZXh0LCBleHBlY3RlZE9uT3V0ZGVudCk7XG5cblx0XHRcdHRlc3RJbmRlbnQodGFiU2l6ZSwgaW5kZW50U2l6ZSwgdHJ1ZSwgbGluZVRleHQsIGV4cGVjdGVkT25JbmRlbnQpO1xuXHRcdFx0dGVzdEluZGVudCh0YWJTaXplLCBpbmRlbnRTaXplLCBmYWxzZSwgbGluZVRleHQsIGV4cGVjdGVkT25JbmRlbnQpO1xuXHRcdH07XG5cblx0XHQvLyBpbnNlcnRTcGFjZXM6IHRydWVcblx0XHQvLyAwID0+IDBcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJycsIDAsIDEpO1xuXG5cdFx0Ly8gMSA9PiAwXG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICdcXHQnLCAwLCAyKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAnLCAwLCAxKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyBcXHQnLCAwLCAyKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgJywgMCwgMSk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgIFxcdCcsIDAsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAgJywgMCwgMSk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICBcXHQnLCAwLCAyKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgICAnLCAwLCAyKTtcblxuXHRcdC8vIDIgPT4gMVxuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnXFx0XFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICdcXHQgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICdcXHQgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICdcXHQgICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnXFx0ICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJ1xcdCAgICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnXFx0ICAgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICdcXHQgICAgJywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgXFx0XFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgXFx0ICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnIFxcdCBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyBcXHQgICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnIFxcdCAgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgXFx0ICAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgXFx0ICAgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgXFx0ICAgICcsIDEsIDMpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICBcXHRcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgXFx0ICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICBcXHQgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgIFxcdCAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgIFxcdCAgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgIFxcdCAgICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICBcXHQgICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgXFx0ICAgICcsIDEsIDMpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAgXFx0XFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICBcXHQgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICBcXHQgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICBcXHQgICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAgXFx0ICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgIFxcdCAgICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAgXFx0ICAgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICBcXHQgICAgJywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICAgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICAgICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAgICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgICAgICcsIDEsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAgICAgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICAgICAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICAgICAgXFx0JywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICAgICAgICcsIDEsIDMpO1xuXG5cdFx0Ly8gMyA9PiAyXG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICAgICAgICAnLCAyLCAzKTtcblxuXHRcdGZ1bmN0aW9uIF9hc3NlcnRVbnNoaWZ0Q29tbWFuZCh0YWJTaXplOiBudW1iZXIsIGluZGVudFNpemU6IG51bWJlciwgaW5zZXJ0U3BhY2VzOiBib29sZWFuLCB0ZXh0OiBzdHJpbmdbXSwgZXhwZWN0ZWQ6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10pOiB2b2lkIHtcblx0XHRcdHJldHVybiB3aXRoRWRpdG9yTW9kZWwodGV4dCwgKG1vZGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0XHRcdGNvbnN0IG9wID0gbmV3IFNoaWZ0Q29tbWFuZChuZXcgU2VsZWN0aW9uKDEsIDEsIHRleHQubGVuZ3RoICsgMSwgMSksIHtcblx0XHRcdFx0XHRpc1Vuc2hpZnQ6IHRydWUsXG5cdFx0XHRcdFx0dGFiU2l6ZTogdGFiU2l6ZSxcblx0XHRcdFx0XHRpbmRlbnRTaXplOiBpbmRlbnRTaXplLFxuXHRcdFx0XHRcdGluc2VydFNwYWNlczogaW5zZXJ0U3BhY2VzLFxuXHRcdFx0XHRcdHVzZVRhYlN0b3BzOiB0cnVlLFxuXHRcdFx0XHRcdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsLFxuXHRcdFx0XHR9LCB0ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbCA9IGdldEVkaXRPcGVyYXRpb24obW9kZWwsIG9wKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHRcdFx0dGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gX2Fzc2VydFNoaWZ0Q29tbWFuZCh0YWJTaXplOiBudW1iZXIsIGluZGVudFNpemU6IG51bWJlciwgaW5zZXJ0U3BhY2VzOiBib29sZWFuLCB0ZXh0OiBzdHJpbmdbXSwgZXhwZWN0ZWQ6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10pOiB2b2lkIHtcblx0XHRcdHJldHVybiB3aXRoRWRpdG9yTW9kZWwodGV4dCwgKG1vZGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0XHRcdGNvbnN0IG9wID0gbmV3IFNoaWZ0Q29tbWFuZChuZXcgU2VsZWN0aW9uKDEsIDEsIHRleHQubGVuZ3RoICsgMSwgMSksIHtcblx0XHRcdFx0XHRpc1Vuc2hpZnQ6IGZhbHNlLFxuXHRcdFx0XHRcdHRhYlNpemU6IHRhYlNpemUsXG5cdFx0XHRcdFx0aW5kZW50U2l6ZTogaW5kZW50U2l6ZSxcblx0XHRcdFx0XHRpbnNlcnRTcGFjZXM6IGluc2VydFNwYWNlcyxcblx0XHRcdFx0XHR1c2VUYWJTdG9wczogdHJ1ZSxcblx0XHRcdFx0XHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCxcblx0XHRcdFx0fSwgdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBhY3R1YWwgPSBnZXRFZGl0T3BlcmF0aW9uKG1vZGVsLCBvcCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdFx0XHRcdHRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBbUM7QUFDNUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsa0JBQWtCLG1CQUFtQjtBQUM5QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHVCQUF1QjtBQU1oQyxTQUFTLG1CQUFtQixNQUFjLG9CQUE0QixnQkFBd0Isc0JBQThCLG9CQUFvQixrQkFBMEIsZ0JBQXNDO0FBQy9NLFNBQU87QUFBQSxJQUNOLE9BQU8sSUFBSSxNQUFNLHFCQUFxQixpQkFBaUIsb0JBQW9CLGNBQWM7QUFBQSxJQUN6RjtBQUFBLElBQ0Esa0JBQWtCO0FBQUEsRUFDbkI7QUFDRDtBQUVBLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBSzVDLFlBQ21CLGlCQUNhLDhCQUM5QjtBQUNELFVBQU07QUFOUCxTQUFnQixhQUFhLG9CQUFvQjtBQU9oRCxTQUFLLFVBQVUsZ0JBQWdCLGlCQUFpQixFQUFFLElBQUksS0FBSyxXQUFXLENBQUMsQ0FBQztBQUN4RSxTQUFLLFVBQVUsNkJBQTZC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
