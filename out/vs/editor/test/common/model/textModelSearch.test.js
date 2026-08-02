import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { getMapForWordSeparators } from "../../../common/core/wordCharacterClassifier.js";
import { USUAL_WORD_SEPARATORS } from "../../../common/core/wordHelper.js";
import { EndOfLineSequence, FindMatch, SearchData } from "../../../common/model.js";
import { SearchParams, TextModelSearch, isMultilineRegexSource } from "../../../common/model/textModelSearch.js";
import { createTextModel } from "../testTextModel.js";
suite("TextModelSearch", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const usualWordSeparators = getMapForWordSeparators(USUAL_WORD_SEPARATORS, []);
  function assertFindMatch(actual, expectedRange, expectedMatches = null) {
    assert.deepStrictEqual(actual, new FindMatch(expectedRange, expectedMatches));
  }
  function _assertFindMatches(model, searchParams, expectedMatches) {
    const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), false, 1e3);
    assert.deepStrictEqual(actual, expectedMatches, "findMatches OK");
    let startPos = new Position(1, 1);
    let match = TextModelSearch.findNextMatch(model, searchParams, startPos, false);
    assert.deepStrictEqual(match, expectedMatches[0], `findNextMatch ${startPos}`);
    for (const expectedMatch of expectedMatches) {
      startPos = expectedMatch.range.getStartPosition();
      match = TextModelSearch.findNextMatch(model, searchParams, startPos, false);
      assert.deepStrictEqual(match, expectedMatch, `findNextMatch ${startPos}`);
    }
    startPos = new Position(model.getLineCount(), model.getLineMaxColumn(model.getLineCount()));
    match = TextModelSearch.findPreviousMatch(model, searchParams, startPos, false);
    assert.deepStrictEqual(match, expectedMatches[expectedMatches.length - 1], `findPrevMatch ${startPos}`);
    for (const expectedMatch of expectedMatches) {
      startPos = expectedMatch.range.getEndPosition();
      match = TextModelSearch.findPreviousMatch(model, searchParams, startPos, false);
      assert.deepStrictEqual(match, expectedMatch, `findPrevMatch ${startPos}`);
    }
  }
  function assertFindMatches(text, searchString, isRegex, matchCase, wordSeparators, _expected) {
    const expectedRanges = _expected.map((entry) => new Range(entry[0], entry[1], entry[2], entry[3]));
    const expectedMatches = expectedRanges.map((entry) => new FindMatch(entry, null));
    const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
    const model = createTextModel(text);
    _assertFindMatches(model, searchParams, expectedMatches);
    model.dispose();
    const model2 = createTextModel(text);
    model2.setEOL(EndOfLineSequence.CRLF);
    _assertFindMatches(model2, searchParams, expectedMatches);
    model2.dispose();
  }
  const regularText = [
    "This is some foo - bar text which contains foo and bar - as in Barcelona.",
    "Now it begins a word fooBar and now it is caps Foo-isn't this great?",
    "And here's a dull line with nothing interesting in it",
    "It is also interesting if it's part of a word like amazingFooBar",
    "Again nothing interesting here"
  ];
  test("Simple find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "foo",
      false,
      false,
      null,
      [
        [1, 14, 1, 17],
        [1, 44, 1, 47],
        [2, 22, 2, 25],
        [2, 48, 2, 51],
        [4, 59, 4, 62]
      ]
    );
  });
  test("Case sensitive find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "foo",
      false,
      true,
      null,
      [
        [1, 14, 1, 17],
        [1, 44, 1, 47],
        [2, 22, 2, 25]
      ]
    );
  });
  test("Whole words find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "foo",
      false,
      false,
      USUAL_WORD_SEPARATORS,
      [
        [1, 14, 1, 17],
        [1, 44, 1, 47],
        [2, 48, 2, 51]
      ]
    );
  });
  test("/^/ find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "^",
      true,
      false,
      null,
      [
        [1, 1, 1, 1],
        [2, 1, 2, 1],
        [3, 1, 3, 1],
        [4, 1, 4, 1],
        [5, 1, 5, 1]
      ]
    );
  });
  test("/$/ find", () => {
    assertFindMatches(
      regularText.join("\n"),
      "$",
      true,
      false,
      null,
      [
        [1, 74, 1, 74],
        [2, 69, 2, 69],
        [3, 54, 3, 54],
        [4, 65, 4, 65],
        [5, 31, 5, 31]
      ]
    );
  });
  test("/.*/ find", () => {
    assertFindMatches(
      regularText.join("\n"),
      ".*",
      true,
      false,
      null,
      [
        [1, 1, 1, 74],
        [2, 1, 2, 69],
        [3, 1, 3, 54],
        [4, 1, 4, 65],
        [5, 1, 5, 31]
      ]
    );
  });
  test("/^$/ find", () => {
    assertFindMatches(
      [
        "This is some foo - bar text which contains foo and bar - as in Barcelona.",
        "",
        "And here's a dull line with nothing interesting in it",
        "",
        "Again nothing interesting here"
      ].join("\n"),
      "^$",
      true,
      false,
      null,
      [
        [2, 1, 2, 1],
        [4, 1, 4, 1]
      ]
    );
  });
  test("multiline find 1", () => {
    assertFindMatches(
      [
        "Just some text text",
        "Just some text text",
        "some text again",
        "again some text"
      ].join("\n"),
      "text\\n",
      true,
      false,
      null,
      [
        [1, 16, 2, 1],
        [2, 16, 3, 1]
      ]
    );
  });
  test("multiline find 2", () => {
    assertFindMatches(
      [
        "Just some text text",
        "Just some text text",
        "some text again",
        "again some text"
      ].join("\n"),
      "text\\nJust",
      true,
      false,
      null,
      [
        [1, 16, 2, 5]
      ]
    );
  });
  test("multiline find 3", () => {
    assertFindMatches(
      [
        "Just some text text",
        "Just some text text",
        "some text again",
        "again some text"
      ].join("\n"),
      "\\nagain",
      true,
      false,
      null,
      [
        [3, 16, 4, 6]
      ]
    );
  });
  test("multiline find 4", () => {
    assertFindMatches(
      [
        "Just some text text",
        "Just some text text",
        "some text again",
        "again some text"
      ].join("\n"),
      ".*\\nJust.*\\n",
      true,
      false,
      null,
      [
        [1, 1, 3, 1]
      ]
    );
  });
  test("multiline find with line beginning regex", () => {
    assertFindMatches(
      [
        "if",
        "else",
        "",
        "if",
        "else"
      ].join("\n"),
      "^if\\nelse",
      true,
      false,
      null,
      [
        [1, 1, 2, 5],
        [4, 1, 5, 5]
      ]
    );
  });
  test("matching empty lines using boundary expression", () => {
    assertFindMatches(
      [
        "if",
        "",
        "else",
        "  ",
        "if",
        " ",
        "else"
      ].join("\n"),
      "^\\s*$\\n",
      true,
      false,
      null,
      [
        [2, 1, 3, 1],
        [4, 1, 5, 1],
        [6, 1, 7, 1]
      ]
    );
  });
  test("matching lines starting with A and ending with B", () => {
    assertFindMatches(
      [
        "a if b",
        "a",
        "ab",
        "eb"
      ].join("\n"),
      "^a.*b$",
      true,
      false,
      null,
      [
        [1, 1, 1, 7],
        [3, 1, 3, 3]
      ]
    );
  });
  test("multiline find with line ending regex", () => {
    assertFindMatches(
      [
        "if",
        "else",
        "",
        "if",
        "elseif",
        "else"
      ].join("\n"),
      "if\\nelse$",
      true,
      false,
      null,
      [
        [1, 1, 2, 5],
        [5, 5, 6, 5]
      ]
    );
  });
  test("issue #4836 - ^.*$", () => {
    assertFindMatches(
      [
        "Just some text text",
        "",
        "some text again",
        "",
        "again some text"
      ].join("\n"),
      "^.*$",
      true,
      false,
      null,
      [
        [1, 1, 1, 20],
        [2, 1, 2, 1],
        [3, 1, 3, 16],
        [4, 1, 4, 1],
        [5, 1, 5, 16]
      ]
    );
  });
  test("multiline find for non-regex string", () => {
    assertFindMatches(
      [
        "Just some text text",
        "some text text",
        "some text again",
        "again some text",
        "but not some"
      ].join("\n"),
      "text\nsome",
      false,
      false,
      null,
      [
        [1, 16, 2, 5],
        [2, 11, 3, 5]
      ]
    );
  });
  test("issue #3623: Match whole word does not work for not latin characters", () => {
    assertFindMatches(
      [
        "\u044F",
        "\u043A\u043E\u043C\u043F\u0438\u043B\u044F\u0442\u043E\u0440",
        "\u043E\u0431\u0444\u0443\u0441\u043A\u0430\u0446\u0438\u044F",
        ":\u044F-\u044F"
      ].join("\n"),
      "\u044F",
      false,
      false,
      USUAL_WORD_SEPARATORS,
      [
        [1, 1, 1, 2],
        [4, 2, 4, 3],
        [4, 4, 4, 5]
      ]
    );
  });
  test("issue #27459: Match whole words regression", () => {
    assertFindMatches(
      [
        "this._register(this._textAreaInput.onKeyDown((e: IKeyboardEvent) => {",
        "	this._viewController.emitKeyDown(e);",
        "}));"
      ].join("\n"),
      "((e: ",
      false,
      false,
      USUAL_WORD_SEPARATORS,
      [
        [1, 45, 1, 50]
      ]
    );
  });
  test("issue #27594: Search results disappear", () => {
    assertFindMatches(
      [
        "this.server.listen(0);"
      ].join("\n"),
      "listen(",
      false,
      false,
      USUAL_WORD_SEPARATORS,
      [
        [1, 13, 1, 20]
      ]
    );
  });
  test("findNextMatch without regex", () => {
    const model = createTextModel("line line one\nline two\nthree");
    const searchParams = new SearchParams("line", false, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 6, 1, 10));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
    assertFindMatch(actual, new Range(1, 6, 1, 10));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    model.dispose();
  });
  test("findNextMatch with beginning boundary regex", () => {
    const model = createTextModel("line one\nline two\nthree");
    const searchParams = new SearchParams("^line", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    model.dispose();
  });
  test("findNextMatch with beginning boundary regex and line has repetitive beginnings", () => {
    const model = createTextModel("line line one\nline two\nthree");
    const searchParams = new SearchParams("^line", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 3), false);
    assertFindMatch(actual, new Range(2, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 1, 1, 5));
    model.dispose();
  });
  test("findNextMatch with beginning boundary multiline regex and line has repetitive beginnings", () => {
    const model = createTextModel("line line one\nline two\nline three\nline four");
    const searchParams = new SearchParams("^line.*\\nline", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 1, 2, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(3, 1, 4, 5));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(2, 1), false);
    assertFindMatch(actual, new Range(2, 1, 3, 5));
    model.dispose();
  });
  test("findNextMatch with ending boundary regex", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("line$", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), false);
    assertFindMatch(actual, new Range(1, 10, 1, 14));
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 4), false);
    assertFindMatch(actual, new Range(1, 10, 1, 14));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(2, 5, 2, 9));
    actual = TextModelSearch.findNextMatch(model, searchParams, actual.range.getEndPosition(), false);
    assertFindMatch(actual, new Range(1, 10, 1, 14));
    model.dispose();
  });
  test("findMatches with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)", true, false, null);
    const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 100);
    assert.deepStrictEqual(actual, [
      new FindMatch(new Range(1, 5, 1, 9), ["line", "line", "in"]),
      new FindMatch(new Range(1, 10, 1, 14), ["line", "line", "in"]),
      new FindMatch(new Range(2, 5, 2, 9), ["line", "line", "in"])
    ]);
    model.dispose();
  });
  test("findMatches multiline with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)\\n", true, false, null);
    const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 100);
    assert.deepStrictEqual(actual, [
      new FindMatch(new Range(1, 10, 2, 1), ["line\n", "line", "in"]),
      new FindMatch(new Range(2, 5, 3, 1), ["line\n", "line", "in"])
    ]);
    model.dispose();
  });
  test("findNextMatch with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)", true, false, null);
    const actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    assertFindMatch(actual, new Range(1, 5, 1, 9), ["line", "line", "in"]);
    model.dispose();
  });
  test("findNextMatch multiline with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)\\n", true, false, null);
    const actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    assertFindMatch(actual, new Range(1, 10, 2, 1), ["line\n", "line", "in"]);
    model.dispose();
  });
  test("findPreviousMatch with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)", true, false, null);
    const actual = TextModelSearch.findPreviousMatch(model, searchParams, new Position(1, 1), true);
    assertFindMatch(actual, new Range(2, 5, 2, 9), ["line", "line", "in"]);
    model.dispose();
  });
  test("findPreviousMatch multiline with capturing matches", () => {
    const model = createTextModel("one line line\ntwo line\nthree");
    const searchParams = new SearchParams("(l(in)e)\\n", true, false, null);
    const actual = TextModelSearch.findPreviousMatch(model, searchParams, new Position(1, 1), true);
    assertFindMatch(actual, new Range(2, 5, 3, 1), ["line\n", "line", "in"]);
    model.dispose();
  });
  test("\\n matches \\r\\n", () => {
    const model = createTextModel("a\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng\r\nh\r\ni");
    assert.strictEqual(model.getEOL(), "\r\n");
    let searchParams = new SearchParams("h\\n", true, false, null);
    let actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1e3)[0];
    assertFindMatch(actual, new Range(8, 1, 9, 1), ["h\n"]);
    searchParams = new SearchParams("g\\nh\\n", true, false, null);
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1e3)[0];
    assertFindMatch(actual, new Range(7, 1, 9, 1), ["g\nh\n"]);
    searchParams = new SearchParams("\\ni", true, false, null);
    actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1e3)[0];
    assertFindMatch(actual, new Range(8, 2, 9, 2), ["\ni"]);
    model.dispose();
  });
  test("\\r can never be found", () => {
    const model = createTextModel("a\r\nb\r\nc\r\nd\r\ne\r\nf\r\ng\r\nh\r\ni");
    assert.strictEqual(model.getEOL(), "\r\n");
    const searchParams = new SearchParams("\\r\\n", true, false, null);
    const actual = TextModelSearch.findNextMatch(model, searchParams, new Position(1, 1), true);
    assert.strictEqual(actual, null);
    assert.deepStrictEqual(TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 1e3), []);
    model.dispose();
  });
  function assertParseSearchResult(searchString, isRegex, matchCase, wordSeparators, expected) {
    const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
    const actual = searchParams.parseSearchRequest();
    if (expected === null) {
      assert.ok(actual === null);
    } else {
      assert.deepStrictEqual(actual.regex, expected.regex);
      assert.deepStrictEqual(actual.simpleSearch, expected.simpleSearch);
      if (wordSeparators) {
        assert.ok(actual.wordSeparators !== null);
      } else {
        assert.ok(actual.wordSeparators === null);
      }
    }
  }
  test("parseSearchRequest invalid", () => {
    assertParseSearchResult("", true, true, USUAL_WORD_SEPARATORS, null);
    assertParseSearchResult("(", true, false, null, null);
  });
  test("parseSearchRequest non regex", () => {
    assertParseSearchResult("foo", false, false, null, new SearchData(/foo/giu, null, null));
    assertParseSearchResult("foo", false, false, USUAL_WORD_SEPARATORS, new SearchData(/foo/giu, usualWordSeparators, null));
    assertParseSearchResult("foo", false, true, null, new SearchData(/foo/gu, null, "foo"));
    assertParseSearchResult("foo", false, true, USUAL_WORD_SEPARATORS, new SearchData(/foo/gu, usualWordSeparators, "foo"));
    assertParseSearchResult("foo\\n", false, false, null, new SearchData(/foo\\n/giu, null, null));
    assertParseSearchResult("foo\\\\n", false, false, null, new SearchData(/foo\\\\n/giu, null, null));
    assertParseSearchResult("foo\\r", false, false, null, new SearchData(/foo\\r/giu, null, null));
    assertParseSearchResult("foo\\\\r", false, false, null, new SearchData(/foo\\\\r/giu, null, null));
  });
  test("parseSearchRequest regex", () => {
    assertParseSearchResult("foo", true, false, null, new SearchData(/foo/giu, null, null));
    assertParseSearchResult("foo", true, false, USUAL_WORD_SEPARATORS, new SearchData(/foo/giu, usualWordSeparators, null));
    assertParseSearchResult("foo", true, true, null, new SearchData(/foo/gu, null, null));
    assertParseSearchResult("foo", true, true, USUAL_WORD_SEPARATORS, new SearchData(/foo/gu, usualWordSeparators, null));
    assertParseSearchResult("foo\\n", true, false, null, new SearchData(/foo\n/gimu, null, null));
    assertParseSearchResult("foo\\\\n", true, false, null, new SearchData(/foo\\n/giu, null, null));
    assertParseSearchResult("foo\\r", true, false, null, new SearchData(/foo\r/gimu, null, null));
    assertParseSearchResult("foo\\\\r", true, false, null, new SearchData(/foo\\r/giu, null, null));
  });
  test("issue #53415. W should match line break.", () => {
    assertFindMatches(
      [
        "text",
        "180702-",
        "180703-180704"
      ].join("\n"),
      "\\d{6}-\\W",
      true,
      false,
      null,
      [
        [2, 1, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just some text",
        "",
        "Just"
      ].join("\n"),
      "\\W",
      true,
      false,
      null,
      [
        [1, 5, 1, 6],
        [1, 10, 1, 11],
        [1, 15, 2, 1],
        [2, 1, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just some text",
        "",
        "Just"
      ].join("\r\n"),
      "\\W",
      true,
      false,
      null,
      [
        [1, 5, 1, 6],
        [1, 10, 1, 11],
        [1, 15, 2, 1],
        [2, 1, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just some text",
        "	Just",
        "Just"
      ].join("\n"),
      "\\W",
      true,
      false,
      null,
      [
        [1, 5, 1, 6],
        [1, 10, 1, 11],
        [1, 15, 2, 1],
        [2, 1, 2, 2],
        [2, 6, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just  some text",
        "",
        "Just"
      ].join("\n"),
      "\\W{2}",
      true,
      false,
      null,
      [
        [1, 5, 1, 7],
        [1, 16, 3, 1]
      ]
    );
    assertFindMatches(
      [
        "Just  some text",
        "",
        "Just"
      ].join("\r\n"),
      "\\W{2}",
      true,
      false,
      null,
      [
        [1, 5, 1, 7],
        [1, 16, 3, 1]
      ]
    );
  });
  test("Simple find using unicode escape sequences", () => {
    assertFindMatches(
      regularText.join("\n"),
      "\\u{0066}\\u006f\\u006F",
      true,
      false,
      null,
      [
        [1, 14, 1, 17],
        [1, 44, 1, 47],
        [2, 22, 2, 25],
        [2, 48, 2, 51],
        [4, 59, 4, 62]
      ]
    );
  });
  test("isMultilineRegexSource", () => {
    assert(!isMultilineRegexSource("foo"));
    assert(!isMultilineRegexSource(""));
    assert(!isMultilineRegexSource("foo\\sbar"));
    assert(!isMultilineRegexSource("\\\\notnewline"));
    assert(isMultilineRegexSource("foo\\nbar"));
    assert(isMultilineRegexSource("foo\\nbar\\s"));
    assert(isMultilineRegexSource("foo\\r\\n"));
    assert(isMultilineRegexSource("\\n"));
    assert(isMultilineRegexSource("foo\\W"));
    assert(isMultilineRegexSource("foo\n"));
    assert(isMultilineRegexSource("foo\r\n"));
  });
  test("isMultilineRegexSource correctly identifies multiline patterns", () => {
    const singleLinePatterns = [
      "MARK:\\s*(?<label>.*)$",
      "^// Header$",
      "\\s*[-=]+\\s*"
    ];
    const multiLinePatterns = [
      "^// =+\\n^// (?<label>[^\\n]+?)\\n^// =+$",
      "header\\r\\nfooter",
      "start\\r|\\nend",
      "top\nmiddle\r\nbottom"
    ];
    for (const pattern of singleLinePatterns) {
      assert.strictEqual(isMultilineRegexSource(pattern), false, `Pattern should not be multiline: ${pattern}`);
    }
    for (const pattern of multiLinePatterns) {
      assert.strictEqual(isMultilineRegexSource(pattern), true, `Pattern should be multiline: ${pattern}`);
    }
  });
  test("issue #74715. \\d* finds empty string and stops searching.", () => {
    const model = createTextModel("10.243.30.10");
    const searchParams = new SearchParams("\\d*", true, false, null);
    const actual = TextModelSearch.findMatches(model, searchParams, model.getFullModelRange(), true, 100);
    assert.deepStrictEqual(actual, [
      new FindMatch(new Range(1, 1, 1, 3), ["10"]),
      new FindMatch(new Range(1, 3, 1, 3), [""]),
      new FindMatch(new Range(1, 4, 1, 7), ["243"]),
      new FindMatch(new Range(1, 7, 1, 7), [""]),
      new FindMatch(new Range(1, 8, 1, 10), ["30"]),
      new FindMatch(new Range(1, 10, 1, 10), [""]),
      new FindMatch(new Range(1, 11, 1, 13), ["10"])
    ]);
    model.dispose();
  });
  test("issue #100134. Zero-length matches should properly step over surrogate pairs", () => {
    assertFindMatches(
      "1\u{1F4BB}1",
      "()",
      true,
      false,
      null,
      [
        [1, 1, 1, 1],
        [1, 2, 1, 2],
        [1, 4, 1, 4],
        [1, 5, 1, 5]
      ]
    );
    assertFindMatches(
      "1\u{1F431}\u200D\u{1F4BB}1",
      "()",
      true,
      false,
      null,
      [
        [1, 1, 1, 1],
        [1, 2, 1, 2],
        [1, 4, 1, 4],
        [1, 5, 1, 5],
        [1, 7, 1, 7],
        [1, 8, 1, 8]
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC90ZXh0TW9kZWxTZWFyY2gudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGdldE1hcEZvcldvcmRTZXBhcmF0b3JzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvd29yZENoYXJhY3RlckNsYXNzaWZpZXIuanMnO1xuaW1wb3J0IHsgVVNVQUxfV09SRF9TRVBBUkFUT1JTIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVTZXF1ZW5jZSwgRmluZE1hdGNoLCBTZWFyY2hEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgU2VhcmNoUGFyYW1zLCBUZXh0TW9kZWxTZWFyY2gsIGlzTXVsdGlsaW5lUmVnZXhTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsU2VhcmNoLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuXG4vLyAtLS0tLS0tLS0gRmluZFxuc3VpdGUoJ1RleHRNb2RlbFNlYXJjaCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB1c3VhbFdvcmRTZXBhcmF0b3JzID0gZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoVVNVQUxfV09SRF9TRVBBUkFUT1JTLCBbXSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0RmluZE1hdGNoKGFjdHVhbDogRmluZE1hdGNoIHwgbnVsbCwgZXhwZWN0ZWRSYW5nZTogUmFuZ2UsIGV4cGVjdGVkTWF0Y2hlczogc3RyaW5nW10gfCBudWxsID0gbnVsbCk6IHZvaWQge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBuZXcgRmluZE1hdGNoKGV4cGVjdGVkUmFuZ2UsIGV4cGVjdGVkTWF0Y2hlcykpO1xuXHR9XG5cblx0ZnVuY3Rpb24gX2Fzc2VydEZpbmRNYXRjaGVzKG1vZGVsOiBUZXh0TW9kZWwsIHNlYXJjaFBhcmFtczogU2VhcmNoUGFyYW1zLCBleHBlY3RlZE1hdGNoZXM6IEZpbmRNYXRjaFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmRNYXRjaGVzKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIGZhbHNlLCAxMDAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWRNYXRjaGVzLCAnZmluZE1hdGNoZXMgT0snKTtcblxuXHRcdC8vIHRlc3QgYGZpbmROZXh0TWF0Y2hgXG5cdFx0bGV0IHN0YXJ0UG9zID0gbmV3IFBvc2l0aW9uKDEsIDEpO1xuXHRcdGxldCBtYXRjaCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIHN0YXJ0UG9zLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXRjaCwgZXhwZWN0ZWRNYXRjaGVzWzBdLCBgZmluZE5leHRNYXRjaCAke3N0YXJ0UG9zfWApO1xuXHRcdGZvciAoY29uc3QgZXhwZWN0ZWRNYXRjaCBvZiBleHBlY3RlZE1hdGNoZXMpIHtcblx0XHRcdHN0YXJ0UG9zID0gZXhwZWN0ZWRNYXRjaC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRtYXRjaCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIHN0YXJ0UG9zLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hdGNoLCBleHBlY3RlZE1hdGNoLCBgZmluZE5leHRNYXRjaCAke3N0YXJ0UG9zfWApO1xuXHRcdH1cblxuXHRcdC8vIHRlc3QgYGZpbmRQcmV2TWF0Y2hgXG5cdFx0c3RhcnRQb3MgPSBuZXcgUG9zaXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCksIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWwuZ2V0TGluZUNvdW50KCkpKTtcblx0XHRtYXRjaCA9IFRleHRNb2RlbFNlYXJjaC5maW5kUHJldmlvdXNNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBzdGFydFBvcywgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWF0Y2gsIGV4cGVjdGVkTWF0Y2hlc1tleHBlY3RlZE1hdGNoZXMubGVuZ3RoIC0gMV0sIGBmaW5kUHJldk1hdGNoICR7c3RhcnRQb3N9YCk7XG5cdFx0Zm9yIChjb25zdCBleHBlY3RlZE1hdGNoIG9mIGV4cGVjdGVkTWF0Y2hlcykge1xuXHRcdFx0c3RhcnRQb3MgPSBleHBlY3RlZE1hdGNoLnJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0XHRtYXRjaCA9IFRleHRNb2RlbFNlYXJjaC5maW5kUHJldmlvdXNNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBzdGFydFBvcywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXRjaCwgZXhwZWN0ZWRNYXRjaCwgYGZpbmRQcmV2TWF0Y2ggJHtzdGFydFBvc31gKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRGaW5kTWF0Y2hlcyh0ZXh0OiBzdHJpbmcsIHNlYXJjaFN0cmluZzogc3RyaW5nLCBpc1JlZ2V4OiBib29sZWFuLCBtYXRjaENhc2U6IGJvb2xlYW4sIHdvcmRTZXBhcmF0b3JzOiBzdHJpbmcgfCBudWxsLCBfZXhwZWN0ZWQ6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdW10pOiB2b2lkIHtcblx0XHRjb25zdCBleHBlY3RlZFJhbmdlcyA9IF9leHBlY3RlZC5tYXAoZW50cnkgPT4gbmV3IFJhbmdlKGVudHJ5WzBdLCBlbnRyeVsxXSwgZW50cnlbMl0sIGVudHJ5WzNdKSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRNYXRjaGVzID0gZXhwZWN0ZWRSYW5nZXMubWFwKGVudHJ5ID0+IG5ldyBGaW5kTWF0Y2goZW50cnksIG51bGwpKTtcblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKHNlYXJjaFN0cmluZywgaXNSZWdleCwgbWF0Y2hDYXNlLCB3b3JkU2VwYXJhdG9ycyk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0KTtcblx0XHRfYXNzZXJ0RmluZE1hdGNoZXMobW9kZWwsIHNlYXJjaFBhcmFtcywgZXhwZWN0ZWRNYXRjaGVzKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cblxuXHRcdGNvbnN0IG1vZGVsMiA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0KTtcblx0XHRtb2RlbDIuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXHRcdF9hc3NlcnRGaW5kTWF0Y2hlcyhtb2RlbDIsIHNlYXJjaFBhcmFtcywgZXhwZWN0ZWRNYXRjaGVzKTtcblx0XHRtb2RlbDIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Y29uc3QgcmVndWxhclRleHQgPSBbXG5cdFx0J1RoaXMgaXMgc29tZSBmb28gLSBiYXIgdGV4dCB3aGljaCBjb250YWlucyBmb28gYW5kIGJhciAtIGFzIGluIEJhcmNlbG9uYS4nLFxuXHRcdCdOb3cgaXQgYmVnaW5zIGEgd29yZCBmb29CYXIgYW5kIG5vdyBpdCBpcyBjYXBzIEZvby1pc25cXCd0IHRoaXMgZ3JlYXQ/Jyxcblx0XHQnQW5kIGhlcmVcXCdzIGEgZHVsbCBsaW5lIHdpdGggbm90aGluZyBpbnRlcmVzdGluZyBpbiBpdCcsXG5cdFx0J0l0IGlzIGFsc28gaW50ZXJlc3RpbmcgaWYgaXRcXCdzIHBhcnQgb2YgYSB3b3JkIGxpa2UgYW1hemluZ0Zvb0JhcicsXG5cdFx0J0FnYWluIG5vdGhpbmcgaW50ZXJlc3RpbmcgaGVyZSdcblx0XTtcblxuXHR0ZXN0KCdTaW1wbGUgZmluZCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdHJlZ3VsYXJUZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0J2ZvbycsIGZhbHNlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDE0LCAxLCAxN10sXG5cdFx0XHRcdFsxLCA0NCwgMSwgNDddLFxuXHRcdFx0XHRbMiwgMjIsIDIsIDI1XSxcblx0XHRcdFx0WzIsIDQ4LCAyLCA1MV0sXG5cdFx0XHRcdFs0LCA1OSwgNCwgNjJdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnQ2FzZSBzZW5zaXRpdmUgZmluZCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdHJlZ3VsYXJUZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0J2ZvbycsIGZhbHNlLCB0cnVlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMTQsIDEsIDE3XSxcblx0XHRcdFx0WzEsIDQ0LCAxLCA0N10sXG5cdFx0XHRcdFsyLCAyMiwgMiwgMjVdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnV2hvbGUgd29yZHMgZmluZCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdHJlZ3VsYXJUZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0J2ZvbycsIGZhbHNlLCBmYWxzZSwgVVNVQUxfV09SRF9TRVBBUkFUT1JTLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMTQsIDEsIDE3XSxcblx0XHRcdFx0WzEsIDQ0LCAxLCA0N10sXG5cdFx0XHRcdFsyLCA0OCwgMiwgNTFdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnL14vIGZpbmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRyZWd1bGFyVGV4dC5qb2luKCdcXG4nKSxcblx0XHRcdCdeJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAxLCAxXSxcblx0XHRcdFx0WzIsIDEsIDIsIDFdLFxuXHRcdFx0XHRbMywgMSwgMywgMV0sXG5cdFx0XHRcdFs0LCAxLCA0LCAxXSxcblx0XHRcdFx0WzUsIDEsIDUsIDFdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnLyQvIGZpbmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRyZWd1bGFyVGV4dC5qb2luKCdcXG4nKSxcblx0XHRcdCckJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCA3NCwgMSwgNzRdLFxuXHRcdFx0XHRbMiwgNjksIDIsIDY5XSxcblx0XHRcdFx0WzMsIDU0LCAzLCA1NF0sXG5cdFx0XHRcdFs0LCA2NSwgNCwgNjVdLFxuXHRcdFx0XHRbNSwgMzEsIDUsIDMxXVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJy8uKi8gZmluZCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdHJlZ3VsYXJUZXh0LmpvaW4oJ1xcbicpLFxuXHRcdFx0Jy4qJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAxLCA3NF0sXG5cdFx0XHRcdFsyLCAxLCAyLCA2OV0sXG5cdFx0XHRcdFszLCAxLCAzLCA1NF0sXG5cdFx0XHRcdFs0LCAxLCA0LCA2NV0sXG5cdFx0XHRcdFs1LCAxLCA1LCAzMV1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCcvXiQvIGZpbmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdUaGlzIGlzIHNvbWUgZm9vIC0gYmFyIHRleHQgd2hpY2ggY29udGFpbnMgZm9vIGFuZCBiYXIgLSBhcyBpbiBCYXJjZWxvbmEuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdBbmQgaGVyZVxcJ3MgYSBkdWxsIGxpbmUgd2l0aCBub3RoaW5nIGludGVyZXN0aW5nIGluIGl0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdBZ2FpbiBub3RoaW5nIGludGVyZXN0aW5nIGhlcmUnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J14kJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsyLCAxLCAyLCAxXSxcblx0XHRcdFx0WzQsIDEsIDQsIDFdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlsaW5lIGZpbmQgMScsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0IHRleHQnLFxuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQgdGV4dCcsXG5cdFx0XHRcdCdzb21lIHRleHQgYWdhaW4nLFxuXHRcdFx0XHQnYWdhaW4gc29tZSB0ZXh0J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCd0ZXh0XFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDE2LCAyLCAxXSxcblx0XHRcdFx0WzIsIDE2LCAzLCAxXSxcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aWxpbmUgZmluZCAyJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQgdGV4dCcsXG5cdFx0XHRcdCdKdXN0IHNvbWUgdGV4dCB0ZXh0Jyxcblx0XHRcdFx0J3NvbWUgdGV4dCBhZ2FpbicsXG5cdFx0XHRcdCdhZ2FpbiBzb21lIHRleHQnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J3RleHRcXFxcbkp1c3QnLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDE2LCAyLCA1XVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpbGluZSBmaW5kIDMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdKdXN0IHNvbWUgdGV4dCB0ZXh0Jyxcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0IHRleHQnLFxuXHRcdFx0XHQnc29tZSB0ZXh0IGFnYWluJyxcblx0XHRcdFx0J2FnYWluIHNvbWUgdGV4dCdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQnXFxcXG5hZ2FpbicsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMywgMTYsIDQsIDZdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlsaW5lIGZpbmQgNCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0IHRleHQnLFxuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQgdGV4dCcsXG5cdFx0XHRcdCdzb21lIHRleHQgYWdhaW4nLFxuXHRcdFx0XHQnYWdhaW4gc29tZSB0ZXh0J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCcuKlxcXFxuSnVzdC4qXFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDMsIDFdXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlsaW5lIGZpbmQgd2l0aCBsaW5lIGJlZ2lubmluZyByZWdleCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J2lmJyxcblx0XHRcdFx0J2Vsc2UnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J2lmJyxcblx0XHRcdFx0J2Vsc2UnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J15pZlxcXFxuZWxzZScsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMSwgMiwgNV0sXG5cdFx0XHRcdFs0LCAxLCA1LCA1XVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoaW5nIGVtcHR5IGxpbmVzIHVzaW5nIGJvdW5kYXJ5IGV4cHJlc3Npb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdpZicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnZWxzZScsXG5cdFx0XHRcdCcgICcsXG5cdFx0XHRcdCdpZicsXG5cdFx0XHRcdCcgJyxcblx0XHRcdFx0J2Vsc2UnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J15cXFxccyokXFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzIsIDEsIDMsIDFdLFxuXHRcdFx0XHRbNCwgMSwgNSwgMV0sXG5cdFx0XHRcdFs2LCAxLCA3LCAxXVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoaW5nIGxpbmVzIHN0YXJ0aW5nIHdpdGggQSBhbmQgZW5kaW5nIHdpdGggQicsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J2EgaWYgYicsXG5cdFx0XHRcdCdhJyxcblx0XHRcdFx0J2FiJyxcblx0XHRcdFx0J2ViJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCdeYS4qYiQnLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDddLFxuXHRcdFx0XHRbMywgMSwgMywgM11cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aWxpbmUgZmluZCB3aXRoIGxpbmUgZW5kaW5nIHJlZ2V4JywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnaWYnLFxuXHRcdFx0XHQnZWxzZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnaWYnLFxuXHRcdFx0XHQnZWxzZWlmJyxcblx0XHRcdFx0J2Vsc2UnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J2lmXFxcXG5lbHNlJCcsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMSwgMiwgNV0sXG5cdFx0XHRcdFs1LCA1LCA2LCA1XVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0ODM2IC0gXi4qJCcsICgpID0+IHtcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0IHRleHQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J3NvbWUgdGV4dCBhZ2FpbicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnYWdhaW4gc29tZSB0ZXh0J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCdeLiokJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAxLCAyMF0sXG5cdFx0XHRcdFsyLCAxLCAyLCAxXSxcblx0XHRcdFx0WzMsIDEsIDMsIDE2XSxcblx0XHRcdFx0WzQsIDEsIDQsIDFdLFxuXHRcdFx0XHRbNSwgMSwgNSwgMTZdLFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpbGluZSBmaW5kIGZvciBub24tcmVnZXggc3RyaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnSnVzdCBzb21lIHRleHQgdGV4dCcsXG5cdFx0XHRcdCdzb21lIHRleHQgdGV4dCcsXG5cdFx0XHRcdCdzb21lIHRleHQgYWdhaW4nLFxuXHRcdFx0XHQnYWdhaW4gc29tZSB0ZXh0Jyxcblx0XHRcdFx0J2J1dCBub3Qgc29tZSdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQndGV4dFxcbnNvbWUnLCBmYWxzZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxNiwgMiwgNV0sXG5cdFx0XHRcdFsyLCAxMSwgMywgNV0sXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM2MjM6IE1hdGNoIHdob2xlIHdvcmQgZG9lcyBub3Qgd29yayBmb3Igbm90IGxhdGluIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdcdTA0NEYnLFxuXHRcdFx0XHQnXHUwNDNBXHUwNDNFXHUwNDNDXHUwNDNGXHUwNDM4XHUwNDNCXHUwNDRGXHUwNDQyXHUwNDNFXHUwNDQwJyxcblx0XHRcdFx0J1x1MDQzRVx1MDQzMVx1MDQ0NFx1MDQ0M1x1MDQ0MVx1MDQzQVx1MDQzMFx1MDQ0Nlx1MDQzOFx1MDQ0RicsXG5cdFx0XHRcdCc6XHUwNDRGLVx1MDQ0Ridcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHQnXHUwNDRGJywgZmFsc2UsIGZhbHNlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCAxLCAxLCAyXSxcblx0XHRcdFx0WzQsIDIsIDQsIDNdLFxuXHRcdFx0XHRbNCwgNCwgNCwgNV0sXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI3NDU5OiBNYXRjaCB3aG9sZSB3b3JkcyByZWdyZXNzaW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQndGhpcy5fcmVnaXN0ZXIodGhpcy5fdGV4dEFyZWFJbnB1dC5vbktleURvd24oKGU6IElLZXlib2FyZEV2ZW50KSA9PiB7Jyxcblx0XHRcdFx0J1x0dGhpcy5fdmlld0NvbnRyb2xsZXIuZW1pdEtleURvd24oZSk7Jyxcblx0XHRcdFx0J30pKTsnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCcoKGU6ICcsIGZhbHNlLCBmYWxzZSwgVVNVQUxfV09SRF9TRVBBUkFUT1JTLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgNDUsIDEsIDUwXVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNzU5NDogU2VhcmNoIHJlc3VsdHMgZGlzYXBwZWFyJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQndGhpcy5zZXJ2ZXIubGlzdGVuKDApOycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J2xpc3RlbignLCBmYWxzZSwgZmFsc2UsIFVTVUFMX1dPUkRfU0VQQVJBVE9SUyxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEzLCAxLCAyMF1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kTmV4dE1hdGNoIHdpdGhvdXQgcmVnZXgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgbGluZSBvbmVcXG5saW5lIHR3b1xcbnRocmVlJyk7XG5cblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKCdsaW5lJywgZmFsc2UsIGZhbHNlLCBudWxsKTtcblxuXHRcdGxldCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMSksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNSkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgYWN0dWFsIS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDYsIDEsIDEwKSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMyksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMSwgNiwgMSwgMTApKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIGFjdHVhbCEucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgyLCAxLCAyLCA1KSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBhY3R1YWwhLnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNSkpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kTmV4dE1hdGNoIHdpdGggYmVnaW5uaW5nIGJvdW5kYXJ5IHJlZ2V4JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdsaW5lIG9uZVxcbmxpbmUgdHdvXFxudGhyZWUnKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJ15saW5lJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXG5cdFx0bGV0IGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigxLCAxKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCAxLCAxLCA1KSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBhY3R1YWwhLnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMiwgMSwgMiwgNSkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDIsIDEsIDIsIDUpKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIGFjdHVhbCEucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCAxLCAxLCA1KSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmROZXh0TWF0Y2ggd2l0aCBiZWdpbm5pbmcgYm91bmRhcnkgcmVnZXggYW5kIGxpbmUgaGFzIHJlcGV0aXRpdmUgYmVnaW5uaW5ncycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnbGluZSBsaW5lIG9uZVxcbmxpbmUgdHdvXFxudGhyZWUnKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJ15saW5lJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXG5cdFx0bGV0IGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigxLCAxKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCAxLCAxLCA1KSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBhY3R1YWwhLnJhbmdlLmdldEVuZFBvc2l0aW9uKCksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMiwgMSwgMiwgNSkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDMpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDIsIDEsIDIsIDUpKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIGFjdHVhbCEucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCAxLCAxLCA1KSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmROZXh0TWF0Y2ggd2l0aCBiZWdpbm5pbmcgYm91bmRhcnkgbXVsdGlsaW5lIHJlZ2V4IGFuZCBsaW5lIGhhcyByZXBldGl0aXZlIGJlZ2lubmluZ3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgbGluZSBvbmVcXG5saW5lIHR3b1xcbmxpbmUgdGhyZWVcXG5saW5lIGZvdXInKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJ15saW5lLipcXFxcbmxpbmUnLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRsZXQgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDEsIDIsIDUpKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIGFjdHVhbCEucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgzLCAxLCA0LCA1KSk7XG5cblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMiwgMSksIGZhbHNlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMiwgMSwgMywgNSkpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kTmV4dE1hdGNoIHdpdGggZW5kaW5nIGJvdW5kYXJ5IHJlZ2V4JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdvbmUgbGluZSBsaW5lXFxudHdvIGxpbmVcXG50aHJlZScpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnbGluZSQnLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRsZXQgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDEwLCAxLCAxNCkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDEsIDEwLCAxLCAxNCkpO1xuXG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgYWN0dWFsIS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDIsIDUsIDIsIDkpKTtcblxuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIGFjdHVhbCEucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgZmFsc2UpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCAxMCwgMSwgMTQpKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZE1hdGNoZXMgd2l0aCBjYXB0dXJpbmcgbWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnb25lIGxpbmUgbGluZVxcbnR3byBsaW5lXFxudGhyZWUnKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJyhsKGluKWUpJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmRNYXRjaGVzKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHRydWUsIDEwMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdG5ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKDEsIDUsIDEsIDkpLCBbJ2xpbmUnLCAnbGluZScsICdpbiddKSxcblx0XHRcdG5ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKDEsIDEwLCAxLCAxNCksIFsnbGluZScsICdsaW5lJywgJ2luJ10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMiwgNSwgMiwgOSksIFsnbGluZScsICdsaW5lJywgJ2luJ10pLFxuXHRcdF0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kTWF0Y2hlcyBtdWx0aWxpbmUgd2l0aCBjYXB0dXJpbmcgbWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnb25lIGxpbmUgbGluZVxcbnR3byBsaW5lXFxudGhyZWUnKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJyhsKGluKWUpXFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE1hdGNoZXMobW9kZWwsIHNlYXJjaFBhcmFtcywgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdHJ1ZSwgMTAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgMTAsIDIsIDEpLCBbJ2xpbmVcXG4nLCAnbGluZScsICdpbiddKSxcblx0XHRcdG5ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKDIsIDUsIDMsIDEpLCBbJ2xpbmVcXG4nLCAnbGluZScsICdpbiddKSxcblx0XHRdKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZE5leHRNYXRjaCB3aXRoIGNhcHR1cmluZyBtYXRjaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdvbmUgbGluZSBsaW5lXFxudHdvIGxpbmVcXG50aHJlZScpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnKGwoaW4pZSknLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaChtb2RlbCwgc2VhcmNoUGFyYW1zLCBuZXcgUG9zaXRpb24oMSwgMSksIHRydWUpO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSgxLCA1LCAxLCA5KSwgWydsaW5lJywgJ2xpbmUnLCAnaW4nXSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmROZXh0TWF0Y2ggbXVsdGlsaW5lIHdpdGggY2FwdHVyaW5nIG1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ29uZSBsaW5lIGxpbmVcXG50d28gbGluZVxcbnRocmVlJyk7XG5cblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKCcobChpbillKVxcXFxuJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCB0cnVlKTtcblx0XHRhc3NlcnRGaW5kTWF0Y2goYWN0dWFsLCBuZXcgUmFuZ2UoMSwgMTAsIDIsIDEpLCBbJ2xpbmVcXG4nLCAnbGluZScsICdpbiddKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZFByZXZpb3VzTWF0Y2ggd2l0aCBjYXB0dXJpbmcgbWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnb25lIGxpbmUgbGluZVxcbnR3byBsaW5lXFxudGhyZWUnKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJyhsKGluKWUpJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmRQcmV2aW91c01hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigxLCAxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDIsIDUsIDIsIDkpLCBbJ2xpbmUnLCAnbGluZScsICdpbiddKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZFByZXZpb3VzTWF0Y2ggbXVsdGlsaW5lIHdpdGggY2FwdHVyaW5nIG1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ29uZSBsaW5lIGxpbmVcXG50d28gbGluZVxcbnRocmVlJyk7XG5cblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKCcobChpbillKVxcXFxuJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmRQcmV2aW91c01hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigxLCAxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDIsIDUsIDMsIDEpLCBbJ2xpbmVcXG4nLCAnbGluZScsICdpbiddKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnXFxcXG4gbWF0Y2hlcyBcXFxcclxcXFxuJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdhXFxyXFxuYlxcclxcbmNcXHJcXG5kXFxyXFxuZVxcclxcbmZcXHJcXG5nXFxyXFxuaFxcclxcbmknKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRFT0woKSwgJ1xcclxcbicpO1xuXG5cdFx0bGV0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoJ2hcXFxcbicsIHRydWUsIGZhbHNlLCBudWxsKTtcblx0XHRsZXQgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCB0cnVlKTtcblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE1hdGNoZXMobW9kZWwsIHNlYXJjaFBhcmFtcywgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdHJ1ZSwgMTAwMClbMF07XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDgsIDEsIDksIDEpLCBbJ2hcXG4nXSk7XG5cblx0XHRzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKCdnXFxcXG5oXFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCk7XG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmROZXh0TWF0Y2gobW9kZWwsIHNlYXJjaFBhcmFtcywgbmV3IFBvc2l0aW9uKDEsIDEpLCB0cnVlKTtcblx0XHRhY3R1YWwgPSBUZXh0TW9kZWxTZWFyY2guZmluZE1hdGNoZXMobW9kZWwsIHNlYXJjaFBhcmFtcywgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdHJ1ZSwgMTAwMClbMF07XG5cdFx0YXNzZXJ0RmluZE1hdGNoKGFjdHVhbCwgbmV3IFJhbmdlKDcsIDEsIDksIDEpLCBbJ2dcXG5oXFxuJ10pO1xuXG5cdFx0c2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnXFxcXG5pJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXHRcdGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigxLCAxKSwgdHJ1ZSk7XG5cdFx0YWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmRNYXRjaGVzKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHRydWUsIDEwMDApWzBdO1xuXHRcdGFzc2VydEZpbmRNYXRjaChhY3R1YWwsIG5ldyBSYW5nZSg4LCAyLCA5LCAyKSwgWydcXG5pJ10pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdcXFxcciBjYW4gbmV2ZXIgYmUgZm91bmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FcXHJcXG5iXFxyXFxuY1xcclxcbmRcXHJcXG5lXFxyXFxuZlxcclxcbmdcXHJcXG5oXFxyXFxuaScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldEVPTCgpLCAnXFxyXFxuJyk7XG5cblx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKCdcXFxcclxcXFxuJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG5ldyBQb3NpdGlvbigxLCAxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgbnVsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChUZXh0TW9kZWxTZWFyY2guZmluZE1hdGNoZXMobW9kZWwsIHNlYXJjaFBhcmFtcywgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdHJ1ZSwgMTAwMCksIFtdKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoc2VhcmNoU3RyaW5nOiBzdHJpbmcsIGlzUmVnZXg6IGJvb2xlYW4sIG1hdGNoQ2FzZTogYm9vbGVhbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZyB8IG51bGwsIGV4cGVjdGVkOiBTZWFyY2hEYXRhIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlYXJjaFBhcmFtcyA9IG5ldyBTZWFyY2hQYXJhbXMoc2VhcmNoU3RyaW5nLCBpc1JlZ2V4LCBtYXRjaENhc2UsIHdvcmRTZXBhcmF0b3JzKTtcblx0XHRjb25zdCBhY3R1YWwgPSBzZWFyY2hQYXJhbXMucGFyc2VTZWFyY2hSZXF1ZXN0KCk7XG5cblx0XHRpZiAoZXhwZWN0ZWQgPT09IG51bGwpIHtcblx0XHRcdGFzc2VydC5vayhhY3R1YWwgPT09IG51bGwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCEucmVnZXgsIGV4cGVjdGVkLnJlZ2V4KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsIS5zaW1wbGVTZWFyY2gsIGV4cGVjdGVkLnNpbXBsZVNlYXJjaCk7XG5cdFx0XHRpZiAod29yZFNlcGFyYXRvcnMpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFjdHVhbCEud29yZFNlcGFyYXRvcnMgIT09IG51bGwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFjdHVhbCEud29yZFNlcGFyYXRvcnMgPT09IG51bGwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ3BhcnNlU2VhcmNoUmVxdWVzdCBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCcnLCB0cnVlLCB0cnVlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMsIG51bGwpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCcoJywgdHJ1ZSwgZmFsc2UsIG51bGwsIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVNlYXJjaFJlcXVlc3Qgbm9uIHJlZ2V4JywgKCkgPT4ge1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb28nLCBmYWxzZSwgZmFsc2UsIG51bGwsIG5ldyBTZWFyY2hEYXRhKC9mb28vZ2l1LCBudWxsLCBudWxsKSk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2ZvbycsIGZhbHNlLCBmYWxzZSwgVVNVQUxfV09SRF9TRVBBUkFUT1JTLCBuZXcgU2VhcmNoRGF0YSgvZm9vL2dpdSwgdXN1YWxXb3JkU2VwYXJhdG9ycywgbnVsbCkpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb28nLCBmYWxzZSwgdHJ1ZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvby9ndSwgbnVsbCwgJ2ZvbycpKTtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vJywgZmFsc2UsIHRydWUsIFVTVUFMX1dPUkRfU0VQQVJBVE9SUywgbmV3IFNlYXJjaERhdGEoL2Zvby9ndSwgdXN1YWxXb3JkU2VwYXJhdG9ycywgJ2ZvbycpKTtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vXFxcXG4nLCBmYWxzZSwgZmFsc2UsIG51bGwsIG5ldyBTZWFyY2hEYXRhKC9mb29cXFxcbi9naXUsIG51bGwsIG51bGwpKTtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vXFxcXFxcXFxuJywgZmFsc2UsIGZhbHNlLCBudWxsLCBuZXcgU2VhcmNoRGF0YSgvZm9vXFxcXFxcXFxuL2dpdSwgbnVsbCwgbnVsbCkpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb29cXFxccicsIGZhbHNlLCBmYWxzZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvb1xcXFxyL2dpdSwgbnVsbCwgbnVsbCkpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb29cXFxcXFxcXHInLCBmYWxzZSwgZmFsc2UsIG51bGwsIG5ldyBTZWFyY2hEYXRhKC9mb29cXFxcXFxcXHIvZ2l1LCBudWxsLCBudWxsKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlU2VhcmNoUmVxdWVzdCByZWdleCcsICgpID0+IHtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vJywgdHJ1ZSwgZmFsc2UsIG51bGwsIG5ldyBTZWFyY2hEYXRhKC9mb28vZ2l1LCBudWxsLCBudWxsKSk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2ZvbycsIHRydWUsIGZhbHNlLCBVU1VBTF9XT1JEX1NFUEFSQVRPUlMsIG5ldyBTZWFyY2hEYXRhKC9mb28vZ2l1LCB1c3VhbFdvcmRTZXBhcmF0b3JzLCBudWxsKSk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2ZvbycsIHRydWUsIHRydWUsIG51bGwsIG5ldyBTZWFyY2hEYXRhKC9mb28vZ3UsIG51bGwsIG51bGwpKTtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vJywgdHJ1ZSwgdHJ1ZSwgVVNVQUxfV09SRF9TRVBBUkFUT1JTLCBuZXcgU2VhcmNoRGF0YSgvZm9vL2d1LCB1c3VhbFdvcmRTZXBhcmF0b3JzLCBudWxsKSk7XG5cdFx0YXNzZXJ0UGFyc2VTZWFyY2hSZXN1bHQoJ2Zvb1xcXFxuJywgdHJ1ZSwgZmFsc2UsIG51bGwsIG5ldyBTZWFyY2hEYXRhKC9mb29cXG4vZ2ltdSwgbnVsbCwgbnVsbCkpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb29cXFxcXFxcXG4nLCB0cnVlLCBmYWxzZSwgbnVsbCwgbmV3IFNlYXJjaERhdGEoL2Zvb1xcXFxuL2dpdSwgbnVsbCwgbnVsbCkpO1xuXHRcdGFzc2VydFBhcnNlU2VhcmNoUmVzdWx0KCdmb29cXFxccicsIHRydWUsIGZhbHNlLCBudWxsLCBuZXcgU2VhcmNoRGF0YSgvZm9vXFxyL2dpbXUsIG51bGwsIG51bGwpKTtcblx0XHRhc3NlcnRQYXJzZVNlYXJjaFJlc3VsdCgnZm9vXFxcXFxcXFxyJywgdHJ1ZSwgZmFsc2UsIG51bGwsIG5ldyBTZWFyY2hEYXRhKC9mb29cXFxcci9naXUsIG51bGwsIG51bGwpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzUzNDE1LiBcXFcgc2hvdWxkIG1hdGNoIGxpbmUgYnJlYWsuJywgKCkgPT4ge1xuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQndGV4dCcsXG5cdFx0XHRcdCcxODA3MDItJyxcblx0XHRcdFx0JzE4MDcwMy0xODA3MDQnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J1xcXFxkezZ9LVxcXFxXJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsyLCAxLCAzLCAxXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdKdXN0J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCdcXFxcVycsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgNSwgMSwgNl0sXG5cdFx0XHRcdFsxLCAxMCwgMSwgMTFdLFxuXHRcdFx0XHRbMSwgMTUsIDIsIDFdLFxuXHRcdFx0XHRbMiwgMSwgMywgMV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0Ly8gTGluZSBicmVhayBkb2Vzbid0IGFmZmVjdCB0aGUgcmVzdWx0IGFzIHdlIGFsd2F5cyB1c2UgXFxuIGFzIGxpbmUgYnJlYWsgd2hlbiBkb2luZyBzZWFyY2hcblx0XHRhc3NlcnRGaW5kTWF0Y2hlcyhcblx0XHRcdFtcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdKdXN0J1xuXHRcdFx0XS5qb2luKCdcXHJcXG4nKSxcblx0XHRcdCdcXFxcVycsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgNSwgMSwgNl0sXG5cdFx0XHRcdFsxLCAxMCwgMSwgMTFdLFxuXHRcdFx0XHRbMSwgMTUsIDIsIDFdLFxuXHRcdFx0XHRbMiwgMSwgMywgMV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRbXG5cdFx0XHRcdCdKdXN0IHNvbWUgdGV4dCcsXG5cdFx0XHRcdCdcXHRKdXN0Jyxcblx0XHRcdFx0J0p1c3QnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0J1xcXFxXJywgdHJ1ZSwgZmFsc2UsIG51bGwsXG5cdFx0XHRbXG5cdFx0XHRcdFsxLCA1LCAxLCA2XSxcblx0XHRcdFx0WzEsIDEwLCAxLCAxMV0sXG5cdFx0XHRcdFsxLCAxNSwgMiwgMV0sXG5cdFx0XHRcdFsyLCAxLCAyLCAyXSxcblx0XHRcdFx0WzIsIDYsIDMsIDFdLFxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHQvLyBsaW5lIGJyZWFrIGlzIHNlZW4gYXMgb25lIG5vbi13b3JkIGNoYXJhY3RlclxuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnSnVzdCAgc29tZSB0ZXh0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdKdXN0J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdCdcXFxcV3syfScsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgNSwgMSwgN10sXG5cdFx0XHRcdFsxLCAxNiwgMywgMV1cblx0XHRcdF1cblx0XHQpO1xuXG5cdFx0Ly8gZXZlbiBpZiBpdCdzIFxcclxcblxuXHRcdGFzc2VydEZpbmRNYXRjaGVzKFxuXHRcdFx0W1xuXHRcdFx0XHQnSnVzdCAgc29tZSB0ZXh0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdKdXN0J1xuXHRcdFx0XS5qb2luKCdcXHJcXG4nKSxcblx0XHRcdCdcXFxcV3syfScsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgNSwgMSwgN10sXG5cdFx0XHRcdFsxLCAxNiwgMywgMV1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdTaW1wbGUgZmluZCB1c2luZyB1bmljb2RlIGVzY2FwZSBzZXF1ZW5jZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoXG5cdFx0XHRyZWd1bGFyVGV4dC5qb2luKCdcXG4nKSxcblx0XHRcdCdcXFxcdXswMDY2fVxcXFx1MDA2ZlxcXFx1MDA2RicsIHRydWUsIGZhbHNlLCBudWxsLFxuXHRcdFx0W1xuXHRcdFx0XHRbMSwgMTQsIDEsIDE3XSxcblx0XHRcdFx0WzEsIDQ0LCAxLCA0N10sXG5cdFx0XHRcdFsyLCAyMiwgMiwgMjVdLFxuXHRcdFx0XHRbMiwgNDgsIDIsIDUxXSxcblx0XHRcdFx0WzQsIDU5LCA0LCA2Ml1cblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc011bHRpbGluZVJlZ2V4U291cmNlJywgKCkgPT4ge1xuXHRcdGFzc2VydCghaXNNdWx0aWxpbmVSZWdleFNvdXJjZSgnZm9vJykpO1xuXHRcdGFzc2VydCghaXNNdWx0aWxpbmVSZWdleFNvdXJjZSgnJykpO1xuXHRcdGFzc2VydCghaXNNdWx0aWxpbmVSZWdleFNvdXJjZSgnZm9vXFxcXHNiYXInKSk7XG5cdFx0YXNzZXJ0KCFpc011bHRpbGluZVJlZ2V4U291cmNlKCdcXFxcXFxcXG5vdG5ld2xpbmUnKSk7XG5cblx0XHRhc3NlcnQoaXNNdWx0aWxpbmVSZWdleFNvdXJjZSgnZm9vXFxcXG5iYXInKSk7XG5cdFx0YXNzZXJ0KGlzTXVsdGlsaW5lUmVnZXhTb3VyY2UoJ2Zvb1xcXFxuYmFyXFxcXHMnKSk7XG5cdFx0YXNzZXJ0KGlzTXVsdGlsaW5lUmVnZXhTb3VyY2UoJ2Zvb1xcXFxyXFxcXG4nKSk7XG5cdFx0YXNzZXJ0KGlzTXVsdGlsaW5lUmVnZXhTb3VyY2UoJ1xcXFxuJykpO1xuXHRcdGFzc2VydChpc011bHRpbGluZVJlZ2V4U291cmNlKCdmb29cXFxcVycpKTtcblx0XHRhc3NlcnQoaXNNdWx0aWxpbmVSZWdleFNvdXJjZSgnZm9vXFxuJykpO1xuXHRcdGFzc2VydChpc011bHRpbGluZVJlZ2V4U291cmNlKCdmb29cXHJcXG4nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzTXVsdGlsaW5lUmVnZXhTb3VyY2UgY29ycmVjdGx5IGlkZW50aWZpZXMgbXVsdGlsaW5lIHBhdHRlcm5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNpbmdsZUxpbmVQYXR0ZXJucyA9IFtcblx0XHRcdCdNQVJLOlxcXFxzKig/PGxhYmVsPi4qKSQnLFxuXHRcdFx0J14vLyBIZWFkZXIkJyxcblx0XHRcdCdcXFxccypbLT1dK1xcXFxzKicsXG5cdFx0XTtcblxuXHRcdGNvbnN0IG11bHRpTGluZVBhdHRlcm5zID0gW1xuXHRcdFx0J15cXC9cXC8gPStcXFxcbl5cXC9cXC8gKD88bGFiZWw+W15cXFxcbl0rPylcXFxcbl5cXC9cXC8gPSskJyxcblx0XHRcdCdoZWFkZXJcXFxcclxcXFxuZm9vdGVyJyxcblx0XHRcdCdzdGFydFxcXFxyfFxcXFxuZW5kJyxcblx0XHRcdCd0b3BcXG5taWRkbGVcXHJcXG5ib3R0b20nXG5cdFx0XTtcblxuXHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBzaW5nbGVMaW5lUGF0dGVybnMpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc011bHRpbGluZVJlZ2V4U291cmNlKHBhdHRlcm4pLCBmYWxzZSwgYFBhdHRlcm4gc2hvdWxkIG5vdCBiZSBtdWx0aWxpbmU6ICR7cGF0dGVybn1gKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgbXVsdGlMaW5lUGF0dGVybnMpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc011bHRpbGluZVJlZ2V4U291cmNlKHBhdHRlcm4pLCB0cnVlLCBgUGF0dGVybiBzaG91bGQgYmUgbXVsdGlsaW5lOiAke3BhdHRlcm59YCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNzQ3MTUuIFxcXFxkKiBmaW5kcyBlbXB0eSBzdHJpbmcgYW5kIHN0b3BzIHNlYXJjaGluZy4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJzEwLjI0My4zMC4xMCcpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcygnXFxcXGQqJywgdHJ1ZSwgZmFsc2UsIG51bGwpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gVGV4dE1vZGVsU2VhcmNoLmZpbmRNYXRjaGVzKG1vZGVsLCBzZWFyY2hQYXJhbXMsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHRydWUsIDEwMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdG5ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKDEsIDEsIDEsIDMpLCBbJzEwJ10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgMywgMSwgMyksIFsnJ10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgNCwgMSwgNyksIFsnMjQzJ10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgNywgMSwgNyksIFsnJ10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgOCwgMSwgMTApLCBbJzMwJ10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgMTAsIDEsIDEwKSwgWycnXSksXG5cdFx0XHRuZXcgRmluZE1hdGNoKG5ldyBSYW5nZSgxLCAxMSwgMSwgMTMpLCBbJzEwJ10pXG5cdFx0XSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMDAxMzQuIFplcm8tbGVuZ3RoIG1hdGNoZXMgc2hvdWxkIHByb3Blcmx5IHN0ZXAgb3ZlciBzdXJyb2dhdGUgcGFpcnMnLCAoKSA9PiB7XG5cdFx0Ly8gMVtMYXB0b3BdMSAtIHRoZXJlIHNob3VkIGJlIG5vIG1hdGNoZXMgaW5zaWRlIG9mIFtMYXB0b3BdIGVtb2ppXG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoJzFcXHVEODNEXFx1RENCQjEnLCAnKCknLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0XHRbMSwgMiwgMSwgMl0sXG5cdFx0XHRcdFsxLCA0LCAxLCA0XSxcblx0XHRcdFx0WzEsIDUsIDEsIDVdLFxuXG5cdFx0XHRdXG5cdFx0KTtcblx0XHQvLyAxW0hhY2tlciBDYXRdMSA9IDFbQ2F0IEZhY2VdW1pXSl1bTGFwdG9wXTEgLSB0aGVyZSBzaG91ZCBiZSBtYXRjaGVzIGJldHdlZW4gZW1vamkgYW5kIFpXSlxuXHRcdC8vIHRoZXJlIHNob3VkIGJlIG5vIG1hdGNoZXMgaW5zaWRlIG9mIFtDYXQgRmFjZV0gYW5kIFtMYXB0b3BdIGVtb2ppXG5cdFx0YXNzZXJ0RmluZE1hdGNoZXMoJzFcXHVEODNEXFx1REMzMVxcdTIwMERcXHVEODNEXFx1RENCQjEnLCAnKCknLCB0cnVlLCBmYWxzZSwgbnVsbCxcblx0XHRcdFtcblx0XHRcdFx0WzEsIDEsIDEsIDFdLFxuXHRcdFx0XHRbMSwgMiwgMSwgMl0sXG5cdFx0XHRcdFsxLCA0LCAxLCA0XSxcblx0XHRcdFx0WzEsIDUsIDEsIDVdLFxuXHRcdFx0XHRbMSwgNywgMSwgN10sXG5cdFx0XHRcdFsxLCA4LCAxLCA4XVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CLFdBQVcsa0JBQWtCO0FBRXpELFNBQVMsY0FBYyxpQkFBaUIsOEJBQThCO0FBQ3RFLFNBQVMsdUJBQXVCO0FBR2hDLE1BQU0sbUJBQW1CLE1BQU07QUFFOUIsMENBQXdDO0FBRXhDLFFBQU0sc0JBQXNCLHdCQUF3Qix1QkFBdUIsQ0FBQyxDQUFDO0FBRTdFLFdBQVMsZ0JBQWdCLFFB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
