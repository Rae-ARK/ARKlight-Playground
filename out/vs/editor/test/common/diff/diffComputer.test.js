import assert from "assert";
import { Constants } from "../../../../base/common/uint.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { DiffComputer } from "../../../common/diff/legacyLinesDiffComputer.js";
import { createTextModel } from "../testTextModel.js";
function assertDiff(originalLines, modifiedLines, expectedChanges, shouldComputeCharChanges = true, shouldPostProcessCharChanges = false, shouldIgnoreTrimWhitespace = false) {
  const diffComputer = new DiffComputer(originalLines, modifiedLines, {
    shouldComputeCharChanges,
    shouldPostProcessCharChanges,
    shouldIgnoreTrimWhitespace,
    shouldMakePrettyDiff: true,
    maxComputationTime: 0
  });
  const changes = diffComputer.computeDiff().changes;
  const mapCharChange = (charChange) => {
    return {
      originalStartLineNumber: charChange.originalStartLineNumber,
      originalStartColumn: charChange.originalStartColumn,
      originalEndLineNumber: charChange.originalEndLineNumber,
      originalEndColumn: charChange.originalEndColumn,
      modifiedStartLineNumber: charChange.modifiedStartLineNumber,
      modifiedStartColumn: charChange.modifiedStartColumn,
      modifiedEndLineNumber: charChange.modifiedEndLineNumber,
      modifiedEndColumn: charChange.modifiedEndColumn
    };
  };
  const actual = changes.map((lineChange) => {
    return {
      originalStartLineNumber: lineChange.originalStartLineNumber,
      originalEndLineNumber: lineChange.originalEndLineNumber,
      modifiedStartLineNumber: lineChange.modifiedStartLineNumber,
      modifiedEndLineNumber: lineChange.modifiedEndLineNumber,
      charChanges: lineChange.charChanges ? lineChange.charChanges.map(mapCharChange) : void 0
    };
  });
  assert.deepStrictEqual(actual, expectedChanges);
  if (!shouldIgnoreTrimWhitespace) {
    const modifiedTextModel = createTextModel(modifiedLines.join("\n"));
    const expectedValue = modifiedTextModel.getValue();
    {
      const originalTextModel = createTextModel(originalLines.join("\n"));
      originalTextModel.applyEdits(changes.map((c) => getLineEdit(c, modifiedTextModel)));
      assert.deepStrictEqual(originalTextModel.getValue(), expectedValue);
      originalTextModel.dispose();
    }
    if (shouldComputeCharChanges) {
      const originalTextModel = createTextModel(originalLines.join("\n"));
      originalTextModel.applyEdits(changes.flatMap((c) => getCharEdits(c, modifiedTextModel)));
      assert.deepStrictEqual(originalTextModel.getValue(), expectedValue);
      originalTextModel.dispose();
    }
    modifiedTextModel.dispose();
  }
}
function getCharEdits(lineChange, modifiedTextModel) {
  if (!lineChange.charChanges) {
    return [getLineEdit(lineChange, modifiedTextModel)];
  }
  return lineChange.charChanges.map((c) => {
    const originalRange = new Range(c.originalStartLineNumber, c.originalStartColumn, c.originalEndLineNumber, c.originalEndColumn);
    const modifiedRange = new Range(c.modifiedStartLineNumber, c.modifiedStartColumn, c.modifiedEndLineNumber, c.modifiedEndColumn);
    return {
      range: originalRange,
      text: modifiedTextModel.getValueInRange(modifiedRange)
    };
  });
}
function getLineEdit(lineChange, modifiedTextModel) {
  let originalRange;
  if (lineChange.originalEndLineNumber === 0) {
    originalRange = new LineRange(lineChange.originalStartLineNumber + 1, 0);
  } else {
    originalRange = new LineRange(lineChange.originalStartLineNumber, lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1);
  }
  let modifiedRange;
  if (lineChange.modifiedEndLineNumber === 0) {
    modifiedRange = new LineRange(lineChange.modifiedStartLineNumber + 1, 0);
  } else {
    modifiedRange = new LineRange(lineChange.modifiedStartLineNumber, lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1);
  }
  const [r1, r2] = diffFromLineRanges(originalRange, modifiedRange);
  return {
    range: r1,
    text: modifiedTextModel.getValueInRange(r2)
  };
}
function diffFromLineRanges(originalRange, modifiedRange) {
  if (originalRange.startLineNumber === 1 || modifiedRange.startLineNumber === 1) {
    if (!originalRange.isEmpty && !modifiedRange.isEmpty) {
      return [
        new Range(
          originalRange.startLineNumber,
          1,
          originalRange.endLineNumberExclusive - 1,
          Constants.MAX_SAFE_SMALL_INTEGER
        ),
        new Range(
          modifiedRange.startLineNumber,
          1,
          modifiedRange.endLineNumberExclusive - 1,
          Constants.MAX_SAFE_SMALL_INTEGER
        )
      ];
    }
    return [
      new Range(
        originalRange.startLineNumber,
        1,
        originalRange.endLineNumberExclusive,
        1
      ),
      new Range(
        modifiedRange.startLineNumber,
        1,
        modifiedRange.endLineNumberExclusive,
        1
      )
    ];
  }
  return [
    new Range(
      originalRange.startLineNumber - 1,
      Constants.MAX_SAFE_SMALL_INTEGER,
      originalRange.endLineNumberExclusive - 1,
      Constants.MAX_SAFE_SMALL_INTEGER
    ),
    new Range(
      modifiedRange.startLineNumber - 1,
      Constants.MAX_SAFE_SMALL_INTEGER,
      modifiedRange.endLineNumberExclusive - 1,
      Constants.MAX_SAFE_SMALL_INTEGER
    )
  ];
}
class LineRange {
  constructor(startLineNumber, lineCount) {
    this.startLineNumber = startLineNumber;
    this.lineCount = lineCount;
  }
  get isEmpty() {
    return this.lineCount === 0;
  }
  get endLineNumberExclusive() {
    return this.startLineNumber + this.lineCount;
  }
}
function createLineDeletion(startLineNumber, endLineNumber, modifiedLineNumber) {
  return {
    originalStartLineNumber: startLineNumber,
    originalEndLineNumber: endLineNumber,
    modifiedStartLineNumber: modifiedLineNumber,
    modifiedEndLineNumber: 0,
    charChanges: void 0
  };
}
function createLineInsertion(startLineNumber, endLineNumber, originalLineNumber) {
  return {
    originalStartLineNumber: originalLineNumber,
    originalEndLineNumber: 0,
    modifiedStartLineNumber: startLineNumber,
    modifiedEndLineNumber: endLineNumber,
    charChanges: void 0
  };
}
function createLineChange(originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber, charChanges) {
  return {
    originalStartLineNumber,
    originalEndLineNumber,
    modifiedStartLineNumber,
    modifiedEndLineNumber,
    charChanges
  };
}
function createCharChange(originalStartLineNumber, originalStartColumn, originalEndLineNumber, originalEndColumn, modifiedStartLineNumber, modifiedStartColumn, modifiedEndLineNumber, modifiedEndColumn) {
  return {
    originalStartLineNumber,
    originalStartColumn,
    originalEndLineNumber,
    originalEndColumn,
    modifiedStartLineNumber,
    modifiedStartColumn,
    modifiedEndLineNumber,
    modifiedEndColumn
  };
}
suite("Editor Diff - DiffComputer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("one inserted line below", () => {
    const original = ["line"];
    const modified = ["line", "new line"];
    const expected = [createLineInsertion(2, 2, 1)];
    assertDiff(original, modified, expected);
  });
  test("two inserted lines below", () => {
    const original = ["line"];
    const modified = ["line", "new line", "another new line"];
    const expected = [createLineInsertion(2, 3, 1)];
    assertDiff(original, modified, expected);
  });
  test("one inserted line above", () => {
    const original = ["line"];
    const modified = ["new line", "line"];
    const expected = [createLineInsertion(1, 1, 0)];
    assertDiff(original, modified, expected);
  });
  test("two inserted lines above", () => {
    const original = ["line"];
    const modified = ["new line", "another new line", "line"];
    const expected = [createLineInsertion(1, 2, 0)];
    assertDiff(original, modified, expected);
  });
  test("one inserted line in middle", () => {
    const original = ["line1", "line2", "line3", "line4"];
    const modified = ["line1", "line2", "new line", "line3", "line4"];
    const expected = [createLineInsertion(3, 3, 2)];
    assertDiff(original, modified, expected);
  });
  test("two inserted lines in middle", () => {
    const original = ["line1", "line2", "line3", "line4"];
    const modified = ["line1", "line2", "new line", "another new line", "line3", "line4"];
    const expected = [createLineInsertion(3, 4, 2)];
    assertDiff(original, modified, expected);
  });
  test("two inserted lines in middle interrupted", () => {
    const original = ["line1", "line2", "line3", "line4"];
    const modified = ["line1", "line2", "new line", "line3", "another new line", "line4"];
    const expected = [createLineInsertion(3, 3, 2), createLineInsertion(5, 5, 3)];
    assertDiff(original, modified, expected);
  });
  test("one deleted line below", () => {
    const original = ["line", "new line"];
    const modified = ["line"];
    const expected = [createLineDeletion(2, 2, 1)];
    assertDiff(original, modified, expected);
  });
  test("two deleted lines below", () => {
    const original = ["line", "new line", "another new line"];
    const modified = ["line"];
    const expected = [createLineDeletion(2, 3, 1)];
    assertDiff(original, modified, expected);
  });
  test("one deleted lines above", () => {
    const original = ["new line", "line"];
    const modified = ["line"];
    const expected = [createLineDeletion(1, 1, 0)];
    assertDiff(original, modified, expected);
  });
  test("two deleted lines above", () => {
    const original = ["new line", "another new line", "line"];
    const modified = ["line"];
    const expected = [createLineDeletion(1, 2, 0)];
    assertDiff(original, modified, expected);
  });
  test("one deleted line in middle", () => {
    const original = ["line1", "line2", "new line", "line3", "line4"];
    const modified = ["line1", "line2", "line3", "line4"];
    const expected = [createLineDeletion(3, 3, 2)];
    assertDiff(original, modified, expected);
  });
  test("two deleted lines in middle", () => {
    const original = ["line1", "line2", "new line", "another new line", "line3", "line4"];
    const modified = ["line1", "line2", "line3", "line4"];
    const expected = [createLineDeletion(3, 4, 2)];
    assertDiff(original, modified, expected);
  });
  test("two deleted lines in middle interrupted", () => {
    const original = ["line1", "line2", "new line", "line3", "another new line", "line4"];
    const modified = ["line1", "line2", "line3", "line4"];
    const expected = [createLineDeletion(3, 3, 2), createLineDeletion(5, 5, 3)];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars inserted at the end", () => {
    const original = ["line"];
    const modified = ["line changed"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 5, 1, 5, 1, 5, 1, 13)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars inserted at the beginning", () => {
    const original = ["line"];
    const modified = ["my line"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 1, 1, 1, 1, 1, 1, 4)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars inserted in the middle", () => {
    const original = ["abba"];
    const modified = ["abzzba"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 3, 1, 3, 1, 3, 1, 5)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars inserted in the middle (two spots)", () => {
    const original = ["abba"];
    const modified = ["abzzbzza"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 3, 1, 3, 1, 3, 1, 5),
        createCharChange(1, 4, 1, 4, 1, 6, 1, 8)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars deleted 1", () => {
    const original = ["abcdefg"];
    const modified = ["abcfg"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 4, 1, 6, 1, 4, 1, 4)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("one line changed: chars deleted 2", () => {
    const original = ["abcdefg"];
    const modified = ["acfg"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 2, 1, 3, 1, 2, 1, 2),
        createCharChange(1, 4, 1, 6, 1, 3, 1, 3)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("two lines changed 1", () => {
    const original = ["abcd", "efgh"];
    const modified = ["abcz"];
    const expected = [
      createLineChange(1, 2, 1, 1, [
        createCharChange(1, 4, 2, 5, 1, 4, 1, 5)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("two lines changed 2", () => {
    const original = ["foo", "abcd", "efgh", "BAR"];
    const modified = ["foo", "abcz", "BAR"];
    const expected = [
      createLineChange(2, 3, 2, 2, [
        createCharChange(2, 4, 3, 5, 2, 4, 2, 5)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("two lines changed 3", () => {
    const original = ["foo", "abcd", "efgh", "BAR"];
    const modified = ["foo", "abcz", "zzzzefgh", "BAR"];
    const expected = [
      createLineChange(2, 3, 2, 3, [
        createCharChange(2, 4, 2, 5, 2, 4, 2, 5),
        createCharChange(3, 1, 3, 1, 3, 1, 3, 5)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("two lines changed 4", () => {
    const original = ["abc"];
    const modified = ["", "", "axc", ""];
    const expected = [
      createLineChange(1, 1, 1, 4, [
        createCharChange(1, 1, 1, 1, 1, 1, 3, 1),
        createCharChange(1, 2, 1, 3, 3, 2, 3, 3),
        createCharChange(1, 4, 1, 4, 3, 4, 4, 1)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("empty original sequence in char diff", () => {
    const original = ["abc", "", "xyz"];
    const modified = ["abc", "qwe", "rty", "xyz"];
    const expected = [
      createLineChange(2, 2, 2, 3)
    ];
    assertDiff(original, modified, expected);
  });
  test("three lines changed", () => {
    const original = ["foo", "abcd", "efgh", "BAR"];
    const modified = ["foo", "zzzefgh", "xxx", "BAR"];
    const expected = [
      createLineChange(2, 3, 2, 3, [
        createCharChange(2, 1, 3, 1, 2, 1, 2, 4),
        createCharChange(3, 5, 3, 5, 2, 8, 3, 4)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("big change part 1", () => {
    const original = ["foo", "abcd", "efgh", "BAR"];
    const modified = ["hello", "foo", "zzzefgh", "xxx", "BAR"];
    const expected = [
      createLineInsertion(1, 1, 0),
      createLineChange(2, 3, 3, 4, [
        createCharChange(2, 1, 3, 1, 3, 1, 3, 4),
        createCharChange(3, 5, 3, 5, 3, 8, 4, 4)
      ])
    ];
    assertDiff(original, modified, expected);
  });
  test("big change part 2", () => {
    const original = ["foo", "abcd", "efgh", "BAR", "RAB"];
    const modified = ["hello", "foo", "zzzefgh", "xxx", "BAR"];
    const expected = [
      createLineInsertion(1, 1, 0),
      createLineChange(2, 3, 3, 4, [
        createCharChange(2, 1, 3, 1, 3, 1, 3, 4),
        createCharChange(3, 5, 3, 5, 3, 8, 4, 4)
      ]),
      createLineDeletion(5, 5, 5)
    ];
    assertDiff(original, modified, expected);
  });
  test("char change postprocessing merges", () => {
    const original = ["abba"];
    const modified = ["azzzbzzzbzzza"];
    const expected = [
      createLineChange(1, 1, 1, 1, [
        createCharChange(1, 2, 1, 4, 1, 2, 1, 13)
      ])
    ];
    assertDiff(original, modified, expected, true, true);
  });
  test("ignore trim whitespace", () => {
    const original = ["		 foo ", "abcd", "efgh", "		 BAR		"];
    const modified = ["  hello	", "	 foo   	", "zzzefgh", "xxx", "   BAR   	"];
    const expected = [
      createLineInsertion(1, 1, 0),
      createLineChange(2, 3, 3, 4, [
        createCharChange(2, 1, 2, 5, 3, 1, 3, 4),
        createCharChange(3, 5, 3, 5, 4, 1, 4, 4)
      ])
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("issue #12122 r.hasOwnProperty is not a function", () => {
    const original = ["hasOwnProperty"];
    const modified = ["hasOwnProperty", "and another line"];
    const expected = [
      createLineInsertion(2, 2, 1)
    ];
    assertDiff(original, modified, expected);
  });
  test("empty diff 1", () => {
    const original = [""];
    const modified = ["something"];
    const expected = [
      createLineChange(1, 1, 1, 1, void 0)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("empty diff 2", () => {
    const original = [""];
    const modified = ["something", "something else"];
    const expected = [
      createLineChange(1, 1, 1, 2, void 0)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("empty diff 3", () => {
    const original = ["something", "something else"];
    const modified = [""];
    const expected = [
      createLineChange(1, 2, 1, 1, void 0)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("empty diff 4", () => {
    const original = ["something"];
    const modified = [""];
    const expected = [
      createLineChange(1, 1, 1, 1, void 0)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("empty diff 5", () => {
    const original = [""];
    const modified = [""];
    const expected = [];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("pretty diff 1", () => {
    const original = [
      "suite(function () {",
      "	test1() {",
      "		assert.ok(true);",
      "	}",
      "",
      "	test2() {",
      "		assert.ok(true);",
      "	}",
      "});",
      ""
    ];
    const modified = [
      "// An insertion",
      "suite(function () {",
      "	test1() {",
      "		assert.ok(true);",
      "	}",
      "",
      "	test2() {",
      "		assert.ok(true);",
      "	}",
      "",
      "	test3() {",
      "		assert.ok(true);",
      "	}",
      "});",
      ""
    ];
    const expected = [
      createLineInsertion(1, 1, 0),
      createLineInsertion(10, 13, 8)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("pretty diff 2", () => {
    const original = [
      "// Just a comment",
      "",
      "function compute(a, b, c, d) {",
      "	if (a) {",
      "		if (b) {",
      "			if (c) {",
      "				return 5;",
      "			}",
      "		}",
      "		// These next lines will be deleted",
      "		if (d) {",
      "			return -1;",
      "		}",
      "		return 0;",
      "	}",
      "}"
    ];
    const modified = [
      "// Here is an inserted line",
      "// and another inserted line",
      "// and another one",
      "// Just a comment",
      "",
      "function compute(a, b, c, d) {",
      "	if (a) {",
      "		if (b) {",
      "			if (c) {",
      "				return 5;",
      "			}",
      "		}",
      "		return 0;",
      "	}",
      "}"
    ];
    const expected = [
      createLineInsertion(1, 3, 0),
      createLineDeletion(10, 13, 12)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("pretty diff 3", () => {
    const original = [
      "class A {",
      "	/**",
      "	 * m1",
      "	 */",
      "	method1() {}",
      "",
      "	/**",
      "	 * m3",
      "	 */",
      "	method3() {}",
      "}"
    ];
    const modified = [
      "class A {",
      "	/**",
      "	 * m1",
      "	 */",
      "	method1() {}",
      "",
      "	/**",
      "	 * m2",
      "	 */",
      "	method2() {}",
      "",
      "	/**",
      "	 * m3",
      "	 */",
      "	method3() {}",
      "}"
    ];
    const expected = [
      createLineInsertion(7, 11, 6)
    ];
    assertDiff(original, modified, expected, true, false, true);
  });
  test("issue #23636", () => {
    const original = [
      "if(!TextDrawLoad[playerid])",
      "{",
      "",
      "	TextDrawHideForPlayer(playerid,TD_AppleJob[3]);",
      "	TextDrawHideForPlayer(playerid,TD_AppleJob[4]);",
      "	if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])",
      "	{",
      "		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[5+i]);",
      "	}",
      "	else",
      "	{",
      "		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[15+i]);",
      "	}",
      "}",
      "else",
      "{",
      "	TextDrawHideForPlayer(playerid,TD_AppleJob[3]);",
      "	TextDrawHideForPlayer(playerid,TD_AppleJob[27]);",
      "	if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])",
      "	{",
      "		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[28+i]);",
      "	}",
      "	else",
      "	{",
      "		for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[38+i]);",
      "	}",
      "}"
    ];
    const modified = [
      "	if(!TextDrawLoad[playerid])",
      "	{",
      "	",
      "		TextDrawHideForPlayer(playerid,TD_AppleJob[3]);",
      "		TextDrawHideForPlayer(playerid,TD_AppleJob[4]);",
      "		if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])",
      "		{",
      "			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[5+i]);",
      "		}",
      "		else",
      "		{",
      "			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[15+i]);",
      "		}",
      "	}",
      "	else",
      "	{",
      "		TextDrawHideForPlayer(playerid,TD_AppleJob[3]);",
      "		TextDrawHideForPlayer(playerid,TD_AppleJob[27]);",
      "		if(!AppleJobTreesType[AppleJobTreesPlayerNum[playerid]])",
      "		{",
      "			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[28+i]);",
      "		}",
      "		else",
      "		{",
      "			for(new i=0;i<10;i++) if(StatusTD_AppleJobApples[playerid][i]) TextDrawHideForPlayer(playerid,TD_AppleJob[38+i]);",
      "		}",
      "	}"
    ];
    const expected = [
      createLineChange(
        1,
        27,
        1,
        27,
        [
          createCharChange(1, 1, 1, 1, 1, 1, 1, 2),
          createCharChange(2, 1, 2, 1, 2, 1, 2, 2),
          createCharChange(3, 1, 3, 1, 3, 1, 3, 2),
          createCharChange(4, 1, 4, 1, 4, 1, 4, 2),
          createCharChange(5, 1, 5, 1, 5, 1, 5, 2),
          createCharChange(6, 1, 6, 1, 6, 1, 6, 2),
          createCharChange(7, 1, 7, 1, 7, 1, 7, 2),
          createCharChange(8, 1, 8, 1, 8, 1, 8, 2),
          createCharChange(9, 1, 9, 1, 9, 1, 9, 2),
          createCharChange(10, 1, 10, 1, 10, 1, 10, 2),
          createCharChange(11, 1, 11, 1, 11, 1, 11, 2),
          createCharChange(12, 1, 12, 1, 12, 1, 12, 2),
          createCharChange(13, 1, 13, 1, 13, 1, 13, 2),
          createCharChange(14, 1, 14, 1, 14, 1, 14, 2),
          createCharChange(15, 1, 15, 1, 15, 1, 15, 2),
          createCharChange(16, 1, 16, 1, 16, 1, 16, 2),
          createCharChange(17, 1, 17, 1, 17, 1, 17, 2),
          createCharChange(18, 1, 18, 1, 18, 1, 18, 2),
          createCharChange(19, 1, 19, 1, 19, 1, 19, 2),
          createCharChange(20, 1, 20, 1, 20, 1, 20, 2),
          createCharChange(21, 1, 21, 1, 21, 1, 21, 2),
          createCharChange(22, 1, 22, 1, 22, 1, 22, 2),
          createCharChange(23, 1, 23, 1, 23, 1, 23, 2),
          createCharChange(24, 1, 24, 1, 24, 1, 24, 2),
          createCharChange(25, 1, 25, 1, 25, 1, 25, 2),
          createCharChange(26, 1, 26, 1, 26, 1, 26, 2),
          createCharChange(27, 1, 27, 1, 27, 1, 27, 2)
        ]
      )
      // createLineInsertion(7, 11, 6)
    ];
    assertDiff(original, modified, expected, true, true, false);
  });
  test("issue #43922", () => {
    const original = [
      " * `yarn [install]` -- Install project NPM dependencies. This is automatically done when you first create the project. You should only need to run this if you add dependencies in `package.json`."
    ];
    const modified = [
      " * `yarn` -- Install project NPM dependencies. You should only need to run this if you add dependencies in `package.json`."
    ];
    const expected = [
      createLineChange(
        1,
        1,
        1,
        1,
        [
          createCharChange(1, 9, 1, 19, 1, 9, 1, 9),
          createCharChange(1, 58, 1, 120, 1, 48, 1, 48)
        ]
      )
    ];
    assertDiff(original, modified, expected, true, true, false);
  });
  test("issue #42751", () => {
    const original = [
      "    1",
      "  2"
    ];
    const modified = [
      "    1",
      "   3"
    ];
    const expected = [
      createLineChange(
        2,
        2,
        2,
        2,
        [
          createCharChange(2, 3, 2, 4, 2, 3, 2, 5)
        ]
      )
    ];
    assertDiff(original, modified, expected, true, true, false);
  });
  test("does not give character changes", () => {
    const original = [
      "    1",
      "  2",
      "A"
    ];
    const modified = [
      "    1",
      "   3",
      " A"
    ];
    const expected = [
      createLineChange(
        2,
        3,
        2,
        3
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("issue #44422: Less than ideal diff results", () => {
    const original = [
      "export class C {",
      "",
      "	public m1(): void {",
      "		{",
      "		//2",
      "		//3",
      "		//4",
      "		//5",
      "		//6",
      "		//7",
      "		//8",
      "		//9",
      "		//10",
      "		//11",
      "		//12",
      "		//13",
      "		//14",
      "		//15",
      "		//16",
      "		//17",
      "		//18",
      "		}",
      "	}",
      "",
      "	public m2(): void {",
      "		if (a) {",
      "			if (b) {",
      "				//A1",
      "				//A2",
      "				//A3",
      "				//A4",
      "				//A5",
      "				//A6",
      "				//A7",
      "				//A8",
      "			}",
      "		}",
      "",
      "		//A9",
      "		//A10",
      "		//A11",
      "		//A12",
      "		//A13",
      "		//A14",
      "		//A15",
      "	}",
      "",
      "	public m3(): void {",
      "		if (a) {",
      "			//B1",
      "		}",
      "		//B2",
      "		//B3",
      "	}",
      "",
      "	public m4(): boolean {",
      "		//1",
      "		//2",
      "		//3",
      "		//4",
      "	}",
      "",
      "}"
    ];
    const modified = [
      "export class C {",
      "",
      "	constructor() {",
      "",
      "",
      "",
      "",
      "	}",
      "",
      "	public m1(): void {",
      "		{",
      "		//2",
      "		//3",
      "		//4",
      "		//5",
      "		//6",
      "		//7",
      "		//8",
      "		//9",
      "		//10",
      "		//11",
      "		//12",
      "		//13",
      "		//14",
      "		//15",
      "		//16",
      "		//17",
      "		//18",
      "		}",
      "	}",
      "",
      "	public m4(): boolean {",
      "		//1",
      "		//2",
      "		//3",
      "		//4",
      "	}",
      "",
      "}"
    ];
    const expected = [
      createLineChange(
        2,
        0,
        3,
        9
      ),
      createLineChange(
        25,
        55,
        31,
        0
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("gives preference to matching longer lines", () => {
    const original = [
      "A",
      "A",
      "BB",
      "C"
    ];
    const modified = [
      "A",
      "BB",
      "A",
      "D",
      "E",
      "A",
      "C"
    ];
    const expected = [
      createLineChange(
        2,
        2,
        1,
        0
      ),
      createLineChange(
        3,
        0,
        3,
        6
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("issue #119051: gives preference to fewer diff hunks", () => {
    const original = [
      "1",
      "",
      "",
      "2",
      ""
    ];
    const modified = [
      "1",
      "",
      "1.5",
      "",
      "",
      "2",
      "",
      "3",
      ""
    ];
    const expected = [
      createLineChange(
        2,
        0,
        3,
        4
      ),
      createLineChange(
        5,
        0,
        8,
        9
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("issue #121436: Diff chunk contains an unchanged line part 1", () => {
    const original = [
      "if (cond) {",
      "    cmd",
      "}"
    ];
    const modified = [
      "if (cond) {",
      "    if (other_cond) {",
      "        cmd",
      "    }",
      "}"
    ];
    const expected = [
      createLineChange(
        1,
        0,
        2,
        2
      ),
      createLineChange(
        2,
        0,
        4,
        4
      )
    ];
    assertDiff(original, modified, expected, false, false, true);
  });
  test("issue #121436: Diff chunk contains an unchanged line part 2", () => {
    const original = [
      "if (cond) {",
      "    cmd",
      "}"
    ];
    const modified = [
      "if (cond) {",
      "    if (other_cond) {",
      "        cmd",
      "    }",
      "}"
    ];
    const expected = [
      createLineChange(
        1,
        0,
        2,
        2
      ),
      createLineChange(
        2,
        2,
        3,
        3
      ),
      createLineChange(
        2,
        0,
        4,
        4
      )
    ];
    assertDiff(original, modified, expected, false, false, false);
  });
  test("issue #169552: Assertion error when having both leading and trailing whitespace diffs", () => {
    const original = [
      "if True:",
      "    print(2)"
    ];
    const modified = [
      "if True:",
      "	print(2) "
    ];
    const expected = [
      createLineChange(
        2,
        2,
        2,
        2,
        [
          createCharChange(2, 1, 2, 5, 2, 1, 2, 2),
          createCharChange(2, 13, 2, 13, 2, 10, 2, 11)
        ]
      )
    ];
    assertDiff(original, modified, expected, true, false, false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9kaWZmL2RpZmZDb21wdXRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERpZmZDb21wdXRlciwgSUNoYXJDaGFuZ2UsIElMaW5lQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvbGVnYWN5TGluZXNEaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuXG5mdW5jdGlvbiBhc3NlcnREaWZmKG9yaWdpbmFsTGluZXM6IHN0cmluZ1tdLCBtb2RpZmllZExpbmVzOiBzdHJpbmdbXSwgZXhwZWN0ZWRDaGFuZ2VzOiBJTGluZUNoYW5nZVtdLCBzaG91bGRDb21wdXRlQ2hhckNoYW5nZXM6IGJvb2xlYW4gPSB0cnVlLCBzaG91bGRQb3N0UHJvY2Vzc0NoYXJDaGFuZ2VzOiBib29sZWFuID0gZmFsc2UsIHNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlOiBib29sZWFuID0gZmFsc2UpIHtcblx0Y29uc3QgZGlmZkNvbXB1dGVyID0gbmV3IERpZmZDb21wdXRlcihvcmlnaW5hbExpbmVzLCBtb2RpZmllZExpbmVzLCB7XG5cdFx0c2hvdWxkQ29tcHV0ZUNoYXJDaGFuZ2VzLFxuXHRcdHNob3VsZFBvc3RQcm9jZXNzQ2hhckNoYW5nZXMsXG5cdFx0c2hvdWxkSWdub3JlVHJpbVdoaXRlc3BhY2UsXG5cdFx0c2hvdWxkTWFrZVByZXR0eURpZmY6IHRydWUsXG5cdFx0bWF4Q29tcHV0YXRpb25UaW1lOiAwXG5cdH0pO1xuXHRjb25zdCBjaGFuZ2VzID0gZGlmZkNvbXB1dGVyLmNvbXB1dGVEaWZmKCkuY2hhbmdlcztcblxuXHRjb25zdCBtYXBDaGFyQ2hhbmdlID0gKGNoYXJDaGFuZ2U6IElDaGFyQ2hhbmdlKSA9PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBjaGFyQ2hhbmdlLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0b3JpZ2luYWxTdGFydENvbHVtbjogY2hhckNoYW5nZS5vcmlnaW5hbFN0YXJ0Q29sdW1uLFxuXHRcdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBjaGFyQ2hhbmdlLm9yaWdpbmFsRW5kTGluZU51bWJlcixcblx0XHRcdG9yaWdpbmFsRW5kQ29sdW1uOiBjaGFyQ2hhbmdlLm9yaWdpbmFsRW5kQ29sdW1uLFxuXHRcdFx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IGNoYXJDaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXIsXG5cdFx0XHRtb2RpZmllZFN0YXJ0Q29sdW1uOiBjaGFyQ2hhbmdlLm1vZGlmaWVkU3RhcnRDb2x1bW4sXG5cdFx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXI6IGNoYXJDaGFuZ2UubW9kaWZpZWRFbmRMaW5lTnVtYmVyLFxuXHRcdFx0bW9kaWZpZWRFbmRDb2x1bW46IGNoYXJDaGFuZ2UubW9kaWZpZWRFbmRDb2x1bW4sXG5cdFx0fTtcblx0fTtcblxuXHRjb25zdCBhY3R1YWwgPSBjaGFuZ2VzLm1hcCgobGluZUNoYW5nZSkgPT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogbGluZUNoYW5nZS5vcmlnaW5hbFN0YXJ0TGluZU51bWJlcixcblx0XHRcdG9yaWdpbmFsRW5kTGluZU51bWJlcjogbGluZUNoYW5nZS5vcmlnaW5hbEVuZExpbmVOdW1iZXIsXG5cdFx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogbGluZUNoYW5nZS5tb2RpZmllZFN0YXJ0TGluZU51bWJlcixcblx0XHRcdG1vZGlmaWVkRW5kTGluZU51bWJlcjogbGluZUNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIsXG5cdFx0XHRjaGFyQ2hhbmdlczogKGxpbmVDaGFuZ2UuY2hhckNoYW5nZXMgPyBsaW5lQ2hhbmdlLmNoYXJDaGFuZ2VzLm1hcChtYXBDaGFyQ2hhbmdlKSA6IHVuZGVmaW5lZClcblx0XHR9O1xuXHR9KTtcblxuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWRDaGFuZ2VzKTtcblxuXHRpZiAoIXNob3VsZElnbm9yZVRyaW1XaGl0ZXNwYWNlKSB7XG5cdFx0Ly8gVGhlIGRpZmZzIHNob3VsZCBkZXNjcmliZSBob3cgdG8gYXBwbHkgZWRpdHMgdG8gdGhlIG9yaWdpbmFsIHRleHQgbW9kZWwgdG8gZ2V0IHRvIHRoZSBtb2RpZmllZCB0ZXh0IG1vZGVsLlxuXG5cdFx0Y29uc3QgbW9kaWZpZWRUZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwobW9kaWZpZWRMaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRWYWx1ZSA9IG1vZGlmaWVkVGV4dE1vZGVsLmdldFZhbHVlKCk7XG5cblx0XHR7XG5cdFx0XHQvLyBMaW5lIGNoYW5nZXM6XG5cdFx0XHRjb25zdCBvcmlnaW5hbFRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChvcmlnaW5hbExpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHRcdG9yaWdpbmFsVGV4dE1vZGVsLmFwcGx5RWRpdHMoY2hhbmdlcy5tYXAoYyA9PiBnZXRMaW5lRWRpdChjLCBtb2RpZmllZFRleHRNb2RlbCkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3JpZ2luYWxUZXh0TW9kZWwuZ2V0VmFsdWUoKSwgZXhwZWN0ZWRWYWx1ZSk7XG5cdFx0XHRvcmlnaW5hbFRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHNob3VsZENvbXB1dGVDaGFyQ2hhbmdlcykge1xuXHRcdFx0Ly8gQ2hhciBjaGFuZ2VzOlxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxUZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwob3JpZ2luYWxMaW5lcy5qb2luKCdcXG4nKSk7XG5cdFx0XHRvcmlnaW5hbFRleHRNb2RlbC5hcHBseUVkaXRzKGNoYW5nZXMuZmxhdE1hcChjID0+IGdldENoYXJFZGl0cyhjLCBtb2RpZmllZFRleHRNb2RlbCkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3JpZ2luYWxUZXh0TW9kZWwuZ2V0VmFsdWUoKSwgZXhwZWN0ZWRWYWx1ZSk7XG5cdFx0XHRvcmlnaW5hbFRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0bW9kaWZpZWRUZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldENoYXJFZGl0cyhsaW5lQ2hhbmdlOiBJTGluZUNoYW5nZSwgbW9kaWZpZWRUZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSB7XG5cdGlmICghbGluZUNoYW5nZS5jaGFyQ2hhbmdlcykge1xuXHRcdHJldHVybiBbZ2V0TGluZUVkaXQobGluZUNoYW5nZSwgbW9kaWZpZWRUZXh0TW9kZWwpXTtcblx0fVxuXHRyZXR1cm4gbGluZUNoYW5nZS5jaGFyQ2hhbmdlcy5tYXAoYyA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxSYW5nZSA9IG5ldyBSYW5nZShjLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyLCBjLm9yaWdpbmFsU3RhcnRDb2x1bW4sIGMub3JpZ2luYWxFbmRMaW5lTnVtYmVyLCBjLm9yaWdpbmFsRW5kQ29sdW1uKTtcblx0XHRjb25zdCBtb2RpZmllZFJhbmdlID0gbmV3IFJhbmdlKGMubW9kaWZpZWRTdGFydExpbmVOdW1iZXIsIGMubW9kaWZpZWRTdGFydENvbHVtbiwgYy5tb2RpZmllZEVuZExpbmVOdW1iZXIsIGMubW9kaWZpZWRFbmRDb2x1bW4pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogb3JpZ2luYWxSYW5nZSxcblx0XHRcdHRleHQ6IG1vZGlmaWVkVGV4dE1vZGVsLmdldFZhbHVlSW5SYW5nZShtb2RpZmllZFJhbmdlKVxuXHRcdH07XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBnZXRMaW5lRWRpdChsaW5lQ2hhbmdlOiBJTGluZUNoYW5nZSwgbW9kaWZpZWRUZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb24ge1xuXHRsZXQgb3JpZ2luYWxSYW5nZTogTGluZVJhbmdlO1xuXHRpZiAobGluZUNoYW5nZS5vcmlnaW5hbEVuZExpbmVOdW1iZXIgPT09IDApIHtcblx0XHQvLyBJbnNlcnRpb25cblx0XHRvcmlnaW5hbFJhbmdlID0gbmV3IExpbmVSYW5nZShsaW5lQ2hhbmdlLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyICsgMSwgMCk7XG5cdH0gZWxzZSB7XG5cdFx0b3JpZ2luYWxSYW5nZSA9IG5ldyBMaW5lUmFuZ2UobGluZUNoYW5nZS5vcmlnaW5hbFN0YXJ0TGluZU51bWJlciwgbGluZUNoYW5nZS5vcmlnaW5hbEVuZExpbmVOdW1iZXIgLSBsaW5lQ2hhbmdlLm9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyICsgMSk7XG5cdH1cblxuXHRsZXQgbW9kaWZpZWRSYW5nZTogTGluZVJhbmdlO1xuXHRpZiAobGluZUNoYW5nZS5tb2RpZmllZEVuZExpbmVOdW1iZXIgPT09IDApIHtcblx0XHQvLyBEZWxldGlvblxuXHRcdG1vZGlmaWVkUmFuZ2UgPSBuZXcgTGluZVJhbmdlKGxpbmVDaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXIgKyAxLCAwKTtcblx0fSBlbHNlIHtcblx0XHRtb2RpZmllZFJhbmdlID0gbmV3IExpbmVSYW5nZShsaW5lQ2hhbmdlLm1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyLCBsaW5lQ2hhbmdlLm1vZGlmaWVkRW5kTGluZU51bWJlciAtIGxpbmVDaGFuZ2UubW9kaWZpZWRTdGFydExpbmVOdW1iZXIgKyAxKTtcblx0fVxuXG5cdGNvbnN0IFtyMSwgcjJdID0gZGlmZkZyb21MaW5lUmFuZ2VzKG9yaWdpbmFsUmFuZ2UsIG1vZGlmaWVkUmFuZ2UpO1xuXHRyZXR1cm4ge1xuXHRcdHJhbmdlOiByMSxcblx0XHR0ZXh0OiBtb2RpZmllZFRleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2UocjIpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBkaWZmRnJvbUxpbmVSYW5nZXMob3JpZ2luYWxSYW5nZTogTGluZVJhbmdlLCBtb2RpZmllZFJhbmdlOiBMaW5lUmFuZ2UpOiBbUmFuZ2UsIFJhbmdlXSB7XG5cdGlmIChvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gMSB8fCBtb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gMSkge1xuXHRcdGlmICghb3JpZ2luYWxSYW5nZS5pc0VtcHR5ICYmICFtb2RpZmllZFJhbmdlLmlzRW1wdHkpIHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdG5ldyBSYW5nZShcblx0XHRcdFx0XHRvcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHQxLFxuXHRcdFx0XHRcdG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEsXG5cdFx0XHRcdFx0Q29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0XHRcdCksXG5cdFx0XHRcdG5ldyBSYW5nZShcblx0XHRcdFx0XHRtb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHQxLFxuXHRcdFx0XHRcdG1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEsXG5cdFx0XHRcdFx0Q29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0XHRcdClcblx0XHRcdF07XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBvbmUgb2YgdGhlbSBpcyBvbmUgYW5kIG9uZSBvZiB0aGVtIGlzIGVtcHR5LCB0aGUgb3RoZXIgY2Fubm90IGJlIHRoZSBsYXN0IGxpbmUgb2YgdGhlIGRvY3VtZW50XG5cdFx0cmV0dXJuIFtcblx0XHRcdG5ldyBSYW5nZShcblx0XHRcdFx0b3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdDEsXG5cdFx0XHRcdG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSxcblx0XHRcdFx0MSxcblx0XHRcdCksXG5cdFx0XHRuZXcgUmFuZ2UoXG5cdFx0XHRcdG1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHQxLFxuXHRcdFx0XHRtb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsXG5cdFx0XHRcdDEsXG5cdFx0XHQpXG5cdFx0XTtcblx0fVxuXG5cdHJldHVybiBbXG5cdFx0bmV3IFJhbmdlKFxuXHRcdFx0b3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIgLSAxLFxuXHRcdFx0Q29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0XHRvcmlnaW5hbFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxLFxuXHRcdFx0Q29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0KSxcblx0XHRuZXcgUmFuZ2UoXG5cdFx0XHRtb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsXG5cdFx0XHRDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHRcdG1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEsXG5cdFx0XHRDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHQpXG5cdF07XG59XG5cbmNsYXNzIExpbmVSYW5nZSB7XG5cdHB1YmxpYyBjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVDb3VudDogbnVtYmVyXG5cdCkgeyB9XG5cblx0cHVibGljIGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmxpbmVDb3VudCA9PT0gMDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZW5kTGluZU51bWJlckV4Y2x1c2l2ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnN0YXJ0TGluZU51bWJlciArIHRoaXMubGluZUNvdW50O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpbmVEZWxldGlvbihzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBtb2RpZmllZExpbmVOdW1iZXI6IG51bWJlcik6IElMaW5lQ2hhbmdlIHtcblx0cmV0dXJuIHtcblx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLFxuXHRcdG9yaWdpbmFsRW5kTGluZU51bWJlcjogZW5kTGluZU51bWJlcixcblx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogbW9kaWZpZWRMaW5lTnVtYmVyLFxuXHRcdG1vZGlmaWVkRW5kTGluZU51bWJlcjogMCxcblx0XHRjaGFyQ2hhbmdlczogdW5kZWZpbmVkXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpbmVJbnNlcnRpb24oc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgb3JpZ2luYWxMaW5lTnVtYmVyOiBudW1iZXIpOiBJTGluZUNoYW5nZSB7XG5cdHJldHVybiB7XG5cdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG9yaWdpbmFsTGluZU51bWJlcixcblx0XHRvcmlnaW5hbEVuZExpbmVOdW1iZXI6IDAsXG5cdFx0bW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IHN0YXJ0TGluZU51bWJlcixcblx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXI6IGVuZExpbmVOdW1iZXIsXG5cdFx0Y2hhckNoYW5nZXM6IHVuZGVmaW5lZFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaW5lQ2hhbmdlKG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIG9yaWdpbmFsRW5kTGluZU51bWJlcjogbnVtYmVyLCBtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBtb2RpZmllZEVuZExpbmVOdW1iZXI6IG51bWJlciwgY2hhckNoYW5nZXM/OiBJQ2hhckNoYW5nZVtdKTogSUxpbmVDaGFuZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBvcmlnaW5hbFN0YXJ0TGluZU51bWJlcixcblx0XHRvcmlnaW5hbEVuZExpbmVOdW1iZXI6IG9yaWdpbmFsRW5kTGluZU51bWJlcixcblx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogbW9kaWZpZWRTdGFydExpbmVOdW1iZXIsXG5cdFx0bW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBtb2RpZmllZEVuZExpbmVOdW1iZXIsXG5cdFx0Y2hhckNoYW5nZXM6IGNoYXJDaGFuZ2VzXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNoYXJDaGFuZ2UoXG5cdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIG9yaWdpbmFsU3RhcnRDb2x1bW46IG51bWJlciwgb3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBudW1iZXIsIG9yaWdpbmFsRW5kQ29sdW1uOiBudW1iZXIsXG5cdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIG1vZGlmaWVkU3RhcnRDb2x1bW46IG51bWJlciwgbW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBudW1iZXIsIG1vZGlmaWVkRW5kQ29sdW1uOiBudW1iZXJcbikge1xuXHRyZXR1cm4ge1xuXHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyOiBvcmlnaW5hbFN0YXJ0TGluZU51bWJlcixcblx0XHRvcmlnaW5hbFN0YXJ0Q29sdW1uOiBvcmlnaW5hbFN0YXJ0Q29sdW1uLFxuXHRcdG9yaWdpbmFsRW5kTGluZU51bWJlcjogb3JpZ2luYWxFbmRMaW5lTnVtYmVyLFxuXHRcdG9yaWdpbmFsRW5kQ29sdW1uOiBvcmlnaW5hbEVuZENvbHVtbixcblx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlcjogbW9kaWZpZWRTdGFydExpbmVOdW1iZXIsXG5cdFx0bW9kaWZpZWRTdGFydENvbHVtbjogbW9kaWZpZWRTdGFydENvbHVtbixcblx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXI6IG1vZGlmaWVkRW5kTGluZU51bWJlcixcblx0XHRtb2RpZmllZEVuZENvbHVtbjogbW9kaWZpZWRFbmRDb2x1bW5cblx0fTtcbn1cblxuc3VpdGUoJ0VkaXRvciBEaWZmIC0gRGlmZkNvbXB1dGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLS0gaW5zZXJ0aW9uc1xuXG5cdHRlc3QoJ29uZSBpbnNlcnRlZCBsaW5lIGJlbG93JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydsaW5lJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2xpbmUnLCAnbmV3IGxpbmUnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lSW5zZXJ0aW9uKDIsIDIsIDEpXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gaW5zZXJ0ZWQgbGluZXMgYmVsb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbGluZScsICduZXcgbGluZScsICdhbm90aGVyIG5ldyBsaW5lJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbY3JlYXRlTGluZUluc2VydGlvbigyLCAzLCAxKV07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnb25lIGluc2VydGVkIGxpbmUgYWJvdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbmV3IGxpbmUnLCAnbGluZSddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2NyZWF0ZUxpbmVJbnNlcnRpb24oMSwgMSwgMCldO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBpbnNlcnRlZCBsaW5lcyBhYm92ZScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWyduZXcgbGluZScsICdhbm90aGVyIG5ldyBsaW5lJywgJ2xpbmUnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lSW5zZXJ0aW9uKDEsIDIsIDApXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmUgaW5zZXJ0ZWQgbGluZSBpbiBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUxJywgJ2xpbmUyJywgJ2xpbmUzJywgJ2xpbmU0J107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2xpbmUxJywgJ2xpbmUyJywgJ25ldyBsaW5lJywgJ2xpbmUzJywgJ2xpbmU0J107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbY3JlYXRlTGluZUluc2VydGlvbigzLCAzLCAyKV07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndHdvIGluc2VydGVkIGxpbmVzIGluIG1pZGRsZScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZTEnLCAnbGluZTInLCAnbGluZTMnLCAnbGluZTQnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbGluZTEnLCAnbGluZTInLCAnbmV3IGxpbmUnLCAnYW5vdGhlciBuZXcgbGluZScsICdsaW5lMycsICdsaW5lNCddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2NyZWF0ZUxpbmVJbnNlcnRpb24oMywgNCwgMildO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBpbnNlcnRlZCBsaW5lcyBpbiBtaWRkbGUgaW50ZXJydXB0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUxJywgJ2xpbmUyJywgJ2xpbmUzJywgJ2xpbmU0J107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2xpbmUxJywgJ2xpbmUyJywgJ25ldyBsaW5lJywgJ2xpbmUzJywgJ2Fub3RoZXIgbmV3IGxpbmUnLCAnbGluZTQnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lSW5zZXJ0aW9uKDMsIDMsIDIpLCBjcmVhdGVMaW5lSW5zZXJ0aW9uKDUsIDUsIDMpXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHQvLyAtLS0tIGRlbGV0aW9uc1xuXG5cdHRlc3QoJ29uZSBkZWxldGVkIGxpbmUgYmVsb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUnLCAnbmV3IGxpbmUnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbGluZSddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2NyZWF0ZUxpbmVEZWxldGlvbigyLCAyLCAxKV07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndHdvIGRlbGV0ZWQgbGluZXMgYmVsb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUnLCAnbmV3IGxpbmUnLCAnYW5vdGhlciBuZXcgbGluZSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydsaW5lJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbY3JlYXRlTGluZURlbGV0aW9uKDIsIDMsIDEpXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmUgZGVsZXRlZCBsaW5lcyBhYm92ZScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbmV3IGxpbmUnLCAnbGluZSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydsaW5lJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbY3JlYXRlTGluZURlbGV0aW9uKDEsIDEsIDApXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gZGVsZXRlZCBsaW5lcyBhYm92ZScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbmV3IGxpbmUnLCAnYW5vdGhlciBuZXcgbGluZScsICdsaW5lJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2xpbmUnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lRGVsZXRpb24oMSwgMiwgMCldO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZSBkZWxldGVkIGxpbmUgaW4gbWlkZGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydsaW5lMScsICdsaW5lMicsICduZXcgbGluZScsICdsaW5lMycsICdsaW5lNCddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydsaW5lMScsICdsaW5lMicsICdsaW5lMycsICdsaW5lNCddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW2NyZWF0ZUxpbmVEZWxldGlvbigzLCAzLCAyKV07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndHdvIGRlbGV0ZWQgbGluZXMgaW4gbWlkZGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydsaW5lMScsICdsaW5lMicsICduZXcgbGluZScsICdhbm90aGVyIG5ldyBsaW5lJywgJ2xpbmUzJywgJ2xpbmU0J107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2xpbmUxJywgJ2xpbmUyJywgJ2xpbmUzJywgJ2xpbmU0J107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbY3JlYXRlTGluZURlbGV0aW9uKDMsIDQsIDIpXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gZGVsZXRlZCBsaW5lcyBpbiBtaWRkbGUgaW50ZXJydXB0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUxJywgJ2xpbmUyJywgJ25ldyBsaW5lJywgJ2xpbmUzJywgJ2Fub3RoZXIgbmV3IGxpbmUnLCAnbGluZTQnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbGluZTEnLCAnbGluZTInLCAnbGluZTMnLCAnbGluZTQnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtjcmVhdGVMaW5lRGVsZXRpb24oMywgMywgMiksIGNyZWF0ZUxpbmVEZWxldGlvbig1LCA1LCAzKV07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBjaGFuZ2VzXG5cblx0dGVzdCgnb25lIGxpbmUgY2hhbmdlZDogY2hhcnMgaW5zZXJ0ZWQgYXQgdGhlIGVuZCcsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnbGluZSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydsaW5lIGNoYW5nZWQnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMSwgMSwgMSwgMSwgW1xuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDUsIDEsIDUsIDEsIDUsIDEsIDEzKVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZSBsaW5lIGNoYW5nZWQ6IGNoYXJzIGluc2VydGVkIGF0IHRoZSBiZWdpbm5pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2xpbmUnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnbXkgbGluZSddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAxLCAxLCAxLCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgMSwgMSwgMSwgMSwgMSwgMSwgNClcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmUgbGluZSBjaGFuZ2VkOiBjaGFycyBpbnNlcnRlZCBpbiB0aGUgbWlkZGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydhYmJhJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2FienpiYSddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAxLCAxLCAxLCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgMywgMSwgMywgMSwgMywgMSwgNSlcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmUgbGluZSBjaGFuZ2VkOiBjaGFycyBpbnNlcnRlZCBpbiB0aGUgbWlkZGxlICh0d28gc3BvdHMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydhYmJhJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2FienpienphJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDEsIDEsIDEsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCAzLCAxLCAzLCAxLCAzLCAxLCA1KSxcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCA0LCAxLCA0LCAxLCA2LCAxLCA4KVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uZSBsaW5lIGNoYW5nZWQ6IGNoYXJzIGRlbGV0ZWQgMScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnYWJjZGVmZyddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydhYmNmZyddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAxLCAxLCAxLCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgNCwgMSwgNiwgMSwgNCwgMSwgNClcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmUgbGluZSBjaGFuZ2VkOiBjaGFycyBkZWxldGVkIDInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2FiY2RlZmcnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnYWNmZyddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAxLCAxLCAxLCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgMiwgMSwgMywgMSwgMiwgMSwgMiksXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgNCwgMSwgNiwgMSwgMywgMSwgMylcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gbGluZXMgY2hhbmdlZCAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydhYmNkJywgJ2VmZ2gnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnYWJjeiddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAyLCAxLCAxLCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMSwgNCwgMiwgNSwgMSwgNCwgMSwgNSlcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gbGluZXMgY2hhbmdlZCAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydmb28nLCAnYWJjZCcsICdlZmdoJywgJ0JBUiddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydmb28nLCAnYWJjeicsICdCQVInXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMiwgMywgMiwgMiwgW1xuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIsIDQsIDMsIDUsIDIsIDQsIDIsIDUpXG5cdFx0XHRdKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgndHdvIGxpbmVzIGNoYW5nZWQgMycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnZm9vJywgJ2FiY2QnLCAnZWZnaCcsICdCQVInXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnZm9vJywgJ2FiY3onLCAnenp6emVmZ2gnLCAnQkFSJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDIsIDMsIDIsIDMsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgyLCA0LCAyLCA1LCAyLCA0LCAyLCA1KSxcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgzLCAxLCAzLCAxLCAzLCAxLCAzLCA1KVxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBsaW5lcyBjaGFuZ2VkIDQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2FiYyddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWycnLCAnJywgJ2F4YycsICcnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMSwgMSwgMSwgNCwgW1xuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDEsIDEsIDEsIDEsIDEsIDMsIDEpLFxuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDIsIDEsIDMsIDMsIDIsIDMsIDMpLFxuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDQsIDEsIDQsIDMsIDQsIDQsIDEpXG5cdFx0XHRdKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgb3JpZ2luYWwgc2VxdWVuY2UgaW4gY2hhciBkaWZmJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydhYmMnLCAnJywgJ3h5eiddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydhYmMnLCAncXdlJywgJ3J0eScsICd4eXonXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMiwgMiwgMiwgMylcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RocmVlIGxpbmVzIGNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2ZvbycsICdhYmNkJywgJ2VmZ2gnLCAnQkFSJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2ZvbycsICd6enplZmdoJywgJ3h4eCcsICdCQVInXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMiwgMywgMiwgMywgW1xuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIsIDEsIDMsIDEsIDIsIDEsIDIsIDQpLFxuXHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDMsIDUsIDMsIDUsIDIsIDgsIDMsIDQpLFxuXHRcdFx0XSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JpZyBjaGFuZ2UgcGFydCAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydmb28nLCAnYWJjZCcsICdlZmdoJywgJ0JBUiddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydoZWxsbycsICdmb28nLCAnenp6ZWZnaCcsICd4eHgnLCAnQkFSJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lSW5zZXJ0aW9uKDEsIDEsIDApLFxuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgyLCAzLCAzLCA0LCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMiwgMSwgMywgMSwgMywgMSwgMywgNCksXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMywgNSwgMywgNSwgMywgOCwgNCwgNClcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdiaWcgY2hhbmdlIHBhcnQgMicsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnZm9vJywgJ2FiY2QnLCAnZWZnaCcsICdCQVInLCAnUkFCJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2hlbGxvJywgJ2ZvbycsICd6enplZmdoJywgJ3h4eCcsICdCQVInXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVJbnNlcnRpb24oMSwgMSwgMCksXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDIsIDMsIDMsIDQsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgyLCAxLCAzLCAxLCAzLCAxLCAzLCA0KSxcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgzLCA1LCAzLCA1LCAzLCA4LCA0LCA0KVxuXHRcdFx0XSksXG5cdFx0XHRjcmVhdGVMaW5lRGVsZXRpb24oNSwgNSwgNSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYXIgY2hhbmdlIHBvc3Rwcm9jZXNzaW5nIG1lcmdlcycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnYWJiYSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWydhenp6Ynp6emJ6enphJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDEsIDEsIDEsIFtcblx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCAyLCAxLCA0LCAxLCAyLCAxLCAxMylcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmUgdHJpbSB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWydcXHRcXHQgZm9vICcsICdhYmNkJywgJ2VmZ2gnLCAnXFx0XFx0IEJBUlxcdFxcdCddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWycgIGhlbGxvXFx0JywgJ1xcdCBmb28gICBcXHQnLCAnenp6ZWZnaCcsICd4eHgnLCAnICAgQkFSICAgXFx0J107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lSW5zZXJ0aW9uKDEsIDEsIDApLFxuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgyLCAzLCAzLCA0LCBbXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMiwgMSwgMiwgNSwgMywgMSwgMywgNCksXG5cdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMywgNSwgMywgNSwgNCwgMSwgNCwgNClcblx0XHRcdF0pXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyMTIyIHIuaGFzT3duUHJvcGVydHkgaXMgbm90IGEgZnVuY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ2hhc093blByb3BlcnR5J107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ2hhc093blByb3BlcnR5JywgJ2FuZCBhbm90aGVyIGxpbmUnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVJbnNlcnRpb24oMiwgMiwgMSlcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGRpZmYgMScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJ3NvbWV0aGluZyddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAxLCAxLCAxLCB1bmRlZmluZWQpXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgZGlmZiAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWycnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnc29tZXRoaW5nJywgJ3NvbWV0aGluZyBlbHNlJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKDEsIDEsIDEsIDIsIHVuZGVmaW5lZClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgZmFsc2UsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBkaWZmIDMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbJ3NvbWV0aGluZycsICdzb21ldGhpbmcgZWxzZSddO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gWycnXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoMSwgMiwgMSwgMSwgdW5kZWZpbmVkKVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGRpZmYgNCcsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFsnc29tZXRoaW5nJ107XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbJyddO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZSgxLCAxLCAxLCAxLCB1bmRlZmluZWQpXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgZGlmZiA1JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gWycnXTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFsnJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IElMaW5lQ2hhbmdlW10gPSBbXTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncHJldHR5IGRpZmYgMScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFtcblx0XHRcdCdzdWl0ZShmdW5jdGlvbiAoKSB7Jyxcblx0XHRcdCdcdHRlc3QxKCkgeycsXG5cdFx0XHQnXHRcdGFzc2VydC5vayh0cnVlKTsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnJyxcblx0XHRcdCdcdHRlc3QyKCkgeycsXG5cdFx0XHQnXHRcdGFzc2VydC5vayh0cnVlKTsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnfSk7Jyxcblx0XHRcdCcnLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnLy8gQW4gaW5zZXJ0aW9uJyxcblx0XHRcdCdzdWl0ZShmdW5jdGlvbiAoKSB7Jyxcblx0XHRcdCdcdHRlc3QxKCkgeycsXG5cdFx0XHQnXHRcdGFzc2VydC5vayh0cnVlKTsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnJyxcblx0XHRcdCdcdHRlc3QyKCkgeycsXG5cdFx0XHQnXHRcdGFzc2VydC5vayh0cnVlKTsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnJyxcblx0XHRcdCdcdHRlc3QzKCkgeycsXG5cdFx0XHQnXHRcdGFzc2VydC5vayh0cnVlKTsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnfSk7Jyxcblx0XHRcdCcnLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lSW5zZXJ0aW9uKDEsIDEsIDApLFxuXHRcdFx0Y3JlYXRlTGluZUluc2VydGlvbigxMCwgMTMsIDgpXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncHJldHR5IGRpZmYgMicsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFtcblx0XHRcdCcvLyBKdXN0IGEgY29tbWVudCcsXG5cdFx0XHQnJyxcblx0XHRcdCdmdW5jdGlvbiBjb21wdXRlKGEsIGIsIGMsIGQpIHsnLFxuXHRcdFx0J1x0aWYgKGEpIHsnLFxuXHRcdFx0J1x0XHRpZiAoYikgeycsXG5cdFx0XHQnXHRcdFx0aWYgKGMpIHsnLFxuXHRcdFx0J1x0XHRcdFx0cmV0dXJuIDU7Jyxcblx0XHRcdCdcdFx0XHR9Jyxcblx0XHRcdCdcdFx0fScsXG5cdFx0XHQnXHRcdC8vIFRoZXNlIG5leHQgbGluZXMgd2lsbCBiZSBkZWxldGVkJyxcblx0XHRcdCdcdFx0aWYgKGQpIHsnLFxuXHRcdFx0J1x0XHRcdHJldHVybiAtMTsnLFxuXHRcdFx0J1x0XHR9Jyxcblx0XHRcdCdcdFx0cmV0dXJuIDA7Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0J30nLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnLy8gSGVyZSBpcyBhbiBpbnNlcnRlZCBsaW5lJyxcblx0XHRcdCcvLyBhbmQgYW5vdGhlciBpbnNlcnRlZCBsaW5lJyxcblx0XHRcdCcvLyBhbmQgYW5vdGhlciBvbmUnLFxuXHRcdFx0Jy8vIEp1c3QgYSBjb21tZW50Jyxcblx0XHRcdCcnLFxuXHRcdFx0J2Z1bmN0aW9uIGNvbXB1dGUoYSwgYiwgYywgZCkgeycsXG5cdFx0XHQnXHRpZiAoYSkgeycsXG5cdFx0XHQnXHRcdGlmIChiKSB7Jyxcblx0XHRcdCdcdFx0XHRpZiAoYykgeycsXG5cdFx0XHQnXHRcdFx0XHRyZXR1cm4gNTsnLFxuXHRcdFx0J1x0XHRcdH0nLFxuXHRcdFx0J1x0XHR9Jyxcblx0XHRcdCdcdFx0cmV0dXJuIDA7Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0J30nLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lSW5zZXJ0aW9uKDEsIDMsIDApLFxuXHRcdFx0Y3JlYXRlTGluZURlbGV0aW9uKDEwLCAxMywgMTIpLFxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCB0cnVlLCBmYWxzZSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXR0eSBkaWZmIDMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbXG5cdFx0XHQnY2xhc3MgQSB7Jyxcblx0XHRcdCdcdC8qKicsXG5cdFx0XHQnXHQgKiBtMScsXG5cdFx0XHQnXHQgKi8nLFxuXHRcdFx0J1x0bWV0aG9kMSgpIHt9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0LyoqJyxcblx0XHRcdCdcdCAqIG0zJyxcblx0XHRcdCdcdCAqLycsXG5cdFx0XHQnXHRtZXRob2QzKCkge30nLFxuXHRcdFx0J30nLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnY2xhc3MgQSB7Jyxcblx0XHRcdCdcdC8qKicsXG5cdFx0XHQnXHQgKiBtMScsXG5cdFx0XHQnXHQgKi8nLFxuXHRcdFx0J1x0bWV0aG9kMSgpIHt9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0LyoqJyxcblx0XHRcdCdcdCAqIG0yJyxcblx0XHRcdCdcdCAqLycsXG5cdFx0XHQnXHRtZXRob2QyKCkge30nLFxuXHRcdFx0JycsXG5cdFx0XHQnXHQvKionLFxuXHRcdFx0J1x0ICogbTMnLFxuXHRcdFx0J1x0ICovJyxcblx0XHRcdCdcdG1ldGhvZDMoKSB7fScsXG5cdFx0XHQnfScsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVJbnNlcnRpb24oNywgMTEsIDYpXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIzNjM2JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gW1xuXHRcdFx0J2lmKCFUZXh0RHJhd0xvYWRbcGxheWVyaWRdKScsXG5cdFx0XHQneycsXG5cdFx0XHQnJyxcblx0XHRcdCdcdFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYlszXSk7Jyxcblx0XHRcdCdcdFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYls0XSk7Jyxcblx0XHRcdCdcdGlmKCFBcHBsZUpvYlRyZWVzVHlwZVtBcHBsZUpvYlRyZWVzUGxheWVyTnVtW3BsYXllcmlkXV0pJyxcblx0XHRcdCdcdHsnLFxuXHRcdFx0J1x0XHRmb3IobmV3IGk9MDtpPDEwO2krKykgaWYoU3RhdHVzVERfQXBwbGVKb2JBcHBsZXNbcGxheWVyaWRdW2ldKSBUZXh0RHJhd0hpZGVGb3JQbGF5ZXIocGxheWVyaWQsVERfQXBwbGVKb2JbNStpXSk7Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0J1x0ZWxzZScsXG5cdFx0XHQnXHR7Jyxcblx0XHRcdCdcdFx0Zm9yKG5ldyBpPTA7aTwxMDtpKyspIGlmKFN0YXR1c1REX0FwcGxlSm9iQXBwbGVzW3BsYXllcmlkXVtpXSkgVGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzE1K2ldKTsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnfScsXG5cdFx0XHQnZWxzZScsXG5cdFx0XHQneycsXG5cdFx0XHQnXHRUZXh0RHJhd0hpZGVGb3JQbGF5ZXIocGxheWVyaWQsVERfQXBwbGVKb2JbM10pOycsXG5cdFx0XHQnXHRUZXh0RHJhd0hpZGVGb3JQbGF5ZXIocGxheWVyaWQsVERfQXBwbGVKb2JbMjddKTsnLFxuXHRcdFx0J1x0aWYoIUFwcGxlSm9iVHJlZXNUeXBlW0FwcGxlSm9iVHJlZXNQbGF5ZXJOdW1bcGxheWVyaWRdXSknLFxuXHRcdFx0J1x0eycsXG5cdFx0XHQnXHRcdGZvcihuZXcgaT0wO2k8MTA7aSsrKSBpZihTdGF0dXNURF9BcHBsZUpvYkFwcGxlc1twbGF5ZXJpZF1baV0pIFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYlsyOCtpXSk7Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0J1x0ZWxzZScsXG5cdFx0XHQnXHR7Jyxcblx0XHRcdCdcdFx0Zm9yKG5ldyBpPTA7aTwxMDtpKyspIGlmKFN0YXR1c1REX0FwcGxlSm9iQXBwbGVzW3BsYXllcmlkXVtpXSkgVGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzM4K2ldKTsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnfScsXG5cdFx0XTtcblx0XHRjb25zdCBtb2RpZmllZCA9IFtcblx0XHRcdCdcdGlmKCFUZXh0RHJhd0xvYWRbcGxheWVyaWRdKScsXG5cdFx0XHQnXHR7Jyxcblx0XHRcdCdcdCcsXG5cdFx0XHQnXHRcdFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYlszXSk7Jyxcblx0XHRcdCdcdFx0VGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzRdKTsnLFxuXHRcdFx0J1x0XHRpZighQXBwbGVKb2JUcmVlc1R5cGVbQXBwbGVKb2JUcmVlc1BsYXllck51bVtwbGF5ZXJpZF1dKScsXG5cdFx0XHQnXHRcdHsnLFxuXHRcdFx0J1x0XHRcdGZvcihuZXcgaT0wO2k8MTA7aSsrKSBpZihTdGF0dXNURF9BcHBsZUpvYkFwcGxlc1twbGF5ZXJpZF1baV0pIFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYls1K2ldKTsnLFxuXHRcdFx0J1x0XHR9Jyxcblx0XHRcdCdcdFx0ZWxzZScsXG5cdFx0XHQnXHRcdHsnLFxuXHRcdFx0J1x0XHRcdGZvcihuZXcgaT0wO2k8MTA7aSsrKSBpZihTdGF0dXNURF9BcHBsZUpvYkFwcGxlc1twbGF5ZXJpZF1baV0pIFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYlsxNStpXSk7Jyxcblx0XHRcdCdcdFx0fScsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCdcdGVsc2UnLFxuXHRcdFx0J1x0eycsXG5cdFx0XHQnXHRcdFRleHREcmF3SGlkZUZvclBsYXllcihwbGF5ZXJpZCxURF9BcHBsZUpvYlszXSk7Jyxcblx0XHRcdCdcdFx0VGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzI3XSk7Jyxcblx0XHRcdCdcdFx0aWYoIUFwcGxlSm9iVHJlZXNUeXBlW0FwcGxlSm9iVHJlZXNQbGF5ZXJOdW1bcGxheWVyaWRdXSknLFxuXHRcdFx0J1x0XHR7Jyxcblx0XHRcdCdcdFx0XHRmb3IobmV3IGk9MDtpPDEwO2krKykgaWYoU3RhdHVzVERfQXBwbGVKb2JBcHBsZXNbcGxheWVyaWRdW2ldKSBUZXh0RHJhd0hpZGVGb3JQbGF5ZXIocGxheWVyaWQsVERfQXBwbGVKb2JbMjgraV0pOycsXG5cdFx0XHQnXHRcdH0nLFxuXHRcdFx0J1x0XHRlbHNlJyxcblx0XHRcdCdcdFx0eycsXG5cdFx0XHQnXHRcdFx0Zm9yKG5ldyBpPTA7aTwxMDtpKyspIGlmKFN0YXR1c1REX0FwcGxlSm9iQXBwbGVzW3BsYXllcmlkXVtpXSkgVGV4dERyYXdIaWRlRm9yUGxheWVyKHBsYXllcmlkLFREX0FwcGxlSm9iWzM4K2ldKTsnLFxuXHRcdFx0J1x0XHR9Jyxcblx0XHRcdCdcdH0nLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQxLCAyNywgMSwgMjcsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEsIDEsIDEsIDEsIDEsIDEsIDEsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMiwgMSwgMiwgMSwgMiwgMSwgMiwgMiksXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgzLCAxLCAzLCAxLCAzLCAxLCAzLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDQsIDEsIDQsIDEsIDQsIDEsIDQsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoNSwgMSwgNSwgMSwgNSwgMSwgNSwgMiksXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSg2LCAxLCA2LCAxLCA2LCAxLCA2LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDcsIDEsIDcsIDEsIDcsIDEsIDcsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoOCwgMSwgOCwgMSwgOCwgMSwgOCwgMiksXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSg5LCAxLCA5LCAxLCA5LCAxLCA5LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEwLCAxLCAxMCwgMSwgMTAsIDEsIDEwLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDExLCAxLCAxMSwgMSwgMTEsIDEsIDExLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEyLCAxLCAxMiwgMSwgMTIsIDEsIDEyLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDEzLCAxLCAxMywgMSwgMTMsIDEsIDEzLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDE0LCAxLCAxNCwgMSwgMTQsIDEsIDE0LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDE1LCAxLCAxNSwgMSwgMTUsIDEsIDE1LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDE2LCAxLCAxNiwgMSwgMTYsIDEsIDE2LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDE3LCAxLCAxNywgMSwgMTcsIDEsIDE3LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDE4LCAxLCAxOCwgMSwgMTgsIDEsIDE4LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDE5LCAxLCAxOSwgMSwgMTksIDEsIDE5LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIwLCAxLCAyMCwgMSwgMjAsIDEsIDIwLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIxLCAxLCAyMSwgMSwgMjEsIDEsIDIxLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIyLCAxLCAyMiwgMSwgMjIsIDEsIDIyLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIzLCAxLCAyMywgMSwgMjMsIDEsIDIzLCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDI0LCAxLCAyNCwgMSwgMjQsIDEsIDI0LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDI1LCAxLCAyNSwgMSwgMjUsIDEsIDI1LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDI2LCAxLCAyNiwgMSwgMjYsIDEsIDI2LCAyKSxcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDI3LCAxLCAyNywgMSwgMjcsIDEsIDI3LCAyKSxcblx0XHRcdFx0XVxuXHRcdFx0KVxuXHRcdFx0Ly8gY3JlYXRlTGluZUluc2VydGlvbig3LCAxMSwgNilcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDM5MjInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbXG5cdFx0XHQnICogYHlhcm4gW2luc3RhbGxdYCAtLSBJbnN0YWxsIHByb2plY3QgTlBNIGRlcGVuZGVuY2llcy4gVGhpcyBpcyBhdXRvbWF0aWNhbGx5IGRvbmUgd2hlbiB5b3UgZmlyc3QgY3JlYXRlIHRoZSBwcm9qZWN0LiBZb3Ugc2hvdWxkIG9ubHkgbmVlZCB0byBydW4gdGhpcyBpZiB5b3UgYWRkIGRlcGVuZGVuY2llcyBpbiBgcGFja2FnZS5qc29uYC4nLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnICogYHlhcm5gIC0tIEluc3RhbGwgcHJvamVjdCBOUE0gZGVwZW5kZW5jaWVzLiBZb3Ugc2hvdWxkIG9ubHkgbmVlZCB0byBydW4gdGhpcyBpZiB5b3UgYWRkIGRlcGVuZGVuY2llcyBpbiBgcGFja2FnZS5qc29uYC4nLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQxLCAxLCAxLCAxLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCA5LCAxLCAxOSwgMSwgOSwgMSwgOSksXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgxLCA1OCwgMSwgMTIwLCAxLCA0OCwgMSwgNDgpLFxuXHRcdFx0XHRdXG5cdFx0XHQpXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIHRydWUsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQyNzUxJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gW1xuXHRcdFx0JyAgICAxJyxcblx0XHRcdCcgIDInLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnICAgIDEnLFxuXHRcdFx0JyAgIDMnLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQyLCAyLCAyLCAyLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Y3JlYXRlQ2hhckNoYW5nZSgyLCAzLCAyLCA0LCAyLCAzLCAyLCA1KVxuXHRcdFx0XHRdXG5cdFx0XHQpXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIHRydWUsIHRydWUsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZ2l2ZSBjaGFyYWN0ZXIgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFtcblx0XHRcdCcgICAgMScsXG5cdFx0XHQnICAyJyxcblx0XHRcdCdBJyxcblx0XHRdO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gW1xuXHRcdFx0JyAgICAxJyxcblx0XHRcdCcgICAzJyxcblx0XHRcdCcgQScsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDIsIDMsIDIsIDNcblx0XHRcdClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NDQyMjogTGVzcyB0aGFuIGlkZWFsIGRpZmYgcmVzdWx0cycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFtcblx0XHRcdCdleHBvcnQgY2xhc3MgQyB7Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0cHVibGljIG0xKCk6IHZvaWQgeycsXG5cdFx0XHQnXHRcdHsnLFxuXHRcdFx0J1x0XHQvLzInLFxuXHRcdFx0J1x0XHQvLzMnLFxuXHRcdFx0J1x0XHQvLzQnLFxuXHRcdFx0J1x0XHQvLzUnLFxuXHRcdFx0J1x0XHQvLzYnLFxuXHRcdFx0J1x0XHQvLzcnLFxuXHRcdFx0J1x0XHQvLzgnLFxuXHRcdFx0J1x0XHQvLzknLFxuXHRcdFx0J1x0XHQvLzEwJyxcblx0XHRcdCdcdFx0Ly8xMScsXG5cdFx0XHQnXHRcdC8vMTInLFxuXHRcdFx0J1x0XHQvLzEzJyxcblx0XHRcdCdcdFx0Ly8xNCcsXG5cdFx0XHQnXHRcdC8vMTUnLFxuXHRcdFx0J1x0XHQvLzE2Jyxcblx0XHRcdCdcdFx0Ly8xNycsXG5cdFx0XHQnXHRcdC8vMTgnLFxuXHRcdFx0J1x0XHR9Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0JycsXG5cdFx0XHQnXHRwdWJsaWMgbTIoKTogdm9pZCB7Jyxcblx0XHRcdCdcdFx0aWYgKGEpIHsnLFxuXHRcdFx0J1x0XHRcdGlmIChiKSB7Jyxcblx0XHRcdCdcdFx0XHRcdC8vQTEnLFxuXHRcdFx0J1x0XHRcdFx0Ly9BMicsXG5cdFx0XHQnXHRcdFx0XHQvL0EzJyxcblx0XHRcdCdcdFx0XHRcdC8vQTQnLFxuXHRcdFx0J1x0XHRcdFx0Ly9BNScsXG5cdFx0XHQnXHRcdFx0XHQvL0E2Jyxcblx0XHRcdCdcdFx0XHRcdC8vQTcnLFxuXHRcdFx0J1x0XHRcdFx0Ly9BOCcsXG5cdFx0XHQnXHRcdFx0fScsXG5cdFx0XHQnXHRcdH0nLFxuXHRcdFx0JycsXG5cdFx0XHQnXHRcdC8vQTknLFxuXHRcdFx0J1x0XHQvL0ExMCcsXG5cdFx0XHQnXHRcdC8vQTExJyxcblx0XHRcdCdcdFx0Ly9BMTInLFxuXHRcdFx0J1x0XHQvL0ExMycsXG5cdFx0XHQnXHRcdC8vQTE0Jyxcblx0XHRcdCdcdFx0Ly9BMTUnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnJyxcblx0XHRcdCdcdHB1YmxpYyBtMygpOiB2b2lkIHsnLFxuXHRcdFx0J1x0XHRpZiAoYSkgeycsXG5cdFx0XHQnXHRcdFx0Ly9CMScsXG5cdFx0XHQnXHRcdH0nLFxuXHRcdFx0J1x0XHQvL0IyJyxcblx0XHRcdCdcdFx0Ly9CMycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1x0cHVibGljIG00KCk6IGJvb2xlYW4geycsXG5cdFx0XHQnXHRcdC8vMScsXG5cdFx0XHQnXHRcdC8vMicsXG5cdFx0XHQnXHRcdC8vMycsXG5cdFx0XHQnXHRcdC8vNCcsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCcnLFxuXHRcdFx0J30nLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnZXhwb3J0IGNsYXNzIEMgeycsXG5cdFx0XHQnJyxcblx0XHRcdCdcdGNvbnN0cnVjdG9yKCkgeycsXG5cdFx0XHQnJyxcblx0XHRcdCcnLFxuXHRcdFx0JycsXG5cdFx0XHQnJyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0JycsXG5cdFx0XHQnXHRwdWJsaWMgbTEoKTogdm9pZCB7Jyxcblx0XHRcdCdcdFx0eycsXG5cdFx0XHQnXHRcdC8vMicsXG5cdFx0XHQnXHRcdC8vMycsXG5cdFx0XHQnXHRcdC8vNCcsXG5cdFx0XHQnXHRcdC8vNScsXG5cdFx0XHQnXHRcdC8vNicsXG5cdFx0XHQnXHRcdC8vNycsXG5cdFx0XHQnXHRcdC8vOCcsXG5cdFx0XHQnXHRcdC8vOScsXG5cdFx0XHQnXHRcdC8vMTAnLFxuXHRcdFx0J1x0XHQvLzExJyxcblx0XHRcdCdcdFx0Ly8xMicsXG5cdFx0XHQnXHRcdC8vMTMnLFxuXHRcdFx0J1x0XHQvLzE0Jyxcblx0XHRcdCdcdFx0Ly8xNScsXG5cdFx0XHQnXHRcdC8vMTYnLFxuXHRcdFx0J1x0XHQvLzE3Jyxcblx0XHRcdCdcdFx0Ly8xOCcsXG5cdFx0XHQnXHRcdH0nLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnJyxcblx0XHRcdCdcdHB1YmxpYyBtNCgpOiBib29sZWFuIHsnLFxuXHRcdFx0J1x0XHQvLzEnLFxuXHRcdFx0J1x0XHQvLzInLFxuXHRcdFx0J1x0XHQvLzMnLFxuXHRcdFx0J1x0XHQvLzQnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnJyxcblx0XHRcdCd9Jyxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MiwgMCwgMywgOVxuXHRcdFx0KSxcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDI1LCA1NSwgMzEsIDBcblx0XHRcdClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dpdmVzIHByZWZlcmVuY2UgdG8gbWF0Y2hpbmcgbG9uZ2VyIGxpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gW1xuXHRcdFx0J0EnLFxuXHRcdFx0J0EnLFxuXHRcdFx0J0JCJyxcblx0XHRcdCdDJyxcblx0XHRdO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gW1xuXHRcdFx0J0EnLFxuXHRcdFx0J0JCJyxcblx0XHRcdCdBJyxcblx0XHRcdCdEJyxcblx0XHRcdCdFJyxcblx0XHRcdCdBJyxcblx0XHRcdCdDJyxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MiwgMiwgMSwgMFxuXHRcdFx0KSxcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDMsIDAsIDMsIDZcblx0XHRcdClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTkwNTE6IGdpdmVzIHByZWZlcmVuY2UgdG8gZmV3ZXIgZGlmZiBodW5rcycsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFtcblx0XHRcdCcxJyxcblx0XHRcdCcnLFxuXHRcdFx0JycsXG5cdFx0XHQnMicsXG5cdFx0XHQnJyxcblx0XHRdO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gW1xuXHRcdFx0JzEnLFxuXHRcdFx0JycsXG5cdFx0XHQnMS41Jyxcblx0XHRcdCcnLFxuXHRcdFx0JycsXG5cdFx0XHQnMicsXG5cdFx0XHQnJyxcblx0XHRcdCczJyxcblx0XHRcdCcnLFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQyLCAwLCAzLCA0XG5cdFx0XHQpLFxuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0NSwgMCwgOCwgOVxuXHRcdFx0KVxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyMTQzNjogRGlmZiBjaHVuayBjb250YWlucyBhbiB1bmNoYW5nZWQgbGluZSBwYXJ0IDEnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbXG5cdFx0XHQnaWYgKGNvbmQpIHsnLFxuXHRcdFx0JyAgICBjbWQnLFxuXHRcdFx0J30nLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnaWYgKGNvbmQpIHsnLFxuXHRcdFx0JyAgICBpZiAob3RoZXJfY29uZCkgeycsXG5cdFx0XHQnICAgICAgICBjbWQnLFxuXHRcdFx0JyAgICB9Jyxcblx0XHRcdCd9Jyxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MSwgMCwgMiwgMlxuXHRcdFx0KSxcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDIsIDAsIDQsIDRcblx0XHRcdClcblx0XHRdO1xuXHRcdGFzc2VydERpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCBleHBlY3RlZCwgZmFsc2UsIGZhbHNlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyMTQzNjogRGlmZiBjaHVuayBjb250YWlucyBhbiB1bmNoYW5nZWQgbGluZSBwYXJ0IDInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBbXG5cdFx0XHQnaWYgKGNvbmQpIHsnLFxuXHRcdFx0JyAgICBjbWQnLFxuXHRcdFx0J30nLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnaWYgKGNvbmQpIHsnLFxuXHRcdFx0JyAgICBpZiAob3RoZXJfY29uZCkgeycsXG5cdFx0XHQnICAgICAgICBjbWQnLFxuXHRcdFx0JyAgICB9Jyxcblx0XHRcdCd9Jyxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Y3JlYXRlTGluZUNoYW5nZShcblx0XHRcdFx0MSwgMCwgMiwgMlxuXHRcdFx0KSxcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDIsIDIsIDMsIDNcblx0XHRcdCksXG5cdFx0XHRjcmVhdGVMaW5lQ2hhbmdlKFxuXHRcdFx0XHQyLCAwLCA0LCA0XG5cdFx0XHQpXG5cdFx0XTtcblx0XHRhc3NlcnREaWZmKG9yaWdpbmFsLCBtb2RpZmllZCwgZXhwZWN0ZWQsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTY5NTUyOiBBc3NlcnRpb24gZXJyb3Igd2hlbiBoYXZpbmcgYm90aCBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlIGRpZmZzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gW1xuXHRcdFx0J2lmIFRydWU6Jyxcblx0XHRcdCcgICAgcHJpbnQoMiknLFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBbXG5cdFx0XHQnaWYgVHJ1ZTonLFxuXHRcdFx0J1xcdHByaW50KDIpICcsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdGNyZWF0ZUxpbmVDaGFuZ2UoXG5cdFx0XHRcdDIsIDIsIDIsIDIsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRjcmVhdGVDaGFyQ2hhbmdlKDIsIDEsIDIsIDUsIDIsIDEsIDIsIDIpLFxuXHRcdFx0XHRcdGNyZWF0ZUNoYXJDaGFuZ2UoMiwgMTMsIDIsIDEzLCAyLCAxMCwgMiwgMTEpLFxuXHRcdFx0XHRdXG5cdFx0XHQpLFxuXHRcdF07XG5cdFx0YXNzZXJ0RGlmZihvcmlnaW5hbCwgbW9kaWZpZWQsIGV4cGVjdGVkLCB0cnVlLCBmYWxzZSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuIl0s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QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxVQUMzQyxpQkFBaUIsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsVUFDM0MsaUJBQWlCLElBQUksR0FBRyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUFBLFVBQzNDLGlCQUFpQixJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxRQUM1QztBQUFBLE1BQ0Q7QUFBQTtBQUFBLElBRUQ7QUFDQSxlQUFXLFVBQVUsVUFBVSxVQUFVLE1BQU0sTUFBTSxLQUFLO0FBQUEsRUFDM0QsQ0FBQztBQUVELE9BQUssZ0JBQWdCLE1BQU07QUFDMUIsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxRQUNDO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFDVDtBQUFBLFVBQ0MsaUJBQWlCLEdBQUcsR0FBRyxHQUFHLElBQUksR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3hDLGlCQUFpQixHQUFHLElBQUksR0FBRyxLQUFLLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUM3QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsZUFBVyxVQUFVLFVBQVUsVUFBVSxNQUFNLE1BQU0sS0FBSztBQUFBLEVBQzNELENBQUM7QUFFRCxPQUFLLGdCQUFnQixNQUFNO0FBQzFCLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxRQUNDO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFDVDtBQUFBLFVBQ0MsaUJBQWlCLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxlQUFXLFVBQVUsVUFBVSxVQUFVLE1BQU0sTUFBTSxLQUFLO0FBQUEsRUFDM0QsQ0FBQztBQUVELE9BQUssbUNBQW1DLE1BQU07QUFDN0MsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsUUFDQztBQUFBLFFBQUc7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLE1BQ1Y7QUFBQSxJQUNEO0FBQ0EsZUFBVyxVQUFVLFVBQVUsVUFBVSxPQUFPLE9BQU8sS0FBSztBQUFBLEVBQzdELENBQUM7QUFFRCxPQUFLLDhDQUE4QyxNQUFNO0FBQ3hELFVBQU0sV0FBVztBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLFFBQ0M7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxNQUNWO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUFJO0FBQUEsUUFBSTtBQUFBLFFBQUk7QUFBQSxNQUNiO0FBQUEsSUFDRDtBQUNBLGVBQVcsVUFBVSxVQUFVLFVBQVUsT0FBTyxPQUFPLEtBQUs7QUFBQSxFQUM3RCxDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLFFBQ0M7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxNQUNWO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUFHO0FBQUEsUUFBRztBQUFBLFFBQUc7QUFBQSxNQUNWO0FBQUEsSUFDRDtBQUNBLGVBQVcsVUFBVSxVQUFVLFVBQVUs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
