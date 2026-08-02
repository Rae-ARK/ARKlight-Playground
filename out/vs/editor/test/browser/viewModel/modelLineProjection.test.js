import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import * as languages from "../../../common/languages.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { ModelLineProjectionData } from "../../../common/modelLineProjectionData.js";
import { createModelLineProjection } from "../../../common/viewModel/modelLineProjection.js";
import { MonospaceLineBreaksComputerFactory } from "../../../common/viewModel/monospaceLineBreaksComputer.js";
import { ViewModelLinesFromProjectedModel } from "../../../common/viewModel/viewModelLines.js";
import { TestConfiguration } from "../config/testConfiguration.js";
import { createTextModel } from "../../common/testTextModel.js";
suite("Editor ViewModel - SplitLinesCollection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("SplitLine", () => {
    let model1 = createModel("My First LineMy Second LineAnd another one");
    let line1 = createSplitLine([13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 0);
    assert.strictEqual(line1.getViewLineCount(), 3);
    assert.strictEqual(line1.getViewLineContent(model1, 1, 0), "My First Line");
    assert.strictEqual(line1.getViewLineContent(model1, 1, 1), "My Second Line");
    assert.strictEqual(line1.getViewLineContent(model1, 1, 2), "And another one");
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 0), 14);
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 1), 15);
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 2), 16);
    for (let col = 1; col <= 14; col++) {
      assert.strictEqual(line1.getModelColumnOfViewPosition(0, col), col, "getInputColumnOfOutputPosition(0, " + col + ")");
    }
    for (let col = 1; col <= 15; col++) {
      assert.strictEqual(line1.getModelColumnOfViewPosition(1, col), 13 + col, "getInputColumnOfOutputPosition(1, " + col + ")");
    }
    for (let col = 1; col <= 16; col++) {
      assert.strictEqual(line1.getModelColumnOfViewPosition(2, col), 13 + 14 + col, "getInputColumnOfOutputPosition(2, " + col + ")");
    }
    for (let col = 1; col <= 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(0, col), "getOutputPositionOfInputPosition(" + col + ")");
    }
    for (let col = 1 + 13; col <= 14 + 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(1, col - 13), "getOutputPositionOfInputPosition(" + col + ")");
    }
    for (let col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(2, col - 13 - 14), "getOutputPositionOfInputPosition(" + col + ")");
    }
    model1 = createModel("My First LineMy Second LineAnd another one");
    line1 = createSplitLine([13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 4);
    assert.strictEqual(line1.getViewLineCount(), 3);
    assert.strictEqual(line1.getViewLineContent(model1, 1, 0), "My First Line");
    assert.strictEqual(line1.getViewLineContent(model1, 1, 1), "    My Second Line");
    assert.strictEqual(line1.getViewLineContent(model1, 1, 2), "    And another one");
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 0), 14);
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 1), 19);
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 2), 20);
    const actualViewColumnMapping = [];
    for (let lineIndex = 0; lineIndex < line1.getViewLineCount(); lineIndex++) {
      const actualLineViewColumnMapping = [];
      for (let col = 1; col <= line1.getViewLineMaxColumn(model1, 1, lineIndex); col++) {
        actualLineViewColumnMapping.push(line1.getModelColumnOfViewPosition(lineIndex, col));
      }
      actualViewColumnMapping.push(actualLineViewColumnMapping);
    }
    assert.deepStrictEqual(actualViewColumnMapping, [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      [14, 14, 14, 14, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
      [28, 28, 28, 28, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43]
    ]);
    for (let col = 1; col <= 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(0, col), "6.getOutputPositionOfInputPosition(" + col + ")");
    }
    for (let col = 1 + 13; col <= 14 + 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(1, 4 + col - 13), "7.getOutputPositionOfInputPosition(" + col + ")");
    }
    for (let col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(2, 4 + col - 13 - 14), "8.getOutputPositionOfInputPosition(" + col + ")");
    }
  });
  function withSplitLinesCollection(text, callback) {
    const config = new TestConfiguration({});
    const wrappingInfo = config.options.get(EditorOption.wrappingInfo);
    const fontInfo = config.options.get(EditorOption.fontInfo);
    const wordWrapBreakAfterCharacters = config.options.get(EditorOption.wordWrapBreakAfterCharacters);
    const wordWrapBreakBeforeCharacters = config.options.get(EditorOption.wordWrapBreakBeforeCharacters);
    const wrappingIndent = config.options.get(EditorOption.wrappingIndent);
    const wordBreak = config.options.get(EditorOption.wordBreak);
    const wrapOnEscapedLineFeeds = config.options.get(EditorOption.wrapOnEscapedLineFeeds);
    const lineBreaksComputerFactory = new MonospaceLineBreaksComputerFactory(wordWrapBreakBeforeCharacters, wordWrapBreakAfterCharacters);
    const model = createTextModel(text);
    const linesCollection = new ViewModelLinesFromProjectedModel(
      1,
      model,
      lineBreaksComputerFactory,
      lineBreaksComputerFactory,
      fontInfo,
      model.getOptions().tabSize,
      "simple",
      wrappingInfo.wrappingColumn,
      wrappingIndent,
      wordBreak,
      wrapOnEscapedLineFeeds
    );
    callback(model, linesCollection);
    linesCollection.dispose();
    model.dispose();
    config.dispose();
  }
  test("Invalid line numbers", () => {
    const text = [
      "int main() {",
      '	printf("Hello world!");',
      "}",
      "int main() {",
      '	printf("Hello world!");',
      "}"
    ].join("\n");
    withSplitLinesCollection(text, (model, linesCollection) => {
      assert.strictEqual(linesCollection.getViewLineCount(), 6);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(-1, -1), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(0, 0), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(1, 1), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(2, 2), [1]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(3, 3), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(4, 4), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(5, 5), [1]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(6, 6), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(7, 7), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(0, 7), [0, 1, 0, 0, 1, 0]);
      assert.strictEqual(linesCollection.getViewLineContent(-1), "int main() {");
      assert.strictEqual(linesCollection.getViewLineContent(0), "int main() {");
      assert.strictEqual(linesCollection.getViewLineContent(1), "int main() {");
      assert.strictEqual(linesCollection.getViewLineContent(2), '	printf("Hello world!");');
      assert.strictEqual(linesCollection.getViewLineContent(3), "}");
      assert.strictEqual(linesCollection.getViewLineContent(4), "int main() {");
      assert.strictEqual(linesCollection.getViewLineContent(5), '	printf("Hello world!");');
      assert.strictEqual(linesCollection.getViewLineContent(6), "}");
      assert.strictEqual(linesCollection.getViewLineContent(7), "}");
      assert.strictEqual(linesCollection.getViewLineMinColumn(-1), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(0), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(1), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(2), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(3), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(4), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(5), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(6), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(7), 1);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(-1), 13);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(0), 13);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(1), 13);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(2), 25);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(3), 2);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(4), 13);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(5), 25);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(6), 2);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(7), 2);
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(-1, 1), new Position(1, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(0, 1), new Position(1, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(1, 1), new Position(1, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(2, 1), new Position(2, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(3, 1), new Position(3, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(4, 1), new Position(4, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(5, 1), new Position(5, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(6, 1), new Position(6, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(7, 1), new Position(6, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(8, 1), new Position(6, 1));
    });
  });
  test("issue #3662", () => {
    const text = [
      "int main() {",
      '	printf("Hello world!");',
      "}",
      "int main() {",
      '	printf("Hello world!");',
      "}"
    ].join("\n");
    withSplitLinesCollection(text, (model, linesCollection) => {
      linesCollection.setHiddenAreas([
        new Range(1, 1, 3, 1),
        new Range(5, 1, 6, 1)
      ]);
      const viewLineCount = linesCollection.getViewLineCount();
      assert.strictEqual(viewLineCount, 1, "getOutputLineCount()");
      const modelLineCount = model.getLineCount();
      for (let lineNumber = 0; lineNumber <= modelLineCount + 1; lineNumber++) {
        const lineMinColumn = lineNumber >= 1 && lineNumber <= modelLineCount ? model.getLineMinColumn(lineNumber) : 1;
        const lineMaxColumn = lineNumber >= 1 && lineNumber <= modelLineCount ? model.getLineMaxColumn(lineNumber) : 1;
        for (let column = lineMinColumn - 1; column <= lineMaxColumn + 1; column++) {
          const viewPosition = linesCollection.convertModelPositionToViewPosition(lineNumber, column);
          let viewLineNumber = viewPosition.lineNumber;
          let viewColumn = viewPosition.column;
          if (viewLineNumber < 1) {
            viewLineNumber = 1;
          }
          const lineCount = linesCollection.getViewLineCount();
          if (viewLineNumber > lineCount) {
            viewLineNumber = lineCount;
          }
          const viewMinColumn = linesCollection.getViewLineMinColumn(viewLineNumber);
          const viewMaxColumn = linesCollection.getViewLineMaxColumn(viewLineNumber);
          if (viewColumn < viewMinColumn) {
            viewColumn = viewMinColumn;
          }
          if (viewColumn > viewMaxColumn) {
            viewColumn = viewMaxColumn;
          }
          const validViewPosition = new Position(viewLineNumber, viewColumn);
          assert.strictEqual(viewPosition.toString(), validViewPosition.toString(), "model->view for " + lineNumber + ", " + column);
        }
      }
      for (let lineNumber = 0; lineNumber <= viewLineCount + 1; lineNumber++) {
        const lineMinColumn = linesCollection.getViewLineMinColumn(lineNumber);
        const lineMaxColumn = linesCollection.getViewLineMaxColumn(lineNumber);
        for (let column = lineMinColumn - 1; column <= lineMaxColumn + 1; column++) {
          const modelPosition = linesCollection.convertViewPositionToModelPosition(lineNumber, column);
          const validModelPosition = model.validatePosition(modelPosition);
          assert.strictEqual(modelPosition.toString(), validModelPosition.toString(), "view->model for " + lineNumber + ", " + column);
        }
      }
    });
  });
});
suite("SplitLinesCollection", () => {
  const _text = [
    "class Nice {",
    "	function hi() {",
    '		console.log("Hello world");',
    "	}",
    "	function hello() {",
    '		console.log("Hello world, this is a somewhat longer line");',
    "	}",
    "}"
  ];
  const _tokens = [
    [
      { startIndex: 0, value: 1 },
      { startIndex: 5, value: 2 },
      { startIndex: 6, value: 3 },
      { startIndex: 10, value: 4 }
    ],
    [
      { startIndex: 0, value: 5 },
      { startIndex: 1, value: 6 },
      { startIndex: 9, value: 7 },
      { startIndex: 10, value: 8 },
      { startIndex: 12, value: 9 }
    ],
    [
      { startIndex: 0, value: 10 },
      { startIndex: 2, value: 11 },
      { startIndex: 9, value: 12 },
      { startIndex: 10, value: 13 },
      { startIndex: 13, value: 14 },
      { startIndex: 14, value: 15 },
      { startIndex: 27, value: 16 }
    ],
    [
      { startIndex: 0, value: 17 }
    ],
    [
      { startIndex: 0, value: 18 },
      { startIndex: 1, value: 19 },
      { startIndex: 9, value: 20 },
      { startIndex: 10, value: 21 },
      { startIndex: 15, value: 22 }
    ],
    [
      { startIndex: 0, value: 23 },
      { startIndex: 2, value: 24 },
      { startIndex: 9, value: 25 },
      { startIndex: 10, value: 26 },
      { startIndex: 13, value: 27 },
      { startIndex: 14, value: 28 },
      { startIndex: 59, value: 29 }
    ],
    [
      { startIndex: 0, value: 30 }
    ],
    [
      { startIndex: 0, value: 31 }
    ]
  ];
  let model;
  let languageRegistration;
  setup(() => {
    let _lineIndex = 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        const tokens = _tokens[_lineIndex++];
        const result = new Uint32Array(2 * tokens.length);
        for (let i = 0; i < tokens.length; i++) {
          result[2 * i] = tokens[i].startIndex;
          result[2 * i + 1] = tokens[i].value << MetadataConsts.FOREGROUND_OFFSET;
        }
        return new languages.EncodedTokenizationResult(result, [], state);
      }
    };
    const LANGUAGE_ID = "modelModeTest1";
    languageRegistration = languages.TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
    model = createTextModel(_text.join("\n"), LANGUAGE_ID);
    model.tokenization.forceTokenization(model.getLineCount());
  });
  teardown(() => {
    model.dispose();
    languageRegistration.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertViewLineTokens(_actual, expected) {
    const actual = [];
    for (let i = 0, len = _actual.getCount(); i < len; i++) {
      actual[i] = {
        endIndex: _actual.getEndOffset(i),
        value: _actual.getForeground(i)
      };
    }
    assert.deepStrictEqual(actual, expected);
  }
  function assertMinimapLineRenderingData(actual, expected) {
    if (actual === null && expected === null) {
      assert.ok(true);
      return;
    }
    if (expected === null) {
      assert.ok(false);
    }
    assert.strictEqual(actual.content, expected.content);
    assert.strictEqual(actual.minColumn, expected.minColumn);
    assert.strictEqual(actual.maxColumn, expected.maxColumn);
    assertViewLineTokens(actual.tokens, expected.tokens);
  }
  function assertMinimapLinesRenderingData(actual, expected) {
    assert.strictEqual(actual.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      assertMinimapLineRenderingData(actual[i], expected[i]);
    }
  }
  function assertAllMinimapLinesRenderingData(splitLinesCollection, all) {
    const lineCount = all.length;
    for (let line = 1; line <= lineCount; line++) {
      assert.strictEqual(splitLinesCollection.getViewLineData(line).content, splitLinesCollection.getViewLineContent(line));
    }
    for (let start = 1; start <= lineCount; start++) {
      for (let end = start; end <= lineCount; end++) {
        const count = end - start + 1;
        for (let desired = Math.pow(2, count) - 1; desired >= 0; desired--) {
          const needed = [];
          const expected = [];
          for (let i = 0; i < count; i++) {
            needed[i] = desired & 1 << i ? true : false;
            expected[i] = needed[i] ? all[start - 1 + i] : null;
          }
          const actual = splitLinesCollection.getViewLinesData(start, end, needed);
          assertMinimapLinesRenderingData(actual, expected);
          break;
        }
      }
    }
  }
  test("getViewLinesData - no wrapping", () => {
    withSplitLinesCollection(model, "off", 0, false, (splitLinesCollection) => {
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 8);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);
      const _expected = [
        {
          content: "class Nice {",
          minColumn: 1,
          maxColumn: 13,
          tokens: [
            { endIndex: 5, value: 1 },
            { endIndex: 6, value: 2 },
            { endIndex: 10, value: 3 },
            { endIndex: 12, value: 4 }
          ]
        },
        {
          content: "	function hi() {",
          minColumn: 1,
          maxColumn: 17,
          tokens: [
            { endIndex: 1, value: 5 },
            { endIndex: 9, value: 6 },
            { endIndex: 10, value: 7 },
            { endIndex: 12, value: 8 },
            { endIndex: 16, value: 9 }
          ]
        },
        {
          content: '		console.log("Hello world");',
          minColumn: 1,
          maxColumn: 30,
          tokens: [
            { endIndex: 2, value: 10 },
            { endIndex: 9, value: 11 },
            { endIndex: 10, value: 12 },
            { endIndex: 13, value: 13 },
            { endIndex: 14, value: 14 },
            { endIndex: 27, value: 15 },
            { endIndex: 29, value: 16 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 17 }
          ]
        },
        {
          content: "	function hello() {",
          minColumn: 1,
          maxColumn: 20,
          tokens: [
            { endIndex: 1, value: 18 },
            { endIndex: 9, value: 19 },
            { endIndex: 10, value: 20 },
            { endIndex: 15, value: 21 },
            { endIndex: 19, value: 22 }
          ]
        },
        {
          content: '		console.log("Hello world, this is a somewhat longer line");',
          minColumn: 1,
          maxColumn: 62,
          tokens: [
            { endIndex: 2, value: 23 },
            { endIndex: 9, value: 24 },
            { endIndex: 10, value: 25 },
            { endIndex: 13, value: 26 },
            { endIndex: 14, value: 27 },
            { endIndex: 59, value: 28 },
            { endIndex: 61, value: 29 }
          ]
        },
        {
          minColumn: 1,
          maxColumn: 3,
          content: "	}",
          tokens: [
            { endIndex: 2, value: 30 }
          ]
        },
        {
          minColumn: 1,
          maxColumn: 2,
          content: "}",
          tokens: [
            { endIndex: 1, value: 31 }
          ]
        }
      ];
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[1],
        _expected[2],
        _expected[3],
        _expected[4],
        _expected[5],
        _expected[6],
        _expected[7]
      ]);
      splitLinesCollection.setHiddenAreas([new Range(2, 1, 4, 1)]);
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 5);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[4],
        _expected[5],
        _expected[6],
        _expected[7]
      ]);
    });
  });
  test("getViewLinesData - with wrapping", () => {
    withSplitLinesCollection(model, "wordWrapColumn", 30, false, (splitLinesCollection) => {
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 12);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);
      const _expected = [
        {
          content: "class Nice {",
          minColumn: 1,
          maxColumn: 13,
          tokens: [
            { endIndex: 5, value: 1 },
            { endIndex: 6, value: 2 },
            { endIndex: 10, value: 3 },
            { endIndex: 12, value: 4 }
          ]
        },
        {
          content: "	function hi() {",
          minColumn: 1,
          maxColumn: 17,
          tokens: [
            { endIndex: 1, value: 5 },
            { endIndex: 9, value: 6 },
            { endIndex: 10, value: 7 },
            { endIndex: 12, value: 8 },
            { endIndex: 16, value: 9 }
          ]
        },
        {
          content: '		console.log("Hello ',
          minColumn: 1,
          maxColumn: 22,
          tokens: [
            { endIndex: 2, value: 10 },
            { endIndex: 9, value: 11 },
            { endIndex: 10, value: 12 },
            { endIndex: 13, value: 13 },
            { endIndex: 14, value: 14 },
            { endIndex: 21, value: 15 }
          ]
        },
        {
          content: '            world");',
          minColumn: 13,
          maxColumn: 21,
          tokens: [
            { endIndex: 18, value: 15 },
            { endIndex: 20, value: 16 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 17 }
          ]
        },
        {
          content: "	function hello() {",
          minColumn: 1,
          maxColumn: 20,
          tokens: [
            { endIndex: 1, value: 18 },
            { endIndex: 9, value: 19 },
            { endIndex: 10, value: 20 },
            { endIndex: 15, value: 21 },
            { endIndex: 19, value: 22 }
          ]
        },
        {
          content: '		console.log("Hello ',
          minColumn: 1,
          maxColumn: 22,
          tokens: [
            { endIndex: 2, value: 23 },
            { endIndex: 9, value: 24 },
            { endIndex: 10, value: 25 },
            { endIndex: 13, value: 26 },
            { endIndex: 14, value: 27 },
            { endIndex: 21, value: 28 }
          ]
        },
        {
          content: "            world, this is a ",
          minColumn: 13,
          maxColumn: 30,
          tokens: [
            { endIndex: 29, value: 28 }
          ]
        },
        {
          content: "            somewhat longer ",
          minColumn: 13,
          maxColumn: 29,
          tokens: [
            { endIndex: 28, value: 28 }
          ]
        },
        {
          content: '            line");',
          minColumn: 13,
          maxColumn: 20,
          tokens: [
            { endIndex: 17, value: 28 },
            { endIndex: 19, value: 29 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 30 }
          ]
        },
        {
          content: "}",
          minColumn: 1,
          maxColumn: 2,
          tokens: [
            { endIndex: 1, value: 31 }
          ]
        }
      ];
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[1],
        _expected[2],
        _expected[3],
        _expected[4],
        _expected[5],
        _expected[6],
        _expected[7],
        _expected[8],
        _expected[9],
        _expected[10],
        _expected[11]
      ]);
      splitLinesCollection.setHiddenAreas([new Range(2, 1, 4, 1)]);
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 8);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[5],
        _expected[6],
        _expected[7],
        _expected[8],
        _expected[9],
        _expected[10],
        _expected[11]
      ]);
    });
  });
  test("getViewLinesData - with wrapping and injected text", () => {
    model.deltaDecorations([], [{
      range: new Range(1, 9, 1, 9),
      options: {
        description: "example",
        after: {
          content: "very very long injected text that causes a line break",
          inlineClassName: "myClassName"
        },
        showIfCollapsed: true
      }
    }]);
    withSplitLinesCollection(model, "wordWrapColumn", 30, false, (splitLinesCollection) => {
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 14);
      assert.strictEqual(splitLinesCollection.getViewLineMaxColumn(1), 24);
      const _expected = [
        {
          content: "class Nivery very long ",
          minColumn: 1,
          maxColumn: 24,
          tokens: [
            { endIndex: 5, value: 1 },
            { endIndex: 6, value: 2 },
            { endIndex: 8, value: 3 },
            { endIndex: 23, value: 1 }
          ]
        },
        {
          content: "    injected text that causes ",
          minColumn: 5,
          maxColumn: 31,
          tokens: [{ endIndex: 30, value: 1 }]
        },
        {
          content: "    a line breakce {",
          minColumn: 5,
          maxColumn: 21,
          tokens: [
            { endIndex: 16, value: 1 },
            { endIndex: 18, value: 3 },
            { endIndex: 20, value: 4 }
          ]
        },
        {
          content: "	function hi() {",
          minColumn: 1,
          maxColumn: 17,
          tokens: [
            { endIndex: 1, value: 5 },
            { endIndex: 9, value: 6 },
            { endIndex: 10, value: 7 },
            { endIndex: 12, value: 8 },
            { endIndex: 16, value: 9 }
          ]
        },
        {
          content: '		console.log("Hello ',
          minColumn: 1,
          maxColumn: 22,
          tokens: [
            { endIndex: 2, value: 10 },
            { endIndex: 9, value: 11 },
            { endIndex: 10, value: 12 },
            { endIndex: 13, value: 13 },
            { endIndex: 14, value: 14 },
            { endIndex: 21, value: 15 }
          ]
        },
        {
          content: '            world");',
          minColumn: 13,
          maxColumn: 21,
          tokens: [
            { endIndex: 18, value: 15 },
            { endIndex: 20, value: 16 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 17 }
          ]
        },
        {
          content: "	function hello() {",
          minColumn: 1,
          maxColumn: 20,
          tokens: [
            { endIndex: 1, value: 18 },
            { endIndex: 9, value: 19 },
            { endIndex: 10, value: 20 },
            { endIndex: 15, value: 21 },
            { endIndex: 19, value: 22 }
          ]
        },
        {
          content: '		console.log("Hello ',
          minColumn: 1,
          maxColumn: 22,
          tokens: [
            { endIndex: 2, value: 23 },
            { endIndex: 9, value: 24 },
            { endIndex: 10, value: 25 },
            { endIndex: 13, value: 26 },
            { endIndex: 14, value: 27 },
            { endIndex: 21, value: 28 }
          ]
        },
        {
          content: "            world, this is a ",
          minColumn: 13,
          maxColumn: 30,
          tokens: [
            { endIndex: 29, value: 28 }
          ]
        },
        {
          content: "            somewhat longer ",
          minColumn: 13,
          maxColumn: 29,
          tokens: [
            { endIndex: 28, value: 28 }
          ]
        },
        {
          content: '            line");',
          minColumn: 13,
          maxColumn: 20,
          tokens: [
            { endIndex: 17, value: 28 },
            { endIndex: 19, value: 29 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 30 }
          ]
        },
        {
          content: "}",
          minColumn: 1,
          maxColumn: 2,
          tokens: [
            { endIndex: 1, value: 31 }
          ]
        }
      ];
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[1],
        _expected[2],
        _expected[3],
        _expected[4],
        _expected[5],
        _expected[6],
        _expected[7],
        _expected[8],
        _expected[9],
        _expected[10],
        _expected[11]
      ]);
      const data = splitLinesCollection.getViewLinesData(1, 14, new Array(14).fill(true));
      assert.deepStrictEqual(
        data.map((d) => ({
          inlineDecorations: d.inlineDecorations?.map((d2) => ({
            startOffset: d2.range.startColumn - 1,
            endOffset: d2.range.endColumn - 1
          }))
        })),
        [
          { inlineDecorations: [{ startOffset: 8, endOffset: 23 }] },
          { inlineDecorations: [{ startOffset: 4, endOffset: 30 }] },
          { inlineDecorations: [{ startOffset: 4, endOffset: 16 }] },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 }
        ]
      );
    });
  });
  function withSplitLinesCollection(model2, wordWrap, wordWrapColumn, wrapOnEscapedLineFeeds, callback) {
    const configuration = new TestConfiguration({
      wordWrap,
      wordWrapColumn,
      wrappingIndent: "indent"
    });
    const wrappingInfo = configuration.options.get(EditorOption.wrappingInfo);
    const fontInfo = configuration.options.get(EditorOption.fontInfo);
    const wordWrapBreakAfterCharacters = configuration.options.get(EditorOption.wordWrapBreakAfterCharacters);
    const wordWrapBreakBeforeCharacters = configuration.options.get(EditorOption.wordWrapBreakBeforeCharacters);
    const wrappingIndent = configuration.options.get(EditorOption.wrappingIndent);
    const wordBreak = configuration.options.get(EditorOption.wordBreak);
    const lineBreaksComputerFactory = new MonospaceLineBreaksComputerFactory(wordWrapBreakBeforeCharacters, wordWrapBreakAfterCharacters);
    const linesCollection = new ViewModelLinesFromProjectedModel(
      1,
      model2,
      lineBreaksComputerFactory,
      lineBreaksComputerFactory,
      fontInfo,
      model2.getOptions().tabSize,
      "simple",
      wrappingInfo.wrappingColumn,
      wrappingIndent,
      wordBreak,
      wrapOnEscapedLineFeeds
    );
    callback(linesCollection);
    configuration.dispose();
  }
});
function pos(lineNumber, column) {
  return new Position(lineNumber, column);
}
function createSplitLine(splitLengths, breakingOffsetsVisibleColumn, wrappedTextIndentWidth, isVisible = true) {
  return createModelLineProjection(createLineBreakData(splitLengths, breakingOffsetsVisibleColumn, wrappedTextIndentWidth), isVisible);
}
function createLineBreakData(breakingLengths, breakingOffsetsVisibleColumn, wrappedTextIndentWidth) {
  const sums = [];
  for (let i = 0; i < breakingLengths.length; i++) {
    sums[i] = (i > 0 ? sums[i - 1] : 0) + breakingLengths[i];
  }
  return new ModelLineProjectionData(null, null, sums, breakingOffsetsVisibleColumn, wrappedTextIndentWidth);
}
function createModel(text) {
  return {
    tokenization: {
      getLineTokens: (lineNumber) => {
        return null;
      }
    },
    getLineContent: (lineNumber) => {
      return text;
    },
    getLineLength: (lineNumber) => {
      return text.length;
    },
    getLineMinColumn: (lineNumber) => {
      return 1;
    },
    getLineMaxColumn: (lineNumber) => {
      return text.length + 1;
    },
    getValueInRange: (range, eol) => {
      return text.substring(range.startColumn - 1, range.endColumn - 1);
    }
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvdmlld01vZGVsL21vZGVsTGluZVByb2plY3Rpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE1ldGFkYXRhQ29uc3RzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgTnVsbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lUHJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsTGluZVByb2plY3Rpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsTGluZVByb2plY3Rpb25EYXRhLmpzJztcbmltcG9ydCB7IElWaWV3TGluZVRva2VucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBWaWV3TGluZURhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbExpbmVQcm9qZWN0aW9uLCBJU2ltcGxlTW9kZWwsIGNyZWF0ZU1vZGVsTGluZVByb2plY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL21vZGVsTGluZVByb2plY3Rpb24uanMnO1xuaW1wb3J0IHsgTW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvbW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyLmpzJztcbmltcG9ydCB7IFZpZXdNb2RlbExpbmVzRnJvbVByb2plY3RlZE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxMaW5lcy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbmZpZy90ZXN0Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5cbnN1aXRlKCdFZGl0b3IgVmlld01vZGVsIC0gU3BsaXRMaW5lc0NvbGxlY3Rpb24nLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnU3BsaXRMaW5lJywgKCkgPT4ge1xuXHRcdGxldCBtb2RlbDEgPSBjcmVhdGVNb2RlbCgnTXkgRmlyc3QgTGluZU15IFNlY29uZCBMaW5lQW5kIGFub3RoZXIgb25lJyk7XG5cdFx0bGV0IGxpbmUxID0gY3JlYXRlU3BsaXRMaW5lKFsxMywgMTQsIDE1XSwgWzEzLCAxMyArIDE0LCAxMyArIDE0ICsgMTVdLCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZUNvdW50KCksIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZUNvbnRlbnQobW9kZWwxLCAxLCAwKSwgJ015IEZpcnN0IExpbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld0xpbmVDb250ZW50KG1vZGVsMSwgMSwgMSksICdNeSBTZWNvbmQgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZUNvbnRlbnQobW9kZWwxLCAxLCAyKSwgJ0FuZCBhbm90aGVyIG9uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZU1heENvbHVtbihtb2RlbDEsIDEsIDApLCAxNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdMaW5lTWF4Q29sdW1uKG1vZGVsMSwgMSwgMSksIDE1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld0xpbmVNYXhDb2x1bW4obW9kZWwxLCAxLCAyKSwgMTYpO1xuXHRcdGZvciAobGV0IGNvbCA9IDE7IGNvbCA8PSAxNDsgY29sKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRNb2RlbENvbHVtbk9mVmlld1Bvc2l0aW9uKDAsIGNvbCksIGNvbCwgJ2dldElucHV0Q29sdW1uT2ZPdXRwdXRQb3NpdGlvbigwLCAnICsgY29sICsgJyknKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY29sID0gMTsgY29sIDw9IDE1OyBjb2wrKykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldE1vZGVsQ29sdW1uT2ZWaWV3UG9zaXRpb24oMSwgY29sKSwgMTMgKyBjb2wsICdnZXRJbnB1dENvbHVtbk9mT3V0cHV0UG9zaXRpb24oMSwgJyArIGNvbCArICcpJyk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGNvbCA9IDE7IGNvbCA8PSAxNjsgY29sKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRNb2RlbENvbHVtbk9mVmlld1Bvc2l0aW9uKDIsIGNvbCksIDEzICsgMTQgKyBjb2wsICdnZXRJbnB1dENvbHVtbk9mT3V0cHV0UG9zaXRpb24oMiwgJyArIGNvbCArICcpJyk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGNvbCA9IDE7IGNvbCA8PSAxMzsgY29sKyspIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKDAsIGNvbCksIHBvcygwLCBjb2wpLCAnZ2V0T3V0cHV0UG9zaXRpb25PZklucHV0UG9zaXRpb24oJyArIGNvbCArICcpJyk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGNvbCA9IDEgKyAxMzsgY29sIDw9IDE0ICsgMTM7IGNvbCsrKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbigwLCBjb2wpLCBwb3MoMSwgY29sIC0gMTMpLCAnZ2V0T3V0cHV0UG9zaXRpb25PZklucHV0UG9zaXRpb24oJyArIGNvbCArICcpJyk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGNvbCA9IDEgKyAxMyArIDE0OyBjb2wgPD0gMTUgKyAxNCArIDEzOyBjb2wrKykge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3UG9zaXRpb25PZk1vZGVsUG9zaXRpb24oMCwgY29sKSwgcG9zKDIsIGNvbCAtIDEzIC0gMTQpLCAnZ2V0T3V0cHV0UG9zaXRpb25PZklucHV0UG9zaXRpb24oJyArIGNvbCArICcpJyk7XG5cdFx0fVxuXG5cdFx0bW9kZWwxID0gY3JlYXRlTW9kZWwoJ015IEZpcnN0IExpbmVNeSBTZWNvbmQgTGluZUFuZCBhbm90aGVyIG9uZScpO1xuXHRcdGxpbmUxID0gY3JlYXRlU3BsaXRMaW5lKFsxMywgMTQsIDE1XSwgWzEzLCAxMyArIDE0LCAxMyArIDE0ICsgMTVdLCA0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZUNvdW50KCksIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZUNvbnRlbnQobW9kZWwxLCAxLCAwKSwgJ015IEZpcnN0IExpbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld0xpbmVDb250ZW50KG1vZGVsMSwgMSwgMSksICcgICAgTXkgU2Vjb25kIExpbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld0xpbmVDb250ZW50KG1vZGVsMSwgMSwgMiksICcgICAgQW5kIGFub3RoZXIgb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdMaW5lTWF4Q29sdW1uKG1vZGVsMSwgMSwgMCksIDE0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld0xpbmVNYXhDb2x1bW4obW9kZWwxLCAxLCAxKSwgMTkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZU1heENvbHVtbihtb2RlbDEsIDEsIDIpLCAyMCk7XG5cblx0XHRjb25zdCBhY3R1YWxWaWV3Q29sdW1uTWFwcGluZzogbnVtYmVyW11bXSA9IFtdO1xuXHRcdGZvciAobGV0IGxpbmVJbmRleCA9IDA7IGxpbmVJbmRleCA8IGxpbmUxLmdldFZpZXdMaW5lQ291bnQoKTsgbGluZUluZGV4KyspIHtcblx0XHRcdGNvbnN0IGFjdHVhbExpbmVWaWV3Q29sdW1uTWFwcGluZzogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGNvbCA9IDE7IGNvbCA8PSBsaW5lMS5nZXRWaWV3TGluZU1heENvbHVtbihtb2RlbDEsIDEsIGxpbmVJbmRleCk7IGNvbCsrKSB7XG5cdFx0XHRcdGFjdHVhbExpbmVWaWV3Q29sdW1uTWFwcGluZy5wdXNoKGxpbmUxLmdldE1vZGVsQ29sdW1uT2ZWaWV3UG9zaXRpb24obGluZUluZGV4LCBjb2wpKTtcblx0XHRcdH1cblx0XHRcdGFjdHVhbFZpZXdDb2x1bW5NYXBwaW5nLnB1c2goYWN0dWFsTGluZVZpZXdDb2x1bW5NYXBwaW5nKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxWaWV3Q29sdW1uTWFwcGluZywgW1xuXHRcdFx0WzEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwLCAxMSwgMTIsIDEzLCAxNF0sXG5cdFx0XHRbMTQsIDE0LCAxNCwgMTQsIDE0LCAxNSwgMTYsIDE3LCAxOCwgMTksIDIwLCAyMSwgMjIsIDIzLCAyNCwgMjUsIDI2LCAyNywgMjhdLFxuXHRcdFx0WzI4LCAyOCwgMjgsIDI4LCAyOCwgMjksIDMwLCAzMSwgMzIsIDMzLCAzNCwgMzUsIDM2LCAzNywgMzgsIDM5LCA0MCwgNDEsIDQyLCA0M10sXG5cdFx0XSk7XG5cblx0XHRmb3IgKGxldCBjb2wgPSAxOyBjb2wgPD0gMTM7IGNvbCsrKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbigwLCBjb2wpLCBwb3MoMCwgY29sKSwgJzYuZ2V0T3V0cHV0UG9zaXRpb25PZklucHV0UG9zaXRpb24oJyArIGNvbCArICcpJyk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGNvbCA9IDEgKyAxMzsgY29sIDw9IDE0ICsgMTM7IGNvbCsrKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbigwLCBjb2wpLCBwb3MoMSwgNCArIGNvbCAtIDEzKSwgJzcuZ2V0T3V0cHV0UG9zaXRpb25PZklucHV0UG9zaXRpb24oJyArIGNvbCArICcpJyk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGNvbCA9IDEgKyAxMyArIDE0OyBjb2wgPD0gMTUgKyAxNCArIDEzOyBjb2wrKykge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3UG9zaXRpb25PZk1vZGVsUG9zaXRpb24oMCwgY29sKSwgcG9zKDIsIDQgKyBjb2wgLSAxMyAtIDE0KSwgJzguZ2V0T3V0cHV0UG9zaXRpb25PZklucHV0UG9zaXRpb24oJyArIGNvbCArICcpJyk7XG5cdFx0fVxuXHR9KTtcblxuXHRmdW5jdGlvbiB3aXRoU3BsaXRMaW5lc0NvbGxlY3Rpb24odGV4dDogc3RyaW5nLCBjYWxsYmFjazogKG1vZGVsOiBUZXh0TW9kZWwsIGxpbmVzQ29sbGVjdGlvbjogVmlld01vZGVsTGluZXNGcm9tUHJvamVjdGVkTW9kZWwpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb24oe30pO1xuXHRcdGNvbnN0IHdyYXBwaW5nSW5mbyA9IGNvbmZpZy5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmZvKTtcblx0XHRjb25zdCBmb250SW5mbyA9IGNvbmZpZy5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IHdvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMgPSBjb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMpO1xuXHRcdGNvbnN0IHdvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzID0gY29uZmlnLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkV3JhcEJyZWFrQmVmb3JlQ2hhcmFjdGVycyk7XG5cdFx0Y29uc3Qgd3JhcHBpbmdJbmRlbnQgPSBjb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5kZW50KTtcblx0XHRjb25zdCB3b3JkQnJlYWsgPSBjb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRCcmVhayk7XG5cdFx0Y29uc3Qgd3JhcE9uRXNjYXBlZExpbmVGZWVkcyA9IGNvbmZpZy5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcE9uRXNjYXBlZExpbmVGZWVkcyk7XG5cdFx0Y29uc3QgbGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSA9IG5ldyBNb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5KHdvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzLCB3b3JkV3JhcEJyZWFrQWZ0ZXJDaGFyYWN0ZXJzKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKHRleHQpO1xuXG5cdFx0Y29uc3QgbGluZXNDb2xsZWN0aW9uID0gbmV3IFZpZXdNb2RlbExpbmVzRnJvbVByb2plY3RlZE1vZGVsKFxuXHRcdFx0MSxcblx0XHRcdG1vZGVsLFxuXHRcdFx0bGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSxcblx0XHRcdGxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0XHRmb250SW5mbyxcblx0XHRcdG1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplLFxuXHRcdFx0J3NpbXBsZScsXG5cdFx0XHR3cmFwcGluZ0luZm8ud3JhcHBpbmdDb2x1bW4sXG5cdFx0XHR3cmFwcGluZ0luZGVudCxcblx0XHRcdHdvcmRCcmVhayxcblx0XHRcdHdyYXBPbkVzY2FwZWRMaW5lRmVlZHNcblx0XHQpO1xuXG5cdFx0Y2FsbGJhY2sobW9kZWwsIGxpbmVzQ29sbGVjdGlvbik7XG5cblx0XHRsaW5lc0NvbGxlY3Rpb24uZGlzcG9zZSgpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9XG5cblx0dGVzdCgnSW52YWxpZCBsaW5lIG51bWJlcnMnLCAoKSA9PiB7XG5cblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J2ludCBtYWluKCkgeycsXG5cdFx0XHQnXFx0cHJpbnRmKFwiSGVsbG8gd29ybGQhXCIpOycsXG5cdFx0XHQnfScsXG5cdFx0XHQnaW50IG1haW4oKSB7Jyxcblx0XHRcdCdcXHRwcmludGYoXCJIZWxsbyB3b3JsZCFcIik7Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0d2l0aFNwbGl0TGluZXNDb2xsZWN0aW9uKHRleHQsIChtb2RlbCwgbGluZXNDb2xsZWN0aW9uKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ291bnQoKSwgNik7XG5cblx0XHRcdC8vIGdldE91dHB1dEluZGVudEd1aWRlXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZXNJbmRlbnRHdWlkZXMoLTEsIC0xKSwgWzBdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcygwLCAwKSwgWzBdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcygxLCAxKSwgWzBdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcygyLCAyKSwgWzFdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcygzLCAzKSwgWzBdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcyg0LCA0KSwgWzBdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcyg1LCA1KSwgWzFdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcyg2LCA2KSwgWzBdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcyg3LCA3KSwgWzBdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKDAsIDcpLCBbMCwgMSwgMCwgMCwgMSwgMF0pO1xuXG5cdFx0XHQvLyBnZXRPdXRwdXRMaW5lQ29udGVudFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvbnRlbnQoLTEpLCAnaW50IG1haW4oKSB7Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ29udGVudCgwKSwgJ2ludCBtYWluKCkgeycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvbnRlbnQoMSksICdpbnQgbWFpbigpIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb250ZW50KDIpLCAnXFx0cHJpbnRmKFwiSGVsbG8gd29ybGQhXCIpOycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvbnRlbnQoMyksICd9Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ29udGVudCg0KSwgJ2ludCBtYWluKCkgeycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvbnRlbnQoNSksICdcXHRwcmludGYoXCJIZWxsbyB3b3JsZCFcIik7Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ29udGVudCg2KSwgJ30nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb250ZW50KDcpLCAnfScpO1xuXG5cdFx0XHQvLyBnZXRPdXRwdXRMaW5lTWluQ29sdW1uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWluQ29sdW1uKC0xKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWluQ29sdW1uKDApLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNaW5Db2x1bW4oMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1pbkNvbHVtbigyKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWluQ29sdW1uKDMpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNaW5Db2x1bW4oNCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1pbkNvbHVtbig1KSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWluQ29sdW1uKDYpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNaW5Db2x1bW4oNyksIDEpO1xuXG5cdFx0XHQvLyBnZXRPdXRwdXRMaW5lTWF4Q29sdW1uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKC0xKSwgMTMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1heENvbHVtbigwKSwgMTMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1heENvbHVtbigxKSwgMTMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1heENvbHVtbigyKSwgMjUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1heENvbHVtbigzKSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKDQpLCAxMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKDUpLCAyNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKDYpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNYXhDb2x1bW4oNyksIDIpO1xuXG5cdFx0XHQvLyBjb252ZXJ0T3V0cHV0UG9zaXRpb25Ub0lucHV0UG9zaXRpb25cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24oLTEsIDEpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbigwLCAxKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24oMSwgMSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKDIsIDEpLCBuZXcgUG9zaXRpb24oMiwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbigzLCAxKSwgbmV3IFBvc2l0aW9uKDMsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24oNCwgMSksIG5ldyBQb3NpdGlvbig0LCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKDUsIDEpLCBuZXcgUG9zaXRpb24oNSwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbig2LCAxKSwgbmV3IFBvc2l0aW9uKDYsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24oNywgMSksIG5ldyBQb3NpdGlvbig2LCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKDgsIDEpLCBuZXcgUG9zaXRpb24oNiwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzY2MicsICgpID0+IHtcblxuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnaW50IG1haW4oKSB7Jyxcblx0XHRcdCdcXHRwcmludGYoXCJIZWxsbyB3b3JsZCFcIik7Jyxcblx0XHRcdCd9Jyxcblx0XHRcdCdpbnQgbWFpbigpIHsnLFxuXHRcdFx0J1xcdHByaW50ZihcIkhlbGxvIHdvcmxkIVwiKTsnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHR3aXRoU3BsaXRMaW5lc0NvbGxlY3Rpb24odGV4dCwgKG1vZGVsLCBsaW5lc0NvbGxlY3Rpb24pID0+IHtcblx0XHRcdGxpbmVzQ29sbGVjdGlvbi5zZXRIaWRkZW5BcmVhcyhbXG5cdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAzLCAxKSxcblx0XHRcdFx0bmV3IFJhbmdlKDUsIDEsIDYsIDEpXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3Qgdmlld0xpbmVDb3VudCA9IGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvdW50KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld0xpbmVDb3VudCwgMSwgJ2dldE91dHB1dExpbmVDb3VudCgpJyk7XG5cblx0XHRcdGNvbnN0IG1vZGVsTGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gMDsgbGluZU51bWJlciA8PSBtb2RlbExpbmVDb3VudCArIDE7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lTWluQ29sdW1uID0gKGxpbmVOdW1iZXIgPj0gMSAmJiBsaW5lTnVtYmVyIDw9IG1vZGVsTGluZUNvdW50KSA/IG1vZGVsLmdldExpbmVNaW5Db2x1bW4obGluZU51bWJlcikgOiAxO1xuXHRcdFx0XHRjb25zdCBsaW5lTWF4Q29sdW1uID0gKGxpbmVOdW1iZXIgPj0gMSAmJiBsaW5lTnVtYmVyIDw9IG1vZGVsTGluZUNvdW50KSA/IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikgOiAxO1xuXHRcdFx0XHRmb3IgKGxldCBjb2x1bW4gPSBsaW5lTWluQ29sdW1uIC0gMTsgY29sdW1uIDw9IGxpbmVNYXhDb2x1bW4gKyAxOyBjb2x1bW4rKykge1xuXHRcdFx0XHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IGxpbmVzQ29sbGVjdGlvbi5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cblx0XHRcdFx0XHQvLyB2YWxpZGF0ZSB2aWV3IHBvc2l0aW9uXG5cdFx0XHRcdFx0bGV0IHZpZXdMaW5lTnVtYmVyID0gdmlld1Bvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0bGV0IHZpZXdDb2x1bW4gPSB2aWV3UG9zaXRpb24uY29sdW1uO1xuXHRcdFx0XHRcdGlmICh2aWV3TGluZU51bWJlciA8IDEpIHtcblx0XHRcdFx0XHRcdHZpZXdMaW5lTnVtYmVyID0gMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgbGluZUNvdW50ID0gbGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ291bnQoKTtcblx0XHRcdFx0XHRpZiAodmlld0xpbmVOdW1iZXIgPiBsaW5lQ291bnQpIHtcblx0XHRcdFx0XHRcdHZpZXdMaW5lTnVtYmVyID0gbGluZUNvdW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB2aWV3TWluQ29sdW1uID0gbGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWluQ29sdW1uKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRjb25zdCB2aWV3TWF4Q29sdW1uID0gbGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRpZiAodmlld0NvbHVtbiA8IHZpZXdNaW5Db2x1bW4pIHtcblx0XHRcdFx0XHRcdHZpZXdDb2x1bW4gPSB2aWV3TWluQ29sdW1uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodmlld0NvbHVtbiA+IHZpZXdNYXhDb2x1bW4pIHtcblx0XHRcdFx0XHRcdHZpZXdDb2x1bW4gPSB2aWV3TWF4Q29sdW1uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB2YWxpZFZpZXdQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih2aWV3TGluZU51bWJlciwgdmlld0NvbHVtbik7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdQb3NpdGlvbi50b1N0cmluZygpLCB2YWxpZFZpZXdQb3NpdGlvbi50b1N0cmluZygpLCAnbW9kZWwtPnZpZXcgZm9yICcgKyBsaW5lTnVtYmVyICsgJywgJyArIGNvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IDA7IGxpbmVOdW1iZXIgPD0gdmlld0xpbmVDb3VudCArIDE7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lTWluQ29sdW1uID0gbGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWluQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBsaW5lTWF4Q29sdW1uID0gbGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRmb3IgKGxldCBjb2x1bW4gPSBsaW5lTWluQ29sdW1uIC0gMTsgY29sdW1uIDw9IGxpbmVNYXhDb2x1bW4gKyAxOyBjb2x1bW4rKykge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsUG9zaXRpb24gPSBsaW5lc0NvbGxlY3Rpb24uY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0XHRcdGNvbnN0IHZhbGlkTW9kZWxQb3NpdGlvbiA9IG1vZGVsLnZhbGlkYXRlUG9zaXRpb24obW9kZWxQb3NpdGlvbik7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsUG9zaXRpb24udG9TdHJpbmcoKSwgdmFsaWRNb2RlbFBvc2l0aW9uLnRvU3RyaW5nKCksICd2aWV3LT5tb2RlbCBmb3IgJyArIGxpbmVOdW1iZXIgKyAnLCAnICsgY29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdTcGxpdExpbmVzQ29sbGVjdGlvbicsICgpID0+IHtcblxuXHRjb25zdCBfdGV4dCA9IFtcblx0XHQnY2xhc3MgTmljZSB7Jyxcblx0XHQnXHRmdW5jdGlvbiBoaSgpIHsnLFxuXHRcdCdcdFx0Y29uc29sZS5sb2coXCJIZWxsbyB3b3JsZFwiKTsnLFxuXHRcdCdcdH0nLFxuXHRcdCdcdGZ1bmN0aW9uIGhlbGxvKCkgeycsXG5cdFx0J1x0XHRjb25zb2xlLmxvZyhcIkhlbGxvIHdvcmxkLCB0aGlzIGlzIGEgc29tZXdoYXQgbG9uZ2VyIGxpbmVcIik7Jyxcblx0XHQnXHR9Jyxcblx0XHQnfScsXG5cdF07XG5cblx0Y29uc3QgX3Rva2VucyA9IFtcblx0XHRbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHZhbHVlOiAxIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDUsIHZhbHVlOiAyIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDYsIHZhbHVlOiAzIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDEwLCB2YWx1ZTogNCB9LFxuXHRcdF0sXG5cdFx0W1xuXHRcdFx0eyBzdGFydEluZGV4OiAwLCB2YWx1ZTogNSB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxLCB2YWx1ZTogNiB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiA5LCB2YWx1ZTogNyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxMCwgdmFsdWU6IDggfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTIsIHZhbHVlOiA5IH0sXG5cdFx0XSxcblx0XHRbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHZhbHVlOiAxMCB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAyLCB2YWx1ZTogMTEgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOSwgdmFsdWU6IDEyIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDEwLCB2YWx1ZTogMTMgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTMsIHZhbHVlOiAxNCB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxNCwgdmFsdWU6IDE1IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDI3LCB2YWx1ZTogMTYgfSxcblx0XHRdLFxuXHRcdFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdmFsdWU6IDE3IH0sXG5cdFx0XSxcblx0XHRbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHZhbHVlOiAxOCB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxLCB2YWx1ZTogMTkgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOSwgdmFsdWU6IDIwIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDEwLCB2YWx1ZTogMjEgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTUsIHZhbHVlOiAyMiB9LFxuXHRcdF0sXG5cdFx0W1xuXHRcdFx0eyBzdGFydEluZGV4OiAwLCB2YWx1ZTogMjMgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMiwgdmFsdWU6IDI0IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDksIHZhbHVlOiAyNSB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxMCwgdmFsdWU6IDI2IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDEzLCB2YWx1ZTogMjcgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTQsIHZhbHVlOiAyOCB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiA1OSwgdmFsdWU6IDI5IH0sXG5cdFx0XSxcblx0XHRbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHZhbHVlOiAzMCB9LFxuXHRcdF0sXG5cdFx0W1xuXHRcdFx0eyBzdGFydEluZGV4OiAwLCB2YWx1ZTogMzEgfSxcblx0XHRdXG5cdF07XG5cblx0bGV0IG1vZGVsOiBUZXh0TW9kZWw7XG5cdGxldCBsYW5ndWFnZVJlZ2lzdHJhdGlvbjogSURpc3Bvc2FibGU7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGxldCBfbGluZUluZGV4ID0gMDtcblx0XHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0OiBsYW5ndWFnZXMuSVRva2VuaXphdGlvblN1cHBvcnQgPSB7XG5cdFx0XHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IE51bGxTdGF0ZSxcblx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKTogbGFuZ3VhZ2VzLkVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQgPT4ge1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBfdG9rZW5zW19saW5lSW5kZXgrK107XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFVpbnQzMkFycmF5KDIgKiB0b2tlbnMubGVuZ3RoKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRyZXN1bHRbMiAqIGldID0gdG9rZW5zW2ldLnN0YXJ0SW5kZXg7XG5cdFx0XHRcdFx0cmVzdWx0WzIgKiBpICsgMV0gPSAoXG5cdFx0XHRcdFx0XHR0b2tlbnNbaV0udmFsdWUgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVRcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgbGFuZ3VhZ2VzLkVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQocmVzdWx0LCBbXSwgc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgTEFOR1VBR0VfSUQgPSAnbW9kZWxNb2RlVGVzdDEnO1xuXHRcdGxhbmd1YWdlUmVnaXN0cmF0aW9uID0gbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKExBTkdVQUdFX0lELCB0b2tlbml6YXRpb25TdXBwb3J0KTtcblx0XHRtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChfdGV4dC5qb2luKCdcXG4nKSwgTEFOR1VBR0VfSUQpO1xuXHRcdC8vIGZvcmNlIHRva2VuaXphdGlvblxuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0bGFuZ3VhZ2VSZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRpbnRlcmZhY2UgSVRlc3RWaWV3TGluZVRva2VuIHtcblx0XHRlbmRJbmRleDogbnVtYmVyO1xuXHRcdHZhbHVlOiBudW1iZXI7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRWaWV3TGluZVRva2VucyhfYWN0dWFsOiBJVmlld0xpbmVUb2tlbnMsIGV4cGVjdGVkOiBJVGVzdFZpZXdMaW5lVG9rZW5bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdHVhbDogSVRlc3RWaWV3TGluZVRva2VuW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gX2FjdHVhbC5nZXRDb3VudCgpOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGFjdHVhbFtpXSA9IHtcblx0XHRcdFx0ZW5kSW5kZXg6IF9hY3R1YWwuZ2V0RW5kT2Zmc2V0KGkpLFxuXHRcdFx0XHR2YWx1ZTogX2FjdHVhbC5nZXRGb3JlZ3JvdW5kKGkpXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHR9XG5cblx0aW50ZXJmYWNlIElUZXN0TWluaW1hcExpbmVSZW5kZXJpbmdEYXRhIHtcblx0XHRjb250ZW50OiBzdHJpbmc7XG5cdFx0bWluQ29sdW1uOiBudW1iZXI7XG5cdFx0bWF4Q29sdW1uOiBudW1iZXI7XG5cdFx0dG9rZW5zOiBJVGVzdFZpZXdMaW5lVG9rZW5bXTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydE1pbmltYXBMaW5lUmVuZGVyaW5nRGF0YShhY3R1YWw6IFZpZXdMaW5lRGF0YSwgZXhwZWN0ZWQ6IElUZXN0TWluaW1hcExpbmVSZW5kZXJpbmdEYXRhIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmIChhY3R1YWwgPT09IG51bGwgJiYgZXhwZWN0ZWQgPT09IG51bGwpIHtcblx0XHRcdGFzc2VydC5vayh0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGV4cGVjdGVkID09PSBudWxsKSB7XG5cdFx0XHRhc3NlcnQub2soZmFsc2UpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmNvbnRlbnQsIGV4cGVjdGVkLmNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWluQ29sdW1uLCBleHBlY3RlZC5taW5Db2x1bW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubWF4Q29sdW1uLCBleHBlY3RlZC5tYXhDb2x1bW4pO1xuXHRcdGFzc2VydFZpZXdMaW5lVG9rZW5zKGFjdHVhbC50b2tlbnMsIGV4cGVjdGVkLnRva2Vucyk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKGFjdHVhbDogVmlld0xpbmVEYXRhW10sIGV4cGVjdGVkOiBBcnJheTxJVGVzdE1pbmltYXBMaW5lUmVuZGVyaW5nRGF0YSB8IG51bGw+KTogdm9pZCB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sZW5ndGgsIGV4cGVjdGVkLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHBlY3RlZC5sZW5ndGg7IGkrKykge1xuXHRcdFx0YXNzZXJ0TWluaW1hcExpbmVSZW5kZXJpbmdEYXRhKGFjdHVhbFtpXSwgZXhwZWN0ZWRbaV0pO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydEFsbE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoc3BsaXRMaW5lc0NvbGxlY3Rpb246IFZpZXdNb2RlbExpbmVzRnJvbVByb2plY3RlZE1vZGVsLCBhbGw6IElUZXN0TWluaW1hcExpbmVSZW5kZXJpbmdEYXRhW10pOiB2b2lkIHtcblx0XHRjb25zdCBsaW5lQ291bnQgPSBhbGwubGVuZ3RoO1xuXHRcdGZvciAobGV0IGxpbmUgPSAxOyBsaW5lIDw9IGxpbmVDb3VudDsgbGluZSsrKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVEYXRhKGxpbmUpLmNvbnRlbnQsIHNwbGl0TGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ29udGVudChsaW5lKSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgc3RhcnQgPSAxOyBzdGFydCA8PSBsaW5lQ291bnQ7IHN0YXJ0KyspIHtcblx0XHRcdGZvciAobGV0IGVuZCA9IHN0YXJ0OyBlbmQgPD0gbGluZUNvdW50OyBlbmQrKykge1xuXHRcdFx0XHRjb25zdCBjb3VudCA9IGVuZCAtIHN0YXJ0ICsgMTtcblx0XHRcdFx0Zm9yIChsZXQgZGVzaXJlZCA9IE1hdGgucG93KDIsIGNvdW50KSAtIDE7IGRlc2lyZWQgPj0gMDsgZGVzaXJlZC0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmVlZGVkOiBib29sZWFuW10gPSBbXTtcblx0XHRcdFx0XHRjb25zdCBleHBlY3RlZDogQXJyYXk8SVRlc3RNaW5pbWFwTGluZVJlbmRlcmluZ0RhdGEgfCBudWxsPiA9IFtdO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0XHRcdFx0bmVlZGVkW2ldID0gKGRlc2lyZWQgJiAoMSA8PCBpKSkgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRcdFx0XHRleHBlY3RlZFtpXSA9IChuZWVkZWRbaV0gPyBhbGxbc3RhcnQgLSAxICsgaV0gOiBudWxsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgYWN0dWFsID0gc3BsaXRMaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzRGF0YShzdGFydCwgZW5kLCBuZWVkZWQpO1xuXG5cdFx0XHRcdFx0YXNzZXJ0TWluaW1hcExpbmVzUmVuZGVyaW5nRGF0YShhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHRcdFx0XHQvLyBDb21tZW50IG91dCBuZXh0IGxpbmUgdG8gdGVzdCBhbGwgcG9zc2libGUgY29tYmluYXRpb25zXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdnZXRWaWV3TGluZXNEYXRhIC0gbm8gd3JhcHBpbmcnLCAoKSA9PiB7XG5cdFx0d2l0aFNwbGl0TGluZXNDb2xsZWN0aW9uKG1vZGVsLCAnb2ZmJywgMCwgZmFsc2UsIChzcGxpdExpbmVzQ29sbGVjdGlvbikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ291bnQoKSwgOCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSgxLCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSgyLCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSgzLCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg0LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg1LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg2LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg3LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg4LCAxKSwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IF9leHBlY3RlZDogSVRlc3RNaW5pbWFwTGluZVJlbmRlcmluZ0RhdGFbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdjbGFzcyBOaWNlIHsnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDEzLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogNSwgdmFsdWU6IDEgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDYsIHZhbHVlOiAyIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDMgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEyLCB2YWx1ZTogNCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdGZ1bmN0aW9uIGhpKCkgeycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMTcsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxLCB2YWx1ZTogNSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDYgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogNyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTIsIHZhbHVlOiA4IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNiwgdmFsdWU6IDkgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHRcdGNvbnNvbGUubG9nKFwiSGVsbG8gd29ybGRcIik7Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAzMCxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAxMCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDExIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDEyIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMywgdmFsdWU6IDEzIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNCwgdmFsdWU6IDE0IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyNywgdmFsdWU6IDE1IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyOSwgdmFsdWU6IDE2IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0fScsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMyxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAxNyB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdGZ1bmN0aW9uIGhlbGxvKCkgeycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMjAsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxLCB2YWx1ZTogMTggfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDksIHZhbHVlOiAxOSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTAsIHZhbHVlOiAyMCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTUsIHZhbHVlOiAyMSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTksIHZhbHVlOiAyMiB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdFx0Y29uc29sZS5sb2coXCJIZWxsbyB3b3JsZCwgdGhpcyBpcyBhIHNvbWV3aGF0IGxvbmdlciBsaW5lXCIpOycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogNjIsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyLCB2YWx1ZTogMjMgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDksIHZhbHVlOiAyNCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTAsIHZhbHVlOiAyNSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTMsIHZhbHVlOiAyNiB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTQsIHZhbHVlOiAyNyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogNTksIHZhbHVlOiAyOCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogNjEsIHZhbHVlOiAyOSB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDMsXG5cdFx0XHRcdFx0Y29udGVudDogJ1x0fScsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyLCB2YWx1ZTogMzAgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyLFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICd9Jyxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEsIHZhbHVlOiAzMSB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XTtcblxuXHRcdFx0YXNzZXJ0QWxsTWluaW1hcExpbmVzUmVuZGVyaW5nRGF0YShzcGxpdExpbmVzQ29sbGVjdGlvbiwgW1xuXHRcdFx0XHRfZXhwZWN0ZWRbMF0sXG5cdFx0XHRcdF9leHBlY3RlZFsxXSxcblx0XHRcdFx0X2V4cGVjdGVkWzJdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbM10sXG5cdFx0XHRcdF9leHBlY3RlZFs0XSxcblx0XHRcdFx0X2V4cGVjdGVkWzVdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNl0sXG5cdFx0XHRcdF9leHBlY3RlZFs3XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRzcGxpdExpbmVzQ29sbGVjdGlvbi5zZXRIaWRkZW5BcmVhcyhbbmV3IFJhbmdlKDIsIDEsIDQsIDEpXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb3VudCgpLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDEsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDIsIDEpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSgzLCAxKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoNCwgMSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDUsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDYsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDcsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDgsIDEpLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0QWxsTWluaW1hcExpbmVzUmVuZGVyaW5nRGF0YShzcGxpdExpbmVzQ29sbGVjdGlvbiwgW1xuXHRcdFx0XHRfZXhwZWN0ZWRbMF0sXG5cdFx0XHRcdF9leHBlY3RlZFs0XSxcblx0XHRcdFx0X2V4cGVjdGVkWzVdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNl0sXG5cdFx0XHRcdF9leHBlY3RlZFs3XSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRWaWV3TGluZXNEYXRhIC0gd2l0aCB3cmFwcGluZycsICgpID0+IHtcblx0XHR3aXRoU3BsaXRMaW5lc0NvbGxlY3Rpb24obW9kZWwsICd3b3JkV3JhcENvbHVtbicsIDMwLCBmYWxzZSwgKHNwbGl0TGluZXNDb2xsZWN0aW9uKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb3VudCgpLCAxMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSgxLCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSgyLCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSgzLCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg0LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg1LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg2LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg3LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg4LCAxKSwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IF9leHBlY3RlZDogSVRlc3RNaW5pbWFwTGluZVJlbmRlcmluZ0RhdGFbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdjbGFzcyBOaWNlIHsnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDEzLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogNSwgdmFsdWU6IDEgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDYsIHZhbHVlOiAyIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDMgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEyLCB2YWx1ZTogNCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdGZ1bmN0aW9uIGhpKCkgeycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMTcsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxLCB2YWx1ZTogNSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDYgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogNyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTIsIHZhbHVlOiA4IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNiwgdmFsdWU6IDkgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHRcdGNvbnNvbGUubG9nKFwiSGVsbG8gJyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMixcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAxMCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDExIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDEyIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMywgdmFsdWU6IDEzIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNCwgdmFsdWU6IDE0IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyMSwgdmFsdWU6IDE1IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJyAgICAgICAgICAgIHdvcmxkXCIpOycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxMyxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIxLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTgsIHZhbHVlOiAxNSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMjAsIHZhbHVlOiAxNiB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdH0nLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDMsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyLCB2YWx1ZTogMTcgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHRmdW5jdGlvbiBoZWxsbygpIHsnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIwLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMSwgdmFsdWU6IDE4IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA5LCB2YWx1ZTogMTkgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogMjAgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE1LCB2YWx1ZTogMjEgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE5LCB2YWx1ZTogMjIgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHRcdGNvbnNvbGUubG9nKFwiSGVsbG8gJyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMixcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAyMyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDI0IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDI1IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMywgdmFsdWU6IDI2IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNCwgdmFsdWU6IDI3IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyMSwgdmFsdWU6IDI4IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJyAgICAgICAgICAgIHdvcmxkLCB0aGlzIGlzIGEgJyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEzLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMzAsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyOSwgdmFsdWU6IDI4IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJyAgICAgICAgICAgIHNvbWV3aGF0IGxvbmdlciAnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMTMsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyOSxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDI4LCB2YWx1ZTogMjggfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnICAgICAgICAgICAgbGluZVwiKTsnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMTMsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMCxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE3LCB2YWx1ZTogMjggfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE5LCB2YWx1ZTogMjkgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHR9Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAzLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMiwgdmFsdWU6IDMwIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ30nLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxLCB2YWx1ZTogMzEgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cblx0XHRcdGFzc2VydEFsbE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoc3BsaXRMaW5lc0NvbGxlY3Rpb24sIFtcblx0XHRcdFx0X2V4cGVjdGVkWzBdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbMV0sXG5cdFx0XHRcdF9leHBlY3RlZFsyXSxcblx0XHRcdFx0X2V4cGVjdGVkWzNdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNF0sXG5cdFx0XHRcdF9leHBlY3RlZFs1XSxcblx0XHRcdFx0X2V4cGVjdGVkWzZdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbN10sXG5cdFx0XHRcdF9leHBlY3RlZFs4XSxcblx0XHRcdFx0X2V4cGVjdGVkWzldLFxuXHRcdFx0XHRfZXhwZWN0ZWRbMTBdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbMTFdLFxuXHRcdFx0XSk7XG5cblx0XHRcdHNwbGl0TGluZXNDb2xsZWN0aW9uLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoMiwgMSwgNCwgMSldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvdW50KCksIDgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoMSwgMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoMiwgMSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDMsIDEpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg0LCAxKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoNSwgMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoNiwgMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoNywgMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoOCwgMSksIHRydWUpO1xuXG5cdFx0XHRhc3NlcnRBbGxNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKHNwbGl0TGluZXNDb2xsZWN0aW9uLCBbXG5cdFx0XHRcdF9leHBlY3RlZFswXSxcblx0XHRcdFx0X2V4cGVjdGVkWzVdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNl0sXG5cdFx0XHRcdF9leHBlY3RlZFs3XSxcblx0XHRcdFx0X2V4cGVjdGVkWzhdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbOV0sXG5cdFx0XHRcdF9leHBlY3RlZFsxMF0sXG5cdFx0XHRcdF9leHBlY3RlZFsxMV0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Vmlld0xpbmVzRGF0YSAtIHdpdGggd3JhcHBpbmcgYW5kIGluamVjdGVkIHRleHQnLCAoKSA9PiB7XG5cdFx0bW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhbXSwgW3tcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgOSwgMSwgOSksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnZXhhbXBsZScsXG5cdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0Y29udGVudDogJ3ZlcnkgdmVyeSBsb25nIGluamVjdGVkIHRleHQgdGhhdCBjYXVzZXMgYSBsaW5lIGJyZWFrJyxcblx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6ICdteUNsYXNzTmFtZSdcblx0XHRcdFx0fSxcblx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0fVxuXHRcdH1dKTtcblxuXHRcdHdpdGhTcGxpdExpbmVzQ29sbGVjdGlvbihtb2RlbCwgJ3dvcmRXcmFwQ29sdW1uJywgMzAsIGZhbHNlLCAoc3BsaXRMaW5lc0NvbGxlY3Rpb24pID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvdW50KCksIDE0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKDEpLCAyNCk7XG5cblx0XHRcdGNvbnN0IF9leHBlY3RlZDogSVRlc3RNaW5pbWFwTGluZVJlbmRlcmluZ0RhdGFbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdjbGFzcyBOaXZlcnkgdmVyeSBsb25nICcsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMjQsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA1LCB2YWx1ZTogMSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogNiwgdmFsdWU6IDIgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDgsIHZhbHVlOiAzIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyMywgdmFsdWU6IDEgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnICAgIGluamVjdGVkIHRleHQgdGhhdCBjYXVzZXMgJyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDUsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAzMSxcblx0XHRcdFx0XHR0b2tlbnM6IFt7IGVuZEluZGV4OiAzMCwgdmFsdWU6IDEgfV1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICcgICAgYSBsaW5lIGJyZWFrY2UgeycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiA1LFxuXHRcdFx0XHRcdG1heENvbHVtbjogMjEsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNiwgdmFsdWU6IDEgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE4LCB2YWx1ZTogMyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMjAsIHZhbHVlOiA0IH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHRmdW5jdGlvbiBoaSgpIHsnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDE3LFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMSwgdmFsdWU6IDUgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDksIHZhbHVlOiA2IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDcgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEyLCB2YWx1ZTogOCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTYsIHZhbHVlOiA5IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0XHRjb25zb2xlLmxvZyhcIkhlbGxvICcsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMjIsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyLCB2YWx1ZTogMTAgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDksIHZhbHVlOiAxMSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTAsIHZhbHVlOiAxMiB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTMsIHZhbHVlOiAxMyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTQsIHZhbHVlOiAxNCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMjEsIHZhbHVlOiAxNSB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICcgICAgICAgICAgICB3b3JsZFwiKTsnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMTMsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMSxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE4LCB2YWx1ZTogMTUgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIwLCB2YWx1ZTogMTYgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHR9Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAzLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMiwgdmFsdWU6IDE3IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0ZnVuY3Rpb24gaGVsbG8oKSB7Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMCxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEsIHZhbHVlOiAxOCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDE5IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDIwIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNSwgdmFsdWU6IDIxIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxOSwgdmFsdWU6IDIyIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0XHRjb25zb2xlLmxvZyhcIkhlbGxvICcsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMjIsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyLCB2YWx1ZTogMjMgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDksIHZhbHVlOiAyNCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTAsIHZhbHVlOiAyNSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTMsIHZhbHVlOiAyNiB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTQsIHZhbHVlOiAyNyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMjEsIHZhbHVlOiAyOCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICcgICAgICAgICAgICB3b3JsZCwgdGhpcyBpcyBhICcsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxMyxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDMwLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMjksIHZhbHVlOiAyOCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICcgICAgICAgICAgICBzb21ld2hhdCBsb25nZXIgJyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEzLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMjksXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyOCwgdmFsdWU6IDI4IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJyAgICAgICAgICAgIGxpbmVcIik7Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEzLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMjAsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNywgdmFsdWU6IDI4IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxOSwgdmFsdWU6IDI5IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0fScsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMyxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAzMCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICd9Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMSwgdmFsdWU6IDMxIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnRBbGxNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKHNwbGl0TGluZXNDb2xsZWN0aW9uLCBbXG5cdFx0XHRcdF9leHBlY3RlZFswXSxcblx0XHRcdFx0X2V4cGVjdGVkWzFdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbMl0sXG5cdFx0XHRcdF9leHBlY3RlZFszXSxcblx0XHRcdFx0X2V4cGVjdGVkWzRdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNV0sXG5cdFx0XHRcdF9leHBlY3RlZFs2XSxcblx0XHRcdFx0X2V4cGVjdGVkWzddLFxuXHRcdFx0XHRfZXhwZWN0ZWRbOF0sXG5cdFx0XHRcdF9leHBlY3RlZFs5XSxcblx0XHRcdFx0X2V4cGVjdGVkWzEwXSxcblx0XHRcdFx0X2V4cGVjdGVkWzExXSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBkYXRhID0gc3BsaXRMaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzRGF0YSgxLCAxNCwgbmV3IEFycmF5KDE0KS5maWxsKHRydWUpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGRhdGEubWFwKChkKSA9PiAoe1xuXHRcdFx0XHRcdGlubGluZURlY29yYXRpb25zOiBkLmlubGluZURlY29yYXRpb25zPy5tYXAoKGQpID0+ICh7XG5cdFx0XHRcdFx0XHRzdGFydE9mZnNldDogZC5yYW5nZS5zdGFydENvbHVtbiAtIDEsXG5cdFx0XHRcdFx0XHRlbmRPZmZzZXQ6IGQucmFuZ2UuZW5kQ29sdW1uIC0gMSxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IFt7IHN0YXJ0T2Zmc2V0OiA4LCBlbmRPZmZzZXQ6IDIzIH1dIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogW3sgc3RhcnRPZmZzZXQ6IDQsIGVuZE9mZnNldDogMzAgfV0gfSxcblx0XHRcdFx0XHR7IGlubGluZURlY29yYXRpb25zOiBbeyBzdGFydE9mZnNldDogNCwgZW5kT2Zmc2V0OiAxNiB9XSB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB3aXRoU3BsaXRMaW5lc0NvbGxlY3Rpb24obW9kZWw6IFRleHRNb2RlbCwgd29yZFdyYXA6ICdvbicgfCAnb2ZmJyB8ICd3b3JkV3JhcENvbHVtbicgfCAnYm91bmRlZCcsIHdvcmRXcmFwQ29sdW1uOiBudW1iZXIsIHdyYXBPbkVzY2FwZWRMaW5lRmVlZHM6IGJvb2xlYW4sIGNhbGxiYWNrOiAoc3BsaXRMaW5lc0NvbGxlY3Rpb246IFZpZXdNb2RlbExpbmVzRnJvbVByb2plY3RlZE1vZGVsKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IG5ldyBUZXN0Q29uZmlndXJhdGlvbih7XG5cdFx0XHR3b3JkV3JhcDogd29yZFdyYXAsXG5cdFx0XHR3b3JkV3JhcENvbHVtbjogd29yZFdyYXBDb2x1bW4sXG5cdFx0XHR3cmFwcGluZ0luZGVudDogJ2luZGVudCdcblx0XHR9KTtcblx0XHRjb25zdCB3cmFwcGluZ0luZm8gPSBjb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IHdvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMgPSBjb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkV3JhcEJyZWFrQWZ0ZXJDaGFyYWN0ZXJzKTtcblx0XHRjb25zdCB3b3JkV3JhcEJyZWFrQmVmb3JlQ2hhcmFjdGVycyA9IGNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzKTtcblx0XHRjb25zdCB3cmFwcGluZ0luZGVudCA9IGNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5kZW50KTtcblx0XHRjb25zdCB3b3JkQnJlYWsgPSBjb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkQnJlYWspO1xuXG5cdFx0Y29uc3QgbGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSA9IG5ldyBNb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5KHdvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzLCB3b3JkV3JhcEJyZWFrQWZ0ZXJDaGFyYWN0ZXJzKTtcblxuXHRcdGNvbnN0IGxpbmVzQ29sbGVjdGlvbiA9IG5ldyBWaWV3TW9kZWxMaW5lc0Zyb21Qcm9qZWN0ZWRNb2RlbChcblx0XHRcdDEsXG5cdFx0XHRtb2RlbCxcblx0XHRcdGxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0XHRsaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdFx0Zm9udEluZm8sXG5cdFx0XHRtb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZSxcblx0XHRcdCdzaW1wbGUnLFxuXHRcdFx0d3JhcHBpbmdJbmZvLndyYXBwaW5nQ29sdW1uLFxuXHRcdFx0d3JhcHBpbmdJbmRlbnQsXG5cdFx0XHR3b3JkQnJlYWssXG5cdFx0XHR3cmFwT25Fc2NhcGVkTGluZUZlZWRzXG5cdFx0KTtcblxuXHRcdGNhbGxiYWNrKGxpbmVzQ29sbGVjdGlvbik7XG5cblx0XHRjb25maWd1cmF0aW9uLmRpc3Bvc2UoKTtcblx0fVxufSk7XG5cblxuZnVuY3Rpb24gcG9zKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBQb3NpdGlvbiB7XG5cdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3BsaXRMaW5lKHNwbGl0TGVuZ3RoczogbnVtYmVyW10sIGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW46IG51bWJlcltdLCB3cmFwcGVkVGV4dEluZGVudFdpZHRoOiBudW1iZXIsIGlzVmlzaWJsZTogYm9vbGVhbiA9IHRydWUpOiBJTW9kZWxMaW5lUHJvamVjdGlvbiB7XG5cdHJldHVybiBjcmVhdGVNb2RlbExpbmVQcm9qZWN0aW9uKGNyZWF0ZUxpbmVCcmVha0RhdGEoc3BsaXRMZW5ndGhzLCBicmVha2luZ09mZnNldHNWaXNpYmxlQ29sdW1uLCB3cmFwcGVkVGV4dEluZGVudFdpZHRoKSwgaXNWaXNpYmxlKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTGluZUJyZWFrRGF0YShicmVha2luZ0xlbmd0aHM6IG51bWJlcltdLCBicmVha2luZ09mZnNldHNWaXNpYmxlQ29sdW1uOiBudW1iZXJbXSwgd3JhcHBlZFRleHRJbmRlbnRXaWR0aDogbnVtYmVyKTogTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEge1xuXHRjb25zdCBzdW1zOiBudW1iZXJbXSA9IFtdO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGJyZWFraW5nTGVuZ3Rocy5sZW5ndGg7IGkrKykge1xuXHRcdHN1bXNbaV0gPSAoaSA+IDAgPyBzdW1zW2kgLSAxXSA6IDApICsgYnJlYWtpbmdMZW5ndGhzW2ldO1xuXHR9XG5cdHJldHVybiBuZXcgTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEobnVsbCwgbnVsbCwgc3VtcywgYnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbiwgd3JhcHBlZFRleHRJbmRlbnRXaWR0aCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vZGVsKHRleHQ6IHN0cmluZyk6IElTaW1wbGVNb2RlbCB7XG5cdHJldHVybiB7XG5cdFx0dG9rZW5pemF0aW9uOiB7XG5cdFx0XHRnZXRMaW5lVG9rZW5zOiAobGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdHJldHVybiBudWxsITtcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRnZXRMaW5lQ29udGVudDogKGxpbmVOdW1iZXI6IG51bWJlcikgPT4ge1xuXHRcdFx0cmV0dXJuIHRleHQ7XG5cdFx0fSxcblx0XHRnZXRMaW5lTGVuZ3RoOiAobGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGV4dC5sZW5ndGg7XG5cdFx0fSxcblx0XHRnZXRMaW5lTWluQ29sdW1uOiAobGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9LFxuXHRcdGdldExpbmVNYXhDb2x1bW46IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHtcblx0XHRcdHJldHVybiB0ZXh0Lmxlbmd0aCArIDE7XG5cdFx0fSxcblx0XHRnZXRWYWx1ZUluUmFuZ2U6IChyYW5nZTogSVJhbmdlLCBlb2w/OiBFbmRPZkxpbmVQcmVmZXJlbmNlKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGV4dC5zdWJzdHJpbmcocmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCByYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHR9XG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFF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QUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Q7QUFFQSxRQUFNLFVBQVU7QUFBQSxJQUNmO0FBQUEsTUFDQyxFQUFFLFlBQVksR0FBRyxPQUFPLEVBQUU7QUFBQSxNQUMxQixFQUFFLFlBQVksR0FBRyxPQUFPLEVBQUU7QUFBQSxNQUMxQixFQUFFLFlBQVksR0FBRyxPQUFPLEVBQUU7QUFBQSxNQUMxQixFQUFFLFlBQVksSUFBSSxPQUFPLEVBQUU7QUFBQSxJQUM1QjtBQUFBLElBQ0E7QUFBQSxNQUNDLEVBQUUsWUFBWSxHQUFHLE9BQU8sRUFBRTtBQUFBLE1BQzFCLEVBQUUsWUFBWSxHQUFHLE9BQU8sRUFBRTtBQUFBLE1BQzFCLEVBQUUsWUFBWSxHQUFHLE9BQU8sRUFBRTtBQUFBLE1BQzFCLEVBQUUsWUFBWSxJQUFJLE9BQU8sRUFBRTtBQUFBLE1BQzNCLEVBQUUsWUFBWSxJQUFJLE9BQU8sRUFBRTtBQUFBLElBQzVCO0FBQUEsSUFDQTtBQUFBLE1BQ0MsRUFBRSxZQUFZLEdBQUcsT0FBTyxHQUFHO0FBQUEsTUFDM0IsRUFBRSxZQUFZLEdBQUcsT0FBTyxHQUFHO0FBQUEsTUFDM0IsRUFBRSxZQUFZLEdBQUcsT0FBTyxHQUFHO0FBQUEsTUFDM0IsRUFBRSxZQUFZLElBQUksT0FBTyxHQUFHO0FBQUEsTUFDNUIsRUFBRSxZQUFZLElBQUksT0FBTyxHQUFHO0FBQUEsTUFDNUIsRUFBRSxZQUFZLElBQUksT0FBTyxHQUFHO0FBQUEsTUFDNUIsRUFBRSxZQUFZLElBQUksT0FBTyxHQUFHO0FBQUEsSUFDN0I7QUFBQSxJQUNBO0FBQUEsTUFDQyxFQUFFLFlBQVksR0FBRyxPQUFPLEdBQUc7QUFBQSxJQUM1QjtBQUFBLElBQ0E7QUFBQSxNQUNDLEVBQUUsWUFBWSxHQUFHLE9BQU8sR0FBRztBQUFBLE1BQzNCLEVBQUUsWUFBWSxHQUFHLE9BQU8sR0FBRztBQUFBLE1BQzNCLEVBQUUsWUFBWSxHQUFHLE9BQU8sR0FBRztBQUFBLE1BQzNCLEVBQUUsWUFBWSxJ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TyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsVUFDMUI7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIs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QUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEVBQUU7QUFBQSxZQUN4QixFQUFFLFVBQVUsR0FBRyxPQUFPLEVBQUU7QUFBQSxZQUN4QixFQUFFLFVBQVUsSUFBSSxPQUFPLEVBQUU7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEVBQUU7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEVBQUU7QUFBQSxZQUN4QixFQUFFLFVBQVUsR0FBRyxPQUFPLEVBQUU7QUFBQSxZQUN4QixFQUFFLFVBQVUsSUFBSSxPQUFPLEVBQUU7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEVBQUU7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEVBQUU7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEseUNBQW1DLHNCQUFzQjtBQUFBLFFBQ3hELFVBQVUsQ0FBQztBQUFBLFFBQ1gsVUFBVSxDQUFDO0FBQUEsUUFDWCxVQUFVLENBQUM7QUFBQSxRQUNYLFVBQVUsQ0FBQztBQUFBLFFBQ1gsVUFBVSxDQUFDO0FBQUEsUUFDWCxVQUFVLENBQUM7QUFBQSxRQUNYLFVBQVUsQ0FBQztBQUFBLFFBQ1gsVUFBVSxDQUFDO0FBQUEsUUFDWCxVQUFVLENBQUM7QUFBQSxRQUNYLFVBQVUsQ0FBQztBQUFBLFFBQ1gsVUFBVSxFQUFFO0FBQUEsUUFDWixVQUFVLEVBQUU7QUFBQSxNQUNiLENBQUM7QUFFRCwyQkFBcUIsZUFBZSxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUMzRCxhQUFPLFlBQVkscUJBQXFCLGlCQUFpQixHQUFHLENBQUM7QUFDN0QsYUFBTyxZQUFZLHFCQUFxQix1QkFBdUIsR0FBRyxDQUFDLEdBQUcsSUFBSTtBQUMxRSxhQUFPLFlBQVkscUJBQXFCLHVCQUF1QixHQUFHLENBQUMsR0FBRyxLQUFLO0FBQzNFLGFBQU8sWUFBWSxxQkFBcUIsdUJBQXVCLEdBQUcsQ0FBQyxHQUFHLEtBQUs7QUFDM0UsYUFBTyxZQUFZLHFCQUFxQix1QkFBdUIsR0FBRyxDQUFDLEdBQUcsS0FBSztBQUMzRSxhQUFPLFlBQVkscUJBQXFCLHVCQUF1QixHQUFHLENBQUMsR0FBRyxJQUFJO0FBQzFFLGFBQU8sWUFBWSxxQkFBcUIsdUJBQXVCLEdBQUcsQ0FBQyxHQUFHLElBQUk7QUFDMUUsYUFBTyxZQUFZLHFCQUFxQix1QkFBdUIsR0FBRyxDQUFDLEdBQUcsSUFBSTtBQUMxRSxhQUFPLFlBQVkscUJBQXFCLHVCQUF1QixHQUFHLENBQUMsR0FBRyxJQUFJO0FBRTFFLHlDQUFtQyxzQkFBc0I7QUFBQSxRQUN4RCxVQUFVLENBQUM7QUFBQSxRQUNYLFVBQVUsQ0FBQztBQUFBLFFBQ1gsVUFBVSxDQUFDO0FBQUEsUUFDWCxVQUFVLENBQUM7QUFBQSxRQUNYLFVBQVUsQ0FBQztBQUFBLFFBQ1gsVUFBVSxDQUFDO0FBQUEsUUFDWCxVQUFVLEVBQUU7QUFBQSxRQUNaLFVBQVUsRUFBRTtBQUFBLE1BQ2IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxpQkFBaUIsQ0FBQyxHQUFHLENBQUM7QUFBQSxNQUMzQixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDM0IsU0FBUztBQUFBLFFBQ1IsYUFBYTtBQUFBLFFBQ2IsT0FBTztBQUFBLFVBQ04sU0FBUztBQUFBLFVBQ1QsaUJBQWlCO0FBQUEsUUFDbEI7QUFBQSxRQUNBLGlCQUFpQjtBQUFBLE1BQ2xCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRiw2QkFBeUIsT0FBTyxrQkFBa0IsSUFBSSxPQUFPLENBQUMseUJBQXlCO0FBQ3RGLGFBQU8sWUFBWSxxQkFBcUIsaUJBQWlCLEdBQUcsRUFBRTtBQUU5RCxhQUFPLFlBQVkscUJBQXFCLHFCQUFxQixDQUFDLEdBQUcsRUFBRTtBQUVuRSxZQUFNLFlBQTZDO0FBQUEsUUFDbEQ7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLEVBQUUsVUFBVSxHQUFHLE9BQU8sRUFBRTtBQUFBLFlBQ3hCLEVBQUUsVUFBVSxHQUFHLE9BQU8sRUFBRTtBQUFBLFlBQ3hCLEVBQUUsVUFBVSxHQUFHLE9BQU8sRUFBRTtBQUFBLFlBQ3hCLEVBQUUsVUFBVSxJQUFJLE9BQU8sRUFBRTtBQUFBLFVBQzFCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVEsQ0FBQyxFQUFFLFVBQVUsSUFBSSxPQUFPLEVBQUUsQ0FBQztBQUFBLFFBQ3BDO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLElBQUksT0FBTyxFQUFFO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxFQUFFO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxFQUFFO0FBQUEsVUFDMUI7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FBTyxFQUFFO0FBQUEsWUFDeEIsRUFBRSxVQUFVLEdBQUcsT0FBTyxFQUFFO0FBQUEsWUFDeEIsRUFBRSxVQUFVLElBQUksT0FBTyxFQUFFO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxFQUFFO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxFQUFFO0FBQUEsVUFDMUI7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsVUFDMUI7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsWUFDekIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsWUFDMUIsRUFBRSxVQUFVLElBQUksT0FBTyxHQUFHO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FBTyxHQUFHO0FBQUEsVUFDMUI7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUztBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsRUFBRSxVQUFVLEdBQUcsT0FB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
