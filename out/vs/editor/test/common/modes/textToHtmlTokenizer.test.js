var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import assert from "assert";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FontStyle, MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { _tokenizeToString, tokenizeLineToHTML } from "../../../common/languages/textToHtmlTokenizer.js";
import { LanguageIdCodec } from "../../../common/services/languagesRegistry.js";
import { TestLineToken, TestLineTokens } from "../core/testLineToken.js";
import { createModelServices } from "../testTextModel.js";
suite("Editor Modes - textToHtmlTokenizer", () => {
  let disposables;
  let instantiationService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createModelServices(disposables);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function toStr(pieces) {
    const resultArr = pieces.map((t) => `<span class="${t.className}">${t.text}</span>`);
    return resultArr.join("");
  }
  test("TextToHtmlTokenizer 1", () => {
    const mode = disposables.add(instantiationService.createInstance(Mode));
    const support = TokenizationRegistry.get(mode.languageId);
    const actual = _tokenizeToString(".abc..def...gh", new LanguageIdCodec(), support);
    const expected = [
      { className: "mtk7", text: "." },
      { className: "mtk9", text: "abc" },
      { className: "mtk7", text: ".." },
      { className: "mtk9", text: "def" },
      { className: "mtk7", text: "..." },
      { className: "mtk9", text: "gh" }
    ];
    const expectedStr = `<div class="monaco-tokenized-source">${toStr(expected)}</div>`;
    assert.strictEqual(actual, expectedStr);
  });
  test("TextToHtmlTokenizer 2", () => {
    const mode = disposables.add(instantiationService.createInstance(Mode));
    const support = TokenizationRegistry.get(mode.languageId);
    const actual = _tokenizeToString(".abc..def...gh\n.abc..def...gh", new LanguageIdCodec(), support);
    const expected1 = [
      { className: "mtk7", text: "." },
      { className: "mtk9", text: "abc" },
      { className: "mtk7", text: ".." },
      { className: "mtk9", text: "def" },
      { className: "mtk7", text: "..." },
      { className: "mtk9", text: "gh" }
    ];
    const expected2 = [
      { className: "mtk7", text: "." },
      { className: "mtk9", text: "abc" },
      { className: "mtk7", text: ".." },
      { className: "mtk9", text: "def" },
      { className: "mtk7", text: "..." },
      { className: "mtk9", text: "gh" }
    ];
    const expectedStr1 = toStr(expected1);
    const expectedStr2 = toStr(expected2);
    const expectedStr = `<div class="monaco-tokenized-source">${expectedStr1}<br/>${expectedStr2}</div>`;
    assert.strictEqual(actual, expectedStr);
  });
  test("tokenizeLineToHTML", () => {
    const text = "Ciao hello world!";
    const lineTokens = new TestLineTokens([
      new TestLineToken(
        4,
        (3 << MetadataConsts.FOREGROUND_OFFSET | (FontStyle.Bold | FontStyle.Italic) << MetadataConsts.FONT_STYLE_OFFSET) >>> 0
      ),
      new TestLineToken(
        5,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        10,
        4 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        11,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        17,
        (5 << MetadataConsts.FOREGROUND_OFFSET | FontStyle.Underline << MetadataConsts.FONT_STYLE_OFFSET) >>> 0
      )
    ]);
    const colorMap = [null, "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff"];
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 17, 4, true),
      [
        "<div>",
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #0000ff;text-decoration: underline;">world!</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 12, 4, true),
      [
        "<div>",
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #0000ff;text-decoration: underline;">w</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 11, 4, true),
      [
        "<div>",
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 1, 11, 4, true),
      [
        "<div>",
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">iao</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 4, 11, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160;</span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 5, 11, 4, true),
      [
        "<div>",
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 5, 10, 4, true),
      [
        "<div>",
        '<span style="color: #00ff00;">hello</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 6, 9, 4, true),
      [
        "<div>",
        '<span style="color: #00ff00;">ell</span>',
        "</div>"
      ].join("")
    );
  });
  test("tokenizeLineToHTML handle spaces #35954", () => {
    const text = "  Ciao   hello world!";
    const lineTokens = new TestLineTokens([
      new TestLineToken(
        2,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        6,
        (3 << MetadataConsts.FOREGROUND_OFFSET | (FontStyle.Bold | FontStyle.Italic) << MetadataConsts.FONT_STYLE_OFFSET) >>> 0
      ),
      new TestLineToken(
        9,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        14,
        4 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        15,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        21,
        (5 << MetadataConsts.FOREGROUND_OFFSET | FontStyle.Underline << MetadataConsts.FONT_STYLE_OFFSET) >>> 0
      )
    ]);
    const colorMap = [null, "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff"];
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 21, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; </span>',
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> &#160; </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #0000ff;text-decoration: underline;">world!</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 17, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; </span>',
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> &#160; </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #0000ff;text-decoration: underline;">wo</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 3, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; </span>',
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">C</span>',
        "</div>"
      ].join("")
    );
  });
  test("tokenizeLineToHTML with tabs and non-zero startOffset #263387", () => {
    const colorMap = [null, "#000000", "#ffffff", "#ff0000", "#00ff00"];
    const text = "	a	b";
    const lineTokens = new TestLineTokens([
      new TestLineToken(
        1,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        2,
        3 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        3,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        4,
        4 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      )
    ]);
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 4, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; &#160; </span>',
        // First tab: 4 spaces
        '<span style="color: #ff0000;">a</span>',
        // 'a' at column 4
        '<span style="color: #000000;"> &#160; </span>',
        // Second tab: 3 spaces (column 5 to 8)
        '<span style="color: #00ff00;">b</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 2, 4, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; &#160;</span>',
        // With fix: 3 spaces; with bug: only 2 spaces
        '<span style="color: #00ff00;">b</span>',
        "</div>"
      ].join("")
    );
  });
});
let Mode = class extends Disposable {
  constructor(languageService) {
    super();
    this.languageId = "textToHtmlTokenizerMode";
    this._register(languageService.registerLanguage({ id: this.languageId }));
    this._register(TokenizationRegistry.register(this.languageId, {
      getInitialState: () => null,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        const tokensArr = [];
        let prevColor = -1;
        for (let i = 0; i < line.length; i++) {
          const colorId = line.charAt(i) === "." ? 7 : 9;
          if (prevColor !== colorId) {
            tokensArr.push(i);
            tokensArr.push(colorId << MetadataConsts.FOREGROUND_OFFSET >>> 0);
          }
          prevColor = colorId;
        }
        const tokens = new Uint32Array(tokensArr.length);
        for (let i = 0; i < tokens.length; i++) {
          tokens[i] = tokensArr[i];
        }
        return new EncodedTokenizationResult(tokens, [], null);
      }
    }));
  }
};
Mode = __decorateClass([
  __decorateParam(0, ILanguageService)
], Mode);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2Rlcy90ZXh0VG9IdG1sVG9rZW5pemVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb2xvcklkLCBGb250U3R5bGUsIE1ldGFkYXRhQ29uc3RzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCwgSVN0YXRlLCBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgX3Rva2VuaXplVG9TdHJpbmcsIHRva2VuaXplTGluZVRvSFRNTCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvdGV4dFRvSHRtbFRva2VuaXplci5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUlkQ29kZWMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGVzdExpbmVUb2tlbiwgVGVzdExpbmVUb2tlbnMgfSBmcm9tICcuLi9jb3JlL3Rlc3RMaW5lVG9rZW4uanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9kZWxTZXJ2aWNlcyB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuXG5zdWl0ZSgnRWRpdG9yIE1vZGVzIC0gdGV4dFRvSHRtbFRva2VuaXplcicsICgpID0+IHtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRvU3RyKHBpZWNlczogeyBjbGFzc05hbWU6IHN0cmluZzsgdGV4dDogc3RyaW5nIH1bXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0QXJyID0gcGllY2VzLm1hcCgodCkgPT4gYDxzcGFuIGNsYXNzPVwiJHt0LmNsYXNzTmFtZX1cIj4ke3QudGV4dH08L3NwYW4+YCk7XG5cdFx0cmV0dXJuIHJlc3VsdEFyci5qb2luKCcnKTtcblx0fVxuXG5cdHRlc3QoJ1RleHRUb0h0bWxUb2tlbml6ZXIgMScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGUpKTtcblx0XHRjb25zdCBzdXBwb3J0ID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0KG1vZGUubGFuZ3VhZ2VJZCkhO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gX3Rva2VuaXplVG9TdHJpbmcoJy5hYmMuLmRlZi4uLmdoJywgbmV3IExhbmd1YWdlSWRDb2RlYygpLCBzdXBwb3J0KTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrNycsIHRleHQ6ICcuJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs5JywgdGV4dDogJ2FiYycgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrNycsIHRleHQ6ICcuLicgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrOScsIHRleHQ6ICdkZWYnIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azcnLCB0ZXh0OiAnLi4uJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs5JywgdGV4dDogJ2doJyB9LFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWRTdHIgPSBgPGRpdiBjbGFzcz1cIm1vbmFjby10b2tlbml6ZWQtc291cmNlXCI+JHt0b1N0cihleHBlY3RlZCl9PC9kaXY+YDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkU3RyKTtcblx0fSk7XG5cblx0dGVzdCgnVGV4dFRvSHRtbFRva2VuaXplciAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGUgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZSkpO1xuXHRcdGNvbnN0IHN1cHBvcnQgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXQobW9kZS5sYW5ndWFnZUlkKSE7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBfdG9rZW5pemVUb1N0cmluZygnLmFiYy4uZGVmLi4uZ2hcXG4uYWJjLi5kZWYuLi5naCcsIG5ldyBMYW5ndWFnZUlkQ29kZWMoKSwgc3VwcG9ydCk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQxID0gW1xuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs3JywgdGV4dDogJy4nIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azknLCB0ZXh0OiAnYWJjJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs3JywgdGV4dDogJy4uJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs5JywgdGV4dDogJ2RlZicgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrNycsIHRleHQ6ICcuLi4nIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azknLCB0ZXh0OiAnZ2gnIH0sXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZDIgPSBbXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azcnLCB0ZXh0OiAnLicgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrOScsIHRleHQ6ICdhYmMnIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azcnLCB0ZXh0OiAnLi4nIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azknLCB0ZXh0OiAnZGVmJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs3JywgdGV4dDogJy4uLicgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrOScsIHRleHQ6ICdnaCcgfSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkU3RyMSA9IHRvU3RyKGV4cGVjdGVkMSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRTdHIyID0gdG9TdHIoZXhwZWN0ZWQyKTtcblx0XHRjb25zdCBleHBlY3RlZFN0ciA9IGA8ZGl2IGNsYXNzPVwibW9uYWNvLXRva2VuaXplZC1zb3VyY2VcIj4ke2V4cGVjdGVkU3RyMX08YnIvPiR7ZXhwZWN0ZWRTdHIyfTwvZGl2PmA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZFN0cik7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rva2VuaXplTGluZVRvSFRNTCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ0NpYW8gaGVsbG8gd29ybGQhJztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gbmV3IFRlc3RMaW5lVG9rZW5zKFtcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQ0LFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDMgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdFx0fCAoKEZvbnRTdHlsZS5Cb2xkIHwgRm9udFN0eWxlLkl0YWxpYykgPDwgTWV0YWRhdGFDb25zdHMuRk9OVF9TVFlMRV9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdCksXG5cdFx0XHRuZXcgVGVzdExpbmVUb2tlbihcblx0XHRcdFx0NSxcblx0XHRcdFx0KFxuXHRcdFx0XHRcdCgxIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0XHQpID4+PiAwXG5cdFx0XHQpLFxuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDEwLFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdCksXG5cdFx0XHRuZXcgVGVzdExpbmVUb2tlbihcblx0XHRcdFx0MTEsXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoMSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KSxcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQxNyxcblx0XHRcdFx0KFxuXHRcdFx0XHRcdCg1IDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0XHRcdHwgKChGb250U3R5bGUuVW5kZXJsaW5lKSA8PCBNZXRhZGF0YUNvbnN0cy5GT05UX1NUWUxFX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KVxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gW251bGwhLCAnIzAwMDAwMCcsICcjZmZmZmZmJywgJyNmZjAwMDAnLCAnIzAwZmYwMCcsICcjMDAwMGZmJ107XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDAsIDE3LCA0LCB0cnVlKSxcblx0XHRcdFtcblx0XHRcdFx0JzxkaXY+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICNmZjAwMDA7Zm9udC1zdHlsZTogaXRhbGljO2ZvbnQtd2VpZ2h0OiBib2xkO1wiPkNpYW88L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5oZWxsbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMGZmO3RleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1wiPndvcmxkITwvc3Bhbj4nLFxuXHRcdFx0XHQnPC9kaXY+J1xuXHRcdFx0XS5qb2luKCcnKVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDAsIDEyLCA0LCB0cnVlKSxcblx0XHRcdFtcblx0XHRcdFx0JzxkaXY+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICNmZjAwMDA7Zm9udC1zdHlsZTogaXRhbGljO2ZvbnQtd2VpZ2h0OiBib2xkO1wiPkNpYW88L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5oZWxsbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMGZmO3RleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1wiPnc8L3NwYW4+Jyxcblx0XHRcdFx0JzwvZGl2Pidcblx0XHRcdF0uam9pbignJylcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0dG9rZW5pemVMaW5lVG9IVE1MKHRleHQsIGxpbmVUb2tlbnMsIGNvbG9yTWFwLCAwLCAxMSwgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjZmYwMDAwO2ZvbnQtc3R5bGU6IGl0YWxpYztmb250LXdlaWdodDogYm9sZDtcIj5DaWFvPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiA8L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMGZmMDA7XCI+aGVsbG88L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPC9kaXY+J1xuXHRcdFx0XS5qb2luKCcnKVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDEsIDExLCA0LCB0cnVlKSxcblx0XHRcdFtcblx0XHRcdFx0JzxkaXY+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICNmZjAwMDA7Zm9udC1zdHlsZTogaXRhbGljO2ZvbnQtd2VpZ2h0OiBib2xkO1wiPmlhbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjAwO1wiPmhlbGxvPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiA8L3NwYW4+Jyxcblx0XHRcdFx0JzwvZGl2Pidcblx0XHRcdF0uam9pbignJylcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0dG9rZW5pemVMaW5lVG9IVE1MKHRleHQsIGxpbmVUb2tlbnMsIGNvbG9yTWFwLCA0LCAxMSwgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiYjMTYwOzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5oZWxsbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8L2Rpdj4nXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHRva2VuaXplTGluZVRvSFRNTCh0ZXh0LCBsaW5lVG9rZW5zLCBjb2xvck1hcCwgNSwgMTEsIDQsIHRydWUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPGRpdj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5oZWxsbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8L2Rpdj4nXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHRva2VuaXplTGluZVRvSFRNTCh0ZXh0LCBsaW5lVG9rZW5zLCBjb2xvck1hcCwgNSwgMTAsIDQsIHRydWUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPGRpdj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5oZWxsbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPC9kaXY+J1xuXHRcdFx0XS5qb2luKCcnKVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDYsIDksIDQsIHRydWUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPGRpdj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5lbGw8L3NwYW4+Jyxcblx0XHRcdFx0JzwvZGl2Pidcblx0XHRcdF0uam9pbignJylcblx0XHQpO1xuXHR9KTtcblx0dGVzdCgndG9rZW5pemVMaW5lVG9IVE1MIGhhbmRsZSBzcGFjZXMgIzM1OTU0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnICBDaWFvICAgaGVsbG8gd29ybGQhJztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gbmV3IFRlc3RMaW5lVG9rZW5zKFtcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQyLFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDEgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdCksXG5cdFx0XHRuZXcgVGVzdExpbmVUb2tlbihcblx0XHRcdFx0Nixcblx0XHRcdFx0KFxuXHRcdFx0XHRcdCgzIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0XHRcdHwgKChGb250U3R5bGUuQm9sZCB8IEZvbnRTdHlsZS5JdGFsaWMpIDw8IE1ldGFkYXRhQ29uc3RzLkZPTlRfU1RZTEVfT0ZGU0VUKVxuXHRcdFx0XHQpID4+PiAwXG5cdFx0XHQpLFxuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDksXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoMSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KSxcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQxNCxcblx0XHRcdFx0KFxuXHRcdFx0XHRcdCg0IDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0XHQpID4+PiAwXG5cdFx0XHQpLFxuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDE1LFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDEgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdCksXG5cdFx0XHRuZXcgVGVzdExpbmVUb2tlbihcblx0XHRcdFx0MjEsXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoNSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0XHR8ICgoRm9udFN0eWxlLlVuZGVybGluZSkgPDwgTWV0YWRhdGFDb25zdHMuRk9OVF9TVFlMRV9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdClcblx0XHRdKTtcblx0XHRjb25zdCBjb2xvck1hcCA9IFtudWxsISwgJyMwMDAwMDAnLCAnI2ZmZmZmZicsICcjZmYwMDAwJywgJyMwMGZmMDAnLCAnIzAwMDBmZiddO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0dG9rZW5pemVMaW5lVG9IVE1MKHRleHQsIGxpbmVUb2tlbnMsIGNvbG9yTWFwLCAwLCAyMSwgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiYjMTYwOyA8L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICNmZjAwMDA7Zm9udC1zdHlsZTogaXRhbGljO2ZvbnQtd2VpZ2h0OiBib2xkO1wiPkNpYW88L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+ICYjMTYwOyA8L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMGZmMDA7XCI+aGVsbG88L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDBmZjt0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTtcIj53b3JsZCE8L3NwYW4+Jyxcblx0XHRcdFx0JzwvZGl2Pidcblx0XHRcdF0uam9pbignJylcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0dG9rZW5pemVMaW5lVG9IVE1MKHRleHQsIGxpbmVUb2tlbnMsIGNvbG9yTWFwLCAwLCAxNywgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiYjMTYwOyA8L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICNmZjAwMDA7Zm9udC1zdHlsZTogaXRhbGljO2ZvbnQtd2VpZ2h0OiBib2xkO1wiPkNpYW88L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+ICYjMTYwOyA8L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMGZmMDA7XCI+aGVsbG88L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDBmZjt0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTtcIj53bzwvc3Bhbj4nLFxuXHRcdFx0XHQnPC9kaXY+J1xuXHRcdFx0XS5qb2luKCcnKVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDAsIDMsIDQsIHRydWUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPGRpdj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4mIzE2MDsgPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjZmYwMDAwO2ZvbnQtc3R5bGU6IGl0YWxpYztmb250LXdlaWdodDogYm9sZDtcIj5DPC9zcGFuPicsXG5cdFx0XHRcdCc8L2Rpdj4nXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndG9rZW5pemVMaW5lVG9IVE1MIHdpdGggdGFicyBhbmQgbm9uLXplcm8gc3RhcnRPZmZzZXQgIzI2MzM4NycsICgpID0+IHtcblx0XHQvLyBUaGlzIHRlc3QgZGVtb25zdHJhdGVzIHRoZSBpc3N1ZSB3aGVyZSB0YWIgcGFkZGluZyBpcyBjYWxjdWxhdGVkIGluY29ycmVjdGx5XG5cdFx0Ly8gd2hlbiBzdGFydE9mZnNldCBpcyBub24temVybyBhbmQgdGhlcmUgYXJlIHRhYnMgQUZURVIgdGhlIHN0YXJ0IHBvc2l0aW9uLlxuXHRcdC8vIFRoZSBidWc6IHRhYnNDaGFyRGVsdGEgZG9lc24ndCBhY2NvdW50IGZvciBjaGFyYWN0ZXJzIGJlZm9yZSBzdGFydE9mZnNldC5cblxuXHRcdGNvbnN0IGNvbG9yTWFwID0gW251bGwhLCAnIzAwMDAwMCcsICcjZmZmZmZmJywgJyNmZjAwMDAnLCAnIzAwZmYwMCddO1xuXG5cdFx0Ly8gQ3JpdGljYWwgdGVzdCBjYXNlOiBcIlxcdGFcXHRiXCIgc3RhcnRpbmcgYXQgcG9zaXRpb24gMiAoc2tpcHBpbmcgZmlyc3QgdGFiIGFuZCAnYScpXG5cdFx0Ly8gTGF5b3V0OiBGaXJzdCB0YWIgKHBvcyAwKSBnb2VzIHRvIGNvbHVtbiA0LCAnYScgKHBvcyAxKSBhdCBjb2x1bW4gNCxcblx0XHQvLyAgICAgICAgIHNlY29uZCB0YWIgKHBvcyAyKSBzaG91bGQgZ28gZnJvbSBjb2x1bW4gNSB0byBjb2x1bW4gOCAoMyBzcGFjZXMpXG5cdFx0Ly8gV2l0aCB0aGUgYnVnOiBjaGFySW5kZXggc3RhcnRzIGF0IDIsIHRhYnNDaGFyRGVsdGE9MCAoZmlyc3QgdGFiIHdhcyBuZXZlciBzZWVuKVxuXHRcdC8vICAgV2hlbiBwcm9jZXNzaW5nIHNlY29uZCB0YWI6IGluc2VydFNwYWNlc0NvdW50ID0gNCAtICgyICsgMCkgJSA0ID0gMiBzcGFjZXMgKFdST05HISlcblx0XHQvLyAgIFRoZSBvbGQgY29kZSB0aGlua3MgaXQncyBhdCBjb2x1bW4gMiwgYnV0IGl0J3MgYWN0dWFsbHkgYXQgY29sdW1uIDVcblx0XHRjb25zdCB0ZXh0ID0gJ1xcdGFcXHRiJztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gbmV3IFRlc3RMaW5lVG9rZW5zKFtcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQxLFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDEgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdCksXG5cdFx0XHRuZXcgVGVzdExpbmVUb2tlbihcblx0XHRcdFx0Mixcblx0XHRcdFx0KFxuXHRcdFx0XHRcdCgzIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0XHQpID4+PiAwXG5cdFx0XHQpLFxuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDMsXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoMSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KSxcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQ0LFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdClcblx0XHRdKTtcblxuXHRcdC8vIEZpcnN0LCB2ZXJpZnkgdGhlIGZ1bGwgbGluZSB3b3JrcyBjb3JyZWN0bHlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDAsIDQsIDQsIHRydWUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPGRpdj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4mIzE2MDsgJiMxNjA7IDwvc3Bhbj4nLCAvLyBGaXJzdCB0YWI6IDQgc3BhY2VzXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjZmYwMDAwO1wiPmE8L3NwYW4+JywgICAgICAgICAgICAgICAvLyAnYScgYXQgY29sdW1uIDRcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+ICYjMTYwOyA8L3NwYW4+JywgICAgICAgLy8gU2Vjb25kIHRhYjogMyBzcGFjZXMgKGNvbHVtbiA1IHRvIDgpXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjAwO1wiPmI8L3NwYW4+Jyxcblx0XHRcdFx0JzwvZGl2Pidcblx0XHRcdF0uam9pbignJylcblx0XHQpO1xuXG5cdFx0Ly8gVEhFIEJVRzogU3RhcnRpbmcgYXQgcG9zaXRpb24gMiAoYWZ0ZXIgZmlyc3QgdGFiIGFuZCAnYScpXG5cdFx0Ly8gRXhwZWN0ZWQgKHdpdGggZml4KTogMyBzcGFjZXMgZm9yIHRoZSBzZWNvbmQgdGFiIChjb2x1bW4gNSB0byA4KVxuXHRcdC8vIEJ1Z2d5IGJlaGF2aW9yIChvbGQgY29kZSk6IDIgc3BhY2VzICh0aGlua3MgaXQncyBhdCBjb2x1bW4gMiwgZ2l2ZXMgJiMxNjA7IClcblx0XHQvLyBUaGUgZml4IGNvcnJlY3RseSBhY2NvdW50cyBmb3IgdGhlIHNraXBwZWQgdGFiIGFuZCAnYScsIG91dHB1dHRpbmcgJiMxNjA7ICYjMTYwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHRva2VuaXplTGluZVRvSFRNTCh0ZXh0LCBsaW5lVG9rZW5zLCBjb2xvck1hcCwgMiwgNCwgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiYjMTYwOyAmIzE2MDs8L3NwYW4+JywgLy8gV2l0aCBmaXg6IDMgc3BhY2VzOyB3aXRoIGJ1Zzogb25seSAyIHNwYWNlc1xuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5iPC9zcGFuPicsXG5cdFx0XHRcdCc8L2Rpdj4nXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0KTtcblx0fSk7XG5cbn0pO1xuXG5jbGFzcyBNb2RlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQgPSAndGV4dFRvSHRtbFRva2VuaXplck1vZGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IHRoaXMubGFuZ3VhZ2VJZCB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIodGhpcy5sYW5ndWFnZUlkLCB7XG5cdFx0XHRnZXRJbml0aWFsU3RhdGU6ICgpOiBJU3RhdGUgPT4gbnVsbCEsXG5cdFx0XHR0b2tlbml6ZTogdW5kZWZpbmVkISxcblx0XHRcdHRva2VuaXplRW5jb2RlZDogKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogSVN0YXRlKTogRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCA9PiB7XG5cdFx0XHRcdGNvbnN0IHRva2Vuc0FycjogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0bGV0IHByZXZDb2xvciA9IC0xIGFzIENvbG9ySWQ7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGNvbG9ySWQgPSAobGluZS5jaGFyQXQoaSkgPT09ICcuJyA/IDcgOiA5KSBhcyBDb2xvcklkO1xuXHRcdFx0XHRcdGlmIChwcmV2Q29sb3IgIT09IGNvbG9ySWQpIHtcblx0XHRcdFx0XHRcdHRva2Vuc0Fyci5wdXNoKGkpO1xuXHRcdFx0XHRcdFx0dG9rZW5zQXJyLnB1c2goKFxuXHRcdFx0XHRcdFx0XHRjb2xvcklkIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUXG5cdFx0XHRcdFx0XHQpID4+PiAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHJldkNvbG9yID0gY29sb3JJZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheSh0b2tlbnNBcnIubGVuZ3RoKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHR0b2tlbnNbaV0gPSB0b2tlbnNBcnJbaV07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIG51bGwhKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBa0IsV0FBVyxzQkFBc0I7QUFDbkQsU0FBUywyQkFBbUMsNEJBQTRCO0FBQ3hFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CLDBCQUEwQjtBQUN0RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWUsc0JBQXNCO0FBQzlDLFNBQVMsMkJBQTJCO0FBR3BDLE1BQU0sc0NBQXNDLE1BQU07QUFFakQsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxrQkFBYyxJQUFJLGdCQUFnQjtBQUNsQywyQkFBdUIsb0JBQW9CLFdBQVc7QUFBQSxFQUN2RCxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksUUFBUTtBQUFBLEVBQ3JCLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsV0FBUyxNQUFNLFFBQXVEO0FBQ3JFLFVBQU0sWUFBWSxPQUFPLElBQUksQ0FBQyxNQUFNLGdCQUFnQixFQUFFLFNBQVMsS0FBSyxFQUFFLElBQUksU0FBUztBQUNuRixXQUFPLFVBQVUsS0FBSyxFQUFFO0FBQUEsRUFDekI7QUFFQSxPQUFLLHlCQUF5QixNQUFNO0FBQ25DLFVBQU0sT0FBTyxZQUFZLElBQUkscUJBQXFCLGVBQWUsSUFBSSxDQUFDO0FBQ3RFLFVBQU0sVUFBVSxxQkFBcUIsSUFBSSxLQUFLLFVBQVU7QUFFeEQsVUFBTSxTQUFTLGtCQUFrQixrQkFBa0IsSUFBSSxnQkFBZ0IsR0FBRyxPQUFPO0FBQ2pGLFVBQU0sV0FBVztBQUFBLE1BQ2hCLEVBQUUsV0FBVyxRQUFRLE1BQU0sSUFBSTtBQUFBLE1BQy9CLEVBQUUsV0FBVyxRQUFRLE1BQU0sTUFBTTtBQUFBLE1BQ2pDLEVBQUUsV0FBVyxRQUFRLE1BQU0sS0FBSztBQUFBLE1BQ2hDLEVBQUUsV0FBVyxRQUFRLE1BQU0sTUFBTTtBQUFBLE1BQ2pDLEVBQUUsV0FBVyxRQUFRLE1BQU0sTUFBTTtBQUFBLE1BQ2pDLEVBQUUsV0FBVyxRQUFRLE1BQU0sS0FBSztBQUFBLElBQ2pDO0FBQ0EsVUFBTSxjQUFjLHdDQUF3QyxNQUFNLFFBQVEsQ0FBQztBQUUzRSxXQUFPLFlBQVksUUFBUSxXQUFXO0FBQUEsRUFDdkMsQ0FBQztBQUVELE9BQUsseUJBQXlCLE1BQU07QUFDbkMsVUFBTSxPQUFPLFlBQVksSUFBSSxxQkFBcUIsZUFBZSxJQUFJLENBQUM7QUFDdEUsVUFBTSxVQUFVLHFCQUFxQixJQUFJLEtBQUssVUFBVTtBQUV4RCxVQUFNLFNBQVMsa0JBQWtCLGtDQUFrQyxJQUFJLGdCQUFnQixHQUFHLE9BQU87QUFDakcsVUFBTSxZQUFZO0FBQUEsTUFDakIsRUFBRSxXQUFXLFFBQVEsTUFBTSxJQUFJO0FBQUEsTUFDL0IsRUFBRSxXQUFXLFFBQVEsTUFBTSxNQUFNO0FBQUEsTUFDakMsRUFBRSxXQUFXLFFBQVEsTUFBTSxLQUFLO0FBQUEsTUFDaEMsRUFBRSxXQUFXLFFBQVEsTUFBTSxNQUFNO0FBQUEsTUFDakMsRUFBRSxXQUFXLFFBQVEsTUFBTSxNQUFNO0FBQUEsTUFDakMsRUFBRSxXQUFXLFFBQVEsTUFBTSxLQUFLO0FBQUEsSUFDakM7QUFDQSxVQUFNLFlBQVk7QUFBQSxNQUNqQixFQUFFLFdBQVcsUUFBUSxNQUFNLElBQUk7QUFBQSxNQUMvQixFQUFFLFdBQVcsUUFBUSxNQUFNLE1BQU07QUFBQSxNQUNqQyxFQUFFLFdBQVcsUUFBUSxNQUFNLEtBQUs7QUFBQSxNQUNoQyxFQUFFLFdBQVcsUUFBUSxNQUFNLE1BQU07QUFBQSxNQUNqQyxFQUFFLFdBQVcsUUFBUSxNQUFNLE1BQU07QUFBQSxNQUNqQyxFQUFFLFdBQVcsUUFBUSxNQUFNLEtBQUs7QUFBQSxJQUNqQztBQUNBLFVBQU0sZUFBZSxNQUFNLFNBQVM7QUFDcEMsVUFBTSxlQUFlLE1BQU0sU0FBUztBQUNwQyxVQUFNLGNBQWMsd0NBQXdDLFlBQVksUUFBUSxZQUFZO0FBRTVGLFdBQU8sWUFBWSxRQUFRLFdBQVc7QUFBQSxFQUN2QyxDQUFDO0FBRUQsT0FBSyxzQkFBc0IsTUFBTTtBQUNoQyxVQUFNLE9BQU87QUFDYixVQUFNLGFBQWEsSUFBSSxlQUFlO0FBQUEsTUFDckMsSUFBSTtBQUFBLFFBQ0g7QUFBQSxTQUVFLEtBQUssZUFBZSxxQkFDakIsVUFBVSxPQUFPLFVBQVUsV0FBVyxlQUFlLHVCQUNwRDtBQUFBLE1BQ1A7QUFBQSxNQUNBLElBQUk7QUFBQSxRQUNIO0FBQUEsUUFFRSxLQUFLLGVBQWUsc0JBQ2hCO0FBQUEsTUFDUDtBQUFBLE1BQ0EsSUFBSTtBQUFBLFFBQ0g7QUFBQSxRQUVFLEtBQUssZUFBZSxzQkFDaEI7QUFBQSxNQUNQO0FBQUEsTUFDQSxJQUFJO0FBQUEsUUFDSDtBQUFBLFFBRUUsS0FBSyxlQUFlLHNCQUNoQjtBQUFBLE1BQ1A7QUFBQSxNQUNBLElBQUk7QUFBQSxRQUNIO0FBQUEsU0FFRSxLQUFLLGVBQWUsb0JBQ2pCLFVBQVUsYUFBYyxlQUFlLHVCQUN0QztBQUFBLE1BQ1A7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFdBQVcsQ0FBQyxNQUFPLFdBQVcsV0FBVyxXQUFXLFdBQVcsU0FBUztBQUU5RSxXQUFPO0FBQUEsTUFDTixtQkFBbUIsTUFBTSxZQUFZLFVBQVUsR0FBRyxJQUFJLEdBQUcsSUFBSTtBQUFBLE1BQzdEO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWO0FBRUEsV0FBTztBQUFBLE1BQ04sbUJBQW1CLE1BQU0sWUFBWSxVQUFVLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFBQSxNQUM3RDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxFQUFFO0FBQUEsSUFDVjtBQUVBLFdBQU87QUFBQSxNQUNOLG1CQUFtQixNQUFNLFlBQVksVUFBVSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQUEsTUFDN0Q7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxFQUFFO0FBQUEsSUFDVjtBQUVBLFdBQU87QUFBQSxNQUNOLG1CQUFtQixNQUFNLFlBQVksVUFBVSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQUEsTUFDN0Q7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxFQUFFO0FBQUEsSUFDVjtBQUVBLFdBQU87QUFBQSxNQUNOLG1CQUFtQixNQUFNLFlBQVksVUFBVSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQUEsTUFDN0Q7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWO0FBRUEsV0FBTztBQUFBLE1BQ04sbUJBQW1CLE1BQU0sWUFBWSxVQUFVLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFBQSxNQUM3RDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxFQUFFO0FBQUEsSUFDVjtBQUVBLFdBQU87QUFBQSxNQUNOLG1CQUFtQixNQUFNLFlBQVksVUFBVSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQUEsTUFDN0Q7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxFQUFFO0FBQUEsSUFDVjtBQUVBLFdBQU87QUFBQSxNQUNOLG1CQUFtQixNQUFNLFlBQVksVUFBVSxHQUFHLEdBQUcsR0FBRyxJQUFJO0FBQUEsTUFDNUQ7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVB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
