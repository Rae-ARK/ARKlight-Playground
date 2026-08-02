import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { FontStyle, MetadataConsts, TokenMetadata } from "../../../common/encodedTokenAttributes.js";
import { ILanguageConfigurationService, LanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { LanguageIdCodec } from "../../../common/services/languagesRegistry.js";
import { LineTokens } from "../../../common/tokens/lineTokens.js";
import { SparseMultilineTokens } from "../../../common/tokens/sparseMultilineTokens.js";
import { SparseTokensStore } from "../../../common/tokens/sparseTokensStore.js";
import { createModelServices, createTextModel, instantiateTextModel } from "../testTextModel.js";
suite("TokensStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const SEMANTIC_COLOR = 5;
  function parseTokensState(state) {
    const text = [];
    const tokens = [];
    let baseLine = 1;
    for (let i = 0; i < state.length; i++) {
      const line = state[i];
      let startOffset = 0;
      let lineText = "";
      while (true) {
        const firstPipeOffset = line.indexOf("|", startOffset);
        if (firstPipeOffset === -1) {
          break;
        }
        const secondPipeOffset = line.indexOf("|", firstPipeOffset + 1);
        if (secondPipeOffset === -1) {
          break;
        }
        if (firstPipeOffset + 1 === secondPipeOffset) {
          lineText += line.substring(startOffset, secondPipeOffset + 1);
          startOffset = secondPipeOffset + 1;
          continue;
        }
        lineText += line.substring(startOffset, firstPipeOffset);
        const tokenStartCharacter = lineText.length;
        const tokenLength = secondPipeOffset - firstPipeOffset - 1;
        const metadata = SEMANTIC_COLOR << MetadataConsts.FOREGROUND_OFFSET | MetadataConsts.SEMANTIC_USE_FOREGROUND;
        if (tokens.length === 0) {
          baseLine = i + 1;
        }
        tokens.push(i + 1 - baseLine, tokenStartCharacter, tokenStartCharacter + tokenLength, metadata);
        lineText += line.substr(firstPipeOffset + 1, tokenLength);
        startOffset = secondPipeOffset + 1;
      }
      lineText += line.substring(startOffset);
      text.push(lineText);
    }
    return {
      text: text.join("\n"),
      tokens: SparseMultilineTokens.create(baseLine, new Uint32Array(tokens))
    };
  }
  function extractState(model) {
    const result = [];
    for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
      const lineTokens = model.tokenization.getLineTokens(lineNumber);
      const lineContent = model.getLineContent(lineNumber);
      let lineText = "";
      for (let i = 0; i < lineTokens.getCount(); i++) {
        const tokenStartCharacter = lineTokens.getStartOffset(i);
        const tokenEndCharacter = lineTokens.getEndOffset(i);
        const metadata = lineTokens.getMetadata(i);
        const color = TokenMetadata.getForeground(metadata);
        const tokenText = lineContent.substring(tokenStartCharacter, tokenEndCharacter);
        if (color === SEMANTIC_COLOR) {
          lineText += `|${tokenText}|`;
        } else {
          lineText += tokenText;
        }
      }
      result.push(lineText);
    }
    return result;
  }
  function testTokensAdjustment(rawInitialState, edits, rawFinalState) {
    const initialState = parseTokensState(rawInitialState);
    const model = createTextModel(initialState.text);
    model.tokenization.setSemanticTokens([initialState.tokens], true);
    model.applyEdits(edits);
    const actualState = extractState(model);
    assert.deepStrictEqual(actualState, rawFinalState);
    model.dispose();
  }
  test("issue #86303 - color shifting between different tokens", () => {
    testTokensAdjustment(
      [
        `import { |URI| } from 'vs/base/common/uri';`,
        `const foo = |URI|.parse('hey');`
      ],
      [
        { range: new Range(2, 9, 2, 10), text: "" }
      ],
      [
        `import { |URI| } from 'vs/base/common/uri';`,
        `const fo = |URI|.parse('hey');`
      ]
    );
  });
  test("deleting a newline", () => {
    testTokensAdjustment(
      [
        `import { |URI| } from 'vs/base/common/uri';`,
        `const foo = |URI|.parse('hey');`
      ],
      [
        { range: new Range(1, 42, 2, 1), text: "" }
      ],
      [
        `import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
      ]
    );
  });
  test("inserting a newline", () => {
    testTokensAdjustment(
      [
        `import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
      ],
      [
        { range: new Range(1, 42, 1, 42), text: "\n" }
      ],
      [
        `import { |URI| } from 'vs/base/common/uri';`,
        `const foo = |URI|.parse('hey');`
      ]
    );
  });
  test("deleting a newline 2", () => {
    testTokensAdjustment(
      [
        `import { `,
        `    |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
      ],
      [
        { range: new Range(1, 10, 2, 5), text: "" }
      ],
      [
        `import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
      ]
    );
  });
  test("issue #179268: a complex edit", () => {
    testTokensAdjustment(
      [
        `|export| |'interior_material_selector.dart'|;`,
        `|export| |'mileage_selector.dart'|;`,
        `|export| |'owners_selector.dart'|;`,
        `|export| |'price_selector.dart'|;`,
        `|export| |'seat_count_selector.dart'|;`,
        `|export| |'year_selector.dart'|;`,
        `|export| |'winter_options_selector.dart'|;|export| |'camera_selector.dart'|;`
      ],
      [
        { range: new Range(1, 9, 1, 9), text: `camera_selector.dart';
export '` },
        { range: new Range(6, 9, 7, 9), text: `` },
        { range: new Range(7, 39, 7, 39), text: `
` },
        { range: new Range(7, 47, 7, 48), text: `ye` },
        { range: new Range(7, 49, 7, 51), text: `` },
        { range: new Range(7, 52, 7, 53), text: `` }
      ],
      [
        `|export| |'|camera_selector.dart';`,
        `export 'interior_material_selector.dart';`,
        `|export| |'mileage_selector.dart'|;`,
        `|export| |'owners_selector.dart'|;`,
        `|export| |'price_selector.dart'|;`,
        `|export| |'seat_count_selector.dart'|;`,
        `|export| |'||winter_options_selector.dart'|;`,
        `|export| |'year_selector.dart'|;`
      ]
    );
  });
  test("issue #91936: Semantic token color highlighting fails on line with selected text", () => {
    const model = createTextModel("                    else if ($s = 08) then '\\b'");
    model.tokenization.setSemanticTokens([
      SparseMultilineTokens.create(1, new Uint32Array([
        0,
        20,
        24,
        491536,
        0,
        25,
        27,
        491536,
        0,
        28,
        29,
        32784,
        0,
        29,
        31,
        524304,
        0,
        32,
        33,
        32784,
        0,
        34,
        36,
        196624,
        0,
        36,
        37,
        32784,
        0,
        38,
        42,
        491536,
        0,
        43,
        47,
        360464
      ]))
    ], true);
    const lineTokens = model.tokenization.getLineTokens(1);
    const decodedTokens = [];
    for (let i = 0, len = lineTokens.getCount(); i < len; i++) {
      decodedTokens.push(lineTokens.getEndOffset(i), lineTokens.getMetadata(i));
    }
    assert.deepStrictEqual(decodedTokens, [
      20,
      33588225,
      24,
      34046977,
      25,
      33588225,
      27,
      34046977,
      28,
      33588225,
      29,
      33588225,
      31,
      34079745,
      32,
      33588225,
      33,
      33588225,
      34,
      33588225,
      36,
      33752065,
      37,
      33588225,
      38,
      33588225,
      42,
      34046977,
      43,
      33588225,
      47,
      33915905
    ]);
    model.dispose();
  });
  test('issue #147944: Language id "vs.editor.nullLanguage" is not configured nor known', () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables, [
      [ILanguageConfigurationService, LanguageConfigurationService]
    ]);
    const model = disposables.add(instantiateTextModel(instantiationService, "--[[\n\n]]"));
    model.tokenization.setSemanticTokens([
      SparseMultilineTokens.create(1, new Uint32Array([
        0,
        2,
        4,
        131088,
        1,
        0,
        0,
        131088,
        2,
        0,
        2,
        131088
      ]))
    ], true);
    assert.strictEqual(model.getWordAtPosition(new Position(2, 1)), null);
    disposables.dispose();
  });
  test("partial tokens 1", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(new Range(1, 1, 31, 2), [
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1,
        5,
        5,
        10,
        2,
        10,
        5,
        10,
        3,
        15,
        5,
        10,
        4,
        20,
        5,
        10,
        5,
        25,
        5,
        10,
        6
      ]))
    ]);
    store.setPartial(new Range(18, 1, 42, 1), [
      SparseMultilineTokens.create(20, new Uint32Array([
        0,
        5,
        10,
        4,
        5,
        5,
        10,
        5,
        10,
        5,
        10,
        6,
        15,
        5,
        10,
        7,
        20,
        5,
        10,
        8
      ]))
    ]);
    store.setPartial(new Range(1, 1, 31, 2), [
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1,
        5,
        5,
        10,
        2,
        10,
        5,
        10,
        3,
        15,
        5,
        10,
        4,
        20,
        5,
        10,
        5,
        25,
        5,
        10,
        6
      ]))
    ]);
    const lineTokens = store.addSparseTokens(10, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
    assert.strictEqual(lineTokens.getCount(), 3);
  });
  test("partial tokens 2", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(new Range(1, 1, 31, 2), [
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1,
        5,
        5,
        10,
        2,
        10,
        5,
        10,
        3,
        15,
        5,
        10,
        4,
        20,
        5,
        10,
        5,
        25,
        5,
        10,
        6
      ]))
    ]);
    store.setPartial(new Range(6, 1, 36, 2), [
      SparseMultilineTokens.create(10, new Uint32Array([
        0,
        5,
        10,
        2,
        5,
        5,
        10,
        3,
        10,
        5,
        10,
        4,
        15,
        5,
        10,
        5,
        20,
        5,
        10,
        6
      ]))
    ]);
    store.setPartial(new Range(17, 1, 42, 1), [
      SparseMultilineTokens.create(20, new Uint32Array([
        0,
        5,
        10,
        4,
        5,
        5,
        10,
        5,
        10,
        5,
        10,
        6,
        15,
        5,
        10,
        7,
        20,
        5,
        10,
        8
      ]))
    ]);
    const lineTokens = store.addSparseTokens(20, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
    assert.strictEqual(lineTokens.getCount(), 3);
  });
  test("partial tokens 3", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(new Range(1, 1, 31, 2), [
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1,
        5,
        5,
        10,
        2,
        10,
        5,
        10,
        3,
        15,
        5,
        10,
        4,
        20,
        5,
        10,
        5,
        25,
        5,
        10,
        6
      ]))
    ]);
    store.setPartial(new Range(11, 1, 16, 2), [
      SparseMultilineTokens.create(10, new Uint32Array([
        0,
        5,
        10,
        3,
        5,
        5,
        10,
        4
      ]))
    ]);
    const lineTokens = store.addSparseTokens(5, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
    assert.strictEqual(lineTokens.getCount(), 3);
  });
  test("issue #94133: Semantic colors stick around when using (only) range provider", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(new Range(1, 1, 1, 20), [
      SparseMultilineTokens.create(1, new Uint32Array([
        0,
        9,
        11,
        1
      ]))
    ]);
    store.setPartial(new Range(1, 1, 1, 20), []);
    const lineTokens = store.addSparseTokens(1, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
    assert.strictEqual(lineTokens.getCount(), 1);
  });
  test("bug", () => {
    function createTokens(str) {
      str = str.replace(/^\[\(/, "");
      str = str.replace(/\)\]$/, "");
      const strTokens = str.split("),(");
      const result = [];
      let firstLineNumber = 0;
      for (const strToken of strTokens) {
        const pieces = strToken.split(",");
        const chars = pieces[1].split("-");
        const lineNumber = parseInt(pieces[0], 10);
        const startChar = parseInt(chars[0], 10);
        const endChar = parseInt(chars[1], 10);
        if (firstLineNumber === 0) {
          firstLineNumber = lineNumber;
        }
        result.push(lineNumber - firstLineNumber, startChar, endChar, (lineNumber + startChar) % 13);
      }
      return SparseMultilineTokens.create(firstLineNumber, new Uint32Array(result));
    }
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(
      new Range(36446, 1, 36475, 115),
      [createTokens("[(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62)]")]
    );
    store.setPartial(
      new Range(36436, 1, 36464, 142),
      [createTokens("[(36437,33-37),(36437,38-42),(36437,47-57),(36437,58-67),(36438,35-53),(36438,54-62),(36440,24-29),(36440,33-46),(36440,47-53),(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62)]")]
    );
    store.setPartial(
      new Range(36457, 1, 36485, 140),
      [createTokens("[(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62),(36477,28-32),(36477,33-37),(36477,42-52),(36477,53-69),(36478,32-36),(36478,37-41),(36478,46-56),(36478,57-74),(36479,32-36),(36479,37-41),(36479,46-56),(36479,57-76),(36480,32-36),(36480,37-41),(36480,46-56),(36480,57-68),(36481,32-36),(36481,37-41),(36481,46-56),(36481,57-68),(36482,39-57),(36482,58-66),(36484,34-38),(36484,39-45),(36484,46-50),(36484,55-65),(36484,66-82),(36484,86-97),(36484,98-102),(36484,103-109),(36484,111-124),(36484,125-133),(36485,39-57),(36485,58-66)]")]
    );
    store.setPartial(
      new Range(36441, 1, 36469, 56),
      [createTokens("[(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35)]")]
    );
    const lineTokens = store.addSparseTokens(36451, new LineTokens(new Uint32Array([60, 1]), `                        if (flags & ModifierFlags.Ambient) {`, codec));
    assert.strictEqual(lineTokens.getCount(), 7);
  });
  test("issue #95949: Identifiers are colored in bold when targetting keywords", () => {
    function createTMMetadata(foreground, fontStyle, languageId) {
      return (languageId << MetadataConsts.LANGUAGEID_OFFSET | fontStyle << MetadataConsts.FONT_STYLE_OFFSET | foreground << MetadataConsts.FOREGROUND_OFFSET) >>> 0;
    }
    function toArr(lineTokens2) {
      const r = [];
      for (let i = 0; i < lineTokens2.getCount(); i++) {
        r.push(lineTokens2.getEndOffset(i));
        r.push(lineTokens2.getMetadata(i));
      }
      return r;
    }
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.set([
      SparseMultilineTokens.create(1, new Uint32Array([
        0,
        6,
        11,
        1 << MetadataConsts.FOREGROUND_OFFSET | MetadataConsts.SEMANTIC_USE_FOREGROUND
      ]))
    ], true);
    const lineTokens = store.addSparseTokens(1, new LineTokens(new Uint32Array([
      5,
      createTMMetadata(5, FontStyle.Bold, 53),
      14,
      createTMMetadata(1, FontStyle.None, 53),
      17,
      createTMMetadata(6, FontStyle.None, 53),
      18,
      createTMMetadata(1, FontStyle.None, 53)
    ]), `const hello = 123;`, codec));
    const actual = toArr(lineTokens);
    assert.deepStrictEqual(actual, [
      5,
      createTMMetadata(5, FontStyle.Bold, 53),
      6,
      createTMMetadata(1, FontStyle.None, 53),
      11,
      createTMMetadata(1, FontStyle.None, 53),
      14,
      createTMMetadata(1, FontStyle.None, 53),
      17,
      createTMMetadata(6, FontStyle.None, 53),
      18,
      createTMMetadata(1, FontStyle.None, 53)
    ]);
  });
  test("BUG: setPartial with startLineNumber > 1 and token removal creates invalid state", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.set([
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1
        // line 5, chars 5-10
      ]))
    ], false);
    assert.strictEqual(store.isEmpty(), false);
    store.setPartial(new Range(5, 1, 5, 20), []);
    assert.strictEqual(
      store.isEmpty(),
      true,
      "Store should be empty after setPartial removes all tokens"
    );
  });
  test("BUG: setPartial with split that creates empty first piece with invalid line numbers", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.set([
      SparseMultilineTokens.create(1, new Uint32Array([
        10,
        5,
        10,
        1
        // line 11 (deltaLine=10 from startLineNumber=1), chars 5-10
      ]))
    ], false);
    store.setPartial(new Range(1, 1, 5, 1), []);
    assert.strictEqual(store.isEmpty(), false, "Store should still have the token on line 11");
    const lineTokens = store.addSparseTokens(11, new LineTokens(new Uint32Array([22, 1]), `    test line text    `, codec));
    assert.strictEqual(lineTokens.getCount(), 3, "Should have 3 tokens: base token start + semantic token from line 11 + base token end");
    assert.strictEqual(lineTokens.getStartOffset(1), 5, "Semantic token should start at offset 5");
    assert.strictEqual(lineTokens.getEndOffset(1), 10, "Semantic token should end at offset 10");
  });
  test("addSparseTokens skips overlapping semantic tokens that produce backward endOffsets", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    const semanticMeta1 = 1 << MetadataConsts.FOREGROUND_OFFSET | MetadataConsts.SEMANTIC_USE_FOREGROUND;
    const semanticMeta2 = 2 << MetadataConsts.FOREGROUND_OFFSET | MetadataConsts.SEMANTIC_USE_FOREGROUND;
    store.set([
      SparseMultilineTokens.create(1, new Uint32Array([
        // deltaLine, startChar, endChar, metadata
        0,
        0,
        1,
        semanticMeta1,
        // 'f' at (0,1)
        0,
        1,
        2,
        semanticMeta2,
        // '=' at (1,2)
        0,
        2,
        3,
        semanticMeta1,
        // '1' at (2,3)
        0,
        3,
        5,
        semanticMeta2,
        // '+a' at (3,5) - expanded after edit
        0,
        4,
        5,
        semanticMeta1
        // overlapping: 'a' at (4,5) - stale position
      ]))
    ], true);
    const tmMeta = 3 << MetadataConsts.FOREGROUND_OFFSET >>> 0;
    const lineTokens = store.addSparseTokens(1, new LineTokens(new Uint32Array([
      6,
      tmMeta
      // entire line "f=1+a2" covered by one TM token
    ]), `f=1+a2`, codec));
    const endOffsets = [];
    for (let i = 0; i < lineTokens.getCount(); i++) {
      endOffsets.push(lineTokens.getEndOffset(i));
    }
    for (let i = 1; i < endOffsets.length; i++) {
      assert.ok(
        endOffsets[i] > endOffsets[i - 1],
        `endOffset[${i}]=${endOffsets[i]} should be > endOffset[${i - 1}]=${endOffsets[i - 1]}`
      );
    }
    const withInjected = lineTokens.withInserted([{ offset: 0, text: "  ", tokenMetadata: LineTokens.defaultTokenMetadata }]);
    assert.strictEqual(
      withInjected.getLineContent(),
      "  f=1+a2",
      "withInserted must not duplicate characters when semantic tokens overlap"
    );
  });
  test("piece with startLineNumber 0 and endLineNumber -1 after encompassing deletion", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    const piece = SparseMultilineTokens.create(5, new Uint32Array([
      0,
      0,
      5,
      1,
      // line 5, chars 0-5
      5,
      0,
      5,
      2
      // line 10, chars 0-5
    ]));
    store.set([piece], false);
    assert.strictEqual(piece.startLineNumber, 5);
    assert.strictEqual(piece.endLineNumber, 10);
    assert.strictEqual(piece.isEmpty(), false);
    store.acceptEdit(
      { startLineNumber: 1, startColumn: 1, endLineNumber: 20, endColumn: 1 },
      0,
      // eolCount - no new lines inserted
      0,
      // firstLineLength
      0,
      // lastLineLength
      0
      // firstCharCode
    );
    assert.strictEqual(piece.isEmpty(), true, "Piece should be empty after encompassing deletion");
    assert.strictEqual(store.isEmpty(), true, "Store should be empty after all tokens are deleted by encompassing edit");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC90b2tlbnNTdG9yZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDb2xvcklkLCBGb250U3R5bGUsIE1ldGFkYXRhQ29uc3RzLCBUb2tlbk1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VJZENvZGVjIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExpbmVUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgU3BhcnNlTXVsdGlsaW5lVG9rZW5zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rva2Vucy9zcGFyc2VNdWx0aWxpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgU3BhcnNlVG9rZW5zU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9rZW5zL3NwYXJzZVRva2Vuc1N0b3JlLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vZGVsU2VydmljZXMsIGNyZWF0ZVRleHRNb2RlbCwgaW5zdGFudGlhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi90ZXN0VGV4dE1vZGVsLmpzJztcblxuc3VpdGUoJ1Rva2Vuc1N0b3JlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IFNFTUFOVElDX0NPTE9SID0gNSBhcyBDb2xvcklkO1xuXG5cdGZ1bmN0aW9uIHBhcnNlVG9rZW5zU3RhdGUoc3RhdGU6IHN0cmluZ1tdKTogeyB0ZXh0OiBzdHJpbmc7IHRva2VuczogU3BhcnNlTXVsdGlsaW5lVG9rZW5zIH0ge1xuXHRcdGNvbnN0IHRleHQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgdG9rZW5zOiBudW1iZXJbXSA9IFtdO1xuXHRcdGxldCBiYXNlTGluZSA9IDE7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0ZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IHN0YXRlW2ldO1xuXG5cdFx0XHRsZXQgc3RhcnRPZmZzZXQgPSAwO1xuXHRcdFx0bGV0IGxpbmVUZXh0ID0gJyc7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCBmaXJzdFBpcGVPZmZzZXQgPSBsaW5lLmluZGV4T2YoJ3wnLCBzdGFydE9mZnNldCk7XG5cdFx0XHRcdGlmIChmaXJzdFBpcGVPZmZzZXQgPT09IC0xKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2Vjb25kUGlwZU9mZnNldCA9IGxpbmUuaW5kZXhPZignfCcsIGZpcnN0UGlwZU9mZnNldCArIDEpO1xuXHRcdFx0XHRpZiAoc2Vjb25kUGlwZU9mZnNldCA9PT0gLTEpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZmlyc3RQaXBlT2Zmc2V0ICsgMSA9PT0gc2Vjb25kUGlwZU9mZnNldCkge1xuXHRcdFx0XHRcdC8vIHNraXAgfHxcblx0XHRcdFx0XHRsaW5lVGV4dCArPSBsaW5lLnN1YnN0cmluZyhzdGFydE9mZnNldCwgc2Vjb25kUGlwZU9mZnNldCArIDEpO1xuXHRcdFx0XHRcdHN0YXJ0T2Zmc2V0ID0gc2Vjb25kUGlwZU9mZnNldCArIDE7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsaW5lVGV4dCArPSBsaW5lLnN1YnN0cmluZyhzdGFydE9mZnNldCwgZmlyc3RQaXBlT2Zmc2V0KTtcblx0XHRcdFx0Y29uc3QgdG9rZW5TdGFydENoYXJhY3RlciA9IGxpbmVUZXh0Lmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgdG9rZW5MZW5ndGggPSBzZWNvbmRQaXBlT2Zmc2V0IC0gZmlyc3RQaXBlT2Zmc2V0IC0gMTtcblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSAoXG5cdFx0XHRcdFx0U0VNQU5USUNfQ09MT1IgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVRcblx0XHRcdFx0XHR8IE1ldGFkYXRhQ29uc3RzLlNFTUFOVElDX1VTRV9GT1JFR1JPVU5EXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0aWYgKHRva2Vucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRiYXNlTGluZSA9IGkgKyAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRva2Vucy5wdXNoKGkgKyAxIC0gYmFzZUxpbmUsIHRva2VuU3RhcnRDaGFyYWN0ZXIsIHRva2VuU3RhcnRDaGFyYWN0ZXIgKyB0b2tlbkxlbmd0aCwgbWV0YWRhdGEpO1xuXG5cdFx0XHRcdGxpbmVUZXh0ICs9IGxpbmUuc3Vic3RyKGZpcnN0UGlwZU9mZnNldCArIDEsIHRva2VuTGVuZ3RoKTtcblx0XHRcdFx0c3RhcnRPZmZzZXQgPSBzZWNvbmRQaXBlT2Zmc2V0ICsgMTtcblx0XHRcdH1cblxuXHRcdFx0bGluZVRleHQgKz0gbGluZS5zdWJzdHJpbmcoc3RhcnRPZmZzZXQpO1xuXG5cdFx0XHR0ZXh0LnB1c2gobGluZVRleHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0ZXh0OiB0ZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0dG9rZW5zOiBTcGFyc2VNdWx0aWxpbmVUb2tlbnMuY3JlYXRlKGJhc2VMaW5lLCBuZXcgVWludDMyQXJyYXkodG9rZW5zKSlcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZXh0cmFjdFN0YXRlKG1vZGVsOiBUZXh0TW9kZWwpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSAxOyBsaW5lTnVtYmVyIDw9IG1vZGVsLmdldExpbmVDb3VudCgpOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cblx0XHRcdGxldCBsaW5lVGV4dCA9ICcnO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lVG9rZW5zLmdldENvdW50KCk7IGkrKykge1xuXHRcdFx0XHRjb25zdCB0b2tlblN0YXJ0Q2hhcmFjdGVyID0gbGluZVRva2Vucy5nZXRTdGFydE9mZnNldChpKTtcblx0XHRcdFx0Y29uc3QgdG9rZW5FbmRDaGFyYWN0ZXIgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldChpKTtcblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBsaW5lVG9rZW5zLmdldE1ldGFkYXRhKGkpO1xuXHRcdFx0XHRjb25zdCBjb2xvciA9IFRva2VuTWV0YWRhdGEuZ2V0Rm9yZWdyb3VuZChtZXRhZGF0YSk7XG5cdFx0XHRcdGNvbnN0IHRva2VuVGV4dCA9IGxpbmVDb250ZW50LnN1YnN0cmluZyh0b2tlblN0YXJ0Q2hhcmFjdGVyLCB0b2tlbkVuZENoYXJhY3Rlcik7XG5cdFx0XHRcdGlmIChjb2xvciA9PT0gU0VNQU5USUNfQ09MT1IpIHtcblx0XHRcdFx0XHRsaW5lVGV4dCArPSBgfCR7dG9rZW5UZXh0fXxgO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxpbmVUZXh0ICs9IHRva2VuVGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQucHVzaChsaW5lVGV4dCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRmdW5jdGlvbiB0ZXN0VG9rZW5zQWRqdXN0bWVudChyYXdJbml0aWFsU3RhdGU6IHN0cmluZ1tdLCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSwgcmF3RmluYWxTdGF0ZTogc3RyaW5nW10pIHtcblx0XHRjb25zdCBpbml0aWFsU3RhdGUgPSBwYXJzZVRva2Vuc1N0YXRlKHJhd0luaXRpYWxTdGF0ZSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoaW5pdGlhbFN0YXRlLnRleHQpO1xuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5zZXRTZW1hbnRpY1Rva2VucyhbaW5pdGlhbFN0YXRlLnRva2Vuc10sIHRydWUpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhlZGl0cyk7XG5cblx0XHRjb25zdCBhY3R1YWxTdGF0ZSA9IGV4dHJhY3RTdGF0ZShtb2RlbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxTdGF0ZSwgcmF3RmluYWxTdGF0ZSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH1cblxuXHR0ZXN0KCdpc3N1ZSAjODYzMDMgLSBjb2xvciBzaGlmdGluZyBiZXR3ZWVuIGRpZmZlcmVudCB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0dGVzdFRva2Vuc0FkanVzdG1lbnQoXG5cdFx0XHRbXG5cdFx0XHRcdGBpbXBvcnQgeyB8VVJJfCB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL3VyaSc7YCxcblx0XHRcdFx0YGNvbnN0IGZvbyA9IHxVUkl8LnBhcnNlKCdoZXknKTtgXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgOSwgMiwgMTApLCB0ZXh0OiAnJyB9XG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRgaW1wb3J0IHsgfFVSSXwgfSBmcm9tICd2cy9iYXNlL2NvbW1vbi91cmknO2AsXG5cdFx0XHRcdGBjb25zdCBmbyA9IHxVUkl8LnBhcnNlKCdoZXknKTtgXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRpbmcgYSBuZXdsaW5lJywgKCkgPT4ge1xuXHRcdHRlc3RUb2tlbnNBZGp1c3RtZW50KFxuXHRcdFx0W1xuXHRcdFx0XHRgaW1wb3J0IHsgfFVSSXwgfSBmcm9tICd2cy9iYXNlL2NvbW1vbi91cmknO2AsXG5cdFx0XHRcdGBjb25zdCBmb28gPSB8VVJJfC5wYXJzZSgnaGV5Jyk7YFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDQyLCAyLCAxKSwgdGV4dDogJycgfVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0YGltcG9ydCB7IHxVUkl8IH0gZnJvbSAndnMvYmFzZS9jb21tb24vdXJpJztjb25zdCBmb28gPSB8VVJJfC5wYXJzZSgnaGV5Jyk7YFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydGluZyBhIG5ld2xpbmUnLCAoKSA9PiB7XG5cdFx0dGVzdFRva2Vuc0FkanVzdG1lbnQoXG5cdFx0XHRbXG5cdFx0XHRcdGBpbXBvcnQgeyB8VVJJfCB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL3VyaSc7Y29uc3QgZm9vID0gfFVSSXwucGFyc2UoJ2hleScpO2Bcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCA0MiwgMSwgNDIpLCB0ZXh0OiAnXFxuJyB9XG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRgaW1wb3J0IHsgfFVSSXwgfSBmcm9tICd2cy9iYXNlL2NvbW1vbi91cmknO2AsXG5cdFx0XHRcdGBjb25zdCBmb28gPSB8VVJJfC5wYXJzZSgnaGV5Jyk7YFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0aW5nIGEgbmV3bGluZSAyJywgKCkgPT4ge1xuXHRcdHRlc3RUb2tlbnNBZGp1c3RtZW50KFxuXHRcdFx0W1xuXHRcdFx0XHRgaW1wb3J0IHsgYCxcblx0XHRcdFx0YCAgICB8VVJJfCB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL3VyaSc7Y29uc3QgZm9vID0gfFVSSXwucGFyc2UoJ2hleScpO2Bcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMCwgMiwgNSksIHRleHQ6ICcnIH1cblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGBpbXBvcnQgeyB8VVJJfCB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL3VyaSc7Y29uc3QgZm9vID0gfFVSSXwucGFyc2UoJ2hleScpO2Bcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTc5MjY4OiBhIGNvbXBsZXggZWRpdCcsICgpID0+IHtcblx0XHR0ZXN0VG9rZW5zQWRqdXN0bWVudChcblx0XHRcdFtcblx0XHRcdFx0YHxleHBvcnR8IHwnaW50ZXJpb3JfbWF0ZXJpYWxfc2VsZWN0b3IuZGFydCd8O2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J21pbGVhZ2Vfc2VsZWN0b3IuZGFydCd8O2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J293bmVyc19zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwncHJpY2Vfc2VsZWN0b3IuZGFydCd8O2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J3NlYXRfY291bnRfc2VsZWN0b3IuZGFydCd8O2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J3llYXJfc2VsZWN0b3IuZGFydCd8O2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J3dpbnRlcl9vcHRpb25zX3NlbGVjdG9yLmRhcnQnfDt8ZXhwb3J0fCB8J2NhbWVyYV9zZWxlY3Rvci5kYXJ0J3w7YFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDksIDEsIDkpLCB0ZXh0OiBgY2FtZXJhX3NlbGVjdG9yLmRhcnQnO1xcbmV4cG9ydCAnYCB9LFxuXHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNiwgOSwgNywgOSksIHRleHQ6IGBgIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg3LCAzOSwgNywgMzkpLCB0ZXh0OiBgXFxuYCB9LFxuXHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNywgNDcsIDcsIDQ4KSwgdGV4dDogYHllYCB9LFxuXHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNywgNDksIDcsIDUxKSwgdGV4dDogYGAgfSxcblx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDcsIDUyLCA3LCA1MyksIHRleHQ6IGBgIH0sXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRgfGV4cG9ydHwgfCd8Y2FtZXJhX3NlbGVjdG9yLmRhcnQnO2AsXG5cdFx0XHRcdGBleHBvcnQgJ2ludGVyaW9yX21hdGVyaWFsX3NlbGVjdG9yLmRhcnQnO2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J21pbGVhZ2Vfc2VsZWN0b3IuZGFydCd8O2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J293bmVyc19zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwncHJpY2Vfc2VsZWN0b3IuZGFydCd8O2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J3NlYXRfY291bnRfc2VsZWN0b3IuZGFydCd8O2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J3x8d2ludGVyX29wdGlvbnNfc2VsZWN0b3IuZGFydCd8O2AsXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J3llYXJfc2VsZWN0b3IuZGFydCd8O2Bcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTE5MzY6IFNlbWFudGljIHRva2VuIGNvbG9yIGhpZ2hsaWdodGluZyBmYWlscyBvbiBsaW5lIHdpdGggc2VsZWN0ZWQgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICgkcyA9IDA4KSB0aGVuIFxcJ1xcXFxiXFwnJyk7XG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLnNldFNlbWFudGljVG9rZW5zKFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoMSwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0MCwgMjAsIDI0LCAwYjAxMTExMDAwMDAwMDAwMDEwMDAwLFxuXHRcdFx0XHQwLCAyNSwgMjcsIDBiMDExMTEwMDAwMDAwMDAwMTAwMDAsXG5cdFx0XHRcdDAsIDI4LCAyOSwgMGIwMDAwMTAwMDAwMDAwMDAxMDAwMCxcblx0XHRcdFx0MCwgMjksIDMxLCAwYjEwMDAwMDAwMDAwMDAwMDEwMDAwLFxuXHRcdFx0XHQwLCAzMiwgMzMsIDBiMDAwMDEwMDAwMDAwMDAwMTAwMDAsXG5cdFx0XHRcdDAsIDM0LCAzNiwgMGIwMDExMDAwMDAwMDAwMDAxMDAwMCxcblx0XHRcdFx0MCwgMzYsIDM3LCAwYjAwMDAxMDAwMDAwMDAwMDEwMDAwLFxuXHRcdFx0XHQwLCAzOCwgNDIsIDBiMDExMTEwMDAwMDAwMDAwMTAwMDAsXG5cdFx0XHRcdDAsIDQzLCA0NywgMGIwMTAxMTAwMDAwMDAwMDAxMDAwMCxcblx0XHRcdF0pKVxuXHRcdF0sIHRydWUpO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucygxKTtcblx0XHRjb25zdCBkZWNvZGVkVG9rZW5zOiBudW1iZXJbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lVG9rZW5zLmdldENvdW50KCk7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0ZGVjb2RlZFRva2Vucy5wdXNoKGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KGkpLCBsaW5lVG9rZW5zLmdldE1ldGFkYXRhKGkpKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlY29kZWRUb2tlbnMsIFtcblx0XHRcdDIwLCAwYjEwMDAwMDAwMDAxMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0MjQsIDBiMTAwMDAwMDExMTEwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQyNSwgMGIxMDAwMDAwMDAwMTAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDI3LCAwYjEwMDAwMDAxMTExMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0MjgsIDBiMTAwMDAwMDAwMDEwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQyOSwgMGIxMDAwMDAwMDAwMTAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDMxLCAwYjEwMDAwMDEwMDAwMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0MzIsIDBiMTAwMDAwMDAwMDEwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQzMywgMGIxMDAwMDAwMDAwMTAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDM0LCAwYjEwMDAwMDAwMDAxMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0MzYsIDBiMTAwMDAwMDAxMTAwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQzNywgMGIxMDAwMDAwMDAwMTAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDM4LCAwYjEwMDAwMDAwMDAxMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0NDIsIDBiMTAwMDAwMDExMTEwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQ0MywgMGIxMDAwMDAwMDAwMTAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDQ3LCAwYjEwMDAwMDAxMDExMDAwMDEwMDAwMDAwMDAxXG5cdFx0XSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNDc5NDQ6IExhbmd1YWdlIGlkIFwidnMuZWRpdG9yLm51bGxMYW5ndWFnZVwiIGlzIG5vdCBjb25maWd1cmVkIG5vciBrbm93bicsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZU1vZGVsU2VydmljZXMoZGlzcG9zYWJsZXMsIFtcblx0XHRcdFtJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZV1cblx0XHRdKTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJy0tW1tcXG5cXG5dXScpKTtcblx0XHRtb2RlbC50b2tlbml6YXRpb24uc2V0U2VtYW50aWNUb2tlbnMoW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSgxLCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCAyLCA0LCAwYjEwMDAwMDAwMDAwMDAxMDAwMCxcblx0XHRcdFx0MSwgMCwgMCwgMGIxMDAwMDAwMDAwMDAwMTAwMDAsXG5cdFx0XHRcdDIsIDAsIDIsIDBiMTAwMDAwMDAwMDAwMDEwMDAwLFxuXHRcdFx0XSkpXG5cdFx0XSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAxKSksIG51bGwpO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncGFydGlhbCB0b2tlbnMgMScsICgpID0+IHtcblx0XHRjb25zdCBjb2RlYyA9IG5ldyBMYW5ndWFnZUlkQ29kZWMoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBTcGFyc2VUb2tlbnNTdG9yZShjb2RlYyk7XG5cblx0XHQvLyBzZXRQYXJ0aWFsOiBbMSwxIC0+IDMxLDJdLCBbKDUsNS0xMCksKDEwLDUtMTApLCgxNSw1LTEwKSwoMjAsNS0xMCksKDI1LDUtMTApLCgzMCw1LTEwKV1cblx0XHRzdG9yZS5zZXRQYXJ0aWFsKG5ldyBSYW5nZSgxLCAxLCAzMSwgMiksIFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoNSwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0MCwgNSwgMTAsIDEsXG5cdFx0XHRcdDUsIDUsIDEwLCAyLFxuXHRcdFx0XHQxMCwgNSwgMTAsIDMsXG5cdFx0XHRcdDE1LCA1LCAxMCwgNCxcblx0XHRcdFx0MjAsIDUsIDEwLCA1LFxuXHRcdFx0XHQyNSwgNSwgMTAsIDYsXG5cdFx0XHRdKSlcblx0XHRdKTtcblxuXHRcdC8vIHNldFBhcnRpYWw6IFsxOCwxIC0+IDQyLDFdLCBbKDIwLDUtMTApLCgyNSw1LTEwKSwoMzAsNS0xMCksKDM1LDUtMTApLCg0MCw1LTEwKV1cblx0XHRzdG9yZS5zZXRQYXJ0aWFsKG5ldyBSYW5nZSgxOCwgMSwgNDIsIDEpLCBbXG5cdFx0XHRTcGFyc2VNdWx0aWxpbmVUb2tlbnMuY3JlYXRlKDIwLCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCA1LCAxMCwgNCxcblx0XHRcdFx0NSwgNSwgMTAsIDUsXG5cdFx0XHRcdDEwLCA1LCAxMCwgNixcblx0XHRcdFx0MTUsIDUsIDEwLCA3LFxuXHRcdFx0XHQyMCwgNSwgMTAsIDgsXG5cdFx0XHRdKSlcblx0XHRdKTtcblxuXHRcdC8vIHNldFBhcnRpYWw6IFsxLDEgLT4gMzEsMl0sIFsoNSw1LTEwKSwoMTAsNS0xMCksKDE1LDUtMTApLCgyMCw1LTEwKSwoMjUsNS0xMCksKDMwLDUtMTApXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDEsIDEsIDMxLCAyKSwgW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSg1LCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCA1LCAxMCwgMSxcblx0XHRcdFx0NSwgNSwgMTAsIDIsXG5cdFx0XHRcdDEwLCA1LCAxMCwgMyxcblx0XHRcdFx0MTUsIDUsIDEwLCA0LFxuXHRcdFx0XHQyMCwgNSwgMTAsIDUsXG5cdFx0XHRcdDI1LCA1LCAxMCwgNixcblx0XHRcdF0pKVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbGluZVRva2VucyA9IHN0b3JlLmFkZFNwYXJzZVRva2VucygxMCwgbmV3IExpbmVUb2tlbnMobmV3IFVpbnQzMkFycmF5KFsxMiwgMV0pLCBgZW51bSBFbnVtMSB7YCwgY29kZWMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZVRva2Vucy5nZXRDb3VudCgpLCAzKTtcblx0fSk7XG5cblx0dGVzdCgncGFydGlhbCB0b2tlbnMgMicsICgpID0+IHtcblx0XHRjb25zdCBjb2RlYyA9IG5ldyBMYW5ndWFnZUlkQ29kZWMoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBTcGFyc2VUb2tlbnNTdG9yZShjb2RlYyk7XG5cblx0XHQvLyBzZXRQYXJ0aWFsOiBbMSwxIC0+IDMxLDJdLCBbKDUsNS0xMCksKDEwLDUtMTApLCgxNSw1LTEwKSwoMjAsNS0xMCksKDI1LDUtMTApLCgzMCw1LTEwKV1cblx0XHRzdG9yZS5zZXRQYXJ0aWFsKG5ldyBSYW5nZSgxLCAxLCAzMSwgMiksIFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoNSwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0MCwgNSwgMTAsIDEsXG5cdFx0XHRcdDUsIDUsIDEwLCAyLFxuXHRcdFx0XHQxMCwgNSwgMTAsIDMsXG5cdFx0XHRcdDE1LCA1LCAxMCwgNCxcblx0XHRcdFx0MjAsIDUsIDEwLCA1LFxuXHRcdFx0XHQyNSwgNSwgMTAsIDYsXG5cdFx0XHRdKSlcblx0XHRdKTtcblxuXHRcdC8vIHNldFBhcnRpYWw6IFs2LDEgLT4gMzYsMl0sIFsoMTAsNS0xMCksKDE1LDUtMTApLCgyMCw1LTEwKSwoMjUsNS0xMCksKDMwLDUtMTApLCgzNSw1LTEwKV1cblx0XHRzdG9yZS5zZXRQYXJ0aWFsKG5ldyBSYW5nZSg2LCAxLCAzNiwgMiksIFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoMTAsIG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdDAsIDUsIDEwLCAyLFxuXHRcdFx0XHQ1LCA1LCAxMCwgMyxcblx0XHRcdFx0MTAsIDUsIDEwLCA0LFxuXHRcdFx0XHQxNSwgNSwgMTAsIDUsXG5cdFx0XHRcdDIwLCA1LCAxMCwgNixcblx0XHRcdF0pKVxuXHRcdF0pO1xuXG5cdFx0Ly8gc2V0UGFydGlhbDogWzE3LDEgLT4gNDIsMV0sIFsoMjAsNS0xMCksKDI1LDUtMTApLCgzMCw1LTEwKSwoMzUsNS0xMCksKDQwLDUtMTApXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDE3LCAxLCA0MiwgMSksIFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoMjAsIG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdDAsIDUsIDEwLCA0LFxuXHRcdFx0XHQ1LCA1LCAxMCwgNSxcblx0XHRcdFx0MTAsIDUsIDEwLCA2LFxuXHRcdFx0XHQxNSwgNSwgMTAsIDcsXG5cdFx0XHRcdDIwLCA1LCAxMCwgOCxcblx0XHRcdF0pKVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbGluZVRva2VucyA9IHN0b3JlLmFkZFNwYXJzZVRva2VucygyMCwgbmV3IExpbmVUb2tlbnMobmV3IFVpbnQzMkFycmF5KFsxMiwgMV0pLCBgZW51bSBFbnVtMSB7YCwgY29kZWMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZVRva2Vucy5nZXRDb3VudCgpLCAzKTtcblx0fSk7XG5cblx0dGVzdCgncGFydGlhbCB0b2tlbnMgMycsICgpID0+IHtcblx0XHRjb25zdCBjb2RlYyA9IG5ldyBMYW5ndWFnZUlkQ29kZWMoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBTcGFyc2VUb2tlbnNTdG9yZShjb2RlYyk7XG5cblx0XHQvLyBzZXRQYXJ0aWFsOiBbMSwxIC0+IDMxLDJdLCBbKDUsNS0xMCksKDEwLDUtMTApLCgxNSw1LTEwKSwoMjAsNS0xMCksKDI1LDUtMTApLCgzMCw1LTEwKV1cblx0XHRzdG9yZS5zZXRQYXJ0aWFsKG5ldyBSYW5nZSgxLCAxLCAzMSwgMiksIFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoNSwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0MCwgNSwgMTAsIDEsXG5cdFx0XHRcdDUsIDUsIDEwLCAyLFxuXHRcdFx0XHQxMCwgNSwgMTAsIDMsXG5cdFx0XHRcdDE1LCA1LCAxMCwgNCxcblx0XHRcdFx0MjAsIDUsIDEwLCA1LFxuXHRcdFx0XHQyNSwgNSwgMTAsIDYsXG5cdFx0XHRdKSlcblx0XHRdKTtcblxuXHRcdC8vIHNldFBhcnRpYWw6IFsxMSwxIC0+IDE2LDJdLCBbKDE1LDUtMTApLCgyMCw1LTEwKV1cblx0XHRzdG9yZS5zZXRQYXJ0aWFsKG5ldyBSYW5nZSgxMSwgMSwgMTYsIDIpLCBbXG5cdFx0XHRTcGFyc2VNdWx0aWxpbmVUb2tlbnMuY3JlYXRlKDEwLCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCA1LCAxMCwgMyxcblx0XHRcdFx0NSwgNSwgMTAsIDQsXG5cdFx0XHRdKSlcblx0XHRdKTtcblxuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBzdG9yZS5hZGRTcGFyc2VUb2tlbnMoNSwgbmV3IExpbmVUb2tlbnMobmV3IFVpbnQzMkFycmF5KFsxMiwgMV0pLCBgZW51bSBFbnVtMSB7YCwgY29kZWMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZVRva2Vucy5nZXRDb3VudCgpLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzk0MTMzOiBTZW1hbnRpYyBjb2xvcnMgc3RpY2sgYXJvdW5kIHdoZW4gdXNpbmcgKG9ubHkpIHJhbmdlIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvZGVjID0gbmV3IExhbmd1YWdlSWRDb2RlYygpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFNwYXJzZVRva2Vuc1N0b3JlKGNvZGVjKTtcblxuXHRcdC8vIHNldFBhcnRpYWw6IFsxLDEgLT4gMSwyMF0gWygxLDktMTEpXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDEsIDEsIDEsIDIwKSwgW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSgxLCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCA5LCAxMSwgMSxcblx0XHRcdF0pKVxuXHRcdF0pO1xuXG5cdFx0Ly8gc2V0UGFydGlhbDogWzEsMSAtPiAxLDIwXSwgW11cblx0XHRzdG9yZS5zZXRQYXJ0aWFsKG5ldyBSYW5nZSgxLCAxLCAxLCAyMCksIFtdKTtcblxuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBzdG9yZS5hZGRTcGFyc2VUb2tlbnMoMSwgbmV3IExpbmVUb2tlbnMobmV3IFVpbnQzMkFycmF5KFsxMiwgMV0pLCBgZW51bSBFbnVtMSB7YCwgY29kZWMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZVRva2Vucy5nZXRDb3VudCgpLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnYnVnJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZVRva2VucyhzdHI6IHN0cmluZyk6IFNwYXJzZU11bHRpbGluZVRva2VucyB7XG5cdFx0XHRzdHIgPSBzdHIucmVwbGFjZSgvXlxcW1xcKC8sICcnKTtcblx0XHRcdHN0ciA9IHN0ci5yZXBsYWNlKC9cXClcXF0kLywgJycpO1xuXHRcdFx0Y29uc3Qgc3RyVG9rZW5zID0gc3RyLnNwbGl0KCcpLCgnKTtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGxldCBmaXJzdExpbmVOdW1iZXIgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBzdHJUb2tlbiBvZiBzdHJUb2tlbnMpIHtcblx0XHRcdFx0Y29uc3QgcGllY2VzID0gc3RyVG9rZW4uc3BsaXQoJywnKTtcblx0XHRcdFx0Y29uc3QgY2hhcnMgPSBwaWVjZXNbMV0uc3BsaXQoJy0nKTtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHBhcnNlSW50KHBpZWNlc1swXSwgMTApO1xuXHRcdFx0XHRjb25zdCBzdGFydENoYXIgPSBwYXJzZUludChjaGFyc1swXSwgMTApO1xuXHRcdFx0XHRjb25zdCBlbmRDaGFyID0gcGFyc2VJbnQoY2hhcnNbMV0sIDEwKTtcblx0XHRcdFx0aWYgKGZpcnN0TGluZU51bWJlciA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIHRoaXMgaXMgdGhlIGZpcnN0IGxpbmVcblx0XHRcdFx0XHRmaXJzdExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGxpbmVOdW1iZXIgLSBmaXJzdExpbmVOdW1iZXIsIHN0YXJ0Q2hhciwgZW5kQ2hhciwgKGxpbmVOdW1iZXIgKyBzdGFydENoYXIpICUgMTMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoZmlyc3RMaW5lTnVtYmVyLCBuZXcgVWludDMyQXJyYXkocmVzdWx0KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kZWMgPSBuZXcgTGFuZ3VhZ2VJZENvZGVjKCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgU3BhcnNlVG9rZW5zU3RvcmUoY29kZWMpO1xuXHRcdC8vIHNldFBhcnRpYWwgWzM2NDQ2LDEgLT4gMzY0NzUsMTE1XSBbKDM2NDQ4LDI0LTI5KSwoMzY0NDgsMzMtNDYpLCgzNjQ0OCw0Ny01NCksKDM2NDUwLDI1LTM1KSwoMzY0NTAsMzYtNTApLCgzNjQ1MSwyOC0zMyksKDM2NDUxLDM2LTQ5KSwoMzY0NTEsNTAtNTcpLCgzNjQ1MiwzNS01MyksKDM2NDUyLDU0LTYyKSwoMzY0NTQsMzMtMzgpLCgzNjQ1NCw0MS01NCksKDM2NDU0LDU1LTYwKSwoMzY0NTUsMzUtNTMpLCgzNjQ1NSw1NC02MiksKDM2NDU3LDMzLTQ0KSwoMzY0NTcsNDUtNDkpLCgzNjQ1Nyw1MC01NiksKDM2NDU3LDYyLTgzKSwoMzY0NTcsODQtODgpLCgzNjQ1OCwzNS01MyksKDM2NDU4LDU0LTYyKSwoMzY0NjAsMzMtMzcpLCgzNjQ2MCwzOC00MiksKDM2NDYwLDQ3LTU3KSwoMzY0NjAsNTgtNjcpLCgzNjQ2MSwzNS01MyksKDM2NDYxLDU0LTYyKSwoMzY0NjMsMzQtMzgpLCgzNjQ2MywzOS00NSksKDM2NDYzLDQ2LTUxKSwoMzY0NjMsNTQtNjMpLCgzNjQ2Myw2NC03MSksKDM2NDYzLDc2LTgwKSwoMzY0NjMsODEtODcpLCgzNjQ2Myw4OC05MiksKDM2NDYzLDk3LTEwNyksKDM2NDYzLDEwOC0xMTkpLCgzNjQ2NCwzNS01MyksKDM2NDY0LDU0LTYyKSwoMzY0NjYsMzMtNzEpLCgzNjQ2Niw3Mi03NiksKDM2NDY3LDM1LTUzKSwoMzY0NjcsNTQtNjIpLCgzNjQ2OSwyNC0yOSksKDM2NDY5LDMzLTQ2KSwoMzY0NjksNDctNTQpLCgzNjQ3MCwyNC0zNSksKDM2NDcwLDM4LTQ2KSwoMzY0NzMsMjUtMzUpLCgzNjQ3MywzNi01MSksKDM2NDc0LDI4LTMzKSwoMzY0NzQsMzYtNDkpLCgzNjQ3NCw1MC01OCksKDM2NDc1LDM1LTUzKSwoMzY0NzUsNTQtNjIpXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwoXG5cdFx0XHRuZXcgUmFuZ2UoMzY0NDYsIDEsIDM2NDc1LCAxMTUpLFxuXHRcdFx0W2NyZWF0ZVRva2VucygnWygzNjQ0OCwyNC0yOSksKDM2NDQ4LDMzLTQ2KSwoMzY0NDgsNDctNTQpLCgzNjQ1MCwyNS0zNSksKDM2NDUwLDM2LTUwKSwoMzY0NTEsMjgtMzMpLCgzNjQ1MSwzNi00OSksKDM2NDUxLDUwLTU3KSwoMzY0NTIsMzUtNTMpLCgzNjQ1Miw1NC02MiksKDM2NDU0LDMzLTM4KSwoMzY0NTQsNDEtNTQpLCgzNjQ1NCw1NS02MCksKDM2NDU1LDM1LTUzKSwoMzY0NTUsNTQtNjIpLCgzNjQ1NywzMy00NCksKDM2NDU3LDQ1LTQ5KSwoMzY0NTcsNTAtNTYpLCgzNjQ1Nyw2Mi04MyksKDM2NDU3LDg0LTg4KSwoMzY0NTgsMzUtNTMpLCgzNjQ1OCw1NC02MiksKDM2NDYwLDMzLTM3KSwoMzY0NjAsMzgtNDIpLCgzNjQ2MCw0Ny01NyksKDM2NDYwLDU4LTY3KSwoMzY0NjEsMzUtNTMpLCgzNjQ2MSw1NC02MiksKDM2NDYzLDM0LTM4KSwoMzY0NjMsMzktNDUpLCgzNjQ2Myw0Ni01MSksKDM2NDYzLDU0LTYzKSwoMzY0NjMsNjQtNzEpLCgzNjQ2Myw3Ni04MCksKDM2NDYzLDgxLTg3KSwoMzY0NjMsODgtOTIpLCgzNjQ2Myw5Ny0xMDcpLCgzNjQ2MywxMDgtMTE5KSwoMzY0NjQsMzUtNTMpLCgzNjQ2NCw1NC02MiksKDM2NDY2LDMzLTcxKSwoMzY0NjYsNzItNzYpLCgzNjQ2NywzNS01MyksKDM2NDY3LDU0LTYyKSwoMzY0NjksMjQtMjkpLCgzNjQ2OSwzMy00NiksKDM2NDY5LDQ3LTU0KSwoMzY0NzAsMjQtMzUpLCgzNjQ3MCwzOC00NiksKDM2NDczLDI1LTM1KSwoMzY0NzMsMzYtNTEpLCgzNjQ3NCwyOC0zMyksKDM2NDc0LDM2LTQ5KSwoMzY0NzQsNTAtNTgpLCgzNjQ3NSwzNS01MyksKDM2NDc1LDU0LTYyKV0nKV1cblx0XHQpO1xuXHRcdC8vIHNldFBhcnRpYWwgWzM2NDM2LDEgLT4gMzY0NjQsMTQyXSBbKDM2NDM3LDMzLTM3KSwoMzY0MzcsMzgtNDIpLCgzNjQzNyw0Ny01NyksKDM2NDM3LDU4LTY3KSwoMzY0MzgsMzUtNTMpLCgzNjQzOCw1NC02MiksKDM2NDQwLDI0LTI5KSwoMzY0NDAsMzMtNDYpLCgzNjQ0MCw0Ny01MyksKDM2NDQyLDI1LTM1KSwoMzY0NDIsMzYtNTApLCgzNjQ0MywzMC0zOSksKDM2NDQzLDQyLTQ2KSwoMzY0NDMsNDctNTMpLCgzNjQ0Myw1NC01OCksKDM2NDQzLDYzLTczKSwoMzY0NDMsNzQtODQpLCgzNjQ0Myw4Ny05MSksKDM2NDQzLDkyLTk4KSwoMzY0NDMsMTAxLTEwNSksKDM2NDQzLDEwNi0xMTIpLCgzNjQ0MywxMTMtMTE5KSwoMzY0NDQsMjgtMzcpLCgzNjQ0NCwzOC00MiksKDM2NDQ0LDQ3LTU3KSwoMzY0NDQsNTgtNzUpLCgzNjQ0NCw4MC05NSksKDM2NDQ0LDk2LTEwNSksKDM2NDQ1LDM1LTUzKSwoMzY0NDUsNTQtNjIpLCgzNjQ0OCwyNC0yOSksKDM2NDQ4LDMzLTQ2KSwoMzY0NDgsNDctNTQpLCgzNjQ1MCwyNS0zNSksKDM2NDUwLDM2LTUwKSwoMzY0NTEsMjgtMzMpLCgzNjQ1MSwzNi00OSksKDM2NDUxLDUwLTU3KSwoMzY0NTIsMzUtNTMpLCgzNjQ1Miw1NC02MiksKDM2NDU0LDMzLTM4KSwoMzY0NTQsNDEtNTQpLCgzNjQ1NCw1NS02MCksKDM2NDU1LDM1LTUzKSwoMzY0NTUsNTQtNjIpLCgzNjQ1NywzMy00NCksKDM2NDU3LDQ1LTQ5KSwoMzY0NTcsNTAtNTYpLCgzNjQ1Nyw2Mi04MyksKDM2NDU3LDg0LTg4KSwoMzY0NTgsMzUtNTMpLCgzNjQ1OCw1NC02MiksKDM2NDYwLDMzLTM3KSwoMzY0NjAsMzgtNDIpLCgzNjQ2MCw0Ny01NyksKDM2NDYwLDU4LTY3KSwoMzY0NjEsMzUtNTMpLCgzNjQ2MSw1NC02MiksKDM2NDYzLDM0LTM4KSwoMzY0NjMsMzktNDUpLCgzNjQ2Myw0Ni01MSksKDM2NDYzLDU0LTYzKSwoMzY0NjMsNjQtNzEpLCgzNjQ2Myw3Ni04MCksKDM2NDYzLDgxLTg3KSwoMzY0NjMsODgtOTIpLCgzNjQ2Myw5Ny0xMDcpLCgzNjQ2MywxMDgtMTE5KSwoMzY0NjQsMzUtNTMpLCgzNjQ2NCw1NC02MildXG5cdFx0c3RvcmUuc2V0UGFydGlhbChcblx0XHRcdG5ldyBSYW5nZSgzNjQzNiwgMSwgMzY0NjQsIDE0MiksXG5cdFx0XHRbY3JlYXRlVG9rZW5zKCdbKDM2NDM3LDMzLTM3KSwoMzY0MzcsMzgtNDIpLCgzNjQzNyw0Ny01NyksKDM2NDM3LDU4LTY3KSwoMzY0MzgsMzUtNTMpLCgzNjQzOCw1NC02MiksKDM2NDQwLDI0LTI5KSwoMzY0NDAsMzMtNDYpLCgzNjQ0MCw0Ny01MyksKDM2NDQyLDI1LTM1KSwoMzY0NDIsMzYtNTApLCgzNjQ0MywzMC0zOSksKDM2NDQzLDQyLTQ2KSwoMzY0NDMsNDctNTMpLCgzNjQ0Myw1NC01OCksKDM2NDQzLDYzLTczKSwoMzY0NDMsNzQtODQpLCgzNjQ0Myw4Ny05MSksKDM2NDQzLDkyLTk4KSwoMzY0NDMsMTAxLTEwNSksKDM2NDQzLDEwNi0xMTIpLCgzNjQ0MywxMTMtMTE5KSwoMzY0NDQsMjgtMzcpLCgzNjQ0NCwzOC00MiksKDM2NDQ0LDQ3LTU3KSwoMzY0NDQsNTgtNzUpLCgzNjQ0NCw4MC05NSksKDM2NDQ0LDk2LTEwNSksKDM2NDQ1LDM1LTUzKSwoMzY0NDUsNTQtNjIpLCgzNjQ0OCwyNC0yOSksKDM2NDQ4LDMzLTQ2KSwoMzY0NDgsNDctNTQpLCgzNjQ1MCwyNS0zNSksKDM2NDUwLDM2LTUwKSwoMzY0NTEsMjgtMzMpLCgzNjQ1MSwzNi00OSksKDM2NDUxLDUwLTU3KSwoMzY0NTIsMzUtNTMpLCgzNjQ1Miw1NC02MiksKDM2NDU0LDMzLTM4KSwoMzY0NTQsNDEtNTQpLCgzNjQ1NCw1NS02MCksKDM2NDU1LDM1LTUzKSwoMzY0NTUsNTQtNjIpLCgzNjQ1NywzMy00NCksKDM2NDU3LDQ1LTQ5KSwoMzY0NTcsNTAtNTYpLCgzNjQ1Nyw2Mi04MyksKDM2NDU3LDg0LTg4KSwoMzY0NTgsMzUtNTMpLCgzNjQ1OCw1NC02MiksKDM2NDYwLDMzLTM3KSwoMzY0NjAsMzgtNDIpLCgzNjQ2MCw0Ny01NyksKDM2NDYwLDU4LTY3KSwoMzY0NjEsMzUtNTMpLCgzNjQ2MSw1NC02MiksKDM2NDYzLDM0LTM4KSwoMzY0NjMsMzktNDUpLCgzNjQ2Myw0Ni01MSksKDM2NDYzLDU0LTYzKSwoMzY0NjMsNjQtNzEpLCgzNjQ2Myw3Ni04MCksKDM2NDYzLDgxLTg3KSwoMzY0NjMsODgtOTIpLCgzNjQ2Myw5Ny0xMDcpLCgzNjQ2MywxMDgtMTE5KSwoMzY0NjQsMzUtNTMpLCgzNjQ2NCw1NC02MildJyldXG5cdFx0KTtcblx0XHQvLyBzZXRQYXJ0aWFsIFszNjQ1NywxIC0+IDM2NDg1LDE0MF0gWygzNjQ1NywzMy00NCksKDM2NDU3LDQ1LTQ5KSwoMzY0NTcsNTAtNTYpLCgzNjQ1Nyw2Mi04MyksKDM2NDU3LDg0LTg4KSwoMzY0NTgsMzUtNTMpLCgzNjQ1OCw1NC02MiksKDM2NDYwLDMzLTM3KSwoMzY0NjAsMzgtNDIpLCgzNjQ2MCw0Ny01NyksKDM2NDYwLDU4LTY3KSwoMzY0NjEsMzUtNTMpLCgzNjQ2MSw1NC02MiksKDM2NDYzLDM0LTM4KSwoMzY0NjMsMzktNDUpLCgzNjQ2Myw0Ni01MSksKDM2NDYzLDU0LTYzKSwoMzY0NjMsNjQtNzEpLCgzNjQ2Myw3Ni04MCksKDM2NDYzLDgxLTg3KSwoMzY0NjMsODgtOTIpLCgzNjQ2Myw5Ny0xMDcpLCgzNjQ2MywxMDgtMTE5KSwoMzY0NjQsMzUtNTMpLCgzNjQ2NCw1NC02MiksKDM2NDY2LDMzLTcxKSwoMzY0NjYsNzItNzYpLCgzNjQ2NywzNS01MyksKDM2NDY3LDU0LTYyKSwoMzY0NjksMjQtMjkpLCgzNjQ2OSwzMy00NiksKDM2NDY5LDQ3LTU0KSwoMzY0NzAsMjQtMzUpLCgzNjQ3MCwzOC00NiksKDM2NDczLDI1LTM1KSwoMzY0NzMsMzYtNTEpLCgzNjQ3NCwyOC0zMyksKDM2NDc0LDM2LTQ5KSwoMzY0NzQsNTAtNTgpLCgzNjQ3NSwzNS01MyksKDM2NDc1LDU0LTYyKSwoMzY0NzcsMjgtMzIpLCgzNjQ3NywzMy0zNyksKDM2NDc3LDQyLTUyKSwoMzY0NzcsNTMtNjkpLCgzNjQ3OCwzMi0zNiksKDM2NDc4LDM3LTQxKSwoMzY0NzgsNDYtNTYpLCgzNjQ3OCw1Ny03NCksKDM2NDc5LDMyLTM2KSwoMzY0NzksMzctNDEpLCgzNjQ3OSw0Ni01NiksKDM2NDc5LDU3LTc2KSwoMzY0ODAsMzItMzYpLCgzNjQ4MCwzNy00MSksKDM2NDgwLDQ2LTU2KSwoMzY0ODAsNTctNjgpLCgzNjQ4MSwzMi0zNiksKDM2NDgxLDM3LTQxKSwoMzY0ODEsNDYtNTYpLCgzNjQ4MSw1Ny02OCksKDM2NDgyLDM5LTU3KSwoMzY0ODIsNTgtNjYpLCgzNjQ4NCwzNC0zOCksKDM2NDg0LDM5LTQ1KSwoMzY0ODQsNDYtNTApLCgzNjQ4NCw1NS02NSksKDM2NDg0LDY2LTgyKSwoMzY0ODQsODYtOTcpLCgzNjQ4NCw5OC0xMDIpLCgzNjQ4NCwxMDMtMTA5KSwoMzY0ODQsMTExLTEyNCksKDM2NDg0LDEyNS0xMzMpLCgzNjQ4NSwzOS01NyksKDM2NDg1LDU4LTY2KV1cblx0XHRzdG9yZS5zZXRQYXJ0aWFsKFxuXHRcdFx0bmV3IFJhbmdlKDM2NDU3LCAxLCAzNjQ4NSwgMTQwKSxcblx0XHRcdFtjcmVhdGVUb2tlbnMoJ1soMzY0NTcsMzMtNDQpLCgzNjQ1Nyw0NS00OSksKDM2NDU3LDUwLTU2KSwoMzY0NTcsNjItODMpLCgzNjQ1Nyw4NC04OCksKDM2NDU4LDM1LTUzKSwoMzY0NTgsNTQtNjIpLCgzNjQ2MCwzMy0zNyksKDM2NDYwLDM4LTQyKSwoMzY0NjAsNDctNTcpLCgzNjQ2MCw1OC02NyksKDM2NDYxLDM1LTUzKSwoMzY0NjEsNTQtNjIpLCgzNjQ2MywzNC0zOCksKDM2NDYzLDM5LTQ1KSwoMzY0NjMsNDYtNTEpLCgzNjQ2Myw1NC02MyksKDM2NDYzLDY0LTcxKSwoMzY0NjMsNzYtODApLCgzNjQ2Myw4MS04NyksKDM2NDYzLDg4LTkyKSwoMzY0NjMsOTctMTA3KSwoMzY0NjMsMTA4LTExOSksKDM2NDY0LDM1LTUzKSwoMzY0NjQsNTQtNjIpLCgzNjQ2NiwzMy03MSksKDM2NDY2LDcyLTc2KSwoMzY0NjcsMzUtNTMpLCgzNjQ2Nyw1NC02MiksKDM2NDY5LDI0LTI5KSwoMzY0NjksMzMtNDYpLCgzNjQ2OSw0Ny01NCksKDM2NDcwLDI0LTM1KSwoMzY0NzAsMzgtNDYpLCgzNjQ3MywyNS0zNSksKDM2NDczLDM2LTUxKSwoMzY0NzQsMjgtMzMpLCgzNjQ3NCwzNi00OSksKDM2NDc0LDUwLTU4KSwoMzY0NzUsMzUtNTMpLCgzNjQ3NSw1NC02MiksKDM2NDc3LDI4LTMyKSwoMzY0NzcsMzMtMzcpLCgzNjQ3Nyw0Mi01MiksKDM2NDc3LDUzLTY5KSwoMzY0NzgsMzItMzYpLCgzNjQ3OCwzNy00MSksKDM2NDc4LDQ2LTU2KSwoMzY0NzgsNTctNzQpLCgzNjQ3OSwzMi0zNiksKDM2NDc5LDM3LTQxKSwoMzY0NzksNDYtNTYpLCgzNjQ3OSw1Ny03NiksKDM2NDgwLDMyLTM2KSwoMzY0ODAsMzctNDEpLCgzNjQ4MCw0Ni01NiksKDM2NDgwLDU3LTY4KSwoMzY0ODEsMzItMzYpLCgzNjQ4MSwzNy00MSksKDM2NDgxLDQ2LTU2KSwoMzY0ODEsNTctNjgpLCgzNjQ4MiwzOS01NyksKDM2NDgyLDU4LTY2KSwoMzY0ODQsMzQtMzgpLCgzNjQ4NCwzOS00NSksKDM2NDg0LDQ2LTUwKSwoMzY0ODQsNTUtNjUpLCgzNjQ4NCw2Ni04MiksKDM2NDg0LDg2LTk3KSwoMzY0ODQsOTgtMTAyKSwoMzY0ODQsMTAzLTEwOSksKDM2NDg0LDExMS0xMjQpLCgzNjQ4NCwxMjUtMTMzKSwoMzY0ODUsMzktNTcpLCgzNjQ4NSw1OC02NildJyldXG5cdFx0KTtcblx0XHQvLyBzZXRQYXJ0aWFsIFszNjQ0MSwxIC0+IDM2NDY5LDU2XSBbKDM2NDQyLDI1LTM1KSwoMzY0NDIsMzYtNTApLCgzNjQ0MywzMC0zOSksKDM2NDQzLDQyLTQ2KSwoMzY0NDMsNDctNTMpLCgzNjQ0Myw1NC01OCksKDM2NDQzLDYzLTczKSwoMzY0NDMsNzQtODQpLCgzNjQ0Myw4Ny05MSksKDM2NDQzLDkyLTk4KSwoMzY0NDMsMTAxLTEwNSksKDM2NDQzLDEwNi0xMTIpLCgzNjQ0MywxMTMtMTE5KSwoMzY0NDQsMjgtMzcpLCgzNjQ0NCwzOC00MiksKDM2NDQ0LDQ3LTU3KSwoMzY0NDQsNTgtNzUpLCgzNjQ0NCw4MC05NSksKDM2NDQ0LDk2LTEwNSksKDM2NDQ1LDM1LTUzKSwoMzY0NDUsNTQtNjIpLCgzNjQ0OCwyNC0yOSksKDM2NDQ4LDMzLTQ2KSwoMzY0NDgsNDctNTQpLCgzNjQ1MCwyNS0zNSksKDM2NDUwLDM2LTUwKSwoMzY0NTEsMjgtMzMpLCgzNjQ1MSwzNi00OSksKDM2NDUxLDUwLTU3KSwoMzY0NTIsMzUtNTMpLCgzNjQ1Miw1NC02MiksKDM2NDU0LDMzLTM4KSwoMzY0NTQsNDEtNTQpLCgzNjQ1NCw1NS02MCksKDM2NDU1LDM1LTUzKSwoMzY0NTUsNTQtNjIpLCgzNjQ1NywzMy00NCksKDM2NDU3LDQ1LTQ5KSwoMzY0NTcsNTAtNTYpLCgzNjQ1Nyw2Mi04MyksKDM2NDU3LDg0LTg4KSwoMzY0NTgsMzUtNTMpLCgzNjQ1OCw1NC02MiksKDM2NDYwLDMzLTM3KSwoMzY0NjAsMzgtNDIpLCgzNjQ2MCw0Ny01NyksKDM2NDYwLDU4LTY3KSwoMzY0NjEsMzUtNTMpLCgzNjQ2MSw1NC02MiksKDM2NDYzLDM0LTM4KSwoMzY0NjMsMzktNDUpLCgzNjQ2Myw0Ni01MSksKDM2NDYzLDU0LTYzKSwoMzY0NjMsNjQtNzEpLCgzNjQ2Myw3Ni04MCksKDM2NDYzLDgxLTg3KSwoMzY0NjMsODgtOTIpLCgzNjQ2Myw5Ny0xMDcpLCgzNjQ2MywxMDgtMTE5KSwoMzY0NjQsMzUtNTMpLCgzNjQ2NCw1NC02MiksKDM2NDY2LDMzLTcxKSwoMzY0NjYsNzItNzYpLCgzNjQ2NywzNS01MyksKDM2NDY3LDU0LTYyKSwoMzY0NjksMjQtMjkpLCgzNjQ2OSwzMy00NiksKDM2NDY5LDQ3LTU0KSwoMzY0NzAsMjQtMzUpXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwoXG5cdFx0XHRuZXcgUmFuZ2UoMzY0NDEsIDEsIDM2NDY5LCA1NiksXG5cdFx0XHRbY3JlYXRlVG9rZW5zKCdbKDM2NDQyLDI1LTM1KSwoMzY0NDIsMzYtNTApLCgzNjQ0MywzMC0zOSksKDM2NDQzLDQyLTQ2KSwoMzY0NDMsNDctNTMpLCgzNjQ0Myw1NC01OCksKDM2NDQzLDYzLTczKSwoMzY0NDMsNzQtODQpLCgzNjQ0Myw4Ny05MSksKDM2NDQzLDkyLTk4KSwoMzY0NDMsMTAxLTEwNSksKDM2NDQzLDEwNi0xMTIpLCgzNjQ0MywxMTMtMTE5KSwoMzY0NDQsMjgtMzcpLCgzNjQ0NCwzOC00MiksKDM2NDQ0LDQ3LTU3KSwoMzY0NDQsNTgtNzUpLCgzNjQ0NCw4MC05NSksKDM2NDQ0LDk2LTEwNSksKDM2NDQ1LDM1LTUzKSwoMzY0NDUsNTQtNjIpLCgzNjQ0OCwyNC0yOSksKDM2NDQ4LDMzLTQ2KSwoMzY0NDgsNDctNTQpLCgzNjQ1MCwyNS0zNSksKDM2NDUwLDM2LTUwKSwoMzY0NTEsMjgtMzMpLCgzNjQ1MSwzNi00OSksKDM2NDUxLDUwLTU3KSwoMzY0NTIsMzUtNTMpLCgzNjQ1Miw1NC02MiksKDM2NDU0LDMzLTM4KSwoMzY0NTQsNDEtNTQpLCgzNjQ1NCw1NS02MCksKDM2NDU1LDM1LTUzKSwoMzY0NTUsNTQtNjIpLCgzNjQ1NywzMy00NCksKDM2NDU3LDQ1LTQ5KSwoMzY0NTcsNTAtNTYpLCgzNjQ1Nyw2Mi04MyksKDM2NDU3LDg0LTg4KSwoMzY0NTgsMzUtNTMpLCgzNjQ1OCw1NC02MiksKDM2NDYwLDMzLTM3KSwoMzY0NjAsMzgtNDIpLCgzNjQ2MCw0Ny01NyksKDM2NDYwLDU4LTY3KSwoMzY0NjEsMzUtNTMpLCgzNjQ2MSw1NC02MiksKDM2NDYzLDM0LTM4KSwoMzY0NjMsMzktNDUpLCgzNjQ2Myw0Ni01MSksKDM2NDYzLDU0LTYzKSwoMzY0NjMsNjQtNzEpLCgzNjQ2Myw3Ni04MCksKDM2NDYzLDgxLTg3KSwoMzY0NjMsODgtOTIpLCgzNjQ2Myw5Ny0xMDcpLCgzNjQ2MywxMDgtMTE5KSwoMzY0NjQsMzUtNTMpLCgzNjQ2NCw1NC02MiksKDM2NDY2LDMzLTcxKSwoMzY0NjYsNzItNzYpLCgzNjQ2NywzNS01MyksKDM2NDY3LDU0LTYyKSwoMzY0NjksMjQtMjkpLCgzNjQ2OSwzMy00NiksKDM2NDY5LDQ3LTU0KSwoMzY0NzAsMjQtMzUpXScpXVxuXHRcdCk7XG5cblx0XHRjb25zdCBsaW5lVG9rZW5zID0gc3RvcmUuYWRkU3BhcnNlVG9rZW5zKDM2NDUxLCBuZXcgTGluZVRva2VucyhuZXcgVWludDMyQXJyYXkoWzYwLCAxXSksIGAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZmxhZ3MgJiBNb2RpZmllckZsYWdzLkFtYmllbnQpIHtgLCBjb2RlYykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lVG9rZW5zLmdldENvdW50KCksIDcpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ2lzc3VlICM5NTk0OTogSWRlbnRpZmllcnMgYXJlIGNvbG9yZWQgaW4gYm9sZCB3aGVuIHRhcmdldHRpbmcga2V5d29yZHMnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVUTU1ldGFkYXRhKGZvcmVncm91bmQ6IG51bWJlciwgZm9udFN0eWxlOiBudW1iZXIsIGxhbmd1YWdlSWQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRyZXR1cm4gKFxuXHRcdFx0XHQobGFuZ3VhZ2VJZCA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVClcblx0XHRcdFx0fCAoZm9udFN0eWxlIDw8IE1ldGFkYXRhQ29uc3RzLkZPTlRfU1RZTEVfT0ZGU0VUKVxuXHRcdFx0XHR8IChmb3JlZ3JvdW5kIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0KSA+Pj4gMDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0b0FycihsaW5lVG9rZW5zOiBMaW5lVG9rZW5zKTogbnVtYmVyW10ge1xuXHRcdFx0Y29uc3QgcjogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZVRva2Vucy5nZXRDb3VudCgpOyBpKyspIHtcblx0XHRcdFx0ci5wdXNoKGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KGkpKTtcblx0XHRcdFx0ci5wdXNoKGxpbmVUb2tlbnMuZ2V0TWV0YWRhdGEoaSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kZWMgPSBuZXcgTGFuZ3VhZ2VJZENvZGVjKCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgU3BhcnNlVG9rZW5zU3RvcmUoY29kZWMpO1xuXG5cdFx0c3RvcmUuc2V0KFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoMSwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0MCwgNiwgMTEsICgxIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKSB8IE1ldGFkYXRhQ29uc3RzLlNFTUFOVElDX1VTRV9GT1JFR1JPVU5ELFxuXHRcdFx0XSkpXG5cdFx0XSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBsaW5lVG9rZW5zID0gc3RvcmUuYWRkU3BhcnNlVG9rZW5zKDEsIG5ldyBMaW5lVG9rZW5zKG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHQ1LCBjcmVhdGVUTU1ldGFkYXRhKDUsIEZvbnRTdHlsZS5Cb2xkLCA1MyksXG5cdFx0XHQxNCwgY3JlYXRlVE1NZXRhZGF0YSgxLCBGb250U3R5bGUuTm9uZSwgNTMpLFxuXHRcdFx0MTcsIGNyZWF0ZVRNTWV0YWRhdGEoNiwgRm9udFN0eWxlLk5vbmUsIDUzKSxcblx0XHRcdDE4LCBjcmVhdGVUTU1ldGFkYXRhKDEsIEZvbnRTdHlsZS5Ob25lLCA1MyksXG5cdFx0XSksIGBjb25zdCBoZWxsbyA9IDEyMztgLCBjb2RlYykpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gdG9BcnIobGluZVRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdDUsIGNyZWF0ZVRNTWV0YWRhdGEoNSwgRm9udFN0eWxlLkJvbGQsIDUzKSxcblx0XHRcdDYsIGNyZWF0ZVRNTWV0YWRhdGEoMSwgRm9udFN0eWxlLk5vbmUsIDUzKSxcblx0XHRcdDExLCBjcmVhdGVUTU1ldGFkYXRhKDEsIEZvbnRTdHlsZS5Ob25lLCA1MyksXG5cdFx0XHQxNCwgY3JlYXRlVE1NZXRhZGF0YSgxLCBGb250U3R5bGUuTm9uZSwgNTMpLFxuXHRcdFx0MTcsIGNyZWF0ZVRNTWV0YWRhdGEoNiwgRm9udFN0eWxlLk5vbmUsIDUzKSxcblx0XHRcdDE4LCBjcmVhdGVUTU1ldGFkYXRhKDEsIEZvbnRTdHlsZS5Ob25lLCA1Mylcblx0XHRdKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdCVUc6IHNldFBhcnRpYWwgd2l0aCBzdGFydExpbmVOdW1iZXIgPiAxIGFuZCB0b2tlbiByZW1vdmFsIGNyZWF0ZXMgaW52YWxpZCBzdGF0ZScsICgpID0+IHtcblx0XHQvKipcblx0XHQgKiBUaGUgYnVnIGlzIHRoZSBzYW1lIHJlZ2FyZGxlc3Mgb2YgdGhlIHN0YXJ0aW5nIGxpbmUgbnVtYmVyLlxuXHRcdCAqIElmIGEgcGllY2Ugc3RhcnRzIGF0IGxpbmUgNSBhbmQgYWxsIHRva2VucyBhcmUgcmVtb3ZlZCB2aWEgc2V0UGFydGlhbDpcblx0XHQgKiAtIHN0YXJ0TGluZU51bWJlciBzdGF5cyBhdCA1XG5cdFx0ICogLSBlbmRMaW5lTnVtYmVyIGJlY29tZXMgNSArICgtMSkgPSA0XG5cdFx0ICovXG5cdFx0Y29uc3QgY29kZWMgPSBuZXcgTGFuZ3VhZ2VJZENvZGVjKCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgU3BhcnNlVG9rZW5zU3RvcmUoY29kZWMpO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgdG9rZW5zIG9uIGxpbmUgNVxuXHRcdHN0b3JlLnNldChbXG5cdFx0XHRTcGFyc2VNdWx0aWxpbmVUb2tlbnMuY3JlYXRlKDUsIG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdDAsIDUsIDEwLCAxLCAgLy8gbGluZSA1LCBjaGFycyA1LTEwXG5cdFx0XHRdKSlcblx0XHRdLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaXNFbXB0eSgpLCBmYWxzZSk7XG5cblx0XHQvLyBSZW1vdmUgYWxsIHRva2VucyB2aWEgc2V0UGFydGlhbFxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDUsIDEsIDUsIDIwKSwgW10pO1xuXG5cdFx0Ly8gQlVHOiBEdXJpbmcgcHJvY2Vzc2luZywgcGllY2VzIGNhbiBoYXZlIGludmFsaWQgbGluZSBudW1iZXJzXG5cdFx0Ly8gVGhlIHN0b3JlIHNob3VsZCByZW1vdmUgZW1wdHkgcGllY2VzIGFuZCByZW1haW4gdmFsaWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaXNFbXB0eSgpLCB0cnVlLFxuXHRcdFx0J1N0b3JlIHNob3VsZCBiZSBlbXB0eSBhZnRlciBzZXRQYXJ0aWFsIHJlbW92ZXMgYWxsIHRva2VucycpO1xuXHR9KTtcblxuXHR0ZXN0KCdCVUc6IHNldFBhcnRpYWwgd2l0aCBzcGxpdCB0aGF0IGNyZWF0ZXMgZW1wdHkgZmlyc3QgcGllY2Ugd2l0aCBpbnZhbGlkIGxpbmUgbnVtYmVycycsICgpID0+IHtcblx0XHRjb25zdCBjb2RlYyA9IG5ldyBMYW5ndWFnZUlkQ29kZWMoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBTcGFyc2VUb2tlbnNTdG9yZShjb2RlYyk7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCB0b2tlbnMgLSB0b2tlbiBpcyBvbiBsaW5lIDExXG5cdFx0c3RvcmUuc2V0KFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoMSwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0MTAsIDUsIDEwLCAxLCAgLy8gbGluZSAxMSAoZGVsdGFMaW5lPTEwIGZyb20gc3RhcnRMaW5lTnVtYmVyPTEpLCBjaGFycyA1LTEwXG5cdFx0XHRdKSlcblx0XHRdLCBmYWxzZSk7XG5cblx0XHQvLyBzZXRQYXJ0aWFsIHdpdGggYSByYW5nZSBbMSwxIC0+IDUsMV0gdGhhdCB3aWxsIGNhdXNlIGEgc3BsaXQgd2hlcmUgdGhlIGZpcnN0IHBpZWNlIGlzIGVtcHR5XG5cdFx0c3RvcmUuc2V0UGFydGlhbChuZXcgUmFuZ2UoMSwgMSwgNSwgMSksIFtdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5pc0VtcHR5KCksIGZhbHNlLCAnU3RvcmUgc2hvdWxkIHN0aWxsIGhhdmUgdGhlIHRva2VuIG9uIGxpbmUgMTEnKTtcblxuXHRcdC8vIFRoZSB0b2tlbiBhdCBsaW5lIDExIHNob3VsZCBiZSByZXRyaWV2YWJsZSBhZnRlciB0aGUgc3BsaXRcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gc3RvcmUuYWRkU3BhcnNlVG9rZW5zKDExLCBuZXcgTGluZVRva2VucyhuZXcgVWludDMyQXJyYXkoWzIyLCAxXSksIGAgICAgdGVzdCBsaW5lIHRleHQgICAgYCwgY29kZWMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZVRva2Vucy5nZXRDb3VudCgpLCAzLCAnU2hvdWxkIGhhdmUgMyB0b2tlbnM6IGJhc2UgdG9rZW4gc3RhcnQgKyBzZW1hbnRpYyB0b2tlbiBmcm9tIGxpbmUgMTEgKyBiYXNlIHRva2VuIGVuZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KDEpLCA1LCAnU2VtYW50aWMgdG9rZW4gc2hvdWxkIHN0YXJ0IGF0IG9mZnNldCA1Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KDEpLCAxMCwgJ1NlbWFudGljIHRva2VuIHNob3VsZCBlbmQgYXQgb2Zmc2V0IDEwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFNwYXJzZVRva2VucyBza2lwcyBvdmVybGFwcGluZyBzZW1hbnRpYyB0b2tlbnMgdGhhdCBwcm9kdWNlIGJhY2t3YXJkIGVuZE9mZnNldHMnLCAoKSA9PiB7XG5cdFx0Ly8gVGhpcyB0ZXN0IHJlcHJvZHVjZXMgYSByZW5kZXJpbmcgZ2xpdGNoIHdoZXJlIGNoYXJhY3RlcnMgYXJlIGR1cGxpY2F0ZWQgaW4gdGhlIERPTS5cblx0XHQvLyBXaGVuIHR5cGluZyBhdCBhIHNlbWFudGljIHRva2VuIGJvdW5kYXJ5LCBgYWNjZXB0SW5zZXJ0VGV4dGAgY2FuIGV4cGFuZCBhIHRva2VuXG5cdFx0Ly8gYW5kIGNyZWF0ZSBvdmVybGFwcGluZyByYW5nZXMgKGUuZy4sIHRva2VuICcrJyBhdCAoMyw1KSBhbmQgdG9rZW4gJzInIGF0ICg0LDUpKS5cblx0XHQvLyBUaGUgbWVyZ2UgaW4gYGFkZFNwYXJzZVRva2Vuc2AgbXVzdCBub3QgcHJvZHVjZSBiYWNrd2FyZCBlbmRPZmZzZXQgc2VxdWVuY2VzLFxuXHRcdC8vIG90aGVyd2lzZSBgTGluZVRva2Vucy53aXRoSW5zZXJ0ZWRgIHJlLWNvcGllcyBjaGFyYWN0ZXJzIGNhdXNpbmcgZHVwbGljYXRpb24uXG5cdFx0Y29uc3QgY29kZWMgPSBuZXcgTGFuZ3VhZ2VJZENvZGVjKCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgU3BhcnNlVG9rZW5zU3RvcmUoY29kZWMpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgb3ZlcmxhcHBpbmcgc2VtYW50aWMgdG9rZW5zIGFmdGVyIGFuIGVkaXQ6XG5cdFx0Ly8gT3JpZ2luYWw6IGY9MSsyIHdpdGggdG9rZW5zIGF0ICgwLDEpLCAoMSwyKSwgKDIsMyksICgzLDQpLCAoNCw1KVxuXHRcdC8vIEFmdGVyIGluc2VydGluZyAnYScgYXQgb2Zmc2V0IDQ6IHRva2VuICgzLDQpIGV4cGFuZHMgdG8gKDMsNSksIHRva2VuICg0LDUpIHN0YXlzXG5cdFx0Ly8gVGhpcyBjcmVhdGVzIG92ZXJsYXA6ICgzLDUpIGFuZCAoNCw1KVxuXHRcdGNvbnN0IHNlbWFudGljTWV0YTEgPSAoMSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVCkgfCBNZXRhZGF0YUNvbnN0cy5TRU1BTlRJQ19VU0VfRk9SRUdST1VORDtcblx0XHRjb25zdCBzZW1hbnRpY01ldGEyID0gKDIgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpIHwgTWV0YWRhdGFDb25zdHMuU0VNQU5USUNfVVNFX0ZPUkVHUk9VTkQ7XG5cdFx0c3RvcmUuc2V0KFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoMSwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0Ly8gZGVsdGFMaW5lLCBzdGFydENoYXIsIGVuZENoYXIsIG1ldGFkYXRhXG5cdFx0XHRcdDAsIDAsIDEsIHNlbWFudGljTWV0YTEsICAvLyAnZicgYXQgKDAsMSlcblx0XHRcdFx0MCwgMSwgMiwgc2VtYW50aWNNZXRhMiwgIC8vICc9JyBhdCAoMSwyKVxuXHRcdFx0XHQwLCAyLCAzLCBzZW1hbnRpY01ldGExLCAgLy8gJzEnIGF0ICgyLDMpXG5cdFx0XHRcdDAsIDMsIDUsIHNlbWFudGljTWV0YTIsICAvLyAnK2EnIGF0ICgzLDUpIC0gZXhwYW5kZWQgYWZ0ZXIgZWRpdFxuXHRcdFx0XHQwLCA0LCA1LCBzZW1hbnRpY01ldGExLCAgLy8gb3ZlcmxhcHBpbmc6ICdhJyBhdCAoNCw1KSAtIHN0YWxlIHBvc2l0aW9uXG5cdFx0XHRdKSlcblx0XHRdLCB0cnVlKTtcblxuXHRcdGNvbnN0IHRtTWV0YSA9ICgzIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKSA+Pj4gMDtcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gc3RvcmUuYWRkU3BhcnNlVG9rZW5zKDEsIG5ldyBMaW5lVG9rZW5zKG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHQ2LCB0bU1ldGEsIC8vIGVudGlyZSBsaW5lIFwiZj0xK2EyXCIgY292ZXJlZCBieSBvbmUgVE0gdG9rZW5cblx0XHRdKSwgYGY9MSthMmAsIGNvZGVjKSk7XG5cblx0XHQvLyBWZXJpZnkgZW5kT2Zmc2V0cyBhcmUgbW9ub3RvbmljYWxseSBpbmNyZWFzaW5nIChubyBiYWNrd2FyZCBzZXF1ZW5jZXMpXG5cdFx0Y29uc3QgZW5kT2Zmc2V0czogbnVtYmVyW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTsgaSsrKSB7XG5cdFx0XHRlbmRPZmZzZXRzLnB1c2gobGluZVRva2Vucy5nZXRFbmRPZmZzZXQoaSkpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGVuZE9mZnNldHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydC5vayhlbmRPZmZzZXRzW2ldID4gZW5kT2Zmc2V0c1tpIC0gMV0sXG5cdFx0XHRcdGBlbmRPZmZzZXRbJHtpfV09JHtlbmRPZmZzZXRzW2ldfSBzaG91bGQgYmUgPiBlbmRPZmZzZXRbJHtpIC0gMX1dPSR7ZW5kT2Zmc2V0c1tpIC0gMV19YCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB1c2VkIHdpdGggaW5qZWN0ZWQgdGV4dCwgdGhlIHJlc3VsdGluZyBMaW5lVG9rZW5zIG11c3Qgbm90IGR1cGxpY2F0ZSBjaGFyYWN0ZXJzLlxuXHRcdC8vIFNpbXVsYXRlIGluamVjdGVkIHRleHQgXCIgIFwiIGF0IG9mZnNldCAwIChsaWtlIHRoZSByZXBybydzIGBiZWZvcmU6IHsgY29udGVudDogXCIgIFwiIH1gKVxuXHRcdGNvbnN0IHdpdGhJbmplY3RlZCA9IGxpbmVUb2tlbnMud2l0aEluc2VydGVkKFt7IG9mZnNldDogMCwgdGV4dDogJyAgJywgdG9rZW5NZXRhZGF0YTogTGluZVRva2Vucy5kZWZhdWx0VG9rZW5NZXRhZGF0YSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpdGhJbmplY3RlZC5nZXRMaW5lQ29udGVudCgpLCAnICBmPTErYTInLFxuXHRcdFx0J3dpdGhJbnNlcnRlZCBtdXN0IG5vdCBkdXBsaWNhdGUgY2hhcmFjdGVycyB3aGVuIHNlbWFudGljIHRva2VucyBvdmVybGFwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BpZWNlIHdpdGggc3RhcnRMaW5lTnVtYmVyIDAgYW5kIGVuZExpbmVOdW1iZXIgLTEgYWZ0ZXIgZW5jb21wYXNzaW5nIGRlbGV0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvZGVjID0gbmV3IExhbmd1YWdlSWRDb2RlYygpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFNwYXJzZVRva2Vuc1N0b3JlKGNvZGVjKTtcblxuXHRcdC8vIFNldCBpbml0aWFsIHRva2VucyBvbiBsaW5lcyA1LTEwXG5cdFx0Y29uc3QgcGllY2UgPSBTcGFyc2VNdWx0aWxpbmVUb2tlbnMuY3JlYXRlKDUsIG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHQwLCAwLCA1LCAxLCAgLy8gbGluZSA1LCBjaGFycyAwLTVcblx0XHRcdDUsIDAsIDUsIDIsICAvLyBsaW5lIDEwLCBjaGFycyAwLTVcblx0XHRdKSk7XG5cblx0XHRzdG9yZS5zZXQoW3BpZWNlXSwgZmFsc2UpO1xuXG5cdFx0Ly8gVmVyaWZ5IGluaXRpYWwgc3RhdGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2Uuc3RhcnRMaW5lTnVtYmVyLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2UuZW5kTGluZU51bWJlciwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZS5pc0VtcHR5KCksIGZhbHNlKTtcblxuXHRcdC8vIFBlcmZvcm0gYW4gZWRpdCB0aGF0IGNvbXBsZXRlbHkgZW5jb21wYXNzZXMgdGhlIHRva2VuIHJhbmdlXG5cdFx0Ly8gRGVsZXRlIGZyb20gbGluZSAxIHRvIGxpbmUgMjAgKGVuY29tcGFzc2VzIGxpbmVzIDUtMTApXG5cdFx0Ly8gVGhpcyB0cmlnZ2VycyB0aGUgY2FzZSBpbiBfYWNjZXB0RGVsZXRlUmFuZ2Ugd2hlcmU6XG5cdFx0Ly8gaWYgKGZpcnN0TGluZUluZGV4IDwgMCAmJiBsYXN0TGluZUluZGV4ID49IHRva2VuTWF4RGVsdGFMaW5lICsgMSlcblx0XHQvLyBXaGljaCBzZXRzIHRoaXMuX3N0YXJ0TGluZU51bWJlciA9IDAgYW5kIGNhbGxzIHRoaXMuX3Rva2Vucy5jbGVhcigpXG5cdFx0c3RvcmUuYWNjZXB0RWRpdChcblx0XHRcdHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMjAsIGVuZENvbHVtbjogMSB9LFxuXHRcdFx0MCwgLy8gZW9sQ291bnQgLSBubyBuZXcgbGluZXMgaW5zZXJ0ZWRcblx0XHRcdDAsIC8vIGZpcnN0TGluZUxlbmd0aFxuXHRcdFx0MCwgLy8gbGFzdExpbmVMZW5ndGhcblx0XHRcdDAgIC8vIGZpcnN0Q2hhckNvZGVcblx0XHQpO1xuXG5cdFx0Ly8gQWZ0ZXIgYW4gZW5jb21wYXNzaW5nIGRlbGV0aW9uLCB0aGUgcGllY2Ugc2hvdWxkIGJlIGVtcHR5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlLmlzRW1wdHkoKSwgdHJ1ZSwgJ1BpZWNlIHNob3VsZCBiZSBlbXB0eSBhZnRlciBlbmNvbXBhc3NpbmcgZGVsZXRpb24nKTtcblxuXHRcdC8vIEVYUEVDVEVEIEJFSEFWSU9SOiBUaGUgc3RvcmUgc2hvdWxkIGJlIGVtcHR5IChubyBwaWVjZXMgd2l0aCBpbnZhbGlkIGxpbmUgbnVtYmVycylcblx0XHQvLyBDdXJyZW50bHkgZmFpbHMgYmVjYXVzZSB0aGUgcGllY2UgcmVtYWlucyB3aXRoIHN0YXJ0TGluZU51bWJlcj0wLCBlbmRMaW5lTnVtYmVyPS0xXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmlzRW1wdHkoKSwgdHJ1ZSwgJ1N0b3JlIHNob3VsZCBiZSBlbXB0eSBhZnRlciBhbGwgdG9rZW5zIGFyZSBkZWxldGVkIGJ5IGVuY29tcGFzc2luZyBlZGl0Jyk7XG5cdH0pO1xufSk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdC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
