import assert from "assert";
import { MarkdownString } from "../../common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { URI } from "../../common/uri.js";
suite("MarkdownString", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Escape leading whitespace", function() {
    const mds = new MarkdownString();
    mds.appendText("Hello\n    Not a code block");
    assert.strictEqual(mds.value, "Hello\n\n&nbsp;&nbsp;&nbsp;&nbsp;Not&nbsp;a&nbsp;code&nbsp;block");
  });
  test("MarkdownString.appendText doesn't escape quote #109040", function() {
    const mds = new MarkdownString();
    mds.appendText("> Text\n>More");
    assert.strictEqual(mds.value, "\\>&nbsp;Text\n\n\\>More");
  });
  test("appendText", () => {
    const mds = new MarkdownString();
    mds.appendText("# foo\n*bar*");
    assert.strictEqual(mds.value, "\\#&nbsp;foo\n\n\\*bar\\*");
  });
  test("appendLink", function() {
    function assertLink(target, label, title, expected) {
      const mds = new MarkdownString();
      mds.appendLink(target, label, title);
      assert.strictEqual(mds.value, expected);
    }
    assertLink(
      "https://example.com\\()![](file:///Users/jrieken/Code/_samples/devfest/foo/img.png)",
      "hello",
      void 0,
      "[hello](https://example.com\\(\\)![](file:///Users/jrieken/Code/_samples/devfest/foo/img.png\\))"
    );
    assertLink(
      "https://example.com",
      "hello",
      "title",
      '[hello](https://example.com "title")'
    );
    assertLink(
      "foo)",
      "hello]",
      void 0,
      "[hello\\]](foo\\))"
    );
    assertLink(
      "foo\\)",
      "hello]",
      void 0,
      "[hello\\]](foo\\))"
    );
    assertLink(
      "fo)o",
      "hell]o",
      void 0,
      "[hell\\]o](fo\\)o)"
    );
    assertLink(
      "foo)",
      "hello]",
      'title"',
      '[hello\\]](foo\\) "title\\"")'
    );
  });
  test("lift", () => {
    const dto = {
      value: "hello",
      baseUri: URI.file("/foo/bar"),
      supportThemeIcons: true,
      isTrusted: true,
      supportHtml: true,
      uris: {
        [URI.file("/foo/bar2").toString()]: URI.file("/foo/bar2"),
        [URI.file("/foo/bar3").toString()]: URI.file("/foo/bar3")
      }
    };
    const mds = MarkdownString.lift(dto);
    assert.strictEqual(mds.value, dto.value);
    assert.strictEqual(mds.baseUri?.toString(), dto.baseUri?.toString());
    assert.strictEqual(mds.supportThemeIcons, dto.supportThemeIcons);
    assert.strictEqual(mds.isTrusted, dto.isTrusted);
    assert.strictEqual(mds.supportHtml, dto.supportHtml);
    assert.deepStrictEqual(mds.uris, dto.uris);
  });
  test("lift returns new instance", () => {
    const instance = new MarkdownString("hello");
    const mds2 = MarkdownString.lift(instance).appendText("world");
    assert.strictEqual(mds2.value, "helloworld");
    assert.strictEqual(instance.value, "hello");
  });
  suite("appendCodeBlock", () => {
    function assertCodeBlock(lang, code, result) {
      const mds = new MarkdownString();
      mds.appendCodeblock(lang, code);
      assert.strictEqual(mds.value, result);
    }
    test("common cases", () => {
      assertCodeBlock("ts", "const a = 1;", `
${[
        "```ts",
        "const a = 1;",
        "```"
      ].join("\n")}
`);
      assertCodeBlock("ts", "const a = `1`;", `
${[
        "```ts",
        "const a = `1`;",
        "```"
      ].join("\n")}
`);
    });
    test("escape fence", () => {
      assertCodeBlock("md", "```\n```", `
${[
        "````md",
        "```\n```",
        "````"
      ].join("\n")}
`);
      assertCodeBlock("md", "\n\n```\n```", `
${[
        "````md",
        "\n\n```\n```",
        "````"
      ].join("\n")}
`);
      assertCodeBlock("md", "```\n```\n````\n````", `
${[
        "`````md",
        "```\n```\n````\n````",
        "`````"
      ].join("\n")}
`);
    });
  });
  suite("ThemeIcons", () => {
    suite("Support On", () => {
      test("appendText", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: true });
        mds.appendText("$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "\\\\$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;\\\\$\\(add\\)");
      });
      test("appendMarkdown", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: true });
        mds.appendMarkdown("$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "$(zap) $(not a theme icon) $(add)");
      });
      test("appendMarkdown with escaped icon", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: true });
        mds.appendMarkdown("\\$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "\\$(zap) $(not a theme icon) $(add)");
      });
    });
    suite("Support Off", () => {
      test("appendText", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: false });
        mds.appendText("$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;$\\(add\\)");
      });
      test("appendMarkdown", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: false });
        mds.appendMarkdown("$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "$(zap) $(not a theme icon) $(add)");
      });
      test("appendMarkdown with escaped icon", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: true });
        mds.appendMarkdown("\\$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "\\$(zap) $(not a theme icon) $(add)");
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vbWFya2Rvd25TdHJpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vdXJpLmpzJztcblxuc3VpdGUoJ01hcmtkb3duU3RyaW5nJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0VzY2FwZSBsZWFkaW5nIHdoaXRlc3BhY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0bWRzLmFwcGVuZFRleHQoJ0hlbGxvXFxuICAgIE5vdCBhIGNvZGUgYmxvY2snKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnZhbHVlLCAnSGVsbG9cXG5cXG4mbmJzcDsmbmJzcDsmbmJzcDsmbmJzcDtOb3QmbmJzcDthJm5ic3A7Y29kZSZuYnNwO2Jsb2NrJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ01hcmtkb3duU3RyaW5nLmFwcGVuZFRleHQgZG9lc25cXCd0IGVzY2FwZSBxdW90ZSAjMTA5MDQwJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdG1kcy5hcHBlbmRUZXh0KCc+IFRleHRcXG4+TW9yZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMudmFsdWUsICdcXFxcPiZuYnNwO1RleHRcXG5cXG5cXFxcPk1vcmUnKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kVGV4dCcsICgpID0+IHtcblxuXHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdG1kcy5hcHBlbmRUZXh0KCcjIGZvb1xcbipiYXIqJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnZhbHVlLCAnXFxcXCMmbmJzcDtmb29cXG5cXG5cXFxcKmJhclxcXFwqJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZExpbmsnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRMaW5rKHRhcmdldDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBleHBlY3RlZDogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRcdG1kcy5hcHBlbmRMaW5rKHRhcmdldCwgbGFiZWwsIHRpdGxlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMudmFsdWUsIGV4cGVjdGVkKTtcblx0XHR9XG5cblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb21cXFxcKCkhW10oZmlsZTovLy9Vc2Vycy9qcmlla2VuL0NvZGUvX3NhbXBsZXMvZGV2ZmVzdC9mb28vaW1nLnBuZyknLCAnaGVsbG8nLCB1bmRlZmluZWQsXG5cdFx0XHQnW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tXFxcXChcXFxcKSFbXShmaWxlOi8vL1VzZXJzL2pyaWVrZW4vQ29kZS9fc2FtcGxlcy9kZXZmZXN0L2Zvby9pbWcucG5nXFxcXCkpJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tJywgJ2hlbGxvJywgJ3RpdGxlJyxcblx0XHRcdCdbaGVsbG9dKGh0dHBzOi8vZXhhbXBsZS5jb20gXCJ0aXRsZVwiKSdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnZm9vKScsICdoZWxsb10nLCB1bmRlZmluZWQsXG5cdFx0XHQnW2hlbGxvXFxcXF1dKGZvb1xcXFwpKSdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnZm9vXFxcXCknLCAnaGVsbG9dJywgdW5kZWZpbmVkLFxuXHRcdFx0J1toZWxsb1xcXFxdXShmb29cXFxcKSknXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2ZvKW8nLCAnaGVsbF1vJywgdW5kZWZpbmVkLFxuXHRcdFx0J1toZWxsXFxcXF1vXShmb1xcXFwpbyknXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2ZvbyknLCAnaGVsbG9dJywgJ3RpdGxlXCInLFxuXHRcdFx0J1toZWxsb1xcXFxdXShmb29cXFxcKSBcInRpdGxlXFxcXFwiXCIpJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpZnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHRvOiBJTWFya2Rvd25TdHJpbmcgPSB7XG5cdFx0XHR2YWx1ZTogJ2hlbGxvJyxcblx0XHRcdGJhc2VVcmk6IFVSSS5maWxlKCcvZm9vL2JhcicpLFxuXHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsXG5cdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRzdXBwb3J0SHRtbDogdHJ1ZSxcblx0XHRcdHVyaXM6IHtcblx0XHRcdFx0W1VSSS5maWxlKCcvZm9vL2JhcjInKS50b1N0cmluZygpXTogVVJJLmZpbGUoJy9mb28vYmFyMicpLFxuXHRcdFx0XHRbVVJJLmZpbGUoJy9mb28vYmFyMycpLnRvU3RyaW5nKCldOiBVUkkuZmlsZSgnL2Zvby9iYXIzJylcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IG1kcyA9IE1hcmtkb3duU3RyaW5nLmxpZnQoZHRvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnZhbHVlLCBkdG8udmFsdWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMuYmFzZVVyaT8udG9TdHJpbmcoKSwgZHRvLmJhc2VVcmk/LnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMuc3VwcG9ydFRoZW1lSWNvbnMsIGR0by5zdXBwb3J0VGhlbWVJY29ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy5pc1RydXN0ZWQsIGR0by5pc1RydXN0ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMuc3VwcG9ydEh0bWwsIGR0by5zdXBwb3J0SHRtbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZHMudXJpcywgZHRvLnVyaXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaWZ0IHJldHVybnMgbmV3IGluc3RhbmNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gbmV3IE1hcmtkb3duU3RyaW5nKCdoZWxsbycpO1xuXHRcdGNvbnN0IG1kczIgPSBNYXJrZG93blN0cmluZy5saWZ0KGluc3RhbmNlKS5hcHBlbmRUZXh0KCd3b3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMyLnZhbHVlLCAnaGVsbG93b3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0YW5jZS52YWx1ZSwgJ2hlbGxvJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhcHBlbmRDb2RlQmxvY2snLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gYXNzZXJ0Q29kZUJsb2NrKGxhbmc6IHN0cmluZywgY29kZTogc3RyaW5nLCByZXN1bHQ6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0XHRtZHMuYXBwZW5kQ29kZWJsb2NrKGxhbmcsIGNvZGUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy52YWx1ZSwgcmVzdWx0KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdjb21tb24gY2FzZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBubyBiYWNrdGlja3Ncblx0XHRcdGFzc2VydENvZGVCbG9jaygndHMnLCAnY29uc3QgYSA9IDE7JywgYFxcbiR7W1xuXHRcdFx0XHQnYGBgdHMnLFxuXHRcdFx0XHQnY29uc3QgYSA9IDE7Jyxcblx0XHRcdFx0J2BgYCdcblx0XHRcdF0uam9pbignXFxuJyl9XFxuYCk7XG5cdFx0XHQvLyBiYWNrdGlja3Ncblx0XHRcdGFzc2VydENvZGVCbG9jaygndHMnLCAnY29uc3QgYSA9IGAxYDsnLCBgXFxuJHtbXG5cdFx0XHRcdCdgYGB0cycsXG5cdFx0XHRcdCdjb25zdCBhID0gYDFgOycsXG5cdFx0XHRcdCdgYGAnXG5cdFx0XHRdLmpvaW4oJ1xcbicpfVxcbmApO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTkzNzQ2XG5cdFx0dGVzdCgnZXNjYXBlIGZlbmNlJywgKCkgPT4ge1xuXHRcdFx0Ly8gZmVuY2UgaW4gdGhlIGZpcnN0IGxpbmVcblx0XHRcdGFzc2VydENvZGVCbG9jaygnbWQnLCAnYGBgXFxuYGBgJywgYFxcbiR7W1xuXHRcdFx0XHQnYGBgYG1kJyxcblx0XHRcdFx0J2BgYFxcbmBgYCcsXG5cdFx0XHRcdCdgYGBgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKX1cXG5gKTtcblx0XHRcdC8vIGZlbmNlIGluIHRoZSBtaWRkbGUgb2YgY29kZVxuXHRcdFx0YXNzZXJ0Q29kZUJsb2NrKCdtZCcsICdcXG5cXG5gYGBcXG5gYGAnLCBgXFxuJHtbXG5cdFx0XHRcdCdgYGBgbWQnLFxuXHRcdFx0XHQnXFxuXFxuYGBgXFxuYGBgJyxcblx0XHRcdFx0J2BgYGAnXG5cdFx0XHRdLmpvaW4oJ1xcbicpfVxcbmApO1xuXHRcdFx0Ly8gbG9uZ2VyIGZlbmNlIGF0IHRoZSBlbmQgb2YgY29kZVxuXHRcdFx0YXNzZXJ0Q29kZUJsb2NrKCdtZCcsICdgYGBcXG5gYGBcXG5gYGBgXFxuYGBgYCcsIGBcXG4ke1tcblx0XHRcdFx0J2BgYGBgbWQnLFxuXHRcdFx0XHQnYGBgXFxuYGBgXFxuYGBgYFxcbmBgYGAnLFxuXHRcdFx0XHQnYGBgYGAnXG5cdFx0XHRdLmpvaW4oJ1xcbicpfVxcbmApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVGhlbWVJY29ucycsICgpID0+IHtcblxuXHRcdHN1aXRlKCdTdXBwb3J0IE9uJywgKCkgPT4ge1xuXG5cdFx0XHR0ZXN0KCdhcHBlbmRUZXh0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0XHRtZHMuYXBwZW5kVGV4dCgnJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy52YWx1ZSwgJ1xcXFxcXFxcJFxcXFwoemFwXFxcXCkmbmJzcDskXFxcXChub3QmbmJzcDthJm5ic3A7dGhlbWUmbmJzcDtpY29uXFxcXCkmbmJzcDtcXFxcXFxcXCRcXFxcKGFkZFxcXFwpJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnYXBwZW5kTWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bignJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy52YWx1ZSwgJyQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2FwcGVuZE1hcmtkb3duIHdpdGggZXNjYXBlZCBpY29uJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oJ1xcXFwkKHphcCkgJChub3QgYSB0aGVtZSBpY29uKSAkKGFkZCknKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnZhbHVlLCAnXFxcXCQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXHRcdFx0fSk7XG5cblx0XHR9KTtcblxuXHRcdHN1aXRlKCdTdXBwb3J0IE9mZicsICgpID0+IHtcblxuXHRcdFx0dGVzdCgnYXBwZW5kVGV4dCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogZmFsc2UgfSk7XG5cdFx0XHRcdG1kcy5hcHBlbmRUZXh0KCckKHphcCkgJChub3QgYSB0aGVtZSBpY29uKSAkKGFkZCknKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnZhbHVlLCAnJFxcXFwoemFwXFxcXCkmbmJzcDskXFxcXChub3QmbmJzcDthJm5ic3A7dGhlbWUmbmJzcDtpY29uXFxcXCkmbmJzcDskXFxcXChhZGRcXFxcKScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2FwcGVuZE1hcmtkb3duJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiBmYWxzZSB9KTtcblx0XHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKCckKHphcCkgJChub3QgYSB0aGVtZSBpY29uKSAkKGFkZCknKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnZhbHVlLCAnJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnYXBwZW5kTWFya2Rvd24gd2l0aCBlc2NhcGVkIGljb24nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bignXFxcXCQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMudmFsdWUsICdcXFxcJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cdFx0XHR9KTtcblxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLFdBQVc7QUFFcEIsTUFBTSxrQkFBa0IsTUFBTTtBQUU3QiwwQ0FBd0M7QUFFeEMsT0FBSyw2QkFBNkIsV0FBWTtBQUM3QyxVQUFNLE1BQU0sSUFBSSxlQUFlO0FBQy9CLFFBQUksV0FBVyw2QkFBNkI7QUFDNUMsV0FBTyxZQUFZLElBQUksT0FBTyxrRUFBa0U7QUFBQSxFQUNqRyxDQUFDO0FBRUQsT0FBSywwREFBMkQsV0FBWTtBQUMzRSxVQUFNLE1BQU0sSUFBSSxlQUFlO0FBQy9CLFFBQUksV0FBVyxlQUFlO0FBQzlCLFdBQU8sWUFBWSxJQUFJLE9BQU8sMEJBQTBCO0FBQUEsRUFDekQsQ0FBQztBQUVELE9BQUssY0FBYyxNQUFNO0FBRXhCLFVBQU0sTUFBTSxJQUFJLGVBQWU7QUFDL0IsUUFBSSxXQUFXLGNBQWM7QUFFN0IsV0FBTyxZQUFZLElBQUksT0FBTywyQkFBMkI7QUFBQSxFQUMxRCxDQUFDO0FBRUQsT0FBSyxjQUFjLFdBQVk7QUFFOUIsYUFBUyxXQUFXLFFBQWdCLE9BQWUsT0FBMkIsVUFBa0I7QUFDL0YsWUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFJLFdBQVcsUUFBUSxPQUFPLEtBQUs7QUFDbkMsYUFBTyxZQUFZLElBQUksT0FBTyxRQUFRO0FBQUEsSUFDdkM7QUFFQTtBQUFBLE1BQ0M7QUFBQSxNQUF1RjtBQUFBLE1BQVM7QUFBQSxNQUNoRztBQUFBLElBQ0Q7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUF1QjtBQUFBLE1BQVM7QUFBQSxNQUNoQztBQUFBLElBQ0Q7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUFRO0FBQUEsTUFBVTtBQUFBLE1BQ2xCO0FBQUEsSUFDRDtBQUNBO0FBQUEsTUFDQztBQUFBLE1BQVU7QUFBQSxNQUFVO0FBQUEsTUFDcEI7QUFBQSxJQUNEO0FBQ0E7QUFBQSxNQUNDO0FBQUEsTUFBUTtBQUFBLE1BQVU7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFDQTtBQUFBLE1BQ0M7QUFBQSxNQUFRO0FBQUEsTUFBVTtBQUFBLE1BQ2xCO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssUUFBUSxNQUFNO0FBQ2xCLFVBQU0sTUFBdUI7QUFBQSxNQUM1QixPQUFPO0FBQUEsTUFDUCxTQUFTLElBQUksS0FBSyxVQUFVO0FBQUEsTUFDNUIsbUJBQW1CO0FBQUEsTUFDbkIsV0FBVztBQUFBLE1BQ1gsYUFBYTtBQUFBLE1BQ2IsTUFBTTtBQUFBLFFBQ0wsQ0FBQyxJQUFJLEtBQUssV0FBVyxFQUFFLFNBQVMsQ0FBQyxHQUFHLElBQUksS0FBSyxXQUFXO0FBQUEsUUFDeEQsQ0FBQyxJQUFJLEtBQUssV0FBVyxFQUFFLFNBQVMsQ0FBQyxHQUFHLElBQUksS0FBSyxXQUFXO0FBQUEsTUFDekQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxNQUFNLGVBQWUsS0FBSyxHQUFHO0FBQ25DLFdBQU8sWUFBWSxJQUFJLE9BQU8sSUFBSSxLQUFLO0FBQ3ZDLFdBQU8sWUFBWSxJQUFJLFNBQVMsU0FBUyxHQUFHLElBQUksU0FBUyxTQUFTLENBQUM7QUFDbkUsV0FBTyxZQUFZLElBQUksbUJBQW1CLElBQUksaUJBQWlCO0FBQy9ELFdBQU8sWUFBWSxJQUFJLFdBQVcsSUFBSSxTQUFTO0FBQy9DLFdBQU8sWUFBWSxJQUFJLGFBQWEsSUFBSSxXQUFXO0FBQ25ELFdBQU8sZ0JBQWdCLElBQUksTUFBTSxJQUFJLElBQUk7QUFBQSxFQUMxQyxDQUFDO0FBRUQsT0FBSyw2QkFBNkIsTUFBTTtBQUN2QyxVQUFNLFdBQVcsSUFBSSxlQUFlLE9BQU87QUFDM0MsVUFBTSxPQUFPLGVBQWUsS0FBSyxRQUFRLEVBQUUsV0FBVyxPQUFPO0FBQzdELFdBQU8sWUFBWSxLQUFLLE9BQU8sWUFBWTtBQUMzQyxXQUFPLFlBQVksU0FBUyxPQUFPLE9BQU87QUFBQSxFQUMzQyxDQUFDO0FBRUQsUUFBTSxtQkFBbUIsTUFBTTtBQUM5QixhQUFTLGdCQUFnQixNQUFjLE1BQWMsUUFBZ0I7QUFDcEUsWUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFJLGdCQUFnQixNQUFNLElBQUk7QUFDOUIsYUFBTyxZQUFZLElBQUksT0FBTyxNQUFNO0FBQUEsSUFDckM7QUFFQSxTQUFLLGdCQUFnQixNQUFNO0FBRTFCLHNCQUFnQixNQUFNLGdCQUFnQjtBQUFBLEVBQUs7QUFBQSxRQUMxQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsQ0FBSTtBQUVoQixzQkFBZ0IsTUFBTSxrQkFBa0I7QUFBQSxFQUFLO0FBQUEsUUFDNUM7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUksQ0FBQztBQUFBLENBQUk7QUFBQSxJQUNqQixDQUFDO0FBR0QsU0FBSyxnQkFBZ0IsTUFBTTtBQUUxQixzQkFBZ0IsTUFBTSxZQUFZO0FBQUEsRUFBSztBQUFBLFFBQ3RDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxDQUFJO0FBRWhCLHNCQUFnQixNQUFNLGdCQUFnQjtBQUFBLEVBQUs7QUFBQSxRQUMxQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsQ0FBSTtBQUVoQixzQkFBZ0IsTUFBTSx3QkFBd0I7QUFBQSxFQUFLO0FBQUEsUUFDbEQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUksQ0FBQztBQUFBLENBQUk7QUFBQSxJQUNqQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxjQUFjLE1BQU07QUFFekIsVUFBTSxjQUFjLE1BQU07QUFFekIsV0FBSyxjQUFjLE1BQU07QUFDeEIsY0FBTSxNQUFNLElBQUksZUFBZSxRQUFXLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUNyRSxZQUFJLFdBQVcsbUNBQW1DO0FBRWxELGVBQU8sWUFBWSxJQUFJLE9BQU8sZ0ZBQWdGO0FBQUEsTUFDL0csQ0FBQztBQUVELFdBQUssa0JBQWtCLE1BQU07QUFDNUIsY0FBTSxNQUFNLElBQUksZUFBZSxRQUFXLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUNyRSxZQUFJLGVBQWUsbUNBQW1DO0FBRXRELGVBQU8sWUFBWSxJQUFJLE9BQU8sbUNBQW1DO0FBQUEsTUFDbEUsQ0FBQztBQUVELFdBQUssb0NBQW9DLE1BQU07QUFDOUMsY0FBTSxNQUFNLElBQUksZUFBZSxRQUFXLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUNyRSxZQUFJLGVBQWUscUNBQXFDO0FBRXhELGVBQU8sWUFBWSxJQUFJLE9BQU8scUNBQXFDO0FBQUEsTUFDcEUsQ0FBQztBQUFBLElBRUYsQ0FBQztBQUVELFVBQU0sZUFBZSxNQUFNO0FBRTFCLFdBQUssY0FBYyxNQUFNO0FBQ3hCLGNBQU0sTUFBTSxJQUFJLGVBQWUsUUFBVyxFQUFFLG1CQUFtQixNQUFNLENBQUM7QUFDdEUsWUFBSSxXQUFXLG1DQUFtQztBQUVsRCxlQUFPLFlBQVksSUFBSSxPQUFPLHdFQUF3RTtBQUFBLE1BQ3ZHLENBQUM7QUFFRCxXQUFLLGtCQUFrQixNQUFNO0FBQzVCLGNBQU0sTUFBTSxJQUFJLGVBQWUsUUFBVyxFQUFFLG1CQUFtQixNQUFNLENBQUM7QUFDdEUsWUFBSSxlQUFlLG1DQUFtQztBQUV0RCxlQUFPLFlBQVksSUFBSSxPQUFPLG1DQUFtQztBQUFBLE1BQ2xFLENBQUM7QUFFRCxXQUFLLG9DQUFvQyxNQUFNO0FBQzlDLGNBQU0sTUFBTSxJQUFJLGVBQWUsUUFBVyxFQUFFLG1CQUFtQixLQUFLLENBQUM7QUFDckUsWUFBSSxlQUFlLHFDQUFxQztBQUV4RCxlQUFPLFlBQVksSUFBSSxPQUFPLHFDQUFxQztBQUFBLE1BQ3BFLENBQUM7QUFBQSxJQUVGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
