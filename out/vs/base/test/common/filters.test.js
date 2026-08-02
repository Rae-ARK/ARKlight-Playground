import assert from "assert";
import { anyScore, createMatches, fuzzyScore, fuzzyScoreGraceful, fuzzyScoreGracefulAggressive, matchesBaseContiguousSubString, matchesCamelCase, matchesContiguousSubString, matchesPrefix, matchesStrictPrefix, matchesSubString, matchesWords, or } from "../../common/filters.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function filterOk(filter, word, wordToMatchAgainst, highlights) {
  const r = filter(word, wordToMatchAgainst);
  assert(r, `${word} didn't match ${wordToMatchAgainst}`);
  if (highlights) {
    assert.deepStrictEqual(r, highlights);
  }
}
function filterNotOk(filter, word, wordToMatchAgainst) {
  assert(!filter(word, wordToMatchAgainst), `${word} matched ${wordToMatchAgainst}`);
}
suite("Filters", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("or", () => {
    let filter;
    let counters;
    const newFilter = function(i, r) {
      return function() {
        counters[i]++;
        return r;
      };
    };
    counters = [0, 0];
    filter = or(newFilter(0, false), newFilter(1, false));
    filterNotOk(filter, "anything", "anything");
    assert.deepStrictEqual(counters, [1, 1]);
    counters = [0, 0];
    filter = or(newFilter(0, true), newFilter(1, false));
    filterOk(filter, "anything", "anything");
    assert.deepStrictEqual(counters, [1, 0]);
    counters = [0, 0];
    filter = or(newFilter(0, true), newFilter(1, true));
    filterOk(filter, "anything", "anything");
    assert.deepStrictEqual(counters, [1, 0]);
    counters = [0, 0];
    filter = or(newFilter(0, false), newFilter(1, true));
    filterOk(filter, "anything", "anything");
    assert.deepStrictEqual(counters, [1, 1]);
  });
  test("PrefixFilter - case sensitive", function() {
    filterNotOk(matchesStrictPrefix, "", "");
    filterOk(matchesStrictPrefix, "", "anything", []);
    filterOk(matchesStrictPrefix, "alpha", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesStrictPrefix, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
    filterNotOk(matchesStrictPrefix, "alpha", "alp");
    filterOk(matchesStrictPrefix, "a", "alpha", [{ start: 0, end: 1 }]);
    filterNotOk(matchesStrictPrefix, "x", "alpha");
    filterNotOk(matchesStrictPrefix, "A", "alpha");
    filterNotOk(matchesStrictPrefix, "AlPh", "alPHA");
  });
  test("PrefixFilter - ignore case", function() {
    filterOk(matchesPrefix, "alpha", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesPrefix, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
    filterNotOk(matchesPrefix, "alpha", "alp");
    filterOk(matchesPrefix, "a", "alpha", [{ start: 0, end: 1 }]);
    filterOk(matchesPrefix, "\xE4", "\xC4lpha", [{ start: 0, end: 1 }]);
    filterNotOk(matchesPrefix, "x", "alpha");
    filterOk(matchesPrefix, "A", "alpha", [{ start: 0, end: 1 }]);
    filterOk(matchesPrefix, "AlPh", "alPHA", [{ start: 0, end: 4 }]);
    filterNotOk(matchesPrefix, "T", "4");
  });
  test("CamelCaseFilter", () => {
    filterNotOk(matchesCamelCase, "", "");
    filterOk(matchesCamelCase, "", "anything", []);
    filterOk(matchesCamelCase, "alpha", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesCamelCase, "AlPhA", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesCamelCase, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
    filterNotOk(matchesCamelCase, "alpha", "alp");
    filterOk(matchesCamelCase, "c", "CamelCaseRocks", [
      { start: 0, end: 1 }
    ]);
    filterOk(matchesCamelCase, "cc", "CamelCaseRocks", [
      { start: 0, end: 1 },
      { start: 5, end: 6 }
    ]);
    filterOk(matchesCamelCase, "ccr", "CamelCaseRocks", [
      { start: 0, end: 1 },
      { start: 5, end: 6 },
      { start: 9, end: 10 }
    ]);
    filterOk(matchesCamelCase, "cacr", "CamelCaseRocks", [
      { start: 0, end: 2 },
      { start: 5, end: 6 },
      { start: 9, end: 10 }
    ]);
    filterOk(matchesCamelCase, "cacar", "CamelCaseRocks", [
      { start: 0, end: 2 },
      { start: 5, end: 7 },
      { start: 9, end: 10 }
    ]);
    filterOk(matchesCamelCase, "ccarocks", "CamelCaseRocks", [
      { start: 0, end: 1 },
      { start: 5, end: 7 },
      { start: 9, end: 14 }
    ]);
    filterOk(matchesCamelCase, "cr", "CamelCaseRocks", [
      { start: 0, end: 1 },
      { start: 9, end: 10 }
    ]);
    filterOk(matchesCamelCase, "fba", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 5 }
    ]);
    filterOk(matchesCamelCase, "fbar", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 6 }
    ]);
    filterOk(matchesCamelCase, "fbara", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 7 }
    ]);
    filterOk(matchesCamelCase, "fbaa", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 5 },
      { start: 6, end: 7 }
    ]);
    filterOk(matchesCamelCase, "fbaab", "FooBarAbe", [
      { start: 0, end: 1 },
      { start: 3, end: 5 },
      { start: 6, end: 8 }
    ]);
    filterOk(matchesCamelCase, "c2d", "canvasCreation2D", [
      { start: 0, end: 1 },
      { start: 14, end: 16 }
    ]);
    filterOk(matchesCamelCase, "cce", "_canvasCreationEvent", [
      { start: 1, end: 2 },
      { start: 7, end: 8 },
      { start: 15, end: 16 }
    ]);
  });
  test("CamelCaseFilter - #19256", function() {
    assert(matchesCamelCase("Debug Console", "Open: Debug Console"));
    assert(matchesCamelCase("Debug console", "Open: Debug Console"));
    assert(matchesCamelCase("debug console", "Open: Debug Console"));
  });
  test("matchesContiguousSubString", () => {
    filterOk(matchesContiguousSubString, "cela", "cancelAnimationFrame()", [
      { start: 3, end: 7 }
    ]);
  });
  test("matchesBaseContiguousSubString", () => {
    filterOk(matchesBaseContiguousSubString, "cela", "cancelAnimationFrame()", [
      { start: 3, end: 7 }
    ]);
    filterOk(matchesBaseContiguousSubString, "cafe", "caf\xE9", [
      { start: 0, end: 4 }
    ]);
    filterOk(matchesBaseContiguousSubString, "cafe", "caf\xE9Bar", [
      { start: 0, end: 4 }
    ]);
    filterOk(matchesBaseContiguousSubString, "resume", "r\xE9sum\xE9", [
      { start: 0, end: 6 }
    ]);
    filterOk(matchesBaseContiguousSubString, "na\xEFve", "na\xEFve", [
      { start: 0, end: 5 }
    ]);
    filterOk(matchesBaseContiguousSubString, "naive", "na\xEFve", [
      { start: 0, end: 5 }
    ]);
    filterOk(matchesBaseContiguousSubString, "aeou", "\xE0\xE9\xF6\xFC", [
      { start: 0, end: 4 }
    ]);
  });
  test("matchesSubString", () => {
    filterOk(matchesSubString, "cmm", "cancelAnimationFrame()", [
      { start: 0, end: 1 },
      { start: 9, end: 10 },
      { start: 18, end: 19 }
    ]);
    filterOk(matchesSubString, "abc", "abcabc", [
      { start: 0, end: 3 }
    ]);
    filterOk(matchesSubString, "abc", "aaabbbccc", [
      { start: 0, end: 1 },
      { start: 3, end: 4 },
      { start: 6, end: 7 }
    ]);
  });
  test("matchesSubString performance (#35346)", function() {
    filterNotOk(matchesSubString, "aaaaaaaaaaaaaaaaaaaax", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });
  test("WordFilter", () => {
    filterOk(matchesWords, "alpha", "alpha", [{ start: 0, end: 5 }]);
    filterOk(matchesWords, "alpha", "alphasomething", [{ start: 0, end: 5 }]);
    filterNotOk(matchesWords, "alpha", "alp");
    filterOk(matchesWords, "a", "alpha", [{ start: 0, end: 1 }]);
    filterNotOk(matchesWords, "x", "alpha");
    filterOk(matchesWords, "A", "alpha", [{ start: 0, end: 1 }]);
    filterOk(matchesWords, "AlPh", "alPHA", [{ start: 0, end: 4 }]);
    assert(matchesWords("Debug Console", "Open: Debug Console"));
    filterOk(matchesWords, "gp", "Git: Pull", [{ start: 0, end: 1 }, { start: 5, end: 6 }]);
    filterOk(matchesWords, "g p", "Git: Pull", [{ start: 0, end: 1 }, { start: 5, end: 6 }]);
    filterOk(matchesWords, "gipu", "Git: Pull", [{ start: 0, end: 2 }, { start: 5, end: 7 }]);
    filterOk(matchesWords, "gp", "Category: Git: Pull", [{ start: 10, end: 11 }, { start: 15, end: 16 }]);
    filterOk(matchesWords, "g p", "Category: Git: Pull", [{ start: 10, end: 11 }, { start: 15, end: 16 }]);
    filterOk(matchesWords, "gipu", "Category: Git: Pull", [{ start: 10, end: 12 }, { start: 15, end: 17 }]);
    filterNotOk(matchesWords, "it", "Git: Pull");
    filterNotOk(matchesWords, "ll", "Git: Pull");
    filterOk(matchesWords, "git: \u30D7\u30EB", "git: \u30D7\u30EB", [{ start: 0, end: 7 }]);
    filterOk(matchesWords, "git \u30D7\u30EB", "git: \u30D7\u30EB", [{ start: 0, end: 3 }, { start: 5, end: 7 }]);
    filterOk(matchesWords, "\xF6\xE4k", "\xD6hm: \xC4lles Klar", [{ start: 0, end: 1 }, { start: 5, end: 6 }, { start: 11, end: 12 }]);
    filterOk(matchesWords, "C++", "C/C++: command", [{ start: 2, end: 5 }]);
    filterOk(matchesWords, ".", ":", []);
    filterOk(matchesWords, ".", ".", [{ start: 0, end: 1 }]);
    filterOk(matchesWords, "bar", "foo-bar");
    filterOk(matchesWords, "bar test", "foo-bar test");
    filterOk(matchesWords, "fbt", "foo-bar test");
    filterOk(matchesWords, "bar test", "foo-bar (test)");
    filterOk(matchesWords, "foo bar", "foo (bar)");
    filterNotOk(matchesWords, "bar est", "foo-bar test");
    filterNotOk(matchesWords, "fo ar", "foo-bar test");
    filterNotOk(matchesWords, "for", "foo-bar test");
    filterOk(matchesWords, "foo bar", "foo-bar");
    filterOk(matchesWords, "foo bar", "123 foo-bar 456");
    filterOk(matchesWords, "foo-bar", "foo bar");
    filterOk(matchesWords, "foo:bar", "foo:bar");
  });
  test("matchesWords performance (#309582)", function() {
    const targets = [
      "workbench.action.terminal.focusNextLine",
      "editor.action.clipboardCopyAction",
      "workbench.action.editor.changeLanguageMode",
      "editor.action.smartSelect.expand",
      "workbench.action.files.saveAll"
    ];
    for (let i = 0; i < 1e3; i++) {
      for (const t of targets) {
        matchesWords("editor.action", t);
      }
    }
  });
  function assertMatches(pattern, word, decoratedWord, filter, opts = {}) {
    const r = filter(pattern, pattern.toLowerCase(), opts.patternPos || 0, word, word.toLowerCase(), opts.wordPos || 0, { firstMatchCanBeWeak: opts.firstMatchCanBeWeak ?? false, boostFullMatch: true });
    assert.ok(!decoratedWord === !r);
    if (r) {
      const matches = createMatches(r);
      let actualWord = "";
      let pos = 0;
      for (const match of matches) {
        actualWord += word.substring(pos, match.start);
        actualWord += "^" + word.substring(match.start, match.end).split("").join("^");
        pos = match.end;
      }
      actualWord += word.substring(pos);
      assert.strictEqual(actualWord, decoratedWord);
    }
  }
  test("fuzzyScore, #23215", function() {
    assertMatches("tit", "win.tit", "win.^t^i^t", fuzzyScore);
    assertMatches("title", "win.title", "win.^t^i^t^l^e", fuzzyScore);
    assertMatches("WordCla", "WordCharacterClassifier", "^W^o^r^dCharacter^C^l^assifier", fuzzyScore);
    assertMatches("WordCCla", "WordCharacterClassifier", "^W^o^r^d^Character^C^l^assifier", fuzzyScore);
  });
  test("fuzzyScore, #23332", function() {
    assertMatches("dete", '"editor.quickSuggestionsDelay"', void 0, fuzzyScore);
  });
  test("fuzzyScore, #23190", function() {
    assertMatches("c:\\do", "& 'C:\\Documents and Settings'", "& '^C^:^\\^D^ocuments and Settings'", fuzzyScore);
    assertMatches("c:\\do", "& 'c:\\Documents and Settings'", "& '^c^:^\\^D^ocuments and Settings'", fuzzyScore);
  });
  test("fuzzyScore, #23581", function() {
    assertMatches("close", "css.lint.importStatement", "^css.^lint.imp^ort^Stat^ement", fuzzyScore);
    assertMatches("close", "css.colorDecorators.enable", "^css.co^l^orDecorator^s.^enable", fuzzyScore);
    assertMatches("close", "workbench.quickOpen.closeOnFocusOut", "workbench.quickOpen.^c^l^o^s^eOnFocusOut", fuzzyScore);
    assertTopScore(fuzzyScore, "close", 2, "css.lint.importStatement", "css.colorDecorators.enable", "workbench.quickOpen.closeOnFocusOut");
  });
  test("fuzzyScore, #23458", function() {
    assertMatches("highlight", "editorHoverHighlight", "editorHover^H^i^g^h^l^i^g^h^t", fuzzyScore);
    assertMatches("hhighlight", "editorHoverHighlight", "editor^Hover^H^i^g^h^l^i^g^h^t", fuzzyScore);
    assertMatches("dhhighlight", "editorHoverHighlight", void 0, fuzzyScore);
  });
  test("fuzzyScore, #23746", function() {
    assertMatches("-moz", "-moz-foo", "^-^m^o^z-foo", fuzzyScore);
    assertMatches("moz", "-moz-foo", "-^m^o^z-foo", fuzzyScore);
    assertMatches("moz", "-moz-animation", "-^m^o^z-animation", fuzzyScore);
    assertMatches("moza", "-moz-animation", "-^m^o^z-^animation", fuzzyScore);
  });
  test("fuzzyScore", () => {
    assertMatches("ab", "abA", "^a^bA", fuzzyScore);
    assertMatches("ccm", "cacmelCase", "^ca^c^melCase", fuzzyScore);
    assertMatches("bti", "the_black_knight", void 0, fuzzyScore);
    assertMatches("ccm", "camelCase", void 0, fuzzyScore);
    assertMatches("cmcm", "camelCase", void 0, fuzzyScore);
    assertMatches("BK", "the_black_knight", "the_^black_^knight", fuzzyScore);
    assertMatches("KeyboardLayout=", "KeyboardLayout", void 0, fuzzyScore);
    assertMatches("LLL", "SVisualLoggerLogsList", "SVisual^Logger^Logs^List", fuzzyScore);
    assertMatches("LLLL", "SVilLoLosLi", void 0, fuzzyScore);
    assertMatches("LLLL", "SVisualLoggerLogsList", void 0, fuzzyScore);
    assertMatches("TEdit", "TextEdit", "^Text^E^d^i^t", fuzzyScore);
    assertMatches("TEdit", "TextEditor", "^Text^E^d^i^tor", fuzzyScore);
    assertMatches("TEdit", "Textedit", "^Text^e^d^i^t", fuzzyScore);
    assertMatches("TEdit", "text_edit", "^text_^e^d^i^t", fuzzyScore);
    assertMatches("TEditDit", "TextEditorDecorationType", "^Text^E^d^i^tor^Decorat^ion^Type", fuzzyScore);
    assertMatches("TEdit", "TextEditorDecorationType", "^Text^E^d^i^torDecorationType", fuzzyScore);
    assertMatches("Tedit", "TextEdit", "^Text^E^d^i^t", fuzzyScore);
    assertMatches("ba", "?AB?", void 0, fuzzyScore);
    assertMatches("bkn", "the_black_knight", "the_^black_^k^night", fuzzyScore);
    assertMatches("bt", "the_black_knight", "the_^black_knigh^t", fuzzyScore);
    assertMatches("ccm", "camelCasecm", "^camel^Casec^m", fuzzyScore);
    assertMatches("fdm", "findModel", "^fin^d^Model", fuzzyScore);
    assertMatches("fob", "foobar", "^f^oo^bar", fuzzyScore);
    assertMatches("fobz", "foobar", void 0, fuzzyScore);
    assertMatches("foobar", "foobar", "^f^o^o^b^a^r", fuzzyScore);
    assertMatches("form", "editor.formatOnSave", "editor.^f^o^r^matOnSave", fuzzyScore);
    assertMatches("g p", "Git: Pull", "^Git:^ ^Pull", fuzzyScore);
    assertMatches("g p", "Git: Pull", "^Git:^ ^Pull", fuzzyScore);
    assertMatches("gip", "Git: Pull", "^G^it: ^Pull", fuzzyScore);
    assertMatches("gip", "Git: Pull", "^G^it: ^Pull", fuzzyScore);
    assertMatches("gp", "Git: Pull", "^Git: ^Pull", fuzzyScore);
    assertMatches("gp", "Git_Git_Pull", "^Git_Git_^Pull", fuzzyScore);
    assertMatches("is", "ImportStatement", "^Import^Statement", fuzzyScore);
    assertMatches("is", "isValid", "^i^sValid", fuzzyScore);
    assertMatches("lowrd", "lowWord", "^l^o^wWo^r^d", fuzzyScore);
    assertMatches("myvable", "myvariable", "^m^y^v^aria^b^l^e", fuzzyScore);
    assertMatches("no", "", void 0, fuzzyScore);
    assertMatches("no", "match", void 0, fuzzyScore);
    assertMatches("ob", "foobar", void 0, fuzzyScore);
    assertMatches("sl", "SVisualLoggerLogsList", "^SVisual^LoggerLogsList", fuzzyScore);
    assertMatches("sllll", "SVisualLoggerLogsList", "^SVisua^l^Logger^Logs^List", fuzzyScore);
    assertMatches("Three", "HTMLHRElement", void 0, fuzzyScore);
    assertMatches("Three", "Three", "^T^h^r^e^e", fuzzyScore);
    assertMatches("fo", "barfoo", void 0, fuzzyScore);
    assertMatches("fo", "bar_foo", "bar_^f^oo", fuzzyScore);
    assertMatches("fo", "bar_Foo", "bar_^F^oo", fuzzyScore);
    assertMatches("fo", "bar foo", "bar ^f^oo", fuzzyScore);
    assertMatches("fo", "bar.foo", "bar.^f^oo", fuzzyScore);
    assertMatches("fo", "bar/foo", "bar/^f^oo", fuzzyScore);
    assertMatches("fo", "bar\\foo", "bar\\^f^oo", fuzzyScore);
  });
  test("fuzzyScore (first match can be weak)", function() {
    assertMatches("Three", "HTMLHRElement", "H^TML^H^R^El^ement", fuzzyScore, { firstMatchCanBeWeak: true });
    assertMatches("tor", "constructor", "construc^t^o^r", fuzzyScore, { firstMatchCanBeWeak: true });
    assertMatches("ur", "constructor", "constr^ucto^r", fuzzyScore, { firstMatchCanBeWeak: true });
    assertTopScore(fuzzyScore, "tor", 2, "constructor", "Thor", "cTor");
  });
  test("fuzzyScore, many matches", function() {
    assertMatches(
      "aaaaaa",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "^a^a^a^a^a^aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fuzzyScore
    );
  });
  test("Freeze when fjfj -> jfjf, https://github.com/microsoft/vscode/issues/91807", function() {
    assertMatches(
      "jfjfj",
      "fjfjfjfjfjfjfjfjfjfjfj",
      void 0,
      fuzzyScore
    );
    assertMatches(
      "jfjfjfjfjfjfjfjfjfj",
      "fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      void 0,
      fuzzyScore
    );
    assertMatches(
      "jfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfjjfjfjfjfjfjfjfjfjfj",
      "fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      void 0,
      fuzzyScore
    );
    assertMatches(
      "jfjfjfjfjfjfjfjfjfj",
      "fJfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      "f^J^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^jfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      // strong match
      fuzzyScore
    );
    assertMatches(
      "jfjfjfjfjfjfjfjfjfj",
      "fjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      "f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^j^f^jfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfjfj",
      // any match
      fuzzyScore,
      { firstMatchCanBeWeak: true }
    );
  });
  test("fuzzyScore, issue #26423", function() {
    assertMatches("baba", "abababab", void 0, fuzzyScore);
    assertMatches(
      "fsfsfs",
      "dsafdsafdsafdsafdsafdsafdsafasdfdsa",
      void 0,
      fuzzyScore
    );
    assertMatches(
      "fsfsfsfsfsfsfsf",
      "dsafdsafdsafdsafdsafdsafdsafasdfdsafdsafdsafdsafdsfdsafdsfdfdfasdnfdsajfndsjnafjndsajlknfdsa",
      void 0,
      fuzzyScore
    );
  });
  test("Fuzzy IntelliSense matching vs Haxe metadata completion, #26995", function() {
    assertMatches("f", ":Foo", ":^Foo", fuzzyScore);
    assertMatches("f", ":foo", ":^foo", fuzzyScore);
  });
  test("Separator only match should not be weak #79558", function() {
    assertMatches(".", "foo.bar", "foo^.bar", fuzzyScore);
  });
  test("Cannot set property '1' of undefined, #26511", function() {
    const word = new Array(123).join("a");
    const pattern = new Array(120).join("a");
    fuzzyScore(pattern, pattern.toLowerCase(), 0, word, word.toLowerCase(), 0);
    assert.ok(true);
  });
  test("Vscode 1.12 no longer obeys 'sortText' in completion items (from language server), #26096", function() {
    assertMatches("  ", "  group", void 0, fuzzyScore, { patternPos: 2 });
    assertMatches("  g", "  group", "  ^group", fuzzyScore, { patternPos: 2 });
    assertMatches("g", "  group", "  ^group", fuzzyScore);
    assertMatches("g g", "  groupGroup", void 0, fuzzyScore);
    assertMatches("g g", "  group Group", "  ^group^ ^Group", fuzzyScore);
    assertMatches(" g g", "  group Group", "  ^group^ ^Group", fuzzyScore, { patternPos: 1 });
    assertMatches("zz", "zzGroup", "^z^zGroup", fuzzyScore);
    assertMatches("zzg", "zzGroup", "^z^z^Group", fuzzyScore);
    assertMatches("g", "zzGroup", "zz^Group", fuzzyScore);
  });
  test("patternPos isn't working correctly #79815", function() {
    assertMatches(":p".substr(1), "prop", "^prop", fuzzyScore, { patternPos: 0 });
    assertMatches(":p", "prop", "^prop", fuzzyScore, { patternPos: 1 });
    assertMatches(":p", "prop", void 0, fuzzyScore, { patternPos: 2 });
    assertMatches(":p", "proP", "pro^P", fuzzyScore, { patternPos: 1, wordPos: 1 });
    assertMatches(":p", "aprop", "a^prop", fuzzyScore, { patternPos: 1, firstMatchCanBeWeak: true });
    assertMatches(":p", "aprop", void 0, fuzzyScore, { patternPos: 1, firstMatchCanBeWeak: false });
  });
  function assertTopScore(filter, pattern, expected, ...words) {
    let topScore = -(100 * 10);
    let topIdx = 0;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const m = filter(pattern, pattern.toLowerCase(), 0, word, word.toLowerCase(), 0);
      if (m) {
        const [score] = m;
        if (score > topScore) {
          topScore = score;
          topIdx = i;
        }
      }
    }
    assert.strictEqual(topIdx, expected, `${pattern} -> actual=${words[topIdx]} <> expected=${words[expected]}`);
  }
  test("topScore - fuzzyScore", function() {
    assertTopScore(fuzzyScore, "cons", 2, "ArrayBufferConstructor", "Console", "console");
    assertTopScore(fuzzyScore, "Foo", 1, "foo", "Foo", "foo");
    assertTopScore(fuzzyScore, "onMess", 1, "onmessage", "onMessage", "onThisMegaEscape");
    assertTopScore(fuzzyScore, "CC", 1, "camelCase", "CamelCase");
    assertTopScore(fuzzyScore, "cC", 0, "camelCase", "CamelCase");
    assertTopScore(fuzzyScore, "p", 4, "parse", "posix", "pafdsa", "path", "p");
    assertTopScore(fuzzyScore, "pa", 0, "parse", "pafdsa", "path");
    assertTopScore(fuzzyScore, "log", 3, "HTMLOptGroupElement", "ScrollLogicalPosition", "SVGFEMorphologyElement", "log", "logger");
    assertTopScore(fuzzyScore, "e", 2, "AbstractWorker", "ActiveXObject", "else");
    assertTopScore(fuzzyScore, "workbench.sideb", 1, "workbench.editor.defaultSideBySideLayout", "workbench.sideBar.location");
    assertTopScore(fuzzyScore, "editor.r", 2, "diffEditor.renderSideBySide", "editor.overviewRulerlanes", "editor.renderControlCharacter", "editor.renderWhitespace");
    assertTopScore(fuzzyScore, "-mo", 1, "-ms-ime-mode", "-moz-columns");
    assertTopScore(fuzzyScore, "convertModelPosition", 0, "convertModelPositionToViewPosition", "convertViewToModelPosition");
    assertTopScore(fuzzyScore, "is", 0, "isValidViewletId", "import statement");
    assertTopScore(fuzzyScore, "title", 1, "files.trimTrailingWhitespace", "window.title");
    assertTopScore(fuzzyScore, "const", 1, "constructor", "const", "cuOnstrul");
  });
  test("Unexpected suggestion scoring, #28791", function() {
    assertTopScore(fuzzyScore, "_lines", 1, "_lineStarts", "_lines");
    assertTopScore(fuzzyScore, "_lines", 1, "_lineS", "_lines");
    assertTopScore(fuzzyScore, "_lineS", 0, "_lineS", "_lines");
  });
  test.skip('Bad completion ranking changes valid variable name to class name when pressing "." #187055', function() {
    assertTopScore(fuzzyScore, "a", 1, "A", "a");
    assertTopScore(fuzzyScore, "theme", 1, "Theme", "theme");
  });
  test("HTML closing tag proposal filtered out #38880", function() {
    assertMatches("		<", "		</body>", "^	^	^</body>", fuzzyScore, { patternPos: 0 });
    assertMatches("		<", "		</body>", "		^</body>", fuzzyScore, { patternPos: 2 });
    assertMatches("	<", "	</body>", "	^</body>", fuzzyScore, { patternPos: 1 });
  });
  test("fuzzyScoreGraceful", () => {
    assertMatches("rlut", "result", void 0, fuzzyScore);
    assertMatches("rlut", "result", "^res^u^l^t", fuzzyScoreGraceful);
    assertMatches("cno", "console", "^co^ns^ole", fuzzyScore);
    assertMatches("cno", "console", "^co^ns^ole", fuzzyScoreGraceful);
    assertMatches("cno", "console", "^c^o^nsole", fuzzyScoreGracefulAggressive);
    assertMatches("cno", "co_new", "^c^o_^new", fuzzyScoreGraceful);
    assertMatches("cno", "co_new", "^c^o_^new", fuzzyScoreGracefulAggressive);
  });
  test("List highlight filter: Not all characters from match are highlighterd #66923", () => {
    assertMatches("foo", "barbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo", "barbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_^f^o^o", fuzzyScore);
  });
  test("Autocompletion is matched against truncated filterText to 54 characters #74133", () => {
    assertMatches(
      "foo",
      "ffffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo",
      "ffffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_^f^o^o",
      fuzzyScore
    );
    assertMatches(
      "Aoo",
      "Affffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo",
      "^Affffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_f^o^o",
      fuzzyScore
    );
    assertMatches(
      "foo",
      "Gffffffffffffffffffffffffffffbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbarbar_foo",
      void 0,
      fuzzyScore
    );
  });
  test(`"Go to Symbol" with the exact method name doesn't work as expected #84787`, function() {
    const match = fuzzyScore(":get", ":get", 1, "get", "get", 0, { firstMatchCanBeWeak: true, boostFullMatch: true });
    assert.ok(Boolean(match));
  });
  test("Wrong highlight after emoji #113404", function() {
    assertMatches("di", '\u2728div classname=""></div>', '\u2728^d^iv classname=""></div>', fuzzyScore);
    assertMatches("di", 'adiv classname=""></div>', 'adiv classname=""></^d^iv>', fuzzyScore);
  });
  test("Suggestion is not highlighted #85826", function() {
    assertMatches("SemanticTokens", "SemanticTokensEdits", "^S^e^m^a^n^t^i^c^T^o^k^e^n^sEdits", fuzzyScore);
    assertMatches("SemanticTokens", "SemanticTokensEdits", "^S^e^m^a^n^t^i^c^T^o^k^e^n^sEdits", fuzzyScoreGracefulAggressive);
  });
  test("IntelliSense completion not correctly highlighting text in front of cursor #115250", function() {
    assertMatches("lo", "log", "^l^og", fuzzyScore);
    assertMatches(".lo", "log", "^l^og", anyScore);
    assertMatches(".", "log", "log", anyScore);
  });
  test("anyScore should not require a strong first match", function() {
    assertMatches("bar", "foobAr", "foo^b^A^r", anyScore);
    assertMatches("bar", "foobar", "foo^b^a^r", anyScore);
  });
  test("configurable full match boost", function() {
    const prefix = "create";
    const a = "createModelServices";
    const b = "create";
    let aBoost = fuzzyScore(prefix, prefix, 0, a, a.toLowerCase(), 0, { boostFullMatch: true, firstMatchCanBeWeak: true });
    let bBoost = fuzzyScore(prefix, prefix, 0, b, b.toLowerCase(), 0, { boostFullMatch: true, firstMatchCanBeWeak: true });
    assert.ok(aBoost);
    assert.ok(bBoost);
    assert.ok(aBoost[0] < bBoost[0]);
    const wordPrefix = "$(symbol-function) ";
    aBoost = fuzzyScore(prefix, prefix, 0, `${wordPrefix}${a}`, `${wordPrefix}${a}`.toLowerCase(), wordPrefix.length, { boostFullMatch: true, firstMatchCanBeWeak: true });
    bBoost = fuzzyScore(prefix, prefix, 0, `${wordPrefix}${b}`, `${wordPrefix}${b}`.toLowerCase(), wordPrefix.length, { boostFullMatch: true, firstMatchCanBeWeak: true });
    assert.ok(aBoost);
    assert.ok(bBoost);
    assert.ok(aBoost[0] < bBoost[0]);
    const aScore = fuzzyScore(prefix, prefix, 0, a, a.toLowerCase(), 0, { boostFullMatch: false, firstMatchCanBeWeak: true });
    const bScore = fuzzyScore(prefix, prefix, 0, b, b.toLowerCase(), 0, { boostFullMatch: false, firstMatchCanBeWeak: true });
    assert.ok(aScore);
    assert.ok(bScore);
    assert.ok(aScore[0] === bScore[0]);
  });
  test("Unexpected suggest highlighting ignores whole word match in favor of matching first letter#147423", function() {
    assertMatches("i", "machine/{id}", "machine/{^id}", fuzzyScore);
    assertMatches("ok", "obobobf{ok}/user", "^obobobf{o^k}/user", fuzzyScore);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vZmlsdGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGFueVNjb3JlLCBjcmVhdGVNYXRjaGVzLCBmdXp6eVNjb3JlLCBmdXp6eVNjb3JlR3JhY2VmdWwsIGZ1enp5U2NvcmVHcmFjZWZ1bEFnZ3Jlc3NpdmUsIEZ1enp5U2NvcmVyLCBJRmlsdGVyLCBJTWF0Y2gsIG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZywgbWF0Y2hlc0NhbWVsQ2FzZSwgbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcsIG1hdGNoZXNQcmVmaXgsIG1hdGNoZXNTdHJpY3RQcmVmaXgsIG1hdGNoZXNTdWJTdHJpbmcsIG1hdGNoZXNXb3Jkcywgb3IgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuZnVuY3Rpb24gZmlsdGVyT2soZmlsdGVyOiBJRmlsdGVyLCB3b3JkOiBzdHJpbmcsIHdvcmRUb01hdGNoQWdhaW5zdDogc3RyaW5nLCBoaWdobGlnaHRzPzogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlciB9W10pIHtcblx0Y29uc3QgciA9IGZpbHRlcih3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QpO1xuXHRhc3NlcnQociwgYCR7d29yZH0gZGlkbid0IG1hdGNoICR7d29yZFRvTWF0Y2hBZ2FpbnN0fWApO1xuXHRpZiAoaGlnaGxpZ2h0cykge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwociwgaGlnaGxpZ2h0cyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmlsdGVyTm90T2soZmlsdGVyOiBJRmlsdGVyLCB3b3JkOiBzdHJpbmcsIHdvcmRUb01hdGNoQWdhaW5zdDogc3RyaW5nKSB7XG5cdGFzc2VydCghZmlsdGVyKHdvcmQsIHdvcmRUb01hdGNoQWdhaW5zdCksIGAke3dvcmR9IG1hdGNoZWQgJHt3b3JkVG9NYXRjaEFnYWluc3R9YCk7XG59XG5cbnN1aXRlKCdGaWx0ZXJzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdvcicsICgpID0+IHtcblx0XHRsZXQgZmlsdGVyOiBJRmlsdGVyO1xuXHRcdGxldCBjb3VudGVyczogbnVtYmVyW107XG5cdFx0Y29uc3QgbmV3RmlsdGVyID0gZnVuY3Rpb24gKGk6IG51bWJlciwgcjogYm9vbGVhbik6IElGaWx0ZXIge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4gZnVuY3Rpb24gKCk6IElNYXRjaFtdIHsgY291bnRlcnNbaV0rKzsgcmV0dXJuIHIgYXMgYW55OyB9O1xuXHRcdH07XG5cblx0XHRjb3VudGVycyA9IFswLCAwXTtcblx0XHRmaWx0ZXIgPSBvcihuZXdGaWx0ZXIoMCwgZmFsc2UpLCBuZXdGaWx0ZXIoMSwgZmFsc2UpKTtcblx0XHRmaWx0ZXJOb3RPayhmaWx0ZXIsICdhbnl0aGluZycsICdhbnl0aGluZycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY291bnRlcnMsIFsxLCAxXSk7XG5cblx0XHRjb3VudGVycyA9IFswLCAwXTtcblx0XHRmaWx0ZXIgPSBvcihuZXdGaWx0ZXIoMCwgdHJ1ZSksIG5ld0ZpbHRlcigxLCBmYWxzZSkpO1xuXHRcdGZpbHRlck9rKGZpbHRlciwgJ2FueXRoaW5nJywgJ2FueXRoaW5nJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb3VudGVycywgWzEsIDBdKTtcblxuXHRcdGNvdW50ZXJzID0gWzAsIDBdO1xuXHRcdGZpbHRlciA9IG9yKG5ld0ZpbHRlcigwLCB0cnVlKSwgbmV3RmlsdGVyKDEsIHRydWUpKTtcblx0XHRmaWx0ZXJPayhmaWx0ZXIsICdhbnl0aGluZycsICdhbnl0aGluZycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY291bnRlcnMsIFsxLCAwXSk7XG5cblx0XHRjb3VudGVycyA9IFswLCAwXTtcblx0XHRmaWx0ZXIgPSBvcihuZXdGaWx0ZXIoMCwgZmFsc2UpLCBuZXdGaWx0ZXIoMSwgdHJ1ZSkpO1xuXHRcdGZpbHRlck9rKGZpbHRlciwgJ2FueXRoaW5nJywgJ2FueXRoaW5nJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb3VudGVycywgWzEsIDFdKTtcblx0fSk7XG5cblx0dGVzdCgnUHJlZml4RmlsdGVyIC0gY2FzZSBzZW5zaXRpdmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1N0cmljdFByZWZpeCwgJycsICcnKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzU3RyaWN0UHJlZml4LCAnJywgJ2FueXRoaW5nJywgW10pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNTdHJpY3RQcmVmaXgsICdhbHBoYScsICdhbHBoYScsIFt7IHN0YXJ0OiAwLCBlbmQ6IDUgfV0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNTdHJpY3RQcmVmaXgsICdhbHBoYScsICdhbHBoYXNvbWV0aGluZycsIFt7IHN0YXJ0OiAwLCBlbmQ6IDUgfV0pO1xuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNTdHJpY3RQcmVmaXgsICdhbHBoYScsICdhbHAnKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzU3RyaWN0UHJlZml4LCAnYScsICdhbHBoYScsIFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pO1xuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNTdHJpY3RQcmVmaXgsICd4JywgJ2FscGhhJyk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1N0cmljdFByZWZpeCwgJ0EnLCAnYWxwaGEnKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzU3RyaWN0UHJlZml4LCAnQWxQaCcsICdhbFBIQScpO1xuXHR9KTtcblxuXHR0ZXN0KCdQcmVmaXhGaWx0ZXIgLSBpZ25vcmUgY2FzZScsIGZ1bmN0aW9uICgpIHtcblx0XHRmaWx0ZXJPayhtYXRjaGVzUHJlZml4LCAnYWxwaGEnLCAnYWxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiA1IH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzUHJlZml4LCAnYWxwaGEnLCAnYWxwaGFzb21ldGhpbmcnLCBbeyBzdGFydDogMCwgZW5kOiA1IH1dKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzUHJlZml4LCAnYWxwaGEnLCAnYWxwJyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1ByZWZpeCwgJ2EnLCAnYWxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzUHJlZml4LCAnXHUwMEU0JywgJ1x1MDBDNGxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzUHJlZml4LCAneCcsICdhbHBoYScpO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNQcmVmaXgsICdBJywgJ2FscGhhJywgW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1ByZWZpeCwgJ0FsUGgnLCAnYWxQSEEnLCBbeyBzdGFydDogMCwgZW5kOiA0IH1dKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzUHJlZml4LCAnVCcsICc0Jyk7IC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjI0MDFcblx0fSk7XG5cblx0dGVzdCgnQ2FtZWxDYXNlRmlsdGVyJywgKCkgPT4ge1xuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNDYW1lbENhc2UsICcnLCAnJyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJycsICdhbnl0aGluZycsIFtdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnYWxwaGEnLCAnYWxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiA1IH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnQWxQaEEnLCAnYWxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiA1IH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnYWxwaGEnLCAnYWxwaGFzb21ldGhpbmcnLCBbeyBzdGFydDogMCwgZW5kOiA1IH1dKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzQ2FtZWxDYXNlLCAnYWxwaGEnLCAnYWxwJyk7XG5cblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnYycsICdDYW1lbENhc2VSb2NrcycsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMSB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2NjJywgJ0NhbWVsQ2FzZVJvY2tzJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHR7IHN0YXJ0OiA1LCBlbmQ6IDYgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICdjY3InLCAnQ2FtZWxDYXNlUm9ja3MnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDUsIGVuZDogNiB9LFxuXHRcdFx0eyBzdGFydDogOSwgZW5kOiAxMCB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2NhY3InLCAnQ2FtZWxDYXNlUm9ja3MnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDIgfSxcblx0XHRcdHsgc3RhcnQ6IDUsIGVuZDogNiB9LFxuXHRcdFx0eyBzdGFydDogOSwgZW5kOiAxMCB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0NhbWVsQ2FzZSwgJ2NhY2FyJywgJ0NhbWVsQ2FzZVJvY2tzJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAyIH0sXG5cdFx0XHR7IHN0YXJ0OiA1LCBlbmQ6IDcgfSxcblx0XHRcdHsgc3RhcnQ6IDksIGVuZDogMTAgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICdjY2Fyb2NrcycsICdDYW1lbENhc2VSb2NrcycsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMSB9LFxuXHRcdFx0eyBzdGFydDogNSwgZW5kOiA3IH0sXG5cdFx0XHR7IHN0YXJ0OiA5LCBlbmQ6IDE0IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnY3InLCAnQ2FtZWxDYXNlUm9ja3MnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDksIGVuZDogMTAgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICdmYmEnLCAnRm9vQmFyQWJlJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDUgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICdmYmFyJywgJ0Zvb0JhckFiZScsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMSB9LFxuXHRcdFx0eyBzdGFydDogMywgZW5kOiA2IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnZmJhcmEnLCAnRm9vQmFyQWJlJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAxIH0sXG5cdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDcgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICdmYmFhJywgJ0Zvb0JhckFiZScsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMSB9LFxuXHRcdFx0eyBzdGFydDogMywgZW5kOiA1IH0sXG5cdFx0XHR7IHN0YXJ0OiA2LCBlbmQ6IDcgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNDYW1lbENhc2UsICdmYmFhYicsICdGb29CYXJBYmUnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDMsIGVuZDogNSB9LFxuXHRcdFx0eyBzdGFydDogNiwgZW5kOiA4IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnYzJkJywgJ2NhbnZhc0NyZWF0aW9uMkQnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDE0LCBlbmQ6IDE2IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ2FtZWxDYXNlLCAnY2NlJywgJ19jYW52YXNDcmVhdGlvbkV2ZW50JywgW1xuXHRcdFx0eyBzdGFydDogMSwgZW5kOiAyIH0sXG5cdFx0XHR7IHN0YXJ0OiA3LCBlbmQ6IDggfSxcblx0XHRcdHsgc3RhcnQ6IDE1LCBlbmQ6IDE2IH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQ2FtZWxDYXNlRmlsdGVyIC0gIzE5MjU2JywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydChtYXRjaGVzQ2FtZWxDYXNlKCdEZWJ1ZyBDb25zb2xlJywgJ09wZW46IERlYnVnIENvbnNvbGUnKSk7XG5cdFx0YXNzZXJ0KG1hdGNoZXNDYW1lbENhc2UoJ0RlYnVnIGNvbnNvbGUnLCAnT3BlbjogRGVidWcgQ29uc29sZScpKTtcblx0XHRhc3NlcnQobWF0Y2hlc0NhbWVsQ2FzZSgnZGVidWcgY29uc29sZScsICdPcGVuOiBEZWJ1ZyBDb25zb2xlJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzQ29udGlndW91c1N1YlN0cmluZycsICgpID0+IHtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQ29udGlndW91c1N1YlN0cmluZywgJ2NlbGEnLCAnY2FuY2VsQW5pbWF0aW9uRnJhbWUoKScsIFtcblx0XHRcdHsgc3RhcnQ6IDMsIGVuZDogNyB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZycsICgpID0+IHtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcsICdjZWxhJywgJ2NhbmNlbEFuaW1hdGlvbkZyYW1lKCknLCBbXG5cdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDcgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZywgJ2NhZmUnLCAnY2FmXHUwMEU5JywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiA0IH1cblx0XHRdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzQmFzZUNvbnRpZ3VvdXNTdWJTdHJpbmcsICdjYWZlJywgJ2NhZlx1MDBFOUJhcicsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogNCB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCAncmVzdW1lJywgJ3JcdTAwRTlzdW1cdTAwRTknLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDYgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNCYXNlQ29udGlndW91c1N1YlN0cmluZywgJ25hXHUwMEVGdmUnLCAnbmFcdTAwRUZ2ZScsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogNSB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCAnbmFpdmUnLCAnbmFcdTAwRUZ2ZScsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogNSB9XG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nLCAnYWVvdScsICdcdTAwRTBcdTAwRTlcdTAwRjZcdTAwRkMnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDQgfVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzU3ViU3RyaW5nJywgKCkgPT4ge1xuXHRcdGZpbHRlck9rKG1hdGNoZXNTdWJTdHJpbmcsICdjbW0nLCAnY2FuY2VsQW5pbWF0aW9uRnJhbWUoKScsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGVuZDogMSB9LFxuXHRcdFx0eyBzdGFydDogOSwgZW5kOiAxMCB9LFxuXHRcdFx0eyBzdGFydDogMTgsIGVuZDogMTkgfVxuXHRcdF0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNTdWJTdHJpbmcsICdhYmMnLCAnYWJjYWJjJywgW1xuXHRcdFx0eyBzdGFydDogMCwgZW5kOiAzIH0sXG5cdFx0XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1N1YlN0cmluZywgJ2FiYycsICdhYWFiYmJjY2MnLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBlbmQ6IDEgfSxcblx0XHRcdHsgc3RhcnQ6IDMsIGVuZDogNCB9LFxuXHRcdFx0eyBzdGFydDogNiwgZW5kOiA3IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXNTdWJTdHJpbmcgcGVyZm9ybWFuY2UgKCMzNTM0NiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1N1YlN0cmluZywgJ2FhYWFhYWFhYWFhYWFhYWFhYWFheCcsICdhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1dvcmRGaWx0ZXInLCAoKSA9PiB7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnYWxwaGEnLCAnYWxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiA1IH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdhbHBoYScsICdhbHBoYXNvbWV0aGluZycsIFt7IHN0YXJ0OiAwLCBlbmQ6IDUgfV0pO1xuXHRcdGZpbHRlck5vdE9rKG1hdGNoZXNXb3JkcywgJ2FscGhhJywgJ2FscCcpO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2EnLCAnYWxwaGEnLCBbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzV29yZHMsICd4JywgJ2FscGhhJyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnQScsICdhbHBoYScsIFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ0FsUGgnLCAnYWxQSEEnLCBbeyBzdGFydDogMCwgZW5kOiA0IH1dKTtcblx0XHRhc3NlcnQobWF0Y2hlc1dvcmRzKCdEZWJ1ZyBDb25zb2xlJywgJ09wZW46IERlYnVnIENvbnNvbGUnKSk7XG5cblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdncCcsICdHaXQ6IFB1bGwnLCBbeyBzdGFydDogMCwgZW5kOiAxIH0sIHsgc3RhcnQ6IDUsIGVuZDogNiB9XSk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnZyBwJywgJ0dpdDogUHVsbCcsIFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfSwgeyBzdGFydDogNSwgZW5kOiA2IH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdnaXB1JywgJ0dpdDogUHVsbCcsIFt7IHN0YXJ0OiAwLCBlbmQ6IDIgfSwgeyBzdGFydDogNSwgZW5kOiA3IH1dKTtcblxuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2dwJywgJ0NhdGVnb3J5OiBHaXQ6IFB1bGwnLCBbeyBzdGFydDogMTAsIGVuZDogMTEgfSwgeyBzdGFydDogMTUsIGVuZDogMTYgfV0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2cgcCcsICdDYXRlZ29yeTogR2l0OiBQdWxsJywgW3sgc3RhcnQ6IDEwLCBlbmQ6IDExIH0sIHsgc3RhcnQ6IDE1LCBlbmQ6IDE2IH1dKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdnaXB1JywgJ0NhdGVnb3J5OiBHaXQ6IFB1bGwnLCBbeyBzdGFydDogMTAsIGVuZDogMTIgfSwgeyBzdGFydDogMTUsIGVuZDogMTcgfV0pO1xuXG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1dvcmRzLCAnaXQnLCAnR2l0OiBQdWxsJyk7XG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1dvcmRzLCAnbGwnLCAnR2l0OiBQdWxsJyk7XG5cblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdnaXQ6IFx1MzBEN1x1MzBFQicsICdnaXQ6IFx1MzBEN1x1MzBFQicsIFt7IHN0YXJ0OiAwLCBlbmQ6IDcgfV0pO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2dpdCBcdTMwRDdcdTMwRUInLCAnZ2l0OiBcdTMwRDdcdTMwRUInLCBbeyBzdGFydDogMCwgZW5kOiAzIH0sIHsgc3RhcnQ6IDUsIGVuZDogNyB9XSk7XG5cblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdcdTAwRjZcdTAwRTRrJywgJ1x1MDBENmhtOiBcdTAwQzRsbGVzIEtsYXInLCBbeyBzdGFydDogMCwgZW5kOiAxIH0sIHsgc3RhcnQ6IDUsIGVuZDogNiB9LCB7IHN0YXJ0OiAxMSwgZW5kOiAxMiB9XSk7XG5cblx0XHQvLyBIYW5kbGVzIGlzc3VlICMxMjM5MTVcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdDKysnLCAnQy9DKys6IGNvbW1hbmQnLCBbeyBzdGFydDogMiwgZW5kOiA1IH1dKTtcblxuXHRcdC8vIEhhbmRsZXMgaXNzdWUgIzE1NDUzM1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJy4nLCAnOicsIFtdKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICcuJywgJy4nLCBbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblxuXHRcdC8vIGFzc2VydC5vayhtYXRjaGVzV29yZHMoJ2dpcHUnLCAnQ2F0ZWdvcnk6IEdpdDogUHVsbCcsIHRydWUpID09PSBudWxsKTtcblx0XHQvLyBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hdGNoZXNXb3JkcygncHUnLCAnQ2F0ZWdvcnk6IEdpdDogUHVsbCcsIHRydWUpLCBbeyBzdGFydDogMTUsIGVuZDogMTcgfV0pO1xuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnYmFyJywgJ2Zvby1iYXInKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdiYXIgdGVzdCcsICdmb28tYmFyIHRlc3QnKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdmYnQnLCAnZm9vLWJhciB0ZXN0Jyk7XG5cdFx0ZmlsdGVyT2sobWF0Y2hlc1dvcmRzLCAnYmFyIHRlc3QnLCAnZm9vLWJhciAodGVzdCknKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdmb28gYmFyJywgJ2ZvbyAoYmFyKScpO1xuXG5cdFx0ZmlsdGVyTm90T2sobWF0Y2hlc1dvcmRzLCAnYmFyIGVzdCcsICdmb28tYmFyIHRlc3QnKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzV29yZHMsICdmbyBhcicsICdmb28tYmFyIHRlc3QnKTtcblx0XHRmaWx0ZXJOb3RPayhtYXRjaGVzV29yZHMsICdmb3InLCAnZm9vLWJhciB0ZXN0Jyk7XG5cblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdmb28gYmFyJywgJ2Zvby1iYXInKTtcblx0XHRmaWx0ZXJPayhtYXRjaGVzV29yZHMsICdmb28gYmFyJywgJzEyMyBmb28tYmFyIDQ1NicpO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2Zvby1iYXInLCAnZm9vIGJhcicpO1xuXHRcdGZpbHRlck9rKG1hdGNoZXNXb3JkcywgJ2ZvbzpiYXInLCAnZm9vOmJhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzV29yZHMgcGVyZm9ybWFuY2UgKCMzMDk1ODIpJywgZnVuY3Rpb24gKCkge1xuXHRcdC8vIFNlYXJjaGluZyBmb3IgYSB0ZXJtIGNvbnRhaW5pbmcgYSB3b3JkIHNlcGFyYXRvciAoZS5nLiBgLmApIGFnYWluc3Rcblx0XHQvLyBjb21tYW5kLWlkLWxpa2UgdGFyZ2V0cyB1c2VkIHRvIGNhdXNlIGNhdGFzdHJvcGhpYyBiYWNrdHJhY2tpbmcgYW5kXG5cdFx0Ly8gZnJlZXplIHRoZSBLZXlib2FyZCBTaG9ydGN1dHMgZWRpdG9yLiBXaXRob3V0IHRoZSBmaXggdGhpcyBsb29wXG5cdFx0Ly8gZXhjZWVkcyBNb2NoYSdzIGRlZmF1bHQgdGVzdCB0aW1lb3V0LlxuXHRcdGNvbnN0IHRhcmdldHMgPSBbXG5cdFx0XHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c05leHRMaW5lJyxcblx0XHRcdCdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZENvcHlBY3Rpb24nLFxuXHRcdFx0J3dvcmtiZW5jaC5hY3Rpb24uZWRpdG9yLmNoYW5nZUxhbmd1YWdlTW9kZScsXG5cdFx0XHQnZWRpdG9yLmFjdGlvbi5zbWFydFNlbGVjdC5leHBhbmQnLFxuXHRcdFx0J3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMuc2F2ZUFsbCcsXG5cdFx0XTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDA7IGkrKykge1xuXHRcdFx0Zm9yIChjb25zdCB0IG9mIHRhcmdldHMpIHtcblx0XHRcdFx0bWF0Y2hlc1dvcmRzKCdlZGl0b3IuYWN0aW9uJywgdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRmdW5jdGlvbiBhc3NlcnRNYXRjaGVzKHBhdHRlcm46IHN0cmluZywgd29yZDogc3RyaW5nLCBkZWNvcmF0ZWRXb3JkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGZpbHRlcjogRnV6enlTY29yZXIsIG9wdHM6IHsgcGF0dGVyblBvcz86IG51bWJlcjsgd29yZFBvcz86IG51bWJlcjsgZmlyc3RNYXRjaENhbkJlV2Vhaz86IGJvb2xlYW4gfSA9IHt9KSB7XG5cdFx0Y29uc3QgciA9IGZpbHRlcihwYXR0ZXJuLCBwYXR0ZXJuLnRvTG93ZXJDYXNlKCksIG9wdHMucGF0dGVyblBvcyB8fCAwLCB3b3JkLCB3b3JkLnRvTG93ZXJDYXNlKCksIG9wdHMud29yZFBvcyB8fCAwLCB7IGZpcnN0TWF0Y2hDYW5CZVdlYWs6IG9wdHMuZmlyc3RNYXRjaENhbkJlV2VhayA/PyBmYWxzZSwgYm9vc3RGdWxsTWF0Y2g6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKCFkZWNvcmF0ZWRXb3JkID09PSAhcik7XG5cdFx0aWYgKHIpIHtcblx0XHRcdGNvbnN0IG1hdGNoZXMgPSBjcmVhdGVNYXRjaGVzKHIpO1xuXHRcdFx0bGV0IGFjdHVhbFdvcmQgPSAnJztcblx0XHRcdGxldCBwb3MgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG5cdFx0XHRcdGFjdHVhbFdvcmQgKz0gd29yZC5zdWJzdHJpbmcocG9zLCBtYXRjaC5zdGFydCk7XG5cdFx0XHRcdGFjdHVhbFdvcmQgKz0gJ14nICsgd29yZC5zdWJzdHJpbmcobWF0Y2guc3RhcnQsIG1hdGNoLmVuZCkuc3BsaXQoJycpLmpvaW4oJ14nKTtcblx0XHRcdFx0cG9zID0gbWF0Y2guZW5kO1xuXHRcdFx0fVxuXHRcdFx0YWN0dWFsV29yZCArPSB3b3JkLnN1YnN0cmluZyhwb3MpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFdvcmQsIGRlY29yYXRlZFdvcmQpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ2Z1enp5U2NvcmUsICMyMzIxNScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCd0aXQnLCAnd2luLnRpdCcsICd3aW4uXnReaV50JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygndGl0bGUnLCAnd2luLnRpdGxlJywgJ3dpbi5edF5pXnRebF5lJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnV29yZENsYScsICdXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllcicsICdeV15vXnJeZENoYXJhY3Rlcl5DXmxeYXNzaWZpZXInLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdXb3JkQ0NsYScsICdXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllcicsICdeV15vXnJeZF5DaGFyYWN0ZXJeQ15sXmFzc2lmaWVyJywgZnV6enlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmUsICMyMzMzMicsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCdkZXRlJywgJ1wiZWRpdG9yLnF1aWNrU3VnZ2VzdGlvbnNEZWxheVwiJywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnZnV6enlTY29yZSwgIzIzMTkwJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydE1hdGNoZXMoJ2M6XFxcXGRvJywgJyYgXFwnQzpcXFxcRG9jdW1lbnRzIGFuZCBTZXR0aW5nc1xcJycsICcmIFxcJ15DXjpeXFxcXF5EXm9jdW1lbnRzIGFuZCBTZXR0aW5nc1xcJycsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2M6XFxcXGRvJywgJyYgXFwnYzpcXFxcRG9jdW1lbnRzIGFuZCBTZXR0aW5nc1xcJycsICcmIFxcJ15jXjpeXFxcXF5EXm9jdW1lbnRzIGFuZCBTZXR0aW5nc1xcJycsIGZ1enp5U2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eVNjb3JlLCAjMjM1ODEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnY2xvc2UnLCAnY3NzLmxpbnQuaW1wb3J0U3RhdGVtZW50JywgJ15jc3MuXmxpbnQuaW1wXm9ydF5TdGF0XmVtZW50JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnY2xvc2UnLCAnY3NzLmNvbG9yRGVjb3JhdG9ycy5lbmFibGUnLCAnXmNzcy5jb15sXm9yRGVjb3JhdG9yXnMuXmVuYWJsZScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2Nsb3NlJywgJ3dvcmtiZW5jaC5xdWlja09wZW4uY2xvc2VPbkZvY3VzT3V0JywgJ3dvcmtiZW5jaC5xdWlja09wZW4uXmNebF5vXnNeZU9uRm9jdXNPdXQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnY2xvc2UnLCAyLCAnY3NzLmxpbnQuaW1wb3J0U3RhdGVtZW50JywgJ2Nzcy5jb2xvckRlY29yYXRvcnMuZW5hYmxlJywgJ3dvcmtiZW5jaC5xdWlja09wZW4uY2xvc2VPbkZvY3VzT3V0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmUsICMyMzQ1OCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCdoaWdobGlnaHQnLCAnZWRpdG9ySG92ZXJIaWdobGlnaHQnLCAnZWRpdG9ySG92ZXJeSF5pXmdeaF5sXmleZ15oXnQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdoaGlnaGxpZ2h0JywgJ2VkaXRvckhvdmVySGlnaGxpZ2h0JywgJ2VkaXRvcl5Ib3Zlcl5IXmleZ15oXmxeaV5nXmhedCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2RoaGlnaGxpZ2h0JywgJ2VkaXRvckhvdmVySGlnaGxpZ2h0JywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0fSk7XG5cdHRlc3QoJ2Z1enp5U2NvcmUsICMyMzc0NicsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCctbW96JywgJy1tb3otZm9vJywgJ14tXm1eb156LWZvbycsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ21veicsICctbW96LWZvbycsICctXm1eb156LWZvbycsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ21veicsICctbW96LWFuaW1hdGlvbicsICctXm1eb156LWFuaW1hdGlvbicsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ21vemEnLCAnLW1vei1hbmltYXRpb24nLCAnLV5tXm9eei1eYW5pbWF0aW9uJywgZnV6enlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnYWInLCAnYWJBJywgJ15hXmJBJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnY2NtJywgJ2NhY21lbENhc2UnLCAnXmNhXmNebWVsQ2FzZScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2J0aScsICd0aGVfYmxhY2tfa25pZ2h0JywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdjY20nLCAnY2FtZWxDYXNlJywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdjbWNtJywgJ2NhbWVsQ2FzZScsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnQksnLCAndGhlX2JsYWNrX2tuaWdodCcsICd0aGVfXmJsYWNrX15rbmlnaHQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdLZXlib2FyZExheW91dD0nLCAnS2V5Ym9hcmRMYXlvdXQnLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ0xMTCcsICdTVmlzdWFsTG9nZ2VyTG9nc0xpc3QnLCAnU1Zpc3VhbF5Mb2dnZXJeTG9nc15MaXN0JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnTExMTCcsICdTVmlsTG9Mb3NMaScsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnTExMTCcsICdTVmlzdWFsTG9nZ2VyTG9nc0xpc3QnLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ1RFZGl0JywgJ1RleHRFZGl0JywgJ15UZXh0XkVeZF5pXnQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdURWRpdCcsICdUZXh0RWRpdG9yJywgJ15UZXh0XkVeZF5pXnRvcicsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ1RFZGl0JywgJ1RleHRlZGl0JywgJ15UZXh0XmVeZF5pXnQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdURWRpdCcsICd0ZXh0X2VkaXQnLCAnXnRleHRfXmVeZF5pXnQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdURWRpdERpdCcsICdUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUnLCAnXlRleHReRV5kXmledG9yXkRlY29yYXReaW9uXlR5cGUnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdURWRpdCcsICdUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUnLCAnXlRleHReRV5kXmledG9yRGVjb3JhdGlvblR5cGUnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdUZWRpdCcsICdUZXh0RWRpdCcsICdeVGV4dF5FXmReaV50JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnYmEnLCAnP0FCPycsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnYmtuJywgJ3RoZV9ibGFja19rbmlnaHQnLCAndGhlX15ibGFja19ea15uaWdodCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2J0JywgJ3RoZV9ibGFja19rbmlnaHQnLCAndGhlX15ibGFja19rbmlnaF50JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnY2NtJywgJ2NhbWVsQ2FzZWNtJywgJ15jYW1lbF5DYXNlY15tJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZmRtJywgJ2ZpbmRNb2RlbCcsICdeZmluXmReTW9kZWwnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmb2InLCAnZm9vYmFyJywgJ15mXm9vXmJhcicsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2ZvYnonLCAnZm9vYmFyJywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmb29iYXInLCAnZm9vYmFyJywgJ15mXm9eb15iXmFecicsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2Zvcm0nLCAnZWRpdG9yLmZvcm1hdE9uU2F2ZScsICdlZGl0b3IuXmZeb15yXm1hdE9uU2F2ZScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2cgcCcsICdHaXQ6IFB1bGwnLCAnXkdpdDpeIF5QdWxsJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZyBwJywgJ0dpdDogUHVsbCcsICdeR2l0Ol4gXlB1bGwnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdnaXAnLCAnR2l0OiBQdWxsJywgJ15HXml0OiBeUHVsbCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2dpcCcsICdHaXQ6IFB1bGwnLCAnXkdeaXQ6IF5QdWxsJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZ3AnLCAnR2l0OiBQdWxsJywgJ15HaXQ6IF5QdWxsJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZ3AnLCAnR2l0X0dpdF9QdWxsJywgJ15HaXRfR2l0X15QdWxsJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnaXMnLCAnSW1wb3J0U3RhdGVtZW50JywgJ15JbXBvcnReU3RhdGVtZW50JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnaXMnLCAnaXNWYWxpZCcsICdeaV5zVmFsaWQnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdsb3dyZCcsICdsb3dXb3JkJywgJ15sXm9ed1dvXnJeZCcsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ215dmFibGUnLCAnbXl2YXJpYWJsZScsICdebV55XnZeYXJpYV5iXmxeZScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ25vJywgJycsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnbm8nLCAnbWF0Y2gnLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ29iJywgJ2Zvb2JhcicsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnc2wnLCAnU1Zpc3VhbExvZ2dlckxvZ3NMaXN0JywgJ15TVmlzdWFsXkxvZ2dlckxvZ3NMaXN0JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnc2xsbGwnLCAnU1Zpc3VhbExvZ2dlckxvZ3NMaXN0JywgJ15TVmlzdWFebF5Mb2dnZXJeTG9nc15MaXN0JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnVGhyZWUnLCAnSFRNTEhSRWxlbWVudCcsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnVGhyZWUnLCAnVGhyZWUnLCAnXlReaF5yXmVeZScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2ZvJywgJ2JhcmZvbycsIHVuZGVmaW5lZCwgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZm8nLCAnYmFyX2ZvbycsICdiYXJfXmZeb28nLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmbycsICdiYXJfRm9vJywgJ2Jhcl9eRl5vbycsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2ZvJywgJ2JhciBmb28nLCAnYmFyIF5mXm9vJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZm8nLCAnYmFyLmZvbycsICdiYXIuXmZeb28nLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmbycsICdiYXIvZm9vJywgJ2Jhci9eZl5vbycsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2ZvJywgJ2JhclxcXFxmb28nLCAnYmFyXFxcXF5mXm9vJywgZnV6enlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmUgKGZpcnN0IG1hdGNoIGNhbiBiZSB3ZWFrKScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGFzc2VydE1hdGNoZXMoJ1RocmVlJywgJ0hUTUxIUkVsZW1lbnQnLCAnSF5UTUxeSF5SXkVsXmVtZW50JywgZnV6enlTY29yZSwgeyBmaXJzdE1hdGNoQ2FuQmVXZWFrOiB0cnVlIH0pO1xuXHRcdGFzc2VydE1hdGNoZXMoJ3RvcicsICdjb25zdHJ1Y3RvcicsICdjb25zdHJ1Y150Xm9ecicsIGZ1enp5U2NvcmUsIHsgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSB9KTtcblx0XHRhc3NlcnRNYXRjaGVzKCd1cicsICdjb25zdHJ1Y3RvcicsICdjb25zdHJedWN0b15yJywgZnV6enlTY29yZSwgeyBmaXJzdE1hdGNoQ2FuQmVXZWFrOiB0cnVlIH0pO1xuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICd0b3InLCAyLCAnY29uc3RydWN0b3InLCAnVGhvcicsICdjVG9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5U2NvcmUsIG1hbnkgbWF0Y2hlcycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGFzc2VydE1hdGNoZXMoXG5cdFx0XHQnYWFhYWFhJyxcblx0XHRcdCdhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWEnLFxuXHRcdFx0J15hXmFeYV5hXmFeYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYScsXG5cdFx0XHRmdXp6eVNjb3JlXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnRnJlZXplIHdoZW4gZmpmaiAtPiBqZmpmLCBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTE4MDcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcyhcblx0XHRcdCdqZmpmaicsXG5cdFx0XHQnZmpmamZqZmpmamZqZmpmamZqZmpmaicsXG5cdFx0XHR1bmRlZmluZWQsIGZ1enp5U2NvcmVcblx0XHQpO1xuXHRcdGFzc2VydE1hdGNoZXMoXG5cdFx0XHQnamZqZmpmamZqZmpmamZqZmpmaicsXG5cdFx0XHQnZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqJyxcblx0XHRcdHVuZGVmaW5lZCwgZnV6enlTY29yZVxuXHRcdCk7XG5cdFx0YXNzZXJ0TWF0Y2hlcyhcblx0XHRcdCdqZmpmamZqZmpmamZqZmpmamZqamZqZmpmamZqZmpmamZqZmpmampmamZqZmpmamZqZmpmamZqZmpqZmpmamZqZmpmamZqZmpmamZqamZqZmpmamZqZmpmamZqZmpmampmamZqZmpmamZqZmpmamZqZmonLFxuXHRcdFx0J2ZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmaicsXG5cdFx0XHR1bmRlZmluZWQsIGZ1enp5U2NvcmVcblx0XHQpO1xuXHRcdGFzc2VydE1hdGNoZXMoXG5cdFx0XHQnamZqZmpmamZqZmpmamZqZmpmaicsXG5cdFx0XHQnZkpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqJyxcblx0XHRcdCdmXkpeZl5qXmZeal5mXmpeZl5qXmZeal5mXmpeZl5qXmZeal5mXmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqJywgLy8gc3Ryb25nIG1hdGNoXG5cdFx0XHRmdXp6eVNjb3JlXG5cdFx0KTtcblx0XHRhc3NlcnRNYXRjaGVzKFxuXHRcdFx0J2pmamZqZmpmamZqZmpmamZqZmonLFxuXHRcdFx0J2ZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmaicsXG5cdFx0XHQnZl5qXmZeal5mXmpeZl5qXmZeal5mXmpeZl5qXmZeal5mXmpeZl5qZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmamZqZmpmaicsIC8vIGFueSBtYXRjaFxuXHRcdFx0ZnV6enlTY29yZSwgeyBmaXJzdE1hdGNoQ2FuQmVXZWFrOiB0cnVlIH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eVNjb3JlLCBpc3N1ZSAjMjY0MjMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnRNYXRjaGVzKCdiYWJhJywgJ2FiYWJhYmFiJywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblxuXHRcdGFzc2VydE1hdGNoZXMoXG5cdFx0XHQnZnNmc2ZzJyxcblx0XHRcdCdkc2FmZHNhZmRzYWZkc2FmZHNhZmRzYWZkc2FmYXNkZmRzYScsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmdXp6eVNjb3JlXG5cdFx0KTtcblx0XHRhc3NlcnRNYXRjaGVzKFxuXHRcdFx0J2ZzZnNmc2ZzZnNmc2ZzZicsXG5cdFx0XHQnZHNhZmRzYWZkc2FmZHNhZmRzYWZkc2FmZHNhZmFzZGZkc2FmZHNhZmRzYWZkc2FmZHNmZHNhZmRzZmRmZGZhc2RuZmRzYWpmbmRzam5hZmpuZHNhamxrbmZkc2EnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZnV6enlTY29yZVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Z1enp5IEludGVsbGlTZW5zZSBtYXRjaGluZyB2cyBIYXhlIG1ldGFkYXRhIGNvbXBsZXRpb24sICMyNjk5NScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCdmJywgJzpGb28nLCAnOl5Gb28nLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdmJywgJzpmb28nLCAnOl5mb28nLCBmdXp6eVNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnU2VwYXJhdG9yIG9ubHkgbWF0Y2ggc2hvdWxkIG5vdCBiZSB3ZWFrICM3OTU1OCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCcuJywgJ2Zvby5iYXInLCAnZm9vXi5iYXInLCBmdXp6eVNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnQ2Fubm90IHNldCBwcm9wZXJ0eSBcXCcxXFwnIG9mIHVuZGVmaW5lZCwgIzI2NTExJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmQgPSBuZXcgQXJyYXk8dm9pZD4oMTIzKS5qb2luKCdhJyk7XG5cdFx0Y29uc3QgcGF0dGVybiA9IG5ldyBBcnJheTx2b2lkPigxMjApLmpvaW4oJ2EnKTtcblx0XHRmdXp6eVNjb3JlKHBhdHRlcm4sIHBhdHRlcm4udG9Mb3dlckNhc2UoKSwgMCwgd29yZCwgd29yZC50b0xvd2VyQ2FzZSgpLCAwKTtcblx0XHRhc3NlcnQub2sodHJ1ZSk7IC8vIG11c3Qgbm90IGV4cGxvZGVcblx0fSk7XG5cblx0dGVzdCgnVnNjb2RlIDEuMTIgbm8gbG9uZ2VyIG9iZXlzIFxcJ3NvcnRUZXh0XFwnIGluIGNvbXBsZXRpb24gaXRlbXMgKGZyb20gbGFuZ3VhZ2Ugc2VydmVyKSwgIzI2MDk2JywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydE1hdGNoZXMoJyAgJywgJyAgZ3JvdXAnLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUsIHsgcGF0dGVyblBvczogMiB9KTtcblx0XHRhc3NlcnRNYXRjaGVzKCcgIGcnLCAnICBncm91cCcsICcgIF5ncm91cCcsIGZ1enp5U2NvcmUsIHsgcGF0dGVyblBvczogMiB9KTtcblx0XHRhc3NlcnRNYXRjaGVzKCdnJywgJyAgZ3JvdXAnLCAnICBeZ3JvdXAnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdnIGcnLCAnICBncm91cEdyb3VwJywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdnIGcnLCAnICBncm91cCBHcm91cCcsICcgIF5ncm91cF4gXkdyb3VwJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnIGcgZycsICcgIGdyb3VwIEdyb3VwJywgJyAgXmdyb3VwXiBeR3JvdXAnLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDEgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnenonLCAnenpHcm91cCcsICdeel56R3JvdXAnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCd6emcnLCAnenpHcm91cCcsICdeel56Xkdyb3VwJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnZycsICd6ekdyb3VwJywgJ3p6Xkdyb3VwJywgZnV6enlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhdHRlcm5Qb3MgaXNuXFwndCB3b3JraW5nIGNvcnJlY3RseSAjNzk4MTUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnOnAnLnN1YnN0cigxKSwgJ3Byb3AnLCAnXnByb3AnLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDAgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnOnAnLCAncHJvcCcsICdecHJvcCcsIGZ1enp5U2NvcmUsIHsgcGF0dGVyblBvczogMSB9KTtcblx0XHRhc3NlcnRNYXRjaGVzKCc6cCcsICdwcm9wJywgdW5kZWZpbmVkLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDIgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnOnAnLCAncHJvUCcsICdwcm9eUCcsIGZ1enp5U2NvcmUsIHsgcGF0dGVyblBvczogMSwgd29yZFBvczogMSB9KTtcblx0XHRhc3NlcnRNYXRjaGVzKCc6cCcsICdhcHJvcCcsICdhXnByb3AnLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDEsIGZpcnN0TWF0Y2hDYW5CZVdlYWs6IHRydWUgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnOnAnLCAnYXByb3AnLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUsIHsgcGF0dGVyblBvczogMSwgZmlyc3RNYXRjaENhbkJlV2VhazogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFzc2VydFRvcFNjb3JlKGZpbHRlcjogdHlwZW9mIGZ1enp5U2NvcmUsIHBhdHRlcm46IHN0cmluZywgZXhwZWN0ZWQ6IG51bWJlciwgLi4ud29yZHM6IHN0cmluZ1tdKSB7XG5cdFx0bGV0IHRvcFNjb3JlID0gLSgxMDAgKiAxMCk7XG5cdFx0bGV0IHRvcElkeCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB3b3Jkcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgd29yZCA9IHdvcmRzW2ldO1xuXHRcdFx0Y29uc3QgbSA9IGZpbHRlcihwYXR0ZXJuLCBwYXR0ZXJuLnRvTG93ZXJDYXNlKCksIDAsIHdvcmQsIHdvcmQudG9Mb3dlckNhc2UoKSwgMCk7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHRjb25zdCBbc2NvcmVdID0gbTtcblx0XHRcdFx0aWYgKHNjb3JlID4gdG9wU2NvcmUpIHtcblx0XHRcdFx0XHR0b3BTY29yZSA9IHNjb3JlO1xuXHRcdFx0XHRcdHRvcElkeCA9IGk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvcElkeCwgZXhwZWN0ZWQsIGAke3BhdHRlcm59IC0+IGFjdHVhbD0ke3dvcmRzW3RvcElkeF19IDw+IGV4cGVjdGVkPSR7d29yZHNbZXhwZWN0ZWRdfWApO1xuXHR9XG5cblx0dGVzdCgndG9wU2NvcmUgLSBmdXp6eVNjb3JlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ2NvbnMnLCAyLCAnQXJyYXlCdWZmZXJDb25zdHJ1Y3RvcicsICdDb25zb2xlJywgJ2NvbnNvbGUnKTtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnRm9vJywgMSwgJ2ZvbycsICdGb28nLCAnZm9vJyk7XG5cblx0XHQvLyAjMjQ5MDRcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnb25NZXNzJywgMSwgJ29ubWVzc2FnZScsICdvbk1lc3NhZ2UnLCAnb25UaGlzTWVnYUVzY2FwZScpO1xuXG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ0NDJywgMSwgJ2NhbWVsQ2FzZScsICdDYW1lbENhc2UnKTtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnY0MnLCAwLCAnY2FtZWxDYXNlJywgJ0NhbWVsQ2FzZScpO1xuXHRcdC8vIGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdjQycsIDEsICdjY2ZvbycsICdjYW1lbENhc2UnKTtcblx0XHQvLyBhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnY0MnLCAxLCAnY2Nmb28nLCAnY2FtZWxDYXNlJywgJ2Zvby1jQy1iYXInKTtcblxuXHRcdC8vIGlzc3VlICMxNzgzNlxuXHRcdC8vIGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdURWRpdCcsIDEsICdUZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUnLCAnVGV4dEVkaXQnLCAnVGV4dEVkaXRvcicpO1xuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdwJywgNCwgJ3BhcnNlJywgJ3Bvc2l4JywgJ3BhZmRzYScsICdwYXRoJywgJ3AnKTtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAncGEnLCAwLCAncGFyc2UnLCAncGFmZHNhJywgJ3BhdGgnKTtcblxuXHRcdC8vIGlzc3VlICMxNDU4M1xuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdsb2cnLCAzLCAnSFRNTE9wdEdyb3VwRWxlbWVudCcsICdTY3JvbGxMb2dpY2FsUG9zaXRpb24nLCAnU1ZHRkVNb3JwaG9sb2d5RWxlbWVudCcsICdsb2cnLCAnbG9nZ2VyJyk7XG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ2UnLCAyLCAnQWJzdHJhY3RXb3JrZXInLCAnQWN0aXZlWE9iamVjdCcsICdlbHNlJyk7XG5cblx0XHQvLyBpc3N1ZSAjMTQ0NDZcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnd29ya2JlbmNoLnNpZGViJywgMSwgJ3dvcmtiZW5jaC5lZGl0b3IuZGVmYXVsdFNpZGVCeVNpZGVMYXlvdXQnLCAnd29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nKTtcblxuXHRcdC8vIGlzc3VlICMxMTQyM1xuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdlZGl0b3IucicsIDIsICdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGUnLCAnZWRpdG9yLm92ZXJ2aWV3UnVsZXJsYW5lcycsICdlZGl0b3IucmVuZGVyQ29udHJvbENoYXJhY3RlcicsICdlZGl0b3IucmVuZGVyV2hpdGVzcGFjZScpO1xuXHRcdC8vIGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdlZGl0b3IuUicsIDEsICdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGUnLCAnZWRpdG9yLm92ZXJ2aWV3UnVsZXJsYW5lcycsICdlZGl0b3IucmVuZGVyQ29udHJvbENoYXJhY3RlcicsICdlZGl0b3IucmVuZGVyV2hpdGVzcGFjZScpO1xuXHRcdC8vIGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdFZGl0b3IucicsIDAsICdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGUnLCAnZWRpdG9yLm92ZXJ2aWV3UnVsZXJsYW5lcycsICdlZGl0b3IucmVuZGVyQ29udHJvbENoYXJhY3RlcicsICdlZGl0b3IucmVuZGVyV2hpdGVzcGFjZScpO1xuXG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJy1tbycsIDEsICctbXMtaW1lLW1vZGUnLCAnLW1vei1jb2x1bW5zJyk7XG5cdFx0Ly8gZHVwZSwgaXNzdWUgIzE0ODYxXG5cdFx0YXNzZXJ0VG9wU2NvcmUoZnV6enlTY29yZSwgJ2NvbnZlcnRNb2RlbFBvc2l0aW9uJywgMCwgJ2NvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24nLCAnY29udmVydFZpZXdUb01vZGVsUG9zaXRpb24nKTtcblx0XHQvLyBkdXBlLCBpc3N1ZSAjMTQ5NDJcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnaXMnLCAwLCAnaXNWYWxpZFZpZXdsZXRJZCcsICdpbXBvcnQgc3RhdGVtZW50Jyk7XG5cblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAndGl0bGUnLCAxLCAnZmlsZXMudHJpbVRyYWlsaW5nV2hpdGVzcGFjZScsICd3aW5kb3cudGl0bGUnKTtcblxuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdjb25zdCcsIDEsICdjb25zdHJ1Y3RvcicsICdjb25zdCcsICdjdU9uc3RydWwnKTtcblx0fSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBzdWdnZXN0aW9uIHNjb3JpbmcsICMyODc5MScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRUb3BTY29yZShmdXp6eVNjb3JlLCAnX2xpbmVzJywgMSwgJ19saW5lU3RhcnRzJywgJ19saW5lcycpO1xuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdfbGluZXMnLCAxLCAnX2xpbmVTJywgJ19saW5lcycpO1xuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdfbGluZVMnLCAwLCAnX2xpbmVTJywgJ19saW5lcycpO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ0JhZCBjb21wbGV0aW9uIHJhbmtpbmcgY2hhbmdlcyB2YWxpZCB2YXJpYWJsZSBuYW1lIHRvIGNsYXNzIG5hbWUgd2hlbiBwcmVzc2luZyBcIi5cIiAjMTg3MDU1JywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICdhJywgMSwgJ0EnLCAnYScpO1xuXHRcdGFzc2VydFRvcFNjb3JlKGZ1enp5U2NvcmUsICd0aGVtZScsIDEsICdUaGVtZScsICd0aGVtZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdIVE1MIGNsb3NpbmcgdGFnIHByb3Bvc2FsIGZpbHRlcmVkIG91dCAjMzg4ODAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnXFx0XFx0PCcsICdcXHRcXHQ8L2JvZHk+JywgJ15cXHReXFx0XjwvYm9keT4nLCBmdXp6eVNjb3JlLCB7IHBhdHRlcm5Qb3M6IDAgfSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnXFx0XFx0PCcsICdcXHRcXHQ8L2JvZHk+JywgJ1xcdFxcdF48L2JvZHk+JywgZnV6enlTY29yZSwgeyBwYXR0ZXJuUG9zOiAyIH0pO1xuXHRcdGFzc2VydE1hdGNoZXMoJ1xcdDwnLCAnXFx0PC9ib2R5PicsICdcXHRePC9ib2R5PicsIGZ1enp5U2NvcmUsIHsgcGF0dGVyblBvczogMSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZnV6enlTY29yZUdyYWNlZnVsJywgKCkgPT4ge1xuXG5cdFx0YXNzZXJ0TWF0Y2hlcygncmx1dCcsICdyZXN1bHQnLCB1bmRlZmluZWQsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ3JsdXQnLCAncmVzdWx0JywgJ15yZXNedV5sXnQnLCBmdXp6eVNjb3JlR3JhY2VmdWwpO1xuXG5cdFx0YXNzZXJ0TWF0Y2hlcygnY25vJywgJ2NvbnNvbGUnLCAnXmNvXm5zXm9sZScsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2NubycsICdjb25zb2xlJywgJ15jb15uc15vbGUnLCBmdXp6eVNjb3JlR3JhY2VmdWwpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2NubycsICdjb25zb2xlJywgJ15jXm9ebnNvbGUnLCBmdXp6eVNjb3JlR3JhY2VmdWxBZ2dyZXNzaXZlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCdjbm8nLCAnY29fbmV3JywgJ15jXm9fXm5ldycsIGZ1enp5U2NvcmVHcmFjZWZ1bCk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnY25vJywgJ2NvX25ldycsICdeY15vX15uZXcnLCBmdXp6eVNjb3JlR3JhY2VmdWxBZ2dyZXNzaXZlKTtcblx0fSk7XG5cblx0dGVzdCgnTGlzdCBoaWdobGlnaHQgZmlsdGVyOiBOb3QgYWxsIGNoYXJhY3RlcnMgZnJvbSBtYXRjaCBhcmUgaGlnaGxpZ2h0ZXJkICM2NjkyMycsICgpID0+IHtcblx0XHRhc3NlcnRNYXRjaGVzKCdmb28nLCAnYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyYmFyX2ZvbycsICdiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJfXmZeb15vJywgZnV6enlTY29yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0F1dG9jb21wbGV0aW9uIGlzIG1hdGNoZWQgYWdhaW5zdCB0cnVuY2F0ZWQgZmlsdGVyVGV4dCB0byA1NCBjaGFyYWN0ZXJzICM3NDEzMycsICgpID0+IHtcblx0XHRhc3NlcnRNYXRjaGVzKFxuXHRcdFx0J2ZvbycsXG5cdFx0XHQnZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcl9mb28nLFxuXHRcdFx0J2ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJfXmZeb15vJyxcblx0XHRcdGZ1enp5U2NvcmVcblx0XHQpO1xuXHRcdGFzc2VydE1hdGNoZXMoXG5cdFx0XHQnQW9vJyxcblx0XHRcdCdBZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcl9mb28nLFxuXHRcdFx0J15BZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcmJhcl9mXm9ebycsXG5cdFx0XHRmdXp6eVNjb3JlXG5cdFx0KTtcblx0XHRhc3NlcnRNYXRjaGVzKFxuXHRcdFx0J2ZvbycsXG5cdFx0XHQnR2ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJiYXJfZm9vJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZ1enp5U2NvcmVcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdcIkdvIHRvIFN5bWJvbFwiIHdpdGggdGhlIGV4YWN0IG1ldGhvZCBuYW1lIGRvZXNuXFwndCB3b3JrIGFzIGV4cGVjdGVkICM4NDc4NycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYXRjaCA9IGZ1enp5U2NvcmUoJzpnZXQnLCAnOmdldCcsIDEsICdnZXQnLCAnZ2V0JywgMCwgeyBmaXJzdE1hdGNoQ2FuQmVXZWFrOiB0cnVlLCBib29zdEZ1bGxNYXRjaDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soQm9vbGVhbihtYXRjaCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdXcm9uZyBoaWdobGlnaHQgYWZ0ZXIgZW1vamkgIzExMzQwNCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCdkaScsICdcdTI3MjhkaXYgY2xhc3NuYW1lPVwiXCI+PC9kaXY+JywgJ1x1MjcyOF5kXml2IGNsYXNzbmFtZT1cIlwiPjwvZGl2PicsIGZ1enp5U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2RpJywgJ2FkaXYgY2xhc3NuYW1lPVwiXCI+PC9kaXY+JywgJ2FkaXYgY2xhc3NuYW1lPVwiXCI+PC9eZF5pdj4nLCBmdXp6eVNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnU3VnZ2VzdGlvbiBpcyBub3QgaGlnaGxpZ2h0ZWQgIzg1ODI2JywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydE1hdGNoZXMoJ1NlbWFudGljVG9rZW5zJywgJ1NlbWFudGljVG9rZW5zRWRpdHMnLCAnXlNeZV5tXmFebl50XmleY15UXm9ea15lXm5ec0VkaXRzJywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnU2VtYW50aWNUb2tlbnMnLCAnU2VtYW50aWNUb2tlbnNFZGl0cycsICdeU15lXm1eYV5uXnReaV5jXlReb15rXmVebl5zRWRpdHMnLCBmdXp6eVNjb3JlR3JhY2VmdWxBZ2dyZXNzaXZlKTtcblx0fSk7XG5cblx0dGVzdCgnSW50ZWxsaVNlbnNlIGNvbXBsZXRpb24gbm90IGNvcnJlY3RseSBoaWdobGlnaHRpbmcgdGV4dCBpbiBmcm9udCBvZiBjdXJzb3IgIzExNTI1MCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRNYXRjaGVzKCdsbycsICdsb2cnLCAnXmxeb2cnLCBmdXp6eVNjb3JlKTtcblx0XHRhc3NlcnRNYXRjaGVzKCcubG8nLCAnbG9nJywgJ15sXm9nJywgYW55U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJy4nLCAnbG9nJywgJ2xvZycsIGFueVNjb3JlKTtcblx0fSk7XG5cblx0dGVzdCgnYW55U2NvcmUgc2hvdWxkIG5vdCByZXF1aXJlIGEgc3Ryb25nIGZpcnN0IG1hdGNoJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydE1hdGNoZXMoJ2JhcicsICdmb29iQXInLCAnZm9vXmJeQV5yJywgYW55U2NvcmUpO1xuXHRcdGFzc2VydE1hdGNoZXMoJ2JhcicsICdmb29iYXInLCAnZm9vXmJeYV5yJywgYW55U2NvcmUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmFibGUgZnVsbCBtYXRjaCBib29zdCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcmVmaXggPSAnY3JlYXRlJztcblx0XHRjb25zdCBhID0gJ2NyZWF0ZU1vZGVsU2VydmljZXMnO1xuXHRcdGNvbnN0IGIgPSAnY3JlYXRlJztcblxuXHRcdGxldCBhQm9vc3QgPSBmdXp6eVNjb3JlKHByZWZpeCwgcHJlZml4LCAwLCBhLCBhLnRvTG93ZXJDYXNlKCksIDAsIHsgYm9vc3RGdWxsTWF0Y2g6IHRydWUsIGZpcnN0TWF0Y2hDYW5CZVdlYWs6IHRydWUgfSk7XG5cdFx0bGV0IGJCb29zdCA9IGZ1enp5U2NvcmUocHJlZml4LCBwcmVmaXgsIDAsIGIsIGIudG9Mb3dlckNhc2UoKSwgMCwgeyBib29zdEZ1bGxNYXRjaDogdHJ1ZSwgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soYUJvb3N0KTtcblx0XHRhc3NlcnQub2soYkJvb3N0KTtcblx0XHRhc3NlcnQub2soYUJvb3N0WzBdIDwgYkJvb3N0WzBdKTtcblxuXHRcdC8vIGFsc28gd29ya3Mgd2l0aCB3b3JkU3RhcnQgPiAwIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTg3OTIxKVxuXHRcdGNvbnN0IHdvcmRQcmVmaXggPSAnJChzeW1ib2wtZnVuY3Rpb24pICc7XG5cdFx0YUJvb3N0ID0gZnV6enlTY29yZShwcmVmaXgsIHByZWZpeCwgMCwgYCR7d29yZFByZWZpeH0ke2F9YCwgYCR7d29yZFByZWZpeH0ke2F9YC50b0xvd2VyQ2FzZSgpLCB3b3JkUHJlZml4Lmxlbmd0aCwgeyBib29zdEZ1bGxNYXRjaDogdHJ1ZSwgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSB9KTtcblx0XHRiQm9vc3QgPSBmdXp6eVNjb3JlKHByZWZpeCwgcHJlZml4LCAwLCBgJHt3b3JkUHJlZml4fSR7Yn1gLCBgJHt3b3JkUHJlZml4fSR7Yn1gLnRvTG93ZXJDYXNlKCksIHdvcmRQcmVmaXgubGVuZ3RoLCB7IGJvb3N0RnVsbE1hdGNoOiB0cnVlLCBmaXJzdE1hdGNoQ2FuQmVXZWFrOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5vayhhQm9vc3QpO1xuXHRcdGFzc2VydC5vayhiQm9vc3QpO1xuXHRcdGFzc2VydC5vayhhQm9vc3RbMF0gPCBiQm9vc3RbMF0pO1xuXG5cdFx0Y29uc3QgYVNjb3JlID0gZnV6enlTY29yZShwcmVmaXgsIHByZWZpeCwgMCwgYSwgYS50b0xvd2VyQ2FzZSgpLCAwLCB7IGJvb3N0RnVsbE1hdGNoOiBmYWxzZSwgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSB9KTtcblx0XHRjb25zdCBiU2NvcmUgPSBmdXp6eVNjb3JlKHByZWZpeCwgcHJlZml4LCAwLCBiLCBiLnRvTG93ZXJDYXNlKCksIDAsIHsgYm9vc3RGdWxsTWF0Y2g6IGZhbHNlLCBmaXJzdE1hdGNoQ2FuQmVXZWFrOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5vayhhU2NvcmUpO1xuXHRcdGFzc2VydC5vayhiU2NvcmUpO1xuXHRcdGFzc2VydC5vayhhU2NvcmVbMF0gPT09IGJTY29yZVswXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgc3VnZ2VzdCBoaWdobGlnaHRpbmcgaWdub3JlcyB3aG9sZSB3b3JkIG1hdGNoIGluIGZhdm9yIG9mIG1hdGNoaW5nIGZpcnN0IGxldHRlciMxNDc0MjMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnRNYXRjaGVzKCdpJywgJ21hY2hpbmUve2lkfScsICdtYWNoaW5lL3teaWR9JywgZnV6enlTY29yZSk7XG5cdFx0YXNzZXJ0TWF0Y2hlcygnb2snLCAnb2JvYm9iZntva30vdXNlcicsICdeb2JvYm9iZntvXmt9L3VzZXInLCBmdXp6eVNjb3JlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFVBQVUsZUFBZSxZQUFZLG9CQUFvQiw4QkFBNEQsZ0NBQWdDLGtCQUFrQiw0QkFBNEIsZUFBZSxxQkFBcUIsa0JBQWtCLGNBQWMsVUFBVTtBQUMxUixTQUFTLCtDQUErQztBQUV4RCxTQUFTLFNBQVMsUUFBaUIsTUFBYyxvQkFBNEIsWUFBK0M7QUFDM0gsUUFBTSxJQUFJLE9BQU8sTUFBTSxrQkFBa0I7QUFDekMsU0FBTyxHQUFHLEdBQUcsSUFBSSxpQkFBaUIsa0JBQWtCLEVBQUU7QUFDdEQsTUFBSSxZQUFZO0FBQ2YsV0FBTyxnQkFBZ0IsR0FBRyxVQUFVO0FBQUEsRUFDckM7QUFDRDtBQUVBLFNBQVMsWUFBWSxRQUFpQixNQUFjLG9CQUE0QjtBQUMvRSxTQUFPLENBQUMsT0FBTyxNQUFNLGtCQUFrQixHQUFHLEdBQUcsSUFBSSxZQUFZLGtCQUFrQixFQUFFO0FBQ2xGO0FBRUEsTUFBTSxXQUFXLE1BQU07QUFDdEIsMENBQXdDO0FBRXhDLE9BQUssTUFBTSxNQUFNO0FBQ2hCLFFBQUk7QUFDSixRQUFJO0FBQ0osVUFBTSxZQUFZLFNBQVUsR0FBVyxHQUFxQjtBQUUzRCxhQUFPLFdBQXNCO0FBQUUsaUJBQVMsQ0FBQztBQUFLLGVBQU87QUFBQSxNQUFVO0FBQUEsSUFDaEU7QUFFQSxlQUFXLENBQUMsR0FBRyxDQUFDO0FBQ2hCLGFBQVMsR0FBRyxVQUFVLEdBQUcsS0FBSyxHQUFHLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFDcEQsZ0JBQVksUUFBUSxZQUFZLFVBQVU7QUFDMUMsV0FBTyxnQkFBZ0IsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBRXZDLGVBQVcsQ0FBQyxHQUFHLENBQUM7QUFDaEIsYUFBUyxHQUFHLFVB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
