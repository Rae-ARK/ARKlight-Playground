import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { UTF8_BOM_CHARACTER } from "../../../../base/common/strings.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../common/languages/modesRegistry.js";
import { EndOfLinePreference } from "../../../common/model.js";
import { TextModel, createTextBuffer } from "../../../common/model/textModel.js";
import { createModelServices, createTextModel } from "../testTextModel.js";
function testGuessIndentation(defaultInsertSpaces, defaultTabSize, expectedInsertSpaces, expectedTabSize, text, msg) {
  const m = createTextModel(
    text.join("\n"),
    void 0,
    {
      tabSize: defaultTabSize,
      insertSpaces: defaultInsertSpaces,
      detectIndentation: true
    }
  );
  const r = m.getOptions();
  m.dispose();
  assert.strictEqual(r.insertSpaces, expectedInsertSpaces, msg);
  assert.strictEqual(r.tabSize, expectedTabSize, msg);
}
function assertGuess(expectedInsertSpaces, expectedTabSize, text, msg) {
  if (typeof expectedInsertSpaces === "undefined") {
    if (typeof expectedTabSize === "undefined") {
      testGuessIndentation(true, 13370, true, 13370, text, msg);
      testGuessIndentation(false, 13371, false, 13371, text, msg);
    } else if (typeof expectedTabSize === "number") {
      testGuessIndentation(true, 13370, true, expectedTabSize, text, msg);
      testGuessIndentation(false, 13371, false, expectedTabSize, text, msg);
    } else {
      testGuessIndentation(true, 13370, true, expectedTabSize[0], text, msg);
      testGuessIndentation(false, 13371, false, 13371, text, msg);
    }
  } else {
    if (typeof expectedTabSize === "undefined") {
      testGuessIndentation(true, 13370, expectedInsertSpaces, 13370, text, msg);
      testGuessIndentation(false, 13371, expectedInsertSpaces, 13371, text, msg);
    } else if (typeof expectedTabSize === "number") {
      testGuessIndentation(true, 13370, expectedInsertSpaces, expectedTabSize, text, msg);
      testGuessIndentation(false, 13371, expectedInsertSpaces, expectedTabSize, text, msg);
    } else {
      if (expectedInsertSpaces === true) {
        testGuessIndentation(true, 13370, expectedInsertSpaces, expectedTabSize[0], text, msg);
        testGuessIndentation(false, 13371, expectedInsertSpaces, expectedTabSize[0], text, msg);
      } else {
        testGuessIndentation(true, 13370, expectedInsertSpaces, 13370, text, msg);
        testGuessIndentation(false, 13371, expectedInsertSpaces, 13371, text, msg);
      }
    }
  }
}
suite("TextModelData.fromString", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testTextModelDataFromString(text, expected) {
    const { textBuffer, disposable } = createTextBuffer(text, TextModel.DEFAULT_CREATION_OPTIONS.defaultEOL);
    const actual = {
      EOL: textBuffer.getEOL(),
      lines: textBuffer.getLinesContent(),
      containsRTL: textBuffer.mightContainRTL(),
      isBasicASCII: !textBuffer.mightContainNonBasicASCII()
    };
    assert.deepStrictEqual(actual, expected);
    disposable.dispose();
  }
  test("one line text", () => {
    testTextModelDataFromString(
      "Hello world!",
      {
        EOL: "\n",
        lines: [
          "Hello world!"
        ],
        containsRTL: false,
        isBasicASCII: true
      }
    );
  });
  test("multiline text", () => {
    testTextModelDataFromString(
      "Hello,\r\ndear friend\nHow\rare\r\nyou?",
      {
        EOL: "\r\n",
        lines: [
          "Hello,",
          "dear friend",
          "How",
          "are",
          "you?"
        ],
        containsRTL: false,
        isBasicASCII: true
      }
    );
  });
  test("Non Basic ASCII 1", () => {
    testTextModelDataFromString(
      "Hello,\nZ\xFCrich",
      {
        EOL: "\n",
        lines: [
          "Hello,",
          "Z\xFCrich"
        ],
        containsRTL: false,
        isBasicASCII: false
      }
    );
  });
  test("containsRTL 1", () => {
    testTextModelDataFromString(
      "Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5",
      {
        EOL: "\n",
        lines: [
          "Hello,",
          "\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"
        ],
        containsRTL: true,
        isBasicASCII: false
      }
    );
  });
  test("containsRTL 2", () => {
    testTextModelDataFromString(
      "Hello,\n\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644",
      {
        EOL: "\n",
        lines: [
          "Hello,",
          "\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644"
        ],
        containsRTL: true,
        isBasicASCII: false
      }
    );
  });
});
suite("Editor Model - TextModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("TextModel does not use events internally", () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const textModel = disposables.add(instantiationService.createInstance(TextModel, "", PLAINTEXT_LANGUAGE_ID, TextModel.DEFAULT_CREATION_OPTIONS, null));
    assert.strictEqual(textModel._hasListeners(), false);
    disposables.dispose();
  });
  test("getValueLengthInRange", () => {
    let m = createTextModel("My First Line\r\nMy Second Line\r\nMy Third Line");
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 1)), "".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 2)), "M".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 1, 3)), "y".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 14)), "My First Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1)), "My First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 1)), "y First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 2)), "y First Line\r\nM".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 1e3)), "y First Line\r\nMy Second Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 3, 1)), "y First Line\r\nMy Second Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 3, 1e3)), "y First Line\r\nMy Second Line\r\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3)), "My First Line\r\nMy Second Line\r\nMy Third Line".length);
    m.dispose();
    m = createTextModel("My First Line\nMy Second Line\nMy Third Line");
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 1)), "".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 2)), "M".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 1, 3)), "y".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 14)), "My First Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1)), "My First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 1)), "y First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 2)), "y First Line\nM".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 1e3)), "y First Line\nMy Second Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 3, 1)), "y First Line\nMy Second Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 3, 1e3)), "y First Line\nMy Second Line\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3)), "My First Line\nMy Second Line\nMy Third Line".length);
    m.dispose();
  });
  test("getValueLengthInRange different EOL", () => {
    let m = createTextModel("My First Line\r\nMy Second Line\r\nMy Third Line");
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.TextDefined), "My First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.CRLF), "My First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.LF), "My First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.TextDefined), "My First Line\r\nMy Second Line\r\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.CRLF), "My First Line\r\nMy Second Line\r\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.LF), "My First Line\nMy Second Line\nMy Third Line".length);
    m.dispose();
    m = createTextModel("My First Line\nMy Second Line\nMy Third Line");
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.TextDefined), "My First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.LF), "My First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.CRLF), "My First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.TextDefined), "My First Line\nMy Second Line\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.LF), "My First Line\nMy Second Line\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.CRLF), "My First Line\r\nMy Second Line\r\nMy Third Line".length);
    m.dispose();
  });
  test("guess indentation 1", () => {
    assertGuess(void 0, void 0, [
      "x",
      "x",
      "x",
      "x",
      "x",
      "x",
      "x"
    ], "no clues");
    assertGuess(false, void 0, [
      "	x",
      "x",
      "x",
      "x",
      "x",
      "x",
      "x"
    ], "no spaces, 1xTAB");
    assertGuess(true, 2, [
      "  x",
      "x",
      "x",
      "x",
      "x",
      "x",
      "x"
    ], "1x2");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "	x",
      "	x",
      "	x",
      "	x",
      "	x"
    ], "7xTAB");
    assertGuess(void 0, [2], [
      "	x",
      "  x",
      "	x",
      "  x",
      "	x",
      "  x",
      "	x",
      "  x"
    ], "4x2, 4xTAB");
    assertGuess(false, void 0, [
      "	x",
      " x",
      "	x",
      " x",
      "	x",
      " x",
      "	x",
      " x"
    ], "4x1, 4xTAB");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "  x",
      "	x",
      "  x",
      "	x",
      "  x",
      "	x",
      "  x"
    ], "4x2, 5xTAB");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "  x"
    ], "1x2, 5xTAB");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "    x"
    ], "1x4, 5xTAB");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "  x",
      "	x",
      "    x"
    ], "1x2, 1x4, 5xTAB");
    assertGuess(void 0, void 0, [
      "x",
      " x",
      " x",
      " x",
      " x",
      " x",
      " x",
      " x"
    ], "7x1 - 1 space is never guessed as an indentation");
    assertGuess(true, void 0, [
      "x",
      "          x",
      " x",
      " x",
      " x",
      " x",
      " x",
      " x"
    ], "1x10, 6x1");
    assertGuess(void 0, void 0, [
      "",
      "  ",
      "    ",
      "      ",
      "        ",
      "          ",
      "            ",
      "              "
    ], "whitespace lines don't count");
    assertGuess(true, 3, [
      "x",
      "   x",
      "   x",
      "    x",
      "x",
      "   x",
      "   x",
      "    x",
      "x",
      "   x",
      "   x",
      "    x"
    ], "6x3, 3x4");
    assertGuess(true, 5, [
      "x",
      "     x",
      "     x",
      "    x",
      "x",
      "     x",
      "     x",
      "    x",
      "x",
      "     x",
      "     x",
      "    x"
    ], "6x5, 3x4");
    assertGuess(true, 7, [
      "x",
      "       x",
      "       x",
      "     x",
      "x",
      "       x",
      "       x",
      "    x",
      "x",
      "       x",
      "       x",
      "    x"
    ], "6x7, 1x5, 2x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "  x",
      "  x",
      "  x",
      "x",
      "  x",
      "  x",
      "  x",
      "  x"
    ], "8x2");
    assertGuess(true, 2, [
      "x",
      "  x",
      "  x",
      "x",
      "  x",
      "  x",
      "x",
      "  x",
      "  x",
      "x",
      "  x",
      "  x"
    ], "8x2");
    assertGuess(true, 2, [
      "x",
      "  x",
      "    x",
      "x",
      "  x",
      "    x",
      "x",
      "  x",
      "    x",
      "x",
      "  x",
      "    x"
    ], "4x2, 4x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "  x",
      "    x",
      "x",
      "  x",
      "  x",
      "    x",
      "x",
      "  x",
      "  x",
      "    x"
    ], "6x2, 3x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "  x",
      "    x",
      "    x",
      "x",
      "  x",
      "  x",
      "    x",
      "    x"
    ], "4x2, 4x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "    x",
      "    x",
      "x",
      "  x",
      "    x",
      "    x"
    ], "2x2, 4x4");
    assertGuess(true, 4, [
      "x",
      "    x",
      "    x",
      "x",
      "    x",
      "    x",
      "x",
      "    x",
      "    x",
      "x",
      "    x",
      "    x"
    ], "8x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "    x",
      "    x",
      "      x",
      "x",
      "  x",
      "    x",
      "    x",
      "      x"
    ], "2x2, 4x4, 2x6");
    assertGuess(true, 2, [
      "x",
      "  x",
      "    x",
      "    x",
      "      x",
      "      x",
      "        x"
    ], "1x2, 2x4, 2x6, 1x8");
    assertGuess(true, 4, [
      "x",
      "    x",
      "    x",
      "    x",
      "     x",
      "        x",
      "x",
      "    x",
      "    x",
      "    x",
      "     x",
      "        x"
    ], "6x4, 2x5, 2x8");
    assertGuess(true, 4, [
      "x",
      "    x",
      "    x",
      "    x",
      "     x",
      "        x",
      "        x"
    ], "3x4, 1x5, 2x8");
    assertGuess(true, 4, [
      "x",
      "x",
      "    x",
      "    x",
      "     x",
      "        x",
      "        x",
      "x",
      "x",
      "    x",
      "    x",
      "     x",
      "        x",
      "        x"
    ], "6x4, 2x5, 4x8");
    assertGuess(true, 3, [
      "x",
      " x",
      " x",
      " x",
      " x",
      " x",
      "x",
      "   x",
      "    x",
      "    x"
    ], "5x1, 2x0, 1x3, 2x4");
    assertGuess(false, void 0, [
      "	 x",
      " 	 x",
      "	x"
    ], "mixed whitespace 1");
    assertGuess(false, void 0, [
      "	x",
      "	    x"
    ], "mixed whitespace 2");
  });
  test("issue #44991: Wrong indentation size auto-detection", () => {
    assertGuess(true, 4, [
      "a = 10             # 0 space indent",
      "b = 5              # 0 space indent",
      "if a > 10:         # 0 space indent",
      "    a += 1         # 4 space indent      delta 4 spaces",
      "    if b > 5:      # 4 space indent",
      "        b += 1     # 8 space indent      delta 4 spaces",
      "        b += 1     # 8 space indent",
      "        b += 1     # 8 space indent",
      "# comment line 1   # 0 space indent      delta 8 spaces",
      "# comment line 2   # 0 space indent",
      "# comment line 3   # 0 space indent",
      "        b += 1     # 8 space indent      delta 8 spaces",
      "        b += 1     # 8 space indent",
      "        b += 1     # 8 space indent"
    ]);
  });
  test("issue #55818: Broken indentation detection", () => {
    assertGuess(true, 2, [
      "",
      "/* REQUIRE */",
      "",
      "const foo = require ( 'foo' ),",
      "      bar = require ( 'bar' );",
      "",
      "/* MY FN */",
      "",
      "function myFn () {",
      "",
      "  const asd = 1,",
      "        dsa = 2;",
      "",
      "  return bar ( foo ( asd ) );",
      "",
      "}",
      "",
      "/* EXPORT */",
      "",
      "module.exports = myFn;",
      ""
    ]);
  });
  test("issue #70832: Broken indentation detection", () => {
    assertGuess(false, void 0, [
      "x",
      "x",
      "x",
      "x",
      "	x",
      "		x",
      "    x",
      "		x",
      "	x",
      "		x",
      "	x",
      "	x",
      "	x",
      "	x",
      "x"
    ]);
  });
  test("issue #62143: Broken indentation detection", () => {
    assertGuess(true, 2, [
      "x",
      "x",
      "  x",
      "  x"
    ]);
    assertGuess(true, 2, [
      "x",
      "  - item2",
      "  - item3"
    ]);
    testGuessIndentation(true, 2, true, 2, [
      "x x",
      "  x",
      "  x"
    ]);
    testGuessIndentation(true, 2, true, 2, [
      "x x",
      "  x",
      "  x",
      "    x"
    ]);
    testGuessIndentation(true, 2, true, 2, [
      "<!--test1.md -->",
      "- item1",
      "  - item2",
      "    - item3"
    ]);
  });
  test("issue #84217: Broken indentation detection", () => {
    assertGuess(true, 4, [
      "def main():",
      "    print('hello')"
    ]);
    assertGuess(true, 4, [
      "def main():",
      "    with open('foo') as fp:",
      "        print(fp.read())"
    ]);
  });
  test("issue #65668: YAML file indented with 2 spaces", () => {
    assertGuess(true, 2, [
      "version: 2",
      "",
      "jobs:",
      "  build:",
      "    docker:",
      "      - circleci/golang:1.11",
      "",
      "  environment:",
      "    TEST_RESULTS: /tmp/test-results",
      "",
      "  steps:",
      "    - checkout",
      "    - run: mkdir -p $TEST_RESULTS",
      "",
      "    - restore_cache:",
      "        keys:",
      "          - v1-pkg-cache",
      "",
      "    - run:",
      "        name: dep ensure",
      "        command: dep ensure -v",
      "",
      "    - run:",
      "        name: Run unit tests",
      "        command: |",
      '          trap "go-junit-report <${TEST_RESULTS}/go-test.out > ${TEST_RESULTS}/go-test-report.xml" EXIT',
      "          go test -v ./... | tee ${TEST_RESULTS}/go-test.out",
      "",
      "    - run:",
      "        name: Build",
      "        command: go build -v",
      "",
      "    - save_cache:",
      "        key: v1-pkg-cache",
      "        paths:",
      '          - "/go/pkg"',
      "",
      "    - store_artifacts:",
      "        path: /tmp/test-results",
      "        destination: raw-test-output",
      "",
      "    - store_test_results:",
      "        path: /tmp/test-results"
    ]);
  });
  test("issue #249040: 4-space indent should win over 2-space when predominant", () => {
    assertGuess(true, 4, [
      "function foo() {",
      "    let a = 1;",
      "    let b = 2;",
      "    if (true) {",
      "        console.log(a);",
      "        console.log(b);",
      "    }",
      "    const obj = {",
      "      x: 1,",
      // 2-space indent here
      "      y: 2",
      // 2-space indent here
      "    };",
      "    return obj;",
      "}"
    ]);
  });
  test("validatePosition", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.validatePosition(new Position(0, 0)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(0, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 2)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 30)), new Position(1, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 0)), new Position(2, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 1)), new Position(2, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 2)), new Position(2, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 30)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(3, 0)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(3, 1)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(3, 30)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(30, 30)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(-123.123, -0.5)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(Number.MIN_VALUE, Number.MIN_VALUE)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(Number.MAX_VALUE, Number.MAX_VALUE)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(123.23, 47.5)), new Position(2, 9));
    m.dispose();
  });
  test("validatePosition around high-low surrogate pairs 1", () => {
    const m = createTextModel("a\u{1F4DA}b");
    assert.deepStrictEqual(m.validatePosition(new Position(0, 0)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(0, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(0, 7)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 2)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 3)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 4)), new Position(1, 4));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 5)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 30)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 0)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 1)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 2)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 30)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(-123.123, -0.5)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(Number.MIN_VALUE, Number.MIN_VALUE)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(Number.MAX_VALUE, Number.MAX_VALUE)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(123.23, 47.5)), new Position(1, 5));
    m.dispose();
  });
  test("validatePosition around high-low surrogate pairs 2", () => {
    const m = createTextModel("a\u{1F4DA}\u{1F4DA}b");
    assert.deepStrictEqual(m.validatePosition(new Position(1, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 2)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 3)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 4)), new Position(1, 4));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 5)), new Position(1, 4));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 6)), new Position(1, 6));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 7)), new Position(1, 7));
    m.dispose();
  });
  test("validatePosition handle NaN.", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.validatePosition(new Position(NaN, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, NaN)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(NaN, NaN)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(2, NaN)), new Position(2, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(NaN, 3)), new Position(1, 3));
    m.dispose();
  });
  test("issue #71480: validatePosition handle floats", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.validatePosition(new Position(0.2, 1)), new Position(1, 1), "a");
    assert.deepStrictEqual(m.validatePosition(new Position(1.2, 1)), new Position(1, 1), "b");
    assert.deepStrictEqual(m.validatePosition(new Position(1.5, 2)), new Position(1, 2), "c");
    assert.deepStrictEqual(m.validatePosition(new Position(1.8, 3)), new Position(1, 3), "d");
    assert.deepStrictEqual(m.validatePosition(new Position(1, 0.3)), new Position(1, 1), "e");
    assert.deepStrictEqual(m.validatePosition(new Position(2, 0.8)), new Position(2, 1), "f");
    assert.deepStrictEqual(m.validatePosition(new Position(1, 1.2)), new Position(1, 1), "g");
    assert.deepStrictEqual(m.validatePosition(new Position(2, 1.5)), new Position(2, 1), "h");
    m.dispose();
  });
  test("issue #71480: validateRange handle floats", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.validateRange(new Range(0.2, 1.5, 0.8, 2.5)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1.2, 1.7, 1.8, 2.2)), new Range(1, 1, 1, 2));
    m.dispose();
  });
  test("validateRange around high-low surrogate pairs 1", () => {
    const m = createTextModel("a\u{1F4DA}b");
    assert.deepStrictEqual(m.validateRange(new Range(0, 0, 0, 1)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(0, 0, 0, 7)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 1)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 2)), new Range(1, 1, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 3)), new Range(1, 1, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 4)), new Range(1, 1, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 5)), new Range(1, 1, 1, 5));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 2)), new Range(1, 2, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 3)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 4)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 5)), new Range(1, 2, 1, 5));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 3)), new Range(1, 2, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 4)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 5)), new Range(1, 2, 1, 5));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 4)), new Range(1, 4, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 5)), new Range(1, 4, 1, 5));
    assert.deepStrictEqual(m.validateRange(new Range(1, 5, 1, 5)), new Range(1, 5, 1, 5));
    m.dispose();
  });
  test("validateRange around high-low surrogate pairs 2", () => {
    const m = createTextModel("a\u{1F4DA}\u{1F4DA}b");
    assert.deepStrictEqual(m.validateRange(new Range(0, 0, 0, 1)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(0, 0, 0, 7)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 1)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 2)), new Range(1, 1, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 3)), new Range(1, 1, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 4)), new Range(1, 1, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 5)), new Range(1, 1, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 6)), new Range(1, 1, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 7)), new Range(1, 1, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 2)), new Range(1, 2, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 3)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 4)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 5)), new Range(1, 2, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 6)), new Range(1, 2, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 7)), new Range(1, 2, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 3)), new Range(1, 2, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 4)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 5)), new Range(1, 2, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 6)), new Range(1, 2, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 7)), new Range(1, 2, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 4)), new Range(1, 4, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 5)), new Range(1, 4, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 6)), new Range(1, 4, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 7)), new Range(1, 4, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 5, 1, 5)), new Range(1, 4, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 5, 1, 6)), new Range(1, 4, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 5, 1, 7)), new Range(1, 4, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 6, 1, 6)), new Range(1, 6, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 6, 1, 7)), new Range(1, 6, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 7, 1, 7)), new Range(1, 7, 1, 7));
    m.dispose();
  });
  test("modifyPosition", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 1), 0), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(0, 0), 0), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(30, 1), 0), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 1), 17), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 1), 1), new Position(1, 2));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 1), 3), new Position(1, 4));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), 10), new Position(2, 3));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 5), 13), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), 16), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 9), -17), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), -1), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 4), -3), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 3), -10), new Position(1, 2));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 9), -13), new Position(1, 5));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 9), -16), new Position(1, 2));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), 17), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), 100), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), -2), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), -100), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 2), -100), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 9), -18), new Position(1, 1));
    m.dispose();
  });
  test("normalizeIndentation 1", () => {
    const model = createTextModel(
      "",
      void 0,
      {
        insertSpaces: false
      }
    );
    assert.strictEqual(model.normalizeIndentation("	"), "	");
    assert.strictEqual(model.normalizeIndentation("    "), "	");
    assert.strictEqual(model.normalizeIndentation("   "), "   ");
    assert.strictEqual(model.normalizeIndentation("  "), "  ");
    assert.strictEqual(model.normalizeIndentation(" "), " ");
    assert.strictEqual(model.normalizeIndentation(""), "");
    assert.strictEqual(model.normalizeIndentation(" 	    "), "		");
    assert.strictEqual(model.normalizeIndentation(" 	   "), "	   ");
    assert.strictEqual(model.normalizeIndentation(" 	  "), "	  ");
    assert.strictEqual(model.normalizeIndentation(" 	 "), "	 ");
    assert.strictEqual(model.normalizeIndentation(" 	"), "	");
    assert.strictEqual(model.normalizeIndentation("	a"), "	a");
    assert.strictEqual(model.normalizeIndentation("    a"), "	a");
    assert.strictEqual(model.normalizeIndentation("   a"), "   a");
    assert.strictEqual(model.normalizeIndentation("  a"), "  a");
    assert.strictEqual(model.normalizeIndentation(" a"), " a");
    assert.strictEqual(model.normalizeIndentation("a"), "a");
    assert.strictEqual(model.normalizeIndentation(" 	    a"), "		a");
    assert.strictEqual(model.normalizeIndentation(" 	   a"), "	   a");
    assert.strictEqual(model.normalizeIndentation(" 	  a"), "	  a");
    assert.strictEqual(model.normalizeIndentation(" 	 a"), "	 a");
    assert.strictEqual(model.normalizeIndentation(" 	a"), "	a");
    model.dispose();
  });
  test("normalizeIndentation 2", () => {
    const model = createTextModel("");
    assert.strictEqual(model.normalizeIndentation("	a"), "    a");
    assert.strictEqual(model.normalizeIndentation("    a"), "    a");
    assert.strictEqual(model.normalizeIndentation("   a"), "   a");
    assert.strictEqual(model.normalizeIndentation("  a"), "  a");
    assert.strictEqual(model.normalizeIndentation(" a"), " a");
    assert.strictEqual(model.normalizeIndentation("a"), "a");
    assert.strictEqual(model.normalizeIndentation(" 	    a"), "        a");
    assert.strictEqual(model.normalizeIndentation(" 	   a"), "       a");
    assert.strictEqual(model.normalizeIndentation(" 	  a"), "      a");
    assert.strictEqual(model.normalizeIndentation(" 	 a"), "     a");
    assert.strictEqual(model.normalizeIndentation(" 	a"), "    a");
    model.dispose();
  });
  test("getLineFirstNonWhitespaceColumn", () => {
    const model = createTextModel([
      "asd",
      " asd",
      "	asd",
      "  asd",
      "		asd",
      " ",
      "  ",
      "	",
      "		",
      "  	asd",
      "",
      ""
    ].join("\n"));
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(1), 1, "1");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(2), 2, "2");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(3), 2, "3");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(4), 3, "4");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(5), 3, "5");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(6), 0, "6");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(7), 0, "7");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(8), 0, "8");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(9), 0, "9");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(10), 4, "10");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(11), 0, "11");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(12), 0, "12");
    model.dispose();
  });
  test("getLineLastNonWhitespaceColumn", () => {
    const model = createTextModel([
      "asd",
      "asd ",
      "asd	",
      "asd  ",
      "asd		",
      " ",
      "  ",
      "	",
      "		",
      "asd  	",
      "",
      ""
    ].join("\n"));
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(1), 4, "1");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(2), 4, "2");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(3), 4, "3");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(4), 4, "4");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(5), 4, "5");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(6), 0, "6");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(7), 0, "7");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(8), 0, "8");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(9), 0, "9");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(10), 4, "10");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(11), 0, "11");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(12), 0, "12");
    model.dispose();
  });
  test("#50471. getValueInRange with invalid range", () => {
    const m = createTextModel("My First Line\r\nMy Second Line\r\nMy Third Line");
    assert.strictEqual(m.getValueInRange(new Range(1, NaN, 1, 3)), "My");
    assert.strictEqual(m.getValueInRange(new Range(NaN, NaN, NaN, NaN)), "");
    m.dispose();
  });
  test('issue #168836: updating tabSize should also update indentSize when indentSize is set to "tabSize"', () => {
    const m = createTextModel("some text", null, {
      tabSize: 2,
      indentSize: "tabSize"
    });
    assert.strictEqual(m.getOptions().tabSize, 2);
    assert.strictEqual(m.getOptions().indentSize, 2);
    assert.strictEqual(m.getOptions().originalIndentSize, "tabSize");
    m.updateOptions({
      tabSize: 4
    });
    assert.strictEqual(m.getOptions().tabSize, 4);
    assert.strictEqual(m.getOptions().indentSize, 4);
    assert.strictEqual(m.getOptions().originalIndentSize, "tabSize");
    m.dispose();
  });
});
suite("TextModel.mightContainRTL", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("nope", () => {
    const model = createTextModel("hello world!");
    assert.strictEqual(model.mightContainRTL(), false);
    model.dispose();
  });
  test("yes", () => {
    const model = createTextModel("Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5");
    assert.strictEqual(model.mightContainRTL(), true);
    model.dispose();
  });
  test("setValue resets 1", () => {
    const model = createTextModel("hello world!");
    assert.strictEqual(model.mightContainRTL(), false);
    model.setValue("Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5");
    assert.strictEqual(model.mightContainRTL(), true);
    model.dispose();
  });
  test("setValue resets 2", () => {
    const model = createTextModel("Hello,\n\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644");
    assert.strictEqual(model.mightContainRTL(), true);
    model.setValue("hello world!");
    assert.strictEqual(model.mightContainRTL(), false);
    model.dispose();
  });
});
suite("TextModel.createSnapshot", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty file", () => {
    const model = createTextModel("");
    const snapshot = model.createSnapshot();
    assert.strictEqual(snapshot.read(), null);
    model.dispose();
  });
  test("file with BOM", () => {
    const model = createTextModel(UTF8_BOM_CHARACTER + "Hello");
    assert.strictEqual(model.getLineContent(1), "Hello");
    const snapshot = model.createSnapshot(true);
    assert.strictEqual(snapshot.read(), UTF8_BOM_CHARACTER + "Hello");
    assert.strictEqual(snapshot.read(), null);
    model.dispose();
  });
  test("regular file", () => {
    const model = createTextModel("My First Line\n		My Second Line\n    Third Line\n\n1");
    const snapshot = model.createSnapshot();
    assert.strictEqual(snapshot.read(), "My First Line\n		My Second Line\n    Third Line\n\n1");
    assert.strictEqual(snapshot.read(), null);
    model.dispose();
  });
  test("large file", () => {
    const lines = [];
    for (let i = 0; i < 1e3; i++) {
      lines[i] = "Just some text that is a bit long such that it can consume some memory";
    }
    const text = lines.join("\n");
    const model = createTextModel(text);
    const snapshot = model.createSnapshot();
    let actual = "";
    const tmp1 = snapshot.read();
    assert.ok(tmp1);
    actual += tmp1;
    const tmp2 = snapshot.read();
    if (tmp2 === null) {
    } else {
      actual += tmp2;
      assert.strictEqual(snapshot.read(), null);
    }
    assert.strictEqual(actual, text);
    model.dispose();
  });
  test("issue #119632: invalid range", () => {
    const model = createTextModel("hello world!");
    const actual = model._validateRangeRelaxedNoAllocations(new Range(void 0, 0, void 0, 1));
    assert.deepStrictEqual(actual, new Range(1, 1, 1, 1));
    model.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVVEY4X0JPTV9DSEFSQUNURVIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVQcmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCwgY3JlYXRlVGV4dEJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9kZWxTZXJ2aWNlcywgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcblxuZnVuY3Rpb24gdGVzdEd1ZXNzSW5kZW50YXRpb24oZGVmYXVsdEluc2VydFNwYWNlczogYm9vbGVhbiwgZGVmYXVsdFRhYlNpemU6IG51bWJlciwgZXhwZWN0ZWRJbnNlcnRTcGFjZXM6IGJvb2xlYW4sIGV4cGVjdGVkVGFiU2l6ZTogbnVtYmVyLCB0ZXh0OiBzdHJpbmdbXSwgbXNnPzogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0dGV4dC5qb2luKCdcXG4nKSxcblx0XHR1bmRlZmluZWQsXG5cdFx0e1xuXHRcdFx0dGFiU2l6ZTogZGVmYXVsdFRhYlNpemUsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGRlZmF1bHRJbnNlcnRTcGFjZXMsXG5cdFx0XHRkZXRlY3RJbmRlbnRhdGlvbjogdHJ1ZVxuXHRcdH1cblx0KTtcblx0Y29uc3QgciA9IG0uZ2V0T3B0aW9ucygpO1xuXHRtLmRpc3Bvc2UoKTtcblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoci5pbnNlcnRTcGFjZXMsIGV4cGVjdGVkSW5zZXJ0U3BhY2VzLCBtc2cpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoci50YWJTaXplLCBleHBlY3RlZFRhYlNpemUsIG1zZyk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydEd1ZXNzKGV4cGVjdGVkSW5zZXJ0U3BhY2VzOiBib29sZWFuIHwgdW5kZWZpbmVkLCBleHBlY3RlZFRhYlNpemU6IG51bWJlciB8IHVuZGVmaW5lZCB8IFtudW1iZXJdLCB0ZXh0OiBzdHJpbmdbXSwgbXNnPzogc3RyaW5nKTogdm9pZCB7XG5cdGlmICh0eXBlb2YgZXhwZWN0ZWRJbnNlcnRTcGFjZXMgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0Ly8gY2Fubm90IGd1ZXNzIGluc2VydFNwYWNlc1xuXHRcdGlmICh0eXBlb2YgZXhwZWN0ZWRUYWJTaXplID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Ly8gY2Fubm90IGd1ZXNzIHRhYlNpemVcblx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKHRydWUsIDEzMzcwLCB0cnVlLCAxMzM3MCwgdGV4dCwgbXNnKTtcblx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKGZhbHNlLCAxMzM3MSwgZmFsc2UsIDEzMzcxLCB0ZXh0LCBtc2cpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGV4cGVjdGVkVGFiU2l6ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdC8vIGNhbiBndWVzcyB0YWJTaXplXG5cdFx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbih0cnVlLCAxMzM3MCwgdHJ1ZSwgZXhwZWN0ZWRUYWJTaXplLCB0ZXh0LCBtc2cpO1xuXHRcdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24oZmFsc2UsIDEzMzcxLCBmYWxzZSwgZXhwZWN0ZWRUYWJTaXplLCB0ZXh0LCBtc2cpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBjYW4gb25seSBndWVzcyB0YWJTaXplIHdoZW4gaW5zZXJ0U3BhY2VzIGlzIHRydWVcblx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKHRydWUsIDEzMzcwLCB0cnVlLCBleHBlY3RlZFRhYlNpemVbMF0sIHRleHQsIG1zZyk7XG5cdFx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbihmYWxzZSwgMTMzNzEsIGZhbHNlLCAxMzM3MSwgdGV4dCwgbXNnKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gY2FuIGd1ZXNzIGluc2VydFNwYWNlc1xuXHRcdGlmICh0eXBlb2YgZXhwZWN0ZWRUYWJTaXplID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Ly8gY2Fubm90IGd1ZXNzIHRhYlNpemVcblx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKHRydWUsIDEzMzcwLCBleHBlY3RlZEluc2VydFNwYWNlcywgMTMzNzAsIHRleHQsIG1zZyk7XG5cdFx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbihmYWxzZSwgMTMzNzEsIGV4cGVjdGVkSW5zZXJ0U3BhY2VzLCAxMzM3MSwgdGV4dCwgbXNnKTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBleHBlY3RlZFRhYlNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHQvLyBjYW4gZ3Vlc3MgdGFiU2l6ZVxuXHRcdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24odHJ1ZSwgMTMzNzAsIGV4cGVjdGVkSW5zZXJ0U3BhY2VzLCBleHBlY3RlZFRhYlNpemUsIHRleHQsIG1zZyk7XG5cdFx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbihmYWxzZSwgMTMzNzEsIGV4cGVjdGVkSW5zZXJ0U3BhY2VzLCBleHBlY3RlZFRhYlNpemUsIHRleHQsIG1zZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGNhbiBvbmx5IGd1ZXNzIHRhYlNpemUgd2hlbiBpbnNlcnRTcGFjZXMgaXMgdHJ1ZVxuXHRcdFx0aWYgKGV4cGVjdGVkSW5zZXJ0U3BhY2VzID09PSB0cnVlKSB7XG5cdFx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKHRydWUsIDEzMzcwLCBleHBlY3RlZEluc2VydFNwYWNlcywgZXhwZWN0ZWRUYWJTaXplWzBdLCB0ZXh0LCBtc2cpO1xuXHRcdFx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbihmYWxzZSwgMTMzNzEsIGV4cGVjdGVkSW5zZXJ0U3BhY2VzLCBleHBlY3RlZFRhYlNpemVbMF0sIHRleHQsIG1zZyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbih0cnVlLCAxMzM3MCwgZXhwZWN0ZWRJbnNlcnRTcGFjZXMsIDEzMzcwLCB0ZXh0LCBtc2cpO1xuXHRcdFx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbihmYWxzZSwgMTMzNzEsIGV4cGVjdGVkSW5zZXJ0U3BhY2VzLCAxMzM3MSwgdGV4dCwgbXNnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuc3VpdGUoJ1RleHRNb2RlbERhdGEuZnJvbVN0cmluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRpbnRlcmZhY2UgSVRleHRCdWZmZXJEYXRhIHtcblx0XHRFT0w6IHN0cmluZztcblx0XHRsaW5lczogc3RyaW5nW107XG5cdFx0Y29udGFpbnNSVEw6IGJvb2xlYW47XG5cdFx0aXNCYXNpY0FTQ0lJOiBib29sZWFuO1xuXHR9XG5cblx0ZnVuY3Rpb24gdGVzdFRleHRNb2RlbERhdGFGcm9tU3RyaW5nKHRleHQ6IHN0cmluZywgZXhwZWN0ZWQ6IElUZXh0QnVmZmVyRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgdGV4dEJ1ZmZlciwgZGlzcG9zYWJsZSB9ID0gY3JlYXRlVGV4dEJ1ZmZlcih0ZXh0LCBUZXh0TW9kZWwuREVGQVVMVF9DUkVBVElPTl9PUFRJT05TLmRlZmF1bHRFT0wpO1xuXHRcdGNvbnN0IGFjdHVhbDogSVRleHRCdWZmZXJEYXRhID0ge1xuXHRcdFx0RU9MOiB0ZXh0QnVmZmVyLmdldEVPTCgpLFxuXHRcdFx0bGluZXM6IHRleHRCdWZmZXIuZ2V0TGluZXNDb250ZW50KCksXG5cdFx0XHRjb250YWluc1JUTDogdGV4dEJ1ZmZlci5taWdodENvbnRhaW5SVEwoKSxcblx0XHRcdGlzQmFzaWNBU0NJSTogIXRleHRCdWZmZXIubWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSgpXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0dGVzdCgnb25lIGxpbmUgdGV4dCcsICgpID0+IHtcblx0XHR0ZXN0VGV4dE1vZGVsRGF0YUZyb21TdHJpbmcoJ0hlbGxvIHdvcmxkIScsXG5cdFx0XHR7XG5cdFx0XHRcdEVPTDogJ1xcbicsXG5cdFx0XHRcdGxpbmVzOiBbXG5cdFx0XHRcdFx0J0hlbGxvIHdvcmxkISdcblx0XHRcdFx0XSxcblx0XHRcdFx0Y29udGFpbnNSVEw6IGZhbHNlLFxuXHRcdFx0XHRpc0Jhc2ljQVNDSUk6IHRydWVcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aWxpbmUgdGV4dCcsICgpID0+IHtcblx0XHR0ZXN0VGV4dE1vZGVsRGF0YUZyb21TdHJpbmcoJ0hlbGxvLFxcclxcbmRlYXIgZnJpZW5kXFxuSG93XFxyYXJlXFxyXFxueW91PycsXG5cdFx0XHR7XG5cdFx0XHRcdEVPTDogJ1xcclxcbicsXG5cdFx0XHRcdGxpbmVzOiBbXG5cdFx0XHRcdFx0J0hlbGxvLCcsXG5cdFx0XHRcdFx0J2RlYXIgZnJpZW5kJyxcblx0XHRcdFx0XHQnSG93Jyxcblx0XHRcdFx0XHQnYXJlJyxcblx0XHRcdFx0XHQneW91Pydcblx0XHRcdFx0XSxcblx0XHRcdFx0Y29udGFpbnNSVEw6IGZhbHNlLFxuXHRcdFx0XHRpc0Jhc2ljQVNDSUk6IHRydWVcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdOb24gQmFzaWMgQVNDSUkgMScsICgpID0+IHtcblx0XHR0ZXN0VGV4dE1vZGVsRGF0YUZyb21TdHJpbmcoJ0hlbGxvLFxcblpcdTAwRkNyaWNoJyxcblx0XHRcdHtcblx0XHRcdFx0RU9MOiAnXFxuJyxcblx0XHRcdFx0bGluZXM6IFtcblx0XHRcdFx0XHQnSGVsbG8sJyxcblx0XHRcdFx0XHQnWlx1MDBGQ3JpY2gnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGNvbnRhaW5zUlRMOiBmYWxzZSxcblx0XHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZVxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRhaW5zUlRMIDEnLCAoKSA9PiB7XG5cdFx0dGVzdFRleHRNb2RlbERhdGFGcm9tU3RyaW5nKCdIZWxsbyxcXG5cdTA1RDZcdTA1RDVcdTA1RDRcdTA1RDkgXHUwNUUyXHUwNUQ1XHUwNUQxXHUwNUQzXHUwNUQ0IFx1MDVERVx1MDVEMVx1MDVENVx1MDVFMVx1MDVFMVx1MDVFQSBcdTA1RTlcdTA1RDNcdTA1RTJcdTA1RUFcdTA1RDUnLFxuXHRcdFx0e1xuXHRcdFx0XHRFT0w6ICdcXG4nLFxuXHRcdFx0XHRsaW5lczogW1xuXHRcdFx0XHRcdCdIZWxsbywnLFxuXHRcdFx0XHRcdCdcdTA1RDZcdTA1RDVcdTA1RDRcdTA1RDkgXHUwNUUyXHUwNUQ1XHUwNUQxXHUwNUQzXHUwNUQ0IFx1MDVERVx1MDVEMVx1MDVENVx1MDVFMVx1MDVFMVx1MDVFQSBcdTA1RTlcdTA1RDNcdTA1RTJcdTA1RUFcdTA1RDUnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGNvbnRhaW5zUlRMOiB0cnVlLFxuXHRcdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29udGFpbnNSVEwgMicsICgpID0+IHtcblx0XHR0ZXN0VGV4dE1vZGVsRGF0YUZyb21TdHJpbmcoJ0hlbGxvLFxcblx1MDY0N1x1MDY0Nlx1MDYyN1x1MDY0MyBcdTA2MkRcdTA2NDJcdTA2NEFcdTA2NDJcdTA2MjkgXHUwNjQ1XHUwNjJCXHUwNjI4XHUwNjJBXHUwNjI5IFx1MDY0NVx1MDY0Nlx1MDYzMCBcdTA2MzJcdTA2NDVcdTA2NDYgXHUwNjM3XHUwNjQ4XHUwNjRBXHUwNjQ0Jyxcblx0XHRcdHtcblx0XHRcdFx0RU9MOiAnXFxuJyxcblx0XHRcdFx0bGluZXM6IFtcblx0XHRcdFx0XHQnSGVsbG8sJyxcblx0XHRcdFx0XHQnXHUwNjQ3XHUwNjQ2XHUwNjI3XHUwNjQzIFx1MDYyRFx1MDY0Mlx1MDY0QVx1MDY0Mlx1MDYyOSBcdTA2NDVcdTA2MkJcdTA2MjhcdTA2MkFcdTA2MjkgXHUwNjQ1XHUwNjQ2XHUwNjMwIFx1MDYzMlx1MDY0NVx1MDY0NiBcdTA2MzdcdTA2NDhcdTA2NEFcdTA2NDQnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGNvbnRhaW5zUlRMOiB0cnVlLFxuXHRcdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cbn0pO1xuXG5zdWl0ZSgnRWRpdG9yIE1vZGVsIC0gVGV4dE1vZGVsJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ1RleHRNb2RlbCBkb2VzIG5vdCB1c2UgZXZlbnRzIGludGVybmFsbHknLCAoKSA9PiB7XG5cdFx0Ly8gTWFrZSBzdXJlIHRoYXQgYWxsIG1vZGVsIHBhcnRzIHJlY2VpdmUgdGV4dCBtb2RlbCBldmVudHMgZXhwbGljaXRseVxuXHRcdC8vIHRvIGF2b2lkIHRoYXQgYnkgYW55IGNoYW5jZSBhbiBvdXRzaWRlIGxpc3RlbmVyIHJlY2VpdmVzIGV2ZW50cyBiZWZvcmVcblx0XHQvLyB0aGUgcGFydHMgYW5kIHRodXMgYXJlIGFibGUgdG8gYWNjZXNzIHRoZSB0ZXh0IG1vZGVsIGluIGFuIGluY29uc2lzdGVudCBzdGF0ZS5cblx0XHQvL1xuXHRcdC8vIFdlIHNpbXBseSBjaGVjayB0aGF0IHRoZXJlIGFyZSBubyBsaXN0ZW5lcnMgYXR0YWNoZWQgdG8gdGV4dCBtb2RlbFxuXHRcdC8vIGFmdGVyIGluc3RhbnRpYXRpb25cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRNb2RlbCwgJycsIFBMQUlOVEVYVF9MQU5HVUFHRV9JRCwgVGV4dE1vZGVsLkRFRkFVTFRfQ1JFQVRJT05fT1BUSU9OUywgbnVsbCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuX2hhc0xpc3RlbmVycygpLCBmYWxzZSk7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRWYWx1ZUxlbmd0aEluUmFuZ2UnLCAoKSA9PiB7XG5cblx0XHRsZXQgbSA9IGNyZWF0ZVRleHRNb2RlbCgnTXkgRmlyc3QgTGluZVxcclxcbk15IFNlY29uZCBMaW5lXFxyXFxuTXkgVGhpcmQgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpLCAnJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMikpLCAnTScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDMpKSwgJ3knLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAxNCkpLCAnTXkgRmlyc3QgTGluZScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDIsIDEpKSwgJ015IEZpcnN0IExpbmVcXHJcXG4nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAyLCAyLCAxKSksICd5IEZpcnN0IExpbmVcXHJcXG4nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAyLCAyLCAyKSksICd5IEZpcnN0IExpbmVcXHJcXG5NJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMiwgMiwgMTAwMCkpLCAneSBGaXJzdCBMaW5lXFxyXFxuTXkgU2Vjb25kIExpbmUnLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAyLCAzLCAxKSksICd5IEZpcnN0IExpbmVcXHJcXG5NeSBTZWNvbmQgTGluZVxcclxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDMsIDEwMDApKSwgJ3kgRmlyc3QgTGluZVxcclxcbk15IFNlY29uZCBMaW5lXFxyXFxuTXkgVGhpcmQgTGluZScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEwMDAsIDEwMDApKSwgJ015IEZpcnN0IExpbmVcXHJcXG5NeSBTZWNvbmQgTGluZVxcclxcbk15IFRoaXJkIExpbmUnLmxlbmd0aCk7XG5cdFx0bS5kaXNwb3NlKCk7XG5cblx0XHRtID0gY3JlYXRlVGV4dE1vZGVsKCdNeSBGaXJzdCBMaW5lXFxuTXkgU2Vjb25kIExpbmVcXG5NeSBUaGlyZCBMaW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAxKSksICcnLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAyKSksICdNJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgMykpLCAneScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDE0KSksICdNeSBGaXJzdCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSkpLCAnTXkgRmlyc3QgTGluZVxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDIsIDEpKSwgJ3kgRmlyc3QgTGluZVxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDIsIDIpKSwgJ3kgRmlyc3QgTGluZVxcbk0nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAyLCAyLCAxMDAwKSksICd5IEZpcnN0IExpbmVcXG5NeSBTZWNvbmQgTGluZScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDMsIDEpKSwgJ3kgRmlyc3QgTGluZVxcbk15IFNlY29uZCBMaW5lXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMiwgMywgMTAwMCkpLCAneSBGaXJzdCBMaW5lXFxuTXkgU2Vjb25kIExpbmVcXG5NeSBUaGlyZCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMTAwMCwgMTAwMCkpLCAnTXkgRmlyc3QgTGluZVxcbk15IFNlY29uZCBMaW5lXFxuTXkgVGhpcmQgTGluZScubGVuZ3RoKTtcblx0XHRtLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VmFsdWVMZW5ndGhJblJhbmdlIGRpZmZlcmVudCBFT0wnLCAoKSA9PiB7XG5cblx0XHRsZXQgbSA9IGNyZWF0ZVRleHRNb2RlbCgnTXkgRmlyc3QgTGluZVxcclxcbk15IFNlY29uZCBMaW5lXFxyXFxuTXkgVGhpcmQgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSksIEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpLCAnTXkgRmlyc3QgTGluZVxcclxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDIsIDEpLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkNSTEYpLCAnTXkgRmlyc3QgTGluZVxcclxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDIsIDEpLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ015IEZpcnN0IExpbmVcXG4nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxMDAwLCAxMDAwKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCksICdNeSBGaXJzdCBMaW5lXFxyXFxuTXkgU2Vjb25kIExpbmVcXHJcXG5NeSBUaGlyZCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMTAwMCwgMTAwMCksIEVuZE9mTGluZVByZWZlcmVuY2UuQ1JMRiksICdNeSBGaXJzdCBMaW5lXFxyXFxuTXkgU2Vjb25kIExpbmVcXHJcXG5NeSBUaGlyZCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMTAwMCwgMTAwMCksIEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnTXkgRmlyc3QgTGluZVxcbk15IFNlY29uZCBMaW5lXFxuTXkgVGhpcmQgTGluZScubGVuZ3RoKTtcblx0XHRtLmRpc3Bvc2UoKTtcblxuXHRcdG0gPSBjcmVhdGVUZXh0TW9kZWwoJ015IEZpcnN0IExpbmVcXG5NeSBTZWNvbmQgTGluZVxcbk15IFRoaXJkIExpbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDIsIDEpLCBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKSwgJ015IEZpcnN0IExpbmVcXG4nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAxKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdNeSBGaXJzdCBMaW5lXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSksIEVuZE9mTGluZVByZWZlcmVuY2UuQ1JMRiksICdNeSBGaXJzdCBMaW5lXFxyXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMTAwMCwgMTAwMCksIEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpLCAnTXkgRmlyc3QgTGluZVxcbk15IFNlY29uZCBMaW5lXFxuTXkgVGhpcmQgTGluZScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEwMDAsIDEwMDApLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ015IEZpcnN0IExpbmVcXG5NeSBTZWNvbmQgTGluZVxcbk15IFRoaXJkIExpbmUnLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxMDAwLCAxMDAwKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGKSwgJ015IEZpcnN0IExpbmVcXHJcXG5NeSBTZWNvbmQgTGluZVxcclxcbk15IFRoaXJkIExpbmUnLmxlbmd0aCk7XG5cdFx0bS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2d1ZXNzIGluZGVudGF0aW9uIDEnLCAoKSA9PiB7XG5cblx0XHRhc3NlcnRHdWVzcyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J3gnXG5cdFx0XSwgJ25vIGNsdWVzJyk7XG5cblx0XHRhc3NlcnRHdWVzcyhmYWxzZSwgdW5kZWZpbmVkLCBbXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCdcblx0XHRdLCAnbm8gc3BhY2VzLCAxeFRBQicpO1xuXG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMiwgW1xuXHRcdFx0JyAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCdcblx0XHRdLCAnMXgyJyk7XG5cblx0XHRhc3NlcnRHdWVzcyhmYWxzZSwgdW5kZWZpbmVkLCBbXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnXFx0eCdcblx0XHRdLCAnN3hUQUInKTtcblxuXHRcdGFzc2VydEd1ZXNzKHVuZGVmaW5lZCwgWzJdLCBbXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnICB4Jyxcblx0XHRdLCAnNHgyLCA0eFRBQicpO1xuXHRcdGFzc2VydEd1ZXNzKGZhbHNlLCB1bmRlZmluZWQsIFtcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgeCdcblx0XHRdLCAnNHgxLCA0eFRBQicpO1xuXHRcdGFzc2VydEd1ZXNzKGZhbHNlLCB1bmRlZmluZWQsIFtcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdF0sICc0eDIsIDV4VEFCJyk7XG5cdFx0YXNzZXJ0R3Vlc3MoZmFsc2UsIHVuZGVmaW5lZCwgW1xuXHRcdFx0J1xcdHgnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XSwgJzF4MiwgNXhUQUInKTtcblx0XHRhc3NlcnRHdWVzcyhmYWxzZSwgdW5kZWZpbmVkLCBbXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdF0sICcxeDQsIDV4VEFCJyk7XG5cdFx0YXNzZXJ0R3Vlc3MoZmFsc2UsIHVuZGVmaW5lZCwgW1xuXHRcdFx0J1xcdHgnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdF0sICcxeDIsIDF4NCwgNXhUQUInKTtcblxuXHRcdGFzc2VydEd1ZXNzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnXG5cdFx0XSwgJzd4MSAtIDEgc3BhY2UgaXMgbmV2ZXIgZ3Vlc3NlZCBhcyBhbiBpbmRlbnRhdGlvbicpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIHVuZGVmaW5lZCwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICAgICAgICB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4J1xuXHRcdF0sICcxeDEwLCA2eDEnKTtcblx0XHRhc3NlcnRHdWVzcyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgW1xuXHRcdFx0JycsXG5cdFx0XHQnICAnLFxuXHRcdFx0JyAgICAnLFxuXHRcdFx0JyAgICAgICcsXG5cdFx0XHQnICAgICAgICAnLFxuXHRcdFx0JyAgICAgICAgICAnLFxuXHRcdFx0JyAgICAgICAgICAgICcsXG5cdFx0XHQnICAgICAgICAgICAgICAnLFxuXHRcdF0sICd3aGl0ZXNwYWNlIGxpbmVzIGRvblxcJ3QgY291bnQnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAzLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgeCcsXG5cdFx0XHQnICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgIHgnLFxuXHRcdFx0JyAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICB4Jyxcblx0XHRcdCcgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XSwgJzZ4MywgM3g0Jyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgNSwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICAgeCcsXG5cdFx0XHQnICAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgICB4Jyxcblx0XHRcdCcgICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgIHgnLFxuXHRcdFx0JyAgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdF0sICc2eDUsIDN4NCcpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDcsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgICAgeCcsXG5cdFx0XHQnICAgICAgIHgnLFxuXHRcdFx0JyAgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgICAgIHgnLFxuXHRcdFx0JyAgICAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgICAgIHgnLFxuXHRcdFx0JyAgICAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XSwgJzZ4NywgMXg1LCAyeDQnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAyLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdF0sICc4eDInKTtcblxuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDIsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XSwgJzh4MicpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDIsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRdLCAnNHgyLCA0eDQnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAyLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XSwgJzZ4MiwgM3g0Jyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMiwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdF0sICc0eDIsIDR4NCcpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDIsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdF0sICcyeDIsIDR4NCcpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDQsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdF0sICc4eDQnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAyLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgICB4Jyxcblx0XHRdLCAnMngyLCA0eDQsIDJ4NicpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDIsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgICAgeCcsXG5cdFx0XHQnICAgICAgeCcsXG5cdFx0XHQnICAgICAgICB4Jyxcblx0XHRdLCAnMXgyLCAyeDQsIDJ4NiwgMXg4Jyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgNCwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICAgeCcsXG5cdFx0XHQnICAgICAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgIHgnLFxuXHRcdFx0JyAgICAgICAgeCcsXG5cdFx0XSwgJzZ4NCwgMng1LCAyeDgnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCA0LCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgICB4Jyxcblx0XHRcdCcgICAgICAgIHgnLFxuXHRcdFx0JyAgICAgICAgeCcsXG5cdFx0XSwgJzN4NCwgMXg1LCAyeDgnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCA0LCBbXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgIHgnLFxuXHRcdFx0JyAgICAgICAgeCcsXG5cdFx0XHQnICAgICAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICAgeCcsXG5cdFx0XHQnICAgICAgICB4Jyxcblx0XHRcdCcgICAgICAgIHgnLFxuXHRcdF0sICc2eDQsIDJ4NSwgNHg4Jyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMywgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRdLCAnNXgxLCAyeDAsIDF4MywgMng0Jyk7XG5cdFx0YXNzZXJ0R3Vlc3MoZmFsc2UsIHVuZGVmaW5lZCwgW1xuXHRcdFx0J1xcdCB4Jyxcblx0XHRcdCcgXFx0IHgnLFxuXHRcdFx0J1xcdHgnXG5cdFx0XSwgJ21peGVkIHdoaXRlc3BhY2UgMScpO1xuXHRcdGFzc2VydEd1ZXNzKGZhbHNlLCB1bmRlZmluZWQsIFtcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCdcXHQgICAgeCdcblx0XHRdLCAnbWl4ZWQgd2hpdGVzcGFjZSAyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NDk5MTogV3JvbmcgaW5kZW50YXRpb24gc2l6ZSBhdXRvLWRldGVjdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCA0LCBbXG5cdFx0XHQnYSA9IDEwICAgICAgICAgICAgICMgMCBzcGFjZSBpbmRlbnQnLFxuXHRcdFx0J2IgPSA1ICAgICAgICAgICAgICAjIDAgc3BhY2UgaW5kZW50Jyxcblx0XHRcdCdpZiBhID4gMTA6ICAgICAgICAgIyAwIHNwYWNlIGluZGVudCcsXG5cdFx0XHQnICAgIGEgKz0gMSAgICAgICAgICMgNCBzcGFjZSBpbmRlbnQgICAgICBkZWx0YSA0IHNwYWNlcycsXG5cdFx0XHQnICAgIGlmIGIgPiA1OiAgICAgICMgNCBzcGFjZSBpbmRlbnQnLFxuXHRcdFx0JyAgICAgICAgYiArPSAxICAgICAjIDggc3BhY2UgaW5kZW50ICAgICAgZGVsdGEgNCBzcGFjZXMnLFxuXHRcdFx0JyAgICAgICAgYiArPSAxICAgICAjIDggc3BhY2UgaW5kZW50Jyxcblx0XHRcdCcgICAgICAgIGIgKz0gMSAgICAgIyA4IHNwYWNlIGluZGVudCcsXG5cdFx0XHQnIyBjb21tZW50IGxpbmUgMSAgICMgMCBzcGFjZSBpbmRlbnQgICAgICBkZWx0YSA4IHNwYWNlcycsXG5cdFx0XHQnIyBjb21tZW50IGxpbmUgMiAgICMgMCBzcGFjZSBpbmRlbnQnLFxuXHRcdFx0JyMgY29tbWVudCBsaW5lIDMgICAjIDAgc3BhY2UgaW5kZW50Jyxcblx0XHRcdCcgICAgICAgIGIgKz0gMSAgICAgIyA4IHNwYWNlIGluZGVudCAgICAgIGRlbHRhIDggc3BhY2VzJyxcblx0XHRcdCcgICAgICAgIGIgKz0gMSAgICAgIyA4IHNwYWNlIGluZGVudCcsXG5cdFx0XHQnICAgICAgICBiICs9IDEgICAgICMgOCBzcGFjZSBpbmRlbnQnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNTU4MTg6IEJyb2tlbiBpbmRlbnRhdGlvbiBkZXRlY3Rpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMiwgW1xuXHRcdFx0JycsXG5cdFx0XHQnLyogUkVRVUlSRSAqLycsXG5cdFx0XHQnJyxcblx0XHRcdCdjb25zdCBmb28gPSByZXF1aXJlICggXFwnZm9vXFwnICksJyxcblx0XHRcdCcgICAgICBiYXIgPSByZXF1aXJlICggXFwnYmFyXFwnICk7Jyxcblx0XHRcdCcnLFxuXHRcdFx0Jy8qIE1ZIEZOICovJyxcblx0XHRcdCcnLFxuXHRcdFx0J2Z1bmN0aW9uIG15Rm4gKCkgeycsXG5cdFx0XHQnJyxcblx0XHRcdCcgIGNvbnN0IGFzZCA9IDEsJyxcblx0XHRcdCcgICAgICAgIGRzYSA9IDI7Jyxcblx0XHRcdCcnLFxuXHRcdFx0JyAgcmV0dXJuIGJhciAoIGZvbyAoIGFzZCApICk7Jyxcblx0XHRcdCcnLFxuXHRcdFx0J30nLFxuXHRcdFx0JycsXG5cdFx0XHQnLyogRVhQT1JUICovJyxcblx0XHRcdCcnLFxuXHRcdFx0J21vZHVsZS5leHBvcnRzID0gbXlGbjsnLFxuXHRcdFx0JycsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3MDgzMjogQnJva2VuIGluZGVudGF0aW9uIGRldGVjdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnRHdWVzcyhmYWxzZSwgdW5kZWZpbmVkLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnXHR4Jyxcblx0XHRcdCdcdFx0eCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J1x0XHR4Jyxcblx0XHRcdCdcdHgnLFxuXHRcdFx0J1x0XHR4Jyxcblx0XHRcdCdcdHgnLFxuXHRcdFx0J1x0eCcsXG5cdFx0XHQnXHR4Jyxcblx0XHRcdCdcdHgnLFxuXHRcdFx0J3gnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNjIxNDM6IEJyb2tlbiBpbmRlbnRhdGlvbiBkZXRlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Ly8gd29ya3MgYmVmb3JlIHRoZSBmaXhcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAyLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnXG5cdFx0XSk7XG5cblx0XHQvLyB3b3JrcyBiZWZvcmUgdGhlIGZpeFxuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDIsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgIC0gaXRlbTInLFxuXHRcdFx0JyAgLSBpdGVtMydcblx0XHRdKTtcblxuXHRcdC8vIHdvcmtzIGJlZm9yZSB0aGUgZml4XG5cdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24odHJ1ZSwgMiwgdHJ1ZSwgMiwgW1xuXHRcdFx0J3ggeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdF0pO1xuXG5cdFx0Ly8gZmFpbHMgYmVmb3JlIHRoZSBmaXhcblx0XHQvLyBlbXB0eSBzcGFjZSBpbmxpbmUgYnJlYWtzIHRoZSBpbmRlbnRhdGlvbiBndWVzc1xuXHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKHRydWUsIDIsIHRydWUsIDIsIFtcblx0XHRcdCd4IHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgICAgeCdcblx0XHRdKTtcblxuXHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKHRydWUsIDIsIHRydWUsIDIsIFtcblx0XHRcdCc8IS0tdGVzdDEubWQgLS0+Jyxcblx0XHRcdCctIGl0ZW0xJyxcblx0XHRcdCcgIC0gaXRlbTInLFxuXHRcdFx0JyAgICAtIGl0ZW0zJ1xuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODQyMTc6IEJyb2tlbiBpbmRlbnRhdGlvbiBkZXRlY3Rpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgNCwgW1xuXHRcdFx0J2RlZiBtYWluKCk6Jyxcblx0XHRcdCcgICAgcHJpbnQoXFwnaGVsbG9cXCcpJyxcblx0XHRdKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCA0LCBbXG5cdFx0XHQnZGVmIG1haW4oKTonLFxuXHRcdFx0JyAgICB3aXRoIG9wZW4oXFwnZm9vXFwnKSBhcyBmcDonLFxuXHRcdFx0JyAgICAgICAgcHJpbnQoZnAucmVhZCgpKScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM2NTY2ODogWUFNTCBmaWxlIGluZGVudGVkIHdpdGggMiBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0Ly8gRnVsbCBZQU1MIGZpbGUgZnJvbSB0aGUgaXNzdWUgLSBzaG91bGQgZGV0ZWN0IGFzIDIgc3BhY2VzXG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMiwgW1xuXHRcdFx0J3ZlcnNpb246IDInLFxuXHRcdFx0JycsXG5cdFx0XHQnam9iczonLFxuXHRcdFx0JyAgYnVpbGQ6Jyxcblx0XHRcdCcgICAgZG9ja2VyOicsXG5cdFx0XHQnICAgICAgLSBjaXJjbGVjaS9nb2xhbmc6MS4xMScsXG5cdFx0XHQnJyxcblx0XHRcdCcgIGVudmlyb25tZW50OicsXG5cdFx0XHQnICAgIFRFU1RfUkVTVUxUUzogL3RtcC90ZXN0LXJlc3VsdHMnLFxuXHRcdFx0JycsXG5cdFx0XHQnICBzdGVwczonLFxuXHRcdFx0JyAgICAtIGNoZWNrb3V0Jyxcblx0XHRcdCcgICAgLSBydW46IG1rZGlyIC1wICRURVNUX1JFU1VMVFMnLFxuXHRcdFx0JycsXG5cdFx0XHQnICAgIC0gcmVzdG9yZV9jYWNoZTonLFxuXHRcdFx0JyAgICAgICAga2V5czonLFxuXHRcdFx0JyAgICAgICAgICAtIHYxLXBrZy1jYWNoZScsXG5cdFx0XHQnJyxcblx0XHRcdCcgICAgLSBydW46Jyxcblx0XHRcdCcgICAgICAgIG5hbWU6IGRlcCBlbnN1cmUnLFxuXHRcdFx0JyAgICAgICAgY29tbWFuZDogZGVwIGVuc3VyZSAtdicsXG5cdFx0XHQnJyxcblx0XHRcdCcgICAgLSBydW46Jyxcblx0XHRcdCcgICAgICAgIG5hbWU6IFJ1biB1bml0IHRlc3RzJyxcblx0XHRcdCcgICAgICAgIGNvbW1hbmQ6IHwnLFxuXHRcdFx0JyAgICAgICAgICB0cmFwIFwiZ28tanVuaXQtcmVwb3J0IDwke1RFU1RfUkVTVUxUU30vZ28tdGVzdC5vdXQgPiAke1RFU1RfUkVTVUxUU30vZ28tdGVzdC1yZXBvcnQueG1sXCIgRVhJVCcsXG5cdFx0XHQnICAgICAgICAgIGdvIHRlc3QgLXYgLi8uLi4gfCB0ZWUgJHtURVNUX1JFU1VMVFN9L2dvLXRlc3Qub3V0Jyxcblx0XHRcdCcnLFxuXHRcdFx0JyAgICAtIHJ1bjonLFxuXHRcdFx0JyAgICAgICAgbmFtZTogQnVpbGQnLFxuXHRcdFx0JyAgICAgICAgY29tbWFuZDogZ28gYnVpbGQgLXYnLFxuXHRcdFx0JycsXG5cdFx0XHQnICAgIC0gc2F2ZV9jYWNoZTonLFxuXHRcdFx0JyAgICAgICAga2V5OiB2MS1wa2ctY2FjaGUnLFxuXHRcdFx0JyAgICAgICAgcGF0aHM6Jyxcblx0XHRcdCcgICAgICAgICAgLSBcIi9nby9wa2dcIicsXG5cdFx0XHQnJyxcblx0XHRcdCcgICAgLSBzdG9yZV9hcnRpZmFjdHM6Jyxcblx0XHRcdCcgICAgICAgIHBhdGg6IC90bXAvdGVzdC1yZXN1bHRzJyxcblx0XHRcdCcgICAgICAgIGRlc3RpbmF0aW9uOiByYXctdGVzdC1vdXRwdXQnLFxuXHRcdFx0JycsXG5cdFx0XHQnICAgIC0gc3RvcmVfdGVzdF9yZXN1bHRzOicsXG5cdFx0XHQnICAgICAgICBwYXRoOiAvdG1wL3Rlc3QtcmVzdWx0cycsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNDkwNDA6IDQtc3BhY2UgaW5kZW50IHNob3VsZCB3aW4gb3ZlciAyLXNwYWNlIHdoZW4gcHJlZG9taW5hbnQnLCAoKSA9PiB7XG5cdFx0Ly8gRmlsZSB3aXRoIG1vc3RseSA0LXNwYWNlIGluZGVudHMgYnV0IHNvbWUgMi1zcGFjZSBpbmRlbnRzIHNob3VsZCBkZXRlY3QgYXMgNCBzcGFjZXNcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCA0LCBbXG5cdFx0XHQnZnVuY3Rpb24gZm9vKCkgeycsXG5cdFx0XHQnICAgIGxldCBhID0gMTsnLFxuXHRcdFx0JyAgICBsZXQgYiA9IDI7Jyxcblx0XHRcdCcgICAgaWYgKHRydWUpIHsnLFxuXHRcdFx0JyAgICAgICAgY29uc29sZS5sb2coYSk7Jyxcblx0XHRcdCcgICAgICAgIGNvbnNvbGUubG9nKGIpOycsXG5cdFx0XHQnICAgIH0nLFxuXHRcdFx0JyAgICBjb25zdCBvYmogPSB7Jyxcblx0XHRcdCcgICAgICB4OiAxLCcsICAvLyAyLXNwYWNlIGluZGVudCBoZXJlXG5cdFx0XHQnICAgICAgeTogMicsICAgLy8gMi1zcGFjZSBpbmRlbnQgaGVyZVxuXHRcdFx0JyAgICB9OycsXG5cdFx0XHQnICAgIHJldHVybiBvYmo7Jyxcblx0XHRcdCd9Jyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndmFsaWRhdGVQb3NpdGlvbicsICgpID0+IHtcblxuXHRcdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgb25lXFxubGluZSB0d28nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLCAwKSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDEpKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIpKSwgbmV3IFBvc2l0aW9uKDEsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMzApKSwgbmV3IFBvc2l0aW9uKDEsIDkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAwKSksIG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDEpKSwgbmV3IFBvc2l0aW9uKDIsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgMikpLCBuZXcgUG9zaXRpb24oMiwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAzMCkpLCBuZXcgUG9zaXRpb24oMiwgOSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDMsIDApKSwgbmV3IFBvc2l0aW9uKDIsIDkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMywgMSkpLCBuZXcgUG9zaXRpb24oMiwgOSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigzLCAzMCkpLCBuZXcgUG9zaXRpb24oMiwgOSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDMwLCAzMCkpLCBuZXcgUG9zaXRpb24oMiwgOSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKC0xMjMuMTIzLCAtMC41KSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKE51bWJlci5NSU5fVkFMVUUsIE51bWJlci5NSU5fVkFMVUUpKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbihOdW1iZXIuTUFYX1ZBTFVFLCBOdW1iZXIuTUFYX1ZBTFVFKSksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEyMy4yMywgNDcuNSkpLCBuZXcgUG9zaXRpb24oMiwgOSkpO1xuXG5cdFx0bS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkYXRlUG9zaXRpb24gYXJvdW5kIGhpZ2gtbG93IHN1cnJvZ2F0ZSBwYWlycyAxJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgbSA9IGNyZWF0ZVRleHRNb2RlbCgnYVx1RDgzRFx1RENEQWInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLCAwKSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDEpKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMCwgNykpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMikpLCBuZXcgUG9zaXRpb24oMSwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAzKSksIG5ldyBQb3NpdGlvbigxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDQpKSwgbmV3IFBvc2l0aW9uKDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNSkpLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAzMCkpLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDApKSwgbmV3IFBvc2l0aW9uKDEsIDUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgMSkpLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAyKSksIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDMwKSksIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oLTEyMy4xMjMsIC0wLjUpKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oTnVtYmVyLk1JTl9WQUxVRSwgTnVtYmVyLk1JTl9WQUxVRSkpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKE51bWJlci5NQVhfVkFMVUUsIE51bWJlci5NQVhfVkFMVUUpKSwgbmV3IFBvc2l0aW9uKDEsIDUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMTIzLjIzLCA0Ny41KSksIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cblx0XHRtLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndmFsaWRhdGVQb3NpdGlvbiBhcm91bmQgaGlnaC1sb3cgc3Vycm9nYXRlIHBhaXJzIDInLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtID0gY3JlYXRlVGV4dE1vZGVsKCdhXHVEODNEXHVEQ0RBXHVEODNEXHVEQ0RBYicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMikpLCBuZXcgUG9zaXRpb24oMSwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAzKSksIG5ldyBQb3NpdGlvbigxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDQpKSwgbmV3IFBvc2l0aW9uKDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNSkpLCBuZXcgUG9zaXRpb24oMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA2KSksIG5ldyBQb3NpdGlvbigxLCA2KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDcpKSwgbmV3IFBvc2l0aW9uKDEsIDcpKTtcblxuXHRcdG0uZGlzcG9zZSgpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkYXRlUG9zaXRpb24gaGFuZGxlIE5hTi4nLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtID0gY3JlYXRlVGV4dE1vZGVsKCdsaW5lIG9uZVxcbmxpbmUgdHdvJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oTmFOLCAxKSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIE5hTikpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKE5hTiwgTmFOKSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIE5hTikpLCBuZXcgUG9zaXRpb24oMiwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbihOYU4sIDMpKSwgbmV3IFBvc2l0aW9uKDEsIDMpKTtcblxuXHRcdG0uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNzE0ODA6IHZhbGlkYXRlUG9zaXRpb24gaGFuZGxlIGZsb2F0cycsICgpID0+IHtcblx0XHRjb25zdCBtID0gY3JlYXRlVGV4dE1vZGVsKCdsaW5lIG9uZVxcbmxpbmUgdHdvJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMC4yLCAxKSksIG5ldyBQb3NpdGlvbigxLCAxKSwgJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMS4yLCAxKSksIG5ldyBQb3NpdGlvbigxLCAxKSwgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMS41LCAyKSksIG5ldyBQb3NpdGlvbigxLCAyKSwgJ2MnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMS44LCAzKSksIG5ldyBQb3NpdGlvbigxLCAzKSwgJ2QnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMC4zKSksIG5ldyBQb3NpdGlvbigxLCAxKSwgJ2UnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgMC44KSksIG5ldyBQb3NpdGlvbigyLCAxKSwgJ2YnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMS4yKSksIG5ldyBQb3NpdGlvbigxLCAxKSwgJ2cnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgMS41KSksIG5ldyBQb3NpdGlvbigyLCAxKSwgJ2gnKTtcblxuXHRcdG0uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNzE0ODA6IHZhbGlkYXRlUmFuZ2UgaGFuZGxlIGZsb2F0cycsICgpID0+IHtcblx0XHRjb25zdCBtID0gY3JlYXRlVGV4dE1vZGVsKCdsaW5lIG9uZVxcbmxpbmUgdHdvJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMC4yLCAxLjUsIDAuOCwgMi41KSksIG5ldyBSYW5nZSgxLCAxLCAxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEuMiwgMS43LCAxLjgsIDIuMikpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMikpO1xuXG5cdFx0bS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkYXRlUmFuZ2UgYXJvdW5kIGhpZ2gtbG93IHN1cnJvZ2F0ZSBwYWlycyAxJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgbSA9IGNyZWF0ZVRleHRNb2RlbCgnYVx1RDgzRFx1RENEQWInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgwLCAwLCAwLCAxKSksIG5ldyBSYW5nZSgxLCAxLCAxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDAsIDAsIDAsIDcpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAxKSksIG5ldyBSYW5nZSgxLCAxLCAxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDIpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMykpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCA0KSksIG5ldyBSYW5nZSgxLCAxLCAxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDUpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDUpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAyLCAxLCAyKSksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDMpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgNCkpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAyLCAxLCA1KSksIG5ldyBSYW5nZSgxLCAyLCAxLCA1KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMywgMSwgMykpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAzLCAxLCA0KSksIG5ldyBSYW5nZSgxLCAyLCAxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDMsIDEsIDUpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDUpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCA0LCAxLCA0KSksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDQsIDEsIDUpKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCA1LCAxLCA1KSksIG5ldyBSYW5nZSgxLCA1LCAxLCA1KSk7XG5cblx0XHRtLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndmFsaWRhdGVSYW5nZSBhcm91bmQgaGlnaC1sb3cgc3Vycm9nYXRlIHBhaXJzIDInLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtID0gY3JlYXRlVGV4dE1vZGVsKCdhXHVEODNEXHVEQ0RBXHVEODNEXHVEQ0RBYicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDAsIDAsIDAsIDEpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMCwgMCwgMCwgNykpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDEpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMikpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAzKSksIG5ldyBSYW5nZSgxLCAxLCAxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDQpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgNSkpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCA2KSksIG5ldyBSYW5nZSgxLCAxLCAxLCA2KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDcpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDcpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAyLCAxLCAyKSksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDMpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgNCkpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAyLCAxLCA1KSksIG5ldyBSYW5nZSgxLCAyLCAxLCA2KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDYpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDYpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgNykpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDMsIDEsIDMpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMywgMSwgNCkpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAzLCAxLCA1KSksIG5ldyBSYW5nZSgxLCAyLCAxLCA2KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDMsIDEsIDYpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDYpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMywgMSwgNykpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDQsIDEsIDQpKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgNCwgMSwgNSkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCA0LCAxLCA2KSksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDQsIDEsIDcpKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDcpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCA1LCAxLCA1KSksIG5ldyBSYW5nZSgxLCA0LCAxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDUsIDEsIDYpKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgNSwgMSwgNykpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDYsIDEsIDYpKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDYpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgNiwgMSwgNykpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDcsIDEsIDcpKSwgbmV3IFJhbmdlKDEsIDcsIDEsIDcpKTtcblxuXHRcdG0uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RpZnlQb3NpdGlvbicsICgpID0+IHtcblxuXHRcdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgb25lXFxubGluZSB0d28nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpLCAwKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDApLCAwKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDMwLCAxKSwgMCksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpLCAxNyksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSwgMSksIG5ldyBQb3NpdGlvbigxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSwgMyksIG5ldyBQb3NpdGlvbigxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSwgMTApLCBuZXcgUG9zaXRpb24oMiwgMykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNSksIDEzKSwgbmV3IFBvc2l0aW9uKDIsIDkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIpLCAxNiksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDkpLCAtMTcpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMiksIC0xKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDQpLCAtMyksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAzKSwgLTEwKSwgbmV3IFBvc2l0aW9uKDEsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDkpLCAtMTMpLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgOSksIC0xNiksIG5ldyBQb3NpdGlvbigxLCAyKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIpLCAxNyksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSwgMTAwKSwgbmV3IFBvc2l0aW9uKDIsIDkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMiksIC0yKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIpLCAtMTAwKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDIpLCAtMTAwKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDkpLCAtMTgpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0bS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZUluZGVudGF0aW9uIDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJycsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2Vcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCdcXHQnKSwgJ1xcdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignICAgICcpLCAnXFx0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgICAnKSwgJyAgICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignICAnKSwgJyAgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgJyksICcgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIFxcdCAgICAnKSwgJ1xcdFxcdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIFxcdCAgICcpLCAnXFx0ICAgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0ICAnKSwgJ1xcdCAgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0ICcpLCAnXFx0ICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIFxcdCcpLCAnXFx0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJ1xcdGEnKSwgJ1xcdGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyAgICBhJyksICdcXHRhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgICBhJyksICcgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgIGEnKSwgJyAgYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIGEnKSwgJyBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCdhJyksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0ICAgIGEnKSwgJ1xcdFxcdGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHQgICBhJyksICdcXHQgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0ICBhJyksICdcXHQgIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHQgYScpLCAnXFx0IGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHRhJyksICdcXHRhJyk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZUluZGVudGF0aW9uIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCdcXHRhJyksICcgICAgYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignICAgIGEnKSwgJyAgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgICBhJyksICcgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgIGEnKSwgJyAgYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIGEnKSwgJyBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCdhJyksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0ICAgIGEnKSwgJyAgICAgICAgYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIFxcdCAgIGEnKSwgJyAgICAgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0ICBhJyksICcgICAgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0IGEnKSwgJyAgICAgYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIFxcdGEnKSwgJyAgICBhJyk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2FzZCcsXG5cdFx0XHQnIGFzZCcsXG5cdFx0XHQnXFx0YXNkJyxcblx0XHRcdCcgIGFzZCcsXG5cdFx0XHQnXFx0XFx0YXNkJyxcblx0XHRcdCcgJyxcblx0XHRcdCcgICcsXG5cdFx0XHQnXFx0Jyxcblx0XHRcdCdcXHRcXHQnLFxuXHRcdFx0JyAgXFx0YXNkJyxcblx0XHRcdCcnLFxuXHRcdFx0Jydcblx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDEpLCAxLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDIpLCAyLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDMpLCAyLCAnMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDQpLCAzLCAnNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDUpLCAzLCAnNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDYpLCAwLCAnNicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDcpLCAwLCAnNycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDgpLCAwLCAnOCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDkpLCAwLCAnOScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDEwKSwgNCwgJzEwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oMTEpLCAwLCAnMTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbigxMiksIDAsICcxMicpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2FzZCcsXG5cdFx0XHQnYXNkICcsXG5cdFx0XHQnYXNkXFx0Jyxcblx0XHRcdCdhc2QgICcsXG5cdFx0XHQnYXNkXFx0XFx0Jyxcblx0XHRcdCcgJyxcblx0XHRcdCcgICcsXG5cdFx0XHQnXFx0Jyxcblx0XHRcdCdcXHRcXHQnLFxuXHRcdFx0J2FzZCAgXFx0Jyxcblx0XHRcdCcnLFxuXHRcdFx0Jydcblx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4oMSksIDQsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbigyKSwgNCwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDMpLCA0LCAnMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4oNCksIDQsICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbig1KSwgNCwgJzUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDYpLCAwLCAnNicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4oNyksIDAsICc3Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbig4KSwgMCwgJzgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDkpLCAwLCAnOScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4oMTApLCA0LCAnMTAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDExKSwgMCwgJzExJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbigxMiksIDAsICcxMicpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCcjNTA0NzEuIGdldFZhbHVlSW5SYW5nZSB3aXRoIGludmFsaWQgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbSA9IGNyZWF0ZVRleHRNb2RlbCgnTXkgRmlyc3QgTGluZVxcclxcbk15IFNlY29uZCBMaW5lXFxyXFxuTXkgVGhpcmQgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgTmFOLCAxLCAzKSksICdNeScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoTmFOLCBOYU4sIE5hTiwgTmFOKSksICcnKTtcblx0XHRtLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2ODgzNjogdXBkYXRpbmcgdGFiU2l6ZSBzaG91bGQgYWxzbyB1cGRhdGUgaW5kZW50U2l6ZSB3aGVuIGluZGVudFNpemUgaXMgc2V0IHRvIFwidGFiU2l6ZVwiJywgKCkgPT4ge1xuXHRcdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwoJ3NvbWUgdGV4dCcsIG51bGwsIHtcblx0XHRcdHRhYlNpemU6IDIsXG5cdFx0XHRpbmRlbnRTaXplOiAndGFiU2l6ZSdcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRPcHRpb25zKCkudGFiU2l6ZSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0T3B0aW9ucygpLmluZGVudFNpemUsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldE9wdGlvbnMoKS5vcmlnaW5hbEluZGVudFNpemUsICd0YWJTaXplJyk7XG5cdFx0bS51cGRhdGVPcHRpb25zKHtcblx0XHRcdHRhYlNpemU6IDRcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRPcHRpb25zKCkudGFiU2l6ZSwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0T3B0aW9ucygpLmluZGVudFNpemUsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldE9wdGlvbnMoKS5vcmlnaW5hbEluZGVudFNpemUsICd0YWJTaXplJyk7XG5cdFx0bS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdUZXh0TW9kZWwubWlnaHRDb250YWluUlRMJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ25vcGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkIScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5taWdodENvbnRhaW5SVEwoKSwgZmFsc2UpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgneWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdIZWxsbyxcXG5cdTA1RDZcdTA1RDVcdTA1RDRcdTA1RDkgXHUwNUUyXHUwNUQ1XHUwNUQxXHUwNUQzXHUwNUQ0IFx1MDVERVx1MDVEMVx1MDVENVx1MDVFMVx1MDVFMVx1MDVFQSBcdTA1RTlcdTA1RDNcdTA1RTJcdTA1RUFcdTA1RDUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubWlnaHRDb250YWluUlRMKCksIHRydWUpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0VmFsdWUgcmVzZXRzIDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkIScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5taWdodENvbnRhaW5SVEwoKSwgZmFsc2UpO1xuXHRcdG1vZGVsLnNldFZhbHVlKCdIZWxsbyxcXG5cdTA1RDZcdTA1RDVcdTA1RDRcdTA1RDkgXHUwNUUyXHUwNUQ1XHUwNUQxXHUwNUQzXHUwNUQ0IFx1MDVERVx1MDVEMVx1MDVENVx1MDVFMVx1MDVFMVx1MDVFQSBcdTA1RTlcdTA1RDNcdTA1RTJcdTA1RUFcdTA1RDUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubWlnaHRDb250YWluUlRMKCksIHRydWUpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0VmFsdWUgcmVzZXRzIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ0hlbGxvLFxcblx1MDY0N1x1MDY0Nlx1MDYyN1x1MDY0MyBcdTA2MkRcdTA2NDJcdTA2NEFcdTA2NDJcdTA2MjkgXHUwNjQ1XHUwNjJCXHUwNjI4XHUwNjJBXHUwNjI5IFx1MDY0NVx1MDY0Nlx1MDYzMCBcdTA2MzJcdTA2NDVcdTA2NDYgXHUwNjM3XHUwNjQ4XHUwNjRBXHUwNjQ0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm1pZ2h0Q29udGFpblJUTCgpLCB0cnVlKTtcblx0XHRtb2RlbC5zZXRWYWx1ZSgnaGVsbG8gd29ybGQhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm1pZ2h0Q29udGFpblJUTCgpLCBmYWxzZSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdUZXh0TW9kZWwuY3JlYXRlU25hcHNob3QnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1wdHkgZmlsZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnJyk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBtb2RlbC5jcmVhdGVTbmFwc2hvdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdC5yZWFkKCksIG51bGwpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSB3aXRoIEJPTScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChVVEY4X0JPTV9DSEFSQUNURVIgKyAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdIZWxsbycpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbW9kZWwuY3JlYXRlU25hcHNob3QodHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90LnJlYWQoKSwgVVRGOF9CT01fQ0hBUkFDVEVSICsgJ0hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90LnJlYWQoKSwgbnVsbCk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWd1bGFyIGZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ015IEZpcnN0IExpbmVcXG5cXHRcXHRNeSBTZWNvbmQgTGluZVxcbiAgICBUaGlyZCBMaW5lXFxuXFxuMScpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbW9kZWwuY3JlYXRlU25hcHNob3QoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25hcHNob3QucmVhZCgpLCAnTXkgRmlyc3QgTGluZVxcblxcdFxcdE15IFNlY29uZCBMaW5lXFxuICAgIFRoaXJkIExpbmVcXG5cXG4xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90LnJlYWQoKSwgbnVsbCk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXJnZSBmaWxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTAwMDsgaSsrKSB7XG5cdFx0XHRsaW5lc1tpXSA9ICdKdXN0IHNvbWUgdGV4dCB0aGF0IGlzIGEgYml0IGxvbmcgc3VjaCB0aGF0IGl0IGNhbiBjb25zdW1lIHNvbWUgbWVtb3J5Jztcblx0XHR9XG5cdFx0Y29uc3QgdGV4dCA9IGxpbmVzLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGV4dCk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBtb2RlbC5jcmVhdGVTbmFwc2hvdCgpO1xuXHRcdGxldCBhY3R1YWwgPSAnJztcblxuXHRcdC8vIDcwOTk5IGxlbmd0aCA9PiBhdCBtb3N0IDIgcmVhZCBjYWxscyBhcmUgbmVjZXNzYXJ5XG5cdFx0Y29uc3QgdG1wMSA9IHNuYXBzaG90LnJlYWQoKTtcblx0XHRhc3NlcnQub2sodG1wMSk7XG5cdFx0YWN0dWFsICs9IHRtcDE7XG5cblx0XHRjb25zdCB0bXAyID0gc25hcHNob3QucmVhZCgpO1xuXHRcdGlmICh0bXAyID09PSBudWxsKSB7XG5cdFx0XHQvLyBhbGwgZ29vZFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3R1YWwgKz0gdG1wMjtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdC5yZWFkKCksIG51bGwpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIHRleHQpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE5NjMyOiBpbnZhbGlkIHJhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCEnKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5fdmFsaWRhdGVSYW5nZVJlbGF4ZWROb0FsbG9jYXRpb25zKG5ldyBSYW5nZSg8YW55PnVuZGVmaW5lZCwgMCwgPGFueT51bmRlZmluZWQsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxXQUFXLHdCQUF3QjtBQUM1QyxTQUFTLHFCQUFxQix1QkFBdUI7QUFHckQsU0FBUyxxQkFBcUIscUJBQThCLGdCQUF3QixzQkFBK0IsaUJBQXlCLE1BQWdCLEtBQW9CO0FBQy9LLFFBQU0sSUFBSTtBQUFBLElBQ1QsS0FBSyxLQUFLLElBQUk7QUFBQSxJQUNkO0FBQUEsSUFDQTtBQUFBLE1BQ0MsU0FBUztBQUFBLE1BQ1QsY0FBYztBQUFBLE1BQ2QsbUJBQW1CO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQ0EsUUFBTSxJQUFJLEVBQUUsV0FBVztBQUN2QixJQUFFLFFBQVE7QUFFVixTQUFPLFlBQVksRUFBRSxjQUFjLHNCQUFzQixHQUFHO0FBQzVELFNBQU8sWUFBWSxFQUFFLFNBQVMsaUJBQWlCLEdBQUc7QUFDbkQ7QUFFQSxTQUFTLFlBQVksc0JBQTJDLGlCQUFnRCxNQUFnQixLQUFvQjtBQUNuSixNQUFJLE9BQU8seUJBQXlCLGFBQWE7QUFFaEQsUUFBSSxPQUFPLG9CQUFvQixhQUFhO0FBRTNDLDJCQUFxQixNQUFNLE9BQU8sTUFBTSxPQUFPLE1BQU0s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LE1BQ0E7QUFBQSxJQUNELEdBQUcsVUFBVTtBQUNiLGdCQUFZLE1BQU0sR0FBRztBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsVUFBVTtBQUNiLGdCQUFZLE1BQU0sR0FBRztBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsZUFBZTtBQUNsQixnQkFBWSxNQUFNLEdBQUc7QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxLQUFLO0FBRVIsZ0JBQVksTUFBTSxHQUFHO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxLQUFLO0FBQ1IsZ0JBQVksTUFBTSxHQUFHO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxVQUFVO0FBQ2IsZ0JBQVksTUFBTSxHQUFHO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtB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
