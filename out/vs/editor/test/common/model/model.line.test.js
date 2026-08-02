import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { computeIndentLevel } from "../../../common/model/utils.js";
import { ContiguousMultilineTokensBuilder } from "../../../common/tokens/contiguousMultilineTokensBuilder.js";
import { LineTokens } from "../../../common/tokens/lineTokens.js";
import { TestLineTokenFactory } from "../core/testLineToken.js";
import { createTextModel } from "../testTextModel.js";
function assertLineTokens(__actual, _expected) {
  const tmp = TestToken.toTokens(_expected);
  LineTokens.convertToEndOffset(tmp, __actual.getLineContent().length);
  const expected = TestLineTokenFactory.inflateArr(tmp);
  const _actual = __actual.inflate();
  const actual = [];
  for (let i = 0, len = _actual.getCount(); i < len; i++) {
    actual[i] = {
      endIndex: _actual.getEndOffset(i),
      type: _actual.getClassName(i)
    };
  }
  const decode = (token) => {
    return {
      endIndex: token.endIndex,
      type: token.getType()
    };
  };
  assert.deepStrictEqual(actual, expected.map(decode));
}
suite("ModelLine - getIndentLevel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertIndentLevel(text, expected, tabSize = 4) {
    const actual = computeIndentLevel(text, tabSize);
    assert.strictEqual(actual, expected, text);
  }
  test("getIndentLevel", () => {
    assertIndentLevel("", -1);
    assertIndentLevel(" ", -1);
    assertIndentLevel("   	", -1);
    assertIndentLevel("Hello", 0);
    assertIndentLevel(" Hello", 1);
    assertIndentLevel("   Hello", 3);
    assertIndentLevel("	Hello", 4);
    assertIndentLevel(" 	Hello", 4);
    assertIndentLevel("  	Hello", 4);
    assertIndentLevel("   	Hello", 4);
    assertIndentLevel("    	Hello", 8);
    assertIndentLevel("     	Hello", 8);
    assertIndentLevel("	 Hello", 5);
    assertIndentLevel("	 	Hello", 8);
  });
});
class TestToken {
  constructor(startOffset, color) {
    this.startOffset = startOffset;
    this.color = color;
  }
  static toTokens(tokens) {
    if (tokens === null) {
      return null;
    }
    const tokensLen = tokens.length;
    const result = new Uint32Array(tokensLen << 1);
    for (let i = 0; i < tokensLen; i++) {
      const token = tokens[i];
      result[i << 1] = token.startOffset;
      result[(i << 1) + 1] = token.color << MetadataConsts.FOREGROUND_OFFSET >>> 0;
    }
    return result;
  }
}
class ManualTokenizationSupport {
  constructor() {
    this.tokens = /* @__PURE__ */ new Map();
    this.stores = /* @__PURE__ */ new Set();
  }
  setLineTokens(lineNumber, tokens) {
    const b = new ContiguousMultilineTokensBuilder();
    b.add(lineNumber, tokens);
    for (const s of this.stores) {
      s.setTokens(b.finalize());
    }
  }
  getInitialState() {
    return new LineState(1);
  }
  tokenize(line, hasEOL, state) {
    throw new Error();
  }
  tokenizeEncoded(line, hasEOL, state) {
    const s = state;
    return new EncodedTokenizationResult(this.tokens.get(s.lineNumber), [], new LineState(s.lineNumber + 1));
  }
  /**
   * Can be/return undefined if default background tokenization should be used.
   */
  createBackgroundTokenizer(textModel, store) {
    this.stores.add(store);
    return {
      dispose: () => {
        this.stores.delete(store);
      },
      requestTokens(startLineNumber, endLineNumberExclusive) {
      }
    };
  }
}
class LineState {
  constructor(lineNumber) {
    this.lineNumber = lineNumber;
  }
  clone() {
    return this;
  }
  equals(other) {
    return other.lineNumber === this.lineNumber;
  }
}
suite("ModelLinesTokens", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testApplyEdits(initial, edits, expected) {
    const initialText = initial.map((el) => el.text).join("\n");
    const s = new ManualTokenizationSupport();
    const d = TokenizationRegistry.register("test", s);
    const model = createTextModel(initialText, "test");
    model.onBeforeAttached();
    for (let lineIndex = 0; lineIndex < initial.length; lineIndex++) {
      const lineTokens = initial[lineIndex].tokens;
      const lineTextLength = model.getLineMaxColumn(lineIndex + 1) - 1;
      const tokens = TestToken.toTokens(lineTokens);
      LineTokens.convertToEndOffset(tokens, lineTextLength);
      s.setLineTokens(lineIndex + 1, tokens);
    }
    model.applyEdits(edits.map((ed) => ({
      identifier: null,
      range: ed.range,
      text: ed.text,
      forceMoveMarkers: false
    })));
    for (let lineIndex = 0; lineIndex < expected.length; lineIndex++) {
      const actualLine = model.getLineContent(lineIndex + 1);
      const actualTokens = model.tokenization.getLineTokens(lineIndex + 1);
      assert.strictEqual(actualLine, expected[lineIndex].text);
      assertLineTokens(actualTokens, expected[lineIndex].tokens);
    }
    model.dispose();
    d.dispose();
  }
  test("single delete 1", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 2), text: "" }],
      [{
        text: "ello world",
        tokens: [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]
      }]
    );
  });
  test("single delete 2", () => {
    testApplyEdits(
      [{
        text: "helloworld",
        tokens: [new TestToken(0, 1), new TestToken(5, 2)]
      }],
      [{ range: new Range(1, 3, 1, 8), text: "" }],
      [{
        text: "herld",
        tokens: [new TestToken(0, 1), new TestToken(2, 2)]
      }]
    );
  });
  test("single delete 3", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 6), text: "" }],
      [{
        text: " world",
        tokens: [new TestToken(0, 2), new TestToken(1, 3)]
      }]
    );
  });
  test("single delete 4", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 2, 1, 7), text: "" }],
      [{
        text: "hworld",
        tokens: [new TestToken(0, 1), new TestToken(1, 3)]
      }]
    );
  });
  test("single delete 5", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 12), text: "" }],
      [{
        text: "",
        tokens: [new TestToken(0, 1)]
      }]
    );
  });
  test("multi delete 6", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }],
      [{ range: new Range(1, 6, 3, 6), text: "" }],
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 8), new TestToken(6, 9)]
      }]
    );
  });
  test("multi delete 7", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }],
      [{ range: new Range(1, 12, 3, 12), text: "" }],
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }]
    );
  });
  test("multi delete 8", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }],
      [{ range: new Range(1, 1, 3, 1), text: "" }],
      [{
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }]
    );
  });
  test("multi delete 9", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }],
      [{ range: new Range(1, 12, 3, 1), text: "" }],
      [{
        text: "hello worldhello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3), new TestToken(11, 7), new TestToken(16, 8), new TestToken(17, 9)]
      }]
    );
  });
  test("single insert 1", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 1), text: "xx" }],
      [{
        text: "xxhello world",
        tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
      }]
    );
  });
  test("single insert 2", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 2, 1, 2), text: "xx" }],
      [{
        text: "hxxello world",
        tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
      }]
    );
  });
  test("single insert 3", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 6, 1, 6), text: "xx" }],
      [{
        text: "helloxx world",
        tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
      }]
    );
  });
  test("single insert 4", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 7, 1, 7), text: "xx" }],
      [{
        text: "hello xxworld",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(8, 3)]
      }]
    );
  });
  test("single insert 5", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 12, 1, 12), text: "xx" }],
      [{
        text: "hello worldxx",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }]
    );
  });
  test("multi insert 6", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 1), text: "\n" }],
      [{
        text: "",
        tokens: [new TestToken(0, 1)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 1)]
      }]
    );
  });
  test("multi insert 7", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 12, 1, 12), text: "\n" }],
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "",
        tokens: [new TestToken(0, 1)]
      }]
    );
  });
  test("multi insert 8", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 7, 1, 7), text: "\n" }],
      [{
        text: "hello ",
        tokens: [new TestToken(0, 1), new TestToken(5, 2)]
      }, {
        text: "world",
        tokens: [new TestToken(0, 1)]
      }]
    );
  });
  test("multi insert 9", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }],
      [{ range: new Range(1, 7, 1, 7), text: "xx\nyy" }],
      [{
        text: "hello xx",
        tokens: [new TestToken(0, 1), new TestToken(5, 2)]
      }, {
        text: "yyworld",
        tokens: [new TestToken(0, 1)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }]
    );
  });
  function testLineEditTokens(initialText, initialTokens, edits, expectedText, expectedTokens) {
    testApplyEdits(
      [{
        text: initialText,
        tokens: initialTokens
      }],
      edits.map((ed) => ({
        range: new Range(1, ed.startColumn, 1, ed.endColumn),
        text: ed.text
      })),
      [{
        text: expectedText,
        tokens: expectedTokens
      }]
    );
  }
  test("insertion on empty line", () => {
    const s = new ManualTokenizationSupport();
    const d = TokenizationRegistry.register("test", s);
    const model = createTextModel("some text", "test");
    const tokens = TestToken.toTokens([new TestToken(0, 1)]);
    LineTokens.convertToEndOffset(tokens, model.getLineMaxColumn(1) - 1);
    s.setLineTokens(1, tokens);
    model.applyEdits([{
      range: new Range(1, 1, 1, 10),
      text: ""
    }]);
    s.setLineTokens(1, new Uint32Array(0));
    model.applyEdits([{
      range: new Range(1, 1, 1, 1),
      text: "a"
    }]);
    const actualTokens = model.tokenization.getLineTokens(1);
    assertLineTokens(actualTokens, [new TestToken(0, 1)]);
    model.dispose();
    d.dispose();
  });
  test("updates tokens on insertion 1", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 1,
        text: "a"
      }],
      "aabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(5, 2),
        new TestToken(6, 3)
      ]
    );
  });
  test("updates tokens on insertion 2", () => {
    testLineEditTokens(
      "aabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(5, 2),
        new TestToken(6, 3)
      ],
      [{
        startColumn: 2,
        endColumn: 2,
        text: "x"
      }],
      "axabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(6, 2),
        new TestToken(7, 3)
      ]
    );
  });
  test("updates tokens on insertion 3", () => {
    testLineEditTokens(
      "axabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(6, 2),
        new TestToken(7, 3)
      ],
      [{
        startColumn: 3,
        endColumn: 3,
        text: "stu"
      }],
      "axstuabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(9, 2),
        new TestToken(10, 3)
      ]
    );
  });
  test("updates tokens on insertion 4", () => {
    testLineEditTokens(
      "axstuabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(9, 2),
        new TestToken(10, 3)
      ],
      [{
        startColumn: 10,
        endColumn: 10,
        text: "	"
      }],
      "axstuabcd	 efgh",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(11, 3)
      ]
    );
  });
  test("updates tokens on insertion 5", () => {
    testLineEditTokens(
      "axstuabcd	 efgh",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(11, 3)
      ],
      [{
        startColumn: 12,
        endColumn: 12,
        text: "dd"
      }],
      "axstuabcd	 ddefgh",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(13, 3)
      ]
    );
  });
  test("updates tokens on insertion 6", () => {
    testLineEditTokens(
      "axstuabcd	 ddefgh",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(13, 3)
      ],
      [{
        startColumn: 18,
        endColumn: 18,
        text: "xyz"
      }],
      "axstuabcd	 ddefghxyz",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(13, 3)
      ]
    );
  });
  test("updates tokens on insertion 7", () => {
    testLineEditTokens(
      "axstuabcd	 ddefghxyz",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(13, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 1,
        text: "x"
      }],
      "xaxstuabcd	 ddefghxyz",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ]
    );
  });
  test("updates tokens on insertion 8", () => {
    testLineEditTokens(
      "xaxstuabcd	 ddefghxyz",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ],
      [{
        startColumn: 22,
        endColumn: 22,
        text: "x"
      }],
      "xaxstuabcd	 ddefghxyzx",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ]
    );
  });
  test("updates tokens on insertion 9", () => {
    testLineEditTokens(
      "xaxstuabcd	 ddefghxyzx",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ],
      [{
        startColumn: 2,
        endColumn: 2,
        text: ""
      }],
      "xaxstuabcd	 ddefghxyzx",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ]
    );
  });
  test("updates tokens on insertion 10", () => {
    testLineEditTokens(
      "",
      [],
      [{
        startColumn: 1,
        endColumn: 1,
        text: "a"
      }],
      "a",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("delete second token 2", () => {
    testLineEditTokens(
      "abcdefghij",
      [
        new TestToken(0, 1),
        new TestToken(3, 2),
        new TestToken(6, 3)
      ],
      [{
        startColumn: 4,
        endColumn: 7,
        text: ""
      }],
      "abcghij",
      [
        new TestToken(0, 1),
        new TestToken(3, 3)
      ]
    );
  });
  test("insert right before second token", () => {
    testLineEditTokens(
      "abcdefghij",
      [
        new TestToken(0, 1),
        new TestToken(3, 2),
        new TestToken(6, 3)
      ],
      [{
        startColumn: 4,
        endColumn: 4,
        text: "hello"
      }],
      "abchellodefghij",
      [
        new TestToken(0, 1),
        new TestToken(8, 2),
        new TestToken(11, 3)
      ]
    );
  });
  test("delete first char", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 2,
        text: ""
      }],
      "bcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(3, 2),
        new TestToken(4, 3)
      ]
    );
  });
  test("delete 2nd and 3rd chars", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 2,
        endColumn: 4,
        text: ""
      }],
      "ad efgh",
      [
        new TestToken(0, 1),
        new TestToken(2, 2),
        new TestToken(3, 3)
      ]
    );
  });
  test("delete first token", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 5,
        text: ""
      }],
      " efgh",
      [
        new TestToken(0, 2),
        new TestToken(1, 3)
      ]
    );
  });
  test("delete second token", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 5,
        endColumn: 6,
        text: ""
      }],
      "abcdefgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 3)
      ]
    );
  });
  test("delete second token + a bit of the third one", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 5,
        endColumn: 7,
        text: ""
      }],
      "abcdfgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 3)
      ]
    );
  });
  test("delete second and third token", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 5,
        endColumn: 10,
        text: ""
      }],
      "abcd",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("delete everything", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 10,
        text: ""
      }],
      "",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("noop", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 1,
        text: ""
      }],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("equivalent to deleting first two chars", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 3,
        text: ""
      }],
      "cd efgh",
      [
        new TestToken(0, 1),
        new TestToken(2, 2),
        new TestToken(3, 3)
      ]
    );
  });
  test("equivalent to deleting from 5 to the end", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 5,
        endColumn: 10,
        text: ""
      }],
      "abcd",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("updates tokens on replace 1", () => {
    testLineEditTokens(
      "Hello world, ciao",
      [
        new TestToken(0, 1),
        new TestToken(5, 0),
        new TestToken(6, 2),
        new TestToken(11, 0),
        new TestToken(13, 0)
      ],
      [{
        startColumn: 1,
        endColumn: 6,
        text: "Hi"
      }],
      "Hi world, ciao",
      [
        new TestToken(0, 0),
        new TestToken(3, 2),
        new TestToken(8, 0),
        new TestToken(10, 0)
      ]
    );
  });
  test("updates tokens on replace 2", () => {
    testLineEditTokens(
      "Hello world, ciao",
      [
        new TestToken(0, 1),
        new TestToken(5, 0),
        new TestToken(6, 2),
        new TestToken(11, 0),
        new TestToken(13, 0)
      ],
      [{
        startColumn: 1,
        endColumn: 6,
        text: "Hi"
      }, {
        startColumn: 8,
        endColumn: 12,
        text: "my friends"
      }],
      "Hi wmy friends, ciao",
      [
        new TestToken(0, 0),
        new TestToken(3, 2),
        new TestToken(14, 0),
        new TestToken(16, 0)
      ]
    );
  });
  function testLineSplitTokens(initialText, initialTokens, splitColumn, expectedText1, expectedText2, expectedTokens) {
    testApplyEdits(
      [{
        text: initialText,
        tokens: initialTokens
      }],
      [{
        range: new Range(1, splitColumn, 1, splitColumn),
        text: "\n"
      }],
      [{
        text: expectedText1,
        tokens: expectedTokens
      }, {
        text: expectedText2,
        tokens: [new TestToken(0, 1)]
      }]
    );
  }
  test("split at the beginning", () => {
    testLineSplitTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      1,
      "",
      "abcd efgh",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("split at the end", () => {
    testLineSplitTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      10,
      "abcd efgh",
      "",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("split inthe middle 1", () => {
    testLineSplitTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      5,
      "abcd",
      " efgh",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("split inthe middle 2", () => {
    testLineSplitTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      6,
      "abcd ",
      "efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2)
      ]
    );
  });
  function testLineAppendTokens(aText, aTokens, bText, bTokens, expectedText, expectedTokens) {
    testApplyEdits(
      [{
        text: aText,
        tokens: aTokens
      }, {
        text: bText,
        tokens: bTokens
      }],
      [{
        range: new Range(1, aText.length + 1, 2, 1),
        text: ""
      }],
      [{
        text: expectedText,
        tokens: expectedTokens
      }]
    );
  }
  test("append empty 1", () => {
    testLineAppendTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      "",
      [],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("append empty 2", () => {
    testLineAppendTokens(
      "",
      [],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("append 1", () => {
    testLineAppendTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      "abcd efgh",
      [
        new TestToken(0, 4),
        new TestToken(4, 5),
        new TestToken(5, 6)
      ],
      "abcd efghabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3),
        new TestToken(9, 4),
        new TestToken(13, 5),
        new TestToken(14, 6)
      ]
    );
  });
  test("append 2", () => {
    testLineAppendTokens(
      "abcd ",
      [
        new TestToken(0, 1),
        new TestToken(4, 2)
      ],
      "efgh",
      [
        new TestToken(0, 3)
      ],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("append 3", () => {
    testLineAppendTokens(
      "abcd",
      [
        new TestToken(0, 1)
      ],
      " efgh",
      [
        new TestToken(0, 2),
        new TestToken(1, 3)
      ],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9tb2RlbC5saW5lLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTWV0YWRhdGFDb25zdHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0LCBJQmFja2dyb3VuZFRva2VuaXphdGlvblN0b3JlLCBJQmFja2dyb3VuZFRva2VuaXplciwgSVN0YXRlLCBJVG9rZW5pemF0aW9uU3VwcG9ydCwgVG9rZW5pemF0aW9uUmVnaXN0cnksIFRva2VuaXphdGlvblJlc3VsdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBjb21wdXRlSW5kZW50TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29udGlndW91c011bHRpbGluZVRva2Vuc0J1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9rZW5zL2NvbnRpZ3VvdXNNdWx0aWxpbmVUb2tlbnNCdWlsZGVyLmpzJztcbmltcG9ydCB7IExpbmVUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgVGVzdExpbmVUb2tlbiwgVGVzdExpbmVUb2tlbkZhY3RvcnkgfSBmcm9tICcuLi9jb3JlL3Rlc3RMaW5lVG9rZW4uanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5cbmludGVyZmFjZSBJTGluZUVkaXQge1xuXHRzdGFydENvbHVtbjogbnVtYmVyO1xuXHRlbmRDb2x1bW46IG51bWJlcjtcblx0dGV4dDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRMaW5lVG9rZW5zKF9fYWN0dWFsOiBMaW5lVG9rZW5zLCBfZXhwZWN0ZWQ6IFRlc3RUb2tlbltdKTogdm9pZCB7XG5cdGNvbnN0IHRtcCA9IFRlc3RUb2tlbi50b1Rva2VucyhfZXhwZWN0ZWQpO1xuXHRMaW5lVG9rZW5zLmNvbnZlcnRUb0VuZE9mZnNldCh0bXAsIF9fYWN0dWFsLmdldExpbmVDb250ZW50KCkubGVuZ3RoKTtcblx0Y29uc3QgZXhwZWN0ZWQgPSBUZXN0TGluZVRva2VuRmFjdG9yeS5pbmZsYXRlQXJyKHRtcCk7XG5cdGNvbnN0IF9hY3R1YWwgPSBfX2FjdHVhbC5pbmZsYXRlKCk7XG5cdGludGVyZmFjZSBJVGVzdFRva2VuIHtcblx0XHRlbmRJbmRleDogbnVtYmVyO1xuXHRcdHR5cGU6IHN0cmluZztcblx0fVxuXHRjb25zdCBhY3R1YWw6IElUZXN0VG9rZW5bXSA9IFtdO1xuXHRmb3IgKGxldCBpID0gMCwgbGVuID0gX2FjdHVhbC5nZXRDb3VudCgpOyBpIDwgbGVuOyBpKyspIHtcblx0XHRhY3R1YWxbaV0gPSB7XG5cdFx0XHRlbmRJbmRleDogX2FjdHVhbC5nZXRFbmRPZmZzZXQoaSksXG5cdFx0XHR0eXBlOiBfYWN0dWFsLmdldENsYXNzTmFtZShpKVxuXHRcdH07XG5cdH1cblx0Y29uc3QgZGVjb2RlID0gKHRva2VuOiBUZXN0TGluZVRva2VuKSA9PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuZEluZGV4OiB0b2tlbi5lbmRJbmRleCxcblx0XHRcdHR5cGU6IHRva2VuLmdldFR5cGUoKVxuXHRcdH07XG5cdH07XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZC5tYXAoZGVjb2RlKSk7XG59XG5cbnN1aXRlKCdNb2RlbExpbmUgLSBnZXRJbmRlbnRMZXZlbCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBhc3NlcnRJbmRlbnRMZXZlbCh0ZXh0OiBzdHJpbmcsIGV4cGVjdGVkOiBudW1iZXIsIHRhYlNpemU6IG51bWJlciA9IDQpOiB2b2lkIHtcblx0XHRjb25zdCBhY3R1YWwgPSBjb21wdXRlSW5kZW50TGV2ZWwodGV4dCwgdGFiU2l6ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIHRleHQpO1xuXHR9XG5cblx0dGVzdCgnZ2V0SW5kZW50TGV2ZWwnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50TGV2ZWwoJycsIC0xKTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnICcsIC0xKTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnICAgXFx0JywgLTEpO1xuXHRcdGFzc2VydEluZGVudExldmVsKCdIZWxsbycsIDApO1xuXHRcdGFzc2VydEluZGVudExldmVsKCcgSGVsbG8nLCAxKTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnICAgSGVsbG8nLCAzKTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnXFx0SGVsbG8nLCA0KTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnIFxcdEhlbGxvJywgNCk7XG5cdFx0YXNzZXJ0SW5kZW50TGV2ZWwoJyAgXFx0SGVsbG8nLCA0KTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnICAgXFx0SGVsbG8nLCA0KTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnICAgIFxcdEhlbGxvJywgOCk7XG5cdFx0YXNzZXJ0SW5kZW50TGV2ZWwoJyAgICAgXFx0SGVsbG8nLCA4KTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnXFx0IEhlbGxvJywgNSk7XG5cdFx0YXNzZXJ0SW5kZW50TGV2ZWwoJ1xcdCBcXHRIZWxsbycsIDgpO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBUZXN0VG9rZW4ge1xuXHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRPZmZzZXQ6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGNvbG9yOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3Ioc3RhcnRPZmZzZXQ6IG51bWJlciwgY29sb3I6IG51bWJlcikge1xuXHRcdHRoaXMuc3RhcnRPZmZzZXQgPSBzdGFydE9mZnNldDtcblx0XHR0aGlzLmNvbG9yID0gY29sb3I7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHRvVG9rZW5zKHRva2VuczogVGVzdFRva2VuW10pOiBVaW50MzJBcnJheTtcblx0cHVibGljIHN0YXRpYyB0b1Rva2Vucyh0b2tlbnM6IFRlc3RUb2tlbltdIHwgbnVsbCk6IFVpbnQzMkFycmF5IHwgbnVsbCB7XG5cdFx0aWYgKHRva2VucyA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHRva2Vuc0xlbiA9IHRva2Vucy5sZW5ndGg7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFVpbnQzMkFycmF5KCh0b2tlbnNMZW4gPDwgMSkpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5zTGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHRva2VuID0gdG9rZW5zW2ldO1xuXHRcdFx0cmVzdWx0WyhpIDw8IDEpXSA9IHRva2VuLnN0YXJ0T2Zmc2V0O1xuXHRcdFx0cmVzdWx0WyhpIDw8IDEpICsgMV0gPSAoXG5cdFx0XHRcdHRva2VuLmNvbG9yIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUXG5cdFx0XHQpID4+PiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmNsYXNzIE1hbnVhbFRva2VuaXphdGlvblN1cHBvcnQgaW1wbGVtZW50cyBJVG9rZW5pemF0aW9uU3VwcG9ydCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9rZW5zID0gbmV3IE1hcDxudW1iZXIsIFVpbnQzMkFycmF5PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0b3JlcyA9IG5ldyBTZXQ8SUJhY2tncm91bmRUb2tlbml6YXRpb25TdG9yZT4oKTtcblxuXHRwdWJsaWMgc2V0TGluZVRva2VucyhsaW5lTnVtYmVyOiBudW1iZXIsIHRva2VuczogVWludDMyQXJyYXkpOiB2b2lkIHtcblx0XHRjb25zdCBiID0gbmV3IENvbnRpZ3VvdXNNdWx0aWxpbmVUb2tlbnNCdWlsZGVyKCk7XG5cdFx0Yi5hZGQobGluZU51bWJlciwgdG9rZW5zKTtcblx0XHRmb3IgKGNvbnN0IHMgb2YgdGhpcy5zdG9yZXMpIHtcblx0XHRcdHMuc2V0VG9rZW5zKGIuZmluYWxpemUoKSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0SW5pdGlhbFN0YXRlKCk6IElTdGF0ZSB7XG5cdFx0cmV0dXJuIG5ldyBMaW5lU3RhdGUoMSk7XG5cdH1cblxuXHR0b2tlbml6ZShsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IElTdGF0ZSk6IFRva2VuaXphdGlvblJlc3VsdCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCk7XG5cdH1cblxuXHR0b2tlbml6ZUVuY29kZWQobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBJU3RhdGUpOiBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0IHtcblx0XHRjb25zdCBzID0gc3RhdGUgYXMgTGluZVN0YXRlO1xuXHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCh0aGlzLnRva2Vucy5nZXQocy5saW5lTnVtYmVyKSEsIFtdLCBuZXcgTGluZVN0YXRlKHMubGluZU51bWJlciArIDEpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW4gYmUvcmV0dXJuIHVuZGVmaW5lZCBpZiBkZWZhdWx0IGJhY2tncm91bmQgdG9rZW5pemF0aW9uIHNob3VsZCBiZSB1c2VkLlxuXHQgKi9cblx0Y3JlYXRlQmFja2dyb3VuZFRva2VuaXplcj8odGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBzdG9yZTogSUJhY2tncm91bmRUb2tlbml6YXRpb25TdG9yZSk6IElCYWNrZ3JvdW5kVG9rZW5pemVyIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLnN0b3Jlcy5hZGQoc3RvcmUpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc3RvcmVzLmRlbGV0ZShzdG9yZSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVxdWVzdFRva2VucyhzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXJFeGNsdXNpdmUpIHtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBMaW5lU3RhdGUgaW1wbGVtZW50cyBJU3RhdGUge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgbGluZU51bWJlcjogbnVtYmVyKSB7IH1cblx0Y2xvbmUoKTogSVN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXHRlcXVhbHMob3RoZXI6IElTdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAob3RoZXIgYXMgTGluZVN0YXRlKS5saW5lTnVtYmVyID09PSB0aGlzLmxpbmVOdW1iZXI7XG5cdH1cbn1cblxuc3VpdGUoJ01vZGVsTGluZXNUb2tlbnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0aW50ZXJmYWNlIElCdWZmZXJMaW5lU3RhdGUge1xuXHRcdHRleHQ6IHN0cmluZztcblx0XHR0b2tlbnM6IFRlc3RUb2tlbltdO1xuXHR9XG5cblx0aW50ZXJmYWNlIElFZGl0IHtcblx0XHRyYW5nZTogUmFuZ2U7XG5cdFx0dGV4dDogc3RyaW5nO1xuXHR9XG5cblx0ZnVuY3Rpb24gdGVzdEFwcGx5RWRpdHMoaW5pdGlhbDogSUJ1ZmZlckxpbmVTdGF0ZVtdLCBlZGl0czogSUVkaXRbXSwgZXhwZWN0ZWQ6IElCdWZmZXJMaW5lU3RhdGVbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGluaXRpYWxUZXh0ID0gaW5pdGlhbC5tYXAoZWwgPT4gZWwudGV4dCkuam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBzID0gbmV3IE1hbnVhbFRva2VuaXphdGlvblN1cHBvcnQoKTtcblx0XHRjb25zdCBkID0gVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoJ3Rlc3QnLCBzKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGluaXRpYWxUZXh0LCAndGVzdCcpO1xuXHRcdG1vZGVsLm9uQmVmb3JlQXR0YWNoZWQoKTtcblx0XHRmb3IgKGxldCBsaW5lSW5kZXggPSAwOyBsaW5lSW5kZXggPCBpbml0aWFsLmxlbmd0aDsgbGluZUluZGV4KyspIHtcblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBpbml0aWFsW2xpbmVJbmRleF0udG9rZW5zO1xuXHRcdFx0Y29uc3QgbGluZVRleHRMZW5ndGggPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVJbmRleCArIDEpIC0gMTtcblx0XHRcdGNvbnN0IHRva2VucyA9IFRlc3RUb2tlbi50b1Rva2VucyhsaW5lVG9rZW5zKTtcblx0XHRcdExpbmVUb2tlbnMuY29udmVydFRvRW5kT2Zmc2V0KHRva2VucywgbGluZVRleHRMZW5ndGgpO1xuXHRcdFx0cy5zZXRMaW5lVG9rZW5zKGxpbmVJbmRleCArIDEsIHRva2Vucyk7XG5cdFx0fVxuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhlZGl0cy5tYXAoKGVkKSA9PiAoe1xuXHRcdFx0aWRlbnRpZmllcjogbnVsbCxcblx0XHRcdHJhbmdlOiBlZC5yYW5nZSxcblx0XHRcdHRleHQ6IGVkLnRleHQsXG5cdFx0XHRmb3JjZU1vdmVNYXJrZXJzOiBmYWxzZVxuXHRcdH0pKSk7XG5cblx0XHRmb3IgKGxldCBsaW5lSW5kZXggPSAwOyBsaW5lSW5kZXggPCBleHBlY3RlZC5sZW5ndGg7IGxpbmVJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBhY3R1YWxMaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZUluZGV4ICsgMSk7XG5cdFx0XHRjb25zdCBhY3R1YWxUb2tlbnMgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lSW5kZXggKyAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxMaW5lLCBleHBlY3RlZFtsaW5lSW5kZXhdLnRleHQpO1xuXHRcdFx0YXNzZXJ0TGluZVRva2VucyhhY3R1YWxUb2tlbnMsIGV4cGVjdGVkW2xpbmVJbmRleF0udG9rZW5zKTtcblx0XHR9XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0ZC5kaXNwb3NlKCk7XG5cdH1cblxuXHR0ZXN0KCdzaW5nbGUgZGVsZXRlIDEnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDIpLCB0ZXh0OiAnJyB9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig0LCAyKSwgbmV3IFRlc3RUb2tlbig1LCAzKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlIGRlbGV0ZSAyJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDMsIDEsIDgpLCB0ZXh0OiAnJyB9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZXJsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oMiwgMildXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBkZWxldGUgMycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHRleHQ6ICcnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMiksIG5ldyBUZXN0VG9rZW4oMSwgMyldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBkZWxldGUgNCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMiwgMSwgNyksIHRleHQ6ICcnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2h3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oMSwgMyldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBkZWxldGUgNScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLCB0ZXh0OiAnJyB9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aSBkZWxldGUgNicsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgNCksIG5ldyBUZXN0VG9rZW4oNSwgNSksIG5ldyBUZXN0VG9rZW4oNiwgNildXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgNyksIG5ldyBUZXN0VG9rZW4oNSwgOCksIG5ldyBUZXN0VG9rZW4oNiwgOSldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNiwgMywgNiksIHRleHQ6ICcnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCA4KSwgbmV3IFRlc3RUb2tlbig2LCA5KV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGkgZGVsZXRlIDcnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDQpLCBuZXcgVGVzdFRva2VuKDUsIDUpLCBuZXcgVGVzdFRva2VuKDYsIDYpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDcpLCBuZXcgVGVzdFRva2VuKDUsIDgpLCBuZXcgVGVzdFRva2VuKDYsIDkpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEyLCAzLCAxMiksIHRleHQ6ICcnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGkgZGVsZXRlIDgnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDQpLCBuZXcgVGVzdFRva2VuKDUsIDUpLCBuZXcgVGVzdFRva2VuKDYsIDYpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDcpLCBuZXcgVGVzdFRva2VuKDUsIDgpLCBuZXcgVGVzdFRva2VuKDYsIDkpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDMsIDEpLCB0ZXh0OiAnJyB9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgNyksIG5ldyBUZXN0VG9rZW4oNSwgOCksIG5ldyBUZXN0VG9rZW4oNiwgOSldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpIGRlbGV0ZSA5JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCA0KSwgbmV3IFRlc3RUb2tlbig1LCA1KSwgbmV3IFRlc3RUb2tlbig2LCA2KV1cblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCA3KSwgbmV3IFRlc3RUb2tlbig1LCA4KSwgbmV3IFRlc3RUb2tlbig2LCA5KV1cblx0XHRcdH1dLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMiwgMywgMSksIHRleHQ6ICcnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpLCBuZXcgVGVzdFRva2VuKDExLCA3KSwgbmV3IFRlc3RUb2tlbigxNiwgOCksIG5ldyBUZXN0VG9rZW4oMTcsIDkpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUgaW5zZXJ0IDEnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAneHgnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ3h4aGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDcsIDIpLCBuZXcgVGVzdFRva2VuKDgsIDMpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUgaW5zZXJ0IDInLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDIsIDEsIDIpLCB0ZXh0OiAneHgnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2h4eGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDcsIDIpLCBuZXcgVGVzdFRva2VuKDgsIDMpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUgaW5zZXJ0IDMnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDYsIDEsIDYpLCB0ZXh0OiAneHgnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxveHggd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDcsIDIpLCBuZXcgVGVzdFRva2VuKDgsIDMpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUgaW5zZXJ0IDQnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDcsIDEsIDcpLCB0ZXh0OiAneHgnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHh4d29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDgsIDMpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUgaW5zZXJ0IDUnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEyLCAxLCAxMiksIHRleHQ6ICd4eCcgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGR4eCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpIGluc2VydCA2JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH1dLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ1xcbicgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKV1cblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGkgaW5zZXJ0IDcnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEyLCAxLCAxMiksIHRleHQ6ICdcXG4nIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJycsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpIGluc2VydCA4JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH1dLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA3LCAxLCA3KSwgdGV4dDogJ1xcbicgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKV1cblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ3dvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGkgaW5zZXJ0IDknLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDQpLCBuZXcgVGVzdFRva2VuKDUsIDUpLCBuZXcgVGVzdFRva2VuKDYsIDYpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDcsIDEsIDcpLCB0ZXh0OiAneHhcXG55eScgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8geHgnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAneXl3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSldXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgNCksIG5ldyBUZXN0VG9rZW4oNSwgNSksIG5ldyBUZXN0VG9rZW4oNiwgNildXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHRlc3RMaW5lRWRpdFRva2Vucyhpbml0aWFsVGV4dDogc3RyaW5nLCBpbml0aWFsVG9rZW5zOiBUZXN0VG9rZW5bXSwgZWRpdHM6IElMaW5lRWRpdFtdLCBleHBlY3RlZFRleHQ6IHN0cmluZywgZXhwZWN0ZWRUb2tlbnM6IFRlc3RUb2tlbltdKTogdm9pZCB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiBpbml0aWFsVGV4dCxcblx0XHRcdFx0dG9rZW5zOiBpbml0aWFsVG9rZW5zXG5cdFx0XHR9XSxcblx0XHRcdGVkaXRzLm1hcCgoZWQpID0+ICh7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgZWQuc3RhcnRDb2x1bW4sIDEsIGVkLmVuZENvbHVtbiksXG5cdFx0XHRcdHRleHQ6IGVkLnRleHRcblx0XHRcdH0pKSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6IGV4cGVjdGVkVGV4dCxcblx0XHRcdFx0dG9rZW5zOiBleHBlY3RlZFRva2Vuc1xuXHRcdFx0fV1cblx0XHQpO1xuXHR9XG5cblx0dGVzdCgnaW5zZXJ0aW9uIG9uIGVtcHR5IGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcyA9IG5ldyBNYW51YWxUb2tlbml6YXRpb25TdXBwb3J0KCk7XG5cdFx0Y29uc3QgZCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKCd0ZXN0Jywgcyk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnc29tZSB0ZXh0JywgJ3Rlc3QnKTtcblx0XHRjb25zdCB0b2tlbnMgPSBUZXN0VG9rZW4udG9Ub2tlbnMoW25ldyBUZXN0VG9rZW4oMCwgMSldKTtcblx0XHRMaW5lVG9rZW5zLmNvbnZlcnRUb0VuZE9mZnNldCh0b2tlbnMsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4oMSkgLSAxKTtcblx0XHRzLnNldExpbmVUb2tlbnMoMSwgdG9rZW5zKTtcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTApLFxuXHRcdFx0dGV4dDogJydcblx0XHR9XSk7XG5cblx0XHRzLnNldExpbmVUb2tlbnMoMSwgbmV3IFVpbnQzMkFycmF5KDApKTtcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksXG5cdFx0XHR0ZXh0OiAnYSdcblx0XHR9XSk7XG5cblx0XHRjb25zdCBhY3R1YWxUb2tlbnMgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucygxKTtcblx0XHRhc3NlcnRMaW5lVG9rZW5zKGFjdHVhbFRva2VucywgW25ldyBUZXN0VG9rZW4oMCwgMSldKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRkLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gaW5zZXJ0aW9uIDEnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxLFxuXHRcdFx0XHR0ZXh0OiAnYScsXG5cdFx0XHR9XSxcblx0XHRcdCdhYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig2LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgdG9rZW5zIG9uIGluc2VydGlvbiAyJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdhYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig2LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAyLFxuXHRcdFx0XHRlbmRDb2x1bW46IDIsXG5cdFx0XHRcdHRleHQ6ICd4Jyxcblx0XHRcdH1dLFxuXHRcdFx0J2F4YWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig2LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig3LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgdG9rZW5zIG9uIGluc2VydGlvbiAzJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdheGFiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNiwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNywgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogMyxcblx0XHRcdFx0ZW5kQ29sdW1uOiAzLFxuXHRcdFx0XHR0ZXh0OiAnc3R1Jyxcblx0XHRcdH1dLFxuXHRcdFx0J2F4c3R1YWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig5LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMCwgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRva2VucyBvbiBpbnNlcnRpb24gNCcsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYXhzdHVhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDksIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEwLCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxMCxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxMCxcblx0XHRcdFx0dGV4dDogJ1xcdCcsXG5cdFx0XHR9XSxcblx0XHRcdCdheHN0dWFiY2RcXHQgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTAsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDExLCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgdG9rZW5zIG9uIGluc2VydGlvbiA1JywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdheHN0dWFiY2RcXHQgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTAsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDExLCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxMixcblx0XHRcdFx0ZW5kQ29sdW1uOiAxMixcblx0XHRcdFx0dGV4dDogJ2RkJyxcblx0XHRcdH1dLFxuXHRcdFx0J2F4c3R1YWJjZFxcdCBkZGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEwLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMywgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRva2VucyBvbiBpbnNlcnRpb24gNicsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYXhzdHVhYmNkXFx0IGRkZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTAsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEzLCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxOCxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxOCxcblx0XHRcdFx0dGV4dDogJ3h5eicsXG5cdFx0XHR9XSxcblx0XHRcdCdheHN0dWFiY2RcXHQgZGRlZmdoeHl6Jyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTMsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gaW5zZXJ0aW9uIDcnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2F4c3R1YWJjZFxcdCBkZGVmZ2h4eXonLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEwLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMywgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxLFxuXHRcdFx0XHR0ZXh0OiAneCcsXG5cdFx0XHR9XSxcblx0XHRcdCd4YXhzdHVhYmNkXFx0IGRkZWZnaHh5eicsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTEsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDE0LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgdG9rZW5zIG9uIGluc2VydGlvbiA4JywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCd4YXhzdHVhYmNkXFx0IGRkZWZnaHh5eicsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTEsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDE0LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAyMixcblx0XHRcdFx0ZW5kQ29sdW1uOiAyMixcblx0XHRcdFx0dGV4dDogJ3gnLFxuXHRcdFx0fV0sXG5cdFx0XHQneGF4c3R1YWJjZFxcdCBkZGVmZ2h4eXp4Jyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMSwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTQsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gaW5zZXJ0aW9uIDknLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J3hheHN0dWFiY2RcXHQgZGRlZmdoeHl6eCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTEsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDE0LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAyLFxuXHRcdFx0XHRlbmRDb2x1bW46IDIsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQneGF4c3R1YWJjZFxcdCBkZGVmZ2h4eXp4Jyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMSwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTQsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gaW5zZXJ0aW9uIDEwJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCcnLFxuXHRcdFx0W10sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxLFxuXHRcdFx0XHR0ZXh0OiAnYScsXG5cdFx0XHR9XSxcblx0XHRcdCdhJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBzZWNvbmQgdG9rZW4gMicsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZGVmZ2hpaicsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMywgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNiwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogNCxcblx0XHRcdFx0ZW5kQ29sdW1uOiA3LFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH1dLFxuXHRcdFx0J2FiY2doaWonLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDMsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0IHJpZ2h0IGJlZm9yZSBzZWNvbmQgdG9rZW4nLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FiY2RlZmdoaWonLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDMsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDYsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDQsXG5cdFx0XHRcdGVuZENvbHVtbjogNCxcblx0XHRcdFx0dGV4dDogJ2hlbGxvJyxcblx0XHRcdH1dLFxuXHRcdFx0J2FiY2hlbGxvZGVmZ2hpaicsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oOCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTEsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIGZpcnN0IGNoYXInLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAyLFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH1dLFxuXHRcdFx0J2JjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigzLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSAybmQgYW5kIDNyZCBjaGFycycsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAyLFxuXHRcdFx0XHRlbmRDb2x1bW46IDQsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQnYWQgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMiwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMywgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgZmlyc3QgdG9rZW4nLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiA1LFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH1dLFxuXHRcdFx0JyBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxLCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBzZWNvbmQgdG9rZW4nLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0ZW5kQ29sdW1uOiA2LFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH1dLFxuXHRcdFx0J2FiY2RlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBzZWNvbmQgdG9rZW4gKyBhIGJpdCBvZiB0aGUgdGhpcmQgb25lJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdGVuZENvbHVtbjogNyxcblx0XHRcdFx0dGV4dDogJycsXG5cdFx0XHR9XSxcblx0XHRcdCdhYmNkZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBzZWNvbmQgYW5kIHRoaXJkIHRva2VuJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdGVuZENvbHVtbjogMTAsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQnYWJjZCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSlcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgZXZlcnl0aGluZycsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IDEwLFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH1dLFxuXHRcdFx0JycsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSlcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdub29wJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZENvbHVtbjogMSxcblx0XHRcdFx0dGV4dDogJycsXG5cdFx0XHR9XSxcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXF1aXZhbGVudCB0byBkZWxldGluZyBmaXJzdCB0d28gY2hhcnMnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAzLFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH1dLFxuXHRcdFx0J2NkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDIsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDMsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXF1aXZhbGVudCB0byBkZWxldGluZyBmcm9tIDUgdG8gdGhlIGVuZCcsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiA1LFxuXHRcdFx0XHRlbmRDb2x1bW46IDEwLFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH1dLFxuXHRcdFx0J2FiY2QnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gcmVwbGFjZSAxJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdIZWxsbyB3b3JsZCwgY2lhbycsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMCksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNiwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTEsIDApLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEzLCAwKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IDYsXG5cdFx0XHRcdHRleHQ6ICdIaScsXG5cdFx0XHR9XSxcblx0XHRcdCdIaSB3b3JsZCwgY2lhbycsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMCksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMywgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oOCwgMCksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTAsIDApLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgdG9rZW5zIG9uIHJlcGxhY2UgMicsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnSGVsbG8gd29ybGQsIGNpYW8nLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDApLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDYsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDExLCAwKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMywgMCksXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZENvbHVtbjogNixcblx0XHRcdFx0dGV4dDogJ0hpJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhcnRDb2x1bW46IDgsXG5cdFx0XHRcdGVuZENvbHVtbjogMTIsXG5cdFx0XHRcdHRleHQ6ICdteSBmcmllbmRzJyxcblx0XHRcdH1dLFxuXHRcdFx0J0hpIHdteSBmcmllbmRzLCBjaWFvJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAwKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigzLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxNCwgMCksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTYsIDApLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHRlc3RMaW5lU3BsaXRUb2tlbnMoaW5pdGlhbFRleHQ6IHN0cmluZywgaW5pdGlhbFRva2VuczogVGVzdFRva2VuW10sIHNwbGl0Q29sdW1uOiBudW1iZXIsIGV4cGVjdGVkVGV4dDE6IHN0cmluZywgZXhwZWN0ZWRUZXh0Mjogc3RyaW5nLCBleHBlY3RlZFRva2VuczogVGVzdFRva2VuW10pOiB2b2lkIHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6IGluaXRpYWxUZXh0LFxuXHRcdFx0XHR0b2tlbnM6IGluaXRpYWxUb2tlbnNcblx0XHRcdH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCBzcGxpdENvbHVtbiwgMSwgc3BsaXRDb2x1bW4pLFxuXHRcdFx0XHR0ZXh0OiAnXFxuJ1xuXHRcdFx0fV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiBleHBlY3RlZFRleHQxLFxuXHRcdFx0XHR0b2tlbnM6IGV4cGVjdGVkVG9rZW5zXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6IGV4cGVjdGVkVGV4dDIsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH1cblxuXHR0ZXN0KCdzcGxpdCBhdCB0aGUgYmVnaW5uaW5nJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lU3BsaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdDEsXG5cdFx0XHQnJyxcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NwbGl0IGF0IHRoZSBlbmQnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVTcGxpdFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0MTAsXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdCcnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3BsaXQgaW50aGUgbWlkZGxlIDEnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVTcGxpdFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0NSxcblx0XHRcdCdhYmNkJyxcblx0XHRcdCcgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSlcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzcGxpdCBpbnRoZSBtaWRkbGUgMicsICgpID0+IHtcblx0XHR0ZXN0TGluZVNwbGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHQ2LFxuXHRcdFx0J2FiY2QgJyxcblx0XHRcdCdlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHRlc3RMaW5lQXBwZW5kVG9rZW5zKGFUZXh0OiBzdHJpbmcsIGFUb2tlbnM6IFRlc3RUb2tlbltdLCBiVGV4dDogc3RyaW5nLCBiVG9rZW5zOiBUZXN0VG9rZW5bXSwgZXhwZWN0ZWRUZXh0OiBzdHJpbmcsIGV4cGVjdGVkVG9rZW5zOiBUZXN0VG9rZW5bXSk6IHZvaWQge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogYVRleHQsXG5cdFx0XHRcdHRva2VuczogYVRva2Vuc1xuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiBiVGV4dCxcblx0XHRcdFx0dG9rZW5zOiBiVG9rZW5zXG5cdFx0XHR9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgYVRleHQubGVuZ3RoICsgMSwgMiwgMSksXG5cdFx0XHRcdHRleHQ6ICcnXG5cdFx0XHR9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6IGV4cGVjdGVkVGV4dCxcblx0XHRcdFx0dG9rZW5zOiBleHBlY3RlZFRva2Vuc1xuXHRcdFx0fV1cblx0XHQpO1xuXHR9XG5cblx0dGVzdCgnYXBwZW5kIGVtcHR5IDEnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVBcHBlbmRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdCcnLFxuXHRcdFx0W10sXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZCBlbXB0eSAyJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lQXBwZW5kVG9rZW5zKFxuXHRcdFx0JycsXG5cdFx0XHRbXSxcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmQgMScsICgpID0+IHtcblx0XHR0ZXN0TGluZUFwcGVuZFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgNCksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgNSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgNilcblx0XHRcdF0sXG5cdFx0XHQnYWJjZCBlZmdoYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig5LCA0KSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMywgNSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTQsIDYpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kIDInLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVBcHBlbmRUb2tlbnMoXG5cdFx0XHQnYWJjZCAnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpXG5cdFx0XHRdLFxuXHRcdFx0J2VmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDMpXG5cdFx0XHRdLFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmQgMycsICgpID0+IHtcblx0XHR0ZXN0TGluZUFwcGVuZFRva2Vucyhcblx0XHRcdCdhYmNkJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdF0sXG5cdFx0XHQnIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEsIDMpXG5cdFx0XHRdLFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hE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Q0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsR0FBRztBQUFBLFFBQ0YsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsR0FBRztBQUFBLFFBQ0YsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQztBQUFBLE1BQzVDLENBQUM7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsSUFBSSxDQUFDLEdBQUcsSUFBSSxVQUFVLElBQUksQ0FBQyxHQUFHLElBQUksVUFBVSxJQUFJLENBQUMsQ0FBQztBQUFBLE1BQ3pJLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtQkFBbUIsTUFBTTtBQUM3QjtBQUFBLE1BQ0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzdDLENBQUM7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3ZFLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtQkFBbUIsTUFBTTtBQUM3QjtBQUFBLE1BQ0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzdDLENBQUM7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3ZFLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtQkFBbUIsTUFBTTtBQUM3QjtBQUFBLE1BQ0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzdDLENBQUM7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3ZFLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtQkFBbUIsTUFBTTtBQUM3QjtBQUFBLE1BQ0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzdDLENBQUM7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3ZFLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtQkFBbUIsTUFBTTtBQUM3QjtBQUFBLE1BQ0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUUsR0FBRyxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQy9DLENBQUM7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3ZFLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxrQkFBa0IsTUFBTTtBQUM1QjtBQUFBLE1BQ0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzdDLENBQUM7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUM3QixHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDN0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDL0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsR0FBRztBQUFBLFFBQ0YsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzdCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxrQkFBa0IsTUFBTTtBQUM1QjtBQUFBLE1BQ0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQzdDLENBQUM7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDbEQsR0FBRztBQUFBLFFBQ0YsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzdCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxrQkFBa0IsTUFBTTtBQUM1QjtBQUFBLE1BQ0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsR0FBRztBQUFBLFFBQ0YsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLE1BQ0QsQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFN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
