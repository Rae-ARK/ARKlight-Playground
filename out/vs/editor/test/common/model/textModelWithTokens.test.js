import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { TokenizationRegistry, EncodedTokenizationResult } from "../../../common/languages.js";
import { StandardTokenType, MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { TestLineToken } from "../core/testLineToken.js";
import { createModelServices, createTextModel, instantiateTextModel } from "../testTextModel.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
function createTextModelWithBrackets(disposables, text, brackets) {
  const languageId = "bracketMode2";
  const instantiationService = createModelServices(disposables);
  const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
  const languageService = instantiationService.get(ILanguageService);
  disposables.add(languageService.registerLanguage({ id: languageId }));
  disposables.add(languageConfigurationService.register(languageId, { brackets }));
  return disposables.add(instantiateTextModel(instantiationService, text, languageId));
}
suite("TextModelWithTokens", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testBrackets(contents, brackets) {
    const languageId = "testMode";
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets
    }));
    function toRelaxedFoundBracket(a) {
      if (!a) {
        return null;
      }
      return {
        range: a.range.toString(),
        info: a.bracketInfo
      };
    }
    const charIsBracket = {};
    const charIsOpenBracket = {};
    const openForChar = {};
    const closeForChar = {};
    brackets.forEach((b) => {
      charIsBracket[b[0]] = true;
      charIsBracket[b[1]] = true;
      charIsOpenBracket[b[0]] = true;
      charIsOpenBracket[b[1]] = false;
      openForChar[b[0]] = b[0];
      closeForChar[b[0]] = b[1];
      openForChar[b[1]] = b[0];
      closeForChar[b[1]] = b[1];
    });
    const expectedBrackets = [];
    for (let lineIndex = 0; lineIndex < contents.length; lineIndex++) {
      const lineText = contents[lineIndex];
      for (let charIndex = 0; charIndex < lineText.length; charIndex++) {
        const ch = lineText.charAt(charIndex);
        if (charIsBracket[ch]) {
          expectedBrackets.push({
            bracketInfo: languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew.getBracketInfo(ch),
            range: new Range(lineIndex + 1, charIndex + 1, lineIndex + 1, charIndex + 2)
          });
        }
      }
    }
    const model = disposables.add(instantiateTextModel(instantiationService, contents.join("\n"), languageId));
    {
      let expectedBracketIndex = expectedBrackets.length - 1;
      let currentExpectedBracket = expectedBracketIndex >= 0 ? expectedBrackets[expectedBracketIndex] : null;
      for (let lineNumber = contents.length; lineNumber >= 1; lineNumber--) {
        const lineText = contents[lineNumber - 1];
        for (let column = lineText.length + 1; column >= 1; column--) {
          if (currentExpectedBracket) {
            if (lineNumber === currentExpectedBracket.range.startLineNumber && column < currentExpectedBracket.range.endColumn) {
              expectedBracketIndex--;
              currentExpectedBracket = expectedBracketIndex >= 0 ? expectedBrackets[expectedBracketIndex] : null;
            }
          }
          const actual = model.bracketPairs.findPrevBracket({
            lineNumber,
            column
          });
          assert.deepStrictEqual(toRelaxedFoundBracket(actual), toRelaxedFoundBracket(currentExpectedBracket), "findPrevBracket of " + lineNumber + ", " + column);
        }
      }
    }
    {
      let expectedBracketIndex = 0;
      let currentExpectedBracket = expectedBracketIndex < expectedBrackets.length ? expectedBrackets[expectedBracketIndex] : null;
      for (let lineNumber = 1; lineNumber <= contents.length; lineNumber++) {
        const lineText = contents[lineNumber - 1];
        for (let column = 1; column <= lineText.length + 1; column++) {
          if (currentExpectedBracket) {
            if (lineNumber === currentExpectedBracket.range.startLineNumber && column > currentExpectedBracket.range.startColumn) {
              expectedBracketIndex++;
              currentExpectedBracket = expectedBracketIndex < expectedBrackets.length ? expectedBrackets[expectedBracketIndex] : null;
            }
          }
          const actual = model.bracketPairs.findNextBracket({
            lineNumber,
            column
          });
          assert.deepStrictEqual(toRelaxedFoundBracket(actual), toRelaxedFoundBracket(currentExpectedBracket), "findNextBracket of " + lineNumber + ", " + column);
        }
      }
    }
    disposables.dispose();
  }
  test("brackets1", () => {
    testBrackets([
      "if (a == 3) { return (7 * (a + 5)); }"
    ], [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"]
    ]);
  });
});
function assertIsNotBracket(model, lineNumber, column) {
  const match = model.bracketPairs.matchBracket(new Position(lineNumber, column));
  assert.strictEqual(match, null, "is not matching brackets at " + lineNumber + ", " + column);
}
function assertIsBracket(model, testPosition, expected) {
  expected.sort(Range.compareRangesUsingStarts);
  const actual = model.bracketPairs.matchBracket(testPosition);
  actual?.sort(Range.compareRangesUsingStarts);
  assert.deepStrictEqual(actual, expected, "matches brackets at " + testPosition);
}
suite("TextModelWithTokens - bracket matching", () => {
  const languageId = "bracketMode1";
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  let languageService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createModelServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("bracket matching 1", () => {
    const text = ")]}{[(\n)]}{[(";
    const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
    assertIsNotBracket(model, 1, 1);
    assertIsNotBracket(model, 1, 2);
    assertIsNotBracket(model, 1, 3);
    assertIsBracket(model, new Position(1, 4), [new Range(1, 4, 1, 5), new Range(2, 3, 2, 4)]);
    assertIsBracket(model, new Position(1, 5), [new Range(1, 5, 1, 6), new Range(2, 2, 2, 3)]);
    assertIsBracket(model, new Position(1, 6), [new Range(1, 6, 1, 7), new Range(2, 1, 2, 2)]);
    assertIsBracket(model, new Position(1, 7), [new Range(1, 6, 1, 7), new Range(2, 1, 2, 2)]);
    assertIsBracket(model, new Position(2, 1), [new Range(2, 1, 2, 2), new Range(1, 6, 1, 7)]);
    assertIsBracket(model, new Position(2, 2), [new Range(2, 2, 2, 3), new Range(1, 5, 1, 6)]);
    assertIsBracket(model, new Position(2, 3), [new Range(2, 3, 2, 4), new Range(1, 4, 1, 5)]);
    assertIsBracket(model, new Position(2, 4), [new Range(2, 3, 2, 4), new Range(1, 4, 1, 5)]);
    assertIsNotBracket(model, 2, 5);
    assertIsNotBracket(model, 2, 6);
    assertIsNotBracket(model, 2, 7);
  });
  test("bracket matching 2", () => {
    const text = "var bar = {\nfoo: {\n}, bar: {hallo: [{\n}, {\n}]}}";
    const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
    const brackets = [
      [new Position(1, 11), new Range(1, 11, 1, 12), new Range(5, 4, 5, 5)],
      [new Position(1, 12), new Range(1, 11, 1, 12), new Range(5, 4, 5, 5)],
      [new Position(2, 6), new Range(2, 6, 2, 7), new Range(3, 1, 3, 2)],
      [new Position(2, 7), new Range(2, 6, 2, 7), new Range(3, 1, 3, 2)],
      [new Position(3, 1), new Range(3, 1, 3, 2), new Range(2, 6, 2, 7)],
      [new Position(3, 2), new Range(3, 1, 3, 2), new Range(2, 6, 2, 7)],
      [new Position(3, 9), new Range(3, 9, 3, 10), new Range(5, 3, 5, 4)],
      [new Position(3, 10), new Range(3, 9, 3, 10), new Range(5, 3, 5, 4)],
      [new Position(3, 17), new Range(3, 17, 3, 18), new Range(5, 2, 5, 3)],
      [new Position(3, 18), new Range(3, 18, 3, 19), new Range(4, 1, 4, 2)],
      [new Position(3, 19), new Range(3, 18, 3, 19), new Range(4, 1, 4, 2)],
      [new Position(4, 1), new Range(4, 1, 4, 2), new Range(3, 18, 3, 19)],
      [new Position(4, 2), new Range(4, 1, 4, 2), new Range(3, 18, 3, 19)],
      [new Position(4, 4), new Range(4, 4, 4, 5), new Range(5, 1, 5, 2)],
      [new Position(4, 5), new Range(4, 4, 4, 5), new Range(5, 1, 5, 2)],
      [new Position(5, 1), new Range(5, 1, 5, 2), new Range(4, 4, 4, 5)],
      [new Position(5, 2), new Range(5, 2, 5, 3), new Range(3, 17, 3, 18)],
      [new Position(5, 3), new Range(5, 3, 5, 4), new Range(3, 9, 3, 10)],
      [new Position(5, 4), new Range(5, 4, 5, 5), new Range(1, 11, 1, 12)],
      [new Position(5, 5), new Range(5, 4, 5, 5), new Range(1, 11, 1, 12)]
    ];
    const isABracket = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
    for (let i = 0, len = brackets.length; i < len; i++) {
      const [testPos, b1, b2] = brackets[i];
      assertIsBracket(model, testPos, [b1, b2]);
      isABracket[testPos.lineNumber][testPos.column] = true;
    }
    for (let i = 1, len = model.getLineCount(); i <= len; i++) {
      const line = model.getLineContent(i);
      for (let j = 1, lenJ = line.length + 1; j <= lenJ; j++) {
        if (!isABracket[i].hasOwnProperty(j)) {
          assertIsNotBracket(model, i, j);
        }
      }
    }
  });
});
suite("TextModelWithTokens 2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("bracket matching 3", () => {
    const text = [
      "begin",
      "    loop",
      "        if then",
      "        end if;",
      "    end loop;",
      "end;",
      "",
      "begin",
      "    loop",
      "        if then",
      "        end ifa;",
      "    end loop;",
      "end;"
    ].join("\n");
    const disposables = new DisposableStore();
    const model = createTextModelWithBrackets(disposables, text, [
      ["if", "end if"],
      ["loop", "end loop"],
      ["begin", "end"]
    ]);
    assertIsNotBracket(model, 10, 9);
    assertIsBracket(model, new Position(3, 9), [new Range(3, 9, 3, 11), new Range(4, 9, 4, 15)]);
    assertIsBracket(model, new Position(4, 9), [new Range(4, 9, 4, 15), new Range(3, 9, 3, 11)]);
    assertIsBracket(model, new Position(2, 5), [new Range(2, 5, 2, 9), new Range(5, 5, 5, 13)]);
    assertIsBracket(model, new Position(5, 5), [new Range(5, 5, 5, 13), new Range(2, 5, 2, 9)]);
    assertIsBracket(model, new Position(1, 1), [new Range(1, 1, 1, 6), new Range(6, 1, 6, 4)]);
    assertIsBracket(model, new Position(6, 1), [new Range(6, 1, 6, 4), new Range(1, 1, 1, 6)]);
    disposables.dispose();
  });
  test("bracket matching 4", () => {
    const text = [
      "recordbegin",
      "  simplerecordbegin",
      "  endrecord",
      "endrecord"
    ].join("\n");
    const disposables = new DisposableStore();
    const model = createTextModelWithBrackets(disposables, text, [
      ["recordbegin", "endrecord"],
      ["simplerecordbegin", "endrecord"]
    ]);
    assertIsBracket(model, new Position(1, 1), [new Range(1, 1, 1, 12), new Range(4, 1, 4, 10)]);
    assertIsBracket(model, new Position(4, 1), [new Range(4, 1, 4, 10), new Range(1, 1, 1, 12)]);
    assertIsBracket(model, new Position(2, 3), [new Range(2, 3, 2, 20), new Range(3, 3, 3, 12)]);
    assertIsBracket(model, new Position(3, 3), [new Range(3, 3, 3, 12), new Range(2, 3, 2, 20)]);
    disposables.dispose();
  });
  test("issue #95843: Highlighting of closing braces is indicating wrong brace when cursor is behind opening brace", () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    const mode1 = "testMode1";
    const mode2 = "testMode2";
    const languageIdCodec = languageService.languageIdCodec;
    disposables.add(languageService.registerLanguage({ id: mode1 }));
    disposables.add(languageService.registerLanguage({ id: mode2 }));
    const encodedMode1 = languageIdCodec.encodeLanguageId(mode1);
    const encodedMode2 = languageIdCodec.encodeLanguageId(mode2);
    const otherMetadata1 = (encodedMode1 << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0;
    const otherMetadata2 = (encodedMode2 << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        switch (line) {
          case "function f() {": {
            const tokens = new Uint32Array([
              0,
              otherMetadata1,
              8,
              otherMetadata1,
              9,
              otherMetadata1,
              10,
              otherMetadata1,
              11,
              otherMetadata1,
              12,
              otherMetadata1,
              13,
              otherMetadata1
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "  return <p>{true}</p>;": {
            const tokens = new Uint32Array([
              0,
              otherMetadata1,
              2,
              otherMetadata1,
              8,
              otherMetadata1,
              9,
              otherMetadata2,
              10,
              otherMetadata2,
              11,
              otherMetadata2,
              12,
              otherMetadata2,
              13,
              otherMetadata1,
              17,
              otherMetadata2,
              18,
              otherMetadata2,
              20,
              otherMetadata2,
              21,
              otherMetadata2,
              22,
              otherMetadata2
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "}": {
            const tokens = new Uint32Array([
              0,
              otherMetadata1
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
        }
        throw new Error(`Unexpected`);
      }
    };
    disposables.add(TokenizationRegistry.register(mode1, tokenizationSupport));
    disposables.add(languageConfigurationService.register(mode1, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    disposables.add(languageConfigurationService.register(mode2, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    const model = disposables.add(instantiateTextModel(
      instantiationService,
      [
        "function f() {",
        "  return <p>{true}</p>;",
        "}"
      ].join("\n"),
      mode1
    ));
    model.tokenization.forceTokenization(1);
    model.tokenization.forceTokenization(2);
    model.tokenization.forceTokenization(3);
    assert.deepStrictEqual(
      model.bracketPairs.matchBracket(new Position(2, 14)),
      [new Range(2, 13, 2, 14), new Range(2, 18, 2, 19)]
    );
    disposables.dispose();
  });
  test("issue #88075: TypeScript brace matching is incorrect in `${}` strings", () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const mode = "testMode";
    const languageIdCodec = instantiationService.get(ILanguageService).languageIdCodec;
    const encodedMode = languageIdCodec.encodeLanguageId(mode);
    const otherMetadata = (encodedMode << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET) >>> 0;
    const stringMetadata = (encodedMode << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.String << MetadataConsts.TOKEN_TYPE_OFFSET) >>> 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        switch (line) {
          case "function hello() {": {
            const tokens = new Uint32Array([
              0,
              otherMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "    console.log(`${100}`);": {
            const tokens = new Uint32Array([
              0,
              otherMetadata,
              16,
              stringMetadata,
              19,
              otherMetadata,
              22,
              stringMetadata,
              24,
              otherMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "}": {
            const tokens = new Uint32Array([
              0,
              otherMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
        }
        throw new Error(`Unexpected`);
      }
    };
    disposables.add(TokenizationRegistry.register(mode, tokenizationSupport));
    disposables.add(languageConfigurationService.register(mode, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    const model = disposables.add(instantiateTextModel(
      instantiationService,
      [
        "function hello() {",
        "    console.log(`${100}`);",
        "}"
      ].join("\n"),
      mode
    ));
    model.tokenization.forceTokenization(1);
    model.tokenization.forceTokenization(2);
    model.tokenization.forceTokenization(3);
    assert.deepStrictEqual(model.bracketPairs.matchBracket(new Position(2, 23)), null);
    assert.deepStrictEqual(model.bracketPairs.matchBracket(new Position(2, 20)), null);
    disposables.dispose();
  });
});
suite("TextModelWithTokens regression tests", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("microsoft/monaco-editor#122: Unhandled Exception: TypeError: Unable to get property 'replace' of undefined or null reference", () => {
    function assertViewLineTokens(model2, lineNumber, forceTokenization, expected) {
      if (forceTokenization) {
        model2.tokenization.forceTokenization(lineNumber);
      }
      const _actual = model2.tokenization.getLineTokens(lineNumber).inflate();
      const actual = [];
      for (let i = 0, len = _actual.getCount(); i < len; i++) {
        actual[i] = {
          endIndex: _actual.getEndOffset(i),
          foreground: _actual.getForeground(i)
        };
      }
      const decode = (token) => {
        return {
          endIndex: token.endIndex,
          foreground: token.getForeground()
        };
      };
      assert.deepStrictEqual(actual, expected.map(decode));
    }
    let _tokenId = 10;
    const LANG_ID1 = "indicisiveMode1";
    const LANG_ID2 = "indicisiveMode2";
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        const myId = ++_tokenId;
        const tokens = new Uint32Array(2);
        tokens[0] = 0;
        tokens[1] = myId << MetadataConsts.FOREGROUND_OFFSET >>> 0;
        return new EncodedTokenizationResult(tokens, [], state);
      }
    };
    const registration1 = TokenizationRegistry.register(LANG_ID1, tokenizationSupport);
    const registration2 = TokenizationRegistry.register(LANG_ID2, tokenizationSupport);
    const model = createTextModel("A model with\ntwo lines");
    assertViewLineTokens(model, 1, true, [createViewLineToken(12, 1)]);
    assertViewLineTokens(model, 2, true, [createViewLineToken(9, 1)]);
    model.setLanguage(LANG_ID1);
    assertViewLineTokens(model, 1, true, [createViewLineToken(12, 11)]);
    assertViewLineTokens(model, 2, true, [createViewLineToken(9, 12)]);
    model.setLanguage(LANG_ID2);
    assertViewLineTokens(model, 1, false, [createViewLineToken(12, 1)]);
    assertViewLineTokens(model, 2, false, [createViewLineToken(9, 1)]);
    model.dispose();
    registration1.dispose();
    registration2.dispose();
    function createViewLineToken(endIndex, foreground) {
      const metadata = foreground << MetadataConsts.FOREGROUND_OFFSET >>> 0;
      return new TestLineToken(endIndex, metadata);
    }
  });
  test("microsoft/monaco-editor#133: Error: Cannot read property 'modeId' of undefined", () => {
    const disposables = new DisposableStore();
    const model = createTextModelWithBrackets(
      disposables,
      [
        "Imports System",
        "Imports System.Collections.Generic",
        "",
        "Module m1",
        "",
        "	Sub Main()",
        "	End Sub",
        "",
        "End Module"
      ].join("\n"),
      [
        ["module", "end module"],
        ["sub", "end sub"]
      ]
    );
    const actual = model.bracketPairs.matchBracket(new Position(4, 1));
    assert.deepStrictEqual(actual, [new Range(4, 1, 4, 7), new Range(9, 1, 9, 11)]);
    disposables.dispose();
  });
  test("issue #11856: Bracket matching does not work as expected if the opening brace symbol is contained in the closing brace symbol", () => {
    const disposables = new DisposableStore();
    const model = createTextModelWithBrackets(
      disposables,
      [
        'sequence "outer"',
        '     sequence "inner"',
        "     endsequence",
        "endsequence"
      ].join("\n"),
      [
        ["sequence", "endsequence"],
        ["feature", "endfeature"]
      ]
    );
    const actual = model.bracketPairs.matchBracket(new Position(3, 9));
    assert.deepStrictEqual(actual, [new Range(2, 6, 2, 14), new Range(3, 6, 3, 17)]);
    disposables.dispose();
  });
  test("issue #63822: Wrong embedded language detected for empty lines", () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageService = instantiationService.get(ILanguageService);
    const outerMode = "outerMode";
    const innerMode = "innerMode";
    disposables.add(languageService.registerLanguage({ id: outerMode }));
    disposables.add(languageService.registerLanguage({ id: innerMode }));
    const languageIdCodec = instantiationService.get(ILanguageService).languageIdCodec;
    const encodedInnerMode = languageIdCodec.encodeLanguageId(innerMode);
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        const tokens = new Uint32Array(2);
        tokens[0] = 0;
        tokens[1] = encodedInnerMode << MetadataConsts.LANGUAGEID_OFFSET >>> 0;
        return new EncodedTokenizationResult(tokens, [], state);
      }
    };
    disposables.add(TokenizationRegistry.register(outerMode, tokenizationSupport));
    const model = disposables.add(instantiateTextModel(instantiationService, "A model with one line", outerMode));
    model.tokenization.forceTokenization(1);
    assert.strictEqual(model.getLanguageIdAtPosition(1, 1), innerMode);
    disposables.dispose();
  });
});
suite("TextModel.getLineIndentGuide", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertIndentGuides(lines, indentSize) {
    const languageId = "testLang";
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: languageId }));
    const text = lines.map((l) => l[4]).join("\n");
    const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
    model.updateOptions({ indentSize });
    const actualIndents = model.guides.getLinesIndentGuides(1, model.getLineCount());
    const actual = [];
    for (let line = 1; line <= model.getLineCount(); line++) {
      const activeIndentGuide = model.guides.getActiveIndentGuide(line, 1, model.getLineCount());
      actual[line - 1] = [actualIndents[line - 1], activeIndentGuide.startLineNumber, activeIndentGuide.endLineNumber, activeIndentGuide.indent, model.getLineContent(line)];
    }
    assert.deepStrictEqual(actual, lines);
    disposables.dispose();
  }
  test("getLineIndentGuide one level 2", () => {
    assertIndentGuides([
      [0, 2, 4, 1, "A"],
      [1, 2, 4, 1, "  A"],
      [1, 2, 4, 1, "  A"],
      [1, 2, 4, 1, "  A"]
    ], 2);
  });
  test("getLineIndentGuide two levels", () => {
    assertIndentGuides([
      [0, 2, 5, 1, "A"],
      [1, 2, 5, 1, "  A"],
      [1, 4, 5, 2, "  A"],
      [2, 4, 5, 2, "    A"],
      [2, 4, 5, 2, "    A"]
    ], 2);
  });
  test("getLineIndentGuide three levels", () => {
    assertIndentGuides([
      [0, 2, 4, 1, "A"],
      [1, 3, 4, 2, "  A"],
      [2, 4, 4, 3, "    A"],
      [3, 4, 4, 3, "      A"],
      [0, 5, 5, 0, "A"]
    ], 2);
  });
  test("getLineIndentGuide decreasing indent", () => {
    assertIndentGuides([
      [2, 1, 1, 2, "    A"],
      [1, 1, 1, 2, "  A"],
      [0, 1, 2, 1, "A"]
    ], 2);
  });
  test("getLineIndentGuide Java", () => {
    assertIndentGuides([
      /* 1*/
      [0, 2, 9, 1, "class A {"],
      /* 2*/
      [1, 3, 4, 2, "  void foo() {"],
      /* 3*/
      [2, 3, 4, 2, "    console.log(1);"],
      /* 4*/
      [2, 3, 4, 2, "    console.log(2);"],
      /* 5*/
      [1, 3, 4, 2, "  }"],
      /* 6*/
      [1, 2, 9, 1, ""],
      /* 7*/
      [1, 8, 8, 2, "  void bar() {"],
      /* 8*/
      [2, 8, 8, 2, "    console.log(3);"],
      /* 9*/
      [1, 8, 8, 2, "  }"],
      /*10*/
      [0, 2, 9, 1, "}"],
      /*11*/
      [0, 12, 12, 1, "interface B {"],
      /*12*/
      [1, 12, 12, 1, "  void bar();"],
      /*13*/
      [0, 12, 12, 1, "}"]
    ], 2);
  });
  test("getLineIndentGuide Javadoc", () => {
    assertIndentGuides([
      [0, 2, 3, 1, "/**"],
      [1, 2, 3, 1, " * Comment"],
      [1, 2, 3, 1, " */"],
      [0, 5, 6, 1, "class A {"],
      [1, 5, 6, 1, "  void foo() {"],
      [1, 5, 6, 1, "  }"],
      [0, 5, 6, 1, "}"]
    ], 2);
  });
  test("getLineIndentGuide Whitespace", () => {
    assertIndentGuides([
      [0, 2, 7, 1, "class A {"],
      [1, 2, 7, 1, ""],
      [1, 4, 5, 2, "  void foo() {"],
      [2, 4, 5, 2, "    "],
      [2, 4, 5, 2, "    return 1;"],
      [1, 4, 5, 2, "  }"],
      [1, 2, 7, 1, "      "],
      [0, 2, 7, 1, "}"]
    ], 2);
  });
  test("getLineIndentGuide Tabs", () => {
    assertIndentGuides([
      [0, 2, 7, 1, "class A {"],
      [1, 2, 7, 1, "		"],
      [1, 4, 5, 2, "	void foo() {"],
      [2, 4, 5, 2, "	 	//hello"],
      [2, 4, 5, 2, "	    return 2;"],
      [1, 4, 5, 2, "  	}"],
      [1, 2, 7, 1, "      "],
      [0, 2, 7, 1, "}"]
    ], 4);
  });
  test("getLineIndentGuide checker.ts", () => {
    assertIndentGuides([
      /* 1*/
      [0, 1, 1, 0, '/// <reference path="binder.ts"/>'],
      /* 2*/
      [0, 2, 2, 0, ""],
      /* 3*/
      [0, 3, 3, 0, "/* @internal */"],
      /* 4*/
      [0, 5, 16, 1, "namespace ts {"],
      /* 5*/
      [1, 5, 16, 1, "    let nextSymbolId = 1;"],
      /* 6*/
      [1, 5, 16, 1, "    let nextNodeId = 1;"],
      /* 7*/
      [1, 5, 16, 1, "    let nextMergeId = 1;"],
      /* 8*/
      [1, 5, 16, 1, "    let nextFlowId = 1;"],
      /* 9*/
      [1, 5, 16, 1, ""],
      /*10*/
      [1, 11, 15, 2, "    export function getNodeId(node: Node): number {"],
      /*11*/
      [2, 12, 13, 3, "        if (!node.id) {"],
      /*12*/
      [3, 12, 13, 3, "            node.id = nextNodeId;"],
      /*13*/
      [3, 12, 13, 3, "            nextNodeId++;"],
      /*14*/
      [2, 12, 13, 3, "        }"],
      /*15*/
      [2, 11, 15, 2, "        return node.id;"],
      /*16*/
      [1, 11, 15, 2, "    }"],
      /*17*/
      [0, 5, 16, 1, "}"]
    ], 4);
  });
  test("issue #8425 - Missing indentation lines for first level indentation", () => {
    assertIndentGuides([
      [1, 2, 3, 2, "	indent1"],
      [2, 2, 3, 2, "		indent2"],
      [2, 2, 3, 2, "		indent2"],
      [1, 2, 3, 2, "	indent1"]
    ], 4);
  });
  test("issue #8952 - Indentation guide lines going through text on .yml file", () => {
    assertIndentGuides([
      [0, 2, 5, 1, "properties:"],
      [1, 3, 5, 2, "    emailAddress:"],
      [2, 3, 5, 2, "        - bla"],
      [2, 5, 5, 3, "        - length:"],
      [3, 5, 5, 3, "            max: 255"],
      [0, 6, 6, 0, "getters:"]
    ], 4);
  });
  test("issue #11892 - Indent guides look funny", () => {
    assertIndentGuides([
      [0, 2, 7, 1, "function test(base) {"],
      [1, 3, 6, 2, "	switch (base) {"],
      [2, 4, 4, 3, "		case 1:"],
      [3, 4, 4, 3, "			return 1;"],
      [2, 6, 6, 3, "		case 2:"],
      [3, 6, 6, 3, "			return 2;"],
      [1, 2, 7, 1, "	}"],
      [0, 2, 7, 1, "}"]
    ], 4);
  });
  test("issue #12398 - Problem in indent guidelines", () => {
    assertIndentGuides([
      [2, 2, 2, 3, "		.bla"],
      [3, 2, 2, 3, "			label(for)"],
      [0, 3, 3, 0, "include script"]
    ], 4);
  });
  test("issue #49173", () => {
    const model = createTextModel([
      "class A {",
      "	public m1(): void {",
      "	}",
      "	public m2(): void {",
      "	}",
      "	public m3(): void {",
      "	}",
      "	public m4(): void {",
      "	}",
      "	public m5(): void {",
      "	}",
      "}"
    ].join("\n"));
    const actual = model.guides.getActiveIndentGuide(2, 4, 9);
    assert.deepStrictEqual(actual, { startLineNumber: 2, endLineNumber: 9, indent: 1 });
    model.dispose();
  });
  test("tweaks - no active", () => {
    assertIndentGuides([
      [0, 1, 1, 0, "A"],
      [0, 2, 2, 0, "A"]
    ], 2);
  });
  test("tweaks - inside scope", () => {
    assertIndentGuides([
      [0, 2, 2, 1, "A"],
      [1, 2, 2, 1, "  A"]
    ], 2);
  });
  test("tweaks - scope start", () => {
    assertIndentGuides([
      [0, 2, 2, 1, "A"],
      [1, 2, 2, 1, "  A"],
      [0, 2, 2, 1, "A"]
    ], 2);
  });
  test("tweaks - empty line", () => {
    assertIndentGuides([
      [0, 2, 4, 1, "A"],
      [1, 2, 4, 1, "  A"],
      [1, 2, 4, 1, ""],
      [1, 2, 4, 1, "  A"],
      [0, 2, 4, 1, "A"]
    ], 2);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC90ZXh0TW9kZWxXaXRoVG9rZW5zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElGb3VuZEJyYWNrZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsQnJhY2tldFBhaXJzLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSVRva2VuaXphdGlvblN1cHBvcnQsIFRva2VuaXphdGlvblJlZ2lzdHJ5LCBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZFRva2VuVHlwZSwgTWV0YWRhdGFDb25zdHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBDaGFyYWN0ZXJQYWlyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE51bGxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbnVsbFRva2VuaXplLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IFRlc3RMaW5lVG9rZW4gfSBmcm9tICcuLi9jb3JlL3Rlc3RMaW5lVG9rZW4uanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9kZWxTZXJ2aWNlcywgY3JlYXRlVGV4dE1vZGVsLCBpbnN0YW50aWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZVRleHRNb2RlbFdpdGhCcmFja2V0cyhkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0ZXh0OiBzdHJpbmcsIGJyYWNrZXRzOiBDaGFyYWN0ZXJQYWlyW10pOiBUZXh0TW9kZWwge1xuXHRjb25zdCBsYW5ndWFnZUlkID0gJ2JyYWNrZXRNb2RlMic7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cblx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7IGJyYWNrZXRzIH0pKTtcblxuXHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXh0LCBsYW5ndWFnZUlkKSk7XG59XG5cbnN1aXRlKCdUZXh0TW9kZWxXaXRoVG9rZW5zJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRlc3RCcmFja2V0cyhjb250ZW50czogc3RyaW5nW10sIGJyYWNrZXRzOiBDaGFyYWN0ZXJQYWlyW10pOiB2b2lkIHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ3Rlc3RNb2RlJztcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZU1vZGVsU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwge1xuXHRcdFx0YnJhY2tldHM6IGJyYWNrZXRzXG5cdFx0fSkpO1xuXG5cblx0XHRmdW5jdGlvbiB0b1JlbGF4ZWRGb3VuZEJyYWNrZXQoYTogSUZvdW5kQnJhY2tldCB8IG51bGwpIHtcblx0XHRcdGlmICghYSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiBhLnJhbmdlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGluZm86IGEuYnJhY2tldEluZm8sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXJJc0JyYWNrZXQ6IHsgW2NoYXI6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9O1xuXHRcdGNvbnN0IGNoYXJJc09wZW5CcmFja2V0OiB7IFtjaGFyOiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTtcblx0XHRjb25zdCBvcGVuRm9yQ2hhcjogeyBbY2hhcjogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcblx0XHRjb25zdCBjbG9zZUZvckNoYXI6IHsgW2NoYXI6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG5cdFx0YnJhY2tldHMuZm9yRWFjaCgoYikgPT4ge1xuXHRcdFx0Y2hhcklzQnJhY2tldFtiWzBdXSA9IHRydWU7XG5cdFx0XHRjaGFySXNCcmFja2V0W2JbMV1dID0gdHJ1ZTtcblxuXHRcdFx0Y2hhcklzT3BlbkJyYWNrZXRbYlswXV0gPSB0cnVlO1xuXHRcdFx0Y2hhcklzT3BlbkJyYWNrZXRbYlsxXV0gPSBmYWxzZTtcblxuXHRcdFx0b3BlbkZvckNoYXJbYlswXV0gPSBiWzBdO1xuXHRcdFx0Y2xvc2VGb3JDaGFyW2JbMF1dID0gYlsxXTtcblxuXHRcdFx0b3BlbkZvckNoYXJbYlsxXV0gPSBiWzBdO1xuXHRcdFx0Y2xvc2VGb3JDaGFyW2JbMV1dID0gYlsxXTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkQnJhY2tldHM6IElGb3VuZEJyYWNrZXRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGxpbmVJbmRleCA9IDA7IGxpbmVJbmRleCA8IGNvbnRlbnRzLmxlbmd0aDsgbGluZUluZGV4KyspIHtcblx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gY29udGVudHNbbGluZUluZGV4XTtcblxuXHRcdFx0Zm9yIChsZXQgY2hhckluZGV4ID0gMDsgY2hhckluZGV4IDwgbGluZVRleHQubGVuZ3RoOyBjaGFySW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCBjaCA9IGxpbmVUZXh0LmNoYXJBdChjaGFySW5kZXgpO1xuXHRcdFx0XHRpZiAoY2hhcklzQnJhY2tldFtjaF0pIHtcblx0XHRcdFx0XHRleHBlY3RlZEJyYWNrZXRzLnB1c2goe1xuXHRcdFx0XHRcdFx0YnJhY2tldEluZm86IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzTmV3LmdldEJyYWNrZXRJbmZvKGNoKSEsXG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKGxpbmVJbmRleCArIDEsIGNoYXJJbmRleCArIDEsIGxpbmVJbmRleCArIDEsIGNoYXJJbmRleCArIDIpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgY29udGVudHMuam9pbignXFxuJyksIGxhbmd1YWdlSWQpKTtcblxuXHRcdC8vIGZpbmRQcmV2QnJhY2tldFxuXHRcdHtcblx0XHRcdGxldCBleHBlY3RlZEJyYWNrZXRJbmRleCA9IGV4cGVjdGVkQnJhY2tldHMubGVuZ3RoIC0gMTtcblx0XHRcdGxldCBjdXJyZW50RXhwZWN0ZWRCcmFja2V0ID0gZXhwZWN0ZWRCcmFja2V0SW5kZXggPj0gMCA/IGV4cGVjdGVkQnJhY2tldHNbZXhwZWN0ZWRCcmFja2V0SW5kZXhdIDogbnVsbDtcblx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBjb250ZW50cy5sZW5ndGg7IGxpbmVOdW1iZXIgPj0gMTsgbGluZU51bWJlci0tKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gY29udGVudHNbbGluZU51bWJlciAtIDFdO1xuXG5cdFx0XHRcdGZvciAobGV0IGNvbHVtbiA9IGxpbmVUZXh0Lmxlbmd0aCArIDE7IGNvbHVtbiA+PSAxOyBjb2x1bW4tLSkge1xuXG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQpIHtcblx0XHRcdFx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBjdXJyZW50RXhwZWN0ZWRCcmFja2V0LnJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBjb2x1bW4gPCBjdXJyZW50RXhwZWN0ZWRCcmFja2V0LnJhbmdlLmVuZENvbHVtbikge1xuXHRcdFx0XHRcdFx0XHRleHBlY3RlZEJyYWNrZXRJbmRleC0tO1xuXHRcdFx0XHRcdFx0XHRjdXJyZW50RXhwZWN0ZWRCcmFja2V0ID0gZXhwZWN0ZWRCcmFja2V0SW5kZXggPj0gMCA/IGV4cGVjdGVkQnJhY2tldHNbZXhwZWN0ZWRCcmFja2V0SW5kZXhdIDogbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZFByZXZCcmFja2V0KHtcblx0XHRcdFx0XHRcdGxpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRjb2x1bW46IGNvbHVtblxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b1JlbGF4ZWRGb3VuZEJyYWNrZXQoYWN0dWFsKSwgdG9SZWxheGVkRm91bmRCcmFja2V0KGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQpLCAnZmluZFByZXZCcmFja2V0IG9mICcgKyBsaW5lTnVtYmVyICsgJywgJyArIGNvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBmaW5kTmV4dEJyYWNrZXRcblx0XHR7XG5cdFx0XHRsZXQgZXhwZWN0ZWRCcmFja2V0SW5kZXggPSAwO1xuXHRcdFx0bGV0IGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQgPSBleHBlY3RlZEJyYWNrZXRJbmRleCA8IGV4cGVjdGVkQnJhY2tldHMubGVuZ3RoID8gZXhwZWN0ZWRCcmFja2V0c1tleHBlY3RlZEJyYWNrZXRJbmRleF0gOiBudWxsO1xuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IDE7IGxpbmVOdW1iZXIgPD0gY29udGVudHMubGVuZ3RoOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBjb250ZW50c1tsaW5lTnVtYmVyIC0gMV07XG5cblx0XHRcdFx0Zm9yIChsZXQgY29sdW1uID0gMTsgY29sdW1uIDw9IGxpbmVUZXh0Lmxlbmd0aCArIDE7IGNvbHVtbisrKSB7XG5cblx0XHRcdFx0XHRpZiAoY3VycmVudEV4cGVjdGVkQnJhY2tldCkge1xuXHRcdFx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGNvbHVtbiA+IGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQucmFuZ2Uuc3RhcnRDb2x1bW4pIHtcblx0XHRcdFx0XHRcdFx0ZXhwZWN0ZWRCcmFja2V0SW5kZXgrKztcblx0XHRcdFx0XHRcdFx0Y3VycmVudEV4cGVjdGVkQnJhY2tldCA9IGV4cGVjdGVkQnJhY2tldEluZGV4IDwgZXhwZWN0ZWRCcmFja2V0cy5sZW5ndGggPyBleHBlY3RlZEJyYWNrZXRzW2V4cGVjdGVkQnJhY2tldEluZGV4XSA6IG51bGw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgYWN0dWFsID0gbW9kZWwuYnJhY2tldFBhaXJzLmZpbmROZXh0QnJhY2tldCh7XG5cdFx0XHRcdFx0XHRsaW5lTnVtYmVyOiBsaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0Y29sdW1uOiBjb2x1bW5cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9SZWxheGVkRm91bmRCcmFja2V0KGFjdHVhbCksIHRvUmVsYXhlZEZvdW5kQnJhY2tldChjdXJyZW50RXhwZWN0ZWRCcmFja2V0KSwgJ2ZpbmROZXh0QnJhY2tldCBvZiAnICsgbGluZU51bWJlciArICcsICcgKyBjb2x1bW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0dGVzdCgnYnJhY2tldHMxJywgKCkgPT4ge1xuXHRcdHRlc3RCcmFja2V0cyhbXG5cdFx0XHQnaWYgKGEgPT0gMykgeyByZXR1cm4gKDcgKiAoYSArIDUpKTsgfSdcblx0XHRdLCBbXG5cdFx0XHRbJ3snLCAnfSddLFxuXHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFsnKCcsICcpJ11cblx0XHRdKTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gYXNzZXJ0SXNOb3RCcmFja2V0KG1vZGVsOiBUZXh0TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcblx0Y29uc3QgbWF0Y2ggPSBtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoLCBudWxsLCAnaXMgbm90IG1hdGNoaW5nIGJyYWNrZXRzIGF0ICcgKyBsaW5lTnVtYmVyICsgJywgJyArIGNvbHVtbik7XG59XG5cbmZ1bmN0aW9uIGFzc2VydElzQnJhY2tldChtb2RlbDogVGV4dE1vZGVsLCB0ZXN0UG9zaXRpb246IFBvc2l0aW9uLCBleHBlY3RlZDogW1JhbmdlLCBSYW5nZV0pOiB2b2lkIHtcblx0ZXhwZWN0ZWQuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXHRjb25zdCBhY3R1YWwgPSBtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KHRlc3RQb3NpdGlvbik7XG5cdGFjdHVhbD8uc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsICdtYXRjaGVzIGJyYWNrZXRzIGF0ICcgKyB0ZXN0UG9zaXRpb24pO1xufVxuXG5zdWl0ZSgnVGV4dE1vZGVsV2l0aFRva2VucyAtIGJyYWNrZXQgbWF0Y2hpbmcnLCAoKSA9PiB7XG5cblx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdicmFja2V0TW9kZTEnO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsneycsICd9J10sXG5cdFx0XHRcdFsnWycsICddJ10sXG5cdFx0XHRcdFsnKCcsICcpJ10sXG5cdFx0XHRdXG5cdFx0fSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdicmFja2V0IG1hdGNoaW5nIDEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9XG5cdFx0XHQnKV19e1soJyArICdcXG4nICtcblx0XHRcdCcpXX17WygnO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXh0LCBsYW5ndWFnZUlkKSk7XG5cblx0XHRhc3NlcnRJc05vdEJyYWNrZXQobW9kZWwsIDEsIDEpO1xuXHRcdGFzc2VydElzTm90QnJhY2tldChtb2RlbCwgMSwgMik7XG5cdFx0YXNzZXJ0SXNOb3RCcmFja2V0KG1vZGVsLCAxLCAzKTtcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA0KSwgW25ldyBSYW5nZSgxLCA0LCAxLCA1KSwgbmV3IFJhbmdlKDIsIDMsIDIsIDQpXSk7XG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNSksIFtuZXcgUmFuZ2UoMSwgNSwgMSwgNiksIG5ldyBSYW5nZSgyLCAyLCAyLCAzKV0pO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDYpLCBbbmV3IFJhbmdlKDEsIDYsIDEsIDcpLCBuZXcgUmFuZ2UoMiwgMSwgMiwgMildKTtcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA3KSwgW25ldyBSYW5nZSgxLCA2LCAxLCA3KSwgbmV3IFJhbmdlKDIsIDEsIDIsIDIpXSk7XG5cblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbigyLCAxKSwgW25ldyBSYW5nZSgyLCAxLCAyLCAyKSwgbmV3IFJhbmdlKDEsIDYsIDEsIDcpXSk7XG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oMiwgMiksIFtuZXcgUmFuZ2UoMiwgMiwgMiwgMyksIG5ldyBSYW5nZSgxLCA1LCAxLCA2KV0pO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDMpLCBbbmV3IFJhbmdlKDIsIDMsIDIsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSldKTtcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbigyLCA0KSwgW25ldyBSYW5nZSgyLCAzLCAyLCA0KSwgbmV3IFJhbmdlKDEsIDQsIDEsIDUpXSk7XG5cdFx0YXNzZXJ0SXNOb3RCcmFja2V0KG1vZGVsLCAyLCA1KTtcblx0XHRhc3NlcnRJc05vdEJyYWNrZXQobW9kZWwsIDIsIDYpO1xuXHRcdGFzc2VydElzTm90QnJhY2tldChtb2RlbCwgMiwgNyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JyYWNrZXQgbWF0Y2hpbmcgMicsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID1cblx0XHRcdCd2YXIgYmFyID0geycgKyAnXFxuJyArXG5cdFx0XHQnZm9vOiB7JyArICdcXG4nICtcblx0XHRcdCd9LCBiYXI6IHtoYWxsbzogW3snICsgJ1xcbicgK1xuXHRcdFx0J30sIHsnICsgJ1xcbicgK1xuXHRcdFx0J31dfX0nO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXh0LCBsYW5ndWFnZUlkKSk7XG5cblx0XHRjb25zdCBicmFja2V0czogW1Bvc2l0aW9uLCBSYW5nZSwgUmFuZ2VdW10gPSBbXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDEsIDExKSwgbmV3IFJhbmdlKDEsIDExLCAxLCAxMiksIG5ldyBSYW5nZSg1LCA0LCA1LCA1KV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDEsIDEyKSwgbmV3IFJhbmdlKDEsIDExLCAxLCAxMiksIG5ldyBSYW5nZSg1LCA0LCA1LCA1KV0sXG5cblx0XHRcdFtuZXcgUG9zaXRpb24oMiwgNiksIG5ldyBSYW5nZSgyLCA2LCAyLCA3KSwgbmV3IFJhbmdlKDMsIDEsIDMsIDIpXSxcblx0XHRcdFtuZXcgUG9zaXRpb24oMiwgNyksIG5ldyBSYW5nZSgyLCA2LCAyLCA3KSwgbmV3IFJhbmdlKDMsIDEsIDMsIDIpXSxcblxuXHRcdFx0W25ldyBQb3NpdGlvbigzLCAxKSwgbmV3IFJhbmdlKDMsIDEsIDMsIDIpLCBuZXcgUmFuZ2UoMiwgNiwgMiwgNyldLFxuXHRcdFx0W25ldyBQb3NpdGlvbigzLCAyKSwgbmV3IFJhbmdlKDMsIDEsIDMsIDIpLCBuZXcgUmFuZ2UoMiwgNiwgMiwgNyldLFxuXHRcdFx0W25ldyBQb3NpdGlvbigzLCA5KSwgbmV3IFJhbmdlKDMsIDksIDMsIDEwKSwgbmV3IFJhbmdlKDUsIDMsIDUsIDQpXSxcblx0XHRcdFtuZXcgUG9zaXRpb24oMywgMTApLCBuZXcgUmFuZ2UoMywgOSwgMywgMTApLCBuZXcgUmFuZ2UoNSwgMywgNSwgNCldLFxuXHRcdFx0W25ldyBQb3NpdGlvbigzLCAxNyksIG5ldyBSYW5nZSgzLCAxNywgMywgMTgpLCBuZXcgUmFuZ2UoNSwgMiwgNSwgMyldLFxuXHRcdFx0W25ldyBQb3NpdGlvbigzLCAxOCksIG5ldyBSYW5nZSgzLCAxOCwgMywgMTkpLCBuZXcgUmFuZ2UoNCwgMSwgNCwgMildLFxuXHRcdFx0W25ldyBQb3NpdGlvbigzLCAxOSksIG5ldyBSYW5nZSgzLCAxOCwgMywgMTkpLCBuZXcgUmFuZ2UoNCwgMSwgNCwgMildLFxuXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDQsIDEpLCBuZXcgUmFuZ2UoNCwgMSwgNCwgMiksIG5ldyBSYW5nZSgzLCAxOCwgMywgMTkpXSxcblx0XHRcdFtuZXcgUG9zaXRpb24oNCwgMiksIG5ldyBSYW5nZSg0LCAxLCA0LCAyKSwgbmV3IFJhbmdlKDMsIDE4LCAzLCAxOSldLFxuXHRcdFx0W25ldyBQb3NpdGlvbig0LCA0KSwgbmV3IFJhbmdlKDQsIDQsIDQsIDUpLCBuZXcgUmFuZ2UoNSwgMSwgNSwgMildLFxuXHRcdFx0W25ldyBQb3NpdGlvbig0LCA1KSwgbmV3IFJhbmdlKDQsIDQsIDQsIDUpLCBuZXcgUmFuZ2UoNSwgMSwgNSwgMildLFxuXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDUsIDEpLCBuZXcgUmFuZ2UoNSwgMSwgNSwgMiksIG5ldyBSYW5nZSg0LCA0LCA0LCA1KV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDUsIDIpLCBuZXcgUmFuZ2UoNSwgMiwgNSwgMyksIG5ldyBSYW5nZSgzLCAxNywgMywgMTgpXSxcblx0XHRcdFtuZXcgUG9zaXRpb24oNSwgMyksIG5ldyBSYW5nZSg1LCAzLCA1LCA0KSwgbmV3IFJhbmdlKDMsIDksIDMsIDEwKV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDUsIDQpLCBuZXcgUmFuZ2UoNSwgNCwgNSwgNSksIG5ldyBSYW5nZSgxLCAxMSwgMSwgMTIpXSxcblx0XHRcdFtuZXcgUG9zaXRpb24oNSwgNSksIG5ldyBSYW5nZSg1LCA0LCA1LCA1KSwgbmV3IFJhbmdlKDEsIDExLCAxLCAxMildLFxuXHRcdF07XG5cblx0XHRjb25zdCBpc0FCcmFja2V0OiB7IFtsaW5lTnVtYmVyOiBudW1iZXJdOiB7IFtjb2w6IG51bWJlcl06IGJvb2xlYW4gfSB9ID0geyAxOiB7fSwgMjoge30sIDM6IHt9LCA0OiB7fSwgNToge30gfTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYnJhY2tldHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IFt0ZXN0UG9zLCBiMSwgYjJdID0gYnJhY2tldHNbaV07XG5cdFx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIHRlc3RQb3MsIFtiMSwgYjJdKTtcblx0XHRcdGlzQUJyYWNrZXRbdGVzdFBvcy5saW5lTnVtYmVyXVt0ZXN0UG9zLmNvbHVtbl0gPSB0cnVlO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAxLCBsZW4gPSBtb2RlbC5nZXRMaW5lQ291bnQoKTsgaSA8PSBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KGkpO1xuXHRcdFx0Zm9yIChsZXQgaiA9IDEsIGxlbkogPSBsaW5lLmxlbmd0aCArIDE7IGogPD0gbGVuSjsgaisrKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRpZiAoIWlzQUJyYWNrZXRbaV0uaGFzT3duUHJvcGVydHkoPGFueT5qKSkge1xuXHRcdFx0XHRcdGFzc2VydElzTm90QnJhY2tldChtb2RlbCwgaSwgaik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdUZXh0TW9kZWxXaXRoVG9rZW5zIDInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYnJhY2tldCBtYXRjaGluZyAzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnYmVnaW4nLFxuXHRcdFx0JyAgICBsb29wJyxcblx0XHRcdCcgICAgICAgIGlmIHRoZW4nLFxuXHRcdFx0JyAgICAgICAgZW5kIGlmOycsXG5cdFx0XHQnICAgIGVuZCBsb29wOycsXG5cdFx0XHQnZW5kOycsXG5cdFx0XHQnJyxcblx0XHRcdCdiZWdpbicsXG5cdFx0XHQnICAgIGxvb3AnLFxuXHRcdFx0JyAgICAgICAgaWYgdGhlbicsXG5cdFx0XHQnICAgICAgICBlbmQgaWZhOycsXG5cdFx0XHQnICAgIGVuZCBsb29wOycsXG5cdFx0XHQnZW5kOycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsV2l0aEJyYWNrZXRzKGRpc3Bvc2FibGVzLCB0ZXh0LCBbXG5cdFx0XHRbJ2lmJywgJ2VuZCBpZiddLFxuXHRcdFx0Wydsb29wJywgJ2VuZCBsb29wJ10sXG5cdFx0XHRbJ2JlZ2luJywgJ2VuZCddXG5cdFx0XSk7XG5cblx0XHQvLyA8aWY+IC4uLiA8ZW5kIGlmYT4gaXMgbm90IG1hdGNoZWRcblx0XHRhc3NlcnRJc05vdEJyYWNrZXQobW9kZWwsIDEwLCA5KTtcblxuXHRcdC8vIDxpZj4gLi4uIDxlbmQgaWY+IGlzIG1hdGNoZWRcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbigzLCA5KSwgW25ldyBSYW5nZSgzLCA5LCAzLCAxMSksIG5ldyBSYW5nZSg0LCA5LCA0LCAxNSldKTtcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbig0LCA5KSwgW25ldyBSYW5nZSg0LCA5LCA0LCAxNSksIG5ldyBSYW5nZSgzLCA5LCAzLCAxMSldKTtcblxuXHRcdC8vIDxsb29wPiAuLi4gPGVuZCBsb29wPiBpcyBtYXRjaGVkXG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oMiwgNSksIFtuZXcgUmFuZ2UoMiwgNSwgMiwgOSksIG5ldyBSYW5nZSg1LCA1LCA1LCAxMyldKTtcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbig1LCA1KSwgW25ldyBSYW5nZSg1LCA1LCA1LCAxMyksIG5ldyBSYW5nZSgyLCA1LCAyLCA5KV0pO1xuXG5cdFx0Ly8gPGJlZ2luPiAuLi4gPGVuZD4gaXMgbWF0Y2hlZFxuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpLCBbbmV3IFJhbmdlKDEsIDEsIDEsIDYpLCBuZXcgUmFuZ2UoNiwgMSwgNiwgNCldKTtcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbig2LCAxKSwgW25ldyBSYW5nZSg2LCAxLCA2LCA0KSwgbmV3IFJhbmdlKDEsIDEsIDEsIDYpXSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JyYWNrZXQgbWF0Y2hpbmcgNCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J3JlY29yZGJlZ2luJyxcblx0XHRcdCcgIHNpbXBsZXJlY29yZGJlZ2luJyxcblx0XHRcdCcgIGVuZHJlY29yZCcsXG5cdFx0XHQnZW5kcmVjb3JkJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWxXaXRoQnJhY2tldHMoZGlzcG9zYWJsZXMsIHRleHQsIFtcblx0XHRcdFsncmVjb3JkYmVnaW4nLCAnZW5kcmVjb3JkJ10sXG5cdFx0XHRbJ3NpbXBsZXJlY29yZGJlZ2luJywgJ2VuZHJlY29yZCddLFxuXHRcdF0pO1xuXG5cdFx0Ly8gPHJlY29yZGJlZ2luPiAuLi4gPGVuZHJlY29yZD4gaXMgbWF0Y2hlZFxuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpLCBbbmV3IFJhbmdlKDEsIDEsIDEsIDEyKSwgbmV3IFJhbmdlKDQsIDEsIDQsIDEwKV0pO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDQsIDEpLCBbbmV3IFJhbmdlKDQsIDEsIDQsIDEwKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDEyKV0pO1xuXG5cdFx0Ly8gPHNpbXBsZXJlY29yZGJlZ2luPiAuLi4gPGVuZHJlY29yZD4gaXMgbWF0Y2hlZFxuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDMpLCBbbmV3IFJhbmdlKDIsIDMsIDIsIDIwKSwgbmV3IFJhbmdlKDMsIDMsIDMsIDEyKV0pO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDMpLCBbbmV3IFJhbmdlKDMsIDMsIDMsIDEyKSwgbmV3IFJhbmdlKDIsIDMsIDIsIDIwKV0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTU4NDM6IEhpZ2hsaWdodGluZyBvZiBjbG9zaW5nIGJyYWNlcyBpcyBpbmRpY2F0aW5nIHdyb25nIGJyYWNlIHdoZW4gY3Vyc29yIGlzIGJlaGluZCBvcGVuaW5nIGJyYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IG1vZGUxID0gJ3Rlc3RNb2RlMSc7XG5cdFx0Y29uc3QgbW9kZTIgPSAndGVzdE1vZGUyJztcblxuXHRcdGNvbnN0IGxhbmd1YWdlSWRDb2RlYyA9IGxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWM7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbW9kZTEgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBtb2RlMiB9KSk7XG5cdFx0Y29uc3QgZW5jb2RlZE1vZGUxID0gbGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobW9kZTEpO1xuXHRcdGNvbnN0IGVuY29kZWRNb2RlMiA9IGxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKG1vZGUyKTtcblxuXHRcdGNvbnN0IG90aGVyTWV0YWRhdGExID0gKFxuXHRcdFx0KGVuY29kZWRNb2RlMSA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVClcblx0XHRcdHwgKFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKVxuXHRcdFx0fCAoTWV0YWRhdGFDb25zdHMuQkFMQU5DRURfQlJBQ0tFVFNfTUFTSylcblx0XHQpID4+PiAwO1xuXHRcdGNvbnN0IG90aGVyTWV0YWRhdGEyID0gKFxuXHRcdFx0KGVuY29kZWRNb2RlMiA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVClcblx0XHRcdHwgKFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKVxuXHRcdFx0fCAoTWV0YWRhdGFDb25zdHMuQkFMQU5DRURfQlJBQ0tFVFNfTUFTSylcblx0XHQpID4+PiAwO1xuXG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnQgPSB7XG5cdFx0XHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IE51bGxTdGF0ZSxcblx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZSwgaGFzRU9MLCBzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKGxpbmUpIHtcblx0XHRcdFx0XHRjYXNlICdmdW5jdGlvbiBmKCkgeyc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdFx0XHRcdDAsIG90aGVyTWV0YWRhdGExLFxuXHRcdFx0XHRcdFx0XHQ4LCBvdGhlck1ldGFkYXRhMSxcblx0XHRcdFx0XHRcdFx0OSwgb3RoZXJNZXRhZGF0YTEsXG5cdFx0XHRcdFx0XHRcdDEwLCBvdGhlck1ldGFkYXRhMSxcblx0XHRcdFx0XHRcdFx0MTEsIG90aGVyTWV0YWRhdGExLFxuXHRcdFx0XHRcdFx0XHQxMiwgb3RoZXJNZXRhZGF0YTEsXG5cdFx0XHRcdFx0XHRcdDEzLCBvdGhlck1ldGFkYXRhMSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnICByZXR1cm4gPHA+e3RydWV9PC9wPjsnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlbnMgPSBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHRcdFx0XHQwLCBvdGhlck1ldGFkYXRhMSxcblx0XHRcdFx0XHRcdFx0Miwgb3RoZXJNZXRhZGF0YTEsXG5cdFx0XHRcdFx0XHRcdDgsIG90aGVyTWV0YWRhdGExLFxuXHRcdFx0XHRcdFx0XHQ5LCBvdGhlck1ldGFkYXRhMixcblx0XHRcdFx0XHRcdFx0MTAsIG90aGVyTWV0YWRhdGEyLFxuXHRcdFx0XHRcdFx0XHQxMSwgb3RoZXJNZXRhZGF0YTIsXG5cdFx0XHRcdFx0XHRcdDEyLCBvdGhlck1ldGFkYXRhMixcblx0XHRcdFx0XHRcdFx0MTMsIG90aGVyTWV0YWRhdGExLFxuXHRcdFx0XHRcdFx0XHQxNywgb3RoZXJNZXRhZGF0YTIsXG5cdFx0XHRcdFx0XHRcdDE4LCBvdGhlck1ldGFkYXRhMixcblx0XHRcdFx0XHRcdFx0MjAsIG90aGVyTWV0YWRhdGEyLFxuXHRcdFx0XHRcdFx0XHQyMSwgb3RoZXJNZXRhZGF0YTIsXG5cdFx0XHRcdFx0XHRcdDIyLCBvdGhlck1ldGFkYXRhMixcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnfSc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdFx0XHRcdDAsIG90aGVyTWV0YWRhdGExXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCh0b2tlbnMsIFtdLCBzdGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZGApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIobW9kZTEsIHRva2VuaXphdGlvblN1cHBvcnQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3Rlcihtb2RlMSwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0WycoJywgJyknXVxuXHRcdFx0XSxcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobW9kZTIsIHtcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsneycsICd9J10sXG5cdFx0XHRcdFsnWycsICddJ10sXG5cdFx0XHRcdFsnKCcsICcpJ11cblx0XHRcdF0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFtcblx0XHRcdFx0J2Z1bmN0aW9uIGYoKSB7Jyxcblx0XHRcdFx0JyAgcmV0dXJuIDxwPnt0cnVlfTwvcD47Jyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdG1vZGUxXG5cdFx0KSk7XG5cblx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24oMSk7XG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDIpO1xuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbigzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KG5ldyBQb3NpdGlvbigyLCAxNCkpLFxuXHRcdFx0W25ldyBSYW5nZSgyLCAxMywgMiwgMTQpLCBuZXcgUmFuZ2UoMiwgMTgsIDIsIDE5KV1cblx0XHQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODgwNzU6IFR5cGVTY3JpcHQgYnJhY2UgbWF0Y2hpbmcgaXMgaW5jb3JyZWN0IGluIGAke31gIHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlID0gJ3Rlc3RNb2RlJztcblxuXHRcdGNvbnN0IGxhbmd1YWdlSWRDb2RlYyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKS5sYW5ndWFnZUlkQ29kZWM7XG5cblx0XHRjb25zdCBlbmNvZGVkTW9kZSA9IGxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKG1vZGUpO1xuXG5cdFx0Y29uc3Qgb3RoZXJNZXRhZGF0YSA9IChcblx0XHRcdChlbmNvZGVkTW9kZSA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVClcblx0XHRcdHwgKFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKVxuXHRcdCkgPj4+IDA7XG5cdFx0Y29uc3Qgc3RyaW5nTWV0YWRhdGEgPSAoXG5cdFx0XHQoZW5jb2RlZE1vZGUgPDwgTWV0YWRhdGFDb25zdHMuTEFOR1VBR0VJRF9PRkZTRVQpXG5cdFx0XHR8IChTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgPDwgTWV0YWRhdGFDb25zdHMuVE9LRU5fVFlQRV9PRkZTRVQpXG5cdFx0KSA+Pj4gMDtcblxuXHRcdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0ID0ge1xuXHRcdFx0Z2V0SW5pdGlhbFN0YXRlOiAoKSA9PiBOdWxsU3RhdGUsXG5cdFx0XHR0b2tlbml6ZTogdW5kZWZpbmVkISxcblx0XHRcdHRva2VuaXplRW5jb2RlZDogKGxpbmUsIGhhc0VPTCwgc3RhdGUpID0+IHtcblx0XHRcdFx0c3dpdGNoIChsaW5lKSB7XG5cdFx0XHRcdFx0Y2FzZSAnZnVuY3Rpb24gaGVsbG8oKSB7Jzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0XHRcdFx0MCwgb3RoZXJNZXRhZGF0YVxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBbXSwgc3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICcgICAgY29uc29sZS5sb2coYCR7MTAwfWApOyc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdFx0XHRcdDAsIG90aGVyTWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRcdDE2LCBzdHJpbmdNZXRhZGF0YSxcblx0XHRcdFx0XHRcdFx0MTksIG90aGVyTWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRcdDIyLCBzdHJpbmdNZXRhZGF0YSxcblx0XHRcdFx0XHRcdFx0MjQsIG90aGVyTWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCh0b2tlbnMsIFtdLCBzdGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ30nOiB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlbnMgPSBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHRcdFx0XHQwLCBvdGhlck1ldGFkYXRhXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCh0b2tlbnMsIFtdLCBzdGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZGApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIobW9kZSwgdG9rZW5pemF0aW9uU3VwcG9ydCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKG1vZGUsIHtcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsneycsICd9J10sXG5cdFx0XHRcdFsnWycsICddJ10sXG5cdFx0XHRcdFsnKCcsICcpJ11cblx0XHRcdF0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFtcblx0XHRcdFx0J2Z1bmN0aW9uIGhlbGxvKCkgeycsXG5cdFx0XHRcdCcgICAgY29uc29sZS5sb2coYCR7MTAwfWApOycsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdG1vZGVcblx0XHQpKTtcblxuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbigxKTtcblx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24oMik7XG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KG5ldyBQb3NpdGlvbigyLCAyMykpLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmJyYWNrZXRQYWlycy5tYXRjaEJyYWNrZXQobmV3IFBvc2l0aW9uKDIsIDIwKSksIG51bGwpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5cbnN1aXRlKCdUZXh0TW9kZWxXaXRoVG9rZW5zIHJlZ3Jlc3Npb24gdGVzdHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjMTIyOiBVbmhhbmRsZWQgRXhjZXB0aW9uOiBUeXBlRXJyb3I6IFVuYWJsZSB0byBnZXQgcHJvcGVydHkgXFwncmVwbGFjZVxcJyBvZiB1bmRlZmluZWQgb3IgbnVsbCByZWZlcmVuY2UnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gYXNzZXJ0Vmlld0xpbmVUb2tlbnMobW9kZWw6IFRleHRNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyLCBmb3JjZVRva2VuaXphdGlvbjogYm9vbGVhbiwgZXhwZWN0ZWQ6IFRlc3RMaW5lVG9rZW5bXSk6IHZvaWQge1xuXHRcdFx0aWYgKGZvcmNlVG9rZW5pemF0aW9uKSB7XG5cdFx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IF9hY3R1YWwgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyKS5pbmZsYXRlKCk7XG5cdFx0XHRpbnRlcmZhY2UgSVNpbXBsZVZpZXdUb2tlbiB7XG5cdFx0XHRcdGVuZEluZGV4OiBudW1iZXI7XG5cdFx0XHRcdGZvcmVncm91bmQ6IG51bWJlcjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdHVhbDogSVNpbXBsZVZpZXdUb2tlbltdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gX2FjdHVhbC5nZXRDb3VudCgpOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0YWN0dWFsW2ldID0ge1xuXHRcdFx0XHRcdGVuZEluZGV4OiBfYWN0dWFsLmdldEVuZE9mZnNldChpKSxcblx0XHRcdFx0XHRmb3JlZ3JvdW5kOiBfYWN0dWFsLmdldEZvcmVncm91bmQoaSlcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlY29kZSA9ICh0b2tlbjogVGVzdExpbmVUb2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGVuZEluZGV4OiB0b2tlbi5lbmRJbmRleCxcblx0XHRcdFx0XHRmb3JlZ3JvdW5kOiB0b2tlbi5nZXRGb3JlZ3JvdW5kKClcblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQubWFwKGRlY29kZSkpO1xuXHRcdH1cblxuXHRcdGxldCBfdG9rZW5JZCA9IDEwO1xuXHRcdGNvbnN0IExBTkdfSUQxID0gJ2luZGljaXNpdmVNb2RlMSc7XG5cdFx0Y29uc3QgTEFOR19JRDIgPSAnaW5kaWNpc2l2ZU1vZGUyJztcblxuXHRcdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0ID0ge1xuXHRcdFx0Z2V0SW5pdGlhbFN0YXRlOiAoKSA9PiBOdWxsU3RhdGUsXG5cdFx0XHR0b2tlbml6ZTogdW5kZWZpbmVkISxcblx0XHRcdHRva2VuaXplRW5jb2RlZDogKGxpbmUsIGhhc0VPTCwgc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgbXlJZCA9ICsrX3Rva2VuSWQ7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheSgyKTtcblx0XHRcdFx0dG9rZW5zWzBdID0gMDtcblx0XHRcdFx0dG9rZW5zWzFdID0gKFxuXHRcdFx0XHRcdG15SWQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVRcblx0XHRcdFx0KSA+Pj4gMDtcblx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uMSA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKExBTkdfSUQxLCB0b2tlbml6YXRpb25TdXBwb3J0KTtcblx0XHRjb25zdCByZWdpc3RyYXRpb24yID0gVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoTEFOR19JRDIsIHRva2VuaXphdGlvblN1cHBvcnQpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ0EgbW9kZWwgd2l0aFxcbnR3byBsaW5lcycpO1xuXG5cdFx0YXNzZXJ0Vmlld0xpbmVUb2tlbnMobW9kZWwsIDEsIHRydWUsIFtjcmVhdGVWaWV3TGluZVRva2VuKDEyLCAxKV0pO1xuXHRcdGFzc2VydFZpZXdMaW5lVG9rZW5zKG1vZGVsLCAyLCB0cnVlLCBbY3JlYXRlVmlld0xpbmVUb2tlbig5LCAxKV0pO1xuXG5cdFx0bW9kZWwuc2V0TGFuZ3VhZ2UoTEFOR19JRDEpO1xuXG5cdFx0YXNzZXJ0Vmlld0xpbmVUb2tlbnMobW9kZWwsIDEsIHRydWUsIFtjcmVhdGVWaWV3TGluZVRva2VuKDEyLCAxMSldKTtcblx0XHRhc3NlcnRWaWV3TGluZVRva2Vucyhtb2RlbCwgMiwgdHJ1ZSwgW2NyZWF0ZVZpZXdMaW5lVG9rZW4oOSwgMTIpXSk7XG5cblx0XHRtb2RlbC5zZXRMYW5ndWFnZShMQU5HX0lEMik7XG5cblx0XHRhc3NlcnRWaWV3TGluZVRva2Vucyhtb2RlbCwgMSwgZmFsc2UsIFtjcmVhdGVWaWV3TGluZVRva2VuKDEyLCAxKV0pO1xuXHRcdGFzc2VydFZpZXdMaW5lVG9rZW5zKG1vZGVsLCAyLCBmYWxzZSwgW2NyZWF0ZVZpZXdMaW5lVG9rZW4oOSwgMSldKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRyZWdpc3RyYXRpb24xLmRpc3Bvc2UoKTtcblx0XHRyZWdpc3RyYXRpb24yLmRpc3Bvc2UoKTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVZpZXdMaW5lVG9rZW4oZW5kSW5kZXg6IG51bWJlciwgZm9yZWdyb3VuZDogbnVtYmVyKTogVGVzdExpbmVUb2tlbiB7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IChcblx0XHRcdFx0KGZvcmVncm91bmQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHQpID4+PiAwO1xuXHRcdFx0cmV0dXJuIG5ldyBUZXN0TGluZVRva2VuKGVuZEluZGV4LCBtZXRhZGF0YSk7XG5cdFx0fVxuXHR9KTtcblxuXG5cdHRlc3QoJ21pY3Jvc29mdC9tb25hY28tZWRpdG9yIzEzMzogRXJyb3I6IENhbm5vdCByZWFkIHByb3BlcnR5IFxcJ21vZGVJZFxcJyBvZiB1bmRlZmluZWQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbFdpdGhCcmFja2V0cyhcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0W1xuXHRcdFx0XHQnSW1wb3J0cyBTeXN0ZW0nLFxuXHRcdFx0XHQnSW1wb3J0cyBTeXN0ZW0uQ29sbGVjdGlvbnMuR2VuZXJpYycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnTW9kdWxlIG0xJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdcXHRTdWIgTWFpbigpJyxcblx0XHRcdFx0J1xcdEVuZCBTdWInLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0VuZCBNb2R1bGUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdFtcblx0XHRcdFx0Wydtb2R1bGUnLCAnZW5kIG1vZHVsZSddLFxuXHRcdFx0XHRbJ3N1YicsICdlbmQgc3ViJ11cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gbW9kZWwuYnJhY2tldFBhaXJzLm1hdGNoQnJhY2tldChuZXcgUG9zaXRpb24oNCwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbbmV3IFJhbmdlKDQsIDEsIDQsIDcpLCBuZXcgUmFuZ2UoOSwgMSwgOSwgMTEpXSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg1NjogQnJhY2tldCBtYXRjaGluZyBkb2VzIG5vdCB3b3JrIGFzIGV4cGVjdGVkIGlmIHRoZSBvcGVuaW5nIGJyYWNlIHN5bWJvbCBpcyBjb250YWluZWQgaW4gdGhlIGNsb3NpbmcgYnJhY2Ugc3ltYm9sJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWxXaXRoQnJhY2tldHMoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdFtcblx0XHRcdFx0J3NlcXVlbmNlIFwib3V0ZXJcIicsXG5cdFx0XHRcdCcgICAgIHNlcXVlbmNlIFwiaW5uZXJcIicsXG5cdFx0XHRcdCcgICAgIGVuZHNlcXVlbmNlJyxcblx0XHRcdFx0J2VuZHNlcXVlbmNlJyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHRbXG5cdFx0XHRcdFsnc2VxdWVuY2UnLCAnZW5kc2VxdWVuY2UnXSxcblx0XHRcdFx0WydmZWF0dXJlJywgJ2VuZGZlYXR1cmUnXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KG5ldyBQb3NpdGlvbigzLCA5KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtuZXcgUmFuZ2UoMiwgNiwgMiwgMTQpLCBuZXcgUmFuZ2UoMywgNiwgMywgMTcpXSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM2MzgyMjogV3JvbmcgZW1iZWRkZWQgbGFuZ3VhZ2UgZGV0ZWN0ZWQgZm9yIGVtcHR5IGxpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgb3V0ZXJNb2RlID0gJ291dGVyTW9kZSc7XG5cdFx0Y29uc3QgaW5uZXJNb2RlID0gJ2lubmVyTW9kZSc7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogb3V0ZXJNb2RlIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogaW5uZXJNb2RlIH0pKTtcblxuXHRcdGNvbnN0IGxhbmd1YWdlSWRDb2RlYyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKS5sYW5ndWFnZUlkQ29kZWM7XG5cdFx0Y29uc3QgZW5jb2RlZElubmVyTW9kZSA9IGxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGlubmVyTW9kZSk7XG5cblx0XHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0OiBJVG9rZW5pemF0aW9uU3VwcG9ydCA9IHtcblx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdFx0dG9rZW5pemU6IHVuZGVmaW5lZCEsXG5cdFx0XHR0b2tlbml6ZUVuY29kZWQ6IChsaW5lLCBoYXNFT0wsIHN0YXRlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheSgyKTtcblx0XHRcdFx0dG9rZW5zWzBdID0gMDtcblx0XHRcdFx0dG9rZW5zWzFdID0gKFxuXHRcdFx0XHRcdGVuY29kZWRJbm5lck1vZGUgPDwgTWV0YWRhdGFDb25zdHMuTEFOR1VBR0VJRF9PRkZTRVRcblx0XHRcdFx0KSA+Pj4gMDtcblx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKFRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKG91dGVyTW9kZSwgdG9rZW5pemF0aW9uU3VwcG9ydCkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdBIG1vZGVsIHdpdGggb25lIGxpbmUnLCBvdXRlck1vZGUpKTtcblxuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbigxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24oMSwgMSksIGlubmVyTW9kZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdUZXh0TW9kZWwuZ2V0TGluZUluZGVudEd1aWRlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGFzc2VydEluZGVudEd1aWRlcyhsaW5lczogW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlciwgc3RyaW5nXVtdLCBpbmRlbnRTaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ3Rlc3RMYW5nJztcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZU1vZGVsU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cblx0XHRjb25zdCB0ZXh0ID0gbGluZXMubWFwKGwgPT4gbFs0XSkuam9pbignXFxuJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRleHQsIGxhbmd1YWdlSWQpKTtcblx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHsgaW5kZW50U2l6ZTogaW5kZW50U2l6ZSB9KTtcblxuXHRcdGNvbnN0IGFjdHVhbEluZGVudHMgPSBtb2RlbC5ndWlkZXMuZ2V0TGluZXNJbmRlbnRHdWlkZXMoMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXG5cdFx0Y29uc3QgYWN0dWFsOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBzdHJpbmddW10gPSBbXTtcblx0XHRmb3IgKGxldCBsaW5lID0gMTsgbGluZSA8PSBtb2RlbC5nZXRMaW5lQ291bnQoKTsgbGluZSsrKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVJbmRlbnRHdWlkZSA9IG1vZGVsLmd1aWRlcy5nZXRBY3RpdmVJbmRlbnRHdWlkZShsaW5lLCAxLCBtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhY3R1YWxbbGluZSAtIDFdID0gW2FjdHVhbEluZGVudHNbbGluZSAtIDFdLCBhY3RpdmVJbmRlbnRHdWlkZS5zdGFydExpbmVOdW1iZXIsIGFjdGl2ZUluZGVudEd1aWRlLmVuZExpbmVOdW1iZXIsIGFjdGl2ZUluZGVudEd1aWRlLmluZGVudCwgbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZSldO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBsaW5lcyk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHR0ZXN0KCdnZXRMaW5lSW5kZW50R3VpZGUgb25lIGxldmVsIDInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFswLCAyLCA0LCAxLCAnQSddLFxuXHRcdFx0WzEsIDIsIDQsIDEsICcgIEEnXSxcblx0XHRcdFsxLCAyLCA0LCAxLCAnICBBJ10sXG5cdFx0XHRbMSwgMiwgNCwgMSwgJyAgQSddLFxuXHRcdF0sIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRMaW5lSW5kZW50R3VpZGUgdHdvIGxldmVscycsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDIsIDUsIDEsICdBJ10sXG5cdFx0XHRbMSwgMiwgNSwgMSwgJyAgQSddLFxuXHRcdFx0WzEsIDQsIDUsIDIsICcgIEEnXSxcblx0XHRcdFsyLCA0LCA1LCAyLCAnICAgIEEnXSxcblx0XHRcdFsyLCA0LCA1LCAyLCAnICAgIEEnXSxcblx0XHRdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TGluZUluZGVudEd1aWRlIHRocmVlIGxldmVscycsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDIsIDQsIDEsICdBJ10sXG5cdFx0XHRbMSwgMywgNCwgMiwgJyAgQSddLFxuXHRcdFx0WzIsIDQsIDQsIDMsICcgICAgQSddLFxuXHRcdFx0WzMsIDQsIDQsIDMsICcgICAgICBBJ10sXG5cdFx0XHRbMCwgNSwgNSwgMCwgJ0EnXSxcblx0XHRdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TGluZUluZGVudEd1aWRlIGRlY3JlYXNpbmcgaW5kZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydEluZGVudEd1aWRlcyhbXG5cdFx0XHRbMiwgMSwgMSwgMiwgJyAgICBBJ10sXG5cdFx0XHRbMSwgMSwgMSwgMiwgJyAgQSddLFxuXHRcdFx0WzAsIDEsIDIsIDEsICdBJ10sXG5cdFx0XSwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldExpbmVJbmRlbnRHdWlkZSBKYXZhJywgKCkgPT4ge1xuXHRcdGFzc2VydEluZGVudEd1aWRlcyhbXG5cdFx0XHQvKiAxKi9bMCwgMiwgOSwgMSwgJ2NsYXNzIEEgeyddLFxuXHRcdFx0LyogMiovWzEsIDMsIDQsIDIsICcgIHZvaWQgZm9vKCkgeyddLFxuXHRcdFx0LyogMyovWzIsIDMsIDQsIDIsICcgICAgY29uc29sZS5sb2coMSk7J10sXG5cdFx0XHQvKiA0Ki9bMiwgMywgNCwgMiwgJyAgICBjb25zb2xlLmxvZygyKTsnXSxcblx0XHRcdC8qIDUqL1sxLCAzLCA0LCAyLCAnICB9J10sXG5cdFx0XHQvKiA2Ki9bMSwgMiwgOSwgMSwgJyddLFxuXHRcdFx0LyogNyovWzEsIDgsIDgsIDIsICcgIHZvaWQgYmFyKCkgeyddLFxuXHRcdFx0LyogOCovWzIsIDgsIDgsIDIsICcgICAgY29uc29sZS5sb2coMyk7J10sXG5cdFx0XHQvKiA5Ki9bMSwgOCwgOCwgMiwgJyAgfSddLFxuXHRcdFx0LyoxMCovWzAsIDIsIDksIDEsICd9J10sXG5cdFx0XHQvKjExKi9bMCwgMTIsIDEyLCAxLCAnaW50ZXJmYWNlIEIgeyddLFxuXHRcdFx0LyoxMiovWzEsIDEyLCAxMiwgMSwgJyAgdm9pZCBiYXIoKTsnXSxcblx0XHRcdC8qMTMqL1swLCAxMiwgMTIsIDEsICd9J10sXG5cdFx0XSwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldExpbmVJbmRlbnRHdWlkZSBKYXZhZG9jJywgKCkgPT4ge1xuXHRcdGFzc2VydEluZGVudEd1aWRlcyhbXG5cdFx0XHRbMCwgMiwgMywgMSwgJy8qKiddLFxuXHRcdFx0WzEsIDIsIDMsIDEsICcgKiBDb21tZW50J10sXG5cdFx0XHRbMSwgMiwgMywgMSwgJyAqLyddLFxuXHRcdFx0WzAsIDUsIDYsIDEsICdjbGFzcyBBIHsnXSxcblx0XHRcdFsxLCA1LCA2LCAxLCAnICB2b2lkIGZvbygpIHsnXSxcblx0XHRcdFsxLCA1LCA2LCAxLCAnICB9J10sXG5cdFx0XHRbMCwgNSwgNiwgMSwgJ30nXSxcblx0XHRdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TGluZUluZGVudEd1aWRlIFdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFswLCAyLCA3LCAxLCAnY2xhc3MgQSB7J10sXG5cdFx0XHRbMSwgMiwgNywgMSwgJyddLFxuXHRcdFx0WzEsIDQsIDUsIDIsICcgIHZvaWQgZm9vKCkgeyddLFxuXHRcdFx0WzIsIDQsIDUsIDIsICcgICAgJ10sXG5cdFx0XHRbMiwgNCwgNSwgMiwgJyAgICByZXR1cm4gMTsnXSxcblx0XHRcdFsxLCA0LCA1LCAyLCAnICB9J10sXG5cdFx0XHRbMSwgMiwgNywgMSwgJyAgICAgICddLFxuXHRcdFx0WzAsIDIsIDcsIDEsICd9J11cblx0XHRdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TGluZUluZGVudEd1aWRlIFRhYnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFswLCAyLCA3LCAxLCAnY2xhc3MgQSB7J10sXG5cdFx0XHRbMSwgMiwgNywgMSwgJ1xcdFxcdCddLFxuXHRcdFx0WzEsIDQsIDUsIDIsICdcXHR2b2lkIGZvbygpIHsnXSxcblx0XHRcdFsyLCA0LCA1LCAyLCAnXFx0IFxcdC8vaGVsbG8nXSxcblx0XHRcdFsyLCA0LCA1LCAyLCAnXFx0ICAgIHJldHVybiAyOyddLFxuXHRcdFx0WzEsIDQsIDUsIDIsICcgIFxcdH0nXSxcblx0XHRcdFsxLCAyLCA3LCAxLCAnICAgICAgJ10sXG5cdFx0XHRbMCwgMiwgNywgMSwgJ30nXVxuXHRcdF0sIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRMaW5lSW5kZW50R3VpZGUgY2hlY2tlci50cycsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0LyogMSovWzAsIDEsIDEsIDAsICcvLy8gPHJlZmVyZW5jZSBwYXRoPVwiYmluZGVyLnRzXCIvPiddLFxuXHRcdFx0LyogMiovWzAsIDIsIDIsIDAsICcnXSxcblx0XHRcdC8qIDMqL1swLCAzLCAzLCAwLCAnLyogQGludGVybmFsICovJ10sXG5cdFx0XHQvKiA0Ki9bMCwgNSwgMTYsIDEsICduYW1lc3BhY2UgdHMgeyddLFxuXHRcdFx0LyogNSovWzEsIDUsIDE2LCAxLCAnICAgIGxldCBuZXh0U3ltYm9sSWQgPSAxOyddLFxuXHRcdFx0LyogNiovWzEsIDUsIDE2LCAxLCAnICAgIGxldCBuZXh0Tm9kZUlkID0gMTsnXSxcblx0XHRcdC8qIDcqL1sxLCA1LCAxNiwgMSwgJyAgICBsZXQgbmV4dE1lcmdlSWQgPSAxOyddLFxuXHRcdFx0LyogOCovWzEsIDUsIDE2LCAxLCAnICAgIGxldCBuZXh0Rmxvd0lkID0gMTsnXSxcblx0XHRcdC8qIDkqL1sxLCA1LCAxNiwgMSwgJyddLFxuXHRcdFx0LyoxMCovWzEsIDExLCAxNSwgMiwgJyAgICBleHBvcnQgZnVuY3Rpb24gZ2V0Tm9kZUlkKG5vZGU6IE5vZGUpOiBudW1iZXIgeyddLFxuXHRcdFx0LyoxMSovWzIsIDEyLCAxMywgMywgJyAgICAgICAgaWYgKCFub2RlLmlkKSB7J10sXG5cdFx0XHQvKjEyKi9bMywgMTIsIDEzLCAzLCAnICAgICAgICAgICAgbm9kZS5pZCA9IG5leHROb2RlSWQ7J10sXG5cdFx0XHQvKjEzKi9bMywgMTIsIDEzLCAzLCAnICAgICAgICAgICAgbmV4dE5vZGVJZCsrOyddLFxuXHRcdFx0LyoxNCovWzIsIDEyLCAxMywgMywgJyAgICAgICAgfSddLFxuXHRcdFx0LyoxNSovWzIsIDExLCAxNSwgMiwgJyAgICAgICAgcmV0dXJuIG5vZGUuaWQ7J10sXG5cdFx0XHQvKjE2Ki9bMSwgMTEsIDE1LCAyLCAnICAgIH0nXSxcblx0XHRcdC8qMTcqL1swLCA1LCAxNiwgMSwgJ30nXVxuXHRcdF0sIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODQyNSAtIE1pc3NpbmcgaW5kZW50YXRpb24gbGluZXMgZm9yIGZpcnN0IGxldmVsIGluZGVudGF0aW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydEluZGVudEd1aWRlcyhbXG5cdFx0XHRbMSwgMiwgMywgMiwgJ1xcdGluZGVudDEnXSxcblx0XHRcdFsyLCAyLCAzLCAyLCAnXFx0XFx0aW5kZW50MiddLFxuXHRcdFx0WzIsIDIsIDMsIDIsICdcXHRcXHRpbmRlbnQyJ10sXG5cdFx0XHRbMSwgMiwgMywgMiwgJ1xcdGluZGVudDEnXVxuXHRcdF0sIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODk1MiAtIEluZGVudGF0aW9uIGd1aWRlIGxpbmVzIGdvaW5nIHRocm91Z2ggdGV4dCBvbiAueW1sIGZpbGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFswLCAyLCA1LCAxLCAncHJvcGVydGllczonXSxcblx0XHRcdFsxLCAzLCA1LCAyLCAnICAgIGVtYWlsQWRkcmVzczonXSxcblx0XHRcdFsyLCAzLCA1LCAyLCAnICAgICAgICAtIGJsYSddLFxuXHRcdFx0WzIsIDUsIDUsIDMsICcgICAgICAgIC0gbGVuZ3RoOiddLFxuXHRcdFx0WzMsIDUsIDUsIDMsICcgICAgICAgICAgICBtYXg6IDI1NSddLFxuXHRcdFx0WzAsIDYsIDYsIDAsICdnZXR0ZXJzOiddXG5cdFx0XSwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MiAtIEluZGVudCBndWlkZXMgbG9vayBmdW5ueScsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDIsIDcsIDEsICdmdW5jdGlvbiB0ZXN0KGJhc2UpIHsnXSxcblx0XHRcdFsxLCAzLCA2LCAyLCAnXFx0c3dpdGNoIChiYXNlKSB7J10sXG5cdFx0XHRbMiwgNCwgNCwgMywgJ1xcdFxcdGNhc2UgMTonXSxcblx0XHRcdFszLCA0LCA0LCAzLCAnXFx0XFx0XFx0cmV0dXJuIDE7J10sXG5cdFx0XHRbMiwgNiwgNiwgMywgJ1xcdFxcdGNhc2UgMjonXSxcblx0XHRcdFszLCA2LCA2LCAzLCAnXFx0XFx0XFx0cmV0dXJuIDI7J10sXG5cdFx0XHRbMSwgMiwgNywgMSwgJ1xcdH0nXSxcblx0XHRcdFswLCAyLCA3LCAxLCAnfSddXG5cdFx0XSwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjM5OCAtIFByb2JsZW0gaW4gaW5kZW50IGd1aWRlbGluZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFsyLCAyLCAyLCAzLCAnXFx0XFx0LmJsYSddLFxuXHRcdFx0WzMsIDIsIDIsIDMsICdcXHRcXHRcXHRsYWJlbChmb3IpJ10sXG5cdFx0XHRbMCwgMywgMywgMCwgJ2luY2x1ZGUgc2NyaXB0J11cblx0XHRdLCA0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ5MTczJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdjbGFzcyBBIHsnLFxuXHRcdFx0J1x0cHVibGljIG0xKCk6IHZvaWQgeycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCdcdHB1YmxpYyBtMigpOiB2b2lkIHsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnXHRwdWJsaWMgbTMoKTogdm9pZCB7Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0J1x0cHVibGljIG00KCk6IHZvaWQgeycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCdcdHB1YmxpYyBtNSgpOiB2b2lkIHsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5ndWlkZXMuZ2V0QWN0aXZlSW5kZW50R3VpZGUoMiwgNCwgOSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBlbmRMaW5lTnVtYmVyOiA5LCBpbmRlbnQ6IDEgfSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d2Vha3MgLSBubyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFswLCAxLCAxLCAwLCAnQSddLFxuXHRcdFx0WzAsIDIsIDIsIDAsICdBJ11cblx0XHRdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgndHdlYWtzIC0gaW5zaWRlIHNjb3BlJywgKCkgPT4ge1xuXHRcdGFzc2VydEluZGVudEd1aWRlcyhbXG5cdFx0XHRbMCwgMiwgMiwgMSwgJ0EnXSxcblx0XHRcdFsxLCAyLCAyLCAxLCAnICBBJ11cblx0XHRdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgndHdlYWtzIC0gc2NvcGUgc3RhcnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFswLCAyLCAyLCAxLCAnQSddLFxuXHRcdFx0WzEsIDIsIDIsIDEsICcgIEEnXSxcblx0XHRcdFswLCAyLCAyLCAxLCAnQSddXG5cdFx0XSwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3ZWFrcyAtIGVtcHR5IGxpbmUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFswLCAyLCA0LCAxLCAnQSddLFxuXHRcdFx0WzEsIDIsIDQsIDEsICcgIEEnXSxcblx0XHRcdFsxLCAyLCA0LCAxLCAnJ10sXG5cdFx0XHRbMSwgMiwgNCwgMSwgJyAgQSddLFxuXHRcdFx0WzAsIDIsIDQsIDEsICdBJ11cblx0XHRdLCAyKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFHdEIsU0FBK0Isc0JBQXNCLGlDQUFpQztBQUN0RixTQUFTLG1CQUFtQixzQkFBc0I7QUFFbEQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUIsaUJBQWlCLDRCQUE0QjtBQUUzRSxTQUFTLCtDQUErQztBQUV4RCxTQUFTLDRCQUE0QixhQUE4QixNQUFjLFVBQXNDO0FBQ3RILFFBQU0sYUFBYTtBQUNuQixRQUFNLHVCQUF1QixvQkFBb0IsV0FBVztBQUM1RCxRQUFNLCtCQUErQixxQkFBcUIsSUFBSSw2QkFBNkI7QUFDM0YsUUFBTSxrQkFBa0IscUJBQXFCLElBQUksZ0JBQWdCO0FBRWpFLGNBQVksSUFBSSxnQkFBZ0IsaUJBQWlCLEVBQUUsSUFBSSxXQUFXLENBQUMsQ0FBQztBQUNwRSxjQUFZLElBQUksNkJBQTZCLFNBQVMsWUFBWSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBRS9FLFNBQU8sWUFBWSxJQUFJLHFCQUFxQixzQkFBc0IsTUFBTSxVQUFVLENBQUM7QUFDcEY7QUFFQSxNQUFNLHVCQUF1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LENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3pGLG9CQUFnQixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3pGLG9CQUFnQixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3pGLG9CQUFnQixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRXpGLG9CQUFnQixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3pGLG9CQUFnQixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3pGLG9CQUFnQixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3pGLG9CQUFnQixPQUFPLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3pGLHVCQUFtQixPQUFPLEdBQUcsQ0FBQztBQUM5Qix1QkFBbUIsT0FBTyxHQUFHLENBQUM7QUFDOUIsdUJBQW1CLE9BQU8sR0FBRyxDQUFDO0FBQUEsRUFDL0IsQ0FBQztBQUVELE9BQUssc0JBQXNCLE1BQU07QUFDaEMsVUFBTSxPQUNMO0FBS0QsVUFBTSxRQUFRLFlBQVksSUFBSSxxQkFBcUIsc0JBQXNCLE1BQU0sVUFBVSxDQUFDO0FBRTFGLFVBQU0sV0FBdUM7QUFBQSxNQUM1QyxDQUFDLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNwRSxDQUFDLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUVwRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNqRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUVqRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNqRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNqRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNsRSxDQUFDLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNuRSxDQUFDLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNwRSxDQUFDLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNwRSxDQUFDLElBQUksU0FBUyxHQUFHLEVBQUUsR0FBRyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUVwRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxNQUNuRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxNQUNuRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNqRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUVqRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNqRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxNQUNuRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxNQUNsRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxNQUNuRSxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxJQUNwRTtBQUVBLFVBQU0sYUFBbUUsRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUMsRUFBRTtBQUM3RyxhQUFTLElBQUksR0FBRyxNQUFNLFNBQVMsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNwRCxZQUFNLENBQUMsU0FBUyxJQUFJLEVBQUUsSUFBSSxTQUFTLENBQUM7QUFDcEMsc0JBQWdCLE9B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
