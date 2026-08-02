import assert from "assert";
import { appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel, escapeMarkdownSyntaxTokens } from "../../common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("htmlContent", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("appendEscapedMarkdownInlineCode", () => {
    test("wraps plain text in single backticks", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("hello"), "`hello`");
      assert.strictEqual(appendEscapedMarkdownInlineCode(""), "``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("foo bar"), "`foo bar`");
    });
    test("chooses a fence longer than any backtick run in the content", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("a`b"), "``a`b``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("a``b"), "```a``b```");
      assert.strictEqual(appendEscapedMarkdownInlineCode("a```b```c"), "````a```b```c````");
    });
    test("pads with spaces when the content begins or ends with a backtick", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("`"), "`` ` ``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("`hello"), "`` `hello ``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("hello`"), "`` hello` ``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("`a`b`"), "`` `a`b` ``");
    });
    test("does not pad when backticks are only in the interior", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("a`b"), "``a`b``");
    });
    test("handles content composed entirely of backticks", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("``"), "``` `` ```");
    });
  });
  suite("escapeMarkdownLinkLabel", () => {
    test("passes plain text through unchanged", () => {
      assert.strictEqual(escapeMarkdownLinkLabel("hello"), "hello");
      assert.strictEqual(escapeMarkdownLinkLabel(""), "");
      assert.strictEqual(escapeMarkdownLinkLabel("heap-snapshot-analysis"), "heap-snapshot-analysis");
      assert.strictEqual(escapeMarkdownLinkLabel("foo.bar_baz"), "foo.bar_baz");
    });
    test("escapes only `\\` and `]`", () => {
      assert.strictEqual(escapeMarkdownLinkLabel("a]b"), "a\\]b");
      assert.strictEqual(escapeMarkdownLinkLabel("a\\b"), "a\\\\b");
      assert.strictEqual(escapeMarkdownLinkLabel("]]"), "\\]\\]");
    });
    test("does not escape characters that are safe in link text", () => {
      assert.strictEqual(escapeMarkdownLinkLabel("a*b_c#d-e.f!g~h+i(j)k{l}m"), "a*b_c#d-e.f!g~h+i(j)k{l}m");
    });
  });
  suite("escapeMarkdownSyntaxTokens", () => {
    test("escapes inline syntax tokens anywhere", () => {
      assert.strictEqual(escapeMarkdownSyntaxTokens("a*b_c`d[e]f(g)h#i+j!k~l{m}"), "a\\*b\\_c\\`d\\[e\\]f\\(g\\)h\\#i\\+j\\!k\\~l\\{m\\}");
    });
    test("does not escape mid-line dashes", () => {
      assert.strictEqual(escapeMarkdownSyntaxTokens("heap-snapshot-analysis"), "heap-snapshot-analysis");
      assert.strictEqual(escapeMarkdownSyntaxTokens("npm run foo-bar"), "npm run foo-bar");
    });
    test("escapes dashes that start a line", () => {
      assert.strictEqual(escapeMarkdownSyntaxTokens("- item"), "\\- item");
      assert.strictEqual(escapeMarkdownSyntaxTokens("  - indented"), "  \\- indented");
      assert.strictEqual(escapeMarkdownSyntaxTokens("---"), "\\---");
      assert.strictEqual(escapeMarkdownSyntaxTokens("line one\n- item"), "line one\n\\- item");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vaHRtbENvbnRlbnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlLCBlc2NhcGVNYXJrZG93bkxpbmtMYWJlbCwgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMgfSBmcm9tICcuLi8uLi9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdodG1sQ29udGVudCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2FwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnd3JhcHMgcGxhaW4gdGV4dCBpbiBzaW5nbGUgYmFja3RpY2tzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2hlbGxvJyksICdgaGVsbG9gJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSgnJyksICdgYCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2ZvbyBiYXInKSwgJ2Bmb28gYmFyYCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2hvb3NlcyBhIGZlbmNlIGxvbmdlciB0aGFuIGFueSBiYWNrdGljayBydW4gaW4gdGhlIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSgnYWBiJyksICdgYGFgYmBgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSgnYWBgYicpLCAnYGBgYWBgYmBgYCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2FgYGBiYGBgYycpLCAnYGBgYGFgYGBiYGBgY2BgYGAnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhZHMgd2l0aCBzcGFjZXMgd2hlbiB0aGUgY29udGVudCBiZWdpbnMgb3IgZW5kcyB3aXRoIGEgYmFja3RpY2snLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSgnYCcpLCAnYGAgYCBgYCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2BoZWxsbycpLCAnYGAgYGhlbGxvIGBgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSgnaGVsbG9gJyksICdgYCBoZWxsb2AgYGAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKCdgYWBiYCcpLCAnYGAgYGFgYmAgYGAnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHBhZCB3aGVuIGJhY2t0aWNrcyBhcmUgb25seSBpbiB0aGUgaW50ZXJpb3InLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSgnYWBiJyksICdgYGFgYmBgJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGNvbnRlbnQgY29tcG9zZWQgZW50aXJlbHkgb2YgYmFja3RpY2tzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2BgJyksICdgYGAgYGAgYGBgJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlc2NhcGVNYXJrZG93bkxpbmtMYWJlbCcsICgpID0+IHtcblx0XHR0ZXN0KCdwYXNzZXMgcGxhaW4gdGV4dCB0aHJvdWdoIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93bkxpbmtMYWJlbCgnaGVsbG8nKSwgJ2hlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwoJycpLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwoJ2hlYXAtc25hcHNob3QtYW5hbHlzaXMnKSwgJ2hlYXAtc25hcHNob3QtYW5hbHlzaXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93bkxpbmtMYWJlbCgnZm9vLmJhcl9iYXonKSwgJ2Zvby5iYXJfYmF6Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlc2NhcGVzIG9ubHkgYFxcXFxgIGFuZCBgXWAnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwoJ2FdYicpLCAnYVxcXFxdYicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duTGlua0xhYmVsKCdhXFxcXGInKSwgJ2FcXFxcXFxcXGInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93bkxpbmtMYWJlbCgnXV0nKSwgJ1xcXFxdXFxcXF0nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGVzY2FwZSBjaGFyYWN0ZXJzIHRoYXQgYXJlIHNhZmUgaW4gbGluayB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Ly8gdGhlc2Ugd291bGQgYmUgZXNjYXBlZCBieSBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyBidXQgbXVzdFxuXHRcdFx0Ly8gcGFzcyB0aHJvdWdoIGhlcmUgc2luY2UgdGhleSByZW5kZXIgbGl0ZXJhbGx5IGluc2lkZSBgWy4uLl1gLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duTGlua0xhYmVsKCdhKmJfYyNkLWUuZiFnfmgraShqKWt7bH1tJyksICdhKmJfYyNkLWUuZiFnfmgraShqKWt7bH1tJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlc2NhcGVNYXJrZG93blN5bnRheFRva2VucycsICgpID0+IHtcblx0XHR0ZXN0KCdlc2NhcGVzIGlubGluZSBzeW50YXggdG9rZW5zIGFueXdoZXJlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKCdhKmJfY2BkW2VdZihnKWgjaStqIWt+bHttfScpLCAnYVxcXFwqYlxcXFxfY1xcXFxgZFxcXFxbZVxcXFxdZlxcXFwoZ1xcXFwpaFxcXFwjaVxcXFwralxcXFwha1xcXFx+bFxcXFx7bVxcXFx9Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBlc2NhcGUgbWlkLWxpbmUgZGFzaGVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKCdoZWFwLXNuYXBzaG90LWFuYWx5c2lzJyksICdoZWFwLXNuYXBzaG90LWFuYWx5c2lzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMoJ25wbSBydW4gZm9vLWJhcicpLCAnbnBtIHJ1biBmb28tYmFyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlc2NhcGVzIGRhc2hlcyB0aGF0IHN0YXJ0IGEgbGluZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93blN5bnRheFRva2VucygnLSBpdGVtJyksICdcXFxcLSBpdGVtJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMoJyAgLSBpbmRlbnRlZCcpLCAnICBcXFxcLSBpbmRlbnRlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKCctLS0nKSwgJ1xcXFwtLS0nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93blN5bnRheFRva2VucygnbGluZSBvbmVcXG4tIGl0ZW0nKSwgJ2xpbmUgb25lXFxuXFxcXC0gaXRlbScpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUNBQWlDLHlCQUF5QixrQ0FBa0M7QUFDckcsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxlQUFlLE1BQU07QUFDMUIsMENBQXdDO0FBRXhDLFFBQU0sbUNBQW1DLE1BQU07QUFDOUMsU0FBSyx3Q0FBd0MsTUFBTTtB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
