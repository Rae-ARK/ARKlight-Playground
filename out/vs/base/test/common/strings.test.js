import assert from "assert";
import * as strings from "../../common/strings.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Strings", () => {
  test("equalsIgnoreCase", () => {
    assert(strings.equalsIgnoreCase("", ""));
    assert(!strings.equalsIgnoreCase("", "1"));
    assert(!strings.equalsIgnoreCase("1", ""));
    assert(strings.equalsIgnoreCase("a", "a"));
    assert(strings.equalsIgnoreCase("abc", "Abc"));
    assert(strings.equalsIgnoreCase("abc", "ABC"));
    assert(strings.equalsIgnoreCase("H\xF6henmeter", "H\xD6henmeter"));
    assert(strings.equalsIgnoreCase("\xD6L", "\xD6l"));
  });
  test("equals", () => {
    assert(!strings.equals(void 0, "abc"));
    assert(!strings.equals("abc", void 0));
    assert(strings.equals(void 0, void 0));
    assert(strings.equals("", ""));
    assert(strings.equals("a", "a"));
    assert(!strings.equals("abc", "Abc"));
    assert(strings.equals("abc", "ABC", true));
    assert(!strings.equals("H\xF6henmeter", "H\xD6henmeter"));
    assert(!strings.equals("\xD6L", "\xD6l"));
    assert(strings.equals("\xD6L", "\xD6l", true));
  });
  test("startsWithIgnoreCase", () => {
    assert(strings.startsWithIgnoreCase("", ""));
    assert(!strings.startsWithIgnoreCase("", "1"));
    assert(strings.startsWithIgnoreCase("1", ""));
    assert(strings.startsWithIgnoreCase("a", "a"));
    assert(strings.startsWithIgnoreCase("abc", "Abc"));
    assert(strings.startsWithIgnoreCase("abc", "ABC"));
    assert(strings.startsWithIgnoreCase("H\xF6henmeter", "H\xD6henmeter"));
    assert(strings.startsWithIgnoreCase("\xD6L", "\xD6l"));
    assert(strings.startsWithIgnoreCase("alles klar", "a"));
    assert(strings.startsWithIgnoreCase("alles klar", "A"));
    assert(strings.startsWithIgnoreCase("alles klar", "alles k"));
    assert(strings.startsWithIgnoreCase("alles klar", "alles K"));
    assert(strings.startsWithIgnoreCase("alles klar", "ALLES K"));
    assert(strings.startsWithIgnoreCase("alles klar", "alles klar"));
    assert(strings.startsWithIgnoreCase("alles klar", "ALLES KLAR"));
    assert(!strings.startsWithIgnoreCase("alles klar", " ALLES K"));
    assert(!strings.startsWithIgnoreCase("alles klar", "ALLES K "));
    assert(!strings.startsWithIgnoreCase("alles klar", "\xF6ALLES K "));
    assert(!strings.startsWithIgnoreCase("alles klar", " "));
    assert(!strings.startsWithIgnoreCase("alles klar", "\xF6"));
  });
  test("endsWithIgnoreCase", () => {
    assert(strings.endsWithIgnoreCase("", ""));
    assert(!strings.endsWithIgnoreCase("", "1"));
    assert(strings.endsWithIgnoreCase("1", ""));
    assert(!strings.endsWithIgnoreCase("abcd", "abcde"));
    assert(strings.endsWithIgnoreCase("a", "a"));
    assert(strings.endsWithIgnoreCase("abc", "Abc"));
    assert(strings.endsWithIgnoreCase("abc", "ABC"));
    assert(strings.endsWithIgnoreCase("H\xF6henmeter", "H\xD6henmeter"));
    assert(strings.endsWithIgnoreCase("\xD6L", "\xD6l"));
    assert(strings.endsWithIgnoreCase("alles klar", "r"));
    assert(strings.endsWithIgnoreCase("alles klar", "R"));
    assert(strings.endsWithIgnoreCase("alles klar", "s klar"));
    assert(strings.endsWithIgnoreCase("alles klar", "S klar"));
    assert(strings.endsWithIgnoreCase("alles klar", "S KLAR"));
    assert(strings.endsWithIgnoreCase("alles klar", "alles klar"));
    assert(strings.endsWithIgnoreCase("alles klar", "ALLES KLAR"));
    assert(!strings.endsWithIgnoreCase("alles klar", "S KLAR "));
    assert(!strings.endsWithIgnoreCase("alles klar", " S KLAR"));
    assert(!strings.endsWithIgnoreCase("alles klar", "S KLAR\xF6"));
    assert(!strings.endsWithIgnoreCase("alles klar", " "));
    assert(!strings.endsWithIgnoreCase("alles klar", "\xF6"));
  });
  test("compareIgnoreCase", () => {
    function assertCompareIgnoreCase(a, b, recurse = true) {
      let actual = strings.compareIgnoreCase(a, b);
      actual = actual > 0 ? 1 : actual < 0 ? -1 : actual;
      let expected = strings.compare(a.toLowerCase(), b.toLowerCase());
      expected = expected > 0 ? 1 : expected < 0 ? -1 : expected;
      assert.strictEqual(actual, expected, `${a} <> ${b}`);
      if (recurse) {
        assertCompareIgnoreCase(b, a, false);
      }
    }
    assertCompareIgnoreCase("", "");
    assertCompareIgnoreCase("abc", "ABC");
    assertCompareIgnoreCase("abc", "ABc");
    assertCompareIgnoreCase("abc", "ABcd");
    assertCompareIgnoreCase("abc", "abcd");
    assertCompareIgnoreCase("foo", "f\xF6o");
    assertCompareIgnoreCase("Code", "code");
    assertCompareIgnoreCase("Code", "c\xF6de");
    assertCompareIgnoreCase("B", "a");
    assertCompareIgnoreCase("a", "B");
    assertCompareIgnoreCase("b", "a");
    assertCompareIgnoreCase("a", "b");
    assertCompareIgnoreCase("aa", "ab");
    assertCompareIgnoreCase("aa", "aB");
    assertCompareIgnoreCase("aa", "aA");
    assertCompareIgnoreCase("a", "aa");
    assertCompareIgnoreCase("ab", "aA");
    assertCompareIgnoreCase("O", "/");
  });
  test("compareIgnoreCase (substring)", () => {
    function assertCompareIgnoreCase(a, b, aStart, aEnd, bStart, bEnd, recurse = true) {
      let actual = strings.compareSubstringIgnoreCase(a, b, aStart, aEnd, bStart, bEnd);
      actual = actual > 0 ? 1 : actual < 0 ? -1 : actual;
      let expected = strings.compare(a.toLowerCase().substring(aStart, aEnd), b.toLowerCase().substring(bStart, bEnd));
      expected = expected > 0 ? 1 : expected < 0 ? -1 : expected;
      assert.strictEqual(actual, expected, `${a} <> ${b}`);
      if (recurse) {
        assertCompareIgnoreCase(b, a, bStart, bEnd, aStart, aEnd, false);
      }
    }
    assertCompareIgnoreCase("", "", 0, 0, 0, 0);
    assertCompareIgnoreCase("abc", "ABC", 0, 1, 0, 1);
    assertCompareIgnoreCase("abc", "Aabc", 0, 3, 1, 4);
    assertCompareIgnoreCase("abcABc", "ABcd", 3, 6, 0, 4);
  });
  test("format", () => {
    assert.strictEqual(strings.format("Foo Bar"), "Foo Bar");
    assert.strictEqual(strings.format("Foo {0} Bar"), "Foo {0} Bar");
    assert.strictEqual(strings.format("Foo {0} Bar", "yes"), "Foo yes Bar");
    assert.strictEqual(strings.format("Foo {0} Bar {0}", "yes"), "Foo yes Bar yes");
    assert.strictEqual(strings.format("Foo {0} Bar {1}{2}", "yes"), "Foo yes Bar {1}{2}");
    assert.strictEqual(strings.format("Foo {0} Bar {1}{2}", "yes", void 0), "Foo yes Bar undefined{2}");
    assert.strictEqual(strings.format("Foo {0} Bar {1}{2}", "yes", 5, false), "Foo yes Bar 5false");
    assert.strictEqual(strings.format("Foo {0} Bar. {1}", "(foo)", ".test"), "Foo (foo) Bar. .test");
  });
  test("format2", () => {
    assert.strictEqual(strings.format2("Foo Bar", {}), "Foo Bar");
    assert.strictEqual(strings.format2("Foo {oops} Bar", {}), "Foo {oops} Bar");
    assert.strictEqual(strings.format2("Foo {foo} Bar", { foo: "bar" }), "Foo bar Bar");
    assert.strictEqual(strings.format2("Foo {foo} Bar {foo}", { foo: "bar" }), "Foo bar Bar bar");
    assert.strictEqual(strings.format2("Foo {foo} Bar {bar}{boo}", { foo: "bar" }), "Foo bar Bar {bar}{boo}");
    assert.strictEqual(strings.format2("Foo {foo} Bar {bar}{boo}", { foo: "bar", bar: "undefined" }), "Foo bar Bar undefined{boo}");
    assert.strictEqual(strings.format2("Foo {foo} Bar {bar}{boo}", { foo: "bar", bar: "5", boo: false }), "Foo bar Bar 5false");
    assert.strictEqual(strings.format2("Foo {foo} Bar. {bar}", { foo: "(foo)", bar: ".test" }), "Foo (foo) Bar. .test");
  });
  test("lcut", () => {
    assert.strictEqual(strings.lcut("foo bar", 0), "");
    assert.strictEqual(strings.lcut("foo bar", 1), "bar");
    assert.strictEqual(strings.lcut("foo bar", 3), "bar");
    assert.strictEqual(strings.lcut("foo bar", 4), "bar");
    assert.strictEqual(strings.lcut("foo bar", 5), "foo bar");
    assert.strictEqual(strings.lcut("test string 0.1.2.3", 3), "2.3");
    assert.strictEqual(strings.lcut("foo bar", 0, "\u2026"), "\u2026");
    assert.strictEqual(strings.lcut("foo bar", 1, "\u2026"), "\u2026bar");
    assert.strictEqual(strings.lcut("foo bar", 3, "\u2026"), "\u2026bar");
    assert.strictEqual(strings.lcut("foo bar", 4, "\u2026"), "\u2026bar");
    assert.strictEqual(strings.lcut("foo bar", 5, "\u2026"), "foo bar");
    assert.strictEqual(strings.lcut("test string 0.1.2.3", 3, "\u2026"), "\u20262.3");
    assert.strictEqual(strings.lcut("", 10), "");
    assert.strictEqual(strings.lcut("a", 10), "a");
    assert.strictEqual(strings.lcut(" a", 10), "a");
    assert.strictEqual(strings.lcut("            a", 10), "a");
    assert.strictEqual(strings.lcut(" bbbb       a", 10), "bbbb       a");
    assert.strictEqual(strings.lcut("............a", 10), "............a");
    assert.strictEqual(strings.lcut("", 10, "\u2026"), "");
    assert.strictEqual(strings.lcut("a", 10, "\u2026"), "a");
    assert.strictEqual(strings.lcut(" a", 10, "\u2026"), "a");
    assert.strictEqual(strings.lcut("            a", 10, "\u2026"), "a");
    assert.strictEqual(strings.lcut(" bbbb       a", 10, "\u2026"), "bbbb       a");
    assert.strictEqual(strings.lcut("............a", 10, "\u2026"), "............a");
  });
  test("rcut", () => {
    assert.strictEqual(strings.rcut("foo bar", 0), "");
    assert.strictEqual(strings.rcut("foo bar", 1), "");
    assert.strictEqual(strings.rcut("foo bar", 3), "foo");
    assert.strictEqual(strings.rcut("foo bar", 4), "foo");
    assert.strictEqual(strings.rcut("foo bar", 5), "foo");
    assert.strictEqual(strings.rcut("foo bar", 7), "foo bar");
    assert.strictEqual(strings.rcut("foo bar", 10), "foo bar");
    assert.strictEqual(strings.rcut("test string 0.1.2.3", 6), "test");
    assert.strictEqual(strings.rcut("foo bar", 0, "\u2026"), "\u2026");
    assert.strictEqual(strings.rcut("foo bar", 1, "\u2026"), "\u2026");
    assert.strictEqual(strings.rcut("foo bar", 3, "\u2026"), "foo\u2026");
    assert.strictEqual(strings.rcut("foo bar", 4, "\u2026"), "foo\u2026");
    assert.strictEqual(strings.rcut("foo bar", 5, "\u2026"), "foo\u2026");
    assert.strictEqual(strings.rcut("foo bar", 7, "\u2026"), "foo bar");
    assert.strictEqual(strings.rcut("foo bar", 10, "\u2026"), "foo bar");
    assert.strictEqual(strings.rcut("test string 0.1.2.3", 6, "\u2026"), "test\u2026");
    assert.strictEqual(strings.rcut("", 10), "");
    assert.strictEqual(strings.rcut("a", 10), "a");
    assert.strictEqual(strings.rcut("a ", 10), "a");
    assert.strictEqual(strings.rcut("a            ", 10), "a");
    assert.strictEqual(strings.rcut("a       bbbb ", 10), "a       bbbb");
    assert.strictEqual(strings.rcut("a............", 10), "a............");
    assert.strictEqual(strings.rcut("", 10, "\u2026"), "");
    assert.strictEqual(strings.rcut("a", 10, "\u2026"), "a");
    assert.strictEqual(strings.rcut("a ", 10, "\u2026"), "a");
    assert.strictEqual(strings.rcut("a            ", 10, "\u2026"), "a");
    assert.strictEqual(strings.rcut("a       bbbb ", 10, "\u2026"), "a       bbbb");
    assert.strictEqual(strings.rcut("a............", 10, "\u2026"), "a............");
  });
  test("escape", () => {
    assert.strictEqual(strings.escape(""), "");
    assert.strictEqual(strings.escape("foo"), "foo");
    assert.strictEqual(strings.escape("foo bar"), "foo bar");
    assert.strictEqual(strings.escape("<foo bar>"), "&lt;foo bar&gt;");
    assert.strictEqual(strings.escape("<foo>Hello</foo>"), "&lt;foo&gt;Hello&lt;/foo&gt;");
  });
  test("ltrim", () => {
    assert.strictEqual(strings.ltrim("foo", "f"), "oo");
    assert.strictEqual(strings.ltrim("foo", "o"), "foo");
    assert.strictEqual(strings.ltrim("http://www.test.de", "http://"), "www.test.de");
    assert.strictEqual(strings.ltrim("/foo/", "/"), "foo/");
    assert.strictEqual(strings.ltrim("//foo/", "/"), "foo/");
    assert.strictEqual(strings.ltrim("/", ""), "/");
    assert.strictEqual(strings.ltrim("/", "/"), "");
    assert.strictEqual(strings.ltrim("///", "/"), "");
    assert.strictEqual(strings.ltrim("", ""), "");
    assert.strictEqual(strings.ltrim("", "/"), "");
    assert.strictEqual(strings.ltrim("---hello", "---"), "hello");
    assert.strictEqual(strings.ltrim("------hello", "---"), "hello");
    assert.strictEqual(strings.ltrim("---------hello", "---"), "hello");
    assert.strictEqual(strings.ltrim("hello---", "---"), "hello---");
  });
  test("rtrim", () => {
    assert.strictEqual(strings.rtrim("foo", "o"), "f");
    assert.strictEqual(strings.rtrim("foo", "f"), "foo");
    assert.strictEqual(strings.rtrim("http://www.test.de", ".de"), "http://www.test");
    assert.strictEqual(strings.rtrim("/foo/", "/"), "/foo");
    assert.strictEqual(strings.rtrim("/foo//", "/"), "/foo");
    assert.strictEqual(strings.rtrim("/", ""), "/");
    assert.strictEqual(strings.rtrim("/", "/"), "");
    assert.strictEqual(strings.rtrim("///", "/"), "");
    assert.strictEqual(strings.rtrim("", ""), "");
    assert.strictEqual(strings.rtrim("", "/"), "");
    assert.strictEqual(strings.rtrim("hello---", "---"), "hello");
    assert.strictEqual(strings.rtrim("hello------", "---"), "hello");
    assert.strictEqual(strings.rtrim("hello---------", "---"), "hello");
    assert.strictEqual(strings.rtrim("---hello", "---"), "---hello");
    assert.strictEqual(strings.rtrim("hello world" + "---".repeat(10), "---"), "hello world");
    assert.strictEqual(strings.rtrim("path/to/file///", "//"), "path/to/file/");
  });
  test("trim", () => {
    assert.strictEqual(strings.trim(" foo "), "foo");
    assert.strictEqual(strings.trim("  foo"), "foo");
    assert.strictEqual(strings.trim("bar  "), "bar");
    assert.strictEqual(strings.trim("   "), "");
    assert.strictEqual(strings.trim("foo bar", "bar"), "foo ");
  });
  test("trimWhitespace", () => {
    assert.strictEqual(" foo ".trim(), "foo");
    assert.strictEqual("	 foo	".trim(), "foo");
    assert.strictEqual("  foo".trim(), "foo");
    assert.strictEqual("bar  ".trim(), "bar");
    assert.strictEqual("   ".trim(), "");
    assert.strictEqual(" 	  ".trim(), "");
  });
  test("lastNonWhitespaceIndex", () => {
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc  	 	 "), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc"), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc	"), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc "), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc  	 	 "), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc  	 	 abc 	 	 "), 11);
    assert.strictEqual(strings.lastNonWhitespaceIndex("abc  	 	 abc 	 	 ", 8), 2);
    assert.strictEqual(strings.lastNonWhitespaceIndex("  	 	 "), -1);
  });
  test("containsRTL", () => {
    assert.strictEqual(strings.containsRTL("a"), false);
    assert.strictEqual(strings.containsRTL(""), false);
    assert.strictEqual(strings.containsRTL(strings.UTF8_BOM_CHARACTER + "a"), false);
    assert.strictEqual(strings.containsRTL("hello world!"), false);
    assert.strictEqual(strings.containsRTL("a\u{1F4DA}\u{1F4DA}b"), false);
    assert.strictEqual(strings.containsRTL("\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644"), true);
    assert.strictEqual(strings.containsRTL("\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"), true);
  });
  test("issue #115221: isEmojiImprecise misses \u2B50", () => {
    const codePoint = strings.getNextCodePoint("\u2B50", "\u2B50".length, 0);
    assert.strictEqual(strings.isEmojiImprecise(codePoint), true);
  });
  test("isFullWidthCharacter", () => {
    assert.strictEqual(strings.isFullWidthCharacter("\uFF21".charCodeAt(0)), true, "\uFF21 U+FF21 fullwidth A");
    assert.strictEqual(strings.isFullWidthCharacter("\uFF1F".charCodeAt(0)), true, "\uFF1F U+FF1F fullwidth question mark");
    assert.strictEqual(strings.isFullWidthCharacter("\uFF03".charCodeAt(0)), true, "\uFF03 U+FF03 fullwidth number sign");
    assert.strictEqual(strings.isFullWidthCharacter("\uFF1D".charCodeAt(0)), true, "\uFF1D U+FF1D fullwidth equals sign");
    assert.strictEqual(strings.isFullWidthCharacter("\u3042".charCodeAt(0)), true, "\u3042 U+3042 hiragana");
    assert.strictEqual(strings.isFullWidthCharacter("\uFFE5".charCodeAt(0)), true, "\uFFE5 U+FFE5 fullwidth yen sign");
    assert.strictEqual(strings.isFullWidthCharacter("A".charCodeAt(0)), false, "A regular ASCII");
    assert.strictEqual(strings.isFullWidthCharacter("?".charCodeAt(0)), false, "? regular ASCII");
  });
  test("isBasicASCII", () => {
    function assertIsBasicASCII(str, expected) {
      assert.strictEqual(strings.isBasicASCII(str), expected, str + ` (${str.charCodeAt(0)})`);
    }
    assertIsBasicASCII("abcdefghijklmnopqrstuvwxyz", true);
    assertIsBasicASCII("ABCDEFGHIJKLMNOPQRSTUVWXYZ", true);
    assertIsBasicASCII("1234567890", true);
    assertIsBasicASCII("`~!@#$%^&*()-_=+[{]}\\|;:'\",<.>/?", true);
    assertIsBasicASCII(" ", true);
    assertIsBasicASCII("	", true);
    assertIsBasicASCII("\n", true);
    assertIsBasicASCII("\r", true);
    let ALL = "\r	\n";
    for (let i = 32; i < 127; i++) {
      ALL += String.fromCharCode(i);
    }
    assertIsBasicASCII(ALL, true);
    assertIsBasicASCII(String.fromCharCode(31), false);
    assertIsBasicASCII(String.fromCharCode(127), false);
    assertIsBasicASCII("\xFC", false);
    assertIsBasicASCII("a\u{1F4DA}\u{1F4DA}b", false);
  });
  test("createRegExp", () => {
    assert.throws(() => strings.createRegExp("", false));
    assert.strictEqual(strings.createRegExp("abc", false).source, "abc");
    assert.strictEqual(strings.createRegExp("([^ ,.]*)", false).source, "\\(\\[\\^ ,\\.\\]\\*\\)");
    assert.strictEqual(strings.createRegExp("([^ ,.]*)", true).source, "([^ ,.]*)");
    assert.strictEqual(strings.createRegExp("abc", false, { wholeWord: true }).source, "\\babc\\b");
    assert.strictEqual(strings.createRegExp("abc", true, { wholeWord: true }).source, "\\babc\\b");
    assert.strictEqual(strings.createRegExp(" abc", true, { wholeWord: true }).source, " abc\\b");
    assert.strictEqual(strings.createRegExp("abc ", true, { wholeWord: true }).source, "\\babc ");
    assert.strictEqual(strings.createRegExp(" abc ", true, { wholeWord: true }).source, " abc ");
    const regExpWithoutFlags = strings.createRegExp("abc", true);
    assert(!regExpWithoutFlags.global);
    assert(regExpWithoutFlags.ignoreCase);
    assert(!regExpWithoutFlags.multiline);
    const regExpWithFlags = strings.createRegExp("abc", true, { global: true, matchCase: true, multiline: true });
    assert(regExpWithFlags.global);
    assert(!regExpWithFlags.ignoreCase);
    assert(regExpWithFlags.multiline);
  });
  test("getLeadingWhitespace", () => {
    assert.strictEqual(strings.getLeadingWhitespace("  foo"), "  ");
    assert.strictEqual(strings.getLeadingWhitespace("  foo", 2), "");
    assert.strictEqual(strings.getLeadingWhitespace("  foo", 1, 1), "");
    assert.strictEqual(strings.getLeadingWhitespace("  foo", 0, 1), " ");
    assert.strictEqual(strings.getLeadingWhitespace("  "), "  ");
    assert.strictEqual(strings.getLeadingWhitespace("  ", 1), " ");
    assert.strictEqual(strings.getLeadingWhitespace("  ", 0, 1), " ");
    assert.strictEqual(strings.getLeadingWhitespace("		function foo(){", 0, 1), "	");
    assert.strictEqual(strings.getLeadingWhitespace("		function foo(){", 0, 2), "		");
  });
  test("fuzzyContains", () => {
    assert.ok(!strings.fuzzyContains(void 0, null));
    assert.ok(strings.fuzzyContains("hello world", "h"));
    assert.ok(!strings.fuzzyContains("hello world", "q"));
    assert.ok(strings.fuzzyContains("hello world", "hw"));
    assert.ok(strings.fuzzyContains("hello world", "horl"));
    assert.ok(strings.fuzzyContains("hello world", "d"));
    assert.ok(!strings.fuzzyContains("hello world", "wh"));
    assert.ok(!strings.fuzzyContains("d", "dd"));
    assert.ok(strings.fuzzyContains("hello world", "H"));
    assert.ok(strings.fuzzyContains("Explorer", "E"));
    assert.ok(strings.fuzzyContains("hello world", "HW"));
    assert.ok(strings.fuzzyContains("\u0130ab", "\u0130b"));
    assert.ok(!strings.fuzzyContains("\u0130ab", "\u0130x"));
  });
  test("startsWithUTF8BOM", () => {
    assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER));
    assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER + "a"));
    assert(strings.startsWithUTF8BOM(strings.UTF8_BOM_CHARACTER + "aaaaaaaaaa"));
    assert(!strings.startsWithUTF8BOM(" " + strings.UTF8_BOM_CHARACTER));
    assert(!strings.startsWithUTF8BOM("foo"));
    assert(!strings.startsWithUTF8BOM(""));
  });
  test("stripUTF8BOM", () => {
    assert.strictEqual(strings.stripUTF8BOM(strings.UTF8_BOM_CHARACTER), "");
    assert.strictEqual(strings.stripUTF8BOM(strings.UTF8_BOM_CHARACTER + "foobar"), "foobar");
    assert.strictEqual(strings.stripUTF8BOM("foobar" + strings.UTF8_BOM_CHARACTER), "foobar" + strings.UTF8_BOM_CHARACTER);
    assert.strictEqual(strings.stripUTF8BOM("abc"), "abc");
    assert.strictEqual(strings.stripUTF8BOM(""), "");
  });
  test("containsUppercaseCharacter", () => {
    [
      [null, false],
      ["", false],
      ["foo", false],
      ["f\xF6\xF6", false],
      ["\u0646\u0627\u0643", false],
      ["\u05DE\u05D1\u05D5\u05E1\u05E1\u05EA", false],
      ["\u{1F600}", false],
      ["(#@()*&%()@*#&09827340982374}{:\">?></'\\~`", false],
      ["Foo", true],
      ["FOO", true],
      ["F\xF6\xD6", true],
      ["F\xF6\xD6", true],
      ["\\Foo", true]
    ].forEach(([str, result]) => {
      assert.strictEqual(strings.containsUppercaseCharacter(str), result, `Wrong result for ${str}`);
    });
  });
  test("containsUppercaseCharacter (ignoreEscapedChars)", () => {
    [
      ["\\Woo", false],
      ["f\\S\\S", false],
      ["foo", false],
      ["Foo", true]
    ].forEach(([str, result]) => {
      assert.strictEqual(strings.containsUppercaseCharacter(str, true), result, `Wrong result for ${str}`);
    });
  });
  test("uppercaseFirstLetter", () => {
    [
      ["", ""],
      ["foo", "Foo"],
      ["f", "F"],
      ["123", "123"],
      [".a", ".a"]
    ].forEach(([inStr, result]) => {
      assert.strictEqual(strings.uppercaseFirstLetter(inStr), result, `Wrong result for ${inStr}`);
    });
  });
  test("getNLines", () => {
    assert.strictEqual(strings.getNLines("", 5), "");
    assert.strictEqual(strings.getNLines("foo", 5), "foo");
    assert.strictEqual(strings.getNLines("foo\nbar", 5), "foo\nbar");
    assert.strictEqual(strings.getNLines("foo\nbar", 2), "foo\nbar");
    assert.strictEqual(strings.getNLines("foo\nbar", 1), "foo");
    assert.strictEqual(strings.getNLines("foo\nbar"), "foo");
    assert.strictEqual(strings.getNLines("foo\nbar\nsomething", 2), "foo\nbar");
    assert.strictEqual(strings.getNLines("foo", 0), "");
  });
  test("getGraphemeBreakType", () => {
    assert.strictEqual(strings.getGraphemeBreakType(3009), strings.GraphemeBreakType.SpacingMark);
  });
  test("truncate", () => {
    assert.strictEqual("hello world", strings.truncate("hello world", 100));
    assert.strictEqual("hello\u2026", strings.truncate("hello world", 5));
  });
  test("truncateMiddle", () => {
    assert.strictEqual("hello world", strings.truncateMiddle("hello world", 100));
    assert.strictEqual("he\u2026ld", strings.truncateMiddle("hello world", 5));
  });
  test("replaceAsync", async () => {
    let i = 0;
    assert.strictEqual(await strings.replaceAsync("abcabcabcabc", /b(.)/g, async (match, after) => {
      assert.strictEqual(match, "bc");
      assert.strictEqual(after, "c");
      return `${i++}${after}`;
    }), "a0ca1ca2ca3c");
  });
  suite("removeAnsiEscapeCodes", () => {
    function testSequence(sequence) {
      assert.strictEqual(strings.removeAnsiEscapeCodes(`hello${sequence}world`), "helloworld", `expect to remove ${JSON.stringify(sequence)}`);
      assert.deepStrictEqual(
        [...strings.forAnsiStringParts(`hello${sequence}world`)],
        [{ isCode: false, str: "hello" }, { isCode: true, str: sequence }, { isCode: false, str: "world" }],
        `expect to forAnsiStringParts ${JSON.stringify(sequence)}`
      );
    }
    test("CSI sequences", () => {
      const CSI = "\x1B[";
      const sequences = [
        // Base cases from https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Functions-using-CSI-_-ordered-by-the-final-character_s_
        `${CSI}42@`,
        `${CSI}42 @`,
        `${CSI}42A`,
        `${CSI}42 A`,
        `${CSI}42B`,
        `${CSI}42C`,
        `${CSI}42D`,
        `${CSI}42E`,
        `${CSI}42F`,
        `${CSI}42G`,
        `${CSI}42;42H`,
        `${CSI}42I`,
        `${CSI}42J`,
        `${CSI}?42J`,
        `${CSI}42K`,
        `${CSI}?42K`,
        `${CSI}42L`,
        `${CSI}42M`,
        `${CSI}42P`,
        `${CSI}#P`,
        `${CSI}3#P`,
        `${CSI}#Q`,
        `${CSI}3#Q`,
        `${CSI}#R`,
        `${CSI}42S`,
        `${CSI}?1;2;3S`,
        `${CSI}42T`,
        `${CSI}42;42;42;42;42T`,
        `${CSI}>3T`,
        `${CSI}42X`,
        `${CSI}42Z`,
        `${CSI}42^`,
        `${CSI}42\``,
        `${CSI}42a`,
        `${CSI}42b`,
        `${CSI}42c`,
        `${CSI}=42c`,
        `${CSI}>42c`,
        `${CSI}42d`,
        `${CSI}42e`,
        `${CSI}42;42f`,
        `${CSI}42g`,
        `${CSI}3h`,
        `${CSI}?3h`,
        `${CSI}42i`,
        `${CSI}?42i`,
        `${CSI}3l`,
        `${CSI}?3l`,
        `${CSI}3m`,
        `${CSI}>0;0m`,
        `${CSI}>0m`,
        `${CSI}?0m`,
        `${CSI}42n`,
        `${CSI}>42n`,
        `${CSI}?42n`,
        `${CSI}>42p`,
        `${CSI}!p`,
        `${CSI}0;0"p`,
        `${CSI}42$p`,
        `${CSI}?42$p`,
        `${CSI}#p`,
        `${CSI}3#p`,
        `${CSI}>42q`,
        `${CSI}42q`,
        `${CSI}42 q`,
        `${CSI}42"q`,
        `${CSI}#q`,
        `${CSI}42;42r`,
        `${CSI}?3r`,
        `${CSI}0;0;0;0;3$r`,
        `${CSI}s`,
        `${CSI}0;0s`,
        `${CSI}>42s`,
        `${CSI}?3s`,
        `${CSI}42;42;42t`,
        `${CSI}>3t`,
        `${CSI}42 t`,
        `${CSI}0;0;0;0;3$t`,
        `${CSI}u`,
        `${CSI}42 u`,
        `${CSI}0;0;0;0;0;0;0;0$v`,
        `${CSI}42$w`,
        `${CSI}0;0;0;0'w`,
        `${CSI}42x`,
        `${CSI}42*x`,
        `${CSI}0;0;0;0;0$x`,
        `${CSI}42#y`,
        `${CSI}0;0;0;0;0;0*y`,
        `${CSI}42;0'z`,
        `${CSI}0;1;2;4$z`,
        `${CSI}3'{`,
        `${CSI}#{`,
        `${CSI}3#{`,
        `${CSI}0;0;0;0\${`,
        `${CSI}0;0;0;0#|`,
        `${CSI}42$|`,
        `${CSI}42'|`,
        `${CSI}42*|`,
        `${CSI}#}`,
        `${CSI}42'}`,
        `${CSI}42$}`,
        `${CSI}42'~`,
        `${CSI}42$~`,
        // Common SGR cases:
        `${CSI}1;31m`,
        // multiple attrs
        `${CSI}105m`,
        // bright background
        `${CSI}48:5:128m`,
        // 256 indexed color
        `${CSI}48;5;128m`,
        // 256 indexed color alt
        `${CSI}38:2:0:255:255:255m`,
        // truecolor
        `${CSI}38;2;255;255;255m`
        // truecolor alt
      ];
      for (const sequence of sequences) {
        testSequence(sequence);
      }
    });
    suite("OSC sequences", () => {
      function testOscSequence(prefix, suffix) {
        const sequenceContent = [
          `633;SetMark;`,
          `633;P;Cwd=/foo`,
          `7;file://local/Users/me/foo/bar`
        ];
        const sequences = [];
        for (const content of sequenceContent) {
          sequences.push(`${prefix}${content}${suffix}`);
        }
        for (const sequence of sequences) {
          testSequence(sequence);
        }
      }
      test("ESC ] Ps ; Pt ESC \\", () => {
        testOscSequence("\x1B]", "\x1B\\");
      });
      test("ESC ] Ps ; Pt BEL", () => {
        testOscSequence("\x1B]", "\x07");
      });
      test("ESC ] Ps ; Pt ST", () => {
        testOscSequence("\x1B]", "\x9C");
      });
      test("OSC Ps ; Pt ESC \\", () => {
        testOscSequence("\x9D", "\x1B\\");
      });
      test("OSC Ps ; Pt BEL", () => {
        testOscSequence("\x9D", "\x07");
      });
      test("OSC Ps ; Pt ST", () => {
        testOscSequence("\x9D", "\x9C");
      });
    });
    test("ESC sequences", () => {
      const sequenceContent = [
        ` F`,
        ` G`,
        ` L`,
        ` M`,
        ` N`,
        `#3`,
        `#4`,
        `#5`,
        `#6`,
        `#8`,
        `%@`,
        `%G`,
        `(C`,
        `)C`,
        `*C`,
        `+C`,
        `-C`,
        `.C`,
        `/C`
      ];
      const sequences = [];
      for (const content of sequenceContent) {
        sequences.push(`\x1B${content}`);
      }
      for (const sequence of sequences) {
        testSequence(sequence);
      }
    });
    suite("regression tests", () => {
      test("#209937", () => {
        assert.strictEqual(
          strings.removeAnsiEscapeCodes(`localhost:\x1B[31m1234`),
          "localhost:1234"
        );
      });
    });
  });
  test("removeAnsiEscapeCodesFromPrompt", () => {
    assert.strictEqual(strings.removeAnsiEscapeCodesFromPrompt("\x1B[31m$ \x1B[0m"), "$ ");
    assert.strictEqual(strings.removeAnsiEscapeCodesFromPrompt("\n\\[\x1B[01;34m\\]\\w\\[\x1B[00m\\]\n\\[\x1B[1;32m\\]> \\[\x1B[0m\\]"), "\n\\w\n> ");
  });
  test("count", () => {
    assert.strictEqual(strings.count("hello world", "o"), 2);
    assert.strictEqual(strings.count("hello world", "l"), 3);
    assert.strictEqual(strings.count("hello world", "z"), 0);
    assert.strictEqual(strings.count("hello world", "hello"), 1);
    assert.strictEqual(strings.count("hello world", "world"), 1);
    assert.strictEqual(strings.count("hello world", "hello world"), 1);
    assert.strictEqual(strings.count("hello world", "foo"), 0);
  });
  test("containsAmbiguousCharacter", () => {
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("abcd"), false);
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("\xFC\xE5"), false);
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("(*&^)"), false);
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("\u03BF"), true);
    assert.strictEqual(strings.AmbiguousCharacters.getInstance(/* @__PURE__ */ new Set()).containsAmbiguousCharacter("ab\u0261c"), true);
  });
  test("containsInvisibleCharacter", () => {
    assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter("abcd"), false);
    assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter(" "), true);
    assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter("a\u{E004E}b"), true);
    assert.strictEqual(strings.InvisibleCharacters.containsInvisibleCharacter("a\u{E015A}\vb"), true);
  });
  test("multibyteAwareBtoa", () => {
    assert.ok(strings.multibyteAwareBtoa("hello world").length > 0);
    assert.ok(strings.multibyteAwareBtoa("\u5E73\u4EEE\u540D").length > 0);
    assert.ok(strings.multibyteAwareBtoa(new Array(1e5).fill("vs").join("")).length > 0);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
test("htmlAttributeEncodeValue", () => {
  assert.strictEqual(strings.htmlAttributeEncodeValue(""), "");
  assert.strictEqual(strings.htmlAttributeEncodeValue("abc"), "abc");
  assert.strictEqual(strings.htmlAttributeEncodeValue('<script>alert("Hello")<\/script>'), "&lt;script&gt;alert(&quot;Hello&quot;)&lt;/script&gt;");
  assert.strictEqual(strings.htmlAttributeEncodeValue("Hello & World"), "Hello &amp; World");
  assert.strictEqual(strings.htmlAttributeEncodeValue('"Hello"'), "&quot;Hello&quot;");
  assert.strictEqual(strings.htmlAttributeEncodeValue("'Hello'"), "&apos;Hello&apos;");
  assert.strictEqual(strings.htmlAttributeEncodeValue(`<>&'"`), "&lt;&gt;&amp;&apos;&quot;");
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vc3RyaW5ncy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdTdHJpbmdzJywgKCkgPT4ge1xuXHR0ZXN0KCdlcXVhbHNJZ25vcmVDYXNlJywgKCkgPT4ge1xuXHRcdGFzc2VydChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UoJycsICcnKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UoJycsICcxJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKCcxJywgJycpKTtcblxuXHRcdGFzc2VydChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UoJ2EnLCAnYScpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKCdhYmMnLCAnQWJjJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVxdWFsc0lnbm9yZUNhc2UoJ2FiYycsICdBQkMnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZXF1YWxzSWdub3JlQ2FzZSgnSFx1MDBGNmhlbm1ldGVyJywgJ0hcdTAwRDZoZW5tZXRlcicpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lcXVhbHNJZ25vcmVDYXNlKCdcdTAwRDZMJywgJ1x1MDBENmwnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VxdWFscycsICgpID0+IHtcblx0XHRhc3NlcnQoIXN0cmluZ3MuZXF1YWxzKHVuZGVmaW5lZCwgJ2FiYycpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3MuZXF1YWxzKCdhYmMnLCB1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lcXVhbHModW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lcXVhbHMoJycsICcnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZXF1YWxzKCdhJywgJ2EnKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVxdWFscygnYWJjJywgJ0FiYycpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lcXVhbHMoJ2FiYycsICdBQkMnLCB0cnVlKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVxdWFscygnSFx1MDBGNmhlbm1ldGVyJywgJ0hcdTAwRDZoZW5tZXRlcicpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3MuZXF1YWxzKCdcdTAwRDZMJywgJ1x1MDBENmwnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZXF1YWxzKCdcdTAwRDZMJywgJ1x1MDBENmwnLCB0cnVlKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0c1dpdGhJZ25vcmVDYXNlJywgKCkgPT4ge1xuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCcnLCAnJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnJywgJzEnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJzEnLCAnJykpO1xuXG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2EnLCAnYScpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWJjJywgJ0FiYycpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWJjJywgJ0FCQycpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnSFx1MDBGNmhlbm1ldGVyJywgJ0hcdTAwRDZoZW5tZXRlcicpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnXHUwMEQ2TCcsICdcdTAwRDZsJykpO1xuXG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnYScpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdBJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ2FsbGVzIGsnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnYWxsZXMgSycpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdBTExFUyBLJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ2FsbGVzIGtsYXInKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnQUxMRVMgS0xBUicpKTtcblxuXHRcdGFzc2VydCghc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICcgQUxMRVMgSycpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3Muc3RhcnRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnQUxMRVMgSyAnKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ1x1MDBGNkFMTEVTIEsgJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICcgJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5zdGFydHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdcdTAwRjYnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VuZHNXaXRoSWdub3JlQ2FzZScsICgpID0+IHtcblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJycsICcnKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnJywgJzEnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCcxJywgJycpKTtcblxuXHRcdGFzc2VydCghc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FiY2QnLCAnYWJjZGUnKSk7XG5cblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2EnLCAnYScpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FiYycsICdBYmMnKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdhYmMnLCAnQUJDJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnSFx1MDBGNmhlbm1ldGVyJywgJ0hcdTAwRDZoZW5tZXRlcicpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ1x1MDBENkwnLCAnXHUwMEQ2bCcpKTtcblxuXHRcdGFzc2VydChzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdyJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdSJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdzIGtsYXInKSk7XG5cdFx0YXNzZXJ0KHN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ1Mga2xhcicpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnUyBLTEFSJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdhbGxlcyBrbGFyJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdBTExFUyBLTEFSJykpO1xuXG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdTIEtMQVIgJykpO1xuXHRcdGFzc2VydCghc3RyaW5ncy5lbmRzV2l0aElnbm9yZUNhc2UoJ2FsbGVzIGtsYXInLCAnIFMgS0xBUicpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJ1MgS0xBUlx1MDBGNicpKTtcblx0XHRhc3NlcnQoIXN0cmluZ3MuZW5kc1dpdGhJZ25vcmVDYXNlKCdhbGxlcyBrbGFyJywgJyAnKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLmVuZHNXaXRoSWdub3JlQ2FzZSgnYWxsZXMga2xhcicsICdcdTAwRjYnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVJZ25vcmVDYXNlJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoYTogc3RyaW5nLCBiOiBzdHJpbmcsIHJlY3Vyc2UgPSB0cnVlKTogdm9pZCB7XG5cdFx0XHRsZXQgYWN0dWFsID0gc3RyaW5ncy5jb21wYXJlSWdub3JlQ2FzZShhLCBiKTtcblx0XHRcdGFjdHVhbCA9IGFjdHVhbCA+IDAgPyAxIDogYWN0dWFsIDwgMCA/IC0xIDogYWN0dWFsO1xuXG5cdFx0XHRsZXQgZXhwZWN0ZWQgPSBzdHJpbmdzLmNvbXBhcmUoYS50b0xvd2VyQ2FzZSgpLCBiLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0ZXhwZWN0ZWQgPSBleHBlY3RlZCA+IDAgPyAxIDogZXhwZWN0ZWQgPCAwID8gLTEgOiBleHBlY3RlZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBgJHthfSA8PiAke2J9YCk7XG5cblx0XHRcdGlmIChyZWN1cnNlKSB7XG5cdFx0XHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKGIsIGEsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnJywgJycpO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdhYmMnLCAnQUJDJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FiYycsICdBQmMnKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnYWJjJywgJ0FCY2QnKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnYWJjJywgJ2FiY2QnKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnZm9vJywgJ2ZcdTAwRjZvJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ0NvZGUnLCAnY29kZScpO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdDb2RlJywgJ2NcdTAwRjZkZScpO1xuXG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ0InLCAnYScpO1xuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCdhJywgJ0InKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnYicsICdhJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2EnLCAnYicpO1xuXG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FhJywgJ2FiJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FhJywgJ2FCJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FhJywgJ2FBJyk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2EnLCAnYWEnKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnYWInLCAnYUEnKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnTycsICcvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBhcmVJZ25vcmVDYXNlIChzdWJzdHJpbmcpJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoYTogc3RyaW5nLCBiOiBzdHJpbmcsIGFTdGFydDogbnVtYmVyLCBhRW5kOiBudW1iZXIsIGJTdGFydDogbnVtYmVyLCBiRW5kOiBudW1iZXIsIHJlY3Vyc2UgPSB0cnVlKTogdm9pZCB7XG5cdFx0XHRsZXQgYWN0dWFsID0gc3RyaW5ncy5jb21wYXJlU3Vic3RyaW5nSWdub3JlQ2FzZShhLCBiLCBhU3RhcnQsIGFFbmQsIGJTdGFydCwgYkVuZCk7XG5cdFx0XHRhY3R1YWwgPSBhY3R1YWwgPiAwID8gMSA6IGFjdHVhbCA8IDAgPyAtMSA6IGFjdHVhbDtcblxuXHRcdFx0bGV0IGV4cGVjdGVkID0gc3RyaW5ncy5jb21wYXJlKGEudG9Mb3dlckNhc2UoKS5zdWJzdHJpbmcoYVN0YXJ0LCBhRW5kKSwgYi50b0xvd2VyQ2FzZSgpLnN1YnN0cmluZyhiU3RhcnQsIGJFbmQpKTtcblx0XHRcdGV4cGVjdGVkID0gZXhwZWN0ZWQgPiAwID8gMSA6IGV4cGVjdGVkIDwgMCA/IC0xIDogZXhwZWN0ZWQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgYCR7YX0gPD4gJHtifWApO1xuXG5cdFx0XHRpZiAocmVjdXJzZSkge1xuXHRcdFx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZShiLCBhLCBiU3RhcnQsIGJFbmQsIGFTdGFydCwgYUVuZCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGFzc2VydENvbXBhcmVJZ25vcmVDYXNlKCcnLCAnJywgMCwgMCwgMCwgMCk7XG5cdFx0YXNzZXJ0Q29tcGFyZUlnbm9yZUNhc2UoJ2FiYycsICdBQkMnLCAwLCAxLCAwLCAxKTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnYWJjJywgJ0FhYmMnLCAwLCAzLCAxLCA0KTtcblx0XHRhc3NlcnRDb21wYXJlSWdub3JlQ2FzZSgnYWJjQUJjJywgJ0FCY2QnLCAzLCA2LCAwLCA0KTtcblx0fSk7XG5cblx0dGVzdCgnZm9ybWF0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdCgnRm9vIEJhcicpLCAnRm9vIEJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdCgnRm9vIHswfSBCYXInKSwgJ0ZvbyB7MH0gQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0KCdGb28gezB9IEJhcicsICd5ZXMnKSwgJ0ZvbyB5ZXMgQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0KCdGb28gezB9IEJhciB7MH0nLCAneWVzJyksICdGb28geWVzIEJhciB5ZXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQoJ0ZvbyB7MH0gQmFyIHsxfXsyfScsICd5ZXMnKSwgJ0ZvbyB5ZXMgQmFyIHsxfXsyfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdCgnRm9vIHswfSBCYXIgezF9ezJ9JywgJ3llcycsIHVuZGVmaW5lZCksICdGb28geWVzIEJhciB1bmRlZmluZWR7Mn0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQoJ0ZvbyB7MH0gQmFyIHsxfXsyfScsICd5ZXMnLCA1LCBmYWxzZSksICdGb28geWVzIEJhciA1ZmFsc2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQoJ0ZvbyB7MH0gQmFyLiB7MX0nLCAnKGZvbyknLCAnLnRlc3QnKSwgJ0ZvbyAoZm9vKSBCYXIuIC50ZXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvcm1hdDInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0MignRm9vIEJhcicsIHt9KSwgJ0ZvbyBCYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQyKCdGb28ge29vcHN9IEJhcicsIHt9KSwgJ0ZvbyB7b29wc30gQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0MignRm9vIHtmb299IEJhcicsIHsgZm9vOiAnYmFyJyB9KSwgJ0ZvbyBiYXIgQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZm9ybWF0MignRm9vIHtmb299IEJhciB7Zm9vfScsIHsgZm9vOiAnYmFyJyB9KSwgJ0ZvbyBiYXIgQmFyIGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdDIoJ0ZvbyB7Zm9vfSBCYXIge2Jhcn17Ym9vfScsIHsgZm9vOiAnYmFyJyB9KSwgJ0ZvbyBiYXIgQmFyIHtiYXJ9e2Jvb30nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQyKCdGb28ge2Zvb30gQmFyIHtiYXJ9e2Jvb30nLCB7IGZvbzogJ2JhcicsIGJhcjogJ3VuZGVmaW5lZCcgfSksICdGb28gYmFyIEJhciB1bmRlZmluZWR7Ym9vfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmZvcm1hdDIoJ0ZvbyB7Zm9vfSBCYXIge2Jhcn17Ym9vfScsIHsgZm9vOiAnYmFyJywgYmFyOiAnNScsIGJvbzogZmFsc2UgfSksICdGb28gYmFyIEJhciA1ZmFsc2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5mb3JtYXQyKCdGb28ge2Zvb30gQmFyLiB7YmFyfScsIHsgZm9vOiAnKGZvbyknLCBiYXI6ICcudGVzdCcgfSksICdGb28gKGZvbykgQmFyLiAudGVzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdsY3V0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ2ZvbyBiYXInLCAwKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ2ZvbyBiYXInLCAxKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ2ZvbyBiYXInLCAzKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ2ZvbyBiYXInLCA0KSwgJ2JhcicpOyAvLyBMZWFkaW5nIHdoaXRlc3BhY2UgdHJpbW1lZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ2ZvbyBiYXInLCA1KSwgJ2ZvbyBiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCd0ZXN0IHN0cmluZyAwLjEuMi4zJywgMyksICcyLjMnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ2ZvbyBiYXInLCAwLCAnXHUyMDI2JyksICdcdTIwMjYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdmb28gYmFyJywgMSwgJ1x1MjAyNicpLCAnXHUyMDI2YmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnZm9vIGJhcicsIDMsICdcdTIwMjYnKSwgJ1x1MjAyNmJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ2ZvbyBiYXInLCA0LCAnXHUyMDI2JyksICdcdTIwMjZiYXInKTsgLy8gTGVhZGluZyB3aGl0ZXNwYWNlIHRyaW1tZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdmb28gYmFyJywgNSwgJ1x1MjAyNicpLCAnZm9vIGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ3Rlc3Qgc3RyaW5nIDAuMS4yLjMnLCAzLCAnXHUyMDI2JyksICdcdTIwMjYyLjMnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJycsIDEwKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJ2EnLCAxMCksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnIGEnLCAxMCksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnICAgICAgICAgICAgYScsIDEwKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCcgYmJiYiAgICAgICBhJywgMTApLCAnYmJiYiAgICAgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnLi4uLi4uLi4uLi4uYScsIDEwKSwgJy4uLi4uLi4uLi4uLmEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxjdXQoJycsIDEwLCAnXHUyMDI2JyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCdhJywgMTAsICdcdTIwMjYnKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCcgYScsIDEwLCAnXHUyMDI2JyksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnICAgICAgICAgICAgYScsIDEwLCAnXHUyMDI2JyksICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGN1dCgnIGJiYmIgICAgICAgYScsIDEwLCAnXHUyMDI2JyksICdiYmJiICAgICAgIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sY3V0KCcuLi4uLi4uLi4uLi5hJywgMTAsICdcdTIwMjYnKSwgJy4uLi4uLi4uLi4uLmEnKTtcblx0fSk7XG5cblx0dGVzdCgncmN1dCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdmb28gYmFyJywgMCksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdmb28gYmFyJywgMSksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdmb28gYmFyJywgMyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdmb28gYmFyJywgNCksICdmb28nKTsgLy8gVHJhaWxpbmcgd2hpdGVzcGFjZSB0cmltbWVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDUpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDcpLCAnZm9vIGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2ZvbyBiYXInLCAxMCksICdmb28gYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgndGVzdCBzdHJpbmcgMC4xLjIuMycsIDYpLCAndGVzdCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDAsICdcdTIwMjYnKSwgJ1x1MjAyNicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2ZvbyBiYXInLCAxLCAnXHUyMDI2JyksICdcdTIwMjYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdmb28gYmFyJywgMywgJ1x1MjAyNicpLCAnZm9vXHUyMDI2Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDQsICdcdTIwMjYnKSwgJ2Zvb1x1MjAyNicpOyAvLyBUcmFpbGluZyB3aGl0ZXNwYWNlIHRyaW1tZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdmb28gYmFyJywgNSwgJ1x1MjAyNicpLCAnZm9vXHUyMDI2Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnZm9vIGJhcicsIDcsICdcdTIwMjYnKSwgJ2ZvbyBiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdmb28gYmFyJywgMTAsICdcdTIwMjYnKSwgJ2ZvbyBiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCd0ZXN0IHN0cmluZyAwLjEuMi4zJywgNiwgJ1x1MjAyNicpLCAndGVzdFx1MjAyNicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnJywgMTApLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnYScsIDEwKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdhICcsIDEwKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdhICAgICAgICAgICAgJywgMTApLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2EgICAgICAgYmJiYiAnLCAxMCksICdhICAgICAgIGJiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdhLi4uLi4uLi4uLi4uJywgMTApLCAnYS4uLi4uLi4uLi4uLicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmN1dCgnJywgMTAsICdcdTIwMjYnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2EnLCAxMCwgJ1x1MjAyNicpLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2EgJywgMTAsICdcdTIwMjYnKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdhICAgICAgICAgICAgJywgMTAsICdcdTIwMjYnKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5yY3V0KCdhICAgICAgIGJiYmIgJywgMTAsICdcdTIwMjYnKSwgJ2EgICAgICAgYmJiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJjdXQoJ2EuLi4uLi4uLi4uLi4nLCAxMCwgJ1x1MjAyNicpLCAnYS4uLi4uLi4uLi4uLicpO1xuXHR9KTtcblxuXHR0ZXN0KCdlc2NhcGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZXNjYXBlKCcnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmVzY2FwZSgnZm9vJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5lc2NhcGUoJ2ZvbyBiYXInKSwgJ2ZvbyBiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5lc2NhcGUoJzxmb28gYmFyPicpLCAnJmx0O2ZvbyBiYXImZ3Q7Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZXNjYXBlKCc8Zm9vPkhlbGxvPC9mb28+JyksICcmbHQ7Zm9vJmd0O0hlbGxvJmx0Oy9mb28mZ3Q7Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2x0cmltJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCdmb28nLCAnZicpLCAnb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnZm9vJywgJ28nKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCdodHRwOi8vd3d3LnRlc3QuZGUnLCAnaHR0cDovLycpLCAnd3d3LnRlc3QuZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnL2Zvby8nLCAnLycpLCAnZm9vLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCcvL2Zvby8nLCAnLycpLCAnZm9vLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCcvJywgJycpLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCcvJywgJy8nKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCcvLy8nLCAnLycpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubHRyaW0oJycsICcnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCcnLCAnLycpLCAnJyk7XG5cdFx0Ly8gTXVsdGktY2hhcmFjdGVyIG5lZWRsZSB3aXRoIGNvbnNlY3V0aXZlIHJlcGV0aXRpb25zXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubHRyaW0oJy0tLWhlbGxvJywgJy0tLScpLCAnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sdHJpbSgnLS0tLS0taGVsbG8nLCAnLS0tJyksICdoZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmx0cmltKCctLS0tLS0tLS1oZWxsbycsICctLS0nKSwgJ2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubHRyaW0oJ2hlbGxvLS0tJywgJy0tLScpLCAnaGVsbG8tLS0nKTtcblx0fSk7XG5cblx0dGVzdCgncnRyaW0nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJ2ZvbycsICdvJyksICdmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJ2ZvbycsICdmJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnaHR0cDovL3d3dy50ZXN0LmRlJywgJy5kZScpLCAnaHR0cDovL3d3dy50ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJy9mb28vJywgJy8nKSwgJy9mb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnL2Zvby8vJywgJy8nKSwgJy9mb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnLycsICcnKSwgJy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnLycsICcvJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnLy8vJywgJy8nKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJ0cmltKCcnLCAnJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnJywgJy8nKSwgJycpO1xuXHRcdC8vIE11bHRpLWNoYXJhY3RlciBuZWVkbGUgd2l0aCBjb25zZWN1dGl2ZSByZXBldGl0aW9ucyAoYnVnIGZpeClcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnaGVsbG8tLS0nLCAnLS0tJyksICdoZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJ0cmltKCdoZWxsby0tLS0tLScsICctLS0nKSwgJ2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucnRyaW0oJ2hlbGxvLS0tLS0tLS0tJywgJy0tLScpLCAnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5ydHJpbSgnLS0taGVsbG8nLCAnLS0tJyksICctLS1oZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJ0cmltKCdoZWxsbyB3b3JsZCcgKyAnLS0tJy5yZXBlYXQoMTApLCAnLS0tJyksICdoZWxsbyB3b3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJ0cmltKCdwYXRoL3RvL2ZpbGUvLy8nLCAnLy8nKSwgJ3BhdGgvdG8vZmlsZS8nKTtcblx0fSk7XG5cblx0dGVzdCgndHJpbScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy50cmltKCcgZm9vICcpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MudHJpbSgnICBmb28nKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnRyaW0oJ2JhciAgJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy50cmltKCcgICAnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnRyaW0oJ2ZvbyBiYXInLCAnYmFyJyksICdmb28gJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaW1XaGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnIGZvbyAnLnRyaW0oKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnXHQgZm9vXHQnLnRyaW0oKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnICBmb28nLnRyaW0oKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnYmFyICAnLnRyaW0oKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnICAgJy50cmltKCksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJyBcdCAgJy50cmltKCksICcnKTtcblx0fSk7XG5cblx0dGVzdCgnbGFzdE5vbldoaXRlc3BhY2VJbmRleCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KCdhYmMgIFxcdCBcXHQgJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgoJ2FiYycpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KCdhYmNcXHQnKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleCgnYWJjICcpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KCdhYmMgIFxcdCBcXHQgJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgoJ2FiYyAgXFx0IFxcdCBhYmMgXFx0IFxcdCAnKSwgMTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgoJ2FiYyAgXFx0IFxcdCBhYmMgXFx0IFxcdCAnLCA4KSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleCgnICBcXHQgXFx0ICcpLCAtMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRhaW5zUlRMJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNvbnRhaW5zUlRMKCdhJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb250YWluc1JUTCgnJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb250YWluc1JUTChzdHJpbmdzLlVURjhfQk9NX0NIQVJBQ1RFUiArICdhJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb250YWluc1JUTCgnaGVsbG8gd29ybGQhJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb250YWluc1JUTCgnYVx1RDgzRFx1RENEQVx1RDgzRFx1RENEQWInKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNvbnRhaW5zUlRMKCdcdTA2NDdcdTA2NDZcdTA2MjdcdTA2NDMgXHUwNjJEXHUwNjQyXHUwNjRBXHUwNjQyXHUwNjI5IFx1MDY0NVx1MDYyQlx1MDYyOFx1MDYyQVx1MDYyOSBcdTA2NDVcdTA2NDZcdTA2MzAgXHUwNjMyXHUwNjQ1XHUwNjQ2IFx1MDYzN1x1MDY0OFx1MDY0QVx1MDY0NCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb250YWluc1JUTCgnXHUwNUQ2XHUwNUQ1XHUwNUQ0XHUwNUQ5IFx1MDVFMlx1MDVENVx1MDVEMVx1MDVEM1x1MDVENCBcdTA1REVcdTA1RDFcdTA1RDVcdTA1RTFcdTA1RTFcdTA1RUEgXHUwNUU5XHUwNUQzXHUwNUUyXHUwNUVBXHUwNUQ1JyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE1MjIxOiBpc0Vtb2ppSW1wcmVjaXNlIG1pc3NlcyBcdTJCNTAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29kZVBvaW50ID0gc3RyaW5ncy5nZXROZXh0Q29kZVBvaW50KCdcdTJCNTAnLCAnXHUyQjUwJy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmlzRW1vamlJbXByZWNpc2UoY29kZVBvaW50KSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzRnVsbFdpZHRoQ2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdC8vIEZ1bGx3aWR0aCBBU0NJSSAoRkYwMS1GRjVFKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmlzRnVsbFdpZHRoQ2hhcmFjdGVyKCdcdUZGMjEnLmNoYXJDb2RlQXQoMCkpLCB0cnVlLCAnXHVGRjIxIFUrRkYyMSBmdWxsd2lkdGggQScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmlzRnVsbFdpZHRoQ2hhcmFjdGVyKCdcdUZGMUYnLmNoYXJDb2RlQXQoMCkpLCB0cnVlLCAnXHVGRjFGIFUrRkYxRiBmdWxsd2lkdGggcXVlc3Rpb24gbWFyaycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmlzRnVsbFdpZHRoQ2hhcmFjdGVyKCdcdUZGMDMnLmNoYXJDb2RlQXQoMCkpLCB0cnVlLCAnXHVGRjAzIFUrRkYwMyBmdWxsd2lkdGggbnVtYmVyIHNpZ24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcignXHVGRjFEJy5jaGFyQ29kZUF0KDApKSwgdHJ1ZSwgJ1x1RkYxRCBVK0ZGMUQgZnVsbHdpZHRoIGVxdWFscyBzaWduJyk7XG5cblx0XHQvLyBIaXJhZ2FuYSAoMzA0MC0zMDlGKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmlzRnVsbFdpZHRoQ2hhcmFjdGVyKCdcdTMwNDInLmNoYXJDb2RlQXQoMCkpLCB0cnVlLCAnXHUzMDQyIFUrMzA0MiBoaXJhZ2FuYScpO1xuXG5cdFx0Ly8gRnVsbHdpZHRoIHN5bWJvbHMgKEZGRTAtRkZFNilcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcignXHVGRkU1Jy5jaGFyQ29kZUF0KDApKSwgdHJ1ZSwgJ1x1RkZFNSBVK0ZGRTUgZnVsbHdpZHRoIHllbiBzaWduJyk7XG5cblx0XHQvLyBSZWd1bGFyIEFTQ0lJIHNob3VsZCBub3QgYmUgZnVsbCB3aWR0aFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmlzRnVsbFdpZHRoQ2hhcmFjdGVyKCdBJy5jaGFyQ29kZUF0KDApKSwgZmFsc2UsICdBIHJlZ3VsYXIgQVNDSUknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Z1bGxXaWR0aENoYXJhY3RlcignPycuY2hhckNvZGVBdCgwKSksIGZhbHNlLCAnPyByZWd1bGFyIEFTQ0lJJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzQmFzaWNBU0NJSScsICgpID0+IHtcblx0XHRmdW5jdGlvbiBhc3NlcnRJc0Jhc2ljQVNDSUkoc3RyOiBzdHJpbmcsIGV4cGVjdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5pc0Jhc2ljQVNDSUkoc3RyKSwgZXhwZWN0ZWQsIHN0ciArIGAgKCR7c3RyLmNoYXJDb2RlQXQoMCl9KWApO1xuXHRcdH1cblx0XHRhc3NlcnRJc0Jhc2ljQVNDSUkoJ2FiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6JywgdHJ1ZSk7XG5cdFx0YXNzZXJ0SXNCYXNpY0FTQ0lJKCdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWicsIHRydWUpO1xuXHRcdGFzc2VydElzQmFzaWNBU0NJSSgnMTIzNDU2Nzg5MCcsIHRydWUpO1xuXHRcdGFzc2VydElzQmFzaWNBU0NJSSgnYH4hQCMkJV4mKigpLV89K1t7XX1cXFxcfDs6XFwnXCIsPC4+Lz8nLCB0cnVlKTtcblx0XHRhc3NlcnRJc0Jhc2ljQVNDSUkoJyAnLCB0cnVlKTtcblx0XHRhc3NlcnRJc0Jhc2ljQVNDSUkoJ1xcdCcsIHRydWUpO1xuXHRcdGFzc2VydElzQmFzaWNBU0NJSSgnXFxuJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0SXNCYXNpY0FTQ0lJKCdcXHInLCB0cnVlKTtcblxuXHRcdGxldCBBTEwgPSAnXFxyXFx0XFxuJztcblx0XHRmb3IgKGxldCBpID0gMzI7IGkgPCAxMjc7IGkrKykge1xuXHRcdFx0QUxMICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoaSk7XG5cdFx0fVxuXHRcdGFzc2VydElzQmFzaWNBU0NJSShBTEwsIHRydWUpO1xuXG5cdFx0YXNzZXJ0SXNCYXNpY0FTQ0lJKFN0cmluZy5mcm9tQ2hhckNvZGUoMzEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0SXNCYXNpY0FTQ0lJKFN0cmluZy5mcm9tQ2hhckNvZGUoMTI3KSwgZmFsc2UpO1xuXHRcdGFzc2VydElzQmFzaWNBU0NJSSgnXHUwMEZDJywgZmFsc2UpO1xuXHRcdGFzc2VydElzQmFzaWNBU0NJSSgnYVx1RDgzRFx1RENEQVx1RDgzRFx1RENEQWInLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVJlZ0V4cCcsICgpID0+IHtcblx0XHQvLyBFbXB0eVxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc3RyaW5ncy5jcmVhdGVSZWdFeHAoJycsIGZhbHNlKSk7XG5cblx0XHQvLyBFc2NhcGVzIGFwcHJvcHJpYXRlbHlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jcmVhdGVSZWdFeHAoJ2FiYycsIGZhbHNlKS5zb3VyY2UsICdhYmMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jcmVhdGVSZWdFeHAoJyhbXiAsLl0qKScsIGZhbHNlKS5zb3VyY2UsICdcXFxcKFxcXFxbXFxcXF4gLFxcXFwuXFxcXF1cXFxcKlxcXFwpJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY3JlYXRlUmVnRXhwKCcoW14gLC5dKiknLCB0cnVlKS5zb3VyY2UsICcoW14gLC5dKiknKTtcblxuXHRcdC8vIFdob2xlIHdvcmRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jcmVhdGVSZWdFeHAoJ2FiYycsIGZhbHNlLCB7IHdob2xlV29yZDogdHJ1ZSB9KS5zb3VyY2UsICdcXFxcYmFiY1xcXFxiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY3JlYXRlUmVnRXhwKCdhYmMnLCB0cnVlLCB7IHdob2xlV29yZDogdHJ1ZSB9KS5zb3VyY2UsICdcXFxcYmFiY1xcXFxiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY3JlYXRlUmVnRXhwKCcgYWJjJywgdHJ1ZSwgeyB3aG9sZVdvcmQ6IHRydWUgfSkuc291cmNlLCAnIGFiY1xcXFxiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY3JlYXRlUmVnRXhwKCdhYmMgJywgdHJ1ZSwgeyB3aG9sZVdvcmQ6IHRydWUgfSkuc291cmNlLCAnXFxcXGJhYmMgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY3JlYXRlUmVnRXhwKCcgYWJjICcsIHRydWUsIHsgd2hvbGVXb3JkOiB0cnVlIH0pLnNvdXJjZSwgJyBhYmMgJyk7XG5cblx0XHRjb25zdCByZWdFeHBXaXRob3V0RmxhZ3MgPSBzdHJpbmdzLmNyZWF0ZVJlZ0V4cCgnYWJjJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0KCFyZWdFeHBXaXRob3V0RmxhZ3MuZ2xvYmFsKTtcblx0XHRhc3NlcnQocmVnRXhwV2l0aG91dEZsYWdzLmlnbm9yZUNhc2UpO1xuXHRcdGFzc2VydCghcmVnRXhwV2l0aG91dEZsYWdzLm11bHRpbGluZSk7XG5cblx0XHRjb25zdCByZWdFeHBXaXRoRmxhZ3MgPSBzdHJpbmdzLmNyZWF0ZVJlZ0V4cCgnYWJjJywgdHJ1ZSwgeyBnbG9iYWw6IHRydWUsIG1hdGNoQ2FzZTogdHJ1ZSwgbXVsdGlsaW5lOiB0cnVlIH0pO1xuXHRcdGFzc2VydChyZWdFeHBXaXRoRmxhZ3MuZ2xvYmFsKTtcblx0XHRhc3NlcnQoIXJlZ0V4cFdpdGhGbGFncy5pZ25vcmVDYXNlKTtcblx0XHRhc3NlcnQocmVnRXhwV2l0aEZsYWdzLm11bHRpbGluZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldExlYWRpbmdXaGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKCcgIGZvbycpLCAnICAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZSgnICBmb28nLCAyKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKCcgIGZvbycsIDEsIDEpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UoJyAgZm9vJywgMCwgMSksICcgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UoJyAgJyksICcgICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKCcgICcsIDEpLCAnICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKCcgICcsIDAsIDEpLCAnICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKCdcXHRcXHRmdW5jdGlvbiBmb28oKXsnLCAwLCAxKSwgJ1xcdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKCdcXHRcXHRmdW5jdGlvbiBmb28oKXsnLCAwLCAyKSwgJ1xcdFxcdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eUNvbnRhaW5zJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayghc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCh1bmRlZmluZWQpISwgbnVsbCEpKTtcblx0XHRhc3NlcnQub2soc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCdoZWxsbyB3b3JsZCcsICdoJykpO1xuXHRcdGFzc2VydC5vayghc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCdoZWxsbyB3b3JsZCcsICdxJykpO1xuXHRcdGFzc2VydC5vayhzdHJpbmdzLmZ1enp5Q29udGFpbnMoJ2hlbGxvIHdvcmxkJywgJ2h3JykpO1xuXHRcdGFzc2VydC5vayhzdHJpbmdzLmZ1enp5Q29udGFpbnMoJ2hlbGxvIHdvcmxkJywgJ2hvcmwnKSk7XG5cdFx0YXNzZXJ0Lm9rKHN0cmluZ3MuZnV6enlDb250YWlucygnaGVsbG8gd29ybGQnLCAnZCcpKTtcblx0XHRhc3NlcnQub2soIXN0cmluZ3MuZnV6enlDb250YWlucygnaGVsbG8gd29ybGQnLCAnd2gnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFzdHJpbmdzLmZ1enp5Q29udGFpbnMoJ2QnLCAnZGQnKSk7XG5cdFx0YXNzZXJ0Lm9rKHN0cmluZ3MuZnV6enlDb250YWlucygnaGVsbG8gd29ybGQnLCAnSCcpKTtcblx0XHRhc3NlcnQub2soc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCdFeHBsb3JlcicsICdFJykpO1xuXHRcdGFzc2VydC5vayhzdHJpbmdzLmZ1enp5Q29udGFpbnMoJ2hlbGxvIHdvcmxkJywgJ0hXJykpO1xuXHRcdC8vIHRvTG93ZXJDYXNlKCkgY2FuIGxlbmd0aGVuIHRoZSBxdWVyeSAoXHUwMTMwIC0+IGlcdTAzMDcpOyBldmVyeSBsb3dlcmVkIGNvZGUgdW5pdCBtdXN0IHN0aWxsIGJlIG1hdGNoZWRcblx0XHRhc3NlcnQub2soc3RyaW5ncy5mdXp6eUNvbnRhaW5zKCdcXHUwMTMwYWInLCAnXFx1MDEzMGInKSk7XG5cdFx0YXNzZXJ0Lm9rKCFzdHJpbmdzLmZ1enp5Q29udGFpbnMoJ1xcdTAxMzBhYicsICdcXHUwMTMweCcpKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnRzV2l0aFVURjhCT00nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0KHN0cmluZ3Muc3RhcnRzV2l0aFVURjhCT00oc3RyaW5ncy5VVEY4X0JPTV9DSEFSQUNURVIpKTtcblx0XHRhc3NlcnQoc3RyaW5ncy5zdGFydHNXaXRoVVRGOEJPTShzdHJpbmdzLlVURjhfQk9NX0NIQVJBQ1RFUiArICdhJykpO1xuXHRcdGFzc2VydChzdHJpbmdzLnN0YXJ0c1dpdGhVVEY4Qk9NKHN0cmluZ3MuVVRGOF9CT01fQ0hBUkFDVEVSICsgJ2FhYWFhYWFhYWEnKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLnN0YXJ0c1dpdGhVVEY4Qk9NKCcgJyArIHN0cmluZ3MuVVRGOF9CT01fQ0hBUkFDVEVSKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLnN0YXJ0c1dpdGhVVEY4Qk9NKCdmb28nKSk7XG5cdFx0YXNzZXJ0KCFzdHJpbmdzLnN0YXJ0c1dpdGhVVEY4Qk9NKCcnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwVVRGOEJPTScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5zdHJpcFVURjhCT00oc3RyaW5ncy5VVEY4X0JPTV9DSEFSQUNURVIpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3Muc3RyaXBVVEY4Qk9NKHN0cmluZ3MuVVRGOF9CT01fQ0hBUkFDVEVSICsgJ2Zvb2JhcicpLCAnZm9vYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3Muc3RyaXBVVEY4Qk9NKCdmb29iYXInICsgc3RyaW5ncy5VVEY4X0JPTV9DSEFSQUNURVIpLCAnZm9vYmFyJyArIHN0cmluZ3MuVVRGOF9CT01fQ0hBUkFDVEVSKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5zdHJpcFVURjhCT00oJ2FiYycpLCAnYWJjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3Muc3RyaXBVVEY4Qk9NKCcnKSwgJycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250YWluc1VwcGVyY2FzZUNoYXJhY3RlcicsICgpID0+IHtcblx0XHRbXG5cdFx0XHRbbnVsbCwgZmFsc2VdLFxuXHRcdFx0WycnLCBmYWxzZV0sXG5cdFx0XHRbJ2ZvbycsIGZhbHNlXSxcblx0XHRcdFsnZlx1MDBGNlx1MDBGNicsIGZhbHNlXSxcblx0XHRcdFsnXHUwNjQ2XHUwNjI3XHUwNjQzJywgZmFsc2VdLFxuXHRcdFx0WydcdTA1REVcdTA1RDFcdTA1RDVcdTA1RTFcdTA1RTFcdTA1RUEnLCBmYWxzZV0sXG5cdFx0XHRbJ1x1RDgzRFx1REUwMCcsIGZhbHNlXSxcblx0XHRcdFsnKCNAKCkqJiUoKUAqIyYwOTgyNzM0MDk4MjM3NH17OlwiPj8+PC9cXCdcXFxcfmAnLCBmYWxzZV0sXG5cblx0XHRcdFsnRm9vJywgdHJ1ZV0sXG5cdFx0XHRbJ0ZPTycsIHRydWVdLFxuXHRcdFx0WydGXHUwMEY2XHUwMEQ2JywgdHJ1ZV0sXG5cdFx0XHRbJ0ZcdTAwRjZcdTAwRDYnLCB0cnVlXSxcblx0XHRcdFsnXFxcXEZvbycsIHRydWVdLFxuXHRcdF0uZm9yRWFjaCgoW3N0ciwgcmVzdWx0XSkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY29udGFpbnNVcHBlcmNhc2VDaGFyYWN0ZXIoPHN0cmluZz5zdHIpLCByZXN1bHQsIGBXcm9uZyByZXN1bHQgZm9yICR7c3RyfWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250YWluc1VwcGVyY2FzZUNoYXJhY3RlciAoaWdub3JlRXNjYXBlZENoYXJzKScsICgpID0+IHtcblx0XHRbXG5cdFx0XHRbJ1xcXFxXb28nLCBmYWxzZV0sXG5cdFx0XHRbJ2ZcXFxcU1xcXFxTJywgZmFsc2VdLFxuXHRcdFx0Wydmb28nLCBmYWxzZV0sXG5cblx0XHRcdFsnRm9vJywgdHJ1ZV0sXG5cdFx0XS5mb3JFYWNoKChbc3RyLCByZXN1bHRdKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb250YWluc1VwcGVyY2FzZUNoYXJhY3Rlcig8c3RyaW5nPnN0ciwgdHJ1ZSksIHJlc3VsdCwgYFdyb25nIHJlc3VsdCBmb3IgJHtzdHJ9YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwcGVyY2FzZUZpcnN0TGV0dGVyJywgKCkgPT4ge1xuXHRcdFtcblx0XHRcdFsnJywgJyddLFxuXHRcdFx0Wydmb28nLCAnRm9vJ10sXG5cdFx0XHRbJ2YnLCAnRiddLFxuXHRcdFx0WycxMjMnLCAnMTIzJ10sXG5cdFx0XHRbJy5hJywgJy5hJ10sXG5cdFx0XS5mb3JFYWNoKChbaW5TdHIsIHJlc3VsdF0pID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnVwcGVyY2FzZUZpcnN0TGV0dGVyKGluU3RyKSwgcmVzdWx0LCBgV3JvbmcgcmVzdWx0IGZvciAke2luU3RyfWApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXROTGluZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0TkxpbmVzKCcnLCA1KSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldE5MaW5lcygnZm9vJywgNSksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXROTGluZXMoJ2Zvb1xcbmJhcicsIDUpLCAnZm9vXFxuYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0TkxpbmVzKCdmb29cXG5iYXInLCAyKSwgJ2Zvb1xcbmJhcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0TkxpbmVzKCdmb29cXG5iYXInLCAxKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmdldE5MaW5lcygnZm9vXFxuYmFyJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXROTGluZXMoJ2Zvb1xcbmJhclxcbnNvbWV0aGluZycsIDIpLCAnZm9vXFxuYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuZ2V0TkxpbmVzKCdmb28nLCAwKSwgJycpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRHcmFwaGVtZUJyZWFrVHlwZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5nZXRHcmFwaGVtZUJyZWFrVHlwZSgweEJDMSksIHN0cmluZ3MuR3JhcGhlbWVCcmVha1R5cGUuU3BhY2luZ01hcmspO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnVuY2F0ZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ2hlbGxvIHdvcmxkJywgc3RyaW5ncy50cnVuY2F0ZSgnaGVsbG8gd29ybGQnLCAxMDApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ2hlbGxvXHUyMDI2Jywgc3RyaW5ncy50cnVuY2F0ZSgnaGVsbG8gd29ybGQnLCA1KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RydW5jYXRlTWlkZGxlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnaGVsbG8gd29ybGQnLCBzdHJpbmdzLnRydW5jYXRlTWlkZGxlKCdoZWxsbyB3b3JsZCcsIDEwMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnaGVcdTIwMjZsZCcsIHN0cmluZ3MudHJ1bmNhdGVNaWRkbGUoJ2hlbGxvIHdvcmxkJywgNSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlQXN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGkgPSAwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzdHJpbmdzLnJlcGxhY2VBc3luYygnYWJjYWJjYWJjYWJjJywgL2IoLikvZywgYXN5bmMgKG1hdGNoLCBhZnRlcikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoLCAnYmMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZnRlciwgJ2MnKTtcblx0XHRcdHJldHVybiBgJHtpKyt9JHthZnRlcn1gO1xuXHRcdH0pLCAnYTBjYTFjYTJjYTNjJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZW1vdmVBbnNpRXNjYXBlQ29kZXMnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdGVzdFNlcXVlbmNlKHNlcXVlbmNlOiBzdHJpbmcpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLnJlbW92ZUFuc2lFc2NhcGVDb2RlcyhgaGVsbG8ke3NlcXVlbmNlfXdvcmxkYCksICdoZWxsb3dvcmxkJywgYGV4cGVjdCB0byByZW1vdmUgJHtKU09OLnN0cmluZ2lmeShzZXF1ZW5jZSl9YCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbLi4uc3RyaW5ncy5mb3JBbnNpU3RyaW5nUGFydHMoYGhlbGxvJHtzZXF1ZW5jZX13b3JsZGApXSxcblx0XHRcdFx0W3sgaXNDb2RlOiBmYWxzZSwgc3RyOiAnaGVsbG8nIH0sIHsgaXNDb2RlOiB0cnVlLCBzdHI6IHNlcXVlbmNlIH0sIHsgaXNDb2RlOiBmYWxzZSwgc3RyOiAnd29ybGQnIH1dLFxuXHRcdFx0XHRgZXhwZWN0IHRvIGZvckFuc2lTdHJpbmdQYXJ0cyAke0pTT04uc3RyaW5naWZ5KHNlcXVlbmNlKX1gXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ0NTSSBzZXF1ZW5jZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBDU0kgPSAnXFx4MWJbJztcblx0XHRcdGNvbnN0IHNlcXVlbmNlcyA9IFtcblx0XHRcdFx0Ly8gQmFzZSBjYXNlcyBmcm9tIGh0dHBzOi8vaW52aXNpYmxlLWlzbGFuZC5uZXQveHRlcm0vY3Rsc2Vxcy9jdGxzZXFzLmh0bWwjaDMtRnVuY3Rpb25zLXVzaW5nLUNTSS1fLW9yZGVyZWQtYnktdGhlLWZpbmFsLWNoYXJhY3Rlcl9zX1xuXHRcdFx0XHRgJHtDU0l9NDJAYCxcblx0XHRcdFx0YCR7Q1NJfTQyIEBgLFxuXHRcdFx0XHRgJHtDU0l9NDJBYCxcblx0XHRcdFx0YCR7Q1NJfTQyIEFgLFxuXHRcdFx0XHRgJHtDU0l9NDJCYCxcblx0XHRcdFx0YCR7Q1NJfTQyQ2AsXG5cdFx0XHRcdGAke0NTSX00MkRgLFxuXHRcdFx0XHRgJHtDU0l9NDJFYCxcblx0XHRcdFx0YCR7Q1NJfTQyRmAsXG5cdFx0XHRcdGAke0NTSX00MkdgLFxuXHRcdFx0XHRgJHtDU0l9NDI7NDJIYCxcblx0XHRcdFx0YCR7Q1NJfTQySWAsXG5cdFx0XHRcdGAke0NTSX00MkpgLFxuXHRcdFx0XHRgJHtDU0l9PzQySmAsXG5cdFx0XHRcdGAke0NTSX00MktgLFxuXHRcdFx0XHRgJHtDU0l9PzQyS2AsXG5cdFx0XHRcdGAke0NTSX00MkxgLFxuXHRcdFx0XHRgJHtDU0l9NDJNYCxcblx0XHRcdFx0YCR7Q1NJfTQyUGAsXG5cdFx0XHRcdGAke0NTSX0jUGAsXG5cdFx0XHRcdGAke0NTSX0zI1BgLFxuXHRcdFx0XHRgJHtDU0l9I1FgLFxuXHRcdFx0XHRgJHtDU0l9MyNRYCxcblx0XHRcdFx0YCR7Q1NJfSNSYCxcblx0XHRcdFx0YCR7Q1NJfTQyU2AsXG5cdFx0XHRcdGAke0NTSX0/MTsyOzNTYCxcblx0XHRcdFx0YCR7Q1NJfTQyVGAsXG5cdFx0XHRcdGAke0NTSX00Mjs0Mjs0Mjs0Mjs0MlRgLFxuXHRcdFx0XHRgJHtDU0l9PjNUYCxcblx0XHRcdFx0YCR7Q1NJfTQyWGAsXG5cdFx0XHRcdGAke0NTSX00MlpgLFxuXHRcdFx0XHRgJHtDU0l9NDJeYCxcblx0XHRcdFx0YCR7Q1NJfTQyXFxgYCxcblx0XHRcdFx0YCR7Q1NJfTQyYWAsXG5cdFx0XHRcdGAke0NTSX00MmJgLFxuXHRcdFx0XHRgJHtDU0l9NDJjYCxcblx0XHRcdFx0YCR7Q1NJfT00MmNgLFxuXHRcdFx0XHRgJHtDU0l9PjQyY2AsXG5cdFx0XHRcdGAke0NTSX00MmRgLFxuXHRcdFx0XHRgJHtDU0l9NDJlYCxcblx0XHRcdFx0YCR7Q1NJfTQyOzQyZmAsXG5cdFx0XHRcdGAke0NTSX00MmdgLFxuXHRcdFx0XHRgJHtDU0l9M2hgLFxuXHRcdFx0XHRgJHtDU0l9PzNoYCxcblx0XHRcdFx0YCR7Q1NJfTQyaWAsXG5cdFx0XHRcdGAke0NTSX0/NDJpYCxcblx0XHRcdFx0YCR7Q1NJfTNsYCxcblx0XHRcdFx0YCR7Q1NJfT8zbGAsXG5cdFx0XHRcdGAke0NTSX0zbWAsXG5cdFx0XHRcdGAke0NTSX0+MDswbWAsXG5cdFx0XHRcdGAke0NTSX0+MG1gLFxuXHRcdFx0XHRgJHtDU0l9PzBtYCxcblx0XHRcdFx0YCR7Q1NJfTQybmAsXG5cdFx0XHRcdGAke0NTSX0+NDJuYCxcblx0XHRcdFx0YCR7Q1NJfT80Mm5gLFxuXHRcdFx0XHRgJHtDU0l9PjQycGAsXG5cdFx0XHRcdGAke0NTSX0hcGAsXG5cdFx0XHRcdGAke0NTSX0wOzBcInBgLFxuXHRcdFx0XHRgJHtDU0l9NDIkcGAsXG5cdFx0XHRcdGAke0NTSX0/NDIkcGAsXG5cdFx0XHRcdGAke0NTSX0jcGAsXG5cdFx0XHRcdGAke0NTSX0zI3BgLFxuXHRcdFx0XHRgJHtDU0l9PjQycWAsXG5cdFx0XHRcdGAke0NTSX00MnFgLFxuXHRcdFx0XHRgJHtDU0l9NDIgcWAsXG5cdFx0XHRcdGAke0NTSX00MlwicWAsXG5cdFx0XHRcdGAke0NTSX0jcWAsXG5cdFx0XHRcdGAke0NTSX00Mjs0MnJgLFxuXHRcdFx0XHRgJHtDU0l9PzNyYCxcblx0XHRcdFx0YCR7Q1NJfTA7MDswOzA7MyRyYCxcblx0XHRcdFx0YCR7Q1NJfXNgLFxuXHRcdFx0XHRgJHtDU0l9MDswc2AsXG5cdFx0XHRcdGAke0NTSX0+NDJzYCxcblx0XHRcdFx0YCR7Q1NJfT8zc2AsXG5cdFx0XHRcdGAke0NTSX00Mjs0Mjs0MnRgLFxuXHRcdFx0XHRgJHtDU0l9PjN0YCxcblx0XHRcdFx0YCR7Q1NJfTQyIHRgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MDszJHRgLFxuXHRcdFx0XHRgJHtDU0l9dWAsXG5cdFx0XHRcdGAke0NTSX00MiB1YCxcblx0XHRcdFx0YCR7Q1NJfTA7MDswOzA7MDswOzA7MCR2YCxcblx0XHRcdFx0YCR7Q1NJfTQyJHdgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MCd3YCxcblx0XHRcdFx0YCR7Q1NJfTQyeGAsXG5cdFx0XHRcdGAke0NTSX00Mip4YCxcblx0XHRcdFx0YCR7Q1NJfTA7MDswOzA7MCR4YCxcblx0XHRcdFx0YCR7Q1NJfTQyI3lgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MDswOzAqeWAsXG5cdFx0XHRcdGAke0NTSX00MjswJ3pgLFxuXHRcdFx0XHRgJHtDU0l9MDsxOzI7NCR6YCxcblx0XHRcdFx0YCR7Q1NJfTMne2AsXG5cdFx0XHRcdGAke0NTSX0je2AsXG5cdFx0XHRcdGAke0NTSX0zI3tgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MFxcJHtgLFxuXHRcdFx0XHRgJHtDU0l9MDswOzA7MCN8YCxcblx0XHRcdFx0YCR7Q1NJfTQyJHxgLFxuXHRcdFx0XHRgJHtDU0l9NDInfGAsXG5cdFx0XHRcdGAke0NTSX00Mip8YCxcblx0XHRcdFx0YCR7Q1NJfSN9YCxcblx0XHRcdFx0YCR7Q1NJfTQyJ31gLFxuXHRcdFx0XHRgJHtDU0l9NDIkfWAsXG5cdFx0XHRcdGAke0NTSX00Mid+YCxcblx0XHRcdFx0YCR7Q1NJfTQyJH5gLFxuXG5cdFx0XHRcdC8vIENvbW1vbiBTR1IgY2FzZXM6XG5cdFx0XHRcdGAke0NTSX0xOzMxbWAsIC8vIG11bHRpcGxlIGF0dHJzXG5cdFx0XHRcdGAke0NTSX0xMDVtYCwgLy8gYnJpZ2h0IGJhY2tncm91bmRcblx0XHRcdFx0YCR7Q1NJfTQ4OjU6MTI4bWAsIC8vIDI1NiBpbmRleGVkIGNvbG9yXG5cdFx0XHRcdGAke0NTSX00ODs1OzEyOG1gLCAvLyAyNTYgaW5kZXhlZCBjb2xvciBhbHRcblx0XHRcdFx0YCR7Q1NJfTM4OjI6MDoyNTU6MjU1OjI1NW1gLCAvLyB0cnVlY29sb3Jcblx0XHRcdFx0YCR7Q1NJfTM4OzI7MjU1OzI1NTsyNTVtYCwgLy8gdHJ1ZWNvbG9yIGFsdFxuXHRcdFx0XTtcblxuXHRcdFx0Zm9yIChjb25zdCBzZXF1ZW5jZSBvZiBzZXF1ZW5jZXMpIHtcblx0XHRcdFx0dGVzdFNlcXVlbmNlKHNlcXVlbmNlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHN1aXRlKCdPU0Mgc2VxdWVuY2VzJywgKCkgPT4ge1xuXHRcdFx0ZnVuY3Rpb24gdGVzdE9zY1NlcXVlbmNlKHByZWZpeDogc3RyaW5nLCBzdWZmaXg6IHN0cmluZykge1xuXHRcdFx0XHRjb25zdCBzZXF1ZW5jZUNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0YDYzMztTZXRNYXJrO2AsXG5cdFx0XHRcdFx0YDYzMztQO0N3ZD0vZm9vYCxcblx0XHRcdFx0XHRgNztmaWxlOi8vbG9jYWwvVXNlcnMvbWUvZm9vL2JhcmBcblx0XHRcdFx0XTtcblxuXHRcdFx0XHRjb25zdCBzZXF1ZW5jZXMgPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb250ZW50IG9mIHNlcXVlbmNlQ29udGVudCkge1xuXHRcdFx0XHRcdHNlcXVlbmNlcy5wdXNoKGAke3ByZWZpeH0ke2NvbnRlbnR9JHtzdWZmaXh9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBzZXF1ZW5jZSBvZiBzZXF1ZW5jZXMpIHtcblx0XHRcdFx0XHR0ZXN0U2VxdWVuY2Uoc2VxdWVuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0ZXN0KCdFU0MgXSBQcyA7IFB0IEVTQyBcXFxcJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0T3NjU2VxdWVuY2UoJ1xceDFiXScsICdcXHgxYlxcXFwnKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnRVNDIF0gUHMgOyBQdCBCRUwnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RPc2NTZXF1ZW5jZSgnXFx4MWJdJywgJ1xceDA3Jyk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ0VTQyBdIFBzIDsgUHQgU1QnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RPc2NTZXF1ZW5jZSgnXFx4MWJdJywgJ1xceDljJyk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ09TQyBQcyA7IFB0IEVTQyBcXFxcJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0T3NjU2VxdWVuY2UoJ1xceDlkJywgJ1xceDFiXFxcXCcpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdPU0MgUHMgOyBQdCBCRUwnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RPc2NTZXF1ZW5jZSgnXFx4OWQnLCAnXFx4MDcnKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnT1NDIFBzIDsgUHQgU1QnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3RPc2NTZXF1ZW5jZSgnXFx4OWQnLCAnXFx4OWMnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRVNDIHNlcXVlbmNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcXVlbmNlQ29udGVudCA9IFtcblx0XHRcdFx0YCBGYCxcblx0XHRcdFx0YCBHYCxcblx0XHRcdFx0YCBMYCxcblx0XHRcdFx0YCBNYCxcblx0XHRcdFx0YCBOYCxcblx0XHRcdFx0YCMzYCxcblx0XHRcdFx0YCM0YCxcblx0XHRcdFx0YCM1YCxcblx0XHRcdFx0YCM2YCxcblx0XHRcdFx0YCM4YCxcblx0XHRcdFx0YCVAYCxcblx0XHRcdFx0YCVHYCxcblx0XHRcdFx0YChDYCxcblx0XHRcdFx0YClDYCxcblx0XHRcdFx0YCpDYCxcblx0XHRcdFx0YCtDYCxcblx0XHRcdFx0YC1DYCxcblx0XHRcdFx0YC5DYCxcblx0XHRcdFx0YC9DYFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHNlcXVlbmNlcyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBjb250ZW50IG9mIHNlcXVlbmNlQ29udGVudCkge1xuXHRcdFx0XHRzZXF1ZW5jZXMucHVzaChgXFx4MWIke2NvbnRlbnR9YCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHNlcXVlbmNlIG9mIHNlcXVlbmNlcykge1xuXHRcdFx0XHR0ZXN0U2VxdWVuY2Uoc2VxdWVuY2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3JlZ3Jlc3Npb24gdGVzdHMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCcjMjA5OTM3JywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0c3RyaW5ncy5yZW1vdmVBbnNpRXNjYXBlQ29kZXMoYGxvY2FsaG9zdDpcXHgxYlszMW0xMjM0YCksXG5cdFx0XHRcdFx0J2xvY2FsaG9zdDoxMjM0J1xuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUFuc2lFc2NhcGVDb2Rlc0Zyb21Qcm9tcHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmVtb3ZlQW5zaUVzY2FwZUNvZGVzRnJvbVByb21wdCgnXFx1MDAxYlszMW0kIFxcdTAwMWJbMG0nKSwgJyQgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MucmVtb3ZlQW5zaUVzY2FwZUNvZGVzRnJvbVByb21wdCgnXFxuXFxcXFtcXHUwMDFiWzAxOzM0bVxcXFxdXFxcXHdcXFxcW1xcdTAwMWJbMDBtXFxcXF1cXG5cXFxcW1xcdTAwMWJbMTszMm1cXFxcXT4gXFxcXFtcXHUwMDFiWzBtXFxcXF0nKSwgJ1xcblxcXFx3XFxuPiAnKTtcblx0fSk7XG5cblx0dGVzdCgnY291bnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ28nKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ2wnKSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ3onKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ2hlbGxvJyksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmNvdW50KCdoZWxsbyB3b3JsZCcsICd3b3JsZCcpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5jb3VudCgnaGVsbG8gd29ybGQnLCAnaGVsbG8gd29ybGQnKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuY291bnQoJ2hlbGxvIHdvcmxkJywgJ2ZvbycpLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnY29udGFpbnNBbWJpZ3VvdXNDaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuQW1iaWd1b3VzQ2hhcmFjdGVycy5nZXRJbnN0YW5jZShuZXcgU2V0KCkpLmNvbnRhaW5zQW1iaWd1b3VzQ2hhcmFjdGVyKCdhYmNkJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5BbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldEluc3RhbmNlKG5ldyBTZXQoKSkuY29udGFpbnNBbWJpZ3VvdXNDaGFyYWN0ZXIoJ1x1MDBGQ1x1MDBFNScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuQW1iaWd1b3VzQ2hhcmFjdGVycy5nZXRJbnN0YW5jZShuZXcgU2V0KCkpLmNvbnRhaW5zQW1iaWd1b3VzQ2hhcmFjdGVyKCcoKiZeKScpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5BbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldEluc3RhbmNlKG5ldyBTZXQoKSkuY29udGFpbnNBbWJpZ3VvdXNDaGFyYWN0ZXIoJ1x1MDNCRicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5BbWJpZ3VvdXNDaGFyYWN0ZXJzLmdldEluc3RhbmNlKG5ldyBTZXQoKSkuY29udGFpbnNBbWJpZ3VvdXNDaGFyYWN0ZXIoJ2FiXHUwMjYxYycpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY29udGFpbnNJbnZpc2libGVDaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuSW52aXNpYmxlQ2hhcmFjdGVycy5jb250YWluc0ludmlzaWJsZUNoYXJhY3RlcignYWJjZCcpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuSW52aXNpYmxlQ2hhcmFjdGVycy5jb250YWluc0ludmlzaWJsZUNoYXJhY3RlcignICcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5JbnZpc2libGVDaGFyYWN0ZXJzLmNvbnRhaW5zSW52aXNpYmxlQ2hhcmFjdGVyKCdhXFx1e2UwMDRlfWInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuSW52aXNpYmxlQ2hhcmFjdGVycy5jb250YWluc0ludmlzaWJsZUNoYXJhY3RlcignYVxcdXtlMDE1YX1cXHUwMDBiYicpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlieXRlQXdhcmVCdG9hJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayhzdHJpbmdzLm11bHRpYnl0ZUF3YXJlQnRvYSgnaGVsbG8gd29ybGQnKS5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQub2soc3RyaW5ncy5tdWx0aWJ5dGVBd2FyZUJ0b2EoJ1x1NUU3M1x1NEVFRVx1NTQwRCcpLmxlbmd0aCA+IDApO1xuXHRcdGFzc2VydC5vayhzdHJpbmdzLm11bHRpYnl0ZUF3YXJlQnRvYShuZXcgQXJyYXkoMTAwMDAwKS5maWxsKCd2cycpLmpvaW4oJycpKS5sZW5ndGggPiAwKTsgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExMjAxM1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuXG50ZXN0KCdodG1sQXR0cmlidXRlRW5jb2RlVmFsdWUnLCAoKSA9PiB7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpbmdzLmh0bWxBdHRyaWJ1dGVFbmNvZGVWYWx1ZSgnJyksICcnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlKCdhYmMnKSwgJ2FiYycpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5odG1sQXR0cmlidXRlRW5jb2RlVmFsdWUoJzxzY3JpcHQ+YWxlcnQoXCJIZWxsb1wiKTwvc2NyaXB0PicpLCAnJmx0O3NjcmlwdCZndDthbGVydCgmcXVvdDtIZWxsbyZxdW90OykmbHQ7L3NjcmlwdCZndDsnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlKCdIZWxsbyAmIFdvcmxkJyksICdIZWxsbyAmYW1wOyBXb3JsZCcpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaW5ncy5odG1sQXR0cmlidXRlRW5jb2RlVmFsdWUoJ1wiSGVsbG9cIicpLCAnJnF1b3Q7SGVsbG8mcXVvdDsnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaHRtbEF0dHJpYnV0ZUVuY29kZVZhbHVlKCdcXCdIZWxsb1xcJycpLCAnJmFwb3M7SGVsbG8mYXBvczsnKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmluZ3MuaHRtbEF0dHJpYnV0ZUVuY29kZVZh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QUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FBQUEsUUFDTixHQUFHLEdBQUc7QUFBQSxRQUNOLEdBQUcsR0FBRztBQUFBLFFBQ04sR0FBRyxHQUFHO0FB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
