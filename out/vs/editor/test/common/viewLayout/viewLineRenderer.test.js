import assert from "assert";
import { CharCode } from "../../../../base/common/charCode.js";
import * as strings from "../../../../base/common/strings.js";
import { assertSnapshot } from "../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { LineDecoration } from "../../../common/viewLayout/lineDecorations.js";
import { DomPosition, RenderLineInput, renderViewLine2 as renderViewLine } from "../../../common/viewLayout/viewLineRenderer.js";
import { InlineDecorationType } from "../../../common/viewModel/inlineDecorations.js";
import { TestLineToken, TestLineTokens } from "../core/testLineToken.js";
const HTML_EXTENSION = { extension: "html" };
function createViewLineTokens(viewLineTokens) {
  return new TestLineTokens(viewLineTokens);
}
function createPart(endIndex, foreground) {
  return new TestLineToken(endIndex, foreground << MetadataConsts.FOREGROUND_OFFSET >>> 0);
}
function inflateRenderLineOutput(renderLineOutput) {
  let html = renderLineOutput.html;
  if (html.startsWith("<span>")) {
    html = html.replace(/^<span>/, "");
  }
  html = html.replace(/<\/span>$/, "");
  const spans = [];
  let lastIndex = 0;
  do {
    const newIndex = html.indexOf("<span", lastIndex + 1);
    if (newIndex === -1) {
      break;
    }
    spans.push(html.substring(lastIndex, newIndex));
    lastIndex = newIndex;
  } while (true);
  spans.push(html.substring(lastIndex));
  return {
    html: spans,
    mapping: renderLineOutput.characterMapping.inflate()
  };
}
const defaultRenderLineInputOptions = {
  useMonospaceOptimizations: false,
  canUseHalfwidthRightwardsArrow: true,
  lineContent: "",
  continuesWithWrappedLine: false,
  isBasicASCII: true,
  containsRTL: false,
  fauxIndentLength: 0,
  lineTokens: createViewLineTokens([]),
  lineDecorations: [],
  tabSize: 4,
  startVisibleColumn: 0,
  spaceWidth: 10,
  middotWidth: 10,
  wsmiddotWidth: 10,
  stopRenderingLineAfter: -1,
  renderWhitespace: "none",
  renderControlCharacters: false,
  fontLigatures: false,
  selectionsOnLine: null,
  textDirection: null,
  verticalScrollbarSize: 14,
  renderNewLineWhenEmpty: false
};
function createRenderLineInputOptions(opts) {
  return {
    ...defaultRenderLineInputOptions,
    ...opts
  };
}
function createRenderLineInput(opts) {
  const options = createRenderLineInputOptions(opts);
  return new RenderLineInput(
    options.useMonospaceOptimizations,
    options.canUseHalfwidthRightwardsArrow,
    options.lineContent,
    options.continuesWithWrappedLine,
    options.isBasicASCII,
    options.containsRTL,
    options.fauxIndentLength,
    options.lineTokens,
    options.lineDecorations,
    options.tabSize,
    options.startVisibleColumn,
    options.spaceWidth,
    options.middotWidth,
    options.wsmiddotWidth,
    options.stopRenderingLineAfter,
    options.renderWhitespace,
    options.renderControlCharacters,
    options.fontLigatures,
    options.selectionsOnLine,
    options.textDirection,
    options.verticalScrollbarSize,
    options.renderNewLineWhenEmpty
  );
}
suite("renderViewLine", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertCharacterReplacement(lineContent, tabSize, expected, expectedCharOffsetInPart) {
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: strings.isBasicASCII(lineContent),
      lineTokens: createViewLineTokens([new TestLineToken(lineContent.length, 0)]),
      tabSize,
      spaceWidth: 0,
      middotWidth: 0,
      wsmiddotWidth: 0
    }));
    assert.strictEqual(_actual.html, '<span><span class="mtk0">' + expected + "</span></span>");
    const info = expectedCharOffsetInPart.map((absoluteOffset) => [absoluteOffset, [0, absoluteOffset]]);
    assertCharacterMapping3(_actual.characterMapping, info);
  }
  test("replaces spaces", () => {
    assertCharacterReplacement(" ", 4, "\xA0", [0, 1]);
    assertCharacterReplacement("  ", 4, "\xA0\xA0", [0, 1, 2]);
    assertCharacterReplacement("a  b", 4, "a\xA0\xA0b", [0, 1, 2, 3, 4]);
  });
  test("escapes HTML markup", () => {
    assertCharacterReplacement("a<b", 4, "a&lt;b", [0, 1, 2, 3]);
    assertCharacterReplacement("a>b", 4, "a&gt;b", [0, 1, 2, 3]);
    assertCharacterReplacement("a&b", 4, "a&amp;b", [0, 1, 2, 3]);
  });
  test("replaces some bad characters", () => {
    assertCharacterReplacement("a\0b", 4, "a&#00;b", [0, 1, 2, 3]);
    assertCharacterReplacement("a" + String.fromCharCode(CharCode.UTF8_BOM) + "b", 4, "a\uFFFDb", [0, 1, 2, 3]);
    assertCharacterReplacement("a\u2028b", 4, "a\uFFFDb", [0, 1, 2, 3]);
  });
  test("handles tabs", () => {
    assertCharacterReplacement("	", 4, "\xA0\xA0\xA0\xA0", [0, 4]);
    assertCharacterReplacement("x	", 4, "x\xA0\xA0\xA0", [0, 1, 4]);
    assertCharacterReplacement("xx	", 4, "xx\xA0\xA0", [0, 1, 2, 4]);
    assertCharacterReplacement("xxx	", 4, "xxx\xA0", [0, 1, 2, 3, 4]);
    assertCharacterReplacement("xxxx	", 4, "xxxx\xA0\xA0\xA0\xA0", [0, 1, 2, 3, 4, 8]);
  });
  function assertParts(lineContent, tabSize, parts, expected, info) {
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens(parts),
      tabSize,
      spaceWidth: 0,
      middotWidth: 0,
      wsmiddotWidth: 0
    }));
    assert.strictEqual(_actual.html, "<span>" + expected + "</span>");
    assertCharacterMapping3(_actual.characterMapping, info);
  }
  test("empty line", () => {
    assertParts("", 4, [], "<span></span>", []);
  });
  test("uses part type", () => {
    assertParts("x", 4, [createPart(1, 10)], '<span class="mtk10">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
    assertParts("x", 4, [createPart(1, 20)], '<span class="mtk20">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
    assertParts("x", 4, [createPart(1, 30)], '<span class="mtk30">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
  });
  test("two parts", () => {
    assertParts("xy", 4, [createPart(1, 1), createPart(2, 2)], '<span class="mtk1">x</span><span class="mtk2">y</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]]]);
    assertParts("xyz", 4, [createPart(1, 1), createPart(3, 2)], '<span class="mtk1">x</span><span class="mtk2">yz</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]], [3, [1, 2]]]);
    assertParts("xyz", 4, [createPart(2, 1), createPart(3, 2)], '<span class="mtk1">xy</span><span class="mtk2">z</span>', [[0, [0, 0]], [1, [0, 1]], [2, [1, 0]], [3, [1, 1]]]);
  });
  test("overflow", async () => {
    const _actual = renderViewLine(createRenderLineInput({
      lineContent: "Hello world!",
      lineTokens: createViewLineTokens([
        createPart(1, 0),
        createPart(2, 1),
        createPart(3, 2),
        createPart(4, 3),
        createPart(5, 4),
        createPart(6, 5),
        createPart(7, 6),
        createPart(8, 7),
        createPart(9, 8),
        createPart(10, 9),
        createPart(11, 10),
        createPart(12, 11)
      ]),
      stopRenderingLineAfter: 6,
      renderWhitespace: "boundary"
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("typical", async () => {
    const lineContent = "	    export class Game { // http://test.com     ";
    const lineTokens = createViewLineTokens([
      createPart(5, 1),
      createPart(11, 2),
      createPart(12, 3),
      createPart(17, 4),
      createPart(18, 5),
      createPart(22, 6),
      createPart(23, 7),
      createPart(24, 8),
      createPart(25, 9),
      createPart(28, 10),
      createPart(43, 11),
      createPart(48, 12)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens,
      renderWhitespace: "boundary"
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-2255-1", async () => {
    const lineContent = "			cursorStyle:						(prevOpts.cursorStyle !== newOpts.cursorStyle),";
    const lineTokens = createViewLineTokens([
      createPart(3, 1),
      // 3 chars
      createPart(15, 2),
      // 12 chars
      createPart(21, 3),
      // 6 chars
      createPart(22, 4),
      // 1 char
      createPart(43, 5),
      // 21 chars
      createPart(45, 6),
      // 2 chars
      createPart(46, 7),
      // 1 char
      createPart(66, 8),
      // 20 chars
      createPart(67, 9),
      // 1 char
      createPart(68, 10)
      // 2 chars
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-2255-2", async () => {
    const lineContent = " 			cursorStyle:						(prevOpts.cursorStyle !== newOpts.cursorStyle),";
    const lineTokens = createViewLineTokens([
      createPart(4, 1),
      // 4 chars
      createPart(16, 2),
      // 12 chars
      createPart(22, 3),
      // 6 chars
      createPart(23, 4),
      // 1 char
      createPart(44, 5),
      // 21 chars
      createPart(46, 6),
      // 2 chars
      createPart(47, 7),
      // 1 char
      createPart(67, 8),
      // 20 chars
      createPart(68, 9),
      // 1 char
      createPart(69, 10)
      // 2 chars
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-91178", async () => {
    const lineContent = "//just a comment";
    const lineTokens = createViewLineTokens([
      createPart(16, 1)
    ]);
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      canUseHalfwidthRightwardsArrow: false,
      lineContent,
      lineTokens,
      lineDecorations: [
        new LineDecoration(13, 13, "dec1", InlineDecorationType.After),
        new LineDecoration(13, 13, "dec2", InlineDecorationType.Before)
      ]
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("monaco-280", async () => {
    const lineContent = `var \u05E7\u05D5\u05D3\u05DE\u05D5\u05EA = "\u05DE\u05D9\u05D5\u05EA\u05E8 \u05E7\u05D5\u05D3\u05DE\u05D5\u05EA \u05E6'\u05D8 \u05E9\u05DC, \u05D0\u05DD \u05DC\u05E9\u05D5\u05DF \u05D4\u05E2\u05D1\u05E8\u05D9\u05EA \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD \u05D5\u05D9\u05E9, \u05D0\u05DD";`;
    const lineTokens = createViewLineTokens([
      createPart(3, 6),
      createPart(13, 1),
      createPart(66, 20),
      createPart(67, 1)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-137036", async () => {
    const lineContent = '<option value="\u0627\u0644\u0639\u0631\u0628\u064A\u0629">\u0627\u0644\u0639\u0631\u0628\u064A\u0629</option>';
    const lineTokens = createViewLineTokens([
      createPart(1, 2),
      createPart(7, 3),
      createPart(8, 4),
      createPart(13, 5),
      createPart(14, 4),
      createPart(23, 6),
      createPart(24, 2),
      createPart(31, 4),
      createPart(33, 2),
      createPart(39, 3),
      createPart(40, 2)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-99589", async () => {
    const lineContent = '    ["\u{1F5A8}\uFE0F \u0686\u0627\u067E \u0641\u0627\u06A9\u062A\u0648\u0631","\u{1F3A8} \u062A\u0646\u0638\u06CC\u0645\u0627\u062A"]';
    const lineTokens = createViewLineTokens([
      createPart(5, 2),
      createPart(21, 3),
      createPart(22, 2),
      createPart(34, 3),
      createPart(35, 2)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens,
      renderWhitespace: "all"
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-260239", async () => {
    const lineContent = '<p class="myclass" title="\u0627\u0644\u0639\u0631\u0628\u064A">\u0646\u0634\u0627\u0637 \u0627\u0644\u062A\u062F\u0648\u064A\u0644!</p>';
    const lineTokens = createViewLineTokens([
      createPart(1, 1),
      // <
      createPart(2, 2),
      // p
      createPart(3, 3),
      // (space)
      createPart(8, 4),
      // class
      createPart(9, 5),
      // =
      createPart(10, 6),
      // "
      createPart(17, 7),
      // myclass
      createPart(18, 6),
      // "
      createPart(19, 3),
      // (space)
      createPart(24, 4),
      // title
      createPart(25, 5),
      // =
      createPart(26, 6),
      // "
      createPart(32, 8),
      // العربي (RTL text) - 6 Arabic characters from position 26-31
      createPart(33, 6),
      // " - closing quote at position 32
      createPart(34, 1),
      // >
      createPart(47, 9),
      // نشاط التدويل! (RTL text) - 13 characters from position 34-46
      createPart(48, 1),
      // <
      createPart(49, 2),
      // /
      createPart(50, 2),
      // p
      createPart(51, 1)
      // >
    ]);
    const _actual = renderViewLine(new RenderLineInput(
      false,
      true,
      lineContent,
      false,
      false,
      true,
      0,
      lineTokens,
      [],
      4,
      0,
      10,
      10,
      10,
      -1,
      "none",
      false,
      false,
      null,
      null,
      14
    ));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-274604", async () => {
    const lineContent = "test.com##a:-abp-contains(\u0625)";
    const lineTokens = createViewLineTokens([
      createPart(lineContent.length, 1)
    ]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-277693", async () => {
    const lineContent = "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631: ${user.firstName}";
    const lineTokens = createViewLineTokens([
      createPart(9, 1),
      // نام کاربر (RTL string content)
      createPart(11, 1),
      // : (space)
      createPart(13, 2),
      // ${ (template expression punctuation)
      createPart(17, 3),
      // user (variable)
      createPart(18, 4),
      // . (punctuation)
      createPart(27, 3),
      // firstName (property)
      createPart(28, 2)
      // } (template expression punctuation)
    ]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-6885", async () => {
    const _lineText = "This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.";
    function assertSplitsTokens(message, lineContent, expectedOutput) {
      const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
      const actual = renderViewLine(createRenderLineInput({
        lineContent,
        lineTokens
      }));
      assert.strictEqual(actual.html, "<span>" + expectedOutput.join("") + "</span>", message);
    }
    {
      assertSplitsTokens(
        "49 chars",
        _lineText.substr(0, 49),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0inter</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "50 chars",
        _lineText.substr(0, 50),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "51 chars",
        _lineText.substr(0, 51),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>',
          '<span class="mtk1">s</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "99 chars",
        _lineText.substr(0, 99),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>',
          '<span class="mtk1">sting\xA0text.\xA0This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contain</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "100 chars",
        _lineText.substr(0, 100),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>',
          '<span class="mtk1">sting\xA0text.\xA0This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "101 chars",
        _lineText.substr(0, 101),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>',
          '<span class="mtk1">sting\xA0text.\xA0This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains</span>',
          '<span class="mtk1">\xA0</span>'
        ]
      );
    }
  });
  test("issue-21476", async () => {
    const _lineText = "This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.";
    function assertSplitsTokens(message, lineContent, expectedOutput) {
      const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
      const actual = renderViewLine(createRenderLineInput({
        lineContent,
        lineTokens,
        fontLigatures: true
      }));
      assert.strictEqual(actual.html, "<span>" + expectedOutput.join("") + "</span>", message);
    }
    {
      assertSplitsTokens(
        "101 chars",
        _lineText.substr(0, 101),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0</span>',
          '<span class="mtk1">interesting\xA0text.\xA0This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0</span>',
          '<span class="mtk1">contains\xA0</span>'
        ]
      );
    }
  });
  test("issue-20624", async () => {
    const lineContent = "a\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}";
    const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      lineTokens
    }));
    await assertSnapshot(inflateRenderLineOutput(actual).html.join(""), HTML_EXTENSION);
  });
  test("issue-6885-rtl", async () => {
    const lineContent = "\u05D0\u05EA \u05D2\u05E8\u05DE\u05E0\u05D9\u05EA \u05D1\u05D4\u05EA\u05D9\u05D9\u05D7\u05E1\u05D5\u05EA \u05E9\u05DE\u05D5, \u05E9\u05E0\u05EA\u05D9 \u05D4\u05DE\u05E9\u05E4\u05D8 \u05D0\u05DC \u05D7\u05E4\u05E9, \u05D0\u05DD \u05DB\u05EA\u05D1 \u05D0\u05D7\u05E8\u05D9\u05DD \u05D5\u05DC\u05D7\u05D1\u05E8. \u05E9\u05DC \u05D4\u05EA\u05D5\u05DB\u05DF \u05D0\u05D5\u05D3\u05D5\u05EA \u05D1\u05D5\u05D9\u05E7\u05D9\u05E4\u05D3\u05D9\u05D4 \u05DB\u05DC\u05DC, \u05E9\u05DC \u05E2\u05D6\u05E8\u05D4 \u05DB\u05D9\u05DE\u05D9\u05D4 \u05D4\u05D9\u05D0. \u05E2\u05DC \u05E2\u05DE\u05D5\u05D3 \u05D9\u05D5\u05E6\u05E8\u05D9\u05DD \u05DE\u05D9\u05EA\u05D5\u05DC\u05D5\u05D2\u05D9\u05D4 \u05E1\u05D3\u05E8, \u05D0\u05DD \u05E9\u05DB\u05DC \u05E9\u05EA\u05E4\u05D5 \u05DC\u05E2\u05D1\u05E8\u05D9\u05EA \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD, \u05D0\u05DD \u05E9\u05D0\u05DC\u05D5\u05EA \u05D0\u05E0\u05D2\u05DC\u05D9\u05EA \u05E2\u05D6\u05D4. \u05E9\u05DE\u05D5\u05EA \u05D1\u05E7\u05DC\u05D5\u05EA \u05DE\u05D4 \u05E1\u05D3\u05E8.";
    const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    await assertSnapshot(actual.html, HTML_EXTENSION);
  });
  test("issue-95685", async () => {
    const lineContent = 'var ftext = [\u2029"Und", "dann", "eines"];';
    const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-19673", async () => {
    const lineContent = "    MongoCallback<string>): void {";
    const lineTokens = createViewLineTokens([
      createPart(17, 1),
      createPart(18, 2),
      createPart(24, 3),
      createPart(26, 4),
      createPart(27, 5),
      createPart(28, 6),
      createPart(32, 7),
      createPart(34, 8)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent,
      fauxIndentLength: 4,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
});
function assertCharacterMapping3(actual, expectedInfo) {
  for (let i = 0; i < expectedInfo.length; i++) {
    const [horizontalOffset, [partIndex, charIndex]] = expectedInfo[i];
    const actualDomPosition = actual.getDomPosition(i + 1);
    assert.deepStrictEqual(actualDomPosition, new DomPosition(partIndex, charIndex), `getDomPosition(${i + 1})`);
    let partLength = charIndex + 1;
    for (let j = i + 1; j < expectedInfo.length; j++) {
      const [, [nextPartIndex, nextCharIndex]] = expectedInfo[j];
      if (nextPartIndex === partIndex) {
        partLength = nextCharIndex + 1;
      } else {
        break;
      }
    }
    const actualColumn = actual.getColumn(new DomPosition(partIndex, charIndex), partLength);
    assert.strictEqual(actualColumn, i + 1, `actual.getColumn(${partIndex}, ${charIndex})`);
    const actualHorizontalOffset = actual.getHorizontalOffset(i + 1);
    assert.strictEqual(actualHorizontalOffset, horizontalOffset, `actual.getHorizontalOffset(${i + 1})`);
  }
  assert.strictEqual(actual.length, expectedInfo.length, `length mismatch`);
}
suite("renderViewLine2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testCreateLineParts(fontIsMonospace, lineContent, tokens, fauxIndentLength, renderWhitespace, selections) {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: fontIsMonospace,
      lineContent,
      fauxIndentLength,
      lineTokens: createViewLineTokens(tokens),
      renderWhitespace,
      selectionsOnLine: selections
    }));
    return inflateRenderLineOutput(actual);
  }
  test("issue-18616", async () => {
    const lineContent = "https://microsoft.com";
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens([createPart(21, 3)]),
      lineDecorations: [new LineDecoration(1, 22, "link", InlineDecorationType.Regular)]
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-19207", async () => {
    const lineContent = "'let url = `http://***/_api/web/lists/GetByTitle(\\'Teambuildingaanvragen\\')/items`;'";
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent,
      lineTokens: createViewLineTokens([
        createPart(49, 6),
        createPart(51, 4),
        createPart(72, 6),
        createPart(74, 4),
        createPart(84, 6)
      ]),
      lineDecorations: [
        new LineDecoration(13, 51, "detected-link", InlineDecorationType.Regular)
      ]
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("simple", async () => {
    const actual = testCreateLineParts(
      false,
      "Hello world!",
      [
        createPart(12, 1)
      ],
      0,
      "none",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("two-tokens", async () => {
    const actual = testCreateLineParts(
      false,
      "Hello world!",
      [
        createPart(6, 1),
        createPart(12, 2)
      ],
      0,
      "none",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-4-leading", async () => {
    const actual = testCreateLineParts(
      false,
      "    Hello world!    ",
      [
        createPart(4, 1),
        createPart(6, 2),
        createPart(20, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-8-leading", async () => {
    const actual = testCreateLineParts(
      false,
      "        Hello world!        ",
      [
        createPart(8, 1),
        createPart(10, 2),
        createPart(28, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-2-tabs", async () => {
    const actual = testCreateLineParts(
      false,
      "		Hello world!	",
      [
        createPart(2, 1),
        createPart(4, 2),
        createPart(15, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-mixed", async () => {
    const actual = testCreateLineParts(
      false,
      "  		  Hello world! 	  	   	    ",
      [
        createPart(6, 1),
        createPart(8, 2),
        createPart(31, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-faux-indent", async () => {
    const actual = testCreateLineParts(
      false,
      "		  Hello world! 	  	   	    ",
      [
        createPart(4, 1),
        createPart(6, 2),
        createPart(29, 3)
      ],
      2,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-monospace", async () => {
    const actual = testCreateLineParts(
      true,
      "		  Hello world! 	  	   	    ",
      [
        createPart(4, 1),
        createPart(6, 2),
        createPart(29, 3)
      ],
      2,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-middle", async () => {
    const actual = testCreateLineParts(
      false,
      "it  it it  it",
      [
        createPart(6, 1),
        createPart(7, 2),
        createPart(13, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-all-middle", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "all",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-none", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-whole", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      [new OffsetRange(0, 14)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-partial", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      [new OffsetRange(0, 5)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-multiple", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      [new OffsetRange(0, 5), new OffsetRange(9, 14)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-unsorted", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      [new OffsetRange(9, 14), new OffsetRange(0, 5)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-adjacent", async () => {
    const actual = testCreateLineParts(
      false,
      " * S",
      [
        createPart(4, 0)
      ],
      0,
      "selection",
      [new OffsetRange(0, 1), new OffsetRange(1, 2), new OffsetRange(2, 3)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-trail-no-trail", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "trailing",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-trail-with-trail", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world! 	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(15, 2)
      ],
      0,
      "trailing",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-trail-8-8", async () => {
    const actual = testCreateLineParts(
      false,
      "        Hello world!        ",
      [
        createPart(8, 1),
        createPart(10, 2),
        createPart(28, 3)
      ],
      0,
      "trailing",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-trail-only", async () => {
    const actual = testCreateLineParts(
      false,
      " 	 ",
      [
        createPart(2, 0),
        createPart(3, 1)
      ],
      0,
      "trailing",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("unsorted-deco", async () => {
    const actual = renderViewLine(createRenderLineInput({
      lineContent: "Hello world",
      lineTokens: createViewLineTokens([createPart(11, 0)]),
      lineDecorations: [
        new LineDecoration(5, 7, "a", InlineDecorationType.Regular),
        new LineDecoration(1, 3, "b", InlineDecorationType.Regular),
        new LineDecoration(2, 8, "c", InlineDecorationType.Regular)
      ]
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-11485", async () => {
    const lineContent = "	bla";
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens([createPart(4, 3)]),
      lineDecorations: [new LineDecoration(1, 2, "before", InlineDecorationType.Before)],
      renderWhitespace: "all",
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-32436", async () => {
    const lineContent = "	bla";
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens([createPart(4, 3)]),
      lineDecorations: [new LineDecoration(2, 3, "before", InlineDecorationType.Before)],
      renderWhitespace: "all",
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-30133", async () => {
    const lineContent = "";
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens([createPart(0, 3)]),
      lineDecorations: [new LineDecoration(1, 2, "before", InlineDecorationType.Before)],
      renderWhitespace: "all",
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-37208", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "  1. \u{1F64F}",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(7, 3)]),
      lineDecorations: [new LineDecoration(7, 8, "inline-folded", InlineDecorationType.After)],
      tabSize: 2,
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-37401", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "",
      lineTokens: createViewLineTokens([createPart(0, 3)]),
      lineDecorations: [
        new LineDecoration(1, 1, "before", InlineDecorationType.Before),
        new LineDecoration(1, 1, "after", InlineDecorationType.After)
      ],
      tabSize: 2,
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-118759", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "",
      lineTokens: createViewLineTokens([createPart(0, 3)]),
      lineDecorations: [
        new LineDecoration(1, 1, "after1", InlineDecorationType.After),
        new LineDecoration(1, 1, "after2", InlineDecorationType.After),
        new LineDecoration(1, 1, "before1", InlineDecorationType.Before),
        new LineDecoration(1, 1, "before2", InlineDecorationType.Before)
      ],
      tabSize: 2,
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-38935", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "	}",
      lineTokens: createViewLineTokens([createPart(2, 3)]),
      lineDecorations: [
        new LineDecoration(3, 3, "ced-TextEditorDecorationType2-5e9b9b3f-3 ced-TextEditorDecorationType2-3", InlineDecorationType.Before),
        new LineDecoration(3, 3, "ced-TextEditorDecorationType2-5e9b9b3f-4 ced-TextEditorDecorationType2-4", InlineDecorationType.After)
      ],
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-136622", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "some text \xA3",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(11, 3)]),
      lineDecorations: [
        new LineDecoration(5, 5, "inlineDec1", InlineDecorationType.After),
        new LineDecoration(6, 6, "inlineDec2", InlineDecorationType.Before)
      ],
      stopRenderingLineAfter: 1e4,
      renderControlCharacters: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-22832-1", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: 'asd = "\u64E6"		#asd',
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(15, 3)]),
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-22832-2", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: 'asd = "\u64E6"		#asd',
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(15, 3)]),
      stopRenderingLineAfter: 1e4,
      renderWhitespace: "all"
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-22352-1", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "12345689012345678901234568901234567890123456890aba\u0301ba",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(53, 3)]),
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-22352-2", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: " JoyShare\u0BB2\u0BCD \u0BAA\u0BBF\u0BA9\u0BCD\u0BA4\u0BCA\u0B9F\u0BB0\u0BCD\u0BA8\u0BCD\u0BA4\u0BC1, \u0BB5\u0BBF\u0B9F\u0BC0\u0BAF\u0BCB, \u0B9C\u0BCB\u0B95\u0BCD\u0B95\u0BC1\u0B95\u0BB3\u0BCD, \u0B85\u0BA9\u0BBF\u0BAE\u0BC7\u0B9A\u0BA9\u0BCD, \u0BA8\u0B95\u0BC8\u0B9A\u0BCD\u0B9A\u0BC1\u0BB5\u0BC8 \u0BAA\u0B9F\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BBF\u0B95\u0BB3\u0BC8 \u0BAA\u0BC6\u0BB1\u0BC1\u0BB5\u0BC0\u0BB0\u0BCD",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(100, 3)]),
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-42700", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: " \u0935\u094B \u0910\u0938\u093E \u0915\u094D\u092F\u093E \u0939\u0948 \u091C\u094B \u0939\u092E\u093E\u0930\u0947 \u0905\u0902\u0926\u0930 \u092D\u0940 \u0939\u0948 \u0914\u0930 \u092C\u093E\u0939\u0930 \u092D\u0940 \u0939\u0948\u0964 \u091C\u093F\u0938\u0915\u0940 \u0935\u091C\u0939 \u0938\u0947 \u0939\u092E \u0938\u092C \u0939\u0948\u0902\u0964 \u091C\u093F\u0938\u0928\u0947 \u0907\u0938 \u0938\u0943\u0937\u094D\u091F\u093F \u0915\u0940 \u0930\u091A\u0928\u093E \u0915\u0940 \u0939\u0948\u0964",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(105, 3)]),
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-38123", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "This is a long line which never uses more than two spaces. ",
      continuesWithWrappedLine: true,
      lineTokens: createViewLineTokens([createPart(59, 3)]),
      stopRenderingLineAfter: 1e4,
      renderWhitespace: "boundary"
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-33525-1", async () => {
    const actual = renderViewLine(createRenderLineInput({
      canUseHalfwidthRightwardsArrow: false,
      lineContent: "append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to",
      lineTokens: createViewLineTokens([createPart(194, 3)]),
      stopRenderingLineAfter: 1e4,
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-33525-2", async () => {
    const actual = renderViewLine(createRenderLineInput({
      canUseHalfwidthRightwardsArrow: false,
      lineContent: "appenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatato",
      lineTokens: createViewLineTokens([createPart(194, 3)]),
      stopRenderingLineAfter: 1e4,
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-91936", async () => {
    const actual = renderViewLine(createRenderLineInput({
      lineContent: "                    else if ($s = 08) then '\\b'",
      lineTokens: createViewLineTokens([
        createPart(20, 1),
        createPart(24, 15),
        createPart(25, 1),
        createPart(27, 15),
        createPart(28, 1),
        createPart(29, 1),
        createPart(29, 1),
        createPart(31, 16),
        createPart(32, 1),
        createPart(33, 1),
        createPart(34, 1),
        createPart(36, 6),
        createPart(36, 1),
        createPart(37, 1),
        createPart(38, 1),
        createPart(42, 15),
        createPart(43, 1),
        createPart(47, 11)
      ]),
      stopRenderingLineAfter: 1e4,
      renderWhitespace: "selection",
      selectionsOnLine: [new OffsetRange(0, 47)],
      middotWidth: 11,
      wsmiddotWidth: 11
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-119416", async () => {
    const actual = renderViewLine(createRenderLineInput({
      canUseHalfwidthRightwardsArrow: false,
      lineContent: "[" + String.fromCharCode(127) + "] [" + String.fromCharCode(0) + "]",
      lineTokens: createViewLineTokens([createPart(7, 3)]),
      stopRenderingLineAfter: 1e4,
      renderControlCharacters: true,
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-116939", async () => {
    const actual = renderViewLine(createRenderLineInput({
      canUseHalfwidthRightwardsArrow: false,
      lineContent: `transferBalance(5678,${String.fromCharCode(8238)}6776,4321${String.fromCharCode(8236)},"USD");`,
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(42, 3)]),
      stopRenderingLineAfter: 1e4,
      renderControlCharacters: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-124038", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      canUseHalfwidthRightwardsArrow: false,
      lineContent: "    if",
      lineTokens: createViewLineTokens([createPart(4, 1), createPart(6, 2)]),
      lineDecorations: [
        new LineDecoration(7, 7, "ced-1-TextEditorDecorationType2-17c14d98-3 ced-1-TextEditorDecorationType2-3", InlineDecorationType.Before),
        new LineDecoration(7, 7, "ced-1-TextEditorDecorationType2-17c14d98-4 ced-1-TextEditorDecorationType2-4", InlineDecorationType.After),
        new LineDecoration(7, 7, "ced-ghost-text-1-4", InlineDecorationType.After)
      ],
      stopRenderingLineAfter: 1e4,
      renderWhitespace: "all"
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  function createTestGetColumnOfLinePartOffset(lineContent, tabSize, parts, expectedPartLengths) {
    const renderLineOutput = renderViewLine(createRenderLineInput({
      lineContent,
      tabSize,
      lineTokens: createViewLineTokens(parts)
    }));
    return (partIndex, partLength, offset, expected) => {
      const actualColumn = renderLineOutput.characterMapping.getColumn(new DomPosition(partIndex, offset), partLength);
      assert.strictEqual(actualColumn, expected, "getColumn for " + partIndex + ", " + offset);
    };
  }
  test("getColumnOfLinePartOffset 1 - simple text", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "hello world",
      4,
      [
        createPart(11, 1)
      ],
      [11]
    );
    testGetColumnOfLinePartOffset(0, 11, 0, 1);
    testGetColumnOfLinePartOffset(0, 11, 1, 2);
    testGetColumnOfLinePartOffset(0, 11, 2, 3);
    testGetColumnOfLinePartOffset(0, 11, 3, 4);
    testGetColumnOfLinePartOffset(0, 11, 4, 5);
    testGetColumnOfLinePartOffset(0, 11, 5, 6);
    testGetColumnOfLinePartOffset(0, 11, 6, 7);
    testGetColumnOfLinePartOffset(0, 11, 7, 8);
    testGetColumnOfLinePartOffset(0, 11, 8, 9);
    testGetColumnOfLinePartOffset(0, 11, 9, 10);
    testGetColumnOfLinePartOffset(0, 11, 10, 11);
    testGetColumnOfLinePartOffset(0, 11, 11, 12);
  });
  test("getColumnOfLinePartOffset 2 - regular JS", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "var x = 3;",
      4,
      [
        createPart(3, 1),
        createPart(4, 2),
        createPart(5, 3),
        createPart(8, 4),
        createPart(9, 5),
        createPart(10, 6)
      ],
      [3, 1, 1, 3, 1, 1]
    );
    testGetColumnOfLinePartOffset(0, 3, 0, 1);
    testGetColumnOfLinePartOffset(0, 3, 1, 2);
    testGetColumnOfLinePartOffset(0, 3, 2, 3);
    testGetColumnOfLinePartOffset(0, 3, 3, 4);
    testGetColumnOfLinePartOffset(1, 1, 0, 4);
    testGetColumnOfLinePartOffset(1, 1, 1, 5);
    testGetColumnOfLinePartOffset(2, 1, 0, 5);
    testGetColumnOfLinePartOffset(2, 1, 1, 6);
    testGetColumnOfLinePartOffset(3, 3, 0, 6);
    testGetColumnOfLinePartOffset(3, 3, 1, 7);
    testGetColumnOfLinePartOffset(3, 3, 2, 8);
    testGetColumnOfLinePartOffset(3, 3, 3, 9);
    testGetColumnOfLinePartOffset(4, 1, 0, 9);
    testGetColumnOfLinePartOffset(4, 1, 1, 10);
    testGetColumnOfLinePartOffset(5, 1, 0, 10);
    testGetColumnOfLinePartOffset(5, 1, 1, 11);
  });
  test("getColumnOfLinePartOffset 3 - tab with tab size 6", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "	",
      6,
      [
        createPart(1, 1)
      ],
      [6]
    );
    testGetColumnOfLinePartOffset(0, 6, 0, 1);
    testGetColumnOfLinePartOffset(0, 6, 1, 1);
    testGetColumnOfLinePartOffset(0, 6, 2, 1);
    testGetColumnOfLinePartOffset(0, 6, 3, 1);
    testGetColumnOfLinePartOffset(0, 6, 4, 2);
    testGetColumnOfLinePartOffset(0, 6, 5, 2);
    testGetColumnOfLinePartOffset(0, 6, 6, 2);
  });
  test("getColumnOfLinePartOffset 4 - once indented line, tab size 4", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "	function",
      4,
      [
        createPart(1, 1),
        createPart(9, 2)
      ],
      [4, 8]
    );
    testGetColumnOfLinePartOffset(0, 4, 0, 1);
    testGetColumnOfLinePartOffset(0, 4, 1, 1);
    testGetColumnOfLinePartOffset(0, 4, 2, 1);
    testGetColumnOfLinePartOffset(0, 4, 3, 2);
    testGetColumnOfLinePartOffset(0, 4, 4, 2);
    testGetColumnOfLinePartOffset(1, 8, 0, 2);
    testGetColumnOfLinePartOffset(1, 8, 1, 3);
    testGetColumnOfLinePartOffset(1, 8, 2, 4);
    testGetColumnOfLinePartOffset(1, 8, 3, 5);
    testGetColumnOfLinePartOffset(1, 8, 4, 6);
    testGetColumnOfLinePartOffset(1, 8, 5, 7);
    testGetColumnOfLinePartOffset(1, 8, 6, 8);
    testGetColumnOfLinePartOffset(1, 8, 7, 9);
    testGetColumnOfLinePartOffset(1, 8, 8, 10);
  });
  test("getColumnOfLinePartOffset 5 - twice indented line, tab size 4", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "		function",
      4,
      [
        createPart(2, 1),
        createPart(10, 2)
      ],
      [8, 8]
    );
    testGetColumnOfLinePartOffset(0, 8, 0, 1);
    testGetColumnOfLinePartOffset(0, 8, 1, 1);
    testGetColumnOfLinePartOffset(0, 8, 2, 1);
    testGetColumnOfLinePartOffset(0, 8, 3, 2);
    testGetColumnOfLinePartOffset(0, 8, 4, 2);
    testGetColumnOfLinePartOffset(0, 8, 5, 2);
    testGetColumnOfLinePartOffset(0, 8, 6, 2);
    testGetColumnOfLinePartOffset(0, 8, 7, 3);
    testGetColumnOfLinePartOffset(0, 8, 8, 3);
    testGetColumnOfLinePartOffset(1, 8, 0, 3);
    testGetColumnOfLinePartOffset(1, 8, 1, 4);
    testGetColumnOfLinePartOffset(1, 8, 2, 5);
    testGetColumnOfLinePartOffset(1, 8, 3, 6);
    testGetColumnOfLinePartOffset(1, 8, 4, 7);
    testGetColumnOfLinePartOffset(1, 8, 5, 8);
    testGetColumnOfLinePartOffset(1, 8, 6, 9);
    testGetColumnOfLinePartOffset(1, 8, 7, 10);
    testGetColumnOfLinePartOffset(1, 8, 8, 11);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lUmVuZGVyZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGFzc2VydFNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9zbmFwc2hvdC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IE1ldGFkYXRhQ29uc3RzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdMaW5lVG9rZW5zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IExpbmVEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvbGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IENoYXJhY3Rlck1hcHBpbmcsIERvbVBvc2l0aW9uLCBJUmVuZGVyTGluZUlucHV0T3B0aW9ucywgUmVuZGVyTGluZUlucHV0LCBSZW5kZXJMaW5lT3V0cHV0MiwgcmVuZGVyVmlld0xpbmUyIGFzIHJlbmRlclZpZXdMaW5lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvdmlld0xpbmVSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgVGVzdExpbmVUb2tlbiwgVGVzdExpbmVUb2tlbnMgfSBmcm9tICcuLi9jb3JlL3Rlc3RMaW5lVG9rZW4uanMnO1xuXG5jb25zdCBIVE1MX0VYVEVOU0lPTiA9IHsgZXh0ZW5zaW9uOiAnaHRtbCcgfTtcblxuZnVuY3Rpb24gY3JlYXRlVmlld0xpbmVUb2tlbnModmlld0xpbmVUb2tlbnM6IFRlc3RMaW5lVG9rZW5bXSk6IElWaWV3TGluZVRva2VucyB7XG5cdHJldHVybiBuZXcgVGVzdExpbmVUb2tlbnModmlld0xpbmVUb2tlbnMpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQYXJ0KGVuZEluZGV4OiBudW1iZXIsIGZvcmVncm91bmQ6IG51bWJlcik6IFRlc3RMaW5lVG9rZW4ge1xuXHRyZXR1cm4gbmV3IFRlc3RMaW5lVG9rZW4oZW5kSW5kZXgsIChcblx0XHRmb3JlZ3JvdW5kIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUXG5cdCkgPj4+IDApO1xufVxuXG5mdW5jdGlvbiBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChyZW5kZXJMaW5lT3V0cHV0OiBSZW5kZXJMaW5lT3V0cHV0Mikge1xuXHQvLyByZW1vdmUgZW5jb21wYXNzaW5nIDxzcGFuPiB0byBzaW1wbGlmeSB0ZXN0IHdyaXRpbmcuXG5cdGxldCBodG1sID0gcmVuZGVyTGluZU91dHB1dC5odG1sO1xuXHRpZiAoaHRtbC5zdGFydHNXaXRoKCc8c3Bhbj4nKSkge1xuXHRcdGh0bWwgPSBodG1sLnJlcGxhY2UoL148c3Bhbj4vLCAnJyk7XG5cdH1cblx0aHRtbCA9IGh0bWwucmVwbGFjZSgvPFxcL3NwYW4+JC8sICcnKTtcblx0Y29uc3Qgc3BhbnM6IHN0cmluZ1tdID0gW107XG5cdGxldCBsYXN0SW5kZXggPSAwO1xuXHRkbyB7XG5cdFx0Y29uc3QgbmV3SW5kZXggPSBodG1sLmluZGV4T2YoJzxzcGFuJywgbGFzdEluZGV4ICsgMSk7XG5cdFx0aWYgKG5ld0luZGV4ID09PSAtMSkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHNwYW5zLnB1c2goaHRtbC5zdWJzdHJpbmcobGFzdEluZGV4LCBuZXdJbmRleCkpO1xuXHRcdGxhc3RJbmRleCA9IG5ld0luZGV4O1xuXHR9IHdoaWxlICh0cnVlKTtcblx0c3BhbnMucHVzaChodG1sLnN1YnN0cmluZyhsYXN0SW5kZXgpKTtcblxuXHRyZXR1cm4ge1xuXHRcdGh0bWw6IHNwYW5zLFxuXHRcdG1hcHBpbmc6IHJlbmRlckxpbmVPdXRwdXQuY2hhcmFjdGVyTWFwcGluZy5pbmZsYXRlKCksXG5cdH07XG59XG5cbnR5cGUgSVJlbGF4ZWRSZW5kZXJMaW5lSW5wdXRPcHRpb25zID0gUGFydGlhbDxJUmVuZGVyTGluZUlucHV0T3B0aW9ucz47XG5cbmNvbnN0IGRlZmF1bHRSZW5kZXJMaW5lSW5wdXRPcHRpb25zOiBJUmVuZGVyTGluZUlucHV0T3B0aW9ucyA9IHtcblx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogZmFsc2UsXG5cdGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdzogdHJ1ZSxcblx0bGluZUNvbnRlbnQ6ICcnLFxuXHRjb250aW51ZXNXaXRoV3JhcHBlZExpbmU6IGZhbHNlLFxuXHRpc0Jhc2ljQVNDSUk6IHRydWUsXG5cdGNvbnRhaW5zUlRMOiBmYWxzZSxcblx0ZmF1eEluZGVudExlbmd0aDogMCxcblx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW10pLFxuXHRsaW5lRGVjb3JhdGlvbnM6IFtdLFxuXHR0YWJTaXplOiA0LFxuXHRzdGFydFZpc2libGVDb2x1bW46IDAsXG5cdHNwYWNlV2lkdGg6IDEwLFxuXHRtaWRkb3RXaWR0aDogMTAsXG5cdHdzbWlkZG90V2lkdGg6IDEwLFxuXHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAtMSxcblx0cmVuZGVyV2hpdGVzcGFjZTogJ25vbmUnLFxuXHRyZW5kZXJDb250cm9sQ2hhcmFjdGVyczogZmFsc2UsXG5cdGZvbnRMaWdhdHVyZXM6IGZhbHNlLFxuXHRzZWxlY3Rpb25zT25MaW5lOiBudWxsLFxuXHR0ZXh0RGlyZWN0aW9uOiBudWxsLFxuXHR2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IDE0LFxuXHRyZW5kZXJOZXdMaW5lV2hlbkVtcHR5OiBmYWxzZVxufTtcblxuZnVuY3Rpb24gY3JlYXRlUmVuZGVyTGluZUlucHV0T3B0aW9ucyhvcHRzOiBJUmVsYXhlZFJlbmRlckxpbmVJbnB1dE9wdGlvbnMpOiBJUmVuZGVyTGluZUlucHV0T3B0aW9ucyB7XG5cdHJldHVybiB7XG5cdFx0Li4uZGVmYXVsdFJlbmRlckxpbmVJbnB1dE9wdGlvbnMsXG5cdFx0Li4ub3B0c1xuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVSZW5kZXJMaW5lSW5wdXQob3B0czogSVJlbGF4ZWRSZW5kZXJMaW5lSW5wdXRPcHRpb25zKTogUmVuZGVyTGluZUlucHV0IHtcblx0Y29uc3Qgb3B0aW9ucyA9IGNyZWF0ZVJlbmRlckxpbmVJbnB1dE9wdGlvbnMob3B0cyk7XG5cdHJldHVybiBuZXcgUmVuZGVyTGluZUlucHV0KFxuXHRcdG9wdGlvbnMudXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucyxcblx0XHRvcHRpb25zLmNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdyxcblx0XHRvcHRpb25zLmxpbmVDb250ZW50LFxuXHRcdG9wdGlvbnMuY29udGludWVzV2l0aFdyYXBwZWRMaW5lLFxuXHRcdG9wdGlvbnMuaXNCYXNpY0FTQ0lJLFxuXHRcdG9wdGlvbnMuY29udGFpbnNSVEwsXG5cdFx0b3B0aW9ucy5mYXV4SW5kZW50TGVuZ3RoLFxuXHRcdG9wdGlvbnMubGluZVRva2Vucyxcblx0XHRvcHRpb25zLmxpbmVEZWNvcmF0aW9ucyxcblx0XHRvcHRpb25zLnRhYlNpemUsXG5cdFx0b3B0aW9ucy5zdGFydFZpc2libGVDb2x1bW4sXG5cdFx0b3B0aW9ucy5zcGFjZVdpZHRoLFxuXHRcdG9wdGlvbnMubWlkZG90V2lkdGgsXG5cdFx0b3B0aW9ucy53c21pZGRvdFdpZHRoLFxuXHRcdG9wdGlvbnMuc3RvcFJlbmRlcmluZ0xpbmVBZnRlcixcblx0XHRvcHRpb25zLnJlbmRlcldoaXRlc3BhY2UsXG5cdFx0b3B0aW9ucy5yZW5kZXJDb250cm9sQ2hhcmFjdGVycyxcblx0XHRvcHRpb25zLmZvbnRMaWdhdHVyZXMsXG5cdFx0b3B0aW9ucy5zZWxlY3Rpb25zT25MaW5lLFxuXHRcdG9wdGlvbnMudGV4dERpcmVjdGlvbixcblx0XHRvcHRpb25zLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSxcblx0XHRvcHRpb25zLnJlbmRlck5ld0xpbmVXaGVuRW1wdHlcblx0KTtcbn1cblxuc3VpdGUoJ3JlbmRlclZpZXdMaW5lJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KGxpbmVDb250ZW50OiBzdHJpbmcsIHRhYlNpemU6IG51bWJlciwgZXhwZWN0ZWQ6IHN0cmluZywgZXhwZWN0ZWRDaGFyT2Zmc2V0SW5QYXJ0OiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdGNvbnN0IF9hY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IHN0cmluZ3MuaXNCYXNpY0FTQ0lJKGxpbmVDb250ZW50KSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtuZXcgVGVzdExpbmVUb2tlbihsaW5lQ29udGVudC5sZW5ndGgsIDApXSksXG5cdFx0XHR0YWJTaXplLFxuXHRcdFx0c3BhY2VXaWR0aDogMCxcblx0XHRcdG1pZGRvdFdpZHRoOiAwLFxuXHRcdFx0d3NtaWRkb3RXaWR0aDogMFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChfYWN0dWFsLmh0bWwsICc8c3Bhbj48c3BhbiBjbGFzcz1cIm10azBcIj4nICsgZXhwZWN0ZWQgKyAnPC9zcGFuPjwvc3Bhbj4nKTtcblx0XHRjb25zdCBpbmZvID0gZXhwZWN0ZWRDaGFyT2Zmc2V0SW5QYXJ0Lm1hcDxDaGFyYWN0ZXJNYXBwaW5nSW5mbz4oKGFic29sdXRlT2Zmc2V0KSA9PiBbYWJzb2x1dGVPZmZzZXQsIFswLCBhYnNvbHV0ZU9mZnNldF1dKTtcblx0XHRhc3NlcnRDaGFyYWN0ZXJNYXBwaW5nMyhfYWN0dWFsLmNoYXJhY3Rlck1hcHBpbmcsIGluZm8pO1xuXHR9XG5cblx0dGVzdCgncmVwbGFjZXMgc3BhY2VzJywgKCkgPT4ge1xuXHRcdGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KCcgJywgNCwgJ1xcdTAwYTAnLCBbMCwgMV0pO1xuXHRcdGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KCcgICcsIDQsICdcXHUwMGEwXFx1MDBhMCcsIFswLCAxLCAyXSk7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQoJ2EgIGInLCA0LCAnYVxcdTAwYTBcXHUwMGEwYicsIFswLCAxLCAyLCAzLCA0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZXMgSFRNTCBtYXJrdXAnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQoJ2E8YicsIDQsICdhJmx0O2InLCBbMCwgMSwgMiwgM10pO1xuXHRcdGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KCdhPmInLCA0LCAnYSZndDtiJywgWzAsIDEsIDIsIDNdKTtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgnYSZiJywgNCwgJ2EmYW1wO2InLCBbMCwgMSwgMiwgM10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlcyBzb21lIGJhZCBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KCdhXFwwYicsIDQsICdhJiMwMDtiJywgWzAsIDEsIDIsIDNdKTtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgnYScgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKENoYXJDb2RlLlVURjhfQk9NKSArICdiJywgNCwgJ2FcXHVmZmZkYicsIFswLCAxLCAyLCAzXSk7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQoJ2FcXHUyMDI4YicsIDQsICdhXFx1ZmZmZGInLCBbMCwgMSwgMiwgM10pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIHRhYnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQoJ1xcdCcsIDQsICdcXHUwMGEwXFx1MDBhMFxcdTAwYTBcXHUwMGEwJywgWzAsIDRdKTtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgneFxcdCcsIDQsICd4XFx1MDBhMFxcdTAwYTBcXHUwMGEwJywgWzAsIDEsIDRdKTtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgneHhcXHQnLCA0LCAneHhcXHUwMGEwXFx1MDBhMCcsIFswLCAxLCAyLCA0XSk7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQoJ3h4eFxcdCcsIDQsICd4eHhcXHUwMGEwJywgWzAsIDEsIDIsIDMsIDRdKTtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgneHh4eFxcdCcsIDQsICd4eHh4XFx1MDBhMFxcdTAwYTBcXHUwMGEwXFx1MDBhMCcsIFswLCAxLCAyLCAzLCA0LCA4XSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFzc2VydFBhcnRzKGxpbmVDb250ZW50OiBzdHJpbmcsIHRhYlNpemU6IG51bWJlciwgcGFydHM6IFRlc3RMaW5lVG9rZW5bXSwgZXhwZWN0ZWQ6IHN0cmluZywgaW5mbzogQ2hhcmFjdGVyTWFwcGluZ0luZm9bXSk6IHZvaWQge1xuXHRcdGNvbnN0IF9hY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhwYXJ0cyksXG5cdFx0XHR0YWJTaXplLFxuXHRcdFx0c3BhY2VXaWR0aDogMCxcblx0XHRcdG1pZGRvdFdpZHRoOiAwLFxuXHRcdFx0d3NtaWRkb3RXaWR0aDogMFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChfYWN0dWFsLmh0bWwsICc8c3Bhbj4nICsgZXhwZWN0ZWQgKyAnPC9zcGFuPicpO1xuXHRcdGFzc2VydENoYXJhY3Rlck1hcHBpbmczKF9hY3R1YWwuY2hhcmFjdGVyTWFwcGluZywgaW5mbyk7XG5cdH1cblxuXHR0ZXN0KCdlbXB0eSBsaW5lJywgKCkgPT4ge1xuXHRcdGFzc2VydFBhcnRzKCcnLCA0LCBbXSwgJzxzcGFuPjwvc3Bhbj4nLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgcGFydCB0eXBlJywgKCkgPT4ge1xuXHRcdGFzc2VydFBhcnRzKCd4JywgNCwgW2NyZWF0ZVBhcnQoMSwgMTApXSwgJzxzcGFuIGNsYXNzPVwibXRrMTBcIj54PC9zcGFuPicsIFtbMCwgWzAsIDBdXSwgWzEsIFswLCAxXV1dKTtcblx0XHRhc3NlcnRQYXJ0cygneCcsIDQsIFtjcmVhdGVQYXJ0KDEsIDIwKV0sICc8c3BhbiBjbGFzcz1cIm10azIwXCI+eDwvc3Bhbj4nLCBbWzAsIFswLCAwXV0sIFsxLCBbMCwgMV1dXSk7XG5cdFx0YXNzZXJ0UGFydHMoJ3gnLCA0LCBbY3JlYXRlUGFydCgxLCAzMCldLCAnPHNwYW4gY2xhc3M9XCJtdGszMFwiPng8L3NwYW4+JywgW1swLCBbMCwgMF1dLCBbMSwgWzAsIDFdXV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gcGFydHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UGFydHMoJ3h5JywgNCwgW2NyZWF0ZVBhcnQoMSwgMSksIGNyZWF0ZVBhcnQoMiwgMildLCAnPHNwYW4gY2xhc3M9XCJtdGsxXCI+eDwvc3Bhbj48c3BhbiBjbGFzcz1cIm10azJcIj55PC9zcGFuPicsIFtbMCwgWzAsIDBdXSwgWzEsIFsxLCAwXV0sIFsyLCBbMSwgMV1dXSk7XG5cdFx0YXNzZXJ0UGFydHMoJ3h5eicsIDQsIFtjcmVhdGVQYXJ0KDEsIDEpLCBjcmVhdGVQYXJ0KDMsIDIpXSwgJzxzcGFuIGNsYXNzPVwibXRrMVwiPng8L3NwYW4+PHNwYW4gY2xhc3M9XCJtdGsyXCI+eXo8L3NwYW4+JywgW1swLCBbMCwgMF1dLCBbMSwgWzEsIDBdXSwgWzIsIFsxLCAxXV0sIFszLCBbMSwgMl1dXSk7XG5cdFx0YXNzZXJ0UGFydHMoJ3h5eicsIDQsIFtjcmVhdGVQYXJ0KDIsIDEpLCBjcmVhdGVQYXJ0KDMsIDIpXSwgJzxzcGFuIGNsYXNzPVwibXRrMVwiPnh5PC9zcGFuPjxzcGFuIGNsYXNzPVwibXRrMlwiPno8L3NwYW4+JywgW1swLCBbMCwgMF1dLCBbMSwgWzAsIDFdXSwgWzIsIFsxLCAwXV0sIFszLCBbMSwgMV1dXSk7XG5cdH0pO1xuXG5cdC8vIG92ZXJmbG93XG5cdHRlc3QoJ292ZXJmbG93JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IF9hY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQ6ICdIZWxsbyB3b3JsZCEnLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDEsIDApLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDIsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDMsIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDMpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDUsIDQpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDUpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDcsIDYpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDgsIDcpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDksIDgpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDEwLCA5KSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxMSwgMTApLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDEyLCAxMSksXG5cdFx0XHRdKSxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDYsXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnYm91bmRhcnknXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChfYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIHR5cGljYWwgbGluZVxuXHR0ZXN0KCd0eXBpY2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJ1xcdCAgICBleHBvcnQgY2xhc3MgR2FtZSB7IC8vIGh0dHA6Ly90ZXN0LmNvbSAgICAgJztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydCg1LCAxKSxcblx0XHRcdGNyZWF0ZVBhcnQoMTEsIDIpLFxuXHRcdFx0Y3JlYXRlUGFydCgxMiwgMyksXG5cdFx0XHRjcmVhdGVQYXJ0KDE3LCA0KSxcblx0XHRcdGNyZWF0ZVBhcnQoMTgsIDUpLFxuXHRcdFx0Y3JlYXRlUGFydCgyMiwgNiksXG5cdFx0XHRjcmVhdGVQYXJ0KDIzLCA3KSxcblx0XHRcdGNyZWF0ZVBhcnQoMjQsIDgpLFxuXHRcdFx0Y3JlYXRlUGFydCgyNSwgOSksXG5cdFx0XHRjcmVhdGVQYXJ0KDI4LCAxMCksXG5cdFx0XHRjcmVhdGVQYXJ0KDQzLCAxMSksXG5cdFx0XHRjcmVhdGVQYXJ0KDQ4LCAxMiksXG5cdFx0XSk7XG5cdFx0Y29uc3QgX2FjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGxpbmVUb2tlbnMsXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnYm91bmRhcnknXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChfYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMyMjU1OiBXZWlyZCBsaW5lIHJlbmRlcmluZyBwYXJ0IDFcblx0dGVzdCgnaXNzdWUtMjI1NS0xJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJ1xcdFxcdFxcdGN1cnNvclN0eWxlOlxcdFxcdFxcdFxcdFxcdFxcdChwcmV2T3B0cy5jdXJzb3JTdHlsZSAhPT0gbmV3T3B0cy5jdXJzb3JTdHlsZSksJztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydCgzLCAxKSwgLy8gMyBjaGFyc1xuXHRcdFx0Y3JlYXRlUGFydCgxNSwgMiksIC8vIDEyIGNoYXJzXG5cdFx0XHRjcmVhdGVQYXJ0KDIxLCAzKSwgLy8gNiBjaGFyc1xuXHRcdFx0Y3JlYXRlUGFydCgyMiwgNCksIC8vIDEgY2hhclxuXHRcdFx0Y3JlYXRlUGFydCg0MywgNSksIC8vIDIxIGNoYXJzXG5cdFx0XHRjcmVhdGVQYXJ0KDQ1LCA2KSwgLy8gMiBjaGFyc1xuXHRcdFx0Y3JlYXRlUGFydCg0NiwgNyksIC8vIDEgY2hhclxuXHRcdFx0Y3JlYXRlUGFydCg2NiwgOCksIC8vIDIwIGNoYXJzXG5cdFx0XHRjcmVhdGVQYXJ0KDY3LCA5KSwgLy8gMSBjaGFyXG5cdFx0XHRjcmVhdGVQYXJ0KDY4LCAxMCksIC8vIDIgY2hhcnNcblx0XHRdKTtcblx0XHRjb25zdCBfYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0bGluZVRva2Vuc1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoX2FjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMjI1NTogV2VpcmQgbGluZSByZW5kZXJpbmcgcGFydCAyXG5cdHRlc3QoJ2lzc3VlLTIyNTUtMicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICcgXFx0XFx0XFx0Y3Vyc29yU3R5bGU6XFx0XFx0XFx0XFx0XFx0XFx0KHByZXZPcHRzLmN1cnNvclN0eWxlICE9PSBuZXdPcHRzLmN1cnNvclN0eWxlKSwnO1xuXG5cdFx0Y29uc3QgbGluZVRva2VucyA9IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtcblx0XHRcdGNyZWF0ZVBhcnQoNCwgMSksIC8vIDQgY2hhcnNcblx0XHRcdGNyZWF0ZVBhcnQoMTYsIDIpLCAvLyAxMiBjaGFyc1xuXHRcdFx0Y3JlYXRlUGFydCgyMiwgMyksIC8vIDYgY2hhcnNcblx0XHRcdGNyZWF0ZVBhcnQoMjMsIDQpLCAvLyAxIGNoYXJcblx0XHRcdGNyZWF0ZVBhcnQoNDQsIDUpLCAvLyAyMSBjaGFyc1xuXHRcdFx0Y3JlYXRlUGFydCg0NiwgNiksIC8vIDIgY2hhcnNcblx0XHRcdGNyZWF0ZVBhcnQoNDcsIDcpLCAvLyAxIGNoYXJcblx0XHRcdGNyZWF0ZVBhcnQoNjcsIDgpLCAvLyAyMCBjaGFyc1xuXHRcdFx0Y3JlYXRlUGFydCg2OCwgOSksIC8vIDEgY2hhclxuXHRcdFx0Y3JlYXRlUGFydCg2OSwgMTApLCAvLyAyIGNoYXJzXG5cdFx0XSk7XG5cdFx0Y29uc3QgX2FjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGxpbmVUb2tlbnNcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KF9hY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzkxMTc4OiBhZnRlciBkZWNvcmF0aW9uIHR5cGUgc2hvd24gYmVmb3JlIGN1cnNvclxuXHR0ZXN0KCdpc3N1ZS05MTE3OCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICcvL2p1c3QgYSBjb21tZW50Jztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydCgxNiwgMSlcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdzogZmFsc2UsXG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGxpbmVUb2tlbnMsXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnM6IFtcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDEzLCAxMywgJ2RlYzEnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlciksXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbigxMywgMTMsICdkZWMyJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKSxcblx0XHRcdF1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSBtaWNyb3NvZnQvbW9uYWNvLWVkaXRvciMyODA6IEltcHJvdmVkIHNvdXJjZSBjb2RlIHJlbmRlcmluZyBmb3IgUlRMIGxhbmd1YWdlc1xuXHR0ZXN0KCdtb25hY28tMjgwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJ3ZhciBcdTA1RTdcdTA1RDVcdTA1RDNcdTA1REVcdTA1RDVcdTA1RUEgPSBcXFwiXHUwNURFXHUwNUQ5XHUwNUQ1XHUwNUVBXHUwNUU4IFx1MDVFN1x1MDVENVx1MDVEM1x1MDVERVx1MDVENVx1MDVFQSBcdTA1RTZcXCdcdTA1RDggXHUwNUU5XHUwNURDLCBcdTA1RDBcdTA1REQgXHUwNURDXHUwNUU5XHUwNUQ1XHUwNURGIFx1MDVENFx1MDVFMlx1MDVEMVx1MDVFOFx1MDVEOVx1MDVFQSBcdTA1RTlcdTA1RDlcdTA1RTBcdTA1RDVcdTA1RDlcdTA1RDlcdTA1REQgXHUwNUQ1XHUwNUQ5XHUwNUU5LCBcdTA1RDBcdTA1RERcXFwiOyc7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtcblx0XHRcdGNyZWF0ZVBhcnQoMywgNiksXG5cdFx0XHRjcmVhdGVQYXJ0KDEzLCAxKSxcblx0XHRcdGNyZWF0ZVBhcnQoNjYsIDIwKSxcblx0XHRcdGNyZWF0ZVBhcnQoNjcsIDEpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IF9hY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0Y29udGFpbnNSVEw6IHRydWUsXG5cdFx0XHRsaW5lVG9rZW5zXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChfYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMxMzcwMzY6IElzc3VlIGluIFJUTCBsYW5ndWFnZXMgaW4gcmVjZW50IHZlcnNpb25zXG5cdHRlc3QoJ2lzc3VlLTEzNzAzNicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICc8b3B0aW9uIHZhbHVlPVxcXCJcdTA2MjdcdTA2NDRcdTA2MzlcdTA2MzFcdTA2MjhcdTA2NEFcdTA2MjlcXFwiPlx1MDYyN1x1MDY0NFx1MDYzOVx1MDYzMVx1MDYyOFx1MDY0QVx1MDYyOTwvb3B0aW9uPic7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtcblx0XHRcdGNyZWF0ZVBhcnQoMSwgMiksXG5cdFx0XHRjcmVhdGVQYXJ0KDcsIDMpLFxuXHRcdFx0Y3JlYXRlUGFydCg4LCA0KSxcblx0XHRcdGNyZWF0ZVBhcnQoMTMsIDUpLFxuXHRcdFx0Y3JlYXRlUGFydCgxNCwgNCksXG5cdFx0XHRjcmVhdGVQYXJ0KDIzLCA2KSxcblx0XHRcdGNyZWF0ZVBhcnQoMjQsIDIpLFxuXHRcdFx0Y3JlYXRlUGFydCgzMSwgNCksXG5cdFx0XHRjcmVhdGVQYXJ0KDMzLCAyKSxcblx0XHRcdGNyZWF0ZVBhcnQoMzksIDMpLFxuXHRcdFx0Y3JlYXRlUGFydCg0MCwgMiksXG5cdFx0XSk7XG5cdFx0Y29uc3QgX2FjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGlzQmFzaWNBU0NJSTogZmFsc2UsXG5cdFx0XHRjb250YWluc1JUTDogdHJ1ZSxcblx0XHRcdGxpbmVUb2tlbnNcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KF9hY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzk5NTg5OiBSZW5kZXJpbmcgd2hpdGVzcGFjZSBpbmZsdWVuY2VzIGJpZGkgbGF5b3V0XG5cdHRlc3QoJ2lzc3VlLTk5NTg5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJyAgICBbXFxcIlx1RDgzRFx1RERBOFx1RkUwRiBcdTA2ODZcdTA2MjdcdTA2N0UgXHUwNjQxXHUwNjI3XHUwNkE5XHUwNjJBXHUwNjQ4XHUwNjMxXFxcIixcXFwiXHVEODNDXHVERkE4IFx1MDYyQVx1MDY0Nlx1MDYzOFx1MDZDQ1x1MDY0NVx1MDYyN1x1MDYyQVxcXCJdJztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydCg1LCAyKSxcblx0XHRcdGNyZWF0ZVBhcnQoMjEsIDMpLFxuXHRcdFx0Y3JlYXRlUGFydCgyMiwgMiksXG5cdFx0XHRjcmVhdGVQYXJ0KDM0LCAzKSxcblx0XHRcdGNyZWF0ZVBhcnQoMzUsIDIpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IF9hY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGNvbnRhaW5zUlRMOiB0cnVlLFxuXHRcdFx0bGluZVRva2Vucyxcblx0XHRcdHJlbmRlcldoaXRlc3BhY2U6ICdhbGwnXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChfYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMyNjAyMzk6IEhUTUwgY29udGFpbmluZyBiaWRpcmVjdGlvbmFsIHRleHQgaXMgcmVuZGVyZWQgaW5jb3JyZWN0bHlcblx0dGVzdCgnaXNzdWUtMjYwMjM5JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRpbmcgSFRNTCBsaWtlOiA8cCBjbGFzcz1cIm15Y2xhc3NcIiB0aXRsZT1cIlx1MDYyN1x1MDY0NFx1MDYzOVx1MDYzMVx1MDYyOFx1MDY0QVwiPlx1MDY0Nlx1MDYzNFx1MDYyN1x1MDYzNyBcdTA2MjdcdTA2NDRcdTA2MkFcdTA2MkZcdTA2NDhcdTA2NEFcdTA2NDQhPC9wPlxuXHRcdC8vIFRoZSBsaW5lIGNvbnRhaW5zIGJvdGggTFRSIChjbGFzcz1cIm15Y2xhc3NcIikgYW5kIFJUTCAodGl0bGU9XCJcdTA2MjdcdTA2NDRcdTA2MzlcdTA2MzFcdTA2MjhcdTA2NEFcIikgYXR0cmlidXRlIHZhbHVlc1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJzxwIGNsYXNzPVwibXljbGFzc1wiIHRpdGxlPVwiXHUwNjI3XHUwNjQ0XHUwNjM5XHUwNjMxXHUwNjI4XHUwNjRBXCI+XHUwNjQ2XHUwNjM0XHUwNjI3XHUwNjM3IFx1MDYyN1x1MDY0NFx1MDYyQVx1MDYyRlx1MDY0OFx1MDY0QVx1MDY0NCE8L3A+Jztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydCgxLCAxKSwgICAvLyA8XG5cdFx0XHRjcmVhdGVQYXJ0KDIsIDIpLCAgIC8vIHBcblx0XHRcdGNyZWF0ZVBhcnQoMywgMyksICAgLy8gKHNwYWNlKVxuXHRcdFx0Y3JlYXRlUGFydCg4LCA0KSwgICAvLyBjbGFzc1xuXHRcdFx0Y3JlYXRlUGFydCg5LCA1KSwgICAvLyA9XG5cdFx0XHRjcmVhdGVQYXJ0KDEwLCA2KSwgIC8vIFwiXG5cdFx0XHRjcmVhdGVQYXJ0KDE3LCA3KSwgIC8vIG15Y2xhc3Ncblx0XHRcdGNyZWF0ZVBhcnQoMTgsIDYpLCAgLy8gXCJcblx0XHRcdGNyZWF0ZVBhcnQoMTksIDMpLCAgLy8gKHNwYWNlKVxuXHRcdFx0Y3JlYXRlUGFydCgyNCwgNCksICAvLyB0aXRsZVxuXHRcdFx0Y3JlYXRlUGFydCgyNSwgNSksICAvLyA9XG5cdFx0XHRjcmVhdGVQYXJ0KDI2LCA2KSwgIC8vIFwiXG5cdFx0XHRjcmVhdGVQYXJ0KDMyLCA4KSwgIC8vIFx1MDYyN1x1MDY0NFx1MDYzOVx1MDYzMVx1MDYyOFx1MDY0QSAoUlRMIHRleHQpIC0gNiBBcmFiaWMgY2hhcmFjdGVycyBmcm9tIHBvc2l0aW9uIDI2LTMxXG5cdFx0XHRjcmVhdGVQYXJ0KDMzLCA2KSwgIC8vIFwiIC0gY2xvc2luZyBxdW90ZSBhdCBwb3NpdGlvbiAzMlxuXHRcdFx0Y3JlYXRlUGFydCgzNCwgMSksICAvLyA+XG5cdFx0XHRjcmVhdGVQYXJ0KDQ3LCA5KSwgIC8vIFx1MDY0Nlx1MDYzNFx1MDYyN1x1MDYzNyBcdTA2MjdcdTA2NDRcdTA2MkFcdTA2MkZcdTA2NDhcdTA2NEFcdTA2NDQhIChSVEwgdGV4dCkgLSAxMyBjaGFyYWN0ZXJzIGZyb20gcG9zaXRpb24gMzQtNDZcblx0XHRcdGNyZWF0ZVBhcnQoNDgsIDEpLCAgLy8gPFxuXHRcdFx0Y3JlYXRlUGFydCg0OSwgMiksICAvLyAvXG5cdFx0XHRjcmVhdGVQYXJ0KDUwLCAyKSwgIC8vIHBcblx0XHRcdGNyZWF0ZVBhcnQoNTEsIDEpLCAgLy8gPlxuXHRcdF0pO1xuXHRcdGNvbnN0IF9hY3R1YWwgPSByZW5kZXJWaWV3TGluZShuZXcgUmVuZGVyTGluZUlucHV0KFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdDAsXG5cdFx0XHRsaW5lVG9rZW5zLFxuXHRcdFx0W10sXG5cdFx0XHQ0LFxuXHRcdFx0MCxcblx0XHRcdDEwLFxuXHRcdFx0MTAsXG5cdFx0XHQxMCxcblx0XHRcdC0xLFxuXHRcdFx0J25vbmUnLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZSxcblx0XHRcdG51bGwsXG5cdFx0XHRudWxsLFxuXHRcdFx0MTRcblx0XHQpKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoX2FjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMjc0NjA0OiBNaXhlZCBMVFIgYW5kIFJUTCBpbiBhIHNpbmdsZSB0b2tlblxuXHR0ZXN0KCdpc3N1ZS0yNzQ2MDQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAndGVzdC5jb20jI2E6LWFicC1jb250YWlucyhcdTA2MjUpJztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydChsaW5lQ29udGVudC5sZW5ndGgsIDEpXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGNvbnRhaW5zUlRMOiB0cnVlLFxuXHRcdFx0bGluZVRva2Vuc1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMyNzc2OTM6IE1peGVkIExUUiBhbmQgUlRMIGluIGEgc2luZ2xlIHRva2VuIHdpdGggdGVtcGxhdGUgbGl0ZXJhbFxuXHR0ZXN0KCdpc3N1ZS0yNzc2OTMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAnXHUwNjQ2XHUwNjI3XHUwNjQ1IFx1MDZBOVx1MDYyN1x1MDYzMVx1MDYyOFx1MDYzMTogJHt1c2VyLmZpcnN0TmFtZX0nO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRjcmVhdGVQYXJ0KDksIDEpLCAgIC8vIFx1MDY0Nlx1MDYyN1x1MDY0NSBcdTA2QTlcdTA2MjdcdTA2MzFcdTA2MjhcdTA2MzEgKFJUTCBzdHJpbmcgY29udGVudClcblx0XHRcdGNyZWF0ZVBhcnQoMTEsIDEpLCAgLy8gOiAoc3BhY2UpXG5cdFx0XHRjcmVhdGVQYXJ0KDEzLCAyKSwgIC8vICR7ICh0ZW1wbGF0ZSBleHByZXNzaW9uIHB1bmN0dWF0aW9uKVxuXHRcdFx0Y3JlYXRlUGFydCgxNywgMyksICAvLyB1c2VyICh2YXJpYWJsZSlcblx0XHRcdGNyZWF0ZVBhcnQoMTgsIDQpLCAgLy8gLiAocHVuY3R1YXRpb24pXG5cdFx0XHRjcmVhdGVQYXJ0KDI3LCAzKSwgIC8vIGZpcnN0TmFtZSAocHJvcGVydHkpXG5cdFx0XHRjcmVhdGVQYXJ0KDI4LCAyKSwgIC8vIH0gKHRlbXBsYXRlIGV4cHJlc3Npb24gcHVuY3R1YXRpb24pXG5cdFx0XSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGNvbnRhaW5zUlRMOiB0cnVlLFxuXHRcdFx0bGluZVRva2Vuc1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICM2ODg1OiBTcGxpdHMgbGFyZ2UgdG9rZW5zXG5cdHRlc3QoJ2lzc3VlLTY4ODUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAxICAgICAgICAgMSAgICAgICAgIDFcblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICAgIDEgICAgICAgICAyICAgICAgICAgMyAgICAgICAgIDQgICAgICAgICA1ICAgICAgICAgNiAgICAgICAgIDcgICAgICAgICA4ICAgICAgICAgOSAgICAgICAgIDAgICAgICAgICAxICAgICAgICAgMlxuXHRcdC8vICAgICAgICAgICAgICAgMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNFxuXHRcdGNvbnN0IF9saW5lVGV4dCA9ICdUaGlzIGlzIGp1c3QgYSBsb25nIGxpbmUgdGhhdCBjb250YWlucyB2ZXJ5IGludGVyZXN0aW5nIHRleHQuIFRoaXMgaXMganVzdCBhIGxvbmcgbGluZSB0aGF0IGNvbnRhaW5zIHZlcnkgaW50ZXJlc3RpbmcgdGV4dC4nO1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0U3BsaXRzVG9rZW5zKG1lc3NhZ2U6IHN0cmluZywgbGluZUNvbnRlbnQ6IHN0cmluZywgZXhwZWN0ZWRPdXRwdXQ6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQobGluZUNvbnRlbnQubGVuZ3RoLCAxKV0pO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRcdGxpbmVUb2tlbnNcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuaHRtbCwgJzxzcGFuPicgKyBleHBlY3RlZE91dHB1dC5qb2luKCcnKSArICc8L3NwYW4+JywgbWVzc2FnZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQSB0b2tlbiB3aXRoIDQ5IGNoYXJzXG5cdFx0e1xuXHRcdFx0YXNzZXJ0U3BsaXRzVG9rZW5zKFxuXHRcdFx0XHQnNDkgY2hhcnMnLFxuXHRcdFx0XHRfbGluZVRleHQuc3Vic3RyKDAsIDQ5KSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCc8c3BhbiBjbGFzcz1cIm10azFcIj5UaGlzXFx1MDBhMGlzXFx1MDBhMGp1c3RcXHUwMGEwYVxcdTAwYTBsb25nXFx1MDBhMGxpbmVcXHUwMGEwdGhhdFxcdTAwYTBjb250YWluc1xcdTAwYTB2ZXJ5XFx1MDBhMGludGVyPC9zcGFuPicsXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gQSB0b2tlbiB3aXRoIDUwIGNoYXJzXG5cdFx0e1xuXHRcdFx0YXNzZXJ0U3BsaXRzVG9rZW5zKFxuXHRcdFx0XHQnNTAgY2hhcnMnLFxuXHRcdFx0XHRfbGluZVRleHQuc3Vic3RyKDAsIDUwKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCc8c3BhbiBjbGFzcz1cIm10azFcIj5UaGlzXFx1MDBhMGlzXFx1MDBhMGp1c3RcXHUwMGEwYVxcdTAwYTBsb25nXFx1MDBhMGxpbmVcXHUwMGEwdGhhdFxcdTAwYTBjb250YWluc1xcdTAwYTB2ZXJ5XFx1MDBhMGludGVyZTwvc3Bhbj4nLFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIEEgdG9rZW4gd2l0aCA1MSBjaGFyc1xuXHRcdHtcblx0XHRcdGFzc2VydFNwbGl0c1Rva2Vucyhcblx0XHRcdFx0JzUxIGNoYXJzJyxcblx0XHRcdFx0X2xpbmVUZXh0LnN1YnN0cigwLCA1MSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+VGhpc1xcdTAwYTBpc1xcdTAwYTBqdXN0XFx1MDBhMGFcXHUwMGEwbG9uZ1xcdTAwYTBsaW5lXFx1MDBhMHRoYXRcXHUwMGEwY29udGFpbnNcXHUwMGEwdmVyeVxcdTAwYTBpbnRlcmU8L3NwYW4+Jyxcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+czwvc3Bhbj4nLFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIEEgdG9rZW4gd2l0aCA5OSBjaGFyc1xuXHRcdHtcblx0XHRcdGFzc2VydFNwbGl0c1Rva2Vucyhcblx0XHRcdFx0Jzk5IGNoYXJzJyxcblx0XHRcdFx0X2xpbmVUZXh0LnN1YnN0cigwLCA5OSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+VGhpc1xcdTAwYTBpc1xcdTAwYTBqdXN0XFx1MDBhMGFcXHUwMGEwbG9uZ1xcdTAwYTBsaW5lXFx1MDBhMHRoYXRcXHUwMGEwY29udGFpbnNcXHUwMGEwdmVyeVxcdTAwYTBpbnRlcmU8L3NwYW4+Jyxcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+c3RpbmdcXHUwMGEwdGV4dC5cXHUwMGEwVGhpc1xcdTAwYTBpc1xcdTAwYTBqdXN0XFx1MDBhMGFcXHUwMGEwbG9uZ1xcdTAwYTBsaW5lXFx1MDBhMHRoYXRcXHUwMGEwY29udGFpbjwvc3Bhbj4nLFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIEEgdG9rZW4gd2l0aCAxMDAgY2hhcnNcblx0XHR7XG5cdFx0XHRhc3NlcnRTcGxpdHNUb2tlbnMoXG5cdFx0XHRcdCcxMDAgY2hhcnMnLFxuXHRcdFx0XHRfbGluZVRleHQuc3Vic3RyKDAsIDEwMCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+VGhpc1xcdTAwYTBpc1xcdTAwYTBqdXN0XFx1MDBhMGFcXHUwMGEwbG9uZ1xcdTAwYTBsaW5lXFx1MDBhMHRoYXRcXHUwMGEwY29udGFpbnNcXHUwMGEwdmVyeVxcdTAwYTBpbnRlcmU8L3NwYW4+Jyxcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+c3RpbmdcXHUwMGEwdGV4dC5cXHUwMGEwVGhpc1xcdTAwYTBpc1xcdTAwYTBqdXN0XFx1MDBhMGFcXHUwMGEwbG9uZ1xcdTAwYTBsaW5lXFx1MDBhMHRoYXRcXHUwMGEwY29udGFpbnM8L3NwYW4+Jyxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBBIHRva2VuIHdpdGggMTAxIGNoYXJzXG5cdFx0e1xuXHRcdFx0YXNzZXJ0U3BsaXRzVG9rZW5zKFxuXHRcdFx0XHQnMTAxIGNoYXJzJyxcblx0XHRcdFx0X2xpbmVUZXh0LnN1YnN0cigwLCAxMDEpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0JzxzcGFuIGNsYXNzPVwibXRrMVwiPlRoaXNcXHUwMGEwaXNcXHUwMGEwanVzdFxcdTAwYTBhXFx1MDBhMGxvbmdcXHUwMGEwbGluZVxcdTAwYTB0aGF0XFx1MDBhMGNvbnRhaW5zXFx1MDBhMHZlcnlcXHUwMGEwaW50ZXJlPC9zcGFuPicsXG5cdFx0XHRcdFx0JzxzcGFuIGNsYXNzPVwibXRrMVwiPnN0aW5nXFx1MDBhMHRleHQuXFx1MDBhMFRoaXNcXHUwMGEwaXNcXHUwMGEwanVzdFxcdTAwYTBhXFx1MDBhMGxvbmdcXHUwMGEwbGluZVxcdTAwYTB0aGF0XFx1MDBhMGNvbnRhaW5zPC9zcGFuPicsXG5cdFx0XHRcdFx0JzxzcGFuIGNsYXNzPVwibXRrMVwiPlxcdTAwYTA8L3NwYW4+Jyxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMyMTQ3NjogRG9lcyBub3Qgc3BsaXQgbGFyZ2UgdG9rZW5zIHdoZW4gbGlnYXR1cmVzIGFyZSBvblxuXHR0ZXN0KCdpc3N1ZS0yMTQ3NicsIGFzeW5jICgpID0+IHtcblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDEgICAgICAgICAxICAgICAgICAgMVxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgICAgMSAgICAgICAgIDIgICAgICAgICAzICAgICAgICAgNCAgICAgICAgIDUgICAgICAgICA2ICAgICAgICAgNyAgICAgICAgIDggICAgICAgICA5ICAgICAgICAgMCAgICAgICAgIDEgICAgICAgICAyXG5cdFx0Ly8gICAgICAgICAgICAgICAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0XG5cdFx0Y29uc3QgX2xpbmVUZXh0ID0gJ1RoaXMgaXMganVzdCBhIGxvbmcgbGluZSB0aGF0IGNvbnRhaW5zIHZlcnkgaW50ZXJlc3RpbmcgdGV4dC4gVGhpcyBpcyBqdXN0IGEgbG9uZyBsaW5lIHRoYXQgY29udGFpbnMgdmVyeSBpbnRlcmVzdGluZyB0ZXh0Lic7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRTcGxpdHNUb2tlbnMobWVzc2FnZTogc3RyaW5nLCBsaW5lQ29udGVudDogc3RyaW5nLCBleHBlY3RlZE91dHB1dDogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydChsaW5lQ29udGVudC5sZW5ndGgsIDEpXSk7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdFx0bGluZVRva2Vucyxcblx0XHRcdFx0Zm9udExpZ2F0dXJlczogdHJ1ZVxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5odG1sLCAnPHNwYW4+JyArIGV4cGVjdGVkT3V0cHV0LmpvaW4oJycpICsgJzwvc3Bhbj4nLCBtZXNzYWdlKTtcblx0XHR9XG5cblx0XHQvLyBBIHRva2VuIHdpdGggMTAxIGNoYXJzXG5cdFx0e1xuXHRcdFx0YXNzZXJ0U3BsaXRzVG9rZW5zKFxuXHRcdFx0XHQnMTAxIGNoYXJzJyxcblx0XHRcdFx0X2xpbmVUZXh0LnN1YnN0cigwLCAxMDEpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0JzxzcGFuIGNsYXNzPVwibXRrMVwiPlRoaXNcXHUwMGEwaXNcXHUwMGEwanVzdFxcdTAwYTBhXFx1MDBhMGxvbmdcXHUwMGEwbGluZVxcdTAwYTB0aGF0XFx1MDBhMGNvbnRhaW5zXFx1MDBhMHZlcnlcXHUwMGEwPC9zcGFuPicsXG5cdFx0XHRcdFx0JzxzcGFuIGNsYXNzPVwibXRrMVwiPmludGVyZXN0aW5nXFx1MDBhMHRleHQuXFx1MDBhMFRoaXNcXHUwMGEwaXNcXHUwMGEwanVzdFxcdTAwYTBhXFx1MDBhMGxvbmdcXHUwMGEwbGluZVxcdTAwYTB0aGF0XFx1MDBhMDwvc3Bhbj4nLFxuXHRcdFx0XHRcdCc8c3BhbiBjbGFzcz1cIm10azFcIj5jb250YWluc1xcdTAwYTA8L3NwYW4+Jyxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMyMDYyNDogVW5hbGlnbmVkIHN1cnJvZ2F0ZSBwYWlycyBhcmUgY29ycnVwdGVkIGF0IG11bHRpcGxlcyBvZiA1MCBjb2x1bW5zXG5cdHRlc3QoJ2lzc3VlLTIwNjI0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJ2FcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjdcdUQ4NDJcdURGQjcnO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydChsaW5lQ29udGVudC5sZW5ndGgsIDEpXSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGxpbmVUb2tlbnNcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzY4ODU6IERvZXMgbm90IHNwbGl0IGxhcmdlIHRva2VucyBpbiBSVEwgdGV4dFxuXHR0ZXN0KCdpc3N1ZS02ODg1LXJ0bCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICdcdTA1RDBcdTA1RUEgXHUwNUQyXHUwNUU4XHUwNURFXHUwNUUwXHUwNUQ5XHUwNUVBIFx1MDVEMVx1MDVENFx1MDVFQVx1MDVEOVx1MDVEOVx1MDVEN1x1MDVFMVx1MDVENVx1MDVFQSBcdTA1RTlcdTA1REVcdTA1RDUsIFx1MDVFOVx1MDVFMFx1MDVFQVx1MDVEOSBcdTA1RDRcdTA1REVcdTA1RTlcdTA1RTRcdTA1RDggXHUwNUQwXHUwNURDIFx1MDVEN1x1MDVFNFx1MDVFOSwgXHUwNUQwXHUwNUREIFx1MDVEQlx1MDVFQVx1MDVEMSBcdTA1RDBcdTA1RDdcdTA1RThcdTA1RDlcdTA1REQgXHUwNUQ1XHUwNURDXHUwNUQ3XHUwNUQxXHUwNUU4LiBcdTA1RTlcdTA1REMgXHUwNUQ0XHUwNUVBXHUwNUQ1XHUwNURCXHUwNURGIFx1MDVEMFx1MDVENVx1MDVEM1x1MDVENVx1MDVFQSBcdTA1RDFcdTA1RDVcdTA1RDlcdTA1RTdcdTA1RDlcdTA1RTRcdTA1RDNcdTA1RDlcdTA1RDQgXHUwNURCXHUwNURDXHUwNURDLCBcdTA1RTlcdTA1REMgXHUwNUUyXHUwNUQ2XHUwNUU4XHUwNUQ0IFx1MDVEQlx1MDVEOVx1MDVERVx1MDVEOVx1MDVENCBcdTA1RDRcdTA1RDlcdTA1RDAuIFx1MDVFMlx1MDVEQyBcdTA1RTJcdTA1REVcdTA1RDVcdTA1RDMgXHUwNUQ5XHUwNUQ1XHUwNUU2XHUwNUU4XHUwNUQ5XHUwNUREIFx1MDVERVx1MDVEOVx1MDVFQVx1MDVENVx1MDVEQ1x1MDVENVx1MDVEMlx1MDVEOVx1MDVENCBcdTA1RTFcdTA1RDNcdTA1RTgsIFx1MDVEMFx1MDVERCBcdTA1RTlcdTA1REJcdTA1REMgXHUwNUU5XHUwNUVBXHUwNUU0XHUwNUQ1IFx1MDVEQ1x1MDVFMlx1MDVEMVx1MDVFOFx1MDVEOVx1MDVFQSBcdTA1RTlcdTA1RDlcdTA1RTBcdTA1RDVcdTA1RDlcdTA1RDlcdTA1REQsIFx1MDVEMFx1MDVERCBcdTA1RTlcdTA1RDBcdTA1RENcdTA1RDVcdTA1RUEgXHUwNUQwXHUwNUUwXHUwNUQyXHUwNURDXHUwNUQ5XHUwNUVBIFx1MDVFMlx1MDVENlx1MDVENC4gXHUwNUU5XHUwNURFXHUwNUQ1XHUwNUVBIFx1MDVEMVx1MDVFN1x1MDVEQ1x1MDVENVx1MDVFQSBcdTA1REVcdTA1RDQgXHUwNUUxXHUwNUQzXHUwNUU4Lic7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KGxpbmVDb250ZW50Lmxlbmd0aCwgMSldKTtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0Y29udGFpbnNSVEw6IHRydWUsXG5cdFx0XHRsaW5lVG9rZW5zXG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwsIEhUTUxfRVhURU5TSU9OKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzk1Njg1OiBVc2VzIHVuaWNvZGUgcmVwbGFjZW1lbnQgY2hhcmFjdGVyIGZvciBQYXJhZ3JhcGggU2VwYXJhdG9yXG5cdHRlc3QoJ2lzc3VlLTk1Njg1JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJ3ZhciBmdGV4dCA9IFtcXHUyMDI5XCJVbmRcIiwgXCJkYW5uXCIsIFwiZWluZXNcIl07Jztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQobGluZUNvbnRlbnQubGVuZ3RoLCAxKV0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGlzQmFzaWNBU0NJSTogZmFsc2UsXG5cdFx0XHRsaW5lVG9rZW5zXG5cdFx0fSkpO1xuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMxOTY3MzogTW9ub2thaSBUaGVtZSBiYWQtaGlnaGxpZ2h0aW5nIGluIGxpbmUgd3JhcFxuXHR0ZXN0KCdpc3N1ZS0xOTY3MycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICcgICAgTW9uZ29DYWxsYmFjazxzdHJpbmc+KTogdm9pZCB7Jztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydCgxNywgMSksXG5cdFx0XHRjcmVhdGVQYXJ0KDE4LCAyKSxcblx0XHRcdGNyZWF0ZVBhcnQoMjQsIDMpLFxuXHRcdFx0Y3JlYXRlUGFydCgyNiwgNCksXG5cdFx0XHRjcmVhdGVQYXJ0KDI3LCA1KSxcblx0XHRcdGNyZWF0ZVBhcnQoMjgsIDYpLFxuXHRcdFx0Y3JlYXRlUGFydCgzMiwgNyksXG5cdFx0XHRjcmVhdGVQYXJ0KDM0LCA4KSxcblx0XHRdKTtcblx0XHRjb25zdCBfYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGZhdXhJbmRlbnRMZW5ndGg6IDQsXG5cdFx0XHRsaW5lVG9rZW5zXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChfYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xufSk7XG5cbnR5cGUgQ2hhcmFjdGVyTWFwcGluZ0luZm8gPSBbbnVtYmVyLCBbbnVtYmVyLCBudW1iZXJdXTtcblxuZnVuY3Rpb24gYXNzZXJ0Q2hhcmFjdGVyTWFwcGluZzMoYWN0dWFsOiBDaGFyYWN0ZXJNYXBwaW5nLCBleHBlY3RlZEluZm86IENoYXJhY3Rlck1hcHBpbmdJbmZvW10pOiB2b2lkIHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHBlY3RlZEluZm8ubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBbaG9yaXpvbnRhbE9mZnNldCwgW3BhcnRJbmRleCwgY2hhckluZGV4XV0gPSBleHBlY3RlZEluZm9baV07XG5cblx0XHRjb25zdCBhY3R1YWxEb21Qb3NpdGlvbiA9IGFjdHVhbC5nZXREb21Qb3NpdGlvbihpICsgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxEb21Qb3NpdGlvbiwgbmV3IERvbVBvc2l0aW9uKHBhcnRJbmRleCwgY2hhckluZGV4KSwgYGdldERvbVBvc2l0aW9uKCR7aSArIDF9KWApO1xuXG5cdFx0bGV0IHBhcnRMZW5ndGggPSBjaGFySW5kZXggKyAxO1xuXHRcdGZvciAobGV0IGogPSBpICsgMTsgaiA8IGV4cGVjdGVkSW5mby5sZW5ndGg7IGorKykge1xuXHRcdFx0Y29uc3QgWywgW25leHRQYXJ0SW5kZXgsIG5leHRDaGFySW5kZXhdXSA9IGV4cGVjdGVkSW5mb1tqXTtcblx0XHRcdGlmIChuZXh0UGFydEluZGV4ID09PSBwYXJ0SW5kZXgpIHtcblx0XHRcdFx0cGFydExlbmd0aCA9IG5leHRDaGFySW5kZXggKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0dWFsQ29sdW1uID0gYWN0dWFsLmdldENvbHVtbihuZXcgRG9tUG9zaXRpb24ocGFydEluZGV4LCBjaGFySW5kZXgpLCBwYXJ0TGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsQ29sdW1uLCBpICsgMSwgYGFjdHVhbC5nZXRDb2x1bW4oJHtwYXJ0SW5kZXh9LCAke2NoYXJJbmRleH0pYCk7XG5cblx0XHRjb25zdCBhY3R1YWxIb3Jpem9udGFsT2Zmc2V0ID0gYWN0dWFsLmdldEhvcml6b250YWxPZmZzZXQoaSArIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxIb3Jpem9udGFsT2Zmc2V0LCBob3Jpem9udGFsT2Zmc2V0LCBgYWN0dWFsLmdldEhvcml6b250YWxPZmZzZXQoJHtpICsgMX0pYCk7XG5cdH1cblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxlbmd0aCwgZXhwZWN0ZWRJbmZvLmxlbmd0aCwgYGxlbmd0aCBtaXNtYXRjaGApO1xufVxuXG5zdWl0ZSgncmVuZGVyVmlld0xpbmUyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRlc3RDcmVhdGVMaW5lUGFydHMoZm9udElzTW9ub3NwYWNlOiBib29sZWFuLCBsaW5lQ29udGVudDogc3RyaW5nLCB0b2tlbnM6IFRlc3RMaW5lVG9rZW5bXSwgZmF1eEluZGVudExlbmd0aDogbnVtYmVyLCByZW5kZXJXaGl0ZXNwYWNlOiAnbm9uZScgfCAnYm91bmRhcnknIHwgJ3NlbGVjdGlvbicgfCAndHJhaWxpbmcnIHwgJ2FsbCcsIHNlbGVjdGlvbnM6IE9mZnNldFJhbmdlW10gfCBudWxsKSB7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IGZvbnRJc01vbm9zcGFjZSxcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0ZmF1eEluZGVudExlbmd0aCxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKHRva2VucyksXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlLFxuXHRcdFx0c2VsZWN0aW9uc09uTGluZTogc2VsZWN0aW9uc1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0fVxuXG5cdC8vIGlzc3VlICMxODYxNjogSW5saW5lIGRlY29yYXRpb25zIGVuZGluZyBhdCB0aGUgdGV4dCBsZW5ndGggYXJlIG5vIGxvbmdlciByZW5kZXJlZFxuXHR0ZXN0KCdpc3N1ZS0xODYxNicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICdodHRwczovL21pY3Jvc29mdC5jb20nO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDIxLCAzKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbbmV3IExpbmVEZWNvcmF0aW9uKDEsIDIyLCAnbGluaycsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpXVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMxOTIwNzogTGluayBpbiBNb25va2FpIGlzIG5vdCByZW5kZXJlZCBjb3JyZWN0bHlcblx0dGVzdCgnaXNzdWUtMTkyMDcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAnXFwnbGV0IHVybCA9IGBodHRwOi8vKioqL19hcGkvd2ViL2xpc3RzL0dldEJ5VGl0bGUoXFxcXFxcJ1RlYW1idWlsZGluZ2FhbnZyYWdlblxcXFxcXCcpL2l0ZW1zYDtcXCcnO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNDksIDYpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDUxLCA0KSxcblx0XHRcdFx0Y3JlYXRlUGFydCg3MiwgNiksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNzQsIDQpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDg0LCA2KSxcblx0XHRcdF0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbigxMywgNTEsICdkZXRlY3RlZC1saW5rJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcilcblx0XHRcdF1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgc2ltcGxlXG5cdHRlc3QoJ3NpbXBsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnSGVsbG8gd29ybGQhJyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCgxMiwgMSlcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J25vbmUnLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyBzaW1wbGUgdHdvIHRva2Vuc1xuXHR0ZXN0KCd0d28tdG9rZW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCdIZWxsbyB3b3JsZCEnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDEyLCAyKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnbm9uZScsXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIC0gNCBsZWFkaW5nIHNwYWNlc1xuXHR0ZXN0KCd3cy00LWxlYWRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0JyAgICBIZWxsbyB3b3JsZCEgICAgJyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg2LCAyKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgyMCwgMylcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J2JvdW5kYXJ5Jyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgLSA4IGxlYWRpbmcgc3BhY2VzXG5cdHRlc3QoJ3dzLTgtbGVhZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnICAgICAgICBIZWxsbyB3b3JsZCEgICAgICAgICcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoOCwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTAsIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDI4LCAzKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnYm91bmRhcnknLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSAtIDIgbGVhZGluZyB0YWJzXG5cdHRlc3QoJ3dzLTItdGFicycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnXFx0XFx0SGVsbG8gd29ybGQhXFx0Jyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCgyLCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAyKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxNSwgMylcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J2JvdW5kYXJ5Jyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgLSBtaXhlZCBsZWFkaW5nIHNwYWNlcyBhbmQgdGFic1xuXHR0ZXN0KCd3cy1taXhlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnICBcXHRcXHQgIEhlbGxvIHdvcmxkISBcXHQgIFxcdCAgIFxcdCAgICAnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDgsIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDMxLCAzKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnYm91bmRhcnknLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSBza2lwcyBmYXV4IGluZGVudFxuXHR0ZXN0KCd3cy1mYXV4LWluZGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnXFx0XFx0ICBIZWxsbyB3b3JsZCEgXFx0ICBcXHQgICBcXHQgICAgJyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg2LCAyKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgyOSwgMylcblx0XHRcdF0sXG5cdFx0XHQyLFxuXHRcdFx0J2JvdW5kYXJ5Jyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgZG9lcyBub3QgZW1pdCB3aWR0aCBmb3IgbW9ub3NwYWNlIGZvbnRzXG5cdHRlc3QoJ3dzLW1vbm9zcGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCdcXHRcXHQgIEhlbGxvIHdvcmxkISBcXHQgIFxcdCAgIFxcdCAgICAnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDI5LCAzKVxuXHRcdFx0XSxcblx0XHRcdDIsXG5cdFx0XHQnYm91bmRhcnknLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSBpbiBtaWRkbGUgYnV0IG5vdCBmb3Igb25lIHNwYWNlXG5cdHRlc3QoJ3dzLW1pZGRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnaXQgIGl0IGl0ICBpdCcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNywgMiksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTMsIDMpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCdib3VuZGFyeScsXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIGZvciBhbGwgaW4gbWlkZGxlXG5cdHRlc3QoJ3dzLWFsbC1taWRkbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0JyBIZWxsbyB3b3JsZCFcXHQnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDApLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDE0LCAyKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnYWxsJyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgZm9yIHNlbGVjdGlvbiB3aXRoIG5vIHNlbGVjdGlvbnNcblx0dGVzdCgnd3Mtc2VsLW5vbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0JyBIZWxsbyB3b3JsZCFcXHQnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDApLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDE0LCAyKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnc2VsZWN0aW9uJyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgZm9yIHNlbGVjdGlvbiB3aXRoIHdob2xlIGxpbmUgc2VsZWN0aW9uXG5cdHRlc3QoJ3dzLXNlbC13aG9sZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnIEhlbGxvIHdvcmxkIVxcdCcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNCwgMCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTQsIDIpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCdzZWxlY3Rpb24nLFxuXHRcdFx0W25ldyBPZmZzZXRSYW5nZSgwLCAxNCldXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIGZvciBzZWxlY3Rpb24gd2l0aCBzZWxlY3Rpb24gc3Bhbm5pbmcgcGFydCBvZiB3aGl0ZXNwYWNlXG5cdHRlc3QoJ3dzLXNlbC1wYXJ0aWFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcgSGVsbG8gd29ybGQhXFx0Jyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAwKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg2LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxNCwgMilcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J3NlbGVjdGlvbicsXG5cdFx0XHRbbmV3IE9mZnNldFJhbmdlKDAsIDUpXVxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSBmb3Igc2VsZWN0aW9uIHdpdGggbXVsdGlwbGUgc2VsZWN0aW9uc1xuXHR0ZXN0KCd3cy1zZWwtbXVsdGlwbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0JyBIZWxsbyB3b3JsZCFcXHQnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDApLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDE0LCAyKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnc2VsZWN0aW9uJyxcblx0XHRcdFtuZXcgT2Zmc2V0UmFuZ2UoMCwgNSksIG5ldyBPZmZzZXRSYW5nZSg5LCAxNCldXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIGZvciBzZWxlY3Rpb24gd2l0aCBtdWx0aXBsZSwgaW5pdGlhbGx5IHVuc29ydGVkIHNlbGVjdGlvbnNcblx0dGVzdCgnd3Mtc2VsLXVuc29ydGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcgSGVsbG8gd29ybGQhXFx0Jyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAwKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg2LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxNCwgMilcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J3NlbGVjdGlvbicsXG5cdFx0XHRbbmV3IE9mZnNldFJhbmdlKDksIDE0KSwgbmV3IE9mZnNldFJhbmdlKDAsIDUpXVxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSBmb3Igc2VsZWN0aW9uIHdpdGggc2VsZWN0aW9ucyBuZXh0IHRvIGVhY2ggb3RoZXJcblx0dGVzdCgnd3Mtc2VsLWFkamFjZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcgKiBTJyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAwKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnc2VsZWN0aW9uJyxcblx0XHRcdFtuZXcgT2Zmc2V0UmFuZ2UoMCwgMSksIG5ldyBPZmZzZXRSYW5nZSgxLCAyKSwgbmV3IE9mZnNldFJhbmdlKDIsIDMpXVxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSBmb3IgdHJhaWxpbmcgd2l0aCBsZWFkaW5nLCBpbm5lciwgYW5kIHdpdGhvdXQgdHJhaWxpbmcgd2hpdGVzcGFjZVxuXHR0ZXN0KCd3cy10cmFpbC1uby10cmFpbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnIEhlbGxvIHdvcmxkIScsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNCwgMCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTQsIDIpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCd0cmFpbGluZycsXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIGZvciB0cmFpbGluZyB3aXRoIGxlYWRpbmcsIGlubmVyLCBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxuXHR0ZXN0KCd3cy10cmFpbC13aXRoLXRyYWlsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcgSGVsbG8gd29ybGQhIFxcdCcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNCwgMCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTUsIDIpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCd0cmFpbGluZycsXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIGZvciB0cmFpbGluZyB3aXRoIDggbGVhZGluZyBhbmQgOCB0cmFpbGluZyB3aGl0ZXNwYWNlc1xuXHR0ZXN0KCd3cy10cmFpbC04LTgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0JyAgICAgICAgSGVsbG8gd29ybGQhICAgICAgICAnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDgsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDEwLCAyKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgyOCwgMylcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J3RyYWlsaW5nJyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgZm9yIHRyYWlsaW5nIHdpdGggbGluZSBjb250YWluaW5nIG9ubHkgd2hpdGVzcGFjZXNcblx0dGVzdCgnd3MtdHJhaWwtb25seScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnIFxcdCAnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDIsIDApLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDMsIDEpLFxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQndHJhaWxpbmcnLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyBjYW4gaGFuZGxlIHVuc29ydGVkIGlubGluZSBkZWNvcmF0aW9uc1xuXHR0ZXN0KCd1bnNvcnRlZC1kZWNvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudDogJ0hlbGxvIHdvcmxkJyxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDExLCAwKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbig1LCA3LCAnYScsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpLFxuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oMSwgMywgJ2InLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKSxcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDIsIDgsICdjJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhciksXG5cdFx0XHRdXG5cdFx0fSkpO1xuXG5cdFx0Ly8gMDEyMzQ1Njc4OTBcblx0XHQvLyBIZWxsbyB3b3JsZFxuXHRcdC8vIC0tLS1hYS0tLS0tXG5cdFx0Ly8gYmItLS0tLS0tLS1cblx0XHQvLyAtY2NjY2NjLS0tLVxuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzExNDg1OiBWaXNpYmxlIHdoaXRlc3BhY2UgY29uZmxpY3RzIHdpdGggYmVmb3JlIGRlY29yYXRvciBhdHRhY2htZW50XG5cdHRlc3QoJ2lzc3VlLTExNDg1JywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAnXFx0YmxhJztcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDQsIDMpXSksXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnM6IFtuZXcgTGluZURlY29yYXRpb24oMSwgMiwgJ2JlZm9yZScsIElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSldLFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZTogJ2FsbCcsXG5cdFx0XHRmb250TGlnYXR1cmVzOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzMyNDM2OiBOb24tbW9ub3NwYWNlIGZvbnQgKyB2aXNpYmxlIHdoaXRlc3BhY2UgKyBBZnRlciBkZWNvcmF0b3IgY2F1c2VzIGxpbmUgdG8gXCJqdW1wXCJcblx0dGVzdCgnaXNzdWUtMzI0MzYnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICdcXHRibGEnO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoNCwgMyldKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uczogW25ldyBMaW5lRGVjb3JhdGlvbigyLCAzLCAnYmVmb3JlJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKV0sXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnYWxsJyxcblx0XHRcdGZvbnRMaWdhdHVyZXM6IHRydWVcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMzAxMzM6IEVtcHR5IGxpbmVzIGRvbid0IHJlbmRlciBpbmxpbmUgZGVjb3JhdGlvbnNcblx0dGVzdCgnaXNzdWUtMzAxMzMnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICcnO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMCwgMyldKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uczogW25ldyBMaW5lRGVjb3JhdGlvbigxLCAyLCAnYmVmb3JlJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKV0sXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnYWxsJyxcblx0XHRcdGZvbnRMaWdhdHVyZXM6IHRydWVcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMzcyMDg6IENvbGxhcHNpbmcgYnVsbGV0IHBvaW50IGNvbnRhaW5pbmcgZW1vamkgaW4gTWFya2Rvd24gZG9jdW1lbnQgcmVzdWx0cyBpbiBbPz9dIGNoYXJhY3RlclxuXHR0ZXN0KCdpc3N1ZS0zNzIwOCcsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICcgIDEuIFx1RDgzRFx1REU0RicsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoNywgMyldKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uczogW25ldyBMaW5lRGVjb3JhdGlvbig3LCA4LCAnaW5saW5lLWZvbGRlZCcsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKV0sXG5cdFx0XHR0YWJTaXplOiAyLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDBcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMzc0MDEgIzQwMTI3OiBBbGxvdyBib3RoIGJlZm9yZSBhbmQgYWZ0ZXIgZGVjb3JhdGlvbnMgb24gZW1wdHkgbGluZVxuXHR0ZXN0KCdpc3N1ZS0zNzQwMScsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICcnLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMCwgMyldKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uczogW1xuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oMSwgMSwgJ2JlZm9yZScsIElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSksXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbigxLCAxLCAnYWZ0ZXInLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlciksXG5cdFx0XHRdLFxuXHRcdFx0dGFiU2l6ZTogMixcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzExODc1OTogZW5hYmxlIG11bHRpcGxlIHRleHQgZWRpdG9yIGRlY29yYXRpb25zIGluIGVtcHR5IGxpbmVzXG5cdHRlc3QoJ2lzc3VlLTExODc1OScsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICcnLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMCwgMyldKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uczogW1xuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oMSwgMSwgJ2FmdGVyMScsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSxcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDEsIDEsICdhZnRlcjInLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlciksXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbigxLCAxLCAnYmVmb3JlMScsIElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSksXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbigxLCAxLCAnYmVmb3JlMicsIElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSksXG5cdFx0XHRdLFxuXHRcdFx0dGFiU2l6ZTogMixcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzM4OTM1OiBHaXRMZW5zIGVuZC1vZi1saW5lIGJsYW1lIG5vIGxvbmdlciByZW5kZXJpbmdcblx0dGVzdCgnaXNzdWUtMzg5MzUnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGxpbmVDb250ZW50OiAnXFx0fScsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCgyLCAzKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbigzLCAzLCAnY2VkLVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZTItNWU5YjliM2YtMyBjZWQtVGV4dEVkaXRvckRlY29yYXRpb25UeXBlMi0zJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKSxcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDMsIDMsICdjZWQtVGV4dEVkaXRvckRlY29yYXRpb25UeXBlMi01ZTliOWIzZi00IGNlZC1UZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUyLTQnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlciksXG5cdFx0XHRdLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDBcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMTM2NjIyOiBJbmxpbmUgZGVjb3JhdGlvbnMgYXJlIG5vdCByZW5kZXJpbmcgb24gbm9uLUFTQ0lJIGxpbmVzIHdoZW4gcmVuZGVyQ29udHJvbENoYXJhY3RlcnMgaXMgb25cblx0dGVzdCgnaXNzdWUtMTM2NjIyJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudDogJ3NvbWUgdGV4dCBcdTAwQTMnLFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDExLCAzKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbig1LCA1LCAnaW5saW5lRGVjMScsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSxcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDYsIDYsICdpbmxpbmVEZWMyJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKSxcblx0XHRcdF0sXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAxMDAwMCxcblx0XHRcdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzIyODMyOiBDb25zaWRlciBmdWxsd2lkdGggY2hhcmFjdGVycyB3aGVuIHJlbmRlcmluZyB0YWJzXG5cdHRlc3QoJ2lzc3VlLTIyODMyLTEnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGxpbmVDb250ZW50OiAnYXNkID0gXCJcdTY0RTZcIlxcdFxcdCNhc2QnLFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDE1LCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDBcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMjI4MzI6IENvbnNpZGVyIGZ1bGx3aWR0aCBjaGFyYWN0ZXJzIHdoZW4gcmVuZGVyaW5nIHRhYnMgKHJlbmRlciB3aGl0ZXNwYWNlKVxuXHR0ZXN0KCdpc3N1ZS0yMjgzMi0yJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudDogJ2FzZCA9IFwiXHU2NEU2XCJcXHRcXHQjYXNkJyxcblx0XHRcdGlzQmFzaWNBU0NJSTogZmFsc2UsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCgxNSwgMyldKSxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwLFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZTogJ2FsbCdcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMjIzNTI6IENPTUJJTklORyBBQ1VURSBBQ0NFTlQgKFUrMDMwMSlcblx0dGVzdCgnaXNzdWUtMjIzNTItMScsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICcxMjM0NTY4OTAxMjM0NTY3ODkwMTIzNDU2ODkwMTIzNDU2Nzg5MDEyMzQ1Njg5MGFiYVx1MDMwMWJhJyxcblx0XHRcdGlzQmFzaWNBU0NJSTogZmFsc2UsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCg1MywgMyldKSxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzIyMzUyOiBQYXJ0aWFsbHkgQnJva2VuIENvbXBsZXggU2NyaXB0IFJlbmRlcmluZyBvZiBUYW1pbFxuXHR0ZXN0KCdpc3N1ZS0yMjM1Mi0yJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudDogJyBKb3lTaGFyZVx1MEJCMlx1MEJDRCBcdTBCQUFcdTBCQkZcdTBCQTlcdTBCQ0RcdTBCQTRcdTBCQ0FcdTBCOUZcdTBCQjBcdTBCQ0RcdTBCQThcdTBCQ0RcdTBCQTRcdTBCQzEsIFx1MEJCNVx1MEJCRlx1MEI5Rlx1MEJDMFx1MEJBRlx1MEJDQiwgXHUwQjlDXHUwQkNCXHUwQjk1XHUwQkNEXHUwQjk1XHUwQkMxXHUwQjk1XHUwQkIzXHUwQkNELCBcdTBCODVcdTBCQTlcdTBCQkZcdTBCQUVcdTBCQzdcdTBCOUFcdTBCQTlcdTBCQ0QsIFx1MEJBOFx1MEI5NVx1MEJDOFx1MEI5QVx1MEJDRFx1MEI5QVx1MEJDMVx1MEJCNVx1MEJDOCBcdTBCQUFcdTBCOUZcdTBCOTlcdTBCQ0RcdTBCOTVcdTBCQjNcdTBCQ0QgXHUwQkFFXHUwQkIxXHUwQkNEXHUwQkIxXHUwQkMxXHUwQkFFXHUwQkNEIFx1MEI5QVx1MEJDNlx1MEJBRlx1MEJDRFx1MEJBNFx1MEJCRlx1MEI5NVx1MEJCM1x1MEJDOCBcdTBCQUFcdTBCQzZcdTBCQjFcdTBCQzFcdTBCQjVcdTBCQzBcdTBCQjBcdTBCQ0QnLFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDEwMCwgMyldKSxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzQyNzAwOiBIaW5kaSBjaGFyYWN0ZXJzIGFyZSBub3QgYmVpbmcgcmVuZGVyZWQgcHJvcGVybHlcblx0dGVzdCgnaXNzdWUtNDI3MDAnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGxpbmVDb250ZW50OiAnIFx1MDkzNVx1MDk0QiBcdTA5MTBcdTA5MzhcdTA5M0UgXHUwOTE1XHUwOTREXHUwOTJGXHUwOTNFIFx1MDkzOVx1MDk0OCBcdTA5MUNcdTA5NEIgXHUwOTM5XHUwOTJFXHUwOTNFXHUwOTMwXHUwOTQ3IFx1MDkwNVx1MDkwMlx1MDkyNlx1MDkzMCBcdTA5MkRcdTA5NDAgXHUwOTM5XHUwOTQ4IFx1MDkxNFx1MDkzMCBcdTA5MkNcdTA5M0VcdTA5MzlcdTA5MzAgXHUwOTJEXHUwOTQwIFx1MDkzOVx1MDk0OFx1MDk2NCBcdTA5MUNcdTA5M0ZcdTA5MzhcdTA5MTVcdTA5NDAgXHUwOTM1XHUwOTFDXHUwOTM5IFx1MDkzOFx1MDk0NyBcdTA5MzlcdTA5MkUgXHUwOTM4XHUwOTJDIFx1MDkzOVx1MDk0OFx1MDkwMlx1MDk2NCBcdTA5MUNcdTA5M0ZcdTA5MzhcdTA5MjhcdTA5NDcgXHUwOTA3XHUwOTM4IFx1MDkzOFx1MDk0M1x1MDkzN1x1MDk0RFx1MDkxRlx1MDkzRiBcdTA5MTVcdTA5NDAgXHUwOTMwXHUwOTFBXHUwOTI4XHUwOTNFIFx1MDkxNVx1MDk0MCBcdTA5MzlcdTA5NDhcdTA5NjQnLFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDEwNSwgMyldKSxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzM4MTIzOiBlZGl0b3IucmVuZGVyV2hpdGVzcGFjZTogXCJib3VuZGFyeVwiIHJlbmRlcnMgd2hpdGVzcGFjZSBhdCBsaW5lIHdyYXAgcG9pbnQgd2hlbiBsaW5lIGlzIHdyYXBwZWRcblx0dGVzdCgnaXNzdWUtMzgxMjMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudDogJ1RoaXMgaXMgYSBsb25nIGxpbmUgd2hpY2ggbmV2ZXIgdXNlcyBtb3JlIHRoYW4gdHdvIHNwYWNlcy4gJyxcblx0XHRcdGNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZTogdHJ1ZSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDU5LCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDAsXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnYm91bmRhcnknXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzMzNTI1OiBMb25nIGxpbmUgd2l0aCBsaWdhdHVyZXMgdGFrZXMgYSBsb25nIHRpbWUgdG8gcGFpbnQgZGVjb3JhdGlvbnNcblx0dGVzdCgnaXNzdWUtMzM1MjUtMScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0Y2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiBmYWxzZSxcblx0XHRcdGxpbmVDb250ZW50OiAnYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8gYXBwZW5kIGRhdGEgdG8nLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMTk0LCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDAsXG5cdFx0XHRmb250TGlnYXR1cmVzOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzMzNTI1OiBMb25nIGxpbmUgd2l0aCBsaWdhdHVyZXMgdGFrZXMgYSBsb25nIHRpbWUgdG8gcGFpbnQgZGVjb3JhdGlvbnMgLSBub3QgcG9zc2libGVcblx0dGVzdCgnaXNzdWUtMzM1MjUtMicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0Y2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiBmYWxzZSxcblx0XHRcdGxpbmVDb250ZW50OiAnYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvYXBwZW5kZGF0YXRvJyxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDE5NCwgMyldKSxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwLFxuXHRcdFx0Zm9udExpZ2F0dXJlczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICM5MTkzNjogU2VtYW50aWMgdG9rZW4gY29sb3IgaGlnaGxpZ2h0aW5nIGZhaWxzIG9uIGxpbmUgd2l0aCBzZWxlY3RlZCB0ZXh0XG5cdHRlc3QoJ2lzc3VlLTkxOTM2JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudDogJyAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoJHMgPSAwOCkgdGhlbiBcXCdcXFxcYlxcJycsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMjAsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDI0LCAxNSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMjUsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDI3LCAxNSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMjgsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDI5LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgyOSwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMzEsIDE2KSxcblx0XHRcdFx0Y3JlYXRlUGFydCgzMiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMzMsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDM0LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgzNiwgNiksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMzYsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDM3LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgzOCwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNDIsIDE1KSxcblx0XHRcdFx0Y3JlYXRlUGFydCg0MywgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNDcsIDExKVxuXHRcdFx0XSksXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAxMDAwMCxcblx0XHRcdHJlbmRlcldoaXRlc3BhY2U6ICdzZWxlY3Rpb24nLFxuXHRcdFx0c2VsZWN0aW9uc09uTGluZTogW25ldyBPZmZzZXRSYW5nZSgwLCA0NyldLFxuXHRcdFx0bWlkZG90V2lkdGg6IDExLFxuXHRcdFx0d3NtaWRkb3RXaWR0aDogMTFcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMTE5NDE2OiBEZWxldGUgQ29udHJvbCBDaGFyYWN0ZXIgKFUrMDA3RiAvICYjMTI3OykgZGlzcGxheWVkIGFzIHNwYWNlXG5cdHRlc3QoJ2lzc3VlLTExOTQxNicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0Y2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiBmYWxzZSxcblx0XHRcdGxpbmVDb250ZW50OiAnWycgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKDEyNykgKyAnXSBbJyArIFN0cmluZy5mcm9tQ2hhckNvZGUoMCkgKyAnXScsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCg3LCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDAsXG5cdFx0XHRyZW5kZXJDb250cm9sQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdGZvbnRMaWdhdHVyZXM6IHRydWVcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMTE2OTM5OiBJbXBvcnRhbnQgY29udHJvbCBjaGFyYWN0ZXJzIGFyZW4ndCByZW5kZXJlZFxuXHR0ZXN0KCdpc3N1ZS0xMTY5MzknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdzogZmFsc2UsXG5cdFx0XHRsaW5lQ29udGVudDogYHRyYW5zZmVyQmFsYW5jZSg1Njc4LCR7U3RyaW5nLmZyb21DaGFyQ29kZSgweDIwMkUpfTY3NzYsNDMyMSR7U3RyaW5nLmZyb21DaGFyQ29kZSgweDIwMkMpfSxcIlVTRFwiKTtgLFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDQyLCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDAsXG5cdFx0XHRyZW5kZXJDb250cm9sQ2hhcmFjdGVyczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMxMjQwMzg6IE11bHRpcGxlIGVuZC1vZi1saW5lIHRleHQgZGVjb3JhdGlvbnMgZ2V0IG1lcmdlZFxuXHR0ZXN0KCdpc3N1ZS0xMjQwMzgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRjYW5Vc2VIYWxmd2lkdGhSaWdodHdhcmRzQXJyb3c6IGZhbHNlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICcgICAgaWYnLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoNCwgMSksIGNyZWF0ZVBhcnQoNiwgMildKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uczogW1xuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oNywgNywgJ2NlZC0xLVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZTItMTdjMTRkOTgtMyBjZWQtMS1UZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUyLTMnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5CZWZvcmUpLFxuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oNywgNywgJ2NlZC0xLVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZTItMTdjMTRkOTgtNCBjZWQtMS1UZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUyLTQnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlciksXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbig3LCA3LCAnY2VkLWdob3N0LXRleHQtMS00JywgSW5saW5lRGVjb3JhdGlvblR5cGUuQWZ0ZXIpLFxuXHRcdFx0XSxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwLFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZTogJ2FsbCdcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVUZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldChsaW5lQ29udGVudDogc3RyaW5nLCB0YWJTaXplOiBudW1iZXIsIHBhcnRzOiBUZXN0TGluZVRva2VuW10sIGV4cGVjdGVkUGFydExlbmd0aHM6IG51bWJlcltdKTogKHBhcnRJbmRleDogbnVtYmVyLCBwYXJ0TGVuZ3RoOiBudW1iZXIsIG9mZnNldDogbnVtYmVyLCBleHBlY3RlZDogbnVtYmVyKSA9PiB2b2lkIHtcblx0XHRjb25zdCByZW5kZXJMaW5lT3V0cHV0ID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0dGFiU2l6ZSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKHBhcnRzKVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiAocGFydEluZGV4OiBudW1iZXIsIHBhcnRMZW5ndGg6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIsIGV4cGVjdGVkOiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IGFjdHVhbENvbHVtbiA9IHJlbmRlckxpbmVPdXRwdXQuY2hhcmFjdGVyTWFwcGluZy5nZXRDb2x1bW4obmV3IERvbVBvc2l0aW9uKHBhcnRJbmRleCwgb2Zmc2V0KSwgcGFydExlbmd0aCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsQ29sdW1uLCBleHBlY3RlZCwgJ2dldENvbHVtbiBmb3IgJyArIHBhcnRJbmRleCArICcsICcgKyBvZmZzZXQpO1xuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdnZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0IDEgLSBzaW1wbGUgdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCA9IGNyZWF0ZVRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KFxuXHRcdFx0J2hlbGxvIHdvcmxkJyxcblx0XHRcdDQsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTEsIDEpXG5cdFx0XHRdLFxuXHRcdFx0WzExXVxuXHRcdCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgMTEsIDAsIDEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDExLCAxLCAyKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAxMSwgMiwgMyk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgMTEsIDMsIDQpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDExLCA0LCA1KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAxMSwgNSwgNik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgMTEsIDYsIDcpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDExLCA3LCA4KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAxMSwgOCwgOSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgMTEsIDksIDEwKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAxMSwgMTAsIDExKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAxMSwgMTEsIDEyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCAyIC0gcmVndWxhciBKUycsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCA9IGNyZWF0ZVRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KFxuXHRcdFx0J3ZhciB4ID0gMzsnLFxuXHRcdFx0NCxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCgzLCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAyKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg1LCAzKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg4LCA0KSxcblx0XHRcdFx0Y3JlYXRlUGFydCg5LCA1KSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxMCwgNiksXG5cdFx0XHRdLFxuXHRcdFx0WzMsIDEsIDEsIDMsIDEsIDFdXG5cdFx0KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAzLCAwLCAxKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAzLCAxLCAyKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAzLCAyLCAzKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAzLCAzLCA0KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCAxLCAwLCA0KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCAxLCAxLCA1KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgyLCAxLCAwLCA1KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgyLCAxLCAxLCA2KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgzLCAzLCAwLCA2KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgzLCAzLCAxLCA3KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgzLCAzLCAyLCA4KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgzLCAzLCAzLCA5KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCg0LCAxLCAwLCA5KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCg0LCAxLCAxLCAxMCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoNSwgMSwgMCwgMTApO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDUsIDEsIDEsIDExKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCAzIC0gdGFiIHdpdGggdGFiIHNpemUgNicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCA9IGNyZWF0ZVRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KFxuXHRcdFx0J1xcdCcsXG5cdFx0XHQ2LFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDEsIDEpXG5cdFx0XHRdLFxuXHRcdFx0WzZdXG5cdFx0KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA2LCAwLCAxKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA2LCAxLCAxKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA2LCAyLCAxKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA2LCAzLCAxKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA2LCA0LCAyKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA2LCA1LCAyKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA2LCA2LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCA0IC0gb25jZSBpbmRlbnRlZCBsaW5lLCB0YWIgc2l6ZSA0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0ID0gY3JlYXRlVGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoXG5cdFx0XHQnXFx0ZnVuY3Rpb24nLFxuXHRcdFx0NCxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCgxLCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg5LCAyKSxcblx0XHRcdF0sXG5cdFx0XHRbNCwgOF1cblx0XHQpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDQsIDAsIDEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDQsIDEsIDEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDQsIDIsIDEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDQsIDMsIDIpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDQsIDQsIDIpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDAsIDIpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDEsIDMpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDIsIDQpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDMsIDUpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDQsIDYpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDUsIDcpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDYsIDgpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDcsIDkpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDgsIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCA1IC0gdHdpY2UgaW5kZW50ZWQgbGluZSwgdGFiIHNpemUgNCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCA9IGNyZWF0ZVRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KFxuXHRcdFx0J1xcdFxcdGZ1bmN0aW9uJyxcblx0XHRcdDQsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTAsIDIpLFxuXHRcdFx0XSxcblx0XHRcdFs4LCA4XVxuXHRcdCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgOCwgMCwgMSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgOCwgMSwgMSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgOCwgMiwgMSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgOCwgMywgMik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgOCwgNCwgMik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgOCwgNSwgMik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgOCwgNiwgMik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgOCwgNywgMyk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgOCwgOCwgMyk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgMCwgMyk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgMSwgNCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgMiwgNSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgMywgNik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgNCwgNyk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgNSwgOCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgNiwgOSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgNywgMTApO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDgsIDgsIDExKTtcblx0fSk7XG59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QUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFDeEMsa0NBQThCLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxFQUMxQyxDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUMzRSxVQUFNLGdDQUFnQztBQUFBLE1BQ3JDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxRQUNDLFdBQVcsR0FBRyxDQUFDO0FBQUEsUUFDZixXQUFXLElBQUksQ0FBQztBQUFBLE1BQ2pCO0FBQUEsTUFDQSxDQUFDLEdBQUcsQ0FBQztBQUFBLElBQ047QUFDQSxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUN6QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLEVBQzFDLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
