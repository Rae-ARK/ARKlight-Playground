import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { EndOfLinePreference, EndOfLineSequence } from "../../../common/model.js";
import { MirrorTextModel } from "../../../common/model/mirrorTextModel.js";
import { assertSyncedModels, testApplyEditsWithSyncedModels } from "./editableTextModelTestUtils.js";
import { createTextModel } from "../testTextModel.js";
suite("EditorModel - EditableTextModel.applyEdits updates mightContainRTL", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testApplyEdits(original, edits, before, after) {
    const model = createTextModel(original.join("\n"));
    model.setEOL(EndOfLineSequence.LF);
    assert.strictEqual(model.mightContainRTL(), before);
    model.applyEdits(edits);
    assert.strictEqual(model.mightContainRTL(), after);
    model.dispose();
  }
  function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
    return {
      range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
      text: text.join("\n")
    };
  }
  test("start with RTL, insert LTR", () => {
    testApplyEdits(["Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"], [editOp(1, 1, 1, 1, ["hello"])], true, true);
  });
  test("start with RTL, delete RTL", () => {
    testApplyEdits(["Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"], [editOp(1, 1, 10, 10, [""])], true, true);
  });
  test("start with RTL, insert RTL", () => {
    testApplyEdits(["Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"], [editOp(1, 1, 1, 1, ["\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644"])], true, true);
  });
  test("start with LTR, insert LTR", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["hello"])], false, false);
  });
  test("start with LTR, insert RTL 1", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644"])], false, true);
  });
  test("start with LTR, insert RTL 2", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"])], false, true);
  });
});
suite("EditorModel - EditableTextModel.applyEdits updates mightContainNonBasicASCII", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testApplyEdits(original, edits, before, after) {
    const model = createTextModel(original.join("\n"));
    model.setEOL(EndOfLineSequence.LF);
    assert.strictEqual(model.mightContainNonBasicASCII(), before);
    model.applyEdits(edits);
    assert.strictEqual(model.mightContainNonBasicASCII(), after);
    model.dispose();
  }
  function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
    return {
      range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
      text: text.join("\n")
    };
  }
  test("start with NON-ASCII, insert ASCII", () => {
    testApplyEdits(["Hello,\nZ\xFCrich"], [editOp(1, 1, 1, 1, ["hello", "second line"])], true, true);
  });
  test("start with NON-ASCII, delete NON-ASCII", () => {
    testApplyEdits(["Hello,\nZ\xFCrich"], [editOp(1, 1, 10, 10, [""])], true, true);
  });
  test("start with NON-ASCII, insert NON-ASCII", () => {
    testApplyEdits(["Hello,\nZ\xFCrich"], [editOp(1, 1, 1, 1, ["Z\xFCrich"])], true, true);
  });
  test("start with ASCII, insert ASCII", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["hello", "second line"])], false, false);
  });
  test("start with ASCII, insert NON-ASCII", () => {
    testApplyEdits(["Hello,\nworld!"], [editOp(1, 1, 1, 1, ["Z\xFCrich", "Z\xFCrich"])], false, true);
  });
});
suite("EditorModel - EditableTextModel.applyEdits", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function editOp(startLineNumber, startColumn, endLineNumber, endColumn, text) {
    return {
      range: new Range(startLineNumber, startColumn, endLineNumber, endColumn),
      text: text.join("\n"),
      forceMoveMarkers: false
    };
  }
  test("high-low surrogates 1", () => {
    testApplyEditsWithSyncedModels(
      [
        "\u{1F4DA}some",
        "very nice",
        "text"
      ],
      [
        editOp(1, 2, 1, 2, ["a"])
      ],
      [
        "a\u{1F4DA}some",
        "very nice",
        "text"
      ],
      /*inputEditsAreInvalid*/
      true
    );
  });
  test("high-low surrogates 2", () => {
    testApplyEditsWithSyncedModels(
      [
        "\u{1F4DA}some",
        "very nice",
        "text"
      ],
      [
        editOp(1, 2, 1, 3, ["a"])
      ],
      [
        "asome",
        "very nice",
        "text"
      ],
      /*inputEditsAreInvalid*/
      true
    );
  });
  test("high-low surrogates 3", () => {
    testApplyEditsWithSyncedModels(
      [
        "\u{1F4DA}some",
        "very nice",
        "text"
      ],
      [
        editOp(1, 1, 1, 2, ["a"])
      ],
      [
        "asome",
        "very nice",
        "text"
      ],
      /*inputEditsAreInvalid*/
      true
    );
  });
  test("high-low surrogates 4", () => {
    testApplyEditsWithSyncedModels(
      [
        "\u{1F4DA}some",
        "very nice",
        "text"
      ],
      [
        editOp(1, 1, 1, 3, ["a"])
      ],
      [
        "asome",
        "very nice",
        "text"
      ],
      /*inputEditsAreInvalid*/
      true
    );
  });
  test("Bug 19872: Undo is funky", () => {
    testApplyEditsWithSyncedModels(
      [
        "something",
        " A",
        "",
        " B",
        "something else"
      ],
      [
        editOp(2, 1, 2, 2, [""]),
        editOp(3, 1, 4, 2, [""])
      ],
      [
        "something",
        "A",
        "B",
        "something else"
      ]
    );
  });
  test("Bug 19872: Undo is funky (2)", () => {
    testApplyEditsWithSyncedModels(
      [
        "something",
        "A",
        "B",
        "something else"
      ],
      [
        editOp(2, 1, 2, 1, [" "]),
        editOp(3, 1, 3, 1, ["", " "])
      ],
      [
        "something",
        " A",
        "",
        " B",
        "something else"
      ]
    );
  });
  test("insert empty text", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 1, [""])
      ],
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("last op is no-op", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 2, [""]),
        editOp(4, 1, 4, 1, [""])
      ],
      [
        "y First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text without newline 1", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 1, ["foo "])
      ],
      [
        "foo My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text without newline 2", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, [" foo"])
      ],
      [
        "My foo First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert one newline", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 4, 1, 4, ["", ""])
      ],
      [
        "My ",
        "First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text with one newline", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, [" new line", "No longer"])
      ],
      [
        "My new line",
        "No longer First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text with two newlines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, [" new line", "One more line in the middle", "No longer"])
      ],
      [
        "My new line",
        "One more line in the middle",
        "No longer First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert text with many newlines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, ["", "", "", "", ""])
      ],
      [
        "My",
        "",
        "",
        "",
        " First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("insert multiple newlines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 3, 1, 3, ["", "", "", "", ""]),
        editOp(3, 15, 3, 15, ["a", "b"])
      ],
      [
        "My",
        "",
        "",
        "",
        " First Line",
        "		My Second Line",
        "    Third Linea",
        "b",
        "",
        "1"
      ]
    );
  });
  test("delete empty text", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 1, [""])
      ],
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete text from one line", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 2, [""])
      ],
      [
        "y First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete text from one line 2", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 3, ["a"])
      ],
      [
        "a First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete all text from a line", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 1, 14, [""])
      ],
      [
        "",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete text from two lines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 4, 2, 6, [""])
      ],
      [
        "My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete text from many lines", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 4, 3, 5, [""])
      ],
      [
        "My Third Line",
        "",
        "1"
      ]
    );
  });
  test("delete everything", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "1"
      ],
      [
        editOp(1, 1, 5, 2, [""])
      ],
      [
        ""
      ]
    );
  });
  test("two unrelated edits", () => {
    testApplyEditsWithSyncedModels(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      [
        editOp(2, 1, 2, 3, ["	"]),
        editOp(3, 1, 3, 5, [""])
      ],
      [
        "My First Line",
        "	My Second Line",
        "Third Line",
        "",
        "123"
      ]
    );
  });
  test("two edits on one line", () => {
    testApplyEditsWithSyncedModels(
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      [
        editOp(5, 3, 5, 7, [""]),
        editOp(5, 12, 5, 16, [""])
      ],
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		fifth		"
      ]
    );
  });
  test("many edits", () => {
    testApplyEditsWithSyncedModels(
      [
        '{"x" : 1}'
      ],
      [
        editOp(1, 2, 1, 2, ["\n  "]),
        editOp(1, 5, 1, 6, [""]),
        editOp(1, 9, 1, 9, ["\n"])
      ],
      [
        "{",
        '  "x": 1',
        "}"
      ]
    );
  });
  test("many edits reversed", () => {
    testApplyEditsWithSyncedModels(
      [
        "{",
        '  "x": 1',
        "}"
      ],
      [
        editOp(1, 2, 2, 3, [""]),
        editOp(2, 6, 2, 6, [" "]),
        editOp(2, 9, 3, 1, [""])
      ],
      [
        '{"x" : 1}'
      ]
    );
  });
  test("replacing newlines 1", () => {
    testApplyEditsWithSyncedModels(
      [
        "{",
        '"a": true,',
        "",
        '"b": true',
        "}"
      ],
      [
        editOp(1, 2, 2, 1, ["", "	"]),
        editOp(2, 11, 4, 1, ["", "	"])
      ],
      [
        "{",
        '	"a": true,',
        '	"b": true',
        "}"
      ]
    );
  });
  test("replacing newlines 2", () => {
    testApplyEditsWithSyncedModels(
      [
        "some text",
        "some more text",
        "now comes an empty line",
        "",
        "after empty line",
        "and the last line"
      ],
      [
        editOp(1, 5, 3, 1, [" text", "some more text", "some more text"]),
        editOp(3, 2, 4, 1, ["o more lines", "asd", "asd", "asd"]),
        editOp(5, 1, 5, 6, ["zzzzzzzz"]),
        editOp(5, 11, 6, 16, ["1", "2", "3", "4"])
      ],
      [
        "some text",
        "some more text",
        "some more textno more lines",
        "asd",
        "asd",
        "asd",
        "zzzzzzzz empt1",
        "2",
        "3",
        "4ne"
      ]
    );
  });
  test("advanced 1", () => {
    testApplyEditsWithSyncedModels(
      [
        ' {       "d": [',
        "             null",
        "        ] /*comment*/",
        '        ,"e": /*comment*/ [null] }'
      ],
      [
        editOp(1, 1, 1, 2, [""]),
        editOp(1, 3, 1, 10, ["", "  "]),
        editOp(1, 16, 2, 14, ["", "    "]),
        editOp(2, 18, 3, 9, ["", "  "]),
        editOp(3, 22, 4, 9, [""]),
        editOp(4, 10, 4, 10, ["", "  "]),
        editOp(4, 28, 4, 28, ["", "    "]),
        editOp(4, 32, 4, 32, ["", "  "]),
        editOp(4, 33, 4, 34, ["", ""])
      ],
      [
        "{",
        '  "d": [',
        "    null",
        "  ] /*comment*/,",
        '  "e": /*comment*/ [',
        "    null",
        "  ]",
        "}"
      ]
    );
  });
  test("advanced simplified", () => {
    testApplyEditsWithSyncedModels(
      [
        "   abc",
        " ,def"
      ],
      [
        editOp(1, 1, 1, 4, [""]),
        editOp(1, 7, 2, 2, [""]),
        editOp(2, 3, 2, 3, ["", ""])
      ],
      [
        "abc,",
        "def"
      ]
    );
  });
  test("issue #144", () => {
    testApplyEditsWithSyncedModels(
      [
        "package caddy",
        "",
        "func main() {",
        '	fmt.Println("Hello World! :)")',
        "}",
        ""
      ],
      [
        editOp(1, 1, 6, 1, [
          "package caddy",
          "",
          'import "fmt"',
          "",
          "func main() {",
          '	fmt.Println("Hello World! :)")',
          "}",
          ""
        ])
      ],
      [
        "package caddy",
        "",
        'import "fmt"',
        "",
        "func main() {",
        '	fmt.Println("Hello World! :)")',
        "}",
        ""
      ]
    );
  });
  test("issue #2586 Replacing selected end-of-line with newline locks up the document", () => {
    testApplyEditsWithSyncedModels(
      [
        "something",
        "interesting"
      ],
      [
        editOp(1, 10, 2, 1, ["", ""])
      ],
      [
        "something",
        "interesting"
      ]
    );
  });
  test("issue #3980", () => {
    testApplyEditsWithSyncedModels(
      [
        "class A {",
        "    someProperty = false;",
        "    someMethod() {",
        "    this.someMethod();",
        "    }",
        "}"
      ],
      [
        editOp(1, 8, 1, 9, ["", ""]),
        editOp(3, 17, 3, 18, ["", ""]),
        editOp(3, 18, 3, 18, ["    "]),
        editOp(4, 5, 4, 5, ["    "])
      ],
      [
        "class A",
        "{",
        "    someProperty = false;",
        "    someMethod()",
        "    {",
        "        this.someMethod();",
        "    }",
        "}"
      ]
    );
  });
  function testApplyEditsFails(original, edits) {
    const model = createTextModel(original.join("\n"));
    let hasThrown = false;
    try {
      model.applyEdits(edits);
    } catch (err) {
      hasThrown = true;
    }
    assert.ok(hasThrown, "expected model.applyEdits to fail.");
    model.dispose();
  }
  test("touching edits: two inserts at the same position", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 1, ["a"]),
        editOp(1, 1, 1, 1, ["b"])
      ],
      [
        "abhello world"
      ]
    );
  });
  test("touching edits: insert and replace touching", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 1, ["b"]),
        editOp(1, 1, 1, 3, ["ab"])
      ],
      [
        "babllo world"
      ]
    );
  });
  test("overlapping edits: two overlapping replaces", () => {
    testApplyEditsFails(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 2, ["b"]),
        editOp(1, 1, 1, 3, ["ab"])
      ]
    );
  });
  test("overlapping edits: two overlapping deletes", () => {
    testApplyEditsFails(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 2, [""]),
        editOp(1, 1, 1, 3, [""])
      ]
    );
  });
  test("touching edits: two touching replaces", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 2, ["H"]),
        editOp(1, 2, 1, 3, ["E"])
      ],
      [
        "HEllo world"
      ]
    );
  });
  test("touching edits: two touching deletes", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 2, [""]),
        editOp(1, 2, 1, 3, [""])
      ],
      [
        "llo world"
      ]
    );
  });
  test("touching edits: insert and replace", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 1, ["H"]),
        editOp(1, 1, 1, 3, ["e"])
      ],
      [
        "Hello world"
      ]
    );
  });
  test("touching edits: replace and insert", () => {
    testApplyEditsWithSyncedModels(
      [
        "hello world"
      ],
      [
        editOp(1, 1, 1, 3, ["H"]),
        editOp(1, 3, 1, 3, ["e"])
      ],
      [
        "Hello world"
      ]
    );
  });
  test("change while emitting events 1", () => {
    let disposable;
    assertSyncedModels("Hello", (model, assertMirrorModels) => {
      model.applyEdits([{
        range: new Range(1, 6, 1, 6),
        text: " world!"
        // forceMoveMarkers: false
      }]);
      assertMirrorModels();
    }, (model) => {
      let isFirstTime = true;
      disposable = model.onDidChangeContent(() => {
        if (!isFirstTime) {
          return;
        }
        isFirstTime = false;
        model.applyEdits([{
          range: new Range(1, 13, 1, 13),
          text: " How are you?"
          // forceMoveMarkers: false
        }]);
      });
    });
    disposable.dispose();
  });
  test("change while emitting events 2", () => {
    let disposable;
    assertSyncedModels("Hello", (model, assertMirrorModels) => {
      model.applyEdits([{
        range: new Range(1, 6, 1, 6),
        text: " world!"
        // forceMoveMarkers: false
      }]);
      assertMirrorModels();
    }, (model) => {
      let isFirstTime = true;
      disposable = model.onDidChangeContent((e) => {
        if (!isFirstTime) {
          return;
        }
        isFirstTime = false;
        model.applyEdits([{
          range: new Range(1, 13, 1, 13),
          text: " How are you?"
          // forceMoveMarkers: false
        }]);
      });
    });
    disposable.dispose();
  });
  test("issue #1580: Changes in line endings are not correctly reflected in the extension host, leading to invalid offsets sent to external refactoring tools", () => {
    const model = createTextModel("Hello\nWorld!");
    assert.strictEqual(model.getEOL(), "\n");
    const mirrorModel2 = new MirrorTextModel(null, model.getLinesContent(), model.getEOL(), model.getVersionId());
    let mirrorModel2PrevVersionId = model.getVersionId();
    const disposable = model.onDidChangeContent((e) => {
      const versionId = e.versionId;
      if (versionId < mirrorModel2PrevVersionId) {
        console.warn("Model version id did not advance between edits (2)");
      }
      mirrorModel2PrevVersionId = versionId;
      mirrorModel2.onEvents(e);
    });
    const assertMirrorModels = () => {
      assert.strictEqual(mirrorModel2.getText(), model.getValue(), "mirror model 2 text OK");
      assert.strictEqual(mirrorModel2.version, model.getVersionId(), "mirror model 2 version OK");
    };
    model.setEOL(EndOfLineSequence.CRLF);
    assertMirrorModels();
    disposable.dispose();
    model.dispose();
    mirrorModel2.dispose();
  });
  test("issue #47733: Undo mangles unicode characters", () => {
    const model = createTextModel("'\u{1F441}'");
    model.applyEdits([
      { range: new Range(1, 1, 1, 1), text: '"' },
      { range: new Range(1, 2, 1, 2), text: '"' }
    ]);
    assert.strictEqual(model.getValue(EndOfLinePreference.LF), `"'"\u{1F441}'`);
    assert.deepStrictEqual(model.validateRange(new Range(1, 3, 1, 4)), new Range(1, 3, 1, 4));
    model.applyEdits([
      { range: new Range(1, 1, 1, 2), text: null },
      { range: new Range(1, 3, 1, 4), text: null }
    ]);
    assert.strictEqual(model.getValue(EndOfLinePreference.LF), "'\u{1F441}'");
    model.dispose();
  });
  test("issue #48741: Broken undo stack with move lines up with multiple cursors", () => {
    const model = createTextModel([
      "line1",
      "line2",
      "line3",
      ""
    ].join("\n"));
    const undoEdits = model.applyEdits([
      { range: new Range(4, 1, 4, 1), text: "line3" },
      { range: new Range(3, 1, 3, 6), text: null },
      { range: new Range(2, 1, 3, 1), text: null },
      { range: new Range(3, 6, 3, 6), text: "\nline2" }
    ], true);
    model.applyEdits(undoEdits);
    assert.deepStrictEqual(model.getValue(), "line1\nline2\nline3\n");
    model.dispose();
  });
});
suite("CRLF edit normalization", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("edit ending with \\r followed by \\n in buffer should strip trailing \\r", () => {
    const model = createTextModel("abc\r\ndef\r\n");
    model.setEOL(EndOfLineSequence.CRLF);
    assert.strictEqual(model.getEOL(), "\r\n");
    assert.strictEqual(model.getLineCount(), 3);
    assert.strictEqual(model.getLineContent(1), "abc");
    assert.strictEqual(model.getLineContent(2), "def");
    model.applyEdits([
      { range: new Range(1, 1, 1, 4), text: "xyz\r" }
    ]);
    assert.strictEqual(model.getLineContent(1), "xyz");
    assert.strictEqual(model.getLineContent(2), "def");
    assert.strictEqual(model.getLineCount(), 3);
    model.dispose();
  });
  test("edit ending with \\r\\n should NOT be modified", () => {
    const model = createTextModel("abc\r\ndef\r\n");
    model.setEOL(EndOfLineSequence.CRLF);
    model.applyEdits([
      { range: new Range(1, 1, 1, 4), text: "xyz\r\n" }
    ]);
    assert.strictEqual(model.getLineContent(1), "xyz");
    assert.strictEqual(model.getLineContent(2), "");
    assert.strictEqual(model.getLineContent(3), "def");
    assert.strictEqual(model.getLineCount(), 4);
    model.dispose();
  });
  test("edit ending with \\r NOT followed by \\n should NOT be modified", () => {
    const model = createTextModel("abcdef");
    model.setEOL(EndOfLineSequence.CRLF);
    model.applyEdits([
      { range: new Range(1, 1, 1, 4), text: "xyz\r" }
    ]);
    assert.strictEqual(model.getLineCount(), 2);
    model.dispose();
  });
  test("edit in LF buffer should NOT strip trailing \\r", () => {
    const model = createTextModel("abc\ndef\n");
    model.setEOL(EndOfLineSequence.LF);
    assert.strictEqual(model.getEOL(), "\n");
    assert.strictEqual(model.getLineCount(), 3);
    model.applyEdits([
      { range: new Range(1, 1, 1, 4), text: "xyz\r" }
    ]);
    assert.strictEqual(model.getLineCount(), 4);
    model.dispose();
  });
  test("LSP include sorting scenario - edit ending with \\r should be normalized", () => {
    const model = createTextModel('#include "a.h"\r\n#include "c.h"\r\n#include "b.h"\r\n');
    model.setEOL(EndOfLineSequence.CRLF);
    assert.strictEqual(model.getEOL(), "\r\n");
    assert.strictEqual(model.getLineCount(), 4);
    assert.strictEqual(model.getLineContent(1), '#include "a.h"');
    assert.strictEqual(model.getLineContent(2), '#include "c.h"');
    assert.strictEqual(model.getLineContent(3), '#include "b.h"');
    model.applyEdits([
      {
        range: new Range(1, 1, 3, 16),
        text: '#include "a.h"\r\n#include "b.h"\r\n#include "c.h"\r'
      }
    ]);
    assert.strictEqual(model.getLineCount(), 4);
    assert.strictEqual(model.getLineContent(1), '#include "a.h"');
    assert.strictEqual(model.getLineContent(2), '#include "b.h"');
    assert.strictEqual(model.getLineContent(3), '#include "c.h"');
    assert.strictEqual(model.getLineContent(4), "");
    model.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9lZGl0YWJsZVRleHRNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVQcmVmZXJlbmNlLCBFbmRPZkxpbmVTZXF1ZW5jZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNaXJyb3JUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvbWlycm9yVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IGFzc2VydFN5bmNlZE1vZGVscywgdGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzIH0gZnJvbSAnLi9lZGl0YWJsZVRleHRNb2RlbFRlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi90ZXN0VGV4dE1vZGVsLmpzJztcblxuc3VpdGUoJ0VkaXRvck1vZGVsIC0gRWRpdGFibGVUZXh0TW9kZWwuYXBwbHlFZGl0cyB1cGRhdGVzIG1pZ2h0Q29udGFpblJUTCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiB0ZXN0QXBwbHlFZGl0cyhvcmlnaW5hbDogc3RyaW5nW10sIGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBiZWZvcmU6IGJvb2xlYW4sIGFmdGVyOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwob3JpZ2luYWwuam9pbignXFxuJykpO1xuXHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5MRik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubWlnaHRDb250YWluUlRMKCksIGJlZm9yZSk7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKGVkaXRzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubWlnaHRDb250YWluUlRMKCksIGFmdGVyKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH1cblxuXHRmdW5jdGlvbiBlZGl0T3Aoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIHRleHQ6IHN0cmluZ1tdKTogSVNpbmdsZUVkaXRPcGVyYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksXG5cdFx0XHR0ZXh0OiB0ZXh0LmpvaW4oJ1xcbicpXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3N0YXJ0IHdpdGggUlRMLCBpbnNlcnQgTFRSJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFsnSGVsbG8sXFxuXHUwNUQ2XHUwNUQ1XHUwNUQ0XHUwNUQ5IFx1MDVFMlx1MDVENVx1MDVEMVx1MDVEM1x1MDVENCBcdTA1REVcdTA1RDFcdTA1RDVcdTA1RTFcdTA1RTFcdTA1RUEgXHUwNUU5XHUwNUQzXHUwNUUyXHUwNUVBXHUwNUQ1J10sIFtlZGl0T3AoMSwgMSwgMSwgMSwgWydoZWxsbyddKV0sIHRydWUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydCB3aXRoIFJUTCwgZGVsZXRlIFJUTCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhbJ0hlbGxvLFxcblx1MDVENlx1MDVENVx1MDVENFx1MDVEOSBcdTA1RTJcdTA1RDVcdTA1RDFcdTA1RDNcdTA1RDQgXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBIFx1MDVFOVx1MDVEM1x1MDVFMlx1MDVFQVx1MDVENSddLCBbZWRpdE9wKDEsIDEsIDEwLCAxMCwgWycnXSldLCB0cnVlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnQgd2l0aCBSVEwsIGluc2VydCBSVEwnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG5cdTA1RDZcdTA1RDVcdTA1RDRcdTA1RDkgXHUwNUUyXHUwNUQ1XHUwNUQxXHUwNUQzXHUwNUQ0IFx1MDVERVx1MDVEMVx1MDVENVx1MDVFMVx1MDVFMVx1MDVFQSBcdTA1RTlcdTA1RDNcdTA1RTJcdTA1RUFcdTA1RDUnXSwgW2VkaXRPcCgxLCAxLCAxLCAxLCBbJ1x1MDY0N1x1MDY0Nlx1MDYyN1x1MDY0MyBcdTA2MkRcdTA2NDJcdTA2NEFcdTA2NDJcdTA2MjkgXHUwNjQ1XHUwNjJCXHUwNjI4XHUwNjJBXHUwNjI5IFx1MDY0NVx1MDY0Nlx1MDYzMCBcdTA2MzJcdTA2NDVcdTA2NDYgXHUwNjM3XHUwNjQ4XHUwNjRBXHUwNjQ0J10pXSwgdHJ1ZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0IHdpdGggTFRSLCBpbnNlcnQgTFRSJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFsnSGVsbG8sXFxud29ybGQhJ10sIFtlZGl0T3AoMSwgMSwgMSwgMSwgWydoZWxsbyddKV0sIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0IHdpdGggTFRSLCBpbnNlcnQgUlRMIDEnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG53b3JsZCEnXSwgW2VkaXRPcCgxLCAxLCAxLCAxLCBbJ1x1MDY0N1x1MDY0Nlx1MDYyN1x1MDY0MyBcdTA2MkRcdTA2NDJcdTA2NEFcdTA2NDJcdTA2MjkgXHUwNjQ1XHUwNjJCXHUwNjI4XHUwNjJBXHUwNjI5IFx1MDY0NVx1MDY0Nlx1MDYzMCBcdTA2MzJcdTA2NDVcdTA2NDYgXHUwNjM3XHUwNjQ4XHUwNjRBXHUwNjQ0J10pXSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFydCB3aXRoIExUUiwgaW5zZXJ0IFJUTCAyJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFsnSGVsbG8sXFxud29ybGQhJ10sIFtlZGl0T3AoMSwgMSwgMSwgMSwgWydcdTA1RDZcdTA1RDVcdTA1RDRcdTA1RDkgXHUwNUUyXHUwNUQ1XHUwNUQxXHUwNUQzXHUwNUQ0IFx1MDVERVx1MDVEMVx1MDVENVx1MDVFMVx1MDVFMVx1MDVFQSBcdTA1RTlcdTA1RDNcdTA1RTJcdTA1RUFcdTA1RDUnXSldLCBmYWxzZSwgdHJ1ZSk7XG5cdH0pO1xufSk7XG5cblxuc3VpdGUoJ0VkaXRvck1vZGVsIC0gRWRpdGFibGVUZXh0TW9kZWwuYXBwbHlFZGl0cyB1cGRhdGVzIG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gdGVzdEFwcGx5RWRpdHMob3JpZ2luYWw6IHN0cmluZ1tdLCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSwgYmVmb3JlOiBib29sZWFuLCBhZnRlcjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKG9yaWdpbmFsLmpvaW4oJ1xcbicpKTtcblx0XHRtb2RlbC5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuTEYpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKSwgYmVmb3JlKTtcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoZWRpdHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJKCksIGFmdGVyKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH1cblxuXHRmdW5jdGlvbiBlZGl0T3Aoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0YXJ0Q29sdW1uOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgZW5kQ29sdW1uOiBudW1iZXIsIHRleHQ6IHN0cmluZ1tdKTogSVNpbmdsZUVkaXRPcGVyYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksXG5cdFx0XHR0ZXh0OiB0ZXh0LmpvaW4oJ1xcbicpXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3N0YXJ0IHdpdGggTk9OLUFTQ0lJLCBpbnNlcnQgQVNDSUknLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG5aXHUwMEZDcmljaCddLCBbZWRpdE9wKDEsIDEsIDEsIDEsIFsnaGVsbG8nLCAnc2Vjb25kIGxpbmUnXSldLCB0cnVlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnQgd2l0aCBOT04tQVNDSUksIGRlbGV0ZSBOT04tQVNDSUknLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG5aXHUwMEZDcmljaCddLCBbZWRpdE9wKDEsIDEsIDEwLCAxMCwgWycnXSldLCB0cnVlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnQgd2l0aCBOT04tQVNDSUksIGluc2VydCBOT04tQVNDSUknLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG5aXHUwMEZDcmljaCddLCBbZWRpdE9wKDEsIDEsIDEsIDEsIFsnWlx1MDBGQ3JpY2gnXSldLCB0cnVlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnQgd2l0aCBBU0NJSSwgaW5zZXJ0IEFTQ0lJJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFsnSGVsbG8sXFxud29ybGQhJ10sIFtlZGl0T3AoMSwgMSwgMSwgMSwgWydoZWxsbycsICdzZWNvbmQgbGluZSddKV0sIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0IHdpdGggQVNDSUksIGluc2VydCBOT04tQVNDSUknLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoWydIZWxsbyxcXG53b3JsZCEnXSwgW2VkaXRPcCgxLCAxLCAxLCAxLCBbJ1pcdTAwRkNyaWNoJywgJ1pcdTAwRkNyaWNoJ10pXSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdFZGl0b3JNb2RlbCAtIEVkaXRhYmxlVGV4dE1vZGVsLmFwcGx5RWRpdHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gZWRpdE9wKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCB0ZXh0OiBzdHJpbmdbXSk6IElTaW5nbGVFZGl0T3BlcmF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pLFxuXHRcdFx0dGV4dDogdGV4dC5qb2luKCdcXG4nKSxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ2hpZ2gtbG93IHN1cnJvZ2F0ZXMgMScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdcdUQ4M0RcdURDREFzb21lJyxcblx0XHRcdFx0J3ZlcnkgbmljZScsXG5cdFx0XHRcdCd0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDIsIDEsIDIsIFsnYSddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2FcdUQ4M0RcdURDREFzb21lJyxcblx0XHRcdFx0J3ZlcnkgbmljZScsXG5cdFx0XHRcdCd0ZXh0J1xuXHRcdFx0XSxcbi8qaW5wdXRFZGl0c0FyZUludmFsaWQqL3RydWVcblx0XHQpO1xuXHR9KTtcblx0dGVzdCgnaGlnaC1sb3cgc3Vycm9nYXRlcyAyJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J1x1RDgzRFx1RENEQXNvbWUnLFxuXHRcdFx0XHQndmVyeSBuaWNlJyxcblx0XHRcdFx0J3RleHQnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMiwgMSwgMywgWydhJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnYXNvbWUnLFxuXHRcdFx0XHQndmVyeSBuaWNlJyxcblx0XHRcdFx0J3RleHQnXG5cdFx0XHRdLFxuLyppbnB1dEVkaXRzQXJlSW52YWxpZCovdHJ1ZVxuXHRcdCk7XG5cdH0pO1xuXHR0ZXN0KCdoaWdoLWxvdyBzdXJyb2dhdGVzIDMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnXHVEODNEXHVEQ0RBc29tZScsXG5cdFx0XHRcdCd2ZXJ5IG5pY2UnLFxuXHRcdFx0XHQndGV4dCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAyLCBbJ2EnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdhc29tZScsXG5cdFx0XHRcdCd2ZXJ5IG5pY2UnLFxuXHRcdFx0XHQndGV4dCdcblx0XHRcdF0sXG4vKmlucHV0RWRpdHNBcmVJbnZhbGlkKi90cnVlXG5cdFx0KTtcblx0fSk7XG5cdHRlc3QoJ2hpZ2gtbG93IHN1cnJvZ2F0ZXMgNCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdcdUQ4M0RcdURDREFzb21lJyxcblx0XHRcdFx0J3ZlcnkgbmljZScsXG5cdFx0XHRcdCd0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDMsIFsnYSddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2Fzb21lJyxcblx0XHRcdFx0J3ZlcnkgbmljZScsXG5cdFx0XHRcdCd0ZXh0J1xuXHRcdFx0XSxcbi8qaW5wdXRFZGl0c0FyZUludmFsaWQqL3RydWVcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdCdWcgMTk4NzI6IFVuZG8gaXMgZnVua3knLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZXRoaW5nJyxcblx0XHRcdFx0JyBBJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgQicsXG5cdFx0XHRcdCdzb21ldGhpbmcgZWxzZSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgyLCAxLCAyLCAyLCBbJyddKSxcblx0XHRcdFx0ZWRpdE9wKDMsIDEsIDQsIDIsIFsnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZXRoaW5nJyxcblx0XHRcdFx0J0EnLFxuXHRcdFx0XHQnQicsXG5cdFx0XHRcdCdzb21ldGhpbmcgZWxzZSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdCdWcgMTk4NzI6IFVuZG8gaXMgZnVua3kgKDIpJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J3NvbWV0aGluZycsXG5cdFx0XHRcdCdBJyxcblx0XHRcdFx0J0InLFxuXHRcdFx0XHQnc29tZXRoaW5nIGVsc2UnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMiwgMSwgMiwgMSwgWycgJ10pLFxuXHRcdFx0XHRlZGl0T3AoMywgMSwgMywgMSwgWycnLCAnICddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3NvbWV0aGluZycsXG5cdFx0XHRcdCcgQScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnIEInLFxuXHRcdFx0XHQnc29tZXRoaW5nIGVsc2UnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IGVtcHR5IHRleHQnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAxLCBbJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbGFzdCBvcCBpcyBuby1vcCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDIsIFsnJ10pLFxuXHRcdFx0XHRlZGl0T3AoNCwgMSwgNCwgMSwgWycnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCd5IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IHRleHQgd2l0aG91dCBuZXdsaW5lIDEnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAxLCBbJ2ZvbyAnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdmb28gTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgdGV4dCB3aXRob3V0IG5ld2xpbmUgMicsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDMsIDEsIDMsIFsnIGZvbyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J015IGZvbyBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCBvbmUgbmV3bGluZScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDQsIDEsIDQsIFsnJywgJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J015ICcsXG5cdFx0XHRcdCdGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCB0ZXh0IHdpdGggb25lIG5ld2xpbmUnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAzLCAxLCAzLCBbJyBuZXcgbGluZScsICdObyBsb25nZXInXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBuZXcgbGluZScsXG5cdFx0XHRcdCdObyBsb25nZXIgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgdGV4dCB3aXRoIHR3byBuZXdsaW5lcycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDMsIDEsIDMsIFsnIG5ldyBsaW5lJywgJ09uZSBtb3JlIGxpbmUgaW4gdGhlIG1pZGRsZScsICdObyBsb25nZXInXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBuZXcgbGluZScsXG5cdFx0XHRcdCdPbmUgbW9yZSBsaW5lIGluIHRoZSBtaWRkbGUnLFxuXHRcdFx0XHQnTm8gbG9uZ2VyIEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IHRleHQgd2l0aCBtYW55IG5ld2xpbmVzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMywgMSwgMywgWycnLCAnJywgJycsICcnLCAnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXknLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnIEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IG11bHRpcGxlIG5ld2xpbmVzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMywgMSwgMywgWycnLCAnJywgJycsICcnLCAnJ10pLFxuXHRcdFx0XHRlZGl0T3AoMywgMTUsIDMsIDE1LCBbJ2EnLCAnYiddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J015Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lYScsXG5cdFx0XHRcdCdiJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBlbXB0eSB0ZXh0JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMSwgMSwgMSwgWycnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSB0ZXh0IGZyb20gb25lIGxpbmUnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAyLCBbJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3kgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgdGV4dCBmcm9tIG9uZSBsaW5lIDInLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAzLCBbJ2EnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdhIEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIGFsbCB0ZXh0IGZyb20gYSBsaW5lJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMSwgMSwgMTQsIFsnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSB0ZXh0IGZyb20gdHdvIGxpbmVzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgNCwgMiwgNiwgWycnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgdGV4dCBmcm9tIG1hbnkgbGluZXMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCA0LCAzLCA1LCBbJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J015IFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIGV2ZXJ5dGhpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCA1LCAyLCBbJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0Jydcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gdW5yZWxhdGVkIGVkaXRzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgyLCAxLCAyLCAzLCBbJ1xcdCddKSxcblx0XHRcdFx0ZWRpdE9wKDMsIDEsIDMsIDUsIFsnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCdUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndHdvIGVkaXRzIG9uIG9uZSBsaW5lJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J1xcdFxcdGZpcnN0XFx0ICAgICcsXG5cdFx0XHRcdCdcXHRcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCdcXHR0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J1xcdFxcdDwhQCNmaWZ0aCNAIT5cXHRcXHQnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoNSwgMywgNSwgNywgWycnXSksXG5cdFx0XHRcdGVkaXRPcCg1LCAxMiwgNSwgMTYsIFsnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQgICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0ZmlmdGhcXHRcXHQnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWFueSBlZGl0cycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCd7XCJ4XCIgOiAxfSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAyLCAxLCAyLCBbJ1xcbiAgJ10pLFxuXHRcdFx0XHRlZGl0T3AoMSwgNSwgMSwgNiwgWycnXSksXG5cdFx0XHRcdGVkaXRPcCgxLCA5LCAxLCA5LCBbJ1xcbiddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3snLFxuXHRcdFx0XHQnICBcInhcIjogMScsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbnkgZWRpdHMgcmV2ZXJzZWQnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQneycsXG5cdFx0XHRcdCcgIFwieFwiOiAxJyxcblx0XHRcdFx0J30nXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMiwgMiwgMywgWycnXSksXG5cdFx0XHRcdGVkaXRPcCgyLCA2LCAyLCA2LCBbJyAnXSksXG5cdFx0XHRcdGVkaXRPcCgyLCA5LCAzLCAxLCBbJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3tcInhcIiA6IDF9J1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2luZyBuZXdsaW5lcyAxJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J3snLFxuXHRcdFx0XHQnXCJhXCI6IHRydWUsJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdcImJcIjogdHJ1ZScsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDIsIDIsIDEsIFsnJywgJ1xcdCddKSxcblx0XHRcdFx0ZWRpdE9wKDIsIDExLCA0LCAxLCBbJycsICdcXHQnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCd7Jyxcblx0XHRcdFx0J1xcdFwiYVwiOiB0cnVlLCcsXG5cdFx0XHRcdCdcXHRcImJcIjogdHJ1ZScsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2luZyBuZXdsaW5lcyAyJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J3NvbWUgdGV4dCcsXG5cdFx0XHRcdCdzb21lIG1vcmUgdGV4dCcsXG5cdFx0XHRcdCdub3cgY29tZXMgYW4gZW1wdHkgbGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnYWZ0ZXIgZW1wdHkgbGluZScsXG5cdFx0XHRcdCdhbmQgdGhlIGxhc3QgbGluZSdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCA1LCAzLCAxLCBbJyB0ZXh0JywgJ3NvbWUgbW9yZSB0ZXh0JywgJ3NvbWUgbW9yZSB0ZXh0J10pLFxuXHRcdFx0XHRlZGl0T3AoMywgMiwgNCwgMSwgWydvIG1vcmUgbGluZXMnLCAnYXNkJywgJ2FzZCcsICdhc2QnXSksXG5cdFx0XHRcdGVkaXRPcCg1LCAxLCA1LCA2LCBbJ3p6enp6enp6J10pLFxuXHRcdFx0XHRlZGl0T3AoNSwgMTEsIDYsIDE2LCBbJzEnLCAnMicsICczJywgJzQnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdzb21lIHRleHQnLFxuXHRcdFx0XHQnc29tZSBtb3JlIHRleHQnLFxuXHRcdFx0XHQnc29tZSBtb3JlIHRleHRubyBtb3JlIGxpbmVzJyxcblx0XHRcdFx0J2FzZCcsXG5cdFx0XHRcdCdhc2QnLFxuXHRcdFx0XHQnYXNkJyxcblx0XHRcdFx0J3p6enp6enp6IGVtcHQxJyxcblx0XHRcdFx0JzInLFxuXHRcdFx0XHQnMycsXG5cdFx0XHRcdCc0bmUnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYWR2YW5jZWQgMScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCcgeyAgICAgICBcImRcIjogWycsXG5cdFx0XHRcdCcgICAgICAgICAgICAgbnVsbCcsXG5cdFx0XHRcdCcgICAgICAgIF0gLypjb21tZW50Ki8nLFxuXHRcdFx0XHQnICAgICAgICAsXCJlXCI6IC8qY29tbWVudCovIFtudWxsXSB9Jyxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAyLCBbJyddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDMsIDEsIDEwLCBbJycsICcgICddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDE2LCAyLCAxNCwgWycnLCAnICAgICddKSxcblx0XHRcdFx0ZWRpdE9wKDIsIDE4LCAzLCA5LCBbJycsICcgICddKSxcblx0XHRcdFx0ZWRpdE9wKDMsIDIyLCA0LCA5LCBbJyddKSxcblx0XHRcdFx0ZWRpdE9wKDQsIDEwLCA0LCAxMCwgWycnLCAnICAnXSksXG5cdFx0XHRcdGVkaXRPcCg0LCAyOCwgNCwgMjgsIFsnJywgJyAgICAnXSksXG5cdFx0XHRcdGVkaXRPcCg0LCAzMiwgNCwgMzIsIFsnJywgJyAgJ10pLFxuXHRcdFx0XHRlZGl0T3AoNCwgMzMsIDQsIDM0LCBbJycsICcnXSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCd7Jyxcblx0XHRcdFx0JyAgXCJkXCI6IFsnLFxuXHRcdFx0XHQnICAgIG51bGwnLFxuXHRcdFx0XHQnICBdIC8qY29tbWVudCovLCcsXG5cdFx0XHRcdCcgIFwiZVwiOiAvKmNvbW1lbnQqLyBbJyxcblx0XHRcdFx0JyAgICBudWxsJyxcblx0XHRcdFx0JyAgXScsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZHZhbmNlZCBzaW1wbGlmaWVkJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0JyAgIGFiYycsXG5cdFx0XHRcdCcgLGRlZidcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCA0LCBbJyddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDcsIDIsIDIsIFsnJ10pLFxuXHRcdFx0XHRlZGl0T3AoMiwgMywgMiwgMywgWycnLCAnJ10pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnYWJjLCcsXG5cdFx0XHRcdCdkZWYnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0NCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdwYWNrYWdlIGNhZGR5Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdmdW5jIG1haW4oKSB7Jyxcblx0XHRcdFx0J1xcdGZtdC5QcmludGxuKFwiSGVsbG8gV29ybGQhIDopXCIpJyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDYsIDEsIFtcblx0XHRcdFx0XHQncGFja2FnZSBjYWRkeScsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0J2ltcG9ydCBcImZtdFwiJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnZnVuYyBtYWluKCkgeycsXG5cdFx0XHRcdFx0J1xcdGZtdC5QcmludGxuKFwiSGVsbG8gV29ybGQhIDopXCIpJyxcblx0XHRcdFx0XHQnfScsXG5cdFx0XHRcdFx0Jydcblx0XHRcdFx0XSlcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdwYWNrYWdlIGNhZGR5Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdpbXBvcnQgXCJmbXRcIicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnZnVuYyBtYWluKCkgeycsXG5cdFx0XHRcdCdcXHRmbXQuUHJpbnRsbihcIkhlbGxvIFdvcmxkISA6KVwiKScsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdFx0Jydcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjU4NiBSZXBsYWNpbmcgc2VsZWN0ZWQgZW5kLW9mLWxpbmUgd2l0aCBuZXdsaW5lIGxvY2tzIHVwIHRoZSBkb2N1bWVudCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdzb21ldGhpbmcnLFxuXHRcdFx0XHQnaW50ZXJlc3RpbmcnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMTAsIDIsIDEsIFsnJywgJyddKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J3NvbWV0aGluZycsXG5cdFx0XHRcdCdpbnRlcmVzdGluZydcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzk4MCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdjbGFzcyBBIHsnLFxuXHRcdFx0XHQnICAgIHNvbWVQcm9wZXJ0eSA9IGZhbHNlOycsXG5cdFx0XHRcdCcgICAgc29tZU1ldGhvZCgpIHsnLFxuXHRcdFx0XHQnICAgIHRoaXMuc29tZU1ldGhvZCgpOycsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCA4LCAxLCA5LCBbJycsICcnXSksXG5cdFx0XHRcdGVkaXRPcCgzLCAxNywgMywgMTgsIFsnJywgJyddKSxcblx0XHRcdFx0ZWRpdE9wKDMsIDE4LCAzLCAxOCwgWycgICAgJ10pLFxuXHRcdFx0XHRlZGl0T3AoNCwgNSwgNCwgNSwgWycgICAgJ10pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2NsYXNzIEEnLFxuXHRcdFx0XHQneycsXG5cdFx0XHRcdCcgICAgc29tZVByb3BlcnR5ID0gZmFsc2U7Jyxcblx0XHRcdFx0JyAgICBzb21lTWV0aG9kKCknLFxuXHRcdFx0XHQnICAgIHsnLFxuXHRcdFx0XHQnICAgICAgICB0aGlzLnNvbWVNZXRob2QoKTsnLFxuXHRcdFx0XHQnICAgIH0nLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdGVzdEFwcGx5RWRpdHNGYWlscyhvcmlnaW5hbDogc3RyaW5nW10sIGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwob3JpZ2luYWwuam9pbignXFxuJykpO1xuXG5cdFx0bGV0IGhhc1Rocm93biA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRtb2RlbC5hcHBseUVkaXRzKGVkaXRzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGhhc1Rocm93biA9IHRydWU7XG5cdFx0fVxuXHRcdGFzc2VydC5vayhoYXNUaHJvd24sICdleHBlY3RlZCBtb2RlbC5hcHBseUVkaXRzIHRvIGZhaWwuJyk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH1cblxuXHR0ZXN0KCd0b3VjaGluZyBlZGl0czogdHdvIGluc2VydHMgYXQgdGhlIHNhbWUgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnaGVsbG8gd29ybGQnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMSwgMSwgMSwgWydhJ10pLFxuXHRcdFx0XHRlZGl0T3AoMSwgMSwgMSwgMSwgWydiJ10pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2FiaGVsbG8gd29ybGQnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndG91Y2hpbmcgZWRpdHM6IGluc2VydCBhbmQgcmVwbGFjZSB0b3VjaGluZycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAxLCBbJ2InXSksXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAzLCBbJ2FiJ10pLFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0J2JhYmxsbyB3b3JsZCdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvdmVybGFwcGluZyBlZGl0czogdHdvIG92ZXJsYXBwaW5nIHJlcGxhY2VzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzRmFpbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAyLCBbJ2InXSksXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAzLCBbJ2FiJ10pLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ292ZXJsYXBwaW5nIGVkaXRzOiB0d28gb3ZlcmxhcHBpbmcgZGVsZXRlcycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c0ZhaWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnaGVsbG8gd29ybGQnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMSwgMSwgMiwgWycnXSksXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAzLCBbJyddKSxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b3VjaGluZyBlZGl0czogdHdvIHRvdWNoaW5nIHJlcGxhY2VzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzV2l0aFN5bmNlZE1vZGVscyhcblx0XHRcdFtcblx0XHRcdFx0J2hlbGxvIHdvcmxkJ1xuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0ZWRpdE9wKDEsIDEsIDEsIDIsIFsnSCddKSxcblx0XHRcdFx0ZWRpdE9wKDEsIDIsIDEsIDMsIFsnRSddKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdIRWxsbyB3b3JsZCdcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b3VjaGluZyBlZGl0czogdHdvIHRvdWNoaW5nIGRlbGV0ZXMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHNXaXRoU3luY2VkTW9kZWxzKFxuXHRcdFx0W1xuXHRcdFx0XHQnaGVsbG8gd29ybGQnXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRlZGl0T3AoMSwgMSwgMSwgMiwgWycnXSksXG5cdFx0XHRcdGVkaXRPcCgxLCAyLCAxLCAzLCBbJyddKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdsbG8gd29ybGQnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndG91Y2hpbmcgZWRpdHM6IGluc2VydCBhbmQgcmVwbGFjZScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAxLCBbJ0gnXSksXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAzLCBbJ2UnXSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnSGVsbG8gd29ybGQnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndG91Y2hpbmcgZWRpdHM6IHJlcGxhY2UgYW5kIGluc2VydCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0c1dpdGhTeW5jZWRNb2RlbHMoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCdcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGVkaXRPcCgxLCAxLCAxLCAzLCBbJ0gnXSksXG5cdFx0XHRcdGVkaXRPcCgxLCAzLCAxLCAzLCBbJ2UnXSksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHQnSGVsbG8gd29ybGQnXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlIHdoaWxlIGVtaXR0aW5nIGV2ZW50cyAxJywgKCkgPT4ge1xuXHRcdGxldCBkaXNwb3NhYmxlITogSURpc3Bvc2FibGU7XG5cdFx0YXNzZXJ0U3luY2VkTW9kZWxzKCdIZWxsbycsIChtb2RlbCwgYXNzZXJ0TWlycm9yTW9kZWxzKSA9PiB7XG5cdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksXG5cdFx0XHRcdHRleHQ6ICcgd29ybGQhJyxcblx0XHRcdFx0Ly8gZm9yY2VNb3ZlTWFya2VyczogZmFsc2Vcblx0XHRcdH1dKTtcblxuXHRcdFx0YXNzZXJ0TWlycm9yTW9kZWxzKCk7XG5cblx0XHR9LCAobW9kZWwpID0+IHtcblx0XHRcdGxldCBpc0ZpcnN0VGltZSA9IHRydWU7XG5cdFx0XHRkaXNwb3NhYmxlID0gbW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRcdFx0aWYgKCFpc0ZpcnN0VGltZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpc0ZpcnN0VGltZSA9IGZhbHNlO1xuXG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEzLCAxLCAxMyksXG5cdFx0XHRcdFx0dGV4dDogJyBIb3cgYXJlIHlvdT8nLFxuXHRcdFx0XHRcdC8vIGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0XHRcdH1dKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2Ugd2hpbGUgZW1pdHRpbmcgZXZlbnRzIDInLCAoKSA9PiB7XG5cdFx0bGV0IGRpc3Bvc2FibGUhOiBJRGlzcG9zYWJsZTtcblx0XHRhc3NlcnRTeW5jZWRNb2RlbHMoJ0hlbGxvJywgKG1vZGVsLCBhc3NlcnRNaXJyb3JNb2RlbHMpID0+IHtcblx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA2LCAxLCA2KSxcblx0XHRcdFx0dGV4dDogJyB3b3JsZCEnLFxuXHRcdFx0XHQvLyBmb3JjZU1vdmVNYXJrZXJzOiBmYWxzZVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRhc3NlcnRNaXJyb3JNb2RlbHMoKTtcblxuXHRcdH0sIChtb2RlbCkgPT4ge1xuXHRcdFx0bGV0IGlzRmlyc3RUaW1lID0gdHJ1ZTtcblx0XHRcdGRpc3Bvc2FibGUgPSBtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKGU6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKCFpc0ZpcnN0VGltZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpc0ZpcnN0VGltZSA9IGZhbHNlO1xuXG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEzLCAxLCAxMyksXG5cdFx0XHRcdFx0dGV4dDogJyBIb3cgYXJlIHlvdT8nLFxuXHRcdFx0XHRcdC8vIGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0XHRcdH1dKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTU4MDogQ2hhbmdlcyBpbiBsaW5lIGVuZGluZ3MgYXJlIG5vdCBjb3JyZWN0bHkgcmVmbGVjdGVkIGluIHRoZSBleHRlbnNpb24gaG9zdCwgbGVhZGluZyB0byBpbnZhbGlkIG9mZnNldHMgc2VudCB0byBleHRlcm5hbCByZWZhY3RvcmluZyB0b29scycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnSGVsbG9cXG5Xb3JsZCEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0RU9MKCksICdcXG4nKTtcblxuXHRcdGNvbnN0IG1pcnJvck1vZGVsMiA9IG5ldyBNaXJyb3JUZXh0TW9kZWwobnVsbCEsIG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBtb2RlbC5nZXRFT0woKSwgbW9kZWwuZ2V0VmVyc2lvbklkKCkpO1xuXHRcdGxldCBtaXJyb3JNb2RlbDJQcmV2VmVyc2lvbklkID0gbW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbW9kZWwub25EaWRDaGFuZ2VDb250ZW50KChlOiBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCB2ZXJzaW9uSWQgPSBlLnZlcnNpb25JZDtcblx0XHRcdGlmICh2ZXJzaW9uSWQgPCBtaXJyb3JNb2RlbDJQcmV2VmVyc2lvbklkKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybignTW9kZWwgdmVyc2lvbiBpZCBkaWQgbm90IGFkdmFuY2UgYmV0d2VlbiBlZGl0cyAoMiknKTtcblx0XHRcdH1cblx0XHRcdG1pcnJvck1vZGVsMlByZXZWZXJzaW9uSWQgPSB2ZXJzaW9uSWQ7XG5cdFx0XHRtaXJyb3JNb2RlbDIub25FdmVudHMoZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhc3NlcnRNaXJyb3JNb2RlbHMgPSAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWlycm9yTW9kZWwyLmdldFRleHQoKSwgbW9kZWwuZ2V0VmFsdWUoKSwgJ21pcnJvciBtb2RlbCAyIHRleHQgT0snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaXJyb3JNb2RlbDIudmVyc2lvbiwgbW9kZWwuZ2V0VmVyc2lvbklkKCksICdtaXJyb3IgbW9kZWwgMiB2ZXJzaW9uIE9LJyk7XG5cdFx0fTtcblxuXHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGKTtcblx0XHRhc3NlcnRNaXJyb3JNb2RlbHMoKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRtaXJyb3JNb2RlbDIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDc3MzM6IFVuZG8gbWFuZ2xlcyB1bmljb2RlIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ1xcJ1x1RDgzRFx1REM0MVxcJycpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdcIicgfSxcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAxLCAyKSwgdGV4dDogJ1wiJyB9LFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXCJcXCdcIlx1RDgzRFx1REM0MVxcJycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAzLCAxLCA0KSksIG5ldyBSYW5nZSgxLCAzLCAxLCA0KSk7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAyKSwgdGV4dDogbnVsbCB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDMsIDEsIDQpLCB0ZXh0OiBudWxsIH0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXCdcdUQ4M0RcdURDNDFcXCcnKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ4NzQxOiBCcm9rZW4gdW5kbyBzdGFjayB3aXRoIG1vdmUgbGluZXMgdXAgd2l0aCBtdWx0aXBsZSBjdXJzb3JzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdsaW5lMScsXG5cdFx0XHQnbGluZTInLFxuXHRcdFx0J2xpbmUzJyxcblx0XHRcdCcnLFxuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0Y29uc3QgdW5kb0VkaXRzID0gbW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNCwgMSwgNCwgMSksIHRleHQ6ICdsaW5lMycsIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMywgMSwgMywgNiksIHRleHQ6IG51bGwsIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMywgMSksIHRleHQ6IG51bGwsIH0sXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMywgNiwgMywgNiksIHRleHQ6ICdcXG5saW5lMicgfVxuXHRcdF0sIHRydWUpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyh1bmRvRWRpdHMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnbGluZTFcXG5saW5lMlxcbmxpbmUzXFxuJyk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDUkxGIGVkaXQgbm9ybWFsaXphdGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZWRpdCBlbmRpbmcgd2l0aCBcXFxcciBmb2xsb3dlZCBieSBcXFxcbiBpbiBidWZmZXIgc2hvdWxkIHN0cmlwIHRyYWlsaW5nIFxcXFxyJywgKCkgPT4ge1xuXHRcdC8vIERvY3VtZW50OiBcImFiY1xcclxcbmRlZlxcclxcblwiXG5cdFx0Ly8gRWRpdDogUmVwbGFjZSByYW5nZSAoMSwxKS0oMSw0KSBcImFiY1wiIHdpdGggXCJ4eXpcXHJcIlxuXHRcdC8vIFRoZSBcXHIgYXQgZW5kIG9mIHJlcGxhY2VtZW50IHNob3VsZCBiZSBzdHJpcHBlZCBzaW5jZSBuZXh0IGNoYXIgaXMgXFxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FiY1xcclxcbmRlZlxcclxcbicpO1xuXHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRFT0woKSwgJ1xcclxcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ291bnQoKSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnYWJjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnZGVmJyk7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgdGV4dDogJ3h5elxccicgfVxuXHRcdF0pO1xuXG5cdFx0Ly8gVGhlIHRyYWlsaW5nIFxcciBzaG91bGQgYmUgc3RyaXBwZWQsIHNvIHdlIGdldCBcInh5elwiIG5vdCBcInh5elxcclwiXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneHl6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnZGVmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCAzKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdCBlbmRpbmcgd2l0aCBcXFxcclxcXFxuIHNob3VsZCBOT1QgYmUgbW9kaWZpZWQnLCAoKSA9PiB7XG5cdFx0Ly8gRG9jdW1lbnQ6IFwiYWJjXFxyXFxuZGVmXFxyXFxuXCJcblx0XHQvLyBFZGl0OiBSZXBsYWNlIHJhbmdlICgxLDEpLSgxLDQpIFwiYWJjXCIgd2l0aCBcInh5elxcclxcblwiXG5cdFx0Ly8gVGhpcyBpcyBhIHByb3BlciBDUkxGIHNvIHNob3VsZCBub3QgYmUgbW9kaWZpZWRcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnYWJjXFxyXFxuZGVmXFxyXFxuJyk7XG5cdFx0bW9kZWwuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNCksIHRleHQ6ICd4eXpcXHJcXG4nIH1cblx0XHRdKTtcblxuXHRcdC8vIFNob3VsZCBhZGQgYSBuZXcgbGluZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3h5eicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ2RlZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ291bnQoKSwgNCk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXQgZW5kaW5nIHdpdGggXFxcXHIgTk9UIGZvbGxvd2VkIGJ5IFxcXFxuIHNob3VsZCBOT1QgYmUgbW9kaWZpZWQnLCAoKSA9PiB7XG5cdFx0Ly8gRG9jdW1lbnQ6IFwiYWJjZGVmXCIgKG5vIG5ld2xpbmUgYWZ0ZXIpXG5cdFx0Ly8gRWRpdDogUmVwbGFjZSByYW5nZSAoMSwxKS0oMSw0KSBcImFiY1wiIHdpdGggXCJ4eXpcXHJcIlxuXHRcdC8vIFNpbmNlIHRoZXJlJ3Mgbm8gXFxuIGFmdGVyIHRoZSByYW5nZSwgdGhlIFxcciBzaG91bGQgc3RheVxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdhYmNkZWYnKTtcblx0XHRtb2RlbC5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgdGV4dDogJ3h5elxccicgfVxuXHRcdF0pO1xuXG5cdFx0Ly8gVGhlIFxcciBzaG91bGQgY2F1c2UgYSBuZXcgbGluZSBzaW5jZSBidWZmZXIgbm9ybWFsaXplcyBFT0xcblx0XHQvLyBBY3R1YWxseSBzaW5jZSBidWZmZXIgdXNlcyBDUkxGLCB0aGUgbG9uZSBcXHIgd2lsbCBiZSBub3JtYWxpemVkIHRvIFxcclxcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ291bnQoKSwgMik7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXQgaW4gTEYgYnVmZmVyIHNob3VsZCBOT1Qgc3RyaXAgdHJhaWxpbmcgXFxcXHInLCAoKSA9PiB7XG5cdFx0Ly8gRG9jdW1lbnQgd2l0aCBMRjogXCJhYmNcXG5kZWZcXG5cIlxuXHRcdC8vIEVkaXQ6IFJlcGxhY2UgcmFuZ2UgKDEsMSktKDEsNCkgXCJhYmNcIiB3aXRoIFwieHl6XFxyXCJcblx0XHQvLyBTaW5jZSBidWZmZXIgaXMgTEYsIG5vIHNwZWNpYWwgaGFuZGxpbmcgbmVlZGVkXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FiY1xcbmRlZlxcbicpO1xuXHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5MRik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0RU9MKCksICdcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvdW50KCksIDMpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNCksIHRleHQ6ICd4eXpcXHInIH1cblx0XHRdKTtcblxuXHRcdC8vIFRoZSBcXHIgd2lsbCBiZSBub3JtYWxpemVkIHRvIFxcbiAoYnVmZmVyJ3MgRU9MKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ291bnQoKSwgNCk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xTUCBpbmNsdWRlIHNvcnRpbmcgc2NlbmFyaW8gLSBlZGl0IGVuZGluZyB3aXRoIFxcXFxyIHNob3VsZCBiZSBub3JtYWxpemVkJywgKCkgPT4ge1xuXHRcdC8vIFRoaXMgaXMgdGhlIHJlYWwtd29ybGQgc2NlbmFyaW8gZnJvbSB0aGUgaXNzdWVcblx0XHQvLyBEb2N1bWVudDogXCIjaW5jbHVkZSBcXFwiYS5oXFxcIlxcclxcbiNpbmNsdWRlIFxcXCJjLmhcXFwiXFxyXFxuI2luY2x1ZGUgXFxcImIuaFxcXCJcXHJcXG5cIlxuXHRcdC8vIEVkaXQ6IFJlcGxhY2UgbGluZXMgMS0zIHdpdGggcmVvcmRlcmVkIGluY2x1ZGVzIGVuZGluZyB3aXRoIFxcclxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcjaW5jbHVkZSBcImEuaFwiXFxyXFxuI2luY2x1ZGUgXCJjLmhcIlxcclxcbiNpbmNsdWRlIFwiYi5oXCJcXHJcXG4nKTtcblx0XHRtb2RlbC5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0RU9MKCksICdcXHJcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvdW50KCksIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyNpbmNsdWRlIFwiYS5oXCInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcjaW5jbHVkZSBcImMuaFwiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnI2luY2x1ZGUgXCJiLmhcIicpO1xuXG5cdFx0Ly8gRWRpdDogcmVwbGFjZSByYW5nZSAoMSwxKS0oMywxNikgd2l0aCB0ZXh0IGVuZGluZyBpbiBcXHJcblx0XHQvLyBSYW5nZSBjb3ZlcnM6ICNpbmNsdWRlIFwiYS5oXCJcXHJcXG4jaW5jbHVkZSBcImMuaFwiXFxyXFxuI2luY2x1ZGUgXCJiLmhcIlxuXHRcdC8vIE5vdGU6IGxpbmUgMyBjb2wgMTYgaXMgYWZ0ZXIgdGhlIGxhc3QgY2hhciBcImhcIiBidXQgYmVmb3JlIHRoZSBcXHJcXG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAzLCAxNiksXG5cdFx0XHRcdHRleHQ6ICcjaW5jbHVkZSBcImEuaFwiXFxyXFxuI2luY2x1ZGUgXCJiLmhcIlxcclxcbiNpbmNsdWRlIFwiYy5oXCJcXHInXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHQvLyBUaGUgdHJhaWxpbmcgXFxyIHNob3VsZCBiZSBzdHJpcHBlZCBiZWNhdXNlIHRoZSBuZXh0IGNoYXIgYWZ0ZXIgcmFuZ2UgaXMgXFxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcjaW5jbHVkZSBcImEuaFwiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnI2luY2x1ZGUgXCJiLmhcIicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyNpbmNsdWRlIFwiYy5oXCInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcnKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxxQkFBcUIseUJBQXlCO0FBQ3ZELFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsb0JBQW9CLHNDQUFzQztBQUNuRSxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLHNFQUFzRSxNQUFNO0FBRWpGLDBDQUF3QztBQUV4QyxXQUFTLGVBQWUsVUFBb0IsT0FBK0IsUUFBaUIsT0FBc0I7QUFDakgsVUFBTSxRQUFRLGdCQUFnQixTQUFTLEtBQUssSUFBSSxDQUFDO0FBQ2pELFVBQU0sT0FBTyxrQkFBa0IsRUFBRTtBQUVqQyxXQUFPLFlBQVksTUFBTSxnQkFBZ0IsR0FBRyxNQUFNO0FBRWxELFVBQU0sV0FBVyxLQUFLO0FBQ3RCLFdBQU8sWUFBWSxNQUFNLGdCQUFnQixHQUFHLEtBQUs7QUFDakQsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUVBLFdBQVMsT0FBTyxpQkFBeUIsYUFBcUIsZUFBdUIsV0FBbUIsTUFBc0M7QUFDN0ksV0FBTztBQUFBLE1BQ04sT0FBTyxJQUFJLE1BQU0saUJBQWlCLGFBQWEsZUFBZSxTQUFTO0FBQUEsTUFDdkUsTUFBTSxLQUFLLEtBQUssSUFBSTtBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUVBLE9BQUssOEJBQThCLE1BQU07QUFDeEMsbUJBQWUsQ0FBQyxxSUFB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QUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxxQkFBcUIsTUFBTTtBQUMvQjtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvQkFBb0IsTUFBTTtBQUM5QjtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxRQUN2QixPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsTUFBTTtBQUMzQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7QUFBQSxNQUM1QjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsTUFBTTtBQUMzQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7QUFBQSxNQUM1QjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzQkFBc0IsTUFBTTtBQUNoQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUFBLE1BQzVCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxnQ0FBZ0MsTUFBTTtBQUMxQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxhQUFhLFdBQVcsQ0FBQztBQUFBLE1BQzlDO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsTUFBTTtBQUMzQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxhQUFhLCtCQUErQixXQUFXLENBQUM7QUFBQSxNQUM3RTtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtDQUFrQyxNQUFNO0FBQzVDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDO0FBQUEsTUFDeEM7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDRCQUE0QixNQUFNO0FBQ3RDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDO0FBQUEsUUFDdkMsT0FBTyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUM7QUFBQSxNQUNoQztBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHFCQUFxQixNQUFNO0FBQy9CO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDZCQUE2QixNQUFNO0FBQ3ZDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLCtCQUErQixNQUFNO0FBQ3pDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUFBLE1BQ3pCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLCtCQUErQixNQUFNO0FBQ3pDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ3pCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDhCQUE4QixNQUFNO0FBQ3hDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssK0JBQStCLE1BQU07QUFDekM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDeEI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHFCQUFxQixNQUFNO0FBQy9CO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssdUJBQXVCLE1BQU07QUFDakM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBSSxDQUFDO0FBQUEsUUFDekIsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDeEI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseUJBQXlCLE1BQU07QUFDbkM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsUUFDdkIsT0FBTyxHQUFHLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssY0FBYyxNQUFNO0FBQ3hCO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO0FBQUEsUUFDM0IsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQUEsUUFDdkIsT0FBTyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO0FBQUEsTUFDMUI7QUFBQSxNQUNBO0FBQUEsUUFDQztBQUFB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QUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsTUFBTSxRQUFRO0FBQUEsSUFDL0MsQ0FBQztBQUlELFdBQU8sWUFBWSxNQUFNLGFBQWEsR0FBRyxDQUFDO0FBRTFDLFVBQU0sUUFBUTtBQUFBLEVBQ2YsQ0FBQztBQUVELE9BQUssbURBQW1ELE1BQU07QUFJN0QsVUFBTSxRQUFRLGdCQUFnQixZQUFZO0FBQzFDLFVBQU0sT0FBTyxrQkFBa0IsRUFBRTtBQUVqQyxXQUFPLFlBQVksTUFBTSxPQUFPLEdBQUcsSUFBSTtBQUN2QyxXQUFPLFlBQVksTUFBTSxhQUFhLEdBQUcsQ0FBQztBQUUxQyxVQUFNLFdBQVc7QUFBQSxNQUNoQixFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLFFBQVE7QUFBQSxJQUMvQyxDQUFDO0FBR0QsV0FBTyxZQUFZLE1BQU0sYUFBYSxHQUFHLENBQUM7QUFFMUMsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyw0RUFBNEUsTUFBTTtBQUl0RixVQUFNLFFBQVEsZ0JBQWdCLHdEQUF3RDtBQUN0RixVQUFNLE9BQU8sa0JBQWtCLElBQUk7QUFFbkMsV0FBTyxZQUFZLE1BQU0sT0FBTyxHQUFHLE1BQU07QUFDekMsV0FBTyxZQUFZLE1BQU0sYUFBYSxHQUFHLENBQUM7QUFDMUMsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsZ0JBQWdCO0FBQzVELFdBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLGdCQUFnQjtBQUM1RCxXQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxnQkFBZ0I7QUFLNUQsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxRQUNDLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUM1QixNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0QsQ0FBQztBQUdELFdBQU8sWUFBWSxNQUFNLGFBQWEsR0FBRyxDQUFDO0FBQzFDLFdBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLGdCQUFnQjtBQUM1RCxXQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxnQkFBZ0I7QUFDNUQsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsZ0JBQWdCO0FBQzVELFdBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLEVBQUU7QUFFOUMsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
